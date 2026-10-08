// Copied from cozy-zombie-game src/loop.js on 2026-10-09. Unchanged.
// Fixed-timestep update, rAF render, coarse sim tick. See docs/05-architecture.md.

const STEP = 1 / 60;
const MAX_FRAME = 0.25;

let running = false;
let paused = false;
let last = 0;
let accumulator = 0;
let simAccumulator = 0;
let simInterval = 1;
let frames = 0;
let fps = 0;
let fpsTimer = 0;

let hooks = { update: () => {}, render: () => {}, simTick: () => {} };

export function start(h, opts = {}) {
  hooks = { ...hooks, ...h };
  simInterval = (opts.simIntervalMs ?? 1000) / 1000;
  running = true;
  last = performance.now();
  requestAnimationFrame(frame);
}

export function setPaused(p) {
  paused = p;
}

export function isPaused() {
  return paused;
}

export function getFps() {
  return fps;
}

function frame(now) {
  if (!running) return;
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

  if (!paused) {
    accumulator += dt;
    while (accumulator >= STEP) {
      step();
      accumulator -= STEP;
    }
  }

  hooks.render();
  requestAnimationFrame(frame);
}

function step() {
  hooks.update(STEP);
  simAccumulator += STEP;
  if (simAccumulator >= simInterval) {
    simAccumulator -= simInterval;
    hooks.simTick(simInterval);
  }
}

// Run game time forward synchronously. For tests and debugging; rAF is
// throttled in hidden tabs, so this is the reliable way to drive the sim.
export function advance(seconds) {
  const steps = Math.round(seconds / STEP);
  for (let i = 0; i < steps; i++) step();
  hooks.render();
}
