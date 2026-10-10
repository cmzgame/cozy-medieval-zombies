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
- **Floors are wood or stone indoors; grass, dirt, or farm outdoors.** No cobbles or concrete greys. Roads are dirt. A farm tile is harvest yellow with furrows.
- **Grass is dull.** A greyed green with a hint of blue, not a mowed lawn.
- **Fog is dusky purple at a light hand.** What you cannot see is shaded clearly but never distracts from what is there.
- **Backgrounds are near-black purple**, not blue-grey.
- **A character behind a tree is seen through a soft hole in the canopy**, not through a faded tree, so overlapping canopies never stack into mud.
- **Tree canopies are lumpy, not round.** A jittered polygon, trunks taper with a root flare, not a rectangle (`src/placeholders.js`, `generateTree`, 2026-10-11). A cartoon-circle canopy reads "happy", and the same shapes have to carry Gloomwood's blue and purple trees later without a mood change, so the outline stays a little ragged on purpose.

## The palette, as of 2026-10-09

| Thing | Colour | Note |
|---|---|---|
| Grass | `#596f49` / `#526842` | dull, cool |
| Dirt | `#6e5a43` / `#66533e` | roads and the square |
| Farm | `#a08c3c` / `#988536`, furrows `#6b5c26` | the one warm ground |
| Wood floor | `#5e452f` / `#573f2b` | |
| Stone floor | `#67645e` / `#5f5c56` | |
| Wood wall | `#6e4b32` planks | |
| Stone wall | `#7b7670` bricks | |
| Trees, harvest | oak `#3f5a33`, orange `#a4602a`, yellow `#b09038`, red `#8c3a2c`, trunks `#4a3324` | three sizes: 92, 124, and 152 px tall, 56, 78, and 98 wide; trunks collide at 0.14, 0.18, and 0.22 tiles; big, and they overlap |
| Old giants | oak `#36502e`, orange `#9a5826`, trunks `#3e2a1c` | 196 px tall, 134 wide, trunk 0.3 tiles; about one tree in fifty |
| Trees, gloom (on file) | blue `#3a4e62`, purple `#4a3b5e` | for a later zone, not placed |
| Player | shirt `#c9b98e`, sleeves `#bfae84`, breeches `#5a4030`, boots `#3a2a1c` | worn yellowed linen with sleeves, brown, no denim |
| The dead | unchanged | dusty purple shirt, kept |
| Bed | `#8a4a44` | a muted red accent |
| Table, chest, barrel | `#7a5a3c`, `#5e4630`, `#6a4d33` | browns, no orange; the barrel is round and collides at 0.26 tiles |
| Door and shutter wood | `#5e4028`, strips `#2b2a32` | the same on every building |
| Jack-o'-lantern | body `#c8692a`, stem `#5a3d22`, fire `#ffb347` to `#ffd37a` | October 2026 |
| Fog | `rgba(22, 14, 32, 0.36)` | lowered twice from 0.74 |
| Canvas background | `#16121c` | |

All of it is tunable and all of it is placeholder. Real art replaces files, not code. Colours, sizes, and collision radii live in `data/sprites/*.json`; when one changes, this table changes with it.
