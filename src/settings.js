// Settings: the few things the player can tune, kept in the browser between
// runs (docs/10, "Screens"). Nothing here is game state; a save never
// carries these. Each setting has a default, and "auto" means "work it out
// from the window" where that makes sense.

const KEY = "cmz.settings";

export const DEFAULTS = {
  uiScale: "auto", // "auto" or a number: how big the interface is drawn
  worldScale: "auto", // "auto", 1, 2, or 3: the integer pixel scale of the world
  debugCorner: true, // the text in the top-left corner
};

// What the settings screen offers, in order.
export const CHOICES = {
  uiScale: [["auto", "Auto"], [1, "1×"], [1.25, "1.25×"], [1.5, "1.5×"], [1.75, "1.75×"], [2, "2×"], [2.5, "2.5×"], [3, "3×"]],
  worldScale: [["auto", "Auto (largest that fits)"], [1, "1× (most world)"], [2, "2×"], [3, "3×"]],
  debugCorner: [[true, "Shown"], [false, "Hidden"]],
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
