# Art round 4, group D: the home's furniture

The barrel, the chest, the shelf, and the woodpile, drawn as world sprites in the manner of the bed, chair, table, well, beehive, and coop. Every PNG is hard-pixelled (alpha 0 or 255, checked by script), outlined `#2b2522` all round (each is a container the player opens), lit from the top left, with no baked shadow, and drawn at its final size. The generator is `gen.py`, my own iso renderer written after reading Claude Design's `iso3d.py`, `furniture.py`, and `props.py` for the method. It imports nothing from them. Run it with plain `python gen.py`. It is deterministic: the woodpile's one random draw is seeded, and two runs give byte-identical PNGs.

## Files (`out/`)

| File | Size (w x h) | Anchor (`anchorVertex: "top"`) | Height above ground | What |
|---|---|---|---|---|
| `barrel.png` | 28 x 40 | (14, 18) | 28 | A cooper's oak barrel standing on its end, centred on the tile. Its staves belly out from radius 7 at the ends to 8.6 at the middle (the old `collide` radius of 0.26 tile is 8.3). It has four proud iron hoops, a sunk head of three boards inside the chime, and a dark bung on the lit side. Its staves are shaded in four steps round the cylinder. |
| `chest.png` | 42 x 40 | (21, 14) | 19 | A six-board chest, 22 long along Y and 14 deep, on two runners. It has horizontal front boards, a boarded lid that overhangs a little, and iron corner brackets with rivets. Two iron straps run over the lid, a hasp comes down the front onto a padlock, and an iron grip is on the near end. |
| `shelf.png` | 42 x 83 | (25, 58) | 60 | A tall open shelf, 26 long along Y and 10 deep, with its back to a west wall (low X) and the open front toward +X. It has two side boards, a boarded back in shadow, a plinth, three shelves, and an overhanging top. On it: a tied burlap sack and a green-glazed jar below; two clay pots and a stoneware crock; a jar under a tied cloth, a squat pot, and a small green jug; and two small pots on the top shelf. |
| `woodpile.png` | 44 x 52 | (21, 24) | logs about 30, stakes 34 | Split logs (mostly rounds, some halves) stacked along Y on two bark sleepers, in close-packed rows of 4, 3, 4, 3, and 2 logs. The cut ends face +X: pale end grain, a dark bark rim, and a pith dot. Some ends stick out a unit further than others. There is a hewn stake at each end, cut to a point. A dark core sits behind the logs, so the gaps between them read as shadow. |
| `barrel.json`, `chest.json`, `shelf.json`, `woodpile.json` | | | | The definitions (below). |
| `preview.png` | | | | The 1x strip above the same strip at 3x (`preview_1x.png` and `preview_3x.png` are the two halves). |

**Preview order, left to right:** bed (the existing drawing, on its two tiles), chair (`chair_front`), barrel, chest y, chest x (the mirror), shelf y, shelf x, woodpile y, woodpile x, and the bare figure for scale. The figure is cropped from `data/art/character/preview_skins_3x.png` and taken back to 1x. Each piece stands by its anchor on a plain 64 x 32 wooden floor diamond. A mirrored piece's anchor is `width - ax`, as `assets.js` mirrors it.

## Anchors: measured and checked

Each anchor is the pixel of the tile's top vertex at ground level, computed exactly as Claude Design's renderer does it: world (0, 0, 0) projected into the canvas, minus the crop. To prove the convention matches, `gen.py` rebuilds the chair's front drawing from `furniture.py`'s box numbers in my renderer. It comes out 39 x 51 with anchor (19, 25), the same as `chair_front.png` and `chair.json`, and 97% of its silhouette pixels match. Each one-tile piece sits inside world X and Y from 0 to 32, as the chair does. The preview places all of them with the same arithmetic it uses for the bed and the chair, and they land on their tiles.

## The definitions

Each definition keeps every non-picture field of today's file, with `placeholder` replaced:
- `barrel`: `container {loot: barrel}`, `carry: true`, `collide {radius: 0.26}`. It is round, so it has one frame and no facings, in the beehive's shape: `images {idle_0}` plus `anchor`.
- `chest`, `shelf`, `woodpile`: `container` (`chest`, `pantry`, `woodpile`) and `carry: true` are kept, and the shelf's and woodpile's old notes are folded into their new notes. Each has `facings ["y", "x"]` and `drawings`, with `y` drawn and `x` its mirror. This follows the fireplace: the long side runs along Y, the back is to a west wall, and the front faces +X. Mirrored, the long side runs along X, the back is to a north wall, and the front faces +Y. These are one-tile pieces, so like the chair they have no `facingFootprint`.
- The image paths assume the integrator copies the PNGs to `data/art/village/<id>.png`.

## Weak points, and what I did not do

- **The mirror swaps the lit side**, the cost the bed, table, and fireplace already accept. The drawn chest and shelf have their fronts on the shade face (+X), as the fireplace's firebox does. The mirror puts the fronts on the lit face.
- **The shelf's pots are small.** At 1x each is 5 to 8 px, read as pots by their shape and colour (terracotta, pale stoneware, green glaze, a white cloth top). Up close they are fine; at 1x the shelf reads as "a shelf of crockery" rather than as individual pots. The near side board hides part of the contents behind it, which is correct.
- **The shelf stands 60 high.** The placeholder was 44, `docs/29-world/09` request 1.3 asked for 64, and the figure is 55. Its back is at X 7, so against a log wall (face at X 9) its top overlaps the wall's face by about 2 units. The fireplace's back is at X 0 and overlaps more.
- **The woodpile's ends are busy** at 1x: about 16 log ends of 5 to 7 px each. It reads as a stacked woodpile, but it is the least clean of the four. It is 34 to the stake tips, against the roughly 28 that `docs/29` asked for.
- **Not drawn, because the brief did not ask:** the chest open (`docs/29` 1.3 asks for a second drawing), the woodpile half full (`docs/29` asks for two fill levels), and a plain back for a shelf facing away from the camera. The game has nothing that would show any of them yet.
