# Architecture

## Decision: Unity WebGL/IL2CPP

The port compiles the original C# with Unity's WebGL backend. `src/` and `assets/` are never edited. The build composes them with browser-specific code from `engine/` into a generated Unity project under `build/`.

### Comparison

Measured over the 1,775 files in `src/Assets/Runtime`:

| Requirement | Evidence in the source | Unity WebGL/IL2CPP | Standalone .NET WebAssembly |
|---|---|---|---|
| Unity engine API | 879 `using UnityEngine` directives, 180 `MonoBehaviour` files | Supplied by the engine | Every used API must be reimplemented |
| Physics | 57 files use `Physics.`, 28 `Rigidbody`, 10 `CharacterController`, 3 `WheelCollider` | PhysX ships in the player | Needs a PhysX-compatible engine |
| Rendering | 70 Unity shaders, terrain, skinned meshes, particles, post-processing | Supplied, shaders recompiled for WebGL | Needs a new renderer and shader translation |
| UI | uGUI, TextMeshPro, UI Toolkit, IMGUI (42 files use UI namespaces, 16 `OnGUI`) | Supplied | Needs four UI systems |
| Game data | UnityFS bundles (`core.masterbundle`, 55 `.unity3d`) | Native format, after conversion for WebGL | Needs a full serialized-file reader |
| Execution speed | Large per-frame game logic | IL2CPP compiles ahead of time | Interpreted unless AOT, which needs the `wasm-tools` workload, not installed |

Standalone .NET would mean writing a substitute for most of Unity before any gameplay ran, and behavior would drift from the original wherever the substitute differed. Unity WebGL runs the same engine the game was written for, so the work narrows to what browsers actually lack.

### Costs of this choice

- **Engine version.** The source targets Unity 2022.3.62f3, which has no WebGL module installed here. The build uses the installed 6000.6.7f1, so the original code may need API updates, applied by overlay and never in `src/`.
- **Asset bundles.** The shipped bundles are built for Windows and contain Direct3D shaders. They need converting for WebGL. The planned route is to load them in the editor and rebuild them for WebGL, with shaders replaced from the SDK sources.
- **Single-threaded.** WebGL threading is off, but the original uses `ThreadPool` and `Thread` in 5 files, such as `AssetsWorker`, `FoliageStorageV2` and `ResourceHash`.
- **Memory.** WebAssembly memory has a hard ceiling, so maps have to load one at a time.

## Browser blockers in the source

| Area | Where | Plan |
|---|---|---|
| Steam | 47 files reference Steam services, `SteamworksProvider` calls `SteamAPI.Init` | Implement a browser provider behind the existing `SDG.Provider` interfaces |
| Sockets | `NetTransport_SystemSockets` (4 files) | Replace with a WebRTC transport behind `SDG.NetTransport` |
| Threads | 5 files | Run the work on the main thread or in coroutines |
| Native imports | `WindowsConsole` (`kernel32`) | Exclude from the browser build |
| Plugin loading | `ModuleHook` uses `Assembly.Load` | Not possible under IL2CPP, so plugin modules are unsupported |
| Process launch | `WebUtils`, `ReadWrite` | Replace with browser equivalents |

## File access

The original reads game data through `System.IO` from the install directory. In WebGL, `System.IO` works against Emscripten's in-memory file system. `runtime.js` writes package entries into that file system before the player starts, using `engine/unity/Assets/Plugins/WebGL/GameFiles.jspre`, so the original file loading code can run unchanged.

## Layout

| Path | Role |
|---|---|
| `src/`, `assets/` | Original code and data, read-only |
| `engine/unity/` | Browser Unity project sources |
| `web/` | Page, package reader and boot code |
| `tools/` | Packer and local server |
| `tests/` | Package tests and browser end-to-end test |
| `build/` | Generated Unity project, player and logs |
| `dist/` | `index.html`, `runtime.js`, `game.unturned` |

`game.unturned` holds the Unity player files and game data ([format](PACKAGE_FORMAT.md)). `runtime.js` is Unity's generated loader combined with `web/package.js` and `web/boot.js`. It must stay a classic script, because Unity's loader assigns to undeclared variables and fails in strict mode.

## Multiplayer plan

Singleplayer comes first. Later, one browser hosts the authoritative simulation and peers connect through WebRTC DataChannels, as in Eaglercraft's integrated hosting. A small signaling service handles connection setup only. The game already separates transport behind `SDG.NetTransport`, so a DataChannel transport can replace the socket one, with a reliable channel for game state and an unreliable one for frequent updates.
