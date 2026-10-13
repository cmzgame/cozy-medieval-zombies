// The world's state and the step order (docs/23a, D1: the game.js of the target
// tree; docs/31/05, item 17: the singletons sorted into the world and the client;
// docs/31/04: the seed of the authority). Everything here is the simulation's:
// no window, no canvas, no keyboard, no DOM. The client (main.js) owns the
// camera, sight, the ground, the panels, the keys, and calls `begin` before its
// own frame work and `step` after it, in the order the one-file step had, so
// the fresh-boot hash is what it was (48ba67d2 on the valley, 2026-10-13).
// What a player does arrives as a snapshot (controlPlayer's; a second player's
// could come from a wire); what happened leaves as events on the bus.
// The world's own small fields (the time scale, the id counter) stay in
// world.js, which the leaf modules import; this file imports them all and is
// imported only by main.js, so there is no cycle.

import * as map from "./map.js";
import * as clock from "./clock.js";
import * as light from "./light.js";
import * as events from "./events.js";
import * as archery from "./archery.js";
import * as burning from "./fire.js";
import * as bleed from "./bleed.js";
import * as interact from "./interact.js";
import * as items from "./items.js";
import * as inventory from "./inventory.js";
import * as rules from "./rules.js";
import * as tuning from "./tuning.js";
import { updatePlayer } from "./entities/player.js";
import { createZombie, updateZombie } from "./entities/zombie.js";
import { updateVillager, turnVillager } from "./entities/villager.js";
import { controlPlayer } from "./player-controller.js";

export const state = {
  info: null, // what the map file gave: spawn, the authored dead and villagers, the name
  player: null, // the one player, until there are several (docs/31/03): `players` is the list
  players: [],
  zombies: [], // the dead that still think; the fallen move to corpses (docs/23a, B1)
  corpses: [],
  villagers: [],
  others: [], // the living, rebuilt each step; the interface reads it between steps
  progress: null, // 0..1 of the player's timed action
};

// The player's list, kept with the one player while the game has one.
export function setPlayer(p) {
  state.player = p;
  state.players = p ? [p] : [];
}

// Inside the box of tiles around any player where the dead and villagers think
// (a stand-in for the records of docs/03 until that milestone; a union of
// boxes with more than one player, docs/31/05 item 19).
export function nearPlayer(e) {
  const r = tuning.world.activeTiles;
  for (const p of state.players) if (Math.abs(e.gx - p.gx) <= r && Math.abs(e.gy - p.gy) <= r) return true;
  return false;
}

// The fire of a lit item on the belt, if any.
function beltFire(belt) {
  if (!belt) return null;
  for (const e of belt) {
    const def = e && items.getItem(e.id);
    if (def && def.fire) return def.fire;
  }
  return null;
}

// The world's first part of a step: the rules, the clock, the fires, and the
// chunks round each player (grown ahead, dropped behind), before the client's
// own frame work reads the map.
export function begin(dt) {
  const S = state;
  rules.refresh(); // the sim's rules, from the settings, once a step (docs/23a, C3)
  clock.update(dt);
  map.burnFires(dt);
  for (const p of S.players) {
    // Grow the world four chunks ahead of the player, so wild forest and its dead
    // appear outside the view even at the widest zoom (docs/02, the view), and the
    // ground can bake every viewed chunk with its neighbours grown: this ring is
    // the only growth there is, since reading never grows (docs/31/05, item 8).
    map.ensureAround(p.gx, p.gy, 4);
  }
  for (const [x, y] of map.takePendingSpawns()) S.zombies.push(createZombie(x, y));
  // Chunks far behind are dropped and the characters in them sleep with their
  // chunk, back when it grows again (docs/23a, B1, B2). Villagers hold a chunk,
  // and so does any player (the nearest decides, docs/31/05 item 19).
  const inChunk = (e, cx, cy) => {
    const [ex, ey] = map.chunkCoord(Math.round(e.gx), Math.round(e.gy));
    return ex === cx && ey === cy;
  };
  const anchor = S.players[0];
  if (anchor) {
    const keep = (cx, cy) => S.villagers.some((v) => inChunk(v, cx, cy)) || S.players.some((p) => nearChunk(p, cx, cy, tuning.world.evictChunks));
    for (const [key, cx, cy] of map.evictFar(anchor.gx, anchor.gy, tuning.world.evictChunks, keep)) {
      const sleeping = [];
      S.zombies = S.zombies.filter((z) => !inChunk(z, cx, cy) || (sleeping.push(z), false));
      S.corpses = S.corpses.filter((z) => !inChunk(z, cx, cy) || (sleeping.push(z), false));
      map.sleep(key, sleeping);
    }
  }
  for (const ch of map.takeWoken()) (ch.dead ? S.corpses : S.zombies).push(ch);
}

