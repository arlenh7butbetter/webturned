using System;
using System.Globalization;
using System.IO;
using System.Text.RegularExpressions;
using UnityEngine;

public static class MapSlice
{
    const float TileSize = 1024;
    const float TileHeight = 2048;
    const int HeightmapResolution = 257;
    const int SplatmapResolution = 256;
    const int SplatmapLayers = 8;

    [RuntimeInitializeOnLoadMethod(RuntimeInitializeLoadType.AfterSceneLoad)]
    static void Load()
    {
        var mapPath = Directory.GetDirectories("/game/Maps")[0];
        var layers = CreateLayers();
        var material = new Material(Shader.Find("Nature/Terrain/Standard"));

        var tiles = 0;
        foreach (var file in Directory.GetFiles(mapPath + "/Landscape/Heightmaps", "*.heightmap"))
        {
            var match = Regex.Match(Path.GetFileName(file), @"^Tile_(-?\d+)_(-?\d+)_Source\.heightmap$");
            if (match.Success)
            {
                CreateTile(mapPath, int.Parse(match.Groups[1].Value, CultureInfo.InvariantCulture), int.Parse(match.Groups[2].Value, CultureInfo.InvariantCulture), layers, material);
                tiles++;
            }
        }

        Physics.SyncTransforms();

        var sun = new GameObject("Sun").AddComponent<Light>();
        sun.type = LightType.Directional;
        sun.transform.rotation = Quaternion.Euler(50, -30, 0);
        sun.shadows = LightShadows.Soft;

        RenderSettings.ambientMode = UnityEngine.Rendering.AmbientMode.Flat;
        RenderSettings.ambientLight = new Color(0.45f, 0.48f, 0.55f);

        var spawn = ReadFirstSpawn(mapPath + "/Spawns/Players.dat");
        var player = new GameObject("Player").AddComponent<SlicePlayer>();
        player.transform.position = spawn + Vector3.up * 2;

        Debug.Log(FormattableString.Invariant($"[slice] map={Path.GetFileName(mapPath)} tiles={tiles} spawn={spawn.x:F2},{spawn.y:F2},{spawn.z:F2} ground={Ground(spawn):F2}"));
    }

    static float Ground(Vector3 position)
    {
        return Physics.Raycast(position + Vector3.up * 1024, Vector3.down, out var hit, 4096) ? hit.point.y : float.NaN;
    }

    static TerrainLayer[] CreateLayers()
    {
        var colors = new[]
        {
            new Color(0.33f, 0.42f, 0.21f), new Color(0.40f, 0.34f, 0.24f), new Color(0.46f, 0.45f, 0.42f), new Color(0.55f, 0.50f, 0.36f),
            new Color(0.30f, 0.36f, 0.22f), new Color(0.27f, 0.23f, 0.18f), new Color(0.80f, 0.82f, 0.85f), new Color(0.36f, 0.36f, 0.36f)
        };
        var layers = new TerrainLayer[SplatmapLayers];
        for (var i = 0; i < layers.Length; i++)
        {
            var texture = new Texture2D(1, 1, TextureFormat.RGBA32, false);
            texture.SetPixel(0, 0, colors[i]);
            texture.Apply();
            layers[i] = new TerrainLayer { diffuseTexture = texture, tileSize = new Vector2(16, 16) };
        }
        return layers;
    }

    static void CreateTile(string mapPath, int x, int y, TerrainLayer[] layers, Material material)
    {
        var name = FormattableString.Invariant($"Tile_{x}_{y}_Source");
        var data = new TerrainData
        {
            heightmapResolution = HeightmapResolution,
            alphamapResolution = SplatmapResolution,
            size = new Vector3(TileSize, TileHeight, TileSize),
            terrainLayers = layers
        };
        data.SetHeights(0, 0, ReadHeightmap($"{mapPath}/Landscape/Heightmaps/{name}.heightmap"));
        data.SetAlphamaps(0, 0, ReadSplatmap($"{mapPath}/Landscape/Splatmaps/{name}.splatmap"));

        var tile = new GameObject(name);
        tile.transform.position = new Vector3(x * TileSize, -TileHeight / 2, y * TileSize);
        var terrain = tile.AddComponent<Terrain>();
        terrain.drawInstanced = SystemInfo.supportsInstancing;
        terrain.terrainData = data;
        terrain.materialTemplate = material;
        terrain.heightmapPixelError = 200;
        terrain.reflectionProbeUsage = UnityEngine.Rendering.ReflectionProbeUsage.Off;
        terrain.shadowCastingMode = UnityEngine.Rendering.ShadowCastingMode.Off;
        terrain.drawTreesAndFoliage = false;
        terrain.allowAutoConnect = false;
        tile.AddComponent<TerrainCollider>().terrainData = data;
    }

    static float[,] ReadHeightmap(string path)
    {
        var bytes = File.ReadAllBytes(path);
        var heights = new float[HeightmapResolution, HeightmapResolution];
        var i = 0;
        for (var x = 0; x < HeightmapResolution; x++)
        {
            for (var y = 0; y < HeightmapResolution; y++)
            {
                heights[x, y] = ((bytes[i] << 8) | bytes[i + 1]) / (float)ushort.MaxValue;
                i += 2;
            }
        }
        return heights;
    }

    static float[,,] ReadSplatmap(string path)
    {
        var bytes = File.ReadAllBytes(path);
        var splat = new float[SplatmapResolution, SplatmapResolution, SplatmapLayers];
        var i = 0;
        for (var x = 0; x < SplatmapResolution; x++)
        {
            for (var y = 0; y < SplatmapResolution; y++)
            {
                for (var layer = 0; layer < SplatmapLayers; layer++)
                    splat[x, y, layer] = bytes[i++] / (float)byte.MaxValue;
            }
        }
        return splat;
    }

    static Vector3 ReadFirstSpawn(string path)
    {
        using var reader = new BinaryReader(File.OpenRead(path));
        var version = reader.ReadByte();
        if (version == 2)
            reader.ReadUInt64();
        if (reader.ReadByte() == 0)
            return new Vector3(0, 256, 0);
        return new Vector3(reader.ReadSingle(), reader.ReadSingle(), reader.ReadSingle());
    }
}
