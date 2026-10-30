// Walls (docs/09, 17): the frame for a wall's state, plank leaves and shutters, the drawn walls with their caps
// redrawn on the sky, posts, the cut walls near the player, and the wall drawables.
// Cut from src/render.js on 2026-10-12 (docs/23a, D5): a move, no rule changed; the frame check proves the pixels.

import * as iso from "../iso.js";
import * as loop from "../loop.js";
import { getSheet, getDef, idleFrame } from "../assets.js";
import { shade } from "../render-util.js";
import * as map from "../map.js";
import { tileKey } from "../visibility.js";
import { WALL_T, WOOD, METAL, DOOR_TOP, WINDOW_SILL, WINDOW_TOP, BRACKET_UP } from "../placeholders.js";
import * as gl from "../gl.js";
import { GHOST_FLAGS, ghostColor } from "./props.js";
import { NEAR_WALL_ALPHA, DEPTH_BIAS, DEPTH_ROOM, flameFrame, frameQuad } from "./scene.js";
import * as depth from "./depth.js"; // the walls' faces, caps, leaves, and posts on their true planes (docs/51)
import { emitHangings } from "./paintings.js"; // what hangs on a wall's face (#326)
import { sheetFor } from "../woods.js"; // a door or window of another wood than its wall (#334)
import * as cliffs from "../cliffs.js"; // a cliff's pictures by its edges and its plateau (art round 10)
import * as battlements from "../battlements.js"; // a castle battlement's pictures by the floors and the neighbouring edges (art round 13)
import * as round from "../round.js"; // a ring's outline vertices, where a straight wall's filler runs to the curve (docs/50 section 3)

// ---- walls ----

// A wall's layers on its depth surface (gl.layer, docs/51 section 3): its face (a cut wall's pieces side by side); its cap redrawn on the
// sky and what is on its face (boards, a leaf or shutters, a bracket and a lantern's cage and pane), which never overlap one another;
// what sits over those (a painting, a plank leaf's strips, a torch on its bracket); and a flame. Four steps whatever the wall carries,
// so at 16 bits (a quarter of a unit a step) its last stays under a prop held on its face, a unit over it (scene.js DEPTH_ROOM).
const L_FACE = 0;
const L_ON = 1;
const L_OVER = 2;
const L_FLAME = 3;

// The frame for a wall's state. Boards on the visible (near) face draw as the
// boarded variants; boards on the far face are not seen, and a broken leaf is
// the open frame with nothing in it (docs/09).
function wallVariant(wall) {
  const n = wall.boards.near.length;
  if (wall.gate) return "gate"; // a castle gate's frame is the same shut or open; its portcullis is the leaf (emitGateLeaf)
  if (wall.kind === "door") {
    const shut = !wall.open && !wall.broken;
    if (n) return `${shut ? "door_shut_boarded" : "door_boarded"}${n}`;
    return shut ? "door_shut" : "door";
  }
  if (wall.kind === "window") {
    const shut = wall.shutter === "closed" && !wall.broken;
    if (n) return `${shut ? "window_shut_boarded" : "boarded"}${n}`;
    return shut ? "window_shut" : "window";
  }
  return "plain";
}


// A plank leaf in the quad [p0, p1, p2, p3] (p0 and p3 the bottom corners),
// with metal strips, as flat polygons.
function emitPlankLeaf(quad, strips, shadeF, opts) {
  const [p0, p1, p2, p3] = quad;
  const lerp = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
  gl.layer(L_ON);
  gl.poly(quad, gl.rgb(shade(WOOD, shadeF), opts.alpha), opts);
  gl.layer(L_OVER);
  const bands = strips === 1 ? [0.5] : [0.3, 0.7];
  for (const t of bands) {
    const a = lerp(p0, p1, t);
    const b = lerp(p3, p2, t);
    gl.poly([[a[0], a[1] - 1.5], [b[0], b[1] - 1.5], [b[0], b[1] + 1.5], [a[0], a[1] + 1.5]], gl.rgb(METAL, opts.alpha), opts);
  }
}

// Open doors and shutters swing out on the outside of the wall at the jambs
// (Michael, 2026-10-09: "history be damned"). A door stands perpendicular to
// the wall. Shutters fold back nearly flat against the outside wall, about 160
// degrees, as cottage shutters do (Michael, 2026-10-11), each away from the
// window's middle, a little off the wall.
const SHUTTER_FOLD = (160 * Math.PI) / 180;
function emitSwungLeaves(wall, edge, x, y, h, outside, opts) {
  const a = edge === "n" ? [x, y - iso.HH] : [x - iso.HW, y];
  const b = edge === "n" ? [x + iso.HW, y] : [x, y - iso.HH];
  const lerp = (t, up) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t - up];
  const perp = edge === "n" ? [-iso.HW, iso.HH] : [iso.HW, iso.HH];
  const along = [b[0] - a[0], b[1] - a[1]]; // the whole edge, one tile long, like perp
  const isDoor = wall.kind === "door";
  // Fixed heights from the floor, as the wall art's openings (placeholders.js).
  const y0 = isDoor ? 0 : Math.min(WINDOW_SILL, h * 0.35);
  const y1 = Math.min(isDoor ? DOOR_TOP + 1 : WINDOW_TOP, h - 4);
  if (isDoor) {
    const len = 0.55;
    const v = [perp[0] * len * outside, perp[1] * len * outside];
    const p0 = lerp(0.18, y0);
    const p1 = lerp(0.18, y1);
    // The leaf stands square to the wall through its hinge, 0.18 of the edge from its far end (docs/51 section 3), then the wall's face again.
    if (opts.face) gl.setPlane(edge === "n" ? depth.planeX(opts.tx - 0.32) : depth.planeY(opts.ty + 0.32));
    emitPlankLeaf([p0, p1, [p1[0] + v[0], p1[1] + v[1]], [p0[0] + v[0], p0[1] + v[1]]], 2, outside > 0 ? 0.95 : 0.7, opts);
    if (opts.face) gl.setPlane(opts.face);
    return;
  }
  // Each shutter is a quarter of the edge wide, hinged at its jamb, and turned
  // SHUTTER_FOLD from closed (where it pointed at the window's middle).
  const len = 0.25;
  const back = -Math.cos(SHUTTER_FOLD) * len; // along the wall, away from the middle
  const off = Math.sin(SHUTTER_FOLD) * len; // out from the wall
  for (const [t, away] of [[0.25, -1], [0.75, 1]]) {
    const v = [along[0] * back * away + perp[0] * off * outside, along[1] * back * away + perp[1] * off * outside];
    const p0 = lerp(t, y0);
    const p1 = lerp(t, y1);
    emitPlankLeaf([p0, p1, [p1[0] + v[0], p1[1] + v[1]], [p0[0] + v[0], p0[1] + v[1]]], 1, outside > 0 ? 0.9 : 0.7, opts);
  }
}

// ---- drawn walls (docs/17) ----

// The engine's opening states, mapped onto the art's five variants and a board count.
function drawnVariant(variant) {
  const m = variant.match(/^(.*?)(\d)?$/);
  const base = m[1];
  const n = m[2] ? Number(m[2]) : 0;
  const art = {
    plain: "plain", door: "door_open", door_shut: "door_shut", window: "window_open", window_broken: "window_open",
    window_shut: "window_shut", boarded: "window_open", window_shut_boarded: "window_shut",
    door_boarded: "door_open", door_shut_boarded: "door_shut",
  }[base] || "plain";
  return { art, boards: n ? (base.startsWith("door") ? "door" : "window") : null, n: Math.min(3, n) };
}

// A frame of a sheet drawn at the tile centre (x, y) by its own anchor, lit
// along the wall's foot (`wa` to `wb`) and climbing its height.
const CAP_MARGIN = 1; // ground px the sky-lit cap redraw reaches past the cap's exact edges

function wallPartQuad(sheet, name, x, y, o) {
  const f = sheet && sheet.frames[name];
  if (!f) return;
  const a = (sheet.frameAnchors && sheet.frameAnchors[name]) || sheet.anchor;
  gl.quad(x - a[0], y - a[1], f[2], f[3], gl.frameUV(sheet, name), { world: [o.wa, o.wb, o.wb, o.wa], heights: [f[3], f[3], 0, 0], color: o.tint, flags: o.flags });
}

// A convex polygon clipped to the side of the line through a and b that `keep` lies on.
function clipBelow(pts, a, b, keep) {
  const side = (p) => (b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0]);
  const k = Math.sign(side(keep));
  const out = [];
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i];
    const q = pts[(i + 1) % pts.length];
    const sp = side(p) * k;
    const sq = side(q) * k;
    if (sp >= 0) out.push(p);
    if ((sp >= 0) !== (sq >= 0)) {
      const t = sp / (sp - sq);
      out.push([p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t]);
    }
  }
  return out.length >= 3 ? out : null;
}
// A part of a picture drawn without what stands over the line through a and b (its top: a wall's or a post's cap under a floor of the storey
// above, the review of #551): the frame's rectangle cut along the line, on the face's own plane, its light read as the whole quad's.
function partBelow(sheet, name, x, y, o, a, b) {
  const f = sheet && sheet.frames[name];
  if (!f) return;
  const an = (sheet.frameAnchors && sheet.frameAnchors[name]) || sheet.anchor;
  const L = x - an[0];
  const T = y - an[1];
  const q = clipBelow([[L, T], [L + f[2], T], [L + f[2], T + f[3]], [L, T + f[3]]], a, b, [L + f[2] / 2, T + f[3] + 1000]);
  if (!q) return;
  const uv = gl.frameUV(sheet, name);
  const world = q.map(([px]) => {
    const k = Math.max(0, Math.min(1, (px - L) / f[2]));
    return [o.wa[0] + (o.wb[0] - o.wa[0]) * k, o.wa[1] + (o.wb[1] - o.wa[1]) * k];
  });
  gl.texQuad(q, q.map(([px, py]) => [uv[0] + (px - L), uv[1] + (py - T)]), { world, heights: q.map(([, py]) => Math.max(0, T + f[3] - py)), color: o.tint, flags: o.flags, page: uv[4] });
}

// The cap of a drawn wall, drawn again from the same picture with the sky's
// light, so it is not lit by the room its face looks into (docs/17, ruling 3).
// The cap is the wall's top, the edge pushed half the thickness either side,
// at the wall's height; `top` is the screen point of the tile's top vertex.
function emitCapFromFrame(sheet, name, anchor, top, corners, h, world, flags) {
  const uv = gl.frameUV(sheet, name);
  const tu = uv[0] + anchor[0];
  const tv = uv[1] + anchor[1] - iso.HH; // the top vertex in the frame (anchors are tile-centre)
  const pts = [];
  const uvs = [];
  for (const [X, Y] of corners) {
    const ox = X - Y;
    const oy = (X + Y) / 2 - h;
    pts.push([top[0] + ox, top[1] + oy]);
    uvs.push([tu + ox, tv + oy]);
  }
  gl.texQuad(pts, uvs, { world, flags: flags | gl.FLAG_SKY, page: uv[4] });
}

