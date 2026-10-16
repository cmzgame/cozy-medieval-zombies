# 30 — The big pass, specified: what you can do, what you must do, and where it all lives

**Status: the spec, written 2026-10-12 from `22` (Michael's brain-dump of the what), `29-world` (another agent's ideation of the where), and Michael's answers the same night (`02`, "The big pass answered"). Scoped for implementation by another model, step by step, each step playable; defaults in brackets are Michael's to overrule, not the implementer's. Combat is paused by ruling and is not here; magic (`24`) is its own doc; NPC routines (`04`) and records beyond the active region (`03`) come after. This document supersedes `22` as the plan and overrides `29` where the two differ (the overrides are listed in `29/README.md`).**

**Where it stands, 2026-10-13: steps 0 to 3 are built** (each has its "as built" notes at the end of section 11, and the rulings they forced in `02`); **step 4 onward is not**, held there by Michael while the multiplayer work landed. **Multiplayer is live** (`02`, 2026-10-13; `31-multiplayer/08`): every step from 4 on is built for a guest in the same commit, running in the host's step, reached by a guest through the same verb, handler, key event, or command, travelling in the save and the frame, and hashed by the sync check; the sections below name the guest's side where it is not obvious.

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
6. **Sleep fast-forwards the simulation.** Only in a bed, indoors; the clock runs fast with the world simulated at that speed until morning; you are never woken; you get up. Decided by the co-op tiebreaker of 2026-10-12 (since replaced by the multiplayer rule, `31/08`): the sim runs, nothing is poked. With friends in the world, time runs fast only while every living player in it is in bed (`02`, 2026-10-13).
7. **Nothing waits for art.** Every new thing has a placeholder from boot through the same sheet interface; a bookcase is a box with a definition until the picture arrives (`CLAUDE.md`'s rule, applied to every item below).
8. **Water stops walkers.** A tile that is wholly water is unwalkable by every entity: you, the dead, villagers, animals (Michael, 2026-10-12: "it also segments the map"). The bank's blend is ground. The ford and the weir's crest are a shallow kind with stones showing, never blue water, slow for everyone. The river and its crossings are the map's shape (`29`); you drink and fill from any water beside you, as from the well. Boats are someday (`05`); for now water is a source of water and, later, of fish, and that is all.
9. **Animals last.** Chickens and deer are the last step, so nothing before them depends on them; the knife's skinning, raw meat, leather, and the tannery ride with them.

## 3. Staying alive: the needs

### 3.1 The clock

A day is 720 seconds of real time (`clock.js`); the player wakes at 08:00. The needs are tuned to the day, which the numbers before step 2 were not (hunger drained full to empty in 600 s, thirst in 420 s, both less than a day). [New defaults in `data/tuning.json`: hunger full to empty in a day and a half, thirst in one day, tiredness in a day and a quarter; starving or dehydrated loses 1.5 and 2 health a second as now.] All behind the Survival setting as now; the setting stays, on by default since step 2 [on].

### 3.2 Hunger and thirst (exist; made real here)

Four stages each as now (`moodles.js`), with effects in the last two: at "very hungry" or "parched" stamina regenerates at half rate; at "starving" or "dying of thirst" health drains. Food restores hunger by its value, cooked food more than raw (section 7); drink restores thirst. The waterskin sips as now. **Drinking and filling from water:** at any water tile beside the player (the river, the brook, the ponds, the mere, the moat, the trough, the spring), the well's two actions; shallow water included. [Any water; no sickness from any of it in 1.0.]

### 3.3 Sleep (new)

- **Tiredness**, a fourth need, 0 to 100, drains over a day and a quarter awake; stages: Yawning, Tired (stamina regen at three quarters), Exhausted (sprint gone), Falling asleep (health stops regenerating). Never kills.
- **The action:** `E` on a bed, or its menu, while indoors (the tile is in a room, `map.roomAt`; a sealed room is not required). Refused outdoors and with the dead in sight ("Not with that watching.") [refused only outdoors; the dead in sight is a lean to try].
- **What happens:** the clock and the simulation run at 60 times speed (once every living player in the world is in bed) until the player's tiredness is full or it is 06:00, whichever is later, with the player lying in the bed (the `down` pose; the figure is drawn, the dead treat them as a body; not built: the sleeper stands by the bed until `32`, item 7). The world simulates at that speed: the dead walk, fires burn down, crops grow. Nothing interrupts the sleep (Michael's ruling); a zombie that reaches the bed bites a sleeper as it would a standing player, which is the one danger, and the reason a shut door matters.
- **Waking:** the player stands, tiredness restored, health regenerated by the night's share (3.4), the message says the day.
- **With friends (built, `02`, 2026-10-13):** nothing here reads a global player; the fast-forward is the world's time scale, never a clock jump, computed each step from who is asleep (`game.everyoneAsleep`, `timeScaleNow`): sixty only while every living player in the world is in bed, a dormant or dead one counting for neither side. A sleeper alone among the waking sleeps at ordinary speed, rested and regenerating at the sleeping rate, and is told "Time will pass faster once everyone in the world is asleep." A guest lies down through the same verb by the bed's id.

