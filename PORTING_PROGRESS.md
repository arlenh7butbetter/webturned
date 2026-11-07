# Porting Progress

Last updated 2026-11-07. Everything under "Verified" was run and checked in headless Chrome, either with software rendering or on the real GPU (RTX 4060 Laptop through ANGLE/D3D11) as stated. **All 10 official maps load in the browser and the core survival loop works. It isn't complete.**

## Verified

| What | How it was checked |
|---|---|
| Source and asset extraction | SHA-256 of every file, see `EXTRACTION_REPORT.md` |
| `extract.bat` rebuilds `src/` and `assets/` | Fresh-folder run matched all 15,389 files by SHA-256 |
| Package format | `tests/package.test.mjs`, 8 of 8 pass |
| Original code compiles and links for WebGL | `build.ps1 build`: 0 errors, `src/` unchanged |
| Original startup, UI, fonts, localization | Game log and screenshots |
| `core.masterbundle` converted for WebGL | 5,360 textures inlined, 1,389 audio clips replaced, 103,554 objects verified by the converter |
| Real barn main menu | Screenshot, log shows 258 menu renderers |
| Main menu frame rate on a real GPU | RTX 4060 Laptop, 1925x1105 canvas: 144 FPS (display limit), about 2-3 ms of game work per frame, 239 draw calls |
| Singleplayer on PEI loads | Game log, screenshots of terrain, trees, buildings, water, wheat fields, bridge |
| All 10 maps listed, loaded when picked | Map list screenshot with names and previews before any map is downloaded; PEI, Tutorial (from its own button) and Germany loaded and rendered on the real GPU |
| In-game frame rate on a real GPU | PEI, Tutorial and Germany at 144 FPS (display limit), 2-5 ms of game work per frame |
| Grass and foliage | 17-23 instanced foliage draws per frame in PEI, no foliage errors |
| Zombies | 27 to 60 spawn when entering a navigation zone, attack and kill the player |
| Guns | Maplestrike given by command auto-equips, fires (30 to 24 rounds), kills zombies (27 to 25 alive) |
| Vehicles | Explorer spawned, entered with F, driven about 100 m, exited with F |
| Startup download | About 320 MB (player and game data), then 12 MB (Tutorial) to 423 MB (Russia) per map |
| Multiplayer join over WebRTC | Two headless browsers with a local signaling server: the host shows a room code, the friend joins through Play > Connect, loads PEI fully, and both see each other's positions |
| Browser memory | Chrome's total private memory, real GPU: 2.2 GB at the menu (was 4.1 GB) and 3.1 GB in PEI (was 5.2 GB) |
| Walking and terrain collision | Position logged moving about 10 m uphill while W was held |
| Water draws behind terrain | Screenshots, after keeping depth through `SkyFog` |
| Inventory dashboard opens with Tab | Screenshot shows inventory, character preview and item with condition |
| Audio decodes and plays | Browser API counters: 156 clips decoded, 0 failed, 73 started, non-silent samples |
| Quit reloads the page without crashing | Exit, Quit, confirm: page restarted, no memory error |
| Save files survive a reload | Files under `/game/Worlds` were still there after the page reloaded |
| Long session stability | About 2 minutes in PEI with varied input, no game errors |
| Live site over HTTPS loading from a CDN | Reached the loading screen on `unturned.arlenh7.com` in a real browser pane |

## Not verified

- **Hearing it.** Decoding and playback are measured, but nobody has confirmed how it sounds.
- **Mouse look.** The test browsers reject pointer lock, so it needs a normal browser window.
- **Russia and the other maps.** They're converted and packaged, but only PEI, Tutorial and Germany have been loaded.
- **Resuming a save in place.** The files persist, but loading back at the same position hasn't been checked.
- **Picking up items from the ground, crafting, death and respawn.** Not exercised yet.
- **In-game Exit back to the menu.** Only quitting from the main menu has been tested.
- **The `BundleTool` patch.** This editor menu tool compiles but has not been run.

## Known problems

