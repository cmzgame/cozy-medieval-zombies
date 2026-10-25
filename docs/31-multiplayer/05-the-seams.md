# 31.05 — The seams: the 37 changes the plan named, and what became of each

**Status, 2026-10-25: 35 of the 37 built, in the plan's form or in one the build found better; 2 open (34 in part, 36), features that wait for their own scope (#102).** 7 and 26 were built by #102: the renderer's and the interface's notes on the world's objects are the client's own, by id, and the client object holds `client.me` (`src/client.js`); with them a guest's `__game` became read-only (`31/07` question 14). The item numbers are the plan's and are cited across the docs and in code comments (`docs/31/05, item 8`), so they are kept as they were. Each item's "Was:" (the change as the plan wrote it, with the file:line of the code at `ac2f63f`) and its build notes are the record, `docs/history/31-multiplayer-record.md` (`05` as it stood); the audit that found the seams is `docs/history/31-02-the-audit.md`. The groups are the free rules of `05-someday.md`'s co-op note: ids on everything (A), every change through a mutator (B), the step owns every change (C), the player passed and never reached for (D), nothing freezes the sim (E), the world headless (F), the client (G), the single-player rules (H), the server (I).

| # | What was built | Where | Open? |
|---|---|---|---|
| **A** | **Ids on everything that can be named** | | |
| 1 | Every prop has an id from the world's counter; a guest's command names a prop by it | `map.js` (`propById`) | built |
| 2 | A wall is addressed by its tile and edge; an action on a wall carries the edge | `map.js`, `interact.js` | built |
| 3 | Every item entry has a `uid` from the world's counter, made through `items.makeEntry`; a copy keeps it, a merge's survivor keeps it | `items.js`, `grid.js`, `map.js` | built |
| 4 | Players are `P<n>` and the dead `z<n>`, from the world's counter (`world.nextId`), never the literal `"player"` | `world.js`, `entities/` | built |
| 5 | One figure sheet per player, `player_<id>`, baked when the player is first seen | `entities/player.js`, `main.js` | built |
| **B** | **Every world change through a mutator** | | |
| 6 | A change touches its tile and the frame carries the touched chunks whole; sways ride as pokes (`interact.takePokes`); no event list travels | `map.js`, `interact.js`, `net.js` | built, in its own form |
| 7 | The renderer and the interface stop writing on shared objects: who stands behind a tall prop and the swing's targets are ids in the client's own sets (`client.behind`, `client.targets`), and the bubbles leave a line's end to the world's step (`game.js` `ageSpeech`, #154). The host's flag had been saved and sent in the dead's records, and drawn on a guest as the host's targets | `src/client.js`, `render/scene.js`, `render/entities.js`, `combat.js` `markTargets`, `ui/speech.js`, `ui/zombie-bars.js` | built (#102) |
| 8 | Reading never grows a chunk: `tileAt` reads, the mutators grow (`growTile`), the ring of four round each player; `check("growth")`, the hash equal across zooms and window sizes | `map.js` | built |
| **C** | **The step owns every change** | | |
| 9 | A guest's panel sends every drag, drop, double-click, and menu entry as a command by uid, slot, and bag address, run on the host by the same handlers | `ui/inventory-actions.js` (`createRemoteInventoryActions`, `performItemCommand`) | built (the menu's world entries run on arrival, not from a queue) |
| 10 | Every action carries its subject's address; a guest's menu and E are rebuilt and run on the host (`actionsForTarget`, `performByLabel`); the newer verbs are rows in a table with `validate` | `interact.js`, `verbs.js` | built; the older actions are closures rebuilt by address |
| 11 | A player's record carries `actionView` (the label and the place) with the progress; a guest's prompt draws the bar | `interact.js`, `net.js` | built |
| **D** | **The player passed, never reached for** | | |
| 12 | The bow's draw is on the player; a guest draws and looses on the host at the ground point it sends | `archery.js` | built |
| 13 | The combo window on the sim's clock; the camera kick an event the striking client answers; hit-stop refused on the wire (`loop.setFreezeAllowed`) | `combat.js`, `loop.js`, `net.js` (`kickTo`) | built; the client's own hit-stop hold waits (`05-someday.md`) |
| 14 | The ghost, the Use mode, the key trackers, and the buttons are the client's own; the world takes the player and what was asked | `placement.js` (`performPlacement`), `use.js` (`applyWith`), `interact.js` (`keyEvents`) | built |
| 15 | The carried lights are a list, one per player, each with its owner | `light.js` (`setCarriers`) | built |
| 16 | The player module reads no keyboard: `updatePlayer` takes the snapshot; a guest's aim travels as a vector and a ground point, its pokes by prop id, never a pixel | `entities/player.js`, `net.js` | built, in its own form |
| 17 | `src/game.js` holds the state and the step order (`begin`, `step`, `nearPlayer` over the players list); `main.js` is the client | `game.js`, `main.js` | built; the client object proper is item 26 |
| 18 | Events name their people (the bites, the block, the broken guard, death); an opened container finds its guest by the acting player | `game.js` (`state.acting`), `net.js` (`openedFor`) | built |
| 19 | The dead hunt the nearest player in sight, players preferred; the thinking box and the growth cover every player | `entities/zombie.js`, `game.js` (`nearPlayer`) | built |
| 20 | `player === me` in the renderer's hole and exemption and in the bubble, never `kind === "player"` | `render/scene.js`, `render/entities.js`, `ui/speech.js` | built |
| **E** | **Nothing freezes the sim; time is the world's** | | |
| 21 | The time scale is the world's, computed each step from who is asleep (`game.timeScaleNow`); pause is the loop's own, off the wire, not a scale of zero | `game.js`, `world.js`, `loop.js` | built |
| 22 | The host's world steps from a Worker's timer while its tab is hidden (`loop.setBackgroundDriver`) | `loop.js` | built 2026-10-13 |
| **F** | **The world headless** | | |
| 23 | The world boots with no window: `game.create`, `assets.setHeadless` and `setJsonReader`, `figure.describeFigure`; `node tools/world.js` prints the pane's hash | `game.js`, `assets.js`, `tools/world.js` | built; `src/world/` was never made, and the join, the commands, and the frames live in `net.js` |
| 24 | `game.serialize` and `game.restore` over the map's and the characters' own; the worlds store; `check("save")`, `node tools/world.js --roundtrip` | `game.js`, `save.js`, `map.js`, `entities/character.js` | built |
| 25 | `check("sync")` compares `game.syncParts` on the host and each guest at the frames the host marks | `tools/checks/sync.js`, `net.js` | built |
| **G** | **The client** | | |
| 26 | `net.js` holds the roles and the transport; `main.js`'s step branches on them; the client object holds `client.me`, which every client module reads (main.js, net.js's prediction, the ear, the console): it follows the world's own picks by the `playerPicked` event, a guest's is the player its welcome named, found again only when a frame's list holds a new object under its id, and the dead screen's is my body. The world's `state.player` is the world's own pick, which the client no longer writes | `src/client.js`, `net.js`, `main.js`, `game.js` | built (#102); the replica, the transport, the predictor, and the interpolator stay in their modules |
| 27 | A guest predicts its own walking; the host acknowledges by sequence; the guest replays the rest | `net.js` (`pending`) | built |
| 28 | Remote bodies drawn between frames at a fixed delay behind the newest (a few positions kept per body, interpolated by the host's sim time; #248), `netTo` the host's truth | `netsmooth.js`, `net.js` (`smoothStep`) | built, in its own form |
| 29 | A sheet per player, redrawn in place from the identity and the worn list; the second atlas page not yet | `main.js`, `assets.js` | built; the second page when a group asks |
| 30 | Identities kept in the browser, the character screen their editor, a character stamped from one at creation and fixed after | `identities.js`, `ui/screens.js` | built (`09`) |
| 31 | Join a game on the Worlds screen; hosting is the pause menu's "Open to friends" switch | `ui/screens.js` | built (`09`) |
| 32 | The log's foot is the chat; a guest's line goes to the host as a `say` | `ui/log.js`, `net.js` (`sendSay`) | built |
| 33 | The dead screen is the dead player's own: New character or Exit game | `ui/screens.js` | built; spectating waits (`05-someday.md`) |
| **H** | **The world's rules that were single-player** | | |
| 34 | A new character in the same world from any identity, at the spawn; the body lies where it fell, searchable | `host.js`, `ui/screens.js` | **open in part**: the body rising as one of the dead, the respawn by turn (`30` 3.5) |
| 35 | The host's rules bind the guest: they go in the welcome and in a frame whenever they change; a guest's pause menu (World rules) shows them as the host set them | `net.js`, `rules.js`, `ui/screens.js` | built |
| 36 | The records milestone takes the list of players as its centre: the union of regions, eviction by the nearest, alarm and lure per chunk | `03-world-model.md` | **open**: not built |
| **I** | **The server** | | |
| 37 | The relay, its own handshake with no dependency, on Fly; a server world as the authority, sharing `host.js` with a browser host | `server/relay.js`, `server/world.js`, `src/host.js` | built |

**What stays open.** Item 34's remainder (turning, the respawn by turn) and item 36 (a constraint on the unbuilt records milestone), both features needing their own scope (#102). Items 7 and 26 were built by #102. Nothing else of the list is owed.
