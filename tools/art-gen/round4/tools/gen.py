"""Art round 4, group B: the tools. Pickaxe, hoe, scythe, fishing rod, dirk (item id `knife`),
smith's hammer, shears, lead, bucket.

Written fresh for this round (2026-10-26), after reading Claude Design's archived generators for the
method (a local (u, v) frame per angle, masks, the top-left light, the #2b2522 outline); nothing of
theirs is imported or run. Deterministic: no randomness at all.

Run:  python gen.py      -> out/*.png, manifest.json, preview.png

Local frame for everything that turns: v runs up the tool from its butt end, u across it (+u is the
tool's right when upright, which faces down-right for tilts 0..90, so the -u side is the lit side).
Each angle is rasterised fresh from the shape, never rotated by pixel. `scale` renders the same design
larger for the portraits and the bucket's icon.
"""
import json
import math
import os

import numpy as np
from PIL import Image, ImageDraw

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "out")
OUTLINE = "#2b2522"
CELL = 19
SLOT_BG = (0x2A, 0x26, 0x22, 255)

# ------------------------------------------------------------------ palettes (the house's, from docs/art/01 and 07)
WOOD = dict(hi="#9a6a42", base="#7a5132", sh="#57381f", dk="#45301b")
WRAP = dict(hi="#7a5638", base="#5a3c25", sh="#3e2818")
STEEL = dict(hi="#eef0f4", lt="#c6cad2", base="#9ea2ac", sh="#6e7280", dk="#4a4f5c")
IRON = dict(hi="#8a8c96", base="#5e6068", sh="#3e3f46")
BRASS = dict(hi="#e2c06a", base="#c39a44", sh="#8a6a2a")
CANE = dict(hi="#c09a62", base="#a07a48", sh="#7a5a34", dk="#5a4026")      # the rod: a paler hazel
CORK = dict(hi="#d8b888", base="#bb9563", sh="#8f6c45", ring="#5a3c25")
LINE = dict(hi="#e8e2cc", base="#c8bea0")
FLOAT = dict(red="#b8342a", dk="#7e1f1c", cream="#e6e0cc")
HEMP = dict(hi="#b8996a", base="#9a7c50", sh="#76603c", dk="#56442a")       # the lead: darker than the belt's rope
STAVE = dict(hi="#b08254", base="#94683e", sh="#73502e", dk="#56391f", seam="#4a3020")
INSIDE = dict(far="#5e4028", near="#3a2a1c", floor="#2f2218")
BONE = dict(hi="#e6dcc4", base="#c8bb9c", sh="#9c8e70")


def hx(s):
    s = s.lstrip("#")
    return np.array([int(s[i:i + 2], 16) for i in (0, 2, 4)], np.uint8)


# ------------------------------------------------------------------ the canvas
class Canvas:
    def __init__(self, w, h):
        self.w, self.h = w, h
        self.col = np.zeros((h, w, 3), np.uint8)
        self.a = np.zeros((h, w), bool)

    def paint(self, m, c):
        self.col[m] = hx(c)
        self.a[m] = True

    def px(self, x, y, c):
        if 0 <= x < self.w and 0 <= y < self.h:
            self.col[y, x] = hx(c)
            self.a[y, x] = True

    def outline(self):
        p = np.pad(self.a, 1)
        ring = (p[:-2, 1:-1] | p[2:, 1:-1] | p[1:-1, :-2] | p[1:-1, 2:]) & ~self.a
        self.paint(ring, OUTLINE)

    def grid(self, rows, pal, ox=0, oy=0):
        for y, r in enumerate(rows):
            for x, ch in enumerate(r):
                if ch != ".":
                    self.px(ox + x, oy + y, pal[ch])

    def image(self):
        rgba = np.zeros((self.h, self.w, 4), np.uint8)
        rgba[..., :3] = self.col
        rgba[..., 3] = self.a * 255
        ys = np.where(self.a.any(1))[0]
        xs = np.where(self.a.any(0))[0]
        x0, y0 = int(xs.min()), int(ys.min())
        return Image.fromarray(rgba, "RGBA").crop((x0, y0, int(xs.max()) + 1, int(ys.max()) + 1)), (x0, y0)


class Raster:
    """A canvas whose every pixel centre carries the tool's local (u, v), in design units: the grip point
    sits at the canvas centre, the tool tilted `theta` degrees clockwise from up, drawn `scale` times."""

    def __init__(self, theta, grip_v, scale=1.0, S=200):
        th = math.radians(theta)
        self.ax = (math.sin(th), -math.cos(th))      # screen direction of +v
        self.ac = (math.cos(th), math.sin(th))       # screen direction of +u
        self.s = scale
        self.g = S / 2 + 0.5
        self.grip_v = grip_v
        yy, xx = np.mgrid[0:S, 0:S].astype(float) + 0.5
        dx, dy = xx - self.g, yy - self.g
        self.v = (dx * self.ax[0] + dy * self.ax[1]) / scale + grip_v
        self.u = (dx * self.ac[0] + dy * self.ac[1]) / scale
        self.c = Canvas(S, S)

    def paint(self, m, col):
        self.c.paint(m, col)

    def box(self, u0, u1, v0, v1):
        return (self.u >= u0) & (self.u < u1) & (self.v >= v0) & (self.v < v1)

    def cap(self, a, b, r):
        """a capsule from local point a to b, radius r (design units)"""
        a, b = np.array(a, float), np.array(b, float)
        ba = b - a
        pu, pv = self.u - a[0], self.v - a[1]
        h = np.clip((pu * ba[0] + pv * ba[1]) / max(ba @ ba, 1e-9), 0, 1)
        return np.hypot(pu - h * ba[0], pv - h * ba[1]) < r

    def poly(self, pts, r):
        m = np.zeros_like(self.u, bool)
        for a, b in zip(pts, pts[1:]):
            m |= self.cap(a, b, r)
        return m

    def line(self, pts, col):
        """a one-pixel line through local points, drawn in screen space (Bresenham) so it never breaks"""
        sp = [self.to_px(*p) for p in pts]
        for (x0, y0), (x1, y1) in zip(sp, sp[1:]):
            dx, dy = abs(x1 - x0), -abs(y1 - y0)
            sx, sy = (1 if x0 < x1 else -1), (1 if y0 < y1 else -1)
            err = dx + dy
            while True:
                self.c.px(x0, y0, col)
                if x0 == x1 and y0 == y1:
                    break
                e2 = 2 * err
                if e2 >= dy:
                    err += dy
                    x0 += sx
                if e2 <= dx:
                    err += dx
                    y0 += sy

    def to_px(self, lu, lv):
        sx = self.g + (self.ac[0] * lu + self.ax[0] * (lv - self.grip_v)) * self.s
        sy = self.g + (self.ac[1] * lu + self.ax[1] * (lv - self.grip_v)) * self.s
        return int(math.floor(sx)), int(math.floor(sy))

    def finish(self, points):
        self.c.outline()
        im, (x0, y0) = self.c.image()
        pts = {}
        for k, p in points.items():
            x, y = self.to_px(*p)
            pts[k] = (x - x0, y - y0)
        return im, pts


