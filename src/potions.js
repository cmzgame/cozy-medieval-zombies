// Potions, drunk (docs/47 section 4, #481): a healing potion gives `potions.heal` health at once, a stamina potion fills the bar and makes it
// come back `potions.staminaMult` times as fast for `potions.staminaSeconds` (a buff on the player, `player.buffs.stamina = { left }`, shown in
// the debuff row in gold, src/debuffs.js), a mana potion gives `potions.mana` mana (the bar of #480, `player.mana` up to `player.maxMana`,
// src/mana.js). After any potion the next takes effect only `potions.between` seconds of the sim clock later, per
// player (`player.potionAt`, the sim time of the last), refused with "You can't drink another potion yet." A poison is never drunk: its key in
// any belt slot says so (inventory.beltAction) and it has no Drink; it goes on a blade or arrows by Use (src/poison.js), its vial back the same
// way as a drink's (`spendVial`).
//
// The empty vial goes back where the potion was when that place is free (the last of a stack leaves its belt slot, its hand, or its bag
// cell), else into the bag, else at the feet with "Your bag is full: the vial is at your feet." The ways in are food's (docs/39 section 5.6):
// a belt slot's key (interact.beltPress, every slot's key until step 4 makes a potion holdable), a double-click in the bag
// (ui/inventory-actions.js `use`), and the menu's Drink in the bag and on the belt (interact.itemMenu, slotMenu); a guest's reach here as the
// host's own do (the key event in its snapshot, its item commands by uid). Headless and on the authority: the step runs the buffs down
// (`update`, game.js beside sick's), and `player.potionAt` and `player.buffs` are on the player, so the save, the player's record, and the
// sync check's player text carry them.

import * as grid from "./grid.js";
import * as map from "./map.js";
import * as loop from "./loop.js";
import * as floaters from "./floaters.js"; // the green number of a heal (#294)
import { getItem, makeEntry, hold, release } from "./items.js";
import { bagOf, beltOf, detach, POISON_WORD } from "./inventory.js";
import { potions as P, player as TP } from "./tuning.js";
import { showMessage } from "./ui/prompt.js";

export { POISON_WORD };
export const TOO_SOON = "You can't drink another potion yet.";
export const BAG_FULL = "Your bag is full: the vial is at your feet.";
export const VIAL = "clay_vial"; // what a potion leaves when it is drunk

// What a potion does, by its item's `potion` ("heal", "stamina", "mana"), or null; a poison's `poison` block (never drunk).
export const potionOf = (def) => (def && typeof def.potion === "string" ? def.potion : null);
export const isPoison = (def) => !!(def && def.poison);

// Seconds until this player may drink another potion: 0 when they may. A stamp from the future (a world put back to an earlier clock) waits on nothing.
export function waitLeft(player) {
  const at = player && player.potionAt;
  if (at == null || !Number.isFinite(at)) return 0;
  const since = loop.simTime() - at;
  return since >= 0 && since < P.between ? P.between - since : 0;
}

// Why this player cannot drink this entry now, or "".
export function drinkProblem(player, entry) {
  if (!player || player.dead || !(player.hp > 0)) return "The dead drink nothing.";
  const def = entry && getItem(entry.id);
  if (isPoison(def)) return POISON_WORD;
  const kind = potionOf(def);
  if (!kind) return "That is not for drinking.";
  if (waitLeft(player) > 0) return TOO_SOON;
  return "";
}

function apply(player, kind) {
  if (kind === "heal") {
    const hp0 = player.hp;
    player.hp = Math.min(player.maxHp, player.hp + P.heal);
    floaters.heal(player, player.hp - hp0); // the green number, what was gained
  } else if (kind === "stamina") {
    player.stamina = player.maxStamina;
    player.winded = false;
    player.buffs = { ...(player.buffs || {}), stamina: { left: P.staminaSeconds } }; // a second potion later starts the time again, it does not add
  } else if (kind === "mana") {
    player.mana = Math.min(player.maxMana, player.mana + P.mana); // the bar of #480 (src/mana.js), up to the player's own most
  }
}

// Whether the stamina buff is on this player now (player.staminaRegenMult reads it; the debuff row shows it).
export const staminaBuffed = (player) => !!(player && player.buffs && player.buffs.stamina && player.buffs.stamina.left > 0);

