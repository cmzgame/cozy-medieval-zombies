// The relay (docs/31/04, the transport; ruled 2026-10-13, docs/02): a small Node process the host
// and its guests connect to over WebSocket, so friends anywhere join a world hosted in a browser
// tab with nothing but the site's URL and the host's code. It is the lobby and the pipe: the host
// registers a code, guests name it, and from then on everything the host sends goes to its guests
// (to one of them when the message names `to`) and everything a guest sends goes to its host, with
// `from` stamped here so a guest is who the relay says it is. The relay reads none of it. The same
// shapes cross the two-tab loopback (src/net.js), so the game does not know which it is on.
//
// No dependency: the WebSocket handshake and framing are the hundred lines below (RFC 6455), in the
// repo's own style, as docs/31/05 allowed. Text frames only, since the game speaks JSON.
//
//   node server/relay.js            on port 8012 (or $PORT, which hosting tiers set)
//   node server/relay.js 9000       on another port
//
// The GitHub Pages site is https, so a browser there opens only wss://: run this behind something
// that gives TLS (a hosting tier's own front door, or a tunnel from a machine), and put that
// address in src/net.js RELAY_URL or on the URL as ?relay=wss://... (docs/31/07, question 20).
// A plain GET answers with the room count, which is also how a hosting tier's health check sees it.
//
// Server worlds (item 5's fourth step, 2026-10-14, `02`): with DATA_DIR set, the relay is also the keeper of the
// worlds that live on the server, one folder each under DATA_DIR/worlds/<worldId>/ (meta.json with the code's
// SHA-256, never the code; save.json.gz and its copies, which the world's own process writes). A guest naming a
// server world's code starts that world's process (server/world.js, one per world, a heap limit each, at most
// CMZ_MAX_RUNNING at once) and waits until it registers; the world holds itself when it empties and exits after a
// spell, so an asleep world costs nothing. The code of a server world is reserved: only the relay's own child, with
// the secret the relay handed it, may register as its host, even while the world sleeps. A world is found by its
// code's hash, so no path is ever built from what a client sends. On SIGTERM or SIGINT (a deploy, Fly stopping the
// idle machine) every world is asked to save and stop before the relay goes. CMZ_DEBUG=1 adds /debug/worlds and
// /debug/stop, answered to the machine itself alone.

import http from "node:http";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fork } from "node:child_process";
import { fileURLToPath } from "node:url";
import zlib from "node:zlib";

const PORT = Number(process.env.PORT || process.argv[2] || 8012);
const GUID = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11";
const MAX_MESSAGE = 16 * 1024 * 1024; // the welcome is a whole save, under a megabyte today
const PING_EVERY_MS = 30000;
const LOOKUPS_PER_MINUTE = 120; // per address: /open answers and refused joins (nohost, taken), so a code cannot be scanned (the review, 2026-10-13); a Worlds screen asks for every bookmarked code every ten seconds, so thirty was too few, and at 120 a scan of the code space takes years

const lookups = new Map(); // address -> { count, since }

// The address a client cannot choose: Fly's own header, else the last hop a proxy appended (the first
// X-Forwarded-For value is whatever the client sent, and would let a scan start afresh with every request),
// else the socket's.
function addressOf(req) {
  const fly = req.headers["fly-client-ip"];
  if (fly) return String(fly).trim();
  const fwd = String(req.headers["x-forwarded-for"] || "").split(",").map((s) => s.trim()).filter(Boolean);
  return fwd.length ? fwd[fwd.length - 1] : req.socket.remoteAddress || "";
}

function overLimit(address) {
  const now = Date.now();
  let l = lookups.get(address);
  if (!l || now - l.since > 60000) {
    l = { count: 0, since: now };
    lookups.set(address, l);
  }
  l.count++;
  return l.count > LOOKUPS_PER_MINUTE;
}

const DEAD_AFTER_MS = 90000;

const rooms = new Map(); // code -> { host: Conn, guests: Map<id, Conn> }
let nextId = 1;

// ---- the server worlds ----

const DATA_DIR = process.env.DATA_DIR || null;
const WORLDS = DATA_DIR ? path.join(DATA_DIR, "worlds") : null;
const WORLD_JS = path.join(path.dirname(fileURLToPath(import.meta.url)), "world.js");
const MAX_RUNNING = Math.max(1, Number(process.env.CMZ_MAX_RUNNING || 3)); // the 512 MB machine: the relay, three worlds, and room for one upload's check (step 5)
const WORLD_HEAP_MB = Number(process.env.CMZ_WORLD_HEAP_MB || 192); // a well-explored world's heap is under a hundred
const WORLD_ID = /^w[a-z0-9]{6,40}$/; // made by the server alone; a folder named otherwise is not a world
const META_MAX = 64 * 1024; // a meta.json larger than this is not ours: not parsed
const CRASHES_BEFORE_REST = 3;
const CRASH_WINDOW_MS = 10 * 60 * 1000;
const STOP_WAIT_MS = 20000; // a deploy's grace for every world to save (fly.toml's kill_timeout covers it)
const DEBUG = process.env.CMZ_DEBUG === "1";

