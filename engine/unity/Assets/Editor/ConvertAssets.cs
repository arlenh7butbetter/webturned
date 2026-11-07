using System;
using System.Collections.Generic;
using System.IO;
using System.Text;
using System.Text.RegularExpressions;
using UnityEditor;
using UnityEngine;

public static class ConvertAssets
{
    const string BundlePrefix = "Assets/CoreMasterBundle/";
    const string AudioAssets = "Assets/ConvertedAudio";
    const string AudioBundleName = "audio.bundle";
    const string AudioManifestName = "audio.txt";

    public static void Run()
    {
        var assets = Environment.GetEnvironmentVariable("UNTURNED_ASSETS");
        var output = Environment.GetEnvironmentVariable("UNTURNED_CONVERTED");
        var maps = Environment.GetEnvironmentVariable("UNTURNED_MAPS").Split(';');

        var textures = ReadMaterialTextures(Path.Combine(assets, "Bundles/Assets/Landscapes/Materials"));
        var bundle = AssetBundle.LoadFromFile(Path.Combine(assets, "Bundles/core.masterbundle"));
        if (bundle == null)
            throw new InvalidOperationException("core.masterbundle could not be loaded");

        foreach (var map in maps)
        {
            var directory = Path.Combine(output, "Maps", map);
            Directory.CreateDirectory(directory);
            if (!Directory.Exists(Path.Combine(assets, "Maps", map, "Landscape")))
                continue;
            var manifest = new StringBuilder();
            foreach (var (tile, guids) in ReadTiles(Path.Combine(assets, "Maps", map, "Level.hierarchy")))
            {
                manifest.Append(tile);
                foreach (var guid in guids)
                {
                    manifest.Append('\t');
                    if (guid == "00000000000000000000000000000000")
                        continue;
                    if (!textures.TryGetValue(guid, out var path))
                        throw new InvalidDataException($"{map} tile {tile} uses unknown material {guid}");
                    Export(bundle, path, Path.Combine(output, "Textures"));
                    manifest.Append(path);
                }
                manifest.Append('\n');
            }
            File.WriteAllText(Path.Combine(directory, "TerrainLayers.txt"), manifest.ToString());
        }

        bundle.Unload(true);

        foreach (var map in maps)
        {
            var mapRoot = Path.Combine(assets, "Maps", map);
            foreach (var file in Directory.EnumerateFiles(mapRoot, "*.unity3d", SearchOption.AllDirectories))
            {
                var target = Path.Combine(output, "MapBundles", map, Path.GetRelativePath(mapRoot, file));
                if (Path.GetFileName(file) == "Ambience.unity3d")
                    ConvertAmbience(file, target);
                else
                    ConvertBundle(file, target);
            }
        }

        ConvertCoreBundle(Path.Combine(assets, "Bundles/core.masterbundle"), Path.Combine(output, "Bundles/core.masterbundle"), Path.Combine(output, "Audio"));
    }

    static void ConvertAmbience(string input, string target)
    {
        if (File.Exists(target) && File.GetLastWriteTimeUtc(target) >= File.GetLastWriteTimeUtc(input))
            return;

        Directory.CreateDirectory(Path.GetDirectoryName(target));
        var raw = target + ".raw";
        var decodable = target + ".decodable";
        Recompress(input, raw, BuildCompression.Uncompressed);
        RunNode(Environment.GetEnvironmentVariable("UNTURNED_BUNDLE_TOOL"), "--decodable", raw, decodable);
        var bundle = AssetBundle.LoadFromFile(decodable);
        if (bundle == null)
            throw new InvalidOperationException($"{decodable} could not be loaded");

        Directory.CreateDirectory(AudioAssets);
        var assets = new List<string>();
        var names = new List<string>();
        foreach (var asset in bundle.LoadAllAssets())
        {
            if (!(asset is AudioClip clip))
                throw new InvalidDataException($"{input} has a {asset.GetType().Name} named {asset.name}, expected only audio");

            var path = $"{AudioAssets}/{clip.name}.wav";
            WriteWav(path, ReadSamples(clip), clip.channels, clip.frequency);
            assets.Add(path);
            names.Add(clip.name);
        }
        bundle.Unload(true);
        File.Delete(raw);
        File.Delete(decodable);

        AssetDatabase.Refresh(ImportAssetOptions.ForceSynchronousImport);
        var directory = Path.GetFullPath(Path.Combine("Temp", "AmbienceBuild"));
        Directory.CreateDirectory(directory);
        var build = new AssetBundleBuild { assetBundleName = "ambience.bundle", assetNames = assets.ToArray(), addressableNames = names.ToArray() };
        if (BuildPipeline.BuildAssetBundles(directory, new[] { build }, BuildAssetBundleOptions.UncompressedAssetBundle, BuildTarget.WebGL) == null)
            throw new InvalidDataException($"Building {input} for WebGL failed");
        AssetDatabase.DeleteAsset(AudioAssets);

        Recompress(Path.Combine(directory, "ambience.bundle"), target, BuildCompression.LZ4Runtime);
        Directory.Delete(directory, true);
        Debug.Log($"[convert] {input}: rebuilt {names.Count} clips ({string.Join(", ", names)}), {new FileInfo(input).Length} to {new FileInfo(target).Length} bytes");
    }

