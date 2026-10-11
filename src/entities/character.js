// One model for everyone who walks the world (docs/19): the player, the dead,
// and villagers. The shared fields are here; each kind's creator adds its own
// (the player's stamina and needs, the dead's states, a villager's tether).
// Every character has the player's model: a doll (`worn`) and hands with items
// in them, and the drawing follows what is worn. The dead and villagers also
// carry `pockets`, a small grid of their own, so a body has things without a
// sack on its back.

import * as figure from "../figure.js";
import * as assets from "../assets.js";
import { createHands } from "../items.js";
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
    searched: false,
    behindProp: false,
  };
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

// Point a character at the shared sheet for what it wears now. Call again when
// its clothes, hands, or look change.
export function dress(ch) {
  ch.sprite = assets.sheetFor(figure.characterInputs(ch));
  return ch;
}
