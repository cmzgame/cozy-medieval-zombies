// Bags and the places an item can be (docs/11). Copied from cozy-zombie-game
// src/inventory.js on 2026-10-10 and reworked: the player's grid is the bag
// worn on the back, the hotbar is the belt worn at the waist, and an entry is
// in exactly one place. Placement rules live in grid.js.

import { getItem, allItems, toolFor, aName, release, canHold, hold, handFor, dualWord } from "./items.js";
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
  while (entry.slots.length < def.beltSlots) entry.slots.push(null); // an old world's rope belt of two grows to three (2026-10-25, the belt's roles)
  return entry.slots;
}

// ---- a container item opened where it lies (Michael, 2026-10-26, The playtest's rulings: "any item that holds things ... has Open on the
// ground and in a chest, with Take All, as a body has") ----
// A bag's grid is its own (`entry.bag`). A belt's slots are no grid, so they are opened as a view: a bag of one row whose items ARE the slots'
// entries, laid side by side by their size, that takes nothing in (`takeOnly`, grid.js) and whose items' removal clears the slot it came from
// (SlotItems.splice: every grid removal is a splice), so a Take, a drag out, Take All, and a guest's command by the view's address all empty the
// belt itself, nothing copied and nothing doubled. Kept per belt entry (a WeakMap, never saved or sent) while its slots hold what it shows.
class SlotItems extends Array {
  static get [Symbol.species]() { return Array; } // a filter or a map of it is a plain list
  splice(...args) {
    const out = super.splice(...args);
    for (const e of out) {
      const k = this.slots ? this.slots.indexOf(e) : -1;
      if (k >= 0) this.slots[k] = null;
    }
    return out;
  }
}
const slotViews = new WeakMap(); // belt entry -> its view
// A slot's column in the view: every slot as wide as the widest thing a belt slot can hold (a hand item, a food, a skin, a thing that rides the
// belt), so an entry's place is its slot index alone and a view laid out afresh (a guest's replica, from a chunk the host sent) puts every
// entry where the host's put it (the review of #508: packed by what was left, a partial take moved the rest on a replica and split the map).
function slotColumn() {
  let w = 1;
  for (const d of allItems()) if (d.hands || d.kind === "food" || d.capacity || d.belt === true) w = Math.max(w, (d.size || [1, 1])[0]);
  return w;
}
export function slotsView(entry) {
  const slots = ensureSlots(entry);
  if (!slots) return null;
  const live = slots.filter(Boolean);
  const had = slotViews.get(entry);
  if (had && had.items.length === live.length && live.every((e) => had.items.includes(e))) return had;
  const items = new SlotItems();
  Object.defineProperty(items, "slots", { value: slots, enumerable: false });
  const col = slotColumn();
  let rows = 1;
  slots.forEach((e, i) => {
    if (!e) return;
    e.x = i * col;
    e.y = 0;
    e.rot = false;
    rows = Math.max(rows, (getItem(e.id).size || [1, 1])[1]);
    items.push(e);
  });
  const view = { cols: slots.length * col, rows, items, container: getItem(entry.id).name.toLowerCase(), takeOnly: true };
  slotViews.set(entry, view);
  return view;
}

// A bag inside another container (a satchel in a chest, a rucksack on the floor, a body) opens take-only (Primary's reading on the review of
// #508, Michael's to overrule: "Open ... with Take All, as a body has"): a view sharing the bag's own list of items, so what is taken leaves the
// bag itself, and nothing goes in, so no full bag is ever carried inside a worn one. Kept per entry while its grid is the same object.
const bagViews = new WeakMap(); // bag entry -> { of: its grid, view }
export function takeOnlyView(entry) {
  const bag = ensureBag(entry);
  if (!bag) return null;
  const had = bagViews.get(entry);
  if (had && had.of === bag) return had.view;
  const view = { cols: bag.cols, rows: bag.rows, items: bag.items, container: bag.container, takeOnly: true };
  bagViews.set(entry, { of: bag, view });
  return view;
}

// The grid a container item opens as, wherever it lies: a bag's own (take-only when it lies in another container, `nested`), a belt's view of
// its slots; null for anything else.
export function containerBagOf(entry, nested = false) {
  const def = entry && getItem(entry.id);
  if (!def) return null;
  if (def.bag) return nested ? takeOnlyView(entry) : ensureBag(entry);
  if (def.beltSlots) return slotsView(entry);
  return null;
}

