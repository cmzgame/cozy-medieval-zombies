// Line of sight over the edge-wall map. See docs/history/03-world-model-plan.md, "Rendering with a camera" (the Visibility bullet; moved by the sweep, 2026-10-16).
//
// A ray from one tile centre to another is walked edge by edge (Amanatides and
// Woo grid traversal). It is blocked by an opaque wall on any edge it crosses and
// by an opaque prop in any tile it passes through. Glass passes sight, so a
// window reveals a wedge of the far side and nothing else.

import { wallBetween, blocksSight, blocksReach, tileAt, peekTile, blankTile, edgeBetween, transmission, gateShotHeight, wallRule, loadedChunks, stairAt, stairAlong, riseOn, STOREY, VOID, HOLE } from "./map.js";
import { getDef } from "./assets.js";
import { DOOR_TOP, WINDOW_SILL, WINDOW_TOP } from "./placeholders.js";
import { sight as ST } from "./tuning.js";

const MAX_STEPS = 400;

export function lineOfSight(ax, ay, bx, by, layer = 0, blocks = blocksSight) { // on one layer (docs/49), the flat case of `trace` below; `blocks` is what stops the ray (sight; or reach, below)
  let ix = Math.round(ax);
  let iy = Math.round(ay);
  const tx = Math.round(bx);
  const ty = Math.round(by);
  if (ix === tx && iy === ty) return true;
  const dx = bx - ax;
  const dy = by - ay;
  const stepX = Math.sign(dx);
  const stepY = Math.sign(dy);
  let tMaxX = dx !== 0 ? ((stepX > 0 ? ix + 0.5 : ix - 0.5) - ax) / dx : Infinity;
  let tMaxY = dy !== 0 ? ((stepY > 0 ? iy + 0.5 : iy - 0.5) - ay) / dy : Infinity;
  const tDeltaX = dx !== 0 ? Math.abs(1 / dx) : Infinity;
  const tDeltaY = dy !== 0 ? Math.abs(1 / dy) : Infinity;
  let guard = 0;
  while ((ix !== tx || iy !== ty) && guard++ < MAX_STEPS) {
    if (tMaxX < tMaxY) {
      const nx = ix + stepX;
      if (blocks(wallBetween(ix, iy, nx, iy, layer))) return false;
      ix = nx;
      tMaxX += tDeltaX;
    } else {
      const ny = iy + stepY;
      if (blocks(wallBetween(ix, iy, ix, ny, layer))) return false;
      iy = ny;
      tMaxY += tDeltaY;
    }
    if (ix !== tx || iy !== ty) {
      const p = tileAt(ix, iy, layer).prop;
      if (p && p.opaque) return false;
    }
  }
  return true;
}

// The same ray for a blow or a bite: stopped by what stops sight, and by a shut castle gate's bars too (docs/02, 2026-10-29: bites and melee do not pass a
// closed gate, though sight and arrows do).
export function lineOfReach(ax, ay, bx, by, layer = 0) {
  return lineOfSight(ax, ay, bx, by, layer, blocksReach);
}

// The window or door a line of sight passes through, or null: the first opening that is not a wall on the way (a window with
// its shutters open, a door open, a broken one: whatever lets the sight through), as { wall, tx, ty, edge }. The dead
// remember the opening through which they saw a player inside (zombie.js `noteSighting`, #147).
export function openingOnLine(ax, ay, bx, by, layer = 0) {
  let ix = Math.round(ax);
  let iy = Math.round(ay);
  const tx = Math.round(bx);
  const ty = Math.round(by);
  if (ix === tx && iy === ty) return null;
  const dx = bx - ax;
  const dy = by - ay;
  const stepX = Math.sign(dx);
  const stepY = Math.sign(dy);
  let tMaxX = dx !== 0 ? ((stepX > 0 ? ix + 0.5 : ix - 0.5) - ax) / dx : Infinity;
  let tMaxY = dy !== 0 ? ((stepY > 0 ? iy + 0.5 : iy - 0.5) - ay) / dy : Infinity;
  const tDeltaX = dx !== 0 ? Math.abs(1 / dx) : Infinity;
  const tDeltaY = dy !== 0 ? Math.abs(1 / dy) : Infinity;
  let guard = 0;
  while ((ix !== tx || iy !== ty) && guard++ < MAX_STEPS) {
    let nx = ix;
    let ny = iy;
    if (tMaxX < tMaxY) { nx = ix + stepX; tMaxX += tDeltaX; } else { ny = iy + stepY; tMaxY += tDeltaY; }
    const wall = wallBetween(ix, iy, nx, ny, layer);
    if (wall && (wall.kind === "window" || wall.kind === "door")) {
      const [ex, ey, edge] = edgeBetween(ix, iy, nx, ny);
      return { wall, tx: ex, ty: ey, edge };
    }
    ix = nx;
    iy = ny;
  }
  return null;
}

