// The chart (docs/33, #203): what the world has seen of itself, kept by the world. For every tile anyone has seen, what it looks like on the map: a surface
// (a prop's `mapColor` if its definition has one, else the floor's) and the two walls the tile owns, `n` and `w`. It lives beside the map, not in the chunks, so a seen
// wild chunk dropped by `map.evictFar` keeps its chart. Sparse per chunk, two bytes a cell: the surface index in the low byte (0 is unseen; the palette is every
// definition with a `mapColor`, sorted by id, so host and guest build the same one from the same data), the `n` wall's kind in the next four bits and the `w` wall's in
// the top four (a kind is 0 none, 1 wall, 2 door, 3 window, 4 see-through (fence, bars), plus 8 for one a player built).
// No DOM; it runs headless. Nothing but `chartTile` writes a cell. The reveal runs on the authority, in the world's step, for every player alike; a guest only
// receives the chart (the save's welcome, then the changed chunks in each frame) and draws it.

import * as map from "./map.js";
import { defIdsWith, getDef } from "./assets.js";
import { tileVisible } from "./visibility.js";
import { world as W } from "./tuning.js";

const CHUNK = map.CHUNK;
const N = CHUNK * CHUNK;

const chunks = new Map(); // "cx,cy" -> { cx, cy, cells: Uint16Array(256) }
const changed = new Set(); // chart chunks written since the frame last took them
const retouch = new Set(); // chart chunks whose map chunk was touched: their charted cells are read again at the next step
let palette = null; // [{ id, color }] sorted by id; a cell's surface index is its place + 1
let indexOf = null;

const key = (cx, cy) => `${cx},${cy}`;

// The palette, from the loaded definitions; built once, on first use (every definition is loaded before a world is made).
export function paletteOf() {
  if (palette) return palette;
  palette = defIdsWith("mapColor").map((id) => ({ id, color: getDef(id).mapColor }));
  indexOf = new Map(palette.map((p, i) => [p.id, i + 1]));
  if (palette.length > 255) throw new Error("the chart's palette is over 255 colours");
  return palette;
}

export function colorOfSurface(i) {
  const p = paletteOf()[i - 1];
  return p ? p.color : null;
}

// Forget everything (a new world; a restore starts from its own).
export function reset() {
  chunks.clear();
  changed.clear();
  retouch.clear();
}

// What the map map.touch / markDirty has changed: its chart chunk is read again at the next step.
export function noteTouched(cx, cy) {
  const k = key(cx, cy);
  if (chunks.has(k)) retouch.add(k);
}

const wallKind = (w) => {
  if (!w) return 0;
  let k = w.kind === "door" ? 2 : w.kind === "window" ? 3 : map.wallRule(w.sprite).seeThrough ? 4 : 1;
  if (w.built) k |= 8;
  return k;
};

function surfaceOf(t) {
  paletteOf();
  if (t.prop) {
    const i = indexOf.get(t.prop.sprite);
    if (i) return i;
  }
  return indexOf.get(t.floor) || 0;
}

// The one function that writes a cell: reads the tile and the two walls it owns, writes the cell, marks the chart chunk changed. Returns whether
// the cell changed (a tile in a chunk not grown reads as nothing and charts nothing).
export function chartTile(x, y) {
  const t = map.peekTile(x, y);
  if (!t) return false;
  const surface = surfaceOf(t);
  if (!surface) return false;
  const cx = Math.floor(x / CHUNK);
  const cy = Math.floor(y / CHUNK);
  const k = key(cx, cy);
  let c = chunks.get(k);
  if (!c) { c = { cx, cy, cells: new Uint16Array(N), v: 0 }; chunks.set(k, c); }
  const i = (y - cy * CHUNK) * CHUNK + (x - cx * CHUNK);
  const cell = surface | (wallKind(t.n) << 8) | (wallKind(t.w) << 12);
  if (c.cells[i] === cell) return false;
  c.cells[i] = cell;
  c.v++;
  changed.add(k);
  return true;
}

export function cellAt(x, y) {
  const c = chunks.get(key(Math.floor(x / CHUNK), Math.floor(y / CHUNK)));
  return c ? c.cells[(y - c.cy * CHUNK) * CHUNK + (x - c.cx * CHUNK)] : 0;
}

