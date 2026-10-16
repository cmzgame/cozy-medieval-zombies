# Art 08 and 10: what the sweep cut

**What this is:** the paragraphs cut from `docs/art/08-cursors.md` (its status as it stood, the two implementation options, the engine's correction of 2026-10-12, which one when as it was written, and the open items since done) and from `docs/art/10-lighting-from-the-art-side.md` (the old Canvas 2D night layer as the agent understood it from `07` and `17`, the engine note of 2026-10-12, the agent's hypotheses, the fix the engine declined, and the proposal); moved here by the sweep, 2026-10-16, and never edited after. The live text is `docs/art/08-cursors.md` and `docs/art/10-lighting-from-the-art-side.md`; the rulings are `docs/02-decisions.md` (2026-10-12, "The cursor") and `docs/17`.

## From `08-cursors.md`

### The status as it stood

**Status: drawn, delivered, and in the game since 2026-10-12 as a CSS cursor** (`data/art/cursors/`, `src/ui/cursor.js`, `style.css`; four choices in Settings, the system's the default; the engine-drawn option below was refused, `02` 2026-10-12). Written 2026-10-12.

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

## From `10-lighting-from-the-art-side.md`

### The engine note at the top

**Engine note (2026-10-12, Claude Code), what is true now:** `07` describes the first, Canvas 2D night layer; since `08` (the WebGL renderer) light is **a fragment-shader multiply: every vertex carries the world point its light is read from**, and nothing is lit in screen space. The practical consequences for the art: a thing is **unlit** by being drawn with the `FLAG_UNLIT` flag (flames, embers, the burning-character particles, the landing marker, the held torch's flame all are), which is exactly the "emissive items are drawn after the night layer" hypothesis below: **the fireball, the staff's orb glow, and a jack-o'-lantern's glow frames are to be drawn `FLAG_UNLIT`; the engine side is a one-line flag per drawable, and it is only a decision of which sprites get it** (today the staff's orb is lit like the rest of the staff, the glow frames are unlit). The "every standing drawable paints its own darkness over its own shape" description below is the old renderer's; the silhouette still decides which pixels are drawn, so hard alpha still matters.

## What I know about the system (from `07` and `17`, not from reading the code)

- **Light is one function**, `lightAt(gx, gy)`, 0 to 1, per position. Everything reads it; sight reads it too ("light feeds sight").
- **The night is a layer**, drawn in two stages: the floor first (clock, per-room ambient, fire pools with shadows, the player's weak night-vision pool, the carried torch's pool), then **every standing drawable paints its own darkness over its own shape, in the scene's sort order**. So the *silhouette of my sprite is the shape the darkness is painted through*.
- **A wall face takes the light of the tile it looks onto**; the **top of a wall or post always takes the sky**; a translucent near wall takes a mix; a prop or character takes the light at its feet; **a flame erases itself from the layer in its turn**, so it never dims.
- The tint is dusky purple (starting `rgb(36, 22, 56)` at 0.96 darkness), full night brightness 0.22, a day cap of 0.92 or 1.0 to be tuned by eye. Night is dusky, never black.

### The fix the engine did not take (from "What I saw go wrong")

**My recommended fix that the engine did not take:** draw every near-wall piece opaque into an offscreen buffer, then composite it once at the wall's alpha. It would end all stacking. The engine's reason for declining (in `17`) is sound: one composite has one place in the draw order, and near-wall pieces interleave with things in front of and behind them (lanterns outside a door, chairs and the player inside). Open leaves, shutters and boards that lie over a ghost wall can still stack. **If stacking is ever the next complaint, the real fix is stubs** (`09-stubs.md`), which have no translucency at all.

## Things I believe will matter and have **not** verified

Mark these as hypotheses. Check against `light.js` and a night screenshot before acting.

- **Multiply darkens my darkest colours to near-black.** At full night brightness 0.22 the outline `#2b2522` becomes roughly `#090808`, and the gloom ramps (compressed value range, `#0e141e` to `#6e8a98`) lose their separation first. Under that multiply the *gloom zone* will be hard to read unless its light values are lifted or the night tint lets some blue through. Worth a night preview of the blue and purple trees before a gloom zone is built.
- **Emissive items must be drawn after the night layer**, like flames. The staff's orb, the fireball's core and tail, and the jack-o'-lantern's glow frames are all drawn bright on purpose; if the engine draws them through the normal night layer they will go dark at night and look dead. `24` says the fireball is "a moving light", which lights the *ground* but does not by itself keep the sprite bright.
- **The held torch's flame** is an engine-generated frame today, not drawn art (`12-figure`); drawn flames should follow the flame rule above.
- **Colour and light are decoupled in my palettes.** I picked colours for full day. Nothing I drew has been looked at at night except in the engine's own screenshots. A pass that previews every set at night, dusk, and a hearth-lit room would catch palette problems the art cannot see.

## A proposal (not built, not asked for)

If the engine ever wants stronger lighting on sprites without 3D, the cheapest art-side addition is a **per-sprite emissive mask** (a second PNG of the same size marking which pixels glow: the orb, the fireball core, windows lit from inside, pumpkin cuts) and optionally a **rim mask** for the lit edge. The art pipeline can generate both from the same shape code at almost no cost, since every generator already knows which pixels are "fire". It is only worth doing if the night layer cannot already treat flames and glows as exempt.
