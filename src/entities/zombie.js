// The dead. Copied from cozy-zombie-game src/entities/zombie.js on 2026-10-09 and
// cut down for the probe: idle, wander, chase, bite. Combat (damage, knockdown,
// bodies) returns with the combat milestone.
//
// Memory (Michael, 2026-10-09): the dead know only where they last saw you.
// They chase that spot, and when they get there without seeing you they search
// around it for a while and then give up. Nothing tells them your position
// through a wall. Noise is deliberately not a factor yet (docs/02).

import * as iso from "../iso.js";
import { moveCircle, isWalkableTile, canStep, nearestWalkable, tileAt, getRoom, breachTarget, damageOpening, wayOpen, climbable } from "../map.js";
import { findPath } from "../pathfind.js";
import { lineOfSight } from "../visibility.js";
import * as light from "../light.js";
import * as clock from "../clock.js";
import { getSheet } from "../assets.js";
import { createAnimation, playAnimation, advanceAnimation, isActiveFrame } from "../sprites.js";
import { emit } from "../events.js";

export const ZOMBIE_SPEED = 1.0; // tiles per second: Romero shamblers
export const ZOMBIE_SIGHT = 8; // tiles, in full light; scaled by the light on the player
export const SIGHT_DARK_FRACTION = 0.35; // of full range when the player is unlit
export const FLAME_RANGE = 12; // tiles: at full night the dead see a flame this far (docs/07)
export const ZOMBIE_CONTACT = 0.7;
export const ZOMBIE_DAMAGE = 8;
export const ZOMBIE_COOLDOWN = 1.2;
export const ZOMBIE_HP = 100;
export const ZOMBIE_REPATH = 0.3;
export const ZOMBIE_RADIUS = 0.3;
export const SEARCH_TIME = 10; // seconds spent looking around the last sighting
export const BREACH_DAMAGE = 5; // per hit into an opening's stack (docs/09)
export const ZOMBIE_CLIMB = 1.6; // seconds through a window, against the player's 0.9
const BREACH_REACH = 1.1; // tiles from the edge midpoint to hit it
const SEARCH_RADIUS = 3; // tiles
const WANDER_IDLE_MIN = 1.5;
const WANDER_IDLE_MAX = 4.0;
const SEPARATION = 0.55;
const SIGHT_CHECK = 0.25; // seconds between sight tests
const ARRIVED = 0.6; // tiles: close enough to the last sighting to count as there
// A failed search backs off for a second rather than retrying every frame,
// which was a freeze waiting to happen on a map with no edge to stop a search.
const REPATH_FAIL_BACKOFF = 1.0;

let nextId = 1;

export function createZombie(gx, gy, { id = null, hp = ZOMBIE_HP, aggro = false } = {}) {
  return {
    kind: "zombie",
    sprite: "zombie",
    id: id || `z${nextId++}`,
    gx,
    gy,
    layer: 0, // always 0 for now (docs/08)
    facing: "s",
    speed: ZOMBIE_SPEED,
    radius: ZOMBIE_RADIUS,
    hp,
    maxHp: ZOMBIE_HP,
    state: aggro ? "chase" : "idle",
    aggro,
    lastSeen: null, // [gx, gy] where the player was last seen
    seesNow: false,
    searchTimer: 0,
    anim: createAnimation("idle"),
    path: [],
    repathTimer: 0,
    sightTimer: Math.random() * SIGHT_CHECK,
    lastGoal: null,
    idleTimer: WANDER_IDLE_MIN + Math.random() * (WANDER_IDLE_MAX - WANDER_IDLE_MIN),
    attackCooldown: 0,
    attackHit: false,
    pathFailed: false,
    breach: null, // { wall, tx, ty, edge, stand, side, into } while breaking in
    climb: null, // { from, to, t } while climbing through a window
    dead: false,
  };
}

// The room the dead want into: where they last saw the player.
function goalRoom(z) {
  if (!z.lastSeen) return 0;
  return tileAt(Math.round(z.lastSeen[0]), Math.round(z.lastSeen[1])).room;
}

// Where the dead stand to hit an opening: the tile beside it on their side.
function startBreach(z, target) {
  z.breach = target;
  z.state = "breach";
  z.path = [];
  z.lastGoal = null;
  z.pathFailed = false;
  z.repathTimer = 0;
}

