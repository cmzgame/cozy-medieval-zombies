// The wire (docs/31/04): one host owns the world and steps it; a guest sends its
// input each step and receives the world, rendering it from its own player's
// view. This first transport is a BroadcastChannel between two tabs of one
// origin, the loopback the plan names as the two-tab test, with an artificial
// delay to stand in for a network (`?host=<code>` in one tab, `?join=<code>&lag=100`
// in another). What crosses the wire is plain data in the save's own shapes
// (game.serialize for the join, serializeCharacter and map.serializeChunk for
// the frames), so a WebSocket to a Node authority later carries the same.
//
// What a guest can do in this tier: walk, sprint, turn, and be hunted (docs/31/06,
// tier 1). Its clicks, keys, menus, and panels stay local and touch nothing in the
// world; the verbs become commands in tier 3 (docs/31/05, items 9 and 10).

import * as game from "./game.js";
import * as map from "./map.js";
import * as clock from "./clock.js";
import * as loop from "./loop.js";
import * as light from "./light.js";
import * as world from "./world.js";
import * as rules from "./rules.js";
import { updatePlayer } from "./entities/player.js";
import { serializeCharacter, restoreCharacter, dress, dressCorpse } from "./entities/character.js";
import { createPlayer } from "./entities/player.js";
import { createZombie } from "./entities/zombie.js";
import { createVillager } from "./entities/villager.js";

let role = null; // "host" | "guest" | null (alone)
let channel = null;
let code = null;
let lag = 0; // ms added to every message, both ways
let selfId = null; // this tab's name on the channel
const inbox = [];
let hooks = { restore: async () => {}, joined: () => {}, message: () => {} };

// Host state.
const guests = new Map(); // guest tab id -> { playerId, snap, joinedAt }
const known = new Set(); // character ids every guest has a full record of (slim frames after)
let tick = 0;

// Guest state.
let myPlayerId = null;
let joined = false;
let joinSentAt = 0;
let framesSeen = 0;
let lastFrameAt = 0;
let testSnapshot = null; // a check drives the guest's player with this instead of the keyboard
let seq = 0; // the guest's input count, so the host can say which it has applied
const pending = []; // the guest's inputs not yet acknowledged, replayed over each frame (prediction)
let lastCorrection = 0; // tiles the last frame moved my predicted player: the misprediction, for the checks

export function init({ host = null, join = null, lag: l = 0 } = {}, h = {}) {
  hooks = { ...hooks, ...h };
  if (!host && !join) return;
  if (typeof BroadcastChannel === "undefined") return;
  role = host ? "host" : "guest";
  code = host || join;
  lag = Math.max(0, Number(l) || 0);
  selfId = `${role}-${Math.random().toString(36).slice(2, 8)}`;
  channel = new BroadcastChannel(`cmz-wire-${code}`);
  channel.onmessage = (e) => {
    const msg = e.data;
    if (!msg || msg.to && msg.to !== selfId) return;
    if (lag) setTimeout(() => inbox.push(msg), lag);
    else inbox.push(msg);
  };
}

export function isHost() {
  return role === "host";
}

export function isGuest() {
  return role === "guest";
}

export function status() {
  return { role, code, lag, selfId, guests: [...guests.values()].map((g) => g.playerId), myPlayerId, joined, framesSeen, lastFrameAt, tick };
}

export function setTestSnapshot(s) {
  testSnapshot = s;
}

function send(msg) {
  if (!channel) return;
  channel.postMessage({ ...msg, from: selfId });
}

// ---- the host ----