export const surfaceOfCell = (cell) => cell & 255;
export const northWall = (cell) => (cell >> 8) & 15;
export const westWall = (cell) => (cell >> 12) & 15;

// Chart every not-yet-charted tile within `radius` of (gx, gy) that the player sees (line of sight, the four-corner rule the screen's fog uses; light
// ignored). Returns how many tiles it charted.
export function reveal(gx, gy, radius = W.chartRadius) {
  const px = Math.round(gx);
  const py = Math.round(gy);
  const r = Math.ceil(radius);
  let n = 0;
  for (let y = py - r; y <= py + r; y++) {
    for (let x = px - r; x <= px + r; x++) {
      if (Math.hypot(x - gx, y - gy) > radius) continue;
      if (surfaceOfCell(cellAt(x, y))) continue;
      if (!tileVisible(gx, gy, x, y)) continue;
      if (chartTile(x, y)) n++;
    }
  }
  return n;
}

// Read again every charted cell of the chunks the map says were touched: a wall built, a door opened, a field tilled, a tree felled shows without anyone
// looking again.
export function rechart() {
  if (!retouch.size) return;
  for (const k of [...retouch]) {
    const c = chunks.get(k);
    if (!c) continue;
    for (let i = 0; i < N; i++) if (c.cells[i]) chartTile(c.cx * CHUNK + (i % CHUNK), c.cy * CHUNK + Math.floor(i / CHUNK));
  }
  retouch.clear();
}

// The world's step (game.begin): for each player in the world, alive, whose tile has changed since their last reveal, reveal; then read the touched chunks again.
export function step(players) {
  rechart();
  for (const p of players) {
    if (p.dead || p.corpse) continue; // a dead player reveals nothing (a dormant one is not in the list)
    const k = `${Math.round(p.gx)},${Math.round(p.gy)}`;
    if (p.chartTile === k) continue;
    p.chartTile = k;
    reveal(p.gx, p.gy);
  }
}

// ---- what travels: the save, the welcome, the frame, the sync check ----

function encode(cells) {
  const bytes = new Uint8Array(cells.buffer, cells.byteOffset, cells.byteLength);
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x2000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x2000));
  return btoa(s);
}

function decode(b64) {
  const s = atob(b64);
  const cells = new Uint16Array(N);
  const bytes = new Uint8Array(cells.buffer);
  for (let i = 0; i < bytes.length && i < s.length; i++) bytes[i] = s.charCodeAt(i);
  return cells;
}

const chunkRecord = (c) => [c.cx, c.cy, encode(c.cells)];

// Every charted chunk, sorted, each as [cx, cy, base64 of its cells].
export function serialize() {
  return { chunks: [...chunks.values()].sort((a, b) => a.cx - b.cx || a.cy - b.cy).map(chunkRecord) };
}

export function restore(data) {
  reset();
  for (const [cx, cy, b64] of (data && data.chunks) || []) chunks.set(key(cx, cy), { cx, cy, cells: decode(b64), v: 1 });
}

// The chunks written since the last call, whole (the frame's `chart`), and the set cleared.
export function takeChanged() {
  const out = [];
  for (const k of changed) { const c = chunks.get(k); if (c) out.push(chunkRecord(c)); }
  changed.clear();
  return out;
}

// A guest's replica takes the changed chunks the host sent. It never charts anything itself.
export function apply(list) {
  for (const [cx, cy, b64] of list || []) {
    const k = key(cx, cy);
    chunks.set(k, { cx, cy, cells: decode(b64), v: (chunks.get(k)?.v ?? 0) + 1 }); // `v` rises, so the panel redraws it
  }
}

// What the sync check hashes: the charted chunks, sorted.
export function hashText() {
  return [...chunks.values()].sort((a, b) => a.cx - b.cx || a.cy - b.cy).map((c) => `${c.cx},${c.cy}:${encode(c.cells)}`).join("\n");
}

// For the panel: the charted chunks, each with a `v` that rises whenever its cells change (the panel redraws a chunk whose `v` it has not drawn).
export function chartedChunks() {
  return [...chunks.values()];
}
