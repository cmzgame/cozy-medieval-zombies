# 08 — Milestone 2b: the WebGL renderer, portals, and light per pixel

**Status, 2026-10-13: built** (all three phases on 2026-10-09; the Canvas 2D renderer deleted). The code is the truth (`src/gl.js`, `src/render.js` a hub over `src/render/`); since this was written: one atlas and one draw call, and the ground one baked quad per chunk (the notes under Phase 2); the world's scale is the zoom, three levels the GPU applies (1.1, 1.8, 2.7; `src/view.js`), not an integer display scale in CSS; the light, ambient, and fog textures cover as many chunks as the window needs rather than five by five (`render/area.js`); the see-through holes are cut in tree canopies only (2026-10-11); the debug views are on `L` (light, ambient, fog); the fog texture is the local player's sight, each client drawing its own (`31`).

Ruled 2026-10-09 (`02-decisions.md`, "The renderer goes to WebGL"). The night layer in Canvas 2D reached "good for now" after a day of exceptions, and the things Michael still wanted (a pool climbing a wall, his own pool on the wall beside him, a tree lit at the trunk and dark at the crown) are light per pixel, which Canvas 2D cannot do. The outside spec Michael brought back recommended PixiJS; he chose raw WebGL2, since with me writing it a library buys little and we own the pipeline. The pause on gameplay is accepted: openings and combat will be written against what this produces.

## What stays

Everything outside drawing. `map.js`, `visibility.js`, `light.js`, `clock.js`, the entities, `interact.js`, `items.js`, the map and sprite files, and the DOM UI. The placeholder generators keep drawing into canvases, and a canvas uploads as a texture with nearest sampling, so the art pipeline is untouched and real art still replaces files, not code. The drawable list and its sort key stay: `renderScene` builds the same list of walls, posts, props, and characters in the same order; only what happens to each entry changes.

## The idea

Today the night layer is painted in screen space and then patched so that each thing shows its own light. In WebGL every vertex carries the world position its light should be read from, and the fragment shader samples the light there. A floor pixel reads the light at its own world point, so pools are per pixel. A standing thing reads the light at its foot, as now. A wall face reads the light along its foot line and fades it with height, so a pool climbs the wall it touches. Flames and the HUD-less debug marks read no light at all. Fog is the same mechanism with a second, one-texel-per-tile texture of what the player can see: the floor reads it per pixel, a sprite at its foot. The fog layer, the night layer, the mask canvases, and the ordered pass all go.

## Phase 1 — portals, transmission, the floor field (in the current renderer)

Renderer-independent, so built and proven first.

- **Transmission.** `transmission(wall)` returns 0..1: a plain wall and a closed door 0, an open shutter and an open doorway 1, a closed shutter `tunables.shutterLeak` (0.05 to start), later glass most and a curtain little. `blocksSight` becomes `transmission < 0.5`. The light ray multiplies through what it crosses and stops at 0; sight is unchanged.
- **Portals as emitters.** In `light.update`, for every opening of every room (the rooms already list them): take the ambient on each side, room or outdoors; if they differ by more than a little, add a source 0.3 tiles off the edge on the darker side, intensity `(bright - dark) × transmission`, radius by kind (`door` 3, `window` 2.5), directional: it lights only the darker side. At night a lit room's open window and door glow outward; by day they pool daylight inward. Sources carry an intensity now, where before every source was 1.
- **The unlit room by day** keeps a reduced version of the openness term as a floor (`tunables.roomBounce`, 0.5 to start) and the portals pool the rest, so a cottage with its door open at noon is bright by the door and dim at the back. Tuned by eye; `roomBounce` 1 gives today's flat room.
- **The floor field.** `tileAt(x, y, layer = 0)`, `chunkKey(cx, cy, layer = 0)`, light caches keyed with the layer, entities carry `layer: 0`. Nothing else changes and nothing returns for a layer other than 0.
- **Flicker as data.** `fire.flicker: { amp, speed }` on the definition. It is applied in Phase 3 where the light map is composed on the GPU; in Phase 1 it is only read.

Accept when: at midnight, a lit cottage with the hearth far from its window still throws a warm patch outside that window and a bigger one out the door; shutter the window and the patch is gone; at noon with the door open the floor by the door is bright and the far corner dim; the player's sight through everything is exactly as before.

## Phase 2 — the WebGL renderer, at parity

`src/gl.js` and a rewritten `render.js`, behind the same `renderScene` signature. The old `render.js` was kept as `render-canvas.js` on a `G` key for the side-by-side until Phase 3 was accepted on 2026-10-09, then deleted.

