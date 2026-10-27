"""Art round 6: the fires. The Fireplace (two tiles against a flat wall), the Fire pit (2 by 2 on the
floor, a ring of squared stones with an iron rack and two hung pots), and the Campfire (1 by 1, a
ring of fieldstones round a teepee of split logs), each with three unlit flame frames, and the
Campfire item's bag icon and held picture. One family: one stone ramp, one bark, one iron, one
flame-drawing routine.

Written fresh for this round (2026-10-27) after reading round 5's props generator
(tools/art-gen/round5/props/gen.py) and its README for the method; nothing is imported from it.

World units: X and Y along the ground (a tile is 32 x 32), Z height in screen pixels.
    screen x = X - Y,   screen y = (X + Y) / 2 - Z,   depth toward the camera = X + Y + Z
+X runs to the screen's lower right (shade), +Y to the lower left (lit), tops lightest.
World (0, 0, 0) is the top vertex of the footprint's top tile at ground level: every anchor here
(anchorVertex "top").

Run with plain `python gen.py`: it writes out/, manifest.json, preview.png. No randomness: every
variation is a hash of integer coordinates.
"""
import json, math, os, sys
import numpy as np
from PIL import Image, ImageDraw

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "out")
REPO = "C:/Users/micha/Dev/cozy-medieval-zombies/.claude/worktrees/79-sweep-3e-23fa08"   # read only
os.makedirs(OUT, exist_ok=True)


def hx(s):
    s = s.lstrip("#")
    return np.array([int(s[i:i + 2], 16) for i in (0, 2, 4)], np.uint8)


OUTLINE = "#2b2522"


def P2S(P):
    P = np.asarray(P, float)
    return np.stack([P[..., 0] - P[..., 1], (P[..., 0] + P[..., 1]) / 2 - P[..., 2]], -1)


def noise(*v):
    """a deterministic hash of integer arrays, 0..65535"""
    h = np.full(np.broadcast(*[np.asarray(a) for a in v]).shape, 0x2545F491, np.int64)
    for i, a in enumerate(v):
        a = np.asarray(a).astype(np.int64)
        h = (h ^ (a * (0x6C8E9CF5 + 2 * i) + 0x1B873593 * (i + 1))) & 0xFFFFFFFF
        h = (h * 0x5BD1E995) & 0xFFFFFFFF
        h ^= h >> 13
        h = (h * 0x27D4EB2F) & 0xFFFFFFFF
        h ^= h >> 16
    return h & 0xFFFF


def solid(c):
    col = hx(c)
    return lambda P: np.broadcast_to(col, (len(P), 3)).copy()


# ======================================================================== the palettes
# one stone for the family, warm grey, from the drawn rocks (data/art/ground/rock_*.png:
# #cfc6b6 #b0a697 #8e857a #6c645c) with a step between each for the faces
ST = {"glint": "#cfc6b6", "top": "#b0a697", "top2": "#a69c8d", "lit": "#9a9184", "lit2": "#91887b",
      "shade": "#7f776c", "shade2": "#776f64", "dark": "#665e55", "deep": "#544d46", "mortar": "#463f3a"}
# the inside of a firebox, sooted
SOOT = {"a": "#3e3733", "b": "#35302c", "c": "#2d2825", "mortar": "#24201e", "lit": "#4a423d"}
ASH = ("#6a625b", "#58504a", "#463f3a", "#352f2b")
COAL = ("#2a2421", "#3b322c", "#4a4039")
# furniture wood (docs/art/06)
WOOD = {"top": ("#7d5a3c", "#77553a"), "west": ("#6a4a30", "#644529"), "east": ("#4f3622", "#4a321f")}
WGRAIN = {"top": "#6c4b30", "west": "#5a3d25", "east": "#432d1b"}
BARK = ("#6e5a48", "#5c4a3a", "#4a3a2d", "#3a2d22")
SPLIT = ("#c8a26c", "#a8834f", "#86643a")          # the pale inside of a split log
ENDGRAIN = ("#c8a26c", "#a07c4e", "#7a5c38")
# black iron, a little cool (the chest's and the cauldron's)
IRON = {"glint": "#8a8c96", "hi": "#6a6872", "top": "#5a5862", "west": "#4a4952", "east": "#36353d",
        "dark": "#2b2a32", "deep": "#222127"}
FLAME = {"edge": "#6e1e10", "red": "#b8401c", "orange": "#e07a26", "yellow": "#f2b33e", "core": "#f8dc7a"}  # fire_0's
CANDLE = ("#efe4c8", "#d6c8a4", "#b0a07c")
TERRA = ("#c27a52", "#a8603e", "#8a4c30", "#6a3824")
PEWTER = ("#c6cad2", "#9ea2ac", "#6e7280")
LADLE = ("#c8a470", "#a8784a", "#73502e")


def tones(keys):
    return np.stack([hx(ST[k]) for k in keys])


# ======================================================================== the renderer
class World:
    """faces in world units, z-buffered, each shaded per pixel by a function of its world points"""

    def __init__(self):
        self.faces = []

    def face(self, pts, shade, bias=0.0, O=None, A=None, B=None, tag=None):
        pts = np.array(pts, float)
        O = pts[0] if O is None else np.array(O, float)
        A = pts[1] - pts[0] if A is None else np.array(A, float)
        B = pts[-1] - pts[0] if B is None else np.array(B, float)
        self.faces.append((pts, O, A, B, shade, bias, tag))

    def block(self, x0, y0, z0, x1, y1, z1, top=None, west=None, east=None, bias=0.0, tag=None):
        """the three faces a camera sees of a box: the top, the +Y face (lit, `west` of the picture)
        and the +X face (shade, `east`)"""
        if top:
            self.face([(x0, y0, z1), (x1, y0, z1), (x1, y1, z1), (x0, y1, z1)], top, bias, tag=tag)
        if west:
            self.face([(x0, y1, z0), (x1, y1, z0), (x1, y1, z1), (x0, y1, z1)], west, bias, tag=tag)
        if east:
            self.face([(x1, y0, z0), (x1, y1, z0), (x1, y1, z1), (x1, y0, z1)], east, bias, tag=tag)

    def draw(self, pad=4):
        allp = P2S(np.concatenate([f[0] for f in self.faces]))
        lo = np.floor(allp.min(0)) - pad
        hi = np.ceil(allp.max(0)) + pad
        W, H = int(hi[0] - lo[0]), int(hi[1] - lo[1])
        col = np.zeros((H, W, 3), np.uint8)
        zb = np.full((H, W), -1e9)
        tags = np.zeros((H, W), object)
        for pts, O, A, B, shade, bias, tag in self.faces:
            sp = P2S(pts) - lo
            m = Image.new("1", (W, H), 0)
            ImageDraw.Draw(m).polygon([tuple(p) for p in sp], fill=1)
            ys, xs = np.nonzero(np.array(m, bool))
            if not len(xs):
                continue
            a2, b2 = P2S(A), P2S(B)
            M = np.array([[a2[0], b2[0]], [a2[1], b2[1]]])
            if abs(np.linalg.det(M)) < 1e-6:
                continue
            o2 = P2S(O) - lo
            st = np.linalg.solve(M, np.stack([xs + 0.5 - o2[0], ys + 0.5 - o2[1]]))
            P = O[None] + st[0][:, None] * A[None] + st[1][:, None] * B[None]
            P = np.clip(P, pts.min(0) - 0.5, pts.max(0) + 0.5)
            d = P.sum(1) + bias
            ok = d > zb[ys, xs]
            if not ok.any():
                continue
            ys, xs, P, d = ys[ok], xs[ok], P[ok], d[ok]
            col[ys, xs] = shade(P)
            zb[ys, xs] = d
            tags[ys, xs] = tag
        return Pic(col, zb > -1e8, -lo, zb, tags)


class Pic:
    def __init__(self, col, alpha, origin, zb=None, tags=None):
        self.col, self.alpha, self.origin, self.zb, self.tags = col, alpha, np.array(origin, float), zb, tags

    def contour(self, step=3.5, skip=()):
        """a darker line on the far side of every step in depth: where a pixel's neighbour stands well
        in front of it, the pixel takes its own colour pulled toward the outline (the furniture's
        chunky inner edges, docs/art/01 rule 3: a darkest-of-its-own-colour edge)"""
        a, z = self.alpha, self.zb
        far = np.zeros_like(a)
        for dy, dx in ((0, 1), (0, -1), (1, 0), (-1, 0)):
            zn = np.roll(np.roll(z, dy, 0), dx, 1)
            an = np.roll(np.roll(a, dy, 0), dx, 1)
            far |= a & an & (zn > z + step)
        for t in skip:
            far &= self.tags != t
        o = hx(OUTLINE).astype(float)
        self.col[far] = (self.col[far].astype(float) * 0.55 + o * 0.45).astype(np.uint8)
        return self

    def ring(self):
        p = np.pad(self.alpha, 1)
        return (p[:-2, 1:-1] | p[2:, 1:-1] | p[1:-1, :-2] | p[1:-1, 2:]) & ~self.alpha

    def outline(self, c=OUTLINE):
        r = self.ring()
        self.col[r] = hx(c)
        self.alpha = self.alpha | r
        return self

    def box(self):
        a = self.alpha
        ys = np.where(a.any(1))[0]
        xs = np.where(a.any(0))[0]
        return ys.min(), ys.max() + 1, xs.min(), xs.max() + 1

    def image(self, crop=None):
        y0, y1, x0, x1 = crop or self.box()
        rgba = np.zeros((y1 - y0, x1 - x0, 4), np.uint8)
        rgba[..., :3] = self.col[y0:y1, x0:x1]
        rgba[..., 3] = self.alpha[y0:y1, x0:x1] * 255
        anc = self.origin - (x0, y0)
        return Image.fromarray(rgba, "RGBA"), [int(round(anc[0])), int(round(anc[1]))]


def light_band(ang, cuts=(0.5, 0.0, -0.55)):
    """0 (lit) .. 3 (darkest) for an upright surface whose ground normal has angle `ang`: a +Y normal
    is lit, a +X normal in shade"""
    f = (np.sin(ang) - np.cos(ang)) / math.sqrt(2)
    return np.where(f > cuts[0], 0, np.where(f > cuts[1], 1, np.where(f > cuts[2], 2, 3)))


def turned(W, cx, cy, prof, shade, n=48, bias=0.0, inside=False, tag=None):
    """a surface of revolution round a vertical axis at (cx, cy), prof [(z, r), ...] upward"""
    for (z0, r0), (z1, r1) in zip(prof, prof[1:]):
        if z1 <= z0:
            continue
        for i in range(n):
            a0, a1 = 2 * math.pi * i / n, 2 * math.pi * (i + 1) / n
            am = (a0 + a1) / 2
            facing = math.cos(am) + math.sin(am)
            if (not inside and facing < -0.45) or (inside and facing > 0.45):
                continue
            c0, s0, c1, s1 = math.cos(a0), math.sin(a0), math.cos(a1), math.sin(a1)
            W.face([(cx + r0 * c0, cy + r0 * s0, z0), (cx + r0 * c1, cy + r0 * s1, z0),
                    (cx + r1 * c1, cy + r1 * s1, z1), (cx + r1 * c0, cy + r1 * s0, z1)], shade, bias,
                   O=(cx + r0 * c0, cy + r0 * s0, z0), A=(r0 * (c1 - c0), r0 * (s1 - s0), 0),
                   B=((r1 - r0) * c0, (r1 - r0) * s0, z1 - z0), tag=tag)


