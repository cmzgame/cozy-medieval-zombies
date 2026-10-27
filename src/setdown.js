// Things set down from the bag and picked up again (docs/43 section 4, step 3; Michael, 2026-10-25): an item whose definition names a prop
// (`place`, or `placeAs` for Place as decoration) is set down on a tile as that prop, by its own rule for where it may stand (`stand`:
// "outdoors", "wall" for indoors against a wall, "ground" for any open floor, "natural" for open grass outdoors, a sapling's, trees.js's rule); the prop's definition names the item Pick up gives back
// (`item`). A torch post is one (outdoors, picked up only when a player made it and it holds no torch); a decoration is another (a pumpkin
// placed as decoration comes back a Decorative pumpkin, not food, so a prop that does not rot is never a larder). A torch goes on a wall's
// face with a bracket drawn with it (Place torch, #523; paintings.js's rules for a face) and is picked up again with its bracket. The
// campfire keeps its own module (campfire.js: its fuel and its fire decide when it comes up). Headless, on the authority: the host's own
// clicks and a guest's `place` commands both come here.

import * as map from "./map.js";
import * as inventory from "./inventory.js";
import * as items from "./items.js";
import * as grid from "./grid.js";
import * as paintings from "./paintings.js";
import { getDef } from "./assets.js";
import { propName } from "./prop-names.js"; // a prop's name in words, the one helper
import * as clock from "./clock.js";
import { noteSnare } from "./entities/animal.js"; // the snares the step looks at (docs/45 section 2)
import * as trees from "./trees.js"; // a sapling planted on open grass (docs/46 step 3)
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
  if (rule === "natural") return trees.standProblem(tx, ty); // a sapling: open grass outdoors, no wall beside it (docs/46 step 3)
  const t = map.peekTile(tx, ty);
  if (!t || !map.isWalkableTile(tx, ty) || t.prop || t.rug) return "No room";
  const curve = map.ringFurnitureProblem(tx, ty); // a tile a ring's curve crosses holds no furniture (Michael, 2026-10-26, docs/50)
  if (curve) return curve;
  if (rule === "outdoors" && t.room > 0) return "Outdoors only";
  if (rule === "wall" && !(t.room > 0)) return "Indoors only";
  if (rule === "wall" && !wallBeside(tx, ty)) return "Against a wall";
  return "";
}

// ---- a prop of several tiles built from the palette (the Fireplace along a wall, the 2 by 2 fire pit; Michael, 2026-10-26, the fire rulings) ----

// A sprite's footprint in a facing: its definition's `facingFootprint` for that facing, else its `footprint`, else one tile.
export function footprintOf(sprite, facing = null) {
  const d = getDef(sprite);
  const ff = d.facingFootprint && (d.facingFootprint[facing] || d.facingFootprint[(d.facings || [])[0]]);
  const fp = ff || d.footprint || [1, 1];
  return [fp[0], fp[1]];
}

// The facing a prop of this sprite would take when it is not chosen by a wall (the first, or none).
const firstFacing = (sprite) => (getDef(sprite).facings || [])[0] || null;

// Whether an edge is a plain solid wall a fire can back onto: a wall (not a door, a window, or a gap), unbroken, not a fence or bars.
function flatWall(w) {
  return !!w && w.kind === "wall" && !w.broken && !map.wallRule(w.sprite).seeThrough && !map.isRingWall(w); // never a ring: a fireplace is a straight piece (docs/50 section 3)
}

// Whether a tile's floor is water (the river, the pond, a shallow ford): drunk from, or walked slower.
function onWater(t) {
  if (!t) return false;
  const r = map.floorRule(t.floor);
  return !!r.drink || r.walk !== 1;
}