- **Context.** WebGL2 on the same canvas, `antialias: false`, `premultipliedAlpha: true`. Integer display scaling stays CSS. If WebGL2 is missing, say so on the debug corner; no fallback renderer.
- **Textures.** One per sprite sheet, uploaded from its canvas at load, `NEAREST` and `CLAMP_TO_EDGE`. A 1×1 white texture for flat polygons (posts, swung leaves, brackets, debug marks). Sheets are not atlased; a draw call per run of consecutive drawables that share a texture, which is a few hundred calls a frame at most. Atlas later only if it shows. *(As built: one atlas of every sheet, 4096 square, and one draw call; `src/gl.js`, and `23-engine-upgrade.md` on its budget.)*
- **The quad batch.** One interleaved vertex buffer rebuilt each frame: screen x and y, texture u and v, light-sample world x and y, height above that foot in pixels, a colour multiplier with alpha (translucent near walls, flat colours), and a flags byte (emissive, occluder). Every drawable emits quads or triangles into it in sort order. Floors emit one quad per tile in view, from the floor sheet, with world coordinates interpolated across the diamond. *(Since 2026-10-11 the ground is one baked picture per chunk drawn as one quad, `15-ground.md`; the per-pixel light read is the same.)*
- **The light texture.** The CPU light maps are unchanged; they are uploaded as a single `R8` texture covering the chunks around the camera (five by five chunks at two cells per tile), rebuilt when any of those maps changes or the camera changes chunk. A second `R8` texture at one texel per tile over the same area holds ambient: the room's ambient on room tiles, the outdoor ambient elsewhere. The carried pool is the same ray polygon, drawn additively into a per-frame copy of the light texture with a gradient. Sampling is `LINEAR` for the parent's look and `NEAREST` for the per-cell look, one toggle.
- **The fog texture.** `R8`, one texel per tile over the same area, 1 where the player can see. Rebuilt when the visible set changes, which is already only when the player or camera changes tile.
- **The fragment shader.** For a scene pixel: `ambient` from the ambient texture at the sample point, `static` from the light texture, `light = min(1, ambient + static)`, darkness from the same `darknessOf` curve as today, then the night tint applied by the same multiply as the Canvas 2D layer, then the fog's shade where the fog texture reads 0. Emissive pixels skip all of it. Occluded characters show through occluders by a per-fragment hole: hole centres are uniforms (eight at most), occluder fragments fade within the hole radius, which replaces the mask canvas.
- **Walls** keep their frames from the wall sheet; their faces carry the foot line as the world sample and the pixel's height; their tops carry the sky (ambient only, no height). Posts, swung leaves, and brackets become flat-coloured triangles from the same polygons that draw them today. Translucent near walls are the same quads at alpha 0.42, which is what they always were.
- **Parity.** Phase 2 is done when the four views that broke the Canvas 2D night (the doorway, the yard with the lit cottage, the forest with the torch, noon) look the same as the ordered pass, and the frame costs less. The old renderer is one import away for a side-by-side.

## Phase 3 — the payoff

- **Light climbs walls.** The face fragment's light is the light at its foot point, attenuated by its height over a wall's worth of pixels, so a campfire by a wall lights the wall's base and a torch bracket lights its own wall. The player's pool and the carried torch do the same.
- **Flicker.** The chunk maps keep one layer per source (four at most per chunk, the rest summed), and the upload sums them with each source's flicker weight for this frame, so flames flicker in the light and not just in the sprite without touching the ray grid.
- **Debug views.** On a key: the light texture as it is, the ambient texture, the fog texture, the blockers and transmitters as coloured edges, chunk boundaries. The spec asked for these and the Canvas 2D days wanted them.
- **Legibility.** The dead in the dark stay dim shapes, never hidden; the player and interactable things read at every hour. If the per-pixel night makes something unreadable, a floor on sprite light is one tunable.

## What this must not foreclose

- **Roofs**: a coverage value per tile, separate from whether a roof is drawn, is one more small texture read by the ambient rule.
- **Upper floors**: every lookup and cache already takes a layer; a second layer is a second set of textures drawn in order.
- **Building**: nothing here knows a building; walls are edge state, rooms are found, portals are derived from openings each step, so a wall placed in play lights correctly on the next step.
- **Zoom**: the batch is in screen pixels and the display scale is a uniform; a zoom-out is a different scale.
- **Real art**: a sheet with an image instead of a placeholder uploads the same way.

## Accept when

The eleven scenarios of the outside spec, minus construction and save, which are later milestones; construction is checked by placing a wall from the console and seeing the light change on the next step:

1. Day to night and back is smooth and no texture is modified.
2. A torch lights nearby tiles and an opaque wall blocks it.
3. A fireplace in a closed room lights it and throws a smaller patch outside through the window; replacing the window with wall removes the patch.
4. Opening a door lets more light through; closing it blocks it.
5. A wall placed from the console changes the light on the next step without a rebuild of anything but the chunks it touches.
6. Several lights in view at once, no global scan.
7. No seams at chunk edges in the light or the floor.
8. Characters sort correctly against walls, trees, and furniture.
9. Lookups take a layer and it is always 0.
10. Pixels are crisp at 2x and the night never makes the player or a door unreadable.
11. The four views that broke the Canvas 2D night look right, and a campfire by a wall lights the wall.

Plus Michael's eye, on the whole, and the frame budget: under 4 ms for the renderer with every fire in view.

## Order

Phase 1, then a pause for Michael to see portals in the current renderer. Phase 2 to parity, a pause. Phase 3, then the acceptance list. Then openings.
