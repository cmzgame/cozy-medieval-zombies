# Beehive and chicken coop (docs/29-world/09, requests 1.5.11 and 1.2.11), delivered 2026-10-20

Two village props in the well's manner, built with the same renderer and wood as the well and the furniture: `village/beehive_0..2.png` with `beehive.json`, `village/chicken_coop_0..2.png` with `chicken_coop.json`, `anchors_props.json`, and the previews. Hard pixels, outlined `#2b2522` all round (both are used: a gatherable and a container), no baked shadow, drawn at size. Anchors are `anchorVertex: "top"`, the footprint's top tile's top vertex at ground level.

| File | Size | anchor_px | What |
|---|---|---|---|
| `beehive_0.png` | 47 x 44 | (23, 17) | the skep on its stand, still: `idle_0` |
| `beehive_1.png`, `beehive_2.png` | 47 x 44 | (23, 17) | the same with bees stirring at the entrance, three then five, rising: optional click frames `bees_1`, `bees_2` |
| `chicken_coop_0.png` | 80 x 75 | (53, 33) | the coop along y, door shut: the `y` drawing |
| `chicken_coop_1.png`, `chicken_coop_2.png` | 80 x 75 | (53, 33) | the door half open and open: optional click frames |

**The beehive**, 1 x 1, 30 px to its crown: a straw skep of seven coils, each coil a lit crown over a dark groove with the straw's twist marked every third pixel, narrowing to a knob; a dark arched entrance in the bottom coil on the camera side; a plank stand on two log-end feet. Straw is the rye's gold (`#e2c26a` `#cfa94c` `#b08a36`, grooves `#8a6a26` / `#6e5420`, crowns `#f0d27a`). `beehive.json` has no `clickAnim`, so it sways when clicked as the brief asks; the two bee frames are in the sheet, and the note in the JSON gives the `clickAnim` block to add if the stir is wanted instead (a `clickAnim` stops the sway, as the well's does).

**The chicken coop**, 2 x 1 along world y, 41 px to the ridge: a plank hut on four legs, the floor 8 px up, vertical planks on the long sides, a gable of shingles with the ridge along y and the eaves past the walls, a small door in the near (lit, +y) gable end under a lintel, a cleated ramp from the sill to the ground, and a nesting box with a sloped lid and a dark slot under it on the +x side. The furniture wood (`#7d5a3c` `#6a4a30` `#4f3622`, gaps `#3a2716`) and the well's shingles. `chicken_coop.json` is the bed's shape: `facings` y and x, `facingFootprint`, the x facing a mirror of the y drawing; the loader slices the two-tile drawing per tile. The door frames (`_1` half open, `_2` open) are the y drawing with the leaf swung out toward the camera; whether a `clickAnim` can play on a facings sprite is an engine question, so they are optional and spare until then. The container's loot table is the coding side's to name.

**Previews:** `preview_props_1x/3x.png`, both on their tiles (the tile diamonds drawn faintly), the beehive's three frames, the coop along y and its mirror along x, the figure for scale; `preview_frames_1x/3x.png`, the click strips side by side.

**Generator:** `generators/props.py` (`beehive(bees)`, `coop(door)`); the straw, the wood and the shingles are palette dicts at the top.
