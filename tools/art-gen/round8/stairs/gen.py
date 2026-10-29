"""Art round 8: the stairs (docs/49 section 4). A straight run of three tiles climbing one storey (96 px),
in wood (closed stringers over spandrel panels, open under the run, twelve treads) and in stone (solid,
squared blocks, stepped cheek walls), each drawn natively in all four directions.

Written fresh for this round (2026-10-27); the method is round 5's furniture generator (a small z-buffered
face rasteriser shading every pixel from its world point), rewritten here, nothing imported.

World units: X and Y along the ground (a tile is 32 x 32), Z height in screen pixels.
    screen x = X - Y,   screen y = (X + Y) / 2 - Z,   depth toward the camera = X + Y + Z
+X runs to the screen's lower right (shade), +Y to the lower left (lit), tops lightest.

Every stair is built in its own frame (u, v, z): u along the run from its low edge (0) to its high edge
(96, three tiles), v across it (0 .. 32, v = 32 the side the camera sees), z up. A direction maps the frame
into the world so that the LOW-END tile is X 0..32, Y 0..32 and world (0, 0, 0), that tile's top vertex at
ground level, is the anchor (anchorVertex "top"):
    n  climbs toward -Y (up-right on screen, away):   X = v,       Y = 32 - u
    w  climbs toward -X (up-left on screen, away):    X = 32 - u,  Y = v       (n mirrored)
    s  climbs toward +Y (down-left, toward the camera): X = v,     Y = u
    e  climbs toward +X (down-right, toward the camera): X = u,    Y = v       (s mirrored)

The treads: twelve, 8 px risers, four to a tile, laid so tread k (1..12) stands at 8k and is centred on
u = 8k (t = k/4 tiles along the run), its riser at u = 8k - 4: the engine's linear rise (32 px a tile,
map.stairStep) is exactly the tread's height at each tread's centre and never more than 4 px off it; the
crate heights 32 and 64 fall on treads 4 and 8 at the tile boundaries; tread 12 (96) is the last 4 units of
the third tile, flush with the landing.

Run with plain `python gen.py`; writes out/, manifest.json, preview.png. Deterministic (no randomness).
"""
import json, math, os
import numpy as np
from PIL import Image, ImageDraw

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "out")
REPO = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", "..", ".."))  # the repo root: tools/art-gen/roundN/name/   # read only
os.makedirs(OUT, exist_ok=True)

OUTLINE = "#2b2522"
DIRS = ("n", "w", "s", "e")
RISE, TREADS, RUN = 8, 12, 96


def hx(s):
    s = s.lstrip("#")
    return np.array([int(s[i:i + 2], 16) for i in (0, 2, 4)], np.uint8)


def P2S(P):
    P = np.asarray(P, float)
    return np.stack([P[..., 0] - P[..., 1], (P[..., 0] + P[..., 1]) / 2 - P[..., 2]], -1)


def noise(*v):
    """a deterministic hash of integer arrays, 0..65535"""
    h = np.full(np.broadcast(*[np.asarray(a) for a in v]).shape, 0x3C6EF372, np.int64)
    for i, a in enumerate(v):
        a = np.asarray(a).astype(np.int64)
        h = (h ^ (a * (0x27D4EB2F + 2 * i) + 0x165667B1 * (i + 1))) & 0xFFFFFFFF
        h = (h * 0x2C1B3C6D) & 0xFFFFFFFF
        h ^= h >> 15
    return h & 0xFFFF


# ======================================================================== the frame and the directions
def to_world(d, u, v, z):
    u, v, z = np.asarray(u, float), np.asarray(v, float), np.asarray(z, float)
    if d == "n":
        return np.stack([v, 32 - u, z], -1)
    if d == "w":
        return np.stack([32 - u, v, z], -1)
    if d == "s":
        return np.stack([v, u, z], -1)
    return np.stack([u, v, z], -1)


def to_frame(d, P):
    X, Y, Z = P[:, 0], P[:, 1], P[:, 2]
    if d == "n":
        return 32 - Y, X, Z
    if d == "w":
        return 32 - X, Y, Z
    if d == "s":
        return Y, X, Z
    return X, Y, Z


