// Drawn positions between steps (#161). The world steps at a fixed sixty a second (`loop.js`) and the screen draws as often as the display asks, so with no
// help a 144 Hz display draws the same step on about three frames in five and then jumps, and one late frame at 60 Hz is a hitch. Each step marks where every
// moving character (and the camera) stood before it; the renderer draws them where they are `loop.alpha()` of the way from there to where the step put them,
// then puts the step's positions back. Nothing in the simulation ever sees an interpolated position: it is put on at the start of `render` and taken off at the
// end of it, in a `finally`. A character that moved farther than `feel.blendJump` tiles in one step (a teleport, a knock, a respawn) is not blended.
// Free-flying things (an arrow, a thrown item, the fireball) are marked too, with their height `z`.


import { feel } from "./tuning.js";

const tracked = []; // { c, px, py, pz, cx, cy, cz }: a mover, where it stood before the last step, and (while applied) where the step left it
let applied = false;

export const lerp = (a, b, t) => a + (b - a) * t;

// Whether a move is a jump (a teleport, a respawn): drawn where it landed, not blended.
export function isJump(px, py, cx, cy) {
  return Math.abs(cx - px) > feel.blendJump || Math.abs(cy - py) > feel.blendJump;
}

// The blend of one coordinate pair: the position `alpha` of the way from `prev` to `cur`, or `cur` for a jump.
export function blend(prev, cur, alpha) {
  if (isJump(prev[0], prev[1], cur[0], cur[1])) return cur;
  return [prev[0] + (cur[0] - prev[0]) * alpha, prev[1] + (cur[1] - prev[1]) * alpha];
}

// At the start of every sim step: remember where each character stands.
export function mark(list) {
  tracked.length = 0;
  for (const c of list) if (c && typeof c.gx === "number") tracked.push({ c, px: c.gx, py: c.gy, pz: typeof c.z === "number" ? c.z : null, cx: 0, cy: 0, cz: 0 });
}

// At the start of a draw: put every marked character `alpha` of the way from where it stood to where the step left it.
export function apply(alpha) {
  if (applied) restore();
  applied = true;
  for (const t of tracked) {
    t.cx = t.c.gx;
    t.cy = t.c.gy;
    const b = blend([t.px, t.py], [t.cx, t.cy], alpha);
    t.c.gx = b[0];
    t.c.gy = b[1];
    if (t.pz !== null && typeof t.c.z === "number") {
      t.cz = t.c.z;
      if (!isJump(t.px, t.py, t.cx, t.cy)) t.c.z = lerp(t.pz, t.cz, alpha); // the arc's height blends with the position (a jump is drawn where it landed)
    }
  }
}

// At the end of the draw: the step's own positions back.
export function restore() {
  if (!applied) return;
  applied = false;
  for (const t of tracked) {
    t.c.gx = t.cx;
    t.c.gy = t.cy;
    if (t.pz !== null && typeof t.c.z === "number") t.c.z = t.cz;
  }
}

export function isApplied() {
  return applied;
}
