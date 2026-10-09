// Copied from cozy-zombie-game src/placeholders.js on 2026-10-09. Window panes made translucent.
// Placeholder sprite sheet generation. Everything here produces the same sheet
// shape that assets.js builds from a real PNG + JSON, so real art can replace
// any of it without code changes. See docs/03-rendering.md.

import { TW, TH, HW, HH } from "./iso.js";
import { shade, poly } from "./render-util.js";

function makeCanvas(w, h) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const ctx = c.getContext("2d");
  ctx.imageSmoothingEnabled = false;
  return { canvas: c, ctx };
}

// ---------------------------------------------------------------------------
// Flat floor tile: two frames, base and alternate, for a subtle checker.
// Anchor is the diamond center.
// ---------------------------------------------------------------------------
export function generateFlat(ph) {
  const { canvas, ctx } = makeCanvas(TW * 2, TH);
  const colors = [ph.color, ph.alt || ph.color];
  const frames = {};
  colors.forEach((color, i) => {
    const cx = i * TW + HW;
    const cy = HH;
    poly(ctx, [[cx, 0], [cx + HW, cy], [cx, TH], [cx - HW, cy]]);
    ctx.fillStyle = color;
    ctx.fill();
    ctx.strokeStyle = shade(ph.color, 0.85);
    ctx.lineWidth = 1;
    ctx.stroke();
    if (ph.lines) {
      // Furrows: lines parallel to the tile's north-east edge, for farm plots.
      ctx.save();
      poly(ctx, [[cx, 0], [cx + HW, cy], [cx, TH], [cx - HW, cy]]);
      ctx.clip();
      ctx.strokeStyle = ph.lines;
      ctx.lineWidth = 2;
      // Each furrow runs parallel to the south-west edge and is offset along
      // the north-west edge direction, so the set sweeps across the diamond.
      for (let k = 1; k <= 5; k++) {
        const ox = k * (HW / 3);
        ctx.beginPath();
        ctx.moveTo(cx - HW + ox, cy - ox / 2);
        ctx.lineTo(cx + ox, TH - ox / 2);
        ctx.stroke();
      }
      ctx.restore();
    }
    frames[`idle_${i}`] = [i * TW, 0, TW, TH];
  });
  return {
    image: canvas,
    frames,
    anchor: [HW, HH],
    animations: { idle: { fps: 0, loop: false, frames: 2 } },
    facings: [],
    mirror: {},
  };
}

// ---------------------------------------------------------------------------
// Wall segment: frames north_0 and west_0, plus door and window variants.
// Anchor is the tile center of the tile the segment belongs to.
// ---------------------------------------------------------------------------
// Wall thickness in screen pixels: the top face and end caps extend this far
// "behind" the wall plane, which sells the diorama look.
// Thicker than the parent's 6 px: thin reads modern, thick reads chonky and
// cosy (Michael, 2026-10-09).
export const WALL_T = 12;

export function generateWall(ph) {
  const h = ph.height;
  const T = ph.thickness ?? WALL_T;
  const fw = HW + T;
  const fh = HH + h + T / 2;
  const variants = ["plain", "door", "window", "window_shut", "window_broken", "boarded", "door_boarded", "stairs", "cap"];
  const sides = ["north", "west"];
  // Near-edge stubs (south, east): low cutaway walls with their own small frames.
  const nearVariants = ["plain", "door", "window", "window_shut", "window_broken", "boarded", "door_boarded", "stairs"];
  const nearSides = ["south", "east"];
  const nfw = HW;
  const nfh = NEAR_FRAME_H + HH;
  const { canvas, ctx } = makeCanvas(
    Math.max(fw * variants.length, nfw * nearVariants.length),
    fh * sides.length + nfh * nearSides.length,
  );
  const frames = {};
  nearSides.forEach((side, row) => {
    nearVariants.forEach((variant, col) => {
      const ox = col * nfw;
      const oy = fh * sides.length + row * nfh;
      drawNearVariant(ctx, ox, oy, side, variant, ph);
      frames[`${side}_${variant}_0`] = [ox, oy, nfw, nfh];
    });
  });
  sides.forEach((side, row) => {
    variants.forEach((variant, col) => {
      const ox = col * fw;
      const oy = row * fh;
      drawWallVariant(ctx, ox, oy, side, variant, ph, T);
      frames[`${side}_${variant}_0`] = [ox, oy, fw, fh];
    });
  });
  return {
    image: canvas,
    frames,
    // North frames extend T px to the right of the segment; west frames T px to the left.
    // Anchor is the tile's top vertex column for north, its left vertex column for west.
    anchor: [0, fh],
    anchorWest: [fw, fh],
    anchorSouth: [HW, NEAR_FRAME_H],
    anchorEast: [0, NEAR_FRAME_H],
    wallHeight: h,
    color: ph.color,
    pattern: ph.pattern || null,
    animations: {},
    facings: [],
    mirror: {},
  };
}

