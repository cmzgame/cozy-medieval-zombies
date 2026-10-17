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
import { bagOf, beltOf, findItem } from "./inventory.js";
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
    if (!e) return "Take the arrows out first."; // used from an open chest or a body: only arrows you carry are dipped
    if (e.id !== (args.from || "arrow")) return "You have no arrows.";
    return true;
  },
  perform(world, player, target, args) {
    const e = carried(player, target.entry);
    e.id = args.to || "fire_arrow";
    return { ok: true };
  },
});

// ---- the light verb: a flame used on what is made to be lit (data/interactions.json; #156, Michael, 2026-10-17) ----
// A tinderbox or a lit torch used on an unlit campfire (with fuel), a torch on a post, a torch in a bracket that is out, or an
// unlit torch you carry lights it. Never burns anything else. The target is an address: a prop (an id, or the prop on the host), a
// bracket `{ tx, ty, edge }`, or `onEntry`, an unlit torch's uid; the flame is `entry` (the uid of what was used), else whatever the
// player has (a tinderbox, a lit torch in a hand or on the belt: the right-click menu on a holder).

// The flame the player has, or null: the entry named by `uid` if it is a flame, else a tinderbox carried, else a lit torch in a hand
// or on the belt.
function flameOf(player, uid) {
  if (uid != null) {
    const e = carried(player, uid);
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

// What the target is, or why it cannot be lit: { reason } or { light(), at: [x, y] | null }.
function lightTarget(player, target, flame) {
  if (target.onEntry != null) {
    const e = carried(player, target.onEntry);
    const held = e && (player.hands.main === e || player.hands.off === e || (beltOf(player) || []).includes(e)); // a torch in the bag burns nothing and lights nothing: it is lit where it is used
    if (!e || e.id !== "torch" || !held) return { reason: "Only a torch in a hand or on the belt can be lit that way." };
    if (e === flame) return { reason: "That is the flame." };
    if (e.lit) return { reason: "It is already lit." };
    return { light: () => { e.lit = true; return true; }, at: null };
  }
  if (target.bracket) {
    const b = [...map.brackets()].find((q) => q.tx === target.bracket.tx && q.ty === target.bracket.ty && q.edge === target.bracket.edge);
    if (!b) return { reason: "There is nothing there to light." };
    const br = b.wall.bracket;
    if (br.lantern) return { reason: "A lantern is always lit." };
    if (!br.torch) return { reason: "There is no torch there." };
    if (br.lit !== false) return { reason: "It is already lit." };
    return { light: () => map.lightBracket(b), at: map.bracketPos(b) };
  }
  const prop = typeof target.prop === "string" ? map.propById(target.prop) : target.prop;
  const f = prop && prop.fire;
  if (!f) return { reason: "That cannot be lit." };
  if (f.burns) {
    if (f.lit) return { reason: "It is already burning." };
    if (!(f.fuel > 0)) return { reason: "It has nothing to burn." };
  } else if (f.holds) {
    if (!f.has) return { reason: "There is no torch there." };
    if (f.lit) return { reason: "It is already lit." };
  } else return { reason: "That cannot be lit." };
  return { light: () => map.lightProp(prop), at: prop.tile };
}

verbs.define("light", {
  validate(world, player, target) {
    const flame = flameOf(player, target.entry);
    if (!flame) return target.entry != null ? "That gives no flame (a tinderbox, or a lit torch)." : "You have no flame (a tinderbox, or a lit torch).";
    const t = lightTarget(player, target, flame);
    if (t.reason) return t.reason;
    if (t.at && Math.hypot(player.gx - t.at[0], player.gy - t.at[1]) > DIP_REACH) return "Too far away.";
    return true;
  },
  perform(world, player, target) {
    const flame = flameOf(player, target.entry);
    const t = lightTarget(player, target, flame);
    return { ok: !!t.light && t.light() };
  },
});
