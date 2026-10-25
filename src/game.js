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
import * as sick from "./sick.js"; // tainted water's debuff (docs/44)
import * as burn from "./burn.js"; // burning as a status (#14): the step's, beside the visual fire.js
import * as fruit from "./fruit.js"; // bare fruit trees bear again (#190)
import * as farming from "./farming.js"; // crops grow on the clock (#194)
import * as resources from "./resources.js"; // a taken natural resource comes back elsewhere in its area (docs/46)
import * as trees from "./trees.js"; // a planted sapling grows into a tree; sticks under trees (docs/46 step 3)
import * as chart from "./chart.js"; // what the world has seen of itself (docs/33, #203)
import * as kit from "./kit.js"; // the starting kit as data and the world's additions (#136)
import * as infection from "./infection.js";
import * as combat from "./combat.js";
import * as interact from "./interact.js";
import * as items from "./items.js";
import * as inventory from "./inventory.js";
import * as rules from "./rules.js";
import * as tuning from "./tuning.js";
import * as stations from "./stations.js"; // the stations' queues run in the world's time (docs/30, section 6)
import "./dye.js"; // the dye vat's verb (docs/43 section 8, #412)
import * as rng from "./rng.js";
import * as world from "./world.js";
import * as loop from "./loop.js";
import { serializeCharacter, restoreCharacter, dress, dressCorpse } from "./entities/character.js";
import { createPlayer, updatePlayer, updateFallen, setSleepScaleRule, setSiegeQuery, damagePlayer, autoDrink } from "./entities/player.js";
import { canPutDown } from "./placement.js";
import { playAnimation } from "./sprites.js";
import { createZombie, updateZombie, siegeHeldOn } from "./entities/zombie.js";
import { createVillager, updateVillager, turnVillager, damageVillager, setTalkWorld, talkIdOf } from "./entities/villager.js";
import { controlPlayer } from "./player-controller.js";
import * as animal from "./entities/animal.js"; // the valley's game and livestock (docs/45)
import { getDef } from "./assets.js"; // a sprite definition's data (a feeding trough's `feed`; the item a placed prop stands as, itemCensus #101): read, never drawn

export const state = {
  info: null, // what the map file gave: spawn, the authored dead and villagers, the name
  player: null, // the one player, until there are several (docs/31/03): `players` is the list
  players: [],
  zombies: [], // the dead that still think; the fallen move to corpses (docs/23a, B1)
  corpses: [],
  villagers: [],
  animals: [], // game and livestock, living and dead (docs/45): one list, a dead one marked so
  animalHomes: [], // where the map put each herd and flock, with its cap and its renewal (animal.js)
  others: [], // the living, rebuilt each step; the interface reads it between steps
  progress: null, // 0..1 of the player's timed action
  acting: null, // the player whose update or command runs right now, so a message finds its screen (net.js)
};

// The player's list, kept with the one player while the game has one.
export function setPlayer(p) {
  state.player = p;
  state.players = p ? [p] : [];
}

// Me among the players, the list kept: a world played again as the character this browser made there,
// or a new character after a death with the body still listed (docs/31/09).
export function pickPlayer(p) {
  if (p && state.players.includes(p)) state.player = p;
}

// The world from a map file: the generator seeded, the map loaded and the
// spawn's ring grown first (reading never grows), the dev chest if asked, the
// player with their look and the starter kit, the authored dead and villagers,
// the ring round the player and its wild dead, the rooms, the testing dead if
// asked. The same calls in the same order in the browser's boot (main.js, the
// world stage) and headless (tools/world.js), so both worlds hash the same.
// What the client does after (the camera, sight, the ground, the player's
// sheet) touches nothing the hash sees.
export function create({ json, look = null, name = null, devChest = false, rules: chosen = null }) {
  const S = state;
  // The world's own rules (docs/38, #109): the defaults, over them what its Sandbox step chose; a server world's
  // source, when it has one, wins on the refresh below.
  rules.setWhole(chosen || {});
  rules.refresh();
  rng.seed(json.seed ?? 1); // the sim's one generator, seeded from the map (docs/23a, C1)
  world.reset(json.idCounter || 0); // the world's time scale and id counter (docs/30 step 2; docs/31/08)
  S.info = map.loadMap(json, mapOptions());
  fruit.reset();
  farming.reset();
  trees.reset(); // a new world looks at its saplings at once
  resources.reset(); // a new world owes nothing
  map.setTouchHook(chart.noteTouched);
  chart.reset(); // a new world has seen nothing
  const info = S.info;
  map.ensureAround(info.spawn[0], info.spawn[1], 4); // reading never grows (docs/31/05, item 8): the ring first
  // The dev chest by the spawn, a setting rather than a thing in the map (docs/30 step 0).
  if (devChest) {
    const at = map.nearestWalkable(info.spawn[0] + 1, info.spawn[1] + 2, (x, y) => !!map.tileAt(x, y).prop || (x === info.spawn[0] && y === info.spawn[1]));
    if (at) map.placeProp(map.createProp({ sprite: "dev_chest", tile: at }), at[0], at[1]);
  }
  setPlayer(createPlayer(info.spawn[0], info.spawn[1]));
  if (look) S.player.look = { ...S.player.look, ...look };
  if (name) S.player.name = name;
  giveStarterKit(S.player);
  S.zombies = placeAuthoredDead(info.zombies).map(([x, y]) => createZombie(x, y));
  S.corpses = [];
  S.villagers = (info.villagers || []).map((v, i) => createVillager(v.tile[0], v.tile[1], { id: `v${i}`, name: v.name, line: v.line, wardrobe: v.wardrobe ?? i, immune: !!v.immune, talk: talkIdOf(v), guide: !!v.guide }));
  S.animalHomes = animal.homesFrom(info.animals); // the herds, the flocks, and the pens' stock where the map put them (docs/45)
  S.animals = animal.populate(S.animalHomes);
  interact.setCharacters(() => [...S.villagers, ...S.zombies, ...S.corpses, ...S.animals]);
  burn.setCharacters((id) => S.corpses.find((c) => c.id === id) || S.zombies.find((c) => c.id === id) || null); // Burn corpse's body by id (docs/43 section 7)
  wireTalk();
  wireAnimals();
  map.ensureAround(S.player.gx, S.player.gy, 4);
  for (const [x, y] of map.takePendingSpawns()) S.zombies.push(createZombie(x, y));
  map.rebuildRooms();
  return S;
}

