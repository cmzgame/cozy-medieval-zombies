"""The character body, hand-pixelled per part per facing on the rig's template (docs/25). Round 2.

Each part is an ASCII grid at an origin in the 48x72 frame; its outline is made by 4-neighbour
dilation (as figure.js does), parts are composited far to near, so fused limbs share one outline.
Canonical tones only: skin base, skin shadow, outline, eye white, pupil. The game dyes by swapping them.
Shading is the engine's rule applied in the art (the right-hand 40% of each row run of skin, one column on
the head, the face never), so every facing, mirrored ones included, is lit from the top-left.

Round 2 (Michael, 2026-10-12): the generated head and eyes kept as they were; arms end at the hip line with
the old gentle outward drift and no shoulder caps; the profile torso 8 deep with 4-wide arms; the slanted
hem on the three-quarter views.
"""
import os
import numpy as np
from PIL import Image

D = os.path.dirname(os.path.abspath(__file__)); OUT = D + "/out"; os.makedirs(OUT, exist_ok=True)
FW, FH = 48, 72

def hx(s): s = s.lstrip("#"); return tuple(int(s[i:i + 2], 16) for i in (0, 2, 4))
PAL = {
    "o": hx("#f0c8a0"),   # skin base
    "-": hx("#caa886"),   # skin shadow (base * 0.84, the engine's tone)
    "w": hx("#f5f5f0"),   # eye white
    "@": hx("#3c6ea0"),   # pupil (canonical; the game swaps it for look.eyes)
}
OUTLINE = hx("#1a1420")
TAGS = {"o": 1, "-": 1, "w": 2, "@": 3}      # dye regions: 1 skin, 2 eye white, 3 pupil

def part(x, y, rows): return (x, y, rows)

# ------------------------------------------------------------------ the head: the generated one, as it was
# fill rows 19-36, cols 16-31 at the widest; eyes: whites 3x5 (rows 28-32), pupils 2x3 (rows 30-32) low and inside
def head_rows(eyes=()):
    """eyes: (white_col, pupil_col) pairs relative to the origin x=16; each eye is whites 3 wide by 5 tall
    at rows 28-32 and a 2 x 3 pupil at rows 30-32. The face is never shaded; one shade column on the right."""
    rows = []
    rows.append("..oooooooooooo..")        # row 19
    rows.append(".oooooooooooooo.")        # row 20
    rows.append(".oooooooooooooo.")        # row 21
    for _ in range(6): rows.append("oooooooooooooooo")   # rows 22..27
    eye = [list("oooooooooooooooo") for _ in range(5)]   # rows 28..32
    for (wc, pc) in eyes:
        for r in range(5):
            for c in range(wc, wc + 3): eye[r][c] = "w"
            if r >= 2:
                for c in range(pc, pc + 2): eye[r][c] = "@"
    rows += ["".join(r) for r in eye]
    rows.append("oooooooooooooooo")        # row 33
    rows.append(".oooooooooooooo.")        # row 34
    rows.append(".oooooooooooooo.")        # row 35
    rows.append("..oooooooooooo..")        # row 36
    return rows

# ------------------------------------------------------------------ limbs
def arm(upper, lower, mitt, n_upper=7, n_lower=6, mitt_rows=3, top=True):
    """An arm as rows of a grid whose columns are given as (start, width) per section, in grid columns.
    A rounded top row, the upper arm, the lower arm (shifted for the gentle drift), a wrist notch, the mitt."""
    def row(s, w, width): return "." * s + "o" * w + "." * (width - s - w)
    width = max(upper[0] + upper[1], lower[0] + lower[1], mitt[0] + mitt[1])
    rows = []
    if top: rows.append(row(upper[0] + 1, upper[1] - 2, width))
    rows += [row(*upper, width)] * n_upper
    rows += [row(*lower, width)] * n_lower
    rows.append(row(lower[0] + 1, lower[1] - 2, width))            # wrist
    rows += [row(*mitt, width)] * mitt_rows
    return rows

