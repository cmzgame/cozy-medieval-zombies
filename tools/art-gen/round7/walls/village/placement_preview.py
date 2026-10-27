"""Placement test for building pieces (brief 18). Everything is placed from the PNGs + anchors only.
Sort rule used (and recommended): wall segment key = X + Y of its midpoint; post key = X + Y of its vertex;
near-side leaves/shutters/boards = their wall's key + 1 (drawn just after it); far-side leaves = wall key - 1.
"""
import json, os, sys
import numpy as np
from PIL import Image
D = os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0, D)
# 2026-10-27, docs/art/13: the grass from preview_kit; the walls from the 96 px delivery (out/); every canvas and row
# 16 px taller (DH) and every ground line 16 px lower, so the taller walls sit where the 80 px ones did.
from preview_kit import grass_field
from village import H_WALL

WALLS = os.path.dirname(os.path.dirname(D))
V = os.environ.get("WALL_OUT", os.path.join(WALLS, "out"))
PRE = os.path.join(V, "previews"); os.makedirs(PRE, exist_ok=True)
DH = H_WALL - 80
A = json.load(open(f"{V}/anchors_walls.json"))
_cache = {}


def img(n):
    if n not in _cache: _cache[n] = Image.open(f"{V}/{n}.png").convert("RGBA")
    return _cache[n]


class Board:
    def __init__(self, W, H, org):
        self.c = grass_field(W, H); self.org = org; self.items = []

    def seg(self, o, name, i, j, extras=(), alpha=1.0):
        """Segment on tile (i, j)'s north or west edge. extras: names drawn right after (leaves, boards)."""
        wx, wy = 32 * i, 32 * j
        key = wx + wy + 16
        self.items.append((key, name, wx, wy, alpha))
        for k, e in enumerate(extras):
            far = "_far" in e
            self.items.append((key - 0.5 if far else key + 0.5 + 0.01 * k, e, wx, wy, 1.0))

    def post(self, mat, x, y):
        self.items.append((x + y + 0.1, f"post_{mat}", x, y, 1.0))

    def draw(self):
        for key, n, wx, wy, al in sorted(self.items, key=lambda t: t[0]):
            im = img(n)
            if al < 1:
                a = np.array(im); a[..., 3] = (a[..., 3] * al).astype(np.uint8); im = Image.fromarray(a)
            ax, ay = A[n]["anchor_px"]
            self.c.alpha_composite(im, (int(round(self.org[0] + wx - wy - ax)), int(round(self.org[1] + (wx + wy) / 2 - ay))))
        self.items = []
        return self


VARS = ("plain", "door_shut", "door_open", "window_shut", "window_open")


def extras_for(mat, o, v):
    if v == "door_open": return [f"door_open_{mat}_{o}"]
    if v == "window_open": return [f"shutter_left_{mat}_{o}", f"shutter_right_{mat}_{o}"]
    return []


def alone():
    """(a) every segment variant alone on grass, both orientations, all three materials, plus posts."""
    W, H = 10 * 64 + 120, 3 * (120 + DH) + 20
    b = Board(W, H, (0, 0))
    for r, mat in enumerate(("wood", "stone", "log")):
        for k, (o, v) in enumerate([(o, v) for o in ("north", "west") for v in VARS]):
            b.org = (46 + k * 64 + (16 if o == "west" else 0), 106 + DH + r * (120 + DH))
            b.seg(o, f"wall_{mat}_{o}_{v}", 0, 0, extras_for(mat, o, v)); b.draw()
        b.org = (W - 40, 106 + DH + r * (120 + DH)); b.post(mat, 0, 0); b.draw()
    return b.c


def lines():
    """(b) mixed lines end to end, both orientations; (c) lone door and window segments with end posts."""
    W, H = 640, 300 + DH + 100     # +100: the west line's far end ran off the top (already so in the 80 set)
    b = Board(W, H, (60, 110 + DH))
    north = [("wood", "plain"), ("stone", "door_open"), ("wood", "plain"), ("stone", "plain"),
             ("log", "window_open"), ("stone", "plain"), ("log", "plain"), ("wood", "window_shut"), ("log", "plain")]
    for i, (mat, v) in enumerate(north):
        b.seg("north", f"wall_{mat}_north_{v}", i, 0, extras_for(mat, "north", v))
    # posts where the material changes along the line (recommended: thickness steps otherwise show)
    for i in range(1, len(north)):
        if north[i][0] != north[i - 1][0]:
            heavier = max(north[i][0], north[i - 1][0], key=lambda m: {"wood": 0, "log": 1, "stone": 2}[m])
            b.post(heavier, 32 * i, 0)
    b.draw()
    b.org = (W - 70, 40 + DH + 100)
    west = [("log", "plain"), ("wood", "door_shut"), ("log", "plain"), ("wood", "plain"), ("stone", "window_shut"),
            ("wood", "plain"), ("stone", "plain"), ("log", "door_open")]
    for j, (mat, v) in enumerate(west):
        b.seg("west", f"wall_{mat}_west_{v}", 0, j, extras_for(mat, "west", v))
    for j in range(1, len(west)):
        if west[j][0] != west[j - 1][0]:
            heavier = max(west[j][0], west[j - 1][0], key=lambda m: {"wood": 0, "log": 1, "stone": 2}[m])
            b.post(heavier, 0, 32 * j)
    b.draw()
    return b.c


