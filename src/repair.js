// Repairs that run out (docs/43 section 6, #410; Michael, 2026-10-25: "each does inevitably decay down the ladder to death"). A weapon or tool
// that can be made and that wears names its repair in its item definition, `"repair": { "with": <material>, "edged"?: true }` (the validator
// holds it to an item a recipe makes); its entry carries one count, `repairs`, saved with it and sent in the player's record like its `wear`.
// Two places repair, each a prop whose sprite definition names it (`"repair": "grindstone"` or `"anvil"`), each with its own ladder of
// ceilings in `data/tuning.json` `work`; the count is the rung, so every repair anywhere lowers the next:
//   the grindstone sharpens an edged one for free, up to 60%, then 40%, then 20% of its condition (Blacksmithing 2, open to all until skills);
//   the anvil repairs any of them up to 100%, then 80%, then 60%, for one unit of its material with a smith's hammer carried (Blacksmithing 4).
// Past the last rung it is past repair, and wears on to breaking. The verbs `sharpen` and `repair` take the prop by id and the entry by its
// uid, wherever the player carries it (a hand, the belt, the bag); the menu's entries are timed actions that run them, so a guest's choice of
// the same label does the same on the host. Skills will raise the ceilings; nothing here reads one yet.

import * as verbs from "./verbs.js";
import * as map from "./map.js";
import * as items from "./items.js";
import * as inventory from "./inventory.js";
import { getDef } from "./assets.js";
import { showMessage } from "./ui/prompt.js";
import { work as WK } from "./tuning.js";
import { reachProblem } from "./reach.js";
import { REACH } from "./stations.js"; // the click's reach, as a station's (2.6 tiles)

// The repair block of an item's definition, or null: only a thing that wears has one that counts.
export function repairOf(def) {
  const r = def && def.repair;
  if (!r || !r.with) return null;
  return items.wearPerHit(def) > 0 || items.wearPerShot(def) > 0 ? r : null;
}

// Which repairing place a prop is ("grindstone", "anvil"), or null.
export function placeOf(prop) {
  if (!prop) return null;
  let r = null;
  try { r = getDef(prop.sprite).repair; } catch { return null; }
  return r === "grindstone" || r === "anvil" ? r : null;
}

export const repairsOf = (entry) => (entry && entry.repairs) || 0;

// How many repairs a thing takes in its life: the longer ladder's rungs (three).
export function rungs() {
  return Math.max(WK.grindstone.ceilings.length, WK.anvil.ceilings.length);
}

// The ceiling a repair at this place reaches for this entry now, as a share of a whole (0.6), or null when it is past repair here.
export function ceilingAt(place, entry) {
  const c = WK[place] && WK[place].ceilings[repairsOf(entry)];
  return Number.isFinite(c) ? c : null;
}

// Whole percent of condition left, as a guest sees it too: the wire carries a wear to the hundredth (net.js), so a label made from it
// is the same text on a guest's menu as on the host's (performByLabel matches labels).
export const percentLeft = (entry) => 100 - Math.round(((entry && entry.wear) || 0) * 100);

const article = (name) => (/^[aeiou]/i.test(name) ? `an ${name}` : `a ${name}`);

// Why this entry cannot be repaired at this place now, or null.
export function problem(place, player, entry) {
  if (!entry) return "You are not carrying that.";
  const def = items.getItem(entry.id);
  const r = repairOf(def);
  if (!r) return place === "grindstone" ? "That cannot be sharpened." : "That cannot be repaired.";
  if (place === "grindstone" && !r.edged) return "Only an edge is sharpened on a grindstone.";
  const c = ceilingAt(place, entry);
  if (c === null) return "It is worn past repair.";
  if (percentLeft(entry) >= Math.round(c * 100)) return place === "grindstone" ? "It is as sharp as the stone can make it." : "The anvil can do no more for it.";
  if (place === "anvil") {
    const tool = inventory.toolProblem(player, WK.anvil.uses);
    if (tool) return tool;
    if (inventory.countAll(player, r.with) < 1) return `You need ${article(items.getItem(r.with).name.toLowerCase())}.`;
  }
  return null;
}

