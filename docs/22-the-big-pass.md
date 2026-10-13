# 22 — The big "what should we add" pass: stations, tools, seeds, durability

**Status: superseded on 2026-10-12 by `30-the-big-pass-spec.md`, the spec written from this list, `29-world`, and Michael's answers (`02`, "The big pass answered"); kept as the record of the brain-dump and its first rulings. Was: a draft to-do list with open questions, not a spec (Michael's brain-dump of 2026-10-12, turned into a list). Nothing here is built. Every question marked Q is for Michael before the step it belongs to.**

## What Michael wants in the pass

- **Stations:** a **smith**, a **cooking** station, and a **crafting** station, each with its own interface.
- **A wheelbarrow**: immovable storage, "a giant immovable crate".
- **Seeds** for each crop (cabbage, garlic, potato, pumpkin, rye exist as crop art).
- **Many tool models**.
- **A rigorous way to handle item interactions** (use this on that, combine, put on a station), so the many items do not become special cases.
- **Many items and objects, large inventories, and the bookkeeping that comes with them**: that is how he wants to play (the Zomboid appeal). Not to be trimmed to spare the player; the thing to watch is performance, which Claude flags as it appears (below).

## Rulings made along the way (2026-10-12, also in `02`)

- **Weapon durability is a one-way, permanent bar.** A weapon has a durability that **only goes down**, **only on a hit that lands (a miss never wears it: a fairness rule, Michael is very sure)**, and **when it reaches zero the item evaporates**. **No repair, no mending** ("there's no duct tape in medieval times"), **no gradual dulling**: a weapon works the same until it is gone. If that feels too strong, tune it later. Not "break after a few zombies like Zomboid"; a stick or a plank may well be short-lived.
- **So the supply side is the balancer.** With no repair, weapons are consumables, and **the smith and the crafting stations are where weapons come from**; durability, craft cost, and what the materials cost to find are one knob together. This replaces Claude's earlier "repair at a station" idea, which is withdrawn.
- **Dual wielding and durability:** wear per landed hit splits across two weapons, so per kill the cost is the same; if the off hand should cost more material than the main (the sick damage at a price), it is a deliberate rule, an off-hand wear multiplier, to add if wanted.
- **A weapon breaking in a crowd is not a worry now** (the dead die too fast to be a crowd). If it ever becomes one, that is the sign something else has swung too far and should ease.
- **Performance:** Michael is to be told when it becomes a concern.

## A first order of work (a suggestion)

1. **The foundation: item interaction and recipes.** A small set of verbs (use X on Y, combine, put on a station, tool on a resource), item **tags** (metal, cloth, wood, heat), and a data format for recipes per station, so adding an item is data. Q1, Q2, Q3.
2. **The crafting station**, with the first recipes (a bandage from cloth, boards; a plank from a log is already the `splitsInto` rule), proving the format.
3. **The smith and durability together**: the durability bar, the wear on hit, the evaporation, and the smith as the source of weapons. Q5.
4. **The cooking station** (food from what grows and what is foraged; mushrooms are a candidate cure ingredient: `05`, "Infection, treatable").
5. **Seeds and farming** (the crops already have growth-stage art). Q6.
6. **The wheelbarrow, and the tools** (each tool an item with held art and a verb). Q7, Q8.

## Questions for Michael

- **Q1. How are stations used?** A placed object (the build palette, `13`), then `E` or a click opens a panel: Zomboid-style crafting from your bag and **nearby containers**, or only your bag? Does a craft take time (the search bar's way) and can it be interrupted? Do stations need fuel or a fire (the smith, the cooking station)?
- **Q2. Recipes: known from the start, or learned?** (Found in books, taught by a villager, discovered by combining.) This decides whether the recipe list is one file or an unlock system.
- **Q3. Item interactions: how does the player say "use this on that"?** Options: a "Use X on..." in the item's menu followed by a click on the target; dragging an item from the bag onto a world object or another item; the right-click menu on the target listing what the held tool can do (what exists for trees today). Claude's lean: the target's menu lists the verbs your hands enable, plus drag-onto for item on item.
- **Q4. Materials and gathering:** what are the raw materials (iron ore and ingots? cloth, leather, wood tiers, herbs and mushrooms), and are they **gatherables** (the wobble and outline law applies to resource nodes)?
- **Q5. The durability ladder:** rough hits-to-break by tier, as a first guess to tune: stick and plank a few dozen hits, hatchet and spear a couple hundred, sword and mace more, the halberd by its size. And **how it shows**: a thin bar on the item's grid icon, a warning when low?
- **Q6. Farming:** the loop (plant, tend or water, grow over days on the clock, harvest), and do seeds come from crops, from loot, or both?
- **Q7. The wheelbarrow:** one big grid (bigger than a chest), immovable (`carry: false`), one sprite; any twist (a half-open top, a cart that can be pushed later)?
- **Q8. Which tools, and what does each do?** (Shovel, pickaxe, hoe, scythe, knife, ladle, tongs, hammer...) and which of them are also weapons (the plank and stick already are).
- **Q9. Art:** placeholders first as always (`CLAUDE.md`), but which of these should get art requests for Claude Design early (the stations, the wheelbarrow, the tools)?

## Performance, for the record (Claude's watch list)

Many items are cheap: the grid and the bag are plain DOM and data. **The one measurable pressure is the sprite atlas** (`gl.atlasInfo()`, 56 percent of a 4096 square on a fresh page): a 32 px held-item picture costs almost nothing, but a long weapon is a bigger sheet (the halberd's 128 px frames are about 1.5 percent of the whole atlas by themselves), and every new station, tool, crop stage, and dressed character is a sheet too. Fine for dozens, to be watched at hundreds; the fix when needed is a taller atlas or a second page (noted in `19`). The other thing is a **crafting menu with hundreds of recipes**, which is a UI design question before it is a speed one.
