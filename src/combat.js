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
import { setInfectionData } from "./infection.js";
import { setBleedData } from "./bleed.js";
import * as burn from "./burn.js";
import { lineOfReach } from "./visibility.js";
import * as items from "./items.js";
import * as loop from "./loop.js";
import { emit } from "./events.js";
import { playAnimation } from "./sprites.js";
import { getSheet } from "./assets.js";
import { aimOrigin } from "./entities/player.js";
import { damageZombie, isDown, staggerZombie, STAGGER_RULES } from "./entities/zombie.js";
import * as rng from "./rng.js";
import { rules } from "./rules.js";
import { detach } from "./inventory.js"; // a worn-out weapon leaves the hand (docs/30, 5.2)
import * as animals from "./entities/animal.js"; // the blows that reach an animal (docs/45 section 2)
import * as poison from "./poison.js"; // a blade's coat, spent by a swing that lands and poisoning every body it strikes (docs/47 section 6)

// Tunables (docs/14).
// The blow's own numbers (the wiki census, 2026-10-15: combat numbers are data): `data/combat.json` `blow` fills
// these, the code keeping the same defaults. pointBlank: tiles this close are always hit; knockdownChance: the share
// of hits that floor the dead for a weapon with no `knockdown` of its own (0 since docs/41 step 3: knockdown is the
// game's crit, earned by the mace, the halberd's thrust, and the shove alone);
// tiredDamage: a swing the bar cannot pay for (stamina below its cost; docs/41, step 4) still lands, at this share; hitStop, hitStopKill: the freeze on a hit and a kill;
// swingMove: the walk's share while the swing's animation plays, the commitment to a swing (docs/41, step 1).
export const BLOW = { pointBlank: 0.55, knockdownChance: 0, tiredDamage: 0.5, hitStop: 0.07, hitStopKill: 0.12, swingMove: 0.6 };
export const BODY_SLACK = 0.8; // tiles of extra reach for a zombie drawn below the player
export const BODY_TOP = 48; // px: a figure's height, for scaling the slack
// A figure's drawn body with its arms is about this wide on each side of its middle.
export const BODY_HALF_W = 10;
// Heights of the samples up a body, feet to chest. The head is left out: counting
// it lets a swing straight up-screen catch a zombie standing fully beside you.
export const BODY_SAMPLES = [2, 10, 18, 26, 34];
// The combo and the finisher, from data/combat.json (setCombatData): `enabled` false switches the
// third-hit rule off for testing without removing it (Michael, 2026-10-12), `mult` is what a blow
// on a downed zombie is multiplied by.
export const COMBO = { enabled: true, hits: 3, window: 2 }; // the third hit on one zombie within `window` seconds floors it
export const FINISHER = { mult: 2 };
export const KICK_PX = 3;
export const KICK_TIME = 0.08;

export const FISTS = { damage: 6, range: 0.9, arc: 100, swing: 0.4, knockback: 0.17, stamina: 4, knockdown: 0, style: "one_handed" };
// Dual wielding (docs/21): the off hand's swing, and what it costs. Filled from data/combat.json.
export const DUAL = { offDamage: 1, window: 2.5, lockout: 0.45, front: 1.5, side: 2.5, behind: 100, arc: 100, sideArc: 220 };
// The shove (docs/41, step 2): the crowd tool. `targets` is how many of the dead one shove reaches whatever the Multi-hit
// setting; `cooldown` is also the recovery, in which no swing starts.
export const SHOVE = { range: 1.0, arc: 100, knockback: 0.65, knockbackChance: 1, stagger: 0.8, knockdown: 0.1, stamina: 15, cooldown: 0.5, targets: 3, tiredPush: 0.7 };

