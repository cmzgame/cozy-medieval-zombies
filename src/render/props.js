// Props and the floor (docs/13, 17): a prop's slices per tile, the placement ghost, the hit shapes, the sway of
// a poked thing, click animations, and the items lying on tiles.
// Cut from src/render.js on 2026-10-12 (docs/23a, D5): a move, no rule changed; the frame check proves the pixels.

import * as iso from "../iso.js";
import { getSheet, getDef, idleFrame } from "../assets.js";
import * as map from "../map.js";
import { tileKey } from "../visibility.js";
import { getItem } from "../items.js";
import * as gl from "../gl.js";
import { projectileSheet } from "./entities.js";
import { OCCLUDER_MIN_HEIGHT, frameQuad } from "./scene.js";
import { makeWall } from "./walls.js";
import * as loop from "../loop.js"; // the sim clock: a poke's stamp is in sim milliseconds (docs/23a, C2)
import * as hl from "./highlight.js"; // Object Highlight (#301)
import * as paintingArt from "./paintings.js"; // a painting hung on a wall (#326)

// ---- props and characters ----

// One slice of a prop's sheet at a tile; `color` tints it (the ghost's green or red).
function propSlice(sheet, name, f, x, y, tx, ty, flags, color, skew = 0) {
  const opts = { world: [tx, ty], heights: f ? [f[3], f[3], 0, 0] : 0, flags, skew };
  if (color) opts.color = color;
  frameQuad(sheet, name, x, y, opts);
}

// The placement ghost (docs/13): an overlay in green where the thing may go
// and red where it may not. It never joins the sort or occlusion lists.
const GHOST_OK = [0.6, 1, 0.6, 0.55];
const GHOST_BAD = [1, 0.5, 0.5, 0.55];
export const GHOST_FLAGS = () => gl.FLAG_NOFOG | gl.FLAG_UNLIT;

// A flat colour multiplied by the ghost's tint, as a fresh array (gl.rgb's are shared).
export function ghostColor(color, tint) {
  const c = gl.rgb(color, tint[3]);
  return [c[0] * tint[0], c[1] * tint[1], c[2] * tint[2], c[3]];
}

// A prop's slices as a ghost: `cells` are [tx, ty, frameIndex].
function emitPropCells(sheet, cells, ok, prop = null) {
  const tint = ok ? GHOST_OK : GHOST_BAD;
  const floor = gl.rgb(ok ? "#60ff60" : "#ff5050", 0.35);
  for (const [tx, ty, i] of cells) {
    const p = iso.toScreen(tx, ty);
    const x = Math.round(p.x);
    const y = Math.round(p.y);
    // A tinted diamond on the floor so the footprint reads even where the box is dark.
    gl.poly([[x, y - iso.HH], [x + iso.HW, y], [x, y + iso.HH], [x - iso.HW, y]], floor, { world: [tx, ty], flags: GHOST_FLAGS() });
    const name = idleFrame(sheet, prop, i);
    propSlice(sheet, name, sheet.frames[name], x, y, tx, ty, GHOST_FLAGS(), tint);
  }
}

// With Show hit shapes, the dead's body samples, green for those the next
// swing would hit (docs/14). The swing's wedge is no longer drawn (Michael,
// 2026-10-12: the Swing targets outline already shows what a swing reaches).
export function emitHitShapes(o) {
  const flags = gl.FLAG_NOFOG | gl.FLAG_UNLIT;
  for (const [x, y, hit] of o.dots) {
    const c = gl.rgb(hit ? "#60ff60" : "#a0a0a0", hit ? 0.95 : 0.6);
    gl.poly([[x - 1, y - 1], [x + 1, y - 1], [x + 1, y + 1], [x - 1, y + 1]], c, { world: o.world, flags });
  }
}

export function emitGhost(ghost) {
  const tint = ghost.ok ? GHOST_OK : GHOST_BAD;
  if (ghost.kind === "remove") {
    // What the removal tool would take, washed in green (red when out of reach).
    const t = ghost.target;
    if (t.type === "wall") {
      const shut = { ...t.wall, open: false, shutter: t.wall.kind === "window" ? "closed" : null };
      makeWall(shut, t.edge, t.tx, t.ty, true, false, tint).emit();
    } else {
      emitPropCells(getSheet(t.prop.sprite, t.prop.tiles.length), t.prop.tiles.map(([x, y], i) => [x, y, i]), ghost.ok, t.prop);
    }
    return;
  }
  if (ghost.kind === "wall") {
    // A wall, door, or window as it would stand, drawn by the real wall code.
    const wall = map.createWall(ghost.wallType || ghost.wallKind, ghost.sprite);
    makeWall(wall, ghost.edge, ghost.tx, ghost.ty, true, false, tint).emit();
    return;
  }
  if (ghost.kind === "painting") {
    paintingArt.emitGhost(ghost, tint, GHOST_FLAGS());
    return;
  }
  if (ghost.kind === "prop" || ghost.kind === "rug") {
    const [w, h] = ghost.footprint;
    const cells = [];
    for (let dy = 0; dy < h; dy++) for (let dx = 0; dx < w; dx++) cells.push([ghost.tx + dx, ghost.ty + dy, dy * w + dx]);
    emitPropCells(getSheet(ghost.prop.sprite, w * h), cells, ghost.ok, ghost.prop);
  }
}

