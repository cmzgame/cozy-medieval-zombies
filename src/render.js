// Draw passes for the continuous map: cached chunk floors, sorted walls, props
// and characters, occlusion, then the fog of what you cannot see. The parts
// that survive from cozy-zombie-game src/render.js (sort key, occlusion fade and
// silhouettes, wall frame anchoring) are noted inline. See docs/03-world-model.md.

import * as iso from "./iso.js";
import { getSheet } from "./assets.js";
import { drawFrame, drawCharacter, resolveFacing, frameName, frameRect } from "./sprites.js";
// (drawCharacter is used by entity drawables; the silhouette pass is gone.)
import { poly, shade } from "./render-util.js";
import * as map from "./map.js";
import * as light from "./light.js";
import { tileKey } from "./visibility.js";
import { WALL_T, NEAR_STUB, drawPlankLeaf, drawBracket, drawTorchFlame, torchHandPoint, drawHandTorch } from "./placeholders.js";
import { heldFire } from "./items.js";

// Flame frames flicker on a shared clock, 0..2.
function flameFrame(seed = 0) {
  return Math.floor(performance.now() / 180 + seed) % 3;
}

// The night layer (docs/07-lighting.md): a tint erased where there is light,
// composited with multiply. Tunables Michael picks by eye; live on
// window.__game.render.night.
export const night = {
  tint: "36, 22, 56", // dusky purple, not the parent's blue
  alpha: 0.96,
  pool: 190, // px: the player's own weak night vision
  poolStrength: 0.42,
};

// What you cannot see is shaded but drawn: the world is there, you just are not
// looking at it. Michael (2026-10-09): shade it clearly, never so dark that it
// distracts from what is actually there. The first level, 0.74, was near black.
// Dusky purple rather than blue-black, for the palette in docs/06-art.md.
const FOG = "rgba(22, 14, 32, 0.36)"; // 0.46 was still a smidge dark (Michael, 2026-10-09)

// How a room's near walls draw while you are inside it. "translucent": the same
// full-height wall the outside sees, faded so the room stays readable, which
// keeps windows and doors identical inside and out (Michael, 2026-10-09: the
// stub's sunken frames were a leftover from faked near edges). "stub": the cozy
// parent's low cutaway, kept for comparison on the C key.
export let cutaway = "translucent";
const NEAR_WALL_ALPHA = 0.42;

export function setCutaway(mode) {
  cutaway = mode;
}

// Occlusion. The cozy parent faded a tall prop to 40 percent and drew a
// silhouette. With big overlapping canopies that stacks into mud (Michael,
// 2026-10-09), so instead a soft hole is cut through every occluding prop
// around each character behind it, Zomboid style. Five canopies over your
// head read the same as one.
const OCCLUDER_MIN_HEIGHT = 64;
const HOLE_INNER = 34; // px, fully clear
const HOLE_OUTER = 78; // px, fade to solid

// ---- floor, cached per chunk ----

const CHUNK_PX_W = map.CHUNK * iso.TW;
const CHUNK_PX_H = map.CHUNK * iso.TH;

function chunkFloor(c) {
  if (c.floorCache && !c.floorDirty) return c.floorCache;
  if (!c.floorCache) {
    c.floorCache = document.createElement("canvas");
    c.floorCache.width = CHUNK_PX_W;
    c.floorCache.height = CHUNK_PX_H;
  }
  const g = c.floorCache.getContext("2d");
  g.imageSmoothingEnabled = false;
  g.clearRect(0, 0, CHUNK_PX_W, CHUNK_PX_H);
  for (let ly = 0; ly < map.CHUNK; ly++) {
    for (let lx = 0; lx < map.CHUNK; lx++) {
      const t = c.tiles[ly * map.CHUNK + lx];
      const sheet = getSheet(t.floor);
      const x = (lx - ly) * iso.HW + CHUNK_PX_W / 2;
      const y = (lx + ly) * iso.HH + iso.HH;
      const alt = (lx + ly + c.cx * map.CHUNK + c.cy * map.CHUNK) % 2 === 0 ? 0 : 1;
      drawFrame(g, sheet, `idle_${alt}`, x, y);
    }
  }
  c.floorDirty = false;
  return c.floorCache;
}

function drawFloor(ctx, tiles, w, h) {
  const seen = new Set();
  for (const [tx, ty] of tiles) {
    const [cx, cy] = map.chunkCoord(tx, ty);
    const k = map.chunkKey(cx, cy);
    if (seen.has(k)) continue;
    seen.add(k);
    const c = map.getChunk(cx, cy);
    const p = iso.toScreen(cx * map.CHUNK, cy * map.CHUNK);
    const x = Math.round(p.x) - CHUNK_PX_W / 2;
    const y = Math.round(p.y) - iso.HH;
    if (x > w || y > h || x + CHUNK_PX_W < 0 || y + CHUNK_PX_H < 0) continue;
    ctx.drawImage(chunkFloor(c), x, y);
  }
}

// ---- walls ----

function wallVariant(wall) {
  if (wall.kind === "door") return wall.open ? "door" : "door_shut";
  if (wall.kind === "window") return wall.shutter === "closed" ? "window_shut" : "window";
  return "plain";
}

