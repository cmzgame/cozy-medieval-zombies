// The depth surfaces (docs/51 section 3): the plane each drawable's quads take in the depth buffer, from true geometry. The style bible's
// depth is X + Y + Z toward the camera (art/01): a tile 32 units, a pixel of height one, so a point on the ground at grid (gx, gy) is
// (gx + gy) * 32 deep and a pixel h above it h more. Every surface here is a vertical plane, and on screen a vertical plane's depth is
// linear: `depth = A * sx - sy + C` at screen point (sx, sy), A +1.5 for a plane along x (y fixed: a north wall, a footprint's south-west
// face), -1.5 for one along y (x fixed: a west wall, the south-east face), 0 for a billboard square to the view (a figure, a tree). A ridge
// is two such planes meeting at a column: a prop's two front faces, split at its footprint's front corner (gl.js cuts a quad there).
// Pure but for the screen origin (iso.toScreen), which the frame has set before any drawable emits.

import * as iso from "../iso.js";

export const UNIT = 32; // depth units per tile

// The screen point and the depth of a ground point.
function at(gx, gy) {
  const p = iso.toScreen(gx, gy);
  return { sx: p.x, sy: p.y, d: (gx + gy) * UNIT };
}

// The vertical plane y = c (a north wall's face, a footprint's south-west face): depth rises 1.5 a pixel to the right.
export function planeY(c) {
  const p = at(0, c);
  return { A: 1.5, C: p.d - 1.5 * p.sx + p.sy };
}

// The vertical plane x = c (a west wall's face, a footprint's south-east face): depth falls 1.5 a pixel to the right.
export function planeX(c) {
  const p = at(c, 0);
  return { A: -1.5, C: p.d + 1.5 * p.sx + p.sy };
}

// A billboard through the ground point (gx, gy): the same depth across every column, its height above that point's own row on screen.
export function billboard(gx, gy) {
  const p = at(gx, gy);
  return { A: 0, C: p.d + p.sy };
}

// The two front faces of a footprint tile whose near corner is the ground point (gx, gy): left of the corner's column the face along x
// (y = gy), right of it the face along y (x = gx); depth = C - sy - 1.5 |sx - xF|.
export function ridge(gx, gy) {
  const p = at(gx, gy);
  return { C: p.d + p.sy, xF: p.sx };
}

// A surface's depth at a screen point (for the checks; gl.js computes its own per vertex).
export function depthOn(s, sx, sy) {
  if (s.xF === undefined || Number.isNaN(s.xF)) return s.A * sx - sy + s.C;
  let d = s.C - sy - 1.5 * Math.abs(sx - s.xF);
  for (const f of [s.floorL, s.floorR]) if (f) d = Math.max(d, f.A * sx - sy + f.C);
  return d;
}

// A ridge held off the walls on its own tile's back edges (docs/51 section 3, rows 3 and 4 of the check): a footprint's south-east
// face runs back to the tile's north edge and its south-west face to its west edge, so where a wall stands on that edge the back
// of the face lies inside the wall's half-thickness (a full tile's right face behind a north wall of 14 from 25 px right of its front
// corner on), and art that reaches there (a table's top, a chest's lid) would be cut by the wall it stands against. There the
// surface follows the wall's near face instead (its plane, `floorR` for a north wall, `floorL` for a west one: depth is the most
// of the ridge and those planes), so a prop against a wall is never behind it; the drawable's bias keeps it a little in front.
// `Tn` and `Tw` are the walls' thicknesses in units, 0 where the edge has none.
export function againstWalls(s, tx, ty, Tn, Tw) {
  if (s.xF === undefined || (!Tn && !Tw)) return s;
  const out = { ...s };
  if (Tn) out.floorR = wallFace("n", tx, ty, Tn);
  if (Tw) out.floorL = wallFace("w", tx, ty, Tw);
  return out;
}

// The figure's form (docs/51 section 3): the billboard through (gx + r, gy + r), the front of a body of radius r.
export const FIGURE_RADIUS = 0.3;
export function figure(gx, gy) {
  return billboard(gx + FIGURE_RADIUS, gy + FIGURE_RADIUS);
}

// A prop's slice at tile (tx, ty): the ridge of its footprint tile's front corner, or, for a tree or any canopy prop, a billboard
// through that corner (a canopy far wider than its tile would fall back 1.5 a column on the split planes).
export function propSlice(tx, ty, canopy = false) {
  return canopy ? billboard(tx + 0.5, ty + 0.5) : ridge(tx + 0.5, ty + 0.5);
}

// A wall segment's near face: a north wall of tile (tx, ty) on y = ty - 0.5, a west wall on x = tx - 0.5, its face toward the camera
// half the wall's thickness T (units) nearer.
export function wallFace(edge, tx, ty, T) {
  return edge === "n" ? planeY(ty - 0.5 + T / 2 / UNIT) : planeX(tx - 0.5 + T / 2 / UNIT);
}

// An open door's leaf stands square to its wall through the hinge (grid point hx, hy): along y for a north wall's door, along x for a
// west wall's.
export function leaf(edge, hx, hy) {
  return edge === "n" ? planeX(hx) : planeY(hy);
}

// The grid point on a wall's near face line under screen column sx (a hinge found from a leaf's picture).
export function faceAtColumn(edge, tx, ty, T, sx) {
  const o = iso.getOrigin();
  const k = (sx - o.x) / iso.HW; // gx - gy
  if (edge === "n") {
    const gy = ty - 0.5 + T / 2 / UNIT;
    return [gy + k, gy];
  }
  const gx = tx - 0.5 + T / 2 / UNIT;
  return [gx, gx - k];
}
