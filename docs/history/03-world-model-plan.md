# 03 — The world model's plan (2026-10-08)

The plan sections of `docs/03-world-model.md` (what nodes did, the Zomboid comparison, the chunk size and the active region, the records, alarm, lure, and trickle, rendering with a camera, the save, single storey, and the questions the page asked), with its status block and the lines rewritten in place as they stood; moved here whole by the sweep, 2026-10-16. The live text is `docs/03-world-model.md` (Rooms and Authoring). Never edited after.

## The status block as it stood

Michael's proposal, ruled 2026-10-08 (see `02-decisions.md`): replace nodes with chunks, Zomboid style. A correctly chunked world feels like one continuous world. Render the dead nearby; simulate the rest. Keep it far simpler than Zomboid's meta-zombie maths. Rulings on the questions at the end: block-by-block storage from the start, active radius 2, break-ins only inside the active region, rooms by flood fill, single storey first. Authored versus procedural stays open as question 9 in `02`.

**Status (2026-10-13):** the storage, `tileAt`, the wild, the rooms, the camera, and the authoring vocabulary below are built as described. **The records are not**: there is no active region of radius 2, no record hopping, no alarm, lure, or trickle, and nothing materialises at a boundary. What stands in for them today, all of it per player since the world holds a list of players (`31`): the dead and the villagers more than 40 tiles from every player stand still (`game.nearPlayer` in `src/game.js`, `world.activeTiles` in `data/tuning.json`), so the thinking region is the union of one box per player; the world grows four chunks round each player every step (`map.ensureAround` in `game.begin`); and a wild chunk play has not changed is dropped once it is more than eight chunks from every player and holds no villager (`map.evictFar`, `world.evictChunks`), its dead and its fallen asleep on record with it (`map.sleep`) until it grows again, the sleepers kept in the save (`23` step 2, `02` 2026-10-12). When the records are built, the active region is the same union: a chunk is active if it is within radius 2 of any player's chunk. The rest of this page's records stay a milestone of their own (`TODO.md`, "After the probe").

## What nodes did, and what takes over

The cozy parent's node was five things at once. In a continuous map they come apart, and only some of them want to be chunks.

| Job | Node did it by | Here |
|---|---|---|
| Storage and loading | one JSON per node | **chunks**, 16×16 tiles, the map is a dictionary of chunks keyed by chunk coordinate |
| Which dead are full entities | the one node the player is in | **the active region**: the chunks within radius 2 of the player's chunk (5×5 chunks, 80×80 tiles) |
| Abstract zombie movement | records hopping edges between nodes | **records hopping between chunks** |
| Alarm, trickle, pull | per node, by hop distance | **per chunk**, by chunk distance |
| Light map cache | per node, keyed by its light signature | **per chunk**, rebuilt when a source in it or next to it changes |
| "The room behind the window is lit" | the node | **rooms**, found by flood fill over interior floor bounded by walls, doors, and windows. Not a chunk thing |
| Visibility | not needed, you saw the whole node | **per frame over the viewport only**, a shadow cast from the player. Not a chunk thing |

So: chunks for storage, simulation granularity, and caches. Rooms for anything about rooms. The viewport for anything about seeing.

## Zomboid for reference

Looked up 2026-10-08 in the unofficial Build 42.21 Javadoc constants, so these are the real numbers rather than forum lore.

| | Build 41 | Build 42 |
|---|---|---|
| Chunk | 10×10 tiles | **8×8 tiles** |
| Cell (the save and map-file unit) | 300×300 tiles, 30 chunks | **256×256 tiles, 32 chunks** |
| Levels | 8 | 64, ground at level 32, so basements go to −32 and floors to +31 |
| Tile diamond | 64×32 at 1x textures, 128×64 at the default 2x textures | same |
| Loaded area | a square of chunks around the player, width computed from resolution and zoom, not a published constant; community figures put Build 41 at about 13×13 chunks, so about 130 tiles square | same mechanism |

