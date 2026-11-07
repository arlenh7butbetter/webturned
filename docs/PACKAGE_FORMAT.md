# `.unturned` package format, version 1

A `.unturned` file holds the browser player and the game data as independently compressed entries, so a loader can fetch one entry with an HTTP range request and decompress it without touching the others. All integers are little-endian.

## Layout

| Offset | Size | Field |
|---:|---:|---|
| 0 | 8 | Magic: ASCII `UNTURNED` |
| 8 | 4 | Format version (`1`) |
| 12 | 4 | Flags (reserved, `0`) |
| 16 | 8 | Manifest offset |
| 24 | 8 | Manifest compressed length |
| 32 | 32 | SHA-256 of the compressed manifest bytes |
| 64 | ... | Entry data |
| manifest offset | ... | Manifest |

The header is 64 bytes. Entries sit between the header and the manifest in manifest order.

## Manifest

UTF-8 JSON, compressed with raw DEFLATE:

```json
{
  "build": "2026-10-30T18:00:00Z",
  "entries": [
    {
      "path": "player/framework.js",
      "group": "player",
      "offset": 64,
      "stored": 1234,
      "size": 5678,
      "method": "deflate",
      "sha256": "<hex digest of the decompressed bytes>"
    }
  ]
}
```

| Field | Meaning |
|---|---|
| `path` | Forward-slash path, unique, case-sensitive, no `..` segments |
| `group` | Load unit: `player`, `game`, or `map/<name>` |
| `offset`, `stored` | Byte range of the entry in the file |
| `size` | Decompressed length |
| `method` | `deflate` (raw DEFLATE) or `store` |
| `sha256` | Digest of the decompressed bytes |

All entries of a group are stored next to each other, so a reader can fetch a whole group with one range request.

## Reader requirements

A reader must reject a file when any of these fail:

- The magic or format version doesn't match.
- The manifest digest doesn't match.
- An entry's decompressed length or digest doesn't match.
- A path is absolute, contains a backslash, or has a `..` segment.

## Compatibility

Any change that an older reader would misread increments the format version. A reader rejects versions it doesn't know.
