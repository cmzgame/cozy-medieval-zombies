// The scene (docs/08): the night's tunables, the fog's and the near walls' numbers, the ground's quads, the
// occlusion holes, the build grid, the depth biases, and renderScene, which gathers every drawable in sort order and draws.
// Cut from src/render.js on 2026-10-12 (docs/23a, D5): a move, no rule changed; the frame check proves the pixels.
// The depth buffer (docs/51, 2026-10-27): the frame sorts per pixel. The ground and what lies flat on it draw first and write no
// depth; every standing drawable sets its depth surface from true geometry (render/depth.js) and its quads go to the opaque pass
// or the translucent one (gl.js); the ghosts, the hit shapes, and the marker draw on top. The key order still orders the
// translucent pass and every tie.

import * as iso from "../iso.js";
import * as clock from "../clock.js";
import * as map from "../map.js";
import * as light from "../light.js";
import * as gl from "../gl.js";
import * as ground from "../ground.js";
import { areaTiles, buildArea, buildStoreyArea, ensureArea } from "./area.js";
import { arrowDrawables, emitMarker, entityDrawables, fireDrawables } from "./entities.js";
import { emitGhost, emitHitShapes, floorItemDrawables, propDrawables } from "./props.js";
import * as hl from "./highlight.js"; // Object Highlight (#301)
import { emitRugs } from "./rugs.js"; // laid rugs, flat on the ground under everything (#327)
import { emitTileMark } from "./marks.js"; // the tile an Inspect marks
import { emitTracks } from "./tracks.js"; // game's prints on the ground (docs/45 section 2)
import { postDrawables, wallDrawables } from "./walls.js";
import { client } from "../client.js"; // who stands behind a tall prop, the client's own (#102)
import { emitFloors, hiderFor, layersFor, liftOf, stairDrawables, tilesOf, withLift } from "./storeys.js"; // the storeys (docs/49 step 2)

// The night, as before: tunables Michael picks by eye, live on
// window.__game.render.night. `climb` is how many pixels a pool climbs a wall
// face (0 for a flat face); `linear` is the light sampling, false for the
// per-cell look.
export const night = {
  tint: "36, 22, 56",
  alpha: 0.96,
  pool: 190,
  poolStrength: 0.42,
  climb: 84, // px a pool climbs a wall face or a trunk; 0 for the flat face: seven eighths of the 96 px wall (docs/52; 56 on the 64 px walls, 70 on the 80); one setting, so trees and tall props climb by it too
  linear: true,
  standingFloor: 0, // a floor on the light of props and characters, for legibility
  softLight: false, // true: ambient and standing light combine without a hard cap (no knee where a pool's climb runs out on a bright wall)
  debug: 0, // 0 none, 1 the light texture, 2 ambient, 3 fog (the L key)
};
const FOG_COLOR = [22 / 255, 14 / 255, 32 / 255];
const FOG_ALPHA = 0.36;
const CLEAR = [0x16 / 255, 0x12 / 255, 0x1c / 255];

export const NEAR_WALL_ALPHA = 0.42;

// The depth biases between kinds, in depth units (docs/51 section 3, defaults): what a kind sits nearer than its true geometry. Floor
// items over the ground; props and figures over the ground; a burning body's flames and smoke over the body; a lifted floor over the
// caps of the walls below it (docs/49, when it is built). A post sits a little behind the wall faces it is flush with (render/walls.js):
// where a post's face and a wall's lie in one plane (a run's joint, a T where a partition meets it, the corner where a run begins) the
// wall's picture is drawn over it, as the sort drew the later segment over the post; at an outer corner its front stands clear of both
// walls' faces and it shows; the joints are the walls' own (a segment's end on its end's plane, render/depth.js wallSurface). The spec's
// default was half a unit over the walls, to cover the seam; with the walls' ends on their own planes there is no seam to cover, and over
// them the post's half showed down the middle of every T and at the start of every run, which the sort never drew. Everything else, the
// walls, their caps, the arrows, is its true geometry. Each quad a drawable emits after its first sits gl.depthStep() nearer again.
export const DEPTH_BIAS = { floorItem: 0.5, post: -0.5, prop: 1, figure: 2, particle: 1, liftedFloor: 1 };