What Zomboid shows on a 1080p monitor at 100 percent zoom with 2x textures: 15 diamonds across, about 17 down, roughly 500 tile footprints, a cross-section of about 16 tiles along each grid axis. **That is exactly our 960×540 canvas at 64×32 shown at 2x.** Zoomed out, Zomboid shows several times more; players on 4K report it is barely zoomed in at all.

How it simulates the rest: a `ZombiePopulationManager` tracks population per cell, converts real zombies to virtual ones when their chunks unload, keeps per-chunk minimum and maximum densities, and takes world sounds and aggro targets to pull the virtual population. Community notes that the virtual population ignores pathfinding, which is why a zombie can occasionally appear inside a sealed building. We do not need any of that depth, but the shape is the one proposed below: real near the player, counted and nudged elsewhere, materialised at the boundary.

Takeaway for our chunk size: Zomboid's 8×8 is a streaming granularity for a map 20,000 tiles wide. At village scale the chunk is a sim and cache unit, so 16×16 (one viewport across) is the better fit; with 8×8 the active radius would need to be 4 or 5 chunks to keep the boundary out of view. Our proposed 80-tile active square is about five screens wide; Zomboid's loaded area is about eight.

## Chunk size and the active region

- **16×16 tiles.** About one viewport across at 64×32 (960 px wide shows roughly fifteen diamonds). A village of 128×128 tiles is 64 chunks, 16k tiles.
- **Stored block by block from the start** (ruled). The map is a dictionary keyed by chunk coordinate; every access goes through `tileAt(x, y)`. The map file lists authored chunks; a chunk outside the authored `bounds` is **wild**: grown on creation from the map's `wild` rule (a biome's kinds, a density range shaped by noise, a seed, a few of the dead), deterministic per tile so it is the same forest every load. Inside the bounds an unauthored tile is plain floor. Chunks are grown in a ring round the player so nothing hitches (four chunks as built, `map.ensureAround`), and a wild chunk play has not changed is dropped again once it is far behind every player (the status above). **Since 2026-10-13 the ring is the only growth** (`02`; `31/05` item 8): a read beyond it sees a blank tile, the renderer and the ground never grow a chunk, and the ground bakes a chunk only once its neighbours are grown; with more than one player the ring is round each of them. The save writes every loaded chunk whole, and a chunk not loaded at the save regrows from the file and the seed (`02`, 2026-10-13, "The save"). This costs on the order of a hundred lines over a flat array, not multiples, and nothing on the browser.
- **Active region: radius 2 chunks around the player's chunk.** Inside it every zombie is a full entity with a sprite, A\*, and combat. Outside it every zombie is a record. The boundary is at least 32 tiles from the player; the viewport reaches about 16. **Nothing materialises in view.** This is the cozy parent's rule and the one that must survive.
- When the player crosses into a new chunk, the active set shifts by one row or column: chunks entering it materialise their records at their tiles; chunks leaving it dematerialise their entities into records at their tiles. An entity that walks out of the active region on its own becomes a record where it stepped out.
- Cost: 6400 active tiles, a few dozen active dead. Trivial.

## Records

A record is `{ id, chunk, tile, state, target, timer, hp, aggro, ...body fields }`, the cozy shape with chunk for node.

- **Idle:** stays at its tile. Per sim tick, a small chance to start moving, scaled by its chunk's alarm and by night. Aggro records always move.
- **Moving:** toward a target chunk one step at a time, `timer = 16 / speed` per chunk hop (16 s for a shambler). The step is the neighbouring chunk that reduces chunk distance to the target. Target is the player's chunk for aggro records, the loudest nearby alarm for the rest.
- **Arriving at an active chunk:** materialise on the nearest walkable outdoor tile on that chunk's far side from the player, never inside a building. Then it is an entity and walks the last 30 to 40 tiles for real, which is the dread.
- **Indoors:** a record that was dematerialised inside a building keeps its exact tile and never hops chunks. It is where you left it when you come back.
- **Villagers** are records too, with `kind: npc`. They never hop chunks and their routines do not tick as notes (`04-npcs.md`).
- **No off-screen wall attacks.** Ruled. Inside the active region the dead are real and break in whether or not you can see them, which is "slightly off screen". Beyond it they are notes and touch nothing. Your home is only ever broken into while you are within about two screens of it. Michael: the dead breaking into houses that do not contain the player is not a priority.

