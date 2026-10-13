// The save (docs/31/05, item 24; the cozy parent's docs/15-save-load.md re-decided
// for this game), since docs/31/09 (2026-10-13) the worlds store: one record per
// world in the browser, versioned, discarded whole on a mismatch, never half-applied,
// and an index of them for the Worlds screen. What is saved is the world's own
// serialisation (game.serialize: the clock, the generator, the counters, every loaded
// chunk, every character), which is also what a joining player receives (docs/31/04:
// the join is a load), so the shape is owned by the modules that own the state; the
// world's own fields ride with it: its id, its name, its code once it has one, when it
// was made, and whose character is whose (`characters`: a browser id to a player id).
// Not saved: an auto-walk, a timed action's progress, a draw, arrows in flight, the
// renderer's and the interface's state. Loading drops you where you were, standing still.
//
// `?nosave` on the URL puts the store in memory for that page: nothing read from the
// browser, nothing written to it, and the Worlds screen works on worlds that live as long
// as the page. The scripted tests run with it, since the browser pane shares localStorage
// with Michael's own browser (CLAUDE.md).

import * as game from "./game.js";
import * as clock from "./clock.js";

export const VERSION = 1;
const INDEX_KEY = "cmz.worlds";
const OLD_KEY = "cmz.save"; // the one slot per map before docs/31/09
const disabled = typeof location !== "undefined" && new URLSearchParams(location.search).has("nosave");

function memoryStore() {
  const m = new Map();
  return { get: (k) => (m.has(k) ? m.get(k) : null), set: (k, v) => m.set(k, v), remove: (k) => m.delete(k) };
}

function browserStore() {
  return {
    get: (k) => localStorage.getItem(k),
    set: (k, v) => localStorage.setItem(k, v),
    remove: (k) => localStorage.removeItem(k),
  };
}

const store = disabled || typeof localStorage === "undefined" ? memoryStore() : browserStore();

function worldKey(worldId) {
  return `cmz.world.${worldId}`;
}

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
    const raw = store.get(INDEX_KEY);
    const list = raw ? JSON.parse(raw) : [];
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

function writeIndex(list) {
  try {
    store.set(INDEX_KEY, JSON.stringify(list));
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

export function writeWorld(snap) {
  if (!snap || !snap.worldId) return false;
  try {
    store.set(worldKey(snap.worldId), JSON.stringify(snap));
  } catch (err) {
    console.warn("The save did not fit or could not be written:", err.message);
    return false;
  }
  const list = listWorlds().filter((r) => r.worldId !== snap.worldId);
  list.unshift(rowFor(snap));
  writeIndex(list);
  return true;
}

// A world's save, or null when there is none or it is not this version.
export function readWorld(worldId) {
  try {
    const raw = store.get(worldKey(worldId));
    if (!raw) return null;
    const s = JSON.parse(raw);
    if (!s || s.version !== VERSION || !s.map || !s.characters) return null;
    return s;
  } catch {
    return null;
  }
}

export function deleteWorld(worldId) {
  try {
    store.remove(worldKey(worldId));
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
// characters map on entry). Runs once; the old key goes.
export function migrate(mapName, worldName = "The valley") {
  if (disabled) return null;
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
    const snap = { ...old, worldId: newWorldId(), name: worldName, code: null, created: old.savedAt, characters: old.characters, owners: {}, myPlayerId: players[0] ? players[0].id : null };
    delete snap.dead;
    if (writeWorld(snap)) localStorage.removeItem(key);
    return snap.worldId;
  } catch {
    return null;
  }
}
