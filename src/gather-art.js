// The gatherables' dev art (docs/46 step 2, #448): an herb, a mushroom, and a lump (a clay bank, a salt rock, and the clay and salt you
// carry), each drawn as a list of pixels from a design in the data. Pure: no DOM and no rng.js (a hash of the design's own `seed`), so
// the headless check reads the same pixels the page paints. One design makes the node in the world (a sprite definition's `placeholder`,
// placeholders.generateNode), the item's bag icon, and the item lying on the floor (an item's `icon.placeholder`, a sprite's id or a
// design of its own; placeholders.iconCanvas): the item-art law's pair from one design, until drawn art replaces it. Every picture has
// the gatherables' dark outline all the way round (the law in CLAUDE.md; docs/art/01, rule 4), one pixel, hard-edged.
//
// A design: { kind: "herb", leaf, stem?, flower?, eye?, glow?, berries?, root?, flowers: "spike" | "daisy" | "umbel" | "cluster" | "star" |
// "hood" | "bell" | "top" | "none", wide?, spikeFrom?, stems, height, spread, base, leafSize, leafGap, broad?, serrated?, mound?, tufts?, seed } · { kind: "mushroom", cap, stalk, capWidth, capHeight, stalkHeight, spots? } · { kind: "lump",
// color, halfWidth, height, streaks?, sheen?, crystals?, crystal?, seed } · { kind: "sapling", trunk, leaf, soil, height, crown, wide?, seed } (docs/46
// step 3: a young tree planted, not a gatherable, outlined as the gatherables are so it is found in the grass) · { kind: "vial", fired?, body?, seal?,
// band?, seed } (docs/47: a clay vial and the potions in it, the colour on the seal and the band). The foot of the picture is its
// anchor: the pixel drawn at the tile's centre.

export const OUTLINE = "#2b2522";
export const KINDS = ["herb", "mushroom", "lump", "sapling", "vial"];

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

