// The bucket (#199; docs/30 section 9, ruled 2026-10-18: "the bucket goes in the bag", overturning "a prop you carry on your head"): an ITEM
// whose definition says `vessel` is carried in the bag, on the belt, or in a hand, and holds water in its entry's `fill`, 0 to the vessel's
// capacity, as a waterskin does. Fill at any water (a water tile, a well, a trough, a font; the menu or the Use mode) and Pour on a plot,
// which waters every crop in the 3 by 3 round the target tile (farming.soak, as a waterskin does one) and empties it: one pour a fill.
// Both are verbs by the target tile and the entry's uid, run on the host. (A waterskin is not a bucket: `vessel` is not `capacity`, so
// "Fill waterskins" and the drink menu leave it alone; water and thirst are an open question, #209.) Its water is tainted from every fixed source
// (docs/44), and nothing boils a bucket yet: that waits for the boiling pot's fluid transfer.

import * as verbs from "./verbs.js";
import * as map from "./map.js";
import * as items from "./items.js";
import * as inventory from "./inventory.js";
import { showMessage } from "./ui/prompt.js";
import * as farming from "./farming.js";
import { lineOfSight } from "./visibility.js";
import * as water from "./water.js"; // tainted and clean water (docs/44): a fill from a tainted source taints the bucket

const vesselOf = (entry) => (entry && items.getItem(entry.id).vessel) || null;
export const capacityOf = (entry) => (vesselOf(entry) ? vesselOf(entry).capacity : 0);
const levelOf = (entry) => entry.fill ?? 0;

// Every bucket a player carries: the hands, the belt, the bag.
export function bucketsOf(player) {
  const out = [];
  for (const slot of ["main", "off"]) {
    const e = player.hands && player.hands[slot];
    if (e && vesselOf(e) && !out.includes(e)) out.push(e);
  }
  for (const e of inventory.beltOf(player) || []) if (e && vesselOf(e)) out.push(e);
  const bag = inventory.bagOf(player);
  if (bag) for (const e of bag.items) if (vesselOf(e)) out.push(e);
  return out;
}

// The bucket a verb uses: the one named (the Use mode, a guest's command by uid), else the first that can serve (hands, belt, bag). Either way it
// must be able to: a full one cannot take water and an empty one cannot pour, named or not.
const serves = (e, want) => !!e && !!vesselOf(e) && (want === "fill" ? levelOf(e) < capacityOf(e) : levelOf(e) > 0);
function pick(player, uid, want) {
  if (uid != null) {
    const e = inventory.carriedEntry(player, uid);
    return serves(e, want) ? e : null;
  }
  return bucketsOf(player).find((e) => serves(e, want)) || null;
}

// Whether a tile gives water: a water tile, or a prop that is a source (the well, a trough, a font).
export function isSource(x, y) {
  const t = map.peekTile(x, y);
  return !!t && (map.drinkableAt(x, y) || !!(t.prop && t.prop.water));
}

// The crops in the 3 by 3 round a tile that the water can reach from it: a wall between the target and a crop keeps that crop dry (#147, #206's rule).
export function cropsAround(x, y) {
  const out = [];
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      const p = map.peekTile(x + dx, y + dy)?.prop;
      if (p && p.crop && !out.includes(p) && (!dx && !dy || lineOfSight(x, y, x + dx, y + dy))) out.push(p);
    }
  }
  return out;
}

// The tile a target names: a tile address, the Use mode's x and y, or a prop (a well, a crop).
function tileOf(t) {
  if (Array.isArray(t.tile)) return [Math.round(t.tile[0]), Math.round(t.tile[1])];
  if (t.x !== undefined) return [Math.round(t.x), Math.round(t.y)];
  const p = typeof t.prop === "string" ? map.propById(t.prop) : t.prop;
  return p ? [p.tile[0], p.tile[1]] : [NaN, NaN];
}

verbs.define("fill", {
  validate(world, player, target) {
    const [x, y] = tileOf(target);
    if (!bucketsOf(player).length) return "You have no bucket.";
    if (!isSource(x, y)) return "There is no water there.";
    const why = farming.reachProblem(player, x, y);
    if (why) return why;
    if (!pick(player, target.entry, "fill")) return "Your bucket is already full.";
    return true;
  },
  perform(world, player, target) {
    const b = pick(player, target.entry, "fill");
    water.mixInto(b, water.sourceCleanAt(...tileOf(target))); // a tainted source taints it all (docs/44)
    b.fill = capacityOf(b);
    return { message: "You fill the bucket." };
  },
});

verbs.define("pour", {
  validate(world, player, target) {
    const [x, y] = tileOf(target);
    if (!bucketsOf(player).length) return "You have no bucket.";
    const why = farming.reachProblem(player, x, y);
    if (why) return why;
    if (!pick(player, target.entry, "pour")) return "The bucket is empty.";
    // Any crop in the 3 by 3, wet or dry, as the waterskin's Water takes any crop (its soil wet again from now): the Use mode on a plot the
    // map grew (wet until first looked at) said "Nothing there needs water." where the menu's Water watered it (Michael's playtest, 2026-10-26).
    if (!cropsAround(x, y).length) return "Nothing is planted there.";
    return true;
  },
  perform(world, player, target) {
    const b = pick(player, target.entry, "pour");
    const [x, y] = tileOf(target);
    const crops = cropsAround(x, y);
    for (const c of crops) farming.soak(c);
    b.fill = 0; // one pour a fill
    return { message: `You water ${crops.length} plant${crops.length > 1 ? "s" : ""}.`, watered: crops.length };
  },
});

// The pour's menu label: the bucket named, as the skin's "Water with the waterskin" is.
export const POUR_LABEL = "Water with the bucket";

// The menu's entries for a tile when a bucket is carried (interact.js): Fill where there is water, Water with the bucket where something grows.
export function tileActions(x, y, player, act, world) {
  const out = [];
  if (!bucketsOf(player).length) return out;
  if (!lineOfSight(player.gx, player.gy, x, y)) return out; // never offered through a wall (a sealed room is a cell, #147)
  const seconds = farming.get().soil.seconds;
  const run = (verb) => () => {
    const r = verbs.run(verb, world, player, { tile: [x, y] });
    if (!r.ok && r.reason) showMessage(r.reason);
    else if (r.message) showMessage(r.message);
    return r.ok;
  };
  const base = { tiles: [[x, y]], mx: x, my: y };
  const canFill = !!pick(player, null, "fill");
  const canPour = !!pick(player, null, "pour");
  if (isSource(x, y)) out.push(act({ ...base, kind: "fill", label: canFill ? "Fill the bucket" : "Fill the bucket (full)", enabled: canFill, duration: seconds.fill, perform: run("fill") }));
  // Offered where something grows in the 3 by 3 (tilled soil with nothing growing round it has nothing to water), wet or dry, as the skin's.
  // Its label names the vessel, beside "Water with the waterskin" on a crop (Michael's playtest, 2026-10-26: a choice, never the skin first unasked).
  if (cropsAround(x, y).length) out.push(act({ ...base, kind: "pour", label: canPour ? POUR_LABEL : `${POUR_LABEL} (empty)`, enabled: canPour, duration: seconds.pour, perform: run("pour") }));
  return out;
}
