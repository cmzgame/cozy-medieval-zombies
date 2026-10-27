# Art round 5, group C: mushroom, clay bank, salt

`gen.py` draws everything (`python gen.py`). It is deterministic and uses no randomness, so two runs give identical bytes. It reads the repo only for references: the old definitions, the figure, grass, and the drawn pieces in the preview. Every picture is a hand-pixelled ASCII grid with a palette. Each one is built from parts drawn back to front, and each part gets its own `#2b2522` outline (`ring`), so the line between overlapping parts is drawn too, as on the drawn rocks. The script checks that alpha is only 0 or 255, that every edge pixel is the outline colour, that every crop is tight, and that every grip and anchor pixel is opaque. `work/zoom.png` is a 10x working sheet.

## Items (held `fixed`, no portraits)

| id | world (w x h) | grip (x, y) | icon | what it is |
|---|---|---|---|---|
| mushroom | 16 x 15 | 6, 10 (the big stalk) | 19 x 19 | Two picked brown mushrooms, the drawn nodes' brown kind (`mushroom_2`/`_3` ramp: cap `#8a6842` `#705232` `#543c24`, gills `#2e2014`, stalk `#d6ccb2` `#c2b79c` `#a89c80` `#5e5444`), with the item's `#9a6a44` as the cap glint. A tall one and a short one in front, each with soil crumbs on its pulled foot. |
| salt | 18 x 14 | 8, 6 | 19 x 19 | A heap of coarse white crystals: every grain is a small block, bright at the top left and shaded at the right, with two loose grains at the foot. The ramp runs from the item's own `#d8d0cc`. |

Neither item stacks today (`data/items.json` gives no `stack`), so the cell's lower-right corner is not kept clear. If either becomes stackable, both need a redraw: the small mushroom and the right side of the heap reach that corner.

## Nodes (`out/<id>.png` + `out/<id>.json`)

| id | size | anchor | definition |
|---|---|---|---|
| clay_bank | 34 x 16 | 16, 15 | `image` `data/art/ground/clay_bank.png`, `frames.idle_0`, `anchor`, `bounds` |
| salt_rock | 27 x 26 | 13, 25 | `image` `data/art/ground/salt_rock.png`, as above |

- **Anchors** follow the mushroom nodes: the lowest outline pixel under the middle of the picture, so the foot sits on the tile's centre. This also matches the dev `lump`, which drew its bottom row at the anchor.
- **Definitions:** every non-picture field of today's definition is kept unchanged (`collide`, `carry`, `interactable`, `dig`/`mine`, `name`). `placeholder` is replaced by the picture. Only the `note` changed: its last sentence ("Dev art drawn from this design ...") now says where the drawn art came from.
- **Image paths** assume the files land in `data/art/ground/`, next to the rocks and mushrooms.
- **clay_bank:** a low wet bank of grey-brown river clay, in the drawn clay item's ramp (`#e4dccc` `#9e9080` `#807262` `#665a4c` `#4c4238`, `data/art/items/clay_icon.png`), not the old orange.
  - A lip of turf runs along its crown.
  - Wet glints sit on the lit shoulder, and sediment streaks cross the face.
  - A dug notch is cut into the front: a dark wet inner wall and a floor at ground level with a small puddle of water (`#4a6b7c` `#6f8e9c`, the water palette).
  - Three pebbles and two grass tufts sit at its foot.
  - It is about the size of the old design (half-width 12) plus the pebbles.
- **salt_rock:** a pale grey-white boulder with a smaller one in front, in the drawn rocks' facets (a lit top glinting along its top-left edge, a mid left face, a shaded right face).
  - Rock ramp, slightly pink-grey: `#ece4e0` `#d6cac6` `#b4a6a4` `#8c7e80`.
  - Cubic white salt crystals stand out of the top: one tall prism, one cube, one small cube, and two tiny ones (halite grows in cubes). Crystal ramp: `#ffffff` `#f6f4f4` `#e0dce2` `#b0aab8`, cooler and whiter than the rock.
  - Smaller than the big rocks (47 to 55 px wide); bigger than the dev design (22 px).

## preview.png

- **Top row:** the icons at 2x in a 38 px slot, then at 1x, next to round 4's drawn clay, stone, and potato. Then the worlds at 3x with the grip boxed in cyan, and the nodes at 3x with the anchor boxed in magenta.
- **Middle:** each node at 1x on a grass tile, anchored on the tile's centre, beside drawn mushrooms 2 and 3, rock 1, and the 55 px figure.
- **Bottom:** the same strip at 3x.

## Weak spots

- **clay_bank is the weakest piece.** At 1x it reads as a grey-brown mound with a dark hollow and a glint of water. Without its name it could pass for a low rock or a burrow mouth. The turf lip, the wet glints, and the puddle are what keep it from looking like stone.
- **salt** reads as a white lumpy heap. At 1x the coarse grains blur into a texture, so it could pass for sugar or snow, as any white heap would.
- **Colour fields left orange:** the clay item's `color` in `data/items.json` is still the orange `#b0683c`, used where a block colour is drawn. Neither node definition has a `mapColor` (the rocks have one) or a `shadow`. Whoever wires these in can decide whether to add them.
