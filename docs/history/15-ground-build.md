# 15 — The ground: the build record

The record of `docs/15-ground.md` as the sweep found it on 2026-10-16: the status stack of the build (2026-10-11 to 13, newest first), the scope and what existed before it, the data as first drafted, the drawing and lifecycle plan, the build order, the acceptance list (`tools/checks/ground.js` runs it), the asks to Claude Design, and what the scope must not foreclose. Moved here whole, in the doc's own order and words, by the sweep on 2026-10-16; the live text is `docs/15-ground.md`, which keeps the status, the idea, the rulings, the bake, the rule for cobble, dirt, and grass, and the known simplifications. Never edited after. The last section holds, as they stood, the paragraphs the sweep corrected in place in the live doc.

## The status stack, the scope, and what existed (as they stood)

**Status, 2026-10-13: built and accepted.** The code is the truth; since this was written: **reading never grows a chunk** (`02`, `31`): a chunk is baked only once it and its eight neighbours have been grown by the simulation's ring round each player (`map.ensureAround(x, y, 4)` in `game.js`, four chunks, not three), and a chunk not yet grown draws nothing (`ground.js`, `grown` and `drawRecord`), so "a chunk's bake reads its neighbours through `map.tileAt`, which creates them" under Lifecycle is history. `render.js` is a hub over `render/`; the ground's quads and the build grid are `emitGround` and `emitGrid` in `render/scene.js`. Water is a terrain kind and a floor no body walks (`floor_water`, `walk: false`, `drink`), and shallow water a laid floor walked at half speed (`floor_water_shallow`, `walk: 0.5`; `30`, law 8), so the trial pond is no longer walkable. The game loads the generated valley (`data/maps/valley.json`); `square.json`, the map named throughout, is the proving ground behind `?map=square`. The four rocks are gatherables (`data/sprites/rock_*.json`). Dirt and cobble are still the generated textures, and the floor stamp is still pinned, not built.

**Scoped for implementation by another model** (Michael, 2026-10-11, after the trees came in). Michael's ground kit from Claude Design is the input: the brief is kept verbatim in [`15a-ground-brief-source.md`](15a-ground-brief-source.md) and this doc decides how it is built here. The doc decides; "default" marks what Michael may overrule, not what the implementer may. Read the whole doc, then the files it names, before writing code.

## Status, 2026-10-11

**Since acceptance (2026-10-11 night, with milestone 10):** the farm and the water are drawn. The farm kind's `"tiles"` takes a list of floor sheets (`["floor_farm", "floor_farm_y"]`, the two furrow directions); each tile reads a frame picked by hash from its own floor's sheet, or a neighbour's where the blend spills past a plot's edge. The water is Claude Design's seamless 128×64 texture through `ground_water`. Floor sheets name their furrows (`"furrows": "x"` or `"y"`) so crops can follow them (`17`).

**Accepted by Michael (2026-10-11): "Ground looks amazing, I think we hit the perfect spot, and if we need to adjust later we have the knobs. Done!"** Milestone 9 is closed; all ten acceptance checks pass. The history below is kept for the record.

**Tuned by Michael after seeing the new art (2026-10-11):** every decal about halved, then mushrooms down by two thirds more and tufts by a third; twigs became a per-tree rule (0 to 2 within 1.2 tiles of each trunk); the generic forest is 40% thinner. Mushrooms are to become clickable and big rocks are wanted: both are interactables, not decals (question 27 in `02`).

**The redrawn trees are in too (Michael's `trees_v2`, 2026-10-11):** all 36 drawn natively at final size, so the 1.5× resample is gone and they are crisp; definitions re-measured (frames, anchors four rows above the trunk's lowest pixel, bounds); acceptance nine of nine. Both requests in `15b` are now met.

