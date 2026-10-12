// Looks, outfits, and wardrobes (docs/19): what a character is drawn from, its spec and the spec's key.
// Cut from src/figure.js on 2026-10-12 (docs/23a, D3): a move, no number changed; the sheets check proves the pixels.

import { LAYER_SLOTS, getLayer, layerNames, layersVersion } from "./draw.js";

// ---- looks and outfits ----

export const DEFAULT_LOOK = { skin: "#f0c8a0", hair: "#5a3a20", hairStyle: "short", eyes: "#1c1a22", under: "#e9dfc8" };

// ---- wardrobes, and a character's drawing (docs/19) ----

// Who wears what, from data/wardrobes.json at boot: { look, wound, worn: { slot:
// { item, colour | colours } }, pockets: [cols, rows], loot }. The dead dress
// from "zombie", villagers from "village".
let wardrobes = { zombie: [], village: [] };
let artResolver = () => null; // item id -> its garment art, set at boot once the items are loaded

export function setWardrobes(data) {
  wardrobes = { zombie: data.zombie || [], village: data.village || [] };
}
export function setArtResolver(fn) {
  artResolver = fn;
}
export function wardrobeCount(kind) {
  return wardrobes[kind].length;
}
export function wardrobe(kind, i) {
  const list = wardrobes[kind];
  return list.length ? list[((i % list.length) + list.length) % list.length] : null;
}
// A wardrobe's worn entries, ready to put in a character's `worn`: item entries
// with their dye (`colour` replaces the item's first tone, `colours` all of them).
export function wardrobeWorn(w) {
  const worn = {};
  for (const [slot, e] of Object.entries((w && w.worn) || {})) {
    worn[slot] = { id: e.item, count: 1, ...(e.colour ? { colour: e.colour } : {}), ...(e.colours ? { colours: e.colours } : {}) };
  }
  return worn;
}

// A garment's art with its entry's own dye on it.
function dyed(art, entry) {
  if (!art) return null;
  if (entry.colours) return { ...art, colours: entry.colours };
  if (entry.colour) return { ...art, colours: [entry.colour, ...(art.colours || []).slice(1)] };
  return art;
}

const OUTFIT_SLOTS = ["head", "chest", "hands", "legs", "feet", "waist", "back"];

// What a character's drawing is made from, as plain data: the kind's variant,
// the look, the outfit (each worn entry's garment art, dyed), what is in the
// hands, the dead's wardrobe index and wound, and the painted-layer overrides.
// `assets.sheetFor` keeps these to rebake a sheet when the painted layers reload.
export function characterInputs(ch, artOf = artResolver, overrides = {}, style = null) {
  const outfit = {};
  for (const slot of OUTFIT_SLOTS) {
    const e = ch.worn && ch.worn[slot];
    outfit[slot] = e ? dyed(artOf(e.id) || null, e) : null;
  }
  const zombie = ch.kind === "zombie";
  return {
    variant: zombie ? "zombie" : "player",
    look: ch.look,
    outfit,
    holding: zombie ? null : { main: !!(ch.hands && ch.hands.main), off: !!(ch.hands && ch.hands.off) },
    wardrobe: ch.wardrobe || 0,
    wound: ch.wound || null,
    noCarry: ch.kind !== "player",
    overrides,
    style,
  };
}

// The spec the drawing takes, for the player, the dead, and anyone else.
// A painted layer is picked per slot by what is worn (a worn item's
// `art.painted`) or an override; the dead also draw from the painted pool
// flagged `zombie`, slot by slot, by their wardrobe index.
export function characterSpec(inp) {
  const overrides = inp.overrides || {};
  if (inp.variant === "zombie") {
    const k = inp.wardrobe;
    const painted = {};
    ["hair", "head", "chest", "legs", "hands", "feet", "body"].forEach((slot, n) => {
      const pool = layerNames(slot).filter((name) => getLayer(slot, name).options.zombie);
      if (!pool.length) return;
      const i = (k * 5 + n * 3) % (pool.length + 1);
      if (i < pool.length) painted[slot] = getLayer(slot, pool[i]);
    });
    const look = { ...inp.look };
    if (painted.hair) look.hairStyle = painted.hair.name;
    const outfit = { ...inp.outfit };
    if (painted.head) outfit.head = outfit.head || { shape: "cap", colours: ["#555"] }; // a painted head piece needs a head item to replace
    return { variant: "zombie", look, outfit, wound: inp.wound, painted, noCarry: !!inp.noCarry };
  }
  const painted = {};
  for (const slot of OUTFIT_SLOTS) {
    const art = inp.outfit[slot];
    if (LAYER_SLOTS[slot]) painted[slot] = getLayer(slot, overrides[slot] || (art && art.painted) || null);
  }
  painted.body = getLayer("body", overrides.body || (inp.look && inp.look.body) || null);
  const fullLook = { ...DEFAULT_LOOK, ...inp.look };
  painted.hair = getLayer("hair", fullLook.hairStyle);
  return { variant: "player", look: fullLook, outfit: inp.outfit, wound: null, holding: inp.holding, painted, style: inp.style, noCarry: !!inp.noCarry };
}

// The player's spec from their look and what they wear; `worn` is the slot map
// of item entries and `artOf` gives an item id's garment art. `overrides` names
// a painted layer per slot to try on regardless of what is worn (the settings
// screen). Kept for the editors and tests; the game goes through characterSpec.
export function playerSpec(look, worn, artOf, hands = null, overrides = {}, style = null) {
  return characterSpec(characterInputs({ kind: "player", look, worn, hands }, artOf, overrides, style));
}

// A zombie wardrobe's spec by index (the placeholder sheet and the editors).
export function zombieSpec(k) {
  const w = wardrobe("zombie", k);
  return characterSpec(characterInputs({ kind: "zombie", look: w ? w.look : DEFAULT_LOOK, worn: wardrobeWorn(w), wardrobe: k, wound: w ? w.wound : null }));
}

// A key that changes when the drawing would.
export function specKey(spec) {
  const names = spec.painted ? Object.fromEntries(Object.entries(spec.painted).map(([k, v]) => [k, v ? v.name : null])) : null;
  return JSON.stringify([spec.variant, spec.look, spec.outfit, spec.wound, spec.holding, names, layersVersion, spec.style || null, !!spec.noCarry]);
}
