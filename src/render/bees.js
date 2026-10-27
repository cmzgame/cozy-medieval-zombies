// Bees at a hive (#441; Michael, 2026-10-25: "a small cloud of bees animation that can play at or near the beehive"): a few bees drifting in loops
// above and beside the crown of every hive in view, by day only (none from dusk to dawn: `clock.getPhase()` is "day"), livelier for a few seconds when
// the hive's honey is taken (read off its `honeyAt`, which the host's verb sets and the chunk carries to a guest; `stirOf`). Cosmetic and the client's
// alone, like the fire's flicker: drawn by every client from what it already has, no sim state, nothing saved or sent; its time is the sim clock
// (`loop.simTime()`), so it is steady across frames and stops with the pause. A bee is a small figure drawn at the hive art's own scale, 5 by 4
// whole pixels (`BEES.figure`): a body of three stripes, dark, gold, dark, 3 by 3, a dark pixel at its head, and two pale wing pixels above that
// fold to one on alternate steps; it faces the way it flies, mirrored (Primary's pane looks on #451: single pixels, then 2 by 2 specks, read as
// noise against the straw's 1-pixel lines). Most of a loop is in front of the hive and drawn after it; only the farthest arc is drawn before it,
// so the hive hides a bee passing behind. `beesAt` and `figureOf` are pure, for `check("bees")` and `node tools/check.js`.

import * as gl from "../gl.js";
import * as clock from "../clock.js";
import * as loop from "../loop.js";
import { work as WK } from "../tuning.js";

export const BEES = {
  min: 3, // a hive's bees by day, three to six by its id
  max: 6,
  crownY: 4, // the cloud's anchor, this many pixels below the top of the hive's frame
  rx: [10, 18], // a loop's half-width in pixels, by bee
  ry: [4, 7], // its half-height (the loops are flat, as the ground is)
  side: 10, // a loop's centre this far at most to either side of the crown's middle
  lift: [8, 16], // and this far above the cloud's anchor, so the bees fly over and beside the crown, not on it
  spin: [1.2, 2.4], // radians a second round the loop
  backArc: -0.6, // a bee is behind the hive only where its loop's sine is below this (the farthest arc)
  // The figure facing right (its head at the right), rows top to bottom: D dark, G gold, W wing, `.` nothing. Its centre pixel (2, 2) is the bee's
  // position. Facing left is each row reversed.
  figure: {
    up: [".WW..", ".DGD.", ".DGDD", ".DGD."], // wings up
    folded: ["..W..", ".DGD.", ".DGDD", ".DGD."], // wings folded to one pixel, the next step
  },
  centre: [2, 2],
  stirSeconds: 8, // how long a hive stays lively after its honey is taken, fading
  gold: "#e0b03a",
  dark: "#2b2522",
  wing: "#e8e4d0",
};
const COLOUR = { D: "dark", G: "gold", W: "wing" };

// A bee's pixels as drawn: [dx, dy, colour] from its position, for its way (`dx`) and its wing's beat (`wing`).
export function figureOf(bee) {
  const rows = bee.wing ? BEES.figure.up : BEES.figure.folded;
  const out = [];
  rows.forEach((row, y) => {
    const r = bee.dx < 0 ? [...row].reverse() : [...row];
    r.forEach((ch, x) => {
      if (COLOUR[ch]) out.push([x - (bee.dx < 0 ? row.length - 1 - BEES.centre[0] : BEES.centre[0]), y - BEES.centre[1], BEES[COLOUR[ch]]]);
    });
  });
  return out;
}

// FNV-1a over a string: a hive's numbers from its id, the same on every client.
function hash(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}
const frac = (h, k) => (hash(`${h}:${k}`) % 10007) / 10007;
const between = ([lo, hi], f) => lo + (hi - lo) * f;

// Whether bees are out at this phase of the day.
export const awake = (phase) => phase === "day";

// How many bees a hive has by day.
export function countOf(prop) {
  return BEES.min + (hash(String(prop.id)) % (BEES.max - BEES.min + 1));
}

