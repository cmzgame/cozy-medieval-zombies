// The WebGL renderer (docs/08-renderer.md). Builds the drawable list the
// Canvas 2D renderer built before it (the same sort order; that renderer was
// deleted on 2026-10-09 when Michael accepted this one), but every drawable
// pushes quads and polygons into gl.js's batch with the world point its light
// is read from: a floor pixel its own point, a standing thing its foot, a wall
// face a point along its foot line, a wall top the sky. The shader samples
// the light, ambient, and fog textures there, so the night and the fog are
// per pixel and there is no night layer, no fog layer, and no stencil.

import * as iso from "./iso.js";
import * as clock from "./clock.js";
import { getSheet } from "./assets.js";
import { resolveFacing, frameName } from "./sprites.js";
import { shade } from "./render-util.js";
import * as map from "./map.js";
import * as light from "./light.js";
import { tileKey } from "./visibility.js";
import { WALL_T, WOOD, METAL, torchHandPoint } from "./placeholders.js";
import { heldFire, getItem } from "./items.js";
import * as gl from "./gl.js";

// The night, as before: tunables Michael picks by eye, live on
// window.__game.render.night. `climb` is how many pixels a pool climbs a wall
// face (0 for a flat face); `linear` is the light sampling, false for the
// per-cell look.
export const night = {
  tint: "36, 22, 56",
  alpha: 0.96,
  pool: 190,
  poolStrength: 0.42,
  climb: 56, // px a pool climbs a wall face or a trunk; 0 for the flat face
  linear: true,
  standingFloor: 0, // a floor on the light of props and characters, for legibility
  debug: 0, // 0 none, 1 the light texture, 2 ambient, 3 fog (the L key)
};
const FOG_COLOR = [22 / 255, 14 / 255, 32 / 255];
const FOG_ALPHA = 0.36;
const CLEAR = [0x16 / 255, 0x12 / 255, 0x1c / 255];

export let cutaway = "translucent";
const NEAR_WALL_ALPHA = 0.42;

export function setCutaway(mode) {
  cutaway = mode;
}

const OCCLUDER_MIN_HEIGHT = 64;
const HOLE_INNER = 34; // px, fully clear
const HOLE_OUTER = 78; // px, fade to solid

// Chunks across the light and fog textures: enough to cover the view from any
// camera position in its chunk, so it grows with the window (docs/02, the view).
let areaChunks = 0;
let areaTiles = 0;
let lightArea = null;
let ambientArea = null;
let fogArea = null;

function ensureArea(w, h) {
  // Tiles from the camera to the view's corner, plus tall sprites and margin.
  const r = (w / 2 / iso.HW + h / 2 / iso.HH) / 2 + 6;
  const need = 2 * Math.ceil(r / map.CHUNK) + 1;
  if (need === areaChunks) return;
  areaChunks = need;
  areaTiles = need * map.CHUNK;
  lightArea = new Uint8Array(areaTiles * light.RES * areaTiles * light.RES);
  ambientArea = new Uint8Array(areaTiles * areaTiles);
  fogArea = new Uint8Array(areaTiles * areaTiles);
}
const CORE_GAIN = 1.4;

function flameFrame(seed = 0) {
  return Math.floor(performance.now() / 180 + seed) % 3;
}

function tintRGB() {
  const [r, g, b] = night.tint.split(",").map((s) => parseFloat(s) / 255);
  return [r, g, b];
}

// A frame of a sheet as a quad at (x, y) with an anchor, like drawFrame.
function frameQuad(sheet, name, x, y, opts, flip = false, anchor = sheet.anchor) {
  const f = sheet.frames[name];
  if (!f) return;
  const uv = gl.frameUV(sheet, name);
  const rx = flip ? x - (f[2] - anchor[0]) : x - anchor[0];
  gl.quad(rx, y - anchor[1], f[2], f[3], uv, { ...opts, flip });
}

// ---- floor ----

