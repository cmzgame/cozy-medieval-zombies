// The woods (#334; docs/02, 2026-10-20, "The woods are wall types, mixed with any wood's doors and windows"): every wood and daub is a wall type of its own (`wall_wood` is oak, then `wall_spruce`,
// `wall_mahogany`, `wall_winterpine`, `wall_bloodbark`, `wall_daub`), and a door or a window in one of them may be of another wood: its `leaf` is the wall sprite of the wood its leaves and shutters
// are. A wall's `sprite` stays its material; `leaf` is set only when it differs from the wall's own (a wall's leaves are its own wood's, and daub's are oak's: `wall.leaf` in its definition), so
// every wall made before reads as it did. A wall definition's `wall` block says which table of `data/wood_tones.json` its pixels are (`wood`), its name (`name`), and whether it is a region's
// wood (`region`: Winter Pine and Bloodbark, built only while Free building is on until the regions and their planks exist).
//
// The rules (what leaf a wall may take, what it is called) read the sprite definitions only and run on the authority, headless too. The picture is the client's: an open door or shutter is
// drawn from the leaf wood's parts sheet, and the shut door or closed shutters, painted into the wall's `door_shut` and `window_shut` frames, are recoloured at first use when the leaf differs
// from the wall: the oak wall's frames are the base (every other wood's wall is its table applied to them, `check("woods")` proves each equals the delivered file pixel for pixel), the pixels
// of the shut leaf (those that differ from the open frame and carry a leaf role's tone) are looked up in the leaf wood's table, the rest in the wall's own, and the result is registered
// as a sheet like any generated one, keyed by wall and leaf.

import { getDef, getSheet, registerSheet } from "./assets.js";

const ORDER = ["wall_wood", "wall_spruce", "wall_mahogany", "wall_winterpine", "wall_bloodbark"]; // the woods that have leaves of their own, as the palette lists them
const OAK = "wall_wood";
const SHUT = ["north_door_shut", "west_door_shut", "north_window_shut", "west_window_shut"]; // the frames with a shut leaf painted in
const OPEN_OF = (name) => name.replace("_shut", "_open");

function wallBlock(sprite) {
  try {
    return (typeof sprite === "string" && getDef(sprite).wall) || null;
  } catch {
    return null;
  }
}

// Whether a wall sprite is a wood (or daub): a drawn wall with a table of tones, so its leaves can be another wood's.
export const isWoodWall = (sprite) => !!(wallBlock(sprite) && wallBlock(sprite).wood);

// The wall sprite whose wood a wall's own leaves are: its own, or what its definition names (daub's are oak's); null for a wall that is no wood (a log wall, stone, a fence).
export function ownLeaf(sprite) {
  const b = wallBlock(sprite);
  return b && b.wood ? b.leaf || sprite : null;
}

// A wood's name for a message ("Winter Pine").
export const woodName = (sprite) => (wallBlock(sprite) && wallBlock(sprite).name) || String(sprite).replace(/^wall_/, "");

// The woods a door or a window may be of, in the palette's order: those with leaves of their own, the regions' two only while Free building is on.
export function leafChoices(freeBuilding) {
  return ORDER.filter((s) => isWoodWall(s) && !wallBlock(s).leaf && (freeBuilding || !wallBlock(s).region));
}

// Why a door or window in a wall of this sprite cannot have this leaf, or "" (an empty leaf is the wall's own, always fine).
export function leafProblem(sprite, leaf, freeBuilding) {
  if (!leaf) return "";
  if (!isWoodWall(sprite)) return "Only a wood wall takes another wood's door";
  if (!ORDER.includes(leaf) || !isWoodWall(leaf) || wallBlock(leaf).leaf) return "No such wood";
  if (wallBlock(leaf).region && !freeBuilding) return `${woodName(leaf)} is found beyond the valley`;
  return "";
}

// The leaf to store on a wall of this sprite: the wood's wall sprite when it differs from the wall's own and is allowed, else null (nothing stored).
export function storedLeaf(sprite, leaf, freeBuilding = true) {
  if (!leaf || leafProblem(sprite, leaf, freeBuilding)) return null;
  return leaf === ownLeaf(sprite) ? null : leaf;
}

// The wall sprite of the wood a wall's leaves are.
export const leafOf = (wall) => (wall && (wall.leaf || ownLeaf(wall.sprite))) || null;

// The parts sheet (open doors and shutters) of a wall's leaf wood, or its own definition's.
export function partsOf(wall) {
  const l = wall.leaf && isWoodWall(wall.leaf) ? wall.leaf : null;
  const b = wallBlock(l || wall.sprite);
  return (b && b.parts) || null;
}

// ---- the picture (client only) ----

let tones = null; // data/wood_tones.json
export function setTones(json) {
  tones = json || null;
  variants.clear();
}