## Alarm, lure, trickle

- **Alarm** per chunk. Noise adds its loudness to the source chunk and spreads to neighbours at a falloff per chunk, a few chunks out. Decays per tick. Idle records pick more often where alarm is high and head for it.
- **Lure** per chunk: the sum of static light at lit windows and lamps in that chunk at night. Added to alarm when records choose. "Light through windows at night draws them" without any zombie knowing what a window is.
- **Trickle:** every so often, one chunk at least 3 chunks from the player and under its cap gains a record on a random outdoor tile. Caps are authored per chunk (the square is busier than the fields) or derived from a zone layer.

## Rendering with a camera

- The camera is a float grid position; `toScreen` subtracts it. Draw the chunks that intersect the viewport plus one.
- **The ground is one picture per chunk**, baked on the CPU and drawn as one quad (`15-ground.md`, 2026-10-11; it replaced the per-chunk floor cache).
- Walls on all four sides of a building. **Cutaway:** when the player is inside a room, that room's walls on the near two sides (south and east) draw full height and translucent, so a window or a door looks the same inside and out (ruled 2026-10-09; the cozy parent's low stubs were the plan, lived on a key for comparison, and retired with the drawn walls on 2026-10-11, kept as an idea in `05-someday.md`). Walls of other buildings draw full height. How this reads was proof 2 of the probe, and it passed.
- Sorted drawables carry over. Occlusion is a soft hole cut through every tree's canopy over the player (trees only, 2026-10-11), not a fade, and the parent's silhouette pass is gone. The night layer and the light map arrive with lighting and are drawn per visible chunk.
- **Visibility:** a shadow cast from the player over the viewport using the light map's ray code with the player as the source. A tile is visible if its centre can be seen or, failing that, any of four points near its corners. Tiles out of sight draw darkened; the dead out of sight are not drawn at all. Walls you can see the face of are visible. An open shutter passes sight and blocks bodies except a climb; a closed shutter, a closed door, or a board blocks both.

## Save

- Per chunk: run-length rows of floor kinds, the edge walls with their kind and state, and a sparse list of tiles with non-default state (a prop felled, a shutter open). Wild chunks are regrown from the seed and save only their differences. Records as a list. Rooms, light maps, and floor caches are rebuilt, never saved. **As built (2026-10-13, `src/save.js`, `game.serialize`):** every loaded chunk is written whole (the floors run-length, the walls with their state, the props by their anchor, the items on the floor), not its differences; a chunk not loaded regrows from the file and the seed; the sleepers go by chunk key in place of records.

## Single storey, for now

Upper floors are the one thing this model makes harder than nodes did. Zomboid stacks floors in a cell and hides the ones above you, which is its hardest rendering. Ruled: the village is single storey until the probe passes, tile data carries a layer index from day one, and upper floors are decided then. Options at that point: z-layers in the chunk, or small separate areas reached by stairs with a cut. Nothing in the renderer or the tile format may assume one layer forever (`05-someday.md`).

## The questions this page asked, and the answers (2026-10-08)

1. **Village or countryside?** Block by block from the start, so the countryside is possible. Michael: one file cuts off too many opportunities, provided the cost is not multiples of the code. It is not.
2. **Off-screen break-ins?** Only inside the active region. Beyond it, nothing.
3. **Active radius 2?** Yes.
4. **Rooms by flood fill or authored?** Flood fill, for the same reason as block storage.
5. **Single storey first?** Yes.
6. **Building?** Kept open at zero cost; also the dev tool. Question 14 in `02-decisions.md`.
7. **NPCs?** Raised by Michael. See `04-npcs.md`.

## Lines rewritten in place, as they stood

- Authoring is sliced into chunks at first load, and chunks are what the game fetches and saves, per the block-storage ruling. Nothing in the runtime knows a set's name; it knows tiles and rooms. The in-game creative tool (question 14 in `02`) can replace hand-written JSON later.
