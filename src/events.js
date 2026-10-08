// Copied from cozy-zombie-game src/events.js on 2026-10-09. Unchanged.
// Minimal pub/sub. Events: noise, playerHit, zombieDied, edgeChanged, playerMoved, gameOver.

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

export function clearAll() {
  listeners.clear();
}
