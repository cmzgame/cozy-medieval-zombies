// The storeys (docs/49 section 6, step 2): what is drawn of each layer and where. Everything on layer L is drawn STOREY * L px up, the
// screen origin lifted that far and every standing vertex that much deeper (gl.setLift), so the depth buffer (docs/51) sorts a lifted
// floor, its walls, its bodies, and a figure on a stair per pixel with no new sort rule. An upper floor's ground is one picture a chunk
// (its laid floors, the void clear), drawn as one quad at its height with depth written, so it hides what is under it. The hiding rule
// (docs/53 section 6.2, ruled 2026-10-30: hide what is in the way, never fade): your own layer and every layer below it down to the ground;
// above yours, the ceiling of the room you stand in and everything over it, and any slab of floor that covers your body on screen, are not
// drawn; a plateau never hides; in a cellar the cellar alone. Client-only: nothing here writes the world.

import * as iso from "../iso.js";
import * as map from "../map.js";
import * as gl from "../gl.js";
import { getSheet } from "../assets.js";
import * as round from "../round.js"; // a laid floor in a ring's square, drawn inside its curve (docs/49 section 5)
import { heightOfWall } from "../visibility.js"; // a wall's height, for what covers a body (docs/53 section 6.2)

const PAD = 48; // px round a chunk's floor picture: a floor frame may reach past its diamond

// Run `fn` with the screen origin `px` up and every standing vertex `px` deeper, and put both back.
export function withLift(px, fn) {
  if (!px) return fn();
  const o = iso.getOrigin();
  const was = gl.getLift();
  iso.setOrigin(o.x, o.y - px);
  gl.setLift(was + px);
  try {
    return fn();
  } finally {
    iso.setOrigin(o.x, o.y);
    gl.setLift(was);
  }
}

// How high a body is drawn: its layer's storey and its rise up a stair.
export function liftOf(body) {
  return ((body && body.layer) || 0) * map.STOREY + ((body && body.rise) || 0);
}

// The layers to draw, lowest first, for a viewer on `layer`: in a cellar that cellar alone (a cellar drawn from the yard would paint over
// it, and from below the ground you see nothing of the ground); else the ground and every layer above it the map holds.
export function layersFor(layer) {
  if (layer < 0) return [layer];
  const out = new Set([0]);
  for (const c of map.loadedChunks()) if (c.layer > 0) out.add(c.layer);
  return [...out].sort((a, b) => a - b);
}

// ---- the cover rule (docs/53 section 6.2, mechanisms 1 and 2) ----
// A slab is a 4-connected run of floored tiles on one storey (the void, a hole, a stairwell, and the earth are none), found from the map
// itself, never authored: a house's upper floor, a wall walk, a balcony, a hill's plateau (a slab with a cliff under its edge or a cliff top's
// floor). Kept per storey until the world changes.
const slabsKept = { key: "", byLayer: new Map() };
const keyOf = (x, y) => (x + 32768) * 65536 + (y + 32768);
const isPlateauFloor = (id) => /^floor_cliff/.test(id || "");
function cliffUnder(x, y, L) {
  const cliff = (w) => !!w && map.wallRule(w.sprite).cliff;
  const t = map.peekTile(x, y, L - 1);
  const s = map.peekTile(x, y + 1, L - 1);
  const e = map.peekTile(x + 1, y, L - 1);
  return !!t && (cliff(t.n) || cliff(t.w)) || !!s && cliff(s.n) || !!e && cliff(e.w);
}
export function slabsOn(L) {
  const key = `${map.worldVersion}:${map.chunkCount()}`;
  if (slabsKept.key !== key) {
    slabsKept.key = key;
    slabsKept.byLayer.clear();
  }
  let got = slabsKept.byLayer.get(L);
  if (got) return got;
  got = { list: [], of: new Map() };
  const floored = (x, y) => {
    const t = map.peekTile(x, y, L);
    return !!t && !map.isEngineFloor(t.floor);
  };
  for (const c of map.loadedChunks()) {
    if (c.layer !== L) continue;
    for (let i = 0; i < c.tiles.length; i++) {
      const x = c.cx * map.CHUNK + (i % map.CHUNK);
      const y = c.cy * map.CHUNK + Math.floor(i / map.CHUNK);
      if (got.of.has(keyOf(x, y)) || !floored(x, y)) continue;
      const slab = { tiles: [], keys: new Set(), rect: null, plateau: false, layer: L };
      const todo = [[x, y]];
      got.of.set(keyOf(x, y), slab);
      let x0 = x;
      let y0 = y;
      let x1 = x;
      let y1 = y;
      while (todo.length) {
        const [a, b] = todo.pop();
        slab.tiles.push([a, b]);
        slab.keys.add(keyOf(a, b));
        if (a < x0) x0 = a;
        if (a > x1) x1 = a;
        if (b < y0) y0 = b;
        if (b > y1) y1 = b;
        if (!slab.plateau && (isPlateauFloor(map.peekTile(a, b, L).floor) || cliffUnder(a, b, L))) slab.plateau = true;
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const k = keyOf(a + dx, b + dy);
          if (got.of.has(k) || !floored(a + dx, b + dy)) continue;
          got.of.set(k, slab);
          todo.push([a + dx, b + dy]);
        }
      }
      slab.rect = [x0, y0, x1 - x0 + 1, y1 - y0 + 1];
      got.list.push(slab);
    }
  }
  slabsKept.byLayer.set(L, got);
  return got;
}

