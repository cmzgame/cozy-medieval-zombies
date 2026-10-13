# 31.06 — The order: tiers, sequencing against the big pass, and what is done now for free

Sizes are scope, never time (`no-time-estimates`). Each tier ends playable with its check green and a `02` entry; the item numbers are `05`'s.

## When, relative to `30`

Single player is finished first (`02`'s ruling; `05-someday`). The big pass (`30`, nine steps) is the next build and should go ahead as specced. The question is what it bakes in meanwhile, and the answer is the six habits in `08`: they are the (now) items of `05`, each free while the code is written, each a rewrite later. With those kept, the multiplayer work can begin after the pass (or after any step of it, since none of the tiers below needs the pass's content) without undoing it.

The one thing that should come **before** the net and **after** the pass's needs are settled is **the save system** (item 24): it is owed to single player (`02` 2026-10-10, the disabled button), it is the join's format, and designing it twice would be the one real waste. The records milestone (`03-world-model.md`) should come **after** tier 1 (the plural of players), or be built with it (item 36).

## Tier 0 — The world apart, and the viewer (small to medium)

**Built so far:** item 8 (2026-10-13, `02`: reading never grows; `check("growth")`; the hash equal across zooms and window sizes); item 17 (2026-10-13, `02`: `src/game.js`, the world's state and the step order out of `main.js`, the hash and the frame unchanged); item 23 in part (2026-10-13, `02`: `node tools/world.js` boots the world with no window and prints the pane's hash); item 24 (2026-10-13, `02`: the save, per module, as a deep JSON-safe copy; the slot with Continue, Save game, the autosave, the dead save; the round-trip proved headless and in the pane); items 21, 1, 3 in part by the big pass's step 2 (the time scale as a world field, prop ids, entry uids).

What: items 8 (growth by players only), 17 (the singletons sorted into world and client), 21 and 22 (time scale, the timer), 23 (`src/world/` headless; `node tools/world.js` boots and steps a world with no window), 24 (`serialize`/`restore`), and a **one-way viewer**: a second tab that receives snapshots through a `BroadcastChannel` and draws the host's world from its own camera, no player of its own. `05-someday`'s tier 0: "small, and it proves the pipe and the interpolation".

Check: `node tools/world.js` hashes the same as the pane's `world.hash()` after the same scripted minute (the proof that growth no longer depends on the window); a save round-trips deep-equal (the parent's acceptance); the viewer's picture matches the host's at the same camera (`check("frame")` over the loopback). **Done 2026-10-13 but the viewer:** the hash agrees (`48ba67d2` before the id change, `308b389f` after); the save round-trips in Node and in the pane.

Why first: it is the save system plus the split `23a` D1 asked for; nothing in it is multiplayer-only, and single player gets saves, a headless check, and a loop that survives a hidden tab.

## Tier 1 — A second walker (medium)

**Built so far (2026-10-13, `02`):** the world holds a list of players and steps each from its own snapshot; the dead hunt the nearest they see; a bite names its victim; carried lights by owner; ids from the counter; a sheet per player; "me" by identity (`check("players")`, `node tools/world.js --players=2`). Then (2026-10-13, `02`): **the loopback**, a second tab walking a second player in the first tab's world with 100 ms each way, the join a load and a frame per step with chunk deltas. Then (2026-10-13, `02`): prediction with acknowledgement by sequence (zero correction over the loopback), grown chunks and the host's rules on the wire. Then (2026-10-13, `02`): the You screen, Host and Join with a code, names over heads, the log as the chat. **Tier 1 is whole but for the client object proper and interpolation for a slower wire**, both of which the next tiers can carry.

