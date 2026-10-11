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
  if (def.image) {
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
