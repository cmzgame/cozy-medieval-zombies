# 19 — Villagers v0.1: the stub (figures that wander and can be poked, and speech bubbles)

**Scoped for implementation by another model** (planned with Michael on 2026-10-12; nothing built yet). Read `CLAUDE.md`, "Implementing from a spec", then this whole doc, then the files it names. "Default" marks what Michael may overrule, not what the implementer may.

## Status

Scoped. Waiting on Michael's approval of the defaults below.

## Why a stub

Michael (2026-10-12): the game's objects went in as visual stubs first (a rock that wiggles when clicked and does nothing else), and that way of building works. Villagers go in the same way. **v0.1 is: figures of living people, drawn with the player's own rig, who wander aimlessly near where the map puts them, and who say "Hey!" in a speech bubble when poked**, by a left click or by the one entry in their right-click menu. No zombie notices them. Nothing hurts them. That is the whole feature, and it forces two systems everything in `04-npcs.md` hangs off: a second kind of living figure in the world, and words over a head.

The design that follows (`04-npcs.md`: killable, flee, follow and stay, lines, routines, bags) is **not** built here, but nothing built here may stand in its way. The checklist at the end says how.

## Rulings this scope makes (defaults; logged in `02` when built)

1. **A villager is its own entity kind, `"villager"`, in its own module.** Not a flag on the zombie: the zombie's file is the chase, the breach, the climb, and the bite, none of which a villager has. The walking the two share (pick a spot, path to it, follow the path, keep bodies apart) is the zombie's private helpers, **exported from `zombie.js` unchanged** and imported, not copied. When fleeing arrives, those helpers move to a shared walker module; not now.
2. **The dead ignore the living villagers in v0.1.** `updateZombie` still takes the player alone. Villagers join `others` only so bodies keep apart.
3. **The player cannot hurt a villager, and never could** (`04`, open point 3, closed): swings pass through the living. `combat.tryAttack`, `tryShove`, `markTargets` keep taking the zombie list alone; a villager is never a swing target and never gets a health bar.
4. **Villagers wander on a tether.** Idle one and a half to four seconds, then walk to a walkable tile within `WANDER_RADIUS` (4 tiles) of their **home** (the tile the map placed them on), in their own room (indoors stays indoors, outdoors stays outdoors), the zombie's own idle-and-wander with a different centre. They never leave the village on their own. Routines replace the tether later.
5. **Poking is a click within reach**, the same 2.6 tiles as every other click (`interact.CLICK_REACH`), with the same cooldown as a wiggle (600 ms). A poked villager stops, turns to face the player, says its line for two seconds, and goes back to idling. From out of reach, the right-click menu's **Poke** walks the player over first, as every action does.
6. **The line is "Hey!" unless the map gives one.** A villager's map entry may carry `"line"`; it is the dialogue hook and costs nothing now. Michael writes lines in the map file if he feels like it.
7. **Speech is a general system on any entity**, not a villager feature: `say(entity, text, seconds)` works on the player and, one day, on anything with a head. A new line replaces the one showing. Bubbles are DOM in `#ui`, placed through `view.toUi` every step, never drawn into the canvas.
8. **Villagers are goobers** (`00-vision`, `12`): the same neutral body, living skin, no wound, dressed from a warmer palette than the dead's drab so the two read apart at a glance; names short and neutral; the game's text says they/them.
9. **Four villagers in the square**, authored in the map file. Wild chunks never make one.

## What exists to build on