// The numbers that belong to no item, from data/combat.json (fists and the
// shove). Merged in place, so `weaponOf(player) !== FISTS` keeps working.
export function setCombatData(data) {
  if (!data) return;
  Object.assign(FISTS, data.fists || {});
  Object.assign(SHOVE, data.shove || {});
  Object.assign(DUAL, data.dual || {});
  Object.assign(COMBO, data.combo || {});
  Object.assign(STAGGER_RULES, data.stagger || {});
  setInfectionData(data.infection);
  setBleedData(data.bleed);
  burn.setBurnData(data.burn);
  poison.setPoisonData(data.poison);
  Object.assign(FINISHER, data.finisher || {});
  Object.assign(BLOW, data.blow || {});
}

// The combo window reads the sim's clock (loop.simTime), not a clock of this module's advanced per
// player (docs/31/05, item 13); the kick is an event the owning client answers with its camera.

// What the main-hand item does as a weapon, else fists; null for a potion or a poison (docs/47 section 7), held to throw from the
// other mode, never to swing: the left button does nothing with one in the main hand, not even a fist (combat.swingFromLeft, tryAttack).
export function weaponOf(player) {
  const e = player.hands.main;
  const def = e && items.getItem(e.id);
  if (def && (def.potion || def.poison)) return null;
  return def && def.weapon ? def.weapon : FISTS;
}

// The main hand's other melee mode, the middle button's (docs/21): the weapon's `alt` block laid
// over its own numbers, or null. The halberd's thrust.
// The swing style the figure draws from (docs/14), by what the main hand holds:
// a thrown weapon's own style while it is being thrown, else its weapon's, a bow's, or a thrown one's.
export function styleOf(player, throwing = false) {
  const def = player.hands.main && items.getItem(player.hands.main.id);
  if (!def) return null;
  // A staff and a spellbook held together cast (docs/24): the pose follows the main hand's (`castStyle`: the staff
  // raised, or the book held out with the staff raised in the other hand; docs/32 item 3, 2026-10-15).
  const offE = player.hands.off;
  const off = offE && offE !== player.hands.main ? items.getItem(offE.id) : null;
  if (def.castStyle && off && ((def.staff && off.book && off.book.spell) || (def.book && def.book.spell && off.staff))) return def.castStyle;
  return (throwing && def.thrown && def.thrown.style) || (def.weapon && def.weapon.style) || (def.bow && def.bow.style) || (def.thrown && def.thrown.style) || null;
}

// The style of the main hand's other attack, when its `alt` names one (docs/32, item 2: the halberd's thrust):
// the figure's `attack_alt` animation is drawn from it, and only a sheet that has it plays it.
export function altStyleOf(player) {
  const e = player.hands.main;
  const def = e && items.getItem(e.id);
  return (def && def.weapon && def.weapon.alt && def.weapon.alt.style) || null;
}

export function altWeaponOf(player) {
  const e = player.hands.main;
  const def = e && items.getItem(e.id);
  return def && def.weapon && def.weapon.alt ? { ...def.weapon, ...def.weapon.alt } : null;
}

// The weapon in the off hand, or null: a dual-wielded blow (docs/21). Not fists, not a
// two-handed item (the same entry in both hands), not a shield.
export function offWeaponOf(player) {
  const e = player.hands.off;
  if (!e || e === player.hands.main) return null;
  // A spear is never dual wielded (docs/21, `noDual`): a torch beside it is a light and never takes the off hand's
  // turn (the wiki census's bugs, 2026-10-15; a torch beside a sword still may, which docs/21 rules).
  const mainDef = player.hands.main && items.getItem(player.hands.main.id);
  if (mainDef && mainDef.noDual) return null;
  const def = items.getItem(e.id);
  return def && def.weapon && !def.shield ? def.weapon : null;
}

// The style the off hand's swing is drawn from (#423): its weapon's, or null (the one-handed swing). The figure's
// `attack_off` animation is that style's frames with the arms swapped, so the off arm swings and the main arm holds.
export function offStyleOf(player) {
  const w = offWeaponOf(player);
  return (w && w.style) || null;
}

// The shield in the off hand, or null (docs/21).
export function shieldOf(player) {
  const e = player.hands.off;
  const def = e && items.getItem(e.id);
  return def && def.shield ? def.shield : null;
}

