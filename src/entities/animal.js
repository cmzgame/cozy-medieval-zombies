// Animals (docs/45, step 1): the valley's game and livestock, characters of the world stepped on the host as the dead and the
// villagers are. Each species is a row of `data/animals.json` (its walk and run, what it flees, how far it wanders from home,
// what it gives); each animal belongs to a home the map names (a wood for game, a pen for livestock) and drifts back toward
// it, never walled in by a rule: deer cross a field, a rabbit comes into the village, and the animals of a pen left open
// wander out and stay near. The dead ignore them (they are in none of the dead's lists), and they wear and hold nothing,
// so an animal is a small record of its own, not the human model (docs/45 section 6): its sheet is a drawn one (or the dev
// art, `placeholders.generateAnimal`) whose named animations it plays as it moves: idle, walk, run, eat, dead.
// Hunting (docs/45, step 2): a blow or an arrow hurts an animal as it would one of the dead (wild game as anything; tame stock only
// when it is the one thing aimed at, combat.js and archery.js), deer and rabbits run from what hurt them and the boar charges and
// bites the player who did; a kill leaves a carcass, the animal's own record turned dead (one list: never the dead's corpses),
// with the class of the weapon that killed it (`killedBy`, the share of every yield it leaves) and whether it is skinned; the `skin`
// and `butcher` verbs, a dirk carried, give the yields to the bag or the feet, and a butchered carcass leaves the list. A snare set
// near rabbits holds one after a while. Every roll is the sim's generator's and every time the sim's (the step's dt, the game's
// clock); nothing here reads a window.

import { createAnimation, playAnimation, advanceAnimation } from "../sprites.js";
import { getSheet } from "../assets.js";
import { repath, followPath, separate, pickTargetAround, faceToward } from "./movement.js";
import { lineOfSight } from "../visibility.js";
import { isWalkableTile, roomAt, dropItem } from "../map.js";
import * as rng from "../rng.js";
import * as clock from "../clock.js";
import * as loop from "../loop.js";
import { nextId } from "../world.js";
import { emit } from "../events.js";
import * as floaters from "../floaters.js";
import * as verbs from "../verbs.js";
import * as inventory from "../inventory.js";
import * as items from "../items.js";
import * as grid from "../grid.js";
import { reachProblem } from "../reach.js";

let data = null;

export function load(json) {
  data = json && json.species ? json : { species: {}, renew: { seconds: 720, clear: 48 } };
}

export function loaded() {
  return !!data;
}

export function speciesOf(name) {
  const sp = data && data.species[name];
  if (!sp) throw new Error(`Unknown animal species ${name} (data/animals.json)`);
  return sp;
}

export function speciesNames() {
  return data ? Object.keys(data.species) : [];
}

export function renewRule() {
  return (data && data.renew) || { seconds: 720, clear: 48 };
}

// Whether a species is wild game (renewed, and hurt by any blow or arrow) or tame stock (hurt only on purpose).
export function isWild(a) {
  return !!speciesOf(a.species).wild;
}

// The share of every yield a kill by a class of weapon leaves (`kills`): the bow the full yield, a melee weapon less, a halberd none.
export function killShare(cls) {
  const k = (data && data.kills) || {};
  return k[cls] ?? 1;
}

// The class of a blow by the item in the hand (`classes`, else melee; fists are melee too).
export function classOfItem(id) {
  return (data && data.classes && id && data.classes[id]) || "melee";
}

export function workSeconds(verb) {
  return ((data && data.work) || {})[verb] || 4;
}

export function snareRule() {
  return (data && data.snare) || { hours: 6, reach: 16 };
}

export function tracksRule() {
  return (data && data.tracks) || { every: 1, seconds: 240, radius: 8, keep: 10 };
}

// The species that give an item and how (`skin` or `butcher`), for its hover card: [{ species, how }].
export function sourcesOf(itemId) {
  const out = [];
  for (const [name, sp] of Object.entries((data && data.species) || {})) {
    for (const how of ["skin", "butcher"]) if (((sp.yields || {})[how] || []).some((y) => y.id === itemId)) out.push({ species: sp.name || name, how });
  }
  return out;
}

// The animals, handed in by game.js each time a world is made or restored (as interact's characters are): what the verbs find by id.
let animalList = () => [];
export function setAnimalList(fn) {
  animalList = fn;
}

// The sheet a species is drawn from (data/sprites/animal_<species>.json).
export function spriteOf(species) {
  return `animal_${species}`;
}