### 3.4 Health

Regenerates [1 a minute] while hunger and thirst are above their second stage and nothing bleeds; [4 a minute] asleep; none otherwise. Bandages close bleeds as now. Food does not heal directly any more [it does not]. The infection stays the marker it is; when it is made real a craftable cure with the mushrooms joins the cauldron's recipes (section 8).

### 3.5 Death

As ruled (`02`): the next survivor arrives elsewhere with the kit. Where: the inn, the toll house, or the croft, by turn [the inn first]. **Built in part** (`31/09`): the dead screen's New character makes the next survivor in the same world from an identity, the body left where it fell; it arrives beside the map's spawn for now, and the turn of the inn, the toll house, and the croft is not built.

## 4. Every action, by what you have in your hands

The whole vocabulary. "Exists" means built before this pass; everything else is this pass. The verbs appear in the right-click menu of the thing, or on `E` for the nearest; the hands decide which appear (law 2). **Built by step 3:** drink and fill at water, sleep in a bed, feed a fire, craft, cook (any lit fire that cooks), bake, and smith; combine is the Use mode, an item used on an item (the drag in the bag is not built). **Since, by #14 (2026-10-15):** dip, a stack of arrows used on any lit fire for fire arrows (`src/burn.js`, a row in `interactions.json` with `action: dip`). Everything else in the list is step 4 onward. Every verb is reached by a guest the way the host's player reaches it (the menu entry or `E` as a command by address, a Use row by the entry's uid), and performed in the host's step.

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

`data/interactions.json`: rows of `{ "use": <item id or tag>, "on": <item id, tag, prop sprite, or "tree" | "rock" | "water" | "soil" | "grass">, "verb": "Chop", "action": <kind>, ...}`. Kinds: `give` (a result item, a count, a confirmation if the input is consumed), `transform` (the target becomes another prop or floor: a tree to a stump, grass to soil), `open` (a station panel), `fill`, `plant`, `water`, `message` (a specific line). Without a row: "Nothing interesting happens." The menu lists only rows whose `use` is in a hand; the drag in the bag tries the row for the pair (not built; the Use mode does item on item today). A number picker appears when the input stacks and the row allows a count.

## 6. Stations (law 3)

One panel for all of them, on the kit: the recipe list on the left (greyed when short, the shortfall named), the ingredients and your count of each, a count to make, Make, the queue with its bar; the station's fire shown with its fuel if it has one. Ingredients and the fuel come from your bag, the belt, and every container within reach (`CLICK_REACH`, 2.6 tiles) including the wheelbarrow. A craft takes its recipe's seconds with the bar and you may walk off: the station keeps working; the result lands in the station's own output slot (a small container on it) to collect. **For a guest (built in tier 3 of `31`):** the panel opens on its replica when the host says its player used a station, Make is a command the host runs as the craft verb (`net.sendCraft`), the output opens as a container by the same path as any other, and the queues ride in the frame (`queues`) so a guest's bar shows the job's time left; a new station needs nothing more than its definition and its rows.

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

