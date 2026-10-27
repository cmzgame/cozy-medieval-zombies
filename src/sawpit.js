// The sawpit (docs/43 section 6, #410): a prop whose sprite definition says `"saw": true` saws a log into planks with no hatchet (Woodcutting 3,
// open to all until skills). What it saws is `work.saw.item` in `data/tuning.json` and what that gives is the item's own `splitsInto` (a log's
// three planks), so the sawpit and a hatchet's Split never disagree. The `saw` verb takes the prop by id and one log from wherever the player
// carries it (the bag, the belt, a hand); the planks go to the bag and what does not fit falls at the player's feet. The menu's entry is a
// timed action that runs the verb, so a guest's choice of the label does the same on the host.

import * as verbs from "./verbs.js";
import * as map from "./map.js";
import * as items from "./items.js";
import * as inventory from "./inventory.js";
import { getDef } from "./assets.js";
import { showMessage } from "./ui/prompt.js";
import { work as WK } from "./tuning.js";
import { reachProblem } from "./reach.js";
import { REACH } from "./stations.js";

const sawnName = () => items.getItem(WK.saw.item).name.toLowerCase();
const article = (name) => (/^[aeiou]/i.test(name) ? `an ${name}` : `a ${name}`);

export function isSawpit(prop) {
  if (!prop) return false;
  try { return !!getDef(prop.sprite).saw; } catch { return false; }
}

// What one cut gives: { id, count } (the sawn item's `splitsInto`), or null.
export function yieldOf() {
  const def = items.hasItemDef(WK.saw.item) ? items.getItem(WK.saw.item) : null;
  return def && def.splitsInto ? def.splitsInto : null;
}

verbs.define("saw", {
  validate(world, player, target) {
    const prop = map.propById(target.prop);
    if (!isSawpit(prop)) return "There is no sawpit there.";
    if (!yieldOf()) return "There is nothing to saw.";
    { const why = reachProblem(player, prop.tiles, REACH, prop.layer || 0); if (why) return why; }
    if (inventory.countAll(player, WK.saw.item) < 1) return `You need ${article(sawnName())}.`;
    return true;
  },
  perform(world, player) {
    const out = yieldOf();
    if (!out || inventory.takeAll(player, WK.saw.item, 1) < 1) return false;
    const bag = inventory.bagOf(player);
    const placed = bag ? inventory.addItem(bag, out.id, out.count) : 0;
    for (let i = placed; i < out.count; i++) map.dropItem(Math.round(player.gx), Math.round(player.gy), items.makeEntry(out.id, 1), player.layer || 0);
    const name = items.getItem(out.id).name.toLowerCase();
    const fell = out.count - placed;
    const message = fell > 0 ? `You saw the ${sawnName()} into ${out.count} ${name}s; ${fell} ${fell === 1 ? "falls" : "fall"} at your feet.` : `You saw the ${sawnName()} into ${out.count} ${name}s.`;
    return { sawn: out.count, message };
  },
});

// The sawpit's one entry: Saw a log into 3 planks, greyed with no log carried.
export function propActions(prop, player, act, world) {
  if (!isSawpit(prop)) return [];
  const out = yieldOf();
  if (!out) return [];
  const has = inventory.countAll(player, WK.saw.item) > 0;
  const what = items.countName(out.id, out.count);
  return [act({
    kind: "saw",
    simple: has,
    label: has ? `Saw ${article(sawnName())} into ${what}` : `Saw ${article(sawnName())} into ${what} (no ${sawnName()} carried)`,
    enabled: has,
    tiles: prop.tiles,
    mx: prop.tile[0],
    my: prop.tile[1],
    duration: WK.saw.seconds,
    perform() {
      const r = verbs.run("saw", world, player, { prop: prop.id });
      if (!r.ok && r.reason) showMessage(r.reason);
      else if (r.message) showMessage(r.message);
      return r.ok;
    },
  })];
}
