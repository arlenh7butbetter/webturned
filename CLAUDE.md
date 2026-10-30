

\# Unturned Web Port



\## Project



Port Unturned 3 to the browser using C#, WebAssembly, JavaScript, and browser-compatible game systems.



Project root: `C:\\BIG PROJECTS\\unturned-web-port`



The goal is a functional browser game, not merely a successful compilation.



\## Directory Structure



\- `src/` — Original Unturned C# source code

\- `assets/` — Original Unturned game assets

\- `engine/` — Browser-compatible engine implementations

\- `web/` — Browser runtime and frontend

\- `networking/` — Future WebRTC multiplayer

\- `tools/` — Build utilities and asset converters

\- `tests/` — Automated tests

\- `dist/` — Final browser build



The `src/` and `assets/` directories already exist.



Never move, delete, or reorganize their contents without explicit permission.



Create additional directories only when necessary.



\## Final Build Output



The final build must generate:



```text

dist/

├── index.html

├── runtime.js

└── game.unturned

```



`game.unturned` is a custom compressed package containing the browser-compatible compiled game and required assets.



Use a documented, versioned package format with integrity checks.



`runtime.js` must load the package, decompress its contents, initialize the game runtime, and launch the game.



The output must contain real executable game functionality. Never generate fake binaries, empty placeholders, or simulated build success.



\## Build System



Use the most appropriate tools for the project.



Prefer .NET/MSBuild for standalone C# components, JavaScript or TypeScript for browser integration, and Unity WebGL/IL2CPP if technically necessary.



Do not introduce Gradle without a compelling reason.



Provide a single build entry point:



`powershell -ExecutionPolicy Bypass -File .\\build.ps1`



Support build, clean, test, and run operations.



Keep intermediate artifacts outside `dist/`.



The final `dist/` directory must contain only the three requested files.



\## Engineering Principles



\### No Slop Code



Every line must have a clear purpose.



Do not write code simply to demonstrate progress.



Never introduce:



\- Unnecessary classes or methods

\- Redundant wrappers

\- Unused variables or imports

\- Duplicate implementations

\- Pointless abstractions

\- Excessive defensive programming

\- Speculative compatibility layers

\- Unnecessary configuration options

\- Fake implementations that pretend to work

\- Large amounts of boilerplate for trivial functionality



Prefer straightforward implementations over complicated architectures.



If a problem can be correctly solved with one line, do not introduce fifty lines.



However, never sacrifice correctness, performance, or maintainability merely to reduce line count.



\### No Band-Aid Fixes



Always identify the root cause of an issue.



Do not suppress errors, swallow exceptions, disable functionality, or add arbitrary fallback behavior to hide broken code.



Never replace an actual implementation with a stub just to satisfy the compiler.



Do not change unrelated files to make an error disappear.



Avoid adding compatibility hacks without understanding why they are necessary.



Fix the problem at its source whenever possible.



If a real fix requires an architectural change, investigate and plan it before modifying the code.



\### Think Before Writing Code



Before implementing anything:



1\. Inspect the relevant existing files.

2\. Understand the current behavior.

3\. Trace dependencies and call sites.

4\. Identify the actual problem.

5\. Consider the simplest correct solution.

6\. Evaluate potential side effects.

7\. Determine which files genuinely need modification.

8\. Only then write code.



Do not randomly generate files, methods, or abstractions.



Do not implement features without understanding how they integrate with the existing system.



Reuse existing functionality whenever appropriate.



Do not rewrite working code without a concrete reason.



For larger changes, establish a clear implementation plan before editing.



\### Minimal, Focused Changes



Make the smallest correct change that fully solves the problem.



Avoid touching unrelated code.



Do not reformat entire files unnecessarily.



Do not rename symbols without a reason.



Do not introduce new dependencies when existing functionality is sufficient.



Do not create helper methods for operations that are clearer inline.



Do not create interfaces or abstract classes for a single implementation unless there is a genuine architectural need.



Avoid unnecessary indirection.



Keep the codebase compact, consistent, and understandable.



\### Code Must Not Look AI-Generated



Write code like an experienced developer maintaining a real project.



Follow the surrounding codebase's naming, formatting, and organizational conventions.



Avoid:



\- Overly descriptive method names

\- Excessively generic abstractions

\- Artificially modularized code

\- Unnecessary design patterns

\- Repeated validation

\- Verbose error handling for impossible states

\- Redundant temporary variables

\- Unnecessary helper functions

\- Repetitive boilerplate

\- Inconsistent naming

\- Inflated implementations



Prioritize natural, readable, idiomatic code.



Do not optimize for appearing sophisticated.



Do not add complexity to make the implementation look impressive.



\### No Code Comments



Do not add comments to source code.



This includes:



\- Single-line comments

\- Block comments

\- XML documentation comments

\- JSDoc comments

\- TODO comments

\- FIXME comments

\- Explanatory comments



Code should be understandable through clear naming and straightforward structure.



Preserve existing comments unless they become incorrect because of a necessary modification.



