// A server world (item 5's third step, 2026-10-14, `02`; the plan in docs/31 and the ruling at 02's top): one
// world, booted headless from its save, joining the relay as that world's host over a WebSocket with the same
// wire (src/net.js) and the same host (src/host.js) a browser host runs. Everyone in it is a guest; it has no
// player of its own and no screen. On while anyone is in it; held when it empties (nothing moves, the clock
// stands, the wire still answers so a join wakes it); after a spell empty and saved, it exits, so an empty world
// costs nothing. One process per world, so a crash takes down one world.
//
// The relay starts it (server/relay.js, the fourth step) with the world's folder, the code a guest named, and a
// secret in CMZ_HOST_SECRET that proves to the relay this is its own child (a server world's code is reserved:
// anyone else's host registration for it is refused). By hand, for the checks:
//
//   node server/world.js --dir <folder> --code <join code> --relay ws://localhost:8012 [--new] [--name <name>]
//                        [--empty-exit <seconds>] [--debug-port <port>]
//   node server/world.js --dir <folder> --new --make-only [--name <name>]      a fresh world's save, then exit
//
// The folder holds the world's files: save.json.gz (the browser's snapshot shape, gzipped: a well-explored
// world's 4.6 MB is about 200 KB), rolling/ (a copy at most every ten minutes, the last three kept), daily/ (one a
// day, seven kept), and crash-<time>.json.gz when the process threw (the state it had, beside the last good save,
// which a crash never overwrites). `--debug-port` answers /status, /sync/on, /sync, and /stop on 127.0.0.1 alone,
// and only when given (the coder agent's hardening: the debug endpoint behind a flag).

import fs from "node:fs";
import path from "node:path";
import http from "node:http";
import zlib from "node:zlib";
import crypto from "node:crypto";
import { fileURLToPath, pathToFileURL } from "node:url";
import { bootData } from "./boot.js";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

// ---- the arguments ----
const argv = process.argv.slice(2);
const arg = (name, fallback = null) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 && i + 1 < argv.length && !argv[i + 1].startsWith("--") ? argv[i + 1] : fallback;
};
const flag = (name) => argv.includes(`--${name}`);
const dir = arg("dir");
const code = arg("code") || process.env.CMZ_CODE || null; // the relay passes it in the environment, out of the process list
const relayUrl = arg("relay", process.env.CMZ_RELAY || "ws://localhost:8080");
const EMPTY_EXIT_S = Number(arg("empty-exit", process.env.CMZ_EMPTY_EXIT || 600)); // ten minutes empty and saved, then gone
const debugPort = arg("debug-port") || process.env.CMZ_DEBUG_PORT || null;
const makeOnly = flag("make-only");
if (!dir || (!code && !makeOnly)) {
  console.error("usage: node server/world.js --dir <folder> --code <join code> --relay <ws url> [--new]");
  process.exit(64);
}
fs.mkdirSync(path.join(dir, "rolling"), { recursive: true });
fs.mkdirSync(path.join(dir, "daily"), { recursive: true });

const say = (text) => console.log(`${new Date().toISOString()} [${path.basename(dir)}] ${text}`);

// ---- the world ----
const boot = await bootData(root);
const imp = (p) => import(pathToFileURL(path.join(root, p)).href);
const [game, loop, net, host, rules, save, map, tuning] = await Promise.all([
  imp("src/game.js"), imp("src/loop.js"), imp("src/net.js"), imp("src/host.js"), imp("src/rules.js"), imp("src/save.js"), imp("src/map.js"), imp("src/tuning.js"),
]);

