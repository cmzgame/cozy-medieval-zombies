# 17 — Milestone 10: the village art comes in (walls, doors, furniture, floors)

**Scoped for implementation by another model** (planned with Michael on 2026-10-11; nothing built yet). Claude Design delivered the whole of brief `16` and a little more, in `C:\Users\micha\Downloads\village_art` (69 files, with `README_village.md`, two anchor JSONs, and the generators that made the art). The art is right; the engine's walls, props, and loader were built for generated placeholders and need plumbing to take it. This doc is that plumbing. The doc decides; "default" marks what Michael may overrule, not what the implementer may.

## Status

**Steps 2 and 3 built and verified (2026-10-11), paused for Michael** (step 1 accepted: he carried, turned, and dropped the jack-o'-lanterns, and the floors "look great"). Walls are drawn for all three materials (`wall_wood`, `wall_stone`, `wall_log`, ten frames each, top-vertex anchors) through `emitDrawnWall` in `render.js`: the engine's opening states map onto the art's five variants (`drawnVariant`), the cap is redrawn from the same frame with the sky flag (`gl.texQuad`), board overlays come from `wall_boards`, open leaves and shutters from `wall_parts_<mat>` on the near side, and far-side ones only through a translucent wall. Posts are drawn (`post_<mat>`, anchored on the vertex, cap redrawn on the sky), the heavier material winning (stone, log, wood), and now also where the material changes along a straight line. The stub mode and the `K` key are gone; the torch bracket sits on the drawn wall's near face; the opening hit test uses the 80 px face. The player's log walls are the drawn log set. Checks: the shed and the cottage read like the previews, seamless along each wall with posts at the corners; an open door shows its leaf beside the doorway, an open window its folded shutters, a boarded window its planks; at night a hearth-lit room lights its floor and the inside of its back wall while the wall caps stay dark; a log wall built on from the cottage's front gets a log post at the junction and a finished end; a lone log doorway stands finished with posts at both ends; right-clicking a door still offers its actions. **Not yet seen in play:** far-side leaves (no building has a door whose outside is behind a translucent wall). **Not built:** the cast shadows of open leaves on the ground (the old engine had none either).

**Also fixed on the way: the dev server refused connections.** `serve.py` used Python's default listen queue of five; with a hundred-plus images requested at boot the overflow was refused, which was every "connection refused" and failed boot of the last two days. The queue is 128 now (`ServerWithRoom`); the preview server was restarted.

**Step 1 built and verified (2026-10-11), accepted by Michael.** The loader builds a sheet from several PNGs (`images`, each distinct image packed once), converts top-vertex anchors (`anchorVertex: "top"`), and keeps per-frame anchors (`anchors`, stored as `sheet.frameAnchors` for step 2's leaves); props have facings (`facings` on the definition, `prop.facing`, frames `idle_<facing>_<i>` and `flame_<facing>_<i>` through `assets.idleFrame`; R cycles the facings of a one-tile prop). The drawn wood and stone floors are in (four frames each, picked by hash in the ground bake); the map's `pumpkin` is the drawn jack-o'-lantern (two faces, three unlit glow frames over the cuts, its fire kept); `pumpkin_plain_0` and `pumpkin_plain_1` stand on the farm plot. All 108 village and pumpkin PNGs are in `data/art/village/`, most not yet used. Checks: the ground acceptance script passes nine of nine with the drawn floors; a carried jack-o'-lantern turns left, right, left with R and keeps its one-tile footprint; the jack-o'-lanterns glow at night.

## What arrived

Every PNG is hard-pixelled (alpha 0 or 255), tightly cropped, 1:1, and comes with a `anchor_px`: the pixel where the **tile's top vertex at ground level** sits.

| Set | Files | Notes |
|---|---|---|
| Wall segments | 20: `wall_<wood|stone>_<north|west>_<plain|door_shut|door_open|window_shut|window_open>` | one tile edge long, 80 px tall; stone 16 thick, wood 14, **centred on the edge line**; the cap (top face) and the near end face are in the sprite; patterns repeat every 32 px; doorway 20 px wide and 48 tall; window 16 wide, sill 22, top 51; stone courses are larger than our bricks, as invited |
| Corner posts | `post_wood`, `post_stone` | a drop-in for the dev post, the wall's thickness square, a pixel proud; anchored on their own centre at ground |
| Open door leaves | 4: `door_open_<wood|stone>_<north|west>` | swung 90° outward toward the camera, hinged at the jamb nearer the top of the screen; a 3 px free edge, strap hinges; outlined |
| Open shutters | 8: `shutter_<left|right>_<wood|stone>_<north|west>` | folded back 160° against the outside face; left and right are screen sides; outlined |
| Furniture | `well`, `bed`, `table`, `chair_front`, `chair_back`, `fireplace`, `fire_0..2` | outlined; long sides run along world y ("/"); the fireplace backs against a west wall and stands half a tile out; the flames are 18×16 frames with no glow, placed by `fire_base_px` |
| Floors | `floor_wood_0..3`, `floor_stone_0..3` | 64×32 diamonds patterned in world space, so any variant meets any other |
| Previews | building cutaway and exterior, doors, furniture, floors, at 1× and 3× | the building previews were assembled from the PNGs and anchors, so they are also a placement test |
| Generators | `iso3d.py`, `village.py`, `furniture.py`, `floors.py`, `village_preview.py` | Claude Design built a small isometric 3D renderer and drew everything with it, so more pieces in the same style (log walls, caps, more furniture) are cheap to ask for |

**Orientation matches the engine** (the corrected brief): north is the tile edge from its top vertex to its right vertex, "\" on screen, a room's back-right wall; west is top vertex to left vertex, "/", the back-left wall. Nothing is mirrored.

**The second batch (brief `18`, 2026-10-11, in `C:\Users\micha\Downloads\village_art(1)`, a superset of the first folder with every earlier file unchanged; use this folder as the source):**

| Set | Files | Notes |
|---|---|---|
| Log walls | 10: `wall_log_<north|west>_<variant>` | 18 thick, centred, 80 tall, same anchors convention (`[9, 85]` north, `[41, 85]` west); five round logs with clay chinking, cut ends with rings at the near end and in the openings |
| Log post, leaves, shutters | `post_log`, `door_open_log_<o>`, `shutter_<left|right>_log_<o>` | the post is a notched cabin corner |
| Board overlays | 12: `boards_<door|window>_<north|west>_<1|2|3>` | weathered grey-tan planks, outlined, anchored like the wall segment they cover, drawn right after it; proud of the thickest (log) face so they never sink into a wall |
| Far-side leaves | 18: `door_open_far_<mat>_<o>`, `shutter_far_<left|right>_<mat>_<o>` | real away-swings; drawn just before their wall, only when that wall is translucent |
| Placement previews | `place_alone`, `place_lines`, `place_lone`, `place_corners`, `place_tees_mixed`, `place_boards`, `place_far`, at 1× and 3× | the acceptance pictures for building |

**The designer's placement rules (the previews follow them; the engine already sorts this way):** a wall segment's sort key is the grid sum of its midpoint (the engine's `tx + ty − 0.5`); a post's is its grid vertex (`tx + ty − 1`); near-side leaves, shutters, and boards draw right after their wall, far-side leaves right before. **New rule: a post wherever the material changes along a straight line**, in the heavier material, **stone over log over wood**, because the three thicknesses (16, 18, 14) leave a step in the cap where two meet end to end; and at a corner where two materials meet, the heavier material's post. Lone segments need no end piece: the posts at their ends finish them.

**Not in either set, by design:** the chest, barrel, campfire, torch post (still generated), dirt and cobble textures (still generated), ground shadows (the engine's). Pumpkins and jack-o'-lanterns came separately (below).

## What the engine does today, and why it cannot take the art as is

- **Walls** (`render.js`, `makeWall`): one quad per segment from a *generated* sheet whose frames are named `${side}_${variant}_0`, sides `north` and `west`, variants `plain`, `door` (open), `door_shut`, `window` (open), `window_shut`, `window_broken`, and boarded forms (`boarded1..3`, `door_boarded1..3`, ...) with the boards baked in; the cap is a separate flat polygon on the sky flag; open leaves and shutters are flat polygons (`emitSwungLeaves`); the generated wall sits on the far side of the edge line, not centred on it; the "stub" cutaway mode draws separate low `south`/`east` frames. Anchors are per side (`anchor`, `anchorWest`), bottom-left or bottom-right of the frame.
- **Posts** (`makePost`): three polygons, the wall's thickness square, at the tile's top vertex.
- **Props** (`propDrawables`, `generateBox`): a multi-tile prop is drawn once per footprint tile, each tile drawing frame `idle_<i>` at its own tile centre with one shared anchor. The generated box does not slice: every tile gets the same full box, so a 2-tile bed today is two one-tile boxes. There is no prop facing, no mirror for a rotated footprint. Flames on a fire prop are frames `flame_<i>` drawn at the prop anchor, animated only for one-tile props.
- **Loader** (`assets.loadSprite`): one `image` per definition, `frames` as rectangles into it, one `anchor` at the engine's convention (the point drawn at the tile **centre**; walls use their own), optional `scale` and `bounds`.
- **Floors**: the ground bake (`ground.js`) draws a laid tile from its sheet's `idle_*` frames, picked by hash; the sheets are generated two-frame flats.

## The plan, in one paragraph

The loader learns to build one sheet from several PNGs with named frames, and to take anchors in Claude Design's "top vertex" convention. Walls become drawn sheets with an alias table from the engine's variant names to the art's five, the cap stays inside the sprite, boards are drawn as polygons over the sprite, posts and open leaves and shutters become sprites, and the stub cutaway retires. Multi-tile furniture is sliced per tile at load along the tile boundary and mirrored when its footprint is turned; the chair gains facings; the fireplace's flames animate on the tile that holds the firebox. Floors are four-frame drawn sheets and need nothing else. The map's hearth becomes the two-tile fireplace.

## Rulings (defaults Michael may overrule)

1. **The stub cutaway mode retires as a setting; the idea is kept** (Michael, 2026-10-11: translucent near walls do not bother him). The `K` key and the `cutaway` value go; `isNearWall` keeps deciding translucency. The stump drawing (`drawNearVariant`, the `south`/`east` frames, `stubVariant`) goes from the generated wall too; the idea lives in `05-someday.md`, and bringing it back needs cut-down art (noted in `18`).
2. **Far-side leaves and shutters: drawn only behind a translucent wall** (Claude Design's answer, 2026-10-11, agreeing with the default and adding the exception). Behind an opaque 80 px wall a far-side leaf is invisible, so nothing is drawn. Claude Design is including optional `_far` sprites for the leaves and shutters with the building batch (`18`); when a wall is drawn translucent (a near wall while the player is inside), its open far-side leaf or shutters are drawn **before** the wall at the wall's anchor, so they show through it, as for an interior door between two rooms. Until the `_far` sprites arrive, nothing is drawn in that case either.
3. **The cap is drawn twice: once as part of the face, then again from the same picture with the sky flag** (Michael, 2026-10-11: Claude's judgement; no art involved). The shader lights a whole quad from one sample point, so the cap pixels inside the wall sprite would otherwise take the face's light, and at night a lit room's back walls would have bright caps against the dark (Michael asked; it would not be slight). `gl.js` gains a general textured quad (four arbitrary screen points with their own texture coordinates; `vertex()` already takes any position), and `makeWall` draws the cap's parallelogram from the frame on top of the face with `FLAG_SKY`: the strip half the wall's thickness either side of the wall's top edge, which the art centres on the edge line. One extra quad per segment, no extra art.
4. **Boards are overlay sprites**, drawn by Claude Design (`18-building-art-brief.md`): one, two, or three planks sized to the doorway or the window, per wall orientation, twelve small files, drawn over the wall segment at the wall's anchor on the near face, exactly as the leaves are. Michael's worry, which is right: the old polygon planks would look like dev art on the drawn walls. Until the overlays arrive, the polygon boards stand in. Broken is the open frame: `window_broken` draws the `window_open` art, a broken door the `door_open` art (docs/09's rule).
5. **Props get facings, Zomboid style (Michael's rule).** Every asymmetrical item has at least two facings, one drawing plus its mirror; four when the item's two ends differ and both would be seen. A prop declares `facings`, each a drawing or the mirror of another; the prop carries `facing`; `R` in placement cycles them; the map file may give one. For a two-tile item the facing sets the footprint's axis. The chair: two drawings and their mirrors, four facings. The bed: one plus mirror, the headboard at the far end either way (the two facings with the headboard toward the camera are not drawn until wanted). The table: one plus mirror. The fireplace: one plus mirror, for the two back walls. The well: one. Names are fixed at import; the conversation about them comes with step 4.
6. **Multi-tile furniture is one drawing, sliced at load.** Art is drawn with the long side along world y (footprint `[1, 2]`); a prop placed along x (footprint `[2, 1]`, as the cottage's bed and table are today) draws the mirror. The accepted cost of mirroring is that the lit side swaps.
7. **The cottage's hearth becomes the two-tile fireplace** in `square.json` (its fire data moves over; `hearth.json` stays for anything else that uses it, which is nothing). The campfire, chest, barrel, and torch post stay generated until drawn. **The log wall the player builds is drawn now** (the second batch) and replaces the generated `wall_log` behind the same id; the generated wall code stays only as a fallback for a definition with a `placeholder`.
8. **Posts: stone over log over wood** (the designer's rule). At a corner or a junction, the heaviest material among the walls meeting there; and, new, **a post also stands where two different materials meet end to end in a straight line** (today `postDrawables` skips straight runs; it skips them only when both walls share a material). A wall with no drawn post falls back to the polygons.
9. **Nothing about collision, rooms, light, sight, or the dead changes.** Walls are still edge state; a drawn wall is a picture of the same edge.

## The loader

In `assets.loadSprite`, beside `image`:

- **`images`**: `{ "<frameName>": "<path>" }`. The loader loads each PNG, packs them into one canvas (a simple shelf, as the atlas does), and writes `frames` as the rectangles. `frames` given alongside override or add (for frames that are rectangles into one of the images, which nothing needs yet). Floors use it (`idle_0..3`), walls use it (ten frames), the fireplace uses it (the body and `flame_0..2`).
- **`anchorVertex: "top"`**: the definition's `anchor` is Claude Design's top-vertex pixel; the loader converts to the engine's tile-centre convention by adding `[0, HH]` (16 px). Wall and post definitions say which point they anchor on (see below) and are not converted this way.
- **`slice`** (props): `{ "along": "y" }` with a footprint of two tiles: the loader builds `idle_0` and `idle_1` as full-size masked copies of the image, each shifted so the one shared anchor places it right when drawn at its own tile's centre. The mask is the tile boundary's screen line (from world `(0, 32)` to `(32, 32)` relative to the top tile's top vertex: slope one half, "\" on screen), extended as a straight screen line; pixels above and right of it belong to tile 0, the rest to tile 1. Imperfect for tall things, as every isometric engine's slicing is, and the same imperfection the generated boxes avoid only by being boxes. Four-tile footprints are not needed and not built.
- **`mirror` for a turned footprint**: when a prop's footprint is the transpose of its art's (`[2, 1]` for art drawn `[1, 2]`), the renderer draws the slices flipped and swaps their tile order. The loader records the art's native axis (`along`) on the sheet; `propDrawables` and `propRect` compare it with the prop's footprint.
- **`facings`** (props): `{ "se": { "image": "chair_front.png" }, "ne": { "mirror": "se" }, "sw": { "image": "chair_back.png" }, "nw": { "mirror": "sw" } }` or the equivalent built from `images`; the sheet's `facings` and `mirror` fields already exist for characters, and `resolveFacing` already resolves a mirror. A prop carries `facing` (default the first); frames are `idle_<facing>_<i>`.
- **Flames on a multi-tile prop**: the definition's `fire.at` is the `fire_base_px` from the anchors file (converted like the anchor); the loader composes `flame_0..2` as full-size frames with each 18×16 flame drawn so its pixel `(9, 15)` lands on that point, and records `flameTile`, the footprint tile under that point. `propDrawables` draws the flame once, on that tile, animated by time as one-tile flames are today.

Nothing changes for definitions that have `image` and `frames` as now; the trees and decals keep working.

## Walls

A drawn wall definition (`data/sprites/wall_wood.json`):

```json
{
  "wall": {
    "height": 80, "thickness": 14, "color": "#6e4b32", "pattern": "plank",
    "images": {
      "north_plain": "data/art/village/wall_wood_north_plain.png",
      "north_door_shut": "...", "north_door_open": "...", "north_window_shut": "...", "north_window_open": "...",
      "west_plain": "...", "west_door_shut": "...", "west_door_open": "...", "west_window_shut": "...", "west_window_open": "..."
    },
    "anchors": { "north": [7, 84], "west": [39, 84] },
    "post": "post_wood", "leaf": "door_open_wood", "shutters": "shutter_wood"
  }
}
```

- **Anchors**: both sides anchor on the **tile's top vertex at ground**. `makeWall` draws the frame at `(x − ax, y − HH − ay)` where `(x, y)` is the tile centre, for both sides. (The generated walls used bottom corners per side; those stay for the generated log wall until it is drawn, behind the same `anchor` / `anchorWest` fields, so the one function handles both by a flag on the sheet.)
- **Variant aliases** in `wallVariant`'s consumer: `door` → `door_open`, `window` → `window_open`, `window_broken` → `window_open`; a boarded variant → its base variant plus a board count. Frame names stay `${side}_${variant}_0`.
- **The quad**: as now, `world: [wa, wb, wb, wa]`, `heights: [f[3], f[3], 0, 0]`, the tint for translucent near walls and the ghost. **The cap**: no flat top polygon; instead the cap's parallelogram is drawn again from the frame with `FLAG_SKY` on top of the face (ruling 3), through a new `gl.texQuad(points, uvs, opts)`. For a north wall the top edge runs from the anchor's top vertex up 80 px to the right vertex up 80 px, and the cap is that edge pushed half the thickness along the ground's y axis each way (one ground unit along y is one screen pixel left and half a pixel down); for a west wall, along x (one unit is one pixel right and half down).
- **Posts**: `post` names a sprite definition (`post_wood.json`: `image`, `anchor` as given, `anchorVertex: "vertex"`, meaning drawn at the vertex itself, no conversion); `makePost` draws it as a quad at `toScreen(tx − 0.5, ty − 0.5)` with the vertex's world point and `heights: [h, h, 0, 0]`. Log-wall corners fall back to `post_wood`; a sheet with no `post` keeps the polygons.
- **Leaves and shutters**: `leaf` and `shutters` name definition prefixes; the leaf definition `door_open_wood.json` has `images: { north: ..., west: ... }` and per-frame anchors (the art's anchors differ per side), so the loader accepts `anchors: { "<frame>": [x, y] }` beside a single `anchor`. Drawn, when the opening is open, whole, unboarded, and its outside is the near side (`outsideSign > 0`), at the wall's anchor, after the wall. Shutters: `left` and `right` both. Far side: the `_far` sprite, drawn before the wall, only when the wall is translucent; otherwise nothing (ruling 2).
- **Boards**: `wall.boards.near` (1 to 3) draws the overlay sprite `boards_<door|window>_<side>_<n>` at the wall's anchor, right after the wall, with the wall's `world` and `heights`. A window's boards over an open or shut leaf alike; a door's likewise. Board overlays are wood whatever the wall, so one set serves all three materials. The polygon boards are gone.
- **Brackets**: the torch bracket sits on the near face, which is now half the thickness nearer the camera than the edge line; `bx, by` move by `perp · T/2`. One line.
- **Hit test for openings** (`interact.openingsAtScreen`): `WALL_FACE` becomes the sheet's wall height (80), and the face rect shifts by the same half thickness.
- **The build ghost** draws the wall through `makeWall` with a tint and needs nothing new; it builds `wall_log`, which stays generated.
- **Stubs retire**: `cutaway` loses the `"stub"` value, the `K` key and its debug line go, `isNearWall` keeps deciding translucency, `drawNearVariant` and the `south`/`east` frames go from `generateWall`.

## Furniture

Definitions (`data/sprites/`), anchors converted by `anchorVertex: "top"`:

| Id | Footprint | Fields |
|---|---|---|
| `well` | 1×1 | `image`, `anchor [37, 77]`, `water: true`, `carry: false` (as now), outlined by the art |
| `bed` | native `[1, 2]`, `slice.along "y"` | `anchor [64, 27]`, `carry: true` |
| `table` | native `[1, 2]` | `anchor [61, 21]`, `carry: true` |
| `chair` | 1×1, `facings` from `chair_front` (anchor `[19, 25]`) and `chair_back` (`[19, 18]`) | `carry: true`; new in the map, two by the table |
| `fireplace` | native `[1, 2]`, backs against a west wall; mirrored, against a north wall | `anchor [63, 50]`, `fire` as the hearth's (`radius 3, room, burns, cooks, maxFuel 4, flicker`), `fire.at [42, 67.5]`, flames `fire_0..2`, `carry: false` |

The map: the cottage's `hearth` at `[4, 0]` becomes `fireplace` at `[3, 0]` with footprint `[2, 1]` (against the north wall, two tiles wide); the bed and table keep `[2, 1]` and draw mirrored; two chairs join the table. `assets.loadMapSprites` already wants a prop's sprite with its tile count.

**Occlusion**: a prop whose frame is 64 px or taller becomes an occluder (the see-through hole for a character behind it); the well (104) and the fireplace (91) qualify, which is right.

## Pumpkins and jack-o'-lanterns (with step 1)

Michael's second set of 2026-10-11 (`C:\Users\micha\Downloads\pumpkins`, with `anchors_pumpkins.json` and `anchors_jackolantern.json`): `pumpkin_0` (32×29) and `pumpkin_1` (26×25, smaller and rounder), plain; `jackolantern_left` and `jackolantern_right` (32×29, the face turned each way) each with three glow frames the same size, drawn at the same position, unlit, filling the cuts. All outlined, hard-pixelled, seen from the game's angle so the top shows. **Their anchors are the ground point under the pumpkin's centre, the tile centre**: the engine's own convention, no top-vertex conversion (`ground_anchor_px`; `pumpkin_1`'s is `[13, 20.6]`, rounded to 21). `light_origin_px` is informational; the engine lights from the tile.

- **Game objects under the gatherables law**: `interactable: true`, so a click sways them and the outline is already drawn. `solid: false` as the map places them now. `carry: true` (a pumpkin can be picked up and moved like a chest). What picking one gives is question 27's.
- **The jack-o'-lantern keeps its fire** (`radius 1.5, lit, flicker`) and glows through the existing flame path: frames `idle_0..2` are the body three times and `flame_0..2` the glow frames, in one sheet built by the loader's `images`; `propDrawables` already animates a one-tile prop's idle frames by time and draws `flame_<same index>` unlit over them. Two facings from the two drawings (`left`, `right`), not mirrors, so `R` turns one; the map may say which.
- **Plain pumpkins** are two sprite ids, `pumpkin_plain_0` and `pumpkin_plain_1`, no fire, one facing each. The map's `pumpkin` keeps its id and becomes the jack-o'-lantern definition (`jackolantern`? keep `pumpkin` so `square.json` and the loot tables need no change; the plain ones are new ids).
- **Placement**: by the map, as now (three by the cottage). Not in the forage rule: pumpkins belong to gardens, not the wild. The farming milestone decides where they grow.
- **Optional tunable, not built unless wanted**: hide the glow by day above a brightness; today's pumpkin glows at noon too and nobody has minded.

## Floors

`floor_wood.json`: `{ "images": { "idle_0": ".../floor_wood_0.png", ..., "idle_3": "..." }, "anchor": [32, 16] }`; the same for `floor_stone`. The ground bake picks a frame by hash and reads the sheet's anchor as the tile centre. Nothing else changes. The farm and the earth kinds are untouched.

## Files, where they go

- PNGs to `data/art/village/` as named, from `village_art(1)` (the superset), and the pumpkins from `pumpkins`. The README, the anchor JSONs, and the generators stay in Michael's folder (the generators are Claude Design's; the anchors are copied into the definitions by the import script).
- An import script in the scratchpad writes the definitions from the anchor JSONs, so a re-roll from Claude Design re-imports in one run.

## Build order, with pauses for Michael

1. **The loader**: `images`, `anchorVertex`, per-frame `anchors`; the floors in; **the pumpkins and jack-o'-lanterns in** (they need only `images` and the existing flame path). **Verify**: the cottage's wood floor and the shed's stone floor show the drawn planks and flagstones, variants mixed by hash, no seams at tile edges (the ground acceptance script still passes nine of nine); the three pumpkins by the cottage are the drawn jack-o'-lanterns, glowing at night with their light as before, swaying when clicked, `R` turning a carried one between its two faces. *Pause.*
2. **Walls and posts**: the two drawn wall sheets with aliases, top-vertex anchors, no top polygon; drawn posts; boards as polygons; stubs retired; the bracket and hit-test offsets. **Verify**: the cottage (wood) and the shed (stone) match the previews in shape; segments meet without a seam or a doubled end face; doors and shutters closed and open show the right frames; a boarded window still shows its planks; near walls go translucent inside; the build ghost still draws; night light climbs the drawn faces; the log wall the palette builds still works. *Pause: Michael looks at the buildings.*
3. **Leaves and shutters as sprites**: drawn for near-side openings; far-side ones drop. **Verify**: open the cottage's door and windows from outside and inside; the leaf never covers the doorway; shutters sit beside the window on the outside face. *Pause.*
4. **Furniture**: slicing, mirroring, facings, flames; the well, bed, table, chairs, fireplace; the map change. **Verify**: the cottage interior matches the cutaway preview; the bed and table sort against the player walking round them; `R` turns a carried chair through four facings and a carried bed through two; the fireplace's flames animate in the firebox and light the room as the hearth did; Add a log and cooking still work on it; the well still fills a waterskin. *Pause: Michael looks at the room.*
5. **Docs**: `06-art.md`'s palette and tables, `02`, `TODO`; the follow-up art request below.

## Accept when

1. The cottage and the shed, outside and inside, read like `preview_building_exterior` and `preview_building` (allowing for lighting and the fog).
2. No seam, gap, or doubled end face along any wall; corners covered by posts.
3. Every opening state draws: door shut, open, broken, boarded on either side; window shut, open, broken, boarded.
4. Near walls translucent indoors as before; no stub mode remains.
5. Open leaves and shutters appear only on the near face and never cover the opening.
6. The bed, table, chairs, well, and fireplace stand where the map puts them, slice and sort against a walking character, mirror when turned, and the chair turns through four facings.
7. The fireplace lights its room and animates its flames; the well gives water.
8. The ground acceptance script passes nine of nine with the drawn floors.
9. Frame and bake costs unchanged within noise.
10. Michael's eye.

## Follow-up requests for Claude Design

- **Written, paste-ready, in `18-building-art-brief.md`:** the log wall set with its post, leaves, and shutters; board overlays; and placement previews of single segments, mixed materials, corners, and boarded openings.
- **Later, when wanted**: the chest, barrel, campfire, torch post, pumpkins; dirt and cobble textures; stub (cut-down) wall art if translucent near walls ever bother Michael; far-side door leaves if a door between two rooms is ever built.

## What this must not foreclose

- **Upper floors**: walls still carry a layer; a drawn wall is a picture of an edge on a layer.
- **Roofs**: the cap being inside the sprite today does not stop a roof layer later; the cap layer request is the clean path.
- **The floor stamp** (docs/15): laid floors are sheets picked by hash; a stamped wood tile is a floor id like any other.
- **Michael's map editor**: props with facings and turned footprints are data on the prop (`facing`, `footprint`), which the editor writes.
