// Placement (docs/13-placement.md): one mode for putting things in the world.
// A ghost follows the cursor, R turns it, it is green where it may go and red
// where it may not, and a left click puts it there. Two kinds:
//
//   prop   the mode a player is in whenever they carry furniture;
//   rug    a rug from the bag, laid flat on the floor (#327; src/rugs.js): the ghost over its 2 by 3, R turns it, a click lays it;
//   painting  a painting from the bag, hung on the face of the wall under the cursor (#326; src/paintings.js): the ghost on the wall, a click hangs it;
//   setdown  an item from the bag set down on the tile under the cursor as its prop (a Campfire item, a torch post, a decoration;
//            docs/43 sections 3 and 4; src/campfire.js, src/setdown.js), by the prop's rule for where it stands;
//   torch  a torch from the hands, the belt, or the bag (Place torch), put on the face of the wall under the cursor as a painting is, on a bracket
//          drawn with it (docs/43 section 4, #523; src/setdown.js);
//   build  a wall, door, or window on the tile edge under the cursor, paid for, or a prop on its tiles (the Fireplace, the fire pit: an entry of `kind` prop),
//          in logs or planks (data/build.json) unless the Free building
//          setting is on, and built over a few seconds like boarding.
//
// This module reads the world (map, iso, input, inventory) and writes only the
// carried prop and, on confirm, the map and the player's stores. It does not
// import interact.js (interact imports it); the timed action is started
import { emit } from "./events.js";
// through the runner main.js hands in with init().

import * as iso from "./iso.js";
import * as input from "./input.js";
import * as map from "./map.js";
import * as inventory from "./inventory.js";
import * as items from "./items.js";
import { idleFrame, getDef, getSheet } from "./assets.js";
import { propName, propIsPlural } from "./prop-names.js"; // a prop's name in words, the one helper
import { showMessage } from "./ui/prompt.js";
import { rules } from "./rules.js";
import * as tuning from "./tuning.js";
import { reachProblem, TOO_FAR } from "./reach.js";
import * as rugs from "./rugs.js"; // a rug laid from the bag (#327)
import * as paintings from "./paintings.js"; // a painting hung on a wall from the bag (#326)
import * as woods from "./woods.js"; // a wall in a wood, and a door or window of another wood than its wall (#334)
import * as stations from "./stations.js"; // a made prop's recipe, for what taking it apart gives back (docs/43, section 2)
import * as campfire from "./campfire.js"; // a campfire made at the workbench, set down from the bag, picked up again (docs/43, section 3)
import * as setdown from "./setdown.js"; // an item set down as its prop, a torch put on a wall (docs/43, section 4)
import * as round from "./round.js"; // a round room's geometry (docs/50)

// Reach was raised by a full tile on 2026-10-11 (Michael: easier).
export const PLACE_REACH = 2.6; // tiles from the player to a carried prop's anchor tile
export const BUILD_REACH = 2.6; // tiles from the player to the middle of a built edge
export const REMOVE_REACH = 2.6; // tiles from the player to the nearest part of what is removed
const EDGE_CLEARANCE = 0.45; // the player may not stand closer than this to an edge being built

// kind is null, "prop", "rug", "painting", "build", or "remove". ghost is what the renderer draws.
export const state = { active: false, kind: null, prop: null, build: null, rug: null, painting: null, setdown: null, torch: null, ghost: null, turns: 0 };
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

// What can be built: [{ id, label, sprite, cost, seconds }]. Every kind, whatever the rules: the replica must be able to draw each.
export function buildKinds() {
  return Object.entries(buildData).map(([id, d]) => ({ id, ...d }));
}

// What the palette offers now: a region's wood (`region` in its entry: Winter Pine and Bloodbark, #334) only while Free building is on.
export function paletteKinds() {
  return buildKinds().filter((k) => !(k.region || k.dev) || rules.freeBuilding); // and what is not in the game yet (`dev`: the round stone wall, Michael 2026-10-27)
}

// ---- round rooms (docs/50 section 5; Michael, 2026-10-27: "A few on the map, buildable by dev settings, otherwise not in the game yet
// until we settle on cost, etc.") ----
// A palette entry of `kind` round builds a ring of its sprite (stone only), 5 or 7 across: the ghost's square starts at the tile where the
// press began and grows to 7 as the drag goes out; the release builds it. Its cost is its entry's `cost` for each edge of the outline (20 at
// 5, 28 at 7), never charged while Free building is on, the only time it is offered.
export const isRoundBuild = (what) => !!(buildData[what] && buildData[what].kind === "round");

// What a ring costs: its entry's cost for each edge it lays (one already walled is taken in, free), or for a whole outline when no square is named
// (the palette's row).
function roundCost(what, n, at = null) {
  const per = costOf(what);
  const edges = at ? map.ringNewEdges(at[0], at[1], n, at[2] || 0) : round.shape(0, 0, n).outline.length;
  return Object.fromEntries(Object.entries(per).map(([id, k]) => [id, k * edges]));
}

function roundShortfall(player, what, n, at = null) {
  const tool = buildData[what] && buildData[what].tool;
  const noTool = tool ? toolProblem(player, tool) : null;
  if (noTool) return noTool;
  for (const [id, k] of Object.entries(roundCost(what, n, at))) if (inventory.countAll(player, id) < k) return `Need ${k} ${noun(id, k)}`;
  return "";
}

// The ring's square for a drag from `from` to `to` (tiles): 7 once the drag covers seven tiles either way, else 5; the square on the drag's side.
export function roundSquare(from, to) {
  const dx = to[0] - from[0];
  const dy = to[1] - from[1];
  const n = Math.max(Math.abs(dx), Math.abs(dy)) + 1 >= 7 ? 7 : 5;
  return { x0: dx < 0 ? from[0] - n + 1 : from[0], y0: dy < 0 ? from[1] - n + 1 : from[1], n };
}

// The ring's walls and its curve as ground segments: what no body may stand across when it goes up.
function ringSegments(x0, y0, n) {
  const s = round.shape(x0, y0, n);
  const segs = s.outline.map(([tx, ty, e]) => (e === "n" ? [tx - 0.5, ty - 0.5, tx + 0.5, ty - 0.5] : [tx - 0.5, ty - 0.5, tx - 0.5, ty + 0.5]));
  return segs.concat(s.chords);
}

function roundBlock(player, what, x0, y0, n) {
  const d = buildData[what];
  if (d.dev && !rules.freeBuilding) return "Round walls are not in the game yet";
  const why = map.ringProblem(x0, y0, n, player.layer || 0);
  if (why) return why;
  const segs = ringSegments(x0, y0, n);
  if (stations.bodyNearSegments(segs, 0.45, player.layer || 0)) {
    const me = segs.some(([ax, ay, bx, by]) => distToSeg(player.gx, player.gy, ax, ay, bx, by) < 0.45);
    return me ? "Step back" : "Someone is in the way";
  }
  return roundShortfall(player, what, n, [x0, y0, player.layer || 0]);
}

function distToSeg(px, py, ax, ay, bx, by) {
  const vx = bx - ax;
  const vy = by - ay;
  const t = Math.max(0, Math.min(1, ((px - ax) * vx + (py - ay) * vy) / (vx * vx + vy * vy || 1)));
  return Math.hypot(px - ax - vx * t, py - ay - vy * t);
}

// The nearest edge of the ring's outline to the player, and how far its middle is.
function nearestOutline(player, x0, y0, n) {
  let best = null;
  for (const [tx, ty, e] of round.shape(x0, y0, n).outline) {
    const [mx, my] = map.edgeMid(tx, ty, e);
    const dd = Math.hypot(player.gx - mx, player.gy - my);
    if (!best || dd < best.d) best = { tx, ty, edge: e, mx, my, d: dd };
  }
  return best;
}

function roundReason(player, what, x0, y0, n) {
  if (nearestOutline(player, x0, y0, n).d > BUILD_REACH) return "Too far";
  return roundBlock(player, what, x0, y0, n);
}

function roundGhost(player, what) {
  const m = input.getMouse();
  if (!m.inside) return null;
  const g = iso.toGrid(m.x, m.y);
  const cur = [Math.round(g.gx), Math.round(g.gy)];
  const { x0, y0, n } = roundSquare(state.build.from || cur, cur);
  const reason = roundReason(player, what, x0, y0, n);
  return { kind: "round", wallKind: what, x0, y0, n, layer: player.layer || 0, sprite: buildData[what].sprite, ok: reason === "", reason, dragging: !!state.build.from };
}

// The ring built, timed as a wall is: nothing spent until the bar completes, everything checked again then.
function startRoundBuild(player, what, x0, y0, n) {
  const d = buildData[what];
  const near = nearestOutline(player, x0, y0, n);
  const action = {
    kind: "build",
    label: `Building ${d.label.toLowerCase()}`,
    tiles: map.edgeTiles(near.tx, near.ty, near.edge),
    mx: near.mx,
    my: near.my,
    range: BUILD_REACH + 0.6,
    duration: (d.seconds || 0) * (n === 7 ? 1.4 : 1),
    enabled: true,
    simple: false,
    perform() {
      const why = roundBlock(player, what, x0, y0, n);
      if (why) {
        showMessage(why);
        return false;
      }
      for (const [id, k] of Object.entries(roundCost(what, n, [x0, y0, player.layer || 0]))) inventory.takeAll(player, id, k);
      return !!map.buildRing(x0, y0, n, d.sprite, player.layer || 0, { built: true, free: !!rules.freeBuilding });
    },
  };
  if (startAction) startAction(player, action);
  else action.perform();
}

