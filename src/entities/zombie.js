// The dead. Copied from cozy-zombie-game src/entities/zombie.js on 2026-10-09 and
// cut down for the probe: idle, wander, chase, bite. Combat (damage, knockdown,
// bodies) returns with the combat milestone.
//
// Memory (Michael, 2026-10-09): the dead know only where they last saw you.
// They chase that spot, and when they get there without seeing you they search
// around it for a while and then give up. Nothing tells them your position
// through a wall. Noise is deliberately not a factor yet (docs/02).

import * as rng from "../rng.js";
import { nextId } from "../world.js";
import { rules } from "../rules.js";
import { wardrobeCount } from "../figure.js";
import { createCharacter, wardrobeInto, dressCorpse, say } from "./character.js";
import * as iso from "../iso.js";
import { moveCircle, isWalkableTile, nearestWalkable, tileAt, getRoom, breachTarget, breachTargets, damageOpening, wayOpen, needsBreaking, fenceAhead, pressFence, canStepAcross, wallBetween, edgeBetween, edgeMid, isFence, floorSpeedAt, openingsNear, edgeTiles } from "../map.js";
import { lineOfSight, openingOnLine } from "../visibility.js";
import * as light from "../light.js";
import * as clock from "../clock.js";
import { getSheet } from "../assets.js";
import { createAnimation, playAnimation, advanceAnimation, isActiveFrame } from "../sprites.js";
import { emit } from "../events.js";
import { zombie as T } from "../tuning.js";
import { idleTime, roomOf, faceToward, tileOf, repath, followPath, separate, pickTargetAround, canReach } from "./movement.js";
import { findPath } from "../pathfind.js";
// The walking is movement.js's, shared with the villagers (docs/23a, D7); still exported here for the files that import it from the dead.
export { idleTime, roomOf, faceToward, repath, followPath, separate, pickTargetAround };

// How a hit staggers (docs/02 question 29b, Michael: stun plus knockdown on every hit felt too strong).
// `chance` is the default that a hit staggers at all (each weapon has its own `staggerChance`, by weight);
// `immunity` is the seconds after a stagger ends in which another cannot start, so a stream of hits cannot
// hold one of the dead forever. A bite under way is not cancelled by a stagger, only by a knockdown or a
// weapon that `interrupts` (the heavy ones). Filled from data/combat.json.
export const STAGGER_RULES = { chance: 0.5, immunity: 0.6 };


export function createZombie(gx, gy, { id = null, hp = T.hp, aggro = false } = {}) {
  // The id from the world's counter (docs/31/08, habit 1), so a save carries it and a
  // zombie made after a restore never takes a saved one's name (docs/31/05, item 24).
  const z = {
    ...createCharacter("zombie", gx, gy, { id: id || nextId("z"), speed: T.speed, radius: T.radius, hp, maxHp: T.hp }),
    state: aggro ? "chase" : "idle",
    aggro,
    lastSeen: null, // [gx, gy] where the player was last seen
    seesNow: false,
    target: null, // who it is hunting right now: the player, or (the setting on) a villager it can see
    searchTimer: 0,
    path: [],
    groanTimer: rng.float() * T.groanMax, // so the dead do not all groan together
    repathTimer: 0,
    sightTimer: rng.float() * T.sightCheck,
    lastGoal: null,
    idleTimer: idleTime(),
    attackCooldown: 0,
    attackHit: false,
    pathFailed: false,
    breach: null, // { wall, tx, ty, edge, stand, side, into } while breaking in
    press: null, // { wall, tx, ty, edge, stand } while it presses a fence or gate across its way (map.pressFence; not saved)
    siege: null, // { at: [x, y] a tile in the house, openings: [{ tx, ty, edge }], dawn: clock elapsed, idx, switchAt, pid } while it holds a siege (#147)
    lastOut: null, // [x, y] where the player was last seen in the open (noteSighting: the door on the line from there is the way in)
    seenRoom: -1, // the room the player was in at its last sighting (0 outside, -1 never seen): a change from outside to a room is a player going in
    noWay: 0, // seconds left in which no way in is looked for again (T.noWayTime): none was found, so it searches instead
    sincePlayer: Infinity, // seconds since the player was last seen
    stuckTime: 0,
    hits: [], // when the player's blows landed, for the third-hit rule (combat.js)
    stagger: 0, // seconds left of being stopped by a blow
    staggerImmune: 0, // seconds left in which a blow cannot stagger it again (STAGGER_RULES)
    knock: null, // { x, y, left } a push being spread over T.knockTime
    downTimer: 0, // seconds left on the floor
    upTimer: 0, // seconds left of getting up
    gettingUp: false,
  };
  // Dressed from one of the dead's wardrobes (data/wardrobes.json, docs/19).
  wardrobeInto(z, "zombie", rng.int(wardrobeCount("zombie")));
  return z;
}

