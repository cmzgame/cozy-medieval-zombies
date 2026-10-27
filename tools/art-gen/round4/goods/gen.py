"""Art round 4, group C: food and materials.

Ten small goods, each one design in two renderings: <id>_world.png (the thing at the size it honestly
fills, tightly cropped, held `fixed` in the hand) and <id>_icon.png (the same pixels centred unscaled on
the 19 x 19 bag cell). Everything here is under 20 px, so every picture is a hand-pixelled ASCII grid
with a palette dict (the method of the apple, bread, stone, and seed pouches: docs/art/01, "Two
methods, picked by size"). Light from the top-left, a 1 px #2b2522 outline all the way round, three or
four flat shades per material, hard pixels only.

Run: python gen.py      (writes out/, manifest.json, preview.png; deterministic, no randomness)
"""
import json, os
import numpy as np
from PIL import Image, ImageDraw

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "out")
O = "#2b2522"
CELL = 19


def hx(s):
    s = s.lstrip("#"); return tuple(int(s[i:i + 2], 16) for i in (0, 2, 4)) + (255,)


def from_grid(name, rows, pal):
    w = max(len(r) for r in rows)
    bad = [i for i, r in enumerate(rows) if len(r) != w]
    if bad: raise ValueError(f"{name}: rows {bad} are not {w} wide: " + ", ".join(f"{i}:{len(rows[i])}" for i in bad))
    im = Image.new("RGBA", (w, len(rows)), (0, 0, 0, 0))
    for y, r in enumerate(rows):
        for x, ch in enumerate(r):
            if ch == ".": continue
            if ch not in pal: raise ValueError(f"{name}: no colour for {ch!r} at {x},{y}")
            im.putpixel((x, y), hx(pal[ch]))
    return ring(im)


def ring(im):
    """close the outline: every empty pixel that touches the picture on a side becomes #2b2522, so a gap
    left in a hand-drawn edge can never leak. The canvas grows by a pixel each side first."""
    a = np.array(im); big = np.zeros((a.shape[0] + 2, a.shape[1] + 2, 4), np.uint8); big[1:-1, 1:-1] = a
    op = big[..., 3] > 0
    fill = op & ~(big[..., :3] == np.array(hx(O)[:3], np.uint8)).all(-1)   # the drawn colours, not the outline already drawn
    p = np.pad(fill, 1)
    nb = p[:-2, 1:-1] | p[2:, 1:-1] | p[1:-1, :-2] | p[1:-1, 2:]
    add = nb & ~op
    big[add] = hx(O)
    return Image.fromarray(big, "RGBA")


# ------------------------------------------------------------------ cheese: a wheel with a wedge cut out
# The top and side are the golden rind, the cut shows the pale paste with two small eyes. A wheel
# alone reads as a drum or a cake; the missing wedge is what says cheese at 19 px.
CHEESE_PAL = {"o": O, "T": "#e2b860", "t": "#c99a44", "r": "#b88436",
              "P": "#f6e6a8", "p": "#e0c47c", "h": "#c8a256",
              "S": "#c08a3a", "s": "#9e6c2a", "d": "#7a5020"}
CHEESE = [
    "....TTTTTTt....",
    "..TTTTTTTTTtt..",
    ".TTTTTTTTTtttt.",
    "TTTTTTTTrrrrrrr",
    "STTTTTTtPPPPPPp",
    "SSTTTTttPPhPPPp",
    "SSSStttsPPPPhPp",
    "SSSSSsssrpppppp",
    "sSSSSsssd......",
    ".ssssssd.......",
    "..ddddd........",
]

# ------------------------------------------------------------------ honey: a squat clay jar, a linen cover tied with twine
HONEY_PAL = {"o": O, "C": "#ece4cc", "c": "#cfc29e", "k": "#a8966f",
             "z": "#8a6440", "s": "#5e4028",
             "G": "#dca274", "J": "#c27c4a", "j": "#a4623a", "q": "#83492c", "Q": "#5e3220",
             "H": "#f6d470", "h": "#d89a2a", "y": "#9e6a1c"}
HONEY = [
    ".....CCCC.....",
    "...CCCCCccc...",
    "...CCCCccck...",
    "....zzsssss...",
    "..CCCkCCcckks.",
    ".CCkCCCkcckkk.",
    ".CkHJCCkjHckq.",
    ".GHJjjkjjjjqq.",
    "GJHJjjjjjjjjqQ",
    "GJHjjjjjjjjqqQ",
    "JJhjjjjjjjjqqQ",
    ".JyjjjjjjjqqQ.",
    "..qjjjjjjqqQ..",
    "...qqqqqqQQ...",
]

