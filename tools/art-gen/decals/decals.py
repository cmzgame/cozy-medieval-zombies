"""Ground decals v2: fewer, bigger, readable pieces at 1:1 game scale.

Rules applied everywhere: light from the top-left; each piece has a lit side, a shade side and
a darkest-of-its-own-colour edge on its lower/outer side; at most 4 shades per piece; hard pixels
only. Flat things (leaves, twigs, pebbles) are foreshortened for 2:1 iso; upright things
(mushrooms, flowers, tufts) are seen from the front with their base on the bottom row.
"""
import numpy as np, random, os, math
from PIL import Image

D = os.path.dirname(os.path.abspath(__file__))
OUT = D + "/out/decals"; os.makedirs(OUT, exist_ok=True)

def hx(s): s = s.lstrip("#"); return tuple(int(s[i:i+2], 16) for i in (0, 2, 4))

# ------------------------------------------------------------------ palettes (edge, dark, mid, light)
LEAF = {
    "yellow": [hx(c) for c in ("#362812", "#9c7226", "#cea43e", "#e8c660")],
    "orange": [hx(c) for c in ("#3a1c0e", "#92461c", "#c66c2a", "#e69242")],
    "red":    [hx(c) for c in ("#301210", "#70261c", "#a03a28", "#c4583a")],
    "brown":  [hx(c) for c in ("#2e2014", "#543c24", "#705232", "#8a6842")],
}
STEM   = [hx(c) for c in ("#5e5444", "#a89c80", "#c2b79c", "#d6ccb2")]
CAP_RED   = LEAF["red"]
CAP_BROWN = LEAF["brown"]
CAP_TAN   = [hx(c) for c in ("#3c3226", "#8c7a5c", "#a8967a", "#c2b292")]
PEBBLE = [hx(c) for c in ("#4a433d", "#6a6058", "#756a61", "#8c8176")]
GRASS  = [hx(c) for c in ("#34462c", "#405434", "#4b5f3d", "#586e44", "#687e4c")]
BARK   = [hx(c) for c in ("#2a1c12", "#4e3824", "#6e5034", "#8c6a46")]
WOOD_END = hx("#a88a62")
CONTACT = hx("#2c3a25")   # 1px contact shadow under upright pieces (darker than the darkest grass)
BLOOM = {
    "cream":  [hx(c) for c in ("#5a5040", "#b4a888", "#d0c4a2", "#e6dcbe")],
    "yellow": [hx(c) for c in ("#5a4a20", "#b49a52", "#cdb66c", "#e2cf8c")],
    "purple": [hx(c) for c in ("#2e2236", "#5a4868", "#746084", "#8e7c9c")],
    "rust":   [hx(c) for c in ("#3a1c0e", "#86442a", "#a25a36", "#bc744c")],
    "blue":   [hx(c) for c in ("#1e2a3a", "#4a6078", "#627a92", "#7e96ac")],
}

# ------------------------------------------------------------------ canvas helpers
class C:
    def __init__(self, w, h):
        self.w, self.h = w, h
        self.px = np.zeros((h, w, 4), np.uint8)
        self.own = np.full((h, w), -1, int)       # which piece owns each pixel (for overlap edges)
    def set(self, m, col, owner=None):
        self.px[m] = (*col, 255)
        if owner is not None: self.own[m] = owner
    def crop(self):
        a = self.px[..., 3] > 0
        ys = np.where(a.any(1))[0]; xs = np.where(a.any(0))[0]
        return Image.fromarray(self.px[ys.min():ys.max()+1, xs.min():xs.max()+1], "RGBA")

def grid(h, w):
    yy, xx = np.mgrid[0:h, 0:w]; return yy + 0.5, xx + 0.5

def below_out(m):   # pixels of m whose pixel below is not in m
    b = np.zeros_like(m); b[:-1] = m[1:]; return m & ~b
def above_out(m):
    a = np.zeros_like(m); a[1:] = m[:-1]; return m & ~a
def right_out(m):
    r = np.zeros_like(m); r[:, :-1] = m[:, 1:]; return m & ~r
def left_out(m):
    l = np.zeros_like(m); l[:, 1:] = m[:, :-1]; return m & ~l

# ------------------------------------------------------------------ leaves
# Hand-drawn leaf stamps (light from top-left, already foreshortened for 2:1 iso).
# L light, M mid, D dark, E darkest edge (own colour), s stem (dark). '.' empty.
LEAF_STAMPS = [
    ["...LL..",
     ".LLLLM.",
     "sLMMMMD",
     "..DDDE."],          # pointed both ends, tip right, stem left
    ["..LL..",
     ".LLLLM",
     "MLMMMs",
     ".EDDD."],           # tip left, stem right
    ["...LLM",
     ".LLLDM",
     ".LLDMD",
     "LDDMDE",
     "sEEE.."],           # diagonal, tip up-right, midrib
    ["sLL...",
     ".DLLM.",
     ".LDDMM",
     "..MMDD",
     "...EEE"],           # diagonal, tip down-right, midrib
    ["....LM.",
     "..LLLMD",
     "sLLMMDE",
     "..DDE.."],          # slim, slightly raised tip
    [".LLM.",
     "LMMMD",
     ".EDE."],            # small
]
SHADE_SHIFT = {"L": "M", "M": "D", "D": "E", "E": "E", "s": "s"}

