# 00 — Vision

This document is the tiebreaker. When a design or implementation question has no answer in this repo's `docs/`, answer it by asking: **which option best serves a cute medieval village, seen whole through line of sight, invaded by the dead?** Then log the ruling in `02-decisions.md`.

**New game, new gospel.** The parents' decision logs are things to consider, never things to obey. A ruling from either parent binds here only once it is re-made in `02-decisions.md`.

## The idea in one paragraph

A cute isometric pixel village, medieval and low-fantasy: thatched cottages, an inn, a chapel, a well, a smithy, and a knight with a big head. The dead have risen. You move through the village as one continuous place: cross the square, look through the inn's window, see who is inside before you open the door. The world keeps looking cute. The dead keep coming. Underneath the sweetness is a serious survival simulation in the spirit of Project Zomboid, boiled down to a few rules that collide: light, sight, noise, hunger, thirst, sleep, a hearth you keep lit, a garden you tend, and a home you furnish and defend.

## What this game is (2026-10-13)

A survival sandbox with a frontier. Home is the cosy half: the farm, the hearth, the villagers, the place you make. The frontier is the serious half, and the arc is the map: region by region, each beyond the valley darker than the last (a change of region, not a gradient), and you choose when to push, with hard bosses gating the regions once the dead stop being a threat. The world remembers what you did; the character is mortal, and death takes its skills. Whether a skill may touch combat is open (`02`, 2026-10-19). Talking to people is how you learn the world, and never gates anything. The rulings are in `02` under 2026-10-13.

