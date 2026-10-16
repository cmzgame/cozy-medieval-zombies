# 29.04 — The village

**Status, 2026-10-16: built in step 1 of `30`** from this plan, through the generator (`tools/mapgen/valley.py`): twenty sets, 25 buildings, 43 rooms on the day it was built and 45 with every chunk grown on 2026-10-16 (`map.roomCount()`), 40 of the dead, 7 villagers (the record of the build is `docs/history/30-as-built.md`, step 1). This page stays as the record the generator was written from; where its counts and the build differ, the build is right, and the note over the table at the end says how. Not built from this page: the mill (step 4), the tannery (cut until the animals bring it back), the rising (the graveyard's eight stand), signs, carpets, wall props, decals, and every low wall and hedge, which are `wall_fence` until drawn; the furniture and stations without art are labelled boxes. Your cottage (`07`'s option A, built in step 0) is the section after the cottages.

Working name: none yet; Michael names it. On the west bank, about 64 by 80 tiles, from the graveyard at the top to the cottages at the bottom, the river on its east. Every building has at least two rooms unless it is a shed, and most have a yard, because a village of square one-room boxes was the one thing the brief forbade.

## The plan

One character is two by two tiles; the top-left is world (56, 84). `=` cobble, `-` dirt, `~` the river, `+` the bridge, `W` the well, `,` the green, `o` the duck pond, `g` the graveyard, `C` the chapel, `p` the priest's house, `M` the manor, `N` the merchant's house, `I` the inn, `S` the smithy, `J` the joiner, `V` the weaver, `K` the baker, `t` the toll house, `c` cottages, `P` the player's cottage (`07`'s option A, folded in below as "Your cottage"). The mill is north of this plan, on the river at (108, 54).

```
     0       16      32      48
   0 .........gggggggggggggggg.......
     .........gggggCCCCCCggggg.......
     .........gggggCCCCCCgpppp.......
     ..........-...CCCCCC.pppp.......
     ..........-...CCCCCC.pppp.......
     ..........-...CCCCCC.pppp.......
     ..........-...CCCCCC............
     ..........-......=..............
  16 ..........-......=.MMMMMMMMM....
     ..........-......=.MMMMMMMMM....
     ........NNNNNN...=.MMMMMMMMM....
     ........NNNNNN...=.MMMMMMMMM....
     ........NNNNNN...=.MMMMMMMMM....
     .cccc...NNNNNN...=.MMMMMMMMM....
     .cccc...NNNNNN...=.MMMMMMMMM....
     .cccc...NNNNNN...=.MMMMMMMMM....
  32 .ccccVVVVVVV.....=.MMMMMMMMM....
     .....VVVVVVV.....=...IIIIIIIII..
     .....VVVVVVV..======.IIIIIIIII..
     .....VVVVVVV..======.IIIIIIIII..
     .....VVVVVVV..==WW==.IIIIIIIII..
     --------------==WW===IIIIIIIII=+
     .........KKKK.======.IIIIIIIII..
     .cccc....KKKK.======.IIIIIIIttt.
  48 .cccc....KKKK........IIIIIIIttt.
     .cccc..JJJJJJ....-..........ttt.
     .cccc..JJJJJ,,,,,,,,.SSSSSS.....
     .......JJJJJ,,,,,,,,.SSSSSS.....
     .cccc..JJJJJ,,,ooo,,.SSSSSS.....
     .cccc..JJJJJ,,,ooo,,.SSSSSS.....
     .cccc..JJJJJ,,,ooo,,.SSSSSS.....
     .cccc.......,,,,,,,,.SSSSSS.....
  64 ............,,,,,,,,............
     ....-----------------------.....
     ..cccc.cccc.cccc.ccccPPPPPPP....
     ..cccc.cccc.cccc.ccccPPPPPPP....
     ..cccc.cccc.cccc.ccccPPPPPPP....
     ..cccc.cccc.cccc.ccccPPPPPPP....
     .................-...PPPPPPP....
     .................-...PPPPPPP....
```

The letters are blocks, not footprints: each block holds the building, its yard, its garden, and its padding ring. The buildings themselves are described below with their rooms.

## The square and the green