// The tiles of the room (x, y) of layer L is in, or none outdoors: the ceiling of a room is the floored tiles of the storey over these.
const roomKept = { key: "", tiles: null };
function roomTiles(x, y, L) {
  const id = map.roomAt(x, y, L);
  if (!(id > 0)) return null;
  const key = `${map.worldVersion}:${map.chunkCount()}:${L}:${id}`;
  if (roomKept.key === key) return roomKept.tiles;
  const out = [];
  for (const c of map.loadedChunks()) {
    if (c.layer !== L) continue;
    for (let i = 0; i < c.tiles.length; i++) if (c.tiles[i].room === id) out.push([c.cx * map.CHUNK + (i % map.CHUNK), c.cy * map.CHUNK + Math.floor(i / map.CHUNK)]);
  }
  roomKept.key = key;
  roomKept.tiles = out;
  return out;
}

// What the hiding rule hides of every storey over the viewer's, as a set of tile keys a storey: (1) the ceiling of the room the viewer stands
// in and every storey over it, (2) every slab that covers the viewer's body on screen (the box test, `storeyCovers`, tile by tile), a plateau
// never; each with the row and column past its south and east sides, whose tiles hold those sides' walls on their n and w edges. `sig` names
// what is hidden (a floor's picture with its hidden tiles cleared is kept for it).
const hideKept = { key: "", hide: null };
export function hiderFor(viewer) {
  const L = (viewer && viewer.layer) || 0;
  if (!viewer || L < 0) {
    const none = () => false;
    none.sig = "";
    return none;
  }
  const vx = Math.round(viewer.gx);
  const vy = Math.round(viewer.gy);
  const key = `${map.worldVersion}:${map.chunkCount()}:${L}:${Math.round(viewer.gx * 8)},${Math.round(viewer.gy * 8)},${Math.round(viewer.rise || 0)}`;
  if (hideKept.key === key) return hideKept.hide;
  const byLayer = new Map(); // layer -> Set of keys
  const sigs = [];
  const mark = (set, x, y) => set.add(keyOf(x, y)); // the tile alone: the walls and posts on its edges go with it in the drawing (render/walls.js `edgeHidden`), never the tiles past it (the review of #603)
  const setOf = (k) => { let s = byLayer.get(k); if (!s) byLayer.set(k, (s = new Set())); return s; };
  const above = layersFor(L).filter((k) => k > L);
  // (1) The ceiling: the room's tiles with a floor over them, and the whole column over each.
  const room = roomTiles(vx, vy, L);
  if (room && above.length) {
    const ceil = room.filter(([x, y]) => { const t = map.peekTile(x, y, L + 1); return !!t && !map.isEngineFloor(t.floor); });
    if (ceil.length) {
      for (const k of above) { const set = setOf(k); for (const [x, y] of ceil) mark(set, x, y); }
      sigs.push(`room${map.roomAt(vx, vy, L)}:${ceil.length}`);
    }
  }
  // (2) The slabs that cover the body: a slab whose box does not cover it is passed by whole; one that does is asked tile by tile.
  for (const k of above) {
    for (const slab of slabsOn(k).list) {
      if (slab.plateau || !storeyCovers(viewer, slab.rect, k)) continue;
      if (!slab.tiles.some(([x, y]) => storeyCovers(viewer, [x, y, 1, 1], k))) continue;
      const set = setOf(k);
      for (const [x, y] of slab.tiles) mark(set, x, y);
      sigs.push(`${k}:${slab.rect.join(",")}`);
    }
  }
  const hide = (x, y, layer) => layer > L && !!byLayer.get(layer)?.has(keyOf(x, y));
  hide.sig = sigs.join(";");
  hide.layers = new Set(byLayer.keys());
  hideKept.key = key;
  hideKept.hide = hide;
  return hide;
}

