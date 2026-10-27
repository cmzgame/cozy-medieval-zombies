// What an item card says (#262; the law "Every item in a grid has a hover card", docs/02): the full name, the kind, and the direct uses, all read from the data and never
// written per item: `data/items.json` (food, drink, weapon, thrown, bow and its ammo, book.spell, staff, ignite, hands, wear, verbs, bag, fire, splitsInto, repair, dye, toCome, tags: a seed, an herb, a dye plant, a mushroom name the kind), `data/interactions.json` (what the item can be Used on, and what a Use makes of it),
// `data/recipes.json` (what it is made at and goes into, and a row's own `verb`: Tear), `data/combat.json` (the flight's defaults and the burn), `data/crops.json` (what a seed plants), `data/dyes.json` (what a vat dyes it). It touches no DOM (it reads the registries the game loads: items, interactions, recipes, crops, and the build kinds), so a headless world can ask it and the check can read it;
// ui/hover-card.js draws what this returns. A card is { name, kind, state, lines, fine }: `lines` and `fine` are lists of lines, a line a list of segments { t, k } where `k`
// is "use" for the word Use (drawn in --gold, Michael 2026-10-18), "word" for another menu word (Eat, Equip, Drink, Apply), or absent for plain text.

import { getItem, allItems, wearPerHit, wearPerShot, toolFor, countName, pluralName, namePlural, nounName } from "./items.js";
import { shotDamage, tunables as shot } from "./archery.js"; // a shot's damage by the draw and the flight's defaults (data/combat.json `bow`): the bow, a throw, a spell (#317)
import { BURN } from "./burn.js"; // what burning does to the dead (data/combat.json `burn`): a fire arrow's and a fireball's line
import { POISON, coatOf, coatWords, effectWords as poisonEffect } from "./poison.js"; // a poison's numbers, a blade's coat, a poisoned arrow's line (data/combat.json `poison`)
import { propName } from "./prop-names.js"; // a prop's name in words: its recipe's label, its definition's `name`, else its id
import { beltAction, ROLE_WORD } from "./inventory.js"; // what a belt slot's key does by its role (2026-10-25)
import { work, trees, potions as POTIONS } from "./tuning.js"; // the repair ladders and the sawpit's item (docs/43 section 6); the sapling and the sticks (docs/46 step 3); what a potion does (docs/47 section 4)
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

const KIND = { food: "Food", tool: "Tool", material: "Material", clothing: "Clothing", bag: "Bag", ammo: "Ammunition", medicine: "Medicine", drink: "Drink", decor: "Decor", potion: "Potion", poison: "Poison" };
const MAX_LINES = 8; // a small card: the name and the basics, not a page
const cap = (s) => (s ? s[0].toUpperCase() + s.slice(1) : s);
const seg = (t, k) => (k ? { t, k } : { t });
const line = (...parts) => parts.map((p) => (typeof p === "string" ? seg(p) : p));

// What a player calls the ground and the things a Use row names, where the sprite's id is not it.
const WORDS = { floor_farm: "tilled soil", floor_farm_y: "tilled soil", floor_water: "water", floor_water_shallow: "water", floor_grass: "grass", floor_dirt: "bare earth", crop: "crops", blade: "a blade", arrow: "arrows" }; // `blade` a tag (docs/47 section 6), `arrow` the plain arrows a poison coats