// A speech line's life, counted down in the world's step on the authority and cleared when it runs out (#154): a browser host and a server world
// agree (a server never runs ui/speech.js), a villager's bark and a groan do not freeze and are not resent for ever, and a guest's replica sees the
// line end when the record without it arrives. A paused world keeps its bubbles because it does not step.
function ageSpeech(dt) {
  const S = state;
  for (const list of [S.players, S.zombies, S.villagers, S.corpses]) {
    for (const c of list) {
      const l = c.line;
      if (!l) continue;
      l.left -= dt;
      if (l.left <= 0 || c.dead) c.line = null;
    }
  }
}

// What an arrow can hit when it lands (docs/20), what a blow reaches beside the dead, and what the hunting verbs find by id: the
// living dead and the animals (docs/45 section 2). The lists are the world's own, read when a shot lands or a blow swings.
function wireAnimals() {
  const S = state;
  animal.resetSnares(map.allProps()); // the snares this world has, set before it was saved
  animal.setDefs((id) => { try { return getDef(id); } catch { return null; } }); // what a feeding trough is (a definition's `feed`)
  archery.setTargets(() => [...S.zombies, ...S.animals]);
  combat.setAnimals(() => S.animals);
  animal.setAnimalList(() => S.animals);
}

// What the talk conditions read (docs/34): the dead, the living villagers, and the talk ids the map placed (a villager gone from the
// list is dead). The lists are the world's own, read when a bark asks.
function wireTalk() {
  const S = state;
  setTalkWorld(() => ({ zombies: S.zombies, villagers: S.villagers, roster: new Set(((S.info && S.info.villagers) || []).map(talkIdOf).filter(Boolean)) }));
}

// The starter kit (docs/11; #136): `data/kit.json`, with what the world's rules add (`extraKit`, `devBag`), made by kit.js.
// No hood: the head slot starts empty (Michael, 2026-10-10); the torch begins unlit, the tinderbox beside it (Michael, 2026-10-17).
function giveStarterKit(player) {
  kit.give(player, { extra: rules.rules.extraKit, devBag: rules.rules.devBag });
}

// The map's rules as the world reads them when it loads the map (docs/38 and `02`, #130): trees or none, and the
// factor the Starting population scales the dead by.
function mapOptions() {
  return { trees: rules.rules.trees, population: tuning.population[rules.rules.population] ?? 1 };
}

