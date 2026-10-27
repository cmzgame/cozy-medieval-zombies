// Copied from cozy-zombie-game src/assets.js on 2026-10-09. loadNodeSprites replaced by loadMapSprites for the chunked map format.
// Sprite definitions and sheets. A sheet built from a real PNG + JSON and a
// generated placeholder sheet have the same shape. See docs/03 and docs/06.

import * as placeholders from "./placeholders.js";
import * as figure from "./figure.js";
import { inBatches } from "./boot.js";
import { fruitCanvas } from "./fruit-art.js"; // fruit painted into a drawn crown at load (#422)

const defs = new Map();
const sheets = new Map();

// The manifest (docs/23, step 1; data/manifest.json, made by tools/manifest.py):
// every file under data/ with a stamp. A path in it is fetched as path?v=stamp,
// which serve.py caches for a year, so a hard refresh re-fetches only what changed.
let manifest = null;
export function setManifest(m) {
  manifest = m;
}

export function url(path) {
  const entry = manifest && manifest.files[path];
  return entry ? `${path}?v=${entry.stamp}` : path;
}

// Headless (docs/31/05, item 23; tools/world.js): the world booted with no window,
// so JSON comes from a reader the runner sets (the disk under Node) and a sheet is
// its frames, anchors, and animations with no picture: what the simulation reads
// (a bite fires on the active frame, a corpse waits for the fall's end) and
// nothing the renderer would.
let jsonReader = null;
let headless = false;
export function setJsonReader(fn) {
  jsonReader = fn;
}
export function setHeadless(on) {
  headless = !!on;
}
export function isHeadless() {
  return headless;
}

export async function loadJson(path) {
  if (jsonReader) return jsonReader(path);
  const res = await fetch(url(path));
  if (!res.ok) throw new Error(`Failed to load ${path} (${res.status})`);
  return res.json();
}

// Images are fetched once per path and shared (several definitions and the
// two-tile slices ask for the same picture). A failed fetch is tried again
// before the boot gives up: the boot asks for some three hundred pictures at
// once, and one dropped by the server or the network killed it now and then
// (Michael's playtest, 2026-10-26: "this has been an ongoing issue").
const images = new Map();
const IMAGE_RETRIES = [300, 1000, 2500]; // ms to wait before each try after the first
export function loadImage(src) {
  if (!images.has(src)) {
    const pending = new Promise((resolve, reject) => {
      let attempt = 0;
      const tryLoad = () => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = () => {
          if (attempt < IMAGE_RETRIES.length) {
            setTimeout(tryLoad, IMAGE_RETRIES[attempt++]);
            return;
          }
          if (images.get(src) === pending) images.delete(src); // never a newer ask made while this one retried
          reject(new Error(`Failed to load image ${src}`));
        };
        // A retry asks again past any cache that kept the failure.
        const u = url(src);
        img.src = attempt ? `${u}${u.includes("?") ? "&" : "?"}retry=${attempt}` : u;
      };
      tryLoad();
    });
    images.set(src, pending);
  }
  return images.get(src);
}

// Everything the manifest lists, up front (docs/23): every sprite definition
// (its pictures with it), then every picture nothing named yet. `progress`
// gets 0..1 as files land.
export async function loadAll(progress = () => {}) {
  if (!manifest) throw new Error("No manifest loaded");
  const paths = Object.keys(manifest.files);
  const ids = paths.filter((p) => /^data\/sprites\/[^/]+\.json$/.test(p)).map((p) => p.slice("data/sprites/".length, -5));
  // Every picture the game draws is under data/art and named by a definition or an item; the design
  // agent's character delivery (data/art/character: the slicer's inputs and previews, installed as layer
  // files) is data the game never draws, so it is not fetched at boot. Found 2026-10-13 on GitHub Pages,
  // which serves nothing under a folder named with a leading underscore (Jekyll's rule; .nojekyll turns
  // that off too): the boot asked for _superseded/hair_plaits.png and failed whole.
  const pngs = paths.filter((p) => p.endsWith(".png") && !p.startsWith("data/art/character/"));
  const total = ids.length + pngs.length;
  let n = 0;
  await inBatches(ids, (id) => loadSprite(id), 8, () => progress(++n / total));
  if (!headless) await inBatches(pngs, (p) => loadImage(p), 12, () => progress(++n / total));
}