// On the floor, lying or rising: a hit now is a finisher (docs/14).
// A blow met by a shield: the dead one's attack is lost and it reels for `seconds` (docs/21).
export function staggerZombie(z, seconds, dir = null, push = 0) {
  if (z.dead || isDown(z)) return;
  if (dir && push > 0) z.knock = { x: dir.x * push, y: dir.y * push, left: T.knockTime };
  z.attackHit = false;
  if (z.state === "attack") {
    z.state = "chase";
    z.attackCooldown = T.cooldown;
  }
  z.stagger = Math.max(z.stagger, seconds);
  playAnimation(z.anim, "hurt", true);
}

export function isDown(z) {
  return z.state === "down";
}

// Hurt a zombie (docs/14). `dir` is the grid unit vector the blow travels
// along, `knockback` tiles of push, `knockdown` floors it, `stagger` seconds it
// is stopped, `from` where the blow came from (the dead then know where). A
// downed zombie takes the damage and nothing else. Returns { killed, downed }.
export function damageZombie(z, amount, { dir = [0, 0], knockback = 0, knockdown = false, stagger = T.stagger, staggerChance = STAGGER_RULES.chance, interrupts = false, from = null } = {}) {
  if (z.dead) return { killed: false, downed: false };
  const wasDown = isDown(z);
  z.hp = Math.max(0, z.hp - amount);
  z.path = [];
  z.lastGoal = null;
  if (knockback > 0 && !wasDown) z.knock = { x: dir[0] * knockback, y: dir[1] * knockback, left: T.knockTime };
  if (z.hp <= 0) {
    kill(z);
    return { killed: true, downed: false };
  }
  // The dead then know where the blow came from, when they are hunting at all.
  if (from && rules.zombieAggro) {
    z.aggro = true;
    z.lastSeen = [from[0], from[1]];
    z.sincePlayer = 0;
  }
  if (wasDown) return { killed: false, downed: false };
  if (knockdown) {
    // Floored: whatever it was doing is lost, a bite begun and a breach.
    z.attackHit = false;
    z.state = "down";
    z.breach = null;
    z.downTimer = T.downTime;
    z.gettingUp = false;
    z.stagger = 0;
    playAnimation(z.anim, "die", true);
    return { killed: false, downed: true };
  }
  // Does the blow stagger it? Not while it is immune from the last stagger, not at all by chance (light
  // weapons seldom), and not a bite already under way unless the weapon interrupts: it shrugs the blow
  // off and finishes the bite (the damage and the push still land).
  const biting = z.state === "attack";
  if (z.staggerImmune > 0 || (biting && !interrupts) || !rng.chance(staggerChance)) return { killed: false, downed: false, staggered: false };
  z.attackHit = false;
  if (biting) z.state = "chase";
  z.stagger = Math.max(z.stagger, stagger);
  z.staggerImmune = z.stagger + STAGGER_RULES.immunity;
  playAnimation(z.anim, "hurt", true);
  return { killed: false, downed: false, staggered: true };
}

// Dead: the fall plays once and holds, the body stays, nothing thinks again.
function kill(z) {
  z.dead = true;
  z.state = "dead";
  z.breach = null;
  z.stagger = 0;
  z.gettingUp = false;
  playAnimation(z.anim, "die", true);
  emit("zombieDied", { zombie: z });
}

// A burn's share of a step (burn.js, #14): health and nothing else. Not a blow: no push, no stagger, no knowing
// where it came from, and the path kept (damageZombie clears it, which every step would stop the dead in their
// tracks). Returns whether it killed.
export function burnZombie(z, amount) {
  if (z.dead) return false;
  z.hp = Math.max(0, z.hp - amount);
  if (z.hp > 0) return false;
  z.path = [];
  kill(z);
  return true;
}

