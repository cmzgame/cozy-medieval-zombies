# 42 — The levers: every number Michael means to keep tuning, and every world setting

**Status, 2026-10-25: a reference, kept current by the rule in `CLAUDE.md` (a ruling that names a lever or a world setting adds or changes its line here in the same commit).** Created for #384 (Michael: "I do keep saying it and I am not sure if it ever gets written down"). Values are as of `main` when a line was last touched; the data is the truth, and the wiki's page of these reads the data (#387). The reasons are the rulings in `docs/02`, named on each line.

Two kinds:
- **A tuning lever** is a number Michael is still balancing by play: ours to turn, not a player's.
- **A world setting** is a choice a player makes: a world's rule (chosen at the Sandbox step of New world or by the host from the pause menu, `docs/38`), or a player's own setting (the Settings screen). "Someday" marks one Michael has named that is not built.

## Tuning levers

### The dead and the bite
- **The dead's health:** `zombie.hp` in `data/tuning.json`, 150. Michael's number (`41` step 6, 2026-10-23). The sword kills in 3 up to 102, in 4 from 103 to 136, in 5 from 137 to 170. Room to go up with the difficulty pass (#133; #385).
- **What a cancelled bite costs the dead one:** today the bite's whole cooldown, `zombie.cooldown`, 1.2 s (2026-10-23, the cancel is a lever; `docs/41` step 1). The softer setting is half of it.
- **Whether every landed hit cancels a bite's wind-up, or only one that staggers:** today every hit; a switch in code (`damageZombie` in `src/entities/zombie.js`), not yet data (2026-10-23).
- **The bite's wind-up:** the dead's `attack` in `data/poses.json`, the bite on its fifth frame at 10 fps, 400 ms (`41` step 1).
- **Bite tokens:** `zombie.biteTokens` 2 and `zombie.biteTokensPer` 3 in `data/tuning.json`: how many of the dead in reach of one target bite at once (`41` step 5).
- **The closing burst** (a trial, 2026-10-24, #385): `zombie.burstSpeed` 1.5 within `zombie.burstRange` 3 tiles of a target the dead one sees, in the chase; `burstSpeed` 1 switches it off.
- **The floor:** `zombie.downTime` 0.8 s, `zombie.getUpTime` 0.6 s; a turned villager `zombie.turnDownTime` 2 s (`41` step 3).

### The player's blows
- **Stamina's regeneration:** `player.staminaRegen` 10 a second (`41` step 4; "no law about stamina regen").
- **Each weapon's swing cost:** `stamina` on each weapon block in `data/items.json` (`41` step 4).
- **The tired blow:** `blow.tiredDamage` 0.5 in `data/combat.json`: a swing the bar cannot pay for (2026-10-11, narrowed 2026-10-24); a shove the bar cannot pay for staggers and floors at the same share, and pushes `shove.tiredPush` of its push (2026-10-24, #385, Primary's reading; the push's own share, Michael's).
- **Knockdown:** `blow.knockdownChance` 0; the mace's `knockdown` 0.35, the halberd thrust's 0.5, the shove's 0.1 (`41` step 3).
- **The finisher:** `finisher.mult` 1.5; the third-hit combo `combo.enabled` off, kept for testing (2026-10-12).
- **The shove:** `shove` in `data/combat.json`: the push `knockback` (0.65 tiles, and a tired shove `tiredPush` 0.7 of it, 0.45; Michael, 2026-10-24), `stagger` 0.8 s, `stamina` 15, `cooldown` 0.5 s, `targets` 3 (`41` step 2).
- **The spear's break:** `thrown.breakChance` on the spear in `data/items.json`, 0.25, hit or miss (2026-10-24).
- **Hit stop and the swing's commitment:** `blow.hitStop` 0.07, `blow.hitStopKill` 0.12, `blow.swingMove` 0.6 (`41` step 1).

### Food, the world, the valley
- **Tainted water and Sick** (`data/tuning.json` `water`): `sickChance` 0.2 a tainted drink, `sickMaxStacks` 3, `sickTiredMult` 1.5 (tiredness 50% faster) and `sickHealMult` 0.75 (food heals 25% less) for `sickDays` 0.5 of a game day a stack; `infectionChance` 0.01 a tainted drink of the infection; `boilSeconds` 30 to boil a skin at a lit cooking fire within `boilReach` 2.6 tiles (Primary's defaults: the seconds, the stacks' time adding up; the builder's: the reach); `clean`, the sources that are safe, empty (2026-10-25, `44`; built, #418).
- **The campfire:** six logs at most, three game hours a log, built with two (2026-10-25, `43`; not built: today four logs of two hours in `data/sprites/campfire.json`).
- **Take apart's return:** half a thing's materials, rounded down (2026-10-25, `43`; not built).
- **Repairs:** `work.grindstone.ceilings` 0.6, 0.4, 0.2 and `work.anvil.ceilings` 1, 0.8, 0.6 in `data/tuning.json`, on one count per item, the entry's `repairs` (2026-10-25, `43`; built, #410). The bars' seconds, `work.grindstone.seconds` 4 and `work.anvil.seconds` 6, the anvil's tool `work.anvil.uses` (the smith's hammer's verb, `smith`), and each item's material, its `repair.with` in `data/items.json` (an iron bar for iron, a plank for wood), are Primary's defaults.
- **The sawpit:** `work.saw` in `data/tuning.json`: a log (`item`) sawn into what it splits into, three planks, in `seconds` 5 (*default*), no hatchet (2026-10-25, `43`; built, #410).
- **Honey:** `work.honey` in `data/tuning.json`: a hive gives `count` 1 to 1 of `item` honey and again `days` 3 of the clock later, in `seconds` 3 ("every few game days", 2026-10-25, `43`; the numbers Primary's defaults; built, #410). The pot of honey's own numbers, hunger 20 and heal 3, are its line in `data/items.json`.
- **Burn corpse:** about a game hour of burning, a log spent (2026-10-25, `43`; not built).
- **The dye vat:** the dyes and their palettes in `data/dyes.json` (twenty-four, Primary's palette), what each item may take in its `dye` block in `data/items.json`; Crafting 3 to use a vat (`unlock`, open to all until the skills); a dye's `cost`, none yet, until #288 rules whether it costs a plant (2026-10-25, `43` section 8).
- **Rot:** each food's life in game days, and planted or hanging food at five times it (2026-10-23, the food economy; not built).
- **Day-one food:** the target of about twelve game days for one player with tools, read on the wiki's Day-one food page (2026-10-23).
- **The loot tables:** a table per kind of container in `data/loot.json`, weights out of 32 so a weight is a chance in 32 a roll, `rolls` how many rolls a container makes; the wiki shows each item's rate (2026-10-24, #268: Michael tunes them from the wiki, OSRS's tables the guide).
- **What stacks and how far:** each item's `stack` in `data/items.json`; one thing a cell unless chosen (2026-10-24, #260).
- **The bags' sizes:** each bag's `bag` in `data/items.json`: the sack 6 by 4, the rucksack 8 by 5 today (8 by 6 ruled), the satchel 7 by 5 and the best bag 10 by 6 to build (2026-10-24, #260).
- **A boss's capstone:** about 1 in 8 at first, rising with each kill that misses, certain by the twentieth, per player (2026-10-24, #268; not built).

## World settings

### A world's rules (`src/settings.js`, groups `rules` and `sandbox`)
- **Village stations:** fixed, or movable and craftable; fixed by default (2026-10-25, `43` section 5; not built).
- **Zombie aggro**, on (2026-10-15). **Zombies attack villagers**, off (2026-10-15). **Survival**, on (2026-10-13). **Free building**, off. **Multi-hit**, off, "the easy button" (2026-10-12).
- **Trees** and **Starting population**, chosen when the world is made and fixed after (2026-10-16).
- **Dev chest**, on; **Dev bag**, off; **Extra starting items**, none: the Sandbox step's testing choices (2026-10-16).
- **Combat difficulty and infection, one dial** (2026-10-12): someday; today `infection.chance` 0.2 in `data/combat.json` is its only part, and tainted water's 1%, `water.infectionChance` in `data/tuning.json`, joins it (2026-10-25, `44`).
- **What death takes:** all skills (2026-10-23); a world rule to soften it someday, playtests deciding.

### A player's own settings (`src/settings.js`, groups `display` and `sound`)
- **The aim guide**, on by default from 2026-10-24 (#385; it was off since 2026-10-16), off for the challenge.
- **Swing targets**, on (`41` step 1). **Swing timer**, on. **Floating numbers**, shown.
- **Sound**, on; **Volume**, 75% (`docs/40`; 2026-10-24, question 1); a mute key, F8 (2026-10-24, #386).
