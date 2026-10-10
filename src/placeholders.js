// Copied from cozy-zombie-game src/placeholders.js on 2026-10-09 and re-themed
// the same day for docs/06-art.md: thick patterned walls, windows as shuttered
// holes with no glass, plank doors and leaves with metal strips, brown-trunked
// trees, the jack-o'-lantern, sleeves on the player.
// Placeholder sprite sheet generation. Everything here produces the same sheet
// shape that assets.js builds from a real PNG + JSON, so real art can replace
// any of it without code changes. (The parent's docs/03-rendering.md describes
// the sheet shape; this repo's docs/06 holds the palette.)

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
    // The outline drew the grid on every floor; the earth kinds go without it
    // (`outline: false`) now that the ground is baked (docs/15).
    if (ph.outline !== false) {
      ctx.strokeStyle = shade(ph.color, 0.85);
      ctx.lineWidth = 1;
      ctx.stroke();
    }
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

// Fittings are the same wood everywhere, whatever the wall: doors and shutters
// are vertical planks with dark metal strips across them (Michael, 2026-10-09:
// "I know this is not a thing but I like how it sounds").
export const WOOD = "#5e4028";
export const METAL = "#2b2a32";

// A plank leaf in the quad [p0, p1, p2, p3] (p0 and p3 are the bottom corners,
// p1 and p2 the top), with `strips` metal bands across it.
export function drawPlankLeaf(ctx, quad, strips = 2, shadeF = 1) {
  const [p0, p1, p2, p3] = quad;
  const lerp = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
  ctx.fillStyle = shade(WOOD, shadeF);
  poly(ctx, quad);
  ctx.fill();
  ctx.strokeStyle = shade(WOOD, shadeF * 0.7);
  ctx.lineWidth = 1;
  for (const t of [0.33, 0.66]) {
    const a = lerp(p0, p3, t);
    const b = lerp(p1, p2, t);
    ctx.beginPath();
    ctx.moveTo(a[0] + 0.5, a[1]);
    ctx.lineTo(b[0] + 0.5, b[1]);
    ctx.stroke();
  }
  ctx.strokeStyle = METAL;
  ctx.lineWidth = 3;
  const bands = strips === 1 ? [0.5] : [0.3, 0.7];
  for (const t of bands) {
    const a = lerp(p0, p1, t);
    const b = lerp(p3, p2, t);
    ctx.beginPath();
    ctx.moveTo(a[0], a[1]);
    ctx.lineTo(b[0], b[1]);
    ctx.stroke();
  }
  ctx.strokeStyle = shade(WOOD, shadeF * 0.5);
  ctx.lineWidth = 1;
  poly(ctx, quad);
  ctx.stroke();
}

