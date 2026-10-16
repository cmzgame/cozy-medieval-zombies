"""Crops: potato, rye, cabbage, garlic, pumpkin x 3 stages (0 planted, 1 growing, 2 harvest)
x 2 row directions. One sprite = one farm tile's worth of plants, spaced along the furrow.
  tlbr: rows run top-left -> bottom-right on screen (along world X, like farm_soil_*)
  trbl: rows run top-right -> bottom-left (along world Y, like farm_soil_trbl_*)
Each plant is drawn in its own layer with its own dark outline (interactable style, like the
mushroom clusters), then composited back to front. Anchor: the tile's top vertex at ground level.
"""
import os, json, math
import numpy as np
from PIL import Image

D = os.path.dirname(os.path.abspath(__file__))
OUT = D + "/out/crops"; os.makedirs(OUT, exist_ok=True)

def hx(s): s = s.lstrip("#"); return np.array([int(s[i:i + 2], 16) for i in (0, 2, 4)], np.uint8)

OUTLINE = hx("#2b2522")
LEAF = [hx(c) for c in ("#34462c", "#4b6a3a", "#5f8445", "#7a9e52", "#98b866")]      # dark .. highlight
YLEAF = [hx(c) for c in ("#4a4422", "#6e6a2e", "#8c8a3c", "#aaa64e", "#c4bc68")]     # yellowing foliage
GOLD = [hx(c) for c in ("#5a4418", "#8a6a26", "#b08a36", "#cfa94c", "#e2c26a")]      # ripe rye
EARTH = [hx(c) for c in ("#2a1d14", "#3a2a1d", "#4a3524", "#58402c", "#664b34")]
SPUD = [hx(c) for c in ("#6a5034", "#8e7048", "#b0905e", "#c8aa74")]
CAB = [hx(c) for c in ("#4b6a3a", "#7c9a5a", "#9cb878", "#b8cc8e", "#d0dca6")]      # cabbage head
GARLIC = [hx(c) for c in ("#8a7e74", "#c2b8a6", "#e0d8c4", "#f0ead8")]
GPURPLE = hx("#8a6a86")
FLOWER = [hx("#b07a1e"), hx("#e0a838"), hx("#f0cc6a")]
STEM = [hx("#4a4a26"), hx("#6a6a34")]

W, H = 96, 80
ORG = (48, 14)            # canvas position of the tile's top vertex


def proj(X, Y, Z=0.0):
    return ORG[0] + X - Y, ORG[1] + (X + Y) / 2 - Z


class Layer:
    def __init__(self):
        self.col = np.zeros((H, W, 3), np.uint8); self.a = np.zeros((H, W), bool)

    def put(self, x, y, c):
        x, y = int(round(x)), int(round(y))
        if 0 <= x < W and 0 <= y < H: self.col[y, x] = c; self.a[y, x] = True

    def ellipse(self, cx, cy, rx, ry, ramp, tilt=0.75):
        """Shaded ellipse, light from the top-left; ramp: dark .. light (4-5 tones)."""
        yy, xx = np.mgrid[0:H, 0:W] + 0.5
        m = ((xx - cx) / rx) ** 2 + ((yy - cy) / ry) ** 2 <= 1
        t = ((xx - cx) / rx) * tilt + ((yy - cy) / ry) * 0.8
        n = len(ramp)
        th = np.linspace(0.9, -0.9, n - 1)          # high t -> darker
        idx = np.full((H, W), n - 1)
        for k, v in enumerate(th):
            idx[t > v] = np.minimum(idx[t > v], k)
        idx = np.where(t > th[0], 0, idx)
        for k in range(n):
            mm = m & (idx == k); self.col[mm] = ramp[k]; self.a |= mm
        return m

    def blade(self, bx, by, h, lean, ramp, width=1):
        """A grass-like blade from base (bx, by) up h px, curving by lean px at the tip."""
        for k in range(int(h)):
            t = k / max(1, h - 1)
            x = bx + lean * t * t
            c = ramp[1] if t < 0.35 else (ramp[2] if t < 0.75 else ramp[3])
            for w in range(width):
                self.put(x + w, by - k, c if w == 0 else ramp[1])

    def leaf(self, bx, by, ang, ln, wd, ramp):
        """Almond leaf from base point, angle in degrees (0 = right, 90 = up)."""
        a = math.radians(ang); ca, sa = math.cos(a), -math.sin(a)
        yy, xx = np.mgrid[0:H, 0:W] + 0.5
        u = (xx - bx) * ca + (yy - by) * sa; v = -(xx - bx) * sa + (yy - by) * ca
        t = np.clip(u / ln, 0, 1)
        half = wd / 2 * np.sin(np.pi * t) ** 0.8
        m = (u >= 0) & (u <= ln) & (np.abs(v) <= half)
        up = v * (-1 if sa > 0 else 1) < 0                        # half turned toward the light
        self.col[m] = ramp[2]; self.col[m & up] = ramp[3]
        rib = m & (np.abs(v) < 0.5) & (t > 0.15)
        self.col[rib] = ramp[1]
        self.a |= m
        return m

    def outline(self, ground_y=None):
        p = np.pad(self.a, 1)
        ring = ~self.a & (p[:-2, 1:-1] | p[2:, 1:-1] | p[1:-1, :-2] | p[1:-1, 2:])
        self.col[ring] = OUTLINE; self.a |= ring
        return self


