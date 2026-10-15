# Bugs found by the wiki census

**Where these come from:** the **wiki-writing agent**, not a coding agent. They were found while building the wiki (`docs/37`, the repository `michaeldippold/cmz-wiki`): a census that read the whole game, code first and docs second, at game commit **`9205ad7`** (2026-10-14), then traced every claim on every wiki page back to the code. **Nothing here was played in the game**: each item was read in the code, and the ones marked *needs repro* were inferred and should be tried before they are fixed. Line numbers are as of `9205ad7` and may have moved.

**For the coding agents and the technical lead:** this is a work list, not a ruling. Before fixing an item, confirm it on current `main` (and in the pane where it is behaviour). When an item is fixed, move it to **Fixed** at the bottom with the commit; when it is judged intended or not worth fixing, move it to **Closed** with a word why. A fix is built for a guest as every change is (`CLAUDE.md`, the multiplayer rule), and the wiki is updated for it.

**How the list grows:** each time the wiki is synced with the game, new findings are added here by the wiki agent, marked with the commit they were read at. The wiki agent never edits an item a coding agent has moved or annotated.

**Not here:** the places where the game's docs disagree with its code (mostly stale docs, for Michael to rule on): `census/discrepancies.md` in the wiki repository, [on GitHub](https://github.com/michaeldippold/cmz-wiki/blob/main/census/discrepancies.md).

## Open: likely bugs

