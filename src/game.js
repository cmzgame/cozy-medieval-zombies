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
import * as stations from "./stations.js"; // the stations' queues run in the world's time (docs/30, section 6)
import * as rng from "./rng.js";
import * as world from "./world.js";
import * as loop from "./loop.js";
import { serializeCharacter, restoreCharacter, dress, dressCorpse } from "./entities/character.js";
import { createPlayer, updatePlayer } from "./entities/player.js";
import { createZombie, updateZombie } from "./entities/zombie.js";
import { createVillager, updateVillager, turnVillager } from "./entities/villager.js";
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

// The world from a map file: the generator seeded, the map loaded and the
// spawn's ring grown first (reading never grows), the dev chest if asked, the
// player with their look and the starter kit, the authored dead and villagers,
// the ring round the player and its wild dead, the rooms, the testing dead if
// asked. The same calls in the same order in the browser's boot (main.js, the
// world stage) and headless (tools/world.js), so both worlds hash the same.
// What the client does after (the camera, sight, the ground, the player's
// sheet) touches nothing the hash sees.
export function create({ json, look = null, devChest = false, combatTesting = false }) {
  const S = state;
  rng.seed(json.seed ?? 1); // the sim's one generator, seeded from the map (docs/23a, C1)
  world.reset(json.idCounter || 0); // the world's time scale and id counter (docs/30 step 2; docs/31/08)
  S.info = map.loadMap(json);
  const info = S.info;
  map.ensureAround(info.spawn[0], info.spawn[1], 4); // reading never grows (docs/31/05, item 8): the ring first
  // The dev chest by the spawn, a setting rather than a thing in the map (docs/30 step 0).
  if (devChest) {
    const at = map.nearestWalkable(info.spawn[0] + 1, info.spawn[1] + 2, (x, y) => !!map.tileAt(x, y).prop || (x === info.spawn[0] && y === info.spawn[1]));
    if (at) map.placeProp(map.createProp({ sprite: "dev_chest", tile: at }), at[0], at[1]);
  }
  setPlayer(createPlayer(info.spawn[0], info.spawn[1]));
  if (look) S.player.look = { ...S.player.look, ...look };
  giveStarterKit(S.player);
  S.zombies = info.zombies.map(([x, y]) => createZombie(x, y));
  S.corpses = [];
  S.villagers = (info.villagers || []).map((v, i) => createVillager(v.tile[0], v.tile[1], { id: `v${i}`, name: v.name, line: v.line, wardrobe: v.wardrobe ?? i }));
  interact.setCharacters(() => [...S.villagers, ...S.zombies, ...S.corpses]);
  archery.setTargets(() => S.zombies); // what an arrow can hit when it lands (docs/20)
  map.ensureAround(S.player.gx, S.player.gy, 4);
  for (const [x, y] of map.takePendingSpawns()) S.zombies.push(createZombie(x, y));
  map.rebuildRooms();
  if (combatTesting) addTestingDead(info.spawn);
  return S;
}

// The starter kit (docs/11): worn tunic, breeches, boots, a rope belt with two
// slots, a burlap sack with water, a little food, and one plank; the torch in
// a hand. No hood: the head slot starts empty (Michael, 2026-10-10).
function giveStarterKit(player) {
  const entry = (id, props = {}) => items.makeEntry(id, 1, props); // every entry through the maker (docs/31/08, habit 2)
  for (const id of ["tunic", "breeches", "boots", "belt", "small_sack"]) {
    const e = entry(id);
    player.worn[items.getItem(id).wear] = e;
  }
  const bag = inventory.bagOf(player);
  inventory.addItem(bag, "waterskin", 1, { fill: 100 });
  inventory.addItem(bag, "bread", 1);
  inventory.addItem(bag, "apple", 2);
  inventory.addItem(bag, "plank", 1);
  items.hold(player.hands, entry("torch"));
}

// Forty of the dead standing about the open ground of the square, the same places every
// time (a small generator, not Math.random), at least five tiles from where you start.
function addTestingDead(spawn) {
  let seed = 90210;
  const rand = () => ((seed = (Math.imul(seed, 1103515245) + 12345) >>> 0) / 4294967296);
  const placed = [];
  for (let tries = 0; tries < 4000 && placed.length < 40; tries++) {
    const x = 1 + Math.floor(rand() * 30);
    const y = 1 + Math.floor(rand() * 30);
    if (!map.isWalkableTile(x, y) || map.tileAt(x, y).room > 0) continue;
    if (Math.hypot(x - spawn[0], y - spawn[1]) < 5) continue;
    if (placed.some(([px, py]) => Math.hypot(px - x, py - y) < 2)) continue;
    placed.push([x, y]);
    state.zombies.push(createZombie(x, y));
  }
}

