# Ground rendering brief: textured grass, blended dirt edges, decals

**Status, 2026-10-13: an input, kept verbatim.** This is the ground kit's brief as Michael received it from Claude Design. `15` decided how it was built (one CPU bake per chunk, not the shader pass below) and is the record of what the game does. The kit's PNGs are in `data/art/ground/`, the decals since redrawn (`15b`); `ground.py`, the two mockups, and the kit's folder were never copied in.

**For:** the coding agent working on the WebGL renderer
**Assets:** this folder (`ground_kit`). Every file named below is in it.
**Reference images:** `ground_before.png` is the current flat checker. `ground_after.png` is the target look. Both are static mockups at 1:1 art scale, rendered with the real tree sprites and without the game's dynamic lighting.

## TL;DR

1. **Remove the visible checker.** Keep the tile grid as data (placement, logic, terrain map), but stop drawing it as alternating colors.
2. **Grass:** draw one of 6 textured tile variants per tile (chosen by a hash), then apply a smooth large-scale color tint that is darker under tree canopy.
3. **Dirt and other terrain:** draw it as an overlay pass that reads a per-chunk terrain texture. Linear filtering plus a noise threshold gives ragged, pixel-crisp edges instead of hard diamond outlines.
4. **Decals:** leaf litter colored to match the nearest tree, plus grass tufts, twigs, pebbles, flowers and mushrooms. Everything is deterministic per tile, so chunks regenerate identically.

Art scale: tiles are **64×32** art px. Tile `(i, j)` has its top corner at world `((i−j)·32, (i+j)·16)` in art px. If the engine uses a different convention, adapt the formulas below to match.

---

## 1. Grid: keep it as data, stop drawing it

Today the only thing that varies across the ground is a ~7% checker. That reads as a floor, and it clashes with the heavily textured trees. Dropping the checker to ~2% did almost nothing in testing, so **set it to zero.**

- All grid-based systems (building, placement, pathing, chunking) stay exactly as they are.
- **Optional:** show a faint grid overlay **only in build mode** (the `N` key). The overlay can be computed in the ground shader with no extra geometry:

```glsl
// tile = fractional tile coordinate (see section 3)
vec2 f = fract(tile);
float e = min(min(f.x, 1.0 - f.x), min(f.y, 1.0 - f.y));
float gridLine = (uBuildMode > 0.5 && e < 0.02) ? 1.0 : 0.0;
color.rgb = mix(color.rgb, vec3(1.0), 0.12 * gridLine);
```

---

## 2. Grass base layer

### Tiles
| File | Use |
|---|---|
| `grass_0.png` … `grass_3.png` | normal-density variants |
| `grass_sparse_0.png`, `grass_sparse_1.png` | lower-density variants, for extra variety |

- 64×32 RGBA diamonds with transparent corners. They drop straight into the current tile drawing.
- Pick a variant with a per-tile hash: `variant = hash(i, j) % 6`, using the 4 normal and 2 sparse tiles.
- If `hash & 1`, flip horizontally, which doubles the variety for free.
- Texture marks stay 2px inside the diamond edge, so neighboring tiles never show a seam or grid.

Use the hash from the mockup so results match `ground_after.png`. Mix in the world seed:

```js
const h = ((i * 73856093) ^ (j * 19349663) ^ worldSeed) >>> 0;
```

### Large-scale color patches (the most important single change)
Each tile's color is multiplied by a value from smooth noise, which drifts between lusher green and drier olive over about 5 tiles. From `ground.py` → `render()`:

```
v      = 0.7 * valueNoise(i, j, scale = 5.0 tiles) + 0.3 * valueNoise(i, j, scale = 2.2 tiles)   // 0..1
canopy = Σ over trees within 3 tiles (Manhattan distance d) of 1 / (1 + d)
mulRGB = (0.88 + 0.24v, 0.90 + 0.18v, 0.92 + 0.10v) * (1 − min(0.20, 0.07 · canopy))
```

