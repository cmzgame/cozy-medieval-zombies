// Remote bodies on a guest, drawn between the host's frames (#248). The host sends a frame every third step, and the frames reach a guest irregularly (the relay, a browser
// that is busy, a late packet), so a body that walked to each new position in a fixed three steps stood still when a frame was late and hurried when it was early: on a
// guest the host's player stopped for a step every sixth frame. Instead each remote body keeps the last few positions the host sent, each with the host's sim time of
// its frame, and is drawn where it was at a time a fixed `netDelaySteps` behind the newest frame, found by interpolating between the two positions either side of that time
// (so its speed is the host's whatever the arrival). The guest's clock for this runs on its own steps and is nudged toward the frames' clock (`netSlew` of the gap per
// frame), so a run of early or late frames moves it a little and never in a lurch. Nothing here touches a body's authoritative position: `netTo` is still the host's
// truth, the sync check's. A body that moved farther than `netJump` tiles between two frames is not blended (a teleport, a respawn), and with the world sped up (sleep)
// there is nothing to smooth: bodies are put where the frame says.

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
export function aim(c, gx, gy, h) {
  if (typeof gx !== "number" || typeof gy !== "number" || typeof h !== "number") return;
  const buf = c.netBuf || (c.netBuf = []);
  const last = buf[buf.length - 1];
  if (last && h <= last.h) {
    if (h === last.h) { last.x = gx; last.y = gy; }
    c.netTo = [gx, gy];
    return;
  }
  buf.push({ h, x: gx, y: gy });
  if (buf.length > KEEP) buf.shift();
  c.netTo = [gx, gy]; // the host's truth, which the sync check hashes
  if (!last) { c.gx = gx; c.gy = gy; } // first sight: here
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
    if (!c.netBuf) { if (typeof c.gx === "number") c.netBuf = [{ h, x: c.gx, y: c.gy }]; continue; }
    const last = c.netBuf[c.netBuf.length - 1];
    if (!last || last.h >= h) continue;
    c.netBuf.push({ h, x: last.x, y: last.y });
    if (c.netBuf.length > KEEP) c.netBuf.shift();
  }
}

// Every guest step: the clock moves on, and each body is put where it was at that time.
export function step(list, timeScale = 1) {
  if (R === null) return;
  R += STEP;
  for (const c of list) {
    const buf = c.netBuf;
    if (!buf || !buf.length) continue;
    if (timeScale > 1) { const e = buf[buf.length - 1]; c.gx = e.x; c.gy = e.y; continue; }
    const p = sample(buf, R);
    c.gx = p[0];
    c.gy = p[1];
  }
}

// Where a body was at host time `t`: between the two positions either side of it; before the first, the first; after the newest (a frame later than the delay allows), held
// at the newest and moved on by the last speed for up to two steps, so a late frame does not stop it dead.
export function sample(buf, t) {
  const first = buf[0];
  if (t <= first.h) return [first.x, first.y];
  for (let i = buf.length - 1; i > 0; i--) {
    const a = buf[i - 1];
    const b = buf[i];
    if (t >= a.h && t <= b.h) {
      if (Math.abs(b.x - a.x) > tuning.netJump || Math.abs(b.y - a.y) > tuning.netJump) return [b.x, b.y]; // a jump: where it landed
      const k = (t - a.h) / (b.h - a.h);
      return [a.x + (b.x - a.x) * k, a.y + (b.y - a.y) * k];
    }
  }
  const b = buf[buf.length - 1];
  if (buf.length < 2) return [b.x, b.y];
  const a = buf[buf.length - 2];
  if (Math.abs(b.x - a.x) > tuning.netJump || Math.abs(b.y - a.y) > tuning.netJump) return [b.x, b.y];
  const over = Math.min(t - b.h, 2 * STEP);
  const k = over / (b.h - a.h);
  return [b.x + (b.x - a.x) * k, b.y + (b.y - a.y) * k];
}