// ---- the box test (docs/49 section 6; docs/53 section 6.2 mechanism 2 reads it slab by slab) ----
// "Covering" is the body's screen rectangle against the storey's: the storey is the box over its footprint (to the walls' faces) from its floor
// to its walls' tops (and the caps and posts over them); a body's point is covered when the line from it toward the camera passes through that
// box in front of the body's own front, and the body is covered when any of a grid of points over its rectangle is. On the screen (origin 0) a
// grid point (X, Y) at height Z is at x = (X - Y) HW, y = (X + Y) HH - Z, so the points drawn at one screen point are X + Y = m, X - Y = s,
// Z = m HH - y for every m, nearer the camera the larger m: the box's three slabs each give a range of m, and the body's front is
// m = gx + gy + 2 r (render/depth.js figure). Each client its own player's; nothing on the wire.
const FADE_HALF = 8; // px either side of a body's middle
const FADE_COLS = [-FADE_HALF, 0, FADE_HALF];
const BODY_COLS = [-12, -6, 0, 6, 12]; // the whole figure's width, for a thin wall in front of it (structureCovers)
const FADE_ROWS = [4, 18, 32, 46]; // px over its feet: the legs to the crown (the head's centre is at 38, figure/rig.js)
const FADE_EDGE = 0.15; // tiles a wall's face stands past its footprint's edge line (half the thickest wall)
const FADE_OVER = 12; // px the caps and the posts' tops reach over the storey's 96
const FADE_FRONT = 0.6; // a body's front, gx + gy + 2 r (render/depth.js figure)
export function storeyCovers(body, r, L) {
  if (!body || !r) return false;
  return boxCovers(body, r[0] - 0.5 - FADE_EDGE, r[0] + r[2] - 0.5 + FADE_EDGE, r[1] - 0.5 - FADE_EDGE, r[1] + r[3] - 0.5 + FADE_EDGE, L * map.STOREY, (L + 1) * map.STOREY + FADE_OVER);
}
// Whether the box [X0, X1] by [Y0, Y1] from height Z0 to Z1 covers the body on screen (the grid of points over its rectangle, in front of it).
export function boxCovers(body, X0, X1, Y0, Y1, Z0, Z1, cols = FADE_COLS) {
  const m0 = body.gx + body.gy;
  const s0 = body.gx - body.gy;
  const y0 = m0 * iso.HH - liftOf(body); // the feet on the screen, the origin 0
  for (const dx of cols) {
    const s = s0 + dx / iso.HW;
    for (const z of FADE_ROWS) {
      const y = y0 - z;
      const lo = Math.max(2 * X0 - s, 2 * Y0 + s, (Z0 + y) / iso.HH, m0 + FADE_FRONT);
      const hi = Math.min(2 * X1 - s, 2 * Y1 + s, (Z1 + y) / iso.HH);
      if (lo < hi) return true;
    }
  }
  return false;
}
// Whether something built covers the body on screen (docs/53 section 6.2, mechanism 4: what is seen but covered shows its shape): a wall
// standing in front of it, on its own storey or the one under it (a cliff's face) or on a storey over it, an upper floor in front of it, or a
// plateau's edge, toward the camera; never the near walls of the viewer's own room (`room`, [layer, id]), which are cut to the stub, nor
// anything the viewer's hiding rule hides (`hidden`). A cheap test on the grid; the pass itself draws the shape only where it is covered.
export function structureCovers(body, room = null, hidden = null) {
  const L = (body && body.layer) || 0;
  const bx = Math.round(body.gx);
  const by = Math.round(body.gy);
  const E = FADE_EDGE;
  const nearOfRoom = (k, x, y, edge) => {
    if (!room || room[0] !== k || !(room[1] > 0)) return false;
    const far = edge === "n" ? [x, y - 1] : [x - 1, y];
    return map.roomAt(far[0], far[1], k) === room[1] && map.roomAt(x, y, k) !== room[1];
  };
  const over = layersFor(L).filter((k) => k > L);
  for (const k of [L, L - 1, ...over]) {
    const Z0 = k * map.STOREY;
    const reach = 6 + Math.max(0, k - L) * 4; // a storey up covers a body further behind it on screen
    for (let y = by - 1; y <= by + reach; y++) {
      for (let x = bx - 1; x <= bx + reach; x++) {
        const t = map.peekTile(x, y, k);
        if (!t || (hidden && hidden(x, y, k))) continue;
        if (k > L && !map.isEngineFloor(t.floor) && boxCovers(body, x - 0.5, x + 0.5, y - 0.5, y + 0.5, Z0, Z0 + 4, BODY_COLS)) return true; // an upper floor in front
        for (const edge of ["n", "w"]) {
          const w = t[edge];
          if (!w || map.wallRule(w.sprite).seeThrough || nearOfRoom(k, x, y, edge)) continue;
          const Z1 = Z0 + heightOfWall(w) + FADE_OVER;
          const hit = edge === "n" ? boxCovers(body, x - 0.5 - E, x + 0.5 + E, y - 0.5 - E, y - 0.5 + E, Z0, Z1, BODY_COLS) : boxCovers(body, x - 0.5 - E, x - 0.5 + E, y - 0.5 - E, y + 0.5 + E, Z0, Z1, BODY_COLS); // to the posts at its ends
          if (hit) return true;
        }
      }
    }
  }
  for (const k of [L + 1, L]) {
    if (k <= 0) continue;
    for (const slab of slabsOn(k).list) {
      if (!slab.plateau) continue;
      const [rx, ry, rw, rh] = slab.rect;
      if (rx > bx + 7 || ry > by + 7 || rx + rw < bx - 1 || ry + rh < by - 1) continue;
      for (const [x, y] of slab.tiles) if (x >= bx - 1 && y >= by - 1 && x <= bx + 7 && y <= by + 7 && boxCovers(body, x - 0.5, x + 0.5, y - 0.5, y + 0.5, (k - 1) * map.STOREY, k * map.STOREY + 4, BODY_COLS)) return true;
    }
  }
  return false;
}

// The storey fade is retired (docs/53 section 6.2: "never fade"): a covering storey is hidden by `hiderFor`. Kept as the test that fades
// nothing, for the scene's one call.
export function faderFor() {
  const none = () => false;
  none.sig = "";
  none.any = false;
  none.layers = new Set();
  return none;
}

// Whether `viewer` sees `body` at all by the hiding rule (its bars, bubbles, and name with it): a body on a storey hidden over the viewer's
// building is not drawn, a cellar's body is seen only from that cellar, and from a cellar only its own bodies.
export function shownTo(viewer, body, hide = hiderFor(viewer)) {
  const VL = (viewer && viewer.layer) || 0;
  const L = (body && body.layer) || 0;
  if (VL < 0) return L === VL;
  if (L < 0) return false;
  return !hide(Math.round(body.gx), Math.round(body.gy), L);
}

// The tiles of layer L that a view of the ground's `tiles` shows: a tile L storeys up stands where the ground tile 3 L back along both
// axes is drawn (96 px of lift is three tiles' worth of screen rows).
export function tilesOf(tiles, L) {
  if (!L) return tiles;
  const k = (L * map.STOREY) / (2 * iso.HH);
  return tiles.map(([x, y]) => [x + k, y + k]);
}

