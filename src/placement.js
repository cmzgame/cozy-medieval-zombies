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
import { idleFrame, getDef, getSheet } from "./assets.js";
import { showMessage } from "./ui/prompt.js";
import { rules } from "./rules.js";

// Reach was raised by a full tile on 2026-10-11 (Michael: easier).
export const PLACE_REACH = 2.6; // tiles from the player to a carried prop's anchor tile
export const BUILD_REACH = 2.6; // tiles from the player to the middle of a built edge
export const REMOVE_REACH = 2.6; // tiles from the player to the nearest part of what is removed
const EDGE_CLEARANCE = 0.45; // the player may not stand closer than this to an edge being built

// kind is null, "prop", "build", or "remove". ghost is what the renderer draws.
export const state = { active: false, kind: null, prop: null, build: null, ghost: null, turns: 0 };
// On a guest (docs/31/05 item 10, tier 3): the ghost is the replica's, and the click goes to the host as
// a command (main.js sets the sender), which performs it for the guest's player with its own reach.
let sender = null;
export function setSender(fn) {
  sender = fn;
}

// A guest's carried prop follows its record: the mode begins when the host says it carries, ends when
// it no longer does, and the ghost's prop is the replica's object as it is this frame.
export function syncCarried(player) {
  if (player.carrying) {
    if (state.kind !== "prop") beginProp(player.carrying);
    else state.prop = player.carrying;
  } else if (state.kind === "prop") end();
}

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

// ---- the carry rule ----

// A prop can be lifted unless it is rooted (a tree, a well), built in (a
// hearth, a torch post), or a fire that burns fuel (a campfire). A sprite's own
// `carry` flag, true or false, overrides the rule either way (docs/13).
export function canCarry(prop) {
  const d = getDef(prop.sprite);
  if (d.carry !== undefined) return !!d.carry;
  if (prop.wood || prop.water) return false;
  if (prop.fire && (prop.fire.room || prop.fire.holds || prop.fire.burns)) return false;
  return true;
}

// The screen rectangle a prop's slice at (tx, ty) covers, for hit tests.
export function propRect(prop, tx, ty) {
  const sheet = getSheet(prop.sprite, prop.tiles.length);
  const i = prop.tiles.findIndex(([px, py]) => px === tx && py === ty);
  const f = sheet.frames[idleFrame(sheet, prop, Math.max(0, i))];
  if (!f) return null;
  const p = iso.toScreen(tx, ty);
  const off = prop.offset || [0, 0];
  const an = (sheet.frameAnchors && sheet.frameAnchors[idleFrame(sheet, prop, Math.max(0, i))]) || sheet.anchor;
  const x = Math.round(p.x) + off[0] - an[0];
  const y = Math.round(p.y) + off[1] - an[1];
  const b = sheet.bounds;
  return b ? { x: x + b.x, y: y + b.y, w: b.w, h: b.h } : { x, y, w: f[2], h: f[3] };
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
  if (rules.freeBuilding) return {};
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
  state.turns = 0;
}

export function beginBuild(what) {
  if (!buildData[what]) return false;
  state.kind = "build";
  state.build = { what };
  state.prop = null;
  state.active = true;
  return true;
}

// The removal tool: highlight what the player placed or built, click to destroy.
export function beginRemove() {
  state.kind = "remove";
  state.build = null;
  state.prop = null;
  state.active = true;
}

// Escape, or N again. Returns true if a mode was open and is now closed.
// Carrying cannot be cancelled: the prop stays in the hands, so prop mode
// answers false.
export function cancel() {
  if (state.kind !== "build" && state.kind !== "remove") return false;
  end();
  return true;
}

function end() {
  state.kind = null;
  state.prop = null;
  state.build = null;
  state.active = false;
  state.ghost = null;
  state.turns = 0;
}

export function ghost() {
  return state.ghost;
}

// R turns the carried prop's footprint: [w, h] becomes [h, w]. The slices keep
// their frames (the dev art is boxes); canPutDown and placeProp read the
// prop's footprint, so E in front uses the turned shape too.
// R: a prop with facings turns to the next one (docs/17, Zomboid style);
// otherwise its footprint turns.
function turn(prop) {
  state.turns = (state.turns || 0) + 1; // for a guest's command: the host turns its copy the same number of times
  const sheet = getSheet(prop.sprite, prop.tiles.length);
  if (sheet.facings && sheet.facings.length > 1) {
    const i = sheet.facings.indexOf(prop.facing);
    prop.facing = sheet.facings[(i + 1) % sheet.facings.length];
    // A two-tile piece's facing sets its footprint's axis.
    const fp = sheet.facingFootprint && sheet.facingFootprint[prop.facing];
    if (fp) prop.footprint = [fp[0], fp[1]];
    return;
  }
  const [w, h] = prop.footprint;
  prop.footprint = [h, w];
}

