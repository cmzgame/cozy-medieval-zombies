# 51 — A depth buffer: the frame sorted per pixel, not per tile

**Status, 2026-10-26: a spec, not built; ruled by Michael in session (`02`, 2026-10-26, A depth buffer).** Written from `origin/main` at ece297c1. One build step, one issue, renderer only: nothing in the simulation, the save, the wire, or the sync check changes. A **default** is the spec's own (written by a Secondary), Michael's to overrule. Read `08` (the renderer as it is) and `src/gl.js` whole before building.

## 1. Why

Every frame today is one list of walls, posts, props, items, figures, arrows, and fire, sorted by a single number per drawable, the tile's depth `tx + ty` with a small offset by kind, and painted back to front (`render/scene.js`). That is right for a thing that stays inside its tile and wrong for anything that doesn't: a prop whose picture spills into the next tile is covered by that tile's wall; Object Highlight's outline is covered with it (the "two thirds of an outline" Michael sees); wide furniture, tall trees in front of houses, and props against walls clip. Figures alone get a correction (`besideWalls`, `render/entities.js`), a box test that clamps them between the walls around them, which is why people rarely clip and props often do. Upper floors (`49`) add a lifted storey, taller than anything but trees, to the same list.

A depth buffer ends the per-tile sort: each pixel keeps the depth of what it last drew and refuses anything farther. A figure half behind a wall is half behind it. Project Zomboid's renderer gives its 2D tiles depth for the same reason, so its 3D models cut into them.

