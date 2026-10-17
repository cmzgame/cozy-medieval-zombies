"""Hair, beards and hats: free parts on the head, painted with their own outline all round, as the
engine's generated hair and hood are (they are outlined shapes of their own, worn over the head).
Hair and beards are two tones for the dye (light = the hair colour, dark = its shade)."""
import math
import numpy as np
import paint as P
from paint import Layer, finish_mirrors, FH, FW, OUTLINE

HC = (24.0, 28.0)          # the head's centre (every facing)
RX, RY = 8.5, 9.5          # the head's radii (rig.js)
FACE = {"s": (0.0, 1.0), "sw": (-math.sqrt(.5), math.sqrt(.5)), "w": (-1.0, 0.0), "nw": (-math.sqrt(.5), -math.sqrt(.5)), "n": (0.0, -1.0)}
HAIR_L, HAIR_D = "#8a5a30", "#5a3a20"      # canonical hair tones (dyed by the game: light -> the colour, dark -> its shade)

def super_mask(cx, cy, rx, ry, n=3, clip=None):
    yy, xx = np.mgrid[0:FH, 0:FW]; px, py = xx + 0.5, yy + 0.5
    ex, ey = np.abs((px - cx) / rx), np.abs((py - cy) / ry)
    m = ex ** n + ey ** n <= 1
    if clip is not None: m &= clip(px, py)
    return m
def capsule(x0, y0, x1, y1, r):
    yy, xx = np.mgrid[0:FH, 0:FW]; px, py = xx + 0.5, yy + 0.5
    dx, dy = x1 - x0, y1 - y0; l2 = dx * dx + dy * dy or 1
    t = np.clip(((px - x0) * dx + (py - y0) * dy) / l2, 0, 1)
    return (px - (x0 + dx * t)) ** 2 + (py - (y0 + dy * t)) ** 2 <= r * r
def ring(m):
    p = np.pad(m, 1); return ~m & (p[:-2, 1:-1] | p[2:, 1:-1] | p[1:-1, :-2] | p[1:-1, 2:])
def rowmask(y0, y1): return (np.arange(FH)[:, None] >= y0) & (np.arange(FH)[:, None] < y1) & np.ones((FH, FW), bool)
def colmask(x0, x1): return (np.arange(FW)[None, :] >= x0) & (np.arange(FW)[None, :] < x1) & np.ones((FH, FW), bool)
def pxm(x, y):
    m = np.zeros((FH, FW), bool); m[y, x] = True; return m
def spans(d):
    """{x: (top, bottom)} inclusive -> mask"""
    m = np.zeros((FH, FW), bool)
    for x, (y0, y1) in d.items(): m[y0:y1 + 1, x] = True
    return m
def run(x0, x1, y0, y1): return {x: (y0, y1) for x in range(x0, x1 + 1)}

def eyes_mask(f):
    """where the eyes are, never to be covered by hair or a beard (rows 28-32)"""
    m = np.zeros((FH, FW), bool)
    if f in ("s", "sw"):
        sh = round(FACE[f][0] * 1.5)
        for side in (-1, 1):
            for dx in range(3): m[25:33, 24 + side * 4 - side * dx + sh] = True
    elif f == "w":
        for x in range(18, 21): m[27:33, x] = True
    return m

def shade_two(L, f, m, light, dark, share=0.4, lower=True):
    """two tones: the engine's right-hand share per row, and the lowest row of each column darker"""
    L.two_tone(f, m, light, dark, share)
    if lower:
        low = np.zeros_like(m)
        for x in range(FW):
            ys = np.where(m[:, x])[0]
            if len(ys): low[ys.max(), x] = True
        L.paint(f, low, dark)

