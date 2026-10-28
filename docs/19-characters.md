# 19 — Characters: one model for the player, the dead, and villagers (and villagers v0.1 on it)

**Status, 2026-10-16: built (all five steps on 2026-10-12); the code is the truth and this page is the model as it stands.** One character model, `src/entities/character.js`, for the player, the dead, and villagers: `createCharacter` and the shared fields below; `dress` and the figure sheets shared by outfit (`assets.sheetFor`, keyed by the drawing's inputs; a corpse is one frame on a sheet of its own); `say` and the speech bubbles (`ui/speech.js`: a rounded rectangle with a tail at the speaker's head, in game time); the body as a container (`lootOf`, `Search body` then `Open body`: the grid is the body, so taking a garment strips the corpse and it redraws the same step, down to the undies); villagers v0.1 (`src/entities/villager.js`: idle, wander on a 4-tile tether in their room, talk when poked). Since the build: the world's state is `game.js`'s (`S.players`, a list, `S.zombies`, `S.villagers`, and `S.corpses`, the fallen; `S.others`, the living, and `everyone`, with the fallen, built once a step); walking is `entities/movement.js`, shared by the dead and the villagers (`23a` D7); the numbers are `data/tuning.json` (`23a` D9: the villagers' speed, tether, and talk time, the groan's text and timers, the idle range); the dead hunt the nearest living player they see, and never a villager (every one immune since 2026-10-28, `02`; the mortal path is kept off by data, `immune: false`, on which a villager at zero health dies and turns in their clothes, `04`); `characterAt` tests the frame's own pixels in `interact.js`, keeping a forgiving column over a standing figure's feet so a body lying to one side is found, and skips every player; players speak, a line typed in the log's chat box said over their head (`ui/log.js`, `31/03`); a body's loot also holds the arrows and spears lodged in it (`20`); a body's garments carry instance ids, so a guest strips it through the same commands (`02`, 2026-10-13); characters travel in the save and in the frame as records (`game.serialize`, `net.js`). The dead's and villagers' sheets leave off the six carry frames (`spec.noCarry`: only the player carries furniture); the atlas is the budget, `23`, Performance. The valley has seven villagers named by role; the proving ground (`?map=square`) the four the scope placed. Not built: villagers fleeing, following, and staying (`04`); removing old bodies (corpse sheets are never evicted); a dead villager's loot (they turn). The build's record, step by step, with the four systems as designed and the acceptance list, is `history/19-characters-build.md`.

## Why one model

Michael (2026-10-12): the three kinds of people in the game should share one code shape, because each can, in principle, (1) say a line in a speech bubble, (2) wear items that decide what their figure wears, lootable from the body on death, (3) take a left click and a right-click menu, and (4) hold an inventory, as the modern parent's dead did ("E: loot" on a corpse like a chest). Not every kind uses every feature: the player speaks only through the log's chat box (`31/03`, since 2026-10-13; the scope had the player never speaking) and is never looted; a living zombie offers no menu; a villager's inventory exists but is not shown. **Unifying the code is what makes the next feature cheap**, and the villager stub is the first proof.

## The model: `src/entities/character.js`

`createCharacter(kind, gx, gy, { id, name, speed, radius, hp, maxHp })` returns the shared shape (the look is `DEFAULT_LOOK`, which `dress` and the wardrobes replace; `character.js:18`), and each kind's creator adds its own:


```
kind: "player" | "zombie" | "villager"
id, name                      // name null for the player and the dead ("the dead" in text)
sprite                        // set by dress(); a sheet id shared by everyone in the same clothes
gx, gy, layer, facing, speed, radius
hp, maxHp, dead
anim                          // createAnimation("idle")
look                          // { skin, hair, hairStyle, eyes, under }, from figure.DEFAULT_LOOK
worn                          // createWorn(): head, chest, hands, legs, feet, waist, back
hands                         // createHands(): main, off
pockets                       // a small grid of their own, null for the player (section 4)
carrying: null
line: null                    // { text, until } while a bubble shows
loot: null                    // the corpse's grid, built on first search (see 4)
searched: false
```

Who stands behind a tall prop is the renderer's note, by id, in the client's own set (`client.behind`, `src/client.js`), never a field on the character (#102).

- **Player** adds what it has now: `aim, stamina, maxStamina, sprinting, winded, moving, hunger, thirst, auto, action`.
- **Zombie** adds its states and combat fields as now (`state, aggro, lastSeen, seesNow, searchTimer, path, repathTimer, sightTimer, lastGoal, idleTimer, attackCooldown, attackHit, pathFailed, breach, sincePlayer, stuckTime, hits, stagger, knock, downTimer, upTimer, gettingUp`) and `groanTimer`.
- **Villager** adds `home, state (idle | wander | talk), path, repathTimer, idleTimer, stuckTime, pathFailed, lastGoal, talkTimer, pokedAt, say`.

`createPlayer` and `createZombie` keep their names and signatures and call `createCharacter` first; nothing that reads them changes. The lists are the world's, in `game.js`: `S.players`, `S.zombies`, `S.villagers`, and `S.corpses` (the fallen, never iterated by the AI, separation, speech, or the bars); `S.others` (the living) and `everyone` (with the corpses) are built once a step for the systems that take everyone (speech, the hit test, separation, the burn).


**Parity is the point** (Michael, 2026-10-12): the dead and villagers have exactly the player's model, a doll with items slotted in plus an inventory, so their clothes can be taken but not their things, or the other way, or some of both. The one difference is pockets: the player's grid is the bag on their back and their hotbar is the belt (`11`, ruled), while **the dead and villagers carry a small grid of their own, `pockets`, with no bag or belt needed for it**, because a dead thing with a sack on every back would look wrong. A worn sack or belt adds its grid or slots on top, for anyone.

The comments above name section 4, the inventory-and-loot system as it was designed; the four systems are built as the status says, and their design is `history/19-characters-build.md`.

## Rulings this scope makes (defaults; logged in `02` when built)

1. One character model, three kinds, each kind's creator adding its own fields; the three lists stay.
2. Everyone is dressed from items; the dyed entry carries colour; wardrobes are data; sheets are shared by outfit key and bounded by the atlas.
3. Everyone has the player's model, a doll plus an inventory; the dead and villagers carry pockets instead of needing a bag. A corpse opens like a chest, is one baked frame, and redraws as it is stripped; the player is never lootable; a dead villager's loot is built but not offered, since villagers are immune to the dead (`02`, 2026-10-28; the mortal path is kept, off by data).
4. The dead groan "Braaains" now and then; the player had no lines when this was scoped (since 2026-10-13 a player speaks through the log's chat box, `31/03`); speech is one system for any character.
5. A living zombie offers no menu; a villager offers Poke; the swing passes through the living.
6. Villagers wander on a 4-tile tether in their room; poke within click reach with the wiggle's cooldown; four in the square.
7. The turned keep their clothes (`04`, point 4); the player cannot hurt a villager (`04`, point 3).

## Tunables

The numbers are data, `data/tuning.json` (`23a` D9): the villagers' `speed` 1.4, `wanderRadius` 4, `talkTime` 2, and `pokeCooldownMs` 600; the dead's `groanText`, `groanMin` 20, `groanMax` 60, `wanderIdleMin`, and `wanderIdleMax`; the wardrobes with their `look` are `data/wardrobes.json` and the `body` loot table `data/loot.json`; the pockets' size is per wardrobe; the bubble's clearance over the head is `ui/speech.js`'s and the atlas's fill warnings (85 percent, full) are `gl.js`'s.
