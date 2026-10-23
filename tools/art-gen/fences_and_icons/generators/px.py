"""Small pixel toolkit for the item art: an RGBA canvas, masks, the top-left light rule, the
#2b2522 outline, ASCII grids, and the icon / portrait canvases."""
import numpy as np
from PIL import Image

OUTLINE = "#2b2522"


def hx(s):
    s = s.lstrip("#"); return np.array([int(s[i:i + 2], 16) for i in (0, 2, 4)], np.uint8)


class Canvas:
    def __init__(self, w, h):
        self.w, self.h = w, h
        self.col = np.zeros((h, w, 3), np.uint8); self.a = np.zeros((h, w), bool)

    def paint(self, m, c):
        m = m & np.ones((self.h, self.w), bool)
        self.col[m] = hx(c); self.a[m] = True

    def erase(self, m): self.a[m] = False

    def px(self, x, y, c):
        if 0 <= x < self.w and 0 <= y < self.h: self.col[y, x] = hx(c); self.a[y, x] = True

    def outline(self, m=None, c=OUTLINE):
        """a ring round the mask (default: everything painted) on empty pixels"""
        m = self.a.copy() if m is None else m
        p = np.pad(m, 1)
        ring = (p[:-2, 1:-1] | p[2:, 1:-1] | p[1:-1, :-2] | p[1:-1, 2:]) & ~self.a
        self.paint(ring, c)
        return ring

    def inner_edge(self, m, c=OUTLINE):
        """the mask's own edge pixels, where it meets painted pixels outside it"""
        pa = np.pad(self.a & ~m, 1)
        other = pa[:-2, 1:-1] | pa[2:, 1:-1] | pa[1:-1, :-2] | pa[1:-1, 2:]
        self.paint(m & other, c)

    def grid(self, rows, pal, ox=0, oy=0):
        for y, r in enumerate(rows):
            for x, ch in enumerate(r):
                if ch != ".": self.px(ox + x, oy + y, pal[ch])

    def image(self, crop=True):
        rgba = np.zeros((self.h, self.w, 4), np.uint8)
        rgba[..., :3] = self.col; rgba[..., 3] = self.a * 255
        im = Image.fromarray(rgba, "RGBA")
        if crop:
            ys = np.where(self.a.any(1))[0]; xs = np.where(self.a.any(0))[0]
            box = (xs.min(), ys.min(), xs.max() + 1, ys.max() + 1)
            return im.crop(box), (int(xs.min()), int(ys.min()))
        return im, (0, 0)


def mgrid(w, h):
    yy, xx = np.mgrid[0:h, 0:w]; return xx + 0.5, yy + 0.5


def ellipse(w, h, cx, cy, rx, ry):
    x, y = mgrid(w, h); return ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1


def rect(w, h, x0, y0, x1, y1):
    m = np.zeros((h, w), bool); m[max(0, y0):y1, max(0, x0):x1] = True; return m


def rrect(w, h, x0, y0, x1, y1, r):
    m = rect(w, h, x0, y0, x1, y1)
    for cx, cy in ((x0 + r, y0 + r), (x1 - r, y0 + r), (x0 + r, y1 - r), (x1 - r, y1 - r)):
        corner = rect(w, h, min(x0, cx), min(y0, cy), max(x1, cx), max(y1, cy))
    x, y = mgrid(w, h)
    out = m.copy()
    for cx, cy, sx, sy in ((x0 + r, y0 + r, -1, -1), (x1 - r, y0 + r, 1, -1), (x0 + r, y1 - r, -1, 1), (x1 - r, y1 - r, 1, 1)):
        q = m & ((x - cx) * sx > 0) & ((y - cy) * sy > 0)
        out &= ~(q & ((x - cx) ** 2 + (y - cy) ** 2 > r * r))
    return out


def shift(m, dx, dy):
    out = np.zeros_like(m)
    h, w = m.shape
    ys, xs = np.where(m)
    ys2, xs2 = ys + dy, xs + dx
    ok = (ys2 >= 0) & (ys2 < h) & (xs2 >= 0) & (xs2 < w)
    out[ys2[ok], xs2[ok]] = True
    return out


def lit_band(m, depth=1, dx=-1, dy=-1):
    """pixels of m within `depth` of its edge toward (dx, dy): the lit rim (top-left) or the dark rim (bottom-right)"""
    out = np.zeros_like(m)
    for d in range(1, depth + 1):
        out |= m & ~shift(m, -dx * d, -dy * d)
    return out


def shade(c, m, light, base, dark, lit=1, dk=1):
    c.paint(m, base)
    if lit: c.paint(lit_band(m, lit, -1, -1), light)
    if dk: c.paint(lit_band(m, dk, 1, 1), dark)


def hashn(x, y, s=0):
    v = (x * 73856093) ^ (y * 19349663) ^ (s * 83492791)
    v = (v ^ (v >> 13)) * 1274126177
    return (v ^ (v >> 16)) & 0xFFFF


def on_canvas(im, w, h, dx=0, dy=0):
    """the image centred unscaled on a w x h transparent canvas (the icon rule)"""
    out = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    out.alpha_composite(im, ((w - im.width) // 2 + dx, (h - im.height) // 2 + dy))
    return out


def check_hard(im):
    a = np.array(im)[..., 3]; return set(np.unique(a).tolist()) <= {0, 255}
