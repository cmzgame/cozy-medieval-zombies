// Round rooms drawn (docs/50 section 4): a ring is two drawables, its far half (the inner face the camera sees, opaque) and its near half (the
// outer face, its stretch over the room faded while the player is inside), each a run of short segments along the arc, every segment a vertical
// plane through its own two points on the ground (render/depth.js planeThrough), so the depth buffer sorts the curve per pixel against the
// dead, the props, and the trees (docs/51) and never as one picture at one depth. The art is generated, the placeholder the engine makes for
// every new picture: the material's straight face (wall_stone's north face) wrapped round each segment, shaded by the way the segment looks
// (lit from the top left, art/01), its cap on the sky (no footing on the ground: it showed past the wall, Michael's playtest, 2026-10-27),
// the openings at its door points cut in it and filled on the curve, with no straight frame. Light is read along
// each segment's foot from the tile it looks onto: a stepped tile for the inner face, outside the steps for the outer.

import * as iso from "../iso.js";
import * as map from "../map.js";
import * as gl from "../gl.js";
import * as round from "../round.js";
import { getSheet } from "../assets.js";
import { shade } from "../render-util.js";
import { tileKey } from "../visibility.js";
import { WALL_T, BRACKET_UP, DOOR_TOP, WINDOW_SILL, WINDOW_TOP, WOOD, METAL } from "../placeholders.js";
import { NEAR_WALL_ALPHA, DEPTH_ROOM, DEPTH_BIAS } from "./scene.js";
import * as depth from "./depth.js";
import { emitBracket } from "./walls.js";
import { ghostColor } from "./props.js";

export const SEGMENTS = 48; // the drawn curve's segments round the whole ring (7.5 degrees each); the bodies' chords are coarser (round.js)
const FACE = "north_plain"; // the straight face wrapped round the curve
const FACE_COLS = [4, 28]; // the columns of its 32 the wrap takes
const DEG = Math.PI / 180;
const DOOR_ANGLES = [270, 0, 90, 180]; // the door points round the centre, in round.js's order (north, east, south, west)

// Whether a segment centred at angle `a` (radians, from +x toward +y) is on the near half: its outward normal has x + y > 0, toward the camera.
const nearHalf = (a) => Math.cos(a) + Math.sin(a) > 0;

// The ground point a face's light is read at: LIGHT_IN tiles in from the curve for the inner face, out from it for the outer. The light is
// read per pixel along the line between two such points, so the whole line must keep to one side of the steps: a circle LIGHT_IN in crosses
// only stepped tiles (their centres within R - LIGHT_IN + 0.71 < R), and one LIGHT_IN out only tiles off them, so the inner face takes its
// room's light and the outer the daylight, with no stripe of a pocket's daylight where a line cut a step's corner.
const LIGHT_IN = 0.75;
function lightPoint(s, a, out) {
  return [s.cx + Math.cos(a) * (s.R + out * LIGHT_IN), s.cy + Math.sin(a) * (s.R + out * LIGHT_IN)];
}

// The ring's two drawables for every ring on `layer` with a stepped tile among the tiles drawn (a storey's, less what the hiding rule hides:
// render/scene.js draws each layer lifted, docs/49 section 6).
export function ringDrawables(tiles, visible, playerRoom, out, layer = 0) {
  const rings = map.allRings(layer);
  if (!rings.length || !tiles.length) return;
  // The view's bounds first, with nothing made: a ring whose square lies outside them is not drawn (the valley's dovecote, every frame
  // away from it). On a storey the hiding rule thins the tiles, so a ring in the bounds there is drawn only if a stepped tile of it is drawn.
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
  let drawn = null;
  for (const r of rings) {
    if (r.x0 > x1 || r.y0 > y1 || r.x0 + r.n <= x0 || r.y0 + r.n <= y0) continue;
    if (layer !== 0) {
      if (!drawn) {
        drawn = new Set();
        for (const [tx, ty] of tiles) drawn.add(tileKey(tx, ty));
      }
      if (!round.shape(r.x0, r.y0, r.n).stepped.some(([x, y]) => drawn.has(tileKey(x, y)))) continue;
    }
    const room = map.roomAt(r.x0 + (r.n - 1) / 2, r.y0 + (r.n - 1) / 2, r.layer);
    const inside = playerRoom > 0 && room === playerRoom;
    out.push(makeHalf(r, false, visible, false, null));
    out.push(makeHalf(r, true, visible, inside, null));
  }
}

// A ring as the placement ghost (a palette build): both halves washed in the ghost's tint, unlit.
export function emitRingGhost(r, tint, flags) {
  makeHalf(r, false, null, false, tint, flags).emit();
  makeHalf(r, true, null, false, tint, flags).emit();
}

