// Chopping (#195; docs/30 sections 4 and 10: "chop a tree or a stump (hatchet)"): a hatchet in a hand fells a tree, which drops its logs and
// leaves a stump; the hatchet on the stump gives a log and clears the tile. A tool is an item whose `verbs` list the verb (`chop`), so a
// better axe is a row in data; the seconds and the stump's sprite are `world.chopSeconds` and `world.stumpSprite`. Felled logs are the one
// renewable wood: the forest is as large as it is (Primary's reading, #195). A felled tree sometimes drops a sapling on its tile (docs/46
// step 3, #449: trees.fellDrop, its chance in data), which a player plants to grow a new one (trees.js).

import * as verbs from "./verbs.js";
import * as map from "./map.js";
import * as items from "./items.js";
import { getDef } from "./assets.js";
import { showMessage } from "./ui/prompt.js";
import { world as W } from "./tuning.js";
import { reachProblem } from "./reach.js"; // distance and a clear line (#208)
import { fellDrop } from "./trees.js"; // a felled tree sometimes drops a sapling (docs/46 step 3)

// The tool a player holds that chops, or null.
export function heldAxe(player) {
  for (const slot of ["main", "off"]) {
    const e = player.hands && player.hands[slot];
    if (e && (items.getItem(e.id).verbs || []).includes("chop")) return e;
  }
  return null;
}

// Whether a prop is a stump: what a felled tree leaves (its definition says `felled`).
export const isStump = (prop) => !!prop && !!getDef(prop.sprite).felled;

verbs.define("chop", {
  validate(world, player, target) {
    const prop = typeof target.prop === "string" ? map.propById(target.prop) : target.prop;
    if (!prop || !prop.wood) return "There is nothing there to chop.";
    if (!heldAxe(player)) return "You need a hatchet in hand.";
    { const why = reachProblem(player, [prop.tile], W.pickReach, prop.layer || 0); if (why) return why; } // a wall between refuses it too (#208)
    return true;
  },
  perform(world, player, target) {
    const prop = typeof target.prop === "string" ? map.propById(target.prop) : target.prop;
    if (!prop || !prop.wood) return false; // two choppers: the second finds it gone
    const [tx, ty] = prop.tile;
    const logs = prop.wood;
    const stump = isStump(prop);
    const tree = !!getDef(prop.sprite).canopy;
    map.removeProp(prop);
    for (let i = 0; i < logs; i++) map.dropItem(tx, ty, { id: "log", count: 1 });
    let sapling = false;
    if (tree) {
      const s = map.createProp({ sprite: W.stumpSprite, tile: [tx, ty] }); // a felled tree leaves its stump
      map.placeProp(s, tx, ty);
      sapling = !!fellDrop(tx, ty, prop.sprite); // and sometimes a sapling of its kind, by the sim's generator (Woodcutting 4, open to all until the skills)
    }
    const n = `${logs} log${logs > 1 ? "s" : ""}`;
    showMessage(stump ? `${n} from the stump, and the ground is clear.` : tree ? `${n} on the ground, and a stump${sapling ? "; a sapling fell too" : ""}.` : `${n} on the ground.`);
    return { logs, sapling };
  },
});
