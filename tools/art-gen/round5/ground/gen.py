"""Art round 5, group C: the mushroom, the clay bank, salt.

Two items (the mushroom and salt: <id>_world.png held `fixed`, <id>_icon.png the same pixels centred on
the 19 x 19 bag cell) and two gathered nodes (clay_bank, dug with a shovel; salt_rock, mined with a
pickaxe: <id>.png and <id>.json in the shape of data/sprites/mushroom_0.json, anchored on the foot).

Everything is hand-pixelled ASCII grids with a palette each, drawn as separate parts back to front, each
part wrapped in its own #2b2522 outline (`ring`), so where one part stands in front of another the line
between them is drawn too (the drawn rocks' way). Light from the top left, three or four flat shades per
material, hard pixels only, no baked shadow.

Run: python gen.py   (writes out/, manifest.json, preview.png, work/zoom.png; deterministic, no randomness)
"""
import json, os, copy
import numpy as np
from PIL import Image, ImageDraw

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "out")
WORK = os.path.join(HERE, "work")
REPO = "C:/Users/micha/Dev/cozy-medieval-zombies/.claude/worktrees/79-sweep-3e-23fa08"   # read only
O = "#2b2522"
CELL = 19


def hx(s):
    s = s.lstrip("#"); return tuple(int(s[i:i + 2], 16) for i in (0, 2, 4)) + (255,)


def grid(name, rows, pal):
    """a part from rows of letters ('.' empty), not yet outlined"""
    w = max(len(r) for r in rows)
    bad = [i for i, r in enumerate(rows) if len(r) != w]
    if bad: raise ValueError(f"{name}: rows {bad} are not {w} wide: " + ", ".join(f"{i}:{len(rows[i])}" for i in bad))
    im = Image.new("RGBA", (w, len(rows)), (0, 0, 0, 0))
    for y, r in enumerate(rows):
        for x, ch in enumerate(r):
            if ch == ".": continue
            if ch not in pal: raise ValueError(f"{name}: no colour for {ch!r} at {x},{y}")
            im.putpixel((x, y), hx(pal[ch]))
    return im


def ring(im):
    """wrap a part in the outline: every empty pixel touching it on a side becomes #2b2522 (the canvas
    grows a pixel each side first), so no gap in a drawn edge can leak"""
    a = np.array(im); big = np.zeros((a.shape[0] + 2, a.shape[1] + 2, 4), np.uint8); big[1:-1, 1:-1] = a
    op = big[..., 3] > 0
    fill = op & ~(big[..., :3] == np.array(hx(O)[:3], np.uint8)).all(-1)
    p = np.pad(fill, 1)
    nb = p[:-2, 1:-1] | p[2:, 1:-1] | p[1:-1, :-2] | p[1:-1, 2:]
    big[nb & ~op] = hx(O)
    return Image.fromarray(big, "RGBA")


def compose(parts):
    """parts: [(image, (x, y))] back to front, each ringed; the result tightly cropped"""
    W = max(x + im.width for im, (x, y) in parts) + 2
    H = max(y + im.height for im, (x, y) in parts) + 2
    c = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    for im, (x, y) in parts:
        r = ring(im)
        c.alpha_composite(r, (x, y))      # ring() grew the part by 1 px: (x, y) is the outline's corner
    return c.crop(c.getbbox())


# ================================================================== the mushroom (item)
# The brown kind of the drawn mushroom nodes (data/art/ground/mushroom_2.png and _3: cap #8a6842 lit,
# #705232 mid, #543c24 rim in shade, gills #2e2014, a pale skirt #a89c80; stalk #d6ccb2 #c2b79c #a89c80
# #5e5444), the item's own colour #9a6a44 as a glint on the cap's lit shoulder. Two picked mushrooms: a
# big one standing, its stalk ending in a pulled foot with a crumb of soil, and a small one lying on its
# side in front, showing its gills and the cut end of its stalk, so they read as picked, not growing.
MUSH_PAL = {"b": "#9a6a44", "B": "#8a6842", "C": "#705232", "E": "#543c24", "D": "#2e2014",
            "F": "#a89c80", "G": "#d6ccb2", "H": "#c2b79c", "I": "#5e5444",
            "k": "#4a3524", "K": "#3a2a1d", "o": O}