function emitFloor(tiles) {
  for (const [tx, ty] of tiles) {
    const t = map.tileAt(tx, ty);
    const sheet = getSheet(t.floor);
    const alt = (tx + ty) % 2 === 0 ? 0 : 1;
    const name = `idle_${alt}`;
    const f = sheet.frames[name];
    if (!f) continue;
    const p = iso.toScreen(tx, ty);
    const x = Math.round(p.x);
    const y = Math.round(p.y);
    // The frame's corners lie on the floor plane one tile out along each
    // axis, so the light is read per pixel across the diamond.
    const world = [[tx - 1, ty], [tx, ty - 1], [tx + 1, ty], [tx, ty + 1]];
    gl.quad(x - sheet.anchor[0], y - sheet.anchor[1], f[2], f[3], gl.frameUV(sheet, name), { world });
  }
}

// ---- walls ----

// The frame for a wall's state. Boards on the visible (near) face draw as the
// boarded variants; boards on the far face are not seen, and a broken leaf is
// the open frame with nothing in it (docs/09).
function wallVariant(wall) {
  const n = wall.boards.near.length;
  if (wall.kind === "door") {
    const shut = !wall.open && !wall.broken;
    if (n) return `${shut ? "door_shut_boarded" : "door_boarded"}${n}`;
    return shut ? "door_shut" : "door";
  }
  if (wall.kind === "window") {
    const shut = wall.shutter === "closed" && !wall.broken;
    if (n) return `${shut ? "window_shut_boarded" : "boarded"}${n}`;
    return shut ? "window_shut" : "window";
  }
  return "plain";
}

// The low stubs have no board frames; a boarded leaf stubs as its leaf.
function stubVariant(variant) {
  const base = variant.replace(/\d$/, "");
  if (base === "window_shut_boarded") return "window_shut";
  if (base === "door_shut_boarded") return "door_shut";
  return base;
}

// A plank leaf in the quad [p0, p1, p2, p3] (p0 and p3 the bottom corners),
// with metal strips, as flat polygons.
function emitPlankLeaf(quad, strips, shadeF, opts) {
  const [p0, p1, p2, p3] = quad;
  const lerp = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
  gl.poly(quad, gl.rgb(shade(WOOD, shadeF), opts.alpha), opts);
  const bands = strips === 1 ? [0.5] : [0.3, 0.7];
  for (const t of bands) {
    const a = lerp(p0, p1, t);
    const b = lerp(p3, p2, t);
    gl.poly([[a[0], a[1] - 1.5], [b[0], b[1] - 1.5], [b[0], b[1] + 1.5], [a[0], a[1] + 1.5]], gl.rgb(METAL, opts.alpha), opts);
  }
}

// Open shutters and doors swing out on the outside of the wall, perpendicular
// to it, at the jambs (Michael, 2026-10-09: "history be damned").
function emitSwungLeaves(wall, edge, x, y, h, outside, opts) {
  const a = edge === "n" ? [x, y - iso.HH] : [x - iso.HW, y];
  const b = edge === "n" ? [x + iso.HW, y] : [x, y - iso.HH];
  const lerp = (t, up) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t - up];
  const perp = edge === "n" ? [-iso.HW, iso.HH] : [iso.HW, iso.HH];
  const isDoor = wall.kind === "door";
  const len = isDoor ? 0.55 : 0.32;
  const v = [perp[0] * len * outside, perp[1] * len * outside];
  const y0 = isDoor ? 0 : h * 0.35;
  const y1 = isDoor ? h * 0.82 : h * 0.8;
  const jambs = isDoor ? [0.18] : [0.25, 0.75];
  for (const t of jambs) {
    const p0 = lerp(t, y0);
    const p1 = lerp(t, y1);
    emitPlankLeaf([p0, p1, [p1[0] + v[0], p1[1] + v[1]], [p0[0] + v[0], p0[1] + v[1]]], isDoor ? 2 : 1, outside > 0 ? 0.95 : 0.7, opts);
  }
}

function isNearWall(tx, ty, edge, playerRoom) {
  if (playerRoom <= 0) return false;
  const t = map.tileAt(tx, ty);
  const far = edge === "n" ? map.tileAt(tx, ty - 1) : map.tileAt(tx - 1, ty);
  return far.room === playerRoom && t.room !== playerRoom;
}

