# Art round 4, group B: the tools

Nine held tools, each with a bag icon, a world picture (or five angles), and a 38 by 38 portrait. Everything is made by `gen.py` (run it with plain `python gen.py`; PIL and numpy; no randomness, so a rerun gives the same bytes). It writes `out/*.png` (47 files), `manifest.json`, and `preview.png`.

House rules kept: alpha only 0 or 255 and a 1 px `#2b2522` outline round every edge (both checked by script on all 47 files), light from the top left, the house palettes (the wood, wrap, steel, iron, and brass ramps of the hatchet and shovel), and every picture drawn at its final size. Each angle is drawn fresh from the shape, never rotated by pixel. Grips are measured per picture, and the generator asserts that each grip falls on a painted pixel that is not the outline.

## The items

| id | bag | held | world size(s) | grip(s) (x, y from top left) | portrait |
|---|---|---|---|---|---|
| pickaxe | 1x2, icon 19x38 | angles | 0: 19x31, 22.5: 19x30, 45: 25x25, 67.5: 30x19, 90: 31x19 | (9,23) (4,22) (6,18) (7,14) (7,9) | upright, 1.15x |
| hoe | 1x3, icon 19x57 | angles | 14x46, 21x47, 36x42, 43x29, 46x14 | (11,34) (5,36) (9,32) (10,23) (11,11) | upright, haft shortened, 1.1x |
| scythe | 1x3, icon 19x57 | angles | 19x52, 23x49, 39x44, 48x33, 52x19 | (15,41) (5,39) (8,35) (9,27) (10,15) | 45 deg, snath shortened, 1.1x |
| fishing_rod | 1x3, icon 19x57 | angles | 11x55, 28x49, 44x37, 53x19, 55x11 | (3,47) (4,41) (6,30) (7,14) (7,3) | 45 deg, rod shortened, 1.1x |
| hammer | 1x2, icon 19x38 | angles | 16x30, 18x30, 25x26, 29x20, 30x16 | (8,22) (4,22) (6,19) (7,15) (7,8) | upright, 1.25x |
| knife (the Dirk) | 1x1, icon 19x19 | rotate | 7x18 | (3,12) | 45 deg, 2.35x |
| shears | 1x2, icon 19x38 | fixed | 9x29 | (2,18) | upright, 1.2x |
| lead | 1x2, icon 19x38 | fixed | 17x25 | (9,11) | upright, 1.5x |
| bucket | 2x2, icon 38x38 | fixed | 14x19 | (7,1) | upright, 1.6x |

Angle files are `<id>_world.png` (0 deg, upright), `_world_22_5`, `_world_45`, `_world_67_5`, `_world_90`, tilting clockwise with the head toward the right. The flip table in `docs/art/07` covers the rest. Every long tool has its working end up at 0 deg and the hand low on the shaft, like the hatchet: on the pickaxe and the hammer near the butt, on the hoe a third of the way up, on the scythe on the end grip's wrap, and on the rod on the cork. Heads and blades that stick out to one side (the hoe's blade, the scythe's blade and nib, the hammer's face) stick out to the left (-u) at 0 deg, as the hatchet's blade does, so they point up at 90.

The icons are the 0 deg world picture pixel for pixel, centred on the footprint canvas (the house convention). The bucket is the one exception, explained below. None of these items stacks, so no corner is kept clear for a count.

## What each one is