// Open shutters and doors swing out on the outside of the wall, perpendicular
// to it, at the jambs (Michael, 2026-10-09: "history be damned"). The outward
// direction on screen is the grid axis the wall does not run along, signed by
// which side is outdoors.
function drawSwungLeaves(ctx, wall, edge, x, y, h, outside) {
  // Base line of the wall segment on screen, parametrised 0..1.
  const a = edge === "n" ? [x, y - iso.HH] : [x - iso.HW, y];
  const b = edge === "n" ? [x + iso.HW, y] : [x, y - iso.HH];
  const lerp = (t, up) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t - up];
  // Perpendicular grid axis, in screen pixels per tile.
  const perp = edge === "n" ? [-iso.HW, iso.HH] : [iso.HW, iso.HH];
  const isDoor = wall.kind === "door";
  const len = isDoor ? 0.55 : 0.32; // tiles the leaf swings out
  const v = [perp[0] * len * outside, perp[1] * len * outside];
  const y0 = isDoor ? 0 : h * 0.35;
  const y1 = isDoor ? h * 0.82 : h * 0.8;
  const jambs = isDoor ? [0.18] : [0.25, 0.75];
  for (const t of jambs) {
    const p0 = lerp(t, y0);
    const p1 = lerp(t, y1);
    // A leaf facing the viewer on the near side is lit; on the far side it sits
    // behind the wall and only its top edge shows.
    drawPlankLeaf(ctx, [p0, p1, [p1[0] + v[0], p1[1] + v[1]], [p0[0] + v[0], p0[1] + v[1]]], isDoor ? 2 : 1, outside > 0 ? 0.95 : 0.7);
  }
}

// Is the wall on this edge a near wall of the player's room: the room lies on
// its far (north or west) side and not on its near side.
function isNearWall(tx, ty, edge, playerRoom) {
  if (playerRoom <= 0) return false;
  const t = map.tileAt(tx, ty);
  const far = edge === "n" ? map.tileAt(tx, ty - 1) : map.tileAt(tx - 1, ty);
  return far.room === playerRoom && t.room !== playerRoom;
}

// Corner posts. Four edges meet at the top vertex of tile (tx, ty): this
// tile's north and west walls, the north wall of the tile to the west, and
// the west wall of the tile to the north. Two walls in a straight line need
// nothing; any other arrangement that includes a wall gets a post, which fills
// the notch the wall thickness leaves at a corner or a run's end (Michael,
// 2026-10-09). Stone wins over wood where they meet.
function postDrawables(tiles, visible, playerRoom, out) {
  for (const [tx, ty] of tiles) {
    const nE = map.tileAt(tx, ty).n;
    const nW = map.tileAt(tx - 1, ty).n;
    const wS = map.tileAt(tx, ty).w;
    const wN = map.tileAt(tx, ty - 1).w;
    if (!nE && !nW && !wS && !wN) continue;
    if (nE && nW && !wS && !wN) continue;
    if (wS && wN && !nE && !nW) continue;
    const walls = [nE, nW, wS, wN].filter(Boolean);
    let sheet = getSheet(walls[0].sprite);
    for (const w of walls) {
      const s = getSheet(w.sprite);
      if (s.pattern === "brick" && sheet.pattern !== "brick") sheet = s;
    }
    const vis = visible.has(tileKey(tx, ty)) || visible.has(tileKey(tx - 1, ty)) || visible.has(tileKey(tx, ty - 1)) || visible.has(tileKey(tx - 1, ty - 1));
    const near = (nE && isNearWall(tx, ty, "n", playerRoom)) || (nW && isNearWall(tx - 1, ty, "n", playerRoom))
      || (wS && isNearWall(tx, ty, "w", playerRoom)) || (wN && isNearWall(tx, ty - 1, "w", playerRoom));
    out.push(makePost(tx, ty, sheet, vis, !!near));
  }
}

function makePost(tx, ty, sheet, vis, near) {
  const p = iso.toScreen(tx - 0.5, ty - 0.5);
  const x = Math.round(p.x);
  const y = Math.round(p.y);
  const h = sheet.wallHeight || 72;
  const T = WALL_T;
  const color = sheet.color || "#888";
  // Base diamond of the post, then the same lifted by h.
  const A = [x, y];
  const B = [x + T, y - T / 2];
  const C = [x, y - T];
  const D = [x - T, y - T / 2];
  const up = ([px, py]) => [px, py - h];
  const faded = near && cutaway !== "stub";
  const hidden = near && cutaway === "stub";
  const rooms = [map.tileAt(tx, ty).room, map.tileAt(tx - 1, ty).room, map.tileAt(tx, ty - 1).room, map.tileAt(tx - 1, ty - 1).room];
  // Faces and the top, kept apart for the night layer: a face takes the light
  // of the tile it looks onto, the top always the sky. The post stands at the
  // top vertex of (tx, ty); its left face continues the north-wall line and
  // looks onto (tx - 1, ty), its right face continues the west-wall line and
  // looks onto (tx, ty - 1).
  const facePoly = hidden ? null : [D, A, B, up(B), up(A), up(D)];
  const faces = hidden ? null : [
    { poly: [D, A, up(A), up(D)], tile: [tx - 1, ty] },
    { poly: [A, B, up(B), up(A)], tile: [tx, ty - 1] },
  ];
  const topPoly = hidden ? null : [up(A), up(B), up(C), up(D)];
  const fullPoly = hidden ? null : [D, A, B, up(B), up(C), up(D)];
  return {
    key: (tx + ty - 1) * 1000 + 0.5,
    kind: "wall",
    vis,
    rooms,
    near: faded,
    // The tiles the visible faces of the post look onto, for the night layer.
    faces,
    facePoly,
    topPoly,
    fullPoly,
    fogPoly: vis ? fullPoly : null,
    draw(ctx) {
      if (hidden) return;
      if (faded) ctx.globalAlpha = NEAR_WALL_ALPHA;
      ctx.fillStyle = shade(color, 0.5);
      poly(ctx, [D, A, up(A), up(D)]);
      ctx.fill();
      ctx.fillStyle = shade(color, 0.62);
      poly(ctx, [A, B, up(B), up(A)]);
      ctx.fill();
      ctx.fillStyle = shade(color, 1.18);
      poly(ctx, [up(A), up(B), up(C), up(D)]);
      ctx.fill();
      if (faded) ctx.globalAlpha = 1;
    },
  };
}

