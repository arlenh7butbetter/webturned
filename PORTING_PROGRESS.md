# Porting Progress

Last updated 2026-10-30. Everything under "Verified" was run and checked. **The original game is not playable in a browser yet.** It runs as far as its loading screen, then stops because its main asset bundle can't load.

## What each build is

| Output | Command | What it is |
|---|---|---|
| `dist/` | `build.ps1 build` | Vertical slice: new code that loads, renders and walks on real PEI terrain |
| `build/game-dist/` | `build.ps1 game` | The original game code, stopping at the loading screen |

`dist/` deliberately holds the slice until the original game does more than the slice can.

## Verified

| What | How it was checked |
|---|---|
| Extraction of source and assets | SHA-256 of every file, see `EXTRACTION_REPORT.md` |
| Headless Unity 6000.6.7f1 WebGL builds | `build.ps1 build` and `build.ps1 game` exit 0 |
| `dist/` holds exactly `index.html`, `runtime.js`, `game.unturned` | Directory listing |
| Package format: round trip, range preload, compression, rejection of bad data | `tests/package.test.mjs`, 8 of 8 pass |
| Slice: real heightmaps, splatmaps, spawn points and textures | `tests/browser.mjs`, plus screenshots. Terrain height at the first spawn equals the spawn's stored Y, 34.35 |
| Slice: terrain collision and walking with W | Player moves about 22 m uphill and stays grounded |
| All original source compiles for the WebGL player | `build.ps1 compile`: 0 errors, `src/` unchanged |
| Full original game links as a WebGL player | Unity build result `Succeeded`, 50 MB `.wasm` before stripping changes |
| Original startup code runs in headless Chrome | Game log: version 3.26.3.13, platform `WebGLPlayer`, no exceptions through startup |
| Original UI, fonts, localization and loading screens render | Screenshots in `build/logs` from the game's own `LoadingUI` |
| Original asset search parses the real data | Loading bar shows 6,114 asset definitions found |
| `core.masterbundle` converts from LZMA to LZ4 | Converter output 214 MB. The player then gets past decompression |

## Current failure

```
The file can not be loaded because it was created for another build target
File's Build target is: 19
```

`core.masterbundle` is built for 64-bit Windows, so the WebGL player refuses it. Everything the game loads from it, including items, models and terrain textures, depends on this.

## Implemented but not verified

- **Mouse look in the slice.** The browser pane rejects pointer lock with `WrongDocumentError`, and clicking the canvas hangs headless Chrome. Check it in a normal Chrome window.
- **Real GPU performance.** All game runs used software rendering. Frame rates and memory on real hardware are unmeasured.
- **Main-thread asset loading on real hardware.** It blocked the page for about 2 s in testing, and the browser may flag it on slower machines.
- **`BundleTool` patch.** This editor menu tool compiles against the new API but has not been run.
- **Foliage worker thread.** `FoliageStorageV2` still starts a `Thread`, which is expected to fail once a map loads.

## Known differences from the original

- **Steam is simulated offline.** `SteamCore.jslib` implements 55 of 958 native functions. The rest log `[steam] not implemented: <name>` and return zero. Steam callbacks never fire, so anything waiting on one won't finish.
- **Online features don't work.** Live config and matchmaking filter requests fail in the browser, and the game logs and retries them. Workshop, inventory and multiplayer are unavailable.
- **Plugin modules are unsupported.** `Assembly.Load` can't work under IL2CPP.
- **The browser reports itself as `EClientPlatform.Windows`**, because a new value would change the network protocol.
- **Slice only:** it uses `Nature/Terrain/Standard`, not the original landscape shader, has fixed lighting, and has no objects, trees, water, zombies or UI. A thin seam shows at tile edges.

## Blockers that need you

1. **Push requires your login.** The credential helper can't prompt here, so commits are local only. Run `git push origin main` yourself.
2. **The repo is public**, though you described it as closed. `src/` and `assets/` are kept out of Git for this reason. Make the repo private before removing them from `.gitignore`.
3. **The license question is open again.** Your "private project" answer assumed a closed repo. See `EXTRACTION_REPORT.md`. A build that phones can reach may conflict with sections 1 and 2 of the SDK license.

## Decisions

- **Unity WebGL/IL2CPP** over standalone .NET WebAssembly. See `docs/ARCHITECTURE.md`.
- **Unity 6000.6.7f1**, because 2022.3.62f3 has no WebGL module installed. API changes live in `engine/patches.json`.
- **`src/` and `assets/` are never edited.** The build composes a project in `build/full`, then applies the API updater, `engine/overlay` and `engine/patches.json` to that copy.
- **Patch rules, not copied files**, so SDG's source stays out of the public repo. A rule that stops matching fails the build.
- **Steam replaced at the native API level.** The game calls Steam directly in 47 files, so this avoids editing them.
- **`Newtonsoft.Json` replaced** by Unity's IL2CPP-compatible package, because the SDK's DLL needs `Reflection.Emit`.
- **Engine and managed stripping reduced**, because bundles and Json.NET reference types the build can't see.
- **Worker thread pool jobs run directly on the main thread.** They finish on their own, and WebGL has no threads.
- **Prefab and material caches key on `EntityId`.** Unity rejects converting it to `int`, and a hash could make different prefabs share a key.

## Next steps

1. Make `core.masterbundle` load for WebGL. Start by testing a converted copy with its target changed, to learn what fails next. Direct3D shaders are expected to render incorrectly until replaced.
2. Replace bundle shaders with WebGL versions built from the 70 shaders in `assets/U3-SDK`.
3. Apply the same conversion to the map bundles, which are probably LZMA too.
4. Reach the main menu, then replace the foliage thread.
5. Load singleplayer on PEI, then implement the Steam functions it needs.
6. After singleplayer works, add the WebRTC transport.
