// Bags: the player's and every container's. Copied from cozy-zombie-game
// src/inventory.js on 2026-10-10; the equipped weapon became the hands in
// items.js. Placement rules live in grid.js (docs/10-interface.md).

import { getItem, release } from "./items.js";
import * as grid from "./grid.js";

export const BAG_COLS = 6;
export const BAG_ROWS = 4;

// `container` names a container bag for the panel's header; the player's is "bag".
export function createBag(cols = BAG_COLS, rows = BAG_ROWS, container = "bag") {
  return { cols, rows, items: [], container };
}

export function countItem(bag, id) {
  return bag.items.filter((it) => it.id === id).reduce((n, it) => n + it.count, 0);
}

// Add count of an item, placed wherever it fits. Returns the number actually
// added (0 if there is no room). `props` (e.g. { fill }) go on each new entry.
export function addItem(bag, id, count = 1, props = {}) {
  return grid.add(bag, id, count, props);
}

// Remove count of an item. Returns the number actually removed.
export function removeItem(bag, id, count = 1) {
  let remaining = count;
  for (let i = bag.items.length - 1; i >= 0 && remaining > 0; i--) {
    const it = bag.items[i];
    if (it.id !== id) continue;
    const take = Math.min(remaining, it.count);
    it.count -= take;
    remaining -= take;
    if (it.count <= 0) bag.items.splice(i, 1);
  }
  return count - remaining;
}

// Remove one specific entry.
export function removeEntry(bag, entry) {
  return grid.remove(bag, entry);
}

// A held item must still be in the bag.
export function fixHands(player) {
  for (const slot of ["main", "off"]) {
    const id = player.hands[slot];
    if (id && countItem(player.bag, id) === 0) release(player.hands, id);
  }
}

// Entries that hold water: [{ id, count, fill }].
export function waterContainers(bag) {
  return bag.items.filter((it) => getItem(it.id).capacity);
}
