# 30 — The big pass, specified: what you can do, what you must do, and where it all lives

**Status: the spec, written 2026-10-12 from `22` (Michael's brain-dump of the what), `29-world` (another agent's ideation of the where), and Michael's answers the same night (`02`, "The big pass answered"). Scoped for implementation by another model, step by step, each step playable; defaults in brackets are Michael's to overrule, not the implementer's. Combat is paused by ruling and is not here; magic (`24`) is its own doc; NPC routines (`04`) and records beyond the active region (`03`) come after. This document supersedes `22` as the plan and overrides `29` where the two differ (the overrides are listed in `29/README.md`).**

## 1. What this pass is

The pass that gives the game its stuff and its reasons: the needs that keep you alive, the verbs you have on the world, the items and their interactions, the stations and their recipes, farming, tools, durability, fire as maintenance, and the 1.0 map those things live on, built place by place. At its end the player can list every action the game offers by walking the village, and the loop closes without a vendor: everything `22` names has a source on the map and a station that uses it (`29/08`, the table).

What it is not: new combat rules (paused), magic beyond the two items that exist, quests, story, trade, travel, roofs, floors, animals beyond two, weather, seasons.

## 2. The laws this pass adds

Rulings, all in `02`:

1. **Everything is data.** A need's rate, a recipe, an interaction, a fire's fuel, a weapon's kills, a crop's days: a number or a row in `data/`, never a branch in code. Adding an item or a recipe is a row.
2. **Nothing interesting happens.** Any item can be used on any item, any tool on any thing in the world. The default result is that message. A real interaction is a row in `data/interactions.json` that replaces the message with its outcome (a result, a confirmation, a count to pick). One rule for the bag and the map.
3. **A station is a prop.** Placed like furniture (carried on the head, set down, built), opened with `E` or its menu, worked from your bag and every container within reach, one shared panel on the kit.
4. **Fire is maintenance.** A fire burns its fuel down over game hours and goes out; a station with a fire works only while lit; a craft in progress pauses while it is out and resumes when it is fed. Nothing is lost by forgetting, only time.
5. **Durability is kills.** A weapon's number is the dead it will put down; the wear per landed hit is derived from its hits per kill; a miss costs nothing; at zero it is gone; no repair (`22`'s ruling stands). A stick is about five, the best weapon no more than a hundred.
6. **Sleep fast-forwards the simulation.** Only in a bed, indoors; the clock runs fast with the world simulated at that speed until morning; you are never woken; you get up. Decided by the co-op tiebreaker (`CLAUDE.md`): the sim runs, nothing is poked.
7. **Nothing waits for art.** Every new thing has a placeholder from boot through the same sheet interface; a bookcase is a box with a definition until the picture arrives (`CLAUDE.md`'s rule, applied to every item below).
8. **Water stops walkers.** A tile that is wholly water is unwalkable by every entity: you, the dead, villagers, animals (Michael, 2026-10-12: "it also segments the map"). The bank's blend is ground. The ford and the weir's crest are a shallow kind with stones showing, never blue water, slow for everyone. The river and its crossings are the map's shape (`29`); you drink and fill from any water beside you, as from the well. Boats are someday (`05`); for now water is a source of water and, later, of fish, and that is all.
9. **Animals last.** Chickens and deer are the last step, so nothing before them depends on them; the knife's skinning, raw meat, leather, and the tannery ride with them.

## 3. Staying alive: the needs

### 3.1 The clock

A day is 720 seconds of real time (`clock.js`); the player wakes at 08:00. The needs are tuned to the day, which today's numbers are not (hunger drains full to empty in 600 s, thirst in 420 s, both less than a day). [New defaults in `data/tuning.json`: hunger full to empty in a day and a half, thirst in one day, tiredness in a day and a quarter; starving or dehydrated loses 1.5 and 2 health a second as now.] All behind the Survival setting as now; the setting stays, on by default once the pass's first step lands [on].

### 3.2 Hunger and thirst (exist; made real here)

Four stages each as now (`moodles.js`), with effects in the last two: at "very hungry" or "parched" stamina regenerates at half rate; at "starving" or "dying of thirst" health drains. Food restores hunger by its value, cooked food more than raw (section 7); drink restores thirst. The waterskin sips as now. **Drinking and filling from water:** at any water tile beside the player (the river, the brook, the ponds, the mere, the moat, the trough, the spring), the well's two actions; shallow water included. [Any water; no sickness from any of it in 1.0.]

### 3.3 Sleep (new)

- **Tiredness**, a fourth need, 0 to 100, drains over a day and a quarter awake; stages: Yawning, Tired (stamina regen at three quarters), Exhausted (sprint gone), Falling asleep (health stops regenerating). Never kills.
- **The action:** `E` on a bed, or its menu, while indoors (the tile is in a room, `map.roomAt`; a sealed room is not required). Refused outdoors and with the dead in sight ("Not with that watching.") [refused only outdoors; the dead in sight is a lean to try].
- **What happens:** the clock and the simulation run at 60 times speed until the player's tiredness is full or it is 06:00, whichever is later, with the player lying in the bed (the `down` pose; the figure is drawn, the dead treat them as a body). The world simulates at that speed: the dead walk, fires burn down, crops grow. Nothing interrupts the sleep (Michael's ruling); a zombie that reaches the bed bites a sleeper as it would a standing player, which is the one danger, and the reason a shut door matters.
- **Waking:** the player stands, tiredness restored, health regenerated by the night's share (3.4), the message says the day.
- **Co-op note:** nothing here reads a global player; the fast-forward is a loop speed multiplier that a second player's presence would veto, not a clock jump.