export function generateWall(ph) {
  const h = ph.height;
  const T = ph.thickness ?? WALL_T;
  const fw = HW + T;
  const fh = HH + h + T / 2;
  // Boards (docs/09): one frame per count, over a shut leaf and over an open
  // or broken one, so one plank looks like one plank (Michael, 2026-10-10).
  const boardVariants = [];
  for (let n = 1; n <= 3; n++) boardVariants.push(`boarded${n}`, `window_shut_boarded${n}`, `door_boarded${n}`, `door_shut_boarded${n}`);
  const variants = ["plain", "door", "door_shut", "window", "window_shut", "window_broken", "stairs", "cap", ...boardVariants];
  const sides = ["north", "west"];
  // Near-edge stubs (south, east): low cutaway walls with their own small frames.
  const nearVariants = ["plain", "door", "door_shut", "window", "window_shut", "window_broken", "boarded", "door_boarded", "stairs"];
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
  if ((variant.startsWith("door") && variant !== "door_shut") || variant === "stairs") return; // a gap
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

  if (variant === "door_shut") {
    // A closed door on a stub: a short plank panel standing in the gap.
    const lerpD = (t, y) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t - y];
    drawPlankLeaf(ctx, [lerpD(0.18, 0), lerpD(0.18, NEAR_WINDOW_H), lerpD(0.82, NEAR_WINDOW_H), lerpD(0.82, 0)], 2);
    ctx.restore();
    return;
  }
  if (variant.startsWith("window") || variant === "boarded") {
    const t0 = 0.2;
    const t1 = 0.8;
    if (variant === "window_shut") {
      drawPlankLeaf(ctx, [lerp(t0, NEAR_STUB), lerp(t0, NEAR_WINDOW_H), lerp(t1, NEAR_WINDOW_H), lerp(t1, NEAR_STUB)], 1);
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

function drawWallVariant(ctx, ox, oy, side, variantName, ph, T) {
  const h = ph.height;
  const color = ph.color;
  // "door_shut_boarded2": the base variant and how many boards cross it.
  const boards = /\d$/.test(variantName) ? Number(variantName.slice(-1)) : 0;
  const variant = boards ? variantName.slice(0, -1) : variantName;
  // Planks nailed across an opening, outermost first: a few slots, the first
  // `n` filled.
  const drawBoards = (lerp, t0, t1, y0, y1, n) => {
    ctx.strokeStyle = "#8a6a3a";
    ctx.lineWidth = 4;
    for (const yy of [0.5, 0.22, 0.78].slice(0, n)) {
      const p0 = lerp(t0 - 0.05, y0 + (y1 - y0) * yy);
      const p1 = lerp(t1 + 0.05, y0 + (y1 - y0) * yy);
      ctx.beginPath();
      ctx.moveTo(p0[0], p0[1]);
      ctx.lineTo(p1[0], p1[1]);
      ctx.stroke();
    }
  };
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
    const course = ph.pattern === "brick" ? 10 : ph.pattern === "log" ? 12 : 9;
    ctx.strokeStyle = shade(color, f * (ph.pattern === "log" ? 0.66 : 0.82));
    ctx.lineWidth = 1;
    let row = 0;
    for (let y = course; y < h; y += course, row++) {
      const p0 = lerpP(0, y);
      const p1 = lerpP(1, y);
      ctx.beginPath();
      ctx.moveTo(p0[0], p0[1] + 0.5);
      ctx.lineTo(p1[0], p1[1] + 0.5);
      ctx.stroke();
      if (ph.pattern === "log") {
        // Each log is round: a lit line a few pixels above its lower seam, and a darker one just under it.
        const hi = [lerpP(0, y - 4), lerpP(1, y - 4)];
        ctx.strokeStyle = shade(color, f * 1.2);
        ctx.beginPath();
        ctx.moveTo(hi[0][0], hi[0][1] + 0.5);
        ctx.lineTo(hi[1][0], hi[1][1] + 0.5);
        ctx.stroke();
        ctx.strokeStyle = shade(color, f * 0.66);
      }
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
  const shutLeaf = variant === "window_shut" || variant === "window_shut_boarded" || variant === "door_shut" || variant === "door_shut_boarded";
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
    if (shutLeaf) {
      // Closed shutters: two plank leaves meeting in the middle, one band each.
      const tm = (t0 + t1) / 2;
      drawPlankLeaf(ctx, [lerp(t0, y0), lerp(t0, y1), lerp(tm, y1), lerp(tm, y0)], 1);
      drawPlankLeaf(ctx, [lerp(tm, y0), lerp(tm, y1), lerp(t1, y1), lerp(t1, y0)], 1);
    } else {
      // Open: a hole. The swung-out leaves are drawn by the renderer, which
      // knows which side of the wall is outside.
      ctx.globalCompositeOperation = "destination-out";
      poly(ctx, quad);
      ctx.fill();
      ctx.globalCompositeOperation = "source-over";
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
    if (boards) drawBoards(lerp, t0, t1, y0, y1, boards);
  }
  if (isDoor) {
    // Punch the doorway out of the finished wall, then draw jambs and lintel edge.
    const lerp = (t, y) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t - y];
    const t0 = 0.18;
    const t1 = 0.82;
    const y1 = h * 0.82;
    const quad = [lerp(t0, 0), lerp(t1, 0), lerp(t1, y1), lerp(t0, y1)];
    if (shutLeaf) {
      // A closed door: one plank leaf with two metal bands, filling the doorway.
      drawPlankLeaf(ctx, [lerp(t0, 0), lerp(t0, y1), lerp(t1, y1), lerp(t1, 0)], 2);
    } else {
      ctx.globalCompositeOperation = "destination-out";
      poly(ctx, quad);
      ctx.fill();
      ctx.globalCompositeOperation = "source-over";
    }
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
    if (boards) drawBoards(lerp, t0, t1, 0, y1, boards);
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
  // Trunks are brown, whatever the canopy (Michael, 2026-10-09); a post with no
  // `trunk` keeps the parent's darker-shade rule, which suits barrels and lamps.
  ctx.fillStyle = ph.trunk || shade(color, 0.45);
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
// Tree: a split from generatePost (2026-10-11, Michael: the tree variety and
// palette are fine, the models are flat, give the trunk and canopy the pass
// the figure got). Posts stay the round blob-on-a-stick for barrels and lamps,
// where that reads fine; trees get their own shape, still code not art, aimed
// at a halfway point between a drawn treetop and a circle on a pole. The
// canopy is a lumpy polygon, not a ring of perfect circles, on purpose: a
// cartoon-round outline reads "happy", and these palettes have to carry
// Gloomwood's blue and purple canopies later (docs/06) without the shape
// itself fighting that mood. Deterministic per spec (seeded on its own
// height and width), so the same tree looks the same every boot.
// ---------------------------------------------------------------------------

function seeded(seed) {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    s >>>= 0;
    return s / 4294967296;
  };
}

// Points jittered around a centre, for an outline that bulges and dents
// rather than running a true circle. Returned separately from the path
// (below) so the same points can be filled, shaded, and stroked as one shape.
function blobPoints(cx, cy, r, rnd, { count = 10, jitter = 0.3, squashY = 0.86 } = {}) {
  const pts = [];
  for (let i = 0; i < count; i++) {
    const a = (i / count) * Math.PI * 2;
    const rr = r * (1 - jitter / 2 + rnd() * jitter);
    pts.push([cx + Math.cos(a) * rr, cy + Math.sin(a) * rr * squashY]);
  }
  return pts;
}

// A smooth-ish path through jittered points: curves to each point's midpoint
// with its neighbour, so the bulges round off instead of reading as spikes.
function blobPath(ctx, pts) {
  const n = pts.length;
  const mid = (a, b) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
  const m0 = mid(pts[n - 1], pts[0]);
  ctx.beginPath();
  ctx.moveTo(m0[0], m0[1]);
  for (let i = 0; i < n; i++) {
    const next = pts[(i + 1) % n];
    const m = mid(pts[i], next);
    ctx.quadraticCurveTo(pts[i][0], pts[i][1], m[0], m[1]);
  }
  ctx.closePath();
}

export function generateTree(ph) {
  const h = ph.height;
  const width = ph.width;
  const fw = Math.max(TW, Math.ceil(width * 1.3));
  const fh = h + TH;
  const { canvas, ctx } = makeCanvas(fw, fh);
  const cx = fw / 2;
  const cy = h + HH;
  const color = ph.color;
  const trunkColor = ph.trunk || shade(color, 0.45);
  const rnd = seeded(Math.round(width * 31 + h * 7));

  // Ground shadow, unchanged from the post.
  ctx.fillStyle = "rgba(0,0,0,0.25)";
  ctx.beginPath();
  ctx.ellipse(cx, cy, width / 2, width / 4, 0, 0, Math.PI * 2);
  ctx.fill();

  // Trunk: a tapered trapezoid with a root flare at the base, not a rectangle,
  // and two bark streaks (one lit, one dark, off-centre) for a smidge of
  // texture. It runs up to the canopy's own centre, same as the post did, so
  // it disappears into the lumps rather than poking out the top.
  const canopyCy = cy - h + width / 2;
  const baseW = Math.max(5, Math.round(width / 3.2));
  const topW = Math.max(3, Math.round(baseW * 0.55));
  const flare = baseW * 0.4;
  const flareH = baseW * 0.45;
  ctx.fillStyle = trunkColor;
  poly(ctx, [
    [cx - baseW / 2 - flare, cy],
    [cx - baseW / 2, cy - flareH],
    [cx - topW / 2, canopyCy],
    [cx + topW / 2, canopyCy],
    [cx + baseW / 2, cy - flareH],
    [cx + baseW / 2 + flare, cy],
  ]);
  ctx.fill();
  ctx.lineWidth = 1;
  ctx.strokeStyle = shade(trunkColor, 1.3);
  ctx.beginPath();
  ctx.moveTo(cx - baseW / 5, cy - 2);
  ctx.lineTo(cx - topW / 5, canopyCy + 3);
  ctx.stroke();
  ctx.strokeStyle = shade(trunkColor, 0.65);
  ctx.beginPath();
  ctx.moveTo(cx + baseW / 6, cy - 3);
  ctx.lineTo(cx + topW / 6, canopyCy + 4);
  ctx.stroke();

  // Canopy: one lumpy base shape (shaded underside, then the flat colour over
  // it, then an outline in its own hue), plus a small shadow lobe and a small
  // highlight lobe, each its own jittered blob rather than a nested circle.
  const basePts = blobPoints(cx, canopyCy + 2, width / 2, rnd, { count: 11, jitter: 0.32 });
  blobPath(ctx, basePts);
  ctx.fillStyle = shade(color, 0.78);
  ctx.fill();

  const facePts = blobPoints(cx, canopyCy, width * 0.47, rnd, { count: 10, jitter: 0.28 });
  blobPath(ctx, facePts);
  ctx.fillStyle = color;
  ctx.fill();
  blobPath(ctx, facePts);
  ctx.lineWidth = 1;
  ctx.strokeStyle = shade(color, 0.58);
  ctx.stroke();

  const shPts = blobPoints(cx + width * 0.16, canopyCy + width * 0.14, width * 0.26, rnd, { count: 8, jitter: 0.3 });
  blobPath(ctx, shPts);
  ctx.fillStyle = shade(color, 0.68);
  ctx.globalAlpha = 0.5;
  ctx.fill();
  ctx.globalAlpha = 1;

  const hiPts = blobPoints(cx - width * 0.15, canopyCy - width * 0.14, width * 0.22, rnd, { count: 8, jitter: 0.3 });
  blobPath(ctx, hiPts);
  ctx.fillStyle = shade(color, 1.18);
  ctx.fill();

  return {
    image: canvas,
    frames: { idle_0: [0, 0, fw, fh] },
    anchor: [cx, cy],
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
// Characters are drawn by figure.js (docs/12) since 2026-10-10; the old
// rectangle figure lived here until then.

export function generatePumpkin(ph) {
  const fw = 64;
  const fh = 56;
  const frames = 3;
  const { canvas, ctx } = makeCanvas(fw * frames, fh * 2);
  const glowColors = ["#ffb347", "#ffd37a", "#ff9a2e"];
  const glowAlpha = [0.5, 0.65, 0.42];
  const body = ph.color || "#c8692a";
  const face = (cx, cy, color) => {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(cx - 8, cy - 1);
    ctx.lineTo(cx - 3, cy - 1);
    ctx.lineTo(cx - 5.5, cy - 6);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(cx + 3, cy - 1);
    ctx.lineTo(cx + 8, cy - 1);
    ctx.lineTo(cx + 5.5, cy - 6);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(cx - 1.5, cy + 2.5);
    ctx.lineTo(cx + 1.5, cy + 2.5);
    ctx.lineTo(cx, cy);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(cx - 9, cy + 4);
    ctx.lineTo(cx - 6, cy + 7);
    ctx.lineTo(cx - 4, cy + 4.5);
    ctx.lineTo(cx - 1, cy + 8);
    ctx.lineTo(cx + 1, cy + 4.5);
    ctx.lineTo(cx + 4, cy + 8);
    ctx.lineTo(cx + 6, cy + 4.5);
    ctx.lineTo(cx + 9, cy + 4);
    ctx.lineTo(cx + 6, cy + 9);
    ctx.lineTo(cx - 6, cy + 9);
    ctx.closePath();
    ctx.fill();
    // A tooth or two left in the grin.
    ctx.fillStyle = body;
    ctx.fillRect(cx - 3, cy + 6, 2, 3);
    ctx.fillRect(cx + 2, cy + 6, 2, 3);
  };
  const w = 26;
  const h = 20;
  const base = fh - 14; // ground point sits at the tile centre, anchor below
  const cy = base - h / 2 - 2;
  for (let i = 0; i < frames; i++) {
    const ox = i * fw;
    const cx = ox + fw / 2;
    // Body: a squat ellipse with ridges, and the carved face unlit.
    ctx.fillStyle = body;
    ctx.beginPath();
    ctx.ellipse(cx, cy, w / 2, h / 2, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = shade(body, 0.7);
    ctx.lineWidth = 1;
    for (const rx of [-8, -3, 3, 8]) {
      ctx.beginPath();
      ctx.ellipse(cx + rx * 0.4, cy, Math.abs(rx) * 0.9 + 3, h / 2 - 1, 0, 0, Math.PI * 2);
      ctx.stroke();
    }
    // Stem.
    ctx.fillStyle = "#5a3d22";
    ctx.fillRect(cx - 2, cy - h / 2 - 5, 4, 6);
    ctx.fillRect(cx - 1, cy - h / 2 - 7, 4, 3);
    face(cx, cy, "#2a1608");
    // Flame frame: a small glow around the face, then the face lit.
    const fy = fh;
    const g = ctx.createRadialGradient(cx, fy + cy, 2, cx, fy + cy, 16);
    g.addColorStop(0, `rgba(255, 170, 60, ${glowAlpha[i]})`);
    g.addColorStop(1, "rgba(255, 170, 60, 0)");
    ctx.fillStyle = g;
    ctx.fillRect(cx - 16, fy + cy - 16, 32, 32);
    face(cx, fy + cy, glowColors[i]);
  }
  const frameMap = {};
  for (let i = 0; i < frames; i++) {
    frameMap[`idle_${i}`] = [i * fw, 0, fw, fh];
    frameMap[`flame_${i}`] = [i * fw, fh, fw, fh];
  }
  return {
    image: canvas,
    frames: frameMap,
    anchor: [fw / 2, fh - 14 + 2],
    animations: { idle: { fps: 5, loop: true, frames } },
    facings: [],
    mirror: {},
    bounds: { x: fw / 2 - 15, y: fh - 14 - 30, w: 30, h: 32 },
  };
}

// ---------------------------------------------------------------------------
// Fires (docs/07-lighting.md). Each has three identical `idle_i` body frames
// (so the renderer's idle animation picks a flame index) and three `flame_i`
// frames of fire and glow, drawn above the night layer while lit.
// ---------------------------------------------------------------------------
const FLAME_COLORS = ["#ffb347", "#ffd37a", "#ff9a2e"];

// A tongue of flame with its base at (x, y), `hgt` tall, `wid` wide, in two
// tones. `k` varies the lean per frame.
function drawFlame(ctx, x, y, wid, hgt, k) {
  const lean = (k - 1) * wid * 0.25;
  ctx.fillStyle = "#e8702a";
  ctx.beginPath();
  ctx.moveTo(x - wid / 2, y);
  ctx.quadraticCurveTo(x - wid / 2 + lean, y - hgt * 0.55, x + lean * 1.5, y - hgt);
  ctx.quadraticCurveTo(x + wid / 2 + lean, y - hgt * 0.55, x + wid / 2, y);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = FLAME_COLORS[k];
  ctx.beginPath();
  ctx.moveTo(x - wid / 4, y);
  ctx.quadraticCurveTo(x - wid / 4 + lean * 0.6, y - hgt * 0.35, x + lean, y - hgt * 0.6);
  ctx.quadraticCurveTo(x + wid / 4 + lean * 0.6, y - hgt * 0.35, x + wid / 4, y);
  ctx.closePath();
  ctx.fill();
}

function drawGlow(ctx, x, y, r, a) {
  const g = ctx.createRadialGradient(x, y, 1, x, y, r);
  g.addColorStop(0, `rgba(255, 170, 60, ${a})`);
  g.addColorStop(1, "rgba(255, 170, 60, 0)");
  ctx.fillStyle = g;
  ctx.fillRect(x - r, y - r, r * 2, r * 2);
}

// Hearth: a stone block against a wall with a dark firebox on its front-left
// face. Anchor is the tile centre.
export function generateHearth(ph) {
  const h = 40;
  const fw = TW;
  const fh = TH + h;
  const frames = 3;
  const { canvas, ctx } = makeCanvas(fw * frames, fh * 2);
  const color = ph.color || "#7b7670";
  const inset = 4;
  const hw = HW - inset;
  const hh = HH - inset / 2;
  const frameMap = {};
  for (let i = 0; i < frames; i++) {
    const ox = i * fw;
    const cx = ox + HW;
    const cy = h + HH;
    // The block.
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
    // Brick seams on the faces.
    ctx.strokeStyle = shade(color, 0.45);
    ctx.lineWidth = 1;
    for (let yy = 8; yy < h; yy += 8) {
      ctx.beginPath();
      ctx.moveTo(cx - hw, cy - yy);
      ctx.lineTo(cx, cy + hh - yy);
      ctx.lineTo(cx + hw, cy - yy);
      ctx.stroke();
    }
    // Firebox: a dark arch on the left face.
    const lerp = (t, up) => [cx - hw + (cx - (cx - hw)) * t, cy + hh * t - up];
    const box = [lerp(0.2, 2), lerp(0.8, 2), lerp(0.8, 24), lerp(0.2, 24)];
    ctx.fillStyle = "#1a1210";
    poly(ctx, box);
    ctx.fill();
    frameMap[`idle_${i}`] = [ox, 0, fw, fh];
    // Flame frame: fire in the firebox and a glow spilling out of it.
    const fy = fh;
    const fc = lerp(0.5, 4);
    drawGlow(ctx, fc[0], fy + fc[1] - 6, 22, 0.45 + 0.1 * (i % 2));
    drawFlame(ctx, fc[0] - 5, fy + fc[1], 9, 14 + i * 2, i);
    drawFlame(ctx, fc[0] + 4, fy + fc[1], 8, 11 + ((i + 1) % 3) * 2, (i + 1) % 3);
    frameMap[`flame_${i}`] = [ox, fy, fw, fh];
  }
  return {
    image: canvas,
    frames: frameMap,
    anchor: [HW, h + HH],
    animations: { idle: { fps: 5, loop: true, frames } },
    facings: [],
    mirror: {},
  };
}

// Campfire: a ring of stones and crossed logs on the ground. Anchor is the
// tile centre; the flames rise above it.
export function generateCampfire(ph) {
  const fw = TW;
  const fh = 56;
  const frames = 3;
  const { canvas, ctx } = makeCanvas(fw * frames, fh * 2);
  const stone = ph.color || "#6a645c";
  const log = "#4a3324";
  const frameMap = {};
  for (let i = 0; i < frames; i++) {
    const ox = i * fw;
    const cx = ox + HW;
    const cy = fh - 10;
    // Scorched ground.
    ctx.fillStyle = "rgba(20, 14, 10, 0.45)";
    ctx.beginPath();
    ctx.ellipse(cx, cy, 15, 7, 0, 0, Math.PI * 2);
    ctx.fill();
    // Logs, crossed.
    ctx.save();
    ctx.translate(cx, cy - 2);
    for (const a of [-0.5, 0.6]) {
      ctx.save();
      ctx.rotate(a);
      ctx.fillStyle = log;
      ctx.fillRect(-11, -2.5, 22, 5);
      ctx.fillStyle = shade(log, 1.3);
      ctx.fillRect(-11, -2.5, 22, 1.5);
      ctx.restore();
    }
    ctx.restore();
    // Stones.
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * Math.PI * 2;
      const sx = cx + Math.cos(a) * 17;
      const sy = cy + Math.sin(a) * 8;
      ctx.fillStyle = shade(stone, 0.85 + 0.2 * (k % 2));
      ctx.beginPath();
      ctx.ellipse(sx, sy, 4, 3, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    frameMap[`idle_${i}`] = [ox, 0, fw, fh];
    // Flame frame: three tongues and a glow.
    const fy = fh;
    drawGlow(ctx, cx, fy + cy - 8, 26, 0.4 + 0.12 * (i % 2));
    drawFlame(ctx, cx - 6, fy + cy - 2, 10, 16 + ((i + 2) % 3) * 3, (i + 2) % 3);
    drawFlame(ctx, cx + 6, fy + cy - 2, 10, 14 + ((i + 1) % 3) * 3, (i + 1) % 3);
    drawFlame(ctx, cx, fy + cy - 3, 12, 22 + i * 3, i);
    frameMap[`flame_${i}`] = [ox, fy, fw, fh];
  }
  return {
    image: canvas,
    frames: frameMap,
    anchor: [HW, fh - 10],
    animations: { idle: { fps: 6, loop: true, frames } },
    facings: [],
    mirror: {},
    bounds: { x: HW - 20, y: fh - 10 - 30, w: 40, h: 40 },
  };
}

// ---------------------------------------------------------------------------
// Torches (docs/07): never burn out, mount in a bracket on a wall or on a
// post. The flame and the bracket are drawn by the renderer at the wall, since
// a bracket is state on an edge rather than a sprite of its own.
// ---------------------------------------------------------------------------

// A torch flame with its base at (x, y). `k` picks the frame, 0..2.
export function drawTorchFlame(ctx, x, y, k) {
  drawGlow(ctx, x, y - 4, 14, 0.45 + 0.1 * (k % 2));
  drawFlame(ctx, x, y, 7, 11 + k * 2, k);
}

// An iron bracket on a wall face at (x, y), and the torch in it if any: a
// stick with a wrapped head, the flame drawn separately above the night layer.
export function drawBracket(ctx, x, y, hasTorch) {
  ctx.fillStyle = METAL;
  ctx.fillRect(x - 2, y - 3, 4, 7);
  ctx.fillRect(x - 4, y - 1, 8, 2);
  if (!hasTorch) return;
  ctx.fillStyle = WOOD;
  ctx.fillRect(x - 1, y - 14, 3, 13);
  ctx.fillStyle = "#3a2a22";
  ctx.fillRect(x - 2, y - 17, 5, 5);
}

// The torch in the player's hand: on the side the figure faces, at chest
// height. Returns where the flame sits so the renderer can place it.
export function drawHandTorch(ctx, x, y) {
  ctx.fillStyle = WOOD;
  ctx.fillRect(x - 1, y, 3, 12);
  ctx.fillStyle = "#3a2a22";
  ctx.fillRect(x - 2, y - 3, 5, 5);
}

// A torch post: a wooden pole with an iron cup. Anchor is the tile centre.
export function generateTorchPost(ph) {
  const h = 46;
  const fw = TW;
  const fh = TH + h;
  const frames = 3;
  const { canvas, ctx } = makeCanvas(fw * frames, fh * 2);
  const wood = ph.color || "#4a3324";
  const frameMap = {};
  for (let i = 0; i < frames; i++) {
    const ox = i * fw;
    const cx = ox + HW;
    const cy = h + HH;
    ctx.fillStyle = "rgba(0,0,0,0.25)";
    ctx.beginPath();
    ctx.ellipse(cx, cy, 7, 3.5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = wood;
    ctx.fillRect(cx - 2, cy - h + 6, 5, h - 6);
    ctx.fillStyle = shade(wood, 1.25);
    ctx.fillRect(cx - 2, cy - h + 6, 2, h - 6);
    ctx.fillStyle = METAL;
    ctx.fillRect(cx - 4, cy - h + 2, 9, 5);
    ctx.fillRect(cx - 3, cy - h, 7, 3);
    frameMap[`idle_${i}`] = [ox, 0, fw, fh];
    const fy = fh;
    drawTorchFlame(ctx, cx + 0.5, fy + cy - h + 1, i);
    frameMap[`flame_${i}`] = [ox, fy, fw, fh];
  }
  return {
    image: canvas,
    frames: frameMap,
    anchor: [HW, h + HH],
    animations: { idle: { fps: 5, loop: true, frames } },
    facings: [],
    mirror: {},
    bounds: { x: HW - 8, y: 0, w: 16, h: fh },
  };
}

// A torch flame as a sheet of its own, three frames with the base at the
// anchor, so the WebGL renderer can draw bracket and hand torches from the
// atlas like every other flame.
export function generateFlame() {
  const fw = 28;
  const fh = 32;
  const frames = 3;
  const { canvas, ctx } = makeCanvas(fw * frames, fh);
  const frameMap = {};
  for (let i = 0; i < frames; i++) {
    drawTorchFlame(ctx, i * fw + fw / 2 + 0.5, fh - 4, i);
    frameMap[`flame_${i}`] = [i * fw, 0, fw, fh];
  }
  return {
    image: canvas,
    frames: frameMap,
    anchor: [fw / 2, fh - 4],
    animations: { idle: { fps: 0, loop: false, frames: 1 } },
    facings: [],
    mirror: {},
  };
}
