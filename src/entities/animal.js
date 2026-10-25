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
// near rabbits holds one after a while.
// Keeping (docs/45, step 3): a lead carried leads a tame animal and letting it go makes where it stands its home, so one let go in a
// fenced yard with its gates shut stays (a pen); once a game day a tame animal eats one unit of feed from a feeding trough near its home,
// and fed it gives that day (a cow's milk with a bucket, a sheep's wool with shears, a hen's egg and most days a feather into its coop),
// some days one more (pens that give more); two of a kind fed in a pen with room breed a young one every few days up to a cap. An unfed
// animal simply gives nothing: nothing punishes being away. Every roll is the sim's generator's and every time the sim's (the step's dt,
// the game's clock); nothing here reads a window.

import { createAnimation, playAnimation, advanceAnimation } from "../sprites.js";
import { getSheet } from "../assets.js";
import { repath, followPath, separate, pickTargetAround, faceToward } from "./movement.js";
import { lineOfSight } from "../visibility.js";
import { isWalkableTile, roomAt, dropItem, peekTile, canStep, markDirty } from "../map.js";
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

export function keepRule() {
  return (data && data.keep) || { feedReach: 8, coopReach: 4, feather: 0.8, more: 0.25, breedDays: 3, penCap: 6, roomPerHead: 6, penMax: 500, leadPull: 1.5, leadMax: 6, leadStuck: 3, leadReach: 40, leadClose: 1.6 };
}