// A gate that swings (#332, Michael, 2026-10-20: "only fence for now, we can animate doors later"): a door whose parts sheet has
// the in-between leaves (`leaf_<o>_30`, `leaf_<o>_60`) plays them for SWING_S when it opens or shuts. Each screen plays it when it
// sees the gate's `open` change (the host's step, a guest's chunk), in sim time, so it is the picture's alone: never the world's,
// never sent, never saved. A gate first seen is drawn as it stands.
const SWING_S = 0.24;
const swings = new Map(); // "tx,ty,edge" -> { open, at }
function swingLeaf(wall, edge, tx, ty, side, parts, open) {
  if (wall.kind !== "door" || !parts || !parts.frames[`leaf_${side}_30`]) return null;
  const k = `${tx},${ty},${edge}`;
  const now = loop.simTime();
  let s = swings.get(k);
  if (!s) swings.set(k, (s = { open, at: -Infinity }));
  else if (s.open !== open) {
    s.open = open;
    s.at = now;
  }
  const t = (now - s.at) / SWING_S;
  if (!(t >= 0 && t < 1)) return null;
  const step = t < 0.5 ? 0 : 1; // opening: 30 then 60; shutting: 60 then 30
  return `leaf_${side}_${open ? (step ? "60" : "30") : (step ? "30" : "60")}`;
}

// ---- castle gates (docs/02, 2026-10-29; the art of round 12) ----
// A gate is one wall object on each of its 2 or 3 edges (map.js, `wall.gate = { i }`), and its picture is one frame as wide as the run. Each edge
// draws its own 49 by 121 window of that frame, the very rectangle a plain stone wall's picture is on that edge (the frame is those segments side
// by side with the arch carved out), so everything that is per segment stays per segment: its depth plane and ridge, its cap redrawn on the sky,
// the fade of a near wall and its cuts, the cut under a floor, the sort. The window is a derived sheet that shares the whole sheet's place in the
// atlas (`sliceOf`, gl.frameUV); the portcullis leaf is cut the same way, into the columns each edge owns.
const slices = new WeakMap(); // a sheet -> "name:x:y:w:h" -> its derived sheet

// A derived sheet whose frame `name` is the rectangle [wx, wy, ww, wh] of the sheet's frame (in its picture's pixels), anchored at [ax, ay] (centre anchors).
function subSheet(sheet, name, wx, wy, ww, wh, ax, ay) {
  let m = slices.get(sheet);
  if (!m) slices.set(sheet, (m = new Map()));
  const key = `${name}:${wx}:${wy}:${ww}:${wh}:${ax}:${ay}`;
  let d = m.get(key);
  if (!d) {
    const f = sheet.frames[name];
    d = Object.create(sheet);
    d.sliceOf = sheet.sliceOf || sheet;
    d.frames = { [name]: [f[0] + wx, f[1] + wy, ww, wh] };
    d.frameAnchors = { [name]: [ax, ay] };
    m.set(key, d);
  }
  return d;
}

// The window of a gate's frame that edge `k` of its run draws: the same rectangle and anchor as a plain wall of its run on that edge.
function gateSlice(sheet, side, k) {
  const name = `${side}_gate`;
  const f = sheet.frames[name];
  if (!f) return null;
  const run = getSheet(sheet.wall.run || "wall_stone");
  const pn = `${side}_plain`;
  const pf = run.frames[pn];
  const pa = (run.frameAnchors && run.frameAnchors[pn]) || run.anchor;
  const ga = (sheet.frameAnchors && sheet.frameAnchors[name]) || sheet.anchor;
  const wx = ga[0] + (side === "north" ? 32 * k : -32 * k) - pa[0];
  const wy = ga[1] + 16 * k - pa[1];
  if (wx < 0 || wy < 0 || wx + pf[2] > f[2] || wy + pf[3] > f[3]) return null; // a picture that does not hold the run's window: nothing drawn rather than garbage
  return subSheet(sheet, name, wx, wy, pf[2], pf[3], pa[0], pa[1]);
}

// A gate's portcullis frame by its state, shown the same on every edge: closed (down), raised (up), and the one in-between frame all through a
// swing (rising or falling, `wall.gate.swing` seconds, in sim time, each screen's own picture: never the world's, never sent, never saved).
const gateSwings = new Map(); // "layer:x,y,edge" of the first edge -> { open, at }
function gateLeafState(wall, edge, tx, ty) {
  const [sx, sy] = map.gateStart(tx, ty, edge, wall);
  const k = `${map.drawLayerNow()}:${sx},${sy},${edge}`;
  const open = !!wall.open;
  const now = loop.simTime();
  let s = gateSwings.get(k);
  if (!s) gateSwings.set(k, (s = { open, at: -Infinity })); // a gate first seen is drawn as it stands
  else if (s.open !== open) {
    s.open = open;
    s.at = now;
  }
  const t = (now - s.at) / map.gateSwing(wall);
  return t >= 0 && t < 1 ? "mid" : open ? "raised" : "closed";
}

// The portcullis of the gate that wall is one of, as seen from edge (tx, ty): the columns of its picture this edge owns, drawn on the grille's own
// plane (6 units behind the edge line, the face 8: depth.wallFace with T = 12) after the wall and its cap. `whole` is the gate's sheet.
function emitGateLeaf(whole, wall, edge, tx, ty, x, y, o) {
  const parts = whole.wall.parts ? getSheet(whole.wall.parts) : null;
  const side = edge === "n" ? "north" : "west";
  const name = `leaf_${side}_${gateLeafState(wall, edge, tx, ty)}`;
  const lf = parts && parts.frames[name];
  if (!lf) return;
  if (o.note) o.note(name);
  const la = (parts.frameAnchors && parts.frameAnchors[name]) || parts.anchor;
  const span = (map.gateOf(wall) || { span: 1 }).span;
  const k = wall.gate.i;
  const dx = edge === "n" ? 32 : -32;
  const x0 = x - dx * k; // the first edge's tile centre on screen, where the leaf's anchor is
  const y0 = y - 16 * k;
  // The screen columns of this edge: a north edge runs from its tile centre to 32 right of it, a west edge from 32 left of it to it; the first
  // and the last edges own what lies past the ends of the run too.
  const lo = edge === "n" ? x : x - 32;
  const hi = lo + 32;
  const cut0 = (edge === "n" ? k === 0 : k === span - 1) ? -Infinity : lo;
  const cut1 = (edge === "n" ? k === span - 1 : k === 0) ? Infinity : hi;
  const left = x0 - la[0];
  const a = Math.max(left, cut0);
  const b = Math.min(left + lf[2], cut1);
  if (b <= a) return;
  const sx = Math.round(a - left);
  const sw = Math.round(b - left) - sx;
  if (sw <= 0) return;
  const piece = subSheet(parts, name, sx, 0, sw, lf[3], la[0] - sx, la[1]);
  if (o.face) gl.setPlane(depth.wallFace(edge, tx, ty, 12));
  wallPartQuad(piece, name, x0, y0, o);
  if (o.face) gl.setPlane(o.face);
}

function emitDrawnWall(sheet, wall, variant, edge, tx, ty, x, y, h, T, o) {
  const side = edge === "n" ? "north" : "west";
  const { art: settled, boards, n } = drawnVariant(variant);
  const parts0 = sheet.wall.parts ? getSheet(sheet.wall.parts) : null;
  const mid = !o.ghost && !wall.broken && !map.boarded(wall) ? swingLeaf(wall, edge, tx, ty, side, parts0, !!wall.open) : null;
  const art = mid ? "door_open" : settled; // mid-swing: the open frame (its posts and hinge) with the moving leaf after it
  const name = o.frameName || `${side}_${art}`; // a cliff's face variant or its back (art round 10)
  const f = sheet.frames[name];
  if (!f) return;
  const anchor = sheet.frameAnchors[name] || sheet.anchor;
  const parts = sheet.wall.parts ? getSheet(sheet.wall.parts) : null;
  const open = !wall.gate && !wall.broken && !map.boarded(wall) && (wall.kind === "door" ? wall.open : wall.kind === "window" && wall.shutter === "open"); // a gate's leaf rises into its arch, it swings out of nothing
  const outside = open && !o.ghost ? map.outsideSign(tx, ty, edge) : 0;
  const leaves = (far) => (wall.kind === "door" ? [`leaf${far}_${side}`] : [`shutter${far}_left_${side}`, `shutter${far}_right_${side}`]);
  // A door's open leaf stands square to its wall through its hinge and takes that plane (docs/51 section 3); shutters fold back flat
  // against the wall and keep its face's. The hinge is the leaf picture's edge against the wall: a north wall's near leaf runs down-left
  // from it (its right edge), its far leaf up-right (its left edge); a west wall's the other way round.
  const leafQuad = (p, far) => {
    if (wall.kind === "door" && o.face && parts && parts.frames[p]) {
      const lf = parts.frames[p];
      const la = (parts.frameAnchors && parts.frameAnchors[p]) || parts.anchor;
      const left = x - la[0];
      const hingeX = (edge === "n") !== far ? left + lf[2] : left;
      const [hx, hy] = depth.faceAtColumn(edge, tx, ty, far ? -T : T, hingeX);
      gl.setPlane(depth.leaf(edge, hx, hy));
      wallPartQuad(parts, p, x, y, o);
      gl.setPlane(o.face);
      return;
    }
    wallPartQuad(parts, p, x, y, o);
  };
  // A leaf swung away from the camera stands behind the wall: drawn only when
  // the wall is translucent, just before it (docs/17, ruling 2).
  gl.layer(L_FACE); // translucent with the faded wall, which writes no depth: drawn in this order, under the face
  if (outside < 0 && o.faded) for (const p of leaves("_far")) leafQuad(p, true);
  if (o.faded && o.cuts && (o.cuts.near != null || o.cuts.far != null)) emitCutWall(sheet, name, edge, x, y, h, T, o, o.cuts);
  else if (o.under) {
    // Under a floor of the storey above: the picture without its cap, cut along its near face's top (the review of #551: the face stays on
    // its own plane; it had been sunk in the depth buffer, and what stood just behind it drew over it).
    const top = [x, y - iso.HH];
    const at = (X, Y) => [top[0] + X - Y, top[1] + (X + Y) / 2 - h];
    const [a, b] = edge === "n" ? [at(-CAP_MARGIN, T / 2), at(32 + CAP_MARGIN, T / 2)] : [at(T / 2, -CAP_MARGIN), at(T / 2, 32 + CAP_MARGIN)];
    partBelow(sheet, name, x, y, o, a, b);
  } else if (o.clip) partBelow(sheet, name, x, y, o, o.clip[0], o.clip[1]); // a cliff's face under its plateau's floor: nothing over its edge line at the top (art round 10)
  else wallPartQuad(sheet, name, x, y, o);
  gl.layer(L_ON);
  if (!o.faded && !o.ghost && !o.covered) {
    // A margin of a ground pixel all round: the drawn cap's edges are stair
    // steps that poke past the exact parallelogram, and those pixels took the
    // face's light, a dotted bright line along the cap at night (Michael,
    // 2026-10-12). Beyond the cap the picture is empty or the next cap.
    const m = CAP_MARGIN;
    const corners = edge === "n"
      ? [[-m, -T / 2 - m], [32 + m, -T / 2 - m], [32 + m, T / 2 + m], [-m, T / 2 + m]]
      : [[-T / 2 - m, -m], [T / 2 + m, -m], [T / 2 + m, 32 + m], [-T / 2 - m, 32 + m]];
    emitCapFromFrame(sheet, name, anchor, [x, y - iso.HH], corners, h, [tx, ty], o.flags);
  }
  if (boards) wallPartQuad(getSheet(sheet.wall.boards || "wall_boards"), `boards_${boards}_${side}_${n}`, x, y, o);
  if (mid) wallPartQuad(parts, mid, x, y, o); // the swinging leaf in place of the open one, while it swings
  else if (outside > 0) for (const p of leaves("")) leafQuad(p, false);
  if (o.gate) emitGateLeaf(o.gate, wall, edge, tx, ty, x, y, o); // a castle gate's portcullis, after the wall and its cap
}

