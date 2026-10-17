// Drawn positions between steps (#161). The world steps at a fixed sixty a second (`loop.js`) and the screen draws as often as the display asks, so with no
// help a 144 Hz display draws the same step on about three frames in five and then jumps, and one late frame at 60 Hz is a hitch. Each step marks where every
// moving character (and the camera) stood before it; the renderer draws them where they are `loop.alpha()` of the way from there to where the step put them,
// then puts the step's positions back. Nothing in the simulation ever sees an interpolated position: it is put on at the start of `render` and taken off at the
// end of it, in a `finally`. A character that moved farther than `JUMP` tiles in one step (a teleport, a knock, a respawn) is not blended.

export const JUMP = 1.5;

const tracked = []; // { c, px, py, cx, cy }: a character, where it stood before the last step, and (while applied) where the step left it
let applied = false;

export const lerp = (a, b, t) => a + (b - a) * t;

// The blend of one coordinate pair: the position `alpha` of the way from `prev` to `cur`, or `cur` for a jump.
export function blend(prev, cur, alpha) {
  const dx = cur[0] - prev[0];
  const dy = cur[1] - prev[1];
  if (Math.abs(dx) > JUMP || Math.abs(dy) > JUMP) return cur;
  return [prev[0] + dx * alpha, prev[1] + dy * alpha];
}

// At the start of every sim step: remember where each character stands.
export function mark(list) {
  tracked.length = 0;
  for (const c of list) if (c && typeof c.gx === "number") tracked.push({ c, px: c.gx, py: c.gy, cx: 0, cy: 0 });
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
  }
}

// At the end of the draw: the step's own positions back.
export function restore() {
  if (!applied) return;
  applied = false;
  for (const t of tracked) {
    t.c.gx = t.cx;
    t.c.gy = t.cy;
  }
}

export function isApplied() {
  return applied;
}