// Before the world's step: the guests' latest inputs beside my own, and the
// joins answered (a new player at the spawn, the whole world as a save).
export function hostStep(mySnap, me) {
  const snapshots = new Map();
  if (me) snapshots.set(me.id, mySnap);
  if (role !== "host") return snapshots;
  for (const msg of inbox.splice(0)) {
    if (msg.type === "join") {
      if (guests.has(msg.from)) continue;
      const spawn = game.state.info ? game.state.info.spawn : [me.gx, me.gy];
      const at = map.nearestWalkable(spawn[0] + 1, spawn[1] + 1, (x, y) => game.state.players.some((p) => Math.round(p.gx) === x && Math.round(p.gy) === y)) || spawn;
      const p = game.addPlayer(at[0], at[1], { look: msg.look || null });
      guests.set(msg.from, { playerId: p.id, queue: [], last: null, ack: 0, joinedAt: tick });
      for (const c of allCharacters()) known.add(c.id);
      send({ type: "welcome", to: msg.from, playerId: p.id, save: game.serialize() });
      hooks.message(`${msg.name || "Someone"} joined as ${p.id}.`);
    } else if (msg.type === "input") {
      const g = guests.get(msg.from);
      if (!g) continue;
      g.queue.push(msg); // one input per step, in order; the guest replays what is not yet acknowledged
    } else if (msg.type === "leave") {
      const g = guests.get(msg.from);
      if (!g) continue;
      game.removePlayer(g.playerId);
      guests.delete(msg.from);
      hooks.message(`${g.playerId} left.`);
    }
  }
  for (const g of guests.values()) {
    // The next input in the queue; with none this step, the last one held (the key is still down).
    const next = g.queue.shift();
    if (next) {
      g.last = next.snap;
      g.ack = next.seq;
    } else if (g.last) g.last = { ...g.last, space: false };
    if (g.last) snapshots.set(g.playerId, g.last);
  }
  return snapshots;
}

function allCharacters() {
  const S = game.state;
  return [...S.players, ...S.zombies, ...S.villagers, ...S.corpses];
}

// What a guest needs of a character each step: where it is and what it is doing.
// A player's record is whole (their client draws their bag and their bars).
function slim(c) {
  return { id: c.id, gx: c.gx, gy: c.gy, facing: c.facing, anim: c.anim, hp: c.hp, dead: c.dead, state: c.state, corpse: c.corpse, line: c.line, blocking: c.blocking, carryingId: c.carrying ? c.carrying.id : null };
}

function record(c) {
  if (c.kind === "player" || !known.has(c.id)) {
    known.add(c.id);
    const r = { full: true, ...serializeCharacter(c) };
    if (c.kind === "player") for (const g of guests.values()) if (g.playerId === c.id) r.ack = g.ack; // the last input of theirs this record reflects
    return r;
  }
  return slim(c);
}

// After the world's step: the frame to every guest.
export function hostAfterStep() {
  tick++;
  if (role !== "host" || !guests.size) {
    map.takeTouched(); // nobody to tell: the touched set is drained, not kept for ever (a grown chunk names itself to it in every game)
    return;
  }
  const S = game.state;
  const touched = map.takeTouched();
  const frame = {
    type: "frame",
    tick,
    clock: clock.getElapsed(),
    simTime: loop.simTime(),
    timeScale: world.world.timeScale,
    chunks: touched.map(([cx, cy]) => map.getChunk(cx, cy, false)).filter(Boolean).map(map.serializeChunk),
    players: S.players.map(record),
    zombies: S.zombies.map(record),
    villagers: S.villagers.map(record),
    corpses: S.corpses.map(record),
    carriers: light.carriers().filter((c) => c.owner),
    rules: { ...rules.rules }, // the world's rules are the host's (docs/31/07, question 13)
  };
  send(game.toSafe(frame));
}

// ---- the guest ----

