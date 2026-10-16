# 35 — Desktop, Steam, and the free demo: the business and marketing plan

**Status, 2026-10-16: a plan, not a spec; nothing of it built but the loop's edge (below). Written 2026-10-13 with Michael, amended 2026-10-14 (`02`, "The demo re-ruled, the name and the project's own accounts first"): the game's name and the project's own accounts come first, and the demo is single player; the organisation `cmzgame` holds both repositories since 2026-10-15 (`github.md`), the rest of the infrastructure day owed. The demo it leans on is scoped for implementation in `36`. Facts about Steam below are as Claude knew them on 2026-10-13 and move over time: check Steamworks' own documentation before acting on any number. The "Open, for Michael" items at the end become one tracking issue.**

## The idea in one paragraph

The game is a web game, and that is its marketing advantage, not its weakness. **The free web demo lives forever at a link:** click, and you are playing in seconds, with nothing to install, no account, no store. No engine game can offer less friction than that. The paid game is the same code in a desktop wrapper on Steam, where the store page, wishlists, demos, festivals, and Early Access find it an audience and the sales fund a human artist. Nothing about the technology forces the game to be free; "browser game" describes the delivery, not the quality.

## Why "a web game" is not a problem

- **Players cannot see the stack.** Well-known Steam games run this way: Vampire Survivors shipped on Steam as a JavaScript game in a wrapper and moved to Unity only once it was a hit and wanted consoles; CrossCode is HTML5 in NW.js; every RPG Maker MV and MZ game on Steam (thousands, OMORI among them) is a web game in NW.js; Game Dev Tycoon the same.
- **This stack is not unsophisticated.** Raw WebGL2 with its own light per vertex, a deterministic simulation that runs headless, an authoritative host with prediction, deltas, and a sync check: an engine game usually gets those from someone else. This one wrote them.
- **It suits how the game is made.** Plain files, no build step, headless checks under Node, and verification in a browser pane are why agents build it as fast as they do (`23`, `31`).

## The free web demo, forever

- **Where:** the game's own site (below, "The project's own accounts"), at a plain link [and the same build on itch.io, where browser games are found]. **Not the GitHub Pages site the friends use today:** that site serves `main`, the whole game, from a public repository (below). One link on the Steam page, in every post, in every video description.
- **What:** the horde demo of `36`: one homestead, supplies for a few days, the weapons to try, the dead coming out of the forest in a trickle and then a flood until you fall, built to kill you; then a card that says the open valley is coming, with the wishlist link.
- **Single player** (Michael, 2026-10-14: it is a demo). Co-op is the full game's, and its pages say so; the demo's title has no hosting.
- **The same demo on Steam:** a Steam demo is a separate free app attached to the game's page; it is the same scenario in the wrapper, and it is what Next Fest shows.
- **What it costs to keep:** a static site, and nothing else: the demo is single player, so it never touches the relay. The relay (`server/relay.js` on Fly) is the full game's, and its bill grows with the full game's co-op (about 120 KB/s to a guest with 22 of the dead near, `31`); the cheap answers when that matters are a binary frame format, sending each guest only what is near them (`31/04`, interest, not built), and later Steam's own networking for the Steam build.

## The name, and the project's own accounts (Michael, 2026-10-14)

The ruling is `02` 2026-10-14, "The demo re-ruled, the name and the project's own accounts first": the name first ("Cozy Medieval Zombies" is a working title, and nothing public, from the site and the logo to a store page and an account's handle, is made until the game has its name), then an infrastructure day that gives the game an identity of its own, apart from Michael's personal ones, the studio's accounts the only ties to him. The repository goes private with it: today the whole game, its source, and every piece of art are free at the Pages link, which must end before a game is sold and before an artist's paid work lands in the repository.

- **What moves** (the organisation `cmzgame` holds both repositories since 2026-10-15, `github.md`; the rest is owed): the relay's Fly app to the studio's account; the friends' Pages site, which stops serving the full game. The full game for friends moves somewhere private [a password on the site, or the desktop build once it exists]. Nothing in the code changes but the relay's address (`net.js` `RELAY_URL`) and the site's links.

## The desktop wrapper

**Electron** [over Tauri]: it bundles its own Chromium, so the game runs the same on Windows, macOS, and Linux (the Steam Deck included); Tauri uses each system's own web engine, and Linux's WebKitGTK has been weaker at WebGL2. Electron's size (about 150 MB) does not matter on Steam.

**What stays the same:** the simulation, the renderer, the world, the interface, the multiplayer logic; about nine tenths of the code.

**What changes, at the edges, each already behind one module:**

- **Loading.** ES modules do not load from `file://`: the app serves its files through a custom protocol or a small built-in server in place of `serve.py`. The editors' save endpoints are developer tools and do not ship.
- **Saves** (`src/save.js`). IndexedDB works inside Electron and lives in the app's own folder, so "I cleared my browser data" stops losing worlds from day one. Real files and Steam Cloud come later by swapping the storage inside `save.js`.
- **The host while minimised** (`src/loop.js`): **built in the browser already** (`loop.setBackgroundDriver`, `02` 2026-10-13): a Worker's timer steps a world with friends in it while the tab draws no frames, and a world open to friends with nobody in it keeps answering the wire; a solo world still stops when hidden, as single player always has. Electron can turn off the throttling of a background window's timers, and a minimised window that stops animation frames is the same case, so the wrapper inherits it.
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

The capsule art is the most important picture on a Steam page, the first thing anyone sees. So the artist's first commission is **a style frame and the capsule**, one job: it settles the art direction questions open since `02` (the start greener than `06`, the shift toward the gloom), it is the store page's face, and it can come long before the full art pass. **Neither the demo nor the store page goes out in placeholder art: nothing goes into the demo without its final art** (Michael, 2026-10-13), and the demo is built and tested before it is released.

## The order (no dates; each step when the one before is true)

0. **The name**, then **the infrastructure day** (above): the private repository, the business email, the game's site.
1. **The horde demo** (`36`), built and tested in the browser (not yet: Michael), doubling as the stress test of the engine and the wire under many of the dead; released only with final art for everything in it.
2. **A style frame and the capsule** from a human artist.
3. **The wrapper and the coming-soon page,** the demo attached, the web demo linked.
4. **Steam lobbies and invites, cloud saves, Next Fest.**
5. **Early Access,** when the valley's loop holds (`30` step 4 at least: farming is the cosy half).
6. **Consoles or Godot** only if success and measurement ask for them (`02`, and the conversation of 2026-10-13: the docs are a near-complete spec, so a rebuild would cost far less than the first build).

## Open, for Michael

- The real name (first, before anything public).
- Whether the demo goes on itch.io as well as the site.
- Early Access, or a full release later.
- The price, near launch.
- Who the artist is, and the first commission's brief.
