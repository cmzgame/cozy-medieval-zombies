// Settings: the few things the player can tune, kept in the browser between
// runs (docs/10, "Screens"). Nothing here is game state; a save never
// carries these. Each setting has a default, and "auto" means "work it out
// from the window" where that makes sense.

const KEY = "cmz.settings";

export const DEFAULTS = {
  uiScale: "auto", // "auto" or a number: how big the interface is drawn
  worldScale: "auto", // the zoom: "auto" or one of view.ZOOM_LEVELS
  debugCorner: true, // the text in the top-left corner
  zombieAggro: false, // off: the dead wander and ignore you, there to be looked at (Michael, 2026-10-10)
  wallPreviewHeight: 64, // the dev walls' height in px: 64 today, 80 to preview taller walls (docs/16, part 4)
  squareSurface: "cobble", // the square and its two paths: "cobble" or "dirt", to compare (docs/15, for now)
  showSwingTargets: false, // outline the zombies the next swing would hit (docs/14), for testing and for play
  multiHit: true, // on: a blow reaches everything in its wedge; off: only the nearest (docs/14)
  showHitShapes: false, // draw the swing's wedge and the dead's body samples (docs/14)
  freeBuilding: false, // on: building costs nothing (docs/13), for testing structures
  survival: false, // off: no hunger, thirst, or any other need; the body is a workbench too
  hairStyle: "short", // the player's hair, picked on the settings screen's Hair row; no choices row, the row is built live
  paintedLayers: {}, // slot -> painted layer name to try on, from the settings screen (docs/12)
};

// What the settings screen offers, in order.
export const CHOICES = {
  uiScale: [["auto", "Auto"], [1, "1×"], [1.25, "1.25×"], [1.5, "1.5×"], [1.75, "1.75×"], [2, "2×"], [2.5, "2.5×"], [3, "3×"]],
  worldScale: [["auto", "Auto"], [1.1, "Wide"], [1.8, "Middle"], [2.7, "Close"]],
  debugCorner: [[true, "Shown"], [false, "Hidden"]],
  zombieAggro: [[false, "Off (they ignore you)"], [true, "On (they hunt you)"]],
  wallPreviewHeight: [[64, "64 px (now)"], [80, "80 px (preview)"]],
  squareSurface: [["cobble", "Cobble"], ["dirt", "Dirt"]],
  showSwingTargets: [[false, "Off"], [true, "On (green outline on what you would hit)"]],
  multiHit: [[true, "On (everything in the wedge)"], [false, "Off (nearest only)"]],
  showHitShapes: [[false, "Off"], [true, "On (wedge and body samples)"]],
  freeBuilding: [[false, "Off (costs apply)"], [true, "On (no costs)"]],
  survival: [[false, "Off (no hunger or thirst)"], [true, "On"]],
};

const settings = { ...DEFAULTS };
const listeners = new Set();

export function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const saved = JSON.parse(raw);
      for (const k of Object.keys(DEFAULTS)) if (k in saved) settings[k] = saved[k];
    }
  } catch {
    // No storage, or a bad value: the defaults stand.
  }
  return settings;
}

export function get(key) {
  return settings[key];
}

export function set(key, value) {
  if (!(key in DEFAULTS) || settings[key] === value) return;
  settings[key] = value;
  try {
    localStorage.setItem(KEY, JSON.stringify(settings));
  } catch {
    // Not persisted; still applied for this run.
  }
  for (const fn of listeners) fn(key, value);
}

export function reset() {
  for (const k of Object.keys(DEFAULTS)) set(k, DEFAULTS[k]);
}

// Called with (key, value) after any change.
export function onChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