### 3.4 Health

Regenerates [1 a minute] while hunger and thirst are above their second stage and nothing bleeds; [4 a minute] asleep; none otherwise. Bandages close bleeds as now. Food does not heal directly any more [it does not]. The infection stays the marker it is; when it is made real a craftable cure with the mushrooms joins the cauldron's recipes (section 8).

### 3.5 Death

As ruled (`02`): the next survivor arrives elsewhere with the kit. Where: the inn, the toll house, or the croft, by turn [the inn first].

## 4. Every action, by what you have in your hands

The whole vocabulary. "Exists" means built today; everything else is this pass. The verbs appear in the right-click menu of the thing, or on `E` for the nearest; the hands decide which appear (law 2).

**Moving and the home (exist):** walk, sprint, climb through a window, open and close doors and shutters, board a window or a door, pull a board, carry furniture on your head and set it down, build walls, doors, and windows from the palette, remove what you built, light and feed a hearth, light a torch, mount it, take it.

**Looking and talking (exist):** the menu on anything, `E` the nearest action, open a container, loot a body, talk to a villager (a line), poke a thing (it wobbles).

**Eating, drinking, resting:** eat (exists), drink from a skin (exists), **drink at water**, **fill at water**, **sleep in a bed**, bandage (exists).

**Gathering:** pick a mushroom, a herb, a berry, an apple, a ready crop (hands); forage sticks under trees (exists by rule); **chop** a tree or a stump (hatchet); **mine** a rock or an ore rock (pickaxe); **dig** at a marked spot or a grave (shovel); **take** from a stack (logs, planks, stone blocks: a container that gives its material); **harvest** a grain field a row at a time (scythe); **fish** at water (rod; after the pass).

**Farming:** **till** grass or dirt into soil (hoe); **plant** a seed on soil; **water** a plot (the bucket, or a skin for one tile); pick or harvest; a crop's seeds come back with its harvest.

**Making:** **craft** at a station (recipes); **combine** two items in the bag (drag one onto the other; law 2); **split** a log into planks (exists); **cook** at a lit hearth with a pot; **bake** at a lit oven; **smith** at a lit forge with the anvil; **weave** at the loom; **dye** at a vat; **mill** at the millstones; **brew** at the cauldron; **press** at the cider press; **smoke** at the rack (with animals).

**Fire:** light (a torch or a flint, exists), **feed** with the fire's fuel (logs, charcoal), read how long it has.

**Fighting (exists, paused):** swing, shove, block, draw and loose, throw the spear.

**Animals (the last step):** **collect eggs** from a nest, **shoo** a chicken, **hunt** a deer (the bow), **skin** a dead deer (knife), **butcher** (knife).

## 5. Items

### 5.1 The registry

