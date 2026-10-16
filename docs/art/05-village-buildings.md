# Art 05: Walls, posts, openings, boards, floors

**Status: in the game and played** ("looks and works great", Michael, 2026-10-11). Files in `data/art/village/`. The plumbing is `history/17-village-art-build.md`; the briefs that asked for this are `16` and `18`. This page is the art side. Written 2026-10-12.

## Pieces

Everything is hard-pixel, tightly cropped, drawn at 1:1, with an anchor on the **tile's top vertex at ground level** (`anchors_walls.json`; log anchors `[9, 85]` north and `[41, 85]` west, wood `[7, 84]` and `[39, 84]`).

| Set | Files | Notes |
|---|---|---|
| Wall segments | `wall_<wood|stone|log>_<north|west>_<plain|door_shut|door_open|window_shut|window_open>` (30) | one tile edge long (32 px along the edge), 80 px tall. PNG sizes: wood 47 x 104, stone 49 x 105, log 51 x 106 |
| Corner posts | `post_wood`, `post_stone`, `post_log` | the wall's thickness square, a pixel proud; 33 x 98 / 37 x 101 / 39 x 99 |
| Open door leaves | `door_open_<wood|stone|log>_<north|west>` | swung 90 degrees outward toward the camera, 28 x 60 or 61 |
| Open shutters | `shutter_<left|right>_<mat>_<o>` | folded back 160 degrees against the outside face; 10 or 16 wide, 34 to 37 tall |
| Far-side leaves and shutters | `door_open_far_<mat>_<o>`, `shutter_far_<left|right>_<mat>_<o>` | real away-swings, drawn *before* the wall and only when the wall is translucent |
| Board overlays | `boards_<door|window>_<north|west>_<1|2|3>` | 12 files, one set for every material |
| Floors | `floor_<wood|stone>_0..3` | 64 x 32 diamonds |

The orientation names are the trap here: `north` is `\` (top vertex to right vertex, a room's back-right wall) and `west` is `/` (top vertex to left vertex, the back-left wall). See `01-style-bible.md`.

## Walls

| | Thickness | Pattern | Colour |
|---|---|---|---|
| Wood | 14 | vertical planks 6 to 7 px wide, a dark sill beam (bottom 8 px), a plate beam under the cap, nails, a timber header over the door | `#6e4b32` |
| Stone | 16 | 8 px courses of fitted stones 7 to 14 px long (larger than the old bricks, as invited), capstone row on top, a long lintel over the door, a stone threshold | `#7b7670` |
| Log | 18 | five stacked 16 px round logs, each with a lit top and shaded underside; clay chinking, bark flecks; cut log ends with growth rings at the near end and inside the openings | `#8a5e36` |

- **Centred on the edge line** (not on one side of it, as the old generated walls were).
- **Seamless:** patterns repeat every 32 px along the wall so segments butt end to end. Each sprite includes its near end face, which the next segment covers when drawn after.
- **Walls are not outlined.** Closed doors and shutters get a dark inner outline because the player uses them.
- **The cap** (the top face) is part of the sprite. The engine redraws it from the same picture with the sky's light so a lit room's back walls keep dark caps at night (ruling 3 in `17`); the art needs nothing special for that, except that the cap must be an exact parallelogram so the redraw covers it.
- **Doorway:** 20 px across, 48 px tall from the floor. The open doorway shows the wall's thickness (the jamb facing the camera) and a threshold slab; the opening itself is transparent.
- **Window:** 16 px wide, sill at 22, top at 51. A deep stone sill that juts 2 px out so its flat top reads as a shelf, a timber frame 1 px proud. The open window is transparent through the opening; the shut one has two plank shutters inside the frame.
- Opening heights are fixed from the floor, whatever the wall height (door 48, window 22 to 51, torch bracket 32), so changing wall height only adds wall above them.

## Posts

A post covers the join where walls meet or end. Corner pieces: stone is a quoin pillar with alternating corner stones and a cap slab; wood is a square timber on a stone plinth with a cap; log is crossed log ends (the notched cabin corner) with courses alternating direction.