// Pushed, stopped, or on the floor: nothing else happens until it is over.
// Returns true when the zombie is not free to act this step.
function updateHurt(z, dt, sheet) {
  if (z.knock) {
    const k = Math.min(dt, z.knock.left) / T.knockTime;
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
        z.upTimer = T.getUpTime;
      }
    } else {
      // Rising is the fall backwards: the frames, last to first, over T.getUpTime.
      z.upTimer -= dt;
      z.anim.name = "die";
      z.anim.done = false;
      z.anim.frame = Math.max(0, Math.min(3, Math.floor((Math.max(0, z.upTimer) / T.getUpTime) * 4)));
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
  if (z.staggerImmune > 0) z.staggerImmune -= dt;
  if (z.stagger > 0) {
    z.stagger -= dt;
    advanceAnimation(z.anim, sheet, dt);
    if (z.stagger <= 0) playAnimation(z.anim, "idle", true);
    return true;
  }
  return false;
}


// The room the dead want into: where they last saw the player.
function goalRoom(z) {
  if (!z.lastSeen) return 0;
  return tileAt(Math.round(z.lastSeen[0]), Math.round(z.lastSeen[1])).room;
}

// The way in to a room the dead want: the nearest opening of it they can walk to and stand beside. A door is the way in
// (nobody climbs through a window), and a window still shut or boarded is battered open for sight, never to pass
// (Michael, #134): so the nearest of the doors and those windows, and once a window is open only the doors are left, or,
// with no door they can reach, nothing, and they search. When no door can be walked to, because each opens from another
// shut room (a hall, a porch, a house within a house), it is the door into that room they go for first, and so on a few
// rooms deep (doors only, the windows of the rooms between would get them nothing). `want` is the room they are after,
// kept on the target so the breach is not dropped for leading into a room that is not it.
function wayIn(z, room, want, seen = new Set([room.id]), depth = 0) {
  const doors = breachTargets(room, z.gx, z.gy, 0, depth === 0);
  // The opening they saw the player use comes first (Michael, #147: "the dead go where they saw you go"), among those they can
  // walk to, then the nearest.
  const known = (c) => depth === 0 && !!z.siege && z.siege.openings.some((o) => o.tx === c.tx && o.ty === c.ty && o.edge === c.edge);
  const direct = doors.find((c) => known(c) && canReach(z, c.stand)) || doors.find((c) => canReach(z, c.stand));
  if (direct) return direct;
  if (depth >= 3) return null;
  let best = null;
  for (const c of doors) {
    const from = tileAt(c.stand[0], c.stand[1]).room;
    if (c.wall.kind !== "door" || from <= 0 || seen.has(from)) continue;
    seen.add(from);
    const outer = getRoom(from);
    const t = outer ? wayIn(z, outer, want, seen, depth + 1) : null;
    if (t && (!best || t.d < best.d)) best = t;
  }
  return best;
}

// The fence across the dead's way to a goal they cannot reach (Michael, 2026-10-17, #147: "a crowd breaks a fence"; and the
// law that a window looking out on the dead is never a safe spot, so neither is a house in a fenced yard): walk the way as
// if every closed gate could be crossed, else every closed fence, and the first fence edge on it is the one to press. A gate
// is sought as the opening when there is one (it goes first: half the hp); the dead do not seek out a gate otherwise, it goes
// first only where they stand at it. Returns { wall, tx, ty, edge, stand } or null.
function fenceWay(z, goal) {
  const start = tileOf(z);
  for (const mode of ["gate", "fence"]) {
    const path = findPath(start, goal, canStepAcross(mode), 500);
    if (!path) continue;
    let px = start[0];
    let py = start[1];
    for (const [nx, ny] of path) {
      if (Math.abs(nx - px) + Math.abs(ny - py) === 1) {
        const w = wallBetween(px, py, nx, ny);
        if (isFence(w) && !wayOpen(w)) {
          const [ex, ey, edge] = edgeBetween(px, py, nx, ny);
          return { wall: w, tx: ex, ty: ey, edge, stand: [px, py] };
        }
      }
      px = nx;
      py = ny;
    }
  }
  return null;
}

