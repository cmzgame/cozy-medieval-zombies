# 01 — What the parents offer

Both parents stay as they are. This game borrows by **copying files**, never by linking, and by **considering their rulings**, never by inheriting them. New game, new gospel: nothing below is binding until it is re-made in `02-decisions.md`. A copied module keeps a header comment naming its origin file so later fixes can be compared.

Written 2026-10-08 from a full read of both repos' docs.

## From `cozy-zombie-game` (`C:\Users\micha\Dev\cozy-zombie-game`)

### Code that looks copyable

| Module | Notes |
|---|---|
| `iso.js` | Tile maths, facings, sort key. Needs a camera offset in `toScreen` / `toGrid`. |
| `loop.js`, `events.js`, `input.js`, `sprites.js`, `render-util.js`, `sfx.js` | Probably unchanged. |
| `grid.js`, `inventory.js`, `items.js` | Grid inventory with no weight. Item data changes; the rules may not. |
| `moodles.js`, `ui/moodles.js` | Registry plus HUD row. Tired would be one entry. |
| `save.js` | One slot, versioned, discard on mismatch. |
| `pathfind.js` | A\* with a `passable` callback. The grid is bigger; bound the search. |
| `placeholders.js` | Character, box, flat, post generators. The wall kind needs all four orientations and a cutaway variant. |
| `combat.js` | Screen-space wedge drawn as tested, swings resolve on the click, knockdown, finishers, shove, hit-stop. The pistol path could become the crossbow's hitscan or go. |
| `entities/player.js`, `entities/zombie.js` | Movement, stamina, hunger, thirst; zombie states, sight scaled by light, wind-up. Sight would gain a visibility test. The zombie file is also the template for villagers (`04-npcs.md`). |
| `light.js`, `clock.js` | `lightAt` as the one function, static map with shadows, ambient by room and openings; a twelve-minute day. The map becomes per chunk and the beam becomes a carried radius (ruled 2026-10-09, see `07-lighting.md`). |
| `ui/*` | Context menu, prompt, HUD, overlay, inventory panel. DOM over canvas. |

### Code that does not transfer

`world.js` (the graph), `node.js` (per-node grids), `sim.js` (records per node), `render.js` (one node, two far walls, near stubs), and everything under `data/nodes` and `data/edges.json`. See `03-world-model.md`.

### Rulings worth considering (reasons in its `docs/09-decisions.md`)

- Tiles 64×32, integer display scaling, no smoothing, never scale in `drawImage`, round draw coordinates.
- Multi-tile furniture is per-tile drawables. Solid furniture blocks walking for everyone; `blocksShots` is separate.
- Aim and melee are screen space; hitscan converts to grid once. The drawn wedge is the tested shape, the body counts and not the feet, point blank always hits, swings resolve on the click.
- Romero dead at 1.0 tiles per second, no runners, no variety. Never hit locations. Never an aim swivel.
- Light is one function. Light on the player scales how far the dead see. Night is moonlight, never black. Candles never light windows. A window glows only if the room behind it is lit.
- Fast states are bars; slow needs are moodles with the number hidden; the set stays minimal.
- The inventory is a grid and there is no weight. Small furniture is a grid item; one large piece is carried in both hands with no sprint and no fighting and no other penalty.
- Bodies are searchable containers that despawn after 48 in-game hours, off screen only.
- Death turns you, the world persists, the next survivor arrives elsewhere with a basic kit. Only New world deletes a save.
- One local autosave slot; a save that does not fit is discarded whole; each module owns `serialize()` and `restore()`.
- Right-click is the complete interface; `E` is a shortcut for the nearest simple action; out-of-range actions auto-walk.
- Placeholder art generated at boot through the real sprite interface. Never draw UI into the canvas.
- Dumb distributed dead. Nothing ever appears in view.
- Removing boards refunds every plank.
- Windows are for the dead only, inward, ground floor, glass first.

### Rulings that cannot transfer as written

Door pairs on opposite screen sides, openings on the same edge inside as out, near-edge stub walls, "nodes are not Euclidean", the 12×12 node, and "the whole node is visible at once". All of these exist to make cuts between rooms coherent. A continuous map has no cuts.

## From `medieval-zombie-survival` (`C:\Users\micha\Dev\medieval-zombie-survival`)

### Rulings worth considering (reasons in its `docs/DESIGN.md` and the decisions log in its `docs/TODO.md`)

- **Medieval, low fantasy, no guns.** Low fantasy is headroom, not decoration. Its reasons that still apply here: distance from Zomboid; no ammo or noise economy needed for combat to make sense; melee, bow, crossbow, and spear give enough variety; medieval art is the most abundant category on every store.
- **Glass windows**: a tile that is solid but not opaque. Sight through, bodies not. Weak, attackable, gone when broken. Not period-correct; "more fun" won the one place they conflicted.
- **A curtain is state on glass**: hang, open, close, take down. Closed is opaque. One toggle works the whole run of panes.
- **Boards are reinforcement**: additive hp, a plank each, opaque while present.
- **Reinforcement is spent; state is reversible.** The tell: does taking it off ever hand the item back?
- **Doors are barred from inside.** Open and close from either side if the tile is empty. Damage goes to bars first, then the door.
- **Everything is an item.** Dismantling returns the exact item; a thing the dead break returns nothing.
- **Weapon lines, not reskins.** Sword: arc. Spear: reach and a different timing. Bow: rate of fire, arrows as an item, a miss drops the arrow, a hit returns it 60 percent of the time, planks fletch arrows. Crossbow: damage and a load. The ranged hit is decided at the click by a ray; the projectile is presentation.
- **Shield in the offhand**, passive: blocks an attack from the facing side, no damage, a stagger on the attacker, one point of durability. Armour later as more slots of the same shape.
- **Sleep only when sealed and at night, interrupted by a breach.**
- **The well is infinite thirst but you have to go to it.**
- **Combat numbers are tuned, not derived.** Pressure stacks on the baseline.
- **Deaths are stated plainly.**
- **Furniture is non-solid decoration**, never a barricade. The opposite of the cozy parent.
- **Lighting is cosmetic only** and never feeds the dead's senses. The opposite of the cozy parent.
- **Infection**: a hidden 90-second clock on a 25 percent chance per touch. The cozy parent ruled infection "not now, not never".
- **Test methodology**: prefer deterministic scripts to driving the live game with big time steps.
- **A biome earns its place or it is not added**: the cost of being there, how you pay it there, what you can only get there. Reads well as "a building earns its place" for village authoring.

### What does not transfer

The enclosure flood fill as the one sight rule (isometric has real line of sight, though "sealed" may survive as a derived per-room state), digging and mining and terrain tiers, two-tall bodies and platformer physics, seeded worldgen and biomes, creative-mode prefab export (the idea of a building as a stamp is worth keeping), and the grim tone.
