// Light as a game quantity: how lit is a position, 0..1? Read by zombie sight,
// the renderer, and later the records. Written fresh for the chunked map on
// 2026-10-09 after cozy-zombie-game src/light.js, whose shape it keeps: one
// function, `lightAt`, equal to ambient plus a cached shadowed map of static
// sources plus the light you carry. See docs/07-lighting.md.
//
// What changes from the parent: ambient is per tile (the clock outdoors, the
// room's hearth and openings indoors), the static map is per chunk and
// computed one cell beyond the chunk so neighbours draw without seams, and
// the path test is the same edge walk sight uses, so light and sight share one
// set of blockers.

import * as clock from "./clock.js";
import * as map from "./map.js";
import { lineOfSight } from "./visibility.js";
import { getItem } from "./items.js";

export const RES = 2; // light cells per tile, so shadow edges are soft
const N = map.CHUNK * RES + 2; // cells across a chunk's map, one beyond each side
const CORE_GAIN = 1.4; // the inner part of a pool is fully lit before it falls off

// Tunables Michael picks by eye (docs/07, "The look"). Live on window.__game.light.
export const tunables = {
  dayCap: 0.92, // full day is never quite full: Halloween never ends here
  unlitRoomCap: 0.88, // window-lit is slightly dimmer than hearth-lit
  openingDaylight: 0.5, // openness per open shutter or open door
};

function clamp01(v) {
  return Math.max(0, Math.min(1, v));
}

// ---- ambient ----

let litRooms = new Set(); // room ids with a lit hearth, refreshed each step
let curSources = []; // lit static sources, refreshed each step
let carrier = null; // { gx, gy, radius }: the torch in the player's hand, or null

// Once per logic step, after the rooms are current.
export function update() {
  litRooms = new Set();
  curSources = [];
  for (const p of map.fires()) {
    if (!p.fire.lit) continue;
    if (p.fire.room) {
      const id = map.tileAt(p.tile[0], p.tile[1]).room;
      if (id > 0) litRooms.add(id);
    }
    if (p.fire.radius > 0) curSources.push({ gx: p.tile[0], gy: p.tile[1], radius: p.fire.radius });
  }
  const torchRadius = getItem("torch").fire.radius;
  for (const b of map.brackets()) {
    if (!b.wall.bracket.torch) continue;
    const [gx, gy] = map.bracketPos(b);
    curSources.push({ gx, gy, radius: torchRadius });
  }
}

// The light you carry is not in any map: it is evaluated at query time, so the
// drawn pool, the sight test, and the light value always agree.
export function setCarrier(c) {
  carrier = c;
}

export function carried() {
  return carrier;
}

// Every lit flame, static and carried, for the dead to notice at night.
export function allSources() {
  return carrier ? [...curSources, { ...carrier, carried: true }] : curSources;
}

// March a ray from (gx, gy) along (dx, dy), stopping at a sight-blocking edge
// or an opaque prop, at most `range` tiles. Returns the grid endpoint.
const RAY_STEP = 0.15;
export function castRay(gx, gy, dx, dy, range) {
  let x = gx;
  let y = gy;
  let tx = Math.round(x);
  let ty = Math.round(y);
  for (let t = 0; t < range; t += RAY_STEP) {
    const nx = x + dx * RAY_STEP;
    const ny = y + dy * RAY_STEP;
    const ntx = Math.round(nx);
    const nty = Math.round(ny);
    if (ntx !== tx) {
      if (map.blocksSight(map.wallBetween(tx, ty, ntx, ty))) return { gx: x, gy: y };
      const p = map.tileAt(ntx, ty).prop;
      if (p && p.opaque) return { gx: x, gy: y };
      tx = ntx;
    }
    if (nty !== ty) {
      if (map.blocksSight(map.wallBetween(tx, ty, tx, nty))) return { gx: x, gy: y };
      const p = map.tileAt(tx, nty).prop;
      if (p && p.opaque) return { gx: x, gy: y };
      ty = nty;
    }
    x = nx;
    y = ny;
  }
  return { gx: x, gy: y };
}

// The outline of the carried pool: ray endpoints around the carrier.
export const POOL_RAYS = 28;
export function poolRays() {
  if (!carrier) return [];
  const pts = [];
  for (let i = 0; i < POOL_RAYS; i++) {
    const a = (i / POOL_RAYS) * Math.PI * 2;
    pts.push(castRay(carrier.gx, carrier.gy, Math.cos(a), Math.sin(a), carrier.radius));
  }
  return pts;
}

export function outdoorAmbient() {
  return Math.min(tunables.dayCap, clock.getBrightness());
}

// How much night the renderer should draw for an ambient level, 0..1.
export function darknessOf(ambient) {
  const floor = clock.NIGHT_BRIGHTNESS;
  return clamp01((1 - ambient) / (1 - floor));
}

// 0..1: how much daylight a room's open shutters and open doors admit.
export function openness(room) {
  let o = 0;
  for (const op of room.openings) {
    const w = map.tileAt(op.tx, op.ty)[op.edge];
    if (!w) continue;
    const open = w.kind === "door" ? w.open : w.shutter === "open";
    if (open) o += tunables.openingDaylight;
  }
  return Math.min(1, o);
}

// A lit hearth lights its whole room. Without one, the room gets whatever
// daylight its openings let in, down to night-dark when shuttered.
export function roomAmbient(id) {
  if (litRooms.has(id)) return 1;
  const room = map.getRoom(id);
  if (!room) return outdoorAmbient();
  const floor = clock.NIGHT_BRIGHTNESS;
  const day = 1 - clock.nightFactor();
  return floor + (tunables.unlitRoomCap - floor) * day * openness(room);
}

