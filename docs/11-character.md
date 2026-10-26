# 11 — Milestone 5: the character

**Status, 2026-10-18: built; a reference.** The code is the truth (`src/inventory.js`, `src/items.js`, `ui/inventory-panel.js`, `ui/inventory-actions.js`). Tab and C open two independent panels, the bag and the character screen, each dragged by its header and remembered (`23`, step 4). An eye on each worn slot of the character screen hides that item's art on the figure and keeps its every use (#159: the player's `hidden` list, `inventory.toggleHidden`, the guest's `op: "hide"`, seen by everyone). A Take All button on the container panel's header (#10), for a chest, a bag on the ground, a body, and a station's output, moves everything into the bag in the grid's order, food to a free belt slot when the bag is full, and leaves what fits neither with a word; **a bag or belt with things in it stays where it is** (it is not worn instead: Michael's to rule) and the word says to empty it first (`inventory-actions.takeAllFrom`, `takeAllWord`, the guest's `op: "takeall"`). Every character has `worn` and `hands` (`19`); the dead and villagers also carry `pockets`, a small grid of their own, and a dead zombie is a container whose grid holds what it wore, held, and carried. A guest's drags, drops, and menu entries run on the host as commands by uid, slot, and bag address. The character's name and look come from an identity chosen when the character is made (`31/09`). **The starting kit is data** (#136; `data/kit.json`, `src/kit.js`): the worn tunic, breeches, boots, belt, and sack; a waterskin, bread, two apples, a plank, and the tinderbox put where each first fits in the sack; the torch (unlit) in the hand. A world may **add items to it** (the rule `extraKit`, one `item_id count` a line) and may **start wearing the Developer Bag in place of the sack** (the rule `devBag`), both chosen once at the Sandbox step (`38`); the host gives every new character, a guest's too, the world's kit; a kit that does not fit the starting bag is refused with a word before the world is made. The worn slots are head, chest, hands, legs, feet, waist, and back (`WORN_SLOTS`); the belt keys are 1 to 4 (`interact.keyEvents`); the bags are the small sack (6 by 4), the rucksack (8 by 5), and the Developer Bag (12 by 8; a world may start wearing it in place of the sack, chosen once at the Sandbox step, #136, else from the console), the belts the rope belt (two slots) and the good belt (four). The bag, the hotbar, the screen's layout, and the acceptance as first written are `history/11-character-build.md`.

## The one rule

**Everything is a slot, nothing is a pointer.** An item is in exactly one place at a time. Moving it is always a drag or a menu action that takes it out of one place and puts it in another. **Carrying capacity is always a worn item**: the belt gives the hotbar, the bag on your back gives the grid.

## The places an item can be

| Place | What it is | Drawn |
|---|---|---|
| **Hands** | two slots, main and off | two boxes beside the doll; filled by Equip in the item menu, by the belt keys, or by dragging onto a hand (the occupant swaps out if it can be stowed; one hand dragged onto the other swaps the two); drag out to the bag, the belt, or the floor |
| **Worn** | the doll: head, chest, hands, legs, feet, waist, back | drag on and off |
| **Belt** | the slots the worn belt provides, each with a role by its index (`inventory.BELT_ROLES`): the rope belt's main, off, utility, the leather belt's two more, main and off; keys 1 to 5 in the order the setting Belt slot order gives | the hotbar strip at the bottom of the screen, each empty slot stamped faint with its role; a slot's key (and its Equip, a double-click) does what its role does with the thing there (`inventory.beltAction`, Michael 2026-10-25): a hand slot draws it into its hand and swaps what that hand held onto the slot (a two-hander from a main-hand slot into both hands), else eats a food, else says why; the utility slot eats and never equips; an empty slot does nothing and says nothing; a two-handed thing is refused in an off-hand slot; a skin sips by itself and its tap never drinks |
| **Bag** | the grid of the bag worn on the back | the bag column, as now |
| **A container** | a chest, a barrel, a bag on the floor | a column beside yours while open and near |
| **The floor** | entries on a tile | small blocks |

A held, worn, or belted item is out of the bag. This replaces the earlier rule that a held item stays in the bag with an outline.

## Data

- An item may carry `wear` (one of the seven slots), `beltSlots` (a belt), or `bag: [cols, rows]` (a bag). A bag entry gets its `bag` object on first use and keeps it wherever the entry goes: on your back, on the floor, in a chest.
- The player has `hands: { main, off }` holding entries, `worn: { head, chest, hands, legs, feet, waist, back }` holding entries, and reads its bag and belt from what is worn.