function startPress(z, f) {
  z.press = f;
  z.state = "press";
  z.path = [];
  z.breach = null;
  z.lastGoal = null;
  z.repathTimer = 0;
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

function distTo(z, e) {
  return Math.hypot(e.gx - z.gx, e.gy - z.gy);
}


// Symmetric with the player's own sight: if you could see it, it can see you.
// The range scales with the light on the player (the cozy parent's rule):
// unlit at night about a third, in a pool or by day the whole of it.
function canSee(z, player) {
  if (player.dead || !rules.zombieAggro) return false;
  const range = T.sight * (T.sightDarkFraction + (1 - T.sightDarkFraction) * light.lightAt(player.gx, player.gy));
  if (distTo(z, player) > range) return false;
  return lineOfSight(z.gx, z.gy, player.gx, player.gy);
}

// The nearest living player, seen or not (the chase's fallback, the spawned-aggro target).
function nearestPlayer(z, players) {
  let best = null;
  let bestD = Infinity;
  for (const p of players) {
    if (p.dead) continue;
    const d = distTo(z, p);
    if (d < bestD) {
      best = p;
      bestD = d;
    }
  }
  return best;
}

// The nearest player in sight by the player's own rule (canSee).
function nearestSeenPlayer(z, players) {
  let best = null;
  let bestD = Infinity;
  for (const p of players) {
    if (p.dead) continue; // a fallen player draws no one while another still stands
    const d = distTo(z, p);
    if (d >= bestD || !canSee(z, p)) continue;
    best = p;
    bestD = d;
  }
  return best;
}

// A villager in sight, the same rule as the player's: the range scales with the
// light on them, and a clear line.
function canSeeCharacter(z, c, d) {
  const range = T.sight * (T.sightDarkFraction + (1 - T.sightDarkFraction) * light.lightAt(c.gx, c.gy));
  return d <= range && lineOfSight(z.gx, z.gy, c.gx, c.gy);
}

// With the setting on, the nearest living villager in sight (docs/19). Only asked
// when the player is not in sight: the dead always prefer the player.
function nearestPrey(z, villagers) {
  if (!villagers || !villagers.length || !rules.zombiesAttackVillagers) return null;
  let best = null;
  let bestD = Infinity;
  for (const v of villagers) {
    if (v.dead || v.immune) continue; // an immune villager is never prey (#180)
    const d = distTo(z, v);
    if (d >= bestD || !canSeeCharacter(z, v, d)) continue;
    best = v;
    bestD = d;
  }
  return best;
}

// At night the dead see fire from far away (docs/02, 2026-10-09): the nearest
// lit flame within T.flameRange scaled by how dark it is, with a clear line.
// A carried torch is a sighting of the player; any other flame is a sighting
// at the flame, and the memory rule does the rest.
function nearestFlame(z) {
  if (!rules.zombieAggro) return null;
  const nf = clock.nightFactor();
  if (nf <= 0) return null;
  const range = T.flameRange * nf;
  let best = null;
  let bestD = Infinity;
  for (const s of light.allSources()) {
    const d = Math.hypot(s.gx - z.gx, s.gy - z.gy);
    // A torch on the belt is a weaker flame (docs/02): seen from `beltLight` (0.6) as far.
    if (d > range * (s.strength ?? 1) || d >= bestD) continue;
    if (!lineOfSight(z.gx, z.gy, s.gx, s.gy)) continue;
    best = s;
    bestD = d;
  }
  return best;
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
  const sp = z.speed * floorSpeedAt(z.gx, z.gy); // shallow water slows the dead too (docs/30, law 8)
  const moved = moveCircle(z.gx, z.gy, z.radius, n.x * sp * dt, n.y * sp * dt);
  z.gx = moved.gx;
  z.gy = moved.gy;
  separate(z, dt, others);
  return Math.hypot(dx, dy) < 0.2;
}

function startSearch(z) {
  z.state = "search";
  z.searchTimer = T.searchTime;
  z.path = [];
  z.lastGoal = null;
  z.idleTimer = 0;
}

// ---- the siege (Michael, 2026-10-17, #147): the dead that know a player is inside wait until the next dawn ----

const hashId = (id) => [...String(id)].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7);

function rememberOpening(s, o) {
  if (s.openings.some((k) => k.tx === o.tx && k.ty === o.ty && k.edge === o.edge)) return;
  s.openings.push({ tx: o.tx, ty: o.ty, edge: o.edge });
  if (s.openings.length > 4) s.openings.shift();
}

