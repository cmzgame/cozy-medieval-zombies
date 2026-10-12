# Item art: throwing knife, throwing axe, staff of fire, book of fire, fireball

Every item is one design with two renderings, delivered under one name: `<name>_world.png` and `<name>_icon.png`. Each icon is the same drawing as its world sprite, pixel for pixel, centred unscaled on a canvas the size of the item's bag footprint. So if a design changes, both files change together. The book is the only exception: its world art is the open book and its icon is the same book closed, with the flame on the cover, which reads better at 19 px.

## Inventory icons (19 px per cell, shown at 2x in the 38 px cell)

| Icon | Slot (cols x rows) | Canvas | Stacks to |
|---|---|---|---|
| `throwing_knife_icon.png` | 1 x 1 | 19 x 19 | 100 |
| `throwing_axe_icon.png` | 1 x 1 | 19 x 19 | 100 |
| `book_of_fire_icon.png` | 1 x 1 | 19 x 19 | not stated in the brief |
| `staff_of_fire_icon.png` | 1 x 4 | 19 x 76 | not stated in the brief |

- **Layout:** each icon is drawn upright on a transparent background, with the same `#2b2522` outline as the world art. An item uses only the space it honestly fills; nothing is stretched.
- **Stack counts:** the knife and axe leave the lower-right corner of the cell clear for the stack number.
- **Rotation:** the game handles rotated placement in the bag.

## World sprites

All art is authored at 1x and uses hard pixels only (alpha is 0 or 255). There is a 1 px `#2b2522` outline, and light comes from the top-left.

`grip_px` is the pixel where the hand holds the item, measured from the PNG's top-left corner. Put that pixel on the hand. Every value is also in `items.json` (world grips and icon slot sizes).

| File | Size | grip_px | Notes |
|---|---|---|---|
| `throwing_knife_world.png` | 5 × 13 | (2, 9) | Blade points up. Use the same picture when held, flying and on the ground. |
| `throwing_axe_world.png` | 9 × 15 | (6, 10) | Head at the top, cutting edge on the left. |
| `staff_of_fire_world.png` | 16 × 50 | (8, 32) | Upright. Same picture as the 0° angle. |
| `staff_of_fire_world_22_5.png` | 27 × 49 | (9, 32) | Hand-drawn, tilted 22.5° clockwise from straight up. |
| `staff_of_fire_world_45.png` | 42 × 42 | (14, 28) | Tilted 45°. |
| `staff_of_fire_world_67_5.png` | 49 × 27 | (17, 18) | Tilted 67.5°. |
| `staff_of_fire_world_90.png` | 50 × 16 | (18, 8) | Lying flat, orb pointing right. |
| `book_of_fire_world.png` | 16 × 14 | (7, 9) | Open, pages up, spine pointing at the camera. Glue it to the hand. The grip is the middle of the cover's near edge. |
| `fireball.png` | sheet 192 × 1024 | — | See below. |

## Staff angles

The five hand-drawn files cover 0° to 90°, tilting clockwise (orb to the right). Each angle was drawn from scratch rather than by rotating the upright picture, so the lines stay clean. Use them in place of nearest-pixel rotation:

- **Angles from 90° to 180° (orb pointing down-right):** flip the matching 0°–90° file vertically and mirror its grip y.
- **Angles from 180° to 360°:** flip horizontally and mirror the grip x.

Flipping moves the light to the wrong side on the mirrored angles. That's normal for sprites and nobody notices at 1x.

For the 16 directions, use the drawn file for 0, 22.5, 45, 67.5 and 90, and flips for all the rest. The odd steps in between are already covered, because the drawn set includes the 22.5° steps.

## Fireball

`fireball.png` is a sprite sheet of 64 × 64 cells, with 16 rows and 3 columns.

- **Row k** flies at k × 22.5°. Row 0 is east (right), and the angle increases clockwise, so row 4 is south (down), row 8 west and row 12 north.
- **Columns** are the flicker frames. Loop 0 → 1 → 2 at about 10–12 fps.
- **Anchor:** pixel (32, 32) in every cell is the centre of the head. Put the projectile's world position there, and use it for collision.
- **Size:** the visible comet is about 32 × 14: a white-yellow core, an orange body, and a tail that breaks into embers at the tip. Every direction was drawn from scratch rather than rotated. The outline stops partway down the tail so the end fades into sparks.
- **Choosing a row:** convert the projectile's screen-space velocity to an angle with `atan2(dy, dx)` and take the nearest of the 16. Use screen space, not world space, so the comet always points the way it visibly travels.
