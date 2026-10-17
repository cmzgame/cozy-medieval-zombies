# 31 — Multiplayer: the game with friends in it, as built

**Status, 2026-10-16: the multiplayer core is Done (`02`, 2026-10-15), and this folder describes it as built.** Friends play over the relay (`server/relay.js` on Fly, `wss://cmz-relay.fly.dev`) from the GitHub Pages site, in a world hosted by one browser or by a server world beside the relay (`server/world.js`). The world is one headless module (`src/game.js`; `node tools/world.js` runs it under Node); the save is the worlds store (`src/save.js`) and the welcome a guest receives; the wire is `src/net.js` (a guest's own walking predicted, a frame every third step, deltas, smoothing); what a host does beyond the step is `src/host.js`, shared by the browser host and the server world; every verb a guest can reach is a command, and `check("sync")` compares the whole world on both sides. Since 2026-10-13 every addition and every change is built for a guest in the same commit (`CLAUDE.md`, the two rules of shipping; `08` is the why). Waiting as later work, in `05-someday.md`: spectating, lighter frames on busy nights, the bounded rewind. Still open from the plan, for issues in wave 4 of #70: seams 7, 26, 34, and 36 (`05`), a duplication count for `check("sync")`, and a guest's `__game` read-only.

## The files

| File | What it holds |
|---|---|
| [03-the-game-with-more-than-one-player.md](03-the-game-with-more-than-one-player.md) | Play with friends, system by system, as built: characters, sight, light, the dead, needs, sleep, pause, death, chat, containers, building, stations, combat, the bow, the world with nobody in it, saves and joining. The source of the wiki's "Playing with friends" and every "With friends" section. |
| [04-the-architecture.md](04-the-architecture.md) | The wire as built: the authority (`game.js`, `host.js`), the replica, what a frame carries, versions, determinism's three jobs, the two-tab test. |
| [05-the-seams.md](05-the-seams.md) | The 37 seams of the plan as a table, one row each: what was built, where, and which are still open. The numbers are cited across the docs and the code. |
| [08-for-the-coder-agent.md](08-for-the-coder-agent.md) | The reasoning behind each point of `CLAUDE.md`'s multiplayer rule, which is the checklist's one text. |
| [09-worlds-identities-characters.md](09-worlds-identities-characters.md) | Worlds, identities, characters (Zomboid's model, ruled 2026-10-13): the words, the rules, the Worlds and Identities screens, the data, the join and the rejoin on the wire. |

**The record of the build** is under `docs/history/`: `31-01-the-breadcrumbs.md` (what the docs said about co-op before the plan), `31-02-the-audit.md` (the code read against the free rules at `ac2f63f`), `31-06-the-order.md` (the tiers and the build diary), and `31-multiplayer-record.md` (this folder's other files as they stood before the sweep: the plan's options and brackets, the seams' "Was:" blocks, the twenty questions for Michael and their answers, the original six habits, `09`'s order of building). The rulings are `02`, under the Multiplayer heading of its topic index. The feasibility note the plan grew from is `05-someday.md`'s co-op entry.

## Words used here

- **Authority:** the one process that owns the world and steps it: the host's browser page, or a server world. Nobody else may change the world; everybody else asks.
- **Host:** the authority's side of the wire, whether a browser or a server world (`src/host.js` is what it does beyond the step). **Guest:** a client joined to a host's world. In a server world everyone is a guest.
- **Replica:** a guest's copy of the world, kept current by the host's frames, drawn by the renderer, never stepped as the truth.
- **Command:** what a player asks the authority to do, as data: an action on an address, an item move by uid and slot, a placement, a craft, a line said, a poke. The authority performs it through the handler the host's own click uses, or refuses with a reason.
- **Welcome:** the whole world as a save, sent to a guest on the join. **Frame:** what the host sends every third step: the chunks touched, the players' records, the dead and the villagers and the corpses as deltas, the pokes, the queues, the carried lights, the rules, the arrows.
- **Dormant:** a character out of the world while its player is away, kept in the save's wrapper, back where it stood on the rejoin (`09`).
- **Interest region:** the chunks a replica is told about. *Not built: every guest is told the whole world.*
- **Event:** what the host's bus says happened, for the host's own listeners. *No event list travels: a change touches its tile and the chunk travels (`04`).*
