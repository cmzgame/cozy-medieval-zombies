# Art round 6: the fires

This delivery has the three fires as one family: the **Fireplace** (redrawn), the **Fire pit** (new, 2 by 2), and the **Campfire** (drawn, replacing the generated placeholder). Each comes with three unlit flame frames. The Campfire item also gets its bag icon and its held picture.

Every prop, icon, and held picture uses hard pixels only (alpha 0 or 255) and has a 1 px `#2b2522` outline all the way round. `gen.py` checks both by script on every one of those files. The flame frames follow `fire_0.png`'s manner: no `#2b2522` outline, their own dark red edge `#6e1e10`, and alpha 0 or 255, also checked. Light comes from the top left. Nothing has a baked shadow, glow, or flame light, and everything is drawn at the size it ships.

## How it was made

`gen.py` is my own generator. I wrote it after reading round 5's props generator and its README for the method; nothing is imported. Run it with plain `python gen.py` (PIL and numpy). It is deterministic: two runs give byte-identical files, which I checked with md5 over `out/`, `preview.png`, and `manifest.json`.

- **The props** are built in world units and drawn by a small z-buffered face rasteriser. The projection is screen x = X − Y, screen y = (X + Y)/2 − Z, and depth is X + Y + Z. Each face is shaded per pixel from its world point.
  - Stonework is coursed in world coordinates, so the courses run on across corners.
  - Each stone has one of two tones for its face, a lit top row and a darker bottom row, and its corner pixels go to the mortar. That softening makes them read as chunky dressed stones rather than bricks.
  - Round things (pots, fieldstones, the ring wall) are banded by their normal against a top-left light.
- **Contour lines.** Wherever a pixel's neighbour stands well in front of it (a depth step of 3.5 or more), the pixel behind is pulled toward the outline colour. This gives the furniture its darker inner edges: round the firebox opening, behind the pots, posts, and logs.
- **The anchor convention is checked.** `gen.py` was used to rebuild the drawn chair from its box numbers. It comes out 39 × 51 with anchor (19, 25), the same as `chair_front.png` and `chair.json`.
- **The palette** is one family. Stone is a warm grey ramp from the drawn rocks (`#cfc6b6` `#b0a697` … `#463f3a` mortar). Bark and end grain are round 5's. Black iron is the chest's and the cauldron's. Furniture wood is from docs/art/06. Flames use `fire_0`'s five tones (`#6e1e10` `#b8401c` `#e07a26` `#f2b33e` `#f8dc7a`).

## Files (`out/`)

| File | Size (w × h) | Anchor / pin | What |
|---|---|---|---|
| `fireplace.png` | 88 × 109 | anchor (56, 60): the first tile's top vertex at ground level | See "The Fireplace" below. |
| `fireplace_fire_0..2.png` | 26 × 21 each | base (13, 20) on fire.at (47, 83) | The fireplace's flames, already cut. |
| `fire_pit.png` | 114 × 73 | anchor (58, 19): the top tile's top vertex at ground level | See "The Fire pit" below. |
| `fire_pit_fire_0..2.png` | 37 × 28 each | base (18, 27) on fire.at (57, 49) | The pit's flames, already cut. |
| `campfire.png` | 41 × 28 | anchor (21, 0) | See "The Campfire" below. |
| `campfire_fire_0..2.png` | 18 × 23 each | base (9, 22) on fire.at (20, 19) | The campfire's flames, already cut. |
| `campfire_icon.png` | 57 × 57 | | The Campfire item's bag icon. |
| `campfire_world.png` | 16 × 14 | grip (7, 1) | The Campfire item held, `fixed`. |
| `fireplace.json`, `fire_pit.json`, `campfire.json` | | | The definitions (below). Image paths assume the PNGs go to `data/art/village/`. |
| `preview_1x.png`, `preview_3x.png` | | | The two halves of `../preview.png`. |

For every fire, each frame's `base` is the bottom middle of the frames' shared canvas. `fire.at` is that same pixel in the prop's picture, measured from its crop. The preview composes them exactly as `assets.js` does: the frame's `base` on the drawing's `at`.

### The Fireplace

Two tiles, with its back to a west wall as drawn (`y`) and against a north wall as its mirror (`x`). It is about half again as big as the old one, chunkier, and a little exaggerated, as Michael asked. It is built from these parts, bottom to top:

- **The slab.** A flagstone slab 3 high, proud of the body at the front and both sides.
- **The body.** It stands out 18 from the wall face. Each jamb has a plinth course at its foot.
- **The firebox.**
  - A wide segmental arch 36 across, its crown at 31. The voussoirs and a big keystone stand proud of the coursed face, their top edges lit.
  - Inside, the firebox is sooted. The fire is laid on firedogs: two logs and a split one on top.
  - An iron crane swings a black pot out over the left of the fire.
- **The mantle.** Stepped stone corbels under a thick oak mantle at 41 to 46.5. The mantle overhangs the front and both sides by several units. On it stand a candle in a pewter dish, a terracotta jug, and a bowl.
- **The chimney breast.** It steps back above the mantle and ends in a weathered slope. Its top is at **68**, comfortably under both the 80 px wall of today and the 96 px wall of docs/52.

