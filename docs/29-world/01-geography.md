# 29.01 — The map at a glance

## Size

**Proposed: authored bounds 256 by 256 tiles, 16 by 16 chunks, 65,536 tiles.** The cut is 192 by 192 (12 chunks). The reasons for the bigger one:

- The forest has to be a place, not a frame. With the village, the castle, and the two farms taking a 120 by 150 block in the middle, a 256 map leaves a belt of 40 to 60 tiles of forest on every side, which is one to two screens at the wide zoom: enough to get lost in, lose the dead in (`02`, 2026-10-09: "forests should be a place you can lose them"), and hide the small places in.
- Walking is cheap. The player walks 3 tiles a second and sprints at 5.25 (`data/tuning.json`); the village square to the castle gate is about 55 tiles, eighteen seconds; the square to Hollow Farm's yard about 70 tiles; corner to corner of the whole map about 85 seconds at a walk. Stardew's farm alone is 80 by 65.
- The engine already pays for it. Chunks grow on demand and evict beyond eight (`23`, step 2); the ground bakes per chunk; the dead beyond 40 tiles stand still; 256 by 256 of authored tiles is 16 chunk files of run-length rows, a few hundred kilobytes. What grows with size is the authoring, not the frame.
- Beyond the bounds the wild goes on forever as now, so the map's edges are soft: the forest simply continues, and the old road east leaves the bounds and keeps going as a wild road until a later zone catches it.

If 256 feels too far between places in play, the plan shrinks by pulling the forest belts in; the places and their neighbours do not change.

## The regions

Nine regions, each a different thing to do and a different danger:

| Region | Where | What it is | The dead |
|---|---|---|---|
| **The village** | west bank, centre | the square, the inn, the trades, the chapel, the nobles, the cottages, your home | a dozen on the streets, a knot at the bridge, the graveyard rising |
| **The castle** | east bank, in the river's bend, behind a moat | the gatehouse, the bailey, the keep, the chapel, four towers | the garrison, thirty to forty, the densest place on the map |
| **Long Acre** | north-west, by the mill | the grain farm and the mill on the river | a few in the fields, the miller alive |
| **Hollow Farm** | south-west | the big mixed farm: barn, byre, orchard, pond, the pumpkin field | the farm family turned, in the yard |
| **The croft** | south-east, across the ford | a shepherd's cottage and a stone fold | nearly none: the safest base candidate, if water holds the dead |
| **The north woods** | top edge | the mere and the witch, the bandit camp, the quarry, the hermitage ruin | thin, plus the bandits' dead |
| **The east woods** | right edge | the woodcutters, the charcoal burners, the hunter, the iron workings, the old road east | thin, the mine mouth a trickle later |
| **The west woods** | left edge | the standing stones, the barrow, the old west way | thin and strange |
| **The river** | top to bottom, slightly east of centre | the water, the weir, the bridge, the ford, the banks | the dead cannot cross except where you can (`10-engine-asks`) |

## The overview picture

One character is four by four tiles. `T` forest, `.` open ground, `F` fields, `H` houses, `#` the castle's walls, `c` the bailey, `~` water, `o` a pond, `=` cobble, `-` dirt road or path, `+` a bridge, `^` the ford, `w` the weir. Letters mark places: `C` the chapel, `g` the graveyard, `M` the mill, `t` the tannery, `A` the orchard, `W` the witch, `Q` the quarry, `R` the hermitage ruin, `X` the bandit camp, `k` the charcoal burners, `L` the hunter's lodge, `I` the iron workings, `S` the standing stones, `B` the barrow. The village block (`H`) is detailed in `04`, the castle in `03`, Hollow Farm in `05`.