- **The square**: twelve by twelve of cobble (the current square's size, which Michael has walked and liked) with the **well** at its centre and a horse trough beside it; the **market cross** (a stepped stone prop, 1 by 1, tall) at the north end; four **market stalls** along the north side (2 by 1 props with striped awnings, each a container: one of vegetables, one of cloth, one of pots, one of knives; their traders dead beside them); the **notice board** by the inn's door (a prop with a prompt; empty in 1.0, the quest board of 1.1); the **stocks** at the south-east corner. The high street runs through it east to the bridge, the nobles' street leaves it north, the west road leaves it west, and the green opens off its south side.
- **The green**: an open lawn south of the square with the **duck pond** in its middle, the **willow** on the pond's bank (the drawn one, `docs/art/02`), a **maypole** (a tall post with ribbons, the cosy counterweight to the stocks), two benches, a woodpile, geese someday. The south lane leaves its bottom edge. The green is where the villagers' routines will cross (`04`), and the one wide-open space in the village, so a crowd of the dead on it is a sight you can read from your door.

## The inn (the square's east side)

The biggest house in the village and the map's refuge. A **taproom** with a **bar counter** (a 3 by 1 prop with barrels behind it), a long hearth, six tables with benches, a dartboard, a lantern over the door, **windows boarded from the inside** when you first see it; a **kitchen** behind the bar with its own hearth, a cooking station, a larder; a corridor with **three guest rooms** (a bed, a chest, a candle each) and the **innkeeper's room**; a **yard** behind with a woodshed, a privy, a stable for the coach (empty), a cart, the inn's own well. **Inside, alive: the innkeeper and two or three villagers** (`08`), which is the story the map tells before any story exists: they barred the door and lived. **Earns its place:** beds (sleep wants a sealed room, `03`; the inn's rooms are the first ones you can seal), the biggest kitchen on the west bank, the villagers who will become the vendors and quest-givers of later, and the lit windows at night that pull the dead to the square instead of to your house.

## The chapel, the graveyard, the crypt

- **The chapel** at the top of the nobles' street: a nave (pews, an altar with candles, a lectern, a font), a vestry, and a **bell tower base** (a square room at the west end with a bell rope: the dawn bell of `04`'s routines, a noise when noise exists). Stone walls, a tiled floor (`floor_tile`, a new laid floor: glazed red and cream, the chapel's and the manor's). The priest's door was **barred from inside**; the priest is alive in the vestry, or in the crypt, and says the bell has stopped.
- **The graveyard** behind it, thirty by eighteen, inside a low stone wall (`wall_stone_low`, sight passes) with a **lychgate** on the street (a roofed gate: the gate is a door in the low wall, the roof two posts and a cap, a prop): rows of **headstones** (props in four shapes, interactable? no: decoration, no outline; or a few that are containers with a bone and a ring), a **yew** (the one evergreen: the green spire tree stands in), an **open grave** or two (a 1 by 2 flat prop, a dark pit with a shovel beside it: the dead got out), and **the rising**: eight of the dead placed lying among the graves as corpses that stand up when you come close (today a zombie placed `down` and idle; the "rise when near" is a small behaviour, `10-engine-asks`, or they simply stand there, which is also fine). **The crypt**: a four by four stone annex at the graveyard's corner with a barred door, stone coffins (2 by 1 props, containers: grave goods, a sword with a dead knight), candles. **Earns its place:** the spooky set piece of the village; the shovel (a tool of `22`); the crypt's knight's sword.

## The trades

Each is a shop and a home: the workshop on the street, the living room and bedroom behind, a yard. They are the homes of the stations `22` plans, so each station has a place that explains it.

