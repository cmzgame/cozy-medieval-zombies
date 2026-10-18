// How evenly a remote body moves on a guest (#248): `node tools/netsmooth.js`. A body walks at a steady speed on the host; its frames (every third step) reach the guest
// with the arrival patterns of a real wire (steady, alternating early and late, random, one long stall then a catch-up), and each guest step draws it where the smoothing
// puts it. Reported per pattern, for the old smoothing (walk to each frame's position in a fixed three steps) and for `src/netsmooth.js`: the movement per step (mean, spread,
// how many steps it stood still, the largest), and how far behind the host's truth it is drawn (in steps; the spread of that too). The old code is kept here, as it was.
import * as ns from "../src/netsmooth.js";

const STEP = 1 / 60;
const V = 0.05; // tiles a step: three tiles a second
const BASE = 4; // steps of wire latency
const N = 900;

function frames(pattern) {
  const out = []; // { k, arrive }
  let seed = 7;
  const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  let prev = 0;
  for (let k = 0; k < N / 3; k++) {
    let j = 0;
    if (pattern === "alternating 2 and 4 steps apart") j = k % 2;
    else if (pattern === "random jitter (-1 to +2 steps)") j = Math.floor(rnd() * 4) - 1;
    else if (pattern === "a stall of 6 steps now and then") j = k % 17 === 5 ? 3 : k % 17 === 6 ? 0 : 0;
    let arrive = k * 3 + BASE + j;
    if (arrive < prev) arrive = prev; // in order
    prev = arrive;
    out.push({ k, arrive });
  }
  return out;
}

function runOld(fr) {
  const c = { gx: 0, gy: 0 };
  let ti = 0;
  const drawn = [];
  for (let s = 0; s < N; s++) {
    while (ti < fr.length && fr[ti].arrive <= s) {
      const x = fr[ti].k * 3 * V;
      c.netFrom = [c.gx, c.gy]; c.netTo = [x, 0]; c.netT = 0; // aimAt
      ti++;
    }
    if (c.netTo) { c.netT = Math.min(3, (c.netT || 0) + 1); const t = c.netT / 3; c.gx = c.netFrom[0] + (c.netTo[0] - c.netFrom[0]) * t; } // smoothStep
    drawn.push(c.gx);
  }
  return drawn;
}

function runNew(fr) {
  ns.reset();
  const c = { gx: 0, gy: 0 };
  let ti = 0;
  const drawn = [];
  for (let s = 0; s < N; s++) {
    while (ti < fr.length && fr[ti].arrive <= s) {
      const h = fr[ti].k * 3 * STEP;
      ns.frameArrived(h);
      ns.aim(c, fr[ti].k * 3 * V, 0, h);
      ti++;
    }
    ns.step([c]);
    drawn.push(c.gx);
  }
  return drawn;
}

const stat = (xs) => { const m = xs.reduce((a, b) => a + b, 0) / xs.length; return { mean: m, sd: Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / xs.length), min: Math.min(...xs), max: Math.max(...xs) }; };

function report(drawn) {
  const from = 120;
  const d = [];
  for (let s = from + 1; s < N; s++) d.push((drawn[s] - drawn[s - 1]) / V); // steps' worth of movement per step: 1 is steady
  const lag = [];
  for (let s = from; s < N; s++) lag.push(((s - BASE) * V - drawn[s]) / V); // steps behind the host's truth at that moment
  const m = stat(d);
  const l = stat(lag);
  return { move: m, still: d.filter((x) => x < 0.05).length, lag: l };
}

// A body that walks, stands, and walks again, the host sending its record only when it moved (the dead and the villagers come as a delta); frames arrive every third
// step, steady. Reports the drawn x against the truth while it stands, and the first steps of the second walk (1 is steady). `hold` is `netsmooth.hold` (off for the old way).
export function measureDelta(useHold = true) {
  ns.reset();
  const c = { gx: 0, gy: 0 };
  const truth = (s) => { const w = s < 120 ? s : s < 240 ? 120 : s - 120; return w * V; };
  const drawn = [];
  let sent = null;
  for (let s = 0; s < 420; s++) {
    if (s >= BASE && (s - BASE) % 3 === 0) {
      const hostStep = s - BASE;
      const h = hostStep * STEP;
      const x = truth(hostStep);
      ns.frameArrived(h);
      if (sent === null || x !== sent) { ns.aim(c, x, 0, h); sent = x; } // a record goes when the body moved
      if (useHold) ns.hold([c], h);
    }
    ns.step([c]);
    drawn.push(c.gx);
  }
  const atRest = drawn.slice(190, 235).map((x) => Math.abs(x - 120 * V)); // late in the stand, the buffer long since caught up
  const start = [];
  for (let s = 248; s < 260; s++) start.push((drawn[s] - drawn[s - 1]) / V);
  return { restOffset: Math.max(...atRest), start };
}

export function measure() {
  const out = {};
  for (const p of ["steady", "alternating 2 and 4 steps apart", "random jitter (-1 to +2 steps)", "a stall of 6 steps now and then"]) {
    const fr = frames(p);
    out[p] = { old: report(runOld(fr)), now: report(runNew(fr)) };
  }
  return out;
}

if (process.argv[1] && process.argv[1].endsWith("netsmooth.js")) {
  for (const [label, hold] of [["without hold", false], ["with hold", true]]) {
    const d = measureDelta(hold);
    console.log(`walk, stand, walk (a record only when it moved) ${label}: drawn ${d.restOffset.toFixed(3)} tiles off the truth at rest; the walk's first steps ${d.start.slice(0, 8).map((x) => x.toFixed(2)).join(" ")}`);
  }
  for (const [p, r] of Object.entries(measure())) {
    const f = (x) => x.toFixed(2);
    console.log(`${p}:`);
    for (const k of ["old", "now"]) {
      const o = r[k];
      console.log(`  ${k === "old" ? "old (fixed 3 steps)" : "buffered         "}: movement a step (1 = steady) mean ${f(o.move.mean)} sd ${f(o.move.sd)} from ${f(o.move.min)} to ${f(o.move.max)}, standing still ${o.still} steps; behind the host ${f(o.lag.mean)} steps (sd ${f(o.lag.sd)})`);
    }
  }
}
