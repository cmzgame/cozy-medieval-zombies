// Copied from cozy-zombie-game src/loop.js on 2026-10-09. MAX_FRAME lowered, see below.
// Fixed-timestep update, rAF render. (The parent's coarse sim tick, never used here, went on 2026-10-12, docs/23a G.)

import { world } from "./world.js";

const STEP = 1 / 60;
// Catch-up clamp. The parent allowed 0.25 s (15 steps per frame); with
// visibility and pathing in every step that let one hitch spiral into a freeze.
// 0.1 s means a slow frame costs at most six steps and time dilates instead.
const MAX_FRAME = 0.1;
// While the world's time scale is above one (someone asleep, docs/30 step 2;
// docs/31/08 habit 6: a field on the world, never a dt multiplier), each frame
// runs up to this many fixed steps; past it the rest is dropped and the night
// takes a little longer in real time. Each step is still one sixtieth.
const MAX_STEPS_FAST = 120;

let running = false;
let paused = false;
let last = 0;
let accumulator = 0;
let frames = 0;
let fps = 0;
let fpsTimer = 0;
let freezeLeft = 0;
let drawAlpha = 1;
let simSeconds = 0; // game time stepped so far: the sim's own clock, never the wall's (docs/23a, C2)
let pauses = 0; // times the loop was paused: a draw held through a pause is dropped (archery.js)

let hooks = { update: () => {}, render: () => {}, crash: null };

// The hooks alone, for a world driven by advance() with no frames: the headless
// runner (tools/world.js) and the authority of docs/31/04, which steps on a timer.
export function init(h) {
  hooks = { ...hooks, ...h };
  running = true;
}

export function start(h) {
  init(h);
  last = performance.now();
  requestAnimationFrame(frame);
}

export function setPaused(p) {
  if (p && !paused) pauses++;
  paused = p;
}

export function isPaused() {
  return paused;
}

// Held (the coder agent's review of item 3): a world whose host has stepped away with no guest in it stops as a solo
// world does, yet still answers the wire (`hooks.pump`) so a friend's join starts it again. Apart from the pause, which
// a screen and a scripted test own; `advance` still steps a held world, for the checks.
let held = false;
export function setHeld(on) {
  held = !!on;
}
export function isHeld() {
  return held;
}

// Hold game time for `seconds` (hit-stop, docs/14). Rendering goes on; the
// longest request wins, they do not add. On the wire no one's blow holds the
// world (docs/31/05, item 13): the hold is refused, the kick stays.
let freezeAllowed = true;
export function setFreezeAllowed(on) {
  freezeAllowed = !!on;
}

export function freeze(seconds) {
  if (!freezeAllowed) return;
  freezeLeft = Math.max(freezeLeft, seconds);
}

// Seconds of freeze still to run.
export function getFreeze() {
  return freezeLeft;
}

// How far between the last step and the next the draw is, 0 to 1 (`interp.js`): the leftover time over a step. 1 when nothing is stepping (paused, held, a hit-stop).
export function alpha() {
  return drawAlpha;
}

export function getFps() {
  return fps;
}

function frame(now) {
  if (!running) return;
  // Rescheduled first, so a throw below cannot leave the loop unscheduled (docs/23a, A1).
  requestAnimationFrame(frame);
  lastFrameAt = now;
  const dt = Math.min(MAX_FRAME, (now - last) / 1000);

  fpsTimer += dt;
  frames++;
  if (fpsTimer >= 0.5) {
    fps = Math.round(frames / fpsTimer);
    frames = 0;
    fpsTimer = 0;
  }

  run(now, true);
}