// The dead the map places by hand, scaled by the Starting population rule: each stands as many times as the factor
// says, the fraction settled by its own tile, so a factor of one is the map's list exactly and any other is the same
// everywhere. An extra stands on the nearest free open tile (map.authoredNear), never behind a wall. Never grows with
// time: it is read once, when the world is made.
function placeAuthoredDead(list) {
  const factor = tuning.population[rules.rules.population] ?? 1;
  const taken = new Set(list.map(([x, y]) => `${x},${y}`));
  const out = [];
  for (const [x, y] of list) {
    const copies = Math.floor(factor + map.hash2(x, y, 7001));
    if (copies <= 0) continue;
    out.push([x, y]);
    for (let i = 1; i < copies; i++) {
      const at = map.authoredNear(x, y, taken);
      if (!at) break;
      taken.add(`${at[0]},${at[1]}`);
      out.push(at);
    }
  }
  return out;
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

// The world as one plain object: what a save holds and what a joining guest receives.
//
// A save that costs what changed (2026-10-15, `02`): the chunks are nine tenths of a save (the props on them, the
// trees most of all), so each chunk's safe form is kept on the chunk (map.savedChunks) and made again only once the
// chunk has changed (map.unsaved says when). The objects in `map.chunks` are those kept copies, shared from one save to
// the next: nothing may change them (a store clones them, restore copies them through fromSafe). `{ fresh: true }`
// makes every chunk afresh and keeps nothing, which is how the cache is proved (verifySaveCache, the checks).
const CHUNKS_SLOT = "\u0001cmz-chunks\u0001"; // stands in for the chunks while the rest is turned to text
function savedChunk(c) {
  return { obj: toSafe(map.serializeChunk(c)), text: null };
}
function worldWithout(chunks) {
  const S = state;
  const out = toSafe({
    clock: clock.getElapsed(),
    simTime: loop.simTime(),
    rng: rng.getState(),
    world: { timeScale: world.world.timeScale, idCounter: world.idCounter() },
    rules: { ...rules.rules }, // the world's own rules ride in its save (item 5's second step; a server world reads only these)
    chart: chart.serialize(), // what the world has seen: the world's, not any player's, and it outlives the chunks it was seen in
    resources: resources.serialize(), // the natural resources owed to their areas, and the last look (docs/46): the host's, as the generator is
    map: { chunks: null, pending: map.serializePending(), sleepers: map.sleeperEntries().map(([k, list]) => [k, list.map(serializeCharacter)]) },
    characters: {
      players: S.players.map(serializeCharacter),
      zombies: S.zombies.map(serializeCharacter),
      corpses: S.corpses.map(serializeCharacter),
      villagers: S.villagers.map(serializeCharacter),
      animals: S.animals.map(animal.serializeAnimal),
    },
    animalHomes: S.animalHomes.map((h) => ({ ...h, at: h.at.slice() })),
  });
  out.map.chunks = chunks;
  return out;
}
export function serialize({ fresh = false } = {}) {
  if (fresh) return worldWithout(map.serializeMap().chunks.map(toSafe));
  return worldWithout(map.savedChunks(savedChunk).map((s) => s.obj));
}

// The same world as JSON text, the chunks' text kept with their objects: what the server writes and packs, without
// turning the unchanged chunks to text again. JSON.stringify(serialize()) and this are the same characters.
export function serializeText() {
  const kept = map.savedChunks(savedChunk);
  const parts = new Array(kept.length);
  for (let i = 0; i < kept.length; i++) {
    const s = kept[i];
    if (s.text === null) s.text = JSON.stringify(s.obj);
    parts[i] = s.text;
  }
  const text = JSON.stringify(worldWithout(CHUNKS_SLOT));
  const at = text.indexOf(JSON.stringify(CHUNKS_SLOT));
  return `${text.slice(0, at)}[${parts.join(",")}]${text.slice(at + JSON.stringify(CHUNKS_SLOT).length)}`;
}

// The cache proved against the world: every chunk's kept copy compared with the chunk made afresh. A chunk the copy
// had wrong is a change that marked nothing (map.unsaved's list is missing it): its copy is replaced, and its key and
// first difference are returned for the caller to say out loud. Costs a whole save; the server runs it with its
// rolling copy and its last save, the browser with every tenth autosave, the checks always.
export function verifySaveCache() {
  const wrong = [];
  map.eachChunk((c) => {
    if (!c.saved) return;
    const now = savedChunk(c);
    const was = c.saved.text === null ? JSON.stringify(c.saved.obj) : c.saved.text;
    const is = JSON.stringify(now.obj);
    if (was === is) return;
    let i = 0;
    while (i < was.length && was[i] === is[i]) i++;
    wrong.push({ cx: c.cx, cy: c.cy, layer: c.layer, kept: was.slice(Math.max(0, i - 60), i + 60), now: is.slice(Math.max(0, i - 60), i + 60) });
    c.saved = now;
  });
  return wrong;
}

// The world put back: the map file loaded afresh for its authored source, the
// saved chunks installed over it, every character made by its own creator and
// given its saved fields, the links made by id, the counters, the clock, and the
// generator put back last (the creators roll). What the client must do after:
// its camera, sight, the ground's pictures, the player's sheet, the light.
// What a restored character carries: the prop by id if it stands on the map, else revived from its record.
export function carriedOf(c) {
  if (!c._carryingId) return null;
  return map.propById(c._carryingId) || (c._carried ? map.reviveProp(c._carried, false) : null);
}

export function restore(saved, json) {
  const S = state;
  const save = fromSafe(saved); // the tokens back to numbers, and nothing shared with the caller's object
  rules.setWhole(save.rules || {}); // the world's rules as saved (the defaults for any it lacks); a server world's source wins on the refresh
  rules.refresh();
  rng.seed(json.seed ?? 1);
  world.reset(json.idCounter || 0);
  S.info = map.loadMap(json, mapOptions());
  map.restoreMap(save.map);
  map.setTouchHook(chart.noteTouched);
  chart.restore(save.chart);
  fruit.reset();
  resources.restore(save.resources); // a save from before it owes nothing (worlds are expendable, 2026-10-17)
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
  S.animals = (save.characters.animals || []).map(animal.restoreAnimal);
  S.animalHomes = save.animalHomes || animal.homesFrom(S.info.animals);
  S.others = [];
  S.progress = null;
  map.setSleepers((save.map.sleepers || []).map(([k, list]) => [k, bring(list)]));
  const byId = new Map(all.map((c) => [c.id, c]));
  for (const c of all) {
    c.target = c._targetId ? byId.get(c._targetId) || null : null;
    c.carrying = carriedOf(c);
    delete c._targetId;
    delete c._carryingId;
    delete c._carried;
    if (c.corpse) dressCorpse(c); // a player's body too (2026-10-14)
    else if (c.kind !== "player") dress(c);
  }
  interact.setCharacters(() => [...S.villagers, ...S.zombies, ...S.corpses, ...S.animals]);
  burn.setCharacters((id) => S.corpses.find((c) => c.id === id) || S.zombies.find((c) => c.id === id) || null); // Burn corpse's body by id (docs/43 section 7)
  wireTalk();
  wireAnimals();
  archery.reset();
  burning.reset();
  stations.resetActive(map.allProps());
  world.reset(save.world.idCounter);
  world.setTimeScale(save.world.timeScale);
  clock.setElapsed(save.clock);
  farming.reset(true); // after the clock: a restored world's crops wait for the next boundary, as the running one's did
  trees.reset(true); // and its saplings
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
    ...S.animals.map((a) => `${a.id} ${a.species} ${f(a.gx)},${f(a.gy)} ${a.state}${a.dead ? " dead" : ""}`),
  ].join("\n");
}

// How fast the world runs, from who is asleep (Michael, 2026-10-13): the sleep speed only while every living player
// in the world is asleep, ordinary time otherwise: a friend still awake keeps the world at its pace, and sleep
// stays optional. A dormant player is out of the world's list and does not count; a dead one does not either.
export function everyoneAsleep() {
  const living = state.players.filter((p) => !p.dead);
  return living.length > 0 && living.every((p) => p.sleeping);
}
export function timeScaleNow() {
  return everyoneAsleep() ? tuning.player.sleepTimeScale : 1;
}
setSleepScaleRule(timeScaleNow);
setSiegeQuery((player) => siegeHeldOn(state.zombies, player));

// A player falls (Michael, 2026-10-14): whatever they were doing stops, what they carried on their head is set down
// beside them where there is room (else it stays with the body and comes back with a search of nothing: it is kept in
// the save), and the fall plays. The body is made once the fall is over (step).
function fall(p) {
  p.sleeping = null;
  p.action = null;
  p.auto = null;
  p.blocking = false;
  archery.cancelDraw(p);
  if (p.carrying) {
    const x0 = Math.round(p.gx);
    const y0 = Math.round(p.gy);
    let spot = null;
    for (let r = 0; r <= 2 && !spot; r++) for (let dy = -r; dy <= r && !spot; dy++) for (let dx = -r; dx <= r && !spot; dx++) if (canPutDown(p, x0 + dx, y0 + dy)) spot = [x0 + dx, y0 + dy];
    if (spot) {
      map.placeProp(p.carrying, spot[0], spot[1]);
      p.carrying = null;
    }
  }
  playAnimation(p.anim, "die", true);
}

