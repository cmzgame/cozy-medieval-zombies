// The rules of the world the simulation reads (docs/23a, C3): one object, the world's own. A browser's world has them
// from its Sandbox step (game.create) or its save (game.restore), changed by its host from the pause menu; they ride
// in the save and in a frame to a guest, so the sim never reads the browser's storage itself (a test in the pane
// changed Michael's game that way, CLAUDE.md) and a host hands a guest the same object. A server world reads them from
// a source instead (setSource). Until 2026-10-16 (docs/38, #109) a browser's world read the browser's settings at
// every step, so a rule set in one world followed you into the next; that is over. The visual settings (hit shapes,
// swing targets, the aim guide) stay settings.

import * as settings from "./settings.js";

// What a world plays by when nothing says otherwise: the settings' own defaults (a save from before the
// rules rode in it gains these, save.js's upgrade; item 5's second step, 2026-10-14).
// No rule for the villagers: every one is immune to the dead by its own flag, data (Michael, 2026-10-28; docs/02), so "Zombies attack
// villagers" is gone, and an older save's or server world's value of it is dropped by `set` and `refresh` as any unknown key is.
export const DEFAULTS = {
  zombieAggro: !!settings.DEFAULTS.zombieAggro, // the dead hunt the player
  multiHit: !!settings.DEFAULTS.multiHit, // a swing hits everyone in its wedge, or the nearest
  survival: !!settings.DEFAULTS.survival, // hunger and thirst drain
  freeBuilding: !!settings.DEFAULTS.freeBuilding, // building costs nothing
  unlimitedMana: !!settings.DEFAULTS.unlimitedMana, // a cast costs no mana and the bar reads full (mana.js), for testing spells
  trees: settings.DEFAULTS.trees !== false, // the world has trees (#130): off, none are placed when it is made or a chunk is grown
  population: settings.DEFAULTS.population, // "none", "low", "standard", or "high": how many of the dead it starts with (#130)
  villageStations: !!settings.DEFAULTS.villageStations, // the village's stations fixed, or movable and craftable (docs/43 section 5)
  extraKit: settings.DEFAULTS.extraKit, // text, one `item_id count` a line: items every new character starts with beyond the default kit (#136; kit.js)
  devBag: !!settings.DEFAULTS.devBag, // every new character starts wearing the Developer Bag in place of the sack (#136)
};

// The rules that are one of a few words, not a switch.
export const ENUMS = { population: ["none", "low", "standard", "high"] };

// The rules chosen when a world is made and never changed after (#130): they shape what is placed, and a change
// would reach only the chunks not yet grown. A server world's owner cannot set them either.
export const FIXED = ["trees", "population", "villageStations", "extraKit", "devBag"];

// The rules that are text, not a switch or a word (#136).
export const TEXTS = ["extraKit"];

export const rules = { ...DEFAULTS };

// A value as its rule keeps it: a switch true or false, a word one of its words (else the default).
export function coerce(key, v) {
  if (TEXTS.includes(key)) return typeof v === "string" ? v.slice(0, 600) : DEFAULTS[key]; // a text, as long as a list of items can reasonably be
  if (ENUMS[key]) return ENUMS[key].includes(v) ? v : DEFAULTS[key];
  return !!v;
}

// A guest's rules are the host's (docs/31/03, docs/31/07 question 13): set whole from a frame, or from a save
// as it is restored (the rules ride in the save since its version 2, so a world carries its own).
export function set(obj) {
  for (const key of Object.keys(rules)) if (key in obj) rules[key] = coerce(key, obj[key]);
}

// A new world's rules: the defaults, over them what its Sandbox step chose (game.create).
export function setWhole(obj = {}) {
  set({ ...DEFAULTS, ...obj });
}

// Where a world reads its rules each step when it does not own them: a source the client names (a server world reads
// only its own, from its meta and save; item 5). A browser's world has no source and keeps what it was given.
let source = null;
export function setSource(fn) {
  source = typeof fn === "function" ? fn : null;
}

export function refresh() {
  if (!source) return;
  const from = source();
  for (const key of Object.keys(rules)) rules[key] = coerce(key, from[key]);
}
