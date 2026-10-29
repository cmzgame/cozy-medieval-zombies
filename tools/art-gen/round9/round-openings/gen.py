"""Art round 9: doors and windows in a round stone wall (docs/50), drawn on the curve.

Plain `python gen.py` (Python 3, numpy, PIL). Deterministic: no randomness but integer hashes.
Writes out/r5/*.png, out/r7/*.png, manifest.json, preview.png (and preview_states_5.png, preview_states_7.png).

Geometry (world px, 32 a tile; the ring's centre on the ground is the origin):
    screen x = X - Y,  screen y = (X + Y) / 2 - Z,  depth = X + Y + Z (toward the camera)  (docs/art/01)
A ring of size n has radius Rpx = 16 n (the circle through its door points), its stone 16 thick, so its outer face is at
Rpx + 8 and its inner face at Rpx - 8. Angles run from +X toward +Y, as src/render/rings.js: the door points are north 270,
east 0, south 90, west 180 degrees. East and south are on the near half (rings.js nearHalf: the camera sees their OUTER face);
north and west are on the far half (the camera sees their INNER face, from outside over the near half and from inside).

Every surface is solved per pixel from the screen (an exact inverse of the projection, no polygons), into a z-buffer, so
each piece is crisp at 1x with hard pixels. The preview mimics rings.js (48 segments, the stone wall's north_plain face
wrapped round, the flat cap, the inside skirt, the near half's fade) and composites the pieces by the depth planes the
manifest states, so it tests the anchors and the depth notes as the engine would use them.
"""
import json, math, os
import numpy as np
from PIL import Image, ImageDraw

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "out")
REPO = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", "..", ".."))  # the repo root: tools/art-gen/roundN/name/  # read only: the preview's wall face and floor

TAU = 2 * math.pi
T_HALF = 8.0                 # half the stone wall's thickness (wall_stone.json thickness 16)
H_WALL = 96                  # docs/52
DOOR_TOP, WIN_SILL, WIN_TOP = 64, 24, 64   # src/placeholders.js
POINTS = {"n": 270, "e": 0, "s": 90, "w": 180}

OUTLINE = "#2b2522"
METAL, METAL_HI = "#2b2a32", "#4a4952"


def hx(s):
    s = s.lstrip("#")
    return np.array([int(s[i:i + 2], 16) for i in (0, 2, 4)], np.float64)


def hsh(*a):
    """Deterministic integer hash, vectorised (iso3d.py's)."""
    out = None
    for i, v in enumerate(a):
        v = np.asarray(v).astype(np.int64)
        out = (v * (73856093 + 19349663 * i)) if out is None else (out ^ (v * (83492791 + 2654435761 * i)))
    return (out ^ (out >> 13)) & 0xFFFF


# ------------------------------------------------------------------ palettes (lit tones; a face's light multiplies them)
# Dressed stone for the frame: the Fireplace's warm grey (Michael's high-water mark), lighter than the ring's #7b7670.
FR = dict(m="#4a423c", c=["#a69c8d", "#9d9385", "#a39a8a"], hi="#b8ae9e", lo="#857c70",
          top="#c4baa9", end="#7a7266", speck="#8f867a", key=["#b0a697"])
# The ring's own stone for the reveals (generator's STONE, docs/art/01).
STONE = {
    "top": dict(m="#6c6761", c=["#99938b", "#a19b92", "#928c85"], hi="#aea89d", lo="#857f78"),
    "left": dict(m="#57524d", c=["#7b7670", "#857f78", "#75706a"], hi="#938d85", lo="#6b6660"),
    "right": dict(m="#3b3734", c=["#585350", "#605b56", "#534e4a"], hi="#6b6661", lo="#4b4743"),
}
SILL_TOP = ["#aaa49a", "#a29c92"]
SILL_M = "#6c6761"
DOORW = dict(c=["#6c4b30", "#654529", "#69492e", "#614227"], gap="#3a2716", g="#5a3d25",
             top="#7d5a3c", edge="#4b331f", batten=["#77553a", "#7d5a3c"], bat_lo="#5a3d25")
BOARD = dict(c=["#b5a27e", "#ab9773"], top="#c6b38e", grain="#94805d", edge="#8d7b5f", back=["#9a896a", "#91805f"])


def kface(nx, ny):
    """rings.js's face light: 1 - 0.18 (1 - cos(look - 90deg)), with look the face's outward normal: 1 lit (+Y), 0.82 (+X)."""
    l = math.hypot(nx, ny) or 1
    return 1 - 0.18 * (1 - ny / l)


def ksmall(nx, ny):
    """A small face (a stone's end, a leaf's edge): the same rule with more contrast, so a chunky piece reads."""
    l = math.hypot(nx, ny) or 1
    return 1 - 0.40 * (1 - ny / l)


# ------------------------------------------------------------------ the per-pixel renderer
class Buf:
    FRONT, SIDE = 1, 2

    def __init__(self, x0, y0, w, h):
        self.x0, self.y0, self.w, self.h = x0, y0, w, h
        xs = x0 + np.arange(w) + 0.5
        ys = y0 + np.arange(h) + 0.5
        self.SX, self.SY = np.meshgrid(xs, ys)
        self.col = np.zeros((h, w, 3))
        self.dep = np.full((h, w), -np.inf)
        self.tag = np.zeros((h, w), int)      # FRONT / SIDE
        self.sid = np.full((h, w), -1, int)   # a stone's or a part's id
        self.U = np.zeros((h, w))
        self.Z = np.zeros((h, w))
        self.alpha = np.zeros((h, w), bool)

    def put(self, m, dep, col, tag, sid, U=None, Z=None):
        better = m & (dep > self.dep)
        if not better.any():
            return
        self.dep[better] = dep[better]
        c = np.broadcast_to(col, self.col.shape) if np.ndim(col) == 1 else col
        self.col[better] = c[better]
        self.tag[better] = tag
        self.sid[better] = sid[better] if np.ndim(sid) else sid
        if U is not None:
            self.U[better] = U[better]
        if Z is not None:
            self.Z[better] = Z[better]
        self.alpha[better] = True


def wrap(a):
    return (a + math.pi) % TAU - math.pi


def cyl(buf, r, c, face, rel0, rel1, ur, region, shade, tag, bias=0.0):
    """A vertical cylinder patch: radius r, angles c + [rel0, rel1], the side `face` (+1 outward, -1 inward) seen.
    region(U, Z, rel) -> sid array (-1 none), U the arc length at radius ur from the door point; shade(U, Z, sid) -> colours."""
    q = buf.SX / (r * math.sqrt(2))
    ok = np.abs(q) <= 1
    base = np.arccos(np.clip(q, -1, 1))
    for sg in (1, -1):
        a = -math.pi / 4 + sg * base
        vis = face * (np.cos(a) + np.sin(a)) > 0
        rel = wrap(a - c)
        X, Y = r * np.cos(a), r * np.sin(a)
        Z = (X + Y) / 2 - buf.SY
        m = ok & vis & (rel >= rel0) & (rel <= rel1)
        if not m.any():
            continue
        U = rel * ur
        sid = np.where(m, region(U, Z, rel), -1)
        m &= sid >= 0
        if not m.any():
            continue
        col = np.zeros(buf.col.shape)
        col[m] = shade(U[m], Z[m], sid[m])
        buf.put(m, X + Y + Z + bias, col, tag, sid, U, Z)


def vplane(buf, g0, d, L, region, shade, tag, bias=0.0):
    """A vertical plane from ground point g0 along unit d for L: region(S, Z) -> sid, shade(S, Z, sid)."""
    den = d[0] - d[1]
    if abs(den) < 1e-6:
        return
    S = (buf.SX - (g0[0] - g0[1])) / den
    X = g0[0] + S * d[0]
    Y = g0[1] + S * d[1]
    Z = (X + Y) / 2 - buf.SY
    m = (S >= 0) & (S <= L)
    sid = np.where(m, region(S, Z), -1)
    m &= sid >= 0
    if not m.any():
        return
    col = np.zeros(buf.col.shape)
    col[m] = shade(S[m], Z[m], sid[m])
    buf.put(m, X + Y + Z + bias, col, tag, sid, S, Z)


