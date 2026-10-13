# Cozy Medieval Zombies (working title)

A cute isometric medieval village in the Habbo / early-2000s pixel style, overrun by the dead. One continuous map: walk from the square into the inn, look out its window, see what is coming. The art stays cute. The systems stay serious.

Plain HTML, CSS, and JavaScript. Raw WebGL2 for the world, Canvas 2D to generate the dev art, DOM for the UI. No engine, no build step, no library.

Started 2026-10-08 as the marriage of two earlier prototypes: `cozy-zombie-game` (the look, the lighting, melee, inventory) and `medieval-zombie-survival` (the setting, no guns, glass windows, barred doors). Both are kept as they were.

## Running

```bash
python serve.py 8010
```

Then open http://localhost:8010. WASD or arrows to walk, Shift to sprint, mouse to aim. At a door, tap `E` to open or close it. At a window, tap `E` to open or close the shutters and hold `E` to climb through. `T` takes the torch in hand. Tab opens the bag, `C` the character screen (each on its own; drag a header to move a panel, its X closes it), 1 to 4 use the belt, `N` builds, `X` removes, `B` boards, `Z` and the wheel zoom, Escape closes or pauses, right-click is the actions menu, left-click swings (and the middle button or `Q` is the main hand's other mode, `docs/21`). `]` and `[` move the clock an hour. `V` toggles the fog of what you cannot see, `L` cycles debug views of the light, ambient, and fog textures.

## Status

Milestones 1 to 11 are built (2026-10-09 to 2026-10-12): a chunked map with real line of sight, WebGL2 lighting, openings the dead break through, the grid inventory and menus, the character and the figure, placement and building, melee, the bow, the ground baked per chunk, the village art, and one character model for the player, the dead, and villagers. **The engine upgrade is done** (2026-10-12: `docs/23`, with the code review in `docs/23a`): the loading shell, the engine hardened and deterministic, the sprite tools, and the interface's stone look in Pixelify Sans. Next the design agent dresses the characters (`docs/28`) and the open threads close. See `TODO.md` for where things stand and `docs/00-vision.md` for what this is.

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
| [12-figure.md](docs/12-figure.md) | Milestone 6: the figure, a rig and a paper doll, eight facings, held items. |
| [13-placement.md](docs/13-placement.md) | Milestone 7: the ghost, carried props, building. |
| [14-combat.md](docs/14-combat.md) | Milestone 8: melee, the swing, held art (with a note of what has since changed). |
| [15-ground.md](docs/15-ground.md) | Milestone 9: the ground baked per chunk. |
| [16-village-art-brief.md](docs/16-village-art-brief.md), [17-village-art-plumbing.md](docs/17-village-art-plumbing.md), [18-building-art-brief.md](docs/18-building-art-brief.md) | The village art: the brief, the plumbing, the building brief. |
| [19-characters.md](docs/19-characters.md) | Milestone 11: one character model for the player, the dead, and villagers. |
| [20-archery.md](docs/20-archery.md) | The bow and arrow, and the thrown spear. |
| [21-combat-buttons.md](docs/21-combat-buttons.md) | The mouse in combat, and **the state of combat at the top (read first)**: stagger, bleed, infection, dual wielding, the guard, the swing timer. |
| [22-the-big-pass.md](docs/22-the-big-pass.md) | A draft to-do list: stations, tools, seeds, weapon durability, item interactions. |
| [23-engine-upgrade.md](docs/23-engine-upgrade.md) | **The next task:** the docs made true, the loading shell, the engine hardened, the sprite system with the slicer first, the UI's look. |
| [23a-review.md](docs/23a-review.md) | The code review behind it: the measured baseline, findings with file:line, the docs-versus-code list, the target tree, the fix checklist. |
| [24-throwables-and-fire-magic.md](docs/24-throwables-and-fire-magic.md) | A spec in summary: throwing knives and axes, the fireball, the staff and the book of fire. |
| [25-character-art-brief.md](docs/25-character-art-brief.md) | The brief to redo the characters: the body first, three options per slot. |
| [26-art-owed.md](docs/26-art-owed.md) | The item art still owed, each as a world picture and an inventory icon. |
| [27-art-integration.md](docs/27-art-integration.md) | How the design agent's work comes in: the delivery checklist, the shared worktree, the audit. |
| [28-painting-for-the-slicer.md](docs/28-painting-for-the-slicer.md) | The rules the design agent paints by, and what the slicer does with a file. |
| [29-world/README.md](docs/29-world/README.md) | The 1.0 map, ideated: a valley with a river, the castle, the village, the farms, the forest places; art and engine asks; a cut list and the questions. Nothing ruled yet. |
| [art/README.md](docs/art/README.md) | The design agent's own docs: a style bible and a page per area of art. |