// Near-edge stub: a low wall along a near edge of an interior. Doors are gaps,
// windows are short frames standing on the stub.
export const NEAR_STUB = 8; // px, height of the stub
const NEAR_FRAME_H = 30; // px of headroom in a near frame, for window posts
const NEAR_WINDOW_H = 26;

function drawNearVariant(ctx, ox, oy, side, variant, ph) {
  if (variant.startsWith("door") || variant === "stairs") return; // a gap
  const color = ph.color;
  // South edge runs from the left vertex to the bottom vertex of the tile;
  // east edge from the bottom vertex to the right vertex.
  const a = side === "south" ? [0, NEAR_FRAME_H] : [0, NEAR_FRAME_H + HH];
  const b = side === "south" ? [HW, NEAR_FRAME_H + HH] : [HW, NEAR_FRAME_H];
  const lerp = (t, y) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t - y];
  ctx.save();
  ctx.translate(ox, oy);
  ctx.fillStyle = shade(color, side === "south" ? 0.62 : 0.5);
  poly(ctx, [a, b, [b[0], b[1] - NEAR_STUB], [a[0], a[1] - NEAR_STUB]]);
  ctx.fill();
  ctx.strokeStyle = shade(color, 1.1);
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(a[0], a[1] - NEAR_STUB);
  ctx.lineTo(b[0], b[1] - NEAR_STUB);
  ctx.stroke();

  if (variant.startsWith("window") || variant === "boarded") {
    const t0 = 0.2;
    const t1 = 0.8;
    if (variant === "window_shut") {
      ctx.fillStyle = shade(color, 0.42);
      poly(ctx, [lerp(t0, NEAR_STUB), lerp(t1, NEAR_STUB), lerp(t1, NEAR_WINDOW_H), lerp(t0, NEAR_WINDOW_H)]);
      ctx.fill();
    } else if (variant !== "window_broken") {
      // Open: nothing in the frame.
    } else {
      ctx.strokeStyle = "#cfe6f0";
      ctx.lineWidth = 1;
      const s0 = lerp(t0 + 0.05, NEAR_STUB);
      const s1 = lerp(t0 + 0.18, NEAR_STUB + 9);
      const s2 = lerp(t1 - 0.05, NEAR_STUB);
      const s3 = lerp(t1 - 0.2, NEAR_STUB + 7);
      ctx.beginPath();
      ctx.moveTo(s0[0], s0[1]);
      ctx.lineTo(s1[0], s1[1]);
      ctx.moveTo(s2[0], s2[1]);
      ctx.lineTo(s3[0], s3[1]);
      ctx.stroke();
    }
    // Frame: two posts and a top bar.
    ctx.strokeStyle = shade(color, 0.45);
    ctx.lineWidth = 2;
    ctx.beginPath();
    const p0 = lerp(t0, NEAR_STUB);
    const p1 = lerp(t0, NEAR_WINDOW_H);
    const p2 = lerp(t1, NEAR_WINDOW_H);
    const p3 = lerp(t1, NEAR_STUB);
    ctx.moveTo(p0[0], p0[1]);
    ctx.lineTo(p1[0], p1[1]);
    ctx.lineTo(p2[0], p2[1]);
    ctx.lineTo(p3[0], p3[1]);
    ctx.stroke();
    if (variant === "boarded") {
      ctx.strokeStyle = "#8a6a3a";
      ctx.lineWidth = 4;
      for (const yy of [NEAR_STUB + 4, NEAR_STUB + 11, NEAR_STUB + 18]) {
        const q0 = lerp(t0 - 0.06, yy);
        const q1 = lerp(t1 + 0.06, yy);
        ctx.beginPath();
        ctx.moveTo(q0[0], q0[1]);
        ctx.lineTo(q1[0], q1[1]);
        ctx.stroke();
      }
    }
  }
  ctx.restore();
}

