# 19 — Characters: one model for the player, the dead, and villagers (and villagers v0.1 on it)

**Scoped for implementation by another model** (planned with Michael on 2026-10-12; nothing built yet). Read `CLAUDE.md`, "Implementing from a spec", then this whole doc, then the files it names. "Default" marks what Michael may overrule, not what the implementer may.

## Status

**Step 1 built and verified (2026-10-12), paused for Michael: the dead look as they did, and they are wearing items now.** `src/entities/character.js` holds `createCharacter(kind, ...)`, the shared fields, and `wardrobeInto` / `dress`; `createPlayer` and `createZombie` spread it and add their own (nothing that reads them changed). `figure.js` gained `characterInputs(ch)` (a character's drawing as plain data: the variant from the kind, the look, each worn entry's garment art **dyed** by the entry's `colour` or `colours`, what is in the hands, the wardrobe index, the wound) and `characterSpec(inputs)` (the spec the drawing takes: the player's path as `playerSpec` made it, the dead's including the painted pool picked by wardrobe index); `playerSpec` and `zombieSpec(k)` stay as thin wrappers for the editors and the placeholder sheet. `data/wardrobes.json` holds the ten zombie wardrobes, **generated from the old outfit rules** so the look is exact, plus an empty `village` list for step 3; `assets.sheetFor(inputs)` bakes a sheet the first time an outfit is seen and returns `figure_<n>` (the dead share ten of them among 67 bodies; a recoloured tunic costs one more); `assets.rebakeFigures()` rebakes them all in place when the painted layers reload; a console warning past 24 sheets. **Checks:** each of the ten wardrobes' sheets is pixel-identical (a hash of every pixel) to the old `zombie_k` sheet; the player's sheet is pixel-identical to the pre-change code's from the same state (the old `figure.js` loaded beside the new one); sheets in use: ten for the dead plus the player's, eleven as before; all 67 dead have `worn`, `pockets`, `look`, `wound`, and a shared sheet; a dyed tunic gets its own sheet and a sibling keeps its own; the fall and the hurt flash still play from a shared sheet; a step costs 1.2 ms with 67 of the dead; ground check 8 of 9 (check 1, the known flake on the dead walking in the wild). **What the build decided:** a `cap` item (the dead's caps were a shape with no item behind them); the dead's pockets roll from the **existing `body` table** in `data/loot.json` (it was in the file, unused, with the same food-and-sticks mix as the new table drafted below), so no `zombie` table is added; **no sacks in the first wardrobes**, so the look is exactly as before (a sack on a back is a visible change; Michael adds `small_sack` to a wardrobe when he wants some); the player gained `id: "player"`; the player keeps its own sheet (`"player"`, rebuilt in place) rather than a shared one. Not built yet: speech, villagers, the corpse (steps 2 to 4).

Scoped 2026-10-12, first as a villager stub (figures that wander and say "Hey!" when poked), then **revised the same day at Michael's call into one character model** for the player, the dead, and villagers, with the villager stub as the first thing built on it. Waiting on Michael's approval of the defaults.

## Why one model

Michael (2026-10-12): the three kinds of people in the game should share one code shape, because each can, in principle, (1) say a line in a speech bubble, (2) wear items that decide what their figure wears, lootable from the body on death, (3) take a left click and a right-click menu, and (4) hold an inventory, as the modern parent's dead did ("E: loot" on a corpse like a chest). Not every kind uses every feature: the player never speaks and is never looted; a living zombie offers no menu; a villager's inventory exists but is not shown. **Unifying the code is what makes the next feature cheap**, and the villager stub is the first proof.

## What is shared already, and what is not

Shared today, no work needed:

- **The body in the world.** Player and zombie carry the same fields the renderer, the sorter, and the occluder read (`kind, sprite, gx, gy, layer, facing, speed, radius, hp, maxHp, dead, anim`; `hands` and `carrying` optional). `render.js` `entityDrawables` draws any of them; `besideWalls` sorts them; `computeOcclusion` sets `behindProp` on all and cuts the hole for the player alone.
- **The rig.** One figure (`figure.js`) draws everyone; the player's sheet is baked from real worn items (`playerSpec(look, worn, artOf, hands, ...)`, cached by `specKey` in `main.js` `refreshFigure`).
- **Inventory.** `inventory.js` reads the bag from `worn.back` and the belt from `worn.waist`; its functions take "player" but only touch `.worn` and `.hands`. Items carry `wear` slots and `art` (`{ shape, colours }`), and `addItem(bag, id, count, props)` puts arbitrary `props` on an entry.
- **Containers.** A prop with `container` gets `Search`/`Open` (`interact.js` `containerActions`), a bag rolled from a loot table on first search, and the panel beside the player's bag (`containerOpened`).

The seams:

1. **The dead are dressed by a generator** (`zombieSpec(k)`: ten outfits of generated garments from a drab palette, plus painted layers flagged `zombie`), not by items, so nothing on a zombie can be taken, and a turned villager could not keep its clothes.
2. **A corpse is not a container.** A dead zombie's fall holds and it "thinks no more" (`damageZombie`); nothing opens it.
3. **No speech.**
4. **No click hit test on a character.** Right-click finds props, items, openings, brackets; a zombie under the cursor offers nothing. The swing finds the dead by its wedge, not by the click.
5. **Zombies have no `worn` and no `hands`**; the player's `createPlayer` and the zombie's `createZombie` repeat the shared fields by hand.

## The model: `src/entities/character.js`

`createCharacter(kind, gx, gy, { id, name, look, speed, radius, hp })` returns the shared shape, and each kind's creator adds its own:

```
kind: "player" | "zombie" | "villager"
id, name                      // name null for the player and the dead ("the dead" in text)
sprite                        // set by dress(); a sheet id shared by everyone in the same clothes
gx, gy, layer, facing, speed, radius
hp, maxHp, dead
anim                          // createAnimation("idle")
look                          // { skin, hair, hairStyle, eyes, under }, from figure.DEFAULT_LOOK
worn                          // createWorn(): head, chest, hands, legs, feet, waist, back
hands                         // createHands(): main, off
pockets                       // a small grid of their own, null for the player (section 4)
carrying: null
line: null                    // { text, until } while a bubble shows
loot: null                    // the corpse's grid, built on first search (see 4)
searched: false
behindProp: false
```

- **Player** adds what it has now: `aim, stamina, maxStamina, sprinting, winded, moving, climb, hunger, thirst, auto, action`.
- **Zombie** adds its states and combat fields as now (`state, aggro, lastSeen, seesNow, searchTimer, path, repathTimer, sightTimer, lastGoal, idleTimer, attackCooldown, attackHit, pathFailed, breach, climb, sincePlayer, stuckTime, hits, stagger, knock, downTimer, upTimer, gettingUp`) and `groanTimer`.
- **Villager** adds `home, state (idle | wander | talk), path, repathTimer, idleTimer, stuckTime, pathFailed, lastGoal, talkTimer, pokedAt, say`.

`createPlayer` and `createZombie` keep their names and signatures and call `createCharacter` first; nothing that reads them changes. `main.js` keeps its three lists (`player`, `zombies`, `villagers`) and gains `characters()` = `[player, ...zombies, ...villagers]` for the systems that take everyone (speech, the hit test, `others`).

**Parity is the point** (Michael, 2026-10-12): the dead and villagers have exactly the player's model, a doll with items slotted in plus an inventory, so their clothes can be taken but not their things, or the other way, or some of both. The one difference is pockets: the player's grid is the bag on their back and their hotbar is the belt (`11`, ruled), while **the dead and villagers carry a small grid of their own, `pockets`, with no bag or belt needed for it**, because a dead thing with a sack on every back would look wrong. A worn sack or belt adds its grid or slots on top, for anyone.

## The four systems

### 1. Dress: `worn` decides the figure, and the sheet is shared by outfit