// What a ring gives back taken apart: half its edges' cost (none if it was free), and its doors' and windows' as they would give alone.
function ringParts(ring) {
  const what = Object.keys(buildData).find((k) => isRoundBuild(k) && buildData[k].sprite === ring.sprite);
  const per = what ? buildData[what].cost || {} : {};
  const s = round.shape(ring.x0, ring.y0, ring.n);
  const total = {};
  if (!ring.free) for (const [id, k] of Object.entries(per)) total[id] = (total[id] || 0) + Math.floor((k * map.ringOwnEdges(ring)) / 2); // the edges it laid, not a wall it took in
  for (const [tx, ty, e] of s.doors) {
    const w = map.tileAt(tx, ty, ring.layer)[e];
    if (!w || w.kind === "wall" || !w.built || w.roundTaken) continue; // a door the ring took in stays when it goes (map.removeRing): nothing back for it
    for (const b of partsOf({ type: "wall", tx, ty, edge: e, wall: w }).back) total[b.id] = (total[b.id] || 0) + b.count;
  }
  return { back: Object.entries(total).filter(([, k]) => k > 0).map(([id, count]) => ({ id, count })), tool: (what && buildData[what].tool) || tuning.world.boardTool };
}

// ---- the storeys in building (docs/49 sections 5 and 6) ----
// What is built goes on the builder's own storey: the cursor is read on that floor (its storeys lifted on screen, as the renderer draws it),
// and every read and write of the map names the layer.
const layerOf = (player) => (player && player.layer) || 0;
const NOT_UPSTAIRS = "Not upstairs yet"; // what is read on the ground's tiles alone (a rug, a painting, a set-down, a torch on a wall, a palette prop)
function cursorGrid(player) {
  const m = input.getMouse();
  return iso.toGrid(m.x, m.y + layerOf(player) * map.STOREY);
}

// ---- floors (docs/49 section 5; Michael, 2026-10-27, `02` "Floors are built a tile at a time, with no physics") ----
// A palette entry of `kind` floor lays its `sprite` a tile at a time: a drag lays the rectangle from the press to the release, each tile its
// own build with its own refusal (map.floorBuildProblem), the ghost each tile green or red. On a storey a tile touching a floor already there,
// or one laid earlier in the same drag, may be laid, so a floor grows out from a lone landing.
export const isFloorBuild = (what) => !!(buildData[what] && buildData[what].kind === "floor");
export const isStairBuild = (what) => !!(buildData[what] && buildData[what].kind === "stair");
const MAX_DRAG = 12; // tiles a side of a floor's drag

// The rectangle's tiles, each [x, y, reason]: laid in rings out from what is walkable already, so a tile's neighbour laid earlier counts.
function floorPlan(player, what, x0, y0, x1, y1) {
  const L = layerOf(player);
  const id = buildData[what].sprite;
  const xa = Math.min(x0, x1);
  const ya = Math.min(y0, y1);
  const xb = Math.min(Math.max(x0, x1), xa + MAX_DRAG - 1);
  const yb = Math.min(Math.max(y0, y1), ya + MAX_DRAG - 1);
  const todo = [];
  for (let y = ya; y <= yb; y++) for (let x = xa; x <= xb; x++) todo.push([x, y]);
  // Within reach by distance and a clear line from where the player stands (reach.js; the review of #549: never through a wall).
  const farMemo = new Map();
  const far = (x, y) => {
    const k = `${x},${y}`;
    if (!farMemo.has(k)) farMemo.set(k, reachProblem(player, [[x, y]], BUILD_REACH + 0.5, L) || "");
    return farMemo.get(k);
  };
  const grows = new Set();
  const key = (x, y) => L * 4294967296 + (x + 32768) * 65536 + (y + 32768); // as map.js tileKey3
  const ok = new Set();
  let more = true;
  while (more) {
    more = false;
    for (const [x, y] of todo) {
      if (ok.has(key(x, y)) || far(x, y)) continue;
      if (!map.floorBuildProblem(x, y, id, L, grows)) {
        ok.add(key(x, y));
        grows.add(key(x, y));
        more = true;
      }
    }
  }
  // What it costs: a tile's cost each, the tiles that cannot be paid for refused.
  const per = costOf(what);
  let afford = Infinity;
  for (const [item, k] of Object.entries(per)) afford = Math.min(afford, Math.floor(inventory.countAll(player, item) / k));
  const tool = buildData[what].tool ? toolProblem(player, buildData[what].tool) : null;
  const notYet = buildData[what].dev && !rules.freeBuilding ? "Floors are not in the game yet" : ""; // Free building only for now (as the round stone wall)
  let paid = 0;
  return todo.map(([x, y]) => {
    if (notYet) return [x, y, notYet];
    if (far(x, y)) return [x, y, far(x, y) === TOO_FAR ? "Too far" : "A wall is in the way"];
    if (!ok.has(key(x, y))) return [x, y, map.floorBuildProblem(x, y, id, L, grows) || "Build it out from a floor"];
    if (tool) return [x, y, tool];
    if (paid >= afford) return [x, y, `Need ${Object.entries(per).map(([i, k]) => `${k} ${noun(i, k)}`).join(", ")}`];
    paid++;
    return [x, y, ""];
  });
}

let floorMemo = { key: "", tiles: null }; // the last plan, kept while nothing it reads has changed (the review of #549: not every frame)
function floorGhost(player, what) {
  if (!input.getMouse().inside) return null;
  const g = cursorGrid(player);
  const cur = [Math.round(g.gx), Math.round(g.gy)];
  const from = state.build.from || cur;
  const bag = Object.keys((buildData[what] && buildData[what].cost) || {}).map((id) => inventory.countAll(player, id)).join(","); // what the player holds, for the plan's shortfall
  const key = `${what}|${from}|${cur}|${layerOf(player)}|${Math.round(player.gx * 4)},${Math.round(player.gy * 4)}|${map.worldVersion}|${rules.freeBuilding}|${bag}`;
  if (floorMemo.key !== key) floorMemo = { key, tiles: floorPlan(player, what, from[0], from[1], cur[0], cur[1]) };
  const tiles = floorMemo.tiles;
  const good = tiles.filter((t) => !t[2]).length;
  const first = tiles.find((t) => t[2]);
  return { kind: "floor", what, sprite: buildData[what].sprite, layer: layerOf(player), tiles, x0: from[0], y0: from[1], x1: cur[0], y1: cur[1], ok: good > 0, reason: good ? "" : first ? first[2] : "Not here", good, dragging: !!state.build.from };
}

// The drag's tiles laid, timed as a wall is (each tile's seconds), everything checked again when the bar completes.
function startFloorBuild(player, what, x0, y0, x1, y1) {
  const d = buildData[what];
  const plan = floorPlan(player, what, x0, y0, x1, y1).filter((t) => !t[2]);
  if (!plan.length) return false;
  const near = plan.reduce((a, b) => (Math.hypot(player.gx - a[0], player.gy - a[1]) <= Math.hypot(player.gx - b[0], player.gy - b[1]) ? a : b));
  const action = {
    kind: "build",
    label: `Laying ${d.label.toLowerCase()}`,
    tiles: [[near[0], near[1]]],
    mx: near[0],
    my: near[1],
    range: BUILD_REACH + 0.6,
    duration: (d.seconds || 0) * plan.length,
    enabled: true,
    simple: false,
    perform() {
      const L = layerOf(player);
      const now = floorPlan(player, what, x0, y0, x1, y1);
      const grows = new Set();
      let laid = 0;
      // Out from what is walkable, ring by ring, as the plan was made.
      let more = true;
      const left = now.filter((t) => !t[2]);
      while (more) {
        more = false;
        for (const t of left) {
          if (t.done) continue;
          const was = map.peekTile(t[0], t[1], L);
          const over = was && was.built && !was.built.free ? floorEntryOf(was.floor) : null; // a laid floor under it: half of it back, as Take apart gives (the review of #549)
          if (map.buildFloor(t[0], t[1], d.sprite, L, { free: !!rules.freeBuilding, grows })) {
            for (const [item, k] of Object.entries(costOf(what))) inventory.takeAll(player, item, k);
            if (over) {
              const bag = inventory.bagOf(player);
              for (const [item, n] of Object.entries(over.cost || {})) {
                const back = Math.floor(n / 2);
                const added = back > 0 && bag ? inventory.addItem(bag, item, back) : 0;
                if (back - added > 0) map.dropItem(Math.round(player.gx), Math.round(player.gy), items.makeEntry(item, back - added), L);
              }
            }
            t.done = true;
            laid++;
            more = true;
          }
        }
      }
      if (!laid) showMessage((now.find((t) => t[2]) || [0, 0, "Not here"])[2]);
      return laid > 0;
    },
  };
  if (startAction) startAction(player, action);
  else action.perform();
  return true;
}

function finishFloor(player) {
  const g = state.ghost;
  state.build.from = null;
  if (!g || g.kind !== "floor") return;
  if (!g.ok) {
    showMessage(g.reason);
    return;
  }
  if (sender) sender({ kind: "build", what: g.what, tx: g.x0, ty: g.y0, tx2: g.x1, ty2: g.y1 });
  else startFloorBuild(player, g.what, g.x0, g.y0, g.x1, g.y1);
}

