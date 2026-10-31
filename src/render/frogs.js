// Frogs on the shallows and the ring round a wader (art round 14b, approved by Michael 2026-10-31: "The frog is especially excellent"; his #571:
// "perhaps a few frame frog jumping animation", "Really emphasize that it's water but walkable"). Cosmetic and the client's alone, as the bees
// are (render/bees.js): drawn by every client from what it already has, nothing saved or sent; its time is the sim clock (`loop.simTime()`), so
// a host and a guest see the same frog on the same tile doing the same thing, and it stops with the pause.
//
// A frog lives on a shallow tile picked by the tile's hash (`FROGS.density` of them), and nothing ever pops into view: it sits, now and then
// blinks or swells its throat, and every so often (its own period, by its hash) crouches, hops one tile to a shallow neighbour, lands in a small
// splash, and sits there until it hops back. A body standing in shallow water has a ring of ripples at its feet, the back arc under it and the
// front arc over its feet. `frogAt` is pure, for the checks.

import * as gl from "../gl.js";
import * as iso from "../iso.js";
import * as map from "../map.js";
import * as loop from "../loop.js";
import * as depth from "./depth.js";
import { getSheet } from "../assets.js";
import { tileKey } from "../visibility.js";
import { frameQuad, DEPTH_BIAS, DEPTH_ROOM } from "./scene.js";
import { flatHere } from "./storeys.js";

export const FROGS = {
  density: 0.05, // a shallow tile's chance of a frog living on it
  period: [7, 14], // seconds between hops, by the frog
  crouch: 0.17, // seconds crouched before the hop
  hop: 0.25, // the hop's three frames (12 a second)
  land: 0.125,
  settle: 0.45, // after landing, the splash's time, before the next sit begins
  along: [0.12, 0.5, 0.85], // how far across the tile each hop frame is (the art's `hop.along`)
  idleOrder: [0, 1, 0, 0, 2, 0], // the sit's frames at 2 a second (sit, throat, sit, sit, blink, sit)
};
const SHALLOW = "floor_water_shallow";
// The four ways a frog hops, in grid steps, with the facing drawn and whether it is mirrored: +x is the screen's south-east, -y its north-east,
// +y its south-west (the south-east mirrored), -x its north-west (the north-east mirrored).
const DIRS = [
  { d: [1, 0], face: "se", flip: false },
  { d: [0, -1], face: "ne", flip: false },
  { d: [0, 1], face: "se", flip: true },
  { d: [-1, 0], face: "ne", flip: true },
];
const BACK = [3, 2, 1, 0]; // each way's reverse, by index: se back is nw, ne back is sw

// FNV-1a over a tile and a salt: a frog's numbers from where it lives, the same on every client.
function hash(x, y, k) {
  const s = `${x},${y}:${k}`;
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return (h >>> 0) / 4294967296;
}

const isShallow = (x, y) => {
  const t = map.peekTile(x, y, 0);
  return !!t && t.floor === SHALLOW;
};

// The frog living on tile (x, y) at sim time `t` (seconds), or null: { gx, gy, frame, flip, splash } (`splash` the landing ring's frame and its
// point, or null). `shallow(x, y)` says whether a tile is shallow water (the map's, by default).
export function frogAt(x, y, t, shallow = isShallow) {
  if (!shallow(x, y) || hash(x, y, 1) >= FROGS.density) return null;
  // Its hop: the first shallow neighbour round from a way its hash picks; none, and it only sits.
  const start = Math.floor(hash(x, y, 2) * 4);
  let way = -1;
  for (let i = 0; i < 4; i++) {
    const w = (start + i) % 4;
    const [dx, dy] = DIRS[w].d;
    if (shallow(x + dx, y + dy)) { way = w; break; }
  }
  const P = FROGS.period[0] + (FROGS.period[1] - FROGS.period[0]) * hash(x, y, 3);
  const tt = t + hash(x, y, 4) * P;
  const c = Math.floor(tt / P);
  const f = tt - c * P;
  const sit = (gx, gy, w, sf) => {
    const D = DIRS[w < 0 ? start : w];
    const i = FROGS.idleOrder[Math.floor(sf * 2) % FROGS.idleOrder.length];
    return { gx, gy, frame: `idle_${D.face}_${i}`, flip: D.flip, splash: null };
  };
  if (way < 0) return sit(x, y, -1, f);
  const out = c % 2 === 0; // even cycles hop out to the neighbour, odd ones back home
  const w = out ? way : BACK[way];
  const D = DIRS[w];
  const from = out ? [x, y] : [x + DIRS[way].d[0], y + DIRS[way].d[1]];
  const to = [from[0] + D.d[0], from[1] + D.d[1]];
  const hopAt = P - FROGS.crouch - FROGS.hop - FROGS.land - FROGS.settle;
  if (f < hopAt) return sit(from[0], from[1], BACK[w], f); // sitting where the last hop left it, facing the way it came
  let s = f - hopAt;
  const at = (k) => [from[0] + D.d[0] * k, from[1] + D.d[1] * k];
  if (s < FROGS.crouch) return { gx: from[0], gy: from[1], frame: `crouch_${D.face}_0`, flip: D.flip, splash: null };
  s -= FROGS.crouch;
  if (s < FROGS.hop) {
    const i = Math.min(2, Math.floor((s / FROGS.hop) * 3));
    const [gx, gy] = at(FROGS.along[i]);
    return { gx, gy, frame: `hop_${D.face}_${i}`, flip: D.flip, splash: i === 0 ? { frame: "idle_0", gx: from[0], gy: from[1] } : null };
  }
  s -= FROGS.hop;
  const ring = { frame: `idle_${Math.min(2, Math.floor(s / 0.1))}`, gx: to[0], gy: to[1] };
  if (s < FROGS.land) return { gx: to[0], gy: to[1], frame: `land_${D.face}_0`, flip: D.flip, splash: ring };
  return { gx: to[0], gy: to[1], frame: `idle_${D.face}_0`, flip: D.flip, splash: s < FROGS.land + 0.3 ? ring : null };
}

