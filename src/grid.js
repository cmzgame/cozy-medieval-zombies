// Copied from cozy-zombie-game src/grid.js on 2026-10-10. Changed since: a bag that only gives (`takeOnly`, a belt's slots opened where it
// lies, inventory.slotsView) takes nothing in; an entry with a state of its own never merges (items.canMerge, Michael's playtest, 2026-10-26).
// Grid inventory rules. Pure: no DOM, no game state. See docs/10-interface.md
// (and the parent's docs/21-grid-inventory.md for the reasons).
//
// A bag is { cols, rows, items }. An entry is { id, count, x, y, rot } plus any
// per-instance state such as `fill`. (x, y) is the top-left cell; `rot` swaps
// the item's width and height.

import { getItem, makeEntry, douse, canMerge, hasOwnState } from "./items.js";
import { nextId } from "./world.js";

// [w, h] in cells for an item id at a rotation.
export function sizeOfId(id, rot = false) {
  const [w, h] = getItem(id).size || [1, 1];
  return rot ? [h, w] : [w, h];
}

export function sizeOf(entry) {
  return sizeOfId(entry.id, !!entry.rot);
}

// Would an item of this id and rotation fit at (x, y)? `ignore` is an entry to
// treat as absent (the one being moved).
export function fits(bag, id, x, y, rot = false, ignore = null) {
  if (bag.takeOnly) return false; // a belt's slots opened as a container: things come out, nothing goes in (inventory.slotsView)
  if (bag.accepts && !(getItem(id).tags || []).includes(bag.accepts)) return false; // a grid for one kind of thing (a feeding trough's feed, docs/45)
  const [w, h] = sizeOfId(id, rot);
  if (x < 0 || y < 0 || x + w > bag.cols || y + h > bag.rows) return false;
  for (const e of bag.items) {
    if (e === ignore) continue;
    const [ew, eh] = sizeOf(e);
    if (x < e.x + ew && e.x < x + w && y < e.y + eh && e.y < y + h) return false;
  }
  return true;
}

// The entry covering a cell, or null.
export function entryAt(bag, cx, cy) {
  for (const e of bag.items) {
    const [w, h] = sizeOf(e);
    if (cx >= e.x && cx < e.x + w && cy >= e.y && cy < e.y + h) return e;
  }
  return null;
}

// First place an item fits, scanning top to bottom, unrotated first.
export function findSpot(bag, id, ignore = null) {
  const [w, h] = sizeOfId(id);
  const rots = w === h ? [false] : [false, true];
  for (const rot of rots) {
    for (let y = 0; y < bag.rows; y++) {
      for (let x = 0; x < bag.cols; x++) {
        if (fits(bag, id, x, y, rot, ignore)) return { x, y, rot };
      }
    }
  }
  return null;
}

// Add `count` of an item, topping up stacks first and then placing new entries.
// `props` is per-instance state copied onto new entries. Returns how many went in.
export function add(bag, id, count = 1, props = {}) {
  const def = getItem(id);
  let remaining = count;
  if (bag.takeOnly) return 0;
  if (def.stack && !hasOwnState(props)) {
    for (const e of bag.items) {
      if (remaining <= 0) break;
      if (e.id !== id || e.count >= def.stack || hasOwnState(e)) continue; // a stack with a state of its own (a coat) is never topped up
      const take = Math.min(remaining, def.stack - e.count);
      e.count += take;
      remaining -= take;
    }
  }
  while (remaining > 0) {
    const spot = findSpot(bag, id);
    if (!spot) break;
    const take = def.stack ? Math.min(remaining, def.stack) : 1;
    bag.items.push(makeEntry(id, take, { ...props, x: spot.x, y: spot.y, rot: spot.rot })); // one maker for every entry (docs/31/08, habit 2)
    remaining -= take;
  }
  return count - remaining;
}

// Put an existing entry (from anywhere) into a bag wherever it fits. Merges into
// stacks when it can. Returns true if the whole entry went in.
export function insert(bag, entry) {
  const def = getItem(entry.id);
  if (def.stack && !hasOwnState(entry)) { // a stack with its own state goes in whole, as itself (its coat kept)
    const moved = add(bag, entry.id, entry.count);
    entry.count -= moved;
    return entry.count <= 0;
  }
  const spot = findSpot(bag, entry.id);
  if (!spot) return false;
  Object.assign(entry, spot);
  if (entry.uid == null) entry.uid = nextId("e"); // every item in a bag has an instance id (docs/31/08 habit 2)
  douse(entry); // a torch put away is out
  bag.items.push(entry);
  return true;
}

export function remove(bag, entry) {
  const i = bag.items.indexOf(entry);
  if (i >= 0) bag.items.splice(i, 1);
  return i >= 0;
}

// Move an entry to (x, y, rot) in `to`, from `from` (the same bag or another).
// Dropping a stackable onto a matching stack tops it up instead. Returns
// "moved", "merged", "partial" (some merged, the rest stayed), or null.
export function moveEntry(from, to, entry, x, y, rot) {
  const def = getItem(entry.id);
  const target = entryAt(to, x, y);
  if (def.stack && target && !to.takeOnly && canMerge(target, entry)) {
    const take = Math.min(entry.count, def.stack - target.count);
    if (take <= 0) return null;
    target.count += take;
    entry.count -= take;
    if (entry.count <= 0) {
      remove(from, entry);
      return "merged";
    }
    return "partial";
  }
  if (!fits(to, entry.id, x, y, rot, entry)) return null;
  if (from !== to) {
    remove(from, entry);
    douse(entry);
    to.items.push(entry);
  }
  entry.x = x;
  entry.y = y;
  entry.rot = !!rot;
  return "moved";
}

// Move an entry into another bag wherever it fits. Returns true if all of it went.
export function transfer(from, to, entry) {
  const def = getItem(entry.id);
  if (def.stack && !hasOwnState(entry)) {
    const moved = add(to, entry.id, entry.count);
    entry.count -= moved;
    if (entry.count <= 0) remove(from, entry);
    return entry.count <= 0;
  }
  const spot = findSpot(to, entry.id);
  if (!spot) return false;
  remove(from, entry);
  Object.assign(entry, spot);
  douse(entry);
  to.items.push(entry);
  return true;
}

// Repack: biggest first. If the repack somehow fails, nothing changes.
export function tidy(bag) {
  const old = bag.items.map((e) => ({ e, x: e.x, y: e.y, rot: e.rot }));
  const order = [...bag.items].sort((a, b) => {
    const [aw, ah] = sizeOfId(a.id);
    const [bw, bh] = sizeOfId(b.id);
    return bw * bh - aw * ah || Math.max(bw, bh) - Math.max(aw, ah) || a.id.localeCompare(b.id);
  });
  bag.items.length = 0;
  for (const e of order) {
    const spot = findSpot(bag, e.id);
    if (!spot) {
      bag.items.length = 0;
      for (const o of old) {
        Object.assign(o.e, { x: o.x, y: o.y, rot: o.rot });
        bag.items.push(o.e);
      }
      return false;
    }
    Object.assign(e, spot);
    bag.items.push(e);
  }
  return true;
}

// Place a list of loose { id, count, ...state } into a bag, dropping what does
// not fit. For rolled loot.
export function fill(bag, loose) {
  for (const it of loose) {
    const { id, count, ...props } = it;
    add(bag, id, count, props);
  }
}
