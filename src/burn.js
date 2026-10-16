// Burning (#14; Michael, 2026-10-15): a status like bleeding, capped at one. A body is burning or it is not; a new
// source while it burns puts the timer back to full and never stacks. It is a cherry on top, never a way to win a
// fight: `dps` a second for `duration` seconds, and never more than `cap` health over one burn however often it is
// refreshed (Michael: never more than 10 against 100). Only the dead burn (and, when they come, animals; villagers
// once something can reach them): never a player, so nothing needs putting out, and never the land, a wall, a
// container, or a tree. A body that dies burning burns on as a corpse until its timer runs out (fire.js lays the
// flames down with it). The numbers are `burn` in data/combat.json; every source calls `ignite`: a torch's blow by
// its weapon's `ignite` chance (combat.js), the fireball and a fire arrow always (archery.js, their `ignite`).
//
// The state lives on the character (`burning`, `burnLeft`, `burnTaken`), so it is in the save and the welcome as
// every field is, and the frame's `burning` flag (net.js `slim`) is what a guest's replica draws from: the burn
// itself runs only in the world's step, on the host.

import * as verbs from "./verbs.js";
import * as map from "./map.js";
import { bagOf, beltOf } from "./inventory.js";
import { burnZombie } from "./entities/zombie.js";

export const BURN = { dps: 0.8, duration: 10, cap: 10 };

export function setBurnData(data) {
  if (data) Object.assign(BURN, data);
}

// Set a body alight, or put a burning one's timer back to full. Returns whether it is burning now.
export function ignite(c) {
  if (!c || c.kind !== "zombie" || c.dead) return false;
  if (!c.burning) c.burnTaken = 0; // a fresh burn: the cap counts from here
  c.burning = true;
  c.burnLeft = BURN.duration;
  return true;
}

// Every step, for everyone the world holds (the living and the fallen): a living body takes its share, up to the cap;
// a corpse only burns down. Out when the timer runs out.
export function update(characters, dt) {
  for (const c of characters) {
    if (!c.burning) continue;
    c.burnLeft = (c.burnLeft ?? 0) - dt;
    if (c.burnLeft <= 0) {
      c.burning = false;
      c.burnLeft = 0;
      continue;
    }
    if (c.dead || c.kind !== "zombie") continue;
    const share = Math.min(BURN.dps * dt, BURN.cap - (c.burnTaken || 0));
    if (share <= 0) continue;
    c.burnTaken = (c.burnTaken || 0) + share;
    burnZombie(c, share);
  }
}

// ---- fire arrows: arrows used on a lit fire (data/interactions.json, the `dip` verb) ----

// The entry with this uid wherever the player carries it: the hands, the belt, the bag.
function carried(player, uid) {
  if (uid == null) return null;
  for (const slot of ["main", "off"]) {
    const e = player.hands && player.hands[slot];
    if (e && e.uid === uid) return e;
  }
  for (const e of beltOf(player) || []) if (e && e.uid === uid) return e;
  const bag = bagOf(player);
  return (bag && bag.items.find((e) => e.uid === uid)) || null;
}

function nearest(player, tiles) {
  let best = Infinity;
  for (const [tx, ty] of tiles) best = Math.min(best, Math.hypot(player.gx - tx, player.gy - ty));
  return best;
}

const DIP_REACH = 2.6; // tiles, the click's reach (interact.CLICK_REACH)

// The whole stack at once, in its place (Michael's default): a fire arrow is an arrow's size and stack, so it stays
// where the arrows were. A target is the prop itself (a Use on the host) or its id (a script). Only arrows you carry
// are dipped (the hands, the belt, the bag): a stack in an open chest is taken out first (the review of #62).
verbs.define("dip", {
  validate(world, player, target, args) {
    const prop = typeof target.prop === "string" ? map.propById(target.prop) : target.prop;
    if (!prop || !prop.fire || !prop.fire.burns) return "That is not a fire.";
    if (!prop.fire.lit) return "The fire is out.";
    if (nearest(player, prop.tiles || [prop.tile]) > DIP_REACH) return "Too far from the fire.";
    const e = carried(player, target.entry);
    if (!e || e.id !== (args.from || "arrow")) return "You have no arrows.";
    return true;
  },
  perform(world, player, target, args) {
    const e = carried(player, target.entry);
    e.id = args.to || "fire_arrow";
    return { ok: true };
  },
});
