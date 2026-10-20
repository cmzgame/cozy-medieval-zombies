# The wood pass, two rugs, eight wall paintings (Michael, 2026-10-20)

Three things in one zip, each in its own folder with its JSON, previews in `previews/` at 1x and 3x (icons at 2x), generators in `generators/`.

## 1. The wood pass (`woods/`)

**One tone table, `wood_tones.json`, and a swap.** Every tone of the oak set (the wood wall, its post, the door and shutter leaves) has a role in the table (`roles`: plank lit / shade / top, grain, gap, beam, frame, post, leaf and the leaf's gap and grain). A wood is a base colour; its ramp is the oak ramp carried over in Lab (each oak tone's offset from the oak base `#6e4b32` applied to the new base; the hue offsets scaled by `chroma_kept`, 0.35 for the frost-grey winter pine so it stays grey, 0.8 for the spruce). The five woods' tables are in the JSON (`tables`, oak hex to new hex), and `generators/woods.py` applies them to the shipped PNGs: **nothing is redrawn, every pixel is a lookup**. Tuning a wood is editing its base (or any single tone in its table) and re-running; adding a sixth is one line.

| Wood | Base | Plank lit | Plank shade | Gap (lit face) | Leaf |
|---|---|---|---|---|---|
| oak | `#6e4b32` | `#7a5538` | `#523926` | `#3e2a1c` | `#6c4b30` |
| spruce | `#a0845a` | `#ad8f61` | `#836f4b` | `#6d5e3f` | `#9e8458` |
| mahogany | `#6e3424` | `#7a3e2a` | `#522319` | `#3e150e` | `#6c3422` |
| winterpine | `#b4ad9f` | `#c0b9a9` | `#99968b` | `#85847a` | `#b3ac9e` |
| bloodbark | `#561a1e` | `#622424` | `#3b0912` | `#2b0002` | `#541b1c` |

- **Oak is the art as drawn** (`wall_wood_*`, `post_wood`, the `_wood_` leaves): no new files.
- **Spruce, mahogany, winterpine, bloodbark:** 23 files each: `wall_<wood>_<north|west>_<5 variants>`, `post_<wood>`, and the leaves and shutters `door_open[_far]_<wood>_<o>`, `shutter[_far]_<left|right>_<wood>_<o>`, so a house in that wood has doors in that wood. If you'd rather doors stay one wood on every building (round 1's rule), use the `_wood_` leaves and drop the rest; the shut door painted into `door_shut` follows the wall's table either way (the `leaf_*` roles). Anchors are the oak set's, in `anchors_woods.json`.
- **Bloodbark** I kept at your base but it is the darkest thing in the set; its lit face `#622424` is where it reads. If it goes murky at night, the lever is `chroma_kept` or a touch more L on the base.
- **`daub`** (11 files, walls and post only, oak leaves) is not a wood: the oak wall with the plank fills limewashed (`#cfc3a8` lit, `#9a9078` shade, `#ddd2b8` top) and the gaps and beams left as oak timbers, so it reads as timber frame and plaster. It is the swap from the mock, delivered because you liked it; a proper half-timbered redraw (studs, a brace, grime at the floor) would be a round of its own and I'd still recommend it for interiors.
- `previews/woods_six`: oak, spruce, mahogany, winter pine, bloodbark, daub, each with a window, an open door and open shutters.
- **What the table does not cover yet:** the furniture wood (`#7d5a3c` set), the fence (its own weathered grey-tan by design), the floors, the plank and the hafts of the items. Those get roles when the furniture pass comes; the furniture generator's palette is already a dict.

## 2. The rugs (`rugs/`)