# ------------------------------------------------------------------ plants: draw(layer, bx, by, rng)
def mound(L, bx, by, w=9, h=4):
    L.ellipse(bx, by - 1, w / 2, h / 2, EARTH[1:])


def potato(stage):
    def draw(L, bx, by, rng):
        mound(L, bx, by, 11 if stage else 9, 5 if stage else 4)
        if stage == 0:
            L.leaf(bx, by - 2, 120, 4, 3, LEAF); L.leaf(bx, by - 2, 50, 4, 3, LEAF)
        elif stage == 1:
            for (dx, dy, r) in ((-3, -6, 3.2), (3, -6, 3.2), (0, -9, 3.6), (-1, -5, 3)):
                L.ellipse(bx + dx, by + dy, r, r * 0.85, LEAF)
        else:
            # spuds peeking out of the hill
            for (dx, dy) in ((-4, 0), (3, 1)):
                L.ellipse(bx + dx, by + dy - 1, 2.6, 1.8, SPUD)
            for (dx, dy, r) in ((-5, -7, 3.6), (5, -7, 3.6), (0, -12, 4.2), (-2, -6, 3.4), (3, -10, 3.6)):
                L.ellipse(bx + dx, by + dy, r, r * 0.85, YLEAF if (dx + dy) % 3 == 0 else LEAF)
    return draw


def rye(stage):
    def draw(L, bx, by, rng):
        n = (5, 7, 6)[stage]; h = (5, 14, 19)[stage]
        ramp = LEAF if stage < 2 else GOLD
        for k in range(n):
            ox = (k - (n - 1) / 2) * (2.2 if stage == 2 else 1.6) + rng.uniform(-0.4, 0.4)
            hh = h * rng.uniform(0.78, 1.0); lean = (ox * 0.6) + rng.uniform(-1, 1)
            L.blade(bx + ox, by, hh, lean, ramp)
            if stage == 2:   # seed head: a 2px-wide ear at the top
                tx = bx + ox + lean; ty = by - hh
                for j in range(5):
                    L.put(tx + (j * lean / max(hh, 1)), ty - j + 1, GOLD[3] if j % 2 else GOLD[2])
                    L.put(tx + 1 + (j * lean / max(hh, 1)), ty - j + 1, GOLD[1])
                L.put(tx, ty - 5, GOLD[4])
            elif stage == 1 and k % 3 == 0:  # a leaf blade peeling off the stalk
                L.leaf(bx + ox, by - hh * 0.4, 30 if ox > 0 else 150, 5, 2, LEAF)
    return draw


def cabbage(stage):
    def draw(L, bx, by, rng):
        if stage == 0:
            for ang in (150, 90, 30):
                L.ellipse(bx + 3 * math.cos(math.radians(ang)), by - 2 - 2 * math.sin(math.radians(ang)), 2, 1.6, LEAF)
        elif stage == 1:
            for (dx, dy, rx, ry) in ((-5, -2, 4, 2.6), (5, -2, 4, 2.6), (0, -5, 4.4, 2.8), (-2, 0, 3.6, 2.2), (3, 0, 3.6, 2.2)):
                L.ellipse(bx + dx, by + dy, rx, ry, LEAF)
            L.ellipse(bx, by - 3, 2.6, 2.2, CAB)
        else:
            for (dx, dy, rx, ry) in ((-7, -2, 4.4, 2.8), (7, -2, 4.4, 2.8), (-4, 1, 4, 2.4), (4, 1, 4, 2.4)):
                L.ellipse(bx + dx, by + dy, rx, ry, LEAF)
            L.ellipse(bx, by - 5, 6.2, 5.2, CAB)
            # leaf veins on the head
            for k in range(3):
                L.put(bx - 2 + k * 2, by - 5 + (k % 2), CAB[1])
    return draw


def garlic(stage):
    def draw(L, bx, by, rng):
        if stage == 2:
            L.ellipse(bx, by - 1, 2.6, 2.2, GARLIC)
            L.put(bx + 1, by - 1, GPURPLE); L.put(bx + 1, by, GPURPLE)
        n = (2, 4, 5)[stage]; h = (5, 12, 13)[stage]
        ramp = LEAF if stage < 2 else YLEAF
        for k in range(n):
            ox = (k - (n - 1) / 2) * 1.4
            lean = ox * (1.2 if stage < 2 else 3.2) + rng.uniform(-0.6, 0.6)
            L.blade(bx + ox, by - (2 if stage == 2 else 0), h * rng.uniform(0.75, 1.0), lean, ramp, width=2 if stage else 1)
    return draw


