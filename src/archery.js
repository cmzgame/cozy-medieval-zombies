// The bow and arrow (docs/20), step 1: the arc on its own. An arrow is a point
// moving in a straight line along the ground at a steady speed, from the archer
// to a landing point fixed the moment it is released; the arc is only visual,
// the arrow drawn above that point at a height that is zero at the landing
// point, highest at the midpoint, and begins at the bow's height. A shadow is
// drawn at the ground point. Nothing here is hitscan and nothing is rolled: the
// same release always flies the same path. Hits, the draw, and the bow in the
// hands come in the next steps; for now a landed arrow drops as a floor item.

import * as iso from "./iso.js";
import * as map from "./map.js";
import { emit } from "./events.js";
import { HELD_ANGLES, angleIndex, poseAt } from "./figure.js";
import * as settings from "./settings.js";
import { guardedMult, styleOf } from "./combat.js";
import { getItem } from "./items.js";
import { getSheet, idleFrame } from "./assets.js";
import { damageZombie } from "./entities/zombie.js";
import * as burn from "./burn.js";
import { DOOR_TOP, WINDOW_SILL, WINDOW_TOP } from "./placeholders.js";
import { countAll, takeAll, detach } from "./inventory.js";
import { release, wearPerShot } from "./items.js";
import { showMessage } from "./ui/prompt.js";
import * as loop from "./loop.js";
import * as rng from "./rng.js";

// Everything is tunable from the console: __game.archery.tunables. The numbers are data since 2026-10-15
// (`data/combat.json` `bow`, setBowData; the wiki census: combat numbers are data); these are the same as defaults.
export function setBowData(data) {
  if (data) for (const k of Object.keys(tunables)) if (typeof data[k] === "number") tunables[k] = data[k];
}
export const tunables = {
  range: 22, // tiles: the farthest a full draw can land (about the wide view's width)
  speed: 16, // tiles per second along the ground, constant
  arcMin: 8, // px: the peak height of a hand's-length shot
  arcMax: 150, // px: the peak height of the longest shot (about a tree's height)
  z0: 30, // px: the height the arrow leaves the bow at (0: it leaves the archer's feet)
  ramp: 2, // the draw-to-distance curve, f(c) = 1 - (1 - c)^ramp: quick at first, slow near full
  drawTime: 0.9, // seconds to a full draw (a bow's own `drawTime` overrides it)
  minDraw: 0.15, // a release before this fraction of a draw is a dry release: nothing flies
  minDistance: 1, // tiles: a cursor closer than this still shoots this far
  drawSpeed: 0.45, // walking speed while a bow is drawn (Minecraft slows you to a crawl)
  braceMove: 0.2, // walking speed with the right button held and a bow in hand (docs/21)
  braceDrawRate: 1.5, // the draw fills this many times faster when braced: 0.9 s becomes 0.6
  recoverTime: 0.22, // seconds after a shot before the next draw can begin
  hitRadius: 0.5, // tiles around the landing point that count as a hit (a body's radius 0.3 and a little)
  damage: 38, // at a full draw; scaled by 0.4 + 0.6 c (a bow's own `damage` overrides it)
  knockback: 0.2, // tiles of push along the arrow's ground direction
  wallHeight: 80, // px: an arrow below this is stopped by a wall (an opening's own heights let it through)
  trunkHeight: 40, // px: a trunk, a barrel: round obstacles block below this
  propHeight: 50, // px: a tile prop blocks below its own height, to at most this
  scanStep: 0.1, // tiles between the steps the flight is checked at, once, when the arrow is shot
  aimLift: 22, // px: the cursor is read at chest height, so a cursor on a body targets its feet
  shadowRx: 7, // px: the shadow's size on the ground, shrinking as the arrow rises
  shadowRy: 3.5,
  shadowAlpha: 0.55, // how dark it is at the ground, fading as the arrow rises
};

const clamp01 = (v) => Math.max(0, Math.min(1, v));

// The fraction of the full-draw distance a draw of `c` (0 to 1) lands.
export function drawFraction(c) {
  return 1 - Math.pow(1 - clamp01(c), tunables.ramp);
}

// The peak height of an arc for a shot of `s` tiles: it grows with distance.
export function peakHeight(s, p = tunables) {
  return p.arcMin + (p.arcMax - p.arcMin) * clamp01(s / p.range);
}

// ---- the arrows in flight ----

const flying = [];

export function arrowsInFlight() {
  return replica || flying;
}