// The dead's bites and blows are the world's rules (item 5's first step, 2026-10-14, `02`): a bite's damage through
// the guard and the exposure, the wound that bleeds, the infection (docs/02 question 29b); a villager's damage.
// They were applied by main.js's event handlers, so a world with no page behind it (tools/world.js, a server world)
// never applied a bite, unseen until the server plan. Here, once, where the world is, in the same order and inside
// the same step as before, so the hashes stand; the client listens for `bitten` to say the words to its own player.
events.on("playerHit", ({ zombie, damage, victim }) => {
  const p = victim || state.player;
  if (!p) return;
  const taken = combat.exposedTo(p, zombie, combat.guardAgainst(p, zombie, damage));
  damagePlayer(p, taken);
  const opened = bleed.onBite(p, taken);
  const infected = infection.onBite(p, taken);
  events.emit("bitten", { player: p, zombie, taken, opened, infected });
});
events.on("villagerHit", ({ villager, damage }) => damageVillager(villager, damage));
// A boar's bite (docs/45 section 2: it fights back at the player who struck it), through the guard and the exposure as the dead's is; no wound
// to bleed and no infection, which are the dead's.
events.on("animalBite", ({ animal: a, victim, damage }) => {
  if (!victim || victim.dead) return;
  damagePlayer(victim, combat.exposedTo(victim, a, combat.guardAgainst(victim, a, damage)));
});

// The whole world in parts, each hashed, for the sync check (docs/31/04, "a replica check"; tier 3's gate):
// what the wire promises a replica has. The map chunk by chunk (floors, walls, props with their bags and
// their fires), the prop registry (every id the map answers to, the carried ones apart: a guest that
// lost a lifted prop's id from its registry, or kept a removed one, shows here, as the review found),
// the fires, the players whole (their position at three decimals, their hands, their worn, their bags
// by uid, an entry's dye: its `colours`, docs/43 section 8), the dead and the villagers as the frames carry them (position, state, hp), the clock,
// and every item counted (`items` and `census`, itemCensus below: #101). Not
// in it: the generator's state and the id counter, which a replica never rolls or draws from, and the natural resources' debts (docs/46,
// resources.js), the host's record of what it will grow, which a replica never steps: what a debt grows reaches it as a touched chunk.
export function syncParts() {
  const S = state;
  const f = (n) => (typeof n === "number" ? n.toFixed(3) : String(n));
  const m = map.serializeMap();
  // A fire's fuel to the unit: a replica refreshes it at each whole unit burned (map.burnFires), not each step.
  const chunks = (m.chunks || []).slice().sort((a, b) => (a.cx - b.cx) || (a.cy - b.cy)).map((c) => ({ ...c, props: (c.props || []).map((p) => { const { pokedAt, playedAt, ...q } = p; return q.fire && typeof q.fire.fuel === "number" ? { ...q, fire: { ...q.fire, fuel: Math.floor(q.fire.fuel) } } : q; }) }));
  // An entry's wear in whole hundredths, as the wire compares it (net.js sends a player's heavy part when its wear rounds differently), and its
  // repair count (docs/43 section 6), its dye (section 8), whether its water is clean (docs/44), and the tree a sapling grows into (docs/46 step 3): a guest's copy of a wear lags the host's by under a hundredth and never rounds otherwise.
  const entryText = (e) => (e ? `${e.id}#${e.uid}x${e.count ?? 1}${e.lit ? "L" : ""}${e.fill != null ? `f${f(e.fill)}` : ""}${e.clean ? "clean" : ""}${e.tree ? `t${e.tree}` : ""}${e.wear > 0 ? `w${Math.round(e.wear * 100)}` : ""}${e.repairs ? `r${e.repairs}` : ""}${e.colours ? `c${e.colours.join("/")}` : ""}${e.colour ? `c${e.colour}` : ""}${e.bag ? `[${(e.bag.items || []).map(entryText).join(",")}]` : ""}` : "-");
  const at = (c) => (c.netTo ? c.netTo : [c.gx, c.gy]); // a replica's smoothing target is the host's truth (net.js)
  // Health as the wire carries it, to two decimals (net.js r2): a bleeding player's drains in fractions every step, so
  // three decimals differed between the host and every replica though nothing was wrong (found testing item 5's third
  // step, the first bleeding guest a sync check met; the rule a fire's fuel already follows: compare what the wire promises).
  const hp2 = (n) => (typeof n === "number" ? (Math.round(n * 100) / 100).toFixed(2) : String(n));
  const playerText = (p) => [`${p.id} ${f(at(p)[0])},${f(at(p)[1])} hp ${hp2(p.hp)} ${p.dead ? "dead" : "alive"}`, `hands ${entryText(p.hands.main)} ${entryText(p.hands.off)}`, `worn ${Object.keys(p.worn).sort().map((k) => `${k}:${entryText(p.worn[k])}`).join(" ")}`, `hidden ${(p.hidden || []).join(",")}`, `belt ${(inventory.beltOf(p) || []).map(entryText).join(" ")}`, `carrying ${p.carrying ? p.carrying.id : "-"}`, `bleed ${p.bleed ? `${p.bleed.stacks}/${hp2(p.bleed.left)}` : "-"}`, `sick ${p.sick ? `${p.sick.stacks}/${hp2(p.sick.left)}` : "-"}`].join(" | "); // the wound a bleeding player has, and Sick (docs/44): stacks and time, as the wire carries them (#308)
  const parts = {
    map: hashOf(JSON.stringify(chunks, (k, v) => (k === "wear" && typeof v === "number" ? Math.floor(v * 100) / 100 : k === "hp" && typeof v === "number" ? undefined : k === "boards" && v && Array.isArray(v.near) ? { near: v.near.length, far: v.far.length } : v))), // a mounted torch's wear to the hundredth: what the wire sends (map.burnHolders); a wall's health not at all (the wire sends a break, not the blows: strikeFence, damageOpening), a board's health (a bare number in `wall.boards`) not either, only how many boards stand, so a broken one still shows
    chart: hashOf(chart.hashText()), // what the world has seen, the charted chunks sorted (docs/33)
    registry: hashOf([...map.allProps()].map((p) => p.id).sort().join(",")),
    fires: hashOf(`${[...map.fires()].map((p) => `${p.id}:${p.fire && p.fire.lit ? "lit" : "out"}`).sort().join(",")}`),
    players: hashOf(S.players.slice().sort((a, b) => (a.id < b.id ? -1 : 1)).map(playerText).join("\n")),
    // The dead as the frames carry them (the wire sends them as a delta, so a missed update shows here): where, state, hp,
    // facing, the frame of the animation, burning, a body set alight by Burn corpse (docs/43 section 7), a villager's cowering (its state).
    dead: hashOf([...S.zombies, ...S.villagers, ...S.corpses].slice().sort((a, b) => (a.id < b.id ? -1 : 1)).map((z) => `${z.id} ${f(at(z)[0])},${f(at(z)[1])} ${z.state || "-"} hp ${hp2(z.hp)} ${z.dead ? "dead" : ""}${z.corpse ? "corpse" : ""} ${z.facing} ${z.anim ? `${z.anim.name}:${z.anim.frame}` : "-"}${z.burning ? " fire" : ""}${z.cremate ? " cremate" : ""}${z.talkingWith && z.talkingWith.length ? ` talk ${z.talkingWith.join("+")}` : ""}`).join("\n")),
    // The animals as the frames carry them (docs/45 section 7): where, the state, health, dead, how it was killed and whether it is
    // skinned (a carcass, step 2; a butchered one has left the list), who leads it and the days it was fed and its milk or wool taken
    // (step 3), the facing and the frame of the animation, the home; and each home's renewal.
    animals: hashOf([...S.animals.slice().sort((a, b) => (a.id < b.id ? -1 : 1)).map((a) => `${a.id} ${a.species} ${f(at(a)[0])},${f(at(a)[1])} ${a.state} hp ${hp2(a.hp)} ${a.dead ? `dead ${a.killedBy || "-"}${a.skinned ? " skinned" : ""}` : ""}${a.leaderId ? ` led ${a.leaderId}` : ""} fed ${a.fedDay} taken ${a.takenDay} ${a.facing} ${a.anim.name}:${a.anim.frame} home ${a.homeId || "-"} ${a.home.join(",")}`), ...S.animalHomes.map((h) => `${h.id} ${h.species} cap ${h.cap} next ${h.nextAt === null ? "-" : f(h.nextAt)}`)].join("\n")),
    clock: hashOf(`${f(clock.getElapsed())} ${f(loop.simTime())} ${world.world.timeScale}`),
    rules: hashOf(Object.keys(rules.rules).sort().map((k) => `${k}=${typeof rules.rules[k] === "boolean" ? (rules.rules[k] ? 1 : 0) : rules.rules[k]}`).join(" ")), // world state since the second step of item 5
  };
  // Every item in the world counted (#101, tier 3's duplication count): the units of each item id held by all but the living, hashed;
  // the living dead's and villagers' apart; and the census's line with how many entries are held twice. A part that differed caught a
  // divergence; these catch a count that drifted the same way on both sides, against a mark taken before (tools/checks/sync.js), and
  // a uid in two places at once.
  const census = itemCensus(m.chunks || []);
  parts.items = hashOf(census.text);
  parts.living = hashOf(census.livingText);
  parts.census = census.summary;
  parts.counts = `${chunks.length} chunks, ${[...map.allProps()].length} props, ${[...map.fires()].length} fires, ${S.players.length} players, ${S.zombies.length} dead, ${S.villagers.length} villagers, ${S.corpses.length} corpses, ${S.animals.length} animals`;
  return parts;
}

