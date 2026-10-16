import os, sys, numpy as np
from PIL import Image
D = os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0, D)
from decals import grass_field
from trees_v2 import character
from ground import tileable_noise
O = D + "/out/farm_water"
P = D + "/out/pumpkin"
farm = [Image.open(f"{O}/farm_soil_{v}.png") for v in range(4)]
wat = np.array(Image.open(f"{O}/water_128x64.png"))
dirt = np.array(Image.open(D + "/out/ground/dirt_world_128x64.png"))

def seams():
    # raw tiling tests: 5x5 farm tiles in random variants, and 3x3 copies of the water texture
    W, H = 5 * 64 + 40, 5 * 32 + 40
    c = Image.new("RGBA", (W, H), (30, 30, 30, 255)); rng = np.random.default_rng(3)
    for i in range(5):
        for j in range(5):
            c.alpha_composite(farm[rng.integers(0, 4)], (W // 2 - 32 + (i - j) * 32, 10 + (i + j) * 16))
    w = Image.fromarray(np.tile(wat, (3, 3, 1)))
    out = Image.new("RGBA", (W + w.width + 20, max(H, w.height)), (30, 30, 30, 255))
    out.alpha_composite(c, (0, 0)); out.alpha_composite(w, (W + 20, 0))
    return out

def scene():
    W, H = 420, 230
    g = grass_field(W, H); a = np.array(g)
    org = (120, 40)
    yy, xx = np.mgrid[0:H, 0:W]
    # ---- farm plot: 4 x 3 tiles, edge cut raggedly (approximating the engine's cut)
    plot = np.zeros((H, W), bool); img = np.zeros((H, W, 4), np.uint8)
    rng = np.random.default_rng(5)
    for i in range(4):
        for j in range(3):
            t = np.array(farm[rng.integers(0, 4)])
            x0, y0 = org[0] + (i - j) * 32 - 32, org[1] + (i + j) * 16
            m = t[..., 3] > 0
            img[y0:y0 + 32, x0:x0 + 64][m] = t[m]; plot[y0:y0 + 32, x0:x0 + 64] |= m
    n = tileable_noise(W, H, 40, 9)
    edge = plot.copy()
    for _ in range(2):
        p = np.pad(edge, 1); edge = edge & p[:-2, 1:-1] & p[2:, 1:-1] & p[1:-1, :-2] & p[1:-1, 2:]
    keep = edge | (plot & (n > 0.45))
    a[keep] = img[keep]
    # ---- pond: blob mask, dirt bank around, darker wet band inside
    cx, cy = 300, 150
    d = np.sqrt(((xx - cx) / 70) ** 2 + ((yy - cy) / 35) ** 2) + (tileable_noise(W, H, 24, 4) - 0.5) * 0.35
    water_m = d < 0.85; bank = (d < 1.0) & ~water_m
    a[bank] = np.tile(dirt, (H // 64 + 1, W // 128 + 1, 1))[:H, :W][bank]
    wt = np.tile(wat, (H // 64 + 1, W // 128 + 1, 1))[:H, :W]
    a[water_m] = wt[water_m]
    wet = water_m & ~(d < 0.80)
    a[wet, :3] = (a[wet, :3] * 0.72).astype(np.uint8)
    out = Image.fromarray(a)
    # crops standing on the soil
    for (n_, i, j) in (("pumpkin_0", 0.6, 0.5), ("jackolantern_left", 1.6, 1.6), ("pumpkin_1", 2.7, 0.6), ("pumpkin_0", 3.3, 2.4)):
        im = Image.open(f"{P}/{n_}.png"); wx, wy = 32 * i, 32 * j
        sx, sy = org[0] + wx - wy, org[1] + (wx + wy) / 2
        out.alpha_composite(im, (int(sx - im.width / 2), int(sy - im.height + 6)))
    ch = character(); out.alpha_composite(ch, (210, 150))
    return out

for name, fn in (("preview_seams", seams), ("preview_scene", scene)):
    im = fn(); im.save(f"{O}/{name}_1x.png"); im.resize((im.width * 3, im.height * 3), Image.NEAREST).save(f"{O}/{name}_3x.png")
print("ok")