def engine_cap(f, long=False):
    """the generated hair's shape for a facing (draw.js), as a mask"""
    fx, fy = FACE[f]; hx_, hy = HC
    cxh = hx_ - fx * 1.5; rxh = RX + 1
    from_behind = fy < -0.3; hair_side = abs(fx) > 0.8
    def clip(px, py):
        u = (px - cxh) / rxh
        fringe = hy - 4.5 + u * u * 3.5
        cap = py <= fringe
        if from_behind: return cap | (py <= hy + 4)
        forward = (px - hx_) * fx
        if hair_side: return cap | ((forward < -1) & (py <= hy + 2))
        return cap | ((np.abs(px - hx_) >= RX - 1.5) & (py <= hy))
    m = super_mask(cxh, hy - 1, rxh, RY + 1, 3, clip)
    if long:
        for sx in (-RX + 1, RX - 1):
            x0 = hx_ + sx; m |= capsule(x0 - fx * 0, hy - 2 + 0, x0, hy - 2 + 13, 2.2)
        if from_behind: m |= colmask(int(hx_ - RX + 1), int(hx_ + RX)) & rowmask(int(hy - 2), int(hy + 11))
    return m

def finish_head(L, f, m, light, dark):
    """paint a head piece: fill two-tone, outline all round, never over the eyes"""
    m = m & ~eyes_mask(f)
    shade_two(L, f, m, light, dark)
    L.paint(f, ring(m), OUTLINE)

# ------------------------------------------------------------------ hair
def hair_crop():
    """the generated short cap in two tones, tidied: no flip at the back on the three-quarter view,
    and from the side the hair arches over the ear (2026-10-12 feedback A2, A3)"""
    L = Layer()
    for f in FACE:
        m = engine_cap(f); fx, fy = FACE[f]
        if fy > 0.3 and abs(fx) > 0.3:          # sw: the cap's offset threw a flip past the back of the head
            m &= colmask(14, 33)
        if abs(fx) > 0.8:                        # w: room for the ear, the hair arches over it
            ear = colmask(23, 29) & rowmask(26, FH)
            m &= ~ear
        finish_head(L, f, m, HAIR_L, HAIR_D)
    finish_mirrors(L); return L

def hair_mohawk():
    """a medium mohawk: the sides shaved (nothing painted), a fin along the midline rising six pixels
    over the skull, down the forehead in front and down the nape behind, a jagged crest.
    Revised 2026-10-18, Michael's pick "(a) soft" (from the art agent's mohawk2.py): front (s) and back (n) as
    they were; the three-quarter facings re-cut so the fin follows the head's centreline over the top and its far
    end goes out of sight behind the skull (it sat beside the head before); the side profile slightly rounded,
    the shoulders filled and the side's two tufts kept. Every facing is painted, not mirrored: se's front run sits
    on its own eyes' gap (the game's eyes centre half a pixel right of the head, so a pixel mirror of sw lands a
    column left of them), and each facing takes the engine's light, the dark tone on the right-hand share."""
    L = Layer()
    shapes = {
        "s":  {**run(23, 25, 13, 22), 24: (12, 22)},
        "n":  {**run(23, 25, 13, 29), 24: (12, 29)},
        "w":  {15: (20, 23), 16: (17, 23), 17: (15, 22), 18: (14, 19), 19: (13, 19), 20: (13, 19), 21: (12, 19),
               22: (12, 19), 23: (11, 19), 24: (12, 19), 25: (11, 19), 26: (12, 19), 27: (12, 19), 28: (13, 19),
               29: (13, 19), 30: (14, 20), 31: (15, 21), 32: (17, 26), 33: (20, 26)},
        "e":  {14: (20, 26), 15: (17, 26), 16: (15, 21), 17: (14, 20), 18: (13, 19), 19: (13, 19), 20: (12, 19),
               21: (12, 19), 22: (11, 19), 23: (12, 19), 24: (11, 19), 25: (12, 19), 26: (12, 19), 27: (13, 19),
               28: (13, 19), 29: (14, 19), 30: (15, 22), 31: (17, 23), 32: (20, 23)},
        "sw": {22: (17, 22), 23: (14, 22), 24: (13, 22), 25: (12, 19), 26: (12, 19), 27: (12, 18), 28: (13, 17),
               29: (14, 17), 30: (16, 18)},
        "se": {18: (16, 17), 19: (14, 17), 20: (13, 17), 21: (12, 18), 22: (12, 19), 23: (12, 19), 24: (13, 22),
               25: (14, 22), 26: (17, 22)},
        "nw": {20: (16, 17), 21: (14, 17), 22: (13, 17), 23: (12, 18), 24: (12, 19), 25: (12, 28), 26: (13, 28),
               27: (14, 28)},
        "ne": {20: (14, 28), 21: (13, 28), 22: (12, 28), 23: (12, 19), 24: (12, 18), 25: (13, 17), 26: (14, 17),
               27: (16, 17)},
    }
    for f, d in shapes.items():
        m = spans(d)
        shade_two(L, f, m, HAIR_L, HAIR_D)
        L.paint(f, ring(m), OUTLINE)
    return L