# ------------------------------------------------------------------ potato: a lumpy tuber, eyes, a little soil
POTATO_PAL = {"o": O, "H": "#cdb07c", "P": "#b0905e", "p": "#8e7048", "d": "#6e5438", "e": "#5a4030"}
POTATO = [
    "....ooooo......",
    "..ooHHHHHoooo..",
    ".oHHHPPPHHHPPo.",
    "oHHPPePPPPPPPpo",
    "oHPPPPPPPePPppo",
    "oPPPPPPPPPPpppo",
    "oPPePPPPPPpppdo",
    ".oPPPPPPPpppddo",
    ".oppPPPpppdddo.",
    "..oodpppdddoo..",
    "....ooooooo....",
]

# ------------------------------------------------------------------ cabbage: a pale heart wrapped by two outer leaves, a cut stem
CABBAGE_PAL = {"o": O, "L": "#d0dca6", "l": "#b8cc8e", "v": "#c4d49a",
               "G": "#9cb878", "g": "#7c9a5a", "k": "#5f8445", "K": "#4b6a3a", "S": "#d6d4a8"}
CABBAGE = [
    "....oooooo.....",
    "..ooLLLLLLoo...",
    ".oGvLLLLLlllko.",
    "oGGGvLLLLlllkKo",
    "oGGGGvLLllvkkKo",
    "oGgGGGvlllvkkKo",
    "oGGvGGGvlvkkkKo",
    "oGGGvGGGvkkkKKo",
    "ogGGGvGGvkkvKKo",
    "oggGGGvGvkvkKKo",
    ".oggGGGvvkkKKo.",
    "..oggggSSkKKo..",
    "...oooSSSooo...",
    ".....ooo.......",
]

# ------------------------------------------------------------------ garlic: a papery bulb, purple streaks, clove lines, a root tuft
GARLIC_PAL = {"o": O, "N": "#c8b890", "n": "#a08c68", "W": "#f2ecdc", "G": "#e0d8c4", "g": "#c2b8a6",
              "d": "#9a8e7e", "v": "#8a6a86", "V": "#a888a0", "r": "#b8a888"}
GARLIC = [
    ".....ooo.....",
    ".....oNo.....",
    "....oNno.....",
    "...ooWGoo....",
    "..oWWGGgGgo..",
    ".oWWGvGGgGgo.",
    "oWWGGvGGgGggo",
    "oWGGgvGGgvggo",
    "oWGGgVGGgvgdo",
    "oGGGgGGgggddo",
    ".oGgggggggdo.",
    "..oddgggddo..",
    "...ordrdro...",
    "....ooooo....",
]

# ------------------------------------------------------------------ iron bar: a small dark ingot, its top lit, the end in shade
IRON_PAL = {"o": O, "G": "#b4b6c0", "T": "#8a8c96", "t": "#7a7c86", "F": "#5e6068", "f": "#50525a",
            "E": "#3e3f46", "m": "#6c6e78"}
IRON_BAR = [
    "...oooooooooo...",
    "..oGTTTTTTTTto..",
    ".oGTTTTmTTTTtEo.",
    ".oTTTTmmmTTTtEEo",
    "oFFFFFFFFFFFFEEo",
    "oFffffffffffFEEo",
    "offfffffffffffEo",
    "oooooooooooooooo",
]

# ------------------------------------------------------------------ cloth: a folded bolt of undyed linen, tied with twine
CLOTH_PAL = {"o": O, "W": "#eee8d6", "L": "#dcd3bb", "l": "#c6bc9e", "d": "#a2967a", "t": "#8a6440", "T": "#b08a5c"}
CLOTH = [
    "...ooooooooooo..",
    "..oWWWWWWWTWWLo.",
    ".oWWWWWWWWtWLLLo",
    "oWLLLLLLLLTLLLlo",
    "oLlllllllllllldo",
    ".oLLLLLLLLTLLLlo",
    "oLlllllllltllldo",
    ".oLLLLLLLLTLLLlo",
    "oLlllllllllllldo",
    "oooooooooooooooo",
]

