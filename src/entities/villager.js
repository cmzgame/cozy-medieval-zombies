// Villagers (docs/19, step 3): living figures on the character model that
// wander near where the map put them and, when poked, stop, turn to you, and
// say their line. The dead hunt them only behind a setting (`zombiesAttackVillagers`,
// docs/19), and one bitten to death turns (`turnVillager`); a swing passes
// through them, they have no needs. `hp`, `maxHp`, `dead`, `radius`, `worn`, and
// `look` are on them so that fleeing and following (docs/04) need no reshaping.
// They walk with the walking they share with the dead (movement.js), on a tether
// to `home`.

import * as floaters from "../floaters.js"; // the floating numbers over heads (#294)
import { createCharacter, wardrobeInto, dress, say } from "./character.js";
import { getSheet } from "../assets.js";
import { playAnimation, advanceAnimation } from "../sprites.js";
import { emit } from "../events.js";
import { createZombie } from "./zombie.js";
import { pickTargetAround, repath, followPath, separate, faceToward, roomOf, idleTime } from "./movement.js";
import * as loop from "../loop.js";
import * as talk from "../talk.js";
import { lineOfSight } from "../visibility.js";
import { isWalkableTile, roomAt } from "../map.js";
import { villager as T, zombie as ZT } from "../tuning.js";

const DEAD_SKIN = "#9fbf88"; // what a turned villager's skin goes // as a wiggle's (interact.js): spam does not restart the line

let nextId = 1;

// What the talk conditions read (docs/34): the dead, the living villagers, and the talk ids the map placed, handed in by game.js each time a
// world is made or restored (as interact's characters are). A wire to the world's lists, not state of a player.
let talkWorld = () => null;
export function setTalkWorld(fn) {
  talkWorld = fn;
}

// A villager's talk id (docs/34): the map's `talk`, else the name lowercased; null for a nameless one.
export function talkIdOf(spec) {
  return spec.talk || (spec.name ? String(spec.name).toLowerCase() : null);
}

// `line` is what they say when poked ("Hey!" unless the map gives one);
// `wardrobe` indexes the village wardrobes in data/wardrobes.json.
export function createVillager(gx, gy, { id = null, name = null, line = null, wardrobe = 0, immune = false, talk: talkId = null, guide = false } = {}) {
  const v = {
    ...createCharacter("villager", gx, gy, { id: id || `v${nextId++}`, name, speed: T.speed, radius: T.radius, hp: 100 }),
    home: [gx, gy],
    state: "idle", // idle | wander | talk | hurt | cower | flee | wary (the last three an immune villager's, docs/43 section 7)
    greeting: line || "Hey!",
    immune: !!immune, // the dead neither target nor harm it, whatever the world's rules (#180: a teacher, like the guide; the rest can die)
    talk: talkId, // the name of its file in data/talk (docs/34); none, or a file that is not there, and it says its map line
    guide: !!guide, // the one beside the spawn who explains the rules (docs/34, #90); immune comes with it from the map
    barkTurns: {}, // group index -> which of its lines comes next (bookkeeping nothing reads; no rng, so a bark never shifts the generator)
    barkAt: null, // sim seconds of its last ambient bark
    talkingWith: [], // the ids of the players in conversation with it, sorted (docs/34): it stands and faces whoever spoke last while any is here
    path: [],
    repathTimer: 0,
    idleTimer: idleTime(),
    stuckTime: 0,
    pathFailed: false,
    lastGoal: null,
    talkTimer: 0,
    pokedAt: null, // sim milliseconds of the last poke that spoke; null for none (a poke at sim 0 is a poke)
    hurtTimer: 0,
    regenAt: 0, // sim seconds before which a hurt villager does not heal (a hit sets it)
    cowerTimer: 0, // seconds of the cowering left (docs/43 section 7: an immune villager with the dead near; states cower, flee, wary)
    cowerFrom: null, // [gx, gy]: where the dead one stood that it cowers from, and runs from
  };
  wardrobeInto(v, "village", wardrobe);
  return v;
}

// A hurt villager heals slowly, at the player's rate (Michael, 2026-10-18, #236: "slow refill like players"): in the world's step on the authority, never above their
// max, not while hurt (flinching) or inside `regenPause` of the last hit, never once dead. Time scales with the step like everything else.
function regen(v, dt) {
  if (v.dead || v.hp <= 0 || v.hp >= (v.maxHp ?? 100) || v.state === "hurt" || loop.simTime() < v.regenAt) return;
  v.hp = Math.min(v.maxHp ?? 100, v.hp + (T.regenPerMinute / 60) * dt);
}

