# Fences and everyday icons (docs/art/11), delivered 2026-10-20 (revised the same night: the matchbox, the boots)

**Everything the brief asks for is here, and nothing is missing.** Part A: the thirteen fence pieces and the six optional gate boards (nineteen PNGs) with `anchors_fence.json`. Part B: all sixteen everyday items, the five held angles for the plank, the stick and the torch, the lit torch's icon and portrait, the portraits owed (plank, stick, torch, waterskin, boots, belt), the optional flame frames, the five starting-outfit items, and the optional hatchet and shovel in their five angles: 83 PNGs with `items.json`. Every PNG is hard-pixel (alpha 0 or 255), drawn at the size it ships, and checked by script against the JSON: sizes, footprints, grips inside the picture, every pair complete.

Two extra files per 1 x 3 or 1 x 2 held item, `<id>_icon_large.png`, are the alternative of Question 3 and can be deleted or swapped in; they are the only files beyond the brief's list.

Layout: `village/` (Part A), `items/` (Part B), `previews/` (every acceptance picture at 1x and 3x; the bag, icons and portraits at 2x), `generators/` (the scripts, kept as an archive; everything the game needs is in the PNGs and the JSON).

## The four questions

1. **Which end carries the post: the near end, as you suggested.** Every segment carries one post at its near end, pixel-identical to `post_fence` (the same code at the same world offset; verified by diffing). The rails run between the post faces, from 3 px in from the far vertex to 3 px short of the near one, so a leaving segment's rails start at the post's face and an arriving segment's end at it: nothing ever overlaps a post, and `post_fence` landing on a segment's own post changes nothing. At a building's corner the building's post covers the fence's post entirely (6 px inside 14 to 18); the leaving fence's rails then start 3 px in from the vertex, which is inside the heavier post, so they read as set into the post's face (see `fence_buildings`). That is the one case the art cannot make cleaner without a cut piece; it looks acceptable to me.

2. **The gate: the whole span, hinged 7 px in from the far post.** Between the posts (a = 3 to 29) sits a 4 px **hinge stile** nailed across the far post's face (a = 3 to 7), carrying the two iron pins, and a **22 px leaf** hinged on the stile at a = 7 (the house doors' leaf is 20 px). The stile stays in the `door_open` segment (so that segment is the posts, the stile and nothing else: a bend from "posts and nothing else", noted here). Swung 90 degrees the leaf stands 4 px clear of a fence leaving the far post (`fence_back_corner_open` shows the corner-tile case both ways). The in-between leaves at 30 and 60 degrees are drawn whole; two read clearly in the strip (`fence_swing`), three were not needed. The leaf is see-through like the fence: three rails at the fence's own heights, a stile at the free edge, a diagonal brace, two strap hinges, a latch; outlined all round because the player uses it. Same weathered wood as the fence, so the outline and the iron are what mark it as the gate.

3. **The long thin icons: both are in the zip, and I recommend the larger rendering for the 1 x 3 items.** `plank_icon.png`, `stick_icon.png`, `shovel_icon.png` follow the pixel-for-pixel convention (the 26 px plank sits small in its 19 x 57 cell, as the knife does in its 19 x 19); `plank_icon_large.png`, `stick_icon_large.png`, `shovel_icon_large.png` (and `hatchet_icon_large.png` for the 1 x 2) are the same design rendered by the same code at the scale that fills the footprint, the way the book's icon differs from its world picture. `items_bag_2x.png` shows the plank, the stick and the shovel both ways side by side. At 2x the convention plank is 52 px long in a 114 px cell and reads as a splinter; the large one reads as a plank. For 1 x 1 and 2 x N items the two are the same picture, so only the 1 x 3 and the 1 x 2 tools have the alternative. Whichever you choose, rename it to `<id>_icon.png` and delete the other.

4. **The seeds: one shared pouch, six different heaps.** An open burlap pouch, the same for all six, with the crop's own seed heaped in its mouth and two of them spilled beside it: lumpy tan seed potatoes with dark eyes, near-black round cabbage seeds, white garlic cloves with a purple blush, pale yellow flat pumpkin seeds, golden rye grains, glossy red-brown flax seeds. The pouch is the shared silhouette ("a seed"), the heap and the spill are the tell at 19 px; `items_icons_2x.png` has the six in a row.