# ======================================================================== the rasteriser
class World:
    def __init__(self, d):
        self.d = d
        self.faces = []

    def face(self, uvz, part, bias=0.0, info=None):
        """a planar polygon given in the stair's frame; shaded by `part` with the face's kind (by its world normal)"""
        pts = to_world(self.d, *np.array(uvz, float).T)
        self.faces.append((pts, part, bias, info or {}))

    def box(self, u0, u1, v0, v1, z0, z1, part, bias=0.0, info=None):
        """an axis-aligned box in the frame: all six faces (the z-buffer keeps the ones in front)"""
        c = [(u0, v0), (u1, v0), (u1, v1), (u0, v1)]
        self.face([(a, b, z1) for a, b in c], part, bias, dict(info or {}, n="top"))
        self.face([(a, b, z0) for a, b in c], part, bias, dict(info or {}, n="bottom"))
        for (a0, b0), (a1, b1), nm in (((u0, v0), (u1, v0), "v-"), ((u1, v0), (u1, v1), "u+"),
                                        ((u1, v1), (u0, v1), "v+"), ((u0, v1), (u0, v0), "u-")):
            self.face([(a0, b0, z0), (a1, b1, z0), (a1, b1, z1), (a0, b0, z1)], part, bias, dict(info or {}, n=nm))

    def prism(self, poly_uz, v0, v1, part, bias=0.0, info=None):
        """a polygon in the (u, z) plane extruded across v from v0 to v1: its two caps and its sides"""
        self.face([(u, v0, z) for u, z in poly_uz], part, bias, dict(info or {}, n="v-"))
        self.face([(u, v1, z) for u, z in poly_uz], part, bias, dict(info or {}, n="v+"))
        m = len(poly_uz)
        for i in range(m):
            (ua, za), (ub, zb) = poly_uz[i], poly_uz[(i + 1) % m]
            nm = "slope" if (ua != ub and za != zb) else ("top" if za == zb and ub < ua else "bottom" if za == zb else "u")
            self.face([(ua, v0, za), (ub, v0, zb), (ub, v1, zb), (ua, v1, za)], part, bias, dict(info or {}, n=nm, edge=((ua, za), (ub, zb))))

    def draw(self, shader, pad=3):
        allp = P2S(np.concatenate([f[0] for f in self.faces]))
        lo = np.floor(allp.min(0)) - pad
        hi = np.ceil(allp.max(0)) + pad
        W, H = int(hi[0] - lo[0]), int(hi[1] - lo[1])
        col = np.zeros((H, W, 3), np.uint8)
        zb = np.full((H, W), -1e9)
        part = np.zeros((H, W), object)
        hgt = np.zeros((H, W))
        for pts, pt, bias, info in self.faces:
            sp = P2S(pts) - lo
            m = Image.new("1", (W, H), 0)
            ImageDraw.Draw(m).polygon([tuple(p) for p in sp], fill=1)
            ys, xs = np.nonzero(np.array(m, bool))
            if not len(xs):
                continue
            O, A, B = pts[0], pts[1] - pts[0], pts[-1] - pts[0]
            a2, b2 = P2S(A), P2S(B)
            M = np.array([[a2[0], b2[0]], [a2[1], b2[1]]])
            if abs(np.linalg.det(M)) < 1e-6:
                continue                                    # edge-on to the camera: never seen
            o2 = P2S(O) - lo
            st = np.linalg.solve(M, np.stack([xs + 0.5 - o2[0], ys + 0.5 - o2[1]]))
            P = O[None] + st[0][:, None] * A[None] + st[1][:, None] * B[None]
            P = np.clip(P, pts.min(0) - 0.5, pts.max(0) + 0.5)
            dep = P.sum(1) + bias
            ok = dep > zb[ys, xs]
            if not ok.any():
                continue
            ys, xs, P, dep = ys[ok], xs[ok], P[ok], dep[ok]
            n = np.cross(pts[1] - pts[0], pts[-1] - pts[0])
            n = n / (np.linalg.norm(n) + 1e-9)
            if n @ np.array([1, 1, 1]) < 0:
                n = -n                                      # the side the camera sees
            u, v, z = to_frame(self.d, P)
            col[ys, xs] = shader(pt, kind_of(n), u, v, z, info)
            zb[ys, xs] = dep
            part[ys, xs] = pt
            hgt[ys, xs] = z
        return Pic(col, zb > -1e8, -lo, zb, part, hgt)


def kind_of(n):
    """the face's light by its (camera-side) world normal: top, lit (+Y), shade (+X)"""
    if n[2] > 0.35:
        return "top"
    if n[1] >= n[0]:
        return "lit"
    return "shade"


