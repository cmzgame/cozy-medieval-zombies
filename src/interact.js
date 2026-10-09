// Interaction with the world: doors, windows, fires, and torches. Zomboid's
// scheme, which Michael remembered right and we checked (2026-10-09): tap E to
// open or close, hold E to climb through an open window. Doors only open and
// close. Fires (docs/07): tap E to light a hearth or a campfire with a log, or
// to add one; logs are free until the inventory exists. Torches: tap E at a
// bracket or a post to take the torch into the off-hand or to mount the one
// you hold.

import * as input from "./input.js";
import { openingsNear, burnersNear, bracketsNear, holdersNear, feedFire, holderHas, setHolder, touch } from "./map.js";
import { startClimb } from "./entities/player.js";
import { hold, release, holding, canHold } from "./items.js";

export const REACH = 1.15; // tiles from the player to the opening's midpoint
export const HOLD_TIME = 0.35; // seconds of E that count as a hold

let eHeld = 0;
let eConsumed = false;

export function nearestOpening(player) {
  return openingsNear(player.gx, player.gy, REACH)[0] || null;
}

// The nearest thing E acts on: an opening, a burner, a bracket, or a post.
export function nearestTarget(player) {
  const c = [];
  const o = nearestOpening(player);
  if (o) c.push({ kind: "opening", o, d: o.d });
  const b = burnersNear(player.gx, player.gy)[0];
  if (b) c.push({ kind: "fire", prop: b.prop, d: b.d });
  const br = bracketsNear(player.gx, player.gy, REACH)[0];
  if (br) c.push({ kind: "bracket", bracket: br.bracket, d: br.d, mx: br.mx, my: br.my });
  const h = holdersNear(player.gx, player.gy)[0];
  if (h) c.push({ kind: "post", prop: h.prop, d: h.d });
  if (!c.length) return null;
  c.sort((a, b) => a.d - b.d);
  return c[0];
}

function isOpen(o) {
  return o.wall.kind === "door" ? o.wall.open : o.wall.shutter === "open";
}

function toggle(o) {
  if (o.wall.kind === "door") o.wall.open = !o.wall.open;
  else o.wall.shutter = o.wall.shutter === "open" ? "closed" : "open";
  touch();
}

function fireName(prop) {
  return prop.sprite.replace(/_/g, " ");
}

// Take a torch from a holder into the off-hand, or mount the held one.
function useHolder(player, t) {
  if (holderHas(t)) {
    if (!canHold(player.hands, "torch")) return false;
    hold(player.hands, "torch");
    setHolder(t, false);
    return true;
  }
  if (!holding(player.hands, "torch")) return false;
  release(player.hands, "torch");
  setHolder(t, true);
  return true;
}

function holderLabel(player, t) {
  const what = t.kind === "bracket" ? "bracket" : "post";
  if (holderHas(t)) return canHold(player.hands, "torch") ? "E: take the torch" : `a torch (your off-hand is full)`;
  if (holding(player.hands, "torch")) return "E: mount the torch";
  return `an empty ${what}`;
}

// What the prompt should say, and where, or null.
export function promptFor(player) {
  if (player.climb) return null;
  const t = nearestTarget(player);
  if (!t) return null;
  if (t.kind === "fire") {
    const f = t.prop.fire;
    const name = fireName(t.prop);
    let label;
    if (!f.lit) label = `E: light the ${name}`;
    else if (f.fuel < f.maxFuel) label = `E: add a log (${Math.ceil(f.fuel)}/${f.maxFuel})`;
    else label = `${name}: full (${f.maxFuel}/${f.maxFuel})`;
    return { label, mx: t.prop.tile[0], my: t.prop.tile[1] - 0.6 };
  }
  if (t.kind === "bracket") return { label: holderLabel(player, t), mx: t.mx, my: t.my - 0.4 };
  if (t.kind === "post") return { label: holderLabel(player, t), mx: t.prop.tile[0], my: t.prop.tile[1] - 0.9 };
  const o = t.o;
  const open = isOpen(o);
  let label;
  if (o.wall.kind === "door") label = open ? "E: close door" : "E: open door";
  else label = open ? "E: close shutters   hold E: climb through" : "E: open shutters";
  return { label, mx: o.mx, my: o.my };
}

export function updateInteract(player, dt) {
  if (player.climb) {
    eHeld = 0;
    eConsumed = true; // the hold that started the climb is spent
    return;
  }
  const t = nearestTarget(player);
  // wasPressed catches a tap shorter than one step, which isDown would miss.
  if (input.isDown("KeyE") || input.wasPressed("KeyE")) {
    eHeld += dt;
    if (!eConsumed && eHeld >= HOLD_TIME) {
      eConsumed = true;
      if (t && t.kind === "opening" && t.o.wall.kind === "window" && isOpen(t.o)) startClimb(player, t.o);
    }
  } else {
    // A tap: released before the hold time, and nothing consumed the press.
    if (eHeld > 0 && !eConsumed && t) {
      if (t.kind === "opening") toggle(t.o);
      else if (t.kind === "fire") feedFire(t.prop);
      else useHolder(player, t);
    }
    eHeld = 0;
    eConsumed = false;
  }
}