// Every sheet registered so far, for packing the atlas at boot.
export function allSheets() {
  return [...sheets.values()];
}

// The same, each with the key it is registered under: a sheet's `id` is its sprite's, shared by a prop's one-tile and many-tile sheets (`table` and `table#2`), the key is not (#245).
export function allSheetEntries() {
  return [...sheets.entries()];
}

const pendingDefs = new Map();

export async function loadSpriteDef(id) {
  if (defs.has(id)) return defs.get(id);
  // Share one request between callers that ask for the same sprite at once.
  if (!pendingDefs.has(id)) {
    pendingDefs.set(id, loadJson(`data/sprites/${id}.json`).then((def) => {
      def.id = id;
      defs.set(id, def);
      pendingDefs.delete(id);
      return def;
    }));
  }
  return pendingDefs.get(id);
}

// The ids of the loaded definitions that carry a field, sorted (the chart's palette: host and guest build the same from the same data).
export function defIdsWith(field) {
  return [...defs.entries()].filter(([, d]) => d && d[field] !== undefined).map(([id]) => id).sort();
}

export function getDef(id) {
  const d = defs.get(id);
  if (!d) throw new Error(`Sprite definition not loaded: ${id}`);
  return d;
}

// Build a sheet from a definition. Real art if `image` is present, else a
// generated placeholder. `tileCount` lets box props provide one frame per
// footprint tile.
export async function loadSprite(id, { tileCount = 1 } = {}) {
  const key = tileCount > 1 ? `${id}#${tileCount}` : id;
  if (sheets.has(key)) return sheets.get(key);
  const def = await loadSpriteDef(id);
  let sheet;
  if (headless) {
    // No picture: the definition's own frames and animations, or the figure's table.
    sheet = def.placeholder && def.placeholder.kind === "character"
      ? figure.describeFigure(def.placeholder.variant === "zombie" ? figure.zombieSpec(0) : figure.playerSpec(def.placeholder.look || {}, {}, () => null))
      : { image: null, frames: def.frames || {}, anchor: def.anchor || [0, 0], bounds: def.bounds || null, animations: def.animations || {}, facings: def.facings || [], mirror: def.mirror || {} };
  } else if (def.drawings) {
    sheet = await sheetFromDrawings(def);
  } else if (def.images) {
    sheet = await sheetFromImages(def);
    // A drawn wall brings its post, its parts, and the board overlays with it.
    if (def.wall) {
      for (const id of [def.wall.post, def.wall.parts, def.wall.boards || "wall_boards"]) if (id) await loadSprite(id);
    }
  } else if (def.image) {
    let image = await loadImage(def.image);
    let { frames, anchor, bounds } = def;
    if (def.scale && def.scale !== 1) {
      // Drawn bigger, once, at load (the sprite's `scale`): resampled into a canvas so the world still
      // draws it 1:1 and never scales in drawImage at display time. Frames, anchor, and bounds scale with it.
      const k = def.scale;
      const c = document.createElement("canvas");
      c.width = Math.round(image.width * k);
      c.height = Math.round(image.height * k);
      const g = c.getContext("2d");
      g.imageSmoothingEnabled = def.smooth !== false;
      g.imageSmoothingQuality = "high";
      g.drawImage(image, 0, 0, c.width, c.height);
      image = c;
      const sc = (r) => r.map((n) => Math.round(n * k));
      frames = Object.fromEntries(Object.entries(frames).map(([n, r]) => [n, sc(r)]));
      anchor = sc(anchor);
      if (bounds) bounds = { x: Math.round(bounds.x * k), y: Math.round(bounds.y * k), w: Math.round(bounds.w * k), h: Math.round(bounds.h * k) };
    }
    // A fruit tree laden (`fruit`, #422): the picture copied into a canvas and its fruit painted on the crown's leaves (src/fruit-art.js); the
    // file itself is never written, and the bare kind names the same file without the block.
    if (def.fruit) image = fruitCanvas(image, def.fruit);
    sheet = {
      image,
      frames,
      anchor,
      bounds, // the visible extent, for occlusion and hit tests (placeholders provide it too)
      animations: def.animations || {},
      facings: def.facings || [],
      mirror: def.mirror || {},
    };
  } else if (def.placeholder) {
    const ph = def.placeholder;
    switch (ph.kind) {
      case "character":
        // The figure (docs/12). The player's sheet is rebuilt by main.js
        // whenever their look or clothes change; the dead and villagers
        // share sheets by outfit (`sheetFor`, docs/19).
        sheet = figure.generateFigure(ph.variant === "zombie" ? figure.zombieSpec(0) : figure.playerSpec(ph.look || {}, {}, () => null));
        break;
      case "box": sheet = placeholders.generateBox(ph, tileCount); break;
      case "post": sheet = placeholders.generatePost(ph); break;
      case "tree": sheet = placeholders.generateTree(ph); break;
      case "flat": sheet = placeholders.generateFlat(ph); break;
      case "wall": sheet = placeholders.generateWall(ph); break;
      case "pumpkin": sheet = placeholders.generatePumpkin(ph); break;
      case "hearth": sheet = placeholders.generateHearth(ph); break;
      case "campfire": sheet = placeholders.generateCampfire(ph); break;
      case "torch_post": sheet = placeholders.generateTorchPost(ph); break;
      case "lantern_post": sheet = placeholders.generateLanternPost(ph); break;
      case "flame": sheet = placeholders.generateFlame(); break;
      case "herb": case "mushroom": case "lump": case "sapling": sheet = placeholders.generateNode(ph); break; // docs/46 steps 2 and 3: the gatherables' dev art and a sapling's (gather-art.js)
      case "animal": sheet = placeholders.generateAnimal(ph, def); break; // docs/45 section 6: a species' sheet, its animations and facings the definition's own
      case "ground": sheet = placeholders.generateGround(ph); break; // docs/15: dirt, cobble
      case "noise": sheet = placeholders.generateNoise(ph); break; // docs/15: the edges' noise
      case "ui": sheet = placeholders.generateUiKit(ph); break; // docs/23 step 4: the interface's frame, well, and button
      default: throw new Error(`Unknown placeholder kind ${ph.kind} for ${id}`);
    }
  } else {
    throw new Error(`Sprite ${id} has neither image nor placeholder`);
  }
  // Where the sheet came from (docs/23, step 3b): the files, or the generator; the tools open either.
  sheet.source = def.placeholder ? { generated: def.placeholder.kind, def: `data/sprites/${id}.json` } : { drawn: pngsOf(def), def: `data/sprites/${id}.json`, ...(def.fruit ? { painted: "fruit" } : {}) };
  sheet.id = id;
  sheets.set(key, sheet);
  return sheet;
}