// ---- moving a world: up from a browser, and home again (item 5's fifth step) ----
// Two locks (docs/02, the plan): making a server world needs the creator key, a Fly secret only Michael hands out
// (CREATOR_KEY; unset, the server takes no worlds); a world's own powers need its owner key, minted at the upload and
// shown once, of which the disk keeps only the SHA-256. The keys are the locks. CORS answers only the game's own site
// and localhost, which keeps other sites' pages from using these through a visitor's browser (a script can send any
// Origin, so it is no lock). An upload is capped compressed before a byte is parsed and capped again unpacked (a zip
// bomb stops at the cap), names one of the server's own maps, and is restored by a world process before it is
// accepted; the check counts against the running cap. The owner's powers (item 5's sixth step) are endpoints the owner
// key opens: the world's players and rules (/worlds/owner), a new code (/worlds/rotate), the rules (/worlds/rules), a
// player removed and barred (/worlds/remove, /worlds/unbar), and home (/worlds/home and /worlds/home/confirm); a lost
// owner key is replaced with the creator key (/worlds/rekey).
const CREATOR_KEY = process.env.CREATOR_KEY || null;
const SITE_ORIGIN = process.env.CMZ_SITE_ORIGIN || "https://michaeldippold.github.io";
const MAX_UPLOAD = 4 * 1024 * 1024; // compressed: a well-explored world is about 200 KB
const MAX_UNPACKED = 64 * 1024 * 1024; // the same save unpacked is about 4.5 MB
const MAX_SMALL_BODY = 4096; // the return home's words
const MAX_STORED = Math.max(1, Number(process.env.CMZ_MAX_WORLDS || 5));
const LEAVING_MS = Number(process.env.CMZ_LEAVING_MS || 10 * 60 * 1000); // a world on its way home waits this long for the browser's word that it arrived
const OWNER_HASH = "owner"; // where a server world files its owner's character: the owner key proves who may take it (server/world.js)
const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const TRASH_KEEP_MS = 7 * 24 * 3600 * 1000;
const TRASH = DATA_DIR ? path.join(DATA_DIR, "trash") : null;
const STAGING = DATA_DIR ? path.join(DATA_DIR, "staging") : null;
const UPLOADS_PER_HOUR = Math.max(1, Number(process.env.CMZ_UPLOADS_PER_HOUR || 10)); // per address, every try counted, a refused one too (a guessed creator key costs a try)
const uploads = new Map(); // address -> { count, since }

const sha256 = (s) => crypto.createHash("sha256").update(s).digest("hex");

function originAllowed(origin) {
  if (!origin) return false;
  return origin === SITE_ORIGIN || /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin);
}

function uploadLimited(address) {
  const now = Date.now();
  let u = uploads.get(address);
  if (!u || now - u.since > 3600000) {
    u = { count: 0, since: now };
    uploads.set(address, u);
  }
  u.count++;
  return u.count > UPLOADS_PER_HOUR;
}

// A request's body, refused past `cap` before it is all read.
function readBody(req, cap) {
  return new Promise((resolve, reject) => {
    const declared = Number(req.headers["content-length"] || 0);
    if (declared > cap) return reject(Object.assign(new Error("too large"), { status: 413 }));
    const parts = [];
    let total = 0;
    req.on("data", (c) => {
      total += c.length;
      if (total > cap) {
        req.destroy();
        reject(Object.assign(new Error("too large"), { status: 413 }));
      } else parts.push(c);
    });
    req.on("end", () => resolve(Buffer.concat(parts)));
    req.on("error", reject);
  });
}

function storedCount() {
  scanWorlds(true);
  return serverWorlds.size;
}

function readMeta(dir) {
  return JSON.parse(fs.readFileSync(path.join(dir, "meta.json"), "utf8"));
}

function writeMeta(dir, meta) {
  const file = path.join(dir, "meta.json");
  fs.writeFileSync(`${file}.tmp`, JSON.stringify(meta, null, 1));
  fs.renameSync(`${file}.tmp`, file);
}

// The world a code names and the owner key proves, or a reason it is not.
function ownedWorld(code, key) {
  const w = typeof code === "string" ? serverWorldFor(code.trim().toLowerCase().slice(0, 32)) : null;
  if (!w) return { status: 404, error: "no such world" };
  let meta;
  try {
    meta = readMeta(w.dir);
  } catch {
    return { status: 404, error: "no such world" };
  }
  if (typeof key !== "string" || !meta.ownerKeyHash || !sameSecret(sha256(key), meta.ownerKeyHash)) return { status: 403, error: "not the owner key" };
  return { w, meta };
}

// A world's map name, checked against the server's own maps (the coder agent's review of step 5: an upload naming
// "../../server/../data/maps/valley" was taken, and every wake read it again): a plain name, and the file there.
const MAP_NAME = /^[a-z][a-z0-9_-]{0,31}$/;
function mapOk(name) {
  return typeof name === "string" && MAP_NAME.test(name) && fs.existsSync(path.join(ROOT, "data", "maps", `${name}.json`));
}

// A world's process asked to save and stop, and waited for.
function stopWorld(worldId, why) {
  const r = running.get(worldId);
  if (!r) return Promise.resolve();
  return new Promise((resolve) => {
    r.child.once("exit", () => resolve());
    try {
      r.child.send({ type: "stop", why });
    } catch {
      resolve();
    }
    setTimeout(() => { r.child.kill("SIGKILL"); resolve(); }, STOP_WAIT_MS).unref();
  });
}

// A word to a running world over the fork's channel, and its answer (or null when it has none to give in time).
let askId = 1;
function askWorld(worldId, msg) {
  const r = running.get(worldId);
  if (!r) return Promise.resolve(null);
  const id = askId++;
  return new Promise((resolve) => {
    const onMsg = (m) => {
      if (m && m.type === "reply" && m.id === id) {
        r.child.off("message", onMsg);
        resolve(m);
      }
    };
    r.child.on("message", onMsg);
    try {
      r.child.send({ ...msg, id });
    } catch {
      r.child.off("message", onMsg);
      resolve(null);
    }
    setTimeout(() => { r.child.off("message", onMsg); resolve(null); }, 5000).unref();
  });
}

