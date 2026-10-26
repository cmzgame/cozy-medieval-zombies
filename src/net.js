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
import * as chart from "./chart.js";
import * as floaters from "./floaters.js";
import * as netsmooth from "./netsmooth.js";
import * as clock from "./clock.js";
import * as loop from "./loop.js";
import * as light from "./light.js";
import * as world from "./world.js";
import * as rules from "./rules.js";
import * as archery from "./archery.js";
import * as burning from "./fire.js";
import * as stations from "./stations.js";
import * as interact from "./interact.js";
import { VERSION as SAVE_VERSION } from "./save.js";
import { BUILD_ID } from "./build.js";
import { idHash } from "./identities.js";
import { updatePlayer } from "./entities/player.js";
import { controlPlayer } from "./player-controller.js";
import { serializeCharacter, restoreCharacter, dress, dressCorpse } from "./entities/character.js";
import { createPlayer } from "./entities/player.js";
import { createZombie } from "./entities/zombie.js";
import { createVillager } from "./entities/villager.js";
import { serializeAnimal, restoreAnimal } from "./entities/animal.js"; // the animals, a record of their own (docs/45)
import { say } from "./entities/character.js";
import { client, refind } from "./client.js"; // my own player, the client's (docs/31/05 item 26, #102)
import { handedOf } from "./handed.js"; // right- or left-handed, the join's (Michael, 2026-10-25)

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
let stallTold = false; // the guest has been told the host has gone quiet, once per quiet spell
let testSnapshot = null; // a check drives the guest's player with this instead of the keyboard
const pendingOpened = []; // containers the host says my player opened, applied once the frames before them are
const pendingTalk = []; // conversations the host says my player began, opened on my replica once the frames before them are (docs/34)
let seq = 0; // the guest's input count, so the host can say which it has applied
const pending = []; // the guest's inputs not yet acknowledged, replayed over each frame (prediction)
let lastCorrection = 0; // tiles the last frame moved my predicted player: the misprediction, for the checks

let identity = null; // what a guest says it is on the join, once chosen (docs/31/09); null asks the host whether it knows this browser

export function setHooks(h) {
  hooks = { ...hooks, ...h };
}

// The identity a join carries, or null for a join that asks the host first whether it knows this
// browser (docs/31/09: a character the browser made in that world comes back without one).
// A server world's owner key, said with the join (item 5's fifth step): the world files its owner's character under
// the key's hash rather than this browser's id, so the owner plays the same character from any device that holds
// the key. Set only for a join of a world this browser owns on the server; a browser host never reads it.
let ownerKey = null;
export function setOwnerKey(k) {
  ownerKey = typeof k === "string" && k ? k : null;
}

export function setIdentity(id) {
  identity = id ? { name: null, look: null, ...id } : null;
  joinSentAt = 0; // the next step sends the join again, with what was set
}

export function init(opts = {}, h = {}) {
  setHooks(h);
  open(opts);
}

// A short code for a world, for friends to type (the Host screen): a tree and three letters or
// digits from an alphabet with no look-alikes (no i, l, o, 0, 1: Michael could not read one from the
// pixel font, 2026-10-13).
// Two tree words and four letters (Michael, 2026-10-13, after the review: a tree and three letters was
// eighteen bits, which someone could scan, and a hit gives them a whole world; this is near thirty).
const CODE_CHARS = "abcdefghjkmnpqrstuvwxyz23456789";
export function makeCode() {
  const words = ["oak", "elm", "ash", "yew", "fir", "hazel", "rowan", "thorn", "moss", "fern", "birch", "alder", "willow", "holly", "pine", "maple"];
  let tail = "";
  for (let i = 0; i < 4; i++) tail += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
  const a = words[Math.floor(Math.random() * words.length)];
  let b = words[Math.floor(Math.random() * words.length)];
  if (b === a) b = words[(words.indexOf(a) + 1) % words.length];
  return `${a}-${b}-${tail}`;
}

// The wire's protocol (the coder agent's review, 2026-10-13: a build version has nothing to compare, the
// wire and the save do): bumped by hand when a message or the save changes shape; the host refuses a
// guest on another with a word for whose is newer.
// 2 (2026-10-13): the dead as a delta with a roster, numbers rounded; 3 (2026-10-14, item 5's fourth step): the welcome may
// come gzipped (`z`); 4 (2026-10-15): a browser host packs its welcome in the background, so the welcome carries the tick
// of its snapshot and a guest keeps the frames that come before it (an older guest dropped them); 5 (2026-10-18, #221): a prop goes as its identity and
// the fields that differ from what its sprite makes it (`map.serializeProp`), so a chunk, a frame, and a save are about half the size; an older guest
// would read a prop with its defaults missing.
// 6 (2026-10-18, #203): the frame carries the chart's changed chunks (`chart`, only when there are any) and the save the whole chart; 7 (2026-10-18, #237): the frame's `chart`
// is the changed cells, [cx, cy, [index, cell, ...]] per chunk, not whole chunks; 8 (2026-10-19, #294): the frame may carry `floaters`, the hits, heals, and gathers of the step
// for the numbers over heads ([kind, id, n, skill] each); 9 (2026-10-25, docs/45): the animals, a fourth list as a delta with its own roster (`animals`, a lean
// record: where, facing, the animation, state, hp, dead) and the homes' renewal (`animalHomes`, when it changes); the save carries both.
// 10 (2026-10-25): the frame may carry `evicted`, the [cx, cy] of the wild chunks the host dropped since the last frame (map.takeEvicted), and a
// guest drops them too (map.dropChunk); an older guest kept every chunk it was sent, so far from the spawn its map and registry were the host's and more.
// 11 (2026-10-25, docs/45 step 2): an animal's record carries a carcass's weapon class and its skinning (`kb`, `sk`); 12 (2026-10-25,
// docs/45 step 3): and who leads it, the day it was fed, the day its milk or wool was taken, and its home (`ld`, `fd`, `tk`, `hm`).
// 13 (2026-10-25, #250): the frame's `arrows` is { go, end }, each flight's launch once and its end once (archery.launchRecord, endRecord), only
// when there are any, and a guest steps the flights itself; the `flares` list is gone (a guest makes a fireball's flare where it lands). An older
// guest read `arrows` as the positions in flight every frame.
// 14 (2026-10-25, #341): a chunk's record may carry `parts`, the tiles of props anchored in another chunk ([lx, ly, id] each, only when there
// are any), and installChunk stands them again from the registry; an older guest dropped those tiles whenever such a chunk came alone in a frame.
// 15 (2026-10-25, #285): a player's heavy record carries `beltHands`, the hand chosen per belt slot ({ id, hand } or null), so the record
// changed shape; an older guest neither kept it nor marked the choice in its slot's menu and card (the key itself is the host's, either way).
// 16 (2026-10-25, Michael's handedness): a player's heavy record carries `handed` ("right" or "left"), and the join carries the identity's;
// the record changed shape, and an older guest drew every character right-handed and labelled its hands so.
// 17 (2026-10-25, the belt's slots by role, #478): a belt key's event in a guest's snapshot names the slot's role (`beltMain1`, `beltOff1`,
// `beltUtility`, `beltMain2`, `beltOff2`; inventory.BELT_EVENTS) in place of its number (`belt1` to `belt4`), and the heavy record no longer
// carries `beltHands`; an older guest's keys would be dropped by the host's filter.
// 18 (2026-10-25, the mana bar, #480, docs/47 step 1): a player's light record carries `mana` (to two decimals) and `manaFlash`, the bar's flash
// on a refused cast, and its heavy record `maxMana`; the record changed shape, and an older guest drew no mana bar and kept no mana.
// 19 (2026-10-25, the potions' step 2, #481): a player's light record carries `potionAt`, the sim
// time of the last potion, and `buffs` (`{ stamina: { left } }`, its time to two decimals), so the record changed shape; an older guest
// neither drew the stamina buff in its row nor regenerated its predicted stamina at the buff's rate, and knew none of the potions' items.
export const PROTOCOL = 19;

// A guest away (its socket gone, or its leave): its character stands for the grace, then goes dormant
// through the client (hooks.dormant; docs/31/09; Michael, 2026-10-13: no more than sixty seconds).
const GRACE_S = 60;
const MAX_PENDING = 180; // a guest's unacknowledged inputs kept for the replay: three seconds
const MAX_BACKLOG = 10; // a guest's inputs the host will hold: a sixth of a second, so the internet's own jitter is not corrected
// (times the world's time scale: at sixty times a sixth of a second is six hundred steps)
const SILENT_STEPS = 30; // a guest's held keys lapse after this many steps with no input from it: half a second
const MAX_RUN = 600; // the most steps one run of a guest's inputs may stand for (180 at sixty times, the frame's cadence)
const away = new Map(); // playerId -> the sim time its guest went
const lastCarried = new Map(); // character id -> the carried prop's id last sent in a full record (null for none)
// The sync check (docs/31/04; tools/checks/sync.js): with reports on, the host marks every tenth frame as the
// one to hash (`sync` on the frame), hashes its own world after sending it and keeps the last few by tick; a
// guest hashes its replica after applying a marked frame and sends the parts with that tick. The marks follow
// the frames wherever they fall, so a speed switch mid-count cannot push the hashes apart (the coder agent's
// second note, 2026-10-13).
const SYNC_EVERY_FRAMES = 10;
let syncReports = false;
const syncRing = new Map(); // tick -> parts (the host's own)
const guestSync = new Map(); // guest key -> { tick, parts }
let syncOff = 0; // how many times the reports have gone off: a mark of check("sync") taken before is dropped (#101)
export function setSyncReports(on) {
  syncReports = !!on;
  if (!on) {
    syncRing.clear();
    guestSync.clear();
    syncOff++;
  }
  if (role === "host") send({ type: "syncOn", on: syncReports });
}
export function syncReport() {
  return { on: syncReports, offs: syncOff, ring: syncRing, guests: new Map([...guestSync].map(([key, v]) => [guests.get(key) ? guests.get(key).playerId : key, v])) };
}
let clientId = null; // this browser's id on the join (identities.js); the host records its hash
export function setClient(id) {
  clientId = id || null;
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
  away.clear();
  lastCarried.clear();
  lastSent.clear();
  lastAnimal.clear();
  lastHeavy.clear();
  lastLight.clear();
  syncRing.clear(); // a stale report from an earlier wire on this page must not meet the check
  guestSync.clear();
  frameCount = 0;
  framesSent = 0;
  for (const k of Object.keys(lastRoster)) lastRoster[k] = "";
  for (const k of Object.keys(lastExtras)) lastExtras[k] = "";
  pending.length = 0;
  pendingOpened.length = 0;
  pendingTalk.length = 0;
  netsmooth.reset();
  myBase = null;
  run = null;
  runCount = 0;
  steppedAway = false;
  returning = false;
  welcoming = false;
  held.length = 0;
  early.length = 0;
  welcomesPacking.clear();
}

