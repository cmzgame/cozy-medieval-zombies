// Interaction with the world: doors, windows, fires, torches, and boards.
// Zomboid's scheme, which Michael remembered right and we checked (2026-10-09):
// tap E to open or close, hold E to climb through an open window. Doors only
// open and close. Fires (docs/07): tap E to light a hearth or a campfire with
// a log, or to add one; logs are free until the inventory exists. Torches: tap
// E at a bracket or a post to take the torch into the off-hand or to mount
// the one you hold. Boards (docs/09): tap B to nail a plank on your side of a
// door or a window, hold B to pull one, and it is gone; planks are free until
// the inventory. B is a stand-in key until there is more interface.

import * as input from "./input.js";
import { openingsNear, burnersNear, bracketsNear, holdersNear, feedFire, holderHas, setHolder, touch, boarded, climbable, sideOf, addBoard, pullBoard, BOARDS_PER_SIDE } from "./map.js";
import { startClimb } from "./entities/player.js";
import { hold, release, holding, canHold } from "./items.js";

export const REACH = 1.15; // tiles from the player to the opening's midpoint
export const HOLD_TIME = 0.35; // seconds of a key that count as a hold

// A tap-or-hold tracker per key.
function keyTracker(code) {
  return { code, held: 0, consumed: false };
}
const keyE = keyTracker("KeyE");
const keyB = keyTracker("KeyB");

// Advance a tracker; calls onHold once when the hold time passes and onTap on
// a release that was not a hold.
function track(k, dt, onHold, onTap) {
  // wasPressed catches a tap shorter than one step, which isDown would miss.
  if (input.isDown(k.code) || input.wasPressed(k.code)) {
    k.held += dt;
    if (!k.consumed && k.held >= HOLD_TIME) {
      k.consumed = true;
      onHold();
    }
  } else {
    if (k.held > 0 && !k.consumed) onTap();
    k.held = 0;
    k.consumed = false;
  }
}

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

// Tap E at an opening: open or close the leaf, unless boarded or broken.
function toggle(o) {
  const w = o.wall;
  if (boarded(w) || w.broken) return false;
  if (w.kind === "door") w.open = !w.open;
  else w.shutter = w.shutter === "open" ? "closed" : "open";
  touch();
  return true;
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

// The player's side of an opening.
function mySide(player, o) {
  return sideOf(o.tx, o.ty, o.edge, player.gx, player.gy);
}

// The stack as words: "2 boards out, 1 in", from the player's side.
function stackLabel(o, side) {
  const w = o.wall;
  const mine = side > 0 ? w.boards.near.length : w.boards.far.length;
  const theirs = side > 0 ? w.boards.far.length : w.boards.near.length;
  const parts = [];
  if (mine) parts.push(`${mine} board${mine > 1 ? "s" : ""} this side`);
  if (theirs) parts.push(`${theirs} board${theirs > 1 ? "s" : ""} far side`);
  return parts.join(", ");
}

function openingLabel(player, o) {
  const w = o.wall;
  const name = w.kind === "door" ? "door" : "shutters";
  const side = mySide(player, o);
  const mine = side > 0 ? w.boards.near.length : w.boards.far.length;
  const stack = stackLabel(o, side);
  let first;
  if (boarded(w)) first = `${name}: boarded (${stack})`;
  else if (w.broken) first = w.kind === "door" ? "a broken doorway" : "broken shutters   hold E: climb through";
  else if (w.kind === "door") first = w.open ? "E: close door" : "E: open door";
  else first = isOpen(o) ? "E: close shutters   hold E: climb through" : "E: open shutters";
  const board = mine < BOARDS_PER_SIDE ? `B: nail a board (${mine}/${BOARDS_PER_SIDE})` : `boards ${mine}/${BOARDS_PER_SIDE}`;
  const pull = mine ? "   hold B: pull one" : "";
  return `${first}   ${board}${pull}`;
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
  return { label: openingLabel(player, t.o), mx: t.o.mx, my: t.o.my };
}

export function updateInteract(player, dt) {
  if (player.climb) {
    keyE.held = 0;
    keyE.consumed = true; // the hold that started the climb is spent
    return;
  }
  const t = nearestTarget(player);
  track(keyE, dt,
    () => {
      if (t && t.kind === "opening" && climbable(t.o.wall)) startClimb(player, t.o);
    },
    () => {
      if (!t) return;
      if (t.kind === "opening") toggle(t.o);
      else if (t.kind === "fire") feedFire(t.prop);
      else useHolder(player, t);
    });
  track(keyB, dt,
    () => {
      if (t && t.kind === "opening") pullBoard(t.o.wall, mySide(player, t.o));
    },
    () => {
      if (t && t.kind === "opening") addBoard(t.o.wall, mySide(player, t.o));
    });
}
