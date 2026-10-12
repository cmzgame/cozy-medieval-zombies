// The WebGL renderer (docs/08-renderer.md). Builds the drawable list the
// Canvas 2D renderer built before it (the same sort order; that renderer was
// deleted on 2026-10-09 when Michael accepted this one), but every drawable
// pushes quads and polygons into gl.js's batch with the world point its light
// is read from: a floor pixel its own point, a standing thing its foot, a wall
// face a point along its foot line, a wall top the sky. The shader samples
// the light, ambient, and fog textures there, so the night and the fog are
// per pixel and there is no night layer, no fog layer, and no stencil.
//
// Since 2026-10-12 (docs/23a, D5) the renderer is five files under src/render/ (the scene, the area
// textures, walls, props, entities); this file re-exports what the game imports from it.

export { renderScene, night } from "./render/scene.js";
