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
- **A guest is never told "A fire has gone out."** (found reading the code for #197, on `main`): `src/main.js` ~1626 shows the line for the host's own player only; `src/host.js` forwards `craftDone` and `torchSpent` to a guest but has no `fireOut`, and a server world tells nobody. A guest tending a clamp or a forge never hears it die.
- **`check("growth")`'s "a mutator grows its chunk" row fails on a second run in the same page** (found 2026-10-18): the far chunk the first run grew stays grown, so the row's premise (it was ungrown) is gone. The check should pick a chunk it has not grown or restore the map.
- **A guest who leaves mid-action shows its messages on the host's screen** (found reviewing #193 on `main` at its merge of #192; read from the code, not reproduced). `src/net.js` ~642: on `leave` the guest is dropped from `guests`, but its character stays for the grace and a timed action it began (a cast, a pick, a chop) still completes; `net.messageTo` then returns false (no guest), so the host's message and log sinks (`src/host.js` ~264-272) fall through and show "You catch a perch." on the host's own screen and log. Likely fix: the sinks swallow a message for a player whose guest is gone (or cancel its timed action on leave).

## Open: surprises for Michael to rule on

Not clearly bugs: behaviour that may or may not be intended. Each needs a ruling (`docs/02`) before anyone changes code.


## Became issues

(Move lines here with the issue's number once reproduced.)

## Fixed

(Move items here with the commit that fixed them.)
- [x] **Chopping was the one tool action with no clear-line check** (found reviewing #210): fixed in #208: one reach test, `src/reach.js`, distance and a clear line, for every player action (the chop, the menu's actions, a craft's station and ingredients, the panels, a poke, the bed, the fire); `check("reach")`.

- [x] **Chopping a tree needs no tool and leaves no stump** (the census's line in Closed below, "not built yet"): built in #195: a hatchet in hand, a stump left, the stump chopped for a log.

## Closed

(Move items here when judged intended or not worth fixing, with a word why.)

- [x] **Chopping a tree needs no tool and leaves no stump; feeding a fire lights it** (no torch or flint needed). Docs/30 says otherwise for both. **Closed (Michael, 2026-10-15): not built yet,** docs/30's; written as a TODO under the big pass so it is somewhere real.
- [x] **Darkness never shortens the player's sight**: night tints the picture, but every on-screen tile with a clear line is seen. Docs/07's acceptance says the reverse. **Moved to a discussion (Michael, 2026-10-15: he thinks it should):** open question 30 in `docs/02`, for the lighting work; two old rulings pull against each other there.
- [x] **Nothing but walls blocks sight or light**: no map entry sets `opaque`, so trees, rocks, and furniture never block. **Closed (Michael, 2026-10-15): intended for now.**
- [x] **The dead never walk through an open window**; they climb only when a failed path sends them to breach. **Closed for now (Michael, 2026-10-15):** logged for the combat pass in docs/21. **Closed for good (2026-10-16, `02`, Nobody climbs through a window; region, never biome):** nobody passes a window, player or dead; the climb itself went in #134.
- [x] **Arrows and thrown spears get no finisher bonus and never knock down.** **Closed for arrows (Michael, 2026-10-15): intended.** Not law for the spear: its thrown damage may come down for something else, a low hit that pins one of the dead to the ground (his idea), logged for the combat pass in docs/21.

- [x] **The forge, anvil, cooking, and oven recipes cannot be made in play.** Nothing in the valley gives potato, cabbage, garlic, grain, flour, iron ore, iron bars, or charcoal; only the console or the dev chest (which holds no charcoal) do. (Possibly expected until farming, mining, and charcoal arrive, but then the stations are unusable meanwhile.) **Closed (Michael, 2026-10-15): expected.** The stations wait for farming, mining, and charcoal (docs/30); in-progress things lying about unusable for a while are fine.
- [x] **The dead hunt villagers with Zombie aggro off.** With "Zombies attack villagers" on and aggro off, the dead ignore the player and still hunt and kill villagers: `nearestPrey` (`src/entities/zombie.js:268-289`) never reads `zombieAggro`, though the setting reads "they hunt villagers too, you first" (`src/settings.js:46`). **Closed (Michael, 2026-10-15): intended,** two knobs on purpose (aggro off with this on lets the dead go after villagers while ignoring you). The setting's label now says so: "On (they hunt villagers, whatever aggro says; with aggro on, you first)".
