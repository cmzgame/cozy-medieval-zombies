# Art round 10: cliffs (a cliff wall, a cliff top, a stone ramp)

`python gen.py` writes `out/`, `look/`, `manifest.json` and `preview.png` (numpy and PIL, deterministic, about a minute and a half). Nothing is wired: these wait for Michael's approval. Every PNG is checked by the script for hard alpha (0 or 255 only).

## How it is drawn

The rock is a solid defined in world units (an occupancy function of X, Y, Z), sampled on a half-unit voxel grid. Its camera-facing surface is splatted into a z-buffer one voxel centre at a time. Every pixel is lit from a normal taken off the smoothed solid, and coloured in a few flat stepped tones (light from the top left: tops lightest, +Y faces lit, +X faces in shade). So the rounded lip, the corners and the ramp's edges are real geometry, and the strata, ledges, cracks and moss come out of the same field on every piece.

The hill's model is the brief's:
- Cliff walls stand on the ground's tile edges (layer 0). Each is 96 tall and 16 thick, centred on the edge line.
- The face is 8 out from the edge line, leans back up to about 2 px as it rises, and is carved inward only (beds, blocky facets, fissures).
- The wall's top is flat at 96 on the plateau's side of the edge line. From the edge line to the face it rounds over in a quarter round of radius 8: the lip.
- The cliff-top floor (layer 1) meets the wall's top flush at the edge line. The lip carries all of the rounding.

## Files (`out/`; each is meant for `data/art/village/` and `data/sprites/`)

Anchors are in pixels from the PNG's top-left. The grass-lipped set (`wall_cliff_grass_*`, `post_cliff_grass`) has exactly the same names, sizes and anchors as the rock set.

| file | size | anchor | what |
|---|---|---|---|
| `wall_cliff_north_plain.png`, `_plain_1`, `_plain_2` | 49 x 121 | 8, 100 | the n edge's face, three variants |
| `wall_cliff_north_back.png` | 49 x 121 | 8, 100 | an n edge whose plateau is on the camera's side: its lip rounds away and its face is hidden |
| `wall_cliff_west_plain.png`, `_plain_1`, `_plain_2` | 49 x 121 | 40, 100 | the w edge's face, three variants |
| `wall_cliff_west_back.png` | 49 x 121 | 40, 100 | the w edge, plateau on the camera's side |
| `wall_cliff_corner_outer_s.png` | 75 x 117 | 37, 116 | outer corner, the hill's point toward the camera |
| `wall_cliff_corner_outer_e.png` | 41 x 131 | 40, 112 | outer corner, east on screen |
| `wall_cliff_corner_outer_w.png` | 41 x 131 | 1, 112 | outer corner, west on screen |
| `wall_cliff_corner_outer_n.png` | 75 x 113 | 37, 93 | outer corner, the far point |
| `wall_cliff_corner_inner_n.png` | 80 x 123 | 40, 104 | inner corner (a cove), the notch toward the camera |
| `wall_cliff_corner_inner_e.png` | 53 x 136 | 37, 116 | inner corner, east |
| `wall_cliff_corner_inner_w.png` | 54 x 136 | 16, 116 | inner corner, west |
| `wall_cliff_corner_inner_s.png` | 80 x 120 | 40, 112 | inner corner, the far side |
| `wall_cliff_corner_<each>_hn/_hw/_hnw.png` | see `manifest.json` | see JSON | the same corners with the n edge, the w edge, or both halved (below) |
| `post_cliff.png` | 20 x 102 | 10, 97 | a round rock column on a vertex |
| `floor_cliff_top_0..3.png` | 64 x 32 | 32, 16 | the cliff top: bare rock with slab cracks, scree, sparse grass, a fleck of lichen |
| `floor_cliff_grass_0..3.png` | 64 x 32 | 32, 16 | the grass-topped cliff top: turf with a rock nub now and then |
| `stair_ramp_stone_n.png` | 127 x 158 | 29, 127 | the stone ramp climbing n |
| `stair_ramp_stone_w.png` | 126 x 158 | 97, 127 | the stone ramp climbing w |
| `depth/*.png` | as each picture | | 16-bit true depth: X + Y + Z per pixel from the anchor's world point, plus 32768 (art round 8's format) |

**Definitions.** All of these are in `out/`:
- `wall_cliff.json` and `wall_cliff_grass.json`
- `wall_cliff_corners.json` and `wall_cliff_grass_corners.json`
- `post_cliff.json` and `post_cliff_grass.json`
- `floor_cliff_top.json` and `floor_cliff_grass.json`
- `stair_ramp_stone.json`

All told:
- 16 straight walls
- 64 corner pictures (8 corners x 4 halvings x 2 lips)
- 2 posts
- 8 floors
- 2 ramps

That is 92 PNGs, plus their depth maps.

## The structure matched