def stamp(c, idx, x0, y0, rows, pal, shaded):
    edge, dark, mid, light = pal
    cmap = {"L": light, "M": mid, "D": dark, "E": edge, "s": dark}
    if shaded: rows = ["".join(SHADE_SHIFT.get(ch, ch) for ch in row) for row in rows]
    prev = c.px[..., 3] > 0
    m = np.zeros((c.h, c.w), bool)
    for r, row in enumerate(rows):
        for k, ch in enumerate(row):
            if ch == ".": continue
            Y, X = y0 + r, x0 + k
            if 0 <= Y < c.h and 0 <= X < c.w:
                c.px[Y, X] = (*cmap[ch], 255); c.own[Y, X] = idx; m[Y, X] = True
    # where this leaf's top contour lies over an earlier leaf, draw a 1px edge so the two separate
    up = np.zeros_like(m); up[1:] = prev[:-1] & (c.own[:-1] != idx)
    sep = above_out(m) & up
    c.px[sep] = (*edge, 255)
    return m

def leaf_pile(pal, rng, W, H, n):
    c = C(W + 12, H + 12)
    cx, cy = (W + 12) / 2, (H + 12) / 2
    rx, ry = (W - 7) / 2, (H - 5) / 2
    pts = []
    for _ in range(600):
        if len(pts) >= n: break
        a = rng.uniform(0, 2 * math.pi); r = math.sqrt(rng.uniform(0, 1))
        x, y = cx + math.cos(a) * rx * r, cy + math.sin(a) * ry * r
        if all(((x - px_) / 4.6) ** 2 + ((y - py_) / 2.8) ** 2 > 1.0 for px_, py_ in pts):
            pts.append((x, y))
    pts.sort(key=lambda p: p[1])                         # back to front
    for i, (x, y) in enumerate(pts):
        st = rng.choice(LEAF_STAMPS)
        shaded = rng.random() < (0.45 if i < len(pts) / 2 else 0.1)
        stamp(c, i, int(x - len(st[0]) / 2), int(y - len(st) / 2), st, pal, shaded)
    return c.crop()

def leaf_scatter(pal, rng, n):
    c = C(24, 14)
    xs = [3, 8, 13][:n] if n > 2 else [3, 9]
    for i, x in enumerate(xs):
        st = rng.choice(LEAF_STAMPS)
        stamp(c, i, x + rng.randint(-1, 1), 4 + rng.randint(-2, 2), st, pal, rng.random() < 0.25)
    return c.crop()

# ------------------------------------------------------------------ mushrooms (upright)
def mushroom_one(c, idx, bx, by, stem_h, stem_w, cap_w, cap_h, cap_pal, spots=False, rng=None):
    yy, xx = grid(c.h, c.w)
    se, sd, sm, sl = STEM
    # stem: slightly tapered, lit left, shade right, darkest at right contour
    top = by - stem_h
    st = (yy >= top) & (yy < by) & (np.abs(xx - bx) <= stem_w / 2 + (yy - top) / stem_h * 0.5)
    c.set(st, sm, idx); c.set(st & (xx < bx - stem_w * 0.1), sl, idx)
    c.set(right_out(st) | (st & (yy > by - 1.5) & (xx > bx)), sd, idx)
    c.set(right_out(st) & (yy > by - 2.5), se, idx)
    # cap: upper half-ellipse plus a shallow underside lip
    ce, cd, cm, cl = cap_pal
    ccy = top + 1.0
    capm = (((xx - bx) / (cap_w / 2)) ** 2 + ((yy - ccy) / cap_h) ** 2 <= 1) & (yy <= ccy + 1.2)
    under = (np.abs(xx - bx) < cap_w / 2 - 1.2) & (yy > ccy + 1.2) & (yy <= ccy + 2.2)
    c.set(under, sd, idx)                                         # gill shadow under the cap
    c.set(capm, cm, idx)
    hl = (((xx - (bx - cap_w * 0.18)) / (cap_w * 0.30)) ** 2 + ((yy - (ccy - cap_h * 0.62)) / (cap_h * 0.36)) ** 2 <= 1) & capm
    c.set(hl, cl, idx)
    sh = capm & ((xx - bx) / (cap_w / 2) + (yy - ccy) / cap_h * 0.3 > 0.42)
    c.set(sh, cd, idx)
    c.set((below_out(capm) | right_out(capm)) & capm, ce, idx)     # darkest rim on lower/right
    c.set(left_out(capm) & (yy > ccy - 1), ce, idx)
    if spots:
        for (ox, oy, w) in ((-0.22, -0.45, 2), (0.18, -0.62, 2), (0.30, -0.18, 1), (-0.05, -0.10, 2)):
            x, y = int(bx + ox * cap_w), int(ccy + oy * cap_h)
            for dx in range(w):
                for dy in range(1 + (w == 2)):
                    if capm[y + dy, x + dx] and not (below_out(capm)[y + dy, x + dx]):
                        c.px[y + dy, x + dx] = (*(STEM[3] if oy < -0.3 else STEM[2]), 255)
    return st | capm

def mushroom(kind, rng):
    c = C(30, 30); base = 27; parts = []
    if kind == "toadstool":
        parts = [(15, 9, 4, 14, 6, CAP_RED, True)]
    elif kind == "red_cluster":
        parts = [(19, 7, 3, 10, 5, CAP_RED, True), (12, 10, 4, 13, 6, CAP_RED, True), (21, 3, 3, 8, 4, CAP_RED, False)]
    elif kind == "brown":
        parts = [(15, 10, 4, 12, 5, CAP_BROWN, False)]
    elif kind == "brown_cluster":
        parts = [(11, 6, 3, 10, 4, CAP_BROWN, False), (17, 11, 4, 12, 5, CAP_BROWN, False), (22, 4, 3, 8, 4, CAP_BROWN, False)]
    elif kind == "tan_cluster":
        parts = [(12, 7, 3, 9, 4, CAP_TAN, False), (17, 12, 3, 11, 4, CAP_TAN, False),
                 (21, 5, 3, 8, 3, CAP_TAN, False)]
    # tallest-at-back looks odd for clusters: draw in given order (back first)
    allm = np.zeros((c.h, c.w), bool)
    for i, (bx, sh, sw, cw, chh, pal, sp) in enumerate(parts):
        by = base - (1 if i == 0 and len(parts) > 1 else 0)
        allm |= mushroom_one(c, i, bx, by, sh, sw, cw, chh, pal, sp, rng)
    # 1px contact shadow
    cols = np.where(allm[base - 1])[0]
    if len(cols): c.px[base, cols.min() - 1:cols.max() + 2] = (*CONTACT, 255)
    return c.crop()

