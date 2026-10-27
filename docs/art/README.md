# Art docs

Everything the art agent knows about the game's art, from the first trees to the inventory icons, plus the things it has not drawn yet and the systems it does not own. Written 2026-10-12 so no one has to ask the art agent what it did, why, or what is missing.

**Since the sweep (2026-10-16):** this page and `01` are the live art reference; `02` to `10` are the record of each delivery, corrected where the game moved on; the old `11` and `12` are in `docs/history/`. **Since 2026-10-19** `11` is the brief for the next round (the fence and the everyday items, #309), waiting to be sent.

**Who this is for:** the coding agent (what each file is, what the engine can assume, what to import) and Michael (what exists, what is on the back burner, what is waiting on a decision).

**Companion docs:** `../history/art-requests/25-character-art-brief.md` (the character commission, delivered; the live painting rules are `../28-painting-for-the-slicer.md`) and `../26-art-owed.md` (the item art backlog).

**What this is not:** the engine docs. Those are `docs/00` to `docs/37`. These pages link to them instead of repeating them. Where an engine doc and an art doc disagree, the engine doc is right about the engine and the art doc is right about the art; any conflict is called out in the text.

## Read in this order

| # | Page | Read it when |
|---|---|---|
| 01 | [style-bible](01-style-bible.md) | before drawing, importing or judging any art |
| 02 | [trees](02-trees.md) | trees, ramps, the willow |
| 03 | [ground-and-decals](03-ground-and-decals.md) | grass, leaves, mushrooms, rocks, water |
| 04 | [farm-and-crops](04-farm-and-crops.md) | soil and the five crops |
| 05 | [village-buildings](05-village-buildings.md) | walls, posts, doors, shutters, boards, floors |
| 06 | [village-furniture-and-fixtures](06-village-furniture-and-fixtures.md) | well, bed, table, chairs, fireplace, pumpkins |
| 07 | [items-and-icons](07-items-and-icons.md) | knife, axe, staff, book, fireball, inventory icons |
| 08 | [cursors](08-cursors.md) | the three pointing hands, as built (a CSS cursor) |
| 09 | [stubs](09-stubs.md) | the cutaway walls kept in the back pocket |
| 10 | [lighting-from-the-art-side](10-lighting-from-the-art-side.md) | what the art must do for the lighting system, and what went wrong |
| 11 | [brief-fences-and-everyday-icons](11-brief-fences-and-everyday-icons.md) | a brief to paste to Claude Design (#309, not sent yet): the rickety see-through fence as wall pieces with its gate and swing frames, and the icons, world pictures, and portraits of the items seen on every play |
| 11 (old) | [open-items-and-lessons](../history/art-11-open-items.md) | a record (2026-10-12): the punch list, the generators, how to ask for art; its open decisions and single-copy art are `art` issues |
| 12 | [characters-from-the-art-side](../history/art-12-characters-from-the-art-side.md) | a record (2026-10-12): the body rounds, the eyes, what the agent needed; the live page is `../28` |
| 13 | [brief-walls-at-96](13-brief-walls-at-96.md) | a brief for the whole wall set redrawn at 96 px (`docs/52`, not run yet): the eight materials, two-crate doors, windows from 24 to 64, the leaves, shutters, posts, and boards, by the kept generators' parameters |

## Where the art is

| Folder | Contents | Count |
|---|---|---|
| `data/art/trees/` | oak and spire, S/M/L, six colours | 36 |
| `data/art/ground/` | grass, farm soil, water, decals, rocks | 58 |
| `data/art/crops/` | five crops, three stages, two directions | 30 |
| `data/art/village/` | walls, posts, leaves, shutters, boards, floors, furniture, pumpkins | 110 |
| `data/art/items/` | world and icon art, staff angles, fireball (the previews are in `docs/art/previews/`) | 13 |
| `data/art/cursors/` | the three pointing hands at 1x, 2x, and 3x, `cursors.json` (a CSS cursor, `src/ui/cursor.js`) | 9 |
| `data/art/character/` | the template, the body's JSON, round 1 of the painted layers in `layers/` (36 in its manifest, plus four previews) | 36 layers |

**The generators** are in the repo as an archive under `tools/art-gen/`, kept and never run without Michael (#95; Michael, 2026-10-16): the character scripts, and the village, tree, ground, decal, crop, farm and water, and pumpkin generators with the well's anchors, each folder's source zip and chosen version in `tools/art-gen/README.md`. **Not in the repo:** the stubs (and `stubs.py`), the willow (cut, and `willow.py` with it), the dirt kit, and the scripts that never came with their deliveries (the cursors', the items', the v1 pumpkin's, the later ground's). See `../history/art-11-open-items.md`.

## Conventions in one box

Hard pixels (alpha 0 or 255). Light from the top-left. Three or four flat shades. `#2b2522` outline on anything the player uses, none on decoration. No baked shadow or glow. Drawn at final size. Tiles 64 x 32; walls 80 tall; characters 55 tall. Anchors are always recorded from the PNG's top-left. Items ship as `<name>_world.png` plus `<name>_icon.png`. The full rulebook is `01`.

## Provenance

Every PNG was made by deterministic Python generators and delivered to Michael as zips, who copied them into the repo. Some older docs call the art agent "Claude Design" and refer to its deliveries by folder (`tree_sprites`, `trees_v2`, `ground_kit`, `decals_v2`, `village_art`, `village_art(1)`, `pumpkins`, `well_anim`, `crops`, `farm_water`, `items`, `items_v2`). Dates and rulings are in `02-decisions.md`.