- **pickaxe:** an iron head arched across the top, with its two points curving down and bright where they are sharpened, an iron collar round the eye, and a wooden haft with a leather wrap at the grip.
- **hoe:** a long haft with an iron socket, and a flat plate standing off at right angles to the left whose far end turns down to a bright worn edge. It reads as a "7". The first version, a plate hanging beside the haft, read as an axe and was dropped.
- **scythe:** a gently bent snath, a leather wrap at the end grip, and the nib (the second hand grip) standing off part way up. Off the top runs a long blade curving down to its point, with a dark back and a bright honed edge. The blade fills the full 19 px width of the icon.
- **fishing_rod:** a pale hazel rod whose top third bends over, a cork handle with two rings, the line wound on a winder above the handle, and a tip ring with a short loose line and a red and cream float hanging from it. The line hangs in the rod's own frame, so on the tilted angles it trails along the rod instead of falling straight down. That keeps the flipped angles (90 to 360 deg) consistent.
- **hammer:** a smith's cross-peen hammer: a square polished face on the left, the wedge peen on the right, a plain wooden handle swelled at the end, and the handle's wedged end showing through the eye.
- **knife (the Dirk):** drawn by hand at 1x, per the coordinator's correction: a straight single-edged steel blade a little longer than a work knife (its back on the left, the point at the back), a small brass guard, a carved dark wooden grip, and a brass cap pommel. It is 7 by 18, against the throwing knife's 5 by 13. The portrait draws the same parts as a shape on the diagonal.
- **shears:** sheep shears of the old spring kind. One bar of iron is bent into a bow at the bottom, the two arms are wrapped in leather where the hand squeezes, and two broad steel blades with square heels are sprung apart at the points.
- **lead:** a coiled hemp lead, darker than the rope belt so the two cannot be mixed up. Two turns of coil, the tail hanging from the front turn, spliced back into an eye bound with pale twine. It is held by the coil's front turn, so the eye hangs to about the feet.
- **bucket:** an empty coopered bucket: seven staves (the lit side on the left, the shaded side on the right, seams between them), two iron hoops that follow the curve, the dark inside showing at the mouth with the far inner wall lit, and an iron bail on two small ears. The world picture hangs from the hand by the top of the bail.

## Departures and weak spots

- **The bucket's icon and portrait are drawn larger than its world picture.** The house convention makes the icon the world picture pixel for pixel. Here the world picture is 14 by 19 so that, hung from a hand 14 px above the feet, it reaches about the ground and not below it; the stand-in figure in the preview shows this. Centred alone in a 38 px square, that picture would be lost. So the icon is the same design drawn at 1.45x (about 26 by 34) and the portrait at 1.6x. If the integrator wants the strict pair, `bucket(0.78)` is the world picture and can simply be centred.
- **The portraits of the long tools are shortened.** For the hoe, scythe, and fishing rod, the portrait draws the same design with a shorter shaft (30, 33, and 38 units against 44, 49, and 52), so the head stays big in 38 px. Shrinking the whole tool made the scythe blade and the rod into threads.
- **The scythe icon fills the full 19 px width**, with no transparent column left or right. The blade still reads, which is the brief's test, but it is the tightest of the set.
- **The fishing rod at 1x is mostly a one-pixel line** on its top third, with the outline either side of it. It reads at 1x and 2x, but it is the most delicate silhouette here.
- **The lead's tail** is a single strand inside its outline at 1x. The coil and the eye carry the read.
- **The 22.5 deg hammer head** comes out a little blobby, the usual cost of a small square shape at that tilt. It still reads as a hammer.
- **The hoe's 45 deg and 67.5 deg pictures** look a little like an adze, which is fine for a swung tool.

## preview.png

There is one block per item, in this order: pickaxe, hoe, scythe, fishing_rod, knife, hammer, shears, lead, bucket. Each block is labelled with the item and with every picture's name. Left to right it holds:

- every world picture at 3x on grass (0, 22.5, 45, 67.5, 90 deg, or the single picture), with the grip pixel boxed in magenta;
- the icon at 2x on the slot colour `#2a2622`;
- the portrait at 2x on the same slot colour;
- "in hand, 3x": the 0 deg picture held by a plain grey 55 by 26 stand-in figure, its grip on the right hand 14 px above the feet and 10 px out, for scale.

## manifest.json

Each item has `icon` (the canvas size), `portrait: true`, `held` in the brief's shape (`angles` with `src` and `grip` per angle, or `fixed` or `rotate` with `image` and `grip`), `notes`, and one extra key, `sizes`, giving each world PNG's width and height.
