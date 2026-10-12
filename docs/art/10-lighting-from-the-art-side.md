# Art 10: Lighting, from the art side

**This is not the lighting spec.** The lighting system is the engine's and is written up in `07-lighting.md` (the design), `08-renderer.md` (the shader) and `src/light.js` and `src/render.js` (the code). I did not build it. This page covers only what the *art* must and must not do so that system works, what I have observed about how it treats my art, and what I have **not** verified. Where I am inferring, I say so. Written 2026-10-12.

## What I know about the system (from `07` and `17`, not from reading the code)

- **Light is one function**, `lightAt(gx, gy)`, 0 to 1, per position. Everything reads it; sight reads it too ("light feeds sight").
- **The night is a layer**, drawn in two stages: the floor first (clock, per-room ambient, fire pools with shadows, the player's weak night-vision pool, the carried torch's pool), then **every standing drawable paints its own darkness over its own shape, in the scene's sort order**. So the *silhouette of my sprite is the shape the darkness is painted through*.
- **A wall face takes the light of the tile it looks onto**; the **top of a wall or post always takes the sky**; a translucent near wall takes a mix; a prop or character takes the light at its feet; **a flame erases itself from the layer in its turn**, so it never dims.
- The tint is dusky purple (starting `rgb(36, 22, 56)` at 0.96 darkness), full night brightness 0.22, a day cap of 0.92 or 1.0 to be tuned by eye. Night is dusky, never black.

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

**My recommended fix that the engine did not take:** draw every near-wall piece opaque into an offscreen buffer, then composite it once at the wall's alpha. It would end all stacking. The engine's reason for declining (in `17`) is sound: one composite has one place in the draw order, and near-wall pieces interleave with things in front of and behind them (lanterns outside a door, chairs and the player inside). Open leaves, shutters and boards that lie over a ghost wall can still stack. **If stacking is ever the next complaint, the real fix is stubs** (`09-stubs.md`), which have no translucency at all.

## Things I believe will matter and have **not** verified

Mark these as hypotheses. Check against `light.js` and a night screenshot before acting.

- **Multiply darkens my darkest colours to near-black.** At full night brightness 0.22 the outline `#2b2522` becomes roughly `#090808`, and the gloom ramps (compressed value range, `#0e141e` to `#6e8a98`) lose their separation first. Under that multiply the *gloom zone* will be hard to read unless its light values are lifted or the night tint lets some blue through. Worth a night preview of the blue and purple trees before a gloom zone is built.
- **Emissive items must be drawn after the night layer**, like flames. The staff's orb, the fireball's core and tail, and the jack-o'-lantern's glow frames are all drawn bright on purpose; if the engine draws them through the normal night layer they will go dark at night and look dead. `24` says the fireball is "a moving light", which lights the *ground* but does not by itself keep the sprite bright.
- **The held torch's flame** is an engine-generated frame today, not drawn art (`12-figure`); drawn flames should follow the flame rule above.
- **Colour and light are decoupled in my palettes.** I picked colours for full day. Nothing I drew has been looked at at night except in the engine's own screenshots. A pass that previews every set at night, dusk, and a hearth-lit room would catch palette problems the art cannot see.

## A proposal (not built, not asked for)

If the engine ever wants stronger lighting on sprites without 3D, the cheapest art-side addition is a **per-sprite emissive mask** (a second PNG of the same size marking which pixels glow: the orb, the fireball core, windows lit from inside, pumpkin cuts) and optionally a **rim mask** for the lit edge. The art pipeline can generate both from the same shape code at almost no cost, since every generator already knows which pixels are "fire". It is only worth doing if the night layer cannot already treat flames and glows as exempt.

## Related docs

`07-lighting.md` (design), `08-renderer.md` (the shader), `15-ground.md` (the ground bake and tint), `17-village-art-plumbing.md` (the wall fixes above), `24-throwables-and-fire-magic.md` (the fireball as a light).
