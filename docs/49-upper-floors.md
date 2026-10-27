# 49 — Upper floors: storeys, stairs, cellars, and seeing and shooting down

**Status, 2026-10-26: a spec, not built.** Written from `origin/main` at ece297c1, from the research in #511, after `51` (the depth buffer) and `52` (walls 96 px tall) were ruled the same night; it builds on both. Michael ruled its frame in session (`02`, 2026-10-26, Upper floors: a spec): a second floor is the goal and third floors and root cellars are designed in; stairs are built by players and placed on the map, three tiles long, climbing one floor, and crossing their top "magically transitions you to the next layer"; players cannot destroy stairs for now; nothing here waits on roofs (#512). A **default** is the spec's own (written by a Secondary), Michael's to overrule, and section 15 lists them; the rest is his ruling. Nine build steps, one issue each, in order, after `51` and `52` have landed; step 9 is the later list.

## 1. Why, in Michael's words

"I assume it would have to work like Zomboid, which means level 2 is its own whole layer, etc. But it's not worth doing if you can't look out a second story window and see zombies on the ground, and in fact I am hoping we can make certain things (bow and arrows at least) work as an attack from up high." "Also consider things like third floors, root cellar basements, etc. But if a second floor is the only thing I get out of it, I would still be happy." "Spec out stairs, much like zomboid, 3ish tiles, goes up one floor, magically transitions you to the next layer of the world when you cross the boundary." And the castle has been waiting for height since its plan was written: "a castle is height, and this engine has none" (`29-world/03`), now to be had by storeys, never by taller walls (`52`).

## 2. Today

- **The data has carried a layer since day one, and only the data.** The chunk key, `getChunk`, `tileAt`, `growTile`, `peekTile`, `dropItem`, `setFloor`, and the chunk records in the save and on the wire take a `layer`, always 0 (`02`, 2026-10-08). Every character and animal carries `layer: 0`, saved and sent, and nothing reads it. Above the chunk store, almost every system calls with the default: movement, the pathfinder, rooms, collision, the dead's sight, breach, and siege, reach, interaction, building, the chart, light sources, the visible set, and the draw. #511 lists them with lines.
- **A tile on any other layer is grass today.** `getChunk` fills a non-zero layer with the default floor: there is no "nothing here".
- **Two leaks wait for the first upper tile:** the light's per-chunk build ignores the layer (an upstairs torch would light the room below through the floor), and the room fill reads layer 0 while it walks every chunk (mixed layers corrupt room ids). Step 0 closes both before anything else.
- **No stairs exist** beyond a placeholder frame nothing picks and a decorative ask (`29-world/09`); the castle plan keeps a `stairs` prop for "when floors come" (`29-world/03`).
- **After `51` and `52`:** the frame sorts per pixel by each vertex's `X + Y + Z`, and a storey is 96 px, three crates.

## 3. The model

- **Layers are whole numbers:** the ground is 0, the floors above it 1, 2, and so on, a cellar −1. **The engine handles any layer from step 0**, and the proving ground carries a test building with a cellar and two upper floors, so every step is tried on four layers. **The valley's content** (section 11) is the ground, one floor above, and root cellars; a third floor comes with the castle.
- **A storey is `STOREY` = 96 px**, one constant, the wall height of `52`: layer L's floor stands 96 L above the ground, a cellar's 96 below it. Every height in the game is measured from the ground: a body, a wall, a sill, a flight.
- **An unauthored tile** above the ground is **void**: no floor, not walkable, nothing drawn, sight and flights pass through it. Below the ground it is **earth**: solid, not walkable, opaque, drawn as nothing (a cellar is a room cut out of it). The ground stays the ground.
- **A floor covers the tile below it** for sight, light, flights, and the draw: under a floor is under a ceiling of planks. A **stairwell** is void over a stair, so the stair can be climbed; a cellar's stairwell is a **hole** in the ground floor, a floor kind (`floor: "hole"`, `walk: false`, drawn as the stair's opening with a rail).
- **A character's place** is `gx`, `gy`, its `layer` (the field it already has), and **`rise`**, the pixels it has climbed up the stair it stands on (0 to 96): drawn, read by sight and flights, sent in its record when not 0 (section 12). Props, walls, items, brackets, doors, and stairs know their layer.
- **One continuous map** (`00`, the first law): a stair is walked; nothing loads, nothing cuts.