class Pic:
    def __init__(self, col, alpha, origin, zb, part, hgt):
        self.col, self.alpha, self.origin, self.zb, self.part, self.hgt = col, alpha, np.array(origin, float), zb, part, hgt

    def ring(self):
        p = np.pad(self.alpha, 1)
        return (p[:-2, 1:-1] | p[2:, 1:-1] | p[1:-1, :-2] | p[1:-1, 2:]) & ~self.alpha

    def outline(self, c=OUTLINE):
        r = self.ring()
        self.col[r] = hx(c)
        # the outline takes the depth of the nearest neighbour it rings, so a depth map stays whole
        z = self.zb.copy()
        zp = np.pad(z, 1, constant_values=-1e9)
        nb = np.maximum.reduce([zp[:-2, 1:-1], zp[2:, 1:-1], zp[1:-1, :-2], zp[1:-1, 2:]])
        self.zb[r] = nb[r]
        self.alpha = self.alpha | r
        return self

    def box(self):
        a = self.alpha
        ys = np.where(a.any(1))[0]
        xs = np.where(a.any(0))[0]
        return ys.min(), ys.max() + 1, xs.min(), xs.max() + 1

    def crop(self):
        y0, y1, x0, x1 = self.box()
        self.col, self.alpha, self.zb = self.col[y0:y1, x0:x1], self.alpha[y0:y1, x0:x1], self.zb[y0:y1, x0:x1]
        self.part, self.hgt = self.part[y0:y1, x0:x1], self.hgt[y0:y1, x0:x1]
        self.origin = self.origin - (x0, y0)
        return self

    def image(self):
        rgba = np.zeros(self.col.shape[:2] + (4,), np.uint8)
        rgba[..., :3] = self.col
        rgba[..., 3] = self.alpha * 255
        return Image.fromarray(rgba, "RGBA")

    def anchor(self):
        return [int(round(self.origin[0])), int(round(self.origin[1]))]


# ======================================================================== palettes
# treads: the furniture wood (docs/art/06) - tops, the lit +Y faces, the shaded +X faces
TREAD_TOP = ("#7d5a3c", "#77553a")
TREAD_NOSE = "#93704c"           # the worn front edge of each tread, its lightest line
TREAD_GRAIN = "#6c4b30"
TREAD_EDGE = {"lit": "#77553a", "shade": "#5a3d25", "top": "#93704c"}
RISER = {"lit": ("#5e4028", "#5a3d25"), "shade": ("#432d1b", "#3e2a19"), "top": ("#5e4028", "#5a3d25")}
RISER_SHADOW = {"lit": "#3a2716", "shade": "#2c1d12", "top": "#3a2716"}
# the frame (stringers, posts, header): the wood wall's tones (wall_wood_*), a little darker than the treads
FRAME = {"top": "#8c6646", "lit": "#724f33", "shade": "#523926"}
FRAME_HI = {"top": "#9a7450", "lit": "#8c6646", "shade": "#664630"}
FRAME_DK = {"top": "#724f33", "lit": "#4c3523", "shade": "#3c2a1b"}
PANEL = {"lit": ("#664630", "#5e402a"), "shade": ("#4c3523", "#422d1e"), "top": ("#664630", "#5e402a")}
PANEL_GAP = {"lit": "#3c2a1b", "shade": "#271a11", "top": "#3c2a1b"}
INNER = {"lit": "#2c1d12", "shade": "#271a11", "top": "#3a2716"}
IRON = "#2b2a32"
ENDGRAIN = {"top": "#93704c", "lit": "#93704c", "shade": "#6c4b30"}
# stone: the stone wall's and the stone floor's tones (wall_stone_*, floor_stone_*)
ST_TOP = ("#a19b92", "#99938b", "#938d85")
ST_LIT = ("#857f78", "#7b7670", "#75706a")
ST_SHADE = ("#605b56", "#585350", "#534e4a")
ST_MORTAR = {"top": "#6b6661", "lit": "#4b4743", "shade": "#3b3734"}
ST_NOSE = {"top": "#b0a697", "lit": "#99938b", "shade": "#6b6661"}
ST_CAP = {"top": ("#a19b92", "#99938b"), "lit": ("#938d85", "#857f78"), "shade": ("#6b6660", "#605b56")}


def pick(tones, idx):
    t = np.stack([hx(c) for c in tones])
    return t[np.asarray(idx) % len(tones)]


def fill(c, n):
    return np.broadcast_to(hx(c), (n, 3)).copy()


# ======================================================================== the wood stair
STR_TOP = 7          # the stringer's top edge sits this far above u (the nosings run on z = u + 5.5)
STR_DEPTH = 12       # how deep the stringer board is, perpendicular-ish (measured in z)


def str_top(u):
    return np.minimum(np.asarray(u, float) + STR_TOP, 99.0)


