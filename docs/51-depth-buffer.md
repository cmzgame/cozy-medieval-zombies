# 51 — A depth buffer: the frame sorted per pixel, not per tile

**Status, 2026-10-27: a spec, revised after Primary's scan against the engine (#520), not built; ruled by Michael in session (`02`, 2026-10-26, A depth buffer).** Written from `origin/main` at ece297c1 and checked against bb52ef0b. One build step, one issue, renderer only: nothing in the simulation, the save, the wire, or the sync check changes. A **default** is the spec's own (written by a Secondary), Michael's to overrule. Read `08` (the renderer as it is), `src/gl.js`, and `src/render/scene.js` whole before building; the scan's findings are folded in below and each has a row in the check (section 8).

## 1. Why

Every frame today is one list of walls, posts, props, items, figures, arrows, and fire, sorted by a single number per drawable, the tile's depth `tx + ty` with a small offset by kind, and painted back to front (`render/scene.js`). That is right for a thing that stays inside its tile and wrong for anything that doesn't: a prop whose picture spills into the next tile is covered by that tile's wall; Object Highlight's outline is covered with it (the "two thirds of an outline" Michael sees); wide furniture, tall trees in front of houses, and props against walls clip. Figures alone get a correction (`besideWalls`, `render/entities.js`), a box test that clamps them between the walls around them, which is why people rarely clip and props often do. Upper floors (`49`) add lifted storeys to the same list.

A depth buffer ends the per-tile sort: each pixel keeps the depth of what it last drew and refuses anything farther. A figure half behind a wall is half behind it. Project Zomboid's renderer gives its 2D tiles depth for the same reason, so its 3D models cut into them.

## 2. The geometry

`art/01`: world X and Y run along the ground grid, one unit per screen pixel horizontally, a tile 32 by 32 units; Z is height in screen pixels. `screen x = X − Y`, `screen y = (X + Y) / 2 − Z`, and **depth = X + Y + Z toward the camera.** In grid units a tile is 1, so a point's depth in pixels is `(gx + gy) * 32 + height`. Two points overlap on screen only when one is at `(X + d, Y + d, Z + d)` from the other, `3d` deeper, so a nearer thing is always the larger depth.

**Depth is its own number, computed on the CPU from true geometry.** The scan showed why the vertices' existing `a_world` and `a_height` cannot serve as the depth: a wall face's world points are the light's sample points, set 0.2 to 0.4 tile inside the tile in front on purpose (`walls.js` ~438-444), and its heights count from the frame's bottom, not the floor; moving them would move the light. So **the vertex grows by one float, `depth`** (STRIDE 13 to 14, `a_depth`), set by every emitter; `a_world` and `a_height` go on serving the light and the night pool untouched.

## 3. The depth of each thing

The rule for a standing picture: **its depth plane passes through the front of what it stands for, not its centre.** A sprite's picture reaches to the near corner of its footprint (a prop's frame ends about 16 px below its tile centre on screen; a body's radius is 0.3 tile), and a plane through the centre would put every pixel past the centre behind the ground, the floor, or a wall the thing is in front of. With the front as the reference, a figure stopped 0.3 tile from a back wall is about 28 depth units in front of the wall's near face at every height, and clear of it.

- **A one-tile prop, a floor item, a fire:** the plane through the tile's near corner, `(tx + 0.5, ty + 0.5)`, depth `(tx + ty + 1) * 32 + height`, `height` from 0 at the frame's foot row to the frame's height at its top. A two-tile piece is already sliced per tile (`src/CLAUDE.md`), each slice its own plane.
- **A figure** (a player, a dead one, a villager, an animal): the plane through `(gx + r, gy + r)`, `r` its radius (0.3), so `(gx + gy + 0.6) * 32 + height`. The dead's hits and bars are DOM and unaffected.
- **A wall face:** the true near face of the wall as a plane: for a north wall on `y = ty − 0.5` with thickness `T` in units, the face at `y = ty − 0.5 + T / 2`, its two ends' depths at `x = tx − 0.5` and `tx + 0.5`, plus height from 0 at the floor to 96 at the top (`52`). A west wall likewise on `x`. Posts: the near corner of the post's square. Caps: a horizontal plane at the top, each corner its own depth.
- **Arrows in flight:** the plane through their ground point plus their `z`.
- **The ground and the lifted floors** (`49`): the plane of their corners, height 0 or the storey's.
- **One depth surface per drawable, its quads layered by emit order.** Every quad a drawable emits after its base (a cap redrawn on the sky, a flame over a hearth or a torch tip, a held item, boards and leaves and shutters over a wall, a bracket's torch, the bees' near half, a floor item's halo, a burning body's flames and smoke, the swing outline's 1 px copy, Object Highlight's eight copies) takes **the same plane with a small bias** that increases with emit order (+0.05 a quad, *default*), so today's layering decisions all stand and nothing loses to its own base. Object Highlight's copies and the swing outline take the base's plane minus the bias, behind it.
- **Biases between kinds** (depth units, *defaults*, in one table in `scene.js`): floor items +0.5 over the ground; posts +0.5 over the walls meeting at them (they cover the seam); a lifted floor +1 over the caps of the walls below it (they meet at 96 px exactly); props +1 and figures +2 over the ground. Everything else is its true geometry.

