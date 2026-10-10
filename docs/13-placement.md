# Milestone 7: placement

One tool for putting things in the world: carried furniture, and built walls, doors, and windows. A ghost of the thing follows the cursor, R turns it, the ghost is green where it may go and red where it may not, and a left click puts it there. It replaces "press E and hope" for furniture (Michael, 2026-10-10 pin 3) and opens building, which `05-someday.md` kept at zero cost through walls-as-edge-state and rooms-by-flood-fill.

Scoped 2026-10-11 for implementation by another model. Everything a decision needs is decided here; where Michael may want to overrule, the line says "default". Read `02-decisions.md` under 2026-10-11 for the rulings this adds.

## What exists, and is not to be changed

- Props live on tiles: `map.createProp`, `map.placeProp(prop, tx, ty)` (re-tiles from `prop.footprint`), `map.removeProp(prop)`; `tile.prop`, `prop.tiles`, `prop.footprint`, `prop.solid`.
- Walls are state on tile edges: `tile.n` and `tile.w`, each `createWall(kind, sprite)` with `kind` one of `wall`, `door`, `window`. `map.touch()` after any edge change; rooms refind themselves by flood fill. Sight, light, pathing, and the dead all read edges, so a built wall is real the moment it exists.
- Carrying (docs/02, 2026-10-10): `player.carrying` is a lifted prop; `interact.canPutDown(player, tx, ty)`, `putDownAction`, `putDownTarget` (the tile in front for E). While carrying, `actionsAt` offers only Put down and Walk here; the bag, belt keys, sprint, and climbing are off.
- Left click is free (docs/10: Michael withdrew left-click to walk so it could select and place later). Right-click menus and E stay as they are.
- `input.getMouse()` gives the cursor in world pixels; `iso.toGrid(x, y)` gives the fractional tile under it. `input.mouseLeftPressed()` is true for one step after a left press; `menu.tookClick()` says a click dismissed a menu and must be ignored. `input.wasPressed("KeyR")` is free when the inventory panel is closed (the panel uses R only while dragging).
- Boards: `B` and the opening menu add planks to an opening (docs/09). Not placement; untouched.

## The mode

`src/placement.js`, new. One module, one state:

```js
// placement.js
export const state = { active: false, kind: null, ... };
export function beginProp(prop)                 // entered automatically when the player lifts a prop
export function beginBuild(what)                // "wall" | "door" | "window", from the build palette
export function cancel()                        // returns true if a mode was open (Escape)
export function update(player)                  // each logic step: reads the cursor and keys, keeps `ghost` current
export function ghost()                         // null, or what the renderer draws (below)
export function tryConfirm(player)              // on left click: returns true if it consumed the click
```