def leg(cols, foot, n=14, top_slant=None):
    """A leg: n rows `cols` wide, two foot rows `foot` wide, a shaded sole. top_slant: per-column first row
    offsets (a list as long as the grid), to start the leg under a slanted hem."""
    width = max(cols[0] + cols[1], foot[0] + foot[1])
    def row(s, w): return "." * s + "o" * w + "." * (width - s - w)
    rows = [row(*cols)] * n + [row(*foot)] * 2 + ["." * foot[0] + "-" * foot[1] + "." * (width - foot[0] - foot[1])]
    if top_slant:
        rows = [list(r) for r in rows]
        for c, off in enumerate(top_slant):
            for r in range(off): rows[r][c] = "."
        rows = ["".join(r) for r in rows]
    return rows


# ------------------------------------------------------------------ the old arms, reconstructed from the rig
# figure.js draws an arm as a capsule of radius 2.9 from the shoulder joint to the hand joint plus a hand
# ellipse of radius 2.7 at the hand, pixel-centre tested. The joints are the template's. Michael (2026-10-12,
# round 3): keep these arms on the new body. Two rules: nothing pokes above the shoulder line (row 37), so
# the rounded top is clipped flat; and a far arm shows at least two pixels of skin before its outline meets
# the torso's (checked in render()).
import json as _json
_TEMPLATE = _json.load(open(os.path.join(D, "out", "character_template.json")))
SHOULDER_ROW = 36

def old_arm_mask(facing, which, shift=(0, 0), clip_top=True):
    J = _TEMPLATE["facings"][facing]["joints"]; a = J["shoulder" + which]; b = J["hand" + which]
    ax, ay, bx, by = a[0] + shift[0], a[1] + shift[1], b[0] + shift[0], b[1] + shift[1]
    m = np.zeros((FH, FW), bool)
    dx, dy = bx - ax, by - ay; l2 = dx * dx + dy * dy or 1
    for y in range(FH):
        for x in range(FW):
            px, py = x + 0.5, y + 0.5
            t = max(0.0, min(1.0, ((px - ax) * dx + (py - ay) * dy) / l2)); cx, cy = ax + dx * t, ay + dy * t
            if (px - cx) ** 2 + (py - cy) ** 2 <= 2.9 ** 2: m[y, x] = True
            ex, ey = (px - bx) / 2.7, (py - by) / 2.7
            if ex * ex + ey * ey <= 1: m[y, x] = True
    if clip_top:
        # drop the capsule's topmost rows while fewer than two pixels of them would show beside the head
        # (the single skin pixel that read as a pointed shoulder); the slope below it stays
        m[:SHOULDER_ROW] = False
    return m

def mask_part(m):
    ys, xs = np.where(m); x0, y0 = xs.min(), ys.min()
    rows = ["".join("o" if m[y, x] else "." for x in range(x0, xs.max() + 1)) for y in range(y0, ys.max() + 1)]
    return part(int(x0), int(y0), rows)

# ------------------------------------------------------------------ S (facing the camera)
# joints: shoulders (16,38) (32,38), hands (15,52) (34,52), hips (21,49) (28,49), feet (21,66) (28,66)
S = {
    "order": ["legR", "legL", "armR", "armL", "torso", "head"],     # the generated order: the torso covers the arms' inner edges
    "head": part(16, 19, head_rows(eyes=[(4, 5), (10, 10)])),      # whites cols 20-22 / 26-28, pupils 21-22 / 26-27
    "torso": part(19, 35, ["..ooooooo..", ".ooooooooo."] + ["ooooooooooo"] * 18),   # cols 19-29, rows 35-54 (the generated length)
    # arms: 5 wide from the torso's top row, drifting 1 px outward below the elbow, a wrist notch, a 6-wide mitt
    # rows 37-53: upper 37-44, lower 45-49, wrist 50, mitt 51-53 (the hand joint, 52, is the mitt's middle)
    "armR": mask_part(old_arm_mask("s", "R")),
    "armL": mask_part(old_arm_mask("s", "L")),
    "legR": part(17, 56, leg(cols=(1, 6), foot=(0, 7), n=11)),     # cols 18-23, foot 17-23; rows 56-66, foot 67-68, sole 69
    "legL": part(25, 56, leg(cols=(0, 6), foot=(0, 7), n=11)),     # cols 25-30, foot 25-31
}

