// The campfire (docs/43, section 3; Michael, 2026-10-25 and 2026-10-27): made at the workbench as the Campfire item (three stone and two
// logs, data/recipes.json; the build menu holds only what cannot be carried), 3 by 3 in the bag, set down from it with Place on open ground
// outdoors, one tile, cold and empty, and fed logs as any fire; it holds six logs of three game hours each; a log on a cold one lights
// nothing (#168: a flame is needed); Put out keeps the fuel left; it is picked up only when out and empty (no log tricks), as the item
// again; taken apart, it gives back half its make (placement.partsOf). The world's side: headless, on the authority; the host's own clicks
// and a guest's commands both come here. The fire's own rules (burning, lighting, putting out) are map.js's and burn.js's, as every fire's.

import * as map from "./map.js";
import * as inventory from "./inventory.js";
import * as items from "./items.js";
import * as grid from "./grid.js";
import { reachProblem, TOO_FAR } from "./reach.js";
import { bodyOnTiles } from "./stations.js"; // no campfire set down on a body, as no build goes up over one
import { showMessage } from "./ui/prompt.js";

export const SPRITE = "campfire";
export const ITEM = "campfire"; // the item a picked-up campfire is (data/items.json `place`)
export const REACH = 2.6; // tiles from the player to the tile it is set down on, as a carried prop's

// Why a campfire cannot stand on (tx, ty), or "": open ground outdoors, nothing standing there, not in water (a ford is walkable), and
// no body on it (the wiki's sync, 2026-10-27: the fire pit refused both and the campfire neither).
// On the setter's floor, `layer` (docs/53 step 6): a wall walk is outdoors as the ground is; never on a stair or its landing.
export function standProblem(tx, ty, layer = 0) {
  const t = map.peekTile(tx, ty, layer); // a read never grows a chunk (src/CLAUDE.md): a tile not grown is no room
  if (!t || !map.isWalkableTile(tx, ty, layer) || t.prop || t.rug) return "No room";
  if (map.stairAt(tx, ty, layer) || map.landingAt(tx, ty, layer) || map.ladderAt(tx, ty, layer)) return "No room";
  if (t.room > 0) return "Outdoors only";
  const r = map.floorRule(t.floor);
  if (r.drink || r.walk !== 1) return "Not on water";
  if (bodyOnTiles([[tx, ty]], layer)) return "Someone is in the way";
  return "";
}

// Why this player cannot set one down there from where they stand, or "": too far, or a wall in the line.
export function reachFor(player, tx, ty) {
  const why = reachProblem(player, [[tx, ty]], REACH);
  return why === TOO_FAR ? "Too far" : why || "";
}

// A campfire put on the map: out, holding `fuel` logs, made by a player when `made` (Take apart takes only what a player made).
export function makeFire(tx, ty, fuel = 0, made = false, layer = 0) {
  const prop = map.createProp({ sprite: SPRITE, tile: [tx, ty] });
  if (made) prop.made = true;
  prop.fire.fuel = Math.max(0, Math.min(prop.fire.maxFuel, fuel));
  prop.fire.lit = false;
  map.placeProp(prop, tx, ty, layer);
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
// again where it is set down; the village's own comes up marked `made: false`, and is never taken apart. One made at the workbench
// carries no mark: it is the player's own.
export function pickUp(player, prop) {
  if (!prop || prop.sprite !== SPRITE || map.propById(prop.id) !== prop) return false;
  const why = pickUpProblem(prop) || reachFor(player, prop.tile[0], prop.tile[1]);
  if (why) {
    showMessage(why);
    return false;
  }
  const bag = inventory.bagOf(player);
  const entry = items.makeEntry(ITEM, 1, { made: !!prop.made });
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
// otherwise the item leaves the bag and an empty, cold campfire stands there, the player's own unless the item was the village's.
export function place(player, uid, tx, ty) {
  const entry = entryOf(player, uid);
  if (!entry) return false;
  tx = Math.round(Number(tx));
  ty = Math.round(Number(ty));
  if (!Number.isFinite(tx) || !Number.isFinite(ty)) return false;
  const why = reachFor(player, tx, ty) || standProblem(tx, ty, player.layer || 0);
  if (why) {
    showMessage(why);
    return false;
  }
  grid.remove(inventory.bagOf(player), entry);
  makeFire(tx, ty, 0, entry.made !== false, player.layer || 0);
  showMessage("You set the campfire down.");
  return true;
}