# ------------------------------------------------------------------ pebbles (flat)
def stone(c, idx, cx, cy, w, rng):
    e, d, m, l = PEBBLE
    yy, xx = grid(c.h, c.w)
    h = max(3, round(w * rng.uniform(0.55, 0.68)))
    sm = (((xx - cx) / (w / 2)) ** 2 + ((yy - cy) / (h / 2)) ** 2 <= 1)
    if sm.sum() < 6: return
    c.set(sm, m, idx)
    c.set(sm & (yy > cy + h * 0.08), d, idx)                                # lower half in shade
    top = sm & (((xx - (cx - w * 0.12)) / (w * 0.30)) ** 2 + ((yy - (cy - h * 0.28)) / (h * 0.22)) ** 2 <= 1)
    c.set(top, l, idx)                                                       # highlight on top
    c.set(below_out(sm) | (right_out(sm) & (yy > cy - h * 0.2)), e, idx)    # shadow underneath

def pebbles(n, rng):
    c = C(34, 18)
    spots = [(16, 9, 9)]
    for _ in range(n - 1):
        for _ in range(60):
            w = rng.randint(5, 7); x = rng.uniform(5, 28); y = rng.uniform(5, 13)
            if all(abs(x - a) > (w + b) / 2 + 0.5 or abs(y - y2) > 4 for a, y2, b in spots):
                spots.append((x, y, w)); break
    for i, (x, y, w) in enumerate(sorted(spots, key=lambda s: s[1])):
        stone(c, i, x, y, w, rng)
    return c.crop()