- **Zombies don't pathfind.** The SDK leaves out the A* Pathfinding Project integration, so zombies use the SDK's `NonPathfindingZombieMovementComponent` and walk straight at their target. They can get stuck on walls.
- **Water is flat gray.** It uses the SDK's `Water_Fallback` shader.
- **Menu visual glitch.** Bright patches at the left and bottom-left of the barn menu. The barn itself is no longer overexposed, but these haven't been checked against the original game.
- **Intermittent freeze on a real GPU.** Before the menu fix, the page stopped responding a few times after 20 seconds to 2.5 minutes. It hasn't been reproduced since, but the runs have been short.
- **Steam is simulated offline.** About 55 of 956 native functions are implemented. The rest log their name and return zero, and callbacks never fire, so inventory items, Workshop and matchmaking don't work.
- **Online requests fail.** Live config, news and matchmaking filters fail in the browser, and the game logs and retries them.
- **Duplicate sounds.** Clips with the same name, channels, frequency and length share one encoded copy.
- **Memory is still high for 4 GB Chromebooks.** Unity's own heap is about 1.2 GB in PEI, because Unturned loads every asset's prefab at startup. Getting below that needs assets to load on demand.
- **Store cosmetics are skipped.** Items marked `Pro` aren't loaded, since they only come from the Steam item store. NPCs that wear them lose those clothes.
- **Package size.** `game.unturned` is about 1.5 GB with every map. Players only download the part they need.
- **Plugin modules are unsupported.** `Assembly.Load` can't work under IL2CPP.

## Decisions

- **Unity WebGL/IL2CPP** over standalone .NET WebAssembly. See `docs/ARCHITECTURE.md`.
- **Unity 6000.6.7f1**, because 2022.3.62f3 has no WebGL module installed. API changes live in `engine/patches.json`.
- **`src/` and `assets/` are never edited.** The build composes a project in `build/full`, then applies the API updater, `engine/overlay` and `engine/patches.json`.
- **Patch rules, not copied files**, so SDG's source stays out of the repo. A rule that stops matching fails the build.
- **Steam replaced at the native API level.** The game calls Steam directly in 47 files, so this avoids editing them.
- **Bundles rewritten, not rebuilt.** `tools/convert-bundle.mjs` inlines texture data and changes the build target, then verifies every object. Shaders are swapped at load by the game's own `ShaderConsolidator`.
- **Audio re-encoded by Unity.** Clips are decoded in the editor from a temporary copy and encoded for WebGL, then spliced in.
- **Worker thread pool jobs run on the main thread.** They finish on their own, and WebGL has no threads. This can block the page for a few seconds while loading.
- **Quit reloads the page**, because shutting the engine down left its main loop running on freed memory.
- **Patch rules must not stack.** `build/full` is reused between builds, so a rule whose replacement contains its own search text is skipped once applied. Before this, the menu props were loaded once per build. After 9 builds the barn was drawn 9 times with 54 lights, 8,205 draw calls a frame, about 24 FPS and blown-out lighting.
- **Maps load on demand.** Each map's listing files ship with the game data, so the menu shows every map. `Provider.singleplayer` waits for the map's package group to download before starting, and the previous map's files are freed. Package groups are stored contiguously so each is one range request.
- **Foliage runs on the main thread.** `FoliageStorageV2` reads one requested tile per frame in `Update` instead of on a worker thread, and `ListExtension` reads `List<T>._items` by reflection because IL2CPP can't run `Reflection.Emit`.
- **Lower memory settings for Chromebooks.** Textures drop two mip levels, audio decodes at 24 kHz, the canvas renders at CSS pixels, store cosmetics aren't loaded, and the startup copies of the game files are freed once Unity has them.
- **4 GB WebGL memory limit.** Germany ran out of the default 2 GB while loading.
- **Saves use IndexedDB.** `/game/Worlds`, `/game/Cloud` and `/game/SteamCloud` are mounted with IDBFS and synced every 20 seconds, on page hide and before Quit reloads.

## Licensing

The repo is private as of 2026-10-31. `src/` and `assets/` stay out of Git regardless. The U3 SDK license limits mods to PCs running Windows, macOS or Linux, and a public site can be opened on a phone. The owner has been told about this and is hosting a build on their own domain and CDN.

## Next steps

1. Check that a saved game resumes at the same position.
2. Test item pickup, crafting, death and respawn, then fix what breaks.
3. Load the remaining maps, Russia first since it's the largest.
4. Play-test multiplayer properly (walking, shooting each other, vehicles, building) and deploy a signaling server. See `docs/MULTIPLAYER.md`.
5. Load assets on demand to bring memory down further.
6. Replace `Water_Fallback` with real water if the shipped shaders can be recovered.
