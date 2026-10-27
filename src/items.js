// Items: definitions and loot tables from data/items.json and data/loot.json
// (the registry copied from cozy-zombie-game src/items.js on 2026-10-10), and
// the hand slots. Everything is a slot, nothing is a pointer (docs/11): a hand
// holds an entry, which is then nowhere else. A definition may carry `hands`
// (`main`, `off`, `both`), `wear` (a doll slot), `beltSlots` (a belt), or
// `bag: [cols, rows]` (a bag).

import * as rng from "./rng.js";
import { nextId } from "./world.js";
import { zombie as ZT } from "./tuning.js";

const items = new Map();
let lootTables = {};

// Every item entry is made here (docs/31/08, habit 2): `{ id, count, ...props }`
// stamped with an instance id `uid` from the world's counter. A copy of an
// entry (a drop, a throw) keeps its uid; when stacks merge, the one that
// absorbed keeps its uid and the emptied one is gone. Code written before
// step 2 still makes some entries as literals; new code never does.
export function makeEntry(id, count = 1, props = {}) {
  return { id, count, ...props, uid: nextId("e") };
}

// An entry that carries its own state (Michael's playtest, 2026-10-26, "The playtest's rulings": a stack dropped on a matching stack fills
// it, but "entries that carry their own state never merge"): wear, colours, a fill, clean water, a poison's coat, repairs, a lit flame, the
// tree a sapling grows, or a container's contents. Such an entry is never topped up nor poured into another (grid.js, inventory-actions.js).
export function hasOwnState(e) {
  if (!e) return false;
  return e.wear > 0 || !!e.colours || !!e.colour || e.fill != null || !!e.clean || !!e.poison || !!e.repairs || !!e.lit || !!e.tree ||
    !!(e.bag && e.bag.items && e.bag.items.length) || !!(e.slots && e.slots.some(Boolean));
}

// Whether `from` may be poured onto `into`: two entries of one stacking item, neither with a state of its own.
export function canMerge(into, from) {
  if (!into || !from || into === from || into.id !== from.id) return false;
  const def = items.get(into.id);
  return !!(def && def.stack > 1) && !hasOwnState(into) && !hasOwnState(from);
}

// Pour as much of `from` onto `into` as the stack limit lets (canMerge first): returns how many moved; the rest stays on `from`.
export function mergeInto(into, from) {
  const take = Math.max(0, Math.min(from.count, items.get(into.id).stack - into.count));
  into.count += take;
  from.count -= take;
  return take;
}

// Durability is kills (docs/30, law 5 and 5.2): a weapon's `kills` is the
// design number; the wear a landed hit costs is one over kills times the hits
// a kill takes against the standard zombie. A bow wears by its `shots`.
export function hitsPerKill(def) {
  const w = def && def.weapon;
  if (!w || !w.damage) return 0;
  return Math.ceil(ZT.hp / w.damage);
}

export function wearPerHit(def) {
  const w = def && def.weapon;
  if (!w || !w.kills) return 0;
  return 1 / (w.kills * hitsPerKill(def));
}

export function wearPerShot(def) {
  return def && def.shots ? 1 / def.shots : 0;
}

export function loadItems(list) {
  items.clear();
  for (const def of list) items.set(def.id, def);
}

export function loadLoot(tables) {
  lootTables = tables;
}

export function getItem(id) {
  const def = items.get(id);
  if (!def) throw new Error(`Unknown item ${id}`);
  return def;
}

export function allItems() {
  return [...items.values()];
}

// An item's name in a sentence, lower-cased: with its article (`aName`), its plural (`pluralName`), or a count (`countName`). A definition's
// `noun` says how it counts: "mass" (venison, lard, wool: "some lard", "3 raw venison"), "pair" (shears, breeches: "shears", "2 shears");
// its `plural` names a plural that is not +s; its `article` the words before one, over all of those ("a pair of": the millstones). Anything
// else is "a"/"an" and +s ("a feather", "3 feathers"). `namePlural` and `nameWithArticle` are the same rule for any name and the definition
// that says how it counts: a prop's, whose definition is its sprite's (src/prop-names.js).
export function nounName(id) {
  return hasItemDef(id) ? getItem(id).name.toLowerCase() : String(id).replace(/_/g, " ");
}
export function namePlural(name, def) {
  if (def && def.plural) return def.plural;
  return def && (def.noun === "mass" || def.noun === "pair") ? name : `${name}s`;
}
export function nameWithArticle(name, def) {
  if (def && def.article) return `${def.article} ${name}`;
  if (def && def.noun === "mass") return `some ${name}`;
  if (def && def.noun === "pair") return name;
  return `${/^[aeiou]/.test(name) ? "an" : "a"} ${name}`;
}
export function pluralName(id) {
  return namePlural(nounName(id), items.get(id));
}
export function aName(id) {
  return nameWithArticle(nounName(id), items.get(id));
}
export function countName(id, n) {
  return n === 1 ? aName(id) : `${n} ${pluralName(id)}`;
}

// The tool whose `verbs` list a verb (the first), or null: what a refusal names ("You need a smith's hammer.").
export function toolFor(verb) {
  return allItems().find((i) => i.kind === "tool" && (i.verbs || []).includes(verb)) || null;
}

export function hasItemDef(id) {
  return items.has(id);
}

// Grid size [cols, rows] of a container, from its loot table.
export function containerGrid(tableId) {
  return lootTables[tableId]?.grid || [4, 3];
}

function randInt(min, max) {
  return min + rng.int(max - min + 1);
}

