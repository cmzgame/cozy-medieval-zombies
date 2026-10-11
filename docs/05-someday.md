# 05 — Someday

Things Michael wants kept possible but not scheduled. Nothing here is a plan. The rule for code: **do not write anything in a way that forecloses these cheaply.** When a design choice would make one of them expensive, say so before making it.

Started 2026-10-08.

- **Quests and RPG-like elements.** Part of the original medieval wish. Never say never, but the game has to be playable, fun, and content-rich first. NPCs with lines, routines, and bags are the groundwork; a quest is a line plus a check plus a reward, and all three exist by then.
- **NPC relationships and trade.** A vendor you keep alive sells cheaper, "yadda yadda", miles down the road. Bags on NPCs are the groundwork.
- **Roofs.** Drawn and hidden when inside. Not for the probe, no real art yet. Nothing in the renderer may assume buildings are open to the sky forever.
- **Upper floors.** Single storey first. Since 2026-10-09 every lookup, chunk key, light cache, and entity carries a layer, always 0. Assessed after the WebGL renderer landed, from easiest to hardest: (1) data, a building's `floors` list placing layer-1 tiles, walls, and props the same way, plus a `stairs` opening; (2) drawing, every layer-1 vertex lifted one storey (64 px) and sorted as if one tile nearer on each axis, which is what a storey of height is worth in this projection; (3) hiding, every layer above the player's while the player is indoors, which is also the roof rule; (4) rooms and light per layer, which the keys allow and the flood fill needs told; (5) stairs as a two-tile ramp that moves an entity's layer, and the dead pathing across layers through them; (6) sight stays on your layer, other layers drawn present but fogged. The one new physics is light crossing floors: an upstairs window lighting the ground below. Nothing in the renderer or the data forbids any of it; stairs and cross-layer pathing are the bulk of the work, the renderer part is the smallest.
- **Building and expanding.** Find a castle and expand it. Kept open at zero cost by walls-as-tiles and flood-fill rooms. Also the dev tool: a creative mode that places tiles is how the village gets authored. Question 14 in `02-decisions.md`.
- **Zones, or biomes.** Regions of the map with their own register: the harvest village now, a Tirisfal-gloomy wood later with blue and purple trees, the plague doctor, scarecrow men. A zone is a rectangle with a palette and a scatter mix, which the scatter rule already half is. Michael's rule: harvest first, until the farming game is fun.
- **The countryside.** Block storage allows the world to grow past the village. Authored places, generated fields between. Question 9 in `02-decisions.md`.
- **A zoom-out.** Integer scaling makes it awkward. Revisit if the village feels cramped at Zomboid's 100 percent.
- **Infection, treatable.** The cozy parent's "not now, not never". Moodles leave the door open with a queasy icon that might be bad stew or might be the bite.
- **Armour.** More slots of the shield's shape. The sibling's post-1.0 note.
- **Warmth and cold.** The sibling had a cold moodle the fireplace answers. Here fire is already everything; a winter would make it more so. Not scheduled.
- **Low-fantasy headroom.** A cursed blade, a staff, something in the woods. The setting allows it; nothing asks for it.
- **Animals.** Hunting, a goat, a chicken. The sibling's entity-registry idea. Farming comes first.
- **The shuttered lantern.** A carried light you can hide without putting it out: the torch's upgrade, if the torch ever needs one. The carried-light term in `light.js` is a radius with an on flag, so a lantern is a second item with the same shape. Ruled out of Milestone 2 on 2026-10-09.
- **Candles.** The cozy parent's stealthy room light. Torches took their job here; a candle would be a tiny fire kind in the same table, and nothing stops one being added.
- **A great hall.** The hearth lights its whole room by one rule. A room big enough to make that silly wants a cap by room size, one line, when such a room exists.
- **Stub walls.** The near walls between the player and the camera drawn as low stumps instead of translucent full walls, the cozy parent's way. Lived on the `K` key beside the translucent walls from 2026-10-09 until the drawn walls came (2026-10-11), when the mode retired without art; Michael keeps the idea. Bringing it back needs cut-down segments per material and orientation (a cut cap, a door gap, window posts) and the stump drawing in `makeWall`.
- **A character gear screen.** Hand slots exist from Milestone 2 with the `main`, `off`, `both` designation on every holdable item; a gear screen is a view of them plus armour slots later.
