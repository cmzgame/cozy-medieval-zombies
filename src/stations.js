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
import { getItem, containerGrid } from "./items.js";
import * as grid from "./grid.js";
import { bagOf, beltOf, createBag, countAll, takeAll, toolProblem } from "./inventory.js";
import * as verbs from "./verbs.js";
import { canReach, reachProblem, TOO_FAR } from "./reach.js"; // one reach test, distance and a clear line (#208)
import { emit } from "./events.js";

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
}

export function recipes() {
  return rows;
}

export function recipe(id) {
  return rows.find((r) => r.id === id) || null;
}

// What a prop is as a station, or null.
export function stationOf(prop) {
  if (!prop) return null;
  let def = null;
  try { def = getDef(prop.sprite); } catch { return null; }
  if (def.station) return def.station;
  if (prop.fire && prop.fire.cooks) return "cooking";
  return null;
}

export function recipesFor(station) {
  return rows.filter((r) => r.station === station);
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
  for (const bag of sources(player, prop)) for (const e of [...bag.items]) if (matches(e, want)) found.push([bag, e]);
  if (want.tag) {
    const garment = ([, e]) => (getItem(e.id).kind === "clothing" ? 1 : 0);
    found.sort((a, b) => garment(a) - garment(b)); // stable: the order inside each kind stays the source order
  }
  for (const [bag, e] of found) {
    if (remaining <= 0) break;
    const t = Math.min(remaining, e.count);
    e.count -= t;
    remaining -= t;
    if (e.count <= 0) grid.remove(bag, e);
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
  if (stationOf(prop) !== r.station) return "Not at this station.";
  { const why = reachProblem(player, prop.tiles, REACH); if (why) return why === TOO_FAR ? "Too far from it." : why; }
  if (r.fire && !(prop.fire && prop.fire.lit)) return "The fire is out.";
  if (r.uses) { const why = toolProblem(player, r.uses); if (why) return why; } // a carried tool by its verb (#215)
  if (r.tool && !toolInHand(player, r.tool)) return `Needs a ${getItem(r.tool).name.toLowerCase()} in hand.`;
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

// A finished make lands: an item into the output (the floor beside if it is full),
// a prop beside the station.
function deliver(prop, r) {
  const o = r.out;
  if (o.prop) {
    const at = map.nearestWalkable(prop.tile[0], prop.tile[1] + 1, (x, y) => !!map.tileAt(x, y).prop || map.tileAt(x, y).items || map.besideDoor(x, y)); // never on a door's tiles (#134)
    if (at) {
      const made = map.createProp({ sprite: o.prop, tile: at, footprint: o.footprint || [1, 1] });
      made.made = true; // players made it, so X may take it away again (placement.removalTarget; 2026-10-15)
      // A container made here starts empty (the wiki census's bugs, 2026-10-15: a crafted chest rolled the chest's
      // loot on its first search): its bag made now, already searched, so nothing is ever rolled into it.
      if (made.container) {
        const [cols, rows] = containerGrid(made.container.loot);
        made.bag = createBag(cols, rows, made.sprite.replace(/_/g, " "));
        made.searched = true;
      }
      map.placeProp(made, at[0], at[1]);
    }
    return;
  }
  const bag = outputOf(prop);
  const put = grid.add(bag, o.id, o.count);
  if (put < o.count) {
    const at = map.nearestWalkable(prop.tile[0], prop.tile[1] + 1);
    if (at) map.dropItem(at[0], at[1], { id: o.id, count: o.count - put });
  }
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
    deliver(prop, r);
    emit("craftDone", { id: prop.id, tile: prop.tile, recipe: r.id, out: r.out, by: q.by });
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