def hair_tight():
    """high and tight: a flat short top one pixel over the skull, the sides and back shaved up to the
    temples and above the ear, the back tapering to the nape; the lower edge is never a straight bowl line"""
    L = Layer()
    def top_of(x, lo, hi):
        """the top row for a column: flat across the middle, stepping down at the ends"""
        c = (lo + hi) / 2; d = abs(x - c) / ((hi - lo) / 2)
        return 17 if d < 0.62 else (18 if d < 0.85 else 19)
    shapes = {
        "s":  {**{x: (top_of(x, 15, 32), 22) for x in range(17, 31)}, 15: (19, 21), 16: (18, 21), 31: (18, 21), 32: (19, 21),
               17: (18, 21), 18: (17, 21), 29: (17, 21), 30: (18, 21), 20: (16, 22), 21: (16, 22), 22: (16, 22)},
        "sw": {**{x: (top_of(x, 15, 33), 22) for x in range(17, 30)}, 15: (19, 21), 16: (18, 21), 17: (18, 21), 18: (17, 21),
               19: (16, 22), 20: (16, 22), 21: (16, 22),
               30: (18, 23), 31: (18, 24), 32: (19, 26), 33: (21, 26)},
        "w":  {**{x: (top_of(x, 15, 33), 21) for x in range(17, 30)}, 15: (19, 22), 16: (17, 22), 17: (16, 22), 18: (16, 21), 19: (16, 21),
               30: (18, 23), 31: (18, 25), 32: (19, 27), 33: (21, 27)},
        "nw": {**{x: (top_of(x, 15, 33), 25) for x in range(19, 28)}, 15: (19, 21), 16: (18, 22), 17: (18, 23), 18: (17, 24),
               28: (17, 26), 29: (18, 26), 30: (18, 25), 31: (18, 25), 32: (19, 26), 33: (21, 26)},
        "n":  {**{x: (top_of(x, 15, 32), 26) for x in range(19, 29)}, 15: (19, 21), 16: (18, 22), 17: (18, 23), 18: (17, 24),
               29: (17, 24), 30: (18, 23), 31: (18, 22), 32: (19, 21)},
    }
    for f, d in shapes.items():
        m = spans(d)
        shade_two(L, f, m, HAIR_L, HAIR_D)
        L.paint(f, ring(m), OUTLINE)
    finish_mirrors(L); return L

def hair_long():
    """the generated long hair, two tones; from the side only the near side and the back hang down,
    nothing in front of the face (2026-10-12 feedback D3)"""
    L = Layer()
    for f in FACE:
        fx, fy = FACE[f]
        if abs(fx) > 0.8:
            m = engine_cap(f)
            m |= capsule(31, 26, 31, 39, 2.8)             # the mane down the back
            m |= colmask(27, 34) & rowmask(26, 34)          # and the hair behind the ear joins it
        else:
            m = engine_cap(f, long=True)
        finish_head(L, f, m, HAIR_L, HAIR_D)
    finish_mirrors(L); return L

