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

// The vertical plane through the ground points (ax, ay) and (bx, by), at any angle (a ring's segment, docs/50 section 4): depth is linear
// in sx along it, A its slope. Seen edge on (the two a column apart or less), the billboard through their middle.
export function planeThrough(ax, ay, bx, by) {
  const a = at(ax, ay);
  const b = at(bx, by);
  const dsx = b.sx - a.sx;
  if (Math.abs(dsx) < 0.5) return billboard((ax + bx) / 2, (ay + by) / 2);
  const A = (b.d + b.sy - (a.d + a.sy)) / dsx;
  return { A, C: a.d + a.sy - A * a.sx };
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
  let d = s.xF === undefined || Number.isNaN(s.xF) ? s.A * sx - sy + s.C : s.C - sy - 1.5 * Math.abs(sx - s.xF);
  for (const f of [s.floorL, s.floorR]) if (f) d = Math.max(d, f.A * sx - sy + f.C);
  return d;
}

// A ridge held off the walls on its own tile's back edges (docs/51 section 3, rows 3 and 4 of the check): a footprint's south-east
// face runs back to the tile's north edge and its south-west face to its west edge, so where a wall stands on that edge the back
// of the face lies inside the wall's half-thickness (a full tile's right face behind a north wall of 14 from 25 px right of its front
// corner on), and art that reaches there (a table's top, a chest's lid) would be cut by the wall it stands against. There the
// surface follows the wall's near face instead (its plane, `floorR` for a north wall, `floorL` for a west one: depth is the most
// of the ridge and those planes), so a prop against a wall is never behind it; the drawable's bias keeps it a little in front.
// `Tn` and `Tw` are the walls' thicknesses in units, 0 where the edge has none. A billboard is held so too when it stands on such a tile
// (a floor item's block, a crop): a tree's canopy (`canopy`) is never held, its billboard reaching far past its tile.
export function againstWalls(s, tx, ty, Tn, Tw) {
  if (!Tn && !Tw) return s;
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
// through that corner (a canopy far wider than its tile would fall back 1.5 a column on the split planes); and for a prop that is
// walked through (`solid` false: a crop, a mushroom, an herb, a sapling) a billboard through its tile's centre, so a figure standing on
// its tile at or before the centre is drawn over it and one behind the centre is covered by it, as the sort drew them (the review of
// #530: on its two front faces a crop covered the legs of a figure walking its row).
export function propSlice(tx, ty, canopy = false, walked = false, dy = 0) {
  if (walked) return billboardBelow(tx, ty, dy); // through where it stands: a forage mushroom's offset moves it up to a third of a tile
  return canopy ? billboard(tx + 0.5, ty + 0.5) : ridge(tx + 0.5, ty + 0.5);
}

// A billboard through the ground point `dy` screen pixels below the tile centre (tx, ty), on its column: a floor item's block, by the
// row of its own front foot (a pile's blocks are fanned back and up from the tile's centre).
export function billboardBelow(tx, ty, dy) {
  return billboard(tx + dy / (2 * iso.HH), ty + dy / (2 * iso.HH));
}

// A wall segment's near face: a north wall of tile (tx, ty) on y = ty - 0.5, a west wall on x = tx - 0.5, its face toward the camera
// half the wall's thickness T (units) nearer.
export function wallFace(edge, tx, ty, T) {
  return edge === "n" ? planeY(ty - 0.5 + T / 2 / UNIT) : planeX(tx - 0.5 + T / 2 / UNIT);
}

// A wall segment's surface: its near face, and from a column short of its camera-side end the end's own face (the wall's thickness
// seen end on), a ridge on the near face. A segment's picture reaches past its end (its thickness, its cap's end), and on the near
// face's plane those pixels tied with the next segment's face, which the float rounding of two triangles broke either way: the joints
// of a run of wall showed the end of the segment behind through the one in front. On the end's plane they lie behind the next segment,
// as they are, and in front of what is beyond a free end. A north wall's camera-side end is its east end, on screen right (the face
// along x left of the ridge, the end along y right of it); a west wall's is its south end, on screen left. `shift` (grid units) moves
// the ridge that far back along the face from the end: the drawn post at a segment's camera-side end is wider than the wall
// (render/walls.js), and its face, flush with the walls' and a little behind them (scene.js DEPTH_BIAS), shows over the last of the
// segment as the sort drew it, while the segment that begins at the post covers it.
export function wallSurface(edge, tx, ty, T, shift = 0) {
  const t = T / 2 / UNIT;
  return edge === "n" ? ridge(tx + 0.5 - shift, ty - 0.5 + t) : ridge(tx - 0.5 + t, ty + 0.5 - shift);
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