// Corner posts: where walls meet at a corner, end, or junction (docs/02).
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
  const A = [x, y];
  const B = [x + T, y - T / 2];
  const C = [x, y - T];
  const D = [x - T, y - T / 2];
  const up = ([px, py]) => [px, py - h];
  const faded = near && cutaway !== "stub";
  const hidden = near && cutaway === "stub";
  const alpha = faded ? NEAR_WALL_ALPHA : 1;
  const flags = vis ? gl.FLAG_NOFOG : 0;
  return {
    key: (tx + ty - 1) * 1000 + 0.5,
    kind: "wall",
    emit() {
      if (hidden) return;
      // The post stands at the top vertex of (tx, ty); its left face continues
      // the north-wall line and looks onto (tx - 1, ty), its right face the
      // west-wall line and looks onto (tx, ty - 1); the top is the sky.
      gl.poly([D, A, up(A), up(D)], gl.rgb(shade(color, 0.5), alpha), { world: [tx - 1, ty], heights: [0, 0, h, h], flags });
      gl.poly([A, B, up(B), up(A)], gl.rgb(shade(color, 0.62), alpha), { world: [tx, ty - 1], heights: [0, 0, h, h], flags });
      gl.poly([up(A), up(B), up(C), up(D)], gl.rgb(shade(color, 1.18), alpha), { world: [tx, ty], flags: flags | gl.FLAG_SKY });
    },
  };
}

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
  const alpha = faded ? NEAR_WALL_ALPHA : 1;
  const flags = vis ? gl.FLAG_NOFOG : 0;
  const color = sheet.color || "#888";
  // The edge on screen, a to b. The face's light is read along its foot a
  // little inside the tile it looks onto, never on the boundary itself, where
  // the sample would fall into the room behind.
  const a = edge === "n" ? [x, y - iso.HH] : [x - iso.HW, y];
  const b = edge === "n" ? [x + iso.HW, y] : [x, y - iso.HH];
  const wa = edge === "n" ? [tx - 0.4, ty - 0.2] : [tx - 0.2, ty - 0.4];
  const wb = edge === "n" ? [tx + 0.4, ty - 0.2] : [tx - 0.2, ty + 0.4];
  const br = wall.bracket && wall.bracket.side > 0 && !lowStub ? wall.bracket : null;
  let bx = 0;
  let by = 0;
  if (br) {
    bx = Math.round((a[0] + b[0]) / 2);
    by = Math.round((a[1] + b[1]) / 2 - h * 0.5);
  }
  return {
    key: depth * 1000,
    kind: "wall",
    emit() {
      const tint = [1, 1, 1, alpha];
      if (lowStub) {
        const q = edge === "n" ? iso.toScreen(tx, ty - 1) : iso.toScreen(tx - 1, ty);
        const name = edge === "n" ? `south_${stubVariant(variant)}_0` : `east_${stubVariant(variant)}_0`;
        frameQuad(sheet, name, Math.round(q.x), Math.round(q.y), { world: [tx, ty], color: tint, flags }, false, edge === "n" ? sheet.anchorSouth : sheet.anchorEast);
        return;
      }
      // Swung leaves only for a whole, open, unboarded leaf.
      const open = !wall.broken && !map.boarded(wall) && (wall.kind === "door" ? wall.open : wall.kind === "window" && wall.shutter === "open");
      const outside = open ? map.outsideSign(tx, ty, edge) : 0;
      const leafOpts = { world: [tx, ty], flags, alpha };
      if (open && outside < 0) emitSwungLeaves(wall, edge, x, y, h, outside, leafOpts);
      // The face: the frame, its bottom corners on the edge's ends so the
      // light is read along the foot and height climbs to the top.
      const name = edge === "n" ? `north_${variant}_0` : `west_${variant}_0`;
      const anchor = edge === "n" ? sheet.anchor : sheet.anchorWest;
      const f = sheet.frames[name];
      if (f) {
        gl.quad(x - anchor[0], y - anchor[1], f[2], f[3], gl.frameUV(sheet, name), { world: [wa, wb, wb, wa], heights: [f[3], f[3], 0, 0], color: tint, flags });
      }
      // The top strip, on the sky.
      const top = edge === "n"
        ? [[x, y - iso.HH - h], [x + iso.HW, y - h], [x + iso.HW + T, y - T / 2 - h], [x + T, y - iso.HH - T / 2 - h]]
        : [[x - iso.HW, y - h], [x, y - iso.HH - h], [x - T, y - iso.HH - h - T / 2], [x - iso.HW - T, y - h - T / 2]];
      gl.poly(top, gl.rgb(shade(color, 1.18), alpha), { world: [tx, ty], flags: flags | gl.FLAG_SKY });
      if (open && outside > 0) emitSwungLeaves(wall, edge, x, y, h, outside, leafOpts);
      if (br) {
        const opts = { world: [tx, ty], flags };
        gl.poly([[bx - 2, by - 3], [bx + 2, by - 3], [bx + 2, by + 4], [bx - 2, by + 4]], gl.rgb(METAL, alpha), opts);
        gl.poly([[bx - 4, by - 1], [bx + 4, by - 1], [bx + 4, by + 1], [bx - 4, by + 1]], gl.rgb(METAL, alpha), opts);
        if (br.torch) {
          gl.poly([[bx - 1, by - 14], [bx + 2, by - 14], [bx + 2, by - 1], [bx - 1, by - 1]], gl.rgb(WOOD, alpha), opts);
          gl.poly([[bx - 2, by - 17], [bx + 3, by - 17], [bx + 3, by - 12], [bx - 2, by - 12]], gl.rgb("#3a2a22", alpha), opts);
          if (vis) frameQuad(getSheet("flame"), `flame_${flameFrame(tx + ty)}`, bx, by - 15, { world: [tx, ty], flags: gl.FLAG_UNLIT | gl.FLAG_NOFOG });
        }
      }
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
    const anim = sheet.animations && sheet.animations.idle;
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
    const vis = visible.has(tileKey(tx, ty));
    const flameName = `flame_${frameIdx}`;
    const flame = !!(prop.fire && prop.fire.lit && sheet.frames[flameName] && vis);
    const d = {
      key: (tx + ty) * 1000 + 1,
      kind: "prop",
      vis,
      rect,
      canOcclude: !!f && f[3] >= OCCLUDER_MIN_HEIGHT,
      occluder: false,
      emit() {
        const flags = gl.FLAG_STANDING | (d.occluder ? gl.FLAG_OCCLUDER : 0);
        frameQuad(sheet, name, x, y, { world: [tx, ty], heights: f ? [f[3], f[3], 0, 0] : 0, flags });
        if (flame) frameQuad(sheet, flameName, x, y, { world: [tx, ty], flags: gl.FLAG_UNLIT });
      },
    };
    out.push(d);
  }
}

