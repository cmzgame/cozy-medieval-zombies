# 44 — Water: tainted and clean, boiling, and being Sick

**Status, 2026-10-25: a spec, ruled by Michael in session (`02`, 2026-10-25, Water ruled; #279, building on 2026-10-19's unsafe water). Not built.** Written from `origin/main` at 31d330a. One build step (#279's build issue). A **default** is Primary's, Michael's to overrule; the rest is his ruling. Skill gates are open to all until the skills are built.

**Built already:** a natural source's Drink and a skin's Drink say "(tainted)" (`src/interact.js` `drinkLabel`, `cleanWater`); `data/tuning.json` `water.clean` lists the clean sources (none); a skin's water is tainted unless its entry is marked `clean`.

## 1. Sources

- **No fixed source is clean:** the wells, the river, the ponds, the trough, and the chapel's font are all tainted (`water.clean` stays empty). The font as holy water would be the village's free clean tap.
- **Mixing taints:** filling a skin or a bucket that holds clean water at a tainted source makes the whole of it tainted (the entry loses `clean`).
- **The starting waterskin is full of clean water** (`data/kit.json`'s entry marked `clean`); today it starts tainted.
- **A desperate drink always quenches** and never guarantees a penalty (2026-10-19). **The automatic sip takes only clean water** (2026-10-19, ruled, not built: `src/entities/player.js`'s auto-drink skips a tainted skin). Filling a skin with tainted water is allowed. Crops need no clean water.

## 2. Boiling (Cooking 1)

**One verb, `boil`, three ways in** (Michael: "a perfect spot for Use to shine"): right-click is the complete interface and Use is its item-on-target shortcut, so all three reach the same verb and cannot disagree.
- **Use:** Use a tainted waterskin or bucket, then click a lit cooking fire (a fireplace, a hearth, a campfire): a timed bar, as filling at a well, and the water comes out clean.
- **The vessel's menu:** right-click a tainted skin or bucket in the bag or the belt: **Boil water**, greyed with why ("No lit fire in reach.") when no lit cooking fire is in reach.
- **The fire's menu:** right-click a lit cooking fire: **Boil water** for the tainted skin or bucket carried (the fullest first, *default*), greyed with why when none is carried.
- **The numbers** (*defaults*, in `data/tuning.json` `water`): about 30 seconds for a full skin, a bucket the same, whatever its fill; the fill is kept, only `clean` is set. The fire must be lit (a home fire is a switch, `docs/43` section 3); boiling burns no extra fuel.
- **Sanctify** stays as ruled: Faith 10, carried water only, never a well (`docs/39`).

## 3. Telling them apart

- **The hover card says which it is:** "Clean water", or "Tainted water: drinking it may make you Sick." The Drink label keeps "(tainted)". A small brown drop on the icon marks a tainted skin or bucket, so it reads at a glance in the bag. The item's name does not change.

## 4. Sick

- **A debuff, not a moodle** (the debuff row, top right, beside bleeding; `src/debuffs.js`), named **Sick** (Michael, 2026-10-25: "Sick is natural, queasy is pre-zombie!"). **The infection's third stage, "Sick" today, is renamed "Queasy"** (`src/moodles.js`), so the two never read as one.
- **Its effects**, small and self-resolving: tiredness builds 50% faster; food heals 25% less (Michael's "slower to heal"); it lasts about half a game day.
- **The chance:** 20% a tainted drink; a tainted drink while Sick adds its time again, up to three stacks, as bleeding stacks. **A 1% chance a tainted drink of the infection** (there is no cure in the valley, so ten tainted drinks carry about a one-in-ten chance of death: a desperate choice, by design; Michael accepted the number).
- **The infection's chance joins the one difficulty dial** with the bite's when that dial is built (`docs/42`).
- Its card says what it does and how long is left, as bleeding's does; its visual twin is the icon in the row.

## 5. The guest's side

`boil` is a verb in `verbs.js`, run on the host; the Use mode's click and both menus send it by the vessel's uid and the fire's prop id, the same path as the host's player. `clean` and `fill` ride on the entry in the player's record and the save; Sick is player state (`player.sick = { stacks, left }`, as `player.bleed`), in the player's record and the save, and `game.syncParts` compares the players whole. Chance comes from `rng`, time from `loop.simTime()`. Tried in two tabs with `check("sync")`; what it adds to a frame read from `net.status().wire`.

## 6. Proof and pages

Rows in `check("food")` (the drink, the chance, the auto-sip skipping tainted), `check("debuffs")` (Sick's row, card, stacks, and its end; the infection's third stage named Queasy), `check("kindle")` or a new `check("water")` (boil by Use, by either menu, greyed with why, mixing taints, the kit's skin clean); every changed card read in the pane (the waterskin, the bucket). The wiki's Water, Thirst, Waterskin, Bucket, Debuffs, Cooking, and Valley day pages.

## 7. Later

- **The boiling pot** (Michael, 2026-10-25, "an eventual goal ... a massive flavor win"): a pot for large stews that restore a lot of water as well as food, with mid to low-mid effects, that also boils about four skins of water at once; it needs real fluid transfer between containers and a "that container is full" refusal; it might be built into a fireplace, raising a fireplace's cost so that building fireplaces is no cheap way to free light and cooking. Filed in `05`.
- **Jugs and jars** keep purified water clean (Mining 3, Crafting 1; `docs/39`).