// ---- the cowering (docs/43 section 7): the ground for the villagers who flee for real (docs/04) ----
// An immune villager (the guide, a teacher) that sees one of the dead within `cowerRadius` cowers for `cowerSeconds`, arms up (the `cower`
// pose on a villager's sheet), a "!" over its head as the visual twin; then it runs about `fleeTiles` away from the dead one at `fleeSpeed`
// times its walk, stands wary there, and walks back to its spot once none of the dead is within `cowerClearRadius`. The states ride in the
// villager's record (`state`, `anim`, `line`), so every client draws it; nothing here rolls the generator (the way out is chosen by angle).
const COWER_FROM = new Set(["idle", "wander", "talk", "wary"]); // what a sight of the dead interrupts: not a cowering already under way, nor the flight

// The nearest of the dead this villager sees within `radius` tiles (a line of sight, so a wall between hides one), or null.
function deadInSight(v, others, radius) {
  let best = null;
  let bestD = radius;
  for (const z of others) {
    if (z.kind !== "zombie" || z.dead) continue;
    const d = Math.hypot(z.gx - v.gx, z.gy - v.gy);
    if (d > bestD) continue;
    if (!lineOfSight(v.gx, v.gy, z.gx, z.gy)) continue;
    best = z;
    bestD = d;
  }
  return best;
}

function anyDeadWithin(v, others, radius) {
  return others.some((z) => z.kind === "zombie" && !z.dead && Math.hypot(z.gx - v.gx, z.gy - v.gy) <= radius);
}

function cower(v, z) {
  const sheet = getSheet(v.sprite);
  v.state = "cower";
  v.cowerTimer = T.cowerSeconds;
  v.cowerFrom = [z.gx, z.gy];
  v.path = [];
  v.lastGoal = null;
  v.talkingWith = []; // a conversation ends: the talker's panel closes (talk-panel.js, the villager no longer holds them)
  faceToward(v, z.gx - v.gx, z.gy - v.gy);
  say(v, T.cowerBubble, T.cowerSeconds + 0.5);
  playAnimation(v.anim, sheet && sheet.animations && sheet.animations.cower ? "cower" : "idle", true);
}

// A tile about `fleeTiles` away from the dead one, on the villager's own side of the walls, that it can walk to: straight away first, then
// turning a little each way, then further round. Null when there is nowhere (it stands wary where it is).
function fleeTo(v, from) {
  let ax = v.gx - from[0];
  let ay = v.gy - from[1];
  const len = Math.hypot(ax, ay) || 1;
  ax /= len;
  ay /= len;
  if (ax === 0 && ay === 0) ax = 1;
  const room = roomOf(v);
  const here = [Math.round(v.gx), Math.round(v.gy)];
  for (const deg of [0, 30, -30, 60, -60, 90, -90, 135, -135]) {
    const r = (deg * Math.PI) / 180;
    const dx = ax * Math.cos(r) - ay * Math.sin(r);
    const dy = ax * Math.sin(r) + ay * Math.cos(r);
    for (const dist of [T.fleeTiles, Math.max(1, Math.round(T.fleeTiles / 2))]) {
      const t = [Math.round(v.gx + dx * dist), Math.round(v.gy + dy * dist)];
      if (t[0] === here[0] && t[1] === here[1]) continue;
      if (!isWalkableTile(t[0], t[1]) || roomAt(t[0], t[1]) !== room) continue;
      repath(v, t);
      if (!v.pathFailed && v.path.length) return t;
    }
  }
  v.path = [];
  return null;
}

function updateCowering(v, dt, others) {
  if (v.dead) return;
  if (COWER_FROM.has(v.state)) {
    const z = deadInSight(v, others, T.cowerRadius);
    if (z) cower(v, z);
  }
}