// A world's save as the disk has it (the players and whose they are, for the owner's screen and a removal while asleep).
function readSave(dir) {
  return JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(dir, "save.json.gz")), { maxOutputLength: MAX_UNPACKED }).toString("utf8"));
}

// The players a world knows, by name, for its owner: everyone filed in its owners, standing or dormant; the owner's
// own character first and marked.
function playersOf(save) {
  const byId = new Map();
  for (const c of (save.characters && save.characters.players) || []) byId.set(c.id, c);
  for (const r of Object.values(save.dormant || {})) if (r && r.id) byId.set(r.id, r);
  // A fallen player is a body among the corpses (main's 57ccdfa, 2026-10-14): named and marked dead from it.
  for (const b of (save.characters && save.characters.corpses) || []) if (b && b.kind === "player" && b.id) byId.set(b.id, { ...b, dead: true });
  return Object.entries(save.owners || {}).map(([hash, id]) => ({ playerId: id, name: (byId.get(id) && byId.get(id).name) || id, owner: hash === OWNER_HASH, dead: !!(byId.get(id) && byId.get(id).dead) }));
}

// The rules an owner may set: the five, each true or false (src/rules.js), nothing else.
const RULE_KEYS = ["zombieAggro", "zombiesAttackVillagers", "multiHit", "survival", "freeBuilding"];
function cleanRules(raw) {
  const out = {};
  if (raw && typeof raw === "object") for (const k of RULE_KEYS) if (typeof raw[k] === "boolean") out[k] = raw[k];
  return out;
}

// A save checked by booting it: the world process restores it and writes it again (`--make-only`), counted against the
// running cap while it does.
function restoreTest(dir) {
  return new Promise((resolve) => {
    const id = `check-${path.basename(dir)}`;
    const child = fork(WORLD_JS, ["--dir", dir, "--make-only"], { execArgv: [`--max-old-space-size=${WORLD_HEAP_MB}`], stdio: ["ignore", "inherit", "inherit", "ipc"] });
    running.set(id, { child, code: null, secret: null, pending: new Set(), startedAt: Date.now(), debugPort: null, worldId: id, checking: true });
    const done = (ok) => {
      running.delete(id);
      resolve(ok);
    };
    child.on("exit", (exitCode) => done(exitCode === 0));
    child.on("error", () => done(false));
    setTimeout(() => { child.kill("SIGKILL"); }, 60000).unref();
  });
}

