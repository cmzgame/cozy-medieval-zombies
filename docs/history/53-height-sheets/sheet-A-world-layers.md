# Sheet A: the world's model of elevation (layers, floors, stairs, cliffs, ramps, rings, battlements, gates, movement across layers)

Read from the worktree at e3c771ed (latest main), code first, docs second. Every `file:line` is from that checkout. "Read" means I read the lines; "inferred" means I reasoned from the code and did not run it. The renderer, sight, and light are out of scope here; I mention them only where the world's data drives them.

Doc drift found while reading (worth a one-line fix somewhere):
- `src/CLAUDE.md` says `net.PROTOCOL` is 24. The code says **27** (`src/net.js:173`; 25 is rings, 26 is built floors and stairs, 27 is gates).
- `docs/49`'s status block says "rings upstairs not yet". In fact `map.ringProblem` builds a ring on a storey (`src/map.js:1687`), and a headless row builds one (`tools/check.js:7517`).
- `docs/50` section 3 says a round tower holds "a stair inside it". The code refuses this whenever there is a ring on the storey above (see section 9).
- `tools/checks/layers.js` is about painted figure layers (`docs/25`), not storeys. It proves nothing in this area.

---

## 1. Layers: the count, the cap, the address

**Rule:** A layer is any whole number: 0 is the ground, 1 and up are storeys, -1 and down are cellars. Every chunk is keyed by `(cx, cy, layer)`. Every tile read, mutator, collision test, room fill, and path test takes a layer, and it defaults to 0. A tile address is `[x, y]` on the ground and `[x, y, layer]` off it.

**Numbers:**
- `STOREY = 96` px (`src/map.js:67`).
- Chunk key: `layer * 2^32 + ...` (`src/map.js:2604`). Not capped.
- **The wire caps a layer at -8..8.** `net.layerIn` (`src/net.js:1494`) silently reads anything else as 0. An arrow's launch record is capped the same way (`src/archery.js:496`).