def disc(W, cx, cy, z, r, shade, n=48, bias=0.0, tag=None):
    W.face([(cx + r * math.cos(2 * math.pi * i / n), cy + r * math.sin(2 * math.pi * i / n), z) for i in range(n)],
           shade, bias, O=(cx, cy, z), A=(1, 0, 0), B=(0, 1, 0), tag=tag)


def cylinder_between(W, p0, p1, rad, shade, n=8, bias=0.0, tag=None, cap=None):
    """a round bar from p0 to p1 (any direction), its sides shaded by `shade(P, band)` where band is
    0 lit .. 3 dark by the side's normal against a top-left light"""
    p0, p1 = np.array(p0, float), np.array(p1, float)
    ax = p1 - p0
    L = np.linalg.norm(ax)
    ax /= L
    up = np.array([0, 0, 1.0]) if abs(ax[2]) < 0.9 else np.array([1.0, 0, 0])
    u = np.cross(ax, up)
    u /= np.linalg.norm(u)
    v = np.cross(u, ax)
    light = np.array([-0.45, 0.62, 0.85])
    light /= np.linalg.norm(light)
    for i in range(n):
        t0, t1 = 2 * math.pi * i / n, 2 * math.pi * (i + 1) / n
        tm = (t0 + t1) / 2
        nrm = math.cos(tm) * u + math.sin(tm) * v
        d = float(nrm @ light)
        band = 0 if d > 0.55 else 1 if d > 0.05 else 2 if d > -0.45 else 3
        e0 = rad * (math.cos(t0) * u + math.sin(t0) * v)
        e1 = rad * (math.cos(t1) * u + math.sin(t1) * v)
        W.face([p0 + e0, p1 + e0, p1 + e1, p0 + e1], (lambda P, band=band: shade(P, band)), bias, tag=tag)
    if cap is not None:
        for end, sgn in ((p1, 1), (p0, -1)):
            if sgn * (ax @ np.array([1, 1, 1.0])) > 0:
                W.face([end + rad * (math.cos(2 * math.pi * i / n) * u + math.sin(2 * math.pi * i / n) * v) for i in range(n)],
                       cap, bias + 0.05, O=end, A=u, B=v, tag=tag)


# ======================================================================== stone textures
def coursed(u, v, ch, lmin, lmax, seed, voff=0.0):
    """coursed stonework on a face: u along the face, v up it. Returns the course, the stone's id, the
    position within the stone from its left (uin) and its length, and from its bottom (vin)"""
    row = np.floor((v - voff) / ch).astype(int)
    vin = (v - voff) - row * ch
    L = lmin + noise(row, seed) % (lmax - lmin + 1)
    off = noise(row, seed, 7) % L
    idx = np.floor((u + off) / L).astype(int)
    uin = (u + off) - idx * L
    sid = noise(row, idx, seed, 3)
    return row, sid, uin, L, vin


def stone_shader(face, uf, vf, ch=6.0, lmin=7, lmax=12, seed=0, voff=0.0, soot=None):
    """fitted stone on a face. `face` is "top", "lit" (+Y), or "shade" (+X); uf, vf map world points to
    the face's along and up coordinates. Each stone: one of two tones of its face, a lighter top row and a
    darker bottom row (chunky, lit from above), a mortar line under and to the left of it, a fleck or two"""
    base = {"top": ("top", "top2", "glint", "lit"), "lit": ("lit", "lit2", "top2", "shade"),
            "shade": ("shade", "shade2", "lit2", "dark")}[face]
    T = tones(base)
    mortar = hx(ST["mortar"] if face != "top" else ST["dark"])

    def sh(P):
        u, v = uf(P), vf(P)
        row, sid, uin, L, vin = coursed(u, v, ch, lmin, lmax, seed, voff)
        k = np.where(sid % 3 == 0, 1, 0)
        out = T[k]
        out[vin >= ch - 1.0] = T[2]
        out[(vin >= 1.0) & (vin < 2.0)] = T[3]
        fl = (noise(np.floor(u), np.floor(v), seed, 11) % 13 == 0) & (vin >= 2.0) & (vin < ch - 1.0) & (uin > 2)
        out[fl] = T[3]
        out[(uin < 1.0) | (vin < 1.0)] = mortar
        # rounded corners: the stone's corner pixels go to the mortar, so the stones read as dressed
        # blocks with soft arrises rather than bricks
        cu = (uin < 1.9) | (uin > L - 0.9)
        cv = (vin < 1.9) | (vin > ch - 0.9)
        out[cu & cv] = mortar
        if soot is not None:
            s = soot(P)
            out[s] = (out[s].astype(int) * 0.62 + hx("#2a2420").astype(int) * 0.38).astype(np.uint8)
        return out
    return sh


def flag_shader(seed=0, cell=7.0, lmin=8, lmax=13, tone="top"):
    """flagstones on a top face, laid in rows along X with joints along Y"""
    return stone_shader(tone, lambda P: P[:, 1], lambda P: P[:, 0], ch=cell, lmin=lmin, lmax=lmax, seed=seed)


