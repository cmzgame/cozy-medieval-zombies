# Art 08: The pointing-hand cursors

**Status, 2026-10-16: in the game since 2026-10-12 as a CSS cursor** (`data/art/cursors/`, `src/ui/cursor.js`, `style.css`; four choices in Settings, the system's the default, the zombie hand over one of the dead; the engine-drawn way was refused, `02` 2026-10-12, "The cursor"). Drawn 2026-10-12. The two implementation options as they were offered, the engine's correction of them, and the open items since done are `../history/art-08-10-cut.md`.

## What there is

Three replacement cursors for the mouse. Each is the **back of a right hand pointing straight up**: the forefinger extended, the other fingers curled (three knuckle bumps), the thumb tucked under on the left. Hard pixels, light from the top-left, `#2b2522` outline, hand-pixelled in ASCII grids (`cursors.py`, grids `HAND`, `WRIST`, `SEVERED`, `ZTORN`).

| File | Size (1x) | Hotspot (1x) | Meaning |
|---|---|---|---|
| `cursor_human.png` | 15 x 20 | (4, 0) | the default: an uninjured hand with a regular tapered wrist and a cuff line |
| `cursor_severed.png` | 15 x 22 | (4, 0) | the same hand, severed: a short wrist, a tiny bit of blood (red), and a bone sticking out |
| `cursor_zombie.png` | 15 x 22 | (4, 0) | a zombie hand: green skin, a short torn wrist with a bone, a rot patch and a gash |

Each also ships as `@2x` and `@3x` (nearest-neighbour scaled) plus `cursors.json`. All three share one hotspot so swapping between them never moves the click point.

**Revisions Michael asked for** after the first pass (and which are in the final art): narrower overall, a shorter finger with a rounded top, a more prominent thumb area, and a tapered wrist on all three (regular wrist for the human, short wrist with a bone for the damaged human and the zombie). The first procedural version looked like capsules and was thrown away for hand-pixelling (`cursors_v1.py` is the backup).

Skin tones: human `#f8dfc2` `#f0ceaa` `#d4ac86` `#b08a68` (+ nail `#fdf3e8` `#e3cbb3`); zombie `#a8bb80` `#8ea26a` `#71864f` `#56683c` (+ nail `#cfc48c` `#a99f68`); blood `#b23a42` `#78202a` `#a3222a`; bone `#efe6cc` `#c9b993`. **The zombie green is the cursor's own; the dead's skin ramp is still to be decided** (`25`), so these should be re-derived from that ramp when it exists. (The dead's ramp has been in `data/looks.json` since 2026-10-13; the re-derivation is an open item below.)

## The hotspot

The one pixel that counts as the mouse position, from the image's top-left. `(4, 0)` is the top row of the fingertip. At scale `s`, use `(4*s + s/2, s/2)` to put the click in the middle of the scaled fingertip pixel, which is `(9, 1)` at 2x and `(13, 1)` at 3x. Hit tests use the pointer's own position; the hotspot offset is only for *drawing*.

## As built: CSS, `cursor.js`

```css
canvas { cursor: url("cursor_human@2x.png") 9 1, auto; }
```

The two numbers are the hotspot in that image's own pixels (`4 0` for 1x, `9 1` for 2x, `13 1` for 3x). The trailing `auto` is **required** (the fallback). Browsers ignore cursor images over 128 x 128, and MDN recommends 32 x 32 or smaller: the `@2x` files are 30 x 40 and `@3x` 45 x 60, allowed but over the recommendation, so test `@3x`. **Preload** the images so a swap does not flash the fallback. The browser draws it with no lag, but the size does not follow the game's zoom.

## Which one when

The system's cursor is the default choice; with a hand chosen, `cursor_human` over the world and the panels alike, and the zombie hand over one of the dead (`02` 2026-10-12). The severed hand as a low-health or "dark phase" cursor is a later gameplay call.

## Open items

- **Other cursor states** (a grab hand for carrying furniture, a crosshair for the bow, an open hand for taking) are not drawn; `style.css` currently uses `pointer`, `default` and `grab` for those. The same hand in other poses would be the natural family.
- **The zombie cursor's green re-derived from the dead's skin ramp** (`data/looks.json`), so the hand matches the dead the player sees.
