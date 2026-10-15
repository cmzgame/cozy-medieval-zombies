// Held items (docs/12, 14): the generated shapes at sixteen angles, the grips, and which angle a direction is.
// Cut from src/figure.js on 2026-10-12 (docs/23a, D3): a move, no number changed; the sheets check proves the pixels.

import { Frame, hexToRgb } from "./raster.js";
import { FH, FW } from "./rig.js";

export const HELD_TILT = 32; // degrees forward off vertical for an item held at rest
export const HELD_LEAN_OUT = 18; // and this much outward, on the hand's side
export const HELD_ANGLES = 16; // frames per held item, 22.5 degrees apart, 0 up, clockwise

// The nearest held angle for a screen direction.
export function angleIndex(dir) {
  const a = Math.atan2(dir[0], -dir[1]);
  const k = Math.round(a / ((2 * Math.PI) / HELD_ANGLES));
  return ((k % HELD_ANGLES) + HELD_ANGLES) % HELD_ANGLES;
}


// ---- held items ----

// Held art is a small vertical drawing of the thing rotated into eight
// angles, frames `held_<k>` with k from 0 (pointing up) clockwise in 45
// degree steps. The anchor is the grip. The renderer picks the angle from the
// forearm direction (docs/12, held items).
export const HELD_SIZE = 32;
const HELD_SHAPES = {
  halberd: (f, c) => {
    // A long ash shaft (the hand holds it at y 64, so 61 px reach forward), an axe blade on one
    // side, a spike above and a hook behind (docs/21). Drawn in the 48 x 72 frame, centred on x 24.
    f.capsule(24, 8, 24, 70, 1.4, c(0, "#8a6a3a"));
    f.poly([{ x: 24, y: 10 }, { x: 36, y: 12 }, { x: 38, y: 24 }, { x: 24, y: 28 }], c(1, "#b4b8c0"));
    f.poly([{ x: 24, y: 3 }, { x: 26.6, y: 10 }, { x: 21.4, y: 10 }], c(1, "#b4b8c0"));
    f.poly([{ x: 24, y: 16 }, { x: 15, y: 18 }, { x: 24, y: 22 }], c(1, "#b4b8c0"));
  },
  shield_guard: (f, c) => {
    // The shield raised before the chest (docs/21): bigger, and centred on the grip so it
    // can be placed by its middle and needs no angle.
    f.ellipse(16, 20, 9.5, 9.5, c(2, "#7a7a84"));
    f.ellipse(16, 20, 8.2, 8.2, c(0, "#8a6a3a"));
    for (const x of [11.5, 16, 20.5]) f.capsule(x, 14.5, x, 25.5, 0.6, c(1, "#b8a070"));
    f.ellipse(16, 20, 2.8, 2.8, c(2, "#7a7a84"));
    f.px(15, 19, [210, 210, 220]);
  },
  shield: (f, c) => {
    // A round wooden shield held up before the hand: an iron rim, planks, a boss.
    f.ellipse(16, 13, 8, 8, c(2, "#7a7a84"));
    f.ellipse(16, 13, 6.8, 6.8, c(0, "#8a6a3a"));
    for (const x of [12.5, 16, 19.5]) f.capsule(x, 8.5, x, 17.5, 0.5, c(1, "#b8a070"));
    f.ellipse(16, 13, 2.2, 2.2, c(2, "#7a7a84"));
    f.px(15, 12, [200, 200, 210]);
  },
  spear: (f, c) => {
    // A long pole and a stone point (the arm is up in this drawing; the point leads).
    f.capsule(16, 5, 16, 30, 1.3, c(0, "#8a6a3a"));
    f.poly([{ x: 16, y: 0 }, { x: 19, y: 6 }, { x: 16, y: 7.5 }, { x: 13, y: 6 }], c(1, "#b4b0a8"));
  },
  bow: (f, c) => {
    // Held out along the arm (up in this drawing), the limbs across it and curving
    // back toward the archer at the tips, the string straight between them.
    const limb = [[7, 25], [9, 22], [12, 20], [16, 19], [20, 20], [23, 22], [25, 25]];
    for (let i = 0; i < limb.length - 1; i++) f.capsule(limb[i][0], limb[i][1], limb[i + 1][0], limb[i + 1][1], 1.2, c(0, "#7a5a3a"));
    for (let x = 8; x <= 24; x++) f.px(x, 25, c(1, "#d8d0b8"));
  },
  torch: (f, c) => {
    f.capsule(16, 10, 16, 24, 1.3, c(0, "#8a5a2a"));
    f.ellipse(16, 8, 2.6, 2.6, c(1, "#3a2a22"));
  },
  hatchet: (f, c) => {
    f.capsule(16, 8, 16, 25, 1.3, c(0, "#8a6a3a"));
    f.poly([{ x: 16, y: 6 }, { x: 23, y: 7 }, { x: 23, y: 13 }, { x: 16, y: 13 }], c(1, "#9aa0a8"));
  },
  stick: (f, c) => {
    f.capsule(16, 4, 16, 27, 1.5, c(0, "#7a5a3a"));
    f.px(17, 9, [90, 66, 44]);
    f.px(15, 15, [90, 66, 44]);
  },
  sword: (f, c) => {
    // A blade up from the guard, a crossguard, a wrapped grip, a pommel.
    f.capsule(16, 2, 16, 16, 1.6, c(0, "#c4cad2"));
    f.capsule(12.5, 17, 19.5, 17, 1.1, c(2, "#c8a040"));
    f.capsule(16, 18, 16, 24, 1.3, c(1, "#8a6a3a"));
    f.ellipse(16, 25.5, 1.8, 1.6, c(2, "#c8a040"));
  },
  mace: (f, c) => {
    // A shaft and a studded iron head.
    f.capsule(16, 9, 16, 26, 1.3, c(0, "#8a6a3a"));
    f.ellipse(16, 7, 3.8, 3.8, c(1, "#7a7a84"));
    for (const [x, y] of [[11, 7], [21, 7], [16, 2], [12, 3], [20, 3], [12, 11], [20, 11]]) f.px(x, y, [58, 58, 66]);
  },
  plank: (f, c) => {
    f.capsule(16, 5, 16, 27, 2, c(0, "#9a7448"));
  },
  log: (f, c) => {
    f.capsule(16, 9, 16, 23, 3.5, c(0, "#6a4a30"));
    f.ellipse(16, 8, 3.2, 1.6, c(1, "#b08a5a"));
  },
};

