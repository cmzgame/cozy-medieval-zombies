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
import * as archery from "./archery.js";
import * as interact from "./interact.js";
import { updatePlayer } from "./entities/player.js";
import { serializeCharacter, restoreCharacter, dress, dressCorpse } from "./entities/character.js";
import { createPlayer } from "./entities/player.js";
import { createZombie } from "./entities/zombie.js";
import { createVillager } from "./entities/villager.js";
import { say } from "./entities/character.js";

let role = null; // "host" | "guest" | null (alone)
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
const pendingOpened = []; // containers the host says my player opened, applied once the frames before them are
let seq = 0; // the guest's input count, so the host can say which it has applied
const pending = []; // the guest's inputs not yet acknowledged, replayed over each frame (prediction)
let lastCorrection = 0; // tiles the last frame moved my predicted player: the misprediction, for the checks

let identity = { name: null, look: null }; // what a guest says it is on the join (the You screen)

export function setHooks(h) {
  hooks = { ...hooks, ...h };
}

export function setIdentity(id) {
  identity = { ...identity, ...id };
}

export function init(opts = {}, h = {}) {
  setHooks(h);
  open(opts);
}

// A short code for a world, for friends to type (the Host screen): a tree and three letters or
// digits from an alphabet with no look-alikes (no i, l, o, 0, 1: Michael could not read one from the
// pixel font, 2026-10-13).
const CODE_CHARS = "abcdefghjkmnpqrstuvwxyz23456789";
export function makeCode() {
  const words = ["oak", "elm", "ash", "yew", "fir", "hazel", "rowan", "thorn", "moss", "fern"];
  let tail = "";
  for (let i = 0; i < 3; i++) tail += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
  return `${words[Math.floor(Math.random() * words.length)]}-${tail}`;
}

// A guest that no host answers within this long gives up (hooks.failed) rather than wait in a
// world nothing steps (Michael's two-browser test, 2026-10-13, `02`). Counted from the first join
// sent, not from the open: a hidden pane steps only when a script steps it.
const JOIN_WAIT_MS = 10000;
let firstJoinAt = 0;

// Leave the wire: the transport closed, the role given up; the world here stays as it is.
export function close() {
  const t = transport;
  transport = null;
  if (t) t.close();
  role = null;
  code = null;
  joined = false;
  joinSentAt = 0;
  firstJoinAt = 0;
  inbox.length = 0;
  guests.clear();
  pending.length = 0;
  pendingOpened.length = 0;
}

// ---- the transports (docs/31/04; ruled 2026-10-13, docs/02) ----
// Two carry the same messages. The loopback is a BroadcastChannel between tabs of one browser,
// the two-tab test. The relay is a WebSocket to server/relay.js, which is how friends anywhere
// join from the GitHub Pages site: the host registers its code there, guests name it, and the
// relay forwards, stamping `from` with the connection's own id. With a relay address known
// (RELAY_URL, or `?relay=` on the URL; `?relay=none` forces the loopback) Host and Join use it.

export const RELAY_URL = null; // the relay the site carries, e.g. "wss://cmz-relay.example.app" (docs/31/07, question 20)
let relayUrl = RELAY_URL;
let transport = null; // { kind: "loopback" | "relay", ready, send(msg), close() }

export function setRelay(url) {
  if (url === "none" || url === "loopback") relayUrl = null;
  else if (url) relayUrl = url;
}

// A message in from either transport: the relay's own words answered here, the rest to the inbox.
function receive(msg) {
  if (!msg || typeof msg !== "object") return;
  if (msg.type === "relay") {
    selfId = msg.id; // the relay names me; the host keys its guests by these
    return;
  }
  if (msg.type === "error") return dropped(msg.reason === "nohost" || msg.reason === "taken" ? msg.reason : "relay");
  if (msg.type === "hostLeft") return dropped("hostLeft");
  if (msg.to && msg.to !== selfId) return; // the loopback is one channel for everyone; the relay routes
  if (lag) setTimeout(() => inbox.push(msg), lag);
  else inbox.push(msg);
}

// The wire gone from under a role: closed here, the client told why (hooks.failed(code, why, role)).
// `why`: "timeout" (no welcome), "nohost" (the relay knows no such code), "taken" (a host's code in use),
// "relay" (the relay unreachable or gone), "dropped" (a joined guest's connection lost), "hostLeft".
function dropped(why) {
  const wasRole = role;
  const wasCode = code;
  const wasJoined = joined;
  close();
  if (wasRole && hooks.failed) hooks.failed(wasCode, wasRole === "guest" && wasJoined && why === "relay" ? "dropped" : why, wasRole);
}

function openLoopback(wantCode) {
  if (typeof BroadcastChannel === "undefined") return false;
  const ch = new BroadcastChannel(`cmz-wire-${wantCode}`);
  ch.onmessage = (e) => receive(e.data);
  transport = { kind: "loopback", ready: true, send: (m) => ch.postMessage(m), close: () => ch.close() };
  return true;
}

