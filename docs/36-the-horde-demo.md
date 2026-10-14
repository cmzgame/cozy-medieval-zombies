# 36 — The horde demo: one homestead, the dead without end

**Status: scoped 2026-10-13 with Michael (`02`, "The horde demo"; the business side is `35`). Scoped for implementation by another model. Not built.** Read `CLAUDE.md` ("Implementing from a spec", and the multiplayer rule first among the rules), `35`, then this whole doc, then the files it names. The doc decides; a default in brackets is Michael's to overrule, not the implementer's.

## What it is

A free demo that lives at a link (`35`): small enough to show the systems in an hour, big enough to be worth that hour. **One homestead** in a clearing: a cottage, a workshop, a well, a plot, a woodpile, trees to fell, everything you need already there, the weapons laid out to try (the bow, the spear and shield with their three attacks, the sword, the mace, the halberd). A calm morning to look round and get ready. Then the dead come, a few at first, then more, then more and more, without end, until you fall. Then a card: how long you held, how many you put down, and that the open valley is coming.

It is the long arc of `00` in miniature (normal until it is not), and the real game's register in an hour: cosy by day, a siege by night.

## The rules of the scenario, and the clock law

The demo is **a scenario with its own rules**, not a world of the game. The clock law (`00`, Laws: never harder on a clock) governs the game's worlds; an endless horde that grows with time is the scenario's whole point, and it is allowed here because nothing in it persists and nobody plays it alone against an absent friend's clock. The end card says plainly that the full game is an open valley where danger is the danger you choose, so the demo never misrepresents it.

## The scenario as data: `data/scenarios/horde.json`

Everything a tuner would change is a number in this file:

