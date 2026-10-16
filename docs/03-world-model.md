# 03 — World model: chunks

**Status, 2026-10-16: built; a reference.** The map is chunks of 16 by 16 tiles stored block by block (`src/map.js`), rooms are found by flood fill, and the authoring vocabulary below is what `tools/mapgen/` writes. The records this page planned (an active region of radius 2, record hopping, alarm, lure, trickle) were never built; what stands in for them is in Chunks and growth below. The plan as written, with its Zomboid comparison and the questions it asked, is `history/03-world-model-plan.md`.

## Chunks and growth

The map is a dictionary of 16 by 16 chunks keyed by chunk coordinate, every access through `tileAt(x, y)`. The map file lists the authored chunks; a chunk outside its `bounds` is **wild**, grown from the map's `wild` rule (a biome's kinds, a density range shaped by noise, a seed, a few of the dead), deterministic per tile, so it is the same forest every load; inside the bounds an unauthored tile is plain floor. **Growth is the ring alone** (`02`, 2026-10-13; `31/05` item 8): every step the world grows four chunks round each player (`map.ensureAround`, which every caller passes 4), and nothing else grows a chunk: a read beyond the ring sees a blank tile, the renderer and the ground never grow one, and the ground bakes a chunk only once its neighbours are grown. A wild chunk play has not changed is dropped once it is more than eight chunks from every player and holds no villager (`map.evictFar`, `world.evictChunks` in `data/tuning.json`), its dead and its fallen asleep with it (`map.sleep`) until it grows again, the sleepers kept in the save. The dead and the villagers more than 40 tiles from every player stand still (`game.nearPlayer`, `world.activeTiles`), so the thinking region is the union of one box per player. The save writes every loaded chunk whole (the floors run-length, the walls with their state, the props by their anchor, the items on the floor); a chunk not loaded regrows from the file and the seed (`src/save.js`, `game.serialize`). Nothing materialises in view.

## Rooms

- Flood fill from any interior floor tile through floor, stopping at any wall on an edge, whether plain, door, or window. Each enclosed region is a room with an id. Recomputed when a wall changes. Walls are not tiles: every tile has a slot for a wall on its north edge and one on its west edge, Zomboid style, so a building's south wall is the north wall of the tiles below it.
- A room carries its openings and whether it is lit (derived at light time from its fires' `lit`, `map.js`; the spec's `hearthLit` field was never stored, `07`), and derived **sealed**: no broken shutter, no open or broken door, every window shuttered or boarded. Sealed is the sibling's enclosure state, found instead of flood-filled from the player; it is shown in the debug corner and gates nothing yet, since sleep needs only a bed indoors and nothing interrupts it (`30`, 3.3).
- Ambient light indoors follows the cozy parent's rule: a lit hearth lights the room; an unlit room gets daylight by its openings.
- A door or a window sits on the edge between two tiles. Which side is outdoors is read from the rooms on either side (`outsideSign` in `map.js`), which is how open leaves know which way to swing.

## Authoring: sets, features, scatter, wild

Michael's vocabulary (2026-10-09), as built in `map.js`:

- A **set** is an authored thing with a footprint and a **padding ring** that scatter never enters: a cottage, a farm plot, an overturned wagon to loot, a whole castle compound. The footprint may be any shape: a rectangle, a union of rectangles, or a text mask, concave or with a courtyard; the ring is the footprint grown outward by the padding distance. Its buildings, floors, and props are placed relative to its origin. A set is defined by its own outline, so two sets joined by a road stay two sets; a compound is one big set with a yard's worth of padding.
- A **feature** is linear and reserves only its own tiles, with no padding: roads now, rivers and bridges later. A road may run right up to a set's edge.
- **Scatter** fills what is left by rule: a rectangle, a biome's kinds, a density range shaped by noise, a seed. Trees now; carts, bodies, and events are later kinds.
- The **wild** beyond the authored bounds is scatter all the way down, plus a few of the dead per chunk.
- Authoring is sliced into chunks at first load, and chunks are what the game fetches and saves, per the block-storage ruling. Nothing in the runtime knows a set's name; it knows tiles and rooms. The valley is written by `tools/mapgen/valley.py` from a description per place (`30` step 0), never typed.
