// The campfire (docs/43, section 3; Michael, 2026-10-25): built from the build palette on open ground outdoors (three stone and two logs,
// the two logs its starting fuel), it holds six logs of three game hours each; a log on a cold one lights nothing (#168: a flame is
// needed); Put out keeps the fuel left; it is picked up only when out and empty (no log tricks), as a Campfire item, and set down
// again with the ghost; taken apart, it gives back half its stones (the logs were fuel). The world's side: headless, on the
// authority; the host's own clicks and a guest's commands both come here. The fire's own rules (burning, lighting, putting out) are
// map.js's and burn.js's, as every fire's.

import * as map from "./map.js";
import * as inventory from "./inventory.js";
import * as items from "./items.js";
import * as grid from "./grid.js";
import { reachProblem, TOO_FAR } from "./reach.js";
import { showMessage } from "./ui/prompt.js";

export const SPRITE = "campfire";
export const ITEM = "campfire"; // the item a picked-up campfire is (data/items.json `place`)
export const REACH = 2.6; // tiles from the player to the tile it is set down on, as a carried prop's

// Why a campfire cannot stand on (tx, ty), or "": open ground outdoors, nothing standing there.
export function standProblem(tx, ty) {
  const t = map.peekTile(tx, ty); // a read never grows a chunk (src/CLAUDE.md): a tile not grown is no room
  if (!t || !map.isWalkableTile(tx, ty) || t.prop || t.rug) return "No room";
  if (t.room > 0) return "Outdoors only";
  return "";
}

// Why this player cannot set one down there from where they stand, or "": too far, or a wall in the line.
export function reachFor(player, tx, ty) {
  const why = reachProblem(player, [[tx, ty]], REACH);
  return why === TOO_FAR ? "Too far" : why || "";
}

// A campfire put on the map: out, holding `fuel` logs, made by a player when `made` (Take apart takes only what a player made).
export function makeFire(tx, ty, fuel = 0, made = false) {
  const prop = map.createProp({ sprite: SPRITE, tile: [tx, ty] });
  if (made) prop.made = true;
  prop.fire.fuel = Math.max(0, Math.min(prop.fire.maxFuel, fuel));
  prop.fire.lit = false;
  map.placeProp(prop, tx, ty);
  return prop;
}

// Why it cannot be picked up now, or "": it is lit, or it still has fuel in it.
export function pickUpProblem(prop) {
  const f = prop && prop.fire;
  if (!f) return "That is not a campfire.";
  if (f.lit) return "Put it out first.";
  if (f.fuel > 0) return "It still has fuel in it; let it burn down.";
  return "";
}

// Pick it up into the bag as a Campfire item; true when it came up. A campfire a player made comes up made, so it can be taken apart
// again where it is set down; the village's own does not.
export function pickUp(player, prop) {
  if (!prop || prop.sprite !== SPRITE || map.propById(prop.id) !== prop) return false;
  const why = pickUpProblem(prop) || reachFor(player, prop.tile[0], prop.tile[1]);
  if (why) {
    showMessage(why);
    return false;
  }
  const bag = inventory.bagOf(player);
  const entry = items.makeEntry(ITEM, 1, prop.made ? { made: true } : {});
  if (!bag || !grid.insert(bag, entry)) {
    showMessage(bag ? "No room in your bag." : "You have no bag.");
    return false;
  }
  map.removeProp(prop);
  showMessage("You pick up the campfire.");
  return true;
}

// The Campfire item `uid` in the player's bag, or null.
export function entryOf(player, uid) {
  const bag = inventory.bagOf(player);
  if (!bag || uid == null) return null;
  return bag.items.find((e) => e.uid === uid && e.id === ITEM) || null;
}

// Set the Campfire item `uid` down on (tx, ty): the host's click and a guest's `campfire` command. Says why not and returns false;
// otherwise the item leaves the bag and an empty, cold campfire stands there.
export function place(player, uid, tx, ty) {
  const entry = entryOf(player, uid);
  if (!entry) return false;
  tx = Math.round(Number(tx));
  ty = Math.round(Number(ty));
  if (!Number.isFinite(tx) || !Number.isFinite(ty)) return false;
  const why = reachFor(player, tx, ty) || standProblem(tx, ty);
  if (why) {
    showMessage(why);
    return false;
  }
  grid.remove(inventory.bagOf(player), entry);
  makeFire(tx, ty, 0, !!entry.made);
  showMessage("You set the campfire down.");
  return true;
}
