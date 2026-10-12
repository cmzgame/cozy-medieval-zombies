# Art 08: The pointing-hand cursors

**Status: drawn and delivered to Michael (`cursors.zip`); not found in the repo** (no cursor images in `data/art/`, and `style.css` still uses the system cursors) as of 2026-10-12. Written 2026-10-12.

## What there is

Three replacement cursors for the mouse. Each is the **back of a right hand pointing straight up**: the forefinger extended, the other fingers curled (three knuckle bumps), the thumb tucked under on the left. Hard pixels, light from the top-left, `#2b2522` outline, hand-pixelled in ASCII grids (`cursors.py`, grids `HAND`, `WRIST`, `SEVERED`, `ZTORN`).

| File | Size (1x) | Hotspot (1x) | Meaning |
|---|---|---|---|
| `cursor_human.png` | 15 x 20 | (4, 0) | the default: an uninjured hand with a regular tapered wrist and a cuff line |
| `cursor_severed.png` | 15 x 22 | (4, 0) | the same hand, severed: a short wrist, a tiny bit of blood (red), and a bone sticking out |
| `cursor_zombie.png` | 15 x 22 | (4, 0) | a zombie hand: green skin, a short torn wrist with a bone, a rot patch and a gash |

Each also ships as `@2x` and `@3x` (nearest-neighbour scaled) plus `cursors.json`. All three share one hotspot so swapping between them never moves the click point.

**Revisions Michael asked for** after the first pass (and which are in the final art): narrower overall, a shorter finger with a rounded top, a more prominent thumb area, and a tapered wrist on all three (regular wrist for the human, short wrist with a bone for the damaged human and the zombie). The first procedural version looked like capsules and was thrown away for hand-pixelling (`cursors_v1.py` is the backup).

Skin tones: human `#f8dfc2` `#f0ceaa` `#d4ac86` `#b08a68` (+ nail `#fdf3e8` `#e3cbb3`); zombie `#a8bb80` `#8ea26a` `#71864f` `#56683c` (+ nail `#cfc48c` `#a99f68`); blood `#b23a42` `#78202a` `#a3222a`; bone `#efe6cc` `#c9b993`. **The zombie green is the cursor's own; the dead's skin ramp is still to be decided** (`25`), so these should be re-derived from that ramp when it exists.

## The hotspot

The one pixel that counts as the mouse position, from the image's top-left. `(4, 0)` is the top row of the fingertip. At scale `s`, use `(4*s + s/2, s/2)` to put the click in the middle of the scaled fingertip pixel, which is `(9, 1)` at 2x and `(13, 1)` at 3x. Hit tests use the pointer's own position; the hotspot offset is only for *drawing*.

## Implementation options

**Engine correction (2026-10-12, Claude Code):** the UI (the bag, menus, the HUD, screens) is **DOM over the canvas**, so a cursor drawn into the canvas, however late, is **beneath** every panel and menu and would vanish behind them. Option A must therefore be a **DOM image that follows the pointer in the top-most layer** (`pointer-events: none`, `image-rendering: pixelated`, positioned by `pointermove`, scaled by a whole-number factor from the UI scale, hidden when the pointer leaves the window), which keeps the pixel look over both the world and the UI; Option B (CSS) needs none of this. The "never draw UI into the canvas" rule is not what blocks the canvas version: the stacking order is.

### A. Draw it in the engine (recommended)

Keeps the cursor at the world's pixel scale at every zoom and snaps to the pixel grid like every other sprite.

1. `canvas.style.cursor = 'none'` while the pointer is over the game canvas.
2. Track the pointer from `pointermove` (CSS pixels relative to the canvas; multiply by `devicePixelRatio` if the backing store is scaled).
3. Draw it **last**, on top of the world and UI, in screen space, with no lighting, fog or night tint: `x = round(mouseX - hotspotX * zoom)`, `y = round(mouseY - hotspotY * zoom)`, nearest filtering, using the 1x PNG.
4. Swap the texture to change state.
5. **Restore the system cursor** (`canvas.style.cursor = ''`) when the pointer leaves the canvas, an HTML overlay or menu has focus, or the game is paused.
6. Trade-off: an engine-drawn cursor trails the real mouse by about a frame. Keep updating its position every frame.
7. **Project note:** CLAUDE.md's rule is "never draw UI into the canvas". A cursor is not UI in that sense (it is a pointer sprite), but it is worth ruling on and logging in `02-decisions.md` before building.

### B. CSS cursor

```css
canvas { cursor: url("cursor_human@2x.png") 9 1, auto; }
```

The two numbers are the hotspot in that image's own pixels (`4 0` for 1x, `9 1` for 2x, `13 1` for 3x). The trailing `auto` is **required** (the fallback). Browsers ignore cursor images over 128 x 128, and MDN recommends 32 x 32 or smaller: the `@2x` files are 30 x 40 and `@3x` 45 x 60, allowed but over the recommendation, so test `@3x`. **Preload** the images so a swap does not flash the fallback. The browser draws it with no lag, but the size does not follow the game's zoom.

## Which one when

`cursor_human` by default. When to show the severed or zombie hand is a gameplay decision: the severed hand as a low-health or "dark phase" cursor, the zombie hand when hovering over the dead or after the festival turns. Nothing is ruled.

## Open items

- **Import them** and decide A or B.
- **Other cursor states** (a grab hand for carrying furniture, a crosshair for the bow, an open hand for taking) are not drawn; `style.css` currently uses `pointer`, `default` and `grab` for those. The same hand in other poses would be the natural family.
- **Larger sizes:** at 15 x 20 the cursor is small on a 1.1x zoom; scale by the world zoom (option A does).
