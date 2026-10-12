# Art 04: Farm soil and crops

**Status: in the game** (2026-10-11). Soil and water in `data/art/ground/`, crops in `data/art/crops/` (30 PNGs). Written 2026-10-12.

## Farm soil

`farm_soil_0..3` (furrows running `\`, along world X) and `farm_soil_trbl_0..3` (furrows running `/`, along world Y). 64 x 32 diamonds, four variants each, **furrows continuous across every tile edge** so any variant meets any other.

**How a furrow is built.** One furrow is 8 world units across, four per tile, so the pattern repeats exactly every tile. The cross-section along the other axis is `trough, shade, shade, crest, crest, lit, lit, base`, with light from the top-left: the rising face is turned away (shade), the falling face looks toward the light (lit). The crest wobbles a little along the furrow as a function of world X only, so it matches across edges but looks hand-dug. On top of that: sparse single-pixel earth crumbs on the faces, two to four 3 x 2 clods on the crests (kept clear of the tile edge so none are cut), and in some variants an odd stone turned up by the hoe.

| Tone | Value |
|---|---|
| trough | `#2a1d14` |
| shade | `#3a2a1d` |
| base | `#4a3524` |
| lit | `#58402c` |
| crest | `#664b34` |
| crumbs | `#33251a` / `#6e5239` |
| stones | `#7a7268` / `#55504a` |

The `trbl` set is its **own drawing, not a mirror**: mirroring flips the lit side to the wrong side of each furrow. (The engine briefly mirrored at load; the real art replaced that.) Soil is dark and low, so the crops and the "harvest yellow" the vision once imagined are accents, not the ground.

## Crops

Five crops, three stages each (0 planted, 1 growing, 2 ready to harvest), each in two row directions:

`crop_<crop>_<stage>_<tlbr|trbl>.png`, crops `potato`, `rye`, `cabbage`, `garlic`, `pumpkin`.

- **`tlbr`:** rows run top-left to bottom-right (along world X, like `farm_soil_*`).
- **`trbl`:** rows run top-right to bottom-left (along world Y, like `farm_soil_trbl_*`).
- **One sprite is one farm tile's worth of plants**, spaced along the furrow (potato and cabbage two plants, rye and garlic three, pumpkin one plant with a vine). Anchor: the tile's top vertex at ground level, in `anchors_crops.json`.
- **Each plant is drawn on its own layer with its own `#2b2522` outline**, then the layers are composited back to front, so neighbouring plants keep their edge. They are interactables (they sway when clicked, outlined like the mushrooms), not solid, not carried.
- **A crop's rows follow its soil:** the engine reads `furrows` from the floor under it and picks the matching sprite.

| Crop | Stage 0 | Stage 1 | Stage 2 | Sizes (px, 0 / 1 / 2) |
|---|---|---|---|---|
| Potato | small mound, two tiny leaves | mound with a leafy bush | bigger bush with yellowing leaves, spuds peeking out of the hill | 26x16 / 30x23 / 36x28 |
| Rye | five short green blades | seven taller blades, some peeling a leaf | six tall **gold** stalks with ears (2 px wide seed heads) | 34x16 / 41x25 / 44..45x37 |
| Cabbage | three small leaves | five leaves around a pale head | big pale head with veins and four wrapper leaves | 26x15 / 36x20 / 40x23 |
| Garlic | two thin shoots | four to five wide blades | blades flopped and yellowing, a pale bulb with a purple blush at the base | 27..28x16 / 34x22 / 46..48x27 |
| Pumpkin | a sprout and two seed leaves | a vine along the row with leaves and a small flower | long vine, four leaves, a ripe pumpkin beside the root (the same pumpkin as `pumpkin_0`, drawn by `pumpkin2.py`) | 10x7 / 23..24x18 / 36..37x26 |

Ramps: leaf `#34462c` `#4b6a3a` `#5f8445` `#7a9e52` `#98b866`; yellowing leaf `#4a4422` `#6e6a2e` `#8c8a3c` `#aaa64e` `#c4bc68`; ripe rye gold `#5a4418` `#8a6a26` `#b08a36` `#cfa94c` `#e2c26a`; cabbage head `#4b6a3a` `#7c9a5a` `#9cb878` `#b8cc8e` `#d0dca6`; potato skin `#6a5034` `#8e7048` `#b0905e` `#c8aa74`; garlic `#8a7e74` `#c2b8a6` `#e0d8c4` `#f0ead8`, blush `#8a6a86`; pumpkin flower `#b07a1e` `#e0a838` `#f0cc6a`.

Generator: `crops.py` (draws the plants with a small `Layer` class: shaded ellipses, blades, almond leaves, and the shared outline pass).

## Open items

- **A stage change swaps the sprite.** The growth timer and which stage a planted crop is in are engine design (the farming milestone); the art has exactly three stages and no in-between.
- **More crops** (turnip, onion, wheat) would follow the same recipe: three stages, two directions, one tile.
- Rye is the only crop with a colour that reads from a distance (gold). If crops must read at the wide zoom (1.1x), consider a **brighter ripe cue** for the others.
