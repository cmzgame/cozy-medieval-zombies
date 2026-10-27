# 49 — Upper floors: storeys, stairs, cellars, and seeing and shooting down

**Status, 2026-10-26: a spec, not built.** Written from `origin/main` at 64b84c8b, from the research in #511. Michael ruled its frame in session (`02`, 2026-10-26, Upper floors: a spec): stairs are built by players and placed on the map; they cannot be destroyed for now; third floors and root cellars are considered, and "if a second floor is the only thing I get out of it, I would still be happy"; nothing here waits on roofs (#512). A **default** is the spec's own (written by a Secondary), Michael's to overrule; the rest is his ruling. Nine build steps, one issue each, in order; step 9 is a list of later things, not a step.

## 1. Why, in Michael's words

Michael, 2026-10-26: what adding multilevel would take, Zomboid style, "level 2 is its own whole layer". The bar: "it's not worth doing if you can't look out a second story window and see zombies on the ground, and in fact I am hoping we can make certain things (bow and arrows at least) work as an attack from up high." And: "Also consider things like third floors, root cellar basements, etc. But if a second floor is the only thing I get out of it, I would still be happy." Height is also what the castle has been waiting for: "a castle is height, and this engine has none" (`29-world/03`), with battlements to walk and a keep to climb listed as its upper floors.

## 2. Today

- **The data has carried a layer since day one, and only the data.** The chunk key, `getChunk`, `tileAt`, `growTile`, `peekTile`, `dropItem`, `setFloor`, and the chunk records in the save and on the wire take a `layer`, always 0 (`02`, 2026-10-08, Single storey first). Every character and animal carries `layer: 0`, saved and sent, and nothing reads it. Above the chunk store almost every system calls with the default: movement, the pathfinder, rooms, collision, the dead's sight, breach, and siege, reach, interaction, building, the chart, light sources, the visible set, and the whole draw (#511 lists them with lines).
- **A storey is 80 px.** Every wall sprite is 80 px tall (fences 36); a door's top is at 48, a window's sill at 22 and its top at 51, from the floor. On screen 80 px is 2.5 tiles along each axis, so a storey shifts a drawable's depth by 5 in the tiles' `tx + ty` sum. The 2026-10-09 scoping (`history/05-someday-scopes.md`) said 64; this spec replaces it.
- **A tile on a layer other than 0 is grass today.** `getChunk` fills a non-zero layer with the default floor: there is no "nothing here".
- **Two leaks wait for the first upper tile.** The light's per-chunk build ignores the layer (a torch upstairs would light the room below through the floor), and the room fill reads layer 0 while it walks every chunk (mixed layers would corrupt room ids). Step 0 closes both before anything else.
- **No stairs exist** beyond a placeholder frame nothing picks and a decorative ask (`29-world/09`); the castle plan keeps a `stairs` prop for "when floors come" (`29-world/03`).

## 3. The model

- **Layers are whole numbers:** the ground is 0, the floors above it 1, 2, and so on, a cellar under the ground -1. **The engine handles any layer from step 0** (the proving ground carries a building with a cellar and two upper floors, so every step is tried on four layers); **the valley's content is the ground and one floor above it, plus root cellars** (section 11), and a third floor comes with the castle.
- **A layer's floor stands at 80 px a storey** (`STOREY`, one constant, the wall height): layer L's floor at height 80 L above the ground, a cellar's 80 below it. Every height in the game is measured from the ground: a body, a wall, a window's sill, a flight.
- **What an unauthored tile is.** Above the ground, **void**: no floor, not walkable, nothing drawn, sight and flights pass through it. Below the ground, **earth**: solid, not walkable, opaque, drawn as nothing (a cellar is cut out of it). The ground stays as it is.
- **An upper floor covers the tile below it** for sight, light, flights, and the draw: what is under a floor is under a roof of planks. A **stairwell** is void above a stair, so the stair can be walked.
- **A character's place** is `gx`, `gy`, and its `layer` (the field it already has), and `rise`, the height it has climbed up a stair it stands on (0 to 80 px; drawn, and read by sight and flights; section 4). Props, walls, items, brackets, and doors know their layer.
- **One continuous map.** Stairs are walked, never a cut or a load (`00`, the first law).

## 4. Stairs