// ---- the stairs (docs/49 section 4), dev art until the asks of section 11 are drawn ----
// One staircase (Michael's playtest, 2026-10-27: the three crates did not read as a stair): twelve treads, four a tile, each 8 px over
// the one before as the body's rise climbs (map.stairRise), each a block with its top and its two faces toward the camera (a riser where
// it faces the camera) on their own planes in the depth buffer, and a closed stringer along each side, a board from the floor to a hand
// over the treads' line, in the stair's material: flat shades lit from the top left (art/01).
const STAIR_SHADES = {
  wood: { top: [0.62, 0.47, 0.29, 1], left: [0.47, 0.35, 0.21, 1], right: [0.37, 0.27, 0.16, 1], edge: [0.28, 0.2, 0.12, 1] },
  stone: { top: [0.62, 0.61, 0.58, 1], left: [0.48, 0.47, 0.45, 1], right: [0.39, 0.38, 0.36, 1], edge: [0.3, 0.29, 0.28, 1] },
};
function planeY(c) {
  const p = iso.toScreen(0, c);
  return { A: 1.5, C: c * 32 - 1.5 * p.x + p.y };
}
function planeX(c) {
  const p = iso.toScreen(c, 0);
  return { A: -1.5, C: c * 32 + 1.5 * p.x + p.y };
}
const at = (x, y, up = 0) => { const p = iso.toScreen(x, y); return [p.x, p.y - up]; };
// A block over the grid rectangle [x0, x1] by [y0, y1], `h` px tall: its south-west face (along x at y1), its south-east face (along y at
// x1), and its top, each on its own plane.
function emitBox(x0, y0, x1, y1, h, shade, bias, world) {
  gl.surface(planeY(y1), bias, 1);
  gl.poly([at(x0, y1, h), at(x1, y1, h), at(x1, y1), at(x0, y1)], shade.left, { world, heights: [h, h, 0, 0] });
  gl.surface(planeX(x1), bias, 1);
  gl.poly([at(x1, y1, h), at(x1, y0, h), at(x1, y0), at(x1, y1)], shade.right, { world, heights: [h, h, 0, 0] });
  withLift(h, () => {
    const o = iso.getOrigin();
    gl.surface({ A: 0, B: 2, C: -2 * o.y }, bias + 0.5, 1);
    gl.poly([at(x0, y0), at(x1, y0), at(x1, y1), at(x0, y1)], shade.top, { world, heights: 0 });
  });
}
const STRINGER_UP = 6; // px a stringer's top stands over the treads' line
const STRINGER_DOWN = 14; // and its foot under it
const STRINGER_UNDER = 2; // the near one's top under the nosings
// The `i`th tile of stair `s` (0 to 2): its four treads, and its length of the two stringers.
function emitStairTile(s, i, shade, bias) {
  const [dx, dy] = s.d;
  const px = -dy;
  const py = dx;
  const P = (t, o) => [s.low[0] + dx * t + px * o, s.low[1] + dy * t + py * o];
  const world = s.tiles[i];
  // The treads whose fronts are on this tile: tread k (1 to 12) is 8k px tall over u = (8k - 4) / 32 to (8k + 4) / 32 (the drawn stairs'
  // layout, map.stairRise's), the last one half a tread, flush with the landing.
  for (let k = 1; k <= map.STAIR_TREADS; k++) {
    const u0 = Math.max(0, (8 * k - 4) / 32);
    const u1 = Math.min(3, (8 * k + 4) / 32);
    if (u0 < i || u0 >= i + 1) continue;
    const a = P(u0, -0.5);
    const b = P(u1, 0.5);
    emitBox(Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.max(a[0], b[0]), Math.max(a[1], b[1]), k * 8, shade, bias, world);
  }
  // The stringers, a board on the plane of each side climbing from the floor to the landing: the far one (seen from the camera over the
  // treads) a hand over the line the treads' nosings climb along, the near one just under it, so the treads show stepping over it. The
  // camera's ray climbs 32 px a tile, as a stair does: a near board over the nosings would hide every tread behind it.
  const line = (t) => t * 32;
  for (const o of [-0.5, 0.5]) {
    const A = P(i, o);
    const B = P(i + 1, o);
    const other = P(i, -o);
    const near = dx !== 0 ? A[1] > other[1] : A[0] > other[0];
    const top = (t) => line(t) + (near ? -STRINGER_UNDER : STRINGER_UP);
    const bottom = (t) => Math.max(0, line(t) - STRINGER_DOWN);
    gl.surface(dx !== 0 ? planeY(A[1]) : planeX(A[0]), bias + 0.6, 1);
    gl.poly([at(A[0], A[1], top(i)), at(B[0], B[1], top(i + 1)), at(B[0], B[1], bottom(i + 1)), at(A[0], A[1], bottom(i))], shade.edge, { world, heights: [top(i), top(i + 1), bottom(i + 1), bottom(i)] });
  }
}
// ---- the drawn stairs (art round 8, Michael's approval 2026-10-27: data/sprites/stair_wood.json, stair_stone.json) ----
// One picture a stair, a facing a direction (the engine's `dir`), anchored on the top vertex of its low-end tile at the ground. The picture
// is laid over the stair's own geometry, each part on its own plane in the depth buffer (the furniture's two face planes mis-sort a stair:
// the artist's note): first the whole picture on the plane of its far side, the deepest of it, so a body on the stair is drawn over every
// tread above its own; then each tread's top on its horizontal plane at its height (8k px over u = (8k - 4) / 32 to (8k + 4) / 32 tiles
// along the run), each riser on its vertical plane, and the near side (its stringer and panel, the newel at the foot and the post at the
// head) on the plane of that side, so the near stringer covers the feet of a body on the stair as it stands in front of them.
const SIDE_OVER = 10; // px the near stringer's top stands over the line of the treads' nosings
const NEWEL_H = 30;
const HEAD_POST_H = 114;
function sidePlane(s, o) {
  const A = [s.low[0] + -s.d[1] * o, s.low[1] + s.d[0] * o];
  return s.d[0] !== 0 ? planeY(A[1]) : planeX(A[0]);
}
function runPlane(s, u) {
  const P = [s.low[0] + s.d[0] * u, s.low[1] + s.d[1] * u];
  return s.d[0] !== 0 ? planeX(P[0]) : planeY(P[1]);
}
// Where a stair's picture stands on screen: its frame's top-left, with the frame's size. The sheet's anchors are tile-centre anchors (the loader
// turns the definition's top-vertex anchor, the artist's, into the tile's centre, 16 px lower), so the anchor goes on the centre of the low-end
// tile (the review of #541, Michael's playtest: put on the top vertex, the picture stood half a tile up and across from its tiles, and the
// walkable band ran over its near side).
export function stairPicture(s, sheet, name) {
  const f = sheet.frames[name];
  if (!f) return null;
  const anchor = (sheet.frameAnchors && sheet.frameAnchors[name]) || sheet.anchor;
  const [lx, ly] = s.tiles[0];
  const A = iso.toScreen(lx, ly);
  return { left: Math.round(A.x) - anchor[0], top: Math.round(A.y) - anchor[1], w: f[2], h: f[3] };
}
// A convex polygon clipped to an axis-aligned rectangle (Sutherland-Hodgman): a part laid over the picture never samples past its frame, where
// the atlas holds the next frame (a column of the north-facing picture's outline drew a thin black line beside the west one's head post).
function clipToRect(pts, x0, y0, x1, y1) {
  let out = pts;
  const edges = [[(p) => p[0] >= x0, (a, b) => [x0, a[1] + ((b[1] - a[1]) * (x0 - a[0])) / (b[0] - a[0])]], [(p) => p[0] <= x1, (a, b) => [x1, a[1] + ((b[1] - a[1]) * (x1 - a[0])) / (b[0] - a[0])]], [(p) => p[1] >= y0, (a, b) => [a[0] + ((b[0] - a[0]) * (y0 - a[1])) / (b[1] - a[1]), y0]], [(p) => p[1] <= y1, (a, b) => [a[0] + ((b[0] - a[0]) * (y1 - a[1])) / (b[1] - a[1]), y1]]];
  for (const [inside, cut] of edges) {
    const src = out;
    out = [];
    for (let i = 0; i < src.length; i++) {
      const a = src[i];
      const b = src[(i + 1) % src.length];
      const ia = inside(a);
      const ib = inside(b);
      if (ia) out.push(a);
      if (ia !== ib) out.push(cut(a, b));
    }
    if (out.length < 3) return null;
  }
  return out;
}
// A convex polygon clipped to the half-plane `inside` keeps, cut along the line through a and b.
function clipHalf(pts, inside, a, b) {
  const out = [];
  const cut = (p, q) => {
    const d1 = (b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0]);
    const d2 = (b[0] - a[0]) * (q[1] - a[1]) - (b[1] - a[1]) * (q[0] - a[0]);
    const t = d1 / (d1 - d2);
    return [p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t];
  };
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i];
    const q = pts[(i + 1) % pts.length];
    const ip = inside(p);
    const iq = inside(q);
    if (ip) out.push(p);
    if (ip !== iq) out.push(cut(p, q));
  }
  return out.length >= 3 ? out : null;
}
// ---- the stone ramp (art round 10, Michael's approval 2026-10-28: data/sprites/stair_ramp_stone.json) ----
// A stair whose material's definition has a `ramp` table (map.stairKind): a sloped slab of the cliff's rock, walked at 32 px a tile
// (map.riseOn). Its picture laid as a stair's is: first the whole of it on the plane of its far side; then the slab's top, the run's
// rectangle at 32 px a tile, on its one sloped plane (depth X + Y + Z along the slope, linear on the screen: the three corners' depths
// solved for it); then its near side, the triangle under the slab's near edge, on that side's plane, so it covers the feet of a body
// beside it. The head cut as a stair's.
function slopePlane(pts) {
  // pts: three [gx, gy, z] on the slope: the plane depth = A sx + B sy + C through their screen points and depths.
  const q = pts.map(([gx, gy, z]) => { const p = iso.toScreen(gx, gy); return [p.x, p.y - z, (gx + gy) * 32 + z]; });
  const [[x1, y1, d1], [x2, y2, d2], [x3, y3, d3]] = q;
  const det = (x2 - x1) * (y3 - y1) - (x3 - x1) * (y2 - y1);
  const A = ((d2 - d1) * (y3 - y1) - (d3 - d1) * (y2 - y1)) / det;
  const B = ((x2 - x1) * (d3 - d1) - (x3 - x1) * (d2 - d1)) / det;
  return { A, B, C: d1 - A * x1 - B * y1 };
}
function emitRamp(s, sheet, name, bias) {
  const st = stairParts(s, sheet, name);
  if (!st) return false;
  const { P, quad, opts, nearO, rect } = st;
  const H = map.STOREY;
  gl.surface(sidePlane(s, -nearO), bias, 1);
  quad(rect, opts);
  const top = [P(0, -0.5), P(3, -0.5), P(3, 0.5), P(0, 0.5)];
  const zs = [0, H, H, 0];
  gl.surface(slopePlane([[...top[0], 0], [...top[1], H], [...top[3], 0]]), bias + 0.5, 1);
  quad(top.map(([x, y], i) => at(x, y, zs[i])), { ...opts, heights: zs });
  gl.surface(sidePlane(s, nearO), bias + 0.6, 1);
  quad([at(...P(0, nearO), 0), at(...P(3, nearO), H), at(...P(3, nearO), 0)], opts);
  return true;
}
// What a drawn stair's and a ramp's emit share: the picture's place, the grid along its run, the quad cut to the frame (and at its head where
// something stands beside it), its options, and its near side.
function stairParts(s, sheet, name) {
  const uv = gl.frameUV(sheet, name);
  const pic = stairPicture(s, sheet, name);
  if (!pic || !uv) return null;
  const uvOf = ([X, Y]) => [uv[0] + (X - pic.left), uv[1] + (Y - pic.top)];
  const [dx, dy] = s.d;
  const P = (u, o) => [s.low[0] + dx * u + -dy * o, s.low[1] + dy * u + dx * o];
  const [px, py] = [-dy, dx];
  const beside = (x, y) => [[x + px, y + py], [x - px, y - py]];
  const heads = [s.tiles[2], s.landing];
  const wallBy = heads.some(([x, y]) => beside(x, y).some(([a, b]) => map.wallBetween(x, y, a, b, s.layer)));
  const floorBy = heads.some(([x, y]) => beside(x, y).some(([a, b]) => { const t = map.peekTile(a, b, s.layer + 1); return !!t && !map.isEngineFloor(t.floor); }));
  const cutHead = wallBy || floorBy;
  const H1 = at(...P(3, -1), map.STOREY);
  const H2 = at(...P(3, 1), map.STOREY);
  const side0 = (p) => (H2[0] - H1[0]) * (p[1] - H1[1]) - (H2[1] - H1[1]) * (p[0] - H1[0]);
  const footSide = Math.sign(side0(at(...P(0, 0), 0)));
  const quad = (pts, o) => {
    let q = clipToRect(pts, pic.left, pic.top, pic.left + pic.w, pic.top + pic.h);
    if (q && cutHead) q = clipHalf(q, (p) => side0(p) * footSide >= 0, H1, H2);
    if (q) gl.texQuad(q, q.map(uvOf), o);
  };
  const opts = { world: s.tiles[1], page: uv[4] };
  const nearO = (dx !== 0 ? P(0, 0.5)[1] > P(0, -0.5)[1] : P(0, 0.5)[0] > P(0, -0.5)[0]) ? 0.5 : -0.5;
  const rect = [[pic.left, pic.top], [pic.left + pic.w, pic.top], [pic.left + pic.w, pic.top + pic.h], [pic.left, pic.top + pic.h]];
  return { P, quad, opts, nearO, rect };
}

