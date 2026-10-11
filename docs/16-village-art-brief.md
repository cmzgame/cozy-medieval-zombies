# 16 — Art brief for Claude Design: the village

Michael, 2026-10-11, after the trees, the ground decals, and the rocks came back well: more work in the same style. Four parts, each with a request to paste into Claude Design. Everything between the fences is meant to be pasted as it is. Part 4 (wall height) should be settled before part 2 is commissioned, since it changes every wall's size.

## What every request shares

These facts go at the top of each request, so each one stands alone. They are repeated inside the fences on purpose.

- **The game:** a cosy, slightly spooky medieval village overrun by the dead, in 2:1 isometric pixel art, Habbo-like: ground tiles are 64×32 diamonds, drawn at one pixel per pixel, never scaled.
- **Scale:** the player is about 48 px tall and 20 wide. Trees are 104 to 211 px tall. The big rocks are about 50 px wide; mushrooms about 20.
- **Style already in the game:** chunky, readable shapes, light from the top left, three or four flat shades per material, hard pixels (every pixel fully opaque or fully transparent, no anti-aliasing), no baked ground shadow under props (the game draws its own).
- **The outline rule (Michael):** anything the player can use (furniture, the well, doors) has a dark outline all the way round, like the player sprite and the rocks; decoration has none.
- **Palette in use:** door and shutter wood `#5e4028` with dark metal strips `#2b2a32`; wooden walls `#6e4b32`; stone walls `#7b7670`; log walls `#8a5e36`; wooden floor `#5e452f`; grass about `#4b5f3d`. Muted autumn, never neon.

## Part 1: furniture and fixtures

**What exists:** the bed, table, chest, and well are dev boxes; the hearth is a dev blob set into the room. **New:** a chair. **Upgrade:** the stove/hearth becomes a fireplace.

Engine notes (for Claude, not for the request): a 2-tile thing (bed, table, fireplace) is delivered as one image and Claude slices it per tile for the depth sort. A footprint turns with R in placement; in 2:1 isometric a horizontal mirror turns an object onto the other grid axis, so one drawing covers both orientations unless a detail must not mirror. The fireplace's flames are separate frames the game animates and lights, laid over the empty firebox.

```
Please draw furniture and fixtures for my game, in the same style as the trees, rocks, and mushrooms you made.

The game: a cosy, slightly spooky medieval village in 2:1 isometric pixel art, Habbo-like. Ground tiles are 64x32 diamonds, drawn one pixel per pixel. The player is about 48 px tall and 20 wide. Light comes from the top left. Use three or four flat shades per material and hard pixels only (every pixel fully opaque or fully transparent, no anti-aliasing). No shadow on the ground under the object; the game draws its own.

Everything here can be used by the player, so each object has a dark outline all the way round, like the player sprite. Wood is warm and worn (around #5e4028 for dark wood), stone is dusky warm grey (around #7b7670), metal is near-black (#2b2a32). Muted autumn colours, never bright.

Each object sits on the ground diamond(s) of its footprint: its base follows the diamond's edges, so a box-shaped thing shows its top and two side faces, the left face lit and the right face in shade. Draw each object in one orientation (its long side running from the bottom left to the top right); I mirror it for the other.

1. Well (the most important one). Footprint 1 tile. A round stone well with a low wall of fitted stones, a small wooden roof on two posts, a crank and rope with a wooden bucket. About 80 to 96 px tall including the roof. It should read as the heart of the village square.
2. Bed. Footprint 2 tiles long, 1 wide. A low wooden frame, a straw mattress or a patchwork quilt, a pillow at one end, a short headboard. About 20 to 26 px tall.
3. Table. Footprint 2 tiles long, 1 wide. A plank top on trestle legs, a few knife marks, maybe a candle stub. Top about 22 px above the ground.
4. Chair. Footprint 1 tile. A simple wooden chair with a back. Please draw it facing two ways: seat toward the viewer with the back behind it, and seat away from the viewer with the back in front (I mirror each for the other two directions). Seat about 14 px up, back about 30 px.
5. Fireplace (replacing a small stove). Footprint 2 tiles wide, standing against a wall. A wide, low, flat-fronted stone hearth that stands out from the wall by about half a tile, not set flush into it: a dark firebox opening in the middle, a small stone or wooden mantle shelf across the top, a hearthstone in front. About 48 to 56 px tall. Draw the firebox empty and dark, then separately three small flame frames (about 16 to 20 px wide) that fit inside the firebox, for animation.

For each, one transparent PNG, tightly cropped, plus the flame frames as fire_0.png to fire_2.png. File names: well.png, bed.png, table.png, chair_front.png, chair_back.png, fireplace.png. Please show a preview of all of them on a grass background with the 48 px character standing beside them for scale, at 1x and 3x.
```