function drawWallVariant(ctx, ox, oy, side, variant, ph, T) {
  const h = ph.height;
  const color = ph.color;
  // Thickness direction on screen: north walls extend up-right, west walls up-left.
  const off = side === "north" ? [T, -T / 2] : [-T, -T / 2];
  const shift = [side === "west" ? T : 0, T / 2];

  if (variant === "cap") {
    // End cap: the visible end face of the wall at its near end.
    ctx.save();
    ctx.translate(ox + shift[0], oy + shift[1]);
    const e = side === "north" ? [HW, h + HH] : [0, h + HH];
    const eTop = [e[0], e[1] - h];
    ctx.fillStyle = shade(color, side === "north" ? 0.62 : 0.5);
    poly(ctx, [eTop, e, [e[0] + off[0], e[1] + off[1]], [eTop[0] + off[0], eTop[1] + off[1]]]);
    ctx.fill();
    ctx.fillStyle = shade(color, 1.18);
    ctx.restore();
    return;
  }
  // Segment quad in local coords. North: from (0, h + HH) up-right to (HW, h + ... )
  // Local frame: width HW, height HH + h. Bottom edge is the tile edge.
  let a, b;
  if (side === "north") {
    // The north edge goes from the tile's top vertex (cx, cy - HH) to right vertex (cx + HW, cy).
    // In the local frame with origin at (cx, cy - HH - h): a = (0, h), b = (HW, h + HH).
    a = [0, h];
    b = [HW, h + HH];
  } else {
    // West edge goes from left vertex (cx - HW, cy) to top vertex (cx, cy - HH).
    // Local origin at (cx - HW, cy - HH - h): a = (0, h + HH), b = (HW, h).
    a = [0, h + HH];
    b = [HW, h];
  }
  const f = side === "north" ? 0.9 : 0.72;
  ctx.save();
  ctx.translate(ox + shift[0], oy + shift[1]);

  ctx.fillStyle = shade(color, f);
  poly(ctx, [a, b, [b[0], b[1] - h], [a[0], a[1] - h]]);
  ctx.fill();

  // Face pattern: planks are courses along the wall; bricks add staggered seams.
  if (ph.pattern) {
    const lerpP = (t, y) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t - y];
    const course = ph.pattern === "brick" ? 10 : 9;
    ctx.strokeStyle = shade(color, f * 0.82);
    ctx.lineWidth = 1;
    let row = 0;
    for (let y = course; y < h; y += course, row++) {
      const p0 = lerpP(0, y);
      const p1 = lerpP(1, y);
      ctx.beginPath();
      ctx.moveTo(p0[0], p0[1] + 0.5);
      ctx.lineTo(p1[0], p1[1] + 0.5);
      ctx.stroke();
      if (ph.pattern === "brick") {
        for (let t = row % 2 ? 0.25 : 0.5; t < 1; t += 0.5) {
          const q0 = lerpP(t, y);
          const q1 = lerpP(t, Math.min(h, y + course));
          ctx.beginPath();
          ctx.moveTo(q0[0] + 0.5, q0[1]);
          ctx.lineTo(q1[0] + 0.5, q1[1]);
          ctx.stroke();
        }
      }
    }
  }

  const isDoor = variant.startsWith("door") || variant === "stairs";
  const isWindow = variant.startsWith("window") || variant === "boarded";
  if (isDoor || isWindow) {
    // A rectangle-ish opening on the wall plane. Parametrize along the edge: t in [0,1].
    const lerp = (t, y) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t - y];
    const t0 = isDoor ? 0.2 : 0.25;
    const t1 = isDoor ? 0.8 : 0.75;
    const y0 = isDoor ? 0 : h * 0.35;
    const y1 = isDoor ? h * 0.8 : h * 0.8;
    const quad = [lerp(t0, y0), lerp(t1, y0), lerp(t1, y1), lerp(t0, y1)];
    if (isDoor) {
      // Doors are open doorways: the opening is punched out after the wall is
      // finished (below), so the threshold tile and whatever stands in the
      // doorway show through. Nothing to draw here.
    } else {
      // Windows are open holes with a frame: no glass in this village, shutters
      // later (Michael, 2026-10-09). The hole is punched out after the wall is
      // finished, below, so the room shows through.
    }
    if (variant === "boarded" || variant === "door_boarded") {
      ctx.strokeStyle = "#8a6a3a";
      ctx.lineWidth = 4;
      for (const yy of [0.2, 0.5, 0.8]) {
        const p0 = lerp(t0 - 0.05, y0 + (y1 - y0) * yy);
        const p1 = lerp(t1 + 0.05, y0 + (y1 - y0) * yy);
        ctx.beginPath();
        ctx.moveTo(p0[0], p0[1]);
        ctx.lineTo(p1[0], p1[1]);
        ctx.stroke();
      }
    }
  }

  // Top face (wall thickness) and baseboard
  const aTop = [a[0], a[1] - h];
  const bTop = [b[0], b[1] - h];
  ctx.fillStyle = shade(color, 1.18);
  poly(ctx, [aTop, bTop, [bTop[0] + off[0], bTop[1] + off[1]], [aTop[0] + off[0], aTop[1] + off[1]]]);
  ctx.fill();
  ctx.strokeStyle = shade(color, 0.6);
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(aTop[0], aTop[1]);
  ctx.lineTo(bTop[0], bTop[1]);
  ctx.stroke();
  ctx.strokeStyle = shade(color, 0.5);
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(a[0], a[1]);
  ctx.lineTo(b[0], b[1]);
  ctx.stroke();

  if (isWindow) {
    const lerp = (t, y) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t - y];
    const t0 = 0.25;
    const t1 = 0.75;
    const y0 = h * 0.35;
    const y1 = h * 0.8;
    const quad = [lerp(t0, y0), lerp(t1, y0), lerp(t1, y1), lerp(t0, y1)];
    const shutter = shade(color, 0.42);
    if (variant === "window_shut") {
      // Closed shutters: two leaves of planks over the opening.
      ctx.fillStyle = shutter;
      poly(ctx, quad);
      ctx.fill();
      ctx.strokeStyle = shade(color, 0.3);
      ctx.lineWidth = 1;
      const mid = lerp((t0 + t1) / 2, y0);
      const midB = lerp((t0 + t1) / 2, y1);
      ctx.beginPath();
      ctx.moveTo(mid[0], mid[1]);
      ctx.lineTo(midB[0], midB[1]);
      ctx.stroke();
      for (const yy of [0.3, 0.6]) {
        const p0 = lerp(t0, y0 + (y1 - y0) * yy);
        const p1 = lerp(t1, y0 + (y1 - y0) * yy);
        ctx.beginPath();
        ctx.moveTo(p0[0], p0[1]);
        ctx.lineTo(p1[0], p1[1]);
        ctx.stroke();
      }
    } else {
      ctx.globalCompositeOperation = "destination-out";
      poly(ctx, quad);
      ctx.fill();
      ctx.globalCompositeOperation = "source-over";
      // Open shutters: a leaf folded back against the wall on each side.
      const lw = 0.09;
      ctx.fillStyle = shutter;
      poly(ctx, [lerp(t0 - lw, y0), lerp(t0, y0), lerp(t0, y1), lerp(t0 - lw, y1)]);
      ctx.fill();
      poly(ctx, [lerp(t1, y0), lerp(t1 + lw, y0), lerp(t1 + lw, y1), lerp(t1, y1)]);
      ctx.fill();
    }
    ctx.strokeStyle = shade(color, 0.45);
    ctx.lineWidth = 2;
    poly(ctx, quad);
    ctx.stroke();
    // Sill: a lighter ledge along the bottom of the opening.
    ctx.strokeStyle = shade(color, 1.15);
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(quad[3][0], quad[3][1] - 1);
    ctx.lineTo(quad[2][0], quad[2][1] - 1);
    ctx.stroke();
  }
  if (isDoor) {
    // Punch the doorway out of the finished wall, then draw jambs and lintel edge.
    const lerp = (t, y) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t - y];
    const t0 = 0.18;
    const t1 = 0.82;
    const y1 = h * 0.82;
    const quad = [lerp(t0, 0), lerp(t1, 0), lerp(t1, y1), lerp(t0, y1)];
    ctx.globalCompositeOperation = "destination-out";
    poly(ctx, quad);
    ctx.fill();
    ctx.globalCompositeOperation = "source-over";
    ctx.strokeStyle = shade(color, 0.45);
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(quad[0][0], quad[0][1]);
    ctx.lineTo(quad[3][0], quad[3][1]);
    ctx.lineTo(quad[2][0], quad[2][1]);
    ctx.lineTo(quad[1][0], quad[1][1]);
    ctx.stroke();
    if (variant === "stairs") {
      // Steps climbing into the opening.
      for (let k = 0; k < 5; k++) {
        const yy = y1 * (0.12 + k * 0.16);
        const p0 = lerp(t0 + 0.04, yy);
        const p1 = lerp(t1 - 0.04, yy);
        ctx.strokeStyle = shade(color, 0.85 - k * 0.08);
        ctx.lineWidth = 5;
        ctx.beginPath();
        ctx.moveTo(p0[0], p0[1]);
        ctx.lineTo(p1[0], p1[1]);
        ctx.stroke();
      }
    }
    if (variant === "door_boarded") {
      ctx.strokeStyle = "#8a6a3a";
      ctx.lineWidth = 4;
      for (const yy of [0.25, 0.5, 0.75]) {
        const p0 = lerp(t0 - 0.05, y1 * yy);
        const p1 = lerp(t1 + 0.05, y1 * yy);
        ctx.beginPath();
        ctx.moveTo(p0[0], p0[1]);
        ctx.lineTo(p1[0], p1[1]);
        ctx.stroke();
      }
    }
  }
  ctx.restore();
}

