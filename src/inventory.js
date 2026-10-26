// Bags and the places an item can be (docs/11). Copied from cozy-zombie-game
// src/inventory.js on 2026-10-10 and reworked: the player's grid is the bag
// worn on the back, the hotbar is the belt worn at the waist, and an entry is
// in exactly one place. Placement rules live in grid.js.

import { getItem, toolFor, aName, release, canHold, hold, handFor } from "./items.js";
import * as grid from "./grid.js";

export const WORN_SLOTS = ["head", "chest", "hands", "legs", "feet", "waist", "back"];

// `container` names a bag for the panel's header.
// A slot id, "kind:key" (a hand, a worn slot, a belt index, a bag cell), taken apart (docs/23a, E).
export function parseSlot(id) {
  const [kind, key] = id.split(":");
  return { kind, key, index: Number(key) };
}

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

// Every entry that holds water the player carries: the bag's and the belt's (a skin on the belt is filled and drunk from too).
export function skinsOf(player) {
  return [...waterContainers(bagOf(player)), ...(beltOf(player) || []).filter((e) => e && getItem(e.id).capacity)];
}

// The tool rule (Michael, 2026-10-18, #214, #215): an action that would realistically need a tool needs the tool carried, in a hand,
// on the belt, or in the bag (whether it must also be in a hand is open question 32). The tool is found by its data, an item whose
// `verbs` list the verb, never by an id. Hands, then the belt, then the bag; `prefer` (an entry's test) asks for one that meets a
// condition, and the first that does wins wherever it is carried, else the first at all: milking prefers an empty bucket, so a bucket of
// water in a hand does not hide an empty one in the bag.
export function carriedTool(player, verb, prefer = null) {
  const out = [];
  for (const slot of ["main", "off"]) {
    const e = player.hands && player.hands[slot];
    if (e && (getItem(e.id).verbs || []).includes(verb)) out.push(e);
  }
  for (const e of beltOf(player) || []) if (e && (getItem(e.id).verbs || []).includes(verb)) out.push(e);
  const bag = bagOf(player);
  if (bag) for (const e of bag.items) if ((getItem(e.id).verbs || []).includes(verb)) out.push(e);
  return (prefer && out.find(prefer)) || out[0] || null;
}

