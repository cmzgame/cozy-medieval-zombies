# Milestone 9 (not yet scoped): the ground

**Status: the conversation is open (Michael, 2026-10-11).** Now that the trees are drawn art, the flat checkered ground is the thing that clashes. This is a working note, not the spec. Michael and Claude talk it through in detail first, and the official spec comes after. Nothing here is built.

## Where it starts

Michael made a ground kit with Claude Design: `GROUND_BRIEF.md`, a folder `ground_kit` (in his Downloads, 27 files), and a generator script. The brief is kept verbatim in [`15a-ground-brief-source.md`](15a-ground-brief-source.md). It is addressed to a coding agent on a WebGL renderer, which is us, and its tile size, 64×32 art pixels, matches ours.

What the brief proposes, in one paragraph: stop drawing the checker (keep the grid as data); draw one of six textured grass tiles per tile by a hash, with a horizontal flip; tint the grass with large smooth colour patches (lush to dry over about five tiles) and darken it under tree canopy; draw dirt and other terrain as a second pass from a per-chunk terrain texture with linear filtering and a noise threshold, so the edges are ragged and pixel-crisp; scatter decals (leaf litter coloured to the nearest tree, twigs, pebbles, flowers, tufts, mushrooms), all deterministic per tile; bake each chunk's ground into one texture; optionally show a faint grid in build mode.

## What the kit holds

- 6 grass tiles, 64×32: `grass_0` to `grass_3` and `grass_sparse_0` and `_1`. Marks stay two pixels inside the diamond edge so no seams show.
- Decals: `litter_{yellow,orange,red,brown}_{0,1}` (28×14), `twig_{0,1}`, `pebbles_{0,1}`, `flowers_{0,1}`, `tuft_0` to `tuft_3`, `mushroom_{0,1}`.
- `ground.py`, the generator for all of it, with the palette constants at the top and the reference logic for the patch noise, the canopy darkening and the decal rules.

## What is missing from the kit

The brief names four files that are not in the folder. They are needed before the dirt pass or a match to the target look.

- `dirt_world_128x64.png`: a seamless world-space dirt texture.
- `edge_noise_128.png`: a seamless grey noise texture that shapes the dirt edges.
- `ground_before.png` and `ground_after.png`: the mockups, the "after" being the target look.
- Also: `ground.py` reads `out/tree_*.png` and `out/character_s.png`, which are not in the kit, so the mockup cannot be regenerated here.

Options: ask Michael for a fresh export, or generate stand-ins (noise from a seeded hash, dirt from the current dirt colour `#6e5a43`) the way placeholder art is generated at boot. Decide in the conversation.

## Claude's read of the brief (2026-10-11)

**Fits our renderer well.**

- The shader already reads light, ambient, and fog per pixel from textures keyed by world position (`src/gl.js`: `u_light`, `u_ambient`, `u_fog`). A baked chunk of unlit ground can go through exactly that path, so the brief's "bake albedo, not lit colour" rule is compatible.
- The patch tint can be a small data texture sampled the same way, or per-vertex colour. A quad takes one colour today (`gl.quad`), so per-vertex colour is a small extension.
- Wild trees come from a pure hash of the tile (`wildTile` in `src/map.js`), so the nearest-tree query across chunk borders is deterministic whatever order chunks grow in.
- The grid staying as data is the same ruling we already have: every tile access goes through `tileAt`, and the walls are edge state.

**Problems in the brief to fix before building.**

- **The flip is tied to the variant.** The brief picks `variant = hash % 6` and flips on `hash & 1`. Six is even, so the two share the low bit: variants 0, 2, 4 would never flip and 1, 3, 5 would always flip. Flip on an independent bit. The mockup has the same flaw.
- **The hash does not match the mockup.** The brief says to use the mockup's hash so results match `ground_after.png`, but the mockup masks to 16 bits with no seed and the brief's JavaScript does not. Exact pixel matching is not on offer; matching in feel is.
- **The mockup's tree shadow is not in the text.** The mockup draws a soft dark ellipse under every tree (about 28% black, roughly 84% of the sprite's width). The brief never mentions it. Our drawn trees have no ground shadow. It is probably a large part of why the after image looks grounded, so it is part of this milestone.
- **The numbers assume the original tree sizes.** Our trees are now drawn 1.5 times bigger and a giant spans about three tiles by itself. The three-tile canopy reach, the litter counts, and the shadow size should scale with the tree's tier.
- **The grass green differs.** The kit's base green is `(75, 95, 61)`, darker than our current floor `#596f49`, about 16% darker. Tune in the engine.
- **Dirt is not the only floor.** Ragged edges suit dirt roads and decorative dirt. Wood and stone floors (under roofs, and what a player builds) keep hard edges. Farm soil should cover its whole tile, which is the brief's lower-threshold case.
- **Per-frame cost without baking.** A forest tile can carry several litter decals, a twig, and tufts. Bake flat decals into the chunk. Tufts and mushrooms are depth-sorted in the brief; I would bake them flat first and sort only if a character visibly clips one.
- **Gloom needs its own palette.** A grass ramp and a floor kind per biome, using `ground.py` with new constants. Deferred until a gloom zone exists.

## Suggested order, from the brief, with our additions

1. Remove the checker; draw the six grass variants by hash, with an independent flip.
2. The smooth patch tint and canopy darkening, as per-vertex colour or a data texture.
3. Tree ground shadows (not in the brief), scaled by tier.
4. Flat decals: litter matched to the nearest tree, twigs, pebbles, flowers.
5. Tufts and mushrooms (baked flat first).
6. The dirt overlay pass: the terrain data texture with a one-tile border from neighbouring chunks, linear filtering, the noise threshold; hard edges kept for built floors.
7. Bake each chunk's ground into a render texture; re-bake when its terrain changes.
8. The build-mode grid overlay.

**Done means**, from the brief: a screenshot of a forest edge with a clearing matches the after image in feel; no tile grid outside build mode; dirt edges ragged and pixel-crisp with no hard diamonds and no soft alpha; a chunk regenerates identically across reloads.

## Questions for the conversation

1. Fresh export of the missing files, or generated stand-ins?
2. Do the kit's marks and decals, drawn at 1 pixel, sit right beside trees drawn at 1.5 times? (The trees are smoothed resamples; the grass is native pixels.)
3. Tree shadows: how dark, and do they follow the light (so they swing with the sun and vanish at night), or are they fixed?
4. Which floors blend (grass, dirt, farm, paths) and which stay hard (wood, stone, anything under a roof)?
5. Is the grid overlay only for build mode, or also for placing props?
6. Tufts and mushrooms: baked flat, or depth-sorted?
7. When do the gloom palette and its floor kind arrive?
