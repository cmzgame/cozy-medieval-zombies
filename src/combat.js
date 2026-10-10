// Melee (docs/14-combat.md). Ported from cozy-zombie-game src/combat.js and its
// docs/22-melee.md, "Melee that lands", for the reasons it gives, with this
// game's numbers and the figure's rig.
//
// The rule that makes it legible, in three parts:
//   1. The shape that is drawn is the shape that is tested: the wedge on the
//      floor (wedgePolygon) is the hit test (inWedge), in one place.
//   2. The body is hit, not the feet: a zombie whose sprite overlaps the wedge
//      is in it, because samples run up its body and a zombie drawn below the
//      player gets slack, its head on the player's legs well before its feet.
//   3. The swing is never lost: it resolves on the click. The arm's animation
//      is a picture of a decision already made.

import * as iso from "./iso.js";
import * as items from "./items.js";
import * as loop from "./loop.js";
import * as camera from "./camera.js";
import * as settings from "./settings.js";
import { emit } from "./events.js";
import { playAnimation } from "./sprites.js";
import { aimOrigin } from "./entities/player.js";
import { damageZombie, isDown } from "./entities/zombie.js";

// Tunables (docs/14).
export const POINT_BLANK = 0.55; // tiles: this close is always hit
export const BODY_SLACK = 0.8; // tiles of extra reach for a zombie drawn below the player
export const BODY_TOP = 48; // px: a figure's height, for scaling the slack
// A figure's drawn body with its arms is about this wide on each side of its middle.
export const BODY_HALF_W = 10;
// Heights of the samples up a body, feet to chest. The head is left out: counting
// it lets a swing straight up-screen catch a zombie standing fully beside you.
export const BODY_SAMPLES = [2, 10, 18, 26, 34];
export const KNOCKDOWN_CHANCE = 0.3;
export const COMBO_HITS = 3; // the third hit on one zombie floors it
export const COMBO_WINDOW = 2; // seconds
export const FINISHER_MULT = 2; // a hit on a downed zombie
export const HIT_STOP = 0.045;
export const HIT_STOP_KILL = 0.09;
export const KICK_PX = 3;
export const KICK_TIME = 0.08;
export const WEDGE_TIME = 0.12;
const TIRED_DAMAGE = 0.5; // a swing at zero stamina still lands, at half

export const FISTS = { damage: 6, range: 0.9, arc: 100, swing: 0.4, knockback: 0.17, stamina: 3, knockdown: 0, style: "one_handed" };
export const SHOVE = { range: 1.0, arc: 100, knockback: 0.53, knockbackChance: 1, stagger: 0.6, knockdown: 0.25, stamina: 5, cooldown: 0.45 };

// The numbers that belong to no item, from data/combat.json (fists and the
// shove). Merged in place, so `weaponOf(player) !== FISTS` keeps working.
export function setCombatData(data) {
  if (!data) return;
  Object.assign(FISTS, data.fists || {});
  Object.assign(SHOVE, data.shove || {});
}

let time = 0; // combat's own clock, for the combo window
const fx = { wedge: null, kick: null };

// What the main-hand item does as a weapon, else fists.
export function weaponOf(player) {
  const e = player.hands.main;
  const def = e && items.getItem(e.id);
  return def && def.weapon ? def.weapon : FISTS;
}

export function holdsWeapon(player) {
  return weaponOf(player) !== FISTS;
}

// The zombies a blow reaches: everything in the wedge, or only the nearest one
// when multi-hit is off (the setting, or the weapon's own `multiHit: false`).
function targetsIn(player, weapon, zombies, accept = () => true) {
  const list = zombies.filter((z) => !z.dead && accept(z) && inWedge(player, weapon, z));
  const multi = settings.get("multiHit") && weapon.multiHit !== false;
  if (multi || list.length < 2) return list;
  const d = (z) => Math.hypot(z.gx - player.gx, z.gy - player.gy);
  list.sort((a, b) => d(a) - d(b));
  return [list[0]];
}

// Whether a blow pushes at all: the weapon's `knockbackChance` (default always).
function pushes(weapon) {
  return Math.random() < (weapon.knockbackChance ?? 1);
}

// What the player cannot swing through: carrying furniture, a climb, a timed
// action under way, or being dead.
// `ignoreAction` is for the outline, which is shown while a timed action runs.
function canAct(player, ignoreAction = false) {
  return !player.carrying && !player.climb && (ignoreAction || !player.action) && !player.dead && player.hp > 0;
}

function screenAngleBetween(ax, ay, bx, by) {
  return Math.abs(Math.atan2(ax * by - ay * bx, ax * bx + ay * by));
}

// ---- the wedge: drawn and tested ----

