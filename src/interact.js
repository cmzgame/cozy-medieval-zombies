// Interaction with the world: doors, windows, and fires. Zomboid's scheme,
// which Michael remembered right and we checked (2026-10-09): tap E to open or
// close, hold E to climb through an open window. Doors only open and close.
// Fires (docs/07): tap E to light a hearth or a campfire with a log, or to add
// one; logs are free until the inventory exists.

import * as input from "./input.js";
import { openingsNear, burnersNear, feedFire, touch } from "./map.js";
import { startClimb } from "./entities/player.js";

export const REACH = 1.15; // tiles from the player to the opening's midpoint
export const HOLD_TIME = 0.35; // seconds of E that count as a hold

let eHeld = 0;
let eConsumed = false;

export function nearestOpening(player) {
  return openingsNear(player.gx, player.gy, REACH)[0] || null;
}

// The nearest thing E acts on: an opening or a burner, whichever is closer.
export function nearestTarget(player) {
  const o = nearestOpening(player);
  const b = burnersNear(player.gx, player.gy)[0] || null;
  if (o && b) return o.d <= b.d ? { kind: "opening", o } : { kind: "fire", prop: b.prop };
  if (o) return { kind: "opening", o };
  if (b) return { kind: "fire", prop: b.prop };
  return null;
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
  if (input.isDown("KeyE")) {
    eHeld += dt;
    if (!eConsumed && eHeld >= HOLD_TIME) {
      eConsumed = true;
      if (t && t.kind === "opening" && t.o.wall.kind === "window" && isOpen(t.o)) startClimb(player, t.o);
    }
  } else {
    // A tap: released before the hold time, and nothing consumed the press.
    if (eHeld > 0 && !eConsumed && t) {
      if (t.kind === "opening") toggle(t.o);
      else feedFire(t.prop);
    }
    eHeld = 0;
    eConsumed = false;
  }
}