Flat on the ground plane, 2 x 3 tiles with the long side along world y, no outline (decoration), walkable (that is the map entry's `solid: false`). Each was drawn as a 64 x 96 top-down texture, one texel per world unit like the floors, and projected onto the ground, so its pattern lies on the plane rather than being painted onto a parallelogram. `rug_bearskin.json` and `rug_regal_red.json` are the bed's shape (`facings` y and x, `facingFootprint`, the x facing a mirror of the y drawing); `previews/rugs_floors` shows both on a floor, and the red one mirrored along x.

| File | Size | anchor_px | grip_px | footprint |
|---|---|---|---|---|
| `rug_bearskin.png` | 110 x 56 | (77, -15) | (55, 28) | 2 x 3 along y |
| `rug_regal_red.png` | 146 x 74 | (89, -3) | (73, 37) | 2 x 3 along y |

- **Bearskin:** a shaped hide, the head (ears, a light snout, a dark nose, two eyes) at the far (-y) end, four splayed legs with three-toed paws, a ragged edge, warm brown fur (`#6e4f36` with `#4e3826` streaks and `#8e6c4a` flecks) darker toward the edge, the darkest tone (`#3a2a1d`) along the silhouette itself so it reads on a wood floor, and a lighter belly (`#8e7050` / `#a08a66`). It sits on a wood floor only because of that edge and the belly; on stone it is easy.
- **Regal red:** a `#7e1f1c` field with a woven `#6a1a18` texture, a 7 px gold border (`#c39a44`, `#8a6a2a`) with a dark line and a trim of alternating diamonds, a lozenge medallion with a dark heart, four small motifs in the field, two worn patches (`#8e3a30` fading) where feet go, a frayed corner and a nibbled edge.
- **The bag icons** are the rugs rolled, 1 x 4 (19 x 76), outlined as items: a standing roll with the spiral in its end and a cord round the middle; the regal one shows its red and gold, the bear's head pokes out of the top of its roll.

## 3. The wall paintings (`paintings/`)

Eight pictures, each hung on both wall orientations (16 PNGs) and each with a bag icon (8). The wall can't hang things yet, so these are drawn to your geometry and wait for the system.

- **How they are hung.** Each picture was drawn flat (sky in three or four bands, hills, a few shapes, the style bible's muted tones), framed with a 2 px frame, and then placed on the wall face with the wall renderer: a 1.5 px thin box standing on the face, its front the picture, its rim the frame, so the skew, the frame's lit top and shaded side, and the anchor are the wall's own. The north ones are drawn on the +y face (lit), the west on the +x face (shade), both rendered, not mirrored, so the frames' light is right. They are hung **proud of the stone face (8.5 px from the edge line)**, as the boards are, so one set serves wood (7), stone (8) and log (9); on a log wall the picture sits half a pixel into the face, which the painter's order hides (it is drawn after its wall). `previews/paintings_rooms` shows them on wood, stone and log walls, both orientations, with a rug on the floor.
- **Anchors** are the wall convention, the tile's top vertex at ground level (`anchorVertex: "top"`), the same as the wall segment they hang on; the painting is then drawn right after its segment like a leaf or a board. The table also gives the hang in wall terms, like the torch bracket: how far along the edge from the far vertex the frame starts (3 px, so it clears the post), and the height of the frame's bottom (46 px up for the top slot, 14 for the tall ones). A landscape spans two sections: anchor it on the first (far) section; it crosses the joint, where a same-material run has no post.
- **Sizes on the face:** small 26 x 28 (one section, the top slot), tall 26 x 56 (one section, both slots), landscape 55 x 28 (two sections, the top slot). **Frames:** dark oak (`#4a3322` / `#3e2a1c`, top `#6e4b32`) on all but the castle, which is gilded (`#c39a44` / `#8a6a2a`, top `#e2c06a`).
- **The pictures:** `small_oak` a lone oak on a hill under a pale moon; `small_deer` a deer in a clearing before dark pines; `small_peak` a snow peak at dusk; `tall_waterfall` a fall down a cliff into a pool; `tall_pines` three ranks of pines in mist; `wide_castle` the castle on its hill above village roofs (gilded); `wide_lake` mountains over a lake with their reflections; `wide_sunset` a river winding through a valley at sunset. The flat pictures are in `paintings/flat_*.png` for reference (not game files).
- **Icons:** the picture flat and framed, outlined `#2b2522` as an item, centred on the footprint: small 2 x 2 (38 x 38), tall 2 x 3 (38 x 57), landscape 3 x 2 (57 x 38). The landscapes are 51 px wide inside their frames (55 framed) so they fit the 57 px canvas with a margin.
- **Grips:** every world picture (each hung painting) has a `grip_px` at its centre, as the house rule asks, in `items.json` and the table.

| File | Size | anchor_px (tile top vertex at ground) | grip_px | sections | slot | face w x h | hang: along from the far vertex, bottom z | frame |
|---|---|---|---|---|---|---|---|---|
| `painting_small_oak_north.png` | 29 x 42 | (6, 69) | (14, 21) | 1 | top | 26 x 28 | 3, 46 | wood |
| `painting_small_oak_west.png` | 28 x 42 | (22, 69) | (14, 21) | 1 | top | 26 x 28 | 3, 46 | wood |
| `painting_small_deer_north.png` | 29 x 42 | (6, 69) | (14, 21) | 1 | top | 26 x 28 | 3, 46 | wood |
| `painting_small_deer_west.png` | 28 x 42 | (22, 69) | (14, 21) | 1 | top | 26 x 28 | 3, 46 | wood |
| `painting_small_peak_north.png` | 29 x 42 | (6, 69) | (14, 21) | 1 | top | 26 x 28 | 3, 46 | wood |
| `painting_small_peak_west.png` | 28 x 42 | (22, 69) | (14, 21) | 1 | top | 26 x 28 | 3, 46 | wood |
| `painting_tall_waterfall_north.png` | 29 x 70 | (6, 65) | (14, 35) | 1 | both | 26 x 56 | 3, 14 | wood |
| `painting_tall_waterfall_west.png` | 28 x 70 | (22, 65) | (14, 35) | 1 | both | 26 x 56 | 3, 14 | wood |
| `painting_tall_pines_north.png` | 29 x 70 | (6, 65) | (14, 35) | 1 | both | 26 x 56 | 3, 14 | wood |
| `painting_tall_pines_west.png` | 28 x 70 | (22, 65) | (14, 35) | 1 | both | 26 x 56 | 3, 14 | wood |
| `painting_wide_castle_north.png` | 58 x 57 | (6, 69) | (29, 28) | 2 | top | 55 x 28 | 3, 46 | gilt |
| `painting_wide_castle_west.png` | 57 x 57 | (51, 69) | (28, 28) | 2 | top | 55 x 28 | 3, 46 | gilt |
| `painting_wide_lake_north.png` | 58 x 57 | (6, 69) | (29, 28) | 2 | top | 55 x 28 | 3, 46 | wood |
| `painting_wide_lake_west.png` | 57 x 57 | (51, 69) | (28, 28) | 2 | top | 55 x 28 | 3, 46 | wood |
| `painting_wide_sunset_north.png` | 58 x 57 | (6, 69) | (29, 28) | 2 | top | 55 x 28 | 3, 46 | wood |
| `painting_wide_sunset_west.png` | 57 x 57 | (51, 69) | (28, 28) | 2 | top | 55 x 28 | 3, 46 | wood |

### Icons

| Icon | Footprint | Canvas |
|---|---|---|
| `painting_small_oak_icon.png` | 2 x 2 | 38 x 38 |
| `painting_small_deer_icon.png` | 2 x 2 | 38 x 38 |
| `painting_small_peak_icon.png` | 2 x 2 | 38 x 38 |
| `painting_tall_waterfall_icon.png` | 2 x 3 | 38 x 57 |
| `painting_tall_pines_icon.png` | 2 x 3 | 38 x 57 |
| `painting_wide_castle_icon.png` | 3 x 2 | 57 x 38 |
| `painting_wide_lake_icon.png` | 3 x 2 | 57 x 38 |
| `painting_wide_sunset_icon.png` | 3 x 2 | 57 x 38 |
| `rug_bearskin_icon.png` | 1 x 4 | 19 x 76 |
| `rug_regal_red_icon.png` | 1 x 4 | 19 x 76 |


## Engine questions, left to Michael

- A painting on a wall section next to a corner is partly behind the other wall, as anything on the face is; the previews hang them one section in.
- Whether a painting on a translucent near wall should fade with it, and whether `_far` versions are wanted for a painting seen through a wall from inside (the doors have them): not drawn; say the word.
- The rugs' walkability and the paintings' hanging are the engine's; the art is anchored so both drop into the conventions that exist (the bed's for the rugs, the boards' for the paintings).
