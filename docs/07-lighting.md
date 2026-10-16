# 07 — Milestone 2: lighting, fire, and the clock

**Status, 2026-10-16: built (accepted 2026-10-09); a reference.** The code is the truth: `src/clock.js` (a twelve-minute day, night brightness 0.22, new worlds start at 08:00) and `src/light.js` (`lightAt` as the one function, the per-chunk light maps, the day cap 0.92). Light is read per pixel by the WebGL2 renderer (`08`): where a line below speaks of the night layer, the shader does the same from the light, ambient, and fog textures, and Michael's rules for what takes which light hold per pixel (a wall face the tile it looks onto, a wall top the sky, a prop or a character its feet). Each fire kind carries its own `fuel`, `hoursPerUnit`, and `maxFuel` in its sprite definition (the table below), fed through its menu from the bag or from anything in reach (`30`, section 7). `T` takes a torch from what you carry into a hand and puts it back; a torch on the belt gives half its light and one in each hand more (`world.beltLight`, `twoTorches` in `data/tuning.json`); the carried light is one per player, each with its owner, and the light and the fires are the world's, the same for every player (`31`). The parent's system as it was read, the Canvas 2D night layer, the first torches-and-hands design, the build order, the acceptance, and the tunables are `history/07-lighting-build.md`.

