// Trees: saplings and sticks (docs/46 section 4, step 3, #449; docs/39 section 4). Trees never regrow where they were felled in the valley;
// new trees come from saplings. Felling a tree (chop.js) drops a sapling item at `tuning.trees.sapling.chance` (Woodcutting 4, recorded and
// not enforced until the skills). The item is planted from the bag as set-down things are (its `place` names the first stage's sprite and its
// `stand` the rule "natural": setdown.js asks `standProblem` here), by the host's click and a guest's `setdown` command alike. A planted
// sapling carries `sapling: { at, waited }` on its prop, in clock seconds: when it was planted and how long its growing has waited, so its
// growth at any time is the clock since `at` less `waited` (derived, never stepped, as a crop's is); it shows each stage of `stages` for an
// equal share of `days` game days and is then the round oak (`grows`), an ordinary tree, felled for logs as any other. What is stepped (in
// game.begin, on the authority, once a `checkSeconds` of the clock on its boundary, as fruit.js looks at the trees): a sapling with someone
// standing on its tile waits, the time since the last look added to `waited` (and its chunk marked: the stamp is on the prop, so the save and
// the chunk to a guest carry it); otherwise its picture follows its stage (a restage, which marks its chunk), and once grown it becomes the
// tree in place, keeping its id, unless a wall or a room has come round it since (the stand rule again), when it waits as it is (and its
// Inspect says why). The tree is the round oak unless the sapling came from a tree whose definition names another (`saplingGrows`: an apple
// tree's sapling grows an apple tree), carried on the item's entry as `tree` and on the planted prop's record. Trees are no
// natural resource kind: a planted sapling and the tree it grows never count against resources.js's areas.
//
// Sticks under trees: the `sticks` verb on any standing tree (a prop with wood and a canopy, never a stump) gives `sticks.count` of the stick
// item to the bag (what does not fit at the feet), and the tree has none again until the next game day: `sticksAt` rides on the prop, the clock
// second of the next midnight, as a hive's `honeyAt` and a picked tree's `regrowAt` ride (nothing steps it; a tree has sticks when it has no
// `sticksAt` or the clock has passed it). The twig decals under trees (ground.js, `perTree`) are drawn as they were. Chance from rng.js, time
// from the clock; every verb takes the prop by id, so a guest's menu label does the same on the host.

import * as verbs from "./verbs.js";
import * as map from "./map.js";
import * as clock from "./clock.js";
import * as rng from "./rng.js";
import * as items from "./items.js";
import * as inventory from "./inventory.js";
import { getDef } from "./assets.js";
import { showMessage } from "./ui/prompt.js";
import { world as W, trees as T } from "./tuning.js";
import { reachProblem } from "./reach.js";

const DAY = clock.DAY_LENGTH;

// ---- saplings ----

export const isSapling = (prop) => !!prop && !!prop.sapling;

// Whether a body stands on the tile (x, y): the tile its feet round to.
const standsOn = (b, x, y) => !!b && Math.round(b.gx) === x && Math.round(b.gy) === y;

// Why a sapling may not be planted at (x, y), or "" when it may (the stand rule "natural"): open grass outdoors, the map's own base floor (so
// never a road, a path, a built floor, tilled soil, a rug, or water), nothing standing or lying there, not inside a room, and no wall of any
// kind on its four edges (so a tree never grows in a doorway, against a door, or against a house: a door's outside tile has the door on its
// edge). A read never grows a chunk: a tile not grown is no room. `self` is the sapling itself, when a planted one asks again before it grows
// into a tree; `items` false leaves out what lies on the tile (a tree may stand over something dropped beside its sapling).
export function standProblem(x, y, { self = null, items: withItems = true } = {}) {
  const t = map.peekTile(x, y);
  if (!t) return "No room";
  if ((t.prop && t.prop !== self) || t.rug) return "No room";
  if (withItems && t.items && t.items.length) return "No room";
  if (map.roomAt(x, y) > 0) return "Outdoors only";
  if (t.floor !== map.baseFloor()) return "Open grass only";
  const s = map.peekTile(x, y + 1);
  const e = map.peekTile(x + 1, y);
  if (t.n || t.w || (s && s.n) || (e && e.w)) return "Not against a wall";
  return "";
}

// A sapling's prop is planted now: its growing starts from the clock.
// `tree` is the tree it grows into, carried from the felling on the item's entry (an apple tree's sapling grows an apple tree), or none
// for the default, the round oak (`tuning.trees.sapling.grows`).
export function plant(prop, now = clock.getElapsed(), tree = null) {
  prop.sapling = { at: now, waited: 0, ...(tree ? { tree } : {}) };
  return prop;
}