**The redrawn decals are in (Michael's `decals_v2` from Claude Design, 2026-10-11):** five leaf decals per colour (three piles, two scatters), five mushrooms (toadstools and brown and pale clusters), four flower clumps, three pebble groups, four tufts, three twigs, all hard-pixelled and readable at their size; they replaced the kit's files under the same names. Upright decals (mushrooms, flowers, tufts) now stand on their point (`"stand": true`) rather than centring on it; leaf counts scale by `perReach` (0.5) since the piles are bigger. The set also brought four large faceted "mineable rocks" (`rock_0` to `rock_3`): a new concept Michael will talk through, so their files sit in `data/art/ground/` unused. The trees in `tree_sprites(1)` were unchanged; the redrawn trees come separately. The bake's pixel loop now walks only each row's owned run; acceptance passes nine of nine (bakes 8.7 ms median, 12.9 worst).

**Step 5 built; all five steps are in. Milestone 9 waits only on Michael's eye (check 10) and on the redrawn art (`15b`).** Step 5: the tile grid in build and remove mode (each tile's north and west edges as one-pixel lines, white at 0.12, unlit and unfogged, over the ground and under everything standing; faint but clear on grass, nearly lost on cobble, whose own texture is busier; one number in `render.js` if Michael wants it stronger); a count of chunks that had to be baked at draw time (`ground.stats().syncBakes`, on the debug line as "at draw"); and the acceptance list as a script, `tools/checks/ground.js`, run from the console with `await (await import("/tools/checks/ground.js")).run(window.__game)`. **Results, 2026-10-11, nine of nine scripted checks pass:** (1) grass on even and odd tiles averages 67.8 and 68.0, so nothing alternates by parity, and build mode brightens 4,040 pixels of the frame while leaving it changes none; (2) no bad pixel across four chunk neighbourhoods; (3) no partial alpha and a bake identical with the camera in two places; (4) identical twice, and a wild chunk thirteen chunks out identical before and after a visit; (5) 110,720 cobble and water pixels, none beside grass; (6) cobble far from light 85 at noon and 38 at night, 67 beside the campfire and 104 at the torch-bearer's feet at night; (7) the ground under a tree 152, felled 214 and re-baked the next frame, replaced 152, and 2,913 leaf decals with none in a wrong colour; (8) a walk twelve chunks out and back at twelve tiles a second baked nothing at draw time; (9) 116 bakes, median 9.1 ms and worst 13.6 ms, at most 26 textures. Check 10 is Michael's.

**Pinned: a floor stamp in build mode** (Michael, 2026-10-11, not built). Floor entries in the build palette (stone, wood, dirt, cobble, farm, grass) and a "no random here" brush, clicked or dragged over tiles. A stamp is not live map editing: it tells the map file how the authored buildings and their ground are made, saved back as the same `floorRects` and `reserve` rectangles the map already reads (the dev server needs a save path for map files). Michael's rulings: a "no random here" stamp takes effect on the next load, honestly, since scatter is decided at load; laid floors stamped onto grass keep their straight hard edge even with no walls, which he likes; the blend rules are only for the kinds that need to merge. The ground needs nothing new: `map.setFloor` already re-bakes.

**Step 4 revised a second time (Michael, on the paths).** The shed path was cobble in the data but showed only dirt: cobble needed far more weight than dirt, so a one-tile strip shrank to a hairline, and the shed's stone floor counted as "not path", so the strip faded before the door. Michael then asked for a rule that generalises rather than one that looks right only beside a house. **Ruled:** an authored surface covers its own tiles and its ragged edge reaches only outward (dirt 0.15 + 0.3·noise, cobble dirt's plus 0.15, water unchanged by giving it its own threshold, 0.40 + 0.5·noise, kept above dirt's); a laid tile beside an earth tile counts as that earth in the blend, so paths reach the door. Measured: the four path tiles are 96 to 100% cobble in cobble mode and 100% dirt in dirt mode; the pond is the same 2,812 pixels as before; water and cobble never touch grass; no seams; deterministic. Michael keeps the pond as it is (walkable, a look only).