- **The smithy** (south-east of the square, by the river so the dead on the bridge are its view): the **forge** (an open-fronted room: three walls and posts) with the forge fire, the **anvil** (the smith station), a quench barrel, a grindstone, bellows (a wall prop), a coal bin, tongs and hammers on the wall, iron bars in a rack; behind it the smith's two rooms. The smith is dead at the anvil, in a leather apron. **Earns its place:** the smith's loop (`22`): weapons and tools from iron and charcoal; the only other anvil is the castle's.
- **The joiner** (the carpenter and wainwright, south-west of the square): a **workshop** with the **workbench** (the crafting station), a sawbench, a lathe, shelves of pegs and planks, a half-made chair; a **lumber yard** behind with a sawpit (a 2 by 1 flat prop with a saw in it), stacks of logs and planks (containers: the village's plank supply), a cart without wheels; two rooms behind. **Earns its place:** the crafting station's home, planks for boards, the wheelbarrow (`22`) is a thing he made, parked in the yard.
- **The weaver** (west of the square on the west road): a **loom** (a 2 by 2 prop, the cloth station: cloth from wool and flax, bandages from cloth, clothes from cloth), **dye vats** (three 1 by 1 props in the yard, each a colour: the dye station of `19`'s dyed entry), a spinning wheel, bolts of cloth on shelves, a drying line across the yard (ropes as edge props between two posts); two rooms. **Earns its place:** bandages, clothes, dyes; the only loom.
- **The baker** (north-west corner of the square): a bread **oven** (the fire kind) with its mouth in the shop's wall, a kneading table, sacks of flour from the mill, loaves on a shelf (loot: bread is the staple), a honey pot; one room behind. The baker is dead in the flour. **Earns its place:** bread, the second oven on the west bank, the flour loop's end (grain at Long Acre, flour at the mill, bread here).
- **The mill** (north on the river, by Long Acre): the **mill house** with the **millstones** (the milling station: grain to flour), a hopper, sacks, the wheel's axle coming through the wall; the **wheel** itself in the river against the outer wall (a tall animated prop, 1 by 2 on the water's edge, four frames, turning: the one moving thing in the landscape besides water); the miller's house with two rooms; a granary (a 3 by 3 store on staddle stones, sacks of grain); the weir across the river. **The miller is alive** and dusty. **Earns its place:** flour; the weir crossing; the wheel.
- **The tannery** (downstream, south of the village on the towpath, because it stinks): pits (flat props), hides on frames, a scraping beam, one room. Leather for armour is `05`-someday; in 1.0 the tannery is a loot stop (leather scraps, a knife) and the place the towpath goes. **First on the cut list among the trades.**

## The nobles

Three stone houses with floors you do not see elsewhere, the carpets and decorations Michael asked for, and the loot to match.

- **The merchant's house** (west of the nobles' street): stone walls, a tiled hall with a **carpet**, a parlour with a **cabinet** (glass? no: a cupboard) of pewter and a **map on the wall** (a wall prop; the map of the realm, which 1.1's travel can point at), a **counting room** with a desk, a strongbox, the ledgers; a kitchen; two bedrooms with the good beds; a **walled yard** with a cart, a **storehouse** (the biggest container in the village: trade goods: cloth, salt, spices, candles, lamp oil, seeds of every crop) and a **stable**. The merchant and his wife are dead at table; the apprentice is alive in the storehouse (`08`). **Earns its place:** seeds, salt, candles, the strongbox, the map.
- **The manor** (east of the nobles' street, backing on the river): the lesser lord's town house inside a **walled garden** (a stone wall with a gate on the street, a gate to the towpath): a **hall** with a hearth, a long table, a carpet, tapestries, a boar's head (a wall prop); a **solar** with a window seat, a chess board, a lute; a **private chapel** (one pew, an altar, a reliquary: a box with a bone, which the story later will want); a kitchen and a buttery; three bedrooms; the **garden**: a lawn, a **knot garden** of low hedges (`wall_hedge_low`, sight passes), an **arbour**, a **dovecote** (a tall round prop, 1 by 1), **beehives** (three props, honey when there are bees), a fish pond (2 by 2 water in stone, with a laid stone rim). The family fled; the house is dark, the dead few, the loot untouched. **Earns its place:** the second-best beds, the chess board, honey later, the knot garden to look at, and a quiet stone house with one gate: the second-best base after the croft.
- **The reeve's house** (the end of the row of cottages by the green, bigger than its neighbours): stone below, timber above (the wall materials cannot mix on one edge, so stone on the back wall and wood on the front, with the material-change posts the art already handles), a parlour with a rug, a bedroom, a kitchen, an office with the village's **tally sticks** and a **key ring** (keys to the lychgate and the storehouse, if locks come). The reeve is alive, old, and "stays". **Earns its place:** keys, and the villager who knows everyone.

## The cottages

Eight, in three plans so they do not repeat, each with a garden strip (a 3 by 4 farm plot of cabbages and garlic, a herb bed, a woodpile, a privy, a chicken coop with no chickens), a fence or a hedge, and a path to the lane:

- **Plan A, the two-room**: a living room with a hearth, a table, a bench, and a bedroom with a bed and a chest. Four of these.
- **Plan B, the long house**: one long room with the hearth at one end and the **byre** at the other, a low wall between (`wall_fence_low`), straw in the byre half, a goat? (no animals; a manger). Two of these, at the village's edges, the poorer houses.
- **Plan C, the L-shape**: a living room, a bedroom, and a lean-to workshop at the back (one is the cooper's: barrels and hoops; one is the chandler's: tallow and wicks, the candle supply, `05`'s candles).

The **toll house** by the bridge is a one-room cottage with a barrier across the road (a `wall_fence` gate: the first gate the dead find shut), a lantern, and a strongbox of pennies. The toll keeper is dead on the bridge.

## Your cottage

Built in step 0 of `30` (`02`, 2026-10-12: the end cottage is the home): the last cottage before the south lane leaves the village for Hollow Farm, on the plan's `P` block at (98, 212): a living room and a bedroom through a partition, a hearth, a table and two chairs, a bed, two chests and a shelf, a plot of potatoes and cabbages at mixed stages, its own well (the only cottage with one; the reason it is yours), a barrel and a woodpile, a fence with two gates on the lane; the spawn is the bedroom at (104, 216), 08:00 on day one. It is Stardew's start (a small house, a plot, a village a minute away) and Zomboid's (a door to board, a window to shutter, the dead a street away), thirty tiles from the square, forty from the farm, sixty from the bridge. Not built: the pumpkin by the door, the herb bed, the privy, the lean-to (the first place for a workbench), and the home chest's fixed kit (the hatchet, three planks, a bandage, seeds of the garden's two crops; the chests open with the chest's loot). The developer chest is a setting placed by the spawn (`devChest`, on while in development), not a thing on the map.

The two homes the plan offered instead stay as the places a player discovers they could move to: **the toll house by the bridge** (one room, a barrier across the road, the castle in view: the most Zomboid start, whose first fight at the bridge's knot would come before the first harvest) and **the croft across the ford** (`05`: the safest base, the reward of understanding the river, and the shepherd lives there). The next survivor after a death arrives beside the spawn for now (`31/09`, New character), not at either or at the inn (`30`, 3.5). The lane's neighbours are built as the plan had them: one cottage with its door kicked in, one shut with a neighbour inside who will not open ("Go away."), and the reeve's house at the green's corner with the old reeve alive. The page this came from, with the first ten minutes the map should offer, is `docs/history/29-world-ideation.md`.

## Dressing the village

- The dead: a dozen on the streets and the square, a knot of six at the bridge's village end against the toll gate, the graveyard's eight rising, the smith at his anvil, the baker, the traders at their stalls, the merchant and his wife, the toll keeper. In the clothes of their trades (aprons, the baker's cap, the merchant's finery: wardrobes).
- The barricades: the inn's windows boarded from inside (the boards exist); a cart across the bridge; the chapel's door barred; a cottage with its door broken in (a broken leaf is a state the engine has).
- Signs: a painted sign on a bracket outside each trade (an edge prop: a boot, a loaf, a horseshoe, a shuttle, a tankard), which is how a player reads the village without text.
- Lights: a lantern on a post at the square's corners (the torch post exists), a lamp over the inn's door, candles in the chapel; all unlit but the inn's, whose lit windows are the village's only light on the first night and the thing that keeps the dead off your street.
- Authored decals: cobble worn to dirt in front of the smithy and the inn; straw outside the stable; a trail of dropped apples from an overturned basket at the stalls; cart ruts on the high street beyond the cobble's end.

## A count

The plan's count, as written before the build. As built (step 1; `docs/history/30-as-built.md`): twenty sets, 25 buildings, 43 rooms on the day (45 with every chunk grown on 2026-10-16, `map.roomCount()`), 295 props, with the mill (step 4) and the tannery (cut) not among them; the inn, the manor, and the merchant's house were generated with fewer rooms than the rows below give them, and the generator's buildings are its rects (the inn, the merchant's house, the joiner, the smithy, and the chandler's house are two each; the crypt and the priest's house stand alone), so neither column below matches the build. The stations placed are the workbench, the anvil and forge, the oven, the loom, and the dye vats, as labelled boxes; the millstones wait for the mill.

| | Buildings | Rooms | Stations | Containers (about) |
|---|---|---|---|---|
| the square and the green | 0 | 0 | 0 | 6 (stalls, the trough, the woodpile) |
| the inn | 1 | 7 | 1 (cooking) | 14 |
| the chapel, graveyard, crypt | 3 | 5 | 0 | 8 |
| the trades (six, with the mill, without the tannery) | 7 | 16 | 6 (smith, workbench, loom, dye vats, oven, millstones) | 30 |
| the nobles (three) | 3 | 16 | 0 | 24 |
| the cottages and the toll house | 9 | 18 | 0 | 27 |
| **the village** | **23** | **62** | **7** | **about 110** |
