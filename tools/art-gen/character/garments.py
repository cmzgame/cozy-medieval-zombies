"""The garments: chest, legs, feet, hands, waist. Each is a function returning a Layer, painted on the
bare body's visible pixels at rest (the item's own colours fill what the painting cannot reach: the far
arm, the torso under the near arm, the hem rows a longer tunic adds)."""
import numpy as np
import paint as P
from paint import Layer, mask, along, rows, near, finish_mirrors, hx, shade, FACINGS, JOINTS, FH, FW

OUTLINE = P.OUTLINE

def row_mask(y0, y1): return (np.arange(FH)[:, None] >= y0) & (np.arange(FH)[:, None] < y1) & np.ones((FH, FW), bool)
def col_mask(x0, x1): return (np.arange(FW)[None, :] >= x0) & (np.arange(FW)[None, :] < x1) & np.ones((FH, FW), bool)
def px(x, y):
    m = np.zeros((FH, FW), bool); m[y, x] = True; return m
def bottom_edge(m):
    """the lowest pixel of each column of the mask"""
    out = np.zeros_like(m)
    for x in range(FW):
        ys = np.where(m[:, x])[0]
        if len(ys): out[ys.max(), x] = True
    return out
def top_edge(m):
    out = np.zeros_like(m)
    for x in range(FW):
        ys = np.where(m[:, x])[0]
        if len(ys): out[ys.min(), x] = True
    return out
def front_facing(f): return f in ("s", "sw", "se")
def mirrored(f): return f in P.MIRRORS

# ------------------------------------------------------------------ chest
def tunic(light="#c9b98e", dark="#a8966f", trim="#8c7a56", long=False, sleeve_t=0.45, collar=True, cross=None):
    """The tunic: the torso, sleeves to mid upper arm, a round collar, a hem line. `long` adds nothing the
    slicer can take (the engine lengthens the torso); the item carries `length: long`."""
    L = Layer()
    for f in ("s", "sw", "w", "nw", "n"):
        torso = mask(f, "torso")
        sleeves = np.zeros((FH, FW), bool)
        for arm in ("armL", "armR"):
            if mask(f, arm).any(): sleeves |= along(f, arm, -1, sleeve_t)
        m = torso | sleeves
        L.two_tone(f, m, light, dark)
        # the hem: the lowest row of the torso in the darker tone, the sleeve ends likewise
        L.paint(f, bottom_edge(torso), trim)
        for arm in ("armL", "armR"):
            if mask(f, arm).any(): L.paint(f, bottom_edge(along(f, arm, -1, sleeve_t)), trim)
        # the collar: a dip at the neck on the front views, a straight line behind
        n = JOINTS[f]["neck"]
        if front_facing(f):
            for dx, dy in ((-2, 0), (-1, 1), (0, 1), (1, 1), (2, 0)):
                x, y = n[0] + dx + (1 if f == "sw" else 0), n[1] + 1 + dy
                if torso[y, x]: L.paint(f, px(x, y), trim)
        elif f == "n" or f == "nw":
            for dx in (-2, -1, 0, 1, 2):
                x, y = n[0] + dx + (1 if f == "nw" else 0), n[1] + 1
                if torso[y, x]: L.paint(f, px(x, y), trim)
        if cross and front_facing(f):
            cx = n[0] + (1 if f == "sw" else 0)
            bar = torso & col_mask(cx - 1, cx + 2) & row_mask(n[1] + 3, n[1] + 14)
            arm_ = torso & row_mask(n[1] + 6, n[1] + 9) & col_mask(cx - 4, cx + 5)
            L.paint(f, bar | arm_, cross)
    finish_mirrors(L)
    return L

