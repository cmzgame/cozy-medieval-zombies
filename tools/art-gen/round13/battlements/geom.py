"""The battlement as boxes. All numbers here are the proposal (README, "Proportions").

The frame is the n edge's: the edge line is y = 0, the walkway's own tile stays on its side of the line, and the whole
battlement is on the OTHER side of it:
    far  (side -1): the walkway is south (y > 0), the battlement stands at y in [-16, 0]  (outside north, the camera's far side)
    near (side +1): the walkway is north (y < 0), the battlement stands at y in [0, 16]   (outside south, the camera's near side)
Z = 0 is the walkway's floor. A w edge is the same thing mirrored across the diagonal (Box.swapped).

margin, not padding: of the 16 the stone is thick, 8 sit on the ledge the wall below has beyond the edge line (the wall is
16 thick, centred on the line) and 8 hang out over the wall's outer face, on a slab and a row of stepped corbels.
"""
from core import Box, tone_of, mix, hx
SHADOW = hx('#3b3734')

W = 16            # the battlement's thickness, wholly outside the edge line
PARAPET = 28      # the low wall between merlons, coping included
MERLON = 44       # a merlon's top, the capstone included
WALL_FACE = 8     # the lower wall's face is 8 from the edge line (it is 16 thick, centred)
P = 32            # period: one merlon and one crenel per edge segment, merlons centred on the vertices


def bounds(side):
    return (-W, 0) if side < 0 else (0, W)


# course boundaries mod 32 for the three plain courses (all courses 8 high). Blocks that touch a vertex are SHARED between
# two neighbouring pieces and so never change from variant to variant; the others (the "inner" ones) may.
def lower_bounds(c, variant):
    if c == 0:
        b = [8, 24]
        if variant == 2:
            b = [8, 16, 24]
    elif c == 1:
        b = [0, {0: 13, 1: 10, 2: 16}[variant]]
    else:
        b = [5, 19]
        if variant == 1:
            b = [5, 12, 19]
    return b