def wood_shader(face, across=None, w=5, seed=0):
    t = WOOD[face]
    a, b = hx(t[0]), hx(t[1])
    grn = hx(WGRAIN[face])

    def sh(P):
        n = len(P)
        if across is None:
            out = np.broadcast_to(a, (n, 3)).copy()
        else:
            uu = P[:, across]
            out = np.where((np.floor(uu / w).astype(int) % 2 == 0)[:, None], a, b).astype(np.uint8)
        g = noise(np.floor(P[:, 1]) // 3, np.floor(P[:, 2]), np.floor(P[:, 0]), seed) % 9 == 0
        out[g] = grn
        return out
    return sh


# ======================================================================== logs
def log(W, p0, p1, rad, k, split=False, tag="log", bias=0.0, ends=True):
    """a round log from p0 to p1 (any direction), bark banded by the side's normal, its cut ends pale
    end grain with a dark ring; `split` shows the pale split face on its top"""
    bcol = np.stack([hx(c) for c in BARK])

    def bark(P, band, k=k):
        b = min(band, 3)
        out = np.broadcast_to(bcol[b], (len(P), 3)).copy()
        out[noise(np.floor(P[:, 0] * 1.5), np.floor(P[:, 1] * 1.5), np.floor(P[:, 2] * 1.5), k) % 5 == 0] = bcol[min(b + 1, 3)]
        if split and b == 0:
            out[:] = hx(SPLIT[0])
            out[noise(np.floor(P[:, 0]), np.floor(P[:, 1]), np.floor(P[:, 2]), k, 5) % 11 == 0] = hx(SPLIT[1])
        return out
    p0, p1 = np.array(p0, float), np.array(p1, float)
    cylinder_between(W, p0, p1, rad, bark, n=8, bias=bias, tag=tag, cap=(endgrain_cap(p0, p1, rad) if ends else None))


def endgrain_cap(p0, p1, rad):
    def sh(P):
        # distance from the axis, measured from whichever end the point is nearer
        c = p1 if np.linalg.norm(P.mean(0) - p1) < np.linalg.norm(P.mean(0) - p0) else p0
        d = np.linalg.norm(P - c, axis=1)
        out = np.broadcast_to(hx(ENDGRAIN[0]), (len(P), 3)).copy()
        out[d < rad * 0.45] = hx(ENDGRAIN[1])
        out[d > rad - 0.75] = hx(BARK[2])
        return out
    return sh


# ======================================================================== iron and pots
LIGHT = np.array([-0.45, 0.62, 0.85]) / np.linalg.norm([-0.45, 0.62, 0.85])


def round_iron(cx, cy, prof, ramp=None):
    """iron on a turned surface, banded by its true normal against the light"""
    zs, ns = [], []
    for a, b in zip(prof, prof[1:]):
        if b[0] > a[0]:
            dz, dr = b[0] - a[0], b[1] - a[1]
            l = math.hypot(dz, dr)
            zs.append((a[0] + b[0]) / 2)
            ns.append((dz / l, -dr / l))
    zs, ns = np.array(zs), np.array(ns)
    keys = ramp or ("glint", "hi", "west", "east", "deep")
    T = np.stack([hx(IRON[k]) for k in keys])

    def sh(P):
        ang = np.arctan2(P[:, 1] - cy, P[:, 0] - cx)
        nr = np.interp(P[:, 2], zs, ns[:, 0])
        nz = np.interp(P[:, 2], zs, ns[:, 1])
        n = np.stack([nr * np.cos(ang), nr * np.sin(ang), nz], -1)
        d = n @ LIGHT
        b = np.where(d > 0.9, 0, np.where(d > 0.5, 1, np.where(d > 0.1, 2, np.where(d > -0.3, 3, 4))))
        return T[b]
    return sh


def iron_bar_shader(P, band):
    T = [IRON["hi"], IRON["west"], IRON["east"], IRON["dark"]]
    return np.broadcast_to(hx(T[band]), (len(P), 3)).copy()


def hung_pot(W, cx, cy, zb, h, R, lid=False, tag="pot", bias=0.0, bail_top=None):
    """a black iron pot hung by its bail: a round belly, a rolled rim, two ears; `lid` a domed lid with
    a knob, else the dark mouth with a dull gleam of stew"""
    zr = zb + h
    prof = [(zb, R * 0.45), (zb + h * 0.12, R * 0.8), (zb + h * 0.35, R), (zb + h * 0.65, R * 0.98),
            (zr - 1.2, R * 0.88), (zr - 1.2, R * 0.95), (zr, R * 0.95)]
    turned(W, cx, cy, prof, round_iron(cx, cy, prof), n=40, bias=bias, tag=tag)
    rr = R * 0.95
    if lid:
        lp = [(zr, rr * 0.98), (zr + 1.0, rr * 0.85), (zr + 2.0, rr * 0.5), (zr + 2.4, 0.2)]
        turned(W, cx, cy, lp, round_iron(cx, cy, lp, ("glint", "hi", "top", "east", "dark")), n=32, bias=bias + 0.2, tag=tag)
        disc(W, cx, cy, zr + 2.4, 1.0, solid(IRON["hi"]), n=10, bias=bias + 0.3, tag=tag)
        turned(W, cx, cy, [(zr + 2.2, 0.9), (zr + 3.4, 0.9)], round_iron(cx, cy, [(zr + 2.2, 0.9), (zr + 3.4, 0.9)]), n=10, bias=bias + 0.3, tag=tag)
        disc(W, cx, cy, zr + 3.4, 0.9, solid(IRON["glint"]), n=10, bias=bias + 0.35, tag=tag)
    else:
        ann = []
        n = 40
        for i in range(n):
            a0, a1 = 2 * math.pi * (i - 0.3) / n, 2 * math.pi * (i + 1.3) / n
            W.face([(cx + rr * math.cos(a0), cy + rr * math.sin(a0), zr), (cx + rr * math.cos(a1), cy + rr * math.sin(a1), zr),
                    (cx + (rr - 1.1) * math.cos(a1), cy + (rr - 1.1) * math.sin(a1), zr),
                    (cx + (rr - 1.1) * math.cos(a0), cy + (rr - 1.1) * math.sin(a0), zr)],
                   solid(IRON["hi"]), bias + 0.2, O=(cx, cy, zr), A=(1, 0, 0), B=(0, 1, 0), tag=tag)

        def stew(P):
            out = np.broadcast_to(hx("#4a3a2a"), (len(P), 3)).copy()
            u, v = P[:, 0] - cx, P[:, 1] - cy
            out[(v - u) > rr * 0.5] = hx("#5e4a34")
            out[(u - v) > rr * 0.6] = hx("#3a2d22")
            return out
        disc(W, cx, cy, zr - 1.0, rr - 1.0, stew, n=32, bias=bias - 0.1, tag=tag)
    # the bail: an iron hoop from ear to ear, standing up in the screen's plane, to its top
    bt = bail_top if bail_top is not None else zr + R * 1.1
    d = 1 / math.sqrt(2)
    m = 16
    pts = []
    for i in range(m + 1):
        t = math.pi * i / m
        s = (R + 0.3) * math.cos(t)
        z = zr - 1.0 + (bt - zr + 1.0) * math.sin(t) ** 0.7
        pts.append((cx + s * d, cy - s * d, z))
    for i in range(m):
        p0, p1 = np.array(pts[i]), np.array(pts[i + 1])
        s0 = (p0[0] - p0[1] + p1[0] - p1[1]) / 2 - (cx - cy)
        c = IRON["hi"] if s0 < -1 else IRON["west"] if s0 < 2.5 else IRON["east"]
        W.face([p0 + (0, 0, -0.5), p1 + (0, 0, -0.5), p1 + (0, 0, 0.5), p0 + (0, 0, 0.5)], solid(c), bias + 0.3, tag=tag + "_bail")
    for sgn in (-1, 1):
        ex, ey = cx + sgn * (R + 0.2) * d, cy - sgn * (R + 0.2) * d
        W.block(ex - 0.7, ey - 0.7, zr - 2.2, ex + 0.7, ey + 0.7, zr - 0.6, top=solid(IRON["hi"]),
                west=solid(IRON["west"]), east=solid(IRON["dark"]), bias=bias + 0.4, tag=tag)
    return bt


# ======================================================================== the fireplace
# two tiles along Y, its back to a west wall (X = 0; a wall's near face stands at most 9 out), its
# firebox toward +X. World Y 0..64; the anchor is the first tile's top vertex at ground level.
FP = dict(X0=9.0, X1=27.0, Y0=5.0, Y1=59.0,          # the body
          SX1=31.5, SY0=1.5, SY1=62.5, SZ=3.0,         # the slab it sits on
          OY0=14.0, OY1=50.0, ZS=18.0, ZC=31.0,        # the opening: jambs, the springing, the crown
          RING=6.0,                                    # the arch's voussoirs, deep
          MZ0=41.0, MZ1=46.5, MX1=30.5, MY0=0.5, MY1=63.5,   # the oak mantle
          HX1=21.0, HY0=10.0, HY1=54.0, HZ1=60.0, HTOP=68.0, HXT=12.0,   # the chimney breast
          BACK=13.0)                                   # the firebox's back wall
FP_POT = True        # the crane's pot (False leaves the crane and its empty hook)


def arch_geom():
    c = (FP["OY1"] - FP["OY0"]) / 2
    r = FP["ZC"] - FP["ZS"]
    R = (c * c + r * r) / (2 * r)
    zc = FP["ZC"] - R
    return (FP["OY0"] + FP["OY1"]) / 2, zc, R, math.acos(c / R)


def fireplace():
    W = World()
    X0, X1, Y0, Y1 = FP["X0"], FP["X1"], FP["Y0"], FP["Y1"]
    SZ = FP["SZ"]
    yc, zc, R, phs = arch_geom()
    RO = R + FP["RING"]
    # ---- the slab: one course of big flags, a little proud of the body on every side
    W.block(X0, FP["SY0"], 0, FP["SX1"], FP["SY1"], SZ,
            top=flag_shader(seed=21, cell=7.5, lmin=9, lmax=14),
            west=stone_shader("lit", lambda P: P[:, 0], lambda P: P[:, 2], ch=3.0, lmin=10, lmax=15, seed=22),
            east=stone_shader("shade", lambda P: P[:, 1], lambda P: P[:, 2], ch=3.0, lmin=10, lmax=15, seed=23), tag="slab")
    # ---- the front of the body: coursed stone with the opening cut out
    nseg = 24
    arc = [(yc + R * math.cos(phs + (math.pi - 2 * phs) * i / nseg), zc + R * math.sin(phs + (math.pi - 2 * phs) * i / nseg))
           for i in range(nseg + 1)]
    outline_yz = [(Y0, SZ), (Y0, FP["MZ0"]), (Y1, FP["MZ0"]), (Y1, SZ), (FP["OY1"], SZ)] + arc + [(FP["OY0"], SZ)]

    def soot_front(P):
        y, z = P[:, 1], P[:, 2]
        rho = np.hypot(y - yc, z - zc)
        near = (rho < R + 3.0) & (z > FP["ZS"] - 4) & (np.abs(y - yc) < 13)
        return near & (noise(np.floor(y), np.floor(z), 41) % 3 != 0)

    courses = stone_shader("shade", lambda P: -P[:, 1], lambda P: P[:, 2], ch=7.0, lmin=9, lmax=14, seed=31, voff=SZ)
    nv = 9
    span = math.pi - 2 * phs + 0.16
    T = tones(("shade", "shade2", "lit2", "dark", "lit", "top2"))

    def front(P):
        out = courses(P)
        y, z = P[:, 1], P[:, 2]
        rho = np.hypot(y - yc, z - zc)
        phi = np.arctan2(z - zc, y - yc)
        vz = (rho >= R) & (rho < RO) & (phi > phs - 0.08) & (phi < math.pi - phs + 0.08)
        k = np.clip(np.floor((phi - (phs - 0.08)) / span * nv).astype(int), 0, nv - 1)
        key = k == nv // 2
        o = T[np.where(k % 2 == 0, 0, 1)]
        o[key] = T[4]
        o[(rho >= RO - 1.0)] = T[2]
        o[key & (rho >= RO - 1.0)] = T[5]
        o[(rho < R + 1.2)] = T[3]
        fk = (phi - (phs - 0.08)) / span * nv
        jt = np.abs(fk - np.round(fk)) * span / nv * rho < 0.55
        o[jt] = hx(ST["mortar"])
        out[vz] = o[vz]
        out[(rho >= RO) & (rho < RO + 0.9) & (phi > phs - 0.08) & (phi < math.pi - phs + 0.08)] = hx(ST["mortar"])
        s = soot_front(P)
        out[s] = (out[s].astype(int) * 0.6 + hx("#2a2420").astype(int) * 0.4).astype(np.uint8)
        return out
    W.face([(X1, y, z) for (y, z) in outline_yz], front, tag="front")
    # the voussoirs stand a little proud of the coursed face, their upper edges catching the light
    VX = X1 + 0.9
    ring_pts = [(yc + RO * math.cos(phs - 0.08 + span * i / nseg), zc + RO * math.sin(phs - 0.08 + span * i / nseg)) for i in range(nseg + 1)]
    inner = [(yc + R * math.cos(phs - 0.08 + span * i / nseg), zc + R * math.sin(phs - 0.08 + span * i / nseg)) for i in range(nseg + 1)]
    W.face([(VX, y, z) for (y, z) in ring_pts + inner[::-1]], front, bias=0.1, tag="arch")
    for i in range(nseg):
        (ya, za_), (yb, zb_) = ring_pts[i], ring_pts[i + 1]
        if ((ya + yb) / 2 - yc) + ((za_ + zb_) / 2 - zc) > 0:
            W.face([(X1, ya, za_), (VX, ya, za_), (VX, yb, zb_), (X1, yb, zb_)], solid(ST["top2"]), bias=0.1, tag="arch")
    # the near end (+Y, lit), coursed to match
    W.face([(X0, Y1, SZ), (X1, Y1, SZ), (X1, Y1, FP["MZ0"]), (X0, Y1, FP["MZ0"])],
           stone_shader("lit", lambda P: P[:, 0] + 3, lambda P: P[:, 2], ch=7.0, lmin=9, lmax=14, seed=31, voff=SZ), tag="side")
    # ---- a plinth course at the foot of each jamb, proud of the face
    def plinth_e(P):
        out = stone_shader("shade", lambda P: -P[:, 1], lambda P: P[:, 2], ch=4.0, lmin=7, lmax=10, seed=33, voff=SZ)(P)
        out[P[:, 2] > SZ + 3.0] = hx(ST["lit2"])
        return out

    def plinth_w(P):
        out = stone_shader("lit", lambda P: P[:, 0], lambda P: P[:, 2], ch=4.0, lmin=7, lmax=10, seed=34, voff=SZ)(P)
        out[P[:, 2] > SZ + 3.0] = hx(ST["top2"])
        return out
    for (ya, yb) in ((Y0 - 1.0, FP["OY0"]), (FP["OY1"], Y1 + 1.0)):
        W.block(X0, ya, SZ, X1 + 1.4, yb, SZ + 4.0, top=solid(ST["top"]), west=plinth_w, east=plinth_e, bias=0.05, tag="plinth")
    # ---- the keystone, proud of the face
    ky = 3.2
    ks = [(yc - ky, FP["ZC"] - 0.6), (yc + ky, FP["ZC"] - 0.6), (yc + ky + 1.6, RO + 2.0), (yc - ky - 1.6, RO + 2.0)]
    KX = X1 + 1.5

    def kface(P):
        out = np.broadcast_to(hx(ST["lit2"]), (len(P), 3)).copy()
        out[P[:, 2] > RO + 1.0] = hx(ST["top2"])
        out[P[:, 2] < FP["ZC"] + 0.6] = hx(ST["shade"])
        return out
    W.face([(KX, y, z) for (y, z) in ks], kface, bias=0.2, tag="key")
    W.face([(X1, yc - ky - 1.6, RO + 2.0), (KX, yc - ky - 1.6, RO + 2.0), (KX, yc + ky + 1.6, RO + 2.0), (X1, yc + ky + 1.6, RO + 2.0)],
           solid(ST["glint"]), bias=0.2, tag="key")
    W.face([(X1, yc + ky, FP["ZC"] - 0.6), (KX, yc + ky, FP["ZC"] - 0.6), (KX, yc + ky + 1.6, RO + 2.0), (X1, yc + ky + 1.6, RO + 2.0)],
           solid(ST["top2"]), bias=0.2, tag="key")
    # ---- inside the firebox: the back wall, the inner side, the soffit, the floor, all sooted
    SB = np.stack([hx(SOOT[k]) for k in ("a", "b", "c", "mortar", "lit")])

    def soot_stone(uf, vf, seed):
        def sh(P):
            u, v = uf(P), vf(P)
            row, sid, uin, L, vin = coursed(u, v, 5.0, 6, 10, seed, SZ)
            out = SB[np.where(sid % 3 == 0, 2, 1)]
            out[(vin >= 4.0) & (sid % 2 == 0)] = SB[0]
            out[(uin < 1.0) | (vin < 1.0)] = SB[3]
            return out
        return sh
    BK = FP["BACK"]
    W.face([(BK, FP["OY0"] - 1, SZ), (BK, FP["OY1"] + 1, SZ), (BK, FP["OY1"] + 1, RO + 2), (BK, FP["OY0"] - 1, RO + 2)],
           soot_stone(lambda P: -P[:, 1], lambda P: P[:, 2], 51), bias=-0.5, tag="box")
    W.face([(BK, FP["OY0"], SZ), (X1, FP["OY0"], SZ), (X1, FP["OY0"], FP["ZS"] + 0.2), (BK, FP["OY0"], FP["ZS"] + 0.2)],
           soot_stone(lambda P: P[:, 0], lambda P: P[:, 2], 52), bias=-0.3, tag="box")
    for i in range(nseg):
        (ya, za_), (yb, zb_) = arc[i], arc[i + 1]
        lit_ = (ya - yc) < -4
        W.face([(BK, ya, za_), (X1, ya, za_), (X1, yb, zb_), (BK, yb, zb_)],
               solid(SOOT["b"] if lit_ else SOOT["c"]), bias=-0.3, tag="box")

    def hearth(P):
        out = np.broadcast_to(hx(ASH[2]), (len(P), 3)).copy()
        n = noise(np.floor(P[:, 0]), np.floor(P[:, 1]), 61) % 7
        out[n == 0] = hx(ASH[1])
        out[n == 1] = hx(ASH[3])
        out[P[:, 0] > X1 - 1.0] = hx(ST["dark"])
        return out
    W.face([(BK, FP["OY0"], SZ), (X1, FP["OY0"], SZ), (X1, FP["OY1"], SZ), (BK, FP["OY1"], SZ)], hearth, bias=-0.2, tag="box")
    # ---- the fire laid: two firedogs at the front, two logs across them, one split log atop
    for yd in (yc - 9.0, yc + 9.0):
        W.block(X1 - 3.2, yd - 0.7, SZ, X1 - 1.8, yd + 0.7, SZ + 4.0, top=solid(IRON["hi"]), west=solid(IRON["west"]),
                east=solid(IRON["dark"]), bias=0.6, tag="dog")
        W.block(BK + 1.0, yd - 0.5, SZ + 1.6, X1 - 3.0, yd + 0.5, SZ + 2.6, top=solid(IRON["west"]), west=solid(IRON["east"]),
                east=solid(IRON["dark"]), bias=0.3, tag="dog")
    log(W, (X1 - 4.5, yc - 15.0, SZ + 4.2), (X1 - 4.5, yc + 14.0, SZ + 4.2), 2.0, 1)
    log(W, (BK + 4.0, yc - 12.0, SZ + 2.2), (BK + 4.0, yc + 12.5, SZ + 2.2), 2.1, 2)
    log(W, (BK + 6.6, yc - 9.0, SZ + 6.6), (BK + 7.4, yc + 10.0, SZ + 6.4), 1.8, 3, split=True)
    # ---- the crane: an iron post at the near side of the firebox, an arm out over the fire, a pot
    cpx, cpy = BK + 2.0, FP["OY1"] - 3.0
    za = FP["ZS"] + 5.0
    W.block(cpx - 0.6, cpy - 0.6, SZ, cpx + 0.6, cpy + 0.6, za + 1.5, top=solid(IRON["hi"]), west=solid(IRON["west"]),
            east=solid(IRON["dark"]), bias=0.2, tag="crane")
    hook = (X1 - 5.0, yc + 7.0)
    cylinder_between(W, (cpx, cpy, za), (hook[0], hook[1], za), 0.6, iron_bar_shader, n=6, bias=0.25, tag="crane")
    cylinder_between(W, (cpx, cpy, za - 3.5), (cpx + (hook[0] - cpx) * 0.45, cpy + (hook[1] - cpy) * 0.45, za), 0.45,
                     iron_bar_shader, n=6, bias=0.25, tag="crane")
    if FP_POT:
        bt = hung_pot(W, hook[0], hook[1], SZ + 9.5, 5.5, 4.4, lid=False, tag="pot", bias=0.3, bail_top=za - 2.0)
        cylinder_between(W, (hook[0], hook[1], bt), (hook[0], hook[1], za), 0.4, iron_bar_shader, n=6, bias=0.35, tag="crane")
    else:
        cylinder_between(W, (hook[0], hook[1], za - 4.0), (hook[0], hook[1], za), 0.4, iron_bar_shader, n=6, bias=0.35, tag="crane")
    # ---- the corbels: two stepped stones under each end of the mantle
    for (ya, yb) in ((Y0, Y0 + 6.5), (Y1 - 6.5, Y1)):
        W.block(X1, ya, FP["MZ0"] - 6.5, X1 + 1.6, yb, FP["MZ0"] - 3.2, top=solid(ST["top"]), west=solid(ST["lit"]),
                east=lambda P: np.where((P[:, 2] < FP["MZ0"] - 5.6)[:, None], hx(ST["dark"]), hx(ST["shade2"])).astype(np.uint8),
                bias=0.1, tag="corbel")
        W.block(X1, ya, FP["MZ0"] - 3.2, X1 + 3.0, yb, FP["MZ0"], top=solid(ST["top"]), west=solid(ST["lit"]),
                east=lambda P: np.where((P[:, 2] < FP["MZ0"] - 2.4)[:, None], hx(ST["dark"]), hx(ST["shade"])).astype(np.uint8),
                bias=0.1, tag="corbel")
    # ---- the mantle: a thick oak beam, proud of the body at the front and both sides
    MZ0, MZ1 = FP["MZ0"], FP["MZ1"]

    def mtop(P):
        out = wood_shader("top", None, seed=71)(P)
        out[P[:, 0] > FP["MX1"] - 1.0] = hx("#93704c")
        return out

    def mfront(P):
        out = wood_shader("east", None, seed=72)(P)
        z = P[:, 2]
        out[z > MZ1 - 1.0] = hx("#6a4a30")
        out[z < MZ0 + 1.0] = hx("#3a2716")
        return out

    def mend(P):
        q = np.hypot(P[:, 0] - (FP["X0"] + FP["MX1"]) / 2, (P[:, 2] - (MZ0 + MZ1) / 2) * 2.2)
        out = np.broadcast_to(hx("#9a7652"), (len(P), 3)).copy()
        out[(q % 4.0) < 1.0] = hx("#7d5a3c")
        out[P[:, 2] > MZ1 - 1.0] = hx("#a8845e")
        return out
    W.block(FP["X0"] - 0.5, FP["MY0"], MZ0, FP["MX1"], FP["MY1"], MZ1, top=mtop, west=mend, east=mfront, bias=0.3, tag="mantle")
    # ---- the chimney breast above it, stepping back to a weathered slope
    HX1, HY0, HY1, HZ1, HT, HXT = FP["HX1"], FP["HY0"], FP["HY1"], FP["HZ1"], FP["HTOP"], FP["HXT"]
    W.face([(HX1, HY0, MZ1), (HX1, HY1, MZ1), (HX1, HY1, HZ1), (HX1, HY0, HZ1)],
           stone_shader("shade", lambda P: -P[:, 1], lambda P: P[:, 2], ch=6.0, lmin=8, lmax=12, seed=81, voff=MZ1), tag="breast")
    W.face([(X0, HY1, MZ1), (HX1, HY1, MZ1), (HX1, HY1, HZ1), (HXT, HY1, HT), (X0, HY1, HT)],
           stone_shader("lit", lambda P: P[:, 0] + 3, lambda P: P[:, 2], ch=6.0, lmin=8, lmax=12, seed=81, voff=MZ1), tag="breast")

    def slope(P):
        out = stone_shader("lit", lambda P: -P[:, 1], lambda P: P[:, 0], ch=4.0, lmin=8, lmax=12, seed=82)(P)
        out[P[:, 2] < HZ1 + 0.9] = hx(ST["top"])
        return out
    W.face([(HX1, HY0, HZ1), (HX1, HY1, HZ1), (HXT, HY1, HT), (HXT, HY0, HT)], slope, tag="breast")
    W.face([(X0, HY0, HT), (HXT, HY0, HT), (HXT, HY1, HT), (X0, HY1, HT)], solid(ST["top"]), tag="breast")
    # ---- on the mantle: a candle on a pewter dish, a clay jug, a little bowl
    mz = MZ1
    disc(W, 27.5, 13.0, mz + 0.6, 2.2, solid(PEWTER[1]), n=16, bias=0.5, tag="thing")
    turned(W, 27.5, 13.0, [(mz, 2.2), (mz + 0.6, 2.2)], lambda P: np.broadcast_to(hx(PEWTER[2]), (len(P), 3)).copy(), n=16, bias=0.5, tag="thing")
    turned(W, 27.5, 13.0, [(mz + 0.5, 1.0), (mz + 5.5, 1.0)],
           lambda P: np.where((P[:, 1] - 13.0 - (P[:, 0] - 27.5) > 0)[:, None], hx(CANDLE[0]), hx(CANDLE[1])).astype(np.uint8),
           n=12, bias=0.6, tag="thing")
    disc(W, 27.5, 13.0, mz + 5.5, 1.0, solid(CANDLE[0]), n=10, bias=0.65, tag="thing")
    jp = [(mz, 1.8), (mz + 1.2, 2.6), (mz + 3.2, 2.7), (mz + 4.8, 2.0), (mz + 5.8, 1.3), (mz + 6.6, 1.5)]
    turned(W, 27.0, 51.0, jp, lambda P: np.stack([hx(c) for c in TERRA])[light_band(np.arctan2(P[:, 1] - 51.0, P[:, 0] - 27.0))],
           n=24, bias=0.5, tag="thing")
    disc(W, 27.0, 51.0, mz + 6.6, 1.2, solid("#3a2418"), n=12, bias=0.55, tag="thing")
    bp = [(mz, 1.6), (mz + 1.4, 2.6)]
    turned(W, 27.5, 42.0, bp, lambda P: np.stack([hx(c) for c in ("#a08a68", "#8a7454", "#6e5c40", "#5a4a34")])[light_band(np.arctan2(P[:, 1] - 42.0, P[:, 0] - 27.5))],
           n=20, bias=0.5, tag="thing")
    disc(W, 27.5, 42.0, mz + 1.4, 2.0, solid("#4a3c2a"), n=16, bias=0.45, tag="thing")
    return W.draw()


# ======================================================================== the flames
# One routine draws every fire's three frames, in fire_0's palette and manner: tongues that swell
# from the foot and taper to a leaning tip, a yellow-white heart at the foot through yellow and orange
# to red at the edges and tips, a dark red edge all round, a spark or two; then each frame is cut by
# the prop's own depth, so it shows only where nothing of the prop stands in front of the fire
# (the cauldron's way, round 5), and the logs' and coals' lit tops glow where no flame covers them.
FLAMES = np.stack([hx(FLAME[k]) for k in ("red", "orange", "yellow", "core")])


def flame_layer(Hc, Wc, foot, tongues, bed, sparks=()):
    """flames on a canvas: `foot(x)` the screen row a flame stands on at column x (a float); `tongues`
    [(x, h, w, lean)], x the column of its foot's middle, h its height, w its width at the foot, lean
    how far its tip swings (+ right); `bed` (x0, x1) the columns of the bed of flame two rows deep.
    Returns the mask and the colours."""
    heat = np.zeros((Hc, Wc))
    for (xc, h, w, lean) in tongues:
        fy = foot(xc)
        for y in range(int(math.floor(fy - h)), int(math.ceil(fy)) + 1):
            f = (fy - (y + 0.5)) / h
            if f < -0.05 or f > 1.0:
                continue
            f = max(f, 0.0)
            cx = xc + lean * h * f ** 1.8 * 0.45
            hw = w / 2 * (1 - f) ** 0.85 * (0.75 + 0.25 * min(1.0, f / 0.3))
            for x in range(int(math.floor(cx - hw - 1)), int(math.ceil(cx + hw + 1)) + 1):
                d = abs(x + 0.5 - cx)
                if d <= hw + 0.3 and 0 <= y < Hc and 0 <= x < Wc and y + 0.5 <= foot(x) + 0.5:
                    v = (1 - f) * (1 - 0.65 * d / max(hw, 0.6))
                    heat[y, x] = max(heat[y, x], v)
        # the tip, a pixel above the tongue, leaning
        tx = int(round(xc + lean * h * 0.45 - 0.5))
        ty = int(round(fy - h - 0.5))
        if 0 <= ty < Hc - 1 and 0 < tx < Wc - 1 and (heat[ty + 1, tx - 1:tx + 2] > 0).any():
            heat[ty, tx] = max(heat[ty, tx], 0.05)
    x0, x1 = bed
    for x in range(x0, x1 + 1):
        fy = int(math.floor(foot(x)))
        for y, v in ((fy, 0.5), (fy - 1, 0.62)):
            if 0 <= y < Hc:
                heat[y, x] = max(heat[y, x], v)
    m = heat > 0
    band = np.where(heat > 0.66, 3, np.where(heat > 0.45, 2, np.where(heat > 0.24, 1, 0)))
    col = FLAMES[band]
    p = np.pad(m, 1)
    ring = (p[:-2, 1:-1] | p[2:, 1:-1] | p[1:-1, :-2] | p[1:-1, 2:]) & ~m
    col[ring] = hx(FLAME["edge"])
    m = m | ring
    for (sx, sy, c) in sparks:
        if 0 <= sy < Hc and 0 <= sx < Wc and not m[sy, sx]:
            m[sy, sx] = True
            col[sy, sx] = hx(FLAME[c])
    return m, col


def cut_and_glow(pic, m, col, depth, k, glow_tags=("log",), coal_tag="coal", seed=0):
    """keep a flame pixel where it stands in front of the prop (its depth on the flame's plane against
    the prop's depth buffer); then light some of the logs' lit tops and the coals where no flame lies"""
    ys, xs = np.nonzero(m)
    keep = depth(xs + 0.5, ys + 0.5) + 0.3 >= pic.zb[ys, xs]
    out = np.zeros_like(m)
    out[ys[keep], xs[keep]] = True
    col = col.copy()
    lit_bark = hx(BARK[0])
    for t in glow_tags:
        ey, ex_ = np.nonzero((pic.tags == t) & ~out)
        if len(ey):
            top = (pic.col[ey, ex_] == lit_bark).all(1)
            sel = top & (noise(ex_, ey, k, seed) % 3 == 0)
            col[ey[sel], ex_[sel]] = np.where((noise(ex_[sel], ey[sel], k + 7, seed) % 3 == 0)[:, None], hx(FLAME["orange"]), hx(FLAME["red"]))
            out[ey[sel], ex_[sel]] = True
    ey, ex_ = np.nonzero((pic.tags == coal_tag) & ~out)
    if len(ey):
        n = noise(ex_, ey, k, seed + 3) % 7
        hot = (pic.col[ey, ex_] == hx(COAL[2])).all(1)
        sel = (n < 3) | hot & (n < 5)
        cc = np.where((n == 0)[:, None], hx(FLAME["yellow"]), np.where((n < 3)[:, None], hx(FLAME["orange"]), hx(FLAME["red"])))
        col[ey[sel], ex_[sel]] = cc[sel]
        out[ey[sel], ex_[sel]] = True
    return out, col


def frames_out(pic, frames, name):
    """the three frames on one shared canvas (the union of their pixels); the pin is its bottom middle,
    fire.at the same pixel in the prop's cropped picture. Call after the prop is outlined."""
    y0, y1, x0, x1 = pic.box()
    um = np.zeros_like(frames[0][0])
    for mm, _ in frames:
        um |= mm
    fy = np.where(um.any(1))[0]
    fx = np.where(um.any(0))[0]
    fy0, fy1, fx0, fx1 = fy.min(), fy.max() + 1, fx.min(), fx.max() + 1
    ims = []
    for k, (mm, cc) in enumerate(frames):
        rgba = np.zeros((fy1 - fy0, fx1 - fx0, 4), np.uint8)
        rgba[..., :3] = cc[fy0:fy1, fx0:fx1]
        rgba[..., 3] = mm[fy0:fy1, fx0:fx1] * 255
        im = Image.fromarray(rgba, "RGBA")
        assert set(np.unique(rgba[..., 3])) <= {0, 255}
        im.save(os.path.join(OUT, f"{name}_fire_{k}.png"))
        ims.append(im)
    fw, fh = int(fx1 - fx0), int(fy1 - fy0)
    pin = [fw // 2, fh - 1]
    at = [int(fx0 - x0 + pin[0]), int(fy0 - y0 + pin[1])]
    return {"size": [fw, fh], "base": pin, "at": at, "images": ims}


def tongues(width, n, hmax, hmin, k, seed, wf=1.7):
    """a fire's tongues for frame k: n across `width` px, tallest in the middle (an envelope), each
    height and lean varied by a hash of the frame, so the three frames differ and loop"""
    out = []
    sp = width / (n - 1)
    for i in range(n):
        t = -1 + 2 * i / (n - 1)
        env = 1 - abs(t) ** 1.7
        v = 0.62 + 0.38 * (int(noise(i, k, seed)) % 100) / 99.0
        h = hmin + (hmax - hmin) * env * v
        lean = ((int(noise(i, k, seed, 1)) % 7) - 3) / 10.0 + (0.12 if t < 0 else -0.12) * 0
        jit = ((int(noise(i, k, seed, 2)) % 3) - 1) * 0.5
        out.append((-width / 2 + i * sp + jit, round(h), max(3, round(sp * wf)), lean))
    return out


def sparks(width, k, seed, hmax, count=2):
    cs = ("orange", "red", "yellow")
    out = []
    for j in range(count):
        x = (int(noise(j, k, seed, 5)) % 100) / 99.0 * width * 0.8 - width * 0.4
        up = hmax + 2 + int(noise(j, k, seed, 6)) % 4
        out.append((round(x), up, cs[int(noise(j, k, seed, 7)) % 3]))
    return out


# the fireplace's flames stand in the plane X = FP_FX through the middle of the firebox, parallel to
# its front, so their bed runs along the firebox (`/` on screen) and the jambs and the arch cut them
FP_FX = 20.5
FP_FOOT = 6.5          # the height the flames stand on, among the logs


def fireplace_flames(pic, k):
    ox, oy = pic.origin
    Hc, Wc = pic.alpha.shape
    XF, ZF = FP_FX, FP_FOOT
    yc = (FP["OY0"] + FP["OY1"]) / 2
    mid = XF - yc                                   # the screen x of the firebox's middle on the plane

    def foot(x):
        sx = x + 0.5 - ox
        return oy + XF - sx / 2 - ZF

    def depth(x, y):
        sx, sy = x - ox, y - oy
        Y = XF - sx
        Z = (XF + Y) / 2 - sy
        return XF + Y + Z
    tg = [(ox + mid + dx - 0.5, h, w, lean) for (dx, h, w, lean) in tongues(25, 8, 16, 8, k, 3)]
    sp = []
    for (dx, up, c) in sparks(24, k, 3, 16):
        x = int(round(ox + mid + dx - 0.5))
        sp.append((x, int(round(foot(x) - up)), c))
    m, col = flame_layer(Hc, Wc, foot, tg, (int(ox + mid - 14), int(ox + mid + 13)), sp)
    return cut_and_glow(pic, m, col, depth, k, seed=11)


# ======================================================================== the fire pit
# 2 by 2 on the floor, world X and Y 0..64, its centre at (32, 32). A low round base of flags, a short
# wall of squared blocks round a bed of coals and crossed logs, and a wrought-iron rack over it: two
# posts on the side tiles' centres' line (the screen's left and right), a crossbar between them with
# two pots hung from S-hooks, a ladle on the bar's end. The rack runs across the screen; the second
# facing is the drawing's mirror (the ladle on the other end), made at load.
PC = 32.0
PIT = dict(BASE_R=28.5, BASE_Z=2.0, RIN=15.5, ROUT=22.0, WALL_Z=10.0, NBLK=14,
           POST_D=31.0, POST_H=47.0, BAR_Z=44.5, BAR_END=37.0, HOOK_S=9.5)
SQ = 1 / math.sqrt(2)


def along(s):
    """the world point s units along the rack from the centre, toward the screen's right"""
    return PC + s * SQ, PC - s * SQ


def ring_block_shader(kind, r):
    """the squared blocks of the wall: `kind` "out" (the outer face), "in" (the inner face, seen on the
    far side), "top"; each block a tone of its own, a lit top row, a dark bottom row, mortar between"""
    n = PIT["NBLK"]
    Zb, Zt = PIT["BASE_Z"], PIT["WALL_Z"]
    Tl = tones(("top2", "lit", "lit2", "shade", "shade2", "dark", "deep"))

    def sh(P):
        a = np.arctan2(P[:, 1] - PC, P[:, 0] - PC)
        u = (a / (2 * math.pi) * n + 0.37) % n
        bi = np.floor(u).astype(int)
        uin = (u - bi) * 2 * math.pi * r / n            # world units from the block's start
        L = 2 * math.pi * r / n
        z = P[:, 2]
        if kind == "top":
            rr = np.hypot(P[:, 0] - PC, P[:, 1] - PC)
            out = np.where((bi % 3 == 0)[:, None], hx(ST["top2"]), hx(ST["top"])).astype(np.uint8)
            out[rr > PIT["ROUT"] - 1.1] = hx(ST["glint"])
            out[rr < PIT["RIN"] + 1.0] = hx(ST["lit2"])
            fl = noise(np.floor(P[:, 0]), np.floor(P[:, 1]), 91) % 11 == 0
            out[fl & (rr > PIT["RIN"] + 1) & (rr < PIT["ROUT"] - 1.1)] = hx(ST["lit"])
            out[(uin < 1.0)] = hx(ST["dark"])
            cu = (uin < 1.9) | (uin > L - 0.9)
            out[cu & ((rr > PIT["ROUT"] - 1.1) | (rr < PIT["RIN"] + 1.0))] = hx(ST["dark"])
            return out
        ang = a if kind == "out" else a + math.pi
        b = light_band(ang, (0.45, -0.05, -0.6))
        alt = (bi % 2 == 1).astype(int)
        idx = np.choose(b, [1 + alt, 2 + alt, 3 + alt, 5 + 0 * alt])
        out = Tl[idx]
        out[z > Zt - 1.0] = Tl[np.maximum(idx - 2, 0)][z > Zt - 1.0]
        out[z < Zb + 1.0] = Tl[np.minimum(idx + 2, 6)][z < Zb + 1.0]
        fl = (noise(np.floor(uin * 1.0) + bi * 50, np.floor(z), 92) % 9 == 0) & (z > Zb + 1) & (z < Zt - 1)
        out[fl] = Tl[np.minimum(idx + 1, 6)][fl]
        out[uin < 1.0] = hx(ST["mortar"])
        cu = (uin < 1.9) | (uin > L - 0.9)
        out[cu & ((z > Zt - 1.0) | (z < Zb + 1.0))] = hx(ST["mortar"])
        if kind == "in":
            out = (out.astype(int) * 0.7 + hx("#2a2420").astype(int) * 0.3).astype(np.uint8)
        return out
    return sh


def coal_bed(P):
    """ash and coals: lumps two units across, each with a lit upper-left pixel; the glow comes in the frames"""
    x, y = P[:, 0], P[:, 1]
    cx, cy = np.floor(x / 2.2), np.floor(y / 2.2)
    n = noise(cx, cy, 95) % 5
    out = np.broadcast_to(hx(ASH[2]), (len(P), 3)).copy()
    lump = n < 3
    out[lump] = hx(COAL[0])
    fx, fy = x / 2.2 - cx, y / 2.2 - cy
    out[lump & (fx < 0.45) & (fy > 0.55)] = hx(COAL[2])
    out[(n == 3)] = hx(ASH[1])
    return out


def fire_pit():
    W = World()
    Zb, Zt, RIN, ROUT, BR = PIT["BASE_Z"], PIT["WALL_Z"], PIT["RIN"], PIT["ROUT"], PIT["BASE_R"]
    # ---- the base: a round platform of flags, two high
    T4 = tones(("lit", "shade", "dark", "deep"))
    turned(W, PC, PC, [(0.0, BR), (Zb, BR)], lambda P: np.where(
        (noise(np.floor(np.arctan2(P[:, 1] - PC, P[:, 0] - PC) * BR / 9.0), 0, 96) % 5 == 0)[:, None],
        hx(ST["mortar"]), T4[light_band(np.arctan2(P[:, 1] - PC, P[:, 0] - PC), (0.4, -0.1, -0.6))]).astype(np.uint8),
        n=64, tag="base")

    def base_top(P):
        out = flag_shader(seed=97, cell=6.5, lmin=7, lmax=11)(P)
        rr = np.hypot(P[:, 0] - PC, P[:, 1] - PC)
        out[rr > BR - 0.9] = hx(ST["glint"])
        return out
    disc(W, PC, PC, Zb, BR, base_top, n=64, tag="base")
    # ---- the wall of squared blocks
    turned(W, PC, PC, [(Zb, ROUT), (Zt, ROUT)], ring_block_shader("out", ROUT), n=72, bias=0.1, tag="wall")
    turned(W, PC, PC, [(Zb, RIN), (Zt, RIN)], ring_block_shader("in", RIN), n=72, inside=True, bias=-0.1, tag="wall")
    n = 72
    for i in range(n):
        a0, a1 = 2 * math.pi * (i - 0.3) / n, 2 * math.pi * (i + 1.3) / n
        W.face([(PC + ROUT * math.cos(a0), PC + ROUT * math.sin(a0), Zt), (PC + ROUT * math.cos(a1), PC + ROUT * math.sin(a1), Zt),
                (PC + RIN * math.cos(a1), PC + RIN * math.sin(a1), Zt), (PC + RIN * math.cos(a0), PC + RIN * math.sin(a0), Zt)],
               ring_block_shader("top", (RIN + ROUT) / 2), 0.1, O=(PC, PC, Zt), A=(1, 0, 0), B=(0, 1, 0), tag="wall")
    # ---- the bed of coals and the crossed logs
    disc(W, PC, PC, Zb + 0.3, RIN + 0.2, coal_bed, n=48, bias=-1.0, tag="coal")
    for k, (a, r0, r1) in enumerate(((math.radians(20), -10.5, 11.0), (math.radians(105), -10.0, 10.5))):
        ux, uy = math.cos(a), math.sin(a)
        log(W, (PC + r0 * ux, PC + r0 * uy, Zb + 0.3 + 1.9), (PC + r1 * ux, PC + r1 * uy, Zb + 0.3 + 1.9), 1.9, 10 + k)
    a = math.radians(62)
    log(W, (PC - 8.5 * math.cos(a), PC - 8.5 * math.sin(a), Zb + 5.3), (PC + 9.0 * math.cos(a), PC + 9.0 * math.sin(a), Zb + 5.0), 1.7, 12, split=True)
    # ---- the rack: two posts, a crossbar, two S-hooks, two pots, a ladle on the bar's end
    H, BZ, D = PIT["POST_H"], PIT["BAR_Z"], PIT["POST_D"]
    for sgn in (-1, 1):
        px, py = along(sgn * D)
        W.block(px - 1.1, py - 1.1, 0, px + 1.1, py + 1.1, H, top=solid(IRON["hi"]), west=solid(IRON["west"]),
                east=solid(IRON["dark"]), bias=0.5, tag="rack")
        # a forged foot, a collar where the bar passes, a knob on top
        W.block(px - 2.0, py - 2.0, 0, px + 2.0, py + 2.0, 1.4, top=solid(IRON["hi"]), west=solid(IRON["west"]),
                east=solid(IRON["dark"]), bias=0.55, tag="rack")
        W.block(px - 1.6, py - 1.6, BZ - 1.6, px + 1.6, py + 1.6, BZ + 1.8, top=solid(IRON["glint"]), west=solid(IRON["hi"]),
                east=solid(IRON["east"]), bias=0.6, tag="rack")
        turned(W, px, py, [(H, 1.0), (H + 0.8, 1.7), (H + 2.0, 1.7), (H + 2.8, 0.6)], round_iron(px, py, [(H, 1.0), (H + 0.8, 1.7), (H + 2.0, 1.7), (H + 2.8, 0.6)]),
               n=16, bias=0.6, tag="rack")
    E = PIT["BAR_END"]
    p0, p1 = along(-E), along(E)
    cylinder_between(W, (p0[0], p0[1], BZ), (p1[0], p1[1], BZ), 0.85, iron_bar_shader, n=8, bias=0.4, tag="rack")
    # the bar's ends turned down into little hooks
    for sgn in (-1, 1):
        q0 = along(sgn * E)
        q1 = along(sgn * (E + 1.2))
        cylinder_between(W, (q0[0], q0[1], BZ), (q1[0], q1[1], BZ - 2.4), 0.6, iron_bar_shader, n=6, bias=0.4, tag="rack")
    hs = PIT["HOOK_S"]
    for sgn, lid, zb, h, R in ((-1, True, 17.5, 7.0, 5.0), (1, False, 18.5, 6.5, 4.8)):
        cx, cy = along(sgn * hs)
        bt = hung_pot(W, cx, cy, zb, h, R, lid=lid, tag="pot", bias=0.3, bail_top=zb + h + R + (2.5 if lid else 1.0))
        # the S-hook from the bar to the bail
        cylinder_between(W, (cx, cy, bt), (cx, cy, BZ - 0.6), 0.45, iron_bar_shader, n=6, bias=0.5, tag="hook")
        W.block(cx - 0.9, cy - 0.9, bt + 0.4, cx + 0.9, cy + 0.9, bt + 1.4, top=solid(IRON["hi"]), west=solid(IRON["west"]),
                east=solid(IRON["east"]), bias=0.55, tag="hook")
    # a wooden ladle hung from the left end of the bar, outside the post
    lx, ly = along(-(E + 0.4))
    cylinder_between(W, (lx, ly, BZ - 2.0), (lx, ly, BZ - 15.0), 0.55,
                     lambda P, b: np.broadcast_to(hx(LADLE[min(b, 2)]), (len(P), 3)).copy(), n=6, bias=0.6, tag="ladle")
    lp = [(BZ - 19.0, 0.8), (BZ - 18.2, 1.9), (BZ - 16.6, 2.2), (BZ - 15.2, 1.9)]
    turned(W, lx, ly, lp, lambda P: np.stack([hx(c) for c in LADLE + ("#5a3d25",)])[light_band(np.arctan2(P[:, 1] - ly, P[:, 0] - lx))],
           n=16, bias=0.6, tag="ladle")
    return W.draw()


def fire_pit_flames(pic, k):
    """the pit's flames stand in the screen-facing plane through the centre, a unit toward the camera"""
    ox, oy = pic.origin
    Hc, Wc = pic.alpha.shape
    C2 = 2 * PC + 2.0
    ZF = PIT["BASE_Z"] + 3.0

    def foot(x):
        return oy + C2 / 2 - ZF

    def depth(x, y):
        sy = y - oy
        return C2 + (C2 / 2 - sy)
    tg = [(ox + dx - 0.5, h, w, lean) for (dx, h, w, lean) in tongues(29, 9, 20, 8, k, 5)]
    sp = [(int(round(ox + dx - 0.5)), int(round(foot(0) - up)), c) for (dx, up, c) in sparks(28, k, 5, 20)]
    m, col = flame_layer(Hc, Wc, foot, tg, (int(ox - 15), int(ox + 14)), sp)
    return cut_and_glow(pic, m, col, depth, k, seed=21)


# ======================================================================== the campfire
# one tile, its centre at (16, 16): a ring of ten fieldstones round a bed of ash and coals, four logs
# stood together in a teepee (one split, its pale face toward the light), one more lying ready. `s` scales the whole build (1 the prop; the bag icon is
# the same design built bigger, never a picture enlarged).
CF_STONES = 10


def campfire(s=1.0):
    W = World()
    c = 16.0 * s
    # the ash
    def ash(P):
        rr = np.hypot(P[:, 0] - c, P[:, 1] - c)
        out = np.broadcast_to(hx(ASH[1]), (len(P), 3)).copy()
        n = noise(np.floor(P[:, 0] / max(1.0, s * 0.8)), np.floor(P[:, 1] / max(1.0, s * 0.8)), 101) % 5
        out[n == 0] = hx(ASH[0])
        out[rr < 5.0 * s] = hx(ASH[2])
        out[(rr < 5.0 * s) & (n < 2)] = hx(COAL[0])
        out[(rr < 5.0 * s) & (n == 2)] = hx(COAL[2])
        return out
    disc(W, c, c, 0.2, 9.5 * s, ash, n=40, bias=-2.0, tag="ash")
    disc(W, c, c, 0.25, 5.0 * s, ash, n=24, bias=-1.9, tag="coal")
    # the ring: fieldstones, each a rounded lump banded by its own normal, a little squared off on top
    S5 = tones(("top", "lit", "shade", "dark", "deep"))
    for i in range(CF_STONES):
        a = 2 * math.pi * (i + 0.3) / CF_STONES
        r = (11.0 + (0.5 if i % 3 == 1 else 0.0)) * s
        sx, sy = c + r * math.cos(a), c + r * math.sin(a)
        hgt = (2.4 + 0.6 * ((i * 7) % 3)) * s
        rad = (2.3 + 0.3 * ((i * 5) % 3)) * s

        def stone(P, sx=sx, sy=sy, hgt=hgt, i=i):
            b = light_band(np.arctan2(P[:, 1] - sy, P[:, 0] - sx), (0.4, -0.1, -0.6)) + 1
            b = np.where(P[:, 2] > hgt * 0.78, b - 1, b)
            b = np.where(P[:, 2] < 0.9 * s, np.minimum(b + 1, 4), b)
            fl = (noise(np.floor(P[:, 0] * 1.4), np.floor(P[:, 1] * 1.4), np.floor(P[:, 2]), i) % 9 == 0) & (b < 3)
            b = np.where(fl, b + 1, b)
            return S5[np.clip(b, 0, 4)]
        turned(W, sx, sy, [(0.0, rad), (hgt * 0.55, rad * 1.0), (hgt * 0.9, rad * 0.8), (hgt, rad * 0.45)], stone, n=18, tag="stone")
        disc(W, sx, sy, hgt, rad * 0.45 + 0.05, (lambda P: np.broadcast_to(hx(ST["glint"] if i % 2 else ST["top"]), (len(P), 3)).copy()),
             n=12, tag="stone")
    # the teepee: four logs leaning together over the middle, none straight in front, so the fire shows
    apex = np.array([c, c, 14.0 * s])
    for k in range(4):
        a = 2 * math.pi * k / 4 + 0.12
        foot = np.array([c + 6.0 * s * math.cos(a), c + 6.0 * s * math.sin(a), 0.8 * s])
        top = foot + (apex - foot) * 0.92
        log(W, foot, top, 1.0 * s, 20 + k, split=(k == 1))
    # two more logs lying ready against the ring at the back
    log(W, (c - 7.0 * s, c - 3.5 * s, 1.6 * s), (c - 3.0 * s, c - 8.0 * s, 1.6 * s), 1.3 * s, 26)
    return W.draw()


def campfire_flames(pic, k):
    """the campfire's flames stand in the screen-facing plane two and a half units toward the camera from
    the centre, in front of the back logs and behind the front ones' feet, so they lick up round the teepee"""
    ox, oy = pic.origin
    Hc, Wc = pic.alpha.shape
    C2 = 32.0 + 5.0
    ZF = 1.5

    def foot(x):
        return oy + C2 / 2 - ZF

    def depth(x, y):
        sy = y - oy
        return C2 + (C2 / 2 - sy)
    tg = [(ox + dx - 0.5, h, w, lean) for (dx, h, w, lean) in tongues(10, 4, 15, 7, k, 7, wf=1.9)]
    sp = [(int(round(ox + dx - 0.5)), int(round(foot(0) - up)), c) for (dx, up, c) in sparks(10, k, 7, 15, 1)]
    m, col = flame_layer(Hc, Wc, foot, tg, (int(ox - 6), int(ox + 5)), sp)
    return cut_and_glow(pic, m, col, depth, k, seed=31)


# ======================================================================== the Campfire item
class Canvas:
    def __init__(self, w, h):
        self.w, self.h = w, h
        self.col = np.zeros((h, w, 3), np.uint8)
        self.a = np.zeros((h, w), bool)
        self.yy, self.xx = np.mgrid[0:h, 0:w].astype(float) + 0.5

    def paint(self, mask, c):
        self.col[mask] = hx(c)
        self.a |= mask

    def outline(self, c=OUTLINE):
        p = np.pad(self.a, 1)
        ring = (p[:-2, 1:-1] | p[2:, 1:-1] | p[1:-1, :-2] | p[1:-1, 2:]) & ~self.a
        self.col[ring] = hx(c)
        self.a |= ring

    def image(self):
        ys = np.where(self.a.any(1))[0]
        xs = np.where(self.a.any(0))[0]
        y0, y1, x0, x1 = ys.min(), ys.max() + 1, xs.min(), xs.max() + 1
        rgba = np.zeros((y1 - y0, x1 - x0, 4), np.uint8)
        rgba[..., :3] = self.col[y0:y1, x0:x1]
        rgba[..., 3] = self.a[y0:y1, x0:x1] * 255
        return Image.fromarray(rgba, "RGBA"), (x0, y0)


# the packed campfire, hand-pixelled (docs/art/01: under about 20 px a person decides each pixel):
# two logs bundled with two turns of rope and a carrying loop on top, their cut ends toward the
# viewer's left (the ring's stones ride inside the bundle, unseen at this size). Held `fixed`, hung from the hand by the top of the loop.
CAMPFIRE_WORLD = """
......oooooo.....
.....oRRRRRSo....
.....oRoooooSo...
.....oRo...oSo...
..ooooRoooooSoooo
..oFEFRBBBBBSBBBo
.oFEGERMBBBBSMMDo
.oFEEFRMMMMMSMMDo
..oFFoRDDDDDSDDDo
..oFEFRBBBBBSBBBo
.oFEGERMBBBBSMMDo
.oFEEFRMMMMMSMMDo
..oFFoRDDDDDSDDDo
...ooooooooooooo.
"""
CAMPFIRE_KEY = {"o": OUTLINE, "E": ENDGRAIN[0], "F": ENDGRAIN[1], "G": ENDGRAIN[2], "B": BARK[0], "M": BARK[1],
                "D": BARK[2], "R": "#c8b48a", "S": "#9a8660", "K": ST["glint"], "k": ST["top"], "L": ST["shade"]}


def from_grid(text, key):
    rows = text.strip().split()
    w = max(len(r) for r in rows)
    c = Canvas(w, len(rows))
    for y, r in enumerate(rows):
        for x, ch in enumerate(r):
            if ch != ".":
                c.col[y, x] = hx(key[ch])
                c.a[y, x] = True
    return c


# ======================================================================== checks
def check_outlined(im, name):
    a = np.array(im)[..., 3]
    assert set(np.unique(a)) <= {0, 255}, name + ": alpha not hard"
    al = a > 0
    p = np.pad(al, 1)
    edge = al & ~(p[:-2, 1:-1] & p[2:, 1:-1] & p[1:-1, :-2] & p[1:-1, 2:])
    rgb = np.array(im)[..., :3]
    assert (rgb[edge] == hx(OUTLINE)).all(1).all(), name + ": not outlined all round"


def build(name, fn, ffn):
    """the prop and its frames: contour lines, the frames cut against the prop's depth, then the outline"""
    pic = fn()
    pic.contour()
    frames = [ffn(pic, k) for k in range(3)]
    pic.outline()
    im, anc = pic.image()
    check_outlined(im, name)
    im.save(os.path.join(OUT, name + ".png"))
    info = frames_out(pic, frames, name)
    return {"image": im, "anchor": anc, "fire": info}


# ======================================================================== the definitions
def definitions(res):
    old_fp = json.load(open(f"{REPO}/data/sprites/fireplace.json", encoding="utf-8"))
    old_cf = json.load(open(f"{REPO}/data/sprites/campfire.json", encoding="utf-8"))
    path = lambda n: f"data/art/village/{n}"
    defs = {}
    # ---- the fireplace: today's shape, every field of its fire block kept but the picture's
    r = res["fireplace"]
    fire = dict(old_fp["fire"])
    fire.update({"at": r["fire"]["at"], "frames": [path(f"fireplace_fire_{k}.png") for k in range(3)],
                 "base": r["fire"]["base"], "fps": 6})
    d = {"anchorVertex": "top", "facings": ["y", "x"], "facingFootprint": {"y": [1, 2], "x": [2, 1]},
         "drawings": {"y": {"image": path("fireplace.png"), "anchor": r["anchor"]}, "x": {"from": "y", "mirror": True}},
         "fire": fire}
    for k, v in old_fp.items():
        if k not in d and k != "note":
            d[k] = v
    d["note"] = ("the drawn fireplace (art round 6, redrawn to match the fire pit and the campfire): a big stone hearth "
                 "on a flagstone slab, an arched firebox with its voussoirs and keystone proud of the coursed face, a "
                 "fire laid on firedogs and an iron crane with a pot, stepped corbels under a thick oak mantle that "
                 "stands out at the front and both sides (a candle, a jug, a bowl on it), a chimney breast to a "
                 "weathered slope at 68; backs against a west wall as drawn (y), a north wall as its mirror (x); its "
                 "three flame frames stand in the firebox, already cut where the jambs, the arch, the logs, and the "
                 "pot stand in front of them (the mirrored facing needs them mirrored too: see the art's README)")
    defs["fireplace"] = d
    # ---- the fire pit
    r = res["fire_pit"]
    defs["fire_pit"] = {
        "name": "fire pit",
        "anchorVertex": "top", "facings": ["y", "x"], "facingFootprint": {"y": [2, 2], "x": [2, 2]},
        "drawings": {"y": {"image": path("fire_pit.png"), "anchor": r["anchor"]}, "x": {"from": "y", "mirror": True}},
        "fire": {"radius": 5, "room": True, "burns": True, "cooks": True, "switch": True, "maxFuel": 6,
                 "flicker": {"amp": 0.24, "speed": 7}, "fuel": "log", "hoursPerUnit": 3,
                 "at": r["fire"]["at"], "frames": [path(f"fire_pit_fire_{k}.png") for k in range(3)],
                 "base": r["fire"]["base"], "fps": 6},
        "carry": False,
        "note": ("the fire pit (Michael, 2026-10-26, docs/02 Round rooms: a spec, the fire rulings; art round 6): "
                 "the 2 by 2 floor fire, indoors or out, built and never moved; a low round base of flags, a short "
                 "wall of squared blocks round a bed of coals and crossed logs, a wrought-iron rack over it on two "
                 "posts (on the line through the left and right tiles' centres) with a crossbar, two pots on S-hooks "
                 "(one lidded) and a wooden ladle on the bar's end; the rack runs across the screen; two facings, y "
                 "as drawn (ladle at the left) and x its mirror (ladle at the right; the lit side swaps, the accepted "
                 "cost), so R turns it; its three flame frames stand under the pots, already cut "
                 "where the wall, the logs, and the pots stand in front of them. The engine cuts it into three screen "
                 "columns (the left tile, the middle two, the right tile): the posts stand in the outer columns and "
                 "the pots in the middle one, in both facings (the art's README); the frames mirror with the drawing"),
    }
    # ---- the campfire: today's fields, the placeholder replaced by the drawing
    r = res["campfire"]
    d = {"anchorVertex": "top", "facings": ["y", "x"], "facingFootprint": {"y": [1, 1], "x": [1, 1]},
         "drawings": {"y": {"image": path("campfire.png"), "anchor": r["anchor"]}, "x": {"from": "y", "mirror": True}}}
    for k, v in old_cf.items():
        if k != "placeholder":
            d[k] = v
    fire = dict(d["fire"])
    fire.update({"at": r["fire"]["at"], "frames": [path(f"campfire_fire_{k}.png") for k in range(3)],
                 "base": r["fire"]["base"], "fps": 6})
    d["fire"] = fire
    d["note"] = ("the drawn campfire (art round 6): a ring of ten fieldstones round a bed of ash and coals, four logs "
                 "stood in a teepee and one lying ready; the travelling fire, set down from the Campfire item and "
                 "picked up out and empty; two facings, y as drawn (the spare log at the back right) and x its mirror "
                 "(the spare log at the back left; the lit side swaps); its three flame frames stand in the teepee, "
                 "already cut where the near logs and stones stand in front of them, and mirror with the drawing")
    defs["campfire"] = d
    for k, v in defs.items():
        with open(os.path.join(OUT, k + ".json"), "w", newline="\n", encoding="utf-8") as fh:
            json.dump(v, fh, indent=1)
            fh.write("\n")
    return defs


# ======================================================================== the item
ICON_SCALE = 1.38


def item():
    c = from_grid(CAMPFIRE_WORLD, CAMPFIRE_KEY)
    w, off = c.image()
    check_outlined(w, "campfire_world")
    w.save(os.path.join(OUT, "campfire_world.png"))
    grip = [int(CAMPFIRE_GRIP[0] - off[0]), int(CAMPFIRE_GRIP[1] - off[1])]
    assert w.getpixel(tuple(grip))[:3] != tuple(hx(OUTLINE))
    pic = campfire(ICON_SCALE)
    pic.contour()
    pic.outline()
    big, _ = pic.image()
    check_outlined(big, "campfire_icon")
    assert big.width <= 57 and big.height <= 57, big.size
    icon = Image.new("RGBA", (57, 57), (0, 0, 0, 0))
    icon.alpha_composite(big, ((57 - big.width) // 2, (57 - big.height) // 2))
    icon.save(os.path.join(OUT, "campfire_icon.png"))
    return {"world": list(w.size), "grip": grip, "icon_drawing": list(big.size)}


CAMPFIRE_GRIP = (8, 1)      # the top of the rope loop, in the grid (the crop is taken off)


def manifest(it):
    m = {"campfire": {
        "icon": [57, 57], "portrait": False,
        "held": {"mode": "fixed", "image": "campfire_world.png", "grip": it["grip"]},
        "sizes": {"campfire_world.png": it["world"], "campfire_icon.png": [57, 57]},
        "notes": ("the Campfire as a thing (3 by 3 in the bag, 5 by 5 today): the held picture is the packed campfire, "
                  f"two logs bundled with two turns of rope and a carrying loop, hand-pixelled at {it['world'][0]} by "
                  f"{it['world'][1]}, hung from the hand by the top of the loop (grip); the stones ride inside the "
                  "bundle, too small to show. The icon is the campfire itself, unlit, built again at "
                  f"{ICON_SCALE} times the prop's size ({it['icon_drawing'][0]} by {it['icon_drawing'][1]}, centred on "
                  "57 by 57), round 4's bucket exception: the same design drawn larger. No portrait, in the brief's "
                  "shape and as the Cauldron's (a furniture item carried in the hand). It does not stack: no corner kept clear.")}}
    with open(os.path.join(HERE, "manifest.json"), "w", newline="\n", encoding="utf-8") as fh:
        json.dump(m, fh, indent=1)
        fh.write("\n")
    return m


# ======================================================================== the preview
SLOT = (42, 38, 34, 255)            # #2a2622
BG = (34, 30, 28, 255)


def art(rel):
    return Image.open(f"{REPO}/data/art/{rel}").convert("RGBA")


def figure():
    """the bare body from data/art/character/preview_skins_3x.png taken back to 1x (round 4's and 5's crop)"""
    im = np.array(Image.open(f"{REPO}/data/art/character/preview_skins_3x.png").convert("RGBA"))
    bg = im[2, 2, :3].astype(int)
    small = im[260:460, 170:310][1::3, 1::3].copy()
    a = np.abs(small[..., :3].astype(int) - bg).sum(-1) > 6
    small[..., 3] = np.where(a, 255, 0)
    ys = np.where(a.any(1))[0]
    xs = np.where(a.any(0))[0]
    return Image.fromarray(small[ys.min():ys.max() + 1, xs.min():xs.max() + 1], "RGBA")


def lit(im, fire, k, mirror=False):
    im = im.copy()
    f = fire["images"][k]
    at, base = list(fire["at"]), list(fire["base"])
    if mirror:
        # the drawing mirrored (as the loader makes a mirrored facing), and the frame mirrored with it, its
        # pin mirrored too (fw - pin): the line assets.js needs
        im = im.transpose(Image.FLIP_LEFT_RIGHT)
        f = f.transpose(Image.FLIP_LEFT_RIGHT)
        at = [im.width - at[0], at[1]]
        base = [f.width - base[0], base[1]]
    im.alpha_composite(f, (at[0] - base[0], at[1] - base[1]))
    return im


class Strip:
    def __init__(self, h, base):
        self.items, self.h, self.base, self.x = [], h, base, 6

    def put(self, w, draw):
        self.items.append((self.x, draw))
        self.x += w + 6

    def image(self):
        im = Image.new("RGBA", (self.x, self.h), BG)
        for x, draw in self.items:
            draw(im, x)
        return im


def tiles(im, top, cells, tile):
    for (X, Y) in cells:
        im.alpha_composite(tile, (top[0] + (X - Y) * 32 - 32, top[1] + (X + Y) * 16))


def preview(res, it):
    wood, grass = art("village/floor_wood_0.png"), art("ground/grass_0.png")
    wall_w, wall_n = art("village/wall_stone_west_plain.png"), art("village/wall_stone_north_plain.png")
    barrel, fig = art("village/barrel.png"), figure()
    mir = lambda im: im.transpose(Image.FLIP_LEFT_RIGHT)
    H = 196
    S = Strip(H, 0)
    G = 186                     # the screen row of the tiles' top vertex is set per piece from here

    def standing(img, anc, cells, tile, w, extra=None, pre=None):
        def draw(im, x):
            top = (x + w // 2 + (cells_shift(cells)), G - footprint_depth(cells))
            tiles(im, top, cells, tile)
            if pre:
                pre(im, top)
            if extra:
                extra(im, top)
            im.alpha_composite(img, (top[0] - anc[0], top[1] - anc[1]))
        return draw

    def cells_shift(cells):
        xs = [X - Y for (X, Y) in cells]
        return int((-(min(xs) + max(xs)) / 2) * 32)

    def footprint_depth(cells):
        return max(X + Y for (X, Y) in cells) * 16 + 32

    one, along_y, along_x, two = [(0, 0)], [(0, 0), (0, 1)], [(0, 0), (1, 0)], [(0, 0), (1, 0), (0, 1), (1, 1)]
    # row 1: on the wooden floor, indoors
    S.put(64, standing(barrel, (14, 18), one, wood, 64))
    fp = res["fireplace"]

    def west_wall(im, top):
        for Y in (-1, 0, 1, 2):
            tiles(im, top, [(0, Y)], wood)
        for X in (1,):
            for Y in (-1, 0, 1, 2):
                tiles(im, top, [(X, Y)], wood)
        for Y in (-1, 0, 1, 2):
            im.alpha_composite(wall_w, (top[0] - Y * 32 - 40, top[1] + Y * 16 - 84))

    def north_wall(im, top):
        for X in (-1, 0, 1, 2):
            for Y in (0, 1):
                tiles(im, top, [(X, Y)], wood)
        for X in (-1, 0, 1, 2):
            im.alpha_composite(wall_n, (top[0] + X * 32 - 8, top[1] + X * 16 - 84))
    for k in (None, 0, 1, 2):
        img = fp["image"] if k is None else lit(fp["image"], fp["fire"], k)
        S.put(196, standing(img, fp["anchor"], along_y, wood, 196, pre=west_wall))
    fx = mir(fp["image"])
    fxa = (fp["image"].width - fp["anchor"][0], fp["anchor"][1])
    for k in (None, 1):
        img = fx if k is None else lit(fp["image"], fp["fire"], k, mirror=True)
        S.put(196, standing(img, fxa, along_x, wood, 196, pre=north_wall))
    S.put(30, lambda im, x: im.alpha_composite(fig, (x + 2, G - 30 - fig.height)))
    for name, cells, w in (("fire_pit", two, 132), ("campfire", one, 64)):
        r = res[name]
        for k in (None, 0, 1, 2):
            img = r["image"] if k is None else lit(r["image"], r["fire"], k)
            S.put(w, standing(img, r["anchor"], cells, wood, w))
    row1 = S.image()
    # row 2: on grass, outdoors
    S = Strip(120, 0)
    G = 110
    S.put(64, standing(barrel, (14, 18), one, grass, 64))
    for name, cells, w in (("fire_pit", two, 132), ("campfire", one, 64)):
        r = res[name]
        for k in (None, 0, 1, 2):
            img = r["image"] if k is None else lit(r["image"], r["fire"], k)
            S.put(w, standing(img, r["anchor"], cells, grass, w))
    # the second facings, x, the mirrors made at load, unlit and with each frame mirrored with them
    for name, cells, w in (("fire_pit", two, 132), ("campfire", one, 64)):
        r = res[name]
        xa = (r["image"].width - r["anchor"][0], r["anchor"][1])
        for k in (None, 0, 1, 2):
            img = mir(r["image"]) if k is None else lit(r["image"], r["fire"], k, mirror=True)
            S.put(w, standing(img, xa, cells, grass, w))
    S.put(30, lambda im, x: im.alpha_composite(fig, (x + 2, G - 30 - fig.height)))
    row2 = S.image()
    # row 3: the item: the icon at 2x on the slot's colour, the held picture at 3x with its grip in
    # magenta, and held at 1x by the figure (the grip on the right hand, 14 px above the feet, 10 out)
    row3 = Image.new("RGBA", (420, 130), BG)
    icon = Image.open(os.path.join(OUT, "campfire_icon.png"))
    slot = Image.new("RGBA", (114, 114), SLOT)
    slot.alpha_composite(icon.resize((114, 114), Image.NEAREST))
    row3.alpha_composite(slot, (6, 8))
    w = Image.open(os.path.join(OUT, "campfire_world.png"))
    g = it["grip"]
    big = w.resize((w.width * 3, w.height * 3), Image.NEAREST)
    row3.alpha_composite(big, (130, 8))
    row3.alpha_composite(Image.new("RGBA", (3, 3), (255, 0, 255, 255)), (130 + g[0] * 3, 8 + g[1] * 3))
    fx_, feet = 220, 110
    row3.alpha_composite(fig, (fx_ - fig.width // 2, feet - fig.height + 1))
    row3.alpha_composite(w, (fx_ + 10 - g[0], feet - 14 - g[1]))
    # beside it, the icon at 1x in a 3 by 3 block of 19 px cells, as the bag shows it at 1x
    cells = Image.new("RGBA", (57, 57), SLOT)
    cells.alpha_composite(icon)
    row3.alpha_composite(cells, (260, 8))
    Wd = max(row1.width, row2.width, row3.width)
    full = Image.new("RGBA", (Wd, row1.height + row2.height + row3.height), BG)
    full.alpha_composite(row1, (0, 0))
    full.alpha_composite(row2, (0, row1.height))
    full.alpha_composite(row3, (0, row1.height + row2.height))
    full.save(os.path.join(OUT, "preview_1x.png"))
    big = full.resize((full.width * 3, full.height * 3), Image.NEAREST)
    big.save(os.path.join(OUT, "preview_3x.png"))
    P = Image.new("RGBA", (big.width, full.height + 8 + big.height), BG)
    P.alpha_composite(full, (0, 0))
    P.alpha_composite(big, (0, full.height + 8))
    P.save(os.path.join(HERE, "preview.png"))


def main():
    res = {"fireplace": build("fireplace", fireplace, fireplace_flames),
           "fire_pit": build("fire_pit", fire_pit, fire_pit_flames),
           "campfire": build("campfire", campfire, campfire_flames)}
    defs = definitions(res)
    it = item()
    manifest(it)
    preview(res, it)
    for k, r in res.items():
        f = r["fire"]
        print(k, r["image"].size, "anchor", r["anchor"], "frames", f["size"], "base", f["base"], "at", f["at"])
    print("item", it)


if __name__ == "__main__":
    main()
