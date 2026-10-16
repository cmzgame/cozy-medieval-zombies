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
  zombiesAttackVillagers: false, // on: the dead hunt villagers, whatever aggro says; with aggro on, the player first when both are in sight (two knobs on purpose, Michael 2026-10-15; docs/19)
  squareSurface: "cobble", // the square and its two paths: "cobble" or "dirt", to compare (docs/15, for now)
  combatTesting: false, // on (read at load): no trees, a hundred more of the dead in a ring round the spawn (docs/21; 2026-10-15)
  swingTimer: true, // a bar at the bottom centre of the screen while a swing recovers (World of Warcraft's swing timer; docs/21)
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

// What the settings screen offers: one entry per row, in order, and the screen is generated from it (docs/10's pin;
// docs/38, #108). `group` is its tab; `help` the line under its label; `choices` the answers, [value, text]. A row
// whose two answers are true and false is a switch, any other a dropdown (Michael, 2026-10-16: switches for booleans
// and dropdowns for multiple choice, as Zomboid does, so the chosen answer is the only one shown).
export const GROUPS = [["display", "Display"], ["rules", "World rules"], ["testing", "Testing"]];
const ON_OFF = [[true, "On"], [false, "Off"]];
const SHOWN = [[true, "Shown"], [false, "Hidden"]];
export const REGISTRY = [
  { key: "uiScale", group: "display", label: "Interface size", help: "How big the menus, the bag, and the bars are drawn. Auto fits the window.", choices: [["auto", "Auto"], [1, "1×"], [1.25, "1.25×"], [1.5, "1.5×"], [1.75, "1.75×"], [2, "2×"]] }, // capped at 2 (Michael, 2026-10-12)
  { key: "worldScale", group: "display", label: "Zoom", help: "How close the camera sits. Z or the wheel changes it while you play.", choices: [["auto", "Auto"], [1.1, "Wide"], [1.8, "Middle"], [2.7, "Close"]] },
  { key: "cursor", group: "display", label: "Cursor", help: "The pointer: the system's own, or one of three hands.", choices: [["default", "Default"], ["human", "A hand"], ["severed", "A severed hand"], ["zombie", "A zombie hand"]] },
  { key: "nameTags", group: "display", label: "Names over heads", help: "Another player's name over their head while you can see them.", choices: SHOWN },
  { key: "swingTimer", group: "display", label: "Swing timer", help: "A bar at the bottom of the screen while a swing recovers.", choices: ON_OFF },
  { key: "aimGuide", group: "display", label: "Bow aim guide", help: "The landing marker and the dotted line while you draw a bow.", choices: ON_OFF },
  { key: "zombieAggro", group: "rules", label: "Zombie aggro", help: "On, the dead hunt you. Off, they wander and ignore you.", choices: ON_OFF },
  { key: "zombiesAttackVillagers", group: "rules", label: "Zombies attack villagers", help: "On, the dead hunt villagers whatever aggro says; with aggro on, you first.", choices: ON_OFF }, // two knobs on purpose (Michael, 2026-10-15)
  { key: "survival", group: "rules", label: "Survival", help: "Hunger, thirst, and tiredness. Off, the body has no needs.", choices: ON_OFF },
  { key: "freeBuilding", group: "rules", label: "Free building", help: "Building costs nothing, for trying out structures.", choices: ON_OFF },
  { key: "multiHit", group: "rules", label: "Multi-hit", help: "A blow reaches everything in its wedge: the easy button. Off, only the nearest: the intended way.", choices: ON_OFF },
  { key: "debugCorner", group: "testing", label: "Debug corner", help: "The numbers and the keys in the top-left corner.", choices: SHOWN },
  { key: "showSwingTargets", group: "testing", label: "Swing targets", help: "A green outline on what your next swing would hit.", choices: ON_OFF },
  { key: "showHitShapes", group: "testing", label: "Hit shapes", help: "The dead's body samples, green when the next swing reaches them.", choices: ON_OFF },
  { key: "combatTesting", group: "testing", label: "Combat testing", help: "No trees, and a hundred more of the dead round the spawn. Read when a world is made: reload the page.", choices: ON_OFF },
  { key: "devChest", group: "testing", label: "Dev chest", help: "A chest of every item by the spawn. Read when a world is made: reload the page.", choices: ON_OFF },
  { key: "squareSurface", group: "testing", label: "Square and paths", help: "The village square's surface, to compare the two.", choices: [["cobble", "Cobble"], ["dirt", "Dirt"]] },
];

// A switch or a dropdown: the row's answers are exactly true and false, or anything else.
export function isSwitch(entry) {
  return entry.choices.length === 2 && entry.choices.every(([v]) => typeof v === "boolean");
}

// Each row's answers by key, for what reads them that way.
export const CHOICES = Object.fromEntries(REGISTRY.map((e) => [e.key, e.choices]));

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
