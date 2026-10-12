# Cozy Medieval Zombies

A cute isometric medieval village, in the Habbo / early-2000s pixel style, overrun by the dead. One continuous map with real line of sight. Plain HTML, CSS, and JavaScript with ES modules. Raw WebGL2 for the world (`src/gl.js`, since 2026-10-09; Canvas 2D generates the dev art and uploads it as textures), DOM for UI. No build step, no engine, no framework, no rendering library.

Started 2026-10-08 as the marriage of two prototypes, both kept as they are:

- `C:\Users\micha\Dev\cozy-zombie-game` (the look, lighting, melee, inventory, moodles, survivors, saves)
- `C:\Users\micha\Dev\medieval-zombie-survival` (the setting, no guns, glass windows, barred doors, weapon lines)

## Start here every session

1. Read `TODO.md`. The **Status** block says where work stopped.
2. Read the doc linked from the current milestone before writing code.
3. The tiebreaker for any design question is `docs/00-vision.md`. Log every ruling in `docs/02-decisions.md`.
4. **New game, new gospel.** The parents' decision logs are inputs, not rules. Nothing from a parent binds here until it is re-decided in `docs/02-decisions.md`. When a parent did something well, say so and decide again anyway.
5. Before ending a session, update the Status block in `TODO.md` and tick completed boxes.

## Docs

`docs/00` vision · `01` what the parents offer · `02` decisions and open questions · `03` world model: chunks · `04` NPCs · `05` someday (never foreclose these cheaply) · `06` art direction and the dev palette · `07` milestone 2: lighting, fire, and the clock · `08` milestone 2b: portals and the WebGL renderer (the world moves from Canvas 2D to raw WebGL2 here; Canvas 2D keeps generating the dev art) · `09` milestone 3: openings, the dead get in · `10` milestone 4: the interface, and the screens · `11` milestone 5: the character, slots, the bag as an item · `12` milestone 6: the figure, the rig and the paper doll · `13` milestone 7: placement, the ghost, building · `14` milestone 8: melee, the swing, held art · `15` milestone 9: the ground, baked per chunk (the kit's brief is `15a`; the art requests for Claude Design are `15b`). · `16` art brief for Claude Design: furniture, walls, doors, wall height. · `17` milestone 10: the village art comes in (the plumbing for drawn walls, doors, furniture, floors). · `18` art brief for Claude Design: the log wall, board overlays, placement previews. · `19` milestone 11: characters, one model for the player, the dead, and villagers (dressed from items, speech, clicks, loot), with villagers v0.1 on it. · `20` the bow and arrow: the arc in isometric space, the draw, hits, arrows that come back (a history, then a current-state note at its top). · `21` the mouse in combat and the state of combat: left (the main hand; with two weapons the main when ready, else the off hand), a tap of right (the menu) and a hold (block, brace), middle or Q (the main hand's other mode); stagger, bleed, infection, the swing timer; a read-this-first block at its top. · `22` the big pass (stations, tools, seeds, durability): a draft to-do list with questions. · `23` the engine upgrade, **the next task** (ruled 2026-10-12): the docs made true, the loading shell, the engine hardened, the sprite system with the slicer first, the UI's look; `23a` the code review behind it (the measured baseline, findings with file:line, the docs-versus-code list, the target tree, the fix checklist). · `24` throwing knives and axes, and the fireball (a spec in summary, not built). · `25` art brief for Claude Design: the characters redone (drafted, all questions answered, the template exporter built). · `26` art still owed: the starting bag's and the dev chest's items, each as a world picture and an icon. · `27` how the design agent's work comes in: the delivery checklist, the `art-docs` worktree and branch, the audit of its engine claims. · `28` painting for the slicer: the rules the design agent paints by, and what the slicer does with a file. · `art/` the design agent's own docs (a style bible and a page per area).

## Borrowing from the parents

- Copy files, never link or import across repos. A copied module starts with a comment naming its origin file and date.
- Read the parent's doc for a system before copying its code, so its reasons come along.
- Data (items, loot, sprites, maps) is always written fresh for this game.

