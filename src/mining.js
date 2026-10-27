// Mining (#196; docs/30 section 10: "Pickaxe: mine a rock (stone blocks; the rock goes), mine an ore rock (ore)"). A prop whose sprite
// has a `mine` block can be mined with a tool in a hand whose item `verbs` list `mine` (the pickaxe):
//   "mine": { "item": "stone", "count": [3, 3], "seconds": 3, "gone": true }        a rock: gives stone and goes
//   "mine": { "item": "iron_ore", "count": [2, 2], "seconds": 3, "gone": true }     an ore rock: gives iron ore and goes
// A mined node inside its area leaves a debt on the area's record, and a new one rises somewhere else in that area after a while
// (resources.js, docs/46): an ore rock no longer stands spent to come back in place. Everything but the code is data: the counts, the seconds.

import * as verbs from "./verbs.js";
import * as map from "./map.js";
import * as rng from "./rng.js";
import * as items from "./items.js";
import * as inventory from "./inventory.js";
import * as resources from "./resources.js";
import { getDef } from "./assets.js";
import { showMessage } from "./ui/prompt.js";
import { world as W } from "./tuning.js";
import { lineOfSight } from "./visibility.js";

// The tool a player holds that mines, or null: whatever item in a hand lists the verb.
export function heldPick(player) {
  for (const slot of ["main", "off"]) {
    const e = player.hands && player.hands[slot];
    if (e && (items.getItem(e.id).verbs || []).includes("mine")) return e;
  }
  return null;
}

// The mine block of a prop's sprite, or null (a tree, a house).
export const mineOf = (prop) => (prop && getDef(prop.sprite).mine) || null;

verbs.define("mine", {
  validate(world, player, target) {
    const prop = typeof target.prop === "string" ? map.propById(target.prop) : target.prop;
    if (!prop) return "There is nothing there.";
    if (!mineOf(prop)) return "There is nothing to mine.";
    if (!heldPick(player)) return "You need a pickaxe in hand.";
    if (Math.hypot(player.gx - prop.tile[0], player.gy - prop.tile[1]) > W.pickReach) return "Too far away.";
    if (!lineOfSight(player.gx, player.gy, prop.tile[0], prop.tile[1])) return "There is a wall in the way."; // a sealed room is a cell (#147)
    return true;
  },
  perform(world, player, target) {
    const prop = typeof target.prop === "string" ? map.propById(target.prop) : target.prop;
    const m = mineOf(prop);
    if (!m || map.propById(prop.id) !== prop) return false; // two miners: the second finds it gone
    const [lo, hi] = m.count;
    const n = lo + rng.int(hi - lo + 1);
    const placed = Math.min(n, inventory.addItem(inventory.bagOf(player), m.item, n));
    if (placed < n) map.dropItem(Math.round(player.gx), Math.round(player.gy), items.makeEntry(m.item, n - placed), player.layer || 0);
    resources.taken(prop); // its replacement is owed to its area, before it goes (none for a rock in the wild)
    map.removeProp(prop);
    const name = items.getItem(m.item).name.toLowerCase();
    showMessage(placed < n ? `You mine ${n} ${name}; ${n - placed} fall${n - placed > 1 ? "" : "s"} at your feet.` : `You mine ${n} ${name}.`);
    return { mined: n };
  },
});