// Each logic step: follow the carried prop, read R, and put the ghost where
// the cursor is.
export function update(player) {
  if (player.carrying) {
    if (state.kind === "build" || state.kind === "remove") end(); // hands full: no building or removing
    if (state.kind !== "prop" || state.prop !== player.carrying) beginProp(player.carrying);
    if (input.wasPressed("KeyR")) turn(player.carrying);
  } else if (state.kind === "prop") {
    end();
  }
  if (state.kind === "prop") state.ghost = propGhost(player);
  else if (state.kind === "build") state.ghost = buildGhost(player);
  else if (state.kind === "remove") state.ghost = removeGhost(player);
  else state.ghost = null;
}

// ---- removal ----

function pointInRect(x, y, r) {
  return !!r && x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h;
}

// Whether a screen point is inside a convex quad given in order.
function pointInQuad(px, py, q) {
  let sign = 0;
  for (let i = 0; i < 4; i++) {
    const a = q[i];
    const b = q[(i + 1) % 4];
    const c = (b[0] - a[0]) * (py - a[1]) - (b[1] - a[1]) * (px - a[0]);
    if (c !== 0) {
      if (sign === 0) sign = Math.sign(c);
      else if (Math.sign(c) !== sign) return false;
    }
  }
  return true;
}

// The face of a wall on screen, as the renderer draws it (render.js makeWall).
function wallFace(tx, ty, edge, wall) {
  const p = iso.toScreen(tx, ty);
  const x = Math.round(p.x);
  const y = Math.round(p.y);
  const h = getSheet(wall.sprite).wallHeight || 72;
  const a = edge === "n" ? [x, y - iso.HH] : [x - iso.HW, y];
  const b = edge === "n" ? [x + iso.HW, y] : [x, y - iso.HH];
  return [a, b, [b[0], b[1] - h], [a[0], a[1] - h]];
}

// What the removal tool would take at a screen point: the front-most thing
// the player placed (a prop that can be carried) or built (a wall, door, or
// window with `built` set), or null. Authored walls and rooted things are not
// candidates, so they never highlight.
export function removalTarget(sx, sy) {
  let best = null;
  const consider = (t, depth) => {
    if (!best || depth > best.depth) best = { ...t, depth };
  };
  const g0 = iso.toGrid(sx, sy);
  const cx = Math.round(g0.gx);
  const cy = Math.round(g0.gy);
  // Props: on their tile, or under their drawn rectangle in the tiles around.
  const seen = new Set();
  for (let dy = -3; dy <= 1; dy++) {
    for (let dx = -3; dx <= 1; dx++) {
      const prop = map.tileAt(cx + dx, cy + dy).prop;
      if (!prop || seen.has(prop) || !canCarry(prop)) continue;
      const onTile = dx === 0 && dy === 0;
      if (!onTile && !pointInRect(sx, sy, propRect(prop, cx + dx, cy + dy))) continue;
      seen.add(prop);
      consider({ type: "prop", prop }, Math.max(...prop.tiles.map(([x, y]) => x + y)));
    }
  }
  // Walls: the face under the cursor, looking up from the ground tiles it could stand on.
  const walls = new Set();
  for (let k = 0; k <= 72; k += 12) {
    const g = iso.toGrid(sx, sy + k);
    const gx = Math.round(g.gx);
    const gy = Math.round(g.gy);
    for (let ty = gy - 1; ty <= gy + 1; ty++) {
      for (let tx = gx - 1; tx <= gx + 1; tx++) {
        for (const edge of ["n", "w"]) {
          const wall = map.tileAt(tx, ty)[edge];
          if (!wall || !wall.built || walls.has(wall)) continue;
          if (!pointInQuad(sx, sy, wallFace(tx, ty, edge, wall))) continue;
          walls.add(wall);
          consider({ type: "wall", tx, ty, edge, wall }, tx + ty - 0.5);
        }
      }
    }
  }
  // The edge on the ground under the cursor, as building picks it, a little behind a face hit.
  const e = pickEdge(g0.gx, g0.gy);
  const ew = map.tileAt(e.tx, e.ty)[e.edge];
  if (ew && ew.built && !walls.has(ew)) consider({ type: "wall", tx: e.tx, ty: e.ty, edge: e.edge, wall: ew }, e.tx + e.ty - 0.75);
  return best;
}

function targetReach(player, t) {
  if (t.type === "wall") {
    const [mx, my] = map.edgeMid(t.tx, t.ty, t.edge);
    return Math.hypot(player.gx - mx, player.gy - my);
  }
  return Math.min(...t.prop.tiles.map(([x, y]) => Math.hypot(player.gx - x, player.gy - y)));
}

function removeGhost(player) {
  const m = input.getMouse();
  if (!m.inside) return null;
  const target = removalTarget(m.x, m.y);
  if (!target) return null;
  const ok = targetReach(player, target) <= REMOVE_REACH;
  return { kind: "remove", target, ok, reason: ok ? "" : "Too far" };
}

function targetName(t) {
  if (t.type === "prop") return t.prop.sprite.replace(/_/g, " ");
  const d = buildData[t.wall.kind];
  return (d && d.label ? d.label : t.wall.kind).toLowerCase();
}

