// Farming (#194; docs/30 section 8, with step 4's defaults): till, plant, water, grow on the clock, harvest with the seeds back.
// `data/crops.json` has each crop's days per stage, its harvest and its seed, and the soil's numbers.
//
// Growth is derived, never stepped: a crop prop carries `crop: { kind, grown, at, wetUntil }`, all in clock seconds: the growth it had
// at `at`, and the time until which its soil is wet. Growth accrues only while the soil is wet, so its total at any time is
// `grown + the wet time since at`, and the stage is read off the crop's stage days. Watering sets `wetUntil` ahead and settles `grown`.
// A dry crop pauses and never dies; a chunk evicted for a week is right the moment it loads (the same two numbers, the same clock).
// What is stepped is only the picture: once a `fruitCheckSeconds` of the clock, `step` turns the sprite of any crop whose stage has changed
// (a restage, which touches its chunk, so a guest has it). The verbs read the derived stage, never the sprite.
// A crop the map authored at a stage (`crop: { kind, stage }`, from its sprite definition) is settled live at that stage the first time
// it is looked at: its growth set to the stage's start, its soil wet.

import * as verbs from "./verbs.js";
import * as map from "./map.js";
import * as clock from "./clock.js";
import * as rng from "./rng.js";
import * as items from "./items.js";
import * as inventory from "./inventory.js";
import { showMessage } from "./ui/prompt.js";
import { on } from "./events.js";
import * as iso from "./iso.js";
import { world as W } from "./tuning.js";
import { lineOfSight } from "./visibility.js";

let data = null;
const DAY = clock.DAY_LENGTH;

export function load(json) {
  data = json && json.crops && json.soil ? json : null;
}

export function get() {
  if (!data) throw new Error("data/crops.json is not loaded");
  return data;
}

export const cropDef = (kind) => get().crops[kind] || null;

// The crop a seed item plants, or null.
export function cropOfSeed(itemId) {
  for (const [kind, c] of Object.entries(get().crops)) if (c.seed === itemId) return kind;
  return null;
}

const stageStart = (kind, stage) => {
  const [a, b] = cropDef(kind).stages;
  return (stage <= 0 ? 0 : stage === 1 ? a : a + b) * DAY;
};

// A crop prop's record settled: one the map authored by stage gets its numbers now. Returns it.
export function settle(prop, now = clock.getElapsed()) {
  const c = prop && prop.crop;
  if (!c) return null;
  if (c.at === undefined) {
    c.grown = stageStart(c.kind, c.stage || 0);
    c.at = now;
    c.wetUntil = now + get().soil.wetDays * DAY;
    delete c.stage;
    map.touch(prop.tile[0], prop.tile[1]);
  }
  return c;
}

// Growth in clock seconds at `now`.
export function growth(prop, now = clock.getElapsed()) {
  const c = prop.crop;
  if (c.at === undefined) return stageStart(c.kind, c.stage || 0);
  return c.grown + Math.max(0, Math.min(now, c.wetUntil) - c.at);
}

// 0, 1, or 2 (ready).
export function stageOf(prop, now = clock.getElapsed()) {
  const [a, b] = cropDef(prop.crop.kind).stages;
  const g = growth(prop, now);
  return g < a * DAY ? 0 : g < (a + b) * DAY ? 1 : 2;
}

export function isWet(prop, now = clock.getElapsed()) {
  const c = prop.crop;
  return c.at === undefined || now < c.wetUntil;
}

// Game days of wet growth still to go before it is ready.
export function daysLeft(prop, now = clock.getElapsed()) {
  const [a, b] = cropDef(prop.crop.kind).stages;
  return Math.max(0, ((a + b) * DAY - growth(prop, now)) / DAY);
}

const spriteFor = (prop, now) => `crop_${prop.crop.kind}_${stageOf(prop, now)}`;

// Show the stage the crop is at: its sprite follows the derived stage.
export function refresh(prop, now = clock.getElapsed()) {
  const want = spriteFor(prop, now);
  if (prop.sprite !== want) map.restage(prop, want, prop.regrowAt ?? null);
}

// ---- the verbs ----
// Targets are addresses: a tile `{ tile: [x, y] }` (or the Use mode's `{ x, y }`), a prop by id; an item by `entry` (a uid) when the Use mode
// names one. Each re-validates when it fires, and every reach and hand check is the host's.

// Water a crop's soil: its growth so far is settled, and the soil is wet `wetDays` from now (the skin's watering and the bucket's pour).
export function soak(prop, now = clock.getElapsed()) {
  settle(prop, now);
  const c = prop.crop;
  c.grown = growth(prop, now);
  c.at = now;
  c.wetUntil = now + get().soil.wetDays * DAY;
  map.touch(prop.tile[0], prop.tile[1]);
}