const rollIdle = (sp) => rng.range(sp.idle[0], sp.idle[1]);

export function createAnimal(species, gx, gy, { id = null, home = null, homeId = null } = {}) {
  const sp = speciesOf(species);
  return {
    kind: "animal",
    id: id || nextId("ab"),
    species,
    name: sp.name,
    sprite: spriteOf(species),
    gx,
    gy,
    layer: 0,
    facing: "se", // one of the four diagonals the sheet has (two drawn, two mirrored)
    speed: sp.walk,
    radius: sp.radius,
    hp: sp.hp,
    maxHp: sp.hp,
    dead: false,
    anim: createAnimation("idle"),
    state: "idle", // idle | eat | wander | flee | alert
    home: home || [gx, gy], // the point it drifts back toward
    homeId, // the map's home it belongs to, for the cap (null for none)
    path: [],
    repathTimer: 0,
    idleTimer: rollIdle(sp),
    lookTimer: 0, // seconds to the next look round for what it flees
    stuckTime: 0,
    pathFailed: false,
    lastGoal: null,
    fleeFrom: null, // [gx, gy] of what it ran from
    killedBy: null, // a carcass's weapon class (bow, thrown, melee, spell, halberd, snare): the share of its yields (`kills`)
    skinned: false,
    butchered: false, // taken: it leaves the list in the step (game.js)
    targetId: null, // the player a boar charges (docs/45 section 2: it fights back when attacked)
    calmAt: 0, // sim seconds when the boar gives up the charge
    windup: 0, // seconds left of the boar's bite before it lands
    biteTimer: 0, // seconds before the boar bites again
  };
}

// ---- as data, and back: everything plain is saved; the sheet's id is the species' and is named again ----
export function serializeAnimal(a) {
  const { sprite, ...rest } = a;
  return rest;
}

export function restoreAnimal(d) {
  const a = createAnimal(d.species, d.gx, d.gy, { id: d.id, home: d.home, homeId: d.homeId });
  Object.assign(a, d);
  a.sprite = spriteOf(a.species);
  return a;
}

// ---- facing: the nearest of the four diagonals to the heading; a straight heading keeps the side it last had ----
const DIAGONAL = new Set(["se", "sw", "ne", "nw"]);
export function diagonal(f, prev = "se") {
  if (DIAGONAL.has(f)) return f;
  const east = prev.endsWith("e");
  const north = prev.startsWith("n");
  if (f === "s") return east ? "se" : "sw";
  if (f === "n") return east ? "ne" : "nw";
  if (f === "e") return north ? "ne" : "se";
  return north ? "nw" : "sw";
}

// ---- the flight (deer and rabbits): a player or one of the dead seen within `sight` tiles, by a clear line ----
const LOOK_EVERY = 0.25; // seconds between looks round: a step's dt is fixed, so this is the same on every world

function threatInSight(a, threats, radius) {
  let best = null;
  let bestD = radius;
  for (const t of threats) {
    const d = Math.hypot(t.gx - a.gx, t.gy - a.gy);
    if (d > bestD) continue;
    if (!lineOfSight(a.gx, a.gy, t.gx, t.gy)) continue;
    best = t;
    bestD = d;
  }
  return best;
}

// Whether it still sees anything it would run from within `radius`: only what it can see holds it alert, so one of the dead
// standing still behind a wall does not hold a deer for ever.
function anyInSight(a, threats, radius) {
  return threats.some((t) => Math.hypot(t.gx - a.gx, t.gy - a.gy) <= radius && lineOfSight(a.gx, a.gy, t.gx, t.gy));
}

// A tile about `tiles` away from the threat, straight away first and then turning, that it can run to; null when there is none.
function fleeTo(a, from, tiles) {
  let ax = a.gx - from[0];
  let ay = a.gy - from[1];
  const len = Math.hypot(ax, ay) || 1;
  ax /= len;
  ay /= len;
  if (ax === 0 && ay === 0) ax = 1;
  const here = [Math.round(a.gx), Math.round(a.gy)];
  for (const deg of [0, 30, -30, 60, -60, 90, -90, 135, -135]) {
    const r = (deg * Math.PI) / 180;
    const dx = ax * Math.cos(r) - ay * Math.sin(r);
    const dy = ax * Math.sin(r) + ay * Math.cos(r);
    for (const dist of [tiles, Math.max(2, Math.round(tiles / 2))]) {
      const t = [Math.round(a.gx + dx * dist), Math.round(a.gy + dy * dist)];
      if (t[0] === here[0] && t[1] === here[1]) continue;
      if (!isWalkableTile(t[0], t[1]) || roomAt(t[0], t[1]) !== 0) continue;
      repath(a, t);
      if (!a.pathFailed && a.path.length) return t;
    }
  }
  a.path = [];
  return null;
}