const variants = new Map(); // "wall>leaf" -> the registered sheet's id
const masks = new Map(); // a shut frame's name -> Uint8Array, 1 where the pixel is the leaf's

function hex(r, g, b) {
  return `#${[r, g, b].map((v) => v.toString(16).padStart(2, "0")).join("")}`;
}

const scratch = new Map(); // a sheet image that is no canvas -> a canvas copy of it
function contextOf(img) {
  if (img.getContext) return img.getContext("2d");
  let k = scratch.get(img);
  if (!k) {
    const cv = document.createElement("canvas");
    cv.width = img.width;
    cv.height = img.height;
    k = cv.getContext("2d");
    k.drawImage(img, 0, 0);
    scratch.set(img, k);
  }
  return k;
}

function pixelsOf(sheet, name) {
  const [x, y, w, h] = sheet.frames[name];
  return contextOf(sheet.image).getImageData(x, y, w, h);
}

// Which pixels of an oak shut frame are the leaf (exported for `check("woods")`): those that differ from the open frame (the opening) and whose tone is one of the leaf roles'.
export function shutMask(oak, name) {
  if (masks.has(name)) return masks.get(name);
  const leafTones = new Set(Object.entries(tones.roles).filter(([k]) => k.startsWith("leaf")).flatMap(([, v]) => v));
  const shut = pixelsOf(oak, name).data;
  const open = pixelsOf(oak, OPEN_OF(name)).data;
  const m = new Uint8Array(shut.length / 4);
  for (let i = 0; i < m.length; i++) {
    const o = i * 4;
    if (shut[o + 3] === 0) continue;
    const same = shut[o] === open[o] && shut[o + 1] === open[o + 1] && shut[o + 2] === open[o + 2] && shut[o + 3] === open[o + 3];
    if (!same && leafTones.has(hex(shut[o], shut[o + 1], shut[o + 2]))) m[i] = 1;
  }
  masks.set(name, m);
  return m;
}

// The shut frame `name` of a wall of wood `wallWood` with leaves of wood `leafWood`, as pixels: the oak frame with the wall's table applied to every pixel but the leaf's, and the leaf wood's
// to the leaf's. With the two the same it is the delivered file of that wood (`check("woods")`). Returns ImageData.
export function shutPixels(oak, name, wallWood, leafWood) {
  const t = tones.tables;
  const src = pixelsOf(oak, name);
  const mask = shutMask(oak, name);
  const out = new ImageData(src.width, src.height);
  const lookup = new Map();
  const paint = (table, r, g, b) => {
    const k = `${table === t[wallWood] ? "w" : "l"}${r},${g},${b}`;
    let rgb = lookup.get(k);
    if (!rgb) {
      const to = table[hex(r, g, b)] || hex(r, g, b);
      rgb = [parseInt(to.slice(1, 3), 16), parseInt(to.slice(3, 5), 16), parseInt(to.slice(5, 7), 16)];
      lookup.set(k, rgb);
    }
    return rgb;
  };
  for (let i = 0; i < mask.length; i++) {
    const o = i * 4;
    const a = src.data[o + 3];
    if (a === 0) continue;
    const [r, g, b] = paint(mask[i] ? t[leafWood] : t[wallWood], src.data[o], src.data[o + 1], src.data[o + 2]);
    out.data[o] = r;
    out.data[o + 1] = g;
    out.data[o + 2] = b;
    out.data[o + 3] = a;
  }
  return out;
}

// The sheet to draw a wall's frames from: its own, or, for a door or window whose leaf is another wood than the wall's, a copy with the shut frames recoloured and the parts pointing at the
// leaf wood's (built once, on first use, and registered like a generated sheet). Without the tones (headless) or when anything is missing, the wall's own sheet.
export function sheetFor(wall) {
  const own = getSheet(wall.sprite);
  if (!wall.leaf || !tones || !own.wall || !own.wall.wood || !isWoodWall(wall.leaf)) return own;
  const key = `${wall.sprite}>${wall.leaf}`;
  if (variants.has(key)) return getSheet(variants.get(key));
  const oak = getSheet(OAK);
  const canvas = document.createElement("canvas");
  canvas.width = own.image.width;
  canvas.height = own.image.height;
  const ctx = canvas.getContext("2d");
  ctx.drawImage(own.image, 0, 0);
  const wallWood = own.wall.wood;
  const leafWood = wallBlock(wall.leaf).wood;
  for (const name of SHUT) {
    const [x, y] = own.frames[name];
    ctx.putImageData(shutPixels(oak, name, wallWood, leafWood), x, y);
  }
  const id = `leaf:${key}`;
  const sheet = registerSheet(id, { ...own, image: canvas, wall: { ...own.wall, parts: wallBlock(wall.leaf).parts } }, { generated: `a ${woodName(wall.sprite)} wall's shut leaves in ${woodName(wall.leaf)}` });
  variants.set(key, id);
  return sheet;
}
