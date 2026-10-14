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
import { villager as T } from "../tuning.js";

const DEAD_SKIN = "#9fbf88"; // what a turned villager's skin goes // as a wiggle's (interact.js): spam does not restart the line

let nextId = 1;


// `line` is what they say when poked ("Hey!" unless the map gives one);
// `wardrobe` indexes the village wardrobes in data/wardrobes.json.
export function createVillager(gx, gy, { id = null, name = null, line = null, wardrobe = 0 } = {}) {
  const v = {
    ...createCharacter("villager", gx, gy, { id: id || `v${nextId++}`, name, speed: T.speed, radius: T.radius, hp: 100 }),
    home: [gx, gy],
    state: "idle", // idle | wander | talk
    greeting: line || "Hey!",
    path: [],
    repathTimer: 0,
    idleTimer: idleTime(),
    stuckTime: 0,
    pathFailed: false,
    lastGoal: null,
    talkTimer: 0,
    pokedAt: 0, // sim milliseconds of the last poke that spoke
    hurtTimer: 0,
  };
  wardrobeInto(v, "village", wardrobe);
  return v;
}

export function updateVillager(v, dt, others) {
  const sheet = getSheet(v.sprite);
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
  if (v.dead) return false;
  v.hp = Math.max(0, v.hp - amount);
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

// A poke: stop where they stand, turn to the player, say the line. Returns
// whether it spoke (a second poke inside the cooldown does nothing).
export function pokeVillager(v, player) {
  const now = loop.simTime() * 1000; // sim milliseconds (docs/23a, C2)
  if (now - v.pokedAt < T.pokeCooldownMs) return false;
  v.pokedAt = now;
  v.path = [];
  v.lastGoal = null;
  v.state = "talk";
  faceToward(v, player.gx - v.gx, player.gy - v.gy);
  say(v, v.greeting);
  v.talkTimer = Math.max(T.talkTime, v.line.left);
  return true;
}
