# Art 07: Held items, inventory icons, the fireball

**Status: in the game as art-only holdables** (round 2, 2026-10-12): the book, staff, throwing knife and throwing axe are holdable and show drawn icons; they do nothing yet. The fireball sheet is stored and unused. Files in `data/art/items/` (the repo's own `README.md` there is the short version of this page). Design questions about what these items *do* are in `24-throwables-and-fire-magic.md`. Written 2026-10-12.

## The rule that governs everything here

**One design, two renderings** (Michael, 2026-10-12). Every item ships as `<name>_world.png` and `<name>_icon.png`, and the icon is the *same drawing* as the world sprite, pixel for pixel, centred unscaled on a canvas the size of the item's bag footprint. So if a design changes, both files change together. A delivery missing either file is flagged on arrival. The book is the one exception, on purpose (below).

## Inventory icons

The bag is Tetris-like: 19 px per cell in the art, shown at **exactly 2x** (38 px per cell). Icons are drawn on a canvas of `19 x (19 * rows)` px with a transparent background, upright, with the same `#2b2522` outline as the world art. The game handles rotated placement.

| Icon | Slot (cols x rows) | Canvas | Stacks to |
|---|---|---|---|
| `throwing_knife_icon.png` | 1 x 1 | 19 x 19 | 100 |
| `throwing_axe_icon.png` | 1 x 1 | 19 x 19 | 100 |
| `book_of_fire_icon.png` | 1 x 1 | 19 x 19 | not specified |
| `staff_of_fire_icon.png` | 1 x 4 | 19 x 76 | not specified |

- **Nothing is stretched.** An item uses only the space it honestly fills; the knife (5 x 13) and axe (9 x 15) look small in their 19 px cell and that is correct and consistent with how the existing item icons sit. If they feel too small, the fix is a bigger *design* (a longer knife), not an upscale.
- **Stacking items leave the lower-right corner clear** for the count.
- **The grid is not baked in.** The bag-mock preview draws a grid so the footprint is visible; the PNGs contain only the item on transparency.
- **The book's icon is the closed book** (14 x 13, flame on the cover) centred in the 19 x 19 canvas. Open at 19 px it read as a page-coloured smear; closed it reads as a book.
- **Existing items** (plank, stick, sword, spear, halberd, hatchet, mace, torch, shield, bow, arrow, bandage) still use colour-fill icons from the engine. They have no drawn world/icon pairs yet.

## World sprites and grips

`grip_px` is the pixel of the PNG, from its top-left corner, that sits on the hand. It always lands on the handle's wrap. Values are in `items.json`.

| File | Size | grip_px | Notes |
|---|---|---|---|
| `throwing_knife_world.png` | 5 x 13 | (2, 9) | blade up. One picture for held, flying and on the ground. Single-edged blade, brass guard, wrapped grip, brass ring pommel. **5 px wide counting the outline, which is as wide as a throwing knife can be at this scale** |
| `throwing_axe_world.png` | 9 x 15 | (6, 10) | head up, cutting edge on the left. A crescent bearded head with the haft through its eye, leather grip |
| `staff_of_fire_world.png` | 16 x 50 | (8, 32) | upright (the 0 degree picture). A wood shaft with a leather-wrapped grip, brass collar, iron butt cap with a short spike, and two curling claws cradling a red orb with a burning ember core. **The head is a deliberately big, WoW-scale 16 px wide** |
| `staff_of_fire_world_22_5.png` | 27 x 49 | (9, 32) | tilted 22.5 degrees clockwise |
| `staff_of_fire_world_45.png` | 42 x 42 | (14, 28) | 45 degrees |
| `staff_of_fire_world_67_5.png` | 49 x 27 | (17, 18) | 67.5 degrees |
| `staff_of_fire_world_90.png` | 50 x 16 | (18, 8) | lying flat, orb to the right |
| `book_of_fire_world.png` | 16 x 14 | (7, 9) | **open, pages up, lying flat** in the palm with the spine toward the camera; glue it to the hand. The grip is the middle of the cover's near edge. Parchment pages, a fire sigil on the right page, text dashes on the left, brown leather, brass corners, a red ribbon |
| `fireball.png` | 192 x 1024 | none | see below |

Palette: steel `#eef0f4` `#c6cad2` `#9ea2ac` `#6e7280`; wood `#9a6a42` `#7a5132` `#57381f`; leather wrap `#7a5638` `#5a3c25` `#3e2818`; brass `#e2c06a` `#c39a44` `#8a6a2a`; iron `#8a8c96` `#5e6068` `#3e3f46`; orb `#fff1d6` (glint) `#ff8a5c` `#d8322e` `#a8202a` `#6e1420` with `#ffb347` ember. Orb colours carry no halo: its light is the engine's.

**Scale:** hands sit about 14 px above the feet and 9 to 10 px out from the body (`12-characters-from-the-art-side.md`); the grip pixel goes there. A 55 px figure beside the items is in the repo preview image (`preview_items_3x.png`).

## Staff angles: the flip table

The five drawn files cover 0 to 90 degrees, tilting clockwise (the orb goes from up to right). **Each was drawn from the shape, never rotated**, so strokes stay clean. For the full 16 directions (22.5 degree steps):

| Orb direction (clockwise from up) | Use | Grip transform |
|---|---|---|
| 0 to 90 | the drawn file at that angle | none |
| 90 to 180 | the drawn file at `180 - angle`, **flipped vertically** | `y = h - 1 - y` |
| 180 to 270 | the drawn file at `angle - 180`, **flipped horizontally and vertically** | `x = w - 1 - x`, `y = h - 1 - y` |
| 270 to 360 | the drawn file at `360 - angle`, **flipped horizontally** | `x = w - 1 - x` |

**Note:** the repo README's flip rule originally said "180 to 360: flip horizontally", right only for 270 to 360. It was corrected on 2026-10-12 and now matches this table; the loader (`assets.heldSheetFromImage`) is the engine's own implementation of it. Flips move the light to the wrong side on the mirrored angles; nobody notices at 1x.

The knife and axe are different: small, near-symmetrical, and rotated by the engine into 16 angles about their grip (`held.mode: "rotate"`), which is acceptable at 5 and 9 px wide. Held-art modes in the engine are `fixed` (the book), `rotate` (knife, axe) and `angles` (the staff).

## The fireball

A flat comet, no spin. `fireball.png` is a **sheet of 64 x 64 cells, 16 rows by 3 columns** (192 x 1024).

- **Row k** flies at `k * 22.5` degrees. Row 0 is east (right), angle increasing clockwise: row 4 south (down), row 8 west, row 12 north.
- **Columns** are the flicker frames: loop 0, 1, 2 at about 10 to 12 fps.
- **Anchor:** pixel (32, 32) of every cell is the centre of the head. Put the projectile's world position there and use it for collision.
- **Choosing a row:** `atan2(dy, dx)` of the **screen-space** velocity, nearest of 16. Screen space, so the comet points the way it visibly travels.
- **Look:** a visible comet about 32 x 14 px: a white-yellow core, an orange body, a red-orange tail that breaks into embers at the tip, a forked tongue that alternates sides each frame, and a few stray sparks. Ramp, core to tail tip: `#fffbe6` `#ffe066` `#ffa531` `#f0661f` `#c63a1c` `#8e2616`. The outline is `#2b2522` round the head and body of the tail and **stops partway down so the tail fades into sparks**.
- **Every direction is rasterised fresh** from the shape (`fireball.py`: head radius 5.4, tail length 25, width tapering as `(1 - t)^0.65` with a sine wobble), never rotated pixels.
- **It does not light the ground in the art.** The engine's moving light does (`24` section 2; `light.setBurners`).

## Generators

`items.py` (knife and axe grids, staff geometry `staff(theta)` with `L_SHAFT = 37`, `ORB_C, ORB_R = 42, 3.9`, `GRIP_V = 15`), `book2.py` (hand-pixelled `OPEN` 16 x 14 and `CLOSED` 14 x 13), `fireball.py`, `items_preview.py`. `book.py` is the abandoned `iso3d` attempt.

## Open items

- **Redraw the sword and halberd at the five angles** if long weapons should match the staff's quality in hand (offered, not asked).
- **World/icon pairs for the twelve existing items** (list above).
- **Stack limits for the book and staff** are undecided (not in the brief; left out of `items.json` rather than invented).
- **The spin frames for the thrown knife and axe** (4 to 8 rotations along the flight, `24` section 1) are not drawn; they would be generated from the one picture.
- The **fireball impact burst** reuses the engine's particles (`fire.js`); no art.
