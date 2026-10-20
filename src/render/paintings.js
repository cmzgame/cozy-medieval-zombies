// Hung paintings, drawn (#326; src/paintings.js): a painting on a wall segment's camera-facing face is drawn right after its wall segment, as the boards and the leaves are, from the
// `decor_paintings` sheet (north and west drawn, never mirrored) at the wall's own anchor, lit along the segment's foot like the wall, and as translucent as the wall when it fades.
// A wide painting spans two segments, and each segment draws its own half, cut at the joint (the picture is one frame of the sheet, so each half is a column range of it, as
// `emitCutWall` splits a wall): drawn whole with the second segment, its first half would sort half a tile in front of its own wall and over furniture standing there. The placement ghost
// draws the whole picture at once, and Object Highlight outlines each half with its segment.

import * as iso from "../iso.js";
import { getSheet } from "../assets.js";
import * as map from "../map.js";
import * as gl from "../gl.js";
import { frameOf, SHEET } from "../paintings.js";
import * as hl from "./highlight.js";

const PROUD = 8.5; // the art hangs this far off the edge line toward the camera (the art README): the face plane the joint is cut on

// The foot of a segment's face, lit a little inside the tile it looks onto (as makeWall does): two grid points.
const footOf = (edge, tx, ty) => (edge === "n" ? [[tx - 0.4, ty - 0.2], [tx + 0.4, ty - 0.2]] : [[tx - 0.2, ty - 0.4], [tx - 0.2, ty + 0.4]]);

// A wide painting's frame, its width, and the column where the joint falls, in the frame's own pixels: a north wall's holder is the left of the cut and a west wall's the right
// (the picture runs away from the far vertex along the edge). Exported for `check("paintings")`.
export function splitOf(itemId, edge) {
  const sheet = getSheet(SHEET);
  const name = frameOf(itemId, edge);
  const f = sheet && sheet.frames[name];
  if (!f) return null;
  const a = (sheet.frameAnchors && sheet.frameAnchors[name]) || sheet.anchor;
  const s = edge === "n" ? a[0] + iso.HW - PROUD : a[0] - iso.HW + PROUD;
  return { width: f[2], at: Math.round(s) };
}

// One painting, or a column range of it: the item on the holder segment (htx, hty), the columns [from, to) of its frame, lit along the foot of the segment (segTx, segTy) the
// range belongs to. `lit` outlines it first. `o` is { tint, flags }.
function emit(item, edge, htx, hty, segTx, segTy, o, lit = false, range = null) {
  const sheet = getSheet(SHEET);
  const name = frameOf(item, edge);
  const f = sheet && sheet.frames[name];
  if (!f) return;
  const a = (sheet.frameAnchors && sheet.frameAnchors[name]) || sheet.anchor;
  const p = iso.toScreen(htx, hty);
  const from = range ? range[0] : 0;
  const to = range ? range[1] : f[2];
  const x = Math.round(p.x) - a[0] + from;
  const y = Math.round(p.y) - a[1];
  const [wa, wb] = footOf(edge, segTx, segTy);
  const top = a[1] - iso.HH; // the frame's top above the ground at the tile's top vertex
  const heights = [top, top, top - f[3], top - f[3]];
  const uv = gl.frameUV(sheet, name);
  const part = [uv[0] + from, uv[1], uv[0] + to, uv[3]];
  const world = [wa, wb, wb, wa];
  if (lit) hl.outlineRect(x, y, to - from, f[3], part, { world, heights });
  gl.quad(x, y, to - from, f[3], part, { world, heights, color: o.tint, flags: o.flags });
}

// The paintings a wall segment draws: a small or tall one in full on its holder, and a wide one's half on each of its two segments.
export function emitHangings(wall, edge, tx, ty, o) {
  for (const h of wall.hangings) {
    if (h.item) {
      if (h.span !== 2) emit(h.item, edge, tx, ty, tx, ty, o, hl.isPainting(tx, ty, edge));
      else {
        const s = splitOf(h.item, edge);
        if (s) emit(h.item, edge, tx, ty, tx, ty, o, hl.isPainting(tx, ty, edge), edge === "n" ? [0, s.at] : [s.at, s.width]);
      }
    } else if (h.cover) {
      const [htx, hty] = h.cover;
      const hw = map.peekTile(htx, hty)?.[edge];
      const rec = hw && hw.hangings && hw.hangings.find((q) => q.item);
      const s = rec && splitOf(rec.item, edge);
      if (s) emit(rec.item, edge, htx, hty, tx, ty, o, hl.isPainting(htx, hty, edge), edge === "n" ? [s.at, s.width] : [0, s.at]);
    }
  }
}

// The placement ghost: the whole picture where it would hang, tinted, unlit, and unfogged (green where it may hang, red where not).
export function emitGhost(ghost, tint, flags) {
  if (ghost.none) return;
  emit(ghost.item, ghost.edge, ghost.tx, ghost.ty, ghost.tx, ghost.ty, { tint, flags }); // unlit, so the foot it is lit along does not matter
}
