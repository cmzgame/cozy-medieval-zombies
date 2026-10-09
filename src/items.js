// Items: definitions and loot tables from data/items.json and data/loot.json
// (the registry copied from cozy-zombie-game src/items.js on 2026-10-10), and
// the two hand slots (docs/02, hands: every holdable item is `main`, `off`,
// or `both`; a two-handed item needs both slots). An equipped item stays in
// the bag; the hand holds its id (docs/10-interface.md).

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

export function canHold(hands, id) {
  const it = items.get(id);
  if (!it || !it.hands) return false;
  if (it.hands === "both") return !hands.main && !hands.off;
  return !hands[it.hands];
}

export function hold(hands, id) {
  if (!canHold(hands, id)) return false;
  const it = getItem(id);
  if (it.hands === "both") {
    hands.main = id;
    hands.off = id;
  } else {
    hands[it.hands] = id;
  }
  return true;
}

export function release(hands, id) {
  let did = false;
  if (hands.main === id) {
    hands.main = null;
    did = true;
  }
  if (hands.off === id) {
    hands.off = null;
    did = true;
  }
  return did;
}

export function holding(hands, id) {
  return hands.main === id || hands.off === id;
}

// Which hand holds an item id, or null.
export function handOf(hands, id) {
  if (hands.main === id) return "main";
  if (hands.off === id) return "off";
  return null;
}

// The fire of a held item, if any: the light you carry.
export function heldFire(hands) {
  for (const slot of ["main", "off"]) {
    const it = hands[slot] && items.get(hands[slot]);
    if (it && it.fire) return it.fire;
  }
  return null;
}
