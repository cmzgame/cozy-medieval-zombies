# 05 — Someday

Things Michael wants kept possible but not scheduled. Nothing here is a plan. The rule for code: **do not write anything in a way that forecloses these cheaply.** When a design choice would make one of them expensive, say so before making it.

Started 2026-10-08.

- **Quests and RPG-like elements.** Part of the original medieval wish. Never say never, but the game has to be playable, fun, and content-rich first. NPCs with lines, routines, and bags are the groundwork; a quest is a line plus a check plus a reward, and all three exist by then.
- **NPC relationships and trade.** A vendor you keep alive sells cheaper, "yadda yadda", miles down the road. Bags on NPCs are the groundwork.
- **Roofs.** Drawn and hidden when inside. Not for the probe, no real art yet. Nothing in the renderer may assume buildings are open to the sky forever.
- **Upper floors.** Single storey first; tile data carries a layer index from day one. Z-layers in the chunk or separate areas via stairs, decided after the probe.
- **Building and expanding.** Find a castle and expand it. Kept open at zero cost by walls-as-tiles and flood-fill rooms. Also the dev tool: a creative mode that places tiles is how the village gets authored. Question 14 in `02-decisions.md`.
- **The countryside.** Block storage allows the world to grow past the village. Authored places, generated fields between. Question 9 in `02-decisions.md`.
- **A zoom-out.** Integer scaling makes it awkward. Revisit if the village feels cramped at Zomboid's 100 percent.
- **Infection, treatable.** The cozy parent's "not now, not never". Moodles leave the door open with a queasy icon that might be bad stew or might be the bite.
- **Armour.** More slots of the shield's shape. The sibling's post-1.0 note.
- **Warmth and cold.** The sibling had a cold moodle the fireplace answers. Here fire is already everything; a winter would make it more so. Not scheduled.
- **Low-fantasy headroom.** A cursed blade, a staff, something in the woods. The setting allows it; nothing asks for it.
- **Animals.** Hunting, a goat, a chicken. The sibling's entity-registry idea. Farming comes first.