MUSH_BIG = [
    "...bbBBC...",
    ".bbBBBBBCC.",
    "bBBBBBBBCCE",
    "BBBBBBBCCCE",
    "CCCCCCCCCEE",
    "DDDDDDDDDDD",
    ".FFFFFFFFF.",
    "...GHHF....",
    "...GHHF....",
    "...GHHF....",
    "..GGHHFI...",
    "..kGHHIK...",
    "...kkKK....",
]
MUSH_SMALL = [
    ".bbBC..",
    "bBBBCCE",
    "CCCCCEE",
    "DDDDDDD",
    ".FFFFF.",
    "..GHF..",
    ".GGHFI.",
    ".kGHIK.",
    "..kKK..",
]


def mushroom():
    big = grid("mush_big", MUSH_BIG, MUSH_PAL)
    small = grid("mush_small", MUSH_SMALL, MUSH_PAL)
    return compose([(big, (0, 0)), (small, (7, 4))])


# ================================================================== salt (item)
# A small heap of coarse crystals: a pale cool-white ramp from the item's own #d8d0cc, each grain a tiny
# block with a bright top-left pixel and a shaded right side, so the heap is lumpy, not smooth like flour
# or snow; a few loose grains at its foot say "coarse".
SALT_PAL = {"W": "#fbf8f4", "L": "#ece6e2", "M": "#d8d0cc", "S": "#b4aaa8", "D": "#8c8284", "o": O}
SALT = [
    "......WLS.......",
    "....WLSMWLS.....",
    "...WLMSWLMSS....",
    "..WLSMMSLLMSWS..",
    "..LMSWLSWLSMMS..",
    ".WLSMMSMLMSWLSD.",
    ".LMSWLSWLMSMMSD.",
    "WLSMMSMLMSMWLSDD",
    "LMSWLSWMSDWLMSDD",
    "MSSMSDMSSDMSSDDD",
    ".DDSDDDSDDDDSDD.",
]
SALT_GRAIN = ["WS", "SD"]


def salt():
    heap = grid("salt", SALT, SALT_PAL)
    g = grid("grain", SALT_GRAIN, SALT_PAL)
    return compose([(heap, (0, 0)), (g, (0, 10)), (g, (14, 10))])


# ================================================================== the clay bank (node)
# A low wet bank of grey-brown river clay, the drawn clay item's ramp (data/art/items/clay_icon.png:
# #e4dccc wet glint, #9e9080 lit, #807262 base, #665a4c shade, #4c4238 dark), with a turf lip of grass
# along its crown, a scoop dug out of its face (the inner wall darker and wetter, a sheen on its floor),
# glossy wet streaks on the lit shoulder, and a few pebbles at its foot.
CLAY_PAL = {"W": "#e4dccc", "H": "#9e9080", "C": "#807262", "c": "#665a4c", "d": "#4c4238",
            "n": "#3e352d", "w": "#b8ac9a", "f": "#8a7c6a", "p": "#4a6b7c", "P": "#6f8e9c",
            "g": "#405434", "G": "#586e44", "L": "#687e4c", "o": O}
CLAY_BANK = [
    "..........L.G..L.g............",
    "......gGLGGLGGGLGGGgg.........",
    "....HHHHHHHHHHHHHHHHHHCc......",
    "..HWWWWHHHHHHHHHHHHHHCCCcc....",
    ".HWHHHHHHHHHHHHHHHHHCCCCccc...",
    "HHHHHWWWHHHccccccHHCCWWcccc...",
    "HHHHHHHHHccdddddddccCCcccccc..",
    "CCCHHHHHncddddddddddCCcccccc..",
    "ccCCCCCCncddccccdddnCcccccccd.",
    "CCCcccCCncdddddddddnCcccccccdd",
    "cCCCCCCCcfWWfpPPpfccCcccccccdd",
    ".ccCCcccffffpppppffccccccccdd.",
    "...cccccffffffffffccccccdddd..",
    "......ddd..........dddd.......",
]
PEB_PAL = {"W": "#cfc6b6", "L": "#b0a697", "m": "#8e857a", "d": "#6c645c"}
PEB_A = ["WL.", "Lmd"]
PEB_B = ["Wd"]
PEB_C = [".WL", "Lmd", "md."]
TUFT_PAL = {"g": "#405434", "G": "#586e44", "L": "#687e4c"}
TUFT_A = ["L.G", "LGg"]
TUFT_B = [".L.", "GLg"]


def clay_bank():
    bank = grid("clay_bank", CLAY_BANK, CLAY_PAL)
    return compose([(bank, (2, 0)),
                    (grid("pa", PEB_A, PEB_PAL), (0, 11)),
                    (grid("pb", PEB_B, PEB_PAL), (14, 13)),
                    (grid("ta", TUFT_A, TUFT_PAL), (6, 12)),
                    (grid("tb", TUFT_B, TUFT_PAL), (24, 12)),
                    (grid("pc", PEB_C, PEB_PAL), (29, 10))])


