# 09 — Openings: the build record

The art note, the build order, the acceptance list, and the tunables of `docs/09-openings.md`, with its status block as it stood; moved here whole by the sweep, 2026-10-16. The live text is `docs/09-openings.md`. Never edited after.

## The status block as it stood

**Status, 2026-10-13: built** (accepted 2026-10-10). The code is the truth (`src/map.js`, `src/interact.js`, `src/entities/zombie.js`); the numbers below hold; since this was written: each side's boards are a list of each board's own hit points (`wall.boards.near`, `wall.boards.far`), and a map authors them as `boards: { in, out }`; boarding and pulling are in every opening's right-click menu as well as on `B`, a plank spent from the bag; the walls and the board overlays are drawn art (`17`, `18`); **sealed** is derived and shown in the debug corner but gates nothing, since sleep needs only a bed indoors and nothing interrupts it (`30`, 3.3); a guest's `E` and `B` are events in its snapshot that the host performs, and its menu entries are commands by the edge's address (`31`).

## Art

The wall sheet already carries `boarded`, `door_boarded`, and `window_broken` variants from the parent, and the door-open frame is the doorway. Boards on the visible face draw as the boarded variant, one plank per board; boards on the far face are not drawn, since that face is not seen, and the stack still counts them. Hit points are not drawn; a leaf that has taken damage shows nothing until it breaks. The prompt names the stack as it stands: "door, 2 boards outside, 3 inside".

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
3. **Boarded from outside.** Shut a zombie in the shed and board the door from outside. It breaks out through the nearest opening on its side, the dumb rule, not the weakest one: standing by the door it takes the door and the boards; standing by the window it takes the shutters and climbs out.
4. **Light follows the stack.** Boarding the window kills its portal and its spill; breaking the shutters restores an open window's.
5. **Nothing comes back.** A broken door cannot be closed and shows as a doorway; a broken shutter cannot be shut and shows as a hole; the dead get nothing from either.
6. **Michael's night.** Shut, board, light the hearth, wait. It should be tense and legible: you hear nothing, so you must see it, and the lit room through the breaking window is the image.
7. **60 fps** with a breach in view.

If any fails, stop, write down why in `02-decisions.md`, and talk.

## Tunables

Board hp 40, door hp 100, shutter hp 60, breach damage 5 on the bite cooldown; zombie climb 1.6 s; boards per side 3; the shutter leak and the room bounce as before.
