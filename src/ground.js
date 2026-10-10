// The ground (docs/15-ground.md): one picture per chunk, baked on the CPU and
// drawn as one quad through the shared shader, so the light, the night, and
// the fog fall on it per pixel exactly as they did on the per-tile floor.
// Every pixel is a pure function of (x, y, seed) and the tiles, so a chunk
// bakes byte-identical on every visit, the wild forest included, and nothing
// is stored.
//
// The bake is one loop over the chunk's pixels. Which tile owns a pixel, and
// where that pixel falls in the tile's 64×32 frame, is the same for every
// chunk, so it is worked out once (`OWNER`, `FX`, `FY`). A pixel then copies
// from its owner tile's source: a grass tile chosen by hash (mirrored by its
// own roll), or a floor sheet's frame. Pixels no tile of the chunk owns stay
// transparent, so neighbouring chunks meet without a seam or an overlap.
//
// Built so far: step 1 (grass by hash, laid floors, the ownership clip). Until
// step 4, dirt and farm draw as their sheet's first frame, a hard diamond.

import * as map from "./map.js";
import * as gl from "./gl.js";
import * as assets from "./assets.js";

export const W = 1024; // a chunk's diamond's bounding box, in world pixels
export const H = 512;
const C = map.CHUNK;
const TILE_W = 64;
const TILE_H = 32;
const KEEP_RADIUS = 2; // chunks around the camera's chunk whose textures are kept
const CAP = 36; // textures resident at most, unless the view itself needs more
export const REACH_MAX = 4; // tiles: how far a change can move another tile's ground

let data = null;
let seed = 1;
const biomes = new Map(); // name -> { grass: [{ w, h, px }], base: [r, g, b] }
const frames = new Map(); // "sheet|frame" -> { w, h, px, ox, oy }
const chunks = new Map(); // chunkKey -> { cx, cy, rec, dirty }
const stat = { baked: 0, lastMs: 0, maxMs: 0 };

// ---- ownership, the same for every chunk ----

let OWNER = null; // Int16Array: the local tile index (ly * 16 + lx) owning each pixel, or -1
let FX = null; // Uint8Array: the pixel's column in its owner tile's frame
let FY = null; // Uint8Array: its row

// The chunk's canvas sits at world pixel left = (x0 - y0 - 16) * 32,
// top = (x0 + y0) * 16 - 16. A pixel's centre is then at fractional grid
// (gx, gy) relative to the chunk's first tile, and the tile that rounds to
// is its owner. No pixel centre lies on a diamond's edge (the edges fall on
// whole pixels and the centres on halves), so the kit's diamond mask and
// this rule pick exactly the same pixels.
function buildOwnership() {
  OWNER = new Int16Array(W * H);
  FX = new Uint8Array(W * H);
  FY = new Uint8Array(W * H);
  for (let py = 0; py < H; py++) {
    const b = (py + 0.5) / 16 - 1;
    for (let px = 0; px < W; px++) {
      const a = (px + 0.5) / 32 - 16;
      const lx = Math.floor((a + b) / 2 + 0.5);
      const ly = Math.floor((b - a) / 2 + 0.5);
      const i = py * W + px;
      if (lx < 0 || ly < 0 || lx >= C || ly >= C) {
        OWNER[i] = -1;
        continue;
      }
      OWNER[i] = ly * C + lx;
      FX[i] = px - (lx - ly + 15) * 32;
      FY[i] = py - (lx + ly) * 16;
    }
  }
}

