# Sheet C: what crosses between layers (sight, fog, the dead's sight, light, shots, blows, reach, sound, hiding)

Read from the worktree `77-sweep-3c-82aa16`, detached at `e3c771ed` (main after #591). Read only; no pane, no server. Code and data are the truth; docs second. "Read" means I read the line; "inferred" means I followed the code to a conclusion I did not watch run.

Short version of the state: **docs/49 steps 4 (the ray with heights) and 5 (shooting down) are not built.** Every system is either *on one layer* (sight rays, the dead's sight, bites, blows, reach, a flight's targets, light) or *layer-blind* (the player's visible set and fog keys, a flight's wall and prop scan, sound, animals, villagers' fear, the siege's opening memory). Where those two meet, they disagree. The one bridge between layers is `zombie.js` `layersMeet`: two bodies a storey apart see each other only when both stand near the same stair or ramp.

Legend for Confidence: **High** = read the line(s) and the data; **Medium** = read, but the conclusion follows two or more hops; **Low** = inferred from code shape, not traced fully.

---

## 1. `lineOfSight` and layers

**Rule.** `lineOfSight(ax, ay, bx, by, layer = 0, blocks = blocksSight)` walks tile edges (Amanatides and Woo) **on one layer only**: each edge's wall is read by `wallBetween(..., layer)` and each tile's prop by `tileAt(ix, iy, layer).prop`; an edge stops it when `blocks(wall)` is true, a tile when `prop.opaque`. There are no heights at all: no eye height, no target height, no wall height, no floor as a ceiling. `lineOfReach` is the same walk with `blocksReach` (adds a shut gate whose `bitesPass` is false). `tileVisible` and `computeVisible` take a layer and pass it through. `openingOnLine` (the siege's "which window did I see them through") takes **no layer** and reads layer 0.

**Numbers.** `MAX_STEPS` 400; `CORNER` 0.42 (four extra rays per hidden tile).

**Code.** `src/visibility.js:12` (signature and the docs/49 comment "the ray with heights across storeys is step 4's"), `:30`, `:35` (edges), `:40-41` (opaque prop), `:49-51` (`lineOfReach`), `:56-84` (`openingOnLine`, `wallBetween` with no layer at `:75`), `:100-115`. `src/map.js:2742` (`wallBetween`, `layer = 0`).

**Answers.**
- Is a ray on one layer only? **Yes.** Nothing in the function crosses a layer.
- Can a player on storey 1 see the ground? **He is drawn the ground, but by the wrong rule:** his visible set is computed with rays on *his* layer (section 3), and its keys carry no layer, so every ground tile whose (x, y) is clear *on layer 1* is shown, ground walls notwithstanding.
- Can the dead on the ground see a player on a wall walk or a bluff? **Only within a few tiles of a stair or ramp they both stand by** (section 4). Otherwise no, at any range.

**With friends.** Each client computes its own visible set from its own player (`main.js:1343`, `client.me.layer`). The dead's sight is the host's.

**Limits.** `openingOnLine` reads layer 0 for any sighting (`visibility.js:75`), so the siege's remembered window for a player seen upstairs is the ground's (section 9). No check casts a ray across layers; docs/49 section 7 is the design.

**Confidence.** High.

## 2. What blocks sight, per layer

**Rule.** All by `map.transmission(wall) < 0.5` on the ray's own layer:
- A plain wall, a cliff, a ramp's side, a closed door: 0, blocks. A wall whose definition says `seeThrough` (fence, bars, battlement): 1, passes.
- A window: shutters `closed` leak 0.05, so they block; open or broken passes. Boarded anything: 0.
- A castle gate: a door-kind wall; open passes; **shut it still passes** when its definition's `grille` is not false (the portcullis). It still bounds the room.
- Round walls: edge walls like any other, so they block as stone.
- Trees: a canopy does not block sight (only `prop.opaque` blocks, per tile).
- **Floors: nothing.** A floor is not a ceiling for sight. No ray goes up or down, so the question never comes up on one layer, and the layer-blind visible set (section 3) ignores floors entirely.
- **Void** (an unfloored tile above the ground) has no walls, so sight crosses it freely on its layer. **Earth** below the ground bounds rooms, but `lineOfSight` reads only edges and props, so earth does not block a ray itself (inferred).
- **Cliff height**: a cliff is a wall on a layer's edges with `height` 96 in its data, but sight ignores height. Cliff walls are on layer 0 (the face); the plateau is floor on layer 1. So from the ground the cliff edge blocks like stone, and from the plateau there is no wall on layer 1 at the rim at all.
- **Battlement vs stone wall vs shutters**: battlement `seeThrough` (passes on its layer), stone wall 96 (blocks), shut shutters (block). Heights play no part in sight.

**Numbers.** `data/sprites/wall_battlement.json` `wall`: height 28, seeThrough, battlement. `wall_cliff.json`: height 96, cliff. `wall_stone_gate_2.json` `wall.gate`: `grille` true, `bitesPass` false, `shotsPass` true, `deadBreak` false, opening crown 78, hp 400. `map.js:2760` `shutterLeak` 0.05.

**Code.** `src/map.js:2762-2769` (`transmission`), `:2771` (`blocksSight`), `:2777-2779` (`blocksReach`), `:1809-1827` (`gateOf`, `gateGrille`, `gateHolds`), `:2857-2865` (`wallRule`).

**With friends.** Walls and their states reach a guest with the chunk; each client casts its own rays over its replica.

**Limits.** Sight is height-free on every layer. A battlement's 28 and a gate's 78 matter only to flights (section 6), and even there only on layer 0. `check("gates")` proves sight passes a shut gate on the ground (`tools/checks/gates.js:303`); `check("battlements")` proves `transmission` is 1 (`battlements.js:199`). Nothing checks sight on layer 1+ against a battlement.

**Confidence.** High.

## 3. The player's fog and what he is drawn across storeys

**Rule.** One visible set per client, **computed on the viewer's layer**, its keys `tileKey(x, y)` with **no layer**. The frame uses that one set for **every** layer it draws: the ground's fog texture (set 0), the storey's fog texture (set 1, `buildStoreyArea`, same `visible`), entity drawables, prop and floor-item drawables, walls, rings, arrows. So:
- **Viewer on storey 1:** rays on layer 1. Over void and an open walk there are no walls, so nearly the whole viewport is "visible", and the **ground** is drawn unfogged with its dead **including inside closed ground buildings** (a ground wall never stops a layer-1 ray). The tiles under his own floor are hidden by the floor's depth, not by fog.
- **Viewer on the ground:** rays on layer 0. An upper storey's tile (x, y) is "visible" only if the **ground** tile under it is, so a storey over a closed room is fogged and **a body on it is not drawn**. A walk laid over the inside of a stone wall box is fogged from outside; a plateau ringed by cliff walls is fogged from below. A friend standing on either is invisible to you (`entityDrawables`: "the dead you cannot see are not drawn, full stop", and other players by the same rule).
- Who on another layer is drawn at all: bodies are drawn on their own layer's pass (`mineBody`), subject to the hiding rule and that one set.

**Numbers.** Recomputed when the player's tile, layer, camera tile, `worldVersion`, or window size changes (`main.js:1338`).

**Code.** `src/main.js:1338-1345`; `src/render/area.js:193-207` (the comment: "A storey's fog is the ground's under it until sight is kept per layer (docs/49 step 4)"), `:235-237`; `src/render/scene.js:226-313` (one `visible` passed to every layer's `gather`); `src/render/entities.js:204-205`; `src/chart.js:145` (the map's chart casts `tileVisible` with no layer, so it charts by layer-0 rays from the player's (x, y) whatever his storey).

**With friends.** Each client's own; a guest upstairs and a host below see different, and each wrong in its own way. Nothing on the wire.

**Limits.** Layer-blind by design until step 4. `check("storeys")` proves drawing, the hiding rule, and the fade by pixels, not fog across storeys. No check asserts what is or is not seen across a floor.

**Confidence.** High for the mechanism; Medium for "a friend on a walk over a wall box is invisible from outside" (follows from the box's interior being shut on layer 0; not watched).

## 4. The dead's sight of players (and flames, the pull)

**Rule.** `canSee(z, player)`: player alive and Zombie aggro on; **`layersMeet(z, player)`**; distance within `sightRange(8, player.gx, player.gy)`; `lineOfSight` on **the dead one's layer**. `layersMeet`: same layer, true; more than one apart, false; one apart, true only if some stair on the lower layer (not its stairwell record) has **both** bodies within `t` in (-3, 6) along it and `|off|` < 2.5 across it. A ramp is a stair, so it counts. `sightRange` scales by `light.lightAt(gx, gy)` with **no layer**, so always the ground's light at the player's (x, y).
- Flames (`nearestFlame`): same layer only.
- Sight-pull (`callOthers`): same layer only, `pullRadius` 4 scaled by the same layer-0 light.
- Villagers as prey (`canSeeCharacter`): same layer only (and every villager is immune, section 10).
- A blow or shot it lives through: `lastSeen` is set to the striker's (x, y) **on the dead one's own layer** (`zombie.js:128`). No cross-layer hit exists today, but when step 5 lands this would send the dead to stand under the archer.

**Numbers.** `data/tuning.json` `zombie`: `sight` 8, `sightDarkFraction` 0.35, `flameRange` 12, `pullRadius` 4. The stair window: `zombie.js:402` (-3 < t < 6, |off| < 2.5).

**Code.** `src/entities/zombie.js:378-380` (`sightRange`, `lightAt` with no layer), `:383-389` (`canSee`), `:394-406` (`layersMeet`), `:439-442`, `:468-486` (`:477` flame layer), `:605-616` (`:611`); `src/map.js:2952-2964` (`stairAlong`, `stairsOn`).

**With friends.** Host only; `seesNow`, `lastSeen`, `huntsPlayer` never cross the wire (docs/48 section 5).

**Limits.** Not symmetric across layers: the player upstairs is *drawn* the dead (section 3) while they cannot see him. Not by height: a player on a bluff edge two tiles over the dead's heads is unseen; a player near the ramp at the far end of the bluff is seen. Asserted: `tools/check.js:5942` (one of the dead sees a player go up and follows by the stair, and does not bite through the floor). Not covered: a player upstairs at a window, on a walk, or on a bluff away from a stair.

**Confidence.** High.

## 5. Light across layers

**Rule.** Every source carries its layer (fires, brackets, lanterns, portals, carried flames, burners); a chunk's light map is built from its own layer's sources (`reaches`), and `lightAt(gx, gy, layer = 0)` reads its layer's ambient, static map, and carried flames only. So **light never crosses a floor, up or down.** An unfloored or open tile upstairs is outdoors: the clock's ambient (`outdoorAmbient`), so the moon and the day are the same on a bluff, a walk, and the ground.
- A torch on a walk: lights the walk's layer only, never the ground or the gate below. Mounting one upstairs: `setdown.mountProblem` reads the wall through `peekTile(tx, ty)` with the step's default layer 0 (`setdown.js:246-249`, `paintings.js:47-50`), while `map.mountTorch` hangs it on the player's layer (`setdown.js:291`). So a torch on an upper wall is accepted only where the ground has a hangable wall on the same edge (inferred), and refused over void with "No wall to hang it on".
- A window lit from inside on storey 2: its portal lights storey 2 only. What the **renderer** shows: only two light sets exist, the ground's and one storey's (`upperL`: the viewer's layer if he is upstairs, else the first storey in view); **any other storey is drawn with `FLAG_SKY`, lit as open air** (`scene.js:242`, `:264`; `gl.js:347`, `:362-363`). From the ground, storey 2's rooms show no torch pools, no lit-room glow, and no shuttered darkness; at night they look like the night outside.
- The player's sight in the dark (`sight.seenAlpha`) reads `light.lightAt(z.gx, z.gy)` with no layer and the viewer's own carried light by 2D distance whatever its layer. So from a walk, a torch in his hand gives back sight of the dead *below* within its radius though it lights nothing there; and one of the dead standing in torchlight on his own walk is judged by the ground's darkness under it (inferred).

**Numbers.** Torch radius 3 (item `torch.fire.radius`), lantern 3.4, `sight` block `darkRadius` 1.5, `edge` 2, `litNone` 0.3, `litFull` 0.45.

**Code.** `src/light.js:53-121` (sources with `onLayer`), `:155-192`, `:366-368` (`reaches`), `:474-486` (`lightAt`, `:480`); `src/sight.js:19-29`; `src/render/scene.js:240-264`; `src/render/area.js:20-60`.

**With friends.** Each client builds its own light from the replica; a carried flame is per owner (`setCarriers`). Same for host and guest.

**Limits.** Asserted: `tools/check.js:5614` (a fire on layer 1 lights nothing on the ground), `:5817` (an upstairs window lights its own room). Not covered: a third storey's drawn light, `seenAlpha` on another layer, a torch mounted upstairs over void.

**Confidence.** High for the world's light; Medium for the third-storey render and the torch mount.

## 6. Flights: arrows, thrown things, spells

**Rule (as built).**
- **Layer:** a flight takes its shooter's layer (`archery.js:136`, "hits only there until shooting down is built (docs/49 step 5)"), carried to a guest as `l` in its launch record.
- **Height model:** a point on the ground line; drawn height `z(u) = z0 (1 - u) + 4 H u (1 - u)`, landing at 0, **relative to nothing but the shooter's own floor**; a spell flies flat at its `z0`. `H = arcMin + (arcMax - arcMin) s / range`.
- **What stops it:** `scanPath` steps the ground line every 0.1 tile and at each tile crossing calls `edgeStops`, which reads `map.wallBetween(ax, ay, bx, by)` **with no layer, so layer 0**, and `map.tileAt(nx, ny)` with no layer (the step's default, 0). A wall stops it below its `wall.height` (96 stone, 36 fence, 28 battlement); an open door under 64; an open window between 24 and 64; a castle gate shut or open under its crown 78 (`gateShotHeight`); boards always. Props below their frame height up to 50, trunks below 40.
- **What it hits:** at landing only (`bodyAt`), the nearest living dead or wild animal within `hitRadius` 0.5 **on the flight's own layer** (`archery.js:396`), with a clear line by `clearBetween` (again layer-0 walls).
- **Where it lands:** `map.dropItem(round(gx), round(gy), item, a.layer)`; `dropItem` calls `growTile`, which makes the chunk on that layer. **Over void it lies on the void**, a storey up, where nobody can walk (inferred from `map.js:877-898`, `:2707-2711`).
- **The aim upstairs:** `archery.aimPoint` reads the cursor with `iso.toGrid(mouse.x, mouse.y + aimLift)`, **unlifted by the storey** (placement lifts it: `placement.js:250`), and `player.aimOrigin` (the chest the aim vector starts from) is also unlifted (`entities/player.js:97-100`). On layer L the figure is drawn 96 L px higher. So a cursor on a ground body reads that body's ground point (right by accident), and a cursor on anything on the shooter's own upper layer reads the ground point 3 L tiles toward the camera (96 px = 6 half-tiles of `gx + gy`) (inferred, not watched). A guest's `aimAt` is the same reading with the layer appended (`net.js:1501-1504`); the host's `aimFrom` uses only its x and y.
- **Today, from storey 1 at the ground:** the flight is on layer 1, so it can hit nothing on the ground; its scan reads the **ground's** walls, so from a walk standing over a stone wall it is stopped at once by that wall (z about 30 to 45 against 96) and lands on the walk at the parapet's foot; if it clears the walls it lands on layer 1's void at the aim point. The battlement on layer 1 is never read by a flight.

**What docs/49 proposes and what is built.** Step 4 (the ray with heights from the eye at floor + rise + 40 to the target's middle, walls by height band, floors as ceilings, leaning out at an open window or parapet, both ways): **not built.** Step 5 (the arc to `zEnd`, launched from the opening, per-layer checks, landing per layer, bow and throwing knife and axe only, spear and fireball stay on their layer and stop at the floor's edge, from layers 0 and 1 only with "Too high to aim from here"): **not built**; no `zEnd`, no lean-out, no refusal string exists in `src/` (grep). The battlement's "passes above 28" is real only in `wallStops` itself, which `check("battlements")` calls directly (`tools/checks/battlements.js:200`); no flight on a walk ever reaches it.

**Numbers.** `data/combat.json` `bow`: `range` 22, `speed` 16, `arcMin` 8, `arcMax` 150, `z0` 30, `hitRadius` 0.5, `aimLift` 22, `wallHeight` 96, `trunkHeight` 40, `propHeight` 50, `scanStep` 0.1. `src/placeholders.js:91-93` `DOOR_TOP` 64, `WINDOW_SILL` 24, `WINDOW_TOP` 64. Gate crown 78; battlement 28; `map.STOREY` 96 (`map.js:67`).

**Code.** `src/archery.js:116-170` (`shoot`), `:179`, `:184-191` (`heightOfWall`), `:194-205` (`wallStops`), `:207-214` (`edgeStops`, the layer-0 reads), `:226-258` (`scanPath`), `:291` (fireball contact, own layer), `:307-371` (`land`; `:328` hit on own layer, `:366` kindle, `:369` drop on own layer), `:389-411` (`bodyAt`), `:416-430` (`clearBetween`), `:474-476` (`launchRecord`'s `l`), `:957-979` (`aimPoint`, `aimFrom`); `src/map.js:1838-1841` (`gateShotHeight`).

**With friends.** The host fixes the flight at release (stop, landing, hit); a guest steps it from its launch record on the bodies' draw clock and ends it at the host's end (`applyFlights`, `stepFlights`), drawing it on its layer (`scene.js:313`). A guest decides nothing about it.

**Limits.** On one layer for hits, on layer 0 for obstacles: the two disagree for every flight off the ground. Asserted: `check("gates")` shots through a shut gate on the ground (`gates.js:319-320`); `check("arrows")` the guest's replica; `check("battlements")` `wallStops` at 12 and 40. Not covered: any flight with `layer` other than 0.

**Confidence.** High for the layer-0 scan and the own-layer hits; Medium for the aim offset upstairs and the void landing.

## 7. Melee, the shove, and bites (stairs included)

**Rule.**
- A blow: `targetsIn` keeps only the dead (and animals) on the player's layer, in the wedge, with `lineOfReach` on that layer (`combat.js:200`). `rise` is ignored.
- A bite: `biteReach` is -1 across a storey (`zombie.js:329`) and -1 through a shut gate close in (`:331`); the landing re-checks `biteReach` and `lineOfReach` (`:1111`).
- **On a stair:** a body on the stair keeps the stair's layer until its centre crosses the top edge. So a player halfway up (layer 0, rise 48) and one of the dead at the foot (layer 0) bite and strike each other at plain flat distance, as if level. At the top, a player on the landing (layer 1) and one of the dead on the top step (layer 0, rise ~96) a body's width apart **cannot touch each other at all** until it crosses (read; the effect is my inference).
- **Under a walk:** the dead below never bite up and never are struck down at (layers differ).
- **The shove at a floor's open edge:** the push is `knockback` spread through `moveCircle` on the dead one's own layer; void is `walk: false` and blocks a body like water, so it stops at the edge. Nothing falls (the law).

**Numbers.** `zombie.contact` 0.7, `fenceBiteExtra` 0.5 (`data/tuning.json`); shove numbers in `data/combat.json` `shove`.

**Code.** `src/combat.js:196-212`, `:468-491` (`tryShove`); `src/entities/zombie.js:202-213` (`updateHurt`, the push), `:328-337`, `:1106-1115`; `src/map.js:3199-3228` (`circleBlocked`: a non-walkable floor blocks, `:3222`), `:3333-3352`.

**With friends.** A guest's swing is predicted (`tryAttack` `predict`) and resolved on the host; bites are the host's.

**Limits.** Asserted: no bite through the floor (`check.js:5942`), the gate's bars stop a sword and a bite (`gates.js:304`, `:335`, `:355`). Not covered: fighting along a stair, the landing's no-touch gap, the boar (section 10).

**Confidence.** High.

## 8. Interaction reach across layers

**Rule.** `reach.reachProblem(player, tiles, range, layer = player.layer)`: a target on another layer is "That is on another floor."; then distance; then `lineOfSight` on the player's layer. The E scan (`nearestSimpleAction`) looks at the 5 by 5 round the player on `player.layer` with `peekTile`/`itemsAt` and asks `canReach`; doors, shutters, and gates by `openingsNear(..., player.layer)`; the cursor's picks (menu, Use, Object Highlight, characters) run inside `onFloorOf`, which lifts the iso origin by the floor's storeys and reads `withDrawLayer`; a body on another floor is never under the cursor.
- Opening a chest on the floor below: refused, "That is on another floor." (or simply not found by E).
- **Harvesting or taking through a gate's bars:** reach uses `lineOfSight`, i.e. `blocksSight`, and a shut portcullis passes sight, so **E, the menu, and every verb that asks reach work through a shut gate** within range (1.15 for E, 2.6 for the menu), though a blow and a bite do not pass it (inferred from `reach.js:31` with `map.js:2768`; no check covers it).

**Numbers.** `interact.INTERACT_RANGE` 1.15, `CLICK_REACH` 2.6, `setdown.REACH` 2.6; Free building's `FREE_REACH` 48 for building (docs/02, 2026-10-29).

**Code.** `src/reach.js:24-38`; `src/interact.js:69`, `:1284-1301` (`onFloorOf`), `:1349-1380`, `:1513-1515`, `:1976`, `:2199-2212`.

**With friends.** The host runs every action and its reach test for a guest's command (`performByLabel`, the commands by uid and address with their layer since PROTOCOL 23/24).

**Limits.** Asserted: `check.js:5834` (reach on one layer, a put-down on the player's layer, a bracket found on its own layer), `:5869` (E and the menu read the player's floor). Not covered: reach through a shut gate.

**Confidence.** High; Medium for the gate case.

## 9. The dead's targeting and sieges against a player upstairs or on a bluff

**Rule.** The target is the nearest seen player (`nearestSeenPlayer`, section 4), else the nearest living player as a fallback for one already aggro. The chase's goal is an address on the target's layer (seen) or `lastSeen`'s layer. `repath` with a goal on another layer goes by **the stair-first rule**: path on its own layer to the nearest stair's top tile (up) or a landing (down), then over the edge, one storey a leg; no stair reachable, `pathFailed`, and `moveToward` returns without moving ("it stays and looks where it is").
- **Player on a walk or bluff, unseen** (the usual case, away from a stair): the dead **ignore him**. They idle, wander, or follow flames on their own layer. They do not gather under him, do not batter the ground door for him, and do not path to the stair.
- **Seen through `layersMeet`** (both near a stair or ramp): they path to that stair, through the doors their layer allows. A shut castle gate between them and the stair: `canStep` refuses it, so the path fails; `fenceAhead` (layer 0 by default) and the press go for a fence or gate, but a gate cannot be broken or struck through; with the courtyard outdoors (over 300 tiles, or open) there is no breach and, while it still sees him, no search: it **stands** (inferred from `zombie.js:798-860`).
- **Breach and siege with a goal upstairs:** `goalRoom` reads the right layer, `breachTargets` reads the room's layer, but `wayIn` checks the stand with `movement.canReach` on **the dead one's** layer and recurses with `tileAt(c.stand...)` on the default layer 0 (`zombie.js:265`, `:270`); `chase` reads `here` with `tileAt(round(z.gx), round(z.gy))` on layer 0 (`:820`); `noteSighting` records the window by `openingOnLine` and the door by `openingsNear(p.gx, p.gy, 1.6)`, both layer 0, then stamps them with the player's layer (`:565-566`). So a siege on an upstairs room keeps ground openings tagged as upstairs ones (Medium; docs/49 step 6, "the hunt across storeys", is not built).
- **Breaking a door or a window on a storey:** works for one that reached that storey by the stair (the breach reads the room's layer). A window facing void upstairs is not reachable to batter.
- **At a stair or ramp:** they walk it as a body walks it (`stairStep` after every move); a ramp is the same stair. Ladders are not built.

**Numbers.** `zombie.repath`, `repathFailBackoff`, `noWayTime`, `searchTime`, `breachReach` 1.1 (`data/tuning.json`); room cap 300 tiles.

**Code.** `src/entities/zombie.js:247-277`, `:500-518`, `:541-568`, `:725-860`; `src/entities/movement.js:33-76`; `src/map.js:2132-2160`.

**With friends.** Host only; the dead's state and position reach a guest in their slim records with `layer` and `rise` (PROTOCOL 24).

**Limits.** Asserted: `check.js:5942` (follows a player seen going up). Not covered: a siege on an upstairs room, a player on a walk or bluff, a gate between the dead and a stair.

**Confidence.** High for "ignores him"; Medium for the stand-and-wait and the siege's ground openings.

## 10. Villagers and animals

**Rule.** Villagers keep the ground (docs/49 default), every one immune (`immune` true unless the map says false); their fear of the dead (`deadInSight`) and animals' flight from players and the dead (`threatInSight`, `anyInSight`) call `lineOfSight` **with no layer and no layer test on the threat**, so a deer flees, and a villager cowers, from a body a storey up whose (x, y) is near and clear on layer 0. A boar's bite tests `lineOfReach` with no layer (`animal.js:383`) and `game.js:461` lands it with no layer test, so a boar chasing its striker bites him on a landing or walk above it if he is within its reach in (x, y) (inferred; no check).

**Code.** `src/entities/villager.js:92-102`; `src/entities/animal.js:205-222`, `:362-385`; `src/game.js:461-464`; `src/entities/zombie.js:439-442` (the dead never take a villager: immune).

**With friends.** Host only.

**Limits.** No check crosses layers for either.

**Confidence.** High for the calls; Medium for the boar.

## 11. Sound cues by layer

**Rule.** The ear (`sound-cues.js`) is this client's, after each drawn frame. The listener is a 2D point (`audio.setListener(gx, gy)`); every sound is placed in 2D. **No layer anywhere:** footsteps read the floor slot from `map.tileAt(round(gx), round(gy))` on layer 0 (a walk on a stone floor over grass sounds like grass); doors, shutters, and gates are scanned on layer 0 only (`scanOpenings`), so an opening on any storey never creaks; the dead's moan, the bow, hits, and deaths are per body whatever its layer, at full 2D proximity.

**Numbers.** `openings.radius` 14 (`data/sounds.json` via `openCfg`).

**Code.** `src/sound-cues.js:110`, `:163-167`, `:337-359`.

**With friends.** Client-only; nothing on the wire.

**Limits.** `check("sound")` is on the ground. Every informative sound should have a visual twin (Michael's standing ask): an upstairs door's creak is missing, not just quiet.

**Confidence.** High.

## 12. The hide rules (render)

**Rule.** `layersFor` draws the ground and every loaded storey above it (a cellar alone when you are in it). `hiderFor`: a layer above yours is hidden over **the building-index building you stand in**; the index is filled only by `loadMap` from the map file (`map.js:3999-4049`), so **a player-built building is never in it**. The storey fade (`faderFor`) also asks the index. So in a Free-built keep: standing inside the ground floor, the upper floors are drawn over you, and a lifted floor writes depth, so your own body is hidden under your own first floor ("a body on the ground under the first floor is hidden by the floor's depth", `check("storeys")` row at `storeys.js:112`); and standing behind it on the ground, no storey fades. Picking (the cursor) reads only your own floor (`onFloorOf`); a seen dead one on another floor cannot be clicked (`interact.js:2207`); the outline of the seen-but-covered (docs/49 section 6) is not built.

**Code.** `src/render/storeys.js:38-57`, `:100-106`; `src/map.js:52-58`, `:4010`; `src/render/scene.js:226-300`.

**With friends.** Each client its own player's.

**Limits.** docs/49's status says it: "a player's own storey, outside the index, does not fade yet"; the hiding rule's "for a player's building, the tiles of the room you stand in" is not built.

**Confidence.** High.

---

## The table

| Mechanic | Crosses layers today? | What it reads | Where in code |
|---|---|---|---|
| `lineOfSight` (and `lineOfReach`) | no | edges and opaque props of one layer, no heights | `visibility.js:12-51` |
| `openingOnLine` (siege memory) | no (layer 0 always) | edges of layer 0 | `visibility.js:56-84` |
| Player's visible set | no (cast on viewer's layer) | layer-L rays, keys with no layer | `main.js:1343`, `visibility.js:109` |
| Fog and who is drawn | partly (wrongly) | the viewer's one layer-blind set, applied to every layer drawn | `render/area.js:193-207`, `scene.js:226-313`, `entities.js:204` |
| The map's chart | no (layer 0) | `tileVisible` with no layer | `chart.js:145` |
| The dead's sight of players | partly | same layer, or both near one stair or ramp (`layersMeet`); range by layer-0 light | `zombie.js:378-406` |
| The dead's sight of flames, the pull | no | same layer | `zombie.js:477`, `:611` |
| Player's sight in the dark (`seenAlpha`) | partly (layer-blind) | layer-0 light at the dead one, own torch radius by 2D distance | `sight.js:19-29` |
| Light (world) | no | each layer's own sources and rooms | `light.js:53-121`, `:366-368`, `:474-486` |
| Light (drawn) | partly | ground set, one storey's set, any other storey as open air | `scene.js:242`, `:264`; `gl.js:362-363` |
| A flight's targets | no | bodies on the shooter's layer | `archery.js:136`, `:396` |
| A flight's obstacles | no (layer 0 always) | layer-0 walls by height, layer-0 props | `archery.js:207-258`, `:416-430` |
| A flight's landing | no | drops on the shooter's layer, void included | `archery.js:369`; `map.js:877-898` |
| Bow aim upstairs | partly (wrongly) | cursor and chest on the ground plane, unlifted | `archery.js:957-963`; `entities/player.js:97-100` |
| Melee and the shove | no | same layer, `lineOfReach`, rise ignored | `combat.js:200`, `:468-491` |
| The dead's bites | no | same layer, `lineOfReach` | `zombie.js:328-337`, `:1111` |
| Boar's bite | yes (layer-blind) | `lineOfReach` with no layer | `animal.js:383`; `game.js:461` |
| Reach, E, the menu, picking | no | same layer, distance, line of sight | `reach.js:27-31`; `interact.js:1284-1380`, `:2207` |
| Paths, the stair-first rule | yes (by stairs and ramps) | 3D goal, one storey a leg | `entities/movement.js:39-76` |
| Breach and siege | partly (mixed) | room on its layer; stands, `here`, and remembered openings partly on layer 0 | `zombie.js:247-277`, `:541-568`, `:820` |
| Villagers' fear, animals' flight | yes (layer-blind) | `lineOfSight` with no layer, threats of any layer | `villager.js:92-102`; `animal.js:205-222` |
| Sound cues | yes (layer-blind) | 2D distance, layer-0 floors and openings | `sound-cues.js:110`, `:163-167`, `:337-359` |
| Hiding rule and storey fade | no (index only) | the authored building index | `render/storeys.js:38-57`, `:100-106` |

---

## Michael's three-storey castle

The scenario: with Free building on, an intricate three-storey stone castle with round towers, wall walks with battlements, gates, and stairs, on a bluff of cliff walls and cliff tops with a ramp; he stands on the walk with a bow against the dead at the gate below; a friend joins as a guest.

How it maps to layers: the bluff's cliff walls are layer-0 edges and its top is floor on layer 1 (cliff tops), reached by the stone ramp (a stair of `ramp_stone`, landing on layer 1). A castle built **on** the bluff has its ground floor on layer 1, its curtain walls on layer 1 edges, its walk on layer 2 with battlements on layer 2's outer edges, tower tops on layer 3 or 4. A castle built **at the foot** has its gate on layer 0 and its walk on layer 1. Either way the archer is one or two storeys above the dead at the gate.

**What works**
- Building all of it: walls, rings, gates over plain stone, battlements on a walk's outer edge, stairs, floors grown tile by tile, cliffs, cliff tops, the ramp, all by the commands a guest sends (`placement.performPlacement`; `check("battlements")`, `check("gates")`, `check.js:6679`, `:6783`).
- Walking it: stairs and the ramp are walked by player, guest, and the dead (`map.stairStep`; the guest predicts the crossing, docs/49 section 13). A floor's open edge and the stairwell's sides stop a body; nothing falls (`map.js:3222`).
- The gate as a gate, on the ground with him behind it: the dead see him through the shut portcullis (`map.js:2768`), cannot break it (`gateHolds`, `map.js:1825`), cannot bite or be struck through it (`zombie.js:331`; `combat.js:200`), and his arrows pass it under the crown (`archery.js:197-199`, `map.js:1838-1841`). That fight works on one layer (`check("gates")` rows at `gates.js:303-367`).
- The battlement stops a body at its line and bounds no room (`check("battlements")`).
- Light on the walk is the night's: moonlight the same as the ground (`light.js:139-141`), his torch lights his own walk (`light.js:480`).

**What silently does nothing**
- **His arrows cannot hit anything below.** A flight is on his layer and `bodyAt` skips every body on another (`archery.js:136`, `:396`). No message, no refusal.
- **The dead at the gate never see him** on the walk or the bluff (`zombie.js:385`, `:394-406`), so they never gather under him, never batter for him, never take the ramp for him. They see him only when both are near one stair or ramp (the ramp itself is such a stair, so a dead one at its foot sees a player at its top).
- **Sight-pull does not reach him;** nothing he does upstairs pulls anyone.
- **Battlements never stop or pass a shot in play:** flights never read layer 1+ walls (`archery.js:209-213`). "Passes above 28" is real only in `check("battlements")`'s direct call (`battlements.js:200`).
- **A door, shutter, or gate on any storey never creaks** (`sound-cues.js:345`); footsteps on the walk use the ground's floor sound under it (`:164`).
- **The hiding rule and the storey fade never apply to his castle:** the index is the map file's alone (`map.js:4010`; `render/storeys.js:49`, `:106`).

**What is wrong (the code disagrees with itself)**
- **Every shot from a walk over a wall stops at his feet.** The flight's scan reads layer 0 (`archery.js:209-213`, `map.js:2742`): the stone wall under the walk's outer edge is 96 high, the arrow crosses it at about 30 to 45, so `stopD` is set before the edge and the arrow drops on the walk at the parapet. On the bluff, the layer-0 cliff wall at the rim stops a shot from the castle the same way unless it is over 96 there.
- **A shot that does clear lands on the void** of his layer at the aim point (`archery.js:369` with `map.js:886`): an arrow or a thrown axe hanging a storey up over the yard, unwalkable, unreachable from the ground ("That is on another floor."), and reachable from the walk only within 1.15 tiles of its edge.
- **His aim upstairs is off.** `aimPoint` and `aimOrigin` ignore the storey (`archery.js:961`; `entities/player.js:97-100`; placement does lift, `placement.js:250`). Aiming at the ground reads the right ground point by accident; aiming at anything on his own walk or bluff reads a point 3 tiles per storey toward the camera, and his facing and swing direction are taken from a chest 96 px per storey below the drawn one (inferred, not watched).
- **He sees through the ground's walls from up high and is unseen from below.** His visible set is cast on his layer and applied to the ground (`main.js:1343`, `render/area.js:193-207`): from the walk he is drawn the dead inside closed rooms of the ground. Meanwhile the dead cannot see him (above). The opposite of "if you can see it, it can see you" (docs/07).
- **The friend on the ground cannot see him on the walk or the bluff top** (the host's or the guest's rays on layer 0 stop at the wall box or the cliff under him; `entities.js:204`); the friend on the walk sees the one below. Each client is wrong in its own direction.
- **A third storey's lights are drawn as open air** (`scene.js:242`, `:264`): with the camera on the ground or on storey 1, a torch-lit tower room on storey 2 or 3 shows no pools and no lit glow at night.
- **Inside his own keep's ground floor his body is hidden under his own first floor** (no index, so no hiding rule; the floor writes depth: `storeys.js` check row at `:112`).
- **A torch on an upper wall** is accepted only where a hangable ground wall stands on the same edge (`setdown.js:246-249`, `:263-270`; inferred).
- **A siege on an upstairs room** would remember ground openings tagged as upstairs (`zombie.js:565-566`), and `wayIn` tests stands on the wrong layer (`:265`, `:270`). Unreached in his scenario because nothing sees him.
- **Deer and villagers react to him through the floor;** a boar he struck can bite him on a landing above it (`animal.js:205-222`, `:383`; `villager.js:92-102`).

**What would surprise him, in the order he would meet it**
1. He builds the castle; the walk's floor and the yard beyond the wall box are fogged and empty of his friend's figure from the ground.
2. He climbs; now he is drawn the whole yard, the dead in it, and the dead inside the castle's own ground rooms.
3. He draws on the dead at the gate; the marker lands right; the arrow drops at the battlement. A longer, higher shot flies, lands at the target's feet, and nothing happens; the arrow hangs in the air a storey up.
4. The dead never look up. Sniping is free of danger and also useless.
5. His friend (the guest) sees and gets the same, decided by the host; the flights are drawn on the walk's layer (`scene.js:313`).
6. At the ramp's top, the dead at its foot see him and come up; at the stair's landing, one on the top step and he cannot touch each other until it steps over.

**The smallest coherent model of height.** Give every crossing one shared unit, world pixels above the ground, and two functions that use it. (1) **An occluder's band:** a wall on layer L occupies `[96 L, 96 L + wall.height]` (so a battlement on layer 1 is 96 to 124, a cliff face on layer 0 is 0 to 96, a gate passes 96 L to 96 L + 78), an opening passes its own `[sill, top] + 96 L`, a floored tile on layer L is a plane at `96 L` (a hole and the void are not), an opaque prop or a trunk `[96 L, 96 L + h]`. (2) **A segment with heights:** the flight already is one, `z(u)`, if its `z0` and its landing are made absolute (`96 L_shooter + rise + z0` to `96 L_target`) and `edgeStops` reads each wall on the layer whose band contains `z` at that crossing (today it reads only layer 0 with a relative `z`, `archery.js:209-213`); a sight ray is the same walk with a straight `z` from eye (`96 L + rise + 40`) to target middle. The code is close: `scanPath` is the walk, `wallStops` is the opening-band test, `map.STOREY` and `rise` are on every body, and `wallBetween`, `tileAt`, and `bodyAt` already take a layer; what is missing is a per-crossing layer from the band (at most two layers to consult per crossing for one storey's drop, plus the floor plane between them) and one function used by the flight, the player's visible set, and `canSee`, replacing `layersMeet`, so the visible set's keys and the fog gain a layer. Built that way, the battlement's 28 and the gate's 78 become reachable, the dead see him when he sees them, the arrow lands on the ground where he aimed (the aim must be read on the target's floor, as placement already lifts), and a hit's `lastSeen` must name the archer's layer so the stair-first rule, not "stand under him", decides where they go. That is docs/49 steps 4 and 5 as written; the code as it stands has the walk and the heights, and is missing only the absolute frame and the per-crossing layer.
