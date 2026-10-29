"""Art round 13, battlements: the core. A tiny exact renderer for boxes of stone.

World units (as the engine's, docs/art/01 and art round 10): X and Y along the ground (a tile is 32 x 32), Z height in
screen pixels. screen x = X - Y, screen y = (X + Y) / 2 - Z; the camera looks along -(1, 1, 1), so what it sees of a box
is its +X face (shade), its +Y face (lit) and its top (lightest); depth toward the camera = X + Y + Z.

Every picture is a union of axis-aligned boxes ("stones"). A pixel is the nearest box along its ray, shaded as the village
stone wall (data/art/village/wall_stone_*.png) shades its faces: the same tones, the same three-row joint (a highlight row
over a dark row over a soft row), a 1 px vertical joint, the same seams on the tops.
"""
import numpy as np

# ---- the village stone wall's own palette (read off data/art/village/wall_stone_north_plain.png and _west_plain.png)
def hx(s):
    s = s.lstrip("#")
    return np.array([int(s[i:i + 2], 16) for i in (0, 2, 4)], np.uint8)

LIT = [hx("#7b7670"), hx("#75706a"), hx("#857f78")]       # +Y faces (light from the top left): n e i
LIT_HI, LIT_DK, LIT_SOFT = hx("#938d85"), hx("#57524d"), hx("#6b6660")      # h g f
SHADE = [hx("#585350"), hx("#534e4a"), hx("#605b56")]     # +X faces: p j o
SH_HI, SH_DK, SH_SOFT = hx("#6b6661"), hx("#3b3734"), hx("#4b4743")         # l k m
TOP = [hx("#99938b"), hx("#a19b92")]                      # tops: c d
TOP_RIM, TOP_SEAM = hx("#aea89d"), hx("#6c6761")          # b a
SLIT = hx("#2b2522")


def mix(*v):
    """a deterministic hash of small ints, 0..65535"""
    h = 0x9E3779B1
    for a in v:
        h = (h ^ (int(a) & 0xFFFFFFFF)) * 0x85EBCA6B & 0xFFFFFFFF
        h ^= h >> 13
        h = h * 0xC2B2AE35 & 0xFFFFFFFF
        h ^= h >> 16
    return h & 0xFFFF


def tone_of(*seed):
    """0, 1, 2 for a stone's body tone: n (mid) a little more often than e (dark) and i (light)"""
    r = mix(*seed) % 7
    return 0 if r < 3 else (1 if r < 5 else 2)


class Box:
    __slots__ = ("x0", "x1", "y0", "y1", "z0", "z1", "along", "tone", "ttop", "jl", "decal", "col")

    def __init__(self, x0, x1, y0, y1, z0, z1, along="x", tone=0, ttop=0, jl=True, decal=None, col=None):
        self.x0, self.x1, self.y0, self.y1, self.z0, self.z1 = x0, x1, y0, y1, z0, z1
        self.along, self.tone, self.ttop, self.jl, self.decal, self.col = along, tone, ttop, jl, decal, col

    def swapped(self):
        """the same stone mirrored across the diagonal (an n edge's stone becomes a w edge's)"""
        return Box(self.y0, self.y1, self.x0, self.x1, self.z0, self.z1, "y" if self.along == "x" else "x",
                   self.tone, self.ttop, self.jl, self.decal, self.col)


