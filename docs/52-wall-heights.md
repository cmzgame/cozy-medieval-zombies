# 52 — Walls 96 px tall: the storey, the door, and the window in crates

**Status, 2026-10-26: a spec, not built; ruled by Michael in session (`02`, 2026-10-26, Walls 96 px tall).** Written from `origin/main` at ece297c1. One build step, one issue, which lands together with the regenerated wall art (`art/12`). A **default** is the spec's own (written by a Secondary), Michael's to overrule; the rest is his ruling. Read `09` and `art/05` first.

## 1. Why, in Michael's words

Michael, 2026-10-26: "I just really like the predictability of height in Zomboid." There a one-tile storage box is the measuring stick: three stack from the floor to the ceiling. Here a one-tile cube is 32 px tall (a tile is 32 world units a side, a unit a pixel of height, `art/01`), and the walls are 80 px: two and a half crates, so nothing stacks to the top. The 80 was chosen on 2026-10-11 by eye against a 96 that looked too tall because its door had scaled with the wall ("comically large", `02`); the door and window were then frozen at their 64-px-wall sizes, so the wall was tuned and the openings never were. Shown the fair comparison (an 80 wall and a 96 wall side by side with the same 48 px door, a crate at each, the player between), Michael ruled 96, a door two crates tall, and windows deliberately big: "you get a LOT from having bigger windows, you can see more, it makes shooting easier"; and "all walls will conform to this, no more weird tall castle walls."

## 2. The heights, in halves of a crate (16 px, one step of screen depth)

Measured from the floor at the wall's foot. **Ruled:** the wall, the door, the window's top, every wall the same. **Defaults:** the sill and the bracket.

- **Wall: 96** (6 halves, 3 crates). The storey; `49` lifts an upper floor by it.
- **Door top: 64** (4 halves, 2 crates). The player is 48 px to the crown and about 55 with hair (`art/11`), so a door clears the hair by 9 px. Zomboid's doors are shorter against its people; this is a touch generous, as the cartoon wants.
- **Window top: 64**, the door's line, as Zomboid's are.
- **Window sill: 24** (*default*; Michael: the window need not sit on a crate). 40 px of glass, from the player's waist to above their head: the exaggerated window, for sight and for shooting. The alternative 32 (one crate under the window exactly) sits at the figure's shoulder and shows less; 24 is the pick unless Michael says 32 or 20.
- **Torch bracket: 48** (3 halves, from 32; *default*), riding higher on the taller wall, under the window's top.
- **Fences: 36, unchanged.** A fence is not a wall's height and keeps its own art (`art/11`, `wall_fence`). The gate and boards on a fence too.
- **Wall thickness unchanged:** stone 16, wood 14, log 18 (`02`, Wall thickness per material).
- **The drawn furniture keeps its sizes** (rounds 4 and 5): the tallest, the shelf and the cupboard, are about a figure and a quarter, about 60% of a 96 wall, a cupboard against a ceiling; nothing is scaled (`art/12`).

**Every wall material conforms:** oak, spruce, mahogany, Winter Pine, Bloodbark, daub, log, stone, and the castle's future ashlar. The castle plan's taller materials (`29-world/03`, 112 px curtain walls and 128 px towers) are withdrawn: a castle is taller by storeys (`49`), not by walls. Its arrow slit stays an art variant of the window, at the window's opening (section 4 has the one question it raises).

## 3. What the player gets

- **Three crates to the ceiling,** a door two crates tall, a window from waist to overhead.
- **More to see through a window:** the sight wedge through an open window is by the opening's width (`03`, `09`), unchanged, but the taller opening matters for what `49` builds (a ray with heights from an upstairs window, and the lean-out rule) and for an arrow: the band a shot passes through an open window is 24 to 64 px instead of 22 to 51.
- **Shooting:** the bow's and the throws' launch heights (`z0` 30, the fireball's 26, `data/combat.json`, `data/items.json`) clear a 24 sill as they clear 22 today; nothing to retune. A 32 sill would have stopped the fireball at the wall; that is the reason for 24.
- **Rooms feel like rooms:** the player is half the wall's height, Zomboid's proportion.

## 4. Choices still Michael's (defaults stand if he says nothing)

1. **The sill:** 24 (the pick), 32 (a crate fits under it), or 20 (more glass still).
2. **The bracket:** 48, or keep 32.
3. **The arrow slit on castle walls** (`29-world/03`): the same 24 to 64 opening behind a slit's art, or a slit of its own band (a narrow 32 to 64, *default* when the castle comes).
4. **Posts:** the corner posts follow the wall to 96 (*default*); their caps are the generator's.

## 5. What changes in the game (one build, with the art)

- **Data:** `height: 96` in every `wall` block of `data/sprites/wall_*.json` for the eight wall materials (not `wall_fence`, `wall_boards`, `wall_boards_gate`); the regenerated images and anchors from `art/12` dropped in by `27`'s checklist.
- **Constants** (`src/placeholders.js`): `DOOR_TOP` 48 to 64, `WINDOW_SILL` 22 to 24, `WINDOW_TOP` 51 to 64, `BRACKET_UP` 32 to 48. These feed the dev walls' openings (`generateWall`), the swung leaves and shutters (`render/walls.js`), the open-door click tests, and the flight through an opening (`archery.wallStops`).
- **The wall's height where code reads it:** `archery.tunables.wallHeight` 80 to 96 (set from `data/combat.json`'s `bow` block, which gains `"wallHeight": 96`); `interact.js` `WALL_FACE` 80 to 96 (the door and window faces under the cursor); `render/walls.js`'s fallback 72 to 96; `render/scene.js` `climb` 70 to 84 (a pool climbs seven eighths of the wall, as 56 of 64 and 70 of 80 were).
- **Light:** `light.js` reads no wall height (portals are by openings), so nothing changes; the taller window is a wider portal only in `49`'s sense.
- **The openings under the cursor:** `interact.openingsAtScreen`'s box round an edge's midpoint (±26 px) is re-read for a 64 px door; widen it to the door's height if a click near the lintel misses.
- **The dev walls** (`generateWall`, used for materials with no drawn art and for the proving ground's dev sheets) take the new constants automatically.
- **The map:** nothing. Walls are edges; a taller wall covers more of the room behind it, which the near-wall fade already handles.
- **The chart, the save, the wire, the sync check:** nothing. Heights are data every client loads.

## 6. The proof

- `check("windows")`, `check("build")`, `check("arrows")`, `check("light")`, `check("sheets")` (a new reference), `check("frame")` (a new reference), and `check("woods")` (the leaf woods against the delivered files, which it reads; it re-reads the new ones).
- A row added to `check("build")`: three dev crates (`crate`, a one-tile box 32 px tall, a dev sprite kept for this) stacked by picture against a wall reach the cap exactly; the door's top sits 16 px over the player's crown; the window's glass runs from 24 to 64.
- In the pane, by eye, Michael's: the cottage from outside, the square, a torch bracket at night, an arrow through an open window from eight tiles.
- `node tools/check.js`, `node tools/world.js` (the hash is unchanged: heights are not in the sim), the validator, `savecache`.

## 7. Docs and the wiki

`09` (openings; a reference) and `art/05` (the walls as delivered; a reference) are rewritten in place for the new numbers; `29-world/03`'s items 1 and the towers' 128 are struck; `02` has the ruling; `art/01`'s "walls are 80 px tall" line and `art/11`'s become 96. **The wiki:** a player sees taller rooms, doors, and windows; the building and the walls pages say the heights in crates. `needs-wiki`.

## 8. The guest's side

Nothing: data and drawing. A guest loads the same sprites and constants.
