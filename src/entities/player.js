// The player. Copied from cozy-zombie-game src/entities/player.js on 2026-10-09
// and cut down for the probe: movement, sprint, aim, animation. Hunger, thirst,
// flashlight, and auto-walk come back with their own milestones.

import * as iso from "../iso.js";
import * as input from "../input.js";
import { moveCircle } from "../map.js";
import { getSheet } from "../assets.js";
import { createAnimation, playAnimation, advanceAnimation } from "../sprites.js";

export const PLAYER_SPEED = 3.0; // tiles per second
export const PLAYER_RADIUS = 0.3;
export const PLAYER_HP = 100;
export const PLAYER_STAMINA = 100;
export const SPRINT_MULT = 1.75;
// The parent drained 40 per second: a sprint lasted 2.5 s, about a third of a
// screen. Michael wanted longer (2026-10-09): 16 per second is just over 6 s,
// about a screen and a half at 5.25 tiles per second.
export const SPRINT_DRAIN = 16;
export const STAMINA_REGEN = 22;
export const SPRINT_RECOVER_AT = 20;
// Aim originates from the chest, this many pixels above the feet.
export const AIM_Y = 22;

export function createPlayer(gx, gy) {
  return {
    kind: "player",
    sprite: "player",
    gx,
    gy,
    facing: "s",
    aim: { sx: 0, sy: 1 },
    speed: PLAYER_SPEED,
    radius: PLAYER_RADIUS,
    hp: PLAYER_HP,
    maxHp: PLAYER_HP,
    stamina: PLAYER_STAMINA,
    maxStamina: PLAYER_STAMINA,
    sprinting: false,
    winded: false,
    moving: false,
    dead: false,
    anim: createAnimation("idle"),
  };
}

export function damagePlayer(player, amount) {
  if (player.hp <= 0) return;
  player.hp = Math.max(0, player.hp - amount);
  if (player.hp > 0) playAnimation(player.anim, "hurt", true);
}

export function aimOrigin(player) {
  const p = iso.toScreen(player.gx, player.gy);
  return { x: p.x, y: p.y - AIM_Y };
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

  // Keys snap to the eight iso directions, so a diagonal key walks along a wall.
  const axis = input.moveAxis();
  player.moving = axis.x !== 0 || axis.y !== 0;

  const wantSprint = input.isDown("ShiftLeft") || input.isDown("ShiftRight");
  if (player.winded && player.stamina >= SPRINT_RECOVER_AT) player.winded = false;
  player.sprinting = wantSprint && player.moving && !player.winded && player.stamina > 0;
  if (player.sprinting) {
    player.stamina = Math.max(0, player.stamina - SPRINT_DRAIN * dt);
    if (player.stamina <= 0) player.winded = true;
  } else {
    player.stamina = Math.min(player.maxStamina, player.stamina + STAMINA_REGEN * dt);
  }

  if (player.moving) {
    const f = iso.facingFromScreenVector(axis.x, axis.y);
    const [dx, dy] = iso.DIRS[f];
    moveToward(player, dt, dx, dy, player.sprinting ? SPRINT_MULT : 1);
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
  if (!oneShot || player.anim.done) playAnimation(player.anim, player.moving ? "walk" : "idle");
  advanceAnimation(player.anim, sheet, dt);
}
