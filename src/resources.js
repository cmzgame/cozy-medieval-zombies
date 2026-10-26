// Natural resources come back (docs/46, step 1; Michael, 2026-10-25, #288: "random spawns but within defined areas"). Each kind keeps a
// count for its area (the map's `resources` block: stone across the valley, ore at the iron workings and its hills, mushrooms near trees);
// a node taken inside its area leaves a debt on the area's record, with the time it falls due (`tuning.resources.days` of the clock, rolled);
// once a `checkSeconds` of the clock, on the boundary of its multiples as fruit.js looks at the trees, every debt that has fallen due draws a
// spot at random in the area (`rng`), grows that spot's chunk through a mutator (`map.growTile`: reading never grows, and a blank tile would
// test free), and tests it by the one rule of where a node may stand (`map.resourceSpotProblem`); a spot that fails draws again, `tries`
// times, then the debt waits for the next look. A take in the wild queues nothing (the wild comes back by new chunks). Step 2 (#448) adds
// the herbs (each kind its own area and count), clay banks by the river, and salt rocks with the ore. No kind waits for night (Michael, 2026-10-25: "I don't want any 'only at night' plants"):
// the graveyard's grave moss comes back at any hour, as every herb does.
//
// What is kept: the debts and the last boundary looked at, the host's alone, in the save (game.serialize) and out of game.syncParts as the
// generator's state is (a replica never rolls them). What a comeback grows reaches a guest as its touched chunk, the new prop in it; a rock
// or an ore rock carries `risenAt`, the sim clock at its arrival, and every client draws it rising out of the ground from that stamp
// (render/props.js, `riseOf` and its shudder, `shudderOf`), so nothing new crosses the wire beyond the prop. Mushrooms and herbs simply appear.

import * as map from "./map.js";
import * as clock from "./clock.js";
import * as rng from "./rng.js";
import * as loop from "./loop.js";
import { resources as RES } from "./tuning.js";

const debts = new Map(); // kind name -> [{ due, at: [x, y] }], in the order taken
let bucket = -1;

export function reset() {
  debts.clear();
  bucket = -1;
}

function listOf(name) {
  if (!debts.has(name)) debts.set(name, []);
  return debts.get(name);
}

// A node is taken (mined, mining.js; gathered, foraged, or dug, gather.js): one debt on its area's record, if it stood inside its area. Called by the verb on
// the authority before the prop goes; returns the debt or null (not a node, or a node in the wild).
export function taken(prop) {
  if (!prop) return null;
  const kind = map.resourceKindOf(prop.sprite);
  if (!kind || !map.inResourceArea(kind, prop.tile[0], prop.tile[1])) return null;
  const [lo, hi] = kind.days || RES.days;
  const debt = { due: clock.getElapsed() + (lo + rng.float() * (hi - lo)) * clock.DAY_LENGTH, at: [prop.tile[0], prop.tile[1]] };
  listOf(kind.name).push(debt);
  return debt;
}

// The debts of a kind still owed (copies, for the checks and the console).
export function owed(name) {
  return (debts.get(name) || []).map((d) => ({ due: d.due, at: [...d.at] }));
}

// One replacement for `kind`: a random spot in its area, its chunk grown, the test made; up to `tries` draws. Returns the prop placed, or
// null. `bodies` are every character, so nothing grows under one. The spot it may not take is the one the debt's node was taken from.
export function grow(kind, bodies = [], not = null) {
  for (let i = 0; i < RES.tries; i++) {
    const [x, y] = map.resourceSpotAt(kind, rng.float());
    if (map.resourceSpotProblem(kind, x, y, { live: false, bodies, not })) continue; // a pure read first: the authored tile where nothing has grown
    map.growTile(x, y); // the mutator: the chunk exists before the test that counts
    if (map.resourceSpotProblem(kind, x, y, { live: true, bodies, not })) continue;
    const prop = map.makeResourceProp(kind, x, y, rng.float);
    if (kind.rise) prop.risenAt = loop.simTime(); // a rock rises out of the ground, drawn by every client from this stamp
    map.placeProp(prop, x, y); // marks its chunk: the save's copy goes, and the chunk is sent to a guest
    return prop;
  }
  return null;
}

