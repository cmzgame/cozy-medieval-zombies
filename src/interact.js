// Interaction with the world: doors and windows. Zomboid's scheme, which
// Michael remembered right and we checked (2026-10-09): tap E to open or close,
// hold E to climb through an open window. Doors only open and close.

import * as input from "./input.js";
import { openingsNear, touch } from "./map.js";
import { startClimb } from "./entities/player.js";

export const REACH = 1.15; // tiles from the player to the opening's midpoint
export const HOLD_TIME = 0.35; // seconds of E that count as a hold

let eHeld = 0;
let eConsumed = false;

export function nearestOpening(player) {
  return openingsNear(player.gx, player.gy, REACH)[0] || null;
}

function isOpen(o) {
  return o.wall.kind === "door" ? o.wall.open : o.wall.shutter === "open";
}

function toggle(o) {
  if (o.wall.kind === "door") o.wall.open = !o.wall.open;
  else o.wall.shutter = o.wall.shutter === "open" ? "closed" : "open";
  touch();
}

// What the prompt should say, and where, or null.
export function promptFor(player) {
  if (player.climb) return null;
  const o = nearestOpening(player);
  if (!o) return null;
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
  const o = nearestOpening(player);
  if (input.isDown("KeyE")) {
    eHeld += dt;
    if (!eConsumed && eHeld >= HOLD_TIME) {
      eConsumed = true;
      if (o && o.wall.kind === "window" && isOpen(o)) startClimb(player, o);
    }
  } else {
    // A tap: released before the hold time, and nothing consumed the press.
    if (eHeld > 0 && !eConsumed && o) toggle(o);
    eHeld = 0;
    eConsumed = false;
  }
}
