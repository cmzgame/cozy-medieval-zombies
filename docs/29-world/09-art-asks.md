# 29.09 — Art asks

**Status, 2026-10-16: the live art backlog of the 1.0 map; nothing in it is delivered.** Every request below still stands as the ask, and the valley meets it with placeholders: the 35 furniture and station definitions of step 1 are labelled boxes, `wall_fence` is a generated post-and-rail, shallow water a dev flat. Cut and struck from the lists (`02`, 2026-10-12; `30`, section 12): bars for the armoury (its door is shut and boarded; bars stay for the crypt and the cells), the carpet autotile, coin, the crown, and the silver cup (they went with the treasury), and the willow's eyes (the plain willow stands); the struck lines are in `docs/history/29-world-ideation.md`. `30`, section 13, adds to this list: the bucket (a carried prop, world picture only), the tools as trios (hoe, scythe, pickaxe, shovel, knife, hammer), the chicken and the deer as eight-facing sheets with walk, idle, and the deer's flee, a nest, an egg, raw and smoked meat, leather and the jerkin, the cooked foods' icons. The requests become GitHub issues in the sweep's wave 4, against the three "Art owed" issues; the art lands through `27`'s checklist and ships as pairs and trios (`26`).

Everything this plan wants drawn, grouped by what it is for and ranked by when the map needs it. Each group is a paste-ready request in the style of `16` and `18`, with the shared facts repeated inside the fence so each stands alone. Every item in a request follows the house rules (`docs/art/01`): hard pixels, light from the top left, three or four flat shades, a `#2b2522` outline on anything the player uses or gathers and none on decoration, no baked shadow or glow, drawn at final size, anchors recorded from the PNG's top-left in the delivery's JSON, previews at 1x and 3x with the character beside them. Items ship as pairs (world and icon) and anything held or worn as a trio (`26`).

**Tiers:** tier 1 is what the village and your cottage need to be playable on the real map; tier 2 is the castle and the farms; tier 3 is the forest places and the dressing; tier 4 is the nice-to-have. Within a tier the order is the plan's.

## The shared preamble (goes at the top of every request)

```
The game: a cosy, slightly spooky medieval village overrun by the dead, in 2:1 isometric pixel art. Ground tiles are 64x32 diamonds drawn one pixel per pixel, never scaled. The player is about 55 px tall and 26 wide (frame 48x72, feet at (24, 66)). Walls are 96 px tall (80 when this was written; `52`) on one tile edge (32 px along the edge, 16 up the screen): stone 16 px thick, wood 14, log 18, centred on the edge line; a north-edge wall runs top-left to bottom-right (\), a west-edge wall bottom-left to top-right (/), both drawn, never mirrored. Light from the top left; three or four flat shades per material; hard pixels only (every pixel fully opaque or fully transparent); no baked ground shadow, glow, or flame light (the engine lights everything per pixel and draws flames as separate unlit frames). Anything the player uses or gathers has a 1 px #2b2522 outline all the way round; decoration has none. Anchors: for things on a tile, the pixel where the tile's top vertex sits at ground level; for posts, their own centre at ground. One transparent PNG per piece, tightly cropped; anchors in a JSON; previews at 1x and 3x with the 55 px character for scale. Muted autumn colours, never neon; wood #5e4028 to #8a5e36, stone #7b7670, metal #2b2a32.
```

## Tier 1: the village and the home

### Request 1.1: fences, low walls, hedges, and bars (wall materials)

