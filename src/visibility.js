// Line of sight over the edge-wall map. See docs/history/03-world-model-plan.md, "Rendering with a camera" (the Visibility bullet; moved by the sweep, 2026-10-16).
//
// A ray from one tile centre to another is walked edge by edge (Amanatides and
// Woo grid traversal). It is blocked by an opaque wall on any edge it crosses and
// by an opaque prop in any tile it passes through. Glass passes sight, so a
// window reveals a wedge of the far side and nothing else.

import { wallBetween, blocksSight, tileAt, edgeBetween } from "./map.js";

const MAX_STEPS = 400;

export function lineOfSight(ax, ay, bx, by) {
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
      if (blocksSight(wallBetween(ix, iy, nx, iy))) return false;
      ix = nx;
      tMaxX += tDeltaX;
    } else {
      const ny = iy + stepY;
      if (blocksSight(wallBetween(ix, iy, ix, ny))) return false;
      iy = ny;
      tMaxY += tDeltaY;
    }
    if (ix !== tx || iy !== ty) {
      const p = tileAt(ix, iy).prop;
      if (p && p.opaque) return false;
    }
  }
  return true;
}

// The window or door a line of sight passes through, or null: the first opening that is not a wall on the way (a window with
// its shutters open, a door open, a broken one: whatever lets the sight through), as { wall, tx, ty, edge }. The dead
// remember the opening through which they saw a player inside (zombie.js `noteSighting`, #147).
export function openingOnLine(ax, ay, bx, by) {
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
    const wall = wallBetween(ix, iy, nx, ny);
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

function tileVisible(ox, oy, tx, ty) {
  if (lineOfSight(ox, oy, tx, ty)) return true;
  for (const [dx, dy] of CORNERS) {
    if (lineOfSight(ox, oy, tx + dx, ty + dy)) return true;
  }
  return false;
}

// The set of tiles (as numeric keys) visible from (ox, oy) among `tiles`.
export function computeVisible(ox, oy, tiles) {
  const out = new Set();
  for (const [tx, ty] of tiles) {
    if (tileVisible(ox, oy, tx, ty)) out.add(tileKey(tx, ty));
  }
  return out;
}
