# 46 — Natural resources: what comes back, and where

**Status, 2026-10-25: a spec, ruled by Michael in session (`02`, 2026-10-25, Natural resources ruled; #288). Not built.** Written from `origin/main` at f031178. Three build steps, one issue each, in order. A **default** is Primary's, Michael's to overrule; the rest is his ruling. Skill gates are open to all until the skills are built.

**Today** (`docs/39` section 4): ore rocks come back in place after three game days (`sprites.ore_rock.mine.days`); apple trees bear again in place; fish never run out; the wild beyond the valley grows new forest, rocks, and mushrooms as new chunks. Felled trees and plain rocks are gone for good, mushrooms only sway (774 placed by rule near trees), and herbs do not exist.

## 1. Why, in Michael's words

"The main point I think is to make exploration more or less required for getting these types of resources vs. farming and animal keeping where you can put it in a defined spot." Farming and animals are what you keep at home; ore, stone, clay, herbs, and mushrooms are what you go out and find.

## 2. One comeback rule for five resources

**Ore, stone, clay, herbs, and mushrooms come back at random spots within their defined areas** (Michael: "random spawns but within defined areas"):
- **Stone:** everywhere on natural ground in the valley.
- **Ore** (iron ore, and salt from Mining 3): in certain areas, the mine and its hills (*default:* the map's ore areas; gems are the next sitting's, #281).
- **Clay:** by the river (its banks), dug with a shovel (Mining 3).
- **Herbs:** all over the ground, **like weeds growing at random, never in patches** (Michael: "So no herb patch, they are like weeds that grow randomly"); a kind may favour its ground (*default:* the mana herb near water, nightshade and wolfsbane in the woods, the graveyard's herbs there at night, as `docs/39` names them), never fixed to a spot.
- **Mushrooms:** near trees, anywhere in the woods.

**The same for all of them:** each kind keeps a **count for its area** (*default:* roughly today's numbers where they exist: the valley's rocks and the 774 mushrooms); **once one is taken, a replacement grows somewhere else in that area after a while** (*default:* a game day or two, a lever), so "unless you go on a resource binge all day the amount in the valley should stay roughly the same." **Ore rocks no longer come back in place:** a mined one is gone and a new one rises elsewhere in an ore area.

**Where a new one may grow:** natural ground only: never on a built floor, tilled soil, or a rug, never under a prop, never inside a room or a fenced yard (so a cleared yard and a farm stay clear), never on water or a road (*default*).

## 3. Appearing

- **Herbs and mushrooms simply appear**, in view or not (Michael: "Mushrooms and herbs can definitely just appear"). The rule that nothing materialises in view was for the dead, so they never rush a player unfairly.
- **Rocks and ore rise out of the ground with a short animation** (Michael: "For rocks and ore, do the frozen zombie plan for that region - they pop up out of the ground with an animation"). *Primary's reading, Michael's to correct:* a new rock or ore rock grows up out of the earth over a second or so, a little dust and broken soil at its foot, in view or not. A rock never rises under a character: the spot is free of bodies when it starts.

## 4. Trees, sticks, and fish

- **Trees never regrow where felled in the valley:** a clearing stays clear. New trees come from saplings: felling sometimes drops one (Woodcutting 4, ruled); planted on open ground it grows to a tree over about five game days (*default*); the wild beyond the valley grows new forest as new chunks. The woods ringing the valley are large, so wood never runs out in practice.
- **Sticks under trees:** **Gather sticks** under any standing tree gives one or two (*default*), and that tree has none again until the next day (Michael: "Sticks under trees is great").
- **Fish never run out** (Michael: "Fish never run out is great").
- **Apple trees** bear again in place, as now.

## 5. Inside the laws

- **The clock law:** a resource coming back is a kindness, never a danger; the times run on the world's clock, which moves only while someone is in the world.
- **The gatherables law:** every resource node is `interactable`, outlined, and sways on a click, as rocks, ore, and mushrooms do; herbs and clay banks join them.
- **Item art:** every new item (each herb, clay, salt, sapling) with its pair and hover card.

## 6. The guest's side

Comebacks run on the host's step and reach a guest through the touched chunks, as ore rocks and apple trees do now; a node's next time rides on its area's record or its prop, in the save and in `game.syncParts`; the rising animation is drawn by every client from the prop's appearing time (the sim clock), so nothing new crosses the wire beyond the prop; chance from `rng`, time from `loop.simTime()`. Gathering is a verb by the prop's id, the host's and a guest's alike. Tried in two tabs with `check("sync")`, the frame's bytes read from `net.status().wire`.

## 7. Build steps

1. **The comeback rule:** areas per kind in the map (`tools/mapgen/valley.py` and the map's data), counts kept, a replacement grown after a taken node at a random free spot in its area; stone, ore, and mushrooms moved to it (ore no longer in place); the rocks' and ore's rise animation; herbs and mushrooms appearing. A new `check("resources")`.
2. **Herbs and clay:** each herb as an item with its card and its node (sage, nettle, feverfew, yarrow, the mana herb, nightshade, wolfsbane, the graveyard's herbs; the dye plants woad, madder, and weld), gathered at Herbalism's levels; mushrooms foraged (Herbalism 3); clay banks dug (Mining 3); salt in the ore areas.
3. **Trees and sticks:** saplings from felling, planting, growing to a tree; Gather sticks under a tree.