// Where a release would land, without flying anything: for the marker and the
// scripts. `dir` is a grid direction (any length), `distance` the full-draw
// distance (the cursor's, in tiles; capped at the range), `c` the draw.
export function preview(from, dir, distance, c = 1, range = tunables.range) {
  const n = Math.hypot(dir[0], dir[1]) || 1;
  const ux = dir[0] / n;
  const uy = dir[1] / n;
  const L = Math.min(distance, range);
  const s = L * drawFraction(c);
  return { dir: [ux, uy], full: [from.gx + ux * L, from.gy + uy * L], land: [from.gx + ux * s, from.gy + uy * s], distance: L, landing: s };
}

// Fire one. The landing point, the path, and the flight time are fixed here.
// `from` is anyone with gx and gy (the archer). Returns the arrow.
export function shoot(from, dir, distance, c = 1, o = {}) {
  const { shooter = from, damage = tunables.damage, knockback = tunables.knockback, range = tunables.range, speed = tunables.speed, arcMin = tunables.arcMin, arcMax = tunables.arcMax, z0 = tunables.z0, projectile = "arrow", breakChance = 0, staggerChance = undefined, interrupts = false, item = null, flat = false, vanish = false, contact = 0, landRadius = null, ignite = false } = o;
  const p = preview(from, dir, distance, c, range);
  const T = Math.max(1 / 120, p.landing / speed);
  const a = {
    kind: "arrow",
    projectile, // "arrow" or "spear": which picture, and which item lands or lodges
    item, // a thrown item's own entry, which is what lands (an arrow is made fresh)
    breakChance, // of a thrown item: rolled as it comes down; a broken one is gone
    staggerChance, // of the hit it lands (undefined: the default); a heavy throw interrupts a bite
    interrupts,
    flat, // a spell's flight (docs/24): no arc, the same height all the way, so it cannot be lobbed over a wall
    vanish, // a spell leaves nothing: no item lands or lodges (Michael, 2026-10-14)
    contact, // tiles: above 0, it bursts on the first of the dead within this of it as it flies (the fireball; #11)
    landRadius, // tiles: its own hit radius where it lands, or null for tunables.hitRadius (the fireball's wider; #11)
    ignite, // the body it hits is set alight (the fireball, a fire arrow; #14)
    speed,
    z0,
    shooter,
    damage,
    knockback,
    stopD: null, // ground distance at which a wall, a trunk, or a prop stops it, or null
    stopWhy: null,
    x0: from.gx,
    y0: from.gy,
    dx: p.dir[0],
    dy: p.dir[1],
    s: p.landing, // tiles to the landing point
    T, // seconds of flight
    H: flat ? 0 : peakHeight(p.landing, { range, arcMin, arcMax }),
    c,
    t: 0,
    gx: from.gx,
    gy: from.gy,
    z: z0,
    frame: 0,
    done: false,
  };
  pose(a);
  const stop = scanPath(a);
  if (stop) {
    a.stopD = stop.d;
    a.stopWhy = stop.why;
  }
  flying.push(a);
  return a;
}

// ---- what stops an arrow (docs/20) ----
//
// The flight is fixed at release, so it is walked once, here, in short steps
// along the ground line, with the height the arrow will have at each one.
// A wall stops it below the wall's height unless the opening's own heights let
// it through (an open doorway under its lintel, an open window between sill and
// top); a round obstacle (a trunk, a barrel) below its height; a tile prop below
// its own height. Above them it flies over. The first such point is where it
// comes down: at the foot of what stopped it.

const heightAt = (a, u) => (a.flat ? a.z0 : a.z0 * (1 - u) + 4 * a.H * u * (1 - u));

function wallStops(wall, z) {
  if (!wall || z >= tunables.wallHeight) return false;
  if (map.boarded(wall)) return true;
  if (wall.kind === "door") return !((wall.open || wall.broken) && z < DOOR_TOP);
  if (wall.kind === "window") return !((wall.shutter === "open" || wall.broken) && z >= WINDOW_SILL && z < WINDOW_TOP);
  return true;
}

// Between two neighbouring tiles (a diagonal step may go either way round).
function edgeStops(ax, ay, bx, by, z) {
  if (ax !== bx && ay !== by) {
    const viaX = wallStops(map.wallBetween(ax, ay, bx, ay), z) || wallStops(map.wallBetween(bx, ay, bx, by), z);
    const viaY = wallStops(map.wallBetween(ax, ay, ax, by), z) || wallStops(map.wallBetween(ax, by, bx, by), z);
    return viaX && viaY;
  }
  return wallStops(map.wallBetween(ax, ay, bx, by), z);
}

function tilePropHeight(prop) {
  try {
    const sheet = getSheet(prop.sprite, prop.tiles.length);
    const f = sheet.frames[idleFrame(sheet, prop, 0)];
    return Math.min(f ? f[3] : tunables.propHeight, tunables.propHeight);
  } catch {
    return tunables.propHeight;
  }
}

