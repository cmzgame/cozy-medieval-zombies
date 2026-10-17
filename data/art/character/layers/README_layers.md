# Painted parts for the slicer, round 1 (2026-10-12; hair revised the same evening)

Thirty-six layers painted on the rig's template per `docs/28-painting-for-the-slicer.md`: one slot per file, 768 x 576, the garment alone, whole 4 x 4 blocks, two tones where the dye wants them. **Every file has been run through `tools/slice.html` here: 0 ragged blocks, nothing dropped, on all thirty-six** (the reports are in `sliced/reports.json`). The slicer's own output for each, the layer JSON it would save, is in `sliced/` with a worn preview per layer; use those files or slice the PNGs yourself, the result is the same.

What is in it, against Michael's ask (2026-10-12): the starting outfit redrawn (the long tunic, the belt, the dark breeches and boots), the onion hat as the hero head item with two variants, three men's hair (crop, mohawk, high and tight) and three women's (long, pigtails, bob), three beards, at least three items in every painted slot, and the knight.

## The files, by slot

Slicer options are what to set before Slice (the sliced JSONs already have them). Item specs are for `data/items.json`: the engine fills the base (the torso under the near arm, the far arm's sleeve, a long tunic's extra hem rows) from the item's own colours, so they should match the painting's tones.

| File | Slot | Slicer options | What it is, and the item it goes on |
|---|---|---|---|
| `hair_crop.png` | hair | dye | the generic short crop, two tones (replaces the generated `short`); no flip at the back on the three-quarter view, and from the side the hair arches over the ear |
| `hair_mohawk.png` | hair | dye | a medium mohawk: the sides shaved (bare head), a jagged fin six pixels over the skull, down the forehead in front and to the nape behind. Revised 2026-10-18 (Michael's pick, "(a) soft", `docs/02`): the three-quarter facings re-cut, the side rounded, all eight painted; front and back unchanged; `preview_hair.png` predates it |
| `hair_tight.png` | hair | dye | high and tight: a short flat top brushed up at the front, shaved to the temples and above the ear, tapering at the back |
| `hair_long.png` | hair | dye | long and loose to the shoulders (replaces the generated `long`); from the side only the near side and the mane down the back hang, nothing in front of the face |
| `hair_pigtails.png` | hair | dye | a middle parting and two pigtails tied at the sides of the head, hanging past the shoulders and flicking out at the tips; from the side the near one hangs from behind the ear |
| `hair_bob.png` | hair | dye | a bob to the jaw with a straight fringe; from the side the curtain starts two pixels behind the eye |
| `beard_moustache.png` | beard | dye | the cop moustache: a thick bar, drooping corners |
| `beard_gnome.png` | beard | dye | the big bushy gnome beard, to the chest |
| `beard_cropped.png` | beard | dye | tight along the jaw and cheeks, tufts in the edge |
| `head_onion.png` | head | | **the onion hat**, the hero: shape `hood`, colours `#5f8a3a #46682a`; a slit for the eyes, a tall nub, a fold round the brow |
| `head_onion_b_brow.png` | head | | **the onion hat in the game** (Michael picked it, 2026-10-18: "b brow is perfect!"): the hero redrawn with the opening cut round where the game draws the eyes in every facing and the fold raised above the brow; every facing painted, not mirrored. Sliced to `data/layers/head/onion.json`, worn by the item `hood` (`art.painted: "onion"`, colours `#5f8a3a #46682a`); its generator is `tools/art-gen/character/onion2.py` (`python onion2.py <repo> <out> b`) |
| `head_onion_flop.png` | head | | the onion hat with a taller nub that flops over |
| `head_onion_squat.png` | head | | the onion hat with a short squat nub and a wider slit |
| `head_straw_hat.png` | head | | a straw hat: wide brim, domed crown, a band; dark hair painted under the brim at the sides and back (a painted head item replaces the hair) |
| `head_coif.png` | head | | a cloth coif tied under the chin, the face free (replaces the generated `cap`) |
| `head_greathelm.png` | head | | the knight's great helm: flat top, the eye slit, a nasal band, a cross of breaths each side (replaces the generated `helm`) |
| `chest_tunic.png` | chest | length shirt | the tunic: shape `tunic`, colours `#c9b98e #a8966f`; sleeves to mid upper arm, a round collar, a hem row |
| `chest_tunic_long.png` | chest | length long | the same painting, **the starting outfit's long tunic**; see the slicer note below |
| `chest_tunic_cross.png` | chest | length long | a white long tunic with a black cross: colours `#e8e4d8 #c2bdb0` |
| `chest_jerkin.png` | chest | length shirt | a leather jerkin over a cloth shirt: colours `#7a4e2c #5c3a20`; the shirt's sleeves to the elbow, an open neck, a front seam, two buckles |
| `chest_dress.png` | chest | length long, hide the belt, covers legs | a long dress: colours `#6d5a86 #52446a`; sleeves to the wrist, a trimmed neckline; the breeches hide and the shoes show |
| `chest_surcoat.png` | chest | length long | **the knight's surcoat** with the black cross over mail sleeves, and oversized pauldrons (free-part pixels past the shoulders, outlined); item colours mail grey `#8e9099 #62646e` so the far arm's sleeve is mail, not white |
| `legs_breeches.png` | legs | | breeches to the shin, a hem row: colours `#5a4030 #43301f` (**the starting outfit**) |
| `legs_hose.png` | legs | | hose to the ankle: colours `#4a4a3a #36362a` |
| `legs_patched.png` | legs | | patched trousers: colours `#6e5a3c #54432c`, a lighter patch on each knee |
| `legs_chausses.png` | legs | | the knight's mail chausses: colours `#8e9099 #62646e` |
| `feet_boots.png` | feet | | boots from the shin with a cuff row and a dark sole: colours `#4a3522 #36261a` (**the starting outfit**) |
| `feet_turnshoes.png` | feet | | low turnshoes with a seam: colours `#6b4a2a #4e3419` |
| `feet_wraps.png` | feet | | cloth wraps to the ankle, bare toes: colours `#b8a78a #948366` |
| `feet_greaves.png` | feet | | the knight's plate greaves and sabatons, a bright cuff and knee cop: colours `#a0a2ac #6e707a` |
| `hands_gloves.png` | hands | | leather gloves with a cuff line: colours `#6b4a2a #4e3419` |
| `hands_gauntlets.png` | hands | | plate gauntlets with a flared cuff one pixel past the wrist (outlined): colours `#9a9ca6 #6a6c76` |
| `hands_wraps.png` | hands | | cloth hand wraps: colours `#c9b98e #a8966f` |
| `waist_belt.png` | waist | | the plain belt with a buckle: colours `#6b4a2a #4a3219` (**the starting outfit**) |
| `waist_pouch_belt.png` | waist | | a belt with a pouch on the figure's left hip (asymmetric, all eight painted) |
| `waist_rope.png` | waist | | a tied cord with a knot and hanging ends: colours `#b8a67c #8f7f5c` |
| `waist_sword_belt.png` | waist | | the knight's sword belt, a big buckle and a hanging strap: colours `#7a4e2a #553418` |

**The knight** is `head_greathelm` + `chest_surcoat` + `legs_chausses` + `feet_greaves` + `hands_gauntlets` + `waist_sword_belt`. `preview_knight.png` shows the set. For a plain plate knight without the cross, the surcoat's torso can be repainted grey in the sprite tool; the pauldrons and sleeves are already metal.

## How they were painted

- Garments on limbs follow the engine's own shade rule (the right-hand 40 percent of each row run one tone darker, light from the upper left), so a painted sleeve matches the generated garment it sits on. No outline against the body; an outline only where a piece extends past the body (pauldrons, gauntlet cuffs, hats, hair, beards).
- Hair, beards and hats are outlined all round, as the generated hair and hood are (they are shapes of their own worn over the head). Hair and beards are exactly two tones plus the outline, for the dye; the eyes are never covered (the onion hat and the helm leave the eye rows open).
- A band round the body (belts, the rope) slants with the iso on the three-quarter views, like the generated belt.
- The far arm is culled by the rig at rest in the side and three-quarter views, so no painting can reach it; the item's colours dress it (which is why the surcoat's item colours are mail grey).
- `e`, `se`, `ne` are mirrors of `w`, `sw`, `nw`; `waist_pouch_belt` is painted per facing.

