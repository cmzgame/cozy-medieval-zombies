// What an item card says (#262; the law "Every item in a grid has a hover card", docs/02): the full name, the kind, and the direct uses, all read from the data and never
// written per item: `data/items.json` (food, drink, weapon, hands, wear, verbs, bag, fire, splitsInto, repair, dye, tags: a seed, an herb, a dye plant, a mushroom name the kind), `data/interactions.json` (what the item can be Used on),
// `data/recipes.json` (what it is made at and goes into), `data/crops.json` (what a seed plants), `data/dyes.json` (what a vat dyes it). It touches no DOM (it reads the registries the game loads: items, interactions, recipes, crops, and the build kinds), so a headless world can ask it and the check can read it;
// ui/hover-card.js draws what this returns. A card is { name, kind, state, lines, fine }: `lines` and `fine` are lists of lines, a line a list of segments { t, k } where `k`
// is "use" for the word Use (drawn in --gold, Michael 2026-10-18), "word" for another menu word (Eat, Equip, Drink, Apply), or absent for plain text.

import { getItem, wearPerHit, wearPerShot, toolFor } from "./items.js";
import { work, trees } from "./tuning.js"; // the repair ladders and the sawpit's item (docs/43 section 6); the sapling and the sticks (docs/46 step 3)
import * as interactions from "./interactions.js";
import * as stations from "./stations.js";
import * as farming from "./farming.js";
import { buildKinds } from "./placement.js";
import { isWoodWall } from "./woods.js";
import * as dye from "./dye.js";
import { holdsWater, isTainted } from "./water.js"; // clean or tainted (docs/44)
import { sourcesOf, snareRule, keptFrom } from "./entities/animal.js"; // where a yield comes from, the snare (docs/45 section 2), and what keeping gives (section 3)
import { defIdsWith, getDef } from "./assets.js"; // the nodes a gathered thing comes from (docs/46 step 2)
import { resourceKindOf } from "./map.js"; // and where they grow: the map's resource kinds

const KIND = { food: "Food", tool: "Tool", material: "Material", clothing: "Clothing", bag: "Bag", ammo: "Ammunition", medicine: "Medicine", drink: "Drink", decor: "Decor" };
const MAX_LINES = 8; // a small card: the name and the basics, not a page
const cap = (s) => (s ? s[0].toUpperCase() + s.slice(1) : s);
const seg = (t, k) => (k ? { t, k } : { t });
const line = (...parts) => parts.map((p) => (typeof p === "string" ? seg(p) : p));

// What a player calls the ground and the things a Use row names, where the sprite's id is not it.
const WORDS = { floor_farm: "tilled soil", floor_farm_y: "tilled soil", floor_water: "water", floor_water_shallow: "water", floor_grass: "grass", floor_dirt: "bare earth", crop: "crops" };

// A target of a Use row, named: a sprite id or a tag, as words.
function nameOfOn(on) {
  if (on === "fire") return "fire";
  if (on === "bracket") return "wall bracket";
  if (on === "character") return "person";
  if (on === "zombie") return "the dead";
  if (on === "corpse") return "a body of the dead";
  if (on === "tile") return "the ground";
  if (WORDS[on]) return WORDS[on];
  return on.replace(/^floor_/, "").replace(/_y$/, "").replace(/_/g, " ");
}

// "a, b or c"; past four, the first three and "more".
function listOf(names) {
  if (names.length === 1) return names[0];
  if (names.length <= 4) return `${names.slice(0, -1).join(", ")} or ${names[names.length - 1]}`;
  return `${names.slice(0, 3).join(", ")} and more`;
}

const an = (n) => `${/^[aeiou]/i.test(n) ? "an" : "a"} ${n}`;
function listOr(names) {
  return names.length <= 1 ? names.join("") : `${names.slice(0, -1).join(", ")} or ${names[names.length - 1]}`;
}
function getDefSafe(id) {
  try {
    return getDef(id);
  } catch {
    return null;
  }
}

