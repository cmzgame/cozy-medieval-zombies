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
  swingTimer: true, // a bar at the bottom centre of the screen while a swing recovers (World of Warcraft's swing timer; docs/21)
  aimGuide: false, // the landing marker and dotted line while you draw a bow, wind up a throw, or cast (docs/20); off by default since 2026-10-16 (Michael: you learn by trial and error how long to hold). A browser that saved its settings keeps its own
  showSwingTargets: false, // outline the zombies the next swing would hit (docs/14), for testing and for play
  multiHit: false, // on: a blow reaches everything in its wedge; off: only the nearest. Off is the intended way to play (Michael, 2026-10-12): multi-hit is the easy button (docs/14)
  showHitShapes: false, // draw the dead's body samples, green when the next swing reaches them (docs/14)
  freeBuilding: false, // on: building costs nothing (docs/13), for testing structures
  trees: true, // the world has trees: the last choice at a Sandbox step (a world's own rule since #130; it replaced Combat testing's tree strip)
  population: "standard", // how many of the dead a world starts with, "none", "low", "standard" or "high": the last choice at a Sandbox step (#130)
  survival: true, // on since docs/30 step 2 (hunger, thirst, tiredness drain); off: the body is a workbench
  hairStyle: "short", // the player's hair (the character screen writes it, and `look.hairStyle` with it; kept for what reads it)
  playerName: "", // the identity before docs/31/09: read once to migrate into identities.js, and by the ?nosave test world's identity
  look: {}, // the look before docs/31/09 (skin, hair, eyes, hairStyle): migrated with playerName; identities.js keeps them now
  nameTags: true, // another player's name over their head while in sight (docs/31/03)
  paintedLayers: {}, // slot -> painted layer name to try on, from the settings screen (docs/12)
  panelPos: {}, // "bag" | "character" | "container" -> { x, y } in UI pixels where its header was dragged to (docs/23 step 4; Michael, 2026-10-12)
  cursor: "default", // the system's own, or one of the three hands (ui/cursor.js; Michael, 2026-10-12)
  logSize: null, // { w, h } in UI pixels the text log was resized to (ui/log.js)
  extraKit: "", // items added to the starting kit, one `item_id count` a line (#136): chosen at a new world's Sandbox step
  devBag: false, // start wearing the Developer Bag in place of the sack (#136): chosen at a new world's Sandbox step
  devChest: true, // the chest of every item placed by the spawn: chosen at a new world's Sandbox step (docs/38), this is the next world's first choice; docs/30 step 0: the map file stays clean
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
// The tabs are the player's own. The groups "rules" and "sandbox" are not tabs: they are the world's, chosen at the
// Sandbox step of New world and changed by its host from the pause menu (docs/38, #109); their keys here are only the
// last choices, offered again at the next Sandbox step.
export const GROUPS = [["display", "Display"], ["testing", "Testing"]];
export const WORLD_GROUPS = ["rules", "sandbox"];
const ON_OFF = [[true, "On"], [false, "Off"]];
const SHOWN = [[true, "Shown"], [false, "Hidden"]];
export const REGISTRY = [
  { key: "uiScale", group: "display", label: "Interface size", help: "How big the menus, the bag, and the bars are drawn. Auto fits the window.", choices: [["auto", "Auto"], [1, "1×"], [1.25, "1.25×"], [1.5, "1.5×"], [1.75, "1.75×"], [2, "2×"]] }, // capped at 2 (Michael, 2026-10-12)
  { key: "worldScale", group: "display", label: "Zoom", help: "How close the camera sits. Z or the wheel changes it while you play.", choices: [["auto", "Auto"], [1.1, "Wide"], [1.8, "Middle"], [2.7, "Close"]] },
  { key: "cursor", group: "display", label: "Cursor", help: "The pointer: the system's own, or one of three hands.", choices: [["default", "Default"], ["human", "A hand"], ["severed", "A severed hand"], ["zombie", "A zombie hand"]] },
  { key: "nameTags", group: "display", label: "Names over heads", help: "Another player's name over their head while you can see them.", choices: SHOWN },
  { key: "swingTimer", group: "display", label: "Swing timer", help: "A bar at the bottom of the screen while a swing recovers.", choices: ON_OFF },
  { key: "aimGuide", group: "display", label: "Aim guide", help: "The landing marker and the dotted line while you draw a bow, wind up a throw, or cast.", choices: ON_OFF },
  { key: "zombieAggro", group: "rules", label: "Zombie aggro", help: "On, the dead hunt you. Off, they wander and ignore you.", choices: ON_OFF },
  { key: "zombiesAttackVillagers", group: "rules", label: "Zombies attack villagers", help: "On, the dead hunt villagers whatever aggro says; with aggro on, you first.", choices: ON_OFF }, // two knobs on purpose (Michael, 2026-10-15)
  { key: "survival", group: "rules", label: "Survival", help: "Hunger, thirst, and tiredness. Off, the body has no needs.", choices: ON_OFF },
  { key: "freeBuilding", group: "rules", label: "Free building", help: "Building costs nothing, for trying out structures.", choices: ON_OFF },
  { key: "multiHit", group: "rules", label: "Multi-hit", help: "A blow reaches everything in its wedge: the easy button. Off, only the nearest: the intended way.", choices: ON_OFF },
  { key: "trees", group: "rules", fixed: true, label: "Trees", help: "Trees in the forests and the wild. Off, none are made, anywhere. Chosen when the world is made.", choices: ON_OFF },
  { key: "population", group: "rules", fixed: true, label: "Starting population", help: "How many of the dead the world starts with, in its places and in each new stretch of wild. It never grows with time. Chosen when the world is made.", choices: [["none", "None"], ["low", "Low"], ["standard", "Standard"], ["high", "High"]] },
  { key: "debugCorner", group: "testing", label: "Debug corner", help: "The numbers and the keys in the top-left corner.", choices: SHOWN },
  { key: "showSwingTargets", group: "testing", label: "Swing targets", help: "A green outline on what your next swing would hit.", choices: ON_OFF },
  { key: "showHitShapes", group: "testing", label: "Hit shapes", help: "The dead's body samples, green when the next swing reaches them.", choices: ON_OFF },
  { key: "devChest", group: "sandbox", label: "Dev chest", help: "A chest of every item by the spawn, made with the world.", choices: ON_OFF },
  { key: "devBag", group: "sandbox", fixed: true, label: "Dev bag", help: "Everyone starts wearing the Developer Bag, a big bag, in place of the sack. Chosen when the world is made.", choices: ON_OFF },
  { key: "extraKit", group: "sandbox", fixed: true, text: true, label: "Extra starting items", help: "On top of the usual kit, for testing: one item a line, `sword` or `arrow 20`. Chosen when the world is made.", choices: [] },
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
export const SCREEN_KEYS = [...REGISTRY.filter((e) => !WORLD_GROUPS.includes(e.group)).map((e) => e.key), "paintedLayers"];
export function reset(keys = SCREEN_KEYS) {
  for (const k of keys) set(k, DEFAULTS[k]);
}

// Called with (key, value) after any change.
export function onChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