// An herb, drawn to be found (Primary's look at #457: at the world's zoom a thin sprig vanished into the grass): a clump of leaves at the
// foot (`base`), stems rising from it with leaves along them on alternating sides (`leafSize` long, two rows when `broad`, notched when
// `serrated`), and its flowers where the design says, each kind its own colour and shape; or a tuft of moss (`mound`, with `tufts`).
//   flowers: "spike" (a dense column up the stem's top half), "daisy" (white petals round an `eye`), "umbel" (a flat head), "cluster"
//   (a round head at each tip), "star" (a small five-pixel star at each tip), "hood" (hooded blooms up the top of the stem), "bell" (bells
//   hanging from the leaves), "none"; `glow` a pale pixel over each tip (mageroot), `berries` hung from the leaves, `root` roots
//   showing either side of the foot (madder).
function herb(d, set) {
  const leaf = d.leaf || "#5a8a4a";
  const dark = tone(leaf, 0.7);
  const light = tone(leaf, 1.3);
  const stem = d.stem || tone(leaf, 0.66);
  const flower = d.flower || null;
  const fLight = flower ? tone(flower, 1.15) : null;
  const fDark = flower ? tone(flower, 0.72) : null;
  const seed = d.seed || 1;
  const H = d.height || 10;
  const spread = d.spread ?? 3;
  if (d.root) for (const [x, y] of [[-1, 0], [-2, 1], [-3, 1], [1, 0], [2, 1], [3, 1], [0, 1]]) set(x, y, x === 0 ? tone(d.root, 0.75) : d.root);
  if (d.mound) {
    for (let x = -spread; x <= spread; x++) {
      const ch = domeAt(x, spread, H);
      for (let k = 0; k < ch; k++) {
        const top = k === ch - 1;
        let c = top ? light : k === 0 ? dark : leaf;
        if (!top && k > 0 && hash(seed, x * 31 + k) < 0.25) c = dark;
        set(x, -k, c);
      }
      // Tufts: pale strands standing out of the top, tipped with the flower's colour.
      if (d.tufts && Math.abs(x) < spread && (x % 2 === 0 || hash(seed + 5, x + 40) < 0.4)) {
        const t = Math.max(1, Math.round(d.tufts * (1 - Math.abs(x) / (spread + 1)) * (0.45 + 0.55 * hash(seed + 3, x + 20))));
        const lean = hash(seed + 9, x + 60) < 0.3 ? (x < 0 ? -1 : 1) : 0;
        for (let k = 0; k < t; k++) set(x + (k === t - 1 && t > 2 ? lean : 0), -ch - k, k === t - 1 && flower ? flower : k % 2 ? leaf : light);
      }
    }
    return;
  }
  // The clump at the foot: two or three rows of leaves, wider at the bottom.
  const base = d.base || 0;
  for (let x = -base; x <= base; x++) {
    set(x, 0, Math.abs(x) % 2 ? dark : leaf);
    if (Math.abs(x) < base) set(x, -1, (x + seed) % 3 === 0 ? light : leaf);
    if (Math.abs(x) < base - 1) set(x, -2, Math.abs(x) % 2 ? leaf : light);
  }
  const n = Math.max(1, d.stems || 3);
  const L = d.leafSize || 1;
  const gap = d.leafGap || 3;
  const stems = [];
  for (let i = 0; i < n; i++) {
    const t = n === 1 ? 0 : (i / (n - 1)) * 2 - 1;
    const tx = Math.round(t * spread);
    const ty = -Math.max(3, Math.round(H * (0.84 + 0.16 * hash(seed, i)) * (1 - 0.18 * Math.abs(t))));
    stems.push({ i, pts: line(0, -Math.min(base ? 1 : 0, 1), tx, ty), tx, ty });
  }
  for (const s of stems) for (const [x, y] of s.pts) set(x, y, stem);
  // The leaves, then the flowers over them.
  for (const s of stems) {
    const len = s.pts.length;
    for (let k = base ? 3 : 2; k < len - 1; k += gap) {
      const [lx, ly] = s.pts[k];
      const side = (Math.floor(k / gap) + s.i) % 2 ? 1 : -1;
      for (let j = 1; j <= L; j++) {
        const up = j > 1 ? 1 : 0;
        set(lx + side * j, ly - up, j === L ? light : leaf);
        if (d.broad && j < L) set(lx + side * j, ly - up + 1, d.serrated && j % 2 === 0 ? leaf : dark);
        if (d.serrated && j === L) set(lx + side * (j + 1), ly - up - 1, light);
      }
      if (d.berries && hash(seed + 3, s.i * 17 + k) < 0.55) {
        set(lx + side * (L + 1), ly + 1, d.berries);
        set(lx + side * L, ly + 2, d.berries);
      }
      if (d.flowers === "bell" && flower && hash(seed + 5, s.i * 13 + k) < 0.7) {
        set(lx + side * L, ly + 1, flower);
        set(lx + side * (L + 1), ly + 1, fDark);
        set(lx + side * L, ly + 2, fDark);
      }
    }
  }
  if (flower) {
    for (const s of stems) {
      const { tx, ty, pts } = s;
      const f = d.flowers;
      if (f === "daisy" || f === "star") {
        const petal = f === "daisy" ? flower : fLight;
        set(tx - 1, ty, petal);
        set(tx + 1, ty, petal);
        set(tx, ty - 1, petal);
        set(tx, ty + 1, f === "daisy" ? petal : fDark);
        if (f === "daisy") { set(tx - 1, ty - 1, fDark); set(tx + 1, ty + 1, fDark); }
        set(tx, ty, d.eye || flower);
      } else if (f === "cluster") {
        for (let y = ty - 2; y <= ty; y++) for (let x = tx - 1; x <= tx + 1; x++) set(x, y, (x + y) % 2 ? flower : y === ty - 2 ? fLight : fDark);
        set(tx, ty - 3, fLight);
      } else if (f === "spike") {
        for (let k = Math.floor(pts.length * (d.spikeFrom ?? 0.4)); k < pts.length; k++) {
          const [x, y] = pts[k];
          set(x - 1, y, k % 2 ? flower : fDark);
          set(x, y, k % 2 ? fLight : flower);
          if (d.wide || k % 2) set(x + 1, y, fDark);
        }
        set(tx, ty - 1, fLight);
      } else if (f === "hood") {
        for (let k = Math.floor(pts.length * 0.45); k < pts.length; k += 2) {
          const [x, y] = pts[k];
          const side = k % 4 < 2 ? -1 : 1;
          set(x + side, y - 1, fLight);
          set(x + side, y, flower);
          set(x + side * 2, y, flower);
          set(x + side, y + 1, fDark);
        }
        set(tx, ty - 1, fLight);
        set(tx, ty - 2, flower);
      } else if (f === "umbel") {
        for (let x = tx - 3; x <= tx + 3; x++) set(x, ty - 1, Math.abs(x - tx) === 3 ? fDark : flower);
        for (let x = tx - 2; x <= tx + 2; x++) set(x, ty - 2, fLight);
        set(tx, ty, stem);
      } else if (f === "top") {
        set(tx - 1, ty, flower);
        set(tx + 1, ty, flower);
        set(tx, ty - 1, fLight);
        set(tx, ty, d.eye || flower);
      }
    }
  }
  if (d.glow) for (const s of stems) { set(s.tx, s.ty - 1, d.glow); if (d.flowers === "none" || !flower) set(s.tx, s.ty, tone(d.glow, 0.85)); }
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

// A sapling (docs/46 step 3, #449): a young tree from a felling, planted, drawn at each stage of its growing: a little mound of turned earth at
// the foot, a thin trunk (two pixels wide when `wide`) rising `height` pixels, a pair of leaves on a twig half way up, and a lumpy crown of
// leaves `crown` pixels round, lit from the upper left. Larger at each stage; the grown tree is the round oak's drawn picture.
function sapling(d, set) {
  const trunk = d.trunk || "#6a4a2a";
  const leaf = d.leaf || "#4f8a3a";
  const soil = d.soil || "#6a5034";
  const seed = d.seed || 1;
  const H = Math.max(3, d.height || 6);
  const R = Math.max(2, d.crown || 3);
  for (let x = -3; x <= 3; x++) set(x, 0, Math.abs(x) === 3 ? tone(soil, 0.78) : x > 0 ? tone(soil, 0.88) : soil);
  for (let x = -2; x <= 2; x++) set(x, -1, x < 0 ? tone(soil, 1.18) : soil);
  for (let y = -1; y >= -H; y--) {
    set(0, y, y === -1 ? tone(trunk, 0.8) : trunk);
    if (d.wide) set(1, y, tone(trunk, 0.72));
  }
  // A twig with a pair of leaves half way up the trunk, on the side the seed picks.
  const side = hash(seed, 7) < 0.5 ? -1 : 1;
  const ty = -Math.max(2, Math.round(H * 0.55));
  const off = side > 0 && d.wide ? 1 : 0;
  set(off + side, ty, tone(trunk, 0.9));
  set(off + side * 2, ty - 1, leaf);
  set(off + side * 3, ty - 1, tone(leaf, 1.25));
  set(off + side * 2, ty - 2, tone(leaf, 1.25));
  // The crown: a disc a little wider than tall, its edge broken by the seed, shaded darker to the lower right.
  const cy = -H - R + 1;
  const cx = d.wide ? 0.5 : 0;
  for (let y = -R; y <= R; y++) {
    for (let x = -R - 1; x <= R + 1; x++) {
      const dx = x - cx;
      const r2 = (dx * dx) / 1.15 + y * y;
      const edge = R * R - (hash(seed, (x + 20) * 41 + y + 20) < 0.35 ? R : 0);
      if (r2 > edge) continue;
      const lit = dx + y < -R * 0.6;
      const shade = dx + y > R * 0.5;
      let c = lit ? tone(leaf, 1.22) : shade ? tone(leaf, 0.72) : leaf;
      if (!lit && !shade && hash(seed + 3, (x + 20) * 37 + y) < 0.18) c = tone(leaf, 0.86);
      set(x, cy + y, c);
    }
  }
}

// A clay vial (docs/47 sections 2 and 8, #481): an earthen bottle, its belly lit from the upper left, a narrow neck and a lip. Clay is opaque
// (Michael, 2026-10-25), so a potion's colour is on its wax seal and a glazed band round its shoulder (`seal`, `band`, each a colour; a strong
// poison's seal black); an empty vial is bare, its mouth open; an unfired one (`fired` false) is matte raw clay with no sheen.
const VIAL_ROWS = [[0, 2], [-1, 3], [-2, 3], [-3, 3], [-4, 3], [-5, 2], [-6, 1], [-7, 1], [-8, 2]]; // [y, half width], the foot up to the lip
function vial(d, set) {
  const body = d.body || (d.fired === false ? "#9a7a62" : "#b8673c");
  const seed = d.seed || 1;
  for (const [y, hw] of VIAL_ROWS) {
    for (let x = -hw; x <= hw; x++) {
      let c = x <= -hw + 1 && hw > 1 ? tone(body, 1.16) : x >= hw ? tone(body, 0.72) : x > 0 ? tone(body, 0.88) : body;
      if (y === 0) c = tone(c, 0.82); // the foot in shade
      if (d.fired === false && hash(seed, (x + 9) * 13 + y + 20) < 0.18) c = tone(c, 0.9); // raw clay, a little uneven
      set(x, y, c);
    }
  }
  if (d.fired !== false) { set(-2, -2, tone(body, 1.4)); set(-2, -3, tone(body, 1.3)); } // the fired clay's sheen
  if (d.band) {
    for (const y of [-4, -5]) {
      const hw = VIAL_ROWS.find((r) => r[0] === y)[1];
      for (let x = -hw; x <= hw; x++) set(x, y, x <= -hw + 1 ? tone(d.band, 1.2) : x >= hw ? tone(d.band, 0.7) : y === -5 ? tone(d.band, 1.05) : d.band);
    }
    set(-1, -5, tone(d.band, 1.45)); // the glaze's glint
  }
  if (d.seal) {
    for (let x = -2; x <= 2; x++) set(x, -8, Math.abs(x) === 2 ? tone(d.seal, 0.78) : d.seal);
    for (let x = -1; x <= 1; x++) set(x, -9, x < 0 ? tone(d.seal, 1.3) : d.seal);
    set(2, -7, tone(d.seal, 0.7)); // a drip of wax down the neck
  } else set(0, -8, tone(body, 0.45)); // bare: the open mouth
}

const DRAW = { herb, mushroom, lump, sapling, vial };

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
