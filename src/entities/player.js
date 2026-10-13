// The player. Copied from cozy-zombie-game src/entities/player.js on 2026-10-09
// and cut down for the probe: movement, sprint, aim, animation. Hunger, thirst,
// flashlight, and auto-walk come back with their own milestones.

import * as iso from "../iso.js";
import { moveCircle, canStep, floorSpeedAt, propById, roomAt } from "../map.js";
import { findPath } from "../pathfind.js";
import { getSheet, getDef } from "../assets.js";
import { createAnimation, playAnimation, advanceAnimation } from "../sprites.js";
import { createCharacter } from "./character.js";
import { rules } from "../rules.js";
import { player as T } from "../tuning.js";
import { tiredStage, hungerStage, thirstStage } from "../moodles.js";
import { stacks as bleedStacks } from "../bleed.js";
import * as verbs from "../verbs.js";
import { setTimeScale, nextId } from "../world.js";
import * as clock from "../clock.js";
import * as loop from "../loop.js";
import { emit } from "../events.js";


export function createPlayer(gx, gy, { id = null } = {}) {
  return {
    // The id from the world's counter (docs/31/05, item 4): never the literal "player", which a second one would share.
    ...createCharacter("player", gx, gy, { id: id || nextId("P"), speed: T.speed, radius: T.radius, hp: T.hp }),
    // The shared player sheet until a client bakes this one's own (main.js refreshFigure names it player_<id>; docs/31/05, item 5).
    sprite: "player",
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
    tired: T.tiredMax, // tiredness (docs/30, 3.3): drains awake, restored asleep, never kills
    maxTired: T.tiredMax,
    sleeping: null, // { bed: a prop id, since: sim seconds, hour } while asleep in a bed
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
    draw: null, // { t, c, source }: a bow or a throw drawn (archery.js; docs/31/05 item 12: on the player, so two can draw)
    recover: 0, // seconds after a shot before the next draw
    aimOverride: null, // [gx, gy]: scripts and tests aim here instead of the cursor
    marker: null, // { from, full, land }: where the draw would land, for this player's own client
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

// Hunger, thirst, and tiredness drain (docs/30, section 3); hunger and thirst
// kill at zero, tiredness never does. The Survival setting turns all of it off
// (Michael, 2026-10-10 late): off, nothing drains and the needs stay full, so
// the moodles never show. Health comes back slowly while fed and watered and
// nothing bleeds, faster asleep, not at all when falling asleep on your feet.
function updateNeeds(player, dt) {
  if (!rules.survival) {
    player.hunger = player.maxHunger ?? T.hungerMax;
    player.thirst = player.maxThirst ?? T.thirstMax;
    player.tired = player.maxTired ?? T.tiredMax;
    return;
  }
  player.hunger = Math.max(0, player.hunger - (T.hungerMax / T.hungerDrainSeconds) * dt);
  player.thirst = Math.max(0, player.thirst - (T.thirstMax / T.thirstDrainSeconds) * dt);
  if (player.sleeping) player.tired = Math.min(player.maxTired, player.tired + (T.tiredMax / T.sleepRestoreSeconds) * dt);
  else player.tired = Math.max(0, player.tired - (T.tiredMax / T.tiredDrainSeconds) * dt);
  if (player.hunger <= 0) player.hp = Math.max(0, player.hp - T.starveDamage * dt);
  if (player.thirst <= 0) player.hp = Math.max(0, player.hp - T.dehydrateDamage * dt);
  // Regeneration (docs/30, 3.4).
  const fed = hungerStage(player) < 2 && thirstStage(player) < 2;
  if (player.hp > 0 && player.hp < player.maxHp && fed && bleedStacks(player) === 0 && tiredStage(player) < 4) {
    const perMinute = player.sleeping ? T.sleepRegenPerMinute : T.healthRegenPerMinute;
    player.hp = Math.min(player.maxHp, player.hp + (perMinute / 60) * dt);
  }
}

// How fast stamina comes back, by the needs (docs/30, 3.2 and 3.3): halved past
// "hungry" or "thirsty", three quarters past "tired".
export function staminaRegenMult(player) {
  let k = 1;
  if (hungerStage(player) >= 3 || thirstStage(player) >= 3) k *= T.needsStaminaRegenMult;
  if (tiredStage(player) >= 2) k *= T.tiredStaminaRegenMult;
  return k;
}

// ---- sleep (docs/30, 3.3; docs/31/08, habits 4 and 6) ----
// Only in a bed, indoors. The world's time scale rises and the whole simulation
// runs fast: the dead walk, fires burn down, crops grow; the sleeper is never
// woken (Michael's ruling) and gets up when rested and it is morning, whichever
// is later. A verb in the table, so a menu entry, a key, or a command queue
// all go through one door. (distToTiles is the auto-walk's, above.)

// The world's time scale is the world's, not one sleeper's (Michael, 2026-10-13: in a world with friends in it,
// sleep is optional, and time skips only when every living player in it is in bed). game.js hands in the rule
// (`scaleNow`: the speed the world should run at, given who is asleep); a lone player is "everyone".
let scaleNow = () => T.sleepTimeScale;
export function setSleepScaleRule(fn) {
  scaleNow = fn;
}

export function startSleep(player, bed) {
  player.sleeping = { bed: bed.id, since: loop.simTime(), hour: clock.getHour() };
  player.moving = false;
  player.sprinting = false;
  player.auto = null;
  player.action = null;
  setTimeScale(scaleNow());
  emit("sleepStart", { who: player.id, bed: bed.id });
}

export function wake(player) {
  const s = player.sleeping;
  if (!s) return;
  const hours = (loop.simTime() - s.since) / 30; // thirty real seconds a game hour (map.HOUR_SECONDS)
  player.sleeping = null;
  setTimeScale(scaleNow());
  emit("sleepEnd", { who: player.id, bed: s.bed, hours: Math.round(hours * 10) / 10 });
}

function updateSleep(player, dt) {
  updateNeeds(player, dt);
  const rested = player.tired >= player.maxTired;
  const h = clock.getHour();
  const morning = h >= T.wakeHour && h < 22;
  if (rested && morning) wake(player);
  else if (!propById(player.sleeping.bed)) wake(player); // the bed is gone from under you
}

verbs.define("sleep", {
  validate(world, player, target) {
    const bed = propById(target.prop);
    if (!bed) return "That bed is gone.";
    if (!getDef(bed.sprite).sleep) return "You cannot sleep on that.";
    if (player.sleeping) return "You are asleep.";
    if (player.carrying) return "Your hands are full.";
    if (distToTiles(player, bed.tiles) > 1.6) return "Too far from the bed.";
    if (roomAt(bed.tile[0], bed.tile[1]) === 0) return "Not out here.";
    const h = clock.getHour();
    if (tiredStage(player) === 0 && h >= T.wakeHour && h < 20) return "You are not tired.";
    return true;
  },
  perform(world, player, target) {
    startSleep(player, propById(target.prop));
    return { ok: true };
  },
});

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
    const step = Math.min(d, player.speed * (player.sprinting ? T.sprintMult : 1) * (player.moveMult ?? 1) * floorSpeedAt(player.gx, player.gy) * dt);
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
  const step = player.speed * mult * floorSpeedAt(player.gx, player.gy) * dt; // shallow water slows everyone (docs/30, law 8)
  const moved = moveCircle(player.gx, player.gy, player.radius, n.x * step, n.y * step);
  player.gx = moved.gx;
  player.gy = moved.gy;
}

// `snap` is this player's input for the step (docs/31/05, item 16): `axis` {x, y}
// in screen directions, `sprint`, and `mouse` in the client's world pixels (null
// for a player whose client is not here: they stand, facing as they were).
const IDLE = { axis: { x: 0, y: 0 }, sprint: false, mouse: null };

export function updatePlayer(player, dt, snap = IDLE) {
  const sheet = getSheet(player.sprite);

  if (player.climb) {
    updateClimb(player, dt);
    playAnimation(player.anim, "walk");
    advanceAnimation(player.anim, sheet, dt);
    return;
  }

  // Asleep: nothing moves the sleeper; the needs and the night run on. (The rig has no lying
  // pose yet; the sleeper stands by the bed until the art pass gives it one.)
  if (player.sleeping) {
    updateSleep(player, dt);
    playAnimation(player.anim, "idle");
    advanceAnimation(player.anim, sheet, dt);
    return;
  }

  updateNeeds(player, dt);

  // Keys snap to the eight iso directions, so a diagonal key walks along a wall.
  // Any key cancels an auto-walk.
  const axis = snap.axis || IDLE.axis;
  player.moving = axis.x !== 0 || axis.y !== 0;
  if (player.moving) player.auto = null;

  const wantSprint = !!snap.sprint;
  if (player.winded && player.stamina >= T.sprintRecoverAt) player.winded = false;
  const anyMovement = player.moving || !!player.auto;
  player.sprinting = wantSprint && anyMovement && !player.winded && player.stamina > 0 && !player.carrying && !player.blocking && tiredStage(player) < 3; // exhausted: no sprint (docs/30, 3.3)
  if (player.sprinting) {
    player.stamina = Math.max(0, player.stamina - T.sprintDrain * dt);
    if (player.stamina <= 0) player.winded = true;
  } else if (!player.blocking) {
    // Nothing comes back while the guard is up (docs/21): each block spends it, so the guard is finite.
    player.stamina = Math.min(player.maxStamina, player.stamina + T.staminaRegen * staminaRegenMult(player) * dt);
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
  // The aim is the cursor relative to the chest; a client not here sends that vector as `aim`, since
  // its cursor is in its own view's pixels and means nothing in another's (docs/31/05, item 16).
  const m = snap.mouse;
  const o = m ? aimOrigin(player) : null;
  const ax = snap.aim ? snap.aim.x : m ? m.x - o.x : 0;
  const ay = snap.aim ? snap.aim.y : m ? m.y - o.y : 0;
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
