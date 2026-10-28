# 29/10 — The frame: a bounded world in an endless engine

**Status, 2026-10-28: a plan, Michael's rulings logged in `02` (2026-10-28, The world is bounded), nothing built.** Written from `origin/main` at e4aa2edf after the talk of 2026-10-28. It answers one question: how a hand-designed world of a valley and a few regions lives in an engine that grows forest chunks forever. A **default** is the Secondary's own, Michael's to overrule; section 10 lists them. Nothing here is urgent ("not mega high priority"); it exists so the map tools are designed with it in mind.

## 1. The conflict, in Michael's words

"The current game is a chunked world that right now builds out infinite chunks of woods with 2 zombies lol. The vision for the post-demo, post-valley game however is a valley-as-starting-zone with 4ish outlaying regions, accessible through some kind of passage, with their own borders, and therefore the valley needs borders else you could like wander around the back of the regions. We have an endless chunked world a a finite game, more zones like in wow in a way, where the valley is large but not the whole game. How do we square this circle? ... We also have no elevation right now ... Which means no mountains to block off passage like in wow. This need of ours for a bounded designed world is very different from zomboid, which has a map but endless forest at the edge."

And the answer he settled on: **"the whole area would be fully bounded on the outside too, so even if we leave the ground flat around the outside, we will river or tree or stone if off. There may be forest outside for a smidge but it's just decoration."** On the three ways to bound it: "I liked all 3 options (wall of trees, actual rock elevation, and rivers) just about equally, especially rivers because we already have bridges in the game so we can separate all of them by water if needed, maybe trees for the snow region, TBD." On cliffs built from storeys: "It's just a multistory house with none of it being buildable, destroyable, pass-throuable, etc. You never have to worry about opacity because nothing is ever behind them. Then when you don't want the player to go higher, no more stairs. Done." And "Earth always 0 is fine."

## 2. The shape

- **One continuous map** (`00`, the first law): the valley and every region are lobes of one authored world, with wild fill in the spaces the authoring leaves empty, exactly as `02`'s direction says (2026-10-15: "a hand-authored world with procedural filling of the spaces it leaves empty").
- **A frame** closes the whole world: a line of things that block bodies, made of river, tree wall, or rock cliff by stretch (section 3), between each region and the valley, between region and region, and round the outside of all of it. Nothing crosses the frame but at a **passage** (section 4).
- **Beyond the frame the engine goes on as today:** chunks of wild forest grown on demand, by the same `wild` rule, dropped past eight chunks and regrown from their hash. They are scenery. Nobody can reach them, nothing spawns in them (section 5), and the camera never shows void, which is the only thing the endless wild was ever for.
- **No invisible walls, ever.** Every edge of the world is a thing the player can see and name. The frame is made only of materials the engine already has or has planned, and each is a wall by the rules every wall obeys: walls are state on tile edges (`src/CLAUDE.md`), water is a floor no body walks (`30` law 8), a tree is a solid prop.
- **A word:** `01-geography` calls the valley's nine districts "regions". Since 2026-10-13 "region" is the word for a place beyond the valley (`02`), so this doc says **district** for the valley's parts and **region** for the lobes beyond; `01` is not rewritten for it until it is next rewritten for something else (*default*).

## 3. The three frame materials, per stretch

Michael likes all three about equally; the frame is chosen **per stretch of edge**, not one material for the world. What each costs and what each lets through:

