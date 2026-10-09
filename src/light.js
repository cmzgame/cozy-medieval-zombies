// Light as a game quantity: how lit is a position, 0..1? Read by zombie sight,
// the renderer, and later the records. Written fresh for the chunked map on
// 2026-10-09 after cozy-zombie-game src/light.js, whose shape it keeps: one
// function, `lightAt`, equal to ambient plus a cached shadowed map of static
// sources plus the light you carry. See docs/07-lighting.md and docs/08.
//
// What changes from the parent: ambient is per tile (the clock outdoors, the
// room's hearth and openings indoors), the static map is per chunk and
// computed one cell beyond the chunk so neighbours draw without seams, light
// multiplies through what it crosses by each edge's transmission (sight is the
// same blockers above a half), and every opening is a source on its darker
// side with the brighter side's ambient as its intensity: portals (docs/08).

import * as clock from "./clock.js";
import * as map from "./map.js";
import { getItem } from "./items.js";

export const RES = 2; // light cells per tile, so shadow edges are soft
const N = map.CHUNK * RES + 2; // cells across a chunk's map, one beyond each side
const CORE_GAIN = 1.4; // the inner part of a pool is fully lit before it falls off
const PORTAL_RADIUS = { door: 3, window: 2.5 };
const PORTAL_MIN = 0.1; // a portal needs this much difference between its sides
const PORTAL_OFF = 0.3; // tiles off the edge, on the darker side

// Tunables Michael picks by eye (docs/07, "The look"). Live on window.__game.light.
export const tunables = {
  dayCap: 0.92, // full day is never quite full: Halloween never ends here
  unlitRoomCap: 0.88, // window-lit is slightly dimmer than hearth-lit
  openingDaylight: 0.5, // openness per open shutter or open door
  roomBounce: 0.5, // how much of the flat openness light an unlit room keeps; the portals pool the rest (docs/08)
};

function clamp01(v) {
  return Math.max(0, Math.min(1, v));
}

// ---- ambient ----

let litRooms = new Set(); // room ids with a lit hearth, refreshed each step
let curSources = []; // lit static sources, refreshed each step
let carrier = null; // { gx, gy, radius }: the torch in the player's hand, or null

// Once per logic step, after the rooms are current: lit rooms, then fires
// and mounted torches, then the portals, which need the ambients.
export function update() {
  litRooms = new Set();
  curSources = [];
  for (const p of map.fires()) {
    if (!p.fire.lit) continue;
    if (p.fire.room) {
      const id = map.tileAt(p.tile[0], p.tile[1]).room;
      if (id > 0) litRooms.add(id);
    }
    if (p.fire.radius > 0) curSources.push({ gx: p.tile[0], gy: p.tile[1], radius: p.fire.radius, intensity: 1, kind: p.sprite, flicker: p.fire.flicker });
  }
  const torchRadius = getItem("torch").fire.radius;
  for (const b of map.brackets()) {
    if (!b.wall.bracket.torch) continue;
    const [gx, gy] = map.bracketPos(b);
    curSources.push({ gx, gy, radius: torchRadius, intensity: 1, kind: "torch" });
  }
  // Portals: an opening is a source on its darker side, as bright as the
  // difference between its sides, through its transmission, lighting only
  // that side. A lit room glows out of its window at night; a window pools
  // daylight on the floor by day. One rule for both (Michael, 2026-10-09).
  for (const room of map.allRooms()) {
    for (const op of room.openings) {
      const wall = map.tileAt(op.tx, op.ty)[op.edge];
      if (!wall) continue;
      const t = map.transmission(wall);
      if (t <= 0) continue;
      // The near side of an edge is the tile it belongs to; the far side the
      // tile north or west of it.
      const nearA = ambientAt(op.tx, op.ty);
      const farA = op.edge === "n" ? ambientAt(op.tx, op.ty - 1) : ambientAt(op.tx - 1, op.ty);
      const diff = Math.abs(nearA - farA) * t;
      if (diff < PORTAL_MIN) continue;
      const toDark = nearA > farA ? -1 : 1; // +1 toward the near side
      const mx = op.edge === "n" ? op.tx : op.tx - 0.5;
      const my = op.edge === "n" ? op.ty - 0.5 : op.ty;
      const nx = op.edge === "n" ? 0 : toDark;
      const ny = op.edge === "n" ? toDark : 0;
      curSources.push({
        gx: mx + nx * PORTAL_OFF,
        gy: my + ny * PORTAL_OFF,
        radius: PORTAL_RADIUS[wall.kind] || 2.5,
        intensity: diff,
        dir: [nx, ny],
        kind: "portal",
      });
    }
  }
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
    o += tunables.openingDaylight * map.transmission(w);
  }
  return Math.min(1, o);
}

