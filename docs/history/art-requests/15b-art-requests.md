> **A record, moved whole by the sweep, 2026-10-16.** The two requests Michael pasted into Claude Design on 2026-10-11 (the trees redrawn at their final size; the decals bigger, with the rocks that came with them), both delivered the same day. It came from `docs/15b-art-requests.md`, unchanged below this banner, and nothing stays at that path; the live text is `docs/15-ground.md` and `docs/art/02` and `03` for the art that came back.

# 15b — Art requests for Claude Design

**Both delivered (2026-10-11):** the decals as `decals_v2` (with four rocks added, a new concept still to be discussed) and the trees as `trees_v2`, drawn at final size; both are in the game. **Status, 2026-10-13:** the rocks are in too, redrawn as stone clusters and placed as gatherables (`data/sprites/rock_*.json`, `02`, 2026-10-11); nothing from this doc is owed.

Two requests Michael pastes into Claude Design (2026-10-11), written from what the game actually needs. Everything between the fences is meant to be pasted as it is. When the art comes back, the files drop into `data/art/trees/` and `data/art/ground/` under the same names and Claude updates the definitions (the trees lose their `scale`, the anchors are re-measured, and the leaf and mushroom counts in `data/ground.json` are retuned for the bigger pieces).

## Why the trees are blurry

