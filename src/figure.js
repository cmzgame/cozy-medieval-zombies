// The figure (docs/12-figure.md): the player and the dead drawn from a small
// rig, chunky and big-headed, outlined, two-toned, in eight facings, with
// clothes as rules on the body's parts and items held at the hand joints.
// Everything here is dev art generated at boot through the sprite pipeline;
// real art replaces a sheet, not this code.
//
// Coordinates. A body point is (l, d, h): lateral (the figure's right is
// positive), forward, height above the feet. A facing is a screen direction;
// a point projects to frame pixels (x right, y down) with iso foreshortening
// of the ground plane and a depth used to sort parts far to near. One body
// description therefore gives all eight facings and their draw order.
//
// Drawing. Each part is rasterised into a per-frame buffer without
// anti-aliasing: its silhouette dilated by one pixel in the outline colour,
// then its fill. Later parts cover earlier ones and add their own outline, so
// fused limbs still read, which is the look of Michael's references. A last
// pass lights every fill pixel on its upper-left edge and darkens it on its
// lower-right, which is the two-tone rule with the light from the upper left.

export const FW = 48;
export const FH = 72;
export const FEET_X = 24;
export const FEET_Y = 66;
const ISO = 0.5; // ground-plane foreshortening

export const FACINGS = ["s", "sw", "w", "nw", "n", "ne", "e", "se"];
const FACING_ANGLE = { e: 0, se: 45, s: 90, sw: 135, w: 180, nw: 225, n: 270, ne: 315 };

export const ANIMS = {
  idle: { fps: 2, loop: true, frames: 2 },
  walk: { fps: 8, loop: true, frames: 4 },
  attack: { fps: 12, loop: false, frames: 4, activeFrame: 1 },
  hurt: { fps: 10, loop: false, frames: 2 },
  die: { fps: 8, loop: false, frames: 4 },
  carry_idle: { fps: 2, loop: true, frames: 2 },
  carry_walk: { fps: 8, loop: true, frames: 4 },
};

// The chunky proportion (docs/12): the head about a third of the height,
// shoulders no wider than the head, limbs against the body.
export const BODY = {
  hip: 15, // heights above the feet
  shoulder: 28,
  neck: 30,
  head: 38, // centre; the top of the head is at about 48, so the head is two fifths of the height
  headRx: 8.5, // narrower than tall (Michael: too wide read as a scared frog)
  headRy: 9.5,
  shoulderL: 8, // lateral offsets; the shoulders stay inside the head's width
  hipL: 7,
  torsoD: 4, // forward half-thickness at the shoulders
  hipD: 3,
  legL: 3.5,
  legR: 3.3, // limb radii
  armR: 2.9,
  armLen: 14,
  handR: 2.7,
  footRx: 4,
  footRy: 2.4,
};

const OUTLINE = [26, 20, 32];
const WHITE = [255, 255, 255];

// ---- colour ----

