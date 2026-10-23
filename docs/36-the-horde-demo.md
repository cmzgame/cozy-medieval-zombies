# 36 — The horde demo: one homestead, the dead without end

**Status, 2026-10-23: a spec, to be built on dev art (below). Scoped 2026-10-13 with Michael (`02`, "The horde demo"; the business side is `35`), re-scoped 2026-10-14 on his reading (`02`, "The demo re-ruled"): it is built to kill the player, single player only, the dead walking in from off screen out of a dense forest; and it is a demo, not a tutorial, so it sells the game (the five rules under "What it is"). Scoped for implementation by another model. Not built; to be built now, on dev art, demo-first (Michael, 2026-10-23, `02`): it is the game's bounded playtest, and its scope is a cut list from the Valley's (`39`), each line naming the valley issue it depends on.** **One rule on its release (Michael, 2026-10-13):** it is built, tested, and given real art before it goes to the public as a demo or beside a Steam page; the old rule that nothing goes into the demo without its final art was struck on 2026-10-23. It is a proof of concept with finite supplies, not the endless mode, which is wanted later as a permanent game mode (`05`). Read `CLAUDE.md` ("Implementing from a spec", and the multiplayer rule first among the rules), `35`, then this whole doc, then the files it names. The doc decides; a default in brackets is Michael's to overrule, not the implementer's.

## What it is

A free demo that lives at a link (`35`): small enough to show the systems in an hour, big enough to be worth that hour. **One homestead** in a clearing, wrapped in dense forest: a cottage, a workshop, a well, a plot, a woodpile, trees to fell, everything you need already there, the weapons laid out to try (the bow, the spear and shield with their three attacks, the sword, the mace, the halberd). A quiet start to look round and get ready. Then the dead come out of the trees, a few at first, then more, then more and more, without end, until you fall. Then a card: how long you held, how many you put down, and that the open valley is coming.

**The goal is to kill the player** (Michael, 2026-10-14). Zomboid's tutorial ends in a horde nobody survives; here you get to play the real game for as long as you can hack it, and you still die. The escalation forces it: when one way of killing you has reached its limit, the next begins (more of the dead, then tougher ones, then faster ones, and so on), so no build order outlasts it forever: a demo you could survive indefinitely would be a free game, not a demo. The third or the fifth run is the one where a player thinks "wait, can I actually survive this with the right build order?" and spends the first day preparing for the night. That replay is the demo's hook.

**It is a demo, not a tutorial: it sells the game** (Michael, 2026-10-14). Zomboid's tutorial can end in a death with nothing after it because the finished game is a click away; this one must leave the player wanting the open valley it hints at. Five rules follow, each written into the sections below:

The five are `02` 2026-10-14, "The demo sells the game", with their reasons, and each section below cites its number: (1) the first run reaches the first night; (2) preparation buys time, never escape; (3) the edge promises the world instead of hiding it; (4) the end card sells the full game; (5) the depth shows along the way.

## The rules of the scenario, and the clock law

The demo is **a scenario with its own rules**, not a world of the game. The clock law (`00`, Laws: never harder on a clock) governs the game's worlds; a horde that grows with time is this scenario's whole point, and it is allowed here because nothing in it persists and nobody plays it against an absent friend's clock. The end card says plainly that the full game is an open valley where danger is the danger you choose, so the demo never misrepresents it. **Day and night are the same to the horde** (Michael, 2026-10-14: the old "cosy by day, siege by night" is withdrawn; the game's spooky part comes from exploring new regions, not from the hour). The clock still turns, the light still falls, and the escalation runs straight through both.

**Single player only** (Michael, 2026-10-14). The demo's title offers no hosting and no joining. The scenario layer itself (a world's own map and scenario, the spawner, the score) is still built for the authority's step, in the save, and in the sync check, as every change is (`31/08`): a scenario world must be hostable later (the Endless mode of `05` will want friends), and the demo simply does not offer it.

## The scenario as data: `data/scenarios/horde.json`

Everything a tuner would change is a number in this file:

- **`map`:** `"homestead"` (below).
- **`rules`:** overrides on the world's rules for this scenario, winning over the browser's settings: [zombieAggro on, survival on, zombiesAttackVillagers on, freeBuilding off, devChest off, trees on, population standard; multiHit as the player's setting]. Plus scenario-only switches: [`sleep: false` (beds refuse: "Not tonight."), `tiredness: false`, `save: false`].
- **`kit`:** what the player starts with (the starter kit, plus [a bandage and a waterskin]); what the chests and the rack hold is in the map.
- **`schedule`:** the horde's curve: the quiet start, the first spawn, the growth, the ceiling, and the stages past it (below). **Every time in this file is in seconds of simulation** (`loop.simTime()`, which is real seconds at the world's normal speed), never the clock's hours: a game day is 720 real seconds, so an in-game minute is half a real second, and a number written in clock minutes would be off by a factor of a hundred and twenty.
- **`loot`:** the dead's pockets for the scenario [the ordinary `body` table: a little, not a supply line].
- **`end`:** the end card's lines and its links.

