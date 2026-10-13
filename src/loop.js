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
let simSeconds = 0; // game time stepped so far: the sim's own clock, never the wall's (docs/23a, C2)
let pauses = 0; // times the loop was paused: a draw held through a pause is dropped (archery.js)

let hooks = { update: () => {}, render: () => {}, crash: null };

export function start(h) {
  hooks = { ...hooks, ...h };
  running = true;
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

// Hold game time for `seconds` (hit-stop, docs/14). Rendering goes on; the
// longest request wins, they do not add.
export function freeze(seconds) {
  freezeLeft = Math.max(freezeLeft, seconds);
}

// Seconds of freeze still to run.
export function getFreeze() {
  return freezeLeft;
}

export function getFps() {
  return fps;
}

function frame(now) {
  if (!running) return;
  // Rescheduled first, so a throw below cannot leave the loop unscheduled (docs/23a, A1).
  requestAnimationFrame(frame);
  let dt = (now - last) / 1000;
  last = now;
  if (dt > MAX_FRAME) dt = MAX_FRAME;

  fpsTimer += dt;
  frames++;
  if (fpsTimer >= 0.5) {
    fps = Math.round(frames / fpsTimer);
    frames = 0;
    fpsTimer = 0;
  }

  try {
    if (freezeLeft > 0) freezeLeft = Math.max(0, freezeLeft - dt);
    else if (!paused) {
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
    }
    hooks.render();
  } catch (err) {
    // One exception ends the game, loudly: the sim stops where it threw and the
    // crash screen says why (src/boot.js), instead of a frozen canvas and a
    // console line (docs/23a, A1).
    running = false;
    console.error(err);
    if (hooks.crash) hooks.crash(err);
  }
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
