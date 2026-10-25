// Fruit painted into a drawn tree's crown at load (#422; Michael, 2026-10-25: the apple tree "a clone of the round tree type ... in green and just
// called 'apple tree' with apples placed throughout"). A sprite definition of the `image` shape may carry a `fruit` block:
//   "fruit": { "count": 12, "gap": 3, "seed": 422, "shape": [".LR.", "LRRR", "RRRD", ".DD."], "colours": { "L": "#f07a5a", "R": "#c8302a", "D": "#7a1c1a" } }
// The loader (`assets.loadSprite`) copies the definition's picture into a canvas and paints `count` fruit into it, each the `shape` (rows of
// letters, `.` left alone) in its `colours`, on the crown's leaves only: every pixel of a fruit and its four neighbours must be leaf (an opaque
// pixel that is green: green the largest channel by a margin and not the dark outline), so no fruit touches the outline or the trunk. Where they
// go is chosen by the block's `seed` alone (a small generator of its own, never `rng.js`: this is the client's picture and the sim never sees it),
// spread by `gap`, the least clear pixels between two fruit. The delivered picture is never written: the bare tree's definition names the same
// file with no `fruit`, so a picked tree is the crown without its apples. Pure on RGBA arrays (`fruitSpots`, `paintFruit`), so Node checks it.

// A 32-bit seeded generator (mulberry32), local to the picture.
function generator(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Whether the pixel at index i (of an RGBA array) is a leaf: opaque, green the largest channel by a margin, and bright enough not to be the outline.
export function isLeaf(px, i) {
  const r = px[i];
  const g = px[i + 1];
  const b = px[i + 2];
  return px[i + 3] > 0 && g >= 60 && g > r + 10 && g > b;
}

// The cells of a shape that are painted: [dx, dy, letter].
function cellsOf(shape) {
  const out = [];
  shape.forEach((row, dy) => [...row].forEach((ch, dx) => { if (ch !== ".") out.push([dx, dy, ch]); }));
  return out;
}

// Where the fruit go in a picture of w by h (RGBA `px`): a list of [x, y], the top-left of each fruit's shape, at most `spec.count` of them.
export function fruitSpots(px, w, h, spec) {
  const cells = cellsOf(spec.shape);
  const sw = Math.max(...spec.shape.map((r) => r.length));
  const sh = spec.shape.length;
  const leaf = (x, y) => x >= 0 && y >= 0 && x < w && y < h && isLeaf(px, (y * w + x) * 4);
  const fits = (x, y) => cells.every(([dx, dy]) => {
    const cx = x + dx;
    const cy = y + dy;
    return leaf(cx, cy) && leaf(cx - 1, cy) && leaf(cx + 1, cy) && leaf(cx, cy - 1) && leaf(cx, cy + 1);
  });
  const candidates = [];
  for (let y = 0; y + sh <= h; y++) for (let x = 0; x + sw <= w; x++) if (fits(x, y)) candidates.push([x, y]);
  // Spread through the crown, the same picture every boot: each fruit the farthest from those placed of a dozen candidates drawn by the seed
  // (best-candidate sampling), and none closer than `gap` clear pixels to another.
  const rnd = generator(spec.seed ?? 1);
  const gap = spec.gap ?? 2;
  const clear = ([x, y], [ox, oy]) => Math.abs(ox - x) >= sw + gap || Math.abs(oy - y) >= sh + gap;
  const out = [];
  for (let n = 0; n < spec.count && candidates.length; n++) {
    let best = null;
    let bestD = -1;
    for (let k = 0; k < 12; k++) {
      const c = candidates[Math.floor(rnd() * candidates.length)];
      if (!out.every((o) => clear(c, o))) continue;
      const d = out.length ? Math.min(...out.map(([ox, oy]) => Math.hypot(ox - c[0], oy - c[1]))) : 0;
      if (d > bestD) { best = c; bestD = d; }
    }
    if (best) out.push(best);
  }
  return out;
}

const rgbOf = (hex) => [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)];

// The fruit painted into a copy of `px` (RGBA, w by h); returns { px, spots }.
export function paintFruit(px, w, h, spec) {
  const out = new Uint8ClampedArray(px);
  const spots = fruitSpots(px, w, h, spec);
  const cells = cellsOf(spec.shape);
  for (const [x, y] of spots) {
    for (const [dx, dy, ch] of cells) {
      const c = spec.colours[ch];
      if (!c) continue;
      const i = ((y + dy) * w + (x + dx)) * 4;
      const [r, g, b] = rgbOf(c);
      out[i] = r;
      out[i + 1] = g;
      out[i + 2] = b;
      out[i + 3] = 255;
    }
  }
  return { px: out, spots };
}

// The picture with its fruit, as a canvas the sheet draws from (browser only).
export function fruitCanvas(image, spec) {
  const c = document.createElement("canvas");
  c.width = image.width;
  c.height = image.height;
  const ctx = c.getContext("2d", { willReadFrequently: true });
  ctx.drawImage(image, 0, 0);
  const src = ctx.getImageData(0, 0, c.width, c.height);
  const { px } = paintFruit(src.data, c.width, c.height, spec);
  src.data.set(px);
  ctx.putImageData(src, 0, 0);
  return c;
}
