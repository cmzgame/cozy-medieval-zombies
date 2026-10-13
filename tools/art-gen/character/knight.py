"""The knight: a white surcoat with the black cross over mail, oversized pauldrons, mail chausses,
plate greaves, gauntlets, the great helm (heads.py). Michael's Teutonic reference, 2026-10-12."""
import numpy as np
import paint as P
from paint import Layer, mask, along, finish_mirrors, FACINGS, JOINTS, FH, FW, OUTLINE
from garments import row_mask, col_mask, px, bottom_edge, top_edge, front_facing, band_rows

MAIL_L, MAIL_D = "#8e9099", "#62646e"
PLATE_L, PLATE_D, PLATE_HI = "#a0a2ac", "#6e707a", "#c8cad2"
WHITE, WHITE_D, BLACK = "#e8e4d8", "#c2bdb0", "#262428"

def mail(L, f, m):
    """two tones with a sparse ring pattern: every other pixel on every other row goes dark"""
    L.two_tone(f, m, MAIL_L, MAIL_D)
    ys, xs = np.where(m)
    for y, x in zip(ys, xs):
        if (y % 2 == 0) and ((x + y // 2) % 2 == 0): L.paint(f, px(x, y), MAIL_D)

def pauldron_mask(f, arm):
    """an oversized shoulder plate: the top of the arm plus a rim one pixel past the body, above and outside"""
    a = mask(f, arm)
    if not a.any(): return a
    top = along(f, arm, -1, 0.22)
    ys, xs = np.where(top)
    cx = int(round(xs.mean())); y0 = ys.min()
    plate = np.zeros((FH, FW), bool)
    for y in range(y0 - 1, ys.max() + 1):
        w = 4 if y <= y0 else 5
        for x in range(cx - w, cx + w + 1):
            if 0 <= x < FW and 0 <= y < FH: plate[y, x] = True
    # keep it to the arm's side of the torso: never over the torso's own pixels
    plate &= ~mask(f, "torso") | top
    return plate | top

def surcoat():
    """chest: the surcoat (torso, long) with the cross; mail sleeves; pauldrons over the shoulders"""
    L = Layer()
    for f in ("s", "sw", "w", "nw", "n"):
        torso = mask(f, "torso")
        for arm in ("armL", "armR"):
            if mask(f, arm).any(): mail(L, f, along(f, arm, -1, 0.72))
        L.two_tone(f, torso, WHITE, WHITE_D, share=0.3)
        n = JOINTS[f]["neck"]
        cx = n[0] + (1 if f == "sw" else (-1 if f == "nw" else 0))
        if front_facing(f):
            bar = torso & col_mask(cx - 1, cx + 2) & row_mask(n[1] + 2, n[1] + 15)
            arm_ = torso & row_mask(n[1] + 6, n[1] + 9) & col_mask(cx - 5, cx + 6)
            L.paint(f, bar | arm_, BLACK)
            # the mail collar at the neck
            for dx in (-2, -1, 0, 1, 2):
                if torso[n[1] + 1, cx + dx]: L.paint(f, px(cx + dx, n[1] + 1), MAIL_D)
        elif f == "n" or f == "nw":
            bar = torso & col_mask(cx - 1, cx + 2) & row_mask(n[1] + 2, n[1] + 15)
            arm_ = torso & row_mask(n[1] + 6, n[1] + 9) & col_mask(cx - 5, cx + 6)
            L.paint(f, bar | arm_, BLACK)
        L.paint(f, bottom_edge(torso), WHITE_D)
        for arm in ("armL", "armR"):
            pm = pauldron_mask(f, arm)
            if pm.any():
                L.two_tone(f, pm, PLATE_L, PLATE_D, share=0.35)
                L.paint(f, top_edge(pm), PLATE_HI)
                L.outline_past_body(f, pm)
    finish_mirrors(L)
    return L

def chausses():
    """legs: mail to the ankle"""
    L = Layer()
    for f in ("s", "sw", "w", "nw", "n"):
        for leg in ("legL", "legR"):
            if mask(f, leg).any(): mail(L, f, along(f, leg, -1, 0.9))
    finish_mirrors(L)
    return L

def greaves():
    """feet: plate greaves from the knee down and sabatons, a bright cuff, a dark sole"""
    L = Layer()
    for f in ("s", "sw", "w", "nw", "n"):
        for leg in ("legL", "legR"):
            if not mask(f, leg).any(): continue
            m = along(f, leg, 0.58, 2)
            L.two_tone(f, m, PLATE_L, PLATE_D, share=0.35)
            L.paint(f, top_edge(m), PLATE_HI)
            # the knee cop: a brighter row two below the cuff
            ys = np.where(m.any(1))[0]
            if len(ys) > 3: L.paint(f, m & row_mask(ys[0] + 2, ys[0] + 3), PLATE_HI)
            L.paint(f, bottom_edge(m), OUTLINE)
    finish_mirrors(L)
    return L

def sword_belt(light="#7a4e2a", dark="#553418", buckle="#d8c070"):
    """waist: a belt with a big buckle and a second strap hanging to the left hip"""
    L = Layer()
    for f in ("s", "sw", "w", "nw", "n"):
        h = JOINTS[f]["hip"][1]
        m = band_rows(f, h - 2, 2)
        L.two_tone(f, m, light, dark)
        if front_facing(f):
            cx = JOINTS[f]["neck"][0] + (1 if f == "sw" else 0)
            for dy in (0, 1):
                if m[h - 2 + dy, cx]: L.paint(f, px(cx, h - 2 + dy), buckle)
            torso = mask(f, "torso")
            for dx, dy in ((1, 2), (2, 3), (2, 4)):
                if torso[h - 2 + dy, cx + dx]: L.paint(f, px(cx + dx, h - 2 + dy), dark)
    finish_mirrors(L)
    return L

if __name__ == "__main__":
    import sys
    for name in sys.argv[1:]:
        L = globals()[name](); L.save("knight_" + name); L.preview("knight_" + name); print("ok", name)