// ---- the transports (docs/31/04; ruled 2026-10-13, docs/02) ----
// Two carry the same messages. The loopback is a BroadcastChannel between tabs of one browser,
// the two-tab test. The relay is a WebSocket to server/relay.js, which is how friends anywhere
// join from the GitHub Pages site: the host registers its code there, guests name it, and the
// relay forwards, stamping `from` with the connection's own id. With a relay address known
// (RELAY_URL, or `?relay=` on the URL; `?relay=none` forces the loopback) Host and Join use it.

export const RELAY_URL = "wss://cmz-relay.fly.dev"; // the relay the site carries: server/relay.js on Fly, Michael's cozy-medieval organisation, deployed 2026-10-13 (docs/31/07, question 20); ?relay=none for the two-tab loopback
let relayUrl = RELAY_URL;
let transport = null; // { kind: "loopback" | "relay", ready, send(msg), close() }
// What the socket carries, counted (the review, 2026-10-13: the numbers must be real): bytes out and in,
// and the rates over the last whole second, in status() and the debug corner.
const wireBytes = { out: 0, in: 0, since: 0, outRate: 0, inRate: 0, lastOut: 0, lastIn: 0 };
function countBytes(dir, n) {
  wireBytes[dir] += n;
  const now = performance.now();
  if (!wireBytes.since) wireBytes.since = now;
  if (now - wireBytes.since >= 1000) {
    wireBytes.outRate = Math.round((wireBytes.out - wireBytes.lastOut) * 1000 / (now - wireBytes.since));
    wireBytes.inRate = Math.round((wireBytes.in - wireBytes.lastIn) * 1000 / (now - wireBytes.since));
    wireBytes.lastOut = wireBytes.out;
    wireBytes.lastIn = wireBytes.in;
    wireBytes.since = now;
  }
}
export function wireRates() {
  return { out: wireBytes.outRate, in: wireBytes.inRate, outTotal: wireBytes.out, inTotal: wireBytes.in };
}
// The dead, the villagers, and the corpses as a delta (the review's plan, 2026-10-13): a record goes out only
// when it differs from the last sent, and each list's roster of ids goes out when its membership changes; a
// character the host has not sent before goes whole (record). The welcome is the baseline a guest starts from.
const lastSent = new Map(); // character id -> the slim record's text last sent
const lastRoster = { zombies: "", villagers: "", corpses: "", animals: "" };
// A player's record in two parts (the review's third point, 2026-10-13): the heavy fields (the bag, the worn,
// the hands, the prop in hand, the look and the name and the rest that never change) go whole only when their
// shape changes, on a pick-up, a drop, a wear; the light fields (position, facing, animation, hp, the needs
// to two decimals, the combat clocks, the action's view) go each frame, and only when they differ from the
// last sent. A guest's HUD reads the needs and the clocks off the same light record.
// A player's numbers that go whole in the light record: the position, and the clocks that gate a swing, so a guest's
// predicted swing is refused or allowed on the same step as the host's (rounded, a cooldown of 0.0167 would go as 0.02 and
// the guest would hold a click the host took).
const EXACT = new Set(["gx", "gy", "attackCooldown", "offCooldown", "swingLock", "shoveCooldown"]); // shoveCooldown: the shove's recovery gates a swing too (docs/41, step 2)
const HEAVY = new Set(["worn", "hidden", "handed", "hands", "pockets", "loot", "look", "name", "carried", "lootTable", "wardrobe", "corpseKey", "maxHp", "maxHunger", "maxStamina", "maxMana", "maxThirst", "maxTired", "radius", "speed", "kind", "layer"]);
const lastHeavy = new Map(); // player id -> the heavy part's text last sent
const lastLight = new Map(); // player id -> the light record's text last sent
const lastExtras = { rules: "", carriers: "", queues: "", animalHomes: "" }; // sent when they change, not every frame

// The flights (#250): each one's launch goes once, in the first frame after it is loosed, and its end once, in the first frame after it
// comes down (archery.launchRecord, endRecord); a guest steps it between (archery.stepReplica). Seen every step, so a flight that is loosed
// and comes down between two frames is still sent; its birth is the host's clock's, so a flight sent late is still drawn on time.
const flightsSeen = new Map(); // flight id -> { a, born }: in flight, its launch not yet sent
const flightsSent = new Map(); // flight id -> { a, born }: its launch sent, its end owed
let resendFlights = false; // a guest joined: every flight in the air goes again (the others know it by id and keep their own)
function seeFlights() {
  const now = loop.simTime();
  // Every flight loosed in the step, even one already down (its launch and its end go in the same frame), and any in the air not yet sent
  // (a guest joined while it flew).
  for (const a of [...archery.takeLaunched(), ...archery.arrowsInFlight()]) if (a.id != null && !flightsSent.has(a.id) && !flightsSeen.has(a.id) && (!a.done || a.landAt)) flightsSeen.set(a.id, { a, born: now - a.t });
}
function takeFlights(h) {
  const go = [];
  const end = [];
  const flying = new Set(archery.arrowsInFlight());
  if (resendFlights) for (const f of flightsSent.values()) if (!f.a.done) go.push(archery.launchRecord(f.a, h - f.born));
  resendFlights = false;
  for (const [id, f] of flightsSeen) { go.push(archery.launchRecord(f.a, h - f.born)); flightsSent.set(id, f); }
  flightsSeen.clear();
  for (const [id, f] of flightsSent) {
    if (f.a.done) end.push(archery.endRecord(f.a));
    if (f.a.done || !flying.has(f.a)) flightsSent.delete(id); // down, or gone with no landing (a world put back): a guest's own ends at its fixed end
  }
  return go.length || end.length ? { ...(go.length ? { go } : {}), ...(end.length ? { end } : {}) } : null;
}

// What the host remembers of what it sent, forgotten: the next frame carries every record, roster, and extra again.
// Called when a guest joins (the welcome is that guest's baseline, and a record that changed and changed back
// between the last frame and the welcome would otherwise never be corrected for it) and with nobody to tell.
function forgetSent() {
  resendFlights = true;
  lastSent.clear();
  lastAnimal.clear();
  lastHeavy.clear();
  lastLight.clear();
  for (const k of Object.keys(lastRoster)) lastRoster[k] = "";
  for (const k of Object.keys(lastExtras)) lastExtras[k] = "";
}

// A server world's host proves to the relay it is the relay's own child (item 5's fourth step; the coder agent's
// review of step 3: a server world's code is reserved, even while the world sleeps): the secret the relay handed
// it, said once with the first word. A browser host has none and needs none.
let hostSecret = null;
export function setHostSecret(s) {
  hostSecret = typeof s === "string" && s ? s : null;
}

export function setRelay(url) {
  if (url === "none" || url === "loopback") relayUrl = null;
  else if (url) relayUrl = url;
}