// ---- stairs (docs/49 section 5): a stair three tiles long from the tile under the cursor, climbing on in the direction from the player to
// it; only north and west for now (Primary's default: the treads show only on a stair climbing away from the camera) ----
function stairDirFrom(player, x, y) {
  const dx = x - player.gx;
  const dy = y - player.gy;
  return Math.abs(dx) >= Math.abs(dy) ? (dx < 0 ? "w" : "e") : dy < 0 ? "n" : "s";
}
function stairTilesOf(x, y, dir) {
  const d = { n: [0, -1], w: [-1, 0], s: [0, 1], e: [1, 0] }[dir];
  return { tiles: [0, 1, 2].map((k) => [x + d[0] * k, y + d[1] * k]), landing: [x + d[0] * 3, y + d[1] * 3], before: [x - d[0], y - d[1]] };
}
function stairBlock(player, what, x, y, dir) {
  if (buildData[what].dev && !rules.freeBuilding) return "Stairs are not in the game yet"; // Free building only for now
  const L = layerOf(player);
  const why = map.stairBuildProblem(x, y, dir, L);
  if (why) return why;
  const { tiles } = stairTilesOf(x, y, dir);
  if (stations.bodyOnTiles(tiles, L)) return "Someone is in the way";
  return shortfall(player, what);
}
function stairReason(player, what, x, y, dir) {
  const why = reachProblem(player, [[x, y]], BUILD_REACH + 0.5, layerOf(player)); // by distance and a clear line: never built through a wall (the review of #549)
  if (why) return why === TOO_FAR ? "Too far" : why;
  return stairBlock(player, what, x, y, dir);
}
function stairGhost(player, what) {
  if (!input.getMouse().inside) return null;
  const g = cursorGrid(player);
  const x = Math.round(g.gx);
  const y = Math.round(g.gy);
  const dir = stairDirFrom(player, x, y);
  const reason = stairReason(player, what, x, y, dir);
  const { tiles, landing } = stairTilesOf(x, y, dir);
  return { kind: "stair", what, material: buildData[what].material || "wood", x, y, dir, tiles, landing, layer: layerOf(player), ok: reason === "", reason };
}
function startStairBuild(player, what, x, y, dir) {
  const d = buildData[what];
  const action = {
    kind: "build",
    label: `Building ${d.label.toLowerCase()}`,
    tiles: [[x, y]],
    mx: x,
    my: y,
    range: BUILD_REACH + 0.6,
    duration: d.seconds || 0,
    enabled: true,
    simple: false,
    perform() {
      const why = stairBlock(player, what, x, y, dir);
      if (why) {
        showMessage(why);
        return false;
      }
      spend(player, what);
      return !!map.buildStair(x, y, dir, d.material || "wood", layerOf(player), { free: !!rules.freeBuilding });
    },
  };
  if (startAction) startAction(player, action);
  else action.perform();
}

// A door or a window may be of another wood than the wall it goes into (#334): the entries of kind door or window that are not a fence's gate.
export const takesLeaf = (what) => ["door", "window"].includes(wallKindOf(what)) && !(buildData[what] && buildData[what].over);

// The leaf wood chosen for the door or window being built: "" is the wall's own (a mahogany wall's door is mahogany, a daub wall's is oak), else a wood wall's sprite. Cycled with R
// while the mode is a door or a window; the palette and the prompt say it.
export function buildLeaf() {
  return state.kind === "build" && state.build && takesLeaf(state.build.what) ? state.build.leaf || "" : "";
}

function nextLeaf(current) {
  const list = ["", ...woods.leafChoices(rules.freeBuilding)];
  const i = list.indexOf(current);
  return list[(i + 1) % list.length];
}

// How the choice reads, the same in the palette and in the prompt: "leaves: Spruce · R" (the wall's own, or "as it was" over a broken door or window of another wood, when none is chosen).
export function leafHint(chosen, carried = "") {
  const name = chosen ? woods.woodName(chosen) : carried ? `as it was, ${woods.woodName(carried)}` : "the wall's own";
  return `leaves: ${name} · R`;
}

// ---- the carry rule ----

