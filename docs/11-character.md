# 11 — Milestone 5: the character

**Status, 2026-10-13: built.** The code is the truth; since this was written: Tab and C open two independent panels, the bag and the character screen, each dragged by its header and remembered (`23`, step 4); a guest's drags, drops, and menu entries run on the host as commands by uid, slot, and bag address (`ui/inventory-actions.js`); the character's name and look come from an identity chosen when the character is made (`docs/31/09`).

**Update, 2026-10-12 (`19-characters.md`):** the doll, the hands, and the grid are no longer only the player's. Every character (the player, the dead, villagers) has `worn` and `hands`, and the dead and villagers also carry `pockets`, a small grid of their own that needs no bag or belt; the player's grid is still the bag on their back and their hotbar the belt. **A dead zombie is a container**: its body's grid holds what it wore, held, and carried, and taking things from it strips the body.

Michael, 2026-10-10: before combat, the worn screen and a hotbar, and this is more interesting to him right now than fighting, since nothing here can kill you and that makes testing easy. Ruled in `02-decisions.md`.

## The one rule

**Everything is a slot, nothing is a pointer.** An item is in exactly one place at a time. Moving it is always a drag or a menu action that takes it out of one place and puts it in another. **Carrying capacity is always a worn item**: the belt gives the hotbar, the bag on your back gives the grid.

## The places an item can be

| Place | What it is | Drawn |
|---|---|---|
| **Hands** | two slots, main and off | two read-only boxes beside the doll; filled by Equip in the item menu or by the number keys, never by dragging |
| **Worn** | the doll: head, chest, hands, legs, feet, waist, back | drag on and off |
| **Belt** | the slots the worn belt provides, keys 1 to 4 | the hotbar strip at the bottom of the screen |
| **Bag** | the grid of the bag worn on the back | the bag column, as now |
| **A container** | a chest, a barrel, a bag on the floor | a column beside yours while open and near |
| **The floor** | entries on a tile | small blocks |

A held, worn, or belted item is out of the bag. This replaces the earlier rule that a held item stays in the bag with an outline.

## The bag is an item

- The player starts wearing a **burlap sack**, six by four, and a **rope belt** with two slots. The items you carry belong to the sack, not to you.
- Drag the sack off the back slot onto the floor and it lies there with everything in it. Open it like a chest. Wear a bigger bag, then move things over. A **rucksack** (eight by five) turns up in chests; a **Developer Bag** (twelve by eight) comes from `__game.giveDevBag()` on the console and never from loot.
- ~~A bag cannot go inside a bag.~~ An empty bag or belt can go inside anything; one with something in it cannot (the one container rule, `02` question 20, 2026-10-10 night). Picking up a bag with one on your back offers **Swap bags**: yours drops where you stand, the new one goes on.
- With no bag on your back, Tab still opens the character screen so you can put one on, and says "No bag on your back." Picking something up with no bag puts it in a free hand if it is holdable, else refuses.
- Bags are not craftable yet; the sack is plenty for now.

## Worn things

| Item | Slot | Notes |
|---|---|---|
| Hood | head | |
| Tunic | chest | |
| Gloves | hands | |
| Breeches | legs | |
| Boots | feet | |
| Belt | waist | 2 belt slots |
| Good belt | waist | 4 belt slots; chest loot |
| Burlap sack | back | 6×4 |
| Rucksack | back | 8×5; chest loot |

All placeholders, plain coloured blocks in their slots. They do nothing yet beyond occupying the slot; armour and warmth are `05-someday.md`. The hood, tunic, breeches, and boots are the first layers the player sprite will be drawn from, which is the next conversation; this screen is where that lands.

## The hotbar

- The worn belt's slots, shown as a strip at the bottom centre with their key numbers, only while a belt is worn. Drag holdable items from the bag onto a slot and back.
- **Key 1 to 4 swaps slot n with the hand its item belongs to.** A sword on slot 1 and a torch in the off-hand: 1 draws the sword into the main hand; 1 again hangs it back on the belt. A two-handed item needs both hands free. An empty slot takes whatever the key's hand holds, so the keys also stow.
- Unequip from the item menu puts the item in the bag if it fits, else on the belt if a slot is free, else says so and leaves it in hand.

## The screen

- **C** opens the character screen: the doll with its seven slots, the two hand boxes, and the bag column beside it. **Tab** opens the bag alone as before. Escape closes either (docs/10). The cutaway comparison moves from C to **K** (both retired with the stubs on 2026-10-11, `17`).
- Dragging onto a doll slot checks the item's `wear` word; a wrong slot shows red. Dragging onto an occupied slot swaps if the occupant fits in the bag, else refuses.
- The one container rule (docs/02, 2026-10-10 late): a bag or a belt goes inside a container only while empty. This replaces "no bag in a bag".
- The hands are slots like any other (Michael, after play): drag onto a hand to equip, swapping out what was held into the bag or belt; drag out of a hand to the bag, the belt, or the floor. A torch goes in either hand.
- The screen sits in the centre of the view, laid out as an RPG doll from Michael's drawing: belt top-left, bag top-right, head, chest, legs, feet down the middle, a hand either side, gloves under the main hand; the bottom corners are free for later. The bag column stands to its right, an open container to its left. Tab alone keeps the bag in the top-right corner.

## Data

- An item may carry `wear` (one of the seven slots), `beltSlots` (a belt), or `bag: [cols, rows]` (a bag). A bag entry gets its `bag` object on first use and keeps it wherever the entry goes: on your back, on the floor, in a chest.
- The player has `hands: { main, off }` holding entries, `worn: { head, chest, hands, legs, feet, waist, back }` holding entries, and reads its bag and belt from what is worn.

## Accept when

1. The character screen shows the starter kit worn: tunic, breeches, boots, rope belt, burlap sack, the head slot empty; the torch in a hand box; the bag beside.
2. Drag the sack to the floor: it lies there with its contents; open it; wear it again; everything is still in it.
3. Wear a rucksack from a chest with the sack on: Swap bags drops the sack; move the items over from the sack on the floor.
4. Drag the torch from the bag to belt slot 1; press 1: it is in a hand and lit; press 1: it is back on the belt and out. Drag the torch from a hand into the bag, and from the bag onto either hand.
5. Drag a hood onto the feet slot: red, refused. Onto the head with a hood already on: swapped, the old hood in the bag.
6. Take the sack off and press Tab: the character screen opens with the message and no bag column; Pick up an apple with no bag refuses; a torch goes to a free hand.
7. Give the Developer Bag from the console, wear it, and the bag column is twelve by eight.
8. Nothing is drawn into the canvas; 60 fps with the screen open.
