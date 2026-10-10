# 10 — Milestone 4: the interface

Michael, 2026-10-10: before combat, bring back the cozy parent's interface. The grid inventory where everything is a tetris piece, right-click menus, click to move, the health bar, and whatever else there was. The parent's docs `21-grid-inventory.md`, `17-moodles.md`, and `04-gameplay.md` are the inputs; its rulings are re-decided below, per new game, new gospel. Code is copied by file with origin headers; every item, loot table, and sprite is written fresh.

## What there was, and what comes back

| Parent | Here | Notes |
|---|---|---|
| `grid.js`, pure placement rules | copied unchanged | first fit, rotation, stacks, tidy, fill |
| `inventory.js`, a bag with an equipped weapon | copied, `equipped` becomes the two hand slots from `items.js` | main and off, the torch already lives there |
| `items.js`, definitions and loot tables | copied; `data/items.json` and `data/loot.json` written fresh | |
| `ui/inventory-panel.js`, Tab, drag and drop, rotate, item menus | copied; its menu actions re-wired | cells 38 px, labels 11 px, the sizes Michael settled on |
| `ui/context-menu.js` | copied unchanged | |
| `interact.js`, actions with range, duration, auto-walk | rewritten for the chunked map, same action shape | `{ kind, label, tiles, range, duration, enabled, simple, perform }` |
| `ui/prompt.js`, label, progress bar, floating message | copied | |
| `ui/hud.js`, health, stamina, moodles, clock | copied, cut to what exists | the weapon line becomes the hands |
| `moodles.js`, `ui/moodles.js` | copied; hunger and thirst | |
| `ui/overlay.js`, start, pause, death | not yet | death that turns you is its own milestone |
| `save.js` | not yet | its own milestone |

## Rulings, re-decided for this game

- **The inventory is a grid and there is no weight.** The parent's reasons hold: "full" is a picture, this game has dozens of items, and Michael never wants weight to slow you down. The bag is 6×4 to start.
- **Right-click is the complete interface.** Everything you can do to the world is in the menu of the thing under the cursor. **E is the shortcut for the nearest simple action**, which here already means open or close a door or shutters, light or feed a fire, take or mount a torch, pick up, search. The stand-in keys fold in: `B` stays as a shortcut for boarding while planks are in the bag, `T` for the torch while one is in the bag.
- **Out-of-range actions auto-walk** to a tile within range and then happen; a walk that cannot arrive says so and does nothing.
- ~~**Left-click on the floor walks there.**~~ Built, played, and withdrawn the same day: Michael wants left click free for selecting and placing things later; Walk here in the right-click menu is plenty. Combat's click is still the next milestone's call.
- **Escape closes the top thing that can close, then pauses.** The menu first, then the bag; with nothing open it pauses the game, and again resumes. Zomboid's rule, Michael's ask (2026-10-10).
- **Hands are the two slots** already ruled: main and off. Equipping from the item menu puts the item's id in a slot; the item stays in the bag with an outline, gold for the main hand and blue for the off-hand. The torch in the off-hand is lit.
- **Containers are bags** with their own grid, opened by Search (first time, 1 s, rolls loot) or Open. A container closes when you walk away. Eating and drinking work straight from an open container, the parent's later ruling.
- **Floor items** lie on tiles as small coloured blocks, picked up by E or the menu, dropped from the panel.
- **Logs and planks become items** and stop being free. The hearth and campfire take a log from the bag; boards take a plank. To keep the loop alive before farming and the rest, two small actions: **Chop down** on a tree (timed, 3 s, drops logs on the tile; the tree is gone, as `docs/02` ruled possible) and **Split** on a log in the item menu (one log becomes two planks). A hatchet is not required yet.
- **Hunger and thirst come back as moodles**, the parent's registry: a bar is what you react to within a second, a moodle is what you plan around. Health and stamina are bars. The well on the square is infinite water (question 16's lean, now the rule): Drink at it, Fill waterskins at it.
- **Nothing is saved yet.**

## Items, written fresh

Sizes in cells; `hands` where holdable (`docs/02`, hands).