def hplane(buf, z, region, shade, tag, bias=0.0):
    """A horizontal surface at height z: region(X, Y) -> sid, shade(X, Y, sid)."""
    X = (buf.SX + 2 * (buf.SY + z)) / 2
    Y = (2 * (buf.SY + z) - buf.SX) / 2
    sid = region(X, Y)
    m = sid >= 0
    if not m.any():
        return
    col = np.zeros(buf.col.shape)
    col[m] = shade(X[m], Y[m], sid[m])
    buf.put(m, X + Y + z + bias, col, tag, sid, X, np.full(X.shape, float(z)))


def pick(cols, idx):
    arr = np.stack([hx(c) for c in cols])
    return arr[np.asarray(idx) % len(arr)]


def nb(a, dy, dx, fill):
    """a shifted so out[y, x] = a[y + dy, x + dx]."""
    out = np.full(a.shape, fill, dtype=a.dtype)
    h, w = a.shape
    ys0, ys1 = max(0, -dy), min(h, h - dy)
    xs0, xs1 = max(0, -dx), min(w, w - dx)
    out[ys0:ys1, xs0:xs1] = a[ys0 + dy:ys1 + dy, xs0 + dx:xs1 + dx]
    return out


def outer_outline(buf, color=OUTLINE):
    a = buf.alpha
    ring = (nb(a, -1, 0, False) | nb(a, 1, 0, False) | nb(a, 0, -1, False) | nb(a, 0, 1, False)) & ~a
    buf.col[ring] = hx(color)
    buf.alpha = a | ring
    buf.sid[ring] = -2
    return ring


def inner_outline(buf, color=OUTLINE):
    """Edge pixels of each part (sid) recoloured, so a leaf stays inside its opening (the straight leaf's rule)."""
    a, s = buf.alpha, buf.sid
    edge = np.zeros(a.shape, bool)
    for dy, dx in ((-1, 0), (1, 0), (0, -1), (0, 1)):
        edge |= a & ((~nb(a, dy, dx, False)) | (nb(s, dy, dx, -9) != s))
    buf.col[edge] = hx(color)
    return edge


# ------------------------------------------------------------------ one opening's geometry
class Opening:
    def __init__(self, n, point, kind):
        self.n, self.point, self.kind = n, point, kind
        self.c = math.radians(POINTS[point])
        self.Rpx = 16.0 * n
        self.near = math.cos(self.c) + math.sin(self.c) > 0
        self.out = 1 if self.near else -1          # the face the camera sees: outer on the near half, inner on the far
        self.rf = self.Rpx + self.out * T_HALF     # that face's radius
        self.rb = self.Rpx - self.out * T_HALF     # the other face
        self.theta = math.atan(1.0 / n)            # rings.js: the hole spans atan(0.5 / R) either side (R in tiles = n / 2)
        self.half_clear = 10.0 if kind == "door" else 8.0   # the clear opening, at the wall's centre line: 20 and 16 px (art/01)
        self.phi = self.half_clear / self.Rpx      # its half angle
        self.spring = 54.0 if kind == "door" else 56.0
        self.crown = float(DOOR_TOP)
        self.floor = 3.0 if kind == "door" else float(WIN_SILL)   # the threshold's top; the window's sill
        self.rl = self.Rpx + T_HALF - 2            # the leaf's outer surface: 2 in from the outer face (the straight leaf's)
        # the shut leaf, shutters, and their stubs sit 2 px in from the face the camera sees, as the straight wall's leaf does
        # (every door point is seen from one side only: the near ones from outside, the far ones from inside)
        self.rl_seen = self.Rpx + self.out * (T_HALF - 2)
        # outward normal of the face seen, at the door point, and its light
        self.nrm = (self.out * math.cos(self.c), self.out * math.sin(self.c))
        self.k = kface(*self.nrm)
        # screen point of the door point on the centre line
        self.px = self.Rpx * (math.cos(self.c) - math.sin(self.c))
        self.py = self.Rpx * (math.cos(self.c) + math.sin(self.c)) / 2

    def ground(self, rel, r):
        a = self.c + rel
        return (r * math.cos(a), r * math.sin(a))

    def tangent(self, rel=0.0):
        a = self.c + rel
        return (-math.sin(a), math.cos(a))

    def z_int(self, rel):
        """The arch's intrados over the clear opening, by angle."""
        u = np.clip(np.abs(rel) / self.phi, 0, 1)
        return self.spring + (self.crown - self.spring) * np.sqrt(1 - u * u)

    def buf(self):
        x0 = int(math.floor(self.px)) - 72
        y0 = int(math.floor(self.py)) - 112
        return Buf(x0, y0, 144, 160)


def shade_mul(col, k):
    return np.clip(col * k, 0, 255)