// A blow aimed at the player. The zombie's hit is one event with a fixed damage, so the guard
// scales it by where the attacker stands against the aim: inside the front arc it does nothing,
// inside the wider side arc it does `sideThrough` of its damage, behind it lands whole. A block
// costs stamina; with none left the guard is broken and the blow lands whole. Returns the damage to take.
export function guardAgainst(player, zombie, damage) {
  const sh = player.blocking ? shieldOf(player) : null;
  if (!sh) return damage;
  const pf = iso.toScreen(player.gx, player.gy);
  const zs = iso.toScreen(zombie.gx, zombie.gy);
  const rad = (deg) => (deg * Math.PI) / 180 / 2;
  const onTop = Math.hypot(zs.x - pf.x, zs.y - pf.y) < 1e-3;
  const angle = onTop ? 0 : screenAngleBetween(player.aim.sx, player.aim.sy, zs.x - pf.x, zs.y - pf.y);
  const front = angle <= rad(sh.arc);
  const side = !front && angle <= rad(sh.sideArc ?? sh.arc);
  if (!front && !side) return damage;
  if (player.stamina < sh.stamina) {
    // The guard is broken: the blow lands whole and the arm is spent.
    player.stamina = 0;
    player.winded = true;
    player.blockFlash = 0.35; // the shield's flash, red: the player's own state (every client draws it from the record)
    player.flashBroken = true;
    emit("guardBroken", { player, zombie });
    return damage;
  }
  player.stamina -= sh.stamina;
  if (front && zombie.kind === "zombie") staggerZombie(zombie, sh.stagger, iso.normalize(zombie.gx - player.gx, zombie.gy - player.gy), sh.push ?? 0.25); // a boar's bite is met and nothing more (docs/45): an animal has no stagger
  loop.freeze(BLOW.hitStop * 0.6);
  kick(player);
  player.blockFlash = 0.14; // the shield's flash
  player.flashBroken = false;
  emit("blocked", { player, zombie });
  return front ? 0 : Math.round(damage * (sh.sideThrough ?? 0.5));
}

// What a blow does from behind a raised guard (docs/21): a fraction, so the guard is for
// holding a line and not for fighting from.
export function guardedMult(player) {
  const sh = player.blocking ? shieldOf(player) : null;
  return sh ? sh.attackMult ?? 1 : 1;
}

export function holdsWeapon(player) {
  const w = weaponOf(player);
  return !!w && w !== FISTS;
}

// The zombies a blow reaches: everything in the wedge, or only the nearest one
// when multi-hit is off (the setting, or the weapon's own `multiHit: false`).
// `limit`: the shove's own cap (docs/41, step 2), the nearest so many whatever the Multi-hit setting; else the rule.
function targetsIn(player, weapon, zombies, accept = () => true, limit = null) {
  // A blow does not go through a wall, a shut door, shut shutters, or a shut castle gate's bars: the same sight (and the gate's reach) that keeps the
  // dead from biting through them (Michael found a hit on a zombie behind a wall, with no outline,
  // because the dead one was in the fog).
  const list = zombies.filter((z) => !z.dead && (z.layer || 0) === (player.layer || 0) && accept(z) && inWedge(player, weapon, z) && lineOfReach(player.gx, player.gy, z.gx, z.gy, player.layer || 0)); // a blow never crosses a storey (docs/49 section 8)
  const d = (z) => Math.hypot(z.gx - player.gx, z.gy - player.gy);
  if (limit != null) return list.sort((a, b) => d(a) - d(b)).slice(0, limit);
  const multi = rules.multiHit && weapon.multiHit !== false;
  if (multi || list.length < 2) return list;
  list.sort((a, b) => d(a) - d(b));
  return [list[0]];
}

// The animals a blow reaches beside the dead (docs/45 section 2), handed in by game.js as the arrows' targets are: wild game takes a
// blow as anything does; tame stock only when the blow has nothing else to hit (the swing aimed at it), and then the nearest one alone,
// so a swing at one of the dead passes the pen's cow by in either Multi-hit mode, and a swing in a pen strikes one cow, never none (the
// review of #456: as archery's bodyAt, the dead and the wild first, then the tame). The shove is for the dead alone.
let animalList = () => [];
export function setAnimals(fn) {
  animalList = fn;
}

