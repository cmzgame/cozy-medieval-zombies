"""Shared preview helpers: a grass field, the 55 px figure (the rig's body with the round-1
painted layers composited), one of the dead, and a sprite board that places pieces by anchors
in the game's draw order."""
import json, os
import numpy as np
from PIL import Image

D = os.path.dirname(os.path.abspath(__file__))
SCR = os.path.join(D, "..", "..")
GROUND = os.path.join(SCR, "gen", "out", "ground")
BODY = os.path.join(SCR, "garments", "out", "body_1x.png")
LAYERS = os.path.join(SCR, "garments", "out", "delivery")
REFS = os.path.join(D, "..", "refs")
FACINGS = ["s", "sw", "w", "nw", "n", "ne", "e", "se"]


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


def _frame(sheet, f):
    i = FACINGS.index(f)
    return sheet[(i // 4) * 72:(i // 4 + 1) * 72, (i % 4) * 48:(i % 4 + 1) * 48]


_body = None
def body(f):
    global _body
    if _body is None: _body = np.array(Image.open(BODY).convert("RGBA"))
    return _frame(_body, f).copy()


def layer(name, f):
    sh = np.array(Image.open(f"{LAYERS}/{name}.png").convert("RGBA"))[::4, ::4]
    return _frame(sh, f)


def figure(f="s", dead=False, hair="hair_crop", outfit=("chest_tunic_long", "legs_breeches", "feet_boots", "waist_belt")):
    """48 x 72 RGBA, feet at (24, 66). The dead: skin gone green-grey, the tunic torn to rags."""
    b = body(f)
    if dead:
        skin = (b[..., 3] > 0) & (b[..., 0] > 150) & (b[..., 2] < 200)
        g = b[skin].astype(int)
        b[skin, 0] = (g[:, 0] * 0.55).astype(np.uint8); b[skin, 1] = (g[:, 1] * 0.78).astype(np.uint8); b[skin, 2] = (g[:, 2] * 0.5).astype(np.uint8)
    im = Image.fromarray(b, "RGBA")
    parts = list(outfit) + ([hair] if hair else [])
    for n in parts:
        try: la = layer(n, f)
        except FileNotFoundError: continue
        la = la.copy()
        if dead and n.startswith("chest"):
            la[..., 0] = (la[..., 0] * 0.6).astype(np.uint8); la[..., 1] = (la[..., 1] * 0.62).astype(np.uint8); la[..., 2] = (la[..., 2] * 0.55).astype(np.uint8)
        im.alpha_composite(Image.fromarray(la, "RGBA"))
    return im


class Board:
    """Pieces placed on a grass field by world tile coords (wx, wy in world units, 32 per tile)
    and their anchors (the tile's top vertex); sorted by the game's painter order:
    segment key = X + Y of its midpoint (wx + wy + 16), post key = X + Y of its vertex + 0.1,
    leaves and boards = just after their segment (before the same tile's other segment), figures = their feet's X + Y."""
    def __init__(self, W, H, org, anchors, folders):
        self.c = grass_field(W, H); self.org = org; self.items = []
        self.A = anchors; self.folders = folders; self._cache = {}

    def img(self, n):
        if n not in self._cache:
            for fo in self.folders:
                p = os.path.join(fo, n + ".png")
                if os.path.exists(p): self._cache[n] = Image.open(p).convert("RGBA"); break
            else: raise FileNotFoundError(n)
        return self._cache[n]

    def seg(self, o, name, i, j, extras=()):
        wx, wy = 32 * i, 32 * j
        key = wx + wy + 16
        self.items.append((key, name, wx, wy))
        for k, e in enumerate(extras): self.items.append((key + 0.001 + 0.0001 * k, e, wx, wy))   # right after its segment, before the tile's other segment

    def post(self, name, x, y):
        self.items.append((x + y + 0.1, name, x, y))

    def fig(self, im, X, Y):
        """a figure standing at world (X, Y): feet at (24, 66) of its frame"""
        self.items.append((X + Y, ("fig", im), X, Y))

    def place(self, im, X, Y, ax, ay, key=None):
        self.items.append((X + Y if key is None else key, ("im", im, ax, ay), X, Y))

    def draw(self):
        for key, n, wx, wy in sorted(self.items, key=lambda t: t[0]):
            sx = self.org[0] + wx - wy; sy = self.org[1] + (wx + wy) / 2
            if isinstance(n, tuple):
                if n[0] == "fig": im, ax, ay = n[1], 24, 66
                else: im, ax, ay = n[1], n[2], n[3]
            else:
                im = self.img(n); ax, ay = self.A[n]["anchor_px"]
            self.c.alpha_composite(im, (int(round(sx - ax)), int(round(sy - ay))))
        self.items = []
        return self.c


def x3(im): return im.resize((im.width * 3, im.height * 3), Image.NEAREST)
