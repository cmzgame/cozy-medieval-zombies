# Art docs

Everything the art agent knows about the game's art, from the first trees to the inventory icons, plus the things it has not drawn yet and the systems it does not own. Written 2026-10-12 so no one has to ask the art agent what it did, why, or what is missing.

**Who this is for:** the coding agent (what each file is, what the engine can assume, what to import) and Michael (what exists, what is on the back burner, what is waiting on a decision).

**Companion docs:** `../25-character-art-brief.md` (the character commission) and `../26-art-owed.md` (the item art backlog).

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
| 08 | [cursors](08-cursors.md) | the three pointing hands and how to implement them |
| 09 | [stubs](09-stubs.md) | the cutaway walls kept in the back pocket |
| 10 | [lighting-from-the-art-side](10-lighting-from-the-art-side.md) | what the art must do for the lighting system, and what went wrong |
| 11 | [open-items-and-lessons](11-open-items-and-lessons.md) | the punch list, the generators, how to ask for art |
| 12 | [characters-from-the-art-side](12-characters-from-the-art-side.md) | before drawing the character models |

## Where the art is

| Folder | Contents | Count |
|---|---|---|
| `data/art/trees/` | oak and spire, S/M/L, six colours | 36 |
| `data/art/ground/` | grass, farm soil, water, decals, rocks | 58 |
| `data/art/crops/` | five crops, three stages, two directions | 30 |
| `data/art/village/` | walls, posts, leaves, shutters, boards, floors, furniture, pumpkins | 110 |
| `data/art/items/` | world and icon art, staff angles, fireball (the previews are in `docs/art/previews/`) | 13 |
| `data/art/cursors/` | the three pointing hands at 1x and 2x, `cursors.json` (a CSS cursor, `src/ui/cursor.js`) | 9 |
| `data/art/character/` | the template, the body's JSON, round 1 of the painted layers in `layers/` | 40 layers |

**Not in the repo:** the stubs, the willow, the dirt kit, and the village, tree, ground, decal, crop, pumpkin, cursor, and item generators (one copy each, in Michael's download zips). The character generators are in (`tools/art-gen/character/`). See `11`.

## Conventions in one box

Hard pixels (alpha 0 or 255). Light from the top-left. Three or four flat shades. `#2b2522` outline on anything the player uses, none on decoration. No baked shadow or glow. Drawn at final size. Tiles 64 x 32; walls 80 tall; characters 55 tall. Anchors are always recorded from the PNG's top-left. Items ship as `<name>_world.png` plus `<name>_icon.png`. The full rulebook is `01`.

## Provenance

Every PNG was made by deterministic Python generators and delivered to Michael as zips, who copied them into the repo. Some older docs call the art agent "Claude Design" and refer to its deliveries by folder (`tree_sprites`, `trees_v2`, `ground_kit`, `decals_v2`, `village_art`, `village_art(1)`, `pumpkins`, `well_anim`, `crops`, `farm_water`, `items`, `items_v2`). Dates and rulings are in `02-decisions.md`.
