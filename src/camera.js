// The camera: a float grid position the iso origin is derived from each step.
// iso.js is unchanged from the parent; the camera just moves its origin.

import * as iso from "./iso.js";

export const cam = { gx: 0, gy: 0 };
const FOLLOW = 10; // per second

export function snapTo(gx, gy) {
  cam.gx = gx;
  cam.gy = gy;
}

export function follow(target, dt) {
  const k = Math.min(1, FOLLOW * dt);
  cam.gx += (target.gx - cam.gx) * k;
  cam.gy += (target.gy - cam.gy) * k;
}

// Put the camera position at the canvas centre. Rounded so pixels stay crisp.
export function applyOrigin(w, h) {
  const ox = Math.round(w / 2 - (cam.gx - cam.gy) * iso.HW);
  const oy = Math.round(h / 2 - (cam.gx + cam.gy) * iso.HH);
  iso.setOrigin(ox, oy);
}

// Every tile whose diamond or tall sprite could touch the canvas. The grid
// bounding box of the screen corners is a diamond's bounding box, so about half
// of it is off screen; those are filtered by screen position.
export function viewportTiles(w, h, margin = 2, tallPx = 110) {
  const corners = [iso.toGrid(0, 0), iso.toGrid(w, 0), iso.toGrid(0, h), iso.toGrid(w, h)];
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const c of corners) {
    minX = Math.min(minX, c.gx);
    maxX = Math.max(maxX, c.gx);
    minY = Math.min(minY, c.gy);
    maxY = Math.max(maxY, c.gy);
  }
  const x0 = Math.floor(minX) - margin;
  const y0 = Math.floor(minY) - margin;
  // Tall sprites on tiles below the bottom edge reach up into view.
  const extra = Math.ceil(tallPx / iso.TH) + margin;
  const x1 = Math.ceil(maxX) + extra;
  const y1 = Math.ceil(maxY) + extra;
  const out = [];
  for (let ty = y0; ty <= y1; ty++) {
    for (let tx = x0; tx <= x1; tx++) {
      const p = iso.toScreen(tx, ty);
      if (p.x < -iso.TW || p.x > w + iso.TW) continue;
      if (p.y < -iso.TH || p.y > h + tallPx) continue;
      out.push([tx, ty]);
    }
  }
  return out;
}