| | River | Tree wall | Rock cliff |
|---|---|---|---|
| Blocks bodies | yes: `walk: false` for every walker, the dead included; nobody swims | yes: a solid prop a tile, two tiles deep so no canopy gap is a path | yes: a wall edge |
| Blocks sight | no | no (trunks do not cut sight; only the canopy's soft hole) | yes, opaque |
| Blocks arrows | no (a flight crosses water; the bow's `range` is 22 tiles) | low flights hit trunks (`trunkHeight` 40); a lobbed arrow clears | yes, to its height |
| Its passage | a **bridge** (built by mapgen today) or a **ford** (shallow water, built today) | a **road through the thicket**: a gap two tiles wide | a **gorge** (a gap in the cliff line) or a **slope** (a stair with slope art, `49`) |
| New engine | none | none | `49` built to its step 3 (storeys, stairs) |
| New art | none (`29/09` has the river and bridge) | one unfellable tree kind per register (a thorn thicket; dense conifers for a snow region) | a `rock` wall material with its brow, its rounded corner (`50`'s quarter), slope art for the stair, `ground_rock` |
| Suits | most borders; the valley's south and north (the river already runs top to bottom) | the snow region (Michael: "maybe trees for the snow region, TBD"); the valley's west | wherever height is wanted: looking down into the valley, or up at a region |

- **A river border lets you see across.** That is a feature: the next region is seen before it is earned, a teaser (*default*: keep it). It also lets you shoot across, which the sniper's-nest ruling (`02`, 2026-10-26) already accepts: the dead on the far bank cannot cross and cannot be looted. Where a border river is narrower than the bow's reach and the far bank matters, a tree line stands on it (*default*).
- **A tree wall** is a new sprite kind only: `solid`, not `interactable` (so it never sways and is never felled; trees are excused from the outline law), with the canopy's soft hole as any tree. The dead and the player are stopped alike; a path through it is a road feature with the trees cleared, which the thicket closes beside.
- **A rock cliff** is `49`'s upper floors with a material nobody can touch: a floor on layer 0, a 96 px `rock` wall (`52`: every wall one storey tall, a cliff taller by storeys, as the castle is), the plateau's floor on layer 1 sitting exactly on the wall's cap, the next wall, and a stair with slope art where the land climbs. **The inside of a hill is nothing:** the tiles under a plateau are whatever the map has there, closed off by the rock walls round them, hidden by the plateau floor's depth (`51`), and never seen ("nothing the player can ever see. If they could teleport, probably a big empty dark space. That is fine with me"). No earth above ground; earth is layer −1's (`49`). The pieces tile by construction: a wall is a storey, a storey is a floor's height, and the art meets at the cap and the corner as house walls do. Where the world should end upward, there is no stair ("no more stairs. Done").
  - What it leans on from `49`: the fade of a storey you stand behind (a player walking along the north or west foot of a hill is under the plateau's picture, far more often than behind a house); the chart on M charts the ground only, so plateaus are uncharted until the per-layer map; shooting down from layers 0 and 1 only (a two-storey crag is layer 2: either the limit counts storeys above the nearest ground, or crags are shot from at one storey; Michael's, when it comes).
  - The sealed interior is found by the room fill and called a room nobody can enter; harmless, and the mapgen marks it void if a check ever minds (*default*: leave it).
  - Whether a plateau top is buildable ground: `49`'s support rule lets an authored floor hold anything, so a house on a hill is allowed unless ruled otherwise (*default*: allowed).

## 4. Passages and gates

- **A passage is the only gap in a stretch of frame:** a bridge or ford in a river, a road through a tree wall, a gorge or slope in a cliff, or a **tunnel** on layer −1 (section 6). It is one to three tiles wide, so it is a place, not a border: a boss can hold it, a siege can press it, and a player can watch it from a window.
- **A gate** bars a passage until its boss falls: a door variant with a `key` naming the boss (a portcullis, a fallen gate, an arch grown over with thorn, a landslide on a slope, a flooded ford that drains), authored by the map, never built or taken apart by players, refusing the stamp. The boss's death opens it, in the world's state (saved, sent with its chunk, in the sync check's map part), **and it stays open**: the boss can be fought again (`02`, 2026-10-13) but the way stays won (*default*). Opening is a player's doing, never a clock's (`00`, Never harder on a clock).
- **Where the boss stands** is the passage itself or the ground before it on the valley's side (*default*): the fight is at the door, so a player who is not ready can turn round, and the frame is why it cannot be walked round.
- **The register changes at the passage, not as a gradient** (`00`: "a change of region, not a gradient"): each region is a **zone** (`05`, Zones, and `data/ground.json`'s zones as `02` scrubbed the word): its ground palette and scatter mix (built), plus its ambient light and fog colour, its sound bed, and its weather, when those exist, crossfaded over a few tiles at the passage's mouth (*default*: three). Inside the passage the register is the far side's from its midpoint.
- **The valley's first gate** is the one `02-water-and-roads` already wrote: the waystone at the end of the old road east ("The old road. Nobody goes this way now."). It becomes a gate when the east region exists; until then the road ends at the frame as it ends in the wild today.

## 5. The outside

- **The wild beyond the frame is decoration.** The generator is unchanged: `ensureAround` already grows four chunks (64 tiles) round each player, which covers the farthest corner of a 3840 by 2160 view at zoom 1.1 (about 58 tiles out along an axis), and `evictFar` drops chunks past eight. So the strip the player sees across the frame is grown as it is today and forgotten the same way. **No dead spawn beyond the frame** (the wild rule's `zombiesPerChunk` reads 0 outside it; *default*): a dead one out there could never reach anyone and would only count against the population. Forage out there is unreachable and needs no rule.
- **The explored world is finite.** With the frame closed all round, everything a player can stand on, chart, build on, or change is inside it. The save holds only touched chunks and the chart only seen tiles, so a world's size on disk and on the wire is bounded by the frame's area plus a thin seen strip outside it, instead of by how far somebody once walked into the woods. A guest in the far region is in the same world, in its own four-chunk ring, as today.
- **The frame is also the end of the chart:** the map on M draws the frame's line as the world's edge, and the wild beyond it as the seen strip only (*default*).

## 6. Underground: mines, cellars, and tunnels

- A cave or a mine is `49`'s cellar model: below the ground every unauthored tile is earth (solid, opaque, never walkable, never dug), and a gallery is a floor carved out of it, reached by a stair or a ladder from a mine mouth above. The rock faces along a gallery's walls are laid by the loader on the boundary between floor and earth, as `50` lays a ring's stepped edges from an outline: ordinary `kind: "wall"` edges of the `rock` material, refusing the stamp.
- **Ore stays on the ground** (Michael, 2026-10-28: "still only on the ground, so no change there"): the resource nodes are the props they are today, placed by the same rules in a gallery's rects. No veins on walls.
- **Earth should be drawn as rock mass, not as nothing** (a change to `49`'s default, for the mine's sake): a dark rock ground kind baked per layer, so what lies beyond a face reads as stone, as in the mines Michael named. A root cellar's earth is the same picture, darker.
- **A tunnel is a passage** on layer −1: a gallery from one lobe's mine mouth to another's, with earth as its frame on both sides. It is the cheapest border there is, and a mine region needs no frame at all.

## 7. Mapgen and the loader

- **The loader's bounds become a union.** `map.js` keeps one authored rectangle (`bounds`) and treats everything beyond it as wild. It takes instead a list of authored rects, one per lobe, and **the frame as a mask**: inside the frame is the world (authored where authored, plain floor where not), outside it is the wild rule's. `inBounds` reads the mask. Every reader of `bounds` (the resource rects, the scatter zones, the room fill's "out past the bounds is open ground", the tree test, the chart) reads the union.
- **Three mapgen primitives:** `frame(points, material)`, a closed polyline laid as a feature (a river by `river`, a tree wall as a band of the unfellable kind two deep, a cliff as `rock` edges with `50`'s rounded corners), with `passage(at, kind, gate)` cutting its gaps and naming their gates; and `plateau(outline, storeys, slopes)` (after `49`) laying a hill's walls, corners, floors, and stairs by storey.
- **A region is its own file,** stitched into the world by an offset (`valley.json` plus `region_east.json` and so on, each with its lobe's rect and its stretch of frame), so a region is built without touching the valley's generator, and the valley's file is the one that merged.
- **The valley's four edges**, as `01` promised them, answered by material (*defaults*): **north**, the river's source: a cliff, the quarry's conifer slope rising into a north region when there is one; **east**, the old road: a thicket, the waystone its gate, the gloom beyond (`02-water-and-roads`); **south**, the drove: the river bent round, the ford its passage, "the next village" beyond; **west**, the old way past the standing stones: trees, the path petering out into the frame with no passage until a west region exists.

## 8. The guest's side, the save, the wire, the sync check

The frame is map: walls, floors, and props in chunks, saved and sent as every chunk is, nothing new. A gate is a door with a `key`, in its chunk's record and the sync check's map part; its opening is the host's step (a boss's death in `host.js`'s world), reaching every client as a chunk touch. A region's zone is data every client loads. `net.PROTOCOL` moves only for the gate's field.

## 9. Laws and rulings this leans on

One continuous map and no scene transitions (`00`); never harder on a clock (`00`); bosses gate regions and can be fought again (`02`, 2026-10-13); "region" is the word (`02`); a hand-authored world with procedural filling, and the grown wilderness not foreclosed (`02`, 2026-10-15); water stops every walker (`30` law 8); walls are state on tile edges (`src/CLAUDE.md`); nothing digs and no wall breaks (`00`); upper floors, round rooms, the depth buffer, and walls at 96 (`49`, `50`, `51`, `52`). Nothing here contradicts `05-someday`'s Zones; it is how they are bounded.

## 10. Choices still Michael's (defaults stand if he says nothing)

1. The valley's four edges by material (section 7).
2. A river border seen and shot across: kept as a teaser, with a tree line where the far bank matters.
3. A gate stays open after its boss is fought again.
4. The boss stands at the passage, on the valley's side.
5. Three tiles of crossfade at a passage's mouth.
6. No dead spawn beyond the frame.
7. A plateau top is buildable ground.
8. Earth drawn as rock mass, in `49`.
9. The chart ends at the frame.
10. "District" for the valley's nine parts.

## 11. Build steps, one issue each, when the time comes

1. **The loader's union and the frame mask:** `bounds` as a list of rects plus a mask, every reader of it, the wild rule's `zombiesPerChunk` 0 outside; the valley unchanged in play (its one rect, its frame the four edges' materials); proven headless (`node tools/world.js`'s hash unchanged for the valley) and by a row in `check("build")` that walks to each edge and is stopped by something visible.
2. **The frame primitive** and the valley's four edges: the river's bend, the thicket, the west trees, the north cliff line as a flat `wall_cliff` until `49` gives it storeys; the unfellable tree kind (placeholder first); the art asks filed in `29/09`.
3. **Passages and gates:** the gate as a door variant with a key, the waystone's gate, the ford as the south passage; a guest sees the gate open; the sync check.
4. **Zones per region:** ambient, fog, and the sound bed by zone with the crossfade; the valley's zone unchanged.
5. **The first region file,** stitched by offset; the mapgen split; a region built by a Secondary without touching `valley.py`.
6. **Plateaus and slopes** (after `49` step 3): `plateau()`, the `rock` material with its brow, the rounded corners, slope art on the stair; the north edge rebuilt in storeys.
7. **Tunnels and mines** (after `49`'s cellars): the rock faces from a floor outline, earth as rock mass, the mine mouth's stair.
8. **Later, not now:** a per-layer chart; a slope wider than a tile; a flooded ford as a gate; weather by zone; the inside of a hill marked void; a boat (never, probably: water is a wall).
