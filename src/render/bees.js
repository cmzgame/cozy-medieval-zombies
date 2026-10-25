// Bees at a hive (#441; Michael, 2026-10-25: "a small cloud of bees animation that can play at or near the beehive"): a few specks drifting in small
// loops round the crown of every hive in view, by day only (none from dusk to dawn: `clock.getPhase()` is "day"), livelier for a few seconds when the
// hive's honey is taken (read off its `honeyAt`, which the host's verb sets and the chunk carries to a guest; `stirOf`). Cosmetic and the client's
// alone, like the fire's flicker: drawn by every client from what it already has, no sim state, nothing saved or sent; its time is the sim clock
// (`loop.simTime()`), so it is steady across frames and stops with the pause. A bee is two whole pixels, dark with a straw-gold one behind it as it
// flies (the colours of the delivered hive's own bees, `beehive_1.png`); those on the far half of their loop are drawn before the hive, so it hides
// them, and the near half after. `beesAt` is pure, for `check("bees")` and `node tools/check.js`.

import * as gl from "../gl.js";
import * as clock from "../clock.js";
import * as loop from "../loop.js";
import { work as WK } from "../tuning.js";

export const BEES = {
  min: 3, // a hive's bees by day, three to six by its id
  max: 6,
  crownY: 4, // the loops' centre, this many pixels below the top of the hive's frame
  stirSeconds: 8, // how long a hive stays lively after its honey is taken, fading
  dark: "#2b2522",
  gold: "#d8b35a",
};

// FNV-1a over a string: a hive's numbers from its id, the same on every client.
function hash(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}
const frac = (h, k) => (hash(`${h}:${k}`) % 10007) / 10007;

// Whether bees are out at this phase of the day.
export const awake = (phase) => phase === "day";

// How many bees a hive has by day.
export function countOf(prop) {
  return BEES.min + (hash(String(prop.id)) % (BEES.max - BEES.min + 1));
}

// The bees of a hive at sim time `t` (seconds) and day phase `phase`, `stir` 0..1 (1 the moment its honey was taken): a list of
// { x, y, back, dx } in whole pixels from the loops' centre, `back` for those on the far half of their loop, `dx` the way the bee flies (-1 or 1).
export function beesAt(prop, t, phase, stir = 0) {
  if (!awake(phase)) return [];
  const s = Math.max(0, Math.min(1, stir));
  const n = Math.min(BEES.max, countOf(prop) + Math.round(s * (BEES.max - countOf(prop))));
  // Livelier is wider loops and a fast buzz on top, never a faster loop: a speed that changed with the stir would jump every bee along its loop
  // (the angle is speed times a large sim time), where a size that changes only moves it a little.
  const reach = 1 + 0.5 * s;
  const out = [];
  for (let i = 0; i < n; i++) {
    const key = `${prop.id}#${i}`;
    const rx = (7 + 9 * frac(key, 1)) * reach;
    const ry = (3 + 4 * frac(key, 2)) * reach;
    const w = (1.6 + 1.6 * frac(key, 3)) * (frac(key, 4) < 0.5 ? -1 : 1);
    const a0 = Math.PI * 2 * frac(key, 5);
    const lift = -2 - 6 * frac(key, 6);
    const wf = 5 + 3 * frac(key, 7);
    const a = a0 + w * t;
    const buzz = 3 * s;
    const x = Math.round(rx * Math.cos(a) + 1.5 * Math.cos(wf * t + a0) + buzz * Math.cos(4 * wf * t + a0));
    const y = Math.round(lift + ry * Math.sin(a) + 1.5 * Math.sin(1.3 * wf * t + a0) + buzz * Math.sin(3.7 * wf * t + a0));
    const vx = -w * Math.sin(a); // the loop's own way across the screen
    out.push({ x, y, back: Math.sin(a) < 0, dx: vx < 0 ? -1 : 1 });
  }
  return out;
}

// How lively a hive is at the clock's second `now`: 1 the moment its honey was taken, fading to 0 over `stirSeconds`. The moment is read off the
// prop itself, with no memory: the `honey` verb sets `honeyAt` to the clock then plus `work.honey.days` of days (src/hives.js), so a hive whose
// honey was taken while nobody watched is calm when it comes into view, and a guest reads the same from the same prop.
export function stirOf(prop, now) {
  if (!Number.isFinite(prop.honeyAt)) return 0;
  const takenAt = prop.honeyAt - WK.honey.days * clock.DAY_LENGTH;
  const since = now - takenAt;
  return since < 0 ? 0 : Math.max(0, 1 - since / BEES.stirSeconds);
}

// This frame's bees of a hive drawn at (x, y) with its frame `f` and anchor `an`, placed round its crown, or null (night, or none).
export function beesFor(prop, f, x, y, an) {
  const list = beesAt(prop, loop.simTime(), clock.getPhase(), stirOf(prop, clock.getElapsed()));
  if (!list.length) return null;
  const cx = x - an[0] + Math.round(f[2] / 2);
  const cy = y - an[1] + BEES.crownY;
  return { list, cx, cy, ground: y };
}

// Draw the half of `bees` (what `beesFor` returned) on the far side of their loops (`back` true, before the hive) or the near side (after it).
export function emit(bees, back, world) {
  if (!bees) return;
  const dark = gl.rgb(BEES.dark);
  const gold = gl.rgb(BEES.gold);
  for (const b of bees.list) {
    if (b.back !== back) continue;
    const px = bees.cx + b.x;
    const py = bees.cy + b.y;
    const opts = { world, heights: Math.max(0, bees.ground - py), flags: gl.FLAG_STANDING };
    gl.poly([[px, py], [px + 1, py], [px + 1, py + 1], [px, py + 1]], dark, opts);
    const gx = px - b.dx; // the gold pixel trails the dark one
    gl.poly([[gx, py], [gx + 1, py], [gx + 1, py + 1], [gx, py + 1]], gold, opts);
  }
}
