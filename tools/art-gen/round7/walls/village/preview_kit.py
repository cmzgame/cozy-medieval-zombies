"""Stand-ins for what the archived previews imported and the archive does not hold (2026-10-27, docs/art/13):
`decals.grass_field` read the ground kit's out/ folder and `trees_v2.character` read out/character_s.png, neither kept.
Here the grass is the game's own delivered tiles (data/art/ground/grass_0..3.png, laid as woods' common.grass_field
lays them), and the figure is the game's starting outfit as the character delivery previewed it
(data/art/character/layers/preview_starting_outfit.png, the south frame at 1x, its flat background keyed out), with a
hair layer from the same delivery on top. Its frame is 48 x 72 with the feet at (24, 66), as the style bible says.
Read only: nothing here writes anywhere but the caller's canvas."""
import os
import numpy as np
from PIL import Image

D = os.path.dirname(os.path.abspath(__file__))
WALLS = os.path.dirname(os.path.dirname(D))
ASSETS = os.path.join(WALLS, "assets", "data", "art")
GROUND = os.path.join(ASSETS, "ground")
LAYERS = os.path.join(ASSETS, "character", "layers")
FEET = (24, 66)
DUSK = (143, 160, 122)       # the outfit preview's flat background


def grass_field(W, H, seed=0):
    tiles = [Image.open(f"{GROUND}/grass_{i}.png").convert("RGBA") for i in range(4)]
    img = Image.new("RGBA", (W, H), (75, 95, 61, 255))
    for j in range(-2, H // 16 + 3):
        for i in range(-2, W // 64 + 3):
            x = i * 64 + (32 if j % 2 else 0) - 32; y = j * 16 - 16
            t = tiles[(i * 7 + j * 13 + seed) % 4]
            if (i + j) % 2: t = t.transpose(Image.FLIP_LEFT_RIGHT)
            if -64 < x < W and -32 < y < H: img.alpha_composite(t, (x, y))
    return img


def figure(hair="hair_crop", facing=0):
    """48 x 72, feet at (24, 66). facing 0 = south (the first frame of the 4 x 2 sheet)."""
    sheet = np.array(Image.open(f"{LAYERS}/preview_starting_outfit.png").convert("RGBA"))[::4, ::4]
    r, c = divmod(facing, 4)
    f = sheet[r * 72:(r + 1) * 72, c * 48:(c + 1) * 48].copy()
    f[(f[..., :3] == DUSK).all(-1)] = 0
    im = Image.fromarray(f, "RGBA")
    if hair:
        h = np.array(Image.open(f"{LAYERS}/{hair}.png").convert("RGBA"))[::4, ::4][r * 72:(r + 1) * 72, c * 48:(c + 1) * 48]
        im.alpha_composite(Image.fromarray(np.ascontiguousarray(h), "RGBA"))
    return im


def put_figure(canvas, im, sx, sy):
    """the feet on screen point (sx, sy)"""
    canvas.alpha_composite(im, (int(round(sx - FEET[0])), int(round(sy - FEET[1]))))