export function hexToRgb(hex) {
  const h = hex.replace("#", "");
  const n = parseInt(h.length === 3 ? h.split("").map((c) => c + c).join("") : h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function tone(rgb, k) {
  // k > 0 lightens toward white, k < 0 darkens toward black.
  return rgb.map((c) => Math.round(k > 0 ? c + (255 - c) * k : c * (1 + k)));
}

// ---- projection ----

function facingVectors(facing) {
  const a = (FACING_ANGLE[facing] * Math.PI) / 180;
  const fx = Math.cos(a);
  const fy = Math.sin(a);
  return { fx, fy, rx: -fy, ry: fx };
}

function project(F, l, d, h) {
  return {
    x: l * F.rx + d * F.fx,
    y: -h + (l * F.ry + d * F.fy) * ISO,
    depth: l * F.ry + d * F.fy,
  };
}

// ---- a tiny rasteriser ----

class Frame {
  constructor() {
    this.rgb = new Uint8ClampedArray(FW * FH * 3);
    this.kind = new Uint8Array(FW * FH); // 0 empty, 1 outline, 2 fill (shaded), 3 flat
    this.part = new Uint8Array(FW * FH); // which body part a fill pixel belongs to, for shading
    this.mask = new Uint8Array(FW * FH); // the shape being built
    this.bbox = null;
  }

  clear() {
    this.rgb.fill(0);
    this.kind.fill(0);
    this.part.fill(0);
  }

  // ---- building a mask: begin, add shapes, then outline and fill it ----

  begin() {
    this.mask.fill(0);
    this.bbox = null;
  }

  grow(x0, y0, x1, y1) {
    const bx0 = Math.max(0, Math.floor(x0));
    const by0 = Math.max(0, Math.floor(y0));
    const bx1 = Math.min(FW - 1, Math.ceil(x1));
    const by1 = Math.min(FH - 1, Math.ceil(y1));
    const bb = this.bbox;
    this.bbox = bb ? [Math.min(bb[0], bx0), Math.min(bb[1], by0), Math.max(bb[2], bx1), Math.max(bb[3], by1)] : [bx0, by0, bx1, by1];
    return [bx0, by0, bx1, by1];
  }

  addTest(x0, y0, x1, y1, test) {
    const [bx0, by0, bx1, by1] = this.grow(x0, y0, x1, y1);
    const m = this.mask;
    for (let y = by0; y <= by1; y++) for (let x = bx0; x <= bx1; x++) if (test(x + 0.5, y + 0.5)) m[y * FW + x] = 1;
  }

  addCapsule(x0, y0, x1, y1, r) {
    const dx = x1 - x0;
    const dy = y1 - y0;
    const len2 = dx * dx + dy * dy || 1;
    this.addTest(Math.min(x0, x1) - r, Math.min(y0, y1) - r, Math.max(x0, x1) + r, Math.max(y0, y1) + r, (px, py) => {
      let t = ((px - x0) * dx + (py - y0) * dy) / len2;
      t = Math.max(0, Math.min(1, t));
      const cx = x0 + dx * t;
      const cy = y0 + dy * t;
      return (px - cx) * (px - cx) + (py - cy) * (py - cy) <= r * r;
    });
  }

  addEllipse(cx, cy, rx, ry) {
    this.addTest(cx - rx, cy - ry, cx + rx, cy + ry, (px, py) => {
      const ex = (px - cx) / rx;
      const ey = (py - cy) / ry;
      return ex * ex + ey * ey <= 1;
    });
  }

  // A superellipse: n = 2 is an ellipse, higher is squarer. Optional clip
  // keeps only the pixels for which clip(px, py) is true.
  addSuper(cx, cy, rx, ry, n, clip = null) {
    this.addTest(cx - rx, cy - ry, cx + rx, cy + ry, (px, py) => {
      const ex = Math.abs((px - cx) / rx);
      const ey = Math.abs((py - cy) / ry);
      if (Math.pow(ex, n) + Math.pow(ey, n) > 1) return false;
      return clip ? clip(px, py) : true;
    });
  }

  addPoly(points) {
    const hull = convexHull(points);
    if (hull.length < 3) return;
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const p of hull) {
      x0 = Math.min(x0, p.x); y0 = Math.min(y0, p.y); x1 = Math.max(x1, p.x); y1 = Math.max(y1, p.y);
    }
    this.addTest(x0, y0, x1, y1, (px, py) => {
      for (let i = 0; i < hull.length; i++) {
        const a = hull[i];
        const b = hull[(i + 1) % hull.length];
        if ((b.x - a.x) * (py - a.y) - (b.y - a.y) * (px - a.x) < 0) return false;
      }
      return true;
    });
  }

  // The one-pixel outline around the current mask.
  outline() {
    if (!this.bbox) return;
    const [bx0, by0, bx1, by1] = this.bbox;
    const m = this.mask;
    for (let y = Math.max(0, by0 - 1); y <= Math.min(FH - 1, by1 + 1); y++) {
      for (let x = Math.max(0, bx0 - 1); x <= Math.min(FW - 1, bx1 + 1); x++) {
        const i = y * FW + x;
        if (m[i]) continue;
        const near = (x > 0 && m[i - 1]) || (x < FW - 1 && m[i + 1]) || (y > 0 && m[i - FW]) || (y < FH - 1 && m[i + FW]);
        if (near) this.set(i, OUTLINE, 1, 0);
      }
    }
  }

  // Fill the current mask with a colour as a fill of `part`.
  fill(rgb, part = 0, kind = 2) {
    if (!this.bbox) return;
    const [bx0, by0, bx1, by1] = this.bbox;
    const m = this.mask;
    for (let y = by0; y <= by1; y++) for (let x = bx0; x <= bx1; x++) {
      const i = y * FW + x;
      if (m[i]) this.set(i, rgb, kind, part);
    }
  }

  set(i, rgb, kind, part) {
    this.rgb[i * 3] = rgb[0];
    this.rgb[i * 3 + 1] = rgb[1];
    this.rgb[i * 3 + 2] = rgb[2];
    this.kind[i] = kind;
    this.part[i] = part;
  }

  px(x, y, rgb, kind = 3) {
    x = Math.round(x);
    y = Math.round(y);
    if (x < 0 || y < 0 || x >= FW || y >= FH) return;
    this.set(y * FW + x, rgb, kind, 0);
  }

  // ---- one-call shapes ----

  capsule(x0, y0, x1, y1, r, rgb, { outline = true, part = 0 } = {}) {
    this.begin();
    this.addCapsule(x0, y0, x1, y1, r);
    if (outline) this.outline();
    this.fill(rgb, part);
  }

  ellipse(cx, cy, rx, ry, rgb, { outline = true, part = 0 } = {}) {
    this.begin();
    this.addEllipse(cx, cy, rx, ry);
    if (outline) this.outline();
    this.fill(rgb, part);
  }

  poly(points, rgb, { outline = true, part = 0 } = {}) {
    this.begin();
    this.addPoly(points);
    if (outline) this.outline();
    this.fill(rgb, part);
  }

  // Habbo shading: each part is flat on the lit side and one tone darker on
  // the right-hand share of every row it occupies. Light from the upper left.
  shade() {
    const out = new Uint8ClampedArray(this.rgb);
    for (let y = 0; y < FH; y++) {
      let x = 0;
      while (x < FW) {
        const i = y * FW + x;
        if (this.kind[i] !== 2) { x++; continue; }
        const part = this.part[i];
        if (part === NO_SHADE) { x++; continue; } // the face stays flat
        let x1 = x;
        while (x1 + 1 < FW && this.kind[y * FW + x1 + 1] === 2 && this.part[y * FW + x1 + 1] === part) x1++;
        const run = x1 - x + 1;
        const dark = Math.floor(run * SHADE_SHARE);
        for (let k = x1 - dark + 1; k <= x1; k++) {
          const j = y * FW + k;
          const t = tone([this.rgb[j * 3], this.rgb[j * 3 + 1], this.rgb[j * 3 + 2]], -SHADE_TONE);
          out[j * 3] = t[0];
          out[j * 3 + 1] = t[1];
          out[j * 3 + 2] = t[2];
        }
        x = x1 + 1;
      }
    }
    this.rgb = out;
  }

  blit(ctx, ox, oy) {
    const img = ctx.createImageData(FW, FH);
    const d = img.data;
    for (let i = 0; i < FW * FH; i++) {
      if (!this.kind[i]) continue;
      d[i * 4] = this.rgb[i * 3];
      d[i * 4 + 1] = this.rgb[i * 3 + 1];
      d[i * 4 + 2] = this.rgb[i * 3 + 2];
      d[i * 4 + 3] = 255;
    }
    ctx.putImageData(img, ox, oy);
  }
}

const SHADE_SHARE = 0.4; // of each row run that is in shadow
const SHADE_TONE = 0.16; // how much darker
const NO_SHADE = 6; // PART.head: shading across a face reads as a smudge

function convexHull(pts) {
  const p = [...pts].sort((a, b) => a.x - b.x || a.y - b.y);
  if (p.length < 3) return p;
  const cross = (o, a, b) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
  const lower = [];
  for (const q of p) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], q) <= 0) lower.pop();
    lower.push(q);
  }
  const upper = [];
  for (let i = p.length - 1; i >= 0; i--) {
    const q = p[i];
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], q) <= 0) upper.pop();
    upper.push(q);
  }
  upper.pop();
  lower.pop();
  return lower.concat(upper);
}

