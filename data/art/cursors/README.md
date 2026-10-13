# Pointing-hand cursors

Three replacements for the mouse cursor. Each one is the back of a right hand pointing straight up.

| File | Size (1×) | Hotspot (1×) | Use |
|---|---|---|---|
| `cursor_human.png` | 15 × 20 | (4, 0) | default |
| `cursor_severed.png` | 15 × 22 | (4, 0) | the same hand, severed at the wrist |
| `cursor_zombie.png` | 15 × 22 | (4, 0) | zombie hand |

- Each file also comes in `@2x` and `@3x` versions, scaled up by nearest-neighbour. `cursors.json` repeats the sizes and hotspots.
- All three share one hotspot, so swapping between them never moves the click point.
- The art follows the game's rules: hard pixels only (alpha is 0 or 255), light from the top-left, and a `#2b2522` outline.

## The hotspot

The hotspot is the one pixel that counts as the mouse position. It is the point that clicks, hovers and picks tiles. It's given in image pixels from the image's **top-left corner**: (4, 0) is the top row of the fingertip.

At scale `s`, the hotspot is `(4*s, 0)`. To put the click in the middle of the scaled fingertip pixel rather than on its corner, use `(4*s + s/2, s/2)` (with integer division): `(9, 1)` at 2× and `(13, 1)` at 3×. Use the same formula in both approaches below.

## Approach A (recommended): draw it in the engine

This keeps the cursor at the same pixel size as the world at every zoom, and it snaps to the pixel grid like every other sprite.

1. Set `canvas.style.cursor = 'none'` to hide the system cursor, but only while the pointer is over the game canvas.
2. Track the pointer from `pointermove`, in CSS pixels relative to the canvas. Multiply by `devicePixelRatio` if the canvas backing store is scaled by it.
3. Draw the cursor **last**, on top of the world and the UI, in screen space, with no lighting, fog or night tint:
   ```
   zoom = current world pixel scale (integer)
   x = round(mouseX - hotspotX * zoom)
   y = round(mouseY - hotspotY * zoom)
   drawSprite(cursorTexture, x, y, width * zoom, height * zoom)   // NEAREST filtering
   ```
   Use the 1× PNG and let the engine scale it, the same way it scales the rest of the art. The `@2x` and `@3x` files are only for Approach B.
4. Hit-testing must use the **mouse position itself**, not the sprite's corner. The hotspot offset is only for drawing.
5. Swap the texture to change cursor states. All three share the same hotspot, so the click point doesn't jump when they swap.
6. Restore the system cursor (`canvas.style.cursor = ''`) when the pointer leaves the canvas, when an HTML overlay or menu is focused, or when the game is paused, so the user is never left without a pointer.
7. Known trade-off: an engine-drawn cursor trails the real mouse by about a frame, because it only moves when the game renders. Keep updating its position every frame, even when nothing else in the scene changes.

## Approach B: a CSS cursor

The browser draws the cursor, so there's no lag, but its size is fixed and won't follow the game's zoom.

```css
canvas { cursor: url("cursor_human@2x.png") 9 1, auto; }
```

- The two numbers are the hotspot's x and y, in the pixels of **that image file**. Use the scaled values from above: `9 1` for `@2x`, `13 1` for `@3x`, and `4 0` for 1×.
- The trailing keyword (`auto`) is required. The browser falls back to it if the image fails to load.
- Chrome and Firefox ignore cursor images bigger than 128×128, and MDN recommends 32×32 or smaller. The `@2x` files are 30×40 and the `@3x` files 45×60: both are allowed, but over that recommendation. Test `@3x` in the browsers you support.
- Preload the images. Otherwise a swap shows the fallback cursor until the new file arrives.

## Which cursor to show

Use `cursor_human` by default. When to show the severed and zombie variants is a gameplay decision. Some options: the severed hand as the low-health or "dark" phase cursor, and the zombie hand when hovering over undead or after the festival turns.
