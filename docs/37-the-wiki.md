# 37 — The wiki: everything about the game, in one place, true to the code

**Status: scoped 2026-10-14 with Michael. Not started** (his word: a scope and a plan first). This doc is the plan for a real wiki of the game, OSRS-wiki style, in its own repository and its own GitHub Pages site, written and kept up by Claude with Michael making targeted changes. Defaults in brackets are Michael's to overrule.

## What it is, and what it is not

**The wiki says what the game is.** Every item, weapon, station, recipe, creature, villager, place, and rule, as the game on `main` has it today, with the numbers. It is for players one day and for Michael now: after two engine passes and half a big pass, it is the place to find out what is actually in the game.

**The docs say why, and what is planned.** `docs/` stays the design record: rulings, specs, histories, open questions. The wiki never copies a spec. It links to one where a reader wants the reasoning, and planned things appear only as a small marked note pointing to the doc that plans them.

**It is not the docs folder with a markdown reader.** A doc is organised by when and why something was decided; a wiki page is organised by thing: one page for the hatchet, one for the forge, one for the dead, one for the inn, each with the same sections in the same order as every other page of its kind.

## What the OSRS wiki gets right, and what we take

The OSRS wiki is the model (Michael: among the best game wikis ever made, and the community is half of it). What makes it work, read from its pages:

- **Every page of a kind has the same shape.** An item page is an infobox (picture, properties, values, ids), then a lead in plain prose, then the same sections in the same order: Creation, Uses, Products, Item sources, Spawns, Shop locations, Changes, Gallery, and a navbox of related items at the foot. A reader learns the shape once and finds anything after.
- **The tables are generated from structured data, not typed.** The wiki keeps a semantic data store, Bucket, behind its infoboxes and recipes (its `Recipe` bucket alone holds over seven thousand rows: materials, tools, facilities, skills), queryable by API. The Products section of an item is a run of identical recipe cards; Item sources is a table of who drops it, how many, how often. Nobody types those, so they never go stale.
- **A Changes section on every page:** each update that touched the thing, dated.
- **Navboxes and categories** tie every page to its family, so the wiki is browsed, not only searched.
- **Tools beside the pages:** the DPS calculator (dps.osrs.wiki) runs the combat numbers for any gear against any monster.
- **Transcripts** of what characters say.

**Our advantage:** this game is already structured data. Items, recipes, loot tables, the dead's numbers, combat, the props and stations, the map's places and villagers are all JSON in `data/`. What took the OSRS wiki years of volunteers and a custom database, this wiki gets by reading the game's own files. So **the generated half of every page comes from the data, and the written half is prose**, and every number in the prose is a reference to the data, never a typed number.

## Where it lives, and how Claude keeps it

- **Its own repository** [`michaeldippold/cmz-wiki`], in [`C:\Users\micha\Dev\cmz-wiki`], published by GitHub Pages [at `michaeldippold.github.io/cmz-wiki`, a custom domain later]. The game's repo is public, so a public wiki repo costs nothing (Pages on a private repo needs a paid plan).
- **Claude writes it locally and pushes** with the `gh` login this machine already has: no wiki software to sign into, no bot passwords, no API keys.
- **Michael's targeted changes:** every page has "Edit this page", which opens its markdown in GitHub's web editor; a commit there rebuilds the site (a GitHub Action). Or he edits locally like any file. The generated sections are not editable there (they come from the data); a comment in each page's source says so.
- **The game's repo learns one rule [later, Michael's to carve]:** when a feature is merged, the wiki is synced. Not yet a rule, like the guide's.

## The engine: a small generator of its own [recommended]

Four ways, and the recommendation:

