# Art round 8: the stairs (wood and stone)

`python gen.py` writes `out/`, `manifest.json`, and `preview.png`. It is deterministic. The art is not wired into the game: these files wait for Michael's approval before they go into `data/art/village/` and `data/sprites/`.

## Files (`out/`)

| file | size (w x h) | anchor (top vertex of the LOW-END tile, ground) |
|---|---|---|
| stair_wood_n.png | 134 x 176 | 34, 142 |
| stair_wood_w.png | 135 x 176 | 100, 142 |
| stair_wood_s.png | 135 x 130 | 100, 64 |
| stair_wood_e.png | 134 x 130 | 34, 64 |
| stair_stone_n.png | 132 x 168 | 34, 134 |
| stair_stone_w.png | 131 x 168 | 97, 134 |
| stair_stone_s.png | 131 x 122 | 97, 56 |
| stair_stone_e.png | 132 x 122 | 34, 56 |

Also included:
- `stair_wood.json` and `stair_stone.json`: the sprite definitions.
- `stair_*_<d>_depth.png`: an optional 16-bit depth map for each drawing (described below).
- `preview_1x.png` and `preview_3x.png`, plus `look_*.png` (each scene at 3x).

Every drawing passes the checks: alpha is only 0 or 255; a 1 px `#2b2522` outline runs all the way round; light comes from the top left; the art is drawn at final size.

## Directions (the engine's `dir`, `map.js` STAIR_D)

- `n` climbs toward -y (up-right on screen, away from the camera).
- `w` climbs toward -x (up-left, away).
- `s` climbs toward +y (down-left, toward the camera).
- `e` climbs toward +x (down-right, toward the camera).

Footprint: `n` and `s` are 1 by 3; `w` and `e` are 3 by 1.

**Mirrors:** none are used. All four directions are rendered natively, so the lit side is right in each. `w` is `n` mirrored and `e` is `s` mirrored, geometrically exact; the silhouette differs by 1 px of width only because of pixel sampling. To halve the sheet, the engine can set `"w": {"from": "n", "mirror": true}` and `"e": {"from": "s", "mirror": true}`. The cost is that the risers and the side panel swap lit and shade.

## The wood stair

- **Treads:** twelve plank treads, 2 thick, each with a 1.5 overhanging nosing drawn in a worn light edge (`#93704c`) and two nail heads.
- **Risers:** darker risers (`#5e4028` lit, `#432d1b` shade), with a shadow line under each nosing.
- **Closed stringers** on both sides:
  - Each stringer is a sloped board 12 deep in the wood wall's tones, with a chamfered top edge, a bead cut along it, and a dark lower edge.
  - Under each stringer, from the floor, is a recessed spandrel panel of upright boards.
  - The treads are through-tenoned: every tread's end shows, wedged, on the stringer face. This puts a 12-beat rhythm on the side, which is what makes the toward-camera views read as steps.
- **Posts:** a newel at the foot of each side, with a cap and knob, 25 px. At the head of each side is a post that carries the landing's edge, rising to 110 px with a cap.
- **Underneath:** a header under the top tread. Under the run it is open and dark, seen only from the back in `s` and `e`.
- **No handrail.** I left it out deliberately. On the visible side it would cross every climbing figure at the waist, and on the far side it would fight the wall.

## The stone stair

- **Steps:** twelve steps of squared blocks. Each riser is one 8 px course in the stone wall's tones (`#857f78`, `#7b7670`, `#605b56`, mortar `#4b4743` and `#3b3734`). The tread slabs are lighter (`#a19b92`, `#99938b`), with a lit nosing and a joint that shifts from step to step.
- **Solid to the floor.** The back of the high end is a 96 px block wall.
- **Cheek walls** stand on both sides, stepped 5 px above each tread, with a coping slab per step.

## Treads: where each top lies

The run is u = 0 to 96 along the stair (3 tiles, 32 each), from the low edge. Tread k (k = 1 to 12) has its top at **8k px**. Its riser is at u = 8k - 4, and it is centred on u = 8k, which is t = k/4 tiles.

