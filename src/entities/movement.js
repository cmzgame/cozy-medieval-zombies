// Walking, shared by the dead and the villagers (docs/23a, D7; before this the
// villagers imported it from zombie.js): facing, paths, following one, keeping
// bodies apart, and picking a tile to wander to. Every roll is the sim's
// generator's (rng.js). The numbers are the dead's in tuning.js, which the
// villagers share.

import * as iso from "../iso.js";
import { moveCircle, isWalkableTile, canStep, tileAt, roomAt, floorSpeedAt } from "../map.js";
import { findPath } from "../pathfind.js";
import * as rng from "../rng.js";
import { zombie as T } from "../tuning.js";

// How long the dead (and villagers) stand before wandering again; one place, one roll (docs/23a, E).
export function idleTime() {
  return rng.range(T.wanderIdleMin, T.wanderIdleMax);
}

// The room a character is standing in (0 outdoors).
export function roomOf(e) {
  return tileAt(Math.round(e.gx), Math.round(e.gy)).room;
}

export function tileOf(e) {
  return [Math.round(e.gx), Math.round(e.gy)];
}

export function faceToward(e, dx, dy) {
  if (dx === 0 && dy === 0) return;
  const s = iso.gridDirToScreen(dx, dy);
  e.facing = iso.facingFromScreenVector(s.sx, s.sy);
}

// Whether a body can walk from where it stands to a tile (a path exists as things are now: doors shut or boarded stop it).
export function canReach(e, tile) {
  return findPath(tileOf(e), tile, canStep) !== null;
}

export function repath(e, goalTile) {
  const path = findPath(tileOf(e), goalTile, canStep);
  e.path = path || [];
  e.pathFailed = path === null;
  e.lastGoal = goalTile;
  e.repathTimer = e.pathFailed ? T.repathFailBackoff : T.repath;
}

export function followPath(e, dt, others) {
  if (!e.path.length) return true;
  const [tx, ty] = e.path[0];
  const dx = tx - e.gx;
  const dy = ty - e.gy;
  const d = Math.hypot(dx, dy);
  if (d < 0.08) {
    e.path.shift();
    return e.path.length === 0;
  }
  const step = Math.min(d, e.speed * floorSpeedAt(e.gx, e.gy) * dt); // shallow water slows everyone (docs/30, law 8)
  faceToward(e, dx, dy);
  const sx = e.gx;
  const sy = e.gy;
  const moved = moveCircle(e.gx, e.gy, e.radius, (dx / d) * step, (dy / d) * step);
  e.gx = moved.gx;
  e.gy = moved.gy;
  separate(e, dt, others);
  // No progress for a while (a trunk, another body in a gap): drop the path
  // rather than bounce on the spot (Michael, 2026-10-10). Progress is measured
  // after the push that keeps bodies apart, or a walker pressed against someone
  // steps forward, is shoved back, and never looks stuck (Michael, 2026-10-12:
  // two villagers walking into the player for good).
  const gained = Math.hypot(e.gx - sx, e.gy - sy);
  e.stuckTime = gained < step * 0.25 ? e.stuckTime + dt : 0;
  if (e.stuckTime > T.stuckTime) {
    e.stuckTime = 0;
    e.path = [];
    e.lastGoal = null;
    e.repathTimer = T.repathFailBackoff;
    return true;
  }
  return false;
}

export function separate(e, dt, others) {
  let px = 0;
  let py = 0;
  for (const o of others) {
    if (o === e || o.dead || o.state === "down") continue; // the fallen and the dead block nothing (docs/14)
    const dx = e.gx - o.gx;
    const dy = e.gy - o.gy;
    const d = Math.hypot(dx, dy);
    if (d > 0 && d < T.separation) {
      const f = (T.separation - d) / T.separation;
      px += (dx / d) * f;
      py += (dy / d) * f;
    } else if (d === 0) {
      px += rng.float() - 0.5;
      py += rng.float() - 0.5;
    }
  }
  if (px !== 0 || py !== 0) {
    const moved = moveCircle(e.gx, e.gy, e.radius, px * dt * 2, py * dt * 2);
    e.gx = moved.gx;
    e.gy = moved.gy;
  }
}

// A walkable tile near (x, y) on the same side of the walls as `room`: a
// zombie outside a cottage searching for someone seen inside walks the yard,
// not into the wall (Michael, 2026-10-10: pacing at the window).
export function pickTargetAround(x, y, radius, room = 0) {
  for (let tries = 0; tries < 12; tries++) {
    const tx = Math.round(x) + rng.int(radius * 2 + 1) - radius;
    const ty = Math.round(y) + rng.int(radius * 2 + 1) - radius;
    if (isWalkableTile(tx, ty) && roomAt(tx, ty) === room) return [tx, ty]; // refinds the rooms if a wall changed (docs/23a, A5)
  }
  return null;
}