// ---- the world as data, and back (docs/31/05, item 24: the save, and the join's snapshot) ----

// A deep copy JSON can carry (docs/31/05, item 24): the save shares nothing with
// the live world (a path array stepped on after the snapshot would change the
// snapshot), and Infinity and NaN, which JSON turns to null, go as tokens (a
// plain wall's hp, a zombie's time since it saw anyone).
export function toSafe(v) {
  if (typeof v === "number") return Number.isFinite(v) ? v : { $n: v > 0 ? "inf" : v < 0 ? "-inf" : "nan" };
  if (v === null || typeof v !== "object") return typeof v === "function" ? undefined : v;
  if (Array.isArray(v)) return v.map(toSafe);
  const out = {};
  for (const [k, x] of Object.entries(v)) {
    const y = toSafe(x);
    if (y !== undefined) out[k] = y;
  }
  return out;
}

export function fromSafe(v) {
  if (v === null || typeof v !== "object") return v;
  if (Array.isArray(v)) return v.map(fromSafe);
  const keys = Object.keys(v);
  if (keys.length === 1 && keys[0] === "$n") return v.$n === "inf" ? Infinity : v.$n === "-inf" ? -Infinity : NaN;
  const out = {};
  for (const k of keys) out[k] = fromSafe(v[k]);
  return out;
}

export function serialize() {
  const S = state;
  return toSafe({
    clock: clock.getElapsed(),
    simTime: loop.simTime(),
    rng: rng.getState(),
    world: { timeScale: world.world.timeScale, idCounter: world.idCounter() },
    map: { ...map.serializeMap(), sleepers: map.sleeperEntries().map(([k, list]) => [k, list.map(serializeCharacter)]) },
    characters: {
      players: S.players.map(serializeCharacter),
      zombies: S.zombies.map(serializeCharacter),
      corpses: S.corpses.map(serializeCharacter),
      villagers: S.villagers.map(serializeCharacter),
    },
  });
}

// The world put back: the map file loaded afresh for its authored source, the
// saved chunks installed over it, every character made by its own creator and
// given its saved fields, the links made by id, the counters, the clock, and the
// generator put back last (the creators roll). What the client must do after:
// its camera, sight, the ground's pictures, the player's sheet, the light.
export function restore(saved, json) {
  const S = state;
  const save = fromSafe(saved); // the tokens back to numbers, and nothing shared with the caller's object
  rng.seed(json.seed ?? 1);
  world.reset(json.idCounter || 0);
  S.info = map.loadMap(json);
  map.restoreMap(save.map);
  const makers = { player: createPlayer, zombie: createZombie, villager: createVillager };
  const all = [];
  const bring = (list) => (list || []).map((d) => {
    const ch = restoreCharacter(d, makers);
    all.push(ch);
    return ch;
  });
  const players = bring(save.characters.players);
  setPlayer(players[0] || null);
  S.players = players;
  S.zombies = bring(save.characters.zombies);
  S.corpses = bring(save.characters.corpses);
  S.villagers = bring(save.characters.villagers);
  S.others = [];
  S.progress = null;
  map.setSleepers((save.map.sleepers || []).map(([k, list]) => [k, bring(list)]));
  const byId = new Map(all.map((c) => [c.id, c]));
  for (const c of all) {
    c.target = c._targetId ? byId.get(c._targetId) || null : null;
    c.carrying = c._carryingId ? map.propById(c._carryingId) : null;
    delete c._targetId;
    delete c._carryingId;
    if (c.kind !== "player") {
      if (c.corpse) dressCorpse(c);
      else dress(c);
    }
  }
  interact.setCharacters(() => [...S.villagers, ...S.zombies, ...S.corpses]);
  archery.setTargets(() => S.zombies);
  archery.reset();
  burning.reset();
  stations.resetActive(map.allProps());
  world.reset(save.world.idCounter);
  world.setTimeScale(save.world.timeScale);
  clock.setElapsed(save.clock);
  loop.setSimTime(save.simTime);
  rng.setState(save.rng);
  light.forgetAll();
  return S;
}

// The world as a text, for a hash: the clock, every player, every one of the
// dead, villager, and corpse, at three decimals (tools/checks/determinism.js
// reads the same, so a headless world and the pane's agree by the same number).
export function hashText() {
  const S = state;
  const f = (n) => n.toFixed(3);
  return [
    `clock ${f(clock.getElapsed())}`,
    ...S.players.map((p) => `player ${f(p.gx)},${f(p.gy)} hp ${p.hp}`),
    ...S.zombies.map((z) => `${z.id} ${f(z.gx)},${f(z.gy)} ${z.state} ${z.wardrobe} hp ${z.hp}`),
    ...S.villagers.map((v) => `${v.id} ${f(v.gx)},${f(v.gy)} ${v.state}`),
    ...S.corpses.map((z) => `${z.id} ${f(z.gx)},${f(z.gy)} corpse`),
  ].join("\n");
}