**Step 4 reviewed by Michael and revised; paused for him again.** His verdict: "amazing", it "feels even less artificial now"; the dirt edges work "extremely well", and the ragged path to the cottage door reads as a path carved by feet. His five notes and what was done: (1) the cobble looked like a brick wall seen through a hole in the ground: the generated cobble is now round stones packed at random (jittered staggered centres, each pixel belonging to its nearest centre on the wrapped image, stones rounded, lit top left, a darker rim, each stone its own shade), still seamless; (2) no change to the dirt; (3) a setting, **Square and paths** (cobble or dirt, default cobble), switches the square and the two short paths to the cottage and the shed between the two at once, for comparing; it re-bakes live; the long road east stays dirt; (4) the farm's edge is tidier: its threshold went from 0.10 + 0.30·noise to 0.40 + 0.12·noise, so the plot keeps to its tiles with softened corners; (5) a trial pond: a 2×2 `floor_water` feature at [22, 21] with a generated water texture (dusky teal, pale ripple dashes, darker troughs) inside a dirt bank like the cobble's verge and a dark wet edge; it shows as a pool of about 1.4 tiles, because the bank and the edge take the outer band of the 2×2; water is only a look (it can be walked on). If it stays, the next questions are whether the bank spills onto the grass so the water fills its tiles, whether it blocks movement, and whether it moves. Checks after the changes: water and cobble never touch grass; deterministic; no errors.

**Step 4 as first built, verified, and paused for Michael** (the decals' and trees' new art is with Claude Design, `15b`). Step 4: the earth blends. Dirt, farm, and cobble meet grass and each other with ragged, pixel-crisp edges from per-kind weight fields (one value per tile, the chunk plus one tile beyond) and a world-space noise threshold; laid floors stay hard; generated world textures for dirt (soft drift, sparse grains, a few small stones) and cobble (rounded stones in staggered rows, each its own shade, lit along the top), and the edge noise, all through sprite definitions (`ground_dirt`, `ground_cobble`, `ground_noise`) that drawn art replaces by swapping `placeholder` for `image`; `floor_cobble`; the square cobbled. Checks: across the four chunks around the square, 93,169 cobble pixels and not one touches grass, borders included; farm tiles are 99.6% farm (only the outer corners round off); the one-tile path north of the square is 59% dirt at its open end and 99% where it meets the square, and spills almost nothing onto the grass beside it; no partial alpha; no seams; byte-identical bakes; a campfire and a torch light the cobbles at night; bakes during travel 9.3 ms median, 14.7 ms worst (pixels 6.0, decals 1.4, shadows 1.3, tint 0.4, upload 0.5). `ground.kindMap(cx, cy)` and `ground.kindNames()` give the kind of every pixel, for tests. **Step 4 build notes (logged in `02`):** the edge noise uses lattices of 16 and 8 pixels, not 16 and 6, since a seamless 128-pixel texture needs lattices that divide 128, and its contrast is stretched by 1.6 so the thresholds use the whole range; the earth kinds take neither the patch tint nor the canopy darkening, only the tree shadows; a farm pixel outside a farm tile reads the farm frame at its own place in its tile's frame, so furrows carry on across the ragged edge.

**Step 3 built; the decals' art is being redrawn** (Michael: too small, the leaves look like spray paint; "litter" renamed leaves, mushrooms more frequent, art requests in `15b-art-requests.md`). **Step 3 as built and verified, paused for Michael** (step 2 accepted with "go ahead"). Step 3: the flat decals, by the rules in `data/ground.json` (`decals` per biome), drawn after the grass and before the shadows. Checks, over four chunks (village, forest, two wild): no rule broken (leaves under a green tree always brown; under a coloured tree its own colour 80% of the time, measured 0.80; flowers never under a tree; twigs and mushrooms never in the open; every decal on a floor kind its rule allows); a chunk draws all 75 decals that spill into it from its neighbour, at the same world spots; no seams; byte-identical bakes. Bakes during travel: 9.2 ms median, 13.6 ms worst (warm phases: pixels 4.5, decals 1.0, shadows 1.1, tint 0.4). `ground.decalsFor(cx, cy)` lists a chunk's decals with their rule, colour, and nearest tree, for tests; `ground.stats().phases` times each phase of the last bake. **Step 3 build notes (logged in `02`):** decals go on grass only, except leaves, twigs, and pebbles, which may lie on dirt too (an `on` list per rule); decals are drawn before the shadows so a tree's shadow falls across its own leaves; a chunk draws the decals of tiles two beyond its edge, so decals up to about twice today's size still cross borders whole; the number of leaf decals is `floor(reach - d) + extra`; the nearest tree wins, ties to the first found in scan order (deterministic); every decal is mirrored or not by its own roll; decals are stamped from a list of their visible pixels. **For Michael:** with the trees' reach at 2 to 4 tiles, only 1 to 8% of grass is beyond every tree, so the open-ground rules (flowers, leaves in the open) almost never fire; one flower in four chunks. If he wants flowers in the forest, the fix is data: give `flowers` `"where": "any"`, or lower the trees' reach.