// Numeric tile keys, so a visibility set costs no string allocation.
const KEY_OFF = 32768;
export function tileKey(x, y) {
  return (x + KEY_OFF) * 65536 + (y + KEY_OFF);
}

// A tile counts as visible if its centre can be seen, or failing that any of
// four points near its corners. One ray per tile left pizza-slice slivers
// behind wall ends, where a tile mostly in view lost its centre line to the
// corner (Michael, 2026-10-09). The extra rays only run for tiles whose
// centre is hidden.
const CORNER = 0.42;
const CORNERS = [[-CORNER, -CORNER], [CORNER, -CORNER], [-CORNER, CORNER], [CORNER, CORNER]];

export function tileVisible(ox, oy, tx, ty, layer = 0) { // seen from a layer, on that layer (docs/49); across storeys it is `tileSeen` below
  if (lineOfSight(ox, oy, tx, ty, layer)) return true;
  for (const [dx, dy] of CORNERS) {
    if (lineOfSight(ox, oy, tx + dx, ty + dy, layer)) return true;
  }
  return false;
}

// The set of tiles (as numeric keys) visible from (ox, oy) among `tiles`.
export function computeVisible(ox, oy, tiles, layer = 0) {
  const out = new Set();
  for (const [tx, ty] of tiles) {
    if (tileVisible(ox, oy, tx, ty, layer)) out.add(tileKey(tx, ty));
  }
  return out;
}

// ---- Height: one walk for sight across storeys (docs/53 section 6.1, step 1) ----
//
// Height is world pixels above the ground: a layer is `STOREY` of them, a body's foot `STOREY layer + rise`, its eye `EYE` above that and its
// chest `CHEST`. Every occluder on a layer is a band of heights over that layer's floor: a wall from the floor to its own height (a stone or
// wooden wall and a cliff 96, a fence 36, a battlement 28), an opening passing what its leaf leaves open (an open door under 64, an open
// window from 24 to 64, a castle gate under its crown), and a floored tile a plane at the layer's height. `trace` walks a segment edge by
// edge over the grid as `lineOfSight` does, and at each crossing asks the wall on the layer whose storey holds the segment's height there;
// inside each tile it asks for a floor plane between the heights it enters and leaves at. Two bodies on one layer, neither on a stair, are
// `lineOfSight` itself, so everything on one storey is seen exactly as before.
export const EYE = 40; // px over the foot: the head's centre is at 38 (figure/rig.js)
export const CHEST = 30; // px over the foot: the bow's `z0`, where a body is looked at

// The top of a wall over its own layer's floor: its definition's `wall.height`, else `fallback` (a full storey).
export function heightOfWall(wall, fallback = STOREY) {
  try {
    const d = getDef(wall.sprite);
    if (d && d.wall && typeof d.wall.height === "number") return d.wall.height;
  } catch {
    // not loaded: the fallback
  }
  return fallback;
}

// Whether sight passes a wall at `zr` px over its layer's floor: over its top always; under it as `transmission` says, and an opening only
// through the gap its leaf leaves (a window from its sill to its head, a door under its head, a castle gate under its crown).
export function sightPasses(wall, zr) {
  if (!wall || zr >= heightOfWall(wall)) return true;
  if (transmission(wall) < 0.5) return false;
  if (wall.kind === "window") return zr >= WINDOW_SILL && zr < WINDOW_TOP;
  if (wall.kind === "door") return zr < (gateShotHeight(wall) || (wallRule(wall.sprite).seeThrough ? Infinity : DOOR_TOP));
  return true;
}

// Whether (x, y) on layer k has a floor that is a plane: anything but the void and a hole (a stairwell is void). Read without growing.
export function planeAt(x, y, k) {
  const t = peekTile(x, y, k) || blankTile(k);
  return t.floor !== VOID && t.floor !== HOLE;
}

const layerAtZ = (z) => Math.floor(z / STOREY);
const footOf = (e) => STOREY * (e.layer || 0) + (e.rise || 0);