// Every PNG a definition names, in order, once each.
function pngsOf(obj, out = []) {
  if (typeof obj === "string") { if (obj.endsWith(".png") && !out.includes(obj)) out.push(obj); }
  else if (Array.isArray(obj)) for (const v of obj) pngsOf(v, out);
  else if (obj && typeof obj === "object") for (const v of Object.values(obj)) pngsOf(v, out);
  return out;
}

// Every sheet and where it came from, for the sprite browser (docs/23, step 3e).
export function sources() {
  return [...sheets.entries()].map(([key, s]) => ({ key, id: s.id, source: s.source || { generated: s.id }, w: s.image.width, h: s.image.height, frames: Object.keys(s.frames).length }));
}

// A sprite saved by the tool (docs/23, step 3f): the manifest read afresh for
// the new stamps, the definition, its pictures, and every variant of the sheet
// dropped and built again. Holders look sheets up by id each frame, so the new
// object is drawn at once; the atlas places it at first draw.
export async function reloadSheet(id) {
  setManifest(await loadJson("data/manifest.json"));
  const old = sheets.get(id);
  const variants = [...sheets.keys()].filter((k) => k === id || k.startsWith(`${id}#`));
  for (const k of variants) sheets.delete(k);
  defs.delete(id);
  pendingDefs.delete(id);
  for (const p of (old && old.source && old.source.drawn) || []) images.delete(p);
  const def = await loadSpriteDef(id);
  for (const p of pngsOf(def)) images.delete(p);
  for (const k of variants) await loadSprite(id, { tileCount: k.includes("#") ? Number(k.split("#")[1]) : 1 });
  if (!variants.length) await loadSprite(id);
  return sheets.get(id);
}