// ---------------------------------------------------------------------------
// Box prop: one frame per footprint tile (all identical for placeholders).
// Anchor is the tile center.
// ---------------------------------------------------------------------------
export function generateBox(ph, tileCount = 1) {
  const h = ph.height;
  const inset = ph.inset || 0;
  const fw = TW;
  const fh = TH + h;
  const { canvas, ctx } = makeCanvas(fw, fh);
  const cx = HW;
  const cy = h + HH;
  const hw = HW - inset;
  const hh = HH - inset / 2;
  const color = ph.color;
  const top = [[cx, cy - hh - h], [cx + hw, cy - h], [cx, cy + hh - h], [cx - hw, cy - h]];
  const left = [[cx - hw, cy], [cx, cy + hh], [cx, cy + hh - h], [cx - hw, cy - h]];
  const right = [[cx, cy + hh], [cx + hw, cy], [cx + hw, cy - h], [cx, cy + hh - h]];
  ctx.fillStyle = shade(color, 0.72);
  poly(ctx, left);
  ctx.fill();
  ctx.fillStyle = shade(color, 0.55);
  poly(ctx, right);
  ctx.fill();
  ctx.fillStyle = color;
  poly(ctx, top);
  ctx.fill();
  ctx.strokeStyle = shade(color, 0.4);
  ctx.lineWidth = 1;
  poly(ctx, top);
  ctx.stroke();
  const frames = {};
  for (let i = 0; i < tileCount; i++) frames[`idle_${i}`] = [0, 0, fw, fh];
  return {
    image: canvas,
    frames,
    anchor: [cx, cy],
    animations: { idle: { fps: 0, loop: false, frames: 1 } },
    facings: [],
    mirror: {},
  };
}

