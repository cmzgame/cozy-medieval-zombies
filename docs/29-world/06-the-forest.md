# 29.06 — The forest

**Status, 2026-10-18: the quarry, the iron workings, and the charcoal burners are built (#196, #197: both are places in the valley, with their huts, their dead, and the pickaxes and ore they hold; the cliffs are `wall_stone` until `wall_cliff` is drawn); the rest is not built; `30`'s step 6, the forest places, one a session** (the woodcutters, the witch, the quarry, the charcoal burners, the iron workings, the hunter's lodge, the bandit camp, then the hooks, the barrow first). The rest of this page is not in the valley: the forest round the village is the scatter alone, and no clearing, place, or path below that is not named above is placed. Michael's rulings that touch it (`02`, 2026-10-12): the willow's eyes are cut (the plain willow stands at the mere), fishing is later with the waters placed as if yes, deer come with the animals (step 8). The engine's side is `30`, section 12, under step 6 (mining, the dead placed down and rising, containers on trees and stacks, authored decals); the art is `09`, requests 2.3 and 3.2. Multiplayer is live (`31/08`): each place is data, and a stack that gives, a clamp that smokes, or a watcher that turns is built for a guest in the same commit.

## The forest as a place

Michael's first rulings on the forest still stand (`02`, 2026-10-09): more forest than plains, big trees that overlap, density that wanders from thicket to one tree in six, trunks that block and canopies that do not, and a wood you can lose the dead in. This plan does not change the scatter; it gives the scatter a shape and puts things in it.

- **Belts, not a frame.** The forest comes right up to the farms' fences and the village's back gardens; there is no mown margin round the places (a one-tile padding only). Between the places the belts are 20 to 60 tiles deep, and the belts are where the small places sit.
- **Clearings by rule and by hand.** The scatter's noise already makes thin patches; a few authored clearings (a `reserve` rect of grass with no scatter, or a low-density scatter rect) hold the small places and give the forest rooms: the woodcutters' felled ground full of stumps, the charcoal burners' black circle, the stones' ring, the mere's shore.
- **Rides.** The roads through the forest get a one-tile verge on each side with no trees (a reserve beside each road feature), so a road reads as a cut through the wood and the canopy does not close over it. Off the roads, paths one tile wide get no verge: the trees close over them and a path through the thick is the spooky walk.
- **Kinds by place.** The harvest mix stays everywhere (`square.json`'s zone), with authored leanings: spires thicker in the north woods (the quarry's conifer slope), oaks and reds round the village, yellows along the river banks, the one yew in the graveyard (a green spire), the willow at the pond and the mere, apple trees only in orchards. A leaning is a second scatter rule with its own weights over a rect; nothing new.
- **The wild beyond the bounds** stays exactly as now: harvest forest by hash, the odd big rock, zero to two of the dead per chunk, forever.

## The small places

Each is a screen or less, a destination with one reason to go, placed a screen or two past the last field so going there is a decision. In clockwise order from the north-west.

### The mere and the witch (north-west)

The biggest still water, dark, with a **willow** on its east bank whose hanging curtain hides a pair of eyes at night (the drawn `tree_willow_L_blue_eyes`, the one gloom-register piece this plan allows inside the bounds, because it is a joke about a tree, not a zone). On the shore, **the witch's cottage**: two rooms (a living room with a hearth and a **cauldron** on it: the brewing station, `05`'s "mushrooms and brewing as a fair way to mitigate" infection; a still-room with **drying racks** of herbs on the walls, jars on shelves, a stuffed toad, a broom), a **herb and mushroom garden** behind a wattle fence (wild herbs, three kinds, the same gatherables as the castle's herb garden but fewer and wilder; a bed of toadstools), a **shrine to the old gods** under the willow (a stone with offerings: a candle fire kind, a bowl, a bone), jack-o'-lanterns on her gateposts, a **scarecrow** in the garden (hers is dressed better than the farm's), a **black cat** someday, a rowing boat pulled up on the shore (a container: a net, a fish). **The witch is alive**, "stays", and has lines about the dead that are the first dark-fantasy voice in the game. Not a villain; the hedge witch of every village, the one who knows what the bite is. **Earns its place:** the cure's station and the mushrooms, the second magic room after the wizard's study, and the walk to it along the brook.

### The bandit camp (north-west woods, off the north lane)

A clearing with three **tents** (2 by 2 props, each a container: a bedroll, stolen goods), a campfire ring (the existing campfire), a **cage** (a 2 by 2 barred box with a door: a prisoner, alive, the villager you free who then follows, when following exists; until then a dead one), a spit, a stolen cart, a chest buried under a tree (a flat prop, "dig here"), and the bandits: six of the dead in leather and hoods with the first **leather armour** when armour exists, a bow and a quiver on one (the hunter's cousin), knives. The camp's dead are the first of the dead who were bad people. **Earns its place:** the bow and arrows in quantity, leather, a knife, the prisoner.

### The quarry (north-east, up the track from the weir)

A **cliff face** on three sides (a new wall material, `wall_cliff`: a rock face, 128 px tall, opaque, no openings, built as edges like any wall, so the quarry is a room with no roof and one way in), a floor of bare rock and rubble (a new earth kind, `rubble`, or `ground_rock`), **cut stone** stacked in blocks (containers: the stone item of `13`'s pinned stone wall), **mineable rocks** in quantity (the four drawn rocks; mining is `02` question 27's open half: the pickaxe hits a rock, the rock gives stone and goes, or stays), a crane (a tall prop: a post with a jib and a rope), a quarryman's hut (one room: a pickaxe, a hammer, wedges, a bed), a flooded pit (a 4 by 4 water in the rock), a wheelbarrow (carried on the head like a barrel since 2026-10-15, `data/sprites/wheelbarrow.json`). **Earns its place:** stone, the material stone walls wait for; the only cliffs on the map.

### The hermitage (north-east, between the quarry and the castle)

A **ruined chapel**: stone walls fallen to stubs on two sides (the stubs art the agent drew and shelved, `docs/art/09`, as a `wall_ruin` material: low, sight passes, blocks bodies), the other two walls standing with an empty window arch, a **cracked altar**, ivy decals on the walls (edge props), a **hermit's cell** behind it still roofed (a one-room stone hut: a bed, a cross, a book of prayers: a book item, a candle), a spring, a **cross on the path**. The hermit is dead in the cell with the door barred. **Earns its place:** the quiet; a book; the first ruin, which is the look the whole gloom zone will wear later, shown once.

### The woodcutters' camp (east, on the forest road)

Three **log cabins** (the log wall material is drawn: one two-room cabin for the family, two one-room huts), a **sawpit**, **log stacks** and **plank stacks** along the road (containers: the biggest wood store on the map; or the stacks are props you take logs from with `E`, like a tree that is already down), **stumps** everywhere (a prop: a felled tree's base, decoration or a gatherable that gives a log with an axe; a stump is also a thing to sit on), a **felled trunk** across a stump (a 1 by 3 prop), a woodshed, a grindstone, a pile of brush, axes in a block. Two **woodcutters alive** (a parent and a grown child, with lines). The **old road** continues east from here as a one-tile track to the **waystone** at the bounds, where the forest closes in: the gloom's door. **Earns its place:** logs and planks by the hundred without felling, the second place with living people, the road east.

### The charcoal burners (east, south of the woodcutters)

A black clearing (an earth kind, `ash`, or the soot decal in quantity): three **charcoal clamps** (2 by 2 mounds, smoking: a fire kind that burns slowly and lights almost nothing, with a smoke particle: `fire.js` has smoke), a **turf hut** (a one-room hut with a turf roof? no roofs; a hut), sacks of **charcoal** (the forge's fuel in `22`: a new item), a wheelbarrow, a rake. The burner is dead by his fire. **Earns its place:** charcoal, and smoke seen above the trees from the castle's postern.

### The iron workings (east woods, past the charcoal burners)

A **mine mouth** in a low cliff (`wall_cliff` again, with the mouth a 2-wide door variant that is a black opening and goes nowhere in 1.0: the door is authored `broken` so it is an opening, and a `wall_cliff` edge two tiles in closes it; or the mouth is a prop in front of a plain cliff), a **spoil heap** (a mound prop), **ore rocks** (the four rocks with rust streaks, a variant set: iron when mining exists), a tramway of planks (a laid floor), an ore cart (a 1 by 2 prop, a container), a **miners' hut** (two rooms: beds, a lamp, a pickaxe, a crate of ore), a winch. The miners are dead in the hut. "Something is in the mine" is the hook for a later level below ground (`05`, upper floors and basements), and in 1.0 nothing comes out of it but the ordinary wild trickle. **Earns its place:** ore, pickaxes, the hook.

### The hunter's lodge (east, between the castle and the ford)

A one-room **lodge** of logs with antlers over the door, a **smoking rack** (a fire kind that burns little and cooks meat slowly), a **skinning frame**, snares hung on the wall (a snare item: traps are `05`'s animals, someday), a **bow and two quivers** (the second bow of the map), a hide bed, a **hide of pelts** on the floor (a rug prop), and in the trees around it a **hunting hide** (a 2 by 2 platform prop you stand on? no height: a screen of branches, a wall material of woven brush: `wall_wattle`, sight passes partly). The hunter is alive, the one villager who could in theory fight and by the ruling never does; a good character for the lines. **Earns its place:** the bow, arrows, the smoking rack, and a villager who knows the woods.

### The standing stones (west woods, at the west road's end)

A ring of nine **standing stones** (props, 1 by 1, 80 to 112 px tall, lichened, no outline: not gatherable; or outlined and interactable with nothing to give, which is the wobble law's edge case) on a mown circle, a fallen tenth, a **cup-marked stone** at the centre (a flat prop), the road ending at its edge and a path going on west into nothing. Nothing happens here in 1.0. At night the stones are the one place the fog's dusky purple is allowed to be a little stronger (a zone tint later; in 1.0 nothing). **Earns its place:** the strangest screen on the map, and a thing for the story to come back to.

### The barrow (south-west woods, off the south lane)

A long **mound** (a big flat prop, 6 by 4, grass-topped, or a laid floor of a new `ground_mound` kind with a shaped outline) with a **sealed stone door** at its east end (a prop, two slabs, a prompt: "It does not move."), a ring of small stones, a dead tree beside it (a new tree kind: bare, grey, the only one in the harvest wood, `docs/art/02`'s "fourth tree shape"), crows (decals). The dead near it stand still and face it, which is the only direction the map gives them (a prop with a `lure` of zero and a `facing` for placed zombies). In 1.1 or 2.0 the door opens. **Earns its place:** the hook for the dungeon under the ground, bought for one prop.

### The gallows tree and the crossroads (the drove, south of Hollow Farm)

Where the drove bends toward the ford, a big dead oak with a rope (the dead tree kind with a rope decal or a hung prop), a **wayside shrine** with a candle, a signpost, a milestone, and a **tinker's cart** overturned in the ditch (a container: pots, a knife, needles, a bell). The cosy road's one grim corner, which is what every medieval road had.

## What the forest gives the loop (`08` has the whole table)

Logs (anywhere, by felling; stacked at the woodcutters), planks (the woodcutters, the joiner), charcoal (the burners), stone (the quarry), ore (the mine), herbs and mushrooms (the mere, the forage rule, the clearings), berries (a new gatherable: **bramble** bushes at the forest's edges and clearings, outlined, with berries in season), sticks (the per-tree rule, already), arrows and bows (the hunter, the bandits), water (the brook, the river, the mere), and the things you cannot get anywhere else: the cure's cauldron, the willow, the stones.

## Dressing the forest

- Stumps and felled trunks near the woodcutters, thinning with distance; a few anywhere.
- Hollow trees as containers (a giant oak with a hole: one in five giants, a `container` on a tree definition: an owl's nest, a squirrel's hoard, a dead man's purse).
- Brambles at edges, mushrooms in the deep (the forage rule's `near` already does it), flowers in the clearings (the data fix `15` notes: `"where": "any"` for a clearing's rect).
- Deadfall: a fallen branch across a path (a prop that blocks until you chop it: a gate you open with a hatchet), a rockfall on the quarry track.
- Birds and beasts: none. A deer skeleton, a fox's den (a hole decal), an owl on a stump (decoration, no animals promised).
- Weather: none, and fog decals at the mere at dawn, which is a decal rule on a rect with a time of day (`10-engine-asks`, small).