def hair_pigtails():
    """the cap with a middle parting and two tails tied at the sides of the head, hanging past the
    shoulders and flicking out at the tips; from the side the near tail hangs from behind the ear"""
    L = Layer()
    def tail(x, y0, flick):
        """a tail three wide from y0 (the gather) to y0+12, the band two rows down, the tip flicking out"""
        d = {}
        for dx in (0, 1, 2):
            d[x + dx] = (y0, y0 + 10)
        for dx in (0, 1, 2):
            d[x + dx + flick] = (y0 + 9, y0 + 12)
        return d
    for f in FACE:
        fx, fy = FACE[f]
        m = engine_cap(f)
        tails = np.zeros((FH, FW), bool); bands = np.zeros((FH, FW), bool)
        if abs(fx) > 0.8:          # the side: the near tail from behind the ear, over the neck
            m &= ~(colmask(23, 29) & rowmask(26, FH))     # room for the ear
            t = tail(26, 27, 1); tails |= spans(t); bands |= colmask(26, 29) & rowmask(29, 30)
        else:
            sh = round(fx * 1.5)
            lx, rx = 13 + sh, 32 + sh
            if fy > 0.3: ly, ry = (26, 26) if abs(fx) < 0.3 else (26, 27)
            elif fy < -0.3: ly, ry = (26, 26) if abs(fx) < 0.3 else (27, 26)
            tl = tail(lx, ly, -1); tr = tail(rx, ry, 1)
            tails |= spans(tl) | spans(tr)
            bands |= colmask(lx, lx + 3) & rowmask(ly + 2, ly + 3) | colmask(rx, rx + 3) & rowmask(ry + 2, ry + 3)
            m &= colmask(14, 34) if fy > 0.3 else m   # no flip past the head on sw
        finish_head(L, f, m | tails, HAIR_L, HAIR_D)
        L.paint(f, bands & tails, OUTLINE)
        if fy > 0.3:
            sh = round(fx * 1.5)
            for y in range(17, 23): L.paint(f, pxm(24 + sh, y), HAIR_D)   # the parting
    finish_mirrors(L); return L

def hair_bob():
    """a bob: the cap down to the jaw all round, a straight edge, a straight fringe above the eyes;
    from the side the curtain starts behind the eye (2026-10-12 feedback F3)"""
    L = Layer()
    for f in FACE:
        fx, fy = FACE[f]; cxh = 24 - fx * 1.5
        m = super_mask(cxh, 27, RX + 1.5, RY + 1.5, 3) & rowmask(0, 35)
        if fy > 0.3:   # the face shows: a window from the fringe to the jaw
            sh = round(fx * 1.5)
            m &= ~(colmask(18 + sh, 31 + sh) & rowmask(25, 40))
        elif abs(fx) > 0.8:   # the side: the curtain starts two pixels behind the eye
            m &= ~(colmask(0, 24) & rowmask(25, 41))
        finish_head(L, f, m, HAIR_L, HAIR_D)
    finish_mirrors(L); return L

# ------------------------------------------------------------------ beards
BEARD_L, BEARD_D = HAIR_L, HAIR_D

def beard_moustache():
    """a thick bar across the upper lip, drooping at the corners: the cop moustache"""
    L = Layer()
    for f in FACE:
        fx, fy = FACE[f]
        m = np.zeros((FH, FW), bool)
        if fy > 0.3:
            sh = round(fx * 1.5)
            m |= colmask(20 + sh, 29 + sh) & rowmask(33, 35)
            m |= colmask(19 + sh, 20 + sh) & rowmask(34, 36) | colmask(29 + sh, 30 + sh) & rowmask(34, 36)
            m &= ~pxm(24 + sh, 33)
        elif abs(fx) > 0.8:
            x = int(24 + fx * 7)
            m |= colmask(min(x, x - 4 * int(fx)), max(x, x - 4 * int(fx)) + 1) & rowmask(33, 35)
            m |= colmask(x, x + 1) & rowmask(35, 36)
        if m.any():
            L.paint(f, m, BEARD_D); L.paint(f, m & rowmask(33, 34), BEARD_L)
            L.paint(f, ring(m) & (rowmask(35, 38) | ~P.BODY[f]), OUTLINE)
    finish_mirrors(L); return L