export function updateVillager(v, dt, others, players = []) {
  const sheet = getSheet(v.sprite);
  regen(v, dt);
  if (v.immune) updateCowering(v, dt, others);
  if (v.talkingWith.length) keepTalkers(v, players);
  if ((v.state === "idle" || v.state === "wander") && !v.dead) ambientBark(v, players);
  switch (v.state) {
    case "cower": {
      if (sheet && sheet.animations && sheet.animations.cower) playAnimation(v.anim, "cower");
      v.cowerTimer -= dt;
      if (v.cowerTimer <= 0) {
        v.state = fleeTo(v, v.cowerFrom || [v.gx, v.gy]) ? "flee" : "wary";
        playAnimation(v.anim, v.state === "flee" ? "walk" : "idle", true);
      }
      break;
    }
    case "flee": {
      playAnimation(v.anim, "walk");
      const walk = v.speed;
      v.speed = walk * T.fleeSpeed; // a run, for the flight alone
      const done = followPath(v, dt, others);
      v.speed = walk;
      if (done) v.state = "wary";
      break;
    }
    case "wary": {
      // Stands where it ran to until none of the dead is near, then walks back to its spot (and wanders on its tether from there).
      playAnimation(v.anim, "idle");
      separate(v, dt, others);
      if (!anyDeadWithin(v, others, T.cowerClearRadius)) {
        repath(v, [Math.round(v.home[0]), Math.round(v.home[1])]);
        v.cowerFrom = null;
        v.state = v.path.length ? "wander" : "idle";
        v.idleTimer = T.talkIdleSeconds; // fixed, not rolled: the cowering never shifts the generator
      }
      break;
    }
    case "idle": {
      playAnimation(v.anim, "idle");
      separate(v, dt, others); // step aside from whoever is standing on them, the player included
      v.idleTimer -= dt;
      if (v.idleTimer <= 0) {
        // A walkable tile within T.wanderRadius of home, on their own side of the walls
        // (the picker draws from a square; the leash is a circle).
        let target = null;
        for (let tries = 0; tries < 6 && !target; tries++) {
          const t = pickTargetAround(v.home[0], v.home[1], T.wanderRadius, roomOf(v));
          if (t && Math.hypot(t[0] - v.home[0], t[1] - v.home[1]) <= T.wanderRadius) target = t;
        }
        if (target) {
          repath(v, target);
          v.state = "wander";
        }
        v.idleTimer = idleTime();
      }
      break;
    }
    case "wander": {
      playAnimation(v.anim, "walk");
      if (followPath(v, dt, others)) v.state = "idle";
      break;
    }
    case "hurt": {
      v.hurtTimer -= dt;
      if (v.hurtTimer <= 0) {
        v.state = "idle";
        v.idleTimer = idleTime();
        playAnimation(v.anim, "idle", true);
      }
      break;
    }
    case "talk": {
      playAnimation(v.anim, "idle");
      separate(v, dt, others);
      if (v.talkingWith.length) break; // in conversation: it stands until the last talker has gone
      v.talkTimer -= dt;
      if (v.talkTimer <= 0) {
        v.state = "idle";
        v.idleTimer = idleTime();
      }
      break;
    }
  }
  advanceAnimation(v.anim, sheet, dt);
}

// A villager bitten (the dead hunt them when the setting says so, docs/19): the
// flinch, and at zero health they are dead, to be turned by `turnVillager`.
// Returns whether it killed.
export function damageVillager(v, amount) {
  if (v.dead || v.immune) return false; // an immune villager takes no harm from anything
  floaters.damage(v, amount); // the red number over its head (#294)
  v.hp = Math.max(0, v.hp - amount);
  v.regenAt = loop.simTime() + T.regenPause;
  v.path = [];
  v.lastGoal = null;
  if (v.hp <= 0) {
    v.dead = true;
    v.state = "dead";
    v.line = null;
    return true;
  }
  v.state = "hurt";
  v.hurtTimer = T.hurtTime;
  playAnimation(v.anim, "hurt", true);
  return false;
}

// A dead villager gets up as one of the dead, in what they wore and what they
// carried (`04`, open point 4): a zombie from the same place, the clothes and
// pockets and hands handed over, the skin gone green, on the floor for a
// moment and then rising. The caller adds it to the dead.
export function turnVillager(v) {
  const z = createZombie(v.gx, v.gy);
  z.facing = v.facing;
  z.look = { ...v.look, skin: DEAD_SKIN, eyes: "#2a1414", under: "#b8b0a0" };
  z.worn = v.worn;
  z.hands = v.hands;
  z.pockets = v.pockets;
  z.wound = [5, 3, 0];
  dress(z);
  z.state = "down";
  z.downTimer = ZT.turnDownTime; // data/tuning.json
  z.gettingUp = false;
  playAnimation(z.anim, "die", true);
  emit("villagerDied", { villager: v, zombie: z });
  return z;
}

// Who is still talking to them (docs/34, "Ending one"): a talker who walked off (past reach and a tile), is gone, dead, or lost the clear line is dropped, and
// one who is struck (staggered), turned, or dead ends it for everyone; the villager goes back to idle when none is left. The authority's, in the step, so a lost
// message cannot hold a villager for ever.
function keepTalkers(v, players) {
  if (v.state !== "talk" || v.dead) { v.talkingWith = []; return; }
  const keep = v.talkingWith.filter((id) => {
    const p = players.find((q) => q.id === id);
    return p && !p.dead && Math.hypot(p.gx - v.gx, p.gy - v.gy) <= T.talkReach + T.talkWalkAway && lineOfSight(p.gx, p.gy, v.gx, v.gy); // reach, and a clear line (a wall ends it)
  });
  if (keep.length !== v.talkingWith.length) v.talkingWith = keep;
  if (!keep.length) {
    v.state = "idle";
    v.idleTimer = T.talkIdleSeconds; // a fixed pause, never a roll: a conversation must not shift the sim's generator
  }
}