// The tree a sapling from a felled tree of `sprite` grows into, as the sapling's entry carries it: the felled tree's definition's
// `saplingGrows` (an apple tree's, laden or bare, is the apple tree, so felling one never loses the orchard for good), else null, the
// default (the round oak). A default, Michael's to overrule (#461).
export function growsFrom(sprite) {
  let d = null;
  try { d = getDef(sprite); } catch { return null; }
  const g = d && typeof d.saplingGrows === "string" ? d.saplingGrows : null;
  return g && g !== T.sapling.grows ? g : null;
}

// The tree a planted sapling (its `sapling` record) or a sapling's entry (its `tree`) grows into.
export const treeOf = (rec) => (rec && rec.tree) || T.sapling.grows;

// A tree's name for a line: "an apple tree", else "a tree".
function treeName(sprite) {
  let n = null;
  try { n = getDef(sprite).name; } catch { n = null; }
  return n ? `${/^[aeiou]/i.test(n) ? "an" : "a"} ${n}` : "a tree";
}
export const treeWords = treeName;

const total = () => T.sapling.days * DAY;

// Growth in clock seconds at `now`: the time since it was planted, less the time it has waited.
export function growth(prop, now = clock.getElapsed()) {
  const s = prop.sapling;
  return Math.max(0, now - s.at - (s.waited || 0));
}

// Its stage at `now`: 0 .. stages.length - 1 while growing, stages.length once it is grown (a tree at the next look).
export function stageOf(prop, now = clock.getElapsed()) {
  const n = T.sapling.stages.length;
  const g = growth(prop, now) + 1e-6;
  if (g >= total()) return n;
  return Math.min(n - 1, Math.floor(g / (total() / n)));
}

// Game days of growing still to go.
export function daysLeft(prop, now = clock.getElapsed()) {
  return Math.max(0, (total() - growth(prop, now)) / DAY);
}

// The line its Inspect says (interact.js), on any client from the prop's stamp and the clock.
// A sapling that can no longer grow into its tree (a wall, a fence, a gate, or a door on its edge since, a room closed round it) says the
// stand rule's reason instead, the review of #461.
export function report(prop, now = clock.getElapsed()) {
  const what = treeName(treeOf(prop.sapling));
  const why = standProblem(prop.tile[0], prop.tile[1], { self: prop, items: false });
  if (why) return `A sapling that cannot grow into ${what} here: ${why.toLowerCase()}. It waits until that changes.`;
  if (stageOf(prop, now) >= T.sapling.stages.length) return `A sapling, ready to grow into ${what}: it waits while anyone stands on it.`;
  const days = Math.max(1, Math.ceil(daysLeft(prop, now)));
  return `A sapling: ${what} in about ${days} day${days > 1 ? "s" : ""} of growing, which waits while anyone stands on it.`;
}

// Felling a tree of `sprite` sometimes drops a sapling on its tile (chop.js, on the authority): one roll of the sim's generator. The entry
// carries the tree it grows into when that is not the default (`tree`, growsFrom). Returns the entry on the floor, or null.
export function fellDrop(tx, ty, sprite = null) {
  if (!(rng.float() < T.sapling.chance)) return null;
  const tree = sprite ? growsFrom(sprite) : null;
  return map.dropItem(tx, ty, items.makeEntry(T.sapling.item, 1, tree ? { tree } : {}));
}

// A grown sapling becomes the tree in its place, keeping its id; null (it waits as it is) while the stand rule refuses it now.
export function growUp(prop) {
  const [x, y] = prop.tile;
  if (standProblem(x, y, { self: prop, items: false })) return null;
  const id = prop.id;
  map.removeProp(prop);
  const tree = map.createProp({ id, sprite: treeOf(prop.sapling), tile: [x, y] });
  map.placeProp(tree, x, y); // marks its chunk: the save's copy goes, and a guest gets the chunk with the tree
  return tree;
}

// The saplings looked at once a `checkSeconds` of the clock, on its boundary (the same rule as fruit.js and farming.js: a world restored from
// a save looks at the same boundary as one that ran on). `bodies` is every character, or a function that lists them, asked only when a
// sapling stands.
let bucket = -1;
export function reset(restored = false) {
  bucket = restored ? Math.floor(clock.getElapsed() / T.checkSeconds) : -1;
}

