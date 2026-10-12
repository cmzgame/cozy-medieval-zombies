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

// Everything is tunable from the console: __game.archery.tunables.
export const tunables = {
  range: 22, // tiles: the farthest a full draw can land (about the wide view's width)
  speed: 16, // tiles per second along the ground, constant
  arcMin: 8, // px: the peak height of a hand's-length shot
  arcMax: 150, // px: the peak height of the longest shot (about a tree's height)
  z0: 30, // px: the height the arrow leaves the bow at (0: it leaves the archer's feet)
  ramp: 2, // the draw-to-distance curve, f(c) = 1 - (1 - c)^ramp: quick at first, slow near full
  drawTime: 0.9, // seconds to a full draw (the next step)
  minDraw: 0.15, // a release before this fraction of a draw is a dry release (the next step)
  hitRadius: 0.5, // tiles around the landing point that count as a hit (step 3)
  aimLift: 22, // px: the cursor is read at chest height, so a cursor on a body targets its feet (the next step)
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
export function peakHeight(s) {
  return tunables.arcMin + (tunables.arcMax - tunables.arcMin) * clamp01(s / tunables.range);
}

// ---- the arrows in flight ----

const flying = [];

export function arrowsInFlight() {
  return flying;
}

// Where a release would land, without flying anything: for the marker and the
// scripts. `dir` is a grid direction (any length), `distance` the full-draw
// distance (the cursor's, in tiles; capped at the range), `c` the draw.
export function preview(from, dir, distance, c = 1) {
  const n = Math.hypot(dir[0], dir[1]) || 1;
  const ux = dir[0] / n;
  const uy = dir[1] / n;
  const L = Math.min(distance, tunables.range);
  const s = L * drawFraction(c);
  return { dir: [ux, uy], full: [from.gx + ux * L, from.gy + uy * L], land: [from.gx + ux * s, from.gy + uy * s], distance: L, landing: s };
}

// Fire one. The landing point, the path, and the flight time are fixed here.
// `from` is anyone with gx and gy (the archer). Returns the arrow.
export function shoot(from, dir, distance, c = 1, { shooter = from } = {}) {
  const p = preview(from, dir, distance, c);
  const T = Math.max(1 / 120, p.landing / tunables.speed);
  const a = {
    kind: "arrow",
    shooter,
    x0: from.gx,
    y0: from.gy,
    dx: p.dir[0],
    dy: p.dir[1],
    s: p.landing, // tiles to the landing point
    T, // seconds of flight
    H: peakHeight(p.landing),
    c,
    t: 0,
    gx: from.gx,
    gy: from.gy,
    z: tunables.z0,
    frame: 0,
    done: false,
  };
  pose(a);
  flying.push(a);
  return a;
}

// The arrow's place and pose at its time t.
function pose(a) {
  const u = clamp01(a.t / a.T);
  a.gx = a.x0 + a.dx * a.s * u;
  a.gy = a.y0 + a.dy * a.s * u;
  const z0 = tunables.z0;
  a.z = Math.max(0, z0 * (1 - u) + 4 * a.H * u * (1 - u));
  // The picture's direction on screen, height included: along the ground it
  // goes (dx - dy) * HW and (dx + dy) * HH per tile, and up by dz/dt.
  const vz = (-z0 + 4 * a.H * (1 - 2 * u)) / a.T;
  const sx = (a.dx - a.dy) * iso.HW * tunables.speed;
  const sy = (a.dx + a.dy) * iso.HH * tunables.speed - vz;
  a.frame = angleIndex([sx, sy]);
}

export function update(dt) {
  for (let i = flying.length - 1; i >= 0; i--) {
    const a = flying[i];
    a.t += dt;
    pose(a);
    if (a.t >= a.T) {
      flying.splice(i, 1);
      land(a);
    }
  }
}

// Down: the arrow sticks where it fell, as an ordinary floor item that E picks
// up (docs/20), remembering its exact place and which way it points.
function land(a) {
  a.done = true;
  const gx = a.x0 + a.dx * a.s;
  const gy = a.y0 + a.dy * a.s;
  const ground = angleIndex([(a.dx - a.dy) * iso.HW, (a.dx + a.dy) * iso.HH]);
  map.dropItem(Math.round(gx), Math.round(gy), { id: "arrow", count: 1, at: [gx, gy], angle: ground });
  emit("arrowLanded", { arrow: a, gx, gy });
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

// ---- the arrow's picture, generated like everything else ----

const AS = 24; // frame size, px
const LEN = 16; // arrow length, px

const hex = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];

// Sixteen frames, 22.5 degrees apart, 0 up and clockwise (the held art's angles):
// a shaft, a grey head at the tip, pale fletching at the tail, a dark outline,
// in hard pixels. The frame's centre is the arrow's middle.
export function generateArrow() {
  const N = HELD_ANGLES;
  const canvas = document.createElement("canvas");
  canvas.width = AS * N;
  canvas.height = AS;
  const ctx = canvas.getContext("2d");
  const frames = {};
  const SHAFT = hex("#8a6a3a");
  const HEAD = hex("#c4cad2");
  const FLETCH = hex("#e4dcc4");
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
    for (let i = 0; i <= LEN * 3; i++) {
      const t = i / 3 - LEN / 2;
      put(cx + dx * t, cy + dy * t, t > LEN / 2 - 3 ? HEAD : SHAFT);
    }
    // The barbs of the head, and the fletching at the tail.
    const tb = LEN / 2 - 3;
    put(cx + dx * tb + nx, cy + dy * tb + ny, HEAD);
    put(cx + dx * tb - nx, cy + dy * tb - ny, HEAD);
    for (let t = -LEN / 2; t <= -LEN / 2 + 3; t += 1) {
      put(cx + dx * t + nx, cy + dy * t + ny, FLETCH);
      put(cx + dx * t - nx, cy + dy * t - ny, FLETCH);
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
    frames[`arrow_${k}`] = [k * AS, 0, AS, AS];
  }
  return { image: canvas, frames, anchor: [AS / 2, AS / 2], animations: {}, facings: [], mirror: {} };
}