- **The zombie** (`src/entities/zombie.js`): `createZombie` is the entity shape the renderer, the sorter, and the occluder already understand (`kind, sprite, id, gx, gy, layer, facing, speed, radius, hp, maxHp, state, anim, path, repathTimer, idleTimer, stuckTime, pathFailed, lastGoal, dead`). Its `idle` and `wander` states (lines near `case "idle"` and `case "wander"`) are exactly the villager's whole life: `pickTargetAround(x, y, radius, room)`, `repath(z, tile)`, `followPath(z, dt, others)` (returns true on arrival, handles stuck paths), `separate(z, dt, others)`, `faceToward(z, dx, dy)`, `roomOf(z)`. All module-private today.
- **The figure** (`src/figure.js`): `generateFigure(spec)` bakes a sheet from a spec; `zombieSpec(k)` and `playerSpec(look, worn, artOf, hands, overrides, style)` are the two spec makers. `ZOMBIE_OUTFITS` (10) sheets are registered at boot as `zombie_k` (`main.js`, boot, "The dead's outfits") and rebaked when the painted layers reload (`main.js`, "The dead rebake too"). `hairStyles()` lists every hair style, painted ones included; `getLayer("hair", name)`.
- **Drawing** (`src/render.js`, `entityDrawables`): draws any entity with `sprite`, `anim`, `facing`, `gx`, `gy`; `hands` and `carrying` optional. The sort (`besideWalls`) and the occluder (`computeOcclusion`, which sets `entity.behindProp` and cuts a hole only for the player) need nothing new. Out of sight, an entity is not drawn.
- **The step** (`src/main.js`): `others = [player, ...zombies]`; the dead update only within `ACTIVE_TILES` (40) of the player; `renderScene({ entities: [player, ...zombies] })`.
- **Clicks** (`src/interact.js`, `src/main.js`): a left click calls `interact.pokeAt(x, y, player)` then `combat.tryAttack`; a right click calls `pokeAt` and `actionsAt(x, y, player)` and opens the menu. `CLICK_REACH`, `POKE_COOLDOWN_MS`, `distToTiles`, the action shape `{ kind, label, tiles, range, duration, enabled, simple, perform, onStart }`, `runAction` (walks the player within `range` of `tiles`, then performs).
- **Floating UI over a figure** (`src/ui/zombie-bars.js`): the pattern to copy for bubbles: a pool of elements keyed by entity id, placed each step at `view.toUi(iso.toScreen(gx, gy) - HEAD_CLEARANCE)` (76 world px clears the head at any zoom), hidden when the entity's tile is out of the `visible` set or it is `behindProp` beyond 3.5 tiles, removed when no longer wanted. `style.css`, `.zombie-bar` and `#message`, for the look.
- **The map** (`src/map.js`, `loadMap`): returns `{ props, spawn, zombies, name }`; `data/maps/square.json` has `"zombies": [[x, y], ...]`.

## The build

### New: `src/ui/speech.js`

- `initSpeech()`: a `#speech` root in `#ui`, like the bars.
- `say(entity, text, seconds = 2)`: `entity.line = { text, until: performance.now() + seconds * 1000 }`. Replaces any line showing.
- `updateSpeech(entities, visible, player)`: for every entity with a `line` not yet expired, a `.speech` element (pooled by `entity.id`) with the text, at `view.toUi(s.x, s.y - HEAD_CLEARANCE - 4)`; skipped (hidden) when the entity's tile is not in `visible` or it is `behindProp` farther than 3.5 tiles, the bars' rule; removed when expired or the entity is gone. The player's own bubble always shows.
- CSS `.speech`: `position: absolute; transform: translate(-50%, -100%)`; the `#message` colours (`rgba(20, 14, 26, 0.85)`, border `#6a5a70`), 4px radius, `padding: 3px 8px`, `font-size: 12px`, `max-width: 140px`, `white-space: nowrap` (lines are short; a long one may wrap by dropping `nowrap`), `pointer-events: none`; a small tail: a `::after` triangle 5px wide in the border colour under the box, centred.
- `window.__game.say(text)` says it over the player, for testing the system before any villager exists.

### New: `src/entities/villager.js`

```js
export const VILLAGER_SPEED = 1.4;   // tiles per second: an amble, between the dead (1.0) and the player (3.0)
export const VILLAGER_RADIUS = 0.3;
export const WANDER_RADIUS = 4;      // tiles from home a wander may reach
export const TALK_TIME = 2;          // seconds a poked villager stands and faces you
```

- `createVillager(gx, gy, { id, name, line, outfit })`: `{ kind: "villager", sprite: "villager_<outfit>", id: id || "v<n>", name, line: null, say: line || "Hey!", gx, gy, home: [gx, gy], layer: 0, facing: "s", speed, radius, hp: 100, maxHp: 100, dead: false, state: "idle", anim: createAnimation("idle"), path: [], repathTimer: 0, idleTimer: <random in the zombie's idle range>, stuckTime: 0, pathFailed: false, lastGoal: null, talkTimer: 0, pokedAt: 0, hands: null, carrying: null, behindProp: false }`. The `hp`, `maxHp`, `dead` fields are unused in v0.1 and present so killable needs no reshaping.
- `updateVillager(v, dt, others)`: a three-state machine using the exported zombie helpers.
  - `idle`: `playAnimation("idle")`; count `idleTimer` down; at zero pick `pickTargetAround(home.x, home.y, WANDER_RADIUS, roomOf(v))`, `repath`, go `wander`; reset the timer.
  - `wander`: `playAnimation("walk")`; `followPath(v, dt, others)` true → `idle`.
  - `talk`: `playAnimation("idle")`; `separate(v, dt, others)`; `talkTimer` down; at zero → `idle` with a fresh `idleTimer`.
  - Then `advanceAnimation(v.anim, getSheet(v.sprite), dt)` as the zombie does at the end of its update.