## The set: `data/maps/homestead.json`

Written by the generator like the valley (`tools/mapgen/homestead.py` on `mapgen.py`'s vocabulary; `python -I tools/mapgen/homestead.py`). **No bigger than it must be** (Michael, 2026-10-14: you are not meant to explore). Three rings, from the middle out:

- **The clearing** [about 24 by 24] in the middle: **the cottage** (two rooms through a partition, a bed, a lit hearth, a table and chairs, a chest of food and drink, two windows and a door: something to board and hold), **the workshop** (the workbench, a weapon rack or chest with the bow and [40] arrows, the spear, the shield, the sword, the mace, the halberd, a hatchet, a chest of planks, sticks, and cloth), **the well**, **a fenced plot** with crops at their last stage (food once farming lands, `30` step 4; scenery until then), **a woodpile chest** of logs, **a campfire**, [a cart and a few barrels for cover and loot].
- **The player's room to move:** [about six tiles] of the forest round the clearing that the player may walk into, and then **the player's boundary, which the player can see** (rule 3): **a bramble thicket** round it that stops the living and that the dead push straight through (they do not care about thorns). A new wall kind, [`wall_thicket`, drawn low and ragged, with `seeThrough: true` so it bounds no room and the forest beyond is seen, and a new field `blocks: "players"`], laid with the generator's `fence` feature; the one new rule in code is a check in the walking that lets a character who is not a player pass an edge whose wall `blocks` only players (and the dead's pathfinding treats it as open). [A prompt on bumping it, once: "Too thick to push through."]
- **The roads out, blocked:** [two] tracks leave the clearing and end at the thicket under something that explains why you cannot follow them: [a fallen tree across one, a wrecked cart across the other], solid props in the gap. **A signpost** at each names where it goes ([`"Hollow Farm"`, `"The village"`], the valley's own places, `29-world`), and the notice board (or the guide, `34`) mentions the village, the chapel, and the river in passing. The valley exists; it is just not here yet.
- **The dense forest** beyond it, out to the spawn ring: trees thick enough that the dead come out of them rather than across open ground (trees are trunk-only obstacles, so the dead still walk through, deflected), and **the outer boundary** round everything: [`wall_invisible`, `seeThrough: true`, nothing drawn, blocking everyone], which only the dead ever reach, since the thicket keeps the player well inside it.
- **Laid out to teach** (rule 5): what a first day needs is placed so that getting it touches a system: the planks in the workshop beside the bench and the boards (boarding a window), the arrows few and the bench's recipe for more, raw food in the chest and the hearth lit (cooking), the waterskin empty beside the well, a weapon or two already worn, the bow on the rack where it is seen from the cottage door.
- **No wild dead:** the map's `zombiesPerChunk` (the number of the dead a grown wild chunk is given, as a `[min, max]` range: `map.js`, the wild) is `[0, 0]`, so the wild that grows beyond the outer boundary for the view is empty. The spawner below is the only source of the dead.
- **No villagers.** [A guide (`34`), once talk is built, standing beside the player's spawn, immune to the dead, explaining the controls; until then, a notice board beside the cottage door with the few lines a new player needs.]

## The horde

### Who spawns, where (Michael, 2026-10-14)

- **Off screen, walking to the middle.** A body appears in the dense forest at a spawn point **farther from the player than the widest zoom shows** [the spawn distance: the reach of the widest zoom (`view.js`) from the player's tile to the corner of a 2560 by 1440 window, plus four tiles; computed from `view.js` once and written into the scenario, not read from the client's window, so it is the same on any machine], and walks toward the middle of the clearing at once: they are coming for you; nobody has to go and find them. On arrival they hunt as the dead always do (sight, sound, light, breaching openings as in the valley, `09`).
- **Spawn points** are tiles in the dense forest (the generator writes them into the map as [`spawns`]), spread all round. The set is sized so that from anywhere the player can stand, some spawn points are past the spawn distance: [the outer boundary's half-width at least the player's boundary's half-width plus the spawn distance]. "Nothing materialises in view" (`CLAUDE.md`) is kept by that distance, not by line of sight: trees do not block sight in this engine (`visibility.js`: only walls and opaque props do), so a line-of-sight rule in a forest would find almost nowhere to spawn.
- They are ordinary dead (`createZombie`), dressed from the zombie wardrobes.

### The curve (all in `schedule`, in seconds of simulation)

Starts slow, escalates steadily, day and night alike, and is meant to end the run.

- **The quiet start:** the scenario starts at [08:00] on day one with none of the dead anywhere, for [90 seconds]: time to look round and pick up a weapon.
- **The first trickle:** then one at a time, [one every 20 seconds], at most [3] alive.
- **The growth:** every [60 seconds] the cap rises by [1] and the interval shrinks by [5 percent], without end. No lull at dawn, no night factor.
- **The ceiling:** the cap never passes a measured number of the dead alive at once [`maxAlive`, start at 150 and set it from the profile: the largest count at which a step plus render stays under 8 ms at the widest zoom on Michael's machine]. "Until the game crashes" is not the end state; the ceiling is.
- **The stages past the ceiling** (Michael: "we force a way, and a follow-up way, and then another"): each begins when the one before has reached its limit, so the pressure never plateaus. [1. Replacement: the fallen are replaced at once. 2. Tougher: each new body has 10 percent more health per stage step (`hp` on the zombie at creation; the standard zombie's health in `data/tuning.json` is untouched), every 120 seconds, up to double. 3. Faster: each new body walks 5 percent faster per step, every 120 seconds, up to one and a half times. 4. Harder on walls: the dead's damage to boards, doors, and shutters (`09`) up by 10 percent per step.] Each stage's numbers are in `schedule`; the order and the stages are Michael's to change.
- **Each stage answerable for a while** (rule 2): more of the dead is answered by boarded windows and a held door, tougher ones by the better weapons and arrows, faster ones by having prepared before they came, harder blows on walls by boards to spare. The stages are ordered so that what a player learned to do in the last run holds the next stage off a little longer, and none holds it off forever.
- **The tuning target** (rule 1): [a new player who does little but fight sees nightfall on day one; a careful first run sees dawn; a well-planned run reaches the second or third night; nobody reaches the fourth]. Read it from scripted and played runs, and move the curve, not the rule.

### Supplies for a few days, and no more (Michael)

- **Finite:** what the homestead holds (the chests, the rack, the woodpile, the trees in the clearing and the forest, the dead's ordinary pockets) is enough for [about three days and nights] of careful play, and nothing is replenished. Weapons wear by kills (`30` 5.2) and the workbench remakes the simple ones from what is left (arrows, sticks, the bow, the shield, `data/recipes.json`) until the wood runs out.
- **The test of the tuning:** a run should not be expected to last longer than that; the curve is meant to end it sooner. **If players routinely outlast the supplies, the scenario (or the game) is not hard enough**, and the curve or the supplies change, not the rule.
- **Bodies:** corpses pile up. [Past 60 corpses, the oldest searched or empty one is removed at each step it is out of the player's sight.] Removal goes through the lists the wire already deltas.

## The score and the end

- **Kept as the run goes:** the time held (days and nights), the dead put down, [the longest stretch without a hit].
- **The HUD:** one line under the clock: "Day 2 · 37 put down" (on the kit, `ui/hud.js`).
- **The end card** (rule 4; `ui/screens.js`, the dead screen's place for this scenario), when the player falls, in three parts:
  1. **The run:** "You held the homestead until the second night. 214 dead." (deaths said plainly, `00`), and beside it **the best run** in this browser ("Your best: dawn of day two") [kept in the browser's own storage as a convenience, wrapped so a private window simply shows none; never a world save].
  2. **The full game, in a few lines and pictures** (from `end`): the open valley to explore, the village and its people, a farm and a home of your own, friends playing together in one world, and the frontier, darker the farther you go. [Four short lines, each with a small picture once there is final art of the full game to show; until then the lines alone, or the style frame and capsule art of `35`, which are final art.]
  3. **Wishlist on Steam**, the largest button on the card, opening the game's Steam store page in a new tab, where the wishlist button is one click for anyone signed in [Steam's own store widget embedded on the card, if its terms and the page allow]; **Play again** beside it. Until the store page exists, the button goes to the game's own site (`35`) and says so. [No retry from the same point; no saving.]
- **The title says it too:** under Play, one line that this is a demo of a game with an open valley, and the same Wishlist link, so a player who never dies (or never plays) still sees it.

## How it is entered

- **The demo's link opens the scenario:** [`?demo` on the URL, on the demo's own site, `35`] boots straight to a title of its own: **Play**, Settings, Controls. No Worlds screen, no identities, no hosting or joining; the character screen's one page for a name and a look [or a random look with Play pressed at once].
- **The full game is untouched:** the scenario is a world type (`scenario: "horde"` in the world's record), the map chosen per world rather than by the page's `?map=` (today `MAP_NAME` in `main.js` is read once from the URL and decides which saved worlds are playable): give a world its own map and scenario, so the demo needs no special build and the full game's Worlds screen could list "Horde" later [not in this scope].
- **Escape pauses**, as in any lone world.

## The art it needs (for the final-art rule)

Everything the demo shows, and nothing else, so the commission is small: the ground (grass, dirt, the tilled plot, a path, the wood and [stone] floors; no water but the well's), the trees of the forest and a stump, the bramble thicket, the fallen tree, the wrecked cart, and the signposts, the wood building set (walls in both orientations, a door and a shuttered window open and shut, the board overlays, corner posts, the caps; no stone walls), the furniture and stations named above, the well with its bucket, the provided weapons and items (each a world picture, an icon, and a held picture where held, `26`), the player's body with [three or four] hairs and the starting clothes only (no clothing choices), the dead's skin and [three or four] outfits, the UI kit, the moodle icons, the cursors, the fire, the end card and the logo (which wants the game's name first, `35`). No animals, no villagers but the guide, nothing from the valley beyond this.

## Build order

Each step verified in the browser pane through `window.__game` with `loop.setPaused(true)` and `loop.advance(1/60)` before the next; `?nosave` on the URL; `node --check` on every touched module; the determinism hash of the valley unchanged throughout.

1. **The scenario layer.** `data/scenarios/`, a world's own map and scenario in its record and its save, the rules' override layer (`rules.js`: the scenario's values win over the settings, which are never written: the shared-settings quirk of `CLAUDE.md`), the scenario-only switches (sleep, tiredness, save), the scenario's state in the save and a `scenario` part in the sync check. Verify on the valley that nothing changes with no scenario.
2. **The set.** `wall_thicket` with `blocks`, `wall_invisible`, the walking's one check, the blocked roads and signposts, `homestead.py`, the map with its spawns and no wild dead. Verify: walk the clearing and into the room to move; the thicket stops you with its line; a zombie placed beyond it walks through to you; the outer boundary stops it; the fallen tree and the cart stop you on the roads; the forest beyond is seen; no room is made by either boundary (`check("rooms")`).
3. **The horde.** The spawner (past the spawn distance, walking to the middle), the curve, the ceiling, the stages. Verify by stepping through a scripted day and night, reading the counts against the schedule, and that no body appears within the spawn distance.
4. **The run's limits.** The supplies counted against [three days], the corpse cap.
5. **The score and the end.** The HUD line, the end card, Play again.
6. **The entry.** `?demo`, its title, Play.
7. **Measure.** The ceiling from the profile; the step and render cost there.
8. **The check and the docs.** `tools/checks/horde.js`, `CLAUDE.md` (the code map, the URL, the check), `README` (the demo's link), `TODO.md`, and the rulings the build forced in `02`.

## Acceptance (`await __game.check("horde")`, plus the measured rows by hand)

1. With no scenario the valley boots as before: the determinism hash and every existing check unchanged.
2. The horde world starts at 08:00 with none of the dead; the first spawns after the quiet start.
3. No body ever appears within the spawn distance of the player (checked at every spawn of a scripted day and night, with the player at the clearing's middle and at each side of the player's boundary); each walks toward the middle on appearing.
4. The thicket stops the player and passes the dead; the blocked roads stop the player; the outer boundary stops everyone; nowhere in the set can the player walk into an edge with nothing drawn on it; no dead come from the wild.
5. The cap and the pace follow the schedule by day and by night alike, and stop at the ceiling; past it, each stage begins when the one before reaches its limit.
6. A body's pockets roll from the ordinary table; nothing is replenished; corpses past the cap are removed only out of sight; [a scripted careful player runs out of arrows and planks within about three days].
7. Beds refuse, tiredness does not drain, and nothing is saved in the horde world; the browser's settings are unchanged after a run.
8. The HUD line and the end card's numbers match the counts kept; the best run is kept across runs in the browser and its absence shows nothing; Play again starts a fresh run; the Wishlist button opens the store page (or the site) in a new tab, on the card and on the title.
9. The demo's title has no hosting or joining.
10. Reported: the ceiling chosen and the step and render cost there; the time a scripted idle player and a scripted careful player last, against the tuning target (an idle player sees nightfall).

## Before it is released (Michael)

Built, tested (the acceptance above, and played), and every piece in it in its final art (the list above). Whatever lacks final art by then is left out of the demo, not shown as a placeholder.

## Not in this scope

The endless mode with supply to keep up (`05`), leaderboards (with it), co-op in the demo, other scenarios, the Horde in the full game's Worlds screen, farming in the plot before `30` step 4, saving a run, difficulty choices, the wrapper and Steam (`35`).
