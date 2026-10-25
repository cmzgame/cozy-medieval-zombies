// The starting kit (#136; Michael, 2026-10-16, on #123: what you start with is data and a choice made once, at world creation).
// `data/kit.json` is the default (what every world started with, plus the tinderbox); a world may add items to it ("for testing you can
// add more", rule `extraKit`, lines of `item_id count`) and may start wearing the Developer Bag in place of the sack (rule `devBag`).
// Everything goes through `items.makeEntry`, in the file's order, so a world made with the default kit is the world it always was.
// The kit is the host's to give: a new character, a guest's too, is made by the host with the world's kit (game.js, host.js).

import * as items from "./items.js";
import * as inventory from "./inventory.js";
import * as world from "./world.js";

let data = null;

const find = (id) => { try { return items.getItem(id); } catch { return null; } }; // an item or null: a typed id may be wrong

// What a kit line puts on its entry: a drink's `fill`, and `clean` for water that is safe (docs/44: the starting skin is full of clean water).
const propsOf = (k) => ({ ...(k.fill != null ? { fill: k.fill } : {}), ...(k.clean ? { clean: true } : {}) });

export function load(json) {
  data = json && Array.isArray(json.worn) && Array.isArray(json.items) ? json : null;
}

export function get() {
  if (!data) throw new Error("data/kit.json is not loaded");
  return data;
}

// The extra items a world's rule names, as { items: [{ item, count }], error }: one item a line (commas and semicolons work too),
// `item_id` or `item_id 3`. The first thing wrong is the error, in words a player can act on.
export function parseExtra(text) {
  const out = [];
  for (const raw of String(text || "").split(/[\n,;]+/)) {
    const line = raw.trim();
    if (!line) continue;
    const [id, n, ...rest] = line.split(/\s+/);
    const def = find(id.toLowerCase());
    if (!def) return { items: out, error: `There is no item called "${id}".` };
    const count = n === undefined ? 1 : /^\d{1,3}$/.test(n) ? Number(n) : 0; // digits only: no 1e1, no 0x10
    if (rest.length || !Number.isInteger(count) || count < 1 || count > 99) return { items: out, error: `"${line}": the count is a whole number from 1 to 99.` };
    out.push({ item: def.id, count });
  }
  return { items: out, error: "" };
}

// The bag a new character carries: the Developer Bag's grid if the world starts with it, else the sack's.
function backId(devBag) {
  return devBag ? "dev_bag" : get().worn.find((id) => items.getItem(id).wear === "back");
}

// Why a world's extra items cannot be the kit, or "": an unknown item, a bad count, or more than the starting bag holds.
export function problem(text, devBag = false) {
  const { items: extra, error } = parseExtra(text);
  if (error) return error;
  const def = items.getItem(backId(devBag));
  const bag = inventory.createBag(def.bag[0], def.bag[1]);
  const place = (item, count, props) => inventory.addItem(bag, item, count, props) >= count;
  const ids = world.idCounter(); // the trial placement makes entries, which take instance ids: this asks, it must not move the world's count
  try {
    for (const k of get().items) if (!k.hold && !place(k.item, k.count || 1, propsOf(k))) return "The kit itself does not fit the bag.";
    for (const e of extra) if (!place(e.item, e.count, {})) return `The starting bag is full: ${def.name.toLowerCase()} (${def.bag[0]} by ${def.bag[1]}) has no room for ${e.count > 1 ? `${e.count} ` : ""}${items.getItem(e.item).name.toLowerCase()}. Take something out of the list.`;
    return "";
  } finally {
    world.setIdCounter(ids);
  }
}

// Dress and equip a new character, in order: what is worn, then each item where it first fits or in a hand, then the world's extras.
export function give(player, { extra = "", devBag = false } = {}) {
  const k = get();
  for (const id of k.worn) {
    const wearId = devBag && items.getItem(id).wear === "back" ? "dev_bag" : id;
    player.worn[items.getItem(wearId).wear] = items.makeEntry(wearId, 1);
  }
  const bag = inventory.bagOf(player);
  for (const e of k.items) {
    if (e.hold) items.hold(player.hands, items.makeEntry(e.item, 1), e.hold === "off" ? "off" : null);
    else inventory.addItem(bag, e.item, e.count || 1, propsOf(e));
  }
  for (const e of parseExtra(extra).items) inventory.addItem(bag, e.item, e.count); // what does not fit is left out: `problem` refused it at creation
}