// How far over its bias a kind's own quads may climb by the emit order (gl.surface's `room`): the gap to the next kind that can share
// its plane, so a drawable's last layer stays under it at any buffer depth (at 16 bits a step is a quarter of a unit; the review of
// #530: a wall's sixth quad passed a prop's +1, a hanging or a bracket over a cupboard held on the wall's face). A post's room is the
// walls' faces it is flush with; a wall's, the props held on its face; a floor item's, the props over it; a prop's, the figures; a
// figure's, its own fire. Each lays out its layers to fit (render/walls.js's four, a floor item's block by block).
export const DEPTH_ROOM = { post: 0.5, wall: 1, floorItem: 0.5, prop: 1, figure: 1 };

// For check("depth"): a drawable `skip` returns true for is gathered, sorted, and counted as ever but not drawn, so a check can tell a
// thing's own pixels from what is behind them; `override` replaces fields of the frame's scene (a ghost, the marker, a flight, the tile
// mark, the highlight, the fog), so a check can stage what the client's own modules would; `mark` ({ is, color }) draws the drawables `is`
// returns true for in one flat colour (gl.setMark), in their own passes and depths, so a check finds a thing's own pixels by drawing it
// in two colours, whatever the colours behind it. All null in play.
export const probe = { skip: null, override: null, mark: null };

// The last frame's drawables by pass (check("depth"), its cost row): how many there were, and how many drew in the translucent pass.
export const lastStats = { drawables: 0, translucent: 0 };


// Only trees open a see-through hole for the player (Michael, 2026-10-11:
// "that's really just for trees"; walls have their own fade). A tree is a
// sprite with a canopy.
export const OCCLUDER_MIN_HEIGHT = 64;
const HOLE_INNER = 34; // px, fully clear
const HOLE_OUTER = 78; // px, fade to solid

// Chunks across the light and fog textures: enough to cover the view from any

export function flameFrame(seed = 0) {
  return Math.floor(performance.now() / 180 + seed) % 3;
}

function tintRGB() {
  const [r, g, b] = night.tint.split(",").map((s) => parseFloat(s) / 255);
  return [r, g, b];
}

// A frame of a sheet as a quad at (x, y) with an anchor, like drawFrame.
export function frameQuad(sheet, name, x, y, opts, flip = false, anchor = null) {
  const f = sheet.frames[name];
  if (!f) return;
  // A frame may carry its own anchor (sliced furniture, flames, wall parts: docs/17).
  anchor = anchor || (sheet.frameAnchors && sheet.frameAnchors[name]) || sheet.anchor;
  const uv = gl.frameUV(sheet, name);
  const rx = flip ? x - (f[2] - anchor[0]) : x - anchor[0];
  gl.quad(rx, y - anchor[1], f[2], f[3], uv, { ...opts, flip });
}

// ---- the ground (docs/15) ----

// World pixel (origin at zero) to grid: the inverse of iso.toScreen.
function worldToGrid(wx, wy) {
  return [(wx / iso.HW + wy / iso.HH) / 2, (wy / iso.HH - wx / iso.HW) / 2];
}

// One baked picture per chunk the view touches, drawn before anything else.
// The picture's corners carry their grid points, so the light, the night, and
// the fog are read per pixel across it as they were across each tile. A chunk
// with no picture yet is baked now: nothing draws as a hole in view.
function emitGround(tiles) {
  const o = iso.getOrigin(); // whole pixels: camera.applyOrigin rounds
  for (const [cx, cy] of ground.chunksOf(tiles)) {
    const rec = ground.drawRecord(cx, cy);
    if (!rec) continue; // not grown by the sim yet: nothing to draw (docs/31/05, item 8)
    const x0 = cx * map.CHUNK;
    const y0 = cy * map.CHUNK;
    const left = (x0 - y0 - map.CHUNK) * iso.HW;
    const top = (x0 + y0) * iso.HH - iso.HH;
    const world = [worldToGrid(left, top), worldToGrid(left + rec.w, top), worldToGrid(left + rec.w, top + rec.h), worldToGrid(left, top + rec.h)];
    gl.groundQuad(rec, left + o.x, top + o.y, world);
  }
}


