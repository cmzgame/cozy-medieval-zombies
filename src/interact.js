// Interaction with the world. For now: windows. Zomboid's scheme, which Michael
// remembered right and we checked (2026-10-09): tap E to open or close the
// shutters, hold E to climb through once they are open.

import * as input from "./input.js";
import { windowsNear, touch } from "./map.js";
import { startClimb } from "./entities/player.js";

export const REACH = 1.15; // tiles from the player to the window's midpoint
export const HOLD_TIME = 0.35; // seconds of E that count as a hold

let eHeld = 0;
let eConsumed = false;

export function nearestWindow(player) {
  return windowsNear(player.gx, player.gy, REACH)[0] || null;
}

// What the prompt should say, and where, or null.
export function promptFor(player) {
  if (player.climb) return null;
  const w = nearestWindow(player);
  if (!w) return null;
  const open = w.wall.shutter === "open";
  return { label: open ? "E: close shutters   hold E: climb through" : "E: open shutters", mx: w.mx, my: w.my };
}

export function updateInteract(player, dt) {
  if (player.climb) {
    eHeld = 0;
    eConsumed = true; // the hold that started the climb is spent
    return;
  }
  const w = nearestWindow(player);
  if (input.isDown("KeyE")) {
    eHeld += dt;
    if (!eConsumed && eHeld >= HOLD_TIME) {
      eConsumed = true;
      if (w && w.wall.shutter === "open") startClimb(player, w);
    }
  } else {
    // A tap: released before the hold time, and nothing consumed the press.
    if (eHeld > 0 && !eConsumed && w) {
      w.wall.shutter = w.wall.shutter === "open" ? "closed" : "open";
      touch();
    }
    eHeld = 0;
    eConsumed = false;
  }
}
