# Village art: walls, doors, shutters, furniture, floors

Drawn for brief 16. Every PNG is hard-pixel (alpha 0 or 255 only), tightly cropped, drawn at 1:1.
Built with a small isometric 3D renderer (`iso3d.py`); the generators are included (`village.py`,
`furniture.py`, `floors.py`, `village_preview.py`), so any size or colour can be re-rolled.

## Orientation and anchors (read this first)

- **north** = runs top-left → bottom-right on screen ("\"), the tile edge from its **top** vertex to its **right** vertex (a room's back-right wall).
- **west** = runs bottom-left → top-right ("/"), the tile edge from its **top** vertex to its **left** vertex (a room's back-left wall).
- **Anchor:** `anchors_walls.json` and `anchors_furniture.json` give `anchor_px` for every sprite: the pixel in the PNG where the **tile's top vertex at ground level** sits. Draw the sprite so that pixel lands on the tile's top vertex on screen.
  - **Wall segments, door leaves, shutters:** all use the anchor of the tile whose edge they stand on. A leaf or shutter goes at exactly the same anchor as its wall segment.
  - **Corner posts:** `post_<stone|wood>` is anchored on its own centre. Put that on the grid vertex where walls meet.
  - **Furniture:** anchored on the top vertex of the footprint's top tile.
- **If anything comes out mirrored:** swap the `north` / `west` names. Nothing else changes.

## Walls: `wall_<wood|stone>_<north|west>_<variant>.png`

Variants: `plain`, `door_shut`, `door_open`, `window_shut`, `window_open` (20 files).

- **Size:** one tile edge long (32 px along the edge), 80 px tall. Stone is 16 thick and wood 14, centred on the edge line.
- **Faces:** the cap is the top face. The `west` ("/") walls' long face is in shade and the `north` ("\") walls' long face is lit, per top-left light.
- **Seams:** patterns repeat every 32 px along the wall, so segments butt seamlessly end to end. Each sprite also includes its near end face; the next segment covers it when drawn after.
- **Stone:** 8 px courses of fitted stones 7–14 px long, which is larger than your current bricks, as you suggested. It has a capstone row on top, a long lintel stone over the door, and a stone threshold.
- **Wood:** vertical planks 6–7 px wide, a dark sill beam (bottom 8 px), a plate beam under the cap, nails and a timber header over the door.
- **Doorway:** **20 px wide** along the edge (brief: about 19, widened for symmetry), 48 px tall. The open doorway shows the wall's thickness (the jamb on the side facing the camera) and a threshold slab. The opening itself is transparent.
- **Window:** 16 px wide, sill at 22, top at 51. It has a **deep stone sill** that juts 2 px out, so its flat top reads as a shelf you could set a pot on, plus a timber frame 1 px proud. The open window is transparent through the opening. The closed window has two plank shutters inside the frame.
- **No outlines on walls.** Closed doors and shutters get a dark inner outline, because the player uses them.

## Corner posts (proposed): `post_stone.png`, `post_wood.png`

These are a drop-in for the dev post.
- **Stone:** a quoin pillar with alternating corner stones and a cap slab.
- **Wood:** a square timber post on a stone plinth, with a cap.

They're the wall's thickness square and 80 tall, a pixel proud so they cover the join.

## Open doors and shutters (outlined)

- **Door leaves:** `door_open_<stone|wood>_<north|west>.png`. Swung **90° outward**, hinged at the jamb nearer the top of the screen so the leaf never covers the doorway. Each has a visible 3 px free edge, a 1 px top highlight, two strap hinges with knuckles at the jamb, and a face shaded for the plane it now faces. One set per material because the wall faces differ (8 vs 7 px from the edge line).
- **Shutters:** `shutter_<left|right>_<stone|wood>_<north|west>.png`. Folded back **160°**, almost flat against the outside wall, beside the window. Each has a foreshortened face, a 1 px edge strip and hinge marks. Left and right are screen sides.
- **Not baked in:** the cast shadows on the ground and wall. Those stay engine polygons, as the brief planned.

## Furniture (outlined, long side runs "/" along world Y)

| File | Footprint | Notes |
|---|---|---|
| `well.png` | 1×1 | Round fitted-stone wall with capstone rim, dark shaft with water, two posts, shingled gable roof, axle with a rope coil, crank on the near end, banded bucket. About 81 px above the ground. |
| `bed.png` | 2×1 (along Y) | Plank frame on legs, straw tick, patchwork quilt with a turned-down sheet, pillow, headboard at the far end (top-right), low footboard. About 26 px tall. |
| `table.png` | 2×1 | Plank top 22 px up on two trestles with a stretcher, knife nicks, candle stub. |
| `chair_front.png` / `chair_back.png` | 1×1 | Seat at 14, back at 31. Front = back on the far side; back = back on the near side. |
| `fireplace.png` | 2×1, back against a **west** ("/") wall | Stands 16 px (half a tile) out from the wall. Empty dark firebox with rounded corners and a stone lintel, corbels, an oak mantle at 44–48, a chimney breast to 56, a hearthstone in front. |
| `fire_0..2.png` | 18×16 | Three flame frames on crossed logs with embers, no glow. Place pixel (9, 15) on `fireplace.fire_base_px` from `anchors_furniture.json`. |

**Slicing 2-tile pieces:** the footprint is world X 0–32 × Y 0–64 from the anchor. The tile boundary is the line from world (0, 32) to (32, 32).

## Floors: `floor_wood_0..3.png`, `floor_stone_0..3.png`

64×32 diamonds. Every pixel was patterned in world coordinates, so any variant meets any other cleanly across all four edges.
- **Wood:** planks run along world X (the "\" direction), 8 px wide. Row tones are the same in every variant, so the grid disappears. Butt joints with nails and knots vary by variant.
- **Stone:** flagstones whose joints always fall on the tile edges, split into 1–4 slabs per variant, with lit and shaded rims, a few cracks and chipped corners.

Dirt and cobble world textures weren't redrawn this round. `dirt_world_128x64.png` from the ground kit still stands.

## Previews

- **`preview_building_*`:** a cutaway with the front walls removed so the interior shows. It's assembled purely from these PNGs and anchors, so it doubles as a placement test.
- **`preview_building_exterior_*`:** the same building with the front walls in.
- **`preview_doors_*`:** open doors and open windows with their leaves in place.
- **`preview_furniture_*` and `preview_floors_*`:** the furniture and floor tiles on their own.

All previews come at 1× and 3×.

---

# Brief 18: building pieces

## Log walls: `wall_log_<north|west>_<plain|door_shut|door_open|window_shut|window_open>.png`

- **Build:** 18 thick, centred on the edge line, 80 tall, the same anchors as wood and stone.
- **Logs:** five stacked 16 px round logs (`#8a5e36`), each with a lit top and a shaded underside. Clay chinking runs between them, with bark flecks.
- **Ends:** the near end face, and the jambs inside the openings, show cut log ends with growth rings.
- **Openings:** a timber header over the door, a stone threshold and window sill, and a timber window frame, so the lone segments read as finished.
- **`post_log.png`:** crossed log ends, the wall's thickness square. Courses alternate direction, so each face shows a cut end on every other log. It's the notched cabin corner.
- **Leaves and shutters:** `door_open_log_<o>.png` and `shutter_<left|right>_log_<o>.png`, hinged on the log wall's face (9 px from the edge line).

## Board overlays: `boards_<door|window>_<north|west>_<1|2|3>.png`

- **Anchor:** the same as the wall segment they cover. Draw them right after that segment.
- **Planks:** 5 px tall, weathered grey-tan (`#b5a27e` lit and `#8d7b5f` shade), with one nail at each end and a dark outline. That colour stands apart from the dark wood walls, the warm logs and the cool stone; the first warmer brown vanished on logs.
- **Layout:** each plank tilts 1.5–2.5 px across the opening, and its ends overlap the frame by 3–4 px. One plank sits at mid-height, two at the quarter and three-quarter heights, and three add the middle.
- **Depth:** they sit just proud of the log wall's face (9 px), the thickest material, so they're never inside any wall. On wood and stone they're 1–2 px proud, which reads fine because they're drawn over the wall.

## Far-side leaves (optional): `door_open_far_<mat>_<o>.png`, `shutter_far_<left|right>_<mat>_<o>.png`

Your plan is right as the default. A leaf that swings away from the camera stands behind an opaque 80 px wall, so draw nothing.

These cover the one case you named: a door whose own wall is drawn translucent, such as an interior door seen from inside. The renderer made them nearly free, so they're included.
- **Placement:** the same anchor as the segment. Draw them just **before** the wall (sort key = wall key − 0.5), and only when that wall is translucent.
- **Per material:** 2 door leaves (north and west) and 4 shutters (left and right, north and west).
- **Why not mirrors:** these are real away-swings, not mirrors of the near-side art, which is why they exist as separate files.

## Placement rules the test settled (what the previews do)

- **Sort keys:**
  - A wall segment is X + Y of its midpoint, i.e. the tile's top vertex + 16.
  - A post is X + Y of its grid vertex.
  - Near-side leaves, shutters and boards are their wall's key + 0.5.
  - Far-side leaves are the wall's key − 0.5.
- **New recommendation: a post where the material changes along a straight line.** Log (18), stone (16) and wood (14) differ in thickness, so where two meet end to end the thicker one's end face shows a small step in the cap. A post of the heavier material (stone > log > wood) covers it and reads like a timber or quoin post. No new art is needed; it's the existing `post_*`.
- **At a corner where two materials meet:** use the heavier material's post.
- **Lone segments:** they look complete on their own with posts at both ends, which the engine already places. No separate wall-end piece is needed.

## Placement previews (1× and 3×)

| File | What it shows |
|---|---|
| `place_alone` | Every segment variant alone, both orientations, all three materials, plus each post. |
| `place_lines` | Mixed materials end to end in both orientations, with doors and windows of one material between walls of another, and posts at material changes. |
| `place_lone` | A lone door segment and a lone window segment, each bare and then with its end posts. |
| `place_corners` | An L corner of each material with its posts. |
| `place_tees_mixed` | A T junction of each material, then mixed-material corners. |
| `place_boards` | Door and window, open and shut, with 1, 2 and 3 boards: every material in north, plus log in west. |
| `place_far` | The optional far-side leaves seen through a translucent wall. |
