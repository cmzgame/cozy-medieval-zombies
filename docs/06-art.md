# 06 — Art direction and the dev palette

Michael, 2026-10-09: spooky medieval, a bit haunted, never permanently night. Not Stardew's bright lawn; closer to Tirisfal Glades, a place where Halloween never quite ends. The dev art should carry that identity now, before real art, because a visual identity helps motivation. The character placeholders were kept at first; later the same day the player got worn yellowed linen with sleeves and brown breeches (no denim), and the dead stayed as they were.

## The genre test

Three AI reference pieces Michael made earlier set the vibe, not the art: a steel-blue knight with a crimson cape on black, a peasant zombie with olive-green skin and brown rags, dark outlines everywhere. The test for any colour in the world: **what would that peasant zombie be standing in?** Muted, cool-shifted, a little dusky. Saturation lives in a few accents (crimson, harvest yellow, firelight), not in the ground.

## Gloomwood: the two registers

Michael's clearest statement of the vibe (2026-10-09), word-vomit mood board and all. The working name he had on the reference art was **Gloomwood**. Two registers pull against each other and both should exist somehow:

- **The cosy register is aggressively autumn.** Harvest colours, pumpkins, ochre and amber. The north star: it can never get so grim that farming feels bad.
- **The gloomy register is Tirisfal.** Dark, earthy, blues and purples and greens mixed in. A green vial of poison. A plague doctor. Not as bright as Tirisfal itself.

It is a balancing act the whole way, and the answer is **by zone**: the two registers do not share a wood. Blue and purple canopies next to orange ones looked like Halloween candy (2026-10-09), so the first map is all harvest, and the gloomy register's trees wait on file for a zone of their own. More forest than plains, and the forest is scattered by rule rather than placed by hand.

## Rules for dev art