## Part A: the fence

- **Height 36, thickness 6**: the posts are 6 x 6 and 36 tall; the rails are 3 thick and 4 tall, centred on the edge line, their undersides at z = 6, 18 and 29; gaps of 6, 8 and 7 px at 1x. The top rail's upper face is at z = 33, so the engine's cap band (z = 36, thickness + 2) holds the post tops only.
- **Rickety, repeatably:** the top rail sags a pixel in the middle, the middle rail tilts a pixel down toward the near end, the bottom rail has a pale split along its top at the far end, each post's top is split a pixel lower on its +X half, with a knot on its lit face. All of it is small enough to repeat every 32 px without becoming a pattern; nothing is broken. If variants are wanted later, the sag, the tilt and the split are each one number in `fence.py`.
- **Not outlined**; its darkest tone is laid along every lower and right-hand edge that meets nothing, so it stands off the grass and the soil. The gate leaf and the stile are outlined `#2b2522`.
- **The wood, dark to light:** `#5f5241` (the darkest edge and the nail holes), `#8d7b5f` (shade faces), `#b5a27e` (lit faces), `#c6b38e` (tops), with a sparse grain in `#9c8a68` / `#75664d` and the split in `#d9c9a4`. **For the splinters use the four: `#5f5241` `#8d7b5f` `#b5a27e` `#c6b38e`.** This is the board overlays' weathered grey-tan, chosen because it stands apart from the grass, the soil, the three wall materials and the door wood. Iron on the gate: `#2b2a32` with `#4a4952` highlights.
- **Gate boards** (`boards_gate_<o>_<1|2|3>`): one, two or three planks across the shut gate, their ends on the posts, a pixel proud of the post faces, in the house boards' wood, outlined; anchored like the segment, drawn right after it. Because the fence is that same grey-tan, the boards read by their outline and tilt rather than by colour (`fence_gate_boards`); if they should shout more, a darker board tone for the gate set is one number in `fence.py`.
- **The sizes and anchors**, also in `anchors_fence.json` (which carries `height`, `thickness` and the four tones too). Every anchor is the tile's top vertex at ground level; `post_fence` is anchored on its own centre at ground. An anchor x of -1 or 39 means the vertex sits one pixel outside the picture.

| File | Size | anchor_px |
|---|---|---|
| `wall_fence_north_plain.png` | 38 x 53 | (-1, 33) |
| `wall_fence_north_door_shut.png` | 38 x 54 | (-1, 34) |
| `wall_fence_north_door_open.png` | 38 x 54 | (-1, 34) |
| `door_open_fence_north.png` | 29 x 46 | (19, 31) |
| `door_open_fence_north_30.png` | 16 x 50 | (-3, 32) |
| `door_open_fence_north_60.png` | 16 x 49 | (5, 31) |
| `boards_gate_north_1.png` | 39 x 24 | (8, 21) |
| `boards_gate_north_2.png` | 39 x 39 | (8, 29) |
| `boards_gate_north_3.png` | 39 x 39 | (8, 28) |
| `wall_fence_west_plain.png` | 38 x 53 | (39, 33) |
| `wall_fence_west_door_shut.png` | 38 x 54 | (39, 34) |
| `wall_fence_west_door_open.png` | 38 x 54 | (39, 34) |
| `door_open_fence_west.png` | 29 x 46 | (10, 31) |
| `door_open_fence_west_30.png` | 16 x 50 | (19, 32) |
| `door_open_fence_west_60.png` | 16 x 49 | (11, 31) |
| `boards_gate_west_1.png` | 39 x 28 | (31, 23) |
| `boards_gate_west_2.png` | 39 x 40 | (31, 28) |
| `boards_gate_west_3.png` | 39 x 43 | (31, 30) |
| `post_fence.png` | 14 x 43 | (7, 39) |

### The fence previews (`previews/fence_*_1x.png` and `_3x.png`)