`data/items.json` grows by rows. Every row has `kind`, `size`, `color`, `short` (the placeholder block), and, as art lands, `icon`, `portrait`, and `held` (`26`'s three pictures). New in this pass:

- **Tags** (`tags: ["wood", "fuel"]`): wood, stone, metal, cloth, fibre, food, raw, cooked, fuel, seed, tool, herb, container, drink. Recipes may ask for a tag instead of an id (any `fuel`, any `raw` meat).
- **Materials:** log (exists), plank (exists), stick (exists), stone block, iron ore, iron bar, charcoal, cloth, wool, flax, thread, leather (with animals), straw.
- **Foods, raw:** potato, cabbage, garlic, pumpkin, rye grain, turnip, wheat grain, beans, onion, carrot, egg, raw meat (as their crops and art land; the first five exist as crops). **Foods, cooked:** stew, roast potato, bread (exists as an item), pie, porridge, cider, ale, smoked meat. **Drinks:** the waterskin (exists), a bottle, a mug.
- **Seeds:** one per crop, stackable, from a harvest and from the granaries.
- **Tools:** hatchet (exists), pickaxe, hoe, scythe, shovel, knife, hammer, fishing rod (later). Each `kind: "tool"`, a `verbs` list, a weak weapon block (they swing badly: low damage, high wear).
- **Herbs:** sage, yarrow, feverfew, nettle, each a gatherable and a dried bunch; mushrooms exist.
- **Stations and furniture as items:** a station is placed from the bag like furniture (it is a prop with `carry: true` until set down), or found placed on the map.

### 5.2 Durability (law 5)

On a weapon's block: `kills` (the design number) and, derived at load, `wearPerHit = 1 / (kills * hitsPerKill)` where `hitsPerKill` is the weapon's damage against the standard zombie's health, rounded up. A landed hit subtracts `wearPerHit` from the entry's `wear` (0 to 1); at 1 the entry evaporates with a message. Dual wielding splits the wear as ruled. **Display:** a thin bar on the item's icon once `wear > 0`, red under a fifth; no warning. **Defaults** (`items.json`, Michael's numbers, tuned up if unfair): stick 5, plank 5, hatchet 20, spear 25, mace 40, sword 60, halberd 80, the bow's string 100 shots, tools as weapons 5.

### 5.3 Interactions (law 2)

**Built ahead, 2026-10-12** (`02`, "Build in every right-click menu, Use on every item, and a text log"): the Use mode (`src/use.js`: the item outlined where it is, a label following the cursor, the next click the target, Escape cancels), `src/interactions.js` with `resolve` and the default message, the text log (`src/ui/log.js`) as the place results print, and Build in every world menu. Step 3 adds the rows' actions.

`data/interactions.json`: rows of `{ "use": <item id or tag>, "on": <item id, tag, prop sprite, or "tree" | "rock" | "water" | "soil" | "grass">, "verb": "Chop", "action": <kind>, ...}`. Kinds: `give` (a result item, a count, a confirmation if the input is consumed), `transform` (the target becomes another prop or floor: a tree to a stump, grass to soil), `open` (a station panel), `fill`, `plant`, `water`, `message` (a specific line). Without a row: "Nothing interesting happens." The menu lists only rows whose `use` is in a hand; the drag in the bag tries the row for the pair. A number picker appears when the input stacks and the row allows a count.

## 6. Stations (law 3)

One panel for all of them, on the kit: the recipe list on the left (greyed when short, the shortfall named), the ingredients and your count of each, a count to make, Make, the queue with its bar; the station's fire shown with its fuel if it has one. Ingredients and the fuel come from your bag, the belt, and every container within reach (`CLICK_REACH`, 2.6 tiles) including the wheelbarrow. A craft takes its recipe's seconds with the bar and you may walk off: the station keeps working; the result lands in the station's own output slot (a small container on it) to collect.

