# Cozy Medieval Zombies

A cute isometric medieval village, in the Habbo / early-2000s pixel style, overrun by the dead. One continuous map with real line of sight. Plain HTML, CSS, and JavaScript with ES modules. Canvas 2D for the world, DOM for UI. No build step, no engine, no framework.

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

`docs/00` vision · `01` what the parents offer · `02` decisions and open questions · `03` world model: chunks · `04` NPCs · `05` someday (never foreclose these cheaply) · `06` art direction and the dev palette.

## Borrowing from the parents

- Copy files, never link or import across repos. A copied module starts with a comment naming its origin file and date.
- Read the parent's doc for a system before copying its code, so its reasons come along.
- Data (items, loot, sprites, maps) is always written fresh for this game.

## Rules that are easy to forget

These are the current rulings. The list grows as `docs/02-decisions.md` does.

- Tiles are 64×32. Integer display scaling. Never scale in `drawImage`. Never draw UI into the canvas.
- One continuous map. No cuts between inside and outside. If a design needs a scene transition, it is wrong for this game.
- Nothing materialises in view. The active region's boundary stays well beyond the viewport.
- The map is stored block by block. Every tile access goes through `tileAt`. A missing chunk is empty field.
- Rooms are found by flood fill, never authored. Walls are tiles with state.
- Light is one function. Nothing else computes light. Light feeds sight.
- Villagers carry no weapons and never fight for the player. They flee, follow, stay, and die.
- Check `docs/05-someday.md` before a choice that would foreclose something cheaply. Say so before making it.
- Placeholder art is generated at boot through the same interface as real sprite sheets. Do not wait for art.
- Milestone 1 is a probe with four proofs in `docs/00-vision.md`. Build nothing else until it passes.

## Running

```
python serve.py 8010
```

Then open http://localhost:8010. ES modules will not load from `file://`. `serve.py` disables caching and serves its own folder, so it can be launched from any directory. `.claude/launch.json` names it `medieval`.

## Testing from a browser console

`window.__game` exposes live state (`player`, `zombies`, `map`, `visible`, `teleport(gx, gy)`). `loop.setPaused(true)` then `loop.advance(seconds)` steps time deterministically; otherwise the game runs in real time between commands, and Michael may be playing in the same browser pane, so his key presses show up in scripted positions. Never drive the live game with large single steps. `V` toggles the fog off.

## Code map

`map.js` tiles, edge walls, collision, rooms, authoring · `visibility.js` line of sight · `camera.js` · `render.js` floors, walls, cutaway, fog · `pathfind.js` · `entities/` player and the dead · the rest copied from the cozy parent, see each file's header.