function scanPath(a) {
  const step = tunables.scanStep;
  const n = Math.ceil(a.s / step);
  let tx = Math.round(a.x0);
  let ty = Math.round(a.y0);
  for (let i = 1; i <= n; i++) {
    const d = Math.min(a.s, i * step);
    const before = Math.max(0, (i - 1) * step);
    const gx = a.x0 + a.dx * d;
    const gy = a.y0 + a.dy * d;
    const z = heightAt(a, d / a.s);
    const nx = Math.round(gx);
    const ny = Math.round(gy);
    if (nx !== tx || ny !== ty) {
      if (edgeStops(tx, ty, nx, ny, z)) return { d: before, why: "wall" };
      const prop = map.tileAt(nx, ny).prop;
      if (prop && prop.solid && !(prop.radius > 0) && z < tilePropHeight(prop)) return { d: before, why: "prop" };
      tx = nx;
      ty = ny;
    }
    // Round obstacles in the tiles about this point: a trunk is hit where its circle is.
    if (z < tunables.trunkHeight) {
      for (let oy = -1; oy <= 1; oy++) {
        for (let ox = -1; ox <= 1; ox++) {
          const prop = map.tileAt(nx + ox, ny + oy).prop;
          if (prop && prop.solid && prop.radius > 0 && Math.hypot(gx - prop.tile[0], gy - prop.tile[1]) < prop.radius + 0.08) return { d: before, why: "trunk" };
        }
      }
    }
  }
  return null;
}

// The arrow's place and pose at its time t.
function pose(a) {
  const u = clamp01(a.t / a.T);
  a.gx = a.x0 + a.dx * a.s * u;
  a.gy = a.y0 + a.dy * a.s * u;
  const z0 = a.z0;
  a.z = a.flat ? z0 : Math.max(0, z0 * (1 - u) + 4 * a.H * u * (1 - u));
  // The picture's direction on screen, height included: along the ground it
  // goes (dx - dy) * HW and (dx + dy) * HH per tile, and up by dz/dt.
  const vz = a.flat ? 0 : (-z0 + 4 * a.H * (1 - 2 * u)) / a.T;
  const sx = (a.dx - a.dy) * iso.HW * a.speed;
  const sy = (a.dx + a.dy) * iso.HH * a.speed - vz;
  a.frame = angleIndex([sx, sy]);
}

export function update(dt) {
  for (let i = flying.length - 1; i >= 0; i--) {
    const a = flying[i];
    a.t += dt;
    pose(a);
    const end = a.stopD != null ? (a.T * a.stopD) / a.s : a.T;
    // A shot that bursts on contact (the fireball, Michael 2026-10-15: "it's a fireball, not an arrow"): the first of the
    // dead within its contact radius, short of where a wall would stop it, takes the hit and the flight ends there.
    if (a.contact > 0 && a.t < end) {
      const body = bodyAt(a.gx, a.gy, a.contact, { z: a.z, ahead: a });
      if (body) {
        flying.splice(i, 1);
        land(a, body);
        continue;
      }
    }
    if (a.t >= end) {
      flying.splice(i, 1);
      land(a);
    }
  }
}

// Down: the arrow sticks where it fell, as an ordinary floor item that E picks
// up (docs/20), remembering its exact place and which way it points.
function land(a, met = null) {
  a.done = true;
  const d = met ? Math.min(a.s, a.speed * a.t) : a.stopD != null ? a.stopD : a.s;
  const gx = a.x0 + a.dx * d;
  const gy = a.y0 + a.dy * d;
  const ground = angleIndex([(a.dx - a.dy) * iso.HW, (a.dx + a.dy) * iso.HH]);
  // A shot that came down on its own (not stopped short) hurts the body at the
  // landing point, if one is there (docs/20: hits are checked at landing only).
  let hit = null;
  if (met) hit = met; // met on the way (a contact burst)
  else if (a.stopD == null) hit = bodyAt(gx, gy, a.landRadius ?? tunables.hitRadius, { z: a.z }); // never through a wall (#13)
  let keep = true;
  const broken = a.breakChance > 0 && rng.chance(a.breakChance);
  if (hit) {
    if (a.ignite) burn.ignite(hit); // before the damage, so a body it kills burns on as a corpse (#14)
    damageZombie(hit, Math.round(a.damage * (0.4 + 0.6 * a.c)), { dir: [a.dx, a.dy], knockback: a.knockback, staggerChance: a.staggerChance, interrupts: a.interrupts, from: [a.x0, a.y0] });
    // The arrow stays in the body (Michael): it comes out in the loot when the dead one is
    // killed and searched, so getting it back means finishing the job. They stack up in there.
    const id = a.item ? a.item.id : "arrow";
    if (!broken && !a.vanish) { // a spell lodges nothing
      hit.lodged = hit.lodged || {};
      hit.lodged[id] = (hit.lodged[id] || 0) + 1;
    }
    keep = false;
  }
  if (broken) keep = false; // a spear that broke is gone: nothing lies there, nothing lodges
  if (a.vanish) keep = false; // a spell is gone the moment it arrives (Michael, 2026-10-14): nothing lies there
  // What lands is the thrown item itself (a spear keeps whatever it carries) or a fresh arrow.
  if (keep) map.dropItem(Math.round(gx), Math.round(gy), { ...(a.item || { id: "arrow", count: 1 }), at: [gx, gy], angle: ground });
  emit("arrowLanded", { arrow: a, gx, gy, hit, kept: keep, broken, stoppedBy: a.stopWhy });
}

