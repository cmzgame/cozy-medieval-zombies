# 05 — Someday

Things Michael wants kept possible but not scheduled. Nothing here is a plan. The rule for code: **do not write anything in a way that forecloses these cheaply.** When a design choice would make one of them expensive, say so before making it.

Started 2026-10-08.

One line per idea: what, who, when, and the one sentence on what must not be foreclosed. An idea that was built or ruled leaves this page for `history/05-someday-done.md`; the longer scopes behind some lines are `history/05-someday-scopes.md`. The tracking issue for all of them is wave 4 of the sweep (#70).

- **The big cart** (Michael, 2026-10-15): an immovable wagon that several horses pull, a big container you cannot lift, which the wheelbarrow had been mixed up with; the wheelbarrow is a container carried like a barrel (another wooden container's art, with or without more storage, as a crate is).
- **Quests and RPG-like elements.** Part of the original medieval wish. Never say never, but the game has to be playable, fun, and content-rich first. NPCs with lines, routines, and bags are the groundwork; a quest is a line plus a check plus a reward, and all three exist by then.
- **NPC relationships and trade.** A vendor you keep alive sells cheaper, "yadda yadda", miles down the road. Bags on NPCs are the groundwork.
- **Roofs.** Drawn and hidden when inside. Not for the probe, no real art yet. Nothing in the renderer may assume buildings are open to the sky forever.
- **Upper floors.** Single storey first; since 2026-10-09 every lookup, chunk key, light cache, and entity carries a layer, always 0, and nothing in the renderer or the data forbids a second one (what it would take, from data to stairs: `history/05-someday-scopes.md`).
- **Zones, or biomes.** Regions of the map with their own register: the harvest village now, a Tirisfal-gloomy wood later with blue and purple trees, the plague doctor, scarecrow men. A zone is a rectangle with a palette and a scatter mix, which the scatter rule already half is. Michael's rule: harvest first, until the farming game is fun.
- **Armour.** More slots of the shield's shape. The sibling's post-1.0 note.
- **Low-fantasy headroom.** A cursed blade, a staff, something in the woods. The setting allows it; nothing asks for it.
- **The shuttered lantern.** A carried light you can hide without putting it out: the torch's upgrade, if the torch ever needs one. The carried-light term in `light.js` is a radius with an on flag, so a lantern is a second item with the same shape. Ruled out of Milestone 2 on 2026-10-09.
- **Candles.** The cozy parent's stealthy room light. Torches took their job here; a candle would be a tiny fire kind in the same table, and nothing stops one being added.
- **A great hall.** The hearth lights its whole room by one rule. A room big enough to make that silly wants a cap by room size, one line, when such a room exists.
- **Stub walls.** The near walls between the player and the camera drawn as low stumps instead of translucent full walls, the cozy parent's way. Lived on the `K` key beside the translucent walls from 2026-10-09 until the drawn walls came (2026-10-11), when the mode retired without art; Michael keeps the idea. Bringing it back needs cut-down segments per material and orientation (a cut cap, a door gap, window posts) and the stump drawing in `makeWall` (`src/render/walls.js`).
- **Health potions** (Michael, 2026-10-12): liked, "needs to be balanced around, so just an idea for now". Bleed and bandages (`02`, question 29b) are the first step of making health matter.
- **Bleed from sources other than bites**, and a real infection (effects, cures, mushrooms and brewing as a fair way to mitigate, a clock that is never under about two in-game days to turn; the marker's 1.5 days in `data/combat.json` is "about two" for now, Michael, 2026-10-12): after the marker (`02`); by the one-dial rule, combat is eased only if the result does not feel balanced.
- **Endless, a permanent game mode** (Michael, 2026-10-13): the horde of `36` with supply to keep up, so efficient play really can go on (the dead's pockets as a supply line, a delivery at dawn, bodies that clear when unseen), and with it a leaderboard and the community things a score invites (Steam's leaderboards, `35`). Distinct from the demo, whose supplies last a few days by design.
- **Villagers who remember** (Michael, 2026-10-13: wanted, "way later", after 1.0): first-meeting lines and "oh, you again" from a per-character record of what was heard, on the player, in the save and the sync check; it writes only the talker's own record, never the world, so talk's law holds. Kept open by stable node ids in the talk data `34` proposes.
- **Scripted sequences** (Michael, 2026-10-13; a stretch goal): moments written ahead as a beat list of verbs on entities by id, run in the host's step, in the world and never as a cutscene, and never a rise in danger on a timer (`00`, Laws); kept open by entities addressed by id, villager movement callable with a goal, `say` generic, and world state a flag could later join (the scope: `history/05-someday-scopes.md`).
- **Spectating** (Michael, 2026-10-15; the first of multiplayer's later three, the core called Done without them, `02`): a dead player watches through their own body's sight until they choose New character or Exit game; keep the body a character with a position and a sight, and the dead screen a screen over a world still drawn.
- **Lighter frames on busy nights** (the second): an animation sent once as its name and its starting tick, and an interest radius per guest; measure first with `net.status().wire` on a night with the dead in numbers; keep every record keyed by id and every list's membership a roster, so a character can leave a guest's view and come back.
- **The bounded rewind** (the third): a guest's swing or arrow judged by the host against where things were when the guest saw them, up to 150 ms back (`31/04`); keep each character's last few positions cheap to keep, and the swing a command that carries the tick it was made at.

## From `02`'s open questions (2026-10-16)

- **Day counter as a score** (`02` question 10, since 2026-10-08): per survivor, alongside survivors, on the death card; the dead screen shows the day and hour and the Worlds row the day already, so what is left is a best run kept and shown.
- **Noise** (`02` question 18, since 2026-10-09): whether anything carries to the dead by sound; Michael doubts it fits the cosy idea, and with no guns little is loud; decide when something in the game is loud, and the bow stays quiet by design.
- **Gathering's remainder** (`02` question 27, since 2026-10-11): whether picked things regrow, and whether rocks block sight; what each gathering gives and its tool are `30` section 4.

## From `02` (2026-10-17)

- **Spreading fire** (2026-10-17, `02`, Only characters burn; fire lights what is made to be lit; the fireball as a flare): fire that catches on walls, crops, and fences. Only bodies burn today, and a fireball's landing is light only; spreading fire would make every missed shot at a siege a hazard to one's own house, so it waits.
