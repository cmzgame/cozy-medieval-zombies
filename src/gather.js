// Gathering by hand and digging (docs/46 step 2, #448; docs/39 section 4). A prop whose sprite definition has a `gather` block is gathered
// by hand (an herb, Herbalism 1 to 7; a mushroom foraged, Herbalism 3), and one with a `dig` block is dug with a tool carried (a clay bank,
// Mining 3, with the shovel):
//   "gather": { "item": "sage", "count": [1, 1], "seconds": 1.5, "skill": "herbalism", "level": 1 }
//   "gather": { "item": "grave_moss", ..., "night": true }                       only at night (the graveyard's)
//   "gather": { "item": "mushroom", ..., "word": "Forage" }                       the menu's verb, "Gather" by default
//   "dig": { "item": "clay", "count": [2, 2], "seconds": 3, "skill": "mining", "level": 3, "tool": "dig" }   a tool whose item `verbs` list
//                                                                                 it, carried anywhere (the tool rule, inventory.carriedTool)
// The item goes to the bag, and what does not fit falls at the player's feet; the node goes, its replacement owed to its area first
// (resources.taken), so it comes back elsewhere in its area a game day or two later. The skill and level are the data's record and are not
// enforced: every gate is open to all until the skills are built (docs/39). Salt is mined, not dug: a salt rock has a `mine` block
// (mining.js), a pickaxe in hand. Both verbs take the prop by id; the menu's entry is a timed action that runs the verb, so a guest's choice
// of the same label does the same on the host. Everything but the code is data: the items, counts, seconds, levels, and words.

import * as verbs from "./verbs.js";
import * as map from "./map.js";
import * as clock from "./clock.js";
import * as rng from "./rng.js";
import * as items from "./items.js";
import * as inventory from "./inventory.js";
import * as resources from "./resources.js";
import { getDef } from "./assets.js";
import { showMessage } from "./ui/prompt.js";
import { world as W } from "./tuning.js";
import { reachProblem } from "./reach.js";

// The verbs and the block each reads off a sprite definition, with its words and the field its result counts (the floating number, tuning.floaters.gathers).
const VERBS = {
  gather: { field: "gather", word: "Gather", result: "gathered", nothing: "There is nothing to gather." },
  dig: { field: "dig", word: "Dig", result: "dug", nothing: "There is nothing to dig." },
};

export const ONLY_AT_NIGHT = "only at night";

// A prop's block for a verb, or null (a tree, a rock).
export function blockOf(prop, verb = "gather") {
  if (!prop) return null;
  try { return getDef(prop.sprite)[VERBS[verb].field] || null; } catch { return null; }
}

// Why the block cannot be taken now by this player, or null: the graveyard's only at night, a dig's tool carried. Reach is the verb's.
export function blockProblem(player, b) {
  if (b.night && clock.getPhase() !== "night") return `It can be gathered ${ONLY_AT_NIGHT}.`;
  if (b.tool) return inventory.toolProblem(player, b.tool);
  return null;
}

// The menu's words: "Gather sage", "Forage mushroom", "Dig clay".
export function labelOf(b, verb = "gather") {
  return `${b.word || VERBS[verb].word} ${items.getItem(b.item).name.toLowerCase()}`;
}

// The verb's row: the same for both, the block and the words its own.
function rowFor(verb) {
  const V = VERBS[verb];
  return {
    validate(world, player, target) {
      const prop = map.propById(target.prop);
      if (!prop) return "There is nothing there.";
      const b = blockOf(prop, verb);
      if (!b) return V.nothing;
      const why = blockProblem(player, b);
      if (why) return why;
      const far = reachProblem(player, prop.tiles, W.pickReach); // a sealed room is a cell (#147): a wall in the way refuses it
      if (far) return far;
      return true;
    },
    perform(world, player, target) {
      const prop = map.propById(target.prop);
      const b = blockOf(prop, verb);
      if (!b || blockProblem(player, b)) return false; // two at one node: the second finds it gone
      const [lo, hi] = b.count;
      const n = lo + rng.int(hi - lo + 1);
      const bag = inventory.bagOf(player);
      const placed = bag ? Math.min(n, inventory.addItem(bag, b.item, n)) : 0;
      if (placed < n) map.dropItem(Math.round(player.gx), Math.round(player.gy), items.makeEntry(b.item, n - placed));
      resources.taken(prop); // its replacement is owed to its area, before it goes (none for a node in the wild)
      map.removeProp(prop); // marks its chunk: the save's copy goes, and a guest gets the chunk without it
      const name = items.getItem(b.item).name.toLowerCase();
      const word = (b.word || V.word).toLowerCase();
      const message = placed < n ? `You ${word} ${n} ${name}; ${n - placed} at your feet.` : `You ${word} ${n} ${name}.`;
      return { [V.result]: n, message };
    },
  };
}

verbs.define("gather", rowFor("gather"));
verbs.define("dig", rowFor("dig"));

// A node's entry on its menu: the label, greyed with why it cannot be taken now (only at night, the tool), a timed action of the block's
// seconds that runs the verb. Nothing for a prop that is not a node of either verb.
export function propActions(prop, player, act, world) {
  const out = [];
  for (const verb of Object.keys(VERBS)) {
    const b = blockOf(prop, verb);
    if (!b) continue;
    const label = labelOf(b, verb);
    const base = { kind: verb, tiles: prop.tiles, mx: prop.tile[0], my: prop.tile[1] };
    const why = blockProblem(player, b);
    if (why) {
      const short = b.night && clock.getPhase() !== "night" ? ONLY_AT_NIGHT : `need ${why.replace(/^You need /, "").replace(/\.$/, "")}`;
      out.push(act({ ...base, label: `${label} (${short})`, enabled: false }));
      continue;
    }
    out.push(act({
      ...base,
      simple: true,
      label,
      duration: b.seconds,
      perform() {
        const r = verbs.run(verb, world, player, { prop: prop.id });
        if (!r.ok && r.reason) showMessage(r.reason);
        else if (r.message) showMessage(r.message);
        return r.ok;
      },
    }));
  }
  return out;
}
