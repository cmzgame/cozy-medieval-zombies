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
import { OCCLUDER_MIN_HEIGHT, DEPTH_BIAS, DEPTH_ROOM, frameQuad } from "./scene.js";
import * as depth from "./depth.js"; // a slice's two front faces, or a canopy's billboard (docs/51)
import { WALL_T } from "../placeholders.js";
import { makeWall } from "./walls.js";
import * as rings from "./rings.js"; // a ring as the ghost, and a torch's ghost on one (docs/50)
import * as loop from "../loop.js"; // the sim clock: a poke's stamp is in sim milliseconds (docs/23a, C2)
import * as hl from "./highlight.js"; // Object Highlight (#301)
import * as paintingArt from "./paintings.js"; // a painting hung on a wall (#326)
import { resources as RES } from "../tuning.js"; // a rock's rise (docs/46)
import { riseOf, shudderOf } from "../resources.js"; // how far a rising rock is still below the ground, and its shudder (docs/46)
import * as bees from "./bees.js"; // bees round a hive by day (#441)

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
    if (t.type === "round") {
      rings.emitRingGhost(t.ring, tint, GHOST_FLAGS()); // a ring is taken apart whole (docs/50 section 5)
    } else if (t.type === "wall") {
      const shut = { ...t.wall, open: false, shutter: t.wall.kind === "window" ? "closed" : null };
      makeWall(shut, t.edge, t.tx, t.ty, true, false, tint).emit();
    } else {
      emitPropCells(getSheet(t.prop.sprite, t.prop.tiles.length), t.prop.tiles.map(([x, y], i) => [x, y, i]), ghost.ok, t.prop);
    }
    return;
  }
  if (ghost.kind === "round") {
    rings.emitRingGhost({ id: "ghost", x0: ghost.x0, y0: ghost.y0, n: ghost.n, layer: ghost.layer || 0, sprite: ghost.sprite }, tint, GHOST_FLAGS()); // a round room as it would stand (docs/50 section 5)
    return;
  }
  if (ghost.kind === "floor") {
    // A floor's drag (docs/49 section 5): each tile a diamond, green where it will be laid and red where not.
    for (const [tx, ty, why] of ghost.tiles) emitGhostTile(tx, ty, 0, why ? GHOST_BAD : GHOST_OK);
    return;
  }
  if (ghost.kind === "stair") {
    // A stair (docs/49 section 5): its three tiles, each a step higher, and its landing a storey up.
    ghost.tiles.forEach(([tx, ty], k) => emitGhostTile(tx, ty, (k + 1) * 32, tint));
    emitGhostTile(ghost.landing[0], ghost.landing[1], map.STOREY, tint);
    return;
  }
  if (ghost.kind === "wall") {
    // A wall, door, or window as it would stand, drawn by the real wall code.
    const wall = map.createWall(ghost.wallType || ghost.wallKind, ghost.sprite);
    if (ghost.leaf) wall.leaf = ghost.leaf; // a door or window of another wood (#334)
    makeWall(wall, ghost.edge, ghost.tx, ghost.ty, true, false, tint).emit();
    return;
  }
  if (ghost.kind === "painting") {
    paintingArt.emitGhost(ghost, tint, GHOST_FLAGS());
    return;
  }
  if (ghost.kind === "torch") {
    // A torch for a wall (Place torch, docs/43 section 4, #523): its wall drawn again, washed, with the bracket and the torch, lit or not, on
    // the face it would go on.
    const t = map.peekTile(ghost.tx, ghost.ty, ghost.layer || 0);
    const wall = t && t[ghost.edge];
    if (wall && !ghost.none && map.isRingWall(wall)) rings.emitTorchGhost(ghost.tx, ghost.ty, ghost.edge, !!(ghost.torch && ghost.torch.lit), tint, ghost.layer || 0); // on a ring: at its point on the curve (docs/50)
    else if (wall && !ghost.none) makeWall({ ...wall, bracket: { side: 1, torch: true, lit: !!(ghost.torch && ghost.torch.lit) } }, ghost.edge, ghost.tx, ghost.ty, true, false, tint).emit();
    return;
  }
  if (ghost.kind === "prop" || ghost.kind === "rug") {
    const [w, h] = ghost.footprint;
    const cells = [];
    for (let dy = 0; dy < h; dy++) for (let dx = 0; dx < w; dx++) cells.push([ghost.tx + dx, ghost.ty + dy, dy * w + dx]);
    emitPropCells(getSheet(ghost.prop.sprite, w * h), cells, ghost.ok, ghost.prop);
  }
}