// ---- poses ----

// A pose is the small set of numbers the keyframes change. Everything else
// comes from BODY. Angles in degrees; arm pitch is forward positive, 0 hanging,
// 180 straight up. Leg stride is the foot's forward offset.
function restPose() {
  return {
    bob: 0, // body down by this many px
    lean: 0, // whole upper body forward by this many body units
    armPitch: [0, 0], // [left, right]
    armOut: [1.5, 1.5], // lateral spread: hands hang beside the hips, not over them
    stride: [0, 0], // [left, right] forward offsets of the feet
    lift: [0, 0], // knee lift in height units
    headD: 0, // head forward
    crouch: 1, // scale on heights above the feet
    lying: false,
    flash: false,
  };
}

// A hand that holds something raises its arm forward (Michael, 2026-10-10:
// not strapped to the side) and does not swing in the walk; the main hand
// still swings in the attack.
const HOLD_PITCH = 55;
const HOLD_OUT = 1.5;

function pose(variant, anim, i, holding = { main: false, off: false }) {
  const p = restPose();
  const zombie = variant === "zombie";
  const swing = [1, 0, -1, 0][i % 4];
  switch (anim) {
    case "idle":
      p.bob = i === 1 ? 1 : 0;
      if (zombie) {
        p.armPitch = [60, 55];
        p.lean = 1.5;
        p.headD = 1;
      } else {
        p.armPitch = [i === 1 ? 2 : 0, i === 1 ? 2 : 0];
      }
      break;
    case "walk":
      if (zombie) {
        // The shamble: arms out, a lean, a short limping stride.
        p.armPitch = [80, 70];
        p.lean = 2;
        p.headD = 1;
        p.stride = [3 * swing, -1.5 * swing];
        p.lift = [swing > 0 ? 2 : 0, 0];
        p.bob = i % 2 === 0 ? 0 : 1;
      } else {
        p.stride = [4 * swing, -4 * swing];
        p.lift = [swing > 0 ? 2 : 0, swing < 0 ? 2 : 0];
        p.armPitch = [-28 * swing, 28 * swing];
        p.bob = i % 2 === 0 ? -1 : 0;
      }
      break;
    case "attack": {
      const main = zombie ? [40, 95, 105, 60][i] : [-110, 75, 105, 30][i];
      const off = zombie ? [40, 90, 95, 55][i] : [10, 15, 10, 5][i];
      p.armPitch = [off, main];
      p.lean = [0, 2, 2.5, 1][i];
      break;
    }
    case "hurt":
      p.lean = -2;
      p.flash = i === 0;
      p.armPitch = [20, 20];
      break;
    case "die":
      if (i < 2) {
        p.crouch = [0.72, 0.42][i];
        p.lean = [1, 2][i];
        p.armPitch = [30, 30];
      } else {
        p.lying = true;
      }
      break;
    case "carry_idle":
      p.bob = i === 1 ? 1 : 0;
      p.armPitch = [170, 170];
      p.armOut = [2, 2];
      break;
    case "carry_walk":
      p.stride = [4 * swing, -4 * swing];
      p.lift = [swing > 0 ? 2 : 0, swing < 0 ? 2 : 0];
      p.armPitch = [170, 170];
      p.armOut = [2, 2];
      p.bob = i % 2 === 0 ? -1 : 0;
      break;
  }
  // Holding: the arm comes forward and stays there, except the main arm in
  // the attack and both arms when carrying or dying.
  const fixed = anim === "die" || anim.startsWith("carry");
  if (holding.off && !fixed) {
    p.armPitch[0] = HOLD_PITCH;
    p.armOut[0] = HOLD_OUT;
  }
  if (holding.main && !fixed && anim !== "attack") {
    p.armPitch[1] = HOLD_PITCH;
    p.armOut[1] = HOLD_OUT;
  }
  return p;
}

