// The light, ambient, and fog textures over the chunks around the camera (docs/08; docs/23a, B6): the static
// light composed on change, flicker and the carried light per frame, each texture uploaded only when it changed.
// Cut from src/render.js on 2026-10-12 (docs/23a, D5): a move, no rule changed; the frame check proves the pixels.
// Two sets since docs/49 step 2: the ground's (set 0, as it always was) and a storey's (set 1: the layer the viewer stands on when it is
// not the ground, else the first floor), each read from its own layer's light, rooms, and carried flames, over the same area.

import * as iso from "../iso.js";
import * as clock from "../clock.js";
import * as map from "../map.js";
import * as light from "../light.js";
import { tileKey } from "../visibility.js";
import * as gl from "../gl.js";

const CORE_GAIN = 1.4;

// camera position in its chunk, so it grows with the window (docs/02, the view).
export let areaTiles = 0;
let areaChunks = 0;

function makeSet(set) {
  const A = {
    layer: 0,
    lightArea: null,
    ambientArea: null,
    fogArea: null,
    // What each area texture was composed for, so a frame in which nothing moved
    // uploads nothing (docs/23a, B6). The static light (the chunk maps) is kept
    // apart from what changes per frame (flicker, the carried light).
    staticArea: null,
    staticKey: "",
    ambientKey: "",
    fogKey: "",
    fogVisible: null,
    ambientBase: null, // the ambient as the world has it (a lit room 1), composed when the key changes
    flickerRooms: [], // the lit rooms in the area whose fire flickers: [{ rec: { flicker, seed }, cells: [index, ...] }]
    lightEpoch: -1,
    wasDynamic: false, // the last frame had a carried light or a flicker in it: one more composition clears it
    dirty: null, // the light cells last frame's flicker and carried light wrote, [i0, i1, j0, j1] each; null: the whole area
    sized: 0,
  };
  function resize() {
    if (A.sized === areaChunks) return;
    A.sized = areaChunks;
    A.lightArea = new Uint8Array(areaTiles * light.RES * areaTiles * light.RES);
    A.staticArea = new Uint8Array(A.lightArea.length);
    A.staticKey = "";
    A.ambientKey = "";
    A.fogKey = "";
    A.ambientArea = new Uint8Array(areaTiles * areaTiles);
    A.ambientBase = new Uint8Array(areaTiles * areaTiles);
    A.flickerRooms = [];
    A.dirty = null;
    A.fogArea = new Uint8Array(areaTiles * areaTiles);
  }
  // ---- the light, ambient, and fog textures ----
  // Over the chunks around the camera: light at two cells per tile from the
  // CPU chunk maps plus the carried pool; ambient and fog at one texel per tile.
  function build(tiles, visible, drawAll, camGx, camGy, layer = 0) {
    resize();
    if (A.layer !== layer) {
      A.layer = layer;
      A.staticKey = "";
      A.ambientKey = "";
      A.fogKey = "";
    }
    const [ccx, ccy] = map.chunkCoord(Math.round(camGx), Math.round(camGy));
    const c0x = ccx - (areaChunks >> 1);
    const c0y = ccy - (areaChunks >> 1);
    const ox = c0x * map.CHUNK;
    const oy = c0y * map.CHUNK;
    const RES = light.RES;
    const LW = areaTiles * RES;
    const N = map.CHUNK * RES + 2;
    const now = performance.now() / 1000;
    const epoch = gl.getAreaEpoch();
    // The chunk maps, composed once per (camera chunk, world, sources): the static light.
    const sKey = `${c0x},${c0y}|${map.worldVersion}|${light.getSourcesVersion()}|${areaChunks}`;
    const entries = new Array(areaChunks * areaChunks);
    let anyFlicker = false;
    for (let cy = 0; cy < areaChunks; cy++) {
      for (let cx = 0; cx < areaChunks; cx++) {
        const entry = light.chunkLight(c0x + cx, c0y + cy, layer);
        entries[cy * areaChunks + cx] = entry;
        if (entry.any && entry.layers.length) anyFlicker = true;
      }
    }
    const staticChanged = sKey !== A.staticKey;
    if (staticChanged) {
      A.staticKey = sKey;
      A.staticArea.fill(0);
      for (let cy = 0; cy < areaChunks; cy++) {
        for (let cx = 0; cx < areaChunks; cx++) {
          const entry = entries[cy * areaChunks + cx];
          if (!entry.any) continue;
          const bx = cx * map.CHUNK * RES;
          const by = cy * map.CHUNK * RES;
          for (let j = 1; j <= map.CHUNK * RES; j++) {
            const row = (by + j - 1) * LW + bx;
            const src = j * N;
            for (let i = 1; i <= map.CHUNK * RES; i++) A.staticArea[row + i - 1] = Math.round(Math.max(0, entry.contrib[src + i]) * 255);
          }
        }
      }
    }
    // Per frame only when something moves: a flame's flicker, the torch in the hand, the burning;
    // and once more after it stops, so the last pool does not stay baked in (ground check 6 caught it).
    const carriers = light.carriers().filter((c) => (c.layer || 0) === layer); // a flame lights its own layer (docs/49 section 10)
    const dynamic = anyFlicker || carriers.length > 0;
    if (staticChanged || dynamic || A.wasDynamic || A.lightEpoch !== epoch) {
      // Only what last frame's flicker and carried light touched goes back to the static light (the review of #534: a storey's one
      // flickering lantern recomposed the whole area every frame); a new static light or a new texture takes the whole copy.
      if (staticChanged || A.lightEpoch !== epoch || !A.dirty) A.lightArea.set(A.staticArea);
      else for (const [i0, i1, j0, j1] of A.dirty) for (let j = j0; j <= j1; j++) A.lightArea.set(A.staticArea.subarray(j * LW + i0, j * LW + i1 + 1), j * LW + i0);
      const dirty = [];
      A.dirty = dirty;
      if (anyFlicker) {
        for (let cy = 0; cy < areaChunks; cy++) {
          for (let cx = 0; cx < areaChunks; cx++) {
            const entry = entries[cy * areaChunks + cx];
            if (!entry.any || !entry.layers.length) continue;
            const bx = cx * map.CHUNK * RES;
            const by = cy * map.CHUNK * RES;
            dirty.push([bx, bx + map.CHUNK * RES - 1, by, by + map.CHUNK * RES - 1]);
            // Flicker: each flickering source's own layer is taken back by the
            // share its weight leaves out this frame.
            const dims = entry.layers.map((l) => ({ own: l.contrib, loss: 1 - light.flickerWeight(l.flicker, l.seed, now) }));
            for (let j = 1; j <= map.CHUNK * RES; j++) {
              const row = (by + j - 1) * LW + bx;
              const src = j * N;
              for (let i = 1; i <= map.CHUNK * RES; i++) {
                let v = entry.contrib[src + i];
                for (const dl of dims) v -= dl.own[src + i] * dl.loss;
                A.lightArea[row + i - 1] = Math.round(Math.max(0, v) * 255);
              }
            }
          }
        }
      }
      // The torch in the hand, and the burning (fire.js), evaluated here rather than in any map.
      for (let ci = 0; ci < carriers.length; ci++) {
        const carrier = carriers[ci];
        const r = carrier.radius;
        const cw = light.flickerWeight(carrier.flicker, 1.3 + ci * 1.7, now);
        const i0 = Math.max(0, Math.floor((carrier.gx - r - ox + 0.25) * RES));
        const i1 = Math.min(LW - 1, Math.ceil((carrier.gx + r - ox + 0.25) * RES));
        const j0 = Math.max(0, Math.floor((carrier.gy - r - oy + 0.25) * RES));
        const j1 = Math.min(LW - 1, Math.ceil((carrier.gy + r - oy + 0.25) * RES));
        if (i0 <= i1 && j0 <= j1) dirty.push([i0, i1, j0, j1]);
        for (let j = j0; j <= j1; j++) {
          const gy = oy - 0.25 + j / RES;
          for (let i = i0; i <= i1; i++) {
            const gx = ox - 0.25 + i / RES;
            const d = Math.hypot(gx - carrier.gx, gy - carrier.gy);
            if (d >= r) continue;
            const v = (d < 0.6 ? 1 : Math.min(1, CORE_GAIN * (1 - d / r)) * light.lightPath(carrier.gx, carrier.gy, gx, gy, layer)) * cw;
            if (v <= 0) continue;
            const k = j * LW + i;
            A.lightArea[k] = Math.min(255, A.lightArea[k] + Math.round(v * 255));
          }
        }
      }
      gl.uploadLight(A.lightArea, LW, LW, set);
    }
    // Ambient: the rooms (the world), the fires (the sources), the clock, quantised as the texture is.
    const aKey = `${c0x},${c0y}|${map.worldVersion}|${light.getSourcesVersion()}|${Math.round(light.outdoorAmbient() * 255)}|${Math.round(clock.nightFactor() * 255)}|${areaChunks}|${epoch}`;
    // A lit room's light dips with its fire's flicker (Michael, 2026-10-27; light.roomFlickerWeight, `world.litRoomFlickerMin`): drawn here
    // alone, per frame on the wall clock as a flame's own pool is, from the world's steady ambient; the world's light never moves with it.
    if (aKey !== A.ambientKey) {
      A.ambientKey = aKey;
      const rooms = new Map();
      for (let ty = 0; ty < areaTiles; ty++) {
        for (let tx = 0; tx < areaTiles; tx++) {
          const i = ty * areaTiles + tx;
          A.ambientBase[i] = Math.round(light.ambientAt(ox + tx, oy + ty, layer) * 255);
          const id = map.tileAt(ox + tx, oy + ty, layer).room;
          const rec = id > 0 ? light.litRoomFlicker(id) : null;
          if (!rec) continue;
          if (!rooms.has(id)) rooms.set(id, { rec, cells: [] });
          rooms.get(id).cells.push(i);
        }
      }
      A.flickerRooms = [...rooms.values()];
      A.ambientArea.set(A.ambientBase);
      if (!A.flickerRooms.length) gl.uploadAmbient(A.ambientArea, areaTiles, areaTiles, set);
    }
    if (A.flickerRooms.length) {
      for (const r of A.flickerRooms) {
        const w = light.roomFlickerWeight(r.rec.flicker, r.rec.seed, now);
        for (const i of r.cells) A.ambientArea[i] = Math.round(A.ambientBase[i] * w);
      }
      gl.uploadAmbient(A.ambientArea, areaTiles, areaTiles, set);
    }
    // Fog: the visible set is a new Set each time sight is recomputed (main.js). A storey's fog is the ground's under it until sight is
    // kept per layer (docs/49 step 4).
    const fKey = `${c0x},${c0y}|${drawAll}|${areaChunks}|${epoch}`;
    if (fKey !== A.fogKey || visible !== A.fogVisible) {
      A.fogKey = fKey;
      A.fogVisible = visible;
      A.fogArea.fill(drawAll ? 255 : 0);
      if (!drawAll) {
        for (const [tx, ty] of tiles) {
          if (!visible.has(tileKey(tx, ty))) continue;
          const ax = tx - ox;
          const ay = ty - oy;
          if (ax < 0 || ay < 0 || ax >= areaTiles || ay >= areaTiles) continue;
          A.fogArea[ay * areaTiles + ax] = 255;
        }
      }
      gl.uploadFog(A.fogArea, areaTiles, areaTiles, set);
    }
    A.lightEpoch = epoch;
    A.wasDynamic = dynamic;
    return [ox, oy];
  }
  return { build };
}

const ground = makeSet(0);
const storeys = Array.from({ length: gl.STOREY_SETS }, (_, i) => makeSet(i + 1)); // the storeys in view, one set each (docs/53 section 6.4)

export function ensureArea(w, h) {
  // Tiles from the camera to the view's corner, plus tall sprites and margin.
  const r = (w / 2 / iso.HW + h / 2 / iso.HH) / 2 + 6;
  const need = 2 * Math.ceil(r / map.CHUNK) + 1;
  if (need === areaChunks) return;
  areaChunks = need;
  areaTiles = need * map.CHUNK;
}

export function buildArea(tiles, visible, drawAll, camGx, camGy) {
  return ground.build(tiles, visible, drawAll, camGx, camGy, 0);
}

// A storey's own set, `set` 1 to STOREY_SETS (docs/53 section 6.4): `layer`'s light, ambient, and fog over the same area as the ground's.
export function buildStoreyArea(tiles, visible, drawAll, camGx, camGy, layer, set = 1) {
  return storeys[set - 1].build(tiles, visible, drawAll, camGx, camGy, layer);
}