// Is the zombie inside the swing wedge? Reach is a grid circle of `range`
// tiles around the player's feet, plus slack for a zombie drawn below them (up
// to BODY_SLACK when its feet are a full body height lower on screen). The arc
// is measured in screen space from the chest against sample points up the
// zombie's body, so a sprite inside the drawn wedge is hit. Point blank always hits.
export function inWedge(player, weapon, z) {
  const feet = Math.hypot(z.gx - player.gx, z.gy - player.gy);
  if (feet <= POINT_BLANK) return true;
  const pf = iso.toScreen(player.gx, player.gy);
  const zs = iso.toScreen(z.gx, z.gy);
  const slack = Math.max(0, Math.min(1, (zs.y - pf.y) / BODY_TOP)) * BODY_SLACK;
  if (feet > weapon.range + slack + 1e-6) return false; // inclusive: a zombie exactly at reach is in reach
  const half = (weapon.arc * Math.PI) / 180 / 2;
  const o = aimOrigin(player);
  for (const sy of BODY_SAMPLES) {
    for (const dx of [-BODY_HALF_W, 0, BODY_HALF_W]) {
      const vx = zs.x + dx - o.x;
      const vy = zs.y - sy - o.y;
      if (vx === 0 && vy === 0) return true;
      if (screenAngleBetween(player.aim.sx, player.aim.sy, vx, vy) <= half) return true;
    }
  }
  return false;
}

// The samples of a zombie's body on screen, for the hit-shape overlay.
export function bodySamples(z) {
  const zs = iso.toScreen(z.gx, z.gy);
  const out = [];
  for (const sy of BODY_SAMPLES) for (const dx of [-BODY_HALF_W, 0, BODY_HALF_W]) out.push([Math.round(zs.x + dx), Math.round(zs.y - sy)]);
  return out;
}

// The floor shape of a swing, as screen points from the feet: the ground
// circle of `range` tiles, cut to the arc that is measured from the chest.
// Walked from the aim direction outward so the points come out in order.
export function wedgePolygon(player, weapon, range = weapon.range, arc = weapon.arc) {
  const half = (arc * Math.PI) / 180 / 2;
  const o = aimOrigin(player);
  const feet = iso.toScreen(player.gx, player.gy);
  const g = iso.screenDirToGrid(player.aim.sx, player.aim.sy);
  const theta0 = Math.atan2(g.gy, g.gx);
  const pts = [[feet.x, feet.y]];
  const STEPS = 72;
  for (let i = -STEPS / 2; i <= STEPS / 2; i++) {
    const th = theta0 + (i / STEPS) * Math.PI;
    const p = iso.toScreen(player.gx + Math.cos(th) * range, player.gy + Math.sin(th) * range);
    if (screenAngleBetween(player.aim.sx, player.aim.sy, p.x - o.x, p.y - o.y) <= half) pts.push([p.x, p.y]);
  }
  return pts;
}

// ---- swinging ----

function gridAim(player) {
  const g = iso.screenDirToGrid(player.aim.sx, player.aim.sy);
  return iso.normalize(g.gx, g.gy);
}

function kick(player) {
  const n = Math.hypot(player.aim.sx, player.aim.sy) || 1;
  const x = (player.aim.sx / n) * KICK_PX;
  const y = (player.aim.sy / n) * KICK_PX;
  fx.kick = { x, y, ttl: KICK_TIME };
  camera.kick(x, y, KICK_TIME);
}

// The left click. The swing resolves now, on the click: the cooldown is the
// only rate limit, and an interrupted animation cannot lose it. Returns the
// zombies hit, or null if nothing was swung.
export function tryAttack(player, zombies) {
  if (!canAct(player) || (player.attackCooldown || 0) > 0) return null;
  const weapon = weaponOf(player);
  // A swing at zero stamina still lands, at half damage: never locked out of hitting.
  const tired = player.stamina <= 0;
  player.stamina = Math.max(0, player.stamina - weapon.stamina);
  if (player.stamina <= 0) player.winded = true;
  player.attackCooldown = weapon.swing;
  playAnimation(player.anim, "attack", true);
  fx.wedge = { ttl: WEDGE_TIME, points: wedgePolygon(player, weapon) };
  emit("meleeSwing", { player, weapon });

  const dir = gridAim(player);
  const hit = [];
  let killed = false;
  for (const z of targetsIn(player, weapon, zombies)) {
    hit.push(z);
    const finisher = isDown(z);
    // The third hit within the window always floors it; fists never do.
    let combo = false;
    if (!finisher) {
      z.hits = (z.hits || []).filter((t) => time - t <= COMBO_WINDOW);
      z.hits.push(time);
      if (z.hits.length >= COMBO_HITS && weapon.knockdown !== 0) {
        combo = true;
        z.hits = [];
      }
    }
    const chance = weapon.knockdown ?? KNOCKDOWN_CHANCE;
    const knockdown = !finisher && (combo || Math.random() < chance);
    const amount = Math.round(weapon.damage * (tired ? TIRED_DAMAGE : 1) * (finisher ? FINISHER_MULT : 1));
    const push = !finisher && pushes(weapon) ? weapon.knockback : 0;
    const r = damageZombie(z, amount, { dir: [dir.x, dir.y], knockback: push, knockdown, stagger: weapon.stagger, from: [player.gx, player.gy] });
    if (r.killed) killed = true;
  }
  if (hit.length) {
    loop.freeze(killed ? HIT_STOP_KILL : HIT_STOP);
    kick(player);
    emit("meleeHit", { count: hit.length, killed });
  }
  return hit;
}