# ------------------------------------------------------------------ the frame: jambs, arch, threshold or sill, on the curve
def frame_layout(o):
    """The frame's stones in the face's own terms (U arc px at the face, Z), -> (region fn, proud by id)."""
    rf = o.rf
    ce = o.phi * rf                  # clear half-width on the face
    he = o.theta * rf                # the hole's half-width on the face
    if o.kind == "door":
        Q = [3, 13, 23, 33, 43, 54]
        nv = 7
        sill = (0.0, 3.0, he + 4)    # z0, z1, half-width: the threshold slab
    else:
        Q = [24, 35, 46, 56]
        nv = 5
        sill = (20.0, 24.0, he + 3)  # a deep sill under the window, the quoins standing on it
    sp, cr = o.spring, o.crown
    b1 = cr - sp
    a2 = he + 4
    need = (cr + 1.5 - sp) / math.sqrt(max(1e-6, 1 - (he / a2) ** 2))
    b2 = max(b1 + 8, need)
    proud = {100: 3}

    def region(U, Z, rel):
        sid = np.full(U.shape, -1, int)
        au = np.abs(U)
        right = U > 0
        # the slab
        m = (Z >= sill[0]) & (Z < sill[1]) & (au <= sill[2])
        sid[m] = 100
        # quoins, long and short by turns, the two sides out of step
        for k in range(len(Q) - 1):
            for side in (0, 1):
                long = (k + side) % 2 == 0
                ext = he + (6 if long else 2)
                mm = (Z >= Q[k]) & (Z < Q[k + 1]) & (au >= ce) & (au <= ext) & ((right if side else ~right))
                sid[mm & (sid < 0)] = 10 + k + 20 * side
                proud[10 + k + 20 * side] = 2
        # the arch: voussoirs between the intrados and the extrados, joints radiating; the keystone taller and prouder
        zz = Z - sp
        e1 = (U / ce) ** 2 + (zz / b1) ** 2
        e2 = (U / a2) ** 2 + (zz / b2) ** 2
        ek = (U / a2) ** 2 + (zz / (b2 + 4)) ** 2
        ang = np.arctan2(zz / b2, U / a2)
        idx = np.clip((ang / math.pi * nv).astype(int), 0, nv - 1)
        idx = nv - 1 - idx                       # count from the left on the face (U grows toward +angle)
        key = nv // 2
        inarch = (zz >= 0) & (e1 >= 1) & ((e2 <= 1) | ((idx == key) & (ek <= 1)))
        m = inarch & (sid < 0)
        sid[m] = 50 + idx[m]
        return sid

    for i in range(nv):
        proud[50 + i] = 2
    proud[50 + nv // 2] = 3
    return region, proud, dict(ce=ce, he=he, a2=a2, b2=b2, nv=nv)


def render_frame(o):
    b = o.buf()
    region, proud, info = frame_layout(o)
    rel_max = (info["he"] + 8) / o.rf
    key_id = 50 + info["nv"] // 2
    # the stones' fronts and, behind, copies stepping back to the face: their tops and ends show past the fronts
    steps = [3.0, 2.5, 2.0, 1.5, 1.0, 0.5]
    tone = {}

    def stone_col(U, Z, sid):
        idx = hsh(sid, 5) % 3
        col = pick(FR["c"], idx)
        isk = sid == key_id
        col[isk] = hx(FR["key"][0])
        sp = (hsh(sid, np.floor(U / 2).astype(int), np.floor(Z / 2).astype(int)) % 11 == 0)
        col[sp & ~isk] = hx(FR["speck"])
        return col

    for p in steps:
        def reg(U, Z, rel, p=p):
            s = region(U, Z, rel)
            pr = np.vectorize(lambda v: proud.get(v, 0) if v >= 0 else -1)(s) if s.size else s
            return np.where(pr >= p, s, -1)
        front = (p == 3.0)
        # the front of a stone proud 2 is the copy at 2; draw every copy, then decide front vs side per stone
        cyl(b, o.rf + o.out * p, o.c, o.out, -rel_max, rel_max, o.rf, reg,
            stone_col, Buf.SIDE, bias=0)
    # which copy is each stone's front: the pixels whose depth is the stone's proud plane. Redo the fronts exactly.
    for sid_val, pr in proud.items():
        def reg1(U, Z, rel, sid_val=sid_val):
            s = region(U, Z, rel)
            return np.where(s == sid_val, s, -1)
        cyl(b, o.rf + o.out * pr + o.out * 0.01, o.c, o.out, -rel_max, rel_max, o.rf, reg1, stone_col, Buf.FRONT, bias=0.02)
    # shading: fronts get mortar between stones, a lit top row and left column, a dark bottom row
    a, s, t = b.alpha, b.sid, b.tag
    fr = a & (t == Buf.FRONT)
    sd = a & (t == Buf.SIDE)
    up_s, dn_s, lf_s, rt_s = nb(s, -1, 0, -9), nb(s, 1, 0, -9), nb(s, 0, -1, -9), nb(s, 0, 1, -9)
    up_f, dn_f = nb(fr, -1, 0, False), nb(fr, 1, 0, False)
    lf_f = nb(fr, 0, -1, False)
    mortar = fr & ((up_f & (up_s != s)) | (lf_f & (lf_s != s)))
    top_row = fr & ~mortar & (~up_f | (up_s != s) | nb(mortar, -1, 0, False))
    left_col = fr & ~mortar & (~lf_f | (lf_s != s) | nb(mortar, 0, -1, False))
    bot_row = fr & ~mortar & (~dn_f | (dn_s != s))
    b.col[top_row | left_col] = hx(FR["hi"])
    b.col[bot_row] = hx(FR["lo"])
    b.col[mortar] = hx(FR["m"])
    # sides: a top where the stone's front is just below; else an end; a darkest pixel where an end meets the face
    below_front_same = nb(fr, 1, 0, False) & (nb(s, 1, 0, -9) == s)
    tops = sd & below_front_same
    # a top two pixels deep: also a side pixel whose lower neighbour is such a top of the same stone
    tops |= sd & nb(tops, 1, 0, False) & (nb(s, 1, 0, -9) == s)
    ends = sd & ~tops
    b.col[tops] = hx(FR["top"])
    # an end: lit or shaded by the way it faces; on the face's right side the end faces -tangent... use the stone's side
    tn = o.tangent()
    # the end visible on screen-right of a stone faces along the tangent direction that runs to screen-right
    right_dir = tn if (tn[0] - tn[1]) > 0 else (-tn[0], -tn[1])
    ke = ksmall(*right_dir) / max(o.k, 1e-6)
    b.col[ends] = shade_mul(hx(FR["end"]), min(1.15, ke))
    # the face's light over everything
    b.col[a] = shade_mul(b.col[a], o.k)
    outer_outline(b)
    plane = plane_tangent(o, o.rf + o.out * (3 if o.near else 4))
    return b, plane


# ------------------------------------------------------------------ the reveal: the jamb's inner face and the threshold or sill
def stone_course_col(pal_key, U, Z, seed):
    pal = STONE[pal_key]
    u = np.floor(U).astype(int)
    v = np.floor(Z).astype(int)
    row = v // 8
    rv = v % 8
    cut = (hsh(row, seed) % 7) + 5
    seg = (u + row * 3) // np.maximum(cut, 1)
    col = pick(pal["c"], hsh(row, seg, 3) % 3)
    s0 = ((u + row * 3) % np.maximum(cut, 1)) == 0
    col[rv == 1] = hx(pal["hi"])
    col[rv == 7] = hx(pal["lo"])
    col[(rv == 0) | s0] = hx(pal["m"])
    return col


def render_reveal(o):
    b = o.buf()
    drew = None
    for sg in (-1, 1):
        rel = sg * o.phi
        a = o.c + rel
        T = (-math.sin(a), math.cos(a))
        nrm = (-sg * T[0], -sg * T[1])          # the jamb's face looks into the opening
        if nrm[0] + nrm[1] <= 0:
            continue
        g0 = (o.rb * math.cos(a), o.rb * math.sin(a))
        d = (math.cos(a) * o.out, math.sin(a) * o.out)
        g0 = (min(o.rb, o.rf) * math.cos(a), min(o.rb, o.rf) * math.sin(a))
        d = (math.cos(a), math.sin(a))
        L = 2 * T_HALF
        palk = "left" if nrm[1] >= nrm[0] else "right"
        kk = ksmall(*nrm) / (kface(0, 1))

        def reg(S, Z):
            return np.where((Z >= o.floor) & (Z <= o.spring + 0.5), 1, -1)

        def sh(S, Z, sid, palk=palk):
            col = stone_course_col(palk, S + 40, Z, 7)
            return col

        vplane(b, g0, d, L, reg, sh, Buf.FRONT)
        drew = (g0, (g0[0] + d[0] * L, g0[1] + d[1] * L))
    # the floor of the opening: the threshold's top (a door) or the sill's (a window), from face to face
    r0, r1 = min(o.rb, o.rf), max(o.rb, o.rf)

    def regh(X, Y):
        r = np.hypot(X, Y)
        rel = wrap(np.arctan2(Y, X) - o.c)
        return np.where((r >= r0) & (r <= r1) & (np.abs(rel) <= o.phi + 0.5 / o.Rpx), 2, -1)

    def shh(X, Y, sid):
        r = np.hypot(X, Y)
        rel = wrap(np.arctan2(Y, X) - o.c)
        u = np.floor(rel * o.Rpx + 40).astype(int)
        col = pick(SILL_TOP, (u // 7) % 2)
        col[(u % 7) == 0] = hx(SILL_M)
        return col

    hplane(b, o.floor, regh, shh, Buf.FRONT, bias=-0.01)
    # a dark line where the jamb meets the opening (the stone's darkest edge) and the opening's light
    b.col[b.alpha] = shade_mul(b.col[b.alpha], 1.0)
    outer_outline(b, "#3b3734")
    plane = drew if drew else (o.ground(-o.phi, o.rb), o.ground(-o.phi, o.rf))
    return b, plane


# ------------------------------------------------------------------ wood
def plank_face(U, Z, width, strips, z0, seed, inner=False):
    """Vertical planks across U; iron straps (outer) or battens and a brace (inner)."""
    u = np.floor(U + 100).astype(int)
    v = np.floor(Z).astype(int)
    pl = u // width
    col = pick(DOORW["c"], hsh(pl, seed) % 4)
    col[(hsh(pl, v // 3, u) % 9 == 0)] = hx(DOORW["g"])
    col[(u % width) == 0] = hx(DOORW["gap"])
    if not inner:
        for zs in strips:
            band = (v >= z0 + zs) & (v < z0 + zs + 2)
            col[band] = hx(METAL)
            col[band & (v == z0 + zs) & ((u % 5) == 2)] = hx(METAL_HI)
    return col


def wood_post(b, edge_color=OUTLINE):
    pass


def battens(col, U, Z, zs_list, umin, umax, hinge_sign):
    """The inner face: battens across at the strap heights and a brace between (a ledged and braced door's back)."""
    v = np.floor(Z).astype(int)
    for zs in zs_list:
        band = (v >= zs) & (v < zs + 4)
        col[band] = pick(DOORW["batten"], (np.floor(U).astype(int) // 9) % 2)[band]
        col[band & (v == zs + 3)] = hx(DOORW["top"])
        col[band & (v == zs)] = hx(DOORW["bat_lo"])
    if len(zs_list) >= 2:
        z_lo, z_hi = zs_list[0] + 4, zs_list[1]
        # the brace runs up from the hinge side's bottom to the free side's top (it takes the leaf's weight to the hinge)
        f = (np.asarray(U) - umin) / max(1e-6, (umax - umin))
        if hinge_sign < 0:
            f = 1 - f
        zline = z_lo + (1 - f) * (z_hi - z_lo)
        band = (np.abs(Z - zline) < 2.2) & (Z > z_lo) & (Z < z_hi)
        col[band] = hx(DOORW["batten"][0])
        col[band & (np.abs(Z - zline - 1.7) < 0.6)] = hx(DOORW["top"])
        col[band & (np.abs(Z - zline + 1.7) < 0.6)] = hx(DOORW["bat_lo"])
    return col


def ring_pull(col, U, Z, uc, zc):
    """An iron ring pull: a 4 x 5 loop under a small plate."""
    du = np.floor(U - uc).astype(int)
    dz = np.floor(zc - Z).astype(int)          # rows down from the plate
    shape = {(-1, 0): METAL_HI, (0, 0): METAL_HI,
             (-1, 1): METAL, (0, 1): METAL,
             (-2, 2): METAL, (1, 2): METAL, (-1, 2): None, (0, 2): None,
             (-2, 3): METAL, (1, 3): METAL_HI,
             (-1, 4): METAL, (0, 4): METAL}
    for (x, y), cc in shape.items():
        if cc is None:
            continue
        col[(du == x) & (dz == y)] = hx(cc)
    return col


def render_door_shut(o):
    b = o.buf()
    face_r = o.rl_seen            # the leaf's outer surface, or its inner one seen from inside
    tuck = 1.5 / o.Rpx
    rel_max = o.phi + tuck
    ur = face_r
    umax = rel_max * ur
    strips = [9, 48]
    inner = not o.near

    def reg(U, Z, rel):
        top = o.z_int(np.clip(rel, -o.phi, o.phi)) + 1
        return np.where((Z >= 2) & (Z <= top), 1, -1)

    def sh(U, Z, sid):
        col = plank_face(U, Z, 5, strips, 2, 3, inner=inner)
        if inner:
            col = battens(col, U, Z, [11, 44], -umax, umax, +1)
            col = ring_pull(col, U, Z, -umax + 5, 34)
        else:
            col = ring_pull(col, U, Z, -umax + 5, 34)
            # the straps' hinge ends: a knuckle at the +angle side
        return col

    cyl(b, face_r, o.c, o.out, -rel_max, rel_max, ur, reg, sh, Buf.FRONT)
    b.col[b.alpha] = shade_mul(b.col[b.alpha], o.k)
    inner_outline(b)
    plane = plane_tangent(o, o.rl_seen + o.out * 1)
    return b, plane


def render_door_broken(o):
    """What the dead leave of a door: the hinge side's planks torn off jagged, the straps bent loose."""
    b = o.buf()
    face_r = o.rl_seen
    rel_max = o.phi + 1.5 / o.Rpx
    ur = face_r
    umax = rel_max * ur
    width = 5
    inner = not o.near
    # planks from the hinge (+U) side: how high each still stands
    heights = [60, 41, 22, 9, 0]

    def reg(U, Z, rel):
        from_h = umax - U                     # distance from the hinge edge
        k = np.floor(from_h / width).astype(int)
        hh = np.take(np.array(heights + [0] * 10), np.clip(k, 0, 14))
        jag = (hsh(np.floor(U + 50).astype(int), 17) % 7) - 3
        top = np.minimum(hh + jag, o.z_int(np.clip(rel, -o.phi, o.phi)) + 1)
        return np.where((Z >= 2) & (Z <= top) & (hh > 0), 1 + k, -1)

    def sh(U, Z, sid):
        col = plank_face(U, Z, width, [], 2, 3, inner=inner)
        v = np.floor(Z).astype(int)
        if not inner:
            # the bottom strap still nailed on, ending torn
            band = (v >= 11) & (v < 13) & (U > umax - 13)
            col[band] = hx(METAL)
            col[band & (v == 11) & ((np.floor(U).astype(int) % 5) == 2)] = hx(METAL_HI)
        else:
            col = battens(col, U, Z, [11], -umax, umax, +1)
        # fresh splintered wood at the breaks: a lighter row under each torn top
        return col

    cyl(b, face_r, o.c, o.out, -rel_max, rel_max, ur, reg, sh, Buf.FRONT)
    # the splinters: the topmost pixel of each column lighter (fresh wood)
    a = b.alpha
    topmost = a & ~nb(a, -1, 0, False)
    b.col[topmost] = hx("#a07850")
    b.col[a] = shade_mul(b.col[a], o.k)
    outer_outline(b)
    plane = plane_tangent(o, o.rl_seen + o.out * 1)
    return b, plane


def render_door_open(o, hinge=1):
    """The leaf swung out square to the curve from the opening's +angle end (rings.js: o.a1), standing radially.
    hinge=-1: the other end (o.a0), the alternative offered for the east point, where the a1 leaf stands across the doorway."""
    b = o.buf()
    a = o.c + hinge * o.phi
    T = (-math.sin(a), math.cos(a))
    rad = (math.cos(a), math.sin(a))
    r0 = o.Rpx + T_HALF + 0.5
    W = 2 * o.half_clear * o.rl / o.Rpx
    th = 3.0
    T = (hinge * T[0], hinge * T[1])             # +T: away from the doorway
    vis_plus = (T[0] + T[1]) > 0                 # the camera sees the leaf's away-from-the-doorway face
    face_off = th if vis_plus else 0.0
    outer_is_plus = True                        # swung out: the leaf's outer face (straps) now looks along +tangent
    shows_outer = vis_plus == outer_is_plus
    strips = [9, 48]

    def zt(S):
        # the leaf's arched top, carried round with it: at the hinge the springing, the crown mid-leaf
        rel = o.phi - 2 * o.phi * np.clip(S / W, 0, 1)
        return o.z_int(rel) + 1

    def reg(S, Z):
        return np.where((Z >= 2) & (Z <= zt(S)), 1, -1)

    def sh(S, Z, sid):
        U = W - S                                # so the ring pull sits near the free edge
        col = plank_face(U, Z, 5, strips, 2, 3, inner=not shows_outer)
        if not shows_outer:
            col = battens(col, U, Z, [11, 44], 0, W, -1)
        col = ring_pull(col, U, Z, 5, 34)
        return col

    def side_sh(S, Z, sid):
        return np.broadcast_to(hx(DOORW["top"]), (len(S), 3)).copy()

    for off in np.arange(0, th + 0.01, 0.5):
        g0 = (r0 * rad[0] + off * T[0], r0 * rad[1] + off * T[1])
        isf = abs(off - face_off) < 1e-6
        vplane(b, g0, rad, W, reg, sh if isf else side_sh, Buf.FRONT if isf else Buf.SIDE, bias=0.01 if isf else 0)
    a_, s, t = b.alpha, b.sid, b.tag
    fr = a_ & (t == Buf.FRONT)
    sd = a_ & (t == Buf.SIDE)
    tops = sd & (nb(fr, 1, 0, False) | nb(fr, 2, 0, False))
    ends = sd & ~tops
    nface = T if vis_plus else (-T[0], -T[1])
    b.col[fr] = shade_mul(b.col[fr], kface(*nface))
    b.col[tops] = hx(DOORW["top"])
    b.col[ends] = shade_mul(hx(DOORW["c"][0]), ksmall(*rad))
    # hinge knuckles on the jamb side
    outer_outline(b)
    g_a = (r0 * rad[0], r0 * rad[1])
    plane = (g_a, (g_a[0] + rad[0] * W, g_a[1] + rad[1] * W))
    return b, plane


def render_shutters_shut(o):
    b = o.buf()
    face_r = o.rl_seen
    tuck = 1.5 / o.Rpx
    rel_max = o.phi + tuck
    ur = face_r
    umax = rel_max * ur
    inner = not o.near
    z0 = WIN_SILL + 1
    strips = [5, 26]

    def reg(U, Z, rel):
        top = o.z_int(np.clip(rel, -o.phi, o.phi)) + 1
        return np.where((Z >= z0) & (Z <= top), np.where(U < 0, 1, 2), -1)

    def sh(U, Z, sid):
        col = plank_face(U, Z, 4, strips, z0, 5, inner=inner)
        if inner:
            col = battens(col, U, Z, [z0 + 5, z0 + 25], -umax, umax, +1)
        return col

    cyl(b, face_r, o.c, o.out, -rel_max, rel_max, ur, reg, sh, Buf.FRONT)
    b.col[b.alpha] = shade_mul(b.col[b.alpha], o.k)
    inner_outline(b)
    plane = plane_tangent(o, o.rl_seen + o.out * 1)
    return b, plane


def render_shutters_broken(o):
    b = o.buf()
    face_r = o.rl_seen
    rel_max = o.phi + 1.5 / o.Rpx
    ur = face_r
    umax = rel_max * ur
    inner = not o.near
    z0 = WIN_SILL + 1
    # each shutter hangs from its jamb: what is left of it, plank by plank from the hinge
    hl = [[30, 12], [36, 19, 6]]                 # left shutter (hinge at -U), right (hinge at +U)

    def reg(U, Z, rel):
        sid = np.full(U.shape, -1, int)
        for side, hs in ((0, hl[0]), (1, hl[1])):
            dist = (U + umax) if side == 0 else (umax - U)
            k = np.floor(dist / 4).astype(int)
            hh = np.take(np.array(hs + [0] * 14), np.clip(k, 0, 12))
            jag = (hsh(np.floor(U + 50).astype(int), 23 + side) % 5) - 2
            top = np.minimum(z0 + hh + jag, o.z_int(np.clip(rel, -o.phi, o.phi)) + 1)
            m = (Z >= z0) & (Z <= top) & (hh > 0) & ((U < 0) if side == 0 else (U >= 0))
            sid[m] = 1 + side
        return sid

    def sh(U, Z, sid):
        col = plank_face(U, Z, 4, [5], z0, 5, inner=inner)
        if inner:
            col = battens(col, U, Z, [z0 + 5], -umax, umax, +1)
        return col

    cyl(b, face_r, o.c, o.out, -rel_max, rel_max, ur, reg, sh, Buf.FRONT)
    a = b.alpha
    topmost = a & ~nb(a, -1, 0, False)
    b.col[topmost] = hx("#a07850")
    b.col[a] = shade_mul(b.col[a], o.k)
    outer_outline(b)
    plane = plane_tangent(o, o.rl_seen + o.out * 1)
    return b, plane


def render_shutters_open(o):
    """Near points only: the shutters folded back flat on the curve's outer face, either side, over the jamb stones."""
    b = o.buf()
    r = o.rf + 3.5
    ce = o.phi * r
    w = o.phi * o.rl                              # each shutter is half the clear opening wide
    z0 = WIN_SILL + 1
    steps = [0.0, 0.5, 1.0, 1.5]

    def zt(U):
        # folded back, the shutter's free edge (cut to the crown) is now its outer end
        d = (np.abs(U) - ce) / w                   # 0 at the hinge, 1 at the free edge
        rel = o.phi * (1 - np.clip(d, 0, 1))
        return o.z_int(rel) + 1

    def reg(U, Z, rel):
        au = np.abs(U)
        m = (au >= ce + 0.5) & (au <= ce + w + 0.5) & (Z >= z0) & (Z <= zt(U))
        return np.where(m, np.where(U < 0, 1, 2), -1)

    def sh(U, Z, sid):
        col = plank_face(U, Z, 4, [], z0, 5, inner=True)
        col = battens(col, U, Z, [z0 + 5, z0 + 25], -ce - w, ce + w, +1)
        return col

    def side_sh(U, Z, sid):
        return np.broadcast_to(hx(DOORW["top"]), (len(U), 3)).copy()

    rel_max = (ce + w + 2) / r
    for st in steps[::-1]:
        isf = st == steps[-1]
        cyl(b, r - o.out * (steps[-1] - st), o.c, o.out, -rel_max, rel_max, r, reg, sh if isf else side_sh,
            Buf.FRONT if isf else Buf.SIDE, bias=0.01 if isf else 0)
    a, t = b.alpha, b.tag
    fr = a & (t == Buf.FRONT)
    sd = a & (t == Buf.SIDE)
    tops = sd & (nb(fr, 1, 0, False) | nb(fr, 2, 0, False))
    b.col[fr] = shade_mul(b.col[fr], o.k)
    b.col[sd & ~tops] = shade_mul(hx(DOORW["edge"]), 1.0)
    outer_outline(b)
    plane = plane_tangent(o, r + 1)
    return b, plane


# ------------------------------------------------------------------ boards
def render_boards(o, count, side):
    """1 to 3 rough planks nailed across the opening. side 'out': on the ring's outer face; 'in': on its inner face.
    The camera sees the boards on its own face; the other side's show through the hole, their backs to it."""
    b = o.buf()
    seen_side = "out" if o.near else "in"
    on_seen = side == seen_side
    if o.kind == "door":
        zlo, zhi = 0.0, float(DOOR_TOP)
    else:
        zlo, zhi = float(WIN_SILL), float(WIN_TOP)
    span = zhi - zlo
    heights = {1: [0.5], 2: [0.3, 0.7], 3: [0.22, 0.5, 0.78]}[count]
    tilts = [2.5, -2.0, 1.5]
    if side == seen_side:
        D = o.Rpx + o.out * (T_HALF + 5.0)          # straight, clear of the frame's proud stones (the keystone's 3)
        halfL = (o.half_clear + 8) * D / o.Rpx      # over the clear opening and onto the jambs
    else:
        halfL = (o.half_clear + 6) * (o.Rpx - o.out * T_HALF) / o.Rpx
        if side == "in":                            # inside a near point: a chord whose ends rest on the concave inner face
            D = (o.Rpx - T_HALF - 1.0) * math.cos(halfL / (o.Rpx - T_HALF))
        else:                                       # outside a far point: on the convex outer face
            D = o.Rpx + T_HALF + 1.0
    tn = o.tangent()
    rad = (math.cos(o.c), math.sin(o.c))
    centre = (rad[0] * D, rad[1] * D)
    g0 = (centre[0] - tn[0] * halfL, centre[1] - tn[1] * halfL)
    L = 2 * halfL
    # the board's thickness steps toward the wall
    toward_wall = -1 if side == "out" else 1
    vis_front = (rad[0] + rad[1]) * (1 if side == "out" else -1) > 0   # the board's outward face is toward the camera
    th = 2.0
    for kk, f in enumerate(heights):
        zc = zlo + span * f
        tilt = tilts[kk] * (1 if o.point in ("s", "n") else -1)

        def reg(S, Z, zc=zc, tilt=tilt, kk=kk):
            z0 = zc - 2.5 + tilt * (S / L - 0.5)
            return np.where((Z >= z0) & (Z < z0 + 5), 10 + kk, -1)

        def sh(S, Z, sid, zc=zc, tilt=tilt, kk=kk):
            z0 = zc - 2.5 + tilt * (S / L - 0.5)
            v = np.floor(Z - z0).astype(int)
            u = np.floor(S).astype(int)
            if vis_front:
                col = pick(BOARD["c"], np.full(len(S), kk))
                col[(hsh(v, u // 3, kk) % 5 == 0) & (v > 0) & (v < 4)] = hx(BOARD["grain"])
                for un in (3, int(L) - 4):
                    col[(u == un) & (v == 2)] = hx(METAL)
                    col[(u == un) & (v == 1)] = hx("#6a6872")
            else:
                col = pick(BOARD["back"], np.full(len(S), kk))
                col[(hsh(v, u // 4, kk) % 6 == 0) & (v > 0) & (v < 4)] = hx(BOARD["grain"])
                for un in (3, int(L) - 4):
                    col[(u == un) & (v == 2)] = hx("#6a6872")   # the nails' points through the plank
            return col

        def side_sh(S, Z, sid):
            return np.broadcast_to(hx(BOARD["top"]), (len(S), 3)).copy()

        offs = np.arange(0, th + 0.01, 0.5)
        front_off = 0.0 if vis_front else th
        for off in offs:
            gg = (g0[0] + rad[0] * toward_wall * off * (1 if vis_front else 1),
                  g0[1] + rad[1] * toward_wall * off)
            isf = abs(off - front_off) < 1e-6
            vplane(b, gg, tn, L, reg, sh if isf else side_sh, Buf.FRONT if isf else Buf.SIDE,
                   bias=(0.01 if isf else 0) + 0.2 * kk)
    a, t = b.alpha, b.tag
    fr = a & (t == Buf.FRONT)
    sd = a & (t == Buf.SIDE)
    tops = sd & (nb(fr, 1, 0, False) | nb(fr, 2, 0, False))
    b.col[sd & ~tops] = hx(BOARD["edge"])
    nface = (rad[0] * (1 if side == "out" else -1), rad[1] * (1 if side == "out" else -1))
    if not vis_front:
        nface = (-nface[0], -nface[1])
    b.col[fr] = shade_mul(b.col[fr], kface(*nface))
    outer_outline(b)
    plane = ((g0[0], g0[1]), (g0[0] + tn[0] * L, g0[1] + tn[1] * L))
    if not on_seen:
        # the far side's boards, seen through the hole: their own plane, behind the wall's face
        pass
    return b, plane


# ------------------------------------------------------------------ depth planes, as two ground points (world px from the centre)
def plane_tangent(o, r):
    """The vertical plane tangent to the curve at the door point, r from the centre: in front of a convex face all the way."""
    p = (r * math.cos(o.c), r * math.sin(o.c))
    tn = o.tangent()
    return ((p[0] - tn[0] * 16, p[1] - tn[1] * 16), (p[0] + tn[0] * 16, p[1] + tn[1] * 16))


def plane_chord(o, rel, r):
    """The chord at radius r through c - rel and c + rel: in front of a concave face between its ends."""
    return (o.ground(-rel, r), o.ground(rel, r))


def plane_depth(plane, SX, SY):
    (ax, ay), (bx, by) = plane
    d = (bx - ax, by - ay)
    den = d[0] - d[1]
    S = (SX - (ax - ay)) / den
    X = ax + S * d[0]
    Y = ay + S * d[1]
    Z = (X + Y) / 2 - SY
    return X + Y + Z


# ------------------------------------------------------------------ saving
def to_image(b):
    a = b.alpha
    if not a.any():
        return None, None
    ys = np.where(a.any(1))[0]
    xs = np.where(a.any(0))[0]
    y0, y1, x0, x1 = ys.min(), ys.max() + 1, xs.min(), xs.max() + 1
    rgba = np.zeros((y1 - y0, x1 - x0, 4), np.uint8)
    rgba[..., :3] = np.clip(np.round(b.col[y0:y1, x0:x1]), 0, 255).astype(np.uint8)
    rgba[..., 3] = a[y0:y1, x0:x1] * 255
    return Image.fromarray(rgba, "RGBA"), (int(b.x0 + x0), int(b.y0 + y0))


PIECES = []


def save(o, name, b, plane, note, layer):
    im, off = to_image(b)
    if im is None:
        return
    assert set(np.unique(np.array(im)[..., 3])) <= {0, 255}
    d = os.path.join(OUT, f"r{o.n}")
    os.makedirs(d, exist_ok=True)
    fn = f"{o.point}_{o.kind}_{name}.png"
    im.save(os.path.join(d, fn))
    (ax, ay), (bx, by) = plane
    PIECES.append(dict(
        file=f"out/r{o.n}/{fn}", size=o.n, point=o.point, angle=POINTS[o.point], half="near" if o.near else "far",
        seen_face="outer" if o.near else "inner", kind=o.kind, piece=name, offset=list(off), anchor_px=[-off[0], -off[1]],
        w=im.width, h=im.height,
        depth_plane=[[round(ax / 32, 4), round(ay / 32, 4)], [round(bx / 32, 4), round(by / 32, 4)]],
        layer=layer, depth_note=note, fades_with_near_half=o.near))


def build():
    for n in (5, 7):
        for point in ("n", "e", "s", "w"):
            for kind in ("door", "window"):
                o = Opening(n, point, kind)
                side_seen = "out" if o.near else "in"
                b, p = render_reveal(o)
                save(o, "reveal", b, p, "the jamb's own radial plane (the reveal it shows); the opening's floor rides with it", 0)
                b, p = render_frame(o)
                save(o, "frame", b, p, ("tangent to the curve at the door point, 3 px outside the outer face (in front of the convex face all along the frame)" if o.near else
                                        "tangent to the curve at the door point, 4 px inside the inner face (in front of the concave face out to the frame's ends)"), 3)
                if kind == "door":
                    b, p = render_door_shut(o)
                    save(o, "shut", b, p, "tangent at the door point, 1 px in front of the leaf (the leaf sits 2 px in from the face seen)", 1)
                    b, p = render_door_broken(o)
                    save(o, "broken", b, p, "as the shut leaf", 1)
                    b, p = render_door_open(o)
                    save(o, "open", b, p, "the leaf's own radial plane, hinge to free edge (rings.js's swung leaf, hinged at a1)", 2)
                    b, p = render_door_open(o, -1)
                    save(o, "open_a0", b, p, "the leaf's own radial plane; the alternative hinge, at a0 (the opening's other end)", 2)
                else:
                    b, p = render_shutters_shut(o)
                    save(o, "shut", b, p, "tangent at the door point, 1 px in front of the shutters (2 px in from the face seen)", 1)
                    b, p = render_shutters_broken(o)
                    save(o, "broken", b, p, "as the shut shutters", 1)
                    if o.near:
                        b, p = render_shutters_open(o)
                        save(o, "open", b, p, "tangent at the door point, 4.5 px outside the outer face (over the frame)", 4)
                for side in ("out", "in"):
                    for cnt in (1, 2, 3):
                        b, p = render_boards(o, cnt, side)
                        nm = f"boards_{side}_{cnt}"
                        note = ("the boards' own straight plane, " + ("5 px off the face seen, clear of the frame" if side == side_seen else
                                "on the far face") + ("" if side == side_seen else "; seen through the hole, behind the wall"))
                        save(o, nm, b, p, note, 5)


# ------------------------------------------------------------------ the preview: rings.js mimicked
FACE_IMG = None
FLOOR_IMGS = None


def load_ref():
    global FACE_IMG, FLOOR_IMGS
    FACE_IMG = np.array(Image.open(f"{REPO}/data/art/village/wall_stone_north_plain.png").convert("RGBA")).astype(np.float64)
    FLOOR_IMGS = [Image.open(f"{REPO}/data/art/village/floor_stone_{i}.png").convert("RGBA") for i in range(4)]


def floor_end(n):
    K = 192
    k = (n - 1) / 2
    R = n / 2
    inside = lambda x, y: (x - k) ** 2 + (y - k) ** 2 < R * R
    raw = np.zeros(K)
    for j in range(K):
        a = j / K * TAU
        r = 0.0
        while r < R + 1 and inside(math.floor(k + r * math.cos(a) + 0.5), math.floor(k + r * math.sin(a) + 0.5)):
            r += 0.005
        raw[j] = r
    w = math.ceil((0.5 / (R - 0.7)) / (TAU / K))
    return np.array([min(raw[(j + d) % K] for d in range(-w, w + 1)) for j in range(K)])


def figure_sprite():
    """A 55 px villager for scale (dev art, not a delivery): hair, face, tunic, belt, legs, boots, outlined."""
    W, H = 26, 55
    g = np.zeros((H, W, 4), np.uint8)
    def fill(mask, c):
        g[mask, :3] = hx(c).astype(np.uint8)
        g[mask, 3] = 255
    yy, xx = np.mgrid[0:H, 0:W]
    cx = 12.5
    head = ((xx - cx) / 5.2) ** 2 + ((yy - 7.5) / 6.2) ** 2 <= 1
    fill(head, "#e0b48a")
    hair = head & ((yy < 5) | ((xx < cx - 3) & (yy < 10)))
    fill(hair, "#5a3a22")
    fill((yy == 8) & ((xx == 11) | (xx == 15)), "#2b2522")
    neck = (yy >= 13) & (yy < 15) & (np.abs(xx - cx) < 2)
    fill(neck, "#c99a72")
    torso = (yy >= 15) & (yy < 36) & (np.abs(xx - cx) <= 6 + (yy - 15) * 0.12)
    fill(torso, "#5f7a4c")
    fill(torso & (xx < cx - 2), "#6d8a58")
    arms = (yy >= 16) & (yy < 33) & ((np.abs(xx - (cx - 9)) < 2) | (np.abs(xx - (cx + 9)) < 2))
    fill(arms, "#556e44")
    hands = (yy >= 33) & (yy < 36) & ((np.abs(xx - (cx - 9)) < 2) | (np.abs(xx - (cx + 9)) < 2))
    fill(hands, "#e0b48a")
    belt = (yy >= 30) & (yy < 32) & torso
    fill(belt, "#43301f")
    legs = (yy >= 36) & (yy < 50) & ((np.abs(xx - (cx - 3)) < 2.6) | (np.abs(xx - (cx + 3)) < 2.6))
    fill(legs, "#4a4458")
    boots = (yy >= 50) & (yy < 54) & ((np.abs(xx - (cx - 3)) < 3) | (np.abs(xx - (cx + 3.5)) < 3))
    fill(boots, "#3a2a1c")
    a = g[..., 3] > 0
    p = np.pad(a, 1)
    ring = (p[:-2, 1:-1] | p[2:, 1:-1] | p[1:-1, :-2] | p[1:-1, 2:]) & ~a
    g[ring, :3] = hx("#1a1420").astype(np.uint8)
    g[ring, 3] = 255
    return g   # feet at row 54, centre column 12


FIG = None


class Scene:
    """One ring drawn as rings.js draws it, with the delivered pieces composited by their stated planes."""

    def __init__(self, n, states, inside=False, figure=None, pad=(70, 150, 50)):
        self.n, self.states, self.inside, self.figure = n, states, inside, figure
        Rpx = 16 * n
        ext = (Rpx + 8) * math.sqrt(2)
        self.x0 = int(-ext - pad[0])
        self.y0 = int(-ext / 2 - pad[1])
        self.w = int(2 * ext + 2 * pad[0])
        self.h = int(ext + pad[1] + pad[2])
        xs = self.x0 + np.arange(self.w) + 0.5
        ys = self.y0 + np.arange(self.h) + 0.5
        self.SX, self.SY = np.meshgrid(xs, ys)
        self.col = np.zeros((self.h, self.w, 3))
        self.dep = np.full((self.h, self.w), -np.inf)
        self.tcol = np.zeros((self.h, self.w, 3))
        self.tdep = np.full((self.h, self.w), -np.inf)
        self.talpha = np.zeros((self.h, self.w))

    def put(self, m, dep, col, alpha=1.0):
        if alpha >= 1:
            better = m & (dep > self.dep)
            self.dep[better] = dep[better]
            self.col[better] = (col[better] if np.ndim(col) == 3 else col)
        else:
            better = m & (dep > self.tdep)
            self.tdep[better] = dep[better]
            self.tcol[better] = (col[better] if np.ndim(col) == 3 else col)
            self.talpha[better] = alpha

    def ground(self):
        n = self.n
        k = (n - 1) / 2
        R = n / 2
        img = Image.new("RGBA", (self.w, self.h), (75, 95, 61, 255))
        arr = np.array(img).astype(np.float64)
        # grass specks, hashed in pixel space (a baked ground, nothing by tile parity)
        hh = hsh(np.floor(self.SX).astype(int), np.floor(self.SY).astype(int), 7) % 23
        arr[hh == 0, :3] = hx("#586e44")
        arr[hh == 1, :3] = hx("#405434")
        img = Image.fromarray(arr.astype(np.uint8), "RGBA")
        for ty in range(n):
            for tx in range(n):
                if (tx - k) ** 2 + (ty - k) ** 2 < R * R:
                    gx, gy = (tx - k) * 32, (ty - k) * 32
                    sx, sy = gx - gy, (gx + gy) / 2
                    fi = FLOOR_IMGS[int(hsh(tx, ty, 1)) % 4]
                    img.alpha_composite(fi, (int(sx - 32 - self.x0), int(sy - 16 - self.y0)))
        dr = ImageDraw.Draw(img)
        # the inside skirt (rings.js emitSkirt)
        ends = floor_end(n)
        K = 192
        t = 0.25
        inner = R - t
        rIn = lambda j: min(ends[j % K] - 0.04, inner - 0.08)
        def at(j, rad):
            a = j / K * TAU
            gx, gy = math.cos(a) * rad * 32, math.sin(a) * rad * 32
            return (gx - gy - self.x0, (gx + gy) / 2 - self.y0)
        c1 = tuple(int(v) for v in np.round(shade_mul(hx("#7b7670"), 0.86)))
        c2 = tuple(int(v) for v in np.round(shade_mul(hx("#7b7670"), 0.48)))
        for j in range(K):
            dr.polygon([at(j, rIn(j)), at(j + 1, rIn(j + 1)), at(j + 1, inner + 0.04), at(j, inner + 0.04)], fill=c1)
        for j in range(K):
            dr.polygon([at(j, rIn(j)), at(j + 1, rIn(j + 1)), at(j + 1, rIn(j + 1) + 0.03), at(j, rIn(j) + 0.03)], fill=c2)
        self.col = np.array(img)[..., :3].astype(np.float64)

    def ring(self):
        n = self.n
        Rpx = 16.0 * n
        t = T_HALF
        theta = math.atan(1.0 / n)
        openings = []
        for p, (kind, *_rest) in self.states.items():
            if kind is None:
                continue
            c = math.radians(POINTS[p])
            for base in (c, c + TAU):
                openings.append((base - theta, base + theta, kind))
        span = 32 * (Rpx / 32 - t / 32) * math.sqrt(2)
        for near in (False, True):
            out = 1 if near else -1
            Rf = Rpx + out * t
            for i in range(48):
                a0 = math.radians(i * 7.5)
                a1 = math.radians((i + 1) * 7.5)
                if (math.cos((a0 + a1) / 2) + math.sin((a0 + a1) / 2) > 0) != near:
                    continue
                cuts = [a0, a1]
                for (o0, o1, kd) in openings:
                    for v in (o0, o1):
                        if a0 + 1e-6 < v < a1 - 1e-6:
                            cuts.append(v)
                cuts.sort()
                for j in range(len(cuts) - 1):
                    s0, s1 = cuts[j], cuts[j + 1]
                    mid = (s0 + s1) / 2
                    op = next((x for x in openings if x[0] < mid < x[1]), None)
                    self.segment(s0, s1, Rf, Rpx, near, op, span, mid)

    def segment(self, a0, a1, Rf, Rpx, near, op, span, amid):
        t = T_HALF
        g0 = (Rf * math.cos(a0), Rf * math.sin(a0))
        g1 = (Rf * math.cos(a1), Rf * math.sin(a1))
        A = (g0[0] - g0[1], (g0[0] + g0[1]) / 2)
        B = (g1[0] - g1[1], (g1[0] + g1[1]) / 2)
        if B[0] < A[0]:
            A, B = B, A
        dxOf = lambda a: Rf * (math.cos(a) - math.sin(a))
        fades = near and self.inside and min(abs(dxOf(a0)), abs(dxOf(a1))) < span
        alpha = 0.42 if fades else 1.0
        look = amid if near else amid + math.pi
        k = 1 - 0.18 * (1 - math.cos(look - math.pi / 2))
        # the band: the vertical plane through the segment's two points
        d = (g1[0] - g0[0], g1[1] - g0[1])
        L = math.hypot(*d)
        du = (d[0] / L, d[1] / L)
        den = du[0] - du[1]
        S = (self.SX - (g0[0] - g0[1])) / den
        X = g0[0] + S * du[0]
        Y = g0[1] + S * du[1]
        Z = (X + Y) / 2 - self.SY
        m = (S >= 0) & (S < L)
        hole = None
        if op is not None:
            hole = (0, DOOR_TOP) if op[2] == "door" else (WIN_SILL, WIN_TOP)
        mz = m & (Z >= 0) & (Z < H_WALL)
        if hole:
            mz &= ~((Z >= hole[0]) & (Z < hole[1]))
        # the texture: north_plain's columns, as rings.js's foot()
        w = min(24, B[0] - A[0])
        room = math.floor(24 - w)
        c0 = 4 + ((round(math.degrees(amid)) * 7) % (room + 1) if room > 0 else 0)
        f = (self.SX - A[0]) / max(1e-6, (B[0] - A[0]))
        colf = c0 + f * w
        rowf = 104 + colf / 2 - Z
        ci = np.clip(np.floor(colf).astype(int), 0, FACE_IMG.shape[1] - 1)
        ri = np.clip(np.floor(rowf).astype(int), 0, FACE_IMG.shape[0] - 1)
        tex = FACE_IMG[ri, ci, :3] * k
        self.put(mz, X + Y + Z, tex, alpha)
        # the cap: between the faces at the wall's height, flat, on the sky
        h = H_WALL
        Xc = (self.SX + 2 * (self.SY + h)) / 2
        Yc = (2 * (self.SY + h) - self.SX) / 2
        rr = np.hypot(Xc, Yc)
        ang = np.arctan2(Yc, Xc) % TAU
        lo, hi = a0 % TAU, a1 % TAU
        inseg = (ang >= lo) & (ang < hi) if lo < hi else ((ang >= lo) | (ang < hi))
        mc = inseg & (rr >= Rpx - t) & (rr <= Rpx + t)
        capc = shade_mul(hx("#7b7670"), 1.18)
        self.put(mc, Xc + Yc + h, np.broadcast_to(capc, self.col.shape), alpha)

    def pieces(self, by_key):
        for p, st in self.states.items():
            kind = st[0]
            if kind is None:
                continue
            names = st[1]
            o = Opening(self.n, p, kind)
            fade = self.inside and o.near
            for nm in names:
                rec = by_key.get((self.n, p, kind, nm))
                if rec is None:
                    continue
                im = np.array(Image.open(os.path.join(HERE, rec["file"]))).astype(np.float64)
                ox, oy = rec["offset"]
                hh, ww = im.shape[:2]
                xs0 = ox - self.x0
                ys0 = oy - self.y0
                m = np.zeros((self.h, self.w), bool)
                col = np.zeros((self.h, self.w, 3))
                sub = im[..., 3] > 0
                m[ys0:ys0 + hh, xs0:xs0 + ww] = sub
                col[ys0:ys0 + hh, xs0:xs0 + ww] = im[..., :3]
                pl = [(v[0] * 32, v[1] * 32) for v in rec["depth_plane"]]
                dep = plane_depth(pl, self.SX, self.SY) + 0.05 * rec["layer"]
                self.put(m, dep, col, 0.42 if fade else 1.0)

    def draw_figure(self, gx, gy):
        X, Y = gx * 32, gy * 32
        sx, sy = X - Y, (X + Y) / 2
        fx = int(round(sx)) - 12 - self.x0
        fy = int(round(sy)) - 54 - self.y0
        hh, ww = FIG.shape[:2]
        m = np.zeros((self.h, self.w), bool)
        col = np.zeros((self.h, self.w, 3))
        m[fy:fy + hh, fx:fx + ww] = FIG[..., 3] > 0
        col[fy:fy + hh, fx:fx + ww] = FIG[..., :3]
        dep = X + Y + (sy - self.SY)          # a billboard through its foot
        self.put(m, dep, col)

    def render(self, by_key):
        self.ground()
        self.ring()
        self.pieces(by_key)
        if self.figure:
            self.draw_figure(*self.figure)
        out = self.col.copy()
        m = self.tdep > self.dep
        a = self.talpha[..., None]
        out[m] = out[m] * (1 - a[m]) + self.tcol[m] * a[m]
        return Image.fromarray(np.clip(np.round(out), 0, 255).astype(np.uint8), "RGB")


def label(img, text, xy, fill=(235, 228, 210)):
    ImageDraw.Draw(img).text(xy, text, fill=fill)


def preview():
    global FIG
    load_ref()
    FIG = figure_sprite()
    by_key = {(p["size"], p["point"], p["kind"], p["piece"]): p for p in PIECES}
    D = ["reveal", "frame"]
    # the two rings' openings, chosen to show every kind at once
    s5 = {"s": ("door", D + ["shut"]), "e": ("window", D + ["open"]), "n": ("door", D + ["open"]),
          "w": ("window", D + ["shut", "boards_in_2"])}
    s7 = {"s": ("door", D + ["open"]), "e": ("door", D + ["broken", "boards_out_2"]), "n": ("window", D + ["shut"]),
          "w": ("door", D + ["shut"])}
    R5, R7 = 2.5, 3.5
    shots = [
        ("5 across, outside", Scene(5, s5, False, (0.7, 3.2)).render(by_key)),
        ("7 across, outside", Scene(7, s7, False, (0.0, 3.45)).render(by_key)),
        ("5 across, inside (near half 0.42)", Scene(5, s5, True, (0.2, -1.3)).render(by_key)),
        ("7 across, inside (near half 0.42)", Scene(7, s7, True, (-0.6, -1.4)).render(by_key)),
    ]
    # layout: row 1 at 1x, then each at 3x
    gap = 16
    W1 = sum(im.width for _, im in shots) + gap * 5
    H1 = max(im.height for _, im in shots) + 30
    big = [(t, im.resize((im.width * 3, im.height * 3), Image.NEAREST)) for t, im in shots]
    W3 = max(big[0][1].width + big[1][1].width, big[2][1].width + big[3][1].width) + gap * 3
    H3 = max(big[0][1].height, big[1][1].height) + max(big[2][1].height, big[3][1].height) + 70
    W = max(W1, W3)
    sheet = Image.new("RGB", (W, H1 + H3 + 20), (34, 30, 28))
    x = gap
    for t, im in shots:
        sheet.paste(im, (x, 24))
        label(sheet, t + " (1x)", (x, 6))
        x += im.width + gap
    y = H1 + 20
    x = gap
    for i, (t, im) in enumerate(big):
        if i == 2:
            y += max(big[0][1].height, big[1][1].height) + 34
            x = gap
        sheet.paste(im, (x, y + 18))
        label(sheet, t + " (3x)", (x, y))
        x += im.width + gap
    sheet.save(os.path.join(HERE, "preview.png"))
    # every state at every point, close up at 3x, from outside (and the far points' openings are seen from inside the same)
    for n in (5, 7):
        rows = []
        for point in ("e", "s", "n", "w"):
            o = Opening(n, point, "door")
            states = [("door shut", "door", D + ["shut"]), ("door open", "door", D + ["open"]), ("door broken", "door", D + ["broken"]),
                      ("door boards out 3", "door", D + ["shut", "boards_out_3"]), ("door open, boards in 2", "door", D + ["boards_in_2"]),
                      ("window shut", "window", D + ["shut"]), ("window open", "window", D + (["open"] if o.near else [])),
                      ("window broken", "window", D + ["broken"]), ("window boards out 2", "window", D + ["boards_out_2"]),
                      ("window boards in 3", "window", D + ["shut", "boards_in_3"])]
            cells = []
            for tname, kind, names in states:
                sc = Scene(n, {point: (kind, names)}, inside=False, figure=None)
                im = sc.render(by_key)
                cx = int(o.px - sc.x0)
                cy = int(o.py - sc.y0)
                crop = im.crop((cx - 46, cy - 92, cx + 46, cy + 22))
                cells.append((tname, crop.resize((crop.width * 3, crop.height * 3), Image.NEAREST)))
            rows.append((point, cells))
        cw, ch = cells[0][1].size
        sheet = Image.new("RGB", (len(cells) * (cw + 8) + 60, len(rows) * (ch + 22) + 10), (34, 30, 28))
        for r, (point, cells) in enumerate(rows):
            y = 10 + r * (ch + 22)
            label(sheet, point.upper(), (10, y + ch // 2))
            for c, (tname, im) in enumerate(cells):
                x = 50 + c * (cw + 8)
                label(sheet, tname, (x, y))
                sheet.paste(im, (x, y + 12))
        sheet.save(os.path.join(HERE, f"preview_states_{n}.png"))


if __name__ == "__main__":
    build()
    with open(os.path.join(HERE, "manifest.json"), "w") as f:
        json.dump(dict(
            note=("Round stone wall openings (docs/50), art round 9. offset: the PNG's top-left in screen px from the ring's centre on "
                  "the ground (the centre tile's centre, iso.toScreen(cx, cy)); anchor_px is the same point inside the PNG. "
                  "depth_plane: two ground points in tiles from the ring's centre, for depth.planeThrough(cx + x0, cy + y0, cx + x1, cy + y1). "
                  "layer: the order within the half's drawable when two pieces tie (reveal 0, leaf 1, open leaf 2, frame 3, open shutters 4, boards 5). "
                  "Points: n 270, e 0, s 90, w 180 degrees (rings.js DOOR_ANGLES); e and s on the near half (outer face seen), n and w on the far "
                  "half (inner face seen)."),
            pieces=PIECES), f, indent=1)
    preview()
    print(len(PIECES), "pieces")
