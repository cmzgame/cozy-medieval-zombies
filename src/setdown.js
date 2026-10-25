// Things set down from the bag and picked up again (docs/43 section 4, step 3; Michael, 2026-10-25): an item whose definition names a prop
// (`place`, or `placeAs` for Place as decoration) is set down on a tile as that prop, by its own rule for where it may stand (`stand`:
// "outdoors", "wall" for indoors against a wall, "ground" for any open floor); the prop's definition names the item Pick up gives back
// (`item`). A torch post is one (outdoors, picked up only when a player made it and it holds no torch); a decoration is another (a pumpkin
// placed as decoration comes back a Decorative pumpkin, not food, so a prop that does not rot is never a larder). A wall bracket (an item
// with `bracket`) is hung on a wall's face as a painting is (paintings.js's rules for a face) and taken down again while empty. The
// campfire keeps its own module (campfire.js: its fuel and its fire decide when it comes up). Headless, on the authority: the host's own
// clicks and a guest's `place` commands both come here.

import * as map from "./map.js";
import * as inventory from "./inventory.js";
import * as items from "./items.js";
import * as grid from "./grid.js";
import * as paintings from "./paintings.js";
import { getDef } from "./assets.js";
import * as clock from "./clock.js";
import { reachProblem, TOO_FAR } from "./reach.js";
import { showMessage } from "./ui/prompt.js";

export const REACH = 2.6; // tiles from the player to the tile set down on, as a carried prop's and the campfire's

// Whether a tile has a plain solid wall on any of its four sides (n and w its own, s and e its neighbours').
function wallBeside(tx, ty) {
  const t = map.peekTile(tx, ty);
  const s = map.peekTile(tx, ty + 1);
  const e = map.peekTile(tx + 1, ty);
  return [t && t.n, t && t.w, s && s.n, e && e.w].some((w) => w && w.kind === "wall" && !w.broken && !map.wallRule(w.sprite).seeThrough);
}

// Why a prop cannot stand on (tx, ty) by this rule, or "": open floor with nothing on it (a read never grows a chunk: a tile not grown is no
// room), then outdoors only, or indoors against a wall.
export function standProblem(rule, tx, ty) {
  const t = map.peekTile(tx, ty);
  if (!t || !map.isWalkableTile(tx, ty) || t.prop || t.rug) return "No room";
  if (rule === "outdoors" && t.room > 0) return "Outdoors only";
  if (rule === "wall" && !(t.room > 0)) return "Indoors only";
  if (rule === "wall" && !wallBeside(tx, ty)) return "Against a wall";
  return "";
}

// Why this player cannot reach (tx, ty) from where they stand, or "".
export function reachFor(player, tx, ty) {
  const why = reachProblem(player, [[tx, ty]], REACH);
  return why === TOO_FAR ? "Too far" : why || "";
}

// What an item sets down as: { sprite, stand, decoration } (decoration for Place as decoration), or null.
export function placeOf(def) {
  if (!def) return null;
  if (def.placeAs) return { sprite: def.placeAs, stand: "ground", decoration: true };
  if (def.place && def.place !== "campfire") return { sprite: def.place, stand: def.stand || "ground", decoration: false };
  return null;
}

// The item `uid` in the player's bag that sets down (or hangs, with `bracket`), or null.
export function entryOf(player, uid, bracket = false) {
  const bag = inventory.bagOf(player);
  if (!bag || uid == null) return null;
  return bag.items.find((e) => e.uid === uid && (bracket ? !!items.getItem(e.id).bracket : !!placeOf(items.getItem(e.id)))) || null;
}

const nameOf = (sprite) => {
  const item = getDef(sprite).item;
  return (item && items.hasItemDef(item) ? items.getItem(item).name : sprite.replace(/_\d+$/, "").replace(/_/g, " ")).toLowerCase();
};