def shaft(r, u0, u1, v0, v1, pal, lit=None, sh=None):
    """a round shaft across u0..u1: the -u side lit, the +u side in shade"""
    w = u1 - u0
    lit = max(1.0 / r.s, w / 4) if lit is None else lit
    sh = max(1.0 / r.s, w / 4) if sh is None else sh
    m = r.box(u0, u1, v0, v1)
    r.paint(m, pal["base"])
    r.paint(m & (r.u < u0 + lit), pal["hi"])
    r.paint(m & (r.u >= u1 - sh), pal["sh"])
    return m


def px1(r):
    """one screen pixel in design units"""
    return 1.0 / r.s


# ------------------------------------------------------------------ pickaxe (1 x 2, angles)
def pickaxe(theta, scale=1.0):
    GV = 6
    r = Raster(theta, GV, scale)
    L = 29
    shaft(r, -1.5, 1.5, 0, L, WOOD)
    r.paint(r.box(-1.5, 1.5, 0, 1), WOOD["dk"])                                  # the butt end
    # a leather grip wrap
    wrap = r.box(-1.5, 1.5, 2.5, 9.5)
    r.paint(wrap, WRAP["base"])
    r.paint(wrap & (np.floor(r.v - 0.5 * r.u) % 3 == 0), WRAP["sh"])
    r.paint(wrap & (r.u < -0.6) & (np.floor(r.v - 0.5 * r.u) % 3 != 0), WRAP["hi"])
    # the head: an arc across the top, two points curving down, thickest at the eye
    hv = 25.5
    cv = hv - 0.062 * r.u ** 2                                                    # centre line, drooping to the points
    t = 2.6 * np.clip(1 - (np.abs(r.u) / 9.0) ** 1.5, 0, 1) + 0.35
    head = (np.abs(r.v - cv) < t) & (np.abs(r.u) < 8.9)
    r.paint(head, IRON["base"])
    r.paint(head & (r.v - cv > t - 1.0 * px1(r) - 0.15), IRON["hi"])            # the lit top
    r.paint(head & (cv - r.v > t - 1.0 * px1(r) - 0.15), IRON["sh"])            # the shaded underside
    tips = head & (np.abs(r.u) > 5.5)
    r.paint(tips, STEEL["base"])
    r.paint(tips & (r.v - cv > -0.2), STEEL["lt"])
    r.paint(tips & (r.u < -7.2), STEEL["hi"])
    # the eye: a collar round the haft
    eye = r.box(-2.5, 2.5, hv - 3.2, hv + 2.0)
    r.paint(eye, IRON["base"])
    r.paint(eye & (r.u < -1.5), IRON["hi"])
    r.paint(eye & (r.u >= 1.5), IRON["sh"])
    r.paint(r.box(-1.5, 1.5, hv + 2.0, hv + 3.0), WOOD["hi"])                 # the haft's end through the eye
    return r.finish({"grip": (0, GV)})


# ------------------------------------------------------------------ smith's hammer (1 x 2, angles)
def hammer(theta, scale=1.0):
    GV = 6
    r = Raster(theta, GV, scale)
    L = 26
    shaft(r, -1.5, 1.5, 0, L, WOOD)
    r.paint(r.box(-1.5, 1.5, 0, 1), WOOD["dk"])
    # a swelled grip end
    knob = r.box(-2.0, 2.0, 0.5, 4.0)
    r.paint(knob, WOOD["base"]); r.paint(knob & (r.u < -1.0), WOOD["hi"]); r.paint(knob & (r.u >= 1.0), WOOD["sh"])
    r.paint(knob & (r.v < 1.5), WOOD["dk"])
    # the head: a cross-peen. The square face on the left (-u), the wedge peen tapering to the right
    v0, v1 = 20.5, 26.5
    mid = (v0 + v1) / 2
    face = r.box(-7.0, -1.5, v0, v1)
    half = np.where(r.u < 2.0, 3.0, 3.0 - (r.u - 2.0) * 0.55)
    peen = (r.u >= -1.6) & (r.u < 6.6) & (np.abs(r.v - mid) < half)
    head = face | peen
    r.paint(head, IRON["base"])
    r.paint(head & (r.v >= v1 - 1.2 * px1(r)), IRON["hi"])                      # the lit top
    r.paint(head & (r.v < v0 + 1.2 * px1(r)) | peen & (r.v - mid < -half + 1.1 * px1(r)), IRON["sh"])
    r.paint(face & (r.u < -6.0), STEEL["lt"])                                    # the polished striking face
    r.paint(face & (r.u < -6.0) & (r.v >= v1 - 1.2 * px1(r)), STEEL["hi"])
    r.paint(peen & (r.u > 5.2), STEEL["base"])                                   # the peen's worn edge
    r.paint(r.box(-1.5, 1.5, v1, v1 + 1.0), WOOD["hi"])                         # the handle's end through the eye
    r.paint(r.box(-0.5, 0.5, v1, v1 + 1.0), IRON["sh"])                         # its wedge
    return r.finish({"grip": (0, GV)})


