// Placement (docs/13-placement.md): one mode for putting things in the world.
// A ghost follows the cursor, R turns it, it is green where it may go and red
// where it may not, and a left click puts it there. Two kinds:
//
//   prop   the mode a player is in whenever they carry furniture;
//   build  a wall, door, or window on the tile edge under the cursor, paid for
//          in logs or planks (data/build.json) unless the Free building
//          setting is on, and built over a few seconds like boarding.
//
// This module reads the world (map, iso, input, inventory) and writes only the
// carried prop and, on confirm, the map and the player's stores. It does not
// import interact.js (interact imports it); the timed action is started
// through the runner main.js hands in with init().

import * as iso from "./iso.js";
import * as input from "./input.js";
import * as map from "./map.js";
import * as inventory from "./inventory.js";
import * as items from "./items.js";
import * as settings from "./settings.js";
import { showMessage } from "./ui/prompt.js";

export const PLACE_REACH = 1.6; // tiles from the player to a carried prop's anchor tile
export const BUILD_REACH = 1.6; // tiles from the player to the middle of a built edge
const EDGE_CLEARANCE = 0.45; // the player may not stand closer than this to an edge being built

// kind is null, "prop", or "build". ghost is what the renderer draws.
export const state = { active: false, kind: null, prop: null, build: null, ghost: null };

let buildData = {}; // data/build.json
let startAction = null; // interact.startAction, from init()

export function init({ startAction: run }) {
  startAction = run;
}

export function setBuildData(data) {
  buildData = data || {};
}

// What can be built, for the palette: [{ id, label, sprite, cost, seconds }].
export function buildKinds() {
  return Object.entries(buildData).map(([id, d]) => ({ id, ...d }));
}

// ---- carrying: where a prop may stand ----

// Whether the carried prop could stand with its anchor at (tx, ty): every
// footprint tile clear, walkable, not under the player, and no wall running
// between two tiles of the same prop (a bed does not straddle a wall).
export function canPutDown(player, tx, ty) {
  const prop = player.carrying;
  if (!prop) return false;
  const [w, h] = prop.footprint;
  for (let dy = 0; dy < h; dy++) {
    for (let dx = 0; dx < w; dx++) {
      const x = tx + dx;
      const y = ty + dy;
      const t = map.tileAt(x, y);
      if (t.prop || !map.isWalkableTile(x, y)) return false;
      if (Math.hypot(player.gx - x, player.gy - y) < 0.7) return false;
      if (dx > 0 && map.wallBetween(x - 1, y, x, y)) return false;
      if (dy > 0 && map.wallBetween(x, y - 1, x, y)) return false;
    }
  }
  return true;
}

// The tile in front of the player, for E.
export function putDownTarget(player) {
  const [dx, dy] = iso.DIRS[player.facing] || [0, 1];
  return [Math.round(player.gx + dx), Math.round(player.gy + dy)];
}

// ---- building: costs ----

// What a build costs now: nothing while Free building is on.
export function costOf(what) {
  if (settings.get("freeBuilding")) return {};
  return (buildData[what] && buildData[what].cost) || {};
}

function noun(id, n) {
  const name = items.hasItemDef(id) ? items.getItem(id).name.toLowerCase() : id;
  return n === 1 ? name : `${name}s`;
}

// "1 log", "3 planks", or "free".
export function costText(what) {
  const cost = costOf(what);
  const parts = Object.entries(cost).map(([id, n]) => `${n} ${noun(id, n)}`);
  return parts.length ? parts.join(", ") : "free";
}

// The first thing the player lacks for a build, as "Need 3 planks", or "".
export function shortfall(player, what) {
  for (const [id, n] of Object.entries(costOf(what))) {
    if (inventory.countAll(player, id) < n) return `Need ${n} ${noun(id, n)}`;
  }
  return "";
}

function spend(player, what) {
  for (const [id, n] of Object.entries(costOf(what))) inventory.takeAll(player, id, n);
}

// ---- building: edges ----

// The edge under a fractional grid point: the nearest of the four sides of the
// tile it is in. Tile centres sit on whole numbers, so the tile's sides are a
// half step out. A tile's own `n` edge is on its upper-right side on screen
// and its `w` edge on its upper-left; the lower two sides belong to the
// neighbours (the `n` of the tile below, the `w` of the tile to the right).
export function pickEdge(gx, gy) {
  const tx = Math.round(gx);
  const ty = Math.round(gy);
  const u = gx - tx;
  const v = gy - ty;
  const sides = [
    { d: v + 0.5, tx, ty, edge: "n" },
    { d: u + 0.5, tx, ty, edge: "w" },
    { d: 0.5 - v, tx, ty: ty + 1, edge: "n" },
    { d: 0.5 - u, tx: tx + 1, ty, edge: "w" },
  ];
  sides.sort((a, b) => a.d - b.d);
  const s = sides[0];
  return { tx: s.tx, ty: s.ty, edge: s.edge };
}

// Distance from a point to the segment that is an edge on the ground.
function distToEdge(px, py, tx, ty, edge) {
  const [x0, y0, x1, y1] = edge === "n" ? [tx - 0.5, ty - 0.5, tx + 0.5, ty - 0.5] : [tx - 0.5, ty - 0.5, tx - 0.5, ty + 0.5];
  const cx = Math.max(Math.min(x0, x1), Math.min(Math.max(x0, x1), px));
  const cy = Math.max(Math.min(y0, y1), Math.min(Math.max(y0, y1), py));
  return Math.hypot(px - cx, py - cy);
}

