// Placement (docs/13-placement.md): one mode for putting things in the world.
// A ghost follows the cursor, R turns it, it is green where it may go and red
// where it may not, and a left click puts it there. This step is prop mode:
// the mode a player is in whenever they carry furniture. Building walls,
// doors, and windows joins it in the next step.
//
// This module reads the world (map, iso, input) and writes only the carried
// prop and, on confirm, the map. It does not import interact.js (interact
// imports it), so the put-down rule lives here and interact re-exports it.

import * as iso from "./iso.js";
import * as input from "./input.js";
import * as map from "./map.js";
import { showMessage } from "./ui/prompt.js";

export const PLACE_REACH = 1.6; // tiles from the player to the anchor tile

// kind is null, "prop", or later "build". ghost is what the renderer draws.
export const state = { active: false, kind: null, prop: null, ghost: null };

// Whether the carried prop could stand with its anchor at (tx, ty): every
// footprint tile clear, walkable, not under the player, and no wall running
// between two tiles of the same prop (a bed does not straddle a wall).
export function canPutDown(player, tx, ty) {
  const prop = player.carrying;
  if (!prop) return false;
  const [w, h] = prop.footprint;
  for (let dy = 0; dy < h; dy++) {
    for (let dx = 0; dx < w; dx++) {
      const x = tx + dx;
      const y = ty + dy;
      const t = map.tileAt(x, y);
      if (t.prop || !map.isWalkableTile(x, y)) return false;
      if (Math.hypot(player.gx - x, player.gy - y) < 0.7) return false;
      if (dx > 0 && map.wallBetween(x - 1, y, x, y)) return false;
      if (dy > 0 && map.wallBetween(x, y - 1, x, y)) return false;
    }
  }
  return true;
}

// The tile in front of the player, for E.
export function putDownTarget(player) {
  const [dx, dy] = iso.DIRS[player.facing] || [0, 1];
  return [Math.round(player.gx + dx), Math.round(player.gy + dy)];
}

export function beginProp(prop) {
  state.kind = "prop";
  state.prop = prop;
  state.active = true;
}

// Escape. Returns true if a mode was open and is now closed. Carrying cannot
// be cancelled: the prop stays in the hands, so prop mode answers false.
export function cancel() {
  if (state.kind === "prop" || state.kind === null) return false;
  end();
  return true;
}

function end() {
  state.kind = null;
  state.prop = null;
  state.active = false;
  state.ghost = null;
}

export function ghost() {
  return state.ghost;
}

// R turns the carried prop's footprint: [w, h] becomes [h, w]. The slices keep
// their frames (the dev art is boxes); canPutDown and placeProp read the
// prop's footprint, so E in front uses the turned shape too.
function turn(prop) {
  const [w, h] = prop.footprint;
  prop.footprint = [h, w];
}

// Each logic step: follow the carried prop, read R, and put the ghost where
// the cursor is.
export function update(player) {
  if (player.carrying) {
    if (state.kind !== "prop" || state.prop !== player.carrying) beginProp(player.carrying);
    if (input.wasPressed("KeyR")) turn(player.carrying);
  } else if (state.kind === "prop") {
    end();
  }
  if (state.kind === "prop") state.ghost = propGhost(player);
  else if (state.kind === null) state.ghost = null;
}

function propGhost(player) {
  const prop = state.prop;
  const m = input.getMouse();
  if (!m.inside) return null;
  const g = iso.toGrid(m.x, m.y);
  const [w, h] = prop.footprint;
  // The footprint is centred on the cursor: its centre is the anchor plus half its extent.
  const tx = Math.round(g.gx - (w - 1) / 2);
  const ty = Math.round(g.gy - (h - 1) / 2);
  let reason = "";
  if (Math.hypot(player.gx - tx, player.gy - ty) > PLACE_REACH) reason = "Too far";
  else if (!canPutDown(player, tx, ty)) reason = "No room";
  return { kind: "prop", prop, tx, ty, footprint: [w, h], ok: reason === "", reason };
}

// The left click. Returns true if this mode took it. A red ghost takes the
// click too and says why, so a click meant for placing never swings or walks.
export function tryConfirm(player) {
  if (state.kind !== "prop") return false;
  const g = state.ghost;
  if (!g) return false;
  if (!g.ok) {
    showMessage(g.reason);
    return true;
  }
  map.placeProp(state.prop, g.tx, g.ty);
  player.carrying = null;
  end();
  return true;
}

// The prompt at the ghost, or null when there is none to show.
export function prompt() {
  const g = state.ghost;
  if (!g) return null;
  if (g.kind === "prop") {
    if (!g.ok) return { label: g.reason, mx: g.tx, my: g.ty, progress: null, enabled: false };
    return { label: "Click to place · R turn · E in front", mx: g.tx, my: g.ty, progress: null, enabled: true };
  }
  return null;
}