// Whether the potion is where `place` says, on this player: a belt slot, a hand, or the player's own bag (never an open container's grid).
function heldAt(player, entry, place) {
  if (!player || !entry || !place) return false;
  if (place.kind === "belt") { const belt = beltOf(player); return !!belt && belt[place.index] === entry; }
  if (place.kind === "hand") return !!player.hands && player.hands[place.slot] === entry;
  if (place.kind === "bag") { const bag = bagOf(player); return !!bag && place.bag === bag && bag.items.includes(entry); }
  return false;
}

// Takes the potion out of its place when it was the last of its stack, and gives back a function that puts the vial there, or null when the
// place cannot take it. `place` is { kind: "bag", bag } | { kind: "belt", index } | { kind: "hand", slot }. Exported for hives.js: a jar
// fills exactly as a vial empties (docs/02, 2026-10-26, Honey goes into a clay jar).
export function vacate(player, entry, place) {
  if (place.kind === "belt") {
    const belt = beltOf(player);
    if (!belt || belt[place.index] !== entry) return null;
    belt[place.index] = null;
    return (vial) => { if (belt[place.index]) return false; belt[place.index] = vial; return true; };
  }
  if (place.kind === "hand") {
    if (player.hands[place.slot] !== entry) return null;
    release(player.hands, entry);
    return (vial) => (!player.hands[place.slot] && hold(player.hands, vial, place.slot)) || false;
  }
  const bag = place.bag;
  if (!bag || !grid.remove(bag, entry)) return null;
  const [x, y] = [entry.x, entry.y];
  return (vial) => {
    if (!grid.fits(bag, vial.id, x, y, false)) return false;
    Object.assign(vial, { x, y, rot: false });
    bag.items.push(vial);
    return true;
  };
}

// Drink one of the potion `entry` from `place`. Says why not and returns false; otherwise the potion works, its stamp is set, and the
// empty vial goes back. True when one was drunk.
export function drinkFrom(player, entry, place) {
  if (!heldAt(player, entry, place)) return false; // a stale or a stranger's place (a guest's command, a chest's grid): nothing is drunk
  const why = drinkProblem(player, entry);
  if (why) {
    showMessage(why);
    return false;
  }
  const def = getItem(entry.id);
  apply(player, potionOf(def));
  player.potionAt = loop.simTime();
  player.presentFor = TP.presentTime; // the held-out pose while it goes down (docs/32, item 1)
  showMessage(`You drink the ${def.name.toLowerCase()}.`);
  return spendVial(player, entry, place);
}

// Where an entry is on this player, as a drink's or a coat's `place`: { kind: "hand", slot } | { kind: "belt", index } | { kind: "bag", bag },
// or null when it is not carried (an open chest's grid).
export function placeOf(player, entry) {
  if (!player || !entry) return null;
  for (const slot of ["main", "off"]) if (player.hands && player.hands[slot] === entry) return { kind: "hand", slot };
  const belt = beltOf(player);
  if (belt && belt.includes(entry)) return { kind: "belt", index: belt.indexOf(entry) };
  const bag = bagOf(player);
  if (bag && bag.items.includes(entry)) return { kind: "bag", bag };
  return null;
}

// One vial of `entry` used up at `place` (a potion drunk, a poison on a blade or arrows, docs/47 section 6): one from the stack, and the
// empty clay vial back where it was when the last of the stack left that place, else into the bag, else at the feet with its line. True.
export function spendVial(player, entry, place) {
  let put = null;
  if ((entry.count || 1) > 1) entry.count -= 1;
  else if (place) put = vacate(player, entry, place);
  else detach(player, entry); // no place named: taken from wherever it is, the vial to the bag
  const vial = makeEntry(VIAL, 1);
  if (put && put(vial)) return true;
  const bag = bagOf(player);
  if (bag && grid.add(bag, VIAL, 1) === 1) return true;
  map.dropItem(Math.round(player.gx), Math.round(player.gy), vial, player.layer || 0);
  showMessage(BAG_FULL);
  return true;
}

// Every step on the authority: a buff's time runs down and it ends.
export function update(player, dt) {
  const b = player && player.buffs;
  if (!b || player.dead) return;
  for (const id of Object.keys(b)) {
    if (!b[id] || !(b[id].left > 0)) { delete b[id]; continue; }
    b[id].left -= dt;
    if (b[id].left <= 0) delete b[id];
  }
  if (!Object.keys(b).length) player.buffs = null;
}