// Why a thing cannot be built there, or "" if it can. Reach is separate so a
// build already under way is not cancelled by a small drift.
function buildBlock(player, what, tx, ty, edge) {
  if (map.tileAt(tx, ty)[edge]) return "Already a wall";
  if (!map.canBuildWall(tx, ty, edge, what)) return "No room";
  if (distToEdge(player.gx, player.gy, tx, ty, edge) < EDGE_CLEARANCE) return "Step back";
  return shortfall(player, what);
}

function buildReason(player, what, tx, ty, edge) {
  const [mx, my] = map.edgeMid(tx, ty, edge);
  if (Math.hypot(player.gx - mx, player.gy - my) > BUILD_REACH) return "Too far";
  return buildBlock(player, what, tx, ty, edge);
}

// ---- the mode ----

export function beginProp(prop) {
  state.kind = "prop";
  state.prop = prop;
  state.build = null;
  state.active = true;
}

export function beginBuild(what) {
  if (!buildData[what]) return false;
  state.kind = "build";
  state.build = { what };
  state.prop = null;
  state.active = true;
  return true;
}

// Escape, or N again. Returns true if a mode was open and is now closed.
// Carrying cannot be cancelled: the prop stays in the hands, so prop mode
// answers false.
export function cancel() {
  if (state.kind !== "build") return false;
  end();
  return true;
}

function end() {
  state.kind = null;
  state.prop = null;
  state.build = null;
  state.active = false;
  state.ghost = null;
}

export function ghost() {
  return state.ghost;
}

// R turns the carried prop's footprint: [w, h] becomes [h, w]. The slices keep
// their frames (the dev art is boxes); canPutDown and placeProp read the
// prop's footprint, so E in front uses the turned shape too.
function turn(prop) {
  const [w, h] = prop.footprint;
  prop.footprint = [h, w];
}

// Each logic step: follow the carried prop, read R, and put the ghost where
// the cursor is.
export function update(player) {
  if (player.carrying) {
    if (state.kind === "build") end(); // hands full: no building
    if (state.kind !== "prop" || state.prop !== player.carrying) beginProp(player.carrying);
    if (input.wasPressed("KeyR")) turn(player.carrying);
  } else if (state.kind === "prop") {
    end();
  }
  if (state.kind === "prop") state.ghost = propGhost(player);
  else if (state.kind === "build") state.ghost = buildGhost(player);
  else state.ghost = null;
}

function propGhost(player) {
  const prop = state.prop;
  const m = input.getMouse();
  if (!m.inside) return null;
  const g = iso.toGrid(m.x, m.y);
  const [w, h] = prop.footprint;
  // The footprint is centred on the cursor: its centre is the anchor plus half its extent.
  const tx = Math.round(g.gx - (w - 1) / 2);
  const ty = Math.round(g.gy - (h - 1) / 2);
  let reason = "";
  if (Math.hypot(player.gx - tx, player.gy - ty) > PLACE_REACH) reason = "Too far";
  else if (!canPutDown(player, tx, ty)) reason = "No room";
  return { kind: "prop", prop, tx, ty, footprint: [w, h], ok: reason === "", reason };
}

function buildGhost(player) {
  const m = input.getMouse();
  if (!m.inside) return null;
  const g = iso.toGrid(m.x, m.y);
  const { tx, ty, edge } = pickEdge(g.gx, g.gy);
  const what = state.build.what;
  const reason = buildReason(player, what, tx, ty, edge);
  return { kind: "wall", tx, ty, edge, wallKind: what, sprite: buildData[what].sprite, ok: reason === "", reason };
}

// The left click. Returns true if this mode took it. A red ghost takes the
// click too and says why, so a click meant for placing never swings or walks.
export function tryConfirm(player) {
  if (state.kind === "prop") {
    const g = state.ghost;
    if (!g) return false;
    if (!g.ok) {
      showMessage(g.reason);
      return true;
    }
    map.placeProp(state.prop, g.tx, g.ty);
    player.carrying = null;
    end();
    return true;
  }
  if (state.kind === "build") {
    const g = state.ghost;
    if (!g) return false;
    if (player.action) return true; // one build at a time
    if (!g.ok) {
      showMessage(g.reason);
      return true;
    }
    startBuild(player, g);
    return true;
  }
  return false;
}

// A timed action, like boarding: the bar runs, moving cancels it, nothing is
// spent until it completes, and everything is checked again then.
function startBuild(player, g) {
  const d = buildData[g.wallKind];
  const [mx, my] = map.edgeMid(g.tx, g.ty, g.edge);
  const what = g.wallKind;
  const action = {
    kind: "build",
    label: `Building ${d.label.toLowerCase()}`,
    tiles: map.edgeTiles(g.tx, g.ty, g.edge),
    mx,
    my,
    range: BUILD_REACH + 0.6,
    duration: d.seconds || 0,
    enabled: true,
    simple: false,
    perform() {
      const why = buildBlock(player, what, g.tx, g.ty, g.edge);
      if (why) {
        showMessage(why);
        return false;
      }
      spend(player, what);
      return map.buildWall(g.tx, g.ty, g.edge, what, d.sprite);
    },
  };
  if (startAction) startAction(player, action);
  else action.perform();
}

// The prompt at the ghost, or null when there is none to show.
export function prompt() {
  const g = state.ghost;
  if (!g) return null;
  if (g.kind === "prop") {
    if (!g.ok) return { label: g.reason, mx: g.tx, my: g.ty, progress: null, enabled: false };
    return { label: "Click to place · R turn · E in front", mx: g.tx, my: g.ty, progress: null, enabled: true };
  }
  const [mx, my] = map.edgeMid(g.tx, g.ty, g.edge);
  if (!g.ok) return { label: g.reason, mx, my, progress: null, enabled: false };
  return { label: `Click to build (${costText(g.wallKind)}) · Esc cancel`, mx, my, progress: null, enabled: true };
}
