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
// Built so far: step 1 (grass by hash, laid floors, the ownership clip) and
// step 2 (the patch tint and canopy darkening on the grass, baked tree
// shadows). Until step 4, dirt and farm draw as their sheet's first frame, a
// hard diamond.
//
// The tint is read from a grid of samples four to a tile, one tile beyond the
// chunk on every side, and interpolated per pixel, so it drifts smoothly with
// no step at a tile's edge. Each tree darkens the grass around it by
// 1 / (1 + d) out to its own canopy reach, faded to nothing over the last tile
// so the reach has no rim; d is the distance in tiles from the trunk.

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
// The tint grid: samples SPT to a tile from one tile before the chunk to one
// after, so GRID across. Per pixel, the grid index of the sample up and left of
// it and its fractional place between samples.
const SPT = 4;
const GRID = (C + 2) * SPT + 1;
let TI = null; // Int32Array
let TU = null; // Float32Array
let TV = null; // Float32Array

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
  TI = new Int32Array(W * H);
  TU = new Float32Array(W * H);
  TV = new Float32Array(W * H);
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
      const u = ((a + b) / 2 + 1) * SPT;
      const v = ((b - a) / 2 + 1) * SPT;
      const iu = Math.floor(u);
      const iv = Math.floor(v);
      TI[i] = iv * GRID + iu;
      TU[i] = u - iu;
      TV[i] = v - iv;
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
    biomes.set(name, {
      grass,
      base: b.grassBase || [75, 95, 61],
      patch: b.patch || { scaleA: 5, scaleB: 2.2, mix: 0.7, r: [1, 0], g: [1, 0], b: [1, 0] },
      canopy: b.canopy || { perTree: 0, max: 0 },
      shadow: b.shadow || { steps: 3, alpha: 0.09, squash: 0.6, dropPx: 2 },
    });
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

// Every prop within `pad` tiles of the chunk whose definition has `key`, once each.
function propsNear(x0, y0, pad, key) {
  const seen = new Set();
  const out = [];
  for (let y = y0 - pad; y < y0 + C + pad; y++) {
    for (let x = x0 - pad; x < x0 + C + pad; x++) {
      const p = map.tileAt(x, y).prop;
      if (!p || seen.has(p)) continue;
      seen.add(p);
      const def = assets.getDef(p.sprite);
      if (def[key]) out.push({ prop: p, def });
    }
  }
  return out;
}

// The tint grid for a chunk: three Float32Arrays (r, g, b multipliers). The
// canopy is summed tree by tree over only the samples within each tree's
// reach, then the patch noise and the darkening are combined per sample.
function tintGrid(x0, y0) {
  const N = GRID * GRID;
  const canopy = new Float32Array(N);
  const gx0 = x0 - 1;
  const gy0 = y0 - 1;
  for (const { prop, def } of propsNear(x0, y0, REACH_MAX + 1, "canopy")) {
    const tx = prop.tile[0];
    const ty = prop.tile[1];
    const reach = def.canopy.reach;
    const i0 = Math.max(0, Math.ceil((tx - reach - gx0) * SPT));
    const i1 = Math.min(GRID - 1, Math.floor((tx + reach - gx0) * SPT));
    const j0 = Math.max(0, Math.ceil((ty - reach - gy0) * SPT));
    const j1 = Math.min(GRID - 1, Math.floor((ty + reach - gy0) * SPT));
    for (let j = j0; j <= j1; j++) {
      const dy = gy0 + j / SPT - ty;
      for (let i = i0; i <= i1; i++) {
        const dx = gx0 + i / SPT - tx;
        const d = Math.sqrt(dx * dx + dy * dy);
        if (d >= reach) continue;
        canopy[j * GRID + i] += Math.min(1, reach - d) / (1 + d);
      }
    }
  }
  // The biome per tile, looked up once per tile rather than per sample.
  const T = C + 3;
  const bioTile = new Array(T * T);
  for (let ty = 0; ty < T; ty++) for (let tx = 0; tx < T; tx++) bioTile[ty * T + tx] = biomeOf(gx0 + tx, gy0 + ty);
  const R = new Float32Array(N);
  const G = new Float32Array(N);
  const B = new Float32Array(N);
  for (let j = 0; j < GRID; j++) {
    const gy = gy0 + j / SPT;
    const ty = Math.round(j / SPT);
    for (let i = 0; i < GRID; i++) {
      const gx = gx0 + i / SPT;
      const bio = bioTile[ty * T + Math.round(i / SPT)];
      const p = bio.patch;
      const v = p.mix * map.valueNoise(gx, gy, p.scaleA, seed + 1) + (1 - p.mix) * map.valueNoise(gx, gy, p.scaleB, seed + 2);
      const k = j * GRID + i;
      const dark = 1 - Math.min(bio.canopy.max, bio.canopy.perTree * canopy[k]);
      R[k] = (p.r[0] + p.r[1] * v) * dark;
      G[k] = (p.g[0] + p.g[1] * v) * dark;
      B[k] = (p.b[0] + p.b[1] * v) * dark;
    }
  }
  return [R, G, B];
}

