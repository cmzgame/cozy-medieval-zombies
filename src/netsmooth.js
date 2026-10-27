// Remote bodies on a guest, drawn between the host's frames (#248). The host sends a frame every third step, and the frames reach a guest irregularly (the relay, a browser
// that is busy, a late packet), so a body that walked to each new position in a fixed three steps stood still when a frame was late and hurried when it was early: on a
// guest the host's player stopped for a step every sixth frame. Instead each remote body keeps the last few positions the host sent, each with the host's sim time of
// its frame, and is drawn where it was at a time a fixed `netDelaySteps` behind the newest frame, found by interpolating between the two positions either side of that time
// (so its speed is the host's whatever the arrival). The guest's clock for this runs on its own steps and is nudged toward the frames' clock (`netSlew` of the gap per
// frame), so a run of early or late frames moves it a little and never in a lurch. Nothing here touches a body's authoritative position: `netTo` is still the host's
// truth, the sync check's. A body that moved farther than `netJump` tiles between two frames is not blended (a teleport, a respawn), and with the world sped up (sleep)
// there is nothing to smooth: bodies are put where the frame says. The arrows in flight are drawn on the same clock (`drawClock`, archery.js).

import { feel as tuning } from "./tuning.js"; // data/tuning.json feel.netDelaySteps, netSlew, netJump

const STEP = 1 / 60;
const KEEP = 12; // positions kept per body: a quarter second of frames

let R = null; // the host time, in seconds, the bodies are drawn at; null until the first frame
let latest = null; // the host time of the newest frame



export function reset() {
  R = null;
  latest = null;
}

// A frame's position for a body (host time `h`, in seconds): kept in its buffer; the body's own position is left where it is drawn.
// `l` and `r` are the body's layer and its rise up a stair at that time (docs/49 section 12): kept with the position and drawn with it, so a
// body climbing a stair is not lifted ahead of where it is drawn (the review of #534).
export function aim(c, gx, gy, h, l = c.layer || 0, r = c.rise || 0) {
  if (typeof gx !== "number" || typeof gy !== "number" || typeof h !== "number") return;
  const buf = c.netBuf || (c.netBuf = []);
  const last = buf[buf.length - 1];
  if (last && h <= last.h) {
    if (h === last.h) { last.x = gx; last.y = gy; last.l = l; last.r = r; }
    c.netTo = [gx, gy, l, r];
    return;
  }
  buf.push({ h, x: gx, y: gy, l, r });
  if (buf.length > KEEP) buf.shift();
  c.netTo = [gx, gy, l, r]; // the host's truth, which the sync check hashes
  if (!last) { c.gx = gx; c.gy = gy; c.layer = l; c.rise = r; } // first sight: here
}

// Once per frame that arrives, before the bodies are aimed: where the draw clock should be.
export function frameArrived(h, timeScale = 1) {
  if (typeof h !== "number") return;
  if (latest !== null && h < latest) { R = null; latest = h; } // the host's clock went back (a new world): start again
  latest = h;
  const want = h - tuning.netDelaySteps * STEP;
  if (R === null || timeScale > 1) R = want;
  else R += (want - R) * tuning.netSlew;
}

// Once per frame, after the bodies are aimed: a body the frame did not carry is where it was at this frame's time (the host sends a dead or villager's record only
// when it changed), so a body that stopped is not drawn on past its stop, and one that sets off after a rest is not drawn along the whole rest. A body with no buffer
// yet (known from the welcome, or arrived whole) is seeded where it stands.
export function hold(list, h) {
  if (typeof h !== "number") return;
  for (const c of list) {
    if (!c.netBuf) { if (typeof c.gx === "number") c.netBuf = [{ h, x: c.gx, y: c.gy, l: c.layer || 0, r: c.rise || 0 }]; continue; }
    const last = c.netBuf[c.netBuf.length - 1];
    if (!last || last.h >= h) continue;
    c.netBuf.push({ h, x: last.x, y: last.y, l: last.l, r: last.r });
    if (c.netBuf.length > KEEP) c.netBuf.shift();
  }
}