// Each step: the host's frames applied in order, then my input sent.
export function guestStep(mySnap) {
  if (role !== "guest") return;
  const now = performance.now();
  if (!joined && (!joinSentAt || now - joinSentAt > 2000)) {
    joinSentAt = now;
    send({ type: "join", name: mySnap && mySnap.name, look: null });
  }
  for (const msg of inbox.splice(0)) {
    if (msg.type === "welcome") {
      if (joined) continue;
      myPlayerId = msg.playerId;
      joined = true;
      hooks.restore(msg.save, myPlayerId); // main.js: game.restore, then the client's own refresh
      hooks.joined(myPlayerId);
    } else if (msg.type === "frame" && joined) {
      applyFrame(game.fromSafe(msg));
      framesSeen++;
      lastFrameAt = now;
    }
  }
  if (joined && game.state.player) {
    const s = testSnapshot || mySnap;
    const snap = { axis: s.axis, sprint: !!s.sprint, aim: s.aim || null, space: !!s.space };
    seq++;
    pending.push({ seq, snap });
    send({ type: "input", seq, snap });
    // Prediction (docs/31/04): my own walking runs here at once against the replica's walls; the host's
    // word arrives a wire later and the inputs it has not yet applied are replayed over it (applyFrame).
    updatePlayer(game.state.player, 1 / 60, snap);
  }
}

export function correction() {
  return lastCorrection;
}

const makers = { player: createPlayer, zombie: createZombie, villager: createVillager };

let predictedPos = null; // where my prediction had me before this frame's record replaced it

function applyFrame(f) {
  const S = game.state;
  if (S.player) predictedPos = [S.player.gx, S.player.gy];
  if (f.rules) rules.set(f.rules);
  clock.setElapsed(f.clock);
  loop.setSimTime(f.simTime);
  world.setTimeScale(f.timeScale);
  if (f.chunks.length) {
    for (const d of f.chunks) map.installChunk(d);
    for (const d of f.chunks) for (const p of d.props) map.installProp(p);
    map.rebuildBrackets();
    light.forgetAll();
    hooks.chunksChanged && hooks.chunksChanged(f.chunks);
  }
  const byId = new Map();
  for (const c of allCharacters()) byId.set(c.id, c);
  const propById = (id) => (id ? map.propById(id) : null);
  const bring = (list) => list.map((r) => {
    let c = byId.get(r.id);
    if (r.full) {
      const { full, ...data } = r;
      if (!c) {
        c = restoreCharacter(data, makers);
        c.target = null;
        delete c._targetId;
        c.carrying = propById(c._carryingId);
        delete c._carryingId;
        if (c.kind !== "player") (c.corpse ? dressCorpse(c) : dress(c));
        byId.set(c.id, c);
      } else {
        const keep = c.sprite;
        const { targetId, carryingId, ...rest } = data;
        Object.assign(c, rest);
        c.carrying = propById(carryingId);
        if (c.kind === "player") c.sprite = keep || c.sprite;
        else if (c.corpse) dressCorpse(c);
      }
    } else if (c) {
      const { carryingId, ...rest } = r;
      Object.assign(c, rest);
      c.carrying = propById(carryingId);
      if (c.corpse && c.kind === "zombie" && !c.corpseKey) dressCorpse(c);
    }
    return c;
  }).filter(Boolean);
  S.players = bring(f.players);
  S.zombies = bring(f.zombies);
  S.villagers = bring(f.villagers);
  S.corpses = bring(f.corpses);
  S.player = S.players.find((p) => p.id === myPlayerId) || S.player;
  // Reconciliation: the host's record of me stands at its tick; my inputs it has not yet applied
  // go over it again, so what I see is the host's truth plus what I have done since.
  const me = S.player;
  const mine = f.players.find((r) => r.id === myPlayerId);
  if (me && mine) {
    const predictedX = predictedPos ? predictedPos[0] : me.gx;
    const predictedY = predictedPos ? predictedPos[1] : me.gy;
    const ack = mine.ack || 0;
    while (pending.length && pending[0].seq <= ack) pending.shift();
    for (const p of pending) updatePlayer(me, 1 / 60, p.snap);
    lastCorrection = Math.hypot(me.gx - predictedX, me.gy - predictedY);
  }
  predictedPos = null;
  S.others = [...S.players, ...S.zombies, ...S.villagers];
  S.progress = S.player ? S.player.actionProgress : null;
  light.setCarriers(f.carriers);
  light.setBurners([]);
  light.update();
}

export function leave() {
  if (role === "guest" && channel) send({ type: "leave" });
}
