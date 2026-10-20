// The fourteen skills' icons (#294): tiny pixel pictures, 16 by 16, generated at first use with Canvas 2D like the rest of the dev art (docs/06, the placeholder rule: drawn
// art replaces them through the same interface later). One module, so the floating numbers over heads (ui/floaters.js), the skills panel, and the hover card draw the same
// pictures. Each is a few shapes (a sword, a bow, a cog) in flat colours with a one-pixel dark outline, drawn big enough to read at 1x and crisp at 2x or 3x (`image-rendering:
// pixelated`). Never drawn into the world's canvas; a DOM `<img>` from `skillIconURL`, or a canvas from `skillIcon`.

export const SKILLS = [
  { id: "melee", name: "Melee" },
  { id: "magic", name: "Magic" },
  { id: "ranged", name: "Ranged" },
  { id: "faith", name: "Faith" },
  { id: "woodcutting", name: "Woodcutting" },
  { id: "mining", name: "Mining" },
  { id: "fishing", name: "Fishing" },
  { id: "herbalism", name: "Herbalism" },
  { id: "beastlore", name: "Beastlore" },
  { id: "farming", name: "Farming" },
  { id: "cooking", name: "Cooking" },
  { id: "blacksmithing", name: "Blacksmithing" },
  { id: "crafting", name: "Crafting" },
  { id: "potions", name: "Potions" },
];

export const SIZE = 16;
export const skillIds = () => SKILLS.map((s) => s.id);
export const skillName = (id) => (SKILLS.find((s) => s.id === id) || { name: String(id) }).name;
export const skillIndex = (id) => SKILLS.findIndex((s) => s.id === id);

const OUTLINE = [28, 20, 16, 255];

function hex(c) {
  return [parseInt(c.slice(1, 3), 16), parseInt(c.slice(3, 5), 16), parseInt(c.slice(5, 7), 16), 255];
}

// A 16 by 16 pixel buffer with the few drawing operations the icons need.
function buffer() {
  const d = new Uint8ClampedArray(SIZE * SIZE * 4);
  const put = (x, y, c) => {
    x = Math.round(x);
    y = Math.round(y);
    if (x < 0 || y < 0 || x >= SIZE || y >= SIZE) return;
    const col = typeof c === "string" ? hex(c) : c;
    d.set(col, (y * SIZE + x) * 4);
  };
  const rect = (x0, y0, x1, y1, c) => { for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) put(x, y, c); };
  const line = (x0, y0, x1, y1, c, w = 1) => {
    const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), 1);
    for (let i = 0; i <= n; i++) {
      const x = x0 + ((x1 - x0) * i) / n;
      const y = y0 + ((y1 - y0) * i) / n;
      put(x, y, c);
      if (w > 1) { put(x + 1, y, c); }
      if (w > 2) { put(x, y + 1, c); }
    }
  };
  const disc = (cx, cy, r, c) => { for (let y = -r; y <= r; y++) for (let x = -r; x <= r; x++) if (x * x + y * y <= r * r + r * 0.6) put(cx + x, cy + y, c); };
  const oval = (cx, cy, rx, ry, c) => { for (let y = -ry; y <= ry; y++) for (let x = -rx; x <= rx; x++) if ((x * x) / (rx * rx + 0.3) + (y * y) / (ry * ry + 0.3) <= 1) put(cx + x, cy + y, c); };
  const at = (x, y) => (x < 0 || y < 0 || x >= SIZE || y >= SIZE ? 0 : d[(y * SIZE + x) * 4 + 3]);
  // The dark outline, round whatever was drawn.
  const outline = () => {
    const o = [];
    for (let y = 0; y < SIZE; y++) for (let x = 0; x < SIZE; x++) {
      if (at(x, y)) continue;
      let near = false;
      for (let dy = -1; dy <= 1 && !near; dy++) for (let dx = -1; dx <= 1; dx++) if ((dx || dy) && at(x + dx, y + dy)) { near = true; break; }
      if (near) o.push([x, y]);
    }
    for (const [x, y] of o) put(x, y, OUTLINE);
  };
  return { d, put, rect, line, disc, oval, outline };
}