# ------------------------------------------------------------------ N (the back)
N = {
    "order": ["legL", "legR", "torso", "armL", "armR", "head"],
    "head": part(16, 19, head_rows()),
    "torso": S["torso"],
    "armL": S["armR"], "armR": S["armL"],
    "legL": S["legR"], "legR": S["legL"],
}

# ------------------------------------------------------------------ W (profile, facing screen-left)
# joints: shoulderR (24,34) far, shoulderL (24,42) near; hands (24,47) far, (24,57) near; hips 47 / 51; feet 64 / 68
W = {
    "order": ["armR", "legR", "torso", "legL", "armL", "head"],
    "head": part(16, 19, head_rows(eyes=[(2, 2)])),                 # one eye at the front: whites cols 18-20, pupil 18-19
    "torso": part(20, 35, ["..oooo..", ".oooooo."] + ["oooooooo"] * 18),    # 8 deep, cols 20-27, rows 35-54
    # the near arm hangs over the front half of the torso, 4 wide, drifting 1 px forward; rows 40-57
    "armL": mask_part(old_arm_mask("w", "L")),
    "armR": mask_part(old_arm_mask("w", "R", clip_top=False)),   # the far arm, hidden behind the torso and head at rest
    "legR": part(20, 52, leg(cols=(1, 6), foot=(0, 7), n=11)),      # far leg cols 21-26, hidden by the near leg at rest
    "legL": part(19, 56, leg(cols=(2, 6), foot=(0, 8), n=11)),      # near leg cols 21-26, rows 56-66; the foot points forward, 2 px of toe
}