def wood_shader(part, kind, u, v, z, info):
    n = len(u)
    if part == "tread":
        k = info["k"]
        if kind == "top":
            out = fill(TREAD_TOP[k % 2], n)
            g = (noise(np.floor(v / 3), np.floor(u * 1.0), k) % 9 == 0)
            out[g] = hx(TREAD_GRAIN)
            front = info["front"]
            out[u < front + 1.0] = hx(TREAD_NOSE)
            # two nail heads near the ends, a pixel each, set back from the nose
            nail = (np.abs(u - (front + 3.2)) < 0.8) & ((np.abs(v - 6.0) < 1.0) | (np.abs(v - 26.0) < 1.0))
            out[nail] = hx("#3a2716")
            return out
        return fill(TREAD_EDGE[kind], n)
    if part == "riser":
        k = info["k"]
        out = pick(RISER[kind], np.full(n, k))
        top = info["ztop"]
        out[z > top - 1.3] = hx(RISER_SHADOW[kind])
        g = (noise(np.floor(v / 4), np.floor(z), k + 50) % 13 == 0)
        out[g] = hx(RISER_SHADOW[kind])
        return out
    if part == "stringer":
        if kind == "top":
            out = fill(FRAME["top"], n)
            out[noise(np.floor(u / 3), np.floor(v), 7) % 11 == 0] = hx(FRAME["lit"])
            return out
        if info.get("n") in ("v+", "v-") and info.get("inner"):
            return fill(INNER[kind], n)
        dz = str_top(u) - z                                  # depth below the top edge
        out = fill(FRAME[kind], n)
        out[dz < 1.3] = hx(FRAME_HI[kind])                   # the chamfer
        out[(dz > 4.0) & (dz < 5.2)] = hx(FRAME_DK[kind])    # a bead cut along the board
        out[dz > STR_DEPTH - 1.2] = hx(FRAME_DK[kind])       # its lower edge
        return out
    if part == "panel":
        if info.get("inner"):
            return fill(INNER[kind], n)
        j = np.floor((u - 1) / 6).astype(int)
        out = pick(PANEL[kind], j)
        out[np.floor(u - 1).astype(int) % 6 == 0] = hx(PANEL_GAP[kind])
        # the shadow the stringer throws on the panel below it, and a dark foot
        out[z > str_top(u) - STR_DEPTH - 1.6] = hx(PANEL_GAP[kind])
        out[z < 1.0] = hx(PANEL_GAP[kind])
        return out
    if part in ("post", "cap", "header"):
        out = fill(FRAME[kind], n)
        if part == "post" and kind != "top":
            # a chamfer down the post's corner the light finds, and a groove ring under the cap
            out[np.abs(z - info.get("ring", -99)) < 0.7] = hx(FRAME_DK[kind])
        if part == "cap" and kind != "top":
            out[:] = hx(FRAME_HI[kind]) if kind == "lit" else hx(FRAME[kind])
            out[z < info["z0"] + 0.9] = hx(FRAME_DK[kind])
        if part == "header" and kind != "top":
            out[z < info["z0"] + 1.0] = hx(FRAME_DK[kind])
        return out
    if part == "tenon":
        # a tread's through-tenon showing on the stringer's face, end grain, split by its wedge
        out = fill(ENDGRAIN[kind], n)
        out[np.abs(u - info["uc"]) < 0.55] = hx("#3a2716")
        return out
    if part == "inner":
        return fill(INNER[kind], n)
    return fill("#ff00ff", n)


def build_wood(d):
    W = World(d)
    # the treads and risers, twelve each
    for k in range(1, TREADS + 1):
        front = 8 * k - 4 - 1.5                      # the nosing overhangs its riser by 1.5
        back = min(8 * k + 4, RUN)
        ztop = 8 * k
        W.box(front, back, 3, 29, ztop - 2, ztop, "tread", info={"k": k, "front": front})
        r0 = 8 * k - 4
        W.box(r0, r0 + 1, 3, 29, 8 * (k - 1), ztop - 2, "riser", info={"k": k, "ztop": ztop - 2})
        # through-tenoned: each tread's ends pass through both stringers and show, wedged, on their faces
        W.box(8 * k - 2.0, 8 * k + 2.0, 31, 32.3, ztop - 3, ztop, "tenon", info={"uc": 8 * k})
        W.box(8 * k - 2.0, 8 * k + 2.0, -0.3, 1, ztop - 3, ztop, "tenon", info={"uc": 8 * k})
    # under the treads, a dark inner skin between the stringers so the open back shows a shadowed hollow
    # (the soffit is edge-on to the camera: only the back opening ever shows it)
    # the two sides: a sloped stringer board over a recessed panel of upright boards, posts at each end
    for side, (v0, v1, pv0, pv1) in (("out", (29, 32, 29.5, 31)), ("in", (0, 3, 1, 2.5))):
        inner = side == "in"
        # the stringer: a band from u = 4 to u = 91 under the line z = u + 9
        ua, ub = 4.0, 91.0
        poly = [(ua, str_top(ua) - STR_DEPTH), (ub, str_top(ub) - STR_DEPTH), (ub, float(str_top(ub))), (ua, float(str_top(ua)))]
        poly = [(u, max(0.0, z)) for u, z in poly]
        W.prism(poly, v0, v1, "stringer", info={"inner": False})
        # the inner face of the far stringer, seen only through the open back: dark
        # the spandrel panel under it, from the floor
        pa, pb = 5.0, 91.0
        ppoly = [(pa, 0.0), (pb, 0.0), (pb, float(str_top(pb)) - STR_DEPTH), (pa, max(0.5, float(str_top(pa)) - STR_DEPTH))]
        W.prism(ppoly, pv0, pv1, "panel", info={"inner": False})
        # the posts: a newel at the foot, and a post at the head that carries the landing's edge
        pv = (27, 32) if not inner else (0, 5)
        W.box(0, 5, pv[0], pv[1], 0, 19, "post", info={"ring": 17})
        W.box(-0.5, 5.5, pv[0] - 0.5, pv[1] + 0.5, 19, 21, "cap", info={"z0": 19})
        W.box(1, 4, pv[0] + 1, pv[1] - 1, 21, 24, "post", info={})
        W.box(2, 3, pv[0] + 2, pv[1] - 2, 24, 25.5, "post", info={})
        W.box(91, 96, pv[0], pv[1], 0, 104, "post", info={"ring": 102})
        W.box(90.5, 96.5, pv[0] - 0.5, pv[1] + 0.5, 104, 106, "cap", info={"z0": 104})
        W.box(92, 95, pv[0] + 1, pv[1] - 1, 106, 109, "post", info={})
        W.box(93, 94, pv[0] + 2, pv[1] - 2, 109, 110.5, "post", info={})
    # the header under the top tread, between the head posts; under it the hollow of the run, dark
    W.box(92, 96, 5, 27, 82, 94, "header", info={"z0": 82})
    W.box(5, 91, 2.5, 29.5, 0, 0.6, "inner", info={})          # the floor of the hollow, just proud of the ground
    return W.draw(wood_shader)