// Set the item `uid` down on (tx, ty): the host's click and a guest's `setdown` command. Says why not and returns false; otherwise the item
// leaves the bag (one of a stack) and its prop stands there, `made` (a player's own: Take apart's and Pick up's mark).
export function place(player, uid, tx, ty) {
  const entry = entryOf(player, uid);
  if (!entry) return false;
  const p = placeOf(items.getItem(entry.id));
  tx = Math.round(Number(tx));
  ty = Math.round(Number(ty));
  if (!Number.isFinite(tx) || !Number.isFinite(ty)) return false;
  const why = reachFor(player, tx, ty) || standProblem(p.stand, tx, ty);
  if (why) {
    showMessage(why);
    return false;
  }
  const bag = inventory.bagOf(player);
  if ((entry.count || 1) > 1) entry.count -= 1;
  else grid.remove(bag, entry);
  const snare = !!getDef(p.sprite).snare;
  const prop = map.createProp({ sprite: p.sprite, tile: [tx, ty], ...(snare ? { solid: false } : {}) }); // a snare is a stake and a noose: walked over
  if (!p.decoration) prop.made = true; // a player's own; a decoration is only picked up again, never taken apart
  if (snare) prop.snare = { setAt: clock.getElapsed(), holds: null }; // set from now: it holds a rabbit after a while (docs/45 section 2, animal.js)
  map.placeProp(prop, tx, ty);
  showMessage(p.decoration ? `You set the ${items.getItem(entry.id).name.toLowerCase()} down as decoration.` : `You set the ${nameOf(p.sprite)} down.`);
  return true;
}

// Why a prop that names its item cannot be picked up now, or "": a torch post the village set up is the village's (only a player's own comes
// up), and one holding a torch keeps it until the torch is taken.
export function pickUpProblem(prop) {
  const d = prop && getDef(prop.sprite);
  if (!d || !d.item) return "That cannot be picked up.";
  if (d.fire && !prop.made) return "That is the village's.";
  if (prop.fire && prop.fire.has) return "Take the torch first.";
  return "";
}

// Pick it up into the bag as its item; true when it came up.
export function pickUp(player, prop) {
  if (!prop || map.propById(prop.id) !== prop) return false;
  const why = pickUpProblem(prop) || reachFor(player, prop.tile[0], prop.tile[1]);
  if (why) {
    showMessage(why);
    return false;
  }
  const bag = inventory.bagOf(player);
  const entry = items.makeEntry(getDef(prop.sprite).item, 1);
  if (!bag || !grid.insert(bag, entry)) {
    showMessage(bag ? "No room in your bag." : "You have no bag.");
    return false;
  }
  map.removeProp(prop);
  showMessage(`You pick up the ${nameOf(prop.sprite)}.`);
  return true;
}

// ---- the wall bracket: hung on a wall's face as a painting is ----

const wallOf = (tx, ty, edge) => {
  const t = map.peekTile(tx, ty);
  return t ? t[edge] : null;
};

// Why a bracket cannot hang on this face, or "": a painting's rules for a face (a plain drawn wall, nothing hung there), and no bracket
// on either face of it.
export function bracketProblem(tx, ty, edge) {
  const wall = wallOf(tx, ty, edge);
  if (wall && wall.bracket) return "A bracket is already there";
  return paintings.segmentProblem(tx, ty, edge);
}

// Why the player cannot reach that face, or "": the floor tile it looks onto, as a painting's.
export function bracketReach(player, tx, ty) {
  return reachFor(player, ...paintings.floorTile(tx, ty));
}

// Hang the bracket item `uid` on (tx, ty, edge): the host's click and a guest's `bracket` command.
export function hang(player, uid, tx, ty, edge) {
  const entry = entryOf(player, uid, true);
  if (!entry) return false;
  tx = Math.round(Number(tx));
  ty = Math.round(Number(ty));
  if (!Number.isFinite(tx) || !Number.isFinite(ty) || (edge !== "n" && edge !== "w")) return false;
  const why = bracketReach(player, tx, ty) || bracketProblem(tx, ty, edge);
  if (why) {
    showMessage(why);
    return false;
  }
  grid.remove(inventory.bagOf(player), entry);
  map.hangBracket(tx, ty, edge);
  showMessage("You hang the bracket on the wall.");
  return true;
}

// Why a bracket cannot be taken down, or "": only a player's own, and only empty.
export function takeDownProblem(b) {
  const br = b && b.wall && b.wall.bracket;
  if (!br) return "There is no bracket there.";
  if (!br.made) return "That is the village's.";
  if (br.torch || br.lantern) return "Take the torch first.";
  return "";
}

// Take the bracket down into the bag; true when it came down.
export function takeDown(player, b) {
  const why = takeDownProblem(b) || bracketReach(player, b.tx, b.ty);
  if (why) {
    showMessage(why);
    return false;
  }
  const bag = inventory.bagOf(player);
  const entry = items.makeEntry("wall_bracket", 1);
  if (!bag || !grid.insert(bag, entry)) {
    showMessage(bag ? "No room in your bag." : "You have no bag.");
    return false;
  }
  map.removeBracket(b);
  showMessage("You take the bracket down.");
  return true;
}