**Ruled 2026-10-16, to build (#88):** darkness shortens the player's sight. With no light a player sees a short radius; past it, over a soft edge of a few tiles, the dead fade from dim to hidden unless they stand in light; a carried torch gives sight back to its radius, the dead seeing its flame being the trade; a lit room is seen from afar; daytime unchanged; each player sees by its own light; every number in `data/tuning.json` (Michael: "C: darkness shortens sight, the dead fading to hidden past a soft edge unless they stand in light; a torch gives sight back; numbers in data.")

## The idea in four sentences

Light is one number per position, 0 to 1, and everything reads it: what you see, what the dead see, and later what the off-screen records are drawn to. Night is dusky, never black, and every fire carves a real shadowed pool into it. Indoors, light is a fact about the room: its hearth and its open shutters. A torch in your hand lets you see at the cost of being seen from far away.

## What changes for chunks and rooms

- **The light map is per chunk**, 16×16 tiles at two cells per tile, computed one cell beyond the chunk on every side. A chunk's map includes every source within its radius of the chunk, whichever chunk the source stands in, so two neighbouring chunks compute identical values for the cells they share and the layer draws without seams: each chunk's image is drawn clipped to its own diamond, and the one-cell border gives the smoothing its neighbours. No padding tricks.
- **The signature** of a chunk's map is its list of sources (kind, tile, lit) plus `worldVersion`, since a shutter or a door changes shadows. Opening a shutter rebuilds the visible chunks' maps, nine of them, about a thousand cells each, a few sources each with a ray. If it shows in the debug corner, the signature gets a per-chunk wall version.
- **The path test is `lineOfSight` from `visibility.js`**, the same edge walk sight uses, so a wall, a closed shutter, or a closed door casts a shadow and an open one lets light through. One set of blockers for light and sight: light feeds sight. Trees do not block sight today and so do not cast shadows; revisit if a lit forest looks flat.
- **A room is lit if it contains a lit hearth.** Rooms are refound by flood fill and their ids change, so nothing is stored on the room: at rebuild, each room gets `openings`, the door and window edges its fill touched, and `lit` is derived by looking up the hearths' tiles. Openness counts the room's open shutters and open doors; closed ones admit nothing.
- **Ambient is per tile, not per node.** Outdoors is the clock's brightness. A room tile gets its room's ambient. The night layer is one tint for the outdoor darkness, then each visible room erases its floor diamonds and the faces of its own walls by how much brighter it is than outdoors, so a lit cottage glows whole at night and an unlit one is as dark as the yard. Wall faces lit by the floor map (a torch pool climbing a wall) stays parked, as in the parent.
- **The hearth is both ambient and a source.** Its room is lit by the ambient rule; its radius pool spills through an open door or shutter onto the ground outside, by the ray test, so the parent's separate "lit window emits outdoors" rule is not needed. Close the shutters and the spill is gone.

## Fire is data

Every fire kind is a definition, not a case. A sprite definition declares `fire: { radius, burns, cooks, place }`; a wall edge may carry a torch; an item may be a fire in the hand.

| Fire | Radius | Burns | Cooks | Placed |
|---|---|---|---|---|
| Torch, held | 3 | no | no | either hand; on the belt at half, unseen |
| Torch, mounted | 3 | no | no | a bracket on a wall edge, or a torch post |
| Campfire | 4 | logs, two hours each, holds four | yes | outdoors |
| Hearth, fireplace | its whole room, plus a pool of 3 through its openings | logs, three hours each, holds four | yes | indoors against a wall |
| Oven | 2 | logs, two hours each, holds three | yes | a station (`30`) |
| Forge | 3 | charcoal, two hours each, holds four | no, it forges | a station (`30`) |
| Jack-o'-lantern | 1.5 | no | no | decoration; always lit |
| Fire arrow | a small light in flight | no | no | an arrow dipped at any lit fire; it burns what it hits (`02`, 2026-10-15) |

- **Burning.** A burner holds `maxFuel` units of its `fuel` and burns one per `hoursPerUnit` in-game hours (a game hour is thirty real seconds); a full night from dusk to dawn costs the hearth about three logs. At zero it goes out: no ambient, no pool, no flame drawn. Nothing shuts off on a timer; a fire goes out because it burned what you gave it.
- **Lighting and feeding.** A fire's menu offers Light (with a log, or a charcoal, in reach) or Feed, saying how full it is; the fuel comes from the bag or from anything in reach, and `E` takes it as the nearest simple action while you have fuel and the fire has room. Lighting needs no flame source: torches are always lit, so fire is never scarce, wood is.
- **Flames are drawn** emissive, unlit and unfogged, over the fire: a few frames of flicker per fire kind, and the light flickers with them (`fire.flicker` on the definition; `08`).

## Who reads light

- **Zombie sight of the player**: the parent's scaled range, with `lightAt(player)`.
- **Zombie sight of fire.** New, one rule: on each sight check, if `nightFactor > 0`, a zombie looks for the nearest lit source within `FLAME_RANGE × nightFactor` tiles (twelve at full night) with a clear line, and treats it as a sighting at that tile. A carried torch is a sighting of the player. The memory rule does the rest: walk there, search ten seconds, give up, notice it again. A campfire gathers a slow crowd that mills about it; closed shutters hide a hearth; a torch in a forest brings them from four screens' width. The same number was to be the per-chunk lure of the records `03` planned, which were never built (`history/03-world-model-plan.md`, "Alarm, lure, trickle").
- **The player's sight.** At night the fog is light: a tile in line of sight but unlit is dark, and the night-vision pool shows the few tiles around you. Today the dead in the dark are dim shapes, drawn, never hidden (ruled to change, #88: hidden past a soft edge unless in light). Which tiles count as "visible" for the fog does not change; the night layer is a second darkening on top of it.
- **The debug corner** shows the clock label and `light@player`.

## The look

- **The tint is dusky purple**, not the parent's blue. Start at `rgb(36, 22, 56)` at `0.96 × darkness` and pick by eye between two adjacent steps, as the parent's tint was chosen.
- **Full day is never quite full.** The vision says Halloween never ends here: the day cap is 0.92 (`tunables.dayCap` in `light.js`), chosen by eye.

## What this must not foreclose

- **The lantern** (`05-someday.md`): the carried term has an on flag; a lantern is a second item with the same shape and a toggle.
- **Candles**: one more row in the fire table.
- **Roofs**: a room's ambient already ignores the sky; a roof changes only how the room is drawn.
- **Upper floors**: the chunk map is keyed by chunk and layer from the start, even with one layer.
- **Building**: brackets are edge state and posts are props, both placeable by the creative tool.
- **The great hall**: ambient by room may later cap by room size; one line, nothing to prepare.
