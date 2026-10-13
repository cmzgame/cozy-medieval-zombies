// Copied from cozy-zombie-game src/events.js on 2026-10-09. Since: the header names this game's events, and the
// never-called clearing of every listener went (docs/23a, G).
// Minimal pub/sub. Events emitted: arrowShot, arrowLanded, blocked, containerOpened, gameOver, guardBroken,
// meleeHit, meleeSwing, playerHit, shove, villagerDied, villagerHit, zombieDied; since docs/30 step 2 (every
// world change emits, docs/31/08 habit 3): fireFed, fireOut, sleepStart, sleepEnd, timeScale.

const listeners = new Map();

export function on(name, fn) {
  if (!listeners.has(name)) listeners.set(name, new Set());
  listeners.get(name).add(fn);
  return () => off(name, fn);
}

export function off(name, fn) {
  listeners.get(name)?.delete(fn);
}

export function emit(name, payload = {}) {
  const set = listeners.get(name);
  if (!set) return;
  for (const fn of [...set]) fn(payload);
}
