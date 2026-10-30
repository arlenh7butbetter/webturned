using System;
using System.Collections.Generic;
using System.Globalization;
using System.IO;
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
        var material = new Material(Shader.Find("Nature/Terrain/Standard"));
        var layerCache = new Dictionary<string, TerrainLayer>();

        var tiles = 0;
        foreach (var line in File.ReadAllLines(mapPath + "/Converted/TerrainLayers.txt"))
        {
            var fields = line.Split('\t');
            var coord = fields[0].Split(',');
            var layers = new TerrainLayer[fields.Length - 1];
            for (var i = 0; i < layers.Length; i++)
                layers[i] = LoadLayer(fields[i + 1], layerCache);
            CreateTile(mapPath, int.Parse(coord[0], CultureInfo.InvariantCulture), int.Parse(coord[1], CultureInfo.InvariantCulture), layers, material);
            tiles++;
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

    static TerrainLayer LoadLayer(string path, Dictionary<string, TerrainLayer> cache)
    {
        if (cache.TryGetValue(path, out var layer))
            return layer;

        var texture = new Texture2D(2, 2, TextureFormat.RGBA32, true);
        texture.LoadImage(File.ReadAllBytes("/game/Textures/" + path));
        var pixels = texture.GetPixels32();
        for (var i = 0; i < pixels.Length; i++)
            pixels[i].a = 0;
        texture.SetPixels32(pixels);
        texture.Apply(true);

        layer = new TerrainLayer { diffuseTexture = texture, tileSize = new Vector2(texture.width * 0.25f, texture.height * 0.25f) };
        cache[path] = layer;
        return layer;
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
