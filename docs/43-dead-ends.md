# 43 — The dead ends: fires and lights, Pick up and Take apart, the made things, repairs, a body burned, a wave, the cowering, and the dye vat

**Status, 2026-10-25: a spec, ruled by Michael in session (`02`, 2026-10-25, The dead ends ruled; #273). Not built.** Written from `origin/main` at fb7c96b. Seven build steps, one issue each, in order; each is tried in the pane through `window.__game` and in two tabs with `check("sync")` before the next, and each names its wiki pages. A "default" is Primary's, Michael's to overrule; everything else here is his ruling. Skill gates (Crafting 3, Blacksmithing 1, and so on) are written as ruled and are **open to all until the skills are built**, as every recipe is today.

## 1. Why

The wiki's Dead ends page (#273) found 37 interactive things in the valley that nothing can make, a station with no recipes, an oven that does not cook, and props that look as if they do something and do not. Michael's rule from the loot sitting answers most of it: **gear is made by default** (`02`, 2026-10-24). The village's own stations stay one of a kind, so the village stays worth walking to, **but they are built so that making them movable and craftable is a switch, not a rebuild**.

## 2. Fires and lights (step 1)

- **The oven cooks** the fire's six recipes as well as its own (`docs/39` already ruled it; a bug stops it: `src/stations.js` `stationOf` returns the oven's own station before it looks at `fire.cooks`). The station panel lists both sets.
- **A lantern goes out.** The ruling that the village's lanterns never go out (2026-10-17) is struck: light will draw the dead (not built yet), so a light must be snuffable. A lantern on a post or in a bracket offers **Put out**, and is lit again with a tinderbox or a lit torch, as a torch is. The dead tinderbox row on `lantern_post` (`data/interactions.json`) becomes the real Light.
- **"Put out" everywhere**, never "douse": a lantern, a torch (the T key's "You douse the torch." becomes "You put out the torch."), a campfire, a fireplace.
- **Fixed home lights are switches; portable lights cost fuel** (Michael: lighting a house is "one of the least fun tasks"). A fireplace, a hearth, and a lantern turn **on and off and burn no fuel**: Light and Put out on their menus, no logs. A torch burns down and a campfire takes logs: carrying light or fire away from home is what fuel pays for. The cost a lit home keeps is the light itself, once the dead are drawn to it.
- **The campfire** (built from the build palette, `N`): **three stone and two logs**, on open ground outdoors only, no skill; the two logs are its starting fuel. It holds **six logs**, each burning **three game hours** (a full one burns eighteen); a log is added from the menu or by Use, and adding one lights it. **Put out** keeps the fuel left. **Pick up** only when it is out **and empty** (no log tricks): it becomes a **Campfire** item, **5 by 5 cells** (too big for the sack, a satchel's fill, comfortable in a rucksack), set down again with the ghost. **Take apart** (section 3) gives back the stones. The woodcutters' camp and the charcoal burners each get one placed on the map.

**The guest's side:** every verb above (Light, Put out, Add a log, Pick up, Take apart, build) is a verb in `verbs.js` or a menu label performed by the host, the target by prop id; a fire's `lit` and fuel are already in the chunk and the frame (`map.burnFires`); a placed campfire goes through `placement.performPlacement`. `check("kindle")`, `check("torch")`, `check("lantern")`, `check("flare")` grow rows; the wiki's Fire, Campfire, Lantern, Fireplace, Oven, Torch pages.

## 3. Pick up and Take apart (step 2)

One rule for every placed thing (Zomboid's distinction):
- **Pick up** keeps the thing whole: as an item in the bag (a campfire, a rug, a painting) or carried overhead (furniture). Anything carryable has it.
- **Take apart** destroys the thing and gives back **half its materials, rounded down**, and needs the tool its recipe needs (a hammer for furniture, as building). Anything a player can make has it.
- **Both are refused while the thing holds anything** ("Empty it first."), so nothing is lost by accident; a fire must be out.
- **The build palette's Remove becomes Take apart**, under the one word and the one rule: half back.
- **The village's one-of-a-kind stations** (section 5) have neither while the switch is off.

**The guest's side:** both are menu labels on a prop's address, performed by the host; the materials go to the actor's bag or the floor at their feet (`map.dropItem`). `check("build")` and `check("slots")` grow rows; the wiki's Building and Furniture pages.

## 4. The made things, the placements, and decoration (step 3)

Made, by `docs/39`'s furniture ruling (oak at Crafting 1, the fine woods at Crafting 5); each recipe's output is the prop, set down beside the station as the workbench's own recipe is. Numbers are defaults.
- **Hearth:** build palette, six stone, against a wall inside a room.
- **Wall bracket:** at the anvil, one iron bar (Blacksmithing 1); hung on a wall's face as a painting is (`paintings.js`'s segment rules), holding a torch or a lantern.
- **Torch post:** at the workbench, two planks and a stick (Crafting 1); outdoors.
- **Cupboard, desk, bookcase, counter, chair:** the workbench (Crafting 1). **Cart and market stall:** the workbench (Crafting 5). **Strongbox:** the anvil, iron-bound (Blacksmithing 3).
- **Barrel:** the workbench, four planks and an iron bar for the hoops (Crafting 3); it doubles the life of food in it (2026-10-23).
- **Jack-o'-lantern:** carved from a pumpkin with a dirk at the workbench (Crafting 1); set down as furniture; a small light that never goes out (it is decoration, not a home light). The plain decorative pumpkin props are cut: the crop is the pumpkin.
- **On the map:** the valley's four brackets start holding an unlit torch; a few torch posts along the square and the main road; the campfires of section 2.
- **Place as decoration**, a small system: an item that names a decoration prop (`decor` in its definition) gets **Place as decoration** with a warning. Food is one way: a placed pumpkin picked up again is a **Decorative pumpkin**, not food, so a prop that does not rot is never a larder. The first and, for now, only one is the pumpkin. Ground only; on a table is filed for later (`05`).

**The guest's side:** recipes run through the station's `craft` verb; a hung bracket through the `place` command as a painting; Place as decoration through `placement.performPlacement`. `check("craft")`, `check("paintings")`, `check("torch")` grow rows; each new item's hover card is read in the pane (the card law); the wiki's item pages and Workbench, Anvil.

## 5. The village's stations, behind a switch (step 4)

The forge, the anvil, the oven, the millstones, the dye vats, and the wells stay the village's: not carried, not made, no Pick up or Take apart (Michael accepts this as the starting position). **Built so that changing it is a switch:** each station's carry flag and recipe are data (a sprite's `carry`, a `data/recipes.json` row whose output is the prop), a second anvil or oven placed by a player works as the village's does, and **a world rule at the Sandbox step, "Village stations: fixed, or movable and craftable"**, off by default, flips them all. An instrument flips it in a test world and makes, carries, and uses each.

**The guest's side:** the rule is a world rule (`rules.js`, in the save), the same on every client. `check("worlds")` and a new row in `check("craft")`; the wiki's World rules and Levers pages.

## 6. Repairs, the sawpit, and honey (step 5)

- **One repair count per item, on the entry** (in the save and the frame as the entry's other fields). Every repair, anywhere, lowers the ceiling of the next; skills raise the ceilings; every item still steps down to breaking (Michael: "each does inevitably decay down the ladder to death").
- **The grindstone** sharpens an edged weapon for free, a few seconds' timed action: up to **60%** of its condition the first time, **40%** the second, **20%** the third, then no more.
- **The anvil** repairs (Blacksmithing 4, with materials, `docs/39`): up to **100%**, then **80%**, then **60%**, on the same count.
- **The sawpit** cuts a log into planks with no hatchet (Woodcutting 3).
- **The beehives** give **honey** every few game days (Beastlore 5); honey is food that never rots (2026-10-23) and pemmican's binder.

**The guest's side:** each is a verb on a prop id, the entry by its uid; the hive's next day rides on the prop as an apple tree's does (`fruit.js`). `check("wear")` and `check("apples")`' pattern; the wiki's Durability, Grindstone, Anvil, Honey pages.

## 7. A body burned, a wave, and the cowering (step 6)

- **Burn corpse**, on every body of the dead: greyed out unless you carry a **tinderbox and a log** (the log is spent). The body burns for about a game hour, giving light, then it and **everything in it** are gone. Its hover card warns in red: "Burns the body and everything in it." It uses the burning the dead already have (`burn.js`, `fire.js`).
- **Wave**, for the demo: a key and `/wave` in the chat play a two-second wave, seen by everyone. A new pose in `data/poses.json` (Michael's approval for the rig, here).
- **Immune villagers cower** (the guide and the teachers, root `CLAUDE.md`): one of the dead within a few tiles, they cower about a second, **arms up in a defensive pose** (a new pose, approved here), a "!" speech bubble as its visual twin, then run a few tiles away and path back to their spot once no dead are near. It is the ground for the villagers who flee for real (`docs/04`).

**The guest's side:** Burn corpse is a verb on the body's id; the wave a key event in the snapshot and a player's record field, drawn by every client; the cower the villager's state in its delta. `check("burn")`, `check("villagers")`, `check("immune")` grow rows; the wiki's Bodies, Emotes, Villagers pages.

## 8. The dye vat (step 7)

- **All three vats in the weaver's yard work** (friends dye side by side). **Unlocked at Crafting 3**, as a reward for working on a skill.
- **The picker is a stripped-down character creation screen:** the figure turning, a swatch row for each colour region of the garment, Apply. A broader curated palette than three colours.
- **Each item declares what it may be dyed:** a `dye` block in `data/items.json`, naming its regions and the colours or **schemes** allowed for them (a chest piece of black and brown may also be red and black: a new scheme is one line of data, no new art). A single-colour garment is one region.
- **For the artists:** a dyeable garment is painted with **one fixed pair of key tones per region** plus the outline; the game recolours each region by replacing its tones (`docs/28`'s "colour is data, not art", extended to several regions). Today only hair, beards, and head items are recoloured when painted; the build extends it to every painted slot. Art painted in fixed colours before this needs repainting into key tones to dye; the generated placeholder garments recolour already.
- **Primary's reading, Michael's to overrule:** the picker is built now with a cost hook; whether a dye costs a plant (woad, madder, weld, with foraging and Herbalism, #288) or nothing is open, and the vats need no plant until #288 lands.

**The guest's side:** Apply is a command by the entry's uid and the chosen scheme; the entry's `colours` already ride on a worn item to every client (the dead's dyed hoods). `check("hovercard")`, `check("layers")`; the wiki's Dye vat, Clothing pages.

## 9. Open and later

- **What the demo includes** of all this is open (Michael, 2026-10-25: "consider it an open question").
- **Filed for later** (`05`): things set on a table or a barrel; villagers waving back.
- **The spinning wheel** spins wool into yarn for woollen cloth (Crafting 6) when the sheep come; the notice board stays decoration until the quest board of 1.1; the crane, winch, mill wheel, mine mouth, spoil heap, market cross, stocks, headstones, maypole, and privy stay decoration.
