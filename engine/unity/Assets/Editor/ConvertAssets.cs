using System;
using System.Collections.Generic;
using System.IO;
using System.Text;
using System.Text.RegularExpressions;
using UnityEngine;

public static class ConvertAssets
{
    const string BundlePrefix = "Assets/CoreMasterBundle/";

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
            var manifest = new StringBuilder();
            foreach (var (tile, guids) in ReadTiles(Path.Combine(assets, "Maps", map, "Level.hierarchy")))
            {
                manifest.Append(tile);
                foreach (var guid in guids)
                {
                    if (!textures.TryGetValue(guid, out var path))
                        throw new InvalidDataException($"{map} tile {tile} uses unknown material {guid}");
                    Export(bundle, path, Path.Combine(output, "Textures"));
                    manifest.Append('\t').Append(path);
                }
                manifest.Append('\n');
            }
            File.WriteAllText(Path.Combine(directory, "TerrainLayers.txt"), manifest.ToString());
        }

        bundle.Unload(true);
        Recompress(Path.Combine(assets, "Bundles/core.masterbundle"), Path.Combine(output, "Bundles/core.masterbundle"));
    }

    static void Recompress(string input, string target)
    {
        if (File.Exists(target) && File.GetLastWriteTimeUtc(target) >= File.GetLastWriteTimeUtc(input))
            return;

        Directory.CreateDirectory(Path.GetDirectoryName(target));
        var request = AssetBundle.RecompressAssetBundleAsync(input, target, BuildCompression.LZ4Runtime);
        while (!request.isDone)
            System.Threading.Thread.Sleep(50);
        if (!request.success)
            throw new InvalidDataException($"Recompressing {input} failed: {request.result} {request.humanReadableResult}");
        Debug.Log($"[convert] recompressed {input}: {new FileInfo(input).Length} to {new FileInfo(target).Length} bytes");
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