// What the scene tells the walls of the storeys round the layer being drawn (render/scene.js, each layer): whether the storey above is drawn
// over a tile, and the stair the viewer is on, if any.
let aboveDrawn = null; // (x, y) => true when the storey above this layer is drawn over the tile
let viewerStair = null; // the stair under the viewer's feet (rise above 0), or null
export function setStoreyView(above, stair) {
  aboveDrawn = above;
  viewerStair = stair;
}
// Whether the tile is the viewer's stair's: one of its steps on its own layer, or its stairwell on the layer above.
function onViewerStair(x, y) {
  const s = viewerStair;
  if (!s) return false;
  const L = map.drawLayerNow();
  if (L !== s.layer && L !== s.layer + 1) return false;
  return s.tiles.some(([sx, sy]) => sx === x && sy === y);
}
// A near wall fades (translucent): it stands between the camera and the viewer's room. On a stair (Michael's playtest, 2026-10-27: walls
// built round a stair hid the body on it, both sides of them one room) the walls along the stair's sides on the camera's side fade too, on
// the stair's layer and round its stairwell on the layer above.
function isNearWall(tx, ty, edge, playerRoom) {
  const far = edge === "n" ? [tx, ty - 1] : [tx - 1, ty];
  if (viewerStair && onViewerStair(far[0], far[1]) && !onViewerStair(tx, ty)) return true;
  if (playerRoom <= 0) return false;
  const t = map.tileAt(tx, ty);
  return map.tileAt(far[0], far[1]).room === playerRoom && t.room !== playerRoom;
}

// What stands at a vertex, the player's room aside, worked out once a frame (a wall reads the post at its camera-side end, the posts
// read their own, a cut wall reads both its ends: the review of #530): null, or the post's sheet and the thinnest wall it joins.
const MATERIAL_RANK = { stone: 3, log: 2, wood: 1 };
const rankOf = (s) => MATERIAL_RANK[s.wall ? s.wall.material : s.pattern === "brick" ? "stone" : s.pattern === "log" ? "log" : "wood"] || 0;
const postCache = new Map(); // vertex key -> { sheet, thin } or null, for the frame postFrame
let postFrame = -1;
function postBase(tx, ty, nE, nW, wS, wN) {
  if (gl.frameId() !== postFrame) {
    postCache.clear();
    postFrame = gl.frameId();
  }
  const L = map.drawLayerNow();
  const keyed = tx > -4096 && tx < 4096 && ty > -4096 && ty < 4096 && L > -64 && L < 64; // a small whole number for the key, the map's every tile but the far wild
  const key = keyed ? ((L + 64) * 8192 + (tx + 4096)) * 8192 + (ty + 4096) : -1; // each storey's own (docs/49): the ground's post is not the first floor's
  const got = keyed ? postCache.get(key) : undefined;
  if (got !== undefined) return got;
  let base = null;
  if (!(nE && nW && !wS && !wN && sameRun(nE, nW)) && !(wS && wN && !nE && !nW && sameRun(wS, wN))) {
    let sheet = null;
    let thin = Infinity;
    for (const w of [nE, nW, wS, wN]) {
      if (!w) continue;
      const s = getSheet(w.sprite);
      if (!sheet || rankOf(s) > rankOf(sheet)) sheet = s;
      // The thinnest wall it joins: its depth is taken flush with that wall's faces (makePost), so a post of a thicker material (stone
      // between timber) stands no further forward than the timber it meets.
      thin = Math.min(thin, s.thickness || WALL_T);
    }
    base = { sheet, thin };
  }
  if (keyed) postCache.set(key, base);
  return base;
}

// The post at the top vertex of (tx, ty), if one stands there: where walls meet
// at a corner, end, or junction (docs/02), or where the material changes along
// a straight run (docs/17: the three thicknesses leave a step in the cap).
// `sheet` is the heavier material's (stone over log over wood); `near` is
// whether it is translucent with a near wall.
export function postAt(tx, ty, playerRoom) {
  const v = vertexAt(tx, ty, playerRoom);
  return v && !v.corner && !v.batt ? v : null;
}
// What stands at the vertex: null, a post ({ sheet, near, thin }), or a cliff's corner piece ({ corner }), the four edges read once and the
// corner asked only where a cliff wall meets the vertex (the review of #561: an empty vertex costs its four reads, as before the cliffs).
function vertexAt(tx, ty, playerRoom) {
  // No post where a ring meets itself: its step corners and its door points' ends (docs/50 section 4; the playtest, 2026-10-27); nor for a
  // buried cliff edge (art round 10: plateau on both its sides, drawn as nothing).
  // A ramp's own side (`wall.solid` and no cliff: wall_ramp_side, art round 11) stands post-less: its picture is the whole face.
  // A battlement (art round 13) has no post: its corners and ends are pieces of their own (battlements.vertexAt), asked only where one meets the vertex.
  const straight = (w, x, y, e) => (w && !map.drawnByRing(w) && !(cliffs.cliffWallOf(w) && cliffs.buried(x, y, e, map.drawLayerNow())) && !map.wallRule(w.sprite).side && !map.wallRule(w.sprite).battlement ? w : null);
  const rnE = map.tileAt(tx, ty).n;
  const rnW = map.tileAt(tx - 1, ty).n;
  const rwS = map.tileAt(tx, ty).w;
  const rwN = map.tileAt(tx, ty - 1).w;
  let nE = straight(rnE, tx, ty, "n");
  let nW = straight(rnW, tx - 1, ty, "n");
  let wS = straight(rwS, tx, ty, "w");
  let wN = straight(rwN, tx, ty - 1, "w");
  if (battlements.battlementOf(map.tileAt(tx, ty).n) || battlements.battlementOf(map.tileAt(tx - 1, ty).n) || battlements.battlementOf(map.tileAt(tx, ty).w) || battlements.battlementOf(map.tileAt(tx, ty - 1).w)) {
    const batt = battlements.vertexAt(tx, ty, map.drawLayerNow());
    if (batt) return { batt };
  }
  if (!nE && !nW && !wS && !wN) return null;
  // A cliff's corner piece stands there in place of a post (art round 10): asked only where a cliff wall meets the vertex.
  if (cliffs.cliffWallOf(nE) || cliffs.cliffWallOf(nW) || cliffs.cliffWallOf(wS) || cliffs.cliffWallOf(wN)) {
    const corner = cliffCorner(tx, ty);
    if (corner) return { corner };
  }
  // A straight wall joining a ring at a vertex of its outline (docs/50 section 3, #588): the filler is a straight piece of the joining wall on
  // the outline edge it runs along (fillerDrawables), so for the post it stands in that edge's slot as the joining wall. Where the wall runs
  // on into the curve along its own line, that is one straight run, and no post stands at the join (the wall goes on into the curve, as along
  // any run); where the wall runs along the square's side and the filler turns down the step edge, it is a corner, and the post stands there
  // as at any corner (it hides both pictures' ends). At a door point's end, where nothing is filled, a wall ending there takes no post: its
  // end is in the curve, and a post would stand on the curve's cap (the playtest of 2026-10-27 refused posts on the ring there).
  const fade = { nE: [tx, ty, "n"], nW: [tx - 1, ty, "n"], wS: [tx, ty, "w"], wN: [tx, ty - 1, "w"] }; // whose near-wall fade each slot's wall takes
  if (map.drawnByRing(rnE) || map.drawnByRing(rnW) || map.drawnByRing(rwS) || map.drawnByRing(rwN)) {
    const j = map.ringJoin(tx, ty, map.drawLayerNow());
    if (j) {
      const fills = j.fills.filter((f) => fillerSheet(f.by.wall));
      const lone = [nE, nW, wS, wN].filter(Boolean);
      if (!j.fills.length && lone.length === 1 && fillerSheet(lone[0])) return null; // a fence or bars there keep their own end post (the review of #589)
      for (const f of fills) {
        const slot = f.edge === "n" ? (f.top ? "nE" : "nW") : f.top ? "wS" : "wN";
        fade[slot] = [f.by.tx, f.by.ty, f.by.edge];
        if (slot === "nE" && !nE) nE = f.by.wall;
        else if (slot === "nW" && !nW) nW = f.by.wall;
        else if (slot === "wS" && !wS) wS = f.by.wall;
        else if (slot === "wN" && !wN) wN = f.by.wall;
      }
    }
  }
  const base = postBase(tx, ty, nE, nW, wS, wN);
  if (!base) return null;
  // Translucent only when every wall it joins is a near wall (the front corner);
  // where a near wall meets a far one the post stays solid with the far wall
  // (Michael's designer, 2026-10-12: a ghost post over a solid wall's end read
  // as a pale column).
  const nearAt = (slot) => isNearWall(fade[slot][0], fade[slot][1], fade[slot][2], playerRoom);
  const near = (playerRoom > 0 || !!viewerStair) && (!nE || nearAt("nE")) && (!nW || nearAt("nW")) && (!wS || nearAt("wS")) && (!wN || nearAt("wN"));
  return { sheet: base.sheet, near, thin: base.thin };
}

