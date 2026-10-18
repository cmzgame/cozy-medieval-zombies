# TODO

Where work stands. The open work lives on GitHub, under the roadmap's milestones (numbered `00 ·` to `10 ·`, so the milestones page sorted alphabetically is the roadmap as a chart); this file is the overview, and its **Status block is rewritten at the end of every session, never appended**. The record of 2026-10-08 to 2026-10-15 is `docs/history/todo-2026-10-08-to-15.md`.

**Every box is ticked only when it works for a guest too** (`CLAUDE.md`, the two rules of shipping).

## The roadmap (Michael, 2026-10-17; `docs/02`)

*Primary's:* each step ends with Michael playing it and saying it is done; the pace is set by his play and his rulings, not by the build.

1. **The valley and skilling** (`01 ·`). Done when Michael can sit down for an hour of production, stocking up, and building and it feels like playing a game, not testing one: no dead end, no resource stoppage, no "now what?". Not final art, not balanced; fulfilling, OSRS-style, a second-monitor semi-idle game. *Primary's test of it:* whatever breaks that hour goes on a short list, and the step is done when the list is empty.
2. **Zombies and combat** (`02 ·`): every weapon you can get without leaving the valley feels good against the standard dead. The difficulty pass (#89, #133), the siege (#147), darkness. **Free placeholder sounds** come in here (hits, groans, footsteps), for feel and immersion; one the wiki may not host stays off the wiki, not out of the game.
3. **The demo** (`03 ·`): the horde demo (`docs/36`), also the first build strangers play.
4. **Playing together, and telemetry** (`04 ·`), before the outside playtest and ideally earlier: Michael's evening with his brother over a server world (possible today: make a world, Move to the server with the creator key, and he joins by its code), then Play with friends for everyone (#143) and telemetry (#144).
5. **The first outside playtest** (`05 ·`): people who are not Michael or his brother, on dev art (*Primary's:* five to ten, watched, with telemetry). Nothing is paid for before this.
6. **Midnight Mass, in dev art** (`06 ·`): the vertical slice: the valley, the Crimson Abbey complete (#123), and the endless demo; then a second outside playtest. Michael: "If that all clicks, and it playtests well, not just me, that's the sign right?"
7. **The name** (`07 ·`, #94), before money goes into assets; it triggers its own infrastructure pass (the private half kept off the repository).
8. **Art and sound** (`08 ·`): the paid phase. No directional sound; the dead make noise; the interface, fire, actions, walking.
9. **The Steam page** (`09 ·`): a coming-soon page as soon as there is capsule art and a trailer, wishlists for months, the demo at a Steam Next Fest.
10. **The regions and release** (`10 ·`): the remaining regions, the Electron wrapper, release.

**Sound:** every sound that carries information may have a visual twin where it makes sense (a bubble or a log line, a shake, a sway), but playing with the sound off is meant to cost something; Primary is the sound-on advocate. Anything in the game that makes a sound has it as a playable file on its wiki page, as its license allows. **Not waiting for the name** (*Primary's:* from the old infrastructure-day priority): an off-Fly copy of the server worlds' saves and a backup of the art generators, Michael's private half, kept off the repository.

## Status (2026-10-17, night)

Merged since the sweep, all reviewed and synced to the wiki: the menus and the site (#120, #125, #128, #129, #131), the player cap (#138), Trees off keeping the mushrooms (#149), the window law (#140), the aim guide off by default (#141), darkness shortening sight (#150, #173: the dark hides information, never physics; a shuttered room dark by day; a belt torch at 0.6), the siege (#151, #152, #155, #171: the dead remember the door, wait until dawn, burst a fence in a crowd and never give up on a fenced house while they know you are in it; no sleep in a siege; doors and windows built onto walls), torches that burn down, the tinderbox, lanterns, the flare, and the light verb (#157, #164, #165, #169, #172: lighting any fire needs a flame carried; a bracket works as a post), the wordmark in Pirata One (#163, #166), and the roadmap (#160) with Michael's rulings of the day (#137, #145, #148, #153). **Next for a Secondary:** #136, the starting kit as a world choice, half built on the pushed branch `secondary/136-kit` (no PR; what is left is on the issue); then #175 (a lantern lights a torch), #174 (a spread crowd never bursts a fence), #154, #159, #161. **Open with Michael:** whether the dead that know you are inside press a fence with no time limit (built that way in #171, his to overrule); the brother evening over a server world; his combat session (#89, #133); draft 2 of the game's shape (#123). The bot account is still flagged (#71, which lists the hidden issues today's work overtook).

## Open work, by milestone

Issues #18 to #55 were filed by the bot and are hidden while it is flagged. **The ones the valley needs are filed again with new scopes** (Michael, 2026-10-18, `docs/02`), each naming the number it stands for; when the bot is back, each original is read against what was built and closed (#71). The rest stay hidden for their own steps.

- **00 · Process and infrastructure:** the bot's reinstatement #71; the wiki's publishing build without `--check` #3; the wiki's loose ends #68.
- **00 · Bugs:** a guest's held-out pose when it drinks #122; `check("players")` after `check("save")` #132. An unverified bug goes to `docs/bugs.md`.
- **01 · The valley and skilling:** a hatchet fells a tree and leaves a stump #195 (was #18); mining, the iron workings and the quarry #196, and charcoal #197 (both from #25); fishing #190 (apple trees built, #192; fishing in #193); the starting kit as data and a world choice #136; torches burn down, the tinderbox, lanterns #156; hiding a worn item's art #159; building's leftovers #104; the NPC pass #103; region, never biome #135; the engine's chores (#124, #100, #99).
- **01 · The valley: farming (big pass step 4)** (`docs/30` sections 8 to 10): farming #194 (was #20); the bucket #199 (was #22); the farms and the mill, flour with them #201 (was #21 and half of #23); the scythe #200 (was the other half of #23). Lighting a fire (#19) is built (#169).
- **01 · The valley: the 1.0 map, steps 5 to 9** (`docs/30` section 11): the map's open questions #92; fishing joined apple trees in #190 (was #28). Still hidden for later: the castle and the bridge road #24; the forest places #25 beyond the mine and the charcoal burners; dressing and the edges #26; chickens, deer, the tannery #27.
- **01 · The valley: talk** (`docs/34`): the data, barks, and the guide #198 (was #37 and #38); conversations and the guide's questions #202 (was #39).
- **01 · The valley: the map on M** (`docs/33`): the chart #203 (was #35); the panel #204 (was #36).
- **01 · The menus and the site** (`docs/38`): #16; Michael's fullscreen check #112.
- **01 · Art owed (docs/26):** the hand items #46; the tools #47; the icons and portraits #48; the art exporter #44; the spot checks #45; the art asks #105.
- **02 · Zombies and combat:** the combat pass #89 (after Michael's session); armour and difficulty #133; the siege #147; darkness's loose ends #158.
- **02 · Better animations** (`docs/32`): #29 to #34 and the elbow's next poses.
- **03 · The demo** (`docs/36`): the scenario layer #40; the set #41; the horde and the run's limits #42; the score, the end, and the entry #43.
- **04 · Playing together, and telemetry:** Play with friends #143; telemetry #144; the Full dot #139; speech lines on a server world #154; the seams #102; a duplication count for the sync check #101.
- **07 · The name:** the business decisions of `docs/35` #94.
- **10 · The regions and release:** the game's final shape #123.
- **Hidden, their milestones unseen until the bot is back (#71):** the background probe #49; the fireball's cost and area #50; the throwing knives and axes #51; the floor stamp in build mode #52 (likely moot now the map is generated, Primary's reading; read when the bot is back); the painted held slot #53; more one-handed weapons #54; `docs/12`'s spec sheet #55. #50, #51, and #54 belong to `02 ·`; moving them is on #71's list.
- **No milestone, by design:** the someday list #106 (`docs/05`).
