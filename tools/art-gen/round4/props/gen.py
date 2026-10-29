"""Art round 4, group D: the home's furniture (barrel, chest, shelf, woodpile).

Written fresh for this round (2026-10-26), after reading Claude Design's village generators
(tools/art-gen/village/iso3d.py, furniture.py; tools/art-gen/beehive_and_coop/generators/props.py)
for the method: a small z-buffered face rasteriser in world units, faces shaded per pixel from the
world point so planks and staves run on across edges, an outline ring of #2b2522, a tight crop.
Nothing is imported from them.

World units: X and Y along the ground grid (a tile is 32 x 32), Z height in screen pixels.
    screen x = X - Y,   screen y = (X + Y) / 2 - Z,   depth toward the camera = X + Y + Z
+X runs to the screen's lower right (its faces are in shade), +Y to the lower left (its faces are
lit), tops are lightest. World (0, 0, 0) is the tile's top vertex at ground level: each sprite's
anchor (anchorVertex "top"), the same convention as the bed and the chair.

Run with plain `python gen.py`; writes out/. Deterministic: every random choice is seeded.
"""
import json, math, os
import numpy as np
from PIL import Image, ImageDraw

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "out")
REPO = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", "..", ".."))   # read only
os.makedirs(OUT, exist_ok=True)


def hx(s):
    s = s.lstrip("#"); return np.array([int(s[i:i + 2], 16) for i in (0, 2, 4)], np.uint8)


OUTLINE = hx("#2b2522")


def proj(P):
    P = np.asarray(P, float)
    return np.stack([P[..., 0] - P[..., 1], (P[..., 0] + P[..., 1]) / 2 - P[..., 2]], -1)


def hsh(*vals):
    """deterministic integer hash of integer arrays, 0..65535"""
    h = np.int64(0x2545F491)
    for i, v in enumerate(vals):
        v = np.asarray(v).astype(np.int64)
        h = (h ^ ((v + 0x9E37 + i * 0x51ED) * (0x01000193 + 2 * i))) & 0xFFFFFFFF
        h = (h * 0x045D9F3B) & 0xFFFFFFFF
        h = h ^ (h >> 16)
    return h & 0xFFFF


def fill(c, n):
    return np.broadcast_to(hx(c) if isinstance(c, str) else c, (n, 3)).copy()


def flat(c):
    return lambda P: fill(c, len(P))


# ------------------------------------------------------------------ the renderer
class Scene:
    def __init__(self):
        self.faces = []

    def face(self, pts, shader, bias=0.0, O=None, A=None, B=None):
        pts = np.array(pts, float)
        O = pts[0] if O is None else np.array(O, float)
        A = (pts[1] - pts[0]) if A is None else np.array(A, float)
        B = (pts[-1] - pts[0]) if B is None else np.array(B, float)
        self.faces.append((pts, O, A, B, shader, bias))

    def box(self, x0, y0, z0, x1, y1, z1, top=None, left=None, right=None, bias=0.0):
        """the three faces a camera sees: top, left (+Y, lit), right (+X, shade)"""
        if top is not None:
            self.face([(x0, y0, z1), (x1, y0, z1), (x1, y1, z1), (x0, y1, z1)], top, bias)
        if left is not None:
            self.face([(x0, y1, z0), (x1, y1, z0), (x1, y1, z1), (x0, y1, z1)], left, bias)
        if right is not None:
            self.face([(x1, y0, z0), (x1, y1, z0), (x1, y1, z1), (x1, y0, z1)], right, bias)

    def render(self, margin=2):
        allp = proj(np.concatenate([f[0] for f in self.faces]))
        mn = np.floor(allp.min(0)) - margin
        mx = np.ceil(allp.max(0)) + margin
        W, H = int(mx[0] - mn[0]), int(mx[1] - mn[1])
        col = np.zeros((H, W, 3), np.uint8)
        zb = np.full((H, W), -1e9)
        for pts, O, A, B, shader, bias in self.faces:
            sp = proj(pts) - mn
            m = Image.new("1", (W, H), 0)
            ImageDraw.Draw(m).polygon([tuple(p) for p in sp], fill=1)
            ys, xs = np.nonzero(np.array(m, bool))
            if not len(xs): continue
            sa, sb = proj(A), proj(B)
            M = np.array([[sa[0], sb[0]], [sa[1], sb[1]]])
            if abs(np.linalg.det(M)) < 1e-9: continue
            so = proj(O) - mn
            st = np.linalg.inv(M) @ np.stack([xs + 0.5 - so[0], ys + 0.5 - so[1]])
            P = O[None] + st[0][:, None] * A[None] + st[1][:, None] * B[None]
            # a face seen almost edge-on solves to points far off along the view ray: keep them on the face's box
            P = np.clip(P, pts.min(0) - 0.5, pts.max(0) + 0.5)
            dep = P.sum(1) + bias
            ok = dep > zb[ys, xs]
            if not ok.any(): continue
            ys, xs, P, dep = ys[ok], xs[ok], P[ok], dep[ok]
            col[ys, xs] = shader(P)
            zb[ys, xs] = dep
        return Sprite(col, zb > -1e8, -mn)


class Sprite:
    def __init__(self, col, alpha, origin):
        self.col, self.alpha, self.origin = col, alpha, np.array(origin, float)

    def outline(self, c=OUTLINE):
        a = self.alpha; p = np.pad(a, 1)
        ring = (p[:-2, 1:-1] | p[2:, 1:-1] | p[1:-1, :-2] | p[1:-1, 2:]) & ~a
        self.col[ring] = c; self.alpha = a | ring
        return self

    def image(self):
        a = self.alpha
        ys = np.where(a.any(1))[0]; xs = np.where(a.any(0))[0]
        y0, y1, x0, x1 = ys.min(), ys.max() + 1, xs.min(), xs.max() + 1
        rgba = np.zeros((y1 - y0, x1 - x0, 4), np.uint8)
        rgba[..., :3] = self.col[y0:y1, x0:x1]; rgba[..., 3] = a[y0:y1, x0:x1] * 255
        anc = self.origin - (x0, y0)
        return Image.fromarray(rgba, "RGBA"), [int(round(anc[0])), int(round(anc[1]))]


