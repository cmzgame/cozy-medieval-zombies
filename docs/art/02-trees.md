# Art 02: Trees

**Status: in the game.** 36 harvest and gloom trees in `data/art/trees/`, definitions in `data/sprites/tree_*.json`. A weeping willow exists but was never imported. Written 2026-10-12.

## What is there

`tree_<shape>_<size>_<colour>.png`, 36 files: two shapes, three sizes, six colours.

| | Oak (round, layered clumps) | Spire (conical, four tiers) |
|---|---|---|
| S | about 82..84 x 103..106 | about 71..73 x 112..114 |
| M | about 113..115 x 143..146 | about 93..97 x 153..154 |
| L | about 154..158 x 196..198 | 130 x 211..212 |

(Measured from the PNGs in the repo; sizes vary by a couple of pixels per colour because each tree is its own seeded roll and is tightly cropped.)

In the game the sizes are renamed by how big they *feel* (`15b`): oak S is "the medium tree", M "the large", L "the giant". The old generated giants (186 to 196 px) are replaced by the L trees.

**Colours:** green, yellow, orange, red (the harvest set, all placed) and blue, purple (the gloom set, **defined and on file but not placed**: blue and purple canopies beside orange ones looked like Halloween candy, so the gloomy register waits for a zone of its own, `06`).

## The ramps

Five tones each: outline, shadow, base, light, glint. The canopy edge uses the outline tone (a dark version of the tree's own colour), not `#2b2522`: trees are gatherables (`interactable: true`, chopped for wood) but the engine excuses them from the outline, since they stand out plenty (`CLAUDE.md`).

| Colour | outline | shadow | base | light | glint |
|---|---|---|---|---|---|
| green | `#1a261c` | `#385a32` | `#588646` | `#80aa5a` | `#b0ce78` |
| yellow | `#362812` | `#9c7226` | `#cea43e` | `#e8c660` | `#f8e696` |
| orange | `#3a1c0e` | `#92461c` | `#c66c2a` | `#e69242` | `#f6be6e` |
| red | `#301210` | `#70261c` | `#a03a28` | `#c4583a` | `#e2845a` |
| blue (gloom) | `#0e141e` | `#243242` | `#3a4e62` | `#526a7e` | `#6e8a98` |
| purple (gloom) | `#120c1c` | `#2e243e` | `#4a3b5e` | `#64547a` | `#807096` |

Trunks: harvest `#221610` `#3e281c` `#684830` `#8a6644` (outline, dark, base, light). Gloom trunks are a cool grey-violet, `#100e16` `#2e2a34` `#4e4854` `#6a6470`, so a gloomy tree does not have a warm trunk.

The gloom ramps are low saturation with a compressed value range and cool glints. That is deliberate: the Tirisfal register is dark and earthy, "not as bright as Tirisfal itself".

## How a tree is built

Generator: `trees.py` (v1, the base `Canvas` class, ramps) and `trees_v2.py` (the shipped sizes). Seeded per tree.

- **Oak:** seven main canopy lobes (jittered ellipses) plus extra small clumps on the crown surface (5 / 9 / 14 for S / M / L). A "shadow mass" band at the bottom of the canopy (4 / 5 / 7 px deep for S / M / L), a few hanging clusters under the canopy edge, glints on the upper-left of each lobe. Trunk width 14 / 19 / 26.
- **Spire:** four stacked tiers, each tier a pair of lobes plus a centre lobe, narrowing to the top, with extra skirt clumps (1 / 2 / 3 per tier). Trunk width 11 / 15 / 20.
- **Trunks:** tapered with a root flare, never a rectangle. Bark cracks (1 x 2 to 4 px, scaled by trunk area), short 2 px notches (a lit one on the lit side, a dark one on the shade side), and a knot on the larger trunks (width 18 and up; a dark 3 x 2 core with a light lip above it).
- **The outline must not read "happy".** Michael's steer (2026-10-11): the canopy is a lumpy jittered shape, halfway between a drawn treetop and circles on a pole, so the same silhouette still works when the palettes go gloomy.
- **Pixel size stays constant across sizes.** The outline is 1 px, shading clusters stay the same size, glints stay 1 to 2 px. The bigger canvas buys more clumps, more highlights and more bark, not chunkier pixels. That is what "drawn natively, not upscaled" means (`01`).

## Technical contract (what the engine relies on)

- Tight crop, one transparent PNG per tree.
- The trunk base is **centred horizontally** and sits **6 px above the bottom edge** (6 transparent rows below it). The engine takes the anchor four rows above the trunk's lowest pixel.
- **No shadow on the ground.** The ground bake draws its own stepped ellipse under each trunk, sized by the sprite (`15`).
- Canopy reach, shadow width and leaf colours are engine data per tier (`canopy.reach` 2, 3, 4 tiles; `shadow.width` 0.42), not in the art.
- Hard pixels, no scaling. The old `scale: 1.5` was removed from every definition on 2026-10-11.
- Leaf litter under a tree takes the tree's colour (brown under green and gloom), a rule in `data/ground.json`, not in the art. The decal colours are sampled from these canopies, see `03`.

## The weeping willow (on file, not in the repo)

`willow.py` draws a large weeping willow, **205 x 191 px**, in four colours (green, orange, blue, purple), plus a blue variant with a pair of glowing eyes in the hanging curtain (`tree_willow_L_blue_eyes.png`, a one-off for the gloomy register). Construction, back to front: a darker back curtain of hanging fronds, a dark hollow under the dome, a gnarled trunk with roots, the lit dome using the same lobe shading as the oaks, then a front curtain that parts in the middle to show the trunk and the hollow. Fronds are 3 px strands side by side with ragged tips, outlined as a group.

It was delivered to Michael as `willow.zip` and is **not in `data/art/trees/`**. If it is wanted: import the L-size PNGs, give them a definition with the same trunk-base anchoring (centre of the trunk, 6 px pad), and decide the ground shadow width (the willow is wider than it is tall, so `0.42` is probably too small). The eyes variant belongs to the gloom zone and should not appear in the harvest forest.

## Open items

- A **fourth tree shape** for variety (a dead tree / bare trunk for the dark register) has not been asked for. The spire and oak mix is about 2 oaks to 1 spire in the harvest forest (`02` decisions: spires at half an oak's weight).
- **Gloom trees** are unplaced. They need the zone system (`05-someday.md`) first.
- Old giants "about one in eighty tiles" in `06` refers to the generated placeholders; the drawn L sizes replaced them.