// The Use rows for an item, grouped by their verb: [{ verb, on: [names] }].
export function usesOf(def) {
  const groups = new Map();
  for (const r of interactions.all()) {
    if (r.use !== def.id && !(def.tags && def.tags.includes(r.use))) continue;
    const verb = (r.verb || "use").toLowerCase();
    if (!groups.has(verb)) groups.set(verb, []);
    const name = nameOfOn(r.on);
    if (!groups.get(verb).includes(name)) groups.get(verb).push(name);
  }
  return [...groups].map(([verb, on]) => ({ verb, on }));
}

// Where a gathered thing comes from (docs/46 step 2, #448), read from the data: every node whose sprite definition gives it (its `gather`,
// `dig`, or `mine` block) and the map's resource kind that node belongs to, which says where it grows (`where`) and whether only at night:
// "Grows wild near water; gathered by hand.", "Grows wild in the graveyard; gathered by hand, only at night.", "Forage under trees.", "Dug from the clay banks by the river, a shovel carried.", "Mined
// from salt rocks at the iron workings, a pickaxe in hand." A kind with no `where` (the valley's rocks and ore today) says nothing.
export function gatheredFrom(def) {
  const out = [];
  for (const field of ["gather", "dig", "mine"]) {
    for (const sid of defIdsWith(field)) {
      const sd = getDef(sid);
      const b = sd[field];
      if (!b || b.item !== def.id) continue;
      const kind = resourceKindOf(sid);
      if (!kind || !kind.where) continue;
      const where = kind.where;
      const night = kind.night || b.night ? ", only at night" : "";
      const node = `${sd.name || sid.replace(/_\d+$/, "").replace(/_/g, " ")}s`;
      let text;
      if (field === "gather") text = b.word ? `${b.word} ${where}${night}.` : `Grows wild ${where}; gathered by hand${night}.`;
      else if (field === "dig") { const t = toolFor(b.tool); text = `Dug from the ${node} ${where}${t ? `, ${an(t.name.toLowerCase())} carried` : ""}.`; }
      else { const t = toolFor("mine"); text = `Mined from ${node} ${where}${t ? `, ${an(t.name.toLowerCase())} in hand` : ""}.`; }
      if (!out.includes(text)) out.push(text);
    }
  }
  return out;
}

// What a tree gives besides its logs (docs/46 step 3, #449), read from the tuning (trees.js): the sapling a felling sometimes drops, and the
// sticks gathered under a standing tree once a day: "Sometimes dropped by a felled tree (about 1 in 3).", "Gathered under any standing
// tree, 1 to 2 a day from each tree."
export function fromTrees(def) {
  const out = [];
  if (def.id === trees.sapling.item) out.push(`Sometimes dropped by a felled tree (about 1 in ${Math.max(1, Math.round(1 / trees.sapling.chance))}).`);
  if (def.id === trees.sticks.item) {
    const [lo, hi] = trees.sticks.count;
    out.push(`Gathered under any standing tree, ${lo === hi ? lo : `${lo} to ${hi}`} a day from each tree.`);
  }
  return out;
}

// The recipes that make it, and those it goes into, as station words: { madeAt: [stations], goesInto: [{ name, station }] }.
export function recipesOf(def) {
  const madeAt = [];
  const goesInto = [];
  for (const r of stations.recipes()) {
    if (!stations.isOpen(r)) continue; // a recipe a world rule keeps off is not on a card (docs/43 section 5)
    if (r.out && r.out.id === def.id && !madeAt.includes(r.station)) madeAt.push(r.station);
    if ((r.in || []).some((w) => w.id === def.id || (w.tag && def.tags && def.tags.includes(w.tag)))) {
      const out = r.out && r.out.id ? getItem(r.out.id).name : r.label ? r.label : r.out && r.out.prop ? cap(r.out.prop.replace(/_/g, " ")) : r.id; // a recipe's own label first (the jack-o'-lantern's prop is "pumpkin")
      if (!goesInto.some((g) => g.name === out)) goesInto.push({ name: out, station: r.station });
    }
  }
  return { madeAt, goesInto };
}

const stationWord = (s) => (s === "cooking" ? "a cooking fire" : `the ${s.replace(/_/g, " ")}`);