def jerkin(light="#7a4e2c", dark="#5c3a20", shirt="#d8ccaa", shirt_dark="#b8ab8a", buckle="#c8a040"):
    """A leather jerkin over a cloth shirt: the shirt shows as sleeves to the elbow and at the neck; the
    jerkin is the torso with a front seam and two buckles."""
    L = Layer()
    for f in ("s", "sw", "w", "nw", "n"):
        torso = mask(f, "torso")
        for arm in ("armL", "armR"):
            if mask(f, arm).any(): L.two_tone(f, along(f, arm, -1, 0.55), shirt, shirt_dark)
        L.two_tone(f, torso, light, dark)
        n = JOINTS[f]["neck"]
        if front_facing(f):
            cx = n[0] + (1 if f == "sw" else 0)
            # the shirt at the open neck
            for dx, dy in ((-1, 1), (0, 1), (1, 1), (0, 2)):
                if torso[n[1] + dy, cx + dx]: L.paint(f, px(cx + dx, n[1] + dy), shirt)
            # the front seam and buckles
            seam = torso & col_mask(cx, cx + 1) & row_mask(n[1] + 3, n[1] + 16)
            L.paint(f, seam, dark)
            for y in (n[1] + 6, n[1] + 11):
                if torso[y, cx]: L.paint(f, px(cx, y), buckle)
        L.paint(f, bottom_edge(torso), dark)
    finish_mirrors(L)
    return L

def dress(light="#6d5a86", dark="#52446a", trim="#c9b98e"):
    """A long dress: the torso with a trimmed neckline and sleeves to the wrist; the item is `long` and
    `covers: [legs]`, so the breeches hide and the shoes show. The skirt's flare cannot be painted (the
    torso is a substitution part), so the dress hangs straight, the engine's hem."""
    L = Layer()
    for f in ("s", "sw", "w", "nw", "n"):
        torso = mask(f, "torso")
        m = torso.copy()
        for arm in ("armL", "armR"):
            if mask(f, arm).any(): m |= along(f, arm, -1, 0.85)
        L.two_tone(f, m, light, dark)
        n = JOINTS[f]["neck"]
        if front_facing(f):
            cx = n[0] + (1 if f == "sw" else 0)
            for dx, dy in ((-3, 0), (-2, 1), (-1, 2), (0, 2), (1, 2), (2, 1), (3, 0)):
                if torso[n[1] + 1 + dy, cx + dx]: L.paint(f, px(cx + dx, n[1] + 1 + dy), trim)
        for arm in ("armL", "armR"):
            if mask(f, arm).any(): L.paint(f, bottom_edge(along(f, arm, -1, 0.85)), trim)
        L.paint(f, bottom_edge(torso), trim)
    finish_mirrors(L)
    return L

# ------------------------------------------------------------------ legs
def breeches(light="#5a4030", dark="#43301f", hem_t=0.72):
    """Breeches to the shin, loose: the leg from the top to hem_t with a darker hem row."""
    L = Layer()
    for f in ("s", "sw", "w", "nw", "n"):
        for leg in ("legL", "legR"):
            if not mask(f, leg).any(): continue
            m = along(f, leg, -1, hem_t)
            L.two_tone(f, m, light, dark)
            L.paint(f, bottom_edge(m), dark)
    finish_mirrors(L)
    return L

def hose(light="#4a4a3a", dark="#36362a"):
    """Hose: close-fitting to the ankle, one tone with the shade, nothing else."""
    L = Layer()
    for f in ("s", "sw", "w", "nw", "n"):
        for leg in ("legL", "legR"):
            if not mask(f, leg).any(): continue
            L.two_tone(f, along(f, leg, -1, 0.9), light, dark)
    finish_mirrors(L)
    return L

def patched(light="#6e5a3c", dark="#54432c", patch="#8a7a52"):
    """Patched trousers: baggy to the ankle with a patch on each knee (a lighter square)."""
    L = Layer()
    for f in ("s", "sw", "w", "nw", "n"):
        for leg in ("legL", "legR"):
            if not mask(f, leg).any(): continue
            m = along(f, leg, -1, 0.9)
            L.two_tone(f, m, light, dark)
            knee = along(f, leg, 0.5, 0.64)
            ys, xs = np.where(knee)
            if len(xs):
                x0 = xs.min() + 1 if leg == "legL" else xs.max() - 2
                sq = knee & col_mask(x0, x0 + 2)
                L.paint(f, sq, patch)
    finish_mirrors(L)
    return L