// ---- figure sheets, shared by outfit (docs/19) ----
// A figure's sheet is large (about 1056 x 576 px) and the atlas is shared with
// every tree and wall, so characters in the same clothes share one sheet:
// `sheetFor` bakes it the first time an outfit is seen and returns its id.
const figureSheets = new Map(); // specKey -> { id, inputs }
let figureSeq = 0;

// `only` ({ anim, frame, facing }) asks for that one frame on a sheet of its
// own: a corpse (docs/19). Corpse sheets are tiny (48 x 72) and shared by
// outfit and pose like the others, but counted apart.
const keyOf = (spec, only) => figure.specKey(spec) + (only ? `|${only.anim}|${only.frame}|${only.facing}` : "");

export function sheetFor(inputs, only = null) {
  const spec = figure.characterSpec(inputs);
  const key = keyOf(spec, only);
  let e = figureSheets.get(key);
  if (!e) {
    e = { id: `figure_${figureSeq++}`, inputs: structuredClone(inputs), only };
    registerSheet(e.id, headless ? figure.describeFigure(spec, only) : figure.generateFigure(spec, only), { generated: "figure" });
    figureSheets.set(key, e);
  }
  return e.id;
}

// The painted layers changed under the same names: bake every shared sheet
// again, in place, and key them afresh. The caller redraws them into the atlas.
export function rebakeFigures() {
  const out = [];
  const next = new Map();
  for (const e of figureSheets.values()) {
    const spec = figure.characterSpec(e.inputs);
    out.push(replaceSheet(e.id, figure.generateFigure(spec, e.only)));
    next.set(keyOf(spec, e.only), e);
  }
  figureSheets.clear();
  for (const [k, v] of next) figureSheets.set(k, v);
  return out;
}

export function figureSheetCount() {
  let n = 0;
  for (const e of figureSheets.values()) if (!e.only) n++;
  return n;
}

export function corpseSheetCount() {
  let n = 0;
  for (const e of figureSheets.values()) if (e.only) n++;
  return n;
}

// A sheet made in code (held art, the shared figures), by id.
// A held item drawn as a picture (docs/24, the design agent's item art): one image, its grip pixel
// where the hand holds it, drawn upright and shown at every one of the 16 held angles unrotated
// ("glued to the hand", the book), or, for an item with hand-drawn angles, the picture at each tilt.
// `src` is the upright drawing; the sheet's anchor is the grip, so the renderer puts the grip on the hand.
// Three modes (`held.mode`): "fixed" (the picture at every angle, unrotated: the book), "rotate" (the
// upright picture turned into the 16 angles about its grip by nearest pixel, as the generated shapes are:
// the knife and axe), and "angles" (hand-drawn tilts from 0 to 90 degrees clockwise with flips for the rest:
// the staff; the design agent's README has the rule). Sixteen angles, 0 up, clockwise, 22.5 apart.
export async function heldSheetFromImage(held) {
  const mode = held.mode || "fixed";
  if (mode === "angles") return heldSheetFromAngles(held.angles);
  if (mode === "facings") return heldSheetFromAngles(held.facings, true);
  const img = await loadImage(held.image);
  const grip = held.grip;
  if (mode === "rotate") return heldSheetRotated(img, grip, held.size || 32);
  const canvas = document.createElement("canvas");
  canvas.width = img.width;
  canvas.height = img.height;
  canvas.getContext("2d").drawImage(img, 0, 0);
  const frames = {};
  for (let k = 0; k < 16; k++) frames[`held_${k}`] = [0, 0, img.width, img.height];
  return { image: canvas, frames, anchor: [grip[0], grip[1]], animations: {}, facings: [], mirror: {}, tips: [] };
}