def lone():
    """(c) a lone door and a lone window segment with nothing either side, then the same with end posts."""
    W, H = 12 * 70 + 40, 150 + DH
    b = Board(W, H, (0, 0)); x = 50
    for mat in ("wood", "stone", "log"):
        for v in ("door_shut", "window_shut"):
            b.org = (x, 128 + DH); b.seg("north", f"wall_{mat}_north_{v}", 0, 0); b.draw(); x += 66
            b.org = (x, 128 + DH); b.post(mat, 0, 0); b.seg("north", f"wall_{mat}_north_{v}", 0, 0); b.post(mat, 32, 0); b.draw(); x += 74
    return b.c


def corners():
    """(d) L corner of each material with its posts."""
    W, H = 620, 190 + DH
    b = Board(W, H, (0, 0)); x = 100
    for mat in ("wood", "stone", "log"):
        b.org = (x, 96 + DH)
        b.post(mat, 0, 0)
        b.seg("north", f"wall_{mat}_north_plain", 0, 0); b.seg("north", f"wall_{mat}_north_window_shut", 1, 0)
        b.seg("west", f"wall_{mat}_west_plain", 0, 0); b.seg("west", f"wall_{mat}_west_door_shut", 0, 1)
        b.post(mat, 64, 0); b.post(mat, 0, 64); b.draw()
        x += 200
    return b.c


def tees_and_mixed():
    W, H = 1220, 190 + DH
    b = Board(W, H, (0, 0)); x = 110
    for mat in ("wood", "stone", "log"):
        b.org = (x, 90 + DH)
        b.seg("north", f"wall_{mat}_north_plain", -1, 0); b.post(mat, 0, 0); b.seg("north", f"wall_{mat}_north_plain", 0, 0)
        b.seg("west", f"wall_{mat}_west_plain", 0, 0); b.seg("west", f"wall_{mat}_west_plain", 0, 1)
        b.post(mat, 0, 64); b.post(mat, 32, 0); b.post(mat, -32, 0); b.draw()
        x += 190
    for (m1, m2) in (("stone", "log"), ("log", "wood"), ("stone", "wood")):
        b.org = (x, 90 + DH)
        heavier = max(m1, m2, key=lambda m: {"wood": 0, "log": 1, "stone": 2}[m])
        b.post(heavier, 0, 0)
        b.seg("north", f"wall_{m1}_north_plain", 0, 0); b.seg("north", f"wall_{m1}_north_plain", 1, 0)
        b.seg("west", f"wall_{m2}_west_plain", 0, 0); b.seg("west", f"wall_{m2}_west_plain", 0, 1)
        b.post(m1, 64, 0); b.post(m2, 0, 64); b.draw()
        x += 200
    return b.c


def boards():
    """(e) door and window with 1, 2, 3 boards, open and shut behind them: all materials, north; log, west."""
    W, H = 12 * 58 + 80, 4 * (112 + DH) + 20
    b = Board(W, H, (0, 0))
    rows = [("wood", "north"), ("stone", "north"), ("log", "north"), ("log", "west")]
    for r, (mat, o) in enumerate(rows):
        k = 0
        for op, states in (("door", ("door_open", "door_shut")), ("window", ("window_open", "window_shut"))):
            for st in states:
                for n in (1, 2, 3):
                    b.org = (42 + k * 58 + (14 if o == "west" else 0), 100 + DH + r * (112 + DH))
                    ex = [f"boards_{op}_{o}_{n}"]
                    b.seg(o, f"wall_{mat}_{o}_{st}", 0, 0, ex); b.draw(); k += 1
    return b.c


def far_side():
    """(f) optional far-side leaves: behind a translucent wall (the only case they show)."""
    W, H = 640, 140 + DH
    b = Board(W, H, (0, 0)); x = 60
    for mat in ("wood", "stone", "log"):
        for o in ("north", "west"):
            b.org = (x, 118 + DH)
            b.seg(o, f"wall_{mat}_{o}_door_open", 0, 0, [f"door_open_far_{mat}_{o}"], alpha=0.5)
            b.draw(); x += 98
    return b.c


if __name__ == "__main__":
    out = {}
    for name, fn in (("place_alone", alone), ("place_lines", lines), ("place_lone", lone), ("place_corners", corners),
                     ("place_tees_mixed", tees_and_mixed), ("place_boards", boards), ("place_far", far_side)):
        im = fn(); im.save(f"{PRE}/{name}_1x.png"); im.resize((im.width * 3, im.height * 3), Image.NEAREST).save(f"{PRE}/{name}_3x.png")
        out[name] = im.size
    print(out)
