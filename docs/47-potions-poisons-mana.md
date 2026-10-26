# 47 — Potions, poisons, and mana

**Status, 2026-10-25: a spec, ruled by Michael in session (`02`, 2026-10-25, Potions, poisons, and mana ruled); nothing built; filed as #480 to #483.** He was shown every recommendation below and answered: "I actually do not have a single change to suggest now. Anything that might need to change from the spec can be discovered in playtesting." He added that a poison goes on a blade or on arrows through the Use system: "I forgot about arrows and blades, that is a perfect case for our 'use' system." Written from `origin/main` at cee2c2e. Four build steps, one issue each, in order.

**What is his and what is a default:** everything Primary recommended in the sitting is his ruling: the clay vial, clean water, two of a main herb and one secondary, the recipes, the cauldron over a lit fire and never on the go, mana 100 regenerating a point every three seconds, the mana potion's 50, the altar's refill, the Fire Bolt's 20 and the costs' rule of thumb, poisons never drunk, a coat of about ten hits and about five arrows a vial, two tiers, three stacks, poison on the dead, the splash about 1.5 tiles across that never hurts a player. A **default** is Primary's, a number or a reading the sitting did not name, marked where it stands, Michael's to overrule. Skill gates are open to all until the skills are built (`docs/39` section 9), and a level that adds a bonus (two a brew, stronger potions) waits for them.

## 1. Why, in Michael's words

Potions, poisons, and mana are one sitting because they are one loop: herbs gathered across the map (`46`), brewed at a cauldron, spent in a fight. Michael's worry was the supply: "there needs to be some real busywork for this besides just finding herbs and bringing them home, else people are going to be drowning in potions." And spells are "costed according to their power": the Fire Bolt "no longer two shots zombies, but its burn effect matters if spread out and it's a light utility. So maybe 20 mana?"

The spell is the Fire Bolt (`02`, renamed from the Fireball); in the data it is still the book of fire's spell named "Fireball" (`book_of_fire.book.spell`), which a build may rename.

## 2. The busywork: vials, clean water, herbs, a cauldron

No glass and no sand: **a vial is earthenware**, under the clay ruling already made (2026-10-23, `docs/39` sections 3 and 5.7: clay shaped at the workbench and fired in any oven, no kiln). One healing potion asks for the whole chain:
- clay dug at the river with a shovel (`46`), shaped into vials at the workbench and fired in an oven;
- a waterskin filled and boiled at a fire (`44`): **a potion needs clean water**, so the water system has a second job;
- herbs found across the valley; they are never farmed (`46`: "like weeds", no herb patch);
- a brew at a cauldron over a lit fire, which takes time.

Two rules keep the supply sane:
- **Drinking leaves the empty vial**, so a vial is refilled, not remade.
- **Throwing shatters it** (section 7), so a splash costs a vial.

**The vial** (*defaults:* the counts): one clay shaped at the workbench makes two unfired vials (Crafting 1, the clay's Mining 3 recorded); an unfired vial fired in any oven is a **clay vial** (the empty one); 1 by 1, stacking 10. An empty vial has no use but the brew. An unfired vial is its own item so the oven's time is the busywork it should be.

## 3. Brewing at a cauldron

**Never on the go:** brewing is at a cauldron over a lit fire, never in the field.
- **The witch's cauldron** at the mere is the first, and she teaches Potions (ruled 2026-10-19). Step 2 places the cauldron where her cottage will stand, on the lane to the mere (`tools/mapgen/valley.py`); the cottage, the witch, and her garden come with the map sitting (#92). It is authored, so it is no player's made thing and is never carried (`carry: false`); it is not a village station (*default*): the world rule Village stations hides the village stations' recipes in a Fixed world, the default, and must not hide the cauldron's.
- **Your own cauldron** is made at the anvil (Michael approved the recommendation; *default:* three iron bars, a smith's hammer carried) **as an item, the Cauldron**, which goes into the bag as anything made does, so it gets home in the bag (*default*): a prop whose fire burns fuel is never lifted (`placement.canCarry`), and the workstations of your own are not carried (`docs/45`, The evening's defaults ruled). Place sets it down from the bag through `setdown.js`, as the campfire and the torch post are (*default:* `stand: "ground"`, indoors or out, on a tile a body could walk), and **Pick up** gives the item back while it is out and its queue and output are empty, as the campfire's does (`campfire.js`) (`docs/39` section 2: Woodcutting 7 unlocks, recorded, not enforced). Its recipe names no world rule, so it is open in every world. `docs/39` sections 2 and 3 are changed to say the anvil.

**The cauldron is one prop with its fire under it** (*default*): a station with a `fire` block as the oven has one. It burns logs (`maxFuel` 3, `hoursPerUnit` 2, as the oven), is lit with a flame (a tinderbox or a lit torch) and fed by hand, and brews only while lit; a job waits at the head of its queue while it is out, as the oven's does. It does not cook (`cooks: false`, as the forge and the clamp), so it boils no water and bakes nothing: one station, one job.

**A recipe is two of its main herb, one secondary, one clay vial, and one draught of clean water.** The draught is a new kind of ingredient: the recipe row's `water`, the amount (*default:* 10 of a skin's 100), drawn from the `fill` of clean waterskins the brewer carries (the bag, the belt, the hands; never a container nearby, never a tainted skin), taken with the other ingredients when the brew is started, as they are; without enough clean water the Make is refused with why, "Potions need clean water." Each brew makes one potion in 20 seconds (*default*); Potions 2 (healing two a brew) and Potions 9 (one more a brew) make more from the same herbs, each extra potion taking its own vial and draught, when the skills come. The recipes live in `data/recipes.json` at the station `cauldron`, so the station panel lists them as it lists the oven's.