// A target of a Use row, named: a sprite id or a tag, as words.
function nameOfOn(on) {
  if (on === "fire") return "fire";
  if (on === "bracket") return "a torch on a wall"; // the light verb's rows: a torch in a bracket, a player's or the map's (#523: no Wall bracket item)
  if (on === "character") return "person";
  if (on === "zombie") return "the dead";
  if (on === "corpse") return "a body of the dead";
  if (on === "tile") return "the ground";
  if (WORDS[on]) return WORDS[on];
  if (on.startsWith("floor_")) return on.replace(/^floor_/, "").replace(/_y$/, "").replace(/_/g, " "); // a floor's id, not a prop's
  return propName(on); // a prop's sprite id by prop-names.js (the jack-o'-lantern, not "pumpkin"); an item's id or a tag in words
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
    if (!interactions.usedBy(r, { id: def.id })) continue; // its id or a tag, or its id alone on an `exact` row (interactions.js)
    const verb = (r.verb || "use").toLowerCase();
    if (!groups.has(verb)) groups.set(verb, []);
    const name = nameOfOn(r.on);
    if (!groups.get(verb).includes(name)) groups.get(verb).push(name);
  }
  return [...groups].map(([verb, on]) => ({ verb, on }));
}

// Where a gathered thing comes from (docs/46 step 2, #448), read from the data: every node whose sprite definition gives it (its `gather`,
// `dig`, or `mine` block) and the map's resource kind that node belongs to, which says where it grows (`where`):
// "Grows wild near water; gathered by hand.", "Grows wild in the graveyard; gathered by hand.", "Forage under trees.", "Dug from the clay banks by the river, a shovel carried.", "Mined
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
      const node = namePlural(propName(sid), sd);
      let text;
      if (field === "gather") text = b.word ? `${b.word} ${where}.` : `Grows wild ${where}; gathered by hand.`;
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

// What a recipe needs carried or held, as words: its `uses` verb's tool carried (the tool rule, #214), or its `tool` in hand.
function toolWords(r) {
  const t = r.uses ? toolFor(r.uses) : r.tool ? getItem(r.tool) : null;
  return t ? `, ${an(t.name.toLowerCase())} ${r.uses ? "carried" : "in hand"}` : "";
}

// The recipes that make it, and those it goes into, as station words: { madeAt: [stations], goesInto: [{ name, station }], worksInto, workedFrom }.
// A row with a `verb` (#317: Tear, a garment into rags) works one thing into another and is said as its own line on both, never as a Made at or
// a Goes into: `worksInto` [{ verb, out, count, station, how }] on what goes in, `workedFrom` [{ verb, from: [ids], count, station, how }] on what comes out.
export function recipesOf(def) {
  const madeAt = [];
  const goesInto = [];
  const worksInto = [];
  const workedFrom = [];
  for (const r of stations.recipes()) {
    if (!stations.isOpen(r)) continue; // a recipe a world rule keeps off is not on a card (docs/43 section 5)
    if (r.verb && r.out && r.out.id) {
      const how = toolWords(r);
      const count = r.out.count || 1;
      if ((r.in || []).some((w) => w.id === def.id) && !worksInto.some((w) => w.verb === r.verb && w.out === r.out.id && w.station === r.station)) worksInto.push({ verb: r.verb, out: r.out.id, count, station: r.station, how });
      if (r.out.id === def.id) {
        let g = workedFrom.find((w) => w.verb === r.verb && w.station === r.station && w.how === how);
        if (!g) workedFrom.push((g = { verb: r.verb, from: [], counts: [], station: r.station, how }));
        for (const w of r.in || []) if (w.id && !g.from.includes(w.id)) g.from.push(w.id);
        if (!g.counts.includes(count)) g.counts.push(count);
      }
      continue;
    }
    if (r.out && r.out.id === def.id && !madeAt.includes(r.station)) madeAt.push(r.station);
    if ((r.in || []).some((w) => w.id === def.id || (w.tag && def.tags && def.tags.includes(w.tag)))) {
      const out = r.out && r.out.id ? getItem(r.out.id).name : r.label ? r.label : r.out && r.out.prop ? cap(propName(r.out.prop)) : r.id; // a recipe's own label first (the jack-o'-lantern's prop is "pumpkin")
      if (!goesInto.some((g) => g.name === out)) goesInto.push({ name: out, station: r.station });
    }
  }
  return { madeAt, goesInto, worksInto, workedFrom };
}

