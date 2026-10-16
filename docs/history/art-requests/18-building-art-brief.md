> **A record, moved whole by the sweep, 2026-10-16.** The brief for the building pieces (the log wall set, the board overlays, the placement previews; 2026-10-11), delivered the same day in `village_art(1)`. It came from `docs/18-building-art-brief.md`, unchanged below this banner, and nothing stays at that path; the live text is `docs/sprite-definitions.md` and `docs/art/05`; the placement previews were never copied into the repo.

# 18 — Art brief for Claude Design: building pieces

**Delivered and in the game (2026-10-11).** The log walls, the board overlays, and the far-side leaves came back in `village_art(1)` and are built (`17`, steps 2 and 3). Kept as the record. **Status, 2026-10-13:** nothing from this brief is owed; the placement previews were not copied into the repo.

Michael, 2026-10-11, after the village art (`17`) arrived. Two things players will do with walls that the first set did not cover: build with logs, and board openings up. Players and Michael both place walls one segment at a time, so every segment has to look right alone and beside any other. One paste-ready request.

## What exists

The village set: `wall_<wood|stone>_<north|west>_<plain|door_shut|door_open|window_shut|window_open>`, `post_<wood|stone>`, `door_open_<wood|stone>_<north|west>`, `shutter_<left|right>_<wood|stone>_<north|west>`, with anchors on the tile's top vertex at ground level. Walls 80 px tall; stone 16 thick, wood 14, centred on the edge line; the doorway 20 px across and 48 tall; the window 16 across, sill at 22, top at 51. Each segment includes its near end face, which the next segment covers.

## What the game does with a segment

- A wall is state on one tile edge. The player builds one edge at a time from a palette (today: a log wall, a log-walled door, a log-walled window, each costing wood). A built segment can stand alone, meet another at a corner, continue a line, or sit between two segments of another material.
- Boards are a layer the player nails over an opening, one to three per side, each with its own health; the dead break them one by one. The engine draws the boards on the side facing the camera over the wall segment, at the opening.
- Corners and wall ends get a post the wall's thickness square.

## The request

```
Please draw three more sets of building pieces for my game, in the same style and with the same conventions as the village set you made (same 80 px walls, same anchors on the tile's top vertex at ground level, hard pixels only, both wall orientations drawn: north is "\" and west is "/").

1. The log wall, which players build. 18 px thick, centred on the edge line like the others, 80 px tall: stacked round logs with their ends showing at the segment's near end face, notched where they would cross at a corner. Same five variants as wood and stone, in both orientations (10 files): wall_log_<north|west>_<plain|door_shut|door_open|window_shut|window_open>.png. Plus post_log.png (a corner post of crossed log ends, the wall's thickness square), door_open_log_<north|west>.png, and shutter_<left|right>_log_<north|west>.png, matching the wood and stone ones. The door and shutter wood is the same plank wood as the other doors (#5e4028 with #2b2a32 metal), outlined all round like them.

2. Board overlays. Players nail planks across a door or a window to keep the dead out: one, two, or three rough planks, each about 5 px tall, nailed with two dark nails, crossing the opening at a slight angle, with the plank ends overlapping the frame by a few pixels. Draw them as transparent overlays that sit over the wall segment at the opening, with no wall behind them, anchored exactly like the wall segment they go on (the tile's top vertex at ground level), one set per opening and orientation:
   - boards_door_<north|west>_<1|2|3>.png: across the doorway (20 px across, 48 tall from the floor). One board sits at the middle; two sit at about a quarter and three quarters of the height; three add the middle.
   - boards_window_<north|west>_<1|2|3>.png: across the window (16 px across, from the sill at 22 to the top at 51), spaced the same way.
   The planks are the same wood as the doors, slightly rougher, and outlined like them because the player uses them. They should read on any wall material, so avoid colours that vanish against the wood wall.

3. A placement test, as previews at 1x and 3x. Players and I build one segment at a time, so each segment has to look right alone and beside any other. Please show:
   - every segment variant standing alone on grass, in both orientations, including the log set;
   - lines mixing materials end to end: wood then stone then log, with a door of one material between walls of another, and a window likewise;
   - a lone door segment and a lone window segment with nothing either side (the frame and its jambs on their own);
   - an L corner and a T junction of each material with its post, and a corner where two materials meet;
   - a doorway and a window with one, two, and three boards over them, open and shut behind the boards.
   If anything in those pictures needs a piece I have not asked for (a wall-end piece, a special corner), say so and add it.

4. A question before any drawing: doors and shutters that open away from the camera. Every wall sits on a tile edge with a near side (toward the camera) and a far side (behind). A door opens outward, toward whichever side is outdoors. Your open leaves swing toward the camera, which covers a door whose outside is the near side. When the outside is the far side (a door in a building's back wall), the leaf swings away and stands behind the 80 px wall, so a 48 px leaf is hidden; through the doorway you would see at most a sliver of its edge at the hinge. Shutters folded against the far face are hidden the same way. My current plan is to draw nothing in that case and let the open doorway or window frame speak for itself. The one place it could show is a door between two rooms seen through a wall the game draws translucent when the player is inside. Do you agree, or would you draw the far-side leaves and shutters (four leaves and eight shutters per material, since a mirror of the near-side art gives the other orientation's shape, not an away swing)? If you think they are worth having, say what they would need and I will add them to the request.

Same delivery as before: one transparent PNG each, tightly cropped, anchors in a JSON, hard pixels only.
```

## Not requested, kept in mind

- **Stub (cut-down) walls.** The game once drew the walls between the player and the camera as low stumps instead of translucent full walls. Michael retired the stump mode (2026-10-11; translucent walls do not bother him) but keeps the idea: if it ever comes back it needs cut-down segments per material and orientation, with a cut cap, a door gap, and window posts.

## When it comes back

- The log wall replaces the generated `wall_log` sheet behind the same id, through the drawn-wall definition of `17`; the build palette changes nothing; the stub frames of the generated wall go with it.
- Boards become overlay sprites drawn by `makeWall` at the wall's anchor, replacing the polygon boards of `17`'s step 2, which stand in until then.
- The placement previews are the acceptance pictures for building: the game should match them.