Do not delete functional code merely to remove comments.



Documentation belongs in Markdown files when genuinely necessary.



\### Review Your Own Work



After implementing a change:



1\. Review the complete diff.

2\. Check every added line for necessity.

3\. Remove redundant or unused code.

4\. Verify that existing behavior is preserved.

5\. Check for accidental changes.

6\. Inspect integration with dependent systems.

7\. Run relevant builds and tests.

8\. Fix actual problems before continuing.



Do not assume generated code is correct.



Do not claim functionality works without verifying it.



If a change introduces unnecessary complexity, simplify it before proceeding.



\## C# Standards



Use idiomatic C# and follow existing naming conventions.



Prefer direct, understandable implementations.



Avoid excessive inheritance, unnecessary interfaces, and speculative abstractions.



Minimize allocations in performance-critical game loops.



Preserve the intended behavior of original Unturned systems.



Do not replace complex gameplay systems with empty methods simply to compile.



\## JavaScript Standards



Use modern JavaScript or TypeScript where appropriate.



Avoid unnecessary frameworks and dependencies.



Prefer native browser APIs when they provide sufficient functionality.



Keep runtime initialization and asset loading straightforward.



Avoid creating complex state-management systems without a clear need.



Use WebAssembly for compatible compiled game logic where feasible.



\## Browser Porting Rules



Analyze Unity dependencies before modifying them.



Identify which original systems can be reused and which require replacement.



Do not blindly remove UnityEngine references.



Do not assume standalone .NET WebAssembly can execute Unity-dependent gameplay without an engine implementation.



Prioritize:



1\. Working build infrastructure

2\. Browser runtime initialization

3\. Asset loading

4\. Rendering

5\. Input handling

6\. Player movement

7\. World loading

8\. Gameplay systems

9\. Singleplayer functionality

10\. WebRTC multiplayer



Do not sacrifice important gameplay functionality merely to achieve a successful build.



\## Asset Handling



Preserve original game assets.



Implement conversion tools only when necessary.



Avoid duplicating large assets.



Do not invent unsupported asset formats.



Document any conversion limitations.



Check licensing before distributing original game content.



\## Multiplayer



The eventual networking system should support Eaglercraft-style browser-hosted multiplayer using WebRTC DataChannels.



Prioritize singleplayer first.



When implementing networking:



\- Preserve authoritative game simulation where possible.

\- Avoid unnecessary dedicated game-server requirements.

\- Use signaling for WebRTC connection negotiation.

\- Support reliable and unreliable data channels where appropriate.

\- Minimize bandwidth and latency.

\- Avoid unnecessary network abstractions.



Do not implement multiplayer until the browser runtime is sufficiently functional.



\## Git Rules



\### Commit Messages



Use short, natural, single-line commit messages.



Write them like a developer describing a real change.



Examples:



\- `Fix asset loading`

\- `Add WebGL build`

\- `Handle missing textures`

\- `Fix player movement`

\- `Remove unused code`

\- `Load world assets`

\- `Fix runtime initialization`



Avoid:



\- Long descriptions

\- Multi-line commit messages

\- Emoji

\- Artificially enthusiastic wording

\- Unnecessary conventional-commit prefixes

\- Generic messages such as "Improve code quality"

\- Inflated descriptions of trivial changes

\- AI attribution trailers or signatures



Keep each commit focused on one logical change.



Never claim a commit fixes something that has not been tested.



Do not create commits automatically unless requested.



Never rewrite existing Git history without permission.



\### Commit Quality



Before committing:



1\. Inspect the diff.

2\. Remove unrelated changes.

3\. Verify the affected functionality.

4\. Stage only relevant files.

5\. Write a short, accurate commit message.



Do not combine unrelated fixes into one commit.



Do not create meaningless commits just to show progress.



\## Autonomy



Work independently on well-defined tasks.



Investigate errors before attempting fixes.



Use an iterative workflow:



Inspect → Plan → Implement → Build → Test → Review



Continue through recoverable build failures.



Do not repeatedly apply random changes hoping compilation succeeds.



If an approach fails repeatedly, reconsider the architecture instead of adding more workarounds.



Stop and report genuine blockers, missing dependencies, licensing constraints, or decisions that require user approval.



Never fabricate progress.



\## Progress Tracking



Maintain `PORTING\_PROGRESS.md`.



Record:



\- Verified working functionality

\- Current technical blockers

\- Important architectural decisions

\- Build failures requiring further investigation

\- Next concrete development steps



Keep updates concise and factual.



Do not fill progress documents with vague summaries or exaggerated accomplishments.



\## Definition of Done



A change is complete only when:



\- It solves the intended problem.

\- The implementation is necessary and appropriately scoped.

\- It introduces no obvious regressions.

\- Relevant builds and tests pass.

\- The resulting diff has been reviewed.

\- No unnecessary code remains.



A successful browser build must produce a functioning application, not merely three files.



The final objective is a playable browser version of Unturned that loads its world, renders correctly, supports gameplay, and can eventually host WebRTC multiplayer.



