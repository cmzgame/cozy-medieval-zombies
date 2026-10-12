// Items: definitions and loot tables from data/items.json and data/loot.json
// (the registry copied from cozy-zombie-game src/items.js on 2026-10-10), and
// the hand slots. Everything is a slot, nothing is a pointer (docs/11): a hand
// holds an entry, which is then nowhere else. A definition may carry `hands`
// (`main`, `off`, `both`), `wear` (a doll slot), `beltSlots` (a belt), or
// `bag: [cols, rows]` (a bag).

const items = new Map();
let lootTables = {};

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

export function hasItemDef(id) {
  return items.has(id);
}

// Grid size [cols, rows] of a container, from its loot table.
export function containerGrid(tableId) {
  return lootTables[tableId]?.grid || [4, 3];
}

function randInt(min, max) {
  return min + Math.floor(Math.random() * (max - min + 1));
}

// Roll a loot table once. Returns [{ id, count, fill? }].
export function rollLoot(tableId) {
  const table = lootTables[tableId];
  if (!table) return [];
  const rolls = randInt(table.rolls[0], table.rolls[1]);
  const total = table.entries.reduce((n, e) => n + e.weight, 0);
  const out = [];
  for (let i = 0; i < rolls; i++) {
    let r = Math.random() * total;
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

// A spear is never held beside another weapon (`noDual`, docs/21); a shield or a torch is fine.
function dualRefused(hands, it) {
  for (const slot of ["main", "off"]) {
    const other = hands[slot] && items.get(hands[slot].id);
    if (!other) continue;
    if ((it.noDual && isWeapon(other)) || (other.noDual && isWeapon(it))) return true;
  }
  return false;
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

// The fire of a held item, if any: the light you carry.
export function heldFire(hands) {
  for (const slot of ["main", "off"]) {
    const e = hands[slot];
    const it = e && items.get(e.id);
    if (it && it.fire) return it.fire;
  }
  return null;
}
