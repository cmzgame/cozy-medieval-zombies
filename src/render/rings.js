// Round rooms drawn (docs/50 section 4): a ring is two drawables, its far half (the inner face the camera sees, opaque) and its near half (the
// outer face, faded with the near walls while the player is inside), each a run of short segments along the arc, every segment a vertical
// plane through its own two points on the ground (render/depth.js planeThrough), so the depth buffer sorts the curve per pixel against the
// dead, the props, and the trees (docs/51) and never as one picture at one depth. The art is generated, the placeholder the engine makes for
// every new picture: the material's straight face (wall_stone's north face) wrapped round each segment, shaded by the way the segment looks
// (lit from the top left, art/01), its cap on the sky, and a footing on the ground over the stepped tiles' corners. Light is read along
// each segment's foot from the tile it looks onto: a stepped tile for the inner face, outside the steps for the outer.

import * as iso from "../iso.js";
import * as map from "../map.js";
import * as gl from "../gl.js";
import * as round from "../round.js";
import { getSheet } from "../assets.js";
import { shade } from "../render-util.js";
import { tileKey } from "../visibility.js";
import { WALL_T, BRACKET_UP } from "../placeholders.js";
import { NEAR_WALL_ALPHA, DEPTH_ROOM } from "./scene.js";
import * as depth from "./depth.js";
import { emitBracket } from "./walls.js";
import { ghostColor } from "./props.js";

export const SEGMENTS = 48; // the drawn curve's segments round the whole ring (7.5 degrees each); the bodies' chords are coarser (round.js)
const FACE = "north_plain"; // the straight face wrapped round the curve
const FACE_COLS = [4, 28]; // the columns of its 32 the wrap takes
const DEG = Math.PI / 180;

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
  const drawn = new Set();
  for (const [tx, ty] of tiles) drawn.add(tileKey(tx, ty));
  for (const r of rings) {
    if (!round.shape(r.x0, r.y0, r.n).stepped.some(([x, y]) => drawn.has(tileKey(x, y)))) continue;
    const room = map.roomAt(r.x0 + (r.n - 1) / 2, r.y0 + (r.n - 1) / 2, r.layer);
    const faded = playerRoom > 0 && room === playerRoom;
    out.push(makeHalf(r, false, visible, false, null));
    out.push(makeHalf(r, true, visible, faded, null));
  }
}

// A ring as the placement ghost (a palette build): both halves washed in the ghost's tint, unlit.
export function emitRingGhost(r, tint, flags) {
  makeHalf(r, false, null, false, tint, flags).emit();
  makeHalf(r, true, null, false, tint, flags).emit();
}

