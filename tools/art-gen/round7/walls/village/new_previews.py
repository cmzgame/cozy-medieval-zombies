"""The two pictures docs/art/13 adds (2026-10-27), assembled like the other previews from the PNGs and anchors alone:
  place_crates:  a wall run with the engine's dev crate (a one-tile cube, 32 px tall: a plain outlined brown box drawn
                 here with iso3d, not game art) stacked three high before it and two high after its door: three
                 reach the cap, two the door's top.
  place_doorway: the figure (48 to the crown; 55 with the mohawk, the tallest hair) standing in an open doorway and
                 beside a window, north and west, every wall material; the 80 px set beside the 96 for the old look.
Sort keys as placement_preview: segment = X + Y of its midpoint, post = vertex + 0.1, near leaves = segment + 0.5,
anything standing on the ground (a crate, a figure) = X + Y of its footprint's front-most point it stands on."""
import json, os
import numpy as np
from PIL import Image, ImageDraw
from iso3d import Scene, flat, hx
from preview_kit import grass_field, figure, FEET
from village import H_WALL, DOOR, WIN, OUTLINE

D = os.path.dirname(os.path.abspath(__file__))
WALLS = os.path.dirname(os.path.dirname(D))
V = os.environ.get("WALL_OUT", os.path.join(WALLS, "out"))
OLD = os.path.join(WALLS, "ref", "data", "art", "village")
PRE = os.path.join(V, "previews"); os.makedirs(PRE, exist_ok=True)
A_NEW = {**json.load(open(f"{V}/anchors_walls.json")), **json.load(open(f"{V}/anchors_woods.json"))}
A_OLD = {**json.load(open(os.path.join(WALLS, "ref", "tools", "art-gen", "village", "anchors_walls.json"))),
         **json.load(open(os.path.join(WALLS, "ref", "tools", "art-gen", "woods_rugs_paintings", "woods", "anchors_woods.json")))}


def crate():
    """the dev crate: a full tile, 32 tall, flat brown faces with a darker 1 px rim, outlined"""
    s = Scene()
    def face(base, rim):
        b, r = hx(base), hx(rim)
        def sh(P, u, v):
            out = np.broadcast_to(b, (len(P), 3)).copy()
            edge = (u < 1 / 32 * 1.5) | (u > 1 - 1 / 32 * 1.5) | (v < 1 / 32 * 1.5) | (v > 1 - 1 / 32 * 1.5)
            band = np.abs(v - 0.5) < 1 / 32       # one board line round the middle
            out[edge | band] = r
            return out
        return sh
    s.box(0, 0, 0, 32, 32, 32, top=face("#9a7448", "#7d5a3c"), left=face("#7d5a3c", "#5e4028"), right=face("#5a3f28", "#3e2a1c"))
    sp = s.render(origin_world=(0, 0, 0)); sp.outline(OUTLINE)
    im, anc = sp.image()
    return im, anc


class Canvas:
    def __init__(self, W, H):
        self.c = grass_field(W, H); self.items = []

    def add(self, key, im, anchor, org, X, Y, Z=0):
        self.items.append((key, im, anchor, org, X, Y, Z))

    def wall(self, folder, A, name, org, X, Y, key_off=0.0):
        im = Image.open(f"{folder}/{name}.png").convert("RGBA")
        self.add(X + Y + 16 + key_off, im, A[name]["anchor_px"], org, X, Y)

    def post(self, folder, A, name, org, X, Y):
        im = Image.open(f"{folder}/{name}.png").convert("RGBA")
        self.add(X + Y + 0.1, im, A[name]["anchor_px"], org, X, Y)

    def draw(self):
        for key, im, (ax, ay), org, X, Y, Z in sorted(self.items, key=lambda t: t[0]):
            sx = org[0] + X - Y; sy = org[1] + (X + Y) / 2 - Z
            self.c.alpha_composite(im, (int(round(sx - ax)), int(round(sy - ay))))
        self.items = []
        return self.c