- **Props.** When `player.carrying` becomes set, placement is in prop mode; when it clears, the mode ends. The ghost is the carried prop's sprite at the hovered tile, with the current footprint. R swaps `footprint` `[w, h]` to `[h, w]` (the slices keep their frames; dev art is boxes, so this is fine). Valid when `interact.canPutDown` says so for every tile of the footprint and the anchor tile is within `PLACE_REACH` tiles of the player. Click: `map.placeProp(prop, tx, ty)` with the rotated footprint, `player.carrying = null`. E still puts it down in front, as today, through `putDownAction`, which must use the current rotated footprint.
- **Building.** `N` opens the build palette (a small DOM list, `src/ui/build-palette.js`, in `#ui`): Wood wall, Door, Window, each with its plank cost and whether the player has them. Choosing one enters build mode. The ghost is a wall face on the hovered edge. Which edge: the cursor's fractional position in its tile decides, nearest of the tile's `n` edge (top-left side of the diamond on screen), its `w` edge (top-right side), the `n` edge of the tile below (`tileAt(tx, ty + 1).n`, the bottom-right side), or the `w` edge of the tile to the right (`tileAt(tx + 1, ty).w`, the bottom-left side). R is not needed for edges and does nothing in build mode. Valid when: the edge has no wall; both tiles the edge separates are walkable or at least have no solid prop straddling the edge; the edge is within `BUILD_REACH` of the player; the player has the planks. Click: start a timed action (`interact.startAction`) of `BUILD_TIME` with the prompt bar, like boarding; on completion `map.buildWall(tx, ty, edge, kind)`, planks spent with `inventory.takeAll(player, "plank", cost)`. Movement cancels it, as every timed action does. Build mode stays on after a build so a run of wall goes up click by click; Escape or N again leaves it.
- **Doors and windows** are walls of another kind: `createWall("door", sprite)` starts closed, `createWall("window", sprite)` starts shuttered, both exactly as authored ones (docs/09). A door needs the edge's two tiles both walkable, so it can be walked through.
- **Sprite for built walls:** `WALL_SPRITE_DEFAULT = "wall_wood"` (the wooden cottage's id in `data/maps/square.json`; the other is `wall_stone`). Stone is not buildable yet; it needs stone, which is not an item.
- **Tear-down** is not in this milestone (noted in `05-someday.md` as salvage).

## map.js additions

```js
export function canBuildWall(tx, ty, edge)   // no wall there; the two tiles exist; no solid prop whose footprint spans the edge
export function buildWall(tx, ty, edge, kind, sprite = WALL_SPRITE_DEFAULT) // sets tile[edge] = createWall(kind, sprite); touch(); markRoomsDirty()
export function edgeTiles(tx, ty, edge)      // [[tx, ty], [tx, ty - 1]] for "n", [[tx, ty], [tx - 1, ty]] for "w"
```

## The ghost, in the renderer

`renderScene` takes `scene.ghost`, null or:

```js
{ kind: "prop", prop, tx, ty, footprint: [w, h], ok }     // drawn as the prop's slices at those tiles
{ kind: "wall", tx, ty, edge, wallKind, sprite, ok }       // drawn as the wall face on that edge
```

Drawn last, after fog, with `FLAG_NOFOG | FLAG_UNLIT`, tinted by the quad `color` argument: green `[0.6, 1, 0.6, 0.55]` when `ok`, red `[1, 0.5, 0.5, 0.55]` when not. The prop ghost reuses the per-slice drawing in `propDrawables` (factor the slice quad into a helper that takes a colour). The wall ghost reuses the face drawing for a single edge (factor the per-edge face emission into a helper `emitWallFace(tx, ty, edge, wall, opts)` with a colour override). The ghost never writes to the occlusion or sort lists; it is an overlay.

## The prompt

While a mode is active the prompt (docs/10) shows at the ghost: `Click to place · R turn · Esc cancel` for props, `Click to build (2 planks) · Esc cancel` for walls, and, when the ghost is red, the reason: `No room`, `Too far`, `Already a wall`, `Need 2 planks`. `interact.promptFor` asks placement first.

## Input order in main.js

In `update`, before `handleMouse`: `placement.update(player)`; then if `input.mouseLeftPressed() && !menu.tookClick() && placement.tryConfirm(player)` the click is spent. Combat (docs/14) reads the click only after placement declined it. Escape (`handleEscape`): menu, then screens, then `placement.cancel()`, then the panel, then pause. Carrying cannot be cancelled by Escape (the prop stays in the hands); only build mode cancels.

## Data

`data/build.json`, loaded at boot like items. Costs are item ids and counts, so any mix works, and each kind names the wall sheet it uses:

```json
{ "wall":   { "label": "Log wall", "sprite": "wall_log", "cost": { "log": 1 },   "seconds": 3 },
  "door":   { "label": "Door",     "sprite": "wall_log", "cost": { "plank": 3 }, "seconds": 4 },
  "window": { "label": "Window",   "sprite": "wall_log", "cost": { "plank": 2 }, "seconds": 3 } }
```

Defaults; Michael tunes by editing the file. (The first draft of this spec had a plank wall; Michael asked for a log wall that spends logs, 2026-10-11.)

## Build order

1. `placement.js` with prop mode only; the ghost for props; left click places; R turns; E still works. Remove nothing from `interact.js` yet.
2. The build palette on N; `map.canBuildWall`, `buildWall`, `edgeTiles`; edge picking from the cursor; the wall ghost; the timed build; planks spent; `data/build.json`.
3. Doors and windows through the same path.
4. The prompt lines and the reasons.
5. Acceptance by script, then `TODO.md` ticks and the Status line, then commit and push.

## Accept when (scripted, through `__game`)

Pause with `loop.setPaused(true)` and step with `loop.advance(1/60)`. The cursor is driven by setting `input.getMouse().x/y` directly (it is a live object) rather than by real mouse events.

1. Lift the bed (`interact` carry action), move the cursor over a clear 2×1 area in reach: `placement.ghost()` is a prop ghost with `ok: true`; over the house wall: `ok: false`; three tiles away: `ok: false` and the prompt says `Too far`.
2. Press R: the ghost's footprint is `[1, 2]`; click a clear spot: the bed stands on two tiles stacked vertically and `player.carrying` is null.
3. With four planks in the bag, N opens the palette with three rows; choose Wood wall; hover an open edge beside the player: green; click: the prompt bar runs for the build's seconds and the edge then has `kind: "wall"`; planks are two fewer; `map.roomCount()` changes once a room is closed by built walls.
4. Hover an edge that already has a wall: red, `Already a wall`. With no planks: red, `Need 2 planks`.
5. Build a door into a built wall's gap: it opens and closes from the menu like an authored door and the dead treat it as one (a zombie with aggro on paths to it and breaches it).
6. Escape in build mode leaves it; Escape while carrying does nothing; N toggles the palette.
7. A built wall blocks sight, light, and movement at once (the debug corner's room and sealed readouts agree; light inside a built room dims).
8. Frame rate unchanged with the ghost showing.

## What can be carried

A rule, not a list (Michael, 2026-10-11: "extend it to other items that can be picked up as a rule"). `interact.canCarry(prop)`: a prop can be lifted unless it is **rooted** (a tree, the well), **built in** (the hearth, a torch post), or **a fire that burns fuel** (the campfire). Everything else can: the bed, table, chest, barrel, and the jack-o'-lantern. A sprite's own `carry` flag, true or false, overrides the rule. A lit prop goes dark while carried (it leaves the fire set) and lights again when set down. The campfire is held fixed for now because a burning fire has no good answer to being carried; flip it with `"carry": true` in `data/sprites/campfire.json`.

## Free building

The setting `freeBuilding` (settings screen, default off, kept in the browser): while on, every build costs nothing, the palette shows "free", and nothing is taken from the bag. Build time still applies. It is for testing structures; turn it off to test the costs.

## As built

Step 1, prop mode (2026-10-11), with the places the build had to settle:

- **`canPutDown` and `putDownTarget` moved into `placement.js`** and `interact.js` re-exports them, so the dependency runs one way (interact imports placement) with no import cycle. Callers see no change.
- **`canPutDown` now also refuses a footprint with a wall between two of its own tiles**, so a bed cannot straddle a wall. E in front gets the same rule.
- **The prop prompt does not say "Esc cancel".** Escape cannot cancel carrying (the prop stays in the hands), so the green prompt reads `Click to place · R turn · E in front`, and the red one is the reason alone: `Too far` (checked first) or `No room`.
- **"Escape while carrying does nothing"** means it does not cancel the carry or leave prop mode; Escape with nothing else to close still opens the pause menu, as everywhere.
- **Reach is measured to the anchor tile**, as written. The footprint is centred on the cursor, so a 2×1 bed's anchor is its left tile.
- **The ghost also draws a tinted diamond under each footprint tile**, so the footprint reads where the box is dark.
- **Edge naming (for step 2):** the spec's "top-left" and "top-right" sides are swapped against the iso maths. A tile's `n` edge is its upper-right side on screen (toward the tile above and to the right) and its `w` edge its upper-left side. Edge picking uses the cursor's fractional offset in the tile, not those labels.

Steps 2 to 4, building (2026-10-11):

- **`placement.js` carries both modes.** Build mode: `beginBuild(what)`, `pickEdge` (the nearest side of the hovered tile), a ghost drawn by the real wall code (`makeWall` takes a tint), the cost check (`costOf`, `shortfall`, `costText`), and the timed build through `interact.startAction`, handed in by `placement.init` so there is no import cycle. Nothing is spent until the bar finishes, and everything is checked again then; moving cancels it.
- **Reasons, in order:** `Too far`, `Already a wall`, `No room` (a solid prop spans the edge, or a door's tiles are not both walkable), `Step back` (the player is within 0.45 tiles of the edge), then `Need 1 log` and the like. `Step back` is an addition: a wall built under the player's feet would trap them.
- **`N`** opens the palette; in build mode it leaves build mode; with the palette open it closes it; it does nothing while carrying (a message) or with the bag open. **Escape** closes the palette first, then leaves build mode, then the usual order.
- **`map.js`** gained `canBuildWall(tx, ty, edge, kind)`, `buildWall`, `edgeTiles`, `edgeMid`, `WALL_SPRITE_DEFAULT`. A built wall is `createWall` exactly as an authored one, so doors and windows open, close, take boards, and are breached by the dead the same way.
- **The log wall's sheet** is `wall_log`: the wall generator with a new `log` pattern (rounded courses, a lit line and a seam each). Colour and height are in `data/sprites/wall_log.json`.

## Tunables

`PLACE_REACH` 1.6 tiles, `BUILD_REACH` 1.6, the costs and seconds in `data/build.json`, the ghost tints in `render.js`.