function startFlee(a, threat, sp) {
  a.fleeFrom = [threat.gx, threat.gy];
  if (fleeTo(a, a.fleeFrom, sp.flee.tiles)) {
    a.state = "flee";
    playAnimation(a.anim, "run", true);
  } else {
    a.state = "alert";
    playAnimation(a.anim, "idle", true);
  }
}

// After a walk, or when it is put down: a stand, sometimes spent grazing (`graze`, the chance a stand is eating).
function settle(a, sp) {
  a.state = rng.float() < sp.graze ? "eat" : "idle";
  a.idleTimer = rollIdle(sp);
  playAnimation(a.anim, a.state === "eat" ? "eat" : "idle", true);
}

// One step of one animal. `others` are the bodies it steps aside from (the living and the other animals); `threats` what a
// fleeing species runs from (the living players and the standing dead).
export function updateAnimal(a, dt, others, threats) {
  const sp = speciesOf(a.species);
  const sheet = getSheet(a.sprite);
  const prev = a.facing;
  if (a.dead) {
    playAnimation(a.anim, "dead");
    advanceAnimation(a.anim, sheet, dt);
    return;
  }
  let looked = false; // this step is a look round
  if (sp.flee) {
    a.lookTimer -= dt;
    if (a.lookTimer <= 0) {
      a.lookTimer = LOOK_EVERY;
      looked = true;
      if (a.state !== "flee" && a.state !== "alert") {
        const t = threatInSight(a, threats, sp.flee.sight);
        if (t) startFlee(a, t, sp);
      }
    }
  }
  switch (a.state) {
    case "flee": {
      playAnimation(a.anim, "run");
      a.speed = sp.run;
      const done = followPath(a, dt, others);
      a.speed = sp.walk;
      if (done) {
        // Still seen: away again; else it stands alert until whatever it ran from is far enough.
        const t = threatInSight(a, threats, sp.flee.sight);
        if (t) startFlee(a, t, sp);
        else {
          a.state = "alert";
          playAnimation(a.anim, "idle", true);
        }
      }
      break;
    }
    case "alert": {
      playAnimation(a.anim, "idle");
      separate(a, dt, others);
      if (looked) {
        const t = threatInSight(a, threats, sp.flee ? sp.flee.sight : 0);
        if (t) startFlee(a, t, sp);
        else if (!anyInSight(a, threats, sp.flee ? sp.flee.clear : 0)) {
          a.fleeFrom = null;
          settle(a, sp);
        }
      }
      break;
    }
    case "idle":
    case "eat": {
      playAnimation(a.anim, a.state);
      separate(a, dt, others);
      a.idleTimer -= dt;
      if (a.idleTimer <= 0) {
        // A walkable tile within its wander of home (the picker draws from a square; the reach is a circle). Far from home
        // (it fled, or walked out of a pen left open) the tile is still near home, so it drifts back.
        let target = null;
        for (let tries = 0; tries < 6 && !target; tries++) {
          const t = pickTargetAround(a.home[0], a.home[1], sp.wander, 0);
          if (t && Math.hypot(t[0] - a.home[0], t[1] - a.home[1]) <= sp.wander) target = t;
        }
        if (target) repath(a, target);
        if (target && a.path.length) {
          a.state = "wander";
          playAnimation(a.anim, "walk", true);
        } else settle(a, sp);
      }
      break;
    }
    case "wander": {
      playAnimation(a.anim, "walk");
      if (followPath(a, dt, others)) settle(a, sp);
      break;
    }
    case "charge": {
      charge(a, dt, others, threats, sp);
      break;
    }
    default:
      settle(a, sp);
  }
  a.facing = diagonal(a.facing, prev);
  advanceAnimation(a.anim, sheet, dt);
}

