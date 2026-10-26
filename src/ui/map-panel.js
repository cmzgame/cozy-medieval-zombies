// The map (docs/33, #204): a panel on the kit with a 2D canvas, opened with M. It draws what the world has seen of itself (chart.js) from the screen's angle,
// so map north is up and to the right, one flat colour a tile, walls as lines on their edges, and a marker for every player in the world. A client view:
// it reads the chart and the replica's players and writes nothing; a guest draws the same from what the host sent. DOM over the world, never drawn into
// the game's canvas. The world keeps running while it is open (only the pause menu stops the game), so no key binds in here: Space stays the shove and
// the Centre button does the centring.

import * as chart from "../chart.js";
import * as iso from "../iso.js";
import { smallFamily } from "./small-text.js";

const CHUNK = 16;
export const ZOOMS = [2, 4, 8]; // pixels of height of a tile's diamond; its width is twice that
const ZOOM_PACE = 150; // ms between wheel steps that count
const FORGET_EVERY = 60; // frames between looks for chunk canvases that were not drawn lately
const PLACE_REVEAL_EVERY = 30; // frames between looks at whether a place has any tile charted yet
const BG = "#14111a";
const SELF = "#f2c14e";
const OTHER = "#ffffff";
// The lines walls are drawn in, by the chart's kind (1 wall, 2 door, 3 window, 4 see-through); a built wall is drawn a shade lighter than an authored one.
const WALL = { 1: [58, 40, 30], 2: [196, 112, 40], 3: [120, 180, 220], 4: [150, 128, 70] };
const BUILT_LIGHTER = 60;

let root = null;
let canvas = null;
let ctx = null;
let open = false;
const view = { zoom: 1, gx: 0, gy: 0, following: true };
const drawn = new Map(); // "cx,cy" -> { canvas, v, h, last }; one not drawn for a while is dropped (a whole explored valley at the close zoom would hold tens of MB)
const revealed = new Set(); // place indexes with a charted tile (the chart never un-charts, so one yes is for good)
let frames = 0;
let drag = null;
let lastWheel = 0;
let rgb = null;
let shownMarkers = []; // what the last frame drew, for the checks: players' dots and place names
let shownLabels = [];

const H = () => ZOOMS[view.zoom];
// The map's own pixels: the same projection as the screen's (iso.toScreen: x = (gx - gy) * w/2, y = (gx + gy) * h/2) with w = 2h.
const mx = (gx, gy) => (gx - gy) * H();
const my = (gx, gy) => (gx + gy) * H() / 2;

export function isOpen() {
  return open;
}

export function initMapPanel() {
  root = document.createElement("div");
  root.id = "map-panel";
  root.className = "kit-frame";
  root.hidden = true;
  root.innerHTML = `<div class="mp-head kit-header"><span class="mp-title">Map</span><button type="button" class="mp-centre" title="Back to you">Centre</button><button type="button" class="mp-x" title="Close (M or Esc)">X</button></div><div class="mp-body"><canvas class="mp-canvas"></canvas></div>`;
  document.getElementById("ui").appendChild(root);
  canvas = root.querySelector("canvas");
  ctx = canvas.getContext("2d");
  root.addEventListener("mousedown", (e) => e.stopPropagation());
  root.addEventListener("contextmenu", (e) => e.preventDefault());
  root.querySelector(".mp-x").addEventListener("click", close);
  root.querySelector(".mp-centre").addEventListener("click", centre);
  canvas.addEventListener("wheel", onWheel, { passive: false });
  canvas.addEventListener("dblclick", centre);
  canvas.addEventListener("mousedown", (e) => {
    if (e.button !== 0) return;
    drag = { x: e.clientX, y: e.clientY };
  });
  window.addEventListener("mousemove", (e) => {
    if (!drag) return;
    if (!(e.buttons & 1)) { drag = null; return; } // the button was let go outside the window: no mouseup came
    const k = scaleOf();
    panBy((e.clientX - drag.x) / k, (e.clientY - drag.y) / k);
    drag = { x: e.clientX, y: e.clientY };
  });
  window.addEventListener("mouseup", () => { drag = null; });
}