// The floor a blow or a bite between two bodies is read on, or null when none can land: their own when they share one, and across a stair's
// top (docs/53 step 5, the one exception to "on one layer"): one on a stair a floor below the other, their feet within half a storey, read on
// the upper floor, where the stair's sides close its well.
export function reachLayer(a, b) {
  const la = a.layer || 0;
  const lb = b.layer || 0;
  if (la === lb) return la;
  if (Math.abs(la - lb) !== 1 || Math.abs(footOf(a) - footOf(b)) > STOREY / 2) return null;
  const low = la < lb ? a : b;
  return stairAt(Math.round(low.gx), Math.round(low.gy), low.layer || 0) ? Math.max(la, lb) : null;
}
// A body's eye and chest as the points `trace` takes; `lean` lets the walk start or end at the opening the body stands at (below).
export const eyeOf = (e) => ({ x: e.gx, y: e.gy, z: footOf(e) + EYE, layer: e.layer || 0, rise: e.rise || 0, lean: true });
export const chestOf = (e) => ({ x: e.gx, y: e.gy, z: footOf(e) + CHEST, layer: e.layer || 0, rise: e.rise || 0, lean: true });

// Leaning out (docs/53 section 6.1, `49` section 7; a default): a body within `sight.leanReach` of an edge it looks out over, whose wall passes
// sight at eye height (none, a battlement, an open window) with no floor beyond it on the body's own layer (a drop), looks from the edge
// itself, so the foot of the wall below is in sight; the rule is symmetric, so it is seen there from below.
function leanEdge(ix, iy, nx, ny, layer) {
  return !planeAt(nx, ny, layer) && sightPasses(wallBetween(ix, iy, nx, ny, layer), EYE);
}

// Whether the segment from a to b ({ x, y, z, layer, rise, lean }) is clear for sight.
export function trace(a, b) {
  if (a.layer === b.layer && !a.rise && !b.rise) return lineOfSight(a.x, a.y, b.x, b.y, a.layer);
  let ix = Math.round(a.x);
  let iy = Math.round(a.y);
  const tx = Math.round(b.x);
  const ty = Math.round(b.y);
  if (ix === tx && iy === ty) return !crossesPlane(ix, iy, a.z, b.z);
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const stepX = Math.sign(dx);
  const stepY = Math.sign(dy);
  let tMaxX = dx !== 0 ? ((stepX > 0 ? ix + 0.5 : ix - 0.5) - a.x) / dx : Infinity;
  let tMaxY = dy !== 0 ? ((stepY > 0 ? iy + 0.5 : iy - 0.5) - a.y) / dy : Infinity;
  const tDeltaX = dx !== 0 ? Math.abs(1 / dx) : Infinity;
  const tDeltaY = dy !== 0 ? Math.abs(1 / dy) : Infinity;
  const len = Math.hypot(dx, dy);
  const reach = ST.leanReach;
  let zPrev = a.z;
  let first = true;
  let guard = 0;
  while ((ix !== tx || iy !== ty) && guard++ < MAX_STEPS) {
    let nx = ix;
    let ny = iy;
    let t;
    if (tMaxX < tMaxY) { nx = ix + stepX; t = tMaxX; tMaxX += tDeltaX; } else { ny = iy + stepY; t = tMaxY; tMaxY += tDeltaY; }
    const z = a.z + (b.z - a.z) * t;
    const intoB = nx === tx && ny === ty;
    const leanA = first && a.lean && t * len <= reach && leanEdge(ix, iy, nx, ny, a.layer);
    if (!leanA && crossesPlane(ix, iy, zPrev, z)) return false; // a floor in the tile just left
    if (intoB && b.lean && (1 - t) * len <= reach && leanEdge(nx, ny, ix, iy, b.layer)) return true; // b leans out over this edge toward a
    if (!leanA) {
      const L = layerAtZ(z);
      if (!sightPasses(wallBetween(ix, iy, nx, ny, L), z - STOREY * L)) return false;
      if (!intoB) {
        const p = tileAt(nx, ny, L).prop;
        if (p && p.opaque) return false;
      }
    }
    first = false;
    zPrev = z;
    ix = nx;
    iy = ny;
  }
  return !crossesPlane(tx, ty, zPrev, b.z);
}

// Whether a segment inside tile (x, y), going from height z0 to z1, passes a floor plane there.
function crossesPlane(x, y, z0, z1) {
  if (z0 === z1) return false;
  const lo = Math.min(z0, z1);
  const hi = Math.max(z0, z1);
  for (let k = Math.floor(lo / STOREY) + 1; k * STOREY < hi; k++) if (planeAt(x, y, k)) return true;
  return false;
}

// The rise a body standing at the middle of tile (x, y) of layer L has: a stair's height there, else none (the review of #601: a body on a
// stair is looked at where it stands, not at the stair's foot).
function riseAtTile(x, y, L) {
  const st = stairAt(x, y, L);
  return st && !st.well ? riseOn(st.s, stairAlong(st.s, x, y).t) : 0;
}

