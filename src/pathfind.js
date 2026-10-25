// Copied from cozy-zombie-game src/pathfind.js on 2026-10-09 and changed: steps go
// through a `canStep(x0, y0, x1, y1)` test instead of per-tile walkability, so
// edge walls count; the open list is a binary heap and the search is bounded,
// because the map is large and a failed search must stay cheap.
//
// The working memory is kept between searches (#124, the engine review's B8): a search
// allocates nothing but the path it returns. The tiles a search touches are nodes in
// typed arrays, numbered as they are first reached; a hash of their coordinates finds
// them, its slots cleared by a generation counter rather than refilled; the open heap
// holds node numbers. Nothing is sized to the map, so the wild growing changes nothing:
// a search touches at most 1 + 8 × maxExpansions tiles, and the arrays grow (by
// doubling, once, then kept) when one touches more than any before it. A search begun
// while another runs (a `canStep` that searches) gets a workspace of its own. The heap's
// order, ties included, is the old one's, so every path found is the one it found.

const SQRT2 = Math.SQRT2;
const NEIGHBORS = [
  [1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1],
  [1, 1, SQRT2], [1, -1, SQRT2], [-1, 1, SQRT2], [-1, -1, SQRT2],
];
const NDX = Int32Array.from(NEIGHBORS, (n) => n[0]);
const NDY = Int32Array.from(NEIGHBORS, (n) => n[1]);
const NCOST = Float64Array.from(NEIGHBORS, (n) => n[2]);
const START_NODES = 2048; // grown by doubling; the hash keeps twice as many slots as nodes

function octile(ax, ay, bx, by) {
  const dx = Math.abs(ax - bx);
  const dy = Math.abs(ay - by);
  return Math.max(dx, dy) + (SQRT2 - 1) * Math.min(dx, dy);
}

function grown(a, n) {
  const b = new a.constructor(n);
  b.set(a);
  return b;
}

class Workspace {
  constructor(nodes = START_NODES) {
    this.busy = false;
    this.cap = nodes; // nodes and heap entries
    this.x = new Int32Array(nodes);
    this.y = new Int32Array(nodes);
    this.g = new Float64Array(nodes);
    this.parent = new Int32Array(nodes);
    this.closed = new Uint8Array(nodes);
    this.count = 0;
    this.heapF = new Float64Array(nodes);
    this.heapN = new Int32Array(nodes);
    this.heapLen = 0;
    this.mask = nodes * 2 - 1;
    this.slotNode = new Int32Array(nodes * 2);
    this.slotGen = new Uint32Array(nodes * 2);
    this.gen = 0;
  }

  begin() {
    this.count = 0;
    this.heapLen = 0;
    if (++this.gen > 0xfffffffe) {
      this.slotGen.fill(0);
      this.gen = 1;
    }
  }

  static hash(x, y) {
    let h = Math.imul(x, 0x9e3779b1) ^ Math.imul(y, 0x85ebca77);
    h ^= h >>> 15;
    return h;
  }

  // The node at (x, y), made if the search has not reached it yet (cost Infinity, no parent, open).
  node(x, y) {
    const { slotGen, slotNode, mask, gen } = this;
    let s = Workspace.hash(x, y) & mask;
    while (slotGen[s] === gen) {
      const n = slotNode[s];
      if (this.x[n] === x && this.y[n] === y) return n;
      s = (s + 1) & mask;
    }
    if (this.count === this.cap) {
      this.grow();
      return this.node(x, y);
    }
    const n = this.count++;
    this.x[n] = x;
    this.y[n] = y;
    this.g[n] = Infinity;
    this.parent[n] = -1;
    this.closed[n] = 0;
    slotGen[s] = gen;
    slotNode[s] = n;
    return n;
  }