const stationWord = (s) => (s === "cooking" ? "a cooking fire" : `the ${s.replace(/_/g, " ")}`);

// A shot's damage by the draw (docs/20, archery.shotDamage): what the least draw that flies does (`minDraw`) to the whole of a full one.
function byDraw(d) {
  const lo = shotDamage(d, shot.minDraw);
  return lo < d ? `${lo} to ${d} damage by the draw` : `${d} damage`;
}
const tiles = (n) => `${n} tile${n === 1 ? "" : "s"}`;
// What one burn does to the dead (data/combat.json `burn`): the whole of it, capped. Only the dead burn (burn.js).
const burnLine = () => line(`Sets the dead it hits alight: ${Math.round(Math.min(BURN.cap, BURN.dps * BURN.duration))} damage over ${BURN.duration} seconds.`);
// A throw costs nothing beyond the draw (docs/24, Q2); a spell costs its `mana` (docs/47 section 5), said on its book's card. A card never claims a
// cost the game does not take.
const ammoOf = (bowDef) => bowDef.bow.ammo || ["arrow"]; // a bow's arrows in the order it takes them (archery.launcherOf)

// The lines for what is shot, thrown, or cast (#317), read from the item's `thrown`, `bow`, `book.spell`, and `staff` blocks, an arrow's bows
// (their `ammo`) and its `ignite`, and what makes it (an interaction whose `args.to` it is: an arrow dipped in fire): so a new spell, a new
// thrown thing, or a new arrow says what it does with no code.
function shotLines(def) {
  const out = [];
  const th = def.thrown;
  if (th && th.damage) {
    // The button that throws it is the one archery.launcherOf gives it: the left for a pure throwable (the knife, the axe), the other mode for
    // one that also stabs (the spear; docs/24 section 1).
    out.push(line(`Throw (${def.weapon ? "middle button or Q" : "left button, from the main hand"}): ${byDraw(th.damage)}, up to ${tiles(th.range ?? shot.range)}.`));
    // What its hit does to one of the dead beside the damage (docs/24 section 1): the stagger by its chance, and a knockdown if it has one.
    const pct = (v) => `${Math.round(v * 100)}%`;
    if (th.staggerChance != null && th.staggerChance > 0) out.push(line(th.staggerChance >= 1 ? "Every hit staggers the dead." : `A hit staggers the dead ${pct(th.staggerChance)} of the time.`));
    if (th.knockdown > 0) out.push(line(`A hit knocks the dead down ${pct(th.knockdown)} of the time.`));
    // A thrown thing is its own shot (archery.js): it lands as itself, or lodges in the body it hits and comes out in its loot; one that breaks is gone.
    if (!th.vanish) out.push(line(`It lands to be picked up again, or stays in the body it hits${th.breakChance ? `; it may break (${Math.round(th.breakChance * 100)}%)` : ""}.`));
    if (th.ignite) out.push(burnLine());
  }
  if (def.bow) {
    const b = def.bow;
    out.push(line(`Draw and release (left button): ${byDraw(b.damage ?? shot.damage)}, up to ${tiles(b.range ?? shot.range)}.`));
    const ammo = ammoOf(def);
    const first = ammo.slice(0, -1);
    // The order it takes them in (docs/47 section 6: fire arrows, then poisoned ones, then plain): "fire arrows first, then poisoned arrows".
    const order = first.map((id, k) => (k === 0 ? `${pluralName(id)} first` : `then ${pluralName(id)}`)).join(", ");
    out.push(line(`Needs ${pluralName(ammo[ammo.length - 1])} carried${first.length ? `, ${order}` : ""}${def.shots ? `; good for about ${def.shots} shots` : ""}.`));
  }
  // An arrow: the bows that shoot it, and where it stands in their order.
  const bows = allItems().filter((d) => d.bow && ammoOf(d).includes(def.id));
  if (bows.length) {
    const order = ammoOf(bows[0]);
    const i = order.indexOf(def.id);
    const before = order.slice(0, i);
    const after = order.slice(i + 1);
    const dmg = bows.length === 1 ? ` (${byDraw(bows[0].bow.damage ?? shot.damage)})` : "";
    const where = before.length && after.length ? `, after any ${listOr(before.map(pluralName))} and before any ${listOr(after.map(pluralName))}` : after.length ? `, before any ${listOr(after.map(pluralName))}` : before.length ? `, when no ${listOr(before.map(pluralName))} are carried` : "";
    out.push(line(`Shot from ${listOr(bows.map((d) => an(d.name.toLowerCase())))}${dmg}${where}.`));
  }
  if (def.ignite === true) out.push(burnLine());
  if (def.poisoned) out.push(line(poisonEffect(def.poisoned.tier))); // a poisoned arrow (docs/47 section 6)
  // What makes it: a Use whose `args.to` it is. Used on a fire (the fire arrow's dip), "Use them on fire"; made by using something on them (a
  // poison on arrows), "Use poison on them".
  for (const r of interactions.all()) {
    if (!(r.args && r.args.to === def.id && r.args.from)) continue;
    if (r.on === r.args.from) out.push(line(`Made from ${pluralName(r.args.from)}: `, seg("Use", "use"), ` ${nounName(r.use)} on them (${(r.verb || "use").toLowerCase()}).`));
    else out.push(line(`Made from ${pluralName(r.args.from)}: `, seg("Use", "use"), ` them on ${nameOfOn(r.on)} (${(r.verb || "use").toLowerCase()}).`));
  }
  // A spell, the book's (docs/24): cast with a staff in the other hand, drawn and released as the bow is.
  const s = def.book && def.book.spell;
  if (s) {
    out.push(line(`Cast ${s.name} (left button, a staff in the other hand): ${byDraw(s.damage)}, up to ${tiles(s.range ?? shot.range)}.`));
    // Its cost (docs/47 section 5): paid when the spell is released; refused before the draw when the bar cannot pay.
    if (s.mana > 0) out.push(line(`Costs ${s.mana} mana a cast, spent when it is released.`));
    const burst = [s.contact ? "on the first of the dead or wild game it meets" : "", s.landRadius ? `within ${tiles(s.landRadius)} of where it lands` : ""].filter(Boolean);
    // A spell passes a tame animal by (archery.bodyAt, docs/45 section 2): the dead and wild game are what it meets.
    if (burst.length) out.push(line(`${s.name} bursts ${burst.join(", or ")}; it passes tame animals by.`));
    if (s.ignite) out.push(burnLine());
  }
  // A staff: the spells of the books it casts.
  if (def.staff) {
    const books = allItems().filter((d) => d.book && d.book.spell);
    if (books.length) out.push(line(`Cast (left button, a spellbook in the other hand): ${listOr(books.map((d) => `${d.book.spell.name} with the ${d.name}`))}.`));
  }
  return out;
}