function blowTargets(player, weapon, zombies) {
  const reach = weapon.range + BODY_SLACK + 1;
  const near = animalList().filter((a) => !a.dead && Math.abs(a.gx - player.gx) <= reach && Math.abs(a.gy - player.gy) <= reach);
  if (!near.length) return targetsIn(player, weapon, zombies);
  const list = targetsIn(player, weapon, [...zombies, ...near.filter((a) => animals.isWild(a))]);
  if (list.length) return list;
  return targetsIn(player, weapon, near.filter((a) => !animals.isWild(a)), () => true, 1);
}

// Whether a blow pushes at all: the weapon's `knockbackChance` (default always).
function pushes(weapon) {
  return rng.chance(weapon.knockbackChance ?? 1);
}

// Whether the player's swing animation is still playing: the commitment (docs/41, step 1), read for the walk's
// share (player-controller.js) and the held facing (entities/player.js). A sheet without the animation ends it at once.
export function swinging(player) {
  const a = player.anim;
  return !!a && (a.name === "attack" || a.name === "attack_alt" || a.name === "attack_off" || a.name === "shove") && !a.done; // the shove commits as a swing does (docs/41, step 2); the off hand's swing as the main's (#423)
}

// What the player cannot swing through: carrying furniture, a timed action under way, or being dead.
// `ignoreAction` is for the outline, which is shown while a timed action runs.
function canAct(player, ignoreAction = false) {
  return !player.carrying && (ignoreAction || !player.action) && !player.dead && player.hp > 0;
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
  if (feet <= BLOW.pointBlank) return true;
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
  emit("kicked", { player, x, y, seconds: KICK_TIME });
}

// The left click. The swing resolves now, on the click: the cooldown is the
// only rate limit, and an interrupted animation cannot lose it. Returns the
// zombies hit, or null if nothing was swung.
// The weapon the next left click would swing: the off hand's when it would take the click (the main
// hand still recovering, the off hand ready), else the main hand's. The outline follows it.
export function nextSwingWeapon(player) {
  const off = offWeaponOf(player);
  if (off && (player.attackCooldown || 0) > 0 && (player.offCooldown || 0) <= 0) return off;
  return weaponOf(player);
}

// The left button (docs/21): with one weapon, a swing; with a weapon in each hand, the main hand
// swings when it is ready, and the off hand when the main is still recovering, so clicking faster
// than a swing's recovery goes back and forth.
export function swingFromLeft(player, zombies, predict = false) {
  if (!offWeaponOf(player)) return tryAttack(player, zombies, "main", null, predict);
  const mainReady = (player.attackCooldown || 0) <= 0;
  const offReady = (player.offCooldown || 0) <= 0;
  if (mainReady) return tryAttack(player, zombies, "main", null, predict); // the main hand first, always: a torch in the off hand is never used at a pace the main weapon keeps
  if (offReady) return tryAttack(player, zombies, "off", null, predict);
  return null;
}

// What a blow does to a player who has swung the off hand lately (docs/21): more from the front,
// more again from the sides, and from behind (the `behind` multiple, fatal) it lands whole and then
// some. A zombie's bite is one event with fixed damage, so this scales it by where the biter stands
// against the aim, as the shield's guard does.
export function exposedTo(player, zombie, damage) {
  if (!(player.exposedFor > 0)) return damage;
  const pf = iso.toScreen(player.gx, player.gy);
  const zs = iso.toScreen(zombie.gx, zombie.gy);
  const onTop = Math.hypot(zs.x - pf.x, zs.y - pf.y) < 1e-3;
  const angle = onTop ? 0 : screenAngleBetween(player.aim.sx, player.aim.sy, zs.x - pf.x, zs.y - pf.y);
  const rad = (deg) => (deg * Math.PI) / 180 / 2;
  const mult = angle <= rad(DUAL.arc) ? DUAL.front : angle <= rad(DUAL.sideArc) ? DUAL.side : DUAL.behind;
  return Math.round(damage * mult);
}