function startClimb(z, from, to) {
  z.climb = { from: [from[0], from[1]], to: [to[0], to[1]], t: 0 };
  z.path = [];
  z.breach = null;
  z.state = "chase";
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
// The range scales with the light on the player (the cozy parent's rule):
// unlit at night about a third, in a pool or by day the whole of it.
function canSee(z, player) {
  if (player.dead) return false;
  const range = ZOMBIE_SIGHT * (SIGHT_DARK_FRACTION + (1 - SIGHT_DARK_FRACTION) * light.lightAt(player.gx, player.gy));
  if (distTo(z, player) > range) return false;
  return lineOfSight(z.gx, z.gy, player.gx, player.gy);
}

// At night the dead see fire from far away (docs/02, 2026-10-09): the nearest
// lit flame within FLAME_RANGE scaled by how dark it is, with a clear line.
// A carried torch is a sighting of the player; any other flame is a sighting
// at the flame, and the memory rule does the rest.
function nearestFlame(z) {
  const nf = clock.nightFactor();
  if (nf <= 0) return null;
  const range = FLAME_RANGE * nf;
  let best = null;
  let bestD = Infinity;
  for (const s of light.allSources()) {
    const d = Math.hypot(s.gx - z.gx, s.gy - z.gy);
    if (d > range || d >= bestD) continue;
    if (!lineOfSight(z.gx, z.gy, s.gx, s.gy)) continue;
    best = s;
    bestD = d;
  }
  return best;
}

function tileOf(e) {
  return [Math.round(e.gx), Math.round(e.gy)];
}

function repath(z, goalTile) {
  const path = findPath(tileOf(z), goalTile, canStep);
  z.path = path || [];
  z.pathFailed = path === null;
  z.lastGoal = goalTile;
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

function pickTargetAround(x, y, radius) {
  for (let tries = 0; tries < 10; tries++) {
    const tx = Math.round(x) + Math.floor(Math.random() * (radius * 2 + 1)) - radius;
    const ty = Math.round(y) + Math.floor(Math.random() * (radius * 2 + 1)) - radius;
    if (isWalkableTile(tx, ty)) return [tx, ty];
  }
  return null;
}

// Walk toward a goal tile, repathing on the interval or when the goal moves.
function moveToward(z, dt, goalTile, others) {
  const goalChanged = !z.lastGoal || z.lastGoal[0] !== goalTile[0] || z.lastGoal[1] !== goalTile[1];
  if (z.repathTimer <= 0 || ((goalChanged || !z.path.length) && !z.pathFailed)) repath(z, goalTile);
  playAnimation(z.anim, "walk");
  if (z.path.length) return followPath(z, dt, others);
  // Same tile or unreachable: nudge straight at it.
  const dx = goalTile[0] - z.gx;
  const dy = goalTile[1] - z.gy;
  const n = iso.normalize(dx, dy);
  faceToward(z, dx, dy);
  const moved = moveCircle(z.gx, z.gy, z.radius, n.x * z.speed * dt, n.y * z.speed * dt);
  z.gx = moved.gx;
  z.gy = moved.gy;
  separate(z, dt, others);
  return Math.hypot(dx, dy) < 0.2;
}

function startSearch(z) {
  z.state = "search";
  z.searchTimer = SEARCH_TIME;
  z.path = [];
  z.lastGoal = null;
  z.idleTimer = 0;
}

function giveUp(z) {
  z.state = "idle";
  z.aggro = false;
  z.lastSeen = null;
  z.path = [];
  z.lastGoal = null;
  z.idleTimer = WANDER_IDLE_MIN + Math.random() * (WANDER_IDLE_MAX - WANDER_IDLE_MIN);
}

export function updateZombie(z, dt, player, others) {
  const sheet = getSheet(z.sprite);
  if (z.dead) return;
  // Climbing: slow, committed, no bite until it is through (docs/09).
  if (z.climb) {
    const c = z.climb;
    c.t += dt;
    const k = Math.min(1, c.t / ZOMBIE_CLIMB);
    const ease = k * k * (3 - 2 * k);
    z.gx = c.from[0] + (c.to[0] - c.from[0]) * ease;
    z.gy = c.from[1] + (c.to[1] - c.from[1]) * ease;
    faceToward(z, c.to[0] - c.from[0], c.to[1] - c.from[1]);
    playAnimation(z.anim, "walk");
    if (k >= 1) {
      z.climb = null;
      z.repathTimer = 0;
    }
    advanceAnimation(z.anim, sheet, dt);
    return;
  }
  z.attackCooldown = Math.max(0, z.attackCooldown - dt);
  z.repathTimer -= dt;
  z.sightTimer -= dt;
  if (z.sightTimer <= 0) {
    z.sightTimer = SIGHT_CHECK;
    z.seesNow = canSee(z, player);
    if (z.seesNow) {
      z.aggro = true;
      z.lastSeen = [player.gx, player.gy];
    } else {
      const f = nearestFlame(z);
      if (f) {
        z.aggro = true;
        z.lastSeen = f.carried ? [player.gx, player.gy] : [f.gx, f.gy];
        if (z.state === "search") {
          z.state = "chase";
          z.repathTimer = 0;
        }
      }
    }
  }
  if (z.aggro && !z.lastSeen) z.lastSeen = [player.gx, player.gy]; // spawned aggro

  switch (z.state) {
    case "idle": {
      playAnimation(z.anim, "idle");
      z.idleTimer -= dt;
      if (z.aggro) {
        z.state = "chase";
        z.repathTimer = 0;
      } else if (z.idleTimer <= 0) {
        const target = pickTargetAround(z.gx, z.gy, 3);
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
      // A bite needs reach and a clear line: no biting through a wall.
      const d = distTo(z, player);
      if (d <= ZOMBIE_CONTACT && z.seesNow) {
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
      let goal = z.seesNow ? tileOf(player) : [Math.round(z.lastSeen[0]), Math.round(z.lastSeen[1])];
      // A sighting on a solid tile (a campfire, a lantern on a post) is
      // walked to from beside it.
      if (!isWalkableTile(goal[0], goal[1])) goal = nearestWalkable(goal[0], goal[1]) || goal;
      const arrived = moveToward(z, dt, goal, others);
      // No way there and the goal is in a room: go for the room's nearest
      // opening and break in (docs/09). Only when the dead are not in that
      // room already.
      if (z.pathFailed) {
        const roomId = goalRoom(z);
        const here = tileAt(Math.round(z.gx), Math.round(z.gy)).room;
        // Shut in a room with the goal elsewhere: break out of this one
        // first. Outside with the goal in a room: break into that one.
        let room = null;
        if (here > 0 && here !== roomId) room = getRoom(here);
        else if (roomId > 0 && here !== roomId) room = getRoom(roomId);
        const target = room ? breachTarget(room, z.gx, z.gy) : null;
        if (target) {
          startBreach(z, target);
          break;
        }
      }
      const atSighting = Math.hypot(z.lastSeen[0] - z.gx, z.lastSeen[1] - z.gy) <= ARRIVED;
      if (!z.seesNow && (arrived || atSighting || z.pathFailed)) startSearch(z);
      break;
    }
    case "breach": {
      const b = z.breach;
      // A bite in reach beats a door; a goal that moved rooms drops the breach.
      if (z.seesNow && distTo(z, player) <= ZOMBIE_CONTACT) {
        z.breach = null;
        z.state = "chase";
        break;
      }
      // Keep at it while the goal is still on the other side of this opening:
      // in the room it leads into, or anywhere but the room it leads out of.
      const roomId = goalRoom(z);
      const here = tileAt(Math.round(z.gx), Math.round(z.gy)).room;
      const stillWanted = here > 0 ? roomId !== here : roomId === tileAt(b.into[0], b.into[1]).room;
      if (!z.aggro || !stillWanted) {
        z.breach = null;
        z.state = z.aggro ? "chase" : "idle";
        z.repathTimer = 0;
        break;
      }
      const mx = b.edge === "n" ? b.tx : b.tx - 0.5;
      const my = b.edge === "n" ? b.ty - 0.5 : b.ty;
      const dEdge = Math.hypot(mx - z.gx, my - z.gy);
      if (dEdge > BREACH_REACH) {
        moveToward(z, dt, b.stand, others);
        if (z.pathFailed) {
          // Cannot even reach the opening: give the search a go instead.
          z.breach = null;
          startSearch(z);
        }
        break;
      }
      faceToward(z, mx - z.gx, my - z.gy);
      // The way is open: through the door, or up and over the sill.
      if (wayOpen(b.wall) || climbable(b.wall)) {
        if (b.wall.kind === "window") startClimb(z, [z.gx, z.gy], b.into);
        else {
          z.breach = null;
          z.state = "chase";
          z.repathTimer = 0;
        }
        break;
      }
      if (z.attackCooldown <= 0) {
        z.state = "breachHit";
        z.attackHit = false;
        playAnimation(z.anim, "attack", true);
      } else {
        playAnimation(z.anim, "idle");
      }
      break;
    }
    case "breachHit": {
      const b = z.breach;
      if (!b) {
        z.state = "chase";
        break;
      }
      if (isActiveFrame(z.anim, sheet) && !z.attackHit) {
        z.attackHit = true;
        damageOpening(b.wall, b.side, BREACH_DAMAGE);
      }
      if (z.anim.done) {
        z.attackCooldown = ZOMBIE_COOLDOWN;
        z.state = "breach";
      }
      break;
    }
    case "search": {
      // Look around the last sighting: short walks nearby, then give up.
      z.searchTimer -= dt;
      if (z.seesNow) {
        z.state = "chase";
        z.repathTimer = 0;
        break;
      }
      if (z.searchTimer <= 0) {
        giveUp(z);
        break;
      }
      if (z.path.length) {
        playAnimation(z.anim, "walk");
        followPath(z, dt, others);
      } else {
        playAnimation(z.anim, "idle");
        z.idleTimer -= dt;
        if (z.idleTimer <= 0) {
          const target = pickTargetAround(z.lastSeen[0], z.lastSeen[1], SEARCH_RADIUS);
          if (target) repath(z, target);
          z.idleTimer = 0.8 + Math.random() * 1.2;
        }
      }
      break;
    }
    case "attack": {
      if (isActiveFrame(z.anim, sheet) && !z.attackHit) {
        z.attackHit = true;
        if (distTo(z, player) <= ZOMBIE_CONTACT + 0.2 && lineOfSight(z.gx, z.gy, player.gx, player.gy)) {
          emit("playerHit", { zombie: z, damage: ZOMBIE_DAMAGE });
        }
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
