# 00 — Vision

This document is the tiebreaker. When a design or implementation question has no answer in this repo's `docs/`, answer it by asking: **which option best serves a cute medieval village, seen whole through line of sight, invaded by the dead?** Then log the ruling in `02-decisions.md`.

**New game, new gospel.** The parents' decision logs are things to consider, never things to obey. A ruling from either parent binds here only once it is re-made in `02-decisions.md`.

## The idea in one paragraph

A cute isometric pixel village in the Habbo / early-2000s style, medieval and low-fantasy: thatched cottages, an inn, a chapel, a well, a smithy, and a knight with a big head. The dead have risen. You move through the village as one continuous place: cross the square, look through the inn's window, see who is inside before you open the door. The world keeps looking cute. The dead keep coming. Underneath the sweetness is a serious survival simulation in the spirit of Project Zomboid, boiled down to a few rules that collide: light, sight, noise, hunger, thirst, sleep, a hearth you keep lit, a garden you tend, and a home you furnish and defend.

## The parents

This game is the marriage of two prototypes, both kept exactly as they are:

- **`cozy-zombie-game`** (`C:\Users\micha\Dev\cozy-zombie-game`): the look, the lighting, melee, the grid inventory, moodles, death that turns you and hands the world to the next survivor, saves. Modern suburbia, dollhouse rooms joined by doors.
- **`medieval-zombie-survival`** (`C:\Users\micha\Dev\medieval-zombie-survival`): the setting, no guns, glass windows with curtains and boards, doors barred from inside, the weapon lines, the shield, everything is an item. Side-view, dig anywhere.

What neither could do, and this one exists to do: **walk from building to building fluidly, in one continuous place, with real line of sight in every direction.** Isometric can; 2D has only two directions to look; dollhouse rooms are cuts. See `01-parents.md` for what each offers.

## Tone rules

- **The art stays cute.** Soft proportions, chunky readable pixels, big heads. The dead are recognisably dead and drawn like everyone else. No grimdark.
- **The systems stay serious.** Health, barricades, light, and off-screen threats are real. Going out is a decision.
- **Contrast is the joke and the horror.** Do not resolve it in either direction.
- **Dark medieval fantasy, in pixel art. No guns. Ever.** Michael (2026-10-09): "medieval" is not a ceiling that shuts down ideas. Skeletons with sword and shield, plague doctors, and scarecrow men would all fit, and so would the RPG leanings in `05-someday.md`. The dead are still the point, and nothing fantastical is scheduled.
- **Deaths are stated plainly.** "The bite took you."
- **Spooky, a bit haunted, never permanently night.** Tirisfal Glades, not Stardew: a place where Halloween never quite ends. Dull grass, thick walls, dusky shade. Cute and gloomy are not in conflict; the knight still has a big head. See `06-art.md`.

- **Goobers.** The people are small neutral figures, the same body for everyone, the dead included. Gender is read from dress and hair if at all, never from the body, and the game's text says they and them. (Michael, 2026-10-10.)

## Pillars

1. **One continuous place.** Buildings are made of the same tiles as the street. No cut between inside and outside. You look out a window; they look in.
2. **Sight is the game.** What you can see is what can see you. Light and line of sight are one system: darkness hides, fire reveals, and a lit window is an invitation. So is the torch in your hand: at night the dead see a flame from far further than they see a person.
3. **The home matters.** You furnish it, light it, barricade it, sleep in it, and grow food beside it. Decoration has mechanical weight. Farming is load-bearing: simple, Stardew-like, and if it is not fun the game probably is not either.
4. **Fire and resources are the economy.** The hearth is light, warmth, and cooking. Wood, water, and seed are what you go out for. Nothing shuts off on a timer; things run out because you used them. This, and the setting, is what separates the game from Zomboid while the open world moves toward it.
5. **One rule or one meter.** Depth comes from a few simple rules colliding, never from a body map or a spreadsheet.
6. **Dumb, distributed dead.** Unpredictability comes from distribution and persistence, not intelligence.
7. **Everything is visible.** Fast states are bars. Slow needs are moodles with the number hidden.
8. **The village is not empty.** A few villagers with no weapons, who flee, follow, stay, and die. Keeping them alive is a reason to defend more than your own door.

## What the first milestone must prove

1. Walking from the square into a cottage and back out, with no cut, feels better than the dollhouse did.
2. A four-walled isometric building, cut away when you are inside it, looks right in chunky pixel art.
3. Line of sight through a window reveals a wedge of the outside and nothing else, and it reads at a glance.
4. The viewport is big enough for a village without losing the chunky look.