Step 2, for the record: **built and verified** (accepted: "the grass looks awesome, textured but not aggressively so"). Step 2: the patch tint and canopy darkening on the grass, read per pixel from a grid of samples four to a tile; stepped tree shadows baked into the ground; every tree definition carries `canopy.reach` (2, 3, 4 by tier), `shadow.width` 0.42, and `leaves` (its colour, or brown for green and the gloom colours). Checks: felling a tree lightens the ground under it on the next frame and replacing it restores the bytes; no seams and byte-identical bakes as before; bakes during travel run at a 9 ms median and 12.3 ms worst, texture upload included. **Step 2 build notes (logged in `02`):** a tree's darkening uses the straight-line distance from its trunk, not the brief's Manhattan tile count, and fades over its last tile of reach, so the darkening is an even ellipse on screen with no rim; a shadow's horizontal radius is `shadow.width` times the frame's width (the mockup's 84% wide ellipse; the spec's halving was wrong); only grass takes the tint, laid floors do not; the canopy is summed tree by tree over the samples within its reach, which halved the bake.

Step 1, for the record: **built and verified.** `src/ground.js`, `data/ground.json`, the kit's 26 PNGs in `data/art/ground/`, ground draws in `gl.js` (`u_texSize`, `uploadGround`, `groundQuad`), `emitGround` in `render.js` in place of `emitFloor`, boot prebake, the per-step queue and eviction, `map.setFloor`, `map.onGroundChange`, `map.biomeAt`, the debug line. Checks: no checker on any floor; across three chunk borders (village, the bounds' edge, a wild chunk fourteen chunks out) every pixel is owned by exactly one chunk at full alpha; a chunk bakes byte-identical twice and after a reload; every grass variant flips about half the time; the light, ambient, and fog debug views and the night read per pixel across the baked ground as before; a floor change re-bakes its chunk and changing it back restores the bytes; a trip twelve chunks out and back peaks at 24 textures; a bake costs 2.5 to 4.6 ms warm, 14 ms at worst cold; the renderer's CPU cost per frame fell from 0.25 to 0.15 ms (the floor's share from 0.117 to 0.007 ms), measured stepped and warm on the same view. **Until step 4,** dirt and farm draw as their sheet's first frame, a hard diamond without the outline.