// `predict`: a guest's own swing played at once (docs/31/04: the animation is cosmetic, the hit is the authority's).
// The swing starts as it would on the host (the gate, the stamina, the hand's clock, the swing lock, the exposure,
// the animation, all the player's own fields, so the host's record agrees when it comes) and stops there: no
// targets, no damage, no roll of the sim's generator, no hit-stop, no kick, no wear. Run on the guest's step and
// again in the replay over each frame (net.js), so it must touch nothing but the player.
export function tryAttack(player, zombies, hand = "main", mode = null, predict = false) {
  const cd = hand === "off" ? "offCooldown" : "attackCooldown";
  if (!canAct(player) || (player[cd] || 0) > 0) return null;
  if ((player.shoveCooldown || 0) > 0) return null; // the shove's recovery (docs/41, step 2): no swing until it is over
  if ((player.swingLock || 0) > 0 && offWeaponOf(player)) return null; // the other hand must wait its turn
  const weapon = hand === "off" ? offWeaponOf(player) : mode === "alt" ? altWeaponOf(player) : weaponOf(player);
  if (!weapon) return null;
  // A swing the bar cannot pay for still lands, at half damage: never locked out of hitting (the 2026-10-11 ruling,
  // "a swing at zero stamina lands at half damage", read as the cost: with regeneration between swings the bar hovers
  // just above zero and "at zero" was never true at the moment of a swing, so the tired blow never came; docs/41 step 4).
  const tired = player.stamina < weapon.stamina;
  player.stamina = Math.max(0, player.stamina - weapon.stamina);
  if (player.stamina <= 0) player.winded = true;
  player[cd] = weapon.swing;
  player[hand === "off" ? "offSwingTotal" : "swingTotal"] = weapon.swing; // the swing timer's whole (ui/swing-timer.js)
  player.lastHand = hand;
  if (offWeaponOf(player)) {
    player.swingLock = weapon.swing * DUAL.lockout; // so two swings never land on the same frame
    if (hand === "off") player.exposedFor = DUAL.window; // the price of the second weapon
  }
  // The thrust has its own (docs/32); the off hand's swing moves the off arm (#423: it once played the main arm's), on a
  // sheet that has it (every player's does; one a rebake behind plays the main arm's rather than none).
  let anim = mode === "alt" && altStyleOf(player) ? "attack_alt" : "attack";
  if (hand === "off") {
    let sheet = null;
    try { sheet = getSheet(player.sprite); } catch { sheet = null; } // a sheet not loaded: the main arm's swing
    if (sheet && sheet.animations.attack_off) anim = "attack_off";
  }
  playAnimation(player.anim, anim, true);
  if (predict) return [];
  emit("meleeSwing", { player, weapon, hand }); // `hand`: the scythe's row harvest (farming.js) asks what is in it

  const dir = gridAim(player);
  const hit = [];
  let killed = false;
  // A blade's coat (docs/47 section 6): every body the swing strikes is poisoned, and the swing spends one hit however many it strikes.
  const coated = player.hands[hand];
  const coatTier = poison.coatOf(coated) ? coated.poison.tier : 0;
  for (const z of blowTargets(player, weapon, zombies)) {
    hit.push(z);
    if (z.kind === "animal") {
      // An animal (docs/45 section 2): the blow's damage, no knockdown or combo; the weapon's class decides what the carcass gives.
      const amount = Math.round(weapon.damage * (tired ? BLOW.tiredDamage : 1) * guardedMult(player) * (hand === "off" ? DUAL.offDamage : 1));
      const cls = animals.classOfItem(coated && coated.id);
      if (animals.damageAnimal(z, amount, { by: player, cls, from: [player.gx, player.gy] }).killed) killed = true;
      if (coatTier) poison.apply(z, coatTier, cls); // after the blow: a body it killed is not poisoned
      continue;
    }
    // On the floor it is a finisher; rising it takes plain damage and nothing else (docs/41, step 3: the floor is
    // one blow long, and the rise is safe from the multiplier, so a knockdown is a moment and not a free kill).
    const down = isDown(z);
    const finisher = down && !z.gettingUp;
    // The third hit within the window always floors it; fists never do.
    let combo = false;
    if (!down) {
      const now = loop.simTime();
      z.hits = (z.hits || []).filter((t) => now - t <= COMBO.window);
      z.hits.push(now);
      if (COMBO.enabled && z.hits.length >= COMBO.hits && weapon.knockdown !== 0) {
        combo = true;
        z.hits = [];
      }
    }
    const chance = weapon.knockdown ?? BLOW.knockdownChance;
    const knockdown = !down && (combo || rng.chance(chance));
    const amount = Math.round(weapon.damage * (tired ? BLOW.tiredDamage : 1) * (finisher ? FINISHER.mult : 1) * guardedMult(player) * (hand === "off" ? DUAL.offDamage : 1));
    const push = !down && pushes(weapon) ? weapon.knockback : 0;
    // A weapon with an `ignite` chance (the torch, #14) may set the dead one alight: rolled only for such a weapon, so
    // no other blow spends a roll, and before the damage, so a killing blow's body burns on as a corpse.
    // An unlit torch (doused, or new, #156) sets nothing alight and spends no roll.
    const swung = player.hands[hand];
    const dousedTorch = !!(swung && items.getItem(swung.id).fire && !items.isLit(swung));
    if (weapon.ignite && !dousedTorch && rng.chance(weapon.ignite)) burn.ignite(z);
    const r = damageZombie(z, amount, { dir: [dir.x, dir.y], knockback: push, knockdown, stagger: weapon.stagger, staggerChance: weapon.staggerChance, from: [player.gx, player.gy] });
    if (r.killed) killed = true;
    if (coatTier) poison.apply(z, coatTier);
  }
  if (hit.length) {
    if (coatTier) poison.spendCoat(coated); // one hit of the coat a swing that lands; a miss spends none
    loop.freeze(killed ? BLOW.hitStopKill : BLOW.hitStop);
    kick(player);
    emit("meleeHit", { count: hit.length, killed });
    wearWeapon(player, hand === "off" ? "off" : "main", hit.length); // a landed hit costs the weapon its wear (docs/30, 5.2); a miss nothing
  }
  return hit;
}