// The one nearest-pixel turn of a drawn picture (`sd` its RGBA, `w` by `h`) by `angle` radians clockwise about `pivot` (a point in its
// pixels), into the S by S square `out` with the pivot at its middle: every pixel whole, nothing blended. A held item's sixteen angles turn
// about its grip; a thrown knife's or axe's spin and the picture lying where it landed turn about its middle (archery.js, docs/24 section 1).
export function turnPixels(sd, w, h, pivot, angle, out, S) {
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const dx = x + 0.5 - S / 2;
      const dy = y + 0.5 - S / 2;
      const sx = Math.floor(pivot[0] + dx * cos + dy * sin);
      const sy = Math.floor(pivot[1] - dx * sin + dy * cos);
      if (sx < 0 || sy < 0 || sx >= w || sy >= h) continue;
      const i = (sy * w + sx) * 4;
      if (sd[i + 3] === 0) continue;
      const o = (y * S + x) * 4;
      out[o] = sd[i];
      out[o + 1] = sd[i + 1];
      out[o + 2] = sd[i + 2];
      out[o + 3] = 255;
    }
  }
}

function heldSheetRotated(img, grip, S) {
  const src = document.createElement("canvas");
  src.width = img.width;
  src.height = img.height;
  const sctx = src.getContext("2d", { willReadFrequently: true });
  sctx.drawImage(img, 0, 0);
  const sd = sctx.getImageData(0, 0, img.width, img.height).data;
  const canvas = document.createElement("canvas");
  canvas.width = S * 16;
  canvas.height = S;
  const ctx = canvas.getContext("2d");
  const frames = {};
  for (let k = 0; k < 16; k++) {
    const out = ctx.createImageData(S, S);
    turnPixels(sd, img.width, img.height, [grip[0] + 0.5, grip[1] + 0.5], (k * 22.5 * Math.PI) / 180, out.data, S); // about the grip pixel's middle
    ctx.putImageData(out, k * S, 0);
    frames[`held_${k}`] = [k * S, 0, S, S];
  }
  return { image: canvas, frames, anchor: [S / 2, S / 2], animations: {}, facings: [], mirror: {}, tips: [] };
}

// `angles`: [{ src, grip: [x, y], flame?: [x, y] }] for 0, 22.5, 45, 67.5, 90 degrees clockwise from up. 90 to 180 is the
// matching drawn tilt flipped vertically (grip y mirrored); 180 to 360 the matching one flipped
// horizontally (grip x mirrored): the design agent's rule for the staff. A drawn torch gives `flame`, the top pixel of
// its head in each tilt (art round 3, #331), mirrored with the picture like the grip; the sheet's `tips` (where the
// renderer puts a lit torch's flame, relative to the grip) come from it, as a generated torch's come from its shape.
// `byFacing` (the mode `facings`, art round 4: the bow): the five pictures are the thing seen as its holder faces 0, 22.5, 45, 67.5, and 90
// degrees from up, always upright (a bow's limbs stand up whichever way it points, figure/held.js); 90 to 180 repeats them back (the same
// sideways part), and 180 to 360 mirrors them; the sheet is `byFacing`, so the renderer picks its frame by the facing, as a generated bow's.
async function heldSheetFromAngles(angles, byFacing = false) {
  const imgs = await Promise.all(angles.map((a) => loadImage(a.src)));
  const flip = (c, gx, gy, v, fl = null) => {
    const o = document.createElement("canvas");
    o.width = c.width;
    o.height = c.height;
    const x = o.getContext("2d");
    if (v) { x.translate(0, c.height); x.scale(1, -1); } else { x.translate(c.width, 0); x.scale(-1, 1); }
    x.drawImage(c, 0, 0);
    const f = fl && (v ? [fl[0], c.height - 1 - fl[1]] : [c.width - 1 - fl[0], fl[1]]);
    return { c: o, gx: v ? gx : c.width - 1 - gx, gy: v ? c.height - 1 - gy : gy, fl: f };
  };
  const base = []; // k = 0..8
  imgs.forEach((img, i) => {
    const c = document.createElement("canvas");
    c.width = img.width;
    c.height = img.height;
    c.getContext("2d").drawImage(img, 0, 0);
    base[i] = { c, gx: angles[i].grip[0], gy: angles[i].grip[1], fl: angles[i].flame || null };
  });
  for (let k = 5; k <= 8; k++) { const m = base[8 - k]; base[k] = byFacing ? m : flip(m.c, m.gx, m.gy, true, m.fl); }
  const all = [];
  for (let k = 0; k < 16; k++) {
    if (k <= 8) all[k] = base[k];
    else { const m = base[16 - k]; all[k] = flip(m.c, m.gx, m.gy, false, m.fl); }
  }
  const W = all.reduce((n, f) => n + f.c.width + 1, 0);
  const H = Math.max(...all.map((f) => f.c.height));
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");
  const frames = {};
  const frameAnchors = {};
  let x = 0;
  all.forEach((f, k) => {
    ctx.drawImage(f.c, x, 0);
    frames[`held_${k}`] = [x, 0, f.c.width, f.c.height];
    frameAnchors[`held_${k}`] = [f.gx, f.gy];
    x += f.c.width + 1;
  });
  const tips = all.every((f) => f.fl) ? all.map((f) => [f.fl[0] - f.gx, f.fl[1] - f.gy]) : [];
  return { image: canvas, frames, frameAnchors, anchor: [0, 0], animations: {}, facings: [], mirror: {}, tips, ...(byFacing ? { byFacing: true } : {}) };
}