// ---- the boar fights back (docs/45 section 2, default: a short charge and a bite) ----
// Only at the player who struck it, for `fight.seconds` after the last blow, given up past `fight.giveUp` tiles: the danger is the
// player's choice. Within `reach` it winds up (its sheet's attack) and bites when the windup ends if the player is still there.
function charge(a, dt, others, threats, sp) {
  const f = sp.fight;
  const t = threats.find((q) => q.id === a.targetId && q.kind === "player");
  const d = t ? Math.hypot(t.gx - a.gx, t.gy - a.gy) : Infinity;
  if (!f || !t || t.dead || loop.simTime() >= a.calmAt || d > f.giveUp) {
    a.targetId = null;
    a.windup = 0;
    a.path = [];
    settle(a, sp);
    return;
  }
  a.biteTimer = Math.max(0, a.biteTimer - dt);
  faceToward(a, t.gx - a.gx, t.gy - a.gy);
  if (a.windup > 0) {
    playAnimation(a.anim, "attack");
    a.windup -= dt;
    if (a.windup <= 0) {
      a.windup = 0;
      a.biteTimer = f.cooldown;
      if (d <= f.reach + 0.3 && lineOfSight(a.gx, a.gy, t.gx, t.gy)) emit("animalBite", { animal: a, victim: t, damage: f.damage });
    }
    return;
  }
  if (d <= f.reach) {
    separate(a, dt, others);
    if (a.biteTimer <= 0) {
      a.windup = f.windup;
      playAnimation(a.anim, "attack", true);
    } else playAnimation(a.anim, "idle");
    return;
  }
  a.repathTimer -= dt;
  if (a.repathTimer <= 0 || !a.path.length) repath(a, [Math.round(t.gx), Math.round(t.gy)]);
  playAnimation(a.anim, "run");
  a.speed = sp.run;
  followPath(a, dt, others);
  a.speed = sp.walk;
}

// ---- hurt and killed (docs/45 section 2) ----
// A blow or a shot on an animal, on the authority: the red number over it, its health, and at nothing a carcass with the class of the
// weapon (`cls`); short of that, game runs from `from` (the attacker's place) and the boar turns on `by`. Returns { killed }.
export function damageAnimal(a, amount, { by = null, cls = "melee", from = null } = {}) {
  if (!a || a.dead) return { killed: false };
  floaters.damage(a, amount);
  a.hp = Math.max(0, a.hp - amount);
  if (a.hp <= 0) {
    a.dead = true;
    a.state = "dead";
    a.killedBy = cls;
    a.path = [];
    a.targetId = null;
    a.windup = 0;
    playAnimation(a.anim, "dead", true);
    emit("animalKilled", { animal: a, by, cls });
    return { killed: true };
  }
  const sp = speciesOf(a.species);
  const at = from ? { gx: from[0], gy: from[1] } : by;
  if (sp.fight && by && by.kind === "player") {
    a.state = "charge";
    a.targetId = by.id;
    a.calmAt = loop.simTime() + sp.fight.seconds;
    a.path = [];
    a.repathTimer = 0;
  } else if (sp.flee && at) startFlee(a, at, sp);
  return { killed: false };
}

// ---- the carcass's yields: skinned, then butchered, a dirk carried (docs/45 section 2) ----
const BODY_REACH = 2.6; // tiles, the click's reach (interact.CLICK_REACH)

function animalOf(target) {
  if (!target) return null;
  if (target.ch) return target.ch.kind === "animal" ? target.ch : null;
  const id = typeof target.character === "string" ? target.character : typeof target.id === "string" ? target.id : null;
  return id ? animalList().find((a) => a.id === id) || null : null;
}

// A yield's count: rolled in its range, then the share the kill left (`kills`), rounded.
function rollYields(a, how) {
  const share = killShare(a.killedBy || "melee");
  const out = [];
  for (const y of (speciesOf(a.species).yields || {})[how] || []) {
    const [lo, hi] = y.count;
    const n = Math.round((lo + rng.int(hi - lo + 1)) * share);
    if (n > 0) out.push({ id: y.id, count: n });
  }
  return out;
}

export function hasHide(a) {
  return ((speciesOf(a.species).yields || {}).skin || []).length > 0;
}

// Into the bag, the rest at the feet (as every gather does).
function give(player, id, count) {
  const placed = Math.min(count, inventory.addItem(inventory.bagOf(player), id, count));
  if (placed < count) dropItem(Math.round(player.gx), Math.round(player.gy), items.makeEntry(id, count - placed));
}

function said(list) {
  const name = (y) => {
    const n = items.getItem(y.id).name.toLowerCase();
    return y.count > 1 ? `${y.count} ${n.endsWith("s") ? n : `${n}s`}` : `${/^[aeiou]/.test(n) ? "an" : "a"} ${n}`;
  };
  if (!list.length) return "";
  return list.length === 1 ? name(list[0]) : `${list.slice(0, -1).map(name).join(", ")} and ${name(list[list.length - 1])}`;
}

