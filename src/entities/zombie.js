// The dead. Copied from cozy-zombie-game src/entities/zombie.js on 2026-10-09 and
// cut down for the probe: idle, wander, chase, bite. Combat (damage, knockdown,
// bodies) returns with the combat milestone.
//
// Memory (Michael, 2026-10-09): the dead know only where they last saw you.
// They chase that spot, and when they get there without seeing you they search
// around it for a while and then give up. Nothing tells them your position
// through a wall. Noise is deliberately not a factor yet (docs/02).

import * as settings from "../settings.js";
import { wardrobeCount } from "../figure.js";
import { createCharacter, wardrobeInto, say } from "./character.js";
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
export const FLAME_PATIENCE = 8; // seconds after seeing the player before a flame can take over (Michael, 2026-10-10)
const STUCK_TIME = 1.5; // seconds of no progress along a path before it is dropped
export const ZOMBIE_CONTACT = 0.7;
export const ZOMBIE_DAMAGE = 8;
export const ZOMBIE_COOLDOWN = 1.2;
export const ZOMBIE_HP = 100;
export const ZOMBIE_REPATH = 0.3;
export const ZOMBIE_RADIUS = 0.3;
export const SEARCH_TIME = 10; // seconds spent looking around the last sighting
export const BREACH_DAMAGE = 5; // per hit into an opening's stack (docs/09)
export const ZOMBIE_CLIMB = 1.6; // seconds through a window, against the player's 0.9
export const GROAN_TEXT = "Braaaains"; // what the dead say now and then (docs/19)
export const GROAN_MIN = 20; // seconds between groans
export const GROAN_MAX = 60;
export const STAGGER = 0.3; // seconds a hit stops it (docs/14)
export const DOWN_TIME = 2; // seconds on the floor after a knockdown
export const GET_UP_TIME = 0.6; // seconds to rise, the fall played backwards
export const KNOCK_TIME = 0.15; // a push is spread over this long, not a teleport
const BREACH_REACH = 1.1; // tiles from the edge midpoint to hit it
const SEARCH_RADIUS = 3; // tiles
export const WANDER_IDLE_MIN = 1.5;
export const WANDER_IDLE_MAX = 4.0;
const SEPARATION = 0.55;
const SIGHT_CHECK = 0.25; // seconds between sight tests
const ARRIVED = 0.6; // tiles: close enough to the last sighting to count as there
// A failed search backs off for a second rather than retrying every frame,
// which was a freeze waiting to happen on a map with no edge to stop a search.
const REPATH_FAIL_BACKOFF = 1.0;

let nextId = 1;

export function createZombie(gx, gy, { id = null, hp = ZOMBIE_HP, aggro = false } = {}) {
  const z = {
    ...createCharacter("zombie", gx, gy, { id: id || `z${nextId++}`, speed: ZOMBIE_SPEED, radius: ZOMBIE_RADIUS, hp, maxHp: ZOMBIE_HP }),
    state: aggro ? "chase" : "idle",
    aggro,
    lastSeen: null, // [gx, gy] where the player was last seen
    seesNow: false,
    target: null, // who it is hunting right now: the player, or (the setting on) a villager it can see
    searchTimer: 0,
    path: [],
    groanTimer: Math.random() * GROAN_MAX, // so the dead do not all groan together
    repathTimer: 0,
    sightTimer: Math.random() * SIGHT_CHECK,
    lastGoal: null,
    idleTimer: WANDER_IDLE_MIN + Math.random() * (WANDER_IDLE_MAX - WANDER_IDLE_MIN),
    attackCooldown: 0,
    attackHit: false,
    pathFailed: false,
    breach: null, // { wall, tx, ty, edge, stand, side, into } while breaking in
    climb: null, // { from, to, t } while climbing through a window
    sincePlayer: Infinity, // seconds since the player was last seen
    stuckTime: 0,
    hits: [], // when the player's blows landed, for the third-hit rule (combat.js)
    stagger: 0, // seconds left of being stopped by a blow
    knock: null, // { x, y, left } a push being spread over KNOCK_TIME
    downTimer: 0, // seconds left on the floor
    upTimer: 0, // seconds left of getting up
    gettingUp: false,
  };
  // Dressed from one of the dead's wardrobes (data/wardrobes.json, docs/19).
  wardrobeInto(z, "zombie", Math.floor(Math.random() * wardrobeCount("zombie")));
  return z;
}