- `figure.characterSpec(ch, artOf, overrides, style)` replaces `playerSpec` and `zombieSpec`: `variant` from the kind (`"zombie"` for the dead: their skin list, the wound, the shamble poses; `"player"` for the living), `look` from the character, `outfit` from `worn` through each item's `art`, `holding` from `hands`, `painted` as `playerSpec` does today (a worn item's `art.painted`, the painted hair style, the body layer). **A painted layer flagged `zombie` still joins the dead** the way `zombieSpec` picks them: deterministic by the character's wardrobe index, kept in `look.wardrobe`.
- **The dyed entry.** An item entry may carry `colour` (a hex string in its `props`); `characterSpec` uses it in place of `art.colours[0]`. This is how ten zombie wardrobes built from one tunic item still show ten tunics, and it is the dye system the player gets for free later. Default; Michael may prefer coloured item variants instead (`tunic_rust`, `tunic_moss`), which costs items and gains nothing.
- **`assets.sheetFor(spec, only = null)`**: a cache keyed by `specKey(spec)` and `only`; the first character in a given outfit bakes the sheet and registers it as `figure_<n>`, every later one shares it; `ch.sprite` is that id. `dress(ch)` recomputes the key and sprite whenever `worn`, `hands`, or `look` change (the player on every change, as `refreshFigure` does now; the dead and villagers at creation and when looted or turned). On a painted-layer reload every cached sheet rebakes in place (`gl.redrawSheet`), as the ten zombie sheets do now.
- **The atlas is the budget.** A figure sheet is 22 frames × 48 px wide by 8 facings × 72 px tall (about 1056 × 576 px); the atlas is 4096² at best, shared with every drawn tree and wall. Today there are eleven figure sheets (the player and ten zombie outfits). **Distinct outfits among the living must stay bounded**: the dead dress from **ten wardrobes** (as many as today), villagers from **a handful**; a villager given a hood later is one more key, and there are few villagers.
- **A corpse is one frame, so stripping it is cheap.** A dead character holds the last frame of its fall in the facing it died in; it needs no sheet of 176 frames. On death, `dress` bakes a **corpse sheet** (`generateFigure(spec, { only: { anim: "die", frame: last, facing } })`, one frame, 48 × 72 px, two hundred times smaller) and the corpse's `sprite` points at it; **every time something is taken from the body, the corpse sheet rebakes** and the body shows what it has left, down to the undies, the naked goober the player becomes when stripped (Michael, 2026-10-12: parity). Corpse sheets are keyed and cached like the others and are small enough that bodies piling up over a game cost nothing the atlas notices; they are evicted when the body is gone. The generator's `only` option skips the other animations and facings; the renderer needs nothing new, since it asks the sheet for `die_<facing>_<n>` and the corpse's `anim` holds there. An unbounded case, the player dyeing clothes at will, is capped by the same cache: a sheet is evicted when no living character wears its key, and the atlas's shelf allocator gains a free list for figure-sized slots. If the implementer finds `place()` cannot reuse a slot, say so and stop; a hard cap of 24 figure sheets with a console warning is the fallback.
- **Wardrobes are data**: `data/wardrobes.json` (built: `look`, `wound`, `worn`, `pockets`, `loot` per wardrobe), `{ "zombie": [ { "worn": { "chest": { "item": "tunic", "colour": "#5a4a3a" }, "legs": ..., "feet": ..., "head": ..., "waist": ... }, "hands": {}, "pockets": [3, 2], "loot": "zombie" } × 10 ], "village": [ ... × 4 to 6 ] }`. A zombie's wardrobe is `k = index`-deterministic as today (`look.wardrobe`); the dead's palette stays drab and the village's warm (ochre, rust, moss, slate, undyed linen) so the two read apart at a glance. The dead wear what they died in, and what they had is in their **pockets**: a grid of the wardrobe's size, filled on first search from the wardrobe's loot table (the existing `"body"` table in `data/loot.json`: a bit of food, a stick, a waterskin, "nothing" weighted heavy). One or two of the ten also wear a `small_sack`, which adds its own grid. A villager's pockets are empty until `04` gives them things. **Michael edits the wardrobes; the implementer writes the first set to match today's ten outfits** (same garments, same drab colours, hood or cap on the same indices).
- **The turned keep their clothes** (`04`, open point 4, closed): when a villager dies and turns (not built here), the zombie made from it takes its `worn`, `hands`, and `look`, and `dress` gives it the dead's variant on its own clothes.

### 2. Speech: `src/ui/speech.js`