- `pokeVillager(v, player)`: honours `POKE_COOLDOWN_MS` through `v.pokedAt` (export the constant from `interact.js` or duplicate the number with a comment naming the source); clears the path, `faceToward(v, player.gx - v.gx, player.gy - v.gy)`, `state = "talk"`, `talkTimer = TALK_TIME`, `say(v, v.say, TALK_TIME)`. Returns whether it spoke.
- `zombie.js`: add `export` to `pickTargetAround`, `repath`, `followPath`, `separate`, `faceToward`, `roomOf`, and export `WANDER_IDLE_MIN` and `WANDER_IDLE_MAX`. No other change to that file.

### `figure.js`: `villagerSpec(k)`, `VILLAGER_OUTFITS = 6`

Built the way `zombieSpec` is, deterministic by `k`, but a living spec: `variant: "player"`, `wound: null`, `holding: { main: false, off: false }`, `look` from a small `LIVING_SKINS` list (the player's `#f0c8a0` and two or three more tones, light to dark, in the same muted register) and `HAIRS`, `hairStyle` picked from `hairStyles()` so Michael's painted hair appears on villagers too (and `painted.hair = getLayer("hair", style)` as `playerSpec` does; `painted.body = getLayer("body", null)`), `under` the player's default. `outfit` from the same garment shapes as the dead (tunic, breeches, boots, hood or cap, belt) coloured from a new `VILLAGE` palette: ochre, rust, moss, slate blue, undyed linen, five or six entries, chosen so no villager outfit matches a zombie's drab. Register `villager_0..5` at boot beside the zombie sheets, rebake them where the dead rebake, and give `specKey` nothing new (it already keys on everything). **No painted-layer flag for villagers in v0.1**; a `villager` option beside `zombie` in `tools/layers.html` is the obvious follow-up once Michael wants to paint village clothes.

### `map.js` and the map file

- `loadMap` returns `villagers: json.villagers || []`, each `{ tile, name, line?, outfit? }` passed through untouched.
- `data/maps/square.json` gains, at the top level:

```json
"villagers": [
  { "tile": [14, 13], "name": "Wren", "outfit": 0 },
  { "tile": [17, 16], "name": "Ash", "outfit": 1 },
  { "tile": [13, 19], "name": "Tam", "outfit": 2, "line": "Keep the shutters closed." },
  { "tile": [16, 6], "name": "Rook", "outfit": 3 }
]
```

Three on the square's cobbles (walkable, outdoors, so they keep to the square), one inside the cottage (so an indoor tether is seen). Names and lines are Michael's to change.

### `main.js`

- `let villagers = []`; at boot after the zombies: `villagers = info.villagers.map((v, i) => createVillager(v.tile[0], v.tile[1], { id: \`v${i}\`, name: v.name, line: v.line, outfit: v.outfit ?? i }))`; `interact.setVillagers(villagers)`; `initSpeech()`.
- The step: `others = [player, ...zombies, ...villagers]`; after the zombies' loop, the same `ACTIVE_TILES` gate around `updateVillager(v, dt, others)`; `updateSpeech([player, ...villagers], visible, player)` beside `updateZombieBars`.
- The left click: `interact.pokeAt(...)`, `interact.playAt(...)`, then **`interact.pokeVillagerAt(x, y, player)`**, then `combat.tryAttack` as now. (A click on a villager also swings, as a click on a rock does; the swing passes through them. Default; Michael may want the swing held when the click lands on a villager.)
- `renderScene({ entities: [player, ...zombies, ...villagers] })`.
- The debug corner: `villagers N` after the zombies' count.
- `window.__game`: `villagers` (a getter), `say(text)`.

### `interact.js`

- `setVillagers(list)`, kept in a module variable.
- `villagerAt(sx, sy)`: the villager whose sprite rect (`frameRect`'s shape: `x - anchor[0], y - anchor[1], FW × FH` of its sheet's current frame) contains the point, nearest to the camera (largest `gx + gy`) on a tie. A rect test, not a pixel test: figures are small and the rect is the forgiving choice for a thing that moves.
- `pokeVillagerAt(sx, sy, player)`: `villagerAt` within `CLICK_REACH` of the player → `pokeVillager(v, player)`. Returns the villager found, poked or not.
- `actionsAt`: before the walk fallback, if `villagerAt(sx, sy)` finds one, push its one action: `act({ kind: "poke", label: \`Poke ${v.name}\`, tiles: [[Math.round(v.gx), Math.round(v.gy)]], range: CLICK_REACH, simple: false, perform() { pokeVillager(v, player); return true; } })`. The tile is where they stood when clicked; if they wander a step before the player arrives, the poke still lands (they say the line from wherever they are). No "Walk here" when a villager was clicked, as for a prop.
- A right-click on a villager does **not** poke them on the click itself (props sway on the right click; a villager answers only to the left click or the menu's Poke). Michael's words: one menu item, same result as the left click.

### Docs and the record

`02`: the rulings above under the day's date. `04-npcs.md`: a Status line at the top saying v0.1 is built and what it is. `TODO.md`: the milestone's boxes and the Status line. `CLAUDE.md`: `19` in the doc index; `villager.js` and `speech.js` in the code map.

## Build order, with a pause after each step

1. **Speech.** `speech.js`, the CSS, `__game.say`. **Verify:** `__game.say("Hey!")` puts a bubble over the player's head at every zoom level (the gap between the head and the bubble's tail stays within a few UI px across wide, middle, and close), the bubble follows the player while walking, and it is gone after two seconds; a second `say` replaces the first.
2. **Villagers in the world.** `villager.js`, `villagerSpec`, the exports from `zombie.js`, the map entries, the step and the renderer. **Verify (script):** four villagers exist with four different sprites; stepping 60 s at 1/60 keeps each within `WANDER_RADIUS` of its home and in its starting room; a zombie teleported beside one stays `idle` or `wander` for 10 s and the villager's `hp` is unchanged; a villager behind a tree gets `behindProp` and no hole; out of sight, it is not drawn. The step's cost with four villagers is within 0.1 ms of before. *Pause: Michael looks at them.*
3. **Poking.** `pokeVillagerAt`, the menu's Poke, the talk state. **Verify (script):** a left click on a villager's sprite within reach makes it face the player, stop, and show "Hey!" (or its line) for two seconds, then it idles and wanders again; a click from across the map returns the villager but does not poke; a second click within 600 ms does not restart the line; `actionsAt` on a villager returns exactly one action labelled `Poke <name>`; `runAction` on it from six tiles away walks the player over and then the bubble shows. `combat.tryAttack` with a villager alone in the wedge hurts nothing and `markTargets` marks none.
4. **Docs.** As above. Commit and push after each step, in the existing style.

## Accept when

1. Four villagers wander the square and the cottage, each within a few tiles of where the map put them, never into the forest.
2. They read as living villagers beside the dead at a glance: skin, clothes, no wound.
3. A left click on one within reach makes it turn, stop, and say "Hey!" over its head; a right-click offers Poke and nothing else, and Poke from across the square walks you over and does the same.
4. The dead walk past them; a swing passes through them; nothing marks them as a target.
5. The bubble sits over the head at every zoom, follows a walking figure, hides when the figure is out of sight or hidden by a tree, and vanishes after two seconds.
6. `__game.say` works on the player.
7. Nothing in the frame rate or the step time moves.
8. Michael's eye.

## What the stub must not preclude (checked against `04-npcs.md` and `05-someday.md`)

- **Click interactions:** a villager has a hit test (`villagerAt`) and an action list (one entry today); Talk, Follow me, Stay here, and Open bag are more entries in the same list.
- **Zombies noticing them:** the villager carries `hp`, `maxHp`, `dead`, `radius`, and is in `others`. When the dead target "the nearest visible living thing", the living list is `[player, ...villagers]` and `damageZombie`'s shape fits a `damageVillager`. Fleeing is one more state in the same machine. Turning reuses the zombie's death and the `former` trick (`12`).
- **Dialogue:** `say` takes any text for any seconds; the map's `line` is the first word of a script; a line scheduler keyed to the day and events replaces the constant.
- **Routines:** `home` becomes the first stop of a route with time gates; the tether is the degenerate route.
- **Records beyond the active region:** a villager is one more record kind; nothing here ticks outside `ACTIVE_TILES`.
- **Bags:** `container` and `bag` fields as on a prop; the character's grid already draws any bag.
- **Painted clothes for villagers:** a `villager` option in the layer editor beside `zombie`, read in `villagerSpec` the way `zombieSpec` reads `options.zombie`.

## Tunables

`VILLAGER_SPEED` 1.4, `WANDER_RADIUS` 4, `TALK_TIME` 2, the idle range (the zombie's 1.5 to 4 s), `HEAD_CLEARANCE` (the bars' 76 world px, plus 4 for the tail), `VILLAGER_OUTFITS` 6, the `VILLAGE` palette and `LIVING_SKINS` in `figure.js`.
