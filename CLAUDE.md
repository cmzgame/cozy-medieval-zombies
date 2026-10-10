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

`docs/00` vision · `01` what the parents offer · `02` decisions and open questions · `03` world model: chunks · `04` NPCs · `05` someday (never foreclose these cheaply) · `06` art direction and the dev palette · `07` milestone 2: lighting, fire, and the clock · `08` milestone 2b: portals and the WebGL renderer (the world moves from Canvas 2D to raw WebGL2 here; Canvas 2D keeps generating the dev art) · `09` milestone 3: openings, the dead get in · `10` milestone 4: the interface, and the screens · `11` milestone 5: the character, slots, the bag as an item · `12` milestone 6: the figure, the rig and the paper doll · `13` milestone 7: placement, the ghost, building · `14` milestone 8: melee, the swing, held art.

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
- Light is one function. Nothing else computes light. Light feeds sight. In the renderer every vertex carries the world point its light is read from; nothing is lit in screen space.
- Villagers carry no weapons and never fight for the player. They flee, follow, stay, and die.
- Check `docs/05-someday.md` before a choice that would foreclose something cheaply. Say so before making it.
- Placeholder art is generated at boot through the same interface as real sprite sheets. Do not wait for art.
- Milestone 1 is a probe with four proofs in `docs/00-vision.md`. Build nothing else until it passes.

## Implementing from a spec

Michael scopes with one model and builds with a cheaper one. When a milestone doc says "scoped for implementation by another model", the implementer:

1. Reads the whole doc, then the files it names, before writing code. The doc decides; "default" marks what Michael may overrule, not what the implementer may.
2. Follows the doc's build order, one step at a time, and verifies each step in the browser pane through `window.__game` with `loop.setPaused(true)` and `loop.advance(1/60)` before the next. Never asks Michael to test by hand.
3. Edits files with small Python patch scripts written to the scratchpad and run with `python -I script.py "$PWD"`; long heredocs break the Bash tool. Runs `node --check` on every touched module.
4. Changes nothing in the rig's numbers (`BODY`, the poses) or the drawing rules in `src/figure.js` beyond what the doc asks; does not touch `data/hair`, `data/layers`, `data/held`, or their index files, which are Michael's art (commit them as they appear, never edit or delete them).
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

`window.__game` exposes live state (`player`, `zombies`, `map`, `visible`, `teleport(gx, gy)`). `loop.setPaused(true)` then `loop.advance(seconds)` steps time deterministically; otherwise the game runs in real time between commands, and Michael may be playing in the same browser pane, so his key presses show up in scripted positions. Never drive the live game with large single steps. `V` toggles the fog off.

## Code map

`map.js` tiles, edge walls, collision, rooms, authoring (sets, features, scatter, wild) · `visibility.js` line of sight · `camera.js` · `render.js` floors, walls, posts, swung leaves, occlusion holes, fog · `interact.js` doors and shutters on `E` · `pathfind.js` · `entities/` player and the dead · `placeholders.js` dev art generators, copied then re-themed · `ui/` the stamina bar and the prompt · the rest copied from the cozy parent, see each file's header.
