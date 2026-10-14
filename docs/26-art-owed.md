# 26 — Art still owed: the items in the starting bag and the dev chest

**Status: a backlog, written 2026-10-12 while the characters brief was with the design agent; checked against `data/items.json` on 2026-10-13 (50 items, 4 with drawn art). Nothing here is commissioned yet. The rule for every item (Michael, 2026-10-12): it arrives as a pair, an in-world picture and an inventory icon drawn from the same design, so one change changes both; the first delivery to lack either is flagged.**

## How an item's art works in the game today (so a request is the right shape)

- **In the world (held in the hand):** one upright drawing and its grip pixel. Either **fixed** (shown unrotated: the book), **rotated** by nearest pixel into 16 angles about the grip (the knife and axe), or **hand-drawn angles** (0, 22.5, 45, 67.5, 90 degrees clockwise from up, flipped for the rest: the staff, the model for any long weapon). `src/figure/held.js` still generates a picture for every weapon and tool below; the generated ones are placeholders and `def.held.image` / `def.held.angles` replaces them with no other change.
- **In the bag:** `def.icon` (`src` and `size`): a picture on a canvas of the item's exact bag footprint at 19 px a cell, shown at a whole scale on a dark slot. Items without it show a coloured block with a text label.
- **In a slot (the character screen's worn slots and hands, and the belt; since 2026-10-12, `23` step 4):** `def.portrait` (`src` and `size`): a **square picture, 38 by 38**, of the thing as a thing (a sword upright, a tunic folded or hung), drawn from the same design as the other two, shown at a whole scale in the slot. **Every item that can be held or worn owes one**, besides its world picture and its bag icon (Michael, 2026-10-12). Until it comes, a square bag icon stands in; anything else shows the coloured block with its label. Items on the ground stay coloured boxes for a good long while: their art is basement priority (Michael).
- **Sizes** (in game pixels at 1x): the figure is 55 tall and 26 wide, a hand hangs about 14 above the feet, a tile is 64 x 32. The design agent's first two rounds (`data/art/items/`) are the reference for style: hard pixels, a 1 px `#2b2522` outline, light from the top left.

## Owed, in the order Michael's testing meets them

Slot sizes are columns x rows as they are in `data/items.json` now; the icon canvas is 19 x 19 per cell (a 1 x 3 item is 19 x 57). The existing generated sizes, length by thickness, are the proportions to keep.

**The starting bag and the dev chest (hand items, each needs a world picture and an icon):**
- **Torch**, 1 x 2, 22 x 8 plus its flame. Held lit in the off hand and carried on the belt at half light; the flame is drawn separately by the renderer (`flame` frames), so the torch art is the unlit stick and head. Also placed in brackets and posts (a separate prop, not this item).
- **Hatchet**, 1 x 2, 22 x 10. **Sword**, 1 x 3, 24 x 10 with its guard. **Mace**, 1 x 2, 24 x 11. **Stick**, 1 x 3, 25 x 6. **Plank**, 1 x 3, 26 x 6 (also a building material and the boards on windows: the same picture serves). **Log**, 2 x 3, 22 x 10 (held when carried; splits into three planks).
- **Spear**, 1 x 4, 28 x 8 (a wooden pole with a stone point; the thrown projectile is the same picture drawn smaller, see below). **Halberd**, 1 x 5, 69 x 24 (a 128 px frame, the hand 61 px from the tip; it needs hand-drawn angles as the staff has, since it is the longest). **Bow**, 2 x 3, 22 wide by 10, held in both hands at the main hand's angle. **Shield**, 2 x 2, 18 x 18, and **the raised guard** (a larger version, 20 x 20, shown before the chest when the right button is held: the pair is the held shield and the raised shield, plus the one icon).
- **Bandage**, 1 x 1 (stacks to 5): no held art needed (it is applied from the bag), an icon only; and the first item that is not a hand item.
- **Arrow**, 1 x 2 (stacks to 20): an icon, and the arrow in flight and on the ground, 16 directions (today generated: a thin shaft with a head and fletching, about 26 long).

**Food and drink (icon only, the bag shows them; no held art):** bread, apple (stacks to 5), cheese, waterskin (1 x 2, shows a fill level as a coloured bar over its icon).

**Added by the big pass (`30` step 3, 2026-10-12), all generated placeholders, all in the dev chest:** the tools, each held today as the hatchet's generated shape in its own colours and each worn by kills (a bar on the icon): **pickaxe** 1 x 2, **hoe** 1 x 3, **scythe** 1 x 3, **shovel** 1 x 3, **knife** 1 x 1 (the working knife, not the throwing knife), **hammer** 1 x 2, each owing a world picture, an icon, and a portrait; and, icon only, 1 x 1 and stacking: **charcoal** (20), **iron ore** (20), **iron bar** (10), **potato**, **cabbage**, **garlic** (10 each), **pumpkin** (5), **grain** and **flour** (20 each), **roast potato** (10), **stew** (3), **porridge** (5). The crops' plants in the field are drawn already (`docs/art/04`); their icons should be drawn from the same designs.

**Clothing and bags** are covered by the characters brief (`25`): tunic, breeches, boots, belt (and the good belt), gloves, cap and the hood (the onion hat), the small sack, the rucksack, and the developer bag. **The garments came in on 2026-10-12 as painted layers with no icon and no portrait** (`data/art/character/layers/`, `README_layers.md`), so each still owes both, drawn from the same design as its layer; the bags did not come (no `back` slot for painted layers). Flagged as the pair rule asks.

**Effects and projectiles that are generated today:** the spear in flight, the arrow in flight, the burning-character flames, embers and smoke (`fire.js`), the landing marker (a ring and a dotted line, a UI-like overlay, probably stays code). These are placeholders; real versions are wanted but are the least urgent.

## Already delivered and in the game (for the record)

Round 2 (2026-10-12): the **book of fire**, **staff of fire**, **throwing knife**, and **throwing axe**, each as a pair, in `data/art/items/` and in the game as art-only holdables. The **fireball** sheet (16 directions x 3 frames, 64 px cells) is stored and not yet used (`24`).

## Notes for whoever briefs the next round

- **How a delivery is checked and landed, and how the agent's own docs come in, is `27`.**

- **Since 2026-10-12 the pair is a trio for anything held or worn:** the world picture, the bag icon, and the 38 by 38 portrait for the character screen's slots. A delivery that lacks any of the three is flagged.
- **Ask for the pair, in the same folder, with the grip pixel,** and for hand-drawn angles for anything long (the halberd, the spear, the bow's arm, a future polearm).
- **A thrown item is one picture three times** (held, flying, lying on the floor); the knife and axe set the pattern.
- **A stack's count is drawn by the bag** in the lower right of the cell: leave that corner clear on stackable items. A worn weapon or tool gets a thin durability bar over its icon from the bag too, never in the art.
- **The atlas is the budget** (`22`, `23`): a long weapon's frames cost real space, so ask for the smallest frame that holds the drawing.
