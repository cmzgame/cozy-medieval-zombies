# 29.03 — The castle

**Status, 2026-10-16: not built; `30`'s step 5, the castle and the bridge road.** The castle's ground is reserved in the valley as `[136, 126, 66, 64]` (`tools/mapgen/valley.py`: the plan's 56 by 56 at (140, 130) with its moat, the plan's (140, 96) below moved with the high street to row 158); nothing of this page is generated yet. What `30` keeps of it: ~~the taller walls as data~~ (withdrawn 2026-10-26, `52`), the gatehouse, the four towers, the great hall, the kitchens with their stations, the barracks and the armoury with its door shut and boarded from inside, the wizard's study with the staff and the book, the garrison. Cut on 2026-10-12 (`02`, "The cut list taken as written"; `30`, section 12): the hedge maze, the treasury and coin (and with them the crown and the silver cups), locked doors and keys, the paired gate, carpet as an autotile, and the second smithy's fire (the castle's forge is cold; the smith's loop lives in the village's smithy). The lines that described them are rewritten below and what they said is in `docs/history/29-world-ideation.md`; the plan picture keeps the maze until the castle is generated. What the castle asks of the engine is `30`, section 12, under step 5. Multiplayer is live (`31/08`): the place is data, but the rising, a stack that gives, and any other behaviour a room brings is built for a guest in the same commit.

## How a castle reads with one storey and no roofs

*(2026-10-26: height is now a matter of storeys, `49`, and every wall is 96 px, `52`; this section's taller materials are withdrawn, and its reading of a castle seen from above stands until the castle is planned by storeys.)* The honest problem first: a castle is height, and this engine has none. Walls are 80 px tall pictures on tile edges, every room is open to the sky, and nothing stands on anything. So the castle cannot be a silhouette against the sky. What it can be, and what reads just as well from this camera, is **a walled compound seen from above like a doll's castle**: a ring of taller walls round a cobbled yard, towers at the corners that are small rooms with even taller walls, a gatehouse you walk through, a moat, and inside the ring a cluster of buildings whose rooms you look straight down into, each dressed to tell what it was for. The "no roofs" rule is the castle's friend: the feast in the great hall, the cells in the dungeon tower, the scorched floor of the wizard's study are all visible from the bailey, cut away by nothing.

Seven things make it read as a castle rather than a big stone house. Every one is art or data, none is a new system:

1. ~~**A taller wall material.**~~ (withdrawn 2026-10-26, `02`, Walls 96 px tall: "no more weird tall castle walls"; every wall is one storey, and a castle is taller by storeys, `49`) `wall_castle`: ~~112 px tall where the village walls are 80~~ (96 like every wall, `52`), 24 px thick, with a crenellated cap (merlons the engine's cap redraw can carry, since the cap is in the sprite and redrawn with the sky flag, `17` ruling 3), fitted ashlar below. The renderer reads `height` and `thickness` per sheet already (`02`, 2026-10-11), so a taller material is a definition and a drawing, not code. ~~**Towers get `wall_tower`** at 128 px, the same ashlar, so the corners stand above the curtain. Michael tried 96 for houses and found it too tall for a cottage; that is exactly why 112 and 128 will read as "not a cottage".~~ (Withdrawn with the above: a tower stands above the curtain by a storey, `49` and `50`.)
2. **Arrow slits as the window variant.** The castle wall's `window_shut` and `window_open` are one and the same: a slit. Sight through, a sliver of a wedge (`03`'s window rule gives the slit a thin cone), nothing passes it, as no window is passed (#134). From inside a tower you see the dead on the approach through a slit; from outside the slit is black.
3. **The gate as the door variant.** The castle wall's `door_shut` is a portcullis down, `door_open` the passage with the portcullis drawn up into the arch, and the gate's leaf opens upward, so there is no swung leaf sprite at all (the leaf is in the wall picture, a nice simplification). The passage is two tiles wide: two door edges side by side, each its own gate (the paired opening was cut on 2026-10-12; two leaves that open one at a time also work and are odder in a good way).
4. **The moat and the drawbridge.** Water all round (`02`), a plank bridge at the gate with chains up to the gatehouse (edge props: the chain is a bracket-like thing on the wall above the gate). The moat is what makes the ring a ring.
5. **Banners, braziers, and the night.** Hanging banners on the walls inside the bailey (an edge prop like the torch bracket, in the lord's colours: crimson, the one saturated accent `06` allows), braziers along the wall foot (a new fire kind, `brazier`: burns charcoal, lights a pool of 3, never cooks), and torch brackets in every passage. At night a lit castle across the water is the most lurable thing on the map (`07`: the dead see fire from twelve tiles) and the most visible; the player decides whether to light it.
6. **The bailey's floor tells the story.** Cobble over most of it, worn to dirt at the stables and the smithy, the kitchen garden's dark soil, the pleasure garden's lawn. Authored decals: straw by the stables, soot by the forge, a cart's ruts from the gate to the kitchens.
7. **The garrison.** Thirty to forty of the dead inside the walls in tabards and kettle helms (`wardrobes.json` entries once the character art lands: a tabard is a tunic with a second colour, a kettle helm is a hat), a dozen in the hall in finery, two in the gatehouse. The densest place on the map and the richest: the armoury is where the good weapons are until the smith works.

What is deliberately not here: battlements you walk on, a keep you climb, a dungeon you go down to. Each is an upper floor or a basement, both `05`-someday, and nothing in this plan forecloses them: the gatehouse towers have a `stairs` prop at the back wall (decoration now, a `stairs` opening when floors come), and the chapel's crypt is a ground-floor annex that could one day be a stair down.

## The plan

One character is one tile; the castle's set is 56 by 56 at world (140, 96). Walls are drawn as tiles here for legibility; in the engine every `#` is a tile edge, so the real rooms are a tile bigger each way than they look. `~` the moat, `.` grass, `c` cobble, `=` the road and the gate passage, `#` castle wall, `h` hedge, `f` herb beds, `_` a laid stone floor, `r` carpet over stone, `:` a tower room or the maze's paths, `D` a door, `G` a gate leaf, `W` the well, `b` a barrel or trough, `o` a hearth or oven, `A` the anvil, `T` tables, `t` the lord's chair, `B` beds, `R` weapon racks, `p` pews, `x` an altar or sundial, `s` stalls, `K` kennel fences, `%` braziers, `*` the fountain.

```
     0       8       16      24      32      40      48
   0 ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
     ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
     ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
     ~~~..................................................~~~
     ~~~.################################################.~~~
     ~~~.#::::#%c##############c%################%#######.~~~
     ~~~.#::::#cc#_o_____#_o__#c#________o_____#rrrrrrr##.~~~
     ~~~.#::::#cc#_______D____#c#___________TT_#rrrrrrr##.~~~
   8 ~~~.#::::#cc#_______#____#c#__T__T_____TT_Drrrrrrr##.~~~
     ~~~.###D##cc#_______#____#c#__T__T_____TT_#rrrrrrr##.~~~
     ~~~.#ccccccc#_______######c#__T__T_____TTt#rrrrrrr##.~~~
     ~~~.#ccccccc#_______#_bb_#c#__T__T_____TT_####D#####.~~~
     ~~~.#ccccccc#_______D_bb_#c#__T__T_____TT_#rBBrrrr##.~~~
     ~~~.#ccccccc#_______#_bb_#c#__T__T_____TT_#rrrrrrr##.~~~
     ~~~.#ccccccc####D#########c#___________TT_#rrrrrrr##.~~~
     ~~~.#%ccccccccccccccccccccc#______________#rrrrrrr%#.~~~
  16 ~~~.#ccccccchhhhhhDhhhhhhhc#######DD################.~~~
     ~~~.#ccccccchffffffffffffhccccccccccccccccccccccccc#.~~~
     ~~~.#ccccccchffffffffffffhcc..................ccccc#.~~~
     ~~~.#ccccccchffffffffffffhcc..................ccccc#.~~~
     ~~~.#ccccccchffffffffffffhcc........*.........ccccc#.~~~
     ~~~.########hffffffffffffhcc..................ccccc#.~~~
     ~~~.#::::::#hffffffffffffhcc..................ccccc#.~~~
     ~~~.#::::::#hffffffffffffhccccccccccccccccccccccccc#.~~~
  24 ~~~.#::::::##D#ffffffffffhcccccchhhhhhDhhhhhhhcccccD====
     ~~~.#::::::##_#ffffffffffhcccccch::::::::::::hccccc#.~~~
     ~~~.####D####_#ffffffffffhcccccch::::::::::::hccccc#.~~~
     ====G======G###hhhhhhhhhhhcccccch::::::::::::hccccc#.~~~
     ====G======G===ccccccccccccccccch::::::::::::h######.~~~
     ~~~.####D###cccccccccccccccccccch::::::::::::h#sss##.~~~
     ~~~.#::::::########ccccccccccccch::::::::::::h#sss##.~~~
     ~~~.#::::::##_____#ccccccccccccch:::::x::::::h#sss##.~~~
  32 ~~~.#::::::##_____#cccWbcccccccch::::::::::::h#sss##.~~~
     ~~~.#::::::##_____#ccccccccccccch::::::::::::hDsss##.~~~
     ~~~.#########_____#ccccccccccccch::::::::::::h#sss##.~~~
     ~~~.#ccccccc#_____#ccccccccccccch::::::::::::h#sss##.~~~
     ~~~.#ccccccc###D###ccccccccccccch::::::::::::h#sss##.~~~
     ~~~.#ccccccccccccccccccccccccccchhhhhhhhhhhhhh#sss##.~~~
     ~~~.#ccccccc___o___ccccccccccccccccccccccccccc######.~~~
     ~~~.#ccccccc_A___b_cccccccccccccccccccccccccccccccc#.~~~
  40 ~~~.#%cccccc_______cccccccccccccc#####D######cKKKKK#.~~~
     ~~~.#cccccccccccccccccccccccccccc#__________#cK...K#.~~~
     ~~~.#ccccccc######D########D###cc#__________#cD...K#.~~~
     ~~~.#ccccccc#____________#____#cc#__p___p___#cK...K#.~~~
     ~~~.#ccccccc#_B__B__B__B_#_RRR#cc#__________#cKKKKK#.~~~
     ~~~.#ccccccc#____________#____#cc#__p___p__x#ccccc%#.~~~
     ~~~.###D##cc#____________D____#cc#__________#c###D##.~~~
     ~~~.#::::#cc#____________#____#cc#__p___p___#c#::::#.~~~
  48 ~~~.#::::#cc#_B__B__B__B_#_RRR#cc##D#_______#c#::::#.~~~
     ~~~.#::::#cc#____________#____#cc#__________#c#::::#.~~~
     ~~~.#::::#cc########%##########%c############c#::::#.~~~
     ~~~.################################################.~~~
     ~~~..................................................~~~
     ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
     ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
     ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
```

The west gate (left, rows 27 and 28) faces the bridge; the postern (right, row 24) faces the forest road. The hedged block south of the garden (`h` and `:`, rows 24 to 37) is the maze, cut on 2026-10-12; the picture keeps it until the castle is generated.

## Room by room

Each entry: what it is, what is in it, and why it earns its place (the cost of being there, how you pay, what you only get there).

### The ring

- **The curtain wall**: `wall_castle` (the castle's ashlar look; 96 px tall like every wall since `52`), 48 tiles square outside, with arrow slits every six tiles. The four **corner towers** are six by six outer in `wall_tower`, each with one door onto the bailey and slits on its two outer faces. Nothing passes a slit, as nothing passes any window (#134), so a tower's one way in is its door, and a shut stone door is the safest room on the map, which is the point of towers.
- **The moat** three wide all round, the **drawbridge** at the west gate, a **postern** with a one-tile footbridge on the east wall onto the forest road.

### The gatehouse (west wall, rows 21 to 34)

Two guard rooms flanking a two-tile passage with a portcullis gate at each end. Guard rooms: a table, a bench, a brazier, a weapon rack with two spears and a shield, a dead guard each. The passage is the only way in with a cart; the dead that come to the castle's sound pile up here. **Earns its place:** the first fight; the racks are the first spears.

### The great hall (the keep's west room)

Fourteen by ten inside: a flagstone floor, two long trestle tables with benches, the **high table on a dais** at the east end with the lord's chair, a **three-wide hearth** in the north wall (a new `hearth_grand`, three tiles, the hall's light), banners on every wall, a **dragon skull** over the great door (a wall prop; the one fantasy flourish of the room and the thing people will screenshot), rushes on the floor (authored decals). The dead in here are in finery: the lord's family and guests, a dozen, among tables still laid with the feast (plates, cups, a roast: decoration props on the tables, which means props on top of props, `10-engine-asks`; or the table art drawn laid, which is the cheap answer). **Earns its place:** the biggest lit room on the map, the one `05` says will want the hearth-radius cap; the feast's food is loot (bread, cheese, a ham, wine: new items); the lord's chair is a chair.

### The solar and the bedchamber (the keep's east rooms)

Carpet over stone (rugs as flat props, `30` section 12 under step 5; carpet as an autotile was cut on 2026-10-12), a **tapestry** on each wall (edge props), a writing desk with a **ledger** (a book item: the steward's accounts, the first text in the world for the story later), a chess board, a lute, a cushioned chair. The bedchamber: a four-poster bed (a 2 by 2 prop, the first four-tile footprint, `10-engine-asks`), a chest with the lady's dresses (the dye system: dyed garments as loot, the dress from `25`), a mirror, candles. **Earns its place:** the comfort set: the good bed, clothes and dyes you cannot get elsewhere, the ledger.

### The kitchen block (north-west, attached to nothing: the servants crossed the yard)

Three rooms: the **kitchen** (a wide hearth with a spit, two tables, hanging pots, a cooking station once `22` builds one, sacks of flour, knives), the **bakehouse** (a bread oven: `oven`, a fire kind that burns wood and cooks bread specifically, lights little; the oven mouth in the shared wall), the **larder** (barrels of ale, cheeses, salt pork, onions in strings: the biggest food cache on the map, behind one door). **Earns its place:** food, the cooking station's natural home, the oven for bread.

### The herb garden

Twelve by ten of farm soil inside a hedge, with the **herb crops** (new gatherables: sage, yarrow, feverfew, nettle; three stages each, same recipe as the crops): the ingredients `05` names for the infection's cure, which is found beyond the valley (`02` 2026-10-19). A gardener's shed with a hoe, a watering can, seeds. **Earns its place:** the only cultivated herbs in 1.0; the witch's are wild.

### The pleasure garden

A lawn with a fountain (a 2 by 2 prop with a water texture inside, not a fire but it could flicker), a bench, a statue of the old lord. The hedge maze that stood south of it was cut on 2026-10-12 (`02`; what the page said of it is in `docs/history/29-world-ideation.md`). **Earns its place:** it is pretty from above, which no roof will ever hide.

### The barracks and the armoury (south-west)

The barracks: eight beds in two rows, chests at their feet (clothes, bandages, dice), a table, a brazier. The **armoury** through a door shut and boarded from inside (`30`, step 5; locked doors and keys were cut on 2026-10-12, so the boards are the lock): six **weapon racks** (containers with fixed loot: swords, maces, halberds, spears, bows, arrows, shields; the `fixed` loot kind the dev chest uses), a grindstone, a barrel of pitch. The dead here are soldiers. **Earns its place:** the weapon supply of 1.0 until the smith's loop exists, gated behind the densest dead and a boarded door.

### The chapel

A nave with three pairs of pews, an altar with candles (the first `candle` fire kind: tiny, `07`'s "one more row"), a lectern with a **book of hours** (a book item), a font, a vestry with a chest of vestments. Stained glass? No glass in this village (`06`); the chapel's windows are tall shuttered ones. **Earns its place:** candles, a quiet room with one door, the priest's cousin for the story.

### The stables, the kennels, the smithy

The **stables** against the east wall: eight stalls (stall partitions as a low wall material, `wall_fence_low`, sight passes), straw, a hay rack, saddles on pegs, no horses (the horses are gone, which is scarier than horses). **The kennels** beside: three pens of fence, empty bowls. **The castle smithy** by the gatehouse: an enclosed room (a bed, a chest) and an **open forge** under posts whose fire is cold (the second smithy's fire was cut on 2026-10-12: the smith's loop lives in the village's smithy, `30` section 6), the anvil, a quench barrel, a grindstone, a coal store. **Earns its place:** charcoal from the coal store, iron scrap from the armoury's broken gear, and a smithy's look at the garrison's end of the map.

### The towers

- **North-west, the watch**: a brazier, a ladder against the wall, a horn on a peg, a bed, a view through its slits up the river. The lookout.
- **North-east, the wizard's study**: bookshelves (wall props), a desk, a scorched circle on the floor (an authored decal), a stand with **the staff of fire** on it and **the book of fire** open on the desk (both items exist, art and all, `24`; this room is where they come from), jars, a skull, a stuffed crow. (Corrected, `02` 2026-10-19: the wizard is alive, a teacher, #181, so his body and the door barred from inside are gone; where he lives is for the map.) **Earns its place:** the magic items of 1.0 come from one room, and the room says why they exist.
- **South-west, the dungeon**: three cells behind `wall_bars` with their doors open, chains on the walls, a rat? (no animals), a prisoner's bones. One cell holds the dead jailer.
- **South-east**: the treasury that stood here (coin, silver cups, a crown, a strongbox) was cut with coin on 2026-10-12 (`02`; what the page said of it is in `docs/history/29-world-ideation.md`); what the fourth tower holds is open until step 5 is scoped.

### Dressing the whole

- Authored decals: straw, soot, rushes, the scorched circle, wine stains on the hall's floor, cart ruts.
- Carts: one in the bailey by the kitchens (a 2 by 3 prop, a container), one overturned on the bridge.
- Banners on the walls inside; shields hung on the hall's walls; antlers over the barracks door.
- The well in the bailey (the castle's water) and a trough beside it.
- Braziers at the wall foot, torch brackets in the gatehouse, the chapel's candles: all unlit when you arrive. Lighting the castle is a choice with consequences (the lure), and a lit castle seen from the village across the water at night is the image.

## What the castle asks of the engine

`30`, section 12, is the one engine list: under step 5 ~~the taller walls verified (the cap redraw, the hit tests, the arrow's scan)~~ (withdrawn 2026-10-26, `52`), larger prop footprints, wall-hung props beyond the bracket, rugs as flat props, the hearth-radius cap for the hall, props with a prompt label; under step 6 the dead placed down and rising; the fire kinds are data (`07`'s table) and fixed loot per container exists (the `fixed` table kind). What was cut is listed there too.
