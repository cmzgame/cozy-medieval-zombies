// Stations (docs/30, sections 3 and 6; docs/31/08's habits): a station is a
// prop whose definition names a `station` (the workbench, the anvil, the
// forge, the oven, the loom...), or any lit fire that cooks (the cooking
// hearth). Recipes are rows in data/recipes.json. A craft takes its seconds
// in the world's time, from the station's own queue, with ingredients taken
// from the player's bag, belt, and hands and from every opened container
// within reach; a recipe that needs fire pauses while the fire is out; the
// result lands in the station's output bag (a container of its own) or, for a
// thing too big for a bag, as a prop beside the station. The `craft` verb is
// the one door in; the panel (ui/station-panel.js) is a thin caller of it.

import * as map from "./map.js";
import { getDef } from "./assets.js";
import { getItem, aName, countName, containerGrid } from "./items.js";
import { propAName, containerName, setRecipes as setPropRecipes } from "./prop-names.js"; // a made prop's name (docs/bugs.md, 2026-10-25)
import * as loop from "./loop.js"; // the sim clock: a spot is read once a step
import * as grid from "./grid.js";
import { bagOf, beltOf, createBag, countAll, takeAll, toolProblem, detach } from "./inventory.js";
import * as verbs from "./verbs.js";
import { canReach, reachProblem, TOO_FAR } from "./reach.js"; // one reach test, distance and a clear line (#208)
import { emit } from "./events.js";
import { rules } from "./rules.js"; // a recipe a world rule keeps off (docs/43 section 5)

export const REACH = 2.6; // tiles: the click's reach (interact.js CLICK_REACH); containers this close feed a craft
const OUTPUT = [3, 2]; // the output bag's grid

let rows = [];
const active = new Set(); // stations with something in their queue

// After a restore (docs/31/05, item 24): every prop with a queue is active again.
export function resetActive(props) {
  active.clear();
  for (const p of props) if (p.queue && p.queue.length) active.add(p);
}

export function loadRecipes(json) {
  rows = (json && (json.rows || json)) || [];
  setPropRecipes(rows); // a made prop is named by its recipe's label first (prop-names.js)
}

export function recipes() {
  return rows;
}

export function recipe(id) {
  return rows.find((r) => r.id === id) || null;
}

// What a prop is as a station: a list, empty for none (docs/43, section 3, 2026-10-25: the oven cooks the fire's six recipes as well
// as its own, so a prop can be more than one station). Its own station first, then "cooking" for a fire that cooks.
export function stationOf(prop) {
  if (!prop) return [];
  let def = null;
  try { def = getDef(prop.sprite); } catch { return []; }
  const out = [];
  if (def.station) out.push(def.station);
  if (prop.fire && prop.fire.cooks) out.push("cooking");
  return out;
}

// Whether a recipe is open in this world: a row may name a world rule (`rule`) that must be on for it (docs/43 section 5: the village's
// stations made only with Village stations on); a closed row is hidden, not greyed.
export const isOpen = (r) => !!r && (!r.rule || !!rules[r.rule]);

export function recipesFor(station) {
  return rows.filter((r) => r.station === station && isOpen(r));
}

// Every bag a craft may draw on: the player's bag, the station's own output,
// and any opened container within reach of the player (its bag exists once
// it has been searched).
export function sources(player, prop) {
  const out = [];
  const bag = bagOf(player);
  if (bag) out.push(bag);
  if (prop.output) out.push(prop.output);
  const px = Math.round(player.gx);
  const py = Math.round(player.gy);
  const seen = new Set();
  for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) {
    const p = map.peekTile(px + dx, py + dy)?.prop;
    if (!p || p === prop || seen.has(p) || !p.bag) continue;
    seen.add(p);
    if (canReach(player, p.tiles, REACH)) out.push(p.bag); // a chest in the next room feeds nothing through the wall (#208)
  }
  return out;
}

function matches(entry, want) {
  if (want.id && entry.id === want.id) return true;
  if (want.or && entry.id === want.or) return true;
  if (want.tag) {
    const def = getItem(entry.id);
    return !!(def && def.tags && def.tags.includes(want.tag));
  }
  return false;
}

// How many of an ingredient the player can reach.
export function have(player, prop, want) {
  let n = 0;
  for (const slot of ["main", "off"]) {
    const e = player.hands[slot];
    if (e && matches(e, want) && !(slot === "off" && player.hands.main === e)) n += e.count;
  }
  for (const e of beltOf(player) || []) if (e && matches(e, want)) n += e.count;
  for (const bag of sources(player, prop)) for (const e of bag.items) if (matches(e, want)) n += e.count;
  return n;
}