function rectsOverlap(a, b) {
  return a && b && a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

// Who is behind a tall prop. Only the player is seen through it, by a soft
// hole in the canopy (docs/06); the dead are not: a zombie behind a tree is
// hidden by the tree like anything else, so the forest gives no laser vision
// (Michael, 2026-10-11). Every figure behind one goes in `client.behind`, by id, for the UI that floats over it
// (the health bars, the bubbles) to stay out of the same leak; never a flag on the figure (docs/31/05 item 7, #102).
function computeOcclusion(drawables, me) {
  client.behind.clear();
  for (let i = 0; i < drawables.length; i++) {
    const d = drawables[i];
    if (d.kind !== "entity" || d.entity.dead || !d.rect) continue;
    const isPlayer = d.entity === me; // the hole is mine alone (docs/31/03: another player is seen like anyone)
    const body = { x: d.rect.x, y: d.rect.y, w: d.rect.w, h: Math.max(1, d.rect.h - 14) };
    let behind = false;
    for (let j = i + 1; j < drawables.length; j++) {
      const o = drawables[j];
      if (o.kind !== "prop" || !o.canOcclude) continue;
      if (rectsOverlap(body, o.rect)) {
        behind = true;
        if (isPlayer) {
          d.occluded = true;
          o.occluder = true;
        }
      }
    }
    if (behind) client.behind.add(d.entity.id);
  }
}


// ---- the scene ----

let lastLinear = null;

// The tile grid, only in build and remove mode (docs/15): each tile's north
// and west edges as one-pixel lines, faint white, over the ground and under
// everything standing, unlit and unfogged so it reads at night.
const GRID_COLOR = [1, 1, 1, 0.12];
function emitGrid(tiles) {
  const flags = gl.FLAG_UNLIT | gl.FLAG_NOFOG;
  for (const [tx, ty] of tiles) {
    const p = iso.toScreen(tx, ty);
    const x = Math.round(p.x);
    const y = Math.round(p.y);
    const top = [x, y - iso.HH];
    const right = [x + iso.HW, y];
    const left = [x - iso.HW, y];
    for (const [a, b] of [[left, top], [top, right]]) {
      gl.poly([a, b, [b[0], b[1] + 1], [a[0], a[1] + 1]], GRID_COLOR, { world: [tx, ty], flags });
    }
  }
}

export function renderScene(args) {
  const { w, h, tiles, visible, entities, playerRoom, player = null, camera = null, drawAll = false, fog = true, ghost = null, hitShapes = null, grid = false, arrows = null, fire = null, marker = null, tileMark = null, highlight = null, tracks = null } = probe.override ? { ...args, ...probe.override } : args;
  ensureArea(w, h);
  hl.set(highlight); // the object under the cursor, outlined by the drawables below (#301)
  if (lastLinear !== night.linear) {
    gl.setLightSampling(night.linear);
    lastLinear = night.linear;
  }
  const cam = camera || player || { gx: 0, gy: 0 };
  const areaOrigin = buildArea(tiles, visible, drawAll || !fog, cam.gx, cam.gy);

  gl.begin((cam.gx + cam.gy) * 32); // the depth range follows the camera (docs/51 section 5)
  // The storeys (docs/49 section 6): the layers the viewer sees, lowest first, each lifted by its height; the ground's flat things first.
  const VL = (player && player.layer) || 0;
  const layers = layersFor(VL);
  const hidden = hiderFor(player);
  // A storey's own light, ambient, and fog (the second set of area textures): the viewer's layer when it is not the ground, else the
  // first storey in view; a storey besides those is lit as the open air (the sky's flag) until the light is kept per layer for all.
  const upperL = VL !== 0 ? VL : layers.find((l) => l > 0) ?? null;
  if (upperL !== null) buildStoreyArea(tilesOf(tiles, upperL), visible, drawAll || !fog, cam.gx, cam.gy, upperL);
  gl.setUpperSet(upperL !== null);
  if (layers[0] === 0) {
    emitGround(tiles);
    if (grid) emitGrid(tiles);
    emitRugs(tiles); // after the ground, before every standing drawable: the rugs lie under what stands on them (#327)
    if (tileMark) emitTileMark(tileMark); // on the ground: whatever stands on or before the tile is drawn over it
    if (tracks && tracks.length) emitTracks(tracks, drawAll ? null : visible); // game's prints, on the ground and in sight
  }
  const holes = [];
  let translucent = 0;
  let count = 0;
  for (const L of layers) {
    gl.setExtraFlags(L === 0 ? 0 : L === upperL ? gl.FLAG_UPPER : gl.FLAG_SKY);
    withLift(L * map.STOREY, () => map.withDrawLayer(L, () => {
      const tilesL = L ? tilesOf(tiles, L).filter(([x, y]) => !hidden(x, y, L)) : tiles.filter(([x, y]) => !hidden(x, y, 0));
      if (L) {
        // An upper floor's ground (or a cellar's), a quad a chunk with its depth written, and what lies flat on it just over it.
        gl.setPass(gl.PASS_STAND);
        emitFloors(tilesL, L, DEPTH_BIAS.liftedFloor, hidden);
        emitRugs(tilesL);
      }
      const roomHere = player && L === VL ? map.roomAt(Math.round(player.gx), Math.round(player.gy), L) : L === 0 ? playerRoom : 0;
      const drawables = [];
      wallDrawables(tilesL, visible, roomHere, drawables);
      postDrawables(tilesL, visible, roomHere, drawables);
      propDrawables(tilesL, visible, drawables);
      floorItemDrawables(tilesL, visible, drawables);
      stairDrawables(tilesL, L, DEPTH_BIAS.prop, drawables); // the stairs on this layer, dev art (docs/49 section 11)
      // The bodies on this layer, each a further `rise` up when it is on a stair, its picture made and drawn at that height.
      for (const e of entities) {
        if ((e.layer || 0) !== L) continue;
        const r = e.rise || 0;
        if (!r) {
          entityDrawables([e], visible, drawables, drawAll, player);
          continue;
        }
        const n0 = drawables.length;
        withLift(r, () => entityDrawables([e], visible, drawables, drawAll, player));
        for (let i = n0; i < drawables.length; i++) {
          const d = drawables[i];
          const emit = d.emit;
          d.emit = () => withLift(r, emit);
        }
      }
      if (L === 0) {
        arrowDrawables(arrows, visible, drawables);
        fireDrawables(fire, visible, drawables);
      }
      drawables.sort((a, b) => a.key - b.key);
      if (L === VL) {
        computeOcclusion(drawables, player);
        for (const d of drawables) if (d.occluded && d.rect) holes.push([d.rect.x + d.rect.w / 2, d.rect.y + d.rect.h * 0.45]);
      }
      // Every standing drawable sets its own depth surface as it emits; a flat one (an arrow's shadow) asks for the flat pass itself.
      for (const d of drawables) {
        if (probe.skip && probe.skip(d)) continue;
        gl.setPass(gl.PASS_STAND);
        const before = gl.passVertices(gl.PASS_TRANS);
        const marked = probe.mark && probe.mark.is(d);
        if (marked) gl.setMark(probe.mark.color);
        try {
          d.emit();
        } finally {
          if (marked) gl.setMark(null);
        }
        if (gl.passVertices(gl.PASS_TRANS) > before) translucent++;
      }
      count += drawables.length;
    }));
  }
  gl.setExtraFlags(0);
  lastStats.drawables = count;
  lastStats.translucent = translucent;
  // On top, with no depth test (docs/51 section 4; Primary's recommendation, a default: a ghost hidden behind a wall is useless).
  gl.setPass(gl.PASS_TOP);
  if (ghost) emitGhost(ghost);
  if (hitShapes) emitHitShapes(hitShapes);
  if (marker) emitMarker(marker);

  const pp = player ? iso.toScreen(player.gx, player.gy) : { x: -9999, y: -9999 };
  if (player) pp.y -= liftOf(player); // the night pool round the viewer at the height it stands
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
    softLight: night.softLight ? 1 : 0,
    debug: night.debug,
  });
  return count;
}
