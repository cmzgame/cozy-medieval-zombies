# Art round 5, group A: vials, potions, poisons

Nine items: the two empty vials, the three potions, the two poisons, and the two poisoned arrows. Each is one design drawn twice, as round 4 did it:

- `out/<id>_world.png`: the thing at 1x, tightly cropped, held `fixed` (one upright picture glued to the hand).
- `out/<id>_icon.png`: the same pixels on the bag cell, not scaled.
- `out/<id>_portrait.png`, 38 by 38: the three potions and the two poisons, which sit in belt slots.

Michael's ruling (2026-10-25, `docs/47` section 8) drives the design. The vials are clay, earthen and opaque, so a potion's kind shows on the outside: a wax seal over the stopper and a glazed band round the shoulder, both in the potion's colour.

Run `python gen.py` to write `out/`, `manifest.json`, and `preview.png`. `python gen.py --zoom` also writes three 6x to 10x working sheets to `work/`. The script is deterministic and uses no randomness; two runs give identical bytes (checked).

## Method

- **The vials (11 by 15 and 11 by 16) are a hand-pixelled grid** (`docs/art/01`: hand-pixel anything under about 20 px).
  - One body grid of tone letters (glint, light, base, shade, dark) is shared by all seven. It sits under one of two tops: an open mouth (the far rim, the dark mouth, and the rolled lip) or a wax-sealed top (a dome over the cork and the lip, and a run of wax down the neck on the shade side).
  - The glazed band is a mask laid over the body: two rows round the shoulder, sagging one pixel at the front as a ring does when seen from above. The glaze takes the body's light and dark at each pixel, plus a glint on the lit side.
  - `ring()` closes the `#2b2522` outline all the way round.
- **The portraits are the same design drawn larger** by a small shaded-solid rasteriser: an ellipsoid belly, a cylinder neck, a rolled lip, and a wax dome. Light comes from the upper left, and the tones are stepped by thresholds into the same five-tone ramps, never blended. The proportions match the small vial: the belly is three times the neck, and the lip is between them.
- **The poisoned arrows are round 4's arrow.** Its grids (`tools/art-gen/round4/weapons/gen.py`) are re-typed here. The script checks the unstained grids against `data/art/items/arrow_icon.png` and `arrow_world.png` and prints `arrow icon matches round 4: True | world matches: True`. Only the head's palette and a few pixels change.

## The pieces

| id | world (w x h) | grip (x, y) | icon | portrait | what it is |
|---|---|---|---|---|---|
| unfired_vial | 11 x 15 | 5, 9 | 19 x 19 | no | Round 4's grey-brown clay, dry and matte with no glint, and four darker specks. Open mouth, no stopper. |
| clay_vial | 11 x 15 | 5, 9 | 19 x 19 | no | Fired: round 4's honey-jar terracotta, with a glint on the lit shoulder. **Empty, mouth open, no cork.** The data says "bare: unsealed and unglazed", and the open mouth tells it apart from a sealed potion at a glance. |
| healing_potion | 11 x 16 | 5, 10 | 19 x 19 | yes | The fired vial, sealed in red wax (`#c8323a`), with a red glazed band. |
| stamina_potion | 11 x 16 | 5, 10 | 19 x 19 | yes | Gold, `#e0b030`, read from `data/items.json`. |
| mana_potion | 11 x 16 | 5, 10 | 19 x 19 | yes | Blue, `#3a6ad8`, read from `data/items.json`. |
| poison | 11 x 16 | 5, 10 | 19 x 19 | yes | Green wax and band (`#4aa040`). **One drip of the green glaze runs down the belly from the band:** the mark of a poison. |
| strong_poison | 11 x 16 | 5, 10 | 19 x 19 | yes | `docs/47` section 8: a **black seal** and a darker green band (`#2a6a2a`), with **two drips**. |
| poison_arrow | 5 x 24 | 2, 12 | 19 x 38 | no | Round 4's arrow with its iron head stained a grey-green, a pale wet glint kept, and brighter green pooled on the head's lower edge and wetting the socket and the binding. |
| strong_poison_arrow | 5 x 24 | 2, 12 | 19 x 38 | no | Darker green and wetter. The head has more glints. In the icon, a runnel runs five pixels down the shaft and ends in a bead that bulges past the shaft's outline. In the world picture, the stain runs three pixels down the shaft. |

All grips are measured from the world PNG's top-left. A vial's grip is the belly's middle, where the fingers close. An arrow's grip is the shaft's middle, as on round 4's arrow.

**Placement in the cell.** All nine stack (vials to 10, potions and poisons to 5, arrows to 20), so every icon keeps the lower right clear for the count. The script checks that the corner's 6 by 7 art pixels are empty.
- A vial is shifted 2 px left of centre, at x 2 to 12.
- The arrows sit exactly where round 4's arrow does: 3 px left and 1 px up.

## Checks run by the script

- Alpha is only 0 and 255 everywhere.
- Every edge pixel is the outline colour, in every world picture, icon, and portrait.
- Every grip lands on an opaque pixel.
- The count corner of every icon is clear.
- The unstained arrow grids match round 4 pixel for pixel.

## preview.png

From top to bottom:
1. The icons at 2x in a bag slot, with a count drawn where the bag puts it, and each at 1x.
2. The five portraits at 2x in a slot and at 1x.
3. The world pictures at 4x, with each grip boxed in cyan.
4. A 55 px stand-in figure holding each item at its grip, at 1x on grass and on floor wood. Round 4's honey, waterskin, and arrow are held beside them for scale.
5. A selection at 3x.

## Choices and anything weak

- **Black wax is lifted.** The data's `#1a1a1a` is darker than the outline, `#2b2522`, and would vanish into it. The seal is a charcoal ramp instead, with `#423e48` as its base. It still reads as black next to the colours.
- **The vials are 11 px wide in a 19 px cell.** They look small in the bag, which is honest: a vial is smaller than round 4's honey jar (16 by 16). In the hand, it sits about hand-sized beside the 55 px figure. A bigger vial would be a bigger design, not an upscale.
- **Weakest: telling the poison from the potions at 1x.** At 2x in the bag, the drip reads clearly. At 1x in the world, the poison is "the green one" and the strong poison "the dark one with the black cap", which is enough but relies on colour. A skull would be too much at this size, as the brief says.
- **Second weakest: the stained arrowheads.** The grey-green head reads as stained iron at 2x and beside a plain arrow. At 1x, the ordinary poison arrow is only a little greener than a plain one. The strong one is clearly darker, and its shaft is wet. If the ordinary one needs to read more strongly, the next step is to push its head's base tone toward `#4aa040`. The first try did that, and the head then read as a leaf rather than iron.
- **The portrait's wax dome.** The first version was wider than the lip and read as a toadstool cap, the red one especially. It was narrowed to the lip's width, and its single top pixel was cut, so it now reads as a seal.
- **No cork shows on the potions.** The wax covers the cork entirely, as a dipped seal does. The brief's "corked" is only implied by the dome's shape.
