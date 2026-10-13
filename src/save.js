// The save (docs/31/05, item 24; the cozy parent's docs/15-save-load.md re-decided
// for this game): one slot per map in the browser, versioned, discarded whole on
// a mismatch, never half-applied. What is saved is the world's own serialisation
// (game.serialize: the clock, the generator, the counters, every loaded chunk,
// every character), which is also what a joining player will receive (docs/31/04:
// the join is a load), so the shape is owned by the modules that own the state.
// Not saved: an auto-walk, a timed action's progress, a draw, arrows in flight,
// the renderer's and the interface's state. Loading drops you where you were,
// standing still.
//
// The slot is keyed by the map's name, so the proving ground (?map=square) never
// writes over the valley's. `?nosave` on the URL turns the slot off for that
// page: nothing read, nothing written. The scripted tests run with it, since the
// browser pane shares localStorage with Michael's own browser (CLAUDE.md).

import * as game from "./game.js";
import * as clock from "./clock.js";

export const VERSION = 1;
const KEY = "cmz.save";
const disabled = typeof location !== "undefined" && new URLSearchParams(location.search).has("nosave");

function keyFor(mapName) {
  return `${KEY}.${mapName}`;
}

export function isDisabled() {
  return disabled;
}

// The world now, as one plain object.
export function snapshot(mapName, extra = {}) {
  return { version: VERSION, savedAt: Date.now(), mapName, ...extra, ...game.serialize() };
}

export function write(snap) {
  if (disabled) return false;
  try {
    localStorage.setItem(keyFor(snap.mapName), JSON.stringify(snap));
    return true;
  } catch (err) {
    console.warn("The save did not fit or could not be written:", err.message);
    return false;
  }
}

// The map's save, or null when there is none, it is not this version, or the slot is off.
export function read(mapName) {
  if (disabled) return null;
  try {
    const raw = localStorage.getItem(keyFor(mapName));
    if (!raw) return null;
    const s = JSON.parse(raw);
    if (!s || s.version !== VERSION || s.mapName !== mapName || !s.map || !s.characters) return null;
    return s;
  } catch {
    return null;
  }
}

export function clear(mapName) {
  try {
    localStorage.removeItem(keyFor(mapName));
  } catch {
    // nothing to clear
  }
}

// "Day 3, 22:15" for the Continue button.
export function label(s) {
  return clock.formatLabel(s.clock);
}