// The card for an item entry (a bag's, a slot's, a container's): never null for a known item.
// `opts.beltRole`: on a belt slot, its role ("main", "off", "utility"), and the card's first line says what that slot's key does with it
// (inventory.beltAction, the key's own answer; Michael, 2026-10-25: "From this main-hand slot: drawn into your main hand").
export function cardFor(entry, opts = {}) {
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
  if (def.capacity) lines.push(line(seg("Drink", "word"), `: ${Math.round(entry.fill ?? 0)}% full; fill it at water, or from a bucket.`)); // a bucket Used on it pours (Michael, 2026-10-26)
  // Which water it holds (docs/44 section 3): the item's name never changes, the card says it, and a brown drop marks a tainted one's icon (inventory-panel.js).
  // Tainted water is the card's first line, in the warning red with a bold lead (Michael's playtest, 2026-10-26: "needs to be way more
  // noticeable"); clean water is a plain line where it stood.
  if (holdsWater(entry) && !isTainted(entry)) lines.push(line("Clean water."));
  else if (holdsWater(entry)) lines.unshift(def.capacity ? line(seg("Tainted water:", "warn"), seg(" drinking it may make you Sick.", "danger")) : line(seg("Tainted water.", "warn")));
  if (def.bandage) lines.push(line(seg("Apply", "word"), ": closes a bleeding wound."));
  // A potion, drunk (docs/47 section 4), its numbers from data/tuning.json `potions`; a poison, never drunk (section 6).
  if (def.potion === "heal") lines.push(line(seg("Drink", "word"), `: heals ${POTIONS.heal} at once.`));
  if (def.potion === "stamina") lines.push(line(seg("Drink", "word"), `: fills your stamina, and it comes back ${POTIONS.staminaMult === 2 ? "twice" : `${POTIONS.staminaMult} times`} as fast for ${POTIONS.staminaSeconds} seconds.`));
  if (def.potion === "mana") lines.push(line(seg("Drink", "word"), `: restores ${POTIONS.mana} mana at once.`));
  if (def.potion) lines.push(line(`${POTIONS.between} seconds between one potion and the next; the empty vial is kept.`));
  // Its Use is the rows' (usesOf, below: "Use on a blade or arrows: coat."), said once (step 2's builder's note); what a coat is and does, from data/combat.json `poison`.
  if (def.poison) {
    lines.push(line(`${def.poison.tier > 1 ? "Strong" : "Ordinary"} poison: never drunk.`));
    lines.push(line(`A vial coats a blade for ${POISON.hits} landed hits, or ${POISON.arrows} arrows; the empty vial is kept.`));
    lines.push(line(poisonEffect(def.poison.tier)));
  }
  if (def.weapon) {
    const w = def.weapon;
    lines.push(line(`${w.damage} damage${w.range ? `, reach ${w.range}` : ""}${w.stamina ? `; ${w.stamina} stamina a swing` : ""}.`)); // the cost since docs/41 step 4: stamina is the one pacer of melee
    // The main hand's other mode on the middle button or Q (docs/21), with its own numbers and cost: the halberd's thrust.
    const a = w.alt;
    if (a && a.damage) lines.push(line(`${a.name ? a.name[0].toUpperCase() + a.name.slice(1) : "Other mode"} (middle button or Q): ${a.damage} damage${a.range ? `, reach ${a.range}` : ""}${a.stamina ? `; ${a.stamina} stamina` : ""}.`));
  }
  // A blade's coat on this entry (docs/47 section 6): "Poisoned: 7 hits left." ("Strongly poisoned" for the strong tier).
  if (coatOf(entry)) lines.push(line(coatWords(entry)));
  // What is thrown (the spear, on the middle button or Q, docs/21), shot (the bow, its arrows), or cast (a spellbook, a staff): #317.
  lines.push(...shotLines(def));
  if (def.rug) lines.push(line(seg("Place", "word"), ": lay on the floor."));
  if (def.painting) lines.push(line(seg("Place", "word"), ": hang on a wall's face."));
  if (def.place === "campfire") lines.push(line(seg("Place", "word"), ": set down outdoors as a campfire, cold and empty.")); // docs/43, section 3
  // docs/43, section 4: set down as its prop, by where it may stand; food placed as decoration does not come back food; a torch on a wall.
  if (def.place && def.place !== "campfire") lines.push(line(seg("Place", "word"), def.stand === "natural" ? ": plant on open grass outdoors." : def.stand === "outdoors" ? ": set down outdoors." : ": set down on the floor."));
  // A station of your own set down from the bag (the cauldron, docs/47 section 3): what it makes and the fire under it, from its definition and the recipes.
  const placed = def.place && def.place !== "campfire" ? getDefSafe(def.place) : null;
  if (placed && placed.station) {
    const n = stations.recipesFor(placed.station).length;
    const fuel = placed.fire && placed.fire.burns ? pluralName(placed.fire.fuel || "log") : null;
    lines.push(line(`Set down, it is a station: ${n} recipe${n === 1 ? "" : "s"}${fuel ? `, over a fire of ${fuel}` : ""}; picked up again while out and empty.`));
  }
  // A sapling (docs/46 step 3): what it grows into and how long, from the tuning (trees.js).
  if (def.id === trees.sapling.item) {
    // The tree it grows into: the one its entry carries (an apple tree's sapling, #461), else the default's (the round oak, "an oak").
    const grows = entry.tree || trees.sapling.grows;
    const n = getDefSafe(grows) ? getDefSafe(grows).name : null;
    lines.push(line(`Grows into ${n ? an(n) : "a tree"} in about ${trees.sapling.days} game days; it waits while anyone stands on it.`));
  }
  if (def.placeAs) lines.push(line(seg("Place as decoration", "word"), ": set down on the floor; picked up again, it is a decoration, not food."));
  if (def.wallMount) lines.push(line(seg("Place torch", "word"), ": on a wall's face, in a bracket that comes with it; picked up again, the bracket goes too.")); // #523
  // The hands, and where a two-handed thing rides the belt (2026-10-25: a main-hand slot draws it into both hands, the utility slot stores
  // it, an off-hand slot refuses it).
  if (def.hands) {
    const belt = def.hands === "both" ? "; on the belt, a main-hand slot or the utility slot" : "";
    lines.push(line(seg("Equip", "word"), `: ${def.hands === "both" ? "both hands" : def.hands === "either" ? "main or off hand" : `${def.hands} hand`}${belt}.`));
  }
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
  if (def.splitsInto) lines.push(line(`Splits into ${countName(def.splitsInto.id, def.splitsInto.count)}.`));
  if (def.splitsInto && def.id === work.saw.item) lines.push(line(`A sawpit saws it into ${pluralName(def.splitsInto.id)} with no hatchet.`)); // docs/43 section 6
  // Repairs that run out (docs/43 section 6): where, with what, and how many in its life.
  const rep = def.repair && (wearPerHit(def) > 0 || wearPerShot(def) > 0) ? def.repair : null;
  if (rep) {
    const mat = getItem(rep.with).name.toLowerCase();
    const n = Math.max(work.grindstone.ceilings.length, work.anvil.ceilings.length);
    lines.push(line(`Repaired at an anvil with ${/^[aeiou]/.test(mat) ? "an" : "a"} ${mat}${rep.edged ? ", or sharpened at a grindstone" : ""}; ${n} repairs in all.`));
  }
  const rec = recipesOf(def);
  // A recipe's own verb (#317): a garment torn into rags says so, and the rag says what it is torn from.
  for (const w of rec.worksInto) lines.push(line(`${w.verb} into ${countName(w.out, w.count)} at ${stationWord(w.station)}${w.how}.`));
  for (const w of rec.workedFrom) {
    const each = w.counts.length === 1 && w.counts[0] > 1 ? ` (${w.counts[0]} each)` : "";
    const from = w.from.map((id) => getItem(id));
    const kinds = [...new Set(from.map((d) => d.kind))];
    if (!from.length) continue; // a row of tags alone names no thing to tear
    if (from.length === 1) lines.push(line(`${w.verb} ${an(from[0].name.toLowerCase())} into ${countName(def.id, w.counts[0])} at ${stationWord(w.station)}${w.how}.`));
    else lines.push(line(`${w.verb} ${kinds.length === 1 ? (KIND[kinds[0]] || kinds[0]).toLowerCase() : "these"} into ${pluralName(def.id)}${each} at ${stationWord(w.station)}${w.how}: ${listOf(from.map((d) => d.name.toLowerCase()))}.`));
  }
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
  // On a belt slot, what its key does with it, first, so a long card never cuts it.
  const beltLine = opts.beltRole ? beltSlotLine(entry, def, opts.beltRole) : null;
  return { name: def.name, kind, state: state.join(" · "), lines: beltLine ? [beltLine, ...lines.slice(0, MAX_LINES - 1)] : lines.slice(0, MAX_LINES), fine: [line("Right-click for actions.")] };
}

