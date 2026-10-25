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

## Status (2026-10-25, later: the scoped work is built; next is the animals sitting, at Michael's word)

**Stopped at the animals sitting (#289), for Michael to say whether he has time for it now.** Everything scoped before it is built and merged:
- **The dead ends** (`docs/43`), all seven steps:
  1. Take apart (#413).
  2. Fires and lights, home lights as switches (#421).
  3. The made things and Place as decoration (#428).
  4. The village's stations behind a world rule (#431).
  5. Repairs, the sawpit, and honey (#416).
  6. Burn corpse, the wave, and the cowering (#434).
  7. The dye vat (#417).
- **Water** (`docs/44`, #435): no fixed source clean, boiling by Use or either menu, a clean starting skin, the Sick debuff, the infection's third stage Queasy.
- **The dead's moan and the strike sound** (#436, Michael's playtest note #424).
- **Test fixes:**
  - `check("slots")` independent of the checks before it (#430);
  - `check("build")` after `check("worlds")`, with a stale Take apart target refused (#433, #432);
  - `check("kindle")` from an empty bag, and a hover card measured before it flips near the right edge, a player-visible fix (#439, #437).

**The order ahead** (Michael, 2026-10-25):
1. The animals sitting (#289).
2. The basic lore (#217), then the map redraw (#92), a pair that evolve together, the lore first. The game's own name belongs to the private infrastructure work: settled in session, never in public issues or docs.
3. Then build the demo, and consider spending money (art, sound).

Small issues fill the gaps.

**Open lines of `docs/39` by issue** (counted 2026-10-25; 73 open, down from 162): #92 11 · #289 10 · #288 8 · #123 7 · #281 7 · #181, #282, #133 5 each · #283 4 · #103 3 · #104, #262 2 each · #217, #261, #106, #271 1 each.

**The wiki** for everything above is synced (cmz-wiki#31 to #34). **Next, for any Secondary:**
- `check("debuffs")`' Sick-card row still fails late in one page, though it passes fresh: Primary reproduced it on #439's own branch, after its fix, running hovercard, villagers, talk, and kindle first (23 of 24; fresh 24 of 24);
- #422, apple trees as a green round tree;
- #423, the off hand's swing animation and sound;
- the Open lines in `docs/bugs.md`.

**Waiting on Michael:**
- whether a free sharpening should use up the anvil's repair too, and the plank that repairs the fishing rod and the bow (#425);
- water's infection opening with the bite's "Bitten" line (#435's review);
- whether a sip of tainted water at full thirst should still roll Sick (it does today; `docs/bugs.md`, from #439);
- #426, how bright the valley is drawn, and Plants vs Zombies as a reference;
- #415, defensive spikes;
- #419, his Stardew Valley notebook;
- the loot rates, from the wiki's Drop tables page;
- the rucksack's default recipe;
- the burst against a drawn bow, a raised shield, or a brace;
- #271's items 6 and 8 to 11;
- #393, the downed art brief; the satchel's drawn art;
- whether the mace's and the thrust's cards name knockdown;
- placeholder music;
- #341, #324;
- the `needs-michael` issues: #92, #94, #123, #133, #181, #217.

**Parallel builders are allowed** (2026-10-25): Primary runs their pane and two-tab tests, merges main in, and reviews before main.

**Not done, Michael's hand:** the finished worktrees under `.claude/worktrees/` are merged and his to remove (`git worktree remove <path>`, then `git worktree prune`). Four of them are builders': `agent-a6d8d9d842bc1e0e6`, `agent-a0c864dfb44981bb9`, `agent-a14108f5070c7c9a8`, `agent-a4eee3c3d70381daa`.

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