// Every item in the world (#101): each entry wherever it is held, on the map (a prop's bag, a station's output, a set-down bag, the
// floor's items, and what is inside each of those) and on the characters (the players', the dead's, the villagers', and the bodies'
// hands, worn things with the bags and belts in them, pockets, a body's grid, a carried prop), as the frames carry them to a guest.
// An entry is an object whose `id` is an item's and that has no `sprite` (a prop's). What stands or hangs as an item without being an
// entry counts one unit of that item with no uid, held by "placed": a laid rug (`rugItem`), a painting on a wall (`hangings`' `item`),
// a bracket a player hung (`made`: a wall bracket) and the torch in any bracket, a prop whose definition names its `item` (a torch post,
// a snare, a decorative pumpkin, a planted sapling until it grows into its tree, docs/46 step 3), the torch in a post (`fire.has`), and a
// campfire (the Campfire item it is picked up as).
// Not counted: what is lodged in one of the dead or in an animal (`lodged`, `lodgedItems`), which is not on the wire and stays the
// host's until a search or a butchering lays it out; an animal holds nothing else.
// Two places that are one thing by design count once: a two-handed thing in both hands (the same object; on a replica, a two-handed
// item's one uid in both), and a searched body, whose grid IS the body (its worn slots point at the grid's entries, or at what was taken
// from it: character.js lootOf), so a body with a grid is counted by its grid alone. `chunks` is `map.serializeMap().chunks` when the
// caller has it. Returns the entries, the units (counts summed), the kinds, the entries with no uid (the dead's garments before a search
// are literals), those with a count under one, the places nested too deep to walk (`deep`, said, never dropped silently), each uid held
// more than once with where, the `totals` by id and the same by holder (`groups`: the map, the placed, the players, the bodies, the
// living dead and the villagers), the `text` of every kind's units held by all but the living (sorted, what the part `items` hashes),
// the living's apart (`livingText`, the part `living`: their garments, which only a search or a kill moves), and a one-line `summary`.
const CENSUS_DEPTH = 16;
export function itemCensus(chunks = null) {
  const S = state;
  const totals = new Map(); // item id -> units
  const groups = { map: new Map(), placed: new Map(), players: new Map(), bodies: new Map(), living: new Map() }; // the same, by holder
  const where = new Map(); // uid -> the first place it was found
  const dups = []; // { uid, id, places }
  const deep = []; // the places a walk went past CENSUS_DEPTH
  let entries = 0;
  let units = 0;
  let noUid = 0;
  let empty = 0;
  const tally = (id, n, group) => {
    units += n;
    totals.set(id, (totals.get(id) || 0) + n);
    group.set(id, (group.get(id) || 0) + n);
  };
  const isEntry = (o) => typeof o.id === "string" && o.sprite === undefined && items.hasItemDef(o.id);
  const walk = (o, at, group, depth = 0) => {
    if (!o || typeof o !== "object") return;
    if (depth > CENSUS_DEPTH) {
      if (!deep.includes(at)) deep.push(at);
      return;
    }
    if (Array.isArray(o)) {
      for (const v of o) walk(v, at, group, depth + 1);
      return;
    }
    if (isEntry(o)) {
      entries++;
      const n = typeof o.count === "number" ? o.count : 1;
      if (n < 1) empty++;
      tally(o.id, n, group);
      if (o.uid == null) noUid++;
      else if (where.has(o.uid)) {
        const d = dups.find((x) => x.uid === o.uid);
        if (d) d.places.push(at);
        else dups.push({ uid: o.uid, id: o.id, places: [where.get(o.uid), at] });
      } else where.set(o.uid, at);
    }
    for (const v of Object.values(o)) if (v && typeof v === "object") walk(v, at, group, depth + 1);
  };
  const placed = (id, group) => {
    if (typeof id === "string" && items.hasItemDef(id)) tally(id, 1, group);
  };
  // A prop as the item it stands as. `live` is the prop itself, for what its record leaves out as its definition's default.
  const propPlaced = (live, group) => {
    if (!live) return;
    let def = null;
    try { def = getDef(live.sprite); } catch { def = null; }
    if (live.rugItem) placed(live.rugItem, group);
    if (def && typeof def.item === "string") placed(def.item, group);
    if (live.sprite === "campfire") placed("campfire", group);
    if (def && def.fire && def.fire.holds && live.fire && live.fire.has) placed(def.fire.holds, group);
  };
  for (const c of chunks || map.serializeMap().chunks || []) {
    for (const p of c.props || []) {
      walk(p, `prop ${p.id} in chunk ${c.cx},${c.cy}`, groups.map);
      propPlaced(map.propById(p.id) || p, groups.placed);
    }
    for (const [lx, ly, edge, w] of c.walls || []) {
      walk(w, `the ${edge} wall of ${c.cx * map.CHUNK + lx},${c.cy * map.CHUNK + ly}`, groups.map);
      for (const h of (w && w.hangings) || []) if (h && h.item) placed(h.item, groups.placed);
      const br = w && w.bracket;
      if (br && br.made) placed("wall_bracket", groups.placed);
      if (br && br.torch && !br.lantern) placed("torch", groups.placed);
    }
    for (const [lx, ly, list] of c.items || []) walk(list, `the floor at ${c.cx * map.CHUNK + lx},${c.cy * map.CHUNK + ly}`, groups.map);
  }
  const holders = [[S.players, groups.players], [S.corpses, groups.bodies], [S.zombies, groups.living], [S.villagers, groups.living]];
  for (const [list, group] of holders) for (const ch of list) {
    const who = `${ch.kind || "character"} ${ch.id}`;
    if (ch.loot) walk(ch.loot, `${who}'s body`, group);
    else {
      const main = ch.hands ? ch.hands.main : null;
      const off = ch.hands ? ch.hands.off : null;
      if (main) walk(main, `${who}'s main hand`, group);
      const oneThing = !!off && !!main && (off === main || (items.handFor(off.id) === "both" && off.uid != null && off.uid === main.uid));
      if (off && !oneThing) walk(off, `${who}'s off hand`, group);
      for (const [slot, e] of Object.entries(ch.worn || {})) if (e) walk(e, `${who}'s ${slot}`, group);
      if (ch.pockets) walk(ch.pockets, `${who}'s pockets`, group);
    }
    if (ch.carrying) {
      walk(map.serializeProp(ch.carrying), `what ${who} carries`, group);
      propPlaced(ch.carrying, group);
    }
  }
  const textOf = (m) => [...m.keys()].sort().map((id) => `${id} ${m.get(id)}`).join("\n");
  const held = new Map();
  for (const k of ["map", "placed", "players", "bodies"]) for (const [id, n] of groups[k]) held.set(id, (held.get(id) || 0) + n);
  const text = textOf(held);
  const livingText = textOf(groups.living);
  let summary = `${entries} entries, ${units} units, ${totals.size} kinds, ${noUid} with no uid, ${empty} under one, ${deep.length} too deep, ${dups.length} held twice`;
  if (dups.length) {
    summary += ":";
    for (const d of dups) {
      const more = ` ${d.uid}`;
      if (summary.length + more.length > 190) { summary += " ..."; break; }
      summary += more;
    }
  }
  return { entries, units, kinds: totals.size, noUid, empty, deep, totals, groups, dups, text, livingText, summary };
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
export function addPlayer(gx, gy, { look = null, name = null, id = null } = {}) {
  const S = state;
  const p = createPlayer(gx, gy, { id });
  if (look) p.look = { ...p.look, ...look };
  if (name) p.name = name;
  giveStarterKit(p);
  S.players.push(p);
  if (!S.player) S.player = p;
  return p;
}

export function removePlayer(id) {
  const S = state;
  const gone = S.players.find((p) => p.id === id);
  if (gone && gone.sleeping && !S.players.some((q) => q !== gone && q.sleeping)) world.setTimeScale(1);
  S.players = S.players.filter((p) => p.id !== id);
  // The client's own player is never handed to someone else: on a host that was a guest's character, its camera,
  // and its input driving them (the coder agent's review of item 3). Out of the list it stays this client's, held
  // where it stood, until it is put back (a step away) or replaced (a new character).
}

// A player gone dormant (docs/31/09; Michael, 2026-10-13, Zomboid's way): out of the simulation,
// not drawn and not hunted, its record kept by the client in the save's wrapper; and back again
// on the rejoin, where it stood, with what it carried. Its id and sheet are its own still.
export function takePlayer(id) {
  const p = state.players.find((q) => q.id === id);
  if (!p) return null;
  // A sleeper's bed sets the whole world's time scale (player.js); one leaving the sim in its sleep would
  // leave the world at that scale for good, and wake dormant in a record that says asleep.
  if (p.sleeping) {
    p.sleeping = null;
    if (!state.players.some((q) => q !== p && q.sleeping)) world.setTimeScale(1);
  }
  const record = serializeCharacter(p);
  removePlayer(id);
  return record;
}

export function putPlayer(record) {
  if (!record || record.kind !== "player") return null;
  const S = state;
  if (S.players.some((q) => q.id === record.id)) return S.players.find((q) => q.id === record.id);
  const p = restoreCharacter(fromSafe(record), { player: createPlayer, zombie: createZombie, villager: createVillager });
  p.target = null;
  p.carrying = carriedOf(p);
  delete p._targetId;
  delete p._carryingId;
  delete p._carried;
  S.players.push(p);
  if (!S.player) S.player = p;
  return p;
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
    if (def && def.fire && items.isLit(e)) return def.fire;
  }
  return null;
}

