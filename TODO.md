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

## Status (2026-10-24, late: the melee baseline accepted; the loot tables and the bags ruled and built)

**The melee pass is the baseline** (Michael, after playing it whole: "in terms of basic mechanics, we are there"; `docs/02`, The melee baseline; `docs/41`'s status). Fine-tuning goes on with the skills, through the numbers in `docs/42`. What came out of his two test sessions, all merged: the dead strike a fence while they wait for a bite token; the reel pose on a stagger; the downed keep their health bar and are outlined; a closing burst near a seen target (a trial, #394); the aim guide on by default; the shove at 0.65 tiles, a tired one 0.45 with its stagger under the recovery (#396); a gate opened while the dead strike it lets them through (#397); no boards on a fence, a gate included (#398); sounds steps 1 and 2 and the F8 mute key (the Secondary's).

**The loot tables and the bags, ruled and built** (`docs/02`, The loot tables and the bags; #399, #403): a table per kind of container, weights out of 32, read on the wiki's **Drop tables** page, from which Michael tunes them (OSRS's tables the guide); no gear in a rolled table, placed once (a sword and a mace in the toll house, a belt and gloves on the barn rack, the Onion-head Hat on the scarecrow); **gear is made by default**; only arrows, throwing knives and axes, bandages, and seeds stack; bags are made, never found: the linen satchel (7 by 5, the loom) is built, the rucksack (8 by 6, Crafting 6 and Beastlore 4) waits for leather and wool, and **no rucksack exists in play** until then; a bag taken off keeps its contents. Containers' food dropped to about a quarter (about 24 apples, 8 bread, 5 cheese in a valley).

**Where to pick up:** a new Primary since 2026-10-23, focus planning and infrastructure. Michael's three goals, in order: (1) a final Valley scope (#271, `docs/39`); (2) a limited demo scope, a cut list from `docs/39` against `docs/36`, each line naming its valley issue; (3) building both, demo-first, after a plan is talked through in chat (Michael prefers prose to question widgets). **The Valley scope closes by the defaults pass:** Primary proposes an answer for every open line of `docs/39` on its issue, one issue per sitting, Michael overrules in prose, what stands is the default marked tunable; the scope is final when `docs/39` section 16 is empty. **Three sittings are done** (#275 and #264 on 2026-10-23, #268 and #260 on 2026-10-24); **next is #273** (the dead ends, 13 lines), then the rest by their counts below. Then the demo's cut list, with its four build issues refiled (#40 to #43 are the bot's, hidden).

**The open lines of `docs/39` by issue** (counted 2026-10-24, late; 215 lines built, 232 to build, 78 to change, 95 open): #273 13 · #92 11 · #279 10 · #289 10 · #288 8 · #123 7 · #281 7 · #181, #282, #133 5 each · #283 4 · #103 3 · #104, #262 2 each · #261, #106, #271 1 each.

**Ruled before this** (`docs/02`, newest first): the food economy (#264), the skills' open lines (#275), the demo on dev art (#356), the melee feel pass (#368), all 2026-10-23. **The valley's map as it stands is a testing map, not the final valley**; the redraw and the teachers' placement are #92.

**The Secondary** (one session, "Current Secondary Agent"; offloaded work goes to it as `for:secondary` `ready` issues, every change reviewed by Primary before `main`): its queue is clear after #403's wiki sync (cmz-wiki#30, approved).

**Not done, Michael's hand:** the finished worktrees under `.claude/worktrees/` are merged into `main`; a session may not remove them, so Michael does (`git worktree remove <path>`, then `git worktree prune`), or Settings › Storage once they are old enough.

**Waiting on Michael:**
- the loot rates, from the wiki's Drop tables page; the rucksack's default recipe (four leather, four woollen cloth, two spruce planks, the satchel);
- #393, the downed art brief to the design agent; the satchel's drawn art (world picture, icon, 38 by 38 portrait) on the next brief;
- whether the mace's and the thrust's cards should name their knockdown; the burst against a drawn bow, a raised shield, or a brace;
- #271's items 6 and 8 to 11; picks of placeholder music;
- #341 (a multi-tile prop across a chunk edge on a guest); #324 (no rush);
- the `needs-michael` issues: #92, #94, #123, #133, #181, #217.

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