// CSS pixels of the screen per canvas pixel (the interface may be scaled).
function scaleOf() {
  const r = canvas.getBoundingClientRect();
  return canvas.width ? r.width / canvas.width || 1 : 1;
}

export function openMap(player) {
  if (!root) return;
  open = true;
  root.hidden = false;
  centre();
  if (player) { view.gx = player.gx; view.gy = player.gy; }
  size();
}

// Returns whether it was open (so Escape knows it was this panel's).
export function close() {
  const was = open;
  open = false;
  drag = null;
  if (root) root.hidden = true;
  return was;
}

export function toggle(player) {
  if (open) close();
  else openMap(player);
}

function centre() {
  view.following = true;
}

function size() {
  const w = Math.max(64, Math.floor(canvas.clientWidth));
  const h = Math.max(64, Math.floor(canvas.clientHeight));
  if (canvas.width !== w) canvas.width = w;
  if (canvas.height !== h) canvas.height = h;
}

// ---- the projection, both ways: grid <-> canvas pixels at the zoom and pan the panel is at ----

export function project(gx, gy) {
  return { x: canvas.width / 2 + mx(gx, gy) - mx(view.gx, view.gy), y: canvas.height / 2 + my(gx, gy) - my(view.gx, view.gy) };
}

export function unproject(px, py) {
  const u = (px - canvas.width / 2 + mx(view.gx, view.gy)) / H(); // gx - gy
  const v = (py - canvas.height / 2 + my(view.gx, view.gy)) / (H() / 2); // gx + gy
  return { gx: (u + v) / 2, gy: (v - u) / 2 };
}

function panBy(dx, dy) {
  // Dragging the picture right moves the centre left: the grid point under the pointer stays under it.
  const u = -dx / H();
  const v = -dy / (H() / 2);
  view.gx += (u + v) / 2;
  view.gy += (v - u) / 2;
  view.following = false;
  clampToChart();
}

const PAN_MARGIN = 8; // tiles of the dark the middle of the panel may go past the charted land

// The middle of the panel stays within the charted land and a margin, so a drag cannot lose the map in the dark (Centre also brings it back).
function clampToChart() {
  const cs = chart.chartedChunks();
  if (!cs.length) return;
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const c of cs) {
    x0 = Math.min(x0, c.cx * CHUNK);
    y0 = Math.min(y0, c.cy * CHUNK);
    x1 = Math.max(x1, c.cx * CHUNK + CHUNK);
    y1 = Math.max(y1, c.cy * CHUNK + CHUNK);
  }
  view.gx = Math.max(x0 - PAN_MARGIN, Math.min(x1 + PAN_MARGIN, view.gx));
  view.gy = Math.max(y0 - PAN_MARGIN, Math.min(y1 + PAN_MARGIN, view.gy));
}

function onWheel(e) {
  e.preventDefault();
  const now = performance.now();
  if (now - lastWheel < ZOOM_PACE) return;
  lastWheel = now;
  zoomBy(e.deltaY < 0 ? 1 : -1, e);
}

// Zoom one step about the pointer: the grid point under it stays there.
export function zoomBy(step, e) {
  const next = Math.max(0, Math.min(ZOOMS.length - 1, view.zoom + step));
  if (next === view.zoom) return false;
  const r = canvas.getBoundingClientRect();
  const k = scaleOf();
  const px = e ? (e.clientX - r.left) / k : canvas.width / 2;
  const py = e ? (e.clientY - r.top) / k : canvas.height / 2;
  const g = unproject(px, py);
  view.zoom = next;
  // Put the centre where this grid point lands under the same pointer.
  const u = g.gx - g.gy;
  const v = g.gx + g.gy;
  const cu = u - (px - canvas.width / 2) / H();
  const cv = v - (py - canvas.height / 2) / (H() / 2);
  view.gx = (cu + cv) / 2;
  view.gy = (cv - cu) / 2;
  if (Math.hypot(px - canvas.width / 2, py - canvas.height / 2) > 3) view.following = false;
  return true;
}