// A torch's ghost on a ring's edge (Place torch, #523): the bracket and the torch at the edge's point on the curve, washed in the tint.
export function emitTorchGhost(tx, ty, edge, lit, tint) {
  const wall = map.tileAt(tx, ty)[edge];
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

// One half of a ring: its segments' faces, its cap, its footing (with the far half), and the brackets on its faces.
function makeHalf(r, near, visible, faded, ghostTint, ghostFlags = 0) {
  const s = round.shape(r.x0, r.y0, r.n);
  const sheet = getSheet(r.sprite);
  const h = sheet.wallHeight || 96;
  const T = sheet.thickness || WALL_T;
  const t = T / 2 / depth.UNIT; // half the thickness in tiles: the faces are this far either side of the curve
  const out = near ? 1 : -1; // the face the camera sees: the outer on the near half, the inner on the far
  const Rf = s.R + out * t;
  // A door or a window at a door point is drawn by render/walls.js as itself, straight on its edge, with its frame at each end: the curve
  // leaves a gap there from one end of the edge to the other (atan(0.5 / R) either side of the point), or an open door would show the ring
  // through it. The door points' angles in the order round.js names them (north, east, south, west).
  const gaps = [];
  const half = Math.atan(0.5 / s.R);
  const doorAngles = [270, 0, 90, 180];
  s.doors.forEach(([tx, ty, e], k) => {
    const w = ghostTint ? null : map.tileAt(tx, ty, r.layer)[e];
    if (!w || w.kind === "wall") return;
    const c = doorAngles[k] * DEG;
    gaps.push([c - half, c + half], [c - half + 2 * Math.PI, c + half + 2 * Math.PI]);
  });
  const segs = [];
  for (let i = 0; i < SEGMENTS; i++) {
    let a0 = (i * 360 / SEGMENTS) * DEG;
    let a1 = ((i + 1) * 360 / SEGMENTS) * DEG;
    if (nearHalf((a0 + a1) / 2) !== near) continue;
    let gone = false;
    for (const [g0, g1] of gaps) {
      if (a1 <= g0 || a0 >= g1) continue;
      if (a0 >= g0 && a1 <= g1) gone = true;
      else if (a0 < g0) a1 = g0;
      else a0 = g1;
    }
    if (!gone && a1 - a0 > 1e-4) segs.push([a0, a1]);
  }
  const alpha = faded ? NEAR_WALL_ALPHA : 1;
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
      let first = true;
      if (!near && !ghostTint) {
        // The footing over the steps' corners, on the ground (the flat pass): wider at the diagonals, where the steps stand furthest off the curve.
        gl.withPass(gl.PASS_FLAT, () => {
          for (let i = 0; i < SEGMENTS; i++) {
            const a0 = (i * 360 / SEGMENTS) * DEG;
            const a1 = ((i + 1) * 360 / SEGMENTS) * DEG;
            const w0 = 0.12 + 0.32 * Math.abs(Math.sin(2 * a0));
            const w1 = 0.12 + 0.32 * Math.abs(Math.sin(2 * a1));
            const pts = [ground(a0, s.R - w0), ground(a1, s.R - w1), ground(a1, s.R + w1), ground(a0, s.R + w0)];
            gl.poly(pts.map(scr), gl.rgb(shade(color, 0.62), 1), { world: pts.map(([gx, gy]) => [gx, gy]), flags: visible && visible.has(tileKey(Math.round(pts[0][0]), Math.round(pts[0][1]))) ? gl.FLAG_NOFOG : 0 });
          }
        });
      }
      for (const [a0, a1] of segs) {
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
        gl.layer(0);
        if (uvF) {
          // Which columns of the straight face this segment takes: varied along the ring, and never the face's first or last few, where the
          // straight picture draws its end against the next segment's (a light line down every joint when wrapped round the curve).
          const w = Math.min(FACE_COLS[1] - FACE_COLS[0], B[0] - A[0]);
          const span = Math.floor(FACE_COLS[1] - FACE_COLS[0] - w);
          const c0 = FACE_COLS[0] + (span > 0 ? (Math.round(amid / DEG) * 7) % (span + 1) : 0);
          const foot = (c) => [uvF[0] + an[0] + c - T / 2, uvF[1] + an[1] - iso.HH + T / 4 + c / 2];
          const fa = foot(c0);
          const fb = foot(c0 + w);
          gl.texQuad([A, B, [B[0], B[1] - h], [A[0], A[1] - h]], [fa, fb, [fb[0], fb[1] - h], [fa[0], fa[1] - h]], { world: [wa, wb, wb, wa], heights: [0, 0, h, h], color: tint, flags, page: uvF[4] });
        } else {
          gl.poly([A, B, [B[0], B[1] - h], [A[0], A[1] - h]], ghostTint ? ghostColor(shade(color, k), ghostTint) : gl.rgb(shade(color, k), alpha), { world: [wa, wb, wb, wa], heights: [0, 0, h, h], flags });
        }
        if (!faded) {
          // The cap: the band between the faces at the wall's height, on the sky.
          gl.layer(1);
          const cap = [ground(a0, s.R - t), ground(a1, s.R - t), ground(a1, s.R + t), ground(a0, s.R + t)].map(scr).map(([x, y]) => [x, y - h]);
          gl.poly(cap, ghostTint ? ghostColor(shade(color, 1.18), ghostTint) : gl.rgb(shade(color, 1.18), 1), { world: [lm[0], lm[1]], flags: flags | gl.FLAG_SKY });
        }
      }
      if (!ghostTint) emitBrackets(r, s, near, visible, alpha, Rf, scr);
      gl.layer(null);
    },
  };
}

// The torches and lanterns on this half's faces, each at its point on the curve (map.ringFace), on its own segment's plane.
function emitBrackets(r, s, near, visible, alpha, Rf, scr) {
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
    emitBracket(br, Math.round(px), Math.round(py - BRACKET_UP), map.bracketPos({ tx, ty, edge, wall, layer: r.layer }), alpha, vis ? gl.FLAG_NOFOG : 0, vis, null, tx + ty);
  }
}