**Build notes (rulings the build made, logged in `02`):** the bake is one loop that copies each owned pixel from its owner tile's source, with no `drawImage` at all, since ownership and frame position are the same for every chunk and precomputed once; grass is drawn under every tile, laid ones included, and an antialiased edge pixel of a generated floor frame keeps its colour at full alpha, so no tile ever shows grass through its rim; the ImageData uploads straight to the texture, with no canvas kept; the generated flat tiles take `outline: false` (dirt and farm have it), which removed the drawn grid from the earth kinds. The screen position of a chunk's picture is `left + originX`, `top + originY` (the spec's minus was a typo, corrected below).

Scope (unchanged): Michael's four points, which this doc answers in order: (1) kill the obvious grid, texture the ground, and blend grass into dirt so nothing is a perfect diamond; (2) the kit's little additions (fallen leaves in the nearest tree's colour, twigs, pebbles, flowers, tufts, mushrooms) go on as optional layers, and their art may get bigger later without code changing; (3) it all works in the infinite forest beyond the authored map; (4) cobblestone roads will come, so the rule for how cobble meets dirt and grass is written now.

## What exists, and is not to be changed

- **Tiles** are 64×32. Tile `(gx, gy)` has its centre at world pixel `((gx − gy)·32, (gx + gy)·16)` (`iso.toScreen` with the camera origin at zero) and covers grid `[gx − 0.5, gx + 0.5) × [gy − 0.5, gy + 0.5)`.
- **The map** is chunks of 16×16 (`map.CHUNK`), grown on demand; `map.getChunk` creates one with `floorCache: null, floorDirty: true`, two fields left over from the Canvas 2D floor cache and unused since. Every tile is `{ floor, n, w, prop, room, items }`; `floor` is a sprite id (`floor_grass`, `floor_dirt`, `floor_farm`, `floor_stone`, `floor_wood`). Roads are `features` in the map file that set `floor` on rectangles. Wild tiles come from `wildTile`, a pure function of the tile and the seed; scatter inside the bounds is decided at load and never changes. `hash2(x, y, seed)` and `valueNoise(x, y, scale, seed)` in `map.js` are the project's randomness: every roll is a hash of a tile and a seed, never a sequence.
- **The renderer** (`gl.js`, `render.js`, docs/08) is one shader, one atlas, one interleaved vertex buffer, one draw per frame. Every vertex carries the world point its light is read from; the fragment shader samples light, ambient, and fog at `tileUV = (v_world − u_areaOrigin + 0.5) / u_areaTiles`. The floor today is `emitFloor`: one quad per tile in view from the floor sheet's two frames, alternated by `(tx + ty) % 2`, which is the checker Michael wants gone.
- **Dev art** is generated at boot by Canvas 2D (`placeholders.js`) and uploaded as textures; real art replaces files, not code (`assets.loadSprite`, which also handles `scale` and `bounds`).
- **Chunks grow three ahead of the player** (`map.ensureAround(player, 3)` each step), so every chunk within two of the view exists before the view reaches it. The light and fog textures cover `areaChunks` square around the camera (`render.ensureArea`).
- **Determinism rule:** anything placed by rule is a pure function of `(x, y, seed)` and the tiles, so a chunk regenerates identically across reloads and whatever order chunks grow in.

## Data

### `data/ground.json` (new)

Everything tunable lives here; the baker reads it and hardcodes nothing. One `biomes` entry per biome name used by the map's scatter and wild rules (`harvest` now; `gloom` later with its own tiles and palette).

```json
{
  "seed": 1,
  "floors": {
    "floor_grass": "grass", "floor_dirt": "dirt", "floor_farm": "farm", "floor_cobble": "cobble",
    "floor_wood": "laid", "floor_stone": "laid"
  },
  "terrain": {
    "dirt":   { "priority": 1, "texture": "ground_dirt",   "threshold": [0.25, 0.5], "lip": 0.18, "lipBand": 0.06, "includes": ["cobble"] },
    "farm":   { "priority": 2, "tiles": "floor_farm",      "threshold": [0.10, 0.3], "lip": 0 },
    "cobble": { "priority": 3, "texture": "ground_cobble", "thresholdAbove": "dirt", "verge": 0.2, "lip": 0.12, "lipBand": 0.06 }
  },
  "edgeNoise": "ground_noise",
  "biomes": {
    "harvest": {
      "grass": ["data/art/ground/grass_0.png", "data/art/ground/grass_1.png", "data/art/ground/grass_2.png", "data/art/ground/grass_3.png", "data/art/ground/grass_sparse_0.png", "data/art/ground/grass_sparse_1.png"],
      "grassBase": [75, 95, 61],
      "patch": { "scaleA": 5.0, "scaleB": 2.2, "mix": 0.7, "r": [0.88, 0.24], "g": [0.90, 0.18], "b": [0.92, 0.10] },
      "canopy": { "perTree": 0.07, "max": 0.20 },
      "shadow": { "steps": 3, "alpha": 0.09, "squash": 0.6, "dropPx": 2 },
      "decals": [
        { "id": "leaves", "kind": "leaves", "layer": "flat", "files": { "yellow": ["data/art/ground/leaves_yellow_0.png", "data/art/ground/leaves_yellow_1.png"], "orange": ["..."], "red": ["..."], "brown": ["..."] }, "treeColour": 0.8, "extraChance": 0.5, "openChance": 0.18 },
        { "id": "twig",     "layer": "flat", "files": ["data/art/ground/twig_0.png", "data/art/ground/twig_1.png"],         "where": "near", "chance": 0.25, "count": [1, 1] },
        { "id": "pebbles",  "layer": "flat", "files": ["data/art/ground/pebbles_0.png", "data/art/ground/pebbles_1.png"],   "where": "any",  "chance": 0.06, "count": [1, 1] },
        { "id": "flowers",  "layer": "flat", "files": ["data/art/ground/flowers_0.png", "data/art/ground/flowers_1.png"],   "where": "open", "chance": 0.10, "count": [1, 1] },
        { "id": "tuft",     "layer": "flat", "files": ["data/art/ground/tuft_0.png", "data/art/ground/tuft_1.png", "data/art/ground/tuft_2.png", "data/art/ground/tuft_3.png"], "where": "any", "chance": 0.45, "count": [1, 2] },
        { "id": "mushroom", "layer": "flat", "files": ["data/art/ground/mushroom_0.png", "data/art/ground/mushroom_1.png"], "where": "near", "chance": 0.10, "count": [1, 1] }
      ]
    }
  }
}
```

The numbers are the brief's. `where`: `near` is a tile within some tree's reach, `open` a tile within none, `any` either. `count` is `[min, max]`, inclusive, rolled uniformly.

### Art files

- The kit's PNGs go to `data/art/ground/` as they are (26 files, listed in `15a`; `ground.py` is not copied, it is Michael's generator). Decals draw at 1:1. When Michael regenerates them bigger (he has said they need "TLC, a bit bigger"), the files are replaced and nothing else changes: **the baker reads every size from the image, nothing hardcodes a decal's pixels.**
- **World textures** are sprite definitions in `data/sprites/`, loaded through `assets.loadSprite` like everything else, with one frame `idle_0` that is the whole image and that tiles seamlessly in world pixel space:
  - `ground_dirt.json`: `{"placeholder": {"kind": "ground", "variant": "dirt", "width": 128, "height": 64}}` → `placeholders.generateGround`: the dirt colour `#6e5a43` with sparse one- and two-pixel specks a step darker (`#5e4c37`) and lighter (`#7a6650`), seeded, seamless (specks wrap).
  - `ground_cobble.json`: `{"placeholder": {"kind": "ground", "variant": "cobble", "width": 128, "height": 64}}`: rounded stones about 10×6 px in a staggered iso-ish layout, stone `#6a6058` with a lighter top `#756a61`, gaps `#4a433d`, seamless. Dusky and warm; the test from `06-art.md` applies (what would the peasant zombie be standing on).
  - `ground_noise.json`: `{"placeholder": {"kind": "noise", "size": 128}}`: two octaves of tileable value noise (lattice 16 px and 6 px, weights 0.65 and 0.35), 0..255 grey, seamless by wrapping the lattice.
  - `floor_cobble.json`: `{"placeholder": {"kind": "flat", "color": "#6a6058"}}`, so the tile has a floor sprite like every other kind (the bake never draws it; the build palette and the map loader want a definition to exist).
  - Michael's drawn versions swap `placeholder` for `image` in the same files.
- **Tree definitions** (all 36 in `data/sprites/tree_*.json`) gain three fields, written by a small script: `"canopy": { "reach": 2 | 3 | 4 }` for `m`, `l`, `old`; `"shadow": { "width": 0.42 }` (a fraction of the frame's width, as the mockup used); `"leaves": "brown" | "yellow" | "orange" | "red"` (green trees and the gloom colours are `brown`; the others their own colour). Any prop definition with `shadow` casts one; only trees have it today.

### The map file

- `square.json`: the square's feature gets `"sprite": "floor_cobble"` (ruling 3). An optional top-level `"ground": { "seed": 7 }` overrides `ground.json`'s seed per map.
- `assets.loadMapSprites` must also want `floor_cobble` and the three world textures; simplest is for `ground.init` to load its own (`terrain[*].texture`, `edgeNoise`, every `floors` key).

## Drawing

### `gl.js`

- The uniform `u_atlas` (a float) becomes `u_texSize` (a `vec2`); the vertex shader divides `a_uv` by it. The batch sets it to the atlas size; each ground draw sets it to `(1024, 512)`. Nothing else in the shaders changes.
- **Ground draws are the first thing in the frame.** `gl.groundQuad(texture, x, y, w, h, worldCorners)` pushes six vertices (uv `0..1024`, `0..512`; `world` the chunk's bounding-box corners in grid coordinates, TL, TR, BR, BL, from the inverse of `toScreen`; height 0; colour white; flags 0) and records `{ texture, first, count }`. `gl.end` draws the recorded ranges first, each with its texture bound to unit 0 and `u_texSize` set, then binds the atlas and draws the rest of the buffer as today. One `bufferData`, a handful of draws.
- `gl.uploadGround(cx, cy, canvas)` / `gl.deleteGround(cx, cy)`: a `Map` of textures by `chunkKey`.

### `render.js`

- `emitFloor` goes. `emitGround(tiles, camera)`: the set of chunks the viewport tiles touch; for each, `ground.textureFor(cx, cy)`; if `null`, bake it synchronously now (`ground.bakeNow`), since **nothing may draw as a hole in view**; then `gl.groundQuad` at screen `(left + originX, top + originY)` with the camera origin from `iso.getOrigin()`, which is integer (`camera.applyOrigin` rounds), so the picture lands on whole pixels.
- The fog, night, and debug views are per fragment at `v_world`, so they behave exactly as they did over per-tile quads. Verify with the `L` key: the light, ambient, and fog debug views must look the same as before.
- **The build-mode grid** (`placement.mode()` is `"build"` or `"remove"`; add that getter): after the ground and before the drawables, for every tile in view, the tile's `n` and `w` edges as one-pixel lines (`gl.poly` thin quads), white at alpha 0.12, flags `UNLIT | NOFOG`. Not in prop placement, which has the ghost's diamond.
- `floorItemDrawables`, the ghost, and hit shapes are unchanged.

## Lifecycle

- **Boot** (`main.js`): after `loadMapSprites`, `await ground.init(data)`, then after the map loads and the camera is placed, `ground.prebake(camera.viewportTiles(V.w, V.h))` before the first frame. People will sit for a loading screen; the title screen covers it.
- **Each step**, after `map.ensureAround`: `ground.update(cam.gx, cam.gy, tiles)`: queue every chunk within one of the viewed chunks that is not baked, bake the nearest one, evict the far ones.
- **Changes.** `map.setFloor(x, y, id)` is added and is the only way a floor changes after load; `placeProp` and `removeProp` already exist. All three call the ground-change hook `map.onGroundChange(fn)` (registered by `ground.js`, so `map.js` does not import it) with the tiles touched, only when the change matters (a floor; a prop whose definition has `shadow`). The hook is `ground.invalidate(tiles)`: dirty every chunk holding a tile within 4 of them (a felled giant's shadow and leaves reach that far). A dirty chunk in view re-bakes on the next frame; one dropped frame on felling a tree is accepted.
- **Chunk creation** needs nothing: a chunk's bake reads its neighbours through `map.tileAt`, which creates them, and they are at most one chunk beyond a chunk that is itself within one of the view, well inside the three-chunk ring `ensureAround` keeps.

## Build order, with pauses for Michael

Each step is verified in the browser pane through `window.__game` and a saved screenshot (`__game.ground.savePng(cx, cy)` and the `/__screenshot/` endpoint) before the next; Michael looks at the end of each step. Never ask him to test by hand; show him the picture.

1. **The pipeline.** `ground.js` with layers 1, 2, and the ownership clip only; `gl.js`'s ground draws and `u_texSize`; `emitGround` replacing `emitFloor`; the kit's grass PNGs in `data/art/ground/`; `ground.json` with the harvest biome's `grass` list; boot prebake and the per-frame queue; the debug line. **Verify:** no checker; the `L` debug views unchanged; no seams along chunk borders (sample a row of pixels across a border with `javascript_tool` on the canvas, every alpha 255 inside the world); frame cost not worse than before; the same chunk baked twice hashes identically. *Pause: Michael sees textured grass.*
2. **Tint, canopy, shadows.** Layer 3's tint and layer 4; the tree definitions' new fields. **Verify:** clearings lighter, the forest floor darker, no visible tile steps in the tint (zoom with the `zoom` action on a flat area); a felled tree's shadow is gone the next frame (`map.removeProp` from the console). *Pause: Michael judges the patches and the shadow strength.*
3. **Decals.** Layer 5 from the data. **Verify:** leaves under an orange tree is orange and brown, under a green tree brown; flowers only in the open; a decal at a chunk border is whole; a re-bake draws the identical decals. *Pause: Michael judges density and size, and may regenerate the kit bigger.*
4. **The earth blends.** The terrain fields, the generated world textures and noise, `floor_cobble`, the square cobbled, `map.setFloor`. **Verify:** no hard diamond anywhere outdoors; no pixel with partial alpha at any terrain edge; the square's cobble sits in a dirt verge all round; the one-tile road north of the square reads as a path; farm plots cover their tiles with furrows. *Pause: Michael judges the raggedness and the cobble; he may bring drawn textures.*
5. **The rest.** The build-mode grid; eviction and the cap (walk twelve chunks out and back, textures ≤ 36, no hole ever drawn); the acceptance list below as a script; docs and TODO.

## Accept when

1. **No grid.** Outside build and remove mode, no tile outline or alternation is visible on grass, dirt, farm, or cobble, at every zoom level.
2. **No seams.** Along every chunk border in view, no transparent or partial pixel, and the terrain edges and tint continue across it.
3. **Pixel-crisp edges.** Every outdoor pixel is exactly one kind; no partial alpha at a dirt, farm, or cobble edge; edges do not move when the camera moves.
4. **Deterministic.** A chunk baked twice, or after a reload, is byte-identical; a wild chunk twelve chunks out is identical on two visits.
5. **The verge.** Nowhere does cobble touch grass.
6. **Lit as before.** Night, torch pools, fog, and the three debug views over the baked ground match the per-tile floor's behaviour; a campfire on cobble lights the stones.
7. **Shadows and leaves follow the trees.** Felling a tree removes its shadow within a frame; leaves colours match the nearest tree.
8. **Nothing materialises in view.** No frame ever draws a hole where a chunk's ground is not yet baked.
9. **Budget.** Bake ≤ 16 ms per chunk on Michael's machine; the renderer's frame cost not above today's; ≤ 36 ground textures resident.
10. **A screenshot of a forest edge with a clearing matches the mockup in feel** (Michael's eye; the mockup is in his Claude Design session, not in the kit).

## For Michael, from Claude Design

Nothing here waits on these; the generated stand-ins carry the build.

- `dirt_world_128x64.png` and `cobble_world_128x64.png`: seamless in world pixel space (the left edge continues the right, the top the bottom), muted, no outlines around stones.
- `edge_noise_128.png`: optional; the generated one is fine.
- The decals, bigger: regenerate with `ground.py` (tuft `w`/`h`, leaf pile `w`/`h`/`n`, mushroom and twig sizes) at about 1.5 times, since the trees are 1.5 times. Any size works; only the files change.
- Later: the gloom grass set (the ramp constants at the top of `ground.py`), and drawn planks and flagstones for the laid floors, which are still the old flat placeholders.

## What this must not foreclose

- **Gloom and other biomes:** a `biomes` entry and `biomeAt`. Done above.
- **Seasons and snow:** a second tint set per biome and a `snow` terrain kind over everything; the bake is the one place it would go.
- **Rivers and bridges** (`03`, features): a terrain kind with the highest priority and its own edge style; the laid-floor rule gives a bridge a hard edge.
- **Tilled soil by the player:** `map.setFloor(x, y, "floor_farm")` and the re-bake. Nothing else.
- **Standing decals:** the `layer` field exists; a `standing` decal becomes a drawable in `propDrawables` keyed by its foot.
- **Roofs and upper floors:** the ground is layer 0's picture; a second layer is a second bake drawn in order, as docs/08 says.
- **Building floors:** a palette entry that calls `setFloor` with a cost. The hard-diamond rule covers what is laid.
- **A larger atlas or more art:** the ground is not in the atlas, so it takes none of it.

## Paragraphs the sweep corrected in place in the live doc, as they stood

Then `gl.uploadGround(cx, cy, canvas)` creates or replaces the chunk's texture (RGBA, `NEAREST`, `CLAMP_TO_EDGE`, no mipmaps), and the chunk's `floorDirty` is cleared. The canvas can be dropped after upload; a re-bake makes a new one.