// The line a filled belt slot's card leads with: what the slot's key does with the thing there, from the key's own answer.
function beltSlotLine(entry, def, role) {
  const where = role === "utility" ? "From the utility slot" : `From this ${ROLE_WORD[role] || "slot"}`;
  const a = beltAction(entry, role);
  const lit = def.fire ? " Lit, it gives its light from the belt." : "";
  if (a.act === "draw") return line(`${where}: drawn into ${a.hand === "both" ? "both hands" : `your ${a.hand} hand`}.${lit}`);
  if (a.act === "eat") return line(`${where}: eaten.`);
  if (a.act === "drink") return line(`${where}: drunk.`); // a potion, from any slot (docs/47 section 4)
  if (def.poison && !def.hands) return line(`${where}: carried only.`); // the card's own lines say Use and never drunk once (the review of #491)
  // A held thing the key does not draw is still equipped from the slot's menu, as from the bag (interact.slotMenu): the card says so.
  if (def.hands) return line(`${where}: stored. ${a.word} Its menu equips it.${lit}`);
  return line(`${where}: carried only. ${a.word}${lit}`);
}

// The card for an empty slot: its name and what goes in it.
export function cardForSlot(label) {
  return { name: label, kind: "Empty slot", state: "", lines: [], fine: [] };
}