// Durability is kills (docs/30, law 5): each landed hit wears the weapon that
// swung by its per-hit share, and at one it is gone from the hand, with a
// word. Two weapons each wear their own, so per kill the cost is the same.
export function wearWeapon(player, slot, hits = 1) {
  const entry = player.hands[slot];
  if (!entry) return;
  const per = items.wearPerHit(items.getItem(entry.id));
  if (!per) return;
  entry.wear = Math.min(1, (entry.wear || 0) + per * hits);
  if (entry.wear >= 1) {
    detach(player, entry);
    emit("weaponBroke", { who: player.id, item: entry.id, uid: entry.uid });
  }
}

// Space: no damage, a strong push, a stagger, sometimes a knockdown, on up to SHOVE.targets of the dead in the
// wedge whatever the Multi-hit setting: the crowd tool (docs/41, step 2). Works with anything in the hands, or
// nothing. Its cooldown is also a recovery in which no swing starts (tryAttack). The pose is `shove`, both arms
// out; a sheet without it plays the swing.
// `predict`: a guest's own player between the host's frames (as tryAttack's): the clocks, the stamina, and the pose run
// at once, so a click inside the recovery is refused on the guest as it is on the host; the push is the host's alone.
export function tryShove(player, zombies, predict = false) {
  if (!canAct(player) || (player.shoveCooldown || 0) > 0) return null;
  // The tired shove, as the tired blow (2026-10-11, narrowed 2026-10-24): one the bar cannot pay for staggers and floors at
  // `blow.tiredDamage`, so an empty bar cannot hold a crowd in a stagger for ever (#385; Primary's reading), and pushes `shove.tiredPush`
  // of its push (Michael, 2026-10-24).
  const tired = player.stamina < SHOVE.stamina;
  const share = tired ? BLOW.tiredDamage : 1;
  player.shoveCooldown = SHOVE.cooldown;
  player.stamina = Math.max(0, player.stamina - SHOVE.stamina);
  if (player.stamina <= 0) player.winded = true;
  const sheet = getSheet(player.sprite);
  playAnimation(player.anim, sheet && sheet.animations.shove ? "shove" : "attack", true);
  if (predict) return [];
  const dir = gridAim(player);
  const hit = [];
  for (const z of targetsIn(player, SHOVE, zombies, (z) => !isDown(z), SHOVE.targets ?? 1)) {
    hit.push(z);
    // A tired shove's push has its own share (Michael, 2026-10-24: the tired push "a foot or two back"), its stagger and knockdown the tired blow's.
    damageZombie(z, 0, { dir: [dir.x, dir.y], knockback: pushes(SHOVE) ? SHOVE.knockback * (tired ? SHOVE.tiredPush ?? share : 1) : 0, knockdown: rng.chance(SHOVE.knockdown * share), stagger: SHOVE.stagger * share, staggerChance: 1, from: [player.gx, player.gy] });
  }
  emit("shove", { count: hit.length });
  if (hit.length) {
    loop.freeze(BLOW.hitStop * 0.6);
    kick(player);
  }
  return hit;
}

