# Art 11: Open items, loose ends, and how to work with the art agent (as of 2026-10-12)

**What this is:** `docs/art/11-open-items-and-lessons.md` whole, the design agent's punch list, its decisions waiting on Michael, its note on the generators, and its working notes; moved here by the sweep, 2026-10-16, and never edited after. The live text: `docs/art/README.md` (where the art is, what is not in the repository) and `docs/art/01-style-bible.md` (the rules); the art still owed is `docs/26`; how a delivery comes in is `docs/27`; the open decisions (the stack limits, the icon sizes, the willow, the generators) and the single-copy art are `art` issues.

---

# Art 11: Open items, loose ends, and how to work with the art agent

Written 2026-10-12. The punch list across all art, then the working notes that make the next delivery smoother.

## Drawn but not in the repo

| Thing | Where it is | To land it |
|---|---|---|
| **Pointing-hand cursors** (human, severed, zombie) | in the repo since 2026-10-12: `data/art/cursors/`, a CSS cursor (`src/ui/cursor.js`, `08`) | done |
| **Cutaway stubs** (66 PNGs) | `stubs_v1.zip` | only if translucent walls get complaints, `09` |
| **Weeping willow** (205 x 191, four colours + glowing-eyes variant) | `willow.zip` | needs a definition and a shadow width, `02` |
| Ground-kit **dirt** (128 x 64) and **edge noise** | `ground_kit.zip` | the engine generates its own; only if drawn dirt is wanted, `03` |
| Preview sheets, placement tests, `GROUND_BRIEF.md` | the delivery zips | reference only; "ignore the previews" for the agent |

## In the repo but unplaced or unused

- **Gloom trees** (blue and purple): defined, not placed, waiting for a zone.
- **Rocks:** four faceted rocks; wild generator places them; what mining gives is open (`02` question 27).
- **Fireball sheet:** stored, unused until the spell exists (`24`).
- **Far-side leaves and shutters:** imported, never seen in play.
- **Staff 22.5 / 45 / 67.5 / 90 degree files:** used, with the flip table in `07` (the repo README's 180 to 270 rule was corrected 2026-10-12).

## Not drawn yet

**The item backlog is written up properly in `../26-art-owed.md`** (torch, hatchet, sword, mace, stick, plank, log, spear, halberd, bow, shield, bandage, arrow, food and drink, each with slot size and held size). The list below is the whole-game view and defers to it for items.

- Chest, barrel, campfire, torch post, lantern, candle, stool, bench, shelves (outlined, unlit, village style).
- Broken wall variants, boarded-door variants other than the overlay set, roofs.
- Dirt and cobble drawn textures.
- World/icon pairs for plank, stick, sword, spear, halberd, hatchet, mace, torch, shield, bow, arrow, bandage.
- Sword and halberd hand-drawn angles (the staff method).
- Thrown knife and axe spin frames.
- **Characters** (`12`), including the wound layer, the onion hat, hair, facial hair, garments.
- Any gloom-zone art: the plague doctor, scarecrow men, skeletons the vision mentions.
- A drawn **loading screen**, title, and UI skin (the interface is DOM, `10-interface.md`).

## Decisions waiting on Michael

1. ~~Cursor delivery: engine-drawn or CSS; when does it swap to the severed and zombie hands? (`08`)~~ Decided 2026-10-12 (`02`): CSS, a settings choice, the zombie hand over the dead.
2. Stack limits for the book and staff. (`07`) Open.
3. Item icon sizes: leave the knife and axe small, or redesign larger? (`07`) Open.
4. ~~Characters: skin ramp, palettes, which of the three options per category, outline colour. (`12`, `25`)~~ Decided 2026-10-13 (`02`, `27` D): the ramp approved (`data/looks.json`), the garment outline `#1a1420`.
5. Whether to import the willow and for which zone. (`02`)
6. Whether the generators move into the repo (below).

## The generators live outside the repo

Every sprite was made by a Python script (numpy and PIL, deterministic, seeded). **As of writing the scripts exist only in the art agent's session workspace and the delivery zips**, not in the repo, and that workspace is ephemeral. The scripts:

`iso3d.py` (the z-buffered iso rasteriser), `trees.py` / `trees_v2.py` / `willow.py`, `ground.py`, `decals.py`, `village.py` / `furniture.py` / `floors.py` / `village_preview.py`, `farm_water.py`, `crops.py`, `pumpkin.py` / `pumpkin2.py`, `stubs.py`, `cursors.py`, `items.py` / `book2.py` / `fireball.py` / `items_preview.py`.

**Recommendation:** commit them under `tools/art-gen/` (or `docs/art/generators/`) so a recolour, a resize or a new wall height is a script run. The village generators also came with Claude Design's zip in `village_art`, so those are partly safe already. `village.py` is the one to guard: it holds every wall dimension (`H_WALL = 80`, `THICK`, `DOOR`, `WIN`).

## Working notes for whoever next asks the art agent for something

### What makes a request go well

- **Give the sizes, the footprint, the anchor convention, and a preview request.** The village brief (`16`) is the model: it said what the game does with the art, listed sizes, and asked for 1x and 3x previews with a character for scale. It came back right the first time.
- **Say what is interactable.** That decides the outline.
- **Say what the engine draws itself** (shadows, glow, flicker, tint) so it is not baked.
- **Ask for both renderings of every item**, world and icon.
- **Ask the art agent questions before it draws** when a convention might clash (the far-side leaf question in `18` saved four leaves and eight shutters per material).

### What to expect back

- A zip of tightly cropped, hard-alpha PNGs, anchors in JSON, a README, previews at 1x and 3x, and the generators.
- Hard-pixel checks run by script before delivery.
- An honest note where the brief was bent: knife 5 px wide, staff head 16 px, the book's icon closed, the book lying flat.

### What the art agent will flag, so do not be surprised

- A missing icon or a wrong icon size (the first item delivery lacked three icons and had a 14 x 13 book icon; the rule was added after).
- Orientation names. The first village brief had `north` and `west` swapped; the design agent caught it.
- Any art that depends on engine behaviour it cannot see (lighting, translucency, sort order). It will say "this is an engine question" instead of redrawing, as with the wall tops.

### Process lessons

1. **Draw at the final size, once.** Never ask for art to be scaled in the engine (`01`).
2. **Small sprites by hand, big sprites by script, turning sprites fresh per angle** (`01`).
3. **Previews are the acceptance test.** The village placement previews were assembled purely from PNGs and anchors; if the game matches them the plumbing is right.
4. **The art is rarely the bug.** Wall-top artifacts, banding and pale columns were all engine overlay and compositing; read the `10` table before redrawing anything.
5. **Mirroring is cheap and wrong in one way:** it flips the lit side. Draw twice where a viewer would notice.
6. **Palettes are decisions.** Gloom and harvest do not share a wood; blue and purple beside orange looked like Halloween candy.
7. **One change, two files.** Items are one design with two renderings.

## Cross-references

`06-art.md` (the dev palette and art direction log), `15-ground.md`, `15b-art-requests.md`, `16-village-art-brief.md`, `17-village-art-plumbing.md`, `18-building-art-brief.md`, `24-throwables-and-fire-magic.md`, `25-character-art-brief.md`, and `02-decisions.md` for every ruling.
