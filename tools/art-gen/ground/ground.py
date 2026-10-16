"""Iso ground: 64x32 grass tile variants, decals, and a before/after mockup."""
import numpy as np, random, os, glob
from PIL import Image, ImageDraw

D = os.path.dirname(os.path.abspath(__file__)); OUT = D + "/out/ground"; os.makedirs(OUT, exist_ok=True)
TW, TH = 64, 32

def diamond():
    yy, xx = np.mgrid[0:TH, 0:TW]
    return (np.abs(xx - 31.5) / 32 + np.abs(yy - 15.5) / 16) <= 1.0
DM = diamond()

# grass ramp around the current in-game green (75,95,61)
G_DARK, G_SHADE, G_BASE, G_LIGHT, G_TIP = (52, 70, 44), (64, 84, 52), (75, 95, 61), (88, 110, 68), (104, 126, 76)

# ---------------------------------------------------------------- base tiles
def grass_tile(seed, density=1.0):
    """Mostly flat base with sparse blade ticks. Ticks avoid the outer 2px so the grid never shows."""
    rng = random.Random(seed)
    px = np.zeros((TH, TW, 4), np.uint8); px[DM] = (*G_BASE, 255)
    inner = DM.copy()
    for _ in range(2):
        p = np.pad(inner, 1); inner = inner & p[:-2,1:-1] & p[2:,1:-1] & p[1:-1,:-2] & p[1:-1,2:]
    ys, xs = np.where(inner)
    # soft blotches: 2-4 px clumps one step darker / lighter
    for _ in range(int(6 * density)):
        i = rng.randrange(len(ys)); y, x = ys[i], xs[i]; col = rng.choice((G_SHADE, G_SHADE, G_LIGHT))
        for dy, dx in ((0,0),(0,1),(0,-1),(1,0),(0,2)):
            if rng.random() < 0.75 and 0 <= y+dy < TH and 0 <= x+dx < TW and inner[y+dy, x+dx]:
                px[y+dy, x+dx, :3] = col
    # blade ticks: light tip over a dark root, 1px wide, pointing up
    for _ in range(int(16 * density)):
        i = rng.randrange(len(ys)); y, x = ys[i], xs[i]
        if y + 1 < TH and inner[y+1, x]:
            px[y, x, :3] = G_LIGHT if rng.random() < 0.7 else G_TIP
            px[y+1, x, :3] = G_SHADE
    return px

# ---------------------------------------------------------------- decals
def blank(w, h): return np.zeros((h, w, 4), np.uint8)
def put(a, x, y, c):
    if 0 <= y < a.shape[0] and 0 <= x < a.shape[1]: a[y, x] = (*c, 255)