# ======================================================================== the stone stair
def blocks(a, z, length, seed):
    """a squared-block pattern on an upright face: courses 8 high (one riser each), blocks `length` long
    along `a`, staggered by course. returns (block id, is_mortar)"""
    course = np.floor(z / 8).astype(int)
    off = (course % 2) * (length / 2) + (noise(course, seed) % 3)
    j = np.floor((a + off) / length).astype(int)
    mort = (np.floor(z).astype(int) % 8 == 0) | (np.floor(a + off).astype(int) % int(length) == 0)
    return noise(j, course, seed) % 3, mort


def stone_shader(part, kind, u, v, z, info):
    n = len(u)
    if kind == "top":
        if part == "slab":
            k = info["k"]
            front = info["front"]
            # one or two slabs across the width, the joint moving from tread to tread
            jv = 13 + (k % 3) * 3
            idx = (noise(np.full(n, k), (v > jv).astype(int), 3) % 3)
            out = pick(ST_TOP, idx)
            out[np.abs(v - jv) < 0.6] = hx(ST_MORTAR["top"])
            out[u < front + 1.0] = hx(ST_NOSE["top"])
            spk = noise(np.floor(u), np.floor(v / 2), k) % 23 == 0
            out[spk] = hx("#8e8880")
            return out
        if part == "cap":
            seg = info["seg"]
            out = pick(ST_CAP["top"], np.full(n, seg))
            out[u < info["u0"] + 0.9] = hx(ST_NOSE["top"])
            return out
        return pick(ST_TOP, noise(np.floor(u / 12), np.floor(v / 12), 9) % 3)
    tones = ST_LIT if kind == "lit" else ST_SHADE
    if part == "cap":
        seg = info["seg"]
        return pick(ST_CAP[kind], np.full(n, seg + 1))
    if part == "slab":
        return fill(ST_NOSE[kind], n)
    # an upright face of blocks: which axis runs along it depends on the face
    along = v if info.get("n") in ("u+", "u-") else u
    b, mort = blocks(along, z, 12 if part == "cheek" else 11, 5 if part == "cheek" else 6)
    out = pick(tones, b)
    out[mort] = hx(ST_MORTAR[kind])
    return out


def build_stone(d):
    W = World(d)
    for k in range(1, TREADS + 1):
        r0 = 8 * k - 4
        back = min(8 * k + 4, RUN)
        ztop = 8 * k
        # the step's mass from the floor (solid under the run), and its slab, 2 thick, overhanging by 1
        W.box(r0, back, 4, 28, 0, ztop - 2, "mass", info={"k": k})
        W.box(r0 - 1, back, 4, 28, ztop - 2, ztop, "slab", info={"k": k, "front": r0 - 1})
    # the cheek walls: stepped, a course above each tread, with a coping slab per step
    for v0, v1 in ((28, 32), (0, 4)):
        for j in range(0, TREADS + 1):
            ua, ub = max(0, 8 * j - 4), min(RUN, 8 * j + 4)
            top = 8 * j + 5
            W.box(ua, ub, v0, v1, 0, top - 2, "cheek", info={"seg": j})
            W.box(ua - (0.5 if j == 0 else 0), ub, v0 - 0.0, v1, top - 2, top, "cap", info={"seg": j, "u0": ua - (0.5 if j == 0 else 0)})
    return W.draw(stone_shader)


# ======================================================================== the column cuts and the treads
INSET = 9   # the engine's SLICE_INSET, generalised to a three-tile run