# ------------------------------------------------------------------ hoe (1 x 3, angles)
def hoe(theta, scale=1.0, L=44):
    GV = 10
    r = Raster(theta, GV, scale)
    shaft(r, -1.5, 1.5, 0, L, WOOD)
    r.paint(r.box(-1.5, 1.5, 0, 1), WOOD["dk"])
    r.paint(r.box(-1.5, 1.5, L - 1, L), WOOD["hi"])
    # the socket: iron round the haft's top
    sock = r.box(-2.0, 2.0, L - 5, L)
    r.paint(sock, IRON["base"]); r.paint(sock & (r.u < -1.0), IRON["hi"]); r.paint(sock & (r.u >= 1.0), IRON["sh"])
    # the blade: a flat iron plate standing off the socket at right angles, its far end turned down to the edge
    bt, bb = L + 0.0, L - 3.4                                                      # the plate's top and bottom
    out = -10.0
    plate = (r.u >= out) & (r.u < -1.5) & (r.v >= bb + 0.18 * (r.u + 1.5)) & (r.v < bt)
    lip = (r.u >= out) & (r.u < out + 2.6) & (r.v >= bb - 3.2) & (r.v < bt)
    blade = plate | lip
    r.paint(blade, IRON["base"])
    r.paint(blade & (r.v >= bt - 1.0 * px1(r)), IRON["hi"])                       # the lit top face
    r.paint(plate & ~lip & (r.v < bb + 0.18 * (r.u + 1.5) + 1.0 * px1(r)), IRON["sh"])
    r.paint(lip & (r.u >= out + 2.6 - 1.0 * px1(r)) & (r.v < bt - 1.0 * px1(r)), IRON["sh"])
    r.paint(lip & (r.u < out + 1.0 * px1(r)), STEEL["base"])
    r.paint(lip & (r.v < bb - 3.2 + 1.0 * px1(r)), STEEL["lt"])                     # the bright worn edge
    r.paint(lip & (r.v < bb - 3.2 + 1.0 * px1(r)) & (r.u < out + 1.0 * px1(r)), STEEL["hi"])
    return r.finish({"grip": (0, GV)})


# ------------------------------------------------------------------ scythe (1 x 3, angles)
def scythe(theta, scale=1.0, L=49):
    GV = 9
    r = Raster(theta, GV, scale)
    bow = 1.0 * np.sin(np.clip(r.v / L, 0, 1) * math.pi)                         # the snath's gentle bend
    su = r.u - bow
    snath = (np.abs(su) < 1.5) & (r.v >= 0) & (r.v < L)
    r.paint(snath, WOOD["base"]); r.paint(snath & (su < -0.6), WOOD["hi"]); r.paint(snath & (su >= 0.6), WOOD["sh"])
    r.paint(snath & (r.v < 1), WOOD["dk"])
    # the end grip: a leather wrap where the hand holds
    wrap = snath & (r.v >= 5) & (r.v < 13)
    r.paint(wrap, WRAP["base"])
    r.paint(wrap & (np.floor(r.v - 0.5 * su) % 3 == 0), WRAP["sh"])
    r.paint(wrap & (su < -0.6) & (np.floor(r.v - 0.5 * su) % 3 != 0), WRAP["hi"])
    # the nib: the second hand grip, a peg standing off to the right part way up
    nv = round(0.57 * L)
    b0 = 1.0 * math.sin(nv / L * math.pi)
    nib = r.cap((b0 - 1.0, nv), (b0 - 5.0, nv + 2.0), 1.1)
    r.paint(nib, WOOD["base"]); r.paint(nib & (r.v > nv + 0.6 - 0.5 * (r.u - b0 + 1)), WOOD["hi"])
    r.paint(nib & (r.v < nv - 0.4 - 0.5 * (r.u - b0 + 1)), WOOD["sh"])
    # the iron ring that fixes the blade's tang to the snath's head
    ring = (np.abs(su) < 2.0) & (r.v >= L - 5) & (r.v < L - 2.5)
    r.paint(ring, IRON["base"]); r.paint(ring & (su < -1.0), IRON["hi"]); r.paint(ring & (su >= 1.0), IRON["sh"])
    # the blade: from the snath's head off to the left, long, curving down to its point, the edge underneath
    x = -(r.u - 0.5)                                                               # distance out along the blade
    spine = L + 0.3 - 0.024 * x ** 2
    width = 4.6 * np.clip(1 - x / 15.0, 0, 1) ** 0.55 + 0.2
    blade = (x > 0) & (x < 14.6) & (r.v < spine) & (r.v >= spine - width)
    r.paint(blade, STEEL["base"])
    r.paint(blade & (r.v >= spine - 1.0 * px1(r)), STEEL["sh"])                  # the thick back, its rib in shade
    r.paint(blade & (r.v < spine - 1.0 * px1(r)) & (r.v >= spine - 2.0 * px1(r)) & (x > 3) & (x < 11), STEEL["lt"])
    r.paint(blade & (r.v < spine - width + 1.0 * px1(r)), STEEL["hi"])           # the honed edge
    return r.finish({"grip": (0.3, GV)})