# ------------------------------------------------------------------ feet
def boots(light="#4a3522", dark="#36261a", cuff="#5e452c", top_t=0.62):
    """Boots: the shin from top_t down and the foot, a cuff row at the top, a dark sole row."""
    L = Layer()
    for f in ("s", "sw", "w", "nw", "n"):
        for leg in ("legL", "legR"):
            if not mask(f, leg).any(): continue
            m = along(f, leg, top_t, 2)
            L.two_tone(f, m, light, dark)
            L.paint(f, top_edge(m), cuff)
            L.paint(f, bottom_edge(m), OUTLINE)
    finish_mirrors(L)
    return L

def turnshoes(light="#6b4a2a", dark="#4e3419", top_t=0.86):
    """Turnshoes: low, soft, the foot only, a seam row."""
    L = Layer()
    for f in ("s", "sw", "w", "nw", "n"):
        for leg in ("legL", "legR"):
            if not mask(f, leg).any(): continue
            m = along(f, leg, top_t, 2)
            L.two_tone(f, m, light, dark)
            L.paint(f, top_edge(m), dark)
    finish_mirrors(L)
    return L

def wraps(light="#b8a78a", dark="#948366", top_t=0.7):
    """Cloth wraps to the ankle: bands of light and dark across the shin, bare toes."""
    L = Layer()
    for f in ("s", "sw", "w", "nw", "n"):
        for leg in ("legL", "legR"):
            if not mask(f, leg).any(): continue
            m = along(f, leg, top_t, 0.93)
            L.two_tone(f, m, light, dark)
            ys = np.where(m.any(1))[0]
            for y in ys[1::2]: L.paint(f, m & row_mask(y, y + 1), dark)
    finish_mirrors(L)
    return L

# ------------------------------------------------------------------ hands
def gloves(light="#6b4a2a", dark="#4e3419", hand_t=0.78):
    L = Layer()
    for f in ("s", "sw", "w", "nw", "n"):
        for arm in ("armL", "armR"):
            if not mask(f, arm).any(): continue
            m = along(f, arm, hand_t, 2)
            L.two_tone(f, m, light, dark)
            L.paint(f, top_edge(m), dark)
    finish_mirrors(L)
    return L

def gauntlets(light="#9a9ca6", dark="#6a6c76", cuff="#b8bac4", hand_t=0.72):
    """Plate gauntlets: the hand and a flared cuff one pixel past the wrist on the outer side."""
    L = Layer()
    for f in ("s", "sw", "w", "nw", "n"):
        for arm in ("armL", "armR"):
            if not mask(f, arm).any(): continue
            m = along(f, arm, hand_t, 2)
            cuffm = top_edge(m)
            # flare: one pixel out on each side of the cuff row, past the body, outlined
            ys, xs = np.where(cuffm)
            flare = np.zeros((FH, FW), bool)
            for y, x in zip(ys, xs):
                for dx in (-1, 1):
                    if 0 <= x + dx < FW and not P.BODY[f][y, x + dx]: flare[y, x + dx] = True
            L.two_tone(f, m, light, dark)
            L.paint(f, cuffm | flare, cuff)
            L.outline_past_body(f, m | flare)
    finish_mirrors(L)
    return L

def hand_wraps(light="#c9b98e", dark="#a8966f", hand_t=0.76):
    L = Layer()
    for f in ("s", "sw", "w", "nw", "n"):
        for arm in ("armL", "armR"):
            if not mask(f, arm).any(): continue
            m = along(f, arm, hand_t, 2)
            L.two_tone(f, m, light, dark)
            ys = np.where(m.any(1))[0]
            for y in ys[1::2]: L.paint(f, m & row_mask(y, y + 1), dark)
    finish_mirrors(L)
    return L