## 4. Stairs (ruled: three tiles, one floor, built and placed, not destroyable)

- **A stair is a straight run of three tiles** on its layer, climbing one storey from its low end to its high end, in any of the four grid directions: **each tile rises 32 px, one crate**, so the stair's three steps are the three crates of the storey. The map places them and players build them (section 5); **nobody destroys them for now** (Michael: destroyable stairs are a nice-to-have, step 9), so no floor is ever cut off.
- **Walking it:** a body enters at the low end, from the tile before it, and leaves at the high end, onto the **landing**, the tile beyond the third step on the next layer up. Its `rise` is the distance along the stair times 32 px a tile; **crossing the top edge** (its centre passing the far edge of the third tile) sets `layer + 1` and `rise` 0 on the landing, and the body is drawn and lit and seen as an upstairs body from that step: Michael's "magically transitions you to the next layer". Down is the same backwards: stepping off the landing onto the top step sets `layer − 1` and `rise` 96, falling to 0 at the bottom.
- **Its sides are closed:** a stair is entered and left only at its ends (*default*; a side entry at the bottom step is a later nicety). A body on a stair is on the stair's layer with its `rise`; it collides with bodies on the same stair and with nothing on the ground under the stairwell, which is above it.
- **Above a stair** the next layer is a stairwell: void over all three tiles (*default*, Zomboid's rule: no floor is built over a stair). The landing tile must be a floor, or the stair cannot be placed or built. **Under a stair** (the wedge below its upper steps) is not a space: the three tiles are not walkable on their own layer except by the stair.
- **A cellar's stair** climbs from layer −1 to the ground: its three tiles are cut out of the earth, its landing is a ground tile, and its stairwell is the **hole** in the ground floor over its three tiles, drawn with a rail on its three closed sides (*default*; a hatch that shuts is step 9).
- **The record** (`stairs`): an id, its layer, its low-end tile, its direction, its material (`wood` or `stone`), `built` for a player's; kept with its anchor chunk and named on the chunks it crosses, as a multi-tile prop is (#341); saved and sent. Bodies stand on it; nothing else does: no items, props, or rugs on a stair.
- **The pathfinder** treats a stair as three nodes on its layer, joined at its top to the landing on the next and at its bottom to the tile before it: an edge between layers. Everyone walks it alike: the player, a guest, the dead, a villager led up it (section 9).
- **The removal tool and the dead leave stairs alone**, as ruled.

## 5. Building upward (players)

- **Stairs are buildable** (ruled): a palette entry (`data/build.json`, a `stairs` kind in wood and in stone), its ghost three tiles long on the player's layer in the direction from the player to the cursor (*default*: R already cycles a door's leaf wood in build mode), refused unless its three tiles are free of walls, props, and items and its landing tile above is a floor (or will be: a built floor and a stair go in either order, the second checked against the first). The cost is in data (*default*: 9 planks a wooden stair, 9 stone a stone one: three crates of material).
- **Floors are buildable** (*default*, since a built stair wants a floor at its top): a floor tile on layer L may be built where it is **held up**: it touches, by an edge, a wall on the layer below, or a built floor on its own layer within **two tiles of such a wall** (Zomboid's rule in spirit). Walls, doors, windows, and props are then built on it as on the ground. Built floors are planks (*default*: `floor_wood`, 1 plank a tile).
- **Taking apart:** a built floor tile comes up with the removal tool (its plank back), refused under a wall, a stair, or anything standing on it (*default*), so nothing is left hanging and nothing falls. A built stair does not come up (ruled).
- **The map's own floors and stairs** are authored and stay, as authored walls do.
- **A cellar cannot be dug** by a player (*default*; digging is step 9).

## 6. What you see: drawing, hiding, picking

- **Lifted, sorted by the depth buffer.** Everything on layer L is drawn 96 L px up, and every vertex's depth is its `X + Y + Z` (`51`), so a lifted floor, a tall tree in front of a house, and a figure on a stair sort right per pixel with no new sort rule. The per-layer light, ambient, and fog textures are a set per layer drawn (`render/area.js` builds one each per layer; a vertex says its layer, a free flag bit).
- **An upper floor's ground** is baked per chunk and layer as the ground is (`15`) and drawn as per-tile quads in the main pass at its height (the ground pass stays for layer 0 only). The open edge of a floor (a balcony, a wall-walk, a stairwell) shows its thickness (art, section 11).
- **The hiding rule** (*default*; roofs adopt it, #512): **you see your own layer and every layer below it; a layer above yours is hidden over the building you stand in** (the map's building index for an authored one, the rooms' tiles for a player's) and drawn everywhere else. Outdoors on the ground every storey of every house stands; inside a house its upper floors are gone and the village keeps theirs; upstairs you see your floor, the ground around the house, and everything else; in a cellar the ground floor over its footprint is hidden. The near-wall fade and cut-away run on your layer.
- **Seen but covered:** one of the dead you can see (section 7) whose picture is covered by nearer geometry (your upper storey's wall, a far wall you look out of) is drawn as an outline over it, in Object Highlight's style (*default*), so a dead one you see is never invisible.
- **The camera** centres on the player lifted by its storey and `rise`; the names, bars, bubbles, and numbers over heads, the night pool, and the landing marker lift with their bodies.
- **Picking:** a point on screen can be over a tile on one layer and a tile three tiles on along each axis on the next; the cursor reads **your own layer's floor where there is one under it, else the next floor down** (*default*), so from upstairs the cursor over the yard reads the yard. A click, the menu, Object Highlight, and E act on that layer only.

## 7. Sight across storeys (Michael's bar)

- **On your own layer:** as today, a flat walk over that layer's edges.
- **Down and up, a ray with heights:** from the eye (the layer's floor, plus `rise`, plus 40 px: the figure's head centre is at 38, `rig.js`) to the target (its layer's floor plus its middle), walked edge by edge as an arrow's flight already is (`archery.js` `scanPath` and `wallStops`, which test a height against a wall's top and an opening's sill, top, and door top): a wall on any layer stops the ray where it passes inside that wall's height band, an opening lets it through between its own heights (24 to 64 for a window, 0 to 64 for a door, `52`), a floor stops it where it crosses that floor's height over a floored tile (a hole lets it through), and an opaque prop stops it below its height. **One function** serves the visible set and the dead's sight, symmetric as sight is (`07`): if you can see it, it can see you.
- **Leaning out** (*default*): a player within reach of an open window or a parapet looks from the opening itself (the eye at the sill's height and the wall's line), so the foot of the wall below, where the dead batter the door, is in sight; from a step back a sill hides the few tiles nearest the wall. The big window of `52` is for exactly this.
- **The visible set and the fog** are kept per layer; `seenAlpha` (`sight.js`) reads the light on the target's layer; the chart (`33`) is told nothing of other layers (section 12).
- **Height reaches no farther:** the same sight range and light rule; height only clears walls the flat walk could not see past.
- **Not through a stairwell** (*default*): a stairwell joins layers for bodies, not for eyes; seeing up or down a stair is later.
- **A cellar has no windows:** seen from inside it or not at all.

## 8. Shooting and throwing from height

- **The arc already fits:** a flight's height becomes `z0 (1 − u) + zEnd u + 4 H u (1 − u)`: it leaves at the shooter's floor plus `rise` plus the weapon's `z0`, and comes down at `zEnd`, the floor of the layer the cursor read. A bow on the ground is unchanged (`zEnd` 0).
- **The flight's checks, per layer:** `scanPath` tests at each step the walls of the layer whose height band the flight is in, an opening's sill, top, and door top offset by its storey, a floor where the flight crosses its height over a floored tile, and props by height on their own layer; at the landing, only bodies on the landing's layer are hit, with the clear line tested by heights.
- **Height helps by itself:** from 96 px up the flight clears the ground floor's walls and fences that would stop a shot from the ground. No bonus is added.
- **By weapon:** the bow and the throwing knife, axe, and spear fly the arc. **The fireball** (`flat` by design, so it cannot be lobbed over a wall) flies a straight line from the hand to the point, still unable to arc over anything (*default*). **Melee, the shove, and the dead's bites never cross a storey.**
- **Shooting up** at a higher layer is the same flight; the cursor reads layers at or below yours (section 6), so aiming up waits for picking that reads higher layers (step 9).

## 9. The dead, villagers, and animals

- **The dead see across storeys** by section 7's ray, so an archer at an upstairs window is seen, and sight-pull (`48`) draws the rest by the same sight.
- **They bite and strike only on their own layer:** today one would walk to your spot on the ground floor and bite through the ceiling; step 3 ends that.
- **They climb stairs** (*default*, as Zomboid's do): the pathfinder joins layers at stairs, so one that saw you upstairs walks to the house, breaks the ground floor's door as today (`09`), and comes up; one that saw you in a cellar comes down. **A siege** (#147) knows an upstairs room's way in is its doors and the stairs that reach its floor: `wayIn`, `goalRoom`, and the siege's openings take a layer, and a stair is a way in.
- **A sealed room upstairs is a cell,** by the same law as on the ground: a shut door at the top of the stairs keeps them out, and you leave by your own hand. Stairs cannot be destroyed, so nothing is ever cut off.
- **Nobody climbs through a window** (law): no jumping down from an upper window, and nothing falls; void is not walkable.
- **The dead may be placed upstairs or in a cellar** by the map (a sleeper in an upstairs bed, one in the dark of a cellar).
- **Villagers stay on the ground for now** (*default*; homes upstairs are step 9), but one that is led (`45`'s lead for animals is not theirs; `04`'s follow is not built) is not an issue yet. **Animals stay on the ground** and never take a stair.

## 10. Light

- **Every source carries a layer:** fires, brackets, lanterns, portals, a carried torch, a burning body. **Each layer has its own light map**, and light does not cross a floor (*default*): an upstairs torch lights its room, not the one below; an upstairs window is a portal for its own room; a cellar has no daylight and its stairwell hole admits the ground floor's light as a portal (*default*).
- **An upstairs window lighting the ground outside** is new physics and later (step 9).
- Step 0 closes the light leak (section 2) before any of it.

## 11. The valley, the data, and the art

- **The map generator** (`tools/mapgen`; the map is generated, never typed) gains a building's `floors` (a list, each `{ layer, rect, floor, wall, openings, partitions, props, brackets }`, a negative layer a cellar), `stairs` (each `{ at, dir, layer, material }`, its landing checked), and a cellar's hole placed over its stair by the loader; `map.loadMap` builds a per-layer authored source and a **building index** (each authored building's footprint, kept at load on host and guest alike from the map file every client has), which the hiding rule reads and roofs will.
- **The valley's content** (*defaults*, step 7): the inn's upper floor (three rooms over the common room, a stair by the bar); one two-storey house on the square (a bedroom over the shop); **a watchtower** by the village fields, three by three, its top platform walled by a parapet (a low see-through wall, as a fence is), the bow's place; and **root cellars under existing houses**: Hollow Farm's farmhouse and the inn (*default*: two), each a small room with shelves and a barrel, its stair down from the kitchen, its hole railed. The castle's gatehouse, towers, and wall-walks use all of it when the castle is generated (`29-world/03`), by storeys.
- **The proving ground** (`?map=square`) gains a test building with a cellar, a ground floor, and two floors above, two stairs and a cellar stair, for the checks.
- **Art** (placeholders generated at boot first, as always; the asks in `29-world/09` and `art/`): stairs in wood and stone in the four directions, three steps rising one crate each; the cut edge of an upper floor seen from below; a parapet; a cellar's earth walls; the stairwell's rail and the hole. Upper storeys reuse the wall sheets lifted.

## 12. The save, the wire, the sync check, the chart

- **The save:** props, walls, brackets, and doors gain a layer field; stairs are new records; a siege's `at` and openings, and villagers' and animals' homes, gain a layer; a character's `rise` rides when not 0. `save.VERSION` 4, with no migration (worlds are expendable, Michael, 2026-10-17).
- **The wire:** the touched and evicted chunk lists carry a layer; every guest command that names a tile or an edge (build, place, set down, rug, painting, act) names its layer; the dead's and villagers' slim records carry `layer` and `rise` when not 0; `net.PROTOCOL` is bumped once, in step 1.
- **The sync check:** chunks are ordered by layer, then position; `syncParts` gains nothing else.
- **The chart** (the map on M) shows the ground only (*default*): upper floors and cellars are not charted; a map per layer is step 9.

## 13. The guest's side (every step)

Every storey is the host's world, stepped on the host: a guest's player climbs a stair by its own inputs as it walks today (the host's step moves it, and its `layer` and `rise` reach the guest in its record, which the guest's prediction follows); a guest's build, place, and act commands name their layer; the chunks of every layer reach a guest as touched chunks; the dead's `layer` and `rise` ride their records. **The drawing and the hiding are each client's own:** a guest upstairs and the host downstairs see different cut-aways, each by its own player. Each step tries its features in two tabs (`?nosave&mute&relay=none`) with `check("sync")`, and reads what it adds to a frame from `net.status().wire`.

## 14. Inside the laws

- **One continuous map:** stairs are walked; nothing loads.
- **The clock:** nothing grows with time.
- **Nobody climbs through a window; a window is never a safe spot** (#140): an upstairs window is out of the dead's reach to batter, but the ground floor is not, and they come up the stairs.
- **A sealed room is a cell:** upstairs and in a cellar as on the ground; stairs cannot be destroyed, so nothing is ever cut off.
- **Only trees are seen through:** the hiding rule hides a storey whole over your building; it is not a see-through hole.

## 15. The defaults, for Michael to overrule (each stands if he says nothing)

1. A stair's sides are closed; entry at its ends only.
2. The stairwell is void over all three stair tiles.
3. A cellar's stairwell is a railed hole, with no hatch.
4. Floors are built within two tiles of a wall below, of planks, one a tile; stairs cost three crates of material.
5. A built floor comes up with the removal tool unless something stands on it; a built stair never.
6. The hiding rule: your layer and those below; above yours hidden over your building only.
7. A seen-but-covered dead one is drawn as an outline.
8. The cursor reads your layer where it has a floor, else the next floor down.
9. Leaning out at an open window or a parapet; no sight through a stairwell.
10. The fireball flies a straight line from height.
11. The dead climb stairs; villagers and animals stay on the ground.
12. Light does not cross floors; a cellar's hole is its one portal.
13. The valley's set: the inn's floor, one two-storey house, the watchtower, two root cellars.
14. The chart shows the ground only.

## 16. Build steps

0. **Guards and the void** (headless): close the light build's and the room fill's layer leaks, each with a row in `tools/check.js` that fails if a tile on another layer leaks into layer 0; the void and earth tiles and the hole floor; `STOREY` from `52`.
1. **The map in layers:** every mutator (`placeProp`, `removeProp`, `touch`, `markDirty`, `unsaved`) takes a layer; walls, props, brackets, and doors carry theirs; rooms filled per layer; collision and `canStep` per layer; growth and eviction of every layer; the save (VERSION 4) and the wire (PROTOCOL); the mapgen's `floors`, `stairs`, and holes and the building index; the proving ground's test building. Proven headless (`node tools/world.js` on the square, `savecache`, a row per layer's rooms and collision), drawing nothing new yet.
2. **Drawing the storeys** (after `51`): the lift, upper floors' ground in the main pass, the per-layer light, ambient, and fog, the hiding rule, the camera and the anchors, picking on your layer. A new `check("storeys")` reads the worst cases by pixels: a tree before a two-storey wall, a figure on a stair, a figure at the foot of a far wall, the cut-away upstairs and in the cellar.
3. **Stairs and walking:** the stair record and its drawing, `rise`, the transition at the top edge, the pathfinder across layers, everyone on stairs (the player, a guest, the dead), bites and blows on one layer only.
4. **Looking down:** the ray with heights, the visible set and fog per layer, leaning out, the outline of the seen-but-covered, the dead seeing you (and sight-pull through it).
5. **Shooting down:** the arc to `zEnd`, the flight's per-layer checks, the landing per layer, the bow, the throws, the spear, and the fireball's line.
6. **The hunt across storeys:** breach, siege, and `wayIn` through stairs, up and down; the dead climbing to a sealed room upstairs and stopping at its door; one coming down into a cellar.
7. **The valley's upper floors and cellars:** the inn, the house, the watchtower, the two root cellars (mapgen), the art asks filed.
8. **Building upward:** stairs and floors in the build palette (section 5), taking floors apart, a guest building upstairs.
9. **Later, not now:** destroyable stairs (Michael: a nice-to-have); a cellar hatch that shuts; digging a cellar; a stair entered from its side; villagers living upstairs; an upstairs window lighting the ground; seeing through a stairwell; shooting up; the map on M per layer; ladders and trapdoors (a note is owed); roofs (#512) adopting section 6's hiding rule.