// ---- a straight wall meeting a ring: the filler (docs/50 section 3, #588) ----
// A picture, drawn from the walls alone (map.ringJoin finds its pieces; nothing saved, nothing sent): where a straight wall ends at a vertex
// of a ring's stepped outline, the joining wall's own straight picture runs on from the vertex along the outline edge the curve crosses, to
// the curve and no further (half a tile at most: along the wall's own line when it runs on into the curve, down the step edge when the wall
// runs along the square's side), cut there inside the ring's thickness. It is that edge's picture cut short (emitCutWall), on that edge's
// plane (docs/51: depth from true geometry), its cap redrawn on the sky as far as it goes, lit where the joining wall's end is (outside the
// steps: the edge's own near tile may be the ring's room), and faded with the joining wall when that wall is a near wall.
function fillerSprite(wall) {
  return wall.gate ? map.wallRule(wall.sprite).run : wall.sprite; // a castle gate at the join: its run's plain wall
}
// The joining wall's sheet when it draws a filler: a drawn wall's plain faces, never a see-through one (a fence, bars), a cliff, a ramp's
// side, or a battlement, which keep their own ends.
function fillerSheet(wall) {
  const sprite = fillerSprite(wall);
  const rule = map.wallRule(sprite);
  if (rule.seeThrough || rule.cliff || rule.battlement || rule.side) return null;
  const sheet = getSheet(sprite);
  return sheet && sheet.wall && sheet.frames && sheet.frames.north_plain && sheet.frames.west_plain ? sheet : null;
}

// Whether the wall on (tx, ty, edge) has a filler drawn from the vertex (vx, vy).
function fillsFrom(vx, vy, tx, ty, edge) {
  const j = map.ringJoin(vx, vy, map.drawLayerNow());
  return !!j && j.fills.some((f) => f.by.tx === tx && f.by.ty === ty && f.by.edge === edge && !!fillerSheet(f.by.wall));
}

// The fillers for the rings on the layer being drawn whose joining walls are among the tiles drawn.
function fillerDrawables(tiles, visible, playerRoom, out) {
  const L = map.drawLayerNow();
  const rings = map.allRings(L);
  if (!rings.length || !tiles.length) return;
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const t of tiles) {
    if (t[0] < x0) x0 = t[0];
    if (t[0] > x1) x1 = t[0];
    if (t[1] < y0) y0 = t[1];
    if (t[1] > y1) y1 = t[1];
  }
  let drawn = null; // a storey's drawn tiles (its hiding rule thins them), made only there and only once a join is in view, as rings.js does
  for (const r of rings) {
    if (r.x0 > x1 + 1 || r.y0 > y1 + 1 || r.x0 + r.n < x0 - 1 || r.y0 + r.n < y0 - 1) continue;
    for (const [vx, vy] of round.fillVerticesOf(r.x0, r.y0, r.n)) {
      const j = map.ringJoin(vx, vy, L);
      if (!j || j.ring !== r) continue;
      for (const f of j.fills) {
        const { tx: wx, ty: wy } = f.by;
        if (wx < x0 || wx > x1 || wy < y0 || wy > y1) continue; // drawn with the wall it belongs to
        if (L !== 0) {
          if (!drawn) {
            drawn = new Set();
            for (const [tx, ty] of tiles) drawn.add(tileKey(tx, ty));
          }
          if (!drawn.has(tileKey(wx, wy))) continue;
        }
        const d = makeFiller(r, f, visible, playerRoom);
        if (d) out.push(d);
      }
    }
  }
}

function makeFiller(r, f, visible, playerRoom) {
  const w = f.by;
  const sheet = fillerSheet(w.wall);
  if (!sheet) return null;
  const { tx, ty, edge } = f; // the outline edge it runs along
  const name = edge === "n" ? "north_plain" : "west_plain";
  const anchor = (sheet.frameAnchors && sheet.frameAnchors[name]) || sheet.anchor;
  const p = iso.toScreen(tx, ty);
  const x = Math.round(p.x);
  const y = Math.round(p.y);
  const h = sheet.wallHeight || 96;
  const T = sheet.thickness || WALL_T;
  const stub = isNearWall(w.tx, w.ty, w.edge, playerRoom); // faded with the wall it belongs to
  const alpha = stub ? NEAR_WALL_ALPHA : 1;
  const across = w.edge === "n" ? [w.tx, w.ty - 1] : [w.tx - 1, w.ty];
  const vis = visible.has(tileKey(w.tx, w.ty)) || visible.has(tileKey(across[0], across[1]));
  const flags = vis ? gl.FLAG_NOFOG : 0;
  const stack = stackOf(w.tx, w.ty, w.edge);
  const lift = stack.onWall ? STACK_BIAS : 0;
  // The joining wall's light at its end at the vertex (makeWall's foot points, 0.4 along from its middle and 0.2 off it on its near side).
  const lp = w.edge === "n" ? [w.tx + (f.vx === w.tx ? -0.4 : 0.4), w.ty - 0.2] : [w.tx - 0.2, w.ty + (f.vy === w.ty ? -0.4 : 0.4)];
  // How much of the edge it takes, from its top vertex (0) to its other end (1), and the cuts that leave just that (screen px along it).
  const k0 = f.top ? 0 : 1 - f.d;
  const k1 = f.top ? f.d : 1;
  // Faded, a piece whose camera-side end is the vertex leaves its end face to the wall that goes on from there, as a faded run's segments do
  // at a joint (wallCuts), so no overlap shows twice as dark; the wall cuts its own end where the filler goes on from its camera-side end.
  const cuts = { far: k0 > 0 ? k0 * iso.HW : null, near: k1 < 1 ? (1 - k1) * iso.HW : stub ? 0 : null };
  // And faded where a post stands at the vertex (a wall along the square's side turning down the step edge), it stops at the post's face, as
  // wallCuts cuts a faded wall there, so its first stretch inside the faded post is not drawn twice (the review of #589).
  const vPost = stub ? postAt(f.vx, f.vy, playerRoom) : null;
  if (vPost) cuts[f.top ? "far" : "near"] = (vPost.sheet.thickness || WALL_T) / 2;
  const bare = vPost && (vPost.sheet.thickness || WALL_T) / 2 >= f.d * iso.HW; // the post covers all of it: no face to draw
  // Its depth: the edge's near face, its ridge where a straight segment's would be (a post at the edge's camera-side end moves it back).
  const endPost = edge === "n" ? postAt(tx + 1, ty, null) : postAt(tx, ty + 1, null);
  const postSheet = endPost && endPost.sheet.wall && endPost.sheet.wall.post ? endPost.sheet : null;
  const face = depth.wallSurface(edge, tx, ty, T, (postSheet ? (postSheet.thickness || WALL_T) + 3 - T / 2 : 2) / depth.UNIT);
  const sortDepth = edge === "n" ? tx + ty - 0.5 : tx - 0.5 + ty;
  return {
    key: sortDepth * 1000,
    kind: "wall",
    filler: { ring: r.id, vx: f.vx, vy: f.vy, tx, ty, edge, d: f.d, wall: { tx: w.tx, ty: w.ty, edge: w.edge }, cuts, top: f.top }, // check("round") finds it, and reads its cuts
    stack,
    faded: !!stub,
    emit() {
      gl.surface(face, lift, DEPTH_ROOM.wall);
      gl.layer(L_FACE);
      if (!bare) emitCutWall(sheet, name, edge, x, y, h, T, { wa: lp, wb: lp, tint: [1, 1, 1, alpha], flags }, cuts);
      if (!stub && !stack.covered) {
        // Its cap on the sky, as far as it goes (emitDrawnWall's, cut at the same lines).
        gl.layer(L_ON);
        const m = CAP_MARGIN;
        const a = k0 * 32 - m;
        const b = k1 * 32 + m;
        const corners = edge === "n" ? [[a, -T / 2 - m], [b, -T / 2 - m], [b, T / 2 + m], [a, T / 2 + m]] : [[-T / 2 - m, a], [T / 2 + m, a], [T / 2 + m, b], [-T / 2 - m, b]];
        emitCapFromFrame(sheet, name, anchor, [x, y - iso.HH], corners, h, lp, flags);
      }
      gl.layer(null);
    },
  };
}

// The storeys' seam (docs/49 section 6; Michael's playtest, 2026-10-27: a notched ledge between the storeys and the ground's caps poking up
// through the first floor's edge): a wall with a wall standing on it on the layer above is `covered` and draws no cap of its own; the
// wall standing on one is `onWall`, and its face is drawn a step nearer than the one below, so where their pictures meet (the lower
// picture's cap, drawn on its face's plane, under the upper face's foot) the upper face is the one seen: one face, two storeys tall.
// The same for a post with a post over it, and for a door's or a window's frame top. On the ground with nothing over it, as before.
const STACK_BIAS = 1;
const POST_FOOT_UP = 6; // px over a drawn post's anchor (its vertex) where its stone foot begins, at its outer columns (data/art/village/post_*.png)
function wallOn(tx, ty, edge, layer) {
  const t = map.peekTile(tx, ty, layer);
  return t ? t[edge] || null : null;
}
// A wall under a floor of the storey above (Michael's playtest, 2026-10-27: from upstairs the ground floor's interior walls showed their
// tops over the floor, and round the stairwell) draws no cap: its picture is cut along its near face's top (and a post's along its two near
// faces' tops), the face kept on its own plane; at a stairwell's edge the floor on one side is enough, the wall's top meeting the floor's
// edge flush. Only while that storey is drawn over it, and not fading: from inside below, or through a faded storey, it stands as it did.