// The steps a stretch of real time is worth, then the drawing when there is a frame to draw. Shared by the
// browser's frames and the Worker's ticks, so `last` and the accumulator carry from one driver to the other
// and a switch neither doubles nor drops a step.
function run(now, draw) {
  let dt = (now - last) / 1000;
  last = now;
  if (dt > MAX_FRAME) dt = MAX_FRAME;
  try {
    drawAlpha = 1;
    if (freezeLeft > 0) freezeLeft = Math.max(0, freezeLeft - dt);
    else if (!paused && !held) {
      // The world's time scale says how many fixed steps a real second is worth.
      accumulator += dt * world.timeScale;
      let n = 0;
      const maxSteps = world.timeScale > 1 ? MAX_STEPS_FAST : Infinity;
      while (accumulator >= STEP && n < maxSteps) {
        step();
        accumulator -= STEP;
        n++;
      }
      if (n >= maxSteps) accumulator = 0;
      drawAlpha = Math.min(1, Math.max(0, accumulator / STEP));
      if (!draw) workerSteps += n;
    } else if (held && !paused && hooks.pump) hooks.pump(); // held: the wire is still answered, so a friend's join is heard
    if (draw) hooks.render();
  } catch (err) {
    // One exception ends the game, loudly: the sim stops where it threw and the
    // crash screen says why (src/boot.js), instead of a frozen canvas and a
    // console line (docs/23a, A1).
    running = false;
    console.error(err);
    if (hooks.crash) hooks.crash(err);
  }
}

// The second driver (item 3 of the five for a friend on their own computer, `02` 2026-10-13): a browser draws no
// frames for a hidden tab, so a host's world stopped for everyone whenever its tab was behind another, minimised, or
// covered. A Worker's timer is not stopped the same way: it ticks every 16 ms, and once the browser's frames have
// stopped for a tenth of a second (not the visibility flag, which a covered window or an embedded pane may not set)
// and the client says so, each tick steps the world by the real time since the last, without drawing. A frame drawn
// again takes back over at once. The client's answer (`setBackgroundDriver`): "step" (a world with friends in it),
// "pump" (a world open to friends with nobody in it yet: the wire is answered, so a friend's join is heard, but the
// world does not move and its clock does not run), or nothing (a solo world: hidden, it stops, as single player
// always has).
const STALL_MS = 100;
let lastFrameAt = 0;
let worker = null;
let wanted = () => false;
let workerSteps = 0;

export function setBackgroundDriver(fn) {
  wanted = fn || (() => false);
  if (worker || typeof Worker === "undefined" || typeof Blob === "undefined") return;
  // The tick's pace is the page's to set: sixty a second while a world wants driving, one a second while nothing does
  // (a solo world: the ticks would only be ignored, and a laptop's battery pays for them; the coder agent's note).
  const src = "let iv = setInterval(() => postMessage(0), 16); onmessage = (e) => { clearInterval(iv); iv = setInterval(() => postMessage(0), e.data); };";
  worker = new Worker(URL.createObjectURL(new Blob([src], { type: "text/javascript" })));
  let fast = true;
  worker.onmessage = () => {
    if (!running) return;
    const now = performance.now();
    const want = wanted();
    if (!!want !== fast) {
      fast = !!want;
      worker.postMessage(fast ? 16 : 1000);
    }
    if (now - lastFrameAt < STALL_MS) return;
    if (want === "step") run(now, false);
    else {
      last = now; // no stretch of real time is owed when stepping starts
      if (want === "pump" && hooks.pump) {
        try {
          hooks.pump();
        } catch (err) {
          running = false;
          console.error(err);
          if (hooks.crash) hooks.crash(err);
        }
      }
    }
  };
}

// A world with no page drives itself (item 5's third step: the server's world process, on a plain Node timer):
// each call steps the world by the real time since the last, without drawing; held, it answers the wire instead.
export function drive(now) {
  if (running) run(now, false);
}

// The steps the Worker has driven since the page loaded (for the checks).
export function backgroundSteps() {
  return workerSteps;
}

export function isRunning() {
  return running;
}

// Seconds of game time stepped: what the sim reads instead of performance.now().
export function simTime() {
  return simSeconds;
}

export function pauseCount() {
  return pauses;
}

// A save puts the stepped seconds back (sleep's `since`, a poke's stamp, a queue's start read it).
export function setSimTime(s) {
  simSeconds = s;
}

function step() {
  simSeconds += STEP;
  hooks.update(STEP);
}

// Run game time forward synchronously. For tests and debugging; rAF is
// throttled in hidden tabs, so this is the reliable way to drive the sim.
export function advance(seconds) {
  const steps = Math.round(seconds / STEP);
  for (let i = 0; i < steps; i++) step();
  hooks.render();
}
