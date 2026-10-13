// The inventory panel's handlers: what a drag, a drop, and a double-click do
// to the player's slots, bag, and the floor (docs/10, docs/11). Moved out of
// main.js on 2026-10-12 (docs/23a, D1): the rules of where an entry may go and
// what gives way live here, the panel only draws and asks. `getPlayer` is a
// getter, so a second player could have handlers of their own.

import * as items from "../items.js";
import * as inventory from "../inventory.js";
import * as grid from "../grid.js";
import * as map from "../map.js";
import * as interact from "../interact.js";
import { showMessage } from "./prompt.js";

function slotGet(player, id) {
  const { kind, key, index } = inventory.parseSlot(id);
  if (kind === "worn") return player.worn[key];
  if (kind === "belt") return inventory.beltOf(player)?.[index] ?? null;
  if (kind === "hand") return player.hands[key];
  return null;
}

function slotSet(player, id, entry) {
  const { kind, key, index } = inventory.parseSlot(id);
  if (kind === "worn") player.worn[key] = entry;
  else if (kind === "belt") {
    const belt = inventory.beltOf(player);
    if (belt) belt[index] = entry;
  } else if (kind === "hand") {
    // Clearing a hand releases the entry (from both hands if it is two-handed);
    // filling one goes through equip in placeInSlot, so this only clears.
    if (entry) items.hold(player.hands, entry, key);
    else if (player.hands[key]) items.release(player.hands, player.hands[key]);
  }
}

// Take an entry out of where a drag started.
function detachFrom(player, entry, from) {
  if (from.kind === "bag") grid.remove(from.bag, entry);
  else if (slotGet(player, from.id) === entry) slotSet(player, from.id, null);
}

function restoreTo(player, entry, from) {
  if (from.kind === "bag") {
    if (!grid.insert(from.bag, entry)) map.dropItem(Math.round(player.gx), Math.round(player.gy), entry);
  } else slotSet(player, from.id, entry);
}

export function createInventoryActions(getPlayer) {
  return {
    changed() {},
    belt() {
      return inventory.beltOf(getPlayer());
    },
    isItemBag(bag) {
      return bag === inventory.bagOf(getPlayer());
    },
    canStore(entry) {
      return inventory.canStoreIn(entry);
    },
    canPlace(entry, slotId) {
      const player = getPlayer();
      const { kind, key, index } = inventory.parseSlot(slotId);
      const def = items.getItem(entry.id);
      if (kind === "worn") return def.wear === key;
      if (kind === "belt") {
        // Hand items, one at a time, or consumables as a stack.
        const belt = inventory.beltOf(player);
        if (!belt || index >= belt.length) return false;
        if (def.hands) return entry.count === 1;
        return def.kind === "food" || !!def.capacity;
      }
      // A hand takes what fits it; an occupant swaps out if it can be stowed.
      if (kind === "hand") return !!def.hands && entry.count === 1 && (def.hands === "both" || def.hands === "either" || def.hands === key);
      return false;
    },
    // Drop onto a worn or belt slot. An occupant goes to the bag or belt if
    // it can; an old bag on the back drops at your feet, since bags do not nest.
    placeInSlot(entry, from, slotId) {
      const player = getPlayer();
      const { kind, key } = inventory.parseSlot(slotId);
      const occupant = slotGet(player, slotId);
      if (occupant === entry) return;
      // One hand dragged onto the other swaps the two (Michael, 2026-10-12), instead of sending the
      // one in the way to the bag, when each is allowed in the other's hand.
      // (A drag's `from` is { kind: "slot", id }; the hand is the slot id's kind. Until 2026-10-13 this
      // asked for from.kind === "hand", which never held, so the occupant was always stowed: Michael.)
      const fromSlot = from.kind === "slot" ? inventory.parseSlot(from.id) : null;
      if (kind === "hand" && fromSlot && fromSlot.kind === "hand" && occupant) {
        const fromKey = fromSlot.key;
        const allowed = (e, k) => { const h = items.getItem(e.id).hands; return h === "either" || h === k; };
        if (fromKey !== key && allowed(entry, key) && allowed(occupant, fromKey)) {
          player.hands[fromKey] = occupant;
          player.hands[key] = entry;
          return;
        }
      }
      detachFrom(player, entry, from);
      if (kind === "hand") {
        // equip swaps whatever is in the way out to the bag or belt.
        if (!inventory.equip(player, entry, key)) {
          restoreTo(player, entry, from);
          showMessage("No room to swap.");
        }
        return;
      }
      // Dragging a bag off your back takes its grid away; the bag column may
      // have been the source, so it is detached already.
      if (occupant) {
        slotSet(player, slotId, null);
        if (kind === "worn" && key === "back") {
          slotSet(player, slotId, entry);
          map.dropItem(Math.round(player.gx), Math.round(player.gy), occupant);
          return;
        }
        if (!inventory.stow(player, occupant)) {
          slotSet(player, slotId, occupant);
          restoreTo(player, entry, from);
          showMessage("No room to swap.");
          return;
        }
      }
      slotSet(player, slotId, entry);
    },
    // Drop from a slot into a grid at a cell.
    placeInGrid(entry, from, bag, x, y, rot) {
      const player = getPlayer();
      if (!inventory.canStoreIn(entry)) return showMessage("Empty it first, or wear it.");
      detachFrom(player, entry, from);
      // Taking the bag off the back while dropping into its own grid cannot work.
      if (!bag.items && !bag.cols) return restoreTo(player, entry, from);
      if (!grid.fits(bag, entry.id, x, y, rot)) return restoreTo(player, entry, from);
      entry.x = x;
      entry.y = y;
      entry.rot = !!rot;
      bag.items.push(entry);
    },
    dropToFloor(entry, from) {
      const player = getPlayer();
      detachFrom(player, entry, from);
      map.dropItem(Math.round(player.gx), Math.round(player.gy), entry);
    },
    noRoom(intoBag) {
      showMessage(intoBag ? "No room in your bag." : "No room in there.");
    },
    itemMenu(entry, bag, otherBag) {
      return interact.itemMenu(getPlayer(), entry, bag, otherBag);
    },
    // Double-click in your bag: equip what can be held, wear what can be worn.
    use(entry, bag) {
      const def = items.getItem(entry.id);
      if (def.hands) return interact.equipFrom(getPlayer(), entry);
      if (def.wear) return interact.wearFrom(getPlayer(), entry, bag);
      return false;
    },
    // Double-click on a slot: its first menu entry (Equip, Unequip, Take off).
    useSlot(slotId) {
      const m = interact.slotMenu(getPlayer(), slotId);
      if (!m.length) return false;
      m[0].onSelect();
      return true;
    },
    slotMenu(slotId) {
      return interact.slotMenu(getPlayer(), slotId);
    },
  };
}