// Why the footprint of `sprite` in `facing`, its anchor at (tx, ty), cannot stand by `rule`, or "". Every tile open floor with nothing on it
// (a read never grows a chunk), off the water, clear of a door's two tiles (the dead go for a door and must stand there, #134), with no wall
// between two of its tiles, and every tile in one room or all outdoors; then the rule: "outdoors" none indoors, "ground" indoors or out, and
// "wall" indoors with its back on a flat wall along its whole length: a facing "y" (it backs onto a west wall, docs/17's drawn fireplace) the
// west edge of every tile, a facing "x" (its mirror) the north edge of every tile.
export function fitProblem(rule, sprite, tx, ty, facing = firstFacing(sprite)) {
  const [w, h] = footprintOf(sprite, facing);
  if (w * h === 1) return standProblem(rule, tx, ty) || (onWater(map.peekTile(tx, ty)) ? "Not on water" : ""); // one tile: the set-down's rule, a wall on any side for "wall"
  let room = null;
  for (let dy = 0; dy < h; dy++) {
    for (let dx = 0; dx < w; dx++) {
      const x = tx + dx;
      const y = ty + dy;
      const t = map.peekTile(x, y);
      if (!t || !map.isWalkableTile(x, y) || t.prop || t.rug) return "No room";
      const curve = map.ringFurnitureProblem(x, y);
      if (curve) return curve;
      if (onWater(t)) return "Not on water";
      if (map.besideDoor(x, y)) return "Not beside a door";
      if ((dx > 0 && map.wallBetween(x - 1, y, x, y)) || (dy > 0 && map.wallBetween(x, y - 1, x, y))) return "No room";
      const r = t.room > 0 ? t.room : 0;
      if (room === null) room = r;
      else if (r !== room) return "No room";
    }
  }
  if (rule === "outdoors" && room > 0) return "Outdoors only";
  if (rule === "wall") {
    if (!(room > 0)) return "Indoors only";
    const along = facing === "x" ? "n" : "w"; // the edge it backs onto
    for (let dy = 0; dy < h; dy++) for (let dx = 0; dx < w; dx++) if (!flatWall(map.peekTile(tx + dx, ty + dy)[along])) return "Against a wall";
  }
  return "";
}

// Where a prop of `sprite` built by `rule` stands when the cursor is on (cx, cy): { tx, ty, facing, footprint, problem }. A wall-backed prop
// with facings (the Fireplace) tries, for each anchor in turn (the tile under the cursor, then the one above it along y, then the one left of
// it along x, so either of its two tiles may be pointed at), each facing in order, and takes the first that fits; a guest's command names
// the anchor alone, and the host's `fitAt` picks the same facing there by the same order. Anything else is centred on the cursor, as a
// carried prop's ghost is.
export function fitFor(rule, sprite, cx, cy) {
  const d = getDef(sprite);
  if (rule === "wall" && d.facings && d.facings.length > 1) {
    cx = Math.round(cx); // the tile under the cursor
    cy = Math.round(cy);
    let first = null;
    for (const [ax, ay] of [[cx, cy], [cx, cy - 1], [cx - 1, cy]]) {
      const f = fitAt(rule, sprite, ax, ay);
      if (!f.problem) return f;
      if (!first) first = f;
    }
    return { ...first, tx: cx, ty: cy };
  }
  const facing = firstFacing(sprite);
  const [w, h] = footprintOf(sprite, facing);
  const tx = Math.round(cx - (w - 1) / 2); // the footprint centred on the cursor's grid point (unrounded), as a carried prop's ghost is
  const ty = Math.round(cy - (h - 1) / 2);
  return { tx, ty, facing, footprint: [w, h], problem: fitProblem(rule, sprite, tx, ty, facing) };
}