// A torch's ghost on a ring's edge (Place torch, #523): the bracket and the torch at the edge's point on the curve, washed in the tint.
export function emitTorchGhost(tx, ty, edge, lit, tint, layer = 0) {
  const wall = map.tileAt(tx, ty, layer)[edge];
  const r = map.ringOfWall(wall);
  const f = r && map.ringFace(tx, ty, edge, 1, r.layer, true, 0);
  if (!f) return;
  const s = round.shape(r.x0, r.y0, r.n);
  const T = getSheet(r.sprite).thickness || WALL_T;
  const p = iso.toScreen(s.cx + Math.cos(f.a) * (s.R + f.out * (T / 2 / depth.UNIT)), s.cy + Math.sin(f.a) * (s.R + f.out * (T / 2 / depth.UNIT)));
  gl.surface(depth.billboard(f.gx, f.gy), 0, DEPTH_ROOM.wall);
  emitBracket({ side: 1, torch: true, lit }, Math.round(p.x), Math.round(p.y - BRACKET_UP), [f.gx, f.gy], tint[3] || 1, gl.FLAG_NOFOG | gl.FLAG_UNLIT, true, tint, tx + ty);
  gl.layer(null);
}

// One half of a ring: its segments' faces with the openings at its door points cut in them and their leaves, shutters, or boards drawn on
// the curve, its cap (continuous over the openings), and the brackets on its faces. `inside`: the player is in the ring's room, so the near
// half's stretch standing between the room and the camera fades (Michael's playtest, 2026-10-27: the whole near half faded left its flanks
// ghostly), as a square room fades only its south and east walls; the flanks, which cover none of the room on screen, stay whole.
function makeHalf(r, near, visible, inside, ghostTint, ghostFlags = 0) {
  const s = round.shape(r.x0, r.y0, r.n);
  const sheet = getSheet(r.sprite);
  const h = sheet.wallHeight || 96;
  const T = sheet.thickness || WALL_T;
  const t = T / 2 / depth.UNIT; // half the thickness in tiles: the faces are this far either side of the curve
  const out = near ? 1 : -1; // the face the camera sees: the outer on the near half, the inner on the far
  const Rf = s.R + out * t;
  // The four door points' openings (round.js's order: north, east, south, west), each spanning the curve from one end of its edge to the other
  // (atan(0.5 / R) either side of the point). render/walls.js draws nothing at a ring's door point (Michael's playtest: the straight frame's
  // posts jutted out of the curve and showed as blocks on its cap): the curve runs on over the opening, a hole in its face between the
  // opening's heights, the leaf, the shutters, or the boards drawn in it on the curve. An empty door point (never left so: map.destroyWall) is
  // a hole the wall's whole height.
  const half = Math.atan(0.5 / s.R);
  const openings = [];
  s.doors.forEach(([tx, ty, e], k) => {
    const w = ghostTint ? null : map.tileAt(tx, ty, r.layer)[e];
    if (ghostTint || (w && w.kind === "wall")) return; // the ghost whole
    const c = DOOR_ANGLES[k] * DEG;
    for (const base of [c, c + 2 * Math.PI]) openings.push({ a0: base - half, a1: base + half, c: base, wall: w, tx, ty, edge: e });
  });
  const segs = []; // [a0, a1, the opening it lies in, or null]
  for (let i = 0; i < SEGMENTS; i++) {
    const a0 = (i * 360 / SEGMENTS) * DEG;
    const a1 = ((i + 1) * 360 / SEGMENTS) * DEG;
    if (nearHalf((a0 + a1) / 2) !== near) continue;
    const cuts = [a0, a1];
    for (const o of openings) for (const v of [o.a0, o.a1]) if (v > a0 + 1e-6 && v < a1 - 1e-6) cuts.push(v);
    cuts.sort((x, y) => x - y);
    for (let j = 0; j + 1 < cuts.length; j++) {
      const m = (cuts[j] + cuts[j + 1]) / 2;
      segs.push([cuts[j], cuts[j + 1], openings.find((o) => m > o.a0 && m < o.a1) || null]);
    }
  }
  // Which of the near half's segments fade with the player inside: those whose face stands over the room's inside on screen (its columns
  // within the inner face's silhouette), never a flank.
  const span = iso.HW * (s.R - t) * Math.SQRT2;
  const dxOf = (a) => iso.HW * Rf * (Math.cos(a) - Math.sin(a)); // a point on the face, its columns from the centre's
  const fades = (a0, a1) => near && inside && Math.min(Math.abs(dxOf(a0)), Math.abs(dxOf(a1))) < span;
  const color = sheet.color || "#7b7670";
  const key = (s.cx + s.cy + out * s.R) * 1000;
  const ground = (a, rad) => [s.cx + Math.cos(a) * rad, s.cy + Math.sin(a) * rad];
  const scr = ([gx, gy]) => {
    const p = iso.toScreen(gx, gy);
    return [p.x, p.y];
  };
  return {
    key,
    kind: "wall",
    ring: { id: r.id, near }, // check("round") and check("depth") find its drawables
    emit() {
      const uvF = sheet.wall ? gl.frameUV(sheet, FACE) : null;
      const an = sheet.wall ? (sheet.frameAnchors && sheet.frameAnchors[FACE]) || sheet.anchor : null;
      if (!near && !ghostTint) emitSkirt(r, s, color, t, visible); // the inside skirt, all the way round, with the far half (drawn first: it lies under everything)
      let first = true;
      for (const [a0, a1, o] of segs) {
        const g0 = ground(a0, Rf);
        const g1 = ground(a1, Rf);
        const plane = depth.planeThrough(g0[0], g0[1], g1[0], g1[1]);
        if (first) {
          gl.surface(plane, 0, DEPTH_ROOM.wall);
          first = false;
        } else gl.setPlane(plane);
        const amid = (a0 + a1) / 2;
        const l0 = lightPoint(s, a0, out);
        const l1 = lightPoint(s, a1, out);
        const lm = lightPoint(s, amid, out);
        const vis = !visible || visible.has(tileKey(Math.round(lm[0]), Math.round(lm[1])));
        const flags = ghostTint ? ghostFlags : vis ? gl.FLAG_NOFOG : 0;
        const alpha = fades(a0, a1) ? NEAR_WALL_ALPHA : 1;
        // The face looks along its outward normal (the inner face toward the centre); lit from the top left, darker as it turns to the right.
        const look = near ? amid : amid + Math.PI;
        const k = 1 - 0.18 * (1 - Math.cos(look - Math.PI / 2));
        const tint = ghostTint || [k, k, k, alpha];
        let A = scr(g0);
        let B = scr(g1);
        let [wa, wb] = [l0, l1];
        if (B[0] < A[0]) {
          [A, B] = [B, A];
          [wa, wb] = [wb, wa];
        }
        // The face between two heights (a band: all of it, or what an opening leaves above and below itself).
        let band;
        if (uvF) {
          // Which columns of the straight face this segment takes: varied along the ring, and never the face's first or last few, where the
          // straight picture draws its end against the next segment's (a light line down every joint when wrapped round the curve).
          const w = Math.min(FACE_COLS[1] - FACE_COLS[0], B[0] - A[0]);
          const room = Math.floor(FACE_COLS[1] - FACE_COLS[0] - w);
          const c0 = FACE_COLS[0] + (room > 0 ? (Math.round(amid / DEG) * 7) % (room + 1) : 0);
          const foot = (c) => [uvF[0] + an[0] + c - T / 2, uvF[1] + an[1] - iso.HH + T / 4 + c / 2];
          const fa = foot(c0);
          const fb = foot(c0 + w);
          band = (y0, y1) => gl.texQuad([[A[0], A[1] - y0], [B[0], B[1] - y0], [B[0], B[1] - y1], [A[0], A[1] - y1]], [[fa[0], fa[1] - y0], [fb[0], fb[1] - y0], [fb[0], fb[1] - y1], [fa[0], fa[1] - y1]], { world: [wa, wb, wb, wa], heights: [y0, y0, y1, y1], color: tint, flags, page: uvF[4] });
        } else {
          band = (y0, y1) => gl.poly([[A[0], A[1] - y0], [B[0], B[1] - y0], [B[0], B[1] - y1], [A[0], A[1] - y1]], ghostTint ? ghostColor(shade(color, k), ghostTint) : gl.rgb(shade(color, k), alpha), { world: [wa, wb, wb, wa], heights: [y0, y0, y1, y1], flags });
        }
        gl.layer(0);
        const hole = o ? holeOf(o.wall, h) : null;
        if (!hole) band(0, h);
        else {
          if (hole[0] > 0) band(0, hole[0]);
          if (hole[1] < h) band(hole[1], h);
          emitInOpening(o.wall, A, B, wa, wb, hole, near, flags, alpha);
        }
        // The cap: the band between the faces at the wall's height, on the sky, unbroken over the openings; faded with its face.
        gl.layer(1);
        const cap = [ground(a0, s.R - t), ground(a1, s.R - t), ground(a1, s.R + t), ground(a0, s.R + t)].map(scr).map(([x, y]) => [x, y - h]);
        gl.poly(cap, ghostTint ? ghostColor(shade(color, 1.18), ghostTint) : gl.rgb(shade(color, 1.18), alpha), { world: [lm[0], lm[1]], flags: flags | gl.FLAG_SKY });
      }
      // An open door's leaf, swung out from the hinge at its opening's end, standing square to the curve (as a door's leaf in a straight wall
      // stands square to it): drawn with the half its door point is on.
      for (const o of openings) {
        if (!o.wall || o.wall.kind !== "door" || !o.wall.open || o.wall.broken || map.boarded(o.wall) || o.c >= 2 * Math.PI || nearHalf(o.c) !== near) continue;
        const a = o.a1;
        const p0 = ground(a, s.R + t);
        const p1 = ground(a, s.R + t + 0.55);
        if (first) {
          gl.surface(depth.planeThrough(p0[0], p0[1], p1[0], p1[1]), 0, DEPTH_ROOM.wall);
          first = false;
        } else gl.setPlane(depth.planeThrough(p0[0], p0[1], p1[0], p1[1]));
        const [A0, A1] = [scr(p0), scr(p1)];
        const lp = lightPoint(s, a, 1);
        gl.layer(0);
        gl.poly([[A0[0], A0[1]], [A1[0], A1[1]], [A1[0], A1[1] - DOOR_TOP], [A0[0], A0[1] - DOOR_TOP]], gl.rgb(shade(WOOD, 0.9), 1), { world: [lp, lp, lp, lp], heights: [0, 0, DOOR_TOP, DOOR_TOP], flags: gl.FLAG_NOFOG });
        gl.layer(1);
        for (const f of [0.3, 0.7]) {
          const y = DOOR_TOP * f;
          gl.poly([[A0[0], A0[1] - y - 1.5], [A1[0], A1[1] - y - 1.5], [A1[0], A1[1] - y + 1.5], [A0[0], A0[1] - y + 1.5]], gl.rgb(METAL, 1), { world: lp, flags: gl.FLAG_NOFOG });
        }
      }
      if (!ghostTint) emitBrackets(r, s, near, visible, (a) => (fades(a - 0.01, a + 0.01) ? NEAR_WALL_ALPHA : 1), Rf, scr);
      gl.layer(null);
    },
  };
}

