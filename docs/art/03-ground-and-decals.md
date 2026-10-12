# Art 03: Ground, decals, rocks, water

**Status: in the game and accepted** ("Ground looks amazing, I think we hit the perfect spot", Michael, 2026-10-11). Files in `data/art/ground/`. The engine side (baking, blending, tinting, shadows) is `15-ground.md`; this page is the art side. Written 2026-10-12.

## What is there (58 PNGs)

| Set | Files | Size (px) | Notes |
|---|---|---|---|
| Grass tiles | `grass_0..3` | 64 x 32 | normal density; textured but not aggressively so |
| Sparse grass | `grass_sparse_0..1` | 64 x 32 | fewer blade ticks |
| Farm soil | `farm_soil_0..3`, `farm_soil_trbl_0..3` | 64 x 32 | furrows in both directions, see `04` |
| Water | `water_0` | 128 x 64 | seamless world texture |
| Fallen leaves | `leaves_<yellow|orange|red|brown>_0..4` | 11 x 5 up to 36 x 18 | per colour: 3 piles (0 to 2) and 2 scatters (3 and 4) |
| Mushrooms | `mushroom_0..4` | 18 to 33 wide, about 22 to 23 tall | |
| Pebbles | `pebbles_0..2` | 8 x 6 up to 27 x 9 | |
| Flowers | `flowers_0..3` | 17..20 x 16..18 | |
| Grass tufts | `tuft_0..3` | 10 x 8 up to 15 x 13 | |
| Twigs | `twig_0..2` | 17 x 5 up to 27 x 6 | |
| Rocks | `rock_0..3` | 47..55 x 30..44 | "mineable rocks"; placed in the wild by rule, see below |

The dirt and cobble textures are **not** art: the engine generates them (`ground_dirt`, `ground_cobble`, `ground_noise`). A 128 x 64 dirt texture (`dirt_world_128x64.png`) and an edge-noise texture exist in the ground kit but were not imported.

## Grass

Base ramp, dark to light: `#34462c` `#405434` `#4b5f3d` `#586e44` `#687e4c`, base `(75, 95, 61)`. It is **dull**: a greyed green with a hint of blue, because the village is not a mowed lawn. Darker than the dev palette's `#596f49`, and `06` follows the kit now.

Each tile is a flat base with sparse blade ticks (a light pixel over a shade pixel) and soft 2 to 4 px blotches one step darker or lighter. **Ticks avoid the outer 2 px of the diamond**, so the tile grid never shows. The checkerboard is gone everywhere; the engine picks a variant per tile by hash.

## Decals: the rules