// Take `count` of an ingredient from wherever it is reached: the player's own
// first, then the containers. Returns how many were taken.
function take(player, prop, want, count) {
  let remaining = count;
  if (want.id) remaining -= takeAll(player, want.id, remaining);
  if (remaining > 0 && want.or) remaining -= takeAll(player, want.or, remaining);
  // Every match across the sources, in source order, and for a tag a garment last: a recipe that asks for `cloth` takes a rag or a cloth
  // before it burns a tunic (the #216 review: rags exist so the first torches do not cost a whole garment).
  const found = [];
  const [own, ...rest] = sources(player, prop);
  const from = (bag) => { if (bag) for (const e of [...bag.items]) if (matches(e, want)) found.push([bag, e]); };
  from(own);
  if (want.tag) {
    // The belt and the hands, as `have` counts them (the review of #462: a raw meat on the belt was counted and never spent, so it made
    // pottage for ever): the player's own before the containers. A thing held in both hands is one.
    for (const e of beltOf(player) || []) if (e && matches(e, want)) found.push([null, e]);
    for (const slot of ["main", "off"]) {
      const e = player.hands[slot];
      if (e && matches(e, want) && !found.some(([, f]) => f === e)) found.push([null, e]);
    }
  }
  for (const bag of rest) from(bag);
  if (want.tag) {
    const garment = ([, e]) => (getItem(e.id).kind === "clothing" ? 1 : 0);
    found.sort((a, b) => garment(a) - garment(b)); // stable: the order inside each kind stays the source order
  }
  for (const [bag, e] of found) {
    if (remaining <= 0) break;
    const t = Math.min(remaining, e.count);
    e.count -= t;
    remaining -= t;
    if (e.count <= 0) {
      if (bag) grid.remove(bag, e);
      else detach(player, e); // off the belt or out of the hand
    }
  }
  return count - remaining;
}

export function nameOfWant(want) {
  if (want.id) return getItem(want.id).name.toLowerCase();
  return `any ${want.tag}`;
}

// What is missing for `count` makes of a recipe: [{ want, need, have }].
export function shortfall(player, prop, r, count = 1) {
  const out = [];
  for (const want of r.in) {
    const n = have(player, prop, want);
    if (n < want.count * count) out.push({ want, need: want.count * count, have: n });
  }
  return out;
}

function toolInHand(player, id) {
  return ["main", "off"].some((s) => player.hands[s] && player.hands[s].id === id);
}

// Whether a recipe can be started at a station now: true, or the reason not.
export function canMake(player, prop, r, count = 1) {
  if (!isOpen(r)) return "No such recipe."; // a world rule keeps it off (docs/43 section 5)
  if (!stationOf(prop).includes(r.station)) return "Not at this station.";
  { const why = reachProblem(player, prop.tiles, REACH); if (why) return why === TOO_FAR ? "Too far from it." : why; }
  if (r.fire && !(prop.fire && prop.fire.lit)) return "The fire is out.";
  if (r.uses) { const why = toolProblem(player, r.uses); if (why) return why; } // a carried tool by its verb (#215)
  if (r.tool && !toolInHand(player, r.tool)) return `Needs ${aName(r.tool)} in hand.`;
  { const why = roomProblem(prop, r); if (why) return why; } // refused before anything is spent: a made prop needs a spot beside it
  const short = shortfall(player, prop, r, count);
  if (short.length) return `Short of ${short.map((s) => `${s.need - s.have} ${nameOfWant(s.want)}`).join(", ")}.`;
  return true;
}

// Start `count` makes: the ingredients are taken now, the work queued on the station.
export function start(player, prop, r, count = 1) {
  for (const want of r.in) take(player, prop, want, want.count * count);
  if (!prop.queue) prop.queue = [];
  prop.queue.push({ recipe: r.id, left: r.seconds, count, by: player.id });
  active.add(prop);
  map.touch(prop.tile[0], prop.tile[1]);
  emit("craftStarted", { id: prop.id, tile: prop.tile, recipe: r.id, count, by: player.id });
  return true;
}