// The inside skirt (Michael, 2026-10-27: "add the inside stone skirt so the zigzag where the floor meets the grass is hidden"): a band of the
// wall's stone on the floor, from where the stepped floor ends round the curve (round.floorEnd, smoothed over half a tile) out to just under
// the inner face, so the steps' corners and the pockets' grass inside the curve are covered; never past the wall's line, so nothing of it
// shows outside. It runs on under a door point as a threshold (the floor reaches the curve there, so it is at its narrowest). On the floor
// plane: the flat pass on the ground, so bodies, furniture, and items stand over it; on a storey the lifted floor's own plane, a step over
// it. Lit by the room (its light read inside the floor's end, never on a pocket's grass), and outlined on its inner edge in the stone's dark.
const SKIRT_MIN = 0.08; // the least width inside the inner face, in tiles: a threshold at a door point
const SKIRT_TUCK = 0.04; // how far under the inner face it reaches
function emitSkirt(r, s, color, t, visible) {
  const ends = round.floorEnd(r.n);
  const K = round.SKIRT_SAMPLES;
  const inner = s.R - t;
  const at = (j, rad) => {
    const a = (j / K) * 2 * Math.PI;
    return [s.cx + Math.cos(a) * rad, s.cy + Math.sin(a) * rad];
  };
  const rIn = (j) => Math.min(ends[j % K] - 0.04, inner - SKIRT_MIN); // a hair inside where the floor ends, over its edge
  const light = (j) => at(j, Math.min(rIn(j), inner) - 0.6); // inside the floor's end: the room's light, not a pocket's
  const scr = ([gx, gy]) => {
    const p = iso.toScreen(gx, gy);
    return [p.x, p.y];
  };
  const flags = !visible || visible.has(tileKey(Math.round(s.cx), Math.round(s.cy))) ? gl.FLAG_NOFOG : 0;
  const lifted = !!r.layer;
  const draw = () => {
    if (lifted) gl.layer(0);
    for (let j = 0; j < K; j++) {
      const w = [light(j), light(j + 1), light(j + 1), light(j)];
      gl.poly([at(j, rIn(j)), at(j + 1, rIn(j + 1)), at(j + 1, inner + SKIRT_TUCK), at(j, inner + SKIRT_TUCK)].map(scr), gl.rgb(shade(color, 0.86), 1), { world: w, flags });
    }
    if (lifted) gl.layer(1);
    for (let j = 0; j < K; j++) {
      const w = [light(j), light(j + 1), light(j + 1), light(j)];
      gl.poly([at(j, rIn(j)), at(j + 1, rIn(j + 1)), at(j + 1, rIn(j + 1) + 0.03), at(j, rIn(j) + 0.03)].map(scr), gl.rgb(shade(color, 0.48), 1), { world: w, flags }); // the outline along its inner edge
    }
    if (lifted) gl.layer(null);
  };
  if (!lifted) {
    gl.withPass(gl.PASS_FLAT, draw);
    return;
  }
  // A storey: on the lifted floor's horizontal plane (render/storeys.js emitFloors), its two layers a step and two over the floor's picture.
  const o = iso.getOrigin();
  gl.surface({ A: 0, B: 2, C: -2 * o.y }, DEPTH_BIAS.liftedFloor + 0.25, 0.5);
  draw();
}

