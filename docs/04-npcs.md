# 04 — NPCs

**Status, 2026-10-18: villagers v0.1 built, and talk (#198 and #202, `34`: each says a line from their file when poked and now and then unprompted, the guide stands beside the spawn, and `E` or the menu's Talk opens a click-only conversation); flee, follow, stay, routines, and bags not built.** Villagers are on the character model (`19`, `src/entities/villager.js`): they idle, wander on a tether, answer a poke, and the dead hunt them behind a setting (the player always preferred), **except a villager flagged `immune`, whom the dead neither target nor harm whatever the setting** (#180, Michael, 2026-10-18: teachers and the guide; the rest can die and some are there to be at risk; the valley flags the Innkeeper and the Priest, the steady ones, and leaves five at risk); a bitten one dies and turns in its own clothes, and a dead one is a container you can search and strip. They are in the save and on the wire (`31`): a guest sees them and pokes one by its id (the menu's Poke, or a left click sent as `net.sendPokeVillager`), the host performing it. A villager more than 40 tiles from every player stands still (`game.nearPlayer`), and the chunk a villager stands in is never dropped; the records `03` planned were never built. Fleeing, following, staying, routines, lines, and bags wait for a bigger NPC pass (Michael, 2026-10-12: actions to take, dialogue to share; the stubs as built are right as they are, and villagers rising as the dead is a keeper). Talk is built (`34`). A swing passes through the living, and the turned keep their clothes.

Michael's question (2026-10-08): Zomboid single player is lonely once the TV goes out. A few NPCs in the village would open gameplay. He first offered hard limits (stand or pace, maybe invulnerable), then, on reading the assessment, ruled: **killable; flee until they cannot, then die and turn; no weapons, never fight for you; the player can tell one to follow or to stay; frozen as notes beyond the active region; and do not cripple them out of worry for the browser.** The assessment, with the engine table and the open points it closed, is `history/04-npcs-assessment.md`.

## Killable, and they flee

**Ruled: killable, and they flee.** Michael: flee until they cannot, so a single wanderer in your base does not kill a man standing still. Fleeing is one rule: when a dead thing is in sight, step to the walkable neighbour that most increases distance from the nearest one, prefer tiles toward home if home is known, and when no neighbour helps you are cornered and you die and turn. No weapons, ever, and they never fight for the player; Michael finds that uninteresting and it keeps combat one system. A fleeing villager who leads a horde to your door is emergent and welcome.

**Follow and stay.** Right-click a villager: "Follow me" paths them to stay within a couple of tiles of the player, same loop a chasing zombie uses with a stopping distance; "Stay here" parks them on the tile you point at. That is how you bring a villager home and keep him, and it is the groundwork for everything in `05-someday.md` about vendors and relationships. **With more than one player** (live since 2026-10-13, `31/08`): both are verbs the world performs for whichever player chose them, a guest's sent as a command by the villager's id and run on the host; a follower follows the player who asked, by that player's id, never "the player"; fleeing reads the nearest of the dead to the villager and needs nothing per player.

## Talk

**The guide (2026-10-13, `34`):** one villager, safe in the inn, explains the rules when asked. **Re-ruled 2026-10-13 (`02`, "What this game is"): dialogue trees are in, as exposition and personality; talk reads the world and changes with it but never writes it, and nothing is gated by it.** The scope is `34`, not built; the talk data it proposes does not exist yet.

## Limits, as Michael set them

- No needs, no mood, no goals of their own beyond fleeing, following, and staying. NPCs do not eat or sleep.
- No interaction beyond the active region. A note with `kind: npc` sits at its tile and its route does not tick. Routines resume from the current time of day when the NPC is real again, so nobody is found mid-stride where they could not be.
- A dead NPC's turned body is an ordinary zombie record from then on and wanders like one.
- The village has a handful, not a crowd. Six to ten.
