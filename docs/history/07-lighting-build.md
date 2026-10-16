# 07 — Lighting: the build record

The sections of `docs/07-lighting.md` that were the plan and its build (what the parent gives us, the Canvas 2D night layer and its rules, the first fire table, torches, hands, and the first items, the build order, the acceptance, the tunables), with its status block and the lines rewritten in place as they stood; moved here whole by the sweep, 2026-10-16. The live text is `docs/07-lighting.md`. Never edited after.

## The status block and the head as they stood

**Status, 2026-10-13: built** (accepted "good for now" on 2026-10-09). The code is the truth (`src/clock.js`, `src/light.js`); since this was written: the Canvas 2D night layer is gone and light is read per pixel by the WebGL2 renderer (`08`; the note under "How things are lit"); logs and planks are real items, fed from the bag by the menu's Feed, and each fire kind carries its own `fuel` and `hoursPerUnit` in its sprite definition (the hearth three hours a log, the campfire two, the forge burning charcoal; `30`, section 7); `T` takes a torch from what you carry into a hand and puts it back; a torch on the belt gives half its light and one in each hand more (`world.beltLight`, `twoTorches` in `data/tuning.json`); the carried light is one per player, each with its owner, and the light and the fires are the world's, the same for every player (`31`).

Ruled 2026-10-09 (`02-decisions.md`, "Torches, fire, hands, and the clock"). This is the design to build. Michael's brief: the last thing the vibe pass needs is a real lighting system like the cozy parent's, where a candle changed what a room looked like rather than glowing. The parent's art looked good but felt sterile; this is a different place, and from here every gameplay decision is more fun to test.

The parent's system is described in its own `docs/14-lighting-reference.md` (a file of `cozy-zombie-game`, not of this repo; `14` here is combat) and built in its `src/light.js` and `src/clock.js`. This page says what carries over, what changes for chunks and rooms, and what is new: fire as data, torches that mount, hands, and the dead seeing flames.

## What the parent gives us, as is

- **The clock.** A twelve-minute day. Brightness 1.0 by day, 0.22 at full night, full dark 23:00 to 06:00 with a one-hour taper each side, new games start at 08:00. `getBrightness()`, `nightFactor()`, `getLabel()`. Copied whole.
- **One function.** `lightAt(gx, gy)` = clamp(ambient + static map contribution + carried light). No caller computes light any other way. Copied in shape; every term below changes its inputs.
- **The static map with shadows.** Sources baked into a cached grid at two cells per tile; each source adds `min(1, 1.4 × (1 − d / radius))` if the straight path from source to cell is clear; the source's and target's own tiles never block. The cache rebuilds when its signature changes. Copied, made per chunk.
- **Ambient by room.** A lit room is 1.0. An unlit room is `0.22 + (0.88 − 0.22) × dayFactor × openness`, where openness is 0.5 per opening that admits daylight, clamped to 1. Board everything and noon is midnight. Copied, with shutters as the openings.
- **Zombie sight scales with the light on the player.** Range = `sight × (0.35 + 0.65 × lightAt(player))`. Unlit at night, about a third; in a pool or by day, full. Copied.
- **The night layer.** One offscreen layer per frame, a tint erased where there is light, composited with `multiply` so colours darken proportionally. The player's own weak night-vision pool, 190 px wide, 42 percent at the centre, deliberately too soft to read as a spotlight. Copied, drawn over the whole viewport instead of one node.
- **Not drawing the dead in the dark reads as spawning.** The parent tried it and rejected it. The dead in the dark are drawn dim by the night layer like everything else, never skipped.

## How things are lit, as built

**Superseded (2026-10-09, the same night; kept as history).** This section describes the Canvas 2D night layer, which was deleted when the WebGL2 renderer was accepted (`08-renderer.md`). Nothing is lit in screen space now: every vertex carries the world point its light is read from and the shader samples the light, ambient, and fog textures there (`src/render.js`, its header). **Michael's rules below for what takes which light still hold**, and the WebGL renderer applies them per pixel: a wall face the tile it looks onto, a wall top the sky, a prop or a character its feet.

The night layer works in screen space and is painted in two stages, so the rules below say what takes which light. Michael set the first three from play on 2026-10-09, after a wall hidden from the player kept the dark of the room floor behind it, a canopy over a lit room took the room's light, and the chest behind a translucent wall showed through it lit; then asked for the stencils that patched those to become one rule.

- **The floor first**: the clock, each room's ambient (brighter or darker than outdoors), the fire pools with their shadows, the player's own weak pool, and the pool of the torch in the hand.
- **Then everything standing, in the scene's own sort order.** Each drawable paints its own darkness over its own shape, so whatever covers a thing in the scene covers it in the light too. No stencils, no special cases for what is in front of what.
- **A wall face takes the light of the tile it looks onto.** The camera looks from the south-east, so a north wall shows its south face and a west wall its east face; each looks onto the tile its edge belongs to. An exterior face matches the ground beside it, seen by the player or not; an interior face matches its room. A corner post's two faces look onto the tiles beside it, one each.
- **The top of a wall or a post always takes the sky**, never the room.
- **A translucent near wall takes a mix**: mostly whatever shows through it, partly its own face, in the proportion it is drawn.
- **A prop or a character takes the light at its feet**, holes for occluded characters included, so a tree outside a lit cottage stays dark where its canopy crosses the room on screen and a figure in a dark yard is dark against a lit wall.
- **A flame erases itself from the layer in its turn**, so it never dims, and a wall or a head drawn after it hides it.
- A thing at the outdoor darkness that touches no room, pool, or glow would paint base over base and is skipped, which is most of a forest at night; the pass costs about 3 ms a frame in the village.
- Parked, as in the parent: a pool climbing a wall face, and the player's own pool on the faces beside them beyond a small term at their foot. Both need light per pixel rather than per thing, which is a WebGL renderer or, at a rough grain, wall faces drawn as slivers lit from the floor map at their feet.

## The fire table and its bullets, as they stood

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

## Lines rewritten in place, as they stood

- **Zombie sight of fire.** New, one rule: on each sight check, if `nightFactor > 0`, a zombie looks for the nearest lit source within `FLAME_RANGE × nightFactor` tiles (twelve at full night) with a clear line, and treats it as a sighting at that tile. A carried torch is a sighting of the player. The memory rule does the rest: walk there, search ten seconds, give up, notice it again. A campfire gathers a slow crowd that mills about it; closed shutters hide a hearth; a torch in a forest brings them from four screens' width. The same number becomes the per-chunk lure in `03-world-model.md` when records exist.

- **Full day may never be quite full.** The vision says Halloween never ends here. Try a day cap of 0.92 and see whether the dusky look holds without reading as a bug. Michael decides by eye.
- **Pools are smooth, shadows are soft.** The parent drew the two-cell-per-tile map through the iso transform with image smoothing on, which breaks the letter of "never scale in `drawImage`". That rule exists for pixel art; the erase layer is a gradient, not a sprite, and the parent's look depends on the smoothing. Ruled 2026-10-09: allowed for the light erase layer only. The alternative, chunky per-cell diamonds in the Minecraft manner, is one function away and stays on the backburner in case the first pass does not please.

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