| Item | Size | Kind | Notes |
|---|---|---|---|
| Torch | 1×2 | tool, off-hand | lit in the off-hand; never burns out |
| Log | 2×3 | material | feeds a fire; splits into 3 planks. Six cells of log make nine cells of planks, so logs store denser, the opposite of Zomboid's back-breaking logs (Michael, 2026-10-10) |
| Plank | 1×3 | material | one board |
| Hatchet | 1×2 | tool, main hand | not needed yet; the first main-hand item |
| Bread | 1×1 | food | hunger 40 |
| Apple | 1×1 | food, stacks to 5 | hunger 15, thirst 5 |
| Cheese | 1×1 | food | hunger 30 |
| Waterskin | 1×2 | drink, capacity 100 | fills at the well, blue level in the block |

Starter kit: torch, waterskin (full), bread, two apples, one plank.

| Container | Grid | Loot |
|---|---|---|
| Chest | 4×3 | bread, cheese, planks, a log, a hatchet rarely |
| Barrel | 2×3 | apples, a waterskin, a log |
| Body | 3×3 | with combat |

## Build order

1. Copy `grid.js`, `inventory.js`, `items.js`, the menu, the panel, the prompt, the HUD, the moodles; the CSS blocks they need; item and loot data; floor items on tiles and their drawing; the player's bag with the starter kit and hands wired to it.
2. `interact.js` rewritten on the action shape: items, containers, openings, fires, torches, trees, the well, Walk here. Right-click menus, E for the nearest simple action, auto-walk, click to move. Timed actions with the progress bar.
3. Hunger and thirst on the player, eating and drinking, the moodle row, the health bar.
4. Acceptance.

## Accept when

1. Tab opens the bag with the starter kit laid out without overlap; drag, rotate, tidy, and drop to the floor work; picking the dropped thing back up works.
2. Right-click the chest in the cottage: Search, a 1 s bar, loot laid out beside the bag; drag it over; walk away and the chest closes.
3. Right-click the hearth from across the room: Add a log auto-walks you there and takes a log from the bag; with no logs the entry is disabled and says so.
4. Right-click a tree: Chop down, 3 s, logs on the ground; Split a log in the bag into two planks; Board the window takes a plank, with `B` as the shortcut.
5. Left-click on the floor walks there around obstacles; any key cancels it.
6. The torch equips from its menu into the off-hand and lights; `T` toggles it; the bracket's Take and Mount go through the menu too.
7. Eat bread from the bag and from an open chest; drink from the waterskin; fill it at the well; the hunger and thirst moodles appear and clear at the parent's stages.
8. The HUD shows health, stamina, the moodle row, the hands, and the clock, and nothing is drawn into the canvas.
9. 60 fps with the panel open.

## Tunables

Bag 6×4; search 1 s; board 2 s; pull 1.5 s; chop 3 s; hunger and thirst drain as the parent's (`11-hunger-and-night.md`, `20-thirst.md`), to be retuned with farming.

## Screens (2026-10-10, night)

The world fills the window at an integer pixel scale and the interface scales on its own, like a web page (`src/view.js`; docs/02, the view). On top of that, four screens, all DOM in `src/ui/screens.js`:

- **Title**, at boot, over the drawn village: Play, Settings, Controls.
- **Pause**, on Escape with nothing else open: Resume, Settings, Controls, Title screen.
- **Settings** (`src/settings.js`, kept in the browser): interface size (auto or 1× to 3×), world pixel scale (auto, the largest that fits, or a fixed 1× to 3×), zombie aggro (off by default while the game is a workbench: the dead wander and ignore you), the debug corner. Defaults button. More as Michael asks.
- **Controls**: the key list.
- **Dead**, when the player's health reaches zero: the day and hour, and one button back to the title, which reloads the page.
- The pause menu also carries a disabled **Save game**, a placeholder for the save milestone.

Later the same night: double-click uses a thing (equip, wear, draw, unequip, take off; else across), and Z or the wheel snaps the zoom between wide, middle, and close (1.1×, 1.8×, 2.7×), kept in the world-scale setting (docs/02). The belt takes consumables as well as hand items; its key eats or drinks one. A lit torch on the belt glows at half and is not drawn.

Any screen up means the game is paused. Escape steps back: settings or controls to the screen that opened them, pause to the game; the title stays until Play. The Escape chain is therefore: menu, then a screen, then the bag or character screen, then pause.
