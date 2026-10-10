# Cozy Medieval Zombies (working title)

A cute isometric medieval village in the Habbo / early-2000s pixel style, overrun by the dead. One continuous map: walk from the square into the inn, look out its window, see what is coming. The art stays cute. The systems stay serious.

Plain HTML, CSS, and JavaScript. Raw WebGL2 for the world, Canvas 2D to generate the dev art, DOM for the UI. No engine, no build step, no library.

Started 2026-10-08 as the marriage of two earlier prototypes: `cozy-zombie-game` (the look, the lighting, melee, inventory) and `medieval-zombie-survival` (the setting, no guns, glass windows, barred doors). Both are kept as they were.

## Running

```bash
python serve.py 8010
```

Then open http://localhost:8010. WASD or arrows to walk, Shift to sprint, mouse to aim. At a door, tap `E` to open or close it. At a window, tap `E` to open or close the shutters and hold `E` to climb through. `T` takes the torch in hand. `]` and `[` move the clock an hour. `V` toggles the fog of what you cannot see, `C` switches how near walls draw, `L` cycles debug views of the light, ambient, and fog textures.

## Status

Milestone 1, the probe, passed on 2026-10-09: a scrolling chunked map with real line of sight, a cottage and a shed with doors and shuttered windows, near walls translucent when you are inside, a farm plot, jack-o'-lanterns, harvest forest scattered by rule, and wild forest with a few of the dead beyond the authored map. Milestone 2 is lighting. See `TODO.md` for where things stand and `docs/00-vision.md` for what this is.

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
| [07-lighting.md](docs/07-lighting.md) | Milestone 2: the clock, light as one function per chunk and room, fire as data, torches that mount, hands, the dead seeing flames. |
| [08-renderer.md](docs/08-renderer.md) | Milestone 2b: portals as emitters, transmission, the floor field, then a raw WebGL2 renderer and light per pixel. |
| [09-openings.md](docs/09-openings.md) | Milestone 3: an opening as a stack of boards and a leaf, read from the attacker's side; the dead break in and climb through windows. |
| [10-interface.md](docs/10-interface.md) | Milestone 4: the grid inventory, right-click menus, the HUD and moodles, logs and planks as items. |
| [11-character.md](docs/11-character.md) | Milestone 5: everything is a slot; the worn screen, the belt as the hotbar, the bag as an item on your back. |
