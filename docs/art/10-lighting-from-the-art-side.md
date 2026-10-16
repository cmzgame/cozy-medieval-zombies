# Art 10: Lighting, from the art side

**This is not the lighting spec.** The lighting system is the engine's and is written up in `07-lighting.md` (the design), `08-renderer.md` (the shader) and `src/light.js` and `src/render.js` (the code). I did not build it. This page covers only what the *art* must and must not do so that system works, what I have observed about how it treats my art, and what I have **not** verified. Where I am inferring, I say so. Written 2026-10-12.

**Status, 2026-10-16:** light is the WebGL renderer's fragment-shader multiply (`08`, `src/light.js`, `src/render.js`): every vertex carries the world point its light is read from, and a thing is unlit by being drawn with the `FLAG_UNLIT` flag (every flame, ember, and glow frame, the fireball, the held torch's flame), which is how an emissive sprite is exempt from the night. The seven rules below are what the art must do for it; the table is the engine's diagnosis of the wall-top complaints of 2026-10-11 and 12. The agent's description of the old Canvas 2D night layer, the engine note of 2026-10-12, the hypotheses the renderer answered, the fix the engine declined, and the proposal are `../history/art-08-10-cut.md`.

## What this asks of the art (the rules, and why each exists)

1. **Hard alpha, always.** The darkness is painted through the sprite's silhouette. A partially transparent edge pixel would be darkened as if opaque or leave a halo; hard 0/255 alpha means the shape is exact. This is why rule 1 of the style bible is absolute.
2. **No baked shadows, no baked glow, no baked flame light.** The engine draws ground shadows (trees, and cast shadows from props) and all light. A baked glow would be darkened at night like everything else and sit wrong against the real pool.
3. **Anything that emits is drawn as a separate, unlit sprite.**
   - The **fireplace's flames** (`fire_0..2`, 18 x 16) over an *empty, dark* firebox.
   - The **jack-o'-lantern**: a dark-cut unlit body plus three glow frames that fill the cuts (`jackolantern_*_glow_0..2`), drawn over the body and exempt from the night layer.
   - The engine adds the radius, the flicker and the actual light.
4. **Wall caps must be crisp parallelograms.** The engine draws a wall's cap twice, once as part of the face and again from the same picture with the sky flag, so a lit room's back walls keep dark caps at night (`17`, ruling 3). The redraw covers the cap's exact shape plus a one-pixel margin (`CAP_MARGIN`); stair-step edge pixels that poke outside the true parallelogram are what showed up as the "dotted bright line" on a far wall.
5. **Interactable outlines are baked in `#2b2522`** on purpose: at night the outline is the one thing that keeps a sprite legible when the multiply crushes its colours. That is a good reason not to lighten it.
6. **Shading direction is a fiction and a constant.** Every sprite is shaded as if lit from the top-left. A torch or a hearth lights things from their own side, but the art cannot know that, so the engine's pool simply brightens whatever shading is already there. This works because the shading is gentle (three or four flat shades). Do not add strong directional contrast to a sprite thinking it will help at night.
7. **Mirrored sprites flip the lit side.** The bed, table, fireplace and chair are mirrored by the engine for the other grid axis. At day it is invisible; with a strong point light it can be seen. Pumpkins, farm furrows and the staff angles are drawn twice instead of mirrored for exactly this reason.

## What I saw go wrong, and whose fault it was

**"Weird wall tops and geometry flukes" (2026-10-11 and 12): the engine, not the art.** The diagnosis I gave and what the engine did about it:

| Symptom | Cause | What happened |
|---|---|---|
| Dotted bright line along a far wall's cap, and marks at each seam | the drawn cap's stair-step edge pixels poked a pixel past the redrawn cap and kept the face's light | `CAP_MARGIN`: the redraw reaches a pixel past the cap on every side |
| Pale columns at the back corners | a post was translucent when *any* wall it joined was a near wall | a post is translucent only when *every* wall it joins is near |
| Banding across translucent near walls, one stripe per joint | the near end face and post overlaps drawn twice at the near wall's alpha | translucent segments are cut where their neighbour or post takes over (`wallCuts`, `emitCutWall`) |
| A band across the back-left wall | **light, not overlap**: the torch pool climbs a wall 70 px (`night.climb`) and fades, and inside a lit room the hearth lights to full, so the face is flat bright until the climb runs out and the art's darker top band begins | a knob (`night.softLight`, off) |
| The dark cap | the designer read it as a fog overlay; it is the sky light, and the gradient over it is the player's night-vision pool | no change |

## Open

- **Multiply darkens my darkest colours to near-black.** At full night brightness 0.22 the outline `#2b2522` becomes roughly `#090808`, and the gloom ramps (compressed value range, `#0e141e` to `#6e8a98`) lose their separation first. Under that multiply the *gloom zone* will be hard to read unless its light values are lifted or the night tint lets some blue through. Worth a night preview of the blue and purple trees before a gloom zone is built.
- **Colour and light are decoupled in my palettes.** I picked colours for full day. Nothing I drew has been looked at at night except in the engine's own screenshots. A pass that previews every set at night, dusk, and a hearth-lit room would catch palette problems the art cannot see.

## Related docs

`07-lighting.md` (design), `08-renderer.md` (the shader), `15-ground.md` (the ground bake and tint), `17-village-art-plumbing.md` (the wall fixes above), `24-throwables-and-fire-magic.md` (the fireball as a light).