Assembled from the PNGs and the anchors alone, in the draw order the brief gives (arriving segments, the post, leaving segments; a leaf or boards right after their segment, before the same tile's other segment; a figure by its feet's X + Y), posts worked out as `postAt` does (every vertex where an edge ends, turns, joins or changes material; none where one material runs straight; the heavier material's post).

- `fence_alone`: every piece alone, both orientations, the post, the boards.
- `fence_lines`: four segments each way. `fence_lone`: a lone segment, a lone gate shut and open, each way.
- `fence_yard`: a 4 x 3 yard, the four corner kinds, a gate on each side (two shut, two open).
- `fence_tees_cross`: a T and a cross.
- `fence_buildings`: a fence arriving at a stone, a log and a wood building's back corner from behind, and leaving its front corner toward the camera. The arriving run's near half is hidden by the 80 px back wall, which is right (it stands behind the wall); its far half shows past the building. The leaving run's first rails start inside the building's post.
- `fence_gate_corner_end`: a gate beside a corner; a gate at the end of a run.
- `fence_back_corner_open`: an open gate in the corner tile of a yard's back side, both ways; the leaf stands 4 px clear of the other fence.
- `fence_swing`: shut, 30, 60, open, both ways. `fence_gate_boards`: the boards on the shut gate.
- `fence_see_through`: the 55 px figure and one of the dead behind a run and behind a shut gate, and in front of each. The figures are the rig's body with the round-1 painted layers composited; the dead is the same body greened.

If the game draws any of these differently, the previews are the picture to match.

## Part B: the items

### How they were drawn

- Everything under about 20 px is hand-pixelled on a grid (the apple, the bread, the tinderbox, the boots, the bandage, the stone, the six seed pouches, the flame). The log, the waterskin, the garments and the sack are masks shaded by the top-left rule (a lit rim up-left, a shade rim down-right, the darkest tone along the bottom edge). The plank, the stick, the torch, the hatchet and the shovel are rasterised fresh at each angle from their shape, as the staff was, never rotated by pixel; the same code at a larger scale makes their portraits and the `_icon_large` alternatives.
- Every world picture is upright, tightly cropped, outlined `#2b2522`, with a `grip_px` from the PNG's top left, held or not. For the things no hand holds the grip is the picture's natural middle (a log's waist, a loaf's centre, a pouch's neck), so a dropped garment or a held loaf will sit sensibly if that ever happens.
- Icons are the world drawing centred unscaled on the footprint canvas (the convention), except the `_icon_large` alternatives of Question 3 and the two torch icons, which sit low in their 19 x 38 so the lit one's flame has room above: **the torch is on the same pixels in `torch_icon` and `torch_lit_icon`**, only the flame is added. The waterskin is 13 px wide in its 19, leaving three clear columns each side for the fill level to show round it (`items_bag_2x.png` shows full, half and empty).
- Stacking 1 x 1 items (apple, bandage, stone, the seeds) are drawn in the upper left of their cell, leaving the lower-right 8 x 7 quiet for the count.
- **The torch** in the world is unlit: a wood shaft, a cord, a wrapped head in pitch-dark cloth (`#3a2f2a` `#4e4038` `#2a221f`, the cord `#8a7a5a`). `flame_px` in every held angle's file is the top pixel of the head, where the flame's base (the frames' (14, 28)) sits; the flips of the loader mirror it like the grip. The lit icon and portrait carry the small flame drawn on, no halo. `flame_torch_0..2.png` are three flicker frames on the 28 x 32 cell with the base at (14, 28), unlit, in the fireplace flames' palette (`#6e1e10` edge, `#b8401c`, `#e07a26`, `#f2b33e`, `#f8dc7a`).
- **The held angles**: `<id>_world.png` is 0 degrees (upright); `_22_5`, `_45`, `_67_5`, `_90` tilt clockwise. The flips for 90 to 360 are the staff's (docs/art/07): 90 to 180 the tilt at 180 minus the angle flipped vertically, 180 to 270 the tilt at the angle minus 180 flipped both ways, 270 to 360 the tilt at 360 minus the angle flipped horizontally; the grip and the flame point mirror with the picture. Grips: the plank and the stick are held near one end (6 and 7 px up, a club's grip); the torch at mid-shaft (8 px up); the hatchet 7 px up the haft; the shovel at mid-handle. `items_holding_3x.png` shows the three on the figure at eight of the sixteen angles, facing the camera and away.
- **Palettes.** Wood (stick, torch shaft, hafts): `#9a6a42` `#7a5132` `#57381f`, knots `#45301b`. Plank: the board wood `#c6b38e` `#b5a27e` `#8d7b5f` `#5f5241`, so the plank you carry is the board you nail. Log: the log wall's `#ab7b4c` `#9c6d41` `#8a5e36` `#73502e` `#5a3c22`, bark `#6c4829`, end grain `#c49e6c` with rings `#a07e52`. Apple: `#d8503a` `#b8342a` `#7e1f1c`, glint `#eaa68a`, stem `#5a3c22`, leaf `#587a36` `#7a9e52`. Bread: `#e0aa6a` `#c98a4a` `#a86b35` `#7a4b23`, scoring `#8a5a2c`. Stone: the rocks' `#cfc6b6` `#b0a697` `#8e857a` `#6c645c`. Linen (bandage): `#e6e0cc` `#c4bba4` `#a89f88`. Iron (shovel blade, hatchet eye): `#8a8c96` `#5e6068` `#3e3f46`; steel (the hatchet's bit): `#eef0f4` `#c6cad2` `#9ea2ac` `#6e7280`. The tinderbox is drawn as a matchbox (Michael, 2026-10-20: wrong for the period, right for recognition): tan card `#d9cba2` `#c9b98e` with its drawer out showing two red heads `#b8342a`, a red striking strip `#7e1f1c` along its side, a loose match `#e6e0cc` in front. Leather (waterskin): `#9c7a52` `#7e5f3c` `#5e4429` `#432d1e`, its cord `#b8a67c`. Burlap (pouches, sack): `#b8a67c` `#8f7f5c` `#6a5c42` and `#ab9a74` `#9c8a66` `#7a6a4c` `#5c4e36`. Seeds: potato `#b0905e` `#8e7048` eyes `#5a4030`; cabbage `#4a3c34` `#2e2522`; garlic `#e0d8c4` `#c2b8a6` blush `#8a6a86`; pumpkin `#e2d690` `#b8ac62`; rye `#cfa94c` `#b08a36`; flax `#a86a36` `#7a4a22` glint `#d8a070`. The outfit uses the round-1 paintings' tones: tunic `#c9b98e` `#a8966f` (`#d9cba2` lit, `#86765a` dark, trim `#a8a498`), breeches `#5a4030` `#43301f`, boots `#4a3522` `#36261a` with `#2e2622` soles and `#8a8c96` hobnails, the rope `#b8a67c` `#8f7f5c`.
- **The rope belt's colours**: drawn as painted in round 1 (tan), as the brief asked; the item's data colours (`#5e4028`, `#8a7a60`) are the plain belt's. Yours to rule.
- **The outfit as things**: the tunic laid flat (a T with its round neck and hem trim), the breeches laid flat (waist with a drawstring, two legs), the boots as one side-view hobnail ankle boot per bag cell (the 1 x 2 icon holds two, one above the other, 19 px apart, so each stays in its own cell however the piece is turned; the world picture is that stacked pair; the portrait is the pair side by side, larger), the rope coiled with its knot and the ends hanging, the sack tied at the neck with its shoulder strap. The tunic's, breeches' and sack's 38 x 38 icons serve as their portraits, as the brief allows; no separate portrait was drawn for them.

### Bends and precedents

- The `door_open` fence segment keeps the hinge stile (4 px) beside the far post; the brief said posts and nothing else. Without it the far post would have no hinge and the shut gate a 4 px hole.
- The torch icons sit low in their cell rather than centred, so the lit one's flame fits above without moving the torch.
- The shovel's portrait is a smaller rendering (0.78x) because a 44 px shovel does not stand in a 38 px slot; the hatchet's, the plank's, the stick's and the torch's are larger renderings (1.2 to 1.3x).
- The `_icon_large` files exist only for Question 3.

### World pictures

| File | Size | grip_px | tilt |
|---|---|---|---|
| `apple_world.png` | 13 x 15 | (6, 9) | upright |
| `bread_world.png` | 16 x 12 | (8, 7) | upright |
| `tinderbox_world.png` | 16 x 10 | (7, 5) | upright |
| `bandage_world.png` | 16 x 13 | (6, 6) | upright |
| `stone_world.png` | 14 x 11 | (6, 6) | upright |
| `potato_seed_world.png` | 14 x 13 | (7, 8) | upright |
| `cabbage_seed_world.png` | 14 x 13 | (7, 8) | upright |
| `garlic_seed_world.png` | 14 x 13 | (7, 8) | upright |
| `pumpkin_seed_world.png` | 14 x 13 | (7, 8) | upright |
| `rye_seed_world.png` | 14 x 13 | (7, 8) | upright |
| `flax_seed_world.png` | 14 x 13 | (7, 8) | upright |
| `log_world.png` | 33 x 54 | (17, 30) | upright |
| `tunic_world.png` | 32 x 28 | (16, 13) | upright |
| `breeches_world.png` | 24 x 29 | (12, 14) | upright |
| `boots_world.png` | 14 x 31 | (7, 17) | upright |
| `belt_world.png` | 32 x 14 | (16, 6) | upright |
| `small_sack_world.png` | 30 x 32 | (16, 16) | upright |
| `waterskin_world.png` | 13 x 24 | (6, 12) | upright |
| `plank_world.png` | 7 x 28 | (3, 20) | 0 |
| `plank_world_22_5.png` | 16 x 28 | (5, 20) | 22.5 |
| `plank_world_45.png` | 23 x 23 | (6, 16) | 45 |
| `plank_world_67_5.png` | 28 x 16 | (7, 10) | 67.5 |
| `plank_world_90.png` | 28 x 7 | (7, 3) | 90 |
| `stick_world.png` | 9 x 28 | (5, 19) | 0 |
| `stick_world_22_5.png` | 14 x 27 | (4, 19) | 22.5 |
| `stick_world_45.png` | 21 x 22 | (6, 15) | 45 |
| `stick_world_67_5.png` | 26 x 16 | (7, 11) | 67.5 |
| `stick_world_90.png` | 28 x 9 | (8, 5) | 90 |
| `hatchet_world.png` | 12 x 30 | (7, 21) | 0 |
| `hatchet_world_22_5.png` | 16 x 29 | (4, 21) | 22.5 |
| `hatchet_world_45.png` | 23 x 26 | (6, 19) | 45 |
| `hatchet_world_67_5.png` | 28 x 19 | (7, 14) | 67.5 |
| `hatchet_world_90.png` | 30 x 13 | (8, 8) | 90 |
| `shovel_world.png` | 11 x 46 | (5, 24) | 0 |
| `shovel_world_22_5.png` | 26 x 44 | (11, 24) | 22.5 |
| `shovel_world_45.png` | 37 x 37 | (16, 20) | 45 |
| `shovel_world_67_5.png` | 44 x 26 | (19, 14) | 67.5 |
| `shovel_world_90.png` | 46 x 11 | (21, 5) | 90 |
| `torch_world.png` | 7 x 23 | (3, 13), flame_px (3, 0) | 0 |
| `torch_world_22_5.png` | 14 x 22 | (5, 13), flame_px (10, 1) | 22.5 |
| `torch_world_45.png` | 19 x 19 | (7, 11), flame_px (16, 2) | 45 |
| `torch_world_67_5.png` | 22 x 14 | (8, 8), flame_px (20, 3) | 67.5 |
| `torch_world_90.png` | 23 x 7 | (9, 3), flame_px (22, 3) | 90 |

### Icons

| File | Footprint | Canvas | Stacks to | Drawn from |
|---|---|---|---|---|
| `apple_icon.png` | 1 x 1 | 19 x 19 | 5 | apple_world |
| `bread_icon.png` | 1 x 1 | 19 x 19 | no | bread_world |
| `tinderbox_icon.png` | 1 x 1 | 19 x 19 | no | tinderbox_world |
| `bandage_icon.png` | 1 x 1 | 19 x 19 | 5 | bandage_world |
| `stone_icon.png` | 1 x 1 | 19 x 19 | 20 | stone_world |
| `potato_seed_icon.png` | 1 x 1 | 19 x 19 | 20 | potato_seed_world |
| `cabbage_seed_icon.png` | 1 x 1 | 19 x 19 | 20 | cabbage_seed_world |
| `garlic_seed_icon.png` | 1 x 1 | 19 x 19 | 20 | garlic_seed_world |
| `pumpkin_seed_icon.png` | 1 x 1 | 19 x 19 | 20 | pumpkin_seed_world |
| `rye_seed_icon.png` | 1 x 1 | 19 x 19 | 20 | rye_seed_world |
| `flax_seed_icon.png` | 1 x 1 | 19 x 19 | 20 | flax_seed_world |
| `log_icon.png` | 2 x 3 | 38 x 57 | no | log_world |
| `tunic_icon.png` | 2 x 2 | 38 x 38 | no | tunic_world |
| `breeches_icon.png` | 2 x 2 | 38 x 38 | no | breeches_world |
| `boots_icon.png` | 1 x 2 | 19 x 38 | no | boots_world |
| `belt_icon.png` | 2 x 1 | 38 x 19 | no | belt_world |
| `small_sack_icon.png` | 2 x 2 | 38 x 38 | no | small_sack_world |
| `waterskin_icon.png` | 1 x 2 | 19 x 38 | no | waterskin_world |
| `plank_icon.png` | 1 x 3 | 19 x 57 | no | plank_world, pixel for pixel (the convention) |
| `plank_icon_large.png` | 1 x 3 | 19 x 57 | no | plank_world, the same design rendered to fill its 1 x 3 footprint (Question 3's alternative) |
| `stick_icon.png` | 1 x 3 | 19 x 57 | no | stick_world, pixel for pixel (the convention) |
| `stick_icon_large.png` | 1 x 3 | 19 x 57 | no | stick_world, the same design rendered to fill its 1 x 3 footprint (Question 3's alternative) |
| `hatchet_icon.png` | 1 x 2 | 19 x 38 | no | hatchet_world, pixel for pixel (the convention) |
| `hatchet_icon_large.png` | 1 x 2 | 19 x 38 | no | hatchet_world, the same design rendered to fill its 1 x 2 footprint (Question 3's alternative) |
| `shovel_icon.png` | 1 x 3 | 19 x 57 | no | shovel_world, pixel for pixel (the convention) |
| `shovel_icon_large.png` | 1 x 3 | 19 x 57 | no | shovel_world, the same design rendered to fill its 1 x 3 footprint (Question 3's alternative) |
| `torch_icon.png` | 1 x 2 | 19 x 38 | no | torch_world, unlit |
| `torch_lit_icon.png` | 1 x 2 | 19 x 38 | no | torch_world with the flame drawn on, for the bag and the slots only; the torch sits on the same pixels as in torch_icon, the flame rises above it |

### Portraits

| File | Size | Drawn from |
|---|---|---|
| `waterskin_portrait.png` | 38 x 38 | the same skin drawn larger for the 38 px slot |
| `boots_portrait.png` | 38 x 38 | the pair side by side, larger |
| `belt_portrait.png` | 38 x 38 | the rope coiled, larger, the ends hanging |
| `plank_portrait.png` | 38 x 38 | plank_world rendered at 1.3x |
| `stick_portrait.png` | 38 x 38 | stick_world rendered at 1.3x |
| `hatchet_portrait.png` | 38 x 38 | hatchet_world rendered at 1.2x |
| `shovel_portrait.png` | 38 x 38 | shovel_world rendered at 0.78x |
| `torch_portrait.png` | 38 x 38 | torch_world at 1.3x, unlit |
| `torch_lit_portrait.png` | 38 x 38 | torch_portrait with the flame drawn on, the torch on the same pixels |

### Flame frames

| File | Cell | Base |
|---|---|---|
| `flame_torch_0.png` | 28 x 32 | base (14, 28) |
| `flame_torch_1.png` | 28 x 32 | base (14, 28) |
| `flame_torch_2.png` | 28 x 32 | base (14, 28) |

## Engine questions, left to Michael

Nothing here describes the engine as fact; these are the places the look depends on something I could not see:

- Where a fence leaves a building's corner, its first rails are drawn over the building's post face (the segment is drawn after the post). If that reads wrong in play, the fix is engine-side (a cut at the post's face, as the translucent walls get).
- The previews draw the away-facing figure with the item behind the body; the game's own hand placement rules.
- The flame in the previews is frame 0 at `flame_px`, unflipped at every angle, which is what the brief says the engine will do once it reads `flame_px`.