**Each potion has its own main herb, and the secondaries cross between recipes,** so every herb has a job without everything being interchangeable:
- **Healing potion:** 2 yarrow, 1 sage (Potions 1).
- **Stamina potion:** 2 nettle, 1 pot of honey (Potions 3).
- **Mana potion:** 2 mageroot (`mana_herb`), 1 mushroom (Potions 4).
- **Poison:** 2 nightshade, 1 grave moss (Potions 5).
- **Strong poison:** 2 wolfsbane, 1 grave moss (Potions 5).

Feverfew and salt are left out on purpose: a feverfew tonic slowing the infection's stages is a someday (`docs/05`; the cure is the late Divine Potion), and salt is earmarked for salting food. **The supply, by the counts in `46`:** about 16 yarrow in the valley, back one to two days after picking, is about four to eight healing potions a day for a player who combs the whole valley. **Grave moss is 4 nodes**, all in the graveyard, so poison is the rarest thing here; its count is a lever (`42`) for the playtests to move.

## 4. The potions, drunk

**Drinking** (*defaults*, but the mana potion's 50, each a lever in `data/tuning.json` `potions`):
- **Healing:** 40 health at once (of 100), the only big heal (ruled: food heals a little, at most ten; potions big). It does not close a wound or touch the infection.
- **Stamina:** fills the bar and doubles its regeneration for 30 seconds: a buff, shown in the debuff row in gold as `docs/39` section 12 puts buffs (`player.buffs`, beside `player.bleed` and `player.sick`).
- **Mana:** 50 mana at once (section 5).
- **A potion between drinks:** 10 seconds of the sim clock after any potion before the next takes effect, per player (`player.potionAt`, the sim time of the last), so three potions are not a 120-health swallow; a drink is refused with why, "You can't drink another potion yet.", and a splash counts too (section 7).

**The ways to drink one** are food's (`docs/39` section 5.6): the belt key of a slot that consumes, a double-click in the bag, and its menu's **Drink** in the bag, on the belt, or in a hand. Under the belt's roles (`02`, 2026-10-25, The belt's slots have roles; #478, open as this is written): **until step 4 a potion is not holdable,** so every belt slot's key drinks it, as food's does; **from step 4 a potion can be held to throw it** (section 7), so in the utility slot its key drinks it and in a hand slot its key draws it into that hand, as the belt's rule says of anything holdable; the hand's menu and the bag drink it then. The empty vial goes back where the potion was when that place is free (the belt slot, the hand, the bag cell), else into the bag, else at the feet with "Your bag is full: the vial is at your feet."

**A potion stacks** (*default:* five, 1 by 1); drinking from a stack leaves its vial in the bag. Potions never spoil (rot, when it comes, is for food).

## 5. Mana

- **A bar of 100**, under stamina, in blue (`player.mana` in `data/tuning.json`, as `player.stamina` is), raised later by gear and by Faith 4, as health will be; a player's own maximum, when gear raises it, rides in the heavy part of the record as `maxStamina` does.
- **Regeneration is slow:** one point every three seconds of the sim clock (`player.manaRegen` 0.333 a second), full in five minutes from empty.
- **The mana potion** gives 50 (section 4).
- **Praying at an altar** refills mana and stamina (Faith 1, recorded, not enforced): the **Pray** verb (`verbs.js`, by the altar's prop id) on the chapel's altar (`data/sprites/altar.json`, today decoration), a timed bar of 3 seconds (*default*) as the boil's is, no cooldown; the walk to the chapel is its cost.
- **Casting costs mana.** The cost is on the spell in the data, `mana` on a book's `spell` (today the one spell, `book_of_fire.book.spell`, the Fire Bolt: 20; the staff of fire casts nothing of its own). A cast is refused before its draw starts when the bar cannot pay, with the log line "Not enough mana." and the bar's flash (the visual twin of the not-enough-mana sound, `docs/39` section 13); mana is spent when the spell is released, never on a cancelled draw.
- **The rule of thumb for the spells to come** (`docs/39` section 9, Magic): a utility like Kindle 5 to 10, a bolt about 20, the big ones like Pyroblast 35 or more. Magic 2 (spells 10% cheaper) waits for the skills.

## 6. Poisons

**A poison is never drunk.** It has no Drink. Until step 4 it is not holdable, so its key in any belt slot says "Poison isn't for drinking. Use it on a blade or on arrows." and does nothing else; from step 4 it can be held to throw (section 7), so a hand slot's key draws it and the utility slot's key says the line. Its card says **Use** on a blade or on arrows.

**It goes on through Use** (Michael: "a perfect case for our 'use' system"), rows in `data/interactions.json`:
- **Use poison on a blade** coats it. A blade is an item tagged `blade`, a new tag (*default:* the arming sword, the dirk, the hatchet, the scythe, and the throwing spear, the items whose `repair` block says `edged`), so the row's `on` is the tag, in a hand, on the belt, or in the bag. The weapon's entry carries `poison: { tier, hits }`, ten landed hits; a swing that lands spends one hit however many it strikes, and every body it strikes is poisoned; a thrown spear's landing hit spends one. A miss spends none. A new coat replaces the old one. The card says "Poisoned: 7 hits left." (strong: "Strongly poisoned").
- **Use poison on arrows** makes **five poisoned arrows** from five plain arrows (fewer from a smaller stack, the whole vial spent either way): new items, `poison_arrow` and `strong_poison_arrow`, as the fire arrow is made by Dip (`burn.js`). A bow draws a poisoned arrow before a plain one, after a fire arrow; what it hits is poisoned; it lands or lodges as a plain arrow, as the fire arrow does. Fire and poison do not mix: poison on a fire arrow, and a poisoned arrow held to a fire, are "Nothing interesting happens".

Either way the vial comes back empty, as from a drink.

**Two tiers, and stacks** (*defaults:* the drain and the timer, levers in `data/combat.json` `poison`):
- **A poison status on a body,** the dead's or a wild animal's (`poison: { tier, stacks, left }` on its record): each poisoned hit adds a stack, **up to three**, and refreshes the timer, ten seconds; it runs out by itself.
- **Ordinary poison** drains 1, 2, 3 a second at one, two, three stacks (at most 30 from one full timer); **strong poison** 2, 4, 6 (at most 60). A strong hit lifts the status to strong; an ordinary hit on a strong status adds a stack and keeps it strong.
- **Poison is not fire:** it never spreads, lights nothing, and stands beside a burn, each its own.
- **It works on the dead** (Michael approved the recommendation: herb-magic poison rots the dead too; nearly every enemy is dead, so a poison that spared them would be pointless). It works on wild game; a tame animal is struck only as the blow rules already allow (`45`).
- **Potions 6** (stronger potions, +20%) lifts both tiers, when the skills come.
- **Seen:** a poisoned body is tinted green, pulsing with its stacks, and its ticks show as the floating numbers a hit shows (`docs/39` section 12). A player is never poisoned by this system.

## 7. Throwing: the splash

**Every potion and poison generalizes to a splash** (Potions 7, open until the skills). From step 4 a potion or a poison is holdable in either hand (`hands: "either"`), and **thrown from the main hand on its other mode** (middle or Q, `docs/21`), as the throwing spear is (a `thrown` block on the item; the spear is the one thing that throws today, `archery.js`); held in the off hand it is only held, and the main hand's left click with it does nothing (it has no swing). It flies as every thrown thing does and **shatters where it lands**, the vial gone, with an effect about **1.5 tiles** across (a lever).
- **Healing** heals and **mana** restores every player and villager in the area by the drunk amount; **stamina** fills every player's (villagers have no stamina). It reaches the thrower too when they stand in it. **A splash counts as a drink** for each player it helps: one within the 10 seconds after a potion gets nothing from it, and it starts the 10 seconds for each it does help, so a splash at your own feet is no way round the rule.
- **Poison** puts its stack on every one of the dead and every wild animal in the area, each as one poisoned hit.
- **A harmful splash never hurts a player** (cozy), and never a villager or a tame animal.
- *Someday* (`docs/05`): healing that hurts the dead.

**Seen and heard:** a burst of the potion's colour and a stain on the ground that fades in two seconds (the client's own drawing from the flight's end), and the shattering sound with that burst as its twin.

## 8. Inside the laws

- **Never harder on a clock:** potions never spoil, mana only regenerates, the herbs come back at their steady count (`46`).
- **Every item a hover card** (`CLAUDE.md`): the unfired vial, the clay vial, five potions, two poisoned arrows, and the cauldron made at the anvil, each with its name and direct uses read from the data; a coated blade's card says its coat.
- **Telling potions apart in opaque clay** (Michael, 2026-10-25: glass shows the colour, "Clay is famously quite opaque"; *default*, Primary's answer, his to overrule): the vial's body stays earthen, and **the potion's colour is on its wax seal and a glazed band round its shoulder**, red for healing, gold for stamina, blue for mana, green for poison, and a darker green with a black seal for strong poison, so it reads at icon size as glass would and stays true to the clay. The empty vial is bare, unsealed and unglazed.
- **Item art as a pair:** every new item gets dev art in-world and an icon from one design (the vials as above, the poisoned arrows as the fire arrow's with a green head, the strong one's darker as its vial is), and the potions and poisons, held from step 4, a 38 by 38 portrait; the cauldron a dev box until its art is drawn. The drawn pairs are owed in `docs/26`.
- **Sound with a visual twin** (`docs/39` section 13, which lists them; their slots are added to `docs/40` and `data/sounds.json` as each step builds): the cauldron's bubbling and a brew done (the station's own done line), not enough mana (the bar's flash), a potion shattering (the burst), the altar's prayer (the bars filling).
- **Every lever listed:** each number above has its line in `42`, with where it lives.

## 9. The guest's side (every step)

- **Mana:** the host's step regenerates and spends it; it is in the save, in the player's record (the light part, with stamina, since it moves every step it regenerates; a raised maximum in the heavy part), and in `game.syncParts`' player text, rounded as `hp2` rounds health. A guest's replica draws its own bar from its record; a guest's cast is refused on the host by the same rule, and its prediction refuses on its own bar so the draw never starts on the guest alone.
- **Pray** is a verb in `verbs.js` by the altar's prop id, so a guest's command and the host's click meet the same rule; its timed bar is the boil's (`args.timed`), its end running the verb again on the host.
- **Brewing** is the station's queue, already a guest's through the `craft` verb and the station panel's commands; the cauldron's fire is the oven's verbs (`light`, `feed`). Your own cauldron is made by `craft` into the bag and set down by the set-down path (`setdown.js`, a guest's `setdown` command by the entry's uid), and picked up by its menu's Pick up, as the campfire's.
- **Drinking** runs through the paths food uses (the belt key event, the bag's handlers in `ui/inventory-actions.js`, by the entry's uid). The time of the last potion (`player.potionAt`) and the stamina buff (`player.buffs`, its time left to two decimals as `player.sick`'s) are on the player: in the save, the player's record, and the player text.
- **Use poison** runs through `use.applyWith`, a guest's by the entry's uid and the target's uid or address. The coat rides on the entry wherever it is: the player's record and `syncParts`' entry text (`entryText`, as `wear` and `repairs` are), the save, and an entry left in a chest or on a body (a container's bag saved and sent with its chunk, as every entry's fields are).
- **The poison status** is on the dead's and the animals' records (their deltas), stepped by the host alone; it is in the save and in `syncParts`' `dead` and `animals` parts; the tint is drawn from it.
- **The splash** is a thrown flight: its launch and its end reach a guest as every flight's do (`arrows: { go, end }`); the effect is the host's, its burst drawn by each client from the end record.
- Each step bumps `net.PROTOCOL` if it changes the frame's shape (merged on review, `02`, 2026-10-25), and is tried in two tabs with `check("sync")`.

## 10. Build steps

1. **Mana** (#480): the bar, regeneration, `mana` on the Fire Bolt's spell, the refused cast with its line and flash, the altar's Pray. `check("mana")`.
2. **Vials, the cauldron, and drinking** (#481): the unfired vial and the clay vial (the workbench, the oven), the cauldron (the witch's placed at the mere, your own made at the anvil, its fire, the recipes' `water`), the five recipes, the healing, stamina, and mana potions drunk (every belt slot's key, the bag, the menu, the 10 seconds, the vial back, the stamina buff in the row), their cards and dev art. The two poisons are brewed here and carded "Use on a blade or on arrows" with no use yet; their key says the line in every slot. **Placing the witch's cauldron in `valley.py` changes the map**, so the world's hash (`node tools/world.js`) and the save cache's proof (`node tools/savecache.js`) move with it, said in the pull request. `check("potions")`.
3. **Poisons** (#482): the `blade` tag, Use on a blade and on arrows, the coat on the entry, the poisoned arrows, the poison status on the dead and game, its tint and numbers. `check("poison")`.
4. **Throwing** (#483): potions and poisons held (`hands: "either"`, the belt's hand slots now drawing them, their portraits) and thrown from the main hand's other mode, the shatter, the splash's effects, the splash counting as a drink, and its burst. `check("splash")`.
