// The dead. Copied from cozy-zombie-game src/entities/zombie.js on 2026-10-09 and
// cut down for the probe: idle, wander, chase, bite. Sight uses the map's line
// of sight so a wall or a closed door hides you and a window does not. Combat
// (damage, knockdown, bodies) returns with the combat milestone.

import * as iso from "../iso.js";
import { moveCircle, isWalkableTile, canStep } from "../map.js";
import { findPath } from "../pathfind.js";
import { lineOfSight } from "../visibility.js";
import { getSheet } from "../assets.js";
import { createAnimation, playAnimation, advanceAnimation, isActiveFrame } from "../sprites.js";
import { emit } from "../events.js";

export const ZOMBIE_SPEED = 1.0; // tiles per second: Romero shamblers
export const ZOMBIE_SIGHT = 8; // tiles, by day; light comes back with the lighting milestone
export const ZOMBIE_CONTACT = 0.7;
export const ZOMBIE_DAMAGE = 8;
export const ZOMBIE_COOLDOWN = 1.2;
export const ZOMBIE_HP = 100;
export const ZOMBIE_REPATH = 0.3;
export const ZOMBIE_RADIUS = 0.3;
const WANDER_IDLE_MIN = 1.5;
const WANDER_IDLE_MAX = 4.0;
const SEPARATION = 0.55;
const SIGHT_CHECK = 0.25; // seconds between sight tests while not chasing

let nextId = 1;

export function createZombie(gx, gy, { id = null, hp = ZOMBIE_HP, aggro = false } = {}) {
  return {
    kind: "zombie",
    sprite: "zombie",
    id: id || `z${nextId++}`,
    gx,
    gy,
    facing: "s",
    speed: ZOMBIE_SPEED,
    radius: ZOMBIE_RADIUS,
    hp,
    maxHp: ZOMBIE_HP,
    state: aggro ? "chase" : "idle",
    aggro,
    anim: createAnimation("idle"),
    path: [],
    repathTimer: 0,
    sightTimer: Math.random() * SIGHT_CHECK,
    lastPlayerTile: null,
    idleTimer: WANDER_IDLE_MIN + Math.random() * (WANDER_IDLE_MAX - WANDER_IDLE_MIN),
    attackCooldown: 0,
    attackHit: false,
    pathFailed: false,
    dead: false,
  };
}

function distTo(z, e) {
  return Math.hypot(e.gx - z.gx, e.gy - z.gy);
}

function faceToward(z, dx, dy) {
  if (dx === 0 && dy === 0) return;
  const s = iso.gridDirToScreen(dx, dy);
  z.facing = iso.facingFromScreenVector(s.sx, s.sy);
}

// Symmetric with the player's own sight: if you could see it, it can see you.
function canSee(z, player) {
  if (player.dead) return false;
  if (distTo(z, player) > ZOMBIE_SIGHT) return false;
  return lineOfSight(z.gx, z.gy, player.gx, player.gy);
}

function tileOf(e) {
  return [Math.round(e.gx), Math.round(e.gy)];
}

// A failed search backs off for a second rather than retrying every frame,
// which was a freeze waiting to happen on a map with no edge to stop a search.
const REPATH_FAIL_BACKOFF = 1.0;

function repath(z, goalTile) {
  const path = findPath(tileOf(z), goalTile, canStep);
  z.path = path || [];
  z.pathFailed = path === null;
  z.repathTimer = z.pathFailed ? REPATH_FAIL_BACKOFF : ZOMBIE_REPATH;
}

function followPath(z, dt, others) {
  if (!z.path.length) return true;
  const [tx, ty] = z.path[0];
  const dx = tx - z.gx;
  const dy = ty - z.gy;
  const d = Math.hypot(dx, dy);
  if (d < 0.08) {
    z.path.shift();
    return z.path.length === 0;
  }
  const step = Math.min(d, z.speed * dt);
  faceToward(z, dx, dy);
  const moved = moveCircle(z.gx, z.gy, z.radius, (dx / d) * step, (dy / d) * step);
  z.gx = moved.gx;
  z.gy = moved.gy;
  separate(z, dt, others);
  return false;
}