- `say(ch, text, seconds = 2)`: `ch.line = { text, until }`; a new line replaces the old.
- `updateSpeech(characters, visible, player)`: a pooled `.speech` element per character with a live line, placed each step at `view.toUi(iso.toScreen(gx, gy) - HEAD_CLEARANCE - 4)` (76 world px clears the head at any zoom, as `ui/zombie-bars.js` found); hidden when the character's tile is not in `visible` or it is `behindProp` farther than 3.5 tiles (the bars' rule); the player's own bubble always shows. CSS `.speech`: `#message`'s colours and border, 4px radius, `padding: 3px 8px`, 12px type, `white-space: nowrap`, `pointer-events: none`, a 5px `::after` tail under the box in the border colour.
- **The dead groan.** `zombie.js`: `GROAN_TEXT = "Braaains"`, `GROAN_MIN = 20`, `GROAN_MAX = 60` seconds; each zombie's `groanTimer` counts down while it updates (so only within `ACTIVE_TILES`) and on zero says the line and rerolls. A corpse never groans. Michael asked for it as the proof that the dead can speak; the text and the rate are his to change, and a dead zombie's bubble, like its bar, hides when it is out of sight.
- **The player has no lines** and `window.__game.say(text)` says one over them, to test the system before anyone else exists.

### 3. Clicks: `characterAt`, and actions by kind and state