# ------------------------------------------------------------------ palettes (the furniture's own, docs/art/06)
FW = {"top": ["#7d5a3c", "#77553a"], "left": ["#6a4a30", "#644529"], "right": ["#4f3622", "#4a321f"]}
GAP = {"top": "#4a3322", "left": "#3a2716", "right": "#2c1d12"}
GRAIN = {"top": "#6c4b30", "left": "#5a3d25", "right": "#432d1b"}
IRON = {"top": "#5a5862", "left": "#4a4952", "right": "#2b2a32", "hi": "#6a6872", "lo": "#22212a"}
INSIDE = {"back": "#33241a", "gap": "#241912", "floor": "#3e2b1d"}     # the shelf's shadowed inside

# the barrel's oak, four steps round the cylinder from the light, and the stave joint one step darker
OAK = ["#8c6646", "#77553a", "#644529", "#4f3622"]
OAK_GAP = ["#6a4a30", "#5a3d25", "#4a3322", "#3a2716"]
OAK_GRAIN = ["#7d5a3c", "#6c4b30", "#5a3d25", "#432d1b"]
HOOP = ["#5a5862", "#4a4952", "#3a3942", "#2b2a32"]
HOOP_HI = ["#7a7884", "#6a6872", "#4a4952", "#3a3942"]

TERRA = ["#c27a52", "#a8603e", "#8a4c30", "#6a3824"]       # a clay pot
CROCK = ["#d0bc94", "#b8a47c", "#968260", "#76664a"]       # a pale stoneware crock
GLAZE = ["#8a9468", "#727e56", "#5c6646", "#464e36"]       # a green-glazed jar
BURLAP = ["#c8b282", "#b29c6c", "#958056", "#786642"]      # the sack
BARK = ["#6e5a48", "#5c4a3a", "#4a3a2d", "#3a2d22"]        # the woodpile's bark
ENDS = {"face": "#c8a26c", "ring": "#a07c4e", "pith": "#7a5c38", "dark": "#8e6c44"}
SPLIT = {"top": "#c8a470", "left": "#b08c5a", "right": "#94744a"}


def band_of(ang, cuts=(0.5, 0.0, -0.55)):
    """light band 0 (lit) .. 3 (darkest) of a vertical surface whose outward normal has angle ang
    in the ground plane: light from the top left, so +Y normals are lit, +X normals in shade"""
    f = (np.sin(ang) - np.cos(ang)) / math.sqrt(2)
    return np.where(f > cuts[0], 0, np.where(f > cuts[1], 1, np.where(f > cuts[2], 2, 3)))


def lathe(s, cx, cy, prof, shader, N=40, bias=0.0):
    """a turned solid round a vertical axis at (cx, cy): prof is [(z, R), ...] upward"""
    for (z0, R0), (z1, R1) in zip(prof, prof[1:]):
        if z1 <= z0: continue
        for i in range(N):
            a0, a1 = 2 * math.pi * i / N, 2 * math.pi * (i + 1) / N
            am = (a0 + a1) / 2
            if math.cos(am) + math.sin(am) < -0.45: continue          # facing away
            c0, s0, c1, s1 = math.cos(a0), math.sin(a0), math.cos(a1), math.sin(a1)
            s.face([(cx + R0 * c0, cy + R0 * s0, z0), (cx + R0 * c1, cy + R0 * s1, z0),
                    (cx + R1 * c1, cy + R1 * s1, z1), (cx + R1 * c0, cy + R1 * s0, z1)], shader, bias,
                   O=(cx + R0 * c0, cy + R0 * s0, z0),
                   A=(R0 * (c1 - c0), R0 * (s1 - s0), 0),
                   B=(R1 * c0 - R0 * c0, R1 * s0 - R0 * s0, z1 - z0))


def disk(s, cx, cy, z, R, shader, N=40, bias=0.0):
    pts = [(cx + R * math.cos(2 * math.pi * i / N), cy + R * math.sin(2 * math.pi * i / N), z) for i in range(N)]
    s.face(pts, shader, bias, O=(cx, cy, z), A=(1, 0, 0), B=(0, 1, 0))


def ring_top(s, cx, cy, z, r0, r1, shader, N=40, bias=0.0):
    for i in range(N):
        a0, a1 = 2 * math.pi * i / N, 2 * math.pi * (i + 1) / N
        s.face([(cx + r1 * math.cos(a0), cy + r1 * math.sin(a0), z), (cx + r1 * math.cos(a1), cy + r1 * math.sin(a1), z),
                (cx + r0 * math.cos(a1), cy + r0 * math.sin(a1), z), (cx + r0 * math.cos(a0), cy + r0 * math.sin(a0), z)],
               shader, bias, O=(cx, cy, z), A=(1, 0, 0), B=(0, 1, 0))


