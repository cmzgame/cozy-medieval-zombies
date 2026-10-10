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
  headRx: 10.5,
  headRy: 9.5,
  shoulderL: 8, // lateral offsets; the shoulders stay inside the head's width
  hipL: 5.5,
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
    this.kind = new Uint8Array(FW * FH); // 0 empty, 1 outline, 2 fill, 3 flat (no shading)
    this.mask = new Uint8Array(FW * FH); // scratch
  }

  // Rasterise a shape test over a bbox into the scratch mask; returns the bbox.
  shape(x0, y0, x1, y1, test) {
    const m = this.mask;
    m.fill(0);
    const bx0 = Math.max(0, Math.floor(x0));
    const by0 = Math.max(0, Math.floor(y0));
    const bx1 = Math.min(FW - 1, Math.ceil(x1));
    const by1 = Math.min(FH - 1, Math.ceil(y1));
    for (let y = by0; y <= by1; y++) for (let x = bx0; x <= bx1; x++) if (test(x + 0.5, y + 0.5)) m[y * FW + x] = 1;
    return [bx0, by0, bx1, by1];
  }

  // Paint the scratch mask as a part: outline (dilated by one) then fill.
  paint(bbox, rgb, { outline = true, kind = 2 } = {}) {
    const [bx0, by0, bx1, by1] = bbox;
    const m = this.mask;
    if (outline) {
      for (let y = Math.max(0, by0 - 1); y <= Math.min(FH - 1, by1 + 1); y++) {
        for (let x = Math.max(0, bx0 - 1); x <= Math.min(FW - 1, bx1 + 1); x++) {
          const i = y * FW + x;
          if (m[i]) continue;
          const near = (x > 0 && m[i - 1]) || (x < FW - 1 && m[i + 1]) || (y > 0 && m[i - FW]) || (y < FH - 1 && m[i + FW]);
          if (near) this.set(i, OUTLINE, 1);
        }
      }
    }
    for (let y = by0; y <= by1; y++) for (let x = bx0; x <= bx1; x++) {
      const i = y * FW + x;
      if (m[i]) this.set(i, rgb, kind);
    }
  }

  set(i, rgb, kind) {
    this.rgb[i * 3] = rgb[0];
    this.rgb[i * 3 + 1] = rgb[1];
    this.rgb[i * 3 + 2] = rgb[2];
    this.kind[i] = kind;
  }

  px(x, y, rgb, kind = 3) {
    x = Math.round(x);
    y = Math.round(y);
    if (x < 0 || y < 0 || x >= FW || y >= FH) return;
    this.set(y * FW + x, rgb, kind);
  }

  capsule(x0, y0, x1, y1, r, rgb, opts) {
    const dx = x1 - x0;
    const dy = y1 - y0;
    const len2 = dx * dx + dy * dy || 1;
    const bbox = this.shape(Math.min(x0, x1) - r, Math.min(y0, y1) - r, Math.max(x0, x1) + r, Math.max(y0, y1) + r, (px, py) => {
      let t = ((px - x0) * dx + (py - y0) * dy) / len2;
      t = Math.max(0, Math.min(1, t));
      const cx = x0 + dx * t;
      const cy = y0 + dy * t;
      return (px - cx) * (px - cx) + (py - cy) * (py - cy) <= r * r;
    });
    this.paint(bbox, rgb, opts);
  }

  ellipse(cx, cy, rx, ry, rgb, opts) {
    const bbox = this.shape(cx - rx, cy - ry, cx + rx, cy + ry, (px, py) => {
      const ex = (px - cx) / rx;
      const ey = (py - cy) / ry;
      return ex * ex + ey * ey <= 1;
    });
    this.paint(bbox, rgb, opts);
  }

  // Part of an ellipse: the pixels of it above (or below) a horizontal line.
  ellipseCut(cx, cy, rx, ry, cutY, above, rgb, opts) {
    const bbox = this.shape(cx - rx, cy - ry, cx + rx, cy + ry, (px, py) => {
      const ex = (px - cx) / rx;
      const ey = (py - cy) / ry;
      if (ex * ex + ey * ey > 1) return false;
      return above ? py <= cutY : py >= cutY;
    });
    this.paint(bbox, rgb, opts);
  }

  // Convex polygon from points [{x, y}]; the hull is taken, so any order works.
  poly(points, rgb, opts) {
    const hull = convexHull(points);
    if (hull.length < 3) return;
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const p of hull) {
      x0 = Math.min(x0, p.x); y0 = Math.min(y0, p.y); x1 = Math.max(x1, p.x); y1 = Math.max(y1, p.y);
    }
    const bbox = this.shape(x0, y0, x1, y1, (px, py) => {
      for (let i = 0; i < hull.length; i++) {
        const a = hull[i];
        const b = hull[(i + 1) % hull.length];
        if ((b.x - a.x) * (py - a.y) - (b.y - a.y) * (px - a.x) < 0) return false;
      }
      return true;
    });
    this.paint(bbox, rgb, opts);
  }

  // Two-tone: light on the upper-left edge of every fill, dark on the lower-right.
  shade() {
    const k = this.kind;
    const out = new Uint8ClampedArray(this.rgb);
    const edge = (i) => k[i] !== 2;
    for (let y = 0; y < FH; y++) {
      for (let x = 0; x < FW; x++) {
        const i = y * FW + x;
        if (k[i] !== 2) continue;
        const c = [this.rgb[i * 3], this.rgb[i * 3 + 1], this.rgb[i * 3 + 2]];
        let t = null;
        if ((y > 0 && edge(i - FW)) || (x > 0 && edge(i - 1))) t = tone(c, 0.22);
        else if ((y < FH - 1 && edge(i + FW)) || (x < FW - 1 && edge(i + 1))) t = tone(c, -0.22);
        if (t) {
          out[i * 3] = t[0];
          out[i * 3 + 1] = t[1];
          out[i * 3 + 2] = t[2];
        }
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
    armOut: [0, 0], // lateral spread
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
  const facingViewer = F.fy > -0.35; // the face shows
  const parts = [];
  const add = (depth, draw) => parts.push({ depth, draw });

  // Legs: hip to foot, a foot block, breeches, boots.
  const leg = (hip, foot, side) => {
    const a = P(hip);
    const b = P(foot);
    const depth = (a.depth + b.depth) / 2 + 0.001 * side;
    add(depth, () => {
      const legs = outfit.legs;
      frame.capsule(a.x, a.y, b.x, b.y, B.legR, paint(legs ? col(legs) : skin));
      if (!legs) {
        // Undies: the top third of each leg.
        const t = 0.38;
        frame.capsule(a.x, a.y, a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t, B.legR, under, { outline: false });
      }
      const feet = outfit.feet;
      const fb = P([foot[0], foot[1] + 1.5, foot[2]]);
      if (feet) {
        const t = 0.6;
        frame.capsule(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t, b.x, b.y, B.legR + 0.3, paint(col(feet)));
        frame.ellipse(fb.x, fb.y + 1, B.footRx, B.footRy, paint(col(feet)));
      } else {
        frame.ellipse(fb.x, fb.y + 1, B.footRx - 0.5, B.footRy, skin);
      }
    });
  };
  leg(J.hipL, J.footL, -1);
  leg(J.hipR, J.footR, 1);

  // Torso: the hull of the shoulder and hip corners; a tunic colours it; a belt bands it.
  const torsoPts = [];
  for (const [l, d, h] of [
    [-B.shoulderL + 1, -B.torsoD, J.shoulderL[2]], [B.shoulderL - 1, -B.torsoD, J.shoulderR[2]],
    [-B.shoulderL + 1, B.torsoD, J.shoulderL[2]], [B.shoulderL - 1, B.torsoD, J.shoulderR[2]],
    [-B.hipL, -B.hipD, J.hip[2] - 2], [B.hipL, -B.hipD, J.hip[2] - 2],
    [-B.hipL, B.hipD, J.hip[2] - 2], [B.hipL, B.hipD, J.hip[2] - 2],
  ]) torsoPts.push(P([l, d + (h > J.hip[2] ? p.lean : p.lean * 0.3), h]));
  const torsoDepth = P(J.hip).depth * 0 + 0.0005;
  add(torsoDepth, () => {
    const chest = outfit.chest;
    frame.poly(torsoPts, paint(chest ? col(chest) : skin));
    if (chest && chest.colours && chest.colours.length > 1 && facingViewer) {
      // A second colour is a tabard or a scarf down the front.
      const top = P([0, B.torsoD + 0.5, J.shoulderL[2] - 1]);
      const bot = P([0, B.hipD + 0.5, J.hip[2] + 2]);
      frame.capsule(top.x, top.y, bot.x, bot.y, 2, paint(col(chest, 1)), { outline: false });
    }
    const waist = outfit.waist;
    if (waist && !p.lying) {
      const band = [];
      for (const [l, d] of [[-B.hipL - 0.5, -B.hipD], [B.hipL + 0.5, -B.hipD], [-B.hipL - 0.5, B.hipD], [B.hipL + 0.5, B.hipD]]) {
        band.push(P([l, d + p.lean * 0.3, J.hip[2] + 0.5]));
        band.push(P([l, d + p.lean * 0.3, J.hip[2] + 3]));
      }
      frame.poly(band, paint(col(waist)), { outline: false });
      if (facingViewer) {
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
      frame.poly([{ x: c.x - w, y: c.y - h + 1 }, { x: c.x + w, y: c.y - h + 1 }, { x: c.x + w + 1, y: c.y - h + 2 }, { x: c.x + w + 1, y: c.y + h - 1 }, { x: c.x + w, y: c.y + h }, { x: c.x - w, y: c.y + h }, { x: c.x - w - 1, y: c.y + h - 1 }, { x: c.x - w - 1, y: c.y - h + 2 }], paint(col(back)));
      // The flap or the tie across the top.
      frame.capsule(c.x - w + 1, c.y - h + 3, c.x + w - 1, c.y - h + 3, 1, paint(col(back, 1, "#5a4a3a")), { outline: false });
    });
  }

  // Arms: shoulder to hand, a hand, sleeves, gloves.
  const arm = (sh, hand, side) => {
    const a = P(sh);
    const b = P(hand);
    const depth = (a.depth + b.depth) / 2 + 0.002 * side;
    add(depth, () => {
      const chest = outfit.chest;
      frame.capsule(a.x, a.y, b.x, b.y, B.armR, paint(chest ? col(chest) : skin));
      if (chest) {
        // Bare forearm below the sleeve.
        const t = 0.5;
        frame.capsule(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t, b.x, b.y, B.armR - 0.2, skin);
      }
      const gloves = outfit.hands;
      frame.ellipse(b.x, b.y, B.handR, B.handR, paint(gloves ? col(gloves) : skin));
    });
    return { a, b };
  };
  const armL = arm(J.shoulderL, J.handL, -1);
  const armR = arm(J.shoulderR, J.handR, 1);

  // Head, hair, face, and what sits on the head.
  const hc = P(J.head);
  add(hc.depth + 0.01, () => {
    const head = outfit.head;
    const helm = head && head.shape === "helm";
    frame.ellipse(hc.x, hc.y, B.headRx, B.headRy, paint(helm ? col(head) : skin));
    // Hair: a cap over the top, more of the head from behind; long hair reaches the shoulders.
    if (!helm && look.hairStyle !== "bald") {
      const fromBehind = F.fy < 0;
      const cut = hc.y - (fromBehind ? -2 : 2);
      frame.ellipseCut(hc.x, hc.y, B.headRx, B.headRy, cut, true, hair, { outline: false });
      if (look.hairStyle === "long") {
        const s0 = P([-B.headRx + 1, -2, J.head[2] - 2]);
        const s1 = P([B.headRx - 1, -2, J.head[2] - 2]);
        const e0 = P([-B.headRx + 1, -2, J.neck[2] - 4]);
        const e1 = P([B.headRx - 1, -2, J.neck[2] - 4]);
        if (P([0, -2, 0]).depth <= 0 || fromBehind) {
          frame.capsule(s0.x, s0.y, e0.x, e0.y, 2, hair);
          frame.capsule(s1.x, s1.y, e1.x, e1.y, 2, hair);
        }
      }
    }
    if (head && !helm) {
      if (head.shape === "hood") {
        frame.ellipse(hc.x, hc.y - 1, B.headRx + 1, B.headRy + 1.5, paint(col(head)));
        const tip = P([0, -3, J.head[2] + B.headRy + 4]);
        frame.capsule(hc.x, hc.y - B.headRy, tip.x, tip.y, 2, paint(col(head)));
        // The face opening.
        if (facingViewer) {
          const fo = P([0, 5, J.head[2] - 1]);
          frame.ellipse(fo.x, fo.y, 5, 5, skin, { outline: false });
        }
      } else if (head.shape === "cap") {
        frame.ellipseCut(hc.x, hc.y, B.headRx + 0.5, B.headRy + 0.5, hc.y - 2, true, paint(col(head)));
        if (facingViewer) {
          const brim = P([0, B.headRx - 1, J.head[2] + 2]);
          frame.capsule(brim.x - 3, brim.y, brim.x + 3, brim.y, 1.2, paint(col(head)), { outline: false });
        }
      }
    }
    // Face: two eyes and a mouth, or three visor slits.
    if (facingViewer && !p.lying) {
      const eyes = flash ? WHITE : hexToRgb(look.eyes || "#1c1a22");
      if (helm) {
        for (const l of [-3, 0, 3]) {
          const s = P([l, B.headRx - 1, J.head[2] + 1]);
          frame.px(s.x, s.y, OUTLINE);
          frame.px(s.x, s.y + 1, OUTLINE);
          frame.px(s.x, s.y - 1, OUTLINE);
        }
      } else {
        for (const l of [-3, 3]) {
          const e = P([l, B.headRx - 1, J.head[2] + 1]);
          frame.px(e.x, e.y, eyes);
          frame.px(e.x, e.y + 1, eyes);
          if (spec.variant === "zombie") frame.px(e.x, e.y, [150, 40, 40]);
        }
        const m = P([0, B.headRx - 1, J.head[2] - 3]);
        frame.px(m.x, m.y, tone(skin, -0.45));
        if (spec.variant === "zombie") frame.px(m.x + 1, m.y, tone(skin, -0.45));
      }
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
  // A held item at rest tilts forward from the hand, HELD_TILT degrees off
  // vertical toward the facing; in a swing it points along the forearm.
  // The tilt is forward plus a little outward on the hand's own side, so a
  // torch seen from the front leans away from the body instead of standing
  // straight up through the face.
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
        frame.rgb.fill(0);
        frame.kind.fill(0);
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