// The joints of a pose in body coordinates (l, d, h).
function joints(p) {
  const B = BODY;
  const c = p.crouch;
  const lean = p.lean;
  const j = {};
  if (p.lying) {
    // On the ground, face down, head forward of the hips.
    j.hipL = [-B.legL, 0, 3];
    j.hipR = [B.legL, 0, 3];
    j.footL = [-B.legL - 1, -13, 2];
    j.footR = [B.legL + 1, -12, 2];
    j.shoulderL = [-B.shoulderL, 13, 4];
    j.shoulderR = [B.shoulderL, 13, 4];
    j.handL = [-B.shoulderL - 4, 22, 2];
    j.handR = [B.shoulderL + 4, 20, 2];
    j.neck = [0, 15, 4];
    j.head = [0, 22, 5];
    j.hip = [0, 0, 3];
    return j;
  }
  const hipH = B.hip * c - p.bob;
  const shH = B.shoulder * c - p.bob;
  j.hip = [0, 0, hipH];
  j.hipL = [-B.legL, 0, hipH];
  j.hipR = [B.legL, 0, hipH];
  j.footL = [-B.legL, p.stride[0], p.lift[0]];
  j.footR = [B.legL, p.stride[1], p.lift[1]];
  j.shoulderL = [-B.shoulderL, lean, shH];
  j.shoulderR = [B.shoulderL, lean, shH];
  j.neck = [0, lean, B.neck * c - p.bob];
  j.head = [0, lean + p.headD, B.head * c - p.bob];
  const arm = (sh, pitch, out, side) => {
    const a = (pitch * Math.PI) / 180;
    return [sh[0] + out * side, sh[1] + Math.sin(a) * B.armLen, sh[2] - Math.cos(a) * B.armLen];
  };
  j.handL = arm(j.shoulderL, p.armPitch[0], p.armOut[0], -1);
  j.handR = arm(j.shoulderR, p.armPitch[1], p.armOut[1], 1);
  return j;
}

// ---- the outfit ----

// What a slot's garment does to the parts (docs/12, garment rules). An
// outfit is { head, chest, hands, legs, feet, waist, back }, each
// { shape, colours: [hex...] } or null. Colours are the garment's tones in
// order of use; one colour is enough for most.
function col(garment, i = 0, fallback = "#888") {
  const list = (garment && garment.colours) || [];
  return hexToRgb(list[Math.min(i, list.length - 1)] || fallback);
}

// ---- drawing one frame ----

// Hair painted in the editor (tools/hair.html): per facing, pixels relative
// to the head's centre, [dx, dy, "#rrggbb"]. Registered at boot from
// data/hair/index.json; a look's hairStyle may name one.
const paintedHair = new Map();
export function registerHair(name, data) {
  paintedHair.set(name, data);
}
export function hairStyles() {
  return ["short", "long", "bald", ...paintedHair.keys()];
}
export function hairIsPainted(name) {
  return paintedHair.has(name);
}

// Part ids, for the shading pass.
const PART = { legL: 1, legR: 2, torso: 3, armL: 4, armR: 5, head: 6, hair: 7, bag: 8, hat: 9 };

