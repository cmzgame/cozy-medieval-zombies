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
// Three blocks climbing a crate each, in the stair's material: each step its top at its height (32 px a step) and its two faces toward the
// camera, flat shades lit from the top left (art/01), every face on its own plane in the depth buffer.
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
function emitStep(tx, ty, h, shade, bias) {
  // The block's corners on the ground, and at its top `h` px up: north (top), east (right), south (bottom), west (left) of its diamond.
  const at = (x, y, up = 0) => { const p = iso.toScreen(x, y); return [p.x, p.y - up]; };
  const N = [tx - 0.5, ty - 0.5];
  const E = [tx + 0.5, ty - 0.5];
  const S = [tx + 0.5, ty + 0.5];
  const Wp = [tx - 0.5, ty + 0.5];
  const world = [tx, ty];
  // The south-west face (along x at y = ty + 0.5), then the south-east (along y at x = tx + 0.5), then the top.
  gl.surface(planeY(ty + 0.5), bias, 1);
  gl.poly([at(...Wp, h), at(...S, h), at(...S), at(...Wp)], shade.left, { world, heights: [h, h, 0, 0] });
  gl.surface(planeX(tx + 0.5), bias, 1);
  gl.poly([at(...S, h), at(...E, h), at(...E), at(...S)], shade.right, { world, heights: [h, h, 0, 0] });
  withLift(h, () => {
    const o = iso.getOrigin();
    gl.surface({ A: 0, B: 2, C: -2 * o.y }, bias + 0.5, 1);
    gl.poly([at(...N), at(...E), at(...S), at(...Wp)], shade.top, { world, heights: 0 });
  });
}
// The stairs of layer L whose steps are among `tilesL`, as drawables.
export function stairDrawables(tilesL, L, bias, out) {
  const list = map.stairsOn(L);
  if (!list.length) return;
  const inView = new Set(tilesL.map(([x, y]) => `${x},${y}`));
  for (const { s, well } of list) {
    if (well) continue;
    s.tiles.forEach(([tx, ty], k) => {
      if (!inView.has(`${tx},${ty}`)) return;
      const shade = STAIR_SHADES[s.material] || STAIR_SHADES.wood;
      out.push({ key: (tx + ty) * 1000 + 0.9, kind: "stair", vis: true, rect: null, canOcclude: false, occluder: false, emit: () => emitStep(tx, ty, (k + 1) * 32, shade, bias) });
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
}
map.onEvict((key) => bakes.delete(key));

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