// A tile of layer `L` seen by a viewer: on the viewer's own layer by the flat walk, else by `trace` from the eye to the chest of a body
// standing there (on a stair, at its rise), at its middle or failing that at one of the four points near its corners (the screen's
// four-corner rule); `corners` false asks the middle alone (the open air of a storey, which only lights a wall's face and a flight).
export function tileSeen(viewer, tx, ty, L, corners = true) {
  const VL = viewer.layer || 0;
  if (L === VL && !viewer.rise) return tileVisible(viewer.gx, viewer.gy, tx, ty, VL);
  const eye = eyeOf(viewer);
  const rise = riseAtTile(tx, ty, L);
  const z = STOREY * L + rise + CHEST;
  if (trace(eye, { x: tx, y: ty, z, layer: L, rise, lean: false })) return true;
  if (corners) for (const [dx, dy] of CORNERS) if (trace(eye, { x: tx + dx, y: ty + dy, z, layer: L, rise, lean: false })) return true;
  return false;
}

// What a viewer sees, a set of tile keys per layer. The viewer's own layer is the flat set it always was (cast from the tile's centre);
// every other layer the world holds (a cellar's viewer sees only its own) is cast with heights, over the tiles of the view that layer holds:
// a floored tile is seen where a body standing on it would be, and the open air of a void one where a body's chest would be in it (so the
// outside face of an upper wall is lit from the street, by the walls' rule that a wall is seen from either side). `sees(x, y, layer)` answers
// for a body; `on(layer)` is the set a layer's drawing reads.
const EMPTY = new Set();
export class Seen {
  constructor(viewerLayer = 0) { this.layers = new Map(); this.size = 0; this.viewerLayer = viewerLayer; }
  on(L) { return this.layers.get(L) || EMPTY; }
  has(key) { return this.on(this.viewerLayer).has(key); } // the viewer's own layer, as the one flat set always was: a body elsewhere is `sees`
  sees(x, y, L) { return this.on(L).has(tileKey(Math.round(x), Math.round(y))); }
  set(L, keys) { this.layers.set(L, keys); this.size += keys.size; }
}

// Whether a body at (x, y) on layer L is in `visible`: a per-layer set's own layer, or a plain set of keys (a check's) as every layer's.
export function seesIn(visible, x, y, L) {
  return visible.sees ? visible.sees(x, y, L) : visible.has(tileKey(Math.round(x), Math.round(y)));
}

// `tilesFor(L)` is the tiles a layer is drawn over (the renderer's `tilesOf`: a storey's view is shifted by its lift), the view's own tiles
// when absent. The eye is the viewer's tile centre at its own rise (on a stair, as high as it stands).
export function computeSeen(viewer, tiles, tilesFor = null) {
  const VL = viewer.layer || 0;
  const at = { gx: Math.round(viewer.gx), gy: Math.round(viewer.gy), layer: VL, rise: viewer.rise || 0 };
  const out = new Seen(VL);
  out.set(VL, computeVisible(at.gx, at.gy, tilesFor ? tilesFor(VL) : tiles, VL));
  if (VL < 0) return out;
  const layers = new Set([0]);
  for (const c of loadedChunks()) if (c.layer > 0) layers.add(c.layer);
  for (const L of layers) {
    if (L === VL) continue;
    const keys = new Set();
    const hidden = [];
    for (const [x, y] of tilesFor ? tilesFor(L) : tiles) {
      if (L > 0 && !peekTile(x, y, L)) continue;
      if (tileSeen(at, x, y, L, false)) keys.add(tileKey(x, y));
      else hidden.push(x, y);
    }
    // The four-corner rule, where it can matter (the review of #601: four more rays for every hidden tile cost a wide view from a walk 30
    // ms): only a hidden tile beside a seen one is asked at its corners, since a corner seen past a wall's end is always at the edge of
    // what the middles see.
    const add = [];
    for (let i = 0; i < hidden.length; i += 2) {
      const x = hidden[i];
      const y = hidden[i + 1];
      if (!NEIGHBOURS.some(([dx, dy]) => keys.has(tileKey(x + dx, y + dy)))) continue;
      const rise = riseAtTile(x, y, L);
      const z = STOREY * L + rise + CHEST;
      const eye = eyeOf(at);
      if (CORNERS.some(([dx, dy]) => trace(eye, { x: x + dx, y: y + dy, z, layer: L, rise, lean: false }))) add.push(tileKey(x, y));
    }
    for (const k of add) keys.add(k);
    out.set(L, keys);
  }
  return out;
}
const NEIGHBOURS = [[1, 0], [-1, 0], [0, 1], [0, -1]];
