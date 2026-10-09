# TODO

Working checklist. A new session reads `CLAUDE.md`, then this file, then the doc a task links to. Keep the **Status** block current at the end of every session.

## Status

- **Current milestone:** 1, the probe, **passed** on 2026-10-09 (Michael: cohesive and spatially real like Zomboid; the window wedge is spooky how Zomboid it feels; one screen is a few huts or a square and that is plenty). Rulings in `docs/02`. Same day: translucent near walls, lighter fog, a stamina bar and a longer sprint, and the first re-themed dev art (`docs/06-art.md`): thick plank and brick walls, open windows, dull grass, dirt roads, a farm tile.
- **What exists:** a chunked map stored block by block with edge walls (`map.js`), rooms by flood fill, line of sight by grid traversal with corner sampling (`visibility.js`), a following camera over cached chunk floors (`camera.js`, `render.js`), four-walled buildings whose near walls go translucent when you are inside, doors and shuttered windows worked with `E` (`interact.js`), corner posts, fog over what you cannot see, the dead with memory of where they last saw you, a stamina bar, and a hand-written square (`data/maps/square.json`) with a cottage, a shed, a farm plot, three jack-o'-lanterns, harvest forest scattered by rule, and wild forest with a few of the dead per chunk beyond the authored bounds. Copied modules carry origin headers.
- **Last completed task (2026-10-09):** Milestone 1 built and checked by script in the browser: the player walks from the square through the cottage door with no cut and a zombie follows through it; a wall stops the player at its face; a window shows a wedge of the room from outside and a wedge of the square from inside; stubs on the near walls indoors; the fog leaves no seams; 60 fps with about 730 tiles in view.
- **Also on 2026-10-09, from Michael's play notes:** the dead remember only where they last saw you (chase, search ten seconds, give up); every window has shutters, tap E to open or close, hold E to climb through, the Zomboid scheme; corner posts where walls meet; no bites through walls. He sprinted out of town with no freezes and the infinite grass felt freeing.
- **Later on 2026-10-09:** Michael called it a Place: better than either parent, plays like Zomboid, the art contrast is fun. Doors added (tap E, start closed, the dead cannot open them yet), all fittings one wood with metal strips, open shutters and doors swing out on the outside, the setting widened to dark medieval fantasy, and three jack-o'-lanterns with flickering fire for October.
- **Forest pass, 2026-10-09:** big trees in three sizes and four harvest colours, scattered by rule with noise-shaped density, a padding ring around buildings, trunk-only collision with deflection, and the wild beyond the authored map grown as forest with a few of the dead per chunk. Blue and purple trees are on file for a gloomy zone later.
- **Pin, end of 2026-10-09.** Michael: "this suddenly genuinely looks like a real game." His call on what comes next, and it is the important note of the session: **the last thing the vibe pass needs is a real lighting system like the cozy parent's.** Dynamic light that changes what a room looks like, not a gradient glow: hearth, candles, the jack-o'-lanterns, lit windows, night. From there every gameplay decision will be more fun to test. The parent's art looked good but felt sterile; this is a different place.
- **Docs pass, 2026-10-09 (midday):** the docs caught up with the day's rulings. Glass and curtains became shutters everywhere, stubs became translucent walls in `docs/03`, "walls are tiles" became "walls are state on tile edges", the missing-chunk rule now says wild forest, `docs/02` is newest first within the day with the superseded shirt and Gloomwood lines struck, `docs/06` has the real tree sizes and collision radii, and the parent's tuning numbers are open question 19. One code fix: an animated prop west or north of the origin asked for a negative frame index.
- **Torches and fire talked through, 2026-10-09 (afternoon):** rulings in `docs/02` and the design in `docs/07-lighting.md`. Hands on every holdable item (main, off, both); torches never burn out and mount in brackets or on posts, never on the ground; the dead see fire from far away at night; fires are data with a campfire and a hearth that burn wood and cook; the clock comes first; the fog becomes light. The spear is tabled until combat.
- **Go, 2026-10-09:** Michael read `docs/07` and said go. Logs are free until trees can be cut; the light layer may be smoothed as the parent's was, with per-cell light on the backburner.
- **Steps 1 to 3 of Milestone 2 built, 2026-10-09:** the clock, `light.js`, and the night layer. Michael's first look: "even better than I hoped". Knobs for the pause, from the console: `__game.render.night.tint` (now `36, 22, 56`) and `.alpha`, `__game.light.tunables.dayCap` (0.92; set 1 for a full day), `]` and `[` to move the clock.
- **Milestone 2 built, 2026-10-09 (evening):** fire as data (hearth in the cottage, campfire on the square), the torch on `T` and in brackets and posts, hands on the player, the dead reading light and noticing fire at night. Michael's rules from play fixed what the first night layer got wrong: exterior walls light like the ground, wall tops take the sky, everything on a tile takes its tile's light. Scripted acceptance passed; Michael's play verdict on the whole is pending.
- **Milestone 2 accepted, end of 2026-10-09.** Michael: "good for now", not perfect. Four play rounds found and fixed: walls hidden from the player keeping the room's dark, canopies over lit rooms lighting up, a shuttered room dark on its walls but not its floor, and furniture behind a translucent wall showing through it lit (his diagnosis). His rules for what takes which light are in `docs/07`. Stubs on `C` would remove the translucent-wall mixing if it ever matters more.
- **Ordered night pass, late 2026-10-09:** at Michael's call the stencils became one rule: after the floor, every drawable paints its own darkness over its own shape in sort order, flames included. The stencil code is gone; about 3 ms a frame, 60 fps. `docs/07`, "How things are lit", describes it.
- **The renderer goes to WebGL, ruled late 2026-10-09:** Michael brought an outside spec (PixiJS recommended); we take its lighting and portal ideas and go raw WebGL2 instead. Rulings in `docs/02`, design in `docs/08-renderer.md`: portals as emitters, a transmission scalar, the floor field, then the WebGL renderer at parity, then light per pixel. Gameplay pauses for it.
- **Blocked on:** Michael reading `docs/08-renderer.md`.
- **Next:** Milestone 2b in the order `docs/08` gives, with a pause after each phase. Then openings, with the dead breaking in (doors barred from inside, boards, broken shutters, how the dead get through a door, how slow and loud a climb is). Write its doc first, then build. Then the melee port. Together they make "a night in the cottage". Openings with the dead breaking in and the melee port follow, which together make "a night in the cottage".
- **Notes:** the debug corner shows the cost of a logic step and the worst step in the last three seconds; a freeze should show up there first. Run `python serve.py 8010` in this repo (the file serves its own folder, so it can be launched from elsewhere). `V` toggles the fog off to compare. Michael plays in the in-app browser pane while work happens, so scripted tests see his inputs.
- **Notes:** Michael wants to burn this week's credits on this. He likes a pause between phases (docs, then build) and plays in his own browser while work happens. Nothing from either parent is gospel.