// The zombies the next swing would hit, by the very test the swing uses, and
// without the cooldown: green means the swing would land (docs/14, "Swing
// targets"). Empty while the player cannot swing.
export function swingTargets(player, zombies) {
  if (!canAct(player, true)) return [];
  const w = nextSwingWeapon(player);
  if (!w) return []; // a potion or a poison in the main hand swings nothing (docs/47 section 7)
  const near = zombies.filter((z) => Math.abs(z.gx - player.gx) <= w.range + BODY_SLACK + 1 && Math.abs(z.gy - player.gy) <= w.range + BODY_SLACK + 1);
  return blowTargets(player, w, near);
}

// The ids of the dead (and the animals, docs/45) the renderer outlines, into the client's own set (`client.targets`,
// src/client.js): `on` marks the targets, else clears. Never a flag on the bodies: a host's flags were saved, sent in the
// dead's records, and drawn on a guest as the host's own targets (docs/31/05 item 7, #102).
export function markTargets(player, zombies, on, marks) {
  marks.clear();
  if (on) for (const t of swingTargets(player, zombies)) marks.add(t.id);
}

// Each logic step: cooldowns and the effects' timers.
export function updateCombat(player, zombies, dt) {
  player.attackCooldown = Math.max(0, (player.attackCooldown || 0) - dt);
  player.offCooldown = Math.max(0, (player.offCooldown || 0) - dt);
  player.blockFlash = Math.max(0, (player.blockFlash || 0) - dt);
  player.swingLock = Math.max(0, (player.swingLock || 0) - dt);
  player.exposedFor = Math.max(0, (player.exposedFor || 0) - dt);
  player.shoveCooldown = Math.max(0, (player.shoveCooldown || 0) - dt);
}

// What the feedback layer shows right now: the freeze (the wedge and the kick were never drawn).
export function effects() {
  return { hitStop: loop.getFreeze() };
}

// What the renderer draws for the hit shapes: with the Show hit shapes setting
// on and a weapon held, the body samples of the dead nearby, green for those in
// the wedge. The wedge itself is still the hit test but is not drawn (Michael,
// 2026-10-12: the Swing targets outline shows the same thing).
export function overlays(player, zombies, showShapes) {
  const dots = [];
  if (showShapes && holdsWeapon(player) && !player.dead) {
    const w = weaponOf(player);
    for (const z of zombies) {
      if (z.dead || Math.abs(z.gx - player.gx) > 6 || Math.abs(z.gy - player.gy) > 6) continue;
      const hit = inWedge(player, w, z);
      for (const [x, y] of bodySamples(z)) dots.push([x, y, hit]);
    }
  }
  if (!dots.length) return null;
  return { dots, world: [player.gx, player.gy] };
}