## Part 2: walls, doors, and windows

**What exists:** wall segments are generated, 64 px tall, 12 px thick, with plank, brick, and log patterns; a segment stands on one edge of a tile. Doors and shutters are flat polygons. **Wanted:** drawn wood and stone segments, each with a closed door, an open doorway, closed shutters, and an open window.

Engine notes: a wall stands on a tile's north edge (the diamond's top-right edge) or its west edge (top-left edge); the two run along different screen diagonals and catch the light differently, so both are drawn rather than mirrored. The top cap is the wall's thickness seen from above. Each segment covers exactly one tile edge, so the patterns must line up end to end. Near walls (between the player and the camera) are drawn translucent by the game, so the same art serves both sides. Boarded-up and broken variants exist in the game; they wait for a later pass.

```
Please draw wall segments for my game's buildings, in the same style as the trees, rocks, and mushrooms you made.

The game: a cosy, slightly spooky medieval village in 2:1 isometric pixel art, Habbo-like. Ground tiles are 64x32 diamonds, drawn one pixel per pixel. The player is about 48 px tall. Light comes from the top left. Use three or four flat shades per material and hard pixels only (every pixel fully opaque or fully transparent, no anti-aliasing).

A wall segment stands on one edge of a ground tile and is exactly one tile edge long: 32 px across and 16 px up the screen along the diamond's edge. Walls are thick and chunky (thick walls read as cosy): 12 px thick, with the top of the wall visible as a flat cap. Height: [96 px, see the note on wall height]. Segments sit end to end along a building's side, so the pattern must continue seamlessly from one segment into the next.

Two orientations, each drawn (not mirrored, since the light falls differently on them):
- North-edge segments, running from the bottom left up to the top right.
- West-edge segments, running from the top left down to the bottom right.

Two materials:
- Wood: vertical or horizontal planks, around #6e4b32, with a darker sill beam at the bottom.
- Stone: fitted dusky warm grey stones, around #7b7670, with mortar lines, a few chipped corners.

For each material and orientation, five variants:
1. Plain wall.
2. Door, closed: a plank door with two dark metal strips (wood #5e4028, metal #2b2a32), filling the doorway. The doorway is about 20 px wide and 64 px tall.
3. Doorway, open: the same opening with no leaf in it. Show the wall's thickness inside the opening (the inner faces of the jambs, one lit and one in shade) and a threshold at the bottom, so it reads as a hole through a thick wall. The open door leaf is a separate sprite (below).
4. Window, closed: a window hole with a wooden frame and sill, two plank shutters closed in the middle. About 20 px wide and 22 px tall, its sill about 34 px up.
5. Window, open: the same hole with no shutters, showing the wall's thickness inside it and the sill. The open shutters are separate sprites (below).

The doors and shutters are things the player uses, so they have a dark outline all the way round; the walls themselves do not.

One transparent PNG per variant, tightly cropped, named wall_<wood|stone>_<north|west>_<plain|door_shut|door_open|window_shut|window_open>.png. Please show a preview of a small two-room building assembled from them, at 1x and 3x, with the 48 px character beside it for scale.
```

## Part 3: making open doors and shutters look solid