// Where the hand holds a held picture in its upright drawing; the default is the 32 px frame's.
const HELD_GRIPS = { halberd: { x: 24, y: 64 } };

// Things drawn by the way the holder faces, not turned with the forearm (Michael, 2026-10-14: the bow lay flat when
// its archer faced the camera). A bow's limbs are upright in the world, so they are upright on screen whichever way
// it points; only its belly turns, toward the side the archer faces, and seen end on (to or from the camera) it is a
// near-straight stave. Frame k is the facing at k * 22.5 degrees from up, clockwise, as the angles are counted; the
// hand holds the riser at the frame's middle. `hx` is the facing's sideways part on screen, -1 to 1.
const HELD_BY_FACING = {
  bow: (f, c, hx) => {
    const g = 16;
    let b = 4.5 * hx; // the belly's bow toward the facing side, in pixels
    if (Math.abs(b) < 1.5) b = b < 0 ? -1.5 : 1.5; // end on, a hint of the curve so it still reads as a bow
    const half = 13; // tall enough that a tip shows past the shoulder when the body is in front of it
    const top = g - half;
    const bottom = g + half;
    const xAt = (t) => g + b * (1 - t * t) - b * 0.15; // the riser forward, the tips back toward the archer
    // The string, tip to tip on the archer's side, first so the limbs cover it where they meet.
    const sx = Math.round(xAt(1));
    for (let y = top + 1; y <= bottom - 1; y++) f.px(sx, y, c(1, "#d8d0b8"));
    const steps = 8;
    for (let i = 0; i < steps; i++) {
      const t0 = -1 + (2 * i) / steps;
      const t1 = -1 + (2 * (i + 1)) / steps;
      f.capsule(xAt(t0), g + t0 * half, xAt(t1), g + t1 * half, 1.15, c(0, "#7a5a3a"));
    }
  },
};

export function generateHeld(shape, colours = [], size = HELD_SIZE) {
  if (HELD_BY_FACING[shape]) return generateHeldByFacing(shape, colours, size);
  const draw = HELD_SHAPES[shape] || HELD_SHAPES.plank;
  const S = size;
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
  const grip = HELD_GRIPS[shape] || { x: 16, y: 20 }; // where the hand holds it, in the upright drawing
  for (let k = 0; k < N; k++) {
    const a = (k * (360 / N) * Math.PI) / 180;
    const cos = Math.cos(a);
    const sin = Math.sin(a);
    const img = ctx.createImageData(S, S);
    const d = img.data;
    for (let y = 0; y < S; y++) {
      for (let x = 0; x < S; x++) {
        // Destination pixel relative to the grip, rotated back into the source.
        const dx = x + 0.5 - S / 2;
        const dy = y + 0.5 - S / 2;
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
  return { image: canvas, frames, anchor: [S / 2, S / 2], animations: {}, facings: [], mirror: {}, tips };
}

// A thing drawn by the holder's facing (HELD_BY_FACING): sixteen fresh drawings, none turned. The sheet says
// `byFacing`, and the renderer then picks the frame by the facing (the joints' `angFace`), never by the forearm.
function generateHeldByFacing(shape, colours, size) {
  const S = size;
  const N = HELD_ANGLES;
  const c = (i, fb) => hexToRgb(colours[i] || fb);
  const canvas = document.createElement("canvas");
  canvas.width = S * N;
  canvas.height = S;
  const ctx = canvas.getContext("2d");
  const frames = {};
  for (let k = 0; k < N; k++) {
    const hx = Math.sin((k * (360 / N) * Math.PI) / 180);
    const src = new Frame();
    HELD_BY_FACING[shape](src, c, Math.abs(hx) < 1e-9 ? 0 : hx);
    src.shade();
    const img = ctx.createImageData(S, S);
    const d = img.data;
    for (let y = 0; y < S; y++) {
      for (let x = 0; x < S; x++) {
        if (x >= FW || y >= FH) continue;
        const i = y * FW + x;
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
  const tips = [];
  for (let k = 0; k < N; k++) tips.push([0, -10]);
  return { image: canvas, frames, anchor: [S / 2, S / 2], animations: {}, facings: [], mirror: {}, tips, byFacing: true };
}

// Which of the eight held angles a forearm direction (screen dx, dy) wants,
// for an item that points along the arm; `upright` items point up at rest.
export function heldAngle(dir, alongArm) {
  return alongArm ? angleIndex(dir) : 0;
}
