"""Onion hat revisions (2026-10-17, for Michael to pick): the eyes clear in every facing that shows them.
Built on tools/art-gen/character/heads.py and paint.py (the same bulb, nub, two tones, outline all round), with the
face opening cut round where the game actually draws the eyes (src/figure/draw.js, the face), facing by facing:
 front (s, sw, se): two eyes 3 wide, 5 tall, rows 28-32, columns 20-22 and 26-28 shifted by round(fx * 1.5);
 side (w, e): one eye, columns round(24 + fx * 6) and the two behind it, rows 28-32.
The game's eyes centre half a pixel right of the head's centre, so a pixel mirror of w, sw, nw lands e and se one
column off; every facing is therefore painted, not mirrored (docs/28 allows either).
Michael picked (b) brow on 2026-10-18 ("b brow is perfect!"): it is data/art/character/layers/head_onion_b_brow.png, sliced
to data/layers/head/onion.json and worn by the item `hood`. Usage: python onion2.py <repo root> <out folder> b"""
import math, sys, os
sys.path.insert(0, sys.argv[1] + "/tools/art-gen/character")
import numpy as np
import paint as P
from paint import Layer, FH, FW, OUTLINE
import heads as H

LIGHT, DARK = "#5f8a3a", "#46682a"
FACE8 = {f: (math.cos(math.radians(a)), math.sin(math.radians(a))) for f, a in
         {"e": 0, "se": 45, "s": 90, "sw": 135, "w": 180, "nw": 225, "n": 270, "ne": 315}.items()}
def jsround(v): return math.floor(v + 0.5)

def eye_box(f):
    """the eyes' columns and rows as draw.js puts them (None from behind)"""
    fx, fy = FACE8[f]
    if fy > 0.3:
        sh = jsround(fx * 1.5); return (20 + sh, 28 + sh, 28, 32)
    if fy > -0.3:
        outer = jsround(24 + fx * 6); return (min(outer, outer - 2 * int(math.copysign(1, fx))), max(outer, outer - 2 * int(math.copysign(1, fx))), 28, 32)
    return None

def rounded_hole(x0, x1, y0, y1, corner=1):
    """a box of transparent pixels x0..x1, y0..y1 inclusive (the outline ring included), its corners cut by `corner`"""
    m = np.zeros((FH, FW), bool); m[y0:y1 + 1, x0:x1 + 1] = True
    for k in range(corner):
        for (cx, cy, sx, sy) in ((x0, y0, 1, 1), (x1, y0, -1, 1), (x0, y1, 1, -1), (x1, y1, -1, -1)):
            for d in range(corner - k):
                m[cy + sy * k, cx + sx * d] = False
    return m

def oval_hole(cx, cy, rx, ry, n=2.4):
    yy, xx = np.mgrid[0:FH, 0:FW]; px, py = xx + 0.5, yy + 0.5
    return np.abs((px - cx) / rx) ** n + np.abs((py - cy) / ry) ** n <= 1

def bulb(f, nub="tall"):
    fx, fy = FACE8[f]
    m = H.super_mask(24, 27, H.RX + 1.5, H.RY + 2, 3)
    if nub == "tall": m |= H.capsule(24, 17, 24 - 2 * fx, 13, 1.6)
    return m

def onion_v(style):
    """style a: the hero's opening widened and lowered; b: a, the fold raised above the brow and the opening a row
    taller; c: the Kenny read, a big oval like the code hood's, ringed in the dark tone"""
    L = Layer()
    for f in P.FACINGS:
        fx, fy = FACE8[f]
        m = bulb(f)
        eb = eye_box(f)
        hole = np.zeros((FH, FW), bool)
        if eb:
            x0, x1, y0, y1 = eb   # the eyes: x0..x1, y0..y1
            front = fy > 0.3
            if style == "a":     # ring on the eyes' top row edge (as the hero), a skin pixel at the sides and below
                hole = rounded_hole(x0 - 2, x1 + 2, y0 - 1, y1 + 2, 1)
            elif style == "b":   # a skin row above the eyes as well, the fold well clear
                hole = rounded_hole(x0 - 2, x1 + 2, y0 - 2, y1 + 2, 1 if not front else 2)
            else:                # the Kenny: the code hood's opening (rx headRx - 3.5, ry headRy - 3), outlined
                if front:
                    cx, rx = (x0 + x1 + 1) / 2, 6.6
                else:   # from the side: the ring two columns in front of the eye (a skin pixel before the pupil), nine wide
                    lo, hi = (x0 - 2, x0 + 8) if fx < 0 else (x1 - 8, x1 + 2)
                    cx, rx = (lo + hi + 1) / 2, (hi - lo + 1) / 2 + 0.05
                hole = oval_hole(cx, 29.6, rx, 7.6, 2.6)
        # at least one pixel of hat between the opening's ring and the outline, all round (the e side sits a column
        # nearer the edge than the w, the game's eyes being half a pixel right of centre)
        inner = m.copy()
        for _ in range(1):
            q = np.pad(inner, 1); inner = inner & q[:-2, 1:-1] & q[2:, 1:-1] & q[1:-1, :-2] & q[1:-1, 2:]
        hole &= inner
        m &= ~hole
        H.shade_two(L, f, m, LIGHT, DARK)
        if style == "c" and eb:
            # the rim: hat pixels round the opening in the dark tone, a drawn-in hem like Kenny's parka
            rim = H.ring(hole) & m
            L.paint(f, rim, DARK)
        L.paint(f, H.ring(m), OUTLINE)
        # the fold round the brow (front facings, as the hero)
        if fy > 0.3:
            sh = jsround(fx * 1.5)
            if style == "a": rows = lambda dx: 25 + (abs(dx) // 4)            # the hero's fold
            elif style == "b": rows = lambda dx: 21 + (abs(dx) // 3)          # raised, a softer curve over the brow
            else: rows = None
            if rows:
                for dx in range(-7, 8):
                    y = rows(dx); x = 24 + dx + sh
                    if m[y, x] and not H.ring(m)[y, x] and not (m[y + 1, x] == False):
                        L.paint(f, H.pxm(x, y), DARK)
        elif style == "b" and abs(fx) > 0.8:
            # from the side the fold is a short arc over the brow, toward the face
            for dx in range(0, 7):
                x = int(24 + fx * (3 + dx)); y = 21 + dx // 3
                if m[y, x] and m[y + 1, x]: L.paint(f, H.pxm(x, y), DARK)
    return L

if __name__ == "__main__":
    out = sys.argv[2]; os.makedirs(out, exist_ok=True)
    for s in sys.argv[3:]:
        name = {"a": "head_onion_a_open", "b": "head_onion_b_brow", "c": "head_onion_c_kenny"}[s]
        L = onion_v(s); L.save(name, out); print("ok", name)
