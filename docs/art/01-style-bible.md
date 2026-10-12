# Art 01: The style bible

**Written 2026-10-12 by the art agent (the Claude that drew everything in `data/art/`, called "Claude Design" in some older docs).** This is the page to read before drawing, importing, or judging any pixel. The per-area docs (`02` onward) say what exists; this one says *how it is made and why*, so new art matches old art without anyone having to guess.

Where this page and `06-art.md` disagree, `06` is the palette log for the engine's dev art and this page is the rulebook for the drawn art. Nothing here overrides `00-vision.md`.

## The look in one paragraph

Cosy, slightly spooky autumn: chunky readable shapes, muted harvest colours, a dusky cool shift in the shadows, a little rot at the edges. Habbo-flat, not painterly: a few big flat shades per material, never gradients, never dither. Saturation lives in a few accents (crimson, harvest yellow, firelight); the ground and walls stay quiet. The test from `06`: *what would a peasant zombie be standing in?* Muted, cool-shifted, a little dusky.

## The seven hard rules

1. **Hard pixels only.** Every pixel is fully opaque (alpha 255) or fully transparent (alpha 0). No anti-aliasing, no soft shadows, no glow halos. Every delivery has been checked by script (`set(unique(alpha)) <= {0, 255}`).
2. **Light comes from the top-left.** Tops are lightest, the left-facing (`+Y`) faces are lit, the right-facing (`+X`) faces are in shade. Highlights sit up-left on round things, the darkest edge sits down-right. A mirrored sprite lights the wrong side; where that matters, the art is drawn twice (pumpkins, farm furrows, staff angles) rather than mirrored. Where nobody would notice at 1x, mirroring is fine and is what the engine does (bed, table, fireplace, chair).
3. **Three or four flat shades per material** (trees get five: outline, shadow, base, light, glint). Each piece has a lit side, a shade side, and a darkest-of-its-own-colour edge on the lower or outer side so it pops against what is behind it. Never pure black for that edge (except the interactable outline, below).
4. **Interactables get a dark outline; decoration does not.** Anything the player can use or click (furniture, the well, doors, shutters, boards, crops, mushrooms, rocks, pumpkins, items, cursors) has a 1 px `#2b2522` outline all the way round. Walls, floors, ground, and trees are not outlined in that colour (trees carry their own darkest ramp tone as an edge). This is Michael's law, recorded in `02` ("gatherables").
5. **Flat, unlit art.** The engine lights everything per pixel from one function. So the art carries **no baked ground shadow, no baked glow, no baked flame light, no halo**. Flames, glows and sparks that the engine will light are drawn as separate unlit frames (see `10-lighting-from-the-art-side.md`).
6. **Drawn at final size, never scaled.** The game shows one art pixel per screen pixel and zooms the whole frame on the GPU **(three levels, 1.1, 1.8, and 2.7, not whole numbers: the engine's correction, `src/view.js`; the rule stands because art is never scaled by the artist or by `drawImage`)**. Anything enlarged by 1.5x either blurs or goes lumpy. The first tree sheet was drawn too small and had to be redrawn natively bigger (`15b`); that lesson is why every later set was drawn at the size it ships. The detail goes into more clumps and more highlights, not bigger pixels.
7. **2:1 isometric.** Tiles are 64x32 diamonds. A circle on the ground is an ellipse twice as wide as tall. Flat things (leaves, twigs, pebbles) are seen from above at an angle and are foreshortened; upright things (mushrooms, flowers, tufts, trees, furniture) are seen from the front with their base on the bottom row.

## Scale reference

| Thing | Size | Notes |
|---|---|---|
| Ground tile | 64 x 32 px diamond | a tile edge is 32 px along the screen diagonal and 16 px down it |
| Character | about 55 px tall with hair, about 26 wide | frame 48 x 72, feet anchor (24, 66); **older briefs say 48 px, which is stale** (`25`) |
| Held item grip | hand is about 14 px above the feet and 9 to 10 px out from the body | the grip pixel of every item lands here |
| Wall | 80 px tall; stone 16 thick, wood 14, log 18 | settled 2026-10-11 after 64 (too short) and 96 (too tall) |
| Doorway | 20 px across the edge, 48 px tall | window 16 across, sill 22, top 51 |
| Furniture | bed 97 x 75, table 91 x 64, chair 39 x 44/51, well 74 x 104, fireplace 83 x 91 | footprints in `06-village-furniture-and-fixtures.md` |
| Trees | oak 82..158 x 103..198, spire 71..130 x 112..212 | three sizes, two shapes, `02-trees.md` |
| Decals | 5 to 48 px | pebbles smallest, leaf piles and mushrooms largest |
| Inventory cell | 19 px, shown at exactly 2x (38 px) | `07-items-and-icons.md` |

## Geometry cheat sheet (from `iso3d.py`)

World units: X and Y run along the ground grid, one unit is one screen pixel horizontally; Z is height in pixels.

```
screen x = X - Y
screen y = (X + Y) / 2 - Z
depth    = X + Y + Z        (toward the camera)
```

A tile is 32 x 32 world units. Tile (0,0) has its top vertex at (0,0), right vertex (32,16), bottom (0,32), left (-32,16). `+X` runs to the lower right of the screen, `+Y` to the lower left.

**Wall orientation names** (confirmed 2026-10-11, and the first brief had them swapped, so be careful):
- **north** = the tile edge from its **top** vertex to its **right** vertex. It runs `\` on screen, along world X. It is a room's *back-right* wall.
- **west** = the tile edge from its **top** vertex to its **left** vertex. It runs `/` on screen, along world Y. It is a room's *back-left* wall.
- If anything ever comes out mirrored, swap the two names. Nothing else changes.

## Anchors and naming

Every delivery says where each sprite sits. The conventions in use:

| Kind | Anchor means | Where it is recorded |
|---|---|---|
| Walls, posts' neighbours, leaves, shutters, boards, furniture, crops, floors | the pixel in the PNG where the **tile's top vertex at ground level** sits | `anchors_*.json` per delivery (`anchorVertex: "top"` in the loader) |
| Posts | their own centre at ground, placed on the grid vertex where walls meet | `anchors_walls.json` |
| Trees | trunk base centred horizontally on the bottom row of the image, with 6 transparent rows below the trunk; the engine measures the anchor four rows above the trunk's lowest pixel | engine re-measures; no JSON |
| Pumpkins and jack-o'-lanterns | the ground point under the centre, i.e. the engine's tile-centre convention | `anchors_pumpkins.json` (`ground_anchor_px`) |
| Decals | upright ones stand on their base point; flat ones centre | `data/ground.json` (`"stand": true`) |
| Held items | `grip_px`: the pixel that sits on the hand, from the PNG's top-left | `items.json` |
| Fireball | pixel (32, 32) of every 64 x 64 cell: the centre of the head | `items.json` |
| Cursors | hotspot (4, 0) at 1x, from the top-left | `cursors.json` |

**File names** are `<thing>_<variant>_<orientation or index>.png`, lower case, underscores. Orientation words are `north`/`west`, `left`/`right`, `lit`/`unlit`; variants are `plain`, `door_shut`, `door_open`, `window_shut`, `window_open`; indexes start at 0. Items ship as a pair, `<name>_world.png` and `<name>_icon.png` (Michael's rule, 2026-10-12: *every item delivery contains both*).

## Palettes in use

Muted autumn, never neon. These are the values that ship; `06-art.md` has the engine's dev palette alongside.

| Material | Tones (dark to light) | Where |
|---|---|---|
| Interactable outline | `#2b2522` | everywhere an outline is wanted |
| Grass | `#34462c` `#405434` `#4b5f3d` `#586e44` `#687e4c` | ground, tufts; base `(75, 95, 61)` |
| Wood wall | `#6e4b32` planks, dark sill beam | walls |
| Stone wall | `#7b7670` fitted stones | walls |
| Log wall | `#8a5e36` logs, clay chinking | walls |
| Door and shutter wood | `#5e4028`, metal strips `#2b2a32` / `#4a4952` | all leaves, one wood on every building |
| Wood floor rows | `#5e452f` `#654a32` `#59412c` `#62482f`, gap `#3a2a1c` | floors |
| Furniture wood | tops `#7d5a3c`/`#77553a`, left `#6a4a30`, right `#4f3622` | furniture |
| Soil | `#2a1d14` `#3a2a1d` `#4a3524` `#58402c` `#664b34` | farm |
| Water | `#293f4c` `#2c4451` `#304957`, ripples `#4a6b7c` / `#6f8e9c` | water |
| Pumpkin | `#6e2e12` `#9c4419` `#c2601f` `#d77e33` `#e8a052` | pumpkins |
| Fire | `#b8401c` `#e07a26` `#f2b33e` `#f8dc7a` | pumpkin glow; fireball ramp is its own, `07` |
| Steel | `#eef0f4` `#c6cad2` `#9ea2ac` `#6e7280` | knife, axe |
| Brass | `#d8b35a` `#9a7430` (items), `#e2c06a`/`#c39a44`/`#8a6a2a` (staff) | items |
| Leather | `#6c4b30` `#432d1e` | grips |

Tree ramps (harvest and gloom) are in `02-trees.md`; decal ramps in `03-ground-and-decals.md`.

## How things were made, and which method for what

Two methods, picked by size. This is the single most useful lesson of the whole project.

1. **Procedural geometry** (`iso3d.py`, a small z-buffered face rasteriser, plus per-face shader functions) is right for **big shapes with texture**: walls, floors, furniture, the well, the pumpkin. Textures are patterned in *world* coordinates, so planks, courses and furrows run unbroken across faces, edges and neighbouring tiles. Variants are re-rollable by seed.
2. **Hand-pixelled ASCII grids** with a palette dict are right for **small sprites (under about 20 px)**: cursors, the knife and axe, the book. Procedural geometry turns small things to mush; a person deciding each pixel does not.
3. **Fresh rasterisation at every angle** is right for **anything that turns**: the staff at 0/22.5/45/67.5/90 degrees and the fireball at 16 directions are each drawn from the shape, never rotated by nearest pixel. Nearest-pixel rotation of pixel art looks broken (jagged strokes, doubled pixels); flipping is clean and is what covers the other angles.

All generators are plain Python with numpy and PIL and are deterministic (seeded). A re-roll or a new size is a script run, not a repaint. See `11-open-items-and-lessons.md` for where the scripts live.

## Things that went wrong, so they do not again

| What | Why | The rule |
|---|---|---|
| First tree sheet blurry in game | drawn small, enlarged 1.5x by the loader | draw at final size; extra pixels go into detail |
| First decals read as "MS Paint spray paint" | 2 x 1 px leaf specks next to 200 px trees | fewer, bigger, readable pieces with a shape, a lit side, and a shade side |
| Procedural cursors looked like capsules | geometry at 15 px | hand-pixel anything this small |
| Checkerboard on a 45 degree cursor | per-part shading disagreed | one shading rule per object |
| Book via `iso3d` was mush at 14 px | geometry at that size | hand-pixel it |
| Staff claws read as a closed ring | gap too tight at 1x | claws must curl open with at least a pixel of daylight |
| Zombie slime drip read as a green blob on green skin | same hue as the skin | accents need contrast against what they sit on |
| Boards in warm brown vanished on log walls | same hue as the logs | boards are weathered grey-tan, which stands apart from warm logs, dark wood and cool stone |
| Weird wall tops and "geometry flukes" at night | **not an art bug**: the engine's overlay and per-sprite alpha | see `10-lighting-from-the-art-side.md` |

## Checklist before any art is handed over

- [ ] Alpha is only 0 or 255 (script it).
- [ ] Light is top-left; the lit and shade faces are on the right sides.
- [ ] Interactable? Then a 1 px `#2b2522` outline. Decoration? Then none.
- [ ] No baked ground shadow, glow, or halo.
- [ ] Drawn at the size it will be shown.
- [ ] Anchor recorded in the delivery's JSON, from the PNG's top-left.
- [ ] Previews at 1x and 3x with a character beside it for scale.
- [ ] If it is an item: both `_world` and `_icon`, the icon on a canvas of exactly the bag footprint.
- [ ] Tight crop. File names match the convention.