# ================================================================== the salt rock (node)
# A pale grey-white boulder in the drawn rocks' facets (top lit, its top-left edge glinting, the left face
# mid, the right face in shade), with cubic salt crystals (halite grows in cubes) standing out of its top
# and one at its foot, whiter than the rock, so the rock reads as salt and not as a pale stone.
ROCK_PAL = {"W": "#ece4e0", "L": "#d6cac6", "m": "#b4a6a4", "d": "#8c7e80", "D": "#6e6668",
            "X": "#ffffff", "T": "#f6f4f4", "l": "#e0dce2", "r": "#b0aab8"}
SALT_ROCK = [
    "......WWWWLLL.......",
    "....WWLLLLLLLLLd....",
    "..WWLLLLLLLLLLLddd..",
    ".WLLLLLLLLLLLLLdddd.",
    "WLLLLLLLLLLLLLddddd.",
    "mLLLLLLLLLLLLdddddd.",
    "mmmLLLLLLLLLddddddd.",
    "mmmmmdddddddddddddd.",
    "mmmmmmmmmmdddddddddd",
    "mmmmmmmmmmmddddddddd",
    "mmmmmmmmmmmdddddddd.",
    ".mmmmmmmmmmmdddddd..",
    "..mmmmmmmmmmdddd....",
    "....mmmmmmmmdd......",
]
SALT_ROCK_B = [
    "...WWLLL....",
    ".WWLLLLLLd..",
    "WLLLLLLLddd.",
    "mLLLLLLdddd.",
    "mmmLLLddddd.",
    "mmmmmdddddd.",
    "mmmmmmddddd.",
    ".mmmmmdddd..",
    "...mmmdd....",
]
CUBE_L = [            # a crystal cube, 6 wide: lit top, pale left face, cool right face
    ".XTTT.",
    "XTTTTT",
    "llllrr",
    "llllrr",
    "lllrrr",
    ".llrr.",
]
CUBE_M = [
    "XTT.",
    "TTTT",
    "llrr",
    "llrr",
]
CUBE_S = [
    "XT",
    "lr",
]
CUBE_TALL = [         # a taller prism, the biggest crystal
    ".XTT.",
    "XTTTT",
    "lllrr",
    "lllrr",
    "lllrr",
    "llrrr",
    "llrrr",
    ".lrr.",
]


def salt_rock():
    rock = grid("salt_rock", SALT_ROCK, ROCK_PAL)
    P = ROCK_PAL
    return compose([(rock, (0, 8)),
                    (grid("ct", CUBE_TALL, P), (6, 0)),
                    (grid("cl", CUBE_L, P), (11, 4)),
                    (grid("cm", CUBE_M, P), (2, 7)),
                    (grid("rb", SALT_ROCK_B, P), (14, 15)),
                    (grid("cs", CUBE_S, P), (19, 13)),
                    (grid("cf", CUBE_S, P), (12, 22))])