// A prop can be lifted unless it is rooted (a tree, a well), built in (a
// fireplace, a fire pit, a torch post), or a fire that burns fuel (a campfire). A sprite's own
// `carry` flag, true or false, overrides the rule either way (docs/13); a village station's (`villageStation`) gives way to
// the world rule Village stations (docs/43 section 5).
export function canCarry(prop) {
  const d = getDef(prop.sprite);
  if (d.villageStation && rules.villageStations) return true; // the village's stations, movable by a world's rule (docs/43 section 5)
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
// footprint tile clear, walkable, not beside a door, not under the player, and no wall running
// between two tiles of the same prop (a bed does not straddle a wall).
export function canPutDown(player, tx, ty) {
  const prop = player.carrying;
  if (!prop) return false;
  const [w, h] = prop.footprint;
  for (let dy = 0; dy < h; dy++) {
    for (let dx = 0; dx < w; dx++) {
      const x = tx + dx;
      const y = ty + dy;
      const L = layerOf(player); // on the player's own storey (docs/49)
      const t = map.tileAt(x, y, L);
      if (t.prop || !map.isWalkableTile(x, y, L)) return false;
      if (map.stairAt(x, y, L) || map.landingAt(x, y, L)) return false; // never on a stair's step or its landing (the review of #549)
      if (map.besideDoor(x, y, L)) return false; // a door's two tiles stay clear: the dead go for it and need to stand there (#134)
      if (map.curveCrossed(x, y, L)) return false; // no furniture where a ring's curve crosses (Michael, 2026-10-26, docs/50)
      if (Math.hypot(player.gx - x, player.gy - y) < 0.7) return false;
      if (dx > 0 && map.wallBetween(x - 1, y, x, y, L)) return false;
      if (dy > 0 && map.wallBetween(x, y - 1, x, y, L)) return false;
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
  return n === 1 ? items.nounName(id) : items.pluralName(id);
}

// "1 log", "3 planks", or "free".
export function costText(what) {
  const cost = costOf(what);
  if (isRoundBuild(what) && Object.keys(cost).length) return Object.entries(cost).map(([id, k]) => `${k * 20} or ${k * 28} ${noun(id, 2)}`).join(", "); // 5 or 7 across: an edge each
  const parts = Object.entries(cost).map(([id, n]) => `${n} ${noun(id, n)}`);
  return parts.length ? parts.join(", ") : "free";
}

// The tool rule for building (#215): the refusal for a missing tool, or null. Free building waives it as it waives the cost.
export function toolProblem(player, verb) {
  if (rules.freeBuilding) return null;
  return inventory.toolProblem(player, verb);
}

// The first thing the player lacks for a build, as "You need a smith's hammer." or "Need 3 planks", or "".
export function shortfall(player, what) {
  if (isRoundBuild(what)) return roundShortfall(player, what, 5); // the palette's row: what the smaller one needs
  const tool = buildData[what] && buildData[what].tool;
  const noTool = tool ? toolProblem(player, tool) : null;
  if (noTool) return noTool;
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
// A build entry's wall kind (`wall`, `door`, `window`): its key, or the `kind` it names (#332: "fence" is a wall in the fence's
// material, "gate" a door in it). `over` names the one material it may be built into, on an empty edge or over that material
// (a gate in a fence, never a gate in a stone wall).
export function wallKindOf(what) {
  return (buildData[what] && buildData[what].kind) || what;
}

// A build entry that stands a prop on its tiles, not a wall on an edge (the Fireplace, the fire pit, the feeding trough): `kind: "prop"`, its `sprite`.
export const isPropBuild = (what) => !!(buildData[what] && buildData[what].kind === "prop");

// Where a prop build with its anchor at (tx, ty) stands: { tx, ty, facing, footprint, problem } by its own rule (`stand`: the Fireplace
// indoors with its back on a flat wall, its facing chosen from the wall; the fire pit on open ground, indoors or out; setdown.fitAt).
function propBuildFit(what, tx, ty) {
  const d = buildData[what];
  return setdown.fitAt(d.stand || "ground", d.sprite, tx, ty);
}

// Every tile of a fit's footprint.
function fitTiles(f) {
  const out = [];
  for (let dy = 0; dy < f.footprint[1]; dy++) for (let dx = 0; dx < f.footprint[0]; dx++) out.push([f.tx + dx, f.ty + dy]);
  return out;
}

// Why this player cannot reach a fit from where they stand, or "": its nearest tile by distance and a clear line (#208).
function fitReach(player, f) {
  const why = reachProblem(player, fitTiles(f), setdown.REACH);
  return why === TOO_FAR ? "Too far" : why || "";
}

// Why a prop build cannot go on (tx, ty), or "": its own rule for where it stands, then the cost.
function propBuildBlock(player, what, tx, ty) {
  if (layerOf(player)) return "Not upstairs yet"; // a palette prop (the Fireplace, the fire pit, the trough) reads the ground's rules alone: not wired for a storey yet
  const f = propBuildFit(what, tx, ty);
  return f.problem || (stations.bodyOnTiles(fitTiles(f)) ? "Someone is in the way" : "") || shortfall(player, what);
}

function propBuildReason(player, what, tx, ty) {
  if (layerOf(player)) return "Not upstairs yet";
  const f = propBuildFit(what, tx, ty);
  return fitReach(player, f) || f.problem || (stations.bodyOnTiles(fitTiles(f)) ? "Someone is in the way" : "") || shortfall(player, what);
}

function buildBlock(player, what, tx, ty, edge, leaf = "") {
  const L = layerOf(player);
  const existing = map.tileAt(tx, ty, L)[edge];
  const kind = wallKindOf(what);
  const over = buildData[what] && buildData[what].over;
  if (buildData[what] && buildData[what].region && !rules.freeBuilding) return `${woods.woodName(buildData[what].sprite)} is found beyond the valley`; // a region's wood (#334)
  if (existing && over && existing.sprite !== over) return "Only in a fence";
  if (existing && !map.canStampOver(existing, kind)) return "Already a wall";
  const stairWhy = map.stairEdgeProblem(tx, ty, edge, L); // never across a stair's run or top, nor round its stairwell (the review of #549)
  if (stairWhy) return stairWhy;
  const ringWhy = map.ringWallProblem(tx, ty, edge, kind, L); // a door or a window only at a ring's door points, no wall inside one (docs/50)
  if (ringWhy) return ringWhy;
  if (L && map.edgeTiles(tx, ty, edge).every(([x, y]) => !map.isWalkableTile(x, y, L))) return "No floor there"; // a storey's wall stands by a floor (docs/49 section 5)
  if (!map.canBuildWall(tx, ty, edge, kind, L)) return "No room";
  if (leaf) {
    // The wood of its leaves (#334): only for a door or a window, in a wall of a wood (its own sprite when it is stamped over one).
    const sprite = existing && map.canStampOver(existing, kind) ? existing.sprite : buildData[what].sprite;
    const why = takesLeaf(what) ? woods.leafProblem(sprite, leaf, rules.freeBuilding, kind) : "No such wood";
    if (why) return why;
  } else if (existing && map.canStampOver(existing, kind) && ["door", "window"].includes(kind)) {
    const carried = woods.carriedLeaf(existing); // the default over a broken door or window is its wood, which a region's needs Free building as a chosen one does
    if (carried && woods.leafProblem(existing.sprite, carried, rules.freeBuilding, kind)) return woods.leafProblem(existing.sprite, carried, rules.freeBuilding, kind);
  }
  if (distToEdge(player.gx, player.gy, tx, ty, edge) < EDGE_CLEARANCE) return "Step back";
  return shortfall(player, what);
}

function buildReason(player, what, tx, ty, edge, leaf = "") {
  const [mx, my] = map.edgeMid(tx, ty, edge);
  if (Math.hypot(player.gx - mx, player.gy - my) > BUILD_REACH) return "Too far";
  return buildBlock(player, what, tx, ty, edge, leaf);
}

// ---- the mode ----

export function beginProp(prop) {
  state.kind = "prop";
  state.prop = prop;
  state.build = null;
  state.active = true;
  state.turns = 0;
}

// A rug from the bag (the item's Place): the ghost follows the cursor, R turns it between its facings, a click lays it within reach, Esc cancels. The item stays in the bag until it is laid.
export function beginRug(entry) {
  const def = rugs.rugDef(entry && entry.id);
  if (!def) return false;
  state.kind = "rug";
  state.rug = { uid: entry.uid, id: def.id, sprite: def.rug, facing: rugs.facingsOf(def.rug)[0] };
  state.prop = null;
  state.build = null;
  state.active = true;
  state.turns = 0;
  return true;
}

// A painting from the bag (the item's Place): the ghost follows the cursor onto the face of a wall, a click hangs it within reach, Esc cancels. The item stays in the bag until it is hung.
export function beginPainting(entry) {
  const def = paintings.paintingDef(entry && entry.id);
  if (!def) return false;
  state.kind = "painting";
  state.painting = { uid: entry.uid, id: def.id };
  state.prop = null;
  state.build = null;
  state.rug = null;
  state.active = true;
  state.turns = 0;
  return true;
}

// An item set down from the bag as its prop (its Place, or Place as decoration; docs/43 sections 3 and 4): the ghost on the tile under the
// cursor, a click sets it down by its prop's rule, Esc cancels. The item stays in the bag until it is set down. A Campfire item is one, by
// campfire.js's rules (out and empty when it is set down); the rest are setdown.js's.
export function beginSetdown(entry) {
  const def = entry && items.getItem(entry.id);
  const isCampfire = !!def && entry.id === campfire.ITEM;
  const p = isCampfire ? { sprite: campfire.SPRITE, stand: "outdoors", decoration: false } : setdown.placeOf(def);
  if (!p) return false;
  state.kind = "setdown";
  state.setdown = { uid: entry.uid, ...p, campfire: isCampfire, name: def.name.toLowerCase() };
  state.prop = null;
  state.build = null;
  state.rug = null;
  state.torch = null;
  state.active = true;
  state.turns = 0;
  return true;
}
export const beginCampfire = (entry) => !!entry && entry.id === campfire.ITEM && beginSetdown(entry);

// A torch from the hands, the belt, or the bag (its Place torch, docs/43 section 4, #523): the ghost on the face of the wall under the
// cursor, a bracket and the torch drawn there, lit or not; a click puts it there, Esc cancels, as a painting's. The torch stays where it is
// until it is on the wall.
export function beginTorch(entry) {
  if (!entry || !setdown.mountsOnWall(items.getItem(entry.id))) return false;
  state.kind = "torch";
  state.torch = { uid: entry.uid };
  state.prop = null;
  state.painting = null;
  state.build = null;
  state.rug = null;
  state.setdown = null;
  state.active = true;
  state.turns = 0;
  return true;
}

export function beginBuild(what) {
  if (!buildData[what]) return false;
  state.kind = "build";
  state.build = { what, leaf: "" };
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
  if (!["build", "remove", "rug", "painting", "setdown", "torch"].includes(state.kind)) return false; // Esc on a set-down or a torch for a wall too (the campfire's never cancelled before)
  end();
  return true;
}

function end() {
  state.kind = null;
  state.prop = null;
  state.build = null;
  state.rug = null;
  state.painting = null;
  state.setdown = null;
  state.torch = null;
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
  if (state.kind === "rug") {
    // The rug is laid from the bag: gone from it (laid, dropped, moved) or hands full ends the mode.
    if (player.carrying || !rugs.entryOf(player, state.rug.uid)) end();
    else if (input.wasPressed("KeyR")) {
      const fs = rugs.facingsOf(state.rug.sprite);
      state.rug.facing = fs[(fs.indexOf(state.rug.facing) + 1) % fs.length];
    }
  }
  if (state.kind === "painting" && (player.carrying || !paintings.entryOf(player, state.painting.uid))) end(); // gone from the bag (hung, dropped, moved) or hands full ends the mode
  if (state.kind === "setdown" && (player.carrying || !(state.setdown.campfire ? campfire.entryOf(player, state.setdown.uid) : setdown.entryOf(player, state.setdown.uid)))) end(); // set down, dropped, or moved, or hands full
  if (state.kind === "torch" && (player.carrying || !setdown.torchOf(player, state.torch.uid))) end(); // on the wall, dropped, or spent, or hands full
  if (player.carrying) {
    if (state.kind === "build" || state.kind === "remove") end(); // hands full: no building or removing
    if (state.kind !== "prop" || state.prop !== player.carrying) beginProp(player.carrying);
    if (input.wasPressed("KeyR")) turn(player.carrying);
  } else if (state.kind === "prop") {
    end();
  }
  if (state.kind === "build" && takesLeaf(state.build.what) && input.wasPressed("KeyR")) state.build.leaf = nextLeaf(state.build.leaf || ""); // the leaf wood (#334)
  if (state.kind === "prop") state.ghost = propGhost(player);
  else if (state.kind === "build" && isFloorBuild(state.build.what)) {
    state.ghost = floorGhost(player, state.build.what);
    if (state.build.from && !input.mouseLeftDown()) finishFloor(player); // a floor's drag released: lay what the ghost shows
  }
  else if (state.kind === "rug") state.ghost = rugGhost(player);
  else if (state.kind === "painting") state.ghost = paintingGhost(player);
  else if (state.kind === "setdown") state.ghost = setdownGhost(player);
  else if (state.kind === "torch") state.ghost = torchGhost(player);
  else if (state.kind === "build") {
    state.ghost = buildGhost(player);
    if (state.build && state.build.from && !input.mouseLeftDown()) finishRound(player); // a ring's drag released: build it (docs/50 section 5)
  }
  else if (state.kind === "remove") state.ghost = removeGhost(player);
  else state.ghost = null;
  if (state.ghost && state.ghost.layer == null) state.ghost.layer = layerOf(player); // drawn on the builder's storey (render/scene.js)
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
  const h = getSheet(wall.sprite).wallHeight || 96;
  const a = edge === "n" ? [x, y - iso.HH] : [x - iso.HW, y];
  const b = edge === "n" ? [x + iso.HW, y] : [x, y - iso.HH];
  return [a, b, [b[0], b[1] - h], [a[0], a[1] - h]];
}

// What the removal tool would take at a screen point: the front-most thing
// players made: a prop made at a station (`made`) or a wall, door, or window
// they built (`built`), or null. The village's own things (its furniture, even
// carried somewhere else) and authored walls never highlight (Michael,
// 2026-10-15, the wiki census: X took the village's chests and beds, and could
// never take a crafted workbench).
export function removalTarget(sx, sy, layer = 0) {
  if (layer) {
    // On a storey: the cursor read on that floor, and the map there (docs/49 section 6).
    return map.withDrawLayer(layer, () => removalTargetHere(sx, sy + layer * map.STOREY, layer));
  }
  return removalTargetHere(sx, sy, 0);
}
function removalTargetHere(sx, sy, layer) {
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
      if (!prop || seen.has(prop) || !prop.made) continue;
      const onTile = dx === 0 && dy === 0;
      if (!onTile && !pointInRect(sx, sy, propRect(prop, cx + dx, cy + dy))) continue;
      seen.add(prop);
      consider({ type: "prop", prop }, Math.max(...prop.tiles.map(([x, y]) => x + y)));
    }
  }
  // Walls: the face under the cursor, looking up from the ground tiles it could stand on: down the screen from the cursor as far as
  // a wall is tall (96, docs/52), each look taking the tiles round it.
  const walls = new Set();
  for (let k = 0; k <= 96; k += 12) {
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
          consider({ type: "wall", tx, ty, edge, wall, layer }, tx + ty - 0.5);
        }
      }
    }
  }
  // The edge on the ground under the cursor, as building picks it, a little behind a face hit.
  const e = pickEdge(g0.gx, g0.gy);
  const ew = map.tileAt(e.tx, e.ty)[e.edge];
  if (ew && ew.built && !walls.has(ew)) consider({ type: "wall", tx: e.tx, ty: e.ty, edge: e.edge, wall: ew, layer }, e.tx + e.ty - 0.75);
  // A floor a player laid (docs/49 section 5), under all else: what stands on it is taken first.
  if (!best) {
    const ft = map.peekTile(cx, cy, layer);
    if (ft && ft.built) best = { type: "floor", tx: cx, ty: cy, layer, depth: cx + cy - 1 };
  }
  // A ring's edge is the whole ring (docs/50 section 5: taken apart at once; a single edge never alone).
  if (best && best.type === "wall" && map.isRingWall(best.wall)) {
    const ring = map.ringOfWall(best.wall);
    return ring ? { type: "round", ring, tx: best.tx, ty: best.ty, edge: best.edge, depth: best.depth } : null;
  }
  return best;
}