If the pot should go when the boiling pot comes as an item (docs/02 filed it), `FP_POT = False` in `gen.py` leaves the crane and an empty hook.

### The Fire pit

A 2 by 2 prop with two facings, one drawing and its mirror. Its parts:

- **The base and wall.**
  - A low round base of flags, 2 high and radius 28.5.
  - A short wall of 14 squared blocks, 8 high, from radius 15.5 to 22. The inner face is seen on the far side.
  - Inside, a bed of ash and coal lumps with two crossed logs and a split one on top.
- **The wrought-iron rack** (Michael's photo 4, made medieval).
  - Two posts with forged feet, collars, and knob tops, 47 high.
  - A crossbar at 44.5 whose ends turn down into hooks.
  - Two S-hooks with two black pots: a lidded one on the left and an open one with stew on the right.
  - A wooden ladle hung on the bar's left end.
- **Two facings** (Michael, 2026-10-27: each fire has at least two). The rack runs across the screen, its posts on the line through the left and right tiles' centres. `facings ["y","x"]` and `facingFootprint {"y": [2, 2], "x": [2, 2]}`: `y` is the drawing, with the ladle and the lidded pot at the left; `x` is its mirror, made at load (`{"from": "y", "mirror": true}`), with the ladle and the lidded pot at the right. In the mirror the lit side swaps, the cost the bed, the table, and the fireplace accept; the ring and the pots are round, so it hardly shows.

### The Campfire

One tile, drawn: a ring of ten fieldstones round ash and coals, a teepee of four logs (one split, its pale face lit), and one more log lying ready at the back. Two facings, one tile both ways: `y` the drawing (the spare log at the back right, the split log at the left) and `x` its mirror (the spare log at the back left, the split log at the right).

## Where the engine's columns fall in the fire pit

Measured in `fire_pit.png` (anchor x = 58). The tile columns' lines are at x = 26 and x = 90 (anchor x ∓ 32).

- **Left column, x < 26:** the left post (x 10..16 with its foot), the ladle (x 1..8), and the bar's left end.
- **Middle column, 26..90:** both pots (x 35..79), the S-hooks (41..74), the hook shanks, the flames (frames at x 39..75), the logs, and almost all of the ring wall (x 26..89).
- **Right column, x ≥ 90:** the right post (x 99..105) and the bar's right end with its hook.

The crossbar, the base, and the wall's ends cross the lines, as they must. Each post stands about 10 px clear of its line. If the builder insets the cuts 9 px toward the middle, as `SLICE_INSET` does for two tiles (x 35 and 81), the pots still fall inside, at x 35 and 79.

**In the mirrored facing (`x`)** the anchor is (56, 19) (114 − 58) and the lines move to x 24 and 88 (114 − 90 and 114 − 26). A pixel at x goes to 113 − x:

- Left column, x < 24: the left post (x 8..14), which was the right one.
- Middle column, 24..88: both pots (x 34..78) and the flames (x 38..74).
- Right column, x ≥ 88: the right post (x 97..103) and the ladle (x 105..112).

The posts are still 9 to 10 px clear of the lines. With a 9 px inset (x 33 and 79), the pots (34..78) are still inside.

## The fire, exactly what I did

- **Drawing the flames.** One routine draws every fire's frames.
  - The tongues swell from the foot and taper to a leaning one-pixel tip, the tallest in the middle.
  - The colour runs from a yellow-white heart at the foot through yellow and orange to red at the edges, with a dark red edge round all of it.
  - Each frame has a spark or two above.
  - Each frame's heights and leans come from a hash of the frame, so the three loop at the definition's 6 fps.
- **Cutting the flames.** Each frame is cut by the prop's own depth buffer, the cauldron's way (round 5). The flames stand in a plane, and a flame pixel is kept only where nothing of the prop is in front of it. Where no flame covers them, the logs' lit tops and the coals glow orange and red, differently in each frame.
  - **Fireplace:** the plane is X = 20.5, parallel to the firebox front, so the flames' bed runs along the firebox (`/` on screen). The jambs, the arch, the front log, and the pot cut them.
  - **Fire pit:** the plane faces the screen through the centre. The front of the wall, the logs, and the pots cut them.
  - **Campfire:** the plane faces the screen, 2.5 units toward the camera from the centre. The flames lick up in front of the back logs, and the front logs' feet and stones cut them.
- **The fireplace's two tiles.** `fire.at` x = 47 lies right of the slice line (anchor x − 23 = 33). All of a frame's pixels lie right of it (x 34..59), so `assets.js` puts the frames on the first tile and nothing of them is split.

### One line the builder needs for the mirrored fireplace

`assets.js` draws the flame frames **unmirrored** on a mirrored facing (`canvasOf(im, false)`). It mirrors only `fire.at`. That was harmless for the old symmetric `fire_0..2`. These frames are cut against the drawing, and the fireplace's bed slants with the firebox, so the `x` facing needs them mirrored with the drawing: `canvasOf(im, !!d.mirror)`, and the pin's x taken as `frameWidth − base[0]` when mirrored. With exactly that, the mirrored frames land pixel for pixel on the mirrored firebox; `preview.png` shows the `x` facing composed that way. The fire pit's and the campfire's `x` facings are mirrors too and need the same line; `preview.png` shows them composed that way.

## The definitions

- **fireplace.json** keeps today's shape: `anchorVertex "top"`, `facings ["y","x"]`, `facingFootprint {"y": [1, 2], "x": [2, 1]}`, `y` drawn, and `x` its mirror. `carry: false` is kept.
  - The `fire` block keeps every field of today's: radius 3, room, burns, cooks, switch, maxFuel 4, flicker 0.18 / 6, fuel log, hoursPerUnit 3.
  - Only `at`, `frames`, `base`, and `fps` are the new picture's.
  - The rulings ask both built fires to flicker more than today. That is a lever (`docs/42`), not the art's, so I left the numbers as they are.
- **fire_pit.json** has `name` "fire pit", `facings ["y","x"]` with `facingFootprint {"y": [2, 2], "x": [2, 2]}` (`y` drawn, `x` its mirror), `carry: false`, and a `note`. Its `fire` block is the brief's: radius 5, room, burns, cooks, switch, maxFuel 6, fuel log, hoursPerUnit 3, flicker 0.24 / 7. To that I added `at`, `frames`, `base`, and `fps` 6.
- **campfire.json** keeps every field of today's but `placeholder` and adds `facings ["y","x"]`, `facingFootprint {"y": [1, 1], "x": [1, 1]}`, and `drawings`: `y` drawn, `x` its mirror (`assets.js` places flames only in the drawings path, the cauldron's reason). Its `fire` block (radius 4, burns, cooks, maxFuel 6, flicker 0.22 / 7, fuel log, hoursPerUnit 3) gains `at`, `frames`, `base`, and `fps`.