What: items 1, 4, 5 (ids for props and players), 15, 16, 19, 20 (the carried lights, world-space commands, the dead's target list, "me"), 26 to 29 (the client, prediction, interpolation, a sheet per player), 30 and 31 (the identity and join screens), 32 (chat). A second human walks the valley, is seen, is hunted, carries a torch that lures, says a line.

Check: `check("sync")` first exists here: two tabs through the loopback with 100 ms of delay, a scripted minute of walking by both, equal hashes at the end; the dead chase whichever walker they see; a torch in tab B draws a zombie to B.

The cheap feel test of `05-someday` is runnable at the end of this tier: two tabs on one machine with 80 to 120 ms between them.

## Tier 2 — Fighting (medium)

**Built so far (2026-10-13, `02`):** on the wire the world never pauses (a screen is the client's own, its player stands still), and hit-stop is refused there; the draw and the combat clock on the player; a guest's swing, shove, and bow resolved on the host from its clicks, its aim vector, and a ground point; the arrows in flight in every frame. **Tier 2 is whole but for the bounded rewind, which the loopback cannot show the need of.**

What: items 12, 13, 18 (the draw and the combat clock on the player, hit-stop local, events with victims), the swing, shove, guard, draw and release as commands with the bounded rewind (`04`), the bow's launch and landing as events. Two friends against one zombie and it does not jump about.

Check: `check("sync")` with a scripted fight; the Zomboid test by hand: both players hit one zombie; its health bar and its position agree on both screens at every snapshot.

## Tier 3 — Everything else as a command (large by volume)

**Built so far (2026-10-13, `02`):** a guest's world verbs by address and label (the menu and E), with the walk, the bar, the messages, and the opened containers finding the guest; the door and the search touch their tiles. Then (2026-10-13, `02`): the panel's drags, drops, double-clicks, and item and slot menus as commands by uid, slot, and bag address, the open container found by its address each frame, a host's own drag into a chest marking its chunk. Left: the Use mode, the keys, placement, the stations' panel, the whole-world sync check. **Reordered 2026-10-13 (Michael, `02`): before the rest of tier 3, two moves pulled forward.** First (built 2026-10-13, `02`), three small fixes: the host's code copyable (a selectable field and a Copy button), a guest with no answer in a few seconds told so and sent back to the title rather than left in a frozen world, a guest with no identity through the character screen before the join. Second (built 2026-10-13, `02`; the deploy owed, `07` question 20), **the relay** (tier 4's item 37 in relay mode): a Node WebSocket process the host and guests connect to by code, `net.js` with a second transport beside the BroadcastChannel loopback and the messages unchanged, `wss://` because the GitHub Pages site is `https` (`07`, question 20: where it runs). The rest of tier 3 then lands over the relay with real latency under it.

What: items 3 (entry ids), 6 (mutators and events for every change), 9 and 10 (the DOM handlers and the action as data), 14 (placement, use, the key trackers per client), 7 (no render writes on the sim); doors, boards, building, carrying, containers, floor items, fires, the bag and the belt and the hands, the big pass's stations, crops, the bucket; a container open on two screens.

Check: `check("sync")` with a scripted session that does one of everything (the acceptance lists of milestones 3, 4, 5, 7, 13's eight checks, and `30`'s per-step checks, each run from a guest's tab); the duplication hunt: every item counted before and after a minute of two players moving things between a chest, two bags, the floor, and their hands; the totals equal.

Why last among the mechanics: it is the largest by volume and the likeliest to breed duplication bugs (`05-someday`'s own warning), and it depends on the ids and the mutators being done first.

## Tier 4 — The dedicated server, joining, leaving, dying (medium)

What: item 37 (the Node process: relay and authority; **the relay mode is pulled forward into tier 3, `02` 2026-10-13**), 33 and 34 (death that keeps the world, the next survivor, spectating), 35 (settings sorted; the host's rules), the version check, reconnecting with the grace period, the save on disk and on the last leave, the world that stops with nobody in it (`03`).

Check: a world hosted in Node, two browsers join by code, one dies and takes a new survivor while the other loots the body; one closes the tab and rejoins to find their character where it stood; the server is stopped and started and the valley is as it was.

## Tier 5 — The world's edge (the records, when they come)

Item 36: the records milestone built around the list of players. Not a multiplayer tier; a note that it is the last place the single perspective could be baked in, and the design to use.

## What is done now, for free

The six habits in `08`, asked of the big pass's implementer, which are `05`'s (now) items: refer to props by id in anything kept across a step; make entries through one function; every world change a mutator that touches its tile and emits; every verb a row in a table with `perform(world, player, target, args)`; a new handler calls one function with the player and an address, never an inline mutation; sleep sets a world field. Plus one more that costs nothing: no new `kind === "player"` meaning "me", and no new module-level `let` that holds something of a player's.

## The checks, summarised

- `node tools/world.js`: the world boots and steps headless (tier 0).
- `check("determinism")` run at two window sizes (tier 0, item 8).
- A save round-trip deep-equal (tier 0).
- `check("sync")`: two tabs, a delay, a script, equal whole-world hashes (tiers 1 to 3, growing scripts).
- The duplication count (tier 3).
- The server round trip (tier 4).

## What this costs the single-player game

Nothing visible: a save slot it was owed, a loop that survives a hidden tab, a headless check, and a vocabulary of verbs and mutators that the big pass wants anyway (`30` law 1, "everything is data", is the same instinct). The one new cost is the habit: every feature after tier 3 answers "how does this sync", which `05-someday` already priced, and which this design answers the same way every time: a mutator, an event, a command.