The game draws its world at one art pixel per screen pixel, then the GPU zooms the whole picture by a whole step. The first tree sheet was drawn smaller than the game wanted, so the loader enlarges every tree by 1.5 when it loads (the `scale` field in each tree's definition). A pixel cannot be cut in half: enlarging by 1.5 either smears neighbouring pixels together, which is the blur, or doubles every other pixel, which makes the shapes lumpy. The fix is to draw the trees at the size the game shows them, so nothing is enlarged at all. These are the sizes:

| Tree | Old size (px) | Size to draw now (px) | In game |
|---|---|---|---|
| Oak S | 56×69 | 84×104 | the medium tree |
| Oak M | 76×96 | 114×144 | the large tree |
| Oak L | 104×131 | 156×197 | the giant |
| Spire S | 48×76 | 72×114 | the medium tree |
| Spire M | 64×104 | 96×156 | the large tree |
| Spire L | 88×142 | 132×213 | the giant |

## Request 1: the trees, redrawn at their final size

```
Please redraw the 36 tree sprites you made for my game at a larger size. Same trees, same style, same colours, just drawn natively bigger.

Why: my game draws these trees 1.5 times larger than the sprites you gave me, and enlarging pixel art by 1.5 makes it blurry. I need each tree drawn at its final size, so the game shows it at exactly one pixel per pixel with no scaling.

Sizes, width by height, in pixels (within 2 or 3 pixels is fine):
- Oak S 84x104, Oak M 114x144, Oak L 156x197
- Spire S 72x114, Spire M 96x156, Spire L 132x213

Important: redraw at the new size, do not upscale. A 1.5x enlargement of the old sprites will not work, nearest-neighbour or smooth. The outline stays 1 pixel thick, the shading clusters stay about the same pixel size as now, and the extra pixels go into more detail: more leaf clumps and highlights in the canopy, more bark texture in the trunk. Think of it as the same tree drawn on a bigger canvas, not the same drawing stretched.

Keep everything else:
- Two shapes: oak (round, layered clumps) and spire (conical, tiered).
- Six colours: green, yellow, orange, red, blue, purple, with the same palettes as the current sprites.
- Light from the top left, a dark 1-pixel outline, the same chunky, cosy, slightly spooky autumn look.
- For scale: the ground tiles are 64x32 isometric diamonds and the player character is about 48 pixels tall and 20 wide. The medium trees should be roughly twice his height and the giants about four times.

Technical:
- One transparent PNG per tree, tightly cropped.
- The trunk's base is centred horizontally, at the bottom of the image, with the bottom of the trunk about 6 pixels above the bottom edge.
- Hard pixels only: every pixel fully opaque or fully transparent. No anti-aliasing, no soft edges, no glow.
- No shadow on the ground under the tree. The game draws its own.
- Same file names as before: tree_<shape>_<S|M|L>_<colour>.png, for example tree_oak_M_orange.png. 36 files.
- Please also show a preview sheet of all 36 side by side at 1x and at 3x, with the 48-pixel character beside them for scale.
```

## Request 2: the ground decals, redrawn bigger and readable

```
Please redraw the small ground decals from the ground kit: the fallen leaves, mushrooms, pebbles, flowers, grass tufts, and twigs. Keep the grass tiles as they are, those are great.

What is wrong with the current set: everything is too small to read. The leaves are 2x1-pixel specks scattered like the spray-paint tool in old MS Paint, so nothing looks like a leaf. In the game they are drawn at one pixel per pixel next to trees 104 to 213 pixels tall and a 48-pixel character, so a 2-pixel leaf is a speck. The twigs are the closest to working.

How I want them drawn:
- Fewer, bigger, readable pieces. Each object is a small sprite with a recognisable shape, a lit side and a shadow side, light from the top left.
- A darker edge on the lower or outer side of each piece so it pops against the grass. Use the darkest shade of its own colour, not black.
- Solid clusters with some empty space between pieces. No noise, no dithering, no scattered single pixels.
- 3 or 4 shades per piece at most.
- Perspective: the game is 2:1 isometric. Things lying flat (leaves, twigs, pebbles) are seen from above at an angle, so a round pile is an ellipse about twice as wide as it is tall, and a single leaf is a little foreshortened. Upright things (mushrooms, flowers, tufts) are seen from the front, with their base at the bottom of the image.
- Tone: autumn harvest, cosy but a little spooky, muted rather than bright. Nothing neon.

What to draw, with sizes in pixels:
- Fallen leaves, in four colours: yellow, orange, red, and brown. Each leaf is 4 to 7 pixels long, an almond or pointed-oval shape with a light half and a dark half, some with a 1-pixel stem. Per colour: 3 piles (24 to 40 wide, 12 to 20 tall, 5 to 12 leaves each) and 2 small scatters (8 to 14 wide, 1 to 3 leaves).
  Colours, dark to light, matched to my trees:
  yellow #362812 (edge), #9c7226, #cea43e, #e8c660
  orange #3a1c0e (edge), #92461c, #c66c2a, #e69242
  red #301210 (edge), #70261c, #a03a28, #c4583a
  brown #2e2014 (edge), #543c24, #705232, #8a6842
- Mushrooms, bigger than the rest, they should be a little treat to spot: 12 to 20 tall, caps 8 to 14 wide. 5 variants: a single red cap with pale spots (fairy-tale toadstool), a cluster of 2 or 3 red caps, a single brown cap, a cluster of brown caps, and a pale tan cluster. Pale stems around #d6ccb2, with a 1-pixel dark contact shadow at the base.
- Pebbles: 3 variants of 1 to 4 stones, each stone 4 to 9 wide, muted warm grey (#4a433d edge, #6a6058, #756a61, a lighter top), highlight on top and shadow underneath.
- Flowers: 3 low clumps, 12 to 20 wide, each with 3 to 6 blooms of 3 to 5 pixels on short stems. Muted colours: cream, pale yellow, dusky purple, rust. Not saturated.
- Grass tufts: 4 variants, 10 to 18 wide and 8 to 14 tall, 5 to 9 blades leaning outward, using the grass colours #34462c, #405434, #4b5f3d, #586e44, #687e4c.
- Twigs: 3 variants, 16 to 28 long and 4 to 8 tall, with a fork or two, bark browns.

Technical:
- One transparent PNG per decal, tightly cropped.
- Hard pixels only: every pixel fully opaque or fully transparent. No anti-aliasing, no soft shadows. A 1-pixel contact shadow under upright pieces is fine.
- File names: leaves_<colour>_<n>.png (n from 0; piles first, then scatters), mushroom_<n>.png, pebbles_<n>.png, flowers_<n>.png, tuft_<n>.png, twig_<n>.png.
- Please also show a preview of every decal on the grass tiles at 1x and at 3x, with the 48-pixel character standing beside them for scale.
```

## Notes for when the art comes back

- **Trees:** the definitions drop `"scale": 1.5`; frames, anchors, and bounds are re-measured from the new PNGs (the scan script that did it the first time); the shadow width stays a fraction of the frame. Collide radii and wood stay per tier.
- **Decals:** only `data/ground.json` changes: the new file lists, and the counts retuned (bigger leaf piles want fewer per tile than the current specks; the leaves' `extraChance` and the reach-based count are the knobs). The bake already leaves room for decals up to about twice today's size to cross chunk borders whole; leaf piles at 40 px fit.
- **Brown leaves:** the brown ramp above is the kit's (`ground.py`), with a darker edge added. The other three are sampled from the drawn oak canopies.