```
     0       32      64      96      128     160     192     224
   0 TTTTTTTTTTTTTTTTTTTTTTTTTTTTT~~TTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTT
     TTTTTTTTT..........TTTTTTTTTT~~TTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTT
     TTTTTTTTT..........TTTTTTTTTT~~TTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTT
     TTTTTTTTT..~~~~....TTTTTTTTT~~~TTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTT
     TTTTTTTTT..~~~~....TTTTTTTTT~~TTTTTTTTT.......TTTTTTTTTTTTTTTTTT
     TTTTTTTTT..~~~~WWW.TTTTTTTTT~~TTTTTTTTT.QQQQQ.TTTTTTTTTTTTTTTTTT
     TTTTTTTTT.....~W---TTTTTTTTT~~TTTTTTTTT.QQQQQ.TTTTTTTTTTTTTTTTTT
     TTTTTTTTT......WWW~-+-TTTTTT~~TTTTTTTTT.QQQQQ.TTTTTTTTTTTTTTTTTT
  32 TTTTTTTTT...........+-~~...T~~~TTTTTTTT.QQQQQ.TTTTTTTTTTTTTTTTTT
     TTTTTTTTTTTTTT.......-..~~~TT~~TTTTTTTT.-QQQQ.......TTTTTTTTTTTT
     TTTTTTTTTTTTTT.FHHHHH-HFFF.~~~~TTTTTTT--.......RRRR.TTTTTTTTTTTT
     TTTTTTTTTTTTTT.FHHHHH-HFFF.TT~~~TTTTT-TTTTTTTT.RRRR.TTTTTTTTTTTT
     TTTTTTTTTTTTTT.FHHHHH-HFFF.TTT~~TTT--TTTTTTTTT.RRRR.TTTTTTTTTTTT
     TTTTT......TTT.FFFFFF-FFFF.MMM~~TT-TTTTTTTTTTT.RRRR.TTTTTTTTTTTT
     TTTTT.XXXX.TTT.FFFFFF----F.MMM~~--TTTTTTTTTTTT....-.TTTTTTTTTTTT
     TTTTT.XXXX.TTT.FFFFF-FFFF---MMwwwTTTTTTTTTTTTTTTTT-TTTTTTTTTTTTT
  64 TTTTT.XXXX-TTT.FFFFF-FFFFF.MMMT~~~TTTTTTTTTTTTTTTT-........TTTTT
     TTTTT.XXXX.-TT.FFFF-FFFFFF.TTTTT~~TTTTTTTTTTTTTTTT-..HHHHH.TTTTT
     TTTTT......T-T....g-gggggggTTTTT~~TTTTTTTTTTTTTTTT-..HHHHH.TTTTT
     TTTTTTTTTTTTT-TTTTg-gggggggTTTTT~~TTTTTTTTTTTTTTTT-..HHHHH.TTTTT
     TTTTTTTTTTTTTT-TTTg-gggggggTTTTT~~TTTTTTTTTTTTTTT-T..HHHHH.TTTTT
     TTTTTTTTTTTTTTT-TTg-gCCCgggTTTT~~~TTTTTTTTTTTTTTT-T..HHHHH.TTTTT
     TTTTTTTTTTTTTTTT-Tg-gCCCgggTTTT~~TTTTTTTTTTTTTTTT-T..HHHHH.-----
     TTTTTTTTTTTTT....-.-.CCC......T~~T...............-T...-----TTTTT
  96 TTTTTTTTTTTTT.....--.C=C......T~~T.~~~~~~~~~~~~~~-T..--....TTTTT
     TTTTTTTTTTTTT..HHHH-HH=HHHHHH.T~~T.~############~-TT-kk-TTTTTTTT
     TTTTTTTTTTTTT..HHHH-HH=HHHHHH.T~~T.~#cccccccccc#~.TT-kk-TTTTTTTT
     TTTTTTTTTTTTT..HHHH-HH=HHHHHH.T~~T.~#cccccccccc#~.T-TkkkTTTTTTTT
     TTTTTTTTTTTTT..HHHH-HH=HHHHHH.~~~T.~#cccccccccc#~.-TTTTTTTTTTTTT
     TTTT......TTT..HHHH-HH=HHHHHH.~~TT.~#cccccccccc#~.-TTTTTTTTTTTTT
     TTTT.SSSS.TTT..HHHH-H===HHHHH.~~TT.~#cccccccccc#~-TT-TTTTTTTTTTT
     ----------------------=======+++++=+=cccccccccc#-.TTT--......TTT
 128 TTTT.SSS-.TTT..HHHHHH===HHHHH.~~TT.~+cccccccccc#~.TTTT.--III.TTT
     TTTT.SS-S.TTT..HHHHHHHHHHHHHH.~~~T.~#cccccccccc#~.TTTT.II--I.TTT
     TTTT.SSSS.TTT..HHHHH....HHHHH.T~~T.~#cccccccccc#~.TTTT.IIII-.TTT
     TTTT......TTT..HHHHH.oo.HHHHH.T~~T.~#cccccccccc#~.TTTT.IIIII.TTT
     TTTTTTTTTTTTT..HHHHH.oo.HHHHH.T~~T.~############~.TTTT.IIIII.TTT
     TTTTTTTTTTTTT..HHHHH..-.HHHHH.T~~~.~~~~~~~~~~~~~~-TTTT.......TTT
     TTTTTTTTTTTTT..HHHHHHH-HHHHHH.TT~~...............-TTTTTTTTTTTTTT
     TTTTTTTTTTTTT..HHHHHHH-HHHHHH.TT~~~TTTTTTTTTTTTT..-..TTTTTTTTTTT
 160 TTTTTTTTTTTTT.........-.......TTT~~TTTTTTTTTTTTT.L-L.TTTTTTTTTTT
     TTTTTTTTT.............-....tt.TTT~~~TTTTTTTTTTTT.L-L.TTTTTTTTTTT
     TTTTTTTTT.............-...TttTTTTT~~TTTTTTTTTTTT.LLL.TTTTTTTTTTT
     TTTTTTTTT.....HHHHHHH---..TttTTTTT~~~TTTTTTTTTTT.....TTTTTTTTTTT
     TTTTTTTTT.AAAAHHHHH--HH-F.TTTTTTTTT~~TTTTTTTTTTTTTTTTTTTTTTTTTTT
     TTTTTTTTT.AAAAHHH--HHHH-F.TTTTTTTTT~~~TTTTTTTTTTTTTTTTTTTTTTTTTT
     TTTTT.....AAAA---HHHHHH-F.TTTTTTTTTT~~TTTTTTTTTTTTTTTTTTTTTTTTTT
     TTTTT.BBBBAA--HHHH------F.TTTTTTTTTT^~TTTTTTTTTTTTTTTTTTTTTTTTTT
 192 TTTTT.BBBB--FFHHHH-HHHHFF.TTT--------^^.........TTTTTTTTTTTTTTTT
     TTTTT.BB--FFFFHHHH-HHHHFF----TTTTTTT~~---HHH....TTTTTTTTTTTTTTTT
     TTTTT.BBBBFFFFFooo-------.TTTTTTTTT~~~T.F--H....TTTTTTTTTTTTTTTT
     TTTTT.BBBBFFFFFoooFFFFFFF.TTTTTTTTT~~TT.FF-F....TTTTTTTTTTTTTTTT
     TTTTT.....FFFFFFFFFFFFFFF.TTTTTTTTT~~TT.F-FF....TTTTTTTTTTTTTTTT
     TTTTTTTTT.FFFFFFFFFFFFFFF.TTTTTTTTT~~TT..-......TTTTTTTTTTTTTTTT
     TTTTTTTTT.FFFFFFFFFFFFFFF.TTTTTTTTT~~TT..-......TTTTTTTTTTTTTTTT
     TTTTTTTTT.................TTTTTTTTT~~TTT-TTTTTTTTTTTTTTTTTTTTTTT
 224 TTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTT~~TTT-TTTTTTTTTTTTTTTTTTTTTTT
     TTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTT~~TTT-TTTTTTTTTTTTTTTTTTTTTTT
     TTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTT~~TT-TTTTTTTTTTTTTTTTTTTTTTTT
     TTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTT~~~TT-TTTTTTTTTTTTTTTTTTTTTTTT
     TTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTT~~TT-TTTTTTTTTTTTTTTTTTTTTTTTT
     TTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTT~~TT-TTTTTTTTTTTTTTTTTTTTTTTTT
     TTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTT~~TT-TTTTTTTTTTTTTTTTTTTTTTTTT
     TTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTT~~T-TTTTTTTTTTTTTTTTTTTTTTTTTT
```