function emitDrawnStair(s, sheet, name, bias) {
  const uv = gl.frameUV(sheet, name);
  const pic = stairPicture(s, sheet, name);
  if (!pic || !uv) return false;
  const uvOf = ([X, Y]) => [uv[0] + (X - pic.left), uv[1] + (Y - pic.top)];
  const [dx, dy] = s.d;
  const P = (u, o) => [s.low[0] + dx * u + -dy * o, s.low[1] + dy * u + dx * o];
  // The head cut (Michael's playtest, 2026-10-27: the posts at the head stood through the wall built beside the stair and the floor above):
  // nothing of the picture over the landing's floor, the line across the stair's head at 96 px, kept on its foot's side. Only where something
  // stands beside the head for the posts to poke through (the review of #551): a wall beside the top step or the tile under the landing on
  // the stair's layer, or a floor of the storey above beside the stairwell's top or the landing; an open stair keeps its newels whole.
  const [px, py] = [-dy, dx];
  const beside = (x, y) => [[x + px, y + py], [x - px, y - py]];
  const heads = [s.tiles[2], s.landing];
  const wallBy = heads.some(([x, y]) => beside(x, y).some(([a, b]) => map.wallBetween(x, y, a, b, s.layer)));
  const floorBy = heads.some(([x, y]) => beside(x, y).some(([a, b]) => { const t = map.peekTile(a, b, s.layer + 1); return !!t && !map.isEngineFloor(t.floor); }));
  const cutHead = wallBy || floorBy;
  const H1 = at(...P(3, -1), map.STOREY);
  const H2 = at(...P(3, 1), map.STOREY);
  const side0 = (p) => (H2[0] - H1[0]) * (p[1] - H1[1]) - (H2[1] - H1[1]) * (p[0] - H1[0]);
  const footSide = Math.sign(side0(at(...P(0, 0), 0)));
  const quad = (pts, o) => {
    let q = clipToRect(pts, pic.left, pic.top, pic.left + pic.w, pic.top + pic.h);
    if (q && cutHead) q = clipHalf(q, (p) => side0(p) * footSide >= 0, H1, H2);
    if (q) gl.texQuad(q, q.map(uvOf), o);
  };
  const world = s.tiles[1];
  const opts = { world, page: uv[4] };
  const nearO = (dx !== 0 ? P(0, 0.5)[1] > P(0, -0.5)[1] : P(0, 0.5)[0] > P(0, -0.5)[0]) ? 0.5 : -0.5;
  // 1. The whole picture on its far side's plane.
  const { left, top } = pic;
  const rect = [[left, top], [left + pic.w, top], [left + pic.w, top + pic.h], [left, top + pic.h]];
  gl.surface(sidePlane(s, -nearO), bias, 1);
  quad(rect, opts);
  // 2. The treads' tops, each on the horizontal plane at its height, and the risers under their front edges.
  for (let k = 1; k <= map.STAIR_TREADS; k++) {
    const h = k * 8;
    const u0 = Math.max(0, (8 * k - 4) / 32);
    const u1 = Math.min(3, (8 * k + 4) / 32);
    if (dx < 0 || dy < 0) {
      // A riser faces the low end: the camera sees it on a stair climbing away (n, w); toward the camera it is behind its own tread.
      const riser = [P(u0, -0.5), P(u0, 0.5)].map(([x, y]) => at(x, y));
      gl.surface(runPlane(s, u0), bias + 0.25, 1);
      const rq = [[riser[0][0], riser[0][1] - h], [riser[1][0], riser[1][1] - h], [riser[1][0], riser[1][1] - (h - 8)], [riser[0][0], riser[0][1] - (h - 8)]];
      quad(rq, { ...opts, heights: [h, h, h - 8, h - 8] });
    }
    const corners = [P(u0, -0.5), P(u1, -0.5), P(u1, 0.5), P(u0, 0.5)];
    const pts = corners.map(([x, y]) => at(x, y, h));
    withLift(h, () => {
      const o = iso.getOrigin();
      gl.surface({ A: 0, B: 2, C: -2 * o.y }, bias + 0.5, 1);
      quad(pts, opts);
    });
  }
  // 3. The near side: the newel, the stringer and panel under the treads' line, the post at the head.
  gl.surface(sidePlane(s, nearO), bias + 0.6, 1);
  const side = (u, z) => at(...P(u, nearO), z);
  const pieces = [
    [side(-0.25, 0), side(0.3, 0), side(0.3, NEWEL_H), side(-0.25, NEWEL_H)],
    [side(0.3, 0), side(2.7, 0), side(2.7, 2.7 * 32 + SIDE_OVER), side(0.3, 0.3 * 32 + SIDE_OVER)],
    [side(2.7, 0), side(3.25, 0), side(3.25, HEAD_POST_H), side(2.7, HEAD_POST_H)], // the head post and the stringer's last run under it, on the near side's plane (the review of #551)
  ];
  for (const q of pieces) quad(q, opts);
  return true;
}
// The stairs of layer L whose steps are among `tilesL`, as drawables: the drawn stair's picture, one drawable a stair (each of its
// parts on its own plane); the dev art's twelve boxes where a material has no picture.
export function stairDrawables(tilesL, L, bias, out, only = null) {
  const list = map.stairsOn(L);
  if (!list.length) return;
  const inView = new Set(tilesL.map(([x, y]) => `${x},${y}`));
  for (const { s, well } of list) {
    if (well) continue;
    if (only && !only(s)) continue; // a faded storey's stairs, or the rest (by its middle step)
    if (!s.tiles.some(([tx, ty]) => inView.has(`${tx},${ty}`))) continue;
    let sheet = null;
    try { sheet = getSheet(`stair_${s.material || "wood"}`); } catch { sheet = null; }
    const name = `idle_${s.dir}_0`;
    if (sheet && sheet.frames && sheet.frames[name]) {
      const [mx, my] = s.tiles[1];
      const emit = map.stairKind(s.material).ramp ? () => emitRamp(s, sheet, name, bias) : () => emitDrawnStair(s, sheet, name, bias);
      out.push({ key: (mx + my) * 1000 + 0.9, kind: "stair", ramp: map.stairKind(s.material).ramp, vis: true, rect: null, canOcclude: false, occluder: false, emit });
      continue;
    }
    s.tiles.forEach(([tx, ty], i) => {
      if (!inView.has(`${tx},${ty}`)) return;
      const shade = STAIR_SHADES[s.material] || STAIR_SHADES.wood;
      out.push({ key: (tx + ty) * 1000 + 0.9, kind: "stair", vis: true, rect: null, canOcclude: false, occluder: false, emit: () => emitStairTile(s, i, shade, bias) });
    });
  }
}

