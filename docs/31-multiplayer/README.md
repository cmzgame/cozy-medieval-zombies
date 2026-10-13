# 31 — Multiplayer: the assessment and the plan

**Status, 2026-10-13: Michael read the plan and said start; the work goes on this branch (`claude/multiplayer-architecture-planning-0fde9c`), merged to `main` in small moves under the big pass, never a long-lived branch; tier 0's item 8 is built (`02`, the ruling; `06`, the tier). The six habits in `08` are with the coder agent. Was: a planning pass, written 2026-10-13 at Michael's ask, from a read of every doc in `docs/` and three surveys of `src/` (file:line throughout). Nothing here is ruled, nothing is built, and no code was touched. The brief: pick up the threads the docs already carry about co-op (the tiebreaker in `CLAUDE.md`, the feasibility note in `05`, the free rules applied in `23`, the co-op notes in `30`, the creation screen pinned in `02`), assess what is built and what is planned, and say what would have to change for the robust, fairly maximalist version of multiplayer, because the simplest version would not be worth doing. A one-browser-hosts model is fine; a server is not out of the question. The questions that only Michael can answer are in `07`; his answers go to `02` as rulings, as always.**

## The verdict in one paragraph

Feasible, and the engine work of 2026-10-12 did most of the cheap part already: the simulation has one seeded generator and one stepped clock, the rules it reads are a snapshot, the player's controller takes an input snapshot "that could come from a wire", every character is one model with an id, and the wild grows identically from a seed on any machine. What stands in the way is not performance and not the renderer; it is **a dozen module-level singletons that mean "the one player"** (the bow's draw, the combat clock, the placement ghost, the carried light, the camera and the iso origin, the open container, the key trackers), **the lack of ids on anything that is not a character** (props, walls, item entries, floor items), **about a dozen world changes that happen inside DOM click handlers outside the fixed step**, and **chunk growth driven by whatever reads a tile, the renderer included**. None of those is deep; all of them are wide. The design that avoids Zomboid's sync trouble is the one `05` already names: **one authority**. The maximalist version is that authority written once as a headless world that runs either in the host's browser page (a listen server, no infrastructure) or in a Node process on a machine that stays up (a dedicated server, a world that persists while friends come and go), with the browser as a replica that renders, predicts its own walking, and sends commands. The save system, not yet built, is the same serialisation a joining player receives, so it should be built first and built as the wire format. The big pass (`30`) can go ahead single-player as specced, provided its implementer keeps six habits listed in `08`, which cost nothing now and save a rewrite later.

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
| [08-for-the-coder-agent.md](08-for-the-coder-agent.md) | The six habits for the implementer of `30`, as one copy-ready block. |

## How this relates to the other docs

- `05-someday.md`, "Co-op" (2026-10-12) is the feasibility note and the free rules. This folder is the plan that note said would come if the game got there; it does not reopen the verdict (feasible, large, one authority), it works it out.
- `CLAUDE.md` and `02` (2026-10-12) hold the tiebreaker: all else equal, the multiplayer-friendly fork. This folder names the forks the big pass is about to meet (`08`).
- `23` and `23a` are the engine upgrade. Its group C (determinism), D1 (the controller from a snapshot), D8 (the singletons that are really per-player state, "done file by file as step 2 touches each, never as a pass of its own") are where multiplayer was already being kept possible; `02` says which were done. D8's list is still open and is most of `05`'s section 2.
- `30` is the next build. Section 3.3's co-op note (sleep as a speed multiplier, nothing poked) and law 1 (everything is data) are the right shape; `08` adds what else its implementer should do.
- `03-world-model.md`'s records (the active region, alarm, lure, trickle: not built) are the one unbuilt milestone whose design changes with more than one player: the active region becomes a union of regions, one per player. `05` here says how.
- `19` (one character model) and `11` (everything is a slot) are the groundwork for players as a list.

## Words used here

- **Authority:** the one process that owns the world and steps it. Nobody else may change the world; everybody else asks.
- **Replica:** a client's copy of the part of the world it can see, kept current by the authority, drawn by the renderer, never stepped as the truth.
- **Command:** what a player asks the authority to do, as data: walk this way, swing at this aim, open this door, move this item from here to there. The authority validates and performs, or refuses with a reason.
- **Event:** what the authority tells replicas happened: a door opened, a zombie died, a fire lit, a line said. Replicas apply events to their copy.
- **Snapshot:** the state of what a replica can see, sent whole on join and as deltas while playing.
- **Interest region:** the chunks a replica is told about, the client's own active box; the union of every player's region is what the authority simulates.
- **Listen server:** the authority runs inside the host player's browser page; guests connect to it.
- **Dedicated server:** the authority runs in a Node process with no renderer; everyone, the host included, connects as a guest.