```
[preamble]

Please draw five more wall materials in the same conventions as the wood, stone, and log walls (one tile edge long, centred on the edge line, both orientations drawn, a post for corners and ends, the five variants where they make sense). These are the walls of fields, gardens, graveyards, stalls, and cells. The engine treats each like any wall; some let sight through and some do not, which I note per set.

1. wall_fence: a post-and-rail fence, 40 px tall, 6 px thick: two rails on square posts, weathered grey-brown, a little lean. Sight passes through it. Variants: plain, gate_shut, gate_open (a field gate on strap hinges, 20 px across, the open leaf as a separate sprite like the doors), no windows. Plus post_fence.
2. wall_fence_low: the same fence at 24 px, one rail: stall partitions, pens, the edge of a byre. Plain only, plus its post.
3. wall_stone_low: a dry-stone wall, 32 px tall, 14 thick, mossed on the north side, with a gate_shut and gate_open (a small wooden gate) and post_stone_low (a taller capstone). Graveyards, sheepfolds, garden walls. Sight passes over it.
4. wall_hedge: a clipped hedge, 64 px tall, 18 thick, dense dark green with a few autumn leaves caught in it, no openings at all (a gap is simply no hedge). A rounded top rather than a cap. Opaque. And wall_hedge_low at 24 px (a knot garden, a field edge), also opaque to bodies but sight passes over it. Posts: none; a hedge's corner is just the hedge turning, so please draw a corner piece for each height and orientation pair instead of a post.
5. wall_bars: iron bars in a stone sill and lintel, ~~80 px tall~~ 96 px tall (every wall, `52`), 8 thick: prison cells and the crypt. Sight passes. Variants: plain, door_shut (a barred door with a lock plate), door_open (the barred door as a swung leaf). Plus post_bars (a stone pier).

Deliver as wall_<name>_<north|west>_<variant>.png, post_<name>.png, the open leaves as door_open_<name>_<north|west>.png, and the hedge corners as hedge_corner_<...>.png. A preview: a fenced field with a gate, a walled graveyard, a hedged garden, and a cell block, at 1x and 3x.
```

### Request 1.2: village fixtures and street furniture

```
[preamble]

Please draw the fixtures a village street needs, in the style of the well and the furniture you made. All outlined (the player uses them) unless I say decoration.

1. Market stall: 2x1 tiles (long side along world Y, like the bed), a plank counter on trestles under a striped canvas awning on two poles, goods on the counter. Four colourways of awning and goods: vegetables, cloth bolts, pots, knives. About 60 px tall. A container.
2. Market cross: 1x1, a stepped stone base of three steps with a short column and a cross or a ball on top, about 72 px tall. Decoration (no outline).
3. Notice board: 1x1, two posts with a plank board between and a little shingle cap, a few blank papers pinned to it, about 48 px tall. Outlined.
4. Stocks: 1x1, a wooden stocks on a post, about 36 px tall. Outlined.
5. Maypole: 1x1, a tall pole (about 110 px) with faded ribbons hanging from a ring near the top. Decoration.
6. Bench: 1x1, a plank bench on two log ends, about 18 px tall, drawn in two facings like the chair (seat toward the viewer, seat away). Outlined.
7. Lantern post: like the torch post, a post with an iron lantern hung from a bracket at the top, about 72 px; the lantern's flame as three separate unlit frames (the engine lights it). Outlined.
8. Horse trough: 2x1, a stone trough with water, about 20 px tall. Outlined (you can drink).
9. Woodpile: 1x1, split logs stacked between two stakes, about 28 px tall, two fill levels (full, half). Outlined (a container).
10. Privy: 1x1, a tiny plank hut with a crescent cut in the door, about 64 px tall. Decoration.
11. Chicken coop: 2x1, a hut on short legs with a ramp and a nesting box, about 40 px tall. Outlined (a container).
12. Cart: 2x3 tiles, a two-wheeled farm cart with raised sides, tipped back on its tail, about 50 px tall; and the same cart overturned (on its side, a wheel off) as a second drawing. Outlined (a container). Long side along world Y.
13. Wheelbarrow: 1x1, a wooden barrow with one wheel, about 30 px tall. Outlined (a container).
14. Signs on brackets: a bracket arm that hangs from a wall's face (anchored like the torch bracket, on the near face, 48 px up) with a painted sign board: eight boards: a tankard (the inn), a loaf, a horseshoe, a shuttle, a boot, a key, a mortar and pestle, and a blank. Each in both wall orientations. Outlined.
15. Hitching rail: 1x1, two posts and a rail, 24 px. Decoration.

File names as sign_<thing>_<north|west>.png and <thing>.png otherwise, 2-tile pieces as one drawing to be sliced. A preview of a village square assembled from them, at 1x and 3x.
```

### Request 1.3: interiors, the furniture of rooms