// ---- who can be hit ----

let targets = () => [];

// main.js hands in the dead that can be hit (the living dead; villagers and the archer never are).
export function setTargets(fn) {
  targets = fn;
}

// The nearest living zombie within `r` of a point (the landing point, or a contact shot's place), or null. With `o`
// (every landing, and a fireball's contact: the review of #12 found the fireball burned the dead through a closed door,
// and #13 an arrow landing just short of a wall hit one past it): only a body with no wall between it and the point at
// the shot's height `o.z` counts, and with `o.ahead` (the shot) only one ahead of where it was loosed, so nothing behind
// the caster is hit on the way out. A landing (an arrow, a spear, the fireball's) needs no ahead test.
function bodyAt(gx, gy, r = tunables.hitRadius, o = null) {
  let best = null;
  let bestD = r;
  for (const z of targets()) {
    if (z.dead) continue;
    const d = Math.hypot(z.gx - gx, z.gy - gy);
    if (d > bestD) continue;
    if (o && o.ahead && (z.gx - o.ahead.x0) * o.ahead.dx + (z.gy - o.ahead.y0) * o.ahead.dy <= 0) continue;
    if (o && !clearBetween(gx, gy, z.gx, z.gy, o.z ?? tunables.z0)) continue;
    if (d <= bestD) {
      best = z;
      bestD = d;
    }
  }
  return best;
}

// No wall or closed door stands between two points at height `z` (a landing's or a fireball's reach, bodyAt): the edges crossed on the
// way, tile by tile, as a flight's own path is checked (edgeStops).
function clearBetween(ax, ay, bx, by, z) {
  const len = Math.hypot(bx - ax, by - ay);
  const n = Math.max(1, Math.ceil(len / 0.1));
  let tx = Math.round(ax);
  let ty = Math.round(ay);
  for (let i = 1; i <= n; i++) {
    const nx = Math.round(ax + ((bx - ax) * i) / n);
    const ny = Math.round(ay + ((by - ay) * i) / n);
    if (nx !== tx || ny !== ty) {
      if (edgeStops(tx, ty, nx, ny, z)) return false;
      tx = nx;
      ty = ny;
    }
  }
  return true;
}

// ---- the landing marker (docs/20): where the current draw would land ----

// { land: [gx, gy], full: [gx, gy], from: [gx, gy] } or null, on the player whose draw it is
// (docs/31/05, item 12): a client draws its own player's.
export function setMarker(player, m) {
  player.marker = m;
}

export function getMarker(player) {
  return player ? player.marker || null : null;
}

// On a guest, what flies is what the host says flies (net.js): a list drawn in place of the world's.
let replica = null;
export function setReplicaArrows(list) {
  replica = list;
}

// A spell in flight lights the ground under it (docs/24): a moving light, as a burning body is one. From the arrows in
// flight, so a guest makes it from the frame's list as the host does from its own.
const GLOWS = { fireball: { radius: 4, flicker: 0.25 }, fire_arrow: { radius: 2, flicker: 0.3 } };
export function projectileLights() {
  const out = [];
  for (const a of arrowsInFlight()) {
    const g = !a.done && GLOWS[a.projectile];
    if (g) out.push({ gx: a.gx, gy: a.gy, radius: g.radius, flicker: g.flicker });
  }
  return out;
}

// The fireball's picture (data/art/items/fireball.png, the design agent's: 64 px cells, a row per direction with row k
// flying at k * 22.5 degrees from east, clockwise, and three flicker frames across). Its frames are named by the held
// angles the flight already computes (0 up, clockwise: `fireball_${k}_${f}`), so east, angle 4, is row 0.
export function fireballSheet(img) {
  const C = 64;
  const frames = {};
  for (let k = 0; k < 16; k++) {
    const row = (k + 12) % 16;
    for (let f = 0; f < 3; f++) frames[`fireball_${k}_${f}`] = [f * C, row * C, C, C];
  }
  // Drawn at twice its painted size (Michael, 2026-10-14: "a fire bowling ball, not a fire baseball"): a whole-number
  // scale keeps its pixels square and crisp, only twice as big as the world's; a bigger painted sheet would end that.
  return { image: img, frames, anchor: [32, 32], animations: {}, facings: [], mirror: {}, flicker: 3, scale: 2 };
}

