// Round rooms (docs/50): the geometry of a ring, pure. A ring is a circle inscribed in an N by N square of tiles (N 5 or 7, Michael,
// 2026-10-26: "5 by 5 the smallest"), its square's corner tile (x0, y0). Its world logic is the stepped shape (option A, ruled): the
// tiles whose centres lie inside the circle, walled round on their tile edges, so rooms, paths, sight, light, reach, and bites read
// ordinary edge walls; bodies are stopped by the drawn curve too, as short chords (map.js keeps them as an index on the tiles they
// cross). Everything here is relative to nothing but its arguments: map.js, the renderer, the checks, and the mapgen's mirror
// (tools/mapgen/mapgen.py `round`) agree on it.

export const SIZES = [5, 7];
export const CHORD_DEG = 15; // the curve's pieces for bodies: one chord per 15 degrees (docs/50 section 3, a default)
export const BODY_R = 0.3; // a body's radius against walls (map.js)
export const WAYPOINT = 0.08; // how near a body must come to a waypoint (entities/movement.js)

const shapes = new Map(); // n -> the shape at (0, 0)

// The shape of a ring of size n with its square's corner at (0, 0); `at` moves it.
function base(n) {
  let s = shapes.get(n);
  if (s) return s;
  const k = (n - 1) / 2; // the centre tile's offset from the corner
  const R = n / 2;
  const inside = (x, y) => (x - k) ** 2 + (y - k) ** 2 < R * R;
  const stepped = [];
  const pockets = [];
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) (inside(x, y) ? stepped : pockets).push([x, y]);
  // The outline: every side of a stepped tile whose neighbour is not stepped, as the tile-edge address that side is.
  const outline = [];
  for (const [x, y] of stepped) {
    if (!inside(x, y - 1)) outline.push([x, y, "n"]);
    if (!inside(x, y + 1)) outline.push([x, y + 1, "n"]);
    if (!inside(x - 1, y)) outline.push([x, y, "w"]);
    if (!inside(x + 1, y)) outline.push([x + 1, y, "w"]);
  }
  // The four door points: the middle edge of each side of the square, where the circle touches it (north, east, south, west).
  const doors = [[k, 0, "n"], [n, k, "w"], [k, n, "n"], [0, k, "w"]];
  // The eight tiles the curve crosses inside (no furniture on them, ruled): the ends of the outer rows and columns.
  const crossed = [[k - 1, 0], [k + 1, 0], [k - 1, n - 1], [k + 1, n - 1], [0, k - 1], [0, k + 1], [n - 1, k - 1], [n - 1, k + 1]];
  // The chords, in the square's frame: a chain from each door point's edge end round to the next door point's, never across a doorway
  // (docs/50 section 3: the door edge blocks or passes by itself). Angles from +x toward +y; the door points at 0, 90, 180, 270.
  const cx = k;
  const cy = k;
  const chords = [];
  const ends = [
    [[cx + R, cy + 0.5], [cx + 0.5, cy + R]], // east door's south end to the south door's east end
    [[cx - 0.5, cy + R], [cx - R, cy + 0.5]],
    [[cx - R, cy - 0.5], [cx - 0.5, cy - R]],
    [[cx + 0.5, cy - R], [cx + R, cy - 0.5]],
  ];
  for (let q = 0; q < 4; q++) {
    const pts = [ends[q][0]];
    for (let d = CHORD_DEG; d < 90; d += CHORD_DEG) {
      const a = ((q * 90 + d) * Math.PI) / 180;
      pts.push([cx + R * Math.cos(a), cy + R * Math.sin(a)]);
    }
    pts.push(ends[q][1]);
    for (let i = 0; i + 1 < pts.length; i++) chords.push([pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1]]);
  }
  // Tiles in the square whose centre no body can come within a waypoint's reach of, held off by the curve (docs/50 section 2): marked
  // unreachable on install, so no path, wander, home, or set-down ends there.
  const segD2 = (px, py, [ax, ay, bx, by]) => {
    const vx = bx - ax;
    const vy = by - ay;
    const t = Math.max(0, Math.min(1, ((px - ax) * vx + (py - ay) * vy) / (vx * vx + vy * vy || 1)));
    return (px - ax - vx * t) ** 2 + (py - ay - vy * t) ** 2;
  };
  const reach = BODY_R - WAYPOINT;
  const unreachable = [];
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) if (chords.some((c) => segD2(x, y, c) < reach * reach)) unreachable.push([x, y]);
  s = { n, k, R, stepped, pockets, outline, doors, crossed, chords, unreachable, inside };
  shapes.set(n, s);
  return s;
}

// The ring of size n with its square's corner at (x0, y0): every list in world coordinates, the centre (cx, cy), the radius R. Kept once made
// (the drawing, the index, a torch's face ask it often): callers read it and never change it; the store is dropped past a size, as a
// build's ghost asks it at every square the cursor crosses.
const placed = new Map(); // "x0,y0,n" -> shape
export function shape(x0, y0, n) {
  const key = `${x0},${y0},${n}`;
  let out = placed.get(key);
  if (out) return out;
  if (placed.size > 512) placed.clear();
  const s = base(n);
  const t = ([x, y, e]) => (e ? [x + x0, y + y0, e] : [x + x0, y + y0]);
  out = {
    x0, y0, n, R: s.R, cx: x0 + s.k, cy: y0 + s.k,
    stepped: s.stepped.map(t), pockets: s.pockets.map(t), outline: s.outline.map(t), doors: s.doors.map(t), crossed: s.crossed.map(t),
    unreachable: s.unreachable.map(t),
    chords: s.chords.map(([ax, ay, bx, by]) => [ax + x0, ay + y0, bx + x0, by + y0]),
  };
  placed.set(key, out);
  return out;
}

export function validSize(n) {
  return SIZES.includes(n);
}

// Whether (x, y) is a stepped tile of the ring at (x0, y0, n).
export function isStepped(x0, y0, n, x, y) {
  return x >= x0 && y >= y0 && x < x0 + n && y < y0 + n && base(n).inside(x - x0, y - y0);
}

// Whether an edge (tx, ty, edge) is one of the ring's four door points.
export function isDoorPoint(x0, y0, n, tx, ty, edge) {
  return base(n).doors.some(([x, y, e]) => x + x0 === tx && y + y0 === ty && e === edge);
}

// Whether an edge is on the ring's outline.
export function onOutline(x0, y0, n, tx, ty, edge) {
  return base(n).outline.some(([x, y, e]) => x + x0 === tx && y + y0 === ty && e === edge);
}

// The ring's id, from its square's corner and its layer (two rings never share a square).
export function idOf(x0, y0, layer = 0) {
  return `round_${layer}_${x0}_${y0}`;
}

// The point on the circle in the direction of (gx, gy) from the centre, `off` tiles outward (negative inward): where a thing on the
// ring at that edge stands (a torch's bracket, docs/50 section 3), and the angle it is at.
export function onCurve(r, gx, gy, off = 0) {
  const a = Math.atan2(gy - r.cy, gx - r.cx);
  return { a, gx: r.cx + Math.cos(a) * (r.R + off), gy: r.cy + Math.sin(a) * (r.R + off) };
}