export function registerSheet(id, sheet, source = null) {
  sheet.id = id;
  sheet.source = source || sheet.source || { generated: id };
  sheets.set(id, sheet);
  return sheet;
}

// Forget a generated sheet (the woods' recoloured leaves, when their tones are set again).
export function dropSheet(id) {
  sheets.delete(id);
}

// Swap a sheet's content in place, keeping the object every holder has. The
// caller redraws it into the atlas (gl.redrawSheet); the image must keep its size.
export function replaceSheet(id, next) {
  const s = sheets.get(id);
  if (!s) return registerSheet(id, next);
  Object.assign(s, next, { id });
  return s;
}

export function getSheet(id, tileCount = 1) {
  const key = tileCount > 1 ? `${id}#${tileCount}` : id;
  const s = sheets.get(key);
  if (!s) throw new Error(`Sprite sheet not loaded: ${key}`);
  return s;
}

// The half-height of a tile: a "top vertex" anchor sits this far above the tile centre.
const TILE_HH = 16;

// An anchor in a definition, in the engine's convention (the pixel drawn at
// the tile's centre). `anchorVertex: "top"` marks anchors given at the tile's
// top vertex at ground level, Claude Design's convention (docs/17).
function toCentreAnchor(def, a) {
  if (!a) return a;
  return def.anchorVertex === "top" ? [a[0], a[1] + TILE_HH] : [a[0], a[1]];
}

// A sheet built from several PNGs (docs/17): `images` maps a frame name to a
// path; each distinct image is packed once, side by side, into one canvas, and
// every name pointing at it gets its rectangle. `frames` given too add to or
// override those. `anchors` gives an anchor per frame where frames differ.
async function sheetFromImages(def) {
  const paths = [...new Set(Object.values(def.images))];
  const imgs = await Promise.all(paths.map((p) => loadImage(p)));
  const at = new Map();
  let w = 0;
  let h = 0;
  imgs.forEach((img, i) => {
    at.set(paths[i], [w, 0, img.width, img.height]);
    w += img.width + 1;
    h = Math.max(h, img.height);
  });
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, w);
  canvas.height = Math.max(1, h);
  const ctx = canvas.getContext("2d");
  imgs.forEach((img, i) => ctx.drawImage(img, at.get(paths[i])[0], 0));
  const frames = {};
  for (const [name, path] of Object.entries(def.images)) frames[name] = [...at.get(path)];
  Object.assign(frames, def.frames || {});
  const frameAnchors = {};
  for (const [name, a] of Object.entries(def.anchors || {})) frameAnchors[name] = toCentreAnchor(def, a);
  const sheet = {
    image: canvas,
    frames,
    anchor: toCentreAnchor(def, def.anchor),
    frameAnchors,
    bounds: def.bounds,
    animations: def.animations || {},
    facings: def.facings || [],
    mirror: def.mirror || {},
  };
  // A drawn wall (docs/17): its height, thickness, colour, material, and the
  // names of its post and parts (leaves, shutters) sheets.
  if (def.wall) Object.assign(sheet, { wall: def.wall, wallHeight: def.wall.height, thickness: def.wall.thickness, color: def.wall.color });
  return sheet;
}