function floorOver(x, y) {
  if (!aboveDrawn || !aboveDrawn(x, y)) return false;
  const t = map.peekTile(x, y, map.drawLayerNow() + 1);
  return !!t && !map.isEngineFloor(t.floor);
}
function stackOf(tx, ty, edge) {
  const L = map.drawLayerNow();
  const above = !!wallOn(tx, ty, edge, L + 1);
  // Floor over both its sides: no cap at all (the picture cut along its near face's top). Over one side only (a stairwell's edge): its top
  // stays, flush with the floor at the storey's height, as the floor's edge, never redrawn on the sky over it.
  const over = map.edgeTiles(tx, ty, edge).map(([x, y]) => floorOver(x, y));
  const under = !above && over[0] && over[1];
  return { covered: above || over[0] || over[1], onWall: L !== 0 && !!wallOn(tx, ty, edge, L - 1), under };
}
function postStack(tx, ty) {
  const L = map.drawLayerNow();
  const at = (l) => !!(wallOn(tx, ty, "n", l) || wallOn(tx - 1, ty, "n", l) || wallOn(tx, ty, "w", l) || wallOn(tx, ty - 1, "w", l));
  const above = at(L + 1);
  const over = [[tx, ty], [tx - 1, ty], [tx, ty - 1], [tx - 1, ty - 1]].map(([x, y]) => floorOver(x, y));
  const under = !above && over.every(Boolean);
  return { covered: above || over.some(Boolean), onWall: L !== 0 && at(L - 1), under };
}

// ---- cliffs (art round 10, Michael's approval 2026-10-28: Free building's, for experimenting) ----
// A cliff (src/cliffs.js: a wall whose definition says `wall.cliff`, its plateau the tiles floored on the layer above) is drawn from the
// delivery's pictures, which need no outline: an edge's face one of `faces[side]` by a hash of the edge, or `back[side]` when its plateau
// is on the camera's side, its lip seen from behind on its far face's plane (behind the plateau's floor); a face with its plateau floored is
// drawn below its edge line at the top, so the plateau's floor is what shows over its flat top (the lip is the wall's, never a cap); a
// corner (cliffs.cornerAt) takes the corner piece of `wall.corners` for both its edges and in place of the post.
const sameRun = (a, b) => a.sprite === b.sprite || map.wallRule(a.sprite).run === map.wallRule(b.sprite).run || (!!cliffs.cliffWallOf(a) && !!cliffs.cliffWallOf(b)); // a castle gate is the stone wall's own run (`wall.run`): no post at its ends nor inside its arch (docs/02, 2026-10-29) // a grassy lip meets a rocky one with no post: the same rock (the artist's note)
const cornerCache = new Map(); // vertex key (postBase's) -> cliffs.cornerBase or null, for the frame cornerFrame; asked only at a vertex a cliff wall meets
let cornerFrame = -1;
function cornerBaseCached(vx, vy, L) {
  if (gl.frameId() !== cornerFrame) {
    cornerCache.clear();
    cornerFrame = gl.frameId();
  }
  if (!(vx > -4096 && vx < 4096 && vy > -4096 && vy < 4096 && L > -64 && L < 64)) return cliffs.cornerBase(vx, vy, L); // the far wild: unkeyed
  const k = ((L + 64) * 8192 + (vx + 4096)) * 8192 + (vy + 4096);
  let c = cornerCache.get(k);
  if (c === undefined) cornerCache.set(k, (c = cliffs.cornerBase(vx, vy, L)));
  return c;
}
export function cliffCorner(vx, vy) {
  return cliffs.cornerAt(vx, vy, map.drawLayerNow(), cornerBaseCached);
}
// A cliff edge not drawn as a segment: buried (plateau on both its sides: a hill widened past it, seen nowhere; the review of #561), or
// drawn by a corner piece at either end.
function cliffHidden(tx, ty, edge, wall) {
  const L = map.drawLayerNow();
  return cliffs.buried(tx, ty, edge, L) || cliffs.claimedByCorner(tx, ty, edge, wall, L, cornerBaseCached);
}
// A straight cliff edge's picture, and the line its face is cut along under its plateau's floor.
function cliffArt(sheet, wall, edge, tx, ty, x, y, h) {
  const L = map.drawLayerNow();
  const f = cliffs.edgeFrame(getDef(wall.sprite), tx, ty, edge, L, (n) => !!sheet.frames[n]);
  if (f.back) return { frameName: f.name, back: true, clip: null };
  const across = edge === "n" ? [tx, ty - 1] : [tx - 1, ty];
  let clip = null;
  if (cliffs.plateauAt(across[0], across[1], L)) {
    const top = [x, y - iso.HH];
    const at = (X, Y) => [top[0] + X - Y, top[1] + (X + Y) / 2 - h];
    clip = edge === "n" ? [at(-CAP_MARGIN, 0), at(32 + CAP_MARGIN, 0)] : [at(0, -CAP_MARGIN), at(0, 32 + CAP_MARGIN)];
  }
  return { frameName: f.name, back: false, clip };
}

// A corner's picture in parts, each on its own edge's plane (docs/51: the faces' planes; the artist's depth maps are not read): where its
// two edges leave the vertex on either side of the vertex's column, each side its edge's (a face seen cut below its edge line at the top,
// so the plateau's floor shows over its flat top; a lip seen from behind on the plane of its far face, behind that floor); where both leave
// on one side (an outer corner's or a cove's lip turning away), the lip's band along its edge line on the far face's plane and the face's
// rest on its own.
const LIP_UP = 6; // px a lip band reaches over its edge line (the turf's tufts)
const LIP_DOWN = 6; // and under it (the lip's quarter round from behind)
const SIDE_SLACK = 2; // px a one-sided corner's parts reach across the vertex's column (its round's last pixels)
function makeCliffCorner(vx, vy, c, vis) {
  return {
    key: (vx + vy - 1) * 1000 + 0.5,
    kind: "wall",
    corner: { vx, vy, name: c.frame }, // a probe finds it (scene.probe.mark)
    emit() {
      const cs = getSheet(getDef(c.n.sprite).wall.corners);
      const f = cs && cs.frames[c.frame];
      if (!f) return;
      const a = (cs.frameAnchors && cs.frameAnchors[c.frame]) || cs.anchor;
      const p = iso.toScreen(vx - 0.5, vy - 0.5);
      const X0 = Math.round(p.x);
      const Y0 = Math.round(p.y);
      const h = cs.wallHeight || getSheet(c.n.sprite).wallHeight || 96;
      const V = [X0, Y0 - h];
      const L = X0 - a[0];
      const Tp = Y0 - a[1];
      const rect = [[L, Tp], [L + f[2], Tp], [L + f[2], Tp + f[3]], [L, Tp + f[3]]];
      const uv = gl.frameUV(cs, c.frame);
      const flags = vis ? gl.FLAG_NOFOG : 0;
      const T = getSheet(c.n.sprite).thickness || WALL_T;
      // Each edge: the screen direction it leaves the vertex in (a tile's length), its face's surface, and the tile its face looks onto. The
      // surface is a straight segment's of that edge (depth.wallSurface: its face, a seen face T / 2 toward the camera and a lip's T / 2 away,
      // and past its camera-side end the end's own plane), so where a corner's picture runs on past its edge into the next piece's, it lies
      // behind that piece as a straight segment's end does, never tied with it on one plane (a checkered seam).
      // A halved edge whose corner is at its far end (a north edge's west end, a west edge's north end) ends at the edge's midpoint, where
      // the other corner's half begins: its end plane from there (the cut face its half shows) behind that half.
      const nRight = c.nTile[0] === vx;
      const wRight = c.wTile[1] === vy - 1;
      const nShift = (nRight && /_hn/.test(c.frame) ? 0.5 : 0) + 2 / depth.UNIT;
      const wShift = (!wRight && /_h(n?)w/.test(c.frame) ? 0.5 : 0) + 2 / depth.UNIT;
      const edges = [
        { dir: nRight ? [32, 16] : [-32, -16], front: c.nFront, plane: depth.wallSurface("n", c.nTile[0], c.nTile[1], c.nFront ? T : -T, nShift), world: [c.nTile[0], c.nFront ? vy : vy - 1] },
        { dir: wRight ? [32, -16] : [-32, 16], front: c.wFront, plane: depth.wallSurface("w", c.wTile[0], c.wTile[1], c.wFront ? T : -T, wShift), world: [c.wFront ? vx : vx - 1, c.wTile[1]] },
      ];
      const half = (pts, lineA, lineB, keepY) => (pts ? clipBelow(pts, lineA, lineB, [(lineA[0] + lineB[0]) / 2, keepY]) : null);
      const below = (pts, e, off = 0) => half(pts, [V[0], V[1] + off], [V[0] + e.dir[0], V[1] + off + e.dir[1]], V[1] + 10000);
      const above = (pts, e, off = 0) => half(pts, [V[0], V[1] + off], [V[0] + e.dir[0], V[1] + off + e.dir[1]], V[1] - 10000);
      const sideOf = (pts, right, slack = 0) => (pts ? clipBelow(pts, [V[0] + (right ? -slack : slack), 0], [V[0] + (right ? -slack : slack), 1], [V[0] + (right ? 1000 : -1000), V[1]]) : null);
      const parts = [];
      const r0 = edges[0].dir[0] > 0;
      const r1 = edges[1].dir[0] > 0;
      if (r0 !== r1) {
        for (const e of edges) {
          let q = sideOf(rect, e.dir[0] > 0);
          if (e.front) q = below(q, e);
          parts.push([q, e]);
        }
      } else {
        const F = edges.find((e) => e.front) || edges[0];
        const B = edges.find((e) => e !== F);
        const region = sideOf(rect, r0, SIDE_SLACK);
        if (B.dir[1] < 0) {
          // The lip leaves upward, the face downward (outer_w, outer_e): above the lip's line its band, under it the face.
          parts.push([above(region, B, LIP_DOWN), B]);
          parts.push([below(below(region, F), B, LIP_DOWN), F]);
        } else {
          // The lip leaves downward across the face's picture (inner_e, inner_w): the face over the lip's band, the band, the rest under it
          // (the lip's edge's own side, the rock's cut, on the face's plane: behind the plateau's front, which covers it).
          parts.push([above(below(region, F), B, -LIP_UP), F]);
          parts.push([above(below(region, B, -LIP_UP), B, LIP_DOWN), B]);
          parts.push([below(region, B, LIP_DOWN), F]);
        }
      }
      let first = true;
      for (const [q, e] of parts) {
        if (!q) continue;
        if (first) gl.surface(e.plane, 0, DEPTH_ROOM.wall);
        else gl.setPlane(e.plane);
        first = false;
        gl.texQuad(q, q.map(([px, py]) => [uv[0] + (px - L), uv[1] + (py - Tp)]), { world: e.world, heights: q.map(([, py]) => Math.max(0, Y0 - py)), flags, page: uv[4] });
      }
    },
  };
}