// A wall on the north edge of (tx, ty) runs from that tile's top vertex to its
// right vertex; the parent's north frame is anchored for exactly that. When the
// player is in the room on the far side of a wall, it is one of that room's near
// walls and draws as a low stub (the parent's south/east near frames, which are
// anchored on the tile north or west of the edge).
function wallDrawables(tiles, visible, playerRoom, out) {
  for (const [tx, ty] of tiles) {
    const t = map.tileAt(tx, ty);
    if (t.n) {
      const far = map.tileAt(tx, ty - 1);
      const vis = visible.has(tileKey(tx, ty)) || visible.has(tileKey(tx, ty - 1));
      const stub = playerRoom > 0 && far.room === playerRoom && t.room !== playerRoom;
      out.push(makeWall(t.n, "n", tx, ty, vis, stub));
    }
    if (t.w) {
      const far = map.tileAt(tx - 1, ty);
      const vis = visible.has(tileKey(tx, ty)) || visible.has(tileKey(tx - 1, ty));
      const stub = playerRoom > 0 && far.room === playerRoom && t.room !== playerRoom;
      out.push(makeWall(t.w, "w", tx, ty, vis, stub));
    }
  }
}

function makeWall(wall, edge, tx, ty, vis, stub) {
  const sheet = getSheet(wall.sprite);
  const variant = wallVariant(wall);
  const depth = edge === "n" ? tx + ty - 0.5 : tx - 0.5 + ty;
  const p = iso.toScreen(tx, ty);
  const x = Math.round(p.x);
  const y = Math.round(p.y);
  const h = sheet.wallHeight || 72;
  const T = WALL_T;
  const lowStub = stub && cutaway === "stub";
  const faded = stub && !lowStub;
  // The face you see, the top strip of the wall's thickness, and both together
  // (for the fog and the flame stencil). The night layer lights the face by
  // the tile it looks onto and the top by the sky (Michael, 2026-10-09).
  let facePoly;
  let topPoly = null;
  let fullPoly;
  if (!lowStub) {
    if (edge === "n") {
      facePoly = [[x, y - iso.HH], [x + iso.HW, y], [x + iso.HW, y - h], [x, y - iso.HH - h]];
      topPoly = [[x, y - iso.HH - h], [x + iso.HW, y - h], [x + iso.HW + T, y - T / 2 - h], [x + T, y - iso.HH - T / 2 - h]];
      fullPoly = [[x, y - iso.HH], [x + iso.HW, y], [x + iso.HW + T, y - T / 2], [x + iso.HW + T, y - T / 2 - h], [x + T, y - iso.HH - T / 2 - h], [x, y - iso.HH - h]];
    } else {
      facePoly = [[x - iso.HW, y], [x, y - iso.HH], [x, y - iso.HH - h], [x - iso.HW, y - h]];
      topPoly = [[x - iso.HW, y - h], [x, y - iso.HH - h], [x - T, y - iso.HH - h - T / 2], [x - iso.HW - T, y - h - T / 2]];
      fullPoly = [[x - iso.HW, y], [x, y - iso.HH], [x, y - iso.HH - h], [x - T, y - iso.HH - h - T / 2], [x - iso.HW - T, y - h - T / 2], [x - iso.HW - T, y - T / 2]];
    }
  } else {
    facePoly = edge === "n"
      ? [[x, y - iso.HH], [x + iso.HW, y], [x + iso.HW, y - NEAR_STUB], [x, y - iso.HH - NEAR_STUB]]
      : [[x - iso.HW, y], [x, y - iso.HH], [x, y - iso.HH - NEAR_STUB], [x - iso.HW, y - NEAR_STUB]];
    fullPoly = facePoly;
  }
  const rooms = [map.tileAt(tx, ty).room, edge === "n" ? map.tileAt(tx, ty - 1).room : map.tileAt(tx - 1, ty).room];
  // A bracket on the visible face (the near side of the edge) is drawn on the
  // wall with its torch's flame, which erases itself from the night layer in
  // its turn. One on the far face is hidden by the wall and only its light
  // shows.
  const br = wall.bracket && wall.bracket.side > 0 && !lowStub ? wall.bracket : null;
  let bx = 0;
  let by = 0;
  if (br) {
    const a = edge === "n" ? [x, y - iso.HH] : [x - iso.HW, y];
    const b = edge === "n" ? [x + iso.HW, y] : [x, y - iso.HH];
    bx = Math.round((a[0] + b[0]) / 2);
    by = Math.round((a[1] + b[1]) / 2 - h * 0.5);
  }
  const flame = br && br.torch && vis ? { rect: { x: bx - 16, y: by - 34, w: 32, h: 30 } } : null;
  return {
    key: depth * 1000,
    kind: "wall",
    vis,
    rooms,
    near: faded,
    flame,
    drawFlame(ctx) {
      drawTorchFlame(ctx, bx + 0.5, by - 15, flameFrame(tx + ty));
    },
    // The camera looks from the south-east, so the face you see of a north
    // wall is its south face and of a west wall its east face: both look onto
    // the tile the edge belongs to. The night layer lights the face by that tile.
    faces: [{ poly: facePoly, tile: [tx, ty] }],
    facePoly,
    topPoly,
    fullPoly,
    fogPoly: vis ? fullPoly : null,
    draw(ctx) {
      if (lowStub) {
        if (edge === "n") {
          const q = iso.toScreen(tx, ty - 1);
          drawFrame(ctx, sheet, `south_${variant}_0`, Math.round(q.x), Math.round(q.y), false, sheet.anchorSouth);
        } else {
          const q = iso.toScreen(tx - 1, ty);
          drawFrame(ctx, sheet, `east_${variant}_0`, Math.round(q.x), Math.round(q.y), false, sheet.anchorEast);
        }
        return;
      }
      if (faded) ctx.globalAlpha = NEAR_WALL_ALPHA;
      const open = wall.kind === "door" ? wall.open : wall.kind === "window" && wall.shutter === "open";
      const outside = open ? map.outsideSign(tx, ty, edge) : 0;
      // A leaf swung out on the far side sits behind the wall face.
      if (open && outside < 0) drawSwungLeaves(ctx, wall, edge, x, y, h, outside);
      if (edge === "n") {
        drawFrame(ctx, sheet, `north_${variant}_0`, x, y, false, sheet.anchor);
      } else {
        drawFrame(ctx, sheet, `west_${variant}_0`, x, y, false, sheet.anchorWest);
      }
      if (open && outside > 0) drawSwungLeaves(ctx, wall, edge, x, y, h, outside);
      if (br) drawBracket(ctx, bx, by, br.torch);
      if (flame) drawTorchFlame(ctx, bx + 0.5, by - 15, flameFrame(tx + ty));
      if (faded) ctx.globalAlpha = 1;
    },
  };
}