// A player in sight: if they are inside a room this one is not in, it knows where they went. It records the door they
// crossed on the way in (the sighting that finds them in a room after one outside), and any window it sees them
// through; a player seen out in the open ends it, and the ordinary chase goes on.
function noteSighting(z, p) {
  const room = tileAt(Math.round(p.gx), Math.round(p.gy)).room;
  const here = tileAt(Math.round(z.gx), Math.round(z.gy)).room;
  // A siege is the night's ("They stay at night", "the siege bites at night"): from dusk to the dawn it ends at; by day a sighting
  // is the ordinary chase, and a watcher is not given another siege to the next morning.
  const night = ["dusk", "night"].includes(clock.getPhase());
  if (room <= 0) z.lastOut = [p.gx, p.gy]; // where the player was last seen in the open: the way in is the door on the line from there
  if (room <= 0 || room === here || !night) {
    z.siege = null;
    z.seenRoom = room;
    return;
  }
  if (!z.siege) z.siege = { at: [0, 0], openings: [], dawn: clock.getElapsed() + clock.secondsUntilHour(T.siegeEndHour), idx: hashId(z.id), switchAt: clock.getElapsed() + T.siegeSwitch, pid: p.id };
  const s = z.siege;
  s.at = [Math.round(p.gx), Math.round(p.gy)];
  s.pid = p.id;
  if (z.seenRoom === 0) { // its last sighting had the player out in the open, this one has them in: they went in by a door near them
    // The door the line from where it last saw them outside to where it sees them now crosses, which is the one they went through
    // when two doors stand close; failing that (a sighting through a window), the door nearest them.
    const crossed = z.lastOut ? openingOnLine(z.lastOut[0], z.lastOut[1], p.gx, p.gy) : null;
    const door = crossed && crossed.wall.kind === "door" ? crossed : openingsNear(p.gx, p.gy, 1.6).find((o) => o.wall.kind === "door");
    if (door) rememberOpening(s, door);
  }
  const win = openingOnLine(z.gx, z.gy, p.gx, p.gy);
  if (win && win.wall.kind === "window") rememberOpening(s, win);
  z.seenRoom = room;
}

// Whether it still holds a siege: before its dawn, on a player who is still alive.
export function siegeOn(z, players) {
  const s = z.siege;
  if (!s || clock.getElapsed() >= s.dawn) return false;
  return !players || players.some((p) => p.id === s.pid && !p.dead);
}

// Whether any of the dead holds a siege on this player, near them (`siegeSleepRadius`): the sleep verb asks (player.js). It is
// keyed to the player, not the room: a player seen in the hall cannot sleep in the bedroom (Michael: "while the dead that know
// you are inside are still about").
export function siegeHeldOn(zombies, player) {
  for (const z of zombies) {
    if (z.dead || !z.siege || z.siege.pid !== player.id || !siegeOn(z, null)) continue;
    if (Math.hypot(z.gx - player.gx, z.gy - player.gy) <= T.siegeSleepRadius) return true;
  }
  return false;
}

function startSiege(z) {
  z.state = "siege";
  z.path = [];
  z.lastGoal = null;
  z.breach = null;
  z.repathTimer = 0;
}

function giveUp(z) {
  z.siege = null;
  z.seenRoom = -1;
  z.state = "idle";
  z.aggro = false;
  z.target = null;
  z.lastSeen = null;
  z.path = [];
  z.lastGoal = null;
  z.idleTimer = idleTime();
}