- **Ruled (Michael, 2026-10-26):** players build stairs and the map places them; **players cannot destroy them for now**, so no upper floor is ever left without a way up. Destroying stairs is a later nice-to-have (step 9).
- **A stair** is a straight run of two tiles (*default*) on its layer, climbing one storey from its low end to its high end, in any of the four directions. It is entered and left only at its ends: its long sides are closed. Walking up it raises a body's `rise` with the distance along it; stepping off the high end puts the body on the next layer up, on the landing tile beyond the stair, with `rise` 0. Down is the same backwards.
- **Above a stair** the next layer is a stairwell: void over both its tiles. Building a stair under a floor cuts the stairwell; a stair needs its landing tile above to be a floor.
- **A cellar's stair** is the same, climbing from layer -1 to the ground, its stairwell a hole in the ground floor (*default*: an open hole with a rail on its sides; a hatch that shuts is later, step 9).
- **It is a record of its own** (`stairs`: an id, its layer, its two tiles, its direction, its material), kept in its chunk like a multi-tile prop, saved and sent. Bodies stand on it; nothing else does (no items, props, or rugs on a stair).
- **The pathfinder** treats a stair as two tiles on its layer joined at its high end to the landing on the next: an edge between layers. The dead and players walk it alike (section 9).
- **The removal tool and the dead leave stairs alone** (not destroyable, as ruled).

## 5. Building upward (players)