export function step(bodies = []) {
  const now = clock.getElapsed();
  const b = Math.floor(now / T.checkSeconds);
  if (b === bucket) return;
  const last = bucket < 0 ? null : bucket * T.checkSeconds;
  bucket = b;
  const at = b * T.checkSeconds;
  let who = null;
  for (const prop of map.allProps()) {
    if (!prop.sapling) continue;
    if (!who) who = typeof bodies === "function" ? bodies() : bodies;
    const [x, y] = prop.tile;
    if (who.some((c) => standsOn(c, x, y))) {
      // Someone stands on it: its growing since the last look waits (none before it was planted, none on a first look).
      const lost = Math.max(0, at - Math.max(last ?? at, prop.sapling.at));
      if (lost > 0) {
        prop.sapling.waited = (prop.sapling.waited || 0) + lost;
        map.touch(x, y); // the stamp is on the prop: the save's copy and a guest's chunk
      }
      continue;
    }
    const st = stageOf(prop, at);
    if (st >= T.sapling.stages.length) {
      growUp(prop);
      continue;
    }
    const want = T.sapling.stages[st];
    if (prop.sprite !== want) map.restage(prop, want, null);
  }
}

// ---- sticks under trees ----

export const NONE_TODAY = "There are no more sticks under this tree today.";

// A tree standing: a prop with wood and a canopy (an apple tree too), never a stump.
export function isStandingTree(prop) {
  if (!prop || !prop.wood) return false;
  let d = null;
  try { d = getDef(prop.sprite); } catch { return false; }
  return !!d.canopy && !d.felled;
}

// The clock second a tree has sticks again, or null (it has some now, or has never been gathered under).
export const sticksAt = (prop) => (prop && Number.isFinite(prop.sticksAt) ? prop.sticksAt : null);

export function hasSticks(prop, now = clock.getElapsed()) {
  if (!isStandingTree(prop)) return false;
  const at = sticksAt(prop);
  return at === null || at <= now;
}

// The next game day's start: the first clock second of the day after `now`'s.
export const nextDay = (now = clock.getElapsed()) => (Math.floor(now / DAY) + 1) * DAY;

verbs.define("sticks", {
  validate(world, player, target) {
    const prop = map.propById(target.prop);
    if (!isStandingTree(prop)) return "There is no tree there.";
    if (!hasSticks(prop)) return NONE_TODAY;
    { const why = reachProblem(player, prop.tiles, W.pickReach); if (why) return why; } // a sealed room is a cell (#147)
    return true;
  },
  perform(world, player, target) {
    const prop = map.propById(target.prop);
    if (!hasSticks(prop)) return false; // two at one tree: the second finds them taken
    const S = T.sticks;
    const [lo, hi] = S.count;
    const n = lo + rng.int(hi - lo + 1);
    const bag = inventory.bagOf(player);
    const placed = bag ? Math.min(n, inventory.addItem(bag, S.item, n)) : 0;
    if (placed < n) map.dropItem(Math.round(player.gx), Math.round(player.gy), items.makeEntry(S.item, n - placed));
    prop.sticksAt = nextDay(clock.getElapsed());
    map.touchProp(prop); // the chunk to a guest, and the save's copy dropped
    const what = items.countName(S.item, n);
    return { gathered: n, message: placed < n ? `You gather ${what}; ${n - placed} at your feet.` : `You gather ${what}.` };
  },
});

// A standing tree's entry: Gather sticks while it has some, greyed with why once taken today. Nothing on any other prop. The caller
// (interact.js) puts it after the tree's own actions. It is the menu's alone, never E's (Primary on #461): E opens doors and shutters, and
// the woods ring every house, so a tree a tile nearer than a door must never take it.
export function propActions(prop, player, act, world) {
  if (!isStandingTree(prop)) return [];
  const base = { kind: "sticks", tiles: prop.tiles, mx: prop.tile[0], my: prop.tile[1] };
  if (!hasSticks(prop)) return [act({ ...base, label: "Gather sticks (none until tomorrow)", enabled: false })];
  return [act({
    ...base,
    simple: false, // menu-only: never E's
    label: "Gather sticks",
    duration: T.sticks.seconds,
    perform() {
      const r = verbs.run("sticks", world, player, { prop: prop.id });
      if (!r.ok && r.reason) showMessage(r.reason);
      else if (r.message) showMessage(r.message);
      return r.ok;
    },
  })];
}
