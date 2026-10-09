# 09 — Milestone 3: openings, and the dead get in

Ruled 2026-10-10 (`02-decisions.md`, "Openings"). Until now a closed door stops the dead for good. After this milestone your walls are something you prepare, not something you hide behind: you bar the door, board the window, light the hearth, and listen to them hit the boards until dawn. If a board gives, one climbs through the window into the lit room. The melee port comes next, because once they can get in you need something to swing.

## What is already true

- Doors start closed, toggle on a tap of E from either side, and block sight and bodies when shut. The dead cannot open them.
- Windows are shuttered holes. Tap E opens or closes the shutters; hold E climbs through an open one in 0.9 s, uninterruptible, the living only so far.
- Every opening carries a transmission number (`docs/08`), so a boarded shutter is one more state with a number, and the portals and the chunk maps follow it with no new rule.
- Rooms list their openings, and a room's ambient already reads them.

## The opening as a stack

An opening is a leaf between two sides. Each side may carry fittings. The stack is read from whoever is acting on it.

```
wall.bars   = { near: false, far: false }   // one bar per side
wall.boards = { near: 0, far: 0 }          // planks per side, up to 3
wall.hp     = leaf hit points; wall.broken = true once the leaf is gone
```

The near side of an edge is the tile it belongs to (south of a north edge, east of a west edge); the far side is the tile beyond. An actor's side is the sign of their position against the edge, the same test `outsideSign` makes with rooms.

- **A bar** holds the leaf shut for both sides. Only the side that placed it removes it. It does not block light.
- **Boards** are planks nailed to one side. Any board on either side makes the opening opaque and solid, open leaf or broken leaf alike. Up to three a side, each with its own hit points.
- **The leaf** is the door or the shutters. Broken, a door is a doorway that cannot be closed and a shutter is an open window that cannot be shut.
- **Attack order** from a side: that side's boards, that side's bar, the leaf, the far side's bar, the far side's boards. The way is open when nothing solid is left in that order.
- **Transmission** from the stack: boards on either side 0; a closed, whole shutter the leak; a closed door 0; open or broken 1. Bars change nothing.
- **Bodies:** a door passes when open or broken with no boards anywhere; a window never passes a walking body, only a climb, and a climb needs an open or broken shutter with no boards.
- **Sealed**, per room, each step: every door closed and whole, every window shuttered or boarded and whole. Shown in the debug corner; sleep reads it later.

## What you can do

Planks are free until the inventory, like logs. `E` keeps its meaning and gains a hold on a closed leaf; `B` is boards.

| At | Tap E | Hold E | Tap B | Hold B |
|---|---|---|---|---|
| a closed door | open it, unless barred ("barred from the other side" if not yours) | bar it on your side, or lift your bar | nail a board on your side | pull one of your boards |
| an open door | close it | | | |
| closed shutters | open them, unless barred | bar them on your side, or lift your bar | nail a board | pull a board |
| open shutters | close them | climb through, unless boarded | nail a board (closes nothing; boards go over the hole) | pull a board |
| a broken opening | nothing to open | climb, if a window and not boarded | nail a board | pull a board |

Pulling a board hands the plank back or not by open question 6, decided here: **spent** (my lean; Michael rules). Lifting a bar is state, nothing is spent.

## What the dead do

- **Finding a way in.** A zombie in `chase` whose path to its goal fails, and whose goal tile is in a room, picks the nearest opening of that room it can reach on its own side (the room's openings, filtered by which side it can path to), paths to the tile beside it, and enters `breach`.
- **Breaching.** Facing the opening, it attacks on the bite cooldown, the bite's damage into the stack in attack order. Hit points to start: a board 20, a bar 50, a door 60, shutters 30. When the way is open it repaths. If the goal moves to another room or it sees the player, it drops the breach and chases.
- **Climbing.** At an open or broken window with no boards, it climbs: 1.6 s against the player's 0.9, no bite while climbing, drawn as the walk through the window. The living and the dead use the same climb code with a different duration.
- **Nothing breaks a wall.** The dead never attack a plain wall. A room with no openings is a room they cannot enter.
- **Noise** stays out. If the hammering on a door ever wants to draw the others, that is question 18 reopened, not this milestone.
- **What breaks returns nothing.**

## Art

The wall sheet already carries `boarded`, `door_boarded`, and `window_broken` variants from the parent, and the door-open frame is the doorway. A bar is a thick plank across the leaf on the visible face, drawn by the renderer like a bracket; boards and bars on the far face are not drawn, since that face is not seen, and the stack still counts them. Hit points are not drawn; a leaf that has taken damage shows nothing until it breaks. The prompt names the stack as it stands: "door, barred inside, 2 boards outside".

## What this must not foreclose

- **Repair** (the inventory): a broken leaf is replaced by placing a new one; the opening keeps its stack.
- **Glass and curtains**, if ever: one more leaf kind with its own transmission and hit points.
- **Building**: an opening is edge state, placed the same way a wall is.
- **Noise**: a breach is an event with a position; nothing else is needed to make it loud later.
- **Villagers**: fleeing through an open door or window uses the same passability and climb.

## Build order

1. The stack on walls: bars, boards, hp, broken; transmission and passability from the stack; sealed per room. The prompt names the stack.
2. The player's actions: E and B, both sides.
3. Zombie `breach`: finding the opening, attacking the stack, the way opening.
4. The dead climb.
5. Bars and boards drawn; broken leaves drawn.
6. Acceptance.

## Accept when

1. **The bar holds, then gives.** Bar the cottage door from inside and stand in view of the window. A zombie that saw you comes to the door and hits it; the door breaks first, then the bar, then it walks in. The debug corner showed the cottage sealed until the door broke.
2. **Boards buy time.** Three boards on the left window from inside. A zombie goes to the nearest opening of the room, breaks the boards one by one, then the shutters, then climbs through in 1.6 s and cannot bite until it is in.
3. **Barred from outside.** Shut a zombie in the shed and bar the door from outside. It breaks the shutters, not the door, and climbs out.
4. **Light follows the stack.** Boarding the window kills its portal and its spill; breaking the shutters restores an open window's.
5. **Nothing comes back.** A broken door cannot be closed and shows as a doorway; a broken shutter cannot be shut and shows as a hole; the dead get nothing from either.
6. **Michael's night.** Bar, board, light the hearth, wait. It should be tense and legible: you hear nothing, so you must see it, and the lit room through the breaking window is the image.
7. **60 fps** with a breach in view.

If any fails, stop, write down why in `02-decisions.md`, and talk.

## Tunables

Board hp 20, bar hp 50, door hp 60, shutter hp 30; zombie climb 1.6 s; boards per side 3; breach damage equals bite damage; the shutter leak and the room bounce as before.