The picture is a sketch drawn from a list of rectangles and lines; a road that clips a building's corner in it is a drawing flaw, not a plan. The map file will be written from the room-level plans in `03` to `06`, not from this.

## Why the places sit where they sit

- **The river splits the map into a safe-ish west and a dangerous east.** The village, both farms, the mill, and the witch are west of the water; the castle, the croft, the woodcutters, and the mine are east. If water stops the dead (`10-engine-asks`, the first ask), every crossing becomes a gate you can hold: the stone bridge at the village, the footbridge over the brook, the ford on the drove, the weir's crest at the mill. The dead east of the river stay east until they find a crossing, and the castle's garrison is a reservoir you drain on purpose, not a flood that comes to you.
- **The castle is the big reward and the big risk**, and it is in sight of the village across the water: from the square's east end you see its towers over the bridge, and at night, if anything in it is lit, you see that too (lit windows lure, `03`; portals glow, `08`). It is an invitation you can read from your doorstep.
- **The two farms frame the village north and south**, so the farming loop is a short walk either way and the roads between are the daily commute the dead will wander onto. Long Acre is the grain farm because the mill is beside it; Hollow Farm is the big mixed one because the south has room and the orchard wants the water meadow by the pond.
- **The small forest places ring the whole**, each a screen or two past the last field, so going out is always a decision (`00`, pillar: "going out is a decision") and each trip has one destination. The quarry, the mine, the charcoal burners, and the woodcutters are the raw materials of the big pass (`22`: stone, iron, charcoal, logs); the witch, the hunter, and the hermitage are the odd ones; the stones, the barrow, and the old road are the hooks.
- **Every road leaves the map somewhere**: west past the stones, south past the croft, east past the woodcutters, north up the river. In 1.0 they leave into the wild and keep going as forest tracks; in 1.1 one of them (east, by the plan) becomes the road to the gloom. Nothing in the middle has to change for that.