function openRelay(wantRole, wantCode) {
  if (typeof WebSocket === "undefined") return false;
  let ws;
  try {
    ws = new WebSocket(relayUrl);
  } catch {
    return false;
  }
  const queue = []; // sent before the socket opened: the guest's first join, usually
  let done = false;
  const t = {
    kind: "relay",
    ready: false,
    send: (m) => {
      if (t.ready) ws.send(JSON.stringify(m));
      else queue.push(m);
    },
    close: () => {
      done = true;
      try { ws.close(); } catch { /* already gone */ }
    },
  };
  ws.onopen = () => {
    ws.send(JSON.stringify({ type: wantRole, code: wantCode })); // the first word: who I am, which world
    t.ready = true;
    for (const m of queue.splice(0)) ws.send(JSON.stringify(m));
  };
  ws.onmessage = (e) => {
    let m;
    try { m = JSON.parse(e.data); } catch { return; }
    receive(m);
  };
  const gone = () => {
    if (done) return;
    done = true;
    if (transport === t) dropped("relay");
  };
  ws.onerror = gone;
  ws.onclose = gone;
  transport = t;
  return true;
}

// Open this tab's world to guests (host) or join another's (guest), once.
export function open({ host = null, join = null, lag: l = 0 } = {}) {
  if (role || (!host && !join)) return false;
  const wantRole = host ? "host" : "guest";
  const wantCode = String(host || join).trim().toLowerCase();
  if (!wantCode) return false;
  selfId = `${wantRole}-${Math.random().toString(36).slice(2, 8)}`; // the loopback's; the relay renames me
  if (!(relayUrl ? openRelay(wantRole, wantCode) : openLoopback(wantCode))) return false;
  role = wantRole;
  code = wantCode;
  lag = Math.max(0, Number(l) || 0);
  return true;
}

export function isHost() {
  return role === "host";
}

export function isGuest() {
  return role === "guest";
}

// On the wire, as a host or a guest: the world never pauses (Michael, 2026-10-13: Zomboid's way).
export function onTheWire() {
  return role !== null;
}

export function hasGuests() {
  return role === "host" && guests.size > 0;
}

export function status() {
  return { role, code, lag, selfId, guests: [...guests.values()].map((g) => g.playerId), myPlayerId, joined, framesSeen, lastFrameAt, tick, waiting: role === "guest" && !joined, transport: transport ? transport.kind : null, relay: relayUrl };
}

export function setTestSnapshot(s) {
  testSnapshot = s;
}

function send(msg) {
  if (!transport) return;
  transport.send({ ...msg, from: selfId });
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
      const p = game.addPlayer(at[0], at[1], { look: msg.look || null, name: msg.name || null });
      guests.set(msg.from, { playerId: p.id, queue: [], last: null, ack: 0, joinedAt: tick });
      for (const c of allCharacters()) known.add(c.id);
      send({ type: "welcome", to: msg.from, playerId: p.id, save: game.serialize() });
      hooks.message(`${msg.name || p.id} joined.`);
    } else if (msg.type === "input") {
      const g = guests.get(msg.from);
      if (!g) continue;
      g.queue.push(msg); // one input per step, in order; the guest replays what is not yet acknowledged
      if (g.queue.length > 1 && (msg.snap.clicked || msg.snap.altPressed || msg.snap.space)) {
        // A press is one shot: when the queue runs ahead it must not be lost to the hold rule below.
        g.queue[g.queue.length - 1].snap = { ...msg.snap };
      }
    } else if (msg.type === "act") {
      // A verb on the world from a guest's menu or its E (docs/31/05, item 10; tier 3): the action with that
      // label on that address, rebuilt here and run as the guest's player, the walk there and the bar included.
      const g = guests.get(msg.from);
      const p = g && game.state.players.find((q) => q.id === g.playerId);
      if (p && msg.target && typeof msg.label === "string") {
        game.state.acting = p;
        try {
          interact.performByLabel(p, msg.target, msg.label);
        } finally {
          game.state.acting = null;
        }
      }
    } else if (msg.type === "item") {
      // The panel's drags, drops, and menus from a guest (docs/31/05, item 9): run here as the guest's
      // player through the same handlers its own panel uses (main.js hands in inventory-actions.js's executor).
      const g = guests.get(msg.from);
      const p = g && game.state.players.find((q) => q.id === g.playerId);
      if (p && hooks.item) {
        game.state.acting = p;
        try {
          hooks.item(p, msg);
        } finally {
          game.state.acting = null;
        }
      }
    } else if (msg.type === "say") {
      // The first command over the wire (docs/31/03, chat): a guest's line, said by their player here.
      const g = guests.get(msg.from);
      const p = g && game.state.players.find((q) => q.id === g.playerId);
      if (p && typeof msg.text === "string" && msg.text.trim()) say(p, msg.text.trim().slice(0, 200));
    } else if (msg.type === "leave") {
      const g = guests.get(msg.from);
      if (!g) continue;
      const p = game.state.players.find((q) => q.id === g.playerId);
      game.removePlayer(g.playerId);
      guests.delete(msg.from);
      hooks.message(`${(p && p.name) || g.playerId} left.`);
    }
  }
  for (const g of guests.values()) {
    // The next input in the queue; with none this step, the last one held (the key is still down).
    const next = g.queue.shift();
    if (next) {
      g.last = next.snap;
      g.ack = next.seq;
    } else if (g.last) g.last = { ...g.last, space: false, clicked: false, altPressed: false }; // a press is one step
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
  const r = { id: c.id, gx: c.gx, gy: c.gy, facing: c.facing, anim: c.anim, hp: c.hp, dead: c.dead, state: c.state, corpse: c.corpse, line: c.line, blocking: c.blocking, carryingId: c.carrying ? c.carrying.id : null };
  if (c.searched) {
    r.searched = true;
    r.loot = c.loot; // a body opened: its grid, for a guest with it open
    r.worn = c.worn; // and what is still on it, which the grid is
  }
  return r;
}

