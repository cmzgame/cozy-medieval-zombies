// Animals (docs/45, step 1): the valley's game and livestock, characters of the world stepped on the host as the dead and the
// villagers are. Each species is a row of `data/animals.json` (its walk and run, what it flees, how far it wanders from home,
// what it gives); each animal belongs to a home the map names (a wood for game, a pen for livestock) and drifts back toward
// it, never walled in by a rule: deer cross a field, a rabbit comes into the village, and the animals of a pen left open
// wander out and stay near. The dead ignore them (they are in none of the dead's lists), and they wear and hold nothing,
// so an animal is a small record of its own, not the human model (docs/45 section 6): its sheet is a drawn one (or the dev
// art, `placeholders.generateAnimal`) whose named animations it plays as it moves: idle, walk, run, eat, dead.
// Every roll is the sim's generator's and every time the sim's (the step's dt, the game's clock); nothing here reads a window.

import { createAnimation, playAnimation, advanceAnimation } from "../sprites.js";
import { getSheet } from "../assets.js";
import { repath, followPath, separate, pickTargetAround } from "./movement.js";
import { lineOfSight } from "../visibility.js";
import { isWalkableTile, roomAt } from "../map.js";
import * as rng from "../rng.js";
import * as clock from "../clock.js";
import { nextId } from "../world.js";

let data = null;

export function load(json) {
  data = json && json.species ? json : { species: {}, renew: { seconds: 720, clear: 30 } };
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
  return (data && data.renew) || { seconds: 720, clear: 30 };
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

function anyWithin(a, threats, radius) {
  return threats.some((t) => Math.hypot(t.gx - a.gx, t.gy - a.gy) <= radius);
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
        else if (!anyWithin(a, threats, sp.flee ? sp.flee.clear : 0)) {
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
    default:
      settle(a, sp);
  }
  a.facing = diagonal(a.facing, prev);
  advanceAnimation(a.anim, sheet, dt);
}

// ---- homes (docs/45 section 1): where the map put each herd or flock, and the renewal of game up to a cap ----
// A home: { id, species, at, radius, cap, renew, nextAt }. The animals made at a world's birth stand round it (at most two
// tiles off its point, on the clearing the map keeps there); a wild home below its cap has one back each `renew.seconds`
// of the game's clock, at its point, never while a player is within `renew.clear` tiles (nothing materialises in view).
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
    if (players.some((p) => !p.dead && Math.hypot(p.gx - h.at[0], p.gy - h.at[1]) <= R.clear)) continue; // waits until nobody is near
    born.push(createAnimal(h.species, h.at[0], h.at[1], { home: h.at.slice(), homeId: h.id }));
    h.nextAt = living + 1 < h.cap ? now + R.seconds : null;
  }
  return born;
}

// What Look at says (docs/45: a name on hover, Object Highlight; the client's own line, nothing sent).
export function lookLine(a) {
  if (a.dead) return `A dead ${a.name}.`;
  const sp = speciesOf(a.species);
  if (a.state === "flee") return `A ${a.name}, running.`;
  if (sp.wild) return a.state === "eat" ? `A ${a.name}, grazing. It has not seen you.` : `A ${a.name}. Wild; it keeps its distance.`;
  return a.state === "eat" ? `A ${a.name}, grazing.` : `A ${a.name}. Somebody's, once.`;
}