async function handleWorlds(req, res, url, address) {
  const origin = req.headers.origin || "";
  const head = { "content-type": "application/json", "cache-control": "no-store", vary: "origin" };
  if (originAllowed(origin)) Object.assign(head, { "access-control-allow-origin": origin, "access-control-allow-headers": "content-type, x-creator-key, x-owner-key", "access-control-allow-methods": "POST, OPTIONS", "access-control-max-age": "600" });
  const answer = (status, body) => {
    res.writeHead(status, head);
    res.end(JSON.stringify(body));
  };
  if (req.method === "OPTIONS") return answer(originAllowed(origin) ? 204 : 403, {});
  if (req.method !== "POST") return answer(405, { error: "post only" });
  // The Origin check keeps other sites' pages from using these through a visitor's browser; it is not a lock, since a
  // script can send any Origin it likes. The locks are the keys: the creator key to make a world, the owner key for a
  // world's own powers (the coder agent's review of step 5).
  if (!originAllowed(origin)) return answer(403, { error: "not from the game's site" });
  if (!WORLDS) return answer(503, { error: "this relay keeps no worlds" });
  try {
    if (url.pathname === "/worlds") {
      // ---- the upload: a browser world becomes a server world ----
      if (!CREATOR_KEY) return answer(503, { error: "this server takes no worlds" });
      if (uploadLimited(address)) return answer(429, { error: "slow down" });
      if (!sameSecret(String(req.headers["x-creator-key"] || ""), CREATOR_KEY)) return answer(403, { error: "not the creator key" });
      if (storedCount() >= MAX_STORED) return answer(409, { error: "the server holds as many worlds as it may" });
      if (running.size >= MAX_RUNNING) return answer(503, { error: "busy" });
      const body = await readBody(req, MAX_UPLOAD);
      let up;
      try {
        up = JSON.parse(zlib.gunzipSync(body, { maxOutputLength: MAX_UNPACKED }).toString("utf8"));
      } catch (err) {
        return answer(err && err.code === "ERR_BUFFER_TOO_LARGE" ? 413 : 400, { error: err && err.code === "ERR_BUFFER_TOO_LARGE" ? "too large unpacked" : "not a gzipped world" });
      }
      const snap = up && up.snap;
      if (!snap || typeof snap !== "object" || !Number.isInteger(snap.version) || !snap.map || typeof snap.map !== "object" || !snap.characters || typeof snap.characters !== "object") return answer(422, { error: "not a world" });
      if (!mapOk(snap.mapName)) return answer(422, { error: "not one of the server's maps" });
      // The ids and the keys are the server's own, from the crypto source; nothing the browser sent names a path.
      const worldId = `w${crypto.randomBytes(8).toString("hex")}`;
      const code = mintCode();
      const ownerKey = crypto.randomBytes(24).toString("base64url");
      // The owner's character, filed under the browser's id in the upload, refiled under the owner's own entry, so it
      // follows the owner key to any device (Michael, 2026-10-14) and stays put when a new key is issued.
      const owners = snap.owners && typeof snap.owners === "object" ? { ...snap.owners } : {};
      const dormant = snap.dormant && typeof snap.dormant === "object" ? { ...snap.dormant } : {};
      delete owners[OWNER_HASH];
      delete dormant[OWNER_HASH];
      const ownerPlayerId = typeof up.ownerPlayerId === "string" ? up.ownerPlayerId : null;
      const was = ownerPlayerId ? Object.keys(owners).find((h) => owners[h] === ownerPlayerId) : null;
      if (was) {
        owners[OWNER_HASH] = owners[was];
        delete owners[was];
        if (dormant[was]) {
          dormant[OWNER_HASH] = dormant[was];
          delete dormant[was];
        }
      }
      const name = String(snap.name || "A world").replace(/[\u0000-\u001f]/g, "").slice(0, 60);
      const stored = { ...snap, worldId, name, code: null, open: false, owners, dormant, myPlayerId: null, server: true };
      const stage = path.join(STAGING, worldId);
      fs.mkdirSync(stage, { recursive: true });
      fs.writeFileSync(path.join(stage, "save.json.gz"), zlib.gzipSync(JSON.stringify(stored)));
      const ok = await restoreTest(stage);
      if (!ok) {
        fs.rmSync(stage, { recursive: true, force: true });
        return answer(422, { error: "the save would not restore" });
      }
      writeMeta(stage, { worldId, name, codeHash: hashCode(code), ownerKeyHash: sha256(ownerKey), created: new Date().toISOString(), from: "upload", rules: cleanRules(snap.rules), barred: [] });
      fs.mkdirSync(WORLDS, { recursive: true });
      fs.renameSync(stage, path.join(WORLDS, worldId));
      scanWorlds(true);
      log(`world ${worldId} moved up (${Math.round(body.length / 1024)} KB)`);
      return answer(201, { worldId, code, ownerKey, ownerHash: OWNER_HASH, name });
    }

    const body = await readBody(req, MAX_SMALL_BODY);
    let msg;
    try {
      msg = JSON.parse(body.toString("utf8"));
    } catch {
      return answer(400, { error: "not JSON" });
    }
    if (!msg || typeof msg !== "object") return answer(400, { error: "not JSON" });

    if (url.pathname === "/worlds/rekey") {
      // ---- a lost owner key (the coder agent's review of the plan): the creator key issues a new one, and the old one
      // stops working; the owner's character stays where it is filed ----
      if (!CREATOR_KEY) return answer(503, { error: "this server takes no worlds" });
      if (uploadLimited(address)) return answer(429, { error: "slow down" });
      if (!sameSecret(String(req.headers["x-creator-key"] || ""), CREATOR_KEY)) return answer(403, { error: "not the creator key" });
      const w = typeof msg.code === "string" ? serverWorldFor(msg.code.trim().toLowerCase().slice(0, 32)) : null;
      if (!w) return answer(404, { error: "no such world" });
      const meta = readMeta(w.dir);
      const ownerKey = crypto.randomBytes(24).toString("base64url");
      writeMeta(w.dir, { ...meta, ownerKeyHash: sha256(ownerKey) });
      log(`world ${w.worldId} has a new owner key`);
      return answer(200, { ownerKey, name: meta.name || "A world" });
    }

    const found = ownedWorld(msg.code, String(req.headers["x-owner-key"] || ""));
    if (!found.w) {
      overLimit(address);
      return answer(found.status, { error: found.error });
    }
    const { w, meta } = found;
    const awake = running.has(w.worldId) && !running.get(w.worldId).checking;

    if (url.pathname === "/worlds/owner") {
      // ---- the owner's screen: the world, its players, the barred, its rules ----
      let players = [];
      try {
        players = playersOf(readSave(w.dir));
      } catch {
        // no save to read: no players to show
      }
      return answer(200, { name: meta.name || "A world", awake, players, barred: (meta.barred || []).map((b) => ({ hash: b.hash, name: b.name })), rules: cleanRules(meta.rules) });
    }

    if (url.pathname === "/worlds/rotate") {
      // ---- a new join code: the old one stops working at once; whoever is in stays ----
      const code = mintCode();
      const old = running.get(w.worldId) ? running.get(w.worldId).code : null;
      writeMeta(w.dir, { ...meta, codeHash: hashCode(code) });
      scanWorlds(true);
      const r = running.get(w.worldId);
      if (r && old && rooms.has(old)) {
        const room = rooms.get(old);
        rooms.delete(old);
        rooms.set(code, room);
        room.host.code = code;
        for (const g of room.guests.values()) g.code = code;
        for (const g of r.pending) g.code = code;
        r.code = code;
        await askWorld(w.worldId, { type: "code", code });
      } else if (r) r.code = code;
      log(`world ${w.worldId} has a new code`);
      return answer(200, { code });
    }

    if (url.pathname === "/worlds/rules") {
      // ---- the world's rules, the owner's to set ----
      const rules = { ...cleanRules(meta.rules), ...cleanRules(msg.rules) };
      writeMeta(w.dir, { ...meta, rules });
      if (awake) await askWorld(w.worldId, { type: "rules", rules });
      return answer(200, { rules });
    }

    if (url.pathname === "/worlds/remove") {
      // ---- a player removed: out of the world now, and that browser barred until the owner lets it back. A bar by
      // browser id is undone by clearing the browser's storage, so the owner's screen offers a new code with it ----
      const playerId = typeof msg.playerId === "string" ? msg.playerId : null;
      if (!playerId) return answer(400, { error: "no player" });
      let hash = null;
      let name = playerId;
      if (awake) {
        const got = await askWorld(w.worldId, { type: "remove", playerId });
        if (got && got.refused) return answer(409, { error: got.refused });
        if (got) {
          hash = got.hash;
          name = got.name || name;
        }
      }
      if (!hash) {
        const save = readSave(w.dir);
        hash = Object.keys(save.owners || {}).find((h) => save.owners[h] === playerId) || null;
        const p = playersOf(save).find((q) => q.playerId === playerId);
        if (p) name = p.name;
      }
      if (!hash) return answer(404, { error: "no such player in that world" });
      if (hash === OWNER_HASH) return answer(409, { error: "the owner cannot be removed" });
      const barred = (meta.barred || []).filter((b) => b.hash !== hash);
      barred.push({ hash, name: String(name).slice(0, 40), at: new Date().toISOString() });
      writeMeta(w.dir, { ...meta, barred: barred.slice(-64) });
      log(`world ${w.worldId}: a player removed`);
      return answer(200, { removed: true, name });
    }

    if (url.pathname === "/worlds/unbar") {
      const hash = typeof msg.hash === "string" ? msg.hash : null;
      writeMeta(w.dir, { ...meta, barred: (meta.barred || []).filter((b) => b.hash !== hash) });
      return answer(200, { ok: true });
    }

    if (url.pathname === "/worlds/home") {
      // ---- home, the first phase: the world stopped and saved, its save sent, and the world held as leaving ----
      await stopWorld(w.worldId, "going home");
      const token = crypto.randomBytes(16).toString("hex");
      writeMeta(w.dir, { ...readMeta(w.dir), leaving: { tokenHash: sha256(token), until: Date.now() + LEAVING_MS } });
      const save = fs.readFileSync(path.join(w.dir, "save.json.gz"));
      log(`world ${w.worldId} is on its way home`);
      return answer(200, { token, ownerHash: OWNER_HASH, save: save.toString("base64") });
    }

    if (url.pathname === "/worlds/home/confirm") {
      // ---- home, the second phase: the browser has it; only now does the server let go (to the trash, seven days).
      // Not after the wait ran out: the world was joinable again, and play since would be lost (the review of step 5).
      const leaving = meta.leaving;
      if (!leaving || typeof msg.token !== "string" || !sameSecret(sha256(msg.token), leaving.tokenHash)) return answer(409, { error: "not on its way home" });
      if (!(leaving.until > Date.now())) return answer(409, { error: "the wait ran out" });
      fs.mkdirSync(TRASH, { recursive: true });
      fs.renameSync(w.dir, path.join(TRASH, `${w.worldId}-${Date.now()}`));
      scanWorlds(true);
      for (const t of fs.readdirSync(TRASH)) {
        try {
          if (Date.now() - fs.statSync(path.join(TRASH, t)).mtimeMs > TRASH_KEEP_MS) fs.rmSync(path.join(TRASH, t), { recursive: true, force: true });
        } catch {
          // gone already
        }
      }
      log(`world ${w.worldId} went home`);
      return answer(200, { ok: true });
    }
    return answer(404, { error: "no such path" });
  } catch (err) {
    return answer(err && err.status ? err.status : 500, { error: err && err.status === 413 ? "too large" : "the server could not do that" });
  }
}