def column_cuts(d, ax):
    """which footprint tile (0 the low end, 2 the high end) draws each pixel column, as ranges in the
    drawing's pixels: the engine's rule for two tiles (a vertical line at the front tile's centre moved
    INSET px toward the back tile) applied at each of the two boundaries"""
    cx = {k: float(P2S(to_world(d, 16 + 32 * k, 16, 0))[0]) for k in range(3)}   # the tiles' centres' screen x
    if d in ("n", "e"):     # the run climbs to the screen's right
        if d == "n":        # the low tile is in front (down-left): it owns left of its centre + INSET
            b1, b2 = cx[0] + INSET, cx[1] + INSET
        else:               # e: the high tile is in front (down-right): it owns from its centre - INSET
            b1, b2 = cx[1] - INSET, cx[2] - INSET
        return [[None, ax + b1], [ax + b1, ax + b2], [ax + b2, None]], cx
    if d == "s":            # the high tile in front, down-left
        b1, b2 = cx[1] + INSET, cx[2] + INSET
    else:                   # w: the low tile in front, down-right
        b1, b2 = cx[0] - INSET, cx[1] - INSET
    return [[ax + b1, None], [ax + b2, ax + b1], [None, ax + b2]], cx


def tread_list(d, origin, wood=True):
    out = []
    for k in range(1, TREADS + 1):
        r0 = 8 * k - 4
        front = r0 - (1.5 if wood else 1.0)
        back = min(8 * k + 4, RUN)
        v0, v1 = (3, 29) if wood else (4, 28)
        corners = to_world(d, np.array([front, back, back, front]), np.array([v0, v0, v1, v1]), np.full(4, 8 * k))
        sp = P2S(corners) + origin
        x0, y0 = np.floor(sp.min(0)).astype(int)
        x1, y1 = np.ceil(sp.max(0)).astype(int)
        tiles = sorted({int(min(2, max(0, math.floor((r0 + 0.01) / 32)))), int(min(2, math.floor((back - 0.01) / 32)))})
        centre = P2S(to_world(d, (r0 + back) / 2, 16, 8 * k)) + origin
        out.append({"k": k, "height": 8 * k, "along": [round(r0 / 32, 4), round(back / 32, 4)],
                    "tiles": tiles, "rect": [int(x0), int(y0), int(x1 - x0), int(y1 - y0)],
                    "quad": [[round(float(a), 1), round(float(b), 1)] for a, b in sp],
                    "centre": [round(float(centre[0]), 1), round(float(centre[1]), 1)]})
    return out


# ======================================================================== write it all
def build_all():
    res = {}
    for mat, fn in (("wood", build_wood), ("stone", build_stone)):
        for d in DIRS:
            p = fn(d).outline().crop()
            res[(mat, d)] = p
    return res


def check_hard(im):
    a = np.array(im)[..., 3]
    assert set(np.unique(a)) <= {0, 255}, "soft alpha"


def write(res):
    manifest = {"round": 8, "date": "2026-10-27", "files": []}
    for mat in ("wood", "stone"):
        drawings, treads, cuts, sizes = {}, {}, {}, {}
        for d in DIRS:
            p = res[(mat, d)]
            im = p.image()
            check_hard(im)
            name = f"stair_{mat}_{d}.png"
            im.save(os.path.join(OUT, name))
            # the true depth of every pixel (X + Y + Z, world units, from the anchor) as 16-bit, offset 32768
            dep = np.where(p.alpha, np.round(p.zb).astype(int) + 32768, 0).astype(np.uint16)
            Image.fromarray(dep).save(os.path.join(OUT, f"stair_{mat}_{d}_depth.png"))
            a = p.anchor()
            drawings[d] = {"image": f"data/art/village/{name}", "anchor": a}
            c, _ = column_cuts(d, a[0])
            cuts[d] = c
            treads[d] = tread_list(d, p.origin, wood=(mat == "wood"))
            sizes[d] = list(im.size)
            manifest["files"].append({"file": f"out/{name}", "size": list(im.size), "anchor": a, "facing": d, "material": mat})
        fp = {"n": [1, 3], "s": [1, 3], "w": [3, 1], "e": [3, 1]}
        note = ("the drawn wooden stair (art round 8): a straight run of three tiles climbing one storey (96 px), twelve "
                "treads of 8 px, closed stringers over recessed spandrel panels, a newel at the foot and a post at the "
                "head of each side, open and dark under the run behind its header") if mat == "wood" else (
                "the drawn stone stair (art round 8): a straight run of three tiles climbing one storey (96 px), twelve "
                "squared-stone steps of 8 px, one course each, solid to the floor, between stepped cheek walls with a "
                "coping slab per step")
        defn = {
            "anchorVertex": "top",
            "facings": list(DIRS),
            "facingFootprint": fp,
            "drawings": drawings,
            "anchorTile": "the low-end tile (the stair's `at`): the anchor is its top vertex at ground level",
            "columns": {d: {"tile0": cuts[d][0], "tile1": cuts[d][1], "tile2": cuts[d][2]} for d in DIRS},
            "treads": treads,
            "depth": {d: f"data/art/village/stair_{mat}_{d}_depth.png" for d in DIRS},
            "carry": False,
            "note": note,
        }
        with open(os.path.join(OUT, f"stair_{mat}.json"), "w") as f:
            json.dump(defn, f, indent=1)
        manifest["files"].append({"file": f"out/stair_{mat}.json"})
    with open(os.path.join(HERE, "manifest.json"), "w") as f:
        json.dump(manifest, f, indent=1)


