// Characters on fire (docs/05, "Burning", 2026-10-12): a visual test only, no
// effect on anything. A burning figure sheds small flame sprites that rise and
// die, embers above them, a little smoke, and it is a moving light (light.js
// carriers). The flames ride the figure; embers and smoke are left where they
// were born. Set and cleared from the character's menu (interact.js).

function makeCanvas(w, h) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const ctx = c.getContext("2d");
  ctx.imageSmoothingEnabled = false;
  return { canvas: c, ctx };
}

export const tunables = {
  rate: 40, // flames a second per burning figure (26 looked thin)
  standHeight: 44, // px up the figure the flames are born on, standing
  lyingHeight: 10, // and lying (a corpse)
  spread: 5, // px either side of the figure's centre line
  rise: [30, 55], // px a second
  life: [0.28, 0.45], // seconds a flame lives
  emberChance: 0.3, // an ember with a flame
  smokeChance: 0.18, // a puff of smoke with a flame
  lightRadius: 2.4, // tiles, the burning body as a light
  flicker: { amp: 0.3, speed: 12 },
};

let particles = [];

function rnd(a, b) {
  return a + Math.random() * (b - a);
}

// One step: new flames on every burning character, then everything rises and dies.
export function update(dt, characters) {
  for (const ch of characters) {
    if (!ch.burning) {
      ch.burnAcc = 0;
      continue;
    }
    ch.burnAcc = (ch.burnAcc || 0) + dt * tunables.rate;
    const top = ch.corpse ? tunables.lyingHeight : tunables.standHeight;
    const spread = ch.corpse ? tunables.spread * 2.4 : tunables.spread;
    while (ch.burnAcc >= 1) {
      ch.burnAcc -= 1;
      particles.push({ kind: "flame", ch, ox: rnd(-spread, spread), z: rnd(2, top), vz: rnd(...tunables.rise), vx: rnd(-4, 4), t: 0, life: rnd(...tunables.life) });
      if (Math.random() < tunables.emberChance) {
        particles.push({ kind: "ember", gx: ch.gx, gy: ch.gy, ox: rnd(-spread, spread), z: rnd(top * 0.5, top + 4), vz: rnd(45, 85), vx: rnd(-10, 10), t: 0, life: rnd(0.5, 1.1) });
      }
      if (Math.random() < tunables.smokeChance) {
        particles.push({ kind: "smoke", gx: ch.gx, gy: ch.gy, ox: rnd(-spread, spread), z: top + rnd(4, 10), vz: rnd(18, 30), vx: rnd(-6, 6), t: 0, life: rnd(0.8, 1.3) });
      }
    }
  }
  const keep = [];
  for (const p of particles) {
    p.t += dt;
    if (p.t >= p.life) continue;
    p.z += p.vz * dt;
    p.ox += p.vx * dt;
    keep.push(p);
  }
  particles = keep;
}

export function all() {
  return particles;
}

// The burning bodies as lights: evaluated at query time like the carried torch.
export function lights(characters) {
  const out = [];
  for (const ch of characters) if (ch.burning) out.push({ gx: ch.gx, gy: ch.gy, radius: tunables.lightRadius, flicker: tunables.flicker });
  return out;
}

// ---- the art: four tongues of flame, an ember, two puffs of smoke ----
//
// Flames shrink through their life (frame 0 is the biggest), so a particle's
// frame is its age. Everything is drawn unlit: fire is its own light.

function px(ctx, x, y, c) {
  ctx.fillStyle = c;
  ctx.fillRect(x, y, 1, 1);
}

export function generateSheet() {
  const W = 10;
  const H = 12;
  const { canvas, ctx } = makeCanvas(W * 4 + 8 + 16, H);
  const frames = {};
  const anchors = {};
  const OUT = "#3a1a10";
  const RED = "#d8401c";
  const ORANGE = "#f08a1e";
  const YELLOW = "#ffd84a";
  const WHITE = "#fff6c8";
  // Each tongue: a tapering column of pixels, rows from the base up.
  const tongues = [
    // widths per row from the base, and the column's offset for a lean
    [[6, 0], [6, 0], [5, 0], [4, 1], [3, 1], [2, 1], [1, 2]],
    [[5, 0], [5, 0], [4, 0], [3, 0], [2, 1], [1, 1]],
    [[4, 0], [4, 0], [3, 0], [2, 0], [1, 1]],
    [[3, 0], [2, 0], [2, 1], [1, 1]],
  ];
  tongues.forEach((rows, i) => {
    const x0 = i * W;
    const cx = x0 + W / 2;
    const base = H - 1;
    rows.forEach(([w, lean], r) => {
      const y = base - r;
      const left = Math.floor(cx - w / 2) + lean;
      for (let x = left; x < left + w; x++) {
        const d = Math.abs(x + 0.5 - (left + w / 2)); // distance from the tongue's middle
        const inner = r >= 1 && r < rows.length - 1 && d < w / 2 - 1;
        const core = r >= 1 && r < rows.length - 2 && d < w / 2 - 2;
        px(ctx, x, y, core ? WHITE : inner ? YELLOW : r < 1 ? RED : ORANGE);
      }
      // a dark edge round the tongue, one pixel out, so it reads on grass
      px(ctx, left - 1, y, OUT);
      px(ctx, left + w, y, OUT);
    });
    const topRow = rows.length;
    const [tw, tl] = rows[rows.length - 1];
    const tleft = Math.floor(cx - tw / 2) + tl;
    for (let x = tleft - 1; x <= tleft + tw; x++) px(ctx, x, base - topRow, OUT);
    for (let x = Math.floor(cx - rows[0][0] / 2) - 1; x <= Math.floor(cx - rows[0][0] / 2) + rows[0][0]; x++) px(ctx, x, base + 1 > H - 1 ? base : base + 1, OUT);
    frames[`flame_${i}`] = [x0, 0, W, H];
    anchors[`flame_${i}`] = [W / 2, base];
  });
  // The ember: two pixels, bright.
  const ex = W * 4;
  px(ctx, ex + 2, 5, YELLOW);
  px(ctx, ex + 3, 5, ORANGE);
  px(ctx, ex + 2, 6, ORANGE);
  px(ctx, ex + 3, 6, RED);
  frames.ember = [ex, 4, 6, 4];
  anchors.ember = [3, 2];
  // Smoke: two puffs, dark and soft at the edge.
  const sx = W * 4 + 8;
  const puff = (ox, r, c1, c2) => {
    for (let y = -r; y <= r; y++) {
      for (let x = -r; x <= r; x++) {
        const d = Math.hypot(x, y);
        if (d > r + 0.3) continue;
        px(ctx, sx + ox + x, 6 + y, d > r - 1 ? c2 : c1);
      }
    }
  };
  puff(3, 2, "rgba(60,50,46,0.9)", "rgba(60,50,46,0.5)");
  puff(11, 3, "rgba(70,60,56,0.75)", "rgba(70,60,56,0.35)");
  frames.smoke_0 = [sx, 2, 7, 8];
  anchors.smoke_0 = [3, 4];
  frames.smoke_1 = [sx + 7, 2, 9, 8];
  anchors.smoke_1 = [4, 4];
  return { image: canvas, frames, frameAnchors: anchors, anchor: [0, 0], animations: { idle: { fps: 0, loop: false, frames: 1 } }, facings: [], mirror: {} };
}