// The output bag of a station, made on first use: a container of its own.
export function outputOf(prop) {
  if (!prop.output) {
    prop.output = createBag(OUTPUT[0], OUTPUT[1], "output");
    map.unsaved(prop.tile[0], prop.tile[1], false); // made on first use: the save's copy of its chunk is dropped
  }
  return prop.output;
}

// The bodies on the map (the players, the villagers, the dead, the animals, the bodies lying), handed in by game.js: a made prop never lands
// on a tile one stands on (the crafter usually stands on the first tile tried, below the station), as placement.canPutDown keeps clear of the player.
let bodies = () => [];
export function setBodies(fn) {
  bodies = fn;
}

// Whether a made prop of this footprint may stand with its anchor at (x, y): every one of its tiles walkable, empty, bare of items, not
// beside a door (#134), no body on it, and no wall between two of them, as placement.canPutDown asks of a carried prop. Only the anchor was
// asked until check("craft") ran twice: a counter (three tiles) made at the joiner's workbench stood over the bench's own tiles, and the
// bench was gone from the map while its record stayed.
function fits(x, y, [w, h], near) {
  for (let dy = 0; dy < h; dy++) for (let dx = 0; dx < w; dx++) {
    const tx = x + dx;
    const ty = y + dy;
    const t = map.tileAt(tx, ty);
    if (t.prop || t.items || !map.isWalkableTile(tx, ty) || map.besideDoor(tx, ty)) return false;
    if (dx > 0 && map.wallBetween(tx - 1, ty, tx, ty)) return false;
    if (dy > 0 && map.wallBetween(tx, ty - 1, tx, ty)) return false;
    if (near.some((c) => Math.hypot(c.gx - tx, c.gy - ty) < 0.7)) return false;
  }
  return true;
}

// Where a made prop of this footprint lands beside its station, or null: the tiles a body could walk to from beside the station, nearest
// by the walk first (breadth first by `map.canStep`, so never through a wall or a shut door into the next room), up to SPOT_STEPS steps,
// the first whose footprint fits. Read once a step for a station and a shape while the map is unchanged (the panel asks it for every row).
const SPOT_STEPS = 12;
const spotCache = new Map();
const SIDES = [[0, 1], [1, 0], [-1, 0], [0, -1]];
function spotFor(prop, fp) {
  const key = `${prop.id}:${fp[0]}x${fp[1]}`;
  const now = `${loop.simTime()}|${map.worldVersion}`; // a step's, and only while nothing on the map changed
  const hit = spotCache.get(key);
  if (hit && hit.at === now) return hit.spot;
  if (spotCache.size > 64) spotCache.clear();
  const R = SPOT_STEPS + Math.max(fp[0], fp[1]) + 2;
  const near = bodies().filter((c) => c && Math.abs(c.gx - prop.tile[0]) <= R && Math.abs(c.gy - prop.tile[1]) <= R);
  const seen = new Set(prop.tiles.map(([x, y]) => `${x},${y}`));
  const grow = (from) => {
    const out = [];
    for (const [x, y] of from) for (const [dx, dy] of SIDES) {
      const k = `${x + dx},${y + dy}`;
      if (seen.has(k) || !map.canStep(x, y, x + dx, y + dy)) continue;
      seen.add(k);
      out.push([x + dx, y + dy]);
    }
    return out;
  };
  let ring = grow(prop.tiles);
  let spot = null;
  for (let step = 0; step < SPOT_STEPS && ring.length && !spot; step++) {
    ring.sort((a, b) => (a[1] - b[1]) || (a[0] - b[0])); // a fixed order: the same spot wherever the step runs
    for (const [x, y] of ring) if (fits(x, y, fp, near)) { spot = [x, y]; break; }
    ring = grow(ring);
  }
  spotCache.set(key, { at: now, spot });
  return spot;
}

// The item a made prop is picked up as (its definition's `item`), or null: what goes in the output when there is no room for the prop.
function propItem(sprite) {
  let d = null;
  try { d = getDef(sprite); } catch { return null; }
  return d && typeof d.item === "string" ? d.item : null;
}

// Why a prop recipe cannot be made here now, or "": no room beside the station for it, and no item form to put in the output instead.
export function roomProblem(prop, r) {
  const o = (r && r.out) || {};
  if (!o.prop || propItem(o.prop)) return "";
  if (spotFor(prop, o.footprint || [1, 1])) return "";
  return `There is no room beside it for ${madeWords(o)}.`;
}

