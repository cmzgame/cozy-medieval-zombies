// The beehives give honey (docs/43 section 6, #410; Beastlore 5, open to all until skills): a prop whose sprite definition says `"hive": true`
// holds honey until it is taken, then makes more `work.honey.days` of the clock later (`data/tuning.json`). The day it has honey again rides on
// the prop as `honeyAt`, in the clock's seconds, as a picked apple tree's `regrowAt` does (fruit.js), so the save and the chunk to a guest carry
// it; nothing steps it, since the hive's picture does not change: a hive has honey when it has no `honeyAt` or the clock has passed it.
//
// Honey goes into a clay jar (docs/02, 2026-10-26, Honey goes into a clay jar; #500): taking honey needs an empty clay jar carried (the
// filled item's own `jar` field in data/items.json names it, so one source names both), refused without one; the `honey` verb fills the jar
// in its own place exactly as a drunk potion empties its vial there (potions.placeOf, potions.vacate), else the bag, else the feet with its
// line. Honey is food that never rots (2026-10-23) and pemmican's binder when pemmican comes; eating a jar of honey, or spending it in a
// recipe, leaves the empty jar behind the same way (interact.js's `eatOne`, stations.js's `take`, both reading the same `jar` field). The
// menu's entry is a timed action that runs the verb, so a guest's choice of the label does the same on the host.

import * as verbs from "./verbs.js";
import * as map from "./map.js";
import * as clock from "./clock.js";
import * as items from "./items.js";
import * as grid from "./grid.js";
import * as inventory from "./inventory.js";
import { getDef } from "./assets.js";
import { showMessage } from "./ui/prompt.js";
import { work as WK } from "./tuning.js";
import { reachProblem } from "./reach.js";
import { REACH } from "./stations.js";
import { placeOf, vacate } from "./potions.js"; // the jar's own place, filled exactly as a vial empties

const article = (name) => (/^[aeiou]/i.test(name) ? `an ${name}` : `a ${name}`);

export const NEED_JAR = "You need a clay jar to take honey.";

// The empty jar an empty take needs, the first reached (the hands, the belt, then the bag; inventory.findItem's order), or null: never a
// nearby chest, as the ruling says "carried". Its id comes off the filled item's own `jar` field, so the two stay in step.
function emptyJar(player) {
  const jarId = items.getItem(WK.honey.item).jar;
  const found = jarId && inventory.findItem(player, jarId);
  return found ? found.entry : null;
}

// Fills one empty jar into the filled item, in the jar's own place when the last of its stack frees it, else the bag, else the feet with its
// line (as potions.spendVial leaves a vial). True once a jar is found; validate already refused when there is none. Today's
// `work.honey.count` is always [1, 1], so one jar is exactly what one take needs; a hive yielding more would want its own ruling.
function fillJar(player) {
  const entry = emptyJar(player);
  if (!entry) return false;
  const honeyId = WK.honey.item;
  const place = placeOf(player, entry);
  let put = null;
  if ((entry.count || 1) > 1) entry.count -= 1;
  else if (place) put = vacate(player, entry, place);
  const jar = items.makeEntry(honeyId, 1);
  if (put && put(jar)) return true;
  const bag = inventory.bagOf(player);
  if (bag && grid.add(bag, honeyId, 1) === 1) return true;
  map.dropItem(Math.round(player.gx), Math.round(player.gy), jar, player.layer || 0);
  showMessage(`Your bag is full: ${article(items.getItem(honeyId).name.toLowerCase())} is at your feet.`);
  return true;
}

export function isHive(prop) {
  if (!prop) return false;
  try { return !!getDef(prop.sprite).hive; } catch { return false; }
}

// The clock second a hive has honey again, or null (it has some now, or has never been taken from).
export const honeyAt = (prop) => (prop && Number.isFinite(prop.honeyAt) ? prop.honeyAt : null);

export function hasHoney(prop) {
  if (!isHive(prop)) return false;
  const at = honeyAt(prop);
  return at === null || at <= clock.getElapsed();
}

verbs.define("honey", {
  validate(world, player, target) {
    const prop = map.propById(target.prop);
    if (!isHive(prop)) return "There is no hive there.";
    if (!hasHoney(prop)) return "The bees have made no more honey yet.";
    if (!emptyJar(player)) return NEED_JAR;
    { const why = reachProblem(player, prop.tiles, REACH, prop.layer || 0); if (why) return why; }
    return true;
  },
  perform(world, player, target) {
    const prop = map.propById(target.prop);
    if (!hasHoney(prop)) return false; // two at one hive: the second finds it taken
    if (!fillJar(player)) return false; // a jar spent since validate (another guest, the same step): refused quietly, as the hive above
    const H = WK.honey;
    prop.honeyAt = clock.getElapsed() + H.days * clock.DAY_LENGTH;
    map.touchProp(prop); // the chunk to a guest, and the save's copy dropped
    const name = items.getItem(H.item).name.toLowerCase();
    return { taken: 1, message: `You take ${article(name)} from the hive.` };
  },
});

// A hive's one entry: Take honey while it has some, else when it will.
export function propActions(prop, player, act, world) {
  if (!isHive(prop)) return [];
  const base = { kind: "honey", tiles: prop.tiles, mx: prop.tile[0], my: prop.tile[1] };
  if (!hasHoney(prop)) {
    const days = Math.max(1, Math.ceil((honeyAt(prop) - clock.getElapsed()) / clock.DAY_LENGTH));
    return [act({ ...base, label: `No honey yet (more in about ${days} day${days > 1 ? "s" : ""})`, enabled: false })];
  }
  return [act({
    ...base,
    simple: true,
    label: "Take honey",
    duration: WK.honey.seconds,
    perform() {
      const r = verbs.run("honey", world, player, { prop: prop.id });
      if (!r.ok && r.reason) showMessage(r.reason);
      else if (r.message) showMessage(r.message);
      return r.ok;
    },
  })];
}