- The `canopy` term darkens the forest floor under dense trees, so clearings read as clearings.
- **Avoid visible per-tile steps.** The mockup used one flat multiplier per tile, and the steps are faintly visible. In-engine, compute the multiplier at each of the tile's **4 corners** and pass it as a per-vertex color so the GPU interpolates. Alternatively, store it in the terrain data texture from section 3 (G channel) and sample it with LINEAR filtering in the fragment shader. Either gives smooth patches.
- **Treat the amplitudes as a starting point.** Dynamic lighting changes how strong the patches look, so tune them in-engine against `ground_after.png`.

---

## 3. Blended terrain edges (dirt, paths, and future terrain types)

**Current problem:** dirt tiles are hard-edged diamonds.

**Approach:** keep the grass pass as it is. Draw dirt as a **second pass**: one quad per chunk, with a shader that discards every fragment that isn't dirt. This leaves the grass rendering untouched.

### Data
- Use one terrain texture per chunk with **one texel per tile**, as R8 (WebGL2) or LUMINANCE (WebGL1). The value is `255` for dirt and `0` otherwise.
- Make it `chunkW + 2` × `chunkH + 2`, with a **1-tile border on every side filled from the neighboring chunks**. Without the border, edges won't match across chunk boundaries.
- Use **LINEAR** filtering and CLAMP_TO_EDGE. Linear filtering does the blending: it turns the 0/1 tile values into a smooth 0–1 field across tile boundaries.
- Add more terrain types (path, mud, tilled soil) as extra channels, up to four in RGBA, and draw them in priority order with the same shader on a different channel.

### Textures
| File | Use | Sampling |
|---|---|---|
| `dirt_world_128x64.png` | seamless world-space dirt (current in-game dirt colors) | NEAREST, REPEAT, no mipmaps |
| `edge_noise_128.png` | seamless grayscale noise that shapes the edges | NEAREST, REPEAT, no mipmaps |

### Fragment shader (GLSL ES 3.0; for WebGL1 use `texture2D` / `gl_FragColor`)
```glsl
// vWorld: world position in ART pixels (before camera zoom)
vec2 px = floor(vWorld) + 0.5;            // snap to the art-pixel grid; required, see pitfalls

// world px -> fractional tile coords (64x32 iso)
vec2 tile = 0.5 * vec2(px.x / 32.0 + px.y / 16.0,
                       px.y / 16.0 - px.x / 32.0);

// +1.0 skips the border; texel centers land on tile centers
vec2 uv = (tile - uChunkOrigin + 1.0) / uTerrainSize;

float w = texture(uTerrain, uv).r;                    // smooth 0..1 dirt weight
float n = texture(uEdgeNoise, px / 128.0).r;          // 0..1
float t = 0.25 + 0.5 * n;                             // threshold range = edge raggedness

if (w < t) discard;                                   // hard step, no alpha blending

float lip = 1.0 - step(t + 0.06, w);                  // outermost band of the dirt
vec3 c = texture(uDirt, px / vec2(128.0, 64.0)).rgb;
c *= 1.0 - 0.18 * lip;                                // slightly darker rim reads as a lip
outColor = vec4(c, 1.0);
```

### Tuning
- `0.25 + 0.5 * n`: a narrower range (e.g. `0.4 + 0.2 * n`) gives rounder, smoother patches. A wider range gives more broken, organic edges.
- **Lone dirt tiles shrink.** A single dirt tile surrounded by grass renders smaller than its diamond, because its weight peaks only at the tile center. That's fine for decorative dirt. For gameplay terrain that must visibly cover its whole tile (e.g. tilled soil), lower the threshold for that channel (e.g. `0.1 + 0.3 * n`).
- `lip`: set the strength to 0 if the lighting already gives enough edge definition.