// On the floor, lying or rising: a hit now is a finisher (docs/14).
export function isDown(z) {
  return z.state === "down";
}

// A climb cut short leaves the body at whichever end of it is nearer.
function endClimb(z) {
  if (!z.climb) return;
  const c = z.climb;
  const at = c.t / ZOMBIE_CLIMB < 0.5 ? c.from : c.to;
  z.gx = at[0];
  z.gy = at[1];
  z.climb = null;
}

// Hurt a zombie (docs/14). `dir` is the grid unit vector the blow travels
// along, `knockback` tiles of push, `knockdown` floors it, `stagger` seconds it
// is stopped, `from` where the blow came from (the dead then know where). A
// downed zombie takes the damage and nothing else. Returns { killed, downed }.
export function damageZombie(z, amount, { dir = [0, 0], knockback = 0, knockdown = false, stagger = STAGGER, from = null } = {}) {
  if (z.dead) return { killed: false, downed: false };
  const wasDown = isDown(z);
  z.hp = Math.max(0, z.hp - amount);
  endClimb(z);
  z.path = [];
  z.lastGoal = null;
  if (knockback > 0 && !wasDown) z.knock = { x: dir[0] * knockback, y: dir[1] * knockback, left: KNOCK_TIME };
  if (z.hp <= 0) {
    // Dead: the fall plays once and holds, the body stays, nothing thinks again.
    z.dead = true;
    z.state = "dead";
    z.breach = null;
    z.stagger = 0;
    z.gettingUp = false;
    playAnimation(z.anim, "die", true);
    emit("zombieDied", { zombie: z });
    return { killed: true, downed: false };
  }
  // The dead then know where the blow came from, when they are hunting at all.
  if (from && settings.get("zombieAggro")) {
    z.aggro = true;
    z.lastSeen = [from[0], from[1]];
    z.sincePlayer = 0;
  }
  if (wasDown) return { killed: false, downed: false };
  // Whatever it was doing, a blow ends it: a bite begun is lost, a breach waits.
  z.attackHit = false;
  if (z.state === "attack") z.state = "chase";
  if (knockdown) {
    z.state = "down";
    z.breach = null;
    z.downTimer = DOWN_TIME;
    z.gettingUp = false;
    z.stagger = 0;
    playAnimation(z.anim, "die", true);
    return { killed: false, downed: true };
  }
  z.stagger = Math.max(z.stagger, stagger);
  playAnimation(z.anim, "hurt", true);
  return { killed: false, downed: false };
}

// Pushed, stopped, or on the floor: nothing else happens until it is over.
// Returns true when the zombie is not free to act this step.
function updateHurt(z, dt, sheet) {
  if (z.knock) {
    const k = Math.min(dt, z.knock.left) / KNOCK_TIME;
    const moved = moveCircle(z.gx, z.gy, z.radius, z.knock.x * k, z.knock.y * k);
    z.gx = moved.gx;
    z.gy = moved.gy;
    z.knock.left -= dt;
    if (z.knock.left <= 0) z.knock = null;
  }
  if (z.state === "down") {
    if (!z.gettingUp) {
      advanceAnimation(z.anim, sheet, dt); // the fall plays and holds its last frame
      z.downTimer -= dt;
      if (z.downTimer <= 0) {
        z.gettingUp = true;
        z.upTimer = GET_UP_TIME;
      }
    } else {
      // Rising is the fall backwards: the frames, last to first, over GET_UP_TIME.
      z.upTimer -= dt;
      z.anim.name = "die";
      z.anim.done = false;
      z.anim.frame = Math.max(0, Math.min(3, Math.floor((Math.max(0, z.upTimer) / GET_UP_TIME) * 4)));
      if (z.upTimer <= 0) {
        z.gettingUp = false;
        z.state = z.aggro && z.lastSeen ? "chase" : "idle";
        z.idleTimer = 0.5;
        z.repathTimer = 0;
        playAnimation(z.anim, "idle", true);
      }
    }
    return true;
  }
  if (z.stagger > 0) {
    z.stagger -= dt;
    advanceAnimation(z.anim, sheet, dt);
    if (z.stagger <= 0) playAnimation(z.anim, "idle", true);
    return true;
  }
  return false;
}

