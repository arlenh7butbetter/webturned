# Porting Progress

Last updated 2026-10-31. Everything under "Verified" was run and checked, using headless Chrome with software rendering unless stated otherwise. **The original game runs in a browser and you can walk around PEI. It isn't complete.**

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
| Singleplayer on PEI loads | Game log, screenshots of terrain, trees, buildings, water, wheat fields, bridge |
| Walking and terrain collision | Position logged moving about 10 m uphill while W was held |
| Water draws behind terrain | Screenshots, after keeping depth through `SkyFog` |
| Inventory dashboard opens with Tab | Screenshot shows inventory, character preview and item with condition |
| Audio decodes and plays | Browser API counters: 156 clips decoded, 0 failed, 73 started, non-silent samples |
| Quit reloads the page without crashing | Exit, Quit, confirm: page restarted, no memory error |
| Long session stability | About 2 minutes in PEI with varied input, no game errors |
| Live site over HTTPS loading from a CDN | Reached the loading screen on `unturned.arlenh7.com` in a real browser pane |

## Not verified

- **Hearing it.** Decoding and playback are measured, but nobody has confirmed how it sounds.
- **Mouse look.** The test browsers reject pointer lock, so it needs a normal browser window.
- **Real GPU performance.** Frame rate and memory on real hardware are unmeasured.
- **Zombies, combat, picking up items, crafting, vehicles.** No test has exercised them yet.
- **In-game Exit back to the menu.** Only quitting from the main menu has been tested.
- **The `BundleTool` patch.** This editor menu tool compiles but has not been run.

## Known problems

- **Saves are lost on reload.** The game's files live in memory.
- **Only PEI is packaged.** Other maps need converting and on-demand loading, since they total about 1.4 GB.
- **Foliage thread.** `FoliageStorageV2` still starts a `Thread`, so grass and foliage may be missing.
- **Water is flat gray.** It uses the SDK's `Water_Fallback` shader.
- **Menu visual glitch.** Bright stray patches appear at the left and bottom-left of the barn menu.
- **Steam is simulated offline.** About 55 of 956 native functions are implemented. The rest log their name and return zero, and callbacks never fire, so inventory items, Workshop and matchmaking don't work.
- **Online requests fail.** Live config, news and matchmaking filters fail in the browser, and the game logs and retries them.
- **Duplicate sounds.** Clips with the same name, channels, frequency and length share one encoded copy.
- **Package size.** `game.unturned` is about 397 MB for one map.
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

## Licensing

The repo is private as of 2026-10-31. `src/` and `assets/` stay out of Git regardless. The U3 SDK license limits mods to PCs running Windows, macOS or Linux, and a public site can be opened on a phone. The owner has been told about this and is hosting a build on their own domain and CDN.

## Next steps

1. Keep saves across reloads with browser storage.
2. Test zombies, combat, items and crafting, then fix what breaks.
3. Replace the foliage thread.
4. Convert the other 9 maps and load them on demand.
5. Replace `Water_Fallback` with real water if the shipped shaders can be recovered.
6. After singleplayer is solid, add the WebRTC transport.
