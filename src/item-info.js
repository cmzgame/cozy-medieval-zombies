// What an item card says (#262; the law "Every item in a grid has a hover card", docs/02): the full name, the kind, and the direct uses, all read from the data and never
// written per item: `data/items.json` (food, drink, weapon, hands, wear, verbs, bag, fire, splitsInto, tags), `data/interactions.json` (what the item can be Used on),
// `data/recipes.json` (what it is made at and goes into), `data/crops.json` (what a seed plants). Pure and DOM-free, so a headless world can ask it and the check can read it;
// ui/hover-card.js draws what this returns. A card is { name, kind, state, lines, fine }: `lines` and `fine` are lists of lines, a line a list of segments { t, k } where `k`
// is "use" for the word Use (drawn in --gold, Michael 2026-10-18), "word" for another menu word (Eat, Equip, Drink, Apply), or absent for plain text.

import { getItem } from "./items.js";
import * as interactions from "./interactions.js";
import * as stations from "./stations.js";
import * as farming from "./farming.js";

const KIND = { food: "Food", tool: "Tool", material: "Material", clothing: "Clothing", bag: "Bag", ammo: "Ammunition", medicine: "Medicine", drink: "Drink" };
const MAX_LINES = 7; // a small card: the name and the basics, not a page
const cap = (s) => (s ? s[0].toUpperCase() + s.slice(1) : s);
const seg = (t, k) => (k ? { t, k } : { t });
const line = (...parts) => parts.map((p) => (typeof p === "string" ? seg(p) : p));

// A target of a Use row, named: a sprite id or a tag, as words.
function nameOfOn(on) {
  if (on === "fire") return "fire";
  if (on === "bracket") return "wall bracket";
  if (on === "character") return "person";
  if (on === "zombie") return "the dead";
  if (on === "tile") return "the ground";
  return on.replace(/^floor_/, "").replace(/_y$/, "").replace(/_/g, " ");
}

// "a, b or c"; past four, the first three and "more".
function listOf(names) {
  if (names.length === 1) return names[0];
  if (names.length <= 4) return `${names.slice(0, -1).join(", ")} or ${names[names.length - 1]}`;
  return `${names.slice(0, 3).join(", ")} and more`;
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

// The recipes that make it, and those it goes into, as station words: { madeAt: [stations], goesInto: [{ name, station }] }.
export function recipesOf(def) {
  const madeAt = [];
  const goesInto = [];
  for (const r of stations.recipes()) {
    if (r.out && r.out.id === def.id && !madeAt.includes(r.station)) madeAt.push(r.station);
    if ((r.in || []).some((w) => w.id === def.id || (w.tag && def.tags && def.tags.includes(w.tag)))) {
      const out = r.out && r.out.id ? getItem(r.out.id).name : r.out && r.out.prop ? cap(r.out.prop.replace(/_/g, " ")) : r.label || r.id;
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
  if (def.bandage) lines.push(line(seg("Apply", "word"), ": closes a bleeding wound."));
  if (def.weapon) {
    const w = def.weapon;
    const style = (w.style || "").replace(/_/g, "-");
    lines.push(line(`${w.damage} damage${style ? `, ${style}` : ""}${w.range ? `, reach ${w.range}` : ""}.`));
  }
  if (def.bow) lines.push(line(`Draw and release to shoot arrows${def.shots ? `; good for about ${def.shots} shots` : ""}.`));
  if (def.hands) lines.push(line(seg("Equip", "word"), `: ${def.hands === "both" ? "both hands" : def.hands === "either" ? "main or off hand" : `${def.hands} hand`}.`));
  if (def.wear) lines.push(line(seg("Equip", "word"), `: worn on your ${def.wear}${def.bag ? `; holds ${def.bag[0]}×${def.bag[1]}` : ""}${def.beltSlots ? `; ${def.beltSlots} belt slots` : ""}.`));
  if (def.verbs && def.verbs.length) lines.push(line(`For: ${def.verbs.join(", ")}.`));
  if (def.fire) lines.push(line(`Gives light${def.fire.burnsDown ? "; burns down while lit" : ""}.`));
  for (const u of usesOf(def)) lines.push(line(seg("Use", "use"), ` on ${listOf(u.on)}: ${u.verb}.`));
  const crop = def.tags && def.tags.includes("seed") ? farming.cropOfSeed(def.id) : null;
  if (crop) lines.push(line(`Grows ${crop} on tilled soil.`));
  if (def.splitsInto) lines.push(line(`Splits into ${def.splitsInto.count} ${getItem(def.splitsInto.id).name.toLowerCase()}.`));
  const rec = recipesOf(def);
  if (rec.madeAt.length) lines.push(line(`Made at ${rec.madeAt.slice(0, 2).map(stationWord).join(" or ")}.`));
  if (rec.goesInto.length && !def.wear && !def.weapon) lines.push(line(`Goes into: ${rec.goesInto.slice(0, 3).map((g) => g.name.toLowerCase()).join(", ")}${rec.goesInto.length > 3 ? " and more" : ""}.`));
  if (def.tags && def.tags.includes("fuel")) lines.push(line("Burns as fuel."));

  const state = [];
  if (entry.count > 1) state.push(`×${entry.count}`);
  if (entry.fill != null && !def.capacity) state.push(`${Math.round(entry.fill)}% full`);
  if (entry.wear > 0) state.push(`${Math.round((1 - entry.wear) * 100)}% left`);
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