// Corner posts, and a cliff's corner pieces in their place.
export function postDrawables(tiles, visible, playerRoom, out) {
  for (const [tx, ty] of tiles) {
    const v = vertexAt(tx, ty, playerRoom);
    if (!v) continue;
    if (v.batt) {
      const vis = visible.has(tileKey(tx, ty)) || visible.has(tileKey(tx - 1, ty)) || visible.has(tileKey(tx, ty - 1)) || visible.has(tileKey(tx - 1, ty - 1));
      out.push(makeBattlementVertex(tx, ty, v.batt, vis, postStack(tx, ty)));
      continue;
    }
    if (v.corner) {
      const vis = visible.has(tileKey(tx, ty)) || visible.has(tileKey(tx - 1, ty)) || visible.has(tileKey(tx, ty - 1)) || visible.has(tileKey(tx - 1, ty - 1));
      out.push(makeCliffCorner(tx, ty, v.corner, vis));
      continue;
    }
    const post = v;
    const vis = visible.has(tileKey(tx, ty)) || visible.has(tileKey(tx - 1, ty)) || visible.has(tileKey(tx, ty - 1)) || visible.has(tileKey(tx - 1, ty - 1));
    out.push(makePost(tx, ty, post.sheet, vis, post.near, post.thin, postStack(tx, ty)));
  }
}

// Where a translucent near wall's segment stops short (Michael, 2026-10-12: the
// near walls at night were banded). A drawn segment carries its near end face,
// which the next segment covers, and a post covers both walls' ends; drawn at
// the wall's alpha, every overlap showed twice as dark. So a translucent
// segment is cut: at its near end where the next segment goes on translucent
// (through the joint, c = 0), and at either end where a post stands, solid or
// translucent (at the post's face, c = half its thickness). null: not cut.
function wallCuts(edge, tx, ty, playerRoom) {
  const atPost = (px, py) => {
    const post = postAt(px, py, playerRoom);
    return post ? (post.sheet.thickness || WALL_T) / 2 : undefined;
  };
  // The near end: the right vertex of a north wall, the left vertex of a west wall.
  const [nx, ny] = edge === "n" ? [tx + 1, ty] : [tx, ty + 1];
  let near = atPost(nx, ny);
  if (near === undefined) {
    const next = edge === "n" ? map.tileAt(nx, ny).n : map.tileAt(nx, ny).w;
    near = next && isNearWall(nx, ny, edge, playerRoom) ? 0 : null;
    if (near === null && map.drawnByRing(next) && fillsFrom(nx, ny, tx, ty, edge)) near = 0; // its filler runs on from there into the curve, faded with it (#588)
  }
  const far = atPost(tx, ty);
  return { near, far: far === undefined ? null : far };
}

// A translucent drawn wall's frame drawn as pieces that leave out what lies
// beyond its cuts. A cut is a vertical plane across the wall: on screen, a
// vertical line through the face and a slant across the cap, so the frame is
// split into strips at each cut's two face corners. Light and heights are
// interpolated over the frame as the whole quad's are.
function emitCutWall(sheet, name, edge, x, y, h, T, o, cuts) {
  const f = sheet.frames[name];
  const an = (sheet.frameAnchors && sheet.frameAnchors[name]) || sheet.anchor;
  const L = x - an[0];
  const Tp = y - an[1];
  const R = L + f[2];
  const B = Tp + f[3];
  const uv = gl.frameUV(sheet, name);
  const piece = (pts) => {
    let c = pts.map(([px, py]) => [Math.min(R, Math.max(L, px)), Math.min(B, Math.max(Tp, py))]);
    // A cliff's face under its plateau's floor keeps its cut along the edge line when it is a faded near wall too (the review of #561).
    if (o.clip) c = clipBelow(c, o.clip[0], o.clip[1], [(o.clip[0][0] + o.clip[1][0]) / 2, B + 1000]);
    if (!c) return;
    gl.texQuad(c, c.map(([px, py]) => [uv[0] + px - L, uv[1] + py - Tp]), {
      page: uv[4],
      world: c.map(([px]) => {
        const k = (px - L) / f[2];
        return [o.wa[0] + (o.wb[0] - o.wa[0]) * k, o.wa[1] + (o.wb[1] - o.wa[1]) * k];
      }),
      heights: c.map(([, py]) => B - py),
      color: o.tint,
      flags: o.flags,
    });
  };
  let xL = L;
  let xR = R;
  if (edge === "n") {
    // From the top vertex a (far end) down to the right vertex b (near end);
    // along the wall is (1, 1/2) per pixel, the near face (-T/2, T/4) off the edge.
    const a = [x, y - iso.HH];
    const b = [x + iso.HW, y];
    if (cuts.far != null) {
      const E = [a[0] + cuts.far, a[1] + cuts.far / 2];
      const N = [E[0] - T / 2, E[1] + T / 4];
      const F = [E[0] + T / 2, E[1] - T / 4];
      piece([[N[0], N[1] - h], [F[0], F[1] - h], [F[0], B], [N[0], B]]); // the cap beyond the slant, the face below
      xL = F[0];
    }
    if (cuts.near != null) {
      const E = [b[0] - cuts.near, b[1] - cuts.near / 2];
      const N = [E[0] - T / 2, E[1] + T / 4];
      const F = [E[0] + T / 2, E[1] - T / 4];
      piece([[N[0], Tp], [F[0], Tp], [F[0], F[1] - h], [N[0], N[1] - h]]); // only the cap short of the slant
      xR = N[0];
    }
  } else {
    // From the top vertex b (far end) down to the left vertex a (near end);
    // along the wall is (-1, 1/2) per pixel, the near face (T/2, T/4) off the edge.
    const a = [x - iso.HW, y];
    const b = [x, y - iso.HH];
    if (cuts.near != null) {
      const E = [a[0] + cuts.near, a[1] - cuts.near / 2];
      const N = [E[0] + T / 2, E[1] + T / 4];
      const F = [E[0] - T / 2, E[1] - T / 4];
      piece([[F[0], Tp], [N[0], Tp], [N[0], N[1] - h], [F[0], F[1] - h]]);
      xL = N[0];
    }
    if (cuts.far != null) {
      const E = [b[0] - cuts.far, b[1] + cuts.far / 2];
      const N = [E[0] + T / 2, E[1] + T / 4];
      const F = [E[0] - T / 2, E[1] - T / 4];
      piece([[F[0], F[1] - h], [N[0], N[1] - h], [N[0], B], [F[0], B]]);
      xR = F[0];
    }
  }
  if (xR > xL) piece([[xL, Tp], [xR, Tp], [xR, B], [xL, B]]);
}

function makePost(tx, ty, sheet, vis, near, thin = null, stack = null) {
  const covered = !!(stack && stack.covered);
  const lift = stack && stack.onWall ? STACK_BIAS : 0;
  const under = !!(stack && stack.under); // under a floor of the storey above: drawn without its cap
  const p = iso.toScreen(tx - 0.5, ty - 0.5);
  const x = Math.round(p.x);
  const y = Math.round(p.y);
  const h = sheet.wallHeight || 96;
  const T = sheet.thickness || WALL_T;
  const color = sheet.color || "#888";
  const A = [x, y];
  const B = [x + T, y - T / 2];
  const C = [x, y - T];
  const D = [x - T, y - T / 2];
  const up = ([px, py]) => [px, py - h];
  const faded = near; // a near wall's post is translucent like the wall (docs/17: the stub mode retired)
  const hidden = false;
  const alpha = faded ? NEAR_WALL_ALPHA : 1;
  const flags = vis ? gl.FLAG_NOFOG : 0;
  // Its depth (docs/51 section 3): the two faces of its square, split at its near corner's column. A drawn post is centred on the vertex,
  // a pixel proud of the wall in its picture (its cap below), but its depth is taken flush with the faces of the thinnest wall it joins,
  // a little behind them (scene.js DEPTH_BIAS): proud, its corner stood a unit into a room's far corner and drew a light line down it,
  // and a stone post between timber walls stood over the timber that begins at it, neither of which the sort ever showed. The walls'
  // own surfaces give way to it at their camera-side ends (depth.wallSurface). The generated one's square has the vertex for its near
  // corner.
  const hs = sheet.wall && sheet.wall.post ? (thin || T) / 2 / depth.UNIT : 0;
  const surf = depth.ridge(tx - 0.5 + hs, ty - 0.5 + hs);
  return {
    key: (tx + ty - 1) * 1000 + 0.5,
    kind: "wall",
    post: { tx, ty }, // check("depth") finds its drawable
    stack,
    emit() {
      if (hidden) return;
      gl.surface(surf, DEPTH_BIAS.post + lift, DEPTH_ROOM.post);
      if (sheet.wall && sheet.wall.post) {
        // The drawn post (docs/17), anchored on the vertex itself, its cap redrawn on the sky (none under a post on the storey above).
        const ps = getSheet(sheet.wall.post);
        const pf = ps.frames.idle_0;
        if (pf) {
          const world = [[tx - 1, ty], [tx, ty - 1], [tx, ty - 1], [tx - 1, ty]];
          if (lift) {
            // A post standing on a post (the storeys' seam, Michael's playtest 2026-10-27): no foot of its own, its plinth over the one below's
            // top read as a stone band between the storeys. Its picture is drawn down to the foot's top, and the rows of shaft just over it
            // again below that, to the frame's foot, so the shaft runs on into the post below as one post two storeys tall.
            const uv = gl.frameUV(ps, "idle_0");
            const X0 = x - ps.anchor[0];
            const Y0 = y - ps.anchor[1];
            const W = pf[2];
            const cut = Math.max(1, Math.round(ps.anchor[1]) - POST_FOOT_UP);
            const n = Math.min(cut, pf[3] - cut);
            const band = (top, bottom, v0, v1) => gl.texQuad([[X0, Y0 + top], [X0 + W, Y0 + top], [X0 + W, Y0 + bottom], [X0, Y0 + bottom]], [[uv[0], uv[1] + v0], [uv[0] + W, uv[1] + v0], [uv[0] + W, uv[1] + v1], [uv[0], uv[1] + v1]], { world, heights: [pf[3] - top, pf[3] - top, pf[3] - bottom, pf[3] - bottom], color: [1, 1, 1, alpha], flags, page: uv[4] });
            gl.holdOrder(true); // side by side, never overlapping: one step
            band(0, cut, 0, cut);
            band(cut, cut + n, cut - n, cut);
            gl.holdOrder(false);
          } else if (under) {
            // Under a floor of the storey above (the review of #551): the post without its cap, its two halves cut along their near faces' tops
            // (the cap's left and bottom corners, its bottom and right), on its own plane.
            const uv = gl.frameUV(ps, "idle_0");
            const X0 = x - ps.anchor[0];
            const Y0 = y - ps.anchor[1];
            const m = T / 2 + CAP_MARGIN + 1;
            const left = [x - 2 * m, y - h];
            const bottom = [x, y - h + m];
            const right = [x + 2 * m, y - h];
            gl.holdOrder(true);
            for (const [xa, xb, a, b] of [[X0, x, left, bottom], [x, X0 + pf[2], bottom, right]]) {
              if (xb <= xa) continue;
              const q = clipBelow([[xa, Y0], [xb, Y0], [xb, Y0 + pf[3]], [xa, Y0 + pf[3]]], a, b, [(xa + xb) / 2, Y0 + pf[3] + 1000]);
              if (q) gl.texQuad(q, q.map(([px, py]) => [uv[0] + (px - X0), uv[1] + (py - Y0)]), { world: [tx, ty], heights: q.map(([, py]) => Math.max(0, Y0 + pf[3] - py)), color: [1, 1, 1, alpha], flags, page: uv[4] });
            }
            gl.holdOrder(false);
          } else gl.quad(x - ps.anchor[0], y - ps.anchor[1], pf[2], pf[3], gl.frameUV(ps, "idle_0"), { world, heights: [pf[3], pf[3], 0, 0], color: [1, 1, 1, alpha], flags });
          if (!faded && !covered) {
            const uv = gl.frameUV(ps, "idle_0");
            const pts = [];
            const uvs = [];
            const m = T / 2 + CAP_MARGIN + 1; // the drawn post is a pixel proud of the wall
            for (const [X, Y] of [[-m, -m], [m, -m], [m, m], [-m, m]]) {
              const ox = X - Y;
              const oy = (X + Y) / 2 - h;
              pts.push([x + ox, y + oy]);
              uvs.push([uv[0] + ps.anchor[0] + ox, uv[1] + ps.anchor[1] + oy]);
            }
            gl.texQuad(pts, uvs, { world: [tx, ty], flags: flags | gl.FLAG_SKY, page: uv[4] });
          }
        }
        return;
      }
      // The post stands at the top vertex of (tx, ty); its left face continues
      // the north-wall line and looks onto (tx - 1, ty), its right face the
      // west-wall line and looks onto (tx, ty - 1); the top is the sky.
      gl.holdOrder(true); // its two faces and its top meet at their edges: one step
      gl.poly([D, A, up(A), up(D)], gl.rgb(shade(color, 0.5), alpha), { world: [tx - 1, ty], heights: [0, 0, h, h], flags });
      gl.poly([A, B, up(B), up(A)], gl.rgb(shade(color, 0.62), alpha), { world: [tx, ty - 1], heights: [0, 0, h, h], flags });
      if (!covered) gl.poly([up(A), up(B), up(C), up(D)], gl.rgb(shade(color, 1.18), alpha), { world: [tx, ty], flags: flags | gl.FLAG_SKY });
      gl.holdOrder(false);
    },
  };
}

