// One model for everyone who walks the world (docs/19): the player, the dead,
// and villagers. The shared fields are here; each kind's creator adds its own
// (the player's stamina and needs, the dead's states, a villager's tether).
// Every character has the player's model: a doll (`worn`) and hands with items
// in them, and the drawing follows what is worn. The dead and villagers also
// carry `pockets`, a small grid of their own, so a body has things without a
// sack on its back.

import * as figure from "../figure.js";
import * as assets from "../assets.js";
import { createHands, rollLoot } from "../items.js";
import * as grid from "../grid.js";
import { dropItem } from "../map.js";
import { createWorn, createBag } from "../inventory.js";
import { createAnimation } from "../sprites.js";

export function createCharacter(kind, gx, gy, { id = null, name = null, speed = 1, radius = 0.3, hp = 100, maxHp = hp } = {}) {
  return {
    kind, // "player" | "zombie" | "villager"
    id,
    name, // null for the player and the dead
    sprite: null, // a sheet id, set by dress()
    gx,
    gy,
    layer: 0, // always 0 for now (docs/08)
    facing: "s",
    speed,
    radius,
    hp,
    maxHp,
    dead: false,
    anim: createAnimation("idle"),
    look: { ...figure.DEFAULT_LOOK }, // { skin, hair, hairStyle, eyes, under }
    worn: createWorn(), // head, chest, hands, legs, feet, waist, back
    hands: createHands(), // main, off
    pockets: null, // a grid of their own, for the dead and villagers
    wardrobe: 0, // which wardrobe the dead dress from
    wound: null, // the dead's wound, [l, d, hOffset]
    carrying: null,
    line: null, // { text, until } while a speech bubble shows (docs/19)
    lootTable: null, // the table the pockets roll from on first search
    loot: null, // a body's grid, made on first search: what is still on it (docs/19)
    lodged: {}, // what hit it and stayed in it, by item id (arrows, a spear): it comes out in its loot (docs/20)
    corpse: false, // the fall is over and the body is one frame (dressCorpse)
    corpseKey: "", // which worn garments the corpse is drawn in
    searched: false,
    behindProp: false,
  };
}

// Say a line (docs/19): a speech bubble over the character's head until it has
// been up for `seconds` of game time, longer for longer lines. A new line
// replaces the one showing. `ui/speech.js` draws it; nothing here touches the DOM.
export function say(ch, text, seconds = null) {
  ch.line = { text, left: seconds ?? Math.max(2, text.length * 0.06) };
}

// Dress a character from a wardrobe: its look, its worn entries, its pockets.
export function wardrobeInto(ch, kind, k) {
  const w = figure.wardrobe(kind, k);
  ch.wardrobe = k;
  if (!w) return dress(ch);
  ch.look = { ...w.look };
  ch.wound = w.wound || null;
  ch.worn = Object.assign(createWorn(), figure.wardrobeWorn(w));
  ch.pockets = w.pockets ? createBag(w.pockets[0], w.pockets[1], "pockets") : null;
  ch.lootTable = w.loot || null;
  return dress(ch);
}

// What is left on a body (docs/19). The first search rolls the pockets from the
// wardrobe's loot table and lays everything the body has, its hands' items, every
// worn garment, its pockets' things, a sack and what is in it, out on a grid of
// the body's own. From then on the grid IS the body: a garment taken from it is
// off the body, and the corpse is drawn without it (`refreshCorpse`). Nothing
// that does not fit is lost: it falls to the floor under the body.
export function lootOf(ch) {
  if (ch.loot) return ch.loot;
  const bag = createBag(6, 6, "body");
  ch.loot = bag;
  if (ch.pockets && ch.lootTable) grid.fill(ch.pockets, rollLoot(ch.lootTable));
  const entries = [];
  for (const e of [ch.hands.main, ch.hands.off]) if (e && !entries.includes(e)) entries.push(e);
  for (const e of Object.values(ch.worn)) if (e) entries.push(e);
  if (ch.pockets) entries.push(...ch.pockets.items);
  ch.hands.main = null;
  ch.hands.off = null;
  if (ch.pockets) ch.pockets.items = [];
  for (const e of entries) if (!grid.insert(bag, e)) dropItem(Math.round(ch.gx), Math.round(ch.gy), e);
  // What hit it and stayed (arrows, stacked; a spear): what did not fit lies at its feet.
  for (const [id, n] of Object.entries(ch.lodged || {})) {
    const put = grid.add(bag, id, n);
    for (let i = put; i < n; i++) dropItem(Math.round(ch.gx), Math.round(ch.gy), { id, count: 1 });
  }
  ch.lodged = {};
  return bag;
}

// The garments a corpse is still wearing: all of them until it is searched,
// then those still in its grid (the same entries, so taking one off the grid
// takes it off the body, and putting it back dresses the body again).
function presentWorn(ch) {
  const here = ch.loot ? new Set(ch.loot.items) : null;
  const worn = {};
  for (const [slot, e] of Object.entries(ch.worn)) worn[slot] = e && (!here || here.has(e)) ? e : null;
  return worn;
}

// A body is one baked frame: the last of its fall, in the facing it died in,
// drawn in what is still on it, down to the undies (docs/19).
export function dressCorpse(ch) {
  const worn = presentWorn(ch);
  ch.corpseKey = Object.keys(worn).filter((s) => worn[s]).join(",");
  ch.corpse = true;
  const inputs = figure.characterInputs({ ...ch, worn, hands: createHands() });
  ch.sprite = assets.sheetFor(inputs, { anim: ch.anim.name, frame: ch.anim.frame, facing: ch.facing });
  return ch;
}

// Redraw a body if what is on it changed. Cheap: only a signature is compared.
export function refreshCorpse(ch) {
  if (!ch.corpse) return;
  const worn = presentWorn(ch);
  if (Object.keys(worn).filter((s) => worn[s]).join(",") !== ch.corpseKey) dressCorpse(ch);
}

// Point a character at the shared sheet for what it wears now. Call again when
// its clothes, hands, or look change.
export function dress(ch) {
  ch.sprite = assets.sheetFor(figure.characterInputs(ch));
  return ch;
}
