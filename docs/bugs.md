# Unverified bugs: the holding place

**What this file is** (Michael, 2026-10-15; `github.md`, section 6): the place for bugs **suspected but not yet reproduced**. Anyone who suspects one adds a line under Open, on the latest `main`, after checking Fixed, Closed, and Became issues so nothing comes back. The file is gone through now and then: **a bug that reproduces becomes a GitHub issue** (label `bug`, the steps to see it, a link to its line here), and its line moves to **Became issues** with the issue's number; a line that will not reproduce, or is intended, moves to **Closed** with a word why. Only reproduced bugs are worked, as issues. The entries below the next paragraph came from the wiki census.

## The wiki census's entries

**Where these come from:** the **wiki-writing agent**, not a coding agent. They were found while building the wiki (`docs/37`, the repository `cmzgame/cmz-wiki`): a census that read the whole game, code first and docs second, at game commit **`9205ad7`** (2026-10-14), then traced every claim on every wiki page back to the code. **Nothing here was played in the game**: each item was read in the code, and the ones marked *needs repro* were inferred and should be tried before they are fixed. Line numbers are as of `9205ad7` and may have moved.

**For the coding agents and the technical lead:** this is a work list, not a ruling. Before fixing an item, confirm it on current `main` (and in the pane where it is behaviour). When an item is fixed, move it to **Fixed** at the bottom with the commit; when it is judged intended or not worth fixing, move it to **Closed** with a word why. A fix is built for a guest as every change is (`CLAUDE.md`, the multiplayer rule), and the wiki is updated for it.

**How the list grows:** each time the wiki is synced with the game, new findings are added here by the wiki agent, marked with the commit they were read at. The wiki agent never edits an item a coding agent has moved or annotated.

**Not here:** the places where the game's docs disagree with its code (mostly stale docs, for Michael to rule on): `census/discrepancies.md` in the wiki repository, [on GitHub](https://github.com/cmzgame/cmz-wiki/blob/main/census/discrepancies.md).

**Where Fixed went (the sweep, 2026-10-16):** the 27 items fixed from the census on 2026-10-14 and 15 are `history/bugs-fixed-2026-10-15.md`, one line each with its commit; the Fixed section below holds what is fixed since. Closed stays here: its rulings are what stop a line coming back.

## Open: likely bugs

