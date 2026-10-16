"""Tilled farm soil (64x32 diamond, 4 variants, furrows continuous across every edge) and
still water (128x64 seamless world texture). Hard pixels, flat (engine lights them)."""
import os, json
import numpy as np
from PIL import Image
from ground import tileable_noise

D = os.path.dirname(os.path.abspath(__file__))
OUT = D + "/out/farm_water"; os.makedirs(OUT, exist_ok=True)

def hx(s): s = s.lstrip("#"); return np.array([int(s[i:i + 2], 16) for i in (0, 2, 4)], np.uint8)

# ------------------------------------------------------------------ farm
SOIL = {"trough": "#2a1d14", "shade": "#3a2a1d", "base": "#4a3524", "lit": "#58402c", "crest": "#664b34",
        "crumb_d": "#33251a", "crumb_l": "#6e5239", "stone": "#7a7268", "stone_d": "#55504a"}
# one furrow = 8 world units across (4 per tile, so the pattern repeats exactly every tile).
# Furrows run along world X ("\" on screen). Cross-section along Y, light from +Y (top-left):
#   0 trough, 1-2 rising face turned away (shade), 3-4 crest, 5-6 falling face toward light, 7 base
PROFILE = ["trough", "shade", "shade", "crest", "crest", "lit", "lit", "base"]


def world_grid():
    py, px = np.mgrid[0:32, 0:64]
    sx, sy = px + 0.5 - 32, py + 0.5
    X, Y = sy + sx / 2, sy - sx / 2
    m = (X >= 0) & (X < 32) & (Y >= 0) & (Y < 32)
    return X, Y, m


def hsh(*a):
    out = None
    for i, v in enumerate(a):
        v = np.asarray(v).astype(np.int64)
        out = v * (73856093 + 19349663 * i) if out is None else out ^ (v * (83492791 + 2654435761 * i))
    return (out ^ (out >> 13)) & 0xFFFF


def farm_tile(v, rows="tlbr"):
    X, Y, m = world_grid()
    if rows == "trbl":   # furrows along world Y: swap the axes, and the lit face is now the one facing -X
        X, Y = Y, X
    xi, yi = np.floor(X).astype(int), np.floor(Y).astype(int)
    ry = yi % 8; row = yi // 8
    out = np.zeros((32, 64, 3), np.uint8)
    prof = PROFILE if rows == "tlbr" else ["trough", "lit", "lit", "crest", "crest", "shade", "shade", "base"]
    for k, name in enumerate(prof):
        out[ry == k] = hx(SOIL[name])
    # the crest wobbles a little along the furrow so the rows look hand-dug, not ruled.
    # wobble is a function of world X only (period 32), so it matches across every edge.
    wob = ((xi * 7 + row * 3) % 11 == 0) | ((xi * 5 + row) % 13 == 0)
    out[(ry == 3) & wob] = hx(SOIL["lit"])
    out[(ry == 2) & wob] = hx(SOIL["crest"])
    # crumbs: single dark/light earth flecks on the faces (variant-specific, sparse)
    cr = hsh(xi, yi, v) % 23
    out[(cr == 0) & ((ry == 5) | (ry == 6))] = hx(SOIL["crumb_d"])
    out[(cr == 1) & ((ry == 1) | (ry == 2))] = hx(SOIL["crumb_l"])
    # clods: 3x2 lumps sitting on crests, kept 3 units clear of the tile edge so none get cut
    rng = np.random.default_rng(200 + v)
    for _ in range(rng.integers(2, 5)):
        cx = int(rng.integers(4, 26)); r = int(rng.integers(0, 4)); cy = r * 8 + 3
        body = (xi >= cx) & (xi < cx + 3) & ((yi == cy) | (yi == cy + 1))
        out[body] = hx(SOIL["lit"])
        out[body & (yi == cy) & (xi == cx + 1)] = hx(SOIL["crumb_l"])
        out[(xi >= cx) & (xi < cx + 3) & (yi == cy + 2)] = hx(SOIL["trough"])     # its shadow down the face
    # an odd stone turned up by the hoe in some variants
    if v in (1, 3):
        sx_, sr = int(rng.integers(6, 24)), int(rng.integers(0, 4))
        out[(xi >= sx_) & (xi < sx_ + 2) & (yi == sr * 8 + 5)] = hx(SOIL["stone"])
        out[(xi >= sx_) & (xi < sx_ + 2) & (yi == sr * 8 + 6)] = hx(SOIL["stone_d"])
    rgba = np.zeros((32, 64, 4), np.uint8); rgba[..., :3] = out; rgba[..., 3] = m * 255
    rgba[~m] = 0
    return Image.fromarray(rgba, "RGBA")


