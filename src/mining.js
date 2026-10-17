// Mining (#196; docs/30 section 10: "Pickaxe: mine a rock (stone blocks; the rock goes), mine an ore rock (ore)"). A prop whose sprite
// has a `mine` block can be mined with a tool in a hand whose item `verbs` list `mine` (the pickaxe):
//   "mine": { "item": "stone", "count": [2, 4], "seconds": 3, "gone": true }                       a rock: gives stone and goes for good
//   "mine": { "item": "iron_ore", "count": [2, 2], "seconds": 3, "spent": "ore_rock_spent", "days": 3 }   an ore rock: gives ore, stands spent
// A spent kind says what it `ripens` to (`ore_rock_spent` -> `ore_rock`), the same mechanism as a picked apple tree (fruit.js `step` turns it
// back on its clock day, `regrowAt` saved on the prop and carried in the chunk), so iron never runs out (step 1's "no resource stoppage").
// Everything but the code is data: the counts, the seconds, the days.

import * as verbs from "./verbs.js";
import * as map from "./map.js";
import * as clock from "./clock.js";
import * as rng from "./rng.js";
import * as items from "./items.js";
import * as inventory from "./inventory.js";
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

// The mine block of a prop's sprite, or null (a spent ore rock, a tree).
export const mineOf = (prop) => (prop && getDef(prop.sprite).mine) || null;

verbs.define("mine", {
  validate(world, player, target) {
    const prop = typeof target.prop === "string" ? map.propById(target.prop) : target.prop;
    if (!prop) return "There is nothing there.";
    if (!mineOf(prop)) { const back = getDef(prop.sprite).ripens; return back && getDef(back).mine ? "It is mined out; the ore will come back." : "There is nothing to mine."; } // a spent ore rock, not a bare apple tree
    if (!heldPick(player)) return "You need a pickaxe in hand.";
    if (Math.hypot(player.gx - prop.tile[0], player.gy - prop.tile[1]) > W.pickReach) return "Too far away.";
    if (!lineOfSight(player.gx, player.gy, prop.tile[0], prop.tile[1])) return "There is a wall in the way."; // a sealed room is a cell (#147)
    return true;
  },
  perform(world, player, target) {
    const prop = typeof target.prop === "string" ? map.propById(target.prop) : target.prop;
    const m = mineOf(prop);
    if (!m) return false; // two miners: the second finds it gone or spent
    const [lo, hi] = m.count;
    const n = lo + rng.int(hi - lo + 1);
    const placed = Math.min(n, inventory.addItem(inventory.bagOf(player), m.item, n));
    if (placed < n) map.dropItem(Math.round(player.gx), Math.round(player.gy), items.makeEntry(m.item, n - placed));
    if (m.gone) map.removeProp(prop);
    else map.restage(prop, m.spent, clock.getElapsed() + m.days * clock.DAY_LENGTH);
    const name = items.getItem(m.item).name.toLowerCase();
    showMessage(placed < n ? `You mine ${n} ${name}; ${n - placed} fall${n - placed > 1 ? "" : "s"} at your feet.` : `You mine ${n} ${name}.`);
    return { mined: n };
  },
});