// A join code in the game's own shape (src/net.js makeCode; server/worlds.js the same), from the crypto source.
const CODE_WORDS = ["oak", "elm", "ash", "yew", "fir", "hazel", "rowan", "thorn", "moss", "fern", "birch", "alder", "willow", "holly", "pine", "maple"];
const CODE_CHARS = "abcdefghjkmnpqrstuvwxyz23456789";
function mintCode() {
  const a = CODE_WORDS[crypto.randomInt(CODE_WORDS.length)];
  let b = CODE_WORDS[crypto.randomInt(CODE_WORDS.length)];
  if (b === a) b = CODE_WORDS[(CODE_WORDS.indexOf(a) + 1) % CODE_WORDS.length];
  let tail = "";
  for (let i = 0; i < 4; i++) tail += CODE_CHARS[crypto.randomInt(CODE_CHARS.length)];
  return `${a}-${b}-${tail}`;
}

const serverWorlds = new Map(); // the code's sha256 -> { worldId, dir, name }
const running = new Map(); // worldId -> { child, code, secret, pending: Set<Conn>, startedAt, debugPort }
const crashes = new Map(); // worldId -> the times it exited badly, lately
let scannedAt = 0;
let nextDebugPort = 8100;
let stoppingAll = false;

const hashCode = (code) => crypto.createHash("sha256").update(code).digest("hex");