## Conversations to have before code

In order. Each ends with a line in `docs/02-decisions.md`.

- [x] **Chunks instead of nodes** (`docs/03-world-model.md`). Ruled 2026-10-08.
- [x] Viewport size for the probe: 960×540, which is Zomboid's 100 percent zoom.
- [x] Single storey first, with layer-ready tile data.
- [x] Roofs: none for the probe, nothing written to foreclose them.

The remaining open questions in `docs/02` are decided at the milestone that needs them. None blocks the probe.

## Milestone 1 — The probe (see `docs/00-vision.md`, "What the first milestone must prove")

Placeholder art. No sim beyond the active region, no inventory, no needs, no save, no UI beyond a debug corner. The point is to answer four questions, not to make a game.

- [x] Repo plumbing: `index.html`, `style.css`, `serve.py`, `src/main.js`, copied `iso.js`, `loop.js`, `input.js`, `events.js`, `sprites.js`, `placeholders.js`, `render-util.js`, `assets.js` with origin headers.
- [x] Chunked map: a dictionary of 16×16 chunks behind `tileAt`; a missing chunk is created on demand, so the ground goes on forever (plain floor inside the bounds at first; wild forest beyond them since the forest pass). The authored square is sliced into chunks at load; fetching chunk files on demand is a later step, the shape allows it. Walls sit on tile edges (`n`, `w`), Zomboid style. Doorways are passable across their full width (the first version kept the jambs solid, see the scripted checks below). Windows were glass for the probe and became shuttered holes the same day: closed blocks sight, open passes sight and can be climbed.
- [x] Camera: float grid position following the player, origin derived from it so `iso.js` is unchanged, integer-scaled 960×540, only chunks in view drawn, floor cached per chunk as one image.
- [x] One cottage and one shed: four walls, door openings, windows, wood and stone floors, a bed, a table, a chest, barrels. The player's room is found by flood fill; its near walls draw full height and translucent, so windows and doors are the same inside and out (Michael's note, 2026-10-09: the stub's sunken frames were a leftover from faked near edges). `C` switches to the old low stubs for comparison.
- [x] Player copied and walking with circle collision against props and wall segments. Three dead copied; they path with the bounded A\* through doorways and chase on sight.
- [x] Visibility: a ray to every tile in view, walked edge by edge. Out-of-sight tiles fogged, out-of-sight dead not drawn, visible walls and sprites cut out of the fog.
- [x] Debug corner: fps, position, chunk, room, tile and visible counts, zombie states. `V` toggles the fog.

