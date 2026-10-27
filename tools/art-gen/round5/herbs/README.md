# Art round 5, group B: the herbs

Eleven herbs. Each one is drawn as a **node** (the clump growing wild, gathered by hand) and as an **item** (a picked bunch or sprig). Every picture is a hand-pixelled ASCII grid with its own palette in `gen.py`, the same method as round 4's goods. The pictures are 13 to 22 px, which is small enough that geometry would turn them to mush. `ring()` closes the `#2b2522` outline all the way round each picture, so a gap left in a drawn edge can't leak. Light comes from the top left. Every pixel is fully opaque or fully clear, and nothing is scaled.

`python gen.py` writes everything below. `--zoom` also writes `work/zoom_nodes.png` and `work/zoom_items.png` at 8x. `--strict` refuses a ragged grid instead of padding it. The script is deterministic: two runs give identical bytes. The script reads the repository (read only) for two things: the herbs' definitions, `data/sprites/herb_<id>.json`, and the figure and mushrooms in the preview. It writes nothing there.

Each run checks every picture by script. Alpha is only 0 or 255. Every crop is tight. Every pixel on the edge is the outline colour. The anchor pixel and the grip pixel are opaque. Every item fits its 19 by 19 cell.

## Files (`out/`, 44)

- `herb_<id>.png`: the node.
- `herb_<id>.json`: its definition. This is today's `data/sprites/herb_<id>.json` with `placeholder` replaced by `image` (as `data/art/ground/herb_<id>.png`, beside the mushrooms), `frames` (`idle_0`, the whole picture), `anchor`, and `bounds`. Every other field is kept: `carry`, `interactable`, `gather`, `name`, and `note`. The note keeps its text except its last sentence. "Dev art drawn from this design (src/gather-art.js), the item's icon from the same." became "Drawn art: art round 5 (the herbs), the node and the item from one design."
- `<id>_world.png`: the item at 1x, held `fixed`.
- `<id>_icon.png`: the same pixels centred, not scaled, on the 19 by 19 cell.
- `manifest.json`, at the folder's root, has one entry per item: `{icon: [19, 19], portrait: false, held: {mode: "fixed", image, grip}, world_size, node: {image, size, anchor}, notes}`. There are no portraits, as the brief says.

**Anchors** follow the drawn mushrooms (`mushroom_0.json`, `[10, 20]`). The anchor is the foot's column, on the outline row under the foot, which is the picture's bottom row. It is the pixel drawn at the tile's centre. **Grips** are counted from the world PNG's top left. Each sits on the twine tie, or on the cut stem where nothing is tied.

| id | node (w x h) | anchor | item (w x h) | grip | item |
|---|---|---|---|---|---|
| sage | 20 x 16 | 9, 15 | 13 x 16 | 6, 11 | a bundle of grey-green leaves tied with twine, one purple spike |
| nettle | 20 x 20 | 9, 19 | 11 x 19 | 5, 14 | a nettle top: three pairs of toothed dark leaves, two pale catkins, cut stem |
| feverfew | 18 x 16 | 9, 15 | 11 x 16 | 5, 11 | a posy of three daisies with feathery leaves, tied |
| yarrow | 20 x 20 | 8, 19 | 9 x 17 | 4, 13 | one stem: a flat white flower head over feathery leaves |
| mana_herb (Mageroot) | 17 x 15 | 8, 14 | 11 x 18 | 5, 7 | the pulled root: pale, glowing, tapering, under a teal leaf tuft |
| nightshade | 18 x 19 | 9, 18 | 10 x 14 | 4, 10 | a sprig: broad leaves, a purple bell, glossy black berries |
| wolfsbane | 14 x 20 | 6, 19 | 11 x 15 | 5, 11 | a cut spike of blue-violet hoods and one cut leaf |
| grave_moss | 20 x 13 | 9, 12 | 13 x 10 | 6, 6 | a peeled pad of pale moss on a crust of dark earth |
| woad | 16 x 20 | 7, 19 | 11 x 16 | 5, 11 | a bunch of long blue-green leaves (the dye is in the leaf), tied |
| madder | 21 x 15 | 9, 14 | 11 x 14 | 6, 5 | a bundle of red roots (the dye is in the root), tied under a scrap of the top |
| weld | 13 x 22 | 6, 21 | 7 x 16 | 3, 11 | two cut yellow flower spikes, tied |

