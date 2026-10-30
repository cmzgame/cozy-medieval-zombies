# Sheet D: the three-storey castle, built headless (the tester's report, saved by Primary from its hand-back)

Tested on the worktree `77-sweep-3c-82aa16`, detached at main `e3c771ed`, on 2026-10-29. Script: `castle.mjs` beside this file (`node castle.mjs`, about 2 s; `CMZ_REPO` overrides the repo path; `--hash-only` builds, runs 600 steps with one of the dead at the gate, prints the hash; `--roundtrip` builds, saves at step 300, restores, compares). It writes `castle-tables.md` (every command's row, the seconds by group, every probe's raw result) and `castle-results.json`.

## Ten-line summary
1. Nothing crashed: 392 commands (349 built or done) and 57 probes. The save restores into a fresh world with every `syncParts` part the same; the hash is deterministic, `b3507224`, in two fresh processes and after the save roundtrip.
2. Building it by hand takes 2346 s of bars, about 39 minutes, before any walking. At data prices (Free building waives them) about 1,000 stone.
3. Wrong: a shot from height is checked against the ground floor's walls (`src/archery.js` 209/213/240-241, `map.wallBetween` with no layer). Every shot from the wall walk, the layer-2 window, or the bluff stops 0.4 to 1.1 tiles out, against the wall the shooter stands on. The battlement is never consulted.
4. Wrong: a shot that does get out lands on the shooter's layer over the void (`src/archery.js` 369). The arrow lies unreachable on layer 1 at 259,230. No "Too high to aim from here" refusal exists.
5. Wrong: the dead pick the wrong stair (`src/entities/movement.js` 54-76, cost at 64, no check that the landing reaches the goal). With the keep shut, one at the gate hunting the player on the walk walked 35 tiles to the bluff's ramp, climbed onto the bluff, and went idle there.
6. Wrong: the Stone ramp builds on a storey (`src/placement.js` 480/264 have no layer check). On the keep's layer 3 it laid a cliff-top landing floating on layer 4 and three `wall_ramp_side` walls that can never be taken apart (`src/map.js` 3046/3052).
7. Wrong: a tower built in the natural order (stair, then upper floor, then upper ring) can never get its ring: "A stairwell is under it" (`src/map.js` 1689), and stairs never come up. The only way through is floor, ring, take up three tiles, then the stair.
8. Wrong: the ghost accepts a wall it cannot reach. `buildReason` checks distance only (`src/placement.js` 844-847), then `interact.updateAction` 1430 cancels the bar silently when the wall is out of sight (29 times in the first run).
9. Missing: the dead cannot see a player on the walk. Sight is one layer (`src/visibility.js` 12) and `layersMeet` only passes near a stair (`src/entities/zombie.js` 383-406). A fresh dead one under the player idled for 600 steps. They also never break in toward a stair (`src/entities/zombie.js` 505).
10. Missing: a player cannot put a torch upstairs ("Not upstairs yet", `src/placement.js` 1613). A storey's torch lights its own layer only, so the ground below stays 0.22 at midnight. E on the walk cannot work the gate below.

## How the script drives the world
- Boot like `tools/world.js`: `bootData`, `game.create` on `data/maps/flat.json`, Free building on, zombieAggro off while building.
- Every build and removal through `performPlacement` with `tools/check.js`'s command shapes; no `map.buildWall` shortcut.
- The player stood at a chosen tile and layer before each command; `interact.startAction` wrapped to record each bar's seconds; one `interact.updateAction(player, duration)` finishes the bar keeping its range, line-of-reach, and cancel rules; messages caught with `prompt.setMessageSink`.
- The player walked up the keep's stair and the ramp as a body does (`moveCircle` plus `stairStep`) and reached layer 1 both times.
- Layout: keep interior x 264..272, y 236..244; round tower 7 by 7 at 273,240 flush to the keep's east wall; wall walk a 1-wide stone corridor, row y 237 x 256..263 then column x 256 y 238..245, stone floor on layer 1, battlements on the outer edges; the 2-wide gate in the keep's north wall, the 3-wide in the curtain's outer wall under the walk; bluff x 286..297, y 236..243, ramp foot 291,246, a second 9 by 9 keep on its layer-1 top.

## Seconds by group (bars of what was built)
| Group | Commands | Built | Seconds |
|---|---|---|---|
| Keep, ground | 43 | 43 | 262 |
| Wall walk, ground | 35 | 35 | 202 |
| Tower, ground | 4 | 3 | 36 |
| Bluff | 41 | 41 | 212 |
| Keep, layer 1 | 44 | 39 | 364 |
| Wall walk, layer 1 | 21 | 21 | 16 |
| Tower, layer 1 | 7 | 6 | 62 |
| Keep, layer 2 | 43 | 38 | 360 |
| Tower, layer 2 | 6 | 6 | 62 |
| Keep, layer 3 | 37 | 37 | 293 |
| Bluff keep, layer 1 | 38 | 27 | 184 |
| Bluff keep, layer 2 | 37 | 37 | 293 |
| Total | | | 2346 s (39.1 min) |