## The item (`manifest.json`)

The Campfire item is 3 by 3 in the bag, so its icon is 57 × 57.

- **The icon** is the campfire itself, unlit, **built again at 1.38 times the prop's size** (55 × 37, centred). This is the same design drawn larger, round 4's bucket exception; nothing is enlarged by pixels.
- **The held picture** is the packed campfire: two logs bundled with two turns of rope and a carrying loop, their end grain to the left. It is hand-pixelled at 16 × 14 and held `fixed` by the top of the loop, grip (7, 1). It hangs beside the leg about as the bucket does.
- **No portrait**, per the brief's shape (`"portrait": false`, as the Cauldron's).

`manifest.json` also has round 4's extra key, `sizes`.

## The preview

`preview.png` is the 1x picture above the same picture at 3x.

- **Row 1, on wooden floor:** round 4's barrel, then the fireplace against a strip of four drawn stone west-wall segments, unlit and with frames 0, 1, and 2. Then the fireplace's `x` mirror against the north wall, unlit and lit (frames mirrored as above), and the 55 px figure. Then the fire pit on 2 by 2 tiles and the campfire, each unlit and with each frame.
- **Row 2, on grass:** the barrel, then the fire pit and the campfire the same way; then their `x` facings, each mirrored unlit and with frames 0, 1, and 2 mirrored with them; and the figure.
- **Row 3, the item:** the icon at 2x on the slot colour `#2a2622`, the held picture at 3x with its grip in magenta, the figure holding it at 1x (the grip on the right hand, 14 px above the feet and 10 out), and the icon at 1x on a 57 px slot.

## Weak points

- **The fireplace's front is on the shade side** (+X), as every wall-backed piece's is. To keep the arch readable, I kept it a single step darker than the lit end rather than two. The mirror swaps the lit side, the accepted cost.
- **Much of the fire is hidden.** Seen from the game's angle, the arch hides the back and top of a deep firebox. I brought the fire forward (the flames' plane at X 20.5, logs near the front) and raised the crown to 31, but the tongues' tips are still cut by the arch, and the fire shows as a low band in the opening. The engine's light will do most of the work of "lit". The pot hangs over the left of the fire and covers part of it: a good silhouette when lit, a dark lump when unlit.
- **The mirrored fireplace needs the one engine line above.** Without it, its flames would sit misaligned in the `x` facing.
- **The `#2b2522` outline disappears on the bag's slot `#2a2622`.** This is true of every icon, but here the outline is all that bounds the dark ash. The light stones carry the shape.
- **The held bundle is small**, 16 × 14 like the cauldron. The rope loop and the end grain read, but the stones the item contains are not shown.
- **The fire pit is wide,** 114 px (the base reaches 28.5 of 32 units from the centre, and the bar's ends stick out past the posts). The ladle is a 3 px bowl on a stick. It reads as "a thing hanging there" more than as "ladle".
- **The campfire's flames are narrow (18 px)** because the teepee's front legs cut them. That is deliberate (the logs show through the fire), but the campfire is the least bright of the three.
- **Not drawn:** a stoked state, a fire burning low, a separate unlit-with-ash picture after the fuel runs out, and a portrait for the item.