function separate(z, dt, others) {
  let px = 0;
  let py = 0;
  for (const o of others) {
    if (o === z || o.dead) continue;
    const dx = z.gx - o.gx;
    const dy = z.gy - o.gy;
    const d = Math.hypot(dx, dy);
    if (d > 0 && d < SEPARATION) {
      const f = (SEPARATION - d) / SEPARATION;
      px += (dx / d) * f;
      py += (dy / d) * f;
    } else if (d === 0) {
      px += Math.random() - 0.5;
      py += Math.random() - 0.5;
    }
  }
  if (px !== 0 || py !== 0) {
    const moved = moveCircle(z.gx, z.gy, z.radius, px * dt * 2, py * dt * 2);
    z.gx = moved.gx;
    z.gy = moved.gy;
  }
}

function pickWanderTarget(z) {
  for (let tries = 0; tries < 10; tries++) {
    const tx = Math.round(z.gx) + Math.floor(Math.random() * 7) - 3;
    const ty = Math.round(z.gy) + Math.floor(Math.random() * 7) - 3;
    if (isWalkableTile(tx, ty)) return [tx, ty];
  }
  return null;
}

export function updateZombie(z, dt, player, others) {
  const sheet = getSheet(z.sprite);
  if (z.dead) return;
  z.attackCooldown = Math.max(0, z.attackCooldown - dt);
  z.repathTimer -= dt;
  z.sightTimer -= dt;
  let sees = false;
  if (z.sightTimer <= 0) {
    z.sightTimer = SIGHT_CHECK;
    sees = canSee(z, player);
    if (sees) z.aggro = true;
  }

  switch (z.state) {
    case "idle": {
      playAnimation(z.anim, "idle");
      z.idleTimer -= dt;
      if (z.aggro) {
        z.state = "chase";
        z.repathTimer = 0;
      } else if (z.idleTimer <= 0) {
        const target = pickWanderTarget(z);
        if (target) {
          repath(z, target);
          z.state = "wander";
        }
        z.idleTimer = WANDER_IDLE_MIN + Math.random() * (WANDER_IDLE_MAX - WANDER_IDLE_MIN);
      }
      break;
    }
    case "wander": {
      playAnimation(z.anim, "walk");
      if (z.aggro) {
        z.state = "chase";
        z.repathTimer = 0;
        break;
      }
      if (followPath(z, dt, others)) z.state = "idle";
      break;
    }
    case "chase": {
      const d = distTo(z, player);
      if (d <= ZOMBIE_CONTACT) {
        z.path = [];
        faceToward(z, player.gx - z.gx, player.gy - z.gy);
        if (z.attackCooldown <= 0) {
          z.state = "attack";
          z.attackHit = false;
          playAnimation(z.anim, "attack", true);
        } else {
          playAnimation(z.anim, "idle");
          separate(z, dt, others);
        }
        break;
      }
      const pt = tileOf(player);
      const tileChanged = !z.lastPlayerTile || z.lastPlayerTile[0] !== pt[0] || z.lastPlayerTile[1] !== pt[1];
      if (z.repathTimer <= 0 || ((tileChanged || !z.path.length) && !z.pathFailed)) {
        z.lastPlayerTile = pt;
        repath(z, pt);
      }
      playAnimation(z.anim, "walk");
      if (z.path.length) {
        followPath(z, dt, others);
      } else {
        const dx = player.gx - z.gx;
        const dy = player.gy - z.gy;
        const n = iso.normalize(dx, dy);
        faceToward(z, dx, dy);
        const moved = moveCircle(z.gx, z.gy, z.radius, n.x * z.speed * dt, n.y * z.speed * dt);
        z.gx = moved.gx;
        z.gy = moved.gy;
        separate(z, dt, others);
      }
      break;
    }
    case "attack": {
      if (isActiveFrame(z.anim, sheet) && !z.attackHit) {
        z.attackHit = true;
        if (distTo(z, player) <= ZOMBIE_CONTACT + 0.2) emit("playerHit", { zombie: z, damage: ZOMBIE_DAMAGE });
      }
      if (z.anim.done) {
        z.attackCooldown = ZOMBIE_COOLDOWN;
        z.state = "chase";
      }
      break;
    }
  }

  advanceAnimation(z.anim, sheet, dt);
}