By build id: `wall_stone` 232 x 6 s = 1392; `floor_stone` 422 tiles x 1 s = 422; `stair_stone` 6 x 30 s = 180; `wall_cliff_grass` 39 x 3 s = 117; `floor_cliff_grass` 95 x 1 s = 95; `round_stone` (7 wide) 3 x 28 s = 84; `door` 8 x 4 s = 32; `window` 8 x 3 s = 24; gates, ramp, 19 battlements instant by data.

## What the castle's build refused
| # | Command | Refusal |
|---|---|---|
| 79 | Tower centred on the keep's south-east corner | "A wall is in the way" (the keep's walls cross its tiles) |
| 129 | Tower stair 0 to 1 with floor over it | "A floor is over it" |
| 149/153 and the layer-2 pair | Keep wall at 273,239 w and 273,240 w, layers 1 and 2 | "Start it at a step of the round wall"; built when retried from the ring outward |
| 161-169 and the layer-2 set | Keep walls on edges the ring already took | "Already a wall" |
| 285-319 | The bluff keep's south row and two side edges, past the bluff's edge | "No floor there" |

## Probes
- Rooms (`map.rebuildRooms`, `roomAt`, `getRoom`, `roomSealed`): 10 rooms. Keep layer 0: 81 tiles, 8 openings, sealed. Tower layer 0: 37, 2, sealed. Walk corridor layer 0: 16, 4, sealed. Inside the bluff, layer 0: 95, 0 openings, sealed. Keep layer 1: 81, 4, sealed. Tower layer 1: 37, 1, sealed. Keep layer 2: 81, 3, sealed. Tower layer 2: 37, 1, sealed. Bluff keep layer 2: 81, 0, sealed. Keep layer 3: 81, 0, sealed. Outdoors: the bailey, the walk on layer 1, the bluff top, the bluff keep's layer 1 (its south side could not be walled).
- Line of sight (`lineOfSight(ax, ay, bx, by, layer = 0, blocks = blocksSight)`): walk over a plain wall (262,237) to the ground outside (262,232), either way: false on layer 0, true on layer 1. Walk over the gate (259,237) to the ground outside: true on layer 0 (the bars pass sight), true on layer 1. Layer-2 window tile, shutter open, to the ground outside: false on layer 0, true on layer 2. There is no cross-storey sight.
- Pathing (`findPath(start, goal, canStep, maxExpansions = 1500)`, `repath(e, goalTile)`): `map.canStep` through the shut gate false; from the gate to `addr(262,237,1)` with everything shut: 36 tiles to the ramp landing `[291,243,1]`; with the gate and all doors open: 22 tiles in through the gate, corridor, keep door, and keep stair to `[265,240,1]`; ramp foot to bluff top: 6 tiles; `findPath` on layer 1 alone, keep landing to walk: null (the walk door shut).
- One of the dead at the gate, the player on the walk, 600 steps (`createZombie(gate, { aggro })`, `loop.advance(1/60)`): spawned aggro, gate shut: chases east toward the ramp; the 4800-step run ends idle on the bluff top. Gate open: the same. Fresh (aggro false): idles and wanders under the player. Control, the player on the ground in the bailey: chases round the curtain toward him. No bite, siege, or press in any run.
- Bow (`beginDraw(player, launcherOf(player), "script")`, `draw.c = 1`, `releaseDraw(player, { aimAt })`, `archery.update` until `arrowLanded`): walk, north over a plain wall: stopped 0.5 tiles, `wall`, landed on the walk, layer 1. Walk, above the gate: not stopped, landed 259,230 layer 1, void. Walk, south into the bailey: stopped 0.4, `wall`, the walk. Layer-2 window, shutter open: stopped 0.4, `wall`, layer 2. Bluff top, north: stopped 1.1, `wall` (the cliff), layer 1. Control on the ground: not stopped, 7 tiles out, layer 0.
- Light at midnight (`light.update()`, `light.lightAt(x, y, L)`): torches on the keep's layer-1 walls by a player: refused, "Not upstairs yet". Control, a torch on a ground wall: done, the ground in front from 0.22 to 1. A bracket put directly on the layer-1 south wall (not a player's path): the ground below stayed 0.22, the layer-1 tile over it read 1.
- Save: `serialize`, a fresh `create`, `restore`, `syncParts`: no part differs. 92 KB; serialize 5 ms, restore 13 ms. Stairs 7/7, rings 3/3, gates 2 and 3 edges.
- Chunk records (`JSON.stringify(serializeChunk(...)).length`, the castle's chunks): layer 0 23,892 bytes (largest chunk 17,15 at 6.7 KB); layer 1 23,393 (7.5 KB); layer 2 20,909 (7.7 KB); layer 3 7,957.
- Determinism: `--hash-only` twice `b3507224`; `--roundtrip` `b3507224` / `b3507224`.

## Edge cases
| What a player might try | Result |
|---|---|
| Layer-2 floor where layer 1 has none, out of an opened window | built, 6 of 6 |
| Stair landing on a tower stepped tile, from outside | "A wall is in the way" (the ring wall is at its head) |
| Stair landing on a curve-crossed tile | "A round wall is over it" |
| Battlement on the ground | "It needs a wall walk to stand on" |
| Gate on a storey, void outside | "No room" |
| Gate on a storey, floor both sides (the bluff) | built; opens from layer 1 |
| Ring on layer 3 over the landing | "Not across a stair's top" |
| Ring on layer 3 over the stairwell | "A wall is in the way" |
| Ring on layer 3, clear | built |
| Cliff top over a storey floor | built |
| Ramp on a storey | built (Wrong 4) |
| Take up a layer-1 floor under a layer-2 floor | done |
| Remove a stair | command not taken (no stair target) |
| Take up a stair's landing | "That floor is not one you laid" |
| Take up the floor at a stair's foot | "A wall stands on it" |
| Wall on layer 1 with no floor | "No floor there" |
| Door upstairs with void outside | "No room" |
| Window on a battlement | "Not in a battlement" |
| Torch on a cliff | "Not on a cliff" |
| Roof over the tower, from inside the layer-3 walls | "A wall is in the way" |
| The same roof through an opened layer-3 window | built, 37 of 49 |
| E on the walk above the gate | nothing; from the ground the gate offers "Open gate" |
| Take apart a ramp's side wall | command not taken |
| Tower trap (stair, floor, ring) | ring refused, "A stairwell is under it" |

## Findings, ranked by how much they would surprise Michael
Crashes: none.

Wrong:
1. Shots from the walls hit the walls beneath them (`src/archery.js` `scanPath` 240, `edgeStops` 209/213 use layer-0 walls; 241 reads props without the flight's layer). Every outward shot from layer 1 or 2 stops against the ground floor's 96 px wall or cliff under the shooter; the battlement is never read. `docs/49` section 8 says otherwise; `tools/checks/battlements.js` only tests `archery.wallStops` directly.
2. A shot that gets out lands over the void (`src/archery.js` 369): an unreachable arrow on layer 1. No "Too high" refusal from layer 2.
3. The dead's stair-first path takes any stair (`src/entities/movement.js` 54-76, cost at 64), even one whose landing never joins the target's floor; they walk off to an unrelated hill and go idle.
4. The Stone ramp is allowed on storeys (`src/placement.js` 480/264): a `floor_cliff_top` on the layer above in mid-air and permanent `wall_ramp_side` walls (`src/map.js` 3046/3052). On a walk it would cut it for good. Cliff tops are also accepted on storey floors.
5. The tower order trap: stair, then floor, then ring is refused for good (`src/map.js` 1689; stairs never come up); floor, ring, then stair is refused "A floor is over it" (`src/map.js` 3012). Only "take up tiles, then stair" works, and the ring's floor rule is not checked again.
6. The silent bar cancel: walls, doors, windows, rings, and gates are accepted on distance alone (`src/placement.js` 844-847), and the bar is cancelled without a word when out of sight (`src/interact.js` 1430). Floors and stairs refuse up front.

Missing (some are later steps of `docs/49`):
7. No sight across storeys (`src/visibility.js` 12; `src/entities/zombie.js` 383-406, near a stair only). The wall walk is perfectly safe.
8. The dead never break in toward a stair (`src/entities/zombie.js` 505).
9. No player torches upstairs (`src/placement.js` 1613); a storey's light never reaches the ground (`docs/49` section 10's default).
10. The gate cannot be worked from the walk; reach is on one layer.

Smaller:
11. "Start it at a step of the round wall" depends on build order (`src/map.js` 1633); it fires twice per storey for a keep wall running into a ring built first.
12. The landing's take-apart wording is "That floor is not one you laid"; the "A stair stands on it" line (`src/map.js` 1134) is unreachable for built stairs.
13. "No room" is vague for a door or gate upstairs with void outside.
14. The inside of the bluff is a sealed 95-tile room with no openings.
15. Allowed by the rules, for the record: a gate on a storey with floor both sides; a balcony through a window; a floor taken up under another storey.

Slow: nothing. The 392 commands took 159 ms; 4800 steps with the castle and one of the dead 515 ms (about 0.11 ms a step); the save 92 KB, 5 ms.

## Not probed
The guest's side (no two tabs, relay, wire, or replica drawing; every command was the guest's own path). Anything drawn (storey fade, battlement art over the walk, rings on storeys, the floating arrow or landing). Free building off (costs and tools). Real walking time between builds. Other launchers from height (thrown knives and axes, spears, spells). Upstairs combat (the dead upstairs, battering upper windows or doors, sieges or sleep upstairs, villagers). Taking a castle apart. Crowds of the dead. Other maps (only flat, not the proving ground).
