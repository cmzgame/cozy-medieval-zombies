// Copied from cozy-zombie-game src/pathfind.js on 2026-10-09 and changed: steps go
// through a `canStep(x0, y0, x1, y1)` test instead of per-tile walkability, so
// edge walls count; the open list is a binary heap and the search is bounded,
// because the map is large and a failed search must stay cheap.

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

// Minimal binary heap on f.
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

// Returns an array of [x, y] tiles from start (exclusive) to goal (inclusive),
// or null if unreachable within `maxExpansions` closed tiles.
export function findPath(start, goal, canStep, maxExpansions = 1500) {
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
      const path = [];
      let node = cur;
      while (cameFrom.has(key(node.x, node.y))) {
        path.push([node.x, node.y]);
        node = cameFrom.get(key(node.x, node.y));
      }
      path.reverse();
      return path;
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
