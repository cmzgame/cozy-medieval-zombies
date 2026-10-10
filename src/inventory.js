// Bags and the places an item can be (docs/11). Copied from cozy-zombie-game
// src/inventory.js on 2026-10-10 and reworked: the player's grid is the bag
// worn on the back, the hotbar is the belt worn at the waist, and an entry is
// in exactly one place. Placement rules live in grid.js.

import { getItem, release, canHold, hold, handFor } from "./items.js";
import * as grid from "./grid.js";

export const WORN_SLOTS = ["head", "chest", "hands", "legs", "feet", "waist", "back"];

// `container` names a bag for the panel's header.
export function createBag(cols, rows, container = "bag") {
  return { cols, rows, items: [], container };
}

export function createWorn() {
  return { head: null, chest: null, hands: null, legs: null, feet: null, waist: null, back: null };
}

// A bag item's grid, made on first use and kept on the entry wherever it goes.
export function ensureBag(entry) {
  const def = getItem(entry.id);
  if (!def.bag) return null;
  if (!entry.bag) entry.bag = createBag(def.bag[0], def.bag[1], def.name.toLowerCase());
  return entry.bag;
}

// A belt item's slots, made on first use.
export function ensureSlots(entry) {
  const def = getItem(entry.id);
  if (!def.beltSlots) return null;
  if (!entry.slots) entry.slots = new Array(def.beltSlots).fill(null);
  return entry.slots;
}

// The grid of the bag on the player's back, or null.
export function bagOf(player) {
  return player.worn.back ? ensureBag(player.worn.back) : null;
}

// The belt's slots, or null.
export function beltOf(player) {
  return player.worn.waist ? ensureSlots(player.worn.waist) : null;
}

export function countItem(bag, id) {
  if (!bag) return 0;
  return bag.items.filter((it) => it.id === id).reduce((n, it) => n + it.count, 0);
}

// Add count of an item, placed wherever it fits. Returns the number actually
// added (0 if there is no room or no bag).
export function addItem(bag, id, count = 1, props = {}) {
  if (!bag) return 0;
  return grid.add(bag, id, count, props);
}

// Remove count of an item from a bag. Returns the number actually removed.
export function removeItem(bag, id, count = 1) {
  if (!bag) return 0;
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

// Entries that hold water: [{ id, count, fill }].
export function waterContainers(bag) {
  return bag ? bag.items.filter((it) => getItem(it.id).capacity) : [];
}

// ---- across the player's places ----
// Hands, belt, and bag, in that order.

export function countAll(player, id) {
  let n = 0;
  for (const slot of ["main", "off"]) {
    const e = player.hands[slot];
    if (e && e.id === id && !(slot === "off" && player.hands.main === e)) n += e.count;
  }
  for (const e of beltOf(player) || []) if (e && e.id === id) n += e.count;
  n += countItem(bagOf(player), id);
  return n;
}

// Take `count` of an item from wherever the player has it. Returns how many.
export function takeAll(player, id, count = 1) {
  let remaining = count;
  const bag = bagOf(player);
  remaining -= removeItem(bag, id, remaining);
  const belt = beltOf(player) || [];
  for (let i = 0; i < belt.length && remaining > 0; i++) {
    const e = belt[i];
    if (!e || e.id !== id) continue;
    const take = Math.min(remaining, e.count);
    e.count -= take;
    remaining -= take;
    if (e.count <= 0) belt[i] = null;
  }
  for (const slot of ["main", "off"]) {
    if (remaining <= 0) break;
    const e = player.hands[slot];
    if (!e || e.id !== id) continue;
    const take = Math.min(remaining, e.count);
    e.count -= take;
    remaining -= take;
    if (e.count <= 0) release(player.hands, e);
  }
  return count - remaining;
}

// Where an entry of this id is: { place: "hand" | "belt" | "bag", entry, index? }.
export function findItem(player, id) {
  for (const slot of ["main", "off"]) {
    const e = player.hands[slot];
    if (e && e.id === id) return { place: "hand", entry: e };
  }
  const belt = beltOf(player) || [];
  for (let i = 0; i < belt.length; i++) if (belt[i] && belt[i].id === id) return { place: "belt", entry: belt[i], index: i };
  const bag = bagOf(player);
  if (bag) for (const e of bag.items) if (e.id === id) return { place: "bag", entry: e };
  return null;
}

// Remove an entry from wherever it is on the player. Returns true if found.
export function detach(player, entry) {
  if (release(player.hands, entry)) return true;
  const belt = beltOf(player);
  if (belt) {
    const i = belt.indexOf(entry);
    if (i >= 0) {
      belt[i] = null;
      return true;
    }
  }
  for (const key of WORN_SLOTS) {
    if (player.worn[key] === entry) {
      player.worn[key] = null;
      return true;
    }
  }
  const bag = bagOf(player);
  if (bag && grid.remove(bag, entry)) return true;
  return false;
}

// The one container rule (docs/02, 2026-10-10 late): a container, which is
// any item with a grid or belt slots, goes inside another container only
// while it is empty. Wear it or drop it once it holds something.
export function isContainer(entry) {
  const d = getItem(entry.id);
  return !!(d.bag || d.beltSlots);
}

export function containerEmpty(entry) {
  return (!entry.bag || entry.bag.items.length === 0) && (!entry.slots || entry.slots.every((s) => !s));
}

export function canStoreIn(entry) {
  return !isContainer(entry) || containerEmpty(entry);
}

// Put an entry somewhere on the player: the bag if it fits, else a free belt
// slot if it is holdable. Returns where it went, or null.
export function stow(player, entry) {
  const bag = bagOf(player);
  if (bag && canStoreIn(entry) && grid.insert(bag, entry)) return "bag";
  const belt = beltOf(player);
  if (belt && handFor(entry.id)) {
    const i = belt.indexOf(null);
    if (i >= 0) {
      belt[i] = entry;
      return "belt";
    }
  }
  return null;
}

// Equip an entry into its hand, swapping out what is there into the bag or
// belt. The entry must already be detached. Returns true, or false and the
// entry is left for the caller to put back.
export function equip(player, entry, prefer = null) {
  let which = handFor(entry.id);
  if (!which) return false;
  // An "either" item takes a free hand if there is one, else the preferred or
  // main hand, swapping out what is there.
  if (which === "either") which = prefer || (!player.hands.main ? "main" : !player.hands.off ? "off" : "main");
  const slots = which === "both" ? ["main", "off"] : [which];
  const outgoing = [];
  for (const s of slots) {
    const e = player.hands[s];
    if (e && !outgoing.includes(e)) outgoing.push(e);
  }
  // Make room first; if what is in the hand cannot be stowed, refuse.
  for (const e of outgoing) {
    release(player.hands, e);
    if (!stow(player, e)) {
      hold(player.hands, e);
      return false;
    }
  }
  return hold(player.hands, entry, which === "both" ? null : which);
}

// Belt key n: swap slot n with the hand its item belongs to (docs/11).
export function beltKey(player, index) {
  const belt = beltOf(player);
  if (!belt || index >= belt.length) return "nobelt";
  const e = belt[index];
  if (e) {
    belt[index] = null;
    if (equip(player, e)) return "drawn";
    belt[index] = e;
    return "handsfull";
  }
  // An empty slot takes what the main hand holds, else the off-hand.
  for (const s of ["main", "off"]) {
    const held = player.hands[s];
    if (held && handFor(held.id)) {
      release(player.hands, held);
      belt[index] = held;
      return "stowed";
    }
  }
  return "nothing";
}
