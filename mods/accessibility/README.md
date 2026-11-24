# Accessibility Pack

Press **F10** in game to open its settings.

## Ore colours (colour blindness)
The game's glowing ores use colours that are hard to tell apart:
- **Ice and neutronium** look almost the same for everyone.
- **Ice and dark matter** become identical with deuteranopia (the most common type of colour blindness).

The pack recolours each ore's **surface texture**, its glow, its dig trail and its voxel colour. The texture recolour keeps each pixel's brightness, so the texture detail stays: plasmite's veins, dark matter's star specks, crystal's facets.

| Palette | Use it for |
|---|---|
| **Colorblind-safe** | Any type of colour blindness. Every pair of glowing ores stays clearly apart for normal, protan, deutan and tritan vision. |
| **Okabe-Ito** | The well-known colour-blind-friendly set used in science figures. |
| Game default | No change. |

The palettes were checked with a colour-vision simulation (Machado et al. 2009, full severity). Each table shows the closest pair of glowing ores, in CIELAB ΔE; under ~10 means easily confused.

**What you see: the average colour of each ore's surface, measured in game**

| | normal | protan | deutan | tritan |
|---|---|---|---|---|
| Game default | 8.4 | 6.5 | 8.4 | 9.0 |
| **Colorblind-safe** | **46.1** | **25.6** | **35.6** | **23.7** |

**Glow colours alone**

| | normal | protan | deutan | tritan |
|---|---|---|---|---|
| Game default | 8.0 | 7.2 | **0.6** | 6.2 |
| Okabe-Ito | 35.1 | 22.7 | 17.0 | 17.0 |
| Colorblind-safe | 35.9 | 35.9 | 35.9 | 35.9 |

### Surface recolouring and your graphics card
The game ships ore textures compressed for the GPU. To recolour them, the pack decodes them with the game's own decoder. This adds about 2 seconds to loading and uses about 85 MB more video memory. On a weak GPU, untick **Recolour ore surfaces too** in the F10 panel; the glow and trail colours still change. If decoding ever fails, the game keeps its original textures.

Each ore keeps its character: ice stays pale, neutronium blue, crystal purple, dark matter green, plasmite fiery orange and antimatter yellow. Dark ores stay dark.

Changes apply **live**, with no restart. Switching surface recolouring on takes about a second, the first time.

### Multiplayer (co-op)
The pack only changes what **your** screen shows, so each player can pick their own palette, and players without the mod can join you as normal.
- It never touches the game's world-generation or meshing code, so the asteroid is built exactly as in the stock game for everyone.
- Co-op only checks that everyone runs the same game version. The mod doesn't change the version.

### Your own colours
Edit `mods\accessibility\settings.json`:
```json
{
  "palette": "custom",
  "custom": {
    "ice":        { "glow": "#ffffff" },
    "antimatter": { "glow": "#ff00ff", "trail": "#ff80ff" },
    "iron":       { "trail": "#ff0000", "rgb": "#a05030" }
  }
}
```
The ores are `ice iron nickel titanium gold crystal plasmite neutronium darkMatter antimatter`. For each one you can set:
- `glow`: the glow colour (glowing ores only)
- `trail`: the dig trail colour (follows `glow` if left out)
- `tex`: the surface colour (follows `glow` if left out)
- `texMix`: how strongly to recolour the surface, from `0` (original) to `1` (full); the default is `0.9`
- `rgb`: the base voxel colour

## Interface size
Sizes are 100%, 115%, 130%, 150% and 175%, and changes apply right away. The game's menus and HUD are sized in `rem`, so they scale cleanly. A few in-game computer screens use fixed pixel sizes and stay the same.

## If something stops working after a game update
The panel shows whether all of the ore-colour patches applied. If some didn't, the game's code changed. The rest of the pack still works, and the game itself is unaffected.