```
[preamble]

Please draw the furniture that fills a village's rooms, in the style of the bed, table, chairs, and fireplace. All outlined (the player uses or opens them). Footprints and heights as given; long sides along world Y; one drawing each unless two facings are named.

1. Cupboard / dresser: 1x1, a tall dresser with plates on its upper shelves and doors below, about 70 px. A container. Two facings (front toward the viewer, and its back, which is a plain back for the wall).
2. Chest, redrawn: 1x1, an iron-banded wooden chest, 24 px, shut and open (two drawings). Also a strongbox: smaller, iron, a big lock, 18 px.
3. Barrel, redrawn: 1x1, 30 px; and a crate 1x1, 22 px; and a sack 1x1, 18 px, three variants (grain, flour, a tied sack). Containers.
4. Shelf, standing: 1x1, a tall open shelf with jars, 64 px. A container.
5. Desk: 2x1, a writing desk with a ledger, an inkpot, and a candle, 28 px. A container (the drawer).
6. Stool: 1x1, a three-legged stool, 14 px.
7. Bench, indoor: 2x1, a plank bench for a table's side, 16 px.
8. Bar counter: 3x1, a plank counter with a shelf of mugs behind and a barrel on tap under it, 34 px. A container.
9. Cradle: 1x1, 16 px. Decoration.
10. Rug: 2x2 and 1x2, flat woven rugs with a border, drawn flat on the ground plane (an ellipse of the diamond), three colourways (red, blue, a plain straw mat). No outline (you walk on it).
11. Candle stand: 1x1, a tall iron stand with three candles, 48 px; the flames as separate unlit frames.
12. Spinning wheel: 1x1, 36 px. Outlined.
13. Loom: 2x2 (the first four-tile piece), an upright loom with a half-woven cloth, 64 px. Outlined (a station).
14. Four-poster bed: 2x2, a bed with four posts and a canopy frame (no canopy cloth, so the room stays open to view), a rich quilt, 70 px. Outlined.
15. Pew: 2x1, a church bench with a high back, 30 px, two facings. Altar: 2x1, a stone table with a cloth and two candlesticks, 32 px. Lectern: 1x1, 40 px. Font: 1x1, a stone basin on a pedestal, 36 px.
16. Stone coffin: 2x1, a lidded sarcophagus, 24 px, lid shut and lid ajar (two drawings). A container.
17. Open grave: 1x2 flat, a dark rectangular pit in turned earth with a shovel stuck in the heap. No outline.
18. Headstones: 1x1, four shapes (a round-topped slab, a cross, a leaning slab, a broken one), 28 to 40 px. Decoration.

A preview of a cottage's two rooms, an inn's taproom, and a chapel's nave assembled from these, at 1x and 3x.
```

### Request 1.4: the crops and the gatherables of the fields

```
[preamble]

Please draw seven more crops in exactly the recipe of the five you made (potato, rye, cabbage, garlic, pumpkin): three stages (0 planted, 1 growing, 2 ready), each in both row directions (tlbr along world X, trbl along world Y), one tile's worth of plants per sprite spaced along the furrow, each plant on its own layer with its own #2b2522 outline, anchored at the tile's top vertex at ground level. Interactable, so outlined.

1. Turnip: a leafy top, then a bigger top, then a pale purple-white root showing above the soil.
2. Wheat: like rye but lighter gold with a fuller, nodding ear; tell them apart at a glance.
3. Beans: a pole crop: a stick with a twining vine, then leaves, then pods; taller than the others (about 44 px ready).
4. Hops: tall on strings between two poles, a bine with cones at ready; the tallest crop (about 52 px).
5. Flax: thin blue-flowered stems at growing, straw-coloured and seeded at ready.
6. Onion: hollow green tubes, then a swelling bulb, then a brown-skinned bulb with flopped tops.
7. Carrot: feathery tops, then more, then an orange shoulder showing.

And four herbs for a kitchen garden and the wild, the same recipe but smaller (one tile, two stages: growing and ready), outlined:
8. Sage (grey-green, soft leaves), yarrow (a flat white flower head), feverfew (small daisy heads), nettle (toothed leaves, a darker green). Also each as a dried bunch, 1x1 icon only, 19x19, for the inventory.

Also: a scarecrow, 1x1, a cross of poles with a stuffed sack body, a turnip or sack head with a painted face, a ragged coat and hat, about 60 px tall; outlined (it is interactable, and it will wobble). Two variants: the farm's, plain, and the witch's, better dressed and with a crow on its arm.

[OVERTAKEN by #422, 2026-10-25: the apple tree is the round tree, green, with apples painted on at load (src/fruit-art.js); do not ask for this.] And apples as a fruit tree: tree_apple, about 72 px tall, a round canopy on a short trunk, in three states: bare (early), leafy with blossom, and laden with red apples; outlined all round (it is gathered). A preview of a field of each crop at stage 2 beside a rye field, at 1x and 3x.
```