def beard_gnome():
    """wide, full, rounded, past the chin to the chest, the moustache part of it"""
    L = Layer()
    for f in FACE:
        fx, fy = FACE[f]
        m = np.zeros((FH, FW), bool)
        if fy > 0.3:
            sh = round(fx * 1.5)
            m |= super_mask(24 + sh, 37.5, 8.5, 6.0, 2.4) & rowmask(33, 44)
            m |= colmask(19 + sh, 30 + sh) & rowmask(33, 35)             # the moustache
            m &= ~pxm(24 + sh, 33)                                         # the dip under the nose
        elif abs(fx) > 0.8:
            x = 24 + fx * 5.5
            m |= super_mask(x, 38.5, 4.5, 5.5, 2.4) & rowmask(33, 44)
        if m.any():
            shade_two(L, f, m, BEARD_L, BEARD_D); L.paint(f, ring(m), OUTLINE)
            ys, xs = np.where(m)
            for y, x in zip(ys, xs):
                if (y * 2 + x) % 5 == 0 and y > 36: L.paint(f, pxm(x, y), BEARD_D)
    finish_mirrors(L); return L

def beard_cropped():
    """tight along the jaw and up the cheeks, a moustache line, texture in the lower edge"""
    L = Layer()
    for f in FACE:
        fx, fy = FACE[f]
        m = np.zeros((FH, FW), bool)
        if fy > 0.3:
            sh = round(fx * 1.5)
            m |= colmask(17 + sh, 32 + sh) & rowmask(34, 38) & (P.BODY[f] | rowmask(37, 38))
            m |= colmask(17 + sh, 19 + sh) & rowmask(30, 34) | colmask(30 + sh, 32 + sh) & rowmask(30, 34)   # the cheeks
            m |= colmask(21 + sh, 28 + sh) & rowmask(33, 34)   # the moustache line
            m &= ~pxm(24 + sh, 33)
            m &= ~(colmask(22 + sh, 27 + sh) & rowmask(34, 35))   # the lip
        elif abs(fx) > 0.8:
            x0 = int(24 + fx * 7)
            m |= colmask(min(x0, 23), max(x0, 23) + 1) & rowmask(34, 38) & (P.BODY[f] | rowmask(37, 38))
            m |= colmask(min(x0, x0 - int(fx)), max(x0, x0 - int(fx)) + 1) & rowmask(30, 34)
        if m.any():
            L.paint(f, m, BEARD_D); L.paint(f, m & rowmask(30, 35), BEARD_L)
            low = np.zeros_like(m)
            for x in range(FW):
                ys = np.where(m[:, x])[0]
                if len(ys) and x % 2 == 0: low[ys.max(), x] = True
            L.paint(f, low | (ring(m) & ~P.BODY[f]), OUTLINE)
    finish_mirrors(L); return L