// A clicked interactable sways: its base stays put and its top leans one way,
// then the other, dying away (Michael, 2026-10-11: "I recognize you clicked
// me", then "a bit less jittery"). Tall things lean further: a pixel and a half
// for a mushroom, up to five for a giant tree. Whole pixels at the top.
export const WIGGLE_MS = 560;
export function swayOf(prop, height) { // exported for tools/checks/sway.js
  if (!prop.pokedAt) return 0;
  // Sim milliseconds, the clock interact.pokeAt stamps with. Reading the wall
  // clock here (as it did until 2026-10-12) made every sway over before it began.
  const t = loop.simTime() * 1000 - prop.pokedAt;
  if (t >= WIGGLE_MS) return 0;
  const k = t / WIGGLE_MS;
  const reach = Math.max(1.5, Math.min(5, height / 40));
  return Math.round(Math.sin(k * Math.PI * 3) * reach * (1 - k));
}

// The frame of a playing click animation (the well's bucket), or null when it
// is not playing (interact.play starts it).
function clickFrame(prop) {
  if (!prop.playedAt) return null;
  const anim = getDef(prop.sprite).clickAnim;
  if (!anim) return null;
  let t = loop.simTime() * 1000 - prop.playedAt; // sim milliseconds, as interact.play stamps it
  for (let k = 0; k < anim.frames.length; k++) {
    if (t < anim.ms[k]) return anim.frames[k];
    t -= anim.ms[k];
  }
  return null;
}

export function propDrawables(tiles, visible, out) {
  const lit = []; // the slices of the prop under the cursor (Object Highlight, #301)
  for (const [tx, ty] of tiles) {
    const prop = map.tileAt(tx, ty).prop;
    if (!prop) continue;
    const i = prop.tiles.findIndex(([px, py]) => px === tx && py === ty);
    const sheet = getSheet(prop.sprite, prop.tiles.length);
    const anim = sheet.animations && sheet.animations.idle;
    const frameIdx = prop.tiles.length === 1 && anim && anim.fps > 0
      ? Math.floor((performance.now() / 1000) * anim.fps + Math.abs(tx * 7 + ty * 3)) % anim.frames
      : i;
    const name = clickFrame(prop) || idleFrame(sheet, prop, frameIdx);
    const f = sheet.frames[name];
    const p = iso.toScreen(tx, ty);
    const off = prop.offset || [0, 0];
    const x = Math.round(p.x) + off[0];
    const y = Math.round(p.y) + off[1];
    const an = (sheet.frameAnchors && sheet.frameAnchors[name]) || sheet.anchor;
    const rect = f
      ? sheet.bounds
        ? { x: x - an[0] + sheet.bounds.x, y: y - an[1] + sheet.bounds.y, w: sheet.bounds.w, h: sheet.bounds.h }
        : { x: x - an[0], y: y - an[1], w: f[2], h: f[3] }
      : null;
    const vis = visible.has(tileKey(tx, ty));
    const flameName = idleFrame(sheet, prop, frameIdx, "flame");
    const flame = !sheet.flames && !!(prop.fire && prop.fire.lit && sheet.frames[flameName] && vis);
    // Furniture's flames (the fireplace): on the slice that holds the firebox,
    // animated by time, unlit (docs/17).
    const fl = sheet.flames && sheet.flames[prop.facing];
    const furnFlame = fl && fl.tile === i && prop.fire && prop.fire.lit && vis
      ? `flame_${prop.facing}_${Math.floor((performance.now() / 1000) * sheet.flameFps + Math.abs(tx * 3 + ty * 7)) % fl.count}`
      : null;
    const d = {
      key: (tx + ty) * 1000 + 1,
      kind: "prop",
      vis,
      rect,
      canOcclude: !!f && f[3] >= OCCLUDER_MIN_HEIGHT && !!getDef(prop.sprite).canopy,
      occluder: false,
      emit() {
        const flags = gl.FLAG_STANDING | (d.occluder ? gl.FLAG_OCCLUDER : 0);
        propSlice(sheet, name, f, x, y, tx, ty, flags, undefined, f ? swayOf(prop, f[3]) : 0);
        if (flame) frameQuad(sheet, flameName, x, y, { world: [tx, ty], flags: gl.FLAG_UNLIT });
        if (furnFlame) frameQuad(sheet, furnFlame, x, y, { world: [tx, ty], flags: gl.FLAG_UNLIT });
      },
    };
    if (hl.isProp(prop.id)) lit.push({ d, sheet, name, f, x, y, tx, ty, prop });
    out.push(d);
  }
  if (lit.length) highlightProp(lit, out);
}