### Request 1.5: the first stations

```
[preamble]

Please draw the working stations of a village, each as one outlined object the player uses. Where a station has fire, draw the fire as separate unlit frames (three, like the fireplace's) that sit in a marked spot; the engine lights it.

1. Anvil: 1x1 on a stump, 26 px. Forge: 2x1 against a wall (like the fireplace), a stone hearth with a hood, a bellows arm at one side, the firebox dark, 60 px; three flame frames. Quench barrel: 1x1 (the barrel with water). Grindstone: 1x1, a wheel on a trestle with a seat, 30 px.
2. Workbench: 2x1, a heavy plank bench with a vice, a saw, chisels in a rack at the back, shavings, 34 px.
3. Oven: 2x1 against a wall, a domed bread oven of stone and brick with an arched mouth, a peel leaning on it, the mouth dark, 56 px; three flame frames in the mouth.
4. Millstones: 2x2, a pair of great stones in a wooden casing with a hopper above, 48 px. And the mill wheel: 1x2 standing on the water's edge against a wall, an undershot wheel with paddles, 96 px tall, four frames of turning, outlined.
5. Cauldron: 1x1, an iron pot on three legs over a fire ring, 36 px; three flame frames under it; and a second drawing of it hanging on a hook (to sit in the fireplace's firebox: 18x16 like the fire frames).
6. Dye vat: 1x1, a half-barrel of dye with a stirring stick, 24 px, in three colours (red, blue, yellow).
7. Cider press: 2x1, a screw press over a tub, 56 px.
8. Smoking rack: 1x1, a frame of poles with fish and meat hung over a smouldering fire, 48 px; three smoke frames (unlit).
9. Sawpit: 2x1 flat, a plank-lined pit with a two-man saw across it and a log on trestles, 20 px above ground.
10. Haystack: 2x2, a rounded stack with a pole through it, 56 px; and a half-eaten one. Outlined (a container of straw).
11. Beehive: 1x1, a straw skep on a stand, 28 px. Outlined.
12. Dovecote: 1x1, a round stone tower with pigeon holes and a conical cap, 100 px tall. Decoration (no outline).

A preview of a smithy, a bakery, and a mill assembled from these with walls and floors, at 1x and 3x.
```

## Tier 2: the castle and the farms

### Request 2.1: the castle walls

```
[preamble]

Please draw a castle wall set in the conventions of the stone wall you made, taller and thicker, with a crenellated top. Two materials:

1. wall_castle: ~~112 px tall~~ (96, like every wall, `52`, 2026-10-26; the look below stands) 24 px thick, fitted ashlar blocks (larger and squarer than the house stone), a stringcourse two thirds up, and a crenellated cap: merlons about 10 px across with 6 px gaps, 12 px tall, standing on the flat cap. The cap must be an exact parallelogram at the wall's thickness (the engine redraws it with the sky's light) with the merlons rising from it; please keep every merlon pixel within the cap's parallelogram footprint extended upward. Variants: plain; slit (a tall narrow arrow slit, 4 px wide and 30 px tall, its sill 36 px up, black inside: this serves as both the window_shut and window_open variant); gate_shut (a portcullis of iron bars down in a 2-tile-wide arch: this is drawn as a pair, a left half and a right half, each one edge wide, so two adjacent edges make one arch); gate_open (the same arch with the portcullis drawn up, its teeth showing under the lintel); door_shut and door_open (a single narrow postern door, iron-bound, for the back wall). Both orientations. A post_castle (a square buttress, a pixel proud, with its own merlon).
2. wall_tower: ~~128 px tall~~ (96, `52`; a tower's height is its storeys, `49`) 24 px thick, the same ashlar with a plinth at the base, the same cap and merlons; variants plain, slit, door_shut, door_open. Both orientations. post_tower.
3. Gatehouse chains: two chains as a wall-hung piece on the castle wall's face above the gate, from the wall's top down to the lintel, anchored like a torch bracket. Decoration.
4. Banner: a wall-hung cloth banner on a pole, 48 px long, hanging on a wall's face (anchored like the torch bracket, 60 px up), in crimson with a gold device, and in two more colours. Decoration. Both orientations.
5. Brazier: 1x1, an iron basket on three legs full of charcoal, 40 px; three flame frames, unlit.

A preview: a corner of the castle with a tower, a stretch of wall with a slit, the gatehouse arch shut and open with the chains and a banner either side, at 1x and 3x, with the ~~80 px~~ 96 px house wall beside for scale (`52`).
```