// The host time the remote bodies are drawn at this step (with the world sped up, the newest frame's, where they are put), or null before the
// first frame. What flies is drawn on it too (archery.stepReplica, #250), so an arrow and the body it hits are drawn at the same moment. Capped
// at two steps past the newest frame, as a body's draw is (`sample`): when the host's sim stalls (a hit-stop, a slow frame) no frame comes,
// R runs on, and a flight drawn at R would fly past what the host has said, burst beyond its target, or come down before it was ever drawn.
export function drawClock(timeScale = 1) {
  if (timeScale > 1 || R === null || latest === null) return timeScale > 1 ? latest : R;
  return Math.min(R, latest + 2 * STEP);
}

// Every guest step: the clock moves on, and each body is put where it was at that time.
export function step(list, timeScale = 1) {
  if (R === null) return;
  R += STEP;
  // Never more than two steps past the newest frame (#250's review): when the host's sim stalls (a hit-stop, a slow frame) no frame comes, and a
  // clock that ran on was many steps ahead when frames came again, drawing a flight loosed then far from the bow and every body and flight
  // held at the newest frame, moving only as each came, until the slew pulled it back. Held here, it is a few steps ahead at most and is
  // pulled back smoothly. (A body is never drawn past two steps beyond its newest position anyway, `sample`.)
  if (latest !== null && timeScale <= 1 && R > latest + 2 * STEP) R = latest + 2 * STEP;
  for (const c of list) {
    const buf = c.netBuf;
    if (!buf || !buf.length) continue;
    if (timeScale > 1) { const e = buf[buf.length - 1]; c.gx = e.x; c.gy = e.y; c.layer = e.l || 0; c.rise = e.r || 0; continue; }
    const p = sample(buf, R);
    c.gx = p[0];
    c.gy = p[1];
    c.layer = p[2];
    c.rise = p[3];
  }
}

// The layer and the rise between two kept positions: the rise eased on one layer; across a stair's top edge (the layer changes, the lift
// does not) the nearer one's.
function lr(a, b, k) {
  const la = a.l || 0;
  const lb = b.l || 0;
  if (la !== lb) return k < 0.5 ? [la, a.r || 0] : [lb, b.r || 0];
  return [la, (a.r || 0) + ((b.r || 0) - (a.r || 0)) * Math.max(0, Math.min(1, k))];
}

// Where a body was at host time `t`: between the two positions either side of it; before the first, the first; after the newest (a frame later than the delay allows), held
// at the newest and moved on by the last speed for up to two steps, so a late frame does not stop it dead.
export function sample(buf, t) {
  const first = buf[0];
  if (t <= first.h) return [first.x, first.y, first.l || 0, first.r || 0];
  for (let i = buf.length - 1; i > 0; i--) {
    const a = buf[i - 1];
    const b = buf[i];
    if (t >= a.h && t <= b.h) {
      if (Math.abs(b.x - a.x) > tuning.netJump || Math.abs(b.y - a.y) > tuning.netJump) return [b.x, b.y, b.l || 0, b.r || 0]; // a jump: where it landed
      const k = (t - a.h) / (b.h - a.h);
      return [a.x + (b.x - a.x) * k, a.y + (b.y - a.y) * k, ...lr(a, b, k)];
    }
  }
  const b = buf[buf.length - 1];
  if (buf.length < 2) return [b.x, b.y, b.l || 0, b.r || 0];
  const a = buf[buf.length - 2];
  if (Math.abs(b.x - a.x) > tuning.netJump || Math.abs(b.y - a.y) > tuning.netJump) return [b.x, b.y, b.l || 0, b.r || 0];
  const over = Math.min(t - b.h, 2 * STEP);
  const k = over / (b.h - a.h);
  return [b.x + (b.x - a.x) * k, b.y + (b.y - a.y) * k, b.l || 0, b.r || 0]; // past the newest: its layer and rise, never guessed on
}