// The frogs living on the ground tiles in view and in sight, as drawables (render/scene.js, the ground's layer alone: the shallows are ground).
export function frogDrawables(tiles, visible, out) {
  let sheet = null;
  try { sheet = getSheet("critter_frog"); } catch { return; }
  let splash = null;
  try { splash = getSheet("frog_splash"); } catch { splash = null; }
  const t = loop.simTime();
  for (const [tx, ty] of tiles) {
    if (!isShallow(tx, ty)) continue;
    const fr = frogAt(tx, ty, t);
    if (!fr) continue;
    if (visible && !visible.has(tileKey(Math.round(fr.gx), Math.round(fr.gy)))) continue;
    const p = iso.toScreen(fr.gx, fr.gy);
    const x = Math.round(p.x);
    const y = Math.round(p.y);
    out.push({
      key: (fr.gx + fr.gy) * 1000 + 0.85,
      kind: "prop",
      vis: true,
      rect: { x: x - 9, y: y - 20, w: 18, h: 22 },
      canOcclude: false,
      occluder: false,
      emit() {
        if (fr.splash && splash) {
          const sp = iso.toScreen(fr.splash.gx, fr.splash.gy);
          flatHere(() => frameQuad(splash, fr.splash.frame, Math.round(sp.x), Math.round(sp.y), { world: [fr.splash.gx, fr.splash.gy], heights: 0, flags: gl.FLAG_NOFOG }));
        }
        gl.surface(depth.billboard(fr.gx, fr.gy), DEPTH_BIAS.prop, DEPTH_ROOM.prop);
        frameQuad(sheet, fr.frame, x, y, { world: [fr.gx, fr.gy], flags: gl.FLAG_NOFOG }, fr.flip);
      },
    });
  }
}

// A ring of ripples at the feet of every body standing in shallow water on the ground, in sight: the back arc flat under it, the front arc a
// billboard just over its feet. Its frame turns at 5 a second, each body on its own beat.
export function wadeDrawables(bodies, visible, out) {
  let sheet = null;
  try { sheet = getSheet("wade_ripple"); } catch { return; }
  const t = loop.simTime();
  for (const b of bodies) {
    if ((b.layer || 0) !== 0 || b.rise || b.dead) continue;
    const tx = Math.round(b.gx);
    const ty = Math.round(b.gy);
    if (!isShallow(tx, ty)) continue;
    if (visible && !visible.has(tileKey(tx, ty))) continue;
    const i = Math.floor(t * 5 + hash(tx, ty, String(b.id)) * 3) % 3;
    const p = iso.toScreen(b.gx, b.gy);
    const x = Math.round(p.x);
    const y = Math.round(p.y);
    out.push({
      key: (b.gx + b.gy) * 1000 + 0.95,
      kind: "prop",
      vis: true,
      rect: { x: x - 12, y: y - 5, w: 24, h: 10 },
      canOcclude: false,
      occluder: false,
      emit() {
        flatHere(() => frameQuad(sheet, `back_${i}`, x, y, { world: [b.gx, b.gy], heights: 0, flags: gl.FLAG_NOFOG }));
        gl.surface(depth.billboard(b.gx + 0.02, b.gy + 0.02), DEPTH_BIAS.figure, DEPTH_ROOM.figure); // just nearer than the body's own billboard
        frameQuad(sheet, `front_${i}`, x, y, { world: [b.gx, b.gy], flags: gl.FLAG_NOFOG });
      },
    });
  }
}
