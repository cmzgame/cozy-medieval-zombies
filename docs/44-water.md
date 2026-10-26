# 44 — Water: tainted and clean, boiling, and being Sick

**Status, 2026-10-25: a spec, ruled by Michael in session (`02`, 2026-10-25, Water ruled; #279, building on 2026-10-19's unsafe water). Built (#418): the whole of it, in one step.** Written from `origin/main` at 31d330a. A **default** is Primary's, Michael's to overrule; the rest is his ruling. Skill gates are open to all until the skills are built.

**Where it lives:** `src/water.js` (clean and tainted, mixing, the `boil` verb and its bar), `src/sick.js` (the debuff and `taintedDrink`, the one roll), `src/debuffs.js` and `src/ui/debuff-icons.js` (Sick's row and icon), `src/moodles.js` (Queasy), the numbers in `data/tuning.json` `water`; the proofs are `node tools/check.js` ("water") and `check("boil")`, `check("food")`, `check("debuffs")`, `check("kit")`.

**The builder's readings** (Michael's to overrule):
- **A tainted drink while Sick always adds a stack**, with no roll: the 20% is for becoming Sick; once Sick, each tainted drink adds a stack and its half day, the time capped at three stacks' (a game day and a half), so a drink at three stacks tops the time up to the cap.
- **Both rolls every tainted drink**, Sick's and the infection's, two floats of `rng` whatever they bring, so the generator's use never depends on the outcome; a clean sip rolls nothing. With Survival off a tainted drink still rolls.
- **"Food heals 25% less"** is eating's heal (an item's `heal`), not natural regeneration; **"tiredness 50% faster"** is the awake drain, not sleep's restoring.
- **A lit cooking fire** is any prop whose fire `cooks` and is lit: the fireplace, the hearth, the campfire, and the oven too. A Use on a fire that does not cook (the forge, a clamp) is refused: "That is no cooking fire."
- **"In reach"** is `water.boilReach`, 2.6 tiles with a clear line (the click's reach, a station's); the bar's range is the same, so the fire's menu walks the player to within it, and walking away or a wall cancels the bar as any timed action's.
- **The skin's menu** offers Boil water only on a tainted skin that holds water (nothing on a clean or an empty one), in your own bag and on the belt; a skin in a hand has only its hand's menu. **The fire's menu** offers it only on a lit cooking fire; an unlit one offers nothing. The greyed labels: "Boil water (no lit fire in reach)", "Boil water (no tainted water carried)".
- **The card** says "Clean water." or "Tainted water: drinking it may make you Sick." on a skin holding water, and a bucket's "Clean water." or "Tainted water." (it is never drunk); nothing on an empty one. Since Michael's playtest of 2026-10-26 ("needs to be way more noticeable") the tainted line is the card's first, its lead "Tainted water:" bold in the warning red (`--red`), the rest red, on a faint red ground with a red rule down its left. **The drop** is a small brown CSS drop in the top right corner of the block (`.inv-taint`), on a skin or a bucket holding tainted water.
- **The tainted-only line** (*default*, Michael's playtest, 2026-10-26: deep into Thirsty with full skins and no sip): once each Thirsty stage reached while every skin carried that holds water holds only tainted water, the log says "Your waterskins hold only tainted water: boil it at a lit fire." (`taintedOnlyNote(player)` in `entities/player.js`, run in the host's step, the stage last said kept on the player as `taintNoted`; a guest's by `net.logTo`).
- **Mixing:** a clean source into an empty vessel would make it clean; into tainted water it stays tainted (no clean source exists yet).
- **The words:** Sick begun, "Your stomach turns. You feel sick."; a stack more, "The water sits badly. You feel worse."; the boil done, "The water boils. It is clean now." The infection from water has no line of its own: the moodle shows it, and its first stage still reads "Bitten" (open: a water infection may want its own first words).
- **On the wire**, Sick's `left` is to two decimals in the light record as bleeding's is, so a Sick player's light part changes every frame for as long as it lasts (minutes, where bleeding's is seconds): about 35 bytes a frame a Sick player. Whole seconds would do for the row if it ever matters.

## 1. Sources

