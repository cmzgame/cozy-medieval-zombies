# 35 — Desktop, Steam, and the free demo: the business and marketing plan

**Status: written 2026-10-13 with Michael. A plan, not a spec; nothing built.** The demo it leans on is scoped for implementation in `36`. Facts about Steam below are as Claude knew them on this date and move over time: check Steamworks' own documentation before acting on any number.

## The idea in one paragraph

The game is a web game, and that is its marketing advantage, not its weakness. **The free web demo lives forever at a link:** click, and you are playing in seconds, with nothing to install, no account, no store, and a friend can join with a code from the same link. No engine game can offer less friction than that. The paid game is the same code in a desktop wrapper on Steam, where the store page, wishlists, demos, festivals, and Early Access find it an audience and the sales fund a human artist. Nothing about the technology forces the game to be free; "browser game" describes the delivery, not the quality.

## Why "a web game" is not a problem

- **Players cannot see the stack.** Well-known Steam games run this way: Vampire Survivors shipped on Steam as a JavaScript game in a wrapper and moved to Unity only once it was a hit and wanted consoles; CrossCode is HTML5 in NW.js; every RPG Maker MV and MZ game on Steam (thousands, OMORI among them) is a web game in NW.js; Game Dev Tycoon the same.
- **This stack is not unsophisticated.** Raw WebGL2 with its own light per vertex, a deterministic simulation that runs headless, an authoritative host with prediction, deltas, and a sync check: an engine game usually gets those from someone else. This one wrote them.
- **It suits how the game is made.** Plain files, no build step, headless checks under Node, and verification in a browser pane are why agents build it as fast as they do (`23`, `31`).

## The free web demo, forever

- **Where:** the GitHub Pages site the friends already use, at a plain link [and the same build on itch.io, where browser games are found]. One link on the Steam page, in every post, in every video description.
- **What:** the horde demo of `36`: one homestead, everything provided, the weapons to try, the dead coming in a trickle and then a flood until you fall; then a card that says the open valley is coming, with the wishlist link.
- **Co-op from a link:** Open to friends gives a code; a friend opens the same link and joins. Two people playing together within a minute of hearing of the game is the rarest thing on offer here, and the demo should say so on its title.
- **The same demo on Steam:** a Steam demo is a separate free app attached to the game's page; it is the same scenario in the wrapper, and it is what Next Fest shows.
- **What it costs to keep:** the site is free; the relay (`server/relay.js` on Fly, one small machine that stops when idle) costs little at friends' scale. **If the demo is found, the relay is the bill:** each pair of players streams the world through it (about 120 KB/s to a guest with 22 of the dead near, `31`). Watch Fly's usage when the demo goes out; the cheap answers are a binary frame format, sending each guest only what is near them (`31/04`, interest, not built), and later Steam's own networking for the Steam build.

## The desktop wrapper

**Electron** [over Tauri]: it bundles its own Chromium, so the game runs the same on Windows, macOS, and Linux (the Steam Deck included); Tauri uses each system's own web engine, and Linux's WebKitGTK has been weaker at WebGL2. Electron's size (about 150 MB) does not matter on Steam.

**What stays the same:** the simulation, the renderer, the world, the interface, the multiplayer logic; about nine tenths of the code.

**What changes, at the edges, each already behind one module:**

- **Loading.** ES modules do not load from `file://`: the app serves its files through a custom protocol or a small built-in server in place of `serve.py`. The editors' save endpoints are developer tools and do not ship.
- **Saves** (`src/save.js`). IndexedDB works inside Electron and lives in the app's own folder, so "I cleared my browser data" stops losing worlds from day one. Real files and Steam Cloud come later by swapping the storage inside `save.js`.
- **The host while minimised** (`src/loop.js`). Electron can turn off the throttling of a background window's timers, but a minimised window may still stop animation frames, so the simulation must step on a timer (or a Worker, `31` tier 4) while the window is hidden. Small and contained; the browser build gains from it too.
- **Friends through Steam** (`src/net.js`). Steam lobbies and "Join game" from the friends list in place of codes: the change players will feel most. JavaScript bindings for Steamworks exist (steamworks.js, for one: achievements, cloud saves, lobbies); their networking is the least proven part, so [the relay stays the data path and Steam does the finding and inviting]. `net.js` has two transports already; this would be the third.
- **The window:** fullscreen, a resolution choice, the Steam overlay (fiddly in Electron historically; the bindings offer a way).

**The design work that is not code:** controllers. A Steam Deck or a pad needs answers for the three mouse roles (`21`), the menus, and the grid. Plenty of mouse-first games ship without "Deck Verified"; this can wait.

**Keep it cheap from now on:** saves stay inside `save.js`, the wire's transports inside `net.js`, the loop's clock inside `loop.js`, so the wrapper stays plumbing and never becomes a refactor.

## Steam

- **Entry:** Steam Direct is $100 a game, returned once the game earns $1,000; Valve takes 30 percent. Identity, tax, and bank details first. [I believe there is a waiting period after paying before a first release, and the page must be up as "coming soon" for a while before launch: check.]
- **The store page is the advertising.** Wishlists are what the store's algorithm runs on, so the page goes up early, as "coming soon", with the capsule art, screenshots, a short trailer, and the demo.
- **Next Fest** shows demos to a lot of people a few times a year; the horde demo is made for it.
- **Early Access fits this kind of game.** Systemic survival sandboxes live there (Zomboid for over a decade, Valheim, Core Keeper). "Here is the valley; the frontier comes in updates" is an honest pitch, and a roadmap written in the open (these docs, in short form) is what that audience wants.
- **Price:** the web demo free forever; the Steam game a few dollars [to decide near launch], enough to fund the art.
- **AI disclosure:** Steam asks developers to disclose AI-generated content before release, and some players react badly to AI art. The placeholder art, the design agent's deliveries, and reference images like `docs/images/2026-10-13-vibe-*.webp` are AI-made: one more reason a human artist's set should be in before the store page goes up. Read the survey's current wording on code when the time comes.

## The art, and why it moves up

The capsule art is the most important picture on a Steam page, the first thing anyone sees. So the artist's first commission is **a style frame and the capsule**, one job: it settles the art direction questions open since `02` (the start greener than `06`, the shift toward the gloom), it is the store page's face, and it can come long before the full art pass. A demo can go out in the current art; the store page should not.

## The order (no dates; each step when the one before is true)

1. **The horde demo** (`36`), in the browser, on the site. It doubles as the stress test of the engine and the wire under many of the dead.
2. **A style frame and the capsule** from a human artist.
3. **The working name.** "Cozy Medieval Zombies" is the working title; a store page wants the real one.
4. **The wrapper and the coming-soon page,** the demo attached, the web demo linked.
5. **Steam lobbies and invites, cloud saves, Next Fest.**
6. **Early Access,** when the valley's loop holds (`30` step 4 at least: farming is the cosy half).
7. **Consoles or Godot** only if success and measurement ask for them (`02`, and the conversation of 2026-10-13: the docs are a near-complete spec, so a rebuild would cost far less than the first build).

## Open, for Michael

- The real name.
- Whether the demo goes on itch.io as well as the site.
- Early Access, or a full release later.
- The price, near launch.
- Who the artist is, and the first commission's brief.