1. **A small static generator of our own [recommended].** A Node script with no dependencies but one vendored markdown parser, the way `server/relay.js` has none: it reads the pages (markdown with template markers), the data snapshot, and the images, and writes plain HTML and CSS. The wiki features are small things to compute once you own the whole set of pages: **redlinks** (a link to a page not written yet is drawn red, and the list of them is the to-write list, as on any wiki), **what links here**, **categories**, **navboxes**, the **infobox** floated right, the table of contents, a client-side search over a small index. It matches the game's house style (no framework, agents work fastest in plain files), and the look is ours: a MediaWiki layout in the game's colours and its font (Pixelify Sans, OFL).
2. **An off-the-shelf docs generator** (Astro Starlight, MkDocs Material, Docusaurus): good search and polish for free, but they look and behave like documentation sites, which is exactly what Michael does not want, and the data templates would fight their component models.
3. **Real MediaWiki** (what OSRS runs, hosted by a wiki farm or by us): true wiki editing and a community's tools, but a PHP server and a database to run, ads or a host, and Claude editing through a bot account's credentials. Too heavy before there is a community; worth revisiting if there is one, and pages written as markdown with clean data migrate.
4. **GitHub's built-in repository wiki:** git-backed and Claude-writable, but no generated data, no layout, no categories. Rejected.

## How a page is made

- **The data snapshot.** `node sync.js` in the wiki repo copies the game's `data/` (and the art it needs) from the game's checkout on `main` into `snapshot/`, and records the game's commit hash and date; every page's footer says "Game version: `main` @ abc1234, 2026-10-14". The build never reads the game repo directly, so the site builds anywhere, the Action included.
- **Template markers in the markdown.** A page is prose with markers the generator fills from the snapshot, for example `{{infobox item=hatchet}}`, `{{creation item=hatchet}}`, `{{uses item=hatchet}}`, `{{sources item=hatchet}}`, `{{recipes station=anvil}}`, `{{navbox weapons}}`, and inline numbers like `{{n tuning.zombie.speed}}` ("the dead walk at 1 tile a second"). **A number in prose is always a marker.** A retune in `data/` changes the wiki on the next sync with nobody rewriting a sentence.
- **Generated from the data, by page kind:**
  - **Items** (`data/items.json`, 50 today): the infobox (picture and icon, kind, size in the grid, hands, stacking, tags, and for a weapon its block: damage, speed, reach, stagger, kills before it is spent, the hits per kill derived as the game derives them); **Creation** (the recipes that make it, `data/recipes.json`, with station, inputs, seconds, fire, tool); **Uses** (the recipes and the interaction rows that take it, `data/interactions.json`); **Item sources** (every loot table it is in, `data/loot.json`, with its chance worked out from the weights and rolls, the starter kit, the dev chest); **Changes**.
  - **Props** (`data/sprites/`, 137 definitions): stations with their recipe lists, fires with fuel and hours a unit, containers with their grid and loot, gatherables with what they give, furniture with footprint, carrying, and whether it blocks; one page per notable kind, and generated list pages for the rest.
  - **The dead and villagers:** the dead's numbers from `data/tuning.json` and `data/combat.json`, their wardrobes (`data/wardrobes.json`) as a gallery; each villager from the map file (where they live, what they say: a transcript, and later the talk files of `34`).
  - **Places** (the sets of `data/maps/valley.json`, 20 places, 25 buildings): what stands there, its rooms, its stations and containers, how many of the dead are placed there, and **a picture of it drawn from the map file**: the generator renders the valley to a PNG with Node's own zlib (no canvas needed), each tile a colour, at the screen's angle (`33`), and crops each place from it. The whole valley's map comes free.
- **Images.** The design agent's drawn art is copied from `data/art/`. The generated placeholder art exists only once the game boots, so a small exporter in the game's tools [a page beside `tools/sprites.html`, run in the browser pane] writes every sheet's first frame and the figures to PNGs for the sync. The wiki shows the game's art as it is today, placeholders included, and changes with it.
- **Written by hand (Claude's first draft, Michael's corrections):** the lead of every page, every mechanic page, guides, trivia.

## Page kinds, each with a fixed shape

