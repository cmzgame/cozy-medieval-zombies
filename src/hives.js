// The beehives give honey (docs/43 section 6, #410; Beastlore 5, open to all until skills): a prop whose sprite definition says `"hive": true`
// holds honey until it is taken, then makes more `work.honey.days` of the clock later (`data/tuning.json`). The day it has honey again rides on
// the prop as `honeyAt`, in the clock's seconds, as a picked apple tree's `regrowAt` does (fruit.js), so the save and the chunk to a guest carry
// it; nothing steps it, since the hive's picture does not change: a hive has honey when it has no `honeyAt` or the clock has passed it. The
// `honey` verb takes the prop by id; the honey goes to the bag and what does not fit falls at the player's feet. Honey is food that never rots
// (2026-10-23) and pemmican's binder when pemmican comes. The menu's entry is a timed action that runs the verb, so a guest's choice of the
// label does the same on the host.

import * as verbs from "./verbs.js";
import * as map from "./map.js";
import * as clock from "./clock.js";
import * as rng from "./rng.js";
import * as items from "./items.js";
import * as inventory from "./inventory.js";
import { getDef } from "./assets.js";
import { showMessage } from "./ui/prompt.js";
import { work as WK } from "./tuning.js";
import { reachProblem } from "./reach.js";
import { REACH } from "./stations.js";

const article = (name) => (/^[aeiou]/i.test(name) ? `an ${name}` : `a ${name}`);
const some = (n, name) => (n === 1 ? article(name) : `${n} ${name.replace(/^(\w+)/, "$1s")}`); // "a pot of honey", "2 pots of honey"

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
    { const why = reachProblem(player, prop.tiles, REACH); if (why) return why; }
    return true;
  },
  perform(world, player, target) {
    const prop = map.propById(target.prop);
    if (!hasHoney(prop)) return false; // two at one hive: the second finds it taken
    const H = WK.honey;
    const [lo, hi] = H.count;
    const n = lo + rng.int(hi - lo + 1);
    const bag = inventory.bagOf(player);
    const placed = bag ? Math.min(n, inventory.addItem(bag, H.item, n)) : 0;
    if (placed < n) map.dropItem(Math.round(player.gx), Math.round(player.gy), items.makeEntry(H.item, n - placed));
    prop.honeyAt = clock.getElapsed() + H.days * clock.DAY_LENGTH;
    map.touch(prop.tile[0], prop.tile[1]); // the chunk to a guest, and the save's copy dropped
    const name = items.getItem(H.item).name.toLowerCase();
    const message = placed < n ? `You take ${some(n, name)} from the hive; ${n - placed} at your feet.` : `You take ${some(n, name)} from the hive.`;
    return { taken: n, message };
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