// Roll a loot table once. Returns [{ id, count, fill? }].
export function rollLoot(tableId) {
  const table = lootTables[tableId];
  if (!table) return [];
  // A fixed table is the same every time (the combat-testing chest); a stack of N is N items,
  // for the ones that do not stack.
  if (table.fixed) return table.fixed.flatMap((e) => (getItem(e.item).stack > 1 || !e.count ? [{ id: e.item, count: e.count || 1 }] : Array.from({ length: e.count }, () => ({ id: e.item, count: 1 }))));
  const rolls = randInt(table.rolls[0], table.rolls[1]);
  const total = table.entries.reduce((n, e) => n + e.weight, 0);
  const out = [];
  for (let i = 0; i < rolls; i++) {
    let r = rng.float() * total;
    for (const e of table.entries) {
      r -= e.weight;
      if (r <= 0) {
        if (e.item !== "nothing") {
          const count = e.count ? randInt(e.count[0], e.count[1]) : 1;
          // A waterskin turns up at a random level.
          if (getItem(e.item).capacity) out.push({ id: e.item, count: 1, fill: 25 * randInt(0, 4) });
          else out.push({ id: e.item, count });
        }
        break;
      }
    }
  }
  return out;
}

// ---- hands ----

export function createHands() {
  return { main: null, off: null };
}

// Whether an item of this id can go in a hand now. `hands` on an item is
// "main", "off", "both", or "either" (one hand, whichever is free; `prefer`
// names one).
export function canHold(hands, id, prefer = null) {
  const it = items.get(id);
  if (!it || !it.hands) return false;
  if (it.hands === "both") return !hands.main && !hands.off;
  if (it.hands === "either" ? !(prefer ? !hands[prefer] : !hands.main || !hands.off) : hands[it.hands]) return false;
  return !dualRefused(hands, it);
}

// A weapon for the dual rule: a blow, a bow, or a throw (a torch is a light, not a weapon).
function isWeapon(def) {
  return !!((def.weapon && !def.fire) || def.bow || def.thrown);
}

// A spear is never held beside another weapon (`noDual`, docs/21: "the spear and the halberd never" go in either hand, and the spear is
// never dual wielded); a shield or a torch is fine, and so is anything that neither swings, shoots, nor is thrown. A tool with a weapon
// block (the shovel, the hammer, the dirk) swings as a weapon, so it is one here.
function dualRefused(hands, it) {
  return !!dualPair(hands, it);
}

function dualPair(hands, it) {
  for (const slot of ["main", "off"]) {
    const other = hands[slot] && items.get(hands[slot].id);
    if (!other) continue;
    if (it.noDual && isWeapon(other)) return [it, other];
    if (other.noDual && isWeapon(it)) return [other, it];
  }
  return null;
}

// Why an item of this id would not go in a hand beside what `hands` holds by the dual rule, in words, or null (the drag's, the menu's
// Equip's, and a guest's slot command's line: the spear's rule, never "No room to swap.", Michael's playtest 2026-10-26).
export function dualWord(hands, id) {
  const it = items.get(id);
  const pair = it && dualPair(hands, it);
  return pair ? `The ${pair[0].name.toLowerCase()} can't be held beside the ${pair[1].name.toLowerCase()}: it is never dual wielded.` : null;
}

// The hand an "either" item would take now: the preferred one if free, else
// the main hand, else the off-hand.
export function pickHand(hands, id, prefer = null) {
  const which = handFor(id);
  if (which !== "either") return which;
  if (prefer && !hands[prefer]) return prefer;
  return !hands.main ? "main" : "off";
}

// The slot name an item id wants: "main", "off", or "both".
export function handFor(id) {
  return items.get(id)?.hands || null;
}

export function hold(hands, entry, prefer = null) {
  if (!canHold(hands, entry.id, prefer)) return false;
  const which = pickHand(hands, entry.id, prefer);
  if (which === "both") {
    hands.main = entry;
    hands.off = entry;
  } else {
    hands[which] = entry;
  }
  return true;
}

// Take an entry out of the hands. Returns true if it was there.
export function release(hands, entry) {
  let did = false;
  if (hands.main === entry) {
    hands.main = null;
    did = true;
  }
  if (hands.off === entry) {
    hands.off = null;
    did = true;
  }
  return did;
}

export function holding(hands, id) {
  return (hands.main && hands.main.id === id) || (hands.off && hands.off.id === id) || false;
}

// The entry held for an id, or null.
export function heldEntry(hands, id) {
  if (hands.main && hands.main.id === id) return hands.main;
  if (hands.off && hands.off.id === id) return hands.off;
  return null;
}

// Whether an entry is giving light: a fire item that burns down (a torch) only while it is lit (Michael, 2026-10-17, #156:
// a new one starts unlit, and T lights it with a tinderbox); any other fire item always.
export function isLit(entry) {
  const it = entry && items.get(entry.id);
  return !!(it && it.fire && (!it.fire.burnsDown || entry.lit));
}

// A torch that leaves a hand, the belt, or a holder is out (Michael, 2026-10-17, #156; the torch "drains the whole time it's lit",
// and a torch dropped is an unlit item lying there, 2026-10-09): every way into a bag, a container, or onto the floor calls this.
// It douses what the entry carries too (a belt's slots, a bag's items), wherever the entry goes: a lit torch in a belt that is
// dropped, or on a body, is out (#162).
export function douse(entry) {
  if (!entry) return entry;
  if (entry.lit) {
    const it = items.get(entry.id);
    if (it && it.fire && it.fire.burnsDown) entry.lit = false;
  }
  if (entry.bag && entry.bag.items) for (const e of entry.bag.items) douse(e);
  if (Array.isArray(entry.slots)) for (const e of entry.slots) douse(e);
  return entry;
}

// The fire of a held item, if any: the light you carry.
export function heldFire(hands) {
  for (const slot of ["main", "off"]) {
    const e = hands[slot];
    if (e && isLit(e)) return items.get(e.id).fire;
  }
  return null;
}