| tread | height (px) | t (tiles) | tile |
|---|---|---|---|
| 1 | 8 | 0.125 to 0.375 | 0 |
| 2 | 16 | 0.375 to 0.625 | 0 |
| 3 | 24 | 0.625 to 0.875 | 0 |
| 4 | **32** | 0.875 to 1.125 | straddles 0 and 1 |
| 5 to 7 | 40, 48, 56 | | 1 |
| 8 | **64** | 1.875 to 2.125 | straddles 1 and 2 |
| 9 to 11 | 72, 80, 88 | | 2 |
| 12 | **96** | 2.875 to 3.0 (half a tread) | 2, flush with the landing |

Between t = 0 and t = 0.125 there is bare floor.

**This layout was chosen to match the engine's existing rise.** `map.stairStep` sets `rise = 32 * t`, which equals the tread height exactly at every tread's centre and is never more than 4 px off. So feet already sit on the tread with no engine change. To be exact everywhere, draw the body at `8 * round(4t)`; the crate heights 32, 64, and 96 fall exactly at the tile boundaries.

`treads[d]` in each JSON gives, for every tread: `height`, `along` (t), `tiles`, `rect` (its top's bounding box in the drawing's pixels), `quad` (the top's four corners in those pixels), and `centre` (where the feet go).

## Per-tile column cuts (`columns` in the JSON, drawing pixels)

The rule is the engine's two-tile rule (`SLICE_INSET` 9) applied at both boundaries: the front tile owns columns up to its centre plus 9 px toward the back tile.

- **wood n:** tile 0 owns x < 43; tile 1 owns 43 to 75; tile 2 owns x >= 75.
- **wood w:** tile 0 owns x >= 91; tile 1 owns 59 to 91; tile 2 owns x < 59.
- **wood s:** tile 0 owns x >= 77; tile 1 owns 45 to 77; tile 2 owns x < 45.
- **wood e:** tile 0 owns x < 57; tile 1 owns 57 to 89; tile 2 owns x >= 89.
- **stone:** the same cuts for `n` and `e`; for `w` the cuts are at 88 and 56; for `s` they are at 74 and 42.

Tile 0 is the low end (the stair's `at`), and the slice offsets go 32 px per tile along the run.

**A warning for docs/51:** the furniture rule of two face planes per slice mis-sorts a stair climbing away from the camera (`n`, `w`). The upper treads lie behind the tile's front face. The face-plane rule pushes them forward, by up to 3 depth units per world unit of distance from the face, so they would paint over the upper body of a figure standing on a lower tread. Each tread top needs its own plane:
- the horizontal plane z = 8k over its `quad`, as the dev art's top plane does now;
- each riser the vertical plane at u = 8k - 4;
- the outer stringer, panel, and posts the side face, which for a run along y is the single plane x = tx + 0.5 for all three tiles, and is exact.

Alternatively, use the depth maps. Each `stair_*_<d>_depth.png` is 16-bit and holds the true X+Y+Z of every opaque pixel, in world units from the anchor, offset by 32768. The preview was composited per pixel from these maps, with the figure on the docs/51 plane at (gx+0.3, gy+0.3). So the preview shows the sort the engine should reproduce.

## What's weak

1. **The toward-camera directions (`s`, `e`) cannot show their treads.** This is geometry, not drawing. In 2:1 isometric the view ray runs along (1,1,1), so a 45-degree stair rising toward the camera (32 px per tile) is exactly edge-on: its treads, both stringer tops, and the walking line all project onto a single screen line. What you see is the side panel, the tenon rhythm, the posts, and the dark open back under the header. The near stringer, honestly, hides the lowest 7 px of a climbing figure's legs. In stone the stepped cheek wall gives the zigzag, so it reads better. Climbing figures there move up-left on screen, just as walking away on flat ground would. Project Zomboid only builds stairs climbing away from the camera for this reason. **Recommendation: the mapgen should prefer `n` and `w` for stairs a player will see from the front.**
2. **The wood stair beside a wall** is right for the wall's thickness: the wall is centred on the tile edge and hides 7 px of the inner side, so the inner posts disappear into the wall. A tight stairwell will look narrower than 32.
3. **Stone landing edge:** the stone stair's top cheek coping stands 5 px proud of a 96 px landing. That is intentional (a kerb), but say if it should be flush.
4. **Nail dots and tenons** are 1 px details. They read at 3x; at 1x they are texture.