const SAVE = path.join(dir, "save.json.gz");
let snap = null;
if (fs.existsSync(SAVE)) {
  try {
    snap = save.upgrade(JSON.parse(zlib.gunzipSync(fs.readFileSync(SAVE)).toString("utf8")));
  } catch (err) {
    say(`the save would not read: ${err.message}`);
    process.exit(3);
  }
  if (!snap || !snap.map || !snap.characters) {
    say("the save is of no version this server knows, or not a world");
    process.exit(3);
  }
}
const mapName = (snap && snap.mapName) || "valley";
// A plain name of one of the server's own maps, never a path (the coder agent's review of step 5).
if (!/^[a-z][a-z0-9_-]{0,31}$/.test(mapName) || !fs.existsSync(path.join(root, "data", "maps", `${mapName}.json`))) {
  say("the save names no map this server has");
  process.exit(3);
}
const mapJson = boot.map(mapName);
// The world's meta (the relay's: the hashes of its code and owner key, the owner's rules, the barred browsers), read
// again when it matters, since the relay writes it while the world runs.
function readMeta() {
  try {
    return JSON.parse(fs.readFileSync(path.join(dir, "meta.json"), "utf8"));
  } catch {
    return {};
  }
}
// Whose character is whose (host.js's store): a browser id's hash, or the owner key's, to the player it made;
// the dormant records by the same hashes; the world's name for the welcome's bookmark.
const store = { name: (snap && snap.name) || arg("name", "A server world"), owners: { ...((snap && snap.owners) || {}) }, dormant: { ...((snap && snap.dormant) || {}) } };
const worldId = (snap && snap.worldId) || path.basename(dir);
// The world's own rules, which the settings never touch (item 5's second step): the owner's, as the meta keeps them
// (item 5's sixth step), over the save's, over the defaults.
const worldRules = { ...rules.DEFAULTS, ...((snap && snap.rules) || {}), ...(readMeta().rules || {}) };
rules.setSource(() => worldRules);
rules.refresh(); // read now: a world held from boot never steps, and its first save would carry the module's starting values (found testing)

if (snap) game.restore(snap, mapJson);
else if (flag("new")) {
  game.create({ json: mapJson });
  game.removePlayer(game.state.player.id); // a server world has no player of its own
} else {
  say("no save, and no --new");
  process.exit(3);
}
game.state.player = null; // nobody's screen is here
// Nobody is connected at boot: whoever the save has standing in the world (a crash or a hard stop saved them so) goes
// dormant, kept by their hash, until they rejoin; their grace was in the dead process's memory and would never run out.
let sleepers = 0;
for (const p of game.state.players.slice()) {
  const hash = Object.keys(store.owners).find((h) => store.owners[h] === p.id);
  const rec = hash ? game.takePlayer(p.id) : null;
  if (rec) { store.dormant[hash] = game.toSafe(rec); sleepers++; }
}
say(`${snap ? "restored" : "made"} ${store.name} (${mapName}): ${game.state.players.length} in the world, ${Object.keys(store.dormant).length} dormant (${sleepers} put to sleep at boot); rules ${JSON.stringify(rules.rules)}`);

// ---- saving ----
// A save stops the world while its text is made. Since 2026-10-15 (`02`, a save that costs what changed) that text
// comes from the save's cache, each chunk's kept until it changes (game.serializeText): an explored valley's save
// took 50 ms here and takes 5, its gzip (9 more) runs on Node's worker pool off the world's thread, and the file is
// written when the packing is done. Saves finish in the order they were made: one that finishes after a newer one
// was written is dropped, so the last save on the way down (packed at once) is never overwritten by an older one.
// While anyone plays it saves every few game minutes, and always at a join, a leave, a dormancy, a death, when the
// world empties, and on the way down. The rolling copy and the last save make the whole save afresh first and
// compare it with the cache (game.verifySaveCache): a chunk the cache had wrong is said in the log, loudly, and saved
// right; it names a change that marks nothing, for map.unsaved's list.
const SAVE_EVERY_GAME_S = 300;
const ROLLING_EVERY_MS = 10 * 60 * 1000;
const ROLLING_KEEP = 3;
const DAILY_KEEP = 7;
let lastSaveSim = loop.simTime();
let lastRollingAt = 0;
let stepsSinceSave = 0;

// Saves asked for in one tick come to one (the coder agent's review of step 4: a leave and the world's emptying, a
// dormancy and the exit, saved in pairs). `ifStepped`: one that is pointless when the world has not stepped since the
// last (the emptying of a world already saved). A join's save no longer borrows the welcome's snapshot: with the
// save's cache the second text of a tick costs a fraction of a millisecond.
let saveQueued = null;
let saveIfStepped = true;
function requestSave(why, { ifStepped = false } = {}) {
  if (stopping) return;
  if (saveQueued) {
    saveIfStepped = saveIfStepped && ifStepped;
    return;
  }
  saveQueued = why;
  saveIfStepped = ifStepped;
  setImmediate(() => {
    const w = saveQueued;
    const skip = saveIfStepped && stepsSinceSave === 0;
    saveQueued = null;
    if (stopping || skip) return;
    saveNow(w);
  });
}
// `last` and `max`: the world's pause, the text alone; `packMs`: the gzip and the writes after it, off the step.
const saveTimes = { last: 0, max: 0, packMs: 0, count: 0, lastKB: 0, lastAt: null, cacheMissed: 0 };
let saveSeq = 0; // each save's number as it is made
let writtenSeq = 0; // the newest save written: an older one finishing later is dropped

