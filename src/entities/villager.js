// Villagers (docs/19, step 3): living figures on the character model that
// wander near where the map put them and, when poked, stop, turn to you, and
// say their line. The dead hunt them only behind a setting (`zombiesAttackVillagers`,
// docs/19), and one bitten to death turns (`turnVillager`); a swing passes
// through them, they have no needs. `hp`, `maxHp`, `dead`, `radius`, `worn`, and
// `look` are on them so that fleeing and following (docs/04) need no reshaping.
// They walk with the walking they share with the dead (movement.js), on a tether
// to `home`.

import { createCharacter, wardrobeInto, dress, say } from "./character.js";
import { getSheet } from "../assets.js";
import { playAnimation, advanceAnimation } from "../sprites.js";
import { emit } from "../events.js";
import { createZombie } from "./zombie.js";
import { pickTargetAround, repath, followPath, separate, faceToward, roomOf, idleTime } from "./movement.js";
import * as loop from "../loop.js";
import * as talk from "../talk.js";
import { villager as T } from "../tuning.js";

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
    state: "idle", // idle | wander | talk
    greeting: line || "Hey!",
    immune: !!immune, // the dead neither target nor harm it, whatever the world's rules (#180: a teacher, like the guide; the rest can die)
    talk: talkId, // the name of its file in data/talk (docs/34); none, or a file that is not there, and it says its map line
    guide: !!guide, // the one beside the spawn who explains the rules (docs/34, #90); immune comes with it from the map
    barkTurns: {}, // group index -> which of its lines comes next (bookkeeping nothing reads; no rng, so a bark never shifts the generator)
    barkAt: null, // sim seconds of its last ambient bark
    path: [],
    repathTimer: 0,
    idleTimer: idleTime(),
    stuckTime: 0,
    pathFailed: false,
    lastGoal: null,
    talkTimer: 0,
    pokedAt: 0, // sim milliseconds of the last poke that spoke
    hurtTimer: 0,
    regenAt: 0, // sim seconds before which a hurt villager does not heal (a hit sets it)
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

export function updateVillager(v, dt, others, players = []) {
  const sheet = getSheet(v.sprite);
  regen(v, dt);
  if ((v.state === "idle" || v.state === "wander") && !v.dead) ambientBark(v, players);
  switch (v.state) {
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
  z.downTimer = 2;
  z.gettingUp = false;
  playAnimation(z.anim, "die", true);
  emit("villagerDied", { villager: v, zombie: z });
  return z;
}

// An unprompted remark (docs/34): from a villager idle or wandering (never one hurt, talking, or dead), with a living player within
// `T.barkRadius`, not twice inside `T.barkCooldown` seconds of game time, from an `ambient` group of their file that holds; an idle
// villager turns toward the nearest player as they say it. On the authority only (the host's step); the bubble rides in the record.
function ambientBark(v, players) {
  if (!talk.has(v.talk) || v.hp < (v.maxHp ?? 100)) return;
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
  if (now - v.pokedAt < T.pokeCooldownMs) return false;
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