// Why a carcass cannot be skinned or butchered now, or "".
export function workProblem(player, a, verb) {
  if (!a || a.butchered) return "There is nothing there.";
  if (!a.dead) return `The ${a.name} is alive.`;
  if (verb === "skin") {
    if (!hasHide(a)) return `There is nothing to skin on a ${a.name}.`;
    if (a.skinned) return "It is skinned already.";
  }
  if (verb === "butcher" && hasHide(a) && !a.skinned) return "Skin it first.";
  const why = player ? reachProblem(player, [[Math.round(a.gx), Math.round(a.gy)]], BODY_REACH) : "";
  if (why) return why === "Too far away." ? `Too far from the ${a.name}.` : why;
  return player ? inventory.toolProblem(player, verb) || "" : "";
}

verbs.define("skin", {
  validate(world, player, target) {
    return workProblem(player, animalOf(target), "skin") || true;
  },
  perform(world, player, target) {
    const a = animalOf(target);
    const got = rollYields(a, "skin");
    for (const y of got) give(player, y.id, y.count);
    a.skinned = true;
    return { ok: true, message: got.length ? `You skin the ${a.name}: ${said(got)}.` : `The ${a.name}'s hide is ruined.` };
  },
});

verbs.define("butcher", {
  validate(world, player, target) {
    return workProblem(player, animalOf(target), "butcher") || true;
  },
  perform(world, player, target) {
    const a = animalOf(target);
    const got = rollYields(a, "butcher");
    for (const y of got) give(player, y.id, y.count);
    // What hit it and stayed (archery.js): arrows by count and a thrown thing as itself come back with the meat.
    for (const [id, n] of Object.entries(a.lodged || {})) give(player, id, n);
    for (const e of a.lodgedItems || []) if (!grid.insert(inventory.bagOf(player), e)) dropItem(Math.round(player.gx), Math.round(player.gy), e);
    a.lodged = {};
    a.lodgedItems = [];
    a.butchered = true;
    return { ok: true, message: got.length ? `You butcher the ${a.name}: ${said(got)}.` : `There is nothing left worth taking on the ${a.name}.` };
  },
});


// ---- homes (docs/45 section 1): where the map put each herd or flock, and the renewal of game up to a cap ----
// A home: { id, species, at, radius, cap, renew, nextAt }. The animals made at a world's birth stand round it (at most two
// tiles off its point, on the clearing the map keeps there); a wild home below its cap has one back each `renew.seconds`
// of the game's clock, on a free outdoor tile of its clearing, never while a player, living or dead, is within `renew.clear`
// tiles (nothing materialises in view), and not at all while the whole clearing is built over or walled in (it waits).
export function homesFrom(list) {
  return (list || []).map((h, i) => {
    const sp = speciesOf(h.species);
    return { id: `h${i}`, species: h.species, name: h.name || null, at: [h.tile[0], h.tile[1]], count: h.count || 1, cap: h.cap || h.count || 1, renew: h.renew ?? !!sp.wild, nextAt: null };
  });
}

// The first animals of every home, in the map's order: a herd spread over the clearing at its point.
const SPREAD = [[0, 0], [1, 0], [0, 1], [-1, 0], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1], [2, 0], [0, 2], [-2, 0]];
export function populate(homes) {
  const out = [];
  let n = 0;
  for (const h of homes) {
    for (let k = 0; k < h.count; k++) {
      const [dx, dy] = SPREAD[k % SPREAD.length];
      out.push(createAnimal(h.species, h.at[0] + dx, h.at[1] + dy, { id: `an${n++}`, home: h.at.slice(), homeId: h.id }));
    }
  }
  return out;
}

// A walkable outdoor tile of the clearing round a home's point, the point first; null when there is none.
function freeSpot(at) {
  for (const [dx, dy] of SPREAD) {
    const x = at[0] + dx;
    const y = at[1] + dy;
    if (isWalkableTile(x, y) && roomAt(x, y) === 0) return [x, y];
  }
  return null;
}

