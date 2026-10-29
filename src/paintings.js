// Paintings (#326; docs/02, 2026-10-20, "Paintings and rugs are items: placed from the bag, picked up again"): a painting is an item (kind decor, `painting: "small" | "tall" | "wide"`)
// that Place hangs on the camera-facing face of a wall and Pick up takes down again. What hangs is state on the wall segment (`wall.hangings`, map.js), so it is saved and sent in the
// chunk's record like the wall itself: { item, slot, span } on the segment that holds the painting (its first, far, one for a wide painting), and { cover: [tx, ty], slot } on the
// segment along from it that a wide painting also covers. A small or wide painting takes the top slot of its segment(s), a tall one both slots of one. This module is the world's side
// of both, run on the authority (the host's own click and a guest's command meet the same rules): which segments take a painting, hanging one from the bag, taking one down, and the
// hit tests the ghost and the menu use. The ghost and R-less Place are placement.js's; the Pick up action is interact.js's, calling `takeDown`; the picture is render/paintings.js's.
//
// Builder's readings (docs/02): only a plain, solid wall takes a painting (not a door, a window, a fence, or bars: nothing to hang on); only its camera-facing face (the face the
// bracket's `side` +1 and the boards' `near` are on; the other face is behind the wall and no art is drawn for it), which is the inside of a building's north and west walls and the
// outside of its south and east walls; one painting to a segment; a wide one across a joint with no post (the same material and no wall meeting the joint); never at a corner (a wall meeting either end of the run on the camera's side hides much of it); and when its wall goes
// (taken down, or a door or a window built over it) the painting falls to the floor on the face's side, whole, as an item.

import * as map from "./map.js";
import * as inventory from "./inventory.js";
import * as grid from "./grid.js";
import * as iso from "./iso.js";
import { getSheet, getDef } from "./assets.js";
import { getItem, makeEntry } from "./items.js";
import { reachProblem, TOO_FAR } from "./reach.js";
import { showMessage } from "./ui/prompt.js";

export const REACH = 2.6; // tiles from the player to the nearest floor tile under the painting being hung or taken down
const WALL_FACE = 96; // the walls' height (docs/52), as interact.js's openings
const FACE_T = 16; // a drawn wall's thickness for the face's place on screen (the three materials are 14, 16 and 18; the face is half of it from the edge)

// The item definition if this id is a painting, else null.
export function paintingDef(itemId) {
  const d = typeof itemId === "string" ? getItem(itemId) : null;
  return d && d.painting ? d : null;
}

// How many segments along a painting covers (a wide one two), and the slot it takes.
export const spanOf = (def) => (def.painting === "wide" ? 2 : 1);
export const slotOf = (def) => (def.painting === "tall" ? "both" : "top");

// The frame of the sheet a painting is drawn from on this edge.
export const frameOf = (itemId, edge) => `${itemId}_${edge === "n" ? "north" : "west"}`;
export const SHEET = "decor_paintings";

// The segment along from (tx, ty): the next tx for a north wall, the next ty for a west wall (map.nextAlong).
export const nextAlong = map.nextAlong;
export const prevAlong = (tx, ty, edge) => (edge === "n" ? [tx - 1, ty] : [tx, ty - 1]);

// The floor tile a segment's camera face looks onto: its own tile, for both edges.
export const floorTile = (tx, ty) => [tx, ty];

const wallOf = (tx, ty, edge) => {
  const t = map.peekTile(tx, ty);
  return t ? t[edge] : null;
};

// Why this segment cannot take a painting (or part of one), or "": no plain wall, a fence, bars, a bracket on its face, or one already hung.
export function segmentProblem(tx, ty, edge) {
  const wall = wallOf(tx, ty, edge);
  if (!wall) return "No wall to hang it on";
  if (wall.kind !== "wall" || map.wallRule(wall.sprite).seeThrough || wall.broken) return "Nothing to hang it on";
  if (map.wallRule(wall.sprite).solid) return "Not on a cliff"; // bare rock (art round 10): no painting, no torch's bracket
  if (map.isRingWall(wall)) return "It would not hang flat on the curve"; // docs/50 section 3: paintings on a curved face are later
  if (!getDef(wall.sprite).wall) return "Nothing to hang it on"; // only a drawn wall has a face to hang on
  if (wall.bracket && wall.bracket.side > 0) return "A bracket is in the way";
  if (wall.hangings && wall.hangings.length) return "Something already hangs there";
  return "";
}

// Whether the joint between a segment and the one along from it is clear of a post: the same material, and no wall meeting it from the side.
function jointClear(tx, ty, edge) {
  const [nx, ny] = nextAlong(tx, ty, edge);
  const a = wallOf(tx, ty, edge);
  const b = wallOf(nx, ny, edge);
  if (!a || !b || a.sprite !== b.sprite) return false;
  // The joint is the top vertex of the tile (nx, ny): walls meeting it across the line are on the other edge of that tile and the one beside it.
  const cross = edge === "n" ? "w" : "n";
  const [cx, cy] = edge === "n" ? [nx, ny - 1] : [nx - 1, ny];
  return !wallOf(nx, ny, cross) && !wallOf(cx, cy, cross);
}

