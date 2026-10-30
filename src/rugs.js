// Rugs (#327; docs/02, 2026-10-20, "Paintings and rugs are items: placed from the bag, picked up again"): a rug is an item (kind decor, rolled up, 1 by 4) that Place lays on the
// floor as a flat 2 by 3 prop and Pick up rolls back into the bag. The laid rug is a prop in the tile's own `rug` slot (map.js), not in `prop`: it never blocks a step or a sight,
// furniture may stand on it or be set down over it, and it is drawn on the ground under everything there (render/rugs.js). It carries the item it came from (`rugItem`), so Pick up
// gives back the same item. This module is the world's side of both, run on the authority (the host's own click and a guest's command meet the same rules): where a rug fits, laying
// it from the bag, and taking it up. The ghost and R are placement.js's; the Pick up action is interact.js's, calling `pickUp`.

import * as map from "./map.js";
import * as inventory from "./inventory.js";
import * as grid from "./grid.js";
import { getDef } from "./assets.js";
import { getItem, makeEntry } from "./items.js";
import { propName, propAName } from "./prop-names.js"; // a prop's name in words, the one helper
import { reachProblem, TOO_FAR } from "./reach.js";
import { showMessage } from "./ui/prompt.js";

export const REACH = 2.6; // tiles from the player to the nearest tile of the rug being laid or taken up (as placing furniture)

// The item definition if this id is a rug, else null.
export function rugDef(itemId) {
  const d = typeof itemId === "string" ? getItem(itemId) : null;
  return d && d.rug ? d : null;
}

// A rug's footprint [w, h] for a facing: the sprite's `facingFootprint`.
export function footprintFor(sprite, facing) {
  const fp = (getDef(sprite).facingFootprint || {})[facing] || [2, 3];
  return [fp[0], fp[1]];
}

export const facingsOf = (sprite) => (getDef(sprite).facings || ["y"]).slice();

// A prop's name for a message: any tree a "tree", a crop as what it is ("potato crop", not "crop potato"), anything else by prop-names.js (its recipe's label, its
// definition's `name`, else its id in words: "dye vat", not "dyevat"); `aNameOf` with the right article ("an anvil", "an ore cart", "a pair of millstones").
export function nameOf(sprite) {
  const crop = sprite.match(/^crop_([a-z]+)_\d+$/);
  if (sprite.startsWith("tree_")) return "tree"; // every kind and size of tree
  return crop ? `${crop[1]} crop` : propName(sprite);
}
export const withArticle = (name) => `${/^[aeiou]/i.test(name) ? "an" : "a"} ${name}`;
export const aNameOf = (sprite) => (sprite.startsWith("tree_") || /^crop_/.test(sprite) ? withArticle(nameOf(sprite)) : propAName(sprite));

// Why a rug of this sprite and facing cannot lie with its top tile at (tx, ty), or "": a tile with no ground to lie on (water, an unloaded edge), another rug, a prop that cannot be
// lifted away (so the rug could never be taken up), or a wall between two of its tiles (it fits within a room or the open ground, never across a wall). Furniture that can be lifted
// is fine on the tiles, and so are items and bodies.
// On a storey (`layer`, docs/53 step 6) the same on that floor: never over the void or a stair.
export function fitProblem(sprite, facing, tx, ty, layer = 0) {
  const [w, h] = footprintFor(sprite, facing);
  for (let dy = 0; dy < h; dy++) {
    for (let dx = 0; dx < w; dx++) {
      const x = tx + dx;
      const y = ty + dy;
      const t = map.peekTile(x, y, layer);
      if (!t || map.isEngineFloor(t.floor) || map.stairAt(x, y, layer)) return "No room";
      if (map.floorRule(t.floor).walk === false) return "No room";
      if (t.rug) return "A rug is already there";
      // Only under what can be lifted away (a table, a chest, a bed, a chair, a barrel): under a tree, an anvil, a crop, or a cart it could never come up again.
      if (t.prop && getDef(t.prop.sprite).carry !== true) return `There is ${aNameOf(t.prop.sprite)} in the way`;
      if (dx > 0 && map.wallBetween(x - 1, y, x, y, layer)) return "A wall is in the way";
      if (dy > 0 && map.wallBetween(x, y - 1, x, y, layer)) return "A wall is in the way";
    }
  }
  return "";
}