def tuft(seed, w=11, h=8, ramp=(G_DARK, G_SHADE, G_LIGHT, G_TIP)):
    rng = random.Random(seed); a = blank(w, h); dark, shade, light, tip = ramp
    cx = w // 2
    blades = sorted(rng.sample(range(1, w - 1), min(w - 2, rng.choice((4, 5, 6)))))
    for bx in blades:
        bh = rng.randint(3, h - 1) if abs(bx - cx) <= 2 else rng.randint(2, h - 3)
        lean = -1 if bx < cx - 1 else (1 if bx > cx + 1 else 0)
        x = bx
        for k in range(bh):
            y = h - 1 - k
            if k == bh - 2 and lean: x += lean
            col = dark if k == 0 else (shade if k < bh // 2 else (light if k < bh - 1 else tip))
            put(a, x, y, col)
    return a

LEAF = {"yellow": ((156,114,38),(206,164,62),(232,198,96)),
        "orange": ((146,70,28),(198,108,42),(230,146,66)),
        "red":    ((112,38,28),(160,58,40),(196,88,58)),
        "brown":  ((84,60,36),(112,82,50),(138,104,66))}

def litter(seed, color, w=28, h=14, n=14):
    """Scatter of fallen leaves in an iso-flattened ellipse: 2x1 leaves with a darker under-pixel."""
    rng = random.Random(seed); a = blank(w, h); dark, base, light = LEAF[color]
    for _ in range(n):
        while True:
            x = rng.uniform(1, w - 3); y = rng.uniform(1, h - 2)
            if ((x - w/2) / (w/2)) ** 2 + ((y - h/2) / (h/2)) ** 2 < 0.9: break
        x, y = int(x), int(y)
        put(a, x, y, rng.choice((base, base, light))); put(a, x + 1, y, base)
        if rng.random() < 0.6: put(a, x + 1, y + 1, dark)
    return a

def pebbles(seed):
    rng = random.Random(seed); a = blank(12, 6)
    for _ in range(rng.choice((1, 2, 3))):
        x, y = rng.randrange(1, 8), rng.randrange(1, 4)
        for dx in range(3): put(a, x + dx, y + 1, (96, 98, 92))
        put(a, x, y + 1, (70, 72, 70)); put(a, x + 2, y + 1, (70, 72, 70))
        put(a, x + 1, y, (138, 140, 130)); put(a, x + 1, y + 2, (46, 52, 40))
    return a

def flowers(seed, col=(222, 210, 150)):
    rng = random.Random(seed); a = blank(14, 8)
    for _ in range(rng.choice((2, 3, 4))):
        x, y = rng.randrange(1, 13), rng.randrange(2, 7)
        put(a, x, y, G_SHADE); put(a, x, y - 1, col)
    return a

def mushroom(seed, cap=(170, 60, 44)):
    rng = random.Random(seed); a = blank(9, 8)
    for (x, s) in ((2, 1), (6, 0)) if rng.random() < 0.6 else ((4, 1),):
        stem = (214, 204, 178)
        put(a, x, 7, (60, 56, 46)); put(a, x, 6, stem); put(a, x, 5, stem)
        for dx in (-1, 0, 1): put(a, x + dx, 4, cap)
        if s:
            for dx in (-2, -1, 0, 1, 2): put(a, x + dx, 4, cap)
            for dx in (-1, 0, 1): put(a, x + dx, 3, cap)
            put(a, x - 1, 3, (220, 200, 180))
    return a

def twig(seed):
    rng = random.Random(seed); a = blank(14, 6); x, y = 1, rng.randrange(2, 4)
    for i in range(11):
        put(a, x + i, y, (96, 70, 46)); put(a, x + i, y + 1, (54, 38, 26))
        if i in (4, 8) and rng.random() < 0.7: put(a, x + i + 1, y - 1, (96, 70, 46))
        if rng.random() < 0.2: y += rng.choice((-1, 1)); y = max(1, min(4, y))
    return a

# ---------------------------------------------------------------- value noise
def vnoise(seed, scale):
    rng = np.random.default_rng(seed); g = rng.random((64, 64))
    def f(x, y):
        x, y = x / scale, y / scale; x0, y0 = int(np.floor(x)), int(np.floor(y)); fx, fy = x - x0, y - y0
        fx, fy = fx * fx * (3 - 2 * fx), fy * fy * (3 - 2 * fy)
        a, b = g[y0 % 64, x0 % 64], g[y0 % 64, (x0 + 1) % 64]
        c, d = g[(y0 + 1) % 64, x0 % 64], g[(y0 + 1) % 64, (x0 + 1) % 64]
        return (a * (1 - fx) + b * fx) * (1 - fy) + (c * (1 - fx) + d * fx) * fy
    return f

def tint(px, mul):
    out = px.copy(); m = out[:, :, 3] > 0
    out[m, :3] = np.clip(out[m, :3].astype(float) * mul, 0, 255).astype(np.uint8)
    return out

# ---------------------------------------------------------------- mockup
def load_trees():
    t = {}
    for f in glob.glob(D + "/out/tree_*.png"):
        k = os.path.basename(f)[5:-4]
        if k.endswith(("blue", "purple")): continue
        t[k] = Image.open(f).convert("RGBA")
    return t

def render(mode, N=16, seed=3):
    """mode: 'before' (flat checker) or 'after'."""
    rng = random.Random(seed)
    W = N * TW + 64; H = N * TH + 220
    img = Image.new("RGBA", (W, H), (30, 36, 26, 255))
    ox, oy = W // 2 - TW // 2, 180
    pos = lambda i, j: (ox + (i - j) * TW // 2, oy + (i + j) * TH // 2)
    trees = load_trees()
    # tree placement: forest dense on the right/top, clearing at left/bottom
    tree_cells = {}
    for i in range(N):
        for j in range(N):
            dens = 0.10 + 0.55 * max(0, (i - j) / N + 0.25)
            if rng.random() < dens * 0.55 and not (5 <= i <= 9 and 7 <= j <= 11):
                tree_cells[(i, j)] = rng.choice(list(trees))
    near = {}
    for (i, j), k in tree_cells.items():
        for di in range(-2, 3):
            for dj in range(-2, 3):
                d = abs(di) + abs(dj)
                if d <= 3: near.setdefault((i + di, j + dj), []).append((k, d))
    variants = [grass_tile(s) for s in range(4)] + [grass_tile(10 + s, 0.4) for s in range(2)]
    nA, nB = vnoise(seed, 5.0), vnoise(seed + 9, 2.2)
    deco = []
    for i in range(N):
        for j in range(N):
            x, y = pos(i, j)
            if mode == "before":
                c = (75, 95, 61) if (i + j) % 2 else (82, 101, 67)
                t = np.zeros((TH, TW, 4), np.uint8); t[DM] = (*c, 255)
            else:
                h = (i * 73856093 ^ j * 19349663) & 0xffff
                t = variants[h % len(variants)]
                if h & 1: t = t[:, ::-1]
                # low-frequency patchiness: lush <-> dry, plus darker forest floor near trees
                v = nA(i, j) * 0.7 + nB(i, j) * 0.3
                canopy = sum(1.0 / (1 + d) for _, d in near.get((i, j), []))
                mul = np.array([0.88 + 0.24 * v, 0.90 + 0.18 * v, 0.92 + 0.10 * v]) * (1 - min(0.20, canopy * 0.07))
                mul = mul * (1.02 if (i + j) % 2 else 1.0)  # checker kept, ~2% instead of ~7%
                t = tint(t, mul)
                # decals
                r = random.Random(h)
                nb = near.get((i, j), [])
                if nb:
                    k, d = min(nb, key=lambda z: z[1]); col = k.split("_")[-1]
                    col = col if col in LEAF else "brown"
                    for _ in range(max(0, 3 - d) + (r.random() < 0.5)):
                        deco.append((y + 16, litter(r.randrange(999), col if r.random() < 0.8 else "brown"),
                                     x + r.randrange(8, 34), y + r.randrange(4, 18)))
                    if r.random() < 0.25: deco.append((y + 16, twig(r.randrange(99)), x + r.randrange(16, 40), y + r.randrange(8, 20)))
                    if r.random() < 0.10: deco.append((y + 20, mushroom(r.randrange(99)), x + r.randrange(20, 40), y + r.randrange(6, 16)))
                else:
                    if r.random() < 0.18: deco.append((y + 16, litter(r.randrange(999), r.choice(list(LEAF)), n=5, w=18, h=9), x + r.randrange(10, 40), y + r.randrange(6, 18)))
                    if r.random() < 0.10: deco.append((y + 16, flowers(r.randrange(99)), x + r.randrange(16, 40), y + r.randrange(8, 20)))
                if r.random() < 0.45:
                    for _ in range(r.choice((1, 1, 2))):
                        tf = tuft(r.randrange(999), w=r.choice((7, 9, 11)), h=r.choice((5, 6, 8)))
                        deco.append((y + 24, tf, x + r.randrange(14, 44), y + r.randrange(4, 22)))
                if r.random() < 0.06: deco.append((y + 16, pebbles(r.randrange(99)), x + r.randrange(16, 40), y + r.randrange(8, 20)))
            tile = Image.fromarray(t, "RGBA"); img.alpha_composite(tile, (x, y))
    # flat decals (litter, pebbles, flowers) go straight onto the ground; tufts/mushrooms sort with trees
    sprites = []
    for (sy, a, x, y) in deco:
        im = Image.fromarray(a, "RGBA")
        if a.shape[0] >= 8 and a.shape[1] <= 11: sprites.append((y + im.height, im, x, y))
        else: img.alpha_composite(im, (x, y))
    shadow = Image.new("RGBA", img.size, (0, 0, 0, 0)); sd = ImageDraw.Draw(shadow)
    for (i, j), k in tree_cells.items():
        x, y = pos(i, j); t = trees[k]; bx, by = x + TW // 2, y + TH // 2
        sd.ellipse((bx - t.width * 0.42, by - 7, bx + t.width * 0.42, by + 9), fill=(0, 0, 0, 70))
        sprites.append((by, t, bx - t.width // 2, by - t.height + 3))
    img.alpha_composite(shadow)
    ch = Image.open(D + "/out/character_s.png").convert("RGBA")
    x, y = pos(7, 9); sprites.append((y + 16, ch, x + 32 - ch.width // 2, y + 18 - ch.height))
    for _, im, x, y in sorted(sprites, key=lambda s: s[0]): img.alpha_composite(im, (x, y))
    return img.crop((96, 120, W - 96, H - 40))

if __name__ == "__main__":
    for s in range(4): Image.fromarray(grass_tile(s), "RGBA").save(f"{OUT}/grass_{s}.png")
    for s in range(2): Image.fromarray(grass_tile(10 + s, 0.4), "RGBA").save(f"{OUT}/grass_sparse_{s}.png")
    for s in range(4): Image.fromarray(tuft(s * 7 + 1, w=(7, 9, 11, 11)[s], h=(5, 6, 8, 7)[s]), "RGBA").save(f"{OUT}/tuft_{s}.png")
    for c in LEAF:
        for s in range(2): Image.fromarray(litter(s * 31 + len(c), c), "RGBA").save(f"{OUT}/litter_{c}_{s}.png")
    for s in range(2):
        Image.fromarray(pebbles(s + 4), "RGBA").save(f"{OUT}/pebbles_{s}.png")
        Image.fromarray(flowers(s + 2), "RGBA").save(f"{OUT}/flowers_{s}.png")
        Image.fromarray(mushroom(s + 1), "RGBA").save(f"{OUT}/mushroom_{s}.png")
        Image.fromarray(twig(s + 3), "RGBA").save(f"{OUT}/twig_{s}.png")
    b, a = render("before"), render("after")
    b.save(f"{D}/out/ground_before.png"); a.save(f"{D}/out/ground_after.png")
    b.resize((b.width * 2, b.height * 2), Image.NEAREST).save(f"{D}/out/ground_before_2x.png")
    a.resize((a.width * 2, a.height * 2), Image.NEAREST).save(f"{D}/out/ground_after_2x.png")
    print(a.size)