# ================================================================== checks, anchors, output
def on_cell(im):
    out = Image.new("RGBA", (CELL, CELL), (0, 0, 0, 0))
    out.alpha_composite(im, ((CELL - im.width) // 2, (CELL - im.height) // 2))
    return out


def hard(im):
    return set(np.unique(np.array(im)[..., 3]).tolist()) <= {0, 255}


def outlined(im):
    a = np.array(im); op = a[..., 3] > 0
    p = np.pad(op, 1)
    edge = op & ~(p[:-2, 1:-1] & p[2:, 1:-1] & p[1:-1, :-2] & p[1:-1, 2:])
    return bool((a[..., :3][edge] == np.array(hx(O)[:3])).all())


def foot(im, x=None):
    """the foot: the lowest opaque pixel of the column under the picture's middle (the mushroom nodes'
    anchor is their bottom outline row under the stalk, data/sprites/mushroom_0.json)"""
    a = np.array(im)[..., 3] > 0
    if x is None:
        xs = np.where(a.any(0))[0]; x = int((xs.min() + xs.max()) // 2)
    ys = np.where(a[:, x])[0]
    return [int(x), int(ys.max())]


NOTE_ART = {
    "clay_bank": "Drawn in art round 5 (group C) in the drawn clay item's grey-brown (data/art/items/clay_icon.png), replacing the orange dev design.",
    "salt_rock": "Drawn in art round 5 (group C): a pale boulder in the drawn rocks' facets with cubic salt crystals, the salt item's whites.",
}


def node_def(src_id, im, anchor):
    d = json.load(open(f"{REPO}/data/sprites/{src_id}.json"))
    out = {"image": f"data/art/ground/{src_id}.png",
           "frames": {"idle_0": [0, 0, im.width, im.height]},
           "anchor": anchor,
           "bounds": {"x": 0, "y": 0, "w": im.width, "h": im.height}}
    for k, v in d.items():
        if k == "placeholder": continue
        out[k] = v
    i = out["note"].find(" Dev art drawn from this design")
    if i >= 0:
        out["note"] = out["note"][:i] + " " + NOTE_ART[src_id]
    return out


def main():
    os.makedirs(OUT, exist_ok=True); os.makedirs(WORK, exist_ok=True)
    items = {"mushroom": mushroom(), "salt": salt()}
    nodes = {"clay_bank": clay_bank(), "salt_rock": salt_rock()}
    grips = {}
    for k, im in items.items():
        assert im.width <= CELL and im.height <= CELL, (k, im.size)
        im.save(f"{OUT}/{k}_world.png"); on_cell(im).save(f"{OUT}/{k}_icon.png")
    grips["mushroom"] = [6, 10]
    grips["salt"] = [8, 6]
    anchors = {k: foot(im) for k, im in nodes.items()}
    for k, im in nodes.items():
        im.save(f"{OUT}/{k}.png")
        nd = node_def(k, im, anchors[k])
        with open(f"{OUT}/{k}.json", "w") as f: json.dump(nd, f)
    # checks
    for k, im in list(items.items()) + list(nodes.items()):
        assert hard(im), k
        assert outlined(im), k
        assert im.getbbox() == (0, 0, im.width, im.height), (k, "crop")
    for k, g in grips.items():
        assert items[k].getpixel(tuple(g))[3] == 255, (k, "grip")
    for k, a in anchors.items():
        assert nodes[k].getpixel(tuple(a))[3] == 255, (k, "anchor")
    notes = {
        "mushroom": "two picked brown mushrooms (the drawn nodes' brown kind, mushroom_2 and _3): a big one standing with a crumb of soil on its pulled foot, a small one lying on its side in front, gills and the cut stalk showing. Not stackable today (no stack in data/items.json); the small one reaches the cell's lower right, so a stack count would sit on it.",
        "salt": "a small heap of coarse white salt crystals: every grain a tiny block, bright top-left and shaded right, two loose grains at the foot. Not stackable today; the heap fills the cell's bottom, so a stack count would sit on it.",
    }
    man = {}
    for k, im in items.items():
        man[k] = {"icon": [CELL, CELL], "portrait": False,
                  "held": {"mode": "fixed", "image": f"{k}_world.png", "grip": grips[k]},
                  "world_size": [im.width, im.height], "notes": notes[k]}
    man["_nodes"] = {k: {"image": f"{k}.png", "definition": f"{k}.json", "size": [im.width, im.height],
                         "anchor": anchors[k]} for k, im in nodes.items()}
    with open(f"{HERE}/manifest.json", "w") as f: json.dump(man, f, indent=2)
    preview(items, nodes, grips, anchors)
    zoom(items, nodes)
    for k, im in items.items(): print(k, "world", im.size, "grip", grips[k])
    for k, im in nodes.items(): print(k, im.size, "anchor", anchors[k])


# ================================================================== previews
def figure_for_scale():
    """the bare body from the repo's data/art/character/preview_skins_3x.png, back at 1x (read only)"""
    im = np.array(Image.open(f"{REPO}/data/art/character/preview_skins_3x.png").convert("RGBA"))
    bg = im[2, 2, :3].astype(int)
    cell = im[260:460, 170:310]
    small = cell[1::3, 1::3].copy()
    a = np.abs(small[..., :3].astype(int) - bg).sum(-1) > 6
    small[..., 3] = np.where(a, 255, 0)
    ys = np.where(a.any(1))[0]; xs = np.where(a.any(0))[0]
    return Image.fromarray(small[ys.min():ys.max() + 1, xs.min():xs.max() + 1], "RGBA")


def ref(path):
    return Image.open(f"{REPO}/{path}").convert("RGBA")


def label(d, x, y, s, fill=(220, 210, 190, 255)):
    d.text((x, y), s, fill=fill)


def scene(nodes, anchors):
    """1x strip: each node on a grass tile, beside the drawn mushrooms, a rock and the figure"""
    grass = ref("data/art/ground/grass_0.png")
    things = []
    for k in ("clay_bank", "salt_rock"):
        things.append((nodes[k], anchors[k]))
    for i in (2, 3):
        things.append((ref(f"data/art/ground/mushroom_{i}.png"),
                       json.load(open(f"{REPO}/data/sprites/mushroom_{i}.json"))["anchor"]))
    things.append((ref("data/art/ground/rock_1.png"), json.load(open(f"{REPO}/data/sprites/rock_1.json"))["anchor"]))
    fig = figure_for_scale()
    things.append((fig, [fig.width // 2, fig.height - 1]))
    W = 72 * len(things) + 8; H = 96
    c = Image.new("RGBA", (W, H), hx("#2a2622"))
    for i, (im, a) in enumerate(things):
        cx, cy = 8 + 72 * i + 32, 72          # the tile's centre
        c.alpha_composite(grass, (cx - 32, cy - 16))
        c.alpha_composite(im, (cx - a[0], cy - a[1]))
    return c


def preview(items, nodes, grips, anchors):
    s1 = scene(nodes, anchors)
    s3 = s1.resize((s1.width * 3, s1.height * 3), Image.NEAREST)
    slot = hx("#2a2622")
    # item row: icons at 2x in slots, 1x beside, world at 3x with grip box, refs (clay, stone) for company
    row = []
    for k in ("mushroom", "salt"):
        row.append(Image.open(f"{OUT}/{k}_icon.png"))
    refs = [ref("data/art/items/clay_icon.png"), ref("data/art/items/stone_icon.png"),
            ref("data/art/items/potato_icon.png")]
    W = max(s3.width, 900); H = 140 + s1.height + 16 + s3.height + 24
    c = Image.new("RGBA", (W, H), hx("#1f1c1a"))
    d = ImageDraw.Draw(c)
    x = 8
    label(d, 8, 2, "icons at 2x in a 38 px slot (mushroom, salt | drawn clay, stone, potato), the same at 1x, the worlds at 3x with the grip boxed")
    for im in row + refs:
        c.paste(Image.new("RGBA", (40, 40), slot), (x, 16))
        c.alpha_composite(im.resize((38, 38), Image.NEAREST), (x + 1, 17))
        c.alpha_composite(im, (x + 44, 26))
        x += 70
    for k in ("mushroom", "salt"):
        im = items[k]
        big = im.resize((im.width * 3, im.height * 3), Image.NEAREST)
        c.alpha_composite(big, (x, 16))
        gx, gy = grips[k]
        d.rectangle([x + gx * 3 - 1, 16 + gy * 3 - 1, x + gx * 3 + 3, 16 + gy * 3 + 3], outline=(0, 230, 230, 255))
        label(d, x, 16 + big.height + 2, f"{im.width}x{im.height} grip {gx},{gy}")
        x += max(big.width, 90) + 20
    for k in ("clay_bank", "salt_rock"):
        im = nodes[k]
        big = im.resize((im.width * 3, im.height * 3), Image.NEAREST)
        c.alpha_composite(big, (x, 16))
        ax, ay = anchors[k]
        d.rectangle([x + ax * 3 - 1, 16 + ay * 3 - 1, x + ax * 3 + 3, 16 + ay * 3 + 3], outline=(230, 60, 230, 255))
        label(d, x, 16 + big.height + 2, f"{k} {im.width}x{im.height} anchor {ax},{ay}")
        x += max(big.width, 140) + 20
    y = 140
    label(d, 8, y - 12, "1x on grass: clay bank, salt rock | drawn mushrooms 2 and 3, rock 1, the figure (anchor on the tile's centre)")
    c.alpha_composite(s1, (8, y))
    y += s1.height + 16
    label(d, 8, y - 12, "the same at 3x")
    c.alpha_composite(s3, (8, y))
    c = c.crop((0, 0, max(x, s3.width + 16), H))
    c.save(f"{HERE}/preview.png")


def zoom(items, nodes, S=10):
    ims = list(items.values()) + list(nodes.values())
    W = sum(im.width * S + 20 for im in ims) + 20; H = max(im.height for im in ims) * S + 40
    c = Image.new("RGBA", (W, H), hx("#4b5f3d"))
    x = 20
    for im in ims:
        c.alpha_composite(im.resize((im.width * S, im.height * S), Image.NEAREST), (x, 20)); x += im.width * S + 20
    c.save(f"{WORK}/zoom.png")


if __name__ == "__main__":
    main()
