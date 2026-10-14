# 31.08 — The rules every change follows, now that multiplayer is live

**Since 2026-10-13 (Michael): multiplayer is live, and every addition and every change is built for it in the same commit.** Friends play over the relay. Nothing is built for the host alone with the guest's side owed for later; letting it lag a week means a pile of catch-up work, and that is what this rule exists to prevent. The six habits below were written before anything was built, to keep the door open; they are now the floor, and the checklist on top of them is what "done" means:

1. It runs in the world's step on the authority (the host), never in a DOM handler or a client-only module.
2. A guest can do it through the same path the host's player uses: a verb in `verbs.js`, a handler in `ui/inventory-actions.js` (a guest's call becomes a command by uid, slot, and bag address), a key event in the player's snapshot (`interact.keyEvents`), `placement.performPlacement`, or a `net.send*` command. Every target is an id, an address, or an entry's uid.
3. What it changes reaches a guest: in the save, which is the welcome (`game.serialize`, `restore`), and in the frame (a player's light or heavy record, the delta of the dead with its roster, the pokes, the touched chunks, the stations' queues). The replica draws it as the host does. Whatever the host remembers of what it sent is forgotten when the thing leaves the world and at every welcome (`forgetSent`).
4. World state it adds is in the sync check (`game.syncParts`), or the reason it is left out is written beside the exclusion.
5. Per-player state lives on the player, never in a module-level variable; time comes from `loop.simTime()`, chance from `rng`.
6. It is tried with a guest in two tabs (`?nosave&relay=none`, `__game.net.open({ join })`, both tabs stepped in turn) and `check("sync")` passes; the bytes it adds to a frame are read from `net.status().wire`, never guessed.

A spec names the guest's side of every feature as it names the host's. A review refuses a change that has only the host's.

The original six habits, as they were handed to the big pass's implementer, follow. One block, copy-ready, no tables. It adds to `CLAUDE.md`'s tiebreaker and `05-someday.md`'s free rules; it changes nothing in `30`'s content or order. Each habit is an item marked (now) in `31/05`, free while the code is written and a rewrite later. Michael may paste it into the implementer's instructions as it stands.

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