Applied everywhere (the brief that fixed the first set's problems, `15b`):

- **Fewer, bigger, readable.** Each object has a recognisable shape, a lit side and a shade side, light top-left.
- **A darker edge on the lower or outer side** in the darkest shade of the piece's own colour, never black.
- **Solid clusters with empty space between.** No noise, no dither, no scattered single pixels.
- **At most four shades per piece.**
- **Perspective:** flat things (leaves, twigs, pebbles) are foreshortened ellipses; upright things (mushrooms, flowers, tufts) are seen from the front with their base on the bottom row and a 1 px contact shadow `#2c3a25` under them (the only "shadow" allowed, because it is darker than the darkest grass and tiny).
- **Tone:** autumn harvest, cosy but a little spooky, muted. Nothing neon.

### Ramps (edge, dark, mid, light)

| Piece | Tones |
|---|---|
| Leaves yellow | `#362812` `#9c7226` `#cea43e` `#e8c660` |
| Leaves orange | `#3a1c0e` `#92461c` `#c66c2a` `#e69242` |
| Leaves red | `#301210` `#70261c` `#a03a28` `#c4583a` |
| Leaves brown | `#2e2014` `#543c24` `#705232` `#8a6842` |
| Mushroom stems | `#5e5444` `#a89c80` `#c2b79c` `#d6ccb2` |
| Mushroom caps | red and brown reuse the leaf red and brown ramps; pale tan `#3c3226` `#8c7a5c` `#a8967a` `#c2b292` |
| Pebbles | `#4a433d` `#6a6058` `#756a61` `#8c8176` |
| Twig bark | `#2a1c12` `#4e3824` `#6e5034` `#8c6a46`, cut end `#a88a62` |
| Flowers (blooms) | cream, yellow, dusky purple, rust, blue, each four tones, all muted |
| Tufts | the grass ramp above |

**Leaf colours are matched to the trees.** Yellow, orange and red are sampled from the drawn oak canopies; brown is the kit's. The engine puts leaves under a tree in that tree's colour (brown under green or gloom trees).

### What each piece is

- **Leaves:** each leaf is 4 to 7 px, an almond or pointed oval with a light half, a dark half and a rib, some with a 1 px stem. Piles are 24 to 40 px wide, 12 to 20 tall, 5 to 12 leaves; scatters are 8 to 14 px wide with 1 to 3 leaves.
- **Mushrooms:** a "little treat to spot", bigger than the rest: a single red cap with pale spots (the fairy-tale toadstool), a cluster of two or three red caps, a single brown cap, a cluster of brown caps, a pale tan cluster. They became **interactables** (clickable, foraged), so they carry the outline and sway when clicked; that is an engine rule, `02` question 27.
- **Pebbles:** one to four stones, 4 to 9 px each, highlight on top, shadow underneath.
- **Flowers:** low clumps with three to six blooms of 3 to 5 px on short stems.
- **Tufts:** five to nine blades leaning outward.
- **Twigs:** 16 to 28 px long with a fork or two. The engine places them by a per-tree rule (0 to 2 within 1.2 tiles of each trunk), not scattered.

Generator: `decals.py`. Each piece is drawn on a small canvas, each piece "owns" its pixels so overlapping pieces get their own edge, and the result is tightly cropped.

## Rocks (new concept, in use)

Four large faceted rocks, 47 to 55 px wide, in warm dusky greys, **outlined** (they are interactables, minable later). The wild generator places a 60% chance of one per 40 x 40 tile patch in place of a tree, plus three placed by hand in the village. They are not decals and not part of the leaf/mushroom rules. What they give when mined is undecided (`02` question 27).

## Farm soil and water

See `04-farm-and-crops.md`. Water is the seamless 128 x 64 texture (dusky teal `#293f4c`-`#304957` with pale ripple dashes `#4a6b7c`/`#6f8e9c` and darker troughs), wrapping in both directions in world pixels. Water is **only a look**: it can be walked on (Michael keeps the pond as it is).

## What the engine does *to* this art (so do not draw it in)

- Tints the grass by a large-scale noise drifting between lush and dry, and darkens it under canopies.
- Bakes a soft stepped shadow under every tree.
- Blends dirt, farm and cobble into grass with ragged, pixel-crisp edges from a weight field and a noise threshold. **Laid floors (wood, stone) are hard diamonds** and do not blend.
- Lights, fogs and night-tints the baked picture per pixel.

So grass tiles must not carry any baked tint pattern or shadows; they are flat, tileable, and edge-clean.

## Tuning history that explains today's densities

Michael halved every decal after seeing the redrawn set, cut mushrooms by two thirds more and tufts by a third, made twigs a per-tree rule, and thinned the generic forest by 40% then another quarter. Those are `data/ground.json` numbers (`perReach` 0.5 then 0.3, `extraChance` 0.22, `openChance` 0.05, forage chance 0.021), **not art changes**: do not shrink the pieces to fix density.

## Open items

- A **leaf pile larger than 40 px** would cross chunk borders badly; the bake leaves room for decals up to about twice the original size.
- **Cobble and dirt** textures are still generated. If drawn art is wanted, keep them 128 x 64 and seamless in both directions.
- Flowers almost never fire in the forest because only 1 to 8% of grass is beyond every tree's reach. That is a data fix (`"where": "any"`), not an art one.
