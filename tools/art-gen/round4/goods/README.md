# Art round 4, group C: food and materials

Ten goods, each one design in two renderings, the method of the apple, bread, stone and seed pouches:

- `out/<id>_world.png`: the thing at the size it fills, tightly cropped, held `fixed` (one upright picture glued to the hand).
- `out/<id>_icon.png`: the same pixels centred on the 19 by 19 bag cell, not scaled.
- No portraits. None of these is held as a tool or worn, so `portrait: false`.

`gen.py` draws them all (`python gen.py`; `python gen.py --zoom` also writes `work/zoom.png`, a 10x working sheet). It is deterministic and uses no randomness: two runs give identical bytes. Nine of the ten are hand-pixelled ASCII grids with a palette each. Charcoal is three faceted polygons drawn back to front, each wrapped in its own outline. `ring()` closes the `#2b2522` outline round every picture, so a gap in a hand-drawn edge cannot leak. Checked by script: alpha is only 0 and 255, every edge pixel is the outline colour, every crop is tight, and every grip pixel is opaque.

## The pieces

| id | world (w x h) | grip (x, y) | what it is |
|---|---|---|---|
| cheese | 17 x 13 | 9, 8 | a wheel with a quarter wedge cut out: golden rind on the top and side, pale paste with two small eyes on the cut |
| honey | 16 x 16 | 7, 11 | the jar of honey: a squat terracotta jar with a linen cover tied at the neck with twine; honey shows under the cloth's points, and one drip runs down the lit shoulder |
| potato | 15 x 11 | 7, 5 | a lumpy tan tuber with three eyes, in the potato crop's skin colours |
| cabbage | 15 x 14 | 7, 7 | a pale heart wrapped by two outer leaves (the left lit, the right in shade) with pale veins and a cut stem; the cabbage crop's greens |
| garlic | 13 x 14 | 6, 8 | a papery cream bulb with clove lines, purple streaks, a dried neck and a root tuft; the garlic crop's colours |
| iron_bar | 16 x 8 | 7, 4 | a small dark ingot: a lit top with a cast mark, the front in mid iron, the right end in shade (the iron ramp of `docs/art/07`) |
| cloth | 16 x 10 | 8, 5 | a folded bolt of undyed linen, four folds on the front, a twine tie across it |
| rag | 17 x 13 | 8, 6 | a torn scrap of dingy cloth: one corner folded over, ragged bottom and right edges, brown stains |
| charcoal | 17 x 14 | 8, 7 | three angular lumps: a broken stick at the back, a chunk on the right, a small one in front; a cool silvery sheen on the tops and grain cracks |
| clay | 17 x 12 | 8, 6 | a slumped dollop of wet grey-brown river clay with a glossy streak on its lit shoulder and a thumb dent |

Every icon is 19 x 19, and every grip is from the world PNG's top-left. `manifest.json` has each entry as `{icon, portrait: false, held: {mode: "fixed", image, grip}, world_size, notes}`.

For scale: the existing apple is 13 x 15, the bread 16 x 12 and the stone 14 x 11. These goods are 13 to 17 px wide, so each icon keeps at least one clear pixel round it in the cell.

## preview.png

- **Row 1:** every icon at 2x in a `#2a2622` slot, with the same icon at 1x beside it.
- **Row 2:** every world picture at 3x.
- **Row 3:** the same pictures with the grip pixel boxed in cyan, labelled with size and grip.
- **Below:** the ten at 1x on grass and on floor wood, and the same strip at 3x. Each strip ends with the existing drawn apple, bread, stone and tinderbox for comparison.

Every row runs in this order: cheese, honey, potato, cabbage, garlic, iron_bar, cloth, rag, charcoal, clay.

## Notes and choices

- **Stacking:** none of the ten stacks today (no `stack` in `data/items.json`), so no lower-right corner is kept clear. If one becomes stackable, the cheese, rag, charcoal and clay reach the cell's lower right and would need a redraw.
- **Charcoal is lifted to a dark grey** (`#4c4852` base, `#6a6874` tops, `#9a98a4` sheen). The item's own colour, `#2a2626`, is the outline's colour and the slot's colour, and lumps drawn in it would disappear.
- **Clay is grey-brown, as the brief asks.** The clay bank and the old generated icon are orange (`#b0683c`), so the bank and the item will disagree in colour until the bank is drawn too.
- **The honey jar is the clay jar to come, drawn full.** An empty clay jar could reuse its body: the same jar without the cloth, the twine or the honey.
- **Weakest piece: clay.** It reads as a soft lump at 2x, and next to the stone it is browner, darker and dollop-shaped. At 1x it could still pass for a dirt clod; only its name says clay for certain. The cheese wheel is the second weakest. At 15 px of fill the cut wedge is small, though it still reads as cheese.
