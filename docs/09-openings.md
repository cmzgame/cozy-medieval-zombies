# 09 — Milestone 3: openings, and the dead get in

Ruled 2026-10-10 (`02-decisions.md`, "Openings"). Until now a closed door stops the dead for good. After this milestone your walls are something you prepare, not something you hide behind: you bar the door, board the window, light the hearth, and listen to them hit the boards until dawn. If a board gives, one climbs through the window into the lit room. The melee port comes next, because once they can get in you need something to swing.

## What is already true

- Doors start closed, toggle on a tap of E from either side, and block sight and bodies when shut. The dead cannot open them.
- Windows are shuttered holes. Tap E opens or closes the shutters; hold E climbs through an open one in 0.9 s, uninterruptible, the living only so far.
- Every opening carries a transmission number (`docs/08`), so a boarded shutter is one more state with a number, and the portals and the chunk maps follow it with no new rule.
- Rooms list their openings, and a room's ambient already reads them.

## The opening as a stack

An opening is a leaf between two sides, and each side may carry boards. Michael's rule (2026-10-10): one kind of thing, one number, nothing comes back.

```
wall.boards = { near: 0, far: 0 }   // planks per side, up to BOARDS_PER_SIDE (3)
wall.hp     = the leaf's hit points; wall.broken = true once the leaf is gone
```

The near side of an edge is the tile it belongs to (south of a north edge, east of a west edge); the far side is the tile beyond. An actor's side is the sign of their position against the edge, the same test `outsideSign` makes with rooms.

- **The leaf** is the door, or the shutters. It has health. Broken, a door is an opening that is never a door again, and a shutter is a window that is never shut again. Nothing is repaired; if the dead break your door you do not have a door anymore.
- **Boards** are planks nailed to one side, each with its own health. Any board on either side makes the opening opaque and solid: nothing walks, climbs, or paths through it, open leaf or broken leaf alike.
- **Attack order** from a side: that side's boards, then the leaf, then the far side's boards. When nothing solid is left the way is open.
- **Everything is spent.** A board the dead break is gone. A board you pull is gone. Wood is what you go out for: planks for the walls, logs for the fires.
- **Transmission** from the stack: boards on either side 0; closed whole shutters the leak; a closed door 0; open or broken 1.
- **Bodies:** a door passes when open or broken and unboarded; a window never passes a walking body, only a climb, and a climb needs an open or broken shutter and no boards.
- **Sealed**, per room, each step: every door closed and whole or boarded, every window shuttered and whole or boarded. Shown in the debug corner; sleep reads it later.

## What you can do

Planks are free until the inventory, like logs. `E` keeps its meaning; `B` is boards, a stand-in key until there is more interface.

| At | Tap E | Hold E | Tap B | Hold B |
|---|---|---|---|---|
| a closed door | open it ("boarded" if any board on either side) | | nail a board on your side | pull one of your boards, gone |
| an open door | close it | | nail a board (over the opening) | pull a board |
| closed shutters | open them ("boarded" if boarded) | | nail a board | pull a board |
| open shutters | close them | climb through, unless boarded | nail a board | pull a board |
| a broken opening | nothing to open | climb, if a window and unboarded | nail a board | pull a board |

## What the dead do

- **Finding a way in.** A zombie in `chase` whose path to its goal fails, and whose goal tile is in a room, picks the nearest opening of that room it can reach on its own side (the room's openings, filtered by which side it can path to), paths to the tile beside it, and enters `breach`.
- **Breaching.** Facing the opening, it attacks on the bite cooldown, `BREACH_DAMAGE` (5) into the stack in attack order. Hit points to start: a board 40, a door 100, shutters 60, so one shambler takes about 24 s through a bare door and about 80 s through one boarded three deep on both sides; three of them a third of that. When the way is open it repaths. If the goal moves to another room or it sees the player, it drops the breach and chases.
- **Climbing.** At an open or broken window with no boards, it climbs: 1.6 s against the player's 0.9, no bite while climbing, drawn as the walk through the window. The living and the dead use the same climb code with a different duration.
- **Nothing breaks a wall.** The dead never attack a plain wall. A room with no openings is a room they cannot enter.
- **Noise** stays out. If the hammering on a door ever wants to draw the others, that is question 18 reopened, not this milestone.
- **What breaks is gone**, theirs and yours alike.

## Art

The wall sheet already carries `boarded`, `door_boarded`, and `window_broken` variants from the parent, and the door-open frame is the doorway. Boards on the visible face draw as the boarded variant, one plank per board; boards on the far face are not drawn, since that face is not seen, and the stack still counts them. Hit points are not drawn; a leaf that has taken damage shows nothing until it breaks. The prompt names the stack as it stands: "door, 2 boards outside, 3 inside".

## What this must not foreclose

- **Placing a new door or shutters** is building (question 14), not repair: a broken opening is a plain opening that building could fill again someday.
- **Glass and curtains**, if ever: one more leaf kind with its own transmission and hit points.
- **Building**: an opening is edge state, placed the same way a wall is.
- **Noise**: a breach is an event with a position; nothing else is needed to make it loud later.
- **Villagers**: fleeing through an open door or window uses the same passability and climb.

## Build order

1. The stack on walls: boards, hp, broken; transmission and passability from the stack; sealed per room. The prompt names the stack.
2. The player's actions: E as before, B for boards, both sides.
3. Zombie `breach`: finding the opening, attacking the stack, the way opening.
4. The dead climb.
5. Boards and broken leaves drawn.
6. Acceptance.

## Accept when

1. **The door takes a while.** Close the cottage door and stand in view of the window. A zombie that saw you comes to the door and hits it for about 24 s before it breaks and it walks in. The debug corner showed the cottage sealed until the door broke, and the door is an opening afterward.
2. **Boards buy time.** Three boards each side of that door: about 80 s for one shambler, outside boards first, then the door, then the inside boards. Three boards on the left window from inside: a zombie that picks it breaks them, then the shutters, then climbs through in 1.6 s and cannot bite until it is in.
3. **Boarded from outside.** Shut a zombie in the shed and board the door from outside. It breaks the shutters, not the door, and climbs out.
4. **Light follows the stack.** Boarding the window kills its portal and its spill; breaking the shutters restores an open window's.
5. **Nothing comes back.** A broken door cannot be closed and shows as a doorway; a broken shutter cannot be shut and shows as a hole; the dead get nothing from either.
6. **Michael's night.** Bar, board, light the hearth, wait. It should be tense and legible: you hear nothing, so you must see it, and the lit room through the breaking window is the image.
7. **60 fps** with a breach in view.

If any fails, stop, write down why in `02-decisions.md`, and talk.

## Tunables

Board hp 40, door hp 100, shutter hp 60, breach damage 5 on the bite cooldown; zombie climb 1.6 s; boards per side 3; the shutter leak and the room bounce as before.
