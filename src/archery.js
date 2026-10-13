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
import { HELD_ANGLES, angleIndex } from "./figure.js";
import * as settings from "./settings.js";
import { guardedMult } from "./combat.js";
import { getItem } from "./items.js";
import { getSheet, idleFrame } from "./assets.js";
import { damageZombie } from "./entities/zombie.js";
import { DOOR_TOP, WINDOW_SILL, WINDOW_TOP } from "./placeholders.js";
import { countAll, takeAll, detach } from "./inventory.js";
import { release, wearPerShot } from "./items.js";
import { showMessage } from "./ui/prompt.js";
import * as loop from "./loop.js";
import * as rng from "./rng.js";

// Everything is tunable from the console: __game.archery.tunables.
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
  drawSpeed: 0.45,
  braceMove: 0.2, // walking speed with the right button held and a bow in hand (docs/21)
  braceDrawRate: 1.5, // the draw fills this many times faster when braced: 0.9 s becomes 0.6 // walking speed while a bow is drawn (Minecraft slows you to a crawl)
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
  return flying;
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
  const { shooter = from, damage = tunables.damage, knockback = tunables.knockback, range = tunables.range, speed = tunables.speed, arcMin = tunables.arcMin, arcMax = tunables.arcMax, z0 = tunables.z0, projectile = "arrow", breakChance = 0, staggerChance = undefined, interrupts = false, item = null } = o;
  const p = preview(from, dir, distance, c, range);
  const T = Math.max(1 / 120, p.landing / speed);
  const a = {
    kind: "arrow",
    projectile, // "arrow" or "spear": which picture, and which item lands or lodges
    item, // a thrown item's own entry, which is what lands (an arrow is made fresh)
    breakChance, // of a thrown item: rolled as it comes down; a broken one is gone
    staggerChance, // of the hit it lands (undefined: the default); a heavy throw interrupts a bite
    interrupts,
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
    H: peakHeight(p.landing, { range, arcMin, arcMax }),
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

const heightAt = (a, u) => a.z0 * (1 - u) + 4 * a.H * u * (1 - u);

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
  a.z = Math.max(0, z0 * (1 - u) + 4 * a.H * u * (1 - u));
  // The picture's direction on screen, height included: along the ground it
  // goes (dx - dy) * HW and (dx + dy) * HH per tile, and up by dz/dt.
  const vz = (-z0 + 4 * a.H * (1 - 2 * u)) / a.T;
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
    if (a.t >= end) {
      flying.splice(i, 1);
      land(a);
    }
  }
}

// Down: the arrow sticks where it fell, as an ordinary floor item that E picks
// up (docs/20), remembering its exact place and which way it points.
function land(a) {
  a.done = true;
  const d = a.stopD != null ? a.stopD : a.s;
  const gx = a.x0 + a.dx * d;
  const gy = a.y0 + a.dy * d;
  const ground = angleIndex([(a.dx - a.dy) * iso.HW, (a.dx + a.dy) * iso.HH]);
  // A shot that came down on its own (not stopped short) hurts the body at the
  // landing point, if one is there (docs/20: hits are checked at landing only).
  let hit = null;
  if (a.stopD == null) hit = bodyAt(gx, gy);
  let keep = true;
  const broken = a.breakChance > 0 && rng.chance(a.breakChance);
  if (hit) {
    damageZombie(hit, Math.round(a.damage * (0.4 + 0.6 * a.c)), { dir: [a.dx, a.dy], knockback: a.knockback, staggerChance: a.staggerChance, interrupts: a.interrupts, from: [a.x0, a.y0] });
    // The arrow stays in the body (Michael): it comes out in the loot when the dead one is
    // killed and searched, so getting it back means finishing the job. They stack up in there.
    const id = a.item ? a.item.id : "arrow";
    if (!broken) {
      hit.lodged = hit.lodged || {};
      hit.lodged[id] = (hit.lodged[id] || 0) + 1;
    }
    keep = false;
  }
  if (broken) keep = false; // a spear that broke is gone: nothing lies there, nothing lodges
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

// The nearest living zombie within `hitRadius` of the landing point, or null.
function bodyAt(gx, gy) {
  let best = null;
  let bestD = tunables.hitRadius;
  for (const z of targets()) {
    if (z.dead) continue;
    const d = Math.hypot(z.gx - gx, z.gy - gy);
    if (d <= bestD) {
      best = z;
      bestD = d;
    }
  }
  return best;
}

// ---- the landing marker (docs/20): where the current draw would land ----

let marker = null;

// { land: [gx, gy], full: [gx, gy], from: [gx, gy] } or null.
export function setMarker(m) {
  marker = m;
}

export function getMarker() {
  return marker;
}

// ---- the projectiles' pictures, generated like everything else ----

const hex = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];

