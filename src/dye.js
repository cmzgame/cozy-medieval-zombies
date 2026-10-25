// The dye vat (docs/43 section 8, #412): what a garment may be dyed, and the `dye` verb that dyes it. Pure and headless: the
// world's side of the picker (ui/dye-panel.js), run on the authority for the host's player and a guest's alike, by the vat's
// prop id and the entry's uid. The palette is data/dyes.json; each dyeable item names its regions in a `dye` block in
// data/items.json, a region's colours by a `palette` or a list of `colours`, or the item's `schemes`, a colour per region.
// Region i is the entry's `colours[i]`: a generated garment draws it as its i-th tone (figure/draw.js `col`), and a painted
// one recolours the i-th pair of key tones its art names (`art.keys`). An item's own colours are always a choice (Undyed).

import * as verbs from "./verbs.js";
import { getItem } from "./items.js";
import { countAll, takeAll } from "./inventory.js";
import { reachProblem, TOO_FAR } from "./reach.js";
import * as map from "./map.js";
import { stationOf, REACH } from "./stations.js";

let data = { colours: {}, palettes: {}, unlock: null };

export function load(json) {
  data = { colours: (json && json.colours) || {}, palettes: (json && json.palettes) || {}, unlock: (json && json.unlock) || null };
  byHex = null;
}