**The world runs in real time.** A solo world pauses only from the pause menu (Esc) and stops while its tab is hidden; a world with friends never pauses while it is played (a server world from #143; `02`, 2026-10-17), and a screen stands this client's player still and stops nothing else, while a panel open stops nothing at all (`02`, 2026-10-13 and 2026-10-15). No auto-pause on lost focus unless Michael asks for an option. That real time is part of why the danger reads: Michael found himself checking that his character was safe before standing up from the keyboard (2026-10-12), and the tuning is for that to keep happening (the playtest signals, as noted: `history/00-playtest-signals.md`).

**The long arc (Michael, 2026-10-13):** normal until it is not. A first day with no dead and villagers teaching the basics; then the dead come; then the frontier, spookier the farther you go, bosses, and by the end the dead a nuisance because you fought a demon lord, whose head hangs in the cosy valley where you began. No story by design, no end boss, no win screen; the survival half sends you home, and the far places hold what home wants. Start: [`images/2026-10-13-vibe-start.webp`](images/2026-10-13-vibe-start.webp). End: [`images/2026-10-13-vibe-end.webp`](images/2026-10-13-vibe-end.webp).

## Tone rules

- **The art stays cute.** Soft proportions, chunky readable pixels, big heads. The dead are recognisably dead and drawn like everyone else. No grimdark.
- **The systems stay serious.** Health, barricades, light, and off-screen threats are real. Going out is a decision.
- **Contrast is the joke and the horror.** Do not resolve it in either direction.
- **Dark medieval fantasy, in pixel art. No guns. Ever.** Michael (2026-10-09): "medieval" is not a ceiling that shuts down ideas. Skeletons with sword and shield, plague doctors, and scarecrow men would all fit, and so would the RPG leanings in `05-someday.md`. The dead are still the point, and nothing fantastical is scheduled.
- **Deaths are stated plainly.** "The bite took you."
- **Cheery at home, spooky beyond, never permanently night.** The valley is bright and cosy, start-as-Stardew; the regions beyond it are spooky and a bit haunted, Tirisfal Glades for the darkest, a place where Halloween never quite ends: dull grass, thick walls, dusky shade. The mood changes region by region, not as a gradient (Michael, 2026-10-25: "Tirisfal was always for the outer regions. The idea was always the further you go from home the spookier it gets, we changed the interpretation to be more of a region than gradient change"). How bright the valley is drawn is #426. Cute and gloomy are not in conflict; the knight still has a big head. See `06-art.md`.

- **Goobers.** The people are small neutral figures, the same body for everyone, the dead included. Gender is read from dress and hair if at all, never from the body, and the game's text says they and them. (Michael, 2026-10-10.)

## Pillars

1. **One continuous place.** Buildings are made of the same tiles as the street. No cut between inside and outside. You look out a window; they look in.
2. **Sight is the game.** What you can see is what can see you. Light and line of sight are one system: darkness hides, fire reveals, and a lit window is an invitation. So is the torch in your hand: at night the dead see a flame from far further than they see a person.
3. **The home matters.** You furnish it, light it, barricade it, sleep in it, and grow food beside it. Decoration has mechanical weight. Farming is load-bearing: simple, Stardew-like, and if it is not fun the game probably is not either.
4. **Fire and resources are the economy.** The hearth is light, warmth, and cooking. Wood, water, and seed are what you go out for. Nothing shuts off on a timer; things run out because you used them. This, and the setting, is what separates the game from Zomboid while the open world moves toward it.
5. **One rule or one meter.** Depth comes from a few simple rules colliding, never from a body map or a spreadsheet.
6. **Dumb, distributed dead.** Unpredictability comes from distribution and persistence, not intelligence.
7. **Everything is visible.** Fast states are bars. Slow needs are moodles with the number hidden.
8. **The village is not empty.** A few villagers with no weapons, who flee, follow, and stay, and are immune to the dead: "the game needs them to be there" (Michael, 2026-10-28, `02`).

The probe of 2026-10-09 proved what the first milestone had to: the walk from the square into a cottage with no cut, the cut-away building, the window's wedge of sight, and a viewport big enough for a village. Everything since has been porting and data (the four proofs as written: `history/00-vision-trimmed.md`).

## What it is not

- **Not Zomboid with cute art.** Village scale, dozens of items, a few rules. No body map, no vision cone stance, no water shutoff or power cut; skills, when they come, are the fourteen of the skills scope (#275), and whether any touches combat is open (`02`, 2026-10-19).
- **Not the 2D sibling in isometric.** No digging, no terrain editing, no mining tiers. The ground is the ground.
- **A hand-authored world, with procedural filling of the spaces it leaves empty.** Today the valley's roads, buildings, river, and farms are generated by `tools/mapgen/valley.py` from a description of each place, the same every time, and trees, rocks, and the dead are scattered by rule from a seed; the wild beyond the map grows as forest the same way. That is the direction, not a wall (Michael, 2026-10-16): where the game lands between authored and grown is open.
- **Not finished art.** Placeholders through the same pipeline real sprites will use.

## Guiding principles for rulings

- Prefer the option that keeps sight honest: if you could see it, you see it; if they could see you, they do.
- Prefer the option that adds no special case to tiles. A window is a wall on a tile edge with a kind and a shutter state, not a system.
- Prefer dumb distributed dead over clever ones.
- Prefer placeholder art that exercises the real pipeline over waiting for art.
- When in doubt, cut. Look at how a parent did it before writing anything new, then decide for this game.

## Laws

Rulings that outrank the rest of this document. Added as Michael states them.

- **If the game is good, people will sit for a loading screen.** (Michael, 2026-10-10.) Never let the cost of a load, or an assumption about what a browser cannot do, squash a good idea. Dynamic lighting was "something browsers can't do" until it was built in an afternoon; so was a window-filling world. Build the thing the way it is truly wanted, measure it, and only then decide what it costs.
- **Never harder on a clock.** (Michael, 2026-10-13.) No world decay, no shutoffs, no scheduled horde, no danger that grows with the days. Every rise in danger is one a player chose: you went to the bog and brought some of the bog home with you. The reason is co-op: when one friend plays forty hours a week and the other two, the one who plays on must never be punished for it, and the one who returns must never come back to a debt. (`02`, 2026-10-13, "What this game is".)
