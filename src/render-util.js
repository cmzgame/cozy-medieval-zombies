// Copied from cozy-zombie-game src/render-util.js on 2026-10-09. Unchanged.
// Small drawing helpers shared by render.js and placeholders.js.

const colorCache = new Map();

// Multiply a hex color's channels by f. Cached.
export function shade(hex, f) {
  const key = hex + f;
  if (colorCache.has(key)) return colorCache.get(key);
  const n = parseInt(hex.slice(1), 16);
  const r = Math.min(255, Math.round(((n >> 16) & 255) * f));
  const g = Math.min(255, Math.round(((n >> 8) & 255) * f));
  const b = Math.min(255, Math.round((n & 255) * f));
  const out = `rgb(${r},${g},${b})`;
  colorCache.set(key, out);
  return out;
}

export function poly(ctx, pts) {
  ctx.beginPath();
  ctx.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
  ctx.closePath();
}
