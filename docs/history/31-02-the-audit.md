> **Record.** `docs/31-multiplayer/02-the-audit.md` as it stood, moved here whole by the sweep, 2026-10-16 (#70, #78); never edited again.
> The live text is `docs/31-multiplayer/` (`03`, `04`, `05`, `08`, `09`: the game with friends as built) and the rulings `docs/02-decisions.md`; the rest of this folder's record is `31-multiplayer-record.md` beside this file.

# 31.02 — The audit: what is built, read against the free rules

**Status, 2026-10-13: history.** A reading of the code at `ac2f63f`, before any of the plan was built; its file:line and its counts are that commit's, and nearly every finding has since been fixed (`05` marks each item with its move). Do not read it as the state of the code. In particular: growth by reading (section 4) is gone; props, entries, and characters have ids from the world's counter (5); the singletons of section 2 are on the player or the client's own, the renderer's writes on shared objects (`behindProp`, `swingTarget`, the speech line's aging) excepted; a save exists (11, `src/save.js`); a screen pauses only a world played alone and hit-stop is refused on the wire (9); the loop is still on `requestAnimationFrame` (9).

Three surveys of `src/` on 2026-10-13 (the singletons, the world-mutation surface, the client's coupling), condensed. Lines are of the code at `ac2f63f`; they drift, the names do not. The frame is `05-someday.md`'s free rules, with two the surveys found missing from that list (ids on things that do not move; growth driven by the view).

## 1. What is ready

- **The loop is a fixed step** (`loop.js:4` `STEP = 1/60`, a 0.1 s catch-up clamp at `:8`), with `simTime()` (`:95`) and `pauseCount()` (`:99`), and `advance(seconds)` (`:110`) that steps synchronously. A tick number is `simTime / STEP`.
- **The sim rolls only through `rng.js`** (sfc32, seeded at `main.js:671` from `json.seed ?? 1`; the map file has no `seed` key, so it is 1). Every roll in `zombie.js`, `movement.js`, `combat.js`, `archery.js`, `items.js`, `bleed.js`, `infection.js` goes through it. `fire.js:32-51` uses `Math.random` for embers and smoke, visual by design. No `Date.now` anywhere; `performance.now` only in profiling, the ground bake's stats, and the wheel's pacing (`main.js:329`, view).
- **The rules are a snapshot** (`rules.js`: five booleans, refreshed at the top of each step, `main.js:317`). No file under `entities/`, nor `combat.js` or `placement.js`, imports settings.
- **The controller takes a snapshot** (`player-controller.js:13` `controlPlayer(player, zombies, dt, s)`; `s` built at `main.js:391-401` from `input` and `buttons`: `clicked, clickSpent, mouse, leftDown, altPressed, altDown, offDown, space, blocked`).
- **One character model with ids** (`entities/character.js:17-51`; the dead `z<n>` from a module counter `zombie.js:34-38`, villagers `v<i>` from the map's index `main.js:678`, the player the literal `"player"` at `player.js:18`). Corpses and sleepers keep theirs.
- **The sim takes the player as an argument everywhere.** No sim module imports a global player; the closures over `main.js`'s `player` are the inventory handlers (`:741`), the hair setter (`:757`), the `playerHit`, `blocked`, `guardBroken` listeners (`:774-792`), `nearPlayer` (`:571`), and `renderUi` (`:488`). In `combat.js`, `bleed.js`, `infection.js`, `moodles.js`, `inventory.js` the word is the parameter's name and the logic is per actor.
- **The world's growth is deterministic**: the wild, scatter, and forage are position-keyed by `hash2` (`map.js:185-190`); an evicted wild chunk grows back the same (`evictFar`, `sleep`, `takeWoken`, `map.js:640-674`).
- **The map's mutation surface is small.** Fires `burnFires`, `feedFire` (`map.js:70, 84`); torches `addBracket`, `setHolder` (`:105, :149`); floor items `dropItem`, `takeItem` (`:303, :317`); props `placeProp`, `removeProp` (`:336, :347`); floors `setFloor` (`:368`, "the only way a floor changes after load"); walls `buildWall`, `destroyWall` (`:430, :443`); openings `addBoard`, `pullBoard`, `damageOpening` (`:481, :490, :500`); bookkeeping `touch`, `markDirty`, rooms refound locally (`:591, :614, :1150`). Rooms are derived, never stored.
- **The figure is deterministic from data.** `figure/*` has no random, no clock; `characterInputs` (`figure/wardrobe.js:75-93`) is plain data (variant, look, each worn slot's garment art dyed, two holding booleans, wardrobe index, wound, `noCarry`, painted overrides, style). Any client can bake any player's sheet from that. About 30 ms a sheet.
- **The light's world part is deterministic from the map and the sources** (`light.js:316-380`, a per-chunk cache keyed by `lightVersion` and the sources that reach it), so a replica rebuilds it locally and nothing about light travels but the sources.
- **The log is already a list of lines** (`ui/log.js:44-57`), and `say(ch, text, seconds)` is data on the character (`character.js`).
- **The event bus names thirteen events** (`events.js:3-4`): `arrowShot, arrowLanded, blocked, containerOpened, gameOver, guardBroken, meleeHit, meleeSwing, playerHit, shove, villagerDied, villagerHit, zombieDied`. A start on the event vocabulary a replica needs.
- **A cross-tab channel exists** (`BroadcastChannel("cmz")`, `main.js:803-813`, the sprite tool's reload). The two-tab loopback of `04` is the same mechanism with a different message.
- **Headless already, in part**: `tools/check.js` imports `rng`, `clock`, `bleed`, `infection`, `items`, `pathfind` under plain Node; `23a` H names what blocks the rest (`document` in `assets.js`, the pixel pick at `interact.js:957`, now `~:974-1059`).

## 2. The singletons that mean "the one player" (free rule: the player passed, never reached for; per-player state on the player)

Module-level state that would have to become a field on a player, or an object per player, listed with its home. This is `23a` D8's list, verified, with four more.

- **`archery.js`**: `draw`, `recover`, `aimOverride` (`:394-396`), `marker` (`:289`); `drawState()` takes no player (`:402`) and `main.js:103, :286` read it. One bow can be drawn in the world at a time.
- **`combat.js`**: `time` (the combo clock) and `fx` (`:69-70`); `tryAttack` writes `fx.wedge` (`:307`); `kick()` reaches `camera.kick` (`:248`).
- **`placement.js`**: `export const state = { active, kind, prop, build, ghost }` (`:31`): one build mode, one ghost, one carried-prop turn (`:240-247`).
- **`use.js`**: `current` (`:15`) and a DOM label.
- **`interact.js`**: `keyE`, `keyB` (`:666-667`), the tap-or-hold trackers for one keyboard; `showMessage` called from sim paths (`:62, :144, :403, :426, :441` and more; also `placement.js:416-468`, `archery.js:462, :489`).
- **`buttons.js`**: `alt`, `off`, `rightWas` (`:12-21`): one mouse. Right: a client-side concern (the tap-versus-hold count stays on the client), but the sim reads it.
- **`light.js`**: `carrier` (`:41`), one slot; `setCarrier` overwrites (`:157`); `carriers()` already returns a list (`:173`) and `lightAt` sums it (`:407-419`), so the renderer and the dead's sight scaling would take a list as they are; `allSources()` appends the one carrier as `{carried: true}` (`:179-182`), and `zombie.js:389` maps any carried flame to **the player's** position: a zombie seeing player B's torch would walk to player A.
- **`camera.js`**: `cam`, `jolt` (`:6, :15`); **`iso.js`**: `originX/Y` (`:9-10`) set by `camera.applyOrigin` (`camera.js:32`). Every screen-to-grid conversion in the sim goes through the one origin: `interact.actionsAt` (`:514`), `interactableAt` (`:975`), `placement.propGhost`, `buildGhost`, `removalTarget` (`:388, :402, :307`), `archery.aimPoint` (`:431`), `player.aimOrigin` (`player.js:77`). Screen space inside the sim is the one place the single perspective is structural rather than a variable: a command from a wire must carry world coordinates.
- **`main.js`**: `player` (`:77`), `visible`, `tiles`, `playerRoom`, `visKey` (`:83-88`), `openBag`, `corpseWatch` (`:89-90`), `progress` (`:91`), `drawAll` (`:86`), `squareTiles` (`:469`), `figureKey`/`figureQuick` (`:282-283`); `others` and `everyone` rebuilt per step (`:403-404`); `nearPlayer` (`:571`) gates who thinks; `containerOpened` sets the one `openBag` with no opener in the event (`:794-797`); `playerHit` carries no victim (`zombie.js:572` emits `{ zombie, damage }`, `main.js:774` applies it to its own `player`).
- **The sheet id `"player"`** (`player.js:19`), replaced in place by `assets.replaceSheet("player", ...)` (`main.js:295`), read by the HUD's portrait (`ui/hud.js:68`) and the zombie bars' pool key (`ui/zombie-bars.js:68`). Also **`kind === "player"` meaning "me"**: the occlusion hole (`render/scene.js:101-121`), the always-drawn exemption (`render/entities.js:184`: a second player would show through walls), the speech bubble always shown (`ui/speech.js:64`).

## 3. The dead target "the player" (free rule: the player passed, never reached for)

`updateZombie(z, dt, player, others, villagers)` (`zombie.js:323`): `canSee(z, player)` (`:363`); only when the player is out of sight and the setting is on, the nearest villager (`:371-382`, "the dead always prefer the player"); the fallback target is the player (`:403`); a spawned-aggro zombie heads for the player (`:404`). Field names say one: `lastSeen` "where the player was last seen" (`:41`), `sincePlayer` (`:56`), `hits` "when the player's blows landed" (`:58`). `nearPlayer` (`main.js:571-573`) is a Chebyshev box of `tuning.world.activeTiles` (40) round one point. The shape is right (`target`, `lastSeen`, memory, search, give up); the input is one person. `19` already said the list becomes `[player, ...villagers]`; with more players it is `[...players, ...villagers]` with players preferred, and the box becomes a union.

## 4. Growth and eviction are driven by one point, and by the view (a rule `05` did not list)

- `map.ensureAround(player.gx, player.gy, 3)` each step (`main.js:345`; 4 at boot, `:683`); `map.evictFar(player..., 8)` (`:353`); pending wild spawns drained each step (`:346`).
- **Any `tileAt` on an unloaded chunk grows it** (`map.js:747-752`, `getChunk(cx, cy, create = true)` at `:692`), and a wild chunk's growth queues its dead (`:728-737`) and, at `createZombie`, consumes the rng (`zombie.js:46, :48, :67`). Callers that are not the sim: the renderer (`render/walls.js`), the ground (`ground.js:305, :422, :573`), the light (`light.js:54, :221`), `visibility.lineOfSight` (`visibility.js:40`), `archery.scanPath`, `placement.canPutDown`, `removalTarget`. The hit tests were fixed to `peekTile` (`23a` A4); the rest were not. **So which chunks exist, in what order the dead are made, and where the rng sequence stands depend on the window size and the zoom.** On a server with no renderer the world would diverge from a browser host's at the first wild chunk. The determinism check passes today because both boots have the same window.

## 5. Nothing but characters has an id (a rule `05` listed for "everything that moves"; it needs to be everything that can be named)

- **Props**: `createProp` (`map.js:1213-1237`) makes `{kind, sprite, tile, footprint, tiles, solid, opaque, radius, fire, container, bag, searched, wood, water, offset, interactable, facing}` with no id; referenced by object identity in `tile.prop` on every footprint tile, `fireProps`, `player.carrying`, `placement.state.prop`, removal targets, and every action closure (`treeActions`, `interact.js:391`). The anchor tile is the only handle and it changes when a prop is carried.
- **Walls** (`createWall`, `map.js:455-463`): `{kind, sprite, open, shutter, boards, hp, broken, built, at, bracket}`; identity in closures, `zombie.breach.wall`, removal targets. `wall.at` names the tile (`:714`), so `(x, y, edge)` is a usable address already.
- **Item entries** are plain objects `{ id: <type>, count, fill?, x, y, rot, bag?, slots?, at?, angle? }` with **no instance id**, and identity is not stable: `map.dropItem` stores a copy (`map.js:309`); `grid.add` makes new entries (`grid.js:79`); `grid.insert`/`transfer` merge stacks and leave the source at count 0 (`:89-93, :138-142`); a thrown item is copied at release and at landing (`archery.js:493, :259`); a torch taken from a holder is a fresh `{id: "torch", count: 1}` (`interact.js:291`). A two-handed item is the same object in both hands (`items.js:122-124`). A container's contents live inside the entry (`entry.bag`, `entry.slots`). "Everything is a slot, nothing is a pointer" (`11`) is the right rule for the player; for the wire a move needs to name its entry.
- **Floor items** are a list on the tile (`tile.items`), by identity.
- **Characters' ids are not stable across machines**: `z<nextId++>` is a module counter never reset and never saved, so two processes that grow chunks in a different order name the dead differently; `"player"` collides with a second player.

## 6. World changes outside the fixed step (free rule: every world change through a mutator or an event)

Changes that run inside DOM handlers, between steps:

- **Context-menu entries** run `onSelect` from the click (`ui/context-menu.js:19-25`): the world menu's `interact.runAction(player, a)` (`main.js:126`) performs a zero-duration action at once (open a door, pick up); every item and slot menu entry (`interact.js:812-944`: Use, Equip, Wear, bandage `entry.count -= 1`, Eat, Drink, Split, Store, Take, Drop, Take off, Unequip).
- **The inventory panel**: `pointerup` (`ui/inventory-panel.js:565-591`: `grid.moveEntry`, `placeInSlot`, `placeInGrid`, `dropToFloor`), double-click (`:75-89`), Tidy (`:109`), Rotate writes `hit.entry.rot` (`:630-632`), `quickMove` (`:611`).
- **The settings screen**: `squareSurface` calls `map.setFloor` from `settings.onChange` (`main.js:469-473, :697-699`).
- **Escape** on `window` keydown (`main.js:799-801`).

Changes that bypass the map's mutators:

- A door or shutter toggles by writing the wall (`interact.js:342-344`, then `map.touch()` with no tile, which marks no chunk dirty).
- A container's `bag` and `searched` (`interact.js:215-222, :237, :239`), a corpse's `searched` (`:1082`).
- The sway and animation stamps `pokedAt`, `playedAt` (`interact.js:1011, :1036, :1137`), read by `render/props.js:96-112` (a cosmetic that another client would want to see, so an event).
- A carried prop turned (`placement.js:240-247`); the removal tool spills a container by hand before `removeProp` (`:371-382`).
- The renderer writes `behindProp` onto sim entities (`render/scene.js:119`); `combat.markTargets` writes `z.swingTarget` (`combat.js:375-378`, per viewer); `ui/speech.js:58-61` ages `ch.line` in the UI.

## 7. The timed action (free rule: UI state apart from the world's)

An action is an object of closures made fresh for every menu or prompt (`interact.js:49-51`): `{kind, label, tiles, mx, my, range, duration, enabled, simple, perform(), onStart?, goal?}`. `startAction` (`:592`) runs it at once or sets `player.action = { action, elapsed: 0 }`; `updateAction` (`:605-619`) cancels on `player.moving` or distance, accumulates `elapsed`, calls `perform()` at `duration`. `runAction` (`:645`) auto-walks first, `onArrive` on `player.auto`. Not on the runner: the climb (`player.js:59-74`), the draw (`archery.js`). **Completion re-checks are partial**: Board checks planks and Build reruns `buildBlock`; Chop (`:399-405`) and Search do not check the target still exists, so two actors could fell one tree twice. The data an action needs to be a command is already there (verb, target tile, range, duration); what is missing is a target address instead of a closure and a re-validation at `perform`.

## 8. Settings: the world's and the viewer's (free rule: UI state apart from the world's)

- **Rules of the world** (the host's): the five in `rules.js` (`zombieAggro`, `zombiesAttackVillagers`, `multiHit`, `survival`, `freeBuilding`); `combatTesting` (read at load, `main.js:600, :632-635, :687`: no trees, forty more dead); `squareSurface` (rewrites floors: world data, also matched by `interactions.json` "tile"). Plus every data file: `tuning.json`, `combat.json`, `items.json`, `loot.json`, `build.json`, `wardrobes.json`, `interactions.json`, the map.
- **A player's, that must travel**: `hairStyle` and `paintedLayers` (`main.js:288, :291, :674, :758`): today the look is a local setting.
- **A viewer's, never sent**: `uiScale`, `worldScale`, `debugCorner`, `cursor`, `panelPos`, `logSize`, `swingTimer`, `showHitShapes`, `showSwingTargets` (computed in the step onto sim zombies, `main.js:464`), `aimGuide` (gates the sim's marker, `archery.js:532`); the keys V, L, Z, the wheel (handled inside the step, `main.js:318-335`); `[` and `]` move everyone's clock (`:337-338`, debug).

## 9. Time, pause, and the freeze (free rule: no feature that freezes the whole sim)

- The clock is sim state (`clock.js:27-29`, advanced only in the step; `DAY_LENGTH` 720 s; `setElapsed` "for loading a save", uncalled).
- **Hit-stop freezes the sim for everyone**: `loop.freeze` (`combat.js:135, :334, :358`; `loop.js:41-43`, the longest wins) stops stepping and counts down on wall-clock frames; frozen time is lost. The kick is `camera.kick` from sim code.
- **Any screen pauses** (`screens.initScreens({ onChange: (name) => setPaused(!!name) })`, `main.js:752`); the title at boot; Escape; the dead screen. The loop is on `requestAnimationFrame`, so **a hidden tab stops the world** (`loop.js:54`).
- No time scale exists; `30` adds one for sleep.

## 10. Death

`main.js:431-437`: `player.dead = true`, `gameOver` emitted (no listener), the dead screen, whose one button reloads the page (`ui/screens.js:191-197`, `main.js:754`). No body, no turning, no survivor. The pieces exist elsewhere: `turnVillager` (`villager.js:120-135`) makes a zombie in the villager's clothes with their hands and pockets; corpses are containers (`character.js:79-120`); the parent's `18-death-and-survivors.md` is the design `02` already took.

## 11. Saves and the server

- **No save exists.** `localStorage` holds settings only (`settings.js`, `"cmz.settings"`, "a save never carries these"); `sessionStorage` holds the checks' hashes. No module has a `serialize`.
- **`serve.py` is static**: files, cache headers by stamp, POST for the sprite and layer tools and a screenshot, an `Origin` check, no WebSocket, no game endpoint. At runtime the game only fetches.

## 12. What the determinism check proves, and what it does not

`tools/checks/determinism.js` pauses, advances 600 steps (each `advance` also renders, which can grow chunks), and hashes the clock, the player's position and hp, each zombie's `id, gx, gy, state, wardrobe, hp`, each villager's `id, gx, gy, state`, each corpse's `id, gx, gy`. **It does not hash** tiles, props, walls, openings, fires, floor items, containers, inventories, or the rng's state, and it runs with no input. It is a drift detector for the dead's walking; a replica check (`06`) needs the whole world hashed, with input, and across two processes.

## 13. The counts, for scale

- `player` by whole word: `interact.js` 229, `combat.js` 172, `entities/player.js` 150, `main.js` 132, `inventory.js` 63, `placement.js` 60, `archery.js` 45, `zombie.js` 31, `player-controller.js` 22, `bleed.js` 19, `moodles.js` 16, `infection.js` 15. UI and render: `ui/inventory-actions.js` 45, `ui/hud.js` 18, `ui/zombie-bars.js` 15, `ui/inventory-panel.js` 13, `ui/swing-timer.js` 11, `render/scene.js` 9. Most are a parameter's name; the structural ones are sections 2 to 6 above.
- `main.js` is 842 lines; `interact.js` 1153; `map.js` 1476; the sim files total about 6,000 of the 17,400 in `src/`.
- The atlas: 4096 square, one shelf packer, never freed; player sheets 1056 by 576 (three a row), the dead's and villagers' 768 by 576 (five a row); about two rows free today, so about six more player-sized sheets before a second page.
- The world at 1.0 (`29/08`): 256 by 256, about 110 rooms, 260 containers, about 120 authored dead plus the wild's, 14 villagers, 18 stations. A replica's interest region (an 80-tile box) holds a fraction of it.