// A message in from either transport: the relay's own words answered here, the rest to the inbox.
function receive(msg) {
  if (!msg || typeof msg !== "object") return;
  // The relay's own words carry no `from`; everything a peer sends arrives stamped with one. So a guest
  // cannot send the host "hostLeft" or "relay" and have it obeyed as the relay's (found in review, 2026-10-13).
  if (!msg.from && msg.type === "relay") {
    selfId = msg.id; // the relay names me; the host keys its guests by these
    return;
  }
  if (!msg.from && msg.type === "error") return dropped(["nohost", "taken", "busy", "broken", "moving"].includes(msg.reason) ? msg.reason : "relay");
  if (!msg.from && msg.type === "hostLeft") return dropped("hostLeft");
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
  ch.onmessage = (e) => { countBytes("in", JSON.stringify(e.data).length); receive(e.data); }; // the loopback carries objects; counted as the relay would carry them
  transport = { kind: "loopback", ready: true, send: (m) => { countBytes("out", JSON.stringify(m).length); ch.postMessage(m); }, close: () => ch.close() };
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
      if (t.ready) {
        const text = JSON.stringify(m);
        countBytes("out", text.length);
        ws.send(text);
      } else queue.push(m);
    },
    close: () => {
      done = true;
      try { ws.close(); } catch { /* already gone */ }
    },
  };
  ws.onopen = () => {
    ws.send(JSON.stringify({ type: wantRole, code: wantCode, ...(wantRole === "host" && hostSecret ? { secret: hostSecret } : {}) })); // the first word: who I am, which world
    t.ready = true;
    for (const m of queue.splice(0)) ws.send(JSON.stringify(m));
  };
  ws.onmessage = (e) => {
    let m;
    countBytes("in", typeof e.data === "string" ? e.data.length : 0);
    try { m = JSON.parse(e.data); } catch { return; }
    receive(m);
  };
  const gone = () => {
    if (done) return;
    done = true;
    if (transport !== t) return;
    // The relay closes a guest's socket right after passing on the host's goodbye, and the close can come before the
    // next step reads the inbox: the goodbye's own reason, when one is waiting, not "the line dropped" (found testing
    // item 5's sixth step: a device replaced by the owner's other device was told its line dropped).
    const bye = inbox.find((m) => m && m.type === "bye" && m.from);
    dropped(bye ? byeWhy(bye) : "relay");
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

// The guests' players, for the client (a host leaving makes every one of them dormant first).
export function guestPlayerIds() {
  return [...guests.values()].map((g) => g.playerId);
}

// The relay's answer to "is this world open?" (server/relay.js /open): { open, guests }, or null with no
// relay or no answer. Rejoin polls this and joins once (the review, 2026-10-13), and the green dot reads it.
// The relay's own address for its HTTP endpoints (the open query, and a server world's upload and return home):
// ws becomes http, wss https; null on the loopback.
export function relayHttp() {
  return relayUrl ? relayUrl.replace(/^ws/, "http").replace(/\/+$/, "") : null;
}

export async function isOpen(code) {
  if (!relayUrl || typeof fetch === "undefined") return null;
  try {
    const base = relayUrl.replace(/^ws/, "http").replace(/\/+$/, "");
    const res = await fetch(`${base}/open?code=${encodeURIComponent(String(code || "").trim().toLowerCase())}`, { cache: "no-store" });
    if (!res.ok) return null;
    const j = await res.json();
    return j && typeof j.open === "boolean" ? { open: j.open, guests: j.guests | 0 } : null;
  } catch {
    return null;
  }
}

export function status() {
  return { role, code, lag, selfId, guests: [...guests.values()].map((g) => g.playerId), myPlayerId, joined, framesSeen, lastFrameAt, tick, waiting: role === "guest" && !joined, transport: transport ? transport.kind : null, relay: relayUrl, protocol: PROTOCOL, wire: wireRates(), welcome: lastWelcome, welcomesPacking: welcomesPacking.size, evicted: { sent: evictedSent, dropped: evictedDropped } };
}

export function setTestSnapshot(s) {
  testSnapshot = s;
}

// For the headless checks (tools/check.js, #250's review): this world as a host with one guest that never speaks, each message the host sends
// handed to `capture` in place of a wire. Returns { joined (what a join does to what was sent), done (alone again) }.
export function testHost(capture) {
  const was = { role, transport };
  role = "host";
  transport = { kind: "test", ready: true, send: capture, close() {} };
  guests.set("test-guest", { playerId: null, hash: null, queue: [], last: null, ack: 0, joinedAt: tick });
  return {
    joined: forgetSent,
    done() {
      guests.delete("test-guest");
      role = was.role;
      transport = was.transport;
      forgetSent();
    },
  };
}

function send(msg) {
  if (!transport) return;
  transport.send({ ...msg, from: selfId });
}

// What the host will take of a guest's snapshot: the shape the step reads, nothing else, every number finite
// (a NaN aim or a far aim point would ride into the player's record and the save), the key events only the
// ones that exist.
const KEY_EVENTS = ["eTap", "ePressed", "bTap", "bHold", "t", "beltMain1", "beltOff1", "beltUtility", "beltMain2", "beltOff2", "drawCancel", "wave"]; // drawCancel: a right tap during a draw (2026-10-15); wave: G or /wave (docs/43 section 7)
export function cleanSnap(raw) {
  const s = raw && typeof raw === "object" ? raw : {};
  const num = (v, lim) => (typeof v === "number" && Number.isFinite(v) ? Math.max(-lim, Math.min(lim, v)) : 0);
  const vec = (v, lim) => (v && typeof v === "object" && !Array.isArray(v) ? { x: num(v.x, lim), y: num(v.y, lim) } : null);
  // The aim point is a grid point, [gx, gy], an array (archery.aimPoint, which the bow's code unpacks): kept as one.
  // Cleaned as an object it became {x: 0, y: 0} and crashed the host the first time a joiner drew a bow (found 2026-10-13).
  const point = (v, lim) => (Array.isArray(v) && v.length === 2 && v.every((n) => typeof n === "number" && Number.isFinite(n)) ? [num(v[0], lim), num(v[1], lim)] : null);
  const axis = vec(s.axis, 1) || { x: 0, y: 0 };
  let keys = null;
  if (s.keys && typeof s.keys === "object") for (const k of KEY_EVENTS) if (s.keys[k] === true) (keys = keys || {})[k] = true;
  return {
    axis: { x: Math.sign(axis.x), y: Math.sign(axis.y) },
    sprint: !!s.sprint,
    aim: vec(s.aim, 4096),
    aimAt: point(s.aimAt, 100000),
    space: !!s.space,
    clicked: !!s.clicked,
    clickSpent: false,
    leftDown: !!s.leftDown,
    altPressed: !!s.altPressed,
    altDown: !!s.altDown,
    offDown: !!s.offDown,
    blocked: !!s.blocked,
    keys,
  };
}

// ---- the host ----

// Before the world's step: the guests' latest inputs beside my own, and the
// joins answered (a new player at the spawn, the whole world as a save).
export function hostStep(mySnap, me) {
  const snapshots = new Map();
  if (me) snapshots.set(me.id, mySnap);
  if (role !== "host") return snapshots;
  for (const msg of inbox.splice(0)) {
    // A guest stepped away (item 3, `02` 2026-10-13) has no character in the world: its inputs and commands are
    // refused until it comes back; its leave, its line, and its sync report are heard.
    const sender = msg.from ? guests.get(msg.from) : null;
    if (sender && sender.steppedAway && !["back", "leave", "say", "sync"].includes(msg.type)) continue; // pokeVillager and kick included
    if (msg.type === "away") {
      // Five minutes with no input on the guest's own client: its character out of the world, kept by its browser's
      // hash (main.js, the dormant path); a sleeper or the dead is refused and told to stay.
      if (sender && hooks.away && hooks.away(sender.playerId)) {
        sender.steppedAway = true;
        sender.queue = [];
        sender.last = null;
      } else if (sender) send({ type: "stay", to: msg.from });
      continue;
    }
    if (msg.type === "back") {
      if (sender && sender.steppedAway) {
        const p = hooks.back ? hooks.back(sender.hash) : null;
        if (p) {
          sender.playerId = p.id;
          sender.steppedAway = false;
        }
      }
      continue;
    }
    if (msg.type === "join") {
      if (guests.has(msg.from)) continue;
      // Another protocol or save shape: refused with a word for whose is newer.
      const protocol = msg.protocol | 0;
      const version = msg.version | 0;
      if (protocol !== PROTOCOL || version !== SAVE_VERSION) {
        send({ type: "bye", to: msg.from, reason: "version", newer: protocol > PROTOCOL || version > SAVE_VERSION ? "guest" : "host" });
        continue;
      }
      // A server world and a page of another build refuse each other (item 5's seventh step): the deploys of the site and
      // the server finish minutes apart, and a change to the game's logic seldom moves PROTOCOL. Only when both are stamped.
      const mine = hooks.buildId ? hooks.buildId() : null;
      if (mine && mine !== "dev" && typeof msg.build === "string" && msg.build !== "dev" && msg.build !== mine) {
        send({ type: "bye", to: msg.from, reason: "updated" });
        continue;
      }
      let hash = typeof msg.clientId === "string" && msg.clientId ? idHash(msg.clientId) : null;
      // A server world's owner, by its key: the hash its character is filed under on every device (hooks.ownerHash,
      // the world process alone; a wrong key is no key, and the join goes on by the browser's id).
      if (hooks.ownerHash && typeof msg.ownerKey === "string") {
        const oh = hooks.ownerHash(msg.ownerKey);
        if (oh) hash = oh;
      }
      // A browser the owner removed from a server world stays out until the owner lets it back (item 5's sixth step).
      if (hooks.isBarred && hooks.isBarred(hash)) {
        send({ type: "bye", to: msg.from, reason: "removed" });
        continue;
      }
      // A world remembers characters by the browser's id, so a join with none is refused (it would make a
      // character nobody could come back to, one for every join, for ever).
      if (!hash && hooks.joinFor) {
        send({ type: "bye", to: msg.from, reason: "refused" });
        continue;
      }
      // A newer join from the same browser replaces the older connection (a refresh with the old socket
      // still open): the old one is told and dropped; its character is the new one's to take back.
      if (hash) {
        for (const [key, g] of guests) {
          if (g.hash !== hash) continue;
          send({ type: "bye", to: key, reason: "replaced" });
          guests.delete(key);
        }
      }
      const raw = msg.look && typeof msg.look === "object" ? { name: typeof msg.name === "string" ? msg.name : null, look: msg.look, handed: handedOf(msg.handed) } : null;
      const identity = raw && hooks.clampIdentity ? hooks.clampIdentity(raw) : raw; // the host trusts no payload (the review, 2026-10-13)
      // Whose character this is, by the browser's hash (the client keeps the owners; docs/31/09): the one
      // it made here, back from dormancy if it went; a dead one or an unknown browser asks for an identity.
      let r;
      if (hooks.joinFor) r = hooks.joinFor(hash, identity);
      else {
        const spawn = game.state.info ? game.state.info.spawn : [me.gx, me.gy];
        const at = map.nearestWalkable(spawn[0] + 1, spawn[1] + 1, (x, y) => game.state.players.some((p) => Math.round(p.gx) === x && Math.round(p.gy) === y)) || spawn;
        r = { player: game.addPlayer(at[0], at[1], { look: identity ? identity.look : null, name: identity ? identity.name : null, handed: identity ? identity.handed : null }) };
      }
      if (r && r.full) {
        send({ type: "bye", to: msg.from, reason: "full" });
        continue;
      }
      if (!r || !r.player) {
        send({ type: "who", to: msg.from, dead: !!(r && r.who && r.who.dead) });
        continue;
      }
      const p = r.player;
      away.delete(p.id);
      guests.set(msg.from, { playerId: p.id, hash, queue: [], last: null, ack: 0, joinedAt: tick });
      for (const c of allCharacters()) known.add(c.id);
      // The welcome is the whole world, gzipped: a well-explored world is 4.6 MB raw, about 200 KB packed (the coder agent's
      // review of step 3), and the relay refuses a message over 16 MB. A guest unpacks it with the browser's own
      // DecompressionStream. A server world packs at once (zlib, hooks.packWelcome); a browser host packs in the background
      // with CompressionStream (2026-10-15, `02`), the world stepping on meanwhile: the welcome carries the tick of its
      // snapshot, and the guest keeps the frames that reach it first and applies those after that tick (guestStep). The
      // text is the save's, from its cache (game.serializeText).
      const base = { type: "welcome", to: msg.from, playerId: p.id, tick, world: hooks.worldInfo ? hooks.worldInfo() : null };
      const text = game.serializeText();
      const z = hooks.packWelcome ? hooks.packWelcome(text) : null;
      if (z) send({ ...base, z });
      else if (typeof CompressionStream === "function") welcomeLater(base, text);
      else send({ ...base, save: JSON.parse(text) });
      forgetSent(); // the newcomer's baseline is this save: whatever the others were sent is sent again, whole

      hooks.message(`${p.name || p.id} joined.`);
      if (hooks.guestJoined) hooks.guestJoined(p);
    } else if (msg.type === "input") {
      const g = guests.get(msg.from);
      if (!g) continue;
      msg.snap = cleanSnap(msg.snap); // the host trusts no payload (reviewing the keys move, 2026-10-13)
      // A run (the guest's inputs while the world runs fast, below in guestStep): `steps` identical inputs ending at
      // `seq`, one entry a step again here so the acknowledgement and the guest's replay stay one to one. A run
      // carries no press; any that came are dropped, as a run never has one.
      const steps = Math.max(1, Math.min(MAX_RUN, msg.steps | 0));
      if (steps === 1) g.queue.push(msg); // one input per step, in order; the guest replays what is not yet acknowledged
      else {
        const snap = { ...msg.snap, clicked: false, altPressed: false, space: false, keys: null };
        for (let i = steps - 1; i >= 0; i--) g.queue.push({ seq: (msg.seq | 0) - i, snap });
      }
      // The queue is bounded. The host takes one input a step and a guest sends one a step, so a queue
      // that ever ran ahead (the host's window throttled while covered, a hitch) would stay that far
      // behind for ever, the guest's body replaying old walking and swings long after it stopped
      // (Michael's first real join, 2026-10-13). Past the bound the oldest are let go, their one-shot
      // presses carried onto the next so a swing or a space is never lost; the guest's own prediction is
      // corrected by the frame, as for any other misprediction.
      while (g.queue.length > MAX_BACKLOG * Math.max(1, Math.round(world.world.timeScale || 1))) { // a sixth of a second of the world's steps
        const gone = g.queue.shift();
        const keep = g.queue[0];
        for (const f of ["clicked", "altPressed", "space"]) if (gone.snap[f] && !keep.snap[f]) keep.snap = { ...keep.snap, [f]: true };
        // The key events (E, B, T; interact.keyEvents) ride the same way: a tap or a hold let go with its input is not lost.
        if (gone.snap.keys) keep.snap = { ...keep.snap, keys: { ...gone.snap.keys, ...(keep.snap.keys || {}) } };
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
    } else if (msg.type === "item" || msg.type === "use" || msg.type === "place" || msg.type === "craft" || msg.type === "dye") {
      // The panel's drags, drops, and menus, and the Use mode's pair, from a guest (docs/31/05, item 9):
      // run here as the guest's player through the same code its own panel uses (main.js hands in
      // inventory-actions.js's executors).
      const g = guests.get(msg.from);
      const p = g && game.state.players.find((q) => q.id === g.playerId);
      const hook = msg.type === "item" ? hooks.item : msg.type === "use" ? hooks.use : msg.type === "place" ? hooks.place : msg.type === "dye" ? hooks.dye : hooks.craft;
      if (p && hook) {
        game.state.acting = p;
        try {
          hook(p, msg);
        } finally {
          game.state.acting = null;
        }
      }
    } else if (msg.type === "poke") {
      // A guest's click on a gatherable or the well: stamped here, for everyone's screen (interact.stampFromGuest).
      const g = guests.get(msg.from);
      const p = g && game.state.players.find((q) => q.id === g.playerId);
      if (p) interact.stampFromGuest(p, msg.id, msg.kind ? 1 : 0);
    } else if (msg.type === "talkEnd") {
      // A guest's conversation panel closed: it leaves the villager's talkers (docs/34).
      const g = guests.get(msg.from);
      const p = g && game.state.players.find((q) => q.id === g.playerId);
      if (p && typeof msg.id === "string") interact.endTalkFromGuest(p, msg.id);
    } else if (msg.type === "pokeVillager") {
      // A guest's left click on a villager, by its id (item 4): answered here, within the click's reach.
      const g = guests.get(msg.from);
      const p = g && game.state.players.find((q) => q.id === g.playerId);
      if (p && typeof msg.id === "string") interact.pokeVillagerFromGuest(p, msg.id);
    } else if (msg.type === "sync") {
      // A guest's hashes at a tick (the sync check).
      if (guests.has(msg.from) && msg.parts && typeof msg.parts === "object") {
        const parts = {};
        for (const k of Object.keys(msg.parts).slice(0, 16)) if (typeof msg.parts[k] === "string") parts[k] = msg.parts[k].slice(0, 200); // thirteen parts since the item census (#101): room for three more
        guestSync.set(msg.from, { tick: msg.tick | 0, parts });
      }
    } else if (msg.type === "say") {
      // The first command over the wire (docs/31/03, chat): a guest's line, said by their player here.
      const g = guests.get(msg.from);
      const p = g && game.state.players.find((q) => q.id === g.playerId);
      if (p && typeof msg.text === "string" && msg.text.trim()) say(p, msg.text.trim().slice(0, 200));
    } else if (msg.type === "leave") {
      // A guest gone: its character stands for the grace (the away map), then goes dormant (below).
      const g = guests.get(msg.from);
      if (!g) continue;
      const p = game.state.players.find((q) => q.id === g.playerId);
      guests.delete(msg.from);
      if (![...guests.values()].some((o) => o.playerId === g.playerId)) away.set(g.playerId, loop.simTime());
      hooks.message(`${(p && p.name) || g.playerId} left.`);
      if (hooks.guestLeft) hooks.guestLeft(p);
    }
  }
  // The grace run out: the character leaves the simulation through the client, which keeps its record.
  for (const [id, at] of away) {
    if (loop.simTime() - at < GRACE_S) continue;
    away.delete(id);
    if (hooks.dormant) hooks.dormant(id);
    else game.removePlayer(id);
  }
  for (const g of guests.values()) {
    // The next input in the queue; with none this step, the last one held (the key is still down).
    const next = g.queue.shift();
    if (next) {
      g.last = next.snap;
      g.ack = next.seq;
      g.silent = 0;
    } else if (g.last) {
      g.last = { ...g.last, space: false, clicked: false, altPressed: false, keys: null }; // a press, and a key event, is one step
      // A guest silent for half a second (its tab hidden mid-walk, its browser frozen, its line down): the held keys
      // lapse, so its character stops rather than walking on with the last input for ever (the coder agent's review of
      // item 3's plan). A sixth of a second's jitter is held as before.
      g.silent = (g.silent || 0) + 1;
      if (g.silent > SILENT_STEPS * Math.max(1, Math.round(world.world.timeScale || 1))) g.last = { ...g.last, axis: { x: 0, y: 0 }, sprint: false, leftDown: false, altDown: false, offDown: false };
    }
    if (g.last && !g.steppedAway) snapshots.set(g.playerId, g.last);
  }
  return snapshots;
}

function allCharacters() {
  const S = game.state;
  return [...S.players, ...S.zombies, ...S.villagers, ...S.corpses, ...S.animals];
}

// What a guest needs of a character each step: where it is and what it is doing.
// A player's record is whole (their client draws their bag and their bars).
// Numbers rounded (the review, 2026-10-13: a position like 16.450000000000006 is eighteen characters where
// five would do): positions to three decimals, which the sync check hashes at, hp to two.
const r3 = (n) => Math.round(n * 1000) / 1000;
const r2 = (n) => Math.round(n * 100) / 100;

// An animation's timer ticks every step and the guest draws by the frame number alone, so it goes rounded and is
// left out of the change test below: a character standing still near the living was "changed" in every frame.
const roundAnim = (a) => (a && typeof a.elapsed === "number" ? { ...a, elapsed: r2(a.elapsed) } : a);
const sameAnimKey = (r) => JSON.stringify(r.anim && typeof r.anim === "object" ? { ...r, anim: { name: r.anim.name, frame: r.anim.frame, done: r.anim.done } } : r);

function slim(c) {
  const r = { id: c.id, gx: r3(c.gx), gy: r3(c.gy), facing: c.facing, anim: roundAnim(c.anim), hp: r2(c.hp), dead: c.dead, state: c.state, corpse: c.corpse, line: c.line ? { text: c.line.text, left: Math.ceil(c.line.left * 2) / 2 } : null, blocking: c.blocking, talkingWith: c.talkingWith, burning: !!c.burning, carryingId: c.carrying ? c.carrying.id : null };
  if (c.cremate) r.cremate = true; // a body set alight by Burn corpse (docs/43 section 7): a guest's menu greys its search; its removal is the roster's
  if (c.searched) {
    r.searched = true;
    r.loot = c.loot; // a body opened: its grid, for a guest with it open
    r.worn = c.worn; // and what is still on it, which the grid is
  }
  return r;
}

// An animal's record (docs/45 section 7): the whole of it once, then only the fields that differ from the last ones sent: where it is,
// its facing, the animation's name (`an`) and the frame it shows (`fr`; a guest draws by them and never steps an animal's animation, so
// the timer stays home), its state, health, and death. Animals are many and most of them stand: a grazing one sends its frame alone, a
// walker its position and frame (measured on #452: 149 bytes a record with everything, 101 with the timer and the unchanged health
// left out, and this). The wire is ordered and a joiner's welcome is newer than any baseline, so what was last sent is what every guest
// has. Its home, what it is fed, and what it gives join here (or force a whole record) when steps 2 and 3 change them.
const lastAnimal = new Map(); // animal id -> its fields as last sent
function animalFields(a) {
  return { gx: r3(a.gx), gy: r3(a.gy), facing: a.facing, an: a.anim.name, fr: a.anim.frame, state: a.state, hp: r2(a.hp), dead: !!a.dead, kb: a.killedBy || null, sk: !!a.skinned, ld: a.leaderId || null, fd: a.fedDay, tk: a.takenDay, hm: `${a.home[0]},${a.home[1]}` }; // a carcass's weapon class and its skinning as `kb` and `sk` (step 2); who leads it, the day it was fed, the day its milk or wool was taken, and its home, which a let-go moves (step 3)
}
function animalRecord(a) {
  const now = animalFields(a);
  const was = known.has(a.id) ? lastAnimal.get(a.id) : null;
  lastAnimal.set(a.id, now);
  if (!known.has(a.id)) {
    known.add(a.id);
    const r = { full: true, ...serializeAnimal(a) };
    delete r.path; // a guest never walks it
    r.gx = now.gx;
    r.gy = now.gy;
    r.hp = now.hp;
    r.anim = roundAnim(r.anim);
    return r;
  }
  const r = { id: a.id };
  for (const k of Object.keys(now)) if (!was || was[k] !== now[k]) r[k] = now[k];
  return r;
}

function record(c) {
  if (c.kind === "animal") return animalRecord(c);
  if ((c.kind === "player" && !c.corpse) || !known.has(c.id)) { // a player's body goes as the dead's bodies do (2026-10-14)
    known.add(c.id);
    const r = { full: true, ...serializeCharacter(c), line: c.line }; // the save drops a bubble; a frame carries it (the chat)
    r.gx = r3(r.gx);
    r.gy = r3(r.gy);
    r.hp = r2(r.hp);
    // The prop in hand rides once, when it changes (the review, 2026-10-13: a stocked chest every frame is its whole
    // bag every frame); a guest keeps its copy while the id stays, and a welcome's save carries it whole.
    if (lastCarried.get(c.id) === r.carryingId) delete r.carried;
    else lastCarried.set(c.id, r.carryingId);
    if (c.kind === "player") for (const g of guests.values()) if (g.playerId === c.id) r.ack = g.ack; // the last input of theirs this record reflects
    // The action itself holds functions and does not travel; its label and place do, for the bar a guest shows (interact.promptFor).
    if (c.kind === "player") r.actionView = c.action && c.action.action ? { label: c.action.action.label, mx: c.action.action.mx, my: c.action.action.my } : null;
    return r;
  }
  return slim(c);
}

// Frames paced by the world's own time over its time scale (the wire's third part, 2026-10-13, `02`): a running
// count adds one over the scale each step and a frame goes when it reaches three (the coder agent's first note:
// a count that only tests the tick against three times the scale sends a late or a double frame when the speed
// switches mid-count). One frame every three steps at normal speed, twenty a second; one every hundred and
// eightieth while the world runs at sixty times with everyone asleep, the same fifty milliseconds as a player
// experiences them, so a sleeper's hundred steps a browser frame coalesce into one frame instead of flooding
// the relay. The cadence is deterministic and the scripted two-tab tests stay whole, which a wall clock would
// not keep. The guests' inputs come every step still, and the host applies one a step; the touched chunks and
// the pokes gather until the frame.
export const FRAME_EVERY = 3;
let frameCount = 0; // steps over the scale since the last frame
let framesSent = 0;
let evictedSent = 0; // the chunks this host's frames have named as dropped (status, check("eviction"))
let evictedDropped = 0; // the chunks this guest's replica dropped as its frames named them (status, check("eviction"))

// After the world's step: the frame to every guest, when one is due.
// A browser host's welcome, packed off the step (CompressionStream) and sent when it is done, to the same connection on
// the same wire; whole if the packing fails (the guest applies the frames after its tick either way). The text is
// the snapshot at the join's tick, so the world may step on while it packs.
const welcomesPacking = new Set(); // the connections whose welcome is packing (status)
function welcomeLater(base, text) {
  const wire = transport;
  const to = base.to;
  const t0 = performance.now();
  welcomesPacking.add(to);
  packText(text).then((z) => {
    welcomesPacking.delete(to);
    if (transport !== wire || !guests.has(to)) return; // gone meanwhile, or the wire closed
    lastWelcome = { rawKB: Math.round(text.length / 1024), packedKB: Math.round(z.length / 1024), ms: Math.round(performance.now() - t0) };
    send({ ...base, z });
  }, (err) => {
    welcomesPacking.delete(to);
    console.warn("The welcome could not be packed; sent whole:", err && err.message);
    if (transport === wire && guests.has(to)) send({ ...base, save: JSON.parse(text) });
  });
}
let lastWelcome = null; // the last packed welcome's sizes and time (status)

// Text to gzip to base64, off the step: the browser's CompressionStream, the bytes to base64 in slices (one call over
// megabytes overflows the stack).
async function packText(text) {
  const stream = new Blob([text]).stream().pipeThrough(new CompressionStream("gzip"));
  const bytes = new Uint8Array(await new Response(stream).arrayBuffer());
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

export function hostAfterStep() {
  tick++;
  if (role !== "host" || !guests.size) {
    map.takeTouched(); // nobody to tell: the touched set is drained, not kept for ever (a grown chunk names itself to it in every game)
    map.takeEvicted(); // and the chunks dropped: the next guest's welcome holds only what is loaded
    chart.takeChanged(); // and the chart's: the world has it all, and the next guest's welcome is the save
    interact.takePokes();
    floaters.takeForFrame(); // and the floating numbers: nobody to show them to (the host draws its own from its log)
    if (lastSent.size || lastHeavy.size) forgetSent(); // the next guest's welcome is its baseline, and every roster goes out again
    archery.takeLaunched();
    if (flightsSeen.size || flightsSent.size) { flightsSeen.clear(); flightsSent.clear(); } // and the flights: a joiner gets what is in the air from the frame after its welcome
    return;
  }
  seeFlights(); // every step, so a flight loosed and down between two frames still goes
  frameCount += 1 / Math.max(1, world.world.timeScale || 1);
  if (frameCount < FRAME_EVERY - 1e-9) return; // not this step: the chunks touched and the pokes keep until the frame
  frameCount = Math.min(frameCount - FRAME_EVERY, FRAME_EVERY); // the remainder carries, never more than a frame's worth
  framesSent++;
  const hashThis = syncReports && framesSent % SYNC_EVERY_FRAMES === 0;
  const S = game.state;
  for (const id of lastCarried.keys()) if (!S.players.some((q) => q.id === id)) lastCarried.delete(id); // a player gone dormant and back is sent its prop in hand afresh
  const touched = map.takeTouched();
  // The chunks dropped since the last frame, named once like the touched ones: the wire is ordered and every frame reaches every
  // joined guest (a joiner's frames before its welcome are kept and those after its tick applied, guestStep), so nothing is lost;
  // a drop is idempotent, so one the welcome already lacks costs nothing.
  const evicted = map.takeEvicted();
  evictedSent += evicted.length;
  const chartChanged = chart.takeChanged();
  const floated = floaters.takeForFrame(); // the hits, heals, and gathers since the last frame (#294)
  const flights = takeFlights(loop.simTime()); // the arrows, thrown things, and spells loosed and come down since the last frame (#250)
  // A character no longer in any list is forgotten: its id leaves `known` and what was last sent of it. A far chunk put
  // to sleep takes its dead out of the world and wakes them again later with the same id and the same record; remembered,
  // the record looked unchanged and was never sent, the roster named an id the guest had dropped, and the zombie stood
  // on the host and nowhere on the guest's screen (found reviewing the wire's delta, 2026-10-13).
  {
    const present = new Set();
    for (const list of [S.players, S.zombies, S.villagers, S.corpses, S.animals]) for (const c of list) present.add(c.id);
    for (const id of lastSent.keys()) if (!present.has(id)) lastSent.delete(id);
    for (const id of lastAnimal.keys()) if (!present.has(id)) lastAnimal.delete(id);
    for (const id of known) if (!present.has(id)) known.delete(id);
    // And a player's last heavy and light parts: one gone dormant and back came back with an unchanged heavy part, so only a
    // light record went out, to guests that had dropped it, which never saw it again.
    for (const id of lastHeavy.keys()) if (!present.has(id)) lastHeavy.delete(id);
    for (const id of lastLight.keys()) if (!present.has(id)) lastLight.delete(id);
  }
  // A player: the whole record when its heavy part changed (or never sent), else the light part when it differs.
  const playerRecord = (c) => {
    const full = record(c); // marks the id known, carries the prop in hand once, the ack and the action's view
    const heavy = {};
    const light = {};
    for (const [k, v] of Object.entries(full)) {
      if (k === "full" || k === "ack" || k === "actionView" || k === "line") continue;
      if (HEAVY.has(k)) heavy[k] = v;
      else if (k === "buffs" && v) light[k] = Object.fromEntries(Object.entries(v).map(([id, b]) => [id, { left: r2(b.left) }])); // a potion's buff (docs/47), its time to two decimals as Sick's
      else light[k] = (k === "bleed" || k === "sick") && v ? { stacks: v.stacks, left: r2(v.left) } : typeof v === "number" && !EXACT.has(k) ? r2(v) : v; // the wound's time, and Sick's (docs/44), to two decimals: the row of debuffs shows whole seconds (#308)
    }
    // A lit torch's wear rises every step (#156): compared to two decimals, so the heavy part goes whole when it changes by a
    // hundredth, not every frame the torch burns. The rounding covers every `wear` key, a weapon's per-hit wear too (a guest's
    // durability bar may lag by under a hundredth; harmless).
    const heavyText = JSON.stringify(heavy, (k, v) => (k === "wear" && typeof v === "number" ? Math.round(v * 100) / 100 : v));
    if (lastHeavy.get(c.id) !== heavyText) {
      lastHeavy.set(c.id, heavyText);
      lastLight.set(c.id, JSON.stringify(light));
      return full;
    }
    const r = { light: true, ...light, line: full.line, ack: full.ack, actionView: full.actionView };
    const lightText = JSON.stringify(light);
    if (lastLight.get(c.id) === lightText && !r.line) return { light: true, id: c.id, ack: full.ack }; // nothing moved: the ack alone, so the guest's reconciliation runs
    lastLight.set(c.id, lightText);
    return r;
  };
  const whenChanged = (name, value) => {
    const text = JSON.stringify(value);
    if (lastExtras[name] === text) return undefined;
    lastExtras[name] = text;
    return value;
  };
  // The delta: a record only when it differs from the last sent; the roster of a list when its membership changed.
  const delta = (list) => {
    const out = [];
    for (const c of list) {
      if (c.kind === "animal") {
        const r = animalRecord(c); // its own delta: whole once, then what changed
        if (r.full || Object.keys(r).length > 1) out.push(r);
        continue;
      }
      const r = record(c);
      if (r.full) {
        out.push(r);
        lastSent.set(c.id, sameAnimKey(slim(c)));
        continue;
      }
      const text = sameAnimKey(r);
      if (lastSent.get(c.id) === text) continue;
      lastSent.set(c.id, text);
      out.push(r);
    }
    return out;
  };
  let roster = null;
  for (const name of ["zombies", "villagers", "corpses", "animals"]) {
    const ids = S[name].map((c) => c.id);
    const text = ids.join(",");
    if (text === lastRoster[name]) continue;
    lastRoster[name] = text;
    (roster = roster || {})[name] = ids;
  }
  const frame = {
    type: "frame",
    tick,
    clock: clock.getElapsed(),
    simTime: loop.simTime(),
    timeScale: world.world.timeScale,
    ...(evicted.length ? { evicted } : {}), // the wild chunks dropped since the last frame, [cx, cy] each: the field only when there are any (protocol 10)
    chunks: touched.map(([cx, cy]) => map.getChunk(cx, cy, false)).filter(Boolean).map(map.serializeChunk),
    ...(chartChanged.length ? { chart: chartChanged } : {}), // the chart cells written since the last frame, [cx, cy, [index, cell, ...]] per chunk (#237; whole chunks only in the welcome): the field only when there are any
    players: S.players.map(playerRecord),
    zombies: delta(S.zombies),
    villagers: delta(S.villagers),
    corpses: delta(S.corpses),
    animals: delta(S.animals), // docs/45: a fourth list, its own roster
    animalHomes: whenChanged("animalHomes", S.animalHomes), // each home's cap and renewal, when it changes (the sync check's animals part reads it)
    roster,
    ...(floated.length ? { floaters: floated } : {}), // the numbers over heads, when there are any
    pokes: interact.takePokes(), // the sways and the well's bucket stamped this step (interact.js): a guest sees a field wobble when anyone walks through it
    queues: whenChanged("queues", stations.frameQueues()), // the jobs in the stations, with their time left: the bar a guest's recipes panel shows
    carriers: whenChanged("carriers", light.carriers().filter((c) => c.owner)),
    rules: whenChanged("rules", { ...rules.rules }), // the world's rules are the host's (docs/31/07, question 13)
    sync: hashThis || undefined, // this frame both sides hash (the sync check)
    ...(flights ? { arrows: flights } : {}), // { go, end }: the flights loosed and come down since the last frame, once each (#250), which a guest steps between; no flares travel (a guest makes a fireball's where its drawn flight ends)
  };
  send(game.toSafe(frame));
  if (hashThis) {
    syncRing.set(tick, game.syncParts());
    for (const k of syncRing.keys()) if (syncRing.size > 8) syncRing.delete(k); else break;
  }
}

// ---- the guest ----

// Each step: the host's frames applied in order, then my input sent.
export function guestStep(mySnap) {
  if (role !== "guest") return;
  const now = performance.now();
  if (!joined && !welcoming && firstJoinAt && now - firstJoinAt > JOIN_WAIT_MS) {
    const c = code;
    close();
    if (hooks.failed) hooks.failed(c, "timeout", "guest");
    return;
  }
  if (!joined && !welcoming && (!joinSentAt || now - joinSentAt > 2000)) {
    joinSentAt = now;
    if (!firstJoinAt && transport && transport.ready) firstJoinAt = now; // the wait starts once the relay has answered the socket (a sleeping tier wakes slowly)
    // The browser's id and the protocol always; the identity when one was chosen (the host asks with `who` otherwise).
    send({ type: "join", clientId, protocol: PROTOCOL, version: SAVE_VERSION, build: BUILD_ID, name: identity ? identity.name : null, look: identity ? identity.look : null, handed: identity ? handedOf(identity.handed) : null, ...(ownerKey ? { ownerKey } : {}) });
  }
  const queue = inbox.splice(0);
  while (queue.length) {
    const msg = queue.shift();
    // A packed welcome is unpacking: everything after it waits, in order, for the world it follows (the frames are
    // deltas against it).
    if (welcoming) {
      held.push(msg);
      continue;
    }
    if (msg.type === "welcome") {
      if (joined) continue;
      if (typeof msg.z === "string") {
        welcoming = true;
        const wire = transport;
        unpack(msg.z).then((save) => {
          if (transport !== wire) return; // the wire closed or was replaced meanwhile
          const kept = welcomed(msg, save);
          welcoming = false;
          inbox.unshift(...kept, ...held.splice(0));
        }, (err) => {
          console.warn("The world's welcome would not unpack:", err && err.message);
          welcoming = false;
          held.length = 0;
          early.length = 0;
          dropped("relay");
        });
        continue;
      }
      queue.unshift(...welcomed(msg, msg.save));
    } else if (msg.type === "frame" && !joined) {
      // Before my welcome: a browser host packs it in the background and steps on meanwhile, so the frames after its
      // snapshot may reach me first (protocol 4). Kept, the newest EARLY_MAX, for welcomed to sort.
      early.push(msg);
      if (early.length > EARLY_MAX) early.shift();
    } else if (msg.type === "frame" && joined) {
      applyFrame(game.fromSafe(msg));
      framesSeen++;
      lastFrameAt = now;
      stallTold = false; // frames are coming again: the next quiet spell is told afresh
      if (syncReports && msg.sync) send({ type: "sync", tick: msg.tick | 0, parts: game.syncParts() });
    } else if (msg.type === "syncOn" && msg.from) {
      syncReports = !!msg.on;
    } else if (msg.type === "message") {
      hooks.message(msg.text, msg.seconds);
    } else if (msg.type === "fx" && msg.from) {
      // A visual the host's world made, drawn here too (fxAll). Bounded: the host is trusted, the numbers are not.
      const num = (v, lim) => (typeof v === "number" && Number.isFinite(v) ? Math.max(-lim, Math.min(lim, v)) : 0);
      if (hooks.fx && typeof msg.kind === "string") hooks.fx(msg.kind, num(msg.x, 1e5), num(msg.y, 1e5), Math.max(0, num(msg.z, 256)));
    } else if (msg.type === "kick" && msg.from) {
      // My own landed blow, resolved on the host: the camera's kick, here (item 4). Bounded: the host is trusted, the numbers are not.
      const num = (v, lim) => (typeof v === "number" && Number.isFinite(v) ? Math.max(-lim, Math.min(lim, v)) : 0);
      if (hooks.kick) hooks.kick(num(msg.x, 16), num(msg.y, 16), num(msg.seconds, 1));
    } else if (msg.type === "log") {
      if (hooks.log) hooks.log(msg.text, msg.kind);
    } else if (msg.type === "who" && !joined) {
      // The host knows no living character of this browser's here: a character is to be made (main.js shows the steps).
      firstJoinAt = 0; // the wait starts over once the identity is chosen
      joinSentAt = now + 1e9; // no join until setIdentity resets it
      if (hooks.who) hooks.who(!!msg.dead);
    } else if (msg.type === "bye") {
      // The host let go: replaced by a newer join from this browser, or another protocol.
      dropped(byeWhy(msg));
      return;
    } else if (msg.type === "opened") {
      pendingOpened.push(msg.what); // after the frame that carries the grid (frames queue behind it)
    } else if (msg.type === "talk") {
      pendingTalk.push({ what: msg.what, after: framesSeen }); // held until a frame has been applied after this message: the one that carries the villager's `talking` state, which the panel's lines are computed from on my own replica (frames go every third step, so the message is usually first)
    } else if (msg.type === "stay" && msg.from) {
      // The host refused my step away (asleep or dead there): back in, nothing lost.
      steppedAway = false;
      if (hooks.stay) hooks.stay();
    }
  }
  // The host's frames stopped coming: its window is most likely covered or in the background, where a
  // browser slows a page to a crawl (Michael's first real join, 2026-10-13). Say so, once.
  if (joined && lastFrameAt && !stallTold && now - lastFrameAt > 2500) {
    stallTold = true;
    hooks.message("The host's game has gone quiet. Its window may be covered or in the background.", 6);
  }
  if (pendingOpened.length && hooks.opened) for (const w of pendingOpened.splice(0)) hooks.opened(w);
  if (pendingTalk.length && hooks.talk) {
    const ready = pendingTalk.filter((t) => framesSeen > t.after);
    for (const t of ready) { pendingTalk.splice(pendingTalk.indexOf(t), 1); hooks.talk(t.what); }
  }
  if (joined) smoothStep();
  if (joined && client.me && !steppedAway && !returning) {
    const s = mySnap.idle ? mySnap : testSnapshot || mySnap; // a screen up: nothing pressed, whatever a check says
    // The fight (docs/31/06, tier 2): the clicks and the buttons go as they are, the aim as a vector and
    // a ground point; the host resolves the swing, the draw, and the shove against its own dead.
    const snap = { axis: s.axis, sprint: !!s.sprint, aim: s.aim || null, aimAt: s.aimAt || null, space: !!s.space, clicked: !!s.clicked && !s.clickSpent, clickSpent: false, leftDown: !!s.leftDown, altPressed: !!s.altPressed, altDown: !!s.altDown, offDown: !!s.offDown, blocked: !!s.blocked, keys: s.keys || null };
    seq++;
    pending.push({ seq, snap });
    if (pending.length > MAX_PENDING) pending.shift(); // a host that has acknowledged nothing for seconds: the replay is bounded
    sendInput(snap);
    // Prediction (docs/31/04): my own walking runs here at once against the replica's walls; the host's
    // word arrives a wire later and the inputs it has not yet applied are replayed over it (applyFrame).
    predict(client.me, snap);
  }
}

// A guest's inputs on the wire. At the world's normal pace each step's input goes at once, as it always has. While the
// world runs faster (everyone asleep, sixty steps a browser frame) the same input step after step is held as a run and
// sent on the frames' own cadence, a running count of one over the scale reaching three, so twenty messages a real second
// stand for the 3,600 steps; the host expands a run into one input a step. Found by the real-time sleep test the coder
// agent asked for (2026-10-13): a sleeping guest sent an input every step, about a megabyte a second upstream. An input
// that differs, or that carries a press or a key event, goes at once, the run before it first.
let run = null; // { snap, text, seq, steps }: the identical inputs held since the last send
let runCount = 0;

function flushRun() {
  if (run && run.steps) send({ type: "input", seq: run.seq, snap: run.snap, steps: run.steps });
  if (run) run.steps = 0;
  runCount = 0;
}

function sendInput(snap) {
  const scale = Math.max(1, world.world.timeScale || 1);
  const press = snap.clicked || snap.altPressed || snap.space || !!snap.keys;
  const text = press ? null : JSON.stringify(snap);
  if (scale > 1 && !press && run && run.text === text) {
    run.seq = seq;
    run.steps++;
    runCount += 1 / scale;
    if (runCount >= FRAME_EVERY - 1e-9) flushRun();
    return;
  }
  flushRun();
  send({ type: "input", seq, snap });
  run = press ? null : { snap, text, seq, steps: 0 };
}

// One step of my own player as the host will run it, cosmetic where the host decides (the second of the five items
// for a friend on their own computer, 2026-10-13): the walking, then the controller in its predict mode, the swing
// started and the guard raised at once and the hit left to the host, in the host's own order (game.step).
function predict(me, snap) {
  updatePlayer(me, 1 / 60, snap);
  controlPlayer(me, game.state.zombies, 1 / 60, snap, true);
}

// The browser hashes of the guests still connected that have stepped away (host.js `full`: a stepped-away guest keeps its
// place, since it is idling at its keyboard, not leaving; a guest whose socket has gone does not).
export function awayGuestHashes() {
  const out = [];
  for (const g of guests.values()) if (g.steppedAway && g.hash) out.push(g.hash);
  return out;
}

// The host's last word on my player, kept so the replay always starts from it: a frame whose record of me is the
// acknowledgement alone (nothing changed on the host since the last record) means the last record stands, and
// replaying the unacknowledged inputs over my predicted player instead would apply them twice.
let myBase = null;

// What a host's goodbye means for the client's words (main.js's notes).
function byeWhy(msg) {
  if (msg.reason === "version") return msg.newer === "guest" ? "versionHost" : "versionGuest";
  return ["replaced", "full", "refused", "removed", "updated"].includes(msg.reason) ? msg.reason : "hostLeft";
}

// The world from my welcome. Returns the frames that reached me before it and come after its snapshot's tick, in order,
// for the caller to apply first; the older ones were already in the save.
function welcomed(msg, save) {
  myPlayerId = msg.playerId;
  joined = true;
  hooks.restore(save, myPlayerId, msg.world || null); // main.js: game.restore, then the client's own refresh
  hooks.joined(myPlayerId);
  const at = typeof msg.tick === "number" ? msg.tick : Infinity;
  const kept = early.filter((f) => typeof f.tick === "number" && f.tick > at);
  if (early.length >= EARLY_MAX && kept.length === early.length) console.warn("Frames before the welcome overflowed: the world may be out of step until its next change");
  early.length = 0;
  return kept;
}
const early = []; // frames that reached me before my welcome (welcomed keeps those after its tick)
const EARLY_MAX = 600; // thirty seconds of frames at twenty a second

let welcoming = false; // a packed welcome is unpacking (guestStep holds what follows it)
const held = [];

// A gzipped welcome back to the world it packed: base64 to bytes, the browser's DecompressionStream, JSON.
async function unpack(b64) {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("gzip"));
  return JSON.parse(await new Response(stream).text());
}

export function correction() {
  return lastCorrection;
}

const makers = { player: createPlayer, zombie: createZombie, villager: createVillager };

let predictedPos = null; // where my prediction had me before this frame's record replaced it

// Smoothing on the replica (the wire's fourth part, 2026-10-13, `02`; rebuilt 2026-10-18, #248): a frame comes every third step, and reaches a guest irregularly, so a
// remote character is drawn from the positions the host sent (`netsmooth.js`): a few steps behind the newest frame, interpolated between the two either side, in the
// character's own gx and gy so the hit tests, the name over its head, and its bubble follow the same point. My own player is predicted, never smoothed. `netTo` is the
// host's truth, which the sync check hashes.
let frameHostTime = null; // the sim time of the frame being applied
function aimAt(c, gx, gy) {
  netsmooth.aim(c, gx, gy, frameHostTime);
}

function smoothStep() {
  const S = game.state;
  const scale = world.world.timeScale || 1;
  netsmooth.step([...S.players, ...S.zombies, ...S.villagers, ...S.corpses, ...S.animals].filter((c) => c !== client.me), scale);
  archery.stepReplica(netsmooth.drawClock(scale)); // what flies, stepped from its launch on the bodies' clock (#250)
  // A fireball's or a fire arrow's light, and a flare's, moved with it every step (the frame's own setting of the burners is every third).
  const glows = archery.projectileLights();
  if (glows.length || glowed) {
    light.setBurners([...burning.lights([...S.players, ...S.zombies, ...S.villagers, ...S.corpses]), ...glows]); // moving lights, read where they are asked for (light.js): nothing to re-bake
  }
  glowed = glows.length > 0;
}
let glowed = false; // a flight's light was set last step: set once more when the last goes, so it does not linger

function applyFrame(f) {
  const S = game.state;
  if (client.me) predictedPos = [client.me.gx, client.me.gy];
  if (f.rules) rules.set(f.rules); // sent when they change
  archery.applyReplicaArrows(f.arrows || null, f.simTime); // the flights loosed and come down since the last frame (#250)
  clock.setElapsed(f.clock);
  loop.setSimTime(f.simTime);
  frameHostTime = f.simTime;
  netsmooth.frameArrived(f.simTime, f.timeScale || 1);
  world.setTimeScale(f.timeScale);
  if (f.chart && f.chart.length) chart.apply(f.chart); // a guest only receives the chart; the host reveals it for every player
  // The chunks the host dropped, dropped here by the host's own path (the registry, the fire set, the light's listener), before the
  // frame's chunks go in: one dropped and grown again in the same frame arrives fresh below. No guard for my own player's ring: the
  // host keeps every chunk within `evictChunks` (8) of every player, mine among them, twice the ring of 4 it grows, so a chunk
  // named here is far beyond where my prediction has me.
  if (Array.isArray(f.evicted)) for (const at of f.evicted) {
    if (Array.isArray(at) && Number.isInteger(at[0]) && Number.isInteger(at[1]) && map.dropChunk(at[0], at[1])) evictedDropped++;
  }
  if (f.chunks.length) {
    for (const d of f.chunks) map.installChunk(d);
    for (const d of f.chunks) for (const p of d.props) map.installProp(p);
    map.rebuildBrackets();
    light.forgetAll();
    hooks.chunksChanged && hooks.chunksChanged(f.chunks);
  }
  if (f.floaters) floaters.receive(f.floaters); // the numbers over heads the host recorded: drawn here as there (ui/floaters.js)
  if (f.pokes) for (const [id, at, kind] of f.pokes) {
    const pr = id ? map.propById(id) : null;
    const field = kind ? "playedAt" : "pokedAt";
    if (pr && typeof at === "number" && !(pr[field] >= at)) pr[field] = at;
  }
  if (f.queues) for (const [id, q] of f.queues) {
    const pr = id ? map.propById(id) : null;
    if (pr && Array.isArray(q)) pr.queue = q;
  }
  const byId = new Map();
  for (const c of allCharacters()) byId.set(c.id, c);
  const propById = (id) => (id ? map.propById(id) : null);
  const bring = (list) => list.map((r) => {
    let c = byId.get(r.id);
    if (r.full) {
      const { full, ...data } = r;
      if (!c && data.kind === "animal") {
        c = restoreAnimal(data); // an animal: a record of its own, its sheet its species' (docs/45)
        byId.set(c.id, c);
      } else if (!c) {
        c = restoreCharacter(data, makers);
        c.target = null;
        delete c._targetId;
        c.carrying = game.carriedOf(c);
        delete c._carryingId;
        delete c._carried;
        if (c.corpse) dressCorpse(c); // a player's body too (2026-10-14)
        else if (c.kind !== "player") dress(c);
        byId.set(c.id, c);
      } else {
        const keep = c.sprite;
        const { targetId, carryingId, carried, ...rest } = data;
        const wasX = c.gx;
        const wasY = c.gy;
        Object.assign(c, rest);
        if (r.id !== myPlayerId && typeof rest.gx === "number") { const toX = c.gx; const toY = c.gy; c.gx = wasX; c.gy = wasY; aimAt(c, toX, toY); }
        // A two-handed thing is one object in both hands (restoreCharacter does this on a character's first appearance):
        // came through JSON as two, the watcher drew a bow or a halberd in each hand (found 2026-10-13).
        if (c.hands && c.hands.main && c.hands.off && c.hands.main !== c.hands.off && c.hands.main.uid != null && c.hands.main.uid === c.hands.off.uid) c.hands.off = c.hands.main;
        // Kept as it is while the same prop stays in hand: rebuilt every frame it would lose the turns the ghost has
        // been given and register a fresh copy each time (the carried prop is the guest's to turn, the host's at the put-down).
        c.carrying = c.carrying && c.carrying.id === carryingId ? c.carrying : propById(carryingId) || (carried && carried.id === carryingId ? map.reviveProp(carried, false) : null);
        if (c.corpse) dressCorpse(c);
        else if (c.kind === "player") c.sprite = keep || c.sprite;
      }
    } else if (c && c.kind === "animal") {
      // An animal's delta (animalRecord): only what changed; the animation's name and frame as `an` and `fr`.
      const { id: _id, an, fr, gx, gy, kb, sk, ld, fd, tk, hm, ...rest } = r;
      Object.assign(c, rest);
      if (kb !== undefined) c.killedBy = kb;
      if (sk !== undefined) c.skinned = sk;
      if (ld !== undefined) c.leaderId = ld;
      if (fd !== undefined) c.fedDay = fd;
      if (tk !== undefined) c.takenDay = tk;
      if (typeof hm === "string") c.home = hm.split(",").map(Number);
      if (an !== undefined || fr !== undefined) c.anim = { ...c.anim, ...(an !== undefined ? { name: an } : {}), ...(fr !== undefined ? { frame: fr } : {}) };
      if (gx !== undefined || gy !== undefined) aimAt(c, gx ?? (c.netTo ? c.netTo[0] : c.gx), gy ?? (c.netTo ? c.netTo[1] : c.gy));
    } else if (c) {
      const { carryingId, loot, worn, light: isLight, ...rest } = r;
      const wasX = c.gx;
      const wasY = c.gy;
      Object.assign(c, rest);
      if (r.id !== myPlayerId && typeof rest.gx === "number") { const toX = c.gx; const toY = c.gy; c.gx = wasX; c.gy = wasY; aimAt(c, toX, toY); }
      if (loot) {
        // A body's grid is the body (docs/19): the same objects in the grid and on it, made one again by uid.
        c.loot = c.loot && c.loot.items ? Object.assign(c.loot, loot) : loot;
        const byUid = new Map(c.loot.items.filter((e) => e.uid != null).map((e) => [e.uid, e]));
        if (worn) for (const slot of Object.keys(worn)) c.worn[slot] = worn[slot] ? byUid.get(worn[slot].uid) || worn[slot] : null;
      }
      if (carryingId !== undefined) c.carrying = c.carrying && c.carrying.id === carryingId ? c.carrying : propById(carryingId); // a light record names the prop in hand; the copy stays while its id does
      if (c.corpse && !c.corpseKey) dressCorpse(c); // the dead's and a player's body (2026-10-14)
    }
    return c;
  }).filter(Boolean);
  S.players = bring(f.players);
  // The dead, the villagers, and the corpses come as a delta (hostAfterStep): the records present are applied to the
  // characters here, a list's membership changes only when the frame carries its roster, and a roster's ids are
  // characters this frame or an earlier one brought (a newcomer arrives whole in the same frame as its roster).
  bring(f.zombies || []);
  bring(f.villagers || []);
  bring(f.corpses || []);
  bring(f.animals || []);
  if (f.animalHomes) S.animalHomes = f.animalHomes;
  if (f.roster) for (const name of ["zombies", "villagers", "corpses", "animals"]) {
    const ids = f.roster[name];
    if (Array.isArray(ids)) S[name] = ids.map((id) => byId.get(id)).filter(Boolean);
  }
  // A body the frame did not carry stood where it was (the dead and the villagers come as a delta): pinned there at this frame's time (netsmooth.js).
  netsmooth.hold([...S.players, ...S.zombies, ...S.villagers, ...S.corpses, ...S.animals].filter((c) => c.id !== myPlayerId), frameHostTime);
  refind(S.players, myPlayerId); // the replica keeps my object; found again only when the frame's list holds a new one under my id (client.js)
  // Reconciliation: the host's record of me stands at its tick; my inputs it has not yet applied
  // go over it again, so what I see is the host's truth plus what I have done since.
  const me = client.me;
  const mine = f.players.find((r) => r.id === myPlayerId);
  if (me && mine) {
    const predictedX = predictedPos ? predictedPos[0] : me.gx;
    const predictedY = predictedPos ? predictedPos[1] : me.gy;
    const ack = mine.ack || 0;
    const { id: _id, ack: _ack, light: _light, full: _full, ...said } = mine;
    if (Object.keys(said).length) {
      // The fields the host sent of me, kept as they arrived (a copy: the replay mutates the animation in place).
      const fields = {};
      for (const k of Object.keys(said)) if (!HEAVY.has(k) && k !== "line" && k !== "actionView" && k !== "carryingId") fields[k] = me[k];
      myBase = JSON.parse(JSON.stringify(fields));
    } else if (myBase) {
      Object.assign(me, JSON.parse(JSON.stringify(myBase))); // the acknowledgement alone: the last record stands
    }
    while (pending.length && pending[0].seq <= ack) pending.shift();
    for (const p of pending) predict(me, p.snap);
    lastCorrection = Math.hypot(me.gx - predictedX, me.gy - predictedY);
  }
  predictedPos = null;
  if (returning) {
    // Back from a step away: the host has my player again once a frame carries its record, and the ring round it is
    // whole once the chunks the host dropped while I was out (its keep no longer counted me) have come back grown.
    returningFrames++;
    if ((me && mine && ringWhole(me)) || returningFrames > RETURN_WAIT_FRAMES) {
      returning = false;
      if (hooks.returned) hooks.returned();
    }
  }
  S.others = [...S.players, ...S.zombies, ...S.villagers];
  if (f.carriers) light.setCarriers(f.carriers); // sent when they change
  // The burning is a visual the host's step makes (fire.js): the flame particles and the body as a light come
  // from the burning flag, which the frame carries, so a guest runs the same update on its replica (found 2026-10-13:
  // only the host saw anyone on fire).
  const everyone = [...S.players, ...S.zombies, ...S.villagers, ...S.corpses];
  burning.update(1 / 60, everyone);
  light.setBurners([...burning.lights(everyone), ...archery.projectileLights()]); // and a fireball in flight (docs/24)
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

// A craft (ui/station-panel.js Make): the station by id, the recipe, the count; the host runs the verb.
export function sendPoke(id, kind) {
  if (role === "guest" && typeof id === "string") send({ type: "poke", id, kind: kind ? 1 : 0 });
}
// The guest's panel closed: tell the host, which drops it from the villager's talkers (a lost message is covered by the host's own check, villager.js).
export function sendTalkEnd(id) {
  if (role === "guest" && joined && typeof id === "string") send({ type: "talkEnd", id });
}
// A conversation a guest's player began: told which villager, since the lines are computed on the guest's own replica and nothing of it crosses the wire.
export function talkFor(playerId, what) {
  const to = guestOf(playerId);
  if (!to) return false;
  send({ type: "talk", to, what });
  return true;
}
export function sendPokeVillager(id) {
  if (role === "guest" && joined && typeof id === "string") send({ type: "pokeVillager", id });
}
// The camera's kick for a guest's own landed blow (item 4), to that guest alone.
export function kickTo(playerId, x, y, seconds) {
  const to = guestOf(playerId);
  if (to) send({ type: "kick", to, x, y, seconds });
}

export function sendCraft(cmd) {
  if (role === "guest" && cmd && cmd.propId) send({ type: "craft", ...cmd });
}

// A dye (ui/dye-panel.js Apply; docs/43 section 8): the vat by id, the entry by uid, the colours a hex per region; the host runs the verb.
export function sendDye(cmd) {
  if (role === "guest" && cmd && cmd.propId && cmd.uid != null && Array.isArray(cmd.colours)) send({ type: "dye", propId: cmd.propId, uid: cmd.uid, colours: cmd.colours });
}

// A placement (placement.js): a carried prop put down at a tile, a wall built on an edge, a built thing removed.
export function sendPlace(cmd) {
  if (role === "guest" && cmd && cmd.kind) send({ type: "place", ...cmd });
}

// The Use mode's pair (use.js): the item by uid and source, the target by address.
export function sendUse(cmd) {
  if (role === "guest" && cmd && cmd.uid != null && cmd.target) send({ type: "use", ...cmd });
}

// A log line for a player whose screen is on a guest (main.js's log sink).
export function logTo(playerId, text, kind = "info") {
  const to = guestOf(playerId);
  if (!to) return false;
  send({ type: "log", to, text, kind });
  return true;
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

// Stepping away (item 3, `02` 2026-10-13): a guest's own client measures its idle time and asks; the host takes the
// character out of the world and puts it back. Nothing is sent or predicted while away; the replay starts afresh.
let steppedAway = false;
export function stepAway() {
  if (role !== "guest" || !joined || steppedAway) return false;
  steppedAway = true;
  pending.length = 0;
  run = null;
  runCount = 0;
  send({ type: "away" });
  return true;
}
// Back: the host is asked to put my character in again. Until a frame carries it and the ring of chunks round it
// (`returning`), nothing is sent or predicted and the client keeps its away screen up (hooks.returned ends it):
// while I was out the host's eviction no longer counted me, so the chunks round me may have been dropped here
// too, and walking on at once would be walking on blank tiles that then pop in (the review of #455).
export function comeBack() {
  if (role !== "guest" || !steppedAway) return false;
  steppedAway = false;
  returning = true;
  returningFrames = 0;
  pending.length = 0;
  run = null;
  runCount = 0;
  send({ type: "back" });
  return true;
}
export function isSteppedAway() {
  return steppedAway;
}
export function isReturning() {
  return returning;
}
let returning = false;
let returningFrames = 0;
const RETURN_WAIT_FRAMES = 200; // ten seconds of frames: a host that never puts me back (it refused) lets me go on anyway
const RING = 4; // the chunks the host grows round each player (game.begin, map.ensureAround)
function ringWhole(p) {
  const [cx, cy] = map.chunkCoord(Math.round(p.gx), Math.round(p.gy));
  for (let dy = -RING; dy <= RING; dy++) for (let dx = -RING; dx <= RING; dx++) if (!map.getChunk(cx + dx, cy + dy, false)) return false;
  return true;
}

// One input with nothing held, sent at once: a guest's tab hidden mid-walk tells the host it stopped, before the
// host's own half-second lapse (the coder agent's review of item 3's plan). Kept in the replay like any input.
export function idleNow() {
  const me = client.me;
  if (role !== "guest" || !joined || steppedAway || !me) return;
  const snap = { ...game.idleSnapshot(), aim: null, aimAt: null, keys: null };
  seq++;
  pending.push({ seq, snap });
  if (pending.length > MAX_PENDING) pending.shift();
  run = null;
  runCount = 0;
  send({ type: "input", seq, snap });
}

// A visual for every guest's screen (a blocked blow's sparks; the coder agent's review of steps 1 and 2): the host
// draws its own, and a server world has no screen of its own to draw on.
export function fxAll(kind, x, y, z) {
  if (role === "host" && guests.size) send({ type: "fx", kind, x, y, z }); // a point on the ground and a height in pixels above it
}

// A guest let go by the host, with the reason it is told (a server world's owner removing a player; item 5's sixth step).
export function letGo(playerId, reason) {
  for (const [key, g] of guests) {
    if (g.playerId !== playerId) continue;
    send({ type: "bye", to: key, reason });
    guests.delete(key);
  }
}

// A guest's own record of the code, renamed when its owner changed it (the relay moved the room; this wire stays).
export function renameGuestCode(c) {
  if (role === "guest" && typeof c === "string" && c) code = c;
}

// The world's code renamed under it (a server world's owner changed it; the relay moved the room).
export function renameCode(c) {
  if (role === "host" && typeof c === "string" && c) code = c;
}

// A line in every guest's log (a player stepped away or came back).
export function logAll(text, kind = "info") {
  if (role === "host" && guests.size) send({ type: "log", text, kind });
}
