// Copied from cozy-zombie-game src/clock.js on 2026-10-09. setHour added for
// the debug key; otherwise unchanged. See docs/07-lighting.md.
// Game clock: a day/night cycle. Pure state, read by light, render, and the HUD.

export const DAY_LENGTH = 720; // seconds of real time per full 24-hour cycle
const DAY_B = 1.0;
const NIGHT_B = 0.22; // never fully black; this is a cozy game
export const NIGHT_BRIGHTNESS = NIGHT_B;

// Real clock hours (0-24), Zomboid-style: full dark 23:00-06:00, with a
// one-hour taper on each side so it's not an instant switch.
const DUSK_START = 22; // brightness starts falling
const NIGHT_START = 23; // fully dark from here...
const NIGHT_END = 6; // ...until here (wraps past midnight)
const DAWN_END = 7; // brightness is back to full by here

// New games start mid-morning, not at midnight.
const START_HOUR = 8;
const START_ELAPSED = (START_HOUR / 24) * DAY_LENGTH;

let elapsed = START_ELAPSED;

export function reset() {
  elapsed = START_ELAPSED;
}

export function update(dt) {
  elapsed += dt;
}

export function getElapsed() {
  return elapsed;
}

// For loading a save.
export function setElapsed(v) {
  elapsed = v;
}

// Debug: jump to an hour of the current day (fractional hours allowed).
export function setHour(h) {
  const day = Math.floor(elapsed / DAY_LENGTH);
  elapsed = day * DAY_LENGTH + (((h % 24) + 24) % 24 / 24) * DAY_LENGTH;
}

// Seconds from now to the next time the clock reads `h` (0..24): the dawn a siege ends at (the dead, `zombie.siegeEndHour`).
export function secondsUntilHour(h) {
  const target = (((h % 24) + 24) % 24 / 24) * DAY_LENGTH;
  let d = target - (elapsed % DAY_LENGTH);
  if (d <= 0) d += DAY_LENGTH;
  return d;
}

// 0..1 position within the current cycle.
export function cycleT() {
  return (elapsed % DAY_LENGTH) / DAY_LENGTH;
}

export function getDay() {
  return Math.floor(elapsed / DAY_LENGTH) + 1;
}

// 0..24, real clock hours.
export function getHour() {
  return cycleT() * 24;
}

export function getPhase() {
  const h = getHour();
  if (h >= NIGHT_START || h < NIGHT_END) return "night";
  if (h < DAWN_END) return "dawn";
  if (h < DUSK_START) return "day";
  return "dusk";
}

// Light level, 1 (full day) to NIGHT_B (deepest night), tapered through
// dusk and dawn. Full darkness holds for the entire 23:00-06:00 window.
export function getBrightness() {
  const h = getHour();
  if (h >= DUSK_START && h < NIGHT_START) {
    return DAY_B + (NIGHT_B - DAY_B) * ((h - DUSK_START) / (NIGHT_START - DUSK_START));
  }
  if (h >= NIGHT_START || h < NIGHT_END) return NIGHT_B;
  if (h < DAWN_END) {
    return NIGHT_B + (DAY_B - NIGHT_B) * ((h - NIGHT_END) / (DAWN_END - NIGHT_END));
  }
  return DAY_B;
}

// 0 in full day, 1 in full night. What the sim and renderer scale effects by.
export function nightFactor() {
  return Math.max(0, Math.min(1, (DAY_B - getBrightness()) / (DAY_B - NIGHT_B)));
}

// "Day 3, 22:15" for any elapsed value (the HUD, and the Continue button).
export function formatLabel(e) {
  const h = ((e % DAY_LENGTH) / DAY_LENGTH) * 24;
  const hh = Math.floor(h);
  const mm = Math.floor((h - hh) * 60);
  const day = Math.floor(e / DAY_LENGTH) + 1;
  return `Day ${day}, ${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
}

export function getLabel() {
  return formatLabel(elapsed);
}
