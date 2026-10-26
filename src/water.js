// Water, tainted and clean (docs/44; Michael, 2026-10-19 and 2026-10-25, #279). No fixed source is clean: the wells, the river, the ponds, the trough, and
// the font are all tainted (`tuning.water.clean` names the sprites of any that are safe, none). A skin's water is tainted unless its entry is marked
// `clean`; filling it at a tainted source taints the whole of it (mixing taints), and the kit's skin starts clean (data/kit.json, src/kit.js).
//
// Boiling (Cooking 1, open to all until the skills are built): one verb, `boil`, at a lit cooking fire (a fire that `cooks`: a fireplace, a hearth, a
// campfire, the oven), by the fire's prop id and the skin's uid, three ways in that cannot disagree: Use a tainted skin then click the fire
// (data/interactions.json's row, `args.timed`), the skin's menu in the bag or on the belt (Boil water, greyed with why when no lit fire is in reach), and
// the fire's menu (Boil water for the fullest tainted skin carried, greyed with why when none is). Each starts the same timed bar (`boilAction`,
// `boilSeconds`), whose end runs the verb again, which checks everything afresh and sets `clean`, the fill kept. Skins only for now (Primary's default):
// a bucket cannot be drunk from and nothing moves water between vessels yet, so its boil waits for the boiling pot's fluid transfer (docs/44 section 7).
// The fire must be lit; boiling burns no extra fuel. Run on the host; a guest's Use and menus reach it as the host's player's do.

import * as verbs from "./verbs.js";
import * as map from "./map.js";
import { getItem } from "./items.js";
import { bagOf, beltOf, carriedEntry } from "./inventory.js";
import { reachProblem, canReach } from "./reach.js";
import { water as W } from "./tuning.js";
import { world } from "./world.js";
import { showMessage } from "./ui/prompt.js";

export const NO_FIRE = "No lit fire in reach.";
export const NO_TAINTED = "No tainted water carried.";
// Fill waterskins at a tainted source with every skin that could take water holding clean water (Michael, 2026-10-26: the fill skips them).
export const CLEAN_KEPT = "Your waterskins hold clean water: they won't be filled from tainted water.";

// A source by its sprite (a well, a trough, the font) or a water floor: clean only if `tuning.water.clean` names it.
export const cleanSource = (sprite) => !!sprite && (W.clean || []).includes(sprite);

// The source at a tile: the prop's water if it has one, else the floor's.
export function sourceCleanAt(x, y) {
  const t = map.peekTile(x, y);
  if (!t) return false;
  return t.prop && t.prop.water ? cleanSource(t.prop.sprite) : cleanSource(t.floor);
}

// An entry's water is tainted unless it is marked clean.
export const isTainted = (entry) => !!entry && !entry.clean;

// Water poured into a vessel from a source (a skin or a bucket filled): a tainted source taints it all, a clean one into an empty vessel is clean, and
// a clean one over tainted water leaves it tainted. Call before the fill is changed.
export function mixInto(entry, sourceClean) {
  if (!sourceClean) delete entry.clean;
  else if (!((entry.fill ?? 0) > 0)) entry.clean = true;
}

// A vessel the card and the icon speak of: a waterskin (`capacity`) or a bucket (`vessel`), holding water.
export const holdsWater = (entry) => {
  const def = entry && getItem(entry.id);
  return !!def && !!(def.capacity || def.vessel) && (entry.fill ?? 0) > 0;
};

// A skin that can be boiled: a waterskin with tainted water in it.
export const boilable = (entry) => !!entry && !!getItem(entry.id).capacity && (entry.fill ?? 0) > 0 && isTainted(entry);

// Every waterskin carried with tainted water in it, the fullest first (the fire's menu boils that one, docs/44's default): the bag's, then the belt's,
// in that order among equals.
export function taintedSkins(player) {
  const out = [];
  const bag = bagOf(player);
  if (bag) for (const e of bag.items) if (boilable(e)) out.push(e);
  for (const e of beltOf(player) || []) if (boilable(e)) out.push(e);
  return out.sort((a, b) => (b.fill ?? 0) - (a.fill ?? 0)); // stable: the bag's before the belt's at one fill
}

