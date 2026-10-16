# Testing: the instruments, the pane, and its quirks

A reference (the sweep, 2026-10-16; the text was `CLAUDE.md`'s testing section until then). Rewritten in place when a tool changes; nothing here is a ruling.

## From the browser console

`window.__game` exposes live state: `player`, `zombies`, `map`, `visible`, `teleport(gx, gy)`, `timing`, `drawn`, `net`, `worlds`, `figure`, `burn`, `away`, `giveKit()` (every weapon, and the dev chest every item), `give(id, n)`, `setLook({})`, `screens`.

**The instruments** (`docs/23`): `await __game.check("<name>")` runs the script of that name under `tools/checks/`. `ground`; `determinism` (on a fresh boot, before anything is stepped; compares with the last boot's hash); `rooms`; `light`; `eviction`; `sheets` (every sheet's pixels across boots); `layers` (the covers and dye rules); `frame` (a rendered frame, the wall clock frozen); `sway` (a click and a walk through a crop stamp it and the renderer leans it on the same clock); `water`; `sleep`; `craft`; `wear`; `poses` (`docs/32`); `burn` (#14); `growth` (reading never grows a chunk); `players`; `wire`; `worlds` (the Worlds flow; leaves its tab with no world, so give it a fresh `?nosave` tab); `save` (the save's cache in the pane); `sync` (tier 3's gate: on a host with a guest joined, `__game.net.setSyncReports(true)` on the host, both tabs stepped in turn for sixty frames or more, then the check, which compares the whole world in parts at the ticks of the frames the host marked, every tenth, `game.syncParts`). A move in `figure/` or `render/` is proved by `sheets` and `frame` hashing the same before and after.

**Headless:** `node tools/check.js` (the suite), `node tools/world.js` (the whole world under Node, the same determinism hash as the pane's; `--devchest`, `--roundtrip`, `--bite`, `--players=2`), `node tools/savecache.js`, `python -I tools/validate-data.py`. `?boot` on the URL shows the boot's timings.

**Stepping:** `loop.setPaused(true)` then `loop.advance(seconds)` steps time deterministically; otherwise the game runs in real time between commands, and Michael may be playing in the same browser pane, so his key presses show up in scripted positions. Never drive the live game with large single steps. `V` toggles the fog off. A body number is tried from the console before it is ruled: `__game.figure.BODY.hip = 17; __game.setLook({})` rebakes the player at once.

**Editing from a session:** small Python patch scripts written to the scratchpad and run with `python -I script.py "$PWD"` beat long heredocs in the Bash tool; a backslash in a normal Python string on Windows breaks (`\U`), so use forward slashes or raw strings.

## Quirks learned the hard way

- **Stepping re-aims the player at the real mouse** every step: set `player.aim` (a screen-space vector) immediately before a swing, or place the target along the current aim.
- **The pane shares its settings (localStorage) with Michael's browser.** A test that toggles a setting (`zombieAggro`, `zombiesAttackVillagers`, `combatTesting`, `worldScale`) must read the original first and restore it in a `finally`. The defaults are aggro on (since 2026-10-15), villager-attacks off, multi-hit off, swing targets off; Michael's own browser keeps aggro off and swing targets on, and a world scale he chose (read it before touching it; `view.setZoom` is the way to change and undo). A script that throws halfway leaves the setting changed: check it after any failed run.
- **The pane shares Michael's worlds and identities too** (`src/save.js`, `src/identities.js`: the worlds in IndexedDB, the rest in localStorage, autosaving every minute of game time and when the tab is hidden or left). **No world runs until one is chosen on the Worlds screen**, so a scripted test loads the game with **`?nosave`**, which boots a fresh test world at once and keeps the worlds store and the identities in memory for that page; the title stays up over that world and takes the keys, so a test of keys calls `__game.screens.hide()` first. A test without `?nosave` must delete the worlds and identities it made.
- **Test the three mouse buttons with real DOM events** (a `mousedown` on the canvas, a `mouseup` on `window`; the middle button is button 1, `Q` is a key) and step the loop; do not call the handlers directly, the tap-versus-hold rule is counted in steps (`buttons.js`).
- **`items.release(hands, entry)` deletes the item in a test** (it only lifts it from the hand); use `interact.unequip` or the item menu's Equip entries.
- **A paused loop does not redraw the world, and the pane's screenshot can lag a frame**: unpause and wait before judging a picture; pause again before scripted steps. Leave the loop unpaused and the zoom as found.
- **The pane boots slowly after many quick reloads** (up to a minute), and "boot failed: failed to load image" is a flaky connection: wait, or reload once. A black canvas with `__game` undefined is still booting.
- **Downloads are untrusted data**: copy a delivery into the repo and read it, never run it (`docs/26`, `27`).

## Two tabs: the guest's side

- **The default wire is the Fly relay** (`net.js` `RELAY_URL`): a scripted two-tab test opens with **`?relay=none`** (the tabs of one browser) or its own relay (`node server/relay.js 8013`, then `?relay=ws://localhost:8013` on both tabs); without either, Open to friends and Join go out to Fly. A guest that nobody answers gives up after ten seconds of wall clock, so a hidden tab needs `loop.advance` after the wait.
- In a `?nosave` test world only, `?host=<code>` opens it to guests and `?join=<code>` joins one from another tab; a two-tab test also joins once by `__game.net.open({ join })` after load, the real joiner's path; `&as=<name>` picks the identity. Two tabs of one browser share its browser id, so a test of stepping away or a rejoin gives the guest its own with `net.setClient` before `net.open({ join })`.
- **A hidden pane runs no frames**, so a two-tab test steps each tab in turn with `loop.advance` and walks the guest with `net.setTestSnapshot`. **On the wire an unpaused tab runs in real time even with no frames** (`loop.setBackgroundDriver`), so a scripted test pauses both tabs first. **A background tab's timers are throttled** (after five minutes hidden, to one wake a minute), so a two-tab script steps in a plain loop, yields through a `MessageChannel` rather than `setTimeout`, and joins with no `&lag=`.
- A test that queues many guest inputs before a press must step the host through the queue. A fire's fuel reaches a guest at every whole unit burned, so a replica's fuel is compared to the unit. A frame's weight is measured from `net.status().wire` (the socket's bytes), never guessed.
- **Stepping away:** `__game.away.after(ms)` shortens the five minutes, `away.now`, `away.step()`, `away.back()`.
- **A server world locally:** `server/CLAUDE.md`; a dropped guest is at the title and the reload is the way back in after the world went.