# ------------------------------------------------------------------ fishing rod (1 x 3, angles)
def fishing_rod(theta, scale=1.0, L=52):
    GV = 6
    r = Raster(theta, GV, scale)
    droop = np.where(r.v > L / 2, 4.6 * ((r.v - L / 2) / (L / 2)) ** 2, 0)           # the whippy top bends over
    du = r.u - droop
    halfw = np.where(r.v < 15, 1.5, np.where(r.v < 0.63 * L, 1.0, 0.55))
    rod = (np.abs(du + (0.0 if True else 0)) < halfw) & (r.v >= 0) & (r.v < L)
    # one pixel wide on the top third: shift so the thin part sits on a pixel column at 0 degrees
    r.paint(rod, CANE["base"])
    r.paint(rod & (du < -halfw + 0.9 * px1(r)) & (halfw > 0.6), CANE["hi"])
    r.paint(rod & (du >= halfw - 0.9 * px1(r)) & (halfw > 0.6), CANE["sh"])
    # the cork handle with a dark ring at each end and the butt cap
    cork = r.box(-2.0, 2.0, 1.0, 12.0)
    r.paint(cork, CORK["base"]); r.paint(cork & (r.u < -1.0), CORK["hi"]); r.paint(cork & (r.u >= 1.0), CORK["sh"])
    for cv in (4.0, 8.0):
        r.paint(cork & (np.abs(r.v - cv) < 0.5), CORK["sh"])
    r.paint(r.box(-2.0, 2.0, 11.0, 12.0) | r.box(-1.5, 1.5, 0, 1.0), CORK["ring"])
    # the line wound at the grip: a pale band of turns on its winder
    wind = r.box(-2.0, 2.0, 13.0, 17.0)
    r.paint(wind, LINE["base"]); r.paint(wind & (r.u < -1.0), LINE["hi"])
    r.paint(wind & (np.floor(r.v * scale) % 2 == 0) & (r.u >= 0.0), "#a89e84")
    # the tip ring and the loose line hanging from it, with a little float
    tip_u = 4.6
    r.paint(r.cap((tip_u, L - 0.6), (tip_u, L - 0.6), 0.75), IRON["base"])
    hang = [(tip_u + 0.2, L - 1.6), (tip_u + 0.6, L - 8.5)]
    r.line(hang, LINE["hi"])
    fl = r.cap((tip_u + 0.6, L - 9.5), (tip_u + 0.6, L - 11.0), 1.05)
    r.paint(fl, FLOAT["red"])
    r.paint(fl & (r.v < L - 10.4), FLOAT["cream"])
    return r.finish({"grip": (0, GV)})


# ------------------------------------------------------------------ dirk (item `knife`; 1 x 1, rotate): hand-pixelled at 1x
DIRK_PAL = {"o": OUTLINE, "H": STEEL["hi"], "L": STEEL["lt"], "B": STEEL["base"], "S": STEEL["sh"],
            "G": BRASS["hi"], "g": BRASS["sh"], "W": WOOD["hi"], "w": WOOD["base"], "d": WOOD["sh"], "k": WOOD["dk"]}
DIRK = [
    "..o....",
    ".oHo...",
    ".oHLo..",
    ".oHLBo.",
    ".oHLSo.",
    ".oHLSo.",
    ".oHLSo.",
    ".oHLSo.",
    ".oHLSo.",
    ".oHLSo.",
    "oGGGGgo",
    ".oWwdo.",
    ".okWko.",
    ".oWwdo.",
    ".okWko.",
    "oGGGggo",
    ".oGggo.",
    "..ooo..",
]
DIRK_GRIP = (3, 12)


def dirk_small():
    c = Canvas(7, len(DIRK))
    c.grid(DIRK, DIRK_PAL)
    rgba = np.zeros((c.h, c.w, 4), np.uint8)
    rgba[..., :3] = c.col
    rgba[..., 3] = c.a * 255
    return Image.fromarray(rgba, "RGBA"), DIRK_GRIP


def dirk(theta, scale=1.0):
    """the same dirk as a shape, for the portrait: a straight single-edged blade, the back on the left,
    a small brass guard, a carved dark-wood grip, a brass cap pommel"""
    GV = 4.5
    r = Raster(theta, GV, scale)
    # blade: back straight at u=-1.5, the edge at u=+1.5 swept in to the point at the back
    bv0, bv1 = 8.0, 18.5
    f = np.clip((r.v - (bv1 - 3.0)) / 3.0, 0, 1)
    right = 1.5 - 3.0 * f ** 1.2
    blade = (r.u >= -1.5) & (r.u < right) & (r.v >= bv0) & (r.v < bv1)
    r.paint(blade, STEEL["lt"])
    r.paint(blade & (r.u < -0.5), STEEL["hi"])
    r.paint(blade & (r.u >= right - 1.0) & (r.v < bv1 - 3.2), STEEL["sh"])
    r.paint(blade & (np.abs(r.u + 0.1) < 0.28) & (r.v < bv1 - 4) & (r.v > bv0 + 1), STEEL["base"])  # the fuller
    guard = r.box(-2.5, 2.5, 7.0, 8.0)
    r.paint(guard, BRASS["hi"]); r.paint(guard & (r.u >= 1.4), BRASS["sh"])
    grip = r.box(-1.5, 1.5, 2.0, 7.0)
    r.paint(grip, WOOD["base"]); r.paint(grip & (r.u < -0.5), WOOD["hi"]); r.paint(grip & (r.u >= 0.5), WOOD["sh"])
    knot = grip & ((np.floor(r.v * 2) + np.floor(r.u * 2)) % 4 == 0)              # the carved interlace
    r.paint(knot, WOOD["dk"])
    pom = r.box(-2.5, 2.5, 1.0, 2.0) | r.box(-1.5, 1.0, 0.0, 1.0)
    r.paint(pom, BRASS["hi"]); r.paint(pom & ((r.u >= 1.0) | (r.v < 1.0)), BRASS["sh"])
    return r.finish({"grip": (0, GV)})


