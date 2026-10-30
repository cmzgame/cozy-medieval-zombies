# Sheet B: how the renderer draws elevation, and what hides, fades, or is seen through

Read from the worktree at e3c771ed (latest main). Code first, docs second. Line numbers are `file:line` in that tree. "Inferred" marks something I worked out from the code but did not see run.

---

## 0. The frame in one paragraph

`render/scene.js renderScene` (212-392): build the ground's light/ambient/fog (`buildArea`, 222), `gl.begin` with the depth centre at the camera (224), pick the layers (226-239), build one more area set for one storey (242-244), draw the ground's flat things once (245-251), then for each layer, lowest first, lifted by `L * STOREY` (265): its floor quads, its rugs, its standing drawables (walls, rings, posts, props, floor items, stairs, bodies, flights), and, apart from those, the tiles of a faded storey under `gl.setFade` (342-352). Ghost, hit shapes, and marker go last in `PASS_TOP` (361-364). `gl.end` draws five passes: flat, opaque, translucent, fade, top (`gl.js` 1305-1336).

---

## 1. The storey loop

**Rule.**
- Which layers: `layersFor(VL)` (`storeys.js:38-43`). In a cellar (VL < 0), only that cellar. Otherwise layer 0 plus every layer > 0 that has a loaded chunk anywhere in memory, sorted ascending. Then `scene.js:233-239` drops a layer > 0 that has no tile of its own in view, unless it is the viewer's layer.
- **The layer above the viewer is drawn** everywhere, except where the hiding rule removes it (section 2). There is no cap on how many: layers 0..N all draw, lowest first.
- **The layer below is drawn under a floor.** Nothing below the viewer is hidden (`scene.js:268`: layer 0 takes all tiles; an upper layer loses only `hidden` tiles, and `hidden` only touches layers above VL, `storeys.js:51`). An upper floor is drawn opaque with depth written (`emitFloors`, `scene.js:279`), so it covers what lies under it per pixel. The void is clear in the floor's picture (`storeys.js:447`), so you see down through a stairwell or past a floor's edge.
- **Standing on layer 2 or 3 over layer 0**: layers 0, 1, 2, 3, ... all draw. Layer 0's ground is a flat-pass quad per chunk. Each upper layer's tiles are the ground's view tiles shifted `+3L` on both axes (`tilesOf`, `storeys.js:132-136`; 96 px of lift is three tiles of screen rows), filtered to chunks that layer holds (`storeyTileOn`, `scene.js:206-210`).
- Lift: `withLift` (`storeys.js:17-29`) raises the screen origin by `px` and adds `px` to every standing vertex's depth (`gl.setLift`, `gl.js:749-754`, applied in `fan` at `gl.js:891`). A body on a stair gets a further `withLift(rise)` (`scene.js:302-312`).
- The flat things (rugs, tile mark, tracks) are drawn for the ground once (`scene.js:245-251`); upper rugs are drawn after their floor (283). Arrows' shadows, splashes, and lying arrows on an upper layer still ask for `PASS_FLAT` (`entities.js:53, 98`; `props.js:383`); see Limits.
- `fireDrawables` runs only in the L === 0 pass (`scene.js:315`).

**Numbers.** `STOREY` 96 (`map.js:67`); `CHUNK` 16 (`map.js:21`); the shift k = `L*96/32` = 3L tiles (`storeys.js:134`).

**Code.** `scene.js:226-354`, `storeys.js:17-43, 132-136`.

**Limits.**
- `layersFor` walks every loaded chunk each frame (O(chunks)). Then for each upper layer, `tilesOf` maps the whole view tile list to new arrays and filters it (O(view tiles) per layer per frame, with allocation), then gathers walls, rings, posts, props, items, stairs over that layer's tiles, and runs `entities.filter` once per layer (O(entities × layers)).
- **Burning bodies' flames, smoke, embers, and splinters are drawn only in the ground pass, unlifted, with no layer filter** (`scene.js:315`; `entities.js:143-168`). A body burning on layer 2 has its fire drawn at the ground point under it (inferred: 192 px below its body on screen, and usually hidden under the storey's floor).
- **Flat things on an upper layer are hidden under their own floor.** An arrow's shadow, a splash, and a lying arrow or thrown knife or axe go to `PASS_FLAT` (no depth). The flat pass draws before the opaque pass, so the upper floor, which is opaque and writes depth, paints over them. Over the void they are drawn lifted, in the air (inferred).
- No check reads more than two storeys, or a storey a player built (section 14).

**Confidence.** High (read).

---

## 2. The hiding rule

**Rule.** `hiderFor(viewer)` (`storeys.js:47-58`): find `map.buildingAt(viewer tile, VL)`. If there is one, every tile of each layer above VL that falls inside that building's rect for that layer, plus the row and column past its south and east sides, is hidden. Nothing else is hidden. A body on a hidden tile is not drawn (`scene.js:300`), and neither are its bars or name (`shownTo`, `storeys.js:122-128`).