## The nodes, and what keeps each one apart

Each node is drawn as the real plant, in the colours of today's design.

- **Sage:** a low, soft mound of tongue-shaped, silvery grey-green leaves (`#a3b39a`), with three short purple spikes in whorls.
- **Nettle:** a stand of three dark upright stems (`#3a6a32`) with opposite pairs of toothed leaves, which give a jagged silhouette. Pale catkins hang in the leaf joints. It is drawn as three columns, not one peak, so it does not read as a little fir.
- **Feverfew:** a bright yellow-green feathery clump under five small daisies, white round a yellow eye.
- **Yarrow:** tall stiff stems under three flat white plates of flowers, with feathery leaves.
- **Mageroot:** a rosette of broad teal leaves standing on a pale, glowing root crown, with glowing tips and midribs. The glow is solid pixels in the design's `#e8fcff` and a paler cyan; nothing is transparent. Its darker leaf tones are pushed a little toward green so it reads as a plant and not a crystal.
- **Nightshade:** broad leaves in tiers on one stem. Two purple bells hang below the leaves and three black berries with pale glints sit among them. The bells and berries are placed off-centre on purpose, because a symmetric pair read as a face.
- **Wolfsbane:** a tall spike of blue-violet hooded flowers over dark, hand-shaped leaves.
- **Grave moss:** a cushion of pale moss with rounded tufts and pale speckles, covering a grey stone that shows underneath. It is a mound, not a plant.
- **Woad:** a rosette of long blue-green leaves under branching stems with loose clouds of yellow flowers.
- **Madder:** a bristly, sprawling green mound with pale yellow-green flower sprays. Its red roots run out along the ground on both sides.
- **Weld:** one tall, slender spike of yellow flowers, with a short side spike, over a low rosette.

The only two yellow-flowered plants are woad and weld. They stay apart by shape: woad has clouds of flowers on blue-green leaves, and weld has one narrow spike.

**No baked ground shadow.** The drawn mushrooms carry a row of dark green (`#2c3a25`) under their outline. The style bible's rule 5 says no baked ground shadow, so the herbs have none. If the mushrooms' row is wanted for consistency, it is one row added under each picture, and the anchor does not move.

## preview.png

From the top:
1. At 1x, every node on its own grass tile, its anchor on the tile's centre. The 55 px figure and two drawn mushrooms are there for scale.
2. At 1x, the nodes scattered on a meadow.
3. The icons at 2x in a dark bag slot, with the 1x icon beside each. Below them, the world pictures at 3x with the grip boxed in cyan, and each picture's size and grip.
4. The first row again at 3x, split in two.
5. The meadow at 3x, in two halves.

## Notes and what is weak

- **Stacking:** no herb has a `stack` in `data/items.json` today, so no lower-right corner is kept clear. The narrow sprigs (yarrow, weld, nettle, wolfsbane) leave the corner mostly clear anyway. Sage, the moss pad, mageroot and madder reach into it, and would need a small redraw if herbs come to stack.
- **Size:** weld is 22 px tall and nettle 20 by 20, at the top of the brief's range. The drawn mushrooms are 22 to 23 tall, and weld is a tall spike plant.
- **Weakest: madder's node.** At 1x it is a bristly green mound with tiny flowers and red roots at its feet. Its leaf whorls (the real plant's star-shaped rings of leaves) do not show at this size: two tries at drawing them read as dither or a blob. The red roots carry its identity, and at a glance they could read as red feet.
- **Second weakest: the nightshade item.** It is small and dark. The berries read, but the bell is only 3 px. Sage's mound is also pale enough that at 1x it is near a pale rock. Its purple spikes are what say sage.
- **Mageroot** is fictional, so the design is mine: a teal rosette on a glowing root crown, with the pulled root as the item. Its look is a guess at what fits, not a reading of a real plant.
- **The node picture's path** in the definitions, `data/art/ground/herb_<id>.png`, is a proposal beside the mushrooms. Nothing is wired into the game.