- **Walls are thick.** Thin walls read modern; thick walls read chonky and cosy. Thickness is 12 px (the parent's was 6), height 64.
- **Walls are wood planks or stone bricks.** Both carry a face pattern: courses for planks, staggered seams for bricks. Plaster is gone.
- **Windows are holes with a frame, a sill, and wooden shutters.** No glass in this village. Closed shutters are two plank leaves meeting in the middle; open ones swing out on the outside of the wall at the jambs.
- **Doors are plank leaves with two dark metal strips.** Closed, the leaf fills the doorway; open, it swings out on the outside at the hinge jamb.
- **Fittings are one wood everywhere** (`#5e4028`, strips `#2b2a32`), whatever the wall is made of.
- **The setting is dark medieval fantasy.** Skeletons, plague doctors, scarecrow men would fit. Never a ceiling.
- **Floors are wood or stone indoors; grass, dirt, farm, or cobble outdoors.** Re-decided 2026-10-11 (`15-ground.md`): cobblestone is allowed for squares and later roads, in dusky warm greys, never concrete; it is always laid in a dirt verge and never touches grass. Roads are dirt until authored otherwise. A farm tile is harvest yellow with furrows. The earth blends with ragged edges; laid floors are hard diamonds; there is no checker anywhere.
- **Grass is dull.** A greyed green with a hint of blue, not a mowed lawn. Since the ground kit (2026-10-11) the grass is Michael's drawn tiles with base `(75, 95, 61)`, tinted per chunk between lush and dry and darker under canopy (`15-ground.md`).
- **Fog is dusky purple at a light hand.** What you cannot see is shaded clearly but never distracts from what is there.
- **Backgrounds are near-black purple**, not blue-grey.
- **The player behind a tree is seen through a soft hole in the canopy**, not through a faded tree, so overlapping canopies never stack into mud. **The dead are not**: a zombie behind a tree is hidden by it, and its health bar hides too, so a forest never gives laser vision (Michael, 2026-10-11).
- **The trees are drawn art now** (Michael, made with Claude Design, brought in 2026-10-11): 36 PNGs in `data/art/trees/`, tightly cropped RGBA at native size, named `tree_<shape>_<S|M|L>_<colour>.png`: two shapes, **oak** (round, layered) and **spire** (conical, tiered), three sheet sizes, six colours (green, yellow, orange, red, blue, purple). **The game's tiers are not the sheet's sizes (Michael, 2026-10-11: the sheet's small tree stood about as tall as the player and read far too short, while the old giants read as a normal large tree).** The small tier is gone; the sheet's S is the game's `m`, M is `l`, and L is the giant, id suffix `old`; and **every sprite is drawn 1.5 times bigger** (the definition's `scale`, below). Each definition in `data/sprites/` has `image`, `scale`, `frames` (`idle_0`, the whole PNG, in native pixels), `anchor` (the trunk's base centre, four pixels above the bottom), `bounds` (the whole frame, used by the occlusion and hit tests), and `collide` and `wood`. **`scale`:** the loader resamples the PNG once, at load, into a canvas that many times larger (smoothed, so the pixel steps stay even), and scales frames, anchor, and bounds with it, so the world still draws it 1:1; an optional `"smooth": false` makes the resample nearest-neighbour instead. Native-resolution sprites at the final size would be crisper; this is the stand-in until Michael draws them. Ids: `tree_oak_<m|l|old>` is the green oak, `tree_orange_*`, `tree_yellow_*`, `tree_red_*` the other harvest oaks, `tree_blue_*` and `tree_purple_*` the gloom oaks; the spires `tree_spire_<colour>_<m|l|old>`. The harvest biome in `data/maps/square.json`: oak `m` and `l` weigh 1, oak giants 0.5, spire `m` and `l` 0.5, spire giants 0.25, so **giants are one tree in five** (was one in fifty) and about a third of the forest is spires; the gloom colours are defined, not placed. The drawn trees have no ground shadow baked in; a soft one under the trunk is an option if they read as floating. **Redrawn at final size (Michael's `trees_v2` from Claude Design, 2026-10-11):** the trees are now drawn natively at the size the game shows them, so the `scale` is gone from every definition and they are crisp: oak about 82×104, 114×144, 156×197 and spire about 72×113, 95×154, 130×211 (within a few pixels by colour), detail at the same pixel size as before, the trunk six pixels above the frame's bottom, the anchor four rows above the trunk's lowest pixel. The loader's `scale` field stays for any future art that needs it.
- **Tree canopies are lumpy, not round.** A jittered polygon, trunks taper with a root flare, not a rectangle (`src/placeholders.js`, `generateTree`, 2026-10-11). A cartoon-circle canopy reads "happy", and the same shapes have to carry Gloomwood's blue and purple trees later without a mood change, so the outline stays a little ragged on purpose.

## The palette, as of 2026-10-09

| Thing | Colour | Note |
|---|---|---|
| Grass | drawn tiles, base `#4b5f3d` (was `#596f49` / `#526842` flat) | dull, cool; tinted 0.88 to 1.12 by patch noise, up to 20% darker under canopy |
| Dirt | `#6e5a43`, specks `#5e4c37` and `#7a6650` (generated world texture until drawn) | roads; blends into grass with a ragged edge |
| Cobble | stone `#6a6058`, top `#756a61`, gaps `#4a433d` (generated until drawn) | round stones packed at random, not rows; the square and its paths (a setting compares dirt); always in a dirt verge, never on grass |
| Water (trial) | `#2f4a54`, ripples `#557880`, troughs `#253d46` (generated) | a 2×2 trial pond in a dirt bank; likely removed |
| Farm | `#a08c3c` / `#988536`, furrows `#6b5c26` | the one warm ground |
| Wood floor | `#5e452f` / `#573f2b` | |
| Stone floor | `#67645e` / `#5f5c56` | |
| Wood wall | `#6e4b32` planks | |
| Stone wall | `#7b7670` bricks | |
| Trees, harvest | drawn: green, yellow, orange, red, in two shapes (oak, spire), at final size | `m`: oak about 104 px tall, spire 113; `l`: oak 144, spire 154; giant (`old`): oak 197, spire 211; trunks collide at 0.18, 0.22, and 0.3 tiles; wood 3, 4, and 6; big, and they overlap |
| Giants | the sheet's L size, in the same colours; the old generated ones (`#36502e` and `#9a5826`) are gone | the "normal large tree" of the forest, one in five |
| Trees, gloom (drawn, on file) | blue and purple, both shapes and all sizes; the generated placeholders were `#3a4e62` and `#4a3b5e` | for a later zone, not placed |
| Player | shirt `#c9b98e`, sleeves `#bfae84`, breeches `#5a4030`, boots `#3a2a1c` | worn yellowed linen with sleeves, brown, no denim |
| The dead | unchanged | dusty purple shirt, kept |
| Bed | `#8a4a44` | a muted red accent |
| Table, chest, barrel | `#7a5a3c`, `#5e4630`, `#6a4d33` | browns, no orange; the barrel is round and collides at 0.26 tiles |
| Door and shutter wood | `#5e4028`, strips `#2b2a32` | the same on every building |
| Jack-o'-lantern | body `#c8692a`, stem `#5a3d22`, fire `#ffb347` to `#ffd37a` | October 2026 |
| Fog | `rgba(22, 14, 32, 0.36)` | lowered twice from 0.74 |
| Canvas background | `#16121c` | |

All of it is tunable and all of it is placeholder. Real art replaces files, not code. Colours, sizes, and collision radii live in `data/sprites/*.json`; when one changes, this table changes with it.