def blocks(c, variant, a_min, a_max):
    """(start, end, shared) blocks of lower course c over [a_min, a_max], clipped to it"""
    b = lower_bounds(c, variant)
    k0 = int(a_min // P) - 2
    k1 = int(a_max // P) + 2
    pts = sorted({bb + P * k for k in range(k0, k1 + 1) for bb in b})
    out = []
    for s, e in zip(pts[:-1], pts[1:]):
        # a block is inner (variant-dependent) when it lies inside one segment: both ends in [32k, 32k + 32]
        k = s // P
        inner = (s >= P * k) and (e <= P * (k + 1))
        if e <= a_min or s >= a_max:
            continue
        out.append((max(s, a_min), min(e, a_max), s, e, not inner))
    return out


def strip(side, a_min, a_max, variant=0, kind="plain", corbels=None):
    """the battlement of one n edge's run over [a_min, a_max] (a free end where it stops), as boxes"""
    y0, y1 = bounds(side)
    boxes = []
    near = side > 0
    for c in range(3):
        for (s, e, s0, e0, shared) in blocks(c, variant, a_min, a_max):
            seed = (c, int(s0) % P, int(e0) % P) if shared else (c, int(s0) % P, variant)
            boxes.append(Box(s, e, y0, y1, 8 * c, 8 * c + 8, "x", tone_of(*seed, 11), mix(*seed, 5) % 2))
    # the merlons, one centred on every vertex a = 32 k
    k0 = int(a_min // P) - 1
    k1 = int(a_max // P) + 1
    for k in range(k0, k1 + 1):
        a = P * k
        ms, me = max(a - 8, a_min), min(a + 8, a_max)
        if me <= ms:
            continue
        # the courses above the parapet's own three: two stones high, then the capstone (4 high, the lightest top)
        h3 = [(ms, min(me, a)), (max(ms, a), me)] if ms < a < me else [(ms, me)]
        for (s, e) in h3:
            boxes.append(Box(s, e, y0, y1, 24, 32, "x", tone_of(3, k % 2, int(s - a)), 0))
        boxes.append(Box(ms, me, y0, y1, 32, 40, "x", tone_of(4, k % 2), 0))
        boxes.append(Box(ms, me, y0, y1, 40, 44, "x", tone_of(5, k % 2), 1))
    # the crenel between merlons: a coping slab 4 high, 16 long, its top the lightest
    for k in range(k0, k1 + 1):
        a = P * k
        s, e = max(a + 8, a_min), min(a + 24, a_max)
        if e <= s:
            continue
        if kind == "loop":
            # a solid stretch with an arrow loop instead of a crenel
            cut = [(s, e)]
            for (ss, ee) in cut:
                boxes.append(Box(ss, ee, y0, y1, 24, 32, "x", tone_of(6, variant), 0,
                                 decal=[("slit", a + 15, a + 17, 26, 36)] if ss <= a + 15 and ee >= a + 17 else None))
                boxes.append(Box(ss, ee, y0, y1, 32, 40, "x", tone_of(7, variant), 1))
                boxes.append(Box(ss, ee, y0, y1, 40, 44, "x", tone_of(8, variant), 0))
        else:
            split = None
            if variant == 1:
                split = a + 14
            parts = [(s, e)] if not (split and s < split < e) else [(s, split), (split, e)]
            for (ss, ee) in parts:
                dec = None
                if variant == 2 and ss <= a + 12 and ee >= a + 16:
                    dec = [("crack", [(int(a + 14), 25), (int(a + 14), 24), (int(a + 15), 23), (int(a + 15), 22), (int(a + 16), 21)])]
                boxes.append(Box(ss, ee, y0, y1, 24, 28, "x", tone_of(9, k % 2, variant), (int(ss) + variant) % 2, decal=dec))
    if near:
        boxes += underside(a_min, a_max)
    return boxes


def underside(a_min, a_max):
    """the string course and the stepped corbels that carry the overhang (seen from the camera on the near side only)"""
    boxes = [Box(a_min, a_max, WALL_FACE, WALL_FACE + 2.5, -18, -4, "x", 0, 0, col=(SHADOW, SHADOW, SHADOW))]
    k0 = int(a_min // P) - 1
    k1 = int(a_max // P) + 1
    for k in range(k0, k1 + 1):
        a = P * k
        for (s, e) in ((a - 8, a + 8), (a + 8, a + 24)):
            s, e = max(s, a_min), min(e, a_max)
            if e > s:
                boxes.append(Box(s, e, 0, W, -4, 0, "x", 2, 0))
        for ca in (a, a + 16):          # a corbel under each merlon and one under each crenel, 8 wide
            s, e = max(ca - 4, a_min), min(ca + 4, a_max)
            if e <= s:
                continue
            for j, (zz1, p) in enumerate(((-4, 6), (-9, 4), (-14, 2))):
                boxes.append(Box(s, e, WALL_FACE, WALL_FACE + p, zz1 - 5, zz1, "x", 2, 0))
    return boxes


def block_boxes(bx0, bx1, by0, by1, outx, outy, near):
    """a corner's 16 x 16 block: the courses stacked as single stones, its capstone, and (near) a slab and stepped corbels.
    outx, outy: +1 or -1, the way the block lies from the vertex (the way it leans out over the wall's face)."""
    bs = []
    for c, (z0, z1) in enumerate(((0, 8), (8, 16), (16, 24), (24, 32), (32, 40))):
        bs.append(Box(bx0, bx1, by0, by1, z0, z1, "x", tone_of(20, c), 1 if c == 4 else 0, jl=False))
    bs.append(Box(bx0, bx1, by0, by1, 40, 44, "x", tone_of(21), 1, jl=False))
    if near:
        bs.append(Box(bx0, bx1, by0, by1, -4, 0, "x", tone_of(22), 0, jl=False))
        for j, (zz1, p) in enumerate(((-4, 6), (-8, 4), (-12, 2))):
            # shrunk on its outer sides to the stage's reach: face (8) + p beyond the vertex lines
            x0, x1 = (0, WALL_FACE + p) if outx > 0 else (-(WALL_FACE + p), 0)
            y0, y1 = (0, WALL_FACE + p) if outy > 0 else (-(WALL_FACE + p), 0)
            bs.append(Box(x0, x1, y0, y1, zz1 - 4, zz1, "x", tone_of(23, j), 0, jl=False))
    return bs