// ---- the chart chunks, each drawn once to a canvas of its own and again only when the chart says it changed ----

function colours() {
  if (rgb) return rgb;
  rgb = chart.paletteOf().map((p) => [parseInt(p.color.slice(1, 3), 16), parseInt(p.color.slice(3, 5), 16), parseInt(p.color.slice(5, 7), 16)]);
  return rgb;
}

function paintChunk(c, h) {
  const w = 2 * h;
  const W = CHUNK * w;
  const Hh = CHUNK * h;
  let entry = drawn.get(`${c.cx},${c.cy}`);
  if (!entry) {
    const cv = document.createElement("canvas");
    entry = { canvas: cv, v: -1, h: 0 };
    drawn.set(`${c.cx},${c.cy}`, entry);
  }
  entry.canvas.width = W;
  entry.canvas.height = Hh;
  const g = entry.canvas.getContext("2d");
  const img = g.createImageData(W, Hh);
  const d = img.data;
  const pal = colours();
  const ox = (CHUNK / 2) * w; // where tile (0, 0)'s centre sits in this canvas
  const oy = h / 2;
  for (let py = 0; py < Hh; py++) {
    for (let px = 0; px < W; px++) {
      const a = (px + 0.5 - ox) / (w / 2); // lx - ly
      const b = (py + 0.5 - oy) / (h / 2); // lx + ly
      const lx = Math.floor((a + b) / 2 + 0.5);
      const ly = Math.floor((b - a) / 2 + 0.5);
      if (lx < 0 || lx >= CHUNK || ly < 0 || ly >= CHUNK) continue;
      const s = chart.surfaceOfCell(c.cells[ly * CHUNK + lx]);
      const col = s && pal[s - 1];
      if (!col) continue;
      const o = (py * W + px) * 4;
      d[o] = col[0]; d[o + 1] = col[1]; d[o + 2] = col[2]; d[o + 3] = 255;
    }
  }
  const put = (X, Y, kind) => {
    const px = Math.floor(X);
    const py = Math.floor(Y);
    if (px < 0 || px >= W || py < 0 || py >= Hh) return;
    const base = WALL[kind & 7];
    if (!base) return;
    const lift = kind & 8 ? BUILT_LIGHTER : 0;
    const o = (py * W + px) * 4;
    d[o] = Math.min(255, base[0] + lift); d[o + 1] = Math.min(255, base[1] + lift); d[o + 2] = Math.min(255, base[2] + lift); d[o + 3] = 255;
  };
  for (let ly = 0; ly < CHUNK; ly++) {
    for (let lx = 0; lx < CHUNK; lx++) {
      const cell = c.cells[ly * CHUNK + lx];
      const n = chart.northWall(cell);
      const wl = chart.westWall(cell);
      if (!n && !wl) continue;
      for (let i = 0; i <= w * 2; i++) {
        const t = i / (w * 2);
        // `n` is the tile's north edge (gy - 0.5, along gx): the diamond's up-right side; `w` its west edge (gx - 0.5, along gy): the up-left side.
        if (n) { const gx = lx - 0.5 + t; const gy = ly - 0.5; put(ox + (gx - gy) * (w / 2), oy + (gx + gy) * (h / 2), n); }
        if (wl) { const gx = lx - 0.5; const gy = ly - 0.5 + t; put(ox + (gx - gy) * (w / 2), oy + (gx + gy) * (h / 2), wl); }
      }
    }
  }
  g.putImageData(img, 0, 0);
  entry.v = c.v;
  entry.h = h;
  return entry;
}

// ---- the frame ----

function arrowOf(facing) {
  const i = iso.FACINGS.indexOf(facing);
  if (i < 0) return null;
  const a = (i * Math.PI) / 4; // clockwise from screen-right, y down
  return { x: Math.cos(a), y: Math.sin(a) };
}

