# 08 — Milestone 2b: the WebGL renderer, portals, and light per pixel

**Status, 2026-10-16: built (all three phases on 2026-10-09; the Canvas 2D renderer deleted); a reference.** The code is the truth: `src/gl.js` (the WebGL2 core) and `src/render.js`, a hub over `src/render/`. As built: one atlas of every sheet and one draw call; the ground one baked quad per chunk (`15`); the world's scale is the zoom, three levels the GPU applies (1.1, 1.8, 2.7; `src/view.js`), not an integer display scale in CSS; the light, ambient, and fog textures cover as many chunks as the window needs (`render/area.js`); the see-through holes are cut in tree canopies only (2026-10-11); the debug views (light, ambient, fog) are on `L`; the fog texture is the local player's sight, each client drawing its own (`31`). The phases, their acceptance, and the parity notes are `history/08-renderer-build.md`.

## The idea

Today the night layer is painted in screen space and then patched so that each thing shows its own light. In WebGL every vertex carries the world position its light should be read from, and the fragment shader samples the light there. A floor pixel reads the light at its own world point, so pools are per pixel. A standing thing reads the light at its foot, as now. A wall face reads the light along its foot line and fades it with height, so a pool climbs the wall it touches. Flames and the HUD-less debug marks read no light at all. Fog is the same mechanism with a second, one-texel-per-tile texture of what the player can see: the floor reads it per pixel, a sprite at its foot. The fog layer, the night layer, the mask canvases, and the ordered pass all go.

## Portals and transmission

- **Transmission.** `transmission(wall)` returns 0..1: a plain wall and a closed door 0, an open shutter and an open doorway 1, a closed shutter `tunables.shutterLeak` (0.05 to start), later glass most and a curtain little. `blocksSight` becomes `transmission < 0.5`. The light ray multiplies through what it crosses and stops at 0; sight is unchanged.
- **Portals as emitters.** In `light.update`, for every opening of every room (the rooms already list them): take the ambient on each side, room or outdoors; if they differ by more than a little, add a source 0.3 tiles off the edge on the darker side, intensity `(bright - dark) × transmission`, radius by kind (`door` 3, `window` 2.5), directional: it lights only the darker side. At night a lit room's open window and door glow outward; by day they pool daylight inward. Sources carry an intensity now, where before every source was 1.
- **The unlit room by day** keeps a reduced version of the openness term as a floor (`tunables.roomBounce`, 0.5 to start) and the portals pool the rest, so a cottage with its door open at noon is bright by the door and dim at the back. Tuned by eye; `roomBounce` 1 gives today's flat room.

## What this must not foreclose

- **Roofs**: a coverage value per tile, separate from whether a roof is drawn, is one more small texture read by the ambient rule.
- **Upper floors**: every lookup and cache already takes a layer; a second layer is a second set of textures drawn in order.
- **Building**: nothing here knows a building; walls are edge state, rooms are found, portals are derived from openings each step, so a wall placed in play lights correctly on the next step.
- **Zoom**: the batch is in screen pixels and the display scale is a uniform; a zoom-out is a different scale.
- **Real art**: a sheet with an image instead of a placeholder uploads the same way.
