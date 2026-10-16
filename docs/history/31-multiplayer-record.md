# 31 — The multiplayer plan: the record of `docs/31-multiplayer/`

> **Record.** The files of `docs/31-multiplayer/` as they stood on 2026-10-16, before the sweep (#70, #78) trimmed the folder to what an agent needs: `README.md`, `03`, `04`, `05`, `07`, `08`, and `09`, each whole under its own heading below, moved by the sweep, 2026-10-16; never edited again. `01`, `02`, and `06` are beside this file as `31-01-the-breadcrumbs.md`, `31-02-the-audit.md`, and `31-06-the-order.md`.
> The live text is `docs/31-multiplayer/` (`README`, `03`, `04`, `05`, `08`, `09`: the game with friends as built, rewritten from these) and the rulings `docs/02-decisions.md`; `07`'s two open questions (a player cap, a guest's `__game`) and `06`'s duplication count for `check("sync")` become issues in wave 4 of #70, and nothing stays at `07`.

What each section was, and where its live half went: the **README** held four layers of status in one paragraph and the verdict of the plan (the live README is one status and the table of files); **03** was the proposal for each system, in options and brackets, with a status naming where the build departed (the live `03` is a plain description of play with friends as built, the departures folded in where they land); **04** was the architecture's options, the planned authority module `src/world/` (never made), the planned wire of commands, events, and snapshots, interest, lag, and cost, with a status describing the wire as built (the live `04` is the wire as built alone); **05** was the 37 seams, each with its "Was:" and its build note (the live `05` is a table, one row a seam, the numbers kept); **07** was the twenty questions for Michael with their answers (seventeen answered, two open, one standing as its default; nothing stays at `07`); **08** was the rules as of 2026-10-13 and the original six habits handed to the big pass's implementer (the live `08` is the reasoning behind `CLAUDE.md`'s multiplayer rule); **09** was the ruling of worlds, identities, and characters with its order of building and its answered questions (the live `09` keeps the words, the rules, the screens, the data, and the wire).

---

## `README.md`, as it stood

# 31 — Multiplayer: the assessment and the plan

**Status, 2026-10-15: the core is Done (`02`): server worlds on Fly played, the last two moves built; spectating, lighter frames, and the bounded rewind wait in `05-someday.md`.** **Status, 2026-10-13, night: built and live through tier 3; the code is the truth, and `02` has every move.** Friends play over the relay (`server/relay.js` on Fly, `wss://cmz-relay.fly.dev`) from the GitHub Pages site: the world as a headless module (`src/game.js`, `node tools/world.js`), the save as the worlds store (`src/save.js`), players as a list, the wire with prediction, deltas, frames every third step, and smoothing (`src/net.js`), worlds, identities, and characters with dormancy and the rejoin (`09`), every verb a guest can reach as a command, and the whole-world sync check (`check("sync")`). Since the same day **every change is built for multiplayer in the same commit** (`02`'s top entry; `08` is now those rules), which replaces the tiebreaker this folder was written under. Everything this line named as still to come on 2026-10-13 (a guest's own swing played at once, the host's world kept running behind a covered window, the camera kick and the "spent" word for a guest, the world's rules read-only in a guest's Settings, a Node authority) is built; `server/world.js` has been the authority on the relay since 2026-10-14. Where the built design differs from the plan, each file says so at its top or in place (`04`, `05`, `06`, `07`, `03`); `01` and `02` are the record of what the plan read. Was, at the start of the day: Michael read the plan and said start; the work went on its own branch (`claude/multiplayer-architecture-planning-0fde9c`), merged to `main` in small moves under the big pass. Was before that: a planning pass, written 2026-10-13 at Michael's ask, from a read of every doc in `docs/` and three surveys of `src/` (file:line throughout). Nothing here is ruled, nothing is built, and no code was touched. The brief: pick up the threads the docs already carry about co-op (the tiebreaker in `CLAUDE.md`, the feasibility note in `05`, the free rules applied in `23`, the co-op notes in `30`, the creation screen pinned in `02`), assess what is built and what is planned, and say what would have to change for the robust, fairly maximalist version of multiplayer, because the simplest version would not be worth doing. A one-browser-hosts model is fine; a server is not out of the question. The questions that only Michael can answer are in `07`; his answers go to `02` as rulings, as always.**

## The verdict in one paragraph

Feasible, and the engine work of 2026-10-12 did most of the cheap part already: the simulation has one seeded generator and one stepped clock, the rules it reads are a snapshot, the player's controller takes an input snapshot "that could come from a wire", every character is one model with an id, and the wild grows identically from a seed on any machine. What stands in the way is not performance and not the renderer; it is **a dozen module-level singletons that mean "the one player"** (the bow's draw, the combat clock, the placement ghost, the carried light, the camera and the iso origin, the open container, the key trackers), **the lack of ids on anything that is not a character** (props, walls, item entries, floor items), **about a dozen world changes that happen inside DOM click handlers outside the fixed step**, and **chunk growth driven by whatever reads a tile, the renderer included**. None of those is deep; all of them are wide. The design that avoids Zomboid's sync trouble is the one `05` already names: **one authority**. The maximalist version is that authority written once as a headless world that runs either in the host's browser page (a listen server, no infrastructure) or in a Node process on a machine that stays up (a dedicated server, a world that persists while friends come and go), with the browser as a replica that renders, predicts its own walking, and sends commands. The save system, not yet built, is the same serialisation a joining player receives, so it should be built first and built as the wire format. The big pass (`30`) can go ahead single-player as specced, provided its implementer keeps six habits listed in `08`, which cost nothing now and save a rewrite later. *As it went (2026-10-13): the verdict held. The authority is `src/game.js` run in the host's page, with Node running the same world headless for the checks only; the save came first and is the welcome a guest receives; the transport is the relay, not a listen server's direct socket; the big pass's steps 0 to 3 were built under the habits and it holds at step 4 while this lands. The dedicated server is tier 4 and optional.*

## The files

| File | What it holds |
|---|---|
| [01-the-breadcrumbs.md](01-the-breadcrumbs.md) | Everything the docs already say about co-op, collected with pointers, and what each entry commits the game to. |
| [02-the-audit.md](02-the-audit.md) | What is built, read against the free rules of `05`: what is ready, the singletons, the world-mutation surface, ids, the out-of-step changes, the client's coupling, growth, saves, the server, what the determinism check covers. With file:line. |
| [03-the-game-with-more-than-one-player.md](03-the-game-with-more-than-one-player.md) | The design: what "maximalist" means here, and the rule for every system (sight, light, the dead, needs, sleep, pause, death, chat, building, containers, stations, farming, combat, the bow, carrying, the creation screen, saves, a world with nobody in it). |
| [04-the-architecture.md](04-the-architecture.md) | The options (listen server, dedicated server, lockstep, and the hybrid), the recommendation, the authority and the replica, the transport, the wire (commands, events, snapshots, the join), interest, prediction and lag, time, determinism's job, the two-tab loopback. |
| [05-the-seams.md](05-the-seams.md) | The concrete list of what changes in the code, grouped by the free rules, each with where it is and its scope. |
| [06-the-order.md](06-the-order.md) | The tiers from `05-someday` expanded to the maximalist end state, the sequencing against `30`, the check per tier, and what is done now for free. |
| [07-questions-for-michael.md](07-questions-for-michael.md) | The questions with defaults in brackets. |
| [08-for-the-coder-agent.md](08-for-the-coder-agent.md) | The rules every change follows now that multiplayer is live, with the six habits first handed to the implementer of `30` kept as their floor. |
| [09-worlds-identities-characters.md](09-worlds-identities-characters.md) | Worlds, identities, characters (Zomboid's model, ruled and built 2026-10-13): the Worlds and Identities screens, the store, the join by a browser id, dormancy and the rejoin. |

## How this relates to the other docs

- `05-someday.md`, "Co-op" (2026-10-12) is the feasibility note and the free rules. This folder is the plan that note said would come if the game got there; it does not reopen the verdict (feasible, large, one authority), it works it out.
- `CLAUDE.md` and `02` (2026-10-12) held the tiebreaker: all else equal, the multiplayer-friendly fork. **Replaced 2026-10-13** (`02`'s top entry): multiplayer is live, and every addition and change is built for it in the same commit; `08` holds the rules.
- `23` and `23a` are the engine upgrade. Its group C (determinism), D1 (the controller from a snapshot), D8 (the singletons that are really per-player state, "done file by file as step 2 touches each, never as a pass of its own") are where multiplayer was already being kept possible; `02` says which were done. D8's list was most of `05`'s section D, and is built but for the renderer's writes on shared objects (`05` item 7).
- `30` is the big pass, steps 0 to 3 built under `08`'s habits, held at step 4 (Michael). Section 3.3's co-op note (sleep as a speed multiplier, nothing poked) and law 1 (everything is data) are the right shape; `08` adds what else its implementer should do.
- `03-world-model.md`'s records (the active region, alarm, lure, trickle: not built) are the one unbuilt milestone whose design changes with more than one player: the active region becomes a union of regions, one per player. `05` here says how.
- `19` (one character model) and `11` (everything is a slot) are the groundwork for players as a list.

## Words used here

- **Authority:** the one process that owns the world and steps it. Nobody else may change the world; everybody else asks.
- **Replica:** a client's copy of the part of the world it can see, kept current by the authority, drawn by the renderer, never stepped as the truth.
- **Command:** what a player asks the authority to do, as data: walk this way, swing at this aim, open this door, move this item from here to there. The authority validates and performs, or refuses with a reason.
- **Event:** what the authority tells replicas happened: a door opened, a zombie died, a fire lit, a line said. Replicas apply events to their copy.
- **Snapshot:** the state of what a replica can see, sent whole on join and as deltas while playing.
- **Interest region:** the chunks a replica is told about, the client's own active box; the union of every player's region is what the authority simulates. *Not built: today every guest is told the whole world (`04`).*
- **Listen server:** the authority runs inside the host player's browser page; guests connect to it.
- **Dedicated server:** the authority runs in a Node process with no renderer; everyone, the host included, connects as a guest.

`09-worlds-identities-characters.md` — ruled 2026-10-13 after the first real join: a world is chosen, never assumed; an identity is a name and a look kept in the browser; a character belongs to one world; the Worlds and Identities screens, the reconnect by a browser id, a world's code kept.


---

## `03-the-game-with-more-than-one-player.md`, as it stood

# 31.03 — The game with more than one player in it

**Status, 2026-10-13: built for the most part, through tier 3; the code is the truth.** Where the build differs from the rules below: **sleep** is (a), but a sleeper is never woken by damage or by anyone (they rise rested in the morning), a sleeper alone in bed while a friend is awake sleeps at ordinary speed, and the message is "Time will pass faster once everyone in the world is asleep." rather than naming who is up (`02`, the sleep rule); **pause**: a world on the wire never pauses, with guests or not, so a world open to friends with nobody in it runs too, and only a world played off the wire pauses (`02`); **the creation screen** is replaced by `09`: an identity is a stamp a character is made from, and a character's name and look are fixed after creation; **death** offers a new character in the same world at the spawn from any identity, the body left where it fell, with no turning into a zombie yet and no spectating (later, with tier 4; `09`); **saves** are the worlds store in IndexedDB (`09`), not exported as a file yet; **reconnecting**: a guest away stands sixty seconds of game time, then goes dormant, out of the world and never hunted, until the rejoin (`09`); **combat**: a guest's clicks, buttons, aim, and a ground point ride in its input snapshot and resolve at the host's tick with no rewind; **the bow**: the arrows in flight go by position in every frame; **interest**: every guest is told the whole world; **the dev console**: nothing in `dev.js` limits a guest's `__game` yet (`07`, question 14).

What "the robust, fairly maximalist version" means, system by system, so the architecture in `04` has a target and the questions in `07` have a context. Defaults in brackets are proposals for Michael, written in the style of the other specs: his to overrule, not an implementer's.

## What maximalist means here

Not a mode bolted on, not a second player who shares one screen. **Several friends in one persistent valley**, each with their own character, their own view, their own needs, their own death, able to join and leave while the others play, with everything in the world shared: the dead, the fires, the crops, the stations, the walls they build, the chests they fill. The single-player game is the same game with one person in it; nothing is "the multiplayer version" of a feature. The ceiling is set by the atlas and the screen's worth of dead, not by the design: [a design target of **four** players, a hard ceiling of **eight**].

What it is not: no versus, no teams, no shared screen, no voice (the browser could, later; the text log is the chat), no mods, no matchmaking, no accounts. A friend joins by a link or a code and a name.

## The rule for each system

### Characters and the creation screen

- **Every player is a character on the one model** (`19`), kind `player`, with their own `id` (never the literal `"player"`), `name`, `look`, `worn`, `hands`, needs, and combat fields. The dead and villagers do not change.
- **The creation screen** (pinned in `02`, 2026-10-10: look, hair, facial hair, the painted layers) becomes **the identity screen**: a name and a look, kept in the browser like a setting, shown before Play in single player and before Join in multiplayer, editable later from the pause menu [changes to the look apply at once, as the console's `setLook` does; a name change too]. It is the one screen that travels: the identity is sent on join, and every client bakes that player's sheet from it. Goobers (`00`): no body choices.
- **A player's figure sheet** has a fixed id per player slot (`player_<id>`), redrawn in place as the player's own is today (`main.js:283-297`), never through the shared outfit cache, so N players cost N sheets whatever they wear. The second atlas page (`23` Q2d) is due when the first group dresses differently; four players fit in today's free rows.
- **A name over the head** [shown always for players within sight, as the speech bubble is placed; a setting to hide them], and the portrait in the HUD is one's own.

### Sight, light, and the view

- **Each client sees from its own player.** `visible` is cast from one's own tile; the fog is one's own; the occlusion hole in the canopies is one's own; the translucent near walls are one's own room; the night pool, the zoom, the camera, the swing-target outlines, the ghost, and the aim marker are one's own. None of it is shared and none of it travels. **No shared sight** [no "party vision": a friend in the inn does not let you see into the inn; it keeps pillar 2, sight is the game, and it keeps the fog one function].
- **Another player is drawn when in your sight** like any character, never through walls (the always-drawn exemption at `render/entities.js:184` becomes "is me").
- **Light is shared** because it is world state: every fire, every mounted torch, every carried torch, every lit window lures the dead and lights the ground for everyone. The carried lights are a list, one per player (`light.carriers()` already sums a list). A friend's torch lights your way and gives you both away.

### The dead

- **The dead hunt the nearest visible living thing, players preferred** (`19`'s rule extended): at each sight check, the nearest player in sight, else, with the setting, the nearest villager. Memory, search, and give-up unchanged. One zombie has one target, one position, one health, decided by the authority: the Zomboid flip cannot happen.
- **A carried flame belongs to someone**: a source carries its owner's id, and a zombie drawn to it walks to that player (`zombie.js:389` today sends it to "the player").
- **The thinking box is the union of every player's box** (`activeTiles` round each player; a zombie thinks if any player is near). With the records milestone (`03-world-model.md`), the active region is the union of every player's region, chunks evict by distance to the nearest player, and alarm and lure are per chunk as designed, with no player in them.
- **Spawns** are hash-keyed by position already; growth is triggered by players' positions only, never by what a client's window happens to show (`05` here, growth).
- **Bites and damage** are the authority's; a `playerHit` names its victim.

### Needs, moodles, health

- **Each player has their own** hunger, thirst, tiredness, health, stamina, bleed, infection; their own moodle column and bars; drawn on their own client only. Nothing to share, nothing to decide. The authority ticks them; the client shows what the authority says.

### Sleep

`30` law 6: the clock and the simulation run at sixty times speed, only in a bed indoors, never interrupted. With more than one player the rule needs a veto, and the note in `30` 3.3 says "a second player's presence would veto". Options:

- (a) **Everyone or nobody**: the world fast-forwards when every connected player is in a bed; a player standing up is the veto; the message says who is awake ("Wren is still up"). Valheim's rule.
- (b) **A majority**: more than half in bed, the rest dragged through a night at sixty times speed, awake.
- (c) **Each player sleeps alone**: the sleeper is skipped forward in their own needs while the world runs at normal speed for everyone, which is not law 6's fast-forward and breaks "nothing is poked".

[**(a).** It is the only rule that keeps law 6 as written (the world simulates at that speed; nothing is poked) and keeps the single-player case the same rule with one voter. A sleeper who is bitten is woken by the damage as now, which with (a) means the fast-forward stops for all until they lie down again or die.] The time scale is **a property of the world** set by the authority from the rule, not of the loop (`05` here).

### Pause, menus, and real time

- **With more than one player connected the world never pauses.** Escape opens the local menu over a running world; the bag and the character screen are local panels over a running world (they are already DOM over the world); a hidden tab stops that client's rendering and nothing else. The single-player law ("the game runs in real time while its window is visible, Esc pauses") holds unchanged when one player is alone: a listen server with no guests pauses as today [and a dedicated server with one player in it does not: the world is the server's, and the player who walks away has walked away].
- **Hit-stop is local.** The 45 or 90 ms freeze becomes a hold on the client's own interpolation and its own camera kick; the authority never freezes (`05` here). A friend fighting across the square does not stutter your world.

### Death and the next survivor

- **Death keeps the world running** (`02` 2026-10-08's ruling, the parent's `18`): control stops, the fall plays, the body rises as a zombie in your clothes carrying what you carried (`turnVillager` is that code), and the death card offers **New survivor**: a fresh character at the inn, the toll house, or the croft by turn (`30` 3.5), with the kit, keeping your name and look [and the survivor count on your card]. Your friends see your former self get up, which is the game's tone in one image, and they can loot your body for your things, which is the second player's version of "that is the point" from the parent's doc.
- **A dead player spectates until they choose** [a free camera over what their friends can see? no: **their own body's sight**, which is a corpse on the floor: they see the room they died in, as a body would, until New survivor. Simple, a little cruel, and no new sight rule].
- **A dead world**: with everyone dead, the world runs on until someone takes a new survivor; the dead screen is per player.

### Chat and speech

- **The text log is the chat** (`02`'s note): a line typed in it is a `say` by your character, which is a speech bubble over your head within sight of others and a `Name: line` in every log that could see it, as a villager's line is today. Out of sight, not heard [no global chat; a message system (`showMessage`) is per player and never travels]. One new input: typing into the log.
- **Emotes, pings** are not in 1.0; a pointed-at tile ("look here") is one event away if play wants it.

### Containers and items

- **Everything is shared, nothing is owned** (Zomboid's rule). Any player opens any chest, loots any body, takes from any pile, including a friend's dropped bag. Trade is "drop it" or "put it in the chest". No player-to-player drag (no trade window) [in 1.0; the interface could show a friend's offered item later as a container panel].
- **A container open on two screens at once** shows both players the same grid, live: a move is a command the authority performs and both replicas see. **The grid's placement rules stay the client's preview and the authority's law**: a drag that was legal when it started and is not when it arrives is refused with the panel's own label ("no room"), the parent's rule for a full grid. Stacks merge on the authority only.
- **The one container rule** (`02`, 2026-10-10) is validated on the authority, as every rule is.
- **A body's grid is the body** (`19`); two players stripping one corpse see it undress by both their hands.

### Building, placement, carrying

- **The ghost is per player**, the build palette per player, the removal highlight per player; the placement and the removal are commands (`placeProp`, `buildWall`, `destroyWall`, `removeProp` with a reach and a cost checked on the authority).
- **Two players building on one edge**: the first command wins, the second is refused with the ghost's red ("something is there").
- **A carried prop is off the map and on a player** (`player.carrying`); it travels as part of that player's state so others see the chair on their head.
- **The Free building rule** is the world's (`rules`), not a client's.

### Stations, recipes, fires, farming (the big pass, `30`)

- **A station's queue is state on the prop**, ticked by the authority, drawn by any client with the panel open; two players may queue at one station and both see the queue; the output slot is a container. **A craft in progress is a row with a start tick and a duration**, not a bar on a client.
- **A fire's fuel** is a number on the prop (`map.js:1241-1256`); Feed is a command; a lit fire lights the room for everyone.
- **A crop's planted hour** is on the tile (`30` 8); growth on the clock; two players water one plot, the second pour finds it wet.
- **The bucket** is a carried prop like any.
- **Durability** is on the entry (`wear`); kills are the authority's.
- **Interactions** (`interactions.json`) resolve on the authority with the same rows; "Nothing interesting happens" is a message to the one who tried.

### Combat

- **The swing is a command**: "swing the main hand at this world-space aim at tick T". The swing resolves on the click (`14`'s rule), so it is one message, not a held state; the authority resolves the wedge against its own dead at its own tick [with a short rewind to the sender's tick, bounded at 150 ms, so a client who saw a zombie in reach and clicked is not refused by the dead having shuffled a tenth of a tile: the "lag compensation" of `05`'s tier 4, cheap here because the dead are slow]. The client shows the swing at once (the animation is cosmetic by the same rule) and the hit when the authority says so, a round trip later: `05`'s stated cost.
- **The block and the brace** are stances: "guard up" and "guard down" commands; the authority applies the block to the bites it resolves.
- **The exposure, the swing timer, the combo clock** are the player's fields, ticked by the authority, drawn by their own client.
- **Players do not hurt players**: the swing passes through the living (`19`), the wedge finds the dead only; a thrown spear lands beside a friend, never in them; a friend's arrow likewise [no friendly fire in 1.0, by the villagers' precedent; a setting later if anyone wants the fantasy].
- **Stagger, knockback, down, finisher** are the authority's and arrive as entity state.

### The bow and the spear

- **The draw is a stance on the player** (start, hold, release as commands; `archery.draw` becomes `player.draw`), the aim read from the command's world point.
- **A projectile is launched by the authority** with its launch parameters (`arrowShot` already carries them), and **every client flies it the same way** (the arc is deterministic from the launch; `20`); the authority alone decides the landing (`arrowLanded`): the hit, the lodging, the floor item. The visual trail needs no messages between shot and landing.

### The world with nobody in it

- **A listen server** lives while the host's page does; close the tab and the world stops, saved (below).
- **A dedicated server** lives while the process does. Does the valley run with nobody in it? [No: the world is simulated only where a player is (`03-world-model.md`'s law), and with no player it is simulated nowhere. The clock stops with the last player's leaving and resumes with the first's arrival. A fire you left lit is lit when you return; a crop planted at noon catches up by its planted hour when the chunk wakes, as `30` 8 already designs. This is also the only rule under which the single-player law "nothing shuts off on a timer, things run out because you used them" survives a server.]

### Saves, the host, and joining

- **The save is the authority's** (`04`): a listen server's lives in the host's browser (`localStorage`, one slot, the parent's shape) and can be exported as a file so a friend can host the same valley next time; a dedicated server's lives on its disk, saved on a timer and on the last leave.
- **Joining is loading**: a new client receives the same serialisation a save is, cut to its interest region, then events.
- **Reconnecting** keeps your character where it stood (the authority holds it, standing still, for a grace period [two minutes], then the dead may have it).
- **Settings**: the world's rules are the host's (`rules`, `combatTesting`, `squareSurface`, the data files); a guest's settings screen shows them read-only; the viewer's settings stay the guest's.
- **The dev console** (`window.__game`) exists on the authority only; a guest's `__game` is the replica's, read-only on the world [and the host alone may use `give`, `teleport`, the clock keys].

## What this design keeps from single player, exactly

Everything a single player does is a command to an authority that happens to be in the same page with zero latency. One code path (the loopback transport, `04`), so single player exercises the whole of it every evening, which is how the multiplayer code stays true while nobody is testing it with a friend.


---

## `04-the-architecture.md`, as it stood

# 31.04 — The architecture: one authority, written once, run anywhere

**Status, 2026-10-13: the hybrid (D) is built in its listen-server half; the code is the truth (`src/game.js`, `src/net.js`, `server/relay.js`), and these are the places the build differs from the plan below.** **The authority** is `src/game.js` (not `src/world/`), run in the host's page; Node runs the same world headless for the checks (`node tools/world.js`), and the same world runs headless as a server world on the relay since 2026-10-14 (`server/world.js`, sharing `src/host.js` with the browser host). It exports `create`, `begin` and `step(dt, snapshots)`, `serialize` and `restore`, `hashText`, `syncParts`, and the player list's `addPlayer`, `takePlayer`, `putPlayer`, `removePlayer`; joining, leaving, commands, and frames live in `net.js`, and a guest's command runs on the host on arrival through the very handler the host's own click uses, not through a queue in the world. **Time:** since 2026-10-13 a Worker's tick steps a world with friends in it once the frames stop (`loop.setBackgroundDriver`), so a covered or hidden host window no longer slows the world; the time scale is the world's, computed each step from who is asleep (`game.timeScaleNow`: sixty only while every living player is in bed). **Pause** is not a time scale of zero: a screen pauses the loop only off the wire. **The wire** is not the three kinds below: a guest sends its input snapshot every step (`input`, numbered for the acknowledgement: walking, clicks, buttons, the aim as a vector and a ground point, the key events E, B, and T) and its commands by type (`act`, `item`, `use`, `place`, `craft`, `say`, `poke`); the host holds at most ten of a guest's inputs (`MAX_BACKLOG`) and applies one a step. The host sends the `welcome` (the whole save, `game.serialize`) and a `frame` every third step at normal speed, paced by a running count over the world's time scale (`net.FRAME_EVERY`, about twenty a second, one per hundred and eighty steps at sixty times): the chunks touched since the last frame whole (grown wild chunks too, so they do travel), the players' records in a light part each frame and a heavy part when its shape changes, the dead, the villagers, and the corpses as a delta with a roster when a list's membership changes, the sway stamps, the stations' queues, the carried lights, the rules, the arrows in flight by position; then `log`, `message`, and `opened` to the guest a line or a container is for. No event list travels. **Versions:** the join carries `net.PROTOCOL` (4 since 2026-10-15) and the save's version, not the data's stamps. **Others** are smoothed, not interpolated from a ring: a frame's position is a remote character's target, walked to over the frame's three steps (`netTo`). **Not built:** interest (every guest is told the whole world; the interest radius is the next saving, `02`), the bounded rewind, the client's own hit-stop hold. **Measured** (`02`): about 120 KB/s to each guest with 22 of the dead near the living, against the "few kilobytes a second" forecast below.

## The options, and why one wins

Four ways to put two browsers in one world. Each is judged against the game as it is (`02`) and the game as `03` wants it.

**A. A listen server.** The host's browser runs the whole simulation; guests send inputs and receive the world. No infrastructure beyond a way to connect. The host's machine does the sim and its own rendering; the world lives and dies with the host's tab. This is the shape `05-someday` sketched. Its weakness is the tab: `loop.js` runs on `requestAnimationFrame`, which a hidden tab does not get, so a host who alt-tabs stops the valley for everyone; the fix is the authority stepping on a timer or in a Worker, which browsers throttle less but still throttle after minutes in the background. Its other weakness is persistence: the valley exists in one person's `localStorage`.

**B. A dedicated server.** A Node process runs the simulation with no renderer; every player, the host included, is a guest. The valley persists on a disk, friends come and go, nobody's tab matters. The cost is that the simulation must run outside a browser, which `23a` H measured as a small gap (`document` in `assets.js`, the pixel pick in `interact.js`, and, the audit adds, the renderer's and light's habit of growing chunks through `tileAt`). Node is already in the repo's toolbox (`node tools/check.js`, `node --check`); it adds no build step and no framework. The one dependency decision is the WebSocket server: `ws` from npm, or a hand-written handshake of about a hundred and fifty lines in the repo's own style (`05` noted both).

**C. Deterministic lockstep.** Every client runs the whole simulation and they exchange only inputs, delayed by a few ticks so everyone has everyone's input before stepping. Tiny bandwidth, no entity sync, and the determinism work of `23` is exactly its prerequisite. Against it: it needs *perfect* determinism, including chunk growth (today driven by the window, `02` section 4), the id counters, every DOM-handler mutation moved into the step, and floating-point agreement across browsers (`Math.atan2`, `sin`, `cos` are not required to agree bit for bit between engines; across Chromium builds they do in practice, across Safari not guaranteed); one divergence is an unrecoverable desync with no authority to resync from; the input delay lands on your own walking, which in a game about moving fluidly through doors is the worst place to put latency; a late join needs a full snapshot anyway; the slowest machine sets the pace for all, and sleep's sixty-times fast-forward multiplies that. **No.** Determinism keeps a different job (below).

**D. The hybrid: the authority as a headless world module, with a replica client, run as A or B.** Write the simulation once as a module that owns the world and takes commands, with no reference to a window, a canvas, a keyboard, or a DOM. Run it inside the host's page (A) or in Node (B); the client code is the same in both cases and talks to it through a transport: an in-memory loopback when it is in the same page, a WebSocket when it is not. Single player is A with no guests. **This is the recommendation.** It is B's robustness with A's zero infrastructure for a Tuesday night, and the sim factoring it needs is the factoring `23a` D1, D2, D8 already asked for.

## The authority

**`src/world/`** (the name is a proposal; `23a`'s target tree called the state-and-step-order file `game.js`): the map, the characters, the fires, the arrows, the clock, the rng, the rules, the time scale, and the step order. It exports:

- `create(mapJson, data, rules, seed)`: the world from the files.
- `join(identity)` returns a player id and the player; `leave(id)`.
- `command(playerId, cmd)`: queues a command for the next step.
- `step()`: one fixed step (`loop.js` keeps `STEP`): refresh rules, apply the queued commands in arrival order, then the step order of `main.js:316-467` with "the player" replaced by "each player" where it must be (`05`).
- `events()`: what happened this step, drained by the transport.
- `snapshot(playerId)`: the state within that player's interest region; `delta(playerId, sinceTick)`.
- `serialize()` and `restore(json)`: the save, per module (the parent's pattern).
- `hash()`: the whole world, for the drift check.

It never calls `showMessage`; it emits a `message` event addressed to a player. It never reads `input`; it reads commands. It never grows a chunk for anything but a player's position; every other lookup is `peekTile`. It never freezes. The dev console on the authority (`__game`) is what it is today.

**Time.** The authority steps at 60 Hz on its own timer: in the page, the existing loop's accumulator with the steps counted (the loop already does this); in Node, `setInterval` with the same accumulator (drift-corrected). A **tick** is the integer step count; `simTime()` is `tick * STEP`. **The time scale** (`world.timeScale`, 1 or 60 for sleep) multiplies the steps run per real second, never the step's `dt`: sixty steps of 1/60 s in a sixtieth of the time, so the dead walk and fires burn by the same code at the same `dt` and nothing is poked, as `30` law 6 requires. In a browser at sixty times, 3,600 steps a second at 0.1 to 0.3 ms each is 0.4 to 1 s of work per real second, which is fine at the middle zoom's numbers with nobody rendering between the steps (the host's own render runs once per frame as now).

**Pause** is `timeScale = 0`, a command the authority accepts only when one player is connected (the listen server alone) [and never on a dedicated server]. *Built otherwise (2026-10-13, `02`): on the wire the world never pauses; off it, a screen pauses the loop as before.*

## The replica

**The client** is `main.js` with the world taken out: boot, the data, the art, the figure sheets, the ground, the renderer, the UI, the input, the camera, the view, the checks. It holds a **replica world**: the same `map.js` chunks (grown from the same file and seed, with the authority's dirty chunks applied on join and its events applied as they arrive), the entities it has been told about, the fires, the arrows in flight, the clock. The replica is stepped for **presentation only**: animation frames, interpolation of others' positions between snapshots, arrows flying between `arrowShot` and `arrowLanded`, flames, sways. It never decides anything.

**My player** is predicted: the client runs `updatePlayer` (the walking, the collision against the replica's walls and props) on its own input every step so the walk is instant, sends the input snapshot as a command with its tick, and reconciles when the authority's position for that tick arrives (replay the inputs since; the usual thing; the corrections are a pixel or two when the two worlds agree, which they do unless a door shut between). Everything else about my player (health, hunger, the swing, the draw, the action bar) is the authority's and is shown as it arrives: a round trip of latency on a swing's result, none on the swing's animation (`14`: the animation is cosmetic).

**Others** are interpolated: a snapshot every three ticks (20 Hz), drawn a snapshot behind, so motion is smooth; the dead at 1 tile/s move 0.05 tiles between snapshots.

**Sight, light, fog, the ground, the sheets** are the client's own, built from the replica as they are built from the world today (`02` section 1: all deterministic from the data). Chunks the replica has not been told about are drawn as the authored file and the seed give them, which is exactly right for wild chunks and almost right for authored ones (a chair a friend moved three screens away is where the file put it until that chunk enters your region; nobody can see the difference, by the active-region law).

**The loopback.** *(Built 2026-10-13 as `src/net.js` over a BroadcastChannel between two tabs, with the join as a load and a frame per step; `02`.)* When the authority is in the same page, the transport is a pair of queues with no serialisation [or with, behind a flag, so the loopback proves the wire format every evening: JSON in and out costs nothing measurable at these sizes]. The two-tab test (`05`'s cheap test) is the same client with a `BroadcastChannel` transport and an artificial delay, which `main.js:803` already half has.

## The transport

**Ruled 2026-10-13 (`02`): the relay is the transport.** Michael tests online from the GitHub Pages site, a URL and a code and nothing else to hand a friend; the client stays static and the relay below is what the host and the guests connect to. The site is `https`, so the socket is `wss://` and the relay needs TLS (a hosting tier's, or a tunnel from his machine). The BroadcastChannel loopback stays as the two-tab test. Order: three small fixes first (the code copyable, a guest told plainly when no host answers, the character screen for a guest with no identity), then the relay, then the rest of tier 3 over it (`06`).

**Built 2026-10-13 (`02`): `server/relay.js`**, no dependency, the handshake and framing its own; `net.js` with the relay as a second transport beside the loopback, chosen by `RELAY_URL` or `?relay=`, the messages unchanged; the reasons a wire can go (`timeout`, `nohost`, `taken`, `relay`, `dropped`, `hostLeft`) as words on the title. To run it: `node server/relay.js [port]` (or `$PORT`); the pane's `relay` launch on 8012 with `?relay=ws://localhost:8012` on both tabs. For the Pages site it must be `wss://`: a hosting tier's TLS in front, or a tunnel; its address goes in `RELAY_URL` (`07`, question 20). **Deployed 2026-10-13: `wss://cmz-relay.fly.dev`, `RELAY_URL` carries it (`02`).**

**WebSocket.** One connection per guest; messages as JSON lines [JSON first; a binary snapshot only if the profile ever asks for it, which at these counts it will not]. For the listen server, a **relay**: a small process (the same Node program as the dedicated server, in relay mode) that accepts the host's connection as the authority and guests' connections as replicas and forwards; it is also the "lobby": the host gets a code, guests type it. The relay can live beside `serve.py` on Michael's machine for friends on his network, or on any cheap box for friends elsewhere. WebRTC data channels would avoid the relay for two friends and need a signalling exchange anyway (the copy-paste handshake `05` named) and a TURN relay for the unlucky; [not first; the relay is less code and the same code as the server].

**Serving.** `serve.py` keeps serving the files; the Node process serves the sockets. Nothing about the page changes; the client connects to `ws://host:port/<code>` from the join screen [the Node process can also serve the files, so a dedicated server is one process; a decision for the day it is built].

**Versions.** The client sends the manifest's version and the data stamps on join; a mismatch is refused with a message (law 1: the rules are the data; two clients with different `items.json` would disagree about what a sword is).

## The wire

Three kinds of message, all plain objects.

**Commands** (client to authority), each with the sender's tick: `move {ax, ay, sprint}` (every step, or on change); `aim {gx, gy}` (world space, from the client's own camera: the one place the iso origin leaves the client); `swing {hand, alt}`; `shove`; `guard {up}`; `draw {start|release}`; `act {verb, target, args}` for every right-click and E action (target as an address: a tile `{x, y}`, an edge `{x, y, edge}`, a prop `{id}`, a character `{id}`, an entry `{id, where}`); `item {move, from, to}` for the panel's drags; `use {entry, target}`; `say {text}`; `build {kind, at}`, `place {prop, at, facing}`, `remove {target}`; `sleep`, `wake`; `respawn`; `pause` (listen server, alone). The authority **walks you there** for an `act` out of reach (the OSRS rule, `30` law 2; `interact.runAction`'s auto-walk is already that), which makes a timed action a command too: start, with a start tick; cancelled by the authority when you move.

**Events** (authority to replicas, to those whose region holds the place): the thirteen of `events.js` plus the world changes: `door {at, open}`, `shutter`, `board {at, side, count}`, `wall {built|destroyed}`, `floor {x, y, id}`, `prop {placed|removed|carried|putDown, id, at, facing}`, `item {dropped|taken, tile, entry}`, `fire {lit, fuel}`, `holder {torch}`, `container {changed: id, grid}`, `sway {id, tick}`, `say {id, text}`, `message {to, text}`, `hit`, `died`, `turned`, `spawned`, `slept {scale}`, `joined`, `left`. Each is what one map mutator does, which is why every change must go through one.

**Snapshots** (authority to a replica): on join, the identities of everyone, the dirty chunks in the region (the parent's save shape: run-length floors, edge walls with state, a sparse tile list with props and items), the characters in the region whole; then, every three ticks, the moving fields of the characters in the region (`id, gx, gy, facing, anim, state, hp`, and for one's own player everything), and the arrows. A region change (crossing into a chunk) sends that chunk whole. The bandwidth with sixty dead and four players in a region is on the order of a few kilobytes a second per guest.

## Interest

A replica is told about **its own active box** (the 80-tile square `activeTiles` already describes), nothing beyond; the authority simulates **the union** of every player's box and evicts by distance to the nearest player. This is `03-world-model.md`'s design with "the player's chunk" made plural, and it is why the records milestone must be built after this plural is in, or built with it.

## Determinism's job

Not lockstep. Three jobs:

1. **The wild grows the same everywhere**, so wild chunks never travel: the seed and `hash2` do it today. *As built (2026-10-13, `02`): a replica grows nothing, since a guest's own settings could shape a chunk differently; a chunk the host grows travels whole in the next frame.*
2. **A replica check**: `check("sync")` boots an authority and a replica in two tabs through the loopback with a delay, drives a scripted minute of input, and compares `world.hash()` on both at the same tick, with the whole world hashed (tiles, props, walls, items, inventories, fires, the rng) rather than today's entities alone. This is the test that says the wire is complete: every mutation that bypassed an event shows up as a hash that differs. *Built 2026-10-13 (`02`): `game.syncParts` hashes the map, the registry, the fires, the players, the dead, and the clock, not the generator or the id counter, which a replica never uses; a guest reports after every thirtieth frame with reports on; the check names the first part that differs. It found two ghosts in the host's registry on its first run.*
3. **A save that loads the same** on a host or a server, which is the same property.

The authority's own rolls stay on `rng.js`; the replica has an rng too and uses it for nothing that matters.

## Lag, and what it feels like

The dead walk at 1 tile/s; a hundred milliseconds is a tenth of a tile. Your own walking is predicted, so it is instant. A swing lands a round trip later, with the rewind bounded at 150 ms so it lands on what you saw. A door opens a round trip later [the client may open it at once and be corrected if refused; the parent's rule that the animation is cosmetic covers a leaf as well as a swing]. A friend's position is 50 to 100 ms old. A bow's arrow flies at 16 tiles/s and lands where the authority says, which on a 100 ms link is 1.6 tiles of possible disagreement with what you saw, resolved by the authority's landing at the authority's tick with the same bounded rewind. This is `05`'s stated price and it is the right price: the alternative is Zomboid's.

## What the host's machine pays

The authority is the sim as measured (`23`: 0.1 to 0.3 ms a step at the middle zoom with 67 dead) plus a serialisation per guest every three ticks (a few hundred microseconds each at these sizes), plus the host's own client. Four guests is under a millisecond a frame. A dedicated server pays the sim alone.


---

## `05-the-seams.md`, as it stood

# 31.05 — The seams: what changes in the code

**Status, 2026-10-13, night: most of the list is built; each item opens with its mark and the move, or says it is open.** Still open (checked 2026-10-16): 7 (the renderer's and the interface's writes on shared objects), 26's client object proper, 34's turning and the respawn by turn, and 36 (the records milestone). Built since this status was written: 22 (the authority on a timer: `loop.setBackgroundDriver`, 2026-10-13), 35's read-only screen (2026-10-14), 37's authority as the server world (`server/world.js`, 2026-10-14); 28's snapshot ring was built instead as smoothing. The `02` in "(`02` has the lines)" below is this folder's audit, at a commit long gone; every other `02` is the decision log.

The concrete list, grouped by the free rule each serves, each item with where it is (`02` has the lines) and its scope in the house's terms (small: a function or a field; medium: a file reshaped, callers touched; large: a module or a pattern across files). No times (`no-time-estimates`). Nothing here is to be built now; it is the map of the work, and `06` orders it. Items marked **(now)** are the ones `08` asks the big pass's implementer to keep, because they cost nothing while the code is being written and a rewrite later.

## A. Ids on everything that can be named (large by count, small each)

1. **Built 2026-10-13 (`02`, step 2 of `30`): every prop an id from the world's counter, found by `map.propById`; a guest's commands name a prop by it.** Was: **Props get an id** (`map.createProp`): a per-world counter (`nextPropId`), saved and restored, assigned at load (the generator may write them) and at creation; `tile.prop` keeps the object, a `props` map by id joins it; the address on the wire is the id. **(now)**: new code refers to a prop by `prop.id` where it stores a reference across steps (an action's target, `player.carrying`, `placement.state.prop`, a zombie's breach target).
2. **Built 2026-10-13 (`02`, the eleventh move): an action on a wall carries its edge as its address.** Was: **Walls are addressed by `(x, y, edge)`** (`wall.at` exists): no id needed; the action target is the address.
3. **Built 2026-10-13 (`02`, step 2 of `30`, then the playtest fixes): every entry a `uid` from the world's counter through `items.makeEntry`; the dead's garments take theirs in `lootOf`, a felled tree's logs and `grid.insert`'s literals theirs too.** Was: **Item entries get an instance id** (`grid.add`, `map.dropItem`, `items.hold`, the starter kit, loot rolls, `lootOf`): a per-world counter on every entry; **copies keep the id** (`dropItem`'s copy, the thrown item's copies, the torch from a holder keeps the holder's entry) and **merges name the survivor** (`grid.insert`, `transfer`: the entry that absorbed and the one that emptied). Medium: `grid.js`, `inventory.js`, `items.js`, `map.js`, `interact.js:291`, `archery.js:259, :493`. **(now)**: new code that makes an entry makes it through one function (`items.makeEntry`), never a literal `{ id, count }`.
4. **Built 2026-10-13 (`02`): players are `P<n>` and the dead `z<n>` from the world's counter.** Was: **Characters' ids come from the world's counter**, saved with it, never `"player"`; players are `p<n>`; `createZombie` stops owning `nextId`. Small.
5. **Built 2026-10-13 (`02`): `player_<id>`, one per player, placed when first seen.** Was: **The sheet id `"player"`** becomes `player_<id>`; `ui/hud.js:68`, `ui/zombie-bars.js:68`, `main.js:295` follow. Small.

## B. Every world change through a mutator, and every mutator an event (medium across files)

6. **In part 2026-10-13 (`02`): the door and shutter toggle and a container's first search touch their tile; the sway stamps ride in the frame as `pokes` (`interact.takePokes`); a fire marks its tile at every whole unit of fuel burned; placement and removal run as the guest's commands.** The wire carries the touched chunks whole, not an event list, so a mutator's duty is to touch its tile; the bus's events are not sent. The rest of the list stands. Was: **Doors and shutters** toggle through `map.setOpening(at, {open|shutter})` instead of `interact.js:342-344`; **container state** through `map.searchContainer(prop)` and the grid's own functions; **corpse search** likewise; **sway and play stamps** through `map.poke(prop, tick)` and `map.play(prop, tick)`; the carried prop's turn through placement's own mutator; the removal tool's spill through `removeProp` itself. Each mutator calls `touch(x, y)` with its tile (the no-argument `touch()` stays for boot only) and **emits its event** on the bus, which is the wire's event list. Medium in `map.js`, `interact.js`, `placement.js`. **(now)**: new world changes in the big pass (soil, planting, growth, watering, harvest, a station's queue, a fire's fuel, a stack that gives, mining a rock) are each a mutator that touches its tile and emits.
7. **Open, 2026-10-13: `behindProp`, `swingTarget`, and the speech line's aging are still written on the characters.** Was: **The renderer and the UI stop writing on sim objects**: `behindProp` (`render/scene.js:119`) and `swingTarget` (`combat.js:375`) become per-client maps keyed by id; `ui/speech.js` reads the line's end tick from the sim instead of aging `ch.line`. Small each.
8. **Built 2026-10-13 (`02`), the other way round: `tileAt` itself stopped growing.** A read beyond the ring sees a frozen blank tile; the mutators grow through `growTile`; the step's ring is four chunks; the ground bakes a chunk only once its neighbours are grown and draws nothing for one that is not; `check("growth")`, and the fresh-boot hash equal across zooms and window sizes. Was: **The three loose `tileAt` growers become `peekTile`**: `render/walls.js`, `ground.js:305, :422, :573`, `light.js:54, :221`, `visibility.js:40`, `archery.scanPath`, `placement.canPutDown`, `removalTarget`; growth only from `ensureAround` per player. Small each; **this one matters before any headless run**, since it is why a server and a host would diverge (`02` section 4). The determinism check gains a run at two window sizes to prove it.

## C. The step owns every change (medium)

9. **First form built 2026-10-13 (`02`): a guest's panel sends every drag, drop, double-click, and menu entry (but Use) to the host as a command by uid, slot id, and bag address, run there through the same handlers (`ui/inventory-actions.js` `createRemoteInventoryActions`, `performItemCommand`); the open container found by its address each frame.** Then (2026-10-13, `02`) the Use mode's apply as a command, its line to the guest's log. Still owed: the context menu's world entries on the host as a queue rather than a direct call, which nothing needs yet. Was: **The DOM handlers queue commands instead of mutating.** The context menu's `onSelect` (`ui/context-menu.js:19-25`), every item and slot menu entry (`interact.js:812-944`), the panel's `pointerup`, double-click, Tidy, Rotate, `quickMove` (`ui/inventory-panel.js:75-112, :565-631`), the settings screen's `squareSurface`, Escape: each becomes `world.command(me, {...})`, applied at the top of the next step. The handlers keep their closures for the *client's* preview (the red slot, the greyed entry) and the world's truth moves to the step. Medium in `inventory-actions.js` (which already takes a `getPlayer` and is the natural place), `interact.js`'s menus, `context-menu.js`. **(now)**: a new menu entry or panel handler calls one function that does the thing, with the player and a target address as arguments, so that function is later called from the command queue unchanged.
10. **First form built 2026-10-13 (`02`): every action carries its subject's address; `actionsForTarget` and `performByLabel` rebuild and run it on a host for a guest's menu and E.** The verb table exists for the newer verbs (`verbs.js`: `sleep` and `craft`, each with a `validate`); the older menu actions are still closures rebuilt by address, without a re-validation at completion. Was: **The action becomes data** (`interact.js:49-51, :592-619`): `{verb, target, args, startTick, duration, range}` on `player.action`, with `perform` looked up by verb from a table (`actions/` of `23a` D2, which `30` step 3's `interactions.json` resolver is already half of) and **re-validating its target at completion** (the tree still stands, the chest still exists, the planks are still there). Medium; closes the double-fell bug in passing. **(now)**: every new verb in the big pass is a row in a verb table keyed by name, `perform(world, player, target, args)`, never an inline closure.
11. **Built 2026-10-13 (`02`, the playtest list), in its own form: a player's record carries `actionView` (the label and the place) with the progress, so a guest's prompt draws the bar.** Was: **The timed-action bar** is drawn from `player.action`'s start tick and duration on any client that holds the player. Small.

## D. The player passed, never reached for; per-player state on the player (medium, the D8 list)

12. **Built 2026-10-13 (`02`): on the player; a guest's bow draws and looses on the host at the ground point it sends.** Was: **`archery`'s draw, recover, aimOverride, marker** move onto the player (`player.draw`, `player.marker` client-side). Medium: `archery.js:289-540`, `main.js:103, :286`.
13. **Built 2026-10-13 (`02`): the combo window on the sim's clock, the kick an event the striking client answers; hit-stop refused on the wire (the renderer's own hold owed).** Was: **`combat`'s `time` and `fx`** onto the player; `kick` emits a `hit` event the client turns into its own camera kick; **`loop.freeze` goes**: the client holds its own interpolation and animation for the hit-stop's length on its own `hit` event; the authority never freezes. Small in `combat.js:69-70, :135, :243-249, :334, :358`; `loop.js:41-50` keeps `freeze` for the client's render clock only.
14. **Built 2026-10-13 (`02`, the fifteenth, eighteenth, and nineteenth moves): the ghost, the Use mode, the key trackers, and the buttons are the client's own; the world takes the player and what was asked (`placement.performPlacement`, `use.applyWith`, the key events in the snapshot from `interact.keyEvents`).** Was: **`placement.state`, `use.current`, `interact.keyE/keyB`, `buttons.alt/off`** become per-client objects owned by the client (they are input and preview, not world); the sim functions they feed take the player and a command. Medium in `placement.js`, `use.js`, `interact.js:663-807`, `buttons.js`.
15. **Built 2026-10-13 (`02`): `light.setCarriers`, one per player with its owner.** Was: **`light.carrier` becomes a list with owners** (`setCarriers([{owner, gx, gy, radius, flicker, strength}])`; `allSources` appends each; `zombie.js:389` walks to the owner). Small.
16. **Half built 2026-10-13 (`02`): `updatePlayer` takes `axis`, `sprint`, and `mouse` from the snapshot and the player module reads no keyboard.** The pokes, the previews, and the aim still convert through the client's origin, but what a guest sends is never a pixel: its aim as a vector and a ground point (`aimAt`, tier 2), its pokes by prop id (`poke`), its placements and verbs by address. Was: **`camera.cam` and `iso`'s origin leave the sim.** `updatePlayer` (`player.js:196-231`), `interact.pokeAt/playAt/characterAt/interactableAt` (`:974-1059`), `placement.propGhost/buildGhost/removalTarget`, `archery.aimPoint` take **world-space points** from the command (the client converts through its own camera before sending). Medium, and the one change that touches the most call sites; it is also the change that lets the authority run without a window.
17. **Built 2026-10-13 (`02`): `src/game.js` holds the state and the step order (`begin`, `step`, `nearPlayer` over a players list), `main.js` is the client.** The client's own singletons (`visible`, `tiles`, `playerRoom`, `openBag`, the trackers) stay in `main.js` for now; `client.me` is the next cut. Was: **`main.js`'s singletons become `world.players` and `client.me`**: `player`, `visible`, `tiles`, `playerRoom`, `openBag`, `corpseWatch`, `progress`, `drawAll`, `figureKey` sorted into the world (players, each with their `action`, `carrying`, `openContainer`) and the client (my id, my sight, my room, my open panel, my debug). Large in `main.js` (the split `23a` D1 named as `game.js` and never finished), and the backbone of the whole thing.
18. **Built 2026-10-13 (`02`) for the bites, the block, the broken guard, and death.** A container a guest's player opens finds the guest by the acting player (`game.state.acting`, `net.openedFor`; the eleventh move). Was: **Events name their people**: `playerHit {victim}`, `containerOpened {by}`, `gameOver {who}`, `blocked {who}`, `guardBroken {who}`; listeners in `main.js:774-797` look the player up. Small.
19. **Built 2026-10-13 (`02`): the nearest player in sight, players preferred; the thinking box and the growth over every player.** Was: **The dead's target list** is `[...players, ...villagers]` with players preferred (`zombie.js:363-404`); `nearPlayer` is "near any player"; `ensureAround` and `evictFar` take a list of points (`map.js:640, :1304`). Small each.
20. **Built 2026-10-13 (`02`): `player === me` in the renderer's hole and exemption and the bubble.** Was: **`kind === "player"` meaning "me"** becomes `id === client.me` in `render/scene.js:101`, `render/entities.js:184`, `ui/speech.js:64`. Small.

## E. No feature that freezes the whole sim; time is the world's (small)

21. **The pause half built 2026-10-13 (`02`): on the wire the world never pauses; a screen is the client's own and its player stands still.** The time scale itself came with `30` step 2, and since 2026-10-13 (`02`, the sleep rule) it is computed each step from who is asleep (`game.timeScaleNow`: sixty only while every living player is in bed). Pause is the loop's own, off the wire, not a scale of zero. Was: **`world.timeScale`** replaces the planned loop multiplier of `30` 3.3: the loop runs `timeScale` steps per step-worth of real time; sleep sets it from the rule in `03` (every connected player in bed); pause is scale 0, accepted only alone. Small in `loop.js`, the sleep code to come. **(now)**: `30` step 2's sleep sets a world field, not a loop variable.
22. **Open, 2026-10-13: the loop is still on `requestAnimationFrame`; a covered host window slows the world for everyone, and a hosting tab says "keep this window in front" in its title meanwhile; a Worker for the host's step is named for tier 4 (`02`, the joiner's inputs).** Was: **The authority steps on a timer, not a frame** (`setInterval` with the accumulator; the render stays on `requestAnimationFrame`): a hidden host tab keeps stepping as well as the browser allows, and Node steps the same code. Small in `loop.js`.

## F. The world headless (medium)

23. **Built in part 2026-10-13 (`02`): the world boots headless.** `game.create` from the map file, `game.hashText`, `assets.setHeadless` and `setJsonReader`, `figure.describeFigure`, `loop.init`; `node tools/world.js` prints the pane's hash. Then the rest in its own shape: `serialize` and `restore` (item 24), `syncParts`, the player list's `addPlayer`, `takePlayer`, `putPlayer`, `removePlayer`; the join, the leave, the commands, and the frames (the snapshot and its delta) live in `net.js`, the commands run on arrival through the host's own handlers rather than a queue in the world, and no event list travels. The module is `src/game.js`; `src/world/` was never made. Was: **`src/world/` as the module `04` describes**: the state and the step order out of `main.js`; `create`, `join`, `leave`, `command`, `step`, `events`, `snapshot`, `delta`, `serialize`, `restore`, `hash`. No `document`, no `window`, no `input`, no `showMessage` (a `message` event), no `settings` (rules handed in). What blocks it today: `assets.js`'s `document` (the sim needs only sheet metadata: frame counts and the active frames, since bites fire on `isActiveFrame(z.anim, sheet)`, `zombie.js:532, :569`, so the authority needs the definitions, not the pixels; a headless `assets` that loads definitions alone), the pixel pick in `interact.js` (client-side by item 16), `figure` (client-side; the authority never bakes). Medium, mostly moves; `tools/check.js` grows into `node tools/world.js` as the proof: boot a world in Node, step it a minute, hash it.
24. **Built 2026-10-13 (`02`): `game.serialize` and `game.restore` over `map.serializeMap`, `installChunk`, `installProp`, `serializeCharacter`, `restoreCharacter`; the slot in `src/save.js` with Continue, Save game, the autosave, and the dead save; `check("save")` and `node tools/world.js --roundtrip`.** The slot became the worlds store the same day (`09`: a record per world in IndexedDB, an index in localStorage, no Continue on the title). The join of `04` is this whole, not cut to a region. Was: **`serialize()` and `restore()` per module** (the parent's `15-save-load.md` shape, versioned, discarded whole on mismatch): the map's dirty chunks (run-length floors, edge walls with their stack, sparse tiles with props by id and items by id), the characters (players, the dead, corpses, sleepers), fires, arrows in flight, the clock, the rng's four words, the counters, the rules. Medium; **this is the save system**, built once, used by the save slot, the join, and the hash.
25. **Built 2026-10-13 (`02`, the twenty-first move): `check("sync")` (`tools/checks/sync.js`) compares the world in parts (`game.syncParts`) on the host and each guest at the ticks of the frames the host marks.** Was: **`check("sync")`** as `04` describes: two tabs, the loopback with delay, a scripted minute, equal hashes. Small once 24 exists; it is the gate of every tier in `06`.

## G. The client (medium)

26. **First form built 2026-10-13 (`02`): `src/net.js` holds the roles and the transport; `main.js`'s step branches on them.** The client object proper is still owed. Was: **A `client` object** (`me`, the replica, the transport, the predictor, the interpolator) in `main.js`'s place; boot unchanged up to the world stage, which becomes "connect or create".
27. **Built 2026-10-13 (`02`): the guest predicts its walking, the host acknowledges by sequence, the guest replays the rest.** Was: **Prediction and reconciliation** for my own walking: `updatePlayer`'s movement run locally against the replica, inputs kept by tick, replayed on correction. Medium; one new file. The rest of my player's state is shown as received.
28. **Built otherwise 2026-10-13 (`02`, the wire's fourth part): smoothing, not a ring; a frame's position is a remote character's target (`netTo`), walked to over the frame's three steps (`net.js` `smoothStep`).** Was: **Interpolation** for others: a snapshot ring per character, drawn one snapshot behind. Small; `render/entities.js` reads an interpolated position.
29. **Built 2026-10-13 (`02`, with item 5); the second atlas page not yet.** Was: **Sheets per player** (`player_<id>`, redrawn in place from the identity and the worn list), `assets.sheetFor` untouched for the rest. Small; the second atlas page when a group of friends asks for it (`gl.js`, a second texture and draw call, `23`'s own note).
30. **Built 2026-10-13 (`02`): the You screen, the name and the look's colours with the hair and the layers, kept as settings, sent on the join.** Then replaced by `09` (2026-10-13): identities kept in the browser, the character screen their editor, a character stamped from one at creation and fixed after; a change after the join is withdrawn, not owed. Was: **The identity screen** (the creation screen of `02`'s pin with a name), stored as a setting, sent on join, editable from the pause menu. Medium; new UI on the kit. Wanted by single player anyway.
31. **Built 2026-10-13 (`02`): Host a game with a code, Join a game with the code typed; the URL's `?host` and `?join` stay for the checks.** Since `09` the title is Worlds, Identities, Settings, Controls: Join a game is on the Worlds screen and hosting is the pause menu's "Open to friends" switch. Was: **The join screen**: host (a code shown) or join (a code typed), the transport chosen by it; the title's Play is "host, alone". Small.
32. **Built 2026-10-13 (`02`): a line typed at the log's foot is said; a guest's goes to the host as the first command.** Was: **The log as the chat**: a text input at the log's foot, Enter sends `say`. Small.
33. **Built 2026-10-13 (`09`, the sixteenth move): the dead screen is the dead player's own, with New character or Leave world; spectating is later, with tier 4.** Was: **The dead screen per player**: New survivor, the spectate rule of `03`. Small once the survivor logic (item 34) exists.

## H. The world's rules that are single-player today (small each)

34. **In part 2026-10-13 (`09`): a new character in the same world from any identity, at the spawn, the body left where it fell.** The body rising as a zombie in your clothes and the respawn by turn are still owed. Was: **Death and the next survivor**: `turnVillager`'s path for a player (a zombie in their clothes with their hands and pockets), the respawn at the inn, the toll house, or the croft by turn (`30` 3.5), the survivor count; the game-over listener that exists nowhere today. Medium; owed to single player by `02`'s 2026-10-08 ruling regardless.
35. **In part 2026-10-13 (`02`): the host's rules travel in every frame and bind the guest's sim reads; grown chunks cross the wire.** The read-only screen is owed. Was: **Settings sorted** (`02` section 8): the world's rules read on the authority from the host's settings or the server's config file; a guest's settings screen shows them read-only; `hairStyle` and `paintedLayers` move into the identity. Small.
36. **The records milestone** (`03-world-model.md`), when built, takes the list of players as its centre: the union of regions, eviction by nearest, alarm and lure per chunk. Not a change, a constraint on an unbuilt thing; noted so it is built once.

## I. The server process (medium, new)

37. **Relay mode built 2026-10-13 (`02`, the fourteenth move, pulled forward): `server/relay.js`, its own handshake with no dependency, deployed on Fly (`wss://cmz-relay.fly.dev`; `package.json`, `Dockerfile`, and `fly.toml` at the root are for Fly alone); the version check is the host's, by `net.PROTOCOL` and the save's version on the join; codes, `/open`, and a limit per address.** The dedicated authority is tier 4's. Was: **`tools/server/` or `server/`** (a Node program, the house style): the WebSocket relay for a listen server, and the dedicated authority that imports `src/world/` and steps it on a timer, saving to disk; a code per world; the version check on join. Medium; the first non-browser runtime in the repo and the one dependency decision (`ws`, or a hand-written handshake).

## What the list is not

Not a rewrite. Items 1 to 22 are the D1, D2, D8 moves of `23a` finished, with ids and events added; the files keep their names and most of their lines. Items 23 to 25 are the save system, owed anyway. Items 26 to 33 are the client, new. Items 34 to 36 are single-player debts. Item 37 is the one genuinely new thing. The biggest single cost by volume is `05-someday`'s tier 3 (every item move and world change as a command), which is items 3, 6, 9, 10 here, and the one most likely to produce duplication bugs, which is why `check("sync")` with the whole world hashed is the gate.


---

## `07-questions-for-michael.md`, as it stood

# 31.07 — The questions for Michael

Defaults in brackets, in the house style. An answer is a ruling for `02` under the day's date; a default left standing is a ruling too. The first four decide the shape; the rest are the game's rules with more than one person in it and can wait for the tier that needs them.

**Status, 2026-10-13, night:** each question is marked below. "Answered" names Michael's ruling in `02`; "built as the default" means the build took the bracketed default with no ruling of its own (a default left standing is a ruling, as above); "open" means neither.

## The shape

1. **Listen server, dedicated server, or both through one world module?** `04` recommends both through one module (the hybrid): the authority written once, run in the host's page on a Tuesday night and in a Node process for a valley that persists. The listen server alone is the smaller build and the smaller promise; the dedicated server alone makes single player depend on a process. [**Both, one module.** It is the only one where single player exercises the multiplayer code every evening.] **Built as the default, its first half (2026-10-13):** the world is one module (`src/game.js`) run in the host's page and headless under Node for the checks; the Node authority is tier 4, optional.

2. **Is a Node process acceptable in the repo?** The game is plain HTML, CSS, and JS with no build step, no framework, and `serve.py` for files. A WebSocket server is not in Python's standard library; it is a hundred and fifty lines by hand or the `ws` package from npm in Node, which the repo already uses for `node tools/check.js`. [**Node, and the dependency decision at tier 4:** a hand-written handshake keeps the repo's "no package.json" law; `ws` is the pragmatic choice if the handshake proves fiddly. Neither touches the game's own code.] **Answered by the relay ruling (2026-10-13, `02`):** Node, with the handshake by hand and no dependency (`server/relay.js`); a `package.json` exists at the root, but only so Fly can find and start the relay.

3. **How many?** The design target sets the atlas, the HUD, and the join screen; the ceiling sets the counts in the step. [**Four as the target, eight as the ceiling.** Four fit in the atlas's free rows today; eight need the second page `23` already scheduled.] **Open:** nothing caps the players in a world; a world remembers sixteen browsers' characters (`MAX_OWNERS`, `src/host.js`; `02`, the worlds review), which is not this number.

4. **When?** `06` says: the big pass as specced, with the six habits; then the save system; then tier 0; the rest when single player is finished, as ruled. The alternative is to pull tier 0 forward (it is saves plus the split `23a` wanted) and let the pass land on a world that is already apart from its window. [**After the pass, saves first, tier 0 next;** pull tier 0 forward only if the pass's step 2 (sleep, the time scale) or its station queues turn out to be easier to write against a world module than against `main.js`.] **Answered in the doing (2026-10-13):** Michael said start; tiers 0 to 3 were built beside the big pass, which holds at step 4, and the save came first as planned.

## The rules

5. **Sleep with a veto: everyone or nobody?** `03` lays out (a) everyone in bed, (b) a majority, (c) each alone. [(a). It is law 6 as written with more voters.] **Answered 2026-10-13 (Michael, `02`, "Sleep in a world with friends"): (a)**, with sleep optional; a sleeper alone in bed while a friend is awake sleeps at ordinary speed.

6. **Pause: never with a guest connected?** Escape opens a local menu over a running world; alone, as today. [Yes. Pausing a friend's game is not a thing.] **Answered 2026-10-13 (Michael, `02`, "On the wire the world never pauses"):** never on the wire, as a host or a guest, with guests or not.

7. **Shared sight: none?** No party vision, no minimap, no friend-through-walls. [None. Sight is the game.] **Built as the default:** each client sees from its own player; another player is drawn only in your sight.

8. **Friendly fire: none?** Swings pass through players as through villagers; arrows and spears land beside, never in. [None in 1.0, by the villagers' precedent; a sandbox setting later if the fantasy is wanted.] **Built as the default:** no ruling of its own.

9. **Chat: the log and bubbles, within sight only?** A typed line is a `say`: a bubble over your head, a line in every log that could see you. No global channel. [Yes. It keeps chat a thing that happens in the world, and it makes shouting across the square a decision.] **Built as the default (2026-10-13, `02`, the eighth move):** the log's foot is the chat box; a line is said, a bubble and a line in every log that could see it.

10. **Ownership: none?** Any chest, any body, any dropped bag, anyone's. No locks, no trade window. [None. Zomboid's rule, and the game has no coin.] **Built as the default:** no ruling of its own.

11. **Death with friends: the next survivor at once, the body a zombie in your clothes with your things?** As `02` ruled for single player (2026-10-08) and the parent built. [Yes, and the dead player sees what their body sees until they take a new survivor.] **Answered in part (2026-10-13, `09`):** a new character in the same world from any identity, the body left where it fell; spectating later, with tier 4. The body rising as a zombie is not built.

12. **The world with nobody in it: stopped?** A dedicated server with no player connected does not run the clock. [Stopped. The sim runs only where a player is, which with no player is nowhere; fires and crops are where you left them, as the law "things run out because you used them" wants.] **Answered by the build (2026-10-14, `02`): held when empty.** A server world runs while anyone is in it, is held when it empties, and is stopped and saved after a spell empty (`server/world.js`); a browser-hosted world lives while the host's page does.

13. **The host's rules bind the guests?** Zombie aggro, survival, free building, multi-hit, combat testing, the square's surface, and the data files are the authority's; a guest's settings screen shows them read-only. [Yes.] **Built as the default in part (2026-10-13, `02`, the seventh move, with Michael's question on trees):** the rules travel in the frame and bind a guest's sim; the read-only screen was built 2026-10-14 (`src/ui/screens.js`).

14. **The dev console on the authority only?** `give`, `teleport`, the clock keys, `giveKit` for the host alone; a guest's `__game` reads its replica. [Yes.] **Open:** nothing in `dev.js` limits a guest's `__game` yet.

15. **Names over heads?** For players within sight, placed like the speech bubble, with a setting to hide them. [Yes, on by default.] **Built as the default (2026-10-13, `02`, the eighth move; `ui/names.js`).**

16. **The identity screen now, in single player?** The creation screen pinned in `02` (look, hair, facial hair, the painted layers) with a name, kept as a setting, editable from the pause menu. It is the one screen that travels, and single player wants it anyway. [Yes, as item 30, whenever the character art lands; it does not wait for multiplayer.] **Answered 2026-10-13 (Michael, `02`), then reshaped by `09`:** the character screen is an identity's editor; a character takes its identity's name and look at creation and keeps them.

17. **Reconnect grace: two minutes?** A dropped player's character stands where it was for the grace period, then the dead may have it. [Two minutes, a tunable.] **Answered 2026-10-13 (Michael, `02`, the review of `09`), otherwise:** no more than sixty seconds of game time standing, then dormant, out of the world and never hunted, until the rejoin (`net.js` `GRACE_S`).

18. **The wire in JSON?** Plain objects, readable in the console, the house style; a binary snapshot only if a profile ever asks. [JSON.] **Built as the default;** the bytes are counted (`net.status().wire`), and the measured weight was cut by deltas and pacing, not by a binary form (`02`, the wire's four parts).

19. **Voice: never in 1.0?** The browser could carry it (WebRTC audio) with the same signalling the relay provides. [Not in 1.0; nothing forecloses it; the text log is the chat.] **Stands as the default.**

20. **Where does the relay run?** (2026-10-13, after the two-browser test: the GitHub Pages site is the client, so the relay must be reachable from it as `wss://`, which means TLS.) The choices: a free hosting tier that gives TLS and a stable name for nothing (Fly, Render, Glitch, and the like; the process sleeps when idle and wakes on the first connection, which costs the host a few seconds); Michael's own machine with a tunnel (`cloudflared`, `ngrok`) that gives the TLS name, up only while he runs it; a cheap box later. [The relay's address a constant in `net.js` the Pages build carries, overridable by `?relay=`; a free tier first, since nothing of his stays on when he closes the laptop and a sleeping relay costs only a wait at the first join.] **Answered 2026-10-13 (Michael): Fly, a new organisation `cozy-medieval` with its own card, apart from his other project; the app `cmz-relay` at `wss://cmz-relay.fly.dev` (region ord), a machine that stops when idle and starts on the first connection, deployed from the branch's Dockerfile with `fly launch --copy-config` and `fly deploy --remote-only --ha=false`. `RELAY_URL` carries it; `02`.**


---

## `08-for-the-coder-agent.md`, as it stood

# 31.08 — The rules every change follows, now that multiplayer is live

**Since 2026-10-13 (Michael): multiplayer is live, and every addition and every change is built for it in the same commit.** Friends play over the relay. Nothing is built for the host alone with the guest's side owed for later; letting it lag a week means a pile of catch-up work, and that is what this rule exists to prevent. The six habits below were written before anything was built, to keep the door open; they are now the floor, and the checklist on top of them is what "done" means:

1. It runs in the world's step on the authority (the host), never in a DOM handler or a client-only module.
2. A guest can do it through the same path the host's player uses: a verb in `verbs.js`, a handler in `ui/inventory-actions.js` (a guest's call becomes a command by uid, slot, and bag address), a key event in the player's snapshot (`interact.keyEvents`), `placement.performPlacement`, or a `net.send*` command. Every target is an id, an address, or an entry's uid.
3. What it changes reaches a guest: in the save, which is the welcome (`game.serialize`, `restore`), and in the frame (a player's light or heavy record, the delta of the dead with its roster, the pokes, the touched chunks, the stations' queues). The replica draws it as the host does. Whatever the host remembers of what it sent is forgotten when the thing leaves the world and at every welcome (`forgetSent`).
4. World state it adds is in the sync check (`game.syncParts`), or the reason it is left out is written beside the exclusion.
5. Per-player state lives on the player, never in a module-level variable; time comes from `loop.simTime()`, chance from `rng`.
6. It is tried with a guest in two tabs (`?nosave&relay=none`, `__game.net.open({ join })`, both tabs stepped in turn) and `check("sync")` passes; the bytes it adds to a frame are read from `net.status().wire`, never guessed.

A spec names the guest's side of every feature as it names the host's. A review refuses a change that has only the host's.

The original six habits, as they were handed to the big pass's implementer, follow. One block, copy-ready, no tables; the tiebreaker and the pause it names are as of 2026-10-12 (the tiebreaker is replaced by the rule above, and pause was built as the loop's own, never on the wire). It adds to `CLAUDE.md`'s tiebreaker and `05-someday.md`'s free rules; it changes nothing in `30`'s content or order. Each habit is an item marked (now) in `31/05`, free while the code is written and a rewrite later. Michael may paste it into the implementer's instructions as it stands.

---

Six habits for the big pass (docs/30), from the multiplayer plan (docs/31), on top of CLAUDE.md's co-op tiebreaker and docs/05's free rules. None of them builds multiplayer; each keeps a door open at no cost.

1. Anything kept across a step refers to a prop by its id, never by holding the object. Give every prop an id at creation (a per-world counter on the map, saved with it; the generator may write ids into the map file). An action's target, a carried prop, a station a player is working, a crop being watered: store the id and look the prop up when the step runs. Walls are addressed by their tile and edge, which they already carry as wall.at.

2. Make every item entry through one function (items.makeEntry or the like) that stamps it with an instance id from the world's counter, and never write a literal { id, count } object. When an entry is copied (a drop, a throw, a torch taken from a holder) the copy keeps the id; when stacks merge, the entry that absorbed keeps its id and the emptied one is gone. The grid's placement rules do not change.

3. Every change to the world is a function on the map (or on the prop's own module) that names its tile, calls map.touch(x, y) with it, and emits an event on the bus saying what changed, with ids and addresses in the payload. Soil tilled, a seed planted, a stage grown, a plot watered, a crop harvested, a fire fed, a station's queue advanced, a stack that gave a log, a rock mined, a door opened: each is one mutator and one event. Nothing writes tile.prop, a wall's open flag, a prop's fuel, or a container's searched flag from outside that function. The no-argument map.touch() is for boot only.

4. Every verb is a row in a verb table keyed by name, with perform(world, player, target, args), where target is an address (a tile, a tile and edge, a prop id, a character id, an entry id and where it is). No inline closures as actions. A timed action stores the verb, the target, the start tick (loop.simTime()), and the duration on player.action, and perform re-validates its target when it fires (the tree still stands, the chest still exists, the planks are still in the bag), so two actors can never fell one tree twice. The interactions.json resolver of step 3 is this table's first half; build the rest on it.

5. A new menu entry, panel handler, key, or settings row calls one function that does the thing, with the player and the address as arguments, and that function does nothing but call the verb table or a mutator. The DOM handler is a thin caller, so the same function can later be called from a command queue at the top of the step with nothing changed.

6. Sleep's fast-forward (step 2) is a field on the world (a time scale, 1 normally, 60 asleep) that the loop reads to decide how many steps to run per real second; never a dt multiplier, never a clock jump, never a variable owned by the loop or the player. Pause, when it is reworked, is that scale at zero.

And two that cost nothing at all: never write kind === "player" to mean "me" (compare ids), and never add a module-level let that holds something belonging to one player (a draw, a ghost, a carried light, an open container); put it on the player, or on the client's own state if it is a preview.

When one of these forks a choice against the simpler single-player way and you take the habit's way, say so in the commit message, as CLAUDE.md's tiebreaker asks.

---

Why these six and not the whole of `31/05`: these are the places the big pass writes new code; everything else in `05` is a change to code that exists, which is done when the tiers come and costs the same whether the pass has landed or not.


---

## `09-worlds-identities-characters.md`, as it stood

# 09 — Worlds, identities, characters

*Ruled by Michael, 2026-10-13, after his first real join through the relay (`02`). Zomboid's model, named plainly. This replaces the one-identity-per-browser arrangement of `03` and the "You screen" there; the character screen built by the coder agent becomes the identity editor. Scoped for building on the multiplayer branch, before the rest of tier 3 (`06`).*

**Status, 2026-10-13: built (the sixteenth and seventeenth moves, `02`), and the description of the game as it is; where the build settled a detail differently, the text below says so in place.**

## The words

- **A world** is a valley with its state: the map as changed, the dead, the fires, the clock, and every character in it. A world is saved in the browser that made it, one record each, and it is what a host opens to friends. A world keeps its code once it has one.
- **A character** is a survivor in one world: a player record there, with its bag, its wounds, its position, and later its skills, its profession, its story. **A character belongs to its world, full stop.** When the world goes, so does the character. A character is never moved between worlds and never saved apart from its world.
- **An identity** is a name and a look, kept in the browser, reusable. It is the seed a character is made from, and nothing more: once the character exists, the identity is not consulted again. **A stamp** (Michael): an identity edited and saved applies to every character made from it afterwards and never backfills a character already stamped; that character keeps its name and face until it dies. Michael keeps a "Michael Dippold" identity and makes a character from it in every world; no two of those characters are the same character because they share it. Editing an identity changes no character anywhere.
- **A browser id** is a hidden token each browser carries, so a world can remember which browser's character is which. It is not shown and never typed.

## The rules

1. **Each character belongs to a world.** Its bag, its hurt, and everything later hangs from the character, and the character hangs from the world.
2. **Entering a world means making a character for it.** A new world of your own: make a character. Joining a friend's world the first time: make a character. **Character creation is a multi-step process** (Michael): step 1 is the identity (pick one, make one, edit one), step 2 is a placeholder page reading "Step 2 of 2: to come" where skills and a profession will go, with Back and Next as Zomboid has them; Next on the last step makes the character. The steps exist now so that it is plain the identity is one part of a character and not the character.
3. **Identities are kept and reused.** The identities screen lists them, lets you make, edit, and delete them. A new character after a death takes an identity the same way; you make a new identity only if you want a different name or face.
4. **Rejoining a world you have a character in returns you to that character.** The world remembers your browser id (its hash) against your character. No identity is asked for: you were made to make a character the first time, so you have one. If that character died, you make a new character for that world (rule 2), choosing an identity (rule 3); the body stays where it fell. **While you are away** (your leave, or your connection gone) your character stands for sixty seconds of game time, then goes dormant: out of the simulation, not drawn and not hunted, its spot and bag kept, back where it stood when you rejoin (Michael, 2026-10-13, Zomboid's way). The host's own character is never offered to a guest; a newer join from your browser replaces an older connection of yours.
5. **No world runs until you choose one.** The title is a plain screen; nothing is created, stepped, or autosaved behind it. The checks get a fresh world through the test flag on the URL.
6. **A guest never saves a world.** The world is the host's; a guest keeps only a bookmark to it (below).
7. **A world keeps its code, and hosting is a switch** (Michael): "Open to friends", on or off, in the pause menu (as built; the world's row has none), remembered with the world so it is open again the next time it is played. On, the world is registered on the relay under its code and anyone with the code can join; off, the relay drops the room, guests are told the host closed the world, and their characters stand in it, saved. The first time the switch goes on, the code is drawn and saved with the world. A world is a world: one with a code has been open at some point, and the row shows the code; there is no separate kind of save. If the relay reports the code in use, a new one is drawn and saved.
8. **The host's save is never older than the last join or leave.** Hosting saves the world first; a guest joining or leaving saves it again; the autosave runs as before.
9. **The join carries the build's version**, as built the wire's protocol number (`net.PROTOCOL`) and the save's version, each bumped by hand. A host refuses a guest on another with a sentence that says whose is newer; both refresh.

## The screens

**The title.** Worlds, Identities, Settings, Controls. No Play, no New game, no Continue: those live on the Worlds screen, where it is clear which world they mean.

**Worlds.** Two lists and three buttons.
- *My worlds*: one row per world saved in this browser: its name, the day and hour, your character's name there (or that they died), and its code if it has one. Each row: Play (New character when yours is dead) and Delete (Delete asks once); hosting is the pause menu's switch.
- *Friends' worlds*: one row per world this browser has joined or tried to join: the world's name as the host sent it, the host's name, the code, your character's name there, when you were last in it, **and whether it is open right now** (Michael: a green dot), which the relay answers to a plain request for the code (`GET /open?code=…` gives whether a host holds it and how many guests are in), asked every ten seconds while the screen is up; the dot is the confirmation that the world is running in someone's browser and open before Rejoin is pressed. Each row: Rejoin, Forget.
- *New world*: asks for a name (a default offered: the map's and the date) and which identity; creates the world, makes your character from the identity, enters.
- *Join a game*: asks for a code; the join goes out with your browser id; if the host knows no character for it, the host answers "who", the screen asks which identity, and the join goes again with it; then the welcome. The bookmark is written at the first attempt, so a failed join still leaves a row to Rejoin from.
- *Rejoin* on a friend's row: the join with the saved code and your browser id. While the relay answers that no world is open under the code, it keeps trying every few seconds for a minute, with "Waiting for Michael to open the valley" and a Cancel: two friends refreshing at once is the usual case, not a failure.

**Identities.** The list, with New, Edit, Delete. The editor is the character screen as built (the name, the skin, the hair, the colours, the turning preview), renamed for what it edits. Deleting an identity touches no character.

**The pause menu.** Its first lines say where you are: the world's name and your character's name; on the wire, "Hosting, code hazel-tgr, 1 friend" or "In Michael's valley as Whipitgood". Resume, Save world (a host or a player alone), Open to friends (the switch, on or off, with the code and who is in; not on a guest), Character (this world's character: its name, its look, later its skills, shown, not edited), Settings, Controls, Leave world (saves if it is yours, then the Worlds screen).

**The dead screen.** "Whipitgood died." Then New character (choose an identity, a new survivor in this same world; the body stays) or Leave world. The next survivor of `05` item 34, done here.

## The data

- `settings.identities`: `[{ id, name, look }]`, and `settings.lastIdentity`, the one picked last (`src/identities.js`). The current `playerName` and `look` become the first identity on the first boot after this lands, named from `playerName` or "Survivor".
- `settings.clientId`: the browser id, drawn once from `crypto.getRandomValues`.
- A world's save gains `worldId`, `name`, `code` (or null), `created`, `open` (the switch, remembered), `owners: { [hash of clientId]: playerId }` (built as `owners`, since `characters` is the save's own list of them; the hash, `identities.idHash`, so an exported save never hands out the proof), the host's memory of whose character is whose, at most sixteen browsers (`MAX_OWNERS`), `dormant` (the characters of guests away, by the same hash), and `myPlayerId` for the index's row. These ride in the save's wrapper, never in what a guest receives. The host's own entry is in it too, so a world opened in another browser from an exported save behaves the same.
- The store (`src/save.js`): one record per world in IndexedDB (the database `cmz`, the store `worlds`, keyed by `worldId`; Michael, 2026-10-13: moved there at once rather than when the small store bites), and an index `cmz.worlds` in localStorage of `{ worldId, name, mapName, savedAt, created, label, code, myCharacter, dead }` for the list without reading every save. Under `?nosave` both are in memory for the page. The existing single slot per map became a world named "The valley" with no code on first boot.
- `settings.joined`: the friends' worlds, `[{ code, name, hostName, myCharacter, lastAt }]`, the last twenty.

## The wire

- `join { clientId, protocol, version, name, look }`, the name and look only once the host has asked. The host: another protocol or save version, `bye { reason: "version", newer: "host" | "guest" }`. No browser id, `bye { reason: "refused" }`; a seventeenth browser, `bye { reason: "full" }`; an older connection from the same browser, `bye { reason: "replaced" }` to it. A living character for the id's hash, back from dormancy if it went, the welcome with that `playerId`. None and no identity, `who {}`; the guest asks for an identity and joins again (`joinAs`). None and an identity, a new character (the name's length, the hair style, and the colours clamped), the welcome. The host records `owners[hash] = playerId` and saves.
- `leave` and a dropped socket: the character stands for sixty seconds of game time (`net.js` `GRACE_S`), then goes dormant, out of the simulation with its record in the save's wrapper, until the rejoin. A host leaving makes every guest's character dormant before its save.
- The relay carries these as it carries everything, and sends a host's broadcast only to a guest the host has welcomed, closing one the host sends a `bye`; it answers `GET /open?code=` with `{ open, guests }`, at most 120 lookups a minute per address.

## What goes

- The one identity per browser on the join (`03`); `net.setIdentity` becomes the chosen identity for the join in hand.
- The character screen as the first Play's gate; it is the identity editor, reached from Identities and from New world and Join.
- The owed item "change of name or look on a guest after join" (`06`, tier 1's owed): not a thing by design. A character's name and look are what its identity gave it; a new face is a new character.
- The title's Play, New game, Continue, Host a game, Join a game: all on the Worlds screen, against a named world.

## The order

*Step 1 built 2026-10-13 (`02`, the sixteenth move): `check("worlds")` 8 of 8. As built: `?nosave` boots a test world for the checks, with the store and the identities in memory for the page; a guest from the Worlds screen stands in a never-saved world until the host's arrives; `?host=` and `?join=` on the URL are the checks' now.*

*Steps 2 and 3 built 2026-10-13 (`02`, the seventeenth move), with the coder agent's review built in: the join by the browser id with a protocol number and the save's version, the owners as hashes in the save's wrapper, a newer join replacing an older connection, the host's own character never offered, the host clamping a guest's identity; dormancy after sixty seconds of game time with the record in the wrapper (`dormant`); the store on IndexedDB; codes of two words and four letters; the relay's `/open` with a rate limit; the friends' rows' dot; Rejoin polling for a minute. The join sends no identity until the host asks (`who`), so a browser with a character there is never asked.*

**Behind the title (Michael, 2026-10-13):** black until the painting comes; Michael works on the art. A still picture, not a world.

1. Alone: identities, the worlds store and index, the migration of the one slot, the Worlds and Identities screens, the pause menu's first lines, no world behind the title, the dead screen's New character. `check("worlds")`: a world made, left, listed, re-entered as the same character; a second world with a second identity; a death and a new character in the same world; the identity edited and neither character changed.
2. The wire: the browser id and the version on the join, `who`, the characters map and the reconnect, the host saving on join and leave, a world's code kept.
3. Friends' worlds, Rejoin with its minute of trying, Forget.

Then tier 3's remainder over it (`06`).

## Questions for Michael, answered 2026-10-13

1. A world's name: **typed, with a default offered.**
2. A character's look after creation: **fixed.** "If you need a new character, sprint into the dead; that will do it."
3. A dead character's bookmark on a friend's world: **kept; Rejoin leads to New character.**
4. Spectating after a death in a friend's world: **later, with tier 4.**

And, asked back: many single-player worlds at different points in time, revisited freely, **yes**: that is the My worlds list, each row a world at its own hour.


---