// ---- props and characters ----

function propDrawables(tiles, visible, out) {
  for (const [tx, ty] of tiles) {
    const prop = map.tileAt(tx, ty).prop;
    if (!prop) continue;
    const i = prop.tiles.findIndex(([px, py]) => px === tx && py === ty);
    const sheet = getSheet(prop.sprite, prop.tiles.length);
    // A single-tile prop with an animated idle plays it; multi-tile props use
    // one frame per footprint tile.
    const anim = sheet.animations && sheet.animations.idle;
    // The tile offset desynchronises neighbours; the abs keeps the modulo
    // positive west and north of the origin, where JS would give a negative
    // index and a missing frame.
    const frameIdx = prop.tiles.length === 1 && anim && anim.fps > 0
      ? Math.floor((performance.now() / 1000) * anim.fps + Math.abs(tx * 7 + ty * 3)) % anim.frames
      : i;
    const name = `idle_${frameIdx}`;
    const f = sheet.frames[name];
    const p = iso.toScreen(tx, ty);
    const x = Math.round(p.x);
    const y = Math.round(p.y);
    const rect = f
      ? sheet.bounds
        ? { x: x - sheet.anchor[0] + sheet.bounds.x, y: y - sheet.anchor[1] + sheet.bounds.y, w: sheet.bounds.w, h: sheet.bounds.h }
        : { x: x - sheet.anchor[0], y: y - sheet.anchor[1], w: f[2], h: f[3] }
      : null;
    // A lit fire's flame frame is drawn in order with its body and erases
    // itself from the night layer in its turn, so it neither dims nor shows
    // through a wall.
    const flameName = `flame_${frameIdx}`;
    const flame = prop.fire && prop.fire.lit && sheet.frames[flameName] && visible.has(tileKey(tx, ty))
      ? { name: flameName, rect: { x: x - sheet.anchor[0], y: y - sheet.anchor[1], w: sheet.frames[flameName][2], h: sheet.frames[flameName][3] } }
      : null;
    out.push({
      key: (tx + ty) * 1000 + 1,
      kind: "prop",
      vis: visible.has(tileKey(tx, ty)),
      rect,
      lightPos: [tx, ty],
      flame,
      drawFlame(ctx) {
        drawFrame(ctx, sheet, flameName, x, y);
      },
      canOcclude: !!f && f[3] >= OCCLUDER_MIN_HEIGHT,
      occluder: false,
      drawBody(ctx) {
        drawFrame(ctx, sheet, name, x, y);
      },
      draw(ctx) {
        drawFrame(ctx, sheet, name, x, y);
        if (flame) drawFrame(ctx, sheet, flameName, x, y);
      },
    });
  }
}

