// The chart (docs/33, #203): what the world has seen of itself, kept by the world. For every tile anyone has seen, what it looks like on the map: a surface
// (a prop's `mapColor` if its definition has one, else the floor's) and the two walls the tile owns, `n` and `w`. It lives beside the map, not in the chunks, so a seen
// wild chunk dropped by `map.evictFar` keeps its chart. Sparse per chunk, two bytes a cell: the surface index in the low byte (0 is unseen; the palette is every
// definition with a `mapColor`, sorted by id, so host and guest build the same one from the same data), the `n` wall's kind in the next four bits and the `w` wall's in
// the top four (a kind is 0 none, 1 wall, 2 door, 3 window, 4 see-through (fence, bars), plus 8 for one a player built). **A wall is charted when a tile on either side of
// it has been seen** (#234: a building's north and west faces are owned by tiles inside it, seen from outside only by the tile across the face), so a cell may hold
// walls with no surface (a wall-only cell, surface 0): the tile itself is still unseen.
// No DOM; it runs headless. Nothing but `chartTile` writes a cell. The reveal runs on the authority, in the world's step, for every player alike; a guest only
// receives the chart (the save's welcome, then the changed cells in each frame) and draws it.

import * as map from "./map.js";
import { defIdsWith, getDef } from "./assets.js";
import { tileVisible } from "./visibility.js";
import { world as W } from "./tuning.js";

const CHUNK = map.CHUNK;
const N = CHUNK * CHUNK;

const chunks = new Map(); // "cx,cy" -> { cx, cy, cells: Uint16Array(256) }
const changed = new Map(); // "cx,cy" -> Set of the cell indexes written since the frame last took them (#237: a frame carries the cells, not the chunks)
const retouch = new Set(); // chart chunks whose map chunk was touched: their charted cells are read again at the next step
const touched = []; // [cx, cy] of every map chunk touched since the last step, charted or not: a player near one looks again (a door opened in front of them)
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
  touched.length = 0;
}

// What the map map.touch / markDirty has changed: its chart chunk is read again at the next step.
export function noteTouched(cx, cy) {
  touched.push([cx, cy]);
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

// Write one cell of the chart (creating its chunk), marking the chunk changed. Returns whether the cell changed.
function setCell(x, y, cell) {
  const cx = Math.floor(x / CHUNK);
  const cy = Math.floor(y / CHUNK);
  const k = key(cx, cy);
  let c = chunks.get(k);
  if (!c) {
    if (!cell) return false;
    c = { cx, cy, cells: new Uint16Array(N), v: 0 };
    chunks.set(k, c);
  }
  const i = (y - cy * CHUNK) * CHUNK + (x - cx * CHUNK);
  if (c.cells[i] === cell) return false;
  c.cells[i] = cell;
  c.v++;
  let d = changed.get(k);
  if (!d) { d = new Set(); changed.set(k, d); }
  d.add(i);
  return true;
}

const seen = (x, y) => surfaceOfCell(cellAt(x, y)) !== 0;

// Read one cell from the world as the chart should hold it now: the surface only if the tile has been seen (it is never written for one nobody has),
// and each of the two walls the tile owns if a tile on either side of it has been seen. A tile in a chunk not grown reads as nothing.
function refresh(x, y) {
  const t = map.peekTile(x, y);
  if (!t) return false;
  const old = cellAt(x, y);
  const mine = seen(x, y);
  const surface = mine ? surfaceOf(t) || surfaceOfCell(old) : 0;
  const nKnown = mine || seen(x, y - 1);
  const wKnown = mine || seen(x - 1, y);
  const cell = surface | ((nKnown ? wallKind(t.n) : 0) << 8) | ((wKnown ? wallKind(t.w) : 0) << 12);
  return setCell(x, y, cell);
}

// The one function that writes a seen tile: its surface, the two walls it owns, and the two faces it shares with the tiles south and east of it (their `n` and `w`, which
// those tiles own). Returns whether anything changed (a tile in a chunk not grown reads as nothing and charts nothing).
export function chartTile(x, y) {
  const t = map.peekTile(x, y);
  if (!t) return false;
  const surface = surfaceOf(t);
  if (!surface) return false;
  let changed2 = false;
  if (!seen(x, y) || surfaceOfCell(cellAt(x, y)) !== surface) changed2 = setCell(x, y, (cellAt(x, y) & ~255) | surface);
  changed2 = refresh(x, y) || changed2;
  changed2 = refresh(x, y + 1) || changed2;
  changed2 = refresh(x + 1, y) || changed2;
  return changed2;
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
    // Every cell of the chunk and the ring of tiles round it (a wall's cell may lie across the chunk's edge from the tile that was seen).
    for (let y = c.cy * CHUNK - 1; y <= c.cy * CHUNK + CHUNK; y++) {
      for (let x = c.cx * CHUNK - 1; x <= c.cx * CHUNK + CHUNK; x++) {
        const had = cellAt(x, y);
        if (had || seen(x, y - 1) || seen(x - 1, y)) refresh(x, y);
      }
    }
  }
  retouch.clear();
}

// The world's step (game.begin): for each player in the world, alive, whose tile has changed since their last reveal, reveal; then read the touched chunks again.
export function step(players) {
  rechart();
  const R = Math.ceil(W.chartRadius / CHUNK);
  for (const p of players) {
    if (p.dead || p.corpse) continue; // a dead player reveals nothing (a dormant one is not in the list)
    if (p.layer) continue; // the chart is the ground's (docs/49 section 12, a default): it reveals by its flat walk on layer 0, from a player on layer 0
    const k = `${Math.round(p.gx)},${Math.round(p.gy)}`;
    // Look again when the tile changed, or when something changed within reach of them (a door opened, a shutter, a wall taken down), standing still or not.
    const pcx = Math.floor(Math.round(p.gx) / CHUNK);
    const pcy = Math.floor(Math.round(p.gy) / CHUNK);
    const near = touched.some(([cx, cy]) => Math.abs(cx - pcx) <= R && Math.abs(cy - pcy) <= R);
    if (p.chartTile === k && !near) continue;
    p.chartTile = k;
    reveal(p.gx, p.gy);
  }
  touched.length = 0;
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

// The cells written since the last call (the frame's `chart`), each chunk as [cx, cy, [index, cell, index, cell, ...]], and the set cleared. A whole chunk
// is the save's and the welcome's (`serialize`); a frame carries only what changed (#237).
export function takeChanged() {
  const out = [];
  for (const [k, set] of changed) {
    const c = chunks.get(k);
    if (!c) continue;
    const flat = [];
    for (const i of [...set].sort((a, b) => a - b)) flat.push(i, c.cells[i]);
    out.push([c.cx, c.cy, flat]);
  }
  changed.clear();
  return out;
}

// A guest's replica takes the changed cells the host sent (or, a whole chunk as the save writes it: a string). It never charts anything itself.
export function apply(list) {
  for (const [cx, cy, data] of list || []) {
    const k = key(cx, cy);
    const old = chunks.get(k);
    if (typeof data === "string") { chunks.set(k, { cx, cy, cells: decode(data), v: (old?.v ?? 0) + 1 }); continue; } // `v` rises, so the panel redraws it
    const c = old || { cx, cy, cells: new Uint16Array(N), v: 0 };
    for (let j = 0; j + 1 < data.length; j += 2) {
      const i = data[j] | 0;
      if (i >= 0 && i < N) c.cells[i] = data[j + 1] & 0xffff;
    }
    c.v++;
    chunks.set(k, c);
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