// A tile's diamond `up` px over its ground, washed in `tint`, outlined: a floor's or a stair's ghost.
function emitGhostTile(tx, ty, up, tint) {
  const p = iso.toScreen(tx, ty);
  const x = Math.round(p.x);
  const y = Math.round(p.y) - up;
  const O = [[x, y - iso.HH], [x + iso.HW, y], [x, y + iso.HH], [x - iso.HW, y]];
  const flags = gl.FLAG_NOFOG | gl.FLAG_UNLIT;
  gl.poly(O, [tint[0], tint[1], tint[2], 0.45], { world: [tx, ty], flags });
  const k = 0.86;
  const I = O.map(([px, py]) => [Math.round(x + (px - x) * k), Math.round(y + (py - y) * k)]);
  for (let i = 0; i < 4; i++) gl.poly([O[i], O[(i + 1) % 4], I[(i + 1) % 4], I[i]], [tint[0], tint[1], tint[2], 0.9], { world: [tx, ty], flags });
}

// A clicked interactable sways: its base stays put and its top leans one way,
// then the other, dying away (Michael, 2026-10-11: "I recognize you clicked
// me", then "a bit less jittery"). Tall things lean further: a pixel and a half
// for a mushroom, up to five for a giant tree. Whole pixels at the top.
export const WIGGLE_MS = 560;
export function swayOf(prop, height) { // exported for tools/checks/sway.js
  if (prop.pokedAt == null) return 0; // a stamp at sim 0 is a stamp (a never-stepped world)
  // Sim milliseconds, the clock interact.pokeAt stamps with. Reading the wall
  // clock here (as it did until 2026-10-12) made every sway over before it began.
  const t = loop.simTime() * 1000 - prop.pokedAt;
  if (t >= WIGGLE_MS) return 0;
  const k = t / WIGGLE_MS;
  const reach = Math.max(1.5, Math.min(5, height / 40));
  return Math.round(Math.sin(k * Math.PI * 3) * reach * (1 - k));
}

// A rock or an ore rock rises out of the ground (docs/46 section 3; Michael: "they pop up out of the ground with an animation"): drawn whole,
// as if risen from below, cut at the ground line, never scaled. How far it is still below is resources.riseOf, from the sim-clock stamp
// the host put on it as it grew (`risenAt`, carried in its chunk to every guest). The slice of a rising prop: the top `height - sink` rows
// of its frame, at the frame's own width, `sink` pixels lower, so the part below the ground line is not drawn, and `shake` whole pixels to
// the side (its shudder, resources.shudderOf: Michael, 2026-10-25, "as if the ground had shifted and forced them to the surface"; the soil
// stays still, the rock jolts); and a little broken soil at its foot while it rises, with a puff of dust thrown up and out at the start that
// slows as it drifts (whole pixels, fading).
const SOIL = [[-15, 1], [-9, 3], [-3, 4], [4, 3], [10, 2], [16, 0]];
function risingSlice(sheet, name, f, x, y, tx, ty, flags, sink, k, shake = 0) {
  k = Math.max(0, k); // a guest's clock a little behind the stamp draws the start, never a fade past whole
  const an = (sheet.frameAnchors && sheet.frameAnchors[name]) || sheet.anchor;
  const uv = gl.frameUV(sheet, name);
  const h = f[3] - sink;
  if (uv && h > 0) gl.quad(x + shake - an[0], y - an[1] + sink, f[2], h, [uv[0], uv[1], uv[2], uv[3] - sink, uv[4]], { world: [tx, ty], heights: [h, h, 0, 0], flags });
  const fade = Math.max(0, 1 - k);
  const puff = 1 - fade * fade * fade; // fast at the start, slowing: one puff
  const soil = gl.rgb("#4a3a28", fade);
  const dust = gl.rgb("#9a8a6a", 0.7 * fade);
  gl.holdOrder(true); // the soil and the dust are one layer over the rock (docs/51: the emit order)
  for (const [dx, dy] of SOIL) {
    const sx = x + Math.round(dx * (0.6 + 0.4 * k));
    const sy = y + dy;
    gl.poly([[sx - 1, sy - 1], [sx + 1, sy - 1], [sx + 1, sy + 1], [sx - 1, sy + 1]], soil, { world: [tx, ty], flags: gl.FLAG_STANDING });
    const px = x + Math.round(dx * (0.6 + 0.6 * puff));
    const py = sy - 2 - Math.round(puff * 6);
    gl.poly([[px - 1, py - 1], [px + 1, py - 1], [px + 1, py + 1], [px - 1, py + 1]], dust, { world: [tx, ty], flags: gl.FLAG_STANDING });
  }
  gl.holdOrder(false);
}