// The bees of a hive at sim time `t` (seconds) and day phase `phase`, `stir` 0..1 (1 the moment its honey was taken): a list of
// { x, y, back, dx, wing } in whole pixels from the cloud's anchor (the body's top-left), `back` for those on the farthest arc of their loop,
// `dx` the way the bee flies (-1 or 1), `wing` whether its wing is drawn this step (alternate sim steps, each bee on its own beat).
export function beesAt(prop, t, phase, stir = 0) {
  if (!awake(phase)) return [];
  const s = Math.max(0, Math.min(1, stir));
  const n = Math.min(BEES.max, countOf(prop) + Math.round(s * (BEES.max - countOf(prop))));
  // Livelier is wider loops and a fast buzz on top, never a faster loop: a speed that changed with the stir would jump every bee along its loop
  // (the angle is speed times a large sim time), where a size that changes only moves it a little.
  const reach = 1 + 0.5 * s;
  const step = Math.round(t * 60); // the step number: sim time is a sum of sixtieths, and flooring it lands on the step before now and then
  const out = [];
  for (let i = 0; i < n; i++) {
    const key = `${prop.id}#${i}`;
    const rx = between(BEES.rx, frac(key, 1)) * reach;
    const ry = between(BEES.ry, frac(key, 2)) * reach;
    const w = between(BEES.spin, frac(key, 3)) * (frac(key, 4) < 0.5 ? -1 : 1);
    const a0 = Math.PI * 2 * frac(key, 5);
    const lift = between(BEES.lift, frac(key, 6));
    const wf = 5 + 3 * frac(key, 7);
    const side = BEES.side * (2 * frac(key, 8) - 1);
    const a = a0 + w * t;
    const buzz = 3 * s;
    const x = Math.round(side + rx * Math.cos(a) + 1.5 * Math.cos(wf * t + a0) + buzz * Math.cos(4 * wf * t + a0));
    const y = Math.round(-lift + ry * Math.sin(a) + 1.5 * Math.sin(1.3 * wf * t + a0) + buzz * Math.sin(3.7 * wf * t + a0));
    const vx = -w * Math.sin(a); // the loop's own way across the screen
    out.push({ x, y, back: Math.sin(a) < BEES.backArc, dx: vx < 0 ? -1 : 1, wing: (step + i) % 2 === 0 });
  }
  return out;
}

// How lively a hive is at the clock's second `now`: 1 the moment its honey was taken, fading to 0 over `stirSeconds`. The moment is read off the
// prop itself, with no memory: the `honey` verb sets `honeyAt` to the clock then plus `work.honey.days` of days (src/hives.js), so a hive whose
// honey was taken while nobody watched is calm when it comes into view, and a guest reads the same from the same prop. The "just taken" moment is
// `honeyAt` minus today's value of that lever (`docs/42-levers.md`, Honey): lowering `work.honey.days` between a take and its day moves that
// moment later and can stir the hive once more, cosmetically; nothing else reads it.
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

// Draw the bees of `bees` (what `beesFor` returned) on the farthest arc of their loops (`back` true, before the hive) or the rest (after it):
// each pixel of each figure a one-pixel square at whole pixels.
export function emit(bees, back, world) {
  if (!bees) return;
  gl.holdOrder(true); // the bees' pixels never overlap one another: one step of the hive's emit order for them all (docs/51)
  for (const b of bees.list) {
    if (b.back !== back) continue;
    const px = bees.cx + b.x;
    const py = bees.cy + b.y;
    const opts = { world, heights: Math.max(0, bees.ground - py), flags: gl.FLAG_STANDING };
    for (const [dx, dy, c] of figureOf(b)) {
      const x = px + dx;
      const y = py + dy;
      gl.poly([[x, y], [x + 1, y], [x + 1, y + 1], [x, y + 1]], gl.rgb(c), opts);
    }
  }
  gl.holdOrder(false);
}