// Why a prop will not boil water for this player now, or "".
export function fireProblem(player, prop) {
  if (!prop || !prop.fire || !prop.fire.cooks) return "That is no cooking fire.";
  if (!prop.fire.lit) return "The fire is out.";
  return reachProblem(player, prop.tiles, W.boilReach) || "";
}

// The nearest lit cooking fire within reach of the player, or null.
export function litFireNear(player) {
  const px = Math.round(player.gx);
  const py = Math.round(player.gy);
  const r = Math.ceil(W.boilReach) + 2; // a fireplace's anchor tile may sit a little off its nearest tile
  let best = null;
  let bestD = Infinity;
  const seen = new Set();
  for (let dy = -r; dy <= r; dy++) {
    for (let dx = -r; dx <= r; dx++) {
      const p = map.peekTile(px + dx, py + dy)?.prop; // a hit test never grows a chunk
      if (!p || seen.has(p)) continue;
      seen.add(p);
      if (!p.fire || !p.fire.cooks || !p.fire.lit || !canReach(player, p.tiles, W.boilReach)) continue;
      const d = Math.min(...p.tiles.map(([x, y]) => Math.hypot(player.gx - x, player.gy - y)));
      if (d < bestD) { bestD = d; best = p; }
    }
  }
  return best;
}

const propOf = (t) => (typeof t.prop === "string" ? map.propById(t.prop) : t.prop || null);

// The skin a boil is for: the one named by its uid (the Use mode, the skin's menu, a guest's command), else the fullest tainted one carried (the fire's menu).
const skinFor = (player, uid) => (uid != null ? carriedEntry(player, uid) : taintedSkins(player)[0] || null);

function skinProblem(entry) {
  const def = getItem(entry.id);
  if (!def.capacity) return def.vessel ? "A bucket cannot be boiled yet." : "There is no water in that to boil.";
  if (!((entry.fill ?? 0) > 0)) return "The waterskin is empty.";
  if (!isTainted(entry)) return "That water is already clean.";
  return "";
}

// The timed bar, the same for the three ways in: the fire's tiles, `boilReach`, `boilSeconds`; its end runs the verb, which checks everything again.
export function boilAction(player, uid, prop) {
  return {
    kind: "boil",
    label: "Boil water",
    tiles: prop.tiles,
    mx: prop.tile[0],
    my: prop.tile[1] - 0.6,
    range: W.boilReach,
    duration: W.boilSeconds,
    enabled: true,
    simple: false,
    perform() {
      const r = verbs.run("boil", world, player, { prop: prop.id, entry: uid });
      if (!r.ok) showMessage(r.reason || "Nothing happens.");
      else if (r.message) showMessage(r.message);
      return r.ok;
    },
  };
}

// `boil` (target: { prop: id or prop, entry: uid or none }; args: { timed }): with `timed`, the bar starts (the Use row and the skin's menu); without it,
// the water is boiled now (the bar's end).
verbs.define("boil", {
  validate(world, player, target) {
    if (player.carrying) return "Your hands are full.";
    const prop = propOf(target);
    const why = fireProblem(player, prop);
    if (why) return why;
    const e = skinFor(player, target.entry);
    if (!e) return target.entry != null ? "You don't have that with you." : "You have no tainted water to boil.";
    return skinProblem(e) || true;
  },
  perform(world, player, target, args = {}) {
    const prop = propOf(target);
    const e = skinFor(player, target.entry);
    if (args.timed) {
      player.action = { action: boilAction(player, e.uid, prop), elapsed: 0 }; // as interact.startAction starts a timed one
      return { started: true };
    }
    e.clean = true; // the fill is kept
    return { message: "The water boils. It is clean now." };
  },
});