// The card for an item entry (a bag's, a slot's, a container's): never null for a known item.
export function cardFor(entry) {
  const def = entry && getItem(entry.id);
  if (!def) return { name: String(entry && entry.id), kind: "", state: "", lines: [], fine: [] };
  const lines = [];
  let kind = KIND[def.kind] || cap(def.kind || "");
  if (def.tags && def.tags.includes("seed")) kind = "Seed";
  else if (def.tags && def.tags.includes("sapling")) kind = "Seedling"; // a young tree to plant (docs/46 step 3), not "Sapling | Sapling"
  else if (def.kind === "material" && def.tags && def.tags.includes("dye")) kind = "Dye plant"; // woad, madder, weld (docs/46 step 2): gathered as herbs
  else if (def.kind === "material" && def.tags && def.tags.includes("herb")) kind = "Herb"; // what Herbalism gathers (docs/39 section 4); garlic, a crop, stays Food
  else if (def.kind === "material" && def.tags && def.tags.includes("mushroom")) kind = "Forage"; // a mushroom, foraged (Herbalism 3): not food until Cooking says how it is eaten
  else if (def.book) kind = "Spell book";
  else if (def.staff) kind = "Staff";
  else if (def.bow) kind = "Bow";
  else if (def.shield) kind = "Shield";
  else if (def.weapon && def.kind === "tool") kind = "Tool, weapon";

  // What it does, in the order a player reaches for it.
  if (def.kind === "food") {
    const bits = [];
    if (def.heal) bits.push(`heals ${def.heal}`);
    if (def.hunger) bits.push(`fills hunger ${def.hunger}`);
    if (def.thirst) bits.push(`quenches thirst ${def.thirst}`);
    lines.push(line(seg("Eat", "word"), `: ${bits.join(", ") || "a bite"}.`));
  }
  if (def.capacity) lines.push(line(seg("Drink", "word"), `: ${Math.round(entry.fill ?? 0)}% full; fill it at water.`));
  // Which water it holds (docs/44 section 3): the item's name never changes, the card says it, and a brown drop marks a tainted one's icon (inventory-panel.js).
  if (holdsWater(entry)) lines.push(line(!isTainted(entry) ? "Clean water." : def.capacity ? "Tainted water: drinking it may make you Sick." : "Tainted water."));
  if (def.bandage) lines.push(line(seg("Apply", "word"), ": closes a bleeding wound."));
  if (def.weapon) {
    const w = def.weapon;
    lines.push(line(`${w.damage} damage${w.range ? `, reach ${w.range}` : ""}${w.stamina ? `; ${w.stamina} stamina a swing` : ""}.`)); // the cost since docs/41 step 4: stamina is the one pacer of melee
    // The main hand's other mode on the middle button or Q (docs/21), with its own numbers and cost: the halberd's thrust.
    const a = w.alt;
    if (a && a.damage) lines.push(line(`${a.name ? a.name[0].toUpperCase() + a.name.slice(1) : "Other mode"} (middle button or Q): ${a.damage} damage${a.range ? `, reach ${a.range}` : ""}${a.stamina ? `; ${a.stamina} stamina` : ""}.`));
    // A weapon thrown on the middle button or Q (docs/21): the spear. A full throw does the whole of it.
    const th = def.thrown;
    if (th && th.damage) lines.push(line(`Throw (middle button or Q): ${th.damage} damage at full draw, up to ${th.range} tiles${th.breakChance ? `; may break (${Math.round(th.breakChance * 100)}%)` : ""}.`));
  }
  if (def.bow) lines.push(line(`Draw and release to shoot arrows${def.shots ? `; good for about ${def.shots} shots` : ""}.`));
  if (def.rug) lines.push(line(seg("Place", "word"), ": lay on the floor."));
  if (def.painting) lines.push(line(seg("Place", "word"), ": hang on a wall's face."));
  if (def.place === "campfire") lines.push(line(seg("Place", "word"), ": set down outdoors as a campfire, cold and empty.")); // docs/43, section 3
  // docs/43, section 4: set down as its prop, by where it may stand; food placed as decoration does not come back food; a bracket hung as a painting is.
  if (def.place && def.place !== "campfire") lines.push(line(seg("Place", "word"), def.stand === "natural" ? ": plant on open grass outdoors." : def.stand === "outdoors" ? ": set down outdoors." : ": set down on the floor."));
  // A sapling (docs/46 step 3): what it grows into and how long, from the tuning (trees.js).
  if (def.id === trees.sapling.item) {
    // The tree it grows into: the one its entry carries (an apple tree's sapling, #461), else a tree (the round oak, the default).
    const n = entry.tree && getDefSafe(entry.tree) ? getDefSafe(entry.tree).name : null;
    lines.push(line(`Grows into ${n ? an(n) : "a tree"} in about ${trees.sapling.days} game days; it waits while anyone stands on it.`));
  }
  if (def.placeAs) lines.push(line(seg("Place as decoration", "word"), ": set down on the floor; picked up again, it is a decoration, not food."));
  if (def.bracket) lines.push(line(seg("Place", "word"), ": hang on a wall's face, to hold a torch."));
  if (def.hands) lines.push(line(seg("Equip", "word"), `: ${def.hands === "both" ? "both hands" : def.hands === "either" ? "main or off hand" : `${def.hands} hand`}.`));
  if (def.wear) lines.push(line(seg("Equip", "word"), `: worn on your ${def.wear}${def.bag ? `; holds ${def.bag[0]}×${def.bag[1]}` : ""}${def.beltSlots ? `; ${def.beltSlots} belt slots` : ""}.`));
  // What a dye vat can do to it (docs/43 section 8): its regions' colours, or its schemes, counted as the picker shows them (ui/dye-panel.js):
  // a palette colour equal to the item's own is its Undyed swatch, not one more (the breeches' own is Walnut brown, the boots' Dark brown).
  const dyes = dye.dyeOf(def);
  if (dyes) lines.push(line(`Can be dyed at a dye vat: ${dyes.schemes ? `${dyes.schemes.length} schemes` : dyes.regions.map((r, i) => `${r.choices.filter((c) => c.hex !== dyes.own[i]).length} colours${dyes.regions.length > 1 ? ` for the ${r.name.toLowerCase()}` : ""}`).join(", ")}.`));
  if (def.verbs && def.verbs.length) lines.push(line(`For: ${def.verbs.join(", ")}.`));
  if (def.fire) lines.push(line(`Gives light${def.fire.burnsDown ? "; burns down while lit" : ""}.`));
  for (const u of usesOf(def)) lines.push(line(seg("Use", "use"), ` on ${listOf(u.on)}: ${u.verb}.`));
  const crop = def.tags && def.tags.includes("seed") ? farming.cropOfSeed(def.id) : null;
  if (crop) lines.push(line(`Grows ${crop} on tilled soil.`));
  if (def.splitsInto) lines.push(line(`Splits into ${def.splitsInto.count} ${getItem(def.splitsInto.id).name.toLowerCase()}s.`));
  if (def.splitsInto && def.id === work.saw.item) lines.push(line(`A sawpit saws it into ${getItem(def.splitsInto.id).name.toLowerCase()}s with no hatchet.`)); // docs/43 section 6
  // Repairs that run out (docs/43 section 6): where, with what, and how many in its life.
  const rep = def.repair && (wearPerHit(def) > 0 || wearPerShot(def) > 0) ? def.repair : null;
  if (rep) {
    const mat = getItem(rep.with).name.toLowerCase();
    const n = Math.max(work.grindstone.ceilings.length, work.anvil.ceilings.length);
    lines.push(line(`Repaired at an anvil with ${/^[aeiou]/.test(mat) ? "an" : "a"} ${mat}${rep.edged ? ", or sharpened at a grindstone" : ""}; ${n} repairs in all.`));
  }
  const rec = recipesOf(def);
  if (rec.madeAt.length) lines.push(line(`Made at ${rec.madeAt.slice(0, 2).map(stationWord).join(" or ")}.`));
  if (rec.goesInto.length) lines.push(line(`Goes into: ${rec.goesInto.slice(0, 4).map((g) => g.name.toLowerCase()).join(", ")}${rec.goesInto.length > 4 ? " and more" : ""}.`));
  // What it builds: the walls of every wood are one entry ("wood wall"), a region's wood never appears (it is offered only with Free building on), and a door, a window, a fence, a gate each their own.
  const builds = [];
  for (const k of buildKinds()) {
    if (!k.cost || !k.cost[def.id] || k.region) continue;
    const name = isWoodWall(k.sprite) && k.kind === "wall" ? "wood wall" : (k.label || k.id).toLowerCase();
    const text = `${name} (${k.cost[def.id]})`;
    if (!builds.includes(text)) builds.push(text);
  }
  if (builds.length) lines.push(line(`Builds: ${builds.slice(0, 6).join(", ")}${builds.length > 6 ? " and more" : ""}.`));
  if (def.tags && def.tags.includes("fuel")) lines.push(line("Burns as fuel."));
  if (def.toCome) lines.push(line(`To come: ${def.toCome}.`)); // what a material waits for, said on its card (leather, docs/45 step 4)
  // Where an animal's yield comes from (docs/45 section 2, read from data/animals.json): skinned or butchered from which kinds.
  const from = sourcesOf(def.id);
  if (from.length) {
    const how = (h) => from.filter((f) => f.how === h).map((f) => f.species);
    const bits = [];
    if (how("skin").length) bits.push(`skinned from ${listOr(how("skin").map(an))}`);
    if (how("butcher").length) bits.push(`butchered from ${listOr(how("butcher").map(an))}`);
    lines.push(line(`${cap(bits.join("; "))}, a dirk carried.`));
  }
  // What keeping gives (docs/45 section 3): a fed cow's milk, a sheep's wool, a hen's egg and feather; what feed is for; what a lead does.
  for (const k of keptFrom(def.id)) {
    if (k.how === "milk") lines.push(line(`Milked from ${an(`fed ${k.species}`)}, a bucket carried.`));
    else if (k.how === "shear") lines.push(line(`Shorn from ${an(`fed ${k.species}`)}, shears carried.`));
    else lines.push(line(`Laid by ${an(`fed ${k.species}`)} into its coop.`));
  }
  if (def.tags && def.tags.includes("feed")) lines.push(line("Feed: put in a feeding trough, a tame animal near it eats one a day."));
  if (def.verbs && def.verbs.includes("lead")) lines.push(line("Leads a tame animal; let go, it stays where it stands."));
  if (def.verbs && def.verbs.includes("shear")) lines.push(line("Shears a fed sheep's wool."));
  if (def.verbs && def.verbs.includes("milk")) lines.push(line("Milks a fed cow."));
  if (def.place && getDefSafe(def.place) && getDefSafe(def.place).snare) {
    const sn = snareRule();
    lines.push(line(`Set near rabbits, it holds one after about ${sn.hours} game hours.`));
  }
  for (const t of gatheredFrom(def)) lines.push(line(t)); // where it is gathered (docs/46 step 2)
  for (const t of fromTrees(def)) lines.push(line(t)); // a sapling from a felling, sticks under a tree (docs/46 step 3)

  const state = [];
  if (entry.count > 1) state.push(`×${entry.count}`);
  if (entry.fill != null && !def.capacity) state.push(`${Math.round(entry.fill)}% full`);
  if (entry.wear > 0) state.push(`${Math.round((1 - entry.wear) * 100)}% left`);
  if (rep && entry.repairs > 0) {
    const left = Math.max(0, Math.max(work.grindstone.ceilings.length, work.anvil.ceilings.length) - entry.repairs);
    state.push(left ? `${left} repair${left > 1 ? "s" : ""} left` : "past repair");
  }
  const dyed = dye.colourWords(entry);
  if (dyed) state.push(dyed); // what it was dyed, by the vat's names
  return { name: def.name, kind, state: state.join(" · "), lines: lines.slice(0, MAX_LINES), fine: [line("Right-click for actions.")] };
}

// The card for an empty slot: its name and what goes in it.
export function cardForSlot(label) {
  return { name: label, kind: "Empty slot", state: "", lines: [], fine: [] };
}

// The card as plain text, for the check and the log: one string per line.
export function textOf(card) {
  const flat = (l) => l.map((s) => s.t).join("");
  return [card.name, [card.kind, card.state].filter(Boolean).join(" · "), ...card.lines.map(flat), ...card.fine.map(flat)].filter(Boolean);
}