// ---- the projectiles' pictures, generated like everything else ----

const hex = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];

// Sixteen frames, 22.5 degrees apart, 0 up and clockwise (the held art's angles):
// a shaft, a head at the tip, fletching at the tail if it has any, a dark outline,
// in hard pixels. The frame's centre is the projectile's middle.
// The picture of a projectile at sixteen angles, drawn pixel by pixel along its
// line (docs/20; redrawn 2026-10-13, docs/32 item 11: a two-tone shaft, a head
// that tapers to its point over a darker socket, swept fletching and a nock on
// an arrow, a lashing and a broad stone point on a spear). `shaft`, `head` are
// the base tones; the light and dark of each are derived; `cord` is the lashing.
function makeProjectile(name, { size, len, thick, shaft, head, headLen, fletch, cord = null, flame = false }) {
  const AS = size;
  const N = HELD_ANGLES;
  const canvas = document.createElement("canvas");
  canvas.width = AS * N;
  canvas.height = AS;
  const ctx = canvas.getContext("2d");
  const frames = {};
  const tone = (c, f) => c.map((v) => Math.max(0, Math.min(255, Math.round(v * f))));
  const SHAFT = hex(shaft);
  const SHAFT_LIGHT = tone(SHAFT, 1.22);
  const SHAFT_DARK = tone(SHAFT, 0.72);
  const HEAD = hex(head);
  const HEAD_DARK = tone(HEAD, 0.7);
  const FLETCH = fletch ? hex(fletch) : null;
  const FLETCH_DARK = FLETCH ? tone(FLETCH, 0.78) : null;
  const CORD = cord ? hex(cord) : null;
  const OUT = hex("#2b2522");
  for (let k = 0; k < N; k++) {
    const a = (k * 2 * Math.PI) / N;
    const dx = Math.sin(a);
    const dy = -Math.cos(a);
    const nx = -dy;
    const ny = dx;
    const px = new Map();
    const put = (x, y, c) => {
      const ix = Math.floor(x);
      const iy = Math.floor(y);
      if (ix < 1 || iy < 1 || ix >= AS - 1 || iy >= AS - 1) return;
      px.set(iy * AS + ix, c);
    };
    const cx = AS / 2;
    const cy = AS / 2;
    const tHead = len / 2 - headLen; // where the head begins
    const tNock = -len / 2; // the tail end
    // The shaft: the base tone with the light along one edge (the light is from the
    // upper left, so the side whose normal points up and left is lit) and, on a thick
    // shaft, the second row in the dark tone; a darker ring at the head's socket.
    const litSide = (nx - ny) < 0 ? 1 : -1;
    for (let i = 0; i <= len * 3; i++) {
      const t = i / 3 - len / 2;
      if (t > tHead) continue;
      const socket = t > tHead - 1.5;
      const base = socket ? SHAFT_DARK : SHAFT;
      put(cx + dx * t, cy + dy * t, base);
      if (thick > 1) {
        put(cx + dx * t + nx * 0.9 * litSide, cy + dy * t + ny * 0.9 * litSide, socket ? SHAFT_DARK : SHAFT_LIGHT);
      } else if (!socket && i % 3 === 0 && t > tNock + 4 && t < tHead - 2) {
        // A one-pixel shaft gets its light as a dotted highlight along the lit edge, so it reads as round without doubling.
        put(cx + dx * t + nx * 0.6 * litSide, cy + dy * t + ny * 0.6 * litSide, SHAFT_LIGHT);
      }
    }
    // The lashing behind the head on a spear: two turns of cord across the shaft.
    if (CORD) {
      for (const t of [tHead - 2.5, tHead - 3.5]) {
        for (let s = -1.2; s <= 1.2; s += 0.4) put(cx + dx * t + nx * s, cy + dy * t + ny * s, CORD);
      }
    }
    // The head: a point that tapers from its widest at the socket to the tip; the far
    // side in the dark tone so it reads as a blade with two faces.
    const wide = thick > 1 ? 2 : 1;
    for (let i = 0; i <= headLen * 3; i++) {
      const t = tHead + i / 3;
      const w = wide * (1 - i / (headLen * 3)); // the half width here
      put(cx + dx * t, cy + dy * t, HEAD);
      for (let s = 0.5; s <= w + 0.01; s += 0.5) {
        put(cx + dx * t + nx * s * litSide, cy + dy * t + ny * s * litSide, HEAD);
        put(cx + dx * t - nx * s * litSide, cy + dy * t - ny * s * litSide, HEAD_DARK);
      }
    }
    // A burning head (the fire arrow): a tongue of flame round the wrapped head and past its tip, yellow at the
    // heart and orange outside, drawn over the head so the head shows as the dark rag inside it.
    if (flame) {
      const FLAME = hex("#f08a24");
      const HEART = hex("#ffd75a");
      for (let i = 0; i <= 12; i++) {
        const t = tHead - 1 + i / 2;
        const w = i < 4 ? 1.5 : i < 9 ? 1.5 - (i - 4) * 0.25 : 0.5;
        for (let s = -w; s <= w + 0.01; s += 0.5) put(cx + dx * t + nx * s, cy + dy * t + ny * s, Math.abs(s) < 0.6 && i > 2 && i < 10 ? HEART : FLAME);
      }
    }
    // The barbs at the socket, a pixel past the widest.
    put(cx + dx * tHead + nx * (wide + 0.9), cy + dy * tHead + ny * (wide + 0.9), HEAD);
    put(cx + dx * tHead - nx * (wide + 0.9), cy + dy * tHead - ny * (wide + 0.9), HEAD_DARK);
    if (FLETCH) {
      // Fletching swept back from the shaft: two vanes that stand a pixel off the shaft and lean toward the nock.
      for (let j = 0; j < 4; j++) {
        const t = tNock + 0.5 + j;
        const s = j < 3 ? 1 + (j === 0 ? 0 : 0.5) : 1; // the vane's lift off the shaft along its length
        put(cx + dx * t + nx * s, cy + dy * t + ny * s, j === 3 ? FLETCH_DARK : FLETCH);
        put(cx + dx * t - nx * s, cy + dy * t - ny * s, j === 3 ? FLETCH_DARK : FLETCH);
        if (j === 1) {
          put(cx + dx * t + nx * 2, cy + dy * t + ny * 2, FLETCH);
          put(cx + dx * t - nx * 2, cy + dy * t - ny * 2, FLETCH_DARK);
        }
      }
      put(cx + dx * tNock, cy + dy * tNock, SHAFT_DARK); // the nock
    }
    const img = ctx.createImageData(AS, AS);
    const d = img.data;
    const set = (i, c) => {
      d[i * 4] = c[0];
      d[i * 4 + 1] = c[1];
      d[i * 4 + 2] = c[2];
      d[i * 4 + 3] = 255;
    };
    for (const i of px.keys()) {
      const x = i % AS;
      const y = (i - x) / AS;
      for (let oy = -1; oy <= 1; oy++) {
        for (let ox = -1; ox <= 1; ox++) {
          const j = (y + oy) * AS + (x + ox);
          if (!px.has(j)) set(j, OUT);
        }
      }
    }
    for (const [i, c] of px) set(i, c);
    ctx.putImageData(img, k * AS, 0);
    frames[`${name}_${k}`] = [k * AS, 0, AS, AS];
  }
  return { image: canvas, frames, anchor: [AS / 2, AS / 2], animations: {}, facings: [], mirror: {} };
}