// The context for the talker's own lines (docs/34): built on whichever side is asking, from that side's world (the replica, for a guest).
export function talkContext(v, player) {
  return talk.contextFor(v, player, talkWorld());
}

// Start a conversation (the menu's Talk to, and E): refused for the dead (a wounded villager still talks, Michael, 2026-10-18) and for an immune one that
// cowers or runs (docs/43 section 7); with the dead within `talkDeadRadius` the villager barks instead of
// talking; else it stops, faces the talker, and takes them into `talkingWith`, and `talkStarted` tells the talker's screen to open the panel. Returns
// whether a conversation began. Runs on the authority, as the player.
export function startTalk(v, player) {
  if (v.dead) return false;
  if (v.state === "cower" || v.state === "flee") return false; // too frightened to answer, as a poke (docs/43 section 7); the flight goes on
  if (!lineOfSight(player.gx, player.gy, v.gx, v.gy)) return false; // the same test `keepTalkers` ends a conversation on: never through a wall
  const w = talkWorld();
  const deadClose = !!w && (w.zombies || []).some((z) => !z.dead && Math.hypot(z.gx - v.gx, z.gy - v.gy) <= T.talkDeadRadius);
  if (!talk.has(v.talk) || deadClose) {
    pokeVillager(v, player); // no file, or the dead are close: a bark, not a conversation
    return false;
  }
  v.path = [];
  v.lastGoal = null;
  v.state = "talk";
  faceToward(v, player.gx - v.gx, player.gy - v.gy);
  if (!v.talkingWith.includes(player.id)) v.talkingWith = [...v.talkingWith, player.id].sort();
  emit("talkStarted", { villager: v, by: player });
  return true;
}

// A talker leaves (the panel closed): the host's own player directly, a guest by `net.sendTalkEnd`.
export function endTalk(v, playerId) {
  if (!v || !v.talkingWith.includes(playerId)) return false;
  v.talkingWith = v.talkingWith.filter((id) => id !== playerId);
  if (!v.talkingWith.length && v.state === "talk") {
    v.state = "idle";
    v.idleTimer = T.talkIdleSeconds;
    v.talkTimer = 0;
  }
  return true;
}

// An unprompted remark (docs/34): from a villager idle or wandering (never one talking or dead; a wounded one still speaks, Michael, 2026-10-18), with a living player within
// `T.barkRadius`, not twice inside `T.barkCooldown` seconds of game time, from an `ambient` group of their file that holds; an idle
// villager turns toward the nearest player as they say it. On the authority only (the host's step); the bubble rides in the record.
function ambientBark(v, players) {
  if (!talk.has(v.talk) || v.dead) return;
  const now = loop.simTime();
  if (v.barkAt !== null && now - v.barkAt < T.barkCooldown) return;
  let near = null;
  let best = T.barkRadius;
  for (const p of players) {
    if (p.dead) continue;
    const d = Math.hypot(p.gx - v.gx, p.gy - v.gy);
    if (d <= best) { near = p; best = d; }
  }
  if (!near) return;
  const text = talk.barkFor(v, talk.contextFor(v, null, talkWorld()), { ambient: true });
  if (!text) return;
  v.barkAt = now;
  if (v.state === "idle") faceToward(v, near.gx - v.gx, near.gy - v.gy);
  say(v, text);
}

// A poke: stop where they stand, turn to the player, say the line (from their talk file for this moment, else their map line). Returns
// whether it spoke (a second poke inside the cooldown does nothing).
export function pokeVillager(v, player) {
  const now = loop.simTime() * 1000; // sim milliseconds (docs/23a, C2)
  if (v.state === "cower" || v.state === "flee") return false; // too frightened to answer (docs/43 section 7)
  if (v.pokedAt != null && now - v.pokedAt < T.pokeCooldownMs) return false;
  v.pokedAt = now;
  v.path = [];
  v.lastGoal = null;
  v.state = "talk";
  faceToward(v, player.gx - v.gx, player.gy - v.gy);
  const bark = talk.has(v.talk) ? talk.barkFor(v, talk.contextFor(v, player, talkWorld())) : null;
  say(v, bark || v.greeting);
  v.talkTimer = Math.max(T.talkTime, v.line.left);
  return true;
}
