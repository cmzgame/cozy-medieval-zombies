// Fishing (#190; Michael, 2026-10-18: fishing joins valley 1.0; docs/30 step 9, question 19). A rod in a hand (an item whose `verbs`
// include "fish"), a cast at a water tile within `cast.reach`, a wait (the timed action's bar, `waitSeconds`), and then a roll on the table
// of the water body the tile is in (`data/fishing.json`: the map names its waters, `map.waterBodyAt`), a miss allowed. A catch goes into
// the bag, or onto the ground at the player's feet when the bag is full. No skill yet (the skills are open, docs/30).

import * as verbs from "./verbs.js";
import * as map from "./map.js";
import * as rng from "./rng.js";
import * as items from "./items.js";
import * as inventory from "./inventory.js";
import { lineOfSight } from "./visibility.js";
import { showMessage } from "./ui/prompt.js";

let data = null;

export function load(json) {
  data = json && json.cast && json.waters ? json : null;
}

export function get() {
  if (!data) throw new Error("data/fishing.json is not loaded");
  return data;
}

// The rod a player holds, or null: whatever item in a hand lists the verb.
export function rodIn(player) {
  for (const slot of ["main", "off"]) {
    const e = player.hands && player.hands[slot];
    if (e && (items.getItem(e.id).verbs || []).includes("fish")) return e;
  }
  return null;
}

// The table for a water tile: its body's, else the default's.
export function tableAt(x, y) {
  const d = get();
  return d.waters[map.waterBodyAt(x, y)] || d.waters[d.default];
}

// How long this cast waits for a bite, in game seconds, rolled on the host as the cast starts.
export function waitSeconds() {
  const c = get().cast;
  return c.waitMin + rng.float() * (c.waitMax - c.waitMin);
}

function pick(list) {
  let total = 0;
  for (const e of list) total += e.weight;
  let r = rng.float() * total;
  for (const e of list) {
    r -= e.weight;
    if (r < 0) return e.item;
  }
  return list[list.length - 1].item;
}

verbs.define("fish", {
  validate(world, player, target) {
    const t = target && target.tile;
    if (!Array.isArray(t)) return "There is no water there.";
    const [x, y] = [Math.round(t[0]), Math.round(t[1])];
    if (!rodIn(player)) return "You need a fishing rod in hand.";
    if (!map.peekTile(x, y) || !map.drinkableAt(x, y)) return "There is no water there.";
    if (Math.hypot(player.gx - x, player.gy - y) > get().cast.reach + 0.5) return "Too far from the water.";
    if (!lineOfSight(player.gx, player.gy, x, y)) return "There is a wall in the way.";
    return true;
  },
  perform(world, player, target) {
    const [x, y] = [Math.round(target.tile[0]), Math.round(target.tile[1])];
    const table = tableAt(x, y);
    if (rng.float() < table.miss) {
      showMessage("Nothing bites.");
      return { caught: null };
    }
    const id = pick(table.catch);
    const placed = inventory.addItem(inventory.bagOf(player), id, 1);
    if (placed < 1) map.dropItem(Math.round(player.gx), Math.round(player.gy), items.makeEntry(id, 1));
    showMessage(`You catch ${/^[aeiou]/i.test(items.getItem(id).name) ? "an" : "a"} ${items.getItem(id).name.toLowerCase()}.`);
    return { caught: id };
  },
});
