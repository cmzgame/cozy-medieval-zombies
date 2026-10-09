# 06 — Art direction and the dev palette

Michael, 2026-10-09: spooky medieval, a bit haunted, never permanently night. Not Stardew's bright lawn; closer to Tirisfal Glades, a place where Halloween never quite ends. The dev art should carry that identity now, before real art, because a visual identity helps motivation. The character placeholders (the player and the dead) are good as they are and stay.

## The genre test

Three AI reference pieces Michael made earlier set the vibe, not the art: a steel-blue knight with a crimson cape on black, a peasant zombie with olive-green skin and brown rags, dark outlines everywhere. The test for any colour in the world: **what would that peasant zombie be standing in?** Muted, cool-shifted, a little dusky. Saturation lives in a few accents (crimson, harvest yellow, firelight), not in the ground.

## Rules for dev art

- **Walls are thick.** Thin walls read modern; thick walls read chonky and cosy. Thickness is 12 px (the parent's was 6), height 64.
- **Walls are wood planks or stone bricks.** Both carry a face pattern: courses for planks, staggered seams for bricks. Plaster is gone.
- **Windows are open holes with a frame and a sill.** No glass in this village. Shutters come later as state on the window; for now every window is open.
- **Floors are wood or stone indoors; grass, dirt, or farm outdoors.** No cobbles or concrete greys. Roads are dirt. A farm tile is harvest yellow with furrows.
- **Grass is dull.** A greyed green with a hint of blue, not a mowed lawn.
- **Fog is dusky purple at a light hand.** What you cannot see is shaded clearly but never distracts from what is there.
- **Backgrounds are near-black purple**, not blue-grey.

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
| Tree canopy | `#3d5b3b` | darker and bluer than before |
| Bed | `#8a4a44` | a muted red accent |
| Table, chest, barrel | `#7a5a3c`, `#5e4630`, `#6a4d33` | browns, no orange |
| Fog | `rgba(22, 14, 32, 0.46)` | |
| Canvas background | `#16121c` | |

All of it is tunable and all of it is placeholder. Real art replaces files, not code.