# ------------------------------------------------------------------ water
WATER = ["#293f4c", "#2c4451", "#304957"]                  # deep .. lighter patches, close in value
RIPPLE, RIPPLE_HI, SHEEN = "#4a6b7c", "#6f8e9c", "#3b5a6b"


def water(W=128, H=64, seed=7):
    def tn(cx, cy, sd):
        r = np.random.default_rng(sd); g = r.random((cy, cx)); yy, xx = np.mgrid[0:H, 0:W]
        fx, fy = xx / W * cx, yy / H * cy; x0, y0 = np.floor(fx).astype(int), np.floor(fy).astype(int)
        tx, ty = fx - x0, fy - y0; tx, ty = tx * tx * (3 - 2 * tx), ty * ty * (3 - 2 * ty)
        a, b = g[y0 % cy, x0 % cx], g[y0 % cy, (x0 + 1) % cx]; c, d = g[(y0 + 1) % cy, x0 % cx], g[(y0 + 1) % cy, (x0 + 1) % cx]
        return (a * (1 - tx) + b * tx) * (1 - ty) + (c * (1 - tx) + d * tx) * ty
    # patches twice as wide as tall, matching the 2:1 view of a flat surface
    n = 0.65 * tn(3, 3, seed) + 0.35 * tn(6, 6, seed + 1)
    n = (n - n.min()) / (n.max() - n.min())
    idx = np.digitize(n, [0.38, 0.68])
    out = np.stack([hx(c) for c in WATER])[idx]
    rng = np.random.default_rng(seed)
    def hline(x, y, ln, col):
        for k in range(ln): out[y % H, (x + k) % W] = hx(col)
    # ripple dashes: short horizontal glints (flat water seen at 2:1 reads in horizontal strokes),
    # loosely grouped in drifting 2:1 diagonals, more of them over the lighter patches
    for _ in range(26):
        x, y = int(rng.integers(0, W)), int(rng.integers(0, H))
        for g in range(int(rng.integers(1, 4))):
            ln = int(rng.integers(3, 7))
            yy = y + g * 2; xx = x + g * 4 + int(rng.integers(-1, 2))
            bright = n[yy % H, xx % W] > 0.6
            hline(xx, yy, ln, RIPPLE if not bright else RIPPLE_HI if rng.random() < 0.35 else RIPPLE)
    # a few long, faint sheen bands (sky reflection), 1 px tall
    for _ in range(5):
        x, y = int(rng.integers(0, W)), int(rng.integers(0, H))
        hline(x, y, int(rng.integers(10, 18)), SHEEN)
    rgba = np.zeros((H, W, 4), np.uint8); rgba[..., :3] = out; rgba[..., 3] = 255
    return Image.fromarray(rgba, "RGBA")


if __name__ == "__main__":
    for v in range(4):
        farm_tile(v).save(f"{OUT}/farm_soil_{v}.png")
        farm_tile(v, "trbl").save(f"{OUT}/farm_soil_trbl_{v}.png")
    water().save(f"{OUT}/water_128x64.png")
    print("ok")