// Your marker's shape: a disc of radius `r` with a point `tip` pixels from its centre toward `f` (a unit screen vector), the disc's edge
// meeting the point along its two tangents, so the back is round and the point sharp.
export const POINTER = { r: 6, tip: 15 };
function pointerPath(x, y, f, r, tip) {
  const a = Math.atan2(f.y, f.x);
  const t = Math.acos(Math.min(1, r / tip)); // the tangent points' angle either side of the facing
  ctx.beginPath();
  ctx.moveTo(x + f.x * tip, y + f.y * tip);
  ctx.arc(x, y, r, a + t, a - t + Math.PI * 2); // round the back, the long way
  ctx.closePath();
}

function text(s, x, y, color = "#fff") {
  ctx.fillStyle = "#000";
  ctx.fillText(s, x + 1, y + 1);
  ctx.fillStyle = color;
  ctx.fillText(s, x, y);
}

// `state`: { player, players, places } (the replica's own). Called every frame while open.
export function update(state) {
  if (!open || !root) return;
  size();
  frames++;
  const { player, players = [], places = [] } = state;
  if (view.following && player) { view.gx = player.gx; view.gy = player.gy; }
  const W = canvas.width;
  const Hh = canvas.height;
  ctx.imageSmoothingEnabled = false;
  ctx.fillStyle = BG;
  ctx.fillRect(0, 0, W, Hh);
  const h = H();
  const w = 2 * h;
  const cx0 = mx(view.gx, view.gy);
  const cy0 = my(view.gx, view.gy);
  for (const c of chart.chartedChunks()) {
    // Where this chunk's canvas goes: its tile (0, 0)'s centre, less the canvas's own offset to it.
    const left = Math.round(W / 2 + mx(c.cx * CHUNK, c.cy * CHUNK) - cx0 - (CHUNK / 2) * w);
    const top = Math.round(Hh / 2 + my(c.cx * CHUNK, c.cy * CHUNK) - cy0 - h / 2);
    if (left > W || top > Hh || left + CHUNK * w < 0 || top + CHUNK * h < 0) continue;
    let e = drawn.get(`${c.cx},${c.cy}`);
    if (!e || e.v !== c.v || e.h !== h) e = paintChunk(c, h);
    e.last = frames;
    ctx.drawImage(e.canvas, left, top);
  }
  if (frames % FORGET_EVERY === 0) for (const [k, e] of drawn) if (frames - (e.last ?? 0) > FORGET_EVERY) drawn.delete(k);
  ctx.font = `11px ${smallFamily()}`; // the place names are small text (ui/small-text.js)
  ctx.textBaseline = "middle";
  ctx.textAlign = "center";
  // A place's name, once any of its tiles is charted; one that would sit on another's is left out.
  if (frames % PLACE_REVEAL_EVERY === 1) {
    places.forEach((p, i) => {
      if (revealed.has(i)) return;
      const [x0, y0, bw, bh] = p.box;
      for (let y = y0; y < y0 + bh && !revealed.has(i); y++) for (let x = x0; x < x0 + bw; x++) if (chart.surfaceOfCell(chart.cellAt(x, y))) { revealed.add(i); break; }
    });
  }
  const placed = [];
  shownLabels = [];
  shownMarkers = [];
  const order = places.map((p, i) => i).filter((i) => revealed.has(i)).sort((a, b) => places[b].box[2] * places[b].box[3] - places[a].box[2] * places[a].box[3]);
  for (const i of order) {
    const p = places[i];
    const at = project(p.box[0] + p.box[2] / 2 - 0.5, p.box[1] + p.box[3] / 2 - 0.5);
    const tw = ctx.measureText(p.name).width + 4;
    const r = [at.x - tw / 2, at.y - 7, tw, 14];
    if (r[0] < 0 || r[0] + r[2] > W || r[1] < 0 || r[1] + r[3] > Hh) continue; // a name cut by the edge of the panel is left out
    if (placed.some((q) => r[0] < q[0] + q[2] && q[0] < r[0] + r[2] && r[1] < q[1] + q[3] && q[1] < r[1] + r[3])) continue;
    placed.push(r);
    shownLabels.push(p.name);
    text(p.name, Math.round(at.x), Math.round(at.y), "#e8dcc0");
  }
  // The players, wherever they are on the map: a dot at their exact position and their name beside it; yours is gold with an arrow for your facing.
  for (const p of players) {
    if (p.dead || p.corpse) continue;
    const m = project(p.gx, p.gy);
    if (m.x < -20 || m.y < -20 || m.x > W + 20 || m.y > Hh + 20) continue;
    const self = p === player;
    const f = self ? arrowOf(p.facing) : null;
    shownMarkers.push({ id: p.id, self, x: m.x, y: m.y, shape: f ? "pointer" : "dot" });
    if (f) {
      // Yours: a pointer with a round back (Michael's playtest, 2026-10-26), a disc at your position with its point toward your facing,
      // so it turns with the mouse as the character does; outlined dark, larger than the others' dots.
      pointerPath(m.x, m.y, f, POINTER.r + 1.5, POINTER.tip + 2);
      ctx.fillStyle = "#000";
      ctx.fill();
      pointerPath(m.x, m.y, f, POINTER.r, POINTER.tip);
      ctx.fillStyle = SELF;
      ctx.fill();
    } else {
      ctx.fillStyle = "#000";
      ctx.beginPath();
      ctx.arc(m.x, m.y, 4.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = self ? SELF : OTHER;
      ctx.beginPath();
      ctx.arc(m.x, m.y, 3.2, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.textAlign = "left";
    text(p.name || p.id, Math.round(m.x + (f ? 12 : 8)), Math.round(m.y - (f ? 12 : 8)), self ? SELF : OTHER);
    ctx.textAlign = "center";
  }
  // The compass: north is up and to the right, never a guess.
  const n = iso.gridDirToScreen(0, -1);
  const len = Math.hypot(n.sx, n.sy) || 1;
  const dir = { x: n.sx / len, y: n.sy / len };
  const c0 = { x: W - 34, y: 40 };
  ctx.strokeStyle = "#000";
  ctx.lineWidth = 4;
  ctx.beginPath(); ctx.moveTo(c0.x - dir.x * 14, c0.y - dir.y * 14); ctx.lineTo(c0.x + dir.x * 14, c0.y + dir.y * 14); ctx.stroke();
  ctx.strokeStyle = "#fff";
  ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(c0.x - dir.x * 14, c0.y - dir.y * 14); ctx.lineTo(c0.x + dir.x * 14, c0.y + dir.y * 14); ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(c0.x + dir.x * 14, c0.y + dir.y * 14);
  ctx.lineTo(c0.x + dir.x * 6 - dir.y * 5, c0.y + dir.y * 6 + dir.x * 5);
  ctx.lineTo(c0.x + dir.x * 6 + dir.y * 5, c0.y + dir.y * 6 - dir.x * 5);
  ctx.closePath();
  ctx.fillStyle = "#fff";
  ctx.fill();
  text("N", Math.round(c0.x + dir.x * 22), Math.round(c0.y + dir.y * 22));
}

// For the checks: what the last frame drew.
export const markers = () => shownMarkers.slice();
export const labels = () => shownLabels.slice();

// For the checks: the state of the view.
export function viewState() {
  return { ...view, h: H(), width: canvas ? canvas.width : 0, height: canvas ? canvas.height : 0 };
}

export function forgetDrawn() {
  drawn.clear();
  revealed.clear();
  frames = 0; // the next frame looks at the places again
}

// Put the middle of the panel on a grid point and stop following the player (for the checks, and for whatever later wants to show a place).
export function centreOn(gx, gy) {
  view.gx = gx;
  view.gy = gy;
  view.following = false;
}
