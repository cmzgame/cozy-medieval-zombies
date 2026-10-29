# Art round 11: the Stone ramp with its own sides for the landing tile

`python gen.py` (numpy, PIL; imports `cliffbase.py`, round 10's gen.py copied whole; about 100 s the first time, then `look/cres.pkl` caches the cliff pieces for the T scenes) writes `out/`, `look/`, `manifest.json`, `preview.png`. Nothing is wired. Every PNG has hard alpha.

## Which split, and why: (b)

The engine (PR #569, `map.buildStair`, `landingSideEdges`) already lays a wall, `wall_ramp_side`, on three edges of the ground under the landing (every edge but the one shared with the top step: for a ramp climbing n that is the landing's west, east and FAR edge; for w its north, south and far edge) and draws it as a stone wall's `north_plain` / `west_plain`. So (b) is least engine work: the same two frame names, sizes and anchors as `wall_stone` (49 x 121; (8,100) and (40,100)), data only, and the ramp's own picture is not changed in shape. (a) would need a fourth tile column in the ramp's per-tile cuts, and the landing's walls would double up with the ones the engine lays. (b) reads as one solid shape (see the previews), so no (a) is delivered.

## Files (`out/`)

| file | size | anchor | what |
|---|---|---|---|
| `wall_ramp_side_north_plain.png` | 49 x 121 | 8, 100 | the ramp's side on an n edge: a square rock face 96 tall, 32 along X |
| `wall_ramp_side_west_plain.png` | 49 x 121 | 40, 100 | the same on a w edge, 32 along Y |
| `stair_ramp_stone_n.png` | 129 x 160 | 31, 128 | the slab climbing n (redrawn; anchor the low tile's top vertex at ground) |
| `stair_ramp_stone_w.png` | 128 x 160 | 97, 128 | the slab climbing w |
| `depth/*.png` | as each | | true depth X + Y + Z + 32768 (round 8's format); the side pieces' depth is relative to the edge's start vertex |
| `wall_ramp_side.json` | | | draft definition, `wall_stone.json`'s shape, `wall.solid: true`, no `post` |
| `stair_ramp_stone.json` | | | draft, round 10's shape with the new anchors, `columns`, `ramp.surface` and `ramp.landing` |

## How the side is drawn

- The face lies ON the edge line (the ramp's own flank is on the lane's edge line, so ramp and side are one plane), not 8 px out as a cliff wall's face is. Relief is slight (0.45 of the cliff's), the strata are the cliff's (same bed heights, so the ramp flank's courses continue into the side's with no step at the head), light from the top left (the +X face dark, the +Y face lit).
- Square: the face is vertical, the top course (the top 6 px) is flat with no recess, one lit row at the very top, a dark line under it. No lip, no moss lip, no rounding. The ramp's flank got the same top course (it follows the slope and becomes the side's level top), and its edge rounding went from 5 px to 1.5.
- No top strip is drawn, the landing's floor is the top: the face's top row sits exactly on the floor's near edge, 96 px up. The piece's rock behind the face is not drawn at its ends (a flat cut end, so the same picture on an edge's far side never shows a stub).
- The same picture serves both sides of an edge and the far wall: they are all 32 along the edge, and the face shows wherever the camera sees it (the interior ones are hidden by the floor and the other sides).
- A little grass creeps at the foot, as on the cliff.

## Ramp surface (the treads-equivalent)

Unchanged in numbers: 32 px a tile along the run, three worn 3 px treads at u = 14, 46, 78 (a foot is never more than 3 px under the line). `stair_ramp_stone.json` gives `ramp.surface[facing]` every eighth of a tile: `t` (tiles from the low end), `height` (px), `centre` (the pixel where the feet go, from the picture's top-left). Examples, n: t 0 -> height 0 at (15, 152); t 1 -> 32 at (47, 104); t 3 -> 96. w: t 1 -> 32 at (81, 104). **The landing:** flat at 96 px for t 3 to 4; `ramp.landing` gives the tile's centre from the ramp picture's anchor (n: (127, 0); w: (1, 0), the top edge of the frame, so the picture itself does not reach it; the landing floor is the engine's own tile). The head: the slab reaches 96 at t = 3, flush with the landing's floor and the side's flat top.

## Engine needs (from reading `map.js`, `walls.js`)

1. Data only for the walls: put the two PNGs in `data/art/village/`, point `wall_ramp_side.json`'s images at them, and **omit `wall.post`** (`walls.js` guards `sheet.wall.post`): the pictures are exactly the faces, a stone post (37 x 117, 16 thick) at the landing's four vertices would stand 8 px proud of the face and 18 px over the floor. If a post is required, ask for a transparent 1x1.
2. The ramp pictures: new anchors (31,128) and (97,128) (were (29,127) and (97,127)) and the per-tile `columns` in the json; `emitRamp` is unchanged.
3. A wall in the engine is 16 thick centred on the edge; these pictures put their rock on the edge's near side (n: Y -8 to 0; w: X -8 to 0) and the face on the line. If the engine sorts the wall on planes 8 px out (as a stone wall's face is) the face may sort 8 px off against the ramp's near side; check at the head, where the side meets the third tile.
4. Nothing needed for the T: the head's cliff wall is removed by hand as the engine already requires; the landing is a cliff-top tile and the three sides are hidden under the plateau.

## Preview (`preview.png`, with `look/*.png`)

Composed per pixel by true depth, the figure on a billboard at its feet; the sides placed on exactly the edges `landingSideEdges` names. 1x row, then 3x of each:
1. Both facings free-standing: figure at the foot, 48 px up the slab, on the landing.
2. The T: the n ramp into the south face of a cliff plateau and the w ramp into its east face (art round 10's cliff walls, corners, grass lips and cliff tops; the head's cliff wall removed; the three side walls laid under the plateau, where the floor hides them).
3. Old ramp (round 10, left, floating landing) beside the new one, both n, and the new w.
4. A straight cliff run with the ramp into the face of its east end.

## What is weak

- A 3 px light sliver shows at the far end of the landing's east face (the far wall's inner face, which the engine lays 8 px thick behind the face, seen past the east wall's far end). It is the far wall's face receded by the relief; at BUMP = 0 it vanishes but the faces lose their strata. Hardly visible at 1x.
- The landing's floor is the engine's tile (cliff-top art in the preview); where it meets the face's lit top row there is one lit pixel row, not a lip.
- In the T, the cliff walls beside the ramp end in round-lipped, rounded cuts (round 10's pieces, as Michael wants to keep), against the ramp's square flank: the junction reads a little like a gate post. Cliff `post_cliff` at the run ends is drawn by the engine, not shown in my T scenes beyond what `build_hill` places.
- The pieces' relief is lower than the cliff's, so at a long run's end the ramp's side reads smoother than the cliff beside it: intended (square, plain).
- The grass tufts at the foot are the cliff's; on a flat ground they are the only colour variety.