function drawFrame(frame, spec, facing, anim, i) {
  const F = facingVectors(facing);
  const p = pose(spec.variant, anim, i, spec.holding);
  const J = joints(p);
  const look = spec.look;
  const outfit = spec.outfit || {};
  const B = BODY;
  const flash = p.flash;
  const skin = flash ? WHITE : hexToRgb(look.skin);
  const under = flash ? WHITE : hexToRgb(look.under || "#e9dfc8");
  const hair = flash ? WHITE : hexToRgb(look.hair);
  const paint = (rgb) => (flash ? WHITE : rgb);
  const P = (pt) => {
    const q = project(F, pt[0], pt[1], pt[2]);
    return { x: FEET_X + q.x, y: FEET_Y + q.y, depth: q.depth };
  };
  // The face is drawn front-on (Stardew, Habbo): both eyes toward the viewer,
  // one eye from the side, none from behind.
  const faceFront = F.fy > 0.3; // s, sw, se: both eyes
  const faceSide = !faceFront && F.fy > -0.3; // e, w: one eye
  const hairSide = Math.abs(F.fx) > 0.8; // e, w only; the three-quarter facings keep the front cap, shifted back
  const parts = [];
  const add = (depth, draw) => parts.push({ depth, draw });
  const along = (a, b, t) => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });

  // Legs: each leg is one outlined shape, thigh to foot; breeches, undies,
  // and boots are colour on it, never more outline (docs/02, 2026-10-10:
  // no Michelin rolls).
  const leg = (hip, foot, side, part) => {
    const top = [hip[0], hip[1], hip[2] + 2]; // starts inside the torso
    const a = P(top);
    const b = P(foot);
    const fb = P([foot[0], foot[1] + 1.5, foot[2]]);
    // The legs always draw under the torso (the shirt covers the pants,
    // Michael 2026-10-10), the nearer leg over the farther.
    const raw = (a.depth + b.depth) / 2;
    const depth = Math.min(raw, 0) - 0.003 + raw * 0.0001;
    add(depth, () => {
      const legs = outfit.legs;
      const feet = outfit.feet;
      frame.begin();
      frame.addCapsule(a.x, a.y, b.x, b.y, B.legR);
      frame.addEllipse(fb.x, fb.y + 1, B.footRx, B.footRy);
      frame.outline();
      frame.fill(paint(legs ? col(legs) : skin), part);
      if (!legs) {
        const u = along(a, b, 0.4);
        frame.capsule(a.x, a.y, u.x, u.y, B.legR, paint(under), { outline: false, part });
      }
      if (feet) {
        const u = along(a, b, 0.62);
        frame.capsule(u.x, u.y, b.x, b.y, B.legR, paint(col(feet)), { outline: false, part });
        frame.ellipse(fb.x, fb.y + 1, B.footRx, B.footRy, paint(col(feet)), { outline: false, part });
        // The boot's top: one dark row, a seam between two slots.
        frame.capsule(u.x, u.y, u.x, u.y, B.legR - 0.3, OUTLINE, { outline: false, part: 0 });
      } else {
        frame.ellipse(fb.x, fb.y + 1, B.footRx - 0.5, B.footRy, paint(tone(skin, -0.12)), { outline: false, part });
      }
    });
  };
  leg(J.hipL, J.footL, -1, PART.legL);
  leg(J.hipR, J.footR, 1, PART.legR);

  // Torso: one outlined hull; a tunic colours it, a second colour runs down
  // the front, a belt bands the waist.
  const torsoPts = [];
  const hem = outfit.chest ? 3 : 2; // a tunic hangs a little below the hips, shirt length (Michael: not to the knees)
  for (const [l, d, h] of [
    [-B.shoulderL + 1, -B.torsoD, J.shoulderL[2]], [B.shoulderL - 1, -B.torsoD, J.shoulderR[2]],
    [-B.shoulderL + 1, B.torsoD, J.shoulderL[2]], [B.shoulderL - 1, B.torsoD, J.shoulderR[2]],
    [-B.hipL, -B.hipD, J.hip[2] - hem], [B.hipL, -B.hipD, J.hip[2] - hem],
    [-B.hipL, B.hipD, J.hip[2] - hem], [B.hipL, B.hipD, J.hip[2] - hem],
  ]) torsoPts.push(P([l, d + (h > J.hip[2] ? p.lean : p.lean * 0.3), h]));
  add(0.0005, () => {
    const chest = outfit.chest;
    frame.poly(torsoPts, paint(chest ? col(chest) : skin), { part: PART.torso });
    if (chest && chest.colours && chest.colours.length > 1 && faceFront) {
      const top = P([0, B.torsoD + 0.5, J.shoulderL[2] - 1]);
      const bot = P([0, B.hipD + 0.5, J.hip[2] + 2]);
      frame.capsule(top.x, top.y, bot.x, bot.y, 2, paint(col(chest, 1)), { outline: false, part: PART.torso });
    }
    const waist = outfit.waist;
    if (waist && !p.lying) {
      const band = [];
      for (const [l, d] of [[-B.hipL - 0.5, -B.hipD], [B.hipL + 0.5, -B.hipD], [-B.hipL - 0.5, B.hipD], [B.hipL + 0.5, B.hipD]]) {
        band.push(P([l, d + p.lean * 0.3, J.hip[2] + 1.6]));
        band.push(P([l, d + p.lean * 0.3, J.hip[2] + 2.4]));
      }
      frame.poly(band, paint(col(waist)), { outline: false, part: PART.torso });
      if (faceFront || faceSide) {
        const buckle = P([0, B.hipD + 0.6, J.hip[2] + 1.8]);
        frame.px(buckle.x, buckle.y, paint(col(waist, 1, "#c8a040")));
      }
    }
  });

  // The bag on the back: behind the body facing the viewer, in front facing away.
  const back = outfit.back;
  if (back && !p.lying) {
    const c = P([0, -B.torsoD - 3.5 + p.lean, J.hip[2] + 8]);
    const big = back.shape === "rucksack" || back.shape === "dev_bag";
    add(c.depth - 0.5, () => {
      const w = big ? 5.5 : 4.5;
      const h = big ? 7 : 5.5;
      frame.poly([{ x: c.x - w, y: c.y - h + 1 }, { x: c.x + w, y: c.y - h + 1 }, { x: c.x + w + 1, y: c.y - h + 2 }, { x: c.x + w + 1, y: c.y + h - 1 }, { x: c.x + w, y: c.y + h }, { x: c.x - w, y: c.y + h }, { x: c.x - w - 1, y: c.y + h - 1 }, { x: c.x - w - 1, y: c.y - h + 2 }], paint(col(back)), { part: PART.bag });
      frame.capsule(c.x - w + 1, c.y - h + 3, c.x + w - 1, c.y - h + 3, 1, paint(col(back, 1, "#5a4a3a")), { outline: false, part: PART.bag });
    });
  }

  // Arms: one outlined shape from shoulder to hand; the sleeve and the glove
  // are colour on it.
  const arm = (sh, hand, side, part) => {
    const a = P(sh);
    const b = P(hand);
    const depth = (a.depth + b.depth) / 2 + 0.002 * side;
    add(depth, () => {
      const chest = outfit.chest;
      const gloves = outfit.hands;
      frame.begin();
      frame.addCapsule(a.x, a.y, b.x, b.y, B.armR);
      frame.addEllipse(b.x, b.y, B.handR, B.handR);
      frame.outline();
      frame.fill(skin, part);
      if (chest) {
        const u = along(a, b, 0.5);
        frame.capsule(a.x, a.y, u.x, u.y, B.armR, paint(col(chest)), { outline: false, part });
      }
      if (gloves) frame.ellipse(b.x, b.y, B.handR, B.handR, paint(col(gloves)), { outline: false, part });
    });
    return { a, b };
  };
  const armL = arm(J.shoulderL, J.handL, -1, PART.armL);
  const armR = arm(J.shoulderR, J.handR, 1, PART.armR);

  // Head: a rounded square, not an egg. Hair is a helmet of its own worn over
  // it (Michael, 2026-10-10), and any hat replaces it.
  const hc = P(J.head);
  const SQ = 3; // superellipse exponent: squarer than round
  add(hc.depth + 0.01, () => {
    const head = outfit.head;
    const helm = head && head.shape === "helm";
    frame.begin();
    frame.addSuper(hc.x, hc.y, B.headRx, B.headRy, SQ);
    frame.outline();
    frame.fill(paint(helm ? col(head) : skin), PART.head);
    const fromBehind = F.fy < -0.3;
    const painted = !head && paintedHair.get(look.hairStyle);
    if (!head && !painted && look.hairStyle !== "bald") {
      // The hair helmet: the top of the head, down the back and sides, with
      // a straight fringe across the forehead from the front.
      // The cap's mass sits toward the back of the head, so it turns with the
      // face; its edge curves down from a high centre so the forehead shows
      // and the sides stay thin, to the ears.
      const cxh = hc.x - F.fx * 1.5;
      const rxh = B.headRx + 1;
      frame.begin();
      frame.addSuper(cxh, hc.y - 1, rxh, B.headRy + 1, SQ, (px, py) => {
        const u = (px - cxh) / rxh;
        const fringe = hc.y - 4.5 + u * u * 3.5;
        if (py <= fringe) return true; // the curved cap
        if (fromBehind) return py <= hc.y + 4; // the back of the head
        const forward = (px - hc.x) * F.fx; // positive toward the face
        if (hairSide) return forward < -1 && py <= hc.y + 2; // from the side: down the back only
        return Math.abs(px - hc.x) >= B.headRx - 1.5 && py <= hc.y; // from the front: thin sides to the ears
      });
      if (look.hairStyle === "long") {
        // Down to the shoulders at the sides and the back.
        const s0 = P([-B.headRx + 1, -2, J.head[2] - 2]);
        const s1 = P([B.headRx - 1, -2, J.head[2] - 2]);
        const e0 = P([-B.headRx + 1, -2, J.neck[2] - 5]);
        const e1 = P([B.headRx - 1, -2, J.neck[2] - 5]);
        frame.addCapsule(s0.x, s0.y, e0.x, e0.y, 2.2);
        frame.addCapsule(s1.x, s1.y, e1.x, e1.y, 2.2);
        if (fromBehind) frame.addPoly([{ x: s0.x - 1, y: s0.y }, { x: s1.x + 1, y: s1.y }, { x: e1.x + 1, y: e1.y }, { x: e0.x - 1, y: e0.y }]);
      }
      frame.outline();
      frame.fill(paint(hair), PART.hair);
    }
    if (head && !helm) {
      if (head.shape === "hood") {
        frame.begin();
        frame.addSuper(hc.x, hc.y - 1, B.headRx + 1.5, B.headRy + 2, SQ);
        const tip = P([0, -3, J.head[2] + B.headRy + 4]);
        frame.addCapsule(hc.x, hc.y - B.headRy, tip.x, tip.y, 2);
        frame.outline();
        frame.fill(paint(col(head)), PART.hat);
        if (faceFront || faceSide) {
          // The face opening.
          frame.begin();
          frame.addSuper(hc.x + F.fx * 1.5, hc.y + 1.5, B.headRx - 3.5, B.headRy - 3, SQ);
          frame.fill(skin, PART.head);
        }
      } else if (head.shape === "cap") {
        frame.begin();
        frame.addSuper(hc.x, hc.y - 1, B.headRx + 1, B.headRy + 1, SQ, (px, py) => py <= hc.y - 3);
        if (faceFront || faceSide) {
          const brim = P([0, B.headRx - 1, J.head[2] + 2]);
          frame.addCapsule(brim.x - 3, brim.y, brim.x + 3, brim.y, 1.2);
        }
        frame.outline();
        frame.fill(paint(col(head)), PART.hat);
      }
    }
    // The face: whites and pupils, and a small grim mouth. Front-on.
    if (!p.lying && (faceFront || faceSide)) {
      const pupil = flash ? WHITE : spec.variant === "zombie" ? [150, 40, 40] : hexToRgb(look.eyes || "#1c1a22");
      const white = flash ? WHITE : spec.variant === "zombie" ? [200, 200, 170] : [245, 245, 240];
      const ey = Math.round(hc.y) + 3; // the eyes sit low on the face; there is no mouth to make room for
      const shift = Math.round(F.fx * 1.5); // a nudge toward where the figure looks
      if (helm) {
        for (const dx of [-3, 0, 3]) for (const dy of [-1, 0, 1]) frame.px(hc.x + dx + shift, ey + dy, OUTLINE);
      } else if (faceFront) {
        // Two eyes, two wide and three tall, whites with the pupil low on
        // the inner column. No mouth (Michael, 2026-10-10).
        for (const side of [-1, 1]) {
          const outer = Math.round(hc.x) + side * 4 + shift;
          const mid = outer - side;
          const inner = outer - 2 * side;
          for (let dy = -3; dy <= 1; dy++) {
            frame.px(outer, ey + dy, white);
            frame.px(mid, ey + dy, white);
            frame.px(inner, ey + dy, white);
          }
          for (const x of [mid, inner]) for (const dy of [-1, 0, 1]) frame.px(x, ey + dy, pupil);
        }
      } else {
        // From the side: one eye, drawn exactly as a front eye, on the forward
        // side of the face, pupil toward where the figure looks.
        const sgn = Math.sign(F.fx);
        const outer = Math.round(hc.x + F.fx * (B.headRx - 2.5));
        const mid = outer - sgn;
        const inner = outer - 2 * sgn;
        for (let dy = -3; dy <= 1; dy++) {
          frame.px(outer, ey + dy, white);
          frame.px(mid, ey + dy, white);
          frame.px(inner, ey + dy, white);
        }
        for (const x of [outer, mid]) for (const dy of [-1, 0, 1]) frame.px(x, ey + dy, pupil);
      }
    }
    if (painted) {
      const px = (painted.frames && painted.frames[facing]) || [];
      for (const [dx, dy, c] of px) frame.px(hc.x + dx, hc.y + dy, flash ? WHITE : hexToRgb(c));
    }
    if (spec.wound && !helm) {
      const w = P([spec.wound[0], spec.wound[1], J.head[2] + spec.wound[2]]);
      if (w.depth >= -1) {
        frame.px(w.x, w.y, [110, 30, 34]);
        frame.px(w.x + 1, w.y, [140, 40, 40]);
        frame.px(w.x, w.y + 1, [140, 40, 40]);
      }
    }
  });

  parts.sort((a, b) => a.depth - b.depth);
  for (const part of parts) part.draw();
  frame.shade();

  // The joints the renderer needs: hand points in frame pixels, with the
  // forearm direction and whether the hand is in front of the body.
  // A held item at rest tilts forward from the hand and a little outward on
  // the hand's own side; in a swing it points along the forearm.
  const st = Math.sin((HELD_TILT * Math.PI) / 180);
  const so = Math.sin((HELD_LEAN_OUT * Math.PI) / 180);
  const restAxis = (side) => [F.fx * st + side * F.rx * so, -Math.cos((HELD_TILT * Math.PI) / 180) + (F.fy * st + side * F.ry * so) * ISO];
  const hand = (arm, side) => ({
    x: Math.round(arm.b.x) - FEET_X,
    y: Math.round(arm.b.y) - FEET_Y,
    dir: [arm.b.x - arm.a.x, arm.b.y - arm.a.y],
    near: arm.b.depth >= 0,
    ang: angleIndex(restAxis(side)),
    angSwing: angleIndex([arm.b.x - arm.a.x, arm.b.y - arm.a.y]),
  });
  return { main: hand(armR, 1), off: hand(armL, -1), head: { x: Math.round(hc.x) - FEET_X, y: Math.round(hc.y) - FEET_Y } };
}

