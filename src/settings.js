// Settings: the few things the player can tune, kept in the browser between
// runs (docs/10, "Screens"). Nothing here is game state; a save never
// carries these. Each setting has a default, and "auto" means "work it out
// from the window" where that makes sense.

const KEY = "cmz.settings";

export const DEFAULTS = {
  uiScale: "auto", // "auto" or a number: how big the interface is drawn
  worldScale: "auto", // the zoom: "auto" or one of view.ZOOM_LEVELS
  debugCorner: true, // the text in the top-left corner
  zombieAggro: true, // on by default since 2026-10-15 (Michael: a sandbox setting, the dead hunt unless you turn them off); off they wander and ignore you (2026-10-10). A browser that saved its settings keeps its own
  zombiesAttackVillagers: false, // on: the dead hunt villagers too, always preferring the player when both are in sight (docs/19)
  squareSurface: "cobble", // the square and its two paths: "cobble" or "dirt", to compare (docs/15, for now)
  combatTesting: false, // on (read at load): no trees, a hundred more of the dead in a ring round the spawn (docs/21; 2026-10-15)
  swingTimer: true, // a bar over your head while a swing recovers (World of Warcraft's swing timer; docs/21)
  aimGuide: true, // the bow's landing marker and dotted line while you draw (docs/20); Michael wants the weapon to feel right without it, so it is a setting, on for now
  showSwingTargets: false, // outline the zombies the next swing would hit (docs/14), for testing and for play
  multiHit: false, // on: a blow reaches everything in its wedge; off: only the nearest. Off is the intended way to play (Michael, 2026-10-12): multi-hit is the easy button (docs/14)
  showHitShapes: false, // draw the dead's body samples, green when the next swing reaches them (docs/14)
  freeBuilding: false, // on: building costs nothing (docs/13), for testing structures
  survival: true, // on since docs/30 step 2 (hunger, thirst, tiredness drain); off: the body is a workbench
  hairStyle: "short", // the player's hair (the character screen writes it, and `look.hairStyle` with it; kept for what reads it)
  playerName: "", // the identity before docs/31/09: read once to migrate into identities.js, and by the ?nosave test world's identity
  look: {}, // the look before docs/31/09 (skin, hair, eyes, hairStyle): migrated with playerName; identities.js keeps them now
  nameTags: true, // another player's name over their head while in sight (docs/31/03)
  paintedLayers: {}, // slot -> painted layer name to try on, from the settings screen (docs/12)
  panelPos: {}, // "bag" | "character" | "container" -> { x, y } in UI pixels where its header was dragged to (docs/23 step 4; Michael, 2026-10-12)
  cursor: "default", // the system's own, or one of the three hands (ui/cursor.js; Michael, 2026-10-12)
  logSize: null, // { w, h } in UI pixels the text log was resized to (ui/log.js)
  devChest: true, // the chest of every item placed by the spawn (read at load; docs/30 step 0: the map file stays clean)
  identities: [], // [{ id, name, look }]: the identities kept in this browser (identities.js; docs/31/09)
  lastIdentity: "", // the one picked last, offered first on the next creation
  clientId: "", // the browser id a world remembers a character's owner by (docs/31/09)
  joined: [], // friends' worlds this browser has joined or tried to: [{ code, name, hostName, myCharacter, lastAt }]
  creatorKey: "", // the server's creator key, typed once, which lets this browser move a world to the server (item 5)
  owned: [], // the server worlds this browser owns: [{ code, serverWorldId, name, ownerKey, localWorldId, at }] (item 5)
};

// What the settings screen offers, in order.
export const CHOICES = {
  uiScale: [["auto", "Auto"], [1, "1×"], [1.25, "1.25×"], [1.5, "1.5×"], [1.75, "1.75×"], [2, "2×"]], // capped at 2 (Michael, 2026-10-12)
  worldScale: [["auto", "Auto"], [1.1, "Wide"], [1.8, "Middle"], [2.7, "Close"]],
  debugCorner: [[true, "Shown"], [false, "Hidden"]],
  zombieAggro: [[false, "Off (they ignore you)"], [true, "On (they hunt you)"]],
  zombiesAttackVillagers: [[false, "Off (villagers are safe)"], [true, "On (they hunt villagers, whatever aggro says; with aggro on, you first)"]], // two knobs on purpose (Michael, 2026-10-15)
  squareSurface: [["cobble", "Cobble"], ["dirt", "Dirt"]],
  aimGuide: [[true, "On (landing marker and dotted line)"], [false, "Off"]],
  swingTimer: [[true, "On (a bar over your head)"], [false, "Off"]],
  combatTesting: [[false, "Off"], [true, "On (no trees, a hundred more dead round the spawn; reload the page)"]],
  showSwingTargets: [[false, "Off"], [true, "On (green outline on what you would hit)"]],
  multiHit: [[false, "Off (nearest only: the intended way)"], [true, "On (everything in the wedge: the easy button)"]],
  showHitShapes: [[false, "Off"], [true, "On (body samples)"]],
  freeBuilding: [[false, "Off (costs apply)"], [true, "On (no costs)"]],
  survival: [[true, "On (hunger, thirst, tiredness)"], [false, "Off (no needs)"]],
  cursor: [["default", "Default"], ["human", "A hand"], ["severed", "A severed hand"], ["zombie", "A zombie hand"]],
  devChest: [[true, "On (by the spawn; reload the page)"], [false, "Off"]],
  nameTags: [[true, "Shown"], [false, "Hidden"]],
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

// The Settings screen's Defaults: what that screen shows, and nothing else. The same blob keeps this browser's
// identities, its id, the friends' worlds it joined, the creator key, and the owner keys of its server worlds, and the
// panels' places; Defaults once reset them all, which lost a browser its characters in friends' worlds and its server
// worlds' keys (the wiki census's bugs, 2026-10-15).
export const SCREEN_KEYS = [...Object.keys(CHOICES), "paintedLayers"];
export function reset(keys = SCREEN_KEYS) {
  for (const k of keys) set(k, DEFAULTS[k]);
}

// Called with (key, value) after any change.
export function onChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