// ---- loading ----

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Failed to load image ${src}`));
    img.src = src;
  });
}

// The RGBA pixels of a region of an image or canvas, copied at 1:1.
function pixelsOf(img, x = 0, y = 0, w = img.width, h = img.height) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const ctx = c.getContext("2d", { willReadFrequently: true });
  ctx.drawImage(img, x, y, w, h, 0, 0, w, h);
  return ctx.getImageData(0, 0, w, h).data;
}

// Load the ground's data and art. `mapJson.ground.seed`, if given, overrides
// the data's seed for that map.
export async function init(mapJson) {
  data = await assets.loadJson("data/ground.json");
  seed = mapJson?.ground?.seed ?? data.seed ?? 1;
  for (const id in data.floors) await assets.loadSprite(id);
  for (const [name, b] of Object.entries(data.biomes)) {
    const grass = [];
    for (const src of b.grass) {
      const img = await loadImage(src);
      grass.push({ w: img.width, h: img.height, px: pixelsOf(img) });
    }
    biomes.set(name, { grass, base: b.grassBase || [75, 95, 61] });
  }
  buildOwnership();
}

function biomeOf(x, y) {
  return biomes.get(map.biomeAt(x, y)) || biomes.get("harvest") || biomes.values().next().value;
}

export function kindOf(floorId) {
  return (data && data.floors[floorId]) || "laid";
}

// A frame of a floor sheet as pixels, and its offset in the tile's 64×32
// frame (a frame drawn at the tile centre minus the sheet's anchor).
function frameOf(sheetId, name) {
  const key = `${sheetId}|${name}`;
  let f = frames.get(key);
  if (f) return f;
  const sheet = assets.getSheet(sheetId);
  const r = sheet.frames[name];
  f = { w: r[2], h: r[3], px: pixelsOf(sheet.image, r[0], r[1], r[2], r[3]), ox: TILE_W / 2 - sheet.anchor[0], oy: TILE_H / 2 - sheet.anchor[1] };
  frames.set(key, f);
  return f;
}

function frameNames(sheetId) {
  return Object.keys(assets.getSheet(sheetId).frames).filter((n) => n.startsWith("idle_")).sort();
}

// ---- the bake ----

// The chunk's picture as ImageData. Pure: the same chunk, seed, and tiles
// give the same bytes.
export function bakeImage(cx, cy) {
  const x0 = cx * C;
  const y0 = cy * C;
  const grass = new Array(C * C); // per tile: the grass source
  const flip = new Uint8Array(C * C);
  const base = new Array(C * C);
  const top = new Array(C * C); // per tile: a floor frame over the grass, or null
  for (let ly = 0; ly < C; ly++) {
    for (let lx = 0; lx < C; lx++) {
      const x = x0 + lx;
      const y = y0 + ly;
      const o = ly * C + lx;
      const b = biomeOf(x, y);
      grass[o] = b.grass[Math.floor(map.hash2(x, y, seed + 10) * b.grass.length)];
      flip[o] = map.hash2(x, y, seed + 11) < 0.5 ? 1 : 0;
      base[o] = b.base;
      const floor = map.tileAt(x, y).floor;
      const kind = kindOf(floor);
      if (kind === "grass") top[o] = null;
      else if (kind === "laid") {
        const names = frameNames(floor);
        top[o] = frameOf(floor, names[Math.floor(map.hash2(x, y, seed + 12) * names.length)]);
      } else top[o] = frameOf(floor, frameNames(floor)[0]); // the earth kinds, hard until step 4
    }
  }
  const img = new ImageData(W, H);
  const out = img.data;
  for (let i = 0; i < W * H; i++) {
    const o = OWNER[i];
    if (o < 0) continue;
    const fx = FX[i];
    const fy = FY[i];
    const k = i * 4;
    const t = top[o];
    if (t) {
      const col = fx - t.ox;
      const row = fy - t.oy;
      if (col >= 0 && row >= 0 && col < t.w && row < t.h) {
        const j = (row * t.w + col) * 4;
        if (t.px[j + 3] > 0) {
          // An antialiased edge pixel of a generated frame keeps its colour at
          // full alpha: a pixel is one thing or another, never a blend.
          out[k] = t.px[j];
          out[k + 1] = t.px[j + 1];
          out[k + 2] = t.px[j + 2];
          out[k + 3] = 255;
          continue;
        }
      }
    }
    const g = grass[o];
    const gc = flip[o] ? g.w - 1 - fx : fx;
    const j = (fy * g.w + gc) * 4;
    if (fy < g.h && gc >= 0 && gc < g.w && g.px[j + 3] > 0) {
      out[k] = g.px[j];
      out[k + 1] = g.px[j + 1];
      out[k + 2] = g.px[j + 2];
    } else {
      const c = base[o];
      out[k] = c[0];
      out[k + 1] = c[1];
      out[k + 2] = c[2];
    }
    out[k + 3] = 255;
  }
  return img;
}

// Bake a chunk and upload its texture now. Returns the texture record.
export function bakeNow(cx, cy) {
  const t0 = performance.now();
  const key = map.chunkKey(cx, cy);
  const rec = gl.uploadGround(key, bakeImage(cx, cy));
  chunks.set(key, { cx, cy, rec, dirty: false });
  stat.baked++;
  stat.lastMs = performance.now() - t0;
  stat.maxMs = Math.max(stat.maxMs, stat.lastMs);
  return rec;
}

// The chunk's texture record, or null if it has none yet. A dirty chunk
// keeps drawing its old picture until it is re-baked.
export function textureFor(cx, cy) {
  const e = chunks.get(map.chunkKey(cx, cy));
  return e ? e.rec : null;
}

// The chunks a list of tiles touches, as [cx, cy] pairs.
export function chunksOf(tiles) {
  const seen = new Set();
  const out = [];
  for (const [tx, ty] of tiles) {
    const cx = Math.floor(tx / C);
    const cy = Math.floor(ty / C);
    const k = map.chunkKey(cx, cy);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push([cx, cy]);
  }
  return out;
}

// Before the first frame: every chunk the view touches and a ring of one
// around them, so nothing is baked while the player watches.
export function prebake(tiles) {
  for (const [cx, cy] of withRing(chunksOf(tiles))) if (!textureFor(cx, cy)) bakeNow(cx, cy);
}

function withRing(list) {
  const seen = new Set();
  const out = [];
  for (const [cx, cy] of list) {
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const k = map.chunkKey(cx + dx, cy + dy);
        if (seen.has(k)) continue;
        seen.add(k);
        out.push([cx + dx, cy + dy]);
      }
    }
  }
  return out;
}

// Each step: re-bake dirty chunks in view (one dropped frame on a change is
// accepted), bake the nearest missing or dirty chunk of the ring around the
// view, and evict textures far from the camera.
export function update(camGx, camGy, tiles) {
  if (!data) return;
  const viewed = chunksOf(tiles);
  const viewedKeys = new Set(viewed.map(([cx, cy]) => map.chunkKey(cx, cy)));
  for (const [cx, cy] of viewed) {
    const e = chunks.get(map.chunkKey(cx, cy));
    if (e && e.dirty) bakeNow(cx, cy);
  }
  const [ccx, ccy] = map.chunkCoord(Math.round(camGx), Math.round(camGy));
  const dist = ([cx, cy]) => Math.max(Math.abs(cx - ccx), Math.abs(cy - ccy));
  const ring = withRing(viewed);
  let best = null;
  for (const c of ring) {
    const e = chunks.get(map.chunkKey(c[0], c[1]));
    if (e && !e.dirty) continue;
    if (!best || dist(c) < dist(best)) best = c;
  }
  if (best) bakeNow(best[0], best[1]);
  // Eviction: keep what is viewed, its ring, and everything within
  // KEEP_RADIUS of the camera's chunk; past the cap, the farthest goes first.
  const keep = new Set(ring.map(([cx, cy]) => map.chunkKey(cx, cy)));
  for (const [k, e] of chunks) {
    if (keep.has(k) || dist([e.cx, e.cy]) <= KEEP_RADIUS) continue;
    gl.deleteGround(k);
    chunks.delete(k);
  }
  if (chunks.size > CAP) {
    const spare = [...chunks].filter(([k]) => !viewedKeys.has(k)).sort((a, b) => dist([b[1].cx, b[1].cy]) - dist([a[1].cx, a[1].cy]));
    while (chunks.size > CAP && spare.length) {
      const [k] = spare.shift();
      gl.deleteGround(k);
      chunks.delete(k);
    }
  }
}

// A floor changed, or a prop that marks the ground came or went: every baked
// chunk within REACH_MAX tiles of these tiles is re-baked when next needed.
// Registered with map.onGroundChange.
export function invalidate(tiles, prop = null) {
  if (prop && !assets.getDef(prop.sprite).shadow) return; // nothing on the ground changes
  for (const [x, y] of tiles) {
    const cx0 = Math.floor((x - REACH_MAX) / C);
    const cx1 = Math.floor((x + REACH_MAX) / C);
    const cy0 = Math.floor((y - REACH_MAX) / C);
    const cy1 = Math.floor((y + REACH_MAX) / C);
    for (let cy = cy0; cy <= cy1; cy++) {
      for (let cx = cx0; cx <= cx1; cx++) {
        const e = chunks.get(map.chunkKey(cx, cy));
        if (e) e.dirty = true;
      }
    }
  }
}

export function stats() {
  return { baked: stat.baked, lastMs: stat.lastMs, maxMs: stat.maxMs, textures: chunks.size };
}

// ---- for testing and for Michael ----

// A short hash of a chunk's bake: equal hashes, equal bytes.
export function hashChunk(cx, cy) {
  const d = bakeImage(cx, cy).data;
  let h = 2166136261;
  for (let i = 0; i < d.length; i++) h = Math.imul(h ^ d[i], 16777619);
  return (h >>> 0).toString(16);
}

// Save a chunk's picture under screenshots/ through the dev server.
export async function savePng(cx, cy) {
  const c = document.createElement("canvas");
  c.width = W;
  c.height = H;
  c.getContext("2d").putImageData(bakeImage(cx, cy), 0, 0);
  const blob = await new Promise((r) => c.toBlob(r, "image/png"));
  const name = `ground_${cx}_${cy}.png`;
  await fetch(`/__screenshot/${name}`, { method: "POST", body: blob });
  return `screenshots/${name}`;
}
