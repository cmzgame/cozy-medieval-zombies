"""The held items that turn: plank, stick, torch, hatchet, shovel. Each is rasterised fresh at
0, 22.5, 45, 67.5 and 90 degrees clockwise from upright (never rotated by pixel), as the staff was.
Local coords: v runs up the item from its bottom end, u across it (+u = the item's right when upright,
which faces down-right for tilts 0..90, so -u is the lit side). `scale` makes the portrait renderings."""
import math
import numpy as np
from px import Canvas, hx, OUTLINE, hashn

WOOD = dict(hi="#9a6a42", base="#7a5132", sh="#57381f", knot="#45301b")
BOARD = dict(hi="#c6b38e", base="#b5a27e", sh="#8d7b5f", dark="#5f5241", grain="#94805d")
PITCH = dict(hi="#4e4038", base="#3a2f2a", sh="#2a221f", cord="#8a7a5a", cord_sh="#6b5a44")
STEEL = dict(hi="#eef0f4", lt="#c6cad2", base="#9ea2ac", sh="#6e7280", dk="#4a4f5c")
IRON = dict(hi="#8a8c96", base="#5e6068", sh="#3e3f46")
WRAP = dict(hi="#7a5638", base="#5a3c25", sh="#3e2818")


class Raster:
    """a canvas with the item's local (u, v) at every pixel centre, the grip pixel at the canvas centre"""
    def __init__(self, theta_deg, grip_v, S=128):
        th = math.radians(theta_deg)
        self.ax = (math.sin(th), -math.cos(th)); self.ac = (math.cos(th), math.sin(th))
        self.S = S; self.gx = self.gy = S // 2 + 0.5; self.grip_v = grip_v
        yy, xx = np.mgrid[0:S, 0:S].astype(float) + 0.5
        dx, dy = xx - self.gx, yy - self.gy
        self.v = dx * self.ax[0] + dy * self.ax[1] + grip_v
        self.u = dx * self.ac[0] + dy * self.ac[1]
        self.c = Canvas(S, S)

    def paint(self, m, col): self.c.paint(m, col)

    def seg(self, a, b, r):
        """distance field (negative inside) of a capsule from local a to b with radius r"""
        a, b = np.array(a, float), np.array(b, float); ba = b - a
        pu, pv = self.u - a[0], self.v - a[1]
        h = np.clip((pu * ba[0] + pv * ba[1]) / max(ba @ ba, 1e-9), 0, 1)
        return np.hypot(pu - h * ba[0], pv - h * ba[1]) - r

    def box(self, u0, u1, v0, v1): return (self.u >= u0) & (self.u < u1) & (self.v >= v0) & (self.v < v1)

    def to_px(self, lu, lv):
        sx = self.gx + self.ac[0] * lu + self.ax[0] * (lv - self.grip_v)
        sy = self.gy + self.ac[1] * lu + self.ax[1] * (lv - self.grip_v)
        return int(math.floor(sx)), int(math.floor(sy))

    def finish(self, points):
        """outline, crop; returns (image, {name: (x, y)}) with the named local points as pixels"""
        self.c.outline()
        im, (x0, y0) = self.c.image()
        pts = {k: (self.to_px(*p)[0] - x0, self.to_px(*p)[1] - y0) for k, p in points.items()}
        return im, pts


def three_tone(r, m, pal, w, lit_from=None, sh_from=None):
    """base, the -u side lit, the +u side in shade, across a width w"""
    lit_from = -w / 2 + max(1.0, w / 4) if lit_from is None else lit_from
    sh_from = w / 2 - max(1.0, w / 4) if sh_from is None else sh_from
    r.paint(m, pal["base"]); r.paint(m & (r.u < lit_from), pal["hi"]); r.paint(m & (r.u > sh_from), pal["sh"])


