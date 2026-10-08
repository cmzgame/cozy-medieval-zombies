# TODO

Working checklist. A new session reads `CLAUDE.md`, then this file, then the doc a task links to. Keep the **Status** block current at the end of every session.

## Status

- **Current milestone:** none. Pre-code. Repo scaffolded 2026-10-08 with the vision, the inheritance list, a decisions log, the chunk world model, and an NPC assessment.
- **Last completed task (2026-10-08):** both parents' docs read and harvested into `docs/01-parents.md`. Chunks ruled in: block-by-block storage from the start, active radius 2, break-ins only inside the active region, rooms by flood fill, single storey first (`docs/02`, `docs/03`). Building kept open as a player feature and as the dev tool. NPCs assessed in `docs/04-npcs.md` at Michael's request.
- **Pre-code conversations:** complete as of 2026-10-08. Also ruled today: NPCs killable and fleeing with follow and stay; farming and fire added to the vision as pillars; quests and roofs to `docs/05-someday.md`.
- **Blocked on:** nothing.
- **Next:** Milestone 1, the probe.
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

- [ ] Repo plumbing: `index.html`, `style.css`, `serve.py`, `src/main.js`, copied `iso.js`, `loop.js`, `input.js`, `events.js`, `sprites.js`, `placeholders.js`, `render-util.js` with origin headers.
- [ ] Chunked map: a dictionary of 16×16 chunks behind `tileAt`, loaded on demand one chunk file at a time with a ring ahead of the active region, a missing chunk is empty field. A hand-written 32×32 village square as the test map.
- [ ] Camera: float grid position following the player, `toScreen` / `toGrid` with offset, integer-scaled 960×540, only visible chunks drawn, floor cached per chunk.
- [ ] One cottage: four walls, a door opening, two glass windows, interior floor, a few solid props. Near walls become stubs when the player is inside.
- [ ] Player copied and walking with collision against the tile grid. Three dead copied, pathing and chasing with the existing A\* and a bounded search.
- [ ] Visibility: shadow cast from the player over the viewport. Out-of-sight tiles darkened, out-of-sight dead not drawn. Glass passes sight and blocks movement.
- [ ] Debug corner: fps, player tile, chunk, visible tile count.

**Accept when** all four proofs hold:

1. Walk from the square into the cottage and out again with no cut, several times, with dead following. It feels better than the dollhouse did.
2. Stand inside the cottage. The near walls are stubs, the far walls are full, the building reads as a building from outside and as a room from inside, in chunky placeholder art.
3. Stand at a window. A wedge of the square is visible through it and nothing else outside is. It reads at a glance without explanation.
4. The viewport shows enough of the square to feel like a village and the pixels still look chunky at 2x.

If any proof fails: stop, write down why in `docs/02`, and talk.

## After the probe (sketch, not a plan)

Porting order, each one milestone, each with its own doc. Order is a guess and will change.

- Lighting: the light map per chunk, night, hearths that burn wood, candles, lit windows. The lantern.
- Openings as tiles: doors barred from inside, glass with curtains and boards, the dead breaking in.
- Combat port: melee rework, shove, knockdown. Sword and spear as the first two lines.
- Inventory, items, moodles, hunger, thirst. Everything is an item.
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
