// The save (docs/31/05, item 24; the cozy parent's docs/15-save-load.md re-decided
// for this game), since docs/31/09 (2026-10-13) the worlds store: one record per
// world in the browser, versioned, discarded whole on a mismatch, never half-applied,
// and an index of them for the Worlds screen. What is saved is the world's own
// serialisation (game.serialize: the clock, the generator, the counters, every loaded
// chunk, every character), which is also what a joining player receives (docs/31/04:
// the join is a load), so the shape is owned by the modules that own the state; the
// world's own fields ride with it in the wrapper, outside what a guest ever receives:
// its id, its name, its code once it has one, when it was made, whose character is
// whose (`owners`: a hash of a browser id to a player id), and the characters gone
// dormant with their players away (`dormant`: the hash to the character's record).
// Not saved: an auto-walk, a timed action's progress, a draw, arrows in flight, the
// renderer's and the interface's state. Loading drops you where you were, standing still.
//
// The records live in IndexedDB (Michael, 2026-10-13: a save is already most of a
// megabyte and grows with the land explored; the small store holds five megabytes for
// the whole site), the index in localStorage, small and read at once for the screen.
// `?nosave` on the URL puts both in memory for that page: nothing read from the
// browser, nothing written to it. The scripted tests run with it, since the browser
// pane shares its storage with Michael's own (CLAUDE.md).

import * as game from "./game.js";
import * as clock from "./clock.js";

export const VERSION = 1;
const INDEX_KEY = "cmz.worlds";
const OLD_KEY = "cmz.save"; // the one slot per map before docs/31/09
const DB_NAME = "cmz";
const DB_STORE = "worlds";
const disabled = typeof location !== "undefined" && new URLSearchParams(location.search).has("nosave");
const haveBrowser = typeof localStorage !== "undefined";
const haveDb = typeof indexedDB !== "undefined";

// ---- the stores: the index small and at hand, the records large and asynchronous ----

function memoryIndex() {
  let raw = null;
  return { get: () => raw, set: (v) => { raw = v; } };
}

function browserIndex() {
  return { get: () => localStorage.getItem(INDEX_KEY), set: (v) => localStorage.setItem(INDEX_KEY, v) };
}

function memoryRecords() {
  const m = new Map();
  return {
    get: async (k) => (m.has(k) ? m.get(k) : null),
    set: async (k, v) => { m.set(k, v); },
    remove: async (k) => { m.delete(k); },
  };
}

function dbRecords() {
  let opening = null;
  const open = () => {
    if (!opening) {
      opening = new Promise((resolve, reject) => {
        const req = indexedDB.open(DB_NAME, 1);
        req.onupgradeneeded = () => { req.result.createObjectStore(DB_STORE); };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error || new Error("IndexedDB would not open"));
        req.onblocked = () => reject(new Error("IndexedDB is blocked by another tab"));
      });
    }
    return opening;
  };
  const run = async (mode, fn) => {
    const db = await open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(DB_STORE, mode);
      const req = fn(tx.objectStore(DB_STORE));
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error || new Error("the store refused"));
      tx.onabort = () => reject(tx.error || new Error("the write was aborted"));
    });
  };
  return {
    get: (k) => run("readonly", (s) => s.get(k)).then((v) => (v === undefined ? null : v)),
    set: (k, v) => run("readwrite", (s) => s.put(v, k)),
    remove: (k) => run("readwrite", (s) => s.delete(k)),
  };
}

const index = disabled || !haveBrowser ? memoryIndex() : browserIndex();
const records = disabled || !haveDb ? memoryRecords() : dbRecords();

export function isDisabled() {
  return disabled;
}

// The world now, as one plain object; `extra` is the world's own fields (main.js).
export function snapshot(mapName, extra = {}) {
  return { version: VERSION, savedAt: Date.now(), mapName, ...extra, ...game.serialize() };
}

export function newWorldId() {
  return `w${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

// ---- the index: what the Worlds screen lists without reading every save ----

export function listWorlds() {
  try {
    const raw = index.get();
    const list = raw ? JSON.parse(raw) : [];
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

function writeIndex(list) {
  try {
    index.set(JSON.stringify(list));
  } catch (err) {
    console.warn("The worlds index could not be written:", err.message);
  }
}

// The index's row for a save: my character's name and whether they are dead come from the save itself.
function rowFor(snap) {
  const players = (snap.characters && snap.characters.players) || [];
  const mine = players.find((p) => p.id === snap.myPlayerId) || null;
  return {
    worldId: snap.worldId,
    name: snap.name || "A world",
    mapName: snap.mapName,
    savedAt: snap.savedAt,
    created: snap.created || snap.savedAt,
    label: clock.formatLabel(snap.clock),
    code: snap.code || null,
    myCharacter: mine ? mine.name || mine.id : null,
    dead: !!(mine && mine.dead),
  };
}

// ---- the records ----

// The save written; the index after it. Resolves { ok, error }: a save that fails says why (the screen tells).
export async function writeWorld(snap) {
  if (!snap || !snap.worldId) return { ok: false, error: "no world" };
  try {
    await records.set(snap.worldId, snap);
  } catch (err) {
    console.warn("The save did not fit or could not be written:", err && err.message);
    return { ok: false, error: (err && err.message) || "the store refused" };
  }
  const list = listWorlds().filter((r) => r.worldId !== snap.worldId);
  list.unshift(rowFor(snap));
  writeIndex(list);
  return { ok: true };
}

// A world's save, or null when there is none or it is not this version.
export async function readWorld(worldId) {
  try {
    const s = await records.get(worldId);
    if (!s || s.version !== VERSION || !s.map || !s.characters) return null;
    return s;
  } catch {
    return null;
  }
}

export async function deleteWorld(worldId) {
  try {
    await records.remove(worldId);
  } catch {
    // nothing to remove
  }
  writeIndex(listWorlds().filter((r) => r.worldId !== worldId));
}

// "Day 3, 22:15" for a row.
export function label(s) {
  return clock.formatLabel(s.clock);
}

// The one slot per map from before docs/31/09 becomes a world named for its map, with no
// code and no owner recorded (the first Play there is this browser's; main.js fills the
// owners on entry). Runs once; the old key goes once the record is written.
export async function migrate(mapName, worldName = "The valley") {
  if (disabled || !haveBrowser) return null;
  try {
    const key = `${OLD_KEY}.${mapName}`;
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const old = JSON.parse(raw);
    if (!old || old.version !== VERSION || !old.map || !old.characters) {
      localStorage.removeItem(key);
      return null;
    }
    const players = (old.characters && old.characters.players) || [];
    const snap = { ...old, worldId: newWorldId(), name: worldName, code: null, created: old.savedAt, owners: {}, dormant: {}, myPlayerId: players[0] ? players[0].id : null };
    delete snap.dead;
    const r = await writeWorld(snap);
    if (r.ok) localStorage.removeItem(key);
    return r.ok ? snap.worldId : null;
  } catch {
    return null;
  }
}