**Accept when** all four proofs hold:

1. Walk from the square into the cottage and out again with no cut, several times, with dead following. It feels better than the dollhouse did.
2. Stand inside the cottage. The near walls are stubs, the far walls are full, the building reads as a building from outside and as a room from inside, in chunky placeholder art.
3. Stand at a window. A wedge of the square is visible through it and nothing else outside is. It reads at a glance without explanation.
4. The viewport shows enough of the square to feel like a village and the pixels still look chunky at 2x.

If any proof fails: stop, write down why in `docs/02`, and talk.

**Scripted checks, 2026-10-09:** from the square, holding up-right for 1.3 s took the player through the door to (15, 7.05) in room 1, and a chasing zombie followed through the same doorway; the same walk aimed at the wall beside the window stopped at 8.85, the wall face plus the body radius; after Michael found doors impassable in play (the first version kept the jambs solid, leaving a gap exactly one body wide), doorways became passable across their width and gained a door magnet in `moveCircle`: approaching the cottage door 0.35 and 0.7 tiles off centre, and the shed's west door straight on and 0.4 off, all slid into the opening and ended inside, while a wall with no door within a tile still stopped the player with no sideways movement; Michael then reported freezes of a second or two: refinding rooms took 1.6 s for 16 chunks because finished outdoor tiles were marked the same as unvisited ones, so every grass tile restarted the fill, and it ran whenever walking created a chunk. Fixed (2.9 ms for 23 chunks, and wall-less chunks no longer trigger it), alongside numeric tile and chunk keys, sight recomputed only when the player or camera changes tile, a heap in the pathfinder with a backoff after a failed search, and a 0.1 s catch-up clamp in the loop; sprinting across 23 chunks with chasers: worst step 1.6 ms at 60 fps; from (13, 10.2) outside the left window, the two tiles straight through the glass were visible and the tiles either side were not; inside, the south and east walls drew as stubs and the square showed as wedges through the door and windows; 60 fps with 714 to 753 tiles in view and about 60 drawables.

## Milestone 2 — Lighting, fire, and the clock (see `docs/07-lighting.md`)

Each step checkable on its own. Michael looks after step 3.