If those four hold, everything else is porting and data. If any fails, stop and talk before porting anything.

## What it is not

- **Not Zomboid with cute art.** Village scale, dozens of items, a few rules. No body map, no vision cone stance, no skill grind, no water shutoff or power cut.
- **Not an RPG, yet.** No quests for a good long while. Never say never; see `05-someday.md`.
- **Not the 2D sibling in isometric.** No digging, no terrain editing, no mining tiers. The ground is the ground.
- **Not a procedural world.** Authored structure, scattered filler (ruled 2026-10-09): the roads, buildings, and water are placed by hand; trees, carts, and events are scattered by rule, and the wild beyond the map is forest grown the same way. Nothing that matters is generated.
- **Not finished art.** Placeholders through the same pipeline real sprites will use.

## Guiding principles for rulings

- Prefer the option that keeps sight honest: if you could see it, you see it; if they could see you, they do.
- Prefer the option that adds no special case to tiles. A window is a wall on a tile edge with a kind and a shutter state, not a system.
- Prefer dumb distributed dead over clever ones.
- Prefer placeholder art that exercises the real pipeline over waiting for art.
- When in doubt, cut. Look at how a parent did it before writing anything new, then decide for this game.

## Playtest signals: how we know it is working

Soft measures of immersion, noted when they happen, so later tuning can be judged against them.

- **The check before standing up** (Michael, 2026-10-12, the first time): with the game open on his main monitor, he checked that his character was safe before getting up to refill a water bottle, the way he would in an OSRS Ironman or hardcore WoW game. The stakes were real enough to act on. **What it asks of tuning:** do not ease the danger so far that this stops happening. If a tuning change makes testers stop checking before they walk away, it has eased too far; if they never get to leave the keyboard, it may have swung too hard. Whatever fair danger the stagger, bleed, infection, and exposure numbers settle on, this is the feeling they are for. The game runs in real time while its window is visible (Esc pauses, a hidden tab stops), and that is part of why it works; no auto-pause on lost focus unless Michael asks for an option.

- **"And suddenly four hours had gone by"** (Michael, 2026-10-12, named as the harder test and "the single best feedback you can get"): a tester who looks up and finds the time gone. It cannot be provoked or tuned for directly; it is the result of everything above holding together (the danger fair, the loop with a next thing to do, nothing in the way). **When a session reports it, ask what they were doing in the last half hour**, and protect that. Its opposite, a tester who keeps checking the clock or hunting for the next task, is the signal that the loop has a gap.

## Laws

Rulings that outrank the rest of this document. Added as Michael states them.

- **If the game is good, people will sit for a loading screen.** (Michael, 2026-10-10.) Never let the cost of a load, or an assumption about what a browser cannot do, squash a good idea. Dynamic lighting was "something browsers can't do" until it was built in an afternoon; so was a window-filling world. Build the thing the way it is truly wanted, measure it, and only then decide what it costs.
- **Never harder on a clock.** (Michael, 2026-10-13.) No world decay, no shutoffs, no scheduled horde, no danger that grows with the days. Every rise in danger is one a player chose: you went to the bog and brought some of the bog home with you. The reason is co-op: when one friend plays forty hours a week and the other two, the one who plays on must never be punished for it, and the one who returns must never come back to a debt. (`02`, 2026-10-13, "What this game is".)

## What this game is (2026-10-13)

A survival sandbox with a frontier. Home is the cosy half: the farm, the hearth, the villagers, the place you make. The frontier is the serious half, and the arc is the map: darker the farther and deeper you go, and you choose when to push, with hard bosses gating the regions once the dead stop being a threat. The world remembers what you did; the character is mortal. Skills never make you hit harder. Talking to people is how you learn the world, and never gates anything. The rulings are in `02` under that date.

**The long arc (Michael, 2026-10-13):** normal until it is not. A first day with no dead and villagers teaching the basics; then the dead come; then the frontier, spookier the farther you go, bosses, and by the end the dead a nuisance because you fought a demon lord, whose head hangs in the cosy valley where you began. No story by design, no end boss, no win screen; the survival half sends you home, and the far places hold what home wants. Start: [`images/2026-10-13-vibe-start.webp`](images/2026-10-13-vibe-start.webp). End: [`images/2026-10-13-vibe-end.webp`](images/2026-10-13-vibe-end.webp).
