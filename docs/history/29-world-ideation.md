# 29 — The 1.0 map's ideation: the text the sweep took out of `docs/29-world/`

The cut text of `docs/29-world/` (the ideation pass of 2026-10-12, twelve pages), moved here whole by the sweep on 2026-10-16, a section per source page in the folder's order: the README's three status layers, its rulings paragraph, its restated rules, and the file-table rows of the pages that went; `01`'s size argument; `02`'s two duplicated lists; what `03` said of the things Michael cut on 2026-10-12 and its engine summary; `08`'s rule of three, its fishing option, and its counts; `09`'s cut asks; and `07`, `10`, and `11` whole (the home folded into `04` as "Your cottage"; the engine asks' open items into `30` section 12 and their verification notes into its step 5; the open questions into `30` section 15). Where a live page's sentence was rewritten in place, its old wording is here under "Lines rewritten in place". The live pages are `docs/29-world/` and `docs/30-the-big-pass-spec.md`; the rulings are `docs/02-decisions.md`, 2026-10-12 and 13. Never edited again.

# From `README.md`

## The status blocks, as they stood (2026-10-12 and 13; one block replaces them)

**Status: an ideation pass, written 2026-10-12 at Michael's ask, after a read of every doc in `docs/` and `docs/art/`, the map file, and the art folders. Nothing here is ruled, nothing is built, and no code was touched. It is deliberately more than the game needs: the brief was "give me more things to choose from than I need, so I will more likely have to cut than add". `11-cut-list-and-questions.md` says what to cut first and what only Michael can answer.**

**Status, 2026-10-13: steps 0 and 1 of `30` built the bones and the village from these pages** through the generator (`tools/mapgen/valley.py` writes `data/maps/valley.json`, the map the game loads by default): the 256 bounds, the river, the stone bridge, the ford, the roads' skeleton, your cottage (`07`, option A), and the village of `04` with its dead and its living; the farms and the mill, the castle, the forest places, and the dressing are `30`'s steps 4 to 7 and are not built. Where the built valley departs from these pages: the coordinates follow `04`'s room plans where `01`'s overview disagrees (the high street and the bridge at row 158, not 126); the banks are dirt (no shingle or mud yet); the ford is `floor_water_shallow`, seven tiles by three; every low wall, fence, and hedge is `wall_fence` until drawn; no art of `09` has arrived, so the new furniture and stations are labelled boxes; the graveyard's eight stand rather than rise; the people have role names until Michael names them. The questions answered so far are marked in `11`. Multiplayer is live (`31/08`): a place is data in the map and the save, so it needs nothing for a guest, but any new behaviour a place brings (the rising, a stack that gives, a mill wheel that turns) is built for a guest in the same commit.

## Ruled on 2026-10-12, after this was written (these override the pages below)

Michael read the folder as brainstorming, not gospel, and ruled with `30-the-big-pass-spec.md` (the what, laid over this where): **water stops everyone**: a tile wholly water is unwalkable by any entity, the bank's blend is ground, the ford and the weir a shallow kind slow for all (Q1 yes, sharpened); **256 by 256** (Q2); **the end cottage** is the home (Q3); **the cut list taken as written** (the maze, the second smithy's fire, the tannery for now, coin and the treasury, locked doors and keys, the paired gate, carpet as an autotile, the willow's eyes); **fishing later**, the waters placed as if yes; **two animals**, chickens and deer, as the last step of the pass, which brings leather and the tannery back then; **the dev chest and combat testing as a setting** on the real map; **a generator script** writes the map from a description per place; **sleep** only in a bed indoors, a fast-forward of the simulation; **drinking and filling at any water**; the knife's skinning waits for the animals. The build order is `30`, section 11; the engine asks consolidated are `30`, section 12; the art asks stay `09` with `30`'s additions.

## Rules this plan keeps (so nothing here fights the docs)

- One continuous map, single storey, no roofs (`00`, `03`, `05`). Every "tower" here is a one-storey room with taller walls; every "crypt" and "cellar" is a ground-floor annex. Nothing needs an upper floor, and nothing forecloses one.
- Walls are state on tile edges, rooms are found by flood fill (`03`): every building below is a set of wall edges and floors, so the in-game editor and the floor stamp (`15`, pinned) can author it, and the player can build onto it.
- Authored structure, scattered filler (`00`): roads, buildings, water, and the named places are placed by hand; trees, mushrooms, rocks, leaves, carts, and bodies are scattered by rule.
- Gatherables wobble and are outlined (`CLAUDE.md`); every new gatherable here is asked for in that style.
- Cobble always in a dirt verge, never on grass (`15`); cobble for the castle, the bridge road, the square, and the nobles' street; dirt everywhere else; paths one tile wide.
- Harvest first, gloom later, by zone (`06`): no blue or purple tree stands inside the bounds. The gloom is a direction, not a place, in 1.0.
- Light is one function and the hearth lights its whole room (`07`): the great hall is the first room big enough to want the cap `05` mentions.
- A building earns its place (`01`, the sibling's rule): for every building below, the cost of going there, how you pay it, and what you can only get there.
- Villagers carry no weapons and never fight for you (`04`); this plan places them and gives them homes and jobs for the routines milestone, and places none where the engine cannot hold them today.

## The file table's rows for the three pages that went

| File | What it holds |
|---|---|
| [07-the-start.md](07-the-start.md) | Where the player lives and wakes up; three options for the home; the first ten minutes the map should offer. |
| [10-engine-asks.md](10-engine-asks.md) | The code changes the plan needs, for the other agent, ranked; with what works today with no change. |
| [11-cut-list-and-questions.md](11-cut-list-and-questions.md) | What to cut first, what is cheap and what is dear, and the questions only Michael can answer. |

# From `01-geography.md`

## Size

**Proposed: authored bounds 256 by 256 tiles, 16 by 16 chunks, 65,536 tiles.** The cut is 192 by 192 (12 chunks). The reasons for the bigger one:

- The forest has to be a place, not a frame. With the village, the castle, and the two farms taking a 120 by 150 block in the middle, a 256 map leaves a belt of 40 to 60 tiles of forest on every side, which is one to two screens at the wide zoom: enough to get lost in, lose the dead in (`02`, 2026-10-09: "forests should be a place you can lose them"), and hide the small places in.
- Walking is cheap. The player walks 3 tiles a second and sprints at 5.25 (`data/tuning.json`); the village square to the castle gate is about 55 tiles, eighteen seconds; the square to Hollow Farm's yard about 70 tiles; corner to corner of the whole map about 85 seconds at a walk. Stardew's farm alone is 80 by 65.
- The engine already pays for it. Chunks grow on demand and evict beyond eight (`23`, step 2); the ground bakes per chunk; the dead beyond 40 tiles stand still; 256 by 256 of authored tiles is 16 chunk files of run-length rows, a few hundred kilobytes. What grows with size is the authoring, not the frame.
- Beyond the bounds the wild goes on forever as now, so the map's edges are soft: the forest simply continues, and the old road east leaves the bounds and keeps going as a wild road until a later zone catches it.

If 256 feels too far between places in play, the plan shrinks by pulling the forest belts in; the places and their neighbours do not change.

## Lines rewritten in place (the old wording)

The regions table's river row, the first bullet of "Why the places sit where they sit", and the fourth, which cited the engine asks and `22` where the ruling (`30`, law 8) and `30` now stand:

| **The river** | top to bottom, slightly east of centre | the water, the weir, the bridge, the ford, the banks | the dead cannot cross except where you can (`10-engine-asks`) |

- **The river splits the map into a safe-ish west and a dangerous east.** The village, both farms, the mill, and the witch are west of the water; the castle, the croft, the woodcutters, and the mine are east. If water stops the dead (`10-engine-asks`, the first ask), every crossing becomes a gate you can hold: the stone bridge at the village, the footbridge over the brook, the ford on the drove, the weir's crest at the mill. The dead east of the river stay east until they find a crossing, and the castle's garrison is a reservoir you drain on purpose, not a flood that comes to you.

- **The small forest places ring the whole**, each a screen or two past the last field, so going out is always a decision (`00`, pillar: "going out is a decision") and each trip has one destination. The quarry, the mine, the charcoal burners, and the woodcutters are the raw materials of the big pass (`22`: stone, iron, charcoal, logs); the witch, the hunter, and the hermitage are the odd ones; the stones, the barrow, and the old road are the hooks.

# From `02-water-and-roads.md`

## Lines rewritten in place (the old wording)

Item 2 of "What it does for the game" (now a pointer to `30`, law 8, built) and the paragraph of "The art water needs" (now a pointer to `09`, request 3.1):

2. **A barrier.** Water impassable to walkers (the player, the dead, villagers) except at crossings. This is the ask that makes the river a design element and not a texture; without it the bridge is decoration and the castle's moat is a paddling pool. `10-engine-asks`, item 1.

In `09-art-asks`: shingle and mud world textures (128 by 64, seamless), `water_shallow` (the ford: pale, broken, stones showing), `water_dark` (the mere), a weir lip, the two bridge floors, the parapet wall set, reeds and lilies as decals, a stranded log, a rowing boat pulled up on the bank (a prop, a container), the mill wheel (a tall animated prop against the mill's wall).

# From `03-the-castle.md`

## What the page said of the things cut on 2026-10-12 (the old wording of the lines rewritten)

The cuts (`02`, 2026-10-12, "The cut list taken as written"; `30`, section 12): the maze, the second smithy's fire, coin and the treasury, locked doors and keys, the paired gate, carpet as an autotile. In the page's order: item 3 of the seven things (the paired gate), item 6 (the maze's hedges in the bailey's floor), the note under the plan (the maze's outline), the solar (carpet as a floor kind), the pleasure garden and the maze (its heading and its paragraph), the barracks and the armoury (the barred and locked door, the steward's key), the castle smithy (the second forge), the dungeon (the jailer's key), the treasury:

3. **The gate as the door variant.** The castle wall's `door_shut` is a portcullis down, `door_open` the passage with the portcullis drawn up into the arch, and the gate's leaf opens upward, so there is no swung leaf sprite at all (the leaf is in the wall picture, a nice simplification). The passage is two tiles wide: two door edges side by side, opened as a pair (`10-engine-asks`, a `pair` on openings; without it two separate gates, which also works and is odder in a good way).

6. **The bailey's floor tells the story.** Cobble over most of it, worn to dirt at the stables and the smithy, the kitchen garden's dark soil, the pleasure garden's lawn, the maze's hedges. Authored decals: straw by the stables, soot by the forge, a cart's ruts from the gate to the kitchens.

The west gate (left, rows 27 and 28) faces the bridge; the postern (right, row 24) faces the forest road. The maze is drawn as its outline only; its inner hedges are a design of their own, below.

Carpet over stone (`floor_carpet`, a floor kind with edged frames, `10-engine-asks`), a **tapestry** on each wall (edge props), a writing desk with a **ledger** (a book item: the steward's accounts, the first text in the world for the story later), a chess board, a lute, a cushioned chair. The bedchamber: a four-poster bed (a 2 by 2 prop, the first four-tile footprint, `10-engine-asks`), a chest with the lady's dresses (the dye system: dyed garments as loot, the dress from `25`), a mirror, candles. **Earns its place:** the comfort set: the good bed, clothes and dyes you cannot get elsewhere, the ledger.

### The pleasure garden and the maze

A lawn with a fountain (a 2 by 2 prop with a water texture inside, not a fire but it could flicker), a bench, a statue of the old lord. South of it the **hedge maze**, 14 by 14 outside, hedges as a wall material (`wall_hedge`: opaque, 64 px tall, no openings, a gap is a missing edge; the dead and the player path through it like any walls). At the centre a sundial and a bench. **Why:** it is the one place on the map where line of sight is the whole game in miniature: you cannot see round a hedge, the dead cannot see you, and a maze with a zombie in it is a scene. Also it is pretty from above, which no roof will ever hide. **Earns its place:** nothing but the scene; it is the first thing on the cut list if the garden is too much.

The barracks: eight beds in two rows, chests at their feet (clothes, bandages, dice), a table, a brazier. The **armoury** through a barred door (`wall_bars` as a see-through wall material, and a locked door opened by a key: `10-engine-asks`): six **weapon racks** (containers with fixed loot: swords, maces, halberds, spears, bows, arrows, shields; the `fixed` loot kind the dev chest uses), a grindstone, a barrel of pitch. The dead here are soldiers. **Earns its place:** the weapon supply of 1.0 until the smith's loop exists, gated behind the densest dead and a key held by the dead steward in the hall.

The **stables** against the east wall: eight stalls (stall partitions as a low wall material, `wall_fence_low`, sight passes), straw, a hay rack, saddles on pegs, no horses (the horses are gone, which is scarier than horses). **The kennels** beside: three pens of fence, empty bowls. **The castle smithy** by the gatehouse: an enclosed room (a bed, a chest) and an **open forge** under posts: the forge fire (`forge`, a fire kind that burns charcoal and heats, never cooks), the anvil (the smith station of `22`), a quench barrel, a grindstone, a coal store. Two smithies on the map (this one and the village's) is one too many for the cut list; keep whichever Michael wants the smith's loop to live in first. **Earns its place:** the station, charcoal, iron scrap from the armoury's broken gear.

- **South-west, the dungeon**: three cells behind `wall_bars` with their doors open, chains on the walls, a rat? (no animals), a prisoner's bones. One cell holds the dead jailer with the armoury key.

- **South-east, the treasury**: a barred door, four chests (coin: a currency item for the vendors of someday; silver cups; a crown, which is a hat), a strongbox. The steward's key opens it too. **Earns its place:** coin has no use in 1.0 and is still worth finding; it is the first thing trade will need.

## The engine summary (now a pointer to `30`, section 12)

## What the castle asks of the engine (summary; the full list is `10`)

The taller wall materials (data only, a check that the cap redraw and the hit tests follow `height`); `climb: false` on arrow slits; a `pair` for the two-leaf gate (optional); a see-through wall material (bars, fences); locked doors and keys; carpet as an edged floor kind (or rugs as flat props); 2 by 2 and 2 by 3 prop footprints; wall-hung props beyond the torch bracket (banners, tapestries, shelves, antlers); a hearth-radius cap for the hall; fixed loot per container instance (exists: the `fixed` table kind); the `brazier`, `oven`, `forge`, and `candle` fire kinds (data, `07`'s table).

# From `04-the-village.md`

## Lines rewritten in place (the old wording)

The plan's legend line, which named `07` for the player's cottage (now folded into the page as "Your cottage"):

One character is two by two tiles; the top-left is world (56, 84). `=` cobble, `-` dirt, `~` the river, `+` the bridge, `W` the well, `,` the green, `o` the duck pond, `g` the graveyard, `C` the chapel, `p` the priest's house, `M` the manor, `N` the merchant's house, `I` the inn, `S` the smithy, `J` the joiner, `V` the weaver, `K` the baker, `t` the toll house, `c` cottages, `P` the player's cottage (option A in `07`). The mill is north of this plan, on the river at (108, 54).

# From `06-the-forest.md`

## Lines rewritten in place (the old wording)

The quarry, whose wheelbarrow line called it immovable (it is carried like a barrel since 2026-10-15, `data/sprites/wheelbarrow.json`):

A **cliff face** on three sides (a new wall material, `wall_cliff`: a rock face, 128 px tall, opaque, no openings, built as edges like any wall, so the quarry is a room with no roof and one way in), a floor of bare rock and rubble (a new earth kind, `rubble`, or `ground_rock`), **cut stone** stacked in blocks (containers: the stone item of `13`'s pinned stone wall), **mineable rocks** in quantity (the four drawn rocks; mining is `02` question 27's open half: the pickaxe hits a rock, the rock gives stone and goes, or stays), a crane (a tall prop: a post with a jib and a rope), a quarryman's hut (one room: a pickaxe, a hammer, wedges, a bed), a flooded pit (a 4 by 4 water in the rock), a wheelbarrow (the immovable crate of `22`, here it is movable in spirit only). **Earns its place:** stone, the material stone walls wait for; the only cliffs on the map.

# From `07-the-start.md` (the whole page; folded into `04` as "Your cottage")

# 29.07 — The start, and where you live

**Status, 2026-10-13: option A is ruled and built** (`30`, step 0): the end cottage at (98, 212), a living room and a bedroom through a partition, a hearth, a table and two chairs, a bed, two chests and a shelf, a plot of potatoes and cabbages at mixed stages, its own well, a barrel and a woodpile, a fence with two gates; the spawn in the bedroom at (104, 216). Not built from below: the pumpkin by the door, the herb bed, the privy, the lean-to, and the chest's fixed contents (the chests open with the chest's loot). The developer chest is a setting placed by the spawn (`devChest`, on while in development). The next survivor arrives beside the spawn for now (`31/09`'s New character), not at B, C, or the inn.

`00`'s pillar: the home matters; you furnish it, light it, barricade it, sleep in it, and grow food beside it. `02` (2026-10-08): death turns you and the next survivor arrives elsewhere with a basic kit. So the home is a place on the map, chosen before the story exists, and the start is a situation the map sets up without a line of dialogue.

## Three homes to choose from

### A. The end cottage on the south lane (recommended)

The last cottage before the lane leaves the village for Hollow Farm, on the plan's `P` block: a two-room cottage (a living room with a hearth, a table, two chairs, a chest; a bedroom with a bed and a chest), a **garden** bigger than its neighbours' (a 6 by 6 plot already planted: potatoes and cabbages at mixed stages, a pumpkin by the door, a herb bed), a **woodshed** with a few logs, a **well of its own** (the only cottage with one; the reason it is yours), a fence with a gate on the lane, a privy, a lean-to that is empty (the first thing to put a workbench in), and the green at the end of the lane. The spawn is the bedroom, 08:00 on day one (`07`'s clock).

**Why it is the best start:** it is Stardew's start (a small house, a plot, a village a minute away) and Zomboid's (a door to board, a window to shutter, the dead a street away). From the door you see the green, the square's well beyond it, and the inn's boarded windows; from the garden you see Hollow Farm's barn roof-line over the hedge (no roofs; its long wall). The first ten minutes write themselves: harvest the potatoes, fetch water, split a log, shut the shutters, and then look up the lane. It is also the right distance from everything: thirty tiles to the square, forty to the farm, sixty to the bridge.

### B. The toll house by the bridge

One room and a barrier across the road, a lantern, a strongbox, and the whole castle in view across the water. The dead come over the bridge to your door; the river is on one side and the village on the other. **Why it is good:** the most Zomboid start, with the biggest view. **Why not first:** no garden, one room, and the bridge's knot of the dead is the first fight before the first harvest, which inverts the arc Michael wants (cosy first).

### C. The croft across the ford

The shepherd's holding (`05`): two rooms, a fold, a plot, a spring, water on three sides. **Why it is good:** the safest base, and the one a player who knows the map will move to; arriving there after the inn burns (metaphorically) is a story. **Why not first:** it is the reward of understanding the river, not the first thing; and the shepherd lives there.

**Recommended:** A as the start, with B and C as the two places a player discovers they could move to, which is how the home becomes a decision rather than a given. The next survivor (`02`'s death rule) arrives at B or C, or at the inn, so death moves the player across the map.

## The first ten minutes the map should offer (no quests, no text)

1. **Wake in the bedroom.** The shutters are shut (they start shut). Open one: the garden, the lane, morning.
2. **The garden is ready.** Potatoes at stage 2 in the near rows, a pumpkin by the door, the well, the woodshed with three logs. Harvest, drink, split. The farming loop before anything bites.
3. **The lane shows the first of the dead**, alone, far off, walking the wrong way. The gatherables law makes the hedge wobble as it brushes through (`02`, 2026-10-12). A decision: shut the gate, or go and look.
4. **The green and the square**: the well, the stalls with their dead traders, the inn's boarded windows with light behind them at dusk, the notice board with nothing on it. The first "the village is not empty" (`00`, pillar 8) is a face at the inn's shutter.
5. **The bridge**, if they walk east: the knot of six against the toll gate, the castle's towers over the water. Turn back, or not.
6. **Dusk**: the inn lights; the castle does not; the pumpkins on the fence posts do. The dead on the green turn toward the inn.

Nothing above needs a system that does not exist except the villagers behind the inn's boards (today they wander on a tether in their room, which inside a boarded inn is exactly right).

## The kit, and the chest at home

The starter kit stays what `11` set (a sack, a rope belt, the torch, a waterskin, bread, apples, a plank); the home's chest holds the hatchet, three planks, a bandage, and seeds of the garden's two crops, so the first evening's boards and the second day's planting are possible without a trip. The **developer chest** moves out of the real map into a testing map (or stays as an option on the settings screen); the purple box on the green is the one thing the current square has that the real map must not.

## The neighbours

The lane's other cottages (`04`): one with its door broken in and nothing alive, one with the shutters shut and a villager inside who will not open (the first "stay"), and the reeve's house at the green's corner with the old reeve alive, who has the lychgate key. Three doors, three answers: that is the whole of `04`'s NPC design in a street, before any of it is built.

# From `08-the-loop.md`

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

## Lines rewritten in place (the old wording)

The opening paragraph, the books row of the resource table, and the sentence under it, which cited `22` where `30` now stands:

The brief: the 1.0 map must be fairly dense with stuff to do, because quests, story, and distant travel come after it. Density here means three things on every screen: **something to gather, something to open, and something to look at**; and across the map, **every resource the big pass (`22`) and the combat docs name has a place it comes from**, so the loop closes without a vendor.

| books | the ledger (the solar), the book of hours (the castle chapel), the hermit's prayers, the witch's receipts (a recipe book, if recipes are learned: `22` Q2) |

The table is the map's proof that `22`'s loop closes: every station has a home, every material has a source, and the good things are behind the dead.

# From `09-art-asks.md`

## The cut asks (the old wording of the lines rewritten)

Request 1.1's bars (the armoury's door is shut and boarded, no bars: `30`, step 5), request 2.2's carpet autotile and the item that followed it (renumbered), and tier 4's items and willow lines (coin, the crown, and the silver cup went with the treasury; the willow's eyes were cut; `02`, 2026-10-12):

5. wall_bars: iron bars in a stone sill and lintel, 80 px tall, 8 thick: prison cells, the armoury, the crypt. Sight passes. Variants: plain, door_shut (a barred door with a lock plate), door_open (the barred door as a swung leaf). Plus post_bars (a stone pier).

13. Carpet floor tiles: 64x32 diamonds of carpet over stone, drawn so that a carpeted area has a border: please draw a set of 16 tiles for the 16 combinations of which of the four neighbours are also carpet (the autotile blob), in two colourways (crimson with gold, blue with cream). No outline.

14. Floor tiles for the chapel and the manor: floor_tile, four variants of glazed red-and-cream chequer at 16 px squares in world space, hard diamonds like the stone floor.

- **Items for the loop's new things** (each a trio): charcoal, iron ore, an iron bar, a stone block, cloth, wool, flax, leather, a key, a coin, an egg, a fish, honey, a ham, a wheel of cheese (the cheese exists), a bottle of wine, a mug of ale, flour, grain, a seed packet per crop, a dried herb per herb, a bandage (owed already), a candle, a lantern, a fishing rod (above), a book (three covers), a bell, a crown, a silver cup.

- **The willow**: import the four drawn colours and the eyes variant from the shelf (`docs/art/02`); the green one for the village pond, the eyes one for the mere; it needs a definition and a shadow width wider than the oaks'.

## Lines rewritten in place (the old wording)

The last paragraph, which named `11` for the order to build in (now `30`, section 11):

The wood, stone, and log walls with every variant and the boards; the floors; the well with its bucket; the bed, table, chairs, and fireplace; five crops in three stages and two directions; both soils; the water; the four rocks; the mushrooms; all the decals; thirty-six trees; the two pumpkins and the two jack-o'-lanterns; the four magic items. The village's cottages, the chapel's walls, the farms' fields, and the whole forest can be laid out today with these, which is why `11` says the village is the place to start.

# From `10-engine-asks.md` (the whole page; its open items are `30`, section 12, and its verification notes `30`, step 5)

# 29.10 — Engine asks, for the other agent

**Status, 2026-10-13:** tier 1 (items 1 to 5) is built (`30`, step 0: `walk` and `drink` on a floor definition, `seeThrough` and `climb` on a wall's, `partitions`, `wall` per side, `fence` features; a see-through wall bounds no room), as are item 17 (drinking and filling at any water, step 0), item 11's fuel per fire (`fire.fuel` and `fire.hoursPerUnit` on the definition, step 2; the hearth's cap for the hall is not), the openings authored `open`, `broken`, or boarded (step 1), and the generator (`tools/mapgen/`). Item 18 is `30` itself, its stations and recipes built (step 3). Cut (`02`, 2026-10-12): items 9 and 10, and 8 (a) the carpet autotile. A box's name is drawn on it (`placeholder.label`), but item 12's prompt on a prop is not built. The rest waits for `30`'s steps 4 to 8 (its section 12 lists them by step), each built for a guest in the same commit (`31/08`). The vocabulary below is the map format before step 0.

What the plan needs from the code, ranked by how much of the map depends on it, with what it is for, a guess at its size (small, medium, large; no times, `no-time-estimates`), and where it touches by the modules' documented names (`CLAUDE.md`'s code map; this plan was written from the docs, not the code, so the touch points are the docs' and the other agent will know better). First, what needs nothing.

## Works today with no change

- **The size.** Bounds of 256 by 256 are a number in the map file; chunks grow on demand and evict beyond eight (`23`, step 2); the ground bakes per chunk. The spawn's ring prebakes at boot.
- **The authoring vocabulary.** Sets with padding, features for roads (rects, any surface sprite), `floorRects`, buildings with a wall material, a floor, `openings` per side, `props` with footprints and facings, `brackets`, `reserve` rects, scatter rects with a biome and weights, the forage rule, placed rocks, the wild rule, a `zombies` list of tiles, villagers with a home and a line (`03`, `19`, `square.json`). Every building in this plan is expressible as today's `buildings` entries if interior partitions are built as separate adjoining buildings sharing an edge (two rects that touch share a wall edge, which is how walls on edges work), with the floor stamp or a script doing the tedium.
- **Walls per material with their own `height` and `thickness`** (`02`, 2026-10-11): a 112 px castle wall is a definition and a drawing. To verify, not to build: the cap redraw, the opening hit test (`WALL_FACE` from the sheet's height, `17`), the light's climb (`night.climb` is one number for all walls; a per-sheet climb would be a small follow-up), and the arrow's `scanPath` (walls stop below 80: should read the sheet's height).
- **A doorless arch** is a door edge authored `broken` (`09`: a broken leaf is an opening for good).
- **Boards from inside** on the inn's windows: the stack already has both sides.
- **Fixed loot per container**: the dev chest's `fixed` table kind (`21`); the armoury's racks are that.
- **Corpses placed**: a zombie can be created `down`; the fallen leave the thinking list (`23`).
- **One-tile animated props** (the lantern's flame, a brazier): the jack-o'-lantern path.
- **The hearth lighting its room**: every room in the plan but the great hall is fine as is.
- **Lit windows lure the dead at night**: portals (`08`) already do it, which is why the inn's lit windows matter.

## Tier 1: what the river and the first buildings need

1. **Water that stops walkers.** `floor_water` tiles impassable to the player, the dead, and villagers (`map.moveCircle`'s passable test and `pathfind`'s callback), with a **`water_shallow`** kind that is passable at a speed multiplier (the ford, the weir's crest), and laid floors over water (a bridge) passable as any laid floor. The dead then cross only where you can, the castle's moat is a moat, and the croft is the safest place on the map. The sibling's ruling that water is "only a look" (`02`, 2026-10-11) was for a two-tile trial pond; this is the ask to overrule it. **Small to medium.** The one ask that changes the map's design; without it the river is a texture and `02-water-and-roads`' crossings are decoration.
2. **See-through wall materials, and openings that cannot be climbed.** A wall sheet flag (`seeThrough: true`) that gives a plain wall transmission 1 (sight and light pass, bodies do not): fences, low stone walls, parapets, bars, the ruin stubs. Today a plain wall is 0 and only an open shutter is 1 (`08`'s transmission). And `climb: false` on an opening kind or a sheet (arrow slits, barred windows), so a window passes sight and nothing comes through it. **Small**, in `map.js`'s transmission and the climb check. Fields, gardens, graveyards, the castle's slits, and the cells all depend on it.
3. **Interior partitions in the building format.** Today a building is one rect with openings on its four sides; a multi-room house is several rects sharing edges, which works but is verbose and cannot put a door in a shared wall from one entry. A `walls` list on a building (`[x0, y0, x1, y1, side]` runs with openings) or a `rooms` list of rects whose shared edges get one wall, is what makes `04`'s inn with seven rooms a readable file. **Small to medium** in `map.js`'s authoring. Alternative: the floor stamp and an editor (`15`, pinned; `02` question 14), which this plan needs anyway (below).
4. **A per-material wall per side of a building** (stone at the back, wood at the front, with the material-change posts the renderer already draws): `wall` as a map by side. **Small.**
5. **Fences as features.** A fence along a field's edge is a run of wall edges; authoring it as a `fence` feature (a rect's perimeter in a material, with gates at offsets) rather than a building with no floor keeps fields from becoming rooms (a fenced field would flood-fill as a room; with `seeThrough` walls the light rule should treat it as outdoors: a room whose walls are all see-through is not a room). **Small**, the rooms' flood fill ignoring see-through edges.

## Tier 2: what the castle and the interiors need

6. **Larger prop footprints.** 2 by 2 (the loom, the four-poster, the fountain, the haystack, the tent, the cage, the charcoal clamp), 2 by 3 (the cart), 3 by 1 (the bar counter, the grand hearth), 3 by 3 (the granary). The loader slices only two-tile pieces today (`17`: "four-tile footprints are not needed and not built"), by a vertical screen line at the second tile's centre. A general slice is the same idea per tile boundary along both axes, with the depth sort per slice. **Medium**, in `assets.js`'s slicing and `render/props.js`. The fallback that needs nothing: draw big things as two 2 by 1 pieces placed side by side (a bar counter as a 2 by 1 and a 1 by 1), which the art can be cut to.
7. **Wall-hung props beyond the torch bracket.** Banners, tapestries, signs on brackets, shelves, weapon racks, antlers, chains, saddles, mangers, ladders, the dragon skull: an edge-state prop (`wallProps` on an edge, like `torch: side`) with a sprite per orientation, drawn on the near face after the wall at a height, no light of their own, some of them containers (a shelf, a rack). **Medium**, a generalisation of `brackets` in `map.js` and `render/walls.js`. The castle and the trades are mostly this.
8. **Carpet and rugs.** Either (a) a floor kind whose frame is chosen by its four neighbours (a 16-frame blob) instead of by hash, in `ground.js`'s laid-floor pass (**medium**, the ground already knows its neighbours for the blends), or (b) flat props drawn in the ground pass under everything (**medium**, a new drawable class that bakes into the chunk). (a) is the better carpet (a bordered area of any shape), (b) the better rug (a thing you can carry). Both wanted; (a) first.
9. **Locked doors and keys.** `locked: "<key id>"` on a door's wall; the open action is refused without that item in the bag or on the belt; a key is an item; the dead carry keys in their pockets by wardrobe. **Small**, in `interact.js`'s opening actions and `items.json`. The armoury, the treasury, the crypt, the storehouse.
10. **Paired openings.** Two adjacent door edges that open and close together (the castle gate, barn doors, the great door): a `pair` id on both; one action toggles both; the dead breach the pair as one stack with doubled health. **Small to medium**, optional: two independent leaves also work and are a little odd.
11. **Fire kinds by data.** `07`'s table already says a fire is data; the plan adds brazier (burns charcoal), oven (burns wood, cooks bread specifically when cooking exists), forge (burns charcoal, heats, never cooks), candle (burns nothing, tiny), lantern post (the torch post with a lantern picture), charcoal clamp (burns slowly, smoke), smoking rack. One addition: **a `fuel` item per fire** (logs for a hearth, charcoal for a brazier) where today every burner takes a log. **Small**, in `map.js`'s fire data and the feed action. And **a cap on the hearth's room light by room size** for the great hall (`05`, "A great hall"): **one line** in `light.js`'s ambient rule.
12. **Props with a prompt label and a prompt-only action.** A signpost, a waystone, the notice board, the barrow's door: `label` and `prompt` on a prop instance, shown by `E` or the menu, doing nothing. **Small**, in `interact.js`.
13. **Authored decals.** A `decals` list on a set or a feature (`[file, x, y, flip]`), drawn by the ground bake with the rule decals (`15`, layer 5). Ruts, straw, soot, rushes, the scorched circle, mist at the mere, windfalls. **Small**, in `ground.js`. And **decal rules per rect** (flowers in a clearing: `"where": "any"` over a rect) are data today if a scatter-like rect can carry a decal override; if not, small.
14. **Tall animated props against a wall** (the mill wheel, 1 by 2 standing): the one-tile animation path extended to a sliced prop. Falls out of item 6.

## Tier 3: what the forest places and the loop need

15. **The dead placed with a pose and a facing**, and **rising when approached**: a `zombies` list per set with `[x, y, { wardrobe, down: true, face: [x, y] }]`, and a `down` zombie that stands when the player is within some tiles (a timer the idle state already has). **Small**, in `map.js`'s loading and `zombie.js`'s idle. The graveyard's rising, the barrow's watchers, the feast's guests at their benches.
16. **Containers on trees and in stacks**: a `container` on a tree definition (the hollow giant) and on a stack prop that also gives its material by `E` (a log stack gives logs). **Small**, the chest's path on a different sprite.
17. **Drinking from water tiles** beside the player (the well's actions on any water-adjacent tile). **Small.**
18. **The big pass** (`22`): stations as props with panels, recipes, tools with verbs on gatherables (an axe on a stump, a pickaxe on a rock, a hoe on grass), seeds and growth, mining. **Large**, and already planned; the map gives every one of them a home and a source, which is this plan's whole contribution to it.
19. **Fishing** (`08`, an option): an action on a water-adjacent tile with a rod in hand, a table per water feature, two items. **Small to medium**, after the big pass's item verbs exist.
20. **NPC routines, follow, stay, lines** (`04`): **large**, planned; the plan places fourteen villagers with a home, a job, and a line each so the pass has its cast.
21. **Records beyond the active region** (`03`): alarm, lure, trickle. **Large**, its own milestone; the plan's dead are authored where they stand and the wild's per-chunk rule covers the rest, so nothing here waits for it; the mine mouth's "something comes out at night" and the castle's lure across the water are what it will make true.

## Authoring tooling, which this plan cannot do without

A 256 by 256 map with 46 buildings, 110 rooms, 260 containers, and 900 tiles of road is not written by hand in JSON. Three ways, best first:

- **A generator script** (Python, like `tools/manifest.py`; run with `python -I`): a compact description per place (rooms as rects with a material, a floor, and openings; fences as perimeters; roads as polylines with a width; props by name at offsets; decals) that writes `data/maps/<name>.json` in today's format. This plan's room plans (`03` to `06`) are already nearly that description. The script is a tool, not game code, and each place is a function, so the map grows place by place and each is playable on its own. **Medium**, and it is what makes the plan buildable.
- **The floor stamp and the editor** (`15` pinned, `02` question 14): in-game placement of floors, walls, and props written back to the map file. **Medium to large**; the right tool for Michael's own touches (a garden, a room's furniture) once the generator has laid the bones.
- **By hand**: only for a single building to try a look.

## Performance notes for the other agent

- **The dead**: about 120 authored plus the wild's; today 67 cost 0.1 to 0.3 ms a step with the 40-tile thinking box and the corpses off the list (`23`). Fine; `tools/profile.js` after the castle is placed.
- **Light sources**: braziers, candles, lanterns, the inn's and the castle's hearths; a dozen lit in view is the budget `23` names, so the map ships them unlit (the player lights them) and the inn's two are the night's only lights at the start.
- **Villagers' sheets**: fourteen villagers from the six village wardrobes plus a few new ones is within the atlas's seventeen spare (`19`); the garrison's tabards and the bandits' leather are two or three wardrobes shared by many.
- **Props**: static instances are one quad each in view (`23`); 2,000 props across the map cost nothing until they are on screen, and a screen holds a hundred.
- **The atlas**: every new prop picture is atlas space; the big ones (the granary, the mill wheel, the four-poster, the cliff set, the castle walls at 112 and 128 px with ten variants in two orientations) are the ones to measure; `gl.atlasInfo()` before and after each art batch, as `27` asks. The second atlas page `23` mentions may come due with the castle set.
- **The ground bake**: no change in cost per chunk; more kinds (shingle, mud, shallow water, rubble, ash) are more weight fields per pixel pass only in chunks that have them (`15`'s 3 by 3 skip).

# From `11-cut-list-and-questions.md` (the whole page; its open questions are `30`, section 15)

# 29.11 — The cut list, and the questions for Michael

The brief was more than enough, so that cutting is the work. Here is the plan sorted by what it costs and what it buys, then the questions only Michael can answer, then the order to build in.

## Keep: the map is not this map without them

- The river, the stone bridge, the ford, and water that stops the dead (`02`, `10` item 1).
- The village: the square and the well, the inn with its boarded windows and its living people, the chapel and the graveyard with the rising, the smithy, the joiner, the weaver, the baker, one noble house with carpets (the merchant's), six cottages, your cottage (`04`, `07`).
- The castle as a ring with a gatehouse, four towers, the great hall at its feast, the kitchens, the barracks and the armoury, the wizard's study (`03`).
- Hollow Farm with the barn, the orchard, the pond, and the pumpkin field; Long Acre with its rye and the mill (`05`).
- The woodcutters, the witch at the mere, the quarry (the three resource places the big pass needs: logs, the cure, stone) (`06`).
- The old road east and its waystone (the hook).

## Nice: each adds a screen worth having, and each can go without a hole

- The croft across the ford (the best base; cut it and the ford loses its reason, so cut the ford with it).
- The manor with its walled garden, the reeve's house.
- The hunter's lodge (the bow's second home; the bandits are the first).
- The bandit camp (loot and a prisoner; the prisoner waits for "follow").
- The charcoal burners and the iron workings (the smith's loop's fuel and ore; cut them and the smith's materials come from the castle's coal bin and the armoury's scrap until they are built).
- The hermitage ruin, the standing stones, the barrow (one hook each; keep one of the three at least, the barrow is the cheapest and the strongest).
- The castle's chapel, stables, kennels, the pleasure garden, the dungeon and treasury towers (the keep and the armoury carry the castle; these are its texture).
- The brook and the footbridge (the second bridge; cut it and the mere's lane crosses nothing).
- The toll house (a one-room cottage with a view; cheap).
- Fences round every field (one engine ask and one art set; fields without them are fine, hedges round them are wrong).
- Seven new crops and four herbs (five crops exist; each new one is a request of six pictures; the herbs matter to the cure).
- Fourteen villagers (six is the handful `04` ruled; the other eight are places' reasons).

## Cut first: the things the plan put in to be cut

- **The hedge maze.** A scene and nothing else; a 14 by 14 block of edge state; an opaque wall material. First to go.
- **The second smithy.** Two anvils is one too many for one smith's loop; keep the village's (it is where the smith's story is) and give the castle's forge a cold hearth and a grindstone.
- **The tannery.** Leather is `05`-someday; the tannery is a loot stop with a smell.
- **The dragon skull, the statue, the fountain, the dovecote, the maypole, the market cross.** Each is one decoration prop; they are the cheapest things on the whole list and the first to cut if the art budget is the limit, and the first to keep if it is not, because decoration is what reads as a place.
- **Fishing.** Not in any doc; a whole small loop; proposed because the map has six waters.
- **Coin, the treasury.** Nothing spends it in 1.0.
- **The paired gate, locked doors.** Two leaves that open one at a time, and an armoury whose door is simply shut and boarded from inside (the dead steward's key becomes a crowbar? no: the door is a door), lose little.
- **Carpet as an autotile.** Rugs as 2 by 2 flat props do most of the job in a solar.
- **The willow's eyes.** A joke about a tree; the plain willow at the pond is the willow.
- **256 by 256.** (Not taken: 256 was ruled, `02`, 2026-10-12.) 192 keeps every place and shortens every forest belt by a third; the plan's coordinates scale by 0.75 and nothing moves relative to anything.

## Questions for Michael (the plan's defaults in brackets)

1. **Does water stop the dead?** The whole shape of the map (a safe west, a dangerous east, the crossings as gates) rests on it; without it the river is a texture and the moat is a look. [Yes, with the ford and the weir as the slow crossings the dead can also use.] **Answered 2026-10-12: yes, sharpened** (`02`, `30` law 8): a tile wholly water stops every entity, the ford and the weir's crest are a shallow kind slow for all; built in step 0.
2. **256 or 192?** [256; the forest should be a place.] **Answered: 256** (`02`, 2026-10-12); built.
3. **Which home?** The end cottage, the toll house, or the croft (`07`). [The end cottage; the other two are the places you discover you could move to.] **Answered: the end cottage** (`02`, "The big pass answered"); built in step 0.
4. **Names.** The village, the river, the castle, the farms, the mere, the villagers. The plan uses none so none have to be unlearned. [Michael's; the docs can carry placeholders until then.] **Open** (`30`, section 15); the built village uses role names.
5. **Where do the staff and the book of fire come from?** The wizard's study in the castle's north-east tower is the plan's answer, and it decides that magic in 1.0 is one dead wizard's leftovers, not a school. [The study.] If Michael wants magic more common (a second book at the witch's, a wand at the hermitage), say so; the room stays the first. **Taken as the default** in `30` (step 5, the study with the staff and the book), which Michael approved as written.
6. **One smithy or two?** [One, the village's; the castle's forge cold.] **Answered: one** (the cut list taken, `02`, 2026-10-12).
7. **The maze?** [Cut, unless he loves it.] **Answered: cut** (`02`, 2026-10-12).
8. **How many villagers?** `04` says six to ten; the plan places fourteen with six core. [Fourteen placed, six given lines and jobs first; the atlas allows it.] **Open**; the village of step 1 places seven, with lines.
9. **Fences everywhere, or only where a gate matters?** [Round every field and garden; the fence set is one request and one small engine change, and fields read as fields.] **Not ruled as such**; the engine change is built (fences as features, step 0) and the village's gardens and yards are fenced.
10. **Which new crops first?** [Turnip, wheat, beans, hops; flax, onion, carrot after; the four herbs with the cure.] **Open** (`30`, section 15, the same default).
11. **Fishing: yes, no, later?** [Later, but the waters are placed as if yes.] **Answered: later** (`02`, 2026-10-12; `30`, step 9).
12. **The gloom's door: east, by the old road past the woodcutters?** It decides which edge of the map the zone system opens first. [East.] **Not ruled**; nothing built depends on it yet.
13. **Animals: none in 1.0, and the pens, folds, coops, and stables read as emptied by the dead?** [None; the emptiness is the story. `05` keeps animals possible.] **Answered otherwise: two animals, chickens and deer**, as the pass's last step (`02`, "The big pass answered"; `30`, step 8).
14. **The castle walls at 112 and the towers at 128, or one height?** [Two heights; it is a definition each.] **Taken as the default** in `30` (step 5, "the taller walls (data)").
15. **Does the plan's "every building has rooms" rule hold for sheds, huts, and the forest cabins?** [No: a shed is a room; the rule is for houses.] **Not ruled**; the village of step 1 followed the default.
16. **The dev chest and the combat-testing mode**: a separate testing map, or a setting that adds them to the real one? [A setting that adds them, so the real map file stays clean.] **Answered: a setting** (`02`); built in step 0 (`devChest`, `combatTesting`).
17. **Authoring: a generator script from this plan, the in-game editor, or both?** [The script first, the editor for Michael's own touches.] **Answered: the script first** (`02`, 2026-10-12); built (`tools/mapgen/`).

## The order to build in (once the questions are answered)

**Superseded as the order by `30`, section 11**, which keeps this sequence with the big pass's pieces placed in it; steps 1 and 2 here are its steps 0 and 1, built 2026-10-12.

Each step is a playable map on the current spawn's pattern: the player starts, walks, and the rest of the world is forest until the next step lands.

1. **The engine's tier 1** (`10`, items 1 to 5) and **the art's tier 1** (`09`, requests 1.1 to 1.5) in parallel; the generator script written against the current format and grown with the asks.
2. **The village**, with your cottage, the lane, the green, the square, the inn, the chapel and graveyard, the trades, and the merchant's house, on the west bank with the river beside it and the bridge to nothing. Play it. This is the Stardew half of the arc and the half that needs the least new engine.
3. **Hollow Farm and Long Acre with the mill**, the roads to them, the first new crops. Play the farming loop between the three.
4. **The castle** and the bridge road: the walls, the gatehouse, the keep, the armoury, the study; the garrison. Play the Zomboid half: the first trip across the water.
5. **The forest places**, one a session: the woodcutters, the witch, the quarry, then the rest by the cut list's order.
6. **The dressing pass**: authored decals, signs, lights, the dead's wardrobes, the barricades, the stories in each room.
7. **The edges**: the old road, the waystone, the drove off the map, the standing stones. Then the big pass (`22`) and the NPC pass (`04`) have their world.