// A lit hearth lights its whole room. Without one, the room keeps a share of
// the flat daylight its openings admit (the rest is pooled by the portals),
// down to night-dark when shuttered.
export function roomAmbient(id) {
  if (litRooms.has(id)) return 1;
  const room = map.getRoom(id);
  if (!room) return outdoorAmbient();
  const floor = clock.NIGHT_BRIGHTNESS;
  const day = 1 - clock.nightFactor();
  return floor + (tunables.unlitRoomCap - floor) * day * openness(room) * tunables.roomBounce;
}

export function ambientAt(x, y, layer = 0) {
  const id = map.tileAt(x, y, layer).room;
  return id > 0 ? roomAmbient(id) : outdoorAmbient();
}

export function sources() {
  return curSources;
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
// Portals are not flames: the dead are drawn to fire, not to a doorway.
export function allSources() {
  const flames = curSources.filter((s) => s.kind !== "portal");
  return carrier ? [...flames, { ...carrier, carried: true }] : flames;
}

// ---- rays ----

// How much of a source's light reaches (bx, by) from (ax, ay): the product of
// the transmissions of every edge crossed, zero past an opaque prop. The same
// grid walk as sight (visibility.js); the source's own tile and the target's
// never block.
const MAX_STEPS = 400;
export function lightPath(ax, ay, bx, by) {
  let ix = Math.round(ax);
  let iy = Math.round(ay);
  const tx = Math.round(bx);
  const ty = Math.round(by);
  if (ix === tx && iy === ty) return 1;
  const dx = bx - ax;
  const dy = by - ay;
  const stepX = Math.sign(dx);
  const stepY = Math.sign(dy);
  let tMaxX = dx !== 0 ? ((stepX > 0 ? ix + 0.5 : ix - 0.5) - ax) / dx : Infinity;
  let tMaxY = dy !== 0 ? ((stepY > 0 ? iy + 0.5 : iy - 0.5) - ay) / dy : Infinity;
  const tDeltaX = dx !== 0 ? Math.abs(1 / dx) : Infinity;
  const tDeltaY = dy !== 0 ? Math.abs(1 / dy) : Infinity;
  let through = 1;
  let guard = 0;
  while ((ix !== tx || iy !== ty) && guard++ < MAX_STEPS) {
    if (tMaxX < tMaxY) {
      const nx = ix + stepX;
      through *= map.transmission(map.wallBetween(ix, iy, nx, iy));
      ix = nx;
      tMaxX += tDeltaX;
    } else {
      const ny = iy + stepY;
      through *= map.transmission(map.wallBetween(ix, iy, ix, ny));
      iy = ny;
      tMaxY += tDeltaY;
    }
    if (through <= 0.001) return 0;
    if (ix !== tx || iy !== ty) {
      const p = map.tileAt(ix, iy).prop;
      if (p && p.opaque) return 0;
    }
  }
  return through;
}

// March a ray from (gx, gy) along (dx, dy), stopping at a sight-blocking edge
// or an opaque prop, at most `range` tiles. Returns the grid endpoint. Used to
// outline the carried pool.
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

// ---- the static map, per chunk ----

const cache = new Map(); // chunk key -> { sig, contrib, canvas, any }

// Grid position of the centre of cell i (0..N-1) along one axis of chunk c.
function cellGrid(c, i) {
  return c * map.CHUNK - 0.5 + (i - 0.5) / RES;
}

// Does source l reach chunk (cx, cy) at all?
function reaches(l, cx, cy) {
  const x0 = cx * map.CHUNK - 0.5;
  const y0 = cy * map.CHUNK - 0.5;
  const x1 = x0 + map.CHUNK;
  const y1 = y0 + map.CHUNK;
  return !(l.gx + l.radius < x0 || l.gx - l.radius > x1 || l.gy + l.radius < y0 || l.gy - l.radius > y1);
}

// A chunk's map depends on the sources within their radius of it, their
// intensity (portals change with the clock, so it is rounded to steps), and
// on the walls, which cast the shadows.
function sigFor(cx, cy) {
  let s = `${map.worldVersion}`;
  for (const l of curSources) {
    if (!reaches(l, cx, cy)) continue;
    s += `|${l.gx},${l.gy},${l.radius},${Math.round(l.intensity * 20)}${l.dir ? `,${l.dir[0]},${l.dir[1]}` : ""}`;
  }
  return s;
}

function build(cx, cy, sig) {
  const contrib = new Float32Array(N * N);
  let any = false;
  const x0 = cx * map.CHUNK - 0.5;
  const y0 = cy * map.CHUNK - 0.5;
  for (const l of curSources) {
    if (!reaches(l, cx, cy)) continue;
    // Only the cells within the radius.
    const i0 = Math.max(0, Math.floor((l.gx - l.radius - x0) * RES + 0.5));
    const i1 = Math.min(N - 1, Math.ceil((l.gx + l.radius - x0) * RES + 0.5));
    const j0 = Math.max(0, Math.floor((l.gy - l.radius - y0) * RES + 0.5));
    const j1 = Math.min(N - 1, Math.ceil((l.gy + l.radius - y0) * RES + 0.5));
    if (i1 < i0 || j1 < j0) continue;
    const intensity = Math.round(l.intensity * 20) / 20;
    for (let j = j0; j <= j1; j++) {
      const gy = cellGrid(cy, j);
      for (let i = i0; i <= i1; i++) {
        const gx = cellGrid(cx, i);
        const d = Math.hypot(gx - l.gx, gy - l.gy);
        if (d >= l.radius) continue;
        // A portal lights only its darker side.
        if (l.dir && (gx - l.gx) * l.dir[0] + (gy - l.gy) * l.dir[1] < -0.05) continue;
        const through = lightPath(l.gx, l.gy, gx, gy);
        if (through <= 0) continue;
        const k = j * N + i;
        contrib[k] = Math.min(1, contrib[k] + Math.min(1, CORE_GAIN * (1 - d / l.radius)) * intensity * through);
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
export function chunkLight(cx, cy, layer = 0) {
  const key = map.chunkKey(cx, cy, layer);
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
export function staticContribAt(gx, gy, layer = 0) {
  const [cx, cy] = map.chunkCoord(Math.round(gx), Math.round(gy));
  const entry = chunkLight(cx, cy, layer);
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
export function lightAt(gx, gy, layer = 0) {
  let l = ambientAt(Math.round(gx), Math.round(gy), layer);
  if (l >= 1) return 1;
  l += staticContribAt(gx, gy, layer);
  if (carrier && l < 1) {
    const d = Math.hypot(gx - carrier.gx, gy - carrier.gy);
    // Holding a torch makes you a fully visible point in the dark.
    if (d < 0.6) l += 1;
    else if (d < carrier.radius) l += Math.min(1, CORE_GAIN * (1 - d / carrier.radius)) * lightPath(carrier.gx, carrier.gy, gx, gy);
  }
  return Math.min(1, l);
}
