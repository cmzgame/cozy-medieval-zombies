# TODO

Working checklist. A new session reads `CLAUDE.md`, then this file, then the doc a task links to. Keep the **Status** block current at the end of every session.

## Status

- **Current milestone:** 10, the village art comes in (`docs/17-village-art-plumbing.md`), **planned 2026-10-11, not started**; Michael's rulings on the plan's defaults come first. 9, the ground, accepted; melee (8) accepted for now with step 5 and more weapons open (see "Where work stopped" below; the Status below is history, oldest first).
- **What exists:** a chunked map stored block by block with edge walls (`map.js`), rooms by flood fill, line of sight by grid traversal with corner sampling (`visibility.js`), a following camera over cached chunk floors (`camera.js`, `render.js`), four-walled buildings whose near walls go translucent when you are inside, doors and shuttered windows worked with `E` (`interact.js`), corner posts, fog over what you cannot see, the dead with memory of where they last saw you, a stamina bar, and a hand-written square (`data/maps/square.json`) with a cottage, a shed, a farm plot, three jack-o'-lanterns, harvest forest scattered by rule, and wild forest with a few of the dead per chunk beyond the authored bounds. Copied modules carry origin headers.
- **Last completed task (2026-10-09):** Milestone 1 built and checked by script in the browser: the player walks from the square through the cottage door with no cut and a zombie follows through it; a wall stops the player at its face; a window shows a wedge of the room from outside and a wedge of the square from inside; stubs on the near walls indoors; the fog leaves no seams; 60 fps with about 730 tiles in view.
- **Also on 2026-10-09, from Michael's play notes:** the dead remember only where they last saw you (chase, search ten seconds, give up); every window has shutters, tap E to open or close, hold E to climb through, the Zomboid scheme; corner posts where walls meet; no bites through walls. He sprinted out of town with no freezes and the infinite grass felt freeing.
- **Later on 2026-10-09:** Michael called it a Place: better than either parent, plays like Zomboid, the art contrast is fun. Doors added (tap E, start closed, the dead cannot open them yet), all fittings one wood with metal strips, open shutters and doors swing out on the outside, the setting widened to dark medieval fantasy, and three jack-o'-lanterns with flickering fire for October.
- **Forest pass, 2026-10-09:** big trees in three sizes and four harvest colours, scattered by rule with noise-shaped density, a padding ring around buildings, trunk-only collision with deflection, and the wild beyond the authored map grown as forest with a few of the dead per chunk. Blue and purple trees are on file for a gloomy zone later.
- **Pin, end of 2026-10-09.** Michael: "this suddenly genuinely looks like a real game." His call on what comes next, and it is the important note of the session: **the last thing the vibe pass needs is a real lighting system like the cozy parent's.** Dynamic light that changes what a room looks like, not a gradient glow: hearth, candles, the jack-o'-lanterns, lit windows, night. From there every gameplay decision will be more fun to test. The parent's art looked good but felt sterile; this is a different place.
- **Docs pass, 2026-10-09 (midday):** the docs caught up with the day's rulings. Glass and curtains became shutters everywhere, stubs became translucent walls in `docs/03`, "walls are tiles" became "walls are state on tile edges", the missing-chunk rule now says wild forest, `docs/02` is newest first within the day with the superseded shirt and Gloomwood lines struck, `docs/06` has the real tree sizes and collision radii, and the parent's tuning numbers are open question 19. One code fix: an animated prop west or north of the origin asked for a negative frame index.
- **Torches and fire talked through, 2026-10-09 (afternoon):** rulings in `docs/02` and the design in `docs/07-lighting.md`. Hands on every holdable item (main, off, both); torches never burn out and mount in brackets or on posts, never on the ground; the dead see fire from far away at night; fires are data with a campfire and a hearth that burn wood and cook; the clock comes first; the fog becomes light. The spear is tabled until combat.
- **Go, 2026-10-09:** Michael read `docs/07` and said go. Logs are free until trees can be cut; the light layer may be smoothed as the parent's was, with per-cell light on the backburner.
- **Steps 1 to 3 of Milestone 2 built, 2026-10-09:** the clock, `light.js`, and the night layer. Michael's first look: "even better than I hoped". Knobs for the pause, from the console: `__game.render.night.tint` (now `36, 22, 56`) and `.alpha`, `__game.light.tunables.dayCap` (0.92; set 1 for a full day), `]` and `[` to move the clock.
- **Milestone 2 built, 2026-10-09 (evening):** fire as data (hearth in the cottage, campfire on the square), the torch on `T` and in brackets and posts, hands on the player, the dead reading light and noticing fire at night. Michael's rules from play fixed what the first night layer got wrong: exterior walls light like the ground, wall tops take the sky, everything on a tile takes its tile's light. Scripted acceptance passed; Michael's play verdict on the whole is pending.
- **Milestone 2 accepted, end of 2026-10-09.** Michael: "good for now", not perfect. Four play rounds found and fixed: walls hidden from the player keeping the room's dark, canopies over lit rooms lighting up, a shuttered room dark on its walls but not its floor, and furniture behind a translucent wall showing through it lit (his diagnosis). His rules for what takes which light are in `docs/07`. Stubs on `C` would remove the translucent-wall mixing if it ever matters more.
- **Ordered night pass, late 2026-10-09:** at Michael's call the stencils became one rule: after the floor, every drawable paints its own darkness over its own shape in sort order, flames included. The stencil code is gone; about 3 ms a frame, 60 fps. `docs/07`, "How things are lit", describes it.
- **The renderer goes to WebGL, ruled late 2026-10-09:** Michael brought an outside spec (PixiJS recommended); we take its lighting and portal ideas and go raw WebGL2 instead. Rulings in `docs/02`, design in `docs/08-renderer.md`: portals as emitters, a transmission scalar, the floor field, then the WebGL renderer at parity, then light per pixel. Gameplay pauses for it.
- **Phase 1 of 2b built, 2026-10-09:** portals, transmission, the floor field. Knobs: `__game.map.openingTunables.shutterLeak` (0.05), `__game.light.tunables.roomBounce` (0.5; 1 is the old flat room).
- **Milestone 2b built, 2026-10-09:** the world is drawn in WebGL2. Knobs on `__game.render.night`: `climb` (56 px, 0 for flat faces), `linear` (false for per-cell light), `standingFloor` (0), `debug` (or the `L` key); `G` shows the old Canvas renderer for comparison.
- **Accepted, 2026-10-09.** Michael: "THIS is the right system. It looks amazing." The debug view is "like looking at the map with infrared goggles on." `render-canvas.js`, the second canvas, and the `G` key are gone.
- **Openings ruled and designed, 2026-10-10:** bars on both sides, the opening as a stack read from the attacker's side, the dead climb through windows and attack the room's nearest opening, nothing breaks a wall, sealed derived per room. `docs/09-openings.md`.
- **Milestone 3 built, 2026-10-10:** the dead get in. Boards on both sides of any opening with `B`, the leaf with health, nothing repaired; the dead breach the nearest opening of the room they want into or out of, and climb through open windows. Scripted acceptance passed; Michael's night pending.
- **Michael's first night, 2026-10-10:** "I like this a lot. The system works." Three things fixed from it: a boarded leaf drew as a see-through frame with three planks whatever the count, so the sheet now has a frame per count over a shut leaf and over an open one; a zombie paced outside a window because it was searching around a sighting inside the room, so a search now stays on the searcher's side of the walls; and a flame could pull a zombie you had just drawn off straight back, so a flame cannot take over for eight seconds after it last saw you. Two stuck on each other in a gap now drop their path after a second and a half of no progress.
- **Milestone 3 accepted, 2026-10-10.** Michael: "Tested and working as desired."
- **Milestone 4, the interface, built 2026-10-10** (`docs/10-interface.md`): the grid inventory on Tab, right-click menus for everything, left-click to walk, E for the nearest simple thing, the health bar, hunger and thirst as moodles, logs and planks as real items with Chop down and Split, the well. Scripted acceptance passed; Michael's play verdict pending.
- **Michael's notes after play, 2026-10-10:** "It's awesome." Left-click to walk removed (left click stays free for selecting and placing later); Escape closes the menu, then the bag, then pauses and resumes; a log is 2×3 and splits into three 1×3 planks.
- **Milestone 5, the character, built 2026-10-10** (`docs/11-character.md`), Michael's play notes applied the same evening (hands are full slots, torch in either hand, rope belt and burlap sack, no starter hood, the centred RPG doll; open questions 20 and 21 on bags in bags and the view on a big window): everything is a slot; the belt gives the hotbar and keys 1 to 4, the bag on your back gives the grid; the bag is an item that drops with its contents, opens on the floor, and swaps. The character screen on C, the cutaway on K. The eight scripted checks pass (a step with the screen open is under 2 ms); Michael's play verdict pending.
- **The view and the screens, 2026-10-10 night:** the world fills the window at an integer scale, the interface scales on its own, title and pause and settings and controls screens, settings kept in the browser. Michael's law written into `docs/00`: if the game is good, people will sit for a loading screen.
- **Michael's notes on the screens, same night:** bag stays top-right, doll dead centre; zombie aggro is a setting, off by default; the dead kill and there is a dead screen back to the title; Save game placeholder, disabled. Next: the hotbar conversation he asked for, then player sprites and customisation, then melee.
- **Later still, same night:** double-click uses a thing; the wheel zooms in integer steps 1× to 3× (replaced the same night by the three snap levels). Question 20 was closed later that night by the one container rule.
- **Late, same night:** the belt is utility slots (consumables on the belt, key to use; hand items swap); a belt torch glows at half and is seen from half as far; the zoom snaps between wide, middle, and close (Z, the wheel, or settings) after a smooth zoom spun the player and was withdrawn; the GPU scales world pixels; chunk growth back to three. Michael to judge the fractional-zoom look at the three levels.
- **Survival setting, same night:** off by default; nothing drains. Future needs (cold, sleep) hang off the same switch.
- **Containers and carrying, same night:** the one container rule (empty containers only, inside anything); furniture carrying (bed, table, chest, barrel), walking only while carried. Question 20 closed.
- **Fixes, 2026-10-10 late:** right-click on a door or shutter face finds the opening again (the hit test was only the edge's midpoint on the ground, and the face is 72 px tall); the key watchdog (drop a key that stops auto-repeating) was tried against the player walking off on their own and withdrawn within the hour: Windows repeats only the newest key, so it broke diagonals and stranded the player. Held keys now drop on blur, focus, and hidden. The walking-off bug is still not reproduced; cause unknown.
- **Blocked on:** nothing.
- **Loose ends:** the walking-straight-up bug (Michael and his brother, cause unknown, watch for when it starts and which direction); Michael's eye on the fractional zoom levels; auto-drinking (question 22); Save game is a disabled placeholder.
- **Milestone 6, the figure, built 2026-10-10** (`docs/12-figure.md`, `src/figure.js`): a software-rasterised rig, eight facings drawn, the chunky proportion (head two fifths), outline and two tones, garments as rules baked per outfit, held art at the hand joints with the flame at the torch's tip, carry poses, ten zombie outfits, look parameters from the console. Michael saw it live: the torch in hand, the figure next to his references. The creation screen is next in this line.
- **Michael's first play, 2026-10-10:** "the part that actually matters, does it work, yes and it's awesome"; the rig feels alive, the backpack, the light, the eight facings, the animations, the zombie variety. The art itself is ugly and his to critique next. His one real note fixed the same hour: a holding arm now comes forward and the item tilts ahead of the hand (sixteen held angles) instead of standing strapped to the side.
- **Michael's first art critique, 2026-10-10, applied:** outline per body part (no Michelin rolls), Habbo side shading, a rounded-square head with hair as a helmet that any hat replaces, a front-on face with whites in the eyes, eggshell tunic, hands beside the hips.
- **Second critique applied, 2026-10-10:** narrower head, flat face, bigger eyes, no mouth, curved hair cap that turns with the face, tunic over the legs always. Facial hair noted for the creation screen.
- **Third critique and the hair editor, 2026-10-10:** the three-quarter facings keep the front cap (the face and the hair now agree); the belt is a strip, not a weightlifting belt; eyes three by four; `tools/hair.html` paints hair styles into `data/hair/`, listed in `index.json`, drawn over the face. Michael paints while code goes on.
- **Editor, round two:** Save to game through `serve.py`, load from the game, fill tool; a Hair row on the settings screen with Reload. Eyes a row taller and lower; the belt one row.
- **Michael painted a purple short (2026-10-10) and it worked in game.** Pupils a row taller, the side eye is the front eye, tunic shirt length, a boot seam. The next editors are ruled in `docs/12`: arms and gloves as free shapes, the rest substitution, helms as hair, tunic length and hide-belt options.
- **The layer editor, 2026-10-10** (`tools/layers.html`): every slot, player or zombie body, substitution and free parts, start from generated, mirror, preview poses, save to game, a pool for the dead; settings rows per slot. Michael's purple hair is in the repo (`data/hair/purple.json`). He paints; the game he plays is served from this worktree.
- **Pinned before bed, 2026-10-10:** goobers ruled (neutral body, they/them in text); next conversations in order: the older dev art (trees, campfire, hearth, bed, crate, well), the belt as its own paintable item, a placement tool (hover preview, R to rotate, validity) that unifies building and placing and replaces E-to-drop for carried furniture, combat animation and item art with a good one-handed swing first, the character creation screen.
- **Scoped 2026-10-11:** pins 3 and 4 are `docs/13-placement.md` and `docs/14-combat.md`, written for another model to build (see `CLAUDE.md`, "Implementing from a spec"). Pins 1 and 2 (the older dev art, the belt as a paintable item) are to be inferred from what exists; pin 5 (the creation screen) follows.
- **Milestone 7 accepted, 2026-10-11** ("the fundamentals are here"); clean-up notes in `docs/13`, "Accepted, and what is left for later": stone, tear-down of authored walls, refunds, the campfire, an in-game building editor, props from the bag.
- **Where work stopped, 2026-10-11 (melee accepted for now):** Milestone 8, melee (`docs/14-combat.md`, "Status"), is built, script-verified, and **played with a mouse: "feels good", the swing-target outline "feels great", multi-hit and single-hit "work as advertised"** (Michael). Done: the swing as data, six weapons with every number tunable per item, the hit test and the dead's reactions, the feedback, the health bars, Show hit shapes (debug) and Swing targets (play), multi-hit, no laser vision through the forest. **Open in this milestone: step 5**, the painted held slot in the layer editor, which is also how new weapons get drawn.
- **Michael's first melee pass, 2026-10-11 (on a trackpad):** melee works, but feel numbers (item 3 of the testing list) need a real mouse before they're trusted — a trackpad can't judge swing timing or aim pull. Knockback cut to a third across fists and every weapon (`SHOVE` untouched); attacking a downed zombie was confirmed already working (the finisher, double damage) — not a gap, just no visible tell it happened. A floating health bar (`src/ui/zombie-bars.js`) is that tell now: it shows over any damaged zombie and halves visibly on a finisher. Rulings and the exact numbers in `docs/02` and `docs/14`.
- **Older dev art, trees done, 2026-10-11 (while melee waits on a mouse):** pin 1 of the five, first cut. Lumpy canopies and a tapered, root-flared trunk with bark streaks, `generateTree` split off from `generatePost` in `src/placeholders.js`; same palette and sizes, `docs/06`. Deliberately not round: Michael's call was halfway between a drawn treetop and circles on a pole, outline kept a little ragged so it does not read "happy" once Gloomwood's blue and purple trees reuse the same shapes. Campfire, hearth, bed, crate, and well are still the old blobs.
- **Melee tunables, 2026-10-11:** every weapon field is tunable per item (new `knockbackChance` and `stagger`), fists and the shove live in `data/combat.json`, the shove's push cut to a third (0.53), multi-hit is a setting (on) with a per-weapon `multiHit: false` override (`docs/14`, weapon table). Michael says melee is "in a good spot"; the mouse pass on feel is still the open item. Under discussion: a Zomboid-style aim outline on zombies the next swing would hit.
- **Swing targets, 2026-10-11:** a green outline on the zombies the next swing would hit (setting, off by default; deterministic, ignores the cooldown). **Pinned:** a compact sandbox settings screen (`docs/10`); the settings screen scrolls meanwhile.
- **No laser vision through the forest, 2026-10-11:** the soft see-through hole in a canopy is the player's alone; a zombie behind a tree is hidden by it, and its health bar hides too unless it is within 3.5 tiles (`docs/02`, `docs/06`). Sight (fog) is unchanged.
- **Trees, drawn, 2026-10-11:** Michael's Claude Design sheet is in (`data/art/trees/`, 36 PNGs; oaks and spires, three sizes, six colours; `docs/06`) and **remapped his way**: no small tier, the sheet's S, M, L are the game's `m`, `l`, giant, all drawn 1.5 times bigger (a `scale` in the sprite definition), giants one tree in five. **Left on the trees:** no ground shadow under them; native-resolution sprites at the final size would be crisper than the resample; the gloom colours wait for a zone.
- **The ground is scoped, 2026-10-11 (milestone 9, `docs/15-ground.md`, for implementation by another model):** the ground baked per chunk on the CPU and drawn as one quad through the existing shader; the kit's grass by hash, a smooth patch tint and canopy darkening, baked tree shadows, flat decals from `data/ground.json`, dirt, farm, and cobble blended with ragged pixel-crisp edges (cobble always in a dirt verge), the build-mode grid, eviction. Five build steps with a pause for Michael after each; acceptance list in the doc. Michael tunes the numbers in `data/ground.json`. The kit's PNGs are still in his Downloads (`ground_kit`) and come in at step 1.
- **Where work stopped, ground, 2026-10-11:** **all five steps of `docs/15` are built**; the acceptance script (`tools/ground-check.js`) passes nine of nine scripted checks. Revisions from Michael's reviews are in (round cobbles, the Square and paths setting, a tidier farm, the walkable trial pond kept, authored surfaces covering their tiles with edges reaching only outward). The redrawn trees and decals from Claude Design are in (crisp trees, readable decals); four rocks came with the decals and wait for a design talk. **Waiting on Michael:** check 10 (his eye) and the cobble-or-dirt choice for the square. **Pinned:** a floor stamp in build mode that writes authored floors into the map file (`docs/15`). Ground stays authored.
- **Interactables, first cut, 2026-10-11:** mushrooms (a `forage` rule near trees), rocks (three in the village, sparse in the wild), and trees are clickable game objects: a left click swings and the thing sways (base still, top leaning); right-click sways it and offers its actions (trees: Chop down, from anywhere on the tree). No stats or other actions yet; question 27 in `docs/02` holds the design.
- **Walls and the village art brief, 2026-10-11:** walls are 80 px tall; stone 16 px thick, wood 14, logs 18; doors (top 48 px), windows (22 to 51 px), and brackets fixed in pixels from the floor; open shutters fold back flat against the wall. `docs/16-village-art-brief.md` holds paste-ready Claude Design requests (furniture with the well first, a chair, a fireplace; wood and stone walls with doors and windows; solid-looking open doors and shutters) and answers to Claude Design's seven questions. **Law since then:** gatherables wobble when clicked and carry a dark outline (trees excused). **Waiting on Michael:** that art, and the rocks and interactables conversation (question 27). **Next conversation:** what should exist on the whole authored map; this map is a proof of concepts, and the real one gets built with the finished art and some build tools.
- **Next, in order:** (0) **Milestone 9, the ground** (`docs/15`): Michael's eye, then the redrawn art swapped in; the floor stamp is pinned. (1) Step 5, painted held items (`tools/layers.html` held slot, `data/held/`). (2) **More one-handed melee weapons**, drawn and given stats (axe, shovel, club, others). (3) **The older dev art:** the trees are done; the campfire, hearth, bed, crate, and well remain. (4) **Decide dual wielding** (question 23, the game needs an answer if you try), **a usable shield** (24), and **the bow and arrow** (25), which is designed carefully on its own first. (5) The belt as its own paintable item; the compact sandbox settings screen (`docs/10`); the character creation screen (with facial hair). Candidates after: the dead's wind-up and lunge, sounds, searchable corpses, two-handed weapons.
- **Done earlier, kept for the record:** Milestone 3 (the dead get in) and the melee port are now both built; see their sections below.
- **Notes:** the debug corner shows the cost of a logic step and the worst step in the last three seconds; a freeze should show up there first. Run `python serve.py 8010` in this repo (the file serves its own folder, so it can be launched from elsewhere). `V` toggles the fog off to compare. Michael plays in the in-app browser pane while work happens, so scripted tests see his inputs.
- **Notes:** Michael wants to burn this week's credits on this. He likes a pause between phases (docs, then build) and plays in his own browser while work happens. Nothing from either parent is gospel.

## Conversations to have before code

In order. Each ends with a line in `docs/02-decisions.md`.

- [x] **Chunks instead of nodes** (`docs/03-world-model.md`). Ruled 2026-10-08.
- [x] Viewport size for the probe: 960×540, which is Zomboid's 100 percent zoom.
- [x] Single storey first, with layer-ready tile data.
- [x] Roofs: none for the probe, nothing written to foreclose them.

The remaining open questions in `docs/02` are decided at the milestone that needs them. None blocks the probe.

## Milestone 1 — The probe (see `docs/00-vision.md`, "What the first milestone must prove")

Placeholder art. No sim beyond the active region, no inventory, no needs, no save, no UI beyond a debug corner. The point is to answer four questions, not to make a game.

- [x] Repo plumbing: `index.html`, `style.css`, `serve.py`, `src/main.js`, copied `iso.js`, `loop.js`, `input.js`, `events.js`, `sprites.js`, `placeholders.js`, `render-util.js`, `assets.js` with origin headers.
- [x] Chunked map: a dictionary of 16×16 chunks behind `tileAt`; a missing chunk is created on demand, so the ground goes on forever (plain floor inside the bounds at first; wild forest beyond them since the forest pass). The authored square is sliced into chunks at load; fetching chunk files on demand is a later step, the shape allows it. Walls sit on tile edges (`n`, `w`), Zomboid style. Doorways are passable across their full width (the first version kept the jambs solid, see the scripted checks below). Windows were glass for the probe and became shuttered holes the same day: closed blocks sight, open passes sight and can be climbed.
- [x] Camera: float grid position following the player, origin derived from it so `iso.js` is unchanged, integer-scaled 960×540, only chunks in view drawn, floor cached per chunk as one image.
- [x] One cottage and one shed: four walls, door openings, windows, wood and stone floors, a bed, a table, a chest, barrels. The player's room is found by flood fill; its near walls draw full height and translucent, so windows and doors are the same inside and out (Michael's note, 2026-10-09: the stub's sunken frames were a leftover from faked near edges). `C` switches to the old low stubs for comparison.
- [x] Player copied and walking with circle collision against props and wall segments. Three dead copied; they path with the bounded A\* through doorways and chase on sight.
- [x] Visibility: a ray to every tile in view, walked edge by edge. Out-of-sight tiles fogged, out-of-sight dead not drawn, visible walls and sprites cut out of the fog.
- [x] Debug corner: fps, position, chunk, room, tile and visible counts, zombie states. `V` toggles the fog.

**Accept when** all four proofs hold:

1. Walk from the square into the cottage and out again with no cut, several times, with dead following. It feels better than the dollhouse did.
2. Stand inside the cottage. The near walls are stubs, the far walls are full, the building reads as a building from outside and as a room from inside, in chunky placeholder art.
3. Stand at a window. A wedge of the square is visible through it and nothing else outside is. It reads at a glance without explanation.
4. The viewport shows enough of the square to feel like a village and the pixels still look chunky at 2x.

If any proof fails: stop, write down why in `docs/02`, and talk.

**Scripted checks, 2026-10-09:** from the square, holding up-right for 1.3 s took the player through the door to (15, 7.05) in room 1, and a chasing zombie followed through the same doorway; the same walk aimed at the wall beside the window stopped at 8.85, the wall face plus the body radius; after Michael found doors impassable in play (the first version kept the jambs solid, leaving a gap exactly one body wide), doorways became passable across their width and gained a door magnet in `moveCircle`: approaching the cottage door 0.35 and 0.7 tiles off centre, and the shed's west door straight on and 0.4 off, all slid into the opening and ended inside, while a wall with no door within a tile still stopped the player with no sideways movement; Michael then reported freezes of a second or two: refinding rooms took 1.6 s for 16 chunks because finished outdoor tiles were marked the same as unvisited ones, so every grass tile restarted the fill, and it ran whenever walking created a chunk. Fixed (2.9 ms for 23 chunks, and wall-less chunks no longer trigger it), alongside numeric tile and chunk keys, sight recomputed only when the player or camera changes tile, a heap in the pathfinder with a backoff after a failed search, and a 0.1 s catch-up clamp in the loop; sprinting across 23 chunks with chasers: worst step 1.6 ms at 60 fps; from (13, 10.2) outside the left window, the two tiles straight through the glass were visible and the tiles either side were not; inside, the south and east walls drew as stubs and the square showed as wedges through the door and windows; 60 fps with 714 to 753 tiles in view and about 60 drawables.

## Milestone 2 — Lighting, fire, and the clock (see `docs/07-lighting.md`)

Each step checkable on its own. Michael looks after step 3.

- [x] `clock.js` copied; clock label in the HUD and debug corner; `]` and `[` skip an hour.
- [x] `light.js`: ambient by room and openings, per-chunk static map with shadows, `lightAt`; the jack-o'-lanterns as the first sources. Checked by script: a lantern's pool stops at the shed wall and spills through its open door (0.22 closed, 0.57 open on the door tile).
- [x] Night layer: dusky tint, room erase, chunk maps, the player's pool, wall faces repainted by the tile they look onto, flames in a stencilled layer so a lantern never shows through a wall or a head (Michael caught it in play). Render about 1.5 ms at night. **Paused for Michael: tint, day cap, room light.**
- [x] Fire data on sprites; hearth and campfire placeholders; burning; `E` lights and feeds with free logs; flames drawn. Checked: two logs light the cottage whole and spill through its open door; out after 120 s; a campfire on the square with two logs.
- [x] `items.js` with hands; the torch on `T`; carried pool with rays; brackets and posts; `E` mounts and takes. Checked: a bracket inside the shed lights it and gives up its torch on `E`; a post by the road takes it.
- [x] Zombie sight by light; the dead see fire at night. Checked by script: a zombie nine tiles from the campfire turns to it, a wall between them stops that, one at ten tiles ignores you in the dark and comes when you light the torch.
- [x] Michael's lighting rules from play: exterior walls light like the ground, wall tops take the sky, everything on a tile takes its tile's light (`docs/07`, "How things are lit").
- [x] Acceptance, scripted (2026-10-09): 1 the lit cottage glows whole and spills through its open door, shuttered it is dark from outside; 3 fire pulls (a zombie nine tiles from the campfire comes, a wall stops it, the torch brings one from ten tiles that ignored you in the dark); 4 the hearth burns four logs and goes out, `E` relights; 5 the torch comes off the shed's bracket, lights the forest around you, mounts on the post and lights the road; 6 in the dark forest you see the few tiles around you and the dead as dim shapes; 7 60 fps, render about 2 ms with every fire in view. 2 (the tint reads as this place) is Michael's, who said "even better than I hoped" at step 3.

## Milestone 2b — The WebGL renderer, portals, light per pixel (see `docs/08-renderer.md`)

- [x] Phase 1 (2026-10-09): `transmission(wall)` with a tunable shutter leak; portals as directional emitters with intensity, derived from every room's openings each step; `roomBounce` 0.5; the layer on `tileAt`, `getChunk`, `chunkKey`, the light cache, and entities; flicker read from definitions. Checked by script: at midnight with the hearth six tiles from the window, opening the shutter lifts the tile beyond the window from 0.34 to 0.51 and the window tile to full; at noon an unlit cottage with its door and a window open sits at 0.55 with 0.77 by the door and 0.80 by the window. Frame rate unverified: the browser pane was throttled to a few frames a second during the check, with the night pass on or off. **Paused for Michael.**
- [x] Phase 2 (2026-10-09): `gl.js` and the WebGL `render.js` at parity: one atlas, one vertex buffer, one shader; light and ambient and fog textures over the chunks around the camera; holes as uniforms; flat triangles for posts, leaves, brackets; a flame sheet. Old renderer kept as `render-canvas.js` on `G`. About 1 ms of JavaScript a frame against 4 to 5. Michael, mid-build: "MILES better, and I could not produce a single weird polygon bug anymore. Wall shading suddenly feels way more intuitive."
- [x] Phase 3 (2026-10-09): pools climb walls and trunks (`night.climb`, 56 px); flames flicker in the light from per-source layers summed with weights at upload; `L` cycles debug views of the light, ambient, and fog textures; `night.standingFloor` is the legibility floor (0 until it is needed); `night.linear` false gives the per-cell look.
- [x] Acceptance, scripted (2026-10-09): day and night smooth with no texture touched; the campfire's light beyond a wall placed from the console drops on the next step and returns when it is removed; the hearth's spill through the window and door comes from the portals and stops with the shutter; several lights in view at once; the light reads the same either side of a chunk edge; sorting unchanged; every lookup takes a layer; pixels crisp with nearest sampling; the four views that broke the Canvas night look right and a bracket torch lights its wall from the base. Accepted by Michael the same night; the Canvas renderer is deleted.

## Milestone 10 — The village art comes in (see `docs/17-village-art-plumbing.md`)

- [ ] Michael's rulings on the plan's defaults (stubs, far-side leaves, caps, chair facings, log walls, the map change).
- [ ] Step 1: the loader (`images`, `anchorVertex`, per-frame anchors); the drawn floors.
- [ ] Step 2: drawn walls and posts; boards as polygons; stubs retired.
- [ ] Step 3: open leaves and shutters as sprites.
- [ ] Step 4: furniture (slicing, mirroring, facings, flames); the map's fireplace and chairs.
- [ ] Step 5: docs; the follow-up art request (caps, the log wall).

## Milestone 9 — The ground (see `docs/15-ground.md`)

- [x] Step 1, the pipeline (2026-10-11): `ground.js` baking one picture per chunk, the kit's grass by hash with an independent flip, laid floors by hash, the ownership clip; ground draws in `gl.js`; `emitGround` replaces `emitFloor`; boot prebake, per-step queue, eviction; `map.setFloor`, `onGroundChange`, `biomeAt`; the debug line. Verified: no checker, no seams, deterministic across reloads, debug views and night unchanged, frame cost lower.
- [x] Step 2 (2026-10-11): the patch tint, canopy darkening, tree shadows; the tree definitions' `canopy`, `shadow`, `leaves`. Verified: shadows go and come back with the tree, no seams, deterministic, bakes 9 ms median.
- [x] Step 3 (2026-10-11): flat decals from `data/ground.json`. Verified: every rule by script over four chunks, decals whole across borders, no seams, deterministic, bakes 9.2 ms median.
- [x] Step 4 (2026-10-11): the earth blends (dirt, farm, cobble with its verge), generated world textures and noise, the square cobbled. Verified: cobble never touches grass, farm covers its tiles, a one-tile road reads as a path, no partial alpha, no seams, deterministic, bakes 9.3 ms median.
- [x] Step 5 (2026-10-11): the build-mode grid, eviction checks, the acceptance list as a script (`tools/ground-check.js`): nine of nine scripted checks pass.
- [x] Check 10, Michael's eye (2026-10-11): "Ground looks amazing... Done!" Milestone 9 accepted.
- [x] The redrawn decals from Claude Design swapped in (2026-10-11); the four rocks wait for a design conversation.
- [x] The redrawn trees from Claude Design (2026-10-11): drawn at final size, `scale` dropped, anchors re-measured; crisp.
- [ ] Pinned: the floor stamp in build mode (`docs/15`, "Pinned"), writing authored floors and the no-scatter ring into the map file.

## Milestone 7 — Placement (see `docs/13-placement.md`)

- [x] `placement.js`, prop mode (2026-10-11): the ghost, R turns the footprint, left click places in reach; E in front still works. Tested by script and a real click; Michael's hands-on pass pending.
- [x] The build palette on N; `map.canBuildWall`, `buildWall`, `edgeTiles`; edge picking; the wall ghost; the timed build; logs spent; `data/build.json` (2026-10-11).
- [x] Doors and windows through the same path.
- [x] Prompt lines and reasons; Escape order.
- [x] The carry rule (`canCarry`) and the Free building setting, from Michael's notes on step 1.
- [x] Acceptance, scripted (2026-10-11): all eight checks in `docs/13` pass, with a log wall in place of the plank wall. Michael's hands-on pass found it good.
- [x] The removal tool (X): green highlight, click to destroy what was placed or built; containers spill; reach raised to 2.6 tiles for placing, building, and removing (Michael's notes, 2026-10-11).

## Milestone 8 — Melee (see `docs/14-combat.md`)

- [x] `data/poses.json` and `figure.setPoses`; the editor's Preview and Reload poses (2026-10-11).
- [x] Weapons in `items.json`: stick, sword, mace; stats on hatchet and torch; held shapes; loot (2026-10-11). `__game.give("sword")` puts any item in the bag for testing.
- [x] `combat.js`: the wedge, swings on the click, cooldowns, stamina; `damageZombie` with hurt, stagger, knockback, down, finisher, death; left click and Space; `zombieDied` (2026-10-11).
- [x] Feedback: the wedge drawn, hit-stop, screen kick, and the Show hit shapes setting (2026-10-11).
- [ ] The painted held slot in the editor, `data/held/`, `generateHeldFromPixels`. Not started; it is how new weapons get drawn, so it is next.
- [x] Acceptance, played (2026-10-11): checks 1 to 9 pass by script and Michael's mouse pass accepted the feel ("basically call this good"); check 10 waits on the painted held slot.
- [ ] More one-handed weapons, drawn and with stats (after the painted held slot).
- [ ] Decide dual wielding, the shield, and the bow and arrow (`docs/02`, questions 23 to 25); the bow gets its own design conversation first.

## Milestone 6 — The figure (see `docs/12-figure.md`)

- [x] The rig (2026-10-10): a projected body with joints per pose, parts sorted far to near, rasterised without anti-aliasing with a one-pixel outline and edge two-tone; eight facings; idle, walk, attack, hurt, die, carry_idle, carry_walk.
- [x] Drawing: outfits bake per figure (see docs/12 for why not layers); the player's sheet rebuilds on any change and is redrawn into the atlas in place; the atlas is 4096.
- [x] Garment rules: tunic (with a second colour down the front), breeches, boots, gloves, hood, cap, helm, belt with buckle, sack and rucksack on the back behind or in front by facing; the doll changes the figure live.
- [x] Held art at the hand joints in eight angles: torch, hatchet, plank, log; the flame at the torch's tip; a weapon follows the arm in the attack frames.
- [x] Carry poses; the furniture box lifts to the carry hands.
- [x] Ten zombie outfits, green skins, a wound, the shamble.
- [x] Look parameters (skin, hair, hairStyle, eyes) on the player, set from the console. The creation screen is the next item.
- [ ] Acceptance: checks 1 to 7 of `docs/12` seen in the browser on 2026-10-10 (the hatchet swing by forcing the attack frame; melee itself is not built). Check 8, the spec sheet, when the numbers have settled in play.

## Milestone 5 — The character (see `docs/11-character.md`)

- [x] Slot data (2026-10-10): hands hold entries; `worn` with seven slots; the belt's slots; a bag entry's grid; items get `wear`, `beltSlots`, `bag`.
- [x] The character screen on `C` (2026-10-10): the doll, the hand boxes, the bag beside; drag on and off slots; the cutaway comparison moves to `K`.
- [x] The hotbar strip and keys 1 to 4 (2026-10-10). The strip shows only while a belt is worn.
- [x] The bag as an item (2026-10-10): drop with contents, open on the floor, wear, swap; no bag means no grid; the Developer Bag from the console.
- [x] Starter kit worn; wearables and bags in loot (2026-10-10). Tab with no bag opens the character screen with the message.
- [x] Acceptance, scripted (2026-10-10): the eight checks in `docs/11` pass. Michael's play verdict pending.
- [x] The view (2026-10-10 night): `view.js`; the world fills the window at an integer scale; UI layer at its own scale; prompt, message, and menus through `toUi`; light and fog textures sized to the view; chunk growth four ahead.
- [x] Screens (2026-10-10 night): title, pause, settings (interface size, world scale, debug corner), controls; Escape steps back; `settings.js` in localStorage.

## Milestone 4 — The interface (see `docs/10-interface.md`)

- [x] Copied (2026-10-10) with origin headers: `grid.js`, `inventory.js`, the registry in `items.js`, `moodles.js`, `ui/moodles.js`, `ui/context-menu.js`, `ui/inventory-panel.js`, `ui/prompt.js`, `ui/hud.js`, the CSS. Fresh `data/items.json` and `data/loot.json`. Floor items on tiles, drawn as small blocks. The bag with the starter kit; the torch starts in the off-hand.
- [x] `interact.js` on the action shape: items, containers, openings, fires, brackets and posts, trees (Chop down), the well, Walk here; right-click menus; E for the nearest simple action; auto-walk; left-click to walk; timed actions with the bar; the item menu (Equip, Eat, Drink, Split, Take or Store, Drop).
- [x] Hunger and thirst with the parent's drains, eating and drinking, the moodle row, the health bar, the hands line.
- [x] Acceptance, scripted (2026-10-10): the kit lays out without overlap and Tab shows it with the torch outlined blue; Search chest auto-walks, runs its bar, opens the chest beside the bag, and leaving closes it; Add a log is disabled without a log and takes one with; Chop down walks to a tree, takes 3 s, leaves its logs on the ground and the tree gone; Split makes two planks; E picks up and says so when the bag is full; walking by click arrives; T equips and unequips; eating and drinking move hunger and thirst and the moodles follow; the well fills a waterskin. The frame rate could not be read with the pane suspended; the renderer cost did not change.

## Milestone 3 — Openings, and the dead get in (see `docs/09-openings.md`)

- [x] The stack on walls (2026-10-10): boards per side with health, the leaf's health, broken; transmission, passability, pathing, and sealed from the stack; the prompt names the stack.
- [x] The player's actions: `E` as before, `B` nails a board on your side, hold `B` pulls one, gone.
- [x] Zombie `breach`: the nearest opening of the room it wants into, or out of; hits the stack on the bite cooldown; repaths when the way opens.
- [x] The dead climb, 1.6 s, no bite while climbing.
- [x] Boards and broken leaves drawn (far-side boards not drawn).
- [x] Acceptance, scripted: a bare door takes one shambler about 30 s and it walks in; three boards each side take about 106 s, outside boards then the door then the inside boards; an open window is climbed in about 3 s from three tiles away; a zombie shut in the shed with the door boarded from outside breaks out through the nearest opening in 67 s; sealed shows and clears; prompts name the stack. Michael's night is his.

## After the probe (sketch, not a plan)

Porting order, each one milestone, each with its own doc. Order is a guess and will change.

- ~~Lighting~~: now Milestone 2, above.
- ~~Openings~~: now Milestone 3, above.
- Interface (next): the grid inventory from the cozy parent, tetris pieces, no weight; right-click menus as the complete interface; click to move with auto-walk to out-of-range actions; the stand-in keys (T, B, E at fires) fold into it. Items become real: logs and planks stop being free.
- Combat port, after the interface: melee rework, shove, knockdown. Sword and spear as the first two lines.
- Moodles, hunger, thirst.
- Records beyond the active region: alarm, lure, trickle.
- Save and load, start screen, pause.
- Bow and crossbow with recoverable arrows.
- Shield. Later, armour.
- Death that turns you, the next survivor, bodies as containers.
- Sleep, tired, waking to a break-in.
- NPCs: presence, flee, follow and stay, lines; then routines; then bags (`docs/04-npcs.md`).
- Farming, Stardew-simple: a plot, seed, water from the well, growth stages, harvest. Load-bearing; test early with placeholders.
- Cooking, one step: the hearth turns raw into better. Firewood as the hearth's fuel if not already in.
- Furniture you can pick up, move, and rotate. Then, maybe, building, which is also the creative-mode dev tool.
- Village authoring: prefabs, a second building type, the inn, the chapel, the well.