# ------------------------------------------------------------------ shears (1 x 2, fixed): sheep shears, one bent bar of iron
def shears(scale=1.0):
    r = Raster(0, 0, scale)
    u, v = r.u, r.v
    # the bow: the springy loop at the bottom where the two arms are one piece of iron
    cy, ry, rx = 3.0, 3.0, 3.4
    e = (u / rx) ** 2 + ((v - cy) / ry) ** 2
    ei = (u / (rx - 1.3)) ** 2 + ((v - cy) / (ry - 1.3)) ** 2
    bow = (e <= 1.0) & (ei > 1.0) & (v < cy + 1.0)
    # the two arms rising from the bow, a little apart, wrapped in leather where the hand squeezes
    armL = r.poly([(-2.75, 3.8), (-2.4, 9.0), (-1.4, 13.5)], 0.8)
    armR = r.poly([(2.75, 3.8), (2.4, 9.0), (1.4, 13.5)], 0.8)
    iron = bow | armL | armR
    r.paint(iron, IRON["base"])
    r.paint(iron & (u < 0) & ((u < -2.9) | (v < 1.3)), IRON["hi"])
    r.paint(iron & (u > 0) & ((u > 2.7) | (v < 0.8)), IRON["sh"])
    for wm, sgn in ((armL & (v >= 6.0) & (v < 12.0), -1), (armR & (v >= 6.0) & (v < 12.0), 1)):
        r.paint(wm, WRAP["base"])
        r.paint(wm & (np.floor(v * scale) % 2 == 0), WRAP["sh"])
        if sgn < 0:
            r.paint(wm & (np.floor(v * scale) % 2 == 1) & (u < -2.4), WRAP["hi"])
    # the blades: two broad triangles with a square heel, inner faces close at the heel, the points sprung apart
    v0, v1 = 12.5, 29.0
    t = np.clip((v - v0) / (v1 - v0), 0, 1)
    spread = 1.3 * t ** 1.3                                                      # the spring holds the points apart
    inner = 0.45 + 1.75 * t + spread
    outer = 3.7 - 0.3 * t - 1.2 * t ** 2.5 + spread
    span = (v >= v0) & (v < v1) & (outer - inner > 0.2)
    bl = span & (u <= -inner) & (u > -outer)
    br = span & (u >= inner) & (u < outer)
    r.paint(bl, STEEL["lt"])
    r.paint(bl & (u <= -outer + 1.0 * px1(r)), STEEL["hi"])
    r.paint(bl & (u > -inner - 1.0 * px1(r)), STEEL["base"])
    r.paint(br, STEEL["base"])
    r.paint(br & (u >= outer - 1.0 * px1(r)), STEEL["sh"])
    r.paint(br & (u < inner + 1.0 * px1(r)), STEEL["lt"])
    r.paint((bl | br) & (v < v0 + 1.0 * px1(r)), STEEL["sh"])                      # the heel's shoulder
    return r.finish({"grip": (-2.5, 9.0)})


# ------------------------------------------------------------------ lead (1 x 2, fixed): a coiled hemp rope, its end spliced into a loop
def lead(scale=1.0):
    r = Raster(0, 0, scale)
    u, v = r.u, r.v
    xi = np.floor(u * scale).astype(int)
    yi = np.floor(-v * scale).astype(int)

    def ring(cu, cv, rx, ry, t):
        e = ((u - cu) / rx) ** 2 + ((v - cv) / ry) ** 2
        ei = ((u - cu) / (rx - t)) ** 2 + ((v - cv) / (ry - t)) ** 2
        return (e <= 1.0) & (ei > 1.0)

    def strand(m):
        """one piece of rope: its base, the lay every fourth pixel, the upper-left lip lit, the lower-right dark"""
        r.paint(m, HEMP["base"])
        r.paint(m & ((xi + yi) % 4 == 0), HEMP["sh"])
        mp = np.pad(m, 1)
        r.paint(m & ~(mp[:-2, 1:-1] & mp[1:-1, :-2]), HEMP["hi"])
        r.paint(m & ~(mp[2:, 1:-1] & mp[1:-1, 2:]), HEMP["dk"])

    # the tail leaves the coil's front turn and hangs, a little slack, spliced back into an eye bound with twine
    tail = r.poly([(1.6, 17.5), (2.1, 15.5), (1.3, 13.5), (1.6, 12.4)], 0.85)
    eye = ring(1.6, 8.5, 3.0, 3.7, 1.35)
    splice = r.cap((1.6, 12.8), (1.6, 11.4), 1.2)
    strand(tail)
    strand(eye)
    strand(splice)
    r.paint(splice & (v >= 11.6) & (v < 13.0), LINE["base"])
    r.paint(splice & (v >= 11.6) & (v < 13.0) & (u > 2.1), "#a89e84")
    # the coil: two turns, the back one first, the front one over it, an open middle
    strand(ring(-0.7, 23.0, 7.0, 4.8, 1.65))
    strand(ring(0.7, 21.6, 7.0, 4.8, 1.65))
    return r.finish({"grip": (0.7, 17.4)})