**Code:** `chunkKey`, `getChunk(cx, cy, create, layer)` (`map.js:2614`), `tileAt` (`2697`), `growTile` (`2707`), `peekTile` (`2725`), `addr` and `layerOf` (`2207-2213`), `withDrawLayer` (`2682`, the renderer's only, never during a step).

**With friends:**
- Touched chunks go as `[cx, cy, layer]` (`map.js:2172`).
- A player's `layer` and `rise` are in the light record. The dead's and villagers' slim records carry `layer` and `rise` when they are not 0 (`net.js:829-830`).
- A guest's `act`, `use`, and `place` commands must name the acting player's own layer, or the host drops them (`net.onPlayersLayer`, `net.js:1497`, used at `:715` and `:730`).

**Limits:**
- Nothing in building caps the height. `stairBuildProblem` refuses only `layer < 0` (`map.js:3004`), so stairs can climb to layer 9 and beyond. A guest standing on layer 9 or higher would have every command read as layer 0 and refused. Michael's three storeys (layers 0 to 3) are well inside the cap.
- **Gotcha:** the default layer of `tileAt` and `peekTile` is `drawLayer`, which is 0 during a step. Any sim call that forgets the layer silently reads the ground. Several do (sections 11 and 12).

**Confidence:** high (read).

## 2. The void, the earth, the hole, and the no-fall rule

**Rule:**
- An unauthored tile above the ground is `VOID`. Below the ground it is `EARTH`. `HOLE` is a cellar stair's opening.
- These are engine floors with `walk: false` (`floorRule`, `map.js:2838-2845`).
- A read on a layer with no chunk returns a frozen blank of that kind and grows nothing (`blankOf`, `map.js:87`).
- `circleBlocked` treats a non-walkable floor like water: no body's circle may overlap it (`map.js:3222-3228`). So a floor's open edge is a wall of nothing.
- `moveCircle`'s overlap rule (`map.js:3333`) means a body already overlapping something may move only in ways that go no deeper into it. Knockback, separation, and a door shut on someone all go through `moveCircle`, so nothing is ever pushed into the void.
- **Nothing falls, ever:** there is no code path that drops a body a layer.

**Numbers:** none. The engine floors are hard-coded (`map.js:68-71`).

**Code:** `isEngineFloor` (`:72`), `emptyFloorOf` (`:76`), `isWalkableTile` (`:2868`), `circleBlocked` (`:3199`), `moveCircle` (`:3333`).

**With friends:** The blank is the same on every machine. A guest's prediction runs the same `moveCircle`.

**Limits:**
- Items have no such rule. An arrow loosed on a storey that lands over the void is dropped onto the void tile on that layer (`archery.js:369` calls `map.dropItem`, which grows a chunk on that layer, `map.js:886`). Nobody can ever walk there to pick it up, so the arrow is lost and a layer chunk is grown and kept for it (inferred).
- The proving rows: `tools/check.js:5590` (a read on another layer is void or earth, grows nothing, no body stands there).

**Confidence:** high.

## 3. Floors on a storey (support: "built wherever it touches a walkable tile of its own floor")

**Rule:**
- `floorBuildProblem` (`map.js:1066`) refuses these: over a stair; on a landing; on earth or a hole; on water; the same floor already there; a prop or rug on the tile.
- On a storey, a void tile must touch, by an edge, a walkable tile of that layer, or a tile laid earlier in the same drag (`grows`, `:1073-1076`). Otherwise: "Build it out from a floor".
- A laid floor keeps `built: { under, free? }` (`:1082`). Taking it up puts `under` back, which is void on a storey (`takeUpFloor`, `:1141`).
- Take-up is refused when (`:1128`):
  - a wall stands on any of the tile's four edges;
  - a stair or landing is on it;
  - a prop, rug, or item is on it;
  - a body or corpse is on it (`placement.js:1263`).
- No physics: a lower wall holds nothing up and is never refused for a floor's sake.

**Numbers:**
- `floor_wood` costs 1 plank, `floor_stone` 1 stone; both 1 s, tool `build`, `dev` (`data/build.json`).
- `floor_cliff_top` and `floor_cliff_grass` cost 1 stone, are on the Terrain tab, and are `dev`.
- `MAX_DRAG` 12 tiles a side (`placement.js:265`).
- Free building's reach is `FREE_REACH` 48 tiles (`placement.js:48`). Floors are still tested for a clear line on the builder's layer (`placement.js:321`).

**Code:** `floorPlan`, `floorGhost`, `startFloorBuild` (`placement.js:307-423`); `map.buildFloor`, `takeUpFloor`.

**With friends:**
- A guest's `place` command of kind `build` carries the rectangle `tx, ty, tx2, ty2` and is laid on the guest player's layer (`placement.js:1669`).
- The chunk record carries `built: [lx, ly, under, free?]` (`map.js:2342`, installed at `:2424`).

**Limits:**
- **Everything is built on the builder's own storey** (`placement.js:244-250`): the cursor is read on that floor and every write names `player.layer`. To lay a plateau on layer 1 you must stand on layer 1. To build the cliff walls of layer 0 you must stand on layer 0.
- **The first tile on a storey must touch a walkable tile there.** In practice that means a stair's or ramp's landing (or an authored floor) comes first.
- A built floor is in no building index (section 13).

**Confidence:** high (read; rows `tools/check.js:6083`, `:6126`).

## 4. Stairs (three tiles, the landing, the crossing, who climbs, the pathfinder)

**Rule:**
- A stair is three tiles on its layer, climbing one storey. Its **landing** is the tile beyond the third step, one layer up. The tile before its foot must be walkable.
- Building a stair floors the landing and leaves its three-tile **stairwell** void above (`buildStair`, `map.js:3041`).
- A body on a stair has the stair's layer and a `rise`. **Crossing the top edge** (t from 3 to under 3.6, sideways offset at most 0.6) sets `layer + 1` and `rise 0`, and nudges the body in from the landing's sides (`stairStep`, `map.js:3138`). Going down is the reverse: stepping into a stairwell tile on the upper layer sets the stair's layer and `rise = riseOn(t)`.
- A stair's sides are closed on both layers, and its top edge is closed to a body not on it (`stairBlocks`, `:3088`). `canStep` allows a stair only along its line, from `before` up to the top step, with no diagonals (`stairStepOk`, `:3074`).
- **Built stairs climb north or west only**: "Stairs climb away from the camera" (`:2995`). Authored ones may face any way (the proving ground has `e` and `s`, `tools/mapgen/proving.py:45-46`).
- `stairBuildProblem` (`:2994`) refuses a stair when:
  - its three tiles, its foot, or its landing are not free;
  - a floor is over the stairwell, or another stair's well is ("A floor is over it", `:3012`);
  - a wall is across its run or at its head (a cliff head has its own words, `:3018`);
  - a wall stands across the stairwell's top on the upper layer;
  - a ring's curve is over the stairwell ("A round wall is over it", `:3022`);
  - the landing is not void and not player-laid ("Its landing must be open", `:3024`).
- **A built stair never comes up**, even with Free building: there is no remove path for stairs in `placement.removalTarget` (`:1065-1126`).
- `stairEdgeProblem` (`:1213`) refuses any wall, door, or window across a stair's run, across its top on either layer, or around its stairwell. A wall along its sides on its own layer is allowed.

**Numbers:**
- Rise: 32 px a tile.
- Twelve treads of 8 px (`STAIR_TREADS`, `stairRise`, `:3114-3118`).
- Feet half-width on a stair: `STAIR_FEET` 0.15 (`:3110`).
- The crossing window: t from 3 to under 3.6, offset 0.6 (`:3159`).
- Cost: `stair_wood` 10 planks, 20 s; `stair_stone` 9 stone and 1 plank, 30 s; both `dev` (`data/build.json`).

**Code:** `indexStairs` (`:2935`), `stairAt`, `stairsOn`, `landingAt` (`:1059`), `stairUnder`, `pastTop`; `placement.stairBlock`, `stairReason`, `stairGhost`, `startStairBuild` (`placement.js:469-531`).

**Who climbs:**
- **Players and guests:** yes. `updatePlayer` calls `stairStep` after each move (`entities/player.js:334`, `:360`), and a guest's prediction runs the same code.
- **The dead:** yes, by the stair-first rule (section 11).
- **Villagers and animals:** they never aim at another layer (their goals are `[x, y]`, layer 0). But `followPath` and `separate` call `stairStep` for everyone (`entities/movement.js:91`, `:128`). One that wanders onto a stair could be shoved over its top, land on layer 1, and then walk back down by the stair-first rule (inferred; no check).

**The pathfinder:** `pathfind.findPath` is a 2D A* over one layer's `canStep` (at most 1500 expansions). There are no 3D nodes. Crossing layers is `movement.repathByStair` (section 11), one storey per leg.

**With friends:**
- The authored stairs come from the map file on every client.
- A built stair rides its foot tile's chunk record as `stairs: [lx, ly, dir, material, free?]` (`map.js:2347-2350`). `installChunk` remakes the record and deduplicates by id (`:2439-2447`).
- A guest's `build` command for a stair names its low tile and `dir` (`placement.js:1678`).

**Limits:**
- The stair records list (`stairList`) is never pruned when a guest drops a chunk. This is harmless while the host never evicts built chunks (they are dirty).
- A player's click-to-walk (`player.js:297`) paths on its own layer only, with no stair-first rule (inferred).
- A stair needs five tiles in a straight line: the foot tile, three steps, and the landing.

**Confidence:** high (read; rows `tools/check.js:5898-6060`, `:6126`, `:6831-7136`; `check("storeys")`).

## 5. Ladders and hatches

**Rule:** **Not built.** There is no ladder or hatch record, verb, floor, or pose anywhere in `src/`: the grep for "ladder" finds only the repair ladders. `docs/49` section 4b and step 3b are spec only. The proving ground's cellar has "no way in until step 3b" (`docs/49` status).

**Confidence:** high.

## 6. Cliffs, cliff tops, and the ramp (how a hill is a layer-1 floor over walls)

**Rule:**
- A **cliff** is a wall whose definition says `wall.cliff` (`wall_cliff`, `wall_cliff_grass`). It sits on a layer's edges and blocks bodies and sight like stone.
- No door or window can be stamped in it (`canStampOver` via `wallRule().solid`, `map.js:1201`; placement says "Not in a cliff", `placement.js:818`).
- It comes apart only with Free building on ("Cliffs come apart only in Free building", `placement.js:1273`).
- Its **plateau** is simply the tiles floored on the layer above (`cliffs.plateauAt`, `src/cliffs.js:12`). **Nothing in the world joins a cliff wall to its plateau:** the wall blocks layer-0 bodies, and the plateau's open edge is void, unwalkable on layer 1. A plateau with no cliff walls is a floating floor that works the same. Cliff walls with no plateau are just stone walls with cliff art. `cliffs.js` (`buried`, `cornerAt`, `edgeFrame`) only chooses pictures.
- The **Stone ramp** is a stair of material `ramp_stone` (`stairKind`, `map.js:2971`; the `ramp` table and `landing: "floor_cliff_top"` in `data/sprites/stair_ramp_stone.json`). It is walked at 32 px a tile with no treads (`riseOn`, `:3120`).
- The ramp is placed at once, free, with no tool (`isInstantStair`, `placement.js:264`).
- It brings **solid sides** for its landing: a `wall_ramp_side` on the three edges of the *ground* tile under the landing other than the head, where none stands (`landingSideEdges` `:3032`, `buildStair` `:3048-3062`). These walls have no `built` flag, so they are never taken apart. The ramp is refused if anything stands on that ground tile (`:2998-3002`).
- **The ramp's head must not be a cliff wall** ("A cliff wall is at its head: take it down first", `:3018`).

**Numbers:**
- `wall_cliff`: height 96, thickness 16 (`data/sprites/wall_cliff.json`).
- `wall_ramp_side`: 96, `solid`.
- Build entries: cliff wall 1 stone, 3 s; ramp free (`data/build.json`).

**With friends:** Cliffs and ramp sides are ordinary walls in their chunk records. The ramp is a built stair record (section 4).

**Limits:**
- **Build order is forced by the rules above** (inferred from section 3 and the ramp rules):
  1. Build the ramp first; its landing is the first layer-1 floor.
  2. Stand on layer 1 and grow the cliff tops out from the landing.
  3. Go back down to layer 0 to build the cliff walls around the base. A cliff wall at the ramp's head must not be there when the ramp goes up.
- One cliff's height is one storey. A taller bluff is a hill on a hill: cliff walls on layer 1 with a plateau on layer 2 (`check("cliffs")` builds exactly that).
- **The ground under a plateau ringed by cliff walls is a sealed room on layer 0** (fewer than 300 tiles, bounded by non-see-through walls, `fillRegion` `map.js:3469`). This matters because some of the dead's code reads the ground's room by mistake (section 11): one standing on a bluff "is in" that under-hill room (inferred).
- The cliff checks: `check("cliffs")` (build, drawing, ramp refusals, walking each ramp) and rows `tools/check.js:6410`, `:6440`, `:6679`, `:6783`. None of them sends one of the dead up a ramp.

**Confidence:** high on the rules; medium on the under-hill-room consequences (inferred).

## 7. Rooms per layer (sealed? lit? ambient)

**Rule:**
- `rebuildRooms` fills each chunk's tiles on that chunk's own layer (`map.js:3543`). `rebuildRoomsAround` refills one layer (`:3579`).
- **Earth bounds a fill like a wall** (`:3516`); below the ground an ungrown chunk is earth.
- **The fill enters void**, so a stairwell inside a room's walls belongs to that room.
- Off the ground, a wall on the tile's own edge bounds the room even where the chunk beyond has not grown (`:3498-3512`). Otherwise an ungrown neighbour means outdoors.
- A room record carries `layer`. `roomSealed` (`:2111`) and `breachTargets` (`:2138`) read the room's own layer.
- Light: every source has a layer and each layer has its own light map (`light.js:50-58`, `:89`, `:159`, `ambientAt(x, y, layer)` `:190`).

**Numbers:** `ROOM_MAX` 300 tiles (`map.js:28`); a bigger region is outdoors.

**With friends:** Rooms are rebuilt on every client from the walls. They are never sent.

**Limits:**
- **Battlements bound no room** (they are `seeThrough`), so a wall walk is never a room. A shut **gate** does bound one, and the room counts as sealed (`docs/02` 2026-10-29; rows `tools/check.js:6566`).
- **A courtyard walled in on all sides with fewer than 300 tiles is a room, i.e. indoors.** That applies on any layer, and a castle courtyard is a likely case. Its light and the dead's siege rules then treat it as a house (existing behaviour, not storey-specific).
- The rows: `tools/check.js:5638` (layer-1 room independent of the ground), `:5817` (an upstairs window lights its own room).

**Confidence:** high.

## 8. Battlements

**Rule:**
- A battlement is a wall with `wall.battlement` (`wall_battlement`). It stands on a storey's edge with the walkway floor on exactly one side (`battlements.problem`, `src/battlements.js:38-45`):
  - "It needs a wall walk to stand on" on layer 0 or with floor on neither side;
  - "Only along the outer edge of a wall walk" with floor on both sides.
- A stairwell counts as floored (`floored`, `:21`).
- For the rules it is a low, see-through wall: it stops bodies, passes sight and light, bounds no room, and is no fence (the dead cannot strike it). No door or window (`canStampOver`, `map.js:1200`).
- Its side, picture, and corners are derived from the floors and never saved.

**Numbers:** `wall.height` 28 (a shot below it is stopped), thickness 0, `seeThrough: true` (`data/sprites/wall_battlement.json`). Instant and free under the Castle heading, `dev`.

**With friends:** It is a wall in the chunk record. A guest's ordinary `build` command places it. PROTOCOL is unchanged.

**Limits:**
- **A battlement cannot share an edge with a ring wall.** One edge holds one wall (`canStampOver` refuses a wall over a wall). So a round tower's crenellation goes on the storey above the ring, along the floor's *stepped* outline, and is drawn as straight stepped pieces, not a curve (inferred).
- **Its 28 px height is never read for a shot fired from the walkway**, because arrows read the ground's walls (section 14). `check("battlements")` tests `archery.wallStops(w0, 12)` and `wallStops(w0, 40)` directly (`tools/checks/battlements.js:200`). It never fires a flight on layer 1, so it does not see this.
- Proven on layer 1 only. Layer 2 and up use the same code but are untested.

**Confidence:** high.

## 9. Round rooms on a storey

**Rule:**
- A ring is edge walls tagged `round: [x0, y0, n]` on one layer. Its record is rebuilt from its walls (`settleRings`), keyed `round_<layer>_<x0>_<y0>`.
- Upstairs, `ringProblem` (`map.js:1680`) requires **every stepped tile to have a real floor**:
  - "A round room upstairs needs a floor under all of it";
  - "A stairwell is under it: keep the ring off the stair's hole" (`:1687-1690`);
  - plus the usual rules: no prop, rug, or item on the stepped tiles, no wall between them, the outline free or plain wall, no stair across an outline edge (`:1708`), no straight wall ending in a corner pocket.
- The curve-crossed tiles refuse furniture per layer (`curveCrossed`, `:1443`).
- `stairBuildProblem` refuses a stair whose stairwell or landing lies under a ring's curve on the layer above (`:3022`).

**Numbers:** 5 or 7 across. The stone ring costs 2 stone an edge; it is `dev` and free with Free building (`data/build.json` `round_stone`).

**With friends:** The ring's walls carry the tag in their chunk. `syncParts` has a `rings` part (`game.js:496`). PROTOCOL 25.

**Limits:**
- **No stair can join two storeys of a round tower with the same footprint.**
  - A stair inside the lower ring leaves a void stairwell inside the upper ring's stepped tiles. The upper ring is then refused (`:1689`).
  - If the upper ring goes first, its stepped tiles are floored, and the stair is refused: "A floor is over it" (`:3012`), or "A round wall is over it" for the curve-crossed tiles.
  - A stair can't leave the ring either, because the ring's own wall is at its head ("A wall is in the way").
  - The proving ground's two-storey tower (`proving.py:62-63`) has no stair. Its upper room is unreachable.
  - The only way up (inferred): a stair outside the tower, a floor bridged to the upper ring's door point, and a door there.
- A ring on layer 0 can still hold a stair inside it, provided nothing is built over the stairwell.
- The checks: `tools/check.js:7517` builds a layer-1 ring headlessly. `check("round")` reads layer 0 only.

**Confidence:** high for the stacked-tower refusal (read both refusals); medium for the bridge workaround (inferred).

## 10. Castle gates

**Rule:**
- A gate is 2 or 3 door-kind walls along one run, each with `gate: { i }`, sharing one `open` state (`setGateOpen`, `map.js:1876`).
- It is stamped only over **plain `wall_stone`** edges (`gateProblem`, `:1903`: "Over a stone wall", "Over a plain stone wall", "Not on a round room", no hangings, no torch; `canBuildWall(..., "door")`, which needs both tiles walkable).
- `deadBreak: false`: `needsBreaking` is false for it (`:2096`) and `damageOpening` does nothing (`:2058`).
- `bitesPass: false`: `blocksReach` (`:2777`) stops blows and bites. Sight and light pass (`grille`). Shots pass under the 78 px crown (`gateShotHeight`, `:1838`).
- It works on any layer (it takes `layer`), but a gate on a storey needs floor on both sides.

**Numbers:** `wall_stone_gate_2` and `_3`: span 2 or 3, swing 1.2 s, hp 400 (used only if `deadBreak` flips), crown 78 (`data/sprites/wall_stone_gate_2.json`). Instant, free, `dev`, under Castle.

**With friends:** Walls in chunks. A guest's `build` names the first edge. PROTOCOL 27.

**Limits:**
- The dead never target a gate. With the gate shut and no other way in, they search and cycle back to the chase while they can see you through the grille (section 11).
- `check("gates")` and rows `tools/check.js:6475`, `:6566` run on layer 0 only.

**Confidence:** high.

## 11. The dead against a player on another storey

**Rule:**
- **Seeing:** across one storey only, when both bodies are near the same stair: within -3 < t < 6 along it and |offset| < 2.5 (`layersMeet`, `entities/zombie.js:394-406`). Otherwise a floor hides everything. Two or more storeys apart: never (`:398`). A flame on another layer is never seen (`:477`). Sight-pull calls only the dead on the caller's own layer (`:611`).
- **Climbing:** a goal on another layer goes to `movement.repathByStair` (`entities/movement.js:44-79`):
  - Going up: every stair on this layer is tried with a full `findPath` to its top step, scored by path length plus the straight-line distance from its landing to the goal. The best wins.
  - Going down: the same, by the landings on this layer.
  - The path then runs over the top edge (or down the steps), and the next leg is found on the new layer. Ramps count as stairs.
  - With no stair found: `pathFailed`, and the body "stays and looks where it is" (`zombie.js:505`).
- **Biting and blows:** never across a storey. `biteReach` returns -1 (`zombie.js:329`). A player's blow uses `combat.targetsIn`, which filters by layer (`combat.js:200`). A shut gate stops a bite (`zombie.js:331`).
- **Siege and breach on a storey:** `docs/49` step 6 ("the hunt across storeys") is **not built** (`docs/49` status: "the rest not").

**Numbers:** `zombie.repath` 0.3 s, `repathFailBackoff` 1.0 s, `sight` 8, `contact` 0.7, `searchTime` 10, `noWayTime` 8 (`data/tuning.json`).

**With friends:** It all runs on the host. The dead's layer and rise travel in their records. `hashText` and the `dead` sync part hash `L` and `r` (`game.js:395`, `:501`).

**Limits (quietly wrong, read in `zombie.js`):**
- **Layer-blind reads of the ground** (no layer passed, so they read layer 0): `:270` (`wayIn`'s room of a door's stand), `:294` (`fenceWay`'s `wallBetween`), `:333`, `:784`, `:966`, `:1024` (press validity), `:780`, `:808` (`fenceAhead`), `:820`, `:878`, `:879` (the chase's and the breach's "room I am in"), `:1070` (the siege's out-tile). For a dead one on a storey, "the room I am in" is the room of the ground tile under it.
  - Consequence (inferred): one on an upstairs landing over a ground-floor room thinks it is shut in that ground room. It goes for that room's ground door (`zombie.js:821-823`) instead of the upstairs door it faces.
  - On a bluff it reads the sealed under-hill room (section 6).
- **Battering through the floor (inferred, medium).**
  - `breachTargets` returns `stand` and `into` as bare `[x, y]` pairs, with no layer (`map.js:2150-2160`).
  - `movement.canReach` paths to them on the *zombie's* layer (`movement.js:35`).
  - The breach state measures its distance to the edge in 2D (`zombie.js:886-888`) and then calls `damageOpening` on the door or window object (`:921`).
  - So one of the dead on the ground can walk to the tile under an upstairs door's stand and batter it from below. Bites are layer-checked; door strikes are not.
- **Defending a stair top:** a player on the landing (layer L+1) cannot strike or bite-trade with the dead still on the stair (layer L, rise up to 96). Both sides' reach is layer-gated. The dead are untouchable until they cross the top edge. `moveCircle` does not test bodies, and `separate` works on one layer only (`movement.js:110`), so a crossing body lands on the player's spot and is then pushed apart (inferred).
- **Cost:** each dead one with a cross-layer goal runs one bounded A* per candidate stair every 0.3 s (`movement.js:51-58`). That is cheap with one stair. With a castle of 5 or more stairs on a layer and a crowd hunting, it multiplies (not measured; `docs/49` section 7's cost measurement is step 4, unbuilt).
- **Greedy stair choice:** the stair is scored by straight-line distance from its landing, not by a path on the next layer. It can pick a stair whose landing is walled off from the goal and then fail there (inferred).
- **Coverage:** one headless row (`tools/check.js:5942`): the dead follow a player up the proving ground's stair, and no bite lands through the floor. Nothing tests siege, breach, doors upstairs, ramps, or more than one storey.

**Confidence:** high on seeing, climbing, and biting (read and checked); medium on the two inferred bugs (read, not run).

## 12. Villagers and animals across layers

**Rule:**
- **Villagers:** goals are their home and `pickTargetAround(..., v.layer)`. They are immune to the dead. They are not sent to storeys.
- **Animals:** created at `layer: 0` (`entities/animal.js:142`). Their goals are `[x, y]` with no layer.

**Limits:**
- An animal's threat test is 2D distance plus a ground-layer line of sight (`animal.js:205-222`). A player or a dead one on a storey above still scares deer below (read).
- A led animal paths to its leader's `[x, y]` on layer 0 and measures distance in 2D (`animal.js:410-425`). With the leader upstairs it stands underneath, content, and the lead is never lost (inferred).
- Both call `stairStep` through `followPath` (section 4).
- **Coverage:** none.

**Confidence:** medium-high.

## 13. The building index (what counts as a building; what the hiding rule reads)

**Rule:**
- `buildings()` and `buildingAt(x, y, layer)` (`map.js:41-58`) list **authored buildings only**. They are built by `loadMap` from the map file on host and guest alike (`:3999-4011`; a round tower adds its stepped tiles, `:4048-4050`), and are never saved or sent.
- **Nothing a player builds is ever indexed.**
- The renderer's hiding rule and the storey fade read only this index: "A viewer in no authored building hides nothing" (`render/storeys.js:46-56`, `:69`, `:106`).

**Limits:** `docs/49` section 6's default says a player's building should hide by "the tiles of the room you stand in". **That is not built.** In a player-built castle the upper storeys are never hidden over you and never fade (the renderer's sheet has the drawing; the data gap is here).

**Confidence:** high.

## 14. Shots on a storey (the world's side of arrows)

**Rule:**
- A flight's `layer` is its shooter's (`archery.js:136`). It hits and lands only on bodies of that layer (`bodyAt`, `:396`; landing at `:328`).
- **But the flight's path scan reads the ground's walls and props.** `scanPath`, `edgeStops`, and the trunk test call `map.wallBetween(...)` and `map.tileAt(...)` with no layer (`archery.js:209-213`, `:241`, `:250`), so they read layer 0.
- Shooting down (step 5) is not built.

**Limits (quietly wrong, high confidence):**
- An arrow loosed on layer 1 or 2:
  - is stopped by layer-0 walls below its height, e.g. the curtain wall under the wall walk;
  - is not stopped by the storey's own walls, or by its battlements;
  - can hit only dead on the shooter's own storey;
  - if it lands over the void, it is lost there (section 2).
- None of the checks fire a flight off the ground.

## 15. Eviction with storeys

**Rule:**
- `evictFar` (`map.js:2561`) drops only chunks that are `wild` and not `dirty`. Only the ground grows wild (`getChunk`: a layer that isn't 0 is never wild, `:2629`). So **storey and cellar chunks are never evicted**.
- A guest drops what the host lists in `evicted`.
- The dead sleep with their chunk only on that chunk's layer (`game.js:784-795`).

**Limits:**
- The dead on a storey far from everyone are never put to sleep. They stay simulated (minor cost).
- A wild ground chunk under a built upper floor, with nothing built on the ground there, can still be evicted and regrown. It grows back the same (deterministic), and its dead come back from their record (inferred).

**Confidence:** high.

## 16. Save, wire, and the sync check

**Rule:**
- **Save:** `serializeChunk` (`map.js:2321`) writes, for every loaded chunk on every layer:
  - `layer`;
  - floors (run-length);
  - walls whole, including `round`, `underRound`, `gate`, battlements, cliffs, and ramp sides;
  - props with their layer;
  - items;
  - `parts`, `built`, and `stairs`.
- `save.VERSION` is 4, and older worlds are refused.
- Rings are remade from their walls. Authored stairs and buildings come from the map file.
- Characters' `layer` and `rise` are in their records.
- **Wire:** touched chunks carry their layer, and so do evicted ones. Player, dead, and villager records carry layer and rise. Flights carry `l`. Commands carry `layer`.
- **`syncParts`** (`game.js:475`):
  - `map` hashes every chunk record sorted by layer, which covers walls, gates, battlements, built floors, and built stairs;
  - `rings` covers rings;
  - `players` and `dead` hash `L` and `r`;
  - `animals` do not hash a layer (they are always 0).

**Limits:**
- There is no separate `stairs` part. A built stair is seen only through its foot chunk's record.
- `tools/checks/sync.js` compares the parts generically. Nothing in it drives a storey scenario.
- The row `tools/check.js:7137` proves that a replica on the wrong storey fails the sync check.

**Confidence:** high.

---

## Michael's three-storey castle (Free building, round towers, wall walks with battlements, gates, a stair on each storey, on a cliff-walled bluff with a ramp, a bow from the walk, a friend as guest)

Walked against the code. "Refuses" means the game says no. "Missing" means it is not built. "Quietly wrong" means it runs but does the wrong thing. "Surprise" means it works as coded but not as he would expect.

**The bluff and the ramp**
1. **Surprise: the order is forced.** Floors on a storey must touch a walkable tile there ("Build it out from a floor", `map.js:1076`), and every build is on the builder's own layer (`placement.js:244-250`). So:
   - the **ramp goes first** (its landing is the first plateau tile);
   - then he stands on layer 1 and drags cliff tops out from the landing;
   - then he walks back down the ramp to build the cliff walls on layer 0.
   
   If he builds the cliff ring first and tries to run a ramp up into its face, he gets "A cliff wall is at its head: take it down first" (`map.js:3018`).
2. **Surprise:** the cliff walls and the plateau are unrelated in the world (`cliffs.js` is pictures only). A gap in the cliff ring changes nothing about who can climb; only the ramp (a stair) joins the layers.
3. **Surprise:** the ramp climbs **north or west only** (`map.js:2995`). It brings its own side walls on the ground under its landing, which are never removable (`map.js:3048-3062`).
4. **Surprise:** one cliff is exactly one storey (96 px). With the castle on the bluff, the castle's ground floor is **layer 1**, its storeys are layers 2 and 3, and a wall walk on its top is layer 4. That is still inside the wire's ±8 cap (`net.js:1494`).

**Walls, storeys, and stairs**
5. **Refuses:**
   - a storey's wall needs a floor on at least one side ("No floor there", `placement.js:825`);
   - a door needs a walkable tile on both sides (`map.canBuildWall`, `:1238`);
   - nothing goes across a stair's run or top, or around its stairwell (`stairEdgeProblem`, `:1213`);
   - no door at the top of a stair: the landing is the stair's own, so the door goes one tile back.
6. **Surprise:** each stair needs five tiles in a straight line (foot, three steps, landing). A built stair climbs north or west only. It **never comes up** once built, Free building or not: there is no remove path. Its three-tile stairwell above is a permanent hole with closed sides. The next storey's stair can't sit over the stairwell below, so stairs have to be offset storey by storey.
7. **Refuses upstairs ("Not upstairs yet"):** a torch on a wall, rugs, paintings, set-downs, the campfire, and the palette props, i.e. the fireplace, the fire pit, and the trough (`placement.js:247`, `:795`, `:1356-1397`, `:1613`). Carried furniture (chests, beds) can be set down upstairs (`canPutDown` with the layer, `:664`). So his storeys get no wall torches and no fire.

**Round towers**
8. **Refuses: a round tower with its own stair is impossible.**
   - A ring on the storey above refuses the stairwell under its stepped tiles: "A stairwell is under it: keep the ring off the stair's hole" (`map.js:1689`).
   - If the upper ring is built first, the stair is refused: "A floor is over it" / "A round wall is over it" (`:3012`, `:3022`).
   - A stair can't climb out through the ring wall.
   - The only way into an upper ring room is from outside: a stair elsewhere, a floor bridged to one of the upper ring's four door points, and a door there (inferred).
   - Every stepped tile of an upper ring must be floored first: "A round room upstairs needs a floor under all of it" (`:1689`).
9. **Surprise:** battlements cannot sit on a ring's edges, because the ring wall already holds the edge. On the tower's roof storey they follow the floor's *stepped* outline as straight pieces, not the curve (inferred from `canStampOver` and the drawing rules).

**Wall walks, battlements, and gates**
10. **Refuses:**
    - a battlement on layer 0, on an edge with walk floor on both sides, or on an edge with floor on neither (`battlements.js:38-45`). So a two-tile-wide walk takes battlements on its outer edge only.
    - a gate anywhere but over **plain `wall_stone`** with walkable tiles on both sides (`map.js:1903-1921`). On the bluff, the gate (layer 1) needs cliff-top floor outside it too.
11. **Surprise:** the dead **cannot break the gate**, never target it, and cannot bite or be struck through it (`deadBreak: false`, `bitesPass: false`). Shots pass under 78 px. At a shut gate they see him through the grille (when he is on their layer), cannot path, have nothing to break, and cycle between chasing and searching (`zombie.js:815-860`).

**Defending from the walk with a bow**
12. **Quietly wrong, the biggest issue:**
    - An arrow from the walk flies on the walk's layer and **hits only the dead on that storey** (`archery.js:136`, `:396`). The dead at the gate below are never hit.
    - The flight's wall scan reads the **ground's** walls (`archery.js:209-250`). From the walk it is stopped by layer-0 walls under its arc, possibly the very curtain wall below him. It ignores the battlements and the walls of its own storey.
    - An arrow that comes down over the void is dropped onto the void and lost (`archery.js:369`, `map.js:886`).
    - Shooting down is `docs/49` step 5, not built.
13. **Missing:** the dead below never see him on the walk. Seeing across storeys only happens within a few tiles of a shared stair, one storey apart, and never further (`zombie.js:394-406`; step 4's ray is unbuilt). So nothing he does on the walk draws or alarms them.
14. **What would work today:** shooting through the shut portcullis from his own layer. Shots pass the bars; bites and blows do not.

**If the dead get inside**
15. They climb stairs and the ramp one storey per leg (`movement.js:44-79`). A shut door upstairs exposes the unbuilt step 6:
    - **Quietly wrong (inferred):** one on an upstairs landing reads the ground room under it as its own (`zombie.js:820`, `:878`). If that is a ground-floor room, it goes back down for that room's door.
    - **Quietly wrong (inferred):** one on the ground can batter an upstairs door or shutter from below. Breach stands carry no layer, and the edge distance is measured in 2D (`map.js:2150-2160`, `movement.js:35`, `zombie.js:886-921`).
    - **Surprise:** at the top of a stair, he can't hit them, and they can't bite him, until they cross onto the landing. Both reaches are layer-gated (`combat.js:200`, `zombie.js:329`).
16. **Surprise (performance risk, not measured):** each hunting dead one tries every stair on its layer with a full A* every 0.3 s (`movement.js:51-58`). A castle with many stairs and a crowd inside multiplies that.

**What the hiding rule and the index miss**
17. **Missing:** his castle is in no building index. Only authored buildings are (`map.js:52`, `:3999-4050`). Inside his ground floor the upper storeys are not hidden over him, and the storey fade never runs for it (`render/storeys.js:46-69`). The drawing belongs to another sheet; the gap is in the index.

**The friend joining as a guest**
18. Every build above goes through `performPlacement` on the guest's own layer (`placement.js:1611-1780`). Commands for another layer are dropped (`net.js:715`, `:730`).
    - Built stairs, floors, gates, battlements, cliffs, ramp sides, and rings all ride the chunk records (PROTOCOL 27), and the sync check's `map` and `rings` parts cover them.
    - The guest predicts its own stair crossing with the same `stairStep`.
    - The guest's arrows have the same faults as item 12.
    - The guest sees the same missing hiding as item 17 (it is per client, from the same index).
    - Nothing new breaks for the guest specifically. Two-tab storey tests exist only in the checks' prose; no two-tab check row drives a storey.
19. **Not covered by any check:**
    - the dead on a ramp;
    - the dead at a door upstairs;
    - siege or breach across storeys;
    - an arrow fired off the ground;
    - gates above layer 0, and battlements above layer 1;
    - a stair joining two storeys of a ring;
    - a three-storey climb.