// The hole an opening at a door point makes in the curve's face, as [from, to] heights, or null: a door the door's height from the floor, a
// window between its sill and its top, an empty door point the wall's whole height.
function holeOf(wall, h) {
  if (!wall) return [0, h];
  if (wall.kind === "door") return [0, DOOR_TOP];
  if (wall.kind === "window") return [WINDOW_SILL, WINDOW_TOP];
  return null;
}

// What fills an opening's hole on this stretch of the curve (A to B on screen, lit from wa to wb): a shut door's planks and iron, shut
// shutters, the boards nailed across (on either side: the curve shows one face); an open, broken, or empty one leaves the hole.
function emitInOpening(wall, A, B, wa, wb, [y0, y1], near, flags, alpha) {
  if (!wall) return;
  const quad = (lo, hi, rgb) => gl.poly([[A[0], A[1] - lo], [B[0], B[1] - lo], [B[0], B[1] - hi], [A[0], A[1] - hi]], rgb, { world: [wa, wb, wb, wa], heights: [lo, lo, hi, hi], flags });
  const shut = !wall.broken && (wall.kind === "door" ? !wall.open : wall.shutter === "closed");
  gl.layer(0);
  if (shut) quad(y0, y1, gl.rgb(shade(WOOD, near ? 0.95 : 0.75), alpha));
  gl.layer(1);
  if (shut) for (const f of wall.kind === "door" ? [0.3, 0.7] : [0.5]) quad(y0 + (y1 - y0) * f - 1.5, y0 + (y1 - y0) * f + 1.5, gl.rgb(METAL, alpha));
  const n = Math.min(3, Math.max(wall.boards.near.length, wall.boards.far.length));
  for (let i = 0; i < n; i++) {
    const y = y0 + ((y1 - y0) * (i + 1)) / (n + 1);
    quad(y - 3, y + 3, gl.rgb(shade(WOOD, 1.1), alpha));
  }
}