## Distances, for the feel

| From | To | Tiles | Walk | Sprint |
|---|---|---|---|---|
| your door (the end cottage) | the square's well | 30 | 10 s | 6 s |
| the square | the castle gate | 55 | 18 s | 10 s |
| the square | Hollow Farm's yard | 70 | 23 s | 13 s |
| the square | the mill | 70 | 23 s | 13 s |
| the square | the witch at the mere | 125 | 42 s | 24 s |
| the castle gate | the woodcutters | 70 | 23 s | 13 s |
| the ford | the croft | 30 | 10 s | 6 s |
| the square | the old road's end (east edge) | 190 | 63 s | 36 s |

The dead walk at one tile a second: a zombie that sees you at the castle gate takes nearly a minute to reach the square, and the bridge is in its way.

## What the edges promise

- **East, the old road:** past the woodcutters the dirt road thins to a track, the trees close in, and a waystone stands where the authored bounds end (`06`). That is the gloom's door for 1.1: the zone system (`05`, "Zones") puts the blue and purple trees, the plague doctor, and the rest past it. In 1.0 the track continues as the ordinary wild.
- **South, the drove:** past the croft the drove leaves the map toward "the next village", which is the travel of 1.1 or 2.0.
- **West, the old way:** past the standing stones, a path that peters out. Nothing promised.
- **North, the river:** the river comes from somewhere; the quarry track climbs beside it. Nothing promised.
