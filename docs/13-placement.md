# 13 — Milestone 7: placement

**Status, 2026-10-16: built and accepted (2026-10-11); a reference.** The code is the truth (`src/placement.js`, `src/ui/build-palette.js`, the ghost in `render/props.js`, the build grid in `render/scene.js`; `data/build.json` for what can be built and what it costs: a log wall for one log, a door for three planks, a window for two). On a guest the ghost is drawn from the replica and a click goes to the host as a command, which performs the put-down, the build, or the removal for the guest's player with its own reach (`placement.performPlacement`, `setSender`, `syncCarried`; `02`, 2026-10-13); the prop a character carries is in its record (`carried`), so a save and a join keep it; `canCarry`, `canPutDown`, and `putDownTarget` live in `placement.js` and `interact.js` re-exports them. Crafting makes props, a prop recipe landing on a free tile beside its station (`stations.js`, `30` step 3); nothing is yet placed from the bag. The spec as scoped and the as-built notes of its build are `history/13-placement-build.md`.

One tool for putting things in the world: carried furniture, and built walls, doors, and windows. A ghost of the thing follows the cursor, R turns it, the ghost is green where it may go and red where it may not, and a left click puts it there. It replaces "press E and hope" for furniture (Michael, 2026-10-10 pin 3) and opens building, which `05-someday.md` kept at zero cost through walls-as-edge-state and rooms-by-flood-fill.

## What can be carried

A rule, not a list (Michael, 2026-10-11: "extend it to other items that can be picked up as a rule"). `interact.canCarry(prop)`: a prop can be lifted unless it is **rooted** (a tree, the well), **built in** (the hearth, a torch post), or **a fire that burns fuel** (the campfire). Everything else can: the bed, table, chest, barrel, and the jack-o'-lantern. A sprite's own `carry` flag, true or false, overrides the rule. A lit prop goes dark while carried (it leaves the fire set) and lights again when set down. The campfire is held fixed for now because a burning fire has no good answer to being carried; flip it with `"carry": true` in `data/sprites/campfire.json`.

## Removal

The removal tool (Michael, 2026-10-11: "delete anything placed or built, highlight green, click to destroy"). **X** enters it, or the Remove row on the build palette; X, N, or Escape leaves it. Moving the cursor highlights the front-most thing under it that the player placed or built, in the ghost's green; red with "Too far" past `REMOVE_REACH`; a click destroys it instantly and the tool stays on.

- **What can be removed** (Michael, 2026-10-15: what players made, never the village's own things): a prop made at a station (`made`, set when a station delivers it) and a wall, door, or window with `built` set (`placement.js`, `removalTarget`). Trees, the well, the hearth, the campfire, torch posts, and the cottage's own walls never highlight, so the tool is quiet over a forest.
- **What it does:** a prop is removed from the map and a container spills what it held onto its tile; a wall is taken off its edge with its boards and bracket, and sight, light, rooms, and pathing update at once. Nothing is refunded.
- **Finding the target:** a prop by its tile or its drawn rectangle; a wall by its drawn face on screen, or by the ground edge the building tool would pick, a little behind a face hit. The front-most (highest tile sum) wins.
- Hands full means no removal, like building.

## Free building

The setting `freeBuilding` (settings screen, default off, kept in the browser): while on, every build costs nothing, the palette shows "free", and nothing is taken from the bag. Build time still applies. It is for testing structures; turn it off to test the costs.

## Accepted, and what is left for later

Michael, 2026-10-11, after building a one-tile house for himself and the jack-o'-lantern: "the fundamentals are here." Left for later, so nothing here forecloses them:

- **Stone.** No stone item, so no stone wall. When stone is gathered (a quarry, rubble), `data/build.json` takes a `stone_wall` row with `wall_stone` as its sheet and nothing else changes.
- **Tear-down of authored walls.** The removal tool only takes walls with `built` set. One line (`wall.built` ignored in `removalTarget`) opens the village's own walls to it; Michael has not asked.
- **Refunds.** Removal gives nothing back. Salvage (a log back from a log wall) is a cost table away.
- **The campfire** cannot be carried while lit or at all; `"carry": true` in its sprite file would allow it once a carried fire has an answer.
- **An in-game building editor.** Placement is its seed: a ghost, a validity rule, a palette. Floors, props from inventory, and rotation of real furniture art would grow from here. Not scheduled.
- **Placing items from the bag** (dropping a chest you carry in the bag as a prop) is not placement; the bag's Drop puts items on the floor as entries. A prop-from-item path waits for crafting.
- **Hands-on testing** of doors and windows built into real houses, and of several builders' worth of rooms, is still to do.

## Tunables

`PLACE_REACH` 2.6 tiles, `BUILD_REACH` 2.6, `REMOVE_REACH` 2.6 (all raised a full tile on 2026-10-11; `placement.js`), the costs and seconds in `data/build.json`, the ghost tints in `render/props.js` (`GHOST_OK`, `GHOST_BAD`).