# ======================================================================== the preview
def figure():
    """the bare body from data/art/character/preview_skins_3x.png taken back to 1x (rounds 4 to 6's crop)"""
    im = np.array(Image.open(f"{REPO}/data/art/character/preview_skins_3x.png").convert("RGBA"))
    bg = im[2, 2, :3].astype(int)
    small = im[260:460, 170:310][1::3, 1::3].copy()
    a = np.abs(small[..., :3].astype(int) - bg).sum(-1) > 6
    small[..., 3] = np.where(a, 255, 0)
    ys = np.where(a.any(1))[0]
    xs = np.where(a.any(0))[0]
    return small[ys.min():ys.max() + 1, xs.min():xs.max() + 1]


def load(path):
    return np.array(Image.open(f"{REPO}/{path}").convert("RGBA"))


class Canvas:
    """a scene composed by depth: every layer pixel carries X + Y + Z, nearest wins; flat floors first"""

    def __init__(self, W, H, ox, oy, bg=(52, 60, 52)):
        self.rgb = np.zeros((H, W, 3), np.uint8)
        self.rgb[:] = bg
        self.z = np.full((H, W), -1e9)
        self.ox, self.oy = ox, oy

    def put(self, img, x, y, depth):
        """img RGBA array placed with its top-left at canvas (x, y); depth an array like img's or a scalar"""
        h, w = img.shape[:2]
        H, W = self.z.shape
        x0, y0 = max(0, x), max(0, y)
        x1, y1 = min(W, x + w), min(H, y + h)
        if x1 <= x0 or y1 <= y0:
            return
        sub = img[y0 - y:y1 - y, x0 - x:x1 - x]
        dep = depth if np.isscalar(depth) else depth[y0 - y:y1 - y, x0 - x:x1 - x]
        dep = np.broadcast_to(dep, sub.shape[:2])
        m = (sub[..., 3] > 127) & (dep > self.z[y0:y1, x0:x1])
        self.rgb[y0:y1, x0:x1][m] = sub[..., :3][m]
        self.z[y0:y1, x0:x1][m] = dep[m]

    def scr(self, X, Y, Z=0):
        return self.ox + X - Y, self.oy + (X + Y) / 2 - Z


def plane_depth(shape, x, y, cv, face):
    """the depth of every pixel of a picture placed at (x, y) taken as lying on a vertical plane:
    face ('X', c) the plane X = c, ('Y', c) the plane Y = c; cv the canvas (for the origin)"""
    h, w = shape
    sx = np.arange(w)[None, :] + x + 0.5 - cv.ox
    sy = np.arange(h)[:, None] + y + 0.5 - cv.oy
    if face[0] == "X":
        X = face[1]
        Y = X - sx
    else:
        Y = face[1]
        X = sx + Y
    Z = (X + Y) / 2 - sy
    return X + Y + Z