// ---- battlements (art round 13, Michael 2026-10-29; src/battlements.js) ----
// A castle battlement is a wall piece wholly on the outside of its edge line, so it has no thickness to centre on that line and no cap: its
// picture is the whole of it (the stone's tops are drawn in it), its walkway side read from the floors of its own layer (`far`: the stone behind
// the walkway, `near`: in front of it). Its depth is the plane of the face its picture shows: the edge line itself for far (the merlons'
// inner faces), 16 units beyond it for near (the outer faces, the corbels); the artist's depth maps are not read (planar depth, small errors
// at the far merlons' tops). A near battlement fades as the walls of the viewer's room do, where the viewer stands on the walkway behind it.
let viewerAt = null; // { x, y, layer }: the viewer's tile and storey, for the near battlement's fade
export function setViewerAt(v) {
  viewerAt = v;
}
// Whether the near battlement on (tx, ty, edge) is translucent: the viewer stands on the walkway tile behind it or the one beside that.
function battlementFades(tx, ty, edge) {
  const v = viewerAt;
  if (!v || v.layer !== map.drawLayerNow()) return false;
  const across = edge === "n" ? [tx, ty - 1] : [tx - 1, ty];
  if (battlements.sideOf(tx, ty, edge, v.layer) !== "near") return false;
  return edge === "n" ? v.y === across[1] && Math.abs(v.x - across[0]) <= 1 : v.x === across[0] && Math.abs(v.y - across[1]) <= 1;
}
function makeBattlement(wall, sheet, edge, tx, ty, vis, stub, ghostTint, stack) {
  const lift = stack && stack.onWall ? STACK_BIAS : 0;
  const L = map.drawLayerNow();
  const side = battlements.sideOf(tx, ty, edge, L);
  const has = (n) => !!sheet.frames[n];
  const name = side ? battlements.edgeFrame(getDef(wall.sprite), tx, ty, edge, L, has) : ghostTint ? `${edge === "n" ? "north" : "west"}_far_plain` : null; // a ghost with no side shows the far piece, red
  const sortDepth = edge === "n" ? tx + ty - 0.5 : tx - 0.5 + ty;
  const p = iso.toScreen(tx, ty);
  const x = Math.round(p.x) + shakeOffset(tx, ty, edge);
  const y = Math.round(p.y);
  const alpha = stub ? NEAR_WALL_ALPHA : 1;
  const flags = ghostTint ? GHOST_FLAGS() : vis ? gl.FLAG_NOFOG : 0;
  const wa = edge === "n" ? [tx - 0.4, ty - 0.2] : [tx - 0.2, ty - 0.4];
  const wb = edge === "n" ? [tx + 0.4, ty - 0.2] : [tx - 0.2, ty + 0.4];
  const face = depth.wallSurface(edge, tx, ty, side === "near" ? 32 : 0);
  return {
    key: sortDepth * 1000,
    kind: "wall",
    wall: { tx, ty, edge }, // check("depth") finds its drawable
    stack,
    faded: !!stub,
    battlement: name, // the frame drawn (check("battlements") reads it)
    emit() {
      if (!name) return;
      gl.surface(face, lift, DEPTH_ROOM.wall);
      gl.layer(L_FACE);
      wallPartQuad(sheet, name, x, y, { wa, wb, tint: ghostTint || [1, 1, 1, alpha], flags });
      gl.layer(null);
    },
  };
}

// A battlement's corner or free end at the vertex (vx, vy): its picture anchored on the vertex itself, on the plane of the face it shows (a
// corner's block: a ridge at its front corner, half a tile out on each near arm; an end's half merlon: its run's plane).
function makeBattlementVertex(vx, vy, b, vis, stack) {
  const lift = stack && stack.onWall ? STACK_BIAS : 0;
  return {
    key: (vx + vy - 1) * 1000 + 0.5,
    kind: "wall",
    post: { tx: vx, ty: vy }, // check("depth") finds its drawable
    stack,
    battlement: b.frame, // the frame drawn (check("battlements") reads it)
    emit() {
      const cs = getSheet("wall_battlement_vertices");
      const f = cs && cs.frames[b.frame];
      if (!f) return;
      const a = (cs.frameAnchors && cs.frameAnchors[b.frame]) || cs.anchor;
      const p = iso.toScreen(vx - 0.5, vy - 0.5);
      const surf = b.kind === "corner"
        ? depth.ridge(vx - 0.5 + (b.wNear ? 0.5 : 0), vy - 0.5 + (b.nNear ? 0.5 : 0))
        : b.edge === "n" ? depth.planeY(vy - 0.5 + (b.near ? 0.5 : 0)) : depth.planeX(vx - 0.5 + (b.near ? 0.5 : 0));
      gl.surface(surf, lift, DEPTH_ROOM.post);
      const w = [vx - 0.5, vy - 0.5];
      gl.layer(L_FACE);
      gl.quad(p.x - a[0], p.y - a[1], f[2], f[3], gl.frameUV(cs, b.frame), { world: [w, w, w, w], heights: [f[3], f[3], 0, 0], flags: vis ? gl.FLAG_NOFOG : 0 });
      gl.layer(null);
    },
  };
}

export function wallDrawables(tiles, visible, playerRoom, out) {
  for (const [tx, ty] of tiles) {
    const t = map.tileAt(tx, ty);
    // A ring's edges, and a door or a window at one of its door points, are drawn by its own drawables, in the curve (render/rings.js, docs/50 section 4).
    if (t.n && !map.drawnByRing(t.n) && !(cliffs.cliffWallOf(t.n) && cliffHidden(tx, ty, "n", t.n))) {
      const far = map.tileAt(tx, ty - 1);
      const vis = visible.has(tileKey(tx, ty)) || visible.has(tileKey(tx, ty - 1));
      const bat = battlements.battlementOf(t.n);
      const stub = bat ? battlementFades(tx, ty, "n") : isNearWall(tx, ty, "n", playerRoom);
      out.push(makeWall(t.n, "n", tx, ty, vis, stub, null, stub && !bat ? wallCuts("n", tx, ty, playerRoom) : null, stackOf(tx, ty, "n")));
    }
    if (t.w && !map.drawnByRing(t.w) && !(cliffs.cliffWallOf(t.w) && cliffHidden(tx, ty, "w", t.w))) {
      const far = map.tileAt(tx - 1, ty);
      const vis = visible.has(tileKey(tx, ty)) || visible.has(tileKey(tx - 1, ty));
      const bat = battlements.battlementOf(t.w);
      const stub = bat ? battlementFades(tx, ty, "w") : isNearWall(tx, ty, "w", playerRoom);
      out.push(makeWall(t.w, "w", tx, ty, vis, stub, null, stub && !bat ? wallCuts("w", tx, ty, playerRoom) : null, stackOf(tx, ty, "w")));
    }
  }
  fillerDrawables(tiles, visible, playerRoom, out); // where a straight wall meets a ring, its picture run on to the curve (docs/50 section 3)
}

// `ghostTint` draws the wall as the placement ghost (docs/13): tinted, unlit, and unfogged.
// A wall the dead strike gives one small jolt for each strike (Michael, 2026-10-18, #174: "simmer it down"): the host says so for each
// strike (`wallStruck`, an fx for a guest), and for a tenth of a second it moves a pixel and settles, in sim time.
const shakes = new Map(); // "tx,ty,edge" -> sim ms until
const SHAKE_MS = 110;
export function shakeFence(tx, ty, edge) {
  shakes.set(`${tx},${ty},${edge}`, loop.simTime() * 1000 + SHAKE_MS);
}
function shakeOffset(tx, ty, edge) {
  if (!shakes.size) return 0;
  const k = `${tx},${ty},${edge}`;
  const until = shakes.get(k);
  if (until === undefined) return 0;
  const now = loop.simTime() * 1000;
  if (now >= until) {
    shakes.delete(k);
    return 0;
  }
  return Math.round(((until - now) / SHAKE_MS) * 1.4); // a pixel, once, settling
}