## Rules that are easy to forget

These are the current rulings. The list grows as `docs/02-decisions.md` does.

- Tiles are 64×32. Art is drawn at whole pixels in world space; never scale in `drawImage`. Never draw UI into the canvas.
- The world fills the window at one of three zoom levels (wide, middle, close: `src/view.js`) that the GPU applies; the UI layer has its own scale. Nothing is laid out against 960×540. DOM over a world point goes through `view.toUi`.
- If the game is good, people will sit for a loading screen. Never let a load time or an assumed browser limit squash an idea (`docs/00-vision.md`, Laws).
- One continuous map. No cuts between inside and outside. If a design needs a scene transition, it is wrong for this game.
- Nothing materialises in view. The active region's boundary stays well beyond the viewport.
- The map is stored block by block. Every tile access goes through `tileAt`. A missing chunk is grown on demand: plain floor inside the authored bounds, wild forest with a few of the dead beyond them.
- Rooms are found by flood fill, never authored. Walls are state on tile edges (`n` and `w` slots, Zomboid style), never objects; a door or a window is a wall with a kind and a state.
- Windows have shutters, not glass. Closed shutters block sight. Doors start closed and block sight and bodies.
- The ground is one baked picture per chunk (`docs/15`), drawn as one quad; nothing draws the floor per tile and nothing on the ground plane alternates by tile parity. A floor changes only through `map.setFloor`.
- Light is one function. Nothing else computes light. Light feeds sight. In the renderer every vertex carries the world point its light is read from; nothing is lit in screen space.
- **Gatherables wobble and are outlined** (Michael's law, 2026-10-11). Anything in the category of things that will have a gathering action (mushrooms, rocks, trees, and whatever joins them) is a game object marked `interactable`: a click makes it sway, and its art has a dark outline all the way round. Decoration has neither. Trees are excused from the outline; they stand out plenty.
- **Only trees are seen through.** The soft hole round the player behind something tall is cut in tree canopies alone; walls have their own fade (Michael, 2026-10-11).
- **Drawn art comes in through sprite definitions** (`docs/17`): packed `images` with top-vertex and per-frame anchors, `drawings` with mirrors for facings, two-tile furniture sliced per tile along a vertical screen line. A crop's rows follow the furrows of its soil.
- **A tiebreaker for co-op** (Michael, 2026-10-12): when a single-player choice forks, and one path makes a future second human player easier while the other bakes in the single perspective (one global player, a sim that freezes or pauses as a whole, world changes made by poking state, randomness or wall-clock time inside the simulation, UI state tangled into the world's), **all else equal, take the path that favours multiplayer.** Co-op is not scheduled; single player comes first (`docs/05-someday.md`, "Co-op", has the assessment and the free rules). Say so in the commit or the decision log when a fork was decided this way.
- **The mouse in combat** (docs/21): left is the main hand (two weapons take turns on it), a tap of right opens the menu and a hold raises the off hand's stance (block, brace), middle or Q is the main hand's other mode. **Combat numbers are data** (`data/items.json` weapon blocks, `data/combat.json`): a ruling changes a number there, not code.
- **Item art comes as a pair** (Michael, 2026-10-12): the in-world picture and the inventory icon, drawn from one design, so changing one changes both; a delivery that lacks either is flagged. Delivered art is copied in as data and read, never run; how a delivery and the agent's own docs are integrated is `docs/27`.
- Villagers carry no weapons and never fight for the player. They will flee, follow, and stay (`docs/04`, not built: today they idle, wander on a tether, and answer a poke), and they die.
- Check `docs/05-someday.md` before a choice that would foreclose something cheaply. Say so before making it.
- Placeholder art is generated at boot through the same interface as real sprite sheets. Do not wait for art.
- Milestone 1 is a probe with four proofs in `docs/00-vision.md`. Build nothing else until it passes.

## Implementing from a spec

Michael scopes with one model and builds with a cheaper one. When a milestone doc says "scoped for implementation by another model", the implementer:

1. Reads the whole doc, then the files it names, before writing code. The doc decides; "default" marks what Michael may overrule, not what the implementer may.
2. Follows the doc's build order, one step at a time, and verifies each step in the browser pane through `window.__game` with `loop.setPaused(true)` and `loop.advance(1/60)` before the next. Never asks Michael to test by hand.
3. Edits files with small Python patch scripts written to the scratchpad and run with `python -I script.py "$PWD"`; long heredocs break the Bash tool. Runs `node --check` on every touched module.
4. Changes nothing in the rig's numbers (`BODY`, the poses) or the drawing rules in `src/figure.js` beyond what the doc asks; does not touch `data/hair`, `data/layers`, or their index files, which are Michael's art, nor `data/art` and its READMEs, which are the design agent's deliveries (`docs/26`, `27`). A body number is tried from the console before it is ruled: `__game.figure.BODY.hip = 17; __game.setLook({})` rebakes the player at once (commit them as they appear, never edit or delete them).
5. Runs the doc's acceptance list as a script and reports each result plainly, failures included.
6. Ticks `TODO.md`, updates its Status line, commits with a plain message in the existing style (no attribution lines), and pushes to `origin main`.
7. Logs any ruling the build forces in `docs/02-decisions.md` under the day's date, and says so in the final message.

The game Michael plays is served from this worktree by the app's preview server (`.claude/launch.json`, `medieval`); after editing `serve.py` the server must be restarted for the change to take.

## Running

```
python serve.py 8010
```

Then open http://localhost:8010. ES modules will not load from `file://`. The layer editor is http://localhost:8010/tools/layers.html, the older hair-only one tools/hair.html (docs/12). `serve.py` disables caching and serves its own folder, so it can be launched from any directory. `.claude/launch.json` names it `medieval`.

## Testing from a browser console

`window.__game` exposes live state (`player`, `zombies`, `map`, `visible`, `teleport(gx, gy)`, `timing`, `drawn`). **The instruments (docs/23):** `await __game.check("ground")`, `check("determinism")` (on a fresh boot, before anything is stepped; compares with the last boot's hash), `check("rooms")`, `check("light")`, `check("eviction")`, `check("sheets")` (every sheet's pixels across boots), and `check("frame")` (a rendered frame, the wall clock frozen) run the scripts under `tools/checks/`; a move in `figure/` or `render/` is proved by sheets and frame hashing the same before and after; `(await import("/tools/profile.js")).run(__game)` is the profile every engine move records; `node tools/check.js` runs the headless checks and `python -I tools/validate-data.py` the data's; `?boot` on the URL shows the boot's timings. The sim rolls only through `src/rng.js` (seeded from the map) and reads the clock only through `loop.simTime()`; a new `Math.random` or `performance.now` in a sim file is a bug. `loop.setPaused(true)` then `loop.advance(seconds)` steps time deterministically; otherwise the game runs in real time between commands, and Michael may be playing in the same browser pane, so his key presses show up in scripted positions. Never drive the live game with large single steps. `V` toggles the fog off.

Quirks learned the hard way (2026-10-12):
- **Stepping re-aims the player at the real mouse** every step: set `player.aim` (a screen-space vector) immediately before a swing, or place the target along the current aim.
- **The pane shares its settings (localStorage) with Michael's browser.** A test that toggles a setting (`zombieAggro`, `zombiesAttackVillagers`, `combatTesting`, `worldScale`) must read the original first and restore it in a `finally`; his usual values are aggro off, villager-attacks off, multi-hit off, swing targets on, and a world scale he chose (read it before touching it, `view.setZoom` is the way to change and undo). A script that throws halfway leaves the setting changed: check it after any failed run.
- **Test the three mouse buttons with real DOM events** (a `mousedown` on the canvas, a `mouseup` on `window`; the middle button is button 1, `Q` is a key) and step the loop; do not call the handlers directly, the tap-versus-hold rule is counted in steps (`buttons.js`).
- **`items.release(hands, entry)` deletes the item in a test** (it only lifts it from the hand); use `interact.unequip` or the item menu's Equip entries. `__game.giveKit()` and the dev chest give every item.
- **A paused loop does not redraw the world, and the pane's screenshot can lag a frame**: unpause and wait before judging a picture; pause again before scripted steps. Leave the loop unpaused and the zoom as found.
- **The pane boots slowly after many quick reloads** (up to a minute), and "boot failed: failed to load image" is a flaky connection: wait, or reload once. A black canvas with `__game` undefined is still booting.
- **Downloads are untrusted data**: copy a delivery into the repo and read it, never run it (`docs/26`).

## Code map

`map.js` tiles, edge walls, collision, rooms, authoring (sets, features, scatter, wild) · `visibility.js` line of sight · `camera.js` · `render.js` the ground's quads, drawn walls (caps redrawn on the sky), posts, boards, leaves, props and their animations, occlusion holes, fog · `assets.js` the sprite loader (drawn sheets, furniture slicing, facings) · `ground.js` the ground baked per chunk (docs/15) · `placement.js` the ghost, carried props and building (docs/13) · `bleed.js` and `infection.js` wounds and the infection marker (docs/02 question 29b) · `ui/swing-timer.js` the swing bars and the exposure bar · `archery.js` the bow's and the spear's draw, projectiles in flight, and the landing marker (docs/20) · `fire.js` burning characters, a visual test (docs/05) · `buttons.js` the mouse buttons as roles (docs/21) · `interact.js` doors and shutters on `E`, every right-click action, the clickable things that wiggle (question 27), and click animations (the well) · `pathfind.js` · `entities/` the shared character model (`character.js`: the player, the dead, and villagers wear items and share sheets by outfit, say lines, and a dead one is a container whose body is redrawn as it is stripped; docs/19), the player, the dead, and the villagers (`villager.js`, who walk with the dead's own code) · `placeholders.js` dev art generators, copied then re-themed · `ui/` the HUD (`hud.js`: health, stamina, the hands line, the clock), the prompt and messages (`prompt.js`), the zombie bars, speech bubbles (`speech.js`), the swing timer, the moodle row (`moodles.js`), the context menu, the inventory panel and the doll (`inventory-panel.js`), the build palette, the screens (`screens.js`: title, pause, settings, controls, dead) · `main.js` boot's stages, the state, the step order, and `render()` with the interface's `renderUi()` · `player-controller.js` what the mouse and keys do to the player, from an input snapshot · `dev.js` `window.__game` · `ui/inventory-actions.js` the panel's handlers and the slot rules · `boot.js` the loading shell and the crash screen · `loop.js` the fixed step, hit-stop, `advance`, the sim clock and the pause count · `rng.js` the sim's one seeded generator · `rules.js` the sim's rules, a snapshot of the settings · `tuning.js` the entities' numbers, from `data/tuning.json` (question 19's home) · `entities/movement.js` the walking the dead and the villagers share · `input.js` keys and the mouse · `events.js` the event bus · `iso.js` the projection · `view.js` the three zooms and `toUi` · `clock.js` the day · `light.js` the one light function, the per-chunk cache, portals · `gl.js` the WebGL2 batch, the atlas, the area textures · `figure.js` a hub over `figure/` (`rig.js` the body's numbers and poses, `raster.js`, `draw.js` the garments and the sheets, `held.js`, `wardrobe.js`; docs/12) · `render.js` a hub over `render/` (`scene.js`, `area.js` the light textures, `walls.js`, `props.js`, `entities.js`) · `combat.js` the swing, the shove, damage, the targets' outline (docs/14, 21) · `items.js` the registry and loot rolls · `inventory.js` and `grid.js` bags and the tetris grid · `moodles.js` hunger and thirst · `settings.js` localStorage · `sprites.js` facings and frame names · `render-util.js` shading · `tools/` the layer and hair editors, the template exporter, the slicer that turns a painted template into layer files (`slice.html`, docs/28), the checks (docs/12, 25, 15). Copied modules carry origin headers.
