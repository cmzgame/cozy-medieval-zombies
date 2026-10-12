// A tiny rasteriser for the figure (docs/12): colour, the frame with its outline and two-tone shading, and the
// convex hull the parts are filled from. No anti-aliasing, whole pixels.
// Cut from src/figure.js on 2026-10-12 (docs/23a, D3): a move, no number changed; the sheets check proves the pixels.

import { FACING_ANGLE, FH, FW, ISO, OUTLINE } from "./rig.js";

// ---- colour ----

export function hexToRgb(hex) {
  const h = hex.replace("#", "");
  const n = parseInt(h.length === 3 ? h.split("").map((c) => c + c).join("") : h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function tone(rgb, k) {
  // k > 0 lightens toward white, k < 0 darkens toward black.
  return rgb.map((c) => Math.round(k > 0 ? c + (255 - c) * k : c * (1 + k)));
}

// ---- projection ----

export function facingVectors(facing) {
  const a = (FACING_ANGLE[facing] * Math.PI) / 180;
  const fx = Math.cos(a);
  const fy = Math.sin(a);
  return { fx, fy, rx: -fy, ry: fx };
}

export function project(F, l, d, h) {
  return {
    x: l * F.rx + d * F.fx,
    y: -h + (l * F.ry + d * F.fy) * ISO,
    depth: l * F.ry + d * F.fy,
  };
}

// ---- a tiny rasteriser ----

export class Frame {
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
  // The outline pixels carry the part that drew them (0 for none), so a pass
  // after drawing can tell whose outline is whose (mergeOutlines, cullPart).
  outline(part = 0) {
    if (!this.bbox) return;
    const [bx0, by0, bx1, by1] = this.bbox;
    const m = this.mask;
    for (let y = Math.max(0, by0 - 1); y <= Math.min(FH - 1, by1 + 1); y++) {
      for (let x = Math.max(0, bx0 - 1); x <= Math.min(FW - 1, bx1 + 1); x++) {
        const i = y * FW + x;
        if (m[i]) continue;
        const near = (x > 0 && m[i - 1]) || (x < FW - 1 && m[i + 1]) || (y > 0 && m[i - FW]) || (y < FH - 1 && m[i + FW]);
        if (near) this.set(i, OUTLINE, 1, part);
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
    if (outline) this.outline(part);
    this.fill(rgb, part);
  }

  ellipse(cx, cy, rx, ry, rgb, { outline = true, part = 0 } = {}) {
    this.begin();
    this.addEllipse(cx, cy, rx, ry);
    if (outline) this.outline(part);
    this.fill(rgb, part);
  }

  poly(points, rgb, { outline = true, part = 0 } = {}) {
    this.begin();
    this.addPoly(points);
    if (outline) this.outline(part);
    this.fill(rgb, part);
  }

  // A part that is mostly hidden shows a real piece of itself or nothing: fewer
  // than `minFill` fill pixels left of it (a far arm behind the torso, a sliver
  // beside the hip) and every pixel it still owns is cleared (Michael,
  // 2026-10-12: not enough to read as an arm, too much to go unnoticed).
  cullPart(part, minFill) {
    let n = 0;
    for (let i = 0; i < FW * FH; i++) if (this.part[i] === part && this.kind[i] === 2) n++;
    if (n === 0 || n >= minFill) return false;
    for (let i = 0; i < FW * FH; i++) if (this.part[i] === part) this.set(i, [0, 0, 0], 0, 0);
    return true;
  }

  // No double outline: where a vertical edge of a part `isMine` accepts (an arm)
  // stands right beside another part's vertical edge with no fill between,
  // the outline of the frontmost part (`priority`, higher is nearer) stays and
  // each other pixel of the run becomes what lies beyond it, that part's fill
  // if it is there, else nothing (Michael, 2026-10-12: if there is no column of
  // skin between two borders, do not draw both).
  mergeOutlines(isMine, priority) {
    for (let y = 0; y < FH; y++) {
      let x = 0;
      while (x < FW) {
        const row = y * FW;
        if (this.kind[row + x] !== 1) { x++; continue; }
        let x1 = x;
        while (x1 + 1 < FW && this.kind[row + x1 + 1] === 1) x1++;
        // Exactly two side by side, each on a vertical edge (an outline pixel above or
        // below it): two borders with no column of fill between. A longer run is a
        // horizontal edge (the neck line, a shoulder's top) and is left alone.
        const vertical = (k) => (y > 0 && this.kind[row - FW + k] === 1) || (y < FH - 1 && this.kind[row + FW + k] === 1);
        if (x1 === x + 1 && vertical(x) && vertical(x1)) {
          const parts = new Set();
          for (let k = x; k <= x1; k++) parts.add(this.part[row + k]);
          if (parts.size > 1 && [...parts].some(isMine)) {
            let keep = x;
            let best = -Infinity;
            for (let k = x; k <= x1; k++) {
              const pr = priority(this.part[row + k]);
              if (pr > best) { best = pr; keep = k; }
            }
            const kept = this.part[row + keep];
            for (let k = x; k <= x1; k++) {
              const i = row + k;
              if (this.part[i] === kept) continue;
              const out = k < keep ? k - 1 : k + 1;
              const j = row + out;
              if (out >= 0 && out < FW && this.kind[j] === 2 && this.part[j] === this.part[i]) this.set(i, [this.rgb[j * 3], this.rgb[j * 3 + 1], this.rgb[j * 3 + 2]], 2, this.part[j]);
              else this.set(i, [0, 0, 0], 0, 0);
            }
          }
        }
        x = x1 + 1;
      }
    }
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