// ---- furniture (docs/17, step 4) ----

function canvasOf(img, mirror) {
  const c = document.createElement("canvas");
  c.width = img.width;
  c.height = img.height;
  const ctx = c.getContext("2d", { willReadFrequently: true }); // sliceOf reads it back (docs/23)
  if (mirror) {
    ctx.translate(img.width, 0);
    ctx.scale(-1, 1); // a mirror at load, not a display scale
  }
  ctx.drawImage(img, 0, 0);
  return c;
}

// One footprint tile's share of a two-tile drawing, cut along a vertical
// screen line (docs/17). The line stands at the boundary's top vertex, which is
// the second tile's centre on screen, moved a half wall's thickness (9 px, the
// thickest wall) toward the first tile: everything beyond it stands on the
// second tile however high it is drawn, and the first tile's slice stops short
// of the far wall behind the second, whose near face stands that far out. A cut
// along the ground line put the high parts of the second tile (a quilt, a
// chimney breast) in the first tile's slice, which sorts before that far wall,
// and the wall drew over them (Michael, 2026-10-11). `a` is the centre anchor
// of the first tile.
const SLICE_INSET = 9;
function sliceOf(canvas, a, alongY, i) {
  const w = canvas.width;
  const h = canvas.height;
  const out = document.createElement("canvas");
  out.width = w;
  out.height = h;
  const src = canvas.getContext("2d").getImageData(0, 0, w, h);
  const d = src.data;
  // Along y the second tile lies down-left (32 px left), along x down-right.
  const cut = alongY ? a[0] - 32 + SLICE_INSET : a[0] + 32 - SLICE_INSET;
  for (let v = 0; v < h; v++) {
    for (let u = 0; u < w; u++) {
      const second = alongY ? u < cut : u >= cut;
      if (second !== (i === 1)) d[(v * w + u) * 4 + 3] = 0;
    }
  }
  out.getContext("2d").putImageData(src, 0, 0);
  return out;
}

// A sheet of furniture from its drawings: each facing is a drawing or a mirror
// of one; a two-tile facing is sliced per tile, each slice with its own anchor
// (the drawing's anchor moved by its tile's offset); a fire's flame frames are
// placed on the tile that holds the firebox. Frames are `idle_<facing>_<i>` and
// `flame_<facing>_<k>`.
async function sheetFromDrawings(def) {
  const loaded = new Map();
  const imageOf = async (p) => {
    if (!loaded.has(p)) loaded.set(p, await loadImage(p));
    return loaded.get(p);
  };
  const pieces = [];
  const frameAnchors = {};
  const flames = {};
  const fireImgs = def.fire && def.fire.frames ? await Promise.all(def.fire.frames.map(imageOf)) : [];
  for (const facing of def.facings) {
    const d = def.drawings[facing];
    const base = d.from ? def.drawings[d.from] : d;
    const img = await imageOf(base.image);
    const canvas = canvasOf(img, !!d.mirror);
    let a = toCentreAnchor(def, base.anchor);
    if (d.mirror) a = [img.width - a[0], a[1]];
    const fp = (def.facingFootprint && def.facingFootprint[facing]) || [1, 1];
    const n = fp[0] * fp[1];
    const alongY = fp[1] === 2;
    const offset = (i) => (i === 0 ? [0, 0] : alongY ? [-32, 16] : [32, 16]);
    if (n === 1) {
      pieces.push([`idle_${facing}_0`, canvas]);
      frameAnchors[`idle_${facing}_0`] = a;
    } else {
      for (let i = 0; i < 2; i++) {
        pieces.push([`idle_${facing}_${i}`, sliceOf(canvas, a, alongY, i)]);
        const o = offset(i);
        frameAnchors[`idle_${facing}_${i}`] = [a[0] + o[0], a[1] + o[1]];
      }
    }
    if (fireImgs.length && def.fire.at) {
      let B = [def.fire.at[0], def.fire.at[1]];
      if (d.mirror) B = [img.width - B[0], B[1]];
      const cut = alongY ? a[0] - 32 + SLICE_INSET : a[0] + 32 - SLICE_INSET;
      const tile = n === 1 ? 0 : (alongY ? B[0] < cut : B[0] >= cut) ? 1 : 0;
      const o = offset(tile);
      const pin = def.fire.base || [9, 15];
      fireImgs.forEach((im, k) => {
        const name = `flame_${facing}_${k}`;
        pieces.push([name, canvasOf(im, false)]);
        frameAnchors[name] = [o[0] + a[0] - B[0] + pin[0], o[1] + a[1] - B[1] + pin[1]];
      });
      flames[facing] = { tile, count: fireImgs.length };
    }
  }
  // Pack the pieces side by side into one canvas.
  let w = 0;
  let h = 0;
  for (const [, c] of pieces) {
    w += c.width + 1;
    h = Math.max(h, c.height);
  }
  const image = document.createElement("canvas");
  image.width = Math.max(1, w);
  image.height = Math.max(1, h);
  const ctx = image.getContext("2d");
  const frames = {};
  let x = 0;
  for (const [name, c] of pieces) {
    ctx.drawImage(c, x, 0);
    frames[name] = [x, 0, c.width, c.height];
    x += c.width + 1;
  }
  return {
    image,
    frames,
    anchor: frameAnchors[`idle_${def.facings[0]}_0`],
    frameAnchors,
    facings: def.facings,
    facingFootprint: def.facingFootprint || null,
    mirror: {},
    animations: {},
    flames,
    flameFps: (def.fire && def.fire.fps) || 6,
  };
}

