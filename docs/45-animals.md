# 45 — Animals: game in the woods, livestock in pens, hunting, keeping, and what they give

**Status, 2026-10-25: a spec, ruled by Michael in session (`02`, 2026-10-25, Animals ruled; #289). Not built.** Written from `origin/main` at a0b6776. Five build steps, one issue each, in order (the companion, step 5, after the demo). A **default** is Primary's, Michael's to overrule; the rest is his ruling. Beastlore's ten levels are ruled already (`docs/39` section 6); every gate here is open to all until the skills are built.

**Today:** no animals at all; the chicken coop is a container with a placeholder table (`data/loot.json` `coop`). Cheese is found, never made; feathers, leather, and wool wait for this.

## 1. Which animals, and where

- **Seven kinds in the valley:** hens, rabbits, deer, cows, sheep, pigs, and boar, with your own beehives (built, `docs/43` section 6). The snow region's beasts wait for that region.
- **Wild game lives mostly in the woods ringing the valley, never fenced in by a rule** (Michael: "let's be careful about restricting game to certain areas. It would be a problem if most of the deer were clumped in the city center ... but that also does not mean they can never leave the forest"). Deer spawn in herds of two to four and rabbits near the forest edges, and wander from there as any animal would; a deer may cross a field, a rabbit may come into the village. *Default:* each species has a home (a wood, an edge) it drifts back toward, not a wall.
- **Game comes back slowly, up to a cap per wood** (*default*), as the fish of a water do: hunting is renewable, never endless, and it is renewal, not a danger on a clock.
- **Your first livestock comes from the farms:** Hollow Farm keeps hens, Long Acre a few cows, sheep, and pigs. At the Beastlore level for the kind (hens 1, cows and sheep 4, pigs 7), a player leads one home on a **lead**. **A pen is any fenced yard with its gates shut** (the fences of `docs/09`): a led animal let go inside one stays.

## 2. Hunting

- **Deer flee on sight**, from a player and from the dead. **Boar fight back** when a player attacks one, a short charge and a bite, so the danger is the player's choice; deer and rabbits never fight.
- **The weapon decides the yield** (ruled): the bow the full yield, a melee weapon less, a halberd ruins the kill.
- **Snares** catch rabbits: made at the workbench (Crafting 1; set at Beastlore 3), set on the ground near the woods, holding a rabbit after a while (*default*). Bow and snares both work, so hunting touches Ranged without needing it.
- **Skinning and butchering** need a dirk carried: raw meat, hides, and feathers.

## 3. Keeping animals

- **Penned animals never starve and never die of neglect:** nothing punishes being away.
- **Fed animals produce; unfed ones simply stop.** A **feed trough** in the pen (*default:* built from the palette, planks) is filled with grain or vegetables; fed animals produce on a daily cycle: hens an egg, cows milk with a bucket carried, sheep wool with **shears** carried (shears made at the anvil, Blacksmithing 1).
- **Feathers are generous, so arrows can be farmed** (Michael: "If bow and arrow is supposed to be usable as a staple item, we should probably be a little more generous with feathers. Just so you can keep arrow production going and its ingredients farmable"). *Defaults:* a fed hen gives a feather most days besides its egg; a hen butchered gives three to five; a rabbit or a deer gives none. The arrow's fletching (Crafting 4, `docs/39`) costs one feather for five arrows.
- **Breeding** (Beastlore 6): two of a kind, fed, with room in the pen, make a young one every few game days, up to a cap per pen (*defaults*).
- **Livestock is safe:** the dead ignore animals, wild and tame; no zombie animals, no predators at the pens; only a player can hurt an animal. A cosy home stays cosy, and every rise in danger is one a player chose.
- **An idea, not ruled:** rabbits wandering into unfenced crops and eating them, a reason to fence a field (Michael: "Not sure if that is worth building, but an idea"). Filed in `05`.

## 4. What they give, and the recipes

- **Every product is an item** with its picture pair and hover card (the item-art and card laws): egg, milk, wool, hide, feather, and **raw meats:** venison, beef, mutton, pork, rabbit; bacon and lard from a pig (Beastlore 7). Animals themselves get Object Highlight and a name on hover.
- **Raw meat goes into recipes, and onto a fire as it is** (Michael: "I don't want a deer to yield only 'Cooked Deer Meat' to cooking, although throwing it directly in to cook should still be possible for the desperate or impatient"). *Defaults:* each raw meat cooks alone at a fire into its cooked meat; and goes, raw, into recipes: the plain pottage and the hearty stew (any meat), eggs and bacon, a meat pie at the oven, smoked meat at the smoking rack (Cooking 5), pemmican (meat, a plant, lard or honey; Cooking 7). Rot (#264) gives each raw meat its short life.
- **The rest:** cheese and butter from milk (Cooking 3, ruled); wool to yarn at the spinning wheel and woollen cloth at the loom (Crafting 6, `docs/43`); hides to leather at a tanning vat (Crafting 3, ruled); feathers into fletching (Crafting 4).

## 5. The companion (Beastlore 10; after the demo)

- **In 1.0, built last**, after the demo. Its shape is Michael's: follow, stay, and attack a target and come back; a left click on one of the dead sends it.
- **Its command item is not the lead** (Michael: "a lead does not make sense for sending an animal out to attack, unless it's REALLY long"): which item commands it is decided when it is built.
- **Bosses ignore interception** and keep their own target; ordinary dead switch to a companion in their way. **A companion that "dies" goes home hurt** and is back after a game day. One mechanic with the death school's thrall, later.

## 6. The guest's side (every step)

Animals are characters of the world, stepped on the host as the dead and the villagers are: in the frame as a delta with a roster (as the dead's), in the save, in `game.syncParts`; their wander and flight read `loop.simTime()` and `rng`. Every verb (lead, let go, feed, collect, milk, shear, skin, butcher, set a snare, check a snare) is a verb in `verbs.js` or a menu label performed by the host by the animal's or prop's id; a pen's trough and a snare are props in their chunk; products land in the actor's bag or at their feet. Each step tries its features in two tabs with `check("sync")` and reads what it adds to a frame from `net.status().wire`; animals are many and move, so the wire's cost is measured, not guessed.

## 7. Build steps

1. **Animals in the world:** the animal character (species data in `data/animals.json`: speed, flee, home, yields), wander and flee, the dead ignoring them, Object Highlight and the name; deer and rabbits in the woods, the farms' livestock placed; renewal to a cap. A new `check("animals")`.
2. **Hunting:** kills by weapon and yield, skinning and butchering, the products as items with cards, boar that fight back, snares.
3. **Keeping:** the lead, pens, the feed trough, the daily produce (eggs, feathers, milk with a bucket, wool with shears), shears at the anvil, breeding.
4. **The recipes:** raw meat at a fire and in recipes, cheese and butter, bacon and lard, smoked meat, pemmican, woollen cloth, leather, fletched arrows.
5. **The companion,** after the demo.
