// Line of sight over the edge-wall map. See docs/03-world-model.md, "Visibility".
//
// A ray from one tile centre to another is walked edge by edge (Amanatides and
// Woo grid traversal). It is blocked by an opaque wall on any edge it crosses and
// by an opaque prop in any tile it passes through. Glass passes sight, so a
// window reveals a wedge of the far side and nothing else.

import { wallBetween, blocksSight, tileAt } from "./map.js";

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

export function tileKey(x, y) {
  return `${x},${y}`;
}

// The set of tiles (as "x,y" keys) visible from (ox, oy) among `tiles`.
export function computeVisible(ox, oy, tiles) {
  const out = new Set();
  for (const [tx, ty] of tiles) {
    if (lineOfSight(ox, oy, tx, ty)) out.add(tileKey(tx, ty));
  }
  return out;
}