def pumpkin_plant(stage, rows):
    def draw(L, bx, by, rng):
        if stage == 0:
            L.blade(bx, by, 3, 0, LEAF)
            L.ellipse(bx - 2, by - 3, 2, 1.4, LEAF); L.ellipse(bx + 2, by - 3, 2, 1.4, LEAF)
            return
        # vine trails along the row (within this tile only)
        dx, dy = (1.0, 0.5) if rows == "tlbr" else (-1.0, 0.5)
        span = 9 if stage == 1 else 15
        for k in range(-span, span + 1):
            L.put(bx + dx * k, by + dy * k - (1 if k % 5 == 0 else 0), STEM[1] if k % 2 else STEM[0])
        leaves = [(-span + 3, -2), (-2, -4), (span - 4, -1)] if stage == 1 else [(-span + 2, -3), (-span + 6, 1), (span - 2, -2), (span - 6, 2)]
        for (k, up) in leaves:
            L.ellipse(bx + dx * k, by + dy * k + up - 2, 4.2, 3.0, LEAF)
            L.put(bx + dx * k, by + dy * k + up - 2, LEAF[1])
        if stage == 1:
            L.ellipse(bx + dx * 4, by + dy * 4 - 3, 1.8, 1.6, FLOWER)
        # tendril curl
        tx, ty = bx + dx * (span + 1), by + dy * (span + 1)
        for (cx_, cy_) in ((0, 0), (1, -1), (1, -2), (0, -2)):
            L.put(tx + cx_ * (1 if rows == "tlbr" else -1), ty + cy_, STEM[1])
    return draw


def pumpkin_fruit(L, bx, by):
    import pumpkin2 as pk
    pk.R, pk.HH = 8.6, 6.8
    col, a, _ = pk.render("left", carved=False, lean_k=0.3)
    ys, xs = np.where(a)
    gy = pk.proj(0, 0, -pk.HH)[1]
    cx = pk.ORG[0]
    for y, x in zip(ys, xs):
        X, Y = int(bx + x - cx), int(by + y - gy)
        if 0 <= X < W and 0 <= Y < H: L.col[Y, X] = col[y, x]; L.a[Y, X] = True
    return L


# ------------------------------------------------------------------ compose a tile
PLANTS = {"potato": (2, potato), "rye": (3, rye), "cabbage": (2, cabbage), "garlic": (3, garlic)}


def tile(crop, stage, rows, seed=0):
    rng = np.random.default_rng(seed + 31 * stage + (7 if rows == "trbl" else 0))
    items = []
    if crop == "pumpkin":
        items.append((16, 16, pumpkin_plant(stage, rows)))
    else:
        n, fn = PLANTS[crop]
        for k in range(n):
            t = (k + 0.5) / n * 32
            X, Y = (t, 16) if rows == "tlbr" else (16, t)
            items.append((X, Y, fn(stage)))
    items.sort(key=lambda it: it[0] + it[1])
    col = np.zeros((H, W, 3), np.uint8); a = np.zeros((H, W), bool)
    for X, Y, fn in items:
        L = Layer(); bx, by = proj(X, Y)
        fn(L, bx, by, rng)
        L.outline()
        col[L.a] = L.col[L.a]; a |= L.a
    if crop == "pumpkin" and stage == 2:
        # the fruit sits beside the vine root, in front of it
        L = Layer(); bx, by = proj(17, 18)
        pumpkin_fruit(L, bx, by + 3)
        col[L.a] = L.col[L.a]; a |= L.a
    ys, xs = np.where(a)
    y0, y1, x0, x1 = ys.min(), ys.max() + 1, xs.min(), xs.max() + 1
    rgba = np.zeros((y1 - y0, x1 - x0, 4), np.uint8)
    rgba[..., :3] = col[y0:y1, x0:x1]; rgba[..., 3] = a[y0:y1, x0:x1] * 255
    return Image.fromarray(rgba, "RGBA"), [float(ORG[0] - x0), float(ORG[1] - y0)]


if __name__ == "__main__":
    anchors = {}
    for crop in ("potato", "rye", "cabbage", "garlic", "pumpkin"):
        for stage in range(3):
            for rows in ("tlbr", "trbl"):
                im, anc = tile(crop, stage, rows)
                name = f"crop_{crop}_{stage}_{rows}"
                im.save(f"{OUT}/{name}.png"); anchors[name] = {"anchor_px": anc, "size": list(im.size)}
    json.dump(anchors, open(f"{OUT}/anchors_crops.json", "w"), indent=1)
    print(len(anchors))
