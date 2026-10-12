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

export function refresh() {
  for (const key of Object.keys(rules)) rules[key] = !!settings.get(key);
}