def plank(theta, scale=1.0):
    L, W = 26 * scale, 5 * scale
    r = Raster(theta, 6 * scale)
    m = r.box(-W / 2, W / 2, 0, L)
    three_tone(r, m, BOARD, W)
    vi = np.floor(r.v).astype(int); ui = np.floor(r.u + W).astype(int)
    grain = m & (hashn(vi // 3, ui, 3) % 4 == 0) & (r.u > -W / 2 + 1) & (r.u < W / 2 - 1)
    r.paint(grain, BOARD["grain"])
    r.paint(m & (hashn(vi // 2, ui, 7) % 9 == 0) & (r.u > -W / 2 + 1.5) & (r.u < W / 2 - 1.5), BOARD["sh"])
    r.paint(m & (r.v < 1), BOARD["dark"]); r.paint(m & (r.v >= L - 1), BOARD["hi"])   # the sawn ends
    for nv in (4 * scale, L - 4 * scale):                                                # two nail holes
        r.paint(r.seg((0, nv), (0, nv), 0.6 * scale) < 0, BOARD["dark"])
    return r.finish({"grip": (0, 6 * scale)})


def stick(theta, scale=1.0):
    L = 26 * scale; R = 1.5 * scale
    r = Raster(theta, 7 * scale)
    wob = 0.6 * scale * np.sin(r.v / (5 * scale))
    body = np.abs(r.u - wob) < R
    body &= (r.v >= 0) & (r.v < L)
    r.paint(body, WOOD["base"]); r.paint(body & (r.u - wob < -R + 0.9 * scale), WOOD["hi"]); r.paint(body & (r.u - wob > R - 0.9 * scale), WOOD["sh"])
    fork = r.seg((0.3 * scale, 19 * scale), (-3.2 * scale, 23.5 * scale), 1.0 * scale) < 0           # a fork stub
    r.paint(fork, WOOD["base"]); r.paint(fork & (r.u < -1.8 * scale), WOOD["hi"])
    r.paint(fork & (r.seg((-3.2 * scale, 23.5 * scale), (-3.2 * scale, 23.5 * scale), 0.7 * scale) < 0), WOOD["knot"])
    for kv in (9 * scale, 16 * scale):                                                                # knots
        r.paint(body & (np.abs(r.v - kv) < 0.6 * scale) & (np.abs(r.u - wob) < 0.7 * scale), WOOD["knot"])
    r.paint(body & (r.v < 1), WOOD["sh"]); r.paint(body & (r.v >= L - 1), WOOD["hi"])                 # the snapped ends
    return r.finish({"grip": (0, 7 * scale)})


def torch(theta, scale=1.0, lit=False):
    """a stick with a wrapped, pitch-dark head; flame_px is the top of the head where the engine's flame sits"""
    Ls, Lh, W, Wh = 15 * scale, 6 * scale, 3 * scale, 5 * scale
    r = Raster(theta, 8 * scale)
    shaft = r.box(-W / 2, W / 2, 0, Ls + 1)
    three_tone(r, shaft, WOOD, W)
    r.paint(shaft & (r.v < 1), WOOD["sh"])
    head = r.box(-Wh / 2, Wh / 2, Ls, Ls + Lh)
    three_tone(r, head, PITCH, Wh)
    vi = np.floor(r.v - Ls).astype(int)
    band = head & (vi % 3 == 1) & (r.v > Ls + 0.5)
    r.paint(band, PITCH["cord"]); r.paint(band & (r.u > Wh / 2 - max(1, Wh / 4)), PITCH["cord_sh"])
    cord = r.box(-Wh / 2, Wh / 2, Ls - 0.2, Ls + 1.2)                                         # the cord that binds the head
    r.paint(cord, PITCH["cord"]); r.paint(cord & (r.u > Wh / 2 - max(1, Wh / 4)), PITCH["cord_sh"])
    im, pts = r.finish({"grip": (0, 8 * scale), "flame": (0, Ls + Lh)})
    return im, pts


def hatchet(theta, scale=1.0):
    L, W = 28 * scale, 3 * scale
    r = Raster(theta, 7 * scale)
    haft = r.box(-W / 2, W / 2, 0, L)
    three_tone(r, haft, WOOD, W)
    wrap = haft & (r.v > 4 * scale) & (r.v < 11 * scale)
    r.paint(wrap, WRAP["base"]); r.paint(wrap & (np.floor(r.v - 0.5 * r.u) % 3 == 0), WRAP["sh"]); r.paint(wrap & (r.u < -W / 2 + 0.9 * scale) & (np.floor(r.v - 0.5 * r.u) % 3 != 0), WRAP["hi"])
    # the head: a bearded blade to the left of the haft, its eye round the haft, a poll behind
    v0, v1 = 19 * scale, 27 * scale
    blade = (r.u < -W / 2 + 0.5) & (r.u > -7 * scale) & (r.v >= v0 - (r.u + W / 2) * 0.35) & (r.v < v1 + (r.u + W / 2) * 0.15)
    blade &= (r.v >= v0 - 3 * scale)
    r.paint(blade, STEEL["base"]); r.paint(blade & (r.u < -4.5 * scale), STEEL["lt"]); r.paint(blade & (r.u < -6.2 * scale), STEEL["hi"])
    r.paint(blade & (r.v < v0 - 1.5 * scale + (-(r.u + W / 2)) * 0.35 * 0 + 0.0) & (r.u > -4.5 * scale), STEEL["sh"])
    eye = r.box(-W / 2 - 0.5, W / 2 + 2.5 * scale, v0 + 1 * scale, v1 - 1 * scale)
    r.paint(eye, IRON["base"]); r.paint(eye & (r.v > v1 - 2.5 * scale), IRON["hi"]); r.paint(eye & (r.u > W / 2 + 1.2 * scale), IRON["sh"])
    return r.finish({"grip": (0, 7 * scale)})


def shovel(theta, scale=1.0):
    L, W = 44 * scale, 3 * scale
    r = Raster(theta, 20 * scale)
    haft = r.box(-W / 2, W / 2, 12 * scale, L - 2 * scale)
    three_tone(r, haft, WOOD, W)
    grip = r.box(-4.5 * scale, 4.5 * scale, L - 3 * scale, L)                                  # the T grip
    three_tone(r, grip, WOOD, 9 * scale, lit_from=-3.5 * scale, sh_from=3.5 * scale)
    r.paint(grip & (r.v > L - 1), WOOD["hi"])
    # the blade: a rounded spade, pointed, with a socket up the haft and a step for the foot
    bw = 4.5 * scale
    blade = (np.abs(r.u) < bw) & (r.v >= 3 * scale) & (r.v < 14 * scale)
    tip = (r.v < 3 * scale) & (r.v >= 0) & (np.abs(r.u) < bw * (0.35 + 0.65 * (r.v / (3 * scale))))
    blade |= tip
    r.paint(blade, IRON["base"]); r.paint(blade & (r.u < -bw + 1.6 * scale), IRON["hi"]); r.paint(blade & (r.u > bw - 1.6 * scale), IRON["sh"])
    r.paint(blade & (np.abs(r.u) < 0.6 * scale) & (r.v > 2 * scale), IRON["sh"])                 # the centre rib
    r.paint(blade & (r.v >= 13 * scale), IRON["hi"])                                           # the lit top edge / foot step
    sock = r.box(-W / 2 - 0.6 * scale, W / 2 + 0.6 * scale, 12 * scale, 17 * scale)
    r.paint(sock, IRON["base"]); r.paint(sock & (r.u < -W / 2 + 0.3), IRON["hi"]); r.paint(sock & (r.u > W / 2 - 0.3), IRON["sh"])
    return r.finish({"grip": (0, 20 * scale)})


# ------------------------------------------------------------------ the torch flame (unlit frames)
FLAME_PAL = {"o": "#6e1e10", "r": "#b8401c", "O": "#e07a26", "Y": "#f2b33e", "W": "#f8dc7a"}
FLAMES = [[
    "....oo...",
    "...oYo...",
    "...oYo.o.",
    "..oOYOoro",
    ".oOYWYOro",
    ".oOYWYYOo",
    "oOOYWWYOo",
    "orOYWWYOro",
    "orOYYYOOro",
    ".orOOOOro.",
    "..orrrro..",
    "...oooo...",
], [
    "..oo.....",
    ".oYo..oo.",
    ".oYOo.oro",
    "oOYYOooro",
    "oOYWYOOro",
    "oOYWWYOro",
    "orOYWYOOo",
    "orOYWYYOo",
    ".orOYYOro",
    ".orOOOOro",
    "..orrrro.",
    "...oooo..",
], [
    "....oo....",
    "...oOo.oo.",
    "..oOYo.oYo",
    ".oOYYOooYo",
    ".oOYWYOOOo",
    "oOYWWYYOro",
    "oOYWWWYOro",
    "orOYWWYOro",
    "orOYYYOro.",
    ".orOOOOro.",
    "..orrrro..",
    "...oooo...",
]]


def flame_frame(k, cell=(28, 32), base=(14, 28)):
    """one flicker frame on the engine's 28 x 32 cell, the flame's base at (14, 28)"""
    c = Canvas(*cell)
    rows = FLAMES[k]; w = max(len(r) for r in rows); h = len(rows)
    c.grid(rows, FLAME_PAL, base[0] - w // 2, base[1] - h + 1)
    return c.image(crop=False)[0]


def flame_small():
    """the flame that sits on the lit torch in the bag and the slots: frame 0, trimmed"""
    c = Canvas(12, 12); c.grid(FLAMES[0], FLAME_PAL, 1, 0); im, _ = c.image(); return im
