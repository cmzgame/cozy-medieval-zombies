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
import { getDef } from "./assets.js";
import { world as W } from "./tuning.js";

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

let litRooms = new Map(); // room id -> its lit fire's flicker ({ flicker, seed }, or null for a steady one), refreshed each step
let curSources = []; // lit static sources, refreshed each step
let carried = []; // the lights in players' hands, one per carrier: { owner, gx, gy, radius, flicker, strength }
let burners = []; // burning characters as lights (fire.js), evaluated like the carrier
let srcVersion = 0; // bumped when the list of sources changes (a fire lit, a portal's intensity moving with the clock)
let lastSourcesDesc = "";

// Once per logic step, after the rooms are current: lit rooms, then fires
// and mounted torches, then the portals, which need the ambients.
export function update() {
  litRooms = new Map();
  curSources = [];
  for (const p of map.fires()) {
    if (!p.fire.lit) continue;
    if (p.fire.room) {
      const id = map.tileAt(p.tile[0], p.tile[1]).room;
      if (id > 0 && !litRooms.has(id)) litRooms.set(id, p.fire.flicker ? { flicker: p.fire.flicker, seed: sourceSeed(p.tile[0], p.tile[1]) } : null); // the first lit fire in it sets its flicker
    }
    if (p.fire.radius > 0) curSources.push({ gx: p.tile[0], gy: p.tile[1], radius: p.fire.radius, intensity: 1, kind: p.sprite, flicker: p.fire.flicker });
  }
  const torchFire = getItem("torch").fire;
  for (const b of map.brackets()) {
    if (b.wall.bracket.lantern) {
      if (b.wall.bracket.lit === false) continue; // a lantern put out (docs/43, section 3)
      const [lx, ly] = map.bracketPos(b);
      curSources.push({ gx: lx, gy: ly, radius: getDef("lantern_post").fire.radius, intensity: 1, kind: "lantern", flicker: null }); // steady, burning nothing; the one number is the lantern post's `fire.radius` (data/sprites/lantern_post.json)
      continue;
    }
    if (!b.wall.bracket.torch || b.wall.bracket.lit === false) continue; // a mounted torch that is out gives no light
    const [gx, gy] = map.bracketPos(b);
    curSources.push({ gx, gy, radius: torchFire.radius, intensity: 1, kind: "torch", flicker: torchFire.flicker });
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
  // One version number for the whole list, so the chunk signatures and the
  // renderer's area can ask "did the sources change?" without a string each (docs/23a, B4, B6).
  const desc = curSources.map(describe).join("|");
  if (desc !== lastSourcesDesc) {
    lastSourcesDesc = desc;
    srcVersion++;
  }
}

function describe(l) {
  return `${l.gx},${l.gy},${l.radius},${Math.round(l.intensity * 20)}${l.dir ? `,${l.dir[0]},${l.dir[1]}` : ""}`;
}

export function getSourcesVersion() {
  return srcVersion;
}

export function outdoorAmbient() {
  return Math.min(tunables.dayCap, clock.getBrightness());
}

// How much night the renderer should draw for an ambient level, 0..1.
export function darknessOf(ambient) {
  const floor = clock.NIGHT_BRIGHTNESS;
  return clamp01((1 - ambient) / (1 - floor));
}

// 0..1: how much daylight a room's open shutters and open doors admit. An open one lights `world.daylightTiles` tiles of
// the room fully by day (Michael, 2026-10-17, #150: "opening windows fully ... should basically light the same room fully"):
// one open window a small room, more a large one in proportion to its size; a shuttered one admits only its leak, so a
// shuttered room stays dark by day ("a downside"), and the sight of the dead in it with it (sight.js).
// Returned as the two shares: `open`, the part the open ones light (0..1, in proportion to the room's size), and `leak`, the
// part the shut ones let through.
export function daylightShares(room) {
  let open = 0;
  let leak = 0;
  for (const op of room.openings) {
    const w = map.tileAt(op.tx, op.ty)[op.edge];
    if (!w) continue;
    const t = map.transmission(w);
    if (t >= 0.5) open += t;
    else leak += t;
  }
  const size = Math.max(1, room.size || 1);
  return { open: Math.min(1, (open * W.daylightTiles) / size), leak: Math.min(1, leak * tunables.openingDaylight) };
}

export function openness(room) {
  const s = daylightShares(room);
  return Math.min(1, s.open + s.leak);
}

// A lit fire that lights its room (a fireplace, a fire pit) lights its whole room. Without one, the room keeps a share of
// the flat daylight its openings admit (the rest is pooled by the portals),
// down to night-dark when shuttered. This is the world's light (the dead's sight reads it): a lit room is 1, steady; its flicker is the
// renderer's alone (`drawnRoomWeight`).
export function roomAmbient(id) {
  if (litRooms.has(id)) return 1;
  const room = map.getRoom(id);
  if (!room) return outdoorAmbient();
  const floor = clock.NIGHT_BRIGHTNESS;
  const day = 1 - clock.nightFactor();
  // The open ones' share lights the room to the cap by day (an open room is lit fully, Michael, #150); the shut ones' leak keeps
  // only `roomBounce` of its flat light (the portals pool the rest), so a shuttered room stays dark.
  const s = daylightShares(room);
  return floor + (tunables.unlitRoomCap - floor) * day * Math.min(1, s.open + s.leak * tunables.roomBounce);
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
  carried = c ? [c] : [];
}

// One per player who carries a flame, each with its owner's id (docs/31/05, item 15).
export function setCarriers(list) {
  carried = list;
}

// The burning bodies (fire.js): moving lights evaluated at query time like the
// torch, so nothing re-bakes as they walk. Not flames the dead notice: burning is
// real since #14 (burn.js), but the dead noticing it is not built (docs/05).
export function setBurners(list) {
  burners = list;
}

// Every light evaluated at query time: the torch in hand, then the burning.
export function carriers() {
  return carried.length ? [...carried, ...burners] : burners;
}

// Every lit flame, static and carried, for the dead to notice at night.
// Portals are not flames: the dead are drawn to fire, not to a doorway.
export function allSources() {
  const flames = curSources.filter((s) => s.kind !== "portal");
  return carried.length ? [...flames, ...carried.map((c) => ({ ...c, carried: true }))] : flames;
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

// ---- the static map, per chunk ----

const cache = new Map(); // chunk key -> { sig, contrib, layers, any }
const sigCache = new Map(); // chunk key -> { sv, lv, sig }: the signature, rebuilt only when the sources or the chunk's walls changed

// A dropped chunk takes its light with it (docs/23a, B2).
export function forgetChunk(key) {
  cache.delete(key);
  sigCache.delete(key);
}

// A world restored from a save has new chunks under the old keys: forget them all (docs/31/05, item 24).
export function forgetAll() {
  cache.clear();
  sigCache.clear();
  srcVersion++;
}
map.onEvict(forgetChunk);

// Flicker (docs/08, Phase 3): a source's weight this instant, 1 - amp .. 1,
// from two slow sines with a seed per source, so flames never beat together.
// Applied where the light map is composed for the GPU, never in the chunk
// maps, so the ray grid is untouched.
export function flickerWeight(flicker, seed, t) {
  if (!flicker) return 1;
  return 1 - flicker.amp * (0.35 + 0.65 * flickerDip(flicker, seed, t));
}

// How far down its flicker a flame is this instant, 0 (its brightest) to 1 (its lowest): the two sines' product, the one shape the
// fire's own pool and its room's dip both follow.
function flickerDip(flicker, seed, t) {
  const a = Math.sin(t * flicker.speed + seed) * 0.5 + 0.5;
  const b = Math.sin(t * flicker.speed * 1.73 + seed * 2.1) * 0.5 + 0.5;
  return a * b;
}

// A source's seed, from where it stands (the fire's own pool and its room's dip share it, so they move together).
export function sourceSeed(gx, gy) {
  return (gx * 7.3 + gy * 3.1) % 6.28;
}

// The fires' flicker darkens a lit room a little (Michael, 2026-10-27: "it can flicker down from now in light, it'll still be mostly lit,
// and the flicker darkening it for a second is realistic"; "tunable is better"): the drawn weight of a lit room's light this instant, from 1
// at its fire's brightest down to `min` at its lowest (`world.litRoomFlickerMin` in data/tuning.json, docs/42), in time with the fire's own
// pool. Pure, and the renderer's alone (render/area.js, on the wall clock): the world's light (`roomAmbient`, which the dead's sight reads)
// stays 1, so nothing in the simulation flickers, nothing crosses the wire, and host and guest step the same world.
export function roomFlickerWeight(flicker, seed, t, min = W.litRoomFlickerMin) {
  if (!flicker) return 1;
  return 1 - (1 - min) * flickerDip(flicker, seed, t);
}

// The flicker a lit room's light follows ({ flicker, seed }), or null: a room not lit by a fire, or lit by a steady one.
export function litRoomFlicker(id) {
  return litRooms.get(id) || null;
}

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
// on the walls near it, which cast the shadows: the chunk's own light version
// (map.touch bumps it for the touched chunk and its neighbours), not the
// world's, so a door across the village rebuilds nothing here (docs/23a, B4).
// Memoised per chunk on the sources' version and the chunk's, so lightAt
// builds no string.
function sigFor(cx, cy, key) {
  const c = map.getChunk(cx, cy, false);
  const lv = c ? c.lightVersion : 0;
  const m = sigCache.get(key);
  if (m && m.sv === srcVersion && m.lv === lv) return m.sig;
  let s = `${lv}`;
  for (const l of curSources) {
    if (!reaches(l, cx, cy)) continue;
    s += `|${describe(l)}`;
  }
  sigCache.set(key, { sv: srcVersion, lv, sig: s });
  return s;
}

function build(cx, cy, sig) {
  const contrib = new Float32Array(N * N);
  // Sources that flicker keep their own layer too, so the composer can scale
  // each by its weight this frame.
  const layers = [];
  let any = false;
  const x0 = cx * map.CHUNK - 0.5;
  const y0 = cy * map.CHUNK - 0.5;
  for (const l of curSources) {
    if (!reaches(l, cx, cy)) continue;
    const own = l.flicker ? new Float32Array(N * N) : null;
    if (own) layers.push({ contrib: own, flicker: l.flicker, seed: sourceSeed(l.gx, l.gy) });
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
        const v = Math.min(1, CORE_GAIN * (1 - d / l.radius)) * intensity * through;
        contrib[k] = Math.min(1, contrib[k] + v);
        if (own) own[k] = v;
        any = true;
      }
    }
  }
  return { sig, contrib, layers, any };
}

// The map of a chunk, rebuilt if its sources or the walls changed.
export function chunkLight(cx, cy, layer = 0) {
  const key = map.chunkKey(cx, cy, layer);
  const sig = sigFor(cx, cy, key);
  let entry = cache.get(key);
  if (!entry || entry.sig !== sig) {
    entry = build(cx, cy, sig);
    cache.set(key, entry);
  }
  return entry;
}

export function resetCache() {
  cache.clear();
  sigCache.clear();
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
  for (const c of carriers()) {
    if (l >= 1) break;
    const d = Math.hypot(gx - c.gx, gy - c.gy);
    // Holding a torch (or burning) makes you a fully visible point in the dark.
    if (d < 0.6) l += 1;
    else if (d < c.radius) l += Math.min(1, CORE_GAIN * (1 - d / c.radius)) * lightPath(c.gx, c.gy, gx, gy);
  }
  return Math.min(1, l);
}