- [ ] **Switching Open to friends off does not make the guests dormant.** `setOpen` calls `net.close()`, which clears the guests without `dormantNow` (`src/net.js:149-180`); only Leave world does (`src/main.js:336`). The guests' characters stay standing in the world and are saved as active players.
- [ ] **Every wheelbarrow rolls the dev kit.** Searching any wheelbarrow, the joiner's or one crafted from planks and an iron bar, gives the whole developer kit, two Developer Bags included (the wheelbarrow's container uses the `dev_kit` loot table).
- [ ] **A crafted chest or shelf rolls chest loot** on its first search: four planks make a chest that may hold weapons, bread, planks, and logs. A crafted container should start empty.
- [ ] **The forge, anvil, cooking, and oven recipes cannot be made in play.** Nothing in the valley gives potato, cabbage, garlic, grain, flour, iron ore, iron bars, or charcoal; only the console or the dev chest (which holds no charcoal) do. (Possibly expected until farming, mining, and charcoal arrive, but then the stations are unusable meanwhile.)
- [ ] **The dead hunt villagers with Zombie aggro off.** With "Zombies attack villagers" on and aggro off, the dead ignore the player and still hunt and kill villagers: `nearestPrey` (`src/entities/zombie.js:268-289`) never reads `zombieAggro`, though the setting reads "they hunt villagers too, you first" (`src/settings.js:46`).
- [ ] **A torch in the off hand counts as a weapon.** Fast clicking with a sword and a torch, or a spear and a torch, swings the torch and opens the dual-wield exposure (from behind, a bite is fatal); `offWeaponOf` accepts any item with a weapon block, and the torch has one. The torch also wears out after 65 landed hits. (`src/combat.js:105-110`; docs/21 says a sword and torch "costs nothing" and the spear is never dual wielded.)
- [ ] **Troughs and the chapel's font say "Drink from the well"**: the drink action's label names the well for any water prop.
- [ ] **The square's three lamp posts start empty**, so they give no light; the generator calls them lamps but places them without a torch (`tools/mapgen/valley.py`).
- [ ] **The Controls screen lists K**, which nothing reads (no `KeyK` in `src/`), and leaves out Q and the middle button (the main hand's other mode) and holding the right button (block, brace) (`src/ui/screens.js:20-45`).
- [ ] **Names over heads cannot be hidden**: the `nameTags` setting exists (`src/settings.js:26`) with no row on the Settings screen.
- [ ] **A guest's pause screen reads "In <code>'s world"**: the host's name is never filled in.
- [ ] **Autosave runs every 60 seconds of sim time**, which is about once a real second while everyone sleeps at sixty times speed.
- [ ] **`light.poolRays()` names an undefined variable** and would throw if called; nothing calls it today (dead code or a trap).
- [ ] *Needs repro:* **a guest's right tap may not cancel its bow draw on the host.** The tap cancels the replica's draw in `src/main.js:615`, but nothing in `net.js` sends the cancel, so the host may still loose on the left release.
- [ ] *Needs repro:* **the Square surface setting changes the map on the client**, so a guest's square floor may differ from the host's until the chunk is resent.

## Open: surprises for Michael to rule on

Not clearly bugs: behaviour that may or may not be intended. Each needs a ruling (`docs/02`) before anyone changes code.

- [ ] **No bites in a default world.** Zombie aggro is off by default, and breaching needs it, so a fresh solo world hurts only through hunger and thirst.
- [ ] **Survival off also stops health regeneration** (`src/entities/player.js:121-125`).
- [ ] **Bandages exist only in the dev chest**, and their `cloth` tag lets the torch, bow, and bed recipes use them up.
- [ ] **Chopping a tree needs no tool and leaves no stump; feeding a fire lights it** (no torch or flint needed). Docs/30 says otherwise for both.
- [ ] **Darkness never shortens the player's sight**: night tints the picture, but every on-screen tile with a clear line is seen. Docs/07's acceptance says the reverse.
- [ ] **Nothing but walls blocks sight or light**: no map entry sets `opaque`, so trees, rocks, and furniture never block.
- [ ] **Removal on X takes the village's own furniture** (any carryable chest, bed, table), with no refund, not only what the player built; an unopened chest drops nothing when removed. Docs/13 says what was placed or built.
- [ ] **A crafted workbench or wheelbarrow can never be moved or removed.**
- [ ] **The dead never walk through an open window**; they climb only when a failed path sends them to breach.
- [ ] **Arrows and thrown spears get no finisher bonus and never knock down.**
- [ ] **Every weapon without its own knockdown floors the dead on 30 percent of hits** (a code default, `src/combat.js:37`), so the sword, hatchet, halberd, and tools all knock down.
- [ ] **Several combat numbers are code constants, not data** (the tired blow, point blank, the default knockdown, hit-stop, every bow tunable), against the rule that combat numbers are data.
- [ ] **The needs' code defaults are stale** (600 and 420 seconds in `src/tuning.js`) behind the data's 1080 and 720; harmless while the data is present.
- [ ] **Leave world goes to the title**, not to the Worlds screen as docs/31/09 says.
- [ ] **Combat testing's forty dead stand two hundred tiles from the valley's spawn** (already owed in `TODO.md`).

## Fixed

(Move items here with the commit that fixed them.)

- [x] **Settings → Defaults wipes far more than settings.** The settings blob also holds the identities, the browser id, friends' worlds bookmarks, the creator key, and the owner keys, and Defaults resets the whole blob; after a reload the browser would lose its characters in friends' worlds and its server worlds' keys. *Read, not tried.* (`src/settings.js` `DEFAULTS`; the Settings screen's Defaults in `src/ui/screens.js`.) **Fixed (2026-10-15, the commit that moves this line):** Defaults resets only what the Settings screen shows (`settings.SCREEN_KEYS`: its choices and the painted layers it tries on); the identities, the browser id, the friends' worlds, the creator and owner keys, and the panels' places are kept. Tried under Node with a stand-in store.
- [x] **Taking or mounting a torch never reaches guests.** `map.setHolder` (`src/map.js:181-187`) calls no `map.touch` (a door does, `src/interact.js:469`), so the change is not in the touched chunks; a guest's post or bracket keeps its old state until something else changes on that tile. **Fixed (2026-10-15, `8f5d996`, the multiplayer agent's save cache):** `map.setHolder` touches the post's tile or the bracket's wall; tried in two tabs with a torch mounted and a holder emptied on the host.

## Closed

(Move items here when judged intended or not worth fixing, with a word why.)