// The room the dead are standing in (0 outdoors).
export function roomOf(z) {
  return tileAt(Math.round(z.gx), Math.round(z.gy)).room;
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

export function faceToward(z, dx, dy) {
  if (dx === 0 && dy === 0) return;
  const s = iso.gridDirToScreen(dx, dy);
  z.facing = iso.facingFromScreenVector(s.sx, s.sy);
}

// Symmetric with the player's own sight: if you could see it, it can see you.
// The range scales with the light on the player (the cozy parent's rule):
// unlit at night about a third, in a pool or by day the whole of it.
function canSee(z, player) {
  if (player.dead || !settings.get("zombieAggro")) return false;
  const range = ZOMBIE_SIGHT * (SIGHT_DARK_FRACTION + (1 - SIGHT_DARK_FRACTION) * light.lightAt(player.gx, player.gy));
  if (distTo(z, player) > range) return false;
  return lineOfSight(z.gx, z.gy, player.gx, player.gy);
}

// A villager in sight, the same rule as the player's: the range scales with the
// light on them, and a clear line.
function canSeeCharacter(z, c, d) {
  const range = ZOMBIE_SIGHT * (SIGHT_DARK_FRACTION + (1 - SIGHT_DARK_FRACTION) * light.lightAt(c.gx, c.gy));
  return d <= range && lineOfSight(z.gx, z.gy, c.gx, c.gy);
}

// With the setting on, the nearest living villager in sight (docs/19). Only asked
// when the player is not in sight: the dead always prefer the player.
function nearestPrey(z, villagers) {
  if (!villagers || !villagers.length || !settings.get("zombiesAttackVillagers")) return null;
  let best = null;
  let bestD = Infinity;
  for (const v of villagers) {
    if (v.dead) continue;
    const d = distTo(z, v);
    if (d >= bestD || !canSeeCharacter(z, v, d)) continue;
    best = v;
    bestD = d;
  }
  return best;
}

// At night the dead see fire from far away (docs/02, 2026-10-09): the nearest
// lit flame within FLAME_RANGE scaled by how dark it is, with a clear line.
// A carried torch is a sighting of the player; any other flame is a sighting
// at the flame, and the memory rule does the rest.
function nearestFlame(z) {
  if (!settings.get("zombieAggro")) return null;
  const nf = clock.nightFactor();
  if (nf <= 0) return null;
  const range = FLAME_RANGE * nf;
  let best = null;
  let bestD = Infinity;
  for (const s of light.allSources()) {
    const d = Math.hypot(s.gx - z.gx, s.gy - z.gy);
    // A torch on the belt is a weaker flame (docs/02): seen from half as far.
    if (d > range * (s.strength ?? 1) || d >= bestD) continue;
    if (!lineOfSight(z.gx, z.gy, s.gx, s.gy)) continue;
    best = s;
    bestD = d;
  }
  return best;
}

function tileOf(e) {
  return [Math.round(e.gx), Math.round(e.gy)];
}

export function repath(z, goalTile) {
  const path = findPath(tileOf(z), goalTile, canStep);
  z.path = path || [];
  z.pathFailed = path === null;
  z.lastGoal = goalTile;
  z.repathTimer = z.pathFailed ? REPATH_FAIL_BACKOFF : ZOMBIE_REPATH;
}

export function followPath(z, dt, others) {
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
  const sx = z.gx;
  const sy = z.gy;
  const moved = moveCircle(z.gx, z.gy, z.radius, (dx / d) * step, (dy / d) * step);
  z.gx = moved.gx;
  z.gy = moved.gy;
  separate(z, dt, others);
  // No progress for a while (a trunk, another body in a gap): drop the path
  // rather than bounce on the spot (Michael, 2026-10-10). Progress is measured
  // after the push that keeps bodies apart, or a walker pressed against someone
  // steps forward, is shoved back, and never looks stuck (Michael, 2026-10-12:
  // two villagers walking into the player for good).
  const gained = Math.hypot(z.gx - sx, z.gy - sy);
  z.stuckTime = gained < step * 0.25 ? z.stuckTime + dt : 0;
  if (z.stuckTime > STUCK_TIME) {
    z.stuckTime = 0;
    z.path = [];
    z.lastGoal = null;
    z.repathTimer = REPATH_FAIL_BACKOFF;
    return true;
  }
  return false;
}

export function separate(z, dt, others) {
  let px = 0;
  let py = 0;
  for (const o of others) {
    if (o === z || o.dead || o.state === "down") continue; // the fallen and the dead block nothing (docs/14)
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

// A walkable tile near (x, y) on the same side of the walls as `room`: a
// zombie outside a cottage searching for someone seen inside walks the yard,
// not into the wall (Michael, 2026-10-10: pacing at the window).
export function pickTargetAround(x, y, radius, room = 0) {
  for (let tries = 0; tries < 12; tries++) {
    const tx = Math.round(x) + Math.floor(Math.random() * (radius * 2 + 1)) - radius;
    const ty = Math.round(y) + Math.floor(Math.random() * (radius * 2 + 1)) - radius;
    if (isWalkableTile(tx, ty) && tileAt(tx, ty).room === room) return [tx, ty];
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
  z.target = null;
  z.lastSeen = null;
  z.path = [];
  z.lastGoal = null;
  z.idleTimer = WANDER_IDLE_MIN + Math.random() * (WANDER_IDLE_MAX - WANDER_IDLE_MIN);
}

export function updateZombie(z, dt, player, others, villagers = null) {
  const sheet = getSheet(z.sprite);
  if (z.dead) {
    // The fall plays out and holds; a corpse thinks no more (docs/14).
    if (z.knock) updateHurt(z, dt, sheet);
    advanceAnimation(z.anim, sheet, dt);
    return;
  }
  // A groan now and then, from the living dead only (a corpse is silent).
  z.groanTimer -= dt;
  if (z.groanTimer <= 0) {
    if (!isDown(z)) say(z, GROAN_TEXT);
    z.groanTimer = GROAN_MIN + Math.random() * (GROAN_MAX - GROAN_MIN);
  }
  if (updateHurt(z, dt, sheet)) return;
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
  z.sincePlayer += dt;
  if (z.sightTimer <= 0) {
    z.sightTimer = SIGHT_CHECK;
    z.seesNow = canSee(z, player);
    z.target = null;
    if (z.seesNow) {
      z.target = player;
      z.aggro = true;
      z.lastSeen = [player.gx, player.gy];
      z.sincePlayer = 0;
    } else {
      // The player first, always; failing that, with the setting on, the
      // nearest villager in sight, hunted the same way (memory and all).
      const prey = nearestPrey(z, villagers);
      if (prey) {
        z.target = prey;
        z.seesNow = true;
        z.aggro = true;
        z.lastSeen = [prey.gx, prey.gy];
        if (z.state === "search") {
          z.state = "chase";
          z.repathTimer = 0;
        }
      } else if (z.sincePlayer > FLAME_PATIENCE) {
        // A flame only takes over once the player has been out of sight a while,
        // so a zombie you just pulled off a window does not turn straight back.
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
  }
  // A target that died (a villager, bitten through) is no longer seen.
  if (z.target && z.target.dead) {
    z.target = null;
    z.seesNow = false;
  }
  const tgt = z.target || player;
  if (z.aggro && !z.lastSeen) z.lastSeen = [player.gx, player.gy]; // spawned aggro

  switch (z.state) {
    case "idle": {
      playAnimation(z.anim, "idle");
      z.idleTimer -= dt;
      if (z.aggro) {
        z.state = "chase";
        z.repathTimer = 0;
      } else if (z.idleTimer <= 0) {
        const target = pickTargetAround(z.gx, z.gy, 3, roomOf(z));
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
      const d = distTo(z, tgt);
      if (d <= ZOMBIE_CONTACT && z.seesNow) {
        z.path = [];
        faceToward(z, tgt.gx - z.gx, tgt.gy - z.gy);
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
      let goal = z.seesNow ? tileOf(tgt) : [Math.round(z.lastSeen[0]), Math.round(z.lastSeen[1])];
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
      if (z.seesNow && distTo(z, tgt) <= ZOMBIE_CONTACT) {
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
          const target = pickTargetAround(z.lastSeen[0], z.lastSeen[1], SEARCH_RADIUS, roomOf(z));
          if (target) repath(z, target);
          z.idleTimer = 0.8 + Math.random() * 1.2;
        }
      }
      break;
    }
    case "attack": {
      if (isActiveFrame(z.anim, sheet) && !z.attackHit) {
        z.attackHit = true;
        if (distTo(z, tgt) <= ZOMBIE_CONTACT + 0.2 && lineOfSight(z.gx, z.gy, tgt.gx, tgt.gy)) {
          if (tgt === player) emit("playerHit", { zombie: z, damage: ZOMBIE_DAMAGE });
          else emit("villagerHit", { zombie: z, villager: tgt, damage: ZOMBIE_DAMAGE });
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
