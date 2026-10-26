# 47 — Potions, poisons, and mana

**Status, 2026-10-25: a spec, ruled by Michael in session (`02`, 2026-10-25, Potions, poisons, and mana ruled); nothing built.** He was shown every recommendation below and answered: "I actually do not have a single change to suggest now. Anything that might need to change from the spec can be discovered in playtesting." He added that a poison goes on a blade or on arrows through the Use system: "I forgot about arrows and blades, that is a perfect case for our 'use' system." Written from `origin/main` at a20f76b. Four build steps, one issue each, in order. A **default** is Primary's, a number or a reading the sitting did not name, Michael's to overrule; the rest is his ruling. Skill gates are open to all until the skills are built (`docs/39` section 9), and a level that adds a bonus (two a brew, stronger potions) waits for them.

## 1. Why, in Michael's words

Potions, poisons, and mana are one sitting because they are one loop: herbs gathered across the map (`46`), brewed at a cauldron, spent in a fight. Michael's worry was the supply: "there needs to be some real busywork for this besides just finding herbs and bringing them home, else people are going to be drowning in potions." And spells are "costed according to their power": the Fireball "no longer two shots zombies, but its burn effect matters if spread out and it's a light utility. So maybe 20 mana?"

## 2. The busywork: vials, clean water, herbs, a cauldron

No glass and no sand: **a vial is earthenware**, under the clay ruling already made (2026-10-23, `docs/39` section 5.9: clay shaped at the workbench and fired in any oven, no kiln). One healing potion asks for the whole chain:
- clay dug at the river with a shovel (`46`), shaped into vials at the workbench and fired in an oven;
- a waterskin filled and boiled at a fire (`44`): **a potion needs clean water**, so the water system has a second job;
- herbs found across the valley; they are never farmed (`46`: "like weeds", no herb patch);
- a brew at a cauldron over a lit fire, which takes time.

Two rules keep the supply sane:
- **Drinking leaves the empty vial**, so a vial is refilled, not remade.
- **Throwing shatters it** (section 7), so a splash costs a vial.

