# 07 — Milestone 2: lighting, fire, and the clock

Ruled 2026-10-09 (`02-decisions.md`, "Torches, fire, hands, and the clock"). This is the design to build. Michael's brief: the last thing the vibe pass needs is a real lighting system like the cozy parent's, where a candle changed what a room looked like rather than glowing. The parent's art looked good but felt sterile; this is a different place, and from here every gameplay decision is more fun to test.

The parent's system is described in its `docs/14-lighting-reference.md` and built in its `src/light.js` and `src/clock.js`. This page says what carries over, what changes for chunks and rooms, and what is new: fire as data, torches that mount, hands, and the dead seeing flames.

## The idea in four sentences

Light is one number per position, 0 to 1, and everything reads it: what you see, what the dead see, and later what the off-screen records are drawn to. Night is dusky, never black, and every fire carves a real shadowed pool into it. Indoors, light is a fact about the room: its hearth and its open shutters. A torch in your hand lets you see at the cost of being seen from far away.

## What the parent gives us, as is

- **The clock.** A twelve-minute day. Brightness 1.0 by day, 0.22 at full night, full dark 23:00 to 06:00 with a one-hour taper each side, new games start at 08:00. `getBrightness()`, `nightFactor()`, `getLabel()`. Copied whole.
- **One function.** `lightAt(gx, gy)` = clamp(ambient + static map contribution + carried light). No caller computes light any other way. Copied in shape; every term below changes its inputs.
- **The static map with shadows.** Sources baked into a cached grid at two cells per tile; each source adds `min(1, 1.4 × (1 − d / radius))` if the straight path from source to cell is clear; the source's and target's own tiles never block. The cache rebuilds when its signature changes. Copied, made per chunk.
- **Ambient by room.** A lit room is 1.0. An unlit room is `0.22 + (0.88 − 0.22) × dayFactor × openness`, where openness is 0.5 per opening that admits daylight, clamped to 1. Board everything and noon is midnight. Copied, with shutters as the openings.
- **Zombie sight scales with the light on the player.** Range = `sight × (0.35 + 0.65 × lightAt(player))`. Unlit at night, about a third; in a pool or by day, full. Copied.
- **The night layer.** One offscreen layer per frame, a tint erased where there is light, composited with `multiply` so colours darken proportionally. The player's own weak night-vision pool, 190 px wide, 42 percent at the centre, deliberately too soft to read as a spotlight. Copied, drawn over the whole viewport instead of one node.
- **Not drawing the dead in the dark reads as spawning.** The parent tried it and rejected it. The dead in the dark are drawn dim by the night layer like everything else, never skipped.

## What changes for chunks and rooms

- **The light map is per chunk**, 16×16 tiles at two cells per tile, computed one cell beyond the chunk on every side. A chunk's map includes every source within its radius of the chunk, whichever chunk the source stands in, so two neighbouring chunks compute identical values for the cells they share and the layer draws without seams: each chunk's image is drawn clipped to its own diamond, and the one-cell border gives the smoothing its neighbours. No padding tricks.
- **The signature** of a chunk's map is its list of sources (kind, tile, lit) plus `worldVersion`, since a shutter or a door changes shadows. Opening a shutter rebuilds the visible chunks' maps, nine of them, about a thousand cells each, a few sources each with a ray. If it shows in the debug corner, the signature gets a per-chunk wall version.
- **The path test is `lineOfSight` from `visibility.js`**, the same edge walk sight uses, so a wall, a closed shutter, or a closed door casts a shadow and an open one lets light through. One set of blockers for light and sight: light feeds sight. Trees do not block sight today and so do not cast shadows; revisit if a lit forest looks flat.
- **A room is lit if it contains a lit hearth.** Rooms are refound by flood fill and their ids change, so nothing is stored on the room: at rebuild, each room gets `openings`, the door and window edges its fill touched, and `lit` is derived by looking up the hearths' tiles. Openness counts the room's open shutters and open doors; closed ones admit nothing.
- **Ambient is per tile, not per node.** Outdoors is the clock's brightness. A room tile gets its room's ambient. The night layer is one tint for the outdoor darkness, then each visible room erases its floor diamonds and the faces of its own walls by how much brighter it is than outdoors, so a lit cottage glows whole at night and an unlit one is as dark as the yard. Wall faces lit by the floor map (a torch pool climbing a wall) stays parked, as in the parent.
- **The hearth is both ambient and a source.** Its room is lit by the ambient rule; its radius pool spills through an open door or shutter onto the ground outside, by the ray test, so the parent's separate "lit window emits outdoors" rule is not needed. Close the shutters and the spill is gone.

## How things are lit, as built