const norm = (hex) => (typeof hex === "string" && /^#[0-9a-fA-F]{6}$/.test(hex) ? hex.toLowerCase() : null);

// Every dye by its id: { id, name, hex, cost }.
export function colour(id) {
  const c = data.colours[id];
  return c ? { id, name: c.name, hex: norm(c.hex), cost: c.cost || null } : null;
}

// A plain word for a colour no dye gives (docs/bugs.md: a looted hood's card read "#705848"): by its lightness, saturation, and hue,
// "brownish" for a dull or dark warm colour (the dead's drab wool), "greyish" for one with little colour, else the hue's family.
// Read from the colour itself, not the nearest dye: the nearest dye of a slate or a moss is a grey-brown hide.
export function colourFamily(hex) {
  const h = norm(hex);
  if (!h) return "dyed";
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const d = max - min;
  const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
  if (l < 0.12) return "blackish";
  if (l > 0.65 && s < 0.5) return "whitish";
  if (s < 0.15) return "greyish";
  const hue = d === 0 ? 0 : max === r ? (60 * ((g - b) / d) + 360) % 360 : max === g ? 60 * ((b - r) / d + 2) : 60 * ((r - g) / d + 4);
  const warm = hue < 50 || hue >= 345;
  if (warm && (s < 0.35 || l < 0.5)) return "brownish";
  if (hue < 15 || hue >= 345) return "reddish";
  if (hue < 45) return "orange";
  if (hue < 70) return "yellowish";
  if (hue < 170) return "greenish";
  if (hue < 260) return "bluish";
  if (hue < 300 || l < 0.5) return "purplish";
  return "pinkish";
}
let byHex = null;
// A dye by its hex, or null (a colour no vat gives: an item's own, a wardrobe's).
export function colourOfHex(hex) {
  if (!byHex) {
    byHex = new Map();
    for (const id of Object.keys(data.colours)) { const c = colour(id); if (c && !byHex.has(c.hex)) byHex.set(c.hex, c); }
  }
  return byHex.get(norm(hex)) || null;
}

// An item's own colours, one per region: its art's tones in order, the last standing in for any region past them.
export function ownColours(def) {
  const d = def && def.dye;
  const own = ((def && def.art && def.art.colours) || []).map(norm);
  const n = d && d.regions ? d.regions.length : own.length;
  return Array.from({ length: n }, (_, i) => own[Math.min(i, own.length - 1)] || "#888888");
}

// What an item may be dyed, read whole: { regions: [{ name, choices: [dye] }], schemes: [[dye per region]] | null, own }, or null.
export function dyeOf(def) {
  const d = def && def.dye;
  if (!d || !Array.isArray(d.regions) || !d.regions.length) return null;
  const regions = d.regions.map((r) => {
    const ids = r.colours || data.palettes[r.palette] || [];
    return { name: r.name || "Colour", choices: ids.map(colour).filter(Boolean) };
  });
  const schemes = Array.isArray(d.schemes) && d.schemes.length ? d.schemes.map((s) => s.map(colour)).filter((s) => s.length === regions.length && s.every(Boolean)) : null;
  return { regions, schemes, own: ownColours(def) };
}

// What an entry is dyed now, one hex per region: its `colours`, a wardrobe's single `colour` over the first, or its own.
export function currentColours(entry) {
  const def = entry && getItem(entry.id);
  const own = ownColours(def);
  if (entry && Array.isArray(entry.colours)) return own.map((c, i) => norm(entry.colours[i]) || c);
  if (entry && entry.colour) return [norm(entry.colour) || own[0], ...own.slice(1)];
  return own;
}

// A region's colour in words, for the card and the picker alike: a dye's name when the colour is a dye's hex, an own colour
// too (the leather belt's own buckle is the Brass dye's hex, so it is "Brass"); "Undyed" for an own colour no vat gives; and a
// colour neither (a wardrobe's, on a garment looted from the dead: a hood's #705848) is a plain word, "Brownish" (colourFamily),
// never its hex.
export function regionWord(hex, own) {
  const c = colourOfHex(hex);
  if (c) return c.name;
  if (norm(hex) === norm(own)) return "Undyed";
  const word = colourFamily(hex);
  return word[0].toUpperCase() + word.slice(1);
}

// The words for an entry's colours, for its card: "Woad blue", a scheme's "Black and iron" (and "Black and brass", the
// buckle its own brass), a free two-region item's "Cloth undyed, strap oxblood"; null while it is its own.
export function colourWords(entry) {
  const def = entry && getItem(entry.id);
  const d = dyeOf(def);
  if (!d || (!entry.colours && !entry.colour)) return null;
  const now = currentColours(entry);
  if (now.every((c, i) => c === d.own[i])) return null;
  const names = now.map((c, i) => regionWord(c, d.own[i]).toLowerCase());
  const s = names.length === 1 ? names[0] : d.schemes ? `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}` : names.map((n, i) => `${d.regions[i].name.toLowerCase()} ${n}`).join(", ");
  return s[0].toUpperCase() + s.slice(1);
}

// Whether these colours may be put on this item: true, or the reason not. Each region takes one of its choices or its own
// colour; an item with schemes takes one of them whole, or its own colours whole.
export function allowedProblem(def, colours) {
  const d = dyeOf(def);
  if (!d) return "That can't be dyed.";
  if (!Array.isArray(colours) || colours.length !== d.regions.length) return "That is not a colouring for it.";
  const want = colours.map(norm);
  if (want.some((c) => !c)) return "That is not a colouring for it.";
  if (want.every((c, i) => c === d.own[i])) return true;
  if (d.schemes) return d.schemes.some((s) => s.every((c, i) => c.hex === want[i])) ? true : "The vat has no such scheme for it.";
  return d.regions.every((r, i) => want[i] === d.own[i] || r.choices.some((c) => c.hex === want[i])) ? true : "The vat has no such colour for it.";
}

// The cost hook (docs/43 section 8: whether a dye costs a plant is open, #288): what applying these colours takes from what the
// player carries, as [{ id, count }], summed over each region's dye that is not its own colour. No dye names a cost yet: nothing.
export function costOf(def, colours) {
  const own = ownColours(def);
  const sum = new Map();
  (colours || []).forEach((hex, i) => {
    if (norm(hex) === own[i]) return;
    const c = colourOfHex(hex);
    for (const w of (c && c.cost) || []) if (w && w.item) sum.set(w.item, (sum.get(w.item) || 0) + (w.count || 1));
  });
  return [...sum].map(([id, count]) => ({ id, count }));
}

// The vat's unlock (Crafting 3; docs/43 section 8): open to all until the skills are built (docs/43 section 1), so no one is refused.
export function unlockProblem(_player) {
  return null;
}
export function unlock() {
  return data.unlock;
}

const WORN_ORDER = ["head", "chest", "hands", "waist", "legs", "feet", "back"];

// Everything the player carries, worn first, then the hands, the belt's slots, and the bag, a bag or a belt inside the bag
// opened in its turn (a satchel in a rucksack, a cap in that satchel): [{ entry, slot | null }], `slot` the worn slot.
function carried(player) {
  const out = [];
  const seen = new Set();
  const add = (e, slot) => {
    if (!e || seen.has(e)) return;
    seen.add(e);
    out.push({ entry: e, slot });
    for (const inner of (e.bag && e.bag.items) || []) add(inner, null); // a bag's things, whoever wears it
    for (const inner of e.slots || []) add(inner, null); // a belt's slots, worn or carried
  };
  const worn = player.worn || {};
  const slots = [...WORN_ORDER, ...Object.keys(worn).filter((s) => !WORN_ORDER.includes(s))];
  // The worn things first, each before what it holds, so the picker lists them in their order.
  for (const slot of slots) if (worn[slot]) { seen.add(worn[slot]); out.push({ entry: worn[slot], slot }); }
  for (const slot of ["main", "off"]) add(player.hands && player.hands[slot], null);
  for (const slot of slots) {
    const e = worn[slot];
    if (!e) continue;
    for (const inner of e.slots || []) add(inner, null);
    for (const inner of (e.bag && e.bag.items) || []) add(inner, null);
  }
  return out;
}

// The entry with this uid that the player may dye: anywhere it carries it (worn, in a hand, on the belt, in the bag or a bag in it),
// the same walk the picker's list is (`dyeables`), so the picker offers nothing the verb refuses and the verb takes all it offers.
export function entryOf(player, uid) {
  if (uid == null || !player) return null;
  const hit = carried(player).find((c) => c.entry.uid === uid);
  return hit ? hit.entry : null;
}

// Every entry the player could take to the vat, worn first: [{ entry, slot | null }].
export function dyeables(player) {
  return carried(player).filter((c) => getItem(c.entry.id) && getItem(c.entry.id).dye);
}

// Whether the player may dye that entry these colours at that vat now: true, or the reason not.
export function applyProblem(player, prop, uid, colours) {
  if (!prop) return "That is gone.";
  if (!stationOf(prop).includes("dyevat")) return "That is not a dye vat.";
  const why = reachProblem(player, prop.tiles, REACH);
  if (why) return why === TOO_FAR ? "Too far from the vat." : why;
  const locked = unlockProblem(player);
  if (locked) return locked;
  const entry = entryOf(player, uid);
  if (!entry) return "You don't have that with you.";
  const def = getItem(entry.id);
  const ok = allowedProblem(def, colours);
  if (ok !== true) return ok;
  const short = costOf(def, colours).filter((w) => countAll(player, w.id) < w.count);
  if (short.length) return `Short of ${short.map((w) => `${w.count} ${getItem(w.id).name.toLowerCase()}`).join(", ")}.`;
  return true;
}

// The colours put on: the cost taken, the entry's `colours` set (or cleared when they are its own), a wardrobe's `colour` gone.
export function apply(player, entry, colours) {
  const def = getItem(entry.id);
  for (const w of costOf(def, colours)) takeAll(player, w.id, w.count);
  const own = ownColours(def);
  const want = colours.map(norm);
  delete entry.colour;
  if (want.every((c, i) => c === own[i])) delete entry.colours;
  else entry.colours = want;
}

// The verb (docs/31/08, habit 4): the vat by its prop id, the entry by its uid, the colours a hex per region.
verbs.define("dye", {
  validate(world, player, target, args) {
    return applyProblem(player, map.propById(target && target.prop), args && args.uid, args && args.colours);
  },
  perform(world, player, target, args) {
    apply(player, entryOf(player, args.uid), args.colours);
    return { ok: true };
  },
});
