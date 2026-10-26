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

## Status (2026-10-25, evening: the animals and natural resources are built; the sittings ahead wait for Michael)

**Built and merged this evening**, Michael away from his desk and approving by remote (each PR reviewed by a fresh agent, run in the pane and in two tabs by Primary, and its wiki synced in cmz-wiki#35 to #37 through game #466; the belt, #467, is still to sync):
- **Natural resources ruled and built** (`docs/46`, #288): the comeback rule, rocks and ore rising from the ground (#453); herbs, clay, and salt (#457); saplings and Gather sticks (#461).
- **Animals ruled and built** (`docs/45`, #289): in the world (#452), hunting (#456), keeping (#460), the recipes (#462). The companion waits for after the demo.
- **Small issues:** the off hand's swing (#450), apple trees and the bees (#451), the belt's rulings (#467).
- **Multiplayer:** a guest drops the chunks the host evicts (#455), a guest's arrows stepped from their launch (#463), seams 7 and 26 and a read-only guest console (#465), a prop across a chunk edge stays whole and one lift per piece (#468). `net.PROTOCOL` is 15.
- **Engine and tests:** the pathfinder's reused memory (#458), the item census in `check("sync")` (#459), a click under a tree's crown finding the herb (#464).
- **Bugs:** two batches from `docs/bugs.md` (#454, #466), including a made counter landing on its own workbench.

**The order ahead** (Michael, 2026-10-25), each a sit-down with him, **the belt's own discussion first** (pinned: "we come back to it before the sit downs"):
1. Power items: gems (#281), trinkets (#282), silver (#283).
2. Armour and difficulty (#133).
3. Lore and the map (#217, #92), folding in villagers (#103), the wizard (#181), the regions' edge (#123).
4. The demo, the business, and so on.
5. Eventually, the regions.
- **Potions, a sitting of its own, its place in the order Michael's to say** (Michael, 2026-10-25: "This may need its own sit, I want to make sure this system is built thoughtfully"): which herbs and how many go into each, and what making one takes (vials, water); with it, Herbalism 6 and 7's replacements (struck) and what the herb bed grows (`docs/02` open questions 35 and 36).

**Open lines of `docs/39` by issue** (counted 2026-10-25, evening, by line; 52 open, down from 162): #92 11 · #281 7 · #123 7 · #282 5 · #133 5 · #181 4 · #283 4 · #103 3 · #262, #104, #271, #261, #217, #106 1 each.

**In progress:** the Secondary's test-order hygiene (every instrument passing whatever ran before it in one page; a runner for a full sweep); the evening's rulings in #475 (`primary/rise-shudder`: the rocks' rise shudder, Mageroot, grave moss at any hour, eggs one a cell; for review).

**Ruled this evening** (`docs/02`, 2026-10-25, The evening's defaults ruled, and The evening's rulings): a newborn may appear in view in its pen; the rocks rise as read, with a shudder; every other default he was shown stands as built (Michael: "Anything not commented on is fine as-is"); the mana herb is Mageroot and grave moss keeps its name; no plant is only at night (grave moss at any hour; Herbalism 6 and 7 struck, their replacements open); pemmican's 3 and 35 as they are; eggs do not stack, open to change after a playtest; potions get their own sitting.

**Waiting on Michael** (defaults built, his to confirm or overrule; each named in its PR's Risks):
- **the belt (#467), pinned** for a discussion of its own before the sittings (Michael, 2026-10-25): the hand choice kept per kind of item in a slot rather than per slot; Equip to a hand also draws; an empty off-hand slot takes the off hand's item; the two Equip spellings;
- from before: the shared repair count and the plank for the rod and bow (#425); water's infection opening on "Bitten"; a tainted sip at full thirst; #426 brightness and Plants vs Zombies; #415 spikes; #419 the Stardew notebook; the loot rates; the rucksack's recipe; the burst against a bow, shield, or brace; #271's items 6 and 8 to 11; #393 the downed art; knockdown on cards; music; #324; the `needs-michael` issues.

**Parallel builders are allowed** (2026-10-25): Primary runs their pane and two-tab tests, merges main in, and reviews before main. **Protocol bumps in Primary's builds merge on a clean review** (Michael, 2026-10-25; `docs/02`).

**Not done, Michael's hand:** the finished builders' worktrees under `.claude/worktrees/agent-*` (twenty, all merged) are his to remove (`git worktree remove <path>`, then `git worktree prune`).

**The design agent's worktree** (`C:/Users/micha/Dev/cozy-medieval-zombies-art`, branch `art-docs`) was fast-forwarded to main on 2026-10-20; its deliveries sit under `deliveries/`, untracked.

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