def scene(res, mat, d, figures=True, wall=False):
    fig = figure()
    floors = [load(f"data/art/village/floor_{'wood' if mat == 'wood' else 'stone'}_{i}.png") for i in range(4)]
    landing = load("data/art/village/floor_wood_1.png" if mat == "wood" else "data/art/village/floor_stone_1.png")
    cv = Canvas(320, 300, 160, 190)
    # the ground: the stair's three tiles and a ring round them (and the room under the landing)
    for tu in range(-2, 5):
        for tv in range(-1, 2):
            Xc, Yc, _ = to_world(d, 32 * tu + 16, 32 * tv + 16, 0)
            sx, sy = cv.scr(Xc, Yc)
            cv.put(floors[(tu * 7 + tv * 3) % 4], int(round(sx - 32)), int(round(sy - 16)), -1e8)
    # the landing: a plank tile at 96 with a 6 px joist edge under it
    Wl = World(d)
    Wl.box(96, 128, 0, 32, 90, 96, "edge")
    edge = Wl.draw(lambda part, kind, u, v, z, info: fill(({"top": "#5e452f", "lit": "#4a3322", "shade": "#3a2a1c"} if mat == "wood" else {"top": "#7b7670", "lit": "#615c57", "shade": "#4a453f"})[kind], len(u)), pad=0)
    ex, ey = cv.ox - edge.origin[0], cv.oy - edge.origin[1]
    deep = np.where(edge.alpha, edge.zb, -1e9)
    rgba = np.dstack([edge.col, edge.alpha * 255]).astype(np.uint8)
    cv.put(rgba, int(round(ex)), int(round(ey)), deep)
    Xc, Yc, _ = to_world(d, 112, 16, 0)
    sx, sy = cv.scr(Xc, Yc, 96)
    cv.put(landing, int(round(sx - 32)), int(round(sy - 16)), Xc + Yc + 96 + 0.5)
    # the wall strip on the stair's back side (v = 0), three tiles and the landing's
    if wall:
        side = "west" if d in ("n", "s") else "north"
        wimg = load(f"data/art/village/wall_wood_{side}_plain.png")
        anc = (39, 100) if side == "west" else (7, 100)
        for tu in range(-1, 4):
            # the top vertex of the frame's tile tu on the stair's back line (v = 0)
            X0, Y0 = {"n": (0.0, -32.0 * tu), "s": (0.0, 32.0 * tu), "w": (-32.0 * tu, 0.0), "e": (32.0 * tu, 0.0)}[d]
            sx, sy = cv.scr(X0, Y0)
            x, y = int(round(sx - anc[0])), int(round(sy - anc[1]))
            face = ("X", X0 + 7) if side == "west" else ("Y", Y0 + 7)
            cv.put(wimg, x, y, plane_depth(wimg.shape[:2], x, y, cv, face))
    # the stair
    p = res[(mat, d)]
    x, y = int(round(cv.ox - p.origin[0])), int(round(cv.oy - p.origin[1]))
    rgba = np.dstack([p.col, p.alpha * 255]).astype(np.uint8)
    cv.put(rgba, x, y, np.where(p.alpha, p.zb, -1e9))
    # the figures: at the foot, on tread 4 (a third: 32), tread 8 (two thirds: 64), and on the landing
    if figures:
        fh, fw = fig.shape[:2]
        for t, h in ((-0.5, 0), (1.0, 32), (2.0, 64), (3.5, 96)):
            Xc, Yc, _ = to_world(d, 32 * t, 16, 0)
            sx, sy = cv.scr(Xc, Yc, h)
            x, y = int(round(sx - fw / 2)), int(round(sy - fh + 1))
            rows = np.arange(fh)[:, None]
            dep = Xc + Yc + 19.2 + h + (fh - 1 - rows) + np.zeros((1, fw))
            cv.put(fig, x, y, dep)
    return cv.rgb


def label(img, text, scale=1):
    im = Image.fromarray(img)
    ImageDraw.Draw(im).text((4, 3), text, fill=(230, 220, 200))
    return np.array(im)


def preview(res):
    scenes = []
    for d in DIRS:
        scenes.append((f"wood {d}", scene(res, "wood", d)))
    scenes.append(("wood n, wall", scene(res, "wood", "n", wall=True)))
    scenes.append(("wood w, wall", scene(res, "wood", "w", wall=True)))
    for d in DIRS:
        scenes.append((f"stone {d}", scene(res, "stone", d)))
    # 1x: two rows; 3x: the wood ones and the stone ones
    h, w = scenes[0][1].shape[:2]
    row1 = np.concatenate([label(s, t) for t, s in scenes[:6]], 1)
    row2 = np.concatenate([label(s, t) for t, s in scenes[6:]] + [np.full((h, w * 2, 3), 40, np.uint8)], 1)
    one = np.concatenate([row1, row2], 0)
    Image.fromarray(one).save(os.path.join(OUT, "preview_1x.png"))
    crop = lambda s: s[40:290, 30:290]
    big = lambda s: np.kron(crop(s), np.ones((3, 3, 1), np.uint8))
    r3a = np.concatenate([big(s) for _, s in scenes[0:3]], 1)
    r3b = np.concatenate([big(s) for _, s in scenes[3:6]], 1)
    r3c = np.concatenate([big(s) for _, s in scenes[6:9]], 1)
    r3d = np.concatenate([big(scenes[9][1]), np.full((750, 1560, 3), 40, np.uint8)], 1)
    three = np.concatenate([r3a, r3b, r3c, r3d], 0)
    Image.fromarray(three).save(os.path.join(OUT, "preview_3x.png"))
    W = max(one.shape[1], three.shape[1])
    pad = lambda a: np.concatenate([a, np.full((a.shape[0], W - a.shape[1], 3), 40, np.uint8)], 1)
    full = np.concatenate([pad(one), np.full((8, W, 3), 40, np.uint8), pad(three)], 0)
    Image.fromarray(full).save(os.path.join(HERE, "preview.png"))
    # each 3x scene on its own too, for looking closely
    for t, s in scenes:
        Image.fromarray(big(s)).save(os.path.join(OUT, "look_" + t.replace(" ", "_").replace(",", "") + ".png"))


if __name__ == "__main__":
    res = build_all()
    write(res)
    preview(res)
    for (mat, d), p in res.items():
        print(mat, d, p.image().size, p.anchor())
