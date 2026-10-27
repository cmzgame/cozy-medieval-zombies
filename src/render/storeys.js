// The storeys (docs/49 section 6, step 2): what is drawn of each layer and where. Everything on layer L is drawn STOREY * L px up, the
// screen origin lifted that far and every standing vertex that much deeper (gl.setLift), so the depth buffer (docs/51) sorts a lifted
// floor, its walls, its bodies, and a figure on a stair per pixel with no new sort rule. An upper floor's ground is one picture a chunk
// (its laid floors, the void clear), drawn as one quad at its height with depth written, so it hides what is under it. The hiding rule
// (a default): your own layer and every layer below it down to the ground; a layer above yours hidden over the building you stand in
// (the map's building index) and drawn everywhere else; in a cellar the cellar alone. Client-only: nothing here writes the world.

import * as iso from "../iso.js";
import * as map from "../map.js";
import * as gl from "../gl.js";
import { getSheet } from "../assets.js";

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

// The test the hiding rule puts on a tile of a layer above the viewer's: over the building the viewer stands in (by the building index),
// hidden. A viewer in no authored building hides nothing.
export function hiderFor(viewer) {
  const L = (viewer && viewer.layer) || 0;
  const b = viewer ? map.buildingAt(Math.round(viewer.gx), Math.round(viewer.gy), L) : null;
  const hide = (x, y, layer) => {
    if (layer <= L || !b) return false;
    const r = b.rects[layer];
    // Its footprint and the row and column past its south and east sides, whose tiles hold those sides' walls on their n and w edges.
    return !!r && x >= r[0] && y >= r[1] && x <= r[0] + r[2] && y <= r[1] + r[3];
  };
  hide.sig = b ? `${b.id}:${L}` : ""; // what a floor's picture with its hidden tiles cleared is kept for
  return hide;
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
function emitDrawnStair(s, sheet, name, bias) {
  const f = sheet.frames[name];
  const uv = gl.frameUV(sheet, name);
  if (!f || !uv) return false;
  const anchor = (sheet.frameAnchors && sheet.frameAnchors[name]) || sheet.anchor;
  const [lx, ly] = s.tiles[0];
  const A = iso.toScreen(lx - 0.5, ly - 0.5); // the low-end tile's top vertex, at the ground
  const ax = Math.round(A.x);
  const ay = Math.round(A.y);
  const uvOf = ([X, Y]) => [uv[0] + anchor[0] + (X - ax), uv[1] + anchor[1] + (Y - ay)];
  const world = s.tiles[1];
  const opts = { world, page: uv[4] };
  const [dx, dy] = s.d;
  const P = (u, o) => [s.low[0] + dx * u + -dy * o, s.low[1] + dy * u + dx * o];
  const nearO = (dx !== 0 ? P(0, 0.5)[1] > P(0, -0.5)[1] : P(0, 0.5)[0] > P(0, -0.5)[0]) ? 0.5 : -0.5;
  // 1. The whole picture on its far side's plane.
  const left = ax - anchor[0];
  const top = ay - anchor[1];
  const rect = [[left, top], [left + f[2], top], [left + f[2], top + f[3]], [left, top + f[3]]];
  gl.surface(sidePlane(s, -nearO), bias, 1);
  gl.texQuad(rect, rect.map(uvOf), opts);
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
      gl.texQuad(rq, rq.map(uvOf), { ...opts, heights: [h, h, h - 8, h - 8] });
    }
    const corners = [P(u0, -0.5), P(u1, -0.5), P(u1, 0.5), P(u0, 0.5)];
    const pts = corners.map(([x, y]) => at(x, y, h));
    withLift(h, () => {
      const o = iso.getOrigin();
      gl.surface({ A: 0, B: 2, C: -2 * o.y }, bias + 0.5, 1);
      gl.texQuad(pts, pts.map(uvOf), opts);
    });
  }
  // 3. The near side: the newel, the stringer and panel under the treads' line, the post at the head.
  gl.surface(sidePlane(s, nearO), bias + 0.6, 1);
  const side = (u, z) => at(...P(u, nearO), z);
  const pieces = [
    [side(-0.25, 0), side(0.3, 0), side(0.3, NEWEL_H), side(-0.25, NEWEL_H)],
    [side(0.3, 0), side(2.7, 0), side(2.7, 2.7 * 32 + SIDE_OVER), side(0.3, 0.3 * 32 + SIDE_OVER)],
    [side(2.7, 0), side(3.25, 0), side(3.25, HEAD_POST_H), side(2.7, HEAD_POST_H)],
  ];
  for (const q of pieces) gl.texQuad(q, q.map(uvOf), opts);
  return true;
}
// The stairs of layer L whose steps are among `tilesL`, as drawables: the drawn stair's picture, one drawable a stair (each of its
// parts on its own plane); the dev art's twelve boxes where a material has no picture.
export function stairDrawables(tilesL, L, bias, out) {
  const list = map.stairsOn(L);
  if (!list.length) return;
  const inView = new Set(tilesL.map(([x, y]) => `${x},${y}`));
  for (const { s, well } of list) {
    if (well) continue;
    if (!s.tiles.some(([tx, ty]) => inView.has(`${tx},${ty}`))) continue;
    let sheet = null;
    try { sheet = getSheet(`stair_${s.material || "wood"}`); } catch { sheet = null; }
    const name = `idle_${s.dir}_0`;
    if (sheet && sheet.frames && sheet.frames[name]) {
      const [mx, my] = s.tiles[1];
      out.push({ key: (mx + my) * 1000 + 0.9, kind: "stair", vis: true, rect: null, canOcclude: false, occluder: false, emit: () => emitDrawnStair(s, sheet, name, bias) });
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
      ctx.drawImage(sh.image, f[0], f[1], f[2], f[3], cx - sh.anchor[0], cy - sh.anchor[1], f[2], f[3]);
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
}
map.onEvict((key) => {
  bakes.delete(key);
  hiddenBakes.delete(key); // the review of #534: kept for every chunk ever hidden, never dropped
});

// The floors of layer L under the view, each chunk's one quad at its height: depth written and tested on the floor's own horizontal plane
// (depth = X + Y + the storey, rising two units a screen pixel down), `bias` over the caps of the walls below it, which it meets at their
// top. `hidden` leaves out the chunks wholly inside a hidden building (a chunk only partly so is drawn and its hidden tiles cleared).
export function emitFloors(tilesL, L, bias, hidden) {
  const o = iso.getOrigin();
  gl.surface({ A: 0, B: 2, C: -2 * o.y }, bias, 0.5);
  const seen = new Set();
  for (const [tx, ty] of tilesL) {
    const cx = Math.floor(tx / map.CHUNK);
    const cy = Math.floor(ty / map.CHUNK);
    const k = map.chunkKey(cx, cy, L);
    if (seen.has(k)) continue;
    seen.add(k);
    const c = map.getChunk(cx, cy, false, L);
    if (!c) continue;
    const sheet = hiddenSheet(c, hidden) || floorSheet(c);
    const p = iso.toScreen(cx * map.CHUNK, cy * map.CHUNK);
    const x = p.x - map.CHUNK * iso.HW - PAD;
    const y = p.y - iso.HH - PAD;
    const [, , w, h] = sheet.frames.all;
    const corner = (sx, sy) => { const g = iso.toGrid(sx, sy); return [g.gx, g.gy]; };
    gl.quad(x, y, w, h, gl.frameUV(sheet, "all"), { world: [corner(x, y), corner(x + w, y), corner(x + w, y + h), corner(x, y + h)] });
  }
}

// A chunk's picture with the hidden building's tiles cleared, or null when nothing of it is hidden (kept per chunk while the hiding
// stays the same: the viewer's building and the chunk's version).
const hiddenBakes = new Map(); // chunk key -> { sheet, v, sig }
function hiddenSheet(c, hidden) {
  if (!hidden) return null;
  const C = map.CHUNK;
  let any = false;
  for (let i = 0; i < C * C && !any; i++) if (hidden(c.cx * C + (i % C), c.cy * C + Math.floor(i / C), c.layer)) any = true;
  if (!any) return null;
  const base = floorSheet(c);
  const key = map.chunkKey(c.cx, c.cy, c.layer);
  const sig = hidden.sig || "";
  const had = hiddenBakes.get(key);
  if (had && had.v === c.lightVersion && had.sig === sig) return had.sheet;
  const canvas = had ? had.sheet.image : document.createElement("canvas");
  canvas.width = base.image.width;
  canvas.height = base.image.height;
  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(base.image, 0, 0);
  ctx.globalCompositeOperation = "destination-out";
  for (let ly = 0; ly < C; ly++) {
    for (let lx = 0; lx < C; lx++) {
      if (!hidden(c.cx * C + lx, c.cy * C + ly, c.layer)) continue;
      const cx = (lx - ly) * iso.HW + C * iso.HW + PAD;
      const cy = (lx + ly) * iso.HH + iso.HH + PAD;
      ctx.beginPath();
      ctx.moveTo(cx, cy - iso.HH - 1);
      ctx.lineTo(cx + iso.HW + 1, cy);
      ctx.lineTo(cx, cy + iso.HH + 1);
      ctx.lineTo(cx - iso.HW - 1, cy);
      ctx.closePath();
      ctx.fill();
    }
  }
  ctx.globalCompositeOperation = "source-over";
  const sheet = had ? had.sheet : { image: canvas, frames: { all: [0, 0, canvas.width, canvas.height] }, anchor: [0, 0] };
  if (had) gl.redrawSheet(sheet);
  hiddenBakes.set(key, { sheet, v: c.lightVersion, sig });
  return sheet;
}