function nearChunk(p, cx, cy, radius) {
  const [pcx, pcy] = map.chunkCoord(Math.round(p.gx), Math.round(p.gy));
  return Math.max(Math.abs(cx - pcx), Math.abs(cy - pcy)) <= radius;
}

// The world's second part of a step: the player from their snapshot, the
// arrows, the burning, the timed action, the dead and the villagers that are
// near anyone, the fallen and the turned, death, and the light.
export function step(dt, snapshot) {
  const S = state;
  const player = S.player;
  updatePlayer(player, dt);
  bleed.update(player, dt);
  // The mouse and the keys, as a snapshot, to the player's controller (docs/23a, D1; never the input module).
  controlPlayer(player, S.zombies, dt, snapshot);
  archery.update(dt);
  S.others = [player, ...S.zombies, ...S.villagers]; // the living, who block and are hunted
  const everyone = [...S.others, ...S.corpses]; // and the fallen, who burn and are drawn
  burning.update(dt, everyone); // the burning, a visual (docs/05)
  S.progress = interact.updateAction(player, dt);
  // The dead far from every player stand still: a stand-in for the records of
  // docs/03 until that milestone.
  // Anyone walking through a crop or a mushroom sets it swaying (Michael, 2026-10-12).
  interact.brushThrough(player);
  for (const z of S.zombies) {
    if (!nearPlayer(z)) continue;
    updateZombie(z, dt, player, S.others, S.villagers);
    interact.brushThrough(z);
  }
  for (const v of S.villagers) {
    if (!nearPlayer(v)) continue;
    updateVillager(v, dt, S.others);
    interact.brushThrough(v);
  }
  // Villagers bitten through get up as the dead, in what they wore (docs/19).
  if (S.villagers.some((v) => v.dead)) {
    for (const v of S.villagers) if (v.dead) S.zombies.push(turnVillager(v));
    S.villagers = S.villagers.filter((v) => !v.dead);
  }
  // The fallen leave the thinking list (docs/23a, B1): a corpse is drawn and looted, never iterated by the AI.
  if (S.zombies.some((z) => z.dead)) {
    S.corpses.push(...S.zombies.filter((z) => z.dead));
    S.zombies = S.zombies.filter((z) => !z.dead);
  }
  if (player.hp <= 0 && !player.dead) {
    // Death (Michael, 2026-10-10 night): the world says so; the client shows the
    // dead screen, and the way back to the title is a fresh load.
    player.dead = true;
    events.emit("gameOver", { player });
  }
  // Rooms refound if a wall changed, before the light reads them (light.update
  // asks for current rooms; the one-file step had the client's roomAt do this).
  map.roomsIfDirty();
  // The light you carry (docs/02): a torch in hand at full, two at more,
  // else one on the belt at half. The strength also scales how far the dead
  // see the flame (zombie.js).
  const held = items.heldFire(player.hands);
  const twoHanded = held && player.hands.main && player.hands.off && player.hands.main !== player.hands.off && items.getItem(player.hands.main.id).fire && items.getItem(player.hands.off.id).fire;
  const belted = held ? null : beltFire(inventory.beltOf(player));
  const fire = held || belted;
  const strength = held ? (twoHanded ? tuning.world.twoTorches : 1) : tuning.world.beltLight;
  light.setCarrier(fire ? { gx: player.gx, gy: player.gy, radius: fire.radius * strength, flicker: fire.flicker || null, strength } : null);
  light.setBurners(burning.lights(everyone));
  light.update();
}