Recipes in `data/recipes.json`: `{ station, out: {id, count}, in: [{id or tag, count}], seconds, fire: true|false }`. All known from the start (law 1; Michael's ruling). **Restated 2026-10-13 (`02`, "What this game is"):** every recipe you need to play effectively is known from the start; a skill may unlock more, as flavour, never power, until something in the game (a hard boss) asks for more.

## 7. Fire and fuel (law 4)

`data/fires.json` (today's fire data in sprite definitions moves here, or stays per definition and gains the fields; **built in step 2 the second way**: `fire.fuel` and `fire.hoursPerUnit` on each fire's sprite definition beside `maxFuel` and `radius`, no `fires.json`): per kind, `fuel` (an item or tag), `hoursPerUnit`, `maxUnits`, `radius`, `cooks`, `heats`. Kinds: hearth (logs, 3 h a log, 4 units), campfire, forge (charcoal, 2 h, 4), oven (logs, 2 h, 3), brazier (charcoal), cauldron, smoking rack, candle (none, burns a day, tiny), lantern post, charcoal clamp (burns a day, smoke, no light). Feeding is the menu's Feed with the fuel in a hand or the bag; the prompt shows hours left. A lit fire in a room lights it as now. Cooking needs a lit hearth with a pot (ruled at step 3: any lit fire that cooks, the pot not asked for until it is an item worth placing); the cooked food's value is the raw's doubled [doubled]. No spoilage.

## 8. Farming

- **Soil:** the hoe on grass or dirt turns the tile to farm soil (`map.setFloor`, the furrow direction from the hoe's swing direction); the two drawn soils serve.
- **Planting:** a seed on soil places the crop prop at stage 0 (the five crops exist with three stages; new crops as drawn).
- **Growth:** per crop, days per stage in `data/crops.json` [potato 2 and 2, cabbage 2 and 3, garlic 3 and 3, pumpkin 3 and 4, rye 3 and 3]; a stage advances on the clock whether the player is near or not (the map tile carries the planted hour; a chunk that was evicted catches up on load).
- **Water:** each soil tile has `dry` (0 to 2 days); a dry tile pauses growth, never kills; the bucket waters a 3 by 3, a skin one tile; rain is not in 1.0.
- **Harvest:** a ready crop gives its food and [two] seeds and the tile stays soil; the scythe harvests a row of grain at a swing. Crops are gatherables: outlined, wobbling (walked through too).
- **Seeds:** granaries, the storehouse, the gardener's shed, and every harvest.
- **New crops** (`29/09` request 1.4, as drawn): turnip, wheat, beans, hops, flax, onion, carrot; the four herbs.
- **For a guest** (`31/08`): till, plant, water, and harvest are verbs in the table and rows in `interactions.json`, so a guest reaches them by the menu, `E`, or the Use mode as commands by the tile's address and the entry's uid, and the host performs them in its step with its own reach checks. The soil, the crop's planted hour and stage, and a tile's `dry` are map state changed through mutators that touch the tile (`map.setFloor`, the crop prop's own), so they reach a guest in the frame's touched chunks and the save, and the sync check's `map` part hashes them; growth reads the world's clock and `loop.simTime()`, never a client's.

## 9. The bucket

A **prop you carry** on your head like furniture (both hands full, no fighting), not an item: filled at a well or any water tile (its menu), poured on a plot (waters 3 by 3), set down anywhere (a container of water: a cooking hearth beside a full bucket needs no skin). Art: the barrel's placeholder path until drawn. The waterskin waters one tile for the small case. **For a guest:** the bucket is carried as any prop is (the prop in hand rides in the character's record as `carried`, and a guest's put-down is `placement.performPlacement` run on the host); fill and pour are verbs by the bucket's id and the target tile, performed in the host's step; how full it is is a field on the prop, so it travels with the prop in the frame and the save.

## 10. Tools and their verbs

Hatchet: chop a tree (exists), chop a stump (a log). Pickaxe: mine a rock (stone blocks; the rock goes), mine an ore rock (ore). Hoe: till. Scythe: harvest grain rows, cut hay. Shovel: dig a grave (a grave's goods), dig the buried chest, dig up a plot. Knife: butcher and skin (with animals), cut flax to fibre. Hammer: the smith's and the workbench's recipes ask for it in hand; building stone walls asks for it. All are weapons with 5 kills and poor damage. The fishing rod after the pass. Each tool's verb is a row in the verb table with its target as an address (a prop's id, a tile), re-validated when it fires so two players cannot fell one tree or mine one rock twice; what it removes or gives goes through the map's mutators, so a guest sees the stump, the gone rock, and the dug plot in the touched chunks.

## 11. The map, built place by place (the Where, from `29`, with this pass slotted in)

The order from `29/11` with the pass's pieces placed where they first matter. Each step ends playable, with its checks, its `02` entries, and a commit. **Steps 0 to 3 are built** (2026-10-12 and 13, the notes below the list); **4 to 9 are not**, and each is built for a guest in the same commit (`31/08`).

0. **The generator and the engine's tier 1.** `tools/mapgen/` (Python): a description per place (rooms as rects with a material per side, a floor, openings; fences as perimeters; roads as polylines with a width and a surface; props by name at offsets; decals; the dead and villagers) that writes `data/maps/valley.json` in today's format. Engine: water impassable with shallow slow (`map.moveCircle`, `pathfind`); see-through walls and unclimbable openings (`seeThrough`, `climb: false`); interior partitions and a material per side in the building format; fences as features that do not make rooms; drinking and filling at water. A 256 by 256 bounds. The dev chest and combat testing as a setting on the real map.
1. **The village,** from the art that exists: your cottage with its well and plot, the lane, the green and the pond, the square and the well, the inn with its boarded windows and its people, the chapel and the graveyard, the smithy, the joiner, the weaver, the baker, the merchant's house, six cottages, the bridge to nothing. Furniture that has no art is a placeholder box with its definition (the bookcase, the shelf, the dresser, the counter).
2. **The needs.** Tiredness and sleep, health regeneration, the retuned rates, drinking at water, fire fuel and feeding with hours shown. Survival on by default.
3. **Interactions and the first stations.** `interactions.json` and the "nothing interesting happens" default; the station panel; the workbench, the anvil and forge, the cooking hearth with the pot, the oven; recipes; durability by kills with the bar; the hammer, the knife, the pickaxe, the hoe, the shovel as items. The smith's loop closes with the castle's armoury not yet built, so the first iron is the smithy's own rack.
4. **The farms and farming** (the next step, held by Michael 2026-10-13). Hollow Farm and Long Acre, the mill and the millstones, the roads; tilling, planting, growth, watering, the bucket, harvest, seeds; the scythe; grain to flour to bread. The pumpkin field as the postcard.
5. **The castle** and the bridge road: the taller walls (data), the gatehouse, the towers, the great hall, the kitchens with their stations, the barracks and the armoury (its door shut and boarded from inside; no locks), the wizard's study with the staff and the book, the garrison.
6. **The forest places,** one a session: the woodcutters (stacks that give), the witch (the cauldron, the herbs), the quarry (mining, stone), the charcoal burners (charcoal), the iron workings (ore), the hunter's lodge, the bandit camp, then the hooks (the barrow first).
7. **Dressing:** authored decals, signs, lights unlit, the dead's wardrobes as the character art lands, the barricades, the edges and the waystone.
8. **Animals.** Chickens (in coops and yards, wander, eggs in nests daily, a thing to look after) and deer (the forest, flee at sight, the bow hunts them, the knife skins and butchers): a drawn sheet each through the sprite system, the villagers' wander and the owed flee, a loot table each. With them: raw meat and the smoking rack's recipes, leather and the tannery back from the cut list, a leather jerkin at the loom. For a guest, an animal is a character like the dead and the villagers: its wander and flee run in the host's step on the sim's `rng`, its list travels in the frame as a delta with a roster beside theirs and in the save, the sync check's `dead` part covers it, and a nest's eggs come by the world's clock.
9. **After the pass:** fishing (the rod, a cast at water, a table per water, fish that cook); then `04`'s routines and `24`'s magic have their world.

### Step 0 as built (2026-10-12)

- **The generator:** `tools/mapgen/mapgen.py` is the vocabulary (`road` and `river` along polylines merged into runs, `shallow`, `fence`, `reserve`, `place` with `building`, `floor_rect`, `fence`, `prop`, `crops`, `scatter`, `wild`, `forage`, `zombie`, `villager`, `write`) and `tools/mapgen/valley.py` the description; `python -I tools/mapgen/valley.py` writes `data/maps/valley.json` in the format `map.js` loads. Step 0's valley: a 256 bounds, the river from 29/01 with dirt banks, the stone bridge on the high street (laid stone until `floor_bridge_stone` is drawn), the ford as shallow water, the roads' skeleton (the high and west roads, the bridge road, the square, the nobles' street, the south lane, the lane, the drove), the home cottage of 29/07 with two rooms through a partition, its plot of crops at mixed stages, its well, a fence with two gates, the square's well, reserves for the village, the castle, and the farms, the forest everywhere else thicker than the proving ground's, a dozen of the dead on the roads, the four villagers. The game loads it by default; `?map=square` loads the proving ground.
- **Floors carry rules:** a floor definition's `walk` (`false`: water, no body enters, `map.isWalkableTile` and `circleBlocked` refuse it; a number: a speed factor, shallow water 0.5, read by the player, the dead, and villagers through `map.floorSpeedAt`) and `drink` (the well's two actions on any such tile beside you, in the menu and on `E`). `floor_water_shallow` is a dev flat (listed as `laid` in the ground kit) until drawn.
- **Walls carry rules:** a wall definition's `wall.seeThrough` (transmission 1 for the plain wall and a shut gate, and it bounds no room: a region closed by fences is outdoors, a cell behind bars is its corridor's room) and `wall.climb: false` (no opening in it is climbable: the arrow slit). `wall_fence` is a generated post-and-rail at 36 px until drawn.
- **The building format grew:** `wall` may be `{ n, s, e, w }`; `partitions` are runs of interior edges with openings by index; a `fence` feature (or a set's `fences`) walls a rect's perimeter with gates; an opening may name its own `wall` material.
- **The dev chest is a setting** (`devChest`, on by default for now, read at load) placed by the spawn, so no map file carries it; `combatTesting` was already one.
- **`check("water")`:** eight rows: water not walkable, a body stopping at the edge, a path going round, drinking and filling at the bank, shallow walked and at half speed, a fence passing sight and bounding no room, its gate a door.

### Step 1 as built (2026-10-12)

- **The village, from `29/04`'s plan through the generator:** the square (the well, the market cross, four stalls, the trough, the notice board, the stocks, three lamp posts), the green with its duck pond, benches, maypole, and woodpile; **the inn** (a taproom with the counter, five tables, two lit hearths, windows boarded from inside; a kitchen; a guest wing of three rooms; a yard with its well, a cart, a trough, a privy); **the chapel** (nave with six pews, the altar, lectern, and font, a vestry) inside the **graveyard's** wall with its lychgate, sixteen headstones, and **the crypt** (two coffins); **the priest's house**; **the manor** (hall, kitchen, solar and bedroom, in a walled garden with benches, beehives, a fish pond, a trough); **the merchant's house** (hall, counting room with desk and strongbox, bedroom; a walled yard with the storehouse and a cart); the trades: **the baker** (a lit oven), **the joiner** (workbench, sawpit, woodpiles, the wheelbarrow, the home behind), **the weaver** (loom, spinning wheel, three dye vats), **the smithy** (forge, anvil, quench barrel, grindstone, the open front, the home beside); **the toll house**; **eight cottages** in three plans (two-room, the long house with its byre behind a rail, the L-shape with a lean-to), one with its door kicked in, one shut with a neighbour inside; **the reeve's house** in stone and wood. 20 places, 25 buildings, 43 rooms, 295 props, 40 authored dead placed per `29/08` (the square, the streets, the toll gate's knot, the castle end, the graveyard's eight, the trades, the nobles, the cottages), 7 villagers with `29/08`'s lines.
- **Every piece without art is a labelled box:** 35 new definitions (`workbench`, `anvil`, `forge`, `oven`, `loom`, `dyevat`, `counter`, `shelf`, `cupboard`, `bookcase`, `desk`, `strongbox`, `stall`, `woodpile`, `cart`, `wheelbarrow`, `coffin`, `haystack`, `pew`, `altar`, `lectern`, `font`, `headstone`, `noticeboard`, `stocks`, `marketcross`, `maypole`, `bench`, `privy`, `trough`, `beehive`, `stump`, `sawpit`, `grindstone`, `spinningwheel`), each a coloured box with its name on its top and front faces (`placeholder.label`; the box generator draws it, the first tile of a multi-tile box alone). Containers open with the chest's loot for now; stations carry a `station` name for step 3; the forge and the oven are fires; the trough and the font are water.
- **The map format grew again:** an opening's `open`, `broken`, and `boards: { in, out }`; a prop's `lit` and `fuel` were already read.
- The boot: 1.7 s cold with the village (the ground's prebake 650 ms, the figures 460).

### Step 2 as built (2026-10-13), the first step under `31/08`'s habits

- **Tiredness** on the player (`tired`, 0 to 100, `data/tuning.json`: full to empty in 900 sim seconds, a day and a quarter; restored in 240 asleep), a fifth moodle (a crescent; "Rested" when fine) with its four stages: stamina regenerates at three quarters past "Tired", no sprint past "Exhausted", no health regeneration at "Falling asleep". Hunger and thirst retuned to the day (1080 and 720 sim seconds) and their last stages halve stamina regeneration. **Health regenerates** 1 a minute while fed and watered with nothing bleeding, 4 asleep. **Survival is on by default.**
- **Sleep** is a verb in the table (`verbs.define("sleep", …)` in `entities/player.js`): validated by the bed's id (`map.propById`), the bed's definition (`sleep: true` on the bed), the reach, indoors (`roomAt`), and not rested by day; performed as `startSleep`, which sets **the world's time scale** (`world.setTimeScale(60)`, `src/world.js`; since the rule for friends the scale comes from `game.timeScaleNow`, sixty only while every living player is asleep, and is re-evaluated each step, section 3.3) and emits `sleepStart`. The loop reads the scale to run more fixed steps per real second (up to 120 a frame; each still a sixtieth), never a dt multiplier or a clock jump. The sleeper is never woken; they get up when rested and it is morning (06:00 to 22:00), or if the bed is gone, through `wake`, which emits `sleepEnd` with the hours. The bed's menu entry and `E` call `verbs.run`; a refusal's reason is the message. No lying pose yet: the rig has none, so the sleeper stands by the bed until the art pass.
- **Fire is maintenance:** a fire's definition says what it burns (`fire.fuel`, an item id: logs for hearths, charcoal for the forge; `charcoal` is a new item) and `fire.hoursPerUnit` (hearth 3, campfire 2, oven 2, forge 2); `map.feedFire` is the one mutator (touches the tile, emits `fireFed`), `burnFires` emits `fireOut`, and the menu's Feed names the fuel and the hours left.
- **The habits, begun:** `src/world.js` (the time scale, the id counter), `src/verbs.js` (the table), `items.makeEntry` stamping every entry with a `uid` (the grid's `add` goes through it), every prop with an `id` and `map.propById`, `fireFed` / `fireOut` / `sleepStart` / `sleepEnd` / `timeScale` on the bus; `main.js` shows the messages from the events. `check("sleep")`, six rows (nine since the rule for friends: two players on one bed, one asleep, both, one waking).

### Step 3 as built (2026-10-13)

- **Durability is kills** (5.2): a weapon block's `kills` (`data/items.json`: stick 5, plank 5, torch 5, hatchet 20, spear 25, mace 40, sword 60, halberd 80; the bow `shots: 100`; every tool 5; the throwing knife and axe, the staff, and the book are art only, with no weapon block and no number yet), `items.hitsPerKill` (the standard zombie's health from `data/tuning.json` over the damage, rounded up) and `items.wearPerHit`; `combat.wearWeapon` after a landed swing (the hand that swung; a miss costs nothing), the bow's string in `archery.releaseDraw`; at one the entry leaves the hand (`inventory.detach`) and `weaponBroke` is emitted (`main.js`: "Your stick is spent."). The bar on the item in the bag and the slots once worn, red under a fifth left; the tooltip says the percent.
- **Tools are items** with `kind: "tool"`, a `verbs` list, and a weak weapon block: pickaxe, hoe, scythe, shovel, knife, hammer (the hatchet existed). Their verbs (till, mine, dig, cut, butcher) are step 4's and 6's rows; this step gives them bodies and recipes. **New materials and foods:** iron ore, iron bar, flour, grain, potato, cabbage, garlic, pumpkin (the crops' foods as items), roast potato, stew, porridge; charcoal from step 2. Tags on every item but the bags, the belts, and the four art-only items (`wood`, `fuel`, `cloth`, `food`, `raw`, `cooked`, `metal`, `tool`, `drink`, `herb`, `container`).
- **Stations** (6): `src/stations.js`. A prop is a station by its definition's `station` or, for a lit fire that `cooks`, "cooking" (so any hearth and campfire cooks; the pot of the table is not asked for yet). `data/recipes.json`, 27 rows: `station`, `out` (`{ id, count }`, or `{ prop, footprint }` for a thing placed beside the station), `in` (ids or tags with counts), `seconds` (sim seconds; a game hour is 30), `fire` (the station's fire must be lit, and the work pauses while it is out), `tool` (an item in a hand). **Ingredients are reached** from the hands, the belt, the player's bag, the station's own output, and every searched container within 2.6 tiles. **The queue** on the prop (`prop.queue`, with the maker's id) is stepped by `stations.update` in the world's time (so a night's sleep finishes the day's work), one job at a time; the result lands in `prop.output` (a 3 by 2 bag) or, if full, at the station's foot; a prop recipe is placed on the nearest free tile beside the station. `craftStarted` and `craftDone` on the bus; the log says "Made 5 arrows."
- **The craft verb** (`verbs.define("craft")`): the target is the station's id, the args the recipe's id and a count (1 to 10); validation is the station's kind, the reach, the fire, the tool, and the shortfall named ("Short of 1 stick, 1 any cloth.").
- **The panel** (`src/ui/station-panel.js`, `#station` on the kit, top centre): the recipes on the left in a dark well (greyed and the shortfall named when short), the chosen one's ingredients with have and need, a count, Make (which calls `verbs.run("craft")` and nothing else), the queue with its bar and "(the fire is out)". Opening a station opens its output beside the bag as a container of its own (`containerOpened`); the panel closes on X, Escape, or walking out of reach. The menu's entry is "Use the workbench" (any station by its name) or "Cook here" for a fire.
- **Interactions' actions** (5.3): a row in `data/interactions.json` may name an `action`, a verb in the table, run with the entry's uid and id in the target and the row's `args`; `verb` stays its label. The three rows that exist (a torch on a campfire, Light; arrows on a fire, Dip, with `action: dip` since #14; a waterskin on a well, Fill) print their messages; the rows that use tools arrive with the tools' verbs.
- **Not in this step:** the loom and the dye vats (their recipes wait on cloth and wool as items, step 7's dressing or the animals), the cooking pot as a requirement, the castle's stations. `check("craft")` nine rows, `check("wear")` four.

## 12. Engine asks, consolidated

From `29/10` with the cuts applied and this pass's needs added; sizes without times.

- Tier 1 (step 0): water impassable and shallow slow; see-through walls; unclimbable openings; partitions and per-side materials; fences as features; the generator. Small to medium each.
- Step 2: the tiredness need and the sleep fast-forward (a loop speed multiplier, built as the world's time scale; the `down` pose on a bed, not built, `32` item 7; the wake rule); health regeneration; water drinking; fire fuel data and the feed action with hours.
- Step 3: `interactions.json` and its resolver (the menu's verbs from the hands; the drag in the bag); the station panel on the kit; recipes with a queue and an output slot; durability fields and the bar; tools as items with verbs.
- Step 4: soil by hoe (`setFloor`), crop props with a planted hour and growth on the clock, dryness per soil tile, the bucket as a carried prop with fill and pour, the scythe's row harvest, stacks as containers that give.
- Step 5: the castle's wall heights verified through the cap redraw, the hit tests, and the arrow's scan; larger prop footprints (2 by 2, 3 by 1, 2 by 3; a general slice) or the two-piece fallback; wall-hung props beyond the bracket (banners, shelves, racks, signs); rugs as flat props; the hearth-radius cap for the hall; props with a prompt label.
- Step 6: mining (a rock gives and goes); the dead placed down and rising; containers on trees and stacks; authored decals.
- Step 8: an animal entity (a drawn sheet with facings, wander, flee, hit, loot); nests as containers that refill daily.
- Cut (`29/11`, taken): locked doors and keys, paired openings, carpet as an autotile, coin, the maze, the second smithy's fire, the willow's eyes.

## 13. Art, and the rule that nothing waits for it

`29/09` is the request list, unchanged in content, with these additions: the bucket (a carried prop, world picture only), the tools as trios (hoe, scythe, pickaxe, shovel, knife, hammer; the hatchet exists), the station output slot (none: UI), the chicken and the deer as eight-facing sheets with walk and idle (and the deer's flee), a nest, an egg, raw and smoked meat, leather and the jerkin, the cooked foods' icons. Every piece has a placeholder from boot: furniture and stations as the box generator with the definition's footprint and a label; items as coloured blocks; crops as the five that exist; animals as the villagers' sheet recoloured until drawn (a chicken as a small box that walks is fine for a week). The art lands through `27`'s checklist in `09`'s tiers, and the build order above follows the tiers, so the village is drawn before the castle is needed.

## 14. Verify, per step

Each step's acceptance is a check under `tools/checks/` where the sim can prove it and a screenshot where only eyes can: step 0, the dead cannot cross the river and do cross the ford (`check("water")`); step 2, a night slept passes eight hours with the fire burned down the right number of logs (`check("sleep")`); step 3, a recipe made from a chest's ingredients with the station's fire lit and paused when it dies (`check("craft")`), a stick evaporating on its sixth kill (`check("wear")`); step 4, a potato planted and harvested with seeds back over its days, dry and watered (`check("farm")`); the determinism hash before and after every step. From step 4 on, each step's new verbs are also done by a guest in two tabs with `check("sync")` passing and the frame's added bytes read from `net.status().wire` (`31/08`, rule 6).

## 15. Open

- Names: the village, the river, the castle, the farms, the mere, the villagers (`29/11` Q4). Placeholders until Michael names them.
- Which new crops first [turnip, wheat, beans, hops].
- The rates and the regeneration numbers are defaults to feel out in play.