**`wall_cliff.json` is `wall_stone.json`'s shape:**
- `anchorVertex: "top"`, with `images` and `anchors` per frame.
- `north_plain` and `west_plain` are the same size and anchor as stone's: 49 x 121 at (8, 100) and (40, 100).
- `wall: { height 96, thickness 16, color, material "stone", post "post_cliff" }`.

So wiring the straight wall is data: drop the files in, and name `wall_cliff` on the edges of layer 0. The extra frames and fields are read by nobody until the code below is added:
- `north_plain_1`, `_2`, `west_plain_1`, `_2`, `north_back`, `west_back`
- `faces`, `back`, `wall.corners`

A cliff has no door or window frames. A door or window placed on a cliff edge would find no frame and draw nothing.

**`post_cliff.json`** is `post_stone.json`'s shape: one image, `idle_0`, and an anchor on the vertex itself.

**The floors** are `floor_stone.json`'s shape: `images` `idle_0..3` and anchor (32, 16). They are patterned in world space, so any frame meets any other.

**`stair_ramp_stone.json`** is `stair_stone.json`'s shape:
- `anchorVertex: "top"` and `facings` (n and w only).
- `facingFootprint` (1 by 3, 3 by 1).
- `drawings` with anchors on the low-end tile's top vertex at ground.
- `anchorTile`, `columns` (art round 8's per-tile cuts, `SLICE_INSET` 9), `depth`, and `carry: false`.

In place of `treads`, it has `ramp`:
- **`surface`**: for each facing, the walking surface every eighth of a tile: `t` in tiles, `height` in px, `centre` the pixel where the feet go.
- **`steps`**: the three worn steps.

## What the data-only wiring gives, and the code that finishes it

**Data alone** (the third panel of `preview.png`): straight faces (`north_plain`, `west_plain`), the floors on top, and `post_cliff` at every corner and every run's end, as today's engine draws stone.
- The posts round an outer corner at radius 8 and cap a run's end.
- At an inner corner the post sits inside the rock, and only its top shows.
- It reads as a hill, but the corners are bollard-like and every face is the same picture.

**Three small additions**, all in `render/walls.js`, finish it:

1. **Face variants:** pick a frame from `faces[side]` by a hash of the edge (as the floor bake picks `idle_*`). Any variant meets any other: the strata and the face's depth are the same at every joint.
2. **Back faces:** an edge whose plateau is on the camera's side takes `back[side]`. That is the tile `(tx, ty)` itself, the one the n or w edge belongs to, having a floor on `layer + 1`. Without it the plain picture still works: its lip is hidden under the floor, and the far side shows a flat 8 px rim of rock.
3. **Corners** (Michael's addition): a vertex where exactly two cliff edges meet at a right angle is a corner. Classify it by the plateau around it:
   - The plateau is the tiles with a floor on `layer + 1`, in the vertex's four quadrants.
   - Name the quadrants: tile `(vx-1, vy-1)` is screen north, `(vx, vy-1)` screen east, `(vx-1, vy)` screen west, `(vx, vy)` screen south.
   - **One plateau quadrant: an outer corner,** named for where the vertex sits on that plateau tile. North quadrant: `outer_s`. East: `outer_w`. West: `outer_e`. South: `outer_n`.
   - **Three: an inner corner,** named for where the vertex sits on the notch tile. Notch south: `inner_n`. West: `inner_e`. East: `inner_w`. North: `inner_s`.
   - **Drawing it:** draw `wall_cliff_corners[name]` anchored on the vertex at ground level (no +16, as a post). Do not draw either edge's own picture, or the post.
   - **Which edges a corner owns:** the n edge of tile `(vx if the quadrant is east or south else vx-1, vy)`, and the w edge of tile `(vx, vy if the quadrant is west or south else vy-1)`. `edges` in the JSON gives the same.
   - **An edge two corners claim** (a step one tile long, as in the preview's notch): each corner takes its halved picture for that edge: `_hn`, `_hw`, or `_hnw`. These are cut square at the edge's midpoint and drawn to meet there, so no cut is made at run time.

   Each corner's depth: give it the two face planes of its two edges, or use its depth map in `out/depth/`.

**Which corners show their faces, and which only their lip:**

| corner | what shows |
|---|---|
| `outer_s` | both faces (+X and +Y), round, toward the camera |
| `outer_e` | the +X face, turning away into a lip |
| `outer_w` | the +Y face, turning away into a lip |
| `outer_n` | only its lip, from above |
| `inner_n` | both faces (the cove looks at the camera) |
| `inner_e` | the +Y face, with a lip-only side |
| `inner_w` | the +X face, with a lip-only side |
| `inner_s` | only its lip |

**Mirrors:**
- `e` and `w` are geometric mirrors of each other.
- `n` and `s` are each symmetric.
- None of them is mirrored in the files: all eight are rendered natively, so the lit side is right in each.

**The corners' shape:**
- **Outer:** the face rounds at radius 20, from 12 px along each face. The plateau's line rounds with it (radius 12), so the lip keeps its width round the bend.
- **Inner:** a cove of radius 12.

## Decisions taken (Michael may overrule)

- **The lip is on the wall, not the floor.** The upper floor is baked per chunk with no knowledge of its neighbours, so an edge on the floor would need code. The wall picture already straddles the edge line.
  - Below the edge line the wall is flat at 96, the floor's own height. Under the floor of a front wall it is hidden; for a back wall its outer half is the lip seen from behind.
  - The floor needs no edge frames.
  - A wall with a floor on one side is `covered` (`stackOf`), so its cap is not redrawn in sky light and its lip stays as drawn.
- **Grass tops come two ways.**
  - `floor_cliff_grass` on top of `wall_cliff` gives turf to a rocky brink.
  - `wall_cliff_grass` rolls the turf over the lip, ragged, with a soil line under it.
  - Pick per edge by the floor on top. The preview does this: grass lips where the top is grass, rock lips on the rocky patch.
- **The far brink:** where a lip turns away from the camera, its top pixel is drawn as the cut edge (soil under turf, or shadowed rock). This makes the hill's far side read against the ground 96 px below it.
- **One post serves all three vertex kinds** (outer corner, inner corner, run's end), as `post_stone` does. The real corners are the corner pieces.
- **No `#2b2522` outline on any piece.**
  - `docs/art/01` rule 4 keeps walls, floors and ground unoutlined.
  - An outline round a wall segment would draw a dark seam at every joint of a cliff, and round every floor tile.
  - The ramp is left unoutlined too, so it reads as rock of the hill rather than a placed object. The drawn stairs have the outline. `RAMP_OUTLINE = True` in `gen.py` gives the ramp one in a single rerun.
- **The ramp:**
  - **Shape:** a sloped slab whose surface is `z = 32 px a tile` (the engine's `map.stairStep` rise, exactly).
  - **Steps:** three shallow worn steps cut into it, one a tile, at t = 0.4375, 1.4375 and 2.4375. Each is a 3 px flat tread, so the feet are never more than 3 px under the line, and only on those treads.
  - **Sides:** rock in the cliff's strata, the slab's edges rounded over as the lip is.
  - **Head:** the slab reaches 1.5 units under the landing, so the head joint has no gap. The engine's head cut at 96 trims it.
  - **Engine:** `emitDrawnStair` lays twelve tread planes. A ramp wants one sloped plane for the slab, `z = 32 u` over the run, with the near side on its side plane as now. That is a small branch on `ramp` in the definition.
- **The quarry's 128 px `wall_cliff`** (`docs/52` section 4.5, `29-world/06`): this one is 96, a storey, as the brief says. The name is the same, so the quarry's plan should now say 96, or use two storeys.

## The preview (`preview.png`)

- **Top row (1x):**
  - The hill: an L with a 2-wide notch, a 1-edge step on each side of the notch (the cliff turns 90° twice), a back L that makes `inner_s`, and a step on the right side. All eight corner kinds appear, and the shared-edge halves are used.
  - The ramp climbing `n` on its left face, with the figure at the foot, halfway (48 px up), and on top.
  - The plateau is grass-topped, with a rocky patch at the back.
  - A long straight run of faces with their variants and grass lips, with a rock-topped arm and the ramp climbing `w`.
  - The same hill wired from data alone (straight faces and posts).
- **Then the hill and the long run at 3x.**
- **How it was composited:** per pixel by the pieces' true depths, the floors on their plane at 96, the figure on a billboard at its feet. That is truer than the engine's planes, so the sort the engine should reproduce is the one shown.
- **`look/`** holds working views: every picture at 3x (`sheet_3x.png`), each scene at 3x, and close crops.

## What is weak

- **A 32 px rhythm on long runs.** Every joint returns to the same strata line and depth (that is what lets any variant meet any other), and the features thin out within 3 px of each joint. On a long straight run a soft beat every tile can be seen at 3x. Three variants per side soften it. More variants are a rerun with more seeds.
- **An outer corner's floor tip.** The floor tile is square, and at the apex the lip is up to 2 px lower than it. The floor's diamond tip lies over the top of the round by a pixel or two. It is the same colour, and invisible at 1x.
- **A halved inner cove** meets the other corner's half with a step of under a pixel at the cut.
- **The hidden faces are flat grey,** because the plateau's floor covers them: the faces on the plateau's side of the back pieces and the corners. A one-tile-wide ridge might show a sliver of one under its floor.
- **No scree at the foot.** The base is carved inward only, to keep stone's frame, and only grass tufts creep up it. A cliff-foot scree decal from the ground set would help the base sit in the grass.
- **The ramp's three worn steps read as three slabs** at 3x. It is still plainly a ramp at 1x. Fewer, or none, is one line (`RAMP_STEPS`).
- **The data-only wiring's posts** look like bollards at corners. The corner pieces need the third change above.
- **The figure in the preview** is the bare body, taken from `preview_skins_3x.png` as in art round 8.