const HELD_TILT = 32; // degrees forward off vertical for an item held at rest
const HELD_LEAN_OUT = 18; // and this much outward, on the hand's side
export const HELD_ANGLES = 16; // frames per held item, 22.5 degrees apart, 0 up, clockwise

// The nearest held angle for a screen direction.
export function angleIndex(dir) {
  const a = Math.atan2(dir[0], -dir[1]);
  const k = Math.round(a / ((2 * Math.PI) / HELD_ANGLES));
  return ((k % HELD_ANGLES) + HELD_ANGLES) % HELD_ANGLES;
}

// ---- sheets ----

// spec: { variant: "player" | "zombie", look: { skin, hair, hairStyle, eyes, under },
//         outfit: { slot: { shape, colours } }, wound: [l, d, hOffset] | null }
export function generateFigure(spec) {
  const animNames = Object.keys(ANIMS);
  const totalFrames = animNames.reduce((n, a) => n + ANIMS[a].frames, 0);
  const canvas = document.createElement("canvas");
  canvas.width = FW * totalFrames;
  canvas.height = FH * FACINGS.length;
  const ctx = canvas.getContext("2d");
  const frames = {};
  const jointTable = {};
  const frame = new Frame();
  FACINGS.forEach((facing, row) => {
    let colIdx = 0;
    for (const anim of animNames) {
      for (let i = 0; i < ANIMS[anim].frames; i++) {
        frame.clear();
        const j = drawFrame(frame, spec, facing, anim, i);
        const ox = colIdx * FW;
        const oy = row * FH;
        frame.blit(ctx, ox, oy);
        const name = `${anim}_${facing}_${i}`;
        frames[name] = [ox, oy, FW, FH];
        jointTable[name] = j;
        colIdx++;
      }
    }
  });
  return {
    image: canvas,
    frames,
    anchor: [FEET_X, FEET_Y],
    animations: ANIMS,
    facings: [...FACINGS],
    mirror: {},
    joints: jointTable,
  };
}

