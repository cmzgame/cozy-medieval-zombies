# 31.04 — The architecture: one authority, written once, run anywhere

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

**Pause** is `timeScale = 0`, a command the authority accepts only when one player is connected (the listen server alone) [and never on a dedicated server].

## The replica

**The client** is `main.js` with the world taken out: boot, the data, the art, the figure sheets, the ground, the renderer, the UI, the input, the camera, the view, the checks. It holds a **replica world**: the same `map.js` chunks (grown from the same file and seed, with the authority's dirty chunks applied on join and its events applied as they arrive), the entities it has been told about, the fires, the arrows in flight, the clock. The replica is stepped for **presentation only**: animation frames, interpolation of others' positions between snapshots, arrows flying between `arrowShot` and `arrowLanded`, flames, sways. It never decides anything.

**My player** is predicted: the client runs `updatePlayer` (the walking, the collision against the replica's walls and props) on its own input every step so the walk is instant, sends the input snapshot as a command with its tick, and reconciles when the authority's position for that tick arrives (replay the inputs since; the usual thing; the corrections are a pixel or two when the two worlds agree, which they do unless a door shut between). Everything else about my player (health, hunger, the swing, the draw, the action bar) is the authority's and is shown as it arrives: a round trip of latency on a swing's result, none on the swing's animation (`14`: the animation is cosmetic).

**Others** are interpolated: a snapshot every three ticks (20 Hz), drawn a snapshot behind, so motion is smooth; the dead at 1 tile/s move 0.05 tiles between snapshots.

**Sight, light, fog, the ground, the sheets** are the client's own, built from the replica as they are built from the world today (`02` section 1: all deterministic from the data). Chunks the replica has not been told about are drawn as the authored file and the seed give them, which is exactly right for wild chunks and almost right for authored ones (a chair a friend moved three screens away is where the file put it until that chunk enters your region; nobody can see the difference, by the active-region law).

**The loopback.** *(Built 2026-10-13 as `src/net.js` over a BroadcastChannel between two tabs, with the join as a load and a frame per step; `02`.)* When the authority is in the same page, the transport is a pair of queues with no serialisation [or with, behind a flag, so the loopback proves the wire format every evening: JSON in and out costs nothing measurable at these sizes]. The two-tab test (`05`'s cheap test) is the same client with a `BroadcastChannel` transport and an artificial delay, which `main.js:803` already half has.

## The transport

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

1. **The wild grows the same everywhere**, so wild chunks never travel: the seed and `hash2` do it today.
2. **A replica check**: `check("sync")` boots an authority and a replica in two tabs through the loopback with a delay, drives a scripted minute of input, and compares `world.hash()` on both at the same tick, with the whole world hashed (tiles, props, walls, items, inventories, fires, the rng) rather than today's entities alone. This is the test that says the wire is complete: every mutation that bypassed an event shows up as a hash that differs.
3. **A save that loads the same** on a host or a server, which is the same property.

The authority's own rolls stay on `rng.js`; the replica has an rng too and uses it for nothing that matters.

## Lag, and what it feels like

The dead walk at 1 tile/s; a hundred milliseconds is a tenth of a tile. Your own walking is predicted, so it is instant. A swing lands a round trip later, with the rewind bounded at 150 ms so it lands on what you saw. A door opens a round trip later [the client may open it at once and be corrected if refused; the parent's rule that the animation is cosmetic covers a leaf as well as a swing]. A friend's position is 50 to 100 ms old. A bow's arrow flies at 16 tiles/s and lands where the authority says, which on a 100 ms link is 1.6 tiles of possible disagreement with what you saw, resolved by the authority's landing at the authority's tick with the same bounded rewind. This is `05`'s stated price and it is the right price: the alternative is Zomboid's.

## What the host's machine pays

The authority is the sim as measured (`23`: 0.1 to 0.3 ms a step at the middle zoom with 67 dead) plus a serialisation per guest every three ticks (a few hundred microseconds each at these sizes), plus the host's own client. Four guests is under a millisecond a frame. A dedicated server pays the sim alone.