function record(c) {
  if (c.kind === "player" || !known.has(c.id)) {
    known.add(c.id);
    const r = { full: true, ...serializeCharacter(c), line: c.line }; // the save drops a bubble; a frame carries it (the chat)
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
    arrows: archery.arrowsInFlight().filter((a) => !a.done).map((a) => ({ gx: a.gx, gy: a.gy, z: a.z, frame: a.frame, projectile: a.projectile })),
  };
  send(game.toSafe(frame));
}

// ---- the guest ----

// Each step: the host's frames applied in order, then my input sent.
export function guestStep(mySnap) {
  if (role !== "guest") return;
  const now = performance.now();
  if (!joined && firstJoinAt && now - firstJoinAt > JOIN_WAIT_MS) {
    const c = code;
    close();
    if (hooks.failed) hooks.failed(c);
    return;
  }
  if (!joined && (!joinSentAt || now - joinSentAt > 2000)) {
    joinSentAt = now;
    if (!firstJoinAt && transport && transport.ready) firstJoinAt = now; // the wait starts once the relay has answered the socket (a sleeping tier wakes slowly)
    send({ type: "join", name: identity.name, look: identity.look });
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
    } else if (msg.type === "message") {
      hooks.message(msg.text, msg.seconds);
    } else if (msg.type === "opened") {
      pendingOpened.push(msg.what); // after the frame that carries the grid (frames queue behind it)
    }
  }
  if (pendingOpened.length && hooks.opened) for (const w of pendingOpened.splice(0)) hooks.opened(w);
  if (joined && game.state.player) {
    const s = mySnap.idle ? mySnap : testSnapshot || mySnap; // a screen up: nothing pressed, whatever a check says
    // The fight (docs/31/06, tier 2): the clicks and the buttons go as they are, the aim as a vector and
    // a ground point; the host resolves the swing, the draw, and the shove against its own dead.
    const snap = { axis: s.axis, sprint: !!s.sprint, aim: s.aim || null, aimAt: s.aimAt || null, space: !!s.space, clicked: !!s.clicked, clickSpent: false, leftDown: !!s.leftDown, altPressed: !!s.altPressed, altDown: !!s.altDown, offDown: !!s.offDown, blocked: !!s.blocked };
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
  archery.setReplicaArrows(f.arrows || []);
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
      const { carryingId, loot, worn, ...rest } = r;
      Object.assign(c, rest);
      if (loot) {
        // A body's grid is the body (docs/19): the same objects in the grid and on it, made one again by uid.
        c.loot = c.loot && c.loot.items ? Object.assign(c.loot, loot) : loot;
        const byUid = new Map(c.loot.items.filter((e) => e.uid != null).map((e) => [e.uid, e]));
        if (worn) for (const slot of Object.keys(worn)) c.worn[slot] = worn[slot] ? byUid.get(worn[slot].uid) || worn[slot] : null;
      }
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

// A line to say: the host says it at once; a guest asks the host to (its player speaks there).
export function sendSay(text) {
  if (role === "guest") send({ type: "say", text });
}

// A verb on the world, by its address and label (interact.js): the host performs it as my player.
export function sendAct(target, label) {
  if (role === "guest" && target && label) send({ type: "act", target, label });
}

// The panel's command (ui/inventory-actions.js, createRemoteInventoryActions): an op by uid, slot, and bag address.
export function sendItem(cmd) {
  if (role === "guest" && cmd && cmd.op) send({ type: "item", ...cmd });
}

function guestOf(playerId) {
  for (const [key, g] of guests) if (g.playerId === playerId) return key;
  return null;
}

// A message for a player whose screen is on a guest (main.js's sink).
export function messageTo(playerId, text, seconds = 2) {
  const to = guestOf(playerId);
  if (!to) return false;
  send({ type: "message", to, text, seconds });
  return true;
}

// A container a guest's player opened: told where to look, since the grid itself travels with the prop
// or the body (the chunk delta, the record).
export function openedFor(playerId, what) {
  const to = guestOf(playerId);
  if (!to) return false;
  send({ type: "opened", to, what });
  return true;
}

export function leave() {
  if (role === "guest" && transport) send({ type: "leave" });
}