// A made thing in words, for a line: "a counter", "5 arrows", "a loaf of bread", "a jack-o'-lantern", "a pair of millstones". A prop is
// named by prop-names.js (its recipe's label, its definition's `name`, else its id in words; counted by its definition's `noun`).
export function madeWords(out) {
  if (!out) return "something";
  if (out.prop) return propAName(out.prop);
  return countName(out.id, out.count || 1);
}

// The craft-done line, the host's log and a guest's alike: "Made 5 arrows.", "Made a counter."
export function doneLine(out) {
  return `Made ${madeWords(out)}.`;
}

// A finished make lands: an item into the output (the floor beside if it is full), a prop beside the station on tiles that are all free
// and that a body could walk to from it. Returns what landed (the recipe's `out`, or the prop's item put in the output instead), or null
// when nothing could land yet: the job then waits at the head of the queue and tries again, so nothing made is lost.
function deliver(prop, r) {
  const o = r.out;
  if (o.prop) {
    const fp = o.footprint || [1, 1];
    const at = spotFor(prop, fp);
    if (at) {
      const made = map.createProp({ sprite: o.prop, tile: at, footprint: fp });
      made.made = true; // players made it, so X may take it away again (placement.removalTarget; 2026-10-15)
      // A container made here starts empty (the wiki census's bugs, 2026-10-15: a crafted chest rolled the chest's
      // loot on its first search): its bag made now, already searched, so nothing is ever rolled into it.
      if (made.container) {
        const [cols, rows] = containerGrid(made.container.loot);
        made.bag = createBag(cols, rows, containerName(made.sprite));
        made.searched = true;
      }
      map.placeProp(made, at[0], at[1]);
      spotCache.clear();
      return o;
    }
    const item = propItem(o.prop);
    if (item && grid.add(outputOf(prop), item, 1) === 1) return { id: item, count: 1 };
    return null;
  }
  const bag = outputOf(prop);
  const put = grid.add(bag, o.id, o.count);
  if (put < o.count) {
    const at = map.nearestWalkable(prop.tile[0], prop.tile[1] + 1);
    if (at) map.dropItem(at[0], at[1], { id: o.id, count: o.count - put });
  }
  return o;
}

// Every station's queue, a step: a recipe that needs fire waits while the fire is out.
export function update(dt) {
  for (const prop of active) {
    const q = prop.queue && prop.queue[0];
    if (!q) { active.delete(prop); continue; }
    const r = recipe(q.recipe);
    if (!r) { prop.queue.shift(); continue; }
    if (r.fire && !(prop.fire && prop.fire.lit)) continue;
    q.left -= dt;
    map.unsaved(prop.tile[0], prop.tile[1], false); // the job's time left is saved; the wire sends it in the frame's queues
    if (q.left > 0) continue;
    const landed = deliver(prop, r);
    if (!landed) { q.left = 1; continue; } // no room for it yet (a body on the spot, the room filled since it began): tried again in a second
    emit("craftDone", { id: prop.id, tile: prop.tile, recipe: r.id, out: landed, by: q.by });
    q.count -= 1;
    if (q.count > 0) q.left = r.seconds;
    else prop.queue.shift();
    map.touch(prop.tile[0], prop.tile[1]);
  }
}

// The jobs in every station that has one, for the frame to a guest (net.js): the queue's time left changes every
// step and is no reason to resend a chunk; a job's start and its landing touch the chunk as before.
export function frameQueues() {
  const out = [];
  for (const prop of active) if (prop.queue && prop.queue.length) out.push([prop.id, prop.queue.map((q) => ({ recipe: q.recipe, left: q.left, count: q.count, by: q.by }))]);
  return out;
}

// Progress of the first job on a station, 0 to 1, or null when idle.
export function progress(prop) {
  const q = prop.queue && prop.queue[0];
  if (!q) return null;
  const r = recipe(q.recipe);
  return r ? 1 - q.left / r.seconds : null;
}

verbs.define("craft", {
  validate(world, player, target, args) {
    const prop = map.propById(target.prop);
    if (!prop) return "That is gone.";
    const r = recipe(args.recipe);
    if (!r) return "No such recipe.";
    const count = Math.max(1, Math.min(10, args.count | 0 || 1));
    return canMake(player, prop, r, count);
  },
  perform(world, player, target, args) {
    const prop = map.propById(target.prop);
    const count = Math.max(1, Math.min(10, args.count | 0 || 1));
    start(player, prop, recipe(args.recipe), count);
    return { ok: true };
  },
});
