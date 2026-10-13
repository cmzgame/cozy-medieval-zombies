# 29.08 — The loop: what there is to do, and where

The brief: the 1.0 map must be fairly dense with stuff to do, because quests, story, and distant travel come after it. Density here means three things on every screen: **something to gather, something to open, and something to look at**; and across the map, **every resource the big pass (`22`) and the combat docs name has a place it comes from**, so the loop closes without a vendor.

## The rule of three, per screen

At the wide zoom a screen is roughly a 30 by 30 block of tiles. The plan's places are laid so that no such block inside the bounds is empty of all three:

| Block | Gather | Open | Look at |
|---|---|---|---|
| the village square | the well; the stalls' apples | the stalls, the inn | the dead traders, the market cross, the notice board |
| the green and your lane | your garden, the woodpiles, the pond's reeds | the cottages, the reeve's house | the pond, the willow, the stocks, the maypole |
| the chapel end | the graveyard's herbs? no: the yew's sticks; the crypt | the crypt's coffins, the vestry | the rising, the lychgate, the bell tower |
| the trades | the joiner's stacks, the baker's loaves | every workshop | the signs, the forge, the loom |
| the nobles | the manor's beehives (later), the fish pond | the storehouse, the strongbox | carpets, tapestries, the knot garden |
| the bridge | the river (water) | the toll house, the cart on the bridge | the castle over the water, the knot of the dead |
| the castle's bailey | the well, the herb garden | the kitchens, the barracks | the walls, the banners, the maze |
| the keep | the feast | the chests, the racks, the study | the hall, the dragon skull, the scorched floor |
| Hollow Farm's yard | the orchard, the fields, the hen house | the barn, the farmhouse, the granary | the pumpkin field, the dovecote, the pond |
| Long Acre | the rye, the flax | the barn, the mill | the wheel, the weir, the brook |
| the mere | herbs, mushrooms, berries | the witch's jars, the boat | the willow with eyes, the shrine |
| each forest place | sticks, mushrooms, brambles, a hollow tree | its huts and stacks | its one strange thing |
| the forest between | sticks, mushrooms, logs by felling | a hollow tree one giant in five | the trees, the light, the dead among them |

The forest between places is the one kind of block that leans on the scatter alone, and the scatter already fills it (sticks, mushrooms, rocks, leaves); the hollow-tree container and the bramble are the two additions that make a walk through it pay.

## Where every resource comes from

Every item or material the docs name, and the places on this map that supply it. **Bold** is the one place that supplies it best; the rest are backups so no single room gates a loop.