// Why the player cannot lay it there from where they stand: too far, or a wall or a shut door in the line.
export function reachFor(player, sprite, facing, tx, ty) {
  const [w, h] = footprintFor(sprite, facing);
  const tiles = [];
  for (let dy = 0; dy < h; dy++) for (let dx = 0; dx < w; dx++) tiles.push([tx + dx, ty + dy]);
  const why = reachProblem(player, tiles, REACH);
  return why === TOO_FAR ? "Too far" : why || "";
}

// The rug entry with this uid in the player's bag (or null).
export function entryOf(player, uid) {
  const bag = inventory.bagOf(player);
  if (!bag || uid == null) return null;
  return bag.items.find((e) => e.uid === uid && rugDef(e.id)) || null;
}

// Lay the rug item `uid` from the player's bag with its top tile at (tx, ty) and this facing: the host's, and a guest's command. Says why it cannot (to the acting player) and returns
// false; otherwise the item leaves the bag, the rug is a prop on the map, and true.
export function placeRug(player, uid, tx, ty, facing) {
  const entry = entryOf(player, uid);
  if (!entry) return false;
  const def = rugDef(entry.id);
  const sprite = def.rug;
  tx = Math.round(Number(tx));
  ty = Math.round(Number(ty));
  if (!Number.isFinite(tx) || !Number.isFinite(ty)) return false;
  const facings = facingsOf(sprite);
  if (!facings.includes(facing)) facing = facings[0];
  const why = reachFor(player, sprite, facing, tx, ty) || fitProblem(sprite, facing, tx, ty, player.layer || 0); // on the player's own floor (docs/53 step 6)
  if (why) {
    showMessage(why);
    return false;
  }
  const [w, h] = footprintFor(sprite, facing);
  const bag = inventory.bagOf(player);
  grid.remove(bag, entry);
  const prop = map.createProp({ sprite, tile: [tx, ty], footprint: [w, h], facing, solid: false });
  prop.rugItem = def.id;
  map.placeProp(prop, tx, ty, player.layer || 0);
  return true;
}

// The furniture standing on a laid rug, or null: anything in a `prop` slot on its tiles (a table, a chest, a barrel).
export function standingOn(rug) {
  for (const [x, y] of rug.tiles) {
    const t = map.peekTile(x, y, rug.layer || 0);
    if (t && t.prop) return t.prop;
  }
  return null;
}

// Why the rug cannot come up now, or "": furniture stands on it (taking it up would leave the thing floating over nothing).
export function pickUpProblem(rug) {
  const on = standingOn(rug);
  return on ? `Move the ${nameOf(on.sprite)} off it first.` : "";
}

// Roll the rug up into the player's bag, or at their feet if the bag is full; true when it came up.
export function pickUp(player, rug) {
  if (!rug || !rug.rugItem || !rugDef(rug.rugItem)) return false;
  if (map.propById(rug.id) !== rug) return false; // already taken up: a walk to it (a guest's command, or a far click) that meets someone else's pick-up gets nothing, never a second rug
  const why = pickUpProblem(rug);
  if (why) {
    showMessage(why);
    return false;
  }
  const bag = inventory.bagOf(player);
  const entry = makeEntry(rug.rugItem, 1);
  map.removeProp(rug);
  if (!bag || !grid.insert(bag, entry)) {
    map.dropItem(Math.round(player.gx), Math.round(player.gy), entry, player.layer || 0);
    showMessage("Your bag is full: the rug is at your feet.");
  }
  return true;
}

// The rug on a tile, or null.
export function rugAt(x, y, layer = 0) {
  const t = map.peekTile(x, y, layer);
  return (t && t.rug) || null;
}