- **Item:** infobox · lead · Creation · Uses · Item sources · With friends (where it differs) · Changes · navbox.
- **Weapon** (an item): the item's shape, plus Combat (the mouse roles it uses, its alternate mode, stagger, wear) between the lead and Creation.
- **Tool, food, clothing:** the item's shape, with Effects (what it restores, what verb it gives) after the lead.
- **Station:** infobox (footprint, fire, fuel) · lead · Recipes (generated) · Where found · Changes.
- **Prop, gatherable, container:** infobox · lead · What it gives or holds · Where found · Changes.
- **Creature** (the dead, and the animals to come): infobox (health, speed, sight, bite, cooldown) · lead · Behaviour · Fighting them · Changes.
- **Villager:** infobox (home, wardrobe) · lead · Transcript · Changes.
- **Place:** infobox (the map crop, size) · lead · Buildings and rooms · What is there · The dead · Changes.
- **Mechanic** (sight, light, fire, sleep, openings, durability): lead · How it works · Numbers (markers) · With friends · Changes · See also.
- **Guide:** prose, for a new player (Getting started, Your first night, Holding a house).
- **List:** generated tables (all items, all weapons compared, all recipes, all stations).

**With friends** sections are the counterpart of the OSRS wiki's notes for Ironmen: where multiplayer changes a rule (sleep needs everyone in bed, the world never pauses on the wire, a guest's character goes dormant), the page says so in its own section.

## Keeping it honest

