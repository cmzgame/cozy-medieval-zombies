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

## Status (2026-10-24, Michael's hold: two sittings of the Valley scope ruled; the melee feel pass under way; the loot and bag defaults drafted and held)

**Where to pick up:** a new Primary since 2026-10-23, focus planning and infrastructure. Michael's three goals, in order: (1) a final Valley scope (#271, `docs/39`); (2) a limited demo scope, a cut list from `docs/39` against `docs/36`, each line naming its valley issue; (3) building both, demo-first, after a plan is talked through in chat (Michael prefers prose to question widgets). **The Valley scope closes by the defaults pass:** Primary proposes an answer for every open line of `docs/39` on its issue, one issue per sitting, Michael overrules in prose, what stands is the default marked tunable; the scope is final when `docs/39` section 16 is empty, and the milestones and issues follow from it. Two sittings are done (#275 and #264, below); **the third, #268 and #260 together (the loot tables and the bags), is drafted in chat and held at Michael's word until he comes back to it.** Then #273 (the dead ends), then the rest by their counts below. Then the demo's cut list, with its four build issues refiled (#40 to #43 are the bot's, hidden).

**Ruled 2026-10-23** (`docs/02`, newest first; each rewrote its lines of `docs/39`):
- **the food economy (#264, PR #360):** everything rots, food in containers from the world's start and planted or hanging food generously slowly (five times its life, Primary's reading), within the clock law because the world's clock runs only while someone is in it; the rates per food; Rotten is an item for the composter; "Spoils in N days" on the card; a barrel doubles food's life, no cellar; a leaner start to about twelve game days of food on day one; the starving fade over half a game day; no auto-eat; a dry growing crop pauses, a ripe one rots in the ground;
- **the skills' open lines (#275, PR #359):** death takes all skills; combat experience by damage dealt, Faith by its acts; a skill touches combat only as far as the four combat trees say; level-1 recipes known, the rest learned once from a teacher on the teacher's screen; the station panel lists every recipe, the unlearned greyed; every melee weapon craftable; the staff in either hand and the book in the other, the book never degrades, no spell bar; "Book of [Spell]", "Staff of [School]"; the testing map (below);
- **the demo (PR #356):** built now on dev art, the game's bounded playtest; only its release waits for final art;
- **the melee feel pass (Michael with the Secondary (combat); `docs/41`, #89, PR #368 open):** six steps, each measured by `check("melee")` before the next; no endurance or strain ever; the turn rate never capped; hit sounds gate the finish; the unconditional bite cancel stands for now as a lever to tune after real combat testing.

**The valley's map as it stands is a testing map, not the final valley** (Michael, 2026-10-23: "a smidge too close, and most of the buildings you can barely fit into", an updated clearing); the redraw and the teachers' placement are #92.

**The melee feel pass (the Secondary (combat)):** the instrument merged (#369, `check("melee")`; the baseline on #362: 12.4 bites a fight swinging, 6.4 with the shove); the spec PR #368 has Primary's review with six fixes and Michael's word, and merges when the fixes land; step 1 (PR #370) is approved and merges after #368, refreshed; steps 2 to 6 are #363 to #367. Every pull request into `main` is reviewed by Primary, the reasoning as well as the code (Michael, 2026-10-23).

**Done 2026-10-23 besides:** #256 (dead code, #99) and #255 (region, never biome, #135) merged, both invisible to players; #357 (the earlier status). Nothing merged today changes what a player sees, so no wiki sync is owed yet; the first visible change will be #370.

**Open for the Secondary:** the status page (#358, `tools/status.html`, reading GitHub live), after the melee pass.

**Not done, Michael's hand:** the finished worktrees under `.claude/worktrees/` are all merged into `main` (two hold only an untracked `art-preview/` folder and a regenerated manifest); a session may not remove them, so Michael does (`git worktree remove <path>`, then `git worktree prune`), or Settings › Storage once they are old enough.

**Waiting on Michael:**
- the loot and bag defaults (#268, #260), drafted in chat on 2026-10-23, held;
- #271's items 6 and 8 to 11; the sounds spec's questions (#310);
- #341 (a multi-tile prop across a chunk edge on a guest; two players lifting one piece of furniture); #324 (no rush);
- the `needs-michael` issues: #89 (now the melee pass's record), #92, #94, #123, #133, #181, #217;
- from the last play list: which valley building got which wood (`docs/02`, "The woods as wall types, built"); Bloodbark near-black at night away from a light (the lever is in `wood_tones.json`); the shared world zoom setting reads "auto".

**The open lines of `docs/39` by issue** (counted 2026-10-24; 206 lines built, 206 to build, 73 to change, 96 open, down from 162): #273 13 · #92 11 · #289 10 · #279 10 · #288 8 · #281 7 · #123 7 · #282, #181, #133 5 each · #283 4 · #103 3 · #268, #262, #260, #104 2 each · #271, #261, #106 1 each.

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
- **02 · Zombies and combat:** the melee feel pass (`docs/41`; #89 its record): the instrument #361 built; steps #362 to #367; armour and difficulty #133.
- **02 · Better animations** (`docs/32`): #29 to #34 and the elbow's next poses.
- **03 · The demo** (`docs/36`): the scenario layer #40; the set #41; the horde and the run's limits #42; the score, the end, and the entry #43.
- **04 · Playing together, and telemetry:** Play with friends #143; telemetry #144; the Full dot #139; a guest's arrows step every third frame #250; the seams #102; a duplication count for the sync check #101.
- **07 · The name:** the business decisions of `docs/35` #94.
- **10 · The regions and release:** the game's final shape #123.
- **Hidden, their milestones unseen until the bot is back (#71):** the background probe #49; the fireball's cost and area #50; the throwing knives and axes #51; the floor stamp in build mode #52 (likely moot now the map is generated, Primary's reading; read when the bot is back); the painted held slot #53; more one-handed weapons #54; `docs/12`'s spec sheet #55. #50, #51, and #54 belong to `02 ·`; moving them is on #71's list.
- **No milestone, by design:** the someday list #106 (`docs/05`).