# ------------------------------------------------------------------ rag: a torn scrap of dirty cloth
RAG_PAL = {"o": O, "R": "#c8bea0", "r": "#aaa088", "s": "#8a8270", "d": "#6a6252", "m": "#7a6a4e", "M": "#5e5040"}
RAG = [
    "....rrrr.......",
    "..rrrrrrrrr....",
    ".RRrrrrmmrrrr..",
    "RRRRsrrmMmrrrs.",
    ".RRRRsrrmrrrsss",
    "..RRRRsrrrrssss",
    "...RRrsrrrssmsd",
    "...rrrrrrsssMmd",
    "..rrrrrrssssmsd",
    "..rr.rrss.ssd.d",
    "...r..rs...sd..",
]

# ------------------------------------------------------------------ charcoal: three black lumps with a dull sheen
# Angular chunks of burnt wood, drawn as faceted boxes back to front, each wrapped in its own outline so the
# one in front cuts a clean line across the one behind. Lifted to a dark grey (the item's own #2a2626 would
# vanish into the outline and the slot); a cool silvery sheen on the tops, grain cracks along the faces.
COAL = {"G": "#9a98a4", "H": "#6a6874", "B": "#4c4852", "b": "#38343c", "c": "#27232a"}

def charcoal():
    W, H = 20, 16
    im = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    def chunk(faces, extra):
        m = Image.new("L", (W, H), 0); dm = ImageDraw.Draw(m)
        for poly, _ in faces: dm.polygon(poly, fill=255)
        a = np.array(m) > 0
        p = np.pad(a, 1); ring_ = (p[:-2, 1:-1] | p[2:, 1:-1] | p[1:-1, :-2] | p[1:-1, 2:]) & ~a
        arr = np.array(im); arr[ring_] = hx(O); arr[a] = (0, 0, 0, 0); im.paste(Image.fromarray(arr, "RGBA"))
        d = ImageDraw.Draw(im)
        for poly, c in faces: d.polygon(poly, fill=hx(COAL[c]))
        for (x, y, c) in extra: im.putpixel((x, y), hx(COAL[c]))
    # A: a long broken stick lying at the back, its lit end grain on the left
    chunk([([(1, 1), (4, 0), (8, 0), (10, 1), (11, 3), (4, 3)], "H"), ([(4, 3), (11, 3), (11, 6), (9, 7), (3, 6)], "B"), ([(1, 1), (4, 3), (3, 6), (1, 5)], "H")],
          [(3, 1, "G"), (4, 1, "G"), (5, 1, "G"), (8, 2, "G"), (5, 5, "c"), (6, 5, "c"), (7, 5, "c"), (8, 4, "b"), (9, 4, "b"), (10, 4, "b"), (11, 4, "b"), (11, 5, "b"), (2, 3, "B"), (2, 4, "c"), (1, 3, "B")])
    # B: a chunk standing on the right, its left face lit and its right face in shade
    chunk([([(9, 4), (12, 3), (15, 4), (14, 6), (11, 6)], "H"), ([(9, 4), (11, 6), (11, 10), (9, 9)], "B"), ([(11, 6), (14, 6), (15, 5), (15, 9), (13, 11), (11, 10)], "b")],
          [(11, 4, "G"), (12, 4, "G"), (13, 5, "G"), (13, 7, "c"), (13, 8, "c"), (14, 9, "c"), (10, 7, "b"), (10, 8, "b")])
    # C: a small lump in front
    chunk([([(2, 7), (5, 6), (8, 7), (6, 9), (3, 9)], "H"), ([(2, 7), (3, 9), (3, 11), (2, 10)], "B"), ([(3, 9), (6, 9), (8, 7), (8, 10), (6, 11), (3, 11)], "b")],
          [(4, 7, "G"), (5, 7, "G"), (5, 10, "c"), (6, 10, "c")])
    return ring(im)


# ------------------------------------------------------------------ clay: a slumped lump of wet river clay, a thumb dent, a wet glint
CLAY_PAL = {"o": O, "W": "#e4dccc", "H": "#9e9080", "C": "#807262", "c": "#665a4c", "d": "#4c4238"}
CLAY = [
    "....HHHHH......",
    "..HWWHHHCCC....",
    ".HWHHHHCCCCc...",
    ".HHHCcddCCCcc..",
    ".HHCCHHcCCCcc..",
    "HHCCCCCCCCCccc.",
    "HCCCCCCCCCCcccd",
    "HCCCCCCCCCccddd",
    "cCCCCCCCccccddd",
    ".ccccccccdddd..",
]

