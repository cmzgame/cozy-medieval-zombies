// The pathfinder's working memory (#124, the engine review's B8): `node tools/pathbench.js [N]` (4000 by default). Boots the
// valley under Node as tools/world.js does and runs N searches between walkable tiles round the spawn (a quarter near, a quarter
// middling, half far enough that many fail at the bound, as the dead's do; a quarter at the fence search's bound of 500), first
// through the old pathfinder (each search allocating its maps, its set, and an object per push; kept here as it was) and then
// through `src/pathfind.js`, which reuses its typed arrays. Every path must be the old one, tile for tile, or it exits 1.
// Reported per pathfinder: the time and the collections the garbage collector ran with their milliseconds (the paths returned
// are allocated by both); each run warm, three rounds, the best kept. `--quiet` prints the one line `tools/check.js` reads.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PerformanceObserver } from "node:perf_hooks";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const argv = process.argv.slice(2);
const quiet = argv.includes("--quiet");
const N = Number(argv.find((a) => !a.startsWith("--")) || 4000);

// --- The old pathfinder, as it was on main before #124 (src/pathfind.js, 2026-10-09 to 2026-10-25) ---
const SQRT2 = Math.SQRT2;
const NEIGHBORS = [
  [1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1],
  [1, 1, SQRT2], [1, -1, SQRT2], [-1, 1, SQRT2], [-1, -1, SQRT2],
];
const KEY_OFF = 32768;
function octile(ax, ay, bx, by) {
  const dx = Math.abs(ax - bx);
  const dy = Math.abs(ay - by);
  return Math.max(dx, dy) + (SQRT2 - 1) * Math.min(dx, dy);
}
function heapPush(h, n) {
  h.push(n);
  let i = h.length - 1;
  while (i > 0) {
    const p = (i - 1) >> 1;
    if (h[p].f <= h[i].f) break;
    [h[p], h[i]] = [h[i], h[p]];
    i = p;
  }
}
function heapPop(h) {
  const top = h[0];
  const last = h.pop();
  if (h.length) {
    h[0] = last;
    let i = 0;
    for (;;) {
      const l = i * 2 + 1;
      const r = l + 1;
      let m = i;
      if (l < h.length && h[l].f < h[m].f) m = l;
      if (r < h.length && h[r].f < h[m].f) m = r;
      if (m === i) break;
      [h[m], h[i]] = [h[i], h[m]];
      i = m;
    }
  }
  return top;
}
function oldFindPath(start, goal, canStep, maxExpansions = 1500) {
  const [sx, sy] = start;
  const [gx, gy] = goal;
  if (sx === gx && sy === gy) return [];
  const key = (x, y) => (x + KEY_OFF) * 65536 + (y + KEY_OFF);
  const gScore = new Map();
  const cameFrom = new Map();
  const closed = new Set();
  const open = [];
  heapPush(open, { x: sx, y: sy, f: octile(sx, sy, gx, gy) });
  gScore.set(key(sx, sy), 0);
  let expansions = 0;
  while (open.length) {
    const cur = heapPop(open);
    const ck = key(cur.x, cur.y);
    if (closed.has(ck)) continue;
    closed.add(ck);
    if (++expansions > maxExpansions) return null;
    if (cur.x === gx && cur.y === gy) {
      const p = [];
      let node = cur;
      while (cameFrom.has(key(node.x, node.y))) {
        p.push([node.x, node.y]);
        node = cameFrom.get(key(node.x, node.y));
      }
      p.reverse();
      return p;
    }
    const g = gScore.get(ck);
    for (const [dx, dy, cost] of NEIGHBORS) {
      const nx = cur.x + dx;
      const ny = cur.y + dy;
      const nk = key(nx, ny);
      if (closed.has(nk)) continue;
      if (!canStep(cur.x, cur.y, nx, ny)) continue;
      const ng = g + cost;
      if (ng < (gScore.get(nk) ?? Infinity)) {
        gScore.set(nk, ng);
        cameFrom.set(nk, cur);
        heapPush(open, { x: nx, y: ny, f: ng + octile(nx, ny, gx, gy) });
      }
    }
  }
  return null;
}
// --- end of the old pathfinder ---