// The torches and lanterns on this half's faces, each at its point on the curve (map.ringFace), on its own segment's plane.
function emitBrackets(r, s, near, visible, alphaAt, Rf, scr) {
  for (const [tx, ty, edge] of s.outline) {
    const wall = map.tileAt(tx, ty, r.layer)[edge];
    const br = wall && map.isRingWall(wall) && wall.bracket && wall.bracket.side > 0 ? wall.bracket : null;
    if (!br) continue;
    const f = map.ringFace(tx, ty, edge, 1, r.layer, true, 0);
    if (!f || (f.out > 0) !== near) continue;
    const g0 = [s.cx + Math.cos(f.a - 0.05) * Rf, s.cy + Math.sin(f.a - 0.05) * Rf];
    const g1 = [s.cx + Math.cos(f.a + 0.05) * Rf, s.cy + Math.sin(f.a + 0.05) * Rf];
    gl.setPlane(depth.planeThrough(g0[0], g0[1], g1[0], g1[1]));
    const [px, py] = scr([s.cx + Math.cos(f.a) * Rf, s.cy + Math.sin(f.a) * Rf]);
    const floor = map.bracketFloor({ tx, ty, edge, wall });
    const vis = !visible || visible.has(tileKey(floor[0], floor[1]));
    emitBracket(br, Math.round(px), Math.round(py - BRACKET_UP), map.bracketPos({ tx, ty, edge, wall, layer: r.layer }), alphaAt(f.a), vis ? gl.FLAG_NOFOG : 0, vis, null, tx + ty);
  }
}