// Items on the floor: a small block in the item's colour per entry, fanned a
// little so a pile reads as a pile (docs/10).
function floorItemDrawables(tiles, visible, out) {
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
          const c = gl.rgb(getItem(e.id).color || "#8a8296");
          const ox = x + ((i % 3) - 1) * 9;
          const oy = y - 3 - Math.floor(i / 3) * 5;
          const flags = gl.FLAG_STANDING | (vis ? gl.FLAG_NOFOG : 0);
          gl.poly([[ox - 7, oy], [ox, oy - 4], [ox + 7, oy], [ox, oy + 4]], gl.rgb("#1a1410"), { world: [tx, ty], flags });
          gl.poly([[ox - 6, oy], [ox, oy - 3], [ox + 6, oy], [ox, oy + 3]], c, { world: [tx, ty], flags });
          gl.poly([[ox - 6, oy], [ox, oy + 3], [ox, oy + 6], [ox - 6, oy + 3]], [c[0] * 0.6, c[1] * 0.6, c[2] * 0.6, 1], { world: [tx, ty], flags });
          gl.poly([[ox, oy + 3], [ox + 6, oy], [ox + 6, oy + 3], [ox, oy + 6]], [c[0] * 0.75, c[1] * 0.75, c[2] * 0.75, 1], { world: [tx, ty], flags });
        });
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
    const name = frameName(sheet, e.anim.name, r.facing, e.anim.frame);
    const f = sheet.frames[name];
    const rect = f ? { x: x - sheet.anchor[0], y: y - sheet.anchor[1], w: f[2], h: f[3] } : null;
    const torch = e.hands && heldFire(e.hands) ? torchHandPoint(e.facing, x, y) : null;
    const carried = e.carrying || null;
    const carrySheet = carried ? getSheet(carried.sprite, carried.tiles.length) : null;
    out.push({
      key: (e.gx + e.gy) * 1000 + (e.dead ? 0 : 2),
      kind: "entity",
      entity: e,
      rect,
      vis: true,
      occluded: false,
      emit() {
        const world = [e.gx, e.gy];
        frameQuad(sheet, name, x, y, { world, heights: f ? [f[3], f[3], 0, 0] : 0, flags: gl.FLAG_NOFOG | gl.FLAG_STANDING }, r.flip);
        if (carried) {
          // Each footprint slice at its offset from the anchor, lifted over the head.
          const [cw, ch] = carried.footprint;
          let i = 0;
          for (let dy = 0; dy < ch; dy++) {
            for (let dx = 0; dx < cw; dx++, i++) {
              const o = iso.toScreen(e.gx + dx - (cw - 1) / 2, e.gy + dy - (ch - 1) / 2);
              const cf = carrySheet.frames[`idle_${i}`];
              frameQuad(carrySheet, `idle_${i}`, Math.round(o.x), Math.round(o.y) - 30, { world, heights: cf ? [cf[3] + 30, cf[3] + 30, 30, 30] : 30, flags: gl.FLAG_NOFOG | gl.FLAG_STANDING });
            }
          }
        }
        if (torch) {
          const [hx, hy] = torch;
          gl.poly([[hx - 1, hy], [hx + 2, hy], [hx + 2, hy + 12], [hx - 1, hy + 12]], gl.rgb(WOOD), { world, flags: gl.FLAG_NOFOG });
          gl.poly([[hx - 2, hy - 3], [hx + 3, hy - 3], [hx + 3, hy + 2], [hx - 2, hy + 2]], gl.rgb("#3a2a22"), { world, flags: gl.FLAG_NOFOG });
          frameQuad(getSheet("flame"), `flame_${flameFrame(1)}`, hx, hy - 3, { world, flags: gl.FLAG_UNLIT | gl.FLAG_NOFOG });
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

// ---- the light, ambient, and fog textures ----
// Over the chunks around the camera: light at two cells per tile from the
// CPU chunk maps plus the carried pool; ambient and fog at one texel per tile.


function buildArea(tiles, visible, drawAll, camGx, camGy) {
  const [ccx, ccy] = map.chunkCoord(Math.round(camGx), Math.round(camGy));
  const c0x = ccx - (areaChunks >> 1);
  const c0y = ccy - (areaChunks >> 1);
  const ox = c0x * map.CHUNK;
  const oy = c0y * map.CHUNK;
  const RES = light.RES;
  const LW = areaTiles * RES;
  const now = performance.now() / 1000;
  lightArea.fill(0);
  for (let cy = 0; cy < areaChunks; cy++) {
    for (let cx = 0; cx < areaChunks; cx++) {
      const entry = light.chunkLight(c0x + cx, c0y + cy);
      if (!entry.any) continue;
      const N = map.CHUNK * RES + 2;
      const bx = cx * map.CHUNK * RES;
      const by = cy * map.CHUNK * RES;
      // Flicker: each flickering source's own layer is taken back by the
      // share its weight leaves out this frame.
      const dims = entry.layers.map((l) => ({ own: l.contrib, loss: 1 - light.flickerWeight(l.flicker, l.seed, now) }));
      for (let j = 1; j <= map.CHUNK * RES; j++) {
        const row = (by + j - 1) * LW + bx;
        const src = j * N;
        for (let i = 1; i <= map.CHUNK * RES; i++) {
          let v = entry.contrib[src + i];
          for (const dl of dims) v -= dl.own[src + i] * dl.loss;
          lightArea[row + i - 1] = Math.round(Math.max(0, v) * 255);
        }
      }
    }
  }
  // The torch in the hand, evaluated here rather than in any map.
  const carrier = light.carried();
  if (carrier) {
    const r = carrier.radius;
    const cw = light.flickerWeight(carrier.flicker, 1.3, now);
    const i0 = Math.max(0, Math.floor((carrier.gx - r - ox + 0.25) * RES));
    const i1 = Math.min(LW - 1, Math.ceil((carrier.gx + r - ox + 0.25) * RES));
    const j0 = Math.max(0, Math.floor((carrier.gy - r - oy + 0.25) * RES));
    const j1 = Math.min(LW - 1, Math.ceil((carrier.gy + r - oy + 0.25) * RES));
    for (let j = j0; j <= j1; j++) {
      const gy = oy - 0.25 + j / RES;
      for (let i = i0; i <= i1; i++) {
        const gx = ox - 0.25 + i / RES;
        const d = Math.hypot(gx - carrier.gx, gy - carrier.gy);
        if (d >= r) continue;
        const v = (d < 0.6 ? 1 : Math.min(1, CORE_GAIN * (1 - d / r)) * light.lightPath(carrier.gx, carrier.gy, gx, gy)) * cw;
        if (v <= 0) continue;
        const k = j * LW + i;
        lightArea[k] = Math.min(255, lightArea[k] + Math.round(v * 255));
      }
    }
  }
  for (let ty = 0; ty < areaTiles; ty++) {
    for (let tx = 0; tx < areaTiles; tx++) {
      ambientArea[ty * areaTiles + tx] = Math.round(light.ambientAt(ox + tx, oy + ty) * 255);
    }
  }
  fogArea.fill(drawAll ? 255 : 0);
  if (!drawAll) {
    for (const [tx, ty] of tiles) {
      if (!visible.has(tileKey(tx, ty))) continue;
      const ax = tx - ox;
      const ay = ty - oy;
      if (ax < 0 || ay < 0 || ax >= areaTiles || ay >= areaTiles) continue;
      fogArea[ay * areaTiles + ax] = 255;
    }
  }
  gl.uploadArea(lightArea, LW, LW, ambientArea, fogArea, areaTiles, areaTiles);
  return [ox, oy];
}

// ---- the scene ----

let lastLinear = null;

export function renderScene({ w, h, tiles, visible, entities, playerRoom, player = null, camera = null, drawAll = false, fog = true }) {
  ensureArea(w, h);
  if (lastLinear !== night.linear) {
    gl.setLightSampling(night.linear);
    lastLinear = night.linear;
  }
  const cam = camera || player || { gx: 0, gy: 0 };
  const areaOrigin = buildArea(tiles, visible, drawAll || !fog, cam.gx, cam.gy);

  gl.begin();
  emitFloor(tiles);
  const drawables = [];
  wallDrawables(tiles, visible, playerRoom, drawables);
  postDrawables(tiles, visible, playerRoom, drawables);
  propDrawables(tiles, visible, drawables);
  floorItemDrawables(tiles, visible, drawables);
  entityDrawables(entities, visible, drawables, drawAll);
  drawables.sort((a, b) => a.key - b.key);
  computeOcclusion(drawables);
  const holes = [];
  for (const d of drawables) if (d.occluded && d.rect) holes.push([d.rect.x + d.rect.w / 2, d.rect.y + d.rect.h * 0.45]);
  for (const d of drawables) d.emit();

  const pp = player ? iso.toScreen(player.gx, player.gy) : { x: -9999, y: -9999 };
  gl.end({
    w,
    h,
    clear: CLEAR,
    areaOrigin,
    areaTiles: [areaTiles, areaTiles],
    nightFloor: clock.NIGHT_BRIGHTNESS,
    nightAlpha: night.alpha,
    tint: tintRGB(),
    outdoor: light.outdoorAmbient(),
    player: [pp.x, pp.y - 12],
    pool: night.pool,
    poolStrength: night.poolStrength,
    climb: night.climb,
    fogColor: FOG_COLOR,
    fogAlpha: fog && !drawAll ? FOG_ALPHA : 0,
    holes,
    holeInner: HOLE_INNER,
    holeOuter: HOLE_OUTER,
    minStanding: night.standingFloor,
    debug: night.debug,
  });
  return drawables.length;
}