export function makeWall(wall, edge, tx, ty, vis, stub, ghostTint = null, cuts = null, stack = null) {
  const covered = !!(stack && stack.covered);
  const lift = stack && stack.onWall ? STACK_BIAS : 0;
  const under = !!(stack && stack.under); // under a floor of the storey above: drawn without its cap
  const sheet = sheetFor(wall); // the wall's own sheet, or its shut leaves recoloured and its open ones another wood's (#334)
  if (sheet.wall && sheet.wall.battlement) return makeBattlement(wall, sheet, edge, tx, ty, vis, stub, ghostTint, stack);
  const variant = wallVariant(wall);
  const gateSheet = wall.gate && sheet.wall ? gateSlice(sheet, edge === "n" ? "north" : "west", wall.gate.i) : null; // a castle gate edge draws its window of the gate's picture
  const sortDepth = edge === "n" ? tx + ty - 0.5 : tx - 0.5 + ty;
  const p = iso.toScreen(tx, ty);
  const x = Math.round(p.x) + shakeOffset(tx, ty, edge);
  const y = Math.round(p.y);
  const h = sheet.wallHeight || 96;
  const T = sheet.thickness || WALL_T;
  // `stub` is a near wall while the player is inside: drawn translucent (the low
  // stub mode retired with the drawn walls, docs/17).
  const faded = stub;
  const alpha = faded ? NEAR_WALL_ALPHA : 1;
  const flags = ghostTint ? GHOST_FLAGS() : vis ? gl.FLAG_NOFOG : 0;
  const color = sheet.color || "#888";
  // The edge on screen, a to b. The face's light is read along its foot a
  // little inside the tile it looks onto, never on the boundary itself, where
  // the sample would fall into the room behind.
  const a = edge === "n" ? [x, y - iso.HH] : [x - iso.HW, y];
  const b = edge === "n" ? [x + iso.HW, y] : [x, y - iso.HH];
  const wa = edge === "n" ? [tx - 0.4, ty - 0.2] : [tx - 0.2, ty - 0.4];
  const wb = edge === "n" ? [tx + 0.4, ty - 0.2] : [tx - 0.2, ty + 0.4];
  // Its depth (docs/51 section 3): the wall's true near face, a plane, and past its camera-side end the end's own face (depth.wallSurface);
  // its cap redrawn on the sky, its boards, leaves, shutters, hangings, bracket, and flame on it, each a step nearer than the one before.
  // Where a drawn post stands at its camera-side end (the vertex east of a north wall, south of a west one), centred on the vertex
  // (Tp / 2 + 1) units each way, its face reaches 2 (Tp / 2 + 1) - T / 2 back along the wall from the face's end, and the ridge moves
  // back with it, a unit further (the post's last column clear of the tie at the ridge); at a plain joint it moves back two units, under the next segment's first column (its outline, which the sort drew
  // over this one's last), and no further, so what stands just inside the wall there stays behind it.
  const endPost = edge === "n" ? postAt(tx + 1, ty, null) : postAt(tx, ty + 1, null);
  const postSheet = endPost && endPost.sheet.wall && endPost.sheet.wall.post ? endPost.sheet : null;
  // A cliff (art round 10): its face variant or its back, the back on its far face's plane (its lip seen from behind lies behind the
  // plateau's floor), a face seen cut along its edge line under that floor.
  const cliff = sheet.wall && cliffs.cliffWallOf(wall) ? cliffArt(sheet, wall, edge, tx, ty, x, y, h) : null;
  const face = cliff && cliff.back ? depth.wallSurface(edge, tx, ty, -T, 2 / depth.UNIT) : depth.wallSurface(edge, tx, ty, T, (postSheet ? (postSheet.thickness || WALL_T) + 3 - T / 2 : 2) / depth.UNIT);
  const br = wall.bracket && wall.bracket.side > 0 ? wall.bracket : null;
  let bx = 0;
  let by = 0;
  if (br) {
    bx = Math.round((a[0] + b[0]) / 2);
    by = Math.round((a[1] + b[1]) / 2 - Math.min(BRACKET_UP, h * 0.5));
    if (sheet.wall) {
      // A drawn wall is centred on its edge, so its near face is half the
      // thickness nearer the camera: the bracket sits on that face.
      bx += edge === "n" ? -Math.round(T / 2) : Math.round(T / 2);
      by += Math.round(T / 4);
    }
  }
  const drawable = {
    key: sortDepth * 1000,
    kind: "wall",
    wall: { tx, ty, edge }, // check("depth") finds its drawable
    stack, // the storeys' seam (check("storeys") reads it)
    faded: !!stub, // a near wall drawn translucent (check("storeys") reads it)
    gateLeaf: null, // a castle gate's edge: the portcullis frame drawn at its last emit (check("gates") reads it)
    emit() {
      gl.surface(face, lift, DEPTH_ROOM.wall);
      const tint = ghostTint || [1, 1, 1, alpha];
      if (sheet.wall) {
        emitDrawnWall(gateSheet || sheet, wall, variant, edge, tx, ty, x, y, h, T, { wa, wb, tint, flags, faded, ghost: !!ghostTint, cuts, face, covered, under: under && !cliff, frameName: cliff ? cliff.frameName : gateSheet ? `${edge === "n" ? "north" : "west"}_gate` : null, clip: cliff && !ghostTint ? cliff.clip : null, gate: gateSheet ? sheet : null, note: (name) => { drawable.gateLeaf = name; } });
      } else {
      // Swung leaves only for a whole, open, unboarded leaf.
      const open = !wall.broken && !map.boarded(wall) && (wall.kind === "door" ? wall.open : wall.kind === "window" && wall.shutter === "open");
      const outside = open ? map.outsideSign(tx, ty, edge) : 0;
      const leafOpts = { world: [tx, ty], flags, alpha, face, tx, ty };
      if (open && outside < 0) emitSwungLeaves(wall, edge, x, y, h, outside, leafOpts);
      // The face: the frame, its bottom corners on the edge's ends so the
      // light is read along the foot and height climbs to the top.
      const name = edge === "n" ? `north_${variant}_0` : `west_${variant}_0`;
      const anchor = edge === "n" ? sheet.anchor : sheet.anchorWest;
      const f = sheet.frames[name];
      gl.layer(L_FACE);
      if (f) {
        gl.quad(x - anchor[0], y - anchor[1], f[2], f[3], gl.frameUV(sheet, name), { world: [wa, wb, wb, wa], heights: [f[3], f[3], 0, 0], color: tint, flags });
      }
      gl.layer(L_ON);
      // The top strip, on the sky.
      const top = edge === "n"
        ? [[x, y - iso.HH - h], [x + iso.HW, y - h], [x + iso.HW + T, y - T / 2 - h], [x + T, y - iso.HH - T / 2 - h]]
        : [[x - iso.HW, y - h], [x, y - iso.HH - h], [x - T, y - iso.HH - h - T / 2], [x - iso.HW - T, y - h - T / 2]];
      if (!covered) gl.poly(top, ghostTint ? ghostColor(shade(color, 1.18), ghostTint) : gl.rgb(shade(color, 1.18), alpha), { world: [tx, ty], flags: flags | gl.FLAG_SKY });
      if (open && outside > 0) emitSwungLeaves(wall, edge, x, y, h, outside, leafOpts);
      }
      gl.layer(L_OVER);
      if (wall.hangings && !ghostTint) emitHangings(wall, edge, tx, ty, { tint, flags }); // paintings, right after their segment, before its bracket (their outline a layer under them, over the face)
      if (br) emitBracket(br, bx, by, [tx, ty], alpha, flags, vis, ghostTint, tx + ty);
      gl.layer(null);
    },
  };
  return drawable;
}

// A bracket at screen (bx, by) on the current surface: its iron, and a lantern's cage and pane or a torch and its flame, lit from the world
// point `world` (a wall's tile; a ring's point on the curve, render/rings.js). Its layers are the wall's: L_ON, L_OVER, L_FLAME.
export function emitBracket(br, bx, by, world, alpha, flags, vis, ghostTint = null, seed = 0) {
  const opts = { world, flags };
  gl.layer(L_ON); // the bracket's iron, and a lantern's cage and pane, side by side
  gl.poly([[bx - 2, by - 3], [bx + 2, by - 3], [bx + 2, by + 4], [bx - 2, by + 4]], gl.rgb(METAL, alpha), opts);
  gl.poly([[bx - 4, by - 1], [bx + 4, by - 1], [bx + 4, by + 1], [bx - 4, by + 1]], gl.rgb(METAL, alpha), opts);
  if (br.lantern) {
    // The lantern (#156): an iron cage with a lit pane hanging at the bracket, steady and unlit-drawn like a flame.
    gl.poly([[bx - 4, by - 17], [bx + 4, by - 17], [bx + 4, by - 15], [bx - 4, by - 15]], gl.rgb(METAL, alpha), opts);
    gl.poly([[bx - 4, by - 15], [bx - 3, by - 15], [bx - 3, by - 4], [bx - 4, by - 4]], gl.rgb(METAL, alpha), opts);
    gl.poly([[bx + 3, by - 15], [bx + 4, by - 15], [bx + 4, by - 4], [bx + 3, by - 4]], gl.rgb(METAL, alpha), opts);
    // Lit, the pane glows unlit-drawn; put out (docs/43, section 3), it is dark glass, lit by the scene like the iron.
    if (br.lit !== false) gl.poly([[bx - 3, by - 15], [bx + 3, by - 15], [bx + 3, by - 4], [bx - 3, by - 4]], gl.rgb("#e6b45a", alpha), { world, flags: flags | gl.FLAG_UNLIT });
    else gl.poly([[bx - 3, by - 15], [bx + 3, by - 15], [bx + 3, by - 4], [bx - 3, by - 4]], gl.rgb("#3c3a3e", alpha), opts);
  } else if (br.torch) {
    // The torch over the iron: its stick from under its head (the head covered the stick's top two rows, the same pixels), then the
    // head, side by side; its flame over the head.
    gl.layer(L_OVER);
    gl.poly([[bx - 1, by - 12], [bx + 2, by - 12], [bx + 2, by - 1], [bx - 1, by - 1]], gl.rgb(WOOD, alpha), opts);
    gl.poly([[bx - 2, by - 17], [bx + 3, by - 17], [bx + 3, by - 12], [bx - 2, by - 12]], gl.rgb("#3a2a22", alpha), opts);
    gl.layer(L_FLAME);
    if (vis && br.lit !== false) frameQuad(getSheet("flame"), `flame_${flameFrame(seed)}`, bx, by - 15, { world, flags: gl.FLAG_UNLIT | gl.FLAG_NOFOG, ...(ghostTint ? { color: ghostTint } : {}) }); // a refused ghost's flame takes its tint
  }
}
