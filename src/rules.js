// The rules of the world the simulation reads (docs/23a, C3): one object,
// refreshed from the settings at the top of each step, so the sim never reads
// the browser's storage itself (a test in the pane changed Michael's game that
// way, CLAUDE.md) and a host could hand a guest the same object. The visual
// settings (hit shapes, swing targets, the aim guide) stay settings.

import * as settings from "./settings.js";

export const rules = {
  zombieAggro: false, // the dead hunt the player
  zombiesAttackVillagers: false, // and villagers
  multiHit: true, // a swing hits everyone in its wedge, or the nearest
  survival: false, // hunger and thirst drain
  freeBuilding: false, // building costs nothing
};

// What a world plays by when nothing says otherwise: the settings' own defaults (a save from before the
// rules rode in it gains these, save.js's upgrade; item 5's second step, 2026-10-14).
export const DEFAULTS = Object.fromEntries(Object.keys(rules).map((key) => [key, !!settings.DEFAULTS[key]]));

// A guest's rules are the host's (docs/31/03, docs/31/07 question 13): set whole from a frame, or from a save
// as it is restored (the rules ride in the save since its version 2, so a world carries its own).
export function set(obj) {
  for (const key of Object.keys(rules)) if (key in obj) rules[key] = !!obj[key];
}

// Where the world reads its rules each step: the browser's settings (a world of this browser's, as always), or a
// source the client names (a server world reads only its own, from its save; item 5). Null is the settings.
let source = null;
export function setSource(fn) {
  source = typeof fn === "function" ? fn : null;
}

export function refresh() {
  const from = source ? source() : null;
  for (const key of Object.keys(rules)) rules[key] = !!(from ? from[key] : settings.get(key));
}