function targetReach(player, t) {
  if (t.type === "round") return nearestOutline(player, t.ring.x0, t.ring.y0, t.ring.n).d;
  if (t.type === "floor") return Math.hypot(player.gx - t.tx, player.gy - t.ty);
  if (t.type === "wall") {
    const [mx, my] = map.edgeMid(t.tx, t.ty, t.edge);
    return Math.hypot(player.gx - mx, player.gy - my);
  }
  return Math.min(...t.prop.tiles.map(([x, y]) => Math.hypot(player.gx - x, player.gy - y)));
}

// Why a removal is out of reach, or "": a wall you built by distance alone (Michael, 2026-10-18: removing a wall is fine from either side of it);
// a made prop by distance and a clear line, so a chest or a station cannot be taken down through a wall (#227).
function removeReachProblem(player, t) {
  if (t.type === "wall" || t.type === "round" || t.type === "floor") return targetReach(player, t) > REMOVE_REACH ? "Too far" : "";
  const why = reachProblem(player, t.prop.tiles, REMOVE_REACH, t.prop.layer || 0);
  return why === TOO_FAR ? "Too far" : why || "";
}

// Why a carried prop cannot be put down at (tx, ty) from here, or "": too far, or a wall (a shut door, a shutter) in the line (#227).
function putDownReach(player, tx, ty) {
  const why = reachProblem(player, [[tx, ty]], PLACE_REACH);
  return why === TOO_FAR ? "Too far" : why || "";
}

function removeGhost(player) {
  const m = input.getMouse();
  if (!m.inside) return null;
  const target = removalTarget(m.x, m.y, layerOf(player));
  if (!target) return null;
  const why = takeApartProblem(player, target);
  return { kind: "remove", target, ok: !why, reason: why };
}

// The entry that builds this wall, by its kind and its sprite both (a built fence is a "wall" but no log wall; a gate is a
// "door" in the fence's sprite), else the kind's own entry (a door built into a stone wall is a door).
function buildEntryOf(wall) {
  const id = Object.keys(buildData).find((k) => wallKindOf(k) === wall.kind && buildData[k].sprite === wall.sprite);
  return buildData[id] || buildData[wall.kind] || null;
}

function floorEntryOf(sprite) {
  const id = Object.keys(buildData).find((k) => isFloorBuild(k) && buildData[k].sprite === sprite);
  return id ? buildData[id] : null;
}
function targetName(t) {
  if (t.type === "prop") return propName(t.prop.sprite);
  if (t.type === "floor") {
    const ft = map.peekTile(t.tx, t.ty, t.layer || 0);
    const d = ft && floorEntryOf(ft.floor);
    return d ? d.label.toLowerCase() : "floor";
  }
  if (t.type === "round") {
    const what = Object.keys(buildData).find((k) => isRoundBuild(k) && buildData[k].sprite === t.ring.sprite);
    return what ? buildData[what].label.toLowerCase() : "round wall";
  }
  if (!t.wall) return "nothing";
  const d = buildEntryOf(t.wall);
  return (d && d.label ? d.label : t.wall.kind).toLowerCase();
}

// ---- Take apart (docs/43, section 2; Michael, 2026-10-25) ----
// One rule for what a player made: taking it apart destroys it and gives back half its materials, rounded down, with the tool its
// recipe asks for (a hammer for furniture and for building, a hatchet for a log wall), and is refused while it holds anything, so
// nothing is lost by accident. Only what a player made: a prop made at a station (`made`), a wall, door, or window built (`built`);
// the village's own furniture is carried, never taken apart. A wall built while Free building was on cost nothing (`free`), so it gives
// nothing back. The palette's Remove is this, under the one word.

// What taking it apart gives back and the tool it needs: { back: [{ id, count }], tool }. A recipe's ingredient named by a tag (the bed's
// cloth) gives nothing back: which item it was is not kept.
export function partsOf(t) {
  if (t.type === "round") return ringParts(t.ring);
  if (t.type === "floor") {
    const ft = map.peekTile(t.tx, t.ty, t.layer || 0);
    const d = ft && floorEntryOf(ft.floor);
    const back = !d || !ft.built || ft.built.free ? [] : Object.entries(d.cost || {}).map(([id, n]) => ({ id, count: Math.floor(n / 2) })).filter((i) => i.count > 0);
    return { back, tool: (d && d.tool) || tuning.world.boardTool };
  }
  if (t.type === "prop") {
    // A prop set down from an item is taken apart by the item's recipe: the item its definition names (a torch post: docs/43, section 4), or
    // the item whose Place sets it down (the campfire, made at the workbench since 2026-10-27).
    const item = getDef(t.prop.sprite).item || (items.allItems().find((d) => d.place === t.prop.sprite) || {}).id;
    const r = stations.recipes().find((q) => q.out && (q.out.prop === t.prop.sprite || (item && q.out.id === item)));
    if (r) {
      const back = (r.in || []).filter((i) => i.id).map((i) => ({ id: i.id, count: Math.floor((i.count || 1) / 2) })).filter((i) => i.count > 0);
      // Its recipe's tool; a made prop or a smith's make with none named wants the hammer, and an item made by hand with none (the
      // campfire's stones and logs) wants none, as it wanted none to build when it was the palette's.
      return { back, tool: r.uses || (r.out.prop || r.tool ? tuning.world.boardTool : null) };
    }
    // Built from the palette (the Fireplace, the fire pit, a feeding trough): half its cost but its fuel (a build's `fuel` item is its
    // starting fuel, not a material), with the entry's tool, or none if it names none (a built fire wants no tool to build or to take apart).
    const id = Object.keys(buildData).find((k) => buildData[k].kind === "prop" && buildData[k].sprite === t.prop.sprite);
    const d = id ? buildData[id] : null;
    const back = !d || t.prop.free ? [] : Object.entries(d.cost || {}).filter(([k]) => k !== d.fuel).map(([k, n]) => ({ id: k, count: Math.floor(n / 2) })).filter((i) => i.count > 0);
    return { back, tool: d ? d.tool || null : tuning.world.boardTool };
  }
  if (!t.wall) return { back: [], tool: null }; // a stale target (a guest's command, a wall already gone): nothing to give (#432)
  const d = buildEntryOf(t.wall);
  const back = t.wall.free || !d ? [] : Object.entries(d.cost || {}).map(([id, n]) => ({ id, count: Math.floor(n / 2) })).filter((i) => i.count > 0);
  return { back, tool: (d && d.tool) || tuning.world.boardTool };
}

// Why a prop holding something may not be taken apart (or picked up into the bag), or "": what is in its grid or its output box, or a
// queue still running (its ingredients are already in it).
export function holdsProblem(prop) {
  if ([prop.bag, prop.output].some((b) => b && b.items && b.items.length)) return "Empty it first.";
  if (prop.queue && prop.queue.length) return propIsPlural(prop.sprite) ? "They are still making something." : "It is still making something."; // the millstones are a plural, as Pick up says
  const f = prop.fire;
  if (f && f.burns && f.switch && f.lit) return "Put it out first."; // a built fire (the Fireplace, the fire pit) comes apart only out, as every built thing (the fire rulings, 2026-10-26)
  if (f && f.burns && !f.switch) {
    if (f.lit) return map.putOutByHand(prop) ? "Put it out first." : "Let it burn down first."; // a campfire is put out by hand; a station's fire (the cauldron, the oven, the forge) only burns down
    if (f.fuel > 0) return "It still has fuel in it; let it burn down."; // a campfire's logs, as its Pick up asks (docs/43, section 3)
  }
  return "";
}

// A ring's edge named as a wall (a guest's `remove` of type "wall", the menu) is the whole ring: a single ring edge is never taken apart
// alone (docs/50 section 5), or the room would open with the curve still drawn and a bite's reach across its corner.
function asRing(t) {
  if (!t || t.type !== "wall" || !map.isRingWall(t.wall)) return t;
  const ring = map.ringOfWall(t.wall);
  return ring ? { type: "round", ring, tx: t.tx, ty: t.ty, edge: t.edge } : null;
}