// ---- an upper floor's picture, per chunk ----

const bakes = new Map(); // chunk key -> { sheet, v }: its picture and the chunk's version it was made at
function frameNamesOf(sheet) {
  if (!sheet._idle) sheet._idle = Object.keys(sheet.frames).filter((k) => k.startsWith("idle_")).sort();
  return sheet._idle.length ? sheet._idle : Object.keys(sheet.frames);
}
function floorSheet(c) {
  const key = map.chunkKey(c.cx, c.cy, c.layer);
  const had = bakes.get(key);
  if (had && had.v === c.lightVersion) return had.sheet;
  const C = map.CHUNK;
  const W = C * iso.TW + PAD * 2;
  const H = C * iso.TH + PAD * 2;
  const canvas = had ? had.sheet.image : document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, W, H);
  for (let ly = 0; ly < C; ly++) {
    for (let lx = 0; lx < C; lx++) {
      const t = c.tiles[ly * C + lx];
      if (!t || map.isEngineFloor(t.floor)) continue; // the void is clear: what is below shows through a stairwell or past a floor's edge
      let sh = null;
      try { sh = getSheet(t.floor); } catch { sh = null; }
      if (!sh) continue;
      const names = frameNamesOf(sh);
      const x = c.cx * C + lx;
      const y = c.cy * C + ly;
      const f = sh.frames[names[Math.floor(map.hash2(x, y, 4049) * names.length)]];
      if (!f) continue;
      const cx = (lx - ly) * iso.HW + C * iso.HW + PAD;
      const cy = (lx + ly) * iso.HH + iso.HH + PAD;
      const r = t.built ? map.ringAt(x, y, c.layer) : null;
      const s = r ? round.shape(r.x0, r.y0, r.n) : null;
      // Only a tile the ring steps over (the curve cuts it); a floor in the ring's square beyond the stepped tiles (the corners) is the walkway's own,
      // laid round the ring, and stays whole (Michael's playtest, 2026-10-29: the floor round a tower on a wall walk was missing its outer corners).
      const clip = s && round.isStepped(r.x0, r.y0, r.n, x, y) && Math.hypot(Math.abs(x - s.cx) + 0.5, Math.abs(y - s.cy) + 0.5) > s.R;
      if (clip) {
        // A floor a player laid where a ring's curve runs over the tile or between it and the stepped walls: inside the curve alone, as on
        // the ground (src/ground.js; the review of #549: on every layer).
        ctx.save();
        ctx.beginPath();
        const ex = (s.cx - c.cx * C - (s.cy - c.cy * C)) * iso.HW + C * iso.HW + PAD;
        const ey = (s.cx - c.cx * C + (s.cy - c.cy * C)) * iso.HH + iso.HH + PAD;
        ctx.ellipse(ex, ey, s.R * iso.HW * Math.SQRT2, s.R * iso.HH * Math.SQRT2, 0, 0, Math.PI * 2);
        ctx.clip();
      }
      ctx.drawImage(sh.image, f[0], f[1], f[2], f[3], cx - sh.anchor[0], cy - sh.anchor[1], f[2], f[3]);
      if (clip) ctx.restore();
    }
  }
  const sheet = had ? had.sheet : { image: canvas, frames: { all: [0, 0, W, H] }, anchor: [0, 0] };
  if (had) gl.redrawSheet(sheet);
  bakes.set(key, { sheet, v: c.lightVersion });
  return sheet;
}

