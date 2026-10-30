# Extraction Report

Extraction and verification only. Nothing was compiled, ported or modified.

## Sources

| Source | Path | Version |
|---|---|---|
| U3 SDK | `C:\BIG Projects\U3-SDK-main` | Unity 2022.3.62f3 project |
| Steam install | `C:\Program Files (x86)\Steam\steamapps\common\Unturned` | App 304930, build 25613056 |

## Copied

| Destination | Files | Bytes | Size |
|---|---|---:|---:|
| `src\` | 3,945 | 14,220,010 | 13.6 MiB |
| `assets\` (Steam content) | 10,180 | 2,121,236,292 | 1.98 GiB |
| `assets\U3-SDK\` | 1,264 | 73,278,923 | 69.9 MiB |
| **Total game assets (`assets\`)** | **11,444** | **2,194,515,215** | **2.04 GiB** |

### C# source

**1,957 `.cs` files, 13,736,257 bytes (13.1 MiB).** This is every `.cs` file in the SDK.

| Group | Files | Bytes |
|---|---:|---:|
| `Assets\Runtime` (game code) | 1,775 | 11,694,607 |
| `Assets\com.rlabrecque.steamworks.net` (third party) | 107 | 1,589,937 |
| `Assets\Editor` | 48 | 210,854 |
| `Assets\Tests` | 26 | 238,631 |
| `JenkinsBootstrapper\Program.cs` (CI tool) | 1 | 2,228 |

`src\` also holds the compile metadata beside the code: 1,956 `.cs.meta`, 15 `.asmdef`, 15 `.asmdef.meta`, `csc.rsp` and `csc.rsp.meta`.

### Steam content, at the root of `assets\`

| Folder | Files | Bytes |
|---|---:|---:|
| `Maps` (10 maps) | 953 | 1,515,560,028 |
| `Unturned_Data` | 42 | 339,702,750 |
| `Bundles` | 8,941 | 120,539,039 |
| `Extras` | 32 | 107,627,580 |
| `LoadingScreens` | 39 | 29,008,411 |
| `Content` | 2 | 1,374,401 |
| `CuratedMapIcons` | 22 | 1,011,205 |
| `Localization` | 145 | 168,756 |
| Root files (`EconInfo.bin`, `Status.json`, `StreamerNames.json`, `THIRDPARTYNOTICES.txt`) | 4 | 6,244,122 |

Maps: Alpha Valley, Destruction, Germany, Monolith, Paintball_Arena_0, PEI, Russia, Tutorial, Washington, Yukon.

### SDK project files, in `assets\U3-SDK\`

Editable forms of content that Steam only ships compiled: 133 materials, 70 shaders, 63 prefabs, 28 FBX models, 89 PNGs and 9 scenes, along with folder `.meta` files and plugins. Also `ProjectSettings\`, `Packages\`, `LICENSE.txt` and `THIRDPARTYNOTICES.txt`.

## Excluded

### Steam: 333 files, 106,239,519 bytes

| Item | Files | Bytes | Reason |
|---|---:|---:|---|
| `Unturned_Data\Managed` | 129 | 34,700,485 | Compiled code, source is in `src\` |
| `UnityPlayer.dll` | 1 | 31,097,568 | Native runtime |
| `BattlEye` | 39 | 25,259,936 | Native anti-cheat |
| `MonoBleedingEdge` | 20 | 9,184,198 | Native runtime |
| `Unturned_BE.exe`, `Unturned.exe`, `UnityCrashHandler64.exe` | 3 | 3,826,344 | Native executables |
| `Unturned_Data\Plugins` | 3 | 1,776,951 | Native plugins |
| `Worlds` | 126 | 350,558 | Your local saves |
| `Logs`, `Cloud`, `Preferences.json` | 6 | 34,897 | Your local data |
| `.lnk`, `.bat`, `install.vdf`, `steam_appid.txt` | 6 | 8,582 | Launcher and Steam files |

Also not copied:
- **Workshop mods:** `steamapps\workshop\content\304930`, 28,394 files, about 2.2 GB. These are subscribed third-party content, not original assets.
- **Empty Steam folders:** `Modules`, `Sandbox`, `Servers`, `Bundles\Workshop` and its `Content` and `Maps` subfolders. They may need recreating if the runtime expects them.

### SDK: 22 files, 37,505 bytes

Root dotfiles, `.vsconfig`, `README.md`, `steam_appid.txt`, 2 `.lnk` files, `.github\`, `Builds\Shared\` (`ModInfo.json`, `Status.json`), `Editor_Test_Config\`, the Jenkins `.csproj` and `.sln`, and `WindowsAssertionFix\` (native C++).

### Not available from either source

- Unity package contents. `Packages\` holds only the manifest and lock file, because the Unity editor resolves packages itself.
- Unity engine source. `UnityEngine` is not part of the SDK.

## Verification

Run on 2026-10-30. Every copied file was SHA-256 compared with its source.

| Check | Expected | Actual | Missing | Extra | Hash mismatches |
|---|---:|---:|---:|---:|---:|
| `src\Assets` vs SDK code files | 3,944 | 3,944 | 0 | 0 | 0 |
| `src\JenkinsBootstrapper` | 1 | 1 | 0 | 0 | 0 |
| `assets\U3-SDK\Assets` vs remaining SDK `Assets` | 1,236 | 1,236 | 0 | 0 | 0 |
| `assets\U3-SDK\ProjectSettings` | 24 | 24 | 0 | 0 | 0 |
| `assets\U3-SDK\Packages` | 2 | 2 | 0 | 0 | 0 |
| `assets\U3-SDK` license files | 2 | 2 | 0 | 0 | 0 |
| `assets\` vs Steam minus exclusions | 10,180 | 10,180 | 0 | 0 | 0 |

- Every one of the 5,180 SDK `Assets` files is in exactly one of `src\Assets` or `assets\U3-SDK\Assets`.
- `src\Assets` contains only the six allowed code and metadata file patterns.
- No `.exe` or `.dll` is in `assets\` outside `Extras\` (4 mod DLLs) and `U3-SDK\` (3 plugin DLLs).
- Sources are unchanged after the copy. The SDK is still 5,231 files and 87,536,438 bytes, and Steam is still 10,513 files and 2,227,475,811 bytes, each with the same newest write time. The Steam build ID is still 25613056.
- No inaccessible files: no enumeration or copy failures.

### What this does not prove

- This proves the copies match the sources. It does not prove the sources hold everything the original game needs.
- Compiled files (`core.masterbundle`, `.unity3d`, `.assets`) were copied as they are, without being unpacked or checked for content.
- No code was compiled, so buildability is untested.
- Not every file from the Steam install or SDK was extracted. The exclusions above are deliberate.

## Issues to resolve

1. **License risk for the browser port.** The U3 SDK License (`assets\U3-SDK\LICENSE.txt`) limits Mods to personal computers running Windows, macOS or Linux (section 1). It bars platforms or environments that enable play on mobile or console devices (section 2), and a breach of those restrictions ends the license automatically (section 7). A public browser build that phones can reach may conflict with this. Shipping Steam assets inside `game.unturned` would also be redistribution, and section 5 restricts use of the UNTURNED trademark. The local copy made here is within the license's permission to use, copy and modify, but this should be settled before anything is distributed. This is a flag, not legal advice.
2. **Do not commit `assets\`.** The repo has a GitHub `origin` and no `.gitignore`. `Bundles\core.masterbundle` (112 MB) and the Germany and Russia `Foliage.blob` files (449 MB and 503 MB) exceed GitHub's 100 MB file limit, and pushing the assets could count as redistribution. `src\` and `assets\` are currently untracked.