// Destroy it. A container spills what it held onto the floor; a wall takes its boards with it.
function destroy(t) {
  if (t.type === "prop") {
    const prop = t.prop;
    if (prop.bag) {
      for (const e of [...prop.bag.items]) map.dropItem(prop.tile[0], prop.tile[1], e);
      prop.bag.items.length = 0;
    }
    map.removeProp(prop);
  } else {
    map.destroyWall(t.tx, t.ty, t.edge);
  }
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
    if (sender) {
      // The host places what the guest carries, turned as the guest turned it (the R presses, in order).
      sender({ kind: "prop", tx: g.tx, ty: g.ty, turns: state.turns });
      end();
      return true;
    }
    map.placeProp(state.prop, g.tx, g.ty);
    player.carrying = null;
    end();
    return true;
  }
  if (state.kind === "remove") {
    // Every click in this mode is the tool's, over a target or not.
    const g = state.ghost;
    if (!g) return true;
    if (!g.ok) {
      showMessage(g.reason);
      return true;
    }
    if (sender) {
      sender({ kind: "remove", target: addressOf(g.target) });
      return true;
    }
    destroy(g.target);
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
    if (sender) {
      sender({ kind: "build", what: g.wallKind, tx: g.tx, ty: g.ty, edge: g.edge });
      return true;
    }
    startBuild(player, g);
    return true;
  }
  return false;
}

// A removal target as an address: a prop by id, a wall by its edge.
function addressOf(t) {
  return t.type === "prop" ? { type: "prop", id: t.prop.id } : { type: "wall", tx: t.tx, ty: t.ty, edge: t.edge };
}

// A guest's placement on the host (net.js hooks.place): the same rules its own click meets, the reach
// checked here against the guest's player, the refusal said to it through the acting player.
export function performPlacement(player, cmd) {
  if (!player || !cmd) return false;
  if (cmd.kind === "prop") {
    const prop = player.carrying;
    if (!prop) return false;
    const tx = Math.round(Number(cmd.tx));
    const ty = Math.round(Number(cmd.ty));
    if (!Number.isFinite(tx) || !Number.isFinite(ty)) return false;
    const turns = ((Math.round(Number(cmd.turns)) || 0) % 4 + 4) % 4;
    for (let i = 0; i < turns; i++) turn(prop);
    if (Math.hypot(player.gx - tx, player.gy - ty) > PLACE_REACH) {
      showMessage("Too far");
      return true;
    }
    if (!canPutDown(player, tx, ty)) {
      showMessage("No room");
      return true;
    }
    map.placeProp(prop, tx, ty);
    player.carrying = null;
    return true;
  }
  if (cmd.kind === "build") {
    const what = typeof cmd.what === "string" && buildData[cmd.what] ? cmd.what : null;
    const tx = Math.round(Number(cmd.tx));
    const ty = Math.round(Number(cmd.ty));
    const edge = cmd.edge === "n" || cmd.edge === "w" ? cmd.edge : null;
    if (!what || !edge || !Number.isFinite(tx) || !Number.isFinite(ty)) return false;
    if (player.action) return true;
    const why = buildReason(player, what, tx, ty, edge);
    if (why) {
      showMessage(why);
      return true;
    }
    startBuild(player, { wallKind: what, tx, ty, edge });
    return true;
  }
  if (cmd.kind === "remove") {
    const a = cmd.target;
    if (!a) return false;
    let t = null;
    if (a.type === "prop") {
      const prop = typeof a.id === "string" ? map.propById(a.id) : null;
      if (prop && canCarry(prop) && map.tileAt(prop.tile[0], prop.tile[1]).prop === prop) t = { type: "prop", prop };
    } else if (a.type === "wall" && (a.edge === "n" || a.edge === "w")) {
      const tx = Math.round(Number(a.tx));
      const ty = Math.round(Number(a.ty));
      const wall = Number.isFinite(tx) && Number.isFinite(ty) ? map.tileAt(tx, ty)[a.edge] : null;
      if (wall && wall.built) t = { type: "wall", tx, ty, edge: a.edge, wall };
    }
    if (!t) return false;
    if (targetReach(player, t) > REMOVE_REACH) {
      showMessage("Too far");
      return true;
    }
    destroy(t);
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
  if (g.kind === "remove") {
    const t = g.target;
    const [mx, my] = t.type === "wall" ? map.edgeMid(t.tx, t.ty, t.edge) : t.prop.tile;
    if (!g.ok) return { label: g.reason, mx, my, progress: null, enabled: false };
    return { label: `Click to remove ${targetName(t)} · Esc cancel`, mx, my, progress: null, enabled: true };
  }
  const [mx, my] = map.edgeMid(g.tx, g.ty, g.edge);
  if (!g.ok) return { label: g.reason, mx, my, progress: null, enabled: false };
  return { label: `Click to build (${costText(g.wallKind)}) · Esc cancel`, mx, my, progress: null, enabled: true };
}