  grow() {
    const cap = this.cap * 2;
    this.cap = cap;
    this.x = grown(this.x, cap);
    this.y = grown(this.y, cap);
    this.g = grown(this.g, cap);
    this.parent = grown(this.parent, cap);
    this.closed = grown(this.closed, cap);
    this.heapF = grown(this.heapF, cap);
    this.heapN = grown(this.heapN, cap);
    this.mask = cap * 2 - 1;
    this.slotNode = new Int32Array(cap * 2);
    this.slotGen = new Uint32Array(cap * 2);
    this.gen = 1;
    for (let n = 0; n < this.count; n++) {
      let s = Workspace.hash(this.x[n], this.y[n]) & this.mask;
      while (this.slotGen[s] === 1) s = (s + 1) & this.mask;
      this.slotGen[s] = 1;
      this.slotNode[s] = n;
    }
  }

  // The binary heap on f, as the old one of objects: the same comparisons, so the same order of ties.
  push(n, f) {
    if (this.heapLen === this.cap) this.grow();
    const { heapF, heapN } = this;
    let i = this.heapLen++;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (heapF[p] <= f) break;
      heapF[i] = heapF[p];
      heapN[i] = heapN[p];
      i = p;
    }
    heapF[i] = f;
    heapN[i] = n;
  }

  pop() {
    const { heapF, heapN } = this;
    const top = heapN[0];
    const len = --this.heapLen;
    if (len) {
      const f = heapF[len];
      const n = heapN[len];
      let i = 0;
      for (;;) {
        const l = i * 2 + 1;
        const r = l + 1;
        let m = i;
        let mf = f;
        if (l < len && heapF[l] < mf) { m = l; mf = heapF[l]; }
        if (r < len && heapF[r] < mf) m = r;
        if (m === i) break;
        heapF[i] = heapF[m];
        heapN[i] = heapN[m];
        i = m;
      }
      heapF[i] = f;
      heapN[i] = n;
    }
    return top;
  }
}

const shared = new Workspace();

// Returns an array of [x, y] tiles from start (exclusive) to goal (inclusive),
// or null if unreachable within `maxExpansions` closed tiles.
export function findPath(start, goal, canStep, maxExpansions = 1500) {
  const [sx, sy] = start;
  const [gx, gy] = goal;
  if (sx === gx && sy === gy) return [];
  const w = shared.busy ? new Workspace(256) : shared;
  w.busy = true;
  try {
    return search(w, sx, sy, gx, gy, canStep, maxExpansions);
  } finally {
    w.busy = false;
  }
}

function search(w, sx, sy, gx, gy, canStep, maxExpansions) {
  w.begin();
  const s0 = w.node(sx, sy);
  w.g[s0] = 0;
  w.push(s0, octile(sx, sy, gx, gy));
  let expansions = 0;

  while (w.heapLen) {
    const cur = w.pop();
    if (w.closed[cur]) continue;
    w.closed[cur] = 1;
    if (++expansions > maxExpansions) return null;
    const cx = w.x[cur];
    const cy = w.y[cur];

    if (cx === gx && cy === gy) {
      const path = [];
      for (let n = cur; w.parent[n] !== -1; n = w.parent[n]) path.push([w.x[n], w.y[n]]);
      path.reverse();
      return path;
    }

    const g = w.g[cur];
    for (let k = 0; k < 8; k++) {
      const nx = cx + NDX[k];
      const ny = cy + NDY[k];
      const nb = w.node(nx, ny); // may grow the arrays: read them through `w` after
      if (w.closed[nb]) continue;
      if (!canStep(cx, cy, nx, ny)) continue;
      const ng = g + NCOST[k];
      if (ng < w.g[nb]) {
        w.g[nb] = ng;
        w.parent[nb] = cur;
        w.push(nb, ng + octile(nx, ny, gx, gy));
      }
    }
  }
  return null;
}

// What the shared workspace holds (for the checks and the measurement): nodes it has room for, the count of the last search it ran,
// and whether a search holds it now.
export function workspaceStats() {
  return { capacity: shared.cap, lastNodes: shared.count, busy: shared.busy };
}