The night layer works in screen space, so the rules below say what takes which light. Michael set the first two from play on 2026-10-09 after a wall hidden from the player kept the dark of the room floor behind it, and a canopy over a lit room took the room's light.

- **The floor takes the map**: the clock, the room's ambient, and the fire pools with their shadows.
- **A wall face takes the light of the tile it looks onto.** The camera looks from the south-east, so a north wall shows its south face and a west wall its east face; each looks onto the tile its edge belongs to. An exterior face therefore matches the ground beside it, seen by the player or not; an interior face matches its room. A corner post's two faces look onto the tiles beside it, one each.
- **The top of a wall or a post always takes the sky**, never the room, so a run of walls and its posts agree.
- **Everything standing on a tile takes the light of its own tile**: a tree outside a lit cottage stays dark where its canopy crosses the room on screen, and a figure in a dark yard is dark against a lit wall. Done by cutting each sprite out of the layer and painting it back at its own darkness, only for sprites that overlap a room whose light differs from outdoors; a wall drawn after the sprite then gets its own darkness painted back over the overlap, so a chest behind a translucent wall does not show through it lit (Michael's diagnosis, 2026-10-09).
- **A translucent near wall takes a mix**: mostly its room's light, partly its own face's, in the proportion it is drawn.
- **Flames never dim.** They draw in their own layer above the night, stencilled by whatever the sort order draws after them, so a flame behind a wall or a head is hidden.
- Parked, as in the parent: a pool climbing a wall face, and the player's own pool on the faces beside them beyond a small term at their foot.

## Fire is data

Every fire kind is a definition, not a case. A sprite definition declares `fire: { radius, burns, cooks, place }`; a wall edge may carry a torch; an item may be a fire in the hand.

| Fire | Radius | Burns wood | Cooks | Placed |
|---|---|---|---|---|
| Torch, held | 3 | no | no | the off-hand |
| Torch, mounted | 3 | no | no | a bracket on a wall edge, or a post prop outdoors |
| Campfire | 4 | yes, goes out | yes | any outdoor walkable tile with no prop (ruled) |
| Hearth | its whole room, plus a pool of 3 through its openings | yes, goes out | yes | indoors against a wall; rare in authored houses, buildable later |
| Jack-o'-lantern | 1.5 | no | no | decoration; its painted ground glow leaves the sprite |
| Furnace | later | yes | no, it forges | the smithy |

- **Burning.** A burner holds up to four logs and burns one per two in-game hours (sixty real seconds). A full night from dusk to dawn costs about four. At zero it goes out: no ambient, no pool, no flame drawn. Nothing shuts off on a timer; a fire goes out because it burned what you gave it.
- **Lighting and feeding, before the inventory exists.** Logs are free (Michael, 2026-10-09): `E` at an unlit burner lights it with a log you are pretending to carry, and `E` at a lit one adds a log if there is room. The inventory port makes the log real and nothing else changes. The burn rate runs so a fire still goes out. Lighting needs no flame source: torches are always lit, so fire is never scarce, wood is.
- **Flames are drawn** on top of the night layer, like the pumpkin's face: a few frames of flicker per fire kind, and a warm glow sprite at the base. The jack-o'-lantern keeps its flicker and loses its painted ground glow, which the map now does properly.

## Torches, hands, and the first items

- **`items.js`** is a minimal registry ahead of the inventory port: `{ id, name, hands, fire }`. `hands` is `main`, `off`, or `both` on every holdable item from now on. The torch (`off`, fire radius 3) is item one. The player gets `hands: { main, off }`.
- **`T` toggles the torch** into and out of the off-hand for this milestone; the inventory later does it through the normal UI. A held torch is lit. The rule for the slots is written now and exercised when there is a second item: `both` empties both slots, `off` is refused while both are full.
- **The carried light is not in the map.** It is evaluated at query time like the parent's beam: +1 on the carrier's own tile and within the radius with a clear line from the carrier, so the drawn pool, the sight test, and the light value always agree. Drawn as a polygon from twenty-eight rays marched along the edges, with a gradient from the chest outward, so the pool stops at walls.
- **A bracket is wall state**: `torch: side` on an edge, like `shutter`, lit when it holds one. `E` at an empty bracket with a torch in hand mounts it; `E` at a full bracket with an empty off-hand takes it. Brackets are authored in the map file for now and placed by the creative tool later.
- **A post is a prop** with `fire` and a `holds: torch` slot, authored for now, built from wood later. A post with no torch is a post.
- **A torch on the ground is an unlit item.** Not in this milestone, since items on the ground arrive with the inventory.

## Who reads light

- **Zombie sight of the player**: the parent's scaled range, with `lightAt(player)`.
- **Zombie sight of fire.** New, one rule: on each sight check, if `nightFactor > 0`, a zombie looks for the nearest lit source within `FLAME_RANGE × nightFactor` tiles (twelve at full night) with a clear line, and treats it as a sighting at that tile. A carried torch is a sighting of the player. The memory rule does the rest: walk there, search ten seconds, give up, notice it again. A campfire gathers a slow crowd that mills about it; closed shutters hide a hearth; a torch in a forest brings them from four screens' width. The same number becomes the per-chunk lure in `03-world-model.md` when records exist.
- **The player's sight.** At night the fog is light: a tile in line of sight but unlit is dark, and the night-vision pool shows the few tiles around you. The dead in the dark are dim shapes, drawn, never hidden. Which tiles count as "visible" for the fog does not change; the night layer is a second darkening on top of it.
- **The debug corner** shows the clock label and `light@player`.

## The look

- **The tint is dusky purple**, not the parent's blue. Start at `rgb(36, 22, 56)` at `0.96 × darkness` and pick by eye between two adjacent steps, as the parent's tint was chosen.
- **Full day may never be quite full.** The vision says Halloween never ends here. Try a day cap of 0.92 and see whether the dusky look holds without reading as a bug. Michael decides by eye.
- **Pools are smooth, shadows are soft.** The parent drew the two-cell-per-tile map through the iso transform with image smoothing on, which breaks the letter of "never scale in `drawImage`". That rule exists for pixel art; the erase layer is a gradient, not a sprite, and the parent's look depends on the smoothing. Ruled 2026-10-09: allowed for the light erase layer only. The alternative, chunky per-cell diamonds in the Minecraft manner, is one function away and stays on the backburner in case the first pass does not please.

## What this must not foreclose

- **The lantern** (`05-someday.md`): the carried term has an on flag; a lantern is a second item with the same shape and a toggle.
- **Candles**: one more row in the fire table.
- **Roofs**: a room's ambient already ignores the sky; a roof changes only how the room is drawn.
- **Upper floors**: the chunk map is keyed by chunk and layer from the start, even with one layer.
- **Building**: brackets are edge state and posts are props, both placeable by the creative tool.
- **The great hall**: ambient by room may later cap by room size; one line, nothing to prepare.

## Build order

Each step is checkable on its own, and Michael looks after step 3 before the rest is built.

1. `clock.js` copied. Clock label in the HUD and the debug corner. `]` skips an hour.
2. `light.js`: ambient by room and openings, the per-chunk static map, `lightAt`. The three jack-o'-lanterns are the first sources. `light@player` in the debug corner.
3. The night layer in `render.js`: tint, room erase, chunk maps, the player's pool. **Pause here: the tint, the day cap, and whether the room-light rule reads.**
4. Fire data on the sprites, hearth and campfire placeholders, burning, `E` to light and feed with free logs, flames drawn. A hearth in the cottage, a campfire on the square.
5. `items.js`, hands, the torch on `T`, the carried pool with rays, brackets and posts, `E` to mount and take. A bracket inside the shed, a post by the road.
6. Zombie sight by light; the dead see fire at night.
7. Acceptance, scripted and played.

## Accept when

1. **The room changes, not a glow.** At night, the cottage with its hearth lit is bright inside, whole, and its open window and door throw pools onto the square; shuttered, the spill is gone and the cottage is dark from outside. Michael: this is the thing the parent had.
2. **The night is dusky, never black.** Far unlit ground is dim but there. The tint reads as this place, not the parent's suburb.
3. **Fire pulls.** A zombie ten tiles from the campfire at night with a clear line walks to it and mills about; with a wall between, it does not. The same zombie ignores you in the dark at six tiles and comes at you at ten when you light the torch.
4. **The hearth burns and goes out.** Lit with four logs it lasts a night and dies at dawn; `E` relights it.
5. **The torch mounts.** Taken from the shed's bracket, carried through the forest as a pool that stops at trunks and walls, mounted on the post by the road, where it lights the road and never burns down.
6. **The fog is light.** In the forest at night without a torch you see the few tiles around you and a dim shape where a zombie stands in your line of sight.
7. **60 fps** with the night layer over the usual seven hundred tiles and all three kinds of fire in view.

If any fails, stop, write down why in `02-decisions.md`, and talk.

## Tunables, to retune by eye

Day length 720 s; night brightness 0.22; day cap 0.92 or 1.0; tint and alpha; night-vision pool 190 px at 0.42; torch radius 3; campfire 4; hearth pool 3; pumpkin 1.5; logs per burner 4; one log per two game hours; `FLAME_RANGE` 12; sight's dark fraction 0.35; unlit-room cap 0.88; openness 0.5 per opening.