const { bootData } = await import("../server/boot.js");
const map = await import("../src/map.js");
const game = await import("../src/game.js");
const pathfind = await import("../src/pathfind.js");
await bootData(root);
const json = JSON.parse(fs.readFileSync(path.join(root, "data/maps/valley.json"), "utf8"));
game.create({ json, rules: { zombieAggro: false } });
const p0 = game.state.player;
const cx = Math.round(p0.gx);
const cy = Math.round(p0.gy);

// The searches, drawn by a generator of this tool's own (never the world's rng): walkable tiles round the spawn.
let seed = 124;
const rnd = () => ((seed = (Math.imul(seed, 1103515245) + 12345) >>> 0) / 4294967296);
const R = 60;
const walkable = [];
for (let y = cy - R; y <= cy + R; y++) for (let x = cx - R; x <= cx + R; x++) if (map.isWalkableTile(x, y)) walkable.push([x, y]);
const jobs = [];
for (let i = 0; i < N; i++) {
  const a = walkable[Math.floor(rnd() * walkable.length)];
  const band = i % 4;
  const reach = band === 0 ? 8 : band === 1 ? 24 : 120;
  let b;
  for (let t = 0; t < 50; t++) {
    b = walkable[Math.floor(rnd() * walkable.length)];
    if (Math.max(Math.abs(b[0] - a[0]), Math.abs(b[1] - a[1])) <= reach) break;
  }
  jobs.push([a, b, band === 3 ? 500 : 1500]);
}
// The map's own step test; reading never grows a chunk, so both pathfinders see the same tiles.
const canStep = map.canStep;

let gcCount = 0;
let gcMs = 0;
const obs = new PerformanceObserver((list) => {
  for (const e of list.getEntries()) {
    gcCount++;
    gcMs += e.duration;
  }
});
obs.observe({ entryTypes: ["gc"] });
const settle = () => new Promise((r) => setTimeout(r, 100)); // the observer is told of a collection a little after it

async function run(fn) {
  const out = new Array(jobs.length);
  await settle();
  const c0 = gcCount;
  const m0 = gcMs;
  const t0 = performance.now();
  for (let i = 0; i < jobs.length; i++) out[i] = fn(jobs[i][0], jobs[i][1], canStep, jobs[i][2]);
  const ms = performance.now() - t0;
  await settle();
  return { out, ms, gcs: gcCount - c0, gcMs: gcMs - m0 };
}

async function best(fn) {
  await run(fn); // warm
  let b = null;
  for (let k = 0; k < 3; k++) {
    const r = await run(fn);
    if (!b || r.ms < b.ms) b = r;
  }
  return b;
}

const before = await best(oldFindPath);
const after = await best(pathfind.findPath);
obs.disconnect();

let differ = -1;
for (let i = 0; i < jobs.length; i++) {
  if (JSON.stringify(before.out[i]) !== JSON.stringify(after.out[i])) { differ = i; break; }
}
const found = after.out.filter((p) => p).length;
const tiles = after.out.reduce((s, p) => s + (p ? p.length : 0), 0);
const line = (name, r) => `${name}: ${r.ms.toFixed(1)} ms (${((r.ms * 1000) / jobs.length).toFixed(1)} µs a search), ${r.gcs} collections taking ${r.gcMs.toFixed(1)} ms`;
if (quiet) {
  console.log(`pathbench: ${jobs.length} searches, ${found} found, paths ${differ < 0 ? "identical" : `DIFFER at ${differ}`}, old ${before.ms.toFixed(0)} ms, new ${after.ms.toFixed(0)} ms, collections ${before.gcs} to ${after.gcs}`);
} else {
  console.log(`${jobs.length} searches on the valley round the spawn (${walkable.length} walkable tiles): ${found} found, ${jobs.length - found} failed at the bound, ${tiles} tiles of path`);
  console.log(line("before (maps and objects)", before));
  console.log(line("after (reused typed arrays)", after));
  console.log(`the workspace: room for ${pathfind.workspaceStats().capacity} nodes`);
  console.log(`paths: ${differ < 0 ? "every one identical" : `DIFFERENT at search ${differ}: ${JSON.stringify(jobs[differ])}`}`);
}
process.exit(differ < 0 ? 0 : 1);