**Material rule (the designer's, adopted in `17`):** a post also stands wherever the **material changes along a straight line**, in the heavier material: **stone over log over wood**. The three thicknesses (16, 18, 14) leave a step in the cap where two meet end to end, and the heavier post covers it. At a corner where two materials meet, the heavier material's post. Lone segments need no end piece: the posts at their ends finish them.

## Open leaves and shutters

- **Door leaf** swung 90 degrees outward, hinged at the jamb nearer the top of the screen so it never covers the doorway. A 3 px free edge (lighter than the face), a 1 px top highlight, two strap hinges with knuckles, a face one shade darker than the closed door (it has turned away from the light). One set per material because the wall faces differ (8 vs 7 px from the edge line for wood and stone; 9 px for logs).
- **Shutters** folded back 160 degrees, almost flat against the outside wall: foreshortened face, 1 px edge strip, hinge marks. `left` and `right` are screen sides.
- **Door and shutter wood is the same plank wood on every building** (`#5e4028`, metal `#2b2a32` with `#4a4952` highlight), outlined all round.
- **Not baked in:** cast shadows on the ground and wall. Those stay engine polygons (and open leaves do not cast a shadow yet; the old engine had none either).
- **Far-side leaves** are the exception to "draw nothing when the leaf swings away": they exist for a door seen through a wall the game draws translucent (an interior door seen from inside). Sort key is the wall's minus 0.5; near-side leaves, shutters and boards are the wall's plus 0.5.

## Board overlays

Players nail planks over openings; the dead break them one at a time. One, two or three planks, each about 5 px tall, crossing the opening at a 1.5 to 2.5 px tilt, ends overlapping the frame by 3 to 4 px, one dark nail at each end, outlined (the player uses them). One plank at mid-height, two at the quarter and three-quarter heights, three add the middle.

- **Colour:** weathered grey-tan, `#b5a27e` lit and `#8d7b5f` shade. It was chosen because it stands apart from dark wood, warm logs and cool stone; the first warmer brown vanished on logs.
- Anchored exactly like the wall segment they cover; drawn right after it. They sit just proud of the log wall's face (9 px), the thickest, so they are never inside any wall. One set serves all three materials.
- Sizes: door boards 32 wide, 20 / 46 / 44 tall (north) and 25 / 47 / 49 (west); window boards 28 wide, 18 / 35 / 33 and 23 / 36 / 37.

## Floors

`floor_wood_0..3`, `floor_stone_0..3`: 64 x 32 diamonds. **Every pixel was patterned in world coordinates**, so any variant meets any other across all four edges; the engine picks a frame by hash.

- **Wood:** planks run along world X (the `\` direction), 8 px wide. Row tones are the same in every variant (`#5e452f` `#654a32` `#59412c` `#62482f`, gap `#3a2a1c`, grain `#523c28`, highlight `#6e5238`), so the grid disappears. Butt joints with nails and knots vary by variant.
- **Stone:** flagstones whose joints always fall on the tile edges, split into one to four slabs per variant, with lit and shaded rims, a few cracks and chipped corners.
- Laid floors are **hard diamonds** that cover their tile; they do not blend with grass.

## Previews that double as acceptance pictures

The delivery included building cutaways and exteriors, door/window states, furniture and floors, and the placement tests (`place_alone`, `place_lines`, `place_lone`, `place_corners`, `place_tees_mixed`, `place_boards`, `place_far`) at 1x and 3x. They were assembled purely from the PNGs and anchors, so they are also a placement test: **the game should match them**. They live in Michael's `village_art(1)` download folder, not in the repo.

## Generators

`village.py` (walls, posts, leaves, shutters), `floors.py`, `village_preview.py`, on top of `iso3d.py`. Walls are modelled as boxes with per-face shader functions (`stone_shader`, plank shader, log shader), then rasterised by the z-buffer, so a new size, a new material or a new opening is a parameter change: `H_WALL = 80`, `THICK = {stone: 16, wood: 14, log: 18}`, `DOOR = (6, 26, 48)` (along-wall from, to, height), `WIN = (8, 24, 22, 51)`. Changing wall height or opening size means re-running the script and re-importing, which is cheap.

## Open items

- Not in the set, by design: the **chest, barrel, campfire, torch post** (still generated by the engine), **broken** variants (the engine draws `window_open` for a broken window), **stubs** (`09-stubs.md`).
- **Cast shadows from open leaves** are not drawn by the engine yet.
- **Far-side leaves** have not been checked in play (the valley's buildings have interior partition doors since 2026-10-12, so they can be now).
- **Roofs** are not drawn and not foreclosed: the cap being inside the sprite does not stop a roof layer, but a clean path would be a separate cap layer request.
- **Upper floors:** walls already carry a layer; the art is a picture of an edge on a layer.
- **Doors that open away from the player** inside buildings, and double doors, have no art.