// The fit with its anchor at (tx, ty): for a wall-backed prop with facings, the first facing in order that fits there (else the first's
// refusal); otherwise its one facing. What the host builds for a command that names the anchor.
export function fitAt(rule, sprite, tx, ty) {
  const d = getDef(sprite);
  const facings = rule === "wall" && d.facings && d.facings.length > 1 ? d.facings : [firstFacing(sprite)];
  let first = null;
  for (const facing of facings) {
    const f = { tx, ty, facing, footprint: footprintOf(sprite, facing), problem: fitProblem(rule, sprite, tx, ty, facing) };
    if (!f.problem) return f;
    if (!first) first = f;
  }
  return first;
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

// The item `uid` in the player's bag that sets down, or null.
export function entryOf(player, uid) {
  const bag = inventory.bagOf(player);
  if (!bag || uid == null) return null;
  return bag.items.find((e) => e.uid === uid && !!placeOf(items.getItem(e.id))) || null;
}

const nameOf = (sprite) => {
  const item = getDef(sprite).item;
  return (item && items.hasItemDef(item) ? items.getItem(item).name : propName(sprite)).toLowerCase();
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
  const sapling = !!getDef(p.sprite).sapling;
  const prop = map.createProp({ sprite: p.sprite, tile: [tx, ty], ...(snare || sapling ? { solid: false } : {}) }); // a snare is a stake and a noose, a sapling a whip of a tree: walked over
  if (!p.decoration && !sapling) prop.made = true; // a player's own; a decoration is only picked up again, never taken apart, and a sapling grows into a tree of the woods
  if (snare) prop.snare = { setAt: clock.getElapsed(), holds: null }; // set from now: it holds a rabbit after a while (docs/45 section 2, animal.js)
  if (snare) noteSnare(prop);
  if (sapling) trees.plant(prop, clock.getElapsed(), entry.tree || null); // growing from now, into the tree its entry carries (docs/46 step 3)
  map.placeProp(prop, tx, ty, player.layer || 0); // on the player's own layer (docs/49)
  showMessage(p.decoration ? `You set the ${items.getItem(entry.id).name.toLowerCase()} down as decoration.` : sapling ? `You plant the ${nameOf(p.sprite)}.` : `You set the ${nameOf(p.sprite)} down.`);
  return true;
}

// Why a prop that names its item cannot be picked up now, or "": a torch post the village set up is the village's (only a player's own comes
// up), and one holding a torch keeps it until the torch is taken.
// A station of your own with a fire under it (the cauldron, docs/47 section 3) comes up only while it is out and empty, as the campfire does: no
// fire burning or fuel left in it, nothing brewing, nothing in its output.
export function pickUpProblem(prop) {
  const d = prop && getDef(prop.sprite);
  if (!d || !d.item) return "That cannot be picked up.";
  if (d.fire && !prop.made) return d.station ? "That is not yours to lift." : "That is the village's.";
  if (prop.fire && prop.fire.has) return "Take the torch first.";
  const f = prop.fire;
  if (f && f.burns && !f.switch) {
    if (f.lit) return "Its fire is still burning; let it burn down.";
    if (f.fuel > 0) return "It still has fuel in it; let it burn down.";
  }
  if (prop.queue && prop.queue.length) return "It is still making something.";
  if (prop.output && prop.output.items && prop.output.items.length) return "Empty it first.";
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
  const entry = items.makeEntry(getDef(prop.sprite).item, 1, prop.sapling && prop.sapling.tree ? { tree: prop.sapling.tree } : {}); // a sapling keeps the tree it grows into
  if (!bag || !grid.insert(bag, entry)) {
    showMessage(bag ? "No room in your bag." : "You have no bag.");
    return false;
  }
  map.removeProp(prop);
  showMessage(`You pick up the ${nameOf(prop.sprite)}.`);
  return true;
}

// ---- a torch put on a wall, with its bracket (Michael, 2026-10-27, #523: no Wall bracket item) ----
// Place torch, on a torch's own menu in the bag, on the belt, or in a hand: the ghost on the face of the wall under the cursor, as a
// painting's (placement.js), and a click mounts it there on a bracket drawn with it (map.mountTorch). The torch keeps its entry (its uid,
// its wear, lit or not); picked up, it comes back put out, as a torch leaving any holder does (#156), and the bracket goes with it. The
// address is the face's (tx, ty, edge; the layer joins it once docs/49's floors land). The Use mode's Use torch on a wall is left out (one
// way in, as Michael leaned).

const wallOf = (tx, ty, edge) => {
  const t = map.peekTile(tx, ty);
  return t ? t[edge] : null;
};

// Whether an item goes on a wall as a torch does (its definition's `wallMount`: the torch).
export const mountsOnWall = (def) => !!(def && def.wallMount);

// The torch `uid` the player carries (a hand, the belt, the bag), or null.
export function torchOf(player, uid) {
  const e = inventory.carriedEntry(player, uid);
  return e && mountsOnWall(items.getItem(e.id)) ? e : null;
}

// Why a torch cannot go on this face, or "": no bracket on either face of it (a lantern's, a torch's), then a painting's rules for a face: a
// plain drawn wall (never a fence, bars, a window, a door, or a gap) with nothing hung on it. A ring edge of a round room (docs/50, not
// built) counts as wall for a torch: when rings land, its face is found at its point on the curve (paintings.facesAt) and accepted here.
export function mountProblem(tx, ty, edge) {
  const wall = wallOf(tx, ty, edge);
  if (wall && wall.bracket) return "A bracket is already there";
  // A ring's edge counts as wall for a torch (Michael, 2026-10-26: "the ring counts as wall for hearths and torches"): the bracket hangs at
  // its point on the curve, on a face the camera sees (map.ringFace), where a painting never hangs.
  if (map.isRingWall(wall)) return map.ringFace(tx, ty, edge, 1) ? "" : "Not on that side of the curve";
  return paintings.segmentProblem(tx, ty, edge);
}

// Why the player cannot reach that face, or "": the floor tile it looks onto, as a painting's.
export function mountReach(player, tx, ty) {
  return reachFor(player, ...paintings.floorTile(tx, ty));
}

// Put the torch `uid` on the face (tx, ty, edge): the host's click and a guest's `torch` command. Says why not and returns false;
// otherwise the torch leaves the player, lit or not, and stands on the wall in its bracket.
export function mountTorch(player, uid, tx, ty, edge) {
  const entry = torchOf(player, uid);
  if (!entry) return false;
  tx = Math.round(Number(tx));
  ty = Math.round(Number(ty));
  if (!Number.isFinite(tx) || !Number.isFinite(ty) || (edge !== "n" && edge !== "w")) return false;
  const why = mountReach(player, tx, ty) || mountProblem(tx, ty, edge);
  if (why) {
    showMessage(why);
    return false;
  }
  // Mounted first, then taken from the player, so a refusal at either step loses no torch (the review of #532).
  const b = map.mountTorch(tx, ty, edge, entry, player.layer || 0); // on the player's own layer (docs/49)
  if (!b) return false;
  if (!inventory.detach(player, entry)) {
    map.removeBracket(b);
    return false;
  }
  showMessage(entry.lit ? "You put the torch on the wall, burning." : "You put the torch on the wall.");
  return true;
}

// Why a torch on a wall cannot be picked up, or "": only one a player put there (`made`), with its bracket.
export function pickUpTorchProblem(b) {
  const br = b && b.wall && b.wall.bracket;
  if (!br || !br.torch) return "There is no torch there.";
  if (!br.made) return "That is the village's.";
  return "";
}

// Pick up a torch a player put on a wall: into a free hand, else the belt or the bag (as a torch taken from any holder), put out, its
// own uid and wear; the bracket goes with it. True when it came up.
export function pickUpTorch(player, b) {
  const why = pickUpTorchProblem(b) || reachFor(player, ...map.bracketFloor(b));
  if (why) {
    showMessage(why);
    return false;
  }
  const entry = map.torchEntryOf(b.wall.bracket);
  const inHand = items.canHold(player.hands, entry.id) && items.hold(player.hands, entry);
  if (!inHand && !inventory.stow(player, entry)) {
    showMessage(inventory.bagOf(player) ? "No room in your bag." : "You have no bag.");
    return false;
  }
  map.removeBracket(b);
  showMessage("You pick up the torch.");
  return true;
}