### Pitfalls
- **Snap before sampling.** If you skip `floor(vWorld) + 0.5`, the edge crawls by sub-pixels as the camera moves, and noise lookups smear.
- **No LINEAR filtering on art textures.** Only the terrain *data* texture is linear. Dirt and noise textures are NEAREST.
- **Use the same lighting path.** The overlay must go through the same lighting as the grass, or dirt will look unlit.
- **Never use `mix()` for the terrain edge.** A soft blend produces semi-transparent pixels, which breaks the pixel-art look. Always use `step()` / `discard`.

### Alternative not chosen: classic autotiling
16 hand-made transition tiles per terrain pair, chosen from neighbor checks. It needs no shader, but it's a lot of art and the edges repeat visibly. The shader approach is less total work for this pipeline.

---

## 4. Decals

Everything is chosen deterministically from the tile hash. Seed a small PRNG with `h` (as in section 2) and draw all of the tile's choices from it. **Place decals at random points inside the diamond**, not its bounding box.

| Files | Rendered as | Rule (per tile) |
|---|---|---|
| `litter_{yellow,orange,red,brown}_{0,1}.png` (28×14) | **flat** ground layer | **Near trees** (within 3 tiles, Manhattan distance `d` to nearest tree): `max(0, 3 − d)` litter decals, +1 with 50% chance. Use the **nearest tree's color** 80% of the time, `brown` 20%. Green trees always use `brown`. **Open ground:** 18% chance of one, any color. |
| `twig_{0,1}.png` | flat | near trees only, 25% |
| `pebbles_{0,1}.png` | flat | 6% anywhere |
| `flowers_{0,1}.png` | flat | open ground only, 10% |
| `tuft_0..3.png` | **depth-sorted sprite** | 45% chance of 1–2 per tile, anywhere |
| `mushroom_{0,1}.png` | **depth-sorted sprite** | near trees only, 10% |

- **Flat** decals draw in the ground pass, after grass and dirt, and never occlude anything.
- **Depth-sorted** decals go in the same sort as trees and characters, keyed by their base y, so the player can walk in front of and behind them.
- **Litter color needs tree positions.** Generate a chunk's trees before its ground decals. Because trees within 3 tiles of a chunk edge can belong to the neighboring chunk, query the deterministic tree generator for the border area too, the same way the terrain texture needs a border.
- **Gloom biome:** litter is `brown` only, mushroom chance goes up (about 25%), and flowers go to 0. Use a desaturated blue-gray grass ramp (regenerate tiles with `ground.py`; the ramp constants are at the top) and the gloom tree set (`*_blue`, `*_purple`).

---

## 5. Performance

The ground is static per chunk, so **bake each chunk once** into a render texture: grass tiles, color patches, dirt overlay and flat decals. Re-bake only when terrain in that chunk changes, e.g. when something is built or the ground is tilled. Then draw one textured quad per chunk per frame, with dynamic lighting applied as usual. The bake must store unlit albedo, not lit color. Depth-sorted decals stay as normal sprites in the entity pass.

---

## 6. Suggested order of work

1. Remove the checker and draw the grass variants with hash and flip. *(Small change, immediately visible.)*
2. Add the large-scale patch tint and canopy darkening as per-vertex colors. *(Biggest visual win.)*
3. Add flat decals: litter matched to the nearest tree, twigs, pebbles, flowers.
4. Add depth-sorted decals: tufts and mushrooms.
5. Build the dirt overlay pass with the terrain data texture, including chunk borders.
6. Bake chunks into render textures.
7. Add the build-mode grid overlay.

**Done means:** a screenshot of a forest edge with a clearing matches `ground_after.png` in feel. No tile grid is visible outside build mode, dirt edges are ragged and pixel-crisp with no hard diamonds and no soft alpha, and a chunk regenerates identically across reloads.

## Files

- `ground.py` is the generator for every PNG here. `render()` holds the reference logic for patch noise, canopy darkening and decal rules. Re-run it after changing ramps or rules.
- The PNGs are native art scale with no padding.