- **Stairs are buildable** (ruled): a palette entry (`data/build.json`, a `stairs` kind), its ghost two tiles long on the player's layer, its direction following the line from the player to the cursor (*default*: R already cycles a door's leaf wood in build mode, `placement.js`), its cost in data (*default*: 6 planks and 2 logs a stair).
- **Floors are buildable** (*default*, since a built stair needs a floor at its top): a floor tile on layer L above the ground may be built where it touches, by an edge, a wall on the layer below or a floor already built on its own layer that is held up, at most **two tiles from a wall below** (*default*, Zomboid's rule in spirit). Walls, doors, and windows are then built on it as on the ground. A cellar is dug, not built: digging is later (step 9).
- **Taking apart:** a built floor tile comes up with the removal tool, refused under a wall or a stair or with anything on it (*default*), so no stair is left hanging and nothing falls.
- **The map's own floors and stairs** are authored and stay (as authored walls do).

## 6. What you see: drawing and hiding

- **Lifted, and sorted with the lift.** Everything on layer L is drawn 80 L px up, and sorts as if 5 L nearer in `tx + ty`. **The draw has no depth buffer** and trees stand up to 198 px tall, so a tall thing on the ground just in front of a house can sort behind the house's upper storey. Step 2 builds the lifted sort and **measures** it on the proving ground's worst cases (a tall tree one tile in front of a two-storey wall, a figure on a stair, a figure at the foot of a far wall); if per-drawable keys with a local correction cannot be made right, it turns on a depth buffer, which the art allows (every sprite is hard alpha, `art/01`), with the translucent things (the faded near walls, the fog) drawn after it. The step decides by the measurement and says which.
- **Upper floors' ground** is baked per chunk as the ground is (`15`) and drawn in the sorted list as per-tile quads, since the ground pass must come before everything else in a frame (`gl.groundQuad`). The underside of a floor's open edge (a balcony, a wall-walk, a stairwell) shows its thickness (art, section 11).
- **The hiding rule** (*default*; roofs adopt it later, #512): you see your own layer and every layer below it; **a layer above yours is hidden over the building you stand in** (its footprint from the map's own building index, or, for a player's building, its rooms' tiles) and drawn everywhere else. So outdoors on the ground every storey of every house stands; inside a house its upper floors are gone and the rest of the village keeps theirs; upstairs you see your floor, the ground around the house, and everything else; in a cellar the ground floor above it is hidden over its footprint. The near-wall fade and cut-away run per layer, on your layer.
- **Seen but covered:** one of the dead you can see (section 7) whose picture is covered by geometry nearer the camera (a wall of your own upper storey, a far wall you look out of) is drawn over it as an outline in the Object Highlight style (*default*), so a dead one you see is never invisible.
- **The light, ambient, and fog textures** gain a set per layer drawn; each vertex says its layer (a flag bit is free).
- **The camera** centres on the player lifted by its storey; the names, bars, bubbles, and numbers over heads, the night pool round the player, and the landing marker are lifted with their bodies.
- **Picking:** a point on screen can be over a tile on one layer and a tile 2.5 tiles on along each axis on the next; the cursor reads **your own layer's floor where there is one under it, else the next floor down** (*default*), so from upstairs the cursor over the yard reads the yard. A click, the menu, Object Highlight, and E act on that layer only.

## 7. Sight across storeys (Michael's bar)

- **On your own layer, as today:** a flat walk over the edges of that layer.
- **Down and up, a ray with heights.** From an eye (its layer's floor, plus `rise`, plus 56 px) to a target point (its layer's floor plus its middle), walked edge by edge as an arrow's flight is (`archery.js`'s `scanPath` and `wallStops`, which already test a height against a wall's top and an opening's sill, top, and door top): a wall on any layer stops the ray where the ray passes inside that wall's height band, an opening lets it through between its own heights, a floor stops it where the ray crosses that floor's height over a floored tile, and an opaque prop stops it below its height. **One function** does it, used by the visible set and by the dead's sight (symmetric: if you can see it, it can see you, `07`).
- **Leaning out** (*default*): a player within reach of an open window or a parapet looks from it: the eye is placed in the opening, so the foot of the wall below, where the dead batter the door, is in sight (by the geometry, a standing eye a step back behind a 22 px sill misses the 1.5 tiles nearest the wall).
- **The visible set and the fog** are kept per layer; `seenAlpha` (`sight.js`) reads the light on the target's layer.
- **Height does not reach farther:** the same sight range and the same light rule; height only clears walls the flat walk could not see past.
- **Not through a stairwell** (*default*): a stairwell joins layers for bodies, not for eyes. Seeing up or down a stair is later.
- **Cellars have no windows;** a cellar is seen from inside it or not at all.

## 8. Shooting and throwing from height

- **The arc already fits.** A flight's height becomes `z0 (1 - u) + zEnd u + 4 H u (1 - u)`: it leaves at the shooter's floor plus `rise` plus the weapon's `z0`, and comes down at `zEnd`, the floor of the layer the cursor read. A bow on the ground is unchanged (`zEnd` 0).
- **The flight's checks, per layer.** `scanPath` tests, at each step, the walls of the layer whose height band the flight is in, an opening's sill, top, and door top offset by its storey, a floor where the flight crosses its height over a floored tile, and props by height on their own layer. At the landing, only bodies on the landing's layer are hit, and the landing's clear line is tested with heights.
- **Height helps by itself:** from 110 px up the flight clears the ground floor's walls and fences that would stop a shot from the ground. No bonus is added.
- **By weapon:** the bow and the throwing knife, axe, and spear fly the arc. **The fireball** (`flat` by design, so it cannot be lobbed over a wall) flies a straight line from the hand to the point, still unable to arc over anything (*default*). **Melee, the shove, and the dead's bites never cross a storey.**
- **Shooting up** at someone on a higher layer is the same flight; the cursor reads only layers at or below yours (section 6), so aiming up waits for picking that reads higher layers (*default*: later, step 9).

## 9. The dead, villagers, and animals

- **The dead see across storeys** by section 7's ray, so an archer at an upstairs window is seen, and sight-pull (`48`) draws the rest by the same sight.
- **They bite and strike only on their own layer:** today one would walk to your place on the ground floor and bite through the ceiling; step 3 ends that.
- **They climb stairs** (*default*, as Zomboid's do): the pathfinder joins layers at stairs, so one that saw you upstairs walks to the house, breaks the ground floor's door as today (`09`), and comes up. **A siege** (#147) knows an upstairs room's way in is its doors and the stairs that reach its floor; `wayIn`, `goalRoom`, and the siege's openings take a layer.
- **A sealed room upstairs is a cell,** by the same law as on the ground: a shut door at the top of the stairs keeps them out, and you leave by your own hand. Stairs cannot be destroyed, so no floor is ever cut off.
- **Nobody climbs through a window** (law): there is no jumping down from an upper window, and nothing falls; void is not walkable.
- **The dead may be placed upstairs** by the map (a sleeper in an upstairs bed is a good fright).
- **Villagers stay on the ground for now** (*default*; homes upstairs, an innkeeper's guests, are later). **Animals stay on the ground.**

## 10. Light

- **Every source carries a layer:** fires, brackets, lanterns, portals, a carried torch, a burning body. **Each layer has its own light map**, and light does not cross a floor (*default*): an upstairs torch lights its room, not the one below; an upstairs window is a portal for its own room only. Daylight and the room's ambient are per layer by rooms, as today. A cellar has no daylight.
- **An upstairs window lighting the ground outside** is new physics and later (step 9).
- Step 0 closes the leak (section 2) before any of it.

## 11. The valley, the data, and the art

- **The map generator** (`tools/mapgen`, the map is generated, never typed) gains a building's `floors` (a list, each `{ layer, rect, floor, wall, openings, partitions, props, brackets }`) and `stairs` (each `{ at, dir, layer, material }`); `map.loadMap` builds a per-layer authored source and a **building index** (each authored building's footprint, kept at load on host and guest alike from the map file, which every client has), which the hiding rule reads and roofs will (#512).
- **The valley's content** (*defaults*, step 7): the inn's upper floor (rooms over the common room); one two-storey house on the square; **a watchtower** by the village fields, three by three with a top platform walled by a parapet (a low see-through wall, as a fence), the bow's place; a **root cellar** under Hollow Farm's farmhouse. The castle's gatehouse, towers, and wall-walks use all of it when the castle is generated (`29-world/03`).
- **The proving ground** (`?map=square`) gains a test building with a cellar, a ground floor, and two floors above, for the checks.
- **Art** (placeholders generated at boot first, as always; the asks in `29-world/09` and `art/`): stairs in wood and stone in both directions, drawn rising one storey; the cut edge of an upper floor seen from below; a parapet; a cellar's earth walls; the stairwell's rail. Upper storeys reuse the wall sheets lifted.

## 12. The save, the wire, the sync check, the chart

- **The save:** props, walls, brackets, and doors gain a layer field; stairs are new records; a siege's `at` and openings, and villagers' and animals' homes, gain a layer. `save.VERSION` 4, with no migration (worlds are expendable, Michael, 2026-10-17).
- **The wire:** the touched and evicted chunk lists carry a layer; every guest command that names a tile or an edge (build, place, set down, rug, painting, act) names its layer; the dead's and villagers' slim records carry `layer` and `rise` when not 0; `net.PROTOCOL` is bumped once, in step 1.
- **The sync check:** chunks are ordered by layer, then position; the parts are unchanged otherwise.
- **The chart** (the map on M) shows the ground only (*default*): upper floors and cellars are not charted. A per-layer map is later.

## 13. The guest's side (every step)

Every storey is the host's world, stepped on the host: a guest's player climbs a stair by its own inputs as it walks today (the host's step moves it and its `layer` reaches the guest in its record); a guest's build, place, and act commands name their layer; the chunks of every layer reach a guest as touched chunks; the dead's `layer` and `rise` ride their records. **The drawing and the hiding are each client's own:** a guest upstairs and the host downstairs see different cut-aways, each by its own player. Each step tries its features in two tabs (`?nosave&mute&relay=none`) with `check("sync")`, and reads what it adds to a frame from `net.status().wire`.

## 14. Inside the laws

- **One continuous map:** stairs are walked; nothing loads.
- **The clock:** nothing grows with time.
- **Nobody climbs through a window; a window is never a safe spot** (#140): an upstairs window is out of the dead's reach to batter, but the house's ground floor is not, and they come up the stairs.
- **A sealed room is a cell:** upstairs as on the ground; stairs cannot be destroyed, so nothing is ever cut off.
- **Only trees are seen through:** the hiding rule hides a storey whole; it is not a see-through hole.

## 15. Build steps

0. **Guards and the void** (headless): close the light build's and the room fill's layer leaks, each with a row in `tools/check.js` that fails if a tile on another layer leaks into layer 0; the void and earth tiles; `STOREY`.
1. **The map in layers:** every mutator (`placeProp`, `removeProp`, `touch`, `markDirty`, `unsaved`) takes a layer; walls, props, brackets, and doors carry theirs; rooms filled per layer; collision and `canStep` per layer; growth and eviction of every layer; the save (VERSION 4) and the wire (PROTOCOL); the mapgen's `floors` and `stairs` and the building index; the proving ground's test building. Proven headless (`node tools/world.js` on the square, `savecache`, a row per layer's rooms and collision), drawing nothing new yet.
2. **Drawing the storeys:** the lift and the lifted sort (measured, the depth buffer decided by the measurement), upper floors' ground, the hiding rule, the per-layer light, ambient, and fog, the camera and the anchors, picking on your layer. A new `check("storeys")` reads the worst cases by pixels.
3. **Stairs and walking:** the stair record and its drawing, `rise`, the layer change, the pathfinder across layers, everyone on stairs (the player, a guest, the dead), bites and blows on one layer only.
4. **Looking down:** the ray with heights, the visible set and fog per layer, leaning out, the outline of the seen-but-covered, the dead seeing you (and sight-pull through it).
5. **Shooting down:** the arc to `zEnd`, the flight's per-layer checks, the landing per layer, the bow, the throws, the spear, and the fireball's line.
6. **The hunt across storeys:** breach, siege, and `wayIn` through stairs; the dead climbing to a sealed room upstairs and stopping at its door.
7. **The valley's upper floors and cellar:** the inn, the house, the watchtower, Hollow Farm's root cellar (mapgen), the art asks filed.
8. **Building upward:** stairs and floors in the build palette (section 5), taking floors apart, a guest building upstairs.
9. **Later, not now:** destroyable stairs (Michael: a nice to have); a cellar hatch that shuts; digging a cellar; villagers living upstairs; an upstairs window lighting the ground; seeing through a stairwell; shooting up; the map on M per layer; ladders; roofs (#512) adopting section 6's hiding rule.