// Why this player may not take it apart now, or "": what it holds, the tool, the reach.
export function takeApartProblem(player, t) {
  t = asRing(t);
  if (t && t.type === "floor") {
    if ((t.layer || 0) !== layerOf(player)) return "There is nothing there.";
    const why = map.floorTakeUpProblem(t.tx, t.ty, t.layer || 0) || (stations.bodyOnTiles([[t.tx, t.ty]], t.layer || 0) ? "Someone is standing on it" : "");
    if (why) return why;
    const tool = partsOf(t).tool;
    return (tool ? toolProblem(player, tool) : null) || removeReachProblem(player, t);
  }
  if (t && t.type === "round") {
    // A ring the player built, whole (never the map's: players remove no authored wall, docs/50 section 5).
    if (!t.ring || map.ringById(t.ring.id) !== t.ring) return "There is nothing there.";
    if (!t.ring.built || t.ring.authored) return "That is the village's.";
    const tool = partsOf(t).tool;
    return (tool ? toolProblem(player, tool) : null) || removeReachProblem(player, t);
  }
  if (!t || (t.type === "prop" ? !t.prop || !map.propById(t.prop.id) : !t.wall)) return "There is nothing there."; // a stale target, never a throw (#432)
  if (t.type === "prop") {
    const held = holdsProblem(t.prop);
    if (held) return held;
  }
  const tool = partsOf(t).tool;
  return (tool ? toolProblem(player, tool) : null) || removeReachProblem(player, t);
}

function partsText(back) {
  return back.map((b) => `${b.count} ${noun(b.id, b.count)}`).join(", ");
}

// Take it apart for this player: the host's own click, a guest's `remove` command, and the menu's Take apart all come here. The
// materials go to the player's bag, and what does not fit to the floor at their feet.
export function takeApart(player, t) {
  t = asRing(t);
  const why = takeApartProblem(player, t);
  if (why) {
    showMessage(why);
    return false;
  }
  const { back } = partsOf(t);
  const name = targetName(t);
  destroy(t);
  const bag = inventory.bagOf(player);
  for (const b of back) {
    const added = bag ? inventory.addItem(bag, b.id, b.count) : 0;
    if (b.count - added > 0) map.dropItem(Math.round(player.gx), Math.round(player.gy), items.makeEntry(b.id, b.count - added), player.layer || 0);
  }
  showMessage(back.length ? `You take the ${name} apart: ${partsText(back)}.` : `You take the ${name} apart; nothing is left worth keeping.`);
  return true;
}

// Destroy it. A container spills what it held onto the floor; a wall takes its boards with it.
function destroy(t) {
  if (t.type === "floor") {
    map.takeUpFloor(t.tx, t.ty, t.layer || 0); // the floor it replaced back; its neighbours as they are (docs/49 section 5)
    return;
  }
  if (t.type === "round") {
    map.removeRing(t.ring.id); // its doors first, then every edge (docs/50 section 5)
    return;
  }
  if (t.type === "prop") {
    const prop = t.prop;
    // What it held falls where it stood: a container's bag and a station's output.
    const bags = [prop.bag, prop.output].filter(Boolean);
    for (const bag of bags) {
      for (const e of [...bag.items]) map.dropItem(prop.tile[0], prop.tile[1], e);
      bag.items.length = 0;
    }
    map.removeProp(prop);
    // A panel open on it closes (the wiki sync, 2026-10-15: the host's stayed open on the emptied bag, and a thing
    // put in it went with the prop; a guest's finds its container again by id and closes by itself).
    if (bags.length) emit("containerGone", { bags });
  } else {
    map.destroyWall(t.tx, t.ty, t.edge, true, t.layer || 0); // a door or a window stamped into a wall leaves the wall again
  }
}

function propGhost(player) {
  const prop = state.prop;
  const m = input.getMouse();
  if (!m.inside) return null;
  const g = cursorGrid(player); // on the player's own floor (the review of #549)
  const [w, h] = prop.footprint;
  // The footprint is centred on the cursor: its centre is the anchor plus half its extent.
  const tx = Math.round(g.gx - (w - 1) / 2);
  const ty = Math.round(g.gy - (h - 1) / 2);
  let reason = "";
  const away = putDownReach(player, tx, ty);
  if (away) reason = away;
  else if (!canPutDown(player, tx, ty)) reason = "No room";
  return { kind: "prop", prop, tx, ty, footprint: [w, h], ok: reason === "", reason };
}

// The rug's ghost: the footprint centred on the cursor, as a prop's, green where the rug may lie within reach and red where not (the rules are src/rugs.js's).
function rugGhost(player) {
  const r = state.rug;
  if (!r) return null;
  const m = input.getMouse();
  if (!m.inside) return null;
  const g = iso.toGrid(m.x, m.y);
  const [w, h] = rugs.footprintFor(r.sprite, r.facing);
  const tx = Math.round(g.gx - (w - 1) / 2);
  const ty = Math.round(g.gy - (h - 1) / 2);
  const reason = (layerOf(player) ? NOT_UPSTAIRS : "") || rugs.reachFor(player, r.sprite, r.facing, tx, ty) || rugs.fitProblem(r.sprite, r.facing, tx, ty);
  return { kind: "rug", prop: { sprite: r.sprite, facing: r.facing, footprint: [w, h] }, tx, ty, footprint: [w, h], ok: reason === "", reason, rug: { uid: r.uid, facing: r.facing } };
}

// The painting's ghost: the picture on the face under the cursor, green where it may hang within reach and red where not (the rules are src/paintings.js's). Over no wall there is no
// ghost to draw, and a click says so.
function paintingGhost(player) {
  const p = state.painting;
  if (!p) return null;
  const m = input.getMouse();
  if (!m.inside) return null;
  if (layerOf(player)) return { kind: "painting", item: p.id, tx: 0, ty: 0, edge: "n", ok: false, reason: NOT_UPSTAIRS, none: true, painting: { uid: p.uid } };
  const at = paintings.targetAt(p.id, m.x, m.y, player);
  if (!at) return { kind: "painting", item: p.id, tx: 0, ty: 0, edge: "n", ok: false, reason: "Aim at a wall", none: true, painting: { uid: p.uid } };
  const reason = at.problem || paintings.reachFor(player, p.id, at.tx, at.ty, at.edge);
  return { kind: "painting", item: p.id, tx: at.tx, ty: at.ty, edge: at.edge, ok: reason === "", reason, painting: { uid: p.uid } };
}

// A set-down's ghost (docs/43 sections 3 and 4): the prop on the tile under the cursor, green where it may stand within reach.
function setdownGhost(player) {
  const c = state.setdown;
  if (!c) return null;
  const m = input.getMouse();
  if (!m.inside) return null;
  const g = cursorGrid(player); // on the player's own floor (the review of #549)
  const tx = Math.round(g.gx);
  const ty = Math.round(g.gy);
  const reason = (layerOf(player) ? NOT_UPSTAIRS : "") || setdown.reachFor(player, tx, ty) || setdown.standProblem(c.stand, tx, ty, player.layer || 0);
  const label = c.decoration ? `Click to set the ${c.name} down as decoration · Esc cancel` : `Click to set the ${c.campfire ? "campfire" : c.name} down · Esc cancel`;
  return { kind: "prop", prop: { sprite: c.sprite }, tx, ty, footprint: [1, 1], ok: reason === "", reason, setdown: { uid: c.uid }, label };
}

// A torch's ghost for a wall: the bracket and the torch, lit or not, on the face of the wall under the cursor, the frontmost face it may go
// on within reach, else the frontmost with its reason (as a painting's targetAt).
function torchGhost(player) {
  const c = state.torch;
  if (!c) return null;
  const m = input.getMouse();
  if (!m.inside) return null;
  const entry = setdown.torchOf(player, c.uid);
  const torch = { uid: c.uid, lit: !!(entry && entry.lit) };
  if (layerOf(player)) return { kind: "torch", tx: 0, ty: 0, edge: "n", ok: false, reason: NOT_UPSTAIRS, none: true, torch };
  let first = null;
  for (const f of paintings.facesAt(m.x, m.y)) {
    const reason = setdown.mountProblem(f.tx, f.ty, f.edge) || setdown.mountReach(player, f.tx, f.ty);
    if (!reason) return { kind: "torch", tx: f.tx, ty: f.ty, edge: f.edge, layer: player.layer || 0, ok: true, reason: "", torch, label: "Click to put the torch on the wall · Esc cancel" };
    if (!first) first = { kind: "torch", tx: f.tx, ty: f.ty, edge: f.edge, layer: player.layer || 0, ok: false, reason, torch };
  }
  return first || { kind: "torch", tx: 0, ty: 0, edge: "n", ok: false, reason: "Aim at a wall", none: true, torch };
}