export function generateArrow() {
  return makeProjectile("arrow", { size: 24, len: 16, thick: 1, shaft: "#8a6a3a", head: "#c4cad2", headLen: 3, fletch: "#e4dcc4" });
}

// A fire arrow in flight (#14): the arrow with its head wrapped and burning. It lands, or lodges, as a plain arrow.
export function generateFireArrow() {
  return makeProjectile("fire_arrow", { size: 24, len: 16, thick: 1, shaft: "#8a6a3a", head: "#5a4a3a", headLen: 3, fletch: "#e4dcc4", flame: true });
}

// A wooden pole with a stone point (Michael): longer and thicker than an arrow, no fletching.
export function generateSpear() {
  return makeProjectile("spear", { size: 32, len: 26, thick: 2, shaft: "#8a6a3a", head: "#b4b0a8", headLen: 6, fletch: null, cord: "#d8c8a0" });
}

// ---- the draw (docs/20, step 2) ----
//
// With a bow in the main hand the left button is the draw: hold to draw, release
// to shoot. The cursor sets the direction and where a full draw lands; the draw
// sets how far short (`drawFraction`); the shot is fixed at release. While the
// bow is drawn the player turns to the cursor (they always do), walks at half
// speed, and shows where the arrow would land. Sprinting, opening a panel, or a
// pause cancels the draw. A release before `minDraw` is a dry release.

// The draw in progress ({ t, c, source }), the recovery after a shot, the scripts' aim override,
// and the marker live on the player (docs/31/05, item 12): two players draw two bows.