export function ambientAt(x, y) {
  const id = map.tileAt(x, y).room;
  return id > 0 ? roomAmbient(id) : outdoorAmbient();
}

export function sources() {
  return curSources;
}

// ---- the static map, per chunk ----

const cache = new Map(); // chunk key -> { sig, contrib, canvas, any }

// Grid position of the centre of cell i (0..N-1) along one axis of chunk c.
function cellGrid(c, i) {
  return c * map.CHUNK - 0.5 + (i - 0.5) / RES;
}

// A chunk's map depends on the sources within their radius of it and on the
// walls, which cast the shadows.
function sigFor(cx, cy) {
  const x0 = cx * map.CHUNK - 0.5;
  const y0 = cy * map.CHUNK - 0.5;
  const x1 = x0 + map.CHUNK;
  const y1 = y0 + map.CHUNK;
  let s = `${map.worldVersion}`;
  for (const l of curSources) {
    if (l.gx + l.radius < x0 || l.gx - l.radius > x1 || l.gy + l.radius < y0 || l.gy - l.radius > y1) continue;
    s += `|${l.gx},${l.gy},${l.radius}`;
  }
  return s;
}

function build(cx, cy, sig) {
  const contrib = new Float32Array(N * N);
  let any = false;
  const x0 = cx * map.CHUNK - 0.5;
  const y0 = cy * map.CHUNK - 0.5;
  for (const l of curSources) {
    // Only the cells within the radius, and only for sources that reach the chunk.
    const i0 = Math.max(0, Math.floor((l.gx - l.radius - x0) * RES + 0.5));
    const i1 = Math.min(N - 1, Math.ceil((l.gx + l.radius - x0) * RES + 0.5));
    const j0 = Math.max(0, Math.floor((l.gy - l.radius - y0) * RES + 0.5));
    const j1 = Math.min(N - 1, Math.ceil((l.gy + l.radius - y0) * RES + 0.5));
    if (i1 < i0 || j1 < j0) continue;
    for (let j = j0; j <= j1; j++) {
      const gy = cellGrid(cy, j);
      for (let i = i0; i <= i1; i++) {
        const gx = cellGrid(cx, i);
        const d = Math.hypot(gx - l.gx, gy - l.gy);
        if (d >= l.radius) continue;
        // The source's own tile and the target's never block (lineOfSight
        // tests the edges crossed and the props of the tiles between).
        if (!lineOfSight(l.gx, l.gy, gx, gy)) continue;
        const k = j * N + i;
        contrib[k] = Math.min(1, contrib[k] + Math.min(1, CORE_GAIN * (1 - d / l.radius)));
        any = true;
      }
    }
  }
  // The same data as a tiny image: alpha = how much darkness to remove. The
  // renderer draws it through the iso transform with smoothing on, the one
  // place scaling in drawImage is allowed (docs/02, 2026-10-09).
  let canvas = null;
  if (any) {
    canvas = document.createElement("canvas");
    canvas.width = N;
    canvas.height = N;
    const ctx = canvas.getContext("2d");
    const img = ctx.createImageData(N, N);
    for (let k = 0; k < N * N; k++) {
      const o = k * 4;
      img.data[o] = 255;
      img.data[o + 1] = 255;
      img.data[o + 2] = 255;
      img.data[o + 3] = Math.round(contrib[k] * 255);
    }
    ctx.putImageData(img, 0, 0);
  }
  return { sig, contrib, canvas, any };
}

// The map of a chunk, rebuilt if its sources or the walls changed.
export function chunkLight(cx, cy) {
  const key = map.chunkKey(cx, cy);
  const sig = sigFor(cx, cy);
  let entry = cache.get(key);
  if (!entry || entry.sig !== sig) {
    entry = build(cx, cy, sig);
    cache.set(key, entry);
  }
  return entry;
}

export function resetCache() {
  cache.clear();
}

// Bilinear sample of the static contribution at a grid position, 0..1.
export function staticContribAt(gx, gy) {
  const [cx, cy] = map.chunkCoord(Math.round(gx), Math.round(gy));
  const entry = chunkLight(cx, cy);
  if (!entry.any) return 0;
  const u = Math.max(0, Math.min(N - 1, (gx - (cx * map.CHUNK - 0.5)) * RES + 0.5));
  const v = Math.max(0, Math.min(N - 1, (gy - (cy * map.CHUNK - 0.5)) * RES + 0.5));
  const i0 = Math.floor(u);
  const j0 = Math.floor(v);
  const i1 = Math.min(N - 1, i0 + 1);
  const j1 = Math.min(N - 1, j0 + 1);
  const fu = u - i0;
  const fv = v - j0;
  const c = entry.contrib;
  const a = c[j0 * N + i0] * (1 - fu) + c[j0 * N + i1] * fu;
  const b = c[j1 * N + i0] * (1 - fu) + c[j1 * N + i1] * fu;
  return a * (1 - fv) + b * fv;
}

// Light level at a grid position, 0..1: ambient + static map + carried light.
export function lightAt(gx, gy) {
  let l = ambientAt(Math.round(gx), Math.round(gy));
  if (l >= 1) return 1;
  l += staticContribAt(gx, gy);
  if (carrier && l < 1) {
    const d = Math.hypot(gx - carrier.gx, gy - carrier.gy);
    // Holding a torch makes you a fully visible point in the dark.
    if (d < 0.6) l += 1;
    else if (d < carrier.radius && lineOfSight(carrier.gx, carrier.gy, gx, gy)) l += Math.min(1, CORE_GAIN * (1 - d / carrier.radius));
  }
  return Math.min(1, l);
}
