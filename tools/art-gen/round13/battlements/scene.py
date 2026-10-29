"""Scenes for the preview: pieces composed per pixel by depth (X + Y + Z, nearest wins), as the cliffs round did.
The village stone wall, its post and its floor are the repo's own pictures; their depth comes from a box of their own shape."""
import math
import numpy as np
from PIL import Image
from core import Box, render

REPO = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", "..", ".."))  # the repo root: tools/art-gen/roundN/name/   # read only
VIL = REPO + "/data/art/village/"
STOREY = 96


def load(p):
    return np.array(Image.open(p).convert("RGBA"))


def figure():
    """the bare body from data/art/character/preview_skins_3x.png taken back to 1x (art rounds 8 and 10's crop), 53 px tall"""
    im = load(REPO + "/data/art/character/preview_skins_3x.png")
    bg = im[2, 2, :3].astype(int)
    small = im[260:460, 170:310][1::3, 1::3].copy()
    a = np.abs(small[..., :3].astype(int) - bg).sum(-1) > 6
    small[..., 3] = np.where(a, 255, 0)
    ys = np.where(a.any(1))[0]
    xs = np.where(a.any(0))[0]
    return small[ys.min():ys.max() + 1, xs.min():xs.max() + 1]


def floor_world():
    py, px = np.mgrid[0:32, 0:64]
    sx = px + 0.5 - 32
    sy = py + 0.5 - 16
    return 16 + sy + sx / 2, 16 + sy - sx / 2


def proxy_depth(img, boxes, ax, ay, grow=0.5):
    """per-pixel depth for a repo picture (anchored at (ax, ay)) from boxes of its shape, a little grown so its rim is covered;
    pixels the boxes still miss take the nearest depth found (a rim pixel)"""
    h, w = img.shape[:2]
    gb = [Box(b.x0 - grow, b.x1 + grow, b.y0 - grow, b.y1 + grow, b.z0, b.z1 + grow * 0.5) for b in boxes]
    _, dep, _ = render(gb, ax, ay, w, h)
    op = img[..., 3] > 0
    need = op & np.isnan(dep)
    if need.any():
        for _ in range(6):
            for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                sh = np.roll(dep, (dy, dx), (0, 1))
                m = need & np.isnan(dep) & ~np.isnan(sh)
                dep[m] = sh[m]
            need = op & np.isnan(dep)
    return dep


class Canvas:
    def __init__(self, W, H, ox, oy, bg=(48, 46, 44)):
        self.rgb = np.zeros((H, W, 3), np.uint8)
        self.rgb[:] = bg
        self.z = np.full((H, W), -1e9)
        self.ox, self.oy = ox, oy

    def put(self, img, x, y, depth):
        h, w = img.shape[:2]
        H, W = self.z.shape
        x0, y0 = max(0, x), max(0, y)
        x1, y1 = min(W, x + w), min(H, y + h)
        if x1 <= x0 or y1 <= y0:
            return
        sub = img[y0 - y:y1 - y, x0 - x:x1 - x]
        dep = np.broadcast_to(depth, (h, w))[y0 - y:y1 - y, x0 - x:x1 - x]
        dep = np.nan_to_num(dep, nan=-1e9)
        m = (sub[..., 3] > 127) & (dep > self.z[y0:y1, x0:x1])
        self.rgb[y0:y1, x0:x1][m] = sub[..., :3][m]
        self.z[y0:y1, x0:x1][m] = dep[m]

    def at(self, X, Y, Z=0):
        return int(math.floor(X - Y)) + self.ox, int(math.floor((X + Y) / 2 - Z)) + self.oy

    def piece(self, img, dep, anchor, X, Y, Z=0, bias=0.0):
        cx, cy = self.at(X, Y, Z)
        self.put(img, cx - anchor[0], cy - anchor[1], dep + X + Y + Z + bias)

    def tile(self, img, tx, ty, Z=0, bias=0.0):
        Xf, Yf = floor_world()
        X0, Y0 = tx * 32, ty * 32
        dep = Xf + Yf + X0 + Y0 + Z + bias
        cx, cy = self.at(X0 + 16, Y0 + 16, Z)
        self.put(img, cx - 32, cy - 16, dep)

    def fig(self, fimg, X, Y, Z):
        fh, fw = fimg.shape[:2]
        cx, cy = self.at(X, Y, Z)
        rows = np.arange(fh)[:, None]
        dep = X + Y + Z + (fh - 1 - rows) + np.zeros((1, fw))
        self.put(fimg, cx - fw // 2, cy - fh + 1, dep + 0.5)


# ---- the repo's own stone pieces, with their depth
class Repo:
    def __init__(self):
        self.wn = load(VIL + "wall_stone_north_plain.png")       # anchor (8, 100): the tile's top vertex at the ground
        self.ww = load(VIL + "wall_stone_west_plain.png")        # anchor (40, 100)
        self.post = load(VIL + "post_stone.png")                 # anchor (18, 107): the vertex
        self.floors = [load(VIL + f"floor_stone_{i}.png") for i in range(4)]
        self.grass = [load(REPO + f"/data/art/ground/grass_{i}.png") for i in range(4)]
        self.dn = proxy_depth(self.wn, [Box(0, 32, -8, 8, 0, 96)], 8, 100)
        self.dw = proxy_depth(self.ww, [Box(-8, 8, 0, 32, 0, 96)], 40, 100)
        self.dp = proxy_depth(self.post, [Box(-9, 9, -9, 9, 0, 98)], 18, 107)
        self.fig = figure()
