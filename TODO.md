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

## Status (2026-10-20: the playtest batch shipped; art round 3 in, its wiring scoped)

**Where to pick up: art round 3's wiring.** The design agent delivered three zips (fences and everyday icons, beehive and coop, woods with rugs and paintings). The art is imported by #330: 239 PNGs, audited against the READMEs, nothing wired yet. If #330 is still open, merge it first once its review approves. Each wiring step is its own scoped issue, each with its open questions for Michael at the bottom:
- **#331 the everyday items:** world pictures, held angles, icons, portraits; the torch's `flame_px` and lit icon. Asks: the long thin icons, convention or large; the rope belt's colour.
- **#332 the drawn fence and its swinging gate.** Asks: whether house doors swing too; whether fences are buildable now.
- **#333 the beehive and the chicken coop** in the valley; the coop is a placeholder container. Asks: where they go; what the coop holds.
- **#334 the woods.** Build in five woods, and mix a wall's wood with its doors' and shutters' finish (white paint first). The swap is done at load from `wood_tones.json`. Michael's idea: the regional woods and the paints are an incentive to leave the valley. Labelled needs-michael.
- **#326 paintings and #327 rugs, as items:** Place from the bag, Pick up again. Both built (#327 merged; #326 in review: `check("paintings")`, `docs/02` 2026-10-20 "Paintings, built").

Suggested order: #331 (the most visible), then #333 (small), then #332, then #326 and #327, then #334 once Michael has shaped it.

**Shipped today (2026-10-19 to 20), all merged, the wiki synced:**
- floating numbers (#299);
- the navigation row (#298, #312);
- parchment talk (#297);
- tainted water and crop Inspect (#302);
- Object Highlight (#303);
- durable fullscreen (#311);
- the item hover cards (#313);
- bleeding as a debuff (#315, #320);
- small text in a clear sans (#322, #323);
- every digit clear (#325);
- the sounds spec (#314, `docs/40`, its six questions open);
- the art brief (#316).

**Ruled 2026-10-20** (`docs/02`):
- a change to an item checks its hover card (#319);
- every digit is in the clear font;
- paintings and rugs are items, placed from the bag (#329, which overturned the same day's Decor-in-the-build-palette ruling).

**Waiting on Michael:**
- the sounds spec's six questions (#310);
- the open questions in #331 to #334;
- the hardening of the small-text scan (#324, chore, no rush);
- the earlier list (#271's items, #275's parked crop tools).

**The design agent's worktree** (`C:/Users/micha/Dev/cozy-medieval-zombies-art`, branch `art-docs`) was fast-forwarded to main on 2026-10-20. Its deliveries sit under `deliveries/`, untracked; the imported copies are the repo's.

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
