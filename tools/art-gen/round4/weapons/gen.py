"""Art round 4, group A: the weapons. Written fresh for this round (the method after Claude Design's
items_held.py: every long thing rasterised from its shape at each angle, never rotated by pixel).

Run with plain `python gen.py`; writes out/ (PNGs, manifest.json, preview.png). Deterministic: no randomness
at all beyond a fixed integer hash for wood grain.

Local coordinates of an item: v runs up the item from its bottom end, u across it (+u is the item's right
when upright, which faces down-right at every tilt 0..90, so -u is the lit side and +u the shade side).
`s` is a scale used only for the bag and slot renderings; the world pictures are s = 1.
"""
import json, math, os
import numpy as np
from PIL import Image, ImageDraw

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "out")
REPO = "C:/Users/micha/Dev/cozy-medieval-zombies/.claude/worktrees/79-sweep-3e-23fa08"   # read only
OUTLINE = "#2b2522"
CELL = 19
ANGLES = [(0, ""), (22.5, "_22_5"), (45, "_45"), (67.5, "_67_5"), (90, "_90")]

# ------------------------------------------------------------------ palettes (the house's, docs/art/01 and 07)
STEEL = dict(hi="#eef0f4", lt="#c6cad2", base="#9ea2ac", sh="#6e7280", dk="#4a4f5c")
IRON = dict(gl="#b4b8c0", hi="#8a8c96", base="#5e6068", sh="#3e3f46")
BRASS = dict(hi="#e2c06a", base="#c39a44", sh="#8a6a2a")
LEATHER = dict(hi="#8a6a3a", base="#6c4b30", sh="#432d1e")          # the sword's grip: the generated #8a6a3a lit
WRAP = dict(hi="#7a5638", base="#5a3c25", sh="#3e2818")
WOOD = dict(hi="#9a6a42", base="#7a5132", sh="#57381f", knot="#45301b")
ASH = dict(hi="#b89668", base="#96744a", sh="#6c5032", knot="#4e3822")  # the halberd's pale pole
SHAFT = dict(hi="#d2b88a", base="#b8a078", sh="#8a7452")              # arrow shafts, the generated #b8a078
YEW = dict(sap="#e6d2a2", sap_sh="#c8b082", hi="#c8783e", base="#a65a2e", sh="#7a3e20", dk="#5a2c18")
STRING = dict(base="#d8d0b8", sh="#a89e84")
GOOSE = dict(hi="#d6d4cc", base="#a8a6a0", sh="#76746f")
PITCH = dict(hi="#4e4038", base="#3a2f2a", sh="#2a221f", cord="#8a7a5a", cord_sh="#6b5a44",
             ember="#c2601f", glow="#e8a052")
PLANK = dict(a="#94703e", b="#86643a", hi="#a8844e", sh="#6a4e2c", seam="#4e3822", grain="#765630")


def hx(s):
    s = s.lstrip("#"); return np.array([int(s[i:i + 2], 16) for i in (0, 2, 4)], np.uint8)


def hashn(x, y, s=0):
    v = (np.asarray(x, np.int64) * 73856093) ^ (np.asarray(y, np.int64) * 19349663) ^ (s * 83492791)
    v = (v ^ (v >> 13)) * 1274126177
    return (v ^ (v >> 16)) & 0xFFFF


# ------------------------------------------------------------------ a canvas with hard pixels
class Canvas:
    def __init__(self, w, h):
        self.w, self.h = w, h
        self.col = np.zeros((h, w, 3), np.uint8); self.a = np.zeros((h, w), bool)

    def paint(self, m, c):
        self.col[m] = hx(c); self.a[m] = True

    def erase(self, m): self.a[m] = False

    def outline(self, c=OUTLINE):
        p = np.pad(self.a, 1)
        ring = (p[:-2, 1:-1] | p[2:, 1:-1] | p[1:-1, :-2] | p[1:-1, 2:]) & ~self.a
        self.paint(ring, c)

    def image(self):
        rgba = np.zeros((self.h, self.w, 4), np.uint8)
        rgba[..., :3] = self.col; rgba[..., 3] = self.a * 255
        im = Image.fromarray(rgba, "RGBA")
        ys = np.where(self.a.any(1))[0]; xs = np.where(self.a.any(0))[0]
        return im.crop((xs.min(), ys.min(), xs.max() + 1, ys.max() + 1)), (int(xs.min()), int(ys.min()))


class Raster:
    """The item's local (u, v) at every pixel centre, the grip at a pixel centre in the canvas's middle."""
    def __init__(self, theta_deg, grip_v, reach, ss=None):
        th = math.radians(theta_deg)
        self.ax = (math.sin(th), -math.cos(th))      # +v on screen
        self.ac = (math.cos(th), math.sin(th))       # +u on screen
        S = int(2 * reach + 12); self.S = S
        self.g = S // 2 + 0.5; self.grip_v = grip_v
        # each pixel is sampled ss x ss times and takes a shape where the shape covers most of it: an area
        # rule, not a centre rule, so a tilted edge steps evenly and a tilted blade keeps one width (the
        # pixel stays hard; nothing is blended). Upright and flat the centre rule is exact, so ss = 1.
        if ss is None: ss = 1 if theta_deg % 90 == 0 else 3
        self.ss = ss
        o = (np.arange(S * ss) + 0.5) / ss
        yy, xx = np.meshgrid(o, o, indexing="ij")
        dx, dy = xx - self.g, yy - self.g
        self.v = dx * self.ax[0] + dy * self.ax[1] + grip_v
        self.u = dx * self.ac[0] + dy * self.ac[1]
        self.c = Canvas(S, S)

    def paint(self, m, col):
        k = self.ss
        if k > 1: m = m.reshape(self.S, k, self.S, k).mean((1, 3)) > 0.5
        self.c.paint(m, col)

    def box(self, u0, u1, v0, v1): return (self.u >= u0) & (self.u < u1) & (self.v >= v0) & (self.v < v1)

    def disc(self, cu, cv, r): return np.hypot(self.u - cu, self.v - cv) <= r

    def seg(self, a, b, r):
        a, b = np.array(a, float), np.array(b, float); ba = b - a
        pu, pv = self.u - a[0], self.v - a[1]
        h = np.clip((pu * ba[0] + pv * ba[1]) / max(ba @ ba, 1e-9), 0, 1)
        return np.hypot(pu - h * ba[0], pv - h * ba[1]) <= r

    def poly(self, pts):
        """inside a convex or concave polygon given in local (u, v) (even-odd rule)"""
        inside = np.zeros_like(self.u, bool)
        n = len(pts)
        for i in range(n):
            (u1, v1), (u2, v2) = pts[i], pts[(i + 1) % n]
            cond = (v1 > self.v) != (v2 > self.v)
            with np.errstate(divide="ignore", invalid="ignore"):
                xi = (u2 - u1) * (self.v - v1) / (v2 - v1) + u1
            inside ^= cond & (self.u < xi)
        return inside

    def to_px(self, lu, lv):
        sx = self.g + self.ac[0] * lu + self.ax[0] * (lv - self.grip_v)
        sy = self.g + self.ac[1] * lu + self.ax[1] * (lv - self.grip_v)
        return int(math.floor(sx)), int(math.floor(sy))

    def finish(self, points):
        self.c.outline()
        im, (x0, y0) = self.c.image()
        return im, {k: (self.to_px(*p)[0] - x0, self.to_px(*p)[1] - y0) for k, p in points.items()}