// Forget the pictures (a new world, a restored one): the chunks are new under the old keys.
export function forgetFloors() {
  bakes.clear();
  hiddenBakes.clear();
  fadedBakes.clear();
}
map.onEvict((key) => {
  bakes.delete(key);
  hiddenBakes.delete(key); // the review of #534: kept for every chunk ever hidden, never dropped
  fadedBakes.delete(key);
});

// The floors of layer L under the view, each chunk's one quad at its height: depth written and tested on the floor's own horizontal plane
// (depth = X + Y + the storey, rising two units a screen pixel down), `bias` over the caps of the walls below it, which it meets at their
// top. `hidden` leaves out the tiles of a hidden building, and `faded` those of a faded storey, which emitFadedFloors draws (a chunk
// none of whose tiles either takes is its whole picture).
export function emitFloors(tilesL, L, bias, hidden, faded = null) {
  const out = faded && faded.any ? both(hidden, faded) : hidden;
  eachFloorChunk(tilesL, L, bias, (c) => maskedSheet(c, out, false, hiddenBakes) || floorSheet(c));
}

// A faded storey's floor (docs/49 section 6): each chunk's picture of the faded tiles alone, its quad on the floor's plane as emitFloors'
// (drawn under gl.setFade, so it is laid over what is under it at the fade's alpha and the body behind it shows).
export function emitFadedFloors(tilesF, L, bias, faded) {
  eachFloorChunk(tilesF, L, bias, (c) => maskedSheet(c, faded, true, fadedBakes));
}