| Resource | From |
|---|---|
| logs | any tree by felling; **the woodcutters' stacks**; woodsheds everywhere |
| planks | logs split; **the joiner's yard**; the woodcutters; the barns |
| sticks | under every tree (the per-tree rule); brush piles |
| stone | **the quarry's blocks**; rubble at the hermitage and the castle's fallen corner; mined from rocks when mining exists |
| iron (ore, scrap, bars) | **the mine's crate and ore rocks**; the smithies' bar racks; the armoury's broken gear |
| charcoal | **the charcoal burners' sacks**; the smithies' coal bins |
| cloth, wool, flax | **the weaver's bolts**; Long Acre's flax; the croft's wool scraps; the merchant's storehouse |
| leather | the tannery; the bandits; the saddler's pegs in the castle stables |
| bandages | cloth at the loom; the barracks' chests; the witch |
| herbs | **the castle's herb garden**; the witch's garden; wild in clearings |
| mushrooms | **the forage rule near trees**; the witch's bed |
| the cure (brewing) | **the witch's cauldron**; a second cauldron in the castle kitchen if two is right |
| seeds | **the granaries** (Hollow's, the mill's); the merchant's storehouse; the gardener's shed; the witch |
| food, raw | every field and orchard; the hen house's eggs (once); the river's fish if fishing comes |
| food, cooked | the inn's kitchen; the castle kitchen; the baker; any hearth with the cooking station |
| bread and flour | **grain at Long Acre, flour at the mill, bread at the baker and the ovens** |
| water | the wells (your own, the square's, the inn's, the castle's, Hollow's, Long Acre's); the river and the brook; the mere; the croft's spring |
| wood for fires | logs everywhere; the castle's braziers want charcoal |
| weapons, cheap | sticks and planks everywhere; the hatchet in your chest; the stalls' knives |
| weapons, good | **the castle's armoury racks**; the gatehouse's racks; the crypt's knight's sword; the bandits' knives; the smith's loop |
| bows and arrows | **the hunter's lodge**; the bandits; the armoury |
| shields | the armoury; the gatehouse; the hall's walls |
| the staff and the book of fire | **the wizard's study**, one of each |
| the throwing knives and axes | the bandits (knives); the woodcutters (a hand axe) |
| clothes and dyes | **the weaver and the dye vats**; the lady's chest; the merchant's storehouse; every corpse |
| candles and lamp oil | the chandler's lean-to; the chapel; the merchant |
| coin | the treasury; the toll house; the strongboxes; the tinker's cart |
| books | the ledger (the solar), the book of hours (the castle chapel), the hermit's prayers, the witch's receipts (a recipe book, if recipes are learned: `22` Q2) |
| keys | the dead steward (the hall), the jailer (the dungeon), the reeve |
| beds to sleep in | yours; **the inn's three rooms**; the manor's; the barracks; the croft |
| stations | the smith's anvil (the village smithy, the castle's); the workbench (the joiner); the loom and the dye vats (the weaver); the ovens (the baker, the castle, the inn); the millstones (the mill); the cauldron (the witch); the cooking hearths (the inn, the castle, Hollow's kitchen); the cider press (the orchard); the smoking rack (the hunter) |

The table is the map's proof that `22`'s loop closes: every station has a home, every material has a source, and the good things are behind the dead.

## Where the dead are

The map's dead are authored per place (`10-engine-asks`: a `zombies` count per set, or the top-level list the map file has now), plus the wild's zero to two a chunk beyond the bounds. The authored total is about 120, which with `23`'s bounded lists and the 40-tile thinking box costs what today's 67 cost.

| Place | How many | Who they were | Why there |
|---|---|---|---|
| the castle | 35 to 40 | the garrison, the household, the feast's guests | the reward's price; the densest place |
| the bridge, both ends | 6 at the toll gate, 4 at the castle end | travellers, the toll keeper | the one crossing |
| the village streets and square | 12 | traders, neighbours | the first look |
| the graveyard | 8, rising | the buried | the spooky set piece |
| the trades | 1 each, at their work | the smith, the baker, the joiner | the story in a glance |
| the nobles | 2 at the merchant's, 1 at the manor | the merchant and his wife, a servant | the loot's guard |
| the cottages | 3 across eight | neighbours | a street is not safe |
| Hollow Farm | 5 in the yard | the family | the big farm's price |
| Long Acre | 3 | farmhands | thin |
| the croft | 0 | | the reward of the ford |
| the bandit camp | 6 | bandits | they were bad before they were dead |
| the woodcutters, the burners, the mine | 1, 1, 3 | the burner, miners | |
| the hermitage | 1 | the hermit, inside | |
| the forest | the wild rule, plus 10 scattered inside the bounds | the lost | the walk home is never free |

The dead's distribution is the map's difficulty curve: the west bank is a dozen spread thin, the east bank is fifty behind water, and the graveyard is the one dense knot on the safe side, fenced.

## Who is alive

`04` says a handful, six to ten; the atlas today holds about seventeen more distinct outfits (`19`). The plan places fourteen named villagers and marks the six that matter first. All of them idle and wander on a tether today; "follow", "stay", and routines are `04`'s next pass, and each one's job below is written for that pass.

| Villager | Where | Core | Job for the routines pass; a first line |
|---|---|---|---|
| **the innkeeper** | the inn's taproom | yes | behind the bar by day, bars the door at dusk; "Shut that behind you." |
| **a guest** | the inn's rooms | yes | a traveller who was passing through; "I only stopped for the night." |
| **the priest** | the chapel's vestry | yes | the bell at dawn (when noise exists), the graveyard by day; "The bell stopped on the third day." |
| **the miller** | the mill | yes | the wheel, the granary; "Grain is grain. Bring it, I will grind it." |
| **the witch** | the mere | yes | the cauldron, the garden, the shrine at dusk; "The bite is a seed. I know what grows from it." |
| **the shepherd** | the croft | yes | the fold, the spring; "They do not like the water. Neither did the sheep." |
| the reeve | the green's corner | | stays indoors; has the lychgate key; "I have the keys and no one to give them to." |
| the merchant's apprentice | the storehouse | | counts stock; "It is all here. Every bale. Nobody to buy it." |
| the two woodcutters | the camp | | fell and stack; "Go east and you will not come back. That is not a threat." |
| the hunter | the lodge | | checks snares; "I have arrows. I have no one to shoot." |
| a child | the inn | | follows the innkeeper; no line |
| a neighbour | the shut cottage on your lane | | will not open the door; "Go away." |
| the bandits' prisoner | the cage | | freed when following exists; "Thank you. Now what." |

Fourteen is more than `04`'s handful; the six core ones are the handful, and the rest are the places' reasons to be alive. A villager who dies turns in their clothes (`19`), so each of them is also a future zombie with a story.

## Fishing, an option

Not in any doc. The river, the brook, the mere, the millpond, and two ponds are on the map; a **fishing rod** (a tool, held in both hands), a cast at any water tile beside you (a timed action with the bar), a catch rolled from a table per water (trout in the river, pike in the mere, carp in the manor's pond), a **fish** item that cooks and a **bones** item that fertilises. The cosiest loop Stardew has that this game lacks, and the sibling never had. Cheap on the engine (an action, a table, two items, held art); it is proposed, not planned, and sits in `11`'s questions.

## Counting the whole

| | Count |
|---|---|
| authored tiles | 65,536 (256 by 256) |
| buildings with rooms | about 46 (the castle 12, the village 23, the farms 8, the forest 9, minus the cut list) |
| rooms | about 110 |
| stations | 12 kinds, 18 placed |
| fields and plots | 17, about 1,400 tiles of farm soil |
| containers | about 260 (the castle 70, the village 110, the farms 40, the forest 40) |
| named villagers | 14 (6 core) |
| the authored dead | about 120 |
| crossings | 6 (the stone bridge, the footbridge, the ford, the weir, the drawbridge, the postern) |
| still waters | 5 and a moat |
| roads | 9 named, about 900 tiles of road |
| new crops | 7 (turnip, wheat, beans, hops, flax, onion, carrot) and 4 herbs |
| new trees | 3 (apple, the dead tree, the willow in from the shelf) |
