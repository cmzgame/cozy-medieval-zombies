// The gatherables' dev art (docs/46 step 2, #448): an herb, a mushroom, and a lump (a clay bank, a salt rock, and the clay and salt you
// carry), each drawn as a list of pixels from a design in the data. Pure: no DOM and no rng.js (a hash of the design's own `seed`), so
// the headless check reads the same pixels the page paints. One design makes the node in the world (a sprite definition's `placeholder`,
// placeholders.generateNode), the item's bag icon, and the item lying on the floor (an item's `icon.placeholder`, a sprite's id or a
// design of its own; placeholders.iconCanvas): the item-art law's pair from one design, until drawn art replaces it. Every picture has
// the gatherables' dark outline all the way round (the law in CLAUDE.md; docs/art/01, rule 4), one pixel, hard-edged.
//
// A design: { kind: "herb", leaf, stem?, flower?, eye?, berries?, flowers: "top" | "spike" | "umbel" | "bell" | "none", stems, height,
// spread, leafSize, leafGap, mound?, seed } · { kind: "mushroom", cap, stalk, capWidth, capHeight, stalkHeight, spots? } · { kind: "lump",
// color, halfWidth, height, streaks?, sheen?, crystals?, crystal?, seed }. The foot of the picture is its anchor: the pixel drawn at the
// tile's centre.

export const OUTLINE = "#2b2522";
export const KINDS = ["herb", "mushroom", "lump"];

