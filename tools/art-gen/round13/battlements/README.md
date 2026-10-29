# Art round 13: battlements (a castle wall's parapet, merlons and corbels that hang over the OUTSIDE of the walkway)

Michael, 2026-10-29: "a short stone wall with these merlons ... a stereotypical castle battlement, and make sure the whole of the battlement sits outside the walkway, as in hanging over, not intruding on the walkway. In CSS terms, I want margin not padding on the battlements box model."

`python gen.py` writes `out/` (40 PNGs, their 40 depth maps in `out/depth/`, two draft definitions), `preview.png`, `look/`, `manifest.json` (Python 3, numpy, PIL; deterministic; a few seconds). Nothing is wired. Every PNG is hard alpha (the script asserts it). `gen.py` also asserts the brief's law: every stone of every strip lies on the outside of its edge line, and every corner block stands on a quadrant with no walkway.

## The idea in one picture

A castle wall is the village stone wall (`wall_stone`, layer 0, 96 tall, 16 thick, centred on the tile edge) with the walkway's floor on layer 1 over one side of it. The wall's top therefore has an 8 px ledge beyond the edge line on the OUTSIDE (its inner 8 are under the walkway's floor). The battlement is a **layer-1 wall piece standing wholly outside the edge line**: 16 thick, of which 8 sit on that ledge and 8 hang out over the wall's outer face, carried on a string course and a row of stepped corbels. The walkway tile keeps its whole diamond: nothing of the picture is drawn on it, and no stone of the geometry crosses the line. (Margin, not padding.)

World units as the engine's (tile 32 x 32, screen x = X - Y, screen y = (X + Y) / 2 - Z; the camera sees the +X faces in shade, +Y lit, tops lightest). For an n edge (line y = 0): far side = stone in y [-16, 0], near side = stone in y [0, 16].

## Proportions (the proposal) and the figure

| part | height above the walkway | against the 53 px figure (the bare body of the previews; 55 with hair) |
|---|---|---|
| parapet (the low wall in the crenel), coping included | 28 (three courses of 8, then a 4 high coping slab) | 53 %, about the hip to waist: leaning height |
| merlon, capstone included | 44 (five courses of 8, then a 4 high capstone) | 83 %, shoulder to chin; the head shows above it |
| crenel (the gap) | 16 wide, floor at 28 | a body is about 14 wide: you stand in it |
| merlon | 16 wide, 16 thick, 16 above the parapet: a cube, as in the reference | |
| parapet thickness | 16 (8 on the wall's ledge, 8 hanging) | |
| overhang under it | string course 4 high, then three corbel steps 5 high that project 6, 4, 2 beyond the wall's face (8 across, one under every merlon and one under every crenel) | |

Why not head height (about 55): real merlons are head height, but a merlon on the camera's near side hides everything up to its top, and the walkway behind it is where the player is. At 44 the head (and a hat or hood) always shows over a near merlon, and the parapet at 28 leaves the torso readable over the low wall. Merlon 40 / parapet 24 would fit the three-course grid as well, but then the merlon is only 16 above a 24 wall: less of a battlement. The numbers are in `geom.py` (`PARAPET`, `MERLON`, `W`); other ones are one edit and a re-run.

## The period: one merlon and one crenel per edge segment, merlons centred on the vertices

A segment is 32 wide: merlon 16 (half on each of two neighbouring segments), crenel 16. Chosen over one per two segments because (1) the engine's pieces are one edge long, so a run of any length composes with no phase or parity to remember (a 64 period would need the parity of the tile index and a second set of every piece); (2) a merlon every 2 tiles at this scale would be 32 wide with a 32 crenel, wider than two figures: it stops reading as a battlement; (3) merlons on the vertices are what the engine already does with posts, so a corner or a run's end is just a merlon-sized block on the vertex; (4) merlon:crenel of 1:1 is the stereotype (the reference). The stonework below the merlons is not periodic with 32: its courses are 8 high, their joints fall at 5/19, 0/13 and 8/24 along the run, so a straight run does not show a column of joints.

## The camera problem, and how it is solved

The camera sees the +X and +Y faces of everything. So the same battlement on the two sides of a walkway is two different pictures, and an n edge and a w edge are two more:

- **far** (the walkway is south of an n edge, east of a w edge: the stone is behind it): the camera sees the merlons' INNER faces (the walkway side), their tops, and the crenels as gaps through which the world behind shows; the outside, the overhang and the corbels are hidden (by the wall itself). Pieces `north_far_*`, `west_far_*`.
- **near** (the walkway is north of an n edge, west of a w edge: the stone is in front of it): the camera sees the OUTER faces: the merlons, the string course, the corbels with their shadow on the wall below, and the tops, with the walkway behind them, in which a figure stands partly hidden. Pieces `north_near_*`, `west_near_*`.

The pieces are not mirrors of each other: each is rendered from the real solid with the engine's light (a w edge is the n edge's solid reflected across the diagonal, then lit as it stands). A picture is cut out of one scene in which its neighbours are present, so what a neighbour hides is not drawn; the pieces of a run tile the plane by the world position of the surface each pixel shows (no overlap, no gap, the same stone at every joint).

## What is delivered (`out/`, names `battlement_<name>.png`; each has `out/depth/battlement_<name>.png`)

Anchors are in pixels from the PNG's top-left, in the convention of `wall_stone.json`: the tile's top vertex at the walkway's floor (the loader adds 16 to y); the vertex pieces are anchored on the vertex itself, as a post (no +16). A negative anchor is outside the image, as the cliffs' corners.

| name | size | anchor | what |
|---|---|---|---|
| `north_far_plain`, `_plain_1`, `_plain_2` | 47 x 68 | 0, 52 | an n edge, walkway south; three variants of the joints (any meets any: the shared stones are identical in all three), `_plain_2` also has a hairline crack in its crenel's parapet |
| `north_far_loop` | 47 x 68 | 0, 52 | the same with the crenel filled to merlon height and an arrow loop in it: the rare variant (about 1 in 10, by hash) that breaks the rhythm |
| `north_far_late`, `_early` | 47 x 68 | 0, 52 | the plain picture without its first / last 16 along the run, for an edge that ends in an inner corner (the corner's block takes that half) |
| `north_near_*` (the same six) | 47 x 84 | 16, 44 | an n edge, walkway north |
| `west_far_*`, `west_near_*` (six each) | 47 x 68 / 47 x 84 | 47, 52 / 31, 44 | the w edges |
| `corner_outer_n` | 30 x 16 | 15, 60 | both edges far: the corner block shows only its top (the merlons beside it hide the rest) |
| `corner_outer_s` | 32 x 70 | 16, 44 | both edges near |
| `corner_outer_e`, `corner_outer_w` | 31 x 72 | -1, 52 / 32, 52 | one edge far, one near |
| `corner_inner_n`, `_s`, `_e`, `_w` | 32 x 70 / 60 / 73 / 73 | 16, 44 / 16, 60 / 32, 52 / 0, 52 | a notch in the walkway: the block stands in the notch |
| `end_<E,S,W,N>_<far,near>` | 23-24 x 56-72 | see `manifest.json` | a run's free end: the half merlon beyond the vertex, so the run ends on a whole merlon. `E`: the run leaves the vertex toward the east (an n edge whose west end is free), and so on |

Corner names are the cliffs' (`src/cliffs.js`): `outer_<where the vertex sits on the walkway's tile>`, `inner_<where it sits on the notch tile>`. A corner piece is the 16 x 16 block that turns the corner (in the quadrant opposite the walkway, or in the notch); the two merlon halves are in the straight pieces beside it, so a corner reads as the L-shaped merlon of the stereotype. Its corbel and shadow are included on the near sides.

`preview.png` is the whole system in place (the village stone wall and floor under and in it, a figure for scale, 1x and 3x); `look/sheet_3x.png` shows every piece alone at 3x.

## The structure matched (drafts in `out/`, never in the repo)

`wall_battlement.json` is `wall_stone.json`'s shape (`anchorVertex: "top"`, `images`, `anchors`, `wall`), plus what the cliffs added (`faces`, `special`, a cut table). `wall_battlement_vertices.json` is the cliffs' `wall_cliff_corners.json` shape (`images`, `anchors`, `anchorAt: "vertex"`, the corners with their arms and plateau quadrants, the ends). Draft `wall` block: `height 28`, `thickness 0`, `seeThrough true`, `battlement true`, `reach {far 0, near 32}`; the four `faces` lists and `special.loop`.

## What the engine would need (from reading `src/render/walls.js`, `depth.js`, `cliffs.js`, `map.js`, `archery.js`; nothing wired)

1. **Which side the walkway is on: derived, not stored.** `wall_stone.json` has no such field, and a wall on the map has none (the existing `wall.side` in `map.wallRule` means a ramp's own side wall, another thing). A per-wall `side` would have to be saved, sent and put in the sync check; avoid it. The cliffs already read their plateau from the map (`cliffs.plateauAt`, a floor on layer + 1); the battlement reads the floor on its OWN layer at the two tiles either side of its edge: for an n edge of tile (x, y) the walkway is the tile (x, y) (south: far) or (x, y-1) (north: near), for a w edge (x, y) (east: far) or (x-1, y) (west: near). A guest reads the same floors, so nothing is added to the save, the frame or the sync. Floors on both sides or on neither: draw nothing and refuse the placement (a free-standing parapet would have to straddle the line, which is the padding Michael does not want).
2. **A layer-1 wall on layer-0 stone** exists (walls are built on upper floors, #549; the lower wall's cap is already dropped when a wall stands on it, `walls.js` `stackOf`/`wallOn`, so the stone below needs no change). The map generator or the build tool puts `wall_battlement` on the walkway's boundary edges.
3. **Frame choice by side**: a few lines like `cliffs.edgeFrame` (`faces[north_far|north_near|west_far|west_near]` by the edge's hash, `special.loop` by a threshold).
4. **Depth.** `makeWall` puts the wall's face on a plane `T/2` nearer than the edge line, T from the definition's `thickness` (`depth.wallSurface`). A far battlement's face is on the line itself (T = 0), a near one's outer face is 16 beyond it (T = 32): one definition has one T, so it needs a per-side T (`reach` in the draft, a few lines beside the cliff's `back` branch) or two definitions. The bigger risk: the plane is flat, and the far merlons' TOPS lie up to 16 behind it and 44 up; a figure's head close to the parapet could be covered by a merlon top it is really in front of. Use the depth maps in `out/depth/` (art round 8's and round 10's format: X + Y + Z from the anchor, plus 32768) or draw the far pieces behind the figure's layer. The vertex pieces and the `late`/`early` cuts only partition exactly in per-pixel depth.
5. **Cap**: `emitCapFromFrame` redraws one rhombus T wide at `wall.height`, centred on the edge line, from the picture; for the battlement it would copy the wrong pixels (stone lies off the line, tops at two heights). Draw no cap (the existing `covered` path) or add `wall.cap: false`. Nothing is lost: the whole walkway is outdoors.
6. **`wall.height`** can say 28, the parapet; `archery.wallStops` and the flights read it as one number, so a shot from the walkway passes over the parapet and one from below is stopped under 28 (a merlon's 44 is not modelled; a crenel is open above 28, which is what an archer wants). `seeThrough: true` (as a fence's, without `fence`, so the dead cannot strike it down) lets sight and light pass and bounds no room, so the walkway is not a closed room; without it the wall would block sight from the walkway outward.
7. **Corners and ends**: `vertexAt`/`postAt` draw one symmetric post; the battlement needs `cliffs.cornerBase`'s classification run on the floors of its own layer (the plateau quadrants are the walkway's tiles), plus the arms' sides to pick `end_*` for a single arm. The two cut pictures (`late`, `early`) are for an edge whose end vertex is an INNER corner; without them the straight pieces overlap the corner's block by 16 on screen (only at inner corners, and only where the planar depth cannot tell the two strips apart).
8. **Fade of the near battlement.** A near merlon is 44 high and 16 thick in front of the walkway: on the tile row beside it the player is covered to the chest (the preview's figures). The engine's near-wall fade is by room; a walkway is not a room, so a near battlement would need to join it (or fade where it covers the player's body), as the storey in front fades.
9. **Movement** (not read): whether an edge wall's collision is a line or has the wall's thickness; the picture is outside the line, and `thickness 0` is meant to say so.

## Weak points (said plainly)

- The OVERHANG is visible only on the near sides (and at near corners); on the far sides the wall hides it, as it would in a photograph from there. On the far sides the "margin" shows only as the merlons standing flush with the walkway's edge and nothing on the walkway.
- The shadow under the near overhang is a ragged dark band at 1x (the stepped corbels' own shape); at 3x it reads as machicolations, at 1x as a dark scalloped course. It is drawn on the wall below, so a near piece without its `wall_stone` under it shows a dark smear.
- Near merlons hide the figure to the chest (item 8); 40 / 24 would hide less and read less.
- No `#2b2522` outline: the village stone wall has none (its edges are tones: a highlight rim, a dark joint) and the brief says match it. Say if Michael wants the outline anyway.
- The variants differ in joints and one crack, not in colour or weathering; no moss, chips or damage art. `loop` is the only different silhouette.
- 24 straight pictures (3 plain, 1 loop, 1 late, 1 early for each of the four edge/side pairs), 8 corners and 8 ends: 40 pictures from one generator is the price of a battlement that works on both sides of a walkway in two directions. The minimum to wire is the 4 plain straight pictures and the 4 outer corners; inner corners, ends and variants can wait.
- The figure is the bare body, 53 px, as in earlier rounds.