- `interact.characterAt(sx, sy)`: the character (not the player) whose sprite rect (`x - anchor[0], y - anchor[1], FW × FH`) contains the point, nearest the camera on a tie. A rect test, not a pixel test: figures are small and move. `interact.setCharacters(fn)` at boot gives it `main.js`'s `characters()`.
- `characterActions(ch, player)`, pushed by `actionsAt` before the walk fallback when `characterAt` finds one, and no "Walk here" then:
  - **villager:** one action, `Poke <name>` (`kind: "poke"`, `tiles` the tile they stand on when clicked, `range: CLICK_REACH`, `perform` pokes).
  - **zombie, dead:** `Loot body` (section 4).
  - **zombie, living:** nothing; the menu does not open on a living zombie (a right-click there is the floor's actions as now).
  - **player:** never under this test.
- **The left click** (`main.js`): after `pokeAt` and `playAt`, `interact.clickCharacterAt(x, y, player)`: a villager within `CLICK_REACH` is poked (section on villagers); a zombie, living or dead, nothing (the swing that follows is the left click on the dead, as now). A click on a villager still swings; the swing passes through them. Default; Michael may want the swing held when the click lands on a person.
- A right-click on a villager does not poke on the click itself (props sway on a right-click; a villager answers to the left click or the menu).

### 4. Inventory and loot: everyone has a bag; only a corpse opens

- `bagOf(ch)` and `beltOf(ch)` already work on anything with `worn`. The player's bag, belt, and hands are unchanged.
- **The corpse is a container, and its grid is a view of the body.** `lootOf(ch)`: on first search, the pockets are rolled from the wardrobe's loot table, and a grid (`createBag(6, 4, "body")`) is laid out from whatever the body has: the items in `hands`, every worn garment, the pockets' items, and the bag item on its back **as a bag with its contents**. Taking an item from the grid is the ordinary panel, and **it comes off the body**: a garment leaves `worn` (and the corpse redraws without it, section 1), a weapon leaves `hands`, a thing leaves `pockets`, the sack leaves the back with everything in it. Searching takes `SEARCH_TIME` as a chest does. The character screen's doll is never shown for anyone but the player; the grid is the body's doll for now.
- **`Loot body`** is the action on a dead zombie: `kind: "container"`, `simple: true` so the E prompt offers it as it offers a chest, label `Search body` then `Open body`, `tiles` the body's tile, `perform` opens `lootOf` through `containerOpened` like a chest. The modern parent's "E: loot".
- **Never yourself; villagers not yet.** The player is never under the hit test. `lootOf` works on a villager (it is the same function) but `characterActions` offers it to no living thing and to no dead villager either, until `04`'s killable step decides what a villager's death leaves. Default.
- **Zombie bars** stay zombie-only (they read `hp` and that stays the dead's business); the swing-target outline likewise.

## Villagers v0.1, on the model

As the first scope said, now on the base above:

- **Own module, `src/entities/villager.js`**, three states (`idle`, `wander`, `talk`) using the zombie's walking helpers **exported from `zombie.js` unchanged** (`pickTargetAround, repath, followPath, separate, faceToward, roomOf`, and `WANDER_IDLE_MIN/MAX`); not copied, and not a flag on the zombie, whose file is the chase, the breach, the climb, and the bite.
- **Tethered wander:** idle 1.5 to 4 s, then a walkable tile within `WANDER_RADIUS` (4) of `home` (the map tile) in their own room; `VILLAGER_SPEED` 1.4 tiles/s.
- **Poke:** within `CLICK_REACH` (2.6 tiles), `POKE_COOLDOWN_MS` (600) through `pokedAt`: the path drops, they face the player, `state = "talk"` for `TALK_TIME` (2 s) with the idle animation, and `say(v, v.say)`, where `say` is the map entry's `line` or `"Hey!"`.
- **The dead ignore them** in v0.1: `updateZombie` still takes the player alone; villagers are in `others` for body separation only. **Swings pass through them** (`04`, open point 3, closed): `tryAttack`, `tryShove`, `markTargets` keep taking the zombie list.
- **Dressed from the village wardrobes**, living skin from a small `LIVING_SKINS` list, hair style from `hairStyles()` (so Michael's painted hair appears on villagers), no wound.
- **The map:** `"villagers": [{ "tile", "name", "wardrobe"?, "line"? }]` at the top level of `data/maps/square.json`; `loadMap` returns them untouched. Four in the square: three on the cobbles (`[14, 13]` Wren, `[17, 16]` Ash, `[13, 19]` Tam with a line, "Keep the shutters closed."), one in the cottage (`[16, 6]` Rook). Names are neutral goobers' names and Michael's to change. Wild chunks never make one.
- `main.js`: `villagers` created at boot after the dead; updated inside the `ACTIVE_TILES` gate after them; in `others`, in `renderScene`'s entities, in the debug corner (`villagers N`), and on `window.__game`.

## Build order, with a pause after each step

1. **The base, and dress from items.** `character.js`; `createPlayer` and `createZombie` on it; `characterSpec`, the dyed entry, `sheetFor` and its cache, `data/wardrobes.json` with ten zombie wardrobes matching today's outfits, the `zombie` loot table; the dead dressed at creation; the painted-layer reload rebaking the cache. **Verify (script):** the player's sheet key and drawing are unchanged by a reload; every zombie has `worn` and a `sprite` from the cache; the number of figure sheets after boot is 11; two zombies with the same wardrobe share a sheet; a zombie's garments draw as before (Michael's eye: the dead look as varied as yesterday); the step and the frame cost are unchanged. *Pause: Michael looks at the dead.*
2. **Speech.** `speech.js`, the CSS, `__game.say`, the groan. **Verify:** `__game.say("Hey!")` puts a bubble over the player's head at wide, middle, and close zoom with the tail within a few UI px of the head; it follows a walking player and is gone after two seconds; a second `say` replaces the first; stepping 90 s with the dead in view shows at least one "Braaains" and none from a corpse or from the dead out of sight.
3. **Villagers.** `villager.js`, the zombie's helpers exported, the village wardrobes and skins, the map entries, the step and the renderer, `characterAt`, `clickCharacterAt`, the menu's Poke, the talk state. **Verify (script):** four villagers with distinct sprites; 60 s of stepping keeps each within `WANDER_RADIUS` of home and in its starting room; a zombie teleported beside one stays idle or wandering for 10 s and the villager's `hp` is unchanged; a villager behind a tree gets `behindProp` and no hole; a left click on one within reach makes it face the player, stop, and show its line, then idle and wander again; a click from across the map pokes nothing; a second click inside 600 ms does not restart the line; `actionsAt` on a villager returns one action, `Poke <name>`; `runAction` on it from six tiles walks the player over and the bubble shows; `tryAttack` with a villager alone in the wedge hurts nothing and `markTargets` marks none. *Pause: Michael looks at them.*
4. **The corpse.** The one-frame corpse sheet on death, `lootOf`, `Loot body`, the E prompt on a corpse. **Verify (script):** kill a zombie (`__game.give` a sword, `damageZombie`); its `sprite` is now a corpse sheet of one frame and the figure sheet count is unchanged; `nearestSimpleAction` beside the body is `Search body`; performing it opens a grid holding its tunic, boots, and pockets' loot (and a sack where it wears one); taking the tunic removes it from the body's `worn` and the body redraws bare-chested the same step; taking everything leaves the goober in undies; ten corpses stripped add ten tiny sheets and no frame cost; a living zombie and a villager offer no loot action; the player's own tile offers none.
5. **Docs.** `02` (the rulings below under the date), `04` (Status), `11` (the bag on every character; the corpse as a container), `12` (`characterSpec`, the sheet cache, wardrobes), `14` (the corpse), `TODO.md`, `CLAUDE.md` (the code map: `character.js`, `villager.js`, `speech.js`; `19` in the index). Commit and push after each step, in the existing style.

## Accept when

1. The dead look as they did, and they are wearing items: a dead one opens like a chest and gives up its clothes, its pockets, and its sack, and shows what it has left, down to the undies.
2. The player's bag, belt, hands, doll, and figure are unchanged in play.
3. Four villagers wander the square and the cottage, within a few tiles of where the map put them, never into the forest; they read as living villagers beside the dead at a glance.
4. A left click on a villager within reach makes it turn, stop, and say its line; right-click offers Poke and nothing else, and Poke from across the square walks you over and does the same.
5. The dead walk past villagers; a swing passes through them; nothing marks them as a target.
6. Bubbles sit over the head at every zoom, follow a walking figure, hide when it is out of sight or behind a tree, and vanish after two seconds; the dead groan now and then.
7. The figure sheet count after boot is eleven plus the village wardrobes; nothing in the frame rate or the step time moves.
8. Michael's eye.

## What this does not preclude (checked against `04-npcs.md` and `05-someday.md`)

- **Killable villagers that flee and turn:** `hp`, `maxHp`, `dead`, `radius`, `worn`, `look` are on every character; fleeing is a state in `villager.js`; turning builds a zombie from the villager's own clothes (section 1); the dead's target list becomes `[player, ...villagers]`.
- **Talk, Follow me, Stay here, Open bag:** more entries in `characterActions` for the villager kind.
- **Lines and routines:** `say` takes any text; the map's `line` is the first word of a script; `home` is the first stop of a route.
- **Records beyond the active region:** one more record kind; nothing here ticks outside `ACTIVE_TILES`.
- **Dyeing and tailoring for the player:** the dyed entry already exists; the sheet cache already bounds it.
- **Painted clothes for villagers:** a `villager` flag in the layer editor beside `zombie`, read by `characterSpec` the way the `zombie` flag is.

## Rulings this scope makes (defaults; logged in `02` when built)

1. One character model, three kinds, each kind's creator adding its own fields; the three lists stay.
2. Everyone is dressed from items; the dyed entry carries colour; wardrobes are data; sheets are shared by outfit key and bounded by the atlas.
3. Everyone has the player's model, a doll plus an inventory; the dead and villagers carry pockets instead of needing a bag. A corpse opens like a chest, is one baked frame, and redraws as it is stripped; the player is never lootable; a dead villager's loot is built but not offered until `04`'s killable step.
4. The dead groan "Braaains" now and then; the player never speaks; speech is one system for any character.
5. A living zombie offers no menu; a villager offers Poke; the swing passes through the living.
6. Villagers wander on a 4-tile tether in their room; poke within click reach with the wiggle's cooldown; four in the square.
7. The turned keep their clothes (`04`, point 4); the player cannot hurt a villager (`04`, point 3).

## Tunables

`VILLAGER_SPEED` 1.4, `WANDER_RADIUS` 4, `TALK_TIME` 2, the idle range (1.5 to 4 s), `HEAD_CLEARANCE` 76 (+4 for the tail), `GROAN_TEXT`, `GROAN_MIN` 20, `GROAN_MAX` 60, the wardrobes and the `body` loot table (data), `LIVING_SKINS`, the pockets' size per wardrobe, the figure sheet cap (24) and its warning.