GOODS = [
    # id, rows, palette, grip (from the world PNG's top-left), name in the game
    ("cheese", CHEESE, CHEESE_PAL, (8, 7), "Wheel of cheese"),
    ("honey", HONEY, HONEY_PAL, (6, 10), "Pot of honey"),
    ("potato", POTATO, POTATO_PAL, (7, 5), "Potato"),
    ("cabbage", CABBAGE, CABBAGE_PAL, (7, 7), "Cabbage"),
    ("garlic", GARLIC, GARLIC_PAL, (6, 8), "Garlic"),
    ("iron_bar", IRON_BAR, IRON_PAL, (7, 4), "Iron bar"),
    ("cloth", CLOTH, CLOTH_PAL, (8, 5), "Linen cloth"),
    ("rag", RAG, RAG_PAL, (7, 5), "Rag"),
    ("charcoal", charcoal, None, (8, 6), "Charcoal"),
    ("clay", CLAY, CLAY_PAL, (7, 5), "Clay"),
]


def on_cell(im):
    out = Image.new("RGBA", (CELL, CELL), (0, 0, 0, 0))
    out.alpha_composite(im, ((CELL - im.width) // 2, (CELL - im.height) // 2))
    return out


def hard(im):
    return set(np.unique(np.array(im)[..., 3]).tolist()) <= {0, 255}


def outlined(im):
    """every opaque pixel that touches transparency (or the canvas edge) is the outline colour"""
    a = np.array(im); op = a[..., 3] > 0
    p = np.pad(op, 1)
    edge = op & ~(p[:-2, 1:-1] & p[2:, 1:-1] & p[1:-1, :-2] & p[1:-1, 2:])
    col = a[..., :3][edge]
    return bool((col == np.array(hx(O)[:3])).all())


def main():
    os.makedirs(OUT, exist_ok=True)
    manifest, worlds, icons = {}, [], []
    for gid, rows, pal, grip, name in GOODS:
        w = rows() if callable(rows) else from_grid(gid, rows, pal)
        ys, xs = np.where(np.array(w)[..., 3] > 0)
        # tight crop; the grid's grip is given in grid pixels and moves with the crop
        w = w.crop((int(xs.min()), int(ys.min()), int(xs.max()) + 1, int(ys.max()) + 1))
        grip = (grip[0] + 1 - int(xs.min()), grip[1] + 1 - int(ys.min()))   # +1: ring() grew the canvas
        assert hard(w), gid
        if not outlined(w): print("WARN outline gap:", gid)
        assert w.width <= CELL and w.height <= CELL, gid
        assert np.array(w)[grip[1], grip[0], 3] == 255, f"{gid} grip on empty pixel"
        ic = on_cell(w)
        w.save(os.path.join(OUT, f"{gid}_world.png")); ic.save(os.path.join(OUT, f"{gid}_icon.png"))
        worlds.append((gid, w, grip)); icons.append((gid, ic))
        manifest[gid] = {
            "icon": [CELL, CELL], "portrait": False,
            "held": {"mode": "fixed", "image": f"{gid}_world.png", "grip": list(grip)},
            "world_size": [w.width, w.height],
            "notes": NOTES[gid],
        }
    with open(os.path.join(HERE, "manifest.json"), "w") as f: json.dump(manifest, f, indent=2)
    preview(worlds, icons)
    if "--zoom" in os.sys.argv: zoom(worlds)
    for gid, w, grip in worlds: print(f"{gid:9s} world {w.width}x{w.height} grip {grip}")


NOTES = {
    "cheese": "a wheel with a quarter wedge cut out: golden rind top and side, pale paste with two eyes on the cut. Not stackable today, so no corner is kept clear.",
    "honey": "the jar of honey: a squat terracotta jar, a linen cover tied at the neck with twine, golden honey showing under the cloth's points and one drip down the lit shoulder.",
    "potato": "a lumpy tan tuber with three eyes, the potato crop's skin colours.",
    "cabbage": "a pale heart wrapped by two outer leaves (lit left, shaded right) with pale veins, a cut stem below; the cabbage crop's greens.",
    "garlic": "a papery cream bulb with clove lines, purple streaks, a dried neck and a root tuft; the garlic crop's colours.",
    "iron_bar": "a small dark ingot: a lit top face with a cast mark, the front in mid iron, the right end in shade.",
    "cloth": "a folded bolt of undyed linen, four folds showing on the front and a twine tie across it.",
    "rag": "a torn scrap of dingy cloth: ragged edges, a hanging corner, brown stains.",
    "charcoal": "three charcoal lumps, lifted to a dark grey so they stand off the outline and the slot, a cool dull sheen on their tops and a crack or two.",
    "clay": "a slumped lump of wet grey-brown river clay with a thumb dent and a wet glint. Replaces the generated lump design (#b0683c), which was orange.",
}


def label(d, x, y, s, fill=(220, 210, 190, 255)):
    d.text((x, y), s, fill=fill)


def preview(worlds, icons):
    """row 1: every icon at 2x on the dark slot (#2a2622) with a cell grid; row 2: every world picture at 3x
    with its grip marked beside an unmarked copy; row 3: the same at 1x, with the drawn apple, bread, and
    stone for scale. No portraits in this group."""
    SL = (0x2a, 0x26, 0x22, 255)
    BG = (0x1c, 0x1a, 0x18, 255)
    n = len(icons)
    col = 112
    W = 16 + n * col
    H = 470
    P = Image.new("RGBA", (W, H), BG)
    d = ImageDraw.Draw(P)
    for i, (gid, ic) in enumerate(icons):
        x = 16 + i * col
        label(d, x, 6, gid)
        # icon 2x in its slot
        slot = Image.new("RGBA", (CELL * 2 + 2, CELL * 2 + 2), (0x4a, 0x42, 0x3a, 255))
        slot.paste(Image.new("RGBA", (CELL * 2, CELL * 2), SL), (1, 1))
        slot.alpha_composite(ic.resize((CELL * 2, CELL * 2), Image.NEAREST), (1, 1))
        P.alpha_composite(slot, (x, 22))
        # icon 1x
        s1 = Image.new("RGBA", (CELL, CELL), SL); s1.alpha_composite(ic)
        P.alpha_composite(s1, (x + 50, 22))
    for i, (gid, w, grip) in enumerate(worlds):
        x = 16 + i * col
        big = w.resize((w.width * 3, w.height * 3), Image.NEAREST)
        P.alpha_composite(big, (x, 90))
        m = big.copy(); dm = ImageDraw.Draw(m)
        gx, gy = grip[0] * 3, grip[1] * 3
        dm.rectangle([gx, gy, gx + 2, gy + 2], outline=(80, 220, 255, 255))
        P.alpha_composite(m, (x, 160))
        label(d, x, 222, f"{w.width}x{w.height} g{grip[0]},{grip[1]}")
    # 1x on a grass-ish ground and on the slot, with the existing drawn foods for scale
    REF = r"C:/Users/micha/Dev/cozy-medieval-zombies/.claude/worktrees/79-sweep-3e-23fa08/data/art/items"
    refs = []
    for r in ("apple", "bread", "stone", "tinderbox"):
        p = os.path.join(REF, f"{r}_world.png")
        if os.path.exists(p): refs.append((r, Image.open(p).convert("RGBA")))
    label(d, 16, 244, "1x on grass and on wood, new goods then the drawn apple, bread, stone, tinderbox; then 3x of the same row")
    row = [w for _, w, _ in worlds] + [im for _, im in refs]
    strip_w = sum(im.width + 6 for im in row) + 6
    for k, ground in enumerate(((75, 95, 61, 255), (0x65, 0x4a, 0x32, 255))):
        strip = Image.new("RGBA", (strip_w, 24), ground)
        x = 6
        for im in row:
            strip.alpha_composite(im, (x, 22 - im.height)); x += im.width + 6
        P.alpha_composite(strip, (16, 262 + k * 28))
        if k == 0:
            P.alpha_composite(strip.resize((strip.width * 3, strip.height * 3), Image.NEAREST).crop((0, 0, min(W - 32, strip.width * 3), 72)), (16, 324))
    label(d, 16, 404, "order: " + ", ".join(g for g, _, _ in worlds))
    P.save(os.path.join(HERE, "preview.png"))


def zoom(worlds, S=10):
    """a working sheet for the artist's eye: each picture at 10x on the slot colour, five to a row"""
    per = 5
    cw, ch = 20 * S, 20 * S
    rows = (len(worlds) + per - 1) // per
    Z = Image.new("RGBA", (per * cw, rows * ch), (0x6a, 0x7a, 0x5a, 255))
    for i, (gid, w, _) in enumerate(worlds):
        x, y = (i % per) * cw, (i // per) * ch
        Z.alpha_composite(w.resize((w.width * S, w.height * S), Image.NEAREST), (x + (cw - w.width * S) // 2, y + (ch - w.height * S) // 2))
    os.makedirs(os.path.join(HERE, "work"), exist_ok=True)
    Z.save(os.path.join(HERE, "work", "zoom.png"))


if __name__ == "__main__":
    main()