## Previews

`preview_hair.png`: the six hairstyles as revised, five facings on the body. `preview_all_worn.png`: every layer worn, one row each in the table's order, the eight idle facings then two walk and two attack frames, rendered by the game's own figure code with a stand-in item of the matching colours. `preview_knight.png` and `preview_starting_outfit.png` show the sets on the body.

## For the coding agent

1. **The slicer and a long tunic.** The slicer assigns pixels against the bare body, whose torso ends two rows below the hip; a `length: long` tunic's torso runs six rows below it. Pixels painted on those extra rows would be given to the nearest arm, so they are not painted, and the engine fills them with the item's colour: the hem of `chest_tunic_long`, `chest_tunic_cross`, `chest_dress` and `chest_surcoat` is a flat band of the item colour. If the slicer built its bare body with the chosen `length` (one argument to `bareSpec`), those rows could be painted; until then, matching item colours are the fix.
2. **The slicer's worn preview for the `head` slot draws nothing**, because a painted head piece needs a worn head item (`outfit.head`) and the slicer's bare spec has none; the slicer still reads and saves the layer correctly. A stand-in `{ shape: "cap" }` for the head slot in `wornSheet` would show it (the dead's wardrobe code does the same).
3. **No `back` slot exists** for painted layers, so the sack, rucksack and satchel of `docs/25` are not in this delivery; the bag is still the engine's polygon. If a `back` slot is added (a free part on the torso, drawn behind the body facing the camera and in front facing away, as the polygon is now), three bags follow in a round.
4. Items: every layer above that is not a redraw of an existing shape needs an item (`art.painted` naming the layer, the colours given), and the dress's item needs `covers: ["legs"]`; the hair and beard layers are picked by `look`, the onion hat variants are three head items.
5. The scripts that painted these are in `tools/art-gen/character/` (`paint.py`, `garments.py`, `heads.py`, `knight.py`, `build_all.py`; `slice_check.mjs` runs the slicer headless). A colour or a hem is a number there; a re-roll is one command.