// The idle frame of a prop's sheet for footprint slice `i`, in the prop's
// facing when the sheet has facings (docs/17): `idle_<facing>_<i>`, else `idle_<i>`.
export function idleFrame(sheet, prop, i = 0, kind = "idle") {
  if (sheet.facings && sheet.facings.length) return `${kind}_${(prop && prop.facing) || sheet.facings[0]}_${i}`;
  return `${kind}_${i}`;
}

// Load every sheet a map file refers to: floors, walls, props, plus the characters.
export async function loadMapSprites(json) {
  const ids = new Map(); // id -> tileCount
  const want = (id, n = 1) => { if (id) ids.set(id, Math.max(n, ids.get(id) || 1)); };
  want(json.floor);
  const wantProp = (p) => want(p.sprite, (p.footprint?.[0] || 1) * (p.footprint?.[1] || 1));
  // A wall material: one id, or one per side (docs/30 step 0).
  const wantWall = (w) => { if (typeof w === "string") want(w); else if (w) for (const id of Object.values(w)) want(id); };
  const wantBuilding = (b) => {
    wantWall(b.wall);
    want(b.floor);
    for (const o of b.openings || []) want(o.wall);
    for (const part of b.partitions || []) want(part.wall);
    for (const p of b.props || []) wantProp(p);
  };
  const wantFence = (f) => want(f.wall || "wall_fence");
  for (const r of json.floorRects || []) want(r.sprite);
  for (const f of json.features || []) (f.kind === "fence" ? wantFence(f) : want(f.sprite));
  for (const p of json.props || []) wantProp(p);
  for (const b of json.buildings || []) wantBuilding(b);
  for (const s of json.sets || []) {
    for (const r of s.floorRects || []) want(r.sprite);
    for (const f of s.fences || []) wantFence(f);
    for (const p of s.props || []) wantProp(p);
    for (const b of s.buildings || []) wantBuilding(b);
  }
  for (const sc of json.scatter || []) for (const id in sc.kinds || {}) want(id, (sc.footprint?.[0] || 1) * (sc.footprint?.[1] || 1));
  for (const name in json.zones || {}) for (const id in json.zones[name].kinds || {}) want(id);
  for (const id in json.wild?.kinds || {}) want(id);
  for (const id in json.forage?.kinds || {}) want(id); // mushrooms near trees (docs/02, question 27)
  for (const id in json.wild?.rocks?.kinds || {}) want(id); // big rocks in the wild
  for (const k of Object.values(json.resources || {})) for (const id in k.sprites || {}) want(id); // the natural resources' nodes (docs/46)
  want("player");
  want("zombie");
  want("flame");
  await Promise.all([...ids].map(([id, n]) => loadSprite(id, { tileCount: n })));
}