// Sixteen frames, 22.5 degrees apart, 0 up and clockwise (the held art's angles):
// a shaft, a head at the tip, fletching at the tail if it has any, a dark outline,
// in hard pixels. The frame's centre is the projectile's middle.
function makeProjectile(name, { size, len, thick, shaft, head, headLen, fletch }) {
  const AS = size;
  const N = HELD_ANGLES;
  const canvas = document.createElement("canvas");
  canvas.width = AS * N;
  canvas.height = AS;
  const ctx = canvas.getContext("2d");
  const frames = {};
  const SHAFT = hex(shaft);
  const HEAD = hex(head);
  const FLETCH = fletch ? hex(fletch) : null;
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
    for (let i = 0; i <= len * 3; i++) {
      const t = i / 3 - len / 2;
      const col = t > len / 2 - headLen ? HEAD : SHAFT;
      put(cx + dx * t, cy + dy * t, col);
      if (thick > 1) put(cx + dx * t + nx * 0.9, cy + dy * t + ny * 0.9, col);
    }
    // The barbs of the head.
    const tb = len / 2 - headLen;
    put(cx + dx * tb + nx, cy + dy * tb + ny, HEAD);
    put(cx + dx * tb - nx, cy + dy * tb - ny, HEAD);
    if (thick > 1) put(cx + dx * tb + nx * 2, cy + dy * tb + ny * 2, HEAD);
    if (FLETCH) {
      for (let t = -len / 2; t <= -len / 2 + 3; t += 1) {
        put(cx + dx * t + nx, cy + dy * t + ny, FLETCH);
        put(cx + dx * t - nx, cy + dy * t - ny, FLETCH);
      }
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

// A wooden pole with a stone point (Michael): longer and thicker than an arrow, no fletching.
export function generateSpear() {
  return makeProjectile("spear", { size: 32, len: 26, thick: 2, shaft: "#8a6a3a", head: "#b4b0a8", headLen: 5, fletch: null });
}

// ---- the draw (docs/20, step 2) ----
//
// With a bow in the main hand the left button is the draw: hold to draw, release
// to shoot. The cursor sets the direction and where a full draw lands; the draw
// sets how far short (`drawFraction`); the shot is fixed at release. While the
// bow is drawn the player turns to the cursor (they always do), walks at half
// speed, and shows where the arrow would land. Sprinting, opening a panel, or a
// pause cancels the draw. A release before `minDraw` is a dry release.

let draw = null; // { t, c, source }: a draw in progress
let recover = 0; // seconds until the next draw may begin
let aimOverride = null; // [gx, gy]: scripts and tests aim here instead of the cursor

export function setAimOverride(p) {
  aimOverride = p;
}

export function drawState() {
  return draw ? { t: draw.t, c: draw.c, source: draw.source } : null;
}

// What the main hand can shoot or throw, with its numbers, or null: a bow (its
// arrows come from the bag) or a thrown item (a spear: the item itself is the
// projectile and leaves the hand). Each carries the numbers of its shot.
export function launcherOf(player) {
  const e = player.hands && player.hands.main;
  const def = e && getItem(e.id);
  if (!def) return null;
  const common = { entry: e, range: tunables.range, speed: tunables.speed, arcMin: tunables.arcMin, arcMax: tunables.arcMax, z0: tunables.z0, drawTime: tunables.drawTime };
  // `button` is the button that draws it (docs/21): the bow on the left, a throw on the middle.
  if (def.bow) return { ...common, ...def.bow, kind: "bow", button: "primary", ammo: "arrow", projectile: "arrow" };
  if (def.thrown) return { ...common, ...def.thrown, kind: "thrown", button: "alt", ammo: null, projectile: def.thrown.projectile || def.id };
  return null;
}

// The bow in the main hand, or null (kept for scripts).
export function bowOf(player) {
  const l = launcherOf(player);
  return l && l.kind === "bow" ? l : null;
}

// The ground point the cursor means, read at chest height: a cursor on a body
// is not over its feet on the ground plane, so the point is the one whose chest
// the cursor is over (`aimLift`), and a cursor on a zombie targets its feet.
export function aimPoint(mouse) {
  if (aimOverride) return aimOverride;
  const g = iso.toGrid(mouse.x, mouse.y + tunables.aimLift);
  return [g.gx, g.gy];
}

function aimFrom(player, mouse) {
  const [cx, cy] = aimPoint(mouse);
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
  if (draw || recover > 0 || !bow || player.dead || player.climb || player.carrying) return false;
  if (bow.ammo && countAll(player, bow.ammo) <= 0) {
    showMessage("No arrows.");
    return false;
  }
  player.auto = null;
  player.drawing = true;
  draw = { t: 0, c: 0, source };
  return true;
}

export function cancelDraw(player) {
  draw = null;
  player.drawing = false;
  setMarker(null);
}

// Let go: dry below the minimum, otherwise one arrow leaves the bag and flies,
// or the thrown item leaves the hand and flies (the hand is then empty).
export function releaseDraw(player, mouse) {
  if (!draw) return null;
  const c = draw.c;
  const L = launcherOf(player);
  const aim = aimFrom(player, mouse);
  cancelDraw(player);
  if (c < tunables.minDraw || !L) return null;
  let item = null;
  if (L.ammo) {
    if (takeAll(player, L.ammo, 1) < 1) {
      showMessage("No arrows.");
      return null;
    }
  } else {
    item = { ...L.entry };
    release(player.hands, L.entry);
  }
  const a = shoot(player, aim.dir, aim.distance, c, { damage: (L.damage ?? tunables.damage) * guardedMult(player), knockback: L.knockback ?? tunables.knockback, range: L.range, speed: L.speed, arcMin: L.arcMin, arcMax: L.arcMax, z0: L.z0, projectile: L.projectile, breakChance: L.breakChance ?? 0, staggerChance: L.staggerChance, interrupts: !!L.interrupts, item });
  recover = tunables.recoverTime;
  setPose(player, 3);
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
  if (recover > 0) {
    recover -= dt;
    setPose(player, 3);
    return;
  }
  const had = !!draw;
  if (!draw) {
    if (!(ctx.pressed && bow)) return;
    if (!beginDraw(player, bow)) return;
    draw.pauses = loop.pauseCount();
  }
  // A draw held through a pause (the menu, the pause screen) is dropped, so
  // letting go afterwards does not loose an arrow. Counted in pauses of the
  // loop, not in wall-clock time, so a slow frame or a test cannot drop it (docs/23a, C2).
  const paused = had && draw.source === "mouse" && draw.pauses !== loop.pauseCount();
  if (!bow || player.dead || player.climb || player.sprinting || ctx.blocked || paused) {
    cancelDraw(player);
    return;
  }
  // Braced (the right button held with a bow), the draw fills faster; the walk is slower (main.js).
  // The bow names its braced draw time; the rate is how much faster that is than the free draw.
  const braced = ctx.brace && bow.kind === "bow";
  draw.t += dt * (braced ? (bow.braceDrawTime ? bow.drawTime / bow.braceDrawTime : tunables.braceDrawRate) : 1);
  draw.c = Math.min(1, draw.t / bow.drawTime);
  const aim = aimFrom(player, ctx.mouse);
  // The guide (docs/20): where this draw would land, and the line out to the full draw's. A setting.
  if (settings.get("aimGuide")) {
    const p = preview(player, aim.dir, aim.distance, draw.c, bow.range);
    setMarker({ from: [player.gx, player.gy], full: p.full, land: p.land });
  } else {
    setMarker(null);
  }
  setPose(player, draw.c < 0.35 ? 0 : draw.c < 0.8 ? 1 : 2);
  const down = draw.source === "script" ? true : ctx.down;
  if (!down) releaseDraw(player, ctx.mouse);
}