**The vial** (*defaults:* the counts and seconds): one clay shaped at the workbench makes two unfired vials (Crafting 1, the clay's Mining 3 recorded); an unfired vial fired in any oven is a **clay vial** (the empty one); 1 by 1, stacking 10. An empty vial has no use but the brew. An unfired vial is its own item so the oven's time is the busywork it should be.

## 3. Brewing at a cauldron

**Never on the go:** brewing is at a cauldron over a lit fire, never in the field.
- **The witch's cauldron** at the mere is the first, and she teaches Potions (ruled 2026-10-19). Step 2 places the cauldron where her cottage will stand, on the lane to the mere (`tools/mapgen/valley.py`); the cottage, the witch, and her garden come with the map sitting (#92). *Default:* a village station, as the oven is (`villageStation`, behind the world rule Village stations).
- **Your own cauldron** is made at the anvil (*default:* three iron bars and a smith's hammer carried) and set down at home as the other made stations are (`docs/39` section 1, your own workstations: Woodcutting 7 and Crafting 5, recorded, not enforced).

**The cauldron is one prop with its fire under it** (*default*): a station with a `fire` block as the oven has one. It burns logs (`maxFuel` 3, two game hours a log, as the oven), is lit with a flame (a tinderbox or a lit torch) and fed by hand, and brews only while lit; a job waits at the head of its queue while it is out, as the oven's does. It does not cook (`cooks` false), so it boils no water and bakes nothing: one station, one job.

**A recipe is two of its main herb, one secondary, one clay vial, and one draught of clean water** from a skin carried (*default:* a draught is 10 of a skin's 100; a tainted skin is refused with why, "Potions need clean water."). Each brew makes one potion in 20 seconds (*default*); Potions 2 (healing two a brew) and Potions 9 (one more a brew) make more from the same herbs, each extra potion taking its own vial and draught, when the skills come. The recipes live in `data/recipes.json` at the station `cauldron`, so the station panel lists them as it lists the oven's.

**Each potion has its own main herb, and the secondaries cross between recipes,** so every herb has a job without everything being interchangeable:
- **Healing potion:** 2 yarrow, 1 sage (Potions 1).
- **Stamina potion:** 2 nettle, 1 pot of honey (Potions 3).
- **Mana potion:** 2 mageroot, 1 mushroom (Potions 4).
- **Poison:** 2 nightshade, 1 grave moss (Potions 5).
- **Strong poison:** 2 wolfsbane, 1 grave moss (Potions 5).

Feverfew and salt are left out on purpose: a feverfew tonic slowing the infection's stages is a someday (the cure is the late Divine Potion), and salt is earmarked for salting food. **The supply, by the counts in `46`:** about 16 yarrow in the valley, back one to two days after picking, is about eight healing potions a day for a player who combs the whole valley, about five a day with ordinary effort. **Grave moss is 4 nodes**, all in the graveyard, so poison is the rarest thing here; its count is a lever (`42`) for the playtests to move.

## 4. The potions, drunk

**Drinking** (*defaults*, each a lever in `data/tuning.json` `potions`):
- **Healing:** 40 health at once (of 100), the only big heal (ruled: food heals a little, at most ten; potions big). It does not close a wound or touch the infection.
- **Stamina:** fills the bar and doubles its regeneration for 30 seconds.
- **Mana:** 50 mana at once (section 5).
- **A potion between drinks:** 10 seconds of the sim clock after any potion before the next is drunk, per player, so three potions are not a 120-health swallow; refused with why, "You can't drink another potion yet."

**The ways to drink one** are food's (`docs/39` section 5.6): the belt key of a slot that consumes, a double-click in the bag, and its menu's **Drink** in the bag, on the belt, or in a hand. Under the belt's roles (`02`, 2026-10-25, The belt's slot roles), a potion is something a hand may hold (to throw it, section 7): **in the utility slot its key drinks it, in a hand slot its key draws it into that hand**, as the belt's rule says of anything holdable; the hand's menu and the bag drink it. The empty vial goes back where the potion was when that place is free (the belt slot, the hand, the bag cell), else into the bag, else at the feet with "Your bag is full: the vial is at your feet."

**A potion stacks** (*default:* five, a vial's size, 1 by 1); drinking from a stack leaves its vial in the bag. Potions never spoil: nothing here is harder on a clock.

## 5. Mana

- **A bar of 100**, under stamina, in blue (`player.manaMax` in `data/tuning.json`), raised later by gear and by Faith 4, as health will be.
- **Regeneration is slow:** one point every three seconds of the sim clock (*default*, `player.manaRegen` 0.333 a second), full in five minutes from empty.
- **The mana potion** gives 50 (section 4).
- **Praying at an altar** refills mana and stamina (Faith 1, recorded, not enforced): the **Pray** verb on the chapel's altar (`data/sprites/altar.json`, today decoration), a 3 second bar (*default*), no cooldown; the walk to the chapel is its cost.
- **Casting costs mana.** The cost is on the spell in the data: `mana` on a book's `spell` and on the staff's, **the Fireball 20**. A cast is refused before its draw starts when the bar cannot pay, with the log line "Not enough mana." and the bar's flash (the visual twin of `docs/40`'s not-enough-mana sound); mana is spent when the spell is released, never on a cancelled draw.
- **The rule of thumb for the spells to come** (`docs/39` section 9, Magic): a utility like Kindle 5 to 10, a bolt about 20, the big ones like Pyroblast 35 or more. Magic 2 (spells 10% cheaper) waits for the skills.

Mana is **per player, on the player**: in the save, in the player's record (in the light part with stamina, since it moves every step it regenerates), and in `game.syncParts`' player text.

## 6. Poisons

**A poison is never drunk.** It has no Drink; its belt key, in any slot, says "Poison isn't for drinking. Use it on a blade or on arrows." and does nothing else; its card says **Use** on a blade or on arrows.

**It goes on through Use** (Michael: "a perfect case for our 'use' system"), two rows in `data/interactions.json`:
- **Use poison on a blade** coats it: an edged melee weapon (an item whose `repair` block says `edged`: the arming sword, the dirk, the hatchet, the scythe; *default*), in a hand, on the belt, or in the bag. The weapon's entry carries `poison: { tier, hits }`, **ten landed hits** (*default*); a swing that lands spends one hit however many it strikes, and every body it strikes is poisoned. A miss spends none. A new coat replaces the old one. The card says "Poisoned: 7 hits left." (strong: "Strongly poisoned").
- **Use poison on arrows** makes **five poisoned arrows** from five plain arrows (fewer from a smaller stack, the whole vial spent either way; *default*): new items, `poison_arrow` and `strong_poison_arrow`, as the fire arrow is made by Dip (`burn.js`). A bow draws a poisoned arrow before a plain one, after a fire arrow; fire and poison do not mix (poison on a fire arrow is "Nothing interesting happens").

Either way the vial comes back empty, as from a drink.

**Two tiers, and stacks** (*defaults:* the numbers, levers in `data/combat.json` `poison`):
- **A poison status on a body,** the dead's, a wild animal's: each poisoned hit adds a stack, **up to three**, and refreshes the timer, ten seconds; it runs out by itself.
- **Ordinary poison** drains 1, 2, 3 a second at one, two, three stacks (at most 30 from one full timer); **strong poison** 2, 4, 6 (at most 60). A strong hit lifts the status to strong; an ordinary hit on a strong status adds a stack and keeps it strong.
- **Poison is not fire:** it never spreads, lights nothing, and stands beside a burn, each its own.
- **It works on the dead** (Michael approved the recommendation: herb-magic poison rots the dead too; nearly every enemy is dead, so a poison that spared them would be pointless). It works on wild game; a tame animal is struck only as the blow rules already allow (`45`).
- **Potions 6** (stronger potions, +20%) lifts both tiers, when the skills come.
- **Seen:** a poisoned body is tinted green, pulsing with its stacks, and its ticks show as the floating numbers a hit shows (`docs/39` section 12). A player is never poisoned by this system.

## 7. Throwing: the splash

**Every potion and poison generalizes to a splash** (Potions 7, open until the skills): a potion held in a hand is thrown as a throwing knife is (a `thrown` block on the item, the main hand's or the off hand's attack as the knife's), flies as every thrown thing does (`archery.js`), and **shatters where it lands**, the vial gone, with an effect about **1.5 tiles** across (*default*, a lever).
- **Healing** heals and **mana** restores every player and villager in the area by the drunk amount; **stamina** fills theirs. It reaches the thrower too when they stand in it.
- **Poison** puts its stack on every one of the dead and every wild animal in the area, each as one poisoned hit.
- **A harmful splash never hurts a player** (cozy), and never a villager or a tame animal.
- *Someday* (`docs/05`): healing that hurts the dead.

**Seen and heard:** a burst of the potion's colour and a stain on the ground that fades in two seconds (the client's own drawing from the flight's end), and the shattering sound with that burst as its twin.

## 8. Inside the laws

- **Never harder on a clock:** potions never spoil, mana only regenerates, the herbs come back at their steady count (`46`).
- **Every item a hover card** (`CLAUDE.md`): the unfired vial, the clay vial, five potions, two poisoned arrows, the cauldron's made entry, each with its name and direct uses read from the data; a coated blade's card says its coat.
- **Item art as a pair:** every new item gets dev art in-world and an icon from one design (a vial of the potion's colour, the poisoned arrows as the fire arrow's with a green head), and the potions, held, a 38 by 38 portrait; the cauldron a dev box until its art is drawn. The drawn pairs are owed in `docs/26`.
- **Sound with a visual twin** (`docs/40`): the cauldron's bubbling and a brew done (the station's own done line), not enough mana (the bar's flash), a potion shattering (the burst), the altar's prayer (the bars filling).
- **Every lever listed:** each default number above has its line in `42`.

## 9. The guest's side (every step)

- **Mana:** the host's step regenerates and spends it; a guest's replica draws its own bar from its player's record; a guest's cast is refused on the host by the same rule, and its prediction refuses on its own bar so the draw never starts on the guest alone.
- **Brewing** is the station's queue, already a guest's through the `craft` verb and the station panel's commands; the cauldron's fire is the oven's verbs (`light`, `feed`).
- **Drinking** runs through the paths food uses (the belt key event, the bag's handlers in `ui/inventory-actions.js`, by the entry's uid); the cooldown lives on the player.
- **Use poison** runs through `use.applyWith`, a guest's by the entry's uid and the target's uid or address; the coat rides on the entry in the player's record and in `syncParts`' entry text.
- **The poison status** is on the dead's and the animals' records (their deltas), stepped by the host alone; the tint is drawn from it.
- **The splash** is a thrown flight: its launch and its end reach a guest as every flight's do (`arrows: { go, end }`); the effect is the host's, its burst drawn by each client from the end record.
- Each step bumps `net.PROTOCOL` if it changes the frame's shape (merged on review, `02`, 2026-10-25), and is tried in two tabs with `check("sync")`.

## 10. Build steps

1. **Mana** (#\_\_): the bar, regeneration, `mana` on the Fireball's spell (and the staff's), the refused cast with its line and flash, the altar's Pray. `check("mana")`.
2. **Vials, the cauldron, and drinking** (#\_\_): the unfired vial and the clay vial (the workbench, the oven), the cauldron (the witch's placed at the mere, your own made at the anvil, its fire), the five recipes, the healing, stamina, and mana potions drunk (the belt, the bag, the menu, the cooldown, the vial back), their cards and dev art. The two poisons are brewed here and carded "Use on a blade or on arrows" with no use yet. `check("potions")`.
3. **Poisons** (#\_\_): Use on a blade and on arrows, the coat on the entry, the poisoned arrows, the poison status on the dead and game, its tint and numbers. `check("poison")`.
4. **Throwing** (#\_\_): potions held and thrown, the shatter, the splash's effects and its burst. `check("splash")`.