export function updateZombie(z, dt, players, others, villagers = null) {
  const sheet = getSheet(z.sprite);
  if (z.dead) {
    // The fall plays out and holds; a corpse thinks no more (docs/14).
    if (z.knock) updateHurt(z, dt, sheet);
    advanceAnimation(z.anim, sheet, dt);
    // The fall is over: the body becomes one baked frame, so it can be stripped (docs/19).
    if (z.anim.done && !z.corpse) dressCorpse(z);
    return;
  }
  // A groan now and then, from the living dead only (a corpse is silent).
  z.groanTimer -= dt;
  if (z.groanTimer <= 0) {
    if (!isDown(z)) say(z, T.groanText);
    z.groanTimer = T.groanMin + rng.float() * (T.groanMax - T.groanMin);
  }
  if (updateHurt(z, dt, sheet)) return;
  z.attackCooldown = Math.max(0, z.attackCooldown - dt);
  if (z.noWay > 0) z.noWay -= dt;
  z.repathTimer -= dt;
  z.sightTimer -= dt;
  z.sincePlayer += dt;
  if (z.sightTimer <= 0) {
    z.sightTimer = T.sightCheck;
    // The nearest player in sight, players preferred (docs/31/03: one zombie, one target, decided here).
    const seen = nearestSeenPlayer(z, players);
    z.seesNow = !!seen;
    z.target = null;
    if (seen) {
      z.target = seen;
      z.aggro = true;
      z.lastSeen = [seen.gx, seen.gy];
      z.sincePlayer = 0;
      noteSighting(z, seen);
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
      } else if (z.sincePlayer > T.flamePatience) {
        // A flame only takes over once the player has been out of sight a while,
        // so a zombie you just pulled off a window does not turn straight back.
        const f = nearestFlame(z);
        if (f) {
          z.aggro = true;
          z.lastSeen = [f.gx, f.gy]; // a carried flame is where its carrier stands (light.js: the source moves with them)
          if (z.state === "search") {
            z.state = "chase";
            z.repathTimer = 0;
          }
        }
      }
    }
  }
  // The dawn (or the player's death) ends a siege: it loses interest, wherever it has got to, unless it sees one of them.
  if (z.siege && !siegeOn(z, players)) {
    z.siege = null;
    z.seenRoom = -1;
    if (!z.seesNow) {
      z.breach = null;
      giveUp(z);
    }
  }
  // A target that died (a villager, bitten through) is no longer seen.
  if (z.target && z.target.dead) {
    z.target = null;
    z.seesNow = false;
  }
  const tgt = z.target || nearestPlayer(z, players);
  if (!tgt) return; // no one alive to hunt: nothing to do this step
  if (z.aggro && !z.lastSeen) z.lastSeen = [tgt.gx, tgt.gy]; // spawned aggro

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
        z.idleTimer = idleTime();
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
      if (d <= T.contact && z.seesNow) {
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
      const repathTimer0 = z.repathTimer;
      const arrived = moveToward(z, dt, goal, others);
      // Pressed against a fence (or a shut gate) with the player in sight beyond it and no way round: one does nothing,
      // several together wear it until it bursts (map.stepFences, Michael, 2026-10-17, #147).
      if (z.pathFailed && z.seesNow) {
        const f = fenceAhead(z.gx, z.gy, tgt.gx, tgt.gy);
        if (f) pressFence(f.wall, f.tx, f.ty, f.edge);
      }
      // No way there and the goal is in a room: go for the room's nearest
      // opening and break in (docs/09). Only when the dead are not in that
      // room already, and only on the step a path has just failed (not through the backoff after it: choosing a way
      // in searches paths), and not again for T.noWayTime after finding none.
      if (z.pathFailed && z.repathTimer > repathTimer0 && !(z.noWay > 0)) {
        const roomId = goalRoom(z);
        const here = tileAt(Math.round(z.gx), Math.round(z.gy)).room;
        // Shut in a room with the goal elsewhere: break out of this one
        // first. Outside with the goal in a room: break into that one.
        let target = null;
        if (here > 0 && here !== roomId) {
          const room = getRoom(here);
          target = room ? breachTarget(room, z.gx, z.gy, roomId) : null; // out by the door that leads toward the goal's room
          if (!target && roomId > 0 && getRoom(roomId)) target = wayIn(z, getRoom(roomId), roomId); // every door of this room is already open: out by it, then in
        } else if (roomId > 0 && here !== roomId) {
          const room = getRoom(roomId);
          target = room ? wayIn(z, room, roomId) : null;
          if (target) target.want = roomId;
        }
        if (target) {
          startBreach(z, target);
          break;
        }
        // No door it can reach, but a fence across the way (a yard round the house): go and press it, a gate first (`fenceWay`).
        // (To the goal itself, or, with the goal in a house, to the stands of that house's doors, nearest first.)
        let across = null;
        const goalHouse = roomId > 0 && here !== roomId ? getRoom(roomId) : null;
        if (goalHouse) {
          for (const c of breachTargets(goalHouse, z.gx, z.gy, 0, true).slice(0, 4)) {
            across = fenceWay(z, c.stand);
            if (across) break;
          }
        } else across = fenceWay(z, goal);
        if (across) {
          startPress(z, across);
          break;
        }
        // Nothing to break into by: no door it can reach (and no window left to batter). Search round the sighting, and
        // leave the goal alone for a while rather than press at a wall.
        if ((here > 0 || roomId > 0) && here !== roomId) {
          z.noWay = T.noWayTime;
          startSearch(z);
          break;
        }
      }
      const atSighting = Math.hypot(z.lastSeen[0] - z.gx, z.lastSeen[1] - z.gy) <= T.arrived;
      if (!z.seesNow && (arrived || atSighting || z.pathFailed)) startSearch(z);
      break;
    }
    case "breach": {
      const b = z.breach;
      // A bite in reach beats a door; a goal that moved rooms drops the breach.
      if (z.seesNow && distTo(z, tgt) <= T.contact) {
        z.breach = null;
        z.state = "chase";
        break;
      }
      // Keep at it while the goal is still on the other side of this opening:
      // in the room it leads into, or anywhere but the room it leads out of.
      const roomId = goalRoom(z);
      const here = tileAt(Math.round(z.gx), Math.round(z.gy)).room;
      const stillWanted = here > 0 ? roomId !== here : roomId === (b.want || tileAt(b.into[0], b.into[1]).room);
      if (!z.aggro || !stillWanted) {
        z.breach = null;
        z.state = z.aggro ? "chase" : "idle";
        z.repathTimer = 0;
        break;
      }
      const mx = b.edge === "n" ? b.tx : b.tx - 0.5;
      const my = b.edge === "n" ? b.ty - 0.5 : b.ty;
      const dEdge = Math.hypot(mx - z.gx, my - z.gy);
      if (dEdge > T.breachReach) {
        moveToward(z, dt, b.stand, others);
        if (z.pathFailed) {
          // Cannot even reach the opening: give the search a go instead.
          z.breach = null;
          z.noWay = T.noWayTime;
          startSearch(z);
        }
        break;
      }
      faceToward(z, mx - z.gx, my - z.gy);
      // The way is open: through the doorway, or the window battered open to see through (a window is never the way).
      if (b.wall.kind === "door" ? wayOpen(b.wall) : !needsBreaking(b.wall)) {
        z.breach = null;
        z.state = "chase";
        z.repathTimer = 0;
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
        damageOpening(b.wall, b.side, T.breachDamage);
      }
      if (z.anim.done) {
        z.attackCooldown = T.cooldown;
        z.state = "breach";
      }
      break;
    }
    case "search": {
      // Look around the last sighting: short walks nearby, then give up.
      z.searchTimer -= dt;
      if (z.seesNow && !(z.noWay > 0)) {
        z.state = "chase";
        z.repathTimer = 0;
        break;
      }
      if (z.searchTimer <= 0) {
        if (siegeOn(z, players)) startSiege(z); // it knows a player is inside: it waits about the house until dawn, not gives up
        else giveUp(z);
        break;
      }
      if (z.path.length) {
        playAnimation(z.anim, "walk");
        followPath(z, dt, others);
      } else {
        playAnimation(z.anim, "idle");
        z.idleTimer -= dt;
        if (z.idleTimer <= 0) {
          const target = pickTargetAround(z.lastSeen[0], z.lastSeen[1], T.searchRadius, roomOf(z));
          if (target) repath(z, target);
          z.idleTimer = rng.range(0.8, 2.0);
        }
      }
      break;
    }
    case "press": {
      // At a fence across its way: stand against it, a crowd wears it (map.stepFences). It goes on when it is gone, and gives
      // up when it has not seen the player for a while.
      const f = z.press;
      if (!f || tileAt(f.tx, f.ty)[f.edge] !== f.wall || !z.aggro) {
        z.press = null;
        z.state = z.aggro ? "chase" : "idle";
        z.repathTimer = 0;
        break;
      }
      // Not while it knows the player is in a room (where it last saw them is inside one, `goalRoom`), as breaching a door never gives up
      // unseen: a fenced house is no safe spot by day or night (Michael, 2026-10-17: "a fenced yard is no safe spot"; #171). A held
      // siege knows it too. Only for a player it last saw out in the open does the press give up, after `pressGiveUp` unseen.
      if (!z.seesNow && z.sincePlayer > T.pressGiveUp && !(z.siege && siegeOn(z, players)) && !(goalRoom(z) > 0)) {
        z.press = null;
        startSearch(z);
        break;
      }
      // A fence is no wall to a bite (Michael, 2026-10-17: "otherwise exploitable"): a player in reach across it is bitten, by the
      // chase's own bite (contact, sight, the cooldown); the dead one goes back to pressing when the player is out of reach.
      if (tgt && z.seesNow && distTo(z, tgt) <= T.contact) {
        z.state = "chase";
        z.repathTimer = 0;
        break;
      }
      const [mx, my] = edgeMid(f.tx, f.ty, f.edge);
      if (Math.hypot(mx - z.gx, my - z.gy) > 0.7) {
        const repathTimer0 = z.repathTimer;
        moveToward(z, dt, f.stand, others);
        if (z.pathFailed && z.repathTimer > repathTimer0) {
          z.press = null;
          z.noWay = T.noWayTime;
          startSearch(z);
        }
        break;
      }
      faceToward(z, mx - z.gx, my - z.gy);
      moveToward(z, dt, [Math.round(z.lastSeen ? z.lastSeen[0] : mx), Math.round(z.lastSeen ? z.lastSeen[1] : my)], others); // nudge at the way through
      pressFence(f.wall, f.tx, f.ty, f.edge);
      break;
    }
    case "siege": {
      // About the house the player is in, between the openings it knows, until dawn: the dead that saw them go in.
      const s = z.siege;
      if (!siegeOn(z, players)) {
        giveUp(z);
        break;
      }
      if (z.seesNow && !(z.noWay > 0)) {
        z.state = "chase";
        z.repathTimer = 0;
        break;
      }
      const roomHere = tileAt(s.at[0], s.at[1]).room;
      const room = roomHere > 0 ? getRoom(roomHere) : null;
      const cands = room ? breachTargets(room, z.gx, z.gy, 0, true) : [];
      if (!cands.length) {
        // Nothing to break. If they can walk to the player (every opening already a way in, or the house is no room now),
        // go in after them; if not (a cell with a window and no door), wait at the opening they saw the player by, and keep
        // the siege.
        const reach = s.reach && clock.getElapsed() < s.reach.until ? s.reach.ok : null;
        const ok = reach !== null ? reach : canReach(z, s.at);
        if (reach === null) s.reach = { ok, until: clock.getElapsed() + T.siegeSwitch };
        if (ok || !room) {
          z.lastSeen = [s.at[0], s.at[1]];
          z.state = "chase";
          z.repathTimer = 0;
          break;
        }
        const k = s.openings.length ? s.openings[(s.idx >>> 0) % s.openings.length] : null;
        if (k) {
          const outTile = edgeTiles(k.tx, k.ty, k.edge).find((t) => tileAt(t[0], t[1]).room !== roomHere);
          if (outTile && Math.hypot(outTile[0] - z.gx, outTile[1] - z.gy) > 0.8) {
            moveToward(z, dt, outTile, others);
            break;
          }
        }
        playAnimation(z.anim, "idle");
        break;
      }
      const known = cands.filter((c) => s.openings.some((k) => k.tx === c.tx && k.ty === c.ty && k.edge === c.edge));
      const pool = known.length ? known : cands;
      if (clock.getElapsed() >= s.switchAt) {
        s.idx = (s.idx >>> 0) + 1;
        s.switchAt = clock.getElapsed() + T.siegeSwitch;
      }
      const c = pool[(s.idx >>> 0) % pool.length];
      const mx = c.edge === "n" ? c.tx : c.tx - 0.5;
      const my = c.edge === "n" ? c.ty - 0.5 : c.ty;
      if (Math.hypot(mx - z.gx, my - z.gy) <= T.breachReach) {
        z.lastSeen = [s.at[0], s.at[1]];
        startBreach(z, { ...c, want: roomHere });
        break;
      }
      const repathTimer0 = z.repathTimer;
      moveToward(z, dt, c.stand, others);
      if (z.pathFailed && z.repathTimer > repathTimer0) {
        // Cannot reach that one: if a fence stands across the way (a yard round the house), go and press it, a gate first;
        // else try another opening a moment sooner.
        const across = fenceWay(z, c.stand);
        if (across) {
          startPress(z, across);
          break;
        }
        s.idx = (s.idx >>> 0) + 1;
        s.switchAt = clock.getElapsed() + T.siegeSwitch;
      }
      break;
    }
    case "attack": {
      if (isActiveFrame(z.anim, sheet) && !z.attackHit) {
        z.attackHit = true;
        if (distTo(z, tgt) <= T.contact + 0.2 && lineOfSight(z.gx, z.gy, tgt.gx, tgt.gy)) {
          if (tgt.kind === "player") emit("playerHit", { zombie: z, damage: T.damage, victim: tgt });
          else emit("villagerHit", { zombie: z, villager: tgt, damage: T.damage });
        }
      }
      if (z.anim.done) {
        z.attackCooldown = T.cooldown;
        z.state = "chase";
      }
      break;
    }
  }

  advanceAnimation(z.anim, sheet, dt);
}
