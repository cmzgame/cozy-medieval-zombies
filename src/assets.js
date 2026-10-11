// Copied from cozy-zombie-game src/assets.js on 2026-10-09. loadNodeSprites replaced by loadMapSprites for the chunked map format.
// Sprite definitions and sheets. A sheet built from a real PNG + JSON and a
// generated placeholder sheet have the same shape. See docs/03 and docs/06.

import * as placeholders from "./placeholders.js";
import * as figure from "./figure.js";

const defs = new Map();
const sheets = new Map();

export async function loadJson(path) {
  const res = await fetch(path);
  if (!res.ok) throw new Error(`Failed to load ${path}`);
  return res.json();
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Failed to load image ${src}`));
    img.src = src;
  });
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
  if (def.drawings) {
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
        // whenever their look or clothes change; the dead get ten outfits
        // registered under zombie_0 to zombie_9.
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
      case "flame": sheet = placeholders.generateFlame(); break;
      case "ground": sheet = placeholders.generateGround(ph); break; // docs/15: dirt, cobble
      case "noise": sheet = placeholders.generateNoise(ph); break; // docs/15: the edges' noise
      default: throw new Error(`Unknown placeholder kind ${ph.kind} for ${id}`);
    }
  } else {
    throw new Error(`Sprite ${id} has neither image nor placeholder`);
  }
  sheet.id = id;
  sheets.set(key, sheet);
  return sheet;
}

// A sheet made in code (held art, the dead's outfits), by id.
export function registerSheet(id, sheet) {
  sheet.id = id;
  sheets.set(id, sheet);
  return sheet;
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
  // `mirrored`: every image mirrored at load, a second sheet from the same art
  // (the farm's other furrow direction, docs/17).
  imgs.forEach((img, i) => ctx.drawImage(def.mirrored ? canvasOf(img, true) : img, at.get(paths[i])[0], 0));
  const frames = {};
  for (const [name, path] of Object.entries(def.images)) frames[name] = [...at.get(path)];
  Object.assign(frames, def.frames || {});
  const frameAnchors = {};
  for (const [name, a] of Object.entries(def.anchors || {})) frameAnchors[name] = toCentreAnchor(def, a);
  const sheet = {
    image: canvas,
    frames,
    anchor: mirroredAnchor(def, toCentreAnchor(def, def.anchor), imgs[0]),
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

function mirroredAnchor(def, a, img) {
  return def.mirrored && a && img ? [img.width - a[0], a[1]] : a;
}

// ---- furniture (docs/17, step 4) ----

function canvasOf(img, mirror) {
  const c = document.createElement("canvas");
  c.width = img.width;
  c.height = img.height;
  const ctx = c.getContext("2d");
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
  const wantBuilding = (b) => {
    want(b.wall);
    want(b.floor);
    for (const p of b.props || []) wantProp(p);
  };
  for (const r of json.floorRects || []) want(r.sprite);
  for (const f of json.features || []) want(f.sprite);
  for (const p of json.props || []) wantProp(p);
  for (const b of json.buildings || []) wantBuilding(b);
  for (const s of json.sets || []) {
    for (const r of s.floorRects || []) want(r.sprite);
    for (const p of s.props || []) wantProp(p);
    for (const b of s.buildings || []) wantBuilding(b);
  }
  for (const sc of json.scatter || []) for (const id in sc.kinds || {}) want(id, (sc.footprint?.[0] || 1) * (sc.footprint?.[1] || 1));
  for (const name in json.biomes || {}) for (const id in json.biomes[name].kinds || {}) want(id);
  for (const id in json.wild?.kinds || {}) want(id);
  for (const id in json.forage?.kinds || {}) want(id); // mushrooms near trees (docs/02, question 27)
  for (const id in json.wild?.rocks?.kinds || {}) want(id); // big rocks in the wild
  want("player");
  want("zombie");
  want("flame");
  await Promise.all([...ids].map(([id, n]) => loadSprite(id, { tileCount: n })));
}
