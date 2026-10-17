# 09 — Milestone 3: openings, and the dead get in

**Status, 2026-10-16: built (accepted 2026-10-10); a reference. Nobody climbs through a window, player or dead (Michael, 2026-10-16, #134; `02`):** a window is for sight and light, shuttered or open or broken, and a door is the only way through; the climb, its hold of E, and its numbers are gone, and the dead who want a room go for its doors. The code is the truth (`src/map.js`, `src/interact.js`, `src/entities/zombie.js`) and the numbers below hold. As built: each side's boards are a list of each board's own hit points (`wall.boards.near`, `wall.boards.far`), and a map authors them as `boards: { in, out }`; boarding and pulling are in every opening's right-click menu as well as on `B`, a plank spent from the bag; the walls and the board overlays are drawn art (`17`, `18`); **sealed** is derived and shown in the debug corner but gates nothing, since sleep needs only a bed indoors and nothing interrupts it (`30`, 3.3); a guest's `E` and `B` are events in its snapshot that the host performs, and its menu entries are commands by the edge's address (`31`). The art note, the build order, the acceptance, and the tunables are `history/09-openings-build.md`.

Ruled 2026-10-10 (`02-decisions.md`, "Openings"). Until now a closed door stops the dead for good. After this milestone your walls are something you prepare, not something you hide behind: you shut the door, board the window, light the hearth, and listen to them hit the boards until dawn. If a board gives, the door goes, and they come in by it. The melee port comes next, because once they can get in you need something to swing.

## What is already true

- Doors start closed, toggle on a tap of E from either side, and block sight and bodies when shut. The dead cannot open them.
- Windows are shuttered holes. Tap E opens or closes the shutters; nothing passes through one, open or broken (they were climbable until 2026-10-16).
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
- **Boards** are planks nailed to one side, each with its own health. Any board on either side makes the opening opaque and solid: nothing walks or paths through it, open leaf or broken leaf alike.
- **Attack order** from a side: that side's boards, then the leaf, then the far side's boards. When nothing solid is left the way is open.
- **Everything is spent.** A board the dead break is gone. A board you pull is gone. Wood is what you go out for: planks for the walls, logs for the fires.
- **Transmission** from the stack: boards on either side 0; closed whole shutters the leak; a closed door 0; open or broken 1.
- **Bodies:** a door passes when open or broken and unboarded; a window never passes a body, whatever state its shutters are in.
- **Sealed**, per room, each step: every door closed and whole or boarded, every window shuttered and whole or boarded. Shown in the debug corner; sleep reads it later.

## What you can do

Planks were free until the inventory (milestone 4, 2026-10-10); a board spends a real plank now, like logs feed a fire. `E` keeps its meaning; `B` is boards, a stand-in key until there is more interface.

| At | Tap E | Tap B | Hold B |
|---|---|---|---|
| a closed door | open it ("boarded" if any board on either side) | nail a board on your side | pull one of your boards, gone |
| an open door | close it | nail a board (over the opening) | pull a board |
| closed shutters | open them ("boarded" if boarded) | nail a board | pull a board |
| open shutters | close them | nail a board | pull a board |
| a broken opening | nothing to open | nail a board | pull a board |

Hold E does nothing: nobody climbs through a window (Michael, 2026-10-16, #134), so an open window is for looking through, never for going through.

## What the dead do

- **Finding a way in, or out.** A zombie in `chase` whose path to its goal fails picks a room to breach: the one it is shut in, if its goal is elsewhere, else the one its goal is in. It takes a **door** of that room, never a window: out of a room, the door that leads toward its goal's room, else the nearest; into one, the nearest door it can walk to and stand beside. When every door of the room opens from another shut room (a hall, a porch, a house within a house), it breaks that room's door first, a few rooms deep (`wayIn` in `zombie.js`). It paths to the tile beside the door and enters `breach`. Nearest, not weakest: the dead are dumb. A dead one that sees a player through an open window therefore walks away from the window to a door and breaks it: **a window is never a safe spot.** They do not batter a window's shutters or boards either (Michael's default, for him to overrule: it would get them nothing).
- **Breaching.** Facing the opening, it attacks on the bite cooldown, `BREACH_DAMAGE` (5) into the stack in attack order. Hit points to start: a board 40, a door 100, shutters 60, so one shambler takes about 24 s through a bare door and about 80 s through one boarded three deep on both sides; three of them a third of that. When the way is open it repaths. If the goal moves to another room or it sees the player, it drops the breach and chases.
- **Nothing breaks a wall.** The dead never attack a plain wall. A room with no openings is a room they cannot enter.
- **Noise** stays out. If the hammering on a door ever wants to draw the others, that is question 18 reopened, not this milestone.
- **What breaks is gone**, theirs and yours alike.

## What this must not foreclose

- **Placing a new door or shutters** is building (question 14), not repair: a broken opening is a plain opening that building could fill again someday.
- **Glass and curtains**, if ever: one more leaf kind with its own transmission and hit points.
- **Building**: an opening is edge state, placed the same way a wall is.
- **Noise**: a breach is an event with a position; nothing else is needed to make it loud later.
- **Villagers**: fleeing through an open door uses the same passability (a window is no way out).