# ------------------------------------------------------------------ flowers (upright clumps)
BLOOM_SHAPES = {
    3: ["010", "111", "010"],
    4: ["0110", "1111", "0110"],
    5: ["01110", "11111", "11111", "01110"],
}
def flowers(colours, rng, n=5):
    """A small iso scatter: each plant stands at its own spot on the ground plane (an ellipse
    ~2:1), drawn back to front, so the clump has depth instead of sitting on one line."""
    c = C(34, 30)
    pts = []
    for _ in range(500):
        if len(pts) >= n: break
        a_ = rng.uniform(0, 2 * math.pi); r = math.sqrt(rng.uniform(0.05, 1))
        x, y = 17 + math.cos(a_) * 9.5 * r, 22 + math.sin(a_) * 4.8 * r
        if all(((x - px_) / 4.2) ** 2 + ((y - py_) / 2.4) ** 2 > 1 for px_, py_ in pts):
            pts.append((x, y))
    plants = []
    for i, (x, y) in enumerate(sorted(pts, key=lambda p: p[1])):
        plants.append((int(round(x)), int(round(y)), rng.choice((4, 5, 5)), rng.randint(4, 7), colours[i % len(colours)]))
    for bx, by, sz, h, col in plants:                       # back to front
        e, d, m, l = BLOOM[col]
        # contact pixel + two little leaves at the foot of the stem
        c.px[by + 1, bx - 1:bx + 2] = (*CONTACT, 255)
        c.px[by, bx - 2] = (*GRASS[3], 255); c.px[by, bx - 1] = (*GRASS[2], 255)
        c.px[by, bx + 1] = (*GRASS[1], 255); c.px[by, bx + 2] = (*GRASS[0], 255)
        c.px[by - 1, bx - 2] = (*GRASS[3], 255); c.px[by - 1, bx + 2] = (*GRASS[1], 255)
        for y in range(by - h, by + 1):                      # stem
            c.px[y, bx] = (*GRASS[1], 255)
        shp = BLOOM_SHAPES[sz]; hgt = len(shp)
        x0, y0 = bx - sz // 2, by - h - hgt + 1
        for r, row in enumerate(shp):
            for k, ch in enumerate(row):
                if ch != "1": continue
                col_ = l if (k < sz / 2 and r < hgt / 2) else m
                if r == hgt - 1 or k == sz - 1: col_ = d
                c.px[y0 + r, x0 + k] = (*col_, 255)
        if sz >= 4: c.px[y0 + hgt // 2, x0 + sz // 2] = (*e, 255)
        for k, ch in enumerate(shp[-1]):
            if ch == "1" and c.px[y0 + hgt, x0 + k, 3] == 0: c.px[y0 + hgt, x0 + k] = (*e, 255)
    return c.crop()

# ------------------------------------------------------------------ grass tufts (upright)
def tuft(rng, W, Hh, n):
    c = C(W + 8, Hh + 4); base = Hh + 1; cx = (W + 8) / 2
    blades = []
    for i in range(n):
        f = (i / (n - 1)) * 2 - 1                                  # -1 .. 1 across the tuft
        bx = cx + f * (W / 2 - 3) * 0.75 + rng.uniform(-0.6, 0.6)
        h = Hh * (1 - 0.35 * abs(f)) * rng.uniform(0.85, 1.0)
        lean = f * rng.uniform(2.5, 4.5)
        front = rng.random() < 0.5
        blades.append((front, bx, h, lean, f))
    for front, bx, h, lean, f in sorted(blades, key=lambda b: b[0]):   # back blades first
        shades = (GRASS[1], GRASS[2], GRASS[3]) if not front else (GRASS[2], GRASS[3], GRASS[4])
        if f < -0.2: shades = (shades[1], shades[2], GRASS[4])          # left blades catch the light
        for k in range(int(h)):
            t = k / h
            x = bx + lean * t ** 1.6
            y = base - 1 - k
            wid = 2 if t < 0.55 else 1
            col = shades[0] if t < 0.3 else (shades[1] if t < 0.75 else shades[2])
            if f > 0.15 and wid == 2: col = shades[0]               # right-leaning blades sit in shade
            for d in range(wid):
                X = int(round(x)) + d
                col2 = col if d == 0 else (GRASS[0] if f > 0.5 else shades[0])
                if wid == 1 and f > 0.5 and t < 0.9: col2 = shades[0]
                c.px[y, X] = (*col2, 255)
    row = np.where(c.px[base - 1, :, 3] > 0)[0]
    c.px[base - 1, row.min():row.max() + 1] = (*GRASS[0], 255)      # dark root line
    c.px[base, row.min() - 1:row.max() + 2] = (*CONTACT, 255)
    return c.crop()

# ------------------------------------------------------------------ twigs (flat)
def twig(rng, L, forks):
    c = C(L + 10, 16)
    e, d, m, l = BARK
    pts = []; x, y = 4.0, 8.0 + rng.uniform(-1, 1); slope = rng.uniform(-0.18, 0.18)
    for k in range(L):
        pts.append((int(round(x)), int(round(y)))); x += 1; y += slope + rng.uniform(-0.15, 0.15)
    def stroke(points, thick):
        for i, (px_, py_) in enumerate(points):
            if thick == 2:
                c.px[py_, px_] = (*l, 255); c.px[py_ + 1, px_] = (*m, 255); c.px[py_ + 2, px_] = (*e, 255)
            else:
                c.px[py_, px_] = (*m, 255); c.px[py_ + 1, px_] = (*e, 255)
    # forks first (they sit under the main stick)
    for _ in range(forks):
        i = rng.randint(L // 4, 3 * L // 4); sx, sy = pts[i]
        dirn = rng.choice((-1, 1)); ln = rng.randint(5, 8); fp = []
        fx, fy = float(sx), float(sy)
        for k in range(ln):
            fx += 1; fy += dirn * 0.45
            fp.append((int(round(fx)), int(round(fy)) + (1 if dirn > 0 else 0)))
        stroke(fp, 1)
    stroke(pts, 2)
    # bark notches + pale cut end
    for _ in range(L // 7):
        k = rng.randint(2, L - 3); px_, py_ = pts[k]; c.px[py_ + 1, px_] = (*d, 255)
    ex, ey = pts[-1]; c.px[ey, ex] = (*WOOD_END, 255); c.px[ey + 1, ex] = (*WOOD_END, 255)
    return c.crop()

# ------------------------------------------------------------------ mineable rocks
# Brighter, flatter cousin of the pebble palette: bold outline + 3 flat facet tones + a highlight,
# drawn like the player sprite (minimal shading, reads at a glance).
ROCK = [hx(c) for c in ("#2b2522", "#6c645c", "#8e857a", "#b0a697", "#cfc6b6")]   # outline, dark, mid, light, highlight

def chunk(c, idx, cx, base, w, h, rng, nseeds=None):
    """One faceted rock: convex silhouette with a flat bottom, Voronoi facets shaded by facing."""
    from PIL import ImageDraw
    ol, dk, md, lt, hl = ROCK
    pts = []
    k = rng.randint(6, 7)
    for i in range(k):
        a_ = math.pi + (i + rng.uniform(-0.25, 0.25)) / (k - 1) * math.pi   # upper half: pi..2pi
        a_ = min(2 * math.pi, max(math.pi, a_))
        rr = rng.uniform(0.84, 1.0) if 0 < i < k - 1 else 0.95
        pts.append((cx + math.cos(a_) * w / 2 * rr, base - 1 + math.sin(a_) * h * rr))
    pts = [(cx - w / 2 + 1, base - 1)] + pts + [(cx + w / 2 - 1, base - 1)]
    im = Image.new("1", (c.w, c.h), 0); ImageDraw.Draw(im).polygon(pts, fill=1)
    m = np.array(im, bool)
    if m.sum() < 10: return m
    yy, xx = grid(c.h, c.w)
    ys, xs = np.where(m); top, bot = ys.min(), ys.max()
    # facets: nearest of a few seed points
    n = nseeds or max(4, int(m.sum() / 75))
    seeds = [(xs[j], ys[j]) for j in rng.sample(range(len(xs)), n)]
    seeds.append((cx - w * 0.12, top + (bot - top) * 0.15))     # guarantee a top facet
    seeds.append((cx + w * 0.30, top + (bot - top) * 0.70))     # and a shaded right facet
    dist = np.stack([(xx - sx) ** 2 + ((yy - sy) * 1.3) ** 2 for sx, sy in seeds])
    lab = dist.argmin(0)
    for j, (sx, sy) in enumerate(seeds):
        cell = m & (lab == j)
        if not cell.any(): continue
        cy_, cx_ = np.where(cell)[0].mean(), np.where(cell)[1].mean()
        ty = (cy_ - top) / max(1, bot - top)          # 0 top .. 1 bottom
        tx = (cx_ - cx) / (w / 2)                       # -1 left .. 1 right
        if tx > 0.30 or (ty > 0.72 and tx > -0.1): col = dk      # faces turned away: right side, low front
        elif ty < 0.42 and tx < 0.35:              col = lt      # faces turned up toward the light
        else:                                      col = md
        c.set(cell, col, idx)
        continue
        c.set(cell, col, idx)
    # bold outline
    inner = m.copy()
    p = np.pad(m, 1); inner = m & p[:-2,1:-1] & p[2:,1:-1] & p[1:-1,:-2] & p[1:-1,2:]
    c.set(m & ~inner, ol, idx)
    # highlight: run along the upper-left rim just inside the outline
    rim = inner & ~(np.pad(inner, 1)[:-2, 1:-1]) & (xx < cx + w * 0.1)
    c.set(rim & ((c.px[..., :3] == np.array(lt)).all(-1)), hl, idx)
    return m

def crack(c, m, rng, x, y, length):
    ol = ROCK[0]
    for k in range(length):
        if 0 <= y < c.h and 0 <= x < c.w and m[y, x]: c.px[y, x] = (*ol, 255)
        x += rng.choice((1, 1, 0)); y += rng.choice((1, 0, 1))

ROCK_LAYOUTS = [
    # (big w, big h, [small rocks as (dx from centre, dy from base, w, h)])
    (40, 30, [(-21, 0, 12, 8), (18, 2, 9, 6)]),          # tall boulder, two companions
    (48, 24, [(22, 1, 11, 7)]),                          # wide, low slab
    (34, 32, [(-16, 1, 9, 7), (14, 0, 13, 9), (2, 3, 7, 5)]),   # chunky with a scatter
    (38, 26, []),                                        # big rock + second boulder (below)
]

def rock(i):
    rng = random.Random(70 + i + 1000 * (0, 0, 3, 4)[i])   # hand-picked seeds
    bw, bh, smalls = ROCK_LAYOUTS[i]
    c = C(80, 56); cx, base = 40, 48
    behind = [s_ for s_ in smalls if s_[1] <= 0]; front = [s_ for s_ in smalls if s_[1] > 0]
    for j, (dx, dy, w, h) in enumerate(behind):
        chunk(c, 10 + j, cx + dx, base + dy - 2, w, h, rng, nseeds=2)
    if i == 3:                                           # a second, smaller boulder leaning behind
        chunk(c, 5, cx + 15, base - 3, 26, 22, rng)
    m = chunk(c, 1, cx, base, bw, bh, rng)
    ys, xs = np.where(m)
    for _ in range(2):                                   # cracks say "this splits"
        j = rng.randrange(len(xs))
        y0 = ys.min() + rng.randint(4, 10); x0 = int(cx + rng.uniform(-bw * 0.25, bw * 0.2))
        crack(c, m, rng, x0, y0, rng.randint(4, 7))
    for j, (dx, dy, w, h) in enumerate(front):
        chunk(c, 20 + j, cx + dx, base + dy, w, h, rng, nseeds=2)
    return c.crop()

# ------------------------------------------------------------------ v3: outlined mushrooms (bigger)
OUTLINE = ROCK[0]

def outline_ring(m):
    """1px ring just outside mask m (so the outline doesn't eat the shape)."""
    p = np.pad(m, 1)
    d = m | p[:-2, 1:-1] | p[2:, 1:-1] | p[1:-1, :-2] | p[1:-1, 2:]
    return d & ~m

MUSH_PARTS = {
    # (base x, stem h, stem w, cap w, cap h, palette, spots)   listed back to front
    "toadstool":     [(22, 12, 5, 18, 8, CAP_RED, True)],
    "red_cluster":   [(30, 8, 4, 13, 6, CAP_RED, True), (20, 13, 5, 17, 8, CAP_RED, True), (10, 4, 4, 10, 5, CAP_RED, False)],
    "brown":         [(22, 13, 5, 16, 7, CAP_BROWN, False)],
    "brown_cluster": [(15, 8, 4, 13, 6, CAP_BROWN, False), (24, 13, 5, 16, 7, CAP_BROWN, False), (31, 5, 3, 10, 5, CAP_BROWN, False)],
    "tan_cluster":   [(16, 9, 4, 12, 5, CAP_TAN, False), (24, 15, 4, 14, 6, CAP_TAN, False), (31, 6, 3, 10, 4, CAP_TAN, False)],
}

def mushroom(kind, rng):
    W, H, base = 48, 44, 40
    final = C(W, H)
    parts = MUSH_PARTS[kind]
    for i, (bx, sh, sw, cw, chh, pal, sp) in enumerate(parts):
        by = base - (1 if (len(parts) > 1 and i == 0) else 0)   # back mushroom sits a touch further away
        layer = C(W, H)
        m = mushroom_one(layer, 0, bx, by, sh, sw, cw, chh, pal, sp, rng)
        m = layer.px[..., 3] > 0
        ring = outline_ring(m)
        ring[by:, :] &= False                                     # no outline below the ground line
        layer.px[ring] = (*OUTLINE, 255)
        # bottom of the stem: outline the base row too so it reads planted
        row = np.where(m[by - 1])[0]
        if len(row): layer.px[by, row.min():row.max() + 1] = (*OUTLINE, 255)
        a = layer.px[..., 3] > 0
        final.px[a] = layer.px[a]
    # contact shadow one row below, a little wider than the stems
    row = np.where(final.px[base, :, 3] > 0)[0]
    if len(row): final.px[base + 1, row.min() - 1:row.max() + 2] = (*CONTACT, 255)
    return final.crop()

# ------------------------------------------------------------------ v3: rocks seen from above (2:1 iso)
def hull(points):
    pts = sorted(set(points))
    if len(pts) < 3: return pts
    def cross(o, a, b): return (a[0]-o[0])*(b[1]-o[1]) - (a[1]-o[1])*(b[0]-o[0])
    lo, up = [], []
    for p_ in pts:
        while len(lo) >= 2 and cross(lo[-2], lo[-1], p_) <= 0: lo.pop()
        lo.append(p_)
    for p_ in reversed(pts):
        while len(up) >= 2 and cross(up[-2], up[-1], p_) <= 0: up.pop()
        up.append(p_)
    return lo[:-1] + up[:-1]

def poly_mask(c, pts):
    from PIL import ImageDraw
    im = Image.new("1", (c.w, c.h), 0); ImageDraw.Draw(im).polygon([tuple(p_) for p_ in pts], fill=1)
    return np.array(im, bool)

def boulder(c, cx, gy, w, height, rng, k=None, top_scale=0.66, lean=0.0):
    """Low-poly rock: footprint ellipse (2:1) on the ground at gy, a smaller top face lifted by
    `height`, flat side facets between them. Returns its mask."""
    ol, dk, md, lt, hl = ROCK
    k = k or rng.randint(6, 8)
    rx, ry = w / 2, w / 4
    a0 = rng.uniform(0, 2 * math.pi)
    angs = sorted((a0 + 2 * math.pi * i / k + rng.uniform(-0.25, 0.25)) % (2 * math.pi) for i in range(k))
    F, T = [], []
    tcx, tcy = cx + lean * rx, gy - height
    for a_ in angs:
        r1 = rng.uniform(0.90, 1.0); r2 = rng.uniform(0.80, 1.0) * top_scale
        F.append((cx + math.cos(a_) * rx * r1, gy + math.sin(a_) * ry * r1))
        T.append((tcx + math.cos(a_) * rx * r2, tcy + math.sin(a_) * ry * r2))
    sil = poly_mask(c, hull(F + T))
    # side facets: quad between top edge i..i+1 and footprint edge i..i+1, only the ones facing us
    for i in range(k):
        j = (i + 1) % k
        mid = (angs[i] + ((angs[j] - angs[i]) % (2 * math.pi)) / 2)
        nx, ny = math.cos(mid), math.sin(mid)
        if ny < -0.15: continue                       # faces away from the camera: hidden behind the top
        col = md if nx < -0.2 else dk                 # left-facing sides catch the light
        q = poly_mask(c, [T[i], T[j], F[j], F[i]]) & sil
        c.px[q] = (*col, 255)
    top = poly_mask(c, T) & sil
    c.px[top] = (*lt, 255)
    # highlight: upper-left rim of the top face
    up = np.zeros_like(top); up[1:] = top[:-1]
    lf = np.zeros_like(top); lf[:, 1:] = top[:, :-1]
    yy, xx = grid(c.h, c.w)
    rim = top & (~up | ~lf) & (xx < tcx + rx * 0.15) & (yy < tcy + ry * 0.2)
    c.px[rim] = (*hl, 255)
    # bold outline just outside the silhouette
    ring = outline_ring(sil)
    c.px[ring] = (*ol, 255)
    # outline between top face and the front sides (the visible "lip"), only along the front edge
    dn = np.zeros_like(top); dn[:-1] = top[1:]
    lip = top & ~dn & (yy > tcy)
    c.px[lip] = (*dk, 255)
    return sil | ring, top

def top_crack(c, top, rng):
    ys, xs = np.where(top)
    if len(ys) < 30: return
    j = rng.randrange(len(ys)); x, y = xs[j], ys[j]
    for _ in range(rng.randint(4, 7)):
        if top[y, x]: c.px[y, x] = (*ROCK[1], 255)
        x += rng.choice((1, 1, -1)); y += rng.choice((0, 1))

ROCKS3 = [
    # big (w, height, lean), companions as (dx, dy on the ground plane, w, height)
    ((44, 13, -0.05), [(-24, -3, 13, 4), (19, 7, 11, 4)]),
    ((50, 9,   0.05), [(23, 5, 12, 4)]),
    ((38, 16, -0.10), [(-19, 4, 10, 4), (17, -4, 13, 4), (4, 11, 8, 3)]),
    ((40, 12,  0.00), [(16, -8, 28, 10)]),            # second boulder behind
]

def rock(i):
    rng = random.Random(170 + i)
    (bw, bh, lean), comps = ROCKS3[i]
    c = C(96, 70); cx, gy = 46, 52
    items = [(gy, ("big", cx, gy, bw, bh, lean))] + [(gy + dy, ("small", cx + dx, gy + dy, w, h, 0.0)) for dx, dy, w, h in comps]
    for _, (kind, x, y, w, h, ln) in sorted(items, key=lambda t: t[0]):     # back to front
        sil, top = boulder(c, x, y, w, h, rng, lean=ln, top_scale=0.74 if w > 20 else 0.66)
        if kind == "big" or w > 20:
            for _ in range(2 if kind == "big" else 1): top_crack(c, top, rng)
    return c.crop()


# ------------------------------------------------------------------ v4: jagged, textured boulders
ROCK_LT2 = hx("#9f9688")   # between light and mid: the top facets turned slightly away

def boulder2(c, cx, gy, w, height, rng, lean=0.0, small=False):
    ol, dk, md, lt, hl = ROCK
    k = rng.randint(6, 7) if small else rng.randint(9, 11)
    rx, ry = w / 2, w / 4
    a0 = rng.uniform(0, 2 * math.pi)
    angs = sorted((a0 + 2 * math.pi * i / k + rng.uniform(-0.18, 0.18)) % (2 * math.pi) for i in range(k))
    F, T = [], []
    tcx, tcy = cx + lean * rx, gy - height
    for a_ in angs:
        r1 = rng.uniform(0.88, 1.0)
        back = math.sin(a_) < -0.2                          # corners on the far side of the rock
        r2 = rng.uniform(0.62, 0.92) if back else rng.uniform(0.5, 0.78)
        lift = height * (rng.uniform(0.9, 1.5) if back else rng.uniform(0.6, 1.05))   # far corners stand up -> jagged crown
        F.append((cx + math.cos(a_) * rx * r1, gy + math.sin(a_) * ry * r1))
        T.append((tcx + math.cos(a_) * rx * r2, gy - lift + math.sin(a_) * ry * r2))
    # silhouette: hull of the footprint + every top corner (jagged corners poke out above)
    sil = poly_mask(c, hull(F)) | poly_mask(c, T)
    for i in range(k):
        j = (i + 1) % k
        sil |= poly_mask(c, [T[i], T[j], F[j], F[i]])
    yy, xx = grid(c.h, c.w)
    # side facets, front-facing only, back to front by their lower edge
    order = sorted(range(k), key=lambda i: (F[i][1] + F[(i + 1) % k][1]))
    sides = np.zeros_like(sil)
    for i in order:
        j = (i + 1) % k
        mid = angs[i] + ((angs[j] - angs[i]) % (2 * math.pi)) / 2
        nx, ny = math.cos(mid), math.sin(mid)
        if ny < -0.2: continue
        col = md if nx < -0.15 else dk
        q = poly_mask(c, [T[i], T[j], F[j], F[i]]) & sil
        c.px[q] = (*col, 255); sides |= q
        # crease where this facet starts: a 1px dark line from top corner down to the ground
        x0, y0 = T[i]; x1, y1 = F[i]
        n = int(max(abs(x1 - x0), abs(y1 - y0))) + 1
        for t in np.linspace(0, 1, n):
            X, Y = int(round(x0 + (x1 - x0) * t)), int(round(y0 + (y1 - y0) * t))
            if 0 <= Y < c.h and 0 <= X < c.w and q[Y, X] and i % 2 == 0:
                c.px[Y, X] = (*(dk if col == md else ol), 255)
    # top: split into facets around a raised peak; facets facing up-left are light, others lt2
    top = poly_mask(c, T) & sil
    px_, py_ = tcx - rx * 0.12 + rng.uniform(-2, 2), (sum(t[1] for t in T) / k) - height * 0.25
    for i in range(k):
        j = (i + 1) % k
        f = poly_mask(c, [(px_, py_), T[i], T[j]]) & top
        if not f.any(): continue
        mx, my = (T[i][0] + T[j][0]) / 2 - px_, (T[i][1] + T[j][1]) / 2 - py_
        col = lt if (mx * 0.8 + my * 1.2) < 0 else ROCK_LT2
        c.px[f] = (*col, 255)
        # ridge from the peak to each corner: highlight on lit ridges, lt2 on the others
        n = int(max(abs(T[i][0] - px_), abs(T[i][1] - py_))) + 1
        for t in np.linspace(0, 1, n):
            X, Y = int(round(px_ + (T[i][0] - px_) * t)), int(round(py_ + (T[i][1] - py_) * t))
            if 0 <= Y < c.h and 0 <= X < c.w and top[Y, X] and T[i][0] < px_ + 1 and T[i][1] < py_ + 3:
                c.px[Y, X] = (*hl, 255)
    # top rim: highlight along the upper-left edge, darker lip along the front edge
    up = np.zeros_like(top); up[1:] = top[:-1]
    lf = np.zeros_like(top); lf[:, 1:] = top[:, :-1]
    dn = np.zeros_like(top); dn[:-1] = top[1:]
    c.px[top & (~up | ~lf) & (xx < tcx + rx * 0.1)] = (*hl, 255)
    c.px[top & ~dn & (yy > py_)] = (*md, 255)
    # texture: sparse 2x1 chips. Darker on the sides, lt2 / md on the top
    if not small:
        for mask, cols, per, pit in ((sides, (dk, ol), 140, True), (top, (ROCK_LT2, md), 90, False)):
            ys, xs = np.where(mask)
            for _ in range(len(ys) // per):
                q = rng.randrange(len(ys)); Y, X = ys[q], xs[q]
                cur = tuple(c.px[Y, X, :3])
                col = cols[1] if cur == cols[0] else cols[0]
                for dy in range(2 if pit else 1):
                    for d in range(2):
                        if Y + dy < c.h and X + d < c.w and mask[Y + dy, X + d]: c.px[Y + dy, X + d] = (*col, 255)
    ring = outline_ring(sil)
    c.px[ring] = (*ol, 255)
    return sil | ring, top

def rock(i):
    rng = random.Random(270 + i)
    (bw, bh, lean), comps = ROCKS3[i]
    c = C(100, 76); cx, gy = 48, 58
    items = [(gy, ("big", cx, gy, bw, bh, lean))] + [(gy + dy, ("small", cx + dx, gy + dy, w, h, 0.0)) for dx, dy, w, h in comps]
    for _, (kind, x, y, w, h, ln) in sorted(items, key=lambda t: t[0]):
        sil, top = boulder2(c, x, y, w, h, rng, lean=ln, small=(w <= 20))
        if kind == "big":
            top_crack(c, top, rng)
    return c.crop()


# ------------------------------------------------------------------ v5: craggy outcrops (clusters of faceted chunks)
OUTCROPS = [
    # chunks (dx, dy on ground plane, w, height); drawn back to front by dy. Pebble-sized strays at the end.
    [(-6, -5, 26, 20), (9, -3, 24, 14), (-12, 3, 20, 10), (6, 5, 22, 8), (-24, 6, 9, 3), (21, 9, 8, 3)],
    [(-10, -3, 28, 13), (10, -2, 26, 10), (0, 5, 24, 7), (24, 7, 10, 4)],
    [(0, -6, 22, 26), (-11, 0, 18, 13), (11, 1, 20, 11), (-1, 7, 16, 6), (-20, 8, 8, 3), (17, 10, 9, 3)],
    [(-8, -6, 22, 17), (10, -7, 22, 22), (2, 2, 26, 10), (-16, 5, 14, 7), (19, 6, 10, 4)],
]

def rock(i):
    rng = random.Random(370 + i)
    c = C(110, 86); cx, gy = 54, 64
    chunks = sorted(OUTCROPS[i], key=lambda t: t[1])
    tops = []
    for dx, dy, w, h in chunks:
        sil, top = boulder(c, cx + dx, gy + dy, w, max(3, round(h * 0.7)), rng, lean=rng.uniform(-0.12, 0.12),
                           top_scale=rng.uniform(0.74, 0.86), k=rng.randint(5, 7))
        if w >= 20: tops.append((w * h, top))
    # one or two cracks on the biggest visible tops
    for _, top in sorted(tops, key=lambda t: -t[0])[:2]:
        # recompute which of this top is still visible (not covered by later chunks' outlines)
        vis = top & (c.px[..., :3] != np.array(ROCK[0])).any(-1)
        top_crack(c, vis, rng)
    return c.crop()

# ------------------------------------------------------------------ build
def fits(im, wr, hr): return wr[0] <= im.width <= wr[1] and hr[0] <= im.height <= hr[1]

def build():
    out = {}
    for col, pal in LEAF.items():
        rng = random.Random(hash(col) & 0xffff if False else sum(map(ord, col)))
        k = 0
        for W, H, n in ((30, 17, 6), (35, 19, 8), (40, 21, 11)):           # 3 piles
            best = None
            for _ in range(60):
                im = leaf_pile(pal, rng, W, H, n)
                err = max(0, 24 - im.width, im.width - 40) + max(0, 12 - im.height, im.height - 20)
                if best is None or err < best[0]: best = (err, im)
                if err == 0: break
            im = best[1]
            out[f"leaves_{col}_{k}"] = im; k += 1
        for n in (2, 3):                                                   # 2 scatters
            best = None
            for _ in range(60):
                im = leaf_scatter(pal, rng, n)
                err = max(0, 8 - im.width, im.width - 14)
                if best is None or err < best[0]: best = (err, im)
                if err == 0: break
            im = best[1]
            out[f"leaves_{col}_{k}"] = im; k += 1
    rng = random.Random(11)
    for i, kind in enumerate(("toadstool", "red_cluster", "brown", "brown_cluster", "tan_cluster")):
        out[f"mushroom_{i}"] = mushroom(kind, rng)
    for i, n in enumerate((1, 2, 4)):
        out[f"pebbles_{i}"] = pebbles(n, random.Random(30 + i))
    for i, cols in enumerate((("cream", "yellow"), ("purple",), ("rust", "cream"), ("yellow", "blue"))):
        out[f"flowers_{i}"] = flowers(cols, random.Random(40 + i), n=(5, 4, 6, 5)[i])
    for i in range(4):
        out[f"rock_{i}"] = rock(i)
    for i, (W, Hh, n) in enumerate(((12, 9, 5), (14, 11, 7), (16, 12, 8), (18, 14, 9))):
        out[f"tuft_{i}"] = tuft(random.Random(50 + i), W, Hh, n)
    for i, (L, f) in enumerate(((17, 1), (22, 1), (27, 2))):
        for k in range(40):
            im = twig(random.Random(60 + i + 100 * k), L, f)
            if 4 <= im.height <= 8 and 16 <= im.width <= 28: break
        out[f"twig_{i}"] = im
    for k, im in out.items():
        a = np.array(im)[..., 3]; assert set(np.unique(a)) <= {0, 255}, k
        im.save(f"{OUT}/{k}.png")
    return out

if __name__ == "__main__":
    o = build()
    for k, im in o.items(): print(f"{k:18s} {im.width}x{im.height}")


# ------------------------------------------------------------------ preview on grass tiles
def grass_field(W, H):
    tiles = [Image.open(f"{D}/out/ground/grass_{i}.png") for i in range(4)]
    img = Image.new("RGBA", (W, H), (0, 0, 0, 255))
    for j in range(-2, H // 16 + 3):
        for i in range(-2, W // 64 + 3):
            x = i * 64 + (32 if j % 2 else 0) - 32; y = j * 16 - 16
            t = tiles[(i * 7 + j * 13) % 4]
            if (i + j) % 2: t = t.transpose(Image.FLIP_LEFT_RIGHT)
            img.alpha_composite(t, (x, y)) if -64 < x < W and -32 < y < H else None
    return img

def preview(out):
    import sys; sys.path.insert(0, D)
    from trees_v2 import character
    ch = character()
    rows = [[k for k in out if k.startswith(f"leaves_{c}")] for c in LEAF] + \
           [[k for k in out if k.startswith(p)] for p in ("mushroom", "pebbles", "flowers", "tuft", "twig", "rock")]
    gap, pad = 18, 16
    rh = [max(out[k].height for k in r) for r in rows]
    W = pad * 2 + max(sum(out[k].width for k in r) + gap * (len(r) - 1) for r in rows) + gap + ch.width
    H = pad * 2 + sum(max(h, 0) for h in rh) + gap * (len(rows) - 1)
    H = max(H, ch.height + 2 * pad)
    img = grass_field(W, H)
    y = pad
    for r, h in zip(rows, rh):
        x = pad
        for k in r:
            im = out[k]; img.alpha_composite(im, (x, y + h - im.height)); x += im.width + gap
        y += h + gap
    img.alpha_composite(ch, (W - pad - ch.width, H // 2 - ch.height // 2))
    return img

if __name__ == "__main__":
    p = preview(o)
    p.save(f"{OUT}/preview_1x.png"); p.resize((p.width * 3, p.height * 3), Image.NEAREST).save(f"{OUT}/preview_3x.png")
    print("preview", p.size)
