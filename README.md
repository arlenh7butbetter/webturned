# Webturned

Unturned running in a browser, ported by Arlen. Not a remake: this compiles the game's real C# from the U3 SDK to WebAssembly with Unity's WebGL build, then feeds it the real game files from a Steam install.

It's still rough in places, but it works. All ten official maps are in, and you can drive, shoot zombies and get eaten by them. Most of what's left is finding out what breaks next.

This is a fan project. It isn't affiliated with or endorsed by Smartly Dressed Games. "Unturned" is only used here to say what the project is based on.

## Where it's at

Working:

- The real main menu and loading screens
- All ten official maps in singleplayer, including the tutorial. Each map downloads when you pick it
- Walking, terrain, trees, grass, buildings and water
- Zombies, guns and vehicles
- The inventory screen
- Sound, including the ambient loops
- Saving, into the browser's own storage, so clearing site data deletes your worlds
- Quitting, which reloads the page since a browser tab can't really exit

Not working yet, or not tested:

- **Zombies don't pathfind.** The SDK doesn't include the pathfinding library the real game uses, so they walk straight at you and can get stuck on walls.
- **Picking up items, crafting and respawning** haven't been tested yet.
- **Steam stuff** is faked offline, so Workshop, the item store and matchmaking don't do anything.
- **Multiplayer** doesn't exist yet. The plan is browser-hosted games over WebRTC, once singleplayer is solid.
- **Water** is a flat gray for now. It's using the SDK's fallback shader.
- **Mouse look** still needs a proper test in a normal browser window.

[PORTING_PROGRESS.md](PORTING_PROGRESS.md) has the longer version.

## What you need

- Windows
- Unturned installed through Steam
- A copy of the [U3 SDK](https://github.com/smartlydressedgames/u3-sdk/)
- Unity 6000.6.7f1 with WebGL Build Support
- .NET 9 SDK
- Node.js
- Chrome or Edge, if you want to run the tests

The SDK targets Unity 2022.3, but this project builds with Unity 6 because that's the version I had WebGL support for. The differences get patched at build time.

## Getting started

The game's code and assets aren't in this repo, so pull them from your own copies first:

```
extract.bat "C:\path\to\U3-SDK-main"
```

That finds Steam on its own and fills `src/` and `assets/`. It won't overwrite files that are already there.

Then build and run:

```
powershell -ExecutionPolicy Bypass -File .\build.ps1 build
powershell -ExecutionPolicy Bypass -File .\build.ps1 run
```

Open <http://localhost:8080/> and give it a minute. The first build takes a while because Unity has to compile everything and convert the assets. Later ones are much faster.

## Build commands

| Command | What it does |
|---|---|
| `build` | Builds the game into `dist/` |
| `run` | Serves `dist/` on port 8080 |
| `test` | Runs the package tests and the browser test |
| `slice` | Builds the small terrain test scene that `test` uses |
| `compile` | Only checks that the game's code compiles for WebGL |
| `clean` | Deletes `build/` and `dist/` |

Run `slice` once before `test`. Adding `-PackageOnly` to `build` or `slice` skips Unity and just repackages, which is handy when you've only changed something in `web/`.

## How it works

`dist/` ends up with three files:

- `index.html`, the page
- `runtime.js`, Unity's loader plus the code that reads the package
- `game.unturned`, a single package with the compiled game and its data

The package format is documented in [docs/PACKAGE_FORMAT.md](docs/PACKAGE_FORMAT.md), and the reasoning behind using Unity WebGL is in [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

`src/` and `assets/` never get edited. The build copies them into `build/full`, then applies everything the browser needs on top:

- `engine/patches.json` has small find-and-replace fixes to the source. If one stops matching, the build fails rather than quietly skipping it.
- `engine/overlay/` adds new files, including a stand-in for Steam's native library.
- `tools/convert-bundle.mjs` rewrites the game's asset bundles for WebGL, since the Steam versions are built for Windows.

If you're poking around, those three are where most of the interesting stuff is.

## Hosting it yourself

The package is big, around 1.5 GB with every map, so you'll probably want it on a CDN. Players only download about 400 MB to get to the menu, plus whichever map they play. Set this in `index.html` before `runtime.js` loads:

```html
<script>window.unturnedPackageUrl = "https://your-cdn.example/game.unturned";</script>
```

The page has to be on HTTPS, and your CDN needs CORS set up to allow your site's origin and the `Range` header.

Before you put a build online, though, read the next section.

## License

The code in `src/` and everything in `assets/` belongs to Smartly Dressed Games, which is why neither is in this repo. `extract.bat` copies them from your own install.

The U3 SDK license limits mods to Windows, macOS and Linux PCs and rules out platforms that enable play on phones or consoles. A breach of those terms ends the license automatically. A public website can be opened on a phone, so hosting a build publicly may be a problem. It also hands out the game's assets to anyone who loads the page. Read `LICENSE.txt` in the SDK and make your own call. I'm not a lawyer.