## 4. The two passes, and what is flat

A depth buffer and transparency do not mix: a half-transparent pixel still writes its depth and hides what is behind it. The delivered art is hard alpha (`art/01`; the scan found no soft pixel in the 723 PNGs under `data/art`), but some generated art is not, and several effects are translucent by design. So:

- **Pass 0, the flat things, depth write off.** The ground (its own draw calls, first, as today), then rugs, the tile mark, tracks, floor-lying arrows' pictures, the arrows' shadows, and the landing marker's rings: everything that lies on the ground plane, in today's order, writing no depth. Nothing standing has drawn yet, so they need no test. (`49`'s lifted floors are not flat things: they are standing geometry that must hide what is under them, drawn in pass 1 with their plane's depth and write on.)
- **Pass 1, opaque, depth write on**, the fragment shader discarding alpha under 0.5. Walls and their caps, posts, props, items' standing pictures, figures, arrows, fire particles that are hard. Drawn in today's key order (not front to back: with discard and blending that saves nothing and flips every tie).
- **Pass 2, translucent, depth test on, depth write off**, sorted by today's key, the shader's 0.004 discard only. Marked `translucent` on the drawable:
  - the near walls at `NEAR_WALL_ALPHA` 0.42, **their cut pieces included** (`walls.js` ~174, 283, drawn at 0.42 too), and the posts faded with them;
  - the placement ghost's tint and the remove-ghost;
  - the occluders: any drawable with `FLAG_OCCLUDER` (a canopy 64 px or taller), since the holes fade its alpha in the shader;
  - a dead one **dimmed by the dark** (`dim` < 1, `entities.js` ~216, `sight.js`'s `seenAlpha`), smoke, embers, splinters (`entities.js` ~170-176), a rising rock's dust (`props.js` ~139-147);
  - **the soft generated sheets**, whole: the campfire's, hearth's, torch post's, lantern post's, and snare's shadows and radial glows, the flame sheet's glow, and the burn sheet's smoke (`placeholders.js` ~593-1137, `fire.js` ~176) have alpha between 0 and 1 and would vanish under the test. Each such sheet carries `soft: true` from its generator, and a drawable on a soft sheet goes to pass 2. They keep their place in the picture (pass 2 is depth-tested) and occlude nothing behind them drawn later in pass 2, which today's sort already orders. When those sheets are redrawn hard, the flag goes.
- **Last, on top, depth test off:** the placement ghost's geometry, the landing marker's line, and the hit shapes, as today (`scene.js` ~183-185; *default*, Primary's recommendation: a ghost hidden behind a wall is useless).
- **The fog** (a per-fragment mix), **the night pool** (`poolAt`), **the legibility floor** (`FLAG_STANDING`), and **the lights** are per fragment in the shader and work the same in every pass. **The debug views** are unchanged.

## 5. WebGL

- `gl.depthFunc(gl.LEQUAL)` set explicitly (the default is `LESS`, which gives ties to the first drawn, the wrong way for every bias here); `gl.enable(gl.DEPTH_TEST)` in `setup()`, so it survives a lost context; `gl.depthMask(true)` **before every `gl.clear`** (the clear honours the mask, and pass 2 leaves it off); the colour and depth cleared together.
- **The range follows the camera, not the light area:** `u_depthBase = (cam.gx + cam.gy) * 32 − 2048`, `z = (depth − u_depthBase) / 4096` into clip space so that larger depth is nearer (negate as the projection needs), with `gl.depthRange(0, 1)`. The view spans under 3000 units in `gx + gy` plus heights under 300 at any window size and zoom, with cellars and three storeys (`49`) inside it; WebGL2 clips outside the range, so the base must move with the camera every frame, never with the chunked light area.
- **Precision:** the context's default depth is guaranteed only 16 bits (65536 steps over 4096 units is 0.0625 unit a step); the biases above are at least 0.05, eight steps or more at that worst case, and most browsers give 24 bits.
- The context stays `{ antialias: false, premultipliedAlpha: true, alpha: false }`; the zoom (`view.js`) scales screen positions only.

## 6. What goes

- `besideWalls` and the key corrections for figures go **once rows 1 to 4 of the check pass** (kept until then; it is the fallback if the front-plane rule is found wanting).
- `computeOcclusion` keeps finding the holes (it compares screen rectangles, which is still right) and stops ordering anything.

## 7. What it changes elsewhere

- `49` step 2 lifts storeys by their height and sorts by it, with the lifted floors in pass 1 and nothing else new in the draw.
- `50`'s ring is emitted as straight faces along the arc with their own points, each face its own plane, the near half in pass 2 when faded and the far half in pass 1.
- Michael's open clipping annoyances (the outlines, props in walls) close with this; the builder checks `bugs.md` and moves what this fixes to Fixed.
- A later refinement, not this step: **a depth image per sprite.** The art generators already compute each pixel's depth (`iso3d.py`, `dep = P.sum(1)`) and throw it away; a second atlas carrying it would make walls and furniture exact to the pixel instead of planar, at the cost of a texture read per fragment. `art/13` asks Michael whether to keep the depth images from the regeneration, so the option stays open; this spec works without them.
- No wiki change: nothing a player can name, though the game looks better. The PR says so in one line.

## 8. The proof: `check("depth")`

A new instrument on `?nosave&mute` with the tab sized (1280 by 800; `testing.md`), on the proving ground, reading canvas pixels at the places it builds and comparing them with what must show there (the prop's colour where the prop must be, the wall's where the wall must; the frame read straight after the draw, as `check("frame")` does):
1. **A figure half behind a wall segment** (on the far side of a west wall, a tile along it): the near pixels the wall's, the far ones the figure's.
2. **A figure against a back wall is whole** (stopped by the collision at the wall): every row of it shows.
3. **A prop against a wall shows whole, with its whole outline** (Object Highlight on it): no column of it is the wall's colour.
4. **A two-tile table beside a wall**, both slices whole; a cupboard's bottom rows show over the floor.
5. **A tree in front of a house**: canopy pixels over the house's wall; a figure two tiles before the tree over its trunk.
6. **A figure walks through a door**: in front, in the doorway, behind.
7. **Overlays stand:** a lit wall cap at night shows lit over its own face (the 2026-10-12 cap bug), a hearth's flame over the hearth, a torch's flame over its bracket, the swing outline green round a targeted dead one, a held sword over the hand.
8. **The faded near wall and its cuts** fade (0.42) over the room; **the canopy hole** cuts round the player behind a tree.
9. **The soft sheets show:** a campfire's glow and shadow, a torch post's halo at night.
10. **The flat things show whole:** a floor item, a lying arrow and its shadow, the landing rings, the tile mark, tracks.
11. **The fog** dims the unseen, **the night pool** climbs a wall, **the legibility floor** holds a figure's brightness; the ghost and the marker draw on top.
12. **No flicker:** two frames of the same still scene are byte-identical; a 3840 by 2160 window at zoom 1.1 draws its bottom rows (the range).
13. **Cost:** frame time on the busiest view (the square at night, a torch lit, twenty of the dead in view) before and after, by `performance.now()` round `renderScene`, within 10%; pass 2's drawable count printed.

`check("frame")` takes a new reference on the first run after the change, as its protocol says. `check("sheets")` is untouched.

## 9. The guest's side

Nothing: the renderer is each client's own. No wire field, no PROTOCOL change, no sync part.

## 10. Build step

One issue. In order, verified in the pane after each: (1) the vertex `depth` float, the range uniform from the camera, `LEQUAL`, the mask before the clear, the alpha test in pass 1; (2) the three passes in `scene.js` with the `translucent` mark and the `soft` sheet flag from the generators; (3) true-geometry depth on every emitter (section 3), the per-drawable surface with emit-order biases, the kind biases; (4) `check("depth")`, the frame reference renewed, the cost row; (5) `besideWalls` removed once rows 1 to 4 pass; (6) `08` rewritten in place for the renderer as it now is, `testing.md`'s instruments line, `tools/CLAUDE.md`, the `bugs.md` lines.