// Object Highlight (#301): one drawable for the whole prop, sorted just before its first slice, so a thing of several tiles is outlined as one shape and no slice's outline
// lands on the slice beside it. Each slice is drawn a pixel off in eight directions, flat, with its sway; a slice that is the see-through occluder this frame is skipped.
function highlightProp(lit, out) {
  const key = Math.min(...lit.map((s) => s.d.key)) - 0.5;
  out.push({
    key,
    kind: "prop",
    vis: lit.some((s) => s.d.vis),
    rect: null,
    canOcclude: false,
    occluder: false,
    // The slices that are outlined: not the one the player is seen through this frame (a tree's canopy with its hole in): eight stacked copies would show far more than the
    // faded tree and fill the hole. (A getter, so the check can read what the frame decided.)
    get outlined() {
      return lit.filter((s) => !s.d.occluder);
    },
    emit() {
      for (const s of this.outlined) hl.outline(s.sheet, s.name, s.x, s.y, { world: [s.tx, s.ty], heights: s.f ? [s.f[3], s.f[3], 0, 0] : 0 }, false, 0, s.f ? swayOf(s.prop, s.f[3]) : 0);
    },
  });
}

// Items on the floor: a small block in the item's colour per entry, fanned a
// little so a pile reads as a pile (docs/10).
export function floorItemDrawables(tiles, visible, out) {
  for (const [tx, ty] of tiles) {
    const items = map.tileAt(tx, ty).items;
    if (!items || !items.length) continue;
    const p = iso.toScreen(tx, ty);
    const x = Math.round(p.x);
    const y = Math.round(p.y);
    const vis = visible.has(tileKey(tx, ty));
    out.push({
      key: (tx + ty) * 1000 + 0.8,
      kind: "prop",
      vis,
      rect: { x: x - 16, y: y - 14, w: 32, h: 18 },
      canOcclude: false,
      occluder: false,
      emit() {
        items.forEach((e, i) => {
          const lit = hl.isItem(e.uid); // Object Highlight (#301)
          // An arrow that landed lies where it fell, pointing as it flew (docs/20).
          if ((e.id === "arrow" || e.id === "spear") && e.at) {
            const sp = iso.toScreen(e.at[0], e.at[1]);
            const sheet = projectileSheet(e.id);
            if (sheet && lit) hl.outline(sheet, `${e.id}_${e.angle || 0}`, Math.round(sp.x), Math.round(sp.y) - 1, { world: [e.at[0], e.at[1]], heights: 0 });
            if (sheet) frameQuad(sheet, `${e.id}_${e.angle || 0}`, Math.round(sp.x), Math.round(sp.y) - 1, { world: [e.at[0], e.at[1]], heights: 0, flags: gl.FLAG_STANDING | (vis ? gl.FLAG_NOFOG : 0) });
            return;
          }
          const c = gl.rgb(getItem(e.id).color || "#8a8296");
          const ox = x + ((i % 3) - 1) * 9;
          const oy = y - 3 - Math.floor(i / 3) * 5;
          const flags = gl.FLAG_STANDING | (vis ? gl.FLAG_NOFOG : 0);
          if (lit) hl.itemHalo(ox, oy, [tx, ty]);
          gl.poly([[ox - 7, oy], [ox, oy - 4], [ox + 7, oy], [ox, oy + 4]], gl.rgb("#1a1410"), { world: [tx, ty], flags });
          gl.poly([[ox - 6, oy], [ox, oy - 3], [ox + 6, oy], [ox, oy + 3]], c, { world: [tx, ty], flags });
          gl.poly([[ox - 6, oy], [ox, oy + 3], [ox, oy + 6], [ox - 6, oy + 3]], [c[0] * 0.6, c[1] * 0.6, c[2] * 0.6, 1], { world: [tx, ty], flags });
          gl.poly([[ox, oy + 3], [ox + 6, oy], [ox + 6, oy + 3], [ox, oy + 6]], [c[0] * 0.75, c[1] * 0.75, c[2] * 0.75, 1], { world: [tx, ty], flags });
        });
      },
    });
  }
}
