# 23a — The code review: what the engine is, what is wrong with it, and the fixes in order

**Status, 2026-10-13: written 2026-10-12 from a whole-codebase read and a live profile (pillar 1 of `23-engine-upgrade.md`), and acted on the same night; the line numbers and counts below are the code of that day, not today's.** The checklist at the end, item by item: 1 done (`tools/profile.js`, `tools/validate-data.py`); 2 done (A3 by the shell, `src/boot.js`); 3 done (`src/rng.js`, `loop.simTime()`, `src/rules.js`, `node tools/check.js`); 4 done; 5 done (`corpses`, `map.evictFar` with sleepers); 6 done, keeping by measurement the panel's per-step `JSON.stringify` and `frameQuad`'s spread; 7 done: D1's `game.js` finished by the multiplayer work on 2026-10-13 (`31/05` item 17), D8's fields declared on 2026-10-12 and its singletons moved onto the player by the same work, with `placement.state` and `camera.cam` kept as the client's (`31/05` items 12 to 16); 8: D3 (`src/figure/`) and D5 (`src/render/`) done, **D2 (`actions/`) and D4 (`map/`) open**; 9 done. **B8 is open** (the pathfinder still allocates per search). Section J, the docs, was done as step 0 (`02`, 2026-10-12), except J18's optional `15` line; section I's one JSON style was ruled against (nothing in `data/` is reformatted, `02`). The open items (D2, D4, B8) and the D list that `31-multiplayer` cites are why this page stays.

The brief (`23`): a senior engineer reading a junior's month of work for the first time. The honest headline first: **the frame budget is not the problem.** The game runs at about 1 ms a frame with 67 dead in the world at the widest zoom. The problems are the kind that do not show in a frame time: one exception stops the game for good, several things grow without bound the longer you play, the simulation reads the wall clock and `Math.random` where the co-op rule says it must not, and `main.js` knows too much. Every one of those gets more expensive to fix with each feature added on top, which is why this pass comes now.

## The measured baseline (2026-10-12, the browser pane, 67 dead, 4 villagers, 22 ground chunks baked)

Numbers from `tools/profile.js` once it exists (step 2, item 0); until then from the script this review ran, which paused the loop, stepped it, and restored everything.

- **Middle zoom (1.8), 451 tiles, 92 drawables:** step 0.2 ms, sight 0.2 ms, render 0.3 ms; one step plus one render 0.58 ms.
- **Wide zoom (1.1), 990 tiles, 844 visible, 158 drawables:** step 0.5 ms, sight 0.6 ms, render 0.5 ms; one step plus one render 0.74 ms.
- **Worst step in three seconds: 18.2 ms, at a zoom change** (the ring of newly visible chunks baking: ground bakes are 7.5 ms median, 42.6 ms max, 0 at draw time).
- **Night, 5 sources:** render 0.7 ms. A world change (`map.touch()`) invalidates every chunk's light; the rebuild on the next frame cost 0.9 ms with 2 rooms and 5 sources. Cheap today, all-or-nothing by design (B4 below).
- **`rebuildRooms()`: 7.4 ms** over every loaded chunk, for 2 rooms. It runs on any wall change and on any new chunk with walls (B3).
- **Boot: 250 requests** (47 modules, 91 JSON, 111 PNG), DOMContentLoaded at 4.0 s, the last response at 15.5 s on a warm server; a cold pane has taken 15 to 45 s before `__game` existed. The whole of it is a dark canvas (pillar 2).
- **Atlas 42 percent** (1730 of 4096 rows). JS heap 26 MB.

What this says: about fifteen times headroom in the frame, so the ceiling Michael asked about ("as much as fits on a max-zoom canvas") is not a renderer problem. The ceilings that exist are the ones below, and they are about growth and robustness.

## A. Robustness: things that stop the game

