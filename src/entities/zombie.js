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
import { moveCircle, isWalkableTile, nearestWalkable, tileAt, getRoom, breachTarget, damageOpening, wayOpen, climbable, floorSpeedAt } from "../map.js";
import { lineOfSight } from "../visibility.js";
import * as light from "../light.js";
import * as clock from "../clock.js";
import { getSheet } from "../assets.js";
import { createAnimation, playAnimation, advanceAnimation, isActiveFrame } from "../sprites.js";
import { emit } from "../events.js";
import { zombie as T } from "../tuning.js";
import { idleTime, roomOf, faceToward, tileOf, repath, followPath, separate, pickTargetAround } from "./movement.js";
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
    climb: null, // { from, to, t } while climbing through a window
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

// A climb cut short leaves the body at whichever end of it is nearer.
function endClimb(z) {
  if (!z.climb) return;
  const c = z.climb;
  const at = c.t / T.climb < 0.5 ? c.from : c.to;
  z.gx = at[0];
  z.gy = at[1];
  z.climb = null;
}

// Hurt a zombie (docs/14). `dir` is the grid unit vector the blow travels
// along, `knockback` tiles of push, `knockdown` floors it, `stagger` seconds it
// is stopped, `from` where the blow came from (the dead then know where). A
// downed zombie takes the damage and nothing else. Returns { killed, downed }.
export function damageZombie(z, amount, { dir = [0, 0], knockback = 0, knockdown = false, stagger = T.stagger, staggerChance = STAGGER_RULES.chance, interrupts = false, from = null } = {}) {
  if (z.dead) return { killed: false, downed: false };
  const wasDown = isDown(z);
  z.hp = Math.max(0, z.hp - amount);
  endClimb(z);
  z.path = [];
  z.lastGoal = null;
  if (knockback > 0 && !wasDown) z.knock = { x: dir[0] * knockback, y: dir[1] * knockback, left: T.knockTime };
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
    if (v.dead) continue;
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
    // A torch on the belt is a weaker flame (docs/02): seen from half as far.
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

function giveUp(z) {
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
  // Climbing: slow, committed, no bite until it is through (docs/09).
  if (z.climb) {
    const c = z.climb;
    c.t += dt;
    const k = Math.min(1, c.t / T.climb);
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
      if (dEdge > T.breachReach) {
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
          const target = pickTargetAround(z.lastSeen[0], z.lastSeen[1], T.searchRadius, roomOf(z));
          if (target) repath(z, target);
          z.idleTimer = rng.range(0.8, 2.0);
        }
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