# ------------------------------------------------------------------ hats
def onion(light="#5f8a3a", dark="#46682a", nub="tall", slit=7):
    """the onion hat: a soft bulb over the whole head, a slit for the eyes, a nub on top"""
    L = Layer()
    for f in FACE:
        fx, fy = FACE[f]
        m = super_mask(24, 27, RX + 1.5, RY + 2, 3)
        # the nub
        if nub == "tall": m |= capsule(24, 17, 24 - 2 * fx, 13, 1.6)
        elif nub == "flop": m |= capsule(24, 17, 24 - 3, 14, 1.6) | capsule(24 - 3, 14, 24 - 5, 15, 1.4)
        else: m |= capsule(24, 17, 24, 15, 1.8)
        # the slit for the eyes
        if fy > 0.3:
            sh = round(fx * 1.5)
            m &= ~super_mask(24 + sh, 30, slit / 2 + 1.5, 3.4, 2.2)
        elif abs(fx) > 0.8:
            x = 24 + fx * 5.5
            m &= ~super_mask(x, 30, 2.6, 3.2, 2.2)
        shade_two(L, f, m, light, dark)
        L.paint(f, ring(m), OUTLINE)
        # the bulge: a fold line round the brow
        if fy > 0.3:
            sh = round(fx * 1.5)
            for dx in range(-6, 7):
                y = 25 + (abs(dx) // 4)
                if m[y, 24 + dx + sh]: L.paint(f, pxm(24 + dx + sh, y), dark)
    finish_mirrors(L); return L

def straw_hat(light="#d2b35e", dark="#a88a44", band="#6b4a2a", hair_under=HAIR_D):
    """a wide brim and a domed crown; the face is free; a little dark hair shows under the brim"""
    L = Layer()
    for f in FACE:
        fx, fy = FACE[f]
        crown = super_mask(24, 21, 8.0, 6.5, 2.6) & rowmask(0, 25)
        brim = super_mask(24, 25, 13.5, 2.2, 2.0)
        m = crown | brim
        # hair under the brim: the cap's lower edge, from the brim to the ears
        hair = engine_cap(f) & rowmask(26, 40) & ~m
        hair &= ~eyes_mask(f)
        L.two_tone(f, hair, hair_under, hair_under); L.paint(f, ring(hair) & ~m & ~P.BODY[f], OUTLINE)
        shade_two(L, f, m, light, dark)
        L.paint(f, brim & rowmask(26, 28), dark)
        L.paint(f, crown & rowmask(23, 25) & ~brim, band)
        L.paint(f, ring(m), OUTLINE)
    finish_mirrors(L); return L

def coif(light="#e6e0cc", dark="#c4bba4"):
    """a close cloth cap: the top, back and sides of the head to the jaw, tied under the chin; the face shows"""
    L = Layer()
    for f in FACE:
        fx, fy = FACE[f]
        m = super_mask(24 - fx * 0.5, 27.5, RX + 1, RY + 1.5, 3)
        if fy > 0.3:
            sh = round(fx * 1.5)
            m &= ~super_mask(24 + sh, 30, 6.5, 6.2, 2.4)        # the face window
            m |= colmask(22 + sh, 27 + sh) & rowmask(37, 38)     # the tie under the chin
        elif abs(fx) > 0.8:
            m &= ~((np.arange(FW)[None, :] * fx > (24 + fx * 2.5) * fx) & rowmask(24, 36))
            m |= colmask(int(24 + fx * 4) - 1, int(24 + fx * 4) + 1) & rowmask(36, 38)   # the tie's knot
        shade_two(L, f, m, light, dark)
        L.paint(f, ring(m), OUTLINE)
        if fy < -0.3:   # a seam down the back
            L.paint(f, colmask(24, 25) & m & rowmask(19, 34), dark)
    finish_mirrors(L); return L

def greathelm(light="#a0a2ac", dark="#6e707a", hi="#c8cad2"):
    """the classic great helm: flat-topped, the whole head, a horizontal eye slit and a cross of breaths"""
    L = Layer()
    for f in FACE:
        fx, fy = FACE[f]
        m = super_mask(24, 28, RX + 1.5, RY + 1.8, 5) & rowmask(17, 39)   # a squarer shape than the head
        shade_two(L, f, m, light, dark, share=0.35)
        L.paint(f, m & rowmask(17, 18), hi)                                 # the flat top catches the light
        # the reinforcing bands: a dark rim round the top and a vertical band down the front
        L.paint(f, m & rowmask(18, 19), dark)
        if fy > 0.3:
            sh = round(fx * 1.5)
            L.paint(f, colmask(18 + sh, 31 + sh) & rowmask(28, 30) & m, OUTLINE)       # the eye slit
            L.paint(f, colmask(24 + sh, 25 + sh) & rowmask(24, 37) & m, dark)          # the nasal band
            L.paint(f, colmask(24 + sh, 25 + sh) & rowmask(28, 30), OUTLINE)
            for dx in (-3, 3):                                                         # the breaths, a cross each side
                for ddx, ddy in ((0, 0), (0, 1), (0, 2), (-1, 1), (1, 1)): L.paint(f, pxm(24 + dx + ddx + sh, 32 + ddy), OUTLINE)
        elif abs(fx) > 0.8:
            x = int(24 + fx * 4)
            L.paint(f, colmask(min(x, x + 5 * int(fx)), max(x, x + 5 * int(fx)) + 1) & rowmask(28, 30), OUTLINE)
            for ddy in (0, 1, 2): L.paint(f, pxm(int(24 + fx * 6), 32 + ddy), OUTLINE)
        else:   # from behind: a vertical seam
            L.paint(f, colmask(24, 25) & m & rowmask(19, 38), dark)
        L.paint(f, ring(m), OUTLINE)
    finish_mirrors(L); return L

if __name__ == "__main__":
    import sys
    for name in sys.argv[1:]:
        L = globals()[name](); L.save(name); L.preview(name); print("ok", name)
