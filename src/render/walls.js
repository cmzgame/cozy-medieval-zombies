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
import { NEAR_WALL_ALPHA, DEPTH_BIAS, flameFrame, frameQuad } from "./scene.js";
import * as depth from "./depth.js"; // the walls' faces, caps, leaves, and posts on their true planes (docs/51)
import { emitHangings } from "./paintings.js"; // what hangs on a wall's face (#326)
import { sheetFor } from "../woods.js"; // a door or window of another wood than its wall (#334)

// ---- walls ----

// The frame for a wall's state. Boards on the visible (near) face draw as the
// boarded variants; boards on the far face are not seen, and a broken leaf is
// the open frame with nothing in it (docs/09).
function wallVariant(wall) {
  const n = wall.boards.near.length;
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
  gl.poly(quad, gl.rgb(shade(WOOD, shadeF), opts.alpha), opts);
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

function emitDrawnWall(sheet, wall, variant, edge, tx, ty, x, y, h, T, o) {
  const side = edge === "n" ? "north" : "west";
  const { art: settled, boards, n } = drawnVariant(variant);
  const parts0 = sheet.wall.parts ? getSheet(sheet.wall.parts) : null;
  const mid = !o.ghost && !wall.broken && !map.boarded(wall) ? swingLeaf(wall, edge, tx, ty, side, parts0, !!wall.open) : null;
  const art = mid ? "door_open" : settled; // mid-swing: the open frame (its posts and hinge) with the moving leaf after it
  const name = `${side}_${art}`;
  const f = sheet.frames[name];
  if (!f) return;
  const anchor = sheet.frameAnchors[name] || sheet.anchor;
  const parts = sheet.wall.parts ? getSheet(sheet.wall.parts) : null;
  const open = !wall.broken && !map.boarded(wall) && (wall.kind === "door" ? wall.open : wall.kind === "window" && wall.shutter === "open");
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
  if (outside < 0 && o.faded) for (const p of leaves("_far")) leafQuad(p, true);
  if (o.faded && o.cuts && (o.cuts.near != null || o.cuts.far != null)) emitCutWall(sheet, name, edge, x, y, h, T, o, o.cuts);
  else wallPartQuad(sheet, name, x, y, o);
  if (!o.faded && !o.ghost) {
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
}

function isNearWall(tx, ty, edge, playerRoom) {
  if (playerRoom <= 0) return false;
  const t = map.tileAt(tx, ty);
  const far = edge === "n" ? map.tileAt(tx, ty - 1) : map.tileAt(tx - 1, ty);
  return far.room === playerRoom && t.room !== playerRoom;
}

// The post at the top vertex of (tx, ty), if one stands there: where walls meet
// at a corner, end, or junction (docs/02), or where the material changes along
// a straight run (docs/17: the three thicknesses leave a step in the cap).
// `sheet` is the heavier material's (stone over log over wood); `near` is
// whether it is translucent with a near wall.
export function postAt(tx, ty, playerRoom) {
  const nE = map.tileAt(tx, ty).n;
  const nW = map.tileAt(tx - 1, ty).n;
  const wS = map.tileAt(tx, ty).w;
  const wN = map.tileAt(tx, ty - 1).w;
  if (!nE && !nW && !wS && !wN) return null;
  if (nE && nW && !wS && !wN && nE.sprite === nW.sprite) return null;
  if (wS && wN && !nE && !nW && wS.sprite === wN.sprite) return null;
  const walls = [nE, nW, wS, wN].filter(Boolean);
  const rank = (s) => ({ stone: 3, log: 2, wood: 1 })[s.wall ? s.wall.material : s.pattern === "brick" ? "stone" : s.pattern === "log" ? "log" : "wood"] || 0;
  let sheet = getSheet(walls[0].sprite);
  for (const w of walls) {
    const s = getSheet(w.sprite);
    if (rank(s) > rank(sheet)) sheet = s;
  }
  // Translucent only when every wall it joins is a near wall (the front corner);
  // where a near wall meets a far one the post stays solid with the far wall
  // (Michael's designer, 2026-10-12: a ghost post over a solid wall's end read
  // as a pale column).
  const near = [[nE, tx, ty, "n"], [nW, tx - 1, ty, "n"], [wS, tx, ty, "w"], [wN, tx, ty - 1, "w"]]
    .every(([w, x, y, e]) => !w || isNearWall(x, y, e, playerRoom));
  return { sheet, near };
}

// Corner posts.
export function postDrawables(tiles, visible, playerRoom, out) {
  for (const [tx, ty] of tiles) {
    const post = postAt(tx, ty, playerRoom);
    if (!post) continue;
    const vis = visible.has(tileKey(tx, ty)) || visible.has(tileKey(tx - 1, ty)) || visible.has(tileKey(tx, ty - 1)) || visible.has(tileKey(tx - 1, ty - 1));
    out.push(makePost(tx, ty, post.sheet, vis, post.near));
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
    const c = pts.map(([px, py]) => [Math.min(R, Math.max(L, px)), Math.min(B, Math.max(Tp, py))]);
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

function makePost(tx, ty, sheet, vis, near) {
  const p = iso.toScreen(tx - 0.5, ty - 0.5);
  const x = Math.round(p.x);
  const y = Math.round(p.y);
  const h = sheet.wallHeight || 72;
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
  // Its depth (docs/51 section 3): the two faces of its square, split at its near corner's column, a little over the walls meeting at it.
  // A drawn post is centred on the vertex, a pixel proud of the wall (its cap below); the generated one's square has the vertex for its
  // near corner.
  const hs = sheet.wall && sheet.wall.post ? (T / 2 + 1) / depth.UNIT : 0;
  const surf = depth.ridge(tx - 0.5 + hs, ty - 0.5 + hs);
  return {
    key: (tx + ty - 1) * 1000 + 0.5,
    kind: "wall",
    post: { tx, ty }, // check("depth") finds its drawable
    emit() {
      if (hidden) return;
      gl.surface(surf, DEPTH_BIAS.post);
      if (sheet.wall && sheet.wall.post) {
        // The drawn post (docs/17), anchored on the vertex itself, its cap redrawn on the sky.
        const ps = getSheet(sheet.wall.post);
        const pf = ps.frames.idle_0;
        if (pf) {
          gl.quad(x - ps.anchor[0], y - ps.anchor[1], pf[2], pf[3], gl.frameUV(ps, "idle_0"), { world: [[tx - 1, ty], [tx, ty - 1], [tx, ty - 1], [tx - 1, ty]], heights: [pf[3], pf[3], 0, 0], color: [1, 1, 1, alpha], flags });
          if (!faded) {
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
      gl.poly([D, A, up(A), up(D)], gl.rgb(shade(color, 0.5), alpha), { world: [tx - 1, ty], heights: [0, 0, h, h], flags });
      gl.poly([A, B, up(B), up(A)], gl.rgb(shade(color, 0.62), alpha), { world: [tx, ty - 1], heights: [0, 0, h, h], flags });
      gl.poly([up(A), up(B), up(C), up(D)], gl.rgb(shade(color, 1.18), alpha), { world: [tx, ty], flags: flags | gl.FLAG_SKY });
    },
  };
}

export function wallDrawables(tiles, visible, playerRoom, out) {
  for (const [tx, ty] of tiles) {
    const t = map.tileAt(tx, ty);
    if (t.n) {
      const far = map.tileAt(tx, ty - 1);
      const vis = visible.has(tileKey(tx, ty)) || visible.has(tileKey(tx, ty - 1));
      const stub = playerRoom > 0 && far.room === playerRoom && t.room !== playerRoom;
      out.push(makeWall(t.n, "n", tx, ty, vis, stub, null, stub ? wallCuts("n", tx, ty, playerRoom) : null));
    }
    if (t.w) {
      const far = map.tileAt(tx - 1, ty);
      const vis = visible.has(tileKey(tx, ty)) || visible.has(tileKey(tx - 1, ty));
      const stub = playerRoom > 0 && far.room === playerRoom && t.room !== playerRoom;
      out.push(makeWall(t.w, "w", tx, ty, vis, stub, null, stub ? wallCuts("w", tx, ty, playerRoom) : null));
    }
  }
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

export function makeWall(wall, edge, tx, ty, vis, stub, ghostTint = null, cuts = null) {
  const sheet = sheetFor(wall); // the wall's own sheet, or its shut leaves recoloured and its open ones another wood's (#334)
  const variant = wallVariant(wall);
  const sortDepth = edge === "n" ? tx + ty - 0.5 : tx - 0.5 + ty;
  const p = iso.toScreen(tx, ty);
  const x = Math.round(p.x) + shakeOffset(tx, ty, edge);
  const y = Math.round(p.y);
  const h = sheet.wallHeight || 72;
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
  // Its depth (docs/51 section 3): the wall's true near face, a plane; its cap redrawn on the sky, its boards, leaves, shutters, hangings,
  // bracket, and flame on it, each a step nearer than the one before.
  const face = depth.wallFace(edge, tx, ty, T);
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
  return {
    key: sortDepth * 1000,
    kind: "wall",
    wall: { tx, ty, edge }, // check("depth") finds its drawable
    emit() {
      gl.surface(face, 0);
      const tint = ghostTint || [1, 1, 1, alpha];
      if (sheet.wall) {
        emitDrawnWall(sheet, wall, variant, edge, tx, ty, x, y, h, T, { wa, wb, tint, flags, faded, ghost: !!ghostTint, cuts, face });
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
      if (f) {
        gl.quad(x - anchor[0], y - anchor[1], f[2], f[3], gl.frameUV(sheet, name), { world: [wa, wb, wb, wa], heights: [f[3], f[3], 0, 0], color: tint, flags });
      }
      // The top strip, on the sky.
      const top = edge === "n"
        ? [[x, y - iso.HH - h], [x + iso.HW, y - h], [x + iso.HW + T, y - T / 2 - h], [x + T, y - iso.HH - T / 2 - h]]
        : [[x - iso.HW, y - h], [x, y - iso.HH - h], [x - T, y - iso.HH - h - T / 2], [x - iso.HW - T, y - h - T / 2]];
      gl.poly(top, ghostTint ? ghostColor(shade(color, 1.18), ghostTint) : gl.rgb(shade(color, 1.18), alpha), { world: [tx, ty], flags: flags | gl.FLAG_SKY });
      if (open && outside > 0) emitSwungLeaves(wall, edge, x, y, h, outside, leafOpts);
      }
      if (wall.hangings && !ghostTint) emitHangings(wall, edge, tx, ty, { tint, flags }); // paintings, right after their segment, before its bracket
      if (br) {
        const opts = { world: [tx, ty], flags };
        gl.poly([[bx - 2, by - 3], [bx + 2, by - 3], [bx + 2, by + 4], [bx - 2, by + 4]], gl.rgb(METAL, alpha), opts);
        gl.poly([[bx - 4, by - 1], [bx + 4, by - 1], [bx + 4, by + 1], [bx - 4, by + 1]], gl.rgb(METAL, alpha), opts);
        if (br.lantern) {
          // The lantern (#156): an iron cage with a lit pane hanging at the bracket, steady and unlit-drawn like a flame.
          gl.poly([[bx - 4, by - 17], [bx + 4, by - 17], [bx + 4, by - 15], [bx - 4, by - 15]], gl.rgb(METAL, alpha), opts);
          gl.poly([[bx - 4, by - 15], [bx - 3, by - 15], [bx - 3, by - 4], [bx - 4, by - 4]], gl.rgb(METAL, alpha), opts);
          gl.poly([[bx + 3, by - 15], [bx + 4, by - 15], [bx + 4, by - 4], [bx + 3, by - 4]], gl.rgb(METAL, alpha), opts);
          // Lit, the pane glows unlit-drawn; put out (docs/43, section 3), it is dark glass, lit by the scene like the iron.
          if (br.lit !== false) gl.poly([[bx - 3, by - 15], [bx + 3, by - 15], [bx + 3, by - 4], [bx - 3, by - 4]], gl.rgb("#e6b45a", alpha), { world: [tx, ty], flags: flags | gl.FLAG_UNLIT });
          else gl.poly([[bx - 3, by - 15], [bx + 3, by - 15], [bx + 3, by - 4], [bx - 3, by - 4]], gl.rgb("#3c3a3e", alpha), opts);
        } else if (br.torch) {
          gl.poly([[bx - 1, by - 14], [bx + 2, by - 14], [bx + 2, by - 1], [bx - 1, by - 1]], gl.rgb(WOOD, alpha), opts);
          gl.poly([[bx - 2, by - 17], [bx + 3, by - 17], [bx + 3, by - 12], [bx - 2, by - 12]], gl.rgb("#3a2a22", alpha), opts);
          if (vis && br.lit !== false) frameQuad(getSheet("flame"), `flame_${flameFrame(tx + ty)}`, bx, by - 15, { world: [tx, ty], flags: gl.FLAG_UNLIT | gl.FLAG_NOFOG });
        }
      }
    },
  };
}