- [x] `clock.js` copied; clock label in the HUD and debug corner; `]` and `[` skip an hour.
- [x] `light.js`: ambient by room and openings, per-chunk static map with shadows, `lightAt`; the jack-o'-lanterns as the first sources. Checked by script: a lantern's pool stops at the shed wall and spills through its open door (0.22 closed, 0.57 open on the door tile).
- [x] Night layer: dusky tint, room erase, chunk maps, the player's pool, wall faces repainted by the tile they look onto, flames in a stencilled layer so a lantern never shows through a wall or a head (Michael caught it in play). Render about 1.5 ms at night. **Paused for Michael: tint, day cap, room light.**
- [x] Fire data on sprites; hearth and campfire placeholders; burning; `E` lights and feeds with free logs; flames drawn. Checked: two logs light the cottage whole and spill through its open door; out after 120 s; a campfire on the square with two logs.
- [x] `items.js` with hands; the torch on `T`; carried pool with rays; brackets and posts; `E` mounts and takes. Checked: a bracket inside the shed lights it and gives up its torch on `E`; a post by the road takes it.
- [x] Zombie sight by light; the dead see fire at night. Checked by script: a zombie nine tiles from the campfire turns to it, a wall between them stops that, one at ten tiles ignores you in the dark and comes when you light the torch.
- [x] Michael's lighting rules from play: exterior walls light like the ground, wall tops take the sky, everything on a tile takes its tile's light (`docs/07`, "How things are lit").
- [x] Acceptance, scripted (2026-10-09): 1 the lit cottage glows whole and spills through its open door, shuttered it is dark from outside; 3 fire pulls (a zombie nine tiles from the campfire comes, a wall stops it, the torch brings one from ten tiles that ignored you in the dark); 4 the hearth burns four logs and goes out, `E` relights; 5 the torch comes off the shed's bracket, lights the forest around you, mounts on the post and lights the road; 6 in the dark forest you see the few tiles around you and the dead as dim shapes; 7 60 fps, render about 2 ms with every fire in view. 2 (the tint reads as this place) is Michael's, who said "even better than I hoped" at step 3.

## Milestone 2b — The WebGL renderer, portals, light per pixel (see `docs/08-renderer.md`)

- [ ] Phase 1: `transmission(wall)`; portals as directional emitters with intensity; `roomBounce`; the floor field on lookups and caches; flicker read from definitions. **Pause for Michael.**
- [ ] Phase 2: `gl.js` and the WebGL `render.js` at parity: textures from sheets, the quad batch with world sample and height, light and ambient and fog textures, the shader, holes as uniforms, flat triangles for posts and leaves and brackets. Old renderer kept as `render-canvas.js`. **Pause for Michael.**
- [ ] Phase 3: light climbs walls; flicker in the light; debug views; legibility floor.
- [ ] Acceptance: the eleven checks in `docs/08`, scripted where they can be, and Michael's eye.

## After the probe (sketch, not a plan)

Porting order, each one milestone, each with its own doc. Order is a guess and will change.

- ~~Lighting~~: now Milestone 2, above.
- Openings: doors barred from inside, boards over shutters and doors, broken shutters, the dead breaking in, how the dead get through a door, how slow and loud a climb is. (Shutters replaced the sibling's glass and curtains: closed is opaque, no pane to break.)
- Combat port: melee rework, shove, knockdown. Sword and spear as the first two lines.
- Inventory, items, moodles, hunger, thirst. Everything is an item.
- Records beyond the active region: alarm, lure, trickle.
- Save and load, start screen, pause.
- Bow and crossbow with recoverable arrows.
- Shield. Later, armour.
- Death that turns you, the next survivor, bodies as containers.
- Sleep, tired, waking to a break-in.
- NPCs: presence, flee, follow and stay, lines; then routines; then bags (`docs/04-npcs.md`).
- Farming, Stardew-simple: a plot, seed, water from the well, growth stages, harvest. Load-bearing; test early with placeholders.
- Cooking, one step: the hearth turns raw into better. Firewood as the hearth's fuel if not already in.
- Furniture you can pick up, move, and rotate. Then, maybe, building, which is also the creative-mode dev tool.
- Village authoring: prefabs, a second building type, the inn, the chapel, the well.
