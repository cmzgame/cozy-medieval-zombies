// The player. Copied from cozy-zombie-game src/entities/player.js on 2026-10-09
// and cut down for the probe: movement, sprint, aim, animation. Hunger, thirst,
// flashlight, and auto-walk come back with their own milestones.

import * as iso from "../iso.js";
import * as input from "../input.js";
import { moveCircle, canStep } from "../map.js";
import { findPath } from "../pathfind.js";
import { getSheet } from "../assets.js";
import { createAnimation, playAnimation, advanceAnimation } from "../sprites.js";
import { createCharacter } from "./character.js";
import { rules } from "../rules.js";
import { player as T } from "../tuning.js";


export function createPlayer(gx, gy) {
  return {
    ...createCharacter("player", gx, gy, { id: "player", speed: T.speed, radius: T.radius, hp: T.hp }),
    sprite: "player", // its own sheet, rebuilt whenever their look or clothes change (main.js)
    aim: { sx: 0, sy: 1 },
    stamina: T.stamina,
    maxStamina: T.stamina,
    sprinting: false,
    winded: false,
    moving: false,
    climb: null, // { from, to, t } while climbing through a window
    hunger: T.hungerMax,
    maxHunger: T.hungerMax,
    thirst: T.thirstMax,
    maxThirst: T.thirstMax,
    auto: null, // auto-walk: { path, tiles, range, onArrive, goalTile }
    action: null, // a timed action in progress: { action, elapsed }
    drawing: false, // a bow drawn (docs/20); archery.js sets it
    moveMult: 1, // walking speed while a bow is drawn
    // Combat's state on the player, declared here so the shape is in one place (docs/23a, D8):
    // combat.js, inventory.js, bleed.js, and infection.js write these.
    attackCooldown: 0, // seconds until the main hand may swing again
    offCooldown: 0, // and the off hand
    shoveCooldown: 0,
    swingLock: 0, // seconds in which the other hand may not swing (two weapons never land on one frame)
    lastHand: "main", // which hand swung last; the left button alternates them (docs/21)
    exposedFor: 0, // seconds of the off-hand swing's exposure (docs/21)
    blocking: false, // the shield up (the right button held)
    blockFlash: 0, // seconds the shield flashes after a blow met it
    flashBroken: false, // the flash is the red one of a broken guard
    offMemory: null, // what a two-hander pushed out of the off hand, to come back (inventory.js)
    bleed: null, // { stacks, left } while bleeding (bleed.js)
    infection: null, // { since } once infected (infection.js)
  };
}

export function damagePlayer(player, amount) {
  if (player.hp <= 0) return;
  player.hp = Math.max(0, player.hp - amount);
  if (player.hp > 0) playAnimation(player.anim, "hurt", true);
}


export function startClimb(player, win) {
  if (player.carrying) return;
  player.climb = { from: [player.gx, player.gy], to: [win.to[0], win.to[1]], t: 0 };
  player.moving = false;
  player.sprinting = false;
}

function updateClimb(player, dt) {
  const c = player.climb;
  c.t += dt;
  const k = Math.min(1, c.t / T.climbTime);
  const ease = k * k * (3 - 2 * k);
  player.gx = c.from[0] + (c.to[0] - c.from[0]) * ease;
  player.gy = c.from[1] + (c.to[1] - c.from[1]) * ease;
  if (k >= 1) player.climb = null;
}

export function aimOrigin(player) {
  const p = iso.toScreen(player.gx, player.gy);
  return { x: p.x, y: p.y - T.aimY };
}

// ---- needs ----

export function eat(player, def) {
  player.hunger = Math.min(player.maxHunger, player.hunger + (def.hunger || 0));
  player.thirst = Math.min(player.maxThirst, player.thirst + (def.thirst || 0));
  player.hp = Math.min(player.maxHp, player.hp + (def.heal || 0));
}

// A sip from a waterskin entry: up to T.drinkSip of its fill.
export function drink(player, entry) {
  const amount = Math.min(entry.fill ?? 0, T.drinkSip, player.maxThirst - player.thirst + 1);
  if (amount <= 0) return false;
  entry.fill -= amount;
  player.thirst = Math.min(player.maxThirst, player.thirst + amount);
  return true;
}

// Hunger and thirst drain, and kill at zero. The Survival setting turns all
// of it off (Michael, 2026-10-10 late): off, nothing drains and the needs
// stay full, so the moodles never show.
function updateNeeds(player, dt) {
  if (!rules.survival) {
    player.hunger = player.maxHunger ?? T.hungerMax;
    player.thirst = player.maxThirst ?? T.thirstMax;
    return;
  }
  player.hunger = Math.max(0, player.hunger - (T.hungerMax / T.hungerDrainSeconds) * dt);
  player.thirst = Math.max(0, player.thirst - (T.thirstMax / T.thirstDrainSeconds) * dt);
  if (player.hunger <= 0) player.hp = Math.max(0, player.hp - T.starveDamage * dt);
  if (player.thirst <= 0) player.hp = Math.max(0, player.hp - T.dehydrateDamage * dt);
}