function writeAtomic(file, data) {
  const tmp = `${file}.tmp`;
  fs.writeFileSync(tmp, data);
  fs.renameSync(tmp, file);
}

// save.snapshot's shape as text, with the world's own fields.
function savedText(fresh = false) {
  const extra = { worldId, name: store.name, owners: store.owners, dormant: store.dormant, myPlayerId: null, server: true };
  return save.snapshotText(mapName, extra, { fresh });
}

// The cache proved (the rolling copy and the last save): a chunk it had wrong is said here and saved right.
function verifyCache() {
  const wrong = game.verifySaveCache();
  if (!wrong.length) return;
  saveTimes.cacheMissed += wrong.length;
  const w = wrong[0];
  say(`THE SAVE'S CACHE MISSED ${wrong.length} chunk${wrong.length === 1 ? "" : "s"} (saved right now; a change marked nothing, see map.unsaved): the first ${w.cx},${w.cy}, kept ${JSON.stringify(w.kept)}, now ${JSON.stringify(w.now)}`);
}

// `sync`: packed and written before it returns (the last save on the way down, a made world); otherwise the gzip runs
// off the world's thread and the file is written when it is done.
function saveNow(why, { sync = false, verify = false } = {}) {
  const t0 = performance.now();
  const now = Date.now();
  // The rolling copies guard against a bad save of our own making, which a snapshot taken after it would keep.
  const rolling = now - lastRollingAt >= ROLLING_EVERY_MS;
  if (rolling) lastRollingAt = now;
  if (verify || rolling) verifyCache();
  const text = savedText();
  stepsSinceSave = 0;
  lastSaveSim = loop.simTime();
  const paused = performance.now() - t0;
  const seq = ++saveSeq;
  const finish = (gz) => {
    if (seq <= writtenSeq) return; // a newer save is already on disk
    writtenSeq = seq;
    writeSaved(why, gz, now, rolling, paused, t0);
  };
  if (sync) return finish(zlib.gzipSync(text));
  zlib.gzip(text, (err, gz) => {
    if (err) return say(`the save (${why}) could not be packed: ${err.message}`);
    try {
      finish(gz);
    } catch (e) {
      say(`the save (${why}) could not be written: ${e.message}`);
    }
  });
}

function writeSaved(why, gz, now, rolling, paused, t0) {
  writeAtomic(SAVE, gz);
  if (rolling) {
    writeAtomic(path.join(dir, "rolling", `${now}.json.gz`), gz);
    const kept = fs.readdirSync(path.join(dir, "rolling")).filter((f) => f.endsWith(".json.gz")).sort();
    for (const f of kept.slice(0, Math.max(0, kept.length - ROLLING_KEEP))) fs.rmSync(path.join(dir, "rolling", f));
  }
  const day = new Date(now).toISOString().slice(0, 10);
  const daily = path.join(dir, "daily", `${day}.json.gz`);
  if (!fs.existsSync(daily)) {
    writeAtomic(daily, gz);
    const days = fs.readdirSync(path.join(dir, "daily")).filter((f) => f.endsWith(".json.gz")).sort();
    for (const f of days.slice(0, Math.max(0, days.length - DAILY_KEEP))) fs.rmSync(path.join(dir, "daily", f));
  }
  saveTimes.last = Math.round(paused * 10) / 10;
  saveTimes.max = Math.max(saveTimes.max, saveTimes.last);
  saveTimes.packMs = Math.round(performance.now() - t0 - paused);
  saveTimes.count++;
  saveTimes.lastKB = Math.round(gz.length / 1024);
  saveTimes.lastAt = new Date(now).toISOString();
  say(`saved (${why}): ${saveTimes.lastKB} KB, the world paused ${saveTimes.last} ms, packed and written in ${saveTimes.packMs} more`);
}

if (makeOnly) {
  saveNow("made", { sync: true });
  process.exit(0);
}

// ---- the host ----
host.init({ cap: () => tuning.world.playerCapServer, store: () => store, save: () => requestSave("an event"), self: () => null, arrived: () => {} });
host.install();