    static float[] ReadSamples(AudioClip clip)
    {
        clip.LoadAudioData();
        var deadline = DateTime.UtcNow.AddSeconds(30);
        while (clip.loadState == AudioDataLoadState.Loading)
        {
            if (DateTime.UtcNow > deadline)
                throw new InvalidDataException($"Audio clip {clip.name} did not finish loading");
            System.Threading.Thread.Sleep(5);
        }
        var data = new float[clip.samples * clip.channels];
        if (clip.loadState != AudioDataLoadState.Loaded || !clip.GetData(data, 0))
            throw new InvalidDataException($"Audio clip {clip.name} could not be decoded");
        return data;
    }

    static void ConvertCoreBundle(string input, string target, string audioDirectory)
    {
        if (File.Exists(target) && File.GetLastWriteTimeUtc(target) >= File.GetLastWriteTimeUtc(input))
            return;

        Directory.CreateDirectory(Path.GetDirectoryName(target));
        var tool = Environment.GetEnvironmentVariable("UNTURNED_BUNDLE_TOOL");
        var raw = target + ".raw";
        var decodable = target + ".decodable";
        var rewritten = target + ".webgl";
        Recompress(input, raw, BuildCompression.Uncompressed);
        RunNode(tool, "--decodable", raw, decodable);
        EncodeAudio(decodable, audioDirectory);
        File.Delete(decodable);
        RunNode(tool, raw, rewritten, Path.Combine(audioDirectory, AudioBundleName), Path.Combine(audioDirectory, AudioManifestName));
        Recompress(rewritten, target, BuildCompression.LZ4Runtime);
        File.Delete(raw);
        File.Delete(rewritten);
        Debug.Log($"[convert] {input}: {new FileInfo(input).Length} to {new FileInfo(target).Length} bytes");
    }

    static void EncodeAudio(string bundlePath, string directory)
    {
        var manifestPath = Path.Combine(directory, AudioManifestName);
        if (File.Exists(manifestPath) && File.Exists(Path.Combine(directory, AudioBundleName)))
            return;

        Directory.CreateDirectory(directory);
        Directory.CreateDirectory(AudioAssets);
        var bundle = AssetBundle.LoadFromFile(bundlePath);
        if (bundle == null)
            throw new InvalidOperationException($"{bundlePath} could not be loaded");

        var manifest = new StringBuilder();
        var names = new List<string>();
        var seen = new HashSet<string>();
        bundle.LoadAllAssets();
        foreach (var clip in Resources.FindObjectsOfTypeAll<AudioClip>())
        {
            var key = FormattableString.Invariant($"{clip.name}\t{clip.channels}\t{clip.frequency}\t{clip.length:F3}");
            if (!seen.Add(key))
                continue;

            var data = ReadSamples(clip);
            var id = $"a{names.Count}";
            var asset = $"{AudioAssets}/{id}.wav";
            WriteWav(asset, data, clip.channels, clip.frequency);
            manifest.Append(id).Append('\t').Append(key).Append('\n');
            names.Add(asset);
            clip.UnloadAudioData();
        }
        bundle.Unload(true);

        AssetDatabase.Refresh(ImportAssetOptions.ForceSynchronousImport);
        var build = new AssetBundleBuild { assetBundleName = AudioBundleName, assetNames = names.ToArray() };
        if (BuildPipeline.BuildAssetBundles(directory, new[] { build }, BuildAssetBundleOptions.UncompressedAssetBundle, BuildTarget.WebGL) == null)
            throw new InvalidDataException("Encoding audio for WebGL failed");
        AssetDatabase.DeleteAsset(AudioAssets);

        File.WriteAllText(manifestPath, manifest.ToString());
        Debug.Log($"[convert] encoded {names.Count} audio clips, {new FileInfo(Path.Combine(directory, AudioBundleName)).Length} bytes");
    }

    static void WriteWav(string path, float[] samples, int channels, int frequency)
    {
        using var wav = new BinaryWriter(File.Create(path));
        var dataSize = samples.Length * 2;
        wav.Write(Encoding.ASCII.GetBytes("RIFF"));
        wav.Write(36 + dataSize);
        wav.Write(Encoding.ASCII.GetBytes("WAVEfmt "));
        wav.Write(16);
        wav.Write((short)1);
        wav.Write((short)channels);
        wav.Write(frequency);
        wav.Write(frequency * channels * 2);
        wav.Write((short)(channels * 2));
        wav.Write((short)16);
        wav.Write(Encoding.ASCII.GetBytes("data"));
        wav.Write(dataSize);
        foreach (var sample in samples)
            wav.Write((short)(Mathf.Clamp(sample, -1, 1) * short.MaxValue));
    }