def crates_picture():
    """a north run per row (stone, oak, log): three crates on the tile in front of its first segment, their top flush with
    the cap; two on the next tile, their top level with the door's top beside them; the figure beside the window."""
    cim, canc = crate()
    rows = ["stone", "wood", "log"]
    W, H = 330, 140 + (len(rows) - 1) * 170 + 120
    cv = Canvas(W, H)
    run = ["plain", "plain", "door_open", "plain", "window_open", "plain"]
    for r, m in enumerate(rows):
        org = (70, 140 + r * 170)
        for i, v in enumerate(run):
            cv.wall(V, A_NEW, f"wall_{m}_north_{v}", org, 32 * i, 0)
            if v == "door_open": cv.wall(V, A_NEW, f"door_open_{m}_north", org, 32 * i, 0, key_off=0.5)
            if v == "window_open":
                for s_ in ("left", "right"): cv.wall(V, A_NEW, f"shutter_{s_}_{m}_north", org, 32 * i, 0, key_off=0.5)
        cv.post(V, A_NEW, f"post_{m}", org, 0, 0); cv.post(V, A_NEW, f"post_{m}", org, 32 * len(run), 0)
        # a crate on tile (i, 0) stands in front of segment i; key: its front-most ground point, X + Y = 32 i + 32
        for k in range(3): cv.add(32 + 0.01 * k, cim, canc, org, 0, 0, Z=32 * k)
        for k in range(2): cv.add(64 + 0.01 * k, cim, canc, org, 32, 0, Z=32 * k)
        cv.add(1000, figure("hair_crop"), FEET, org, 32 * 3 + 14, 14)       # before the plain segment beside the window
        cv.draw()
    return cv.c


def doorway_picture():
    """each material: north door with the figure in it, then the window with the figure before it; the 80 set first
    (oak and stone only, for the old look), then the 96 set for all eight"""
    mats = ["wood", "stone", "log", "spruce", "mahogany", "winterpine", "bloodbark", "daub"]
    panels = [("80", OLD, A_OLD, "wood"), ("80", OLD, A_OLD, "stone")] + [("96", V, A_NEW, m) for m in mats]
    pw = 96
    W, H = len(panels) * pw + 20, 2 * 150 + 10
    cv = Canvas(W, H)
    for p, (tag, folder, A, m) in enumerate(panels):
        pm = "wood" if m == "daub" else m
        # row 1: north door open, the figure in the doorway (feet on the edge line at the door's middle)
        org = (40 + p * pw, 128)
        cv.wall(folder, A, f"wall_{m}_north_door_open", org, 0, 0)
        cv.wall(folder, A, f"door_open_{pm}_north", org, 0, 0, key_off=0.5)
        cv.post(folder, A, f"post_{m}", org, 0, 0); cv.post(folder, A, f"post_{m}", org, 32, 0)
        cv.add(1000, figure("hair_mohawk"), FEET, org, 16, 4)        # on the threshold, drawn last
        # row 2: west window shut, the figure beside it
        org = (52 + p * pw, 128 + 150)
        cv.wall(folder, A, f"wall_{m}_west_window_shut", org, 0, 0)
        cv.post(folder, A, f"post_{m}", org, 0, 0); cv.post(folder, A, f"post_{m}", org, 0, 32)
        cv.add(1000, figure("hair_crop"), FEET, org, 24, 8)          # beside the window, a little out from the wall
        cv.draw()
        d = ImageDraw.Draw(cv.c); d.text((40 + p * pw - 22, 4), f"{tag} {m}", fill=(235, 230, 210, 255))
    return cv.c


def x3(im): return im.resize((im.width * 3, im.height * 3), Image.NEAREST)


if __name__ == "__main__":
    for name, fn in (("place_crates", crates_picture), ("place_doorway", doorway_picture)):
        im = fn(); im.save(f"{PRE}/{name}_1x.png"); x3(im).save(f"{PRE}/{name}_3x.png"); print(name, im.size)