let stopping = false;
function shutdown(why, exitCode = 0) {
  if (stopping) return;
  stopping = true;
  // Everyone still in the world goes dormant, kept by their hash, so a rejoin finds them where they stood (the
  // grace counts game time, which stands while the world is held, so it would never run out on its own).
  const standing = game.state.players.length;
  for (const p of game.state.players.slice()) host.dormantNow(p.id);
  try {
    if (standing || stepsSinceSave > 0 || !saveTimes.count) saveNow(why, { sync: true, verify: true });
    else say(`nothing changed since the last save (${why})`);
  } catch (err) {
    say(`the last save failed: ${err.message}`);
    exitCode = exitCode || 1;
  }
  net.close();
  say(`stopping: ${why}`);
  setTimeout(() => process.exit(exitCode), 50);
}

// A crash never overwrites the good save (the coder agent's review of step 3): the state the process had goes to its
// own file beside save.json.gz, which stays the last good one, and the process exits for the relay to see. The world
// as it was at the last save is what the next join boots; the crash file is for a person to read.
function crashed(why, err) {
  if (stopping) return;
  stopping = true;
  say(`the world threw (${why}): ${err && err.stack ? err.stack : err}`);
  try {
    const file = path.join(dir, `crash-${Date.now()}.json.gz`);
    fs.writeFileSync(file, zlib.gzipSync(savedText(true))); // afresh: the cache is not trusted at a crash
    say(`the state at the crash is in ${path.basename(file)}; save.json.gz is the last good save`);
    const kept = fs.readdirSync(dir).filter((f) => /^crash-\d+\.json\.gz$/.test(f)).sort();
    for (const f of kept.slice(0, Math.max(0, kept.length - 5))) fs.rmSync(path.join(dir, f)); // the newest five are enough to read
  } catch (e) {
    say(`the state at the crash could not be written: ${e && e.message}`);
  }
  try { net.close(); } catch { /* going */ }
  setTimeout(() => process.exit(1), 50);
}
process.on("uncaughtException", (err) => crashed("uncaughtException", err));
process.on("unhandledRejection", (err) => crashed("unhandledRejection", err));

// The owner (item 5's fifth and sixth steps): a join that says the key whose SHA-256 meta.json keeps is the owner's,
// and takes the character filed under "owner" on every device. The key proves who may; it names nothing, so a new key
// issued with the creator key (a lost one) finds the same character. Read at each join, so a new key counts at once;
// compared in constant time; the key is never written down or logged.
const OWNER_HASH = "owner";
function ownerHash(key) {
  const meta = readMeta();
  if (typeof meta.ownerKeyHash !== "string") return null;
  const h = crypto.createHash("sha256").update(String(key)).digest("hex");
  const a = Buffer.from(h);
  const b = Buffer.from(meta.ownerKeyHash);
  return a.length === b.length && crypto.timingSafeEqual(a, b) ? OWNER_HASH : null;
}

// A browser the owner removed is barred until the owner lets it back (the meta's list, read at each join).
function isBarred(hash) {
  return !!hash && (readMeta().barred || []).some((b) => b && b.hash === hash);
}

net.setRelay(relayUrl);
net.setHostSecret(process.env.CMZ_HOST_SECRET || null);
net.init({ host: code }, {
  ...host.netHooks(),
  guestJoined: () => requestSave("a join"),
  ownerHash,
  isBarred,
  buildId: () => process.env.CMZ_BUILD_ID || "dev", // the image's stamp (Dockerfile): a page of another build is refused
  // The welcome gzipped (the review of step 3): a well-explored world is 4.6 MB raw to every joiner, about 200 KB packed.
  packWelcome: (text) => zlib.gzipSync(text).toString("base64"), // the save's text, from its cache (game.serializeText)
  message: (text) => say(text),
  failed: (_code, why) => shutdown(`the relay: ${why}`, 2),
});