# ------------------------------------------------------------------ bucket (2 x 2, fixed): coopered staves, two iron hoops, an iron bail
def bucket(scale=1.0):
    """drawn in plain screen space (scale = design units per pixel inverse); the bail's top is the grip"""
    s = scale
    W, H = int(44 * s) + 4, int(44 * s) + 4
    c = Canvas(W, H)
    yy, xx = np.mgrid[0:H, 0:W].astype(float) + 0.5
    cx = W / 2
    rt, rb = 7.4 * s, 6.0 * s                     # top and bottom half-widths (it tapers to the foot)
    ry_t, ry_b = 2.5 * s, 2.0 * s                 # the ellipses' half-heights
    yt = 10.0 * s + 2                             # rim centre line
    yb = yt + 11.0 * s                            # foot centre line
    f = np.clip((yy - yt) / (yb - yt), 0, 1)
    rx = rt + (rb - rt) * f
    ry = ry_t + (ry_b - ry_t) * f
    sx = (xx - cx) / rx
    inside_w = np.abs(sx) < 1
    front = np.sqrt(np.clip(1 - sx ** 2, 0, 1))
    body = inside_w & (yy >= yt) & (yy < yb + ry_b * front)
    rim_e = ((xx - cx) / rt) ** 2 + ((yy - yt) / ry_t) ** 2 <= 1
    body |= rim_e
    # staves, by angle round the bucket, alternating a touch in tone; lit on the left, shaded on the right
    ang = np.arcsin(np.clip(sx, -1, 1))
    n = 7
    k = np.floor((ang + math.pi / 2) / (math.pi / n)).astype(int)
    c.paint(body, STAVE["base"])
    c.paint(body & (k % 2 == 1), STAVE["hi"] if False else "#9c7044")
    c.paint(body & (sx < -0.55), STAVE["hi"])
    c.paint(body & (sx > 0.45), STAVE["sh"])
    c.paint(body & (sx > 0.8), STAVE["dk"])
    seam = np.zeros_like(body)
    for j in range(1, n):
        bx = cx + rx * math.sin(-math.pi / 2 + j * math.pi / n)
        seam |= body & (np.abs(xx - bx) < 0.5) & (np.abs(sx) < 0.9)
    c.paint(seam & (yy > yt + ry_t * front), STAVE["seam"])
    # the mouth: the rim's ellipse, the far inside wall lit, the near wall falling into the dark
    inner = ((xx - cx) / (rt - 1.0 - 0.4 * s)) ** 2 + ((yy - yt) / (ry_t - 0.9 - 0.2 * s)) ** 2 <= 1
    c.paint(rim_e & ~inner, STAVE["hi"])
    c.paint(rim_e & ~inner & (xx > cx + rt * 0.45), STAVE["base"])
    c.paint(inner, INSIDE["near"])
    c.paint(inner & (yy < yt - 0.2 * s), INSIDE["far"])
    # the hoops: dark iron round the body at two heights, following the front curve, lit along their top
    for hf in (0.18, 0.78):
        hy = yt + (yb - yt) * hf
        hry = ry_t + (ry_b - ry_t) * hf
        band_c = hy + hry * front
        th = max(1.0, 1.3 * s)
        hoop = body & (yy >= band_c - th / 2) & (yy < band_c + th / 2) & inside_w
        c.paint(hoop, IRON["sh"])
        c.paint(hoop & (yy < band_c - th / 2 + 1) & (s > 1.2), IRON["base"])
        c.paint(hoop & (sx < -0.4) & (yy < band_c - th / 2 + 1), IRON["hi"])
    # the bail: an iron hoop from ear to ear, arching high above the mouth
    bail_top = yt - 8.5 * s
    ear_x = rt + 0.6 * s
    t = (xx - cx) / ear_x
    arc_y = yt - 0.8 * s - (yt - 0.8 * s - bail_top) * np.sqrt(np.clip(1 - t ** 2, 0, 1))
    bw = max(1.0, 1.1 * s)
    bail = (np.abs(t) <= 1.0) & (np.abs(yy - arc_y) < bw / 2 + 0.5 * np.abs(t) ** 6 * 3) & (yy < yt)
    bail &= ~rim_e
    c.paint(bail, IRON["base"])
    c.paint(bail & (xx < cx), IRON["hi"])
    c.paint(bail & (xx > cx + ear_x * 0.6), IRON["sh"])
    # the ears: little iron lugs on the rim where the bail hooks in
    for sgn in (-1, 1):
        ex = cx + sgn * (rt - 0.2 * s)
        ear = (np.abs(xx - ex) < max(0.5, 0.9 * s)) & (yy >= yt - 1.0 * s) & (yy < yt + 2.2 * s)
        c.paint(ear, IRON["base"] if sgn < 0 else IRON["sh"])
        c.paint(ear & (yy < yt - 1.0 * s + 1), IRON["hi"] if sgn < 0 else IRON["base"])
    c.outline()
    im, (x0, y0) = c.image()
    gx = int(cx) - x0
    a = np.array(im)
    gy = next(y for y in range(a.shape[0]) if a[y, gx, 3] and "#%02x%02x%02x" % tuple(a[y, gx, :3]) != OUTLINE)
    return im, (gx, gy)


# ------------------------------------------------------------------ the writing
PORTRAIT_LEN = {"hoe": 30, "scythe": 33, "fishing_rod": 38}   # the long shafts shortened for the 38 px square
ANGLES = [(0, ""), (22.5, "_22_5"), (45, "_45"), (67.5, "_67_5"), (90, "_90")]


def hard(im):
    return set(np.unique(np.array(im)[..., 3]).tolist()) <= {0, 255}