const DRAW = {
  melee(b) {
    b.line(6, 10, 13, 3, "#e3e8ee", 2); // the blade
    b.line(7, 10, 13, 4, "#aab4c0");
    b.line(4, 8, 8, 12, "#e0b040", 2); // the guard
    b.line(4, 11, 2, 13, "#7a4a28", 2); // the grip
    b.put(1, 14, "#e0b040");
  },
  magic(b) {
    b.line(3, 14, 9, 8, "#8a5a30", 2); // the staff
    b.disc(11, 5, 3, "#8a4fe0"); // the orb
    b.put(10, 4, "#e6d0ff");
    b.put(11, 4, "#c9a0ff");
    b.put(14, 1, "#ffe27a");
    b.put(14, 9, "#ffe27a");
    b.put(7, 3, "#ffe27a");
  },
  ranged(b) {
    b.line(10, 1, 13, 4, "#8a5a30", 2); // the bow
    b.line(13, 4, 13, 11, "#8a5a30", 2);
    b.line(13, 11, 10, 14, "#8a5a30", 2);
    b.line(10, 1, 10, 14, "#ece4cc"); // the string
    b.line(2, 8, 12, 8, "#d8c8a0"); // the arrow
    b.put(13, 8, "#9aa4b0");
    b.put(12, 7, "#9aa4b0");
    b.put(12, 9, "#9aa4b0");
    b.put(2, 6, "#d8453c");
    b.put(3, 7, "#d8453c");
    b.put(2, 10, "#d8453c");
    b.put(3, 9, "#d8453c");
  },
  faith(b) {
    b.rect(7, 2, 8, 13, "#f2c14e"); // the cross
    b.rect(4, 5, 11, 6, "#f2c14e");
    b.rect(7, 2, 7, 13, "#ffe9a0");
    b.put(2, 2, "#ffe9a0");
    b.put(13, 2, "#ffe9a0");
    b.put(2, 13, "#ffe9a0");
    b.put(13, 13, "#ffe9a0");
  },
  woodcutting(b) {
    b.line(3, 14, 11, 5, "#8a5a30", 2); // the handle
    b.rect(10, 2, 14, 6, "#c2c9d2"); // the head
    b.rect(10, 2, 11, 6, "#e6ebf0");
    b.put(14, 2, 0); // a bevel
    b.rect(12, 8, 14, 12, "#a87848"); // a billet of wood
    b.put(13, 10, "#6a4a28");
  },
  mining(b) {
    b.line(3, 14, 12, 5, "#8a5a30", 2); // the handle
    b.line(5, 5, 8, 3, "#c2c9d2", 2); // the head, a curved bar
    b.line(8, 3, 12, 3, "#c2c9d2", 2);
    b.line(12, 3, 14, 7, "#c2c9d2", 2);
    b.put(8, 3, "#e6ebf0");
    b.put(9, 3, "#e6ebf0");
  },
  fishing(b) {
    b.oval(8, 8, 5, 3, "#6fb0e6"); // the body
    b.rect(5, 9, 10, 10, "#c8e6f8"); // the belly
    b.line(2, 5, 3, 8, "#4a88c0", 2); // the tail
    b.line(2, 11, 3, 8, "#4a88c0", 2);
    b.put(11, 7, "#1c1410"); // the eye
    b.put(8, 4, "#4a88c0"); // a fin
    b.put(9, 4, "#4a88c0");
  },
  herbalism(b) {
    b.line(8, 14, 8, 4, "#3a8a3a"); // the stem
    b.oval(5, 7, 2, 1, "#58c058"); // the leaves
    b.oval(11, 9, 2, 1, "#58c058");
    b.oval(5, 11, 2, 1, "#58c058");
    b.oval(11, 5, 2, 1, "#58c058");
    b.oval(8, 3, 1, 2, "#7ae07a");
  },
  beastlore(b) {
    b.oval(8, 11, 3, 2, "#8a5a3a"); // the pad
    b.rect(6, 12, 10, 12, "#8a5a3a");
    b.put(8, 10, "#b88a62");
    b.rect(2, 6, 3, 7, "#8a5a3a"); // the toes, apart
    b.rect(5, 3, 6, 5, "#8a5a3a");
    b.rect(9, 3, 10, 5, "#8a5a3a");
    b.rect(12, 6, 13, 7, "#8a5a3a");
  },
  farming(b) {
    b.line(8, 14, 8, 6, "#6a9a3a"); // the stalk
    for (const y of [4, 6, 8]) { b.put(6, y, "#e6c14e"); b.put(10, y, "#e6c14e"); b.put(7, y + 1, "#c9a030"); b.put(9, y + 1, "#c9a030"); }
    b.put(8, 2, "#f0d060");
    b.put(8, 3, "#e6c14e");
    b.line(5, 14, 11, 14, "#7a5a30");
  },
  cooking(b) {
    b.rect(3, 7, 12, 11, "#6a707a"); // the pot
    b.rect(3, 7, 12, 7, "#9aa2ae"); // the rim
    b.rect(3, 8, 4, 11, "#8a909c");
    b.put(1, 8, "#6a707a"); // the handles
    b.put(2, 8, "#6a707a");
    b.put(13, 8, "#6a707a");
    b.put(14, 8, "#6a707a");
    b.put(5, 13, "#f08a30"); // the fire
    b.put(8, 13, "#f0b030");
    b.put(11, 13, "#f08a30");
    b.put(8, 14, "#f08a30");
    b.put(6, 4, "#f4f4f4"); // steam
    b.put(7, 3, "#f4f4f4");
    b.put(10, 5, "#f4f4f4");
    b.put(9, 4, "#f4f4f4");
  },
  blacksmithing(b) {
    b.rect(2, 5, 12, 7, "#8a929e"); // the face of the anvil
    b.rect(2, 5, 12, 5, "#c2c9d2");
    b.rect(13, 5, 14, 6, "#8a929e"); // the horn
    b.rect(5, 8, 10, 10, "#6a727e"); // the waist
    b.rect(3, 11, 12, 13, "#8a929e"); // the foot
    b.put(5, 2, "#ffb030"); // sparks
    b.put(8, 3, "#ffd060");
    b.put(10, 2, "#ff8a30");
  },
  crafting(b) {
    b.disc(8, 8, 4, "#a8b0bc"); // the cog
    for (const [x, y] of [[8, 2], [8, 13], [2, 8], [13, 8], [3, 3], [12, 3], [3, 12], [12, 12]]) b.disc(x, y, 1, "#a8b0bc");
    b.disc(8, 8, 2, [0, 0, 0, 0]); // the hole
    b.disc(8, 8, 1, "#3a4048");
    b.put(6, 6, "#e6ebf0");
    b.put(7, 6, "#e6ebf0");
  },
  potions(b) {
    b.rect(7, 2, 8, 5, "#d8eef8"); // the neck
    b.rect(7, 1, 8, 1, "#8a5a30"); // the cork
    b.disc(8, 10, 4, "#cfe9f6"); // the glass
    b.oval(8, 11, 3, 2, "#e0405a"); // the draught
    b.rect(6, 12, 10, 13, "#e0405a");
    b.put(6, 9, "#ffffff");
    b.put(10, 8, "#ffffff");
    b.put(8, 6, "#ffffff");
  },
};

const canvases = new Map();
const urls = new Map();

// A 16 by 16 canvas of the skill's icon, drawn once.
export function skillIcon(id) {
  let c = canvases.get(id);
  if (c) return c;
  c = document.createElement("canvas");
  c.width = SIZE;
  c.height = SIZE;
  const b = buffer();
  const draw = DRAW[id];
  if (draw) draw(b);
  b.outline();
  c.getContext("2d").putImageData(new ImageData(b.d, SIZE, SIZE), 0, 0);
  canvases.set(id, c);
  return c;
}

// The same as a data URL, for an `<img>`.
export function skillIconURL(id) {
  let u = urls.get(id);
  if (!u) { u = skillIcon(id).toDataURL(); urls.set(id, u); }
  return u;
}

// An `<img>` of it at a whole-number scale, crisp.
export function skillIconHtml(id, scale = 2) {
  const px = SIZE * scale;
  return `<img class="skill-icon" src="${skillIconURL(id)}" alt="${skillName(id)}" width="${px}" height="${px}" draggable="false" style="image-rendering:pixelated">`;
}