// ---- auto-walk (copied from the cozy parent's player.js, 2026-10-10) ----

// Walk to goalTile along a path, or stop as soon as any of `tiles` is within
// `range`. Calls onArrive once. Returns false if there is no path.
export function autoWalk(player, goalTile, { tiles = [goalTile], range = 0, onArrive = null } = {}) {
  const from = [Math.round(player.gx), Math.round(player.gy)];
  const path = findPath(from, goalTile, canStep, 2500);
  if (!path) return false;
  player.auto = { path, tiles, range, onArrive, goalTile };
  player.action = null;
  return true;
}

export function cancelAutoWalk(player) {
  player.auto = null;
}

function distToTiles(player, tiles) {
  let best = Infinity;
  for (const [tx, ty] of tiles) best = Math.min(best, Math.hypot(player.gx - tx, player.gy - ty));
  return best;
}

// Returns true while still walking.
function followAuto(player, dt) {
  const a = player.auto;
  if (a.range > 0 && distToTiles(player, a.tiles) <= a.range) return finishAuto(player);
  while (a.path.length) {
    const [tx, ty] = a.path[0];
    const dx = tx - player.gx;
    const dy = ty - player.gy;
    const d = Math.hypot(dx, dy);
    if (d < 0.08) {
      a.path.shift();
      continue;
    }
    const before = [player.gx, player.gy];
    const n = iso.normalize(dx, dy);
    const step = Math.min(d, player.speed * (player.sprinting ? T.sprintMult : 1) * (player.moveMult ?? 1) * dt);
    const moved = moveCircle(player.gx, player.gy, player.radius, n.x * step, n.y * step);
    player.gx = moved.gx;
    player.gy = moved.gy;
    if (Math.hypot(player.gx - before[0], player.gy - before[1]) < 1e-4) return finishAuto(player); // stuck
    return true;
  }
  return finishAuto(player);
}

// Ends the walk. onArrive receives whether the player actually got there, so
// a blocked walk never performs the action from across the room.
function finishAuto(player) {
  const a = player.auto;
  player.auto = null;
  if (!a?.onArrive) return false;
  const arrived = a.range > 0
    ? distToTiles(player, a.tiles) <= a.range
    : Math.hypot(player.gx - a.goalTile[0], player.gy - a.goalTile[1]) <= 0.35;
  a.onArrive(arrived);
  return false;
}

function moveToward(player, dt, dx, dy, mult = 1) {
  const n = iso.normalize(dx, dy);
  const step = player.speed * mult * dt;
  const moved = moveCircle(player.gx, player.gy, player.radius, n.x * step, n.y * step);
  player.gx = moved.gx;
  player.gy = moved.gy;
}

export function updatePlayer(player, dt) {
  const sheet = getSheet(player.sprite);

  if (player.climb) {
    updateClimb(player, dt);
    playAnimation(player.anim, "walk");
    advanceAnimation(player.anim, sheet, dt);
    return;
  }

  updateNeeds(player, dt);

  // Keys snap to the eight iso directions, so a diagonal key walks along a wall.
  // Any key cancels an auto-walk.
  const axis = input.moveAxis();
  player.moving = axis.x !== 0 || axis.y !== 0;
  if (player.moving) player.auto = null;

  const wantSprint = input.isDown("ShiftLeft") || input.isDown("ShiftRight");
  if (player.winded && player.stamina >= T.sprintRecoverAt) player.winded = false;
  const anyMovement = player.moving || !!player.auto;
  player.sprinting = wantSprint && anyMovement && !player.winded && player.stamina > 0 && !player.carrying && !player.blocking;
  if (player.sprinting) {
    player.stamina = Math.max(0, player.stamina - T.sprintDrain * dt);
    if (player.stamina <= 0) player.winded = true;
  } else if (!player.blocking) {
    // Nothing comes back while the guard is up (docs/21): each block spends it, so the guard is finite.
    player.stamina = Math.min(player.maxStamina, player.stamina + T.staminaRegen * dt);
  }

  let walking = player.moving;
  if (player.moving) {
    const f = iso.facingFromScreenVector(axis.x, axis.y);
    const [dx, dy] = iso.DIRS[f];
    moveToward(player, dt, dx, dy, (player.sprinting ? T.sprintMult : 1) * (player.moveMult ?? 1));
  } else if (player.auto) {
    walking = followAuto(player, dt);
  }

  // Aim: mouse relative to the chest. Facing follows the aim, not the walk.
  const m = input.getMouse();
  const o = aimOrigin(player);
  const ax = m.x - o.x;
  const ay = m.y - o.y;
  if (ax !== 0 || ay !== 0) {
    const n = iso.normalize(ax, ay);
    player.aim.sx = n.x;
    player.aim.sy = n.y;
    player.facing = iso.facingFromScreenVector(ax, ay);
  }

  const oneShot = player.anim.name === "attack" || player.anim.name === "hurt";
  if (!oneShot || player.anim.done) playAnimation(player.anim, (player.carrying ? "carry_" : "") + (walking ? "walk" : "idle"));
  advanceAnimation(player.anim, sheet, dt);
}