**A1. One exception ends the game, silently.** `src/loop.js:54-79`: `frame()` reschedules `requestAnimationFrame` only on its last line, so a throw anywhere in `hooks.update` (through `step()`) or `hooks.render` leaves the loop unscheduled. The sim and the picture stop; the only sign is a console line. `input.endStep()` (`src/main.js:416`) is also skipped on a throw, so a held key or a wheel tick is re-applied on the next step if anything ever restarts the loop. *Fix:* reschedule first, run the hooks in `try`/`catch`, call `input.endStep()` in a `finally`, and on an exception stop the sim and show the crash on the shell's own screen (pillar 2 gives us one) with the message and a Reload. *Verify:* throw from the console inside a hook (`__game.events.on("gameOver", () => { throw new Error("x") })` then kill the player) and see the screen, not a frozen canvas.

**A2. No WebGL context-loss handling.** `src/gl.js` has `atlasWarned` and the atlas upload (`end()` at 454) but no `webglcontextlost` or `webglcontextrestored` listener. A GPU reset (a driver update, a laptop lid, another tab's crash) leaves a dead canvas. *Fix:* `preventDefault` on lost, stop rendering; on restored, `gl.init` again, re-upload the atlas canvas, re-upload every ground texture (`ground.js` keeps the images; `uploadGround` at 325), and let the area textures rebuild. *Verify:* `canvas.getContext("webgl2").getExtension("WEBGL_lose_context").loseContext()` from the console, then `restoreContext()`.

**A3. Boot fails with no stage and no file.** `src/main.js:893-896` prints `boot failed: Failed to load image` into the debug corner. Which image, and at which of boot's twenty awaits, is not said. Pillar 2 replaces boot; the review's point is only that a failure must name its stage and its file, and that a missing `combat.json` or `poses.json` already falls back with a warning (`main.js:672-682`) while a missing sprite is fatal. One rule for both, by the shell.

**A4. A click can create chunks.** `interact.interactableAt` (`src/interact.js:967-993`) probes a 10 by 10 tile box through `map.tileAt`, which grows a missing chunk on read (and queues its wild dead as pending spawns). Three callers run it per left click (`pokeAt`, `playAt`, `clickCharacterAt`, from `main.js:334-336`). Near the edge of the grown region a click is a world edit. It is a quiet breach of "nothing materialises in view". *Fix:* export a non-creating lookup from `map.js` (`peekTile` exists at module scope; export it as `tileIfLoaded`) and use it for every hit test. *Verify:* count chunks before and after clicking at the far edge of the view at wide zoom; equal.

**A5. The room id a zombie compares can be stale.** Reported by the code reviewer, not yet reproduced: `pickTargetAround` (`src/entities/zombie.js:395-398`) compares `tileAt(...).room === room` without `roomsIfDirty()`; only `roomAt` refinds. With a wall changed in the same step a search can compare an old id. *Fix:* use `map.roomAt`. Small; verify by reading, then by boarding a door while a zombie searches.

## B. Growth: things that get slower the longer you play

**B1. The dead are never removed.** `zombies` (`src/main.js:71`) only grows: `createZombie` from the map, from pending wild spawns every step (`main.js:302`), from turned villagers (`371`). A corpse is a container (docs/19) and must stay lootable, but today it also stays in every per-step pass: `burning.update` (`356`), `others` (`358`), `light.setBurners` (`393`), `updateSpeech` (`414`), `markTargets`, `updateZombieBars`, and `render`'s `entities` (`443`), and in every other zombie's `separate()` (`zombie.js:366-370`, O(active times all)). Roam for an hour and every pass is over every dead thing ever made. *Fix (a first slice of docs/03's records, which stays a milestone):* a corpse leaves the thinking list for a `corpses` list that is drawn and lootable and never iterated by AI; wild chunks evicted (B2) take their standing dead with them as a record on the chunk (`sleepers: [[x, y, wardrobe, hp]]`), re-created when the chunk is grown again. *Verify:* the debug corner's `zombies` count stays bounded on a long walk; corpses still open.

**B2. Chunks are never evicted.** `map.js`'s `chunks` only grows (no `chunks.delete` in `map.js`; `ground.js:858-865` evicts its own pictures, so the ground already has the pattern). Every full pass over `chunks.values()` (B3, the light cache's keys, any save later) is over every chunk ever walked. *Fix:* evict wild chunks beyond a ring (default 8 chunks from the player) that carry no change (`chunk.dirty`, set by every `set*` and by every placed or built thing); authored chunks and dirty chunks stay. The wild is deterministic by hash, so a regrown chunk is the same chunk. *Verify:* walk away and back; the forest is identical; the chunk count in the debug corner (add it) stays bounded.

**B3. Rooms are refound over the whole world.** `rebuildRooms` (`src/map.js:959-1020`) resets `room` on every tile of every loaded chunk and flood-fills everything, on any wall change and on any grown chunk that has walls. 7.4 ms today with 2 rooms and about 25 chunks; it scales with the chunks walked (B2 bounds that) and runs at the moment a player builds, which is when a hitch is felt. *Fix:* `rebuildRoomsAround(x, y, nx, ny)` for a changed edge: collect the two tiles' room ids (outdoors is 0), reset to `UNVISITED` only the tiles of those rooms, and refill from each of the two tiles; a fill that overflows `ROOM_MAX` or reaches an unloaded tile is outdoors, as now; the openings list comes along. A grown chunk fills only its own unvisited tiles. Keep `rebuildRooms()` for boot. *Verify:* the eight placement checks in `docs/13` and the three milestone-3 breach checks still pass; build a wall across the square and a room appears; remove it and the room goes.

**B4. The light cache is invalidated all at once.** `light.sigFor` (`src/light.js:287-294`) starts every chunk's signature with `map.worldVersion`, so one door, one chopped tree, one placed chair rebuilds the light map of every chunk a source reaches, each rebuild a `lightPath` ray per cell within every source's radius. Measured 0.9 ms with 5 sources today; the cost is sources times cells, so a village of hearths, brackets, and lit windows at night pays it on every door. `sigFor` also builds a string per chunk per call, and `lightAt` (`391`) calls it on every lookup (the dead's `canSee`, the debug line). *Fix:* a version per chunk, bumped by `map.touch(x, y)` for the touched chunk and every chunk within the largest current source radius of it (ceil to chunks, at least one); the signature uses the chunk's version; memoise the signature per chunk per (sources version, chunk version) so `lightAt` does no string work. Keep `worldVersion` for sight. *Verify:* the milestone 2 and 2b acceptance checks (the hearth's spill through the door and window, the shutter stopping it); then with 20 sources placed from the console, time a door toggle before and after.

**B5. Dead work in the light cache.** `light.build` (`src/light.js:336-351`) makes a `<canvas>` and an `ImageData` for every rebuilt chunk and returns it as `entry.canvas`. Nothing reads it (no consumer in `src/`); it is the old Canvas renderer's upload path (`docs/08`). *Fix:* delete it. *Verify:* night looks the same; `L` debug views unchanged.

**B6. The light area is composed on the CPU every frame, paused or not.** `render.js` fills `lightArea`, `ambientArea`, and `fogArea` (`ensureArea` at 61-71 sizes them: at wide zoom about 100 by 100 tiles of ambient and fog, four times that of light cells) and uploads three textures through `gl.uploadArea` (`gl.js:305`) on every `render()`, including the title screen and the pause. It is 0.3 to 0.5 ms today. *Fix:* compose the static part only when (camera chunk, sources version, world version, the sight key, `night.debug`) changes; add the flicker layers per frame only for flickering sources in view; skip the upload when nothing changed. *Verify:* render time on the pause screen drops to the draw alone; flames still flicker.

**B7. Per-step allocation that scales with the world.** `[player, ...zombies, ...villagers]` is spread five times in one step (`main.js:356, 358, 393, 414, 443`); `refreshFigure` (`258-270`) builds a `characterSpec` and its key every step to find out nothing changed; `renderInventoryPanel` runs `JSON.stringify` over the belt every step and over the bag, the worn slots, and the hands every step the panel is open (`src/ui/inventory-panel.js:199-217`); `frameQuad` spreads `{ ...opts, flip }` per quad (`render.js:91`); `renderScene` allocates its lists per frame; `events.emit` copies the listener set per emit (`events.js:19`). None is slow today. *Fix:* one `everyone` list per step; `refreshFigure` on change (equipment, look, a draw starting or ending) through a version counter on the player; version counters on the bag and the belt instead of stringified signatures; pass `flip` as an argument. *Verify:* the step time at wide zoom with the panel open does not rise with the bag's contents.

**B8. Pathfinding allocates per search.** `pathfind.findPath` (`src/pathfind.js:53`) allocates `Map`s and a node per push, up to 1500 expansions, bounded per zombie by the repath timer and the failure backoff. Fine until forty dead repath on one event (a flame at night). *Fix, low priority:* a reusable open heap and typed-array scores keyed by the numeric tile key. Only if B1 and B2 leave it the biggest spike in `tools/profile.js`.

## C. Determinism: the co-op rule, already slipping

The rule (CLAUDE.md, docs/05 "Co-op"): no randomness or wall-clock time inside the simulation. docs/05 counts 18 `Math.random` calls; there are 26 lines in `src/` today, and three of the newest files added one each. Every one makes a scripted test unrepeatable and a future lockstep impossible.

**C1. `Math.random` in the simulation**, every line: `src/entities/zombie.js:74, 76, 78` (timers at creation), `95` (the wardrobe), `172` (stagger), `379-380` (wander jitter), `395-396` (search target), `435, 452, 534, 678` (timers); `src/entities/villager.js:25`; `src/combat.js:159` (knockback chance), `318` (knockdown), `345` (the shove's knockdown); `src/archery.js:243` (the spear's break); `src/items.js:40, 54` (loot rolls); `src/bleed.js:56` and `src/infection.js:46` (as default arguments, which is the right shape, with the wrong default). Exempt as visual only: `src/fire.js:32, 48, 51` (embers and smoke), everything in `placeholders.js` and `figure.js` (seeded already, `docs/02` 2026-10-11). *Fix:* `src/rng.js`, one seeded generator (sfc32 or mulberry32; `float()`, `int(n)`, `range(a, b)`, `chance(p)`, `pick(list)`), seeded from the map file (`seed` in `square.json`, default 1) and advanced only by the sim; every call above goes through it; `bleed.onBite` and `infection.onBite` default their `roll` to it. The map's `hash2` stays for the wild (position-keyed is better than sequence-keyed there). *Verify:* `node --check`, then two boots with the same seed and the same scripted inputs produce the same `zombies` positions after 600 steps (`tools/check.js`, section H).

**C2. The wall clock in the simulation:** `src/archery.js:504-520` cancels a held draw when the gap between `updateDraw` calls exceeds 350 ms of `performance.now()`, so a long frame, a tab switch, a breakpoint, or `loop.advance` after a pause drops the draw (a real bug under test and a hidden one in play); `src/interact.js:998` and `1098` (poke and play cooldowns); `src/entities/villager.js:144` (the poke that speaks); `src/main.js:285` (the wheel's pace: input, allowed, but simpler on sim time too). `render.js` (`75, 634, 647, 663, 684, 900, 1047`) is animation and stays on the wall clock. *Fix:* `loop.simTime()` (seconds of sim run, advanced in `step()`), and the five sites above read it; the archery gap rule becomes "cancelled when the draw's own update was not called last step", which is what it was trying to say. *Verify:* draw the bow, `loop.setPaused(true)`, wait five seconds, unpause: the draw holds.

**C3. Settings read inside the simulation:** `src/entities/zombie.js:151, 268, 284, 302` (`zombieAggro`, `zombiesAttackVillagers`), `src/combat.js:150` (`multiHit`), `src/entities/player.js:113` (`survival`), `src/placement.js:110` (`freeBuilding`). These are rules of the world stored in one browser's localStorage, which is also why a test in the pane changes Michael's game (CLAUDE.md, quirks). *Fix:* `src/rules.js`: the sim's rules as one object, refreshed from settings once at the top of `update()` (a host would copy it to guests later), and the five sites read `rules.*`. The visual settings (`aimGuide` at `archery.js:532`, `showHitShapes`, `showSwingTargets`) stay as they are. *Verify:* grep finds `settings.get` nowhere under `entities/`, `combat.js`, or `placement.js`.

## D. Ownership: files that know too much

**D1. `main.js` (896 lines) holds game logic, not only wiring.** The player's combat controller (`329-356`: shield, bow, poke, swing, the alt mode, the walking multiplier) is a de facto `player-controller.js`. The inventory's business rules (`474-628`: `slotGet`, `slotSet`, `placeInSlot`, `panelHandlers`, every drag's legality) belong with `inventory.js`. The light carrier's choice (`387-392`), `refreshFigure` (`258-270`), the square's surface (`425-429`), and the console API (`818-890`, 70 lines) are each their own concern. *Fix:* `src/game.js` (the state and the step order, nothing else), `src/player-controller.js`, `src/ui/inventory-actions.js` (the handlers), `src/dev.js` (`window.__game`), `main.js` reduced to boot wiring. Each move is one commit that boots in the pane.

**D2. `interact.js` (1117 lines) holds every verb.** Doors and shutters, boards, the context-menu builders, the item menu, timed actions, pixel-picking, pokes, clicks on characters, the well's animation. *Fix:* `src/actions/` with one file per subject (`openings.js`, `items.js`, `containers.js`, `gatherables.js`, `characters.js`), `interact.js` the dispatcher and the timed-action runner, `src/pick.js` for the pixel hit tests (`940-993`).

**D3. `figure.js` (1298) is the rig, the drawing, the wardrobe, and the held-art generator.** Rule 4 of "Implementing from a spec" protects the rig's numbers; the split must not touch them. *Fix:* `src/figure/rig.js` (`BODY`, the poses, the projection), `src/figure/draw.js` (rasterising, outline, shading), `src/figure/wardrobe.js` (`characterSpec`, `specKey`, the wardrobes), `src/figure/held.js`. Moves only; `git diff --stat` on the numbers is zero.

**D4. `map.js` (1321) is chunks, walls, rooms, props, items on the floor, fires, authoring, scatter, and the wild.** *Fix:* `src/map/` with `chunks.js` (tiles, `tileAt`, growth, eviction), `walls.js` (edges, openings, the stack), `rooms.js`, `props.js` (props, floor items, fires), `author.js` (sets, features, scatter, wild). `map.js` re-exports, so callers do not change in the same commit.

**D5. `render.js` (1189) and `ground.js` (923).** `render.js` is the scene, the eight drawable builders, occlusion, the area composer, and the overlays. *Fix:* `src/render/` with `scene.js`, `walls.js`, `props.js`, `entities.js`, `area.js` (B6 lives here), `overlays.js`. `ground.js`'s seven bake phases are one file by design (docs/15) and stay.

**D6. `placeholders.js` (1270) is every generated picture.** Data-like code; leave it, and let pillar 3's "start from generated" retire it one sprite at a time.

**D7. Villagers import their walking from the zombie file.** `src/entities/villager.js` imports `separate`, `repath`, `followPath`, `faceToward` from `zombie.js`. *Fix:* `src/entities/movement.js` holds them; both import it.

**D8. State on the player by convention.** `attackCooldown`, `offCooldown`, `swingLock`, `exposedFor`, `blockFlash`, `flashBroken`, `offMemory`, `burnAcc`, `blocking`, `moveMult`, `drawing`, `auto`, `carrying`, `climb`: set from six modules, declared nowhere. *Fix:* `createPlayer` declares every field with its default and a one-line comment; a `combat` sub-object groups the swing state. Then the save system (the parent's, later) has a shape to serialise. **And the singletons that are really per-player state move onto the player too** (the co-op tiebreaker, `CLAUDE.md`, `05`'s free rules; Michael asked for this check on 2026-10-12): `archery`'s draw, marker, recover list, and aim override; `combat`'s `time` and `fx`; `light`'s one carrier (a list of carriers, one per player and burner); `placement.state`; `camera.cam`. Each is read through the player it belongs to, so a second player is a second object, not a second module. Done file by file as step 2 touches each, never as a pass of its own.

**D9. Three places for a number.** A module constant (`ACTIVE_TILES`, `CONTAINER_CLOSE_DIST` in `main.js`; the zombie's speeds and sight in `zombie.js`, still the parent's, `docs/02` question 19), a block on an item (`weapon`, `bow`, `thrown`, `shield`), and `data/combat.json`. The rule "combat numbers are data" is kept for combat; the dead's and the player's numbers are not data. *Fix:* `data/tuning.json` for the entity constants (speeds, sight, bite, radii, `ACTIVE_TILES`), loaded by the shell, so question 19 can be answered by editing a file.

## E. Duplication

- The idle timer `MIN + Math.random() * (MAX - MIN)` five times (`zombie.js:78, 435, 534, 678`; `villager.js:25`): one `idleTime(rng)`.
- The `ACTIVE_TILES` Chebyshev test three times (`main.js:362, 366, 468`): `nearPlayer(e)`.
- The weapon style chain in `refreshFigure` (`main.js:263`) repeats `combat.js`'s lookups: one `combat.styleOf(player)`.
- `slotParts` in `main.js:474` beside `inventory.js`'s own slot parsing: one.

## F. The interface inside the simulation step

`update()` (`main.js:408-415`) runs `updateInventoryUi`, `updateHud`, `updatePrompt`, `updateZombieBars`, `updateSwingTimer`, `updateSpeech`, and `updateMessage` at 60 Hz inside the sim, reading layout (`clientWidth`, `offsetWidth`) and writing styles, and not at all while paused, so a bubble or a bar sits wrong after a resize on the pause screen and the UI's cost is counted as the step's. *Fix:* `ui.update(dt)` called from `render()`, with the sim-driven timers (a bubble's life, the message's) ticked from `loop.simTime()` deltas so they still freeze with the sim. *Verify:* resize on the pause screen; the bars follow.

## G. Dead code and leftovers

- `loop.simTick` is wired to an empty function (`main.js:815`, `loop.js:81-88`): remove the coarse tick until something needs it.
- `events.js`'s header lists `playerMoved`, `noise`, `edgeChanged`; none is emitted. `events.clearAll` has no caller. Trim the header to the events that exist.
- `clock.setElapsed` "for loading a save": keep, it is right, but say the save is not built.
- B5's canvas.
- Copied-file headers: `loop.js` cites `docs/05-architecture.md`, a parent file; `assets.js:1` says what changed, which is the right form. Every header that says "unchanged" is checked against the parent in step 0 and corrected.

## H. Testability

There is no test directory, no `package.json`, and no CI; the only method is scripts in the pane against `window.__game`, which share the loop and the settings with Michael's play (CLAUDE.md, quirks). The pure modules run under plain Node today: `grid`, `inventory`, `pathfind`, `iso`, `clock`, `bleed`, `infection`, and `map` with `document` stubbed. What blocks a headless run of the core is C1 to C3 and `document.createElement` in `light.js` (B5 removes it), `assets.js`, and `interact.js:957` (the pixel pick). *Fix:* `tools/check.js`, run with `node tools/check.js`: the seeded RNG, a `sim.step(world, inputs, dt)` entry (D1 gives it), and checks for rooms (`docs/13`'s eight), damage math (`docs/14`'s numbers), loot rolls, pathing through a door, and determinism (C1's verify). The pane scripts that exist (`tools/checks/ground.js`) gather under `tools/checks/` and run from the console as `__game.check("ground")`. `tools/validate-data.py` (run with `python -I`) checks item ids in loot, wardrobes, and build; every `icon` and `held.image` and sprite PNG on disk; the pair rule (world picture and icon together, `docs/26`); and the manifest (pillar 2).

## I. Data, the server, and the tools (from the data review)

- `data/` is clean: every item id in `loot.json`, `wardrobes.json`, and `build.json` resolves; every referenced PNG exists; all JSON parses. Three orphans under `data/art/items/`: `fireball.png` (stored for `docs/24`, keep), `preview_bag_mock.png` and `preview_items_3x.png` (the design agent's previews, delete or move to `docs/art/`).
- Four of 32 items have drawn art (the book, the staff, the knife, the axe); the other 28 are generated placeholders. No item has only half a pair. `docs/26` has the list.
- Formatting is mixed (one-line records in `items.json` and `loot.json`, one-space indentation in the sprite defs and `build.json`): one style, chosen in step 0, applied by a script, so diffs stay readable.
- `serve.py` (`serve.py:27-78`): no path traversal (the save regex is strict, the screenshot name is `basename`d), but no `Origin` check (any page open in the browser can POST a hair file or a PNG to localhost), no cap on `Content-Length` (`41`, and `int()` throws on a bad header), no check that a screenshot body is a PNG. Pillar 2 touches this file for the manifest and the cache headers; fix these at the same time (`23`, step 1).
- `tools/`: `checks/ground.js` passes `node --check`; `layers.html`, `hair.html`, `template.html` fetch and save through paths `serve.py` allows. The six `data/layers/*/index.json` are empty (`styles: []`); nothing painted beyond `data/hair/purple.json`.
- Repo hygiene: 3.2 MB tracked, no large binaries, a clean tree. `.gitignore` could take `.claude/worktrees/`.

## J. The docs that disagree with the code (step 0 of `23`)

Found by checking every file, function, key, and number the docs name against `src/` and `data/`. Most numbers match (weapons, the dead's constants, board and door health, the zoom levels, the clock, the night tunables, build costs, the wardrobes, the villagers). What does not, in the order to fix it:

1. **`CLAUDE.md`.** "They flee, follow, stay, and die" states a plan as a fact (`villager.js` idles, wanders, talks; `docs/02` 2026-10-12 put fleeing on the backburner): say "will flee, follow, stay (`docs/04`, not built)". `data/held` is named as Michael's art and does not exist (the painted held slot is unbuilt, `docs/14`, TODO): replace with `data/art/items` (delivered art, `docs/26`, `27`). The code map omits `combat.js`, `main.js`, `loop.js`, `input.js`, `events.js`, `iso.js`, `clock.js`, `light.js`, `items.js`, `inventory.js`, `grid.js`, `moodles.js`, `settings.js`, `sprites.js`, `render-util.js`, `gl.js`, `view.js`, `figure.js`, every `ui/` file but three, and `tools/`; "the stamina bar" is `ui/hud.js`. Add `23a` to the docs list.
2. **`README.md`.** `C` opens the character screen, not the wall cutaway (`main.js:186-190`; `K` and the cutaway are retired); "Milestone 2 is lighting" is five milestones stale; the key list lacks Tab, N, X, Q, Z, B, 1 to 4.
3. **`docs/03`.** The records simulation (`:35, :43` on, `:67`: active radius two chunks, records hopping, alarm, lure, trickle, dematerialise) is not built; the code is a 40-tile box (`main.js:50, 362, 366`). Add a "not built; today" banner; `hearthLit` (`:67`) is `lit` on the fire definition (`map.js:1097`). `docs/04:15` rests on the same layer: note it.
4. **`docs/07`.** "How things are lit, as built" (`:18, :32-45`) describes the removed Canvas night layer (screen space, stencils, multiply), against CLAUDE.md's "nothing is lit in screen space" and `render.js:7-8`. Banner it as superseded by `08` and point at `render.js`'s header; `:5` cites `docs/14-lighting-reference.md`, a parent file.
5. **`docs/08`.** `:30` "Sheets are not atlased" (one atlas, `gl.js:1`); `:31` "floors emit one quad per tile" (one quad per chunk, `docs/15`); `:27` `render-canvas.js` and `G` as present (gone).
6. **`docs/13`.** `:32, :34` "wood wall", plank costs, `WALL_SPRITE_DEFAULT = "wall_wood"`, `BUILD_TIME` (log wall, 1 log, `wall_log`, `seconds` in `build.json`; `map.js:398`); `:138` `stone_wall` is defined nowhere. `docs/02:29-34` (planks 2, 3, 2; no tear-down) superseded by `docs/02:395` and not struck.
7. **`docs/21`.** `:39, :41` halberd 2.3 / 0.8 s / 8 and 3.0 / 1.1 s / 10 against `items.json` 2.2 / 0.95 / 12 and 2.9 / 1.3 / 15 (`:15` is right); the held picture 112 px against `size: 128`. `docs/02:100` repeats the old thrust numbers.
8. **`docs/14`.** `:119` shove knockback 1.6 (`combat.json` 0.53, ruled `docs/02:377`); `docs/02:24` "Shove's 1.6 is untouched" never struck. `:17` `generateHeldFromPixels` and `:106` `data/held` are plans: say so.
9. **`docs/11:28`** "A bag cannot go inside a bag" against the one container rule (`:47`, `docs/02` question 20).
10. **`docs/10:73`** acceptance item 5, left-click to walk, withdrawn at `:24`.
11. **`docs/19:3`** "nothing built yet" against its own Status; `:122, :166` name `LIVING_SKINS`, which does not exist.
12. **`docs/09:33`** "Planks are free until the inventory": they are items (`interact.js:358-369`).
13. **`docs/12`** describes an undergarment; `docs/02` (2026-10-12) rules none, for the redone characters. Say both: the generated figure still draws `under` (`figure.js:616, 690, 1181`) until the characters are redone, by design.
14. **`docs/05:30`** "only 18 `Math.random` calls": 26 (C1), and after step 2 none. `:28` and `docs/02:90` say infection takes "about two days"; `combat.json` says `days: 1.5`. Default: the docs follow the data and call it tunable (Michael may prefer the other way).
15. **`TODO.md`.** `:156` unticked approval under a done milestone; `:209` dual wielding, shield, bow unticked and all built; `:104` ticks the withdrawn 960 by 540; `:225` "moves to K". Tick or strike each.
16. **`docs/02`.** The five 2026-10-11 entries (`:7-:38`) sit above the 2026-10-12 block, against newest-first; questions 23, 24, 25, 29 are ruled and built but not struck; 29b precedes 29; question 12's text is stale (the marker is built, `infection.js`); question 11 (furniture solid) is answered in practice (props collide) and needs one line to close.
17. **`docs/23`** said `main.js` is 880 lines (896); rewritten with this review.
18. Low, optional: `docs/15:31, :109` "26 PNGs" (58 now; history); `docs/20`'s Status paragraph is a stack of history worth a current-state line at its top, as `21` has.

No violations found of: UI drawn into the canvas (no `fillText` in `src/`), scaled `drawImage` at display time, tile-parity on the ground plane, tile access outside `map.js` (only `chunkKey` in `ground.js`), weapons on villagers, the gatherables law (every mushroom, rock, crop, tree, and pumpkin sprite is `interactable`).

## The target tree (Q1a: a proposal to argue with)

```
src/
  main.js                 boot wiring only (the shell calls it)
  boot.js                 the staged loader (23, pillar 2)
  game.js                 the world's state and the step order
  loop.js  rng.js  rules.js  clock.js  settings.js  events.js  input.js  view.js  camera.js  iso.js
  player-controller.js    what the mouse and keys do to the player each step
  dev.js                  window.__game
  map/      chunks.js walls.js rooms.js props.js author.js   (map.js re-exports)
  entities/ character.js player.js zombie.js villager.js movement.js
  combat.js archery.js bleed.js infection.js fire.js placement.js pathfind.js visibility.js light.js
  actions/  openings.js items.js containers.js gatherables.js characters.js   (interact.js dispatches)
  pick.js                 pixel hit tests
  figure/   rig.js draw.js wardrobe.js held.js   (figure.js re-exports; the rig's numbers untouched)
  render/   scene.js walls.js props.js entities.js area.js overlays.js   (render.js re-exports)
  gl.js ground.js assets.js sprites.js placeholders.js items.js inventory.js grid.js moodles.js
  ui/       (as now) + inventory-actions.js + update.js (F)
tools/
  profile.js check.js checks/ validate-data.py manifest.py slice.html layers.html hair.html template.html
```

Re-exporting modules keep every caller working through each move, so a move is one commit that boots.

## The fixes, as the checklist for `23` step 2

In this order, each a small verified move (Q1b), each commit booting in the pane with the debug corner's numbers recorded before and after:

1. `tools/profile.js` (the script this review ran, made repeatable) and `tools/validate-data.py`.
2. A1, A2, A3's rule, A4, A5.
3. C2 (sim time), C1 (the RNG), C3 (rules). Then `tools/check.js` with the determinism check.
4. B5, B4, B6, B3.
5. B1, B2 (together: the chunk record carries its sleepers).
6. B7, E.
7. D1, D7, D8, D9, then F.
8. D2, D4, D3, D5 as separate moves, each optional once 1 to 7 are in: do the ones the sprite work (pillar 3) will touch first (`figure/`, `render/`), and leave the rest if they are not in the way.
9. G, I's small items.
