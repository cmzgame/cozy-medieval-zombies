# The walls at 96 px (docs/art/13), 2026-10-27

Every wall was redrawn by rerunning copies of the generators that drew the 80 px set, with the brief's three numbers changed. The files have the same names and the same flat layout as `data/art/village/` today. Nothing was painted by hand, and nothing in the repository was touched.

## What is here

| | Count | Names |
|---|---|---|
| Wall pictures | 80 | `wall_<wood|spruce|mahogany|winterpine|bloodbark|daub|log|stone>_<north|west>_<plain|door_shut|door_open|window_shut|window_open>.png` |
| Posts | 8 | `post_<material>.png`, one per material, `post_daub` included (today's layout has it; it is oak's post with the daub swap) |
| Leaves and shutters | 84 | seven materials (daub uses oak's) × two sides × `door_open`, `door_open_far`, `shutter_left`, `shutter_right`, `shutter_far_left`, `shutter_far_right` |
| Boards | 12 | `boards_<door|window>_<north|west>_<1|2|3>.png`, one shared set |
| Anchors | 2 | `anchors_walls.json` (village.py: oak, stone, log, their parts, the boards; 81 entries) and `anchors_woods.json` (woods.py: the four woods and daub; 103), each `{anchor_px, size}`, anchored at the tile's top vertex at ground (`anchorVertex: "top"`), posts on their own centre, as before |
| Tones | 1 | `wood_tones.json`, regenerated. It is identical to round 4's, because the tones did not change. |
| Previews | 28 | `previews/`, 1x and 3x (listed below) |

That makes 184 game PNGs. `MANIFEST` lists every file with its byte size and pixel size.

**Sizes and anchors, one plain wall per side** (every variant of a side is the same):

| Material | North | West | 80 px set |
|---|---|---|---|
| oak, spruce, mahogany, winterpine, bloodbark, daub | 47 × 120, (7, 100) | 47 × 120, (39, 100) | 47 × 104, (7, 84) / (39, 84) |
| stone | 49 × 121, (8, 100) | 49 × 121, (40, 100) | 49 × 105, (8, 84) / (40, 84) |
| log | 51 × 122, (9, 101) | 51 × 122, (41, 101) | 51 × 106, (9, 85) / (41, 85) |

- **Posts:** oak (and the woods, daub) 33 × 114 at (16, 105); stone 37 × 117 at (18, 107); log 39 × 115 at (19, 105). Each is 16 taller than before.
- **Door leaves:** 28 × 76 or 77, and each anchor is the old one plus 16.
- **Shutters:** 11 px taller than before, and each anchor is the old one plus 13 (the sill rose 2 and the top 13).
- **Boards:** the same widths. Door boards are 20 / 54 / 52 tall (north) and 25 / 55 / 57 (west); window boards are 18 / 40 / 38 and 23 / 41 / 43. Their anchors moved by different amounts.

**Read every anchor from the JSON, and never add 16 by rule:** the shutters and the boards did not move by 16. The engine's `data/sprites/wall_*.json`, `wall_parts_*.json` and `wall_boards.json` take these anchors under their own keys (`north_plain`, `leaf_north`, `shutter_far_left_west`, `boards_door_north_2` and so on).

## What changed in the generators, and why

The generators are kept beside this folder in `../gen/`. `../gen/build.sh` reruns everything, from the generators to this folder and the checks, in one go.

**`village.py`** (a copy of `tools/art-gen/village/village.py`):

1. **The brief's numbers.** `H_WALL = 96`, `DOOR = (6, 26, 64)`, `WIN = (8, 24, 24, 64)`. `THICK` is unchanged. Setting `WALL_SET=80` in the environment restores the old three numbers.
2. **The strap hinges were the only hard-coded numbers that the new height broke.** On the 80 px set the door leaf's two metal straps sat at 9 and 34 up a 46 px leaf, with their knuckles at 11 and 36, and the shutters' straps at 5 and 21 up a 28 px shutter, with knuckles at sill + 6 and sill + 22. These numbers appeared four times: in the shut door, the open leaf, the shut window and the open shutter. Left alone, the 62 px leaf would have had both straps in its lower half. They are now `DOOR_STRIPS = [9, leaf height − 12]` and `SHUT_STRIPS = [5, shutter height − 7]`: each strap keeps its distance from its own end of the leaf. That gives 9 and 50 on the door, and 5 and 32 on the shutter.
3. **No other number moved.** The courses (stone every 8 px, logs 16 px, wood planks with a sill beam and a plate beam that hang off `H_WALL`), the lintel, the threshold, the sill, the frame, the cap, the posts (built to `H_WALL`), the boards (placed at fractions of each opening) and every palette all follow by themselves.
4. **The output folder can be set** with `WALL_OUT`.

**Proof that only the height moved:** with `WALL_SET=80`, the edited `village.py` rebuilds all 81 of the archive's files pixel for pixel, with an identical `anchors_walls.json`. The unchanged `woods.py`, run on that rebuild, gives all 103 wood files and `wood_tones.json` pixel for pixel too. So the copies are the generators that drew the shipped art, and the 96 set differs from it only through the three numbers and the straps.

**`woods.py`** (a copy of `tools/art-gen/woods_rugs_paintings/generators/woods.py`): the only change is that `WOODS_REFS` and `WOODS_OUT` say where to read the new oak set and where to write. It is run on the new oak set, so spruce, mahogany, winterpine, bloodbark and daub are the same hex-for-hex swap as in round 4, at the new height.

**The previews:**
- **`village_preview.py` and `placement_preview.py`:**
  - Every canvas is 16 px taller, with the ground lines 16 lower.
  - `place_lines` is 100 px taller still: its west line ran off the top in the 80 set too.
  - They read the walls from here and the unchanged furniture and floors from the game.
  - The furniture and floor previews are left out, because nothing in them changed.
- **`preview_kit.py`** replaces the two imports that the archive cannot satisfy: `decals.grass_field` and `trees_v2.character` read outputs that were never kept.
  - The grass is the game's own `data/art/ground/grass_0..3.png`.
  - The figure is the starting outfit cut from `data/art/character/layers/preview_starting_outfit.png` (the south frame at 1x, its flat background keyed out), with a hair layer on top. It is 48 to the crown with the feet at (24, 66); `hair_mohawk` reaches 55.
- **`new_previews.py`** draws the two pictures the brief adds.
- **`../gen/compare.py`** draws the old-beside-new sheets.
- **`../gen/verify.py`** runs the checks and writes `MANIFEST`.

## The checks (`../gen/verify.py`; every check passes)

- **Counts:** 80 walls, 8 posts, 84 parts and 12 boards, 184 in all. Every name already exists in today's `data/art/village/`, and every one has an anchor.
- **Hard alpha:** every pixel of all 184 PNGs has alpha 0 or 255, and every PNG's size equals the size in its anchor file.
- **Sizes and anchors per material:** every variant of every side is the size and anchor in the table above. Each one is the old size and anchor plus 16 in height and 16 in anchor y, with the width and anchor x unchanged. The posts and door leaves are the same. The shutters are 11 taller with their anchor 13 lower, and the boards keep their widths and anchor x.
- **Only the height moved:**
  - Aligned on the anchor, the lower 40 px of every plain wall (all eight materials, both sides) is pixel for pixel the 80 px set's.
  - No new file uses a colour that its 80 px namesake lacks: same palettes, same textures, same outline rule. Walls are unoutlined, and the leaves, shutters and boards keep the 1 px `#2b2522` outline.
  - The doorway's see-through run on its centre line is z 10 to 56 (wood), 11 to 54 (stone) and 12 to 54 (log). In the 80 set it was 10 to 40, 11 to 38 and 12 to 38: the same foot, a top exactly 16 higher.

## The previews (`previews/`, each at 1x and 3x)

- `preview_building`, `preview_building_exterior`, `preview_doors`
- `place_alone`, `place_lines`, `place_lone`, `place_corners`, `place_tees_mixed`, `place_boards`, `place_far`
- **New:** `place_crates`. Three north runs (stone, oak, log), each with:
  - three dev crates (one-tile cubes, 32 px tall) stacked on the tile before the first segment, their top flush with the cap;
  - two crates on the next tile, their top level with the open door's top beside them;
  - the figure next to the open window.

  The crate is drawn for the preview only, as a plain outlined brown box. It is not game art.
- **New:** `place_doorway`.
  - Top row: the figure with the mohawk (55 px, the tallest hair) standing in every open north doorway, so its clearance under the door's top shows.
  - Bottom row: the figure beside every shut west window, with the sill at its waist and the top over its head.
  - The first two panels are the 80 px oak and stone, for the old look, and the rest are all eight materials at 96.
- `compare_old80_new96_north` and `_west`: every material and variant, old and new side by side on one ground line, with the open leaves and shutters in place.

## The brief's questions

0. **Depth images: not made.** Michael has not asked for them, and the depth buffer as specced (`docs/51`) works from planes. They would be a few lines in `iso3d.Scene.render` (keep `z`, write it out beside the picture) if he says yes.
1. **The window at 24 to 64: the width is kept at 16 (8 to 24).** The opening is 16 × 40, and it reads as a tall casement, which suits the village and gives the big sight and shot band Michael asked for. There is a geometric reason not to widen it: each open shutter is half the window, 8 px, folded back 160 degrees flat against the wall. It already reaches from the jamb to within half a pixel of the segment's end (8 − 7.5). A window even one pixel wider each side would push the open shutters past the segment's end, onto the neighbouring segment and under the corner post. Widening it would mean narrower shutters folding differently, which is a redraw, not a parameter.
2. **The door leaf at 64: four boards, as today.** The brief says six, but the generator draws four 5 px boards across the 20 px opening. The boards run vertically, so the height lengthens them and does not add any. The two strap hinges keep their distances from the leaf's ends (9 up, 12 under the top). That leaves 39 px between them, against 25 before, and it still reads as a plank door. A third, middle strap would be a one-line change (a third entry in `DOOR_STRIPS` and a third knuckle) if Michael wants one.
3. **The posts at 96: the same as today.** Each post is a square of the wall's thickness, a pixel proud, now 96 tall: the wood post on its plinth with its cap, the stone quoin pillar with its cap slab (12 courses), and the log notched corner (six courses). There is no new cap.

## What is weak, or for the integrator to know

- **The open window has no see-through pixels, in this set or the 80 set.** Seen from the camera's angle, a 16 px opening through a 14 to 18 px wall shows only its own jambs and sill. The README of 2026-10-11 says "transparent through the opening"; the pixels never were. This changes nothing, since sight through a window is the engine's rule and not the picture's, but it is worth knowing before anyone measures an open window's alpha.
- **The window reads tall and narrow at 16 × 40.** That is answer 1. It is the best this width allows without redrawing the shutters.
- **The figure and the grass in the previews are stand-ins built from the game's own art.** The originals' sources are not in the archive. The figure's hair is a layer from the delivery, not dyed.
- **The furniture and floor previews are not regenerated**, because nothing in them changed.
- **`post_daub` is delivered** because today's layout has it, although the brief lists parts for seven materials.
- **Not drawn, as the brief asks:** the fence, its gate, and the gate's boards (still 36 px); the furniture; depth images.
