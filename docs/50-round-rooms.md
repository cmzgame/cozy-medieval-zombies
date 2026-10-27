# 50 — Round rooms and rounded corners

**Status, 2026-10-26: a spec, not built.** Written from `origin/main` at 19ee4707, from the research in #513. Michael ruled its frame in session (`02`, 2026-10-26, Round rooms: a spec): circles, not slanted walls; odd sizes only, 3, 5, and 7 tiles across, the smallest a 3 by 3; doors at the four points where the circle touches its square; built by players and placed on the map, the map first; quarter-circle rounded corners too; the cost scales with the size; nothing waits on roofs (#512). A **default** is the spec's own (written by a Secondary), Michael's to overrule; the rest is his ruling. Six build steps, one issue each, in order; step 7 is a list of later things.

## 1. Why, in Michael's words

"The only real goal here was variety in building look, and obviously circular stone buildings were common in the middle ages: it unlocks real towers, cool castle rooms, small rounded additions, and all kinds of other stuff." He first asked about slanted walls for hexagons and octagons (#513); the research found a hexagon impossible on a square grid and an octagon's left and right slants seen edge-on from this camera, as thin pillar lines, where a cylinder reads naturally all the way round. Then: "what about actual circles? ... Doors stamped in fit on any edge of the circle that touches an outside edge of the grid? ... Straight walls would also have to be programmed to match the circle, extending a bit further than is needed for flat walls on flat walls."

## 2. The geometry

- **A round room is a circle inscribed in an N by N square of tiles,** N 3, 5, or 7 (ruled). Its wall is a ring as tall as every wall (96 px, `52`), drawn on screen as an ellipse, 2 to 1.
- **The four door points** are the middles of the square's sides, where the circle touches it. For an odd N each is the middle of a tile edge: an ordinary n or w edge, so **a door or a window there is today's door or window**. The curve leaves the edge's ends by under a tenth of a tile (0.09 at 3, 0.05 at 5, 0.04 at 7), a few pixels, which the door's frame covers. On screen the four points sit at the ellipse's four diagonals, the angles every door is drawn at today.
- **Inside:** the tiles whose centres are inside the circle: all 9 of a 3 by 3, 21 of a 5 by 5, 37 of a 7 by 7. The parts of the square outside the circle are the **corner pockets**: in a 3 by 3 a sliver of each corner tile (the tile stays in the room; its outer corner is behind the curve), and from 5 by 5 up whole corner tiles outside the room, outdoor tiles the curve's back crosses.
- **The ring's length:** about 9.4 tiles at 3, 15.7 at 5, 22.0 at 7.
- **A rounded corner** is a quarter circle joining two straight walls at a room's corner, with a radius of 1, 2, or 3 tiles (*default*, all three): a whole number, so the arc meets each straight wall at a tile corner. These are quarters of the even circles (2, 4, 6 across), which is no conflict with the rooms' odd sizes: a corner holds no door.

## 3. The model: tile edges for the world's logic, the true curve for bodies and eyes

- **A ring is one record** (`round`: an id, its square's corner and N, its layer, its wall material, `built`, and its four door points' openings), kept with its anchor's chunk and named on the chunks it crosses, as a multi-tile prop is (#341). **A rounded corner** is the same record as a quarter (`corner`: the square's corner it rounds, its radius).
- **Rooms, the pathfinder, reach, the E scan, the dead's breach and siege** keep working on tile edges: the edges between an inside tile and an outside one are **virtual walls**, read by `wallBetween` and the room fill as walls, and the four door points are real n or w edges holding real openings. So opening, shutting, breaking in, boarding, seeing through an open door, and the save and the wire for the doors are today's code.
- **Bodies, sight, light, and flights** test the true curve: the ring is a chain of short segments (one per 15 degrees, *default*) with gaps at its open openings. Body collision is already segment-based (`circleBlocked`); line of sight, the light's rays, and an arrow's flight (`scanPath`, with the wall's height) each test the segments that cross a tile they walk through. A shut opening is a wall as today; an open one is a gap.
- **A straight wall meeting a ring** (Michael's last point): along the square's side through a door point it touches the circle, and needs nothing. Anywhere else a grid wall ends at a tile corner a short way outside the curve; **a filler** (*default*: made automatically when a straight wall's end lies on the ring's square and off the curve) closes the gap from its end to the ring, drawn and in the collision. The rooms are already sealed there by the virtual walls.
- **Upper floors** (`49`): a ring is on one layer; a round tower is a ring on each storey, the floors above being its inside tiles, a stair inside it from 5 by 5 up (a 3 by 3 is too small for a stair and its landing, *default*).

## 4. Drawing

- **Per-tile slices along the arc,** each a billboard at its tile's foot, as two-tile furniture is sliced; the depth buffer (`51`) sorts them per pixel against the dead, props, and trees.
- **The near-wall fade:** when the player is inside, the slices of the ring's near half fade as the near walls of a square room do today (`walls.js`'s rule, keyed to the room).
- **The art is generated, never hand-drawn** (*default*): for each wall material and each size, a cylinder band a wall's height (96 px, `52`) and its cap, three or four flat shades lit from the top left (`art/01`), with the material's texture wrapped round, through the parametric pipeline the walls came from (`art-gen/village`). Placeholders are generated at boot first, from each material's colours, as every new picture is. Rounded corners are quarters of the 2, 4, and 6 bands.
- **The door points** draw today's door and window parts on their edges; a frame at each end of a door covers the few pixels where the curve leaves the edge.
- **Light** is read along each slice's foot, as a wall's is.

## 5. Building (players) and the map

- **The map first** (ruled): `tools/mapgen` gains `round(at, size, wall, openings, floor)` (the openings by side: `n`, `e`, `s`, `w`, each a door, a window, or none) and a building's `corners` (`{ ne: 2 }` and so on), and `map.loadMap` builds the records.
- **The valley's round buildings** (*defaults*, step 5): Hollow Farm's dovecote as a 3 by 3 round room (planned as a prop, `29-world/05`); one rounded addition in the village (a chapel apse, or an inn's bay); the castle's towers round when the castle is generated (`29-world/03` plans them square at 6 by 6: the nearest round size is 7). If `49`'s watchtower is built after this, it is a 5 by 5 ring.
- **Players build them** (ruled) from the build palette: a `round` entry for each wall material; the ghost a circle in its square from the tile where the drag starts, growing to 3, 5, and 7 as the drag goes out (*default*: the size is the largest the drag covers); refused unless the whole square is free of walls, props, and items (*default*); the cost in data, **one unit of the material per tile of the ring's length, rounded up** (*default*: 10, 16, and 22 logs or planks, as one wall edge costs one), so the cost scales with the size (ruled). Doors and windows go only on the four door points, by the ordinary stamp. A rounded corner is a palette entry placed on a room's corner where two straight walls meet.
- **Taking apart:** the removal tool takes a player's whole ring (half its materials back, as any made thing, `43` section 2), its doors first; never an authored one.

## 6. The guest's side, the save, the sync check

A ring is the host's world: built through `placement.performPlacement`, the one path for host and guest, a guest's by a `net.sendPlace` command naming its square, size, and layer; saved and sent as a record in its chunks (touched when built or taken apart); its doors are walls in their chunks as today. `game.syncParts`' map part covers the records. `net.PROTOCOL` is bumped once, in step 1. The drawing is each client's own. Each step is tried in two tabs (`?nosave&mute&relay=none`) with `check("sync")`, and what it adds to a frame read from `net.status().wire`. A new `check("round")` proves each step.

## 7. Build steps

1. **The ring in the world:** the record (round and quarter), the virtual walls for rooms and the pathfinder, the true curve for bodies, sight, light, and flights, the fillers, the save and the wire (PROTOCOL), the mapgen primitive, and a ring of each size and a rounded corner on the proving ground (`?map=square`). Proven headless and in the pane by `check("round")`: a body stops at the curve, a ray is stopped by it and passes an open door, the inside is one room, the dead path in by a door and nowhere else.
2. **Drawing the ring:** slices, the generated placeholder bands and caps, the near-half fade, the light along the foot; `check("round")` reads the sort's worst cases by pixels.
3. **Doors and straight walls:** the four door points taking today's doors and windows with their frames, a straight wall meeting the ring with its filler, the dead breaking in at a door point.
4. **Rounded corners:** the quarter record, its art, and its placing on authored buildings.
5. **The valley's round buildings:** the dovecote, the rounded addition, the castle's towers when it comes; the art asks filed for real bands per material.
6. **Building them:** the palette entries, the drag that grows the size, the cost, the refusals, the removal; a guest building one.
7. **Later, not now:** round fences (a pen, the same ring with see-through walls); windows on the curve; a cone roof and a curved eave (#512); paintings and brackets on a curved face; rings larger than 7.