function entityDrawables(entities, visible, out, drawAll) {
  for (const e of entities) {
    const vis = e.kind === "player" || drawAll || visible.has(tileKey(Math.round(e.gx), Math.round(e.gy)));
    if (!vis) continue; // the dead you cannot see are not drawn, full stop
    const sheet = getSheet(e.sprite);
    const p = iso.toScreen(e.gx, e.gy);
    const x = Math.round(p.x);
    const y = Math.round(p.y);
    const r = resolveFacing(sheet, e.facing);
    const rect = frameRect(sheet, frameName(sheet, e.anim.name, r.facing, e.anim.frame), x, y);
    // A torch in the hand: the stick and the flame are part of the figure;
    // the flame erases itself from the night layer in its turn.
    const torch = e.hands && heldFire(e.hands) ? torchHandPoint(e.facing, x, y) : null;
    out.push({
      key: (e.gx + e.gy) * 1000 + (e.dead ? 0 : 2),
      kind: "entity",
      entity: e,
      sheet,
      rect,
      lightPos: [e.gx, e.gy],
      vis: true,
      occluded: false,
      flame: torch ? { rect: { x: torch[0] - 14, y: torch[1] - 22, w: 28, h: 26 } } : null,
      drawFlame(ctx) {
        drawTorchFlame(ctx, torch[0] + 0.5, torch[1] - 3, flameFrame(1));
      },
      drawBody(ctx) {
        drawCharacter(ctx, sheet, e.anim, e.facing, x, y);
        if (torch) drawHandTorch(ctx, torch[0], torch[1]);
      },
      draw(ctx) {
        drawCharacter(ctx, sheet, e.anim, e.facing, x, y);
        if (torch) {
          drawHandTorch(ctx, torch[0], torch[1]);
          drawTorchFlame(ctx, torch[0] + 0.5, torch[1] - 3, flameFrame(1));
        }
      },
    });
  }
}