// ---------------------------------------------------------------------------
// Post prop: trunk plus a blob. Trees, lamps, plants. Anchor is the tile center.
// ---------------------------------------------------------------------------
export function generatePost(ph) {
  const h = ph.height;
  const width = ph.width;
  const fw = Math.max(TW, width + 4);
  const fh = h + TH;
  const { canvas, ctx } = makeCanvas(fw, fh);
  const cx = fw / 2;
  const cy = h + HH;
  const color = ph.color;
  const trunkW = Math.max(4, Math.round(width / 4));
  ctx.fillStyle = shade(color, 0.45);
  ctx.fillRect(cx - trunkW / 2, cy - h + width / 2, trunkW, h - width / 2);
  ctx.fillStyle = "rgba(0,0,0,0.25)";
  ctx.beginPath();
  ctx.ellipse(cx, cy, width / 2, width / 4, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.ellipse(cx, cy - h + width / 2, width / 2, width / 2, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = shade(color, 1.2);
  ctx.beginPath();
  ctx.ellipse(cx - width / 6, cy - h + width / 3, width / 5, width / 5, 0, 0, Math.PI * 2);
  ctx.fill();
  return {
    image: canvas,
    frames: { idle_0: [0, 0, fw, fh] },
    anchor: [cx, cy],
    // Visible extent within the frame, for occlusion tests. Posts are narrow.
    bounds: { x: cx - width / 2 - 2, y: 0, w: width + 4, h: fh },
    animations: { idle: { fps: 0, loop: false, frames: 1 } },
    facings: [],
    mirror: {},
  };
}

// ---------------------------------------------------------------------------
// Character: blocky big-headed figure. Facings s, sw, w, nw, n drawn; se, e, ne
// mirrored. Animations idle, walk, attack, hurt, die.
// ---------------------------------------------------------------------------
const FW = 48;
const FH = 72;
const FEET_X = 24;
const FEET_Y = 66;

const CHAR_ANIMS = {
  idle: { fps: 2, loop: true, frames: 2 },
  walk: { fps: 8, loop: true, frames: 4 },
  attack: { fps: 12, loop: false, frames: 4, activeFrame: 1 },
  hurt: { fps: 10, loop: false, frames: 2 },
  die: { fps: 8, loop: false, frames: 4 },
};

const DEFAULT_PALETTES = {
  player: { skin: "#f2c9a0", hair: "#5a3a20", shirt: "#e8b84a", pants: "#40609a", shoes: "#3a2a1a", eyes: "#202020", arms: "down" },
  zombie: { skin: "#9fbf88", hair: "#3a4a30", shirt: "#7a6a8a", pants: "#4a4a5a", shoes: "#2a2a2a", eyes: "#401818", arms: "forward" },
};

export function generateCharacter(ph) {
  const palette = { ...DEFAULT_PALETTES[ph.variant || "player"], ...(ph.palette || {}) };
  const facings = ph.facings || ["s", "sw", "w", "nw", "n"];
  const mirror = ph.mirror || { se: "sw", e: "w", ne: "nw" };
  const animNames = Object.keys(CHAR_ANIMS);
  const totalFrames = animNames.reduce((n, a) => n + CHAR_ANIMS[a].frames, 0);
  const { canvas, ctx } = makeCanvas(FW * totalFrames, FH * facings.length);
  const frames = {};
  facings.forEach((facing, row) => {
    let col = 0;
    for (const anim of animNames) {
      const count = CHAR_ANIMS[anim].frames;
      for (let i = 0; i < count; i++) {
        const ox = col * FW;
        const oy = row * FH;
        ctx.save();
        ctx.translate(ox + FEET_X, oy + FEET_Y);
        drawFigure(ctx, facing, anim, i, palette);
        ctx.restore();
        frames[`${anim}_${facing}_${i}`] = [ox, oy, FW, FH];
        col++;
      }
    }
  });
  return {
    image: canvas,
    frames,
    anchor: [FEET_X, FEET_Y],
    animations: CHAR_ANIMS,
    facings,
    mirror,
  };
}

// Draw a figure with feet at (0, 0). Facing is one of s, sw, w, nw, n.
function drawFigure(ctx, facing, anim, i, pal) {
  // Shadow
  ctx.fillStyle = "rgba(0,0,0,0.28)";
  ctx.beginPath();
  ctx.ellipse(0, 0, 12, 5, 0, 0, Math.PI * 2);
  ctx.fill();

  if (anim === "die") {
    drawDying(ctx, facing, i, pal);
    return;
  }

  const flash = anim === "hurt" && i === 0;
  const col = (c) => (flash ? "#ffffff" : c);

  // Pose parameters
  let bob = 0;
  let legL = 0; // 0 neutral, positive lifts
  let legR = 0;
  if (anim === "walk") {
    const cycle = [1, 0, -1, 0][i];
    legL = cycle > 0 ? 3 : 0;
    legR = cycle < 0 ? 3 : 0;
    bob = i % 2 === 0 ? -1 : 0;
  }
  if (anim === "idle" && i === 1) bob = 1;

  const y0 = bob;
  const side = facing === "w" || facing === "nw" || facing === "sw";
  const back = facing === "n" || facing === "nw";
  const profile = facing === "w";

  // Legs
  const legW = 5;
  const legH = 13;
  const legGap = profile ? 1 : 3;
  ctx.fillStyle = col(pal.pants);
  ctx.fillRect(-legGap - legW, -legH + y0 - legL, legW, legH + legL);
  ctx.fillRect(legGap, -legH + y0 - legR, legW, legH + legL * 0 + legR);
  ctx.fillStyle = col(pal.shoes);
  ctx.fillRect(-legGap - legW - 1, -3 + y0 - legL, legW + 1, 3);
  ctx.fillRect(legGap, -3 + y0 - legR, legW + 1, 3);

  // Body
  const bodyW = profile ? 10 : 14;
  const bodyTop = -30 + y0;
  ctx.fillStyle = col(pal.shirt);
  ctx.fillRect(-bodyW / 2, bodyTop, bodyW, 18);
  if (!back && !profile) {
    // Collar / detail
    ctx.fillStyle = col(shade(pal.shirt, 0.8));
    ctx.fillRect(-2, bodyTop, 4, 4);
  }

  // Arms
  drawArms(ctx, facing, anim, i, pal, col, bodyTop, side, profile, back);

  // Head
  const headW = 16;
  const headH = 14;
  const headTop = bodyTop - headH - 1;
  const headX = profile ? -headW / 2 - 1 : -headW / 2;
  ctx.fillStyle = col(pal.skin);
  ctx.fillRect(headX, headTop, headW, headH);
  // Hair: cap on top, plus the back of the head when facing away.
  ctx.fillStyle = col(pal.hair);
  ctx.fillRect(headX - 1, headTop - 2, headW + 2, 5);
  if (back) {
    ctx.fillRect(headX - 1, headTop - 2, headW + 2, facing === "n" ? headH + 1 : headH - 4);
  } else if (facing === "nw") {
    ctx.fillRect(headX - 1, headTop - 2, headW - 4, headH - 2);
  }
  // Face
  if (!back) {
    ctx.fillStyle = col(pal.eyes);
    const eyeY = headTop + 6;
    if (facing === "s") {
      ctx.fillRect(-5, eyeY, 2, 2);
      ctx.fillRect(3, eyeY, 2, 2);
    } else if (facing === "sw") {
      ctx.fillRect(-7, eyeY, 2, 2);
      ctx.fillRect(0, eyeY, 2, 2);
    } else if (facing === "w") {
      ctx.fillRect(headX + 2, eyeY, 2, 2);
    }
  }
  if (facing === "nw") {
    ctx.fillStyle = col(pal.eyes);
    ctx.fillRect(headX + 1, headTop + 6, 2, 2);
  }
}

function drawArms(ctx, facing, anim, i, pal, col, bodyTop, side, profile, back) {
  const armW = 4;
  const armH = 14;
  const forward = pal.arms === "forward";
  const attacking = anim === "attack";
  // Direction the figure faces on screen, for extending arms.
  const dir = { s: [0, 1], sw: [-1, 0.5], w: [-1, 0], nw: [-1, -0.5], n: [0, -1] }[facing];

  if (!forward && !attacking) {
    ctx.fillStyle = col(pal.skin);
    if (profile) {
      ctx.fillRect(-2, bodyTop + 2, armW, armH);
    } else {
      ctx.fillRect(-7 - armW, bodyTop + 2, armW, armH);
      ctx.fillRect(7, bodyTop + 2, armW, armH);
    }
    return;
  }

  // Extended arms (zombie idle or attack). Reach grows on the active frame.
  let reach = forward ? 12 : 0;
  if (attacking) reach = [4, 16, 14, 6][i];
  const ay = bodyTop + 4;
  ctx.fillStyle = col(pal.skin);
  if (facing === "s") {
    // Toward the viewer: arms hang forward and low, drawn as two stubs below chest.
    ctx.fillRect(-7 - armW + 2, ay + 6, armW, Math.max(6, reach * 0.6));
    ctx.fillRect(7 - 2, ay + 6, armW, Math.max(6, reach * 0.6));
  } else if (facing === "n") {
    ctx.fillRect(-7 - armW, ay, armW, 8);
    ctx.fillRect(7, ay, armW, 8);
  } else {
    // Sideways: a horizontal arm extending in the facing direction.
    const len = reach + 6;
    const x0 = dir[0] < 0 ? -len - 2 : 2;
    ctx.fillRect(x0, ay + (dir[1] > 0 ? 3 : dir[1] < 0 ? -2 : 0), len, armW);
    if (!profile) ctx.fillRect(x0 + (dir[0] < 0 ? 2 : -2), ay + 5, len - 2, armW - 1);
  }
  if (attacking && i === 1) {
    // Weapon flash at the reach point.
    ctx.fillStyle = col("#ffffff");
    const ex = dir[0] * (reach + 10);
    const ey = ay + dir[1] * (reach + 6);
    ctx.fillRect(ex - 2, ey - 2, 4, 4);
  }
}

function drawDying(ctx, facing, i, pal) {
  // Progressively tilt, then lie down.
  if (i < 3) {
    const t = i / 3;
    ctx.save();
    ctx.translate(0, 0);
    ctx.rotate((facing === "w" || facing === "sw" || facing === "nw" ? -1 : 1) * t * Math.PI * 0.45);
    ctx.scale(1, 1 - t * 0.35);
    drawFigure(ctx, facing, "idle", 0, { ...pal, arms: "down" });
    ctx.restore();
    return;
  }
  // Lying body
  ctx.fillStyle = pal.pants;
  ctx.fillRect(-14, -8, 12, 7);
  ctx.fillStyle = pal.shirt;
  ctx.fillRect(-4, -9, 14, 8);
  ctx.fillStyle = pal.skin;
  ctx.fillRect(10, -11, 10, 10);
  ctx.fillStyle = pal.hair;
  ctx.fillRect(16, -12, 5, 11);
  ctx.fillStyle = pal.eyes;
  ctx.fillRect(12, -7, 2, 1);
  ctx.fillRect(12, -5, 2, 1);
}