### Request 2.2: the castle's rooms

```
[preamble]

Please draw the furniture of a small castle, outlined where the player uses it.

1. Grand hearth: 3x1 against a wall, a wide stone fireplace with carved corbels, a mantle, and a hood, 80 px; three flame frames.
2. High table and dais: a 2x1 table with a cloth (the feast laid: plates, cups, a roast, a bowl of apples drawn on it), and a 2x1 dais step of stone, 10 px, as a separate flat piece. The lord's chair: 1x1, a high-backed carved chair, 44 px, two facings.
3. Trestle table laid for a feast: the existing table with the feast drawn on it as a variant (table_feast.png).
4. Weapon rack: 1x1, an upright rack holding two spears, a sword, and a shield, 56 px. A container. And a wall-hung rack of the same as a wall-face piece, both orientations.
5. Tapestry: a wall-hung cloth on a wall's face, 40 px wide and 56 tall, in three designs (a hunt, a tree, a saint), both orientations. Decoration.
6. Dragon skull: a wall-hung mount for over a door, a long horned skull about 48 px across, both orientations. Decoration, and the thing everyone will screenshot.
7. Bookshelf: 1x1, a tall case of books and scrolls, 72 px, a container; and a wall-hung shelf of books and jars, both orientations.
8. Stand for a staff: 1x1, a wooden stand with a forked top that holds the staff of fire upright (I will draw the staff into it from the staff art), 40 px. A container.
9. Statue: 1x1, a stone knight on a plinth, 96 px. Decoration. Fountain: 2x2, a stone basin with a central spout, 40 px, water drawn still (I will tint it); decoration.
10. Chains and shackles: a wall-hung set for a cell wall, both orientations. Decoration. A bone pile: 1x1 flat. A rat? No animals: a rat skeleton, flat, decoration.
11. Saddle on a peg: wall-hung, both orientations. Manger: 1x1, a hay rack on a wall, wall-hung. Stall straw: 1x1 flat, a scatter of straw (no outline).
12. Ladder against a wall: wall-hung, 72 px, both orientations. Decoration. Stairs (a flight going up into nothing, for later): 1x2, stone steps rising to the wall's height, decoration.
13. Floor tiles for the chapel and the manor: floor_tile, four variants of glazed red-and-cream chequer at 16 px squares in world space, hard diamonds like the stone floor.

A preview of the great hall at the feast, the solar, and a cell, at 1x and 3x.
```

### Request 2.3: the farm