// A small hash in 0..1 of two integers: the design's variation, never the sim's generator.
function hash(seed, i) {
  let h = Math.imul((seed | 0) ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul(i | 0, 0xc2b2ae35);
  h = Math.imul(h ^ (h >>> 15), 0x27d4eb2f);
  h ^= h >>> 13;
  return (h >>> 0) / 4294967296;
}

// A colour made lighter or darker by a factor, as #rrggbb.
export function tone(hex, f) {
  const n = parseInt(String(hex).slice(1), 16);
  const c = (v) => Math.max(0, Math.min(255, Math.round(v * f))).toString(16).padStart(2, "0");
  return `#${c((n >> 16) & 255)}${c((n >> 8) & 255)}${c(n & 255)}`;
}

// The pixels of a straight line from (x0, y0) to (x1, y1), both ends included.
function line(x0, y0, x1, y1) {
  const out = [];
  const dx = Math.abs(x1 - x0);
  const dy = -Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1;
  const sy = y0 < y1 ? 1 : -1;
  let err = dx + dy;
  let x = x0;
  let y = y0;
  for (;;) {
    out.push([x, y]);
    if (x === x1 && y === y1) break;
    const e2 = 2 * err;
    if (e2 >= dy) { err += dy; x += sx; }
    if (e2 <= dx) { err += dx; y += sy; }
  }
  return out;
}

// A dome's height at column x: half-width `hw`, height `h`, at least one pixel.
const domeAt = (x, hw, h) => Math.max(1, Math.round(h * Math.sqrt(Math.max(0, 1 - (x / (hw + 0.5)) ** 2))));

// An herb: stems from the foot, leaves along them on alternating sides, its flowers where the design says; or a low mound (a moss).
function herb(d, set) {
  const leaf = d.leaf || "#5a8a4a";
  const dark = tone(leaf, 0.72);
  const light = tone(leaf, 1.28);
  const stem = d.stem || tone(leaf, 0.62);
  const flower = d.flower || null;
  const seed = d.seed || 1;
  const H = d.height || 10;
  const spread = d.spread ?? 3;
  if (d.mound) {
    for (let x = -spread; x <= spread; x++) {
      const ch = domeAt(x, spread, H);
      for (let k = 0; k < ch; k++) {
        const top = k === ch - 1;
        let c = top ? light : k === 0 ? dark : leaf;
        if (!top && k > 0 && hash(seed, x * 31 + k) < 0.25) c = dark;
        set(x, -k, c);
        if (top && flower && hash(seed + 7, x) < 0.4) set(x, -k - 1, flower);
      }
    }
    return;
  }
  const n = Math.max(1, d.stems || 3);
  const L = d.leafSize || 1;
  const gap = d.leafGap || 3;
  const stems = [];
  for (let i = 0; i < n; i++) {
    const t = n === 1 ? 0 : (i / (n - 1)) * 2 - 1;
    const tx = Math.round(t * spread);
    const ty = -Math.max(3, Math.round(H * (0.8 + 0.2 * hash(seed, i)) * (1 - 0.2 * Math.abs(t))));
    stems.push({ i, pts: line(0, 0, tx, ty), tx, ty });
  }
  for (const s of stems) for (const [x, y] of s.pts) set(x, y, stem);
  // The leaves, then the flowers over them.
  for (const s of stems) {
    const len = s.pts.length;
    for (let k = 2; k < len - 1; k += gap) {
      const [lx, ly] = s.pts[k];
      const side = (Math.floor(k / gap) + s.i) % 2 ? 1 : -1;
      for (let j = 1; j <= L; j++) set(lx + side * j, ly - (j > 1 ? 1 : 0), j === L ? light : leaf);
      if (L >= 2) set(lx + side, ly - 1, leaf);
      if (d.berries && hash(seed + 3, s.i * 17 + k) < 0.4) set(lx + side * (L + 1), ly, d.berries);
      if (d.flowers === "bell" && flower && hash(seed + 5, s.i * 13 + k) < 0.6) {
        set(lx + side * L, ly + 1, flower);
        set(lx + side * L, ly + 2, tone(flower, 0.72));
      }
    }
  }
  if (!flower) return;
  for (const s of stems) {
    const { tx, ty, pts } = s;
    if (d.flowers === "top") {
      set(tx - 1, ty, flower);
      set(tx + 1, ty, flower);
      set(tx, ty - 1, tone(flower, 1.12));
      set(tx, ty + 1, tone(flower, 0.82));
      set(tx, ty, d.eye || flower);
    } else if (d.flowers === "spike") {
      for (let k = Math.ceil(pts.length * 0.5); k < pts.length; k += 2) {
        const [x, y] = pts[k];
        set(x - 1, y, flower);
        set(x + 1, y, tone(flower, 0.8));
      }
      set(tx, ty - 1, tone(flower, 1.12));
    } else if (d.flowers === "umbel") {
      for (let x = tx - 2; x <= tx + 2; x++) set(x, ty - 1, flower);
      for (let x = tx - 1; x <= tx + 1; x++) set(x, ty - 2, tone(flower, 1.12));
    }
  }
}

// A mushroom: a pale stalk under a domed cap with a dark rim.
function mushroom(d, set) {
  const cap = d.cap || "#9a6a44";
  const stalk = d.stalk || "#e0d4b8";
  const hw = d.capWidth || 5;
  const ch = d.capHeight || 4;
  const sh = d.stalkHeight || 4;
  for (let y = 0; y > -sh; y--) {
    set(-1, y, tone(stalk, 0.9));
    set(0, y, stalk);
    set(1, y, tone(stalk, 0.74));
  }
  const rim = -sh;
  for (let x = -hw; x <= hw; x++) set(x, rim, tone(cap, 0.7));
  for (let k = 1; k <= ch; k++) {
    const w = Math.max(1, Math.round(hw * Math.sqrt(Math.max(0, 1 - ((k - 0.5) / (ch + 0.5)) ** 2))));
    for (let x = -w; x <= w; x++) set(x, rim - k, k === ch || (x < 0 && x >= -w + 1 && k === ch - 1) ? tone(cap, 1.25) : x > w - 2 ? tone(cap, 0.86) : cap);
  }
  if (d.spots) for (const [x, k] of [[-2, 2], [2, 3], [0, ch]]) if (k <= ch) set(x, rim - k, d.spots);
}

// A lump: a dome lit from the upper left, with streaks (clay's layers), a wet sheen, or crystals standing out of it (salt).
function lump(d, set) {
  const c = d.color || "#a07050";
  const hw = d.halfWidth || 6;
  const H = d.height || 6;
  const seed = d.seed || 1;
  for (let x = -hw; x <= hw; x++) {
    const ch = domeAt(x, hw, H);
    for (let k = 0; k < ch; k++) {
      let col = x < 0 ? c : tone(c, 0.84);
      if (k === ch - 1) col = tone(c, 1.18);
      else if (k === 0) col = tone(c, 0.7);
      else if (d.streaks && k % 3 === 1 && hash(seed, x + 40) < 0.6) col = tone(c, 0.74);
      else if (d.sheen && k === ch - 2 && x < 0 && hash(seed + 1, x + 40) < 0.5) col = tone(c, 1.36);
      set(x, -k, col);
    }
  }
  const crystal = d.crystal || "#f2eeee";
  for (let i = 0; i < (d.crystals || 0); i++) {
    const x = Math.round((hash(seed + 11, i) * 2 - 1) * Math.max(1, hw - 2));
    const top = domeAt(x, hw, H);
    const h = 2 + Math.floor(hash(seed + 13, i) * 3);
    for (let k = 0; k < h; k++) {
      set(x, -(top + k) + 1, crystal);
      set(x + 1, -(top + k) + 1, tone(crystal, 0.8));
    }
    set(x, -(top + h) + 1, tone(crystal, 1.06));
  }
}

const DRAW = { herb, mushroom, lump };

// The picture of a design: { w, h, ax, ay, px: [[x, y, "#rrggbb"]] }, the outline included, the anchor (ax, ay) its foot.
export function pixelsOf(design) {
  const draw = DRAW[design && design.kind];
  if (!draw) throw new Error(`no gatherable art of kind ${design && design.kind}`);
  const filled = new Map();
  draw(design, (x, y, c) => filled.set(`${x},${y}`, [x, y, c]));
  // The outline: every empty pixel beside a filled one, on four sides.
  const ring = new Map();
  for (const [x, y] of filled.values()) {
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const k = `${x + dx},${y + dy}`;
      if (!filled.has(k) && !ring.has(k)) ring.set(k, [x + dx, y + dy, OUTLINE]);
    }
  }
  const all = [...filled.values(), ...ring.values()];
  let [x0, y0, x1, y1] = [Infinity, Infinity, -Infinity, -Infinity];
  for (const [x, y] of all) { if (x < x0) x0 = x; if (y < y0) y0 = y; if (x > x1) x1 = x; if (y > y1) y1 = y; }
  return { w: x1 - x0 + 1, h: y1 - y0 + 1, ax: -x0, ay: -y0, px: all.map(([x, y, c]) => [x - x0, y - y0, c]) };
}

// The same picture placed in an icon of `size` [w, h] pixels, centred: { w, h, ax, ay, px, fits } (the foot's pixel in the icon).
export function iconPixelsOf(design, size = [19, 19]) {
  const p = pixelsOf(design);
  const ox = Math.floor((size[0] - p.w) / 2);
  const oy = Math.floor((size[1] - p.h) / 2);
  const px = p.px.map(([x, y, c]) => [x + ox, y + oy, c]).filter(([x, y]) => x >= 0 && y >= 0 && x < size[0] && y < size[1]);
  return { w: size[0], h: size[1], ax: p.ax + ox, ay: p.ay + oy, px, fits: p.w <= size[0] && p.h <= size[1] };
}