def on_canvas(im, w, h, dx=0, dy=0):
    out = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    out.alpha_composite(im, ((w - im.width) // 2 + dx, (h - im.height) // 2 + dy))
    return out


def save(im, name):
    assert hard(im), name
    im.save(os.path.join(OUT, name + ".png"))
    return im


def grip_ok(im, g, name):
    x, y = g
    p = im.getpixel((x, y))
    assert p[3] == 255 and "#%02x%02x%02x" % p[:3] != OUTLINE, (name, g, p)


def fit_scale(fn, theta, box=36):
    """the largest scale (in 0.05 steps) whose render fits a box x box square"""
    s = 3.0
    while s > 0.5:
        im, _ = fn(theta, s)
        if im.width <= box and im.height <= box:
            return s
        s -= 0.05
    return s


def main():
    os.makedirs(OUT, exist_ok=True)
    for f in os.listdir(OUT):
        if f.endswith(".png"):
            os.remove(os.path.join(OUT, f))
    M = {}
    gallery = []   # (item, kind, name, image) for the preview

    angled = [  # id, fn, bag (cols, rows), portrait angle, notes
        ("pickaxe", pickaxe, (1, 2), 0, "Iron pick head, two points, on a wooden haft with a leather wrap. Head up at 0 deg; grip on the wrap."),
        ("hoe", hoe, (1, 3), 0, "A flat iron plate hung at right angles from a gooseneck at the haft's top, its worn edge bright. Blade up at 0 deg, plate to the left (-u, the lit side); grip a third of the way up."),
        ("scythe", scythe, (1, 3), 45, "A long curved blade off the top of a gently bent snath, the nib (second hand grip) standing off part way up, a leather wrap at the end grip where the hand holds."),
        ("fishing_rod", fishing_rod, (1, 3), 45, "A long thin hazel rod whose top third bends over, a cork handle, line wound on the winder above it, a short loose line and a red float hanging from the tip ring (in the tool's own frame, so it trails along the rod when tilted)."),
        ("hammer", hammer, (1, 2), 0, "Smith's cross-peen hammer: a square polished face on the left, the wedge peen on the right, a plain wooden handle swelled at the end. Head up at 0 deg."),
    ]
    for iid, fn, (cols, rows), pang, note in angled:
        angles = []
        for th, sfx in ANGLES:
            im, pts = fn(th)
            name = f"{iid}_world{sfx}"
            grip_ok(im, pts["grip"], name)
            save(im, name)
            angles.append({"src": name + ".png", "grip": list(pts["grip"]), "size": list(im.size)})
            gallery.append((iid, "world", name, im, pts["grip"]))
        im0, _ = fn(0)
        if not (im0.width <= CELL * cols and im0.height <= CELL * rows): print("TOO BIG", iid, im0.size)
        ic = save(on_canvas(im0, CELL * cols, CELL * rows), f"{iid}_icon")
        gallery.append((iid, "icon", f"{iid}_icon", ic, None))
        plen = PORTRAIT_LEN.get(iid)
        pfn = fn if plen is None else (lambda th, sc, fn=fn, plen=plen: fn(th, sc, L=plen))
        ps = min(fit_scale(pfn, pang), 1.6)
        pim, _ = pfn(pang, ps)
        po = save(on_canvas(pim, 38, 38), f"{iid}_portrait")
        gallery.append((iid, "portrait", f"{iid}_portrait", po, None))
        M[iid] = {"icon": [CELL * cols, CELL * rows], "portrait": True,
                  "held": {"mode": "angles", "angles": [{"src": a["src"], "grip": a["grip"]} for a in angles]},
                  "sizes": {a["src"]: a["size"] for a in angles},
                  "notes": note + f" Icon = the 0 deg world picture pixel for pixel, centred. Portrait = the same shape at {pang} deg, drawn at {ps:.2f}x" + (f", its shaft shortened to {plen} so the head stays big." if plen else ".")}

    # the dirk: one hand-pixelled upright picture (rotate), the portrait the same design drawn large on the diagonal
    dim, dg = dirk_small()
    grip_ok(dim, dg, "knife_world")
    save(dim, "knife_world")
    gallery.append(("knife", "world", "knife_world", dim, dg))
    ic = save(on_canvas(dim, 19, 19), "knife_icon")
    gallery.append(("knife", "icon", "knife_icon", ic, None))
    ps = fit_scale(dirk, 45)
    po = save(on_canvas(dirk(45, ps)[0], 38, 38), "knife_portrait")
    gallery.append(("knife", "portrait", "knife_portrait", po, None))
    M["knife"] = {"icon": [19, 19], "portrait": True,
                  "held": {"mode": "rotate", "image": "knife_world.png", "grip": list(dg)},
                  "sizes": {"knife_world.png": list(dim.size)},
                  "notes": "The Dirk (item id `knife`): a straight single-edged steel blade, the back on the left, a small brass guard, a carved dark-wood grip, a brass cap pommel. Hand-pixelled at 1x, point up; rotate mode turns it about the grip. Icon = the world picture centred (it does not stack). Portrait = the same design as a shape on the diagonal at %.2fx." % ps}

    # the fixed ones: one upright picture each
    for iid, fn, (cols, rows), pscale, note in (
        ("shears", shears, (1, 2), None, "Sheep shears of the old spring kind: one bar of iron bent into a bow at the bottom, two leather-wrapped arms, two long blades sprung a little apart at the points. Upright, points up; grip on the left arm's wrap."),
        ("lead", lead, (1, 2), None, "A coiled hemp lead (darker than the rope belt so the two never mix up): three turns, the tail hanging from the front turn into a spliced eye bound with pale twine. Held fixed by the coil's front turn, so the tail and eye hang to about the feet."),
    ):
        im, pts = fn(1.0)
        grip_ok(im, pts["grip"], iid)
        save(im, f"{iid}_world")
        gallery.append((iid, "world", f"{iid}_world", im, pts["grip"]))
        if not (im.width <= CELL * cols and im.height <= CELL * rows): print("TOO BIG", iid, im.size)
        ic = save(on_canvas(im, CELL * cols, CELL * rows), f"{iid}_icon")
        gallery.append((iid, "icon", f"{iid}_icon", ic, None))
        s = 3.0
        while fn(s)[0].height > 36 or fn(s)[0].width > 36:
            s -= 0.05
        po = save(on_canvas(fn(s)[0], 38, 38), f"{iid}_portrait")
        gallery.append((iid, "portrait", f"{iid}_portrait", po, None))
        M[iid] = {"icon": [CELL * cols, CELL * rows], "portrait": True,
                  "held": {"mode": "fixed", "image": f"{iid}_world.png", "grip": list(pts["grip"])},
                  "sizes": {f"{iid}_world.png": list(im.size)},
                  "notes": note + f" Icon = the world picture pixel for pixel, centred. Portrait = the same shape drawn at {s:.2f}x."}

    # the bucket: world small enough to hang from a hand 14 px above the feet; the icon and portrait drawn larger
    im, g = bucket(0.78)
    grip_ok(im, g, "bucket_world")
    save(im, "bucket_world")
    gallery.append(("bucket", "world", "bucket_world", im, g))
    si = 2.2
    while bucket(si)[0].width > 34 or bucket(si)[0].height > 34:
        si -= 0.05
    ic = save(on_canvas(bucket(si)[0], 38, 38), "bucket_icon")
    gallery.append(("bucket", "icon", "bucket_icon", ic, None))
    sp = 2.4
    while bucket(sp)[0].width > 37 or bucket(sp)[0].height > 37:
        sp -= 0.05
    po = save(on_canvas(bucket(sp)[0], 38, 38), "bucket_portrait")
    gallery.append(("bucket", "portrait", "bucket_portrait", po, None))
    M["bucket"] = {"icon": [38, 38], "portrait": True,
                   "held": {"mode": "fixed", "image": "bucket_world.png", "grip": list(g)},
                   "sizes": {"bucket_world.png": list(im.size)},
                   "notes": "An empty coopered bucket: seven staves, two iron hoops, an iron bail from ear to ear, the dark inside showing at the mouth. World picture %dx%d so it hangs from the hand (14 px above the feet) without sinking far below them; grip on the top of the bail. The 2 x 2 icon is the same design drawn at %.2fx (the world picture would sit lost in a 38 px square), the portrait at %.2fx." % (im.width, im.height, si, sp)}

    with open(os.path.join(HERE, "manifest.json"), "w") as fh:
        json.dump(M, fh, indent=1)
    preview(gallery)
    print("wrote", len([f for f in os.listdir(OUT) if f.endswith(".png")]), "pngs")
    for iid, v in M.items():
        h = v["held"]
        if h["mode"] == "angles":
            print(iid, [(a["src"], a["grip"], v["sizes"][a["src"]]) for a in h["angles"]])
        else:
            print(iid, h["mode"], h["grip"], v["sizes"])


def figure_mock(item, grip):
    """a plain 55 x 26 stand-in figure at 1x with the item's grip on the right hand
    (14 px above the feet, 10 px out from the body's centre), for scale"""
    W, H = 64, 104
    fig = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(fig)
    fx, feet = 26, H - 8
    body = (120, 112, 104, 255)
    d.ellipse([fx - 7, feet - 55, fx + 7, feet - 41], fill=body)                 # head
    d.rectangle([fx - 8, feet - 41, fx + 8, feet - 18], fill=body)              # trunk
    d.rectangle([fx - 7, feet - 18, fx - 2, feet], fill=body)                   # legs
    d.rectangle([fx + 2, feet - 18, fx + 7, feet], fill=body)
    d.rectangle([fx + 8, feet - 39, fx + 11, feet - 15], fill=body)             # the right arm
    hx_, hy_ = fx + 10, feet - 14
    fig.alpha_composite(item, (hx_ - grip[0], hy_ - grip[1]))
    return fig


def preview(gallery):
    """per item a row: every world angle at 3x on grass (the grip pixel boxed in magenta), the icon at 2x on
    the slot colour, the portrait at 2x on the slot colour, and the 0 deg picture in a stand-in figure's hand at 3x"""
    order = ["pickaxe", "hoe", "scythe", "fishing_rod", "knife", "hammer", "shears", "lead", "bucket"]
    pad, label_h = 12, 14
    blocks = []
    for iid in order:
        items = [g for g in gallery if g[0] == iid]
        parts = []
        for _, kind, name, im, grip in items:
            k = 3 if kind == "world" else 2
            big = im.resize((im.width * k, im.height * k), Image.NEAREST)
            bg = Image.new("RGBA", big.size, SLOT_BG if kind != "world" else (0x4b, 0x5f, 0x3d, 255))
            bg.alpha_composite(big)
            if grip is not None:
                ImageDraw.Draw(bg).rectangle([grip[0] * k, grip[1] * k, grip[0] * k + k - 1, grip[1] * k + k - 1], outline=(255, 64, 200, 255))
            parts.append((name.replace(iid + "_", ""), bg))
        w0 = next(g for g in items if g[1] == "world")
        mock = figure_mock(w0[3], w0[4])
        mock = mock.resize((mock.width * 3, mock.height * 3), Image.NEAREST)
        mbg = Image.new("RGBA", mock.size, (0x4b, 0x5f, 0x3d, 255))
        mbg.alpha_composite(mock)
        parts.append(("in hand, 3x", mbg))
        w = sum(p[1].width for p in parts) + pad * (len(parts) + 1)
        h = max(p[1].height for p in parts) + label_h * 2 + pad
        blocks.append((iid, parts, w, h))
    W = max(b[2] for b in blocks)
    H = sum(b[3] for b in blocks) + pad
    out = Image.new("RGBA", (W, H), (0x1c, 0x1a, 0x18, 255))
    d = ImageDraw.Draw(out)
    y = pad
    for iid, parts, w, h in blocks:
        d.text((pad, y), iid, fill=(230, 220, 200, 255))
        x, ty = pad, y + label_h
        for lab, im in parts:
            d.text((x, ty), lab, fill=(150, 140, 125, 255))
            out.alpha_composite(im, (x, ty + label_h))
            x += im.width + pad
        y += h
    out.save(os.path.join(HERE, "preview.png"))


if __name__ == "__main__":
    main()
