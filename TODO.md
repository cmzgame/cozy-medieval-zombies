# TODO

Where work stands. The open work lives on GitHub, under the roadmap's milestones (numbered `00 ·` to `10 ·`, so the milestones page sorted alphabetically is the roadmap as a chart); this file is the overview, and its **Status block is rewritten at the end of every session, never appended**. The record of 2026-10-08 to 2026-10-15 is `docs/history/todo-2026-10-08-to-15.md`.

**The live view of all of it is the status page** ([https://cmzgame.github.io/cozy-medieval-zombies/tools/status.html](https://cmzgame.github.io/cozy-medieval-zombies/tools/status.html), `tools/status.html`, #358): the deploys, Michael's queue, the open pull requests, the milestones with their issues, the unfiled issues, `docs/39`'s open lines by issue, and this file's Status block, read from GitHub every time it is opened.

**Every box is ticked only when it works for a guest too** (`CLAUDE.md`, the two rules of shipping).

## The roadmap (Michael, 2026-10-17; `docs/02`)

*Primary's:* each step ends with Michael playing it and saying it is done; the pace is set by his play and his rulings, not by the build.

1. **The valley and skilling** (`01 ·`). Done when Michael can sit down for an hour of production, stocking up, and building and it feels like playing a game, not testing one: no dead end, no resource stoppage, no "now what?". Not final art, not balanced; fulfilling, OSRS-style, a second-monitor semi-idle game. *Primary's test of it:* whatever breaks that hour goes on a short list, and the step is done when the list is empty.
2. **Zombies and combat** (`02 ·`): every weapon you can get without leaving the valley feels good against the standard dead. The difficulty pass (#89, #133), the siege (#147), darkness. **Free placeholder sounds** come in here (hits, groans, footsteps), for feel and immersion, or sooner: they are part of the Valley's finish, timed by its scope (#271, `02` 2026-10-18); one the wiki may not host stays off the wiki, not out of the game.
3. **The demo** (`03 ·`): the horde demo (`docs/36`), also the first build strangers play.
4. **Playing together, and telemetry** (`04 ·`), before the outside playtest and ideally earlier: Michael's evening with his brother over a server world (possible today: make a world, Move to the server with the creator key, and he joins by its code), then Play with friends for everyone (#143) and telemetry (#144).
5. **The first outside playtest** (`05 ·`): people who are not Michael or his brother, on dev art (*Primary's:* five to ten, watched, with telemetry). Nothing is paid for before this.
6. **Midnight Mass, in dev art** (`06 ·`): the vertical slice: the valley, the Crimson Abbey complete (#123), and the endless demo; then a second outside playtest. Michael: "If that all clicks, and it playtests well, not just me, that's the sign right?"
7. **The name** (`07 ·`, #94), before money goes into assets; it triggers its own infrastructure pass (the private half kept off the repository).
8. **Art and sound** (`08 ·`): the paid phase. No directional sound; the dead make noise; the interface, fire, actions, walking.
9. **The Steam page** (`09 ·`): a coming-soon page as soon as there is capsule art and a trailer, wishlists for months, the demo at a Steam Next Fest.
10. **The regions and release** (`10 ·`): the remaining regions, the Electron wrapper, release.

**Sound:** every sound that carries information may have a visual twin where it makes sense (a bubble or a log line, a shake, a sway), but playing with the sound off is meant to cost something; Primary is the sound-on advocate. Anything in the game that makes a sound has it as a playable file on its wiki page, as its license allows. **Not waiting for the name** (*Primary's:* from the old infrastructure-day priority): an off-Fly copy of the server worlds' saves and a backup of the art generators, Michael's private half, kept off the repository.

## Status (2026-10-28, night: the engine rework, the cliffs, and the terrain menu merged; next, the order of the big builds is to be talked through)

**Michael is playtesting from the Playtest Checklist** (his private page, https://claude.ai/artifact/61HoYfV2iwDFboMeAikYws; the wiki's copy is the Playtest checklist page). It holds every tryable change since 2026-10-17, his ticks, a note per item, and a bug-report box. **The loop:**
- he files reports there (or in chat, with screenshots);
- Primary reads the page's `reports` collection (ArtifactData), fixes the bugs in batches, asks him the design questions, and sets each report's `status` to where it went;
- every merge with a player-visible change adds a row to the page's `items` and to the wiki's checklist.

**Merged 2026-10-27 and 28, in the order Michael set** (each reviewed by a fresh agent, run by Primary in the pane, two tabs where the wire changed; the wiki synced to `eba3c56`):
1. **The fires** (#527, #531).
2. **The depth buffer** (#530, `docs/51`), and the tree crowns' tie-break (#544).
3. **Walls 96** (#529, `docs/52`).
4. **Torch on a wall** (#532).
5. **Upper floors** (`docs/49`): the map in layers (#533), storeys and stairs (#534), the tall house; his playtest fixes (#540, #548, #551), the drawn stairs (#541), the storey fade (#546); **floors and stairs in the build palette, Free building only** (#549: Michael's ruling, a tile at a time, no physics, #538); nothing built on top of someone (#553).
6. **Round rooms** (#536, `docs/50`): stone only, Free building only; the dovecote; his playtest fixes (#537, #539, #545); the drawn doors and windows (#550, art round 9); a ring over a corpse (#556).
7. **Cliffs for experimenting** (art round 10, #561, #564; Free building only): a cliff wall, grassy cliff wall, cliff tops, a stone ramp, corners; the bounded world they are for (`docs/29-world/10`, PR #558) is **parked by Michael, open and unmerged, no build issue**. **The build menu split into Build and Terrain** (#565): the Terrain tab (Free building only) paints Grass, Dirt, Cobblestone, Water, Shallow water, the pink No random spawn tile (does nothing yet; for hand-building the map) and holds the cliff pieces; the palette scrolls. A crash fixed (#563: the removal tool over a laid floor); every stone floor drew as pebbles (#564, a name clash). **Villagers are immune** (#559, Michael's ruling, the old ruling expunged).
Also: item menus stay open while you walk (#547); the dead stay on a player's trail, a fixed flame never pulls them off (#555, Michael's ruling); stale checks (#535, #552); docs (#538, #542, #543, #554).

**Next: the order of the big builds, to be talked through with Michael before any starts** (his rule): roofs (#512); ladders and hatches (`docs/49` 3b; his ladder spec is coming); looking and shooting down (`docs/49` 4 and 5); the power items (gems #281, trinkets #282, silver #283); armour (#133, #503).

**Waiting on Michael:**
- the halberd's second attack (#503); the minimap (#498); tools beside the spear; the cauldron's state (#528); decor collectibles (#524).

**Known, small:** the history write-up (#560, not started); where new dead come from once the wild is bounded (Michael's open problem in `29-world/10`); a body hugging the inside of a 7 by 7 ring catches on a step's corner (#545 measured it); faint wedges just outside a ring at its diagonals, seen from inside; `check("depth")` row 17, one pixel on the 96 px corner post; the Use mode does not end when its item goes; `check("ground")`'s three rows (lit as before, the bake budget, the eye row) fail on main as before; a full `check("all")` in a hidden pane takes over half an hour (show the pane, or run checks one at a time).

**Built but queued:** #483 throwing potions; #500 honey in clay jars.

**Parallel builders are allowed** (2026-10-25): Primary runs their pane and two-tab tests, merges main in, and reviews before main. **Protocol bumps in Primary's builds merge on a clean review** (Michael, 2026-10-25; `docs/02`; `net.PROTOCOL` is 26). Primary's pane runs on its own `medieval` server (8010); the Secondary's on `medieval-second` (8011).

**Not done, Michael's hand:** the finished builders' worktrees under `.claude/worktrees/agent-*` (all merged) are his to remove (`git worktree remove <path>`, then `git worktree prune`).

## Open work, by milestone

Issues #18 to #55 were filed by the bot and are hidden while it is flagged. **The ones the valley needs are filed again with new scopes** (Michael, 2026-10-18, `docs/02`), each naming the number it stands for; when the bot is back, each original is read against what was built and closed (#71). The rest stay hidden for their own steps.

- **00 · Process and infrastructure:** the bot's reinstatement #71; the wiki's publishing build without `--check` #3; the wiki's loose ends #68.
- **00 · Bugs:** a duplication count for the sync check #101 (with 04). An unverified bug goes to `docs/bugs.md`.
- **01 · The valley and skilling:** the wizard #181 (waits on the teaching design: skills and learned recipes, unscoped, Michael's); building's leftovers #104; the NPC pass #103; the engine's chores (#124, #100). Built and closed on 2026-10-17 and 18: #10, #136, #156, #159, #190, #195, #196, #197, #208, #215, #236; on 2026-10-23: #99, #135.
- **01 · The valley: farming (big pass step 4)** (`docs/30` sections 8 to 10): built (#194, #199, #200, #201, and cloth #212 closed).
- **01 · The valley: the 1.0 map, steps 5 to 9** (`docs/30` section 11): the map's open questions #92; fishing joined apple trees in #190 (was #28). Still hidden for later: the castle and the bridge road #24; the forest places #25 beyond the mine and the charcoal burners; dressing and the edges #26; chickens, deer, the tannery #27.
- **01 · The valley: talk** (`docs/34`): built (#198 and #202 closed).
- **01 · The valley: the map on M** (`docs/33`): built (#203 and #204 closed).
- **01 · The menus and the site** (`docs/38`): #16; Michael's fullscreen check #112.
- **01 · Art owed (docs/26):** bag icons first, the everyday items still on placeholder blocks (48 of the items), with the fish, the rod, the bucket, the Onion-head Hat's icon and portrait added since #182; the hand items #46; the tools #47; the icons and portraits #48; the art exporter #44; the spot checks #45; the art asks #105.
- **02 · Zombies and combat:** the melee feel pass (`docs/41`; #89 its record): built in full and accepted as the baseline (2026-10-24); armour and difficulty #133.
- **02 · Better animations** (`docs/32`): #29 to #34 and the elbow's next poses.
- **03 · The demo** (`docs/36`): the scenario layer #40; the set #41; the horde and the run's limits #42; the score, the end, and the entry #43.
- **04 · Playing together, and telemetry:** Play with friends #143; telemetry #144; the Full dot #139; a guest's arrows step every third frame #250; the seams #102; a duplication count for the sync check #101.
- **07 · The name:** the business decisions of `docs/35` #94.
- **10 · The regions and release:** the game's final shape #123.
- **Hidden, their milestones unseen until the bot is back (#71):** the background probe #49; the fireball's cost and area #50; the throwing knives and axes #51; the floor stamp in build mode #52 (likely moot now the map is generated, Primary's reading; read when the bot is back); the painted held slot #53; more one-handed weapons #54; `docs/12`'s spec sheet #55. #50, #51, and #54 belong to `02 ·`; moving them is on #71's list.
- **No milestone, by design:** the someday list #106 (`docs/05`).