// A torch burns down while it is lit (Michael, 2026-10-17, #156): fastest in a hand, at the slower wall rate on the belt (a
// lit one beside another that is held burns for nothing), and spent it is gone, with the weapon's own word. The meter is the
// torch's `wear`, which a kill also bites; a lit one in the bag does not burn (it gives no light there either).
function burnTorches(dt) {
  const W = tuning.world;
  const drain = (p, e, k) => {
    const def = e && items.getItem(e.id);
    if (!def || !def.fire || !def.fire.burnsDown || !e.lit) return;
    e.wear = Math.min(1, (e.wear || 0) + k);
    if (e.wear >= 1) {
      inventory.detach(p, e);
      events.emit("weaponBroke", { who: p.id, item: e.id, uid: e.uid });
    }
  };
  for (const p of state.players) {
    if (p.dead) continue;
    const seen = new Set();
    for (const slot of ["main", "off"]) {
      const e = p.hands[slot];
      if (!e || seen.has(e)) continue;
      seen.add(e);
      drain(p, e, dt / W.torchHeldLife);
    }
    for (const e of [...(inventory.beltOf(p) || [])]) if (e) drain(p, e, dt / W.torchWallLife);
  }
}

// The world's first part of a step: the rules, the clock, the fires, and the
// chunks round each player (grown ahead, dropped behind), before the client's
// own frame work reads the map.
export function begin(dt) {
  const S = state;
  rules.refresh(); // a server world's rules, from its source, once a step; a browser's world keeps its own (docs/23a, C3; docs/38, #109)
  clock.update(dt);
  map.burnFires(dt);
  map.burnHolders(dt); // the torches mounted on brackets and posts burn down at the wall rate (map.js)
  fruit.step(); // a bare fruit tree bears again on its day (fruit.js)
  resources.step(() => [...S.players, ...S.zombies, ...S.villagers, ...S.corpses, ...S.animals]); // a taken resource grows again elsewhere in its area, under no body, an animal's or a carcass's among them (docs/46)
  farming.step(); // a crop's picture follows its stage (farming.js, #194)
  trees.step(() => [...S.players, ...S.zombies, ...S.villagers, ...S.corpses, ...S.animals]); // a planted sapling grows, waiting while anyone stands on it (docs/46 step 3)
  burnTorches(dt);
  stations.update(dt); // every station's queue, in the world's time (docs/30, section 6)
  for (const p of S.players) {
    // Grow the world four chunks ahead of the player, so wild forest and its dead
    // appear outside the view even at the widest zoom (docs/02, the view), and the
    // ground can bake every viewed chunk with its neighbours grown: this ring is
    // the only growth there is, since reading never grows (docs/31/05, item 8).
    map.ensureAround(p.gx, p.gy, 4);
  }
  chart.step(S.players); // the chart reveals what each player now sees, and reads the touched places again (docs/33)
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
  for (const ch of map.takeWoken()) (ch.corpse ? S.corpses : S.zombies).push(ch); // one asleep mid-fall finishes it
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
  ageSpeech(dt);
  const snapOf = (p) => (snapshots instanceof Map ? snapshots.get(p.id) : snapshots && snapshots[p.id]) || null;
  for (const p of S.players) {
    const snap = snapOf(p);
    S.acting = p;
    if (p.dead) {
      // The fall, then a body (Michael, 2026-10-14: a player dead and come back as someone new found their old self
      // standing, not to be searched). Baked to one frame like the dead's once the fall is over (dressCorpse).
      updateFallen(p, dt);
      if (p.anim.done && !p.corpse) dressCorpse(p);
      continue;
    }
    updatePlayer(p, dt, snap || undefined);
    // Auto-drinking (docs/02 question 22, ruled 2026-10-16): here, in the world's step, never in updatePlayer, which a
    // guest's prediction runs too. The word goes to whoever drank (main.js for this screen, host.js for a guest's).
    if (autoDrink(p)) events.emit("drank", { who: p.id, auto: true });
    bleed.update(p, dt);
    sick.update(p, dt); // Sick runs down here, on the authority, as the wound does (docs/44)
    // The mouse and the keys, as a snapshot, to the player's controller (docs/23a, D1; never the input module).
    // Only a player whose client is here is controlled: the draw and the combat clock are still
    // one per world (docs/31/05, items 12 and 13), so an absent player's idle input must not touch them.
    // A right tap during a draw ends it, the arrow kept (docs/21): before the controller, so a left release in the
    // same step looses nothing.
    if (snap && snap.keys && snap.keys.drawCancel) archery.cancelDraw(p);
    if (snap) controlPlayer(p, S.zombies, dt, snap);
    if (snap && snap.keys) interact.updateInteract(p, dt, snap.keys); // E, B, T: this player's own client's key events (interact.keyEvents)
  }
  S.acting = null;
  world.setTimeScale(timeScaleNow()); // each step, so a guest who joins, leaves, wakes, or dies puts the speed right
  archery.update(dt);
  S.others = [...S.players, ...S.zombies, ...S.villagers]; // the living, who block and are hunted
  const everyone = [...S.others, ...S.corpses]; // and the fallen, who burn and are drawn
  burn.update(everyone, dt); // the burn's timer and its damage, the world's (#14)
  burning.update(dt, everyone); // and its flames, a visual (docs/05)
  // A body burnt away by Burn corpse (docs/43 section 7): its fire out, it and everything in it are gone; the corpses' roster takes it from every guest.
  if (S.corpses.some(burn.burnedAway)) {
    for (const c of S.corpses) if (burn.burnedAway(c)) events.emit("corpseBurnedAway", { corpse: c });
    S.corpses = S.corpses.filter((c) => !burn.burnedAway(c));
  }
  for (const p of S.players) {
    S.acting = p;
    p.actionProgress = interact.updateAction(p, dt);
    // Anyone walking through a crop or a mushroom sets it swaying (Michael, 2026-10-12).
    interact.brushThrough(p);
  }
  S.acting = null;
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
    updateVillager(v, dt, S.others, S.players);
    interact.brushThrough(v);
  }
  // The animals near anyone (docs/45): they step aside from the living and from each other, and the fleeing kinds run from a
  // living player and the standing dead; the dead ignore them. A wild home below its cap has one back when nobody is near.
  if (S.animals.length || S.animalHomes.length) {
    const bodies = [...S.others, ...S.animals];
    const threats = [...S.players.filter((p) => !p.dead), ...S.zombies.filter((z) => !z.dead && z.state !== "down")];
    for (const a of S.animals) {
      if (!nearPlayer(a)) continue;
      animal.updateAnimal(a, dt, bodies, threats);
      interact.brushThrough(a);
    }
    const watching = [...S.players, ...S.corpses.filter((c) => c.kind === "player")]; // a dead player's screen still looks at the world
    for (const a of animal.renewHomes(S.animalHomes, S.animals, watching)) S.animals.push(a);
    // A carcass butchered is taken (docs/45 section 2): it leaves the list, and the roster takes it from every guest.
    if (S.animals.some((a) => a.butchered)) S.animals = S.animals.filter((a) => !a.butchered);
    // The snares, once a second of sim time (read from the sim's clock, so a restored world checks on the same steps): a catch, or set
    // again once its catch is taken. A change marks the snare's chunk, so a guest sees what it holds.
    if (Math.floor(loop.simTime()) !== Math.floor(loop.simTime() - dt)) {
      const snares = animal.setSnares(map.propById);
      if (snares.length) for (const pr of animal.snareStep(snares, S.animals, S.animalHomes, watching)) map.markDirty(pr.tile[0], pr.tile[1]);
      // The keeping (docs/45 section 3): a tame animal not fed today eats as soon as a trough it can reach holds feed, a fed hen lays into
      // its coop, and two of a kind fed in a pen with room breed. Every tame animal, near a player or not: nothing waits on a visit. A lead
      // whose leader is gone (a guest away, a death) is freed.
      animal.freeLostLeads(S.animals, S.players);
      for (const a of animal.dailyStep(S.animals)) S.animals.push(a);
    }
  }
  // Villagers bitten through get up as the dead, in what they wore (docs/19).
  if (S.villagers.some((v) => v.dead)) {
    for (const v of S.villagers) if (v.dead) S.zombies.push(turnVillager(v));
    S.villagers = S.villagers.filter((v) => !v.dead);
  }
  // The fallen leave the thinking list (docs/23a, B1): a corpse is drawn and looted, never iterated by the AI.
  // Not before the fall has played and the body is baked (`corpse`, updateZombie's dead branch): moved out
  // the step it died, a zombie stood hunched on its first frame for ever, never a body to search, its
  // swing-target outline never cleared (Michael, 2026-10-13).
  if (S.zombies.some((z) => z.corpse)) {
    S.corpses.push(...S.zombies.filter((z) => z.corpse));
    S.zombies = S.zombies.filter((z) => !z.corpse);
  }
  // A fallen player's body joins the fallen the same way: drawn, searched, saved, and sent as one of the dead's bodies.
  // The client whose player it was keeps its own reference (S.player) for the dead screen; a new character replaces it.
  if (S.players.some((p) => p.corpse)) {
    S.corpses.push(...S.players.filter((p) => p.corpse));
    S.players = S.players.filter((p) => !p.corpse);
  }
  for (const p of S.players) {
    if (p.hp <= 0 && !p.dead) {
      // Death (Michael, 2026-10-10 night): the world says so; the client whose player it is shows the
      // dead screen, and the way back to the title is a fresh load.
      p.dead = true;
      fall(p);
      events.emit("gameOver", { player: p });
    }
  }
  // Rooms refound if a wall changed, before the light reads them (light.update
  // asks for current rooms; the one-file step had the client's roomAt do this).
  map.roomsIfDirty();
  // The light each player carries (docs/02): a torch in hand at full, two at more,
  // else one on the belt at `beltLight` (0.6, a little over half). The strength also scales how far the dead
  // see the flame (zombie.js). One carried light per player, with its owner (docs/31/05, item 15).
  const carried = [];
  for (const p of S.players) {
    const held = items.heldFire(p.hands);
    const twoHanded = held && p.hands.main && p.hands.off && p.hands.main !== p.hands.off && items.isLit(p.hands.main) && items.isLit(p.hands.off);
    const belted = held ? null : beltFire(inventory.beltOf(p));
    const fire = held || belted;
    const strength = held ? (twoHanded ? tuning.world.twoTorches : 1) : tuning.world.beltLight;
    if (fire) carried.push({ owner: p.id, gx: p.gx, gy: p.gy, radius: fire.radius * strength, flicker: fire.flicker || null, strength });
  }
  light.setCarriers(carried);
  light.setBurners([...burning.lights(everyone), ...archery.projectileLights()]); // and a fireball in flight (docs/24)
  light.update();
}