// What stops a player reaching a tile, or null: too far, or a wall between (a shut door or shutter too: sight is what a wall stops, a fence and
// an open window pass it, and a sealed room stays a cell, #147; the reviewer of #194 farmed through a house wall). Every farming verb asks.
export function reachProblem(player, x, y) {
  if (Math.hypot(player.gx - x, player.gy - y) > W.pickReach) return "Too far away.";
  if (!lineOfSight(player.gx, player.gy, x, y)) return "There is a wall in the way.";
  return null;
}
export const reach = (player, x, y) => reachProblem(player, x, y) === null;
const tileOf = (t) => (Array.isArray(t.tile) ? [Math.round(t.tile[0]), Math.round(t.tile[1])] : [Math.round(t.x), Math.round(t.y)]);

// The tool a player holds that lists a verb ("till"), or null.
export function heldWith(player, verb) {
  for (const slot of ["main", "off"]) {
    const e = player.hands && player.hands[slot];
    if (e && (items.getItem(e.id).verbs || []).includes(verb)) return e;
  }
  return null;
}

// Whether the player carries a seed for a crop (the entry named, when the Use mode names one).
export function hasSeed(player, kind, uid) {
  const id = cropDef(kind).seed;
  if (uid != null) {
    const e = inventory.carriedEntry(player, uid);
    return !!e && e.id === id;
  }
  return inventory.countAll(player, id) > 0;
}

// A waterskin (or any water container) carried with at least the cost in it: the entry named, else the fullest.
export function skinFor(player, uid) {
  const cost = get().soil.fillCost;
  if (uid != null) {
    const e = inventory.carriedEntry(player, uid);
    return e && items.getItem(e.id).capacity && (e.fill ?? 0) >= cost ? e : null;
  }
  const all = [...inventory.waterContainers(inventory.bagOf(player)), ...(inventory.beltOf(player) || []).filter((e) => e && items.getItem(e.id).capacity)];
  return all.filter((e) => (e.fill ?? 0) >= cost).sort((p, q) => q.fill - p.fill)[0] || null;
}

const isTillable = (x, y) => {
  const t = map.peekTile(x, y);
  return !!t && (t.floor === "floor_grass" || t.floor === "floor_dirt") && !t.prop && map.isWalkableTile(x, y);
};
export const isSoil = (x, y) => {
  const t = map.peekTile(x, y);
  return !!t && !!map.furrowsOf(t.floor);
};

verbs.define("till", {
  validate(world, player, target) {
    const [x, y] = tileOf(target);
    if (!heldWith(player, "till")) return "You need a hoe in hand.";
    { const why = reachProblem(player, x, y); if (why) return why; }
    const t = map.peekTile(x, y);
    if (t && map.furrowsOf(t.floor)) return "It is already tilled.";
    if (!isTillable(x, y)) return "Nothing grows there: it wants bare grass or dirt.";
    return true;
  },
  perform(world, player, target) {
    const [x, y] = tileOf(target);
    // The furrows run along the way the player faces the tile: the axis the tile is farther along.
    const along = Math.abs(x - player.gx) >= Math.abs(y - player.gy) ? "floor_farm" : "floor_farm_y";
    map.setFloor(x, y, along);
    return { message: "You till the soil." };
  },
});

verbs.define("plant", {
  validate(world, player, target) {
    const [x, y] = tileOf(target);
    const kind = target.crop || (target.item ? cropOfSeed(target.item) : null);
    if (!kind || !cropDef(kind)) return "That is not a seed.";
    if (!hasSeed(player, kind, target.entry)) return "You have no seed for it.";
    { const why = reachProblem(player, x, y); if (why) return why; }
    if (!isSoil(x, y)) return "Seed wants tilled soil.";
    if (map.peekTile(x, y).prop) return "Something is already there.";
    return true;
  },
  perform(world, player, target) {
    const [x, y] = tileOf(target);
    const kind = target.crop || cropOfSeed(target.item);
    const now = clock.getElapsed();
    inventory.takeAll(player, cropDef(kind).seed, 1);
    const prop = map.createProp({ sprite: `crop_${kind}_0`, tile: [x, y], solid: false });
    prop.facing = map.furrowsOf(map.peekTile(x, y).floor) || prop.facing;
    prop.crop = { kind, grown: 0, at: now, wetUntil: now + get().soil.wetDays * DAY };
    delete prop.furrowsPending;
    map.placeProp(prop, x, y);
    return { message: `You plant ${items.getItem(cropDef(kind).seed).name.toLowerCase()}.` };
  },
});

// The crop a target names: the prop itself (the Use mode's own side), its id, or the crop standing on a tile.
const cropProp = (target) => {
  if (target.prop && typeof target.prop === "object") return target.prop;
  if (typeof target.prop === "string") return map.propById(target.prop);
  if (target.x !== undefined || Array.isArray(target.tile)) {
    const [x, y] = tileOf(target);
    const t = map.peekTile(x, y);
    return t && t.prop && t.prop.crop ? t.prop : null;
  }
  return null;
};

verbs.define("water", {
  validate(world, player, target) {
    const prop = cropProp(target);
    if (!prop || !prop.crop) return "Nothing is planted there.";
    { const why = reachProblem(player, prop.tile[0], prop.tile[1]); if (why) return why; }
    if (!skinFor(player, target.entry)) return "You need a waterskin with water in it.";
    return true;
  },
  perform(world, player, target) {
    const prop = cropProp(target);
    soak(prop);
    const skin = skinFor(player, target.entry);
    skin.fill -= get().soil.fillCost;
    return { message: "The water soaks in." };
  },
});

