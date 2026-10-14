# 29 — The 1.0 map: a castle, a village, farms, and the forest round them

**Status: an ideation pass, written 2026-10-12 at Michael's ask, after a read of every doc in `docs/` and `docs/art/`, the map file, and the art folders. Nothing here is ruled, nothing is built, and no code was touched. It is deliberately more than the game needs: the brief was "give me more things to choose from than I need, so I will more likely have to cut than add". `11-cut-list-and-questions.md` says what to cut first and what only Michael can answer.**

**Status, 2026-10-13: steps 0 and 1 of `30` built the bones and the village from these pages** through the generator (`tools/mapgen/valley.py` writes `data/maps/valley.json`, the map the game loads by default): the 256 bounds, the river, the stone bridge, the ford, the roads' skeleton, your cottage (`07`, option A), and the village of `04` with its dead and its living; the farms and the mill, the castle, the forest places, and the dressing are `30`'s steps 4 to 7 and are not built. Where the built valley departs from these pages: the coordinates follow `04`'s room plans where `01`'s overview disagrees (the high street and the bridge at row 158, not 126); the banks are dirt (no shingle or mud yet); the ford is `floor_water_shallow`, seven tiles by three; every low wall, fence, and hedge is `wall_fence` until drawn; no art of `09` has arrived, so the new furniture and stations are labelled boxes; the graveyard's eight stand rather than rise; the people have role names until Michael names them. The questions answered so far are marked in `11`. Multiplayer is live (`31/08`): a place is data in the map and the save, so it needs nothing for a guest, but any new behaviour a place brings (the rising, a stack that gives, a mill wheel that turns) is built for a guest in the same commit.

## Ruled on 2026-10-12, after this was written (these override the pages below)

Michael read the folder as brainstorming, not gospel, and ruled with `30-the-big-pass-spec.md` (the what, laid over this where): **water stops everyone**: a tile wholly water is unwalkable by any entity, the bank's blend is ground, the ford and the weir a shallow kind slow for all (Q1 yes, sharpened); **256 by 256** (Q2); **the end cottage** is the home (Q3); **the cut list taken as written** (the maze, the second smithy's fire, the tannery for now, coin and the treasury, locked doors and keys, the paired gate, carpet as an autotile, the willow's eyes); **fishing later**, the waters placed as if yes; **two animals**, chickens and deer, as the last step of the pass, which brings leather and the tannery back then; **the dev chest and combat testing as a setting** on the real map; **a generator script** writes the map from a description per place; **sleep** only in a bed indoors, a fast-forward of the simulation; **drinking and filling at any water**; the knife's skinning waits for the animals. The build order is `30`, section 11; the engine asks consolidated are `30`, section 12; the art asks stay `09` with `30`'s additions.

## What this is for

The current `data/maps/square.json` is a 32 by 32 proof of concepts (`02`, 2026-10-11: "the real authored map will be built once the finished art and some build tools exist"). This folder is the design of that real map, the one that carries 1.0: the cosy harvest register from `00` and `06`, dense with things to do, with the hooks for the later story, the travel, and the gloom zone left at its edges and never built into its middle. The arc Michael described (a disarming farming game, then the dead, then the road out to spookier lands) is served by one choice above all: **everything spooky in 1.0 is at the edge of the map or inside something you have to choose to enter** (the castle, the graveyard, the barrow, the old road east). The village and the farms stay cosy.

## The pitch in one paragraph

A river runs down the middle of a wooded valley. On its east bank, in a bend of the river and behind a moat, stands a small stone castle: a gatehouse, four corner towers, a great hall whose feast was interrupted, a chapel, a wizard's study with a scorched floor, and a dead garrison in tabards. On the west bank, joined to the castle by one stone bridge, is the village: a cobbled square round a well, an inn with its windows boarded from inside and the last villagers behind them, a chapel and its graveyard, a smithy, a mill on the river, two stone houses with carpets and a manor with a walled garden, and a street of cottages that ends at yours. Upstream is a grain farm by the mill; downstream, across the green and down a lane, a big mixed farm with a barn, an orchard, a pond, and a pumpkin field that is the map's postcard. Round all of it, forest, and in the forest the small places that give the loop its reasons to go out: woodcutters, charcoal burners, a quarry, a hunter's lodge, the witch at the mere with her willow, a shepherd's croft across the ford, a bandit camp, a ruin, standing stones, a barrow, and an old road east that ends at a waystone, where 1.1 begins.

## The files

| File | What it holds |
|---|---|
| [01-geography.md](01-geography.md) | The whole map at a glance: size, the regions, the overview picture, distances and travel times, where the edges lead. |
| [02-water-and-roads.md](02-water-and-roads.md) | The river, the brook, the ponds, the moat; the bridge, the footbridge, the ford, the weir; every road with its surface and width; what water needs from the engine. |
| [03-the-castle.md](03-the-castle.md) | The castle room by room, a tile plan, and how to make it read as a castle with one storey and no roofs. |
| [04-the-village.md](04-the-village.md) | The village: the square, the inn, the chapel and graveyard, the trades, the noble houses, the cottages; each building's rooms and why it earns its place. |
| [05-the-farms.md](05-the-farms.md) | Hollow Farm, Long Acre, the croft; barns, byres, fields, the orchard, the pumpkin field; what farming needs from the map. |
| [06-the-forest.md](06-the-forest.md) | The forest as a place: belts and clearings, the small places in it, the wild beyond the bounds, the gloom hook. |
| [07-the-start.md](07-the-start.md) | Where the player lives and wakes up; three options for the home; the first ten minutes the map should offer. |
| [08-the-loop.md](08-the-loop.md) | Density: what there is to do on every screen, where each resource comes from, where the dead are thick and thin, who the villagers are. |
| [09-art-asks.md](09-art-asks.md) | Every asset this plan wants, grouped and prioritised, as paste-ready requests in the house style. |
| [10-engine-asks.md](10-engine-asks.md) | The code changes the plan needs, for the other agent, ranked; with what works today with no change. |
| [11-cut-list-and-questions.md](11-cut-list-and-questions.md) | What to cut first, what is cheap and what is dear, and the questions only Michael can answer. |

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

## How to read the plans

The pictures are in grid space: `x` across, `y` down, as `map.js` counts tiles. On screen the grid is turned forty-five degrees: the top-left corner of a picture is the top of the screen, the top-right corner is the screen's right, the bottom-left corner the screen's left. A building's `n` wall (the engine's name) is the side toward smaller `y`, which on screen is the upper-right face. The overview picture is one character per four tiles; the castle plan is one character per tile; the village and farm plans are one character per two tiles. All coordinates are proposals on a 256 by 256 authored bounds and move freely; what matters is what is next to what, and how far.