// ---- the loop: a plain Node timer, the same fixed step a browser runs ----
const idle = game.idleSnapshot();
const held = () => !net.hasGuests();
loop.init({
  update: (dt) => {
    game.begin(dt);
    game.step(dt, net.hostStep(idle, null));
    net.hostAfterStep();
    loop.setHeld(held());
    stepsSinceSave++;
    if (loop.simTime() - lastSaveSim >= SAVE_EVERY_GAME_S) requestSave("five game minutes");
  },
  render: () => {},
  pump: () => {
    net.hostStep(idle, null); // held: a join is heard, nothing moves
    loop.setHeld(held());
  },
  crash: (err) => crashed("the step", err),
});
loop.setHeld(held());
let emptySince = Date.now();
setInterval(() => {
  if (stopping) return;
  loop.drive(performance.now());
  if (net.hasGuests()) emptySince = 0;
  else if (!emptySince) {
    emptySince = Date.now();
    requestSave("the world emptied", { ifStepped: true });
  } else if (Date.now() - emptySince >= EMPTY_EXIT_S * 1000) shutdown("empty");
}, 16);

for (const sig of ["SIGTERM", "SIGINT"]) process.on(sig, () => shutdown(sig));
// The relay asks its children to stop over the fork's channel: a signal reaches no handler on Windows, and the channel
// is the same everywhere.
process.on("message", (m) => {
  if (!m) return;
  if (m.type === "stop") return shutdown(`the relay asked (${m.why || "stopping"})`);
  const reply = (body) => process.send && process.send({ type: "reply", id: m.id, ...body });
  if (m.type === "code" && typeof m.code === "string") {
    // The owner changed the code (item 5's sixth step): the relay has moved the room; the world only knows the new name.
    net.renameCode(m.code);
    say("the owner changed the code");
    return reply({ ok: true });
  }
  if (m.type === "rules" && m.rules && typeof m.rules === "object") {
    // The owner's rules: the world reads them from the next step, and every guest's frame carries them.
    // Not Trees nor the Starting population: they are chosen when a world is made and shape what is placed (#130).
    for (const k of Object.keys(rules.rules)) if (!rules.FIXED.includes(k) && typeof m.rules[k] === "boolean") worldRules[k] = m.rules[k];
    rules.refresh();
    requestSave("the owner's rules");
    say(`the owner set the rules: ${JSON.stringify(rules.rules)}`);
    return reply({ ok: true, rules: { ...rules.rules } });
  }
  if (m.type === "remove" && typeof m.playerId === "string") {
    // A player removed by the owner: told so and let go from the wire, its character dormant under its hash (the
    // relay bars that hash). Never the owner.
    const hash = Object.keys(store.owners).find((h) => store.owners[h] === m.playerId) || null;
    if (!hash) return reply({ refused: "no such player in that world" });
    if (hash === OWNER_HASH) return reply({ refused: "the owner cannot be removed" });
    const p = game.state.players.find((q) => q.id === m.playerId) || null;
    const rec = store.dormant[hash] || null;
    const body = game.state.corpses.find((c) => c.id === m.playerId && c.kind === "player") || null; // a fallen player is a body (main's 57ccdfa)
    const name = (p && p.name) || (rec && rec.name) || (body && body.name) || m.playerId;
    net.letGo(m.playerId, "removed");
    if (p) host.dormantNow(m.playerId);
    say(`the owner removed ${name}`);
    return reply({ ok: true, hash, name });
  }
});

// ---- the debug endpoint, on 127.0.0.1 alone and only when asked for ----
if (debugPort) {
  const sync = await import(pathToFileURL(path.join(root, "tools/checks/sync.js")).href);
  http.createServer(async (req, res) => {
    const send = (body) => {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify(body));
    };
    if (req.url === "/status") {
      const st = net.status();
      return send({ world: store.name, code: st.code, guests: st.guests, held: loop.isHeld(), tick: st.tick, simTime: loop.simTime(), players: game.state.players.map((p) => p.id), dormant: Object.keys(store.dormant).length, chunks: map.chunkCount(), rssMB: Math.round(process.memoryUsage().rss / 1048576), heapMB: Math.round(process.memoryUsage().heapUsed / 1048576), save: saveTimes, wire: st.wire });
    }
    if (req.url === "/sync/on") {
      net.setSyncReports(true);
      return send({ on: true });
    }
    if (req.url === "/sync") return send(await sync.run({ net }));
    if (req.url === "/stop") { send({ stopping: true }); return shutdown("a debug stop (the path a deploy's SIGTERM takes)"); }
    if (req.url === "/throw") { send({ throwing: true }); setTimeout(() => { throw new Error("a debug throw (the crash path)"); }, 10); return; }
    res.writeHead(404);
    res.end();
  }).listen(Number(debugPort), "127.0.0.1", () => say(`debug on 127.0.0.1:${debugPort}`));
}