// The renewal, once a step on the authority: returns the animals born this step (the caller adds them).
export function renewHomes(homes, animals, players) {
  const born = [];
  const R = renewRule();
  const now = clock.getElapsed();
  for (const h of homes) {
    if (!h.renew) continue;
    const living = animals.reduce((n, a) => n + (a.homeId === h.id && !a.dead ? 1 : 0), 0);
    if (living >= h.cap) {
      h.nextAt = null;
      continue;
    }
    if (h.nextAt === null) {
      h.nextAt = now + R.seconds;
      continue;
    }
    if (now < h.nextAt) continue;
    if (players.some((p) => Math.hypot(p.gx - h.at[0], p.gy - h.at[1]) <= R.clear)) continue; // waits until nobody is near: a dead player's screen still looks
    const spot = freeSpot(h.at);
    if (!spot) continue; // built over, or inside a room a player made there: it waits (a sealed room is a cell)
    born.push(createAnimal(h.species, spot[0], spot[1], { home: h.at.slice(), homeId: h.id }));
    h.nextAt = living + 1 < h.cap ? now + R.seconds : null;
  }
  return born;
}

// ---- snares (docs/45 section 2): a placed prop like a torch post; it holds a rabbit once its hours have passed ----
// A set snare (`prop.snare = { setAt, holds }`, saved and sent with its chunk) holds a rabbit once `snare.hours` of game time have
// passed, if a home of rabbits is within `snare.reach` tiles and one of its living rabbits can be taken unseen: no player, living or
// dead, within `renew.clear` of the rabbit or of the snare (nothing materialises in view). The rabbit is the home's own, so the home
// renews it in time: hunting by snare is renewal, never endless. The catch is a carcass (killed by the snare, its whole yield) lying on
// the snare; once it is butchered the snare is set again. Run once a second of sim time by game.js; returns the snares it changed.
const HOUR = 30; // clock seconds in a game hour (clock.DAY_LENGTH 720 / 24)
export function snareStep(snares, animals, homes, watchers) {
  const changed = [];
  const now = clock.getElapsed();
  const S = snareRule();
  const R = renewRule();
  const unseen = (x, y) => watchers.every((p) => Math.hypot(p.gx - x, p.gy - y) > R.clear);
  for (const prop of snares) {
    const sn = prop.snare;
    if (!sn) continue;
    if (sn.holds) {
      const a = animals.find((q) => q.id === sn.holds);
      if (!a || a.butchered || !a.dead) {
        sn.holds = null;
        sn.setAt = now;
        changed.push(prop);
      }
      continue;
    }
    if (now < sn.setAt + S.hours * HOUR) continue;
    const [tx, ty] = prop.tile;
    if (!unseen(tx, ty)) continue;
    let caught = null;
    for (const h of homes) {
      if (h.species !== "rabbit" || Math.hypot(h.at[0] - tx, h.at[1] - ty) > S.reach) continue;
      caught = animals.find((q) => q.homeId === h.id && !q.dead && unseen(q.gx, q.gy));
      if (caught) break;
    }
    if (!caught) continue;
    caught.gx = tx;
    caught.gy = ty;
    caught.dead = true;
    caught.hp = 0;
    caught.state = "dead";
    caught.killedBy = "snare";
    caught.path = [];
    playAnimation(caught.anim, "dead", true);
    sn.holds = caught.id;
    changed.push(prop);
  }
  return changed;
}

// A snare's Look at (the asking client's own line): what it holds, or how long it has been set.
export function snareLine(prop) {
  const sn = prop && prop.snare;
  if (!sn) return "A snare, not set.";
  if (sn.holds) return "The snare holds a rabbit.";
  const left = Math.max(0, Math.ceil((sn.setAt + snareRule().hours * HOUR - clock.getElapsed()) / HOUR));
  return left > 0 ? `A snare, set. Nothing yet; give it about ${left} hour${left > 1 ? "s" : ""}, near rabbits.` : "A snare, set. Nothing yet: it wants rabbits near.";
}

// What Look at says (docs/45: a name on hover, Object Highlight; the client's own line, nothing sent).
const KILLED = { bow: "Shot clean.", thrown: "Speared.", melee: "Beaten down.", spell: "Burnt.", halberd: "Hacked to ruin by a halberd: there is little worth taking.", snare: "Caught in a snare." };
export function lookLine(a) {
  if (a.dead) return `A dead ${a.name}${a.skinned ? ", skinned" : ""}. ${KILLED[a.killedBy] || ""}`.trim();
  if (a.state === "charge") return `A ${a.name}, and it is angry.`;
  const sp = speciesOf(a.species);
  if (a.state === "flee") return `A ${a.name}, running.`;
  if (sp.wild) return a.state === "eat" ? `A ${a.name}, grazing. It has not seen you.` : `A ${a.name}. Wild; it keeps its distance.`;
  return a.state === "eat" ? `A ${a.name}, grazing.` : `A ${a.name}. Somebody's, once.`;
}