```
[preamble]

Please draw the pieces of a working farm, outlined where the player uses them.

1. Byre fittings: a manger (wall-hung), a milking stool (1x1), a churn (1x1, 30 px), cheese on a shelf (wall-hung), a flitch of bacon on a hook (wall-hung).
2. Granary: a 3x3 hut on staddle stones (mushroom-shaped stone feet), plank walls and a plank roof-less top, with its door open showing sacks; drawn as one 3x3 outlined prop with the top open to view, 72 px. A container.
3. Pigsty hut: 2x1, a low stone-and-plank hut, 40 px. Lambing shed: a three-sided lean-to of posts and hurdles, 2x2, 56 px.
4. Rick of sheaves: 2x2, a stack of bound sheaves, 48 px; a haycock: 1x1, 28 px. Containers.
5. Farm tools as held items and icons (trio each: world, icon, portrait): hoe, scythe, pitchfork, flail, sickle, shovel, pickaxe, watering can, hammer, saw, fishing rod. Same conventions as the knife and axe, upright with a grip pixel, 1x3 or 1x2 in the bag.
6. Duck house on a post in water: 1x1, 48 px. Decoration. Reeds: decals, three clumps, 20 to 30 px, no outline. Lily pads: a flat decal.
7. Midden: 1x1 flat, a heap of muck and straw with a fork in it, no outline.
8. Fence gate posts with a jack-o'-lantern on top: a variant of post_fence with a pumpkin lantern sitting on it (the engine lights it); two faces.
9. The dead tree: tree_dead_L, a bare grey oak with twisted limbs, about 160 px, no leaves, a few crows (decoration), in the harvest trunk ramp gone grey; no outline (a tree).
10. Stump: 1x1, a felled tree's base with rings showing, 20 px, three sizes to match the three tiers; outlined (it gives a log to an axe). Felled trunk: 1x3, a log lying across, 28 px, outlined.
11. Bramble: 1x1, a tangled bush with thorns and dark berries, 36 px, in two states (berried, picked); outlined.
12. Hollow giant: a variant of the L oak with a dark hollow at the trunk's base, as tree_oak_L_hollow in the four harvest colours; the hollow is a container, the tree is still a tree (no outline).

A preview of a farmyard, at 1x and 3x.
```

## Tier 3: the forest places and the water

### Request 3.1: water, banks, and crossings

```
[preamble]

Please draw the water's edges and the ways over it.

1. World textures, 128x64 seamless in world pixels, like the still water you made: shingle (a river bank of small wet stones, grey-brown), mud (dark wet earth with a few hoof prints), water_shallow (the still water but paler and broken, stones showing through, for a ford), water_dark (the still water a step darker and stiller, for a mere), rubble (bare rock and chips, for a quarry floor), ash (black trodden ground, for a charcoal hearth).
2. Bridge floors, 64x32 hard diamonds: floor_bridge_stone (worn flagstones with a slight crown, four variants) and floor_bridge_plank (planks across the walking direction with gaps, four variants, both furrow directions like the farm soil since planks run across a bridge).
3. wall_parapet: a low stone parapet for a bridge's sides, 28 px tall, 12 thick, with a coping, both orientations, plain only, plus its post (a pier with a ball). Sight passes over it.
4. Weir lip: a one-tile-long strip for a tile edge, like a wall but 10 px tall, of water pouring over a stone sill, animated in three frames; both orientations.
5. Rowing boat: 2x1, pulled up on a bank, oars in it, 24 px, outlined (a container). Stranded log: 1x2 flat, no outline. A heron on one leg: 1x1, decoration, 40 px (a bird is not an animal, surely).
6. Stepping stones: a flat decal, five stones in a line, for a brook.
7. The footbridge rail: wall_rail, a single wooden handrail on posts, 30 px, sight passes.

A preview of a river bank with the stone bridge and parapets, a ford, and a weir, at 1x and 3x.
```

### Request 3.2: the forest places

