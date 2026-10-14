// A server world (item 5's third step, 2026-10-14, `02`; the plan in docs/31 and the ruling at 02's top): one
// world, booted headless from its save, joining the relay as that world's host over a WebSocket with the same
// wire (src/net.js) and the same host (src/host.js) a browser host runs. Everyone in it is a guest; it has no
// player of its own and no screen. On while anyone is in it; held when it empties (nothing moves, the clock
// stands, the wire still answers so a join wakes it); after a spell empty and saved, it exits, so an empty world
// costs nothing. One process per world, so a crash takes down one world.
//
//   node server/world.js --dir <folder> --code <join code> --relay ws://localhost:8013 [--new] [--name <name>]
//                        [--empty-exit <seconds>] [--debug-port <port>]
//
// The folder holds the world's files: save.json.gz (the browser's snapshot shape, gzipped: a well-explored
// world's 4.4 MB is 190 KB), rolling/ (a copy at most every ten minutes, the last three kept), and daily/ (one a
// day, seven kept). `--new` makes a fresh world from the map when there is no save (for the checks; a world comes
// to the server from a browser in step 5). `--debug-port` answers /status, /sync/on, /sync, and /stop on 127.0.0.1 alone,
// and only when given (the coder agent's hardening: the debug endpoint behind a flag).

import fs from "node:fs";
import path from "node:path";
import http from "node:http";
import zlib from "node:zlib";
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
const code = arg("code");
const relayUrl = arg("relay", "ws://localhost:8080");
const EMPTY_EXIT_S = Number(arg("empty-exit", 600)); // ten minutes empty and saved, then gone
const debugPort = arg("debug-port") || process.env.CMZ_DEBUG_PORT || null;
if (!dir || !code) {
  console.error("usage: node server/world.js --dir <folder> --code <join code> --relay <ws url> [--new]");
  process.exit(64);
}
fs.mkdirSync(path.join(dir, "rolling"), { recursive: true });
fs.mkdirSync(path.join(dir, "daily"), { recursive: true });

const say = (text) => console.log(`${new Date().toISOString()} [${path.basename(dir)}] ${text}`);

// ---- the world ----
const boot = await bootData(root);
const imp = (p) => import(pathToFileURL(path.join(root, p)).href);
const [game, loop, net, host, rules, save, map] = await Promise.all([
  imp("src/game.js"), imp("src/loop.js"), imp("src/net.js"), imp("src/host.js"), imp("src/rules.js"), imp("src/save.js"), imp("src/map.js"),
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
const mapJson = boot.map(mapName);
// Whose character is whose (host.js's store): a browser id's hash, or the owner key's, to the player it made;
// the dormant records by the same hashes; the world's name for the welcome's bookmark.
const store = { name: (snap && snap.name) || arg("name", "A server world"), owners: { ...((snap && snap.owners) || {}) }, dormant: { ...((snap && snap.dormant) || {}) } };
const worldId = (snap && snap.worldId) || path.basename(dir);
// The world's own rules, which the settings never touch (item 5's second step): as saved, else the defaults.
const worldRules = { ...rules.DEFAULTS, ...((snap && snap.rules) || {}) };
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
const ROLLING_EVERY_MS = 10 * 60 * 1000;
const ROLLING_KEEP = 3;
const DAILY_KEEP = 7;
let lastSaveSim = loop.simTime();
let lastRollingAt = 0;

function writeAtomic(file, data) {
  const tmp = `${file}.tmp`;
  fs.writeFileSync(tmp, data);
  fs.renameSync(tmp, file);
}

function saveNow(why) {
  const s = save.snapshot(mapName, { worldId, name: store.name, owners: store.owners, dormant: store.dormant, myPlayerId: null, server: true });
  const gz = zlib.gzipSync(JSON.stringify(s));
  writeAtomic(SAVE, gz);
  lastSaveSim = loop.simTime();
  const now = Date.now();
  // The rolling copies guard against a bad save of our own making, which a snapshot taken after it would keep.
  if (now - lastRollingAt >= ROLLING_EVERY_MS) {
    lastRollingAt = now;
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
  say(`saved (${why}): ${Math.round(gz.length / 1024)} KB`);
}

// ---- the host ----
host.init({ store: () => store, save: () => saveNow("an event"), self: () => null, arrived: () => {} });
host.install();

let stopping = false;
function shutdown(why, exitCode = 0) {
  if (stopping) return;
  stopping = true;
  // Everyone still in the world goes dormant, kept by their hash, so a rejoin finds them where they stood (the
  // grace counts game time, which stands while the world is held, so it would never run out on its own).
  for (const p of game.state.players.slice()) host.dormantNow(p.id);
  try {
    saveNow(why);
  } catch (err) {
    say(`the last save failed: ${err.message}`);
    exitCode = exitCode || 1;
  }
  net.close();
  say(`stopping: ${why}`);
  setTimeout(() => process.exit(exitCode), 50);
}

net.setRelay(relayUrl);
net.init({ host: code }, {
  ...host.netHooks(),
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
    if (loop.simTime() - lastSaveSim >= 60) saveNow("a game minute");
  },
  render: () => {},
  pump: () => {
    net.hostStep(idle, null); // held: a join is heard, nothing moves
    loop.setHeld(held());
  },
  crash: (err) => {
    say(`the world threw: ${err && err.stack ? err.stack : err}`);
    shutdown("a crash", 1);
  },
});
loop.setHeld(held());
let emptySince = Date.now();
setInterval(() => {
  if (stopping) return;
  loop.drive(performance.now());
  if (net.hasGuests()) emptySince = 0;
  else if (!emptySince) {
    emptySince = Date.now();
    saveNow("the world emptied");
  } else if (Date.now() - emptySince >= EMPTY_EXIT_S * 1000) shutdown("empty");
}, 16);

for (const sig of ["SIGTERM", "SIGINT"]) process.on(sig, () => shutdown(sig));

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
      return send({ world: store.name, code: st.code, guests: st.guests, held: loop.isHeld(), tick: st.tick, simTime: loop.simTime(), players: game.state.players.map((p) => p.id), dormant: Object.keys(store.dormant).length, chunks: map.chunkCount(), rssMB: Math.round(process.memoryUsage().rss / 1048576) });
    }
    if (req.url === "/sync/on") {
      net.setSyncReports(true);
      return send({ on: true });
    }
    if (req.url === "/sync") return send(await sync.run({ net }));
    if (req.url === "/stop") { send({ stopping: true }); return shutdown("a debug stop (the path a deploy's SIGTERM takes)"); }
    res.writeHead(404);
    res.end();
  }).listen(Number(debugPort), "127.0.0.1", () => say(`debug on 127.0.0.1:${debugPort}`));
}