function both(a, b) {
  const f = (x, y, l) => a(x, y, l) || b(x, y, l);
  f.sig = `${a.sig || ""}|${b.sig || ""}`;
  return f;
}

function eachFloorChunk(tiles, L, bias, sheetOf) {
  const o = iso.getOrigin();
  gl.surface({ A: 0, B: 2, C: -2 * o.y }, bias, 0.5);
  const seen = new Set();
  for (const [tx, ty] of tiles) {
    const cx = Math.floor(tx / map.CHUNK);
    const cy = Math.floor(ty / map.CHUNK);
    const k = map.chunkKey(cx, cy, L);
    if (seen.has(k)) continue;
    seen.add(k);
    const c = map.getChunk(cx, cy, false, L);
    if (!c) continue;
    const sheet = sheetOf(c);
    if (!sheet) continue;
    const p = iso.toScreen(cx * map.CHUNK, cy * map.CHUNK);
    const x = p.x - map.CHUNK * iso.HW - PAD;
    const y = p.y - iso.HH - PAD;
    const [, , w, h] = sheet.frames.all;
    const corner = (sx, sy) => { const g = iso.toGrid(sx, sy); return [g.gx, g.gy]; };
    gl.quad(x, y, w, h, gl.frameUV(sheet, "all"), { world: [corner(x, y), corner(x + w, y), corner(x + w, y + h), corner(x, y + h)] });
  }
}

// A chunk's picture with the tiles `test` takes cleared (`keep` false: null when it takes none, the whole picture serving), or with every
// tile but those cleared (`keep` true: null when it takes none, nothing to draw), kept per chunk in `store` while the test's `sig` and the
// chunk's version stay the same.
const hiddenBakes = new Map(); // chunk key -> { sheet, v, sig }: the hidden (and faded) tiles cleared
const fadedBakes = new Map(); // chunk key -> { sheet, v, sig }: the faded tiles alone
function maskedSheet(c, test, keep, store) {
  if (!test) return null;
  const C = map.CHUNK;
  let any = false;
  for (let i = 0; i < C * C && !any; i++) if (test(c.cx * C + (i % C), c.cy * C + Math.floor(i / C), c.layer)) any = true;
  if (!any) return null;
  const base = floorSheet(c);
  const key = map.chunkKey(c.cx, c.cy, c.layer);
  const sig = test.sig || "";
  const had = store.get(key);
  if (had && had.v === c.lightVersion && had.sig === sig) return had.sheet;
  const canvas = had ? had.sheet.image : document.createElement("canvas");
  canvas.width = base.image.width;
  canvas.height = base.image.height;
  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(base.image, 0, 0);
  // Clearing: the tiles taken cut out. Keeping: everything but them cut out (the picture drawn in only where their diamonds are).
  ctx.globalCompositeOperation = keep ? "destination-in" : "destination-out";
  ctx.beginPath();
  for (let ly = 0; ly < C; ly++) {
    for (let lx = 0; lx < C; lx++) {
      if (!test(c.cx * C + lx, c.cy * C + ly, c.layer)) continue;
      const cx = (lx - ly) * iso.HW + C * iso.HW + PAD;
      const cy = (lx + ly) * iso.HH + iso.HH + PAD;
      ctx.moveTo(cx, cy - iso.HH - 1);
      ctx.lineTo(cx + iso.HW + 1, cy);
      ctx.lineTo(cx, cy + iso.HH + 1);
      ctx.lineTo(cx - iso.HW - 1, cy);
      ctx.closePath();
    }
  }
  ctx.fill();
  ctx.globalCompositeOperation = "source-over";
  const sheet = had ? had.sheet : { image: canvas, frames: { all: [0, 0, canvas.width, canvas.height] }, anchor: [0, 0] };
  if (had) gl.redrawSheet(sheet);
  store.set(key, { sheet, v: c.lightVersion, sig });
  return sheet;
}