**The problem:** an open door is drawn today as a flat four-cornered polygon swung out perpendicular to the wall on the outside (Michael's ruling of 2026-10-09: doors and shutters open outward). It has no thickness, no hinge, and no shadow, so it reads as a sticker.

**The fake, in order of how much it buys:**

1. **Show the thickness.** A real leaf is about 3 px thick. When the leaf stands perpendicular to the wall, its free edge faces the viewer on one side: draw that edge as a narrow light strip the full height of the leaf, and the top edge as a one-pixel highlight line. That one strip is most of the 3D.
2. **Foreshorten the face.** The leaf, swung to stand along the other grid axis, is a parallelogram slanting the other way from the wall. Its planks and metal strips follow that slant, and its face is a step darker than the closed door's (it has turned away from the light), or a step lighter on the other wall.
3. **Hinges at the jamb.** Two dark metal hinge straps where the leaf meets the wall tie it to the frame; without them the leaf floats.
4. **A cast shadow.** A narrow dark parallelogram on the ground beside the leaf, on the side away from the light, two or three pixels wide. The engine can draw this as a flat polygon, so the art does not need to carry it.
5. **The jamb's depth** (from part 2): the inner faces of the opening read as a hole through a thick wall, which sells the leaf as having swung out of it.

**Shutters:** the same four points, smaller. **Ruled by Michael (2026-10-11), changing the shutter half of the 2026-10-09 ruling: open shutters fold back almost flat against the outside wall**, at about 160 degrees rather than 90, as cottage shutters do. Folded back, a shutter shows its face slightly foreshortened, its edge as a one-pixel strip, and its shadow on the wall beside it. It also stops two 90-degree shutters from sticking out across the path. Doors stay at 90 degrees.

**Engine work this implies (for Claude):** the polygon leaves give way to sprites, one per leaf, drawn standing on the floor at the hinge jamb and sorted like a prop; the shadow parallelogram stays a polygon. Each leaf needs its two wall orientations and both outward directions, which mirrors mostly cover.

```
Please draw the open door and the open shutters for my game's buildings as separate sprites, in the same style as the walls.

The game: 2:1 isometric pixel art, ground tiles 64x32, the player about 48 px tall, light from the top left, three or four flat shades, hard pixels only. Doors and shutters are plank wood (#5e4028) with dark metal strips (#2b2a32), with a dark outline all the way round because the player uses them.

The closed door is about 20 px wide and 64 px tall. When it opens, it swings outward on its hinges to stand at 90 degrees to the wall. Draw that open leaf as a solid object, not a flat card:
- Its face is a parallelogram slanting along the other ground axis from the wall, with the planks and metal strips following the slant, one shade darker than the closed door because it has turned away from the light.
- Its free edge is visible as a narrow strip about 3 px wide, the full height of the door, lighter than the face. Its top edge is a one-pixel highlight.
- Two dark metal hinge straps where it meets the door frame.
Please draw it for a door in a north-edge wall (the wall running bottom left to top right) and for a door in a west-edge wall (running top left to bottom right).

Open shutters: a window has two shutters, each about 10 px wide and 22 px tall. When open, each folds back almost flat against the outside of the wall, at about 160 degrees: a slightly foreshortened face, its edge as a one-pixel strip, small hinge marks. Please draw the left and right shutter for a north-edge window and for a west-edge window.

One transparent PNG each, tightly cropped, named door_open_<north|west>.png and shutter_<left|right>_<north|west>.png. Please show a preview of an open door and an open window in the walls, at 1x and 3x.
```

## Part 4: are the walls too short?

**Michael asked; the numbers say yes.**

| Thing | Height today |
|---|---|
| Player | 48 px |
| Wall | 64 px |
| Doorway (82% of the wall) | about 52 px, 4 px above the player's head |
| Medium tree | about 104 px |
| Giant tree | up to 211 px |

The walls are a third taller than the player, and every tree is half again to three times a wall. The houses read as sheds, and a doorway with 4 px of headroom reads as a hatch.

**Recommendation: 96 px walls**, twice the player. The doorway becomes about 64 px (a third taller than the player), a window's sill sits at hip height, and a giant tree stands about twice a house's height, which is how a big oak looks beside a cottage. 112 px would be grander; 96 keeps the dollhouse feel and the interiors open to view.

**Try it before commissioning anything:** the settings screen's **Wall height** row (64 px now, 96 px preview) rebuilds the dev walls live. Underneath, wall height is one number in each wall's definition (`"height": 64` in `data/sprites/wall_*.json`), and the generated dev walls, their doors, windows, swung leaves, and the light that climbs walls all follow it. Setting it to 96 shows the result in minutes, with the old art, before Claude Design draws a pixel. Things to check when trying it: how much of a room behind a far wall the taller wall hides; the translucent near walls (taller translucent walls cover more of the room); the light pool's climb up a wall (`night.climb`, 56 px today, probably wants about 84); and how buildings look beside the trees from a distance.

## When the art comes back

- **Furniture:** sliced per tile for 2-tile pieces, anchors measured as for the trees, `carry` and `container` kept from today's definitions; the chair gets facings; the fireplace keeps the hearth's fire data with drawn flame frames.
- **Walls:** a wall definition gains `image` and named frames in place of `placeholder`, read by the same renderer. Boarded and broken variants stay generated until a later pass.
- **Doors and shutters:** sprites replace the polygon leaves; their shadows stay polygons.