# ------------------------------------------------------------------ waist
SLANT = {"s": 0.0, "n": 0.0, "sw": 0.5, "nw": -0.5, "w": 0.0}   # the iso tilt of a band round the body, rows per column toward the near side

def band_rows(f, y_top, height=2):
    """rows of a band round the torso at y_top (the centre column), following the facing's slant"""
    torso = mask(f, "torso"); m = np.zeros((FH, FW), bool)
    xs = np.where(torso.any(0))[0]
    if len(xs) == 0: return m
    cx = (xs.min() + xs.max()) / 2
    for x in xs:
        y0 = int(round(y_top + SLANT[f] * (x - cx)))
        for y in range(y0, y0 + height):
            if 0 <= y < FH and torso[y, x]: m[y, x] = True
    return m

def belt_rows(f):
    """the belt's two rows: at the hip joint height, as the engine bands it"""
    return band_rows(f, JOINTS[f]["hip"][1] - 2, 2)

def belt(light="#6b4a2a", dark="#4a3219", buckle="#c8a040"):
    L = Layer()
    for f in ("s", "sw", "w", "nw", "n"):
        m = belt_rows(f)
        L.two_tone(f, m, light, dark)
        if front_facing(f):
            n = JOINTS[f]["neck"]; cx = n[0] + (1 if f == "sw" else 0); y = JOINTS[f]["hip"][1] - 2
            if m[y, cx]: L.paint(f, px(cx, y), buckle)
            if m[y + 1, cx]: L.paint(f, px(cx, y + 1), buckle)
    finish_mirrors(L)
    return L

def pouch_belt(light="#6b4a2a", dark="#4a3219", buckle="#c8a040", pouch="#8a6a42", pouch_dark="#6a4e30"):
    """A belt with a pouch on the figure's left hip (asymmetric: all eight facings painted)."""
    L = belt(light, dark, buckle)
    # the pouch: a 3 x 3 on the left hip below the belt, on the near side of the torso
    for f in FACINGS:
        torso = mask(f, "torso")
        if not torso.any(): continue
        y = JOINTS[f]["hip"][1]
        ys, xs = np.where(torso & row_mask(y, y + 1))
        if len(xs) == 0: continue
        # the figure's left hip is screen-right facing the camera, screen-left facing away
        left = f in ("s", "sw", "se", "w")
        x0 = xs.max() - 3 if left else xs.min() + 1
        if f in ("e",): x0 = xs.min() + 1
        if f in ("w",): x0 = xs.max() - 3
        m = torso & col_mask(x0, x0 + 3) & row_mask(y, y + 3)
        L.two_tone(f, m, pouch, pouch_dark)
        L.paint(f, top_edge(m), pouch_dark)
    return L

def rope(light="#b8a67c", dark="#8f7f5c"):
    """A tied cord: one row, with a knot and two hanging ends on the front views."""
    L = Layer()
    for f in ("s", "sw", "w", "nw", "n"):
        y = JOINTS[f]["hip"][1] - 1
        m = band_rows(f, y, 1)
        L.two_tone(f, m, light, dark)
        if front_facing(f):
            cx = JOINTS[f]["neck"][0] + (1 if f == "sw" else 0)
            torso = mask(f, "torso")
            for dx, dy in ((0, 0), (-1, 1), (0, 1), (0, 2), (-1, 3)):
                if torso[y + dy, cx + dx]: L.paint(f, px(cx + dx, y + dy), dark if dy else light)
    finish_mirrors(L)
    return L

if __name__ == "__main__":
    import sys
    name = sys.argv[1] if len(sys.argv) > 1 else "tunic"
    L = globals()[name](); L.save(name); L.preview(name); print("ok", name)