// Whether a wall meets the run's end on the camera's side: a north run's end at a west wall going down from the vertex, a west run's at a north wall going out from it. That wall's
// thickness and its drawn body stand in front of the painting's end and hide much of it (the art README warned of it), so a painting is not hung there.
function cornerAt(tx, ty, edge, atFar) {
  const cross = edge === "n" ? "w" : "n";
  const [sx, sy] = atFar ? [tx, ty] : nextAlong(tx, ty, edge);
  return !!wallOf(sx, sy, cross);
}

// Why a painting of this item cannot hang with its first segment at (tx, ty) on this edge, or "".
export function fitProblem(itemId, tx, ty, edge) {
  const def = paintingDef(itemId);
  if (!def) return "Not a painting";
  const first = segmentProblem(tx, ty, edge);
  if (first) return first;
  if (spanOf(def) === 2) {
    const [nx, ny] = nextAlong(tx, ty, edge);
    const second = segmentProblem(nx, ny, edge);
    if (second) return second === "No wall to hang it on" ? "Too wide for the wall" : second;
    if (!jointClear(tx, ty, edge)) return "A post is in the way";
  }
  const [lx, ly] = spanOf(def) === 2 ? nextAlong(tx, ty, edge) : [tx, ty];
  if (cornerAt(tx, ty, edge, true) || cornerAt(lx, ly, edge, false)) return "A corner is in the way";
  return "";
}

// The floor tiles under a painting hung at (tx, ty) on this edge (what the player stands near to hang or take it down).
export function tilesOf(itemId, tx, ty, edge) {
  const def = paintingDef(itemId);
  const out = [floorTile(tx, ty)];
  if (def && spanOf(def) === 2) {
    const [nx, ny] = nextAlong(tx, ty, edge);
    out.push(floorTile(nx, ny));
  }
  return out;
}

// Why the player cannot reach it from where they stand: too far, or a wall or a shut door in the line.
export function reachFor(player, itemId, tx, ty, edge) {
  const why = reachProblem(player, tilesOf(itemId, tx, ty, edge), REACH);
  return why === TOO_FAR ? "Too far" : why || "";
}

// The painting item with this uid in the player's bag (or null).
export function entryOf(player, uid) {
  const bag = inventory.bagOf(player);
  if (!bag || uid == null) return null;
  return bag.items.find((e) => e.uid === uid && paintingDef(e.id)) || null;
}

// Hang the painting item `uid` from the player's bag with its first segment at (tx, ty) on this edge: the host's, and a guest's command. Says why it cannot (to the acting player)
// and returns false; otherwise the item leaves the bag, the wall holds it, and true.
export function hang(player, uid, tx, ty, edge) {
  const entry = entryOf(player, uid);
  if (!entry) return false;
  const def = paintingDef(entry.id);
  tx = Math.round(Number(tx));
  ty = Math.round(Number(ty));
  if (!Number.isFinite(tx) || !Number.isFinite(ty) || (edge !== "n" && edge !== "w")) return false;
  const why = reachFor(player, entry.id, tx, ty, edge) || fitProblem(entry.id, tx, ty, edge);
  if (why) {
    showMessage(why);
    return false;
  }
  const bag = inventory.bagOf(player);
  grid.remove(bag, entry);
  const slot = slotOf(def);
  const span = spanOf(def);
  const wall = wallOf(tx, ty, edge);
  (wall.hangings || (wall.hangings = [])).push({ item: def.id, slot, span });
  map.touch(tx, ty);
  if (span === 2) {
    const [nx, ny] = nextAlong(tx, ty, edge);
    const w2 = wallOf(nx, ny, edge);
    (w2.hangings || (w2.hangings = [])).push({ cover: [tx, ty], slot });
    map.touch(nx, ny);
  }
  return true;
}

// The painting a segment is part of: { tx, ty, edge, rec } of the segment that holds it (a cover points back to it), or null.
export function holderOf(tx, ty, edge) {
  const wall = wallOf(tx, ty, edge);
  if (!wall || !wall.hangings) return null;
  for (const h of wall.hangings) {
    if (h.item) return { tx, ty, edge, rec: h };
    if (h.cover) {
      const [htx, hty] = h.cover;
      const hw = wallOf(htx, hty, edge);
      const rec = hw && hw.hangings && hw.hangings.find((q) => q.item);
      if (rec) return { tx: htx, ty: hty, edge, rec };
    }
  }
  return null;
}