function rectsOverlap(a, b) {
  return a && b && a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

function computeOcclusion(drawables) {
  for (let i = 0; i < drawables.length; i++) {
    const d = drawables[i];
    if (d.kind !== "entity" || d.entity.dead || !d.rect) continue;
    const body = { x: d.rect.x, y: d.rect.y, w: d.rect.w, h: Math.max(1, d.rect.h - 14) };
    for (let j = i + 1; j < drawables.length; j++) {
      const o = drawables[j];
      if (o.kind !== "prop" || !o.canOcclude) continue;
      if (rectsOverlap(body, o.rect)) {
        d.occluded = true;
        o.occluder = true;
      }
    }
  }
}

// An occluder is drawn into a scratch layer, the holes are erased out of it,
// and the layer is composited in the occluder's place in the sort order, so
// it still sits correctly behind and in front of everything else.
let occCanvas = null;
let occCtx = null;
function drawWithHoles(ctx, d, holes, w, h) {
  if (!occCanvas) {
    occCanvas = document.createElement("canvas");
    occCtx = occCanvas.getContext("2d");
  }
  if (occCanvas.width !== w || occCanvas.height !== h) {
    occCanvas.width = w;
    occCanvas.height = h;
  }
  const r = d.rect;
  const x0 = Math.max(0, Math.floor(r.x) - 2);
  const y0 = Math.max(0, Math.floor(r.y) - 2);
  const x1 = Math.min(w, Math.ceil(r.x + r.w) + 2);
  const y1 = Math.min(h, Math.ceil(r.y + r.h) + 2);
  if (x1 <= x0 || y1 <= y0) return;
  occCtx.imageSmoothingEnabled = false;
  occCtx.globalCompositeOperation = "source-over";
  occCtx.clearRect(x0, y0, x1 - x0, y1 - y0);
  d.draw(occCtx);
  cutHoles(occCtx, holes);
  occCtx.globalCompositeOperation = "source-over";
  ctx.drawImage(occCanvas, x0, y0, x1 - x0, y1 - y0, x0, y0, x1 - x0, y1 - y0);
}

// ---- fog ----
// One offscreen layer filled dark, with everything visible erased out of it:
// the diamonds of visible tiles (one path, so adjacent diamonds leave no
// seams), the faces of visible walls, and the sprites of drawn characters.

let fogCanvas = null;
let fogCtx = null;

function drawFog(ctx, w, h, tiles, visible, drawables) {
  if (!fogCanvas) {
    fogCanvas = document.createElement("canvas");
    fogCtx = fogCanvas.getContext("2d");
  }
  if (fogCanvas.width !== w || fogCanvas.height !== h) {
    fogCanvas.width = w;
    fogCanvas.height = h;
  }
  const g = fogCtx;
  g.globalCompositeOperation = "source-over";
  g.clearRect(0, 0, w, h);
  g.fillStyle = FOG;
  g.fillRect(0, 0, w, h);
  g.globalCompositeOperation = "destination-out";
  g.fillStyle = "#fff";
  g.beginPath();
  for (const [tx, ty] of tiles) {
    if (!visible.has(tileKey(tx, ty))) continue;
    const p = iso.toScreen(tx, ty);
    const x = Math.round(p.x);
    const y = Math.round(p.y);
    // A hair larger than the tile so neighbours overlap rather than seam.
    g.moveTo(x, y - iso.HH - 1);
    g.lineTo(x + iso.HW + 1, y);
    g.lineTo(x, y + iso.HH + 1);
    g.lineTo(x - iso.HW - 1, y);
    g.closePath();
  }
  g.fill();
  for (const d of drawables) {
    if (d.kind === "wall" && d.fogPoly) {
      poly(g, d.fogPoly);
      g.fill();
    } else if (d.kind === "entity" && d.rect) {
      g.fillRect(d.rect.x, d.rect.y, d.rect.w, d.rect.h);
    } else if (d.kind === "prop" && d.vis && d.rect) {
      g.fillRect(d.rect.x, d.rect.y, d.rect.w, d.rect.h);
    }
  }
  g.globalCompositeOperation = "source-over";
  ctx.drawImage(fogCanvas, 0, 0);
}

// ---- night ----
// One offscreen layer: the night tint with light erased out of it, composited
// with multiply so colours darken proportionally (the cozy parent's
// drawNightOverlay, over the viewport instead of one node).
//
// The floor goes first: rooms brighter or darker than outdoors, the player's
// own weak pool, each chunk's shadowed light map drawn through the iso
// transform with smoothing on, and the pool of the torch in the hand. Then
// every drawable paints its own darkness over its own shape in sort order, so
// whatever covers a thing in the scene covers it here too: a wall face takes
// the light of the tile it looks onto, a wall top the sky, a translucent near
// wall a mix of its face and what shows through it, and a prop or a character
// the light at its feet. A flame erases itself from the layer in its turn, so
// it never dims and a wall drawn after it hides it. Michael (2026-10-09): the
// stencils for walls, sprites, and flames had grown into a list of exceptions;
// this is one rule, the scene's own order.

let nightCanvas = null;
let nightCtx = null;
let maskCanvas = null;
let maskCtx = null;

function tileDiamonds(g, list) {
  g.beginPath();
  for (const [tx, ty] of list) {
    const p = iso.toScreen(tx, ty);
    const x = Math.round(p.x);
    const y = Math.round(p.y);
    g.moveTo(x, y - iso.HH - 1);
    g.lineTo(x + iso.HW + 1, y);
    g.lineTo(x, y + iso.HH + 1);
    g.lineTo(x - iso.HW - 1, y);
    g.closePath();
  }
}

// Bring a region of the layer from the base darkness to a target darkness:
// erase a fraction of it, or lay more tint over it.
function adjustTo(g, base, target, pathFn) {
  if (Math.abs(target - base) < 0.005) return;
  if (target < base) {
    g.globalCompositeOperation = "destination-out";
    g.fillStyle = `rgba(255,255,255,${1 - target / base})`;
  } else {
    g.globalCompositeOperation = "source-over";
    g.fillStyle = `rgba(${night.tint}, ${(target - base) / (1 - base)})`;
  }
  pathFn();
  g.fill();
}

// The player's pool, 0..1, at a screen point: the same stops as the gradient.
function poolAt(x, y, ox, oy) {
  const t = Math.hypot(x - ox, y - oy) / night.pool;
  const s = night.poolStrength;
  if (t >= 1) return 0;
  if (t < 0.35) return s - (s - s * 0.8) * (t / 0.35);
  if (t < 0.7) return s * 0.8 - (s * 0.8 - s * 0.35) * ((t - 0.35) / 0.35);
  return s * 0.35 * (1 - (t - 0.7) / 0.3);
}

function polyBox(p) {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const [x, y] of p) {
    x0 = Math.min(x0, x);
    y0 = Math.min(y0, y);
    x1 = Math.max(x1, x);
    y1 = Math.max(y1, y);
  }
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

// Cut the soft holes of occluded characters out of a context's current pixels.
function cutHoles(ctx, holes) {
  ctx.globalCompositeOperation = "destination-out";
  for (const [hx, hy] of holes) {
    const g = ctx.createRadialGradient(hx, hy, HOLE_INNER, hx, hy, HOLE_OUTER);
    g.addColorStop(0, "rgba(0,0,0,1)");
    g.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = g;
    ctx.fillRect(hx - HOLE_OUTER, hy - HOLE_OUTER, HOLE_OUTER * 2, HOLE_OUTER * 2);
  }
}

function drawNight(ctx, w, h, tiles, drawables, player, holes) {
  const out = light.outdoorAmbient();
  const base = night.alpha * light.darknessOf(out);
  // Rooms in view and how dark each is: a lit hearth makes one brighter than
  // the night outside, closed shutters make one darker than the day outside.
  // The parent's "board everything and noon is midnight", with shutters.
  const byRoom = new Map();
  for (const t of tiles) {
    const id = map.tileAt(t[0], t[1]).room;
    if (id <= 0) continue;
    if (!byRoom.has(id)) byRoom.set(id, []);
    byRoom.get(id).push(t);
  }
  const roomDark = new Map();
  let anyRoomDark = false;
  for (const id of byRoom.keys()) {
    const target = night.alpha * light.darknessOf(light.roomAmbient(id));
    roomDark.set(id, target);
    if (target > 0.01) anyRoomDark = true;
  }
  if (base <= 0.01 && !anyRoomDark) return;
  if (!nightCanvas) {
    nightCanvas = document.createElement("canvas");
    nightCtx = nightCanvas.getContext("2d");
    maskCanvas = document.createElement("canvas");
    maskCtx = maskCanvas.getContext("2d");
  }
  if (nightCanvas.width !== w || nightCanvas.height !== h) {
    nightCanvas.width = w;
    nightCanvas.height = h;
    maskCanvas.width = w;
    maskCanvas.height = h;
  }
  const g = nightCtx;
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.globalCompositeOperation = "source-over";
  g.clearRect(0, 0, w, h);
  if (base > 0) {
    g.fillStyle = `rgba(${night.tint}, ${base})`;
    g.fillRect(0, 0, w, h);
  }

  // ---- the floor ----
  for (const [id, list] of byRoom) adjustTo(g, base, roomDark.get(id), () => tileDiamonds(g, list));
  g.globalCompositeOperation = "destination-out";
  // The player's inherent visibility: partial erase, long smooth falloff.
  let ox = 0;
  let oy = 0;
  if (player) {
    const p = iso.toScreen(player.gx, player.gy);
    ox = p.x;
    oy = p.y - 12;
    const r = night.pool;
    const s = night.poolStrength;
    const pg = g.createRadialGradient(ox, oy, 0, ox, oy, r);
    pg.addColorStop(0, `rgba(255,255,255,${s})`);
    pg.addColorStop(0.35, `rgba(255,255,255,${s * 0.8})`);
    pg.addColorStop(0.7, `rgba(255,255,255,${s * 0.35})`);
    pg.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = pg;
    g.fillRect(ox - r, oy - r, r * 2, r * 2);
  }
  // Fire with shadows: each visible chunk's map, one pixel per light cell,
  // clipped to the chunk; the one place scaling in drawImage is allowed.
  const org = iso.getOrigin();
  const seen = new Set();
  for (const [tx, ty] of tiles) {
    const [cx, cy] = map.chunkCoord(tx, ty);
    const k = map.chunkKey(cx, cy);
    if (seen.has(k)) continue;
    seen.add(k);
    const layer = light.chunkLight(cx, cy);
    if (!layer.any) continue;
    g.save();
    g.setTransform(iso.HW, iso.HH, -iso.HW, iso.HH, org.x, org.y);
    g.translate(cx * map.CHUNK - 0.5, cy * map.CHUNK - 0.5);
    g.beginPath();
    g.rect(0, 0, map.CHUNK, map.CHUNK);
    g.clip();
    g.imageSmoothingEnabled = true;
    g.imageSmoothingQuality = "high";
    g.scale(1 / light.RES, 1 / light.RES);
    g.translate(-1, -1);
    g.drawImage(layer.canvas, 0, 0);
    g.restore();
  }
  // The torch in the hand: a polygon of ray endpoints, erased with a gradient
  // from the carrier outward, so the pool stops at walls and closed shutters.
  const carrier = light.carried();
  if (carrier) {
    const pts = light.poolRays().map((p) => iso.toScreen(p.gx, p.gy));
    const c = iso.toScreen(carrier.gx, carrier.gy);
    let radius = 1;
    for (const p of pts) radius = Math.max(radius, Math.hypot(p.x - c.x, p.y - c.y));
    g.save();
    g.globalCompositeOperation = "destination-out";
    poly(g, pts.map((p) => [p.x, p.y]));
    g.clip();
    const grad = g.createRadialGradient(c.x, c.y, 0, c.x, c.y, radius);
    grad.addColorStop(0, "rgba(255,255,255,1)");
    grad.addColorStop(0.5, "rgba(255,255,255,0.9)");
    grad.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = grad;
    g.fillRect(c.x - radius, c.y - radius, radius * 2, radius * 2);
    g.restore();
  }

  // ---- everything standing, in sort order ----
  // Where the layer is not plain base: rooms, pools, the player's own glow.
  // A thing at base darkness that touches none of them would paint base over
  // base, so it is skipped; that is most of a forest at night.
  const boxes = [];
  for (const [id, list] of byRoom) {
    if (Math.abs(roomDark.get(id) - base) < 0.02) continue;
    const b = polyBox(list.map(([tx, ty]) => {
      const p = iso.toScreen(tx, ty);
      return [p.x, p.y];
    }));
    boxes.push({ x: b.x - iso.HW, y: b.y - iso.HH - 90, w: b.w + iso.TW, h: b.h + iso.TH + 90 });
  }
  for (const s of light.allSources()) {
    const p = iso.toScreen(s.gx, s.gy);
    const rx = s.radius * iso.HW + 48;
    const ry = s.radius * iso.HH + 48;
    boxes.push({ x: p.x - rx, y: p.y - ry - 130, w: rx * 2, h: ry * 2 + 130 });
  }
  if (player) boxes.push({ x: ox - night.pool, y: oy - night.pool - 130, w: night.pool * 2, h: night.pool * 2 + 130 });
  const touches = (r) => {
    for (const b of boxes) if (rectsOverlap(r, b)) return true;
    return false;
  };
  const setAlpha = (p, a) => {
    g.globalCompositeOperation = "destination-out";
    g.fillStyle = "#fff";
    poly(g, p);
    g.fill();
    if (a <= 0) return;
    g.globalCompositeOperation = "source-over";
    g.fillStyle = `rgba(${night.tint}, ${a})`;
    poly(g, p);
    g.fill();
  };
  // A face polygon's first two points are its foot; the face is extended two
  // pixels below them so the hair of overlap the room diamonds leave never
  // shows as a lit line under a wall.
  const footed = (p) => p.map((pt, i) => (i < 2 ? [pt[0], pt[1] + 2] : pt));
  const m = maskCtx;
  m.setTransform(1, 0, 0, 1, 0, 0);
  m.imageSmoothingEnabled = false;
  for (const d of drawables) {
    if (d.kind === "wall") {
      if (!d.faces) continue;
      const faceA = d.faces.map((f) => {
        const l = light.lightAt(f.tile[0], f.tile[1]);
        const pool = player ? poolAt(f.poly[1][0], f.poly[1][1], ox, oy) : 0;
        return night.alpha * light.darknessOf(l) * (1 - pool);
      });
      let topA = null;
      if (d.topPoly) {
        const pool = player ? poolAt(d.topPoly[0][0], d.topPoly[0][1], ox, oy) : 0;
        topA = base * (1 - pool);
      }
      const plain = !d.near && !d.flame && faceA.every((a) => Math.abs(a - base) < 0.01) && (topA === null || Math.abs(topA - base) < 0.01);
      if (plain && !touches(polyBox(d.fullPoly))) continue;
      d.faces.forEach((f, i) => {
        if (d.near) {
          // Drawn at NEAR_WALL_ALPHA over what shows through it, so its
          // darkness is that mix of its own face and what was painted before.
          g.globalCompositeOperation = "destination-out";
          g.fillStyle = `rgba(255,255,255,${NEAR_WALL_ALPHA})`;
          poly(g, f.poly);
          g.fill();
          g.globalCompositeOperation = "lighter";
          g.fillStyle = `rgba(${night.tint}, ${NEAR_WALL_ALPHA * faceA[i]})`;
          poly(g, f.poly);
          g.fill();
        } else {
          setAlpha(footed(f.poly), faceA[i]);
        }
      });
      if (d.topPoly) setAlpha(d.topPoly, topA);
    } else {
      if (!d.rect || !d.lightPos) continue;
      const r = d.rect;
      if (r.x + r.w < 0 || r.y + r.h < 0 || r.x > w || r.y > h) continue;
      const l = light.lightAt(d.lightPos[0], d.lightPos[1]);
      const pool = player ? poolAt(r.x + r.w / 2, r.y + r.h, ox, oy) : 0;
      const a = night.alpha * light.darknessOf(l) * (1 - pool);
      if (Math.abs(a - base) < 0.01 && !d.flame && !touches(r)) continue;
      const bx = Math.floor(r.x) - 1;
      const by = Math.floor(r.y) - 1;
      const bw = Math.ceil(r.w) + 2;
      const bh = Math.ceil(r.h) + 2;
      // The sprite's own pixels as a mask, holes and all; cut them out of the
      // layer, then lay them back tinted at the sprite's darkness.
      m.globalCompositeOperation = "source-over";
      m.clearRect(bx, by, bw, bh);
      d.drawBody(m);
      if (d.occluder && holes.length) cutHoles(m, holes);
      g.globalCompositeOperation = "destination-out";
      g.drawImage(maskCanvas, bx, by, bw, bh, bx, by, bw, bh);
      if (a > 0) {
        m.globalCompositeOperation = "source-in";
        m.fillStyle = `rgba(${night.tint}, ${a})`;
        m.fillRect(bx, by, bw, bh);
        g.globalCompositeOperation = "source-over";
        g.drawImage(maskCanvas, bx, by, bw, bh, bx, by, bw, bh);
      }
    }
    if (d.flame) {
      g.globalCompositeOperation = "destination-out";
      d.drawFlame(g);
    }
  }
  g.globalCompositeOperation = "source-over";

  ctx.globalCompositeOperation = "multiply";
  ctx.drawImage(nightCanvas, 0, 0);
  ctx.globalCompositeOperation = "source-over";
}

// ---- the scene ----

export function renderScene(ctx, { w, h, tiles, visible, entities, playerRoom, player = null, drawAll = false, fog = true }) {
  drawFloor(ctx, tiles, w, h);
  const drawables = [];
  wallDrawables(tiles, visible, playerRoom, drawables);
  postDrawables(tiles, visible, playerRoom, drawables);
  propDrawables(tiles, visible, drawables);
  entityDrawables(entities, visible, drawables, drawAll);
  drawables.sort((a, b) => a.key - b.key);
  computeOcclusion(drawables);
  // Hole centres: the chest of every occluded character.
  const holes = [];
  for (const d of drawables) if (d.occluded && d.rect) holes.push([d.rect.x + d.rect.w / 2, d.rect.y + d.rect.h * 0.45]);
  for (const d of drawables) {
    if (d.occluder && holes.length) drawWithHoles(ctx, d, holes, w, h);
    else d.draw(ctx);
  }
  drawNight(ctx, w, h, tiles, drawables, player, holes);
  if (fog) drawFog(ctx, w, h, tiles, visible, drawables);
  return drawables.length;
}
