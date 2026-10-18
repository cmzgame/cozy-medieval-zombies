// The camera: a float grid position the iso origin is derived from each step.
// iso.js is unchanged from the parent; the camera just moves its origin.

import * as iso from "./iso.js";
import * as interp from "./interp.js";
import { feel } from "./tuning.js";

export const cam = { gx: 0, gy: 0 };
const before = { gx: 0, gy: 0 }; // where it stood before the last step, for the draw between steps (interp.js)

export function snapTo(gx, gy) {
  cam.gx = gx;
  cam.gy = gy;
  before.gx = gx;
  before.gy = gy;
}

// At the start of every sim step: where it stands now is where it stood before the step.
export function mark() {
  before.gx = cam.gx;
  before.gy = cam.gy;
}

// The camera's position `alpha` of the way from where it stood to where the step left it (a jump is not blended).
export function blended(alpha) {
  const b = interp.blend([before.gx, before.gy], [cam.gx, cam.gy], alpha);
  return { gx: b[0], gy: b[1] };
}

// A screen jolt (docs/14): `x`, `y` pixels, fading to nothing over `seconds`.
let jolt = { x: 0, y: 0, ttl: 0, total: 1 };
export function kick(x, y, seconds) {
  jolt = { x, y, ttl: seconds, total: seconds };
}

export function follow(target, dt) {
  jolt.ttl = Math.max(0, jolt.ttl - dt);
  const k = Math.min(1, feel.cameraFollow * dt); // data/tuning.json feel.cameraFollow
  cam.gx += (target.gx - cam.gx) * k;
  cam.gy += (target.gy - cam.gy) * k;
}

// Put the camera position at the canvas centre. Rounded so pixels stay crisp.
export function applyOrigin(w, h, at = cam) {
  const f = jolt.ttl > 0 ? jolt.ttl / jolt.total : 0;
  const o = originOf(at.gx, at.gy, w, h, jolt.x * f, jolt.y * f);
  iso.setOrigin(o.x, o.y);
}

// The whole-pixel origin for a camera position (pure: the checks use it).
export function originOf(gx, gy, w, h, jx = 0, jy = 0) {
  return { x: Math.round(w / 2 - (gx - gy) * iso.HW + jx), y: Math.round(h / 2 - (gx + gy) * iso.HH + jy) };
}

// Every tile whose diamond or tall sprite could touch the canvas. The grid
// bounding box of the screen corners is a diamond's bounding box, so about half
// of it is off screen; those are filtered by screen position.
export function viewportTiles(w, h, margin = 2, tallPx = 230) {
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