| Station | Fire | Lives (`29`) | First recipes |
|---|---|---|---|
| Workbench | no | the joiner, your lean-to | planks to boards, a stick to a torch, a hoe, a shovel, a handle; a chest, a shelf, a bed frame, a table, a bench; the wheelbarrow |
| Anvil and forge | the forge, charcoal | the village smithy (the castle's is cold) | ore to a bar; a bar to a knife, a hatchet head, a pickaxe head, a sword, a mace head, a spear point; a hammer |
| Cooking hearth | the hearth, logs, with a pot placed on it | the inn, the castle kitchen, Hollow's, any hearth with a pot | stew, roast potato, porridge, a pie |
| Oven | the oven, logs | the baker, the inn, the castle | bread from flour, a pie |
| Loom | no | the weaver | cloth from wool or flax thread; bandages; a tunic, breeches, a cap |
| Dye vats | no | the weaver's yard | a garment plus a dye plant to the dyed garment |
| Millstones | no | the mill | grain to flour |
| Cauldron | its own fire, logs | the witch | the cure (when infection is real); until then a herb tea that restores stamina |
| Cider press | no | the orchard | apples to cider |
| Smoking rack | its own, logs | the hunter | raw meat to smoked (with animals) |

Recipes in `data/recipes.json`: `{ station, out: {id, count}, in: [{id or tag, count}], seconds, fire: true|false }`. All known from the start (law 1; Michael's ruling).

## 7. Fire and fuel (law 4)

`data/fires.json` (today's fire data in sprite definitions moves here, or stays per definition and gains the fields): per kind, `fuel` (an item or tag), `hoursPerUnit`, `maxUnits`, `radius`, `cooks`, `heats`. Kinds: hearth (logs, 3 h a log, 4 units), campfire, forge (charcoal, 2 h, 4), oven (logs, 2 h, 3), brazier (charcoal), cauldron, smoking rack, candle (none, burns a day, tiny), lantern post, charcoal clamp (burns a day, smoke, no light). Feeding is the menu's Feed with the fuel in a hand or the bag; the prompt shows hours left. A lit fire in a room lights it as now. Cooking needs a lit hearth with a pot; the cooked food's value is the raw's doubled [doubled]. No spoilage.

## 8. Farming

- **Soil:** the hoe on grass or dirt turns the tile to farm soil (`map.setFloor`, the furrow direction from the hoe's swing direction); the two drawn soils serve.
- **Planting:** a seed on soil places the crop prop at stage 0 (the five crops exist with three stages; new crops as drawn).
- **Growth:** per crop, days per stage in `data/crops.json` [potato 2 and 2, cabbage 2 and 3, garlic 3 and 3, pumpkin 3 and 4, rye 3 and 3]; a stage advances on the clock whether the player is near or not (the map tile carries the planted hour; a chunk that was evicted catches up on load).
- **Water:** each soil tile has `dry` (0 to 2 days); a dry tile pauses growth, never kills; the bucket waters a 3 by 3, a skin one tile; rain is not in 1.0.
- **Harvest:** a ready crop gives its food and [two] seeds and the tile stays soil; the scythe harvests a row of grain at a swing. Crops are gatherables: outlined, wobbling (walked through too).
- **Seeds:** granaries, the storehouse, the gardener's shed, and every harvest.
- **New crops** (`29/09` request 1.4, as drawn): turnip, wheat, beans, hops, flax, onion, carrot; the four herbs.

## 9. The bucket

A **prop you carry** on your head like furniture (both hands full, no fighting), not an item: filled at a well or any water tile (its menu), poured on a plot (waters 3 by 3), set down anywhere (a container of water: a cooking hearth beside a full bucket needs no skin). Art: the barrel's placeholder path until drawn. The waterskin waters one tile for the small case.

## 10. Tools and their verbs

Hatchet: chop a tree (exists), chop a stump (a log). Pickaxe: mine a rock (stone blocks; the rock goes), mine an ore rock (ore). Hoe: till. Scythe: harvest grain rows, cut hay. Shovel: dig a grave (a grave's goods), dig the buried chest, dig up a plot. Knife: butcher and skin (with animals), cut flax to fibre. Hammer: the smith's and the workbench's recipes ask for it in hand; building stone walls asks for it. All are weapons with 5 kills and poor damage. The fishing rod after the pass.

## 11. The map, built place by place (the Where, from `29`, with this pass slotted in)

The order from `29/11` with the pass's pieces placed where they first matter. Each step ends playable, with its checks, its `02` entries, and a commit.

0. **The generator and the engine's tier 1.** `tools/mapgen/` (Python): a description per place (rooms as rects with a material per side, a floor, openings; fences as perimeters; roads as polylines with a width and a surface; props by name at offsets; decals; the dead and villagers) that writes `data/maps/valley.json` in today's format. Engine: water impassable with shallow slow (`map.moveCircle`, `pathfind`); see-through walls and unclimbable openings (`seeThrough`, `climb: false`); interior partitions and a material per side in the building format; fences as features that do not make rooms; drinking and filling at water. A 256 by 256 bounds. The dev chest and combat testing as a setting on the real map.
1. **The village,** from the art that exists: your cottage with its well and plot, the lane, the green and the pond, the square and the well, the inn with its boarded windows and its people, the chapel and the graveyard, the smithy, the joiner, the weaver, the baker, the merchant's house, six cottages, the bridge to nothing. Furniture that has no art is a placeholder box with its definition (the bookcase, the shelf, the dresser, the counter).
2. **The needs.** Tiredness and sleep, health regeneration, the retuned rates, drinking at water, fire fuel and feeding with hours shown. Survival on by default.
3. **Interactions and the first stations.** `interactions.json` and the "nothing interesting happens" default; the station panel; the workbench, the anvil and forge, the cooking hearth with the pot, the oven; recipes; durability by kills with the bar; the hammer, the knife, the pickaxe, the hoe, the shovel as items. The smith's loop closes with the castle's armoury not yet built, so the first iron is the smithy's own rack.
4. **The farms and farming.** Hollow Farm and Long Acre, the mill and the millstones, the roads; tilling, planting, growth, watering, the bucket, harvest, seeds; the scythe; grain to flour to bread. The pumpkin field as the postcard.
5. **The castle** and the bridge road: the taller walls (data), the gatehouse, the towers, the great hall, the kitchens with their stations, the barracks and the armoury (its door shut and boarded from inside; no locks), the wizard's study with the staff and the book, the garrison.
6. **The forest places,** one a session: the woodcutters (stacks that give), the witch (the cauldron, the herbs), the quarry (mining, stone), the charcoal burners (charcoal), the iron workings (ore), the hunter's lodge, the bandit camp, then the hooks (the barrow first).
7. **Dressing:** authored decals, signs, lights unlit, the dead's wardrobes as the character art lands, the barricades, the edges and the waystone.
8. **Animals.** Chickens (in coops and yards, wander, eggs in nests daily, a thing to look after) and deer (the forest, flee at sight, the bow hunts them, the knife skins and butchers): a drawn sheet each through the sprite system, the villagers' wander and the owed flee, a loot table each. With them: raw meat and the smoking rack's recipes, leather and the tannery back from the cut list, a leather jerkin at the loom.
9. **After the pass:** fishing (the rod, a cast at water, a table per water, fish that cook); then `04`'s routines and `24`'s magic have their world.

### Step 0 as built (2026-10-12)

- **The generator:** `tools/mapgen/mapgen.py` is the vocabulary (`road` and `river` along polylines merged into runs, `shallow`, `fence`, `reserve`, `place` with `building`, `floor_rect`, `fence`, `prop`, `crops`, `scatter`, `wild`, `forage`, `zombie`, `villager`, `write`) and `tools/mapgen/valley.py` the description; `python -I tools/mapgen/valley.py` writes `data/maps/valley.json` in the format `map.js` loads. Step 0's valley: a 256 bounds, the river from 29/01 with dirt banks, the stone bridge on the high street (laid stone until `floor_bridge_stone` is drawn), the ford as shallow water, the roads' skeleton (the high and west roads, the bridge road, the square, the nobles' street, the south lane, the lane, the drove), the home cottage of 29/07 with two rooms through a partition, its plot of crops at mixed stages, its well, a fence with two gates, the square's well, reserves for the village, the castle, and the farms, the forest everywhere else thicker than the proving ground's, a dozen of the dead on the roads, the four villagers. The game loads it by default; `?map=square` loads the proving ground.
- **Floors carry rules:** a floor definition's `walk` (`false`: water, no body enters, `map.isWalkableTile` and `circleBlocked` refuse it; a number: a speed factor, shallow water 0.5, read by the player, the dead, and villagers through `map.floorSpeedAt`) and `drink` (the well's two actions on any such tile beside you, in the menu and on `E`). `floor_water_shallow` is a dev flat (listed as `laid` in the ground kit) until drawn.
- **Walls carry rules:** a wall definition's `wall.seeThrough` (transmission 1 for the plain wall and a shut gate, and it bounds no room: a region closed by fences is outdoors, a cell behind bars is its corridor's room) and `wall.climb: false` (no opening in it is climbable: the arrow slit). `wall_fence` is a generated post-and-rail at 36 px until drawn.
- **The building format grew:** `wall` may be `{ n, s, e, w }`; `partitions` are runs of interior edges with openings by index; a `fence` feature (or a set's `fences`) walls a rect's perimeter with gates; an opening may name its own `wall` material.
- **The dev chest is a setting** (`devChest`, on by default for now, read at load) placed by the spawn, so no map file carries it; `combatTesting` was already one.
- **`check("water")`:** eight rows: water not walkable, a body stopping at the edge, a path going round, drinking and filling at the bank, shallow walked and at half speed, a fence passing sight and bounding no room, its gate a door.

## 12. Engine asks, consolidated

From `29/10` with the cuts applied and this pass's needs added; sizes without times.

- Tier 1 (step 0): water impassable and shallow slow; see-through walls; unclimbable openings; partitions and per-side materials; fences as features; the generator. Small to medium each.
- Step 2: the tiredness need and the sleep fast-forward (a loop speed multiplier, the `down` pose on a bed, the wake rule); health regeneration; water drinking; fire fuel data and the feed action with hours.
- Step 3: `interactions.json` and its resolver (the menu's verbs from the hands; the drag in the bag); the station panel on the kit; recipes with a queue and an output slot; durability fields and the bar; tools as items with verbs.
- Step 4: soil by hoe (`setFloor`), crop props with a planted hour and growth on the clock, dryness per soil tile, the bucket as a carried prop with fill and pour, the scythe's row harvest, stacks as containers that give.
- Step 5: the castle's wall heights verified through the cap redraw, the hit tests, and the arrow's scan; larger prop footprints (2 by 2, 3 by 1, 2 by 3; a general slice) or the two-piece fallback; wall-hung props beyond the bracket (banners, shelves, racks, signs); rugs as flat props; the hearth-radius cap for the hall; props with a prompt label.
- Step 6: mining (a rock gives and goes); the dead placed down and rising; containers on trees and stacks; authored decals.
- Step 8: an animal entity (a drawn sheet with facings, wander, flee, hit, loot); nests as containers that refill daily.
- Cut (`29/11`, taken): locked doors and keys, paired openings, carpet as an autotile, coin, the maze, the second smithy's fire, the willow's eyes.

## 13. Art, and the rule that nothing waits for it

`29/09` is the request list, unchanged in content, with these additions: the bucket (a carried prop, world picture only), the tools as trios (hoe, scythe, pickaxe, shovel, knife, hammer; the hatchet exists), the station output slot (none: UI), the chicken and the deer as eight-facing sheets with walk and idle (and the deer's flee), a nest, an egg, raw and smoked meat, leather and the jerkin, the cooked foods' icons. Every piece has a placeholder from boot: furniture and stations as the box generator with the definition's footprint and a label; items as coloured blocks; crops as the five that exist; animals as the villagers' sheet recoloured until drawn (a chicken as a small box that walks is fine for a week). The art lands through `27`'s checklist in `09`'s tiers, and the build order above follows the tiers, so the village is drawn before the castle is needed.

## 14. Verify, per step

Each step's acceptance is a check under `tools/checks/` where the sim can prove it and a screenshot where only eyes can: step 0, the dead cannot cross the river and do cross the ford (`check("water")`); step 2, a night slept passes eight hours with the fire burned down the right number of logs (`check("sleep")`); step 3, a recipe made from a chest's ingredients with the station's fire lit and paused when it dies (`check("craft")`), a stick evaporating on its sixth kill (`check("wear")`); step 4, a potato planted and harvested with seeds back over its days, dry and watered (`check("farm")`); the determinism hash before and after every step.

## 15. Open

- Names: the village, the river, the castle, the farms, the mere, the villagers (`29/11` Q4). Placeholders until Michael names them.
- Which new crops first [turnip, wheat, beans, hops].
- The rates and the regeneration numbers are defaults to feel out in play.