// A world put back from a save (docs/31/05, item 24): nothing in flight.
export function reset() {
  flying.length = 0;
  replica = null;
}

export function setAimOverride(player, p) {
  player.aimOverride = p;
}

export function drawState(player) {
  const draw = player && player.draw;
  return draw ? { t: draw.t, c: draw.c, source: draw.source } : null;
}

// What the main hand can shoot or throw, with its numbers, or null: a bow (its
// arrows come from the bag) or a thrown item (a spear: the item itself is the
// projectile and leaves the hand). Each carries the numbers of its shot.
export function launcherOf(player) {
  const spell = spellOf(player);
  if (spell) return spell;
  const e = player.hands && player.hands.main;
  const def = e && getItem(e.id);
  if (!def) return null;
  const common = { entry: e, range: tunables.range, speed: tunables.speed, arcMin: tunables.arcMin, arcMax: tunables.arcMax, z0: tunables.z0, drawTime: tunables.drawTime };
  // `button` is the button that draws it (docs/21): the bow on the left, a throw on the middle.
  // Fire arrows before plain ones when both are carried (#14): each burns what it hits, and lands as a plain arrow.
  if (def.bow) {
    const fire = countAll(player, "fire_arrow") > 0;
    return { ...common, ...def.bow, kind: "bow", button: "primary", ammo: fire ? "fire_arrow" : "arrow", projectile: fire ? "fire_arrow" : "arrow", ignite: fire };
  }
  if (def.thrown) return { ...common, ...def.thrown, kind: "thrown", button: "alt", ammo: null, projectile: def.thrown.projectile || def.id };
  return null;
}

// A spell (Michael, 2026-10-14; docs/24): a staff (any, for now) and a spellbook held together cast the book's spell on
// the left button, drawn and released as the bow is, with no arc and nothing spent but the time. The book decides the
// spell (`book.spell` in data/items.json: only the Book of Fire's fireball so far). Either one alone refuses to cast,
// and the left button does nothing else meanwhile (no punch). Null when neither is held.
export function spellOf(player) {
  const hands = player.hands || {};
  const defs = [hands.main, hands.off].filter(Boolean).map((e) => ({ e, def: getItem(e.id) }));
  const staff = defs.find((x) => x.def && x.def.staff);
  const book = defs.find((x) => x.def && x.def.book && x.def.book.spell);
  if (!staff && !book) return null;
  if (!staff || !book) return { kind: "spell", button: "primary", refuse: book ? "A spell needs a staff in the other hand." : "A staff needs a spellbook in the other hand to cast." };
  const s = book.def.book.spell;
  return { entry: hands.main, range: tunables.range, speed: tunables.speed, z0: tunables.z0, drawTime: tunables.drawTime, ...s, kind: "spell", button: "primary", ammo: null, projectile: s.projectile, arcMin: 0, arcMax: 0, flat: true, vanish: true };
}

// The bow in the main hand, or null (kept for scripts).
export function bowOf(player) {
  const l = launcherOf(player);
  return l && l.kind === "bow" ? l : null;
}

// The ground point the cursor means, read at chest height: a cursor on a body
// is not over its feet on the ground plane, so the point is the one whose chest
// the cursor is over (`aimLift`), and a cursor on a zombie targets its feet.
// `ctx` is the input: `aimAt` a grid point from a client whose cursor is not here (net.js), else
// `mouse` in this client's world pixels; a script's override on the player wins.
export function aimPoint(player, ctx) {
  if (player && player.aimOverride) return player.aimOverride;
  if (ctx && ctx.aimAt) return ctx.aimAt;
  const mouse = ctx && ctx.mouse ? ctx.mouse : ctx;
  const g = iso.toGrid(mouse.x, mouse.y + tunables.aimLift);
  return [g.gx, g.gy];
}

function aimFrom(player, ctx) {
  const [cx, cy] = aimPoint(player, ctx);
  let dx = cx - player.gx;
  let dy = cy - player.gy;
  let L = Math.hypot(dx, dy);
  if (L < 1e-3) {
    const f = iso.DIRS[player.facing] || [1, 0];
    dx = f[0];
    dy = f[1];
    L = 0;
  }
  return { dir: [dx, dy], distance: Math.max(L, tunables.minDistance) };
}

// The figure's pose is the bow style's attack frames, held by hand: 0 nocked,
// 1 drawing, 2 full draw, 3 the release.
function setPose(player, frame) {
  const a = player.anim;
  a.name = "attack";
  a.frame = frame;
  a.elapsed = 0;
  a.done = false;
}