// Take the painting off the wall (any segment it covers names it) into the player's bag, or at their feet if the bag is full; true when it came down.
export function takeDown(player, tx, ty, edge) {
  const held = holderOf(tx, ty, edge);
  if (!held) return false; // already taken down: a walk to it (a guest's command, or a far click) that meets someone else's take-down gets nothing, never a second painting
  const { tx: htx, ty: hty, rec } = held;
  const why = reachFor(player, rec.item, htx, hty, edge);
  if (why) {
    showMessage(why);
    return false;
  }
  const item = map.removeHanging(htx, hty, edge, rec);
  if (!item) return false;
  const bag = inventory.bagOf(player);
  const entry = makeEntry(item, 1);
  if (!bag || !grid.insert(bag, entry)) {
    map.dropItem(Math.round(player.gx), Math.round(player.gy), entry, player.layer || 0);
    showMessage("Your bag is full: the painting is at your feet.");
  }
  return true;
}

// ---- hit tests (client-side geometry; the host rebuilds an action from an address, never from a pixel) ----

// The camera face of a segment as a screen parallelogram [bottom-left, bottom-right, top-right, top-left], or null for no wall.
function faceQuad(tx, ty, edge) {
  const p = iso.toScreen(tx, ty);
  const x = Math.round(p.x) + (edge === "n" ? -FACE_T / 2 : FACE_T / 2);
  const y = Math.round(p.y) + FACE_T / 4;
  const a = edge === "n" ? [x, y - iso.HH] : [x - iso.HW, y];
  const b = edge === "n" ? [x + iso.HW, y] : [x, y - iso.HH];
  return [a, b, [b[0], b[1] - WALL_FACE], [a[0], a[1] - WALL_FACE]];
}

function inQuad(px, py, q) {
  let inside = false;
  for (let i = 0, j = q.length - 1; i < q.length; j = i++) {
    const [xi, yi] = q[i];
    const [xj, yj] = q[j];
    if (yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

// The wall segments whose camera face is under a canvas point, nearest the camera first: [{ tx, ty, edge }]. Reads the map and never grows it.
export function facesAt(sx, sy) {
  const g = iso.toGrid(sx, sy);
  const cx = Math.floor(g.gx);
  const cy = Math.floor(g.gy);
  const out = [];
  for (let ty = cy - 1; ty <= cy + 4; ty++) {
    for (let tx = cx - 1; tx <= cx + 4; tx++) {
      for (const edge of ["n", "w"]) {
        if (!wallOf(tx, ty, edge)) continue;
        if (inQuad(sx, sy, faceQuad(tx, ty, edge))) out.push({ tx, ty, edge });
      }
    }
  }
  out.sort((a, b) => b.tx + b.ty - (a.tx + a.ty));
  return out;
}

// The rectangle a hung painting is drawn in, on screen: the sprite frame at the holder segment's anchor.
export function rectOf(itemId, tx, ty, edge) {
  const sheet = getSheet(SHEET);
  const name = frameOf(itemId, edge);
  const f = sheet && sheet.frames[name];
  if (!f) return null;
  const a = (sheet.frameAnchors && sheet.frameAnchors[name]) || sheet.anchor;
  const p = iso.toScreen(tx, ty);
  return { x: Math.round(p.x) - a[0], y: Math.round(p.y) - a[1], w: f[2], h: f[3] };
}

// The hung painting under a canvas point, or null: { tx, ty, edge, rec } of its holder segment.
export function paintingAt(sx, sy) {
  const g = iso.toGrid(sx, sy);
  const cx = Math.floor(g.gx);
  const cy = Math.floor(g.gy);
  let best = null;
  for (let ty = cy - 1; ty <= cy + 4; ty++) {
    for (let tx = cx - 1; tx <= cx + 4; tx++) {
      for (const edge of ["n", "w"]) {
        const wall = wallOf(tx, ty, edge);
        const rec = wall && wall.hangings && wall.hangings.find((q) => q.item);
        if (!rec) continue;
        const r = rectOf(rec.item, tx, ty, edge);
        if (r && sx >= r.x && sx < r.x + r.w && sy >= r.y && sy < r.y + r.h && (!best || tx + ty > best.tx + best.ty)) best = { tx, ty, edge, rec };
      }
    }
  }
  return best;
}

// Where the cursor would hang a painting: { tx, ty, edge } of its first segment, the frontmost face under the cursor that fits and that `player` can reach (a translucent near wall
// is no bar to aiming at the wall behind it), the segment under the cursor as the first and the one before it as the fallback (so a wide painting can be aimed at either of its
// two sections); or the frontmost candidate with its reason when none does: { tx, ty, edge, problem }.
export function targetAt(itemId, sx, sy, player = null) {
  const def = paintingDef(itemId);
  const faces = facesAt(sx, sy);
  let first = null;
  for (const f of faces) {
    const cands = [{ tx: f.tx, ty: f.ty, edge: f.edge }];
    if (def && spanOf(def) === 2) {
      const [px, py] = prevAlong(f.tx, f.ty, f.edge);
      cands.push({ tx: px, ty: py, edge: f.edge });
    }
    for (const c of cands) {
      const problem = fitProblem(itemId, c.tx, c.ty, c.edge) || (player ? reachFor(player, itemId, c.tx, c.ty, c.edge) : "");
      if (!problem) return { ...c, problem: "" };
      if (!first) first = { ...c, problem };
    }
  }
  return first;
}