function buildGhost(player) {
  const m = input.getMouse();
  if (!m.inside) return null;
  const g = cursorGrid(player);
  const what = state.build.what;
  if (isRoundBuild(what)) return roundGhost(player, what);
  if (isStairBuild(what)) return stairGhost(player, what);
  if (isPropBuild(what)) {
    // A prop on the tiles under the cursor (the Fireplace along the wall it backs onto, its facing from that wall; the fire pit centred on the
    // cursor), drawn as the carried prop's ghost is, with its own line.
    const d = buildData[what];
    const f = setdown.fitFor(d.stand || "ground", d.sprite, g.gx, g.gy); // the cursor's grid point: fitFor rounds a wall's tile and centres a footprint
    const reason = fitReach(player, f) || f.problem || (stations.bodyOnTiles(fitTiles(f)) ? "Someone is in the way" : "") || shortfall(player, what);
    return { kind: "prop", prop: { sprite: d.sprite, facing: f.facing, footprint: f.footprint }, tx: f.tx, ty: f.ty, footprint: f.footprint, ok: reason === "", reason, build: what, label: `Click to build (${costText(what)}) · Esc cancel` };
  }
  const { tx, ty, edge } = pickEdge(g.gx, g.gy);
  const leaf = takesLeaf(what) ? state.build.leaf || "" : "";
  const reason = buildReason(player, what, tx, ty, edge, leaf);
  const existing = map.tileAt(tx, ty, layerOf(player))[edge];
  const kind = wallKindOf(what);
  // As it would stand: a door stamped into a wall takes the wall's material (map.buildWall), so the ghost does too, and its leaf wood.
  const sprite = existing && map.canStampOver(existing, kind) ? existing.sprite : buildData[what].sprite;
  const carried = takesLeaf(what) && !leaf && existing && map.canStampOver(existing, kind) ? woods.carriedLeaf(existing) : "";
  return { kind: "wall", tx, ty, edge, wallKind: what, wallType: kind, sprite, leaf: woods.storedLeaf(sprite, leaf || carried, rules.freeBuilding) || "", chosenLeaf: leaf, carriedLeaf: carried, ok: reason === "", reason };
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
    map.placeProp(state.prop, g.tx, g.ty, player.layer || 0); // on the player's own layer (docs/49)
    player.carrying = null;
    end();
    return true;
  }
  if (state.kind === "rug") {
    // A red ghost takes the click and says why; a green one lays the rug (a guest sends the command the host runs by the same rules).
    const g = state.ghost;
    if (!g) return false;
    if (!g.ok) {
      showMessage(g.reason);
      return true;
    }
    if (sender) {
      sender({ kind: "rug", uid: g.rug.uid, tx: g.tx, ty: g.ty, facing: g.rug.facing });
      end();
      return true;
    }
    rugs.placeRug(player, g.rug.uid, g.tx, g.ty, g.rug.facing);
    end();
    return true;
  }
  if (state.kind === "painting") {
    // A red ghost takes the click and says why; a green one hangs the painting (a guest sends the command the host runs by the same rules).
    const g = state.ghost;
    if (!g) return false;
    if (!g.ok) {
      showMessage(g.reason);
      return true;
    }
    if (sender) {
      sender({ kind: "painting", uid: g.painting.uid, tx: g.tx, ty: g.ty, edge: g.edge });
      end();
      return true;
    }
    paintings.hang(player, g.painting.uid, g.tx, g.ty, g.edge);
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
    takeApart(player, g.target);
    return true;
  }
  if (state.kind === "setdown") {
    const g = state.ghost;
    if (!g) return false;
    if (!g.ok) {
      showMessage(g.reason);
      return true;
    }
    const kind = state.setdown.campfire ? "campfire" : "setdown";
    if (sender) {
      sender({ kind, uid: g.setdown.uid, tx: g.tx, ty: g.ty });
      end();
      return true;
    }
    if (kind === "campfire") campfire.place(player, g.setdown.uid, g.tx, g.ty);
    else setdown.place(player, g.setdown.uid, g.tx, g.ty);
    end();
    return true;
  }
  if (state.kind === "torch") {
    const g = state.ghost;
    if (!g) return false;
    if (!g.ok) {
      showMessage(g.reason);
      return true;
    }
    if (sender) {
      sender({ kind: "torch", uid: g.torch.uid, tx: g.tx, ty: g.ty, edge: g.edge });
      end();
      return true;
    }
    setdown.mountTorch(player, g.torch.uid, g.tx, g.ty, g.edge);
    end();
    return true;
  }
  if (state.kind === "build") {
    const g = state.ghost;
    if (!g) return false;
    if (player.action) return true; // one build at a time
    if (g.kind === "round" || g.kind === "floor") {
      // A ring, or a floor's rectangle: the press starts the drag at the tile under the cursor; the release builds what the ghost shows then (update).
      if (!state.build.from) {
        const at = cursorGrid(player);
        state.build.from = [Math.round(at.gx), Math.round(at.gy)];
      }
      return true;
    }
    if (g.kind === "stair") {
      if (!g.ok) {
        showMessage(g.reason);
        return true;
      }
      if (sender) sender({ kind: "build", what: g.what, tx: g.x, ty: g.y, dir: g.dir });
      else startStairBuild(player, g.what, g.x, g.y, g.dir);
      return true;
    }
    if (!g.ok) {
      showMessage(g.reason);
      return true;
    }
    if (g.build) {
      // A prop build: its anchor tile, no edge (the host finds the same facing there, setdown.fitAt).
      if (sender) sender({ kind: "build", what: g.build, tx: g.tx, ty: g.ty });
      else startPropBuild(player, g.build, g.tx, g.ty);
      return true;
    }
    if (sender) {
      sender({ kind: "build", what: g.wallKind, tx: g.tx, ty: g.ty, edge: g.edge, ...(g.chosenLeaf ? { leaf: g.chosenLeaf } : {}) });
      return true;
    }
    startBuild(player, g);
    return true;
  }
  return false;
}

// A ring's drag released: the ghost as it stands is built (a guest's a `build` command naming its square's corner and size), or refused
// with why; either way the drag is over and the mode stays, for the next.
function finishRound(player) {
  const g = state.ghost;
  state.build.from = null;
  if (!g || g.kind !== "round") return;
  if (!g.ok) {
    showMessage(g.reason);
    return;
  }
  if (sender) sender({ kind: "build", what: g.wallKind, tx: g.x0, ty: g.y0, size: g.n });
  else startRoundBuild(player, g.wallKind, g.x0, g.y0, g.n);
}

// A removal target as an address: a prop by id, a wall by its edge.
function addressOf(t) {
  if (t.type === "round") return { type: "round", id: t.ring.id };
  if (t.type === "floor") return { type: "floor", tx: t.tx, ty: t.ty };
  return t.type === "prop" ? { type: "prop", id: t.prop.id } : { type: "wall", tx: t.tx, ty: t.ty, edge: t.edge };
}

// A guest's placement on the host (net.js hooks.place): the same rules its own click meets, the reach
// checked here against the guest's player, the refusal said to it through the acting player.
export function performPlacement(player, cmd) {
  if (!player || !cmd) return false;
  if (layerOf(player) && ["rug", "painting", "campfire", "setdown", "torch"].includes(cmd.kind)) {
    showMessage(NOT_UPSTAIRS); // read on the ground's tiles alone: not wired for a storey yet (the review of #549)
    return true;
  }
  if (cmd.kind === "rug") {
    // A guest laying a rug from its bag (the host's own click calls placeRug directly): the same reach and fit, the refusal said through the acting player.
    rugs.placeRug(player, cmd.uid, cmd.tx, cmd.ty, cmd.facing);
    return true;
  }
  if (cmd.kind === "painting") {
    // A guest hanging a painting from its bag (the host's own click calls hang directly): the same reach and fit, the refusal said through the acting player.
    paintings.hang(player, cmd.uid, cmd.tx, cmd.ty, cmd.edge);
    return true;
  }
  if (cmd.kind === "prop") {
    const prop = player.carrying;
    if (!prop) return false;
    const tx = Math.round(Number(cmd.tx));
    const ty = Math.round(Number(cmd.ty));
    if (!Number.isFinite(tx) || !Number.isFinite(ty)) return false;
    // Turned as the guest turned it for the room check, and turned back if the put-down is refused, so a
    // refusal leaves the host's copy as it was (the review, 2026-10-13).
    const turns = ((Math.round(Number(cmd.turns)) || 0) % 4 + 4) % 4;
    for (let i = 0; i < turns; i++) turn(prop);
    const untwist = () => { for (let i = 0; i < (4 - turns) % 4; i++) turn(prop); };
    const away = putDownReach(player, tx, ty);
    if (away) {
      untwist();
      showMessage(away);
      return true;
    }
    if (!canPutDown(player, tx, ty)) {
      untwist();
      showMessage("No room");
      return true;
    }
    map.placeProp(prop, tx, ty, player.layer || 0); // on the player's own layer (docs/49)
    player.carrying = null;
    return true;
  }
  if (cmd.kind === "campfire") {
    // A guest setting its Campfire item down (the host's own click calls campfire.place directly): the same reach and rule.
    campfire.place(player, cmd.uid, cmd.tx, cmd.ty);
    return true;
  }
  if (cmd.kind === "setdown") {
    // A guest setting an item down as its prop (a torch post, a decoration; docs/43 section 4): the same reach and rule.
    setdown.place(player, cmd.uid, cmd.tx, cmd.ty);
    return true;
  }
  if (cmd.kind === "torch") {
    // A guest putting a torch it carries on a wall's face (Place torch, #523), by the torch's uid and the face's address: the same reach
    // and face rules as the host's own click.
    setdown.mountTorch(player, cmd.uid, cmd.tx, cmd.ty, cmd.edge);
    return true;
  }
  if (cmd.kind === "build" && typeof cmd.what === "string" && isFloorBuild(cmd.what)) {
    // A floor's rectangle (docs/49 section 5): its two corners on the player's storey, each tile by the rules the host's own release meets.
    const [x0, y0, x1, y1] = [cmd.tx, cmd.ty, cmd.tx2, cmd.ty2].map((v) => Math.round(Number(v)));
    if (![x0, y0, x1, y1].every(Number.isFinite) || Math.abs(x1 - x0) >= MAX_DRAG || Math.abs(y1 - y0) >= MAX_DRAG) return false;
    if (player.action) return true;
    if (!startFloorBuild(player, cmd.what, x0, y0, x1, y1)) showMessage((floorPlan(player, cmd.what, x0, y0, x1, y1).find((t) => t[2]) || [0, 0, "Not here"])[2]);
    return true;
  }
  if (cmd.kind === "build" && typeof cmd.what === "string" && isStairBuild(cmd.what)) {
    // A stair (docs/49 section 5): its low tile and its direction, on the player's storey.
    const tx = Math.round(Number(cmd.tx));
    const ty = Math.round(Number(cmd.ty));
    const dir = ["n", "w", "s", "e"].includes(cmd.dir) ? cmd.dir : null;
    if (!dir || !Number.isFinite(tx) || !Number.isFinite(ty)) return false;
    if (player.action) return true;
    const why = stairReason(player, cmd.what, tx, ty, dir);
    if (why) {
      showMessage(why);
      return true;
    }
    startStairBuild(player, cmd.what, tx, ty, dir);
    return true;
  }
  if (cmd.kind === "build" && typeof cmd.what === "string" && isRoundBuild(cmd.what)) {
    // A ring (docs/50 section 6): its square's corner and size, on the player's layer, by the rules the host's own release meets.
    const tx = Math.round(Number(cmd.tx));
    const ty = Math.round(Number(cmd.ty));
    const n = Math.round(Number(cmd.size));
    if (!Number.isFinite(tx) || !Number.isFinite(ty) || !round.validSize(n)) return false;
    if (player.action) return true;
    const why = roundReason(player, cmd.what, tx, ty, n);
    if (why) {
      showMessage(why);
      return true;
    }
    startRoundBuild(player, cmd.what, tx, ty, n);
    return true;
  }
  if (cmd.kind === "build" && typeof cmd.what === "string" && isPropBuild(cmd.what)) {
    const tx = Math.round(Number(cmd.tx));
    const ty = Math.round(Number(cmd.ty));
    if (!Number.isFinite(tx) || !Number.isFinite(ty)) return false;
    if (player.action) return true;
    const why = propBuildReason(player, cmd.what, tx, ty);
    if (why) {
      showMessage(why);
      return true;
    }
    startPropBuild(player, cmd.what, tx, ty);
    return true;
  }
  if (cmd.kind === "build") {
    const what = typeof cmd.what === "string" && buildData[cmd.what] ? cmd.what : null;
    const tx = Math.round(Number(cmd.tx));
    const ty = Math.round(Number(cmd.ty));
    const edge = cmd.edge === "n" || cmd.edge === "w" ? cmd.edge : null;
    if (!what || !edge || !Number.isFinite(tx) || !Number.isFinite(ty)) return false;
    if (player.action) return true;
    const leaf = typeof cmd.leaf === "string" ? cmd.leaf : ""; // the wood of a door's or window's leaves (#334), checked by the same rules the host's own click meets
    const why = buildReason(player, what, tx, ty, edge, leaf);
    if (why) {
      showMessage(why);
      return true;
    }
    startBuild(player, { wallKind: what, tx, ty, edge, chosenLeaf: leaf });
    return true;
  }
  if (cmd.kind === "remove") {
    const a = cmd.target;
    if (!a) return false;
    let t = null;
    if (a.type === "round") {
      const ring = typeof a.id === "string" ? map.ringById(a.id) : null;
      if (ring && (ring.layer || 0) === (player.layer || 0)) t = { type: "round", ring };
    } else if (a.type === "prop") {
      const prop = typeof a.id === "string" ? map.propById(a.id) : null;
      if (prop && prop.made && (prop.layer || 0) === layerOf(player) && map.tileAt(prop.tile[0], prop.tile[1], prop.layer || 0).prop === prop) t = { type: "prop", prop }; // on the player's own storey (the review of #549)
    } else if (a.type === "wall" && (a.edge === "n" || a.edge === "w")) {
      const tx = Math.round(Number(a.tx));
      const ty = Math.round(Number(a.ty));
      const wall = Number.isFinite(tx) && Number.isFinite(ty) ? map.tileAt(tx, ty, layerOf(player))[a.edge] : null;
      if (wall && wall.built) t = { type: "wall", tx, ty, edge: a.edge, wall, layer: layerOf(player) };
    } else if (a.type === "floor") {
      const tx = Math.round(Number(a.tx));
      const ty = Math.round(Number(a.ty));
      if (Number.isFinite(tx) && Number.isFinite(ty)) t = { type: "floor", tx, ty, layer: layerOf(player) };
    }
    if (!t) return false;
    takeApart(player, t); // the one rule, its refusal said to the acting player
    return true;
  }
  return false;
}

