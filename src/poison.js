// Poisons (docs/47 section 6, #482; Michael, 2026-10-25: "a perfect case for our 'use' system"). A poison is never drunk (potions.js); it
// goes on through Use, rows in data/interactions.json naming the `coat` verb here:
// - on a blade (an item tagged `blade`: the edged weapons, those whose `repair` block says `edged`), in a hand, on the belt, or in the bag,
//   it coats the weapon's entry, `poison: { tier, hits }`, `POISON.hits` landed hits. A swing that lands spends one however many bodies it
//   strikes and poisons every one (combat.js); a thrown spear's landing hit spends one (archery.js); a miss spends none. A new coat
//   replaces the old one. The card says "Poisoned: 7 hits left." ("Strongly poisoned" for the strong tier; item-info.js).
// - on plain arrows (the row's `args`: `from` the arrows, `to` what they become) it makes `POISON.arrows` poisoned arrows, fewer from a
//   smaller stack, the whole vial spent either way: `poison_arrow` and `strong_poison_arrow`, whose item says `poisoned: { tier }`. A bow
//   draws them after fire arrows and before plain ones (its `ammo` order), what one hits is poisoned, and it lands or lodges as a plain
//   arrow, as a fire arrow does. Fire and poison do not mix: no row takes a poison onto a fire arrow or a poisoned arrow to a fire, so
//   both are "Nothing interesting happens."
// Either way the vial comes back empty, as from a drink (potions.spendVial).
//
// The status on a body, the dead's or an animal's (never a player's, never a villager's): `poison: { tier, stacks, left, tick }` on its
// record. Each poisoned hit adds a stack, up to `max`, and puts `left` back to `duration` seconds; it runs out by itself. It drains
// `dpsByStacks[ordinary|strong][stacks - 1]` a second, ticked once a second (`tick`, the seconds to the next, which a fresh hit does not
// reset), each tick a floating number. A strong hit lifts it to strong; an ordinary hit on a strong one adds its stack and keeps it strong.
// It never spreads, lights nothing, and stands beside a burn (burn.js), each its own. An animal's also keeps `cls`, the class of the weapon
// whose hit poisoned it, which a carcass it makes keeps (`kills`, data/animals.json). The numbers are `poison` in data/combat.json.
//
// On the authority alone: the step drains it (`update`, game.js beside the burn); the save keeps the whole record; a guest's replica has
// its tier and stacks from the frame (net.js: the dead's record's `po`, an animal's), which is all its tint is drawn from (`tintOf`,
// render/entities.js), and the sync check's dead and animals parts compare them. The coat rides on the entry wherever it goes (the
// player's record, a chest's chunk, a body's grid, the save, `syncParts`' entry text). No DOM, no wall clock, no chance.

import * as verbs from "./verbs.js";
import * as grid from "./grid.js";
import * as map from "./map.js";
import * as floaters from "./floaters.js";
import { getItem, makeEntry, countName } from "./items.js";
import { bagOf, carriedEntry } from "./inventory.js";
import { burnZombie } from "./entities/zombie.js";
import { drainAnimal } from "./entities/animal.js";
import { placeOf, spendVial } from "./potions.js";
import { showMessage } from "./ui/prompt.js";

export const POISON = { dpsByStacks: { ordinary: [1, 2, 3], strong: [2, 4, 6] }, max: 3, duration: 10, hits: 10, arrows: 5 };
const NOTHING = "Nothing interesting happens.";
export const ARROWS_AT_FEET = "Your bag is full: the arrows are at your feet."; // the poisoned arrows a full bag could not take
const EPS = 1e-6; // a timer stepped down in sixtieths reaches its whole second within this

export function setPoisonData(data) {
  if (!data) return;
  for (const k of Object.keys(POISON)) if (data[k] !== undefined) POISON[k] = data[k];
}

// A vial's tier (its item's `poison`), an arrow's (its item's `poisoned`), and whether an item is a blade (the `blade` tag).
export const vialTier = (def) => (def && def.poison && def.poison.tier > 0 ? def.poison.tier : 0);
export const arrowTier = (def) => (def && def.poisoned && def.poisoned.tier > 0 ? def.poisoned.tier : 0);
export const isBlade = (def) => !!(def && def.tags && def.tags.includes("blade"));
const tierWord = (tier) => (tier > 1 ? "strong poison" : "poison");

// ---- the coat on a weapon's entry ----

export function coatOf(entry) {
  const c = entry && entry.poison;
  return c && c.hits > 0 && c.tier > 0 ? c : null;
}

// A landed hit spends one: the tier it poisons with, or 0 for an entry with no coat. The last hit takes the coat off.
export function spendCoat(entry) {
  const c = coatOf(entry);
  if (!c) return 0;
  c.hits -= 1;
  if (c.hits <= 0) delete entry.poison;
  return c.tier;
}

// The card's line for a coated entry ("Poisoned: 7 hits left."), or "".
export function coatWords(entry) {
  const c = coatOf(entry);
  return c ? `${c.tier > 1 ? "Strongly poisoned" : "Poisoned"}: ${c.hits} hit${c.hits === 1 ? "" : "s"} left.` : "";
}

// What a poison of `tier` does to what it hits, in words for the cards, read from the numbers.
export function effectWords(tier) {
  const d = tier > 1 ? POISON.dpsByStacks.strong : POISON.dpsByStacks.ordinary;
  const list = d.length > 1 ? `${d.slice(0, -1).join(", ")}, or ${d[d.length - 1]}` : `${d[0]}`;
  return `${tier > 1 ? "Strongly poisons" : "Poisons"} the dead and game it hits: a stack a hit, up to ${POISON.max}, draining ${list} a second for ${POISON.duration} seconds after the last.`;
}