// ---- held items ----

// Held art is a small vertical drawing of the thing rotated into eight
// angles, frames `held_<k>` with k from 0 (pointing up) clockwise in 45
// degree steps. The anchor is the grip. The renderer picks the angle from the
// forearm direction (docs/12, held items).
export const HELD_SIZE = 32;
const HELD_SHAPES = {
  torch: (f, c) => {
    f.capsule(16, 10, 16, 24, 1.3, c(0, "#8a5a2a"));
    f.ellipse(16, 8, 2.6, 2.6, c(1, "#3a2a22"));
  },
  hatchet: (f, c) => {
    f.capsule(16, 8, 16, 25, 1.3, c(0, "#8a6a3a"));
    f.poly([{ x: 16, y: 6 }, { x: 23, y: 7 }, { x: 23, y: 13 }, { x: 16, y: 13 }], c(1, "#9aa0a8"));
  },
  plank: (f, c) => {
    f.capsule(16, 5, 16, 27, 2, c(0, "#9a7448"));
  },
  log: (f, c) => {
    f.capsule(16, 9, 16, 23, 3.5, c(0, "#6a4a30"));
    f.ellipse(16, 8, 3.2, 1.6, c(1, "#b08a5a"));
  },
};

export function generateHeld(shape, colours = []) {
  const draw = HELD_SHAPES[shape] || HELD_SHAPES.plank;
  const S = HELD_SIZE;
  const N = HELD_ANGLES;
  // Draw upright once into a frame-sized scratch, then sample it rotated.
  const src = new Frame();
  const c = (i, fb) => hexToRgb(colours[i] || fb);
  draw(src, c);
  src.shade();
  const canvas = document.createElement("canvas");
  canvas.width = S * N;
  canvas.height = S;
  const ctx = canvas.getContext("2d");
  const frames = {};
  const grip = { x: 16, y: 20 }; // where the hand holds it, in the upright drawing
  for (let k = 0; k < N; k++) {
    const a = (k * (360 / N) * Math.PI) / 180;
    const cos = Math.cos(a);
    const sin = Math.sin(a);
    const img = ctx.createImageData(S, S);
    const d = img.data;
    for (let y = 0; y < S; y++) {
      for (let x = 0; x < S; x++) {
        // Destination pixel relative to the grip, rotated back into the source.
        const dx = x + 0.5 - 16;
        const dy = y + 0.5 - 16;
        const sx = Math.floor(grip.x + dx * cos + dy * sin);
        const sy = Math.floor(grip.y - dx * sin + dy * cos);
        if (sx < 0 || sy < 0 || sx >= FW || sy >= FH) continue;
        const i = sy * FW + sx;
        if (!src.kind[i]) continue;
        const o = (y * S + x) * 4;
        d[o] = src.rgb[i * 3];
        d[o + 1] = src.rgb[i * 3 + 1];
        d[o + 2] = src.rgb[i * 3 + 2];
        d[o + 3] = 255;
      }
    }
    ctx.putImageData(img, k * S, 0);
    frames[`held_${k}`] = [k * S, 0, S, S];
  }
  // The tip (for a torch's flame), per angle, relative to the grip.
  const tips = [];
  for (let k = 0; k < N; k++) {
    const a = (k * (360 / N) * Math.PI) / 180;
    const len = shape === "torch" ? 12 : 10;
    tips.push([Math.round(Math.sin(a) * len), Math.round(-Math.cos(a) * len)]);
  }
  return { image: canvas, frames, anchor: [16, 16], animations: {}, facings: [], mirror: {}, tips };
}