def render(boxes, ax, ay, w, h, window=None):
    """-> rgba (h, w, 4) uint8 with hard alpha, depth (h, w) float (X + Y + Z, nan where empty), hit (X, Y, Z) arrays.
    window(X, Y) -> bool array: a pixel is kept only if its visible surface lies in the window (a partition of the plane)."""
    py, px = np.mgrid[0:h, 0:w]
    u = px + 0.5 - ax
    v = py + 0.5 - ay
    X0 = v + u / 2.0
    Y0 = v - u / 2.0
    best = np.full((h, w), -1e18)
    who = np.full((h, w), -1, np.int32)
    face = np.zeros((h, w), np.int8)
    for i, b in enumerate(boxes):
        t1x = b.x1 - X0
        t1y = b.y1 - Y0
        t1z = np.full_like(X0, float(b.z1))
        lo = np.maximum(np.maximum(b.x0 - X0, b.y0 - Y0), b.z0)
        hi = np.minimum(np.minimum(t1x, t1y), t1z)
        ok = (lo < hi - 1e-9) & (hi > best)
        f = np.where(t1z <= np.minimum(t1x, t1y) + 1e-9, 2, np.where(t1y <= t1x + 1e-9, 1, 0)).astype(np.int8)
        best = np.where(ok, hi, best)
        who = np.where(ok, i, who)
        face = np.where(ok, f, face)
    hit = who >= 0
    X = X0 + best
    Y = Y0 + best
    Z = best.copy()
    if window is not None:
        hit &= window(X, Y)
    rgba = np.zeros((h, w, 4), np.uint8)
    for i, b in enumerate(boxes):
        for f in (0, 1, 2):
            m = hit & (who == i) & (face == f)
            if not m.any():
                continue
            col = shade(b, f, X[m], Y[m], Z[m])
            rgba[m, :3] = col
            rgba[m, 3] = 255
    dep = np.where(hit, X + Y + Z, np.nan)
    return rgba, dep, (X, Y, Z)


def shade(b, f, X, Y, Z):
    n = len(X)
    if b.col is not None:      # a flat shadow: one colour per face
        return np.tile(np.array(b.col[f], np.uint8), (n, 1))
    zz = Z - b.z0
    top = b.z1 - Z
    tall = (b.z1 - b.z0) >= 8
    if f == 1:      # +Y face, lit
        col = np.tile(LIT[b.tone], (n, 1))
        along = b.along == "x"
        if b.jl and along:
            col[(X - b.x0) < 1] = LIT_DK
        col[top < 1] = LIT_SOFT
        if tall:
            col[(zz >= 1) & (zz < 2)] = LIT_HI
        col[zz < 1] = LIT_DK
        if b.decal:
            col = apply_decal(b, 1, col, X, Y, Z)
        return col
    if f == 0:      # +X face, shade
        col = np.tile(SHADE[b.tone], (n, 1))
        if b.jl and b.along == "y":
            col[(b.y1 - Y) < 1] = SH_DK
        col[top < 1] = SH_SOFT
        if tall:
            col[(zz >= 1) & (zz < 2)] = SH_HI
        col[zz < 1] = SH_DK
        if b.decal:
            col = apply_decal(b, 0, col, X, Y, Z)
        return col
    # top
    col = np.tile(TOP[b.ttop], (n, 1))
    A = X - b.x0 if b.along == "x" else Y - b.y0
    Aend = (b.x1 - X) if b.along == "x" else (b.y1 - Y)
    col[A < 1] = TOP_RIM
    col[Aend < 1] = TOP_SEAM
    return col


def apply_decal(b, f, col, X, Y, Z):
    """b.decal: a list of ('slit', a0, a1, z0, z1) or ('crack', [(a, z), ...]) in the along coordinate on the lit/shade face"""
    A = X if b.along == "x" else Y
    for d in b.decal:
        if d[0] == "slit":
            _, a0, a1, z0, z1 = d
            if (f == 1) == (b.along == "x"):      # only on the long face
                m = (A >= a0) & (A < a1) & (Z >= z0) & (Z < z1)
                col[m] = SLIT
                m2 = (A >= a0) & (A < a0 + 1) & (Z >= z0) & (Z < z1)
                col[m2] = SH_DK
        elif d[0] == "crack":
            if (f == 1) == (b.along == "x"):
                for (a, z) in d[1]:
                    m = (np.floor(A) == a) & (np.floor(Z) == z)
                    col[m] = LIT_DK if f == 1 else SH_DK
    return col
