# Cozy Medieval Zombies (working title)

A cute isometric medieval village in the Habbo / early-2000s pixel style, overrun by the dead. One continuous map: walk from the square into the inn, look out its window, see what is coming. The art stays cute. The systems stay serious.

Plain HTML, CSS, and JavaScript. Canvas 2D for the world, DOM for the UI. No engine, no build step.

Started 2026-10-08 as the marriage of two earlier prototypes: `cozy-zombie-game` (the look, the lighting, melee, inventory) and `medieval-zombie-survival` (the setting, no guns, glass windows, barred doors). Both are kept as they were.

## Running

```bash
python serve.py 8010
```

Then open http://localhost:8010. WASD or arrows to walk, Shift to sprint, mouse to aim. At a window, tap `E` to open or close the shutters and hold `E` to climb through. `V` toggles the fog of what you cannot see, `C` switches how near walls draw.

## Status

Milestone 1, the probe: a scrolling chunked map, a cottage and a shed with four walls and cutaway stubs, line of sight through glass, the player and three of the dead. See `TODO.md` for where things stand and `docs/00-vision.md` for what this is.

## Documents

| Doc | What it holds |
|---|---|
| [00-vision.md](docs/00-vision.md) | The idea, the tone, the pillars, what the first milestone must prove. The tiebreaker. |
| [01-parents.md](docs/01-parents.md) | What each parent offers: code worth copying, rulings worth considering, what does not transfer. |
| [02-decisions.md](docs/02-decisions.md) | Rulings with reasons, and the open questions. |
| [03-world-model.md](docs/03-world-model.md) | Chunks instead of nodes: block storage, the active region, records, rooms, the camera. |
| [04-npcs.md](docs/04-npcs.md) | Villagers: killable, they flee, follow, and stay, carry no weapons; what talking does. |
| [05-someday.md](docs/05-someday.md) | Wanted but unscheduled: quests, roofs, upper floors, building, the countryside. Never foreclose these cheaply. |
| [06-art.md](docs/06-art.md) | Art direction: spooky medieval, never permanently night; the genre test and the dev palette. |
