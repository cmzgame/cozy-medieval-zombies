# 04 — NPCs

**Status (2026-10-12):** villagers v0.1 is built on the character model (`19`): they idle, wander on a tether, answer a poke, the dead can hunt them behind a setting, and a bitten one turns. **Fleeing, following, staying, routines, lines, and bags are not built** (on the backburner until a bigger NPC pass, `02` 2026-10-12); the "frozen when far away" row below rests on `03`'s records, which are not built either (today a 40-tile box in `src/main.js` freezes them).

**Status (2026-10-12):** the first cut is scoped in `19-characters.md`: one character model for the player, the dead, and villagers (everyone dressed from items, speech for anyone, clicks by kind, the corpse as a container), with villagers v0.1 on it (figures that wander and say "Hey!" when poked). Steps 1 to 3 of it are built (the dead dressed from items, speech, four villagers who wander and answer a poke), and **the dead can hunt villagers, who die and turn in their own clothes, behind a setting** (the player always preferred), and **a dead zombie is a container you can search and strip** (`19`, step 4); fleeing waits for a bigger NPC behaviour pass (Michael, 2026-10-12: actions to take, dialogue to share; the stubs as built are right as they are, and villagers rising as the dead is a keeper); nothing below is built yet beyond that; the scope is written so none of it is foreclosed, and it closes open points 3 and 4 by default (swings pass through the living; the turned keep their clothes).

Michael's question (2026-10-08): Zomboid single player is lonely once the TV goes out. A few NPCs in the village would open gameplay. He first offered hard limits (stand or pace, maybe invulnerable), then, on reading the assessment below, ruled: **killable; flee until they cannot, then die and turn; no weapons, never fight for you; the player can tell one to follow or to stay; frozen as notes beyond the active region; and do not cripple them out of worry for the browser.** The assessment is kept as written, with the rulings folded in where they land.

## What the engine already gives an NPC

Almost everything. The cozy parent's zombie is a character with a sprite, states, A\* movement, line of sight, a record form for when it is off screen, a container for its pockets, and a death that turns it. An NPC is that file with the biting taken out.

| NPC needs | Already exists |
|---|---|
| A body on screen with idle and walk animations, sorted and occluded | the character placeholder generator with a different palette, the renderer |
| Standing still or pacing a route | zombie `idle` and `wander`, with the route as a list of tiles and A\* between them |
| Frozen when far away, back where you left it when you return | records and materialisation |
| Being talked to | the right-click menu, the prompt, and the floating message |
| Having things | a bag, the same grid every container and body uses |
| Dying and turning | the death sequence, the `former` sprite trick, and bodies as containers |
| Saving | one more record kind |

The only genuinely new code is a route follower with time-of-day gates and a line scheduler for what they say. Both are small.

## Killable, or invulnerable and hiding

Michael offered both. My read:

**Invulnerable.** Cheapest in one way: zombies never need to notice anyone but the player, so `zombie.js` is untouched. But it breaks the one rule the game keeps everywhere else, that the dead attack the living, and it breaks it in the player's face: a zombie walks past the innkeeper to reach you. The hide animation covers it only if NPCs are always indoors behind barred doors, and then a break-in at the inn, which happens inside the active region by the rulings, has nowhere to go.

**Killable.** The dead attack whatever living thing they can see, nearest first. NPCs have hp and no weapons and never fight back. If one is reached, it dies and turns, which costs nothing because turning exists. The change is contained: zombie target selection goes from "the player" to "the nearest visible living target", one function. What it buys is large. Protecting the smith is a reason to defend the village and not only your house. A turned innkeeper behind the bar is the game's tone in one image. And the dead leaving a trail of turned villagers is a clock on the loneliness Michael wants to fix, which is the right kind of pressure: the village empties if you let it.

**Ruled: killable, and they flee.** Michael: flee until they cannot, so a single wanderer in your base does not kill a man standing still. Fleeing is one rule: when a dead thing is in sight, step to the walkable neighbour that most increases distance from the nearest one, prefer tiles toward home if home is known, and when no neighbour helps you are cornered and you die and turn. No weapons, ever, and they never fight for the player; Michael finds that uninteresting and it keeps combat one system. A fleeing villager who leads a horde to your door is emergent and welcome.

**Follow and stay.** Right-click a villager: "Follow me" paths them to stay within a couple of tiles of the player, same loop a chasing zombie uses with a stopping distance; "Stay here" parks them on the tile you point at. That is how you bring a villager home and keep him, and it is the groundwork for everything in `05-someday.md` about vendors and relationships.

## What talking to one does

Three steps, each worth having on its own.

1. **Presence and lines.** Right-click, "Talk". One floating line from a small script keyed to the day and to what has happened. This is the medieval game's radio: "the bells at the chapel stopped yesterday", "stay in tonight, they are restless". NPCs forecast events the way Zomboid's emergency broadcast does, which recovers the best thing the modern setting had.
2. **Routines.** Each NPC has a day: the innkeeper behind the bar until dusk, the priest to the bell tower at dawn. Routines are routes with time gates. They give the village a rhythm, which is most of what Stardew's charm is, and they create emergent rules for free: the dawn bell is a noise event with an NPC cause, so if the priest dies the bell stops, and the village notices.
3. **Things.** An NPC's bag opens like a container. "The innkeeper shares what he has" is take-only at first. Barter, if ever, is give-and-take through the same panel. No quests, no dialogue trees. The sibling's "progress without prose" holds.

## Limits, as Michael set them

- No needs, no mood, no goals of their own beyond fleeing, following, and staying. NPCs do not eat or sleep.
- No interaction beyond the active region. A note with `kind: npc` sits at its tile and its route does not tick. Routines resume from the current time of day when the NPC is real again, so nobody is found mid-stride where they could not be.
- A dead NPC's turned body is an ordinary zombie record from then on and wanders like one.
- The village has a handful, not a crowd. Six to ten.

## Cost and order

About one milestone once combat, death and turning, and openings are ported, because it reuses all three. Presence, fleeing, follow and stay, and lines first; routines second; bags third. It should come before furniture moving, since a village with people in it changes what furniture is for, and after sleep, since routines want the clock.

## Open points, for the NPC milestone

1. ~~Killable or invulnerable?~~ Ruled: killable, fleeing, no weapons.
2. ~~Do NPCs defend themselves?~~ Ruled: never.
3. Can the player hurt an NPC? Lean: no. Swings pass through the living. Nothing in the vision wants that choice.
4. Does a turned NPC keep its clothes, like a former survivor? Lean: yes, that is the whole image.
5. Does a following villager keep following across the whole village, or stop at the active boundary? Lean: they are in the active region by definition while following, so this never comes up; a villager told to stay is a note when you leave.
6. What do they say, and when? Decided when the lines are written.
