"""Pieces: each one a window onto a scene of stone, cut so that the pieces of a run tile the plane exactly (no overlap, no gap)."""
import numpy as np
from core import Box, render
import geom
from geom import P, W

CW, CH = 220, 170          # a render canvas; the world origin (the vertex) sits at (AX, AY)
AX, AY = 110, 100


class Piece:
    def __init__(self, name, img, dep, anchor, note=""):
        self.name, self.img, self.dep, self.anchor, self.note = name, img, dep, anchor, note


def both(boxes, swap):
    return [b.swapped() for b in boxes] if swap else boxes


def rend(boxes, window):
    img, dep, _ = render(boxes, AX, AY, CW, CH, window)
    return img, dep


def straight(edge, side, variant=0, kind="plain", clip=None):
    """a straight segment: edge 'n' or 'w', side -1 (far) or +1 (near), the run's part a in [0, 32), optionally only its
    late half [16, 32) or early half [0, 16) where an inner corner's block takes the rest"""
    swap = edge == "w"
    lo, hi = {None: (0, 32), "late": (16, 32), "early": (0, 16)}[clip]
    boxes = both(geom.strip(side, -16, 48, variant, kind), swap)
    if swap:
        window = lambda X, Y: (Y >= lo) & (Y < hi)
    else:
        window = lambda X, Y: (X >= lo) & (X < hi)
    return rend(boxes, window)


def arms(spec, start=0):
    """spec: list of (d, side): the arms present at a vertex, each a strip leaving it (free at `start` from the vertex).
    Returns the scene's boxes in world coordinates."""
    out = []
    for d, side in spec:
        if d == "E":
            out += geom.strip(side, start, 48)
        elif d == "W":
            out += geom.strip(side, -48, -start)
        elif d == "S":
            out += [b.swapped() for b in geom.strip(side, start, 48)]
        elif d == "N":
            out += [b.swapped() for b in geom.strip(side, -48, -start)]
    return out


def corner(spec, quad, near, inner=False):
    """a vertex piece: the corner block in quadrant quad (qx, qy signs) plus the arms (for occlusion); only the block's own
    surfaces (and, at an inner corner, what the arms hold inside it) are drawn: the window is the block's square"""
    qx, qy = quad
    bx0, bx1 = (0, W) if qx > 0 else (-W, 0)
    by0, by1 = (0, W) if qy > 0 else (-W, 0)
    boxes = arms(spec, 16 if inner else 0) + geom.block_boxes(bx0, bx1, by0, by1, qx, qy, near)
    E = 1e-6
    window = lambda X, Y: (X >= bx0 - E) & (X <= bx1 + E) & (Y >= by0 - E) & (Y <= by1 + E)
    return rend(boxes, window)


def end(d, side):
    """a run's free end: the merlon's missing half beyond the vertex, 8 along the run's own line"""
    if d == "E":      # the run goes east from this vertex; the half beyond it is x in [-8, 0)
        boxes = geom.strip(side, -8, 48)
        window = lambda X, Y: (X >= -8 - 1e-6) & (X <= 1e-6)
    elif d == "W":
        boxes = geom.strip(side, -48, 8)
        window = lambda X, Y: (X >= -1e-6) & (X <= 8 + 1e-6)
    elif d == "S":
        boxes = [b.swapped() for b in geom.strip(side, -8, 48)]
        window = lambda X, Y: (Y >= -8 - 1e-6) & (Y <= 1e-6)
    else:
        boxes = [b.swapped() for b in geom.strip(side, -48, 8)]
        window = lambda X, Y: (Y >= -1e-6) & (Y <= 8 + 1e-6)
    return rend(boxes, window)


def bbox(img):
    a = img[..., 3] > 0
    ys = np.where(a.any(1))[0]
    xs = np.where(a.any(0))[0]
    return xs.min(), ys.min(), xs.max() + 1, ys.max() + 1


def crop_group(items):
    """items: dict name -> (img, dep); crop all to the union bbox so a group shares one size and one anchor"""
    bbs = [bbox(i) for i, _ in items.values()]
    x0 = min(b[0] for b in bbs)
    y0 = min(b[1] for b in bbs)
    x1 = max(b[2] for b in bbs)
    y1 = max(b[3] for b in bbs)
    out = {}
    for k, (i, d) in items.items():
        out[k] = Piece(k, i[y0:y1, x0:x1].copy(), d[y0:y1, x0:x1].copy(), (AX - x0, AY - y0))
    return out
