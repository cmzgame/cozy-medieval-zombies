// Identities (docs/31/09; Michael, 2026-10-13, Zomboid's model): a name and a look, kept in
// the browser, reusable. An identity is the seed a character is stamped from and nothing
// more: once the character exists in its world, the identity is not consulted again, and
// editing it never reaches a character already stamped. Also here: the browser id a world
// remembers a character's owner by, and the bookmarks of friends' worlds this browser has
// joined. All of it lives in the settings blob, none of it in a world's save.

import * as settings from "./settings.js";

// `?nosave` (save.js) keeps these in memory for the page too: a check that makes identities leaves
// nothing in the browser the pane shares with Michael's own (CLAUDE.md).
const inMemory = typeof location !== "undefined" && new URLSearchParams(location.search).has("nosave");
const mem = {};
function read(key) {
  return inMemory && key in mem ? mem[key] : settings.get(key);
}
function write(key, value) {
  if (inMemory) mem[key] = value;
  else settings.set(key, value);
}

function token(prefix) {
  return `${prefix}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
}

export function list() {
  return (read("identities") || []).slice();
}

export function get(id) {
  return list().find((i) => i.id === id) || null;
}

// A new identity from a name and a look (the look partial: the character's maker fills the rest).
export function add({ name = "", look = {} } = {}) {
  const identity = { id: token("i"), name: String(name || "").slice(0, 24), look: { ...look } };
  write("identities", [...list(), identity]);
  return identity;
}

// The stamp changed: every character made from it afterwards wears the change; none made before does.
export function update(id, { name, look } = {}) {
  const next = list().map((i) => (i.id === id ? { ...i, name: name !== undefined ? String(name || "").slice(0, 24) : i.name, look: look ? { ...i.look, ...look } : i.look } : i));
  write("identities", next);
  return next.find((i) => i.id === id) || null;
}

export function remove(id) {
  write("identities", list().filter((i) => i.id !== id));
}

// The one picked last, for the creation screen's first choice.
export function last() {
  const id = read("lastIdentity");
  return get(id) || list()[0] || null;
}

export function setLast(id) {
  write("lastIdentity", id || "");
}

// What a world records an owner by: a hash of the browser id, never the id (the coder agent's
// review, 2026-10-13: an exported save must not hand out the proof of who owns a character).
// FNV-1a over the id, twice with different seeds, as sixteen hex digits.
export function idHash(id) {
  const s = String(id || "");
  const fnv = (seed) => {
    let h = seed >>> 0;
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 16777619) >>> 0;
    }
    return h.toString(16).padStart(8, "0");
  };
  return fnv(2166136261) + fnv(0x9747b28c);
}

// The browser id: drawn once, never shown, never typed; a world keys its characters' owners by its hash.
export function clientId() {
  let id = read("clientId");
  if (!id) {
    id = token("c");
    write("clientId", id);
  }
  return id;
}

// ---- friends' worlds: the bookmarks ----

export function joined() {
  return (read("joined") || []).slice();
}

// Written at the first attempt, so a failed join still leaves a row to Rejoin from.
export function rememberJoined({ code, name = null, hostName = null, myCharacter = null } = {}) {
  if (!code) return;
  const rows = joined().filter((r) => r.code !== code);
  const old = joined().find((r) => r.code === code) || {};
  rows.unshift({ code, name: name ?? old.name ?? null, hostName: hostName ?? old.hostName ?? null, myCharacter: myCharacter ?? old.myCharacter ?? null, lastAt: Date.now() });
  write("joined", rows.slice(0, 20));
}

export function forgetJoined(code) {
  write("joined", joined().filter((r) => r.code !== code));
}

// The first boot after identities exist: the one name and look the browser kept become the first identity.
export function migrate() {
  if (list().length) return;
  const name = settings.get("playerName") || "";
  const look = settings.get("look") || {};
  if (!name && !Object.keys(look).length) return;
  const made = add({ name: name || "Survivor", look });
  setLast(made.id);
}