verbs.define("harvest", {
  validate(world, player, target) {
    const prop = cropProp(target);
    if (!prop || !prop.crop) return "There is nothing to harvest.";
    { const why = reachProblem(player, prop.tile[0], prop.tile[1]); if (why) return why; }
    settle(prop, boundaryAt(clock.getElapsed()));
    if (stageOf(prop) < 2) return "It is not ready yet.";
    const tool = cropDef(prop.crop.kind).tool; // the tool rule (#215): rye with a scythe, roots dug with a shovel, the heads cut with a knife; carried is enough
    if (tool) { const why = inventory.toolProblem(player, tool); if (why) return why; }
    return true;
  },
  perform(world, player, target) {
    const prop = cropProp(target);
    const def = cropDef(prop.crop.kind);
    const [lo, hi] = def.harvest.count;
    const n = lo + rng.int(hi - lo + 1);
    const parts = [];
    let fell = 0;
    for (const [id, count] of [[def.harvest.item, n], [def.seed, def.seeds]]) {
      const placed = Math.min(count, inventory.addItem(inventory.bagOf(player), id, count));
      if (placed < count) { map.dropItem(Math.round(player.gx), Math.round(player.gy), items.makeEntry(id, count - placed)); fell += count - placed; }
      parts.push(`${items.getItem(id).name.toLowerCase()} x${count}`);
    }
    map.removeProp(prop); // the tile stays soil
    return { message: `You harvest ${parts.join(" and ")}${fell ? `; ${fell} fall${fell > 1 ? "" : "s"} at your feet` : ""}.`, harvested: n, fell, gave: [[def.harvest.item, n], [def.seed, def.seeds]] };
  },
});

// The scythe (#200; docs/30 section 8 and 10, step 4's third default): a swing with a tool whose item `verbs` list `harvest`, in the hand that
// swung, harvests every ready grain crop on the three tiles ahead of the player (the tile in front and the two beside it), each by the
// `harvest` verb as a hand does (re-validated on the host: reach, ready), the grain and the seeds into the bag, the tiles staying soil. A
// swing at nothing, or at a crop not ready, still swings. It runs on the authority only: a guest's own swing is predicted without the
// event (combat.tryAttack), and the host's step makes this one.
export function scytheSwing(player) {
  const g = iso.screenDirToGrid(player.aim.sx, player.aim.sy);
  const dir = iso.normalize(g.gx, g.gy);
  const px = player.gx + dir.x;
  const py = player.gy + dir.y;
  const tiles = new Map();
  for (const k of [-1, 0, 1]) {
    const x = Math.round(px - dir.y * k);
    const y = Math.round(py + dir.x * k);
    tiles.set(`${x},${y}`, [x, y]);
  }
  const got = new Map();
  let cut = 0;
  let fell = 0; // what a full bag could not hold, on the ground at the player's feet (the hand harvest says so too)
  for (const [x, y] of tiles.values()) {
    const prop = map.peekTile(x, y)?.prop;
    if (!prop || !prop.crop || !cropDef(prop.crop.kind).grain) continue;
    const r = verbs.run("harvest", null, player, { prop: prop.id });
    if (!r.ok) continue;
    cut++;
    fell += r.fell || 0;
    for (const [id, n] of r.gave) got.set(id, (got.get(id) || 0) + n);
  }
  if (cut) showMessage(`You scythe ${cut} row${cut > 1 ? "s" : ""}: ${[...got].map(([id, n]) => `${items.getItem(id).name.toLowerCase()} x${n}`).join(", ")}${fell ? `; ${fell} fall${fell > 1 ? "" : "s"} at your feet` : ""}.`);
  return cut;
}

on("meleeSwing", ({ player, hand }) => {
  const e = player.hands && player.hands[hand === "off" ? "off" : "main"];
  if (e && (items.getItem(e.id).verbs || []).includes("harvest")) scytheSwing(player);
});

// The crops' pictures follow their stages, once a `fruitCheckSeconds` of the clock (the same boundary rule as fruit.js: a world restored
// from a save turns the same crops at the same boundary as one that ran on), and an authored crop is settled live.
let bucket = -1;
// The start of the pass's bucket that holds `now`: what a crop is settled at, so a restored world settles it as one that ran on did.
const boundaryAt = (now) => Math.floor(now / W.fruitCheckSeconds) * W.fruitCheckSeconds;
// A new world looks at once (-1); a restored one, whose crops were looked at up to the save, waits for its next boundary as the running one did.
export function reset(restored = false) {
  bucket = restored ? Math.floor(clock.getElapsed() / W.fruitCheckSeconds) : -1;
}

export function step() {
  const now = clock.getElapsed();
  const b = Math.floor(now / W.fruitCheckSeconds);
  if (b === bucket) return;
  bucket = b;
  const at = b * W.fruitCheckSeconds;
  for (const prop of map.allProps()) {
    if (!prop.crop) continue;
    settle(prop, at);
    refresh(prop, at);
  }
}