# ------------------------------------------------------------------ SW (three-quarter, toward the camera)
# joints: shoulderR (18,35) far-left, shoulderL (30,41) near-right; hands (17,49), (31,55); hips (22,48), (26,50); feet 65 / 67
def torso_sw():
    """cols 19-29; the hem slants down to the near side at 1:2 (the iso tilt): hem row at col c = 51 + (c-19)//2."""
    rows = ["..ooooooo..", ".ooooooooo."] + ["ooooooooooo"] * 15            # rows 35-51
    for r in range(52, 58):                                                   # the hem: col 19 ends at 52, col 29 at 57
        rows.append("".join("o" if (c - 19) // 2 >= r - 52 else "." for c in range(19, 30)))
    return rows
SW = {
    "order": ["armR", "legR", "torso", "legL", "armL", "head"],
    "head": part(16, 19, head_rows(eyes=[(3, 4), (9, 9)])),        # eyes one px toward where it looks: whites 19-21 / 25-27
    "torso": part(19, 35, torso_sw()),
    # far arm, screen-left, from the torso's top row (the joint is higher; no cap): rows 37-50, cols 15-19 then 14-18
    "armR": mask_part(old_arm_mask("sw", "R", shift=(-1, 0))),   # the far arm, one px outward so two px of skin show beside the torso
    "armL": mask_part(old_arm_mask("sw", "L")),
    "legR": part(17, 53, leg(cols=(2, 6), foot=(0, 8), n=12)),      # far leg cols 19-24, under the torso to the hem; foot 65-66
    # near leg cols 23-28, starting under the slanted hem (cols 23,24 at row 55; 25,26 at 56; 27,28 at 57); foot 67-68, sole 69
    "legL": part(21, 55, leg(cols=(2, 6), foot=(0, 8), n=12, top_slant=[0, 0, 0, 0, 1, 1, 2, 2])),
}

# ------------------------------------------------------------------ NW: SW's geometry mirrored, the names kept, no face
def mirror(fac):
    """Mirror a facing left-right (x -> 47 - x) and swap the L/R part names."""
    swap = {"armL": "armR", "armR": "armL", "legL": "legR", "legR": "legL"}
    out = {"order": [swap.get(n, n) for n in fac["order"]]}
    for name in fac:
        if name == "order": continue
        ox, oy, rows = fac[name]
        w = max(len(r) for r in rows)
        rows2 = [r.ljust(w, ".")[::-1] for r in rows]
        out[swap.get(name, name)] = part(FW - (ox + w), oy, rows2)
    return out

def nw_from_sw():
    m = mirror(SW)                      # mirror swaps the names; swap them back: nw's near arm is armL, on the left
    swap = {"armL": "armR", "armR": "armL", "legL": "legR", "legR": "legL"}
    out = {"order": [swap.get(n, n) for n in m["order"]]}
    for k, v in m.items():
        if k == "order": continue
        out[swap.get(k, k)] = v
    out["head"] = part(16, 19, head_rows())
    return out

# ------------------------------------------------------------------ compositing
SHADE_SHARE = 0.4   # of each row run of skin that is in shadow (the engine's rule), light from the upper left
HEAD_SHADE = 1      # the head takes one shaded column on its right edge; the face stays flat

def layer(ox, oy, rows, name="part"):
    m = np.zeros((FH, FW), bool); col = np.zeros((FH, FW, 3), np.uint8); tg = np.zeros((FH, FW), np.uint8)
    skin = np.zeros((FH, FW), bool)
    for y, r in enumerate(rows):
        for x, ch in enumerate(r):
            if ch == ".": continue
            X, Y = ox + x, oy + y
            m[Y, X] = True; col[Y, X] = PAL[ch]; tg[Y, X] = TAGS[ch]
            if ch == "o": skin[Y, X] = True
    for y in range(FH):
        x = 0
        while x < FW:
            if not skin[y, x]: x += 1; continue
            x1 = x
            while x1 + 1 < FW and skin[y, x1 + 1]: x1 += 1
            run = x1 - x + 1
            dark = HEAD_SHADE if name == "head" else int(run * SHADE_SHARE)
            for k in range(x1 - dark + 1, x1 + 1): col[y, k] = PAL["-"]
            x = x1 + 1
    p = np.pad(m, 1)
    ring = ~m & (p[:-2, 1:-1] | p[2:, 1:-1] | p[1:-1, :-2] | p[1:-1, 2:])
    return m, ring, col, tg

def render(fac):
    rgb = np.zeros((FH, FW, 3), np.uint8); a = np.zeros((FH, FW), bool); tag = np.zeros((FH, FW), np.uint8); pid = np.zeros((FH, FW), np.uint8)
    layers = {}
    for k, name in enumerate(fac["order"], 1):
        m, ring, col, tg = layer(*fac[name], name=name)
        rgb[m] = col[m]; tag[m] = tg[m]; pid[m] = k
        rgb[ring] = OUTLINE; tag[ring] = 0; pid[ring] = k
        a |= m | ring
        layers[name] = (m, ring, col)
    return rgb, a, tag, pid, layers

def check_arms(fac, label=""):
    """Rule 2: wherever an arm shows beside the torso, at least two pixels of its skin show before its
    outline meets the torso's. Returns the rows that break it."""
    rgb, a, tag, pid, layers = render(fac)
    order = fac["order"]; bad = []
    for name in ("armL", "armR"):
        k = order.index(name) + 1
        vis = (pid == k) & (tag > 0)          # this arm's visible skin
        for y in range(FH):
            xs = np.where(vis[y])[0]
            if len(xs) == 0: continue
            runs = np.split(xs, np.where(np.diff(xs) > 1)[0] + 1)
            for r in runs:
                if len(r) < 2: bad.append((name, y, int(r[0])))
    return bad

def image(rgb, a):
    out = np.zeros((FH, FW, 4), np.uint8); out[..., :3] = rgb; out[..., 3] = a * 255
    return Image.fromarray(out, "RGBA")

FACINGS = None
def facings():
    global FACINGS
    if FACINGS is None:
        NW = nw_from_sw()
        FACINGS = {"s": S, "sw": SW, "w": W, "nw": NW, "n": N, "ne": mirror(NW), "e": mirror(W), "se": mirror(SW)}
    return FACINGS

if __name__ == "__main__":
    for f, fac in facings().items():
        rgb, a, tag, pid, _ = render(fac)
        im = image(rgb, a); im.save(f"{OUT}/new_{f}_1x.png"); print(f, im.getbbox())
