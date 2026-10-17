# 29.02 — Water and roads

**Status, 2026-10-16: built in steps 0 and 1 of `30`:** the river, five wide with a dirt bank of one (no shingle or mud kind yet); the stone bridge on the high street at row 158, laid stone until `floor_bridge_stone` is drawn, with no parapet; the ford at (132, 206), `floor_water_shallow` seven tiles by three; the duck pond on the green; the roads' skeleton (the high and west roads, the bridge road, the square, the nobles' street, the south lane, the lane, the drove). **Water stops every walker** (`30`, law 8), shallow water is half speed for all, and drinking and filling work at any water beside you (`check("water")`). Built since (#201): the brook along Long Acre's north edge (two wide, a fishing table of its own), the plank footbridge on the lane to the mere (one tile wide, laid wood until `floor_bridge_plank` is drawn), the farm pond, the north lane to the mill and the farm lane into Hollow Farm's yard. Not built: the weir, the millpond, the mere, the moat, the castle's bridges, gravel, and the road furniture and wear. The art this page wants is one list, `09` request 3.1; the engine's side is `30`, law 8 and section 12.

## Water

The brief: at least one river with a bridge and at least one pond. The plan has one river, one brook, four crossings of four different kinds, four still waters, and a moat. Each is a different feel, and the kinds of crossing are the point: if water stops the dead (the first engine ask), every crossing is a place with a character.

### The river

Enters at the top edge at about x 120, runs south slightly east of centre, bulges west round the castle, and leaves the bottom edge at about x 140 (the overview in `01`). **Five tiles wide** on the straights, six at the bends, with a bank one to two tiles wide on each side. In the data it is a `water` feature (today the pond is a rect; a polyline with a width is the second engine ask) with the existing `floor_water` texture, and its bank is a new earth kind, **shingle** or **mud**, blended like dirt with the ground's rules (`15`: "a riverbank is one more terrain entry"). A sprinkle of authored decals on the bank: reeds, a stranded log, stones.

What it does for the game, in order of how much engine work each needs:

1. **A look.** Nothing needed: water is drawn today and walked on.
2. **A barrier.** Built: water stops every walker (the player, the dead, villagers) except at crossings (`30`, law 8; `check("water")`). It is what makes the river a design element and not a texture: the bridge is the one way over, and the castle's moat will be a moat.
3. **A resource.** Drink and fill waterskins at the bank, as at the well (`10`'s well rule extended to any water tile beside you). Small, and it makes the river the farms' water.
4. **Fishing.** Not in any doc; a cosy loop Stardew has and the sibling did not. A rod, a line cast at the bank, a wait, a fish item that cooks. Proposed in `08` as an option, not planned.

### The brook

From the mere in the north-west, east along the top of Long Acre, into the river at about (118, 40). **Two tiles wide**, crossed by a **plank footbridge** on the lane to the mere. It waters the grain farm and gives the north a second, smaller line the dead cannot cross. The only reason it exists is the second bridge: the footbridge is the one-tile wooden kind, and seeing it after the stone bridge is what makes the stone one feel grand.

### The crossings

| Crossing | Where | Kind | How it reads |
|---|---|---|---|
| **The stone bridge** | the village's high street to the castle approach, y 126 to 128 | three tiles wide, sixteen long; a laid floor (new `floor_bridge_stone`, flagstones with a crown) over the water with a parapet (a low wall material, `wall_parapet`, sight passes) on both sides; a lamp post at each end | the map's set piece: the one way between the village and the castle, a cart overturned on it as a barricade (an event prop), the dead piled at the castle end |
| **The footbridge** | the brook, on the lane to the mere | one tile wide, four long; `floor_bridge_plank` with no rail | the humble one |
| **The ford** | the drove, south of Hollow Farm, where the river widens | a `water_shallow` kind, walkable at half speed, wet feet; seven by three as built (`valley.py`) | the cheap crossing with a cost: slow in the open, and the dead can use it too |
| **The weir** | the mill, y 60 | the weir's crest as a one-tile line of shallow water across the river; a stone lip the water pours over | the shortcut to the quarry; a goober on a weir at night is a goober about to be bitten |
| **The drawbridge** | the castle gate, over the moat | three tiles of `floor_bridge_plank` with chains to the gatehouse (edge props); down in 1.0, raised as decoration never | the castle's threshold |
| **The postern footbridge** | the castle's east wall, over the moat | one tile wide | the back door |

### Still water

- **The village duck pond** on the green: six by six, a dirt bank, ducks someday, a willow (the willow is drawn and on file, `docs/art/02`). The cosy pond.
- **The farm pond** at Hollow Farm, below the orchard: eight by six, where the beasts drank. Reeds, a trough.
- **The mere** in the north-west woods: fourteen by ten, the biggest water, dark and still, with the witch's cottage on its east shore and the willow with eyes (the gloom willow variant) reflected in it. The spooky pond. In 1.0 it is the one place the gloomy register is allowed a toe: the water darker (a second water texture, `water_dark`), the willow, mist decals on the bank at dawn. Not blue trees.
- **The millpond** above the weir: the river widened to nine tiles for twelve tiles' length, with the mill wheel in it.
- **The moat**: a three-tile ring round the castle, joined to the river at its north-west corner so it reads as fed by it.

### The art water needs

`09-art-asks`, request 3.1 (water, banks, and crossings), is the one list; the mill wheel is in its request 1.5.

## Roads

The rule set from `15` stands: an authored surface covers its tiles, its ragged edge reaches outward, cobble lives in a dirt verge and never touches grass, a laid floor beside earth counts as that earth so a path reaches a door. Three surfaces today (dirt, cobble, the laid floors); this plan adds **gravel** for the castle's approach if Michael wants a third grade, and **mud** at the banks and in the farmyards, both one terrain entry each.

### The network

| Road | Surface | Width | Runs |
|---|---|---|---|
| **The bridge road** | cobble | 3 | the castle gate, the drawbridge, the castle approach across the water meadow, the stone bridge, the high street into the square; about 40 tiles of cobble end to end, the grandest road on the map |
| **The nobles' street** | cobble | 3 | the square's north side up to the chapel's lychgate, the merchant's house on its west, the manor's wall on its east |
| **The square** | cobble | 12 by 12 | the well in the middle, the market cross, the stalls on the north side |
| **The bailey** | cobble | all of it | with the bare earth of the gardens and the stables' yard breaking it |
| **The west road** | dirt | 3 | from the square west past the weaver and the cottages, past the Long Acre lane, into the west woods, thinning to a path at the standing stones, off the map |
| **The north lane** | dirt | 2 | from the west road north, between Long Acre's fields, to the mill; the lane to the mere branches off it at the footbridge |
| **The south lane** | dirt | 2 | from the green south between the cottages, past your door, into Hollow Farm's yard |
| **The drove** | dirt | 2 | out of Hollow Farm's yard east, past the pumpkin field and the hop garden, to the ford, across, to the croft, off the map south |
| **The forest road** | dirt | 2 | from the castle's postern north-east to the woodcutters' camp, then east as the old road, thinning to one tile, overgrown, to the waystone at the bounds |
| **The quarry track** | dirt | 1 | from the weir's east end up to the quarry |
| **Paths** | dirt | 1 | to the witch (from the footbridge), the hunter (from the forest road), the charcoal burners (from the woodcutters), the mine (from the forest road), the hermitage (from the quarry track), the bandits (a trail off the north lane), the barrow (off the south lane), the tannery (the towpath along the bank), the stones (the west road's end) |
| **The towpath** | mud | 1 | along the west bank from the mill to the tannery: the fishing path |
| **Lanes** | dirt | 1 to 2 | between cottages and gardens in the village; the farm lanes between fields |

### What makes a road feel real (none of it is code)

- **Roads bend.** A dirt road is a sequence of short rects, not one; the authoring vocabulary allows it today. The bridge road is the one straight road, because someone paid for it.
- **Roads have furniture.** Signposts at the junctions (a prop whose prompt names where each arm points; `10-engine-asks`, a `label` on a prop), milestones on the bridge road, a wayside shrine at the Long Acre junction and another at the ford (a small roofed post with a candle: a tiny fire kind, lit at night), a horse trough at the square, the stocks on the green, a gallows tree at the drove's bend (a spooky hook, no body on it), a lamp post at each end of the bridge and torch posts up the castle approach (the `torch_post` exists), a cart abandoned across the west road (the scatter rule's "overturned wagon to loot", `03`), a dead horse? No animals, so no.
- **Roads wear.** Authored decals on them (`10-engine-asks`: authored decals): cart ruts along the dirt roads, puddles in the ruts after the mud kind exists, hoof prints into the farmyards, straw blown across the yard, a patch of cobble sunk and repaired in the square.
- **Roads go somewhere and stop.** Every path ends at a thing. A path that ends at nothing is a bug.
- **Verges.** A ragged dirt verge round every cobbled surface, which the ground does by itself (`15`), and a grass verge of one tile with no scatter beside every road (a `reserve` along the road: no trees grow in the road's padding; today features have no padding, so a reserve rect beside each road does it).

### The gloom road, for later

The old road east is drawn in 1.0 exactly as the other roads, and the waystone at its end is a prop with a prompt ("The old road. Nobody goes this way now."). When the zone system comes (`05`), the zone boundary is a rect across that road a chunk past the bounds, and the wild beyond it grows the gloom biome. Nothing on the 1.0 map changes; the road just starts being true.