// Equal strings in constant time, so a wrong secret says nothing by how long it took to refuse.
function sameSecret(a, b) {
  if (typeof a !== "string" || typeof b !== "string") return false;
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

// The worlds on the volume, by their codes' hashes. Read at boot and again (at most every five seconds) when a code
// is not found, so a world made while the relay runs is found.
function scanWorlds(force = false) {
  if (!WORLDS) return;
  const now = Date.now();
  if (!force && now - scannedAt < 5000) return;
  scannedAt = now;
  let names = [];
  try {
    names = fs.readdirSync(WORLDS);
  } catch {
    return;
  }
  serverWorlds.clear();
  for (const id of names) {
    if (!WORLD_ID.test(id)) continue;
    const metaFile = path.join(WORLDS, id, "meta.json");
    try {
      if (fs.statSync(metaFile).size > META_MAX) continue;
      const meta = JSON.parse(fs.readFileSync(metaFile, "utf8"));
      if (!meta || meta.worldId !== id || typeof meta.codeHash !== "string" || !/^[0-9a-f]{64}$/.test(meta.codeHash)) continue;
      serverWorlds.set(meta.codeHash, { worldId: id, dir: path.join(WORLDS, id), name: String(meta.name || "").slice(0, 60) });
    } catch {
      // not a world: no meta, or not ours
    }
  }
}

function serverWorldFor(code) {
  if (!WORLDS || !code) return null;
  const h = hashCode(code);
  if (!serverWorlds.has(h)) scanWorlds();
  return serverWorlds.get(h) || null;
}

// A world on its way home (the first phase answered, the browser's word not yet back) takes no joins, until the
// wait runs out and it is the server's again.
function leavingNow(w) {
  try {
    const meta = readMeta(w.dir);
    if (!meta.leaving) return false;
    if (meta.leaving.until > Date.now()) return true;
    // The wait ran out: the world is the server's again, and a join is taken; the old token is dropped, so a confirm
    // that comes late cannot let go of a world friends have played since (the coder agent's review of step 5).
    const { leaving, ...rest } = meta;
    writeMeta(w.dir, rest);
    return false;
  } catch {
    return false;
  }
}

function recentCrashes(worldId) {
  const list = (crashes.get(worldId) || []).filter((t) => Date.now() - t < CRASH_WINDOW_MS);
  crashes.set(worldId, list);
  return list.length;
}

// A server world's process, started for the code a guest named, with a secret only it is told.
function startWorld(w, code) {
  const secret = crypto.randomBytes(24).toString("hex");
  const env = { ...process.env, CMZ_CODE: code, CMZ_HOST_SECRET: secret, CMZ_RELAY: `ws://127.0.0.1:${PORT}` };
  delete env.CMZ_DEBUG_PORT;
  let debugPort = null;
  if (DEBUG) {
    debugPort = nextDebugPort++;
    env.CMZ_DEBUG_PORT = String(debugPort);
  }
  const child = fork(WORLD_JS, ["--dir", w.dir], { env, execArgv: [`--max-old-space-size=${WORLD_HEAP_MB}`], stdio: ["ignore", "inherit", "inherit", "ipc"] });
  const r = { child, code, secret, pending: new Set(), startedAt: Date.now(), debugPort, worldId: w.worldId };
  running.set(w.worldId, r);
  child.on("error", (err) => log(`world ${w.worldId}: ${err.message}`));
  child.on("exit", (exitCode, signal) => {
    running.delete(w.worldId);
    for (const g of r.pending) {
      g.sendJson({ type: "error", reason: "nohost" });
      g.close(1011);
    }
    r.pending.clear();
    if (exitCode !== 0) crashes.set(w.worldId, [...(crashes.get(w.worldId) || []), Date.now()]);
    log(`world ${w.worldId} exited (${exitCode ?? signal})`);
    if (stoppingAll && running.size === 0) finishStop();
  });
  log(`world ${w.worldId} starting${debugPort ? ` (debug on ${debugPort})` : ""}`);
  return r;
}

// Every world asked to save and stop, then the relay goes: a deploy, or Fly stopping the idle machine.
function stopAll(why) {
  if (stoppingAll) return;
  stoppingAll = true;
  log(`stopping (${why}): ${running.size} world${running.size === 1 ? "" : "s"} to save`);
  if (!running.size) return finishStop();
  for (const r of running.values()) {
    try {
      r.child.send({ type: "stop", why });
    } catch {
      // already gone
    }
  }
  setTimeout(() => {
    for (const r of running.values()) r.child.kill("SIGKILL");
    finishStop();
  }, STOP_WAIT_MS).unref();
}

function finishStop() {
  log("stopped");
  process.exit(0);
}

// ---- framing ----

// One WebSocket frame on the wire to a client (unmasked, as a server sends).
function frame(opcode, payload) {
  const len = payload.length;
  let head;
  if (len < 126) head = Buffer.from([0x80 | opcode, len]);
  else if (len < 65536) {
    head = Buffer.alloc(4);
    head[0] = 0x80 | opcode;
    head[1] = 126;
    head.writeUInt16BE(len, 2);
  } else {
    head = Buffer.alloc(10);
    head[0] = 0x80 | opcode;
    head[1] = 127;
    head.writeBigUInt64BE(BigInt(len), 2);
  }
  return Buffer.concat([head, payload]);
}

class Conn {
  constructor(socket) {
    this.id = `c${nextId++}`;
    this.socket = socket;
    this.buffer = Buffer.alloc(0);
    this.fragments = null; // a message arriving in pieces: { opcode, parts }
    this.role = null; // "host" | "guest" once the first message says
    this.code = null;
    this.lastSeen = Date.now();
    this.closed = false;
  }

  sendText(text) {
    if (this.closed) return;
    this.socket.write(frame(0x1, Buffer.from(text, "utf8")));
  }

  sendJson(obj) {
    this.sendText(JSON.stringify(obj));
  }

  ping() {
    if (!this.closed) this.socket.write(frame(0x9, Buffer.alloc(0)));
  }

  close(code = 1000) {
    if (this.closed) return;
    this.closed = true;
    const body = Buffer.alloc(2);
    body.writeUInt16BE(code, 0);
    try {
      this.socket.write(frame(0x8, body));
    } catch {
      // the socket may be gone already
    }
    this.socket.end();
    leave(this);
  }

  // Bytes in: frames out, as many as are whole.
  feed(chunk) {
    this.buffer = Buffer.concat([this.buffer, chunk]);
    for (;;) {
      const b = this.buffer;
      if (b.length < 2) return;
      const fin = (b[0] & 0x80) !== 0;
      const opcode = b[0] & 0x0f;
      const masked = (b[1] & 0x80) !== 0;
      let len = b[1] & 0x7f;
      let at = 2;
      if (len === 126) {
        if (b.length < 4) return;
        len = b.readUInt16BE(2);
        at = 4;
      } else if (len === 127) {
        if (b.length < 10) return;
        const big = b.readBigUInt64BE(2);
        if (big > BigInt(MAX_MESSAGE)) return this.close(1009);
        len = Number(big);
        at = 10;
      }
      if (!masked) return this.close(1002); // a client must mask (RFC 6455, 5.1)
      if (b.length < at + 4 + len) return;
      const mask = b.subarray(at, at + 4);
      const payload = Buffer.from(b.subarray(at + 4, at + 4 + len));
      for (let i = 0; i < payload.length; i++) payload[i] ^= mask[i & 3];
      this.buffer = b.subarray(at + 4 + len);
      this.lastSeen = Date.now();
      if (opcode === 0x8) return this.close(1000);
      if (opcode === 0x9) {
        if (!this.closed) this.socket.write(frame(0xa, payload));
        continue;
      }
      if (opcode === 0xa) continue; // a pong: lastSeen is enough
      if (opcode === 0x0) {
        if (!this.fragments) return this.close(1002);
        this.fragments.parts.push(payload);
      } else {
        if (this.fragments) return this.close(1002);
        this.fragments = { opcode, parts: [payload] };
      }
      const total = this.fragments.parts.reduce((n, p) => n + p.length, 0);
      if (total > MAX_MESSAGE) return this.close(1009);
      if (!fin) continue;
      const { opcode: op, parts } = this.fragments;
      this.fragments = null;
      if (op !== 0x1) continue; // binary is not the game's
      onMessage(this, Buffer.concat(parts).toString("utf8"));
    }
  }
}

// ---- rooms ----

function onMessage(conn, text) {
  let msg;
  try {
    msg = JSON.parse(text);
  } catch {
    return conn.close(1007);
  }
  if (!msg || typeof msg !== "object") return;
  if (!conn.role) {
    // The first message says who this is: a host registering a code, or a guest naming one.
    const code = typeof msg.code === "string" ? msg.code.trim().toLowerCase().slice(0, 32) : "";
    if (!code) return conn.close(1008);
    if (msg.type === "host") {
      // A server world's code is the relay's own child's to host, with the secret it was handed; anyone else's
      // registration for it is refused, even while the world sleeps (the coder agent's review of step 3).
      const w = serverWorldFor(code);
      const r = w ? running.get(w.worldId) : null;
      if (w && (!r || !sameSecret(msg.secret, r.secret))) {
        overLimit(conn.address);
        log(`refused a host for server world ${w.worldId}`);
        return conn.sendJson({ type: "error", reason: "taken" }), conn.close(1008);
      }
      if (rooms.has(code)) {
        overLimit(conn.address);
        return conn.sendJson({ type: "error", reason: "taken" }), conn.close(1008);
      }
      conn.role = "host";
      conn.code = code;
      const room = { host: conn, guests: new Map() };
      rooms.set(code, room);
      conn.sendJson({ type: "relay", role: "host", id: conn.id, code });
      if (r) {
        // The guests who woke it, waiting since: in the room now (their joins, resent every two seconds, reach it).
        for (const g of r.pending) {
          g.pending = false;
          room.guests.set(g.id, g);
          if (g.queuedJoin) conn.sendText(JSON.stringify({ ...g.queuedJoin, from: g.id, to: undefined }));
          g.queuedJoin = null;
        }
        r.pending.clear();
        log(`server world ${w.worldId} is up (${room.guests.size} waiting)`);
      } else log(`host ${conn.id} opened ${code}`);
    } else if (msg.type === "guest") {
      const room = rooms.get(code);
      if (!room) {
        // A server world asleep: its process started, and this guest waits for it (as do any others meanwhile).
        const w = serverWorldFor(code);
        if (w) {
          if (leavingNow(w)) return conn.sendJson({ type: "error", reason: "moving" }), conn.close(1008);
          let r = running.get(w.worldId);
          if (!r) {
            if (stoppingAll || running.size >= MAX_RUNNING) return conn.sendJson({ type: "error", reason: "busy" }), conn.close(1008);
            if (recentCrashes(w.worldId) >= CRASHES_BEFORE_REST) return conn.sendJson({ type: "error", reason: "broken" }), conn.close(1008);
            r = startWorld(w, code);
          }
          conn.role = "guest";
          conn.code = code;
          conn.pending = r;
          r.pending.add(conn);
          conn.sendJson({ type: "relay", role: "guest", id: conn.id, code });
          log(`guest ${conn.id} waits for server world ${w.worldId}`);
          return;
        }
        if (overLimit(conn.address)) return conn.close(1008); // scanned: no word at all
        return conn.sendJson({ type: "error", reason: "nohost" }), conn.close(1008);
      }
      conn.role = "guest";
      conn.code = code;
      room.guests.set(conn.id, conn);
      conn.sendJson({ type: "relay", role: "guest", id: conn.id, code });
      log(`guest ${conn.id} joined ${code} (${room.guests.size} in the room)`);
    } else conn.close(1008);
    return;
  }
  if (conn.pending) {
    // Waiting for a server world to start: its last join is kept and passed on the moment the world is up (the guest
    // would send it again in two seconds; this saves the wait).
    if (msg.type === "join") conn.queuedJoin = msg;
    return;
  }
  const room = rooms.get(conn.code);
  if (!room) return conn.close(1011);
  if (conn.role === "host") {
    // To one guest when named, else to every guest the host has welcomed. `from` is the host's id, stamped
    // here. A connection the host refused or has not admitted (a wrong version, a world full, no browser
    // id) hears only what is addressed to it, never the world's frames (found reviewing the worlds move).
    const out = JSON.stringify({ ...msg, from: conn.id });
    if (msg.to) {
      const g = room.guests.get(msg.to);
      if (g) {
        g.sendText(out);
        if (msg.type === "welcome") g.admitted = true;
        else if (msg.type === "bye") g.close(1000); // the host let this one go: the relay does too
      }
    } else for (const g of room.guests.values()) if (g.admitted) g.sendText(out);
  } else {
    // A guest speaks only to its host, and only as itself.
    room.host.sendText(JSON.stringify({ ...msg, from: conn.id, to: undefined }));
  }
}

function leave(conn) {
  if (!conn.role) return;
  if (conn.pending) {
    conn.pending.pending.delete(conn);
    conn.pending = null;
    conn.role = null;
    return;
  }
  const room = rooms.get(conn.code);
  if (!room) return;
  if (conn.role === "host") {
    rooms.delete(conn.code);
    for (const g of room.guests.values()) {
      g.sendJson({ type: "hostLeft" });
      g.close(1001);
    }
    log(`host ${conn.id} closed ${conn.code}`);
  } else if (room.guests.delete(conn.id)) {
    room.host.sendJson({ type: "leave", from: conn.id }); // the shape a guest's own leave has (src/net.js)
    log(`guest ${conn.id} left ${conn.code}`);
  }
  conn.role = null;
}

function log(line) {
  console.log(`${new Date().toISOString().slice(11, 19)} ${line}`);
}

// ---- the server ----

const server = http.createServer((req, res) => {
  const url = new URL(req.url, "http://relay");
  const address = addressOf(req);
  // "Is this world open?" for a code: { open, guests }. Rate-limited per address, as a refused join is.
  if (url.pathname === "/open") {
    if (overLimit(address)) {
      res.writeHead(429, { "content-type": "application/json", "access-control-allow-origin": "*" });
      return res.end('{"error":"slow down"}');
    }
    const code = (url.searchParams.get("code") || "").trim().toLowerCase().slice(0, 32);
    const room = rooms.get(code);
    const w = serverWorldFor(code); // a server world is open whether or not it is awake: a join wakes it
    res.writeHead(200, { "content-type": "application/json", "access-control-allow-origin": "*", "cache-control": "no-store" });
    return res.end(JSON.stringify({ open: !!room || !!w, guests: room ? room.guests.size : 0, ...(w ? { server: true, awake: running.has(w.worldId) } : {}) }));
  }
  if (url.pathname === "/worlds" || url.pathname.startsWith("/worlds/")) return void handleWorlds(req, res, url, address);
  // The keeper's state and a stop, for the checks, answered to this machine alone and only with CMZ_DEBUG=1.
  if (DEBUG && url.pathname.startsWith("/debug/")) {
    const local = !req.headers["fly-client-ip"] && ["127.0.0.1", "::1", "::ffff:127.0.0.1"].includes(req.socket.remoteAddress);
    if (!local) {
      res.writeHead(404);
      return res.end();
    }
    res.writeHead(200, { "content-type": "application/json" });
    if (url.pathname === "/debug/worlds") {
      return res.end(JSON.stringify({ known: serverWorlds.size, running: [...running.values()].map((r) => ({ worldId: r.worldId, debugPort: r.debugPort, waiting: r.pending.size, guests: rooms.get(r.code) ? rooms.get(r.code).guests.size : 0, upSeconds: Math.round((Date.now() - r.startedAt) / 1000) })), crashes: Object.fromEntries([...crashes].map(([k, v]) => [k, v.length])) }));
    }
    if (url.pathname === "/debug/stop") {
      res.end(JSON.stringify({ stopping: true }));
      return stopAll("a debug stop");
    }
    return res.end("{}");
  }
  res.writeHead(200, { "content-type": "text/plain; charset=utf-8", "access-control-allow-origin": "*" });
  let guests = 0;
  for (const r of rooms.values()) guests += r.guests.size;
  res.end(`cmz relay: ${rooms.size} world${rooms.size === 1 ? "" : "s"} open, ${guests} guest${guests === 1 ? "" : "s"}\n`);
});

server.on("upgrade", (req, socket) => {
  const key = req.headers["sec-websocket-key"];
  if (!key || (req.headers.upgrade || "").toLowerCase() !== "websocket") {
    socket.write("HTTP/1.1 400 Bad Request\r\n\r\n");
    socket.destroy();
    return;
  }
  const accept = crypto.createHash("sha1").update(key + GUID).digest("base64");
  socket.write(`HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ${accept}\r\n\r\n`);
  socket.setNoDelay(true);
  const conn = new Conn(socket);
  conn.address = addressOf(req);
  // A socket that never says who it is (host or guest, which code) is let go: only room members are pinged.
  setTimeout(() => { if (!conn.role) conn.close(1008); }, 10000).unref();
  socket.on("data", (chunk) => conn.feed(chunk));
  socket.on("close", () => { conn.closed = true; leave(conn); });
  socket.on("error", () => { conn.closed = true; leave(conn); socket.destroy(); });
});

setInterval(() => {
  const now = Date.now();
  for (const [a, l] of lookups) if (now - l.since > 60000) lookups.delete(a); // the table does not grow with every address ever seen
  for (const room of rooms.values()) {
    for (const c of [room.host, ...room.guests.values()]) {
      if (now - c.lastSeen > DEAD_AFTER_MS) c.close(1001);
      else c.ping();
    }
  }
}, PING_EVERY_MS).unref();

scanWorlds(true);
for (const sig of ["SIGTERM", "SIGINT"]) process.on(sig, () => stopAll(sig));
server.listen(PORT, () => log(`cmz relay listening on ${PORT}${WORLDS ? `, keeping ${serverWorlds.size} server world${serverWorlds.size === 1 ? "" : "s"} in ${WORLDS}` : ""}`));