// The card for an empty belt slot (Michael, 2026-10-25: "when empty and hovered it should tell you 'This is a main hand slot. It can ...'"):
// what its key does, by its role, and what goes in it. `key` is the number that uses it under this client's order, or null.
export const BELT_SLOT_TEXT = {
  main: ["This is a main-hand slot. Its key draws what's here into your main hand, or eats it if it is food.", "A two-handed item goes here and is drawn into both hands; it never goes in an off-hand slot.", "Tapped empty, it does nothing: a stray key never takes the weapon out of your hand."],
  off: ["This is an off-hand slot. Its key draws what's here into your off hand, or eats it if it is food.", "Two-handed items can't go here: they go in a main-hand slot or the utility slot.", "Tapped empty, it does nothing."],
  utility: ["This is the utility slot. Its key eats what's here if it is food, and never equips anything.", "Anything else that goes on the belt rides here as storage, one cell whatever its size: a spare weapon, even a two-handed one.", "A lit torch gives its light from here."],
};
export function cardForBeltSlot(role, key = null) {
  const name = role === "main" ? "Main-hand slot" : role === "off" ? "Off-hand slot" : "Utility slot";
  const lines = (BELT_SLOT_TEXT[role] || []).map((t) => line(t));
  if (role !== "utility") lines.push(line("A waterskin in any slot sips by itself when you are thirsty."));
  return { name, kind: key != null ? `Belt slot, key ${key}` : "Belt slot", state: "Empty", lines, fine: [] };
}

// The card for a locked place on the hotbar (the "Hands grouped" order on a belt with fewer slots): the slot a leather belt adds there.
export function cardForLockedSlot(role, key = null) {
  const what = role === "main" ? "a second main-hand slot" : role === "off" ? "a second off-hand slot" : "a slot";
  return { name: "Locked slot", kind: key != null ? `Belt slot, key ${key}` : "Belt slot", state: "", lines: [line(`A leather belt adds ${what} here.`)], fine: [] };
}

// The card as plain text, for the check and the log: one string per line.
export function textOf(card) {
  const flat = (l) => l.map((s) => s.t).join("");
  return [card.name, [card.kind, card.state].filter(Boolean).join(" · "), ...card.lines.map(flat), ...card.fine.map(flat)].filter(Boolean);
}