// Every distinct entry the player carries: the hands (a two-handed thing once), the belt, the bag.
function carried(player) {
  const out = [];
  const add = (e) => { if (e && !out.includes(e)) out.push(e); };
  add(player.hands && player.hands.main);
  add(player.hands && player.hands.off);
  for (const e of inventory.beltOf(player) || []) add(e);
  const bag = inventory.bagOf(player);
  if (bag) for (const e of bag.items) add(e);
  return out;
}

function define(place, verb) {
  verbs.define(verb, {
    validate(world, player, target) {
      const prop = map.propById(target.prop);
      if (!prop || placeOf(prop) !== place) return "There is nothing there to do that with.";
      { const why = reachProblem(player, prop.tiles, REACH); if (why) return why; } // a wall between refuses it (#208)
      return problem(place, player, inventory.carriedEntry(player, target.uid)) || true;
    },
    perform(world, player, target) {
      const entry = inventory.carriedEntry(player, target.uid);
      if (!entry || problem(place, player, entry)) return false; // run twice, the second finds it done
      const c = ceilingAt(place, entry);
      const r = repairOf(items.getItem(entry.id));
      if (place === "anvil") inventory.takeAll(player, r.with, 1);
      const wear = 1 - c;
      if (wear > 0) entry.wear = wear;
      else delete entry.wear;
      entry.repairs = repairsOf(entry) + 1;
      const left = Math.max(0, rungs() - entry.repairs);
      const name = items.getItem(entry.id).name.toLowerCase();
      const what = place === "grindstone" ? `You sharpen the ${name}` : `You repair the ${name}, spending ${article(items.getItem(r.with).name.toLowerCase())}`;
      const message = `${what}: ${percentLeft(entry)}%. ${left ? `It will take ${left} more repair${left > 1 ? "s" : ""}.` : "It will take no more repairs."}`;
      return { repaired: entry.uid, repairs: entry.repairs, message };
    },
  });
}
define("grindstone", "sharpen");
define("anvil", "repair");

// The menu's entries at a grindstone or an anvil: one for each worn thing carried that this place can still better, with what it would
// reach ("Sharpen arming sword (35% to 60%)", "Repair hoe (20% to 100%, a plank)"); one past repair, or missing the hammer or the material,
// greyed with why; nothing to do, one greyed line that says what the place does, or "(nothing it can better)" when what is worn is
// already at or above this place's ceiling for it.
export function propActions(prop, player, act, world) {
  const place = placeOf(prop);
  if (!place) return [];
  const verb = place === "grindstone" ? "sharpen" : "repair";
  const word = place === "grindstone" ? "Sharpen" : "Repair";
  const base = { kind: verb, tiles: prop.tiles, mx: prop.tile[0], my: prop.tile[1] };
  const out = [];
  let aboveCeiling = false; // something worn was carried, but at or above what this place reaches for it now
  for (const entry of carried(player)) {
    const def = items.getItem(entry.id);
    const r = repairOf(def);
    if (!r || !(entry.wear > 0) || (place === "grindstone" && !r.edged)) continue;
    const name = def.name.toLowerCase();
    const c = ceilingAt(place, entry);
    if (c === null) {
      out.push(act({ ...base, label: `${word} ${name} (worn past repair)`, enabled: false }));
      continue;
    }
    if (percentLeft(entry) >= Math.round(c * 100)) { aboveCeiling = true; continue; } // this place can do nothing for it now
    const why = problem(place, player, entry);
    const material = place === "anvil" ? `, ${article(items.getItem(r.with).name.toLowerCase())}` : "";
    const need = why && why.startsWith("You need ") ? why.slice("You need ".length).replace(/\.$/, "") : null;
    out.push(act({
      ...base,
      label: need ? `${word} ${name} (need ${need})` : `${word} ${name} (${percentLeft(entry)}% to ${Math.round(c * 100)}%${material})`,
      enabled: !why,
      duration: WK[place].seconds,
      perform() {
        const res = verbs.run(verb, world, player, { prop: prop.id, uid: entry.uid });
        if (!res.ok && res.reason) showMessage(res.reason);
        else if (res.message) showMessage(res.message, 4);
        return res.ok;
      },
    }));
  }
  if (!out.length) out.push(act({ ...base, label: aboveCeiling ? `${word} (nothing it can better)` : place === "grindstone" ? "Sharpen (no dull blade carried)" : "Repair (nothing worn carried)", enabled: false }));
  return out;
}