    static void ConvertBundle(string input, string target)
    {
        if (File.Exists(target) && File.GetLastWriteTimeUtc(target) >= File.GetLastWriteTimeUtc(input))
            return;

        Directory.CreateDirectory(Path.GetDirectoryName(target));
        var raw = target + ".raw";
        var rewritten = target + ".webgl";
        Recompress(input, raw, BuildCompression.Uncompressed);
        RunNode(Environment.GetEnvironmentVariable("UNTURNED_BUNDLE_TOOL"), raw, rewritten);
        Recompress(rewritten, target, BuildCompression.LZ4Runtime);
        File.Delete(raw);
        File.Delete(rewritten);
        Debug.Log($"[convert] {input}: {new FileInfo(input).Length} to {new FileInfo(target).Length} bytes");
    }

    static void RunNode(params string[] arguments)
    {
        var start = new System.Diagnostics.ProcessStartInfo("node") { UseShellExecute = false, RedirectStandardOutput = true, RedirectStandardError = true };
        foreach (var argument in arguments)
            start.ArgumentList.Add(argument);
        using var process = System.Diagnostics.Process.Start(start);
        var error = process.StandardError.ReadToEndAsync();
        Debug.Log($"[convert] {process.StandardOutput.ReadToEnd()}");
        process.WaitForExit();
        if (process.ExitCode != 0)
            throw new InvalidDataException($"node {string.Join(" ", arguments)} failed: {error.Result}");
    }

    static void Recompress(string input, string target, BuildCompression compression)
    {
        var request = AssetBundle.RecompressAssetBundleAsync(input, target, compression);
        while (!request.isDone)
            System.Threading.Thread.Sleep(50);
        if (!request.success)
            throw new InvalidDataException($"Recompressing {input} failed: {request.result} {request.humanReadableResult}");
    }

    static Dictionary<string, string> ReadMaterialTextures(string directory)
    {
        var textures = new Dictionary<string, string>();
        foreach (var file in Directory.EnumerateFiles(directory, "*.asset", SearchOption.AllDirectories))
        {
            var text = File.ReadAllText(file);
            var guid = Regex.Match(text, @"GUID (\w{32})");
            var path = Regex.Match(text, @"Texture\s*\{\s*Name core\.masterbundle\s*Path ([^\r\n]+)");
            if (guid.Success && path.Success)
                textures[guid.Groups[1].Value] = path.Groups[1].Value.Trim();
        }
        return textures;
    }

    static IEnumerable<(string tile, List<string> guids)> ReadTiles(string hierarchy)
    {
        var text = File.ReadAllText(hierarchy);
        var start = text.IndexOf("SDG.Framework.Landscapes.Landscape,", StringComparison.Ordinal);
        if (start < 0)
            throw new InvalidDataException($"{hierarchy} has no landscape");
        foreach (Match tile in Regex.Matches(text.Substring(start), "\"Coord\"\\s*\\{\\s*\"X\"\\s*\"(-?\\d+)\"\\s*\"Y\"\\s*\"(-?\\d+)\"\\s*\\}\\s*\"Materials\"\\s*\\[(.*?)\\]", RegexOptions.Singleline))
        {
            var guids = new List<string>();
            foreach (Match guid in Regex.Matches(tile.Groups[3].Value, "\"GUID\"\\s*\"(\\w{32})\""))
                guids.Add(guid.Groups[1].Value);
            yield return ($"{tile.Groups[1].Value},{tile.Groups[2].Value}", guids);
        }
    }

    static void Export(AssetBundle bundle, string path, string output)
    {
        var target = Path.Combine(output, path);
        if (File.Exists(target))
            return;

        var source = bundle.LoadAsset<Texture2D>(BundlePrefix + path);
        if (source == null)
            throw new InvalidDataException($"core.masterbundle has no texture {path}");

        var previous = RenderTexture.active;
        var buffer = RenderTexture.GetTemporary(source.width, source.height, 0, RenderTextureFormat.ARGB32, RenderTextureReadWrite.sRGB);
        Graphics.Blit(source, buffer);
        RenderTexture.active = buffer;
        var readable = new Texture2D(source.width, source.height, TextureFormat.RGBA32, false);
        readable.ReadPixels(new Rect(0, 0, source.width, source.height), 0, 0);
        readable.Apply();
        RenderTexture.active = previous;
        RenderTexture.ReleaseTemporary(buffer);

        Directory.CreateDirectory(Path.GetDirectoryName(target));
        File.WriteAllBytes(target, readable.EncodeToPNG());
        Debug.Log($"[convert] {path} {source.width}x{source.height} {source.format}");
        UnityEngine.Object.DestroyImmediate(readable);
    }
}