**It is cheap here because the vertices already carry the depth.** Every vertex has `a_world`, its own ground point in tiles (for reading the light), and `a_height`, its pixels above the foot (for the night pool's climb); `gl.js` sets `gl_Position.z` to 0 and leaves `DEPTH_TEST` off. The style bible's depth is `X + Y + Z`, which is exactly `(a_world.x + a_world.y) * 32 + a_height`. The vertex format does not change, and nothing that emits quads changes its data, bar the few quads that pass one world point for all four corners (section 4).

## 2. The geometry, so the numbers are right

`art/01`: world X and Y run along the ground grid, one unit per screen pixel horizontally, a tile 32 by 32 units; Z is height in screen pixels. `screen x = X − Y`, `screen y = (X + Y) / 2 − Z`, and **depth = X + Y + Z toward the camera.** In the engine's grid units a tile is 1, so a vertex's depth in pixels is `(gx + gy) * 32 + height`.

Two points overlap on screen only when the one farther along the view ray is at `(X + d, Y + d, Z + d)`; its depth is `3d` larger. So a billboard sprite (a figure, a prop, a canopy) standing on its foot, with its top vertices carrying their height, is the correct vertical plane: its head is nearer than its feet, a wall one tile in front hides the head where the wall's face is higher at that pixel, and a canopy 198 px up draws over ground six tiles behind the trunk and under a figure standing two tiles before it. This was checked on paper in `#511`'s discussion; the check in section 7 proves it in pixels.

## 3. The two passes

A depth buffer and transparency do not mix: a half-transparent pixel still writes its depth and hides what is behind it. The art is hard alpha by law (`art/01`: every pixel alpha 0 or 255), so nearly everything is opaque and needs no sorting at all. The few translucent things keep today's sort and draw after.

- **Pass 1, opaque.** Depth test on (nearer wins), depth write on, and the fragment shader **discards fragments with alpha under 0.5** (an alpha test, so a hard-alpha sprite's edge pixels never half-write). No sort is needed; the list is drawn in key order anyway, front to back where it is free, to save fill.
- **Pass 2, translucent.** Depth test on, **depth write off**, sorted by today's key back to front, the shader's 0.004 discard only. What goes here, by a `translucent` mark on the drawable:
  - the near walls at `NEAR_WALL_ALPHA` 0.42 and their posts (`walls.js`, the faded ones; their cut pieces are opaque and stay in pass 1);
  - the placement ghost and the ghost tint;
  - the occluders: any drawable with `FLAG_OCCLUDER` (a canopy 64 px or taller, `props.js`), since the holes fade its alpha in the shader;
  - the arrows' shadows (alpha 0.55) and the landing marker's rings (0.35);
  - anything drawn with an alpha below 1 (`gl.rgb(color, alpha)` with alpha < 1).
- **The ground** is drawn first as today (its own draw calls, `gl.groundQuad` ahead of the batch), with depth write on and depth from its corners' world points; it is a flat plane, nothing changes but the z.
- **Rugs, the tile mark, and tracks** lie flat on the ground: pass 1, with the ground's depth plus a small bias (section 5).
- **The fog** (a per-fragment mix toward the fog colour), **the night pool** (`poolAt`), **the legibility floor** (`FLAG_STANDING`), and **the lights** are all per-fragment in the shader and work the same in both passes.
- **The debug views** (the L key's light, ambient, and fog textures) are unchanged.

## 4. The depth of each thing

In the vertex shader: `depth = (a_world.x + a_world.y) * 32.0 + a_height + a_bias`, written to `gl_Position.z` scaled so that **larger depth is nearer** under the default `LEQUAL` test (negate and divide by the range; section 6). `a_bias` is a small per-drawable number carried in the vertex's flags float's fraction or a new float; *default*: **the vertex grows by one float, `bias`** (STRIDE 13 to 14), set by `gl.quad` and `gl.poly` from an option `bias` (0 by default), since the flags float is read as bits.

Every quad's four vertices must carry **their own** ground point and height, which most already do. Where a drawable passes one world point for all four corners today, give each corner its own:
- **Walls** (`walls.js` `emitDrawnWall`): the face already carries `world: [wa, wb, wb, wa]` and `heights: [h, h, 0, 0]`: the correct vertical plane along the edge. Unchanged.
- **Wall caps and posts' tops**: drawn with one world point and the sky flag today; give the cap's four corners the ground points under them and height `h`, so a cap is a horizontal plane at the top of its wall. The post's two faces likewise (`walls.js` ~377-379 pass one point each).
- **Props, items, figures, fire, arrows** (`props.js`, `entities.js`, `fire.js`): a billboard at the foot: `world` the foot for all four, `heights: [fh, fh, 0, 0]` where `fh` is the frame's drawn height. Today most pass `heights: 0` (a flat billboard at the foot's depth): change them to carry the height. An arrow in flight carries its foot `(gx, gy)` and `heights` from its `z` upward.
- **Two-tile furniture** is already sliced per tile (`src/CLAUDE.md`); each slice is its own billboard at its tile's foot.
- **Object Highlight's copies** (`render/highlight.js`): the eight flat copies take the sprite's depth with a bias of −1 (behind it).
- **Paintings, hangings, brackets**: the wall's plane at their place, bias +1 (in front of the face).

## 5. Biases, in depth units (pixels)

Ties flicker, so every kind that can share a depth with another gets a bias. *Defaults*; keep the list in one place in `scene.js`:
- ground 0; rugs +0.5; the tile mark +0.6; tracks +0.7; floor items +1;
- walls 0; wall caps 0; posts +0.25 (they cover the seam where two faces meet at a vertical edge);
- paintings and brackets +1 over their wall's face;
- props +2; figures +3 (a figure on a crop's tile stands over the crop); fire particles +3;
- Object Highlight copies: the sprite's bias −1;
- arrows: the arrow's own height does the work; its shadow is pass 2.

The old sub-tile key offsets (`+0.5`, `+0.8`, `+1`, `+2`) stop mattering for pass 1 and stay only as the order of pass 2.

## 6. The range and the precision

Depth is relative to the view: `u_depthBase = (areaOrigin.x + areaOrigin.y) * 32 − 1024` (the area the light textures are built for, `render/area.js`, already a uniform), and `z = −(depth − u_depthBase) / 8192`, clamped by the GPU. The view spans about ninety tiles in `gx + gy` (2900 px) plus heights under 300, so 8192 units is twice what is needed, and a 24-bit depth buffer (the context's default `depth: true`; `gl.js` sets `antialias: false, premultipliedAlpha: true, alpha: false` and nothing about depth, so it has one) resolves it to a small fraction of a pixel. `gl.clear` clears depth with colour each frame. The GPU zoom (`view.js`) scales screen positions only; depth is untouched.

## 7. The proof: `check("depth")` and the frame check

A new instrument, run on `?nosave&mute` with the tab sized (1280 by 800; `testing.md`), that reads pixels from the canvas at the places it builds, on the proving ground, and compares them with what it expects (a prop's colour where the prop must show, the wall's where the wall must):
1. **A figure half behind a wall segment** (standing on the far side of a west wall, a tile along it): the near pixels show the wall, the far ones the figure.
2. **A prop against a wall shows whole, with its whole outline** (Object Highlight set on it): no column of it is the wall's colour.
3. **A two-tile table beside a wall**, both slices whole.
4. **A tree in front of a house**: canopy pixels over the house's wall; and a figure two tiles before the tree draws over its trunk.
5. **A figure walks through a door**: in front, in the doorway, and behind, each frame right.
6. **The faded near wall** still fades (0.42) over the room, and its cut pieces stay solid.
7. **The canopy hole** still cuts round the player behind a tree.
8. **The fog** still dims the unseen, **the night pool** still climbs a wall (`climb`), and **the legibility floor** still holds a figure's brightness.
9. **No flicker**: two frames of the same still scene are byte-identical.
10. **Cost**: frame time on the busiest view (the square at night, a torch lit, twenty of the dead in view) before and after, by `performance.now()` round `renderScene`, within 10%; pass 2's drawable count printed.

`check("frame")` (byte-identical frames across boots) takes a new reference on the first run after the change, as its own protocol says. `check("sheets")` is untouched (no sheet changes).

## 8. What it changes elsewhere

- `besideWalls` and `computeOcclusion`'s rect-based ordering go; `computeOcclusion` keeps finding the holes (it compares screen rectangles, which is still right).
- `49` step 2 (drawing the storeys) loses its "measure the lifted sort, depth buffer as the fallback": the storeys lift by their height and sort by it.
- `50`'s per-tile ring slices are still wanted (each slice's foot is its tile), and sort by depth.
- Michael's open clipping annoyances (`bugs.md`'s outline and clipping lines, if any are filed) close with this; the builder checks `bugs.md` and moves what this fixes to Fixed.
- No wiki change: nothing a player can name, though the game looks better. The PR says so in one line.

## 9. The guest's side

Nothing: the renderer is each client's own. A guest draws its replica with the same code. No wire field, no PROTOCOL change, no sync part.

## 10. Build step

One issue. In order, verified in the pane after each: (1) the vertex `bias` float, depth in the vertex shader, the range uniform, depth test and clear, the alpha test in pass 1; (2) the two passes in `scene.js` with the `translucent` mark on the drawables listed in section 3; (3) per-vertex world points and heights on caps, posts, props, items, figures, fire, and arrows; the biases; (4) remove `besideWalls` and the key corrections; (5) `check("depth")`, the frame reference renewed, the cost row; (6) `08` rewritten in place for the renderer as it now is (the two passes, the depth, the biases), `testing.md`'s instruments line, `tools/CLAUDE.md`, the `bugs.md` lines.
