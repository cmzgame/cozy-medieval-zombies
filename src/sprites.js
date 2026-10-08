// Copied from cozy-zombie-game src/sprites.js on 2026-10-09. Unchanged.
// Sprite sheets and animation state. See docs/03-rendering.md and docs/06-data-formats.md.
//
// A sheet is { image, frames: {name: [x, y, w, h]}, anchor: [ax, ay], animations,
// facings, mirror }. Frame names are `${anim}_${facing}_${i}` for characters and
// `${anim}_${i}` for things without facings.

// Fallback chains when a sheet lacks a facing. Each entry is tried in order;
// entries in the sheet's mirror table are drawn flipped.
const FACING_FALLBACK = {
  s: ["s"],
  sw: ["sw", "s", "w"],
  w: ["w", "sw", "s"],
  nw: ["nw", "n", "w"],
  n: ["n", "nw"],
  ne: ["ne", "n", "e"],
  e: ["e", "se", "s"],
  se: ["se", "s", "e"],
};

const resolveCache = new WeakMap();

// Returns { facing, flip } for a requested facing on this sheet.
export function resolveFacing(sheet, facing) {
  let cache = resolveCache.get(sheet);
  if (!cache) {
    cache = new Map();
    resolveCache.set(sheet, cache);
  }
  if (cache.has(facing)) return cache.get(facing);
  const has = (f) => sheet.facings.includes(f);
  let out = null;
  for (const f of FACING_FALLBACK[facing] || [facing]) {
    if (has(f)) {
      out = { facing: f, flip: false };
      break;
    }
    const m = sheet.mirror[f];
    if (m && has(m)) {
      out = { facing: m, flip: true };
      break;
    }
  }
  if (!out) out = { facing: sheet.facings[0], flip: false };
  cache.set(facing, out);
  return out;
}

export function frameName(sheet, anim, facing, index) {
  return sheet.facings.length ? `${anim}_${facing}_${index}` : `${anim}_${index}`;
}

export function createAnimation(name = "idle") {
  return { name, frame: 0, elapsed: 0, done: false };
}

// Switch animation. Restarts only if the name changes or force is set.
export function playAnimation(anim, name, force = false) {
  if (anim.name === name && !force) return;
  anim.name = name;
  anim.frame = 0;
  anim.elapsed = 0;
  anim.done = false;
}

export function advanceAnimation(anim, sheet, dt) {
  const def = sheet.animations[anim.name];
  if (!def || def.fps <= 0 || anim.done) return;
  anim.elapsed += dt;
  const frameTime = 1 / def.fps;
  while (anim.elapsed >= frameTime) {
    anim.elapsed -= frameTime;
    anim.frame++;
    if (anim.frame >= def.frames) {
      if (def.loop) {
        anim.frame = 0;
      } else {
        anim.frame = def.frames - 1;
        anim.done = true;
        anim.elapsed = 0;
        break;
      }
    }
  }
}

// True on the logic step where the animation is on its active frame.
export function isActiveFrame(anim, sheet) {
  const def = sheet.animations[anim.name];
  return !!def && def.activeFrame === anim.frame;
}

// Draw a frame with its anchor at integer canvas position (x, y).
export function drawFrame(ctx, sheet, name, x, y, flip = false, anchor = sheet.anchor) {
  const f = sheet.frames[name];
  if (!f) return false;
  const [sx, sy, sw, sh] = f;
  const [ax, ay] = anchor;
  if (flip) {
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(-1, 1);
    ctx.drawImage(sheet.image, sx, sy, sw, sh, -ax, -ay, sw, sh);
    ctx.restore();
  } else {
    ctx.drawImage(sheet.image, sx, sy, sw, sh, x - ax, y - ay, sw, sh);
  }
  return true;
}

// Draw a character's current animation frame for a facing.
export function drawCharacter(ctx, sheet, anim, facing, x, y) {
  const r = resolveFacing(sheet, facing);
  const name = frameName(sheet, anim.name, r.facing, anim.frame);
  return drawFrame(ctx, sheet, name, x, y, r.flip);
}

// Screen-space bounding rect of a character frame drawn at (x, y).
export function frameRect(sheet, name, x, y) {
  const f = sheet.frames[name];
  if (!f) return null;
  const [ax, ay] = sheet.anchor;
  return { x: x - ax, y: y - ay, w: f[2], h: f[3] };
}