- **The code and the data are the truth.** Where a doc and the code disagree, the wiki follows the code and the disagreement goes on an internal page, **Discrepancies**, for Michael and the coding agent; the wiki never "fixes" a design question by choosing silently.
- **The build fails loudly** when a marker names a key or an id that no longer exists, so a renamed item or a removed recipe cannot leave a wrong page standing.
- **The sync reports** every id in the data with no page (new items, new props: the to-write list), and every page whose markers changed values since the last sync (what to reread).
- **Built, planned, and development are kept apart.** A page describes what is on `main`. Planned things live on one **Planned** page and in small marked notes linking to their docs (the map of `33`, farming in `30` step 4). Development tools (the dev chest, Combat testing, the console's `__game`, the debug keys) live in a marked **Development** section.
- **Changes** come from a curated changelog in the wiki repo: at each sync Claude adds an entry per change with the pages it touched (from `02` and the commits), and each page shows its own. A site-wide **Updates** page lists each sync.

## The census: finding out what is in the game

Before a page is written, the wiki needs a census: a complete, checked inventory of what the game contains. It is the first deliverable, and useful on its own.

1. **The automatic inventory** (a script in the wiki repo, run against the game's checkout): every item with its fields; every recipe; every loot table and what is in it; every sprite definition sorted by what it is (station, fire, container, gatherable, furniture, wall, floor, creature sheet); every wardrobe; every tuning and combat number; every setting and rule (`settings.js`, `rules.js`); every key the game reads (`input.wasPressed`, the key events); every verb (`verbs.define`); every menu entry's label (the `act` calls in `interact.js`); the moodles and their stages; the checks. Output: `census.json` and a readable `census.md`.
2. **The reading pass,** by area, in parallel (six readers, each against code and data first, docs second): the world and the valley (map, places, water, light, sight, the day); the player and their needs (health, stamina, the moodles, sleep, death); combat and weapons (the buttons, every weapon, stagger, bleed, infection, durability, the bow); items, the inventory, and making (bags, belt, hands, containers, stations, recipes, fire); building and openings (placement, walls, doors, shutters, boards, breaching, climbing); multiplayer, worlds, and the interface (hosting, joining, identities, characters, dormancy, the HUD, the log, the screens, settings). Each produces a fact sheet: the mechanic, the rule in one sentence, its numbers with their data paths, its code at file and line, and what the docs say where it differs.
3. **The reconciliation:** the differences between docs and code collected into Discrepancies, for Michael.
4. **Spot checks in the game:** a handful of headline facts per area tried in the browser pane (a log splits into three planks; the dead climb an open window in 1.6 seconds; a stick is spent on its fifth kill), so the census is known true, not only read.
5. **The page plan:** the census mapped to pages, kinds, and templates; the redlinks of the first sweep.

## The first sweep: the pages to write

About a hundred and fifty pages, most of them generated with a short written lead:

- **Front:** Main page (what the game is, from `00`, and the way in), Getting started, Controls, Glossary, Updates, Planned, Development.
- **The world:** The valley (the map picture), the day and night, light, sight, weather [none], water and wells, the forest, chunks for the curious; **places** (the inn, the chapel and graveyard, the crypt, the smithy, the joiner, the weaver, the baker, the manor, the merchant's house, the toll house, the square, the green, the cottages, your cottage, the bridge, the ford, and the rest of the twenty).
- **You:** Player, health, stamina, hunger, thirst, tiredness, sleep, bleeding, infection, moodles, death and the next survivor, the character screen, identities and characters.
- **The dead:** The dead (behaviour, sight, the flame at night, memory and search, breaching, climbing, the groan, wardrobes), fighting them.
- **Villagers:** Villagers (what they do now), a page for each of the seven.
- **Combat:** Combat (the three mouse roles), dual wielding and exposure, the guard and blocking, the shove, stagger, the knockdown and finisher, multi-hit, archery, the thrown spear, durability, and **Weapons** (a comparison table) with a page for each weapon.
- **Items:** Items (all), Inventory (the bag, the grid, the one container rule), the belt, hands, clothing, food and drink, tools, materials; a page for each item.
- **Making things:** Crafting (stations, recipes, reach to nearby containers, the queue, the output), a page per station (workbench, anvil, forge, oven, cooking at a fire), recipes (all), fire (lighting, fuel, hours, feeding, torches, brackets, posts).
- **Home and building:** Building (the palette, walls, doors, windows, removal), placement and carrying furniture, openings (doors, shutters, boards, the dead breaking in, climbing through), rooms.
- **Gathering:** Gatherables (trees, rocks, mushrooms, crops, pumpkins: the wobble), chopping, foraging; farming as it stands (crops grow in the art, the verbs are planned).
- **With friends:** Multiplayer (hosting, Open to friends, joining, the relay, codes), worlds and saves, dormancy and rejoining, sleep with friends, what a host's settings decide.
- **Interface:** the HUD, the log and chat, menus, the Use mode, settings, the cursor.

## Build order (when Michael says start)

1. **The census** (above), with Discrepancies, delivered for Michael to read before any page.
2. **The repository and the generator:** layout, the snapshot and sync, markdown and markers, redlinks, what links here, categories, the build that fails on a broken marker, the Action, Pages.
3. **The data templates:** item infobox, Creation, Uses, Item sources, recipes by station, navboxes, inline numbers.
4. **The generated pages and the images:** every item, prop kind, station, villager; the art exporter in the game's tools; the valley's map picture.
5. **The written pages:** the mechanics, the places, the guides, the front pages; each lead.
6. **Search, Changes, Updates, Planned, Development.**
7. **The workflow written down:** how a sync goes, in the wiki repo's README and a line in the game's `CLAUDE.md` naming where the wiki lives.

**Done when:** every item and every station has a page; the build reports no broken markers and no number typed in prose; every page has its game version in its footer; Michael can open a page, press Edit, change a sentence, and see the site rebuilt.

## Open, for Michael

- The name and the address [`cmz-wiki` on GitHub Pages for now].
- Public from the start, or private until there is a demo (private Pages needs a paid GitHub plan; the game's repo is already public).
- Placeholder art on a public wiki: shown as it is [yes, it is the game as it is], or text-only pages until the art is final (the demo's rule is final art only, `36`).
- How much of what is planned to show: [one Planned page and small notes], or nothing until built.
- The voice: encyclopaedic and plain like the OSRS wiki [default], with the game's own warmth in the leads.
- Whether the wiki sync becomes a rule in the game's `CLAUDE.md` once the wiki exists.

## Sources

[OSRS wiki: Bucket of water](https://oldschool.runescape.wiki/w/Bucket_of_water) (the item page's shape) · [OSRS wiki: Bucket, the data store](https://oldschool.runescape.wiki/w/RuneScape:Bucket) · [OSRS wiki: the Recipe bucket](https://oldschool.runescape.wiki/w/Bucket:Recipe) · [OSRS wiki: the Infobox construction bucket](https://oldschool.runescape.wiki/w/Bucket:Infobox_construction) · the DPS calculator at dps.osrs.wiki, as described by [The Oatrix](https://www.theoatrix.net/post/osrs-dps-calc).