**What "building" means: the authored building index alone.** `map.buildings()` and `buildingAt` (`map.js:41-58`) read `buildingList`, which only `loadMap` fills (`map.js:3999-4011`, and authored rings at 4048-4050). Nothing at build time adds to it. So:
- an authored house or tower in the map file hides its upper storeys while you stand in it;
- **anything Free building makes (walls, floors, rings, stairs, a whole castle) never hides anything.** `storeys.js:69-70` says so ("a storey a player builds outside the index is left as it is"). `docs/49` section 6 describes a rule for a player's building ("the tiles of the room you stand in"). It is not in the code.
- A round building holds only its stepped tiles (`map.js:55`).

**Numbers.** None beyond the rect test (`storeys.js:54`).

**Limits.**
- The rule runs per viewer: each client applies it to its own player.
- `hide` is called per tile per layer per frame. It costs O(buildings) for the one `buildingAt` lookup, then O(1) a tile.
- `check("storeys")` row 99 proves it only on the authored tower or tall house.

**Confidence.** High.

---

## 3. The storey fade

**Rule.** `faderFor(viewer)` (`storeys.js:100-118`) loops over **every indexed building** except the one the viewer is in, and over each of that building's layers L where L > VL and L > 0. `storeyCovers(viewer, rect, L)` (`storeys.js:76-97`) casts 12 points over the body toward the camera: 3 columns at -8, 0, +8 px, times 4 heights (4, 18, 32, 46 px over the feet). It asks whether any ray passes through that storey's box in front of the body. The box is the footprint grown 0.15 tile, from floor `L*96` up to `(L+1)*96 + 12`.

When a storey is hit, all of its tiles (footprint plus the south and east row) are drawn apart, under `gl.setFade(0.42)` (`scene.js:342-352`). That covers its floor (`emitFadedFloors`), rugs, walls, posts, caps, props, items, stairs, and the bodies and flights on it. Quads that would be opaque go to `PASS_FADE`. In `gl.end` that pass is drawn twice (`gl.js:1322-1331`): first depth only (alpha test 0.5), then colour at 0.42 where its own nearest surface is. The result reads as one sheet. Quads of that storey that are already translucent go to the translucent pass at their alpha × 0.42 (`gl.js:949`).

- **Two storeys stacked between camera and player:** both are hits. Both go into the one fade pass with one alpha, and the depth-first draw keeps only the nearest surface's colour. They read as a single 0.42 sheet, not 0.42². The ground storey of the same building is never faded (L > VL only), so its walls still hide a body as any house's do.
- **A storey beside a cliff:** a cliff's plateau (a cliff top is a floor on layer L+1) is not a building and never fades. Only indexed buildings do.

**Numbers.** `NEAR_WALL_ALPHA` 0.42 (`scene.js:46`). In `storeys.js`: `FADE_HALF` 8 (71), `FADE_ROWS` [4, 18, 32, 46] (72), `FADE_EDGE` 0.15 (73), `FADE_OVER` 12 (74), `FADE_FRONT` 0.6 (75). The switch is `storeyFade.on` (`scene.js:74`).

**Limits.**
- **Index only: a Free-built storey never fades.**
- Per viewer (`faderFor(player)`, `scene.js:259`).
- O(buildings × layers × 12 ray tests) per frame.
- **The fade pass draws after the translucent pass.** Anything translucent in front of a faded storey writes no depth, so the fade's colour pass paints over it. That includes a dimmed dead one, a faded near wall, a canopy with its hole, and a glow. Inferred.
- A faded storey's floor bake is cached per signature (`fadedBakes`).
- `check("storeys")` rows 257-320 prove it behind the authored tower house at layer 1, on the ground, by day and night. They do not cover a viewer on layer 1 or higher behind a layer-2+ storey.

**Confidence.** High.

---

## 4. The near-wall fade (and the stair's)

