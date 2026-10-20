// Laid rugs, drawn (#327): flat on the ground, after the ground and before everything that stands, so a chair, a table, an item, a body, or a wall on a rug is drawn over it. Each tile's
// slice of the rug is a quad whose four corners carry their own ground points (the picture is a parallelogram on the ground plane, so the light and the fog are read across it as across
// the floor, not once for the tile), unlit-floor rules like the floor's: lit, and fogged where the floor is. No outline in the art (you walk on it); Object Highlight outlines the one under
// the cursor (render/highlight.js), drawn first so no slice's outline lands on the slice beside it.

import * as iso from "../iso.js";
import * as map from "../map.js";
import { getSheet, idleFrame } from "../assets.js";
import { frameQuad } from "./scene.js";
import * as hl from "./highlight.js";

// The ground point under a screen point.
function groundAt(sx, sy) {
  const g = iso.toGrid(sx, sy);
  return [g.gx, g.gy];
}

function slice(rug, tx, ty) {
  const i = rug.tiles.findIndex(([px, py]) => px === tx && py === ty);
  if (i < 0) return null;
  const sheet = getSheet(rug.sprite, rug.tiles.length);
  const name = idleFrame(sheet, rug, i);
  const f = sheet.frames[name];
  if (!f) return null;
  const p = iso.toScreen(tx, ty);
  const x = Math.round(p.x);
  const y = Math.round(p.y);
  const an = (sheet.frameAnchors && sheet.frameAnchors[name]) || sheet.anchor;
  const x0 = x - an[0];
  const y0 = y - an[1];
  const world = [groundAt(x0, y0), groundAt(x0 + f[2], y0), groundAt(x0 + f[2], y0 + f[3]), groundAt(x0, y0 + f[3])];
  return { sheet, name, x, y, world };
}

export function emitRugs(tiles) {
  const found = [];
  for (const [tx, ty] of tiles) {
    const rug = map.peekTile(tx, ty)?.rug;
    if (!rug) continue;
    const s = slice(rug, tx, ty);
    if (s) found.push({ rug, s });
  }
  for (const { rug, s } of found) if (hl.isProp(rug.id)) hl.outline(s.sheet, s.name, s.x, s.y, { world: s.world, heights: 0 });
  for (const { s } of found) frameQuad(s.sheet, s.name, s.x, s.y, { world: s.world, heights: 0 });
}