// The debts fallen due, looked at once a `checkSeconds` of the clock (in game.begin, on the authority). `bodies` is every character, or a
// function that lists them, asked only on a step that has a debt to grow.
export function step(bodies = []) {
  const now = clock.getElapsed();
  const b = Math.floor(now / RES.checkSeconds);
  if (b === bucket) return;
  bucket = b;
  const at = b * RES.checkSeconds;
  let who = null;
  for (const kind of map.resourceKinds()) {
    const list = debts.get(kind.name);
    if (!list || !list.length) continue;
    for (let i = 0; i < list.length; i++) {
      const d = list[i];
      if (d.due > at) continue;
      if (!who) who = typeof bodies === "function" ? bodies() : bodies;
      if (!grow(kind, who, d.at)) continue; // waits for the next look
      list.splice(i, 1);
      i--;
    }
  }
}

// A rock rising out of the ground (docs/46 section 3): how many whole pixels of its `height` are still below the ground line at `now` (the
// sim clock): all of them at its `risenAt`, none from `riseSeconds` on, easing out as it comes up. Pure: the renderer of every client draws
// from it (render/props.js) and the check reads it; 0 for a prop that never rose (an authored rock, a mushroom).
export function riseOf(prop, height, now = loop.simTime()) {
  if (!prop || !Number.isFinite(prop.risenAt)) return 0;
  const k = (now - prop.risenAt) / RES.riseSeconds;
  if (k >= 1) return 0;
  if (k <= 0) return height;
  const below = (1 - k) * (1 - k);
  return Math.max(0, Math.min(height, Math.round(height * below)));
}

// The rise's shudder (Michael, 2026-10-25: "a little shudder as they rise from the ground, as if the ground had shifted and forced them to
// the surface ... it's just give them a cinematic entrance"): how many whole pixels a rising rock is jolted sideways at `now`. The rise is cut
// into `jolts` beats; each beat is a jolt to one side, the sides alternating (the first by the prop's id), and about one beat in four still (by
// the id and the beat); a jolt is `reach` times what is left of the rise, rounded, so 2 px in the first sixteenth, then 1 px, and none from
// about seven tenths of the rise on: it eases to still as the rock settles. From the sim clock and the prop's id alone, so every client draws
// the same shake from the host's `risenAt` and nothing crosses the wire; 0 for a prop that never rose, before its stamp, and once risen.
export const SHUDDER = { jolts: 8, reach: 1.6 };
function idHash(s) { // FNV-1a over a string
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}
export function shudderOf(prop, now = loop.simTime()) {
  if (!prop || !Number.isFinite(prop.risenAt)) return 0;
  const k = (now - prop.risenAt) / RES.riseSeconds;
  if (!(k >= 0) || k >= 1) return 0;
  const beat = Math.floor(k * SHUDDER.jolts);
  if (idHash(`${prop.id}#${beat}`) % 4 === 0) return 0; // a beat of stillness
  const side = (beat + idHash(String(prop.id))) % 2 ? -1 : 1;
  return side * Math.round(SHUDDER.reach * (1 - k)) || 0; // never -0
}

// The save's part: the debts by kind and the last boundary looked at, so a restored world looks again where the running one would.
export function serialize() {
  const out = {};
  for (const [name, list] of debts) if (list.length) out[name] = list.map((d) => [d.due, d.at[0], d.at[1]]);
  return { bucket, debts: out };
}

export function restore(data) {
  reset();
  if (!data) return;
  bucket = Number.isFinite(data.bucket) ? data.bucket : -1;
  for (const [name, list] of Object.entries(data.debts || {})) debts.set(name, list.map(([due, x, y]) => ({ due, at: [x, y] })));
}
