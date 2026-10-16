# 00 — The vision's trimmed sections, as they stood

"The parents" and "What the first milestone must prove" from `docs/00-vision.md`, and the four lines that read single-player or against the generated map, as they stood before the sweep redrafted them for Michael; moved here whole by the sweep, 2026-10-16. The live text is `docs/00-vision.md`. Never edited after.

## The parents

This game is the marriage of two prototypes, both kept exactly as they are:

- **`cozy-zombie-game`** (`C:\Users\micha\Dev\cozy-zombie-game`): the look, the lighting, melee, the grid inventory, moodles, death that turns you and hands the world to the next survivor, saves. Modern suburbia, dollhouse rooms joined by doors.
- **`medieval-zombie-survival`** (`C:\Users\micha\Dev\medieval-zombie-survival`): the setting, no guns, glass windows with curtains and boards, doors barred from inside, the weapon lines, the shield, everything is an item. Side-view, dig anywhere.

What neither could do, and this one exists to do: **walk from building to building fluidly, in one continuous place, with real line of sight in every direction.** Isometric can; 2D has only two directions to look; dollhouse rooms are cuts. See `01-parents.md` for what each offers.

## What the first milestone must prove

1. Walking from the square into a cottage and back out, with no cut, feels better than the dollhouse did.
2. A four-walled isometric building, cut away when you are inside it, looks right in chunky pixel art.
3. Line of sight through a window reveals a wedge of the outside and nothing else, and it reads at a glance.
4. The viewport is big enough for a village without losing the chunky look.

If those four hold, everything else is porting and data. If any fails, stop and talk before porting anything.

## The four lines as they stood (the redrafts are in the live file)

- **Not Zomboid with cute art.** Village scale, dozens of items, a few rules. No body map, no vision cone stance, no skill grind, no water shutoff or power cut.
- **Not an RPG, yet.** No quests for a good long while. Never say never; see `05-someday.md`.
- **Not a procedural world.** Authored structure, scattered filler (ruled 2026-10-09): the roads, buildings, and water are placed by hand; trees, carts, and events are scattered by rule, and the wild beyond the map is forest grown the same way. Nothing that matters is generated.

- **The check before standing up** (Michael, 2026-10-12, the first time): with the game open on his main monitor, he checked that his character was safe before getting up to refill a water bottle, the way he would in an OSRS Ironman or hardcore WoW game. The stakes were real enough to act on. **What it asks of tuning:** do not ease the danger so far that this stops happening. If a tuning change makes testers stop checking before they walk away, it has eased too far; if they never get to leave the keyboard, it may have swung too hard. Whatever fair danger the stagger, bleed, infection, and exposure numbers settle on, this is the feeling they are for. The game runs in real time while its window is visible (Esc pauses, a hidden tab stops), and that is part of why it works; no auto-pause on lost focus unless Michael asks for an option.
