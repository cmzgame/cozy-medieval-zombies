# Art 09: Cutaway wall stubs (kept in the back pocket)

**Status: drawn and previewed, not imported, deliberately on the backburner.** Delivered as `stubs_v1.zip`; not in the repo. Michael (2026-10-12): the stubs look "fantastic" but the full walls stay for now. Idea logged in `05-someday.md`. Written 2026-10-12.

## Why they exist

The game once drew the walls between the player and the camera as low stumps. Michael retired that (2026-10-11) in favour of translucent full walls so doors and windows read and work the same inside and out, but he keeps the idea: the translucent wall muddies a scene when a wooden wall covers a wooden floor with a wooden table and chairs and another wooden wall behind. If the stubs come back, they need **cut-down segments per material and orientation**, each with a cut cap, a door gap, and window posts. These are that art.

(The old dev stubs had "sunken frames" as a leftover of faked near edges; the new ones keep the real geometry, so doors and windows are the same pieces cut lower.)

## What there is

66 PNGs in two heights, **16 px** (`stub16_*`) and **24 px** (`stub24_*`), 33 each, plus `anchors_stubs.json` and previews:

- `stub<h>_<wood|stone|log>_<north|west>_<plain|door_shut|door_open|window>` (24 per height): the same segment as the full wall, cut off at the stub height and **topped with a cut face that shows the wall's cross-section**, a step lighter than a finished cap, so it reads as a sliced wall and not a low fence. The window has a single `window` variant (see "Doors and windows" below).
- `stub<h>_post_<mat>` (3): posts cut to the same height.
- `stub<h>_door_leaf_<mat>_<north|west>` (6): the open door leaf cut to match.
- Previews: `preview_room_stub{16,24}_{1x,3x}.png` (a room with its near walls as stubs) and `preview_pieces_stub{16,24}_{1x,3x}.png` (every piece).

**Cut faces:** wood shows the end grain of the planks with joints matching the planks below (`#a27a52` / `#9a734c`, joints `#5e412b`); stone shows a rubble core of irregular stones in mortar (`#aaa49b` family, mortar `#6c6761`); log shows a split log seen from above, grain running along the wall (`#c49e6c`, darkening to bark at the edges, `#5a3c22`).

**Doors and windows:** a doorway is a gap in the stub with a 2 px sill; a shut door is the plank leaf sliced at the same height with its own cut top (outlined, since the player uses it). A window variant is the wall cut at the stub height: at **24 px** it shows the sill and two 2 px frame posts either side of the opening (the sill is at 22); at **16 px** the stub is below the sill, so the window variant is just a plain cut wall. That is a real difference between the two heights.

**Same footprint, same sort keys:** a stub keeps the full wall's footprint and anchor convention (top vertex at ground level) with its own anchors in `anchors_stubs.json` (for example `stub16_wood_north_plain`: anchor `[7, 20]`, size 47 x 40). Posts follow the same material rule as full walls (stone over log over wood).

## How to use them if they come back

- Draw a stub in place of a full wall for **near walls only** (the ones between the player and the camera while the player is inside), choosing 16 or 24 px by eye (24 keeps a window sill at a readable height; 16 reads lower and tidier).
- Doors and windows read the same either way, which is the point; open leaves and shutters need the cut leaf sprites.
- The engine already decides which walls are near (`isNearWall`); the stub mode would be a render choice alongside translucency (the old `K` key and `cutaway: "stub"` value were removed in `17`).

## Open items

- Which stub height; whether stubs fade or cut instantly as the player moves.
- Far-side leaves and board overlays are not cut for stubs.
- An **interior-only** rule (stubs only for the building the player is in) is an engine question, not an art one. Project Zomboid's cutaway is engine-level and visual only, tied to the player being indoors or behind a wall; the "only the building you're in" part is an inference.
