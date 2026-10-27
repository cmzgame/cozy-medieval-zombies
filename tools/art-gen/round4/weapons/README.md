# Art round 4, group A: weapons

Everything is made by `gen.py` (`python gen.py`, plain Python 3 with PIL and numpy, deterministic, no randomness).
It writes the 43 PNGs to `out/`, and `manifest.json`, `preview.png` and `preview_more.png` (round 4b's pieces) here. Nothing was written into the game's repository.

## Method

- **Long weapons (sword, mace, halberd, spear)** are drawn from their shape at each angle (0, 22.5, 45, 67.5, 90 degrees clockwise, head toward the right), never rotated by pixel. They are described in the item's own coordinates: `v` runs up the item, `u` across it, and `-u` is always the lit side. Upright and flat pictures use the pixel-centre rule. The tilted ones sample each pixel 3 by 3 and take whatever covers most of it. That is still a hard pixel, not a blend; it just keeps a tilted blade one width along its length.
- **The arrows** are hand-pixelled ASCII grids (10 px wide), because the style bible says to hand-pixel anything this small.
- **The shield** is drawn with masks on its 38 px canvas.
- **The bow** uses the same shape rasteriser: upright for the icon, at 45 degrees for the portrait.
- **House rules:** hard alpha only (the script checks every file). Every piece has a 1 px `#2b2522` outline. Light comes from the top left. The palettes are the house's: steel `#eef0f4 #c6cad2 #9ea2ac #6e7280`, iron `#8a8c96 #5e6068 #3e3f46`, brass `#e2c06a #c39a44 #8a6a2a`, wood `#9a6a42 #7a5132 #57381f`, and the wraps `#7a5638 #5a3c25 #3e2818`. The sword's leather is `#8a6a3a` (the generated grip colour) `#6c4b30 #432d1e`. The halberd is a paler ash, `#b89668 #96744a #6c5032`. The bow is yew: sapwood `#e6d2a2` and heartwood `#c8783e #a65a2e #7a3e20`.
- **Icons follow round 3's convention** (the plank, stick, hatchet, and shovel icons): the same design rendered to fill the bag footprint with about a 1 px margin. **Portraits** show the thing on the 45 degree diagonal, which fills the 38 px slot better than upright.

## Files (in `out/`)

| Item | Icon | World (angles) | Grips (x, y), 0 / 22.5 / 45 / 67.5 / 90 | Portrait |
|---|---|---|---|---|
| sword | 19x57 | 13x36, 16x33, 27x27, 33x16, 36x13 | (6,28) (4,25) (6,20) (7,11) (7,6) | 38x38 |
| mace | 19x38 | 13x33, 18x31, 26x26, 31x18, 33x13 | (6,25) (4,23) (6,19) (7,13) (7,6) | 38x38 |
| halberd | 19x95 | 20x80, 33x74, 57x57, 74x37, 80x20 | (10,68) (5,63) (8,48) (10,31) (11,10) | 38x38 |
| spear | 19x76 | 9x57, 24x52, 41x41, 52x24, 57x9 | (4,33) (10,30) (17,23) (21,13) (23,4) | 38x38 |
| shield | 38x38 | `shield_world` 19x19 (fixed, `swing: false`); `shield_guard` 21x21 | held (9,12), 3 px below the centre (9,9); guard (10,6), 4 px above the centre (10,10) | 38x38 |
| bow | 38x57 | by facing (`mode: "facings"`, `pose: "bow_rest"`): 6x29, 6x29, 7x29, 8x29, 9x29 | (3,14) (3,14) (4,14) (5,14) (6,14) | 38x38 |
| arrow | 19x38 | `arrow_world` 5x24 (fixed) | (2,12), the shaft's middle | none |
| fire_arrow | 19x38 | `fire_arrow_world` 5x24 (fixed) | (2,12), the shaft's middle | none |

World files are `<id>_world.png`, `<id>_world_22_5.png`, `_45`, `_67_5` and `_90`. Every grip pixel was checked by script and lands on the leather wrap at every angle. In `manifest.json` the `held` blocks are in the brief's shape (`mode: "angles"`). `world_sizes` and `notes` are extra fields.

## The designs

- **sword:** an arming sword 36 px long with its outline, a bit more than half the 55 px figure. It has a steel blade with a dark fuller, a straight brass cross with a lit top, a wrapped leather grip, and a round brass pommel. The grip is the middle of the wrap.
- **mace:** a flanged iron head with two flanges in profile, one face on as a lit ridge, and dark grooves between them. It has a short top point, a wooden haft, a leather grip wrap, and an iron butt cap.
- **halberd:** 80 px long. It has an ash pole with an iron shoe, a leather grip near the butt (where the generated halberd is held, so it reaches), iron langets, a socket, a convex axe blade with a bright honed edge and upper and lower points, a back hook that curls down, and a long square top spike. The blade is on the left when upright (the lit side, like the hatchet), so it is on top when the halberd lies flat.
- **spear:** 57 px long. A slim shaft, a cord binding at the balance (the grip), an iron socket, and a leaf-shaped head with a midrib.
- **shield:** round, 36 px across. Vertical planks with seams and grain, an iron rim with ten rivets, an iron boss with its own outline ring and a glint. The icon and the portrait are the same picture.
- **bow:** a strung yew self bow. Pale sapwood back, orange heartwood belly, dark nock tips, a leather grip wrap, and a pale string.
- **arrow:** an iron leaf-bodkin head, a pale two-tone shaft, shield-cut grey goose fletching with barring, two bindings, and a dark nock. It is placed 3 px left of centre and 1 px up, so the lower-right corner stays clear for the stack count.
- **fire_arrow:** the same arrow with a sooty pitch rag bound behind the head: cord turns, a frayed end, two ember pixels (`#c2601f`) and one glow pixel (`#e8a052`). It carries no baked glow.

## Compromises

- **The halberd icon is drawn at 0.9x.** At 1x its head is 20 px wide, one more than the 19 px cell, so the icon uses 0.9x with the pole lengthened to fill the five cells. Its portrait has the head at 1x on a shortened pole (26 px instead of 58).
- **The spear's icon and portrait lengthen and shorten the shaft.** The icon shaft is longer to fill 76 px and the portrait shaft is shorter, both at 1x scale, because scaling a 9 px wide spear would turn it to mush.
- **The sword's 22.5 and 67.5 tilts read a little like a curved blade near the point.** At those angles one edge of the point is almost vertical or horizontal on screen, which is correct geometry. A longer point and the area rule reduced it without removing it. Upright, 45, and flat look clean.
- **The mace's flange grooves become a little busy at 22.5 and 67.5.** The silhouette still reads as a ribbed head on a haft.
- **The bow's 0 and 22.5 facings are the same picture.** Their belly offsets (1.5 and 1.7 px) both round to a 2 px string column, and the string is kept on a whole pixel so it stays a clean line. At 45, 67.5 and 90 the offsets are 3, 4 and 5 px. At 90 there is one pixel of daylight between the string and the riser; at the others the outline closes the gap.
- **The small shields drop the rivets** and use 4 px planks and a smaller boss, because ten rivets at 17 px would only be noise.

## Round 4b: the pictures in the hand (the pair rule)

- **`arrow_world`, `fire_arrow_world`:** the icon's design at 1x with a one-pixel shaft, point up, 5x24, hand-pixelled. They are held fixed, gripped at the shaft's middle.
- **`shield_world`:** the shield as held at rest, a 17 px disc that is 19 px with its outline, the same design as the icon. It is held fixed with `swing: false`, gripped 3 px below the disc's centre.
- **`shield_guard`:** the shield raised to block, a 19 px disc that is 21 px with its outline. It sits in the manifest's shield entry as `guard`, gripped 4 px above the disc's centre.
- **`bow_world`, `_22_5`, `_45`, `_67_5`, `_90`:** the bow by facing, each standing upright with 27 px of bow (29 with the outline). The riser bows out to the right by about 4.5 sin(angle), at least 1.5. The tips curve back to the left, and the string runs straight on the left. The belly (left) shows the heartwood and the back (right) the shaded sapwood. The grip is the riser's middle pixel, on the leather wrap. The engine mirrors these for facing left.
- **`preview_more.png`:** these pieces at 1x and at 3x with the grip boxed red, then the arrow, fire arrow, shield (held and raised) and bow at 90 on the figure's hand at 3x.

## preview.png, top to bottom

1. **Bag icons** at 2x on the slot colour `#2a2622`, with the cells drawn faintly: sword, mace, halberd, spear, shield, bow, arrow, fire_arrow.
2. **Portraits** at 2x: sword, mace, halberd, spear, shield, bow.
3. **World angles** at 3x on grass, one row per weapon (sword, mace, halberd, spear) at 0, 22.5, 45, 67.5 and 90 degrees. Each is labelled with its size and grip, and the grip pixel is boxed in red.
4. **In the hand** at 3x: each weapon at 0 and 45 degrees with its grip on the right hand of the 55 px figure. The figure is taken read-only from the repo's `docs/art/previews/preview_items_3x.png`, with its throwing knife and the neighbouring figure painted out.


**Engine correction (2026-10-26, Claude Code, the review of #514):** the generated raised guard's disc is centred on its anchor, not 4 px below it (`figure/held.js` samples it about (16, 20), the disc's centre), so the guard's grip in the game is (10, 10), the disc's centre, not (10, 6); `data/items.json` says so.
