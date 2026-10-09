// Copied from cozy-zombie-game src/assets.js on 2026-10-09. loadNodeSprites replaced by loadMapSprites for the chunked map format.
// Sprite definitions and sheets. A sheet built from a real PNG + JSON and a
// generated placeholder sheet have the same shape. See docs/03 and docs/06.

import * as placeholders from "./placeholders.js";

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
    const image = await loadImage(def.image);
    sheet = {
      image,
      frames: def.frames,
      anchor: def.anchor,
      animations: def.animations || {},
      facings: def.facings || [],
      mirror: def.mirror || {},
    };
  } else if (def.placeholder) {
    const ph = def.placeholder;
    switch (ph.kind) {
      case "character": sheet = placeholders.generateCharacter(ph); break;
      case "box": sheet = placeholders.generateBox(ph, tileCount); break;
      case "post": sheet = placeholders.generatePost(ph); break;
      case "flat": sheet = placeholders.generateFlat(ph); break;
      case "wall": sheet = placeholders.generateWall(ph); break;
      case "pumpkin": sheet = placeholders.generatePumpkin(ph); break;
      default: throw new Error(`Unknown placeholder kind ${ph.kind} for ${id}`);
    }
  } else {
    throw new Error(`Sprite ${id} has neither image nor placeholder`);
  }
  sheet.id = id;
  sheets.set(key, sheet);
  return sheet;
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
  for (const r of json.floorRects || []) want(r.sprite);
  for (const p of json.props || []) want(p.sprite, (p.footprint?.[0] || 1) * (p.footprint?.[1] || 1));
  for (const b of json.buildings || []) {
    want(b.wall);
    want(b.floor);
    for (const p of b.props || []) want(p.sprite, (p.footprint?.[0] || 1) * (p.footprint?.[1] || 1));
  }
  for (const sc of json.scatter || []) for (const id in sc.kinds || {}) want(id, (sc.footprint?.[0] || 1) * (sc.footprint?.[1] || 1));
  want("player");
  want("zombie");
  await Promise.all([...ids].map(([id, n]) => loadSprite(id, { tileCount: n })));
}
