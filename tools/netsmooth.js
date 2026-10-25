// How evenly a remote body moves on a guest (#248): `node tools/netsmooth.js`. A body walks at a steady speed on the host; its frames (every third step) reach the guest
// with the arrival patterns of a real wire (steady, alternating early and late, random, one long stall then a catch-up), and each guest step draws it where the smoothing
// puts it. Reported per pattern, for the old smoothing (walk to each frame's position in a fixed three steps) and for `src/netsmooth.js`: the movement per step (mean, spread,
// how many steps it stood still, the largest), and how far behind the host's truth it is drawn (in steps; the spread of that too). The old code is kept here, as it was.
// And a guest's arrows under the same patterns (#250, `measureArrows`): drawn where each frame put them, as they were, against stepped from their launch records.
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

// Arrows on a guest (#250): a flight loosed every 90 host steps (20 tiles at 16 a second, 75 steps in the air), the frames arriving by `pattern`.
// The old way drew each flight where the newest frame put it (the frame's positions, as `setReplicaArrows` did); now the guest is sent each
// flight's launch once and its end once and steps it itself (`archery.applyFlights`, `stepFlights`) on the bodies' draw clock. Reports, per way,
// the movement a step while a flight is drawn (1 = its speed), the steps it stood still, and how far from its launch point it is first drawn
// (in steps of its movement: under 1 is no first-frame stall).
export function measureArrows(pattern = "steady", archery) {
  const SPEED = 16;
  const S = 20;
  const STEP_MOVE = SPEED * STEP;
  const T = S / SPEED;
  const EVERY = 90;
  const flights = []; // { id, L (the host step it was loosed in), born, landStep, tEnd }
  for (let L = 10, id = 1; L < N - 120; L += EVERY, id++) {
    const born = (L - 1) * STEP; // loosed in step L and stepped once in it: its age at the end of step L is one step
    const landStep = L - 1 + Math.ceil(T / STEP - 1e-9);
    flights.push({ id, L, born, landStep, tEnd: (landStep - L + 1) * STEP });
  }
  const host = (f) => ({ id: f.id, projectile: "arrow", x0: 0, y0: f.id * 3, dx: 1, dy: 0, s: S, T, H: 100, z0: 30, speed: SPEED, flat: false, stopD: null, t: 0, landAt: [S, f.id * 3] });
  const xAt = (f, hostStep) => Math.min(1, Math.max(0, ((hostStep - f.L + 1) * STEP) / T)) * S; // where the host has it at the end of a step
  const fr = frames(pattern);
  const run = (useNew) => {
    ns.reset();
    const store = archery.flightStore();
    let shownOld = []; // the old replica: [{ id, gx }] as the newest frame said
    const drawn = new Map(); // id -> [gx per guest step, null when not drawn]
    let ti = 0;
    let prevK = -1;
    for (let s = 0; s < N; s++) {
      while (ti < fr.length && fr[ti].arrive <= s) {
        const K = fr[ti].k * 3; // the host step the frame was sent after
        const h = K * STEP;
        if (useNew) {
          const go = flights.filter((f) => f.L > prevK && f.L <= K).map((f) => archery.launchRecord(host(f), h - f.born));
          const end = flights.filter((f) => f.landStep > prevK && f.landStep <= K).map((f) => archery.endRecord({ ...host(f), t: f.tEnd }));
          ns.frameArrived(h);
          archery.applyFlights(store, go.length || end.length ? { go, end } : null, h);
        } else shownOld = flights.filter((f) => f.L <= K && f.landStep > K).map((f) => ({ id: f.id, gx: xAt(f, K) }));
        prevK = K;
        ti++;
      }
      let list = shownOld;
      if (useNew) {
        ns.step([]);
        archery.stepFlights(store, ns.drawClock());
        list = store.shown;
      }
      for (const a of list) {
        if (!drawn.has(a.id)) drawn.set(a.id, []);
        drawn.get(a.id)[s] = a.gx;
      }
    }
    const moves = [];
    const firsts = [];
    for (const xs of drawn.values()) {
      const at = [];
      xs.forEach((x, s) => { if (typeof x === "number") at.push([s, x]); });
      if (at.length < 4) continue;
      firsts.push(at[0][1] / STEP_MOVE);
      for (let i = 2; i < at.length - 1; i++) if (at[i][0] === at[i - 1][0] + 1) moves.push((at[i][1] - at[i - 1][1]) / STEP_MOVE); // inner steps only
    }
    return { move: stat(moves), still: moves.filter((x) => x < 0.05).length, steps: moves.length, first: stat(firsts), flights: drawn.size };
  };
  return { old: run(false), now: run(true), flights: flights.length };
}

export const PATTERNS = ["steady", "alternating 2 and 4 steps apart", "random jitter (-1 to +2 steps)", "a stall of 6 steps now and then"];

export function measure() {
  const out = {};
  for (const p of PATTERNS) {
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
  const archery = await import("../src/archery.js");
  for (const p of PATTERNS) {
    const r = measureArrows(p, archery);
    const f = (x) => x.toFixed(2);
    console.log(`arrows, ${p} (${r.flights} flights):`);
    for (const k of ["old", "now"]) {
      const o = r[k];
      console.log(`  ${k === "old" ? "old (each frame's place)" : "stepped from launch     "}: movement a step (1 = its speed) mean ${f(o.move.mean)} sd ${f(o.move.sd)} from ${f(o.move.min)} to ${f(o.move.max)}, standing still ${o.still} of ${o.steps} steps; first drawn ${f(o.first.mean)} steps' flight from the bow (at most ${f(o.first.max)})`);
    }
  }
}
