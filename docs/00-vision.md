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

## Pillars

1. **One continuous place.** Buildings are made of the same tiles as the street. No cut between inside and outside. You look out a window; they look in.
2. **Sight is the game.** What you can see is what can see you. Light and line of sight are one system: darkness hides, lamps reveal, and a lit window is an invitation.
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
- **Not a procedural world, at first.** One hand-authored village. Prove the loop in it.
- **Not finished art.** Placeholders through the same pipeline real sprites will use.

## Guiding principles for rulings

- Prefer the option that keeps sight honest: if you could see it, you see it; if they could see you, they do.
- Prefer the option that adds no special case to tiles. A window is a tile with two booleans, not a system.
- Prefer dumb distributed dead over clever ones.
- Prefer placeholder art that exercises the real pipeline over waiting for art.
- When in doubt, cut. Look at how a parent did it before writing anything new, then decide for this game.