- **No fixed source is clean:** the wells, the river, the ponds, the trough, and the chapel's font are all tainted (`water.clean` stays empty). The font as holy water would be the village's free clean tap.
- **Mixing taints:** filling a bucket that holds clean water at a tainted source makes the whole of it tainted (the entry loses `clean`). **A waterskin holding clean water is never filled at a tainted source** (Michael, 2026-10-26, `02`, Fill waterskins skips clean water): Fill waterskins fills only the empty and the tainted skins, and when every skin that could take water holds clean water it is offered as "Fill waterskins (they hold clean water)" and says "Your waterskins hold clean water: they won't be filled from tainted water." An empty skin is filled and tainted.
- **The starting waterskin is full of clean water** (`data/kit.json`'s entry marked `clean`, and `src/kit.js`, which today passes only `fill` to the entry, passing `clean` too); today it starts tainted.
- **A desperate drink always quenches** and never guarantees a penalty (2026-10-19). **The automatic sip takes only clean water** (2026-10-19, ruled, not built: `src/entities/player.js`'s auto-drink skips a tainted skin). Filling a skin with tainted water is allowed. Crops need no clean water.

## 2. Boiling (Cooking 1)

**One verb, `boil`, three ways in** (Michael: "a perfect spot for Use to shine"): right-click is the complete interface and Use is its item-on-target shortcut, so all three reach the same verb and cannot disagree.
- **Use:** Use a tainted waterskin, then click a lit cooking fire (a fireplace, a hearth, a campfire): a timed bar, as filling at a well, and the water comes out clean.
- **The skin's menu:** right-click a tainted skin in the bag or the belt: **Boil water**, greyed with why ("No lit fire in reach.") when no lit cooking fire is in reach.
- **The fire's menu:** right-click a lit cooking fire: **Boil water** for the tainted skin carried (the fullest first, *default*), greyed with why when none is carried.
- **Skins only, for now** (*Primary's default, Michael's to overrule*): a bucket cannot be drunk from (#209) and nothing moves water between vessels yet, so a clean bucket would have no use; a bucket's boil comes with the boiling pot's fluid transfer (section 7).
- **The numbers** (*defaults*, in `data/tuning.json` `water`): about 30 seconds a skin, whatever its fill; the fill is kept, only `clean` is set. The fire must be lit (a home fire is a switch, `docs/43` section 3); boiling burns no extra fuel.
- **Sanctify** stays as ruled: Faith 10, carried water only, never a well (`docs/39`).

## 3. Telling them apart

- **The hover card says which it is:** "Clean water", or "Tainted water: drinking it may make you Sick." The Drink label keeps "(tainted)". A small brown drop on the icon marks a tainted skin or bucket, so it reads at a glance in the bag. The item's name does not change.

## 4. Sick

- **A debuff, not a moodle** (the debuff row, top right, beside bleeding; `src/debuffs.js`), named **Sick** (Michael, 2026-10-25: "Sick is natural, queasy is pre-zombie!"). **The infection's third stage, "Sick" today, is renamed "Queasy"** (`src/moodles.js`), so the two never read as one.
- **Its effects**, small and self-resolving: tiredness builds 50% faster; food heals 25% less (Michael's "slower to heal"); it lasts about half a game day.
- **The chance:** 20% a tainted drink. **A tainted drink while Sick adds a stack** and its half day of time again, up to three stacks and a game day and a half (*default*): unlike bleeding, which restarts its time, Sick's time adds up; the effects do not grow with stacks, only how long they last. **A 1% chance a tainted drink of the infection** (both rolls in one host function, which both ways to drink tainted water call: a source's Drink in `interact.js` `waterActions`, and a skin's in `player.drink`; there is no cure in the valley, so ten tainted drinks carry about a one-in-ten chance of death: a desperate choice, by design; Michael accepted the number).
- **The infection's chance joins the one difficulty dial** with the bite's when that dial is built (`docs/42`).
- Its card says what it does and how long is left, as bleeding's does; its visual twin is the icon in the row.

## 5. The guest's side

`boil` is a verb in `verbs.js`, run on the host; the Use mode's click and both menus send it by the skin's uid and the fire's prop id, the same path as the host's player. `clean` and `fill` ride on the entry in the player's record and the save; Sick is player state (`player.sick = { stacks, left }`, as `player.bleed`), in the player's record and the save, its `left` rounded to two decimals on the wire as `bleed.left` is (`net.js`). **`game.syncParts` gains both:** `sick` in its per-player text (`playerText`, which names `bleed` today) and `clean` in its entry text (which carries `fill` but not `clean`). Chance comes from `rng`, time from `loop.simTime()`. Tried in two tabs with `check("sync")`; what it adds to a frame read from `net.status().wire`.

## 6. Proof and pages

Rows in `check("food")` (the drink, the chance, the auto-sip skipping tainted), `check("debuffs")` (Sick's row, card, stacks, and its end; the infection's third stage named Queasy), a new `check("boil")` (boil by Use, by either menu, greyed with why, mixing taints; `check("water")` is the water tiles' and fences' already), and `check("kit")` (the starting skin clean); every changed card read in the pane (the waterskin). The wiki's Water, Thirst, Waterskin, Bucket, Debuffs, Infection (its third stage), Cooking, and Valley day pages, and the census.

## 7. Later

- **The boiling pot** (Michael, 2026-10-25, "an eventual goal ... a massive flavor win"): a pot for large stews that restore a lot of water as well as food, with mid to low-mid effects, that also boils about four skins of water at once; it needs real fluid transfer between containers and a "that container is full" refusal; it might be built into a fireplace, raising a fireplace's cost so that building fireplaces is no cheap way to free light and cooking. Filed in `05`.
- **Jugs and jars** keep purified water clean (Mining 3, Crafting 1; `docs/39`).
