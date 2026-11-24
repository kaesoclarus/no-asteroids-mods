# No Asteroids Mod Loader

Loads mods from a `mods` folder next to the game, with no hand-editing of game files.

## For players

**Install:** double-click **Install mod loader.bat**. It finds the game through Steam (the full game, or the demo if that's all you have), backs up the original files and installs the loader plus the bundled mods.

| File | Does |
|---|---|
| Install mod loader.bat | Install, or re-install after a game update |
| Uninstall mod loader.bat | Put the original game files back (your `mods` folder is kept) |
| Mod loader status.bat | Shows whether the loader is active and which mods are on |

- **After a game update** (or Steam's "Verify integrity of game files"), mods stop loading. Run *Install mod loader.bat* again.
- **To turn a mod off**, open `<game>\mods\<mod>\mod.json` and add `"enabled": false,`.
- **Before you report a bug to the developers**, uninstall the loader and check the bug still happens. A "Modded" tag shows in the corner for the first few seconds of each launch so screenshots are clear.
- **Co-op:** the bundled mods only change what *you* see. Other players don't need them.

### How it works (and what it changes)
The game is an Electron app. Its exe stores a SHA-256 hash of the game archive (`resources\app.asar`) and refuses to start if the archive changes. The installer:
1. copies the original `app.asar` and exe to `<game>\mods\_backup`
2. builds a new archive from the original, changing 3 small files (the launcher's file server, `index.html`, and a new `__modloader.js`)
3. writes the new archive's hash into the exe, so the game's integrity check stays **on** and passes

The exe's digital signature no longer matches after this. Windows and Steam don't require it, and uninstalling restores the signed original.

## For modders

A mod is a folder in `<game>\mods\` with a `mod.json`:

```json
{
  "name": "My Mod",
  "version": "1.0.0",
  "author": "you",
  "description": "What it does",
  "scripts": ["main.js"],
  "styles": ["style.css"],
  "patches": [],
  "enabled": true
}
```

Folder names must be letters, digits, `.`, `_` or `-`. Mods load in alphabetical order of folder name.

### Scripts and styles
They load on the game page **before** the game's own code starts. Scripts run in the page (Chromium, sandboxed, no Node.js), so they can use the DOM, `fetch` and `localStorage`.

### Asset overrides
Anything in `mods/<id>/files/` replaces the game file at the same path. For example, `files/audio/music-hunt.ogg` replaces `/audio/music-hunt.ogg`. When two mods override the same file, the later folder name wins. To see the game's file list, open `app.asar` with any asar viewer, or use `AsarTool.cs`.

### Text patches
These are find/replace rules applied to game files as they are served. Use them for minified code you can't reach from a script:

```json
"patches": [
  { "id": "my-change", "file": "/assets/index-*.js", "find": "glow:[`#a46bff`", "replace": "glow:[`#ff0000`", "expect": 1 },
  { "id": "worker-setup", "file": ["/assets/mesher.worker-*.js"], "prepend": "setup.js" },
  { "id": "by-regex", "file": "/assets/index-*.js", "regex": true, "find": "foo\\((\\d+)\\)", "replace": "foo($1*2)", "flags": "g" }
]
```

- `file` is a path or a list of paths; `*` matches anything but `/`. The game's bundles have hashed names that change every update, so use wildcards.
- `expect` is optional. When given, the patch only applies if `find` matches exactly that many times. Otherwise it's skipped and reported, which protects against a game update changing the code.
- `prepend` adds a file from your mod to the top of the matched file. Use it to give Web Workers access to your code.
- See the results in game with `NAMods.patchReport()`.

### Page API: `window.NAMods`
| | |
|---|---|
| `NAMods.list` | the loaded mods |
| `NAMods.get(id)` | one mod's info (`name`, `version`, `config` from mod.json ...) |
| `NAMods.storage(id).load(defaults)` | your settings from `mods/<id>/settings.json` (synchronous) |
| `NAMods.storage(id).save(obj)` | saves them (returns a Promise). Workers can read the same file at `/__mods/<id>/settings.json` |
| `NAMods.patchReport()` | what each patch did: `[{ mod, id, file, hits, applied, note }]` |
| `NAMods.log(id)` | a `console.log` prefixed with your mod id |
| `NAMods.ready(fn)` | runs `fn` once `document.body` exists |
| `NAMods.errors` | problems the loader found (bad mod.json and so on) |

### DevTools
Set `"devtools": true` in `<game>\mods\loader.json` (or install with `-DevTools`), then press **F12** in game.
