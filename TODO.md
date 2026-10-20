# TODO

Where work stands. The open work lives on GitHub, under the roadmap's milestones (numbered `00 ·` to `10 ·`, so the milestones page sorted alphabetically is the roadmap as a chart); this file is the overview, and its **Status block is rewritten at the end of every session, never appended**. The record of 2026-10-08 to 2026-10-15 is `docs/history/todo-2026-10-08-to-15.md`.

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

## Status (2026-10-18, night: Michael's first playtest session, his cut-off)

**The Valley 1.0 scope is `docs/39-the-valley.md`** (#271): the one complete list, compiled 2026-10-19, in review.

**Michael is playtesting**, one change at a time, and checking things off the wiki's **Valley day** page (cmzgame.github.io/cmz-wiki/valley-day.html). Nothing large is built while he plays: small fixes and his rulings only. He set this message as the cut-off for Valley day ("Make sure everything to this point is also in valley day wiki page... I am now going to bed. Any disagreements that come up you can toss on github somewhere"), and the page now has everything to then, including a section of what was decided or filed but not built.

**Merged during the playtest, reviewed, on the wiki:** the bag's X with a lit torch (#258: the panels redrew every frame); food heals what it says, full or not, and a well-fed body heals twice as fast (#259). The wiki gained a "Changed since verified" badge (wiki #17), the Day-one food page (wiki #18), and Special:All pages for reading every page in turn.

**Ruled today in the playtest** (`docs/02`, 2026-10-18, newest first): health is a thousand (withdrawn the next day, for now: a player stays at a hundred, with max health growing through levels and gear Michael's leaning, `02` 2026-10-19), gear dropping by chance, the least armour just better than nothing (how strong the best gets is open), and weapons that differ by situation, with Michael's hope that regions keep drawing players back (#269); food rots, as pacing and not world decay ("no spoilage" struck), with in-world cutscenes wanted and open against "never a cutscene" (#267); day-one food is a tracked statistic (about 142 game days for one player on the wiki's count, far too generous) and what scripting villagers means (#265, #266); the hover card on every item in a grid is a law (#263, building it is #262); food heals in full (#259).

**Filed today, Michael's ideas, design talk unless marked ruled:** bags and stacking (#260), furniture and rugs (#261), the hover card's build (#262), the food economy: a leaner start, rot's details, starving's cliff, auto-eat (#264), loot tables balanced: most containers roll the chest's table, so a valley holds about fourteen rucksacks and swords (#268). Comments added: the regions feed the skills and a dead-free first day (#123), the map redrawn with roomier buildings (#92), villagers all immune unless scripted, a leaning (#103), scripting and cutscenes (#106), drop chances, bad-luck protection, and personal loot (#268), ×10 health (since withdrawn) and armour (#133).

**Open, held for after the playtest:** #255 ("region, never biome": its "zone" deviation is Michael's word), #256 (dead code).

**Found and not yet filed, to file when the playtest ends:** (1) a guest's `quick` and Take All can name a *living* character as a container and take its gear, a player's hands included (`interact.containerAt` resolves any character id); (2) `containerOf` trusts the reach a guest sends; (3) the checks run all in one tab disturb each other (`players`, `poses`, `reach`, `rooms` fail and everything after `save` throws, though each passes alone); (4) `check("ground")` row 6 fails on main; and, filed: a guest's arrows step every third frame (#250). **For Michael when he plays:** whether the dead that know you are inside press a fence with no time limit (#171); the movement blend's added delay against "snappy"; the map panel covering the HUD bars at small windows; a non-empty bag left in a chest by Take All. **Questions waiting on him:** villagers all immune unless scripted (#103); in-world cutscenes against "never a cutscene" (#106); rot's reach, whether food nobody has found rots (#264); a "final boss" with phases against "no end boss" (#123); bars shown as a percent, how strong the best armour gets, boss health with more players, what flat armour stops, and whether flat armour still works on a hundred health (#133); bad-luck protection and personal loot (#268); "every thing a cell" meaning (#260).

**Next: the Valley's final scope, Michael's #1 priority (#271, `docs/02` 2026-10-18): remind him of it first thing.** Then the rest of the playtest, and the skills scope (#275), the first piece of #271 Michael chose in chat; then the loot tables (#268) with the leaner start and rot (#264), learned recipes, which with skills unblock the wizard (#181); the lore issue (#217).

## Open work, by milestone

Issues #18 to #55 were filed by the bot and are hidden while it is flagged. **The ones the valley needs are filed again with new scopes** (Michael, 2026-10-18, `docs/02`), each naming the number it stands for; when the bot is back, each original is read against what was built and closed (#71). The rest stay hidden for their own steps.

- **00 · Process and infrastructure:** the bot's reinstatement #71; the wiki's publishing build without `--check` #3; the wiki's loose ends #68.
- **00 · Bugs:** a duplication count for the sync check #101 (with 04). An unverified bug goes to `docs/bugs.md`.
- **01 · The valley and skilling:** the wizard #181 (waits on the teaching design: skills and learned recipes, unscoped, Michael's); building's leftovers #104; the NPC pass #103; region, never biome #135 (PR #255, held); the engine's chores (#124, #100, #99 with PR #256 held). Built and closed on 2026-10-17 and 18: #10, #136, #156, #159, #190, #195, #196, #197, #208, #215, #236.
- **01 · The valley: farming (big pass step 4)** (`docs/30` sections 8 to 10): built (#194, #199, #200, #201, and cloth #212 closed).
- **01 · The valley: the 1.0 map, steps 5 to 9** (`docs/30` section 11): the map's open questions #92; fishing joined apple trees in #190 (was #28). Still hidden for later: the castle and the bridge road #24; the forest places #25 beyond the mine and the charcoal burners; dressing and the edges #26; chickens, deer, the tannery #27.
- **01 · The valley: talk** (`docs/34`): built (#198 and #202 closed).
- **01 · The valley: the map on M** (`docs/33`): built (#203 and #204 closed).
- **01 · The menus and the site** (`docs/38`): #16; Michael's fullscreen check #112.
- **01 · Art owed (docs/26):** bag icons first, the everyday items still on placeholder blocks (48 of the items), with the fish, the rod, the bucket, the Onion-head Hat's icon and portrait added since #182; the hand items #46; the tools #47; the icons and portraits #48; the art exporter #44; the spot checks #45; the art asks #105.
- **02 · Zombies and combat:** the combat pass #89 (after Michael's session); armour and difficulty #133.
- **02 · Better animations** (`docs/32`): #29 to #34 and the elbow's next poses.
- **03 · The demo** (`docs/36`): the scenario layer #40; the set #41; the horde and the run's limits #42; the score, the end, and the entry #43.
- **04 · Playing together, and telemetry:** Play with friends #143; telemetry #144; the Full dot #139; a guest's arrows step every third frame #250; the seams #102; a duplication count for the sync check #101.
- **07 · The name:** the business decisions of `docs/35` #94.
- **10 · The regions and release:** the game's final shape #123.
- **Hidden, their milestones unseen until the bot is back (#71):** the background probe #49; the fireball's cost and area #50; the throwing knives and axes #51; the floor stamp in build mode #52 (likely moot now the map is generated, Primary's reading; read when the bot is back); the painted held slot #53; more one-handed weapons #54; `docs/12`'s spec sheet #55. #50, #51, and #54 belong to `02 ·`; moving them is on #71's list.
- **No milestone, by design:** the someday list #106 (`docs/05`).
