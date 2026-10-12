// The figure (docs/12-figure.md): the player and the dead drawn from a small
// rig, chunky and big-headed, outlined, two-toned, in eight facings, with
// clothes as rules on the body's parts and items held at the hand joints.
// Everything here is dev art generated at boot through the sprite pipeline;
// real art replaces a sheet, not this code.
//
// Coordinates. A body point is (l, d, h): lateral (the figure's right is
// positive), forward, height above the feet. A facing is a screen direction;
// a point projects to frame pixels (x right, y down) with iso foreshortening
// of the ground plane and a depth used to sort parts far to near. One body
// description therefore gives all eight facings and their draw order.
//
// Drawing. Each part is rasterised into a per-frame buffer without
// anti-aliasing: its silhouette dilated by one pixel in the outline colour,
// then its fill. Later parts cover earlier ones and add their own outline, so
// fused limbs still read, which is the look of Michael's references. A last
// pass lights every fill pixel on its upper-left edge and darkens it on its
// lower-right, which is the two-tone rule with the light from the upper left.

//
// Since 2026-10-12 (docs/23a, D3) the figure is five files under src/figure/ (the rig, the rasteriser,
// the drawing, the held art, the wardrobes); this file re-exports them all, so every importer, the
// tools included, reads what it read before.

export * from "./figure/rig.js";
export * from "./figure/raster.js";
export * from "./figure/draw.js";
export * from "./figure/held.js";
export * from "./figure/wardrobe.js";