// The game's day, counted from zero (clock.getDay is the label's, from one).
export function today() {
  return Math.floor(clock.getElapsed() / clock.DAY_LENGTH);
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

// The species whose keeping gives an item (docs/45 section 3), for its card: [{ species, how }] with how "milk", "shear", or "lay".
export function keptFrom(itemId) {
  const out = [];
  for (const [name, sp] of Object.entries((data && data.species) || {})) {
    if (sp.produce && sp.produce.item === itemId) out.push({ species: sp.name || name, how: sp.produce.verb });
    if (sp.lays && sp.lays.item === itemId) out.push({ species: sp.name || name, how: "lay" });
    if (sp.lays && itemId === "feather") out.push({ species: sp.name || name, how: "lay" });
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
    leaderId: null, // the player leading it on a lead (docs/45 section 1)
    fedDay: -1, // the game day it last ate from a trough (step 3): fed today, it gives today
    takenDay: -1, // the game day its milk or wool was last taken
    bredDay: -1, // the game day it last bred (-1: never)
    lastDay: today(), // the game day it last ate
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
    case "led": {
      led(a, dt, others, threats, sp);
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

// ---- led on a lead (docs/45 section 1) ----
// It keeps its leader's pace, a walk or a sprint (the review of #460: a cow dropped on the road at a slower fixed speed): the farther behind, the
// faster, `keep.leadPull` a second for each tile up to `keep.leadMax`, and stands when within `keep.leadClose`. It is lost only when it truly
// cannot follow: no way to its leader for `keep.leadStuck` seconds, or its leader gone, dead, or out past `keep.leadReach`. A lost lead keeps
// the old home, so the animal walks back to it; only the player's own Let go makes where it stands its home (and a pen holds it then).
function led(a, dt, others, threats, sp) {
  const K = keepRule();
  const t = threats.find((q) => q.id === a.leaderId && q.kind === "player");
  const d = t ? Math.hypot(t.gx - a.gx, t.gy - a.gy) : Infinity;
  if (!t || t.dead || d > K.leadReach) {
    loseLead(a);
    return;
  }
  if (d <= K.leadClose) {
    a.path = [];
    a.stuckFor = 0;
    playAnimation(a.anim, "idle");
    faceToward(a, t.gx - a.gx, t.gy - a.gy);
    separate(a, dt, others);
    return;
  }
  a.repathTimer -= dt;
  if (a.repathTimer <= 0 || !a.path.length) repath(a, [Math.round(t.gx), Math.round(t.gy)]);
  if (a.pathFailed || !a.path.length) {
    a.stuckFor = (a.stuckFor || 0) + dt;
    if (a.stuckFor >= K.leadStuck) loseLead(a);
    playAnimation(a.anim, "idle");
    return;
  }
  a.stuckFor = 0;
  playAnimation(a.anim, "walk");
  a.speed = Math.min(K.leadMax, Math.max(sp.walk, d * K.leadPull));
  followPath(a, dt, others);
  a.speed = sp.walk;
}

// The player's own Let go: where it stands is its home now.
function letGo(a) {
  a.home = [Math.round(a.gx), Math.round(a.gy)];
  loseLead(a);
}

// A lead lost (or let go): it is nobody's, and wanders round its home, wherever that is.
function loseLead(a) {
  a.leaderId = null;
  a.stuckFor = 0;
  a.path = [];
  if (!a.dead) {
    a.state = "idle";
    a.idleTimer = 1;
    playAnimation(a.anim, "idle", true);
  }
}

// Once a second (game.js): a lead whose leader is not a present, living player is lost, so a guest who led an animal off and went away (an
// animal far from everyone is not stepped) has its lead back, and a carcass keeps no leader.
export function freeLostLeads(animals, players) {
  for (const a of animals) {
    if (!a.leaderId) continue;
    if (a.dead || !players.some((p) => p.id === a.leaderId && !p.dead)) loseLead(a);
  }
}

// How many animals a player leads, and how many leads they carry (one lead, one animal).
function ledBy(player) {
  return animalList().filter((a) => a.leaderId === player.id && !a.dead).length;
}
function leadsCarried(player) {
  return inventory.countAll(player, "lead");
}

// Why a player cannot lead this animal now, or "".
export function leadProblem(player, a) {
  if (!a || a.dead) return "There is nothing there.";
  if (isWild(a)) return `A ${a.name} will not be led.`;
  if (a.leaderId === player.id) return "You are leading it.";
  if (a.leaderId) return "Someone else is leading it.";
  const why = reachProblem(player, [[Math.round(a.gx), Math.round(a.gy)]], BODY_REACH);
  if (why) return why === "Too far away." ? `Too far from the ${a.name}.` : why;
  const tool = inventory.toolProblem(player, "lead");
  if (tool) return tool;
  if (ledBy(player) >= leadsCarried(player)) return "Your lead is in use.";
  return "";
}

verbs.define("lead", {
  validate(world, player, target) {
    return leadProblem(player, animalOf(target)) || true;
  },
  perform(world, player, target) {
    const a = animalOf(target);
    a.leaderId = player.id;
    a.state = "led";
    a.path = [];
    a.repathTimer = 0;
    return { ok: true, message: `You put the lead on the ${a.name}.` };
  },
});

verbs.define("letgo", {
  validate(world, player, target) {
    const a = animalOf(target);
    if (!a || a.leaderId !== player.id) return "You are not leading it.";
    return true;
  },
  perform(world, player, target) {
    const a = animalOf(target);
    letGo(a);
    return { ok: true, message: `You let the ${a.name} go. It will stay near here.` };
  },
});

// ---- what a fed animal gives (docs/45 section 3) ----
// Milk and wool are taken by hand once a day from an animal fed that day, its tool carried (a bucket, shears): the product to the bag or
// the feet, one more at `keep.more` (pens that give more, Beastlore 6, open to all until the skills).
export function produceProblem(player, a) {
  const sp = a && speciesOf(a.species);
  const pr = sp && sp.produce;
  if (!a || a.dead || !pr) return "There is nothing to take.";
  if (a.fedDay !== today()) return `The ${a.name} has not been fed today.`;
  if (a.takenDay === today()) return pr.verb === "milk" ? "It has been milked today." : "It has been shorn today.";
  const why = player ? reachProblem(player, [[Math.round(a.gx), Math.round(a.gy)]], BODY_REACH) : "";
  if (why) return why === "Too far away." ? `Too far from the ${a.name}.` : why;
  if (!player) return "";
  const tool = inventory.toolProblem(player, pr.verb);
  if (tool) return tool;
  const held = inventory.carriedTool(player, pr.verb);
  if (held && held.fill > 0) return "Empty the bucket first."; // milk is a jug, not the bucket's fill (Primary's default): a bucket of water does not milk
  return "";
}

function produceVerb(verb) {
  verbs.define(verb, {
    validate(world, player, target) {
      const a = animalOf(target);
      if (a && speciesOf(a.species).produce && speciesOf(a.species).produce.verb !== verb) return "That is not how.";
      return produceProblem(player, a) || true;
    },
    perform(world, player, target) {
      const a = animalOf(target);
      const pr = speciesOf(a.species).produce;
      const [lo, hi] = pr.count;
      const n = lo + rng.int(hi - lo + 1) + (rng.chance(keepRule().more) ? 1 : 0);
      give(player, pr.item, n);
      a.takenDay = today();
      return { ok: true, message: `You ${verb === "milk" ? "milk" : "shear"} the ${a.name}: ${said([{ id: pr.item, count: n }])}.` };
    },
  });
}
produceVerb("milk");
produceVerb("shear");

// ---- feeding, laying, breeding: checked every second ----
// A tame animal fed nothing yet today eats one unit as soon as a trough it can reach holds feed: in a pen, a trough on that pen's own
// fences (a trough is solid, so it stands at the pen's edge of the flood or inside it); out of a pen, one within `keep.feedReach` tiles of
// its home. A trough is a prop whose definition says `feed`, holding an item tagged `feed`.
function troughsNear(x, y, radius) {
  const out = [];
  const R = Math.ceil(radius);
  for (let dy = -R; dy <= R; dy++) for (let dx = -R; dx <= R; dx++) {
    if (Math.hypot(dx, dy) > radius) continue;
    const pr = peekTile(Math.round(x) + dx, Math.round(y) + dy)?.prop;
    if (pr && pr.bag && isFeedTrough(pr) && pr.bag.items.some(isFeed) && !out.includes(pr)) out.push(pr);
  }
  return out;
}
function troughFor(a) {
  const K = keepRule();
  const near = troughsNear(a.gx, a.gy, Math.max(K.feedReach, Math.sqrt(K.penMax)));
  if (!near.length) return null;
  const pen = penOf(a);
  if (pen) return near.find((t) => t.tiles.some(([x, y]) => [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => pen.has(`${x + dx},${y + dy}`)))) || null;
  return near.find((t) => t.tiles.some(([x, y]) => Math.hypot(x - a.home[0], y - a.home[1]) <= K.feedReach)) || null;
}
let defOf = () => null; // the sprite definitions, handed in by game.js (assets.getDef): a trough is a definition's `feed`
export function setDefs(fn) {
  defOf = fn;
}
function isFeedTrough(prop) {
  const d = defOf(prop.sprite);
  return !!(d && d.feed);
}
function isFeed(e) {
  const def = e && items.getItem(e.id);
  return !!(def && def.tags && def.tags.includes("feed"));
}
// One unit of feed out of a trough: the first feed in its grid.
function eatFrom(trough) {
  const e = trough.bag.items.find(isFeed);
  if ((e.count || 1) > 1) e.count -= 1;
  else grid.remove(trough.bag, e);
  markDirty(trough.tile[0], trough.tile[1]);
}

// A hen's coop: a chicken coop within `keep.coopReach` of its home, its grid made on first use (as a container's is).
function coopFor(a) {
  const R = keepRule().coopReach;
  const [hx, hy] = a.home;
  for (let dy = -R; dy <= R; dy++) for (let dx = -R; dx <= R; dx++) {
    const pr = peekTile(Math.round(hx) + dx, Math.round(hy) + dy)?.prop;
    if (pr && pr.sprite === "chicken_coop" && pr.container) {
      if (!pr.bag) {
        const [c, r] = items.containerGrid(pr.container.loot);
        pr.bag = inventory.createBag(c, r, "chicken coop");
        pr.searched = false;
      }
      return pr;
    }
  }
  return null;
}
function lay(a, coop) {
  const L = speciesOf(a.species).lays;
  const K = keepRule();
  const [lo, hi] = L.count;
  const n = lo + rng.int(hi - lo + 1) + (rng.chance(K.more) ? 1 : 0);
  for (let i = 0; i < n; i++) grid.insert(coop.bag, items.makeEntry(L.item, 1)); // a full coop takes no more
  if (rng.chance(K.feather)) grid.insert(coop.bag, items.makeEntry("feather", 1));
  markDirty(coop.tile[0], coop.tile[1]);
}

// The pen an animal stands in: every tile it could walk to without crossing a fence, a wall, or a shut gate, when that is at most
// `keep.penMax` tiles; null in the open.
export function penOf(a) {
  const max = keepRule().penMax;
  const start = [Math.round(a.gx), Math.round(a.gy)];
  const seen = new Set([`${start[0]},${start[1]}`]);
  const queue = [start];
  while (queue.length) {
    const [x, y] = queue.shift();
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx;
      const ny = y + dy;
      const k = `${nx},${ny}`;
      if (seen.has(k) || !canStep(x, y, nx, ny)) continue;
      seen.add(k);
      if (seen.size > max) return null;
      queue.push([nx, ny]);
    }
  }
  return seen;
}

// Once a second of sim time on the authority (game.js): every tame animal not yet fed today eats as soon as it can (and, fed, a hen lays into
// its coop); then two of a kind fed today in one pen with room, rested since their last young, have one, beside a parent in the pen. A birth
// may come in view (Primary's default, for Michael: his rule that nothing pops into view "was mostly a zombie rule so they don't bum rush you
// unfairly", and a young one in a pen is a cosy arrival); one owed waits only for feed, room, and its days. Returns the young (the caller adds them).
export function dailyStep(animals) {
  const day = today();
  const K = keepRule();
  const feeding = Math.floor(loop.simTime()) % 5 === 0; // the troughs looked for every fifth second (a wide look, for every hungry animal); the rest every second
  for (const a of animals) {
    if (!feeding || a.dead || isWild(a) || a.fedDay === day || a.state === "led") continue;
    const t = troughFor(a);
    if (!t) continue;
    eatFrom(t);
    a.fedDay = day;
    a.lastDay = day;
    if (speciesOf(a.species).lays) {
      const coop = coopFor(a);
      if (coop) lay(a, coop);
    }
  }
  const born = [];
  const done = new Set();
  const rested = (q) => q.bredDay < 0 || q.bredDay + K.breedDays <= day; // never bred, or its days since are past
  for (const a of animals) {
    if (a.dead || isWild(a) || done.has(a.id) || a.fedDay !== day || !rested(a) || a.state === "led") continue;
    const pen = penOf(a);
    if (!pen) continue;
    const inPen = (q) => pen.has(`${Math.round(q.gx)},${Math.round(q.gy)}`);
    const kin = animals.filter((q) => !q.dead && q.species === a.species && inPen(q));
    for (const q of kin) done.add(q.id);
    const ready = kin.filter((q) => q.fedDay === day && rested(q) && q.state !== "led");
    if (ready.length < 2 || kin.length >= K.penCap || pen.size < K.roomPerHead * (kin.length + 1)) continue;
    // The free tile of the pen nearest the first parent: beside it.
    const p0 = ready[0];
    let spot = null;
    let best = Infinity;
    for (const k of pen) {
      const [x, y] = k.split(",").map(Number);
      const dd = Math.hypot(x - p0.gx, y - p0.gy);
      if (dd >= best || roomAt(x, y) !== 0 || animals.some((q) => !q.dead && Math.round(q.gx) === x && Math.round(q.gy) === y)) continue;
      spot = [x, y];
      best = dd;
    }
    if (!spot) continue;
    born.push(createAnimal(a.species, spot[0], spot[1], { home: p0.home.slice(), homeId: p0.homeId }));
    ready[0].bredDay = day;
    ready[1].bredDay = day;
  }
  return born;
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
    a.leaderId = null; // a carcass keeps no leader
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

// A yield's count: rolled in its range, then the share the kill left (`kills`) taken as its expected value, the whole part and one more
// at the chance of the rest (Primary's default, the review of #456: rounding gave every one-count yield, a hide or a rabbit's meat, the
// same whatever the weapon). The generator is asked for the rest only when there is one.
function rollYields(a, how) {
  const share = killShare(a.killedBy || "melee");
  const out = [];
  for (const y of (speciesOf(a.species).yields || {})[how] || []) {
    const [lo, hi] = y.count;
    const e = (lo + rng.int(hi - lo + 1)) * share;
    const whole = Math.floor(e + 1e-9);
    const n = whole + (e - whole > 1e-9 && rng.float() < e - whole ? 1 : 0);
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
  const name = (y) => items.countName(y.id, y.count); // "3 raw venison", "some lard", "2 feathers" (the item's `noun` and `plural`)
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
export const GAME_HOUR = clock.DAY_LENGTH / 24; // clock seconds in a game hour
const HOUR = GAME_HOUR;

// The snares set in the world, by prop id: noted when one is set (setdown.js) and read again from the map when a world is made or put
// back (game.js), so the step looks at a handful of props, never every tree; one gone from the map drops out at the next look.
const snareIds = new Set();
export function noteSnare(prop) {
  if (prop && prop.snare) snareIds.add(prop.id);
}
export function resetSnares(props) {
  snareIds.clear();
  for (const p of props) if (p.snare) snareIds.add(p.id);
}
export function setSnares(byId) {
  const out = [];
  for (const id of snareIds) {
    const p = byId(id);
    if (p && p.snare) out.push(p);
    else snareIds.delete(id);
  }
  return out;
}
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
  if (a.state === "led") return `A ${a.name}, on a lead.`;
  if (!speciesOf(a.species).wild) return a.fedDay === today() ? `A ${a.name}. Fed today.` : `A ${a.name}, hungry: a feeding trough near it, filled, would feed it.`;
  const sp = speciesOf(a.species);
  if (a.state === "flee") return `A ${a.name}, running.`;
  if (sp.wild) return a.state === "eat" ? `A ${a.name}, grazing. It has not seen you.` : `A ${a.name}. Wild; it keeps its distance.`;
  return a.state === "eat" ? `A ${a.name}, grazing.` : `A ${a.name}. Somebody's, once.`;
}