// Which of the eight held angles a forearm direction (screen dx, dy) wants,
// for an item that points along the arm; `upright` items point up at rest.
export function heldAngle(dir, alongArm) {
  return alongArm ? angleIndex(dir) : 0;
}

// ---- looks and outfits ----

export const DEFAULT_LOOK = { skin: "#f0c8a0", hair: "#5a3a20", hairStyle: "short", eyes: "#1c1a22", under: "#e9dfc8" };

const ZOMBIE_SKINS = ["#9fbf88", "#8fae7a", "#a8b88a", "#93a97e", "#b0bf92"];
const DRAB = ["#6a5a48", "#5a4a3c", "#4a5060", "#6e6050", "#705848", "#565a4a", "#7a6a5a", "#4e4a56"];
const HAIRS = ["#3a2a1c", "#2a2a2a", "#5a4a30", "#6a3a28", "#8a7a60"];

// Ten outfits for the dead (docs/12, accept 6), deterministic by index.
export const ZOMBIE_OUTFITS = 10;

export function zombieSpec(k) {
  const pick = (list, n) => list[(k * 7 + n * 3) % list.length];
  const outfit = {
    chest: { shape: "tunic", colours: [pick(DRAB, 0)] },
    legs: k % 3 === 0 ? null : { shape: "breeches", colours: [pick(DRAB, 1)] },
    feet: k % 4 === 1 ? null : { shape: "boots", colours: ["#3a2a1c"] },
    head: k % 5 === 2 ? { shape: "hood", colours: [pick(DRAB, 2)] } : k % 5 === 4 ? { shape: "cap", colours: [pick(DRAB, 3)] } : null,
    waist: k % 2 === 0 ? { shape: "belt", colours: ["#4a3020", "#a08040"] } : null,
    hands: null,
    back: null,
  };
  return {
    variant: "zombie",
    look: { skin: pick(ZOMBIE_SKINS, 0), hair: pick(HAIRS, 1), hairStyle: k % 4 === 3 ? "bald" : k % 3 === 1 ? "long" : "short", eyes: "#2a1414", under: "#b8b0a0" },
    outfit,
    wound: [k % 2 ? 5 : -5, 3, k % 3 - 1],
  };
}

// The player's spec from their look and what they wear; `worn` is the slot map
// of item entries and `artOf` gives an item id's garment art.
export function playerSpec(look, worn, artOf, hands = null) {
  const outfit = {};
  for (const slot of ["head", "chest", "hands", "legs", "feet", "waist", "back"]) {
    const e = worn[slot];
    outfit[slot] = e ? artOf(e.id) || null : null;
  }
  const holding = { main: !!(hands && hands.main), off: !!(hands && hands.off) };
  return { variant: "player", look: { ...DEFAULT_LOOK, ...look }, outfit, wound: null, holding };
}

// A key that changes when the drawing would.
export function specKey(spec) {
  return JSON.stringify([spec.variant, spec.look, spec.outfit, spec.wound, spec.holding]);
}