// Space: no damage, a strong push, a stagger, sometimes a knockdown. Works with
// anything in the hands, or nothing.
export function tryShove(player, zombies) {
  if (!canAct(player) || (player.shoveCooldown || 0) > 0) return null;
  player.shoveCooldown = SHOVE.cooldown;
  player.stamina = Math.max(0, player.stamina - SHOVE.stamina);
  if (player.stamina <= 0) player.winded = true;
  playAnimation(player.anim, "attack", true);
  fx.wedge = { ttl: WEDGE_TIME, points: wedgePolygon(player, SHOVE) };
  const dir = gridAim(player);
  const hit = [];
  for (const z of targetsIn(player, SHOVE, zombies, (z) => !isDown(z))) {
    hit.push(z);
    damageZombie(z, 0, { dir: [dir.x, dir.y], knockback: pushes(SHOVE) ? SHOVE.knockback : 0, knockdown: Math.random() < SHOVE.knockdown, stagger: SHOVE.stagger, from: [player.gx, player.gy] });
  }
  emit("shove", { count: hit.length });
  if (hit.length) {
    loop.freeze(HIT_STOP * 0.6);
    kick(player);
  }
  return hit;
}

// The zombies the next swing would hit, by the very test the swing uses, and
// without the cooldown: green means the swing would land (docs/14, "Swing
// targets"). Empty while the player cannot swing.
export function swingTargets(player, zombies) {
  if (!canAct(player, true)) return [];
  const w = weaponOf(player);
  const near = zombies.filter((z) => Math.abs(z.gx - player.gx) <= w.range + BODY_SLACK + 1 && Math.abs(z.gy - player.gy) <= w.range + BODY_SLACK + 1);
  return targetsIn(player, w, near);
}

// Flag each zombie for the renderer's outline: `on` marks the targets, else clears.
export function markTargets(player, zombies, on) {
  const hit = on ? new Set(swingTargets(player, zombies)) : null;
  for (const z of zombies) z.swingTarget = !!hit && hit.has(z);
}

// Each logic step: cooldowns and the effects' timers.
export function updateCombat(player, zombies, dt) {
  time += dt;
  player.attackCooldown = Math.max(0, (player.attackCooldown || 0) - dt);
  player.shoveCooldown = Math.max(0, (player.shoveCooldown || 0) - dt);
  if (fx.wedge) {
    fx.wedge.ttl -= dt;
    if (fx.wedge.ttl <= 0) fx.wedge = null;
  }
  if (fx.kick) {
    fx.kick.ttl -= dt;
    if (fx.kick.ttl <= 0) fx.kick = null;
  }
}

// What the feedback layer shows right now: the wedge, the kick, the freeze.
export function effects() {
  return { wedge: fx.wedge, kick: fx.kick, hitStop: loop.getFreeze() };
}

// What the renderer draws for the hit shapes: the swing's wedge for a moment
// after a swing, and, with the Show hit shapes setting on and a weapon held,
// the wedge always and the body samples of the dead nearby, green for those in it.
export function overlays(player, zombies, showShapes) {
  let wedge = fx.wedge ? fx.wedge.points : null;
  const dots = [];
  if (showShapes && holdsWeapon(player) && !player.dead) {
    const w = weaponOf(player);
    if (!wedge) wedge = wedgePolygon(player, w);
    for (const z of zombies) {
      if (z.dead || Math.abs(z.gx - player.gx) > 6 || Math.abs(z.gy - player.gy) > 6) continue;
      const hit = inWedge(player, w, z);
      for (const [x, y] of bodySamples(z)) dots.push([x, y, hit]);
    }
  }
  if (!wedge && !dots.length) return null;
  return { wedge, dots, world: [player.gx, player.gy] };
}