// The frame of a playing click animation (the well's bucket), or null when it
// is not playing (interact.play starts it).
function clickFrame(prop) {
  if (prop.playedAt == null) return null;
  const anim = getDef(prop.sprite).clickAnim;
  if (!anim) return null;
  let t = loop.simTime() * 1000 - prop.playedAt; // sim milliseconds, as interact.play stamps it
  for (let k = 0; k < anim.frames.length; k++) {
    if (t < anim.ms[k]) return anim.frames[k];
    t -= anim.ms[k];
  }
  return null;
}

// The thickness of a wall on a tile's north or west edge, 0 where it has none.
function wallThick(w) {
  if (!w) return 0;
  try {
    return getSheet(w.sprite).thickness || WALL_T;
  } catch {
    return WALL_T;
  }
}

// A surface held off the walls on tile (tx, ty)'s north and west edges (render/depth.js againstWalls), each by its own thickness; a
// canopy's billboard is left as it is.
function backWalls(surf, tx, ty, canopy = false) {
  if (canopy) return surf;
  const t = map.tileAt(tx, ty);
  return depth.againstWalls(surf, tx, ty, wallThick(t && t.n), wallThick(t && t.w));
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
    const sink = f && prop.risenAt !== undefined ? riseOf(prop, f[3]) : 0; // a rock rising out of the ground (docs/46)
    const flameName = idleFrame(sheet, prop, frameIdx, "flame");
    const flame = !sheet.flames && !!(prop.fire && prop.fire.lit && sheet.frames[flameName] && vis);
    // Furniture's flames (the fireplace): on the slice that holds the firebox,
    // animated by time, unlit (docs/17).
    const fl = sheet.flames && sheet.flames[prop.facing];
    const furnFlame = fl && fl.tile === i && prop.fire && prop.fire.lit && vis
      ? `flame_${prop.facing}_${Math.floor((performance.now() / 1000) * sheet.flameFps + Math.abs(tx * 3 + ty * 7)) % fl.count}`
      : null;
    // A hive in sight has its bees by day (#441): the far ones before it, the near ones after.
    const swarm = f && vis && i === 0 && getDef(prop.sprite).hive ? bees.beesFor(prop, f, x, y, an) : null;
    // Its depth (docs/51 section 3): the slice's own footprint tile's two front faces, split at its front corner; a tree's or any canopy's
    // a billboard through that corner; a thing walked through (a crop, a mushroom, an herb) a billboard through its own ground point, its
    // tile's centre moved by its offset's screen rows (the review of f9d0fcc5: a forage mushroom stands off its centre). Its
    // flames, its bees, and its outline on the same surface.
    const walked = prop.solid === false;
    const canopy = !walked && !!getDef(prop.sprite).canopy;
    const surf = depth.propSlice(tx, ty, canopy, walked, off[1]);
    const held = backWalls(surf, tx, ty, canopy); // held off the walls on its tile's back edges, which it stands against
    const d = {
      key: (tx + ty) * 1000 + 1,
      kind: "prop",
      vis,
      rect,
      canOcclude: !!f && f[3] >= OCCLUDER_MIN_HEIGHT && !!getDef(prop.sprite).canopy,
      occluder: false,
      bees: swarm, // what `check("bees")` reads of the frame
      sheet, // and the sheet it draws from (`check("apples")`: a picked tree drawn bare)
      prop, // and the prop, by which check("depth") finds its drawable
      tile: [tx, ty],
      surf: held,
      emit() {
        gl.surface(held, DEPTH_BIAS.prop, DEPTH_ROOM.prop);
        const flags = gl.FLAG_STANDING | (d.occluder ? gl.FLAG_OCCLUDER : 0);
        if (swarm) bees.emit(swarm, true, [tx, ty]);
        if (sink > 0) risingSlice(sheet, name, f, x, y, tx, ty, flags, sink, (loop.simTime() - prop.risenAt) / RES.riseSeconds, shudderOf(prop));
        else propSlice(sheet, name, f, x, y, tx, ty, flags, undefined, f ? swayOf(prop, f[3]) : 0);
        if (swarm) bees.emit(swarm, false, [tx, ty]);
        if (flame) frameQuad(sheet, flameName, x, y, { world: [tx, ty], flags: gl.FLAG_UNLIT });
        if (furnFlame) frameQuad(sheet, furnFlame, x, y, { world: [tx, ty], flags: gl.FLAG_UNLIT });
      },
    };
    if (hl.isProp(prop.id) && !sink) lit.push({ d, sheet, name, f, x, y, tx, ty, prop, surf: held }); // a rising rock is outlined once it is up
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
    highlightOf: lit[0].prop, // check("depth") finds the outline's drawable
    // Every slice's copies on the farthest slice's depth surface, a step behind it (docs/51 section 3), as the sort drew the outline before
    // every slice: each slice's own surface is in front of the farthest one's in its columns, so no copy is drawn over a slice's own pixels
    // (the review of #530: on each slice's own surface the nearer slice's copies, a pixel into the farther slice's columns, beat its
    // pixels there, a light line down the seam of a bed, a table, the fireplace, the coop), and a slice in front of a wall keeps its whole
    // outline while one behind a wall loses the part the wall covers.
    emit() {
      const slices = this.outlined;
      if (!slices.length) return;
      let far = slices[0];
      for (const s of slices) if (s.tx + s.ty < far.tx + far.ty) far = s;
      gl.surface(far.surf, DEPTH_BIAS.prop, DEPTH_ROOM.prop);
      for (const s of slices) {
        hl.outline(s.sheet, s.name, s.x, s.y, { world: [s.tx, s.ty], heights: s.f ? [s.f[3], s.f[3], 0, 0] : 0 }, false, 0, s.f ? swayOf(s.prop, s.f[3]) : 0);
      }
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
    // Its depth (docs/51 section 3): each block or picture a billboard through its own front foot, a little over the ground, held off the
    // walls on the tile's back edges, so a figure standing on the pile's tile at its centre is drawn over the blocks behind its feet and
    // one behind the pile is covered by the blocks before it (the review of #530: on the tile's two front faces, whose corner is half a
    // tile before its centre, the pile covered a figure standing on it). Each block's layers start again on its own surface, so a pile of
    // any size climbs no further than one block (at 16 bits a dozen items climbed 12 units). What lies flat (a landed arrow, a thrown
    // knife) is drawn in the flat pass, in the pile's place.
    const t = map.tileAt(tx, ty);
    const Tn = wallThick(t && t.n);
    const Tw = wallThick(t && t.w);
    const footAt = (dy) => {
      gl.surface(depth.againstWalls(depth.billboardBelow(tx, ty, dy + y - p.y), tx, ty, Tn, Tw), DEPTH_BIAS.floorItem, DEPTH_ROOM.floorItem);
    };
    out.push({
      key: (tx + ty) * 1000 + 0.8,
      kind: "prop",
      vis,
      rect: { x: x - 16, y: y - 14, w: 32, h: 18 },
      canOcclude: false,
      occluder: false,
      tile: [tx, ty], // check("depth") finds its drawable
      items,
      emit() {
        items.forEach((e, i) => {
          const lit = hl.isItem(e.uid); // Object Highlight (#301)
          // An arrow that landed lies where it fell, pointing as it flew (docs/20); a thrown knife or axe too, as its own picture turned to
          // that angle (docs/24 section 1: its sheet named by its id, archery.lyingSheet).
          if (e.at && (e.id === "arrow" || e.id === "spear" || projectileSheet(e.id)?.frames[`${e.id}_${e.angle || 0}`])) {
            const sp = iso.toScreen(e.at[0], e.at[1]);
            const sheet = projectileSheet(e.id);
            gl.withPass(gl.PASS_FLAT, () => {
              if (sheet && lit) hl.outline(sheet, `${e.id}_${e.angle || 0}`, Math.round(sp.x), Math.round(sp.y) - 1, { world: [e.at[0], e.at[1]], heights: 0 });
              if (sheet) frameQuad(sheet, `${e.id}_${e.angle || 0}`, Math.round(sp.x), Math.round(sp.y) - 1, { world: [e.at[0], e.at[1]], heights: 0, flags: gl.FLAG_STANDING | (vis ? gl.FLAG_NOFOG : 0) });
            });
            return;
          }
          const def = getItem(e.id);
          const c = gl.rgb(def.color || "#8a8296");
          const ox = x + ((i % 3) - 1) * 9;
          const oy = y - 3 - Math.floor(i / 3) * 5;
          const flags = gl.FLAG_STANDING | (vis ? gl.FLAG_NOFOG : 0);
          // An item whose icon is generated from a design (an herb, a mushroom, salt; docs/46 step 2) lies as that picture, the pair's world
          // half; an item with drawn art as its own world picture, a long one flat (`floor_<id>`, main.js's held stage; the demo pass,
          // 2026-10-26); every other item keeps the block in its colour until it has drawn art.
          const pic = def.icon && def.icon.placeholder ? projectileSheet(`icon_${e.id}`) : projectileSheet(`floor_${e.id}`);
          if (pic) {
            // The picture's foot: its frame's bottom row, drawn by its anchor.
            const pf = pic.frames.idle_0;
            const pa = (pic.frameAnchors && pic.frameAnchors.idle_0) || pic.anchor;
            footAt(pf ? oy + 2 - pa[1] + pf[3] - y : oy + 2 - y);
            if (lit) hl.outline(pic, "idle_0", ox, oy + 2, { world: [tx, ty], heights: 0 });
            frameQuad(pic, "idle_0", ox, oy + 2, { world: [tx, ty], heights: 0, flags });
            return;
          }
          // A block: its foot the bottom of its front faces; the halo behind its dark rim, the rim, then its three faces in one layer
          // (they meet at their edges and never overlap).
          footAt(oy + 6 - y);
          if (lit) hl.itemHalo(ox, oy, [tx, ty]);
          gl.poly([[ox - 7, oy], [ox, oy - 4], [ox + 7, oy], [ox, oy + 4]], gl.rgb("#1a1410"), { world: [tx, ty], flags });
          gl.holdOrder(true);
          gl.poly([[ox - 6, oy], [ox, oy - 3], [ox + 6, oy], [ox, oy + 3]], c, { world: [tx, ty], flags });
          gl.poly([[ox - 6, oy], [ox, oy + 3], [ox, oy + 6], [ox - 6, oy + 3]], [c[0] * 0.6, c[1] * 0.6, c[2] * 0.6, 1], { world: [tx, ty], flags });
          gl.poly([[ox, oy + 3], [ox + 6, oy], [ox + 6, oy + 3], [ox, oy + 6]], [c[0] * 0.75, c[1] * 0.75, c[2] * 0.75, 1], { world: [tx, ty], flags });
          gl.holdOrder(false);
        });
      },
    });
  }
}