- **`map`:** `"homestead"` (below).
- **`rules`:** overrides on the world's rules for this scenario, winning over the browser's settings: [zombieAggro on, survival on, zombiesAttackVillagers on, freeBuilding off, devChest off, combatTesting off; multiHit as the player's setting]. Plus scenario-only switches: [`sleep: false` (beds refuse: "Not tonight."), `tiredness: false`, `save: false`].
- **`kit`:** what the player starts with (the starter kit, plus [a bandage and a waterskin]); what the chests and the rack hold is in the map.
- **`schedule`:** the horde's curve: when it begins, the trickle, the nights, the growth, the ceiling (below).
- **`loot`:** the dead's pockets for the scenario (a table in `data/loot.json`, [`horde_body`]).
- **`end`:** the end card's lines and its links.

## The set: `data/maps/homestead.json`

Written by the generator like the valley (`tools/mapgen/homestead.py` on `mapgen.py`'s vocabulary; `python -I tools/mapgen/homestead.py`), [about 48 by 48 tiles inside its boundary]:

- **The clearing** [about 30 by 30] in the middle: **the cottage** (two rooms through a partition, a bed, a lit hearth, a table and chairs, a chest of food and drink, two windows and a door: something to board and hold), **the workshop** (the workbench, a weapon rack or chest with the bow and [40] arrows, the spear, the shield, the sword, the mace, the halberd, a hatchet, a chest of planks, sticks, and cloth), **the well**, **a fenced plot** with crops at their last stage (food once farming lands, `30` step 4; scenery until then), **a woodpile chest** of logs, **a campfire**, [a cart and a few barrels for cover and loot].
- **A forest strip** [six to eight tiles deep] all round the clearing, scattered trees by the generator's rule: cover for the dead to come through, and the place they appear.
- **The boundary:** an invisible wall round the whole set that no body crosses, the player and the dead alike. A new wall kind, [`wall_invisible`], with `seeThrough: true` (so it bounds no room and the forest beyond is seen) and nothing drawn; laid with the generator's `fence` feature, no gates. Beyond it the wild grows for the view only, with **no dead** (`wild.zombiesPerChunk: 0` in the map), so nothing ever arrives from the endless forest.
- **No villagers** [except the guide of `34`, once talk is built: immune to the dead, in the cottage, explaining the controls before the horde; until then, a notice board beside the door with the few lines a new player needs].

## The horde

### Who spawns, where

- **Spawn points** are tiles in the forest strip (the generator writes them into the map as [`spawns`]).
- **A body appears only where no player can see it:** at a spawn point more than [14 tiles] from every living player and out of every living player's line of sight (`visibility.lineOfSight` from each player's tile). "Nothing materialises in view" (`CLAUDE.md`) is kept by construction. If no spawn point qualifies this step, nobody spawns this step.
- They are ordinary dead (`createZombie`), dressed from the zombie wardrobes, hunting whoever they see, breaching openings as they do in the valley (`09`).

### The curve (all in `schedule`)

- **The calm:** the scenario starts at [08:00] on day one with none of the dead anywhere. The day is 720 seconds of real time (`clock.js`), so the morning is a few real minutes to look round and arm.
- **The trickle:** from [11:00], one at a time, [one every 30 seconds of game time], at most [4] alive.
- **The nights:** from [dusk, 19:00] to [dawn, 06:00] the spawn interval and the cap are multiplied by the night factor [interval 0.4x, cap 2.5x]; at dawn a lull [no spawns for 60 seconds of game time].
- **The growth:** after the trickle begins, the cap grows by [2] and the interval shrinks by [3 percent] for every minute of game time, without end.
- **The ceiling:** the cap never passes a measured number of the dead alive at once [`maxAlive`, start at 150 and set it from the profile: the largest count at which a step plus render stays under 8 ms at the widest zoom on Michael's machine]. Past the ceiling the horde keeps growing by **pace**: the fallen are replaced at once, and from [the fourth night] each new one has [10 percent] more health a night (`hp` on the zombie at creation; the standard zombie's health in `data/tuning.json` is untouched). "Until the game crashes" is not the end state; the ceiling is.

### Keeping an endless run playable

- **Supply:** the dead's pockets are the main supply (`horde_body`: [arrows, sticks, planks, cloth, bandages, apples, bread, a rare iron bar]), so fighting feeds fighting; weapons wear by kills (`30` 5.2) and the workbench remakes the simple ones (arrows, sticks, the bow, the shield, from `data/recipes.json`). [At each dawn the woodpile chest and the plank chest are topped up to their starting counts: the dawn's delivery, a scenario rule.]
- **Bodies:** corpses pile up. [Past 60 corpses, the oldest searched or empty one is removed at each step it is out of every player's sight.] Removal goes through the lists the wire already deltas (the roster carries it to a guest).

## The score and the end

- **Kept as the run goes:** the time held (days and nights), the dead put down (by everyone, and by each player), [the longest night].
- **The HUD:** one line under the clock: "Night 2 · 37 put down" (on the kit, `ui/hud.js`).
- **The end:** when every living player has fallen, the end card (`ui/screens.js`, the dead screen's place for this scenario): "You held the homestead for 3 nights. 214 dead." (deaths said plainly, `00`), the per-player counts in co-op, **Play again**, and the lines from `end`: the open valley is coming, [the wishlist link once the store page exists; until then the site's link]. [No retry from the same point; no saving.]
- **A fallen player in co-op** [comes back at the cottage at the next dawn while anyone still stands], with the starter kit; the run ends only when nobody stands.

## How it is entered

- **The demo's link opens the scenario:** [`?demo` on the URL] boots straight to a title of its own: **Play**, **Play with a friend** (Open to friends at once, the code shown), **Join a friend** (the code typed), Settings, Controls. No Worlds screen, no identities beyond the character screen's one page for a name and a look [or a random look with Play pressed at once].
- **The full game is untouched:** the scenario is a world type (`scenario: "horde"` in the world's record), the map chosen per world rather than by the page's `?map=` (today `MAP_NAME` in `main.js` is read once from the URL and decides which saved worlds are playable): give a world its own map and scenario, so the demo needs no special build and the full game's Worlds screen could list "Horde" later [not in this scope].
- **Escape pauses alone** as in any lone world; on the wire it never pauses (`02`).

## The guest's side (`31/08`)

1. The spawner, the curve, the supply, the corpse cap, the score, and the end all run in the host's step (`game.begin` or `game.step`), on the sim's clock and `rng`.
2. A guest plays by the same paths as in any world; the only new command is none: Play again on a guest asks the host [the host decides; a guest's card offers Leave].
3. What it adds reaches a guest: the dead by the existing delta and roster; the scenario's state (the phase, the clock of the curve, the score) in the save (the welcome) and in the frame as a new field [`scenario`, sent when it changes]; the end as that state.
4. The sync check gains a `scenario` part.
5. No module-level state for one player: per-player counts live on the player.
6. Tried in two tabs; and **the wire is measured at the ceiling**: a guest's bytes a second with the cap's worth of the dead near (`net.status().wire`). **Co-op ships in the demo only if a guest stays under [200 KB/s] there;** if not, the ceiling for a world with guests is lowered to what fits, and the wire's next savings (a binary frame, interest regions, `31/04`) are noted as owed in `TODO.md`.

## Build order

Each step verified in the browser pane through `window.__game` with `loop.setPaused(true)` and `loop.advance(1/60)` before the next; `?nosave` on the URL; `node --check` on every touched module; the determinism hash of the valley unchanged throughout.

1. **The scenario layer.** `data/scenarios/`, a world's own map and scenario in its record and its save, the rules' override layer (`rules.js`: the scenario's values win over the settings, which are never written: the shared-settings quirk of `CLAUDE.md`), the scenario-only switches (sleep, tiredness, save). Verify on the valley that nothing changes with no scenario.
2. **The set.** `wall_invisible`, `homestead.py`, the map with its spawns and no wild dead. Verify: walk the clearing; the boundary stops you; the forest beyond is seen; no room is made by the boundary (`check("rooms")`).
3. **The horde.** The spawner (out of sight, out of range), the curve, the night factor, the lull, the ceiling. Verify by stepping through a whole day and night with the clock moved (`]`), reading the counts against the schedule.
4. **The run kept playable.** `horde_body`, the dawn's delivery, the corpse cap, health by night.
5. **The score and the end.** The HUD line, the end card, Play again, a fallen friend's return at dawn.
6. **The entry.** `?demo`, its title, Play, Play with a friend, Join a friend.
7. **Measure.** The ceiling from the profile; a guest's bytes at the ceiling in two tabs on the relay as well as the loopback; `check("sync")` passing mid-wave.
8. **The check and the docs.** `tools/checks/horde.js`, `CLAUDE.md` (the code map, the URL, the check), `README` (the demo's link), `TODO.md`, and the rulings the build forced in `02`.

## Acceptance (`await __game.check("horde")`, plus the two-tab and measured rows by hand)

1. With no scenario the valley boots as before: the determinism hash and every existing check unchanged.
2. The horde world starts at 08:00 with none of the dead; the first spawns after 11:00.
3. No body ever appears within the minimum distance of a player or in any player's line of sight (checked at every spawn of a scripted day and night).
4. Nothing crosses the boundary: a player walked into it stops; a zombie pathing to a tile beyond fails; no dead come from the wild.
5. At night the cap and the pace follow the night factor; at dawn the lull holds; the cap grows by the schedule and stops at the ceiling.
6. A body's pockets roll from `horde_body`; the chests are topped up at dawn; corpses past the cap are removed only out of sight.
7. Beds refuse, tiredness does not drain, and nothing is saved in the horde world; the browser's settings are unchanged after a run.
8. The HUD line and the end card's numbers match the counts kept; Play again starts a fresh run.
9. Two tabs: a guest fights the same dead; a fallen guest returns at dawn while the host stands; the run ends when both have fallen and both see the card; `check("sync")` passes mid-wave with the `scenario` part.
10. Reported: the ceiling chosen and the step and render cost there; a guest's bytes a second at the ceiling, and whether co-op ships.

## Not in this scope

Leaderboards (Steam's, later), other scenarios, the Horde in the full game's Worlds screen, farming in the plot before `30` step 4, saving a run, difficulty choices, the wrapper and Steam (`35`).