def plank_wood(light, axis=None, w=6, grain=True, seed=0):
    """furniture wood on a face lit `light`; axis = the world axis the joints run ACROSS (0, 1, 2),
    joints every w units; a sparse darker grain fleck"""
    cols = FW[light]
    def sh(P):
        n = len(P)
        if axis is None:
            out = fill(cols[0], n)
        else:
            u = P[:, axis]
            k = np.floor(u / w).astype(int)
            out = np.stack([hx(cols[0]), hx(cols[1])])[k % 2]
            out[np.floor(u).astype(int) % w == 0] = hx(GAP[light])
        if grain:
            g = hsh(np.floor(P[:, 0]), np.floor(P[:, 1]) // 3, np.floor(P[:, 2]) // 2, seed) % 11 == 0
            out[g] = hx(GRAIN[light])
        return out
    return sh


def wood_box(s, x0, y0, z0, x1, y1, z1, top_axis=None, side_axis=None, w=6, bias=0.0, grain=True):
    s.box(x0, y0, z0, x1, y1, z1, top=plank_wood("top", top_axis, w, grain), left=plank_wood("left", side_axis, w, grain),
          right=plank_wood("right", side_axis, w, grain), bias=bias)


def pot_shader(cx, cy, ramp, rim=None, band_cuts=(0.45, 0.0, -0.55)):
    """a round glazed or clay surface: four bands by the normal; rim = (z0, z1) painted one step lighter"""
    cols = np.stack([hx(c) for c in ramp])
    def sh(P):
        ang = np.arctan2(P[:, 1] - cy, P[:, 0] - cx)
        b = band_of(ang, band_cuts)
        if rim is not None:
            r = (P[:, 2] >= rim[0]) & (P[:, 2] < rim[1])
            b = np.where(r, np.maximum(b - 1, 0), b)
        return cols[b]
    return sh


def dark_mouth(c="#2a201a"):
    return flat(c)


# ------------------------------------------------------------------ the barrel
def barrel():
    """a cooper's oak barrel standing on its end: bellied staves, four iron hoops, a sunk head
    of three boards inside the chime, a bung on the lit side. 28 high, 8.6 across at the belly."""
    s = Scene()
    cx = cy = 16.0
    H, Re, Rm = 28.0, 7.0, 8.6
    hoops = [(1.5, 3.5), (6.5, 8.5), (19.5, 21.5), (24.5, 26.5)]
    def R_at(z):
        u = (z - H / 2) / (H / 2)
        return Re + (Rm - Re) * (1 - u * u)
    zs = sorted(set([0.0, H] + [z for h in hoops for z in h] + list(np.arange(0, H, 2.0))))
    prof = []
    for z in zs:
        r = R_at(z)
        prof.append((z, r))
    # the hoops stand a little proud: a separate thin band each
    stave_w = 4.6
    def staves(P):
        ang = np.arctan2(P[:, 1] - cy, P[:, 0] - cx)
        b = band_of(ang, (0.55, 0.05, -0.5))
        u = np.mod(ang + 0.31, 2 * math.pi) * 8.0
        k = np.floor(u / stave_w).astype(int)
        out = np.stack([hx(c) for c in OAK])[b]
        gap = (u % stave_w) < 0.9
        out[gap] = np.stack([hx(c) for c in OAK_GAP])[b[gap]]
        g = (~gap) & (hsh(k, np.floor(P[:, 2]) // 3) % 7 == 0) & (np.floor(u * 2).astype(int) % 3 == 1)
        out[g] = np.stack([hx(c) for c in OAK_GRAIN])[b[g]]
        return out
    lathe(s, cx, cy, prof, staves, N=48)
    def hoop_sh(z0, z1):
        def sh(P):
            ang = np.arctan2(P[:, 1] - cy, P[:, 0] - cx)
            b = band_of(ang, (0.55, 0.05, -0.5))
            out = np.stack([hx(c) for c in HOOP])[b]
            top = P[:, 2] >= z1 - 0.75
            out[top] = np.stack([hx(c) for c in HOOP_HI])[b[top]]
            return out
        return sh
    for (z0, z1) in hoops:
        hp = [(z0, R_at(z0) + 0.45), (z1, R_at(z1) + 0.45)]
        lathe(s, cx, cy, hp, hoop_sh(z0, z1), N=48, bias=0.3)
        ring_top(s, cx, cy, z1, R_at(z1) - 0.1, R_at(z1) + 0.45, flat(HOOP_HI[1]), N=48, bias=0.3)
    # the chime (the staves' ends standing above the head) and the sunk head
    ring_top(s, cx, cy, H, Re - 1.3, Re, lambda P: np.where(
        ((P[:, 1] - cy) - (P[:, 0] - cx))[:, None] > -3, hx("#a07a54"), hx("#8c6646")).astype(np.uint8), N=48)
    def chime_in(P):  # the inside of the chime on the far side, in shadow
        return fill("#4a3322", len(P))
    lathe(s, cx, cy, [(H - 1.2, Re - 1.3), (H, Re - 1.3)], chime_in, N=48, bias=-0.6)
    def head(P):
        u = P[:, 0] - cx      # the boards run along Y, joints across X
        out = np.stack([hx("#7d5a3c"), hx("#77553a"), hx("#7d5a3c")])[np.clip(np.floor((u + 6) / 4).astype(int), 0, 2)]
        out[np.abs(np.abs(u) - 2) < 0.5] = hx(GAP["top"])
        g = hsh(np.floor(P[:, 0]), np.floor(P[:, 1]) // 3) % 13 == 0
        out[g] = hx(GRAIN["top"])
        return out
    disk(s, cx, cy, H - 1.2, Re - 1.2, head, N=48, bias=-0.3)
    # the bung, a dark plug in a stave on the lit side at the belly
    a = math.radians(100); r = R_at(14) - 0.3
    bx, by = cx + r * math.cos(a), cy + r * math.sin(a)
    s.box(bx - 0.6, by - 0.6, 12.8, bx + 0.6, by + 0.6, 14.6, top=flat("#3a2716"), left=flat("#3a2716"), right=flat("#2c1d12"), bias=0.2)
    return s.render()


# ------------------------------------------------------------------ the chest
def chest():
    """a six-board chest, long side along world Y, its front (the hasp) toward +X: runners under
    the ends, horizontal front boards, a lid of boards along Y with an overhang, iron corner
    brackets, two iron straps over the lid, a hasp and a padlock, a grip on the near end."""
    s = Scene()
    X0, X1, Y0, Y1 = 9.0, 23.0, 5.0, 27.0
    ZB, ZL, ZT = 2.0, 14.0, 19.0          # body from 2, the lid from 14 to 19
    # runners under the ends
    for (y0, y1) in ((Y0 + 0.5, Y0 + 3.5), (Y1 - 3.5, Y1 - 0.5)):
        wood_box(s, X0 + 0.5, y0, 0, X1 - 0.5, y1, ZB, grain=False)
    BR = 3.0                       # the corner brackets' reach along each face
    def body_face(light):
        base = plank_wood(light, 2, 4)
        def sh(P):
            out = base(P)
            x, y, z = P[:, 0], P[:, 1], P[:, 2]
            along = y if light == "right" else x
            lo, hi = (Y0, Y1) if light == "right" else (X0, X1)
            corner = ((along < lo + BR) | (along > hi - BR)) & ((z < ZB + 3.5) | (z > ZL - 3.5))
            out[corner] = hx(IRON[light])
            edge = corner & (((along > lo + BR - 1) & (along < lo + BR)) | ((along < hi - BR + 1) & (along > hi - BR)))
            out[edge] = hx(IRON["lo"])
            # a rivet in each bracket
            riv = corner & (np.abs(along - np.where(along < (lo + hi) / 2, lo + 1.5, hi - 1.5)) < 0.5) & \
                  (np.abs(z - np.where(z < (ZB + ZL) / 2, ZB + 1.5, ZL - 1.5)) < 0.5)
            out[riv] = hx(IRON["hi"])
            seam = z >= ZL - 1.0
            out[seam & ~corner] = hx(GAP[light])
            return out
        return sh
    s.box(X0, Y0, ZB, X1, Y1, ZL, top=None, left=body_face("left"), right=body_face("right"))
    # the lid: boards along Y (joints across X), overhanging half a unit, straps across it
    LX0, LX1, LY0, LY1 = X0 - 0.6, X1 + 0.8, Y0 - 0.6, Y1 + 0.8
    straps = [(Y0 + 4.5, Y0 + 6.5), (Y1 - 6.5, Y1 - 4.5)]
    def lid_face(light):
        base = plank_wood(light, 0 if light == "top" else None, 5)
        def sh(P):
            out = base(P)
            y = P[:, 1]
            st = np.zeros(len(P), bool)
            for (a, b) in straps: st |= (y >= a) & (y < b)
            if light != "left":
                out[st] = hx(IRON[light])
                if light == "top":
                    out[st & (np.abs(P[:, 0] - (LX0 + LX1) / 2) < 0.6)] = hx(IRON["hi"])
            if light == "left":
                x = P[:, 0]
                c = (x > LX1 - BR) | (x < LX0 + BR)
                out[c] = hx(IRON["left"])
            if light == "right":
                c = (y > LY1 - BR) | (y < LY0 + BR)
                out[c] = hx(IRON["right"])
                out[c & (np.abs(y - (LY1 - 1.5)) < 0.5) & (np.abs(P[:, 2] - (ZL + ZT) / 2 - 0.3) < 0.6)] = hx(IRON["hi"])
            if light != "top":
                out[P[:, 2] < ZL + 0.9] = np.where(st[P[:, 2] < ZL + 0.9, None] & (light != "left"),
                                                   hx(IRON["lo"]), hx(GRAIN[light] if light == "left" else GAP["right"]))
            return out
        return sh
    s.box(LX0, LY0, ZL, LX1, LY1, ZT, top=lid_face("top"), left=lid_face("left"), right=lid_face("right"), bias=0.1)
    # the hasp: a plate from the lid's edge down the front, and a padlock hanging on its staple
    yc = (Y0 + Y1) / 2
    s.box(X1, yc - 1.2, ZL - 3.5, X1 + 0.6, yc + 1.2, ZT - 0.5,
          right=lambda P: np.where((P[:, 2] > ZL - 1)[:, None], hx(IRON["right"]), hx(IRON["left"])).astype(np.uint8), bias=0.4)
    s.box(X1 + 0.6, yc - 1.5, ZL - 7.5, X1 + 1.6, yc + 1.5, ZL - 4.0,
          top=flat(IRON["hi"]), left=flat(IRON["top"]), right=lambda P: np.where(
              ((np.abs(P[:, 1] - yc) < 0.5) & (P[:, 2] < ZL - 5.0) & (P[:, 2] > ZL - 6.6))[:, None],
              hx("#141318"), hx(IRON["left"])).astype(np.uint8), bias=0.6)
    s.box(X1 + 0.6, yc - 0.5, ZL - 4.0, X1 + 1.2, yc + 0.5, ZL - 3.0, top=flat(IRON["hi"]), left=flat(IRON["top"]), right=flat(IRON["lo"]), bias=0.6)
    # a grip on the near (+Y) end: an iron bar on two staples
    s.box(14.0, Y1, ZL - 4.5, 18.0, Y1 + 0.8, ZL - 3.5, top=flat(IRON["hi"]), left=flat(IRON["left"]), right=flat(IRON["lo"]), bias=0.5)
    for xs in (14.0, 17.0):
        s.box(xs, Y1, ZL - 3.5, xs + 1.0, Y1 + 0.5, ZL - 2.5, top=flat(IRON["top"]), left=flat(IRON["right"]), right=flat(IRON["lo"]), bias=0.5)
    return s.render()


# ------------------------------------------------------------------ the shelf
def sack(s, cx, cy, z0, h, R, bias=0.0):
    """a tied burlap sack sitting: a full belly, a gathered neck, a frill above the tie"""
    prof = []
    for z in np.linspace(0, h, 12):
        u = z / h
        if u < 0.7: r = R * (0.86 + 0.14 * math.sin(math.pi * (u / 0.7) * 0.9 + 0.25)) * (1 - 0.08 * (u / 0.7) ** 2)
        else: r = R * max(0.32, 0.9 - (u - 0.7) * 2.2)
        prof.append((z0 + z, r))
    tie = z0 + h * 0.80
    prof = [(z, r) for (z, r) in prof if z < tie - 0.2] + [(tie - 0.2, R * 0.38), (tie + 1.0, R * 0.32), (z0 + h + 0.4, R * 0.55), (z0 + h + 1.2, R * 0.42)]
    cols = np.stack([hx(c) for c in BURLAP])
    def sh(P):
        ang = np.arctan2(P[:, 1] - cy, P[:, 0] - cx)
        b = band_of(ang, (0.45, 0.0, -0.55))
        out = cols[b]
        weave = hsh(np.floor(P[:, 0] - P[:, 1]), np.floor(P[:, 2])) % 7 == 0
        out[weave] = cols[np.minimum(b[weave] + 1, 3)]
        fold = (np.abs(np.mod(ang * 2.2 + P[:, 2] * 0.25, 2 * math.pi) - 1.0) < 0.18) & (P[:, 2] > z0 + h * 0.45)
        out[fold] = cols[np.minimum(b[fold] + 1, 3)]
        t = (P[:, 2] >= tie - 0.3) & (P[:, 2] < tie + 1.0)
        out[t] = np.where((b[t] < 2)[:, None], hx("#6a4a30"), hx("#4a3322")).astype(np.uint8)
        return out
    lathe(s, cx, cy, prof, sh, N=36, bias=bias)
    disk(s, cx, cy, prof[-1][0], prof[-1][1], flat(BURLAP[0]), N=24, bias=bias)


def pot(s, cx, cy, z0, h, R, ramp, neck=0.7, lip=1.0, bias=0.0, mouth=True, cloth=None):
    """a round-bellied pot or jar: a belly, a narrower neck and a rolled lip"""
    rn = R * neck
    prof = [(z0, R * 0.7), (z0 + h * 0.15, R * 0.95), (z0 + h * 0.45, R), (z0 + h * 0.75, R * 0.88),
            (z0 + h - lip, rn), (z0 + h - lip, rn + 0.5), (z0 + h, rn + 0.5)]
    lathe(s, cx, cy, prof, pot_shader(cx, cy, ramp, rim=(z0 + h - lip, z0 + h + 1)), N=32, bias=bias)
    if cloth is not None:      # a cloth tied over the mouth
        lathe(s, cx, cy, [(z0 + h - lip - 0.8, rn + 0.7), (z0 + h + 0.4, rn + 0.8)], pot_shader(cx, cy, cloth), N=32, bias=bias + 0.1)
        disk(s, cx, cy, z0 + h + 0.4, rn + 0.8, flat(cloth[0]), N=24, bias=bias + 0.1)
        lathe(s, cx, cy, [(z0 + h - lip - 0.3, rn + 0.85), (z0 + h - lip + 0.5, rn + 0.85)], pot_shader(cx, cy, ["#8a6a42", "#76583a", "#5e4630", "#4a3622"]), N=32, bias=bias + 0.2)
    elif mouth:
        ring_top(s, cx, cy, z0 + h, rn - 0.4, rn + 0.5, flat(ramp[0]), N=32, bias=bias)
        disk(s, cx, cy, z0 + h - 0.05, rn - 0.4, dark_mouth(), N=24, bias=bias - 0.05)


def shelf():
    """a tall open shelf, long side along world Y, its back to a west wall (low X) and its open front
    toward +X: two side boards, a board back, four shelves and a top with an overhang, a plinth.
    On it: a tied sack and a crock below, clay pots and a glazed jar, a jar under a cloth and a jug."""
    s = Scene()
    X0, X1, Y0, Y1 = 7.0, 17.0, 3.0, 29.0
    T = 2.0                     # board thickness
    ZTOP = 58.0
    shelves = [0.0, 17.0, 32.0, 46.0]
    # the back: boards on its open face, in the shelf's own shadow
    def back(P):
        y = P[:, 1]
        out = fill(INSIDE["back"], len(P))
        out[np.floor(y).astype(int) % 6 == 0] = hx(INSIDE["gap"])
        g = hsh(np.floor(y), np.floor(P[:, 2]) // 2) % 9 == 0
        out[g] = hx("#2c1f16")
        return out
    s.box(X0, Y0 + T, 0, X0 + 1.0, Y1 - T, ZTOP, right=back, bias=-0.2)
    # the sides
    for (y0, y1) in ((Y0, Y0 + T), (Y1 - T, Y1)):
        far = y0 < 10
        def side_right(P, far=far):
            out = plank_wood("right", None, 6)(P)
            return out
        def side_left(P, far=far):
            out = plank_wood("left", None, 6)(P) if not far else fill(INSIDE["floor"], len(P))
            out[np.floor(P[:, 0]).astype(int) == int(X0 + 4)] = hx(GRAIN["left"]) if not far else hx(INSIDE["gap"])
            return out
        s.box(X0, y0, 0, X1, y1, ZTOP, top=plank_wood("top", None), left=side_left, right=side_right)
    # the shelves: boards with a lit front edge; the bottom one is the plinth
    for k, z in enumerate(shelves):
        z0 = z if k else 0.0
        z1 = z + T if k else 4.0
        def shelf_top(P):
            out = fill("#5e412b", len(P))
            out[P[:, 0] > X1 - 3] = hx(FW["top"][1])
            g = hsh(np.floor(P[:, 1]) // 2, np.floor(P[:, 0])) % 9 == 0
            out[g] = hx(GRAIN["top"])
            return out
        s.box(X0 + 1, Y0 + T, z0, X1, Y1 - T, z1, top=shelf_top, left=None,
              right=plank_wood("right", None, 6, grain=False) if k else (lambda P: np.where(
                  (P[:, 2] < 1.0)[:, None], hx(GAP["right"]), hx(FW["right"][0])).astype(np.uint8)))
    # the top, overhanging the front and the ends a little
    s.box(X0 - 0.5, Y0 - 0.8, ZTOP, X1 + 1.0, Y1 + 0.8, ZTOP + 2.5,
          top=plank_wood("top", 0, 5), left=plank_wood("left", None), right=plank_wood("right", None))
    # what is on it
    xc = 12.0
    # the bottom shelf (from 4): a tied sack, a crock
    sack(s, xc + 0.3, 21.5, 4.0, 11.5, 4.6, bias=0.2)
    pot(s, xc + 0.5, 10.5, 4.0, 8.5, 3.5, GLAZE, neck=0.6, lip=1.2, bias=0.2)
    # the second shelf (from 19): two clay pots and a stoneware crock
    pot(s, xc, 8.5, 19.0, 7.0, 3.0, TERRA, neck=0.72, bias=0.2)
    pot(s, xc + 0.5, 15.5, 19.0, 9.0, 3.4, CROCK, neck=0.55, lip=1.2, bias=0.2)
    pot(s, xc + 0.5, 22.5, 19.0, 5.5, 3.0, TERRA, neck=0.8, bias=0.2)
    # the third shelf (from 34): a jar under a cloth, a squat bowl-pot, a small jug
    pot(s, xc, 10.0, 34.0, 8.0, 3.3, CROCK, neck=0.7, bias=0.2, cloth=["#d8ccaa", "#c4b896", "#a89c80", "#8c8268"])
    pot(s, xc + 0.5, 18.0, 34.0, 4.0, 3.4, TERRA, neck=0.92, lip=0.8, bias=0.2)
    pot(s, xc + 0.5, 24.0, 34.0, 7.5, 2.4, GLAZE, neck=0.6, bias=0.2)
    # the top shelf (from 48): two small pots
    pot(s, xc, 12.0, 48.0, 5.5, 2.6, TERRA, neck=0.75, bias=0.2)
    pot(s, xc + 0.5, 19.0, 48.0, 6.5, 2.6, CROCK, neck=0.65, bias=0.2)
    return s.render()


# ------------------------------------------------------------------ the woodpile
def woodpile(seed=7):
    """split logs stacked along world Y between two stakes, on two sleeper poles, their cut ends
    toward +X: rounds, halves and quarters, ends staggered a unit or two, the top row shorter"""
    rng = np.random.default_rng(seed)
    s = Scene()
    Y0, Y1 = 3.0, 28.0
    XB, XF = 9.0, 24.0
    # sleepers
    def bark_face(light):
        cols = np.stack([hx(c) for c in BARK])
        i = {"top": 0, "left": 1, "right": 2}[light]
        def sh(P):
            out = fill(BARK[i], len(P))
            crack = (hsh(np.floor(P[:, 1] + P[:, 2]), np.floor(P[:, 0]) // 4) % 5 == 0) & (np.floor(P[:, 0]).astype(int) % 4 != 0)
            out[crack] = cols[min(i + 1, 3)]
            return out
        return sh
    for (x0, x1) in ((XB + 1, XB + 3.5), (XF - 3.5, XF - 1)):
        s.box(x0, Y0 - 1, 0, x1, Y1 + 1, 2.5, top=bark_face("top"), left=bark_face("left"), right=bark_face("right"))
    # the dark heart of the pile, so the gaps between logs read as shadow, not holes
    s.box(XB + 1, Y0 + 2.5, 2.5, XF - 1.5, Y1 - 2.5, 22.0, top=flat("#2a1f18"), left=flat("#2a1f18"), right=flat("#241a14"), bias=-1.0)

    def section(kind, r, rot):
        """cross-section polygon in (y, z) about the log's pith, CCW, and which edges are bark"""
        if kind == "round":
            n = 12
            pts = [(r * math.cos(rot + 2 * math.pi * i / n), r * math.sin(rot + 2 * math.pi * i / n)) for i in range(n)]
            bark = [True] * n
            return pts, bark, (0.0, 0.0)
        if kind == "half":
            n = 7
            pts = [(r * math.cos(rot + math.pi * i / (n - 1)), r * math.sin(rot + math.pi * i / (n - 1))) for i in range(n)]
            bark = [True] * (n - 1) + [False]
            return pts, bark, (0.0, 0.0)
        n = 4      # quarter
        pts = [(0.0, 0.0)] + [(r * math.cos(rot + (math.pi / 2) * i / (n - 1)), r * math.sin(rot + (math.pi / 2) * i / (n - 1))) for i in range(n)]
        bark = [False] + [True] * (n - 1) + [False]
        return pts, bark, (0.0, 0.0)

    def add_log(yc, zc, kind, r, rot, xf, bias):
        pts, bark, pith = section(kind, r, rot)
        # centre the section's own centroid on (yc, zc)
        cy_ = sum(p[0] for p in pts) / len(pts); cz_ = sum(p[1] for p in pts) / len(pts)
        pts = [(yc + p[0] - cy_, zc + p[1] - cz_) for p in pts]
        py, pz = yc + pith[0] - cy_, zc + pith[1] - cz_
        n = len(pts)
        for i in range(n):
            (ya, za), (yb, zb) = pts[i], pts[(i + 1) % n]
            ey, ez = yb - ya, zb - za
            ny, nz = ez, -ey            # outward for a CCW polygon in (y, z)
            if ny + nz <= 1e-6: continue
            ln = math.hypot(ny, nz); ny, nz = ny / ln, nz / ln
            light = "top" if nz > 0.6 else ("left" if nz > -0.3 else "right")
            if bark[i]:
                sh = bark_face(light)
            else:
                sh = flat(SPLIT[light])
            s.face([(XB, ya, za), (xf, ya, za), (xf, yb, zb), (XB, yb, zb)], sh, bias)
        # the cut end toward +X
        def cap(P, py=py, pz=pz, r=r, kind=kind, pts=pts, bark=bark):
            d = np.hypot(P[:, 1] - py, P[:, 2] - pz)
            out = fill(ENDS["face"], len(P))
            out[d < 0.6] = hx(ENDS["pith"])
            # a rim round the cut: bark where the edge is bark, a darker split line where it is split
            q = P[:, 1:3]
            for i in range(len(pts)):
                a = np.array(pts[i]); b = np.array(pts[(i + 1) % len(pts)])
                ab = b - a; t = np.clip(((q - a) @ ab) / max(ab @ ab, 1e-9), 0, 1)
                dist = np.hypot(*(q - (a + t[:, None] * ab)).T)
                out[dist < 0.55] = hx(BARK[3]) if bark[i] else hx(ENDS["pith"])
            return out
        s.face([(xf, p[0], p[1]) for p in pts], cap, bias, O=(xf, 0, 0), A=(0, 1, 0), B=(0, 0, 1))

    # rows of cells, close packed (four, three, four, three, two); each a log of a seeded kind and turn
    rows = [(5.6, [6.2, 12.4, 18.6, 24.8]), (11.0, [9.3, 15.5, 21.7]), (16.4, [6.2, 12.4, 18.6, 24.8]),
            (21.8, [9.3, 15.5, 21.7]), (27.0, [12.4, 18.6])]
    kinds = ["round", "round", "half", "round", "half", "round", "round"]
    for ri, (zc, ys) in enumerate(rows):
        for ci, yc in enumerate(ys):
            kind = kinds[int(rng.integers(0, len(kinds)))]
            r = {"round": 3.0, "half": 3.8, "quarter": 4.6}[kind] + float(rng.uniform(-0.1, 0.15))
            if kind == "half":   # flat side down or up, give or take
                rot = float(rng.choice([0.0, math.pi])) + float(rng.uniform(-0.3, 0.3))
            else:
                rot = float(rng.uniform(0, 2 * math.pi))
            xf = XF + float(rng.choice([-1.0, 0.0, 0.0, 0.0, 1.0]))
            add_log(yc, zc, kind, r, rot, xf, bias=0.05 * (ri + ci))
    # the stakes at each end, a little taller than the pile, their tops cut to a point
    for yc in (Y0 - 0.2, Y1 + 0.8):
        x0, x1, y0, y1 = XF - 4.0, XF - 2.0, yc - 1.0, yc + 1.0
        s.box(x0, y0, 0, x1, y1, 29.0, top=None, left=plank_wood("left", None), right=plank_wood("right", None), bias=0.5)
        apex = ((x0 + x1) / 2, (y0 + y1) / 2, 34.0)
        s.box(x0, y0, 29.0, x1, y1, 31.5, left=plank_wood("left", None), right=plank_wood("right", None), bias=0.5)
        apex = ((x0 + x1) / 2, (y0 + y1) / 2, 34.0)
        s.face([(x0, y1, 31.5), (x1, y1, 31.5), apex], flat(FW["top"][0]), 0.5)
        s.face([(x1, y0, 31.5), (x1, y1, 31.5), apex], flat(FW["right"][0]), 0.5)
    return s.render()


# ------------------------------------------------------------------ the anchor self-check
def chair_check():
    """the chair's front drawing rebuilt from furniture.py's numbers (boxes only, flat colours) in this
    renderer: its size and anchor must match chair_front.png (39 x 51, anchor 19, 25) for the anchors
    here to mean what the game's mean"""
    s = Scene(); c = flat("#7d5a3c")
    for (x, y) in ((8, 8), (22, 8), (8, 22), (22, 22)): s.box(x, y, 0, x + 2, y + 2, 11, top=c, left=c, right=c)
    s.box(7, 7, 11, 25, 25, 14, top=c, left=c, right=c)
    for y in (7.5, 22.5): s.box(8, y, 14, 10, y + 2, 31, top=c, left=c, right=c)
    s.box(8, 7.5, 26, 10, 24.5, 31, top=c, left=c, right=c)
    im, anc = s.render().outline().image()
    ref = Image.open(f"{REPO}/data/art/village/chair_front.png")
    ra = np.array(ref)[..., 3] > 0; ma = np.array(im)[..., 3] > 0
    same = ra.shape == ma.shape and (ra == ma).mean()
    return im.size, anc, ref.size, same


# ------------------------------------------------------------------ out
def save(sp, name):
    sp.outline()
    im, anc = sp.image()
    a = np.array(im)[..., 3]
    assert set(np.unique(a)) <= {0, 255}, name
    im.save(os.path.join(OUT, name + ".png"))
    return im, anc


def definitions(res):
    """each definition: today's non-picture fields kept, `placeholder` replaced by the drawn shape"""
    defs = {}
    im, anc = res["barrel"]
    defs["barrel"] = {
        "anchorVertex": "top",
        "images": {"idle_0": "data/art/village/barrel.png"},
        "anchor": anc,
        "collide": {"radius": 0.26},
        "container": {"loot": "barrel"},
        "carry": True,
        "note": "the drawn barrel (art round 4): a cooper's oak barrel standing on its end, four iron hoops, a sunk head inside the chime, a bung on the lit side; round, so one drawing and no facings",
    }
    for id_, extra in (("chest", {"container": {"loot": "chest"}, "carry": True,
                                  "note": "the drawn chest (art round 4): a six-board chest, iron corners and straps, a hasp and padlock; long side along y as drawn with its front toward +x (a west wall at its back), along x as its mirror (front toward +y)"}),
                       ("shelf", {"container": {"loot": "pantry"}, "carry": True,
                                  "note": "the drawn shelf (art round 4): a tall open shelf with pots, jars and a tied sack; backs against a west wall as drawn (y), a north wall as its mirror (x), as the fireplace; once a dev box (docs/30 step 1; docs/29/09 has its art request)"}),
                       ("woodpile", {"container": {"loot": "woodpile"}, "carry": True,
                                     "note": "the drawn woodpile (art round 4): split logs stacked along y between two stakes on two sleepers, the cut ends toward +x; along x as its mirror; once a dev box (docs/30 step 1; docs/29/09 has its art request)"})):
        im, anc = res[id_]
        d = {"anchorVertex": "top", "facings": ["y", "x"],
             "drawings": {"y": {"image": f"data/art/village/{id_}.png", "anchor": anc},
                          "x": {"from": "y", "mirror": True}}}
        d.update(extra)
        defs[id_] = d
    for k, d in defs.items():
        with open(os.path.join(OUT, k + ".json"), "w", newline="\n") as f:
            json.dump(d, f, indent=1); f.write("\n")
    return defs


# ------------------------------------------------------------------ the preview
FLOOR = {"top": "#62482f", "edge": "#3a2a1c", "row": "#5e452f"}


def floor_tile():
    """a plain 64 x 32 wooden floor diamond, its top vertex at pixel (32, 0)"""
    t = np.zeros((32, 64, 4), np.uint8)
    for y in range(32):
        for x in range(64):
            X = (x + 0.5 - 32) / 2 + (y + 0.5); Y = (y + 0.5) - (x + 0.5 - 32) / 2
            if 0 <= X < 32 and 0 <= Y < 32:
                c = hx(FLOOR["top"]) if (int(X) // 8) % 2 else hx(FLOOR["row"])
                if int(X) % 8 == 0 or X < 0.7 or Y < 0.7: c = hx(FLOOR["edge"])
                t[y, x] = (*c, 255)
    return Image.fromarray(t, "RGBA")


def figure_for_scale():
    """the bare body from data/art/character/preview_skins_3x.png (row 2, the second skin), back at 1x"""
    im = np.array(Image.open(f"{REPO}/data/art/character/preview_skins_3x.png").convert("RGBA"))
    bg = im[2, 2, :3].astype(int)
    cell = im[260:460, 170:310]
    small = cell[1::3, 1::3].copy()
    a = np.abs(small[..., :3].astype(int) - bg).sum(-1) > 6
    small[..., 3] = np.where(a, 255, 0)
    ys = np.where(a.any(1))[0]; xs = np.where(a.any(0))[0]
    small = small[ys.min():ys.max() + 1, xs.min():xs.max() + 1]
    return Image.fromarray(small, "RGBA")


def preview(res):
    ref = lambda n: Image.open(f"{REPO}/data/art/village/{n}.png").convert("RGBA")
    mir = lambda im: im.transpose(Image.FLIP_LEFT_RIGHT)
    tile = floor_tile()
    fig = figure_for_scale()
    # (label, image, anchor, footprint tiles along y): the anchor is the top vertex of the footprint's top tile
    items = [("bed", ref("bed"), (64, 27), 2), ("chair", ref("chair_front"), (19, 25), 1)]
    im, anc = res["barrel"]; items.append(("barrel", im, tuple(anc), 1))
    for k in ("chest", "shelf", "woodpile"):
        im, anc = res[k]
        items.append((k + " y", im, tuple(anc), 1))
        items.append((k + " x", mir(im), (im.width - anc[0], anc[1]), 1))
    items.append(("figure", fig, None, 1))
    pad = 6
    W = sum(64 + (32 if fp == 2 else 0) + pad for (_, _, _, fp) in items) + pad
    H = 120
    base = 92      # the screen y of the footprint tiles' bottom vertex
    c = Image.new("RGBA", (W, H), (34, 30, 28, 255))
    x = pad
    for (lab, im, anc, fp) in items:
        wcell = 64 + (32 if fp == 2 else 0)
        if anc is None:      # the figure: feet on the tile centre
            tx, ty = x + 32, base - 32
            c.alpha_composite(tile, (tx - 32, ty))
            c.alpha_composite(im, (tx - im.width // 2, ty + 16 - im.height + 1))
        else:
            # the top tile's top vertex; a two-tile piece's second tile lies along +Y (down-left)
            tx = x + (64 if fp == 2 else 32); ty = base - 32 - (16 if fp == 2 else 0)
            for j in range(fp):
                c.alpha_composite(tile, (tx - 32 - 32 * j, ty + 16 * j))
            c.alpha_composite(im, (tx - anc[0], ty - anc[1]))
        x += wcell + pad
    c.save(os.path.join(OUT, "preview_1x.png"))
    big = c.resize((c.width * 3, c.height * 3), Image.NEAREST)
    big.save(os.path.join(OUT, "preview_3x.png"))
    # preview.png: the 1x strip above the 3x strip
    P = Image.new("RGBA", (big.width, c.height + 8 + big.height), (34, 30, 28, 255))
    P.alpha_composite(c, (0, 0)); P.alpha_composite(big, (0, c.height + 8))
    P.save(os.path.join(OUT, "preview.png"))
    return [lab for (lab, _, _, _) in items]


if __name__ == "__main__":
    size, anc, rsize, same = chair_check()
    print("chair check: rebuilt", size, anc, "drawn", rsize, (19, 25), "silhouette match", same)
    res = {}
    res["barrel"] = save(barrel(), "barrel")
    res["chest"] = save(chest(), "chest")
    res["shelf"] = save(shelf(), "shelf")
    res["woodpile"] = save(woodpile(), "woodpile")
    defs = definitions(res)
    order = preview(res)
    for k, (im, a) in res.items():
        print(k, im.size, "anchor", a)
    print("preview order:", order)