def tone3(r, m, pal, w, centre=0.0, hi="hi", base="base", sh="sh"):
    """across a round piece of width w: the -u side lit, the +u side in shade"""
    k = max(1.0, w / 4)
    r.paint(m, pal[base])
    r.paint(m & (r.u - centre < -w / 2 + k), pal[hi])
    r.paint(m & (r.u - centre >= w / 2 - k), pal[sh])


def wrap_bands(r, m, pal, w, step=2, slope=0.6):
    """a leather wrap: diagonal bands, lit on the left"""
    band = np.floor(r.v - slope * r.u) % step == 0
    r.paint(m, pal["base"])
    r.paint(m & ~band & (r.u < -w / 2 + 1.0), pal["hi"])
    r.paint(m & band, pal["sh"])


def pole(r, v0, v1, w, pal, grain_seed=1):
    m = r.box(-w / 2, w / 2, v0, v1)
    tone3(r, m, pal, w)
    vi = np.floor(r.v).astype(int)
    r.paint(m & (np.abs(r.u) < 0.5) & (hashn(vi // 3, 0, grain_seed) % 5 == 0), pal["sh"])   # a little grain
    return m


# ------------------------------------------------------------------ the sword
SW_TIP = (25.5, 34.0)
SW_TAPER = 0.15

def sword(theta, s=1.0):
    """an arming sword, 33 px: a round brass pommel, a wrapped leather grip, a straight brass cross,
    a steel blade with a fuller, a short point. Grip at the middle of the wrap."""
    GV = 6 * s
    r = Raster(theta, GV, 36 * s)
    # blade
    bw = 2.5 * s
    tipv0, tipv1 = SW_TIP[0] * s, SW_TIP[1] * s
    t = np.clip((r.v - tipv0) / (tipv1 - tipv0), 0, 1)
    # a slight distal taper all along, then a straight point
    body = bw - SW_TAPER * s * np.clip((r.v - 10.5 * s) / (tipv0 - 10.5 * s), 0, 1)
    half = np.where(r.v < tipv0, body, (bw - SW_TAPER * s) * (1 - t) + 0.01)
    blade = (np.abs(r.u) < half) & (r.v >= 10.5 * s) & (r.v < tipv1)
    r.paint(blade, STEEL["base"])
    r.paint(blade & (r.u < 0), STEEL["lt"])
    r.paint(blade & (r.u < -half + 1.0), STEEL["hi"])
    r.paint(blade & (r.u >= half - 1.0) & (r.u >= 0.5), STEEL["sh"])
    fuller = blade & (np.abs(r.u) < 0.5 * max(1, s)) & (r.v >= 12.5 * s) & (r.v < 24.5 * s)
    r.paint(fuller, STEEL["sh"])
    # grip
    grip = r.box(-1.5 * s, 1.5 * s, 2.5 * s, 9.5 * s)
    wrap_bands(r, grip, LEATHER, 3 * s, step=max(2, round(2 * s)))
    # cross guard: a bar with a lit top and a dark underside, rounded ends
    gu = 5.5 * s
    guard = r.seg((-gu + 1.0 * s, 10 * s), (gu - 1.0 * s, 10 * s), 1.05 * s) | r.box(-gu + 1 * s, gu - 1 * s, 9.5 * s, 10.5 * s)
    r.paint(guard, BRASS["base"])
    r.paint(guard & (r.v >= 10.2 * s), BRASS["hi"])
    r.paint(guard & (r.v < 9.6 * s), BRASS["sh"])
    r.paint(guard & (r.u > gu - 1.8 * s), BRASS["sh"])
    # pommel: a brass disc
    pm = r.disc(0, 1.2 * s, 2.0 * s)
    r.paint(pm, BRASS["base"])
    r.paint(pm & (r.u + -(r.v - 1.2 * s) < -1.0 * s), BRASS["hi"])
    r.paint(pm & (r.u - (r.v - 1.2 * s) > 1.2 * s), BRASS["sh"])
    return r.finish({"grip": (0, GV)})


# ------------------------------------------------------------------ the mace
def mace(theta, s=1.0):
    """a flanged mace, 28 px: an iron butt cap, a wrapped grip, a wooden haft, an iron head of
    flanges (one face on in the middle, one each side in profile) and a little top knob."""
    GV = 6 * s
    r = Raster(theta, GV, 32 * s)
    w = 3 * s
    pole(r, 0, 20 * s, w, WOOD)
    grip = r.box(-w / 2, w / 2, 2 * s, 10 * s)
    wrap_bands(r, grip, WRAP, w)
    cap = r.box(-w / 2 - 0.5 * s, w / 2 + 0.5 * s, 0, 1.5 * s)
    r.paint(cap, IRON["base"]); r.paint(cap & (r.u < -w / 2 + 0.5), IRON["hi"]); r.paint(cap & (r.u > w / 2 - 0.5), IRON["sh"])
    # socket collar under the head
    col = r.box(-w / 2 - 0.5 * s, w / 2 + 0.5 * s, 17 * s, 19 * s)
    r.paint(col, IRON["base"]); r.paint(col & (r.u < -w / 2), IRON["hi"]); r.paint(col & (r.u > w / 2), IRON["sh"])
    # the head: a flange each side in profile (its tip standing up past the top, so the head has a
    # crown of points), the face-on flange in the middle as a lit ridge, dark grooves between them
    h0, h1 = 18.5 * s, 28.5 * s
    hm = (h0 + h1) / 2
    def flange(sign):
        return r.poly([(sign * 1.0 * s, h0 - 0.5 * s), (sign * 3.6 * s, h0 + 1.0 * s), (sign * 5.0 * s, h0 + 3.2 * s),
                       (sign * 5.4 * s, hm), (sign * 5.0 * s, h1 - 2.4 * s), (sign * 3.8 * s, h1 - 0.2 * s),
                       (sign * 2.4 * s, h1 + 0.4 * s), (sign * 1.0 * s, h1 - 0.6 * s)])
    left, right = flange(-1), flange(1)
    core = r.poly([(-1.6 * s, h0), (1.6 * s, h0), (1.6 * s, h1), (0.6 * s, h1 + 1.6 * s), (-0.6 * s, h1 + 1.6 * s), (-1.6 * s, h1)])
    r.paint(left, IRON["hi"]); r.paint(left & (r.u < -4.2 * s) & (r.v > h0 + 3 * s), IRON["gl"])
    r.paint(left & (r.v < h0 + 2.5 * s) & (r.u > -4.2 * s), IRON["base"])
    r.paint(right, IRON["base"]); r.paint(right & (r.u > 4.2 * s), IRON["sh"]); r.paint(right & (r.v < h0 + 2.5 * s), IRON["sh"])
    gro = (left | right) & (np.abs(r.u) < 2.2 * s)
    r.paint(gro, IRON["sh"])                                 # the grooves, where the flanges meet the core
    r.paint(core, IRON["base"])
    r.paint(core & (r.u < 0.5 * s - 0.5), IRON["hi"])
    r.paint(core & (r.u < -0.5) & (r.v > hm - 1 * s), IRON["gl"])
    r.paint(core & (r.u > 0.5 * s + 0.5), IRON["sh"])
    return r.finish({"grip": (0, GV)})


# ------------------------------------------------------------------ the halberd
def halberd(theta, s=1.0, pole_len=None):
    """a halberd, 76 px: an iron-shod ash pole, a leather grip near the butt, langets up to the head,
    an axe blade on the left (the lit side), a hooked back spike on the right, a long top spike."""
    GV = 10 * s
    L = 58 * s if pole_len is None else pole_len          # where the head's socket starts
    r = Raster(theta, GV, (L + 20 * s) + 2)
    w = 3 * s
    pole(r, 0, L + 6 * s, w, ASH, 3)
    shoe = r.box(-w / 2, w / 2, 0, 2 * s)
    r.paint(shoe, IRON["base"]); r.paint(shoe & (r.u < -w / 2 + 1), IRON["hi"]); r.paint(shoe & (r.u >= w / 2 - 1), IRON["sh"])
    grip = r.box(-w / 2, w / 2, 5 * s, 15 * s)
    wrap_bands(r, grip, WRAP, w)
    # langets: iron strips running down the pole from the socket
    lang = r.box(-w / 2, w / 2, L - 7 * s, L) & (np.floor(r.v) % 4 != 0)
    r.paint(r.box(-w / 2, w / 2, L - 7 * s, L), IRON["sh"])
    r.paint(lang & (r.u < 0), IRON["hi"]); r.paint(lang & (r.u >= 0) & (r.u < w / 2 - 0.5), IRON["base"])
    sock = r.box(-w / 2 - 0.5 * s, w / 2 + 0.5 * s, L, L + 8 * s)
    # the axe blade, left: its back on the socket, its convex edge out at u = -9
    bv0, bv1 = L - 0.5 * s, L + 9 * s
    bm = (bv0 + bv1) / 2
    bpts = [(-1.5 * s, bv0 + 2.5 * s), (-4 * s, bv0 + 1.2 * s), (-6.5 * s, bv0 - 0.6 * s), (-8.4 * s, bv0 - 2.8 * s),
            (-9.2 * s, bv0 + 0.2 * s), (-9.8 * s, bm), (-9.2 * s, bv1 - 0.2 * s), (-8.4 * s, bv1 + 2.8 * s),
            (-6.5 * s, bv1 + 0.6 * s), (-4 * s, bv1 - 0.8 * s), (-1.5 * s, bv1 - 1.5 * s)]
    blade = r.poly(bpts)
    edge = blade & ~r.poly([(a + 1.3, b) for a, b in bpts])              # the pixels along the cutting edge
    r.paint(blade, STEEL["base"])
    r.paint(blade & (r.v >= bm - 0.5), STEEL["lt"])                       # the upper half catches the light
    r.paint(blade & (r.u >= -4.5 * s) & (r.v < bm - 0.5), STEEL["sh"])
    r.paint(edge, STEEL["hi"])                                            # the bright honed edge
    r.paint(edge & (r.v < bv0 - 0.5 * s), STEEL["lt"])
    # the back hook, right: out and curling down to a point
    hook = r.poly([(1.5 * s, L + 3 * s), (5 * s, L + 2.5 * s), (7.5 * s, L + 0.5 * s), (8.3 * s, L - 2.6 * s),
                   (7 * s, L - 1.0 * s), (5 * s, L + 0.6 * s), (1.5 * s, L + 0.8 * s)])
    r.paint(hook, IRON["base"]); r.paint(hook & (r.v >= L + 2 * s), IRON["hi"]); r.paint(hook & (r.u > 6.5 * s) & (r.v < L), IRON["sh"])
    # socket
    r.paint(sock, IRON["base"]); r.paint(sock & (r.u < -w / 2 + 0.5), IRON["hi"]); r.paint(sock & (r.u > w / 2 - 0.5), IRON["sh"])
    r.paint(sock & (np.abs(r.v - (L + 4 * s)) < 0.5 * s), IRON["sh"])
    # the top spike: a long square point
    sp0, sp1 = L + 8 * s, L + 20 * s
    t = np.clip((r.v - sp0) / (sp1 - sp0), 0, 1)
    spike = (np.abs(r.u) < 1.6 * s * (1 - t) + 0.45) & (r.v >= sp0) & (r.v < sp1)
    r.paint(spike, STEEL["base"]); r.paint(spike & (r.u < 0), STEEL["lt"]); r.paint(spike & (r.u < -0.8 * s) , STEEL["hi"])
    r.paint(spike & (r.u >= 0.5), STEEL["sh"])
    return r.finish({"grip": (0, GV)})


# ------------------------------------------------------------------ the spear
def spear(theta, s=1.0, shaft_len=None):
    """a throwing spear, 52 px: a slim shaft, a cord binding at the balance where the hand holds it,
    a socketed leaf-shaped iron head with a midrib."""
    GV = 22 * s
    L = 40 * s if shaft_len is None else shaft_len
    r = Raster(theta, GV, L + 16 * s)
    w = 2.5 * s
    shaft = r.box(-w / 2, w / 2, 0, L + 1)
    tone3(r, shaft, WOOD, w)
    r.paint(shaft & (r.v < 1), WOOD["sh"])
    bind = r.box(-w / 2, w / 2, GV - 4 * s, GV + 4 * s)
    wrap_bands(r, bind, WRAP, w)
    # socket
    sock = r.box(-1.5 * s, 1.5 * s, L - 1 * s, L + 3 * s)
    r.paint(sock, IRON["base"]); r.paint(sock & (r.u < -0.5 * s), IRON["hi"]); r.paint(sock & (r.u >= 0.5 * s), IRON["sh"])
    # the leaf head: widest a third of the way up, a long point
    h0, h1 = L + 2.5 * s, L + 14.5 * s
    t = (r.v - h0) / (h1 - h0)
    tc = np.clip(t, 0, 1)
    half = np.where(tc < 0.32, 1.2 * s + (3.1 * s - 1.2 * s) * np.sqrt(tc / 0.32), 3.1 * s * np.clip(1 - (tc - 0.32) / 0.68, 0, 1) ** 0.85)
    head = (np.abs(r.u) < half + 0.2) & (t >= 0) & (t < 1)
    r.paint(head, STEEL["base"]); r.paint(head & (r.u < 0), STEEL["lt"]); r.paint(head & (r.u < -half + 0.9), STEEL["hi"])
    r.paint(head & (r.u >= half - 0.9) & (r.u > 0.5), STEEL["sh"])
    r.paint(head & (np.abs(r.u) < 0.5) & (t > 0.05) & (t < 0.8), STEEL["sh"])          # the midrib's shade line
    return r.finish({"grip": (0, GV)})


# ------------------------------------------------------------------ arrows (hand-pixelled: 10 px wide is grid work)
ARROW_PAL = {"o": OUTLINE, "g": IRON["gl"], "H": IRON["hi"], "I": IRON["base"], "i": IRON["sh"],
             "S": SHAFT["hi"], "s": SHAFT["base"], "w": WRAP["base"], "W": WRAP["hi"],
             "F": GOOSE["hi"], "f": GOOSE["base"], "G": GOOSE["sh"], "n": WOOD["sh"], "N": WOOD["base"],
             "R": PITCH["hi"], "r": PITCH["base"], "d": PITCH["sh"], "c": PITCH["cord"], "C": PITCH["cord_sh"],
             "e": PITCH["ember"], "y": PITCH["glow"]}
# an arrow, 10 x 36: a socketed leaf-bodkin head, a binding, a pale two-tone shaft, shield-cut grey goose
# fletching (two vanes in profile, barred), a dark nock. The shaft is columns 4-5.
ARROW_HEAD = [
    "....oo....",
    "...ogIo...",
    "...oHIo...",
    "..ogHIio..",
    "..oHHIio..",
    ".ogHHIiio.",
    ".oHHHIiio.",
    ".oHHIIiio.",
    "..oHHIio..",
    "...oHIo...",
    "...oIio...",
]
ARROW_SHAFT = "...oSso..."
ARROW_TAIL = [
    "...oWwo...",
    "..oFSsfo..",
    "..oFSsfo..",
    ".oFFSsffo.",
    ".oGFSsfGo.",
    ".oFFSsffo.",
    "oFGFSsfGfo",
    "oFFFSsfffo",
    "oGFFSsfGfo",
    "oFFFSsfffo",
    "oooFSsfooo",
    "...oWwo...",
    "...oNno...",
    "...oooo...",
]
# the fire arrow's rag, bound behind the head: sooty pitch, cord turns, a frayed end, two embers
FIRE_RAG = [
    "..orrrro..",
    ".oRrcCddo.",
    ".oRreCrdo.",
    "oRrrcCrddo",
    "oRrrrrryddo"[:10],
    "oRccccCCdo",
    ".oRrrrddo.",
    ".oRrercdo.",
    "..oRrddo..",
    "..odoSso..",
    "...o.Sso..",
]


def arrow_grid(fire=False):
    n_shaft = 36 - len(ARROW_HEAD) - len(ARROW_TAIL)
    body = [ARROW_SHAFT] * n_shaft
    if fire:
        body = FIRE_RAG + body[len(FIRE_RAG):]
    rows = ARROW_HEAD + body + ARROW_TAIL
    c = Canvas(10, len(rows))
    for y, row in enumerate(rows):
        for x, ch in enumerate(row):
            if ch != ".":
                c.paint((np.arange(c.h)[:, None] == y) & (np.arange(c.w)[None, :] == x), ARROW_PAL[ch])
    return c.image()[0]


# ------------------------------------------------------------------ the bow
def bow(theta=0, s=1.0):
    """a yew self bow, strung: a D of yew with its pale sapwood back (left) and its orange heartwood
    belly, a leather grip wrap, the tips shaped to nocks, a pale string. Upright, the back to the left."""
    Lh = 26 * s                      # half the length, tip to grip
    r = Raster(theta, Lh, Lh + 4)
    v = r.v - Lh                     # centred on the grip
    t = np.clip(v / Lh, -1, 1)
    depth = 10 * s                   # how far the grip stands off the string
    cu = -depth * (1 - t ** 2)       # the limb's centre line
    hw = 2.3 * s - 1.2 * s * np.abs(t)                  # the limb's half width, thicker at the grip
    limb = (np.abs(r.u - cu) < hw) & (np.abs(v) < Lh)
    # string, tip to tip on the right
    su = 0.0
    tip_v = Lh - 1.0 * s
    sw = 0.55 if theta % 90 == 0 else 0.75                 # on a diagonal, wide enough to stay 4-connected
    string = (np.abs(r.u - su) < sw) & (np.abs(v) < tip_v)
    r.paint(string, STRING["base"])
    r.paint(string & (np.abs(v) > tip_v - 3 * s), STRING["sh"])         # the loops at the nocks
    # the limbs: sapwood on the back, heartwood belly, shade toward the string
    r.paint(limb, YEW["base"])
    r.paint(limb & (r.u - cu < -hw + 1.0), YEW["sap"])
    r.paint(limb & (r.u - cu < -hw + 1.0) & (v < 0), YEW["sap_sh"])
    r.paint(limb & (r.u - cu > hw - 1.0) & (r.u - cu > -hw + 1.0), YEW["sh"])
    # the nocks: dark tips
    r.paint(limb & (np.abs(v) >= Lh - 1.6 * s), YEW["dk"])
    # the grip wrap
    gw = (np.abs(r.u - cu) < hw + 0.6) & (np.abs(v) < 3.2 * s)
    wrap_bands(r, gw, LEATHER, 2 * hw.max() if np.ndim(hw) else 2 * hw, step=2, slope=0.0)
    return r.finish({"grip": (-depth, Lh)})


# ------------------------------------------------------------------ the shield
def shield(D=36, centre=False):
    """a round shield face on, D px across inside its outline: vertical planks, an iron rim with rivets,
    an iron boss. Light from the top left in stepped bands. The small sizes (in the hand) keep the design
    with fewer, narrower planks, a smaller boss, and no rivets (they would only be noise at 17 px).
    With centre=True also returns the disc's centre pixel in the cropped image."""
    big = D >= 30
    W = D + 2
    c = Canvas(W, W)
    yy, xx = np.mgrid[0:W, 0:W].astype(float) + 0.5
    cx = cy = W / 2
    dx, dy = xx - cx, yy - cy
    rr = np.hypot(dx, dy)
    R = D / 2
    light = (dx + dy) / (math.sqrt(2) * R)        # -1 at the top-left, +1 at the bottom-right
    body = rr <= R
    rim_w = 2.2 if D >= 30 else 1.6
    wood = rr <= R - rim_w
    # planks
    pw = 6 if big else 4
    col = np.floor((xx - (cx - 3 * pw)) / pw).astype(int)
    c.paint(wood, PLANK["a"])
    c.paint(wood & (col % 2 == 1), PLANK["b"])
    seam = wood & (((xx - (cx - 3 * pw)) % pw) < 1)
    grain = wood & (hashn(np.floor(xx).astype(int), np.floor(yy / 4).astype(int), 5) % 7 == 0) & ~seam
    c.paint(grain, PLANK["grain"])
    c.paint(wood & (light < -0.45) & ~seam, PLANK["hi"])
    c.paint(wood & (light > 0.5) & ~seam, PLANK["sh"])
    c.paint(seam, PLANK["seam"])
    # the rim
    rim = body & ~wood
    c.paint(rim, IRON["base"]); c.paint(rim & (light < -0.2), IRON["hi"]); c.paint(rim & (light > 0.45), IRON["sh"])
    c.paint(rim & (rr > R - 0.9) & (light > 0.0), IRON["sh"])
    c.paint((rr > R - rim_w - 1) & (rr <= R - rim_w) & (light > -0.3), PLANK["seam"])   # the rim's shadow on the wood
    # rivets round the rim, on the wood just inside it
    for k in range(10 if big else 0):
        a = math.radians(18 + 36 * k)
        px_, py_ = cx + (R - rim_w - 1.6) * math.cos(a), cy + (R - rim_w - 1.6) * math.sin(a)
        m = (np.floor(xx) == math.floor(px_)) & (np.floor(yy) == math.floor(py_))
        c.paint(m, IRON["gl"] if (px_ - cx + py_ - cy) < 0 else IRON["hi"])
    # the boss
    bR = 5.2 if big else 2.3
    ring = (rr <= bR + 1.0) & (rr > bR)
    c.paint(ring, OUTLINE)
    boss = rr <= bR
    bl = (dx + dy) / (math.sqrt(2) * bR)
    c.paint(boss, IRON["base"]); c.paint(boss & (bl < -0.25), IRON["hi"]); c.paint(boss & (bl > 0.45), IRON["sh"])
    gl = (np.hypot(dx + bR * 0.38, dy + bR * 0.38) <= 1.0)
    c.paint(gl, STEEL["lt"])
    c.outline()
    im, (x0, y0) = c.image()
    if centre:
        assert W % 2 == 1, "an odd canvas has a centre pixel"
        return im, (W // 2 - x0, W // 2 - y0)
    return im


# ------------------------------------------------------------------ the bow by facing (in the hand)
def bow_facing(b):
    """the bow standing upright in the hand, seen with its belly offset b px: 27 px tall (13 each side of
    the grip), the riser bowed out to the right by b, the tips curving back to the left, the string
    straight on the left between them. The back (right, away from the archer) shows its pale sapwood,
    the belly (left, toward the string) the orange heartwood. Grip is the riser's middle pixel."""
    H = 13
    r = Raster(0, H, H + 8, ss=3)
    t = np.clip((r.v - H) / H, -1, 1)
    su = -int(b + 0.5)                                   # the string's column, a whole pixel
    cu = su + (-su) * (1 - t ** 2)                       # the limb's centre: on the riser at the grip, the string at the tips
    hw = 1.5 - 0.85 * np.abs(t)                          # 3 px at the riser, 1 at the tips
    inside = (r.v >= -0.01) & (r.v <= 2 * H + 0.99)
    limb = (np.abs(r.u - cu) < hw) & inside
    string = (np.abs(r.u - su) < 0.5) & (r.v >= 1) & (r.v < 2 * H)
    r.paint(string, STRING["base"])
    r.paint(string & ((r.v < 3) | (r.v >= 2 * H - 2)), STRING["sh"])
    r.paint(limb, YEW["base"])
    r.paint(limb & (r.u - cu < -hw + 1.0), YEW["hi"])                    # the belly, lit from the left
    r.paint(limb & (r.u - cu >= hw - 1.0) & (np.abs(t) < 0.75), YEW["sap_sh"])   # the sapwood back, on the shade side
    r.paint(limb & (np.abs(t) >= 0.86), YEW["dk"])                       # the nocks
    wrap = (np.abs(r.u - cu) < hw + 0.2) & (np.abs(r.v - H) < 2.5)
    r.paint(wrap, LEATHER["base"]); r.paint(wrap & (np.floor(r.v) % 2 == 0), LEATHER["sh"])
    r.paint(wrap & (r.u < -0.6) & (np.floor(r.v) % 2 == 1), LEATHER["hi"])
    return r.finish({"grip": (0, H)})


ARROW_WORLD = [
    "..o..",
    ".ogo.",
    ".oHo.",
    "oHHIo",
    "ogHio",
    "oHIio",
    ".oIo.",
    ".oWo.",
    ".oSo.",
    ".oSo.",
    ".oSo.",
    ".oSo.",
    ".oSo.",
    ".oSo.",
    ".oSo.",
    ".oSo.",
    ".oWo.",
    "oFSfo",
    "oFSfo",
    "oGSGo",
    "oFSfo",
    "oFSfo",
    ".oNo.",
    "..o..",
]
FIRE_ARROW_RAG = [          # rows 7..11 of the fire arrow's world picture: the rag behind the head
    "oRrdo",
    "occCo",
    "oRedo",
    "oycCo",
    ".odo.",
]


def arrow_world(fire=False):
    """the arrow at 1x as it is held, point up, 5 x 24: the icon's design with a one-pixel shaft"""
    rows = list(ARROW_WORLD)
    if fire: rows[7:7 + len(FIRE_ARROW_RAG)] = FIRE_ARROW_RAG
    c = Canvas(5, len(rows))
    for y, row in enumerate(rows):
        for x, ch in enumerate(row):
            if ch != ".":
                c.paint((np.arange(c.h)[:, None] == y) & (np.arange(c.w)[None, :] == x), ARROW_PAL[ch])
    im, _ = c.image()
    return im, (2, 12)                                  # the shaft's middle


# ------------------------------------------------------------------ output helpers
def check_hard(im):
    return set(np.unique(np.array(im)[..., 3]).tolist()) <= {0, 255}


def on_canvas(im, w, h, dx=0, dy=0):
    out = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    assert im.width <= w and im.height <= h, (im.size, w, h)
    out.alpha_composite(im, ((w - im.width) // 2 + dx, (h - im.height) // 2 + dy))
    return out


def save(im, name):
    assert check_hard(im), name
    im.save(os.path.join(OUT, name + ".png"))
    return im


def fit_scale(fn, wmax, hmax, theta=0, lo=0.5, hi=3.0, **kw):
    """the largest scale (to 0.02) whose rendering fits wmax x hmax"""
    best = lo
    s = lo
    while s <= hi:
        im, _ = fn(theta, s, **kw)
        if im.width <= wmax and im.height <= hmax: best = s
        s = round(s + 0.02, 2)
    return best


# ------------------------------------------------------------------ build
def main():
    os.makedirs(OUT, exist_ok=True)
    for f in os.listdir(OUT):
        if f.endswith(".png") or f.endswith(".json"): os.remove(os.path.join(OUT, f))
    M = {}
    world_imgs = {}

    held_specs = [
        # id, fn, bag (cols, rows), portrait builder
        ("sword", sword, (1, 3)),
        ("mace", mace, (1, 2)),
        ("halberd", halberd, (1, 5)),
        ("spear", spear, (1, 4)),
    ]
    for iid, fn, (cols, rows) in held_specs:
        angles = []
        for th, sfx in ANGLES:
            im, pts = fn(th)
            save(im, f"{iid}_world{sfx}")
            angles.append({"src": f"{iid}_world{sfx}.png", "grip": list(pts["grip"]), "size": list(im.size)})
            world_imgs.setdefault(iid, []).append((th, im, pts["grip"]))
        # the bag: the same design rendered to fill its footprint (as round 3's plank, stick, hatchet, shovel)
        W, H = CELL * cols, CELL * rows
        kw = {}
        if iid == "halberd":
            # the head is as wide as the cell allows at 1x; the pole is drawn longer to fill the five cells
            s_icon = 0.9
            kw = {"pole_len": 58 + (H - 3 - 78)}
            ic, _ = fn(0, s_icon, **kw)
        elif iid == "spear":
            kw = {"shaft_len": 40 + (H - 3 - 56)}
            ic, _ = fn(0, 1.0, **kw); s_icon = 1.0
        else:
            s_icon = fit_scale(fn, W - 2, H - 2)
            ic, _ = fn(0, s_icon)
        save(on_canvas(ic, W, H), f"{iid}_icon")
        # the portrait: on the diagonal, the head up and to the right
        if iid == "halberd":
            pim, _ = fn(45, 1.0, pole_len=26)
        elif iid == "spear":
            pim, _ = fn(45, 1.0, shaft_len=30)
        else:
            ps = fit_scale(fn, 36, 36, theta=45); pim, _ = fn(45, ps)
        save(on_canvas(pim, 38, 38), f"{iid}_portrait")
        M[iid] = {"icon": [W, H], "portrait": True,
                  "held": {"mode": "angles", "angles": [{"src": a["src"], "grip": a["grip"]} for a in angles]},
                  "sizes": {a["src"]: a["size"] for a in angles},
                  "icon_scale": s_icon}

    # shield: icon and portrait, the same drawing
    sh = shield(36)
    save(on_canvas(sh, 38, 38), "shield_icon")
    save(on_canvas(sh, 38, 38), "shield_portrait")
    M["shield"] = {"icon": [38, 38], "portrait": True, "held": None}

    # bow: upright in its 2 x 3 bag footprint, on the diagonal in the slot
    bs = fit_scale(bow, 36, 55)
    bi, _ = bow(0, bs)
    save(on_canvas(bi, 38, 57), "bow_icon")
    bps = fit_scale(bow, 36, 36, theta=45)
    bp, _ = bow(45, bps)
    save(on_canvas(bp, 38, 38), "bow_portrait")
    M["bow"] = {"icon": [38, 57], "portrait": True, "held": None}

    # arrows: upright, a little left of centre so the stack count's corner stays clear
    for iid, fire in (("arrow", False), ("fire_arrow", True)):
        im = arrow_grid(fire)
        save(on_canvas(im, 19, 38, -3, -1), f"{iid}_icon")
        M[iid] = {"icon": [19, 38], "portrait": False, "held": None}

    # ---- round 4b: the in-hand pictures for the icons that had none (the pair rule)
    for iid, fire in (("arrow", False), ("fire_arrow", True)):
        im, grip = arrow_world(fire)
        save(im, f"{iid}_world")
        M[iid]["held"] = {"mode": "fixed", "image": f"{iid}_world.png", "grip": list(grip)}
        M[iid]["sizes"] = {f"{iid}_world.png": list(im.size)}
    sw, (cx, cy) = shield(17, centre=True)
    save(sw, "shield_world")
    sg, (gx, gy) = shield(19, centre=True)
    save(sg, "shield_guard")
    M["shield"]["held"] = {"mode": "fixed", "image": "shield_world.png", "grip": [cx, cy + 3], "swing": False}
    M["shield"]["guard"] = {"image": "shield_guard.png", "grip": [gx, gy - 4]}
    M["shield"]["sizes"] = {"shield_world.png": list(sw.size), "shield_guard.png": list(sg.size)}
    M["shield"]["centres"] = {"shield_world.png": [cx, cy], "shield_guard.png": [gx, gy]}
    facings, sizes = [], {}
    for th, sfx in ANGLES:
        b = max(1.5, 4.5 * math.sin(math.radians(th)))
        im, pts = bow_facing(b)
        save(im, f"bow_world{sfx}")
        facings.append({"src": f"bow_world{sfx}.png", "grip": list(pts["grip"])})
        sizes[f"bow_world{sfx}.png"] = list(im.size)
    M["bow"]["held"] = {"mode": "facings", "facings": facings, "pose": "bow_rest"}
    M["bow"]["sizes"] = sizes
    return M, world_imgs


# ------------------------------------------------------------------ manifest, preview
NOTES = {
    "sword": "Arming sword. Plain steel blade with a fuller, brass cross and round brass pommel, brown leather wrapped grip. 36 px long at 1x with its outline. Grip on the middle of the wrap. Icon: the same design rendered at {s}x to fill the 1 x 3 footprint; portrait: the same design on the 45 degree diagonal.",
    "mace": "Flanged mace. Iron head of flanges (two in profile, one face on, dark grooves between, a short top point), wooden haft, leather grip wrap, iron butt cap. Grip on the wrap. Icon rendered at {s}x to fill the 1 x 2 footprint; portrait on the diagonal.",
    "halberd": "Halberd, two hands. Ash pole shod with iron, leather grip near the butt (where the generated halberd is held), iron langets, a convex axe blade on the left (the lit side), a back hook curling down on the right, a long square top spike. About 80 px long at 1x. The head is 20 px wide at 1x, one more than the 19 px cell, so the icon is drawn at 0.9x with the pole lengthened to fill the five cells; the portrait is the head at 1x on a shortened pole, on the diagonal.",
    "spear": "Throwing spear. Slim wooden shaft, cord binding at the balance (the grip), iron socket, leaf-shaped head with a midrib. About 55 px long at 1x. Icon at 1x with the shaft lengthened to fill the four cells; portrait at 1x with a shortened shaft on the diagonal. Its flight keeps the generated picture.",
    "shield": "Wooden shield. Round, vertical planks with seams and grain, iron rim with ten rivets, iron boss with its own outline ring. Icon and portrait are the same 36 px drawing. In the hand (shield_world, 19 px with its outline, a 17 px disc) and raised (shield_guard, 21 px, a 19 px disc) it is the same design with four-pixel planks, a smaller boss, and no rivets. Held grip 3 px below the disc's centre; the guard's grip 4 px above it (the engine draws the guard's centre 4 px below its anchor).",
    "bow": "Hunting bow. Yew self bow, strung: pale sapwood back, orange heartwood belly, dark nock tips, leather grip wrap, pale string. Upright in the 2 x 3 icon (back to the left), on the diagonal in the portrait. In the hand it is drawn by facing (Michael: the bow stays upright on screen): five upright pictures, 27 px of bow, the belly's offset max(1.5, 4.5 sin angle) to the right (the string column rounded to a whole pixel: 2, 2, 3, 4, 5 px), the string on the left; the engine mirrors them for facing left. Grip on the riser's middle, on the wrap.",
    "arrow": "Arrow. Hand-pixelled 10 x 36: iron leaf-bodkin head, pale two-tone shaft, shield-cut grey goose fletching with barring, bindings, dark nock. Placed 3 px left of centre and 1 px up so the lower-right corner stays clear for the stack count. arrow_world is the same design at 1x with a one-pixel shaft (5 x 24), point up, held fixed by the shaft's middle.",
    "fire_arrow": "Fire arrow. The arrow with a pitch-soaked rag bound behind the head: sooty, cord turns, a frayed end, two ember pixels and one glow pixel. Same placement as the arrow. fire_arrow_world is the 5 x 24 arrow with the rag bound behind the head, held fixed by the shaft's middle.",
}


def manifest(M):
    out = {}
    for k, v in M.items():
        e = {"icon": v["icon"], "portrait": v["portrait"], "held": v["held"]}
        if "guard" in v: e["guard"] = v["guard"]
        if v.get("sizes"): e["world_sizes"] = v["sizes"]
        e["notes"] = NOTES[k].format(s=v.get("icon_scale", 1.0))
        out[k] = e
    with open(os.path.join(HERE, "manifest.json"), "w") as f:
        json.dump(out, f, indent=1)
    return out


BG = (30, 27, 24, 255)
SLOT = (0x2a, 0x26, 0x22, 255)
LINE = (0x3b, 0x35, 0x2f, 255)
GRASS = (75, 95, 61, 255)
TXT = (214, 204, 186, 255)
SUB = (160, 150, 136, 255)
GRIP = (255, 48, 64, 255)


def up(im, k): return im.resize((im.width * k, im.height * k), Image.NEAREST)


def grip_of(M, i, src):
    return [a for a in M[i]["held"]["angles"] if a["src"] == src][0]["grip"]


def preview(M):
    ids = ["sword", "mace", "halberd", "spear", "shield", "bow", "arrow", "fire_arrow"]
    held = ["sword", "mace", "halberd", "spear"]
    sections = []
    # icons at 2x on their footprint, the cells drawn faintly
    row = []
    for i in ids:
        ic = Image.open(os.path.join(OUT, f"{i}_icon.png"))
        slot = Image.new("RGBA", (ic.width * 2, ic.height * 2), SLOT)
        d = ImageDraw.Draw(slot)
        for x in range(ic.width // CELL):
            for y in range(ic.height // CELL):
                d.rectangle([x * 38, y * 38, x * 38 + 37, y * 38 + 37], outline=LINE)
        slot.alpha_composite(up(ic, 2))
        row.append((i, slot))
    sections.append(("Bag icons at 2x on the slot colour (cells drawn faintly)", row))
    # portraits at 2x
    row = []
    for i in ids:
        pth = os.path.join(OUT, f"{i}_portrait.png")
        if os.path.exists(pth):
            slot = Image.new("RGBA", (76, 76), SLOT); slot.alpha_composite(up(Image.open(pth), 2)); row.append((i, slot))
    sections.append(("Portraits at 2x on the slot colour", row))
    # world angles at 3x, grip pixel boxed in red
    for i in held:
        row = []
        for th, sfx in ANGLES:
            src = f"{i}_world{sfx}.png"
            im = Image.open(os.path.join(OUT, src)); gx, gy = grip_of(M, i, src)
            bg = Image.new("RGBA", (im.width * 3 + 6, im.height * 3 + 6), GRASS)
            bg.alpha_composite(up(im, 3), (3, 3))
            ImageDraw.Draw(bg).rectangle([3 + gx * 3 - 1, 3 + gy * 3 - 1, 3 + gx * 3 + 3, 3 + gy * 3 + 3], outline=GRIP)
            row.append((f"{th} deg {im.width}x{im.height} grip {gx},{gy}", bg))
        sections.append((f"{i}: world angles at 3x, the grip pixel boxed in red", row))
    # in the hand at 3x: the figure from the repo's docs/art/previews/preview_items_3x.png (read only)
    srcp = Image.open(os.path.join(REPO, "docs/art/previews/preview_items_3x.png")).convert("RGBA")
    fig1 = Image.fromarray(np.array(srcp)[1::3, 1::3])
    HAND = (154, 85)                    # that figure's right hand, where its throwing knife's grip sits
    # lift the figure's throwing knife off (its pixels to the grass tone) so only our item is in the hand
    kn = np.array(Image.open(os.path.join(REPO, "data/art/items/throwing_knife_world.png")).convert("RGBA"))
    fa = np.array(fig1)
    kx, ky = HAND[0] - 2, HAND[1] - 9
    sub = fa[ky:ky + kn.shape[0], kx:kx + kn.shape[1]]
    sub[kn[..., 3] > 0] = GRASS
    # and the next figure along: its columns replaced with grass from the empty rows above the figures
    for y in range(0, fa.shape[0]):
        fa[y, 168:230] = fa[y % 28, 168:230]
    fig1 = Image.fromarray(fa)
    row = []
    for i in held:
        for th, sfx in ((0, ""), (45, "_45")):
            src = f"{i}_world{sfx}.png"
            im = Image.open(os.path.join(OUT, src)); gx, gy = grip_of(M, i, src)
            box = (HAND[0] - 34, HAND[1] - 74, HAND[0] + 54, HAND[1] + 26)
            scene = fig1.crop(box).copy()
            scene.alpha_composite(im, (HAND[0] - box[0] - gx, HAND[1] - box[1] - gy))
            row.append((f"{i} {th} deg", up(scene, 3)))
    sections.append(("In the hand at 3x, beside the 55 px figure (the grip on the hand)", row))

    pad, lab = 12, 14
    Wd = 1500
    laid = []
    for title, row in sections:
        lines, cur, cw = [], [], pad
        for lb, im in row:
            w = max(im.width, len(lb) * 6)
            if cw + w + pad > Wd and cur:
                lines.append(cur); cur, cw = [], pad
            cur.append((lb, im)); cw += w + pad
        if cur: lines.append(cur)
        laid.append((title, lines))
    Ht = pad + sum(lab + sum(max(im.height for _, im in ln) + lab + pad for ln in lines) for _, lines in laid)
    out = Image.new("RGBA", (Wd, Ht), BG)
    d = ImageDraw.Draw(out)
    y = pad
    for title, lines in laid:
        d.text((pad, y), title, fill=TXT); y += lab
        for ln in lines:
            x = pad; hh = max(im.height for _, im in ln)
            for lb, im in ln:
                out.alpha_composite(im, (x, y))
                d.text((x, y + im.height + 2), lb, fill=SUB)
                x += max(im.width, len(lb) * 6) + pad
            y += hh + lab + pad
    out.save(os.path.join(HERE, "preview.png"))
    return out.size


def preview_more(M):
    """round 4b's pieces only: each at 1x and 3x on grass with the grip boxed red, and the 1x row beside the
    55 px figure (the arrow, the shield and the bow side on with their grips on its hand)."""
    names = [("arrow_world", M["arrow"]["held"]["grip"]), ("fire_arrow_world", M["fire_arrow"]["held"]["grip"]),
             ("shield_world", M["shield"]["held"]["grip"]), ("shield_guard", M["shield"]["guard"]["grip"])]
    names += [(f["src"][:-4], f["grip"]) for f in M["bow"]["held"]["facings"]]
    pad, lab = 12, 14
    cells = []
    for n, (gx, gy) in names:
        im = Image.open(os.path.join(OUT, n + ".png"))
        one = Image.new("RGBA", (im.width + 4, im.height + 4), GRASS); one.alpha_composite(im, (2, 2))
        three = Image.new("RGBA", (im.width * 3 + 6, im.height * 3 + 6), GRASS); three.alpha_composite(up(im, 3), (3, 3))
        ImageDraw.Draw(three).rectangle([3 + gx * 3 - 1, 3 + gy * 3 - 1, 3 + gx * 3 + 3, 3 + gy * 3 + 3], outline=GRIP)
        cells.append((f"{n} {im.width}x{im.height} grip {gx},{gy}", one, three))
    # beside the figure at 3x
    srcp = Image.open(os.path.join(REPO, "docs/art/previews/preview_items_3x.png")).convert("RGBA")
    fa = np.array(srcp)[1::3, 1::3].copy()
    kn = np.array(Image.open(os.path.join(REPO, "data/art/items/throwing_knife_world.png")).convert("RGBA"))
    HAND = (154, 85)
    sub = fa[HAND[1] - 9:HAND[1] - 9 + kn.shape[0], HAND[0] - 2:HAND[0] - 2 + kn.shape[1]]
    sub[kn[..., 3] > 0] = GRASS
    for y in range(fa.shape[0]): fa[y, 168:230] = fa[y % 28, 168:230]
    fig1 = Image.fromarray(fa)
    scenes = []
    for n, (gx, gy) in [names[0], names[1], names[2], names[3], names[-1]]:
        im = Image.open(os.path.join(OUT, n + ".png"))
        box = (HAND[0] - 34, HAND[1] - 60, HAND[0] + 26, HAND[1] + 22)
        sc = fig1.crop(box).copy(); sc.alpha_composite(im, (HAND[0] - box[0] - gx, HAND[1] - box[1] - gy))
        scenes.append((n + " on the hand", up(sc, 3)))
    Wd = pad + sum(max(c[2].width, len(c[0]) * 6) + pad for c in cells)
    H1 = max(c[1].height for c in cells); H3 = max(c[2].height for c in cells); HS = max(s.height for _, s in scenes)
    Ht = pad + lab + H1 + pad + H3 + lab + pad + lab + HS + lab + pad
    Wd = max(Wd, pad + sum(s.width + pad for _, s in scenes))
    out = Image.new("RGBA", (Wd, Ht), BG); d = ImageDraw.Draw(out)
    d.text((pad, pad), "Round 4b: 1x (top) and 3x (grip boxed red): arrows held, shield held and raised, bow by facing 0 / 22.5 / 45 / 67.5 / 90", fill=TXT)
    x = pad; y1 = pad + lab; y3 = y1 + H1 + pad
    for lb, one, three in cells:
        out.alpha_composite(one, (x, y1)); out.alpha_composite(three, (x, y3))
        d.text((x, y3 + three.height + 2), lb, fill=SUB)
        x += max(three.width, len(lb) * 6) + pad
    y = y3 + H3 + lab + pad
    d.text((pad, y), "On the 55 px figure's hand at 3x (the shield's raised guard shown at its anchor too, though the engine draws it before the chest)", fill=TXT)
    y += lab; x = pad
    for lb, sc in scenes:
        out.alpha_composite(sc, (x, y)); d.text((x, y + sc.height + 2), lb, fill=SUB); x += sc.width + pad
    out.save(os.path.join(HERE, "preview_more.png"))
    return out.size


if __name__ == "__main__":
    M, W = main()
    manifest(M)
    print("preview", preview(M))
    print("preview_more", preview_more(M))
    for k, v in M.items():
        print(k, v.get("icon"), v.get("held") and [(a["src"], a["grip"]) for a in v["held"]["angles"]], v.get("sizes"))