- **`check("sync")` reports a chunk-count difference when the players are far from the spawn** (found testing #196's iron workings, 2026-10-18, on `main`; reproduced in two tabs). The host evicts the wild chunks far from every player (`evictChunks`), the guest's replica keeps what it was sent, so with both players 110 tiles from the spawn the host holds fewer chunks and props than the guest and the map and registry parts differ (e.g. host 162 chunks, 6715 props; guest 168, 6876). Nothing is wrong in play that the check can see, but it means the check cannot pass far from the spawn, and the guest holds chunks the host no longer has. Likely fix: the guest drops what the host dropped (the frame names evicted chunks), or the check compares only the chunks both hold.
- **`check("growth")`'s "a mutator grows its chunk" row fails on a second run in the same page** (found 2026-10-18): the far chunk the first run grew stays grown, so the row's premise (it was ungrown) is gone. The check should pick a chunk it has not grown or restore the map.
- **A guest who leaves mid-action shows its messages on the host's screen** (found reviewing #193 on `main` at its merge of #192; read from the code, not reproduced). `src/net.js` ~642: on `leave` the guest is dropped from `guests`, but its character stays for the grace and a timed action it began (a cast, a pick, a chop) still completes; `net.messageTo` then returns false (no guest), so the host's message and log sinks (`src/host.js` ~264-272) fall through and show "You catch a perch." on the host's own screen and log. Likely fix: the sinks swallow a message for a player whose guest is gone (or cancel its timed action on leave).

- **The hover card's plurals add an "s" and its names are lower-cased** (found syncing the wiki for #313, 2026-10-20, read from the code at `8af4eed`, *needs repro*). `src/item-info.js`, the `splitsInto` line ("Splits into N <name>s") and the "Goes into" and "Builds" lines: an item whose plural is not "+s", or whose name keeps a capital ("Onion-head Hat", "Staff of Fire"), would read oddly. Likely fix: a `plural` (and kept case) per item in the data where the rule fails.

- **`check("build")` fails 9 of 11 on `main`** (found reviewing #227, on `main` at `0e765f7`, fresh tab): "the player's own wall with a door removed is still the player's own" and "a new door built over a broken stamped one remembers the wall under it". Not a play bug found; 11 of 11 in my run after other checks in the same tab, so it may depend on what ran first.

- **A repair place's greyed line says nothing worn is carried when everything worn is already above its ceiling** (found syncing the wiki for #416, 2026-10-25, at `e045b31`). `src/repair.js` `propActions` (~135, ~152): a worn sword at 70% at the grindstone (next ceiling 60%) is skipped, and the one line left reads "Sharpen (no dull blade carried)". Likely fix: "Sharpen (nothing it can better)" when something worn was skipped.

- **Two small words** (found syncing the wiki, 2026-10-25, at `e045b31`): `data/sprites/sawpit.json`'s note names `src/repair.js` where the code is `src/sawpit.js`; `src/sawpit.js` (~47) says "1 fall at your feet" when one plank falls.

- **Talk is answered while an immune villager cowers or runs** (found syncing the wiki for #434, 2026-10-25, read at `fa2997f`, *needs repro*). `src/entities/villager.js` `startTalk` (~304-319) does not look at the cower or flee state; `docs/43`'s status says Talk is not answered then. A Talk to a fleeing villager whose dead one is beyond `talkDeadRadius` would start a conversation and cut off the flight.

- **Burn corpse's done line types "about an hour"** (found syncing the wiki for #434, at `fa2997f`). `src/burn.js` (~141) says it whatever `work.burnCorpse.hours` is; the card (~113) reads the data.

- **An infection caught from tainted water opens on Bitten, "The bite broke the skin."** (found syncing the wiki for #435, at `fa2997f`, *needs repro*). `src/moodles.js` (~26): the first stage's words assume a bite, and water gives no bite.

## Open: surprises for Michael to rule on

Not clearly bugs: behaviour that may or may not be intended. Each needs a ruling (`docs/02`) before anyone changes code.

- **A sip at full thirst still takes water and rolls Sick and the infection** (found syncing the wiki for #435, at `fa2997f`). `src/entities/player.js` (~122, ~127): drinking a tainted skin when not thirsty spends a unit and rolls both chances. Perhaps intended (a drink is a drink); for Michael.

- **A free sharpening spends the rung the anvil uses** (found syncing the wiki for #416, 2026-10-25, at `e045b31`). One count serves both places (`src/repair.js` ~44-48, ~103), as `docs/43` section 6 rules, so a sword sharpened once at the grindstone (to 60%) can no longer be repaired to 100% at the anvil, only to 80%. Read literally that is the ruling; it may surprise a player who sharpens first. For Michael: keep, or let the grindstone's rungs not lower the anvil's.

- **The fishing rod is repaired with a plank, though no plank made it** (found syncing the wiki for #416, 2026-10-25, at `e045b31`). `data/items.json` gives the rod `repair.with: "plank"` (the spec's "a plank for wood"); its recipe is a stick and cloth. The bow likewise. Listed to be seen, not as a bug.


## Became issues

(Move lines here with the issue's number once reproduced.)

## Fixed

(Move items here with the commit that fixed them.)

- [x] **The dye vat's picker left out the belt's slots and a bag inside a bag** (found syncing the wiki for #417, 2026-10-25): `dyeables` listed the worn slots, the hands, and the worn bag's items, while the verb's `entryOf` took the belt's slots too. Read again on `main`: a satchel carried in a worn rucksack was already listed (it is an item of the worn bag), and no bag holding things can go into a bag (`inventory.canStoreIn`), so the belt's slots were the one gap, and no dyeable thing rides a belt yet. Fixed in the bugs batch (`primary/bugs-batch-1`): one walk in `src/dye.js` (`carried`: the worn things, the hands, the belt's slots, the bag, and a bag or a belt inside it in its turn) serves the picker's list and the verb's `entryOf` alike, so the picker offers nothing the verb refuses; `node tools/check.js` ("dye vat": gloves on a worn belt's slot dyed by a guest's command, a cap in a satchel in the bag) and `check("dye")` (a satchel in a worn rucksack listed and dyed, gloves on the belt listed) have rows for it.

- [x] **A dyeable item's card counted one colour more than its picker showed** (found syncing the wiki for #417, 2026-10-25): the card counted the whole palette, and the picker drops a palette colour equal to the item's own (its Undyed swatch). Fixed in the bugs batch (`primary/bugs-batch-1`): `item-info.js` counts as the picker does, so the breeches read 15 colours and the boots 6; `node tools/check.js` ("dye vat") and `check("dye")` (the breeches' swatches against their card) have rows for it.

- [x] **A brass buckle on the leather belt was called "undyed"** (found syncing the wiki for #417, 2026-10-25): the belt's own buckle is the Brass dye's hex, and the card and the picker named any own colour "undyed", so black with its own buckle read "Black and undyed". Fixed in the bugs batch (`primary/bugs-batch-1`): `dye.regionWord`, one word for the card (`colourWords`) and the picker (`ui/dye-panel.js`), names a region by its dye whenever its colour is a dye's hex, own or not, and "Undyed" only for an own colour no vat gives; the picker's Colour line reads Undyed when the item is its own colours whole, as its card names none. `node tools/check.js` ("dye vat") and `check("dye")` have rows for it.

- [x] **Dual wielding: the off hand's swing never moved the off arm, and was heard as no sound of its own** (#423, Michael's playtest, 2026-10-25): the off hand's swing played the main arm's `attack` animation, restarting the main arm's swing, and the rig had no pose that moved the off arm, so the second arm never moved and every swing looked like the main hand's. Fixed in #423's branch: an `attack_off` animation on every player's sheet, the off weapon's style with the arms swapped (`rig.js` `pose`), its weapon drawn along the off forearm (`render/entities.js`), played by `combat.tryAttack` for the off hand on the host and in a guest's prediction alike. The sound path was found wired (the off hand's `offCooldown` rises on the step of its swing, on the host and in a guest's prediction and light record, and the ear plays its weapon's slot); `check("sound")` and `check("poses")` gained rows that prove both.

- [x] **`check("kindle")` failed after hovercard, villagers, talk, burn, immune, and poses in one page** (#437): it took the bag as it found it, so a bag left full sent the logs and the torch it stowed elsewhere. Fixed in #437's branch: kindle starts from an empty bag and puts it back in its `finally`, as slots does since #430.
- [x] **A hover card near the right edge ran off the bottom of the window** (found fixing #437, `check("hovercard")`'s corner row): placed near the edge a card narrowed to fit before it was measured, so it never flipped. Fixed in #437's branch: `ui/hover-card.js` `place` measures it at the top left first. The same run found `check("debuffs")` reading the row before it was redrawn for the last stacks (a hidden pane draws no frame); the check draws it first now.
- [x] **`check("build")` threw after `check("worlds")` in one page** (#432, found reviewing #431, 2026-10-25): worlds left the page with no world, so build's door was never built and its Take apart probed an empty wall slot, and `placement.partsOf` and `takeApartProblem` threw on the missing wall. Fixed in #432's branch: worlds ends in a fresh world of its own, and a stale target (a wall or a prop already gone, as a guest's late command may name) is refused with "There is nothing there.", never a throw; `check("build")` has a row for it.
- [x] **A thrown spear lodged in a body came back fresh from the search** (found syncing the wiki for the melee pass, cmz-wiki#20, 2026-10-24): fixed by the spear-break change of 2026-10-24: a thrown thing that stays in a body is kept as itself (`lodgedItems`) and comes out of the search with its wear; arrows lodge by count as before.
- [x] **A guest was never told "A fire has gone out."** (found reading the code for #197): fixed: `host.js` forwards `fireOut` as a screen message to every guest whose player stands within `world.fireOutRadius`, as the host's own player is told; tried with a guest beside a campfire burning out, in two tabs.
- [x] **Chopping was the one tool action with no clear-line check** (found reviewing #210): fixed in #208: one reach test, `src/reach.js`, distance and a clear line, for every player action (the chop, the menu's actions, a craft's station and ingredients, the panels, a poke, the bed, the fire); `check("reach")`.

- [x] **Chopping a tree needs no tool and leaves no stump** (the census's line in Closed below, "not built yet"): built in #195: a hatchet in hand, a stump left, the stump chopped for a log.

## Closed

(Move items here when judged intended or not worth fixing, with a word why.)

- **A spear that hits and kills could be gone from the body's loot, with no word** (Michael's question, 2026-10-24): ruled the same day (`docs/02`, The spear breaks one throw in four): the break is 25%, the same on a hit or a miss, and the thrower is now told "The throwing spear breaks."
- [x] **Chopping a tree needs no tool and leaves no stump; feeding a fire lights it** (no torch or flint needed). Docs/30 says otherwise for both. **Closed (Michael, 2026-10-15): not built yet,** docs/30's; written as a TODO under the big pass so it is somewhere real.
- [x] **Darkness never shortens the player's sight**: night tints the picture, but every on-screen tile with a clear line is seen. Docs/07's acceptance says the reverse. **Moved to a discussion (Michael, 2026-10-15: he thinks it should):** open question 30 in `docs/02`, for the lighting work; two old rulings pull against each other there.
- [x] **Nothing but walls blocks sight or light**: no map entry sets `opaque`, so trees, rocks, and furniture never block. **Closed (Michael, 2026-10-15): intended for now.**
- [x] **The dead never walk through an open window**; they climb only when a failed path sends them to breach. **Closed for now (Michael, 2026-10-15):** logged for the combat pass in docs/21. **Closed for good (2026-10-16, `02`, Nobody climbs through a window; region is the word):** nobody passes a window, player or dead; the climb itself went in #134.
- [x] **Arrows and thrown spears get no finisher bonus and never knock down.** **Closed for arrows (Michael, 2026-10-15): intended.** Not law for the spear: its thrown damage may come down for something else, a low hit that pins one of the dead to the ground (his idea), logged for the combat pass in docs/21.

- [x] **The forge, anvil, cooking, and oven recipes cannot be made in play.** Nothing in the valley gives potato, cabbage, garlic, grain, flour, iron ore, iron bars, or charcoal; only the console or the dev chest (which holds no charcoal) do. (Possibly expected until farming, mining, and charcoal arrive, but then the stations are unusable meanwhile.) **Closed (Michael, 2026-10-15): expected.** The stations wait for farming, mining, and charcoal (docs/30); in-progress things lying about unusable for a while are fine.
- [x] **The dead hunt villagers with Zombie aggro off.** With "Zombies attack villagers" on and aggro off, the dead ignore the player and still hunt and kill villagers: `nearestPrey` (`src/entities/zombie.js:268-289`) never reads `zombieAggro`, though the setting reads "they hunt villagers too, you first" (`src/settings.js:46`). **Closed (Michael, 2026-10-15): intended,** two knobs on purpose (aggro off with this on lets the dead go after villagers while ignoring you). The setting's label now says so: "On (they hunt villagers, whatever aggro says; with aggro on, you first)".