export function hashOf(text) {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return (h >>> 0).toString(16).padStart(8, "0");
}

// An input snapshot with nothing pressed: what a player who is not there sends.
export function idleSnapshot() {
  return { axis: { x: 0, y: 0 }, sprint: false, clicked: false, clickSpent: false, mouse: null, leftDown: false, altPressed: false, altDown: false, offDown: false, space: false, blocked: false };
}

// A second (or later) player into the world (docs/31/03): their own character
// with the kit, standing at (gx, gy). The client bakes their sheet when it sees
// them (main.js refreshFigure). Returns the player.
export function addPlayer(gx, gy, { look = null, id = null } = {}) {
  const S = state;
  const p = createPlayer(gx, gy, { id });
  if (look) p.look = { ...p.look, ...look };
  giveStarterKit(p);
  S.players.push(p);
  if (!S.player) S.player = p;
  return p;
}

export function removePlayer(id) {
  const S = state;
  S.players = S.players.filter((p) => p.id !== id);
  if (S.player && S.player.id === id) S.player = S.players[0] || null;
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
  stations.update(dt); // every station's queue, in the world's time (docs/30, section 6)
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
// `snapshots`: each present player's input for the step by id (Map or object);
// a player with none stands where they are and does nothing (their client is
// not here). The step is the same for every player, in the players' order.
export function step(dt, snapshots = null) {
  const S = state;
  const snapOf = (p) => (snapshots instanceof Map ? snapshots.get(p.id) : snapshots && snapshots[p.id]) || null;
  for (const p of S.players) {
    const snap = snapOf(p);
    updatePlayer(p, dt, snap || undefined);
    bleed.update(p, dt);
    // The mouse and the keys, as a snapshot, to the player's controller (docs/23a, D1; never the input module).
    // Only a player whose client is here is controlled: the draw and the combat clock are still
    // one per world (docs/31/05, items 12 and 13), so an absent player's idle input must not touch them.
    if (snap) controlPlayer(p, S.zombies, dt, snap);
  }
  archery.update(dt);
  S.others = [...S.players, ...S.zombies, ...S.villagers]; // the living, who block and are hunted
  const everyone = [...S.others, ...S.corpses]; // and the fallen, who burn and are drawn
  burning.update(dt, everyone); // the burning, a visual (docs/05)
  for (const p of S.players) {
    p.actionProgress = interact.updateAction(p, dt);
    // Anyone walking through a crop or a mushroom sets it swaying (Michael, 2026-10-12).
    interact.brushThrough(p);
  }
  S.progress = S.player ? S.player.actionProgress : null;
  // The dead far from every player stand still: a stand-in for the records of
  // docs/03 until that milestone.
  for (const z of S.zombies) {
    if (!nearPlayer(z)) continue;
    updateZombie(z, dt, S.players, S.others, S.villagers);
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
  for (const p of S.players) {
    if (p.hp <= 0 && !p.dead) {
      // Death (Michael, 2026-10-10 night): the world says so; the client whose player it is shows the
      // dead screen, and the way back to the title is a fresh load.
      p.dead = true;
      events.emit("gameOver", { player: p });
    }
  }
  // Rooms refound if a wall changed, before the light reads them (light.update
  // asks for current rooms; the one-file step had the client's roomAt do this).
  map.roomsIfDirty();
  // The light each player carries (docs/02): a torch in hand at full, two at more,
  // else one on the belt at half. The strength also scales how far the dead
  // see the flame (zombie.js). One carried light per player, with its owner (docs/31/05, item 15).
  const carried = [];
  for (const p of S.players) {
    const held = items.heldFire(p.hands);
    const twoHanded = held && p.hands.main && p.hands.off && p.hands.main !== p.hands.off && items.getItem(p.hands.main.id).fire && items.getItem(p.hands.off.id).fire;
    const belted = held ? null : beltFire(inventory.beltOf(p));
    const fire = held || belted;
    const strength = held ? (twoHanded ? tuning.world.twoTorches : 1) : tuning.world.beltLight;
    if (fire) carried.push({ owner: p.id, gx: p.gx, gy: p.gy, radius: fire.radius * strength, flicker: fire.flicker || null, strength });
  }
  light.setCarriers(carried);
  light.setBurners(burning.lights(everyone));
  light.update();
}