// A prop built from the palette (the Fireplace, the fire pit, a feeding trough), timed as a wall is: nothing spent until the bar completes,
// everything checked again then, the prop standing on its fit's tiles in its fit's facing. A build's fuel item (`fuel` in its entry) is the
// prop's starting fuel, not a material; none has one since the campfire left the palette (Michael, 2026-10-27).
function startPropBuild(player, what, tx, ty) {
  const d = buildData[what];
  const f0 = propBuildFit(what, tx, ty);
  const action = {
    kind: "build",
    label: `Building ${d.label.toLowerCase()}`,
    tiles: fitTiles(f0),
    mx: tx + (f0.footprint[0] - 1) / 2,
    my: ty + (f0.footprint[1] - 1) / 2,
    range: BUILD_REACH + 0.6,
    duration: d.seconds || 0,
    enabled: true,
    simple: false,
    perform() {
      const why = propBuildBlock(player, what, tx, ty);
      if (why) {
        showMessage(why);
        return false;
      }
      const fuel = d.fuel && !rules.freeBuilding ? costOf(what)[d.fuel] || 0 : d.fuel ? (d.cost || {})[d.fuel] || 0 : 0; // its fuel, paid for or free
      const f = propBuildFit(what, tx, ty); // its facing found again now, by the same order the ghost and a guest's command use
      spend(player, what);
      const prop = map.createProp({ sprite: d.sprite, tile: [tx, ty], footprint: f.footprint, ...(f.facing ? { facing: f.facing } : {}) });
      prop.made = true;
      if (prop.fire && fuel) prop.fire.fuel = Math.min(prop.fire.maxFuel, fuel);
      map.placeProp(prop, tx, ty, player.layer || 0);
      if (rules.freeBuilding) prop.free = true; // it cost nothing, so taking it apart gives nothing back (docs/43, section 2)
      return true;
    },
  };
  if (startAction) startAction(player, action);
  else action.perform();
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
      const why = buildBlock(player, what, g.tx, g.ty, g.edge, g.chosenLeaf || "");
      if (why) {
        showMessage(why);
        return false;
      }
      spend(player, what);
      const L = layerOf(player);
      const built = map.buildWall(g.tx, g.ty, g.edge, wallKindOf(what), d.sprite, g.chosenLeaf || null, L); // on the builder's storey (docs/49)
      if (built && rules.freeBuilding) map.tileAt(g.tx, g.ty, L)[g.edge].free = true; // it cost nothing, so taking it apart gives nothing back (docs/43, section 2)
      return built;
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
    return { label: g.label || "Click to place · R turn · E in front", mx: g.tx, my: g.ty, progress: null, enabled: true };
  }
  if (g.kind === "rug") {
    if (!g.ok) return { label: g.reason, mx: g.tx, my: g.ty, progress: null, enabled: false };
    return { label: "Click to lay the rug · R turn · Esc cancel", mx: g.tx, my: g.ty, progress: null, enabled: true };
  }
  if (g.kind === "painting") {
    const m = input.getMouse();
    const at = iso.toGrid(m.x, m.y);
    const [mx, my] = g.none ? [at.gx, at.gy] : paintings.floorTile(g.tx, g.ty);
    if (!g.ok) return { label: g.reason, mx, my, progress: null, enabled: false };
    return { label: "Click to hang the painting · Esc cancel", mx, my, progress: null, enabled: true };
  }
  if (g.kind === "torch") {
    const m = input.getMouse();
    const at = iso.toGrid(m.x, m.y);
    const [mx, my] = g.none ? [at.gx, at.gy] : paintings.floorTile(g.tx, g.ty);
    if (!g.ok) return { label: g.reason, mx, my, progress: null, enabled: false };
    return { label: g.label, mx, my, progress: null, enabled: true };
  }
  if (g.kind === "remove") {
    const t = g.target;
    const [mx, my] = t.type === "wall" || t.type === "round" ? map.edgeMid(t.tx, t.ty, t.edge) : t.prop.tile;
    if (!g.ok) return { label: g.reason, mx, my, progress: null, enabled: false };
    const { back } = partsOf(t);
    return { label: `Click to take apart ${targetName(t)}${back.length ? ` (${partsText(back)} back)` : ""} · Esc cancel`, mx, my, progress: null, enabled: true };
  }
  if (g.kind === "floor") {
    const [mx, my] = [(g.x0 + g.x1) / 2, (g.y0 + g.y1) / 2];
    if (!g.ok) return { label: g.reason, mx, my, progress: null, enabled: false };
    const n = g.tiles.length;
    return { label: g.dragging ? `Release to lay ${g.good} of ${n} (${costText(g.what)} a tile) · Esc cancel` : `Click to lay (${costText(g.what)}) · drag for more · Esc cancel`, mx, my, progress: null, enabled: true };
  }
  if (g.kind === "stair") {
    if (!g.ok) return { label: g.reason, mx: g.x, my: g.y, progress: null, enabled: false };
    return { label: `Click to build (${costText(g.what)}) · Esc cancel`, mx: g.x, my: g.y, progress: null, enabled: true };
  }
  if (g.kind === "round") {
    const [mx, my] = [g.x0 + (g.n - 1) / 2, g.y0 + (g.n - 1) / 2];
    if (!g.ok) return { label: g.reason, mx, my, progress: null, enabled: false };
    return { label: g.dragging ? `Release to build ${g.n} across (${costText(g.wallKind)}) · Esc cancel` : "Press and drag out for 7 across · Esc cancel", mx, my, progress: null, enabled: true };
  }
  const [mx, my] = map.edgeMid(g.tx, g.ty, g.edge);
  if (!g.ok) return { label: g.reason, mx, my, progress: null, enabled: false };
  const wood =takesLeaf(g.wallKind) ? ` · ${leafHint(g.chosenLeaf, g.carriedLeaf)}` : "";
  return { label: `Click to build (${costText(g.wallKind)})${wood} · Esc cancel`, mx, my, progress: null, enabled: true };
}