```
[preamble]

Please draw the pieces of the small places in the woods.

1. wall_cliff: a rock face as a wall material, 128 px tall, 32 thick, grey-brown stratified rock with grass on its cap, both orientations, plain only, plus a corner piece (no post: rock turns); and a cliff_mouth variant two edges wide (a left half and a right half) with a black mine opening and timber props framing it.
2. wall_ruin: the wood, stone, and log walls fallen to stubs (you drew stubs at 16 and 24 px; please add a 40 px ruined version for stone only: broken at a ragged line, a few fallen blocks at its foot), both orientations, plain and a window variant with a broken arch; a ruined post. Sight passes over it.
3. wall_wattle: a woven hurdle of hazel, 48 px, 6 thick, both orientations, plain and gate; a hunter's screen and a witch's garden fence. Sight mostly blocked.
4. Tent: 2x2, a canvas tent with the flap open, 56 px, outlined (a container). Bedroll: 1x1 flat, outlined.
5. Cage: 2x2, a barred box with a door, 64 px, outlined.
6. Charcoal clamp: 2x2, a turfed mound with a smoke hole, 40 px; three smoke frames (unlit). Outlined (a container of charcoal).
7. Standing stone: 1x1, four shapes, lichened grey, 80 to 112 px; and a fallen one, 1x2 flat. Cup-marked stone: 1x1 flat. No outline.
8. Barrow door: 1x2 flat-ish, two leaning stone slabs with a lintel, 48 px, no outline. Barrow mound: this one is a ground thing: a 6x4-tile mound as a set of 64x32 ground tiles (edge pieces and a top) in the grass colours, no outline.
9. Shrine: 1x1, a stone post with a niche, a small figure in it, a candle shelf, 60 px; outlined (the candle is lit); three flame frames. Wayside cross: 1x1, 56 px, decoration. Cairn: 1x1, a heap of stones, 24 px, decoration.
10. Crane: 1x1, a timber post with a jib and a rope and hook, 100 px, decoration. Stone blocks: 1x1, cut blocks stacked, 30 px, outlined (a container). Ore rocks: the four rocks with rust-red streaks and a glint, as rock_ore_0..3, outlined. Spoil heap: 2x2, a mound of grey chips, 36 px, no outline. Ore cart on rails: 1x2, 30 px, outlined (a container); rails as a flat decal strip.
11. Gallows tree: the dead tree with a rope from a limb (a variant); and a wooden gallows: 1x1, 90 px, decoration (no body).
12. Antlers: wall-hung, both orientations. Pelt rug: 1x2 flat, a bear or boar hide, no outline. Snares: wall-hung, a bundle of loops. Skinning frame: 1x1, a square frame with a hide stretched, 56 px, decoration.
13. Mist: three flat decals of thin grey-white wisps, 48 to 80 px wide, for a mere's bank. Crows: a flat decal of three black birds on the ground; and a single crow for a scarecrow's arm.
14. Tinker's cart, overturned: a variant of the cart with pots spilled.

A preview of the quarry, the bandit camp, and the stones, at 1x and 3x.
```

## Tier 4: the dressing, the dead, and the long tail

- **Authored decals** (flat, no outline, for the ground bake): cart ruts (two parallel lines, 64 px, in two orientations), hoof prints, straw scatter, soot, rushes, a scorched circle (a 2x2-tile ring of black), wine stains, windfall apples, bird droppings on a statue? no. Each 1x1 to 2x2 flat.
- **The dead's clothes** belong to the character brief (`25`) and not here; what this plan adds to that brief's lists: a **tabard** over the tunic (the garrison's, in the lord's colours), a **kettle helm** and a **coif** (the brief has the coif), a **leather jerkin** (the bandits'), an **apron** (the smith, the baker), **finery** (a long tunic with a second colour and a belt with a pouch, the merchant's and the feast's), a **robe** (a long tunic in deep red; not the wizard's, who is alive, `02` 2026-10-19, in blue robes, 2026-10-18), a **hood** (the bandits' and the witch's). All dyeable, all stiff, all on the rig.
- **Items for the loop's new things** (each a trio): charcoal, iron ore, an iron bar, a stone block, cloth (linen), a rag (torn from a garment, #212), wool, flax, leather, a key, an egg, a fish, honey, a ham, a wheel of cheese (the cheese exists), a bottle of wine, a mug of ale, flour, grain, a seed packet per crop, a dried herb per herb, a bandage (owed already), a candle, a lantern, a fishing rod (above), a book (three covers), a bell.
- **The willow**: import the four drawn colours from the shelf (`docs/art/02`); the green one for the village pond and the mere (the eyes variant was cut, `02` 2026-10-12); it needs a definition and a shadow width wider than the oaks'.
- **Cursors**: on the shelf (`docs/art/08`); not this plan's.

## What is already drawn and only needs placing

The wood, stone, and log walls with every variant and the boards; the floors; the well with its bucket; the bed, table, chairs, and fireplace; five crops in three stages and two directions; both soils; the water; the four rocks; the mushrooms; all the decals; thirty-six trees; the two pumpkins and the two jack-o'-lanterns; the four magic items. The village's cottages, the chapel's walls, the farms' fields, and the whole forest can be laid out today with these, which is why the order to build in (`30`, section 11) started with the village.