// ---- the status on a body ----

// The health a second a status drains now.
export function dpsOf(status) {
  if (!status || !(status.stacks > 0)) return 0;
  const t = status.tier > 1 ? POISON.dpsByStacks.strong : POISON.dpsByStacks.ordinary;
  return t[Math.min(t.length, status.stacks) - 1] || 0;
}

// One poisoned hit on a body: the dead and animals, never a player or a villager, never a body already dead. `cls` is the class of the
// weapon (an animal's carcass keeps it). Returns whether it is poisoned now.
export function apply(body, tier, cls = "melee") {
  if (!body || body.dead || !(tier > 0) || (body.kind !== "zombie" && body.kind !== "animal")) return false;
  const p = body.poison;
  if (!p) body.poison = { tier, stacks: 1, left: POISON.duration, tick: 1 };
  else {
    p.tier = Math.max(p.tier || 1, tier); // a strong hit lifts it; an ordinary one keeps a strong one strong
    p.stacks = Math.min(POISON.max, (p.stacks || 0) + 1);
    p.left = POISON.duration;
    if (!(p.tick > 0)) p.tick = 1;
  }
  if (body.kind === "animal") body.poison.cls = cls;
  return true;
}

function drain(body, amount) {
  if (!(amount > 0)) return;
  floaters.damage(body, amount); // the tick shows as the number a hit shows (docs/39 section 12)
  if (body.kind === "animal") drainAnimal(body, amount, body.poison.cls || "melee");
  else burnZombie(body, amount); // health and nothing else, as a burn's share: no push, no stagger, the path kept
}

// Every step on the authority, over the dead and the animals: the timer runs down, a tick a second drains, and it ends at its time or with the body.
export function update(bodies, dt) {
  for (const b of bodies) {
    const p = b.poison;
    if (!p) continue;
    if (b.dead) { delete b.poison; continue; }
    p.left -= dt;
    p.tick = (p.tick ?? 1) - dt;
    if (p.tick <= EPS) {
      p.tick += 1;
      drain(b, dpsOf(p));
      if (b.dead) { delete b.poison; continue; }
    }
    if (p.left <= EPS) delete b.poison;
  }
}

// The green a poisoned body is drawn with (a colour multiplied in, [r, g, b, a]), pulsing deeper and quicker with its stacks, darker for the
// strong tier; null when it is not poisoned. Pure: `t` is the drawing's own seconds. Drawn by every client from the record's tier and stacks.
export function tintOf(status, t) {
  if (!status || !(status.stacks > 0)) return null;
  const s = Math.min(POISON.max, status.stacks);
  const strong = status.tier > 1;
  const depth = (strong ? 0.32 : 0.22) + 0.1 * (s - 1);
  const pulse = 0.55 + 0.45 * (Math.sin(t * (2 + 1.5 * s)) * 0.5 + 0.5);
  const k = depth * pulse;
  const c = (v) => Math.max(0, Math.min(1, v));
  return [c(1 - k * 1.1), c(1 - k * (strong ? 0.35 : 0.1)), c(1 - k * 1.2), 1];
}

// ---- the Use rows: a poison on a blade, on arrows ----

verbs.define("coat", {
  validate(world, player, target, args = {}) {
    const vial = carriedEntry(player, target.entry);
    if (!vial) return "Take the poison out first."; // used from an open chest or a body: only a poison you carry
    if (!vialTier(getItem(vial.id))) return NOTHING;
    const on = carriedEntry(player, target.onEntry);
    if (args.to) {
      if (!on) return "Take the arrows out first.";
      if (on.id !== (args.from || "arrow") || !getItem(args.to)) return NOTHING;
    } else {
      if (!on) return target.onEntry != null ? "Take the blade out first." : NOTHING;
      if (!isBlade(getItem(on.id))) return NOTHING;
    }
    if (on === vial) return NOTHING;
    return true;
  },
  perform(world, player, target, args = {}) {
    const vial = carriedEntry(player, target.entry);
    const on = carriedEntry(player, target.onEntry);
    const tier = vialTier(getItem(vial.id));
    let message;
    if (args.to) {
      // Arrows: up to `arrows` of the stack, in place when the stack is that small, else the new ones to the bag and the rest at the feet.
      const n = Math.min(POISON.arrows, on.count || 1);
      if ((on.count || 1) <= n) on.id = args.to;
      else {
        on.count -= n;
        const bag = bagOf(player);
        const put = bag ? grid.add(bag, args.to, n) : 0;
        if (put < n) {
          map.dropItem(Math.round(player.gx), Math.round(player.gy), makeEntry(args.to, n - put));
          showMessage(ARROWS_AT_FEET); // as the vial's line says it (potions.BAG_FULL)
        }
      }
      message = `You coat ${countName(args.from || "arrow", n)} with ${tierWord(tier)}.`;
    } else {
      on.poison = { tier, hits: POISON.hits }; // a new coat replaces the old one
      message = `You coat the ${getItem(on.id).name.toLowerCase()} with ${tierWord(tier)}.`;
    }
    spendVial(player, vial, placeOf(player, vial)); // the empty vial back, as from a drink
    return { ok: true, message };
  },
});