// The view or grid an entry already has, made by nothing (a hit test: which container is this bag?).
export function openedBagOf(entry) {
  if (!entry) return null;
  const v = bagViews.get(entry);
  return (v && v.of === entry.bag ? v.view : null) || entry.bag || slotViews.get(entry) || null;
}
// Whether a grid is this entry's, its own or a view of it.
export function isBagOf(entry, bag) {
  if (!entry || !bag) return false;
  const v = bagViews.get(entry);
  return bag === entry.bag || (!!v && v.view === bag) || slotViews.get(entry) === bag;
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

// Put an entry somewhere on the player: the bag if it fits, else a free belt slot if it is holdable and the slot's role takes it (a
// two-handed thing never an off-hand slot). A one-handed weapon tries the main-hand slots and then the utility slot, never an off-hand slot,
// so a swap with the bag full never sets up a dual wield the player did not choose (docs/21: dual wielding comes only from a weapon put in
// an off-hand slot); with none free it is the caller's to set down. Returns where it went, or null.
export function stow(player, entry) {
  const bag = bagOf(player);
  if (bag && canStoreIn(entry) && grid.insert(bag, entry)) return "bag";
  const belt = beltOf(player);
  if (belt && handFor(entry.id)) {
    const def = getItem(entry.id);
    const oneHanded = def.hands !== "both" && def.hands !== "off" && weaponish(def);
    const free = (k, role) => !belt[k] && beltRole(k) === role && roleTakes(role, entry);
    const i = oneHanded
      ? [...belt.keys()].filter((k) => free(k, "main")).concat([...belt.keys()].filter((k) => free(k, "utility")))[0] ?? -1
      : belt.findIndex((e, k) => !e && roleTakes(beltRole(k), entry));
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
  // Refused by the dual rule beside what stays in the other hand: before anything is moved (equipProblem says why).
  if (equipProblem(player, entry, prefer)) return false;
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

// Why equip would refuse this entry by the dual rule (the spear's, docs/21), in words, or null: the hands as they would be once what the
// entry's hand (or both) holds has gone, beside what stays. A refusal for room is equip's own false with no word here.
export function equipProblem(player, entry, prefer = null) {
  let which = handFor(entry.id);
  if (!which) return null;
  if (which === "either") which = prefer || (!player.hands.main ? "main" : !player.hands.off ? "off" : "main");
  const after = { main: player.hands.main, off: player.hands.off };
  for (const s of which === "both" ? ["main", "off"] : [which]) if (after[s]) release(after, after[s]);
  if (after.main === entry || after.off === entry) release(after, entry);
  return dualWord(after, entry.id);
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

// ---- The belt's roles (Michael, 2026-10-25, docs/02 "The belt's slots have roles") ----
// Every belt slot has a fixed role by its index: the rope belt's three are a main-hand slot, an off-hand slot, and the utility slot; the
// leather belt adds one more of each hand. The utility slot never expands. A hand slot's key draws what is there into its hand (both hands
// for a two-handed thing in a main-hand slot), else eats it, else does nothing and says why; the utility slot's key only eats. What the
// key does is read from the slot's role and the item alone: there is no choice kept on the player, and the host, the save, and the wire see
// the role, never the player's key order (a client setting, `beltPositions`).

export const BELT_ROLES = ["main", "off", "utility", "main", "off"]; // slot index -> its role; a belt has at most five
// The key event per slot index, the role carried in the player's snapshot (net.js KEY_EVENTS): the client turns the pressed number into it.
export const BELT_EVENTS = ["beltMain1", "beltOff1", "beltUtility", "beltMain2", "beltOff2"];
export const ROLE_WORD = { main: "main-hand slot", off: "off-hand slot", utility: "utility slot" };

export function beltRole(index) {
  return BELT_ROLES[index] || null;
}

// The order the number keys and the hotbar's places take (the setting "Belt slot order", a client's own; settings.js `beltOrder`): a list in
// screen order of { key, index }, `index` null for a place the worn belt does not have (drawn locked). "sequential" (the default): the slot
// indices in turn, so 1, 2, 3 are always main, off, utility and the leather belt appends 4 main, 5 off. "grouped": 1 main, 2 main, 3 off,
// 4 off, 5 utility, the rope belt's on 1, 3, and 5 with 2 and 4 locked.
export function beltPositions(order, count) {
  const have = (i) => (i < count ? i : null);
  if (order === "grouped") return [0, 3, 1, 4, 2].map((i, k) => ({ key: k + 1, index: have(i) }));
  return Array.from({ length: Math.min(count, BELT_ROLES.length) }, (_, i) => ({ key: i + 1, index: i }));
}

// The slot index number key `key` (1 to 5) means under that order, or null.
export function beltKeyIndex(order, count, key) {
  const p = beltPositions(order, count).find((q) => q.key === key);
  return p ? p.index : null;
}

// Whether a slot of `role` takes this entry at all (placement, stow): a two-handed thing goes in a main-hand slot or the utility slot, never an
// off-hand slot (Michael: "a two handed item will be refused in every offhand slot"). Any other belt thing goes anywhere: a wrong-hand thing
// rides a hand slot as storage, and any held thing takes one cell in the utility slot, whatever its bag shape.
export function roleTakes(role, entry) {
  if (!role) return false;
  const def = getItem(entry.id);
  return !(role === "off" && def && def.hands === "both");
}

// The words for a slot that refuses a thing a player could not guess (the slot check, a guest's slot command, a drag let go over it), or "".
export function roleRefusal(role, entry) {
  const def = getItem(entry.id);
  if (role === "off" && def && def.hands === "both") return `The ${def.name.toLowerCase()} needs both hands: it goes in a main-hand slot or the utility slot.`;
  return "";
}

// A weapon, for the utility slot's line (Michael's words: "You can't equip a weapon from the utility slot."): a blow, a bow, a throw, a shield,
// a staff. A light (the torch) and a tool with no blow are named instead.
function weaponish(def) {
  return !!((def.weapon && !def.fire) || def.bow || def.thrown || def.shield || def.staff);
}

// A poison's line, its key in any belt slot and a double-click alike (docs/47 section 6; src/potions.js re-exports it).
export const POISON_WORD = "Poison isn't for drinking. Use it on a blade or on arrows.";

// What slot `role`'s key does with this entry: { act: "draw", hand } ("main", "off", or "both"), { act: "eat" }, { act: "drink" } (a potion,
// docs/47), or { act: "none", word }, the line that says why. One answer for the key, the slot's menu, and the card (item-info.js), so they
// cannot drift apart.
export function beltAction(entry, role) {
  const def = getItem(entry.id);
  const n = def.name.toLowerCase();
  // A skin sips by itself from any slot, as from the bag; a tap never drinks (Michael: "I would not let you manually drink from a waterskin on tap").
  if (def.capacity) return { act: "none", word: `Your ${n} drinks by itself from your belt.` };
  // A potion is drunk by every slot's key until step 4 makes it holdable (docs/47 section 4, #481: src/potions.js); a poison never is.
  if (def.potion && !def.hands) return { act: "drink" };
  if (def.poison && !def.hands) return { act: "none", word: POISON_WORD };
  // From step 4 a potion or a poison is holdable (`hands: "either"`, docs/47 section 7), as any held thing's hand-slot key draws it (below);
  // the utility slot still drinks it, or says the poison's line, since it is spent, not equipped.
  if (role === "utility" && def.potion) return { act: "drink" };
  if (role === "utility" && def.poison) return { act: "none", word: POISON_WORD };
  if (role === "main" || role === "off") {
    const h = def.hands;
    if (h === "both") return role === "main" ? { act: "draw", hand: "both" } : { act: "none", word: roleRefusal(role, entry) }; // an off-hand slot never takes one; an old world's might hold one
    if (h === "either" || h === role) return { act: "draw", hand: role };
    if (def.kind === "food") return { act: "eat" };
    if (h) return { act: "none", word: `The ${n} can't be held in your ${role} hand.` };
    return { act: "none", word: `The ${n} is not held in a hand.` };
  }
  if (role === "utility") {
    if (def.kind === "food") return { act: "eat" };
    if (def.hands) return { act: "none", word: weaponish(def) ? "You can't equip a weapon from the utility slot." : `You can't equip the ${n} from the utility slot.` };
    return { act: "none", word: `The ${n} is not held in a hand.` };
  }
  return { act: "none", word: "No such slot." };
}

// Where a draw puts what it pushes out of a hand: a free slot of `role` that takes it, else the bag if it fits, else the empty utility slot
// (which takes any held thing in one cell), so a weapon never falls to the floor while the belt has room for it. True when it went in; false
// leaves it for the caller to set at the feet.
function beltOrBag(player, entry, role) {
  const belt = beltOf(player) || [];
  const i = belt.findIndex((e, k) => !e && beltRole(k) === role && roleTakes(role, entry));
  if (i >= 0) {
    belt[i] = entry;
    return true;
  }
  const bag = bagOf(player);
  if (bag && canStoreIn(entry) && grid.insert(bag, entry)) return true;
  const u = belt.findIndex((e, k) => !e && beltRole(k) === "utility");
  if (u >= 0) {
    belt[u] = entry;
    return true;
  }
  return false;
}

// A hand slot's draw (beltAction's "draw"), the key and the slot's Equip alike: the item into its hand, swapping what that hand held onto the
// slot (docs/02, 2026-10-25). What the hand held goes to the slot the drawn thing just left when that slot's key would draw it back (Michael's
// playtest, 2026-10-26: "now that main hand [slot] is open it prefers that"; a two-hander only to a main-hand slot), else to an empty slot of
// its own role, else the bag, else the empty utility slot, else the freed slot as storage, else the feet: so a shield drawn out by the slot
// menu's Equip into the other hand never lands on a main-hand slot while an off-hand slot is empty. A two-handed thing takes both
// hands: the main hand's goes to the slot, the off hand's to an empty off-hand slot, else the bag, else the empty utility slot, else the feet
// (and is remembered, so a one-handed draw later puts it back, docs/21). Whatever has nowhere to go is returned in `drop`, for the caller to
// set at the feet with its line (`dropWord`). `hand` names the hand when the player chose one (a drag onto a hand, the slot menu's Equip
// into a hand: Michael's playtest, 2026-10-26, "a general thing about swapping from belt"), else the slot's role decides (beltAction).
// `onto`: the hand's thing was dragged onto this very slot (a drag from a hand onto an occupied slot), so it goes there whatever its key does.
// Returns { ok, drop, word }: `word` the refusal when no hand could take it (the spear's dual rule), with everything put back as it was.
export function beltDraw(player, index, hand = null, onto = false) {
  const belt = beltOf(player);
  const e = belt && belt[index];
  const role = beltRole(index);
  const a = !e ? null : hand ? chosenDraw(e, hand) : beltAction(e, role);
  if (!a || a.act !== "draw") return { ok: false, drop: [], word: a ? a.word || "" : "" };
  const h = player.hands;
  const before = { main: h.main, off: h.off, slot: e, memory: player.offMemory };
  const drop = [];
  const undo = (word) => {
    for (const x of [before.main, before.off]) if (x) detach(player, x); // wherever this draw put them, they come back to the hands
    for (const x of drop) detach(player, x);
    h.main = before.main;
    h.off = before.off;
    belt[index] = before.slot;
    player.offMemory = before.memory;
    return { ok: false, drop: [], word };
  };
  belt[index] = null;
  const refusedWord = () => dualWord(h, e.id) || "Your hands are full."; // the spear's dual rule in its one wording (items.dualWord), the hand already released
  // What a hand held: the freed slot first when its key would draw it back (or it was dragged there), else a slot of `own` role, the bag,
  // the utility slot, the freed slot as storage, the feet.
  const free = (x) => !belt[index] && roleTakes(role, x);
  const put = (x, own) => {
    if (free(x) && (onto || beltAction(x, role).act === "draw")) belt[index] = x;
    else if (beltOrBag(player, x, own)) return;
    else if (free(x)) belt[index] = x;
    else drop.push(x);
  };
  if (a.hand === "both") {
    const oldMain = h.main;
    const oldOff = h.off && h.off !== h.main ? h.off : null;
    h.main = null;
    h.off = null;
    if (!hold(h, e)) return undo("Your hands are full.");
    if (oldMain) put(oldMain, "main");
    if (oldOff && !beltOrBag(player, oldOff, "off")) drop.push(oldOff);
    player.offMemory = oldOff || null;
    return { ok: true, drop, word: "" };
  }
  if (a.hand === "main") {
    const old = h.main;
    const wasBoth = !!old && old === h.off;
    if (old) release(h, old);
    if (!hold(h, e, "main")) return undo(refusedWord());
    if (old) put(old, "main");
    if (wasBoth || !h.off) restoreOffHand(player); // the shield a two-hander pushed out comes back (docs/21)
    else player.offMemory = null;
    return { ok: true, drop, word: "" };
  }
  // The off hand.
  const old = h.off;
  const wasBoth = !!old && old === h.main;
  if (old) release(h, old);
  if (!hold(h, e, "off")) return undo(refusedWord());
  if (old) put(old, wasBoth ? "main" : "off"); // a two-hander takes the freed slot only when it is a main-hand or the utility slot
  player.offMemory = null;
  return { ok: true, drop, word: "" };
}

// A draw into a hand the player chose (beltDraw's `hand`): both hands for a two-handed thing, else that hand when the thing fits it.
function chosenDraw(entry, hand) {
  const def = getItem(entry.id);
  if (!def.hands) return { act: "none", word: `The ${def.name.toLowerCase()} is not held in a hand.` };
  if (def.hands === "both") return { act: "draw", hand: "both" };
  if (def.hands === "either" || def.hands === hand) return { act: "draw", hand };
  return { act: "none", word: `The ${def.name.toLowerCase()} can't be held in your ${hand} hand.` };
}

// The line for a thing a swap had nowhere to put but the ground ("if no slot anywhere is available, an item you are owed goes to the
// ground", Michael's playtest, 2026-10-26): said by whoever sets it down.
export function dropWord(entry) {
  return `Nowhere to put the ${getItem(entry.id).name.toLowerCase()}: it is at your feet.`;
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
