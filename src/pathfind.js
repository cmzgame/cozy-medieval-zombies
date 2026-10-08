// Copied from cozy-zombie-game src/pathfind.js on 2026-10-09 and changed: steps go
// through a `canStep(x0, y0, x1, y1)` test instead of per-tile walkability, so
// edge walls count, and the search is bounded because the map is large.

const SQRT2 = Math.SQRT2;
const NEIGHBORS = [
  [1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1],
  [1, 1, SQRT2], [1, -1, SQRT2], [-1, 1, SQRT2], [-1, -1, SQRT2],
];

function octile(ax, ay, bx, by) {
  const dx = Math.abs(ax - bx);
  const dy = Math.abs(ay - by);
  return Math.max(dx, dy) + (SQRT2 - 1) * Math.min(dx, dy);
}

// Returns an array of [x, y] tiles from start (exclusive) to goal (inclusive),
// or null if unreachable within `maxExpansions` closed tiles. `canStep` decides
// whether one tile-to-tile move is allowed, including diagonals (map.js).
export function findPath(start, goal, canStep, maxExpansions = 3000) {
  const [sx, sy] = start;
  const [gx, gy] = goal;
  if (sx === gx && sy === gy) return [];

  const key = (x, y) => `${x},${y}`;
  const gScore = new Map();
  const cameFrom = new Map();
  const closed = new Set();
  const open = [{ x: sx, y: sy, f: octile(sx, sy, gx, gy) }];
  gScore.set(key(sx, sy), 0);
  let expansions = 0;

  while (open.length) {
    let bi = 0;
    for (let i = 1; i < open.length; i++) if (open[i].f < open[bi].f) bi = i;
    const cur = open[bi];
    open[bi] = open[open.length - 1];
    open.pop();
    const ck = key(cur.x, cur.y);
    if (closed.has(ck)) continue;
    closed.add(ck);
    if (++expansions > maxExpansions) return null;

    if (cur.x === gx && cur.y === gy) {
      const path = [];
      let k = ck;
      let node = cur;
      while (cameFrom.has(k)) {
        path.push([node.x, node.y]);
        node = cameFrom.get(k);
        k = key(node.x, node.y);
      }
      path.reverse();
      return path;
    }

    const g = gScore.get(ck);
    for (const [dx, dy, cost] of NEIGHBORS) {
      const nx = cur.x + dx;
      const ny = cur.y + dy;
      if (!canStep(cur.x, cur.y, nx, ny)) continue;
      const nk = key(nx, ny);
      if (closed.has(nk)) continue;
      const ng = g + cost;
      if (ng < (gScore.get(nk) ?? Infinity)) {
        gScore.set(nk, ng);
        cameFrom.set(nk, cur);
        open.push({ x: nx, y: ny, f: ng + octile(nx, ny, gx, gy) });
      }
    }
  }
  return null;
}