// The refusal for a missing tool, or null: "You need a smith's hammer." names the item the verb belongs to, with its article ("You need
// shears.": the item's `noun`, items.aName).
export function toolProblem(player, verb) {
  if (carriedTool(player, verb)) return null;
  const t = toolFor(verb);
  return `You need ${t ? aName(t.id) : "a tool"}.`;
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

// The worn slots whose item is drawn on the figure (`figure/wardrobe.js` OUTFIT_SLOTS): the ones an eye toggle can hide.
export const HIDEABLE = ["head", "chest", "hands", "legs", "feet", "waist", "back"];

// Hide or show what is worn in a slot on the figure (#159: WoW's show-helm). The item stays worn and keeps every use: the belt's slots and a belt torch's light,
// a bag's size. Only a slot with something worn can be hidden; showing is always allowed. Returns whether the slot is now hidden, or null when nothing was done.
export function toggleHidden(player, slot) {
  if (!player || !HIDEABLE.includes(slot)) return null;
  const list = Array.isArray(player.hidden) ? player.hidden : [];
  const was = list.includes(slot);
  if (!was && !(player.worn && player.worn[slot])) return null;
  player.hidden = was ? list.filter((s) => s !== slot) : [...list, slot].sort();
  return !was;
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
  if (belt && handFor(entry.id) && !offBelt(entry)) {
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
  // A two-handed item pushes the off hand's item away (the shield); remember it, so going back to
  // a one-handed weapon puts it back (docs/21: flipping through weapons lost the guard).
  const displaced = which === "both" && player.hands.off && player.hands.off !== player.hands.main ? player.hands.off : null;
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
  const ok = hold(player.hands, entry, which === "both" ? null : which);
  if (ok) {
    if (which === "both") player.offMemory = displaced || null;
    else if (which === "off") player.offMemory = null;
    else restoreOffHand(player);
  }
  return ok;
}

// The off-hand item a two-handed one pushed out comes back when a one-handed item takes the main
// hand and the off hand is empty, if it is still in the bag or on the belt. Once only.
export function restoreOffHand(player) {
  const m = player.offMemory;
  player.offMemory = null;
  if (!m || player.hands.off || !canHold(player.hands, m.id, "off")) return false;
  if (!detach(player, m)) return false;
  return hold(player.hands, m, "off");
}

// ---- The belt's hands (#285; Michael, 2026-10-19: a belt slot's key does one thing, into the hand chosen for that slot) ----
// A held item on the belt goes to the hand chosen for its slot in the slot's menu ("Equip to main hand", "Equip to off hand"), kept on
// the player (`player.beltHands[i]`, { id, hand }) until it is changed. The choice is for the kind of item it was made on (the builder's
// reading of "that item from that slot"): a fresh torch in a slot chosen for a torch's off hand keeps it, and a sword put there goes to
// its own default, the main hand, so flipping through weapons is never dual wielding by accident (docs/21).

// A thing too long for the belt (Michael, 2026-10-19: the halberd, "perhaps the greatsword"): its item says `noBelt`. The slot check
// (inventory-actions canPlace) and stow ask this, so a guest's slot command is refused too (#226).
export function offBelt(entry) {
  return !!(entry && getItem(entry.id)?.noBelt);
}

export function offBeltWord(entry) {
  return `The ${getItem(entry.id).name.toLowerCase()} is too long for the belt.`;
}

// The hand an item goes to from the belt by its own nature (the ruling's default, "the item's own hand"): a one-hand-only item its own
// hand, a two-handed one both, a book the off hand, a light a free hand ("free": a torch drawn beside a sword goes to the off hand, as
// before), and anything else that fits either the main hand. Null for a thing no hand holds.
export function beltDefault(def) {
  if (!def || !def.hands) return null;
  if (def.hands !== "either") return def.hands;
  if (def.book) return "off";
  if (def.fire) return "free";
  return "main";
}

// The hand slot `index`'s key draws its item into now, as the menu's two entries name it: "main" or "off" (a two-handed item's is "main",
// both hands with it). The slot's choice when it was made on this kind of item, else the default. Null for an empty slot or a thing no hand holds.
export function beltHand(player, index) {
  const belt = beltOf(player);
  const e = belt && belt[index];
  const def = e && getItem(e.id);
  if (!def || !def.hands) return null;
  const c = Array.isArray(player.beltHands) ? player.beltHands[index] : null;
  if (c && c.id === e.id && (c.hand === "main" || c.hand === "off")) return c.hand;
  const d = beltDefault(def);
  if (d === "both") return "main";
  if (d === "free") return !player.hands.main ? "main" : !player.hands.off ? "off" : "main";
  return d;
}

// Why `hand` cannot take this entry, or "" (the ruling: a visible refusal only when the chosen hand cannot take it).
export function handProblem(entry, hand) {
  const def = getItem(entry.id);
  const n = def.name.toLowerCase();
  if (def.hands === "both" && hand === "off") return `The ${n} needs both hands.`;
  if (def.hands === "main" && hand === "off") return `The ${n} cannot be held in your off hand.`;
  if (def.hands === "off" && hand === "main") return `The ${n} cannot be held in your main hand.`;
  return "";
}

// Choose the hand for belt slot `index` (the slot's menu; a guest's by its label, run here): kept on the player for the kind of item there
// now. Refused, with the refusal's words, when that hand cannot take it. Returns "" when chosen.
export function setBeltHand(player, index, hand) {
  const belt = beltOf(player);
  const e = belt && Number.isInteger(index) && index >= 0 && index < belt.length ? belt[index] : null;
  if (!e || !getItem(e.id).hands) return "Nothing there to hold.";
  if (hand !== "main" && hand !== "off") return "No such hand.";
  const no = handProblem(e, hand);
  if (no) return no;
  const list = Array.isArray(player.beltHands) ? player.beltHands.slice() : [];
  while (list.length < belt.length) list.push(null);
  list[index] = { id: e.id, hand };
  player.beltHands = list;
  return "";
}

// Belt key n (docs/11; #285): a held item in slot n goes to the hand chosen for the slot (beltHand), swapping out what that hand holds;
// "wronghand" when that hand cannot take it, "nohands" for a thing no hand holds (the tinderbox: carried, used from there). An empty
// slot takes what the main hand holds, else the off hand's, as before; "toolong" for a thing too long for the belt (the halberd).
export function beltKey(player, index) {
  const belt = beltOf(player);
  if (!belt || index >= belt.length) return "nobelt";
  const e = belt[index];
  if (e) {
    const def = getItem(e.id);
    if (!def.hands) return "nohands";
    const hand = beltHand(player, index);
    if (handProblem(e, hand)) return "wronghand";
    belt[index] = null;
    if (equip(player, e, def.hands === "either" ? hand : null)) return "drawn";
    belt[index] = e;
    return "handsfull";
  }
  // An empty slot takes what the main hand holds, else the off-hand.
  for (const s of ["main", "off"]) {
    const held = player.hands[s];
    if (held && handFor(held.id)) {
      if (offBelt(held)) return "toolong";
      release(player.hands, held);
      belt[index] = held;
      if (handFor(held.id) === "both") restoreOffHand(player);
      return "stowed";
    }
  }
  return "nothing";
}

// The entry with this uid wherever the player carries it: the hands, the belt, the bag (the verbs' reach: a stack in an open chest is
// not carried).
export function carriedEntry(player, uid) {
  if (uid == null) return null;
  for (const slot of ["main", "off"]) {
    const e = player.hands && player.hands[slot];
    if (e && e.uid === uid) return e;
  }
  for (const e of beltOf(player) || []) if (e && e.uid === uid) return e;
  const bag = bagOf(player);
  return (bag && bag.items.find((e) => e.uid === uid)) || null;
}

// The flame the player has, or null (#156; Michael, 2026-10-17: a fire is lit with a tinderbox or a lit torch): the entry named by
// `uid` if it is one, else a tinderbox carried, else a lit torch in a hand or on the belt. The light verb (burn.js) and a fire's own
// menu (interact.js) both ask this, so they cannot drift apart.
export function flameOf(player, uid) {
  if (uid != null) {
    const e = carriedEntry(player, uid);
    return e && (e.id === "tinderbox" || (e.id === "torch" && e.lit)) ? e : null;
  }
  const box = findItem(player, "tinderbox");
  if (box) return box.entry;
  for (const slot of ["main", "off"]) {
    const e = player.hands && player.hands[slot];
    if (e && e.id === "torch" && e.lit) return e;
  }
  return (beltOf(player) || []).find((e) => e && e.id === "torch" && e.lit) || null;
}

export const NO_FLAME = "You need a tinderbox or a lit torch to light it.";
