using System.Buffers.Binary;
using System.IO.Compression;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;

if (args.Length < 2)
{
    Console.Error.WriteLine("usage: Packer <output> <group>=<directory>[@<prefix>] ...");
    return 2;
}

var alreadyCompressed = new HashSet<string>(StringComparer.OrdinalIgnoreCase) { ".png", ".jpg", ".ogg", ".mp3", ".unity3d", ".masterbundle" };
var outputPath = args[0];
Directory.CreateDirectory(Path.GetDirectoryName(Path.GetFullPath(outputPath))!);

var entries = new List<object>();
var seen = new HashSet<string>();
long rawTotal = 0;

using (var output = new FileStream(outputPath, FileMode.Create, FileAccess.ReadWrite))
{
    output.Write(new byte[64]);

    foreach (var spec in args.Skip(1).OrderBy(spec => spec[..spec.IndexOf('=')], StringComparer.Ordinal))
    {
        var eq = spec.IndexOf('=');
        var at = spec.IndexOf('@', eq);
        var group = spec[..eq];
        var directory = Path.GetFullPath(at < 0 ? spec[(eq + 1)..] : spec[(eq + 1)..at]);
        var prefix = at < 0 ? "" : spec[(at + 1)..].TrimEnd('/') + "/";

        foreach (var file in Directory.EnumerateFiles(directory, "*", SearchOption.AllDirectories).Order(StringComparer.Ordinal))
        {
            var path = prefix + Path.GetRelativePath(directory, file).Replace('\\', '/');
            if (!seen.Add(path))
                throw new InvalidDataException($"duplicate package path {path}");

            var data = File.ReadAllBytes(file);
            var store = data.Length == 0 || alreadyCompressed.Contains(Path.GetExtension(file));
            var offset = output.Position;
            if (store)
            {
                output.Write(data);
            }
            else
            {
                using var deflate = new DeflateStream(output, CompressionLevel.Optimal, leaveOpen: true);
                deflate.Write(data);
            }

            entries.Add(new
            {
                path,
                group,
                offset,
                stored = output.Position - offset,
                size = data.Length,
                method = store ? "store" : "deflate",
                sha256 = Convert.ToHexStringLower(SHA256.HashData(data))
            });
            rawTotal += data.Length;
        }
    }

    var manifestOffset = output.Position;
    var manifestJson = JsonSerializer.SerializeToUtf8Bytes(new { build = DateTime.UtcNow.ToString("yyyy-MM-ddTHH:mm:ssZ"), entries });
    using (var deflate = new DeflateStream(output, CompressionLevel.Optimal, leaveOpen: true))
        deflate.Write(manifestJson);
    var manifestLength = output.Position - manifestOffset;

    var manifestBytes = new byte[manifestLength];
    output.Position = manifestOffset;
    output.ReadExactly(manifestBytes);

    var header = new byte[64];
    Encoding.ASCII.GetBytes("UNTURNED").CopyTo(header, 0);
    BinaryPrimitives.WriteUInt32LittleEndian(header.AsSpan(8), 1);
    BinaryPrimitives.WriteInt64LittleEndian(header.AsSpan(16), manifestOffset);
    BinaryPrimitives.WriteInt64LittleEndian(header.AsSpan(24), manifestLength);
    SHA256.HashData(manifestBytes).CopyTo(header, 32);
    output.Position = 0;
    output.Write(header);

    Console.WriteLine($"{outputPath}: {entries.Count} entries, {rawTotal} bytes raw, {output.Length} bytes packed");
}

return 0;
