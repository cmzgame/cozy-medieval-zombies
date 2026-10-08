// Copied from cozy-zombie-game src/iso.js on 2026-10-09. Unchanged.
// Isometric math. See docs/03-rendering.md.

export const TW = 64;
export const TH = 32;
export const HW = TW / 2;
export const HH = TH / 2;

let originX = 0;
let originY = 0;

export function setOrigin(x, y) {
  originX = x;
  originY = y;
}

export function getOrigin() {
  return { x: originX, y: originY };
}

// Tile center in canvas pixels.
export function toScreen(gx, gy) {
  return {
    x: (gx - gy) * HW + originX,
    y: (gx + gy) * HH + originY,
  };
}

// Canvas pixels to float grid coordinates. Tile (gx, gy) covers
// [gx - 0.5, gx + 0.5) x [gy - 0.5, gy + 0.5), so Math.round gives the tile.
export function toGrid(sx, sy) {
  const x = sx - originX;
  const y = sy - originY;
  return {
    gx: (x / HW + y / HH) / 2,
    gy: (y / HH - x / HW) / 2,
  };
}

// A screen-space direction vector converted to a grid-space direction.
// Not normalized. Same math as toGrid without the origin.
export function screenDirToGrid(sx, sy) {
  return {
    gx: (sx / HW + sy / HH) / 2,
    gy: (sy / HH - sx / HW) / 2,
  };
}

// A grid-space direction vector converted to a screen-space direction.
export function gridDirToScreen(gx, gy) {
  return { sx: (gx - gy) * HW, sy: (gx + gy) * HH };
}

// Eight facings in clockwise screen order starting at screen-right.
// Index = round(angle / 45deg) where angle is atan2(sy, sx).
export const FACINGS = ["e", "se", "s", "sw", "w", "nw", "n", "ne"];

// Grid vectors per facing (unnormalized). Screen up is grid (-1, -1).
export const DIRS = {
  n: [-1, -1],
  ne: [0, -1],
  e: [1, -1],
  se: [1, 0],
  s: [1, 1],
  sw: [0, 1],
  w: [-1, 1],
  nw: [-1, 0],
};

export function facingFromScreenVector(sx, sy) {
  if (sx === 0 && sy === 0) return "s";
  const angle = Math.atan2(sy, sx);
  let idx = Math.round(angle / (Math.PI / 4));
  idx = ((idx % 8) + 8) % 8;
  return FACINGS[idx];
}

export function normalize(x, y) {
  const len = Math.hypot(x, y);
  if (len === 0) return { x: 0, y: 0 };
  return { x: x / len, y: y / len };
}

// Depth sort key. Higher draws later (nearer the camera).
export function sortKey(gx, gy, gz = 0, tiebreak = 0) {
  return (gx + gy) * 1000 + gz * 10 + tiebreak;
}

// Diamond outline path for a tile, centered at (cx, cy).
export function tilePath(ctx, cx, cy) {
  ctx.beginPath();
  ctx.moveTo(cx, cy - HH);
  ctx.lineTo(cx + HW, cy);
  ctx.lineTo(cx, cy + HH);
  ctx.lineTo(cx - HW, cy);
  ctx.closePath();
}