// Soft stepped shadows under every prop that declares one, within REACH_MAX
// of the chunk (a shadow can reach in from a neighbour): `steps` ellipses from
// the full size down to half, each darkening by `alpha`, Habbo-stepped, never a
// gradient. Only pixels this chunk owns are touched.
function bakeShadows(out, x0, y0, left, top) {
  for (const { prop, def } of propsNear(x0, y0, REACH_MAX, "shadow")) {
    const sh = biomeOf(prop.tile[0], prop.tile[1]).shadow;
    const sheet = assets.getSheet(prop.sprite);
    const fw = Object.values(sheet.frames)[0][2];
    const rx = def.shadow.width * fw;
    const ry = (rx * sh.squash) / 2;
    const cx = (prop.tile[0] - prop.tile[1]) * 32 - left;
    const cy = (prop.tile[0] + prop.tile[1]) * 16 - top + sh.dropPx;
    const px0 = Math.max(0, Math.floor(cx - rx));
    const px1 = Math.min(W - 1, Math.ceil(cx + rx));
    const py0 = Math.max(0, Math.floor(cy - ry));
    const py1 = Math.min(H - 1, Math.ceil(cy + ry));
    if (px0 > px1 || py0 > py1) continue;
    const steps = Math.max(1, sh.steps);
    const keep = [];
    for (let n = 0; n <= steps; n++) keep.push(Math.pow(1 - sh.alpha, n));
    for (let py = py0; py <= py1; py++) {
      const ey = (py + 0.5 - cy) / ry;
      for (let px = px0; px <= px1; px++) {
        const i = py * W + px;
        if (OWNER[i] < 0) continue;
        const ex = (px + 0.5 - cx) / rx;
        const e = Math.sqrt(ex * ex + ey * ey);
        if (e > 1) continue;
        let n = 0;
        for (let s = 0; s < steps; s++) if (e <= 1 - (steps > 1 ? (s * 0.5) / (steps - 1) : 0)) n++;
        const f = keep[n];
        const k = i * 4;
        out[k] = Math.round(out[k] * f);
        out[k + 1] = Math.round(out[k + 1] * f);
        out[k + 2] = Math.round(out[k + 2] * f);
      }
    }
  }
}

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
  const [TR, TG, TB] = tintGrid(x0, y0);
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
    let r, gg, bb;
    if (fy < g.h && gc >= 0 && gc < g.w && g.px[j + 3] > 0) {
      r = g.px[j];
      gg = g.px[j + 1];
      bb = g.px[j + 2];
    } else {
      const c = base[o];
      r = c[0];
      gg = c[1];
      bb = c[2];
    }
    // The grass takes the tint, read between the four nearest samples.
    const q = TI[i];
    const u = TU[i];
    const v = TV[i];
    const w00 = (1 - u) * (1 - v);
    const w10 = u * (1 - v);
    const w01 = (1 - u) * v;
    const w11 = u * v;
    const q1 = q + 1;
    const q2 = q + GRID;
    const q3 = q2 + 1;
    out[k] = Math.round(r * (TR[q] * w00 + TR[q1] * w10 + TR[q2] * w01 + TR[q3] * w11));
    out[k + 1] = Math.round(gg * (TG[q] * w00 + TG[q1] * w10 + TG[q2] * w01 + TG[q3] * w11));
    out[k + 2] = Math.round(bb * (TB[q] * w00 + TB[q1] * w10 + TB[q2] * w01 + TB[q3] * w11));
    out[k + 3] = 255;
  }
  bakeShadows(out, x0, y0, (x0 - y0 - C) * 32, (x0 + y0) * 16 - 16);
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
