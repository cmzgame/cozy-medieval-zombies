"""Tiny isometric 3D pixel renderer for 2:1 iso sprites.

World units: X and Y run along the ground grid, 1 unit = 1 screen pixel horizontally,
a tile is 32 x 32 units. Z is height in screen pixels.
    screen x = X - Y,   screen y = (X + Y) / 2 - Z
So tile (0,0) has its top vertex at (0,0), right vertex (32,16), bottom (0,32), left (-32,16).
+X runs to the screen's lower right, +Y to the lower left. Light is from the top left, so
+Y-facing faces ("left" faces) are lit, +X-facing faces ("right" faces) are in shade, tops are
lightest. Depth toward the camera is X + Y + Z.

Faces are planar polygons with a parametrisation O + s*A + t*B; shaders get the world
position P of every pixel, so textures (bricks, planks) are continuous across faces.
"""
import numpy as np
from PIL import Image, ImageDraw


def hx(s):
    s = s.lstrip("#"); return np.array([int(s[i:i + 2], 16) for i in (0, 2, 4)], np.uint8)


def proj(P):
    P = np.asarray(P, float)
    return np.stack([P[..., 0] - P[..., 1], (P[..., 0] + P[..., 1]) / 2 - P[..., 2]], -1)


def hsh(*a):
    """Deterministic integer hash, vectorised."""
    h = np.int64(2166136261)
    out = None
    for i, v in enumerate(a):
        v = np.asarray(v).astype(np.int64)
        out = (v * (73856093 + 19349663 * i)) if out is None else (out ^ (v * (83492791 + 2654435761 * i)))
    return (out ^ (out >> 13)) & 0xFFFF


class Scene:
    def __init__(self):
        self.faces = []          # (pts3d, O, A, B, shader, bias, tag)

    def face(self, pts, shader, O=None, A=None, B=None, bias=0.0, tag=0):
        pts = [np.array(p, float) for p in pts]
        O = pts[0] if O is None else np.array(O, float)
        A = (pts[1] - pts[0]) if A is None else np.array(A, float)
        B = (pts[-1] - pts[0]) if B is None else np.array(B, float)
        self.faces.append((pts, O, A, B, shader, bias, tag))

    def box(self, x0, y0, z0, x1, y1, z1, top=None, left=None, right=None, bias=0.0, tag=0):
        """Axis-aligned box; only the three camera-facing faces are added.
        left = the +Y face (lit), right = the +X face (shade)."""
        if top is not None:
            self.face([(x0, y0, z1), (x1, y0, z1), (x1, y1, z1), (x0, y1, z1)], top, bias=bias, tag=tag)
        if left is not None and z1 > z0:
            self.face([(x0, y1, z0), (x1, y1, z0), (x1, y1, z1), (x0, y1, z1)], left, bias=bias, tag=tag)
        if right is not None and z1 > z0:
            self.face([(x1, y0, z0), (x1, y1, z0), (x1, y1, z1), (x1, y0, z1)], right, bias=bias, tag=tag)

    def obox(self, O, A, B, C, shade_fn, bias=0.0, tag=0):
        """Oriented box from corner O with edge vectors A, B, C. shade_fn(normal) -> shader.
        Only faces whose outward normal points at the camera are added."""
        O, A, B, C = (np.array(v, float) for v in (O, A, B, C))
        cen = O + (A + B + C) / 2
        for (o, a, b) in ((O, A, B), (O + C, A, B), (O, A, C), (O + B, A, C), (O, B, C), (O + A, B, C)):
            n = np.cross(a, b)
            mid = o + (a + b) / 2
            if np.dot(n, mid - cen) < 0: n = -n
            if np.dot(n, (1, 1, 1)) <= 1e-6: continue
            self.face([o, o + a, o + a + b, o + b], shade_fn(n / np.linalg.norm(n)), O=o, A=a, B=b, bias=bias, tag=tag)

    def render(self, origin_world=(0, 0, 0), margin=2):
        allp = proj(np.concatenate([np.array(f[0]) for f in self.faces]))
        mn = np.floor(allp.min(0)) - margin; mx = np.ceil(allp.max(0)) + margin
        W, H = int(mx[0] - mn[0]), int(mx[1] - mn[1])
        col = np.zeros((H, W, 3), np.uint8); z = np.full((H, W), -1e9); tag = np.full((H, W), -1, int)
        for pts, O, A, B, shader, bias, tg in self.faces:
            sp = proj(np.array(pts)) - mn
            im = Image.new("1", (W, H), 0); ImageDraw.Draw(im).polygon([tuple(p) for p in sp], fill=1)
            m = np.array(im, bool)
            if not m.any(): continue
            ys, xs = np.nonzero(m)
            so = proj(O) - mn; sa = proj(A + 0 * O) - proj(0 * O); sb = proj(B) - proj(0 * B)
            M = np.array([[sa[0], sb[0]], [sa[1], sb[1]]])
            if abs(np.linalg.det(M)) < 1e-9: continue
            Mi = np.linalg.inv(M)
            d = np.stack([xs + 0.5 - so[0], ys + 0.5 - so[1]])
            st = Mi @ d
            s, t = np.clip(st[0], -0.02, 1.02), np.clip(st[1], -0.02, 1.02)
            # recover P on the plane; depth from the unclipped param (exact plane depth)
            P = O[None] + st[0][:, None] * A[None] + st[1][:, None] * B[None]
            dep = P.sum(1) + bias
            better = dep > z[ys, xs]
            if not better.any(): continue
            ys, xs, P, s, t, dep = ys[better], xs[better], P[better], s[better], t[better], dep[better]
            c = shader(P, s, t)
            col[ys, xs] = c; z[ys, xs] = dep; tag[ys, xs] = tg
        alpha = z > -1e8
        anchor = (-mn).astype(int) + np.array([0, 0])  # pixel position of world origin (before crop)
        o = proj(np.array(origin_world, float)) - mn
        return Sprite(col, alpha, tag, o)


class Sprite:
    def __init__(self, col, alpha, tag, anchor):
        self.col, self.alpha, self.tag = col, alpha, tag
        self.anchor = np.array(anchor, float)     # float pixel position of the world origin

    def outline(self, color, inner=False):
        a = self.alpha
        p = np.pad(a, 1)
        ring = (p[:-2, 1:-1] | p[2:, 1:-1] | p[1:-1, :-2] | p[1:-1, 2:]) & ~a
        self.col[ring] = color; self.alpha = a | ring
        return self

    def image(self):
        a = self.alpha
        ys = np.where(a.any(1))[0]; xs = np.where(a.any(0))[0]
        y0, y1, x0, x1 = ys.min(), ys.max() + 1, xs.min(), xs.max() + 1
        rgba = np.zeros((y1 - y0, x1 - x0, 4), np.uint8)
        rgba[..., :3] = self.col[y0:y1, x0:x1]; rgba[..., 3] = a[y0:y1, x0:x1] * 255
        anchor = self.anchor - np.array([x0, y0])
        return Image.fromarray(rgba, "RGBA"), (round(float(anchor[0]), 1), round(float(anchor[1]), 1))


# ------------------------------------------------------------------ shader helpers
def flat(c):
    c = hx(c) if isinstance(c, str) else np.asarray(c, np.uint8)
    return lambda P, s, t: np.broadcast_to(c, (len(P), 3)).copy()


def pick(cols, idx):
    cols = np.stack([hx(c) if isinstance(c, str) else np.asarray(c, np.uint8) for c in cols])
    return cols[np.asarray(idx) % len(cols)]