**Rule.** `isNearWall(tx, ty, edge, playerRoom)` (`walls.js:387-393`). A wall fades when the tile behind it (north of a north edge, west of a west edge) is the viewer's room and its own tile is not. It also fades when the viewer stands on a stair (`rise > 0`), the tile behind the wall is one of that stair's tiles, and its own tile is not (on the stair's layer and on the stairwell layer above, `walls.js:377-383`).

It is **keyed to the viewer's room on the viewer's own layer**. `scene.js:285` sets `roomHere = map.roomAt(player tile, VL)` for L === VL and 0 for every other layer, so walls on any other layer never fade. The player's room is a flood fill on its layer (`map.js fillRegion` 3469-3530). A region bigger than `ROOM_MAX` 300 tiles (`map.js:28`), or one that reaches an ungrown chunk, is outdoors (room 0) and fades nothing. A see-through wall (fence, bars, battlement) bounds no room. Upstairs the void is entered like floor (`map.js:3466-3468`), so an open wall walk is outdoors.

How it is drawn: translucent at 0.42 (`walls.js:1147-1148`). It is cut at the joints so overlaps are not doubled (`wallCuts`, `walls.js:818-833`; `emitCutWall` 840-906). A post fades only when every wall it joins is near (`walls.js:489-494`). A faded wall draws no cap (`walls.js:351`). Leaves on the far side are drawn only while faded (`walls.js:339`). A cliff is a wall here too: it fades if it is a near wall of the viewer's room, keeping its cut along the plateau line (`walls.js:850-851`).

**Numbers.** 0.42 (`scene.js:46`); `ROOM_MAX` 300.

**Limits.**
- Per viewer.
- Only the viewer's layer: the storey above a room you stand in never fades unless the hiding rule hides it (index only).
- O(wall edges in view): each does two `tileAt` calls plus a `postAt` for the cuts.
- `check("storeys")` row 404 covers the stair walls; `check("depth")` row 8 covers ground walls.

**Confidence.** High.

---

## 5. Tree canopy holes

**Rule.** `computeOcclusion` (`scene.js:144-165`) runs only on the viewer's own layer's drawables (`scene.js:337-340`). For each living body, every later prop with `canOcclude` set (a sprite with a `canopy`, at least `OCCLUDER_MIN_HEIGHT` 64 px tall, `props.js:285`) whose screen rect overlaps the body's (less 14 px) is tested. Only for **the client's own player**, an overlapping canopy gets `occluder` and the player gets a hole: `FLAG_OCCLUDER` on the canopy's quads, so they go to the translucent pass (`gl.js:821`). The shader fades alpha by `smoothstep(34, 78, distance)` from each hole centre (`gl.js:376-381`). Every body behind a canopy goes into `client.behind`, for the UI.

**Numbers.** `HOLE_INNER` 34, `HOLE_OUTER` 78 (`scene.js:84-85`); at most 8 holes (`gl.js:321`, `1282-1287`); hole centre at the rect's middle and 45% of its height (`scene.js:339`).

**Limits.**
- Your own player only. The dead and other players are never shown through a canopy (Michael 2026-10-11, `02`: "Only trees are seen through").
- O(entities × later drawables) on VL.
- **A tree on layer 0 never opens a hole for a viewer on layer 1 or higher**, because the occlusion pass reads only VL's drawables. By the projection, a ground tree one or two tiles off the south foot of a bluff can cover a body standing on layer 1 near that edge. Inferred.
- Holes are screen positions and cut any occluder quad that carries the flag.

**Confidence.** High on the rule; medium on the layer-1 tree case.

---

## 6. Round rooms: the halves and their fade

**Rule.** `ringDrawables` (`rings.js:44-74`) makes two drawables per ring on the layer: the far half (inner face) and the near half (outer face). Each segment is its own plane (`depth.planeThrough`, `rings.js:166`). `inside` holds when `playerRoom > 0` and it equals the ring's room on its layer (`rings.js:69-70`). Because `playerRoom` is `roomHere`, only a ring on the viewer's layer can fade. When inside, the near half's segments whose columns fall within the inner face's silhouette (`fades`, `rings.js:141-143`) are drawn as the inner face at 0.42. The flanks stay opaque. The cut ends are closed by the wall's thickness (`rings.js:226-252`), and a stone base is drawn under the cut (`emitBase`). The cap is drawn on every segment, faded with its face (`rings.js:211-214`). The skirt and base are flat-pass on the ground; on a storey they sit on the lifted floor's plane (`rings.js:282-302`, 331+).

**Numbers.** 0.42; `FACE_COLS` [4, 28] (`rings.js:25`); `SKIRT_MIN` 0.08, `SKIRT_TUCK` 0.04 (265-266).

**Limits.**
- **Rings have no storey-seam logic.** There is no `covered` and no `onWall`, unlike straight walls (`walls.js:623-660`) and posts. A ring stacked on a ring (a tower of several storeys) draws its full cap at every storey. The lower cap sits on the same segment plane at the height where the upper face begins, one emit step nearer (layer 1 against layer 0). Inferred: a light cap band shows across the tower at each storey seam, the "notched ledge" that #551 fixed for straight walls.
- Free-built rings are not in the building index (section 2), so a tower's upper storeys never hide and never fade.
- `check("round")` covers one authored 7×7 ring on the ground of the proving ground.

**Confidence.** High on the rule; medium-high on the seam band (read; not seen).

---

## 7. Cliffs

**Rule.** A cliff is a wall whose definition says `wall.cliff`, drawn through `makeWall` (`walls.js:1131-1225`) with `cliffArt` (692-704):
- a face variant by hash, or `back` when its own tile is plateau, drawn on its far face's plane (1169);
- a face with plateau across is cut along the edge line at the top, with no cap (`clip`, 348; 698-702);
- corner pieces replace the post and both edges (`makeCliffCorner`, 714-788);
- a buried edge (plateau on both sides) draws nothing (685-690).

**Fading:** a cliff takes the same `isNearWall` as any wall (`walls.js:1096-1104`). It fades only if it bounds the viewer's own room, for instance in a pit walled by cliffs. From outside it never fades.

**No outline of the player behind a cliff exists.** The "seen but covered" outline is `docs/49` step 4, not built, and nothing in `render/entities.js` draws one: there are only the swing outline (`entities.js:278-284`) and Object Highlight (286). A body behind a cliff or its plateau is simply covered.

**Numbers.** `wall_cliff` height 96, thickness 16 (`data/sprites/wall_cliff.json`); `LIP_UP` 6, `LIP_DOWN` 6, `SIDE_SLACK` 2 (`walls.js:711-713`).

**Limits.**
- The plateau is ordinary layer L+1 floor: written depth, and no fade.
- The cliff ring on layer 0 encloses ground under the plateau, which floods as a room of its own when it has 300 tiles or fewer. Harmless to the picture; it is lit as a dark room.
- `check("cliffs")` proves that every non-buried cliff edge draws on every storey, the corner's pixels, and the ramp. It reads no fade and no occlusion.

**Confidence.** High. (Note: the brief's "never fades, the player outlined" does not match the code. Cliffs fade as near walls of your own room, and no outline is drawn.)

---

## 8. Battlements

**Rule.** `makeBattlement` (`walls.js:1028-1058`):
- the side comes from the floors of its own layer: `far` when the edge's own tile is floored, `near` when the tile across is (`battlements.sideOf`);
- the depth plane is the edge line for far, and for near the plane 16 units (half a tile) beyond it: `wallSurface(edge, tx, ty, 32)` takes the thickness 32 and halves it (`walls.js:1042`; `depth.js:130-133`);
- no cap, no post (`vertexAt`, 454-457), and the vertices are their own pieces (`makeBattlementVertex`, 1062-1086).

**The near side's fade:** `battlementFades` (`walls.js:1021-1027`). It requires the viewer's layer to be the drawn layer (`setViewerAt`, `scene.js:286`), the side to be `near`, and the viewer to stand on the walkway tile directly behind that edge or one of the two tiles beside it along the run. Then it draws at 0.42 (`walls.js:1038`), with no cuts (`stub && !bat`, 1097). A far battlement never fades.

**Numbers.** `wall.height` 28, thickness 0, `seeThrough` true (`data/sprites/wall_battlement.json`); the near frame is 47×84 and the far 47×68 (`check("battlements")` row 112); fade reach ±1 tile along the run, 0 deep.

**Limits.**
- Keyed to the viewer's tile, not a room. A 2-wide walk with the viewer on the inner row: no fade.
- Each client fades by its own player.
- The vertex pieces never fade (`makeBattlementVertex` has no alpha). Inferred: a faded run keeps its opaque corner block.
- `check("battlements")` row 214 reads the drawables' `faded` flags, not pixels, and nothing about bodies below.

**Confidence.** High.

---

## 9. The castle gate's grille

**Rule.** A gate edge draws its 49×121 window of the gate's frame (`gateSlice`, `walls.js:238-251`). The frame is the same shut or open, with the arch transparent. The portcullis is drawn after the wall and its cap, on its own plane 6 units toward the camera from the edge line (`depth.wallFace(edge, tx, ty, 12)`, `walls.js:300`), in the columns that edge owns (`emitGateLeaf`, 273-303). The frame is chosen by state (closed, mid during `swing` seconds of sim time, raised), and the swing is per client (`gateLeafState`, 256-269).

Seeing through it is the art's transparent gaps, discarded by the opaque pass's alpha test at 0.5. Sight and light passing is the map's flag (`grille`, `map.js:1819-1821`). The renderer's `visible` set comes from `blocksSight`. A gate edge is a door-kind wall, so it fades as a near wall and its leaf fades with it (`o.tint`).

**Numbers.** Crown 78, springing 38, opening u 8 to 56; leaf plane 6 (`data/sprites/wall_stone_gate_2.json`); swing 1.2 s (`02`).

**Limits.** Only what the artist left transparent shows through. `check("gates")` covers sight, light, and rooms by the map, not pixels through the bars.

**Confidence.** High.

---

## 10. Light, ambient, and fog per storey

**Rule.**
- **Two sets of area textures**, no more (`area.js:218-219`). Set 0 is the ground's. Set 1 is `upperL`: the viewer's layer when it is not 0, else the lowest storey > 0 with a tile of its own in view (`scene.js:242-244`).
- Flags: layer 0 takes none, `upperL` takes `FLAG_UPPER`, **every other storey takes `FLAG_SKY`** (`scene.js:264`). In the shader (`gl.js:362-363`) `FLAG_SKY` means ambient = the outdoor ambient and point light = 0. "A storey besides those lit as the open air" (`scene.js:241`).
- Each set reads its own layer's chunk light (`light.chunkLight(cx, cy, layer)`), rooms (`ambientAt(x, y, layer)`), and carried flames filtered to that layer (`area.js:107`). Light does not cross a floor (`light.lightAt`, 480).
- **Fog: both sets use the one `visible` set**, computed from the viewer's tile on the viewer's layer over the ground's view tiles (`main.js:1343`; `visibility.computeVisible`, which casts a 2D ray on one layer). Set 0's fog marks ground tile (x, y) by that set (`area.js:200-207`). Set 1 marks its shifted tiles by the same keys. A `FLAG_SKY` storey reads set 0's fog at its own (x, y) (`gl.js:383`).

Answers to the brief's questions:
- **A torch on storey 2** lights storey 2's own light map. You see that pool only when set 1 is storey 2, which means the viewer stands on storey 2. From the ground or from storey 1, storey 2 is `FLAG_SKY`: no pool on its walls or floor. Its flame and a lantern's pane are `FLAG_UNLIT` and still glow (`walls.js:1240, 1249`); the soft halo sheets still draw.
- **The fog a player on storey 1 sees:** storey 1 is fogged by storey 1's 2D line of sight. The ground below is fogged by that same storey-1 line of sight at each (x, y), so walls on layer 0 do not block it. Storeys 2 and up read that too.
- **A player on 0 looking at a lit window on 2:** storey 2 is `FLAG_SKY` (set 1 is storey 1 when storey 1 is in view). Its room light and its window's portal glow are not shown; only the flame sprites are. An upstairs window lighting the ground outside is `docs/49` step 9, not built.

**Numbers.** `FOG_ALPHA` 0.36, `FOG_COLOR` (22, 14, 32) (`scene.js:42-43`); `night.climb` 84 (36); `CORE_GAIN` 1.4 (`area.js:14`); the area is `2*ceil(r/16)+1` chunks a side (`area.js:221-228`), about 7 chunks (112 tiles) at 1920×1080 and zoom 1.1.

**Limits.**
- Storeys other than the ground and `upperL` get no torch, lantern, or room light at all.
- The ambient is recomposed over areaTiles² tiles for each set on every `worldVersion` change (`area.js:165-185`).
- **The visible set is 2D on the viewer's layer.** From storey 2 every ground tile not behind a storey-2 wall counts as seen (an x-ray of the ground). From the ground, everything over a ground tile you cannot see is fogged and its bodies are not drawn (section 11).
- No check reads light or fog on a storey.

**Confidence.** High.

---

## 11. Bodies on stairs and storeys, and who is drawn at all

**Rule.**
- A body is drawn on its own layer's pass (`scene.js:300`), lifted by its rise (302-312), as a billboard through `(gx + 0.3, gy + 0.3)` with bias 2 (`entities.js` and `depth.figure`).
- **It is drawn only if `visible.has(tileKey(round gx, round gy))`** (`entities.js:203-204`), the viewer's own 2D sight on the viewer's layer, keyed by (x, y) with no layer. The exception is your own player. The same test gates arrows (38), splashes, fire particles (148), and the dead's dark fade (`seenAlpha` uses 2D distance and `lightAt` on layer 0 by default, `sight.js:19-29`).
- A body on a tile the hiding rule hides is not drawn.

**Limits.**
- **A body on an upper storey is drawn for a viewer on another layer only if the ground (x, y) under it is in that viewer's own-layer sight.**
- The dead seen from height are not limited by lower walls.
- O(entities) per layer.

**Confidence.** High.

---

## 12. The depth buffer across layers

**Rule.** Depth is `X + Y + Z` (a tile 32 units, a pixel of height 1), computed per vertex on the CPU from the drawable's surface: `A*sx + B*sy + C`, or a ridge (`gl.js` `surface`, `fan`). The lift adds `L*96 + rise` (`gl.js:891`), so a thing on layer 1 and a thing on layer 0 in the same pixel column compare by true depth:
- **a lifted thing at grid (x, y) shares screen pixels with ground things around (x - 3L, y - 3L)**, which are 288L units farther. So the storey covers what is behind and below it, and anything south-east of the storey's footprint on the ground stays in front.
- An upper floor is a horizontal plane (`B = 2`, `storeys.js:518`) with bias `liftedFloor` 1, so it lies a unit over the caps of the walls below (`scene.js:57`).
- The range is ±4096 units round the camera (`gl.js:50`); the centre moves in steps of 256 (`gl.js:51, 673`).
- The emit-order step is two buffer steps or 1/32 unit, whichever is larger (`gl.js:503`).
- The alpha test in the opaque pass is 0.5 (`gl.js:52`); the other passes discard under 0.004 (53).
- Biases (`scene.js:57`): floorItem 0.5, post -0.5, prop 1, figure 2, particle 1, liftedFloor 1. Rooms (64): post 0.5, wall 1, floorItem 0.5, prop 1, figure 1.

**Limits.**
- Flat things have no depth, so on a storey they lose to their own floor (section 1).
- Planar depth: a near battlement's merlon tops are approximate (`walls.js:1013-1014`).
- The camera's lift (`camera.js:43`) keeps everything well inside ±4096 up to many storeys.

**Confidence.** High.

---

## 13. Caps and seams between storeys

**Rule.** `stackOf` and `postStack` (`walls.js:630-660`):
- A wall with a wall on the same edge one layer up is `covered`: it draws no cap.
- A wall standing on a wall below is `onWall`: its face is +1 (`STACK_BIAS`, 628), so it wins the seam.
- A wall with the storey above's floor over both sides is `under`: its picture is cut along its near face's top (`partBelow`, 155-169). With floor over one side only (a stairwell), the top stays flush as the floor's edge.
- `aboveDrawn` is false where the storey above is hidden or faded (`scene.js:289`), so the cut follows what is actually drawn.
- A post standing on a post draws no stone foot (`walls.js:949-963`; `POST_FOOT_UP` 6, 629).
- A stair's picture is cut at its head where a wall or floor stands beside it (`storeys.js:340-358`).

**Limits.** Rings have none of this (section 6). Battlements use `stack` only for the +1. Cliffs draw no cap anyway (the plateau's floor is their top).

**Confidence.** High.

---

## 14. Cost per storey

| What | When | Cost | Where |
|---|---|---|---|
| Layer list | every frame | O(loaded chunks) | `storeys.js:41` |
| Tile list per storey | every frame, per layer | `tilesOf` map + `storeyTileOn` filter + hide filter + 2 fade filters over all view tiles, with new arrays | `scene.js:235, 268-271` |
| Drawables per storey | every frame | wall, ring, post, prop, item, stair gather over the storey's tiles; one sort per storey; `entities.filter` per storey | `scene.js:291-317` |
| Floor quads | every frame | one quad per chunk per storey (plus one per faded chunk) | `storeys.js:516-537` |
| Masked floor test | every frame, when a hide or fade test exists | 256 test calls per chunk before the cache check | `storeys.js:548` |
| Floor bake | on a chunk's `lightVersion` change | a 1120×608 canvas (`16*64 + 96` by `16*32 + 96`), 256 `drawImage`, plus a hidden and a faded copy; **the atlas page goes dirty and the whole 4096² page is re-uploaded** (`gl.js redrawSheet` 231-245, `uploadAtlas`) | `storeys.js:432-481, 544-582` |
| What bumps `lightVersion` | any `map.touch` on that layer: a wall, door, gate (`map.js:1880`), or floor change | bumps the 3×3 chunks round it (`map.js:2181-2197`) | |
| Atlas space | a new chunk-layer bake, or a re-bake after eviction | the shelf packer never reuses space (`gl.js:149-196`). Inferred: long building sessions open more 64 MB pages | |
| Second area set | when any storey is in view | one more light composition (static per camera chunk), ambient over ~12.5k tiles per `worldVersion`, fog per sight change | `area.js` |
| Draw calls | per frame | still ~5 passes + ground chunks; storeys add no draw calls, only vertices | `gl.js:1305-1336` |
| Fade | per frame | O(buildings × layers × 12) | `storeys.js:108-110` |

`check("depth")` row 13 measured the cost on a ground view only (0.309 ms, `docs/51`). No storey cost is measured anywhere.

---

## 15. The see-through rules

| Thing | When it fades or hides | How much | Keyed to | Code |
|---|---|---|---|---|
| Storey above, inside an authored building | viewer stands in that building's footprint on a lower layer | hidden (not drawn), footprint plus S/E row | viewer's tile → building index (authored only) | `storeys.js:47-58`; `scene.js:268, 300` |
| Upper storey of an authored building in front of you | 12-point ray box test covers your body; L > your layer | 0.42, one sheet (`PASS_FADE`) | viewer body vs indexed building rects | `storeys.js:76-118`; `scene.js:259, 342-352`; `gl.js:1322-1331` |
| Near straight wall (and its post) | wall's far tile is your room, its own tile is not; your layer only | 0.42, cut at joints and posts, no cap | viewer's room on viewer's layer | `walls.js:387-393, 818-833, 1147`; `scene.js:285` |
| Walls along your stair | you are on a stair (`rise > 0`); wall's far tile is a step of it | 0.42 | viewer's stair, its layer and the one above | `walls.js:377-389`; `scene.js:260-261` |
| Ring near half (middle stretch) | you are in the ring's room on its layer | 0.42 inner face; flanks opaque, ends closed | viewer's room = ring's room | `rings.js:69-70, 141-146` |
| Filler (straight wall into a ring) | its joining wall is near | 0.42, cut at the post face | joining wall's near-ness | `walls.js:574-592` |
| Near battlement | you stand on the walk tile behind it or ±1 along the run, same layer | 0.42, no cuts; vertex pieces stay opaque | viewer's tile | `walls.js:1021-1027, 1038, 1096` |
| Tree canopy (any `canopy` prop ≥ 64 px) | your own body's rect overlaps it; both on your layer | soft hole, clear inside 34 px, solid past 78 px, at most 8 | your player only | `scene.js:83-85, 144-165, 337-340`; `gl.js:376-381` |
| Castle gate's portcullis | always (the art) | through the transparent gaps only | none (art + alpha test) | `walls.js:273-303` |
| The dead in the dark | outside your light and dark radius | alpha `seenAlpha`, cut at `drawCutoff` | your player, 2D distance | `entities.js:207-210`; `sight.js:19-29` |
| Any body not in your sight | (x, y) not in your own-layer `visible` | not drawn | your player's layer, 2D | `entities.js:203-204` |
| Cliff | only as a near wall of your room | 0.42 | viewer's room | `walls.js:1096-1104` |
| Player-built storey / ring tower / plateau | never | none | | (no index entry) |

---

## 16. Michael's three-storey castle

The setup: a bluff of cliff walls on layer 0 with cliff tops on layer 1 and a stone ramp up. The castle stands on the bluff: its ground floor is layer 1, then layers 2 and 3, with round towers of three storeys (rings on layers 1, 2, 3) and possibly a top on 4. Wall walks with battlements, likely on layer 2 over the layer-1 curtain walls. Gates in the layer-1 curtain. Stairs on each storey. Everything is Free-built. Michael stands on a walk shooting at the dead below; a friend watches as a guest.

### Hidden or covered that should not be

1. **No storey of the castle ever hides or fades, for anyone.** All of it is Free-built, and the hiding rule and the storey fade read only the authored index (`map.js:41-58, 3999-4011`; `storeys.js:47-58, 100-118`; admitted at `storeys.js:69-70`).
   - Inside a layer-1 hall, the layer-2 floor over it is drawn at full opacity. A layer-2 floor tile 3 tiles south-east of him covers his pixels, and so do the layer-2 and layer-3 walls. So whenever the room runs about 3 or more tiles south-east of where he stands, he is under the ceiling.
   - Only the layer-1 near walls fade (`scene.js:285`).
   - The same holds inside every tower storey but the top. The near half of the tower's ring fades only on his own layer (`rings.js:69-70`).
2. **On a north or west walk, the castle's keep and towers hide him.** Any layer-2 wall within about 3 tiles south-east of him, any layer-3 storey within about 6, and any layer-4 storey within about 9 cover him. Nothing fades: the walk is outdoors (room 0 through the void, `map.js:3466-3468`), so there is no near-wall fade, and there is no storey fade (index). Only a near battlement right in front of him fades (`walls.js:1021-1027`). South and east walks, with nothing beyond them but void, keep him visible. Inferred from the projection.
3. **The dead at the north and west foot of the bluff are hidden from everyone.** A ground point is covered by any storey-L thing at (x + 3L, y + 3L). Within about 3 tiles of the north or west cliff base, the plateau covers the dead. Within about 6 tiles, a layer-2 walk near the lip covers them, and the battlements' height adds about a tile and a half. The castle above covers more. No fade (cliffs and plateau are not buildings) and no outline (`docs/49` step 4 not built). Inferred geometry; the rule is read.
4. **The guest on the ground cannot see Michael on the walk.** A non-own body is drawn only if its round (x, y) is in the viewer's own 2D sight on the viewer's layer (`entities.js:203-204`; `main.js:1343`). The ground tile under Michael's walk lies inside the cliff ring, which blocks sight on layer 0, so Michael is not drawn at all. His arrows (`entities.js:38`), and anyone burning up there (`entities.js:148`), are skipped the same way.
   - A guest in the layer-1 courtyard sees him only if the walk tile's (x, y) is on the courtyard side of the layer-1 curtain wall line. That depends on how he lays it (inferred).
   - A guest in the courtyard sees none of the dead outside the curtain, since layer-1 walls block that guest's sight.
5. **A ground tree one or two tiles off the bluff's south foot can cover him standing on layer 1, with no hole.** Holes are cut only for drawables on his own layer (`scene.js:337-340`). Inferred from the projection.

### Drawn wrong

6. **The shooting itself.** A flight is on its shooter's layer and hits only bodies on that layer (`archery.js:136, 396`); shooting down is `docs/49` step 5, not built, and from layer 2 or higher it is step 9.
   - The aim point is the ground grid point under the cursor (`archery.js:957-962`). The marker is drawn there, unlifted, on top (`scene.js:364`; `entities.js:109+`).
   - The arrow, drawn lifted 96L px (`scene.js:313`), flies level to that grid point on his layer. It appears to stop about 6 tiles' worth of screen above the target, hits nothing, and lands as an item on that layer's void tile (`archery.js:369`, `dropItem` grows the chunk).
   - It lies in the flat pass, lifted, so it shows on the ground about 6 tiles north-west of the target and cannot be picked up there. Inferred from the read pieces.
7. **Tower seams.** Ring storeys stacked three high each draw their full cap: there is no `covered` or `onWall` in `rings.js`, while straight walls have it (`walls.js:623-660`). Inferred: a light cap band shows round each tower at 96 and 192 px.
8. **Flat things up on the castle vanish under their own floor.** Arrows that land on the walk, their shadows in flight over the walk, and potion splashes there go to `PASS_FLAT` (`entities.js:53, 98`; `props.js:383`) and are overdrawn by that storey's opaque floor. The dead burning on the walk (fire arrows hit nothing up there anyway) would have their flames drawn on the ground pass only (`scene.js:315`).
9. **Lighting at night.**
   - On a layer-2 walk, set 1 is layer 2, so the walk's torches pool there. The courtyard and the bluff top (layer 1) and the keep's layer-3 storey are drawn as open air (`FLAG_SKY`, `scene.js:264`; `gl.js:362-363`), so courtyard torches show flames and no pool.
   - From the ground, set 1 is layer 1 and storeys 2 and 3 are open air.
   - Ground-level torches below the bluff do light the ground (set 0).
10. **Fog.**
    - From the walk, the ground's fog and the dead drawn come from a 2D line of sight on the walk's layer. Walls on layers 0 and 1 do not block it, so he sees the dead in roofless closed rooms and round corners on the ground (not behind cliffs, which cover by depth).
    - From the ground, the guest sees the whole bluff top and castle fog-tinted (0.36 toward purple), because the ground tiles under them are unseen. The exception is wall faces whose outside tile is seen, which carry `FLAG_NOFOG` (`walls.js:1094`; `gl.js:383`).
11. **A faded near battlement keeps its opaque corner blocks** (`makeBattlementVertex` has no alpha, `walls.js:1062-1086`). The fade reaches only ±1 tile along the run and 0 tiles deep, so on a 2-wide walk's inner row nothing fades. Inferred / read.

### Where two see-through things stack

12.
    - **A faded near battlement in front of the faded near wall of a room on the same layer:** both are in the translucent pass, sorted by key, and they darken where they overlap (about 0.66 combined). Battlements are not cut at joints (`walls.js:1097`).
    - **Inside a tower room with the near half faded, where straight walls meet the ring:** the fillers fade with their walls and are cut at the post faces (`walls.js:586-592`).
    - **A storey fade** would not stack here: none applies to Free-built storeys. Where it does apply (authored), its pass paints over translucent things in front of it (`gl.js:1322-1331`, after 1320). Inferred.

### Fading when it should not

13. **The ramp's own square sides** (`wall_ramp_side`) on the camera side fade while he walks the ramp, because they border the stair's tiles (`walls.js:387-389`). Mild and intended for walled stairs.
14. **A courtyard of 300 tiles or fewer, fully closed by the layer-1 curtain and its gates, is a room.** Its south and east curtain walls fade while he is in it. The walk floor above them (layer 2) and the battlements never fade, so the band above the faded wall stays solid. Inferred / read.

### The camera

15. `camera.follow` aims at the body lifted by `layer*96 + rise`: 3 tiles back on both axes per storey (`camera.js:38-46`). The glide up a stair or ramp is continuous, because the rise hands over to the layer at the top edge. The zoom does not change and nothing frames the drop.
    - On a south walk at layer 2, a dead one 2 to 3 tiles past the south cliff foot sits about 270 world px below him on screen. That fits at every zoom on 1080p (inferred).
    - The view tiles are the ground's under the lifted camera (`main.js:1342`). Storey tiles past the ground list's bottom fringe (+3L beyond its 10-tile margin) are fogged (inferred, off-screen).

### Slow

16.
    - **Every gate toggle on layer 1 re-bakes the bluff-top floors.** Each floor laid, wall built, or door, gate, or shutter toggled on a storey calls `map.touch` (gates at `map.js:1880`), which bumps `lightVersion` on the 3×3 chunks of that layer (`map.js:2181-2197`). That re-bakes up to 9 floor pictures (1120×608 canvases, plus masked copies) and dirties their atlas page, so the whole 4096² page is re-uploaded the next frame (`gl.js:231-245`, `uploadAtlas`). Inferred: a hitch each time.
    - Building a castle over many chunks across 4 or 5 layers allocates atlas space that the shelf packer never reclaims (`gl.js:149-196`).
    - Per frame, each of the 4 to 5 layers re-maps and filters the whole view tile list and gathers its drawables (`scene.js:233-317`).
    - A second light, ambient, and fog set is composed whenever any storey is in view (`area.js`).
    - Nothing here has a measured cost; `check("depth")` row 13 is ground only.

### What no check covers here

A Free-built storey or ring tower; any layer above 1 in a pixel check; seams of stacked rings; a viewer on layer 1 or higher with ground trees; light and fog on storeys; a guest's picture of a body on a storey; arrows or flat items on a storey. (`check("storeys")` uses the authored tower house; `check("round")` one ground ring; `check("battlements")` drawables' flags; `check("cliffs")` that edges draw.)