export function beginDraw(player, bow, source = "mouse") {
  if (player.draw || (player.recover || 0) > 0 || !bow || player.dead || player.carrying) return false;
  if (bow.refuse) {
    showMessage(bow.refuse);
    return false;
  }
  if (bow.ammo && countAll(player, bow.ammo) <= 0) {
    showMessage("No arrows.");
    return false;
  }
  player.auto = null;
  player.drawing = true;
  player.draw = { t: 0, c: 0, source };
  return true;
}

export function cancelDraw(player) {
  player.draw = null;
  player.drawing = false;
  setMarker(player, null);
}

// Let go: dry below the minimum, otherwise one arrow leaves the bag and flies,
// or the thrown item leaves the hand and flies (the hand is then empty).
export function releaseDraw(player, ctx) {
  const draw = player.draw;
  if (!draw) return null;
  const c = draw.c;
  const L = launcherOf(player);
  const aim = aimFrom(player, ctx);
  cancelDraw(player);
  if (c < tunables.minDraw || !L) return null;
  let item = null;
  if (L.ammo) {
    if (takeAll(player, L.ammo, 1) < 1) {
      showMessage("No arrows.");
      return null;
    }
  } else if (L.kind !== "spell") {
    item = { ...L.entry };
    release(player.hands, L.entry);
  }
  const a = shoot(player, aim.dir, aim.distance, c, { damage: (L.damage ?? tunables.damage) * guardedMult(player), knockback: L.knockback ?? tunables.knockback, range: L.range, speed: L.speed, arcMin: L.arcMin, arcMax: L.arcMax, z0: L.z0, projectile: L.projectile, breakChance: L.breakChance ?? 0, staggerChance: L.staggerChance, interrupts: !!L.interrupts, item, flat: !!L.flat, vanish: !!L.vanish, contact: L.contact || 0, landRadius: L.landRadius ?? null, ignite: !!L.ignite });
  player.recover = tunables.recoverTime;
  setPose(player, 3); // the release: the arrow loosed, the throw let go, the spell cast forward (docs/32, item 3)
  emit("arrowShot", { player, arrow: a, c });
  // The string wears by the shot (docs/30, 5.2: a bow's `shots`); at the last one the bow is gone from the hand.
  const bowEntry = player.hands.main;
  const per = bowEntry ? wearPerShot(getItem(bowEntry.id)) : 0;
  if (per) {
    bowEntry.wear = Math.min(1, (bowEntry.wear || 0) + per);
    if (bowEntry.wear >= 1) {
      detach(player, bowEntry);
      emit("weaponBroke", { who: player.id, item: bowEntry.id, uid: bowEntry.uid });
    }
  }
  return a;
}

// Every step. `ctx`: { pressed, down, mouse, blocked }.
export function updateDraw(player, dt, ctx) {
  const bow = launcherOf(player);
  if ((player.recover || 0) > 0) {
    player.recover -= dt;
    setPose(player, 3);
    return;
  }
  const had = !!player.draw;
  if (!player.draw) {
    if (!(ctx.pressed && bow)) return;
    if (!beginDraw(player, bow)) return;
    player.draw.pauses = loop.pauseCount();
  }
  const draw = player.draw;
  // A draw held through a pause (the menu, the pause screen) is dropped, so
  // letting go afterwards does not loose an arrow. Counted in pauses of the
  // loop, not in wall-clock time, so a slow frame or a test cannot drop it (docs/23a, C2).
  const paused = had && draw.source === "mouse" && draw.pauses !== loop.pauseCount();
  if (!bow || player.dead || player.sprinting || ctx.blocked || paused) {
    cancelDraw(player);
    return;
  }
  // Braced (the right button held with a bow), the draw fills faster; the walk is slower (main.js).
  // The bow names its braced draw time; the rate is how much faster that is than the free draw.
  const braced = ctx.brace && bow.kind === "bow";
  draw.t += dt * (braced ? (bow.braceDrawTime ? bow.drawTime / bow.braceDrawTime : tunables.braceDrawRate) : 1);
  draw.c = Math.min(1, draw.t / bow.drawTime);
  const aim = aimFrom(player, ctx);
  // The guide (docs/20): where this draw would land, and the line out to the full draw's. A setting
  // of the drawer's client; on a host it is computed for a guest too and travels with their record.
  if (settings.get("aimGuide") || ctx.aimAt) {
    const p = preview(player, aim.dir, aim.distance, draw.c, bow.range);
    setMarker(player, { from: [player.gx, player.gy], full: p.full, land: p.land });
  } else {
    setMarker(player, null);
  }
  const at = poseAt(styleOf(player, true)); // the style's own rhythm (the bow's 0.35 and 0.8 by default; the cast's in poses.json)
  setPose(player, draw.c < at[0] ? 0 : draw.c < at[1] ? 1 : 2);
  const down = draw.source === "script" ? true : ctx.down;
  if (!down) releaseDraw(player, ctx);
}
