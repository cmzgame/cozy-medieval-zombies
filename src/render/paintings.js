// Hung paintings, drawn (#326; src/paintings.js): a painting on a wall segment's camera-facing face is drawn right after its wall segment, as the boards and the leaves are, from the
// `decor_paintings` sheet (north and west drawn, never mirrored) at the wall's own anchor, lit along the segment's foot like the wall, and as translucent as the wall when it fades.
// A wide painting spans two segments: it is drawn with the second, so the wall it crosses into does not paint over its far half. The placement ghost and Object Highlight use the same quad.

import * as iso from "../iso.js";
import { getSheet } from "../assets.js";
import * as map from "../map.js";
import * as gl from "../gl.js";
import { frameOf, SHEET, nextAlong, paintingDef, spanOf } from "../paintings.js";
import * as hl from "./highlight.js";

// The foot of a segment's face, lit a little inside the tile it looks onto (as makeWall does): two grid points.
const footOf = (edge, tx, ty) => (edge === "n" ? [[tx - 0.4, ty - 0.2], [tx + 0.4, ty - 0.2]] : [[tx - 0.2, ty - 0.4], [tx - 0.2, ty + 0.4]]);

// One painting: the item on the holder segment (htx, hty), its picture reaching to the far end of `endTx, endTy`'s foot. `o` is { tint, flags } and `lit` outlines it first.
function emit(item, edge, htx, hty, endTx, endTy, o, lit = false) {
  const sheet = getSheet(SHEET);
  const name = frameOf(item, edge);
  const f = sheet && sheet.frames[name];
  if (!f) return;
  const a = (sheet.frameAnchors && sheet.frameAnchors[name]) || sheet.anchor;
  const p = iso.toScreen(htx, hty);
  const x = Math.round(p.x);
  const y = Math.round(p.y);
  const wa = footOf(edge, htx, hty)[0];
  const wb = footOf(edge, endTx, endTy)[1];
  const top = a[1] - iso.HH; // the frame's top above the ground at the tile's top vertex
  const heights = [top, top, top - f[3], top - f[3]];
  if (lit) hl.outline(sheet, name, x, y, { world: [wa, wb, wb, wa], heights });
  gl.quad(x - a[0], y - a[1], f[2], f[3], gl.frameUV(sheet, name), { world: [wa, wb, wb, wa], heights, color: o.tint, flags: o.flags });
}

// Every painting a wall segment finishes: a small or tall one on its holder, a wide one on the segment it covers (the second).
export function emitHangings(wall, edge, tx, ty, o) {
  for (const h of wall.hangings) {
    if (h.item && h.span !== 2) emit(h.item, edge, tx, ty, tx, ty, o, hl.isPainting(tx, ty, edge));
    else if (h.cover) {
      const [htx, hty] = h.cover;
      const hw = map.peekTile(htx, hty)?.[edge];
      const rec = hw && hw.hangings && hw.hangings.find((q) => q.item);
      if (rec) emit(rec.item, edge, htx, hty, tx, ty, o, hl.isPainting(htx, hty, edge));
    }
  }
}

// The placement ghost: the picture where it would hang, tinted, unlit, and unfogged (green where it may hang, red where not).
export function emitGhost(ghost, tint, flags) {
  if (ghost.none) return;
  const [ex, ey] = paintingsSpanEnd(ghost);
  emit(ghost.item, ghost.edge, ghost.tx, ghost.ty, ex, ey, { tint, flags });
}

function paintingsSpanEnd(g) {
  const def = paintingDef(g.item);
  return def && spanOf(def) === 2 ? nextAlong(g.tx, g.ty, g.edge) : [g.tx, g.ty];
}
