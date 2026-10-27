"""Art round 5, group D: the cupboard, the workbench, the cauldron (its prop, its three flame frames,
and the Cauldron item), and the Linen satchel.

Written fresh for this round (2026-10-26) after reading round 4's furniture generator
(tools/art-gen/round4/props/gen.py) and its README for the method; nothing is imported from it.

Two methods, by size (docs/art/01, "How things were made"):
  * the furniture is built in world units and drawn by a small z-buffered face rasteriser, every face
    shaded per pixel from its world point, so boards and panels run on across edges;
  * the items (the Cauldron and the satchel) are drawn in plain screen space from shapes, at a scale,
    so the bag icon, the world picture, and the portrait are one design at three sizes.

World units: X and Y along the ground (a tile is 32 x 32), Z height in screen pixels.
    screen x = X - Y,   screen y = (X + Y) / 2 - Z,   depth toward the camera = X + Y + Z
+X runs to the screen's lower right (shade), +Y to the lower left (lit), tops lightest.
World (0, 0, 0) is the tile's top vertex at ground level: every prop's anchor (anchorVertex "top").

Run with plain `python gen.py`; it writes out/, manifest.json, preview.png. No randomness.
"""
import json, math, os
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
    """world points (..., 3) to screen (..., 2)"""
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


def solid(c):
    col = hx(c)
    return lambda P: np.broadcast_to(col, (len(P), 3)).copy()


# ======================================================================== the world renderer
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
        """the three faces the camera sees of a box: the top, the +Y face (lit, screen left: `west` of the
        picture) and the +X face (shade, screen right: `east`)"""
        if top:
            self.face([(x0, y0, z1), (x1, y0, z1), (x1, y1, z1), (x0, y1, z1)], top, bias, tag=tag)
        if west:
            self.face([(x0, y1, z0), (x1, y1, z0), (x1, y1, z1), (x0, y1, z1)], west, bias, tag=tag)
        if east:
            self.face([(x1, y0, z0), (x1, y1, z0), (x1, y1, z1), (x1, y0, z1)], east, bias, tag=tag)

    def draw(self, pad=3):
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
            if abs(np.linalg.det(M)) < 1e-9:
                continue
            o2 = P2S(O) - lo
            st = np.linalg.solve(M, np.stack([xs + 0.5 - o2[0], ys + 0.5 - o2[1]]))
            P = O[None] + st[0][:, None] * A[None] + st[1][:, None] * B[None]
            P = np.clip(P, pts.min(0) - 0.5, pts.max(0) + 0.5)     # an edge-on face stays on its box
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


# ======================================================================== the house palettes
# furniture wood (docs/art/06): tops, the lit +Y faces, the shaded +X faces; the gaps and the grain
WOOD = {"top": ("#7d5a3c", "#77553a"), "west": ("#6a4a30", "#644529"), "east": ("#4f3622", "#4a321f")}
WGAP = {"top": "#4a3322", "west": "#3a2716", "east": "#2c1d12"}
WGRAIN = {"top": "#6c4b30", "west": "#5a3d25", "east": "#432d1b"}
# iron, black and a little cool (the chest's, docs/art/06 "metal #2b2a32 with #4a4952 highlight")
IRON = {"glint": "#8a8c96", "hi": "#6a6872", "top": "#5a5862", "west": "#4a4952", "east": "#36353d", "dark": "#2b2a32", "deep": "#222127"}
STEEL = ("#c6cad2", "#9ea2ac", "#6e7280")
SHAVE = ("#e2c898", "#c8a470", "#a07c4e")              # pale shavings, light to dark
STONE = ("#aaa49a", "#8e8880", "#6f6a63", "#4f4a46")    # the fireplace's stone, light to dark
BARK = ("#6e5a48", "#5c4a3a", "#4a3a2d", "#3a2d22")
ENDGRAIN = ("#c8a26c", "#a07c4e", "#7a5c38")
ASH = ("#5a524c", "#463f3a", "#352f2b")
FLAME = {"edge": "#6e1e10", "red": "#b8401c", "orange": "#e07a26", "yellow": "#f2b33e", "core": "#f8dc7a"}  # fire_0's


def boards(face, across=None, w=6, grain=True, seed=0, tones=None):
    """furniture boards on a face (`top`, `west`, `east`): `across` is the world axis the joints step
    along (0 X, 1 Y, 2 Z) every `w` units; a sparse grain fleck"""
    t = tones or WOOD[face]
    a, b = hx(t[0]), hx(t[1])
    gap, grn = hx(WGAP[face]), hx(WGRAIN[face])

    def sh(P):
        n = len(P)
        if across is None:
            out = np.broadcast_to(a, (n, 3)).copy()
        else:
            u = P[:, across]
            out = np.where((np.floor(u / w).astype(int) % 2 == 0)[:, None], a, b).astype(np.uint8)
            out[np.floor(u).astype(int) % w == 0] = gap
        if grain:
            g = noise(np.floor(P[:, 0]), np.floor(P[:, 1]) // 3, np.floor(P[:, 2]) // 2, seed) % 11 == 0
            out[g] = grn
        return out
    return sh


def wood_block(W, x0, y0, z0, x1, y1, z1, top_across=None, side_across=None, w=6, bias=0.0, grain=True, tag=None):
    W.block(x0, y0, z0, x1, y1, z1, top=boards("top", top_across, w, grain), west=boards("west", side_across, w, grain),
            east=boards("east", side_across, w, grain), bias=bias, tag=tag)


def iron_block(W, x0, y0, z0, x1, y1, z1, bias=0.4, tag=None):
    W.block(x0, y0, z0, x1, y1, z1, top=solid(IRON["top"]), west=solid(IRON["west"]), east=solid(IRON["dark"]), bias=bias, tag=tag)


def light_band(ang, cuts=(0.5, 0.0, -0.55)):
    """0 (lit) .. 3 (darkest) for an upright surface whose ground normal has angle `ang`:
    a +Y normal is lit, a +X normal in shade"""
    f = (np.sin(ang) - np.cos(ang)) / math.sqrt(2)
    return np.where(f > cuts[0], 0, np.where(f > cuts[1], 1, np.where(f > cuts[2], 2, 3)))


def turned(W, cx, cy, prof, shade, n=48, bias=0.0, inside=False, tag=None):
    """a surface of revolution round a vertical axis at (cx, cy), prof [(z, r), ...] upward;
    `inside` draws its far half seen from within (a pot's inner wall)"""
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


def annulus(W, cx, cy, z, r0, r1, shade, n=48, bias=0.0, tag=None):
    for i in range(n):
        a0, a1 = 2 * math.pi * (i - 0.3) / n, 2 * math.pi * (i + 1.3) / n
        W.face([(cx + r1 * math.cos(a0), cy + r1 * math.sin(a0), z), (cx + r1 * math.cos(a1), cy + r1 * math.sin(a1), z),
                (cx + r0 * math.cos(a1), cy + r0 * math.sin(a1), z), (cx + r0 * math.cos(a0), cy + r0 * math.sin(a0), z)],
               shade, bias, O=(cx, cy, z), A=(1, 0, 0), B=(0, 1, 0), tag=tag)


# ======================================================================== the cupboard
def cupboard():
    """a tall kitchen cupboard, long side along Y, its back to a west wall (low X) and its two doors
    toward +X: a plinth, a boarded carcass, two framed doors with sunk panels, iron strap hinges on
    their outer edges, two ring pulls where they meet, a moulded cornice, a jug and a crock on top"""
    W = World()
    X0, X1, Y0, Y1 = 7.0, 19.0, 4.0, 28.0
    ZP, ZC, ZK = 3.5, 54.0, 59.0          # plinth top, carcass top, cornice top
    YM = (Y0 + Y1) / 2
    # the plinth, set back half a unit, with a dark kick line at the floor
    kick = lambda face: (lambda P: np.where((P[:, 2] < 1.0)[:, None], hx(WGAP[face]), hx(WOOD[face][1])).astype(np.uint8))
    W.block(X0 + 0.5, Y0 + 0.5, 0, X1 - 0.5, Y1 - 0.5, ZP, west=kick("west"), east=kick("east"))
    # the front: a frame of stiles and rails, two doors with sunk panels, hinges and pulls
    DZ0, DZ1 = ZP + 3.0, ZC - 3.0        # the doors' bottom and top
    S = 2.0                               # the frame's stile width
    doors = [(Y0 + S, YM - 0.25), (YM + 0.25, Y1 - S)]
    hinge_z = [(DZ0 + 4.5, DZ0 + 6.3), (DZ1 - 6.3, DZ1 - 4.5)]
    D_BASE, D_ALT, D_SUNK, D_LIT = hx("#583c26"), hx("#523823"), hx("#46301d"), hx("#664630")

    def front(P):
        y, z = P[:, 1], P[:, 2]
        n = len(P)
        out = np.broadcast_to(hx(WOOD["east"][0]), (n, 3)).copy()       # the frame
        g = noise(np.floor(y) // 2, np.floor(z) // 3, 5) % 13 == 0
        out[g] = hx(WGRAIN["east"])
        for k, (a, b) in enumerate(doors):
            ind = (y >= a) & (y < b) & (z >= DZ0) & (z < DZ1)
            out[ind] = D_BASE if k == 0 else D_ALT
            # the sunk panel: two above each other in each door, a shadow line on its top and far
            # (low Y) edges, a lit line on its bottom and near edges
            for (pz0, pz1) in ((DZ0 + 2.5, (DZ0 + DZ1) / 2 - 1.0), ((DZ0 + DZ1) / 2 + 1.0, DZ1 - 2.5)):
                py0, py1 = a + 2.0, b - 2.0
                pin = ind & (y >= py0) & (y < py1) & (z >= pz0) & (z < pz1)
                out[pin] = D_SUNK
                out[pin & ((z >= pz1 - 1.0) | (y < py0 + 1.0))] = hx("#3a2716")
                out[pin & ((z < pz0 + 1.0) | (y >= py1 - 1.0)) & ~((z >= pz1 - 1.0) | (y < py0 + 1.0))] = D_LIT
            # the door's edge in its frame: a dark gap round it
            edge = ind & ((y < a + 0.7) | (y >= b - 0.7) | (z < DZ0 + 0.8) | (z >= DZ1 - 0.8))
            out[edge] = hx(WGAP["east"])
            # strap hinges on the outer edge: a strap with a rounded tip, its knuckle on the stile
            for (hz0, hz1) in hinge_z:
                band = (z >= hz0) & (z < hz1)
                if k == 0:
                    strap = band & (y >= a - 1.4) & (y < a + 6.0)
                    tip = band & (y >= a + 6.0) & (y < a + 7.2) & (z >= hz0 + 0.45) & (z < hz1 - 0.45)
                else:
                    strap = band & (y >= b - 6.0) & (y < b + 1.4)
                    tip = band & (y >= b - 7.2) & (y < b - 6.0) & (z >= hz0 + 0.45) & (z < hz1 - 0.45)
                out[strap | tip] = hx(IRON["top"])
                out[strap & (z >= hz1 - 0.7)] = hx(IRON["hi"])
                out[(strap | tip) & (z < hz0 + 0.6)] = hx(IRON["dark"])
        # the gap between the two doors
        out[(np.abs(y - YM) < 0.5) & (z >= DZ0) & (z < DZ1)] = hx("#24170e")
        # ring pulls either side of the meeting edge, at about hand height
        for yc in (YM - 1.6, YM + 1.6):
            pull = (np.abs(y - yc) < 0.7) & (z >= 27.0) & (z < 30.4)
            out[pull] = hx(IRON["top"])
            out[pull & (z >= 29.4)] = hx(IRON["glint"])
            out[pull & (z < 27.8)] = hx(IRON["dark"])
        return out
    W.block(X0, Y0, ZP, X1, Y1, ZC, top=None, west=boards("west", 0, 6), east=front)
    # the cornice: a narrow fillet, then the overhanging cap
    W.block(X0 - 0.3, Y0 - 0.5, ZC, X1 + 0.6, Y1 + 0.5, ZC + 1.5, top=solid(WOOD["top"][1]),
            west=solid("#5a3d25"), east=solid("#3e2a1a"), bias=0.1)
    W.block(X0 - 0.6, Y0 - 1.0, ZC + 1.5, X1 + 1.4, Y1 + 1.0, ZK, top=boards("top", 0, 5),
            west=lambda P: np.where((P[:, 2] >= ZK - 1.0)[:, None], hx("#7d5a3c"), hx(WOOD["west"][0])).astype(np.uint8),
            east=lambda P: np.where((P[:, 2] >= ZK - 1.0)[:, None], hx("#5e4229"), hx(WOOD["east"][0])).astype(np.uint8), bias=0.2)
    # on top: a stoneware crock and a clay jug, toward the wall
    pot(W, 11.0, 9.5, ZK, 5.0, 2.6, CROCK, neck=0.62, lip=1.0)
    pot(W, 11.5, 21.5, ZK, 6.5, 2.4, TERRA, neck=0.55, lip=1.1)
    return W.draw()


TERRA = ["#c27a52", "#a8603e", "#8a4c30", "#6a3824"]
CROCK = ["#d0bc94", "#b8a47c", "#968260", "#76664a"]


def pot(W, cx, cy, z0, h, R, ramp, neck=0.7, lip=1.0, bias=0.3):
    """a small round-bellied pot: belly, neck, a rolled lip and a dark mouth"""
    rn = R * neck
    cols = np.stack([hx(c) for c in ramp])

    def sh(P):
        b = light_band(np.arctan2(P[:, 1] - cy, P[:, 0] - cx), (0.45, 0.0, -0.55))
        lipz = P[:, 2] >= z0 + h - lip
        return cols[np.where(lipz, np.maximum(b - 1, 0), b)]
    prof = [(z0, R * 0.7), (z0 + h * 0.18, R * 0.95), (z0 + h * 0.45, R), (z0 + h * 0.75, R * 0.85),
            (z0 + h - lip, rn), (z0 + h - lip, rn + 0.5), (z0 + h, rn + 0.5)]
    turned(W, cx, cy, prof, sh, n=32, bias=bias)
    annulus(W, cx, cy, z0 + h, rn - 0.4, rn + 0.5, solid(ramp[0]), n=32, bias=bias)
    disc(W, cx, cy, z0 + h - 0.05, rn - 0.4, solid("#2a201a"), n=24, bias=bias - 0.05)


# ======================================================================== the workbench
def workbench():
    """a long, heavy plank workbench across two tiles (footprint 1 by 2 along Y as drawn, as the table
    and the bed), its back to a west wall (low X), the worker's side toward +X: a thick top of three
    planks on four stout legs with a low shelf between the stretchers, a leg vice at the far end of the
    front, a rack along the back with three chisels, a saw, a plane, a mallet stood on its head, shavings.
    World Y runs 0 to 64 here; the anchor is the first tile's top vertex at ground level."""
    W = World()
    X0, X1, Y0, Y1 = 7.0, 25.0, 3.0, 61.0
    ZT0, ZT1 = 20.0, 24.0               # the top: four thick, its face at 24 (the table's at 22)
    # legs: four stout square legs, set in a little from the ends
    for (lx, ly) in ((X0 + 1, Y0 + 2), (X1 - 5, Y0 + 2), (X0 + 1, Y1 - 6), (X1 - 5, Y1 - 6)):
        wood_block(W, lx, ly, 0, lx + 4, ly + 4, ZT0, grain=True)
    # stretchers low at the front and the back, across each end, and a shelf board laid on them
    for x in (X0 + 1.5, X1 - 4.5):
        wood_block(W, x, Y0 + 6, 4.0, x + 3.0, Y1 - 6, 7.0, grain=False, bias=-0.1)
    for y in (Y0 + 2.5, Y1 - 5.0):
        wood_block(W, X0 + 5.0, y, 4.0, X1 - 5.0, y + 2.5, 7.0, grain=False, bias=-0.1)
    W.block(X0 + 4.5, Y0 + 6.0, 7.0, X1 - 4.5, Y1 - 6.0, 8.2, top=boards("top", 0, 4), west=None,
            east=boards("east", None), bias=-0.2)
    # on the shelf: a couple of offcuts and a short log end
    W.block(X0 + 6.0, Y0 + 32.0, 8.2, X0 + 9.0, Y0 + 44.0, 10.0, top=solid("#a07c4e"), west=solid("#8a6a42"), east=solid("#6a4e30"), bias=-0.15)
    W.block(X0 + 6.5, Y0 + 12.0, 8.2, X0 + 10.5, Y0 + 16.0, 12.0, top=solid(ENDGRAIN[0]), west=solid(BARK[1]), east=solid(BARK[2]), bias=-0.15)
    # the top: thick planks along Y (the joints step along X), the end grain on the near end
    plank_top = boards("top", 0, 6)
    def end_grain(P):
        out = boards("west", 0, 6)(P)
        u = P[:, 0] % 6
        out[(np.abs(u - 3.0) < 0.7) & (np.abs(P[:, 2] - (ZT0 + ZT1) / 2) < 0.7)] = hx(WGRAIN["west"])
        return out
    W.block(X0, Y0, ZT0, X1, Y1, ZT1, top=plank_top, west=end_grain, east=boards("east", None))
    # the rack along the back, on the top at the far half: a rail with three chisels standing in it
    RY0, RY1 = Y0 + 9.0, Y0 + 25.0
    W.block(X0 + 0.5, RY0, ZT1, X0 + 3.0, RY1, ZT1 + 3.0, top=boards("top", None), west=boards("west", None),
            east=boards("east", None), bias=0.05)
    for i, y in enumerate((RY0 + 3.0, RY0 + 7.0, RY0 + 11.0)):
        h = (6.0, 8.0, 5.5)[i]
        W.block(X0 + 1.1, y, ZT1 + 3.0, X0 + 2.5, y + 1.4, ZT1 + 3.0 + h, top=solid("#c8a470"),
                west=solid("#a8784a"), east=solid("#73502e"), bias=0.2)
        W.block(X0 + 0.9, y - 0.2, ZT1 + 3.0, X0 + 2.7, y + 1.6, ZT1 + 3.9, top=solid(IRON["top"]), west=solid(IRON["west"]),
                east=solid(IRON["dark"]), bias=0.25)
    # the leg vice at the far end of the front: a tall chop before the front leg, its screw and bar
    VY0, VY1 = Y0 + 1.5, Y0 + 7.0
    chop_e = lambda P: np.where((P[:, 2] > ZT1 - 1.4)[:, None], hx("#6a4a30"), hx("#5a3d25")).astype(np.uint8)
    W.block(X1, VY0, 1.0, X1 + 2.5, VY1, ZT1 + 1.0, top=solid("#8c6646"), west=solid("#7a5636"), east=chop_e, bias=0.2)
    yv, zv = (VY0 + VY1) / 2, 16.5
    W.block(X1 + 2.5, yv - 1.2, zv - 1.2, X1 + 4.0, yv + 1.2, zv + 1.2, top=solid("#8a6a4a"), west=solid("#76583a"),
            east=solid("#5a4028"), bias=0.3)
    W.block(X1 + 4.0, yv - 6.0, zv - 0.6, X1 + 5.2, yv + 6.0, zv + 0.6, top=solid("#c8a470"), west=solid("#a8784a"),
            east=solid("#8a6a42"), bias=0.35)
    for e in (yv - 6.0, yv + 4.8):
        W.block(X1 + 3.8, e, zv - 1.0, X1 + 5.4, e + 1.2, zv + 1.0, top=solid("#c8a470"), west=solid("#a8784a"),
                east=solid("#73502e"), bias=0.4)
    # the saw on the top, toward the far end: a steel blade, its teeth toward the front, a dark handle
    SZ = ZT1 + 0.3
    def blade(P):
        x, y = P[:, 0], P[:, 1]
        out = np.broadcast_to(hx(STEEL[1]), (len(P), 3)).copy()
        out[x < 13.2] = hx(STEEL[0])
        out[(x > 17.6) & ((np.floor(y).astype(int) % 2) == 0)] = hx(STEEL[2])
        return out
    W.face([(12.0, 14.0, SZ), (18.4, 14.0, SZ), (18.4, 30.0, SZ), (14.2, 30.0, SZ)], blade, 0.3)
    def handle(P):
        hole = (P[:, 0] > 13.8) & (P[:, 0] < 16.4) & (P[:, 1] > 31.2) & (P[:, 1] < 33.0)
        return np.where(hole[:, None], hx("#3a2716"), hx("#8a5a34")).astype(np.uint8)
    W.block(12.0, 30.0, ZT1, 18.4, 34.5, SZ + 0.9, top=handle, west=solid("#6e4628"), east=solid("#5a3a20"), bias=0.35)
    # a smoothing plane in the middle of the front, its iron showing, a curl of shaving off its mouth
    PX0, PX1, PY0, PY1 = 17.5, 21.5, 37.0, 47.0
    def plane_top(P):
        y = P[:, 1]
        out = np.broadcast_to(hx("#b08254"), (len(P), 3)).copy()
        out[(y > 41.2) & (y < 42.6)] = hx("#3a2716")                       # the mouth
        out[(y > 42.6) & (y < 44.4) & (P[:, 0] > 18.8) & (P[:, 0] < 20.7)] = hx(STEEL[1])   # the iron's wedge
        return out
    W.block(PX0, PY0, ZT1, PX1, PY1, ZT1 + 2.4, top=plane_top, west=solid("#94683e"), east=solid("#73502e"), bias=0.3)
    W.block(PX0 + 0.8, PY0 + 4.6, ZT1 + 2.4, PX1 - 0.8, PY0 + 6.0, ZT1 + 4.0, top=solid(STEEL[0]), west=solid(STEEL[1]),
            east=solid(STEEL[2]), bias=0.35)                                   # the iron's top, standing proud
    # the mallet, stood on its head at the near end with its handle up
    W.block(14.0, 52.0, ZT1, 18.0, 55.0, ZT1 + 3.0, top=solid("#c09868"), west=solid("#a07a4c"), east=solid("#7a5a36"), bias=0.3)
    W.block(15.4, 52.9, ZT1 + 3.0, 16.6, 54.1, ZT1 + 10.5, top=solid("#c8a470"), west=solid("#a8784a"), east=solid("#73502e"), bias=0.3)
    # shavings: pale curls by the vice, round the plane, and a few fallen to the near end
    for (cx_, cy_) in ((21.6, 7.0), (19.8, 10.6), (22.4, 34.8), (21.6, 49.2), (23.0, 52.4)):
        def curl(P, cx_=cx_, cy_=cy_):
            d = np.hypot(P[:, 0] - cx_, P[:, 1] - cy_)
            out = np.broadcast_to(hx(SHAVE[0]), (len(P), 3)).copy()
            out[(P[:, 0] - cx_) > 0.5] = hx(SHAVE[1])
            out[d < 0.7] = hx(SHAVE[2])
            return out
        disc(W, cx_, cy_, ZT1 + 0.35, 1.3, curl, n=12, bias=0.25)
    return W.draw()


# ======================================================================== the cauldron
CX = CY = 16.0
Z0, ZR = 7.0, 21.5                       # the pot's underside and its rim
# the pot's profile upward, (z, radius): a round belly, a shoulder in to the neck, a rolled lip
POT_PROFILE = [(Z0, 2.8), (Z0 + 0.6, 5.2), (Z0 + 1.7, 7.2), (Z0 + 3.2, 8.6), (Z0 + 5.4, 9.3), (Z0 + 7.6, 9.3),
               (Z0 + 9.8, 8.8), (Z0 + 11.6, 7.9), (ZR - 1.8, 7.3), (ZR - 1.8, 8.1), (ZR, 8.1)]
R_IN = 6.8                               # the mouth
LUG_R = 8.7                              # where the lugs stand out
LEG_ANGLES = (math.radians(135), math.radians(-45), math.radians(225))   # under the lugs and at the back: the front clear
LOG_ANGLES = (math.radians(12), math.radians(78), math.radians(225))     # a V toward the camera, one behind
LIGHT = np.array([-0.45, 0.62, 0.85]) / np.linalg.norm([-0.45, 0.62, 0.85])   # from the top left


def round_iron(cx, cy, prof, glint=True):
    """iron on a turned surface, banded in four by the true normal against the light (so the belly
    darkens as it turns under and toward +X), a glint high on the lit shoulder"""
    zs = np.array([(a[0] + b[0]) / 2 for a, b in zip(prof, prof[1:]) if b[0] > a[0]])
    ns = []
    for a, b in zip(prof, prof[1:]):
        if b[0] > a[0]:
            dz, dr = b[0] - a[0], b[1] - a[1]
            l = math.hypot(dz, dr)
            ns.append((dz / l, -dr / l))         # (radial, up)
    ns = np.array(ns)
    tones = np.stack([hx(IRON[k]) for k in ("glint", "hi", "west", "east", "deep")])

    def sh(P):
        ang = np.arctan2(P[:, 1] - cy, P[:, 0] - cx)
        nr = np.interp(P[:, 2], zs, ns[:, 0])
        nz = np.interp(P[:, 2], zs, ns[:, 1])
        n = np.stack([nr * np.cos(ang), nr * np.sin(ang), nz], -1)
        d = n @ LIGHT
        b = np.where(d > 0.93, 0, np.where(d > 0.55, 1, np.where(d > 0.12, 2, np.where(d > -0.3, 3, 4))))
        if not glint:
            b = np.maximum(b, 1)
        return tones[b]
    return sh


def cauldron_world():
    """the prop: a black iron cauldron on three short legs over a ring of fieldstones, three logs laid
    spoke-wise under it in a bed of ash, two lugs and a bail standing up. Unlit: the flames are frames."""
    W = World()
    # the ash bed inside the ring
    def ash(P):
        r = np.hypot(P[:, 0] - CX, P[:, 1] - CY)
        out = np.broadcast_to(hx(ASH[1]), (len(P), 3)).copy()
        out[noise(np.floor(P[:, 0]), np.floor(P[:, 1]), 3) % 4 == 0] = hx(ASH[0])
        out[r < 5.0] = hx(ASH[2])
        out[(r < 5.0) & (noise(np.floor(P[:, 0]), np.floor(P[:, 1]), 9) % 3 == 0)] = hx("#241e1b")
        return out
    disc(W, CX, CY, 0.2, 11.0, ash, n=40, bias=-2.0, tag="ash")
    # the ring: ten fieldstones, each a low rounded lump shaded by its own normal
    scol = np.stack([hx(c) for c in STONE])
    for i in range(10):
        a = 2 * math.pi * (i + 0.5) / 10
        r = 12.0 + (0.5 if i % 3 == 0 else 0.0)
        sx, sy = CX + r * math.cos(a), CY + r * math.sin(a)
        sh_ = 2.2 + 0.5 * ((i * 7) % 3)
        sr = 2.7 + 0.3 * ((i * 5) % 2)
        def stone(P, sx=sx, sy=sy, sh_=sh_, i=i):
            b = light_band(np.arctan2(P[:, 1] - sy, P[:, 0] - sx), (0.4, -0.1, -0.6))
            b = np.where(P[:, 2] > sh_ * 0.75, np.maximum(b - 1, 0), b)
            fleck = (noise(np.floor(P[:, 0] * 2), np.floor(P[:, 1] * 2), i) % 9 == 0) & (b < 3)
            b = np.where(fleck, b + 1, b)
            return scol[b]
        turned(W, sx, sy, [(0.0, sr), (sh_ * 0.6, sr * 0.95), (sh_, sr * 0.6), (sh_ + 0.5, 0.2)], stone, n=16, tag="stone")
        disc(W, sx, sy, sh_ + 0.5, 0.35, solid(STONE[0]), n=8, tag="stone")
    # three logs laid like spokes, their cut ends out toward the stones
    for k, a in enumerate(LOG_ANGLES):
        log(W, CX, CY, a, 1.0, 10.5, 1.4, k)
    # the legs: three short iron stubs with splayed feet
    for a in LEG_ANGLES:
        lx, ly = CX + 6.2 * math.cos(a), CY + 6.2 * math.sin(a)
        iron_block(W, lx - 0.8, ly - 0.8, 0.0, lx + 0.8, ly + 0.8, Z0 + 2.0, bias=0.3, tag="pot")
        iron_block(W, lx - 1.2, ly - 1.2, 0.0, lx + 1.2, ly + 1.2, 1.0, bias=0.35, tag="pot")
    # the pot
    turned(W, CX, CY, POT_PROFILE, round_iron(CX, CY, POT_PROFILE), n=64, tag="pot")
    rim_r = POT_PROFILE[-1][1]
    annulus(W, CX, CY, ZR, R_IN, rim_r, lambda P: np.where(
        ((P[:, 1] - CY) - (P[:, 0] - CX) > -3.0)[:, None], hx(IRON["glint"]), hx(IRON["hi"])).astype(np.uint8), n=64, bias=1.0, tag="pot")
    # the inside: the far inner wall down to the brew, the brew dark and still with one dull gleam
    turned(W, CX, CY, [(ZR - 4.0, R_IN), (ZR - 0.5, R_IN)], lambda P: np.where(
        (P[:, 2] > 99)[:, None], hx(IRON["east"]), hx(IRON["dark"])).astype(np.uint8), n=64, inside=True, bias=-0.5, tag="pot")
    def brew(P):
        out = np.broadcast_to(hx("#2a332b"), (len(P), 3)).copy()
        u, v = P[:, 0] - CX, P[:, 1] - CY
        out[(np.abs(v - u - 4.0) < 1.2) & (np.abs(u + v + 2.0) < 2.2)] = hx("#41503f")
        return out
    disc(W, CX, CY, ZR - 2.5, R_IN, brew, n=48, bias=-0.3, tag="pot")
    # two lugs where the bail is hung (the screen's left and right) and the bail standing up
    for a in (math.radians(135), math.radians(-45)):
        ex, ey = CX + LUG_R * math.cos(a), CY + LUG_R * math.sin(a)
        iron_block(W, ex - 0.8, ey - 0.8, ZR - 4.5, ex + 0.8, ey + 0.8, ZR - 1.5, bias=0.5, tag="pot")
    bail(W)
    return W.draw()


def log(W, cx, cy, a, r0, r1, rad, k):
    """a round log lying from radius r0 to r1 along ground angle a, its outer end cut"""
    ux, uy = math.cos(a), math.sin(a)
    vx, vy = -uy, ux
    n = 8
    sec = [(rad * math.cos(2 * math.pi * i / n), rad + rad * math.sin(2 * math.pi * i / n)) for i in range(n)]
    bcol = np.stack([hx(c) for c in BARK])
    for i in range(n):
        (pa, za), (pb, zb) = sec[i], sec[(i + 1) % n]
        mid = 2 * math.pi * (i + 0.5) / n
        nz, nh = math.sin(mid), math.cos(mid)
        ngx, ngy = nh * vx, nh * vy
        lit = 0 if nz > 0.55 else (1 if (ngy - ngx) / math.sqrt(2) > -0.1 else 2)
        def bark(P, lit=lit, k=k):
            out = np.broadcast_to(bcol[lit], (len(P), 3)).copy()
            out[noise(np.floor(P[:, 0] * 1.5), np.floor(P[:, 1] * 1.5), k) % 5 == 0] = bcol[min(lit + 1, 3)]
            return out
        p = lambda r, s, z: (cx + r * ux + s * vx, cy + r * uy + s * vy, z)
        W.face([p(r0, pa, za), p(r1, pa, za), p(r1, pb, zb), p(r0, pb, zb)], bark, 0.0, tag="log")
    def end(P):
        q = np.stack([(P[:, 0] - cx) * vx + (P[:, 1] - cy) * vy, P[:, 2] - rad], -1)
        d = np.hypot(q[:, 0], q[:, 1])
        out = np.broadcast_to(hx(ENDGRAIN[0]), (len(P), 3)).copy()
        out[d > rad - 0.6] = hx(BARK[2])
        out[d < 0.6] = hx(ENDGRAIN[2])
        return out
    W.face([(cx + r1 * ux + s * vx, cy + r1 * uy + s * vy, z) for (s, z) in sec], end, 0.05,
           O=(cx + r1 * ux, cy + r1 * uy, 0), A=(vx, vy, 0), B=(0, 0, 1), tag="log")


BAIL_TOP = ZR + 11.0


def bail(W):
    """the iron bail: a hoop from lug to lug standing up over the pot in the screen's plane, its
    left half lit"""
    n = 24
    d = 1 / math.sqrt(2)
    pts = []
    for i in range(n + 1):
        t = math.pi * i / n
        s = LUG_R * math.cos(t)
        z = ZR - 3.0 + (BAIL_TOP - ZR + 3.0) * math.sin(t) ** 0.8
        pts.append((s, z))
    for i in range(n):
        (s0, z0), (s1, z1) = pts[i], pts[i + 1]
        p0 = (CX + s0 * d, CY - s0 * d)       # +s runs to the screen's right (world angle -45)
        p1 = (CX + s1 * d, CY - s1 * d)
        c = IRON["hi"] if (s0 + s1) < -2 else IRON["west"] if (s0 + s1) < 6 else IRON["east"]
        W.face([(p0[0], p0[1], z0 - 0.5), (p1[0], p1[1], z1 - 0.5), (p1[0], p1[1], z1 + 0.5), (p0[0], p0[1], z0 + 0.5)],
               solid(c), 0.0, tag="bail")


# the flames' tongues per frame: (screen x from the centre, height); the middle ones stand under the
# pot and are cut by its belly, the outer ones lick up round its sides
TONGUES = [
    [(-13, 6), (-9, 9), (-5, 7), (-1, 9), (3, 6), (7, 9), (11, 7)],
    [(-13, 8), (-9, 6), (-5, 9), (-1, 6), (3, 9), (7, 6), (11, 8)],
    [(-13, 5), (-9, 8), (-5, 8), (-1, 7), (3, 8), (7, 8), (11, 5)],
]


def flames(pic, k):
    """flame frame k (0..2) of the fire under the cauldron, drawn on the prop's own canvas and kept only
    where nothing of the prop stands in front of it (the pot, its legs, the front log and stones), so
    the flames show under the pot and lick up round its belly. fire_0's palette: tongues two pixels
    wide, a yellow core at the foot, orange, red at the tip, a dark red edge; the logs' lit tops glow."""
    H, Wd = pic.alpha.shape
    ox, oy = pic.origin
    C = CX + 1.0                      # the flames' plane, a unit toward the camera from the centre
    foot = int(math.floor(oy + C)) - 1
    col = np.zeros((H, Wd, 3), np.uint8)
    m = np.zeros((H, Wd), bool)
    for j, (dx, h) in enumerate(TONGUES[k]):
        x0 = int(round(ox + dx))
        for x in (x0, x0 + 1):
            for y in range(foot - h + 1, foot + 1):
                f = (foot - y) / h
                if f > 0.6 and x == x0 + 1 - ((j + k) % 2):
                    continue                  # the upper part one pixel wide
                c = FLAME["core"] if f < 0.3 else FLAME["yellow"] if f < 0.5 else FLAME["orange"] if f < 0.75 else FLAME["red"]
                m[y, x] = True
                col[y, x] = hx(c)
        tx = x0 + ((j + k) % 2)       # a one-pixel tip, leaning one way or the other
        m[foot - h, tx] = True
        col[foot - h, tx] = hx(FLAME["red"])
    # the tongues stand on a bed of flame two rows deep
    xs_all = [int(round(ox + dx)) for dx, _ in TONGUES[k]]
    for x in range(min(xs_all), max(xs_all) + 2):
        for y in (foot, foot - 1):
            if not m[y, x]:
                m[y, x] = True
                col[y, x] = hx(FLAME["yellow"] if y == foot else FLAME["orange"])
    p = np.pad(m, 1)
    ring = (p[:-2, 1:-1] | p[2:, 1:-1] | p[1:-1, :-2] | p[1:-1, 2:]) & ~m
    col[ring] = hx(FLAME["edge"])
    m |= ring
    # keep what is in front of the prop: on the plane a pixel row y is height C - (y - oy), depth 2C + z
    ys, xs = np.nonzero(m)
    dep = 2 * C + (C - (ys + 0.5 - oy))
    keep = dep + 0.3 >= pic.zb[ys, xs]
    out = np.zeros_like(m)
    out[ys[keep], xs[keep]] = True
    # embers on the logs' lit tops where no flame covers them
    ey, ex_ = np.nonzero((pic.tags == "log") & ~out)
    if len(ey):
        top_lit = (pic.col[ey, ex_] == hx(BARK[0])).all(1)
        sel = top_lit & (noise(ex_, ey, k) % 2 == 0)
        col[ey[sel], ex_[sel]] = np.where((noise(ex_[sel], ey[sel], k + 7) % 3 == 0)[:, None], hx(FLAME["orange"]), hx(FLAME["red"]))
        out[ey[sel], ex_[sel]] = True
    return out, col


# ======================================================================== items in screen space
class Canvas:
    def __init__(self, w, h):
        self.w, self.h = w, h
        self.col = np.zeros((h, w, 3), np.uint8)
        self.a = np.zeros((h, w), bool)
        self.yy, self.xx = np.mgrid[0:h, 0:w].astype(float) + 0.5

    def paint(self, mask, c):
        self.col[mask] = hx(c)
        self.a |= mask

    def recolour(self, mask, c):
        mask = mask & self.a
        self.col[mask] = hx(c)

    def outline(self, c=OUTLINE):
        p = np.pad(self.a, 1)
        ring = (p[:-2, 1:-1] | p[2:, 1:-1] | p[1:-1, :-2] | p[1:-1, 2:]) & ~self.a
        self.col[ring] = hx(c)
        self.a |= ring

    def crop(self):
        ys = np.where(self.a.any(1))[0]
        xs = np.where(self.a.any(0))[0]
        return ys.min(), ys.max() + 1, xs.min(), xs.max() + 1

    def image(self, box=None):
        y0, y1, x0, x1 = box or self.crop()
        rgba = np.zeros((y1 - y0, x1 - x0, 4), np.uint8)
        rgba[..., :3] = self.col[y0:y1, x0:x1]
        rgba[..., 3] = self.a[y0:y1, x0:x1] * 255
        return Image.fromarray(rgba, "RGBA"), (x0, y0)


# the Cauldron item's iron, a step lighter than the prop's: black iron drawn with the prop's ramp sank
# into the bag's dark slot (#2a2622) and the outline at its shaded side
IIRON = {"glint": "#a4a6b0", "hi": "#7e7c88", "top": "#6a6872", "west": "#5a5862", "east": "#46454e", "dark": "#3a3942", "deep": "#33323a"}


def cauldron_item(s):
    """the Cauldron as a thing: the black pot on its three legs, two lugs and the bail up.
    `s` is the scale (1 the world picture). Returns the canvas and the grip (the bail's top)."""
    W_, H_ = int(30 * s) + 8, int(34 * s) + 8
    c = Canvas(W_, H_)
    yy, xx = c.yy, c.xx
    cx = W_ / 2
    R = 8.6 * s                   # belly half width
    rimy = 14.0 * s + 3           # rim line
    rimrx, rimry = 7.4 * s, 2.7 * s
    by = rimy + 6.6 * s           # the belly's widest row
    bry = 6.4 * s
    belly = ((xx - cx) / R) ** 2 + ((yy - by) / bry) ** 2 <= 1
    neck = (np.abs(xx - cx) <= rimrx) & (yy >= rimy) & (yy <= by)
    body = (belly | neck) & (yy >= rimy)
    # legs: two at the front-left and front-right, one behind in the middle (shorter)
    legh = 3.6 * s
    lw = max(1.0, 1.6 * s)
    legs = np.zeros_like(body)
    for (lx, extra) in ((-0.55, 0.0), (0.55, 0.0), (0.0, -1.2 * s)):
        x0 = cx + lx * R
        top = by + bry * 0.55
        legs |= (np.abs(xx - x0) <= lw / 2 + 0.01) & (yy >= top) & (yy < by + bry + legh + extra)
        # a little splayed foot
        legs |= (np.abs(xx - x0 - (0.6 if lx > 0 else -0.6 if lx < 0 else 0)) <= lw / 2 + 0.6) & \
                (yy >= by + bry + legh + extra - max(1.0, 0.8 * s)) & (yy < by + bry + legh + extra)
    c.paint(legs & ~body, IIRON["east"])
    c.recolour(legs & (xx < cx - 0.2 * R), IIRON["west"])
    # the belly, banded across: lit at the left, shaded to the right, its underside dark
    sx = (xx - cx) / R
    c.paint(body, IIRON["west"])
    c.recolour(body & (sx < -0.45), IIRON["hi"])
    c.recolour(body & (sx > 0.3), IIRON["east"])
    c.recolour(body & (sx > 0.72), IIRON["deep"])
    c.recolour(body & (yy > by + bry * 0.55) & (sx > -0.6), IIRON["east"])
    c.recolour(body & (yy > by + bry * 0.55) & (sx > 0.2), IIRON["deep"])
    gl = ((xx - (cx - 0.5 * R)) / (1.1 * s + 0.6)) ** 2 + ((yy - (by - 0.25 * bry)) / (1.6 * s + 0.6)) ** 2 <= 1
    c.recolour(gl & body, IIRON["glint"])
    # a dark seam under the rim
    c.recolour(body & (yy >= rimy + rimry + 0.4 * s) & (yy < rimy + rimry + 0.4 * s + max(1.0, 0.7 * s)), IIRON["deep"])
    # the rim: an ellipse, lit along its near lip; the mouth dark, the brew a dull green-black
    rim = ((xx - cx) / (rimrx + 0.7 * s)) ** 2 + ((yy - rimy) / (rimry + 0.5 * s)) ** 2 <= 1
    c.paint(rim, IIRON["top"])
    c.recolour(rim & (xx < cx - 0.2 * rimrx), IIRON["hi"])
    c.recolour(rim & (xx > cx + 0.55 * rimrx), IIRON["east"])
    mouth = ((xx - cx) / (rimrx - 0.6 * s)) ** 2 + ((yy - rimy) / (rimry - 0.5 * s)) ** 2 <= 1
    c.paint(mouth, "#3a3940")
    brew = mouth & (yy > rimy - (rimry - 0.5 * s) * 0.2)
    c.recolour(brew, "#28302a")
    if s > 1.4:
        c.recolour(brew & (np.abs(xx - (cx - 0.25 * rimrx)) < 1.0) & (np.abs(yy - rimy - 0.3 * s) < 0.6), "#3e4a3c")
    # the lugs and the bail
    for side in (-1, 1):
        lx = cx + side * (rimrx + 1.1 * s)
        lug = (np.abs(xx - lx) <= max(0.6, 0.8 * s)) & (yy >= rimy - 0.2 * s) & (yy < rimy + 2.0 * s)
        c.paint(lug & ~mouth, IIRON["east"] if side > 0 else IIRON["west"])
    bt = rimy - 8.5 * s                   # the bail top
    ex = rimrx + 1.1 * s
    t = np.clip((xx - cx) / ex, -1, 1)
    arc = rimy - 0.2 * s - (rimy - 0.2 * s - bt) * np.sqrt(np.clip(1 - t ** 2, 0, 1))
    bw = max(1.0, 0.9 * s)
    bl = (np.abs(xx - cx) <= ex + 0.5) & (np.abs(yy - arc) < bw / 2 + 0.5 * np.abs(t) ** 6 * 3) & (yy < rimy) & ~rim
    c.paint(bl, IIRON["west"])
    c.recolour(bl & (xx < cx), IIRON["hi"])
    c.recolour(bl & (xx > cx + ex * 0.6), IIRON["east"])
    c.outline()
    gy = int(np.where(bl.any(1))[0].min())
    gx = int(round(cx - 0.5))
    while not c.a[gy, gx] or (c.col[gy, gx] == hx(OUTLINE)).all():
        gy += 1
    return c, (gx, gy)


# the Cauldron's world picture, hand-pixelled (docs/art/01: under about 20 px a person decides each
# pixel): 16 x 18, the same design as the icon, hung from the hand by the top of its bail
CAULDRON_WORLD = """
....oooooooo....
...ohhhhwwweo...
..ohooooooooeo..
.oho........oeo.
.ohooooooooooeo.
ohGhhhhhhhhwweeo
ohGmmmmmmmmmmweo
ohGbbnbbbbbbbweo
ooGGhhhhhhhwweoo
ohhwwwwwwwweeddo
oGGhwwwwwwweeddo
ohhwwwwwwwweeddo
.ohwwwwwwweeddo.
..oeeewwweeddo..
..owoooeeoooeo..
..owo..oo..oeo..
.owwo......oeeo.
.oooo......oooo.
"""
CAULDRON_KEY = {"o": OUTLINE, "G": IIRON["glint"], "h": IIRON["hi"], "w": IIRON["west"], "e": IIRON["east"], "d": IIRON["deep"],
                "k": IIRON["dark"], "m": "#3a3940", "b": "#2a332b", "n": "#41503f"}


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


LINEN = {"hi": "#ece4ce", "base": "#d8ceb2", "shade": "#bcb092", "dark": "#9a8e70", "stitch": "#8a7c5c"}
STRAP = {"hi": "#94825e", "base": "#7a6a4a", "shade": "#5e5038", "dark": "#463c2a"}
BRASS = ("#e2c06a", "#c39a44", "#8a6a2a")
WOODTOG = ("#b08254", "#8a6440", "#5e4028")


def satchel(s, strap_rise=1.0):
    """the Linen satchel: a soft linen bag with a round-cornered body and a gusset at its shaded side,
    a stitched flap closed with a wooden toggle on a leather loop, and a long shoulder strap with a
    brass buckle rising from its top corners. `s` is the scale; `strap_rise` how high the strap's arc
    stands (1 the full loop). Returns the canvas and the grip (the strap's top)."""
    bw, bh = 24.0 * s, 16.0 * s
    rise = 14.0 * s * strap_rise
    W_, H_ = int(bw + 6 * s) + 8, int(bh + rise + 4 * s) + 8
    c = Canvas(W_, H_)
    yy, xx = c.yy, c.xx
    x0 = 4 + 1.0 * s
    x1 = x0 + bw
    y1 = H_ - 4
    y0 = y1 - bh
    cr = 5.0 * s
    def rrect(xa, ya, xb, yb, r, rt=0.0):
        inside = (xx >= xa) & (xx < xb) & (yy >= ya) & (yy < yb)
        for (cxp, cyp, cond) in ((xa + r, yb - r, (xx < xa + r) & (yy > yb - r)), (xb - r, yb - r, (xx > xb - r) & (yy > yb - r))):
            inside &= ~(cond & (np.hypot(xx - cxp, yy - cyp) > r))
        if rt:
            for (cxp, cyp, cond) in ((xa + rt, ya + rt, (xx < xa + rt) & (yy < ya + rt)), (xb - rt, ya + rt, (xx > xb - rt) & (yy < ya + rt))):
                inside &= ~(cond & (np.hypot(xx - cxp, yy - cyp) > rt))
        return inside
    # the strap: an arc from the top corners, behind the bag
    sw = max(1.5, 1.7 * s)
    ax0, ax1 = x0 + 0.2 * s, x1 + 1.4 * s           # it is sewn to the gussets, at the bag's sides
    acx, aw = (ax0 + ax1) / 2, (ax1 - ax0) / 2
    t = np.clip((xx - acx) / aw, -1, 1)
    top_y = y0 - rise
    foot = y0 + 3.5 * s
    arc_y = foot - (foot - top_y) * np.sqrt(np.clip(1 - t ** 2, 0, 1))
    thick = sw / 2 + 0.3 + 2.4 * np.abs(t) ** 10 * s
    strap = (np.abs(xx - acx) <= aw + sw / 2) & (np.abs(yy - arc_y) < thick) & (yy < foot + 1)
    c.paint(strap, STRAP["base"])
    c.recolour(strap & (yy < arc_y - thick * 0.25) & (xx < acx + aw * 0.3), STRAP["hi"])
    c.recolour(strap & (xx > acx + aw * 0.55), STRAP["shade"])
    # the body and the gusset on the right
    gus = 2.4 * s
    body = rrect(x0, y0, x1, y1, cr)
    gusset = rrect(x1 - 0.5, y0 + 1.0 * s, x1 + gus, y1 - 1.0 * s, cr * 0.7) & ~body
    c.paint(gusset, LINEN["dark"])
    c.paint(body, LINEN["base"])
    c.recolour(body & (xx < x0 + 3.0 * s), LINEN["hi"])
    c.recolour(body & (xx > x1 - 4.0 * s), LINEN["shade"])
    c.recolour(body & (yy > y1 - 2.2 * s), LINEN["shade"])
    c.recolour(body & (yy > y1 - 2.2 * s) & (xx > x1 - 5.0 * s), LINEN["dark"])
    # a soft crease or two in the cloth below the flap
    if s >= 0.9:
        for (fx, fy0, fy1) in ((0.36, 0.7, 0.92), (0.66, 0.66, 0.9)):
            cx_ = x0 + fx * bw
            c.recolour(body & (np.abs(xx - cx_ - (yy - y0) * 0.08) < 0.5) & (yy > y0 + fy0 * bh) & (yy < y0 + fy1 * bh), LINEN["shade"])
    # the flap: from the top edge down over three fifths, its lower edge a shallow curve
    fy = y0 + 0.62 * bh
    fl_x0, fl_x1 = x0 - 0.5 * s, x1 + 0.4 * s
    curve = fy - 2.2 * s * ((xx - (fl_x0 + fl_x1) / 2) / ((fl_x1 - fl_x0) / 2)) ** 2
    flap = rrect(fl_x0, y0 - 0.8 * s, fl_x1, y1, cr * 0.6, rt=2.2 * s) & (yy < curve)
    c.paint(flap, LINEN["base"])
    c.recolour(flap & (yy < y0 + 1.6 * s), LINEN["hi"])
    c.recolour(flap & (xx < fl_x0 + 2.6 * s), LINEN["hi"])
    c.recolour(flap & (xx > fl_x1 - 3.4 * s), LINEN["shade"])
    # the flap's shadow on the body, a row under its edge
    under = body & ~flap & (yy < curve + max(1.0, 1.0 * s)) & (yy >= curve)
    c.recolour(under, LINEN["dark"])
    # the hem stitched round the flap, a dashed line inset from its edge
    if s >= 0.9:
        inset = max(1.5, 1.6 * s)
        p = np.pad(flap, int(math.ceil(inset)))
        k = int(math.ceil(inset))
        inner = flap.copy()
        for dy in range(-k, k + 1):
            for dx in range(-k, k + 1):
                if dx * dx + dy * dy <= inset * inset:
                    inner &= p[k + dy:k + dy + flap.shape[0], k + dx:k + dx + flap.shape[1]]
        q = np.pad(inner, 1)
        edge = inner & ~(q[:-2, 1:-1] & q[2:, 1:-1] & q[1:-1, :-2] & q[1:-1, 2:])
        dash = ((np.floor(xx) + np.floor(yy)) % 3) != 0
        c.recolour(edge & dash & (yy > y0 + 1.5 * s), LINEN["stitch"])
    # the closure: a leather loop down from the flap's point onto a wooden toggle sewn to the body
    mx = (fl_x0 + fl_x1) / 2 - 0.5
    loop = (np.abs(xx - mx) <= max(0.6, 0.9 * s)) & (yy >= fy - 3.0 * s) & (yy < fy + 2.2 * s)
    c.paint(loop, STRAP["base"])
    c.recolour(loop & (xx > mx + 0.2), STRAP["shade"])
    tog = (np.abs(xx - mx) <= max(1.6, 2.4 * s)) & (np.abs(yy - (fy + 2.6 * s)) <= max(0.6, 0.75 * s))
    c.paint(tog, WOODTOG[1])
    c.recolour(tog & (yy < fy + 2.6 * s), WOODTOG[0])
    c.recolour(tog & (xx > mx + 1.2 * s), WOODTOG[2])
    # the buckle on the strap's left side, at the icon's size and up
    if s >= 0.9:
        bx = acx - aw * 0.94
        by_ = y0 - rise * 0.32
        bk = (np.abs(xx - bx) <= 1.9 * s) & (np.abs(yy - by_) <= 1.4 * s)
        hole = (np.abs(xx - bx) <= 0.9 * s) & (np.abs(yy - by_) <= 0.5 * s)
        c.paint(bk & ~hole, BRASS[1])
        c.recolour(bk & ~hole & (yy < by_ - 0.5 * s), BRASS[0])
        c.recolour(bk & ~hole & (xx > bx + 1.0 * s), BRASS[2])
        c.paint(hole, STRAP["dark"])
    c.outline()
    ys = np.where(strap.any(1))[0]
    gy = int(ys.min())
    gx = int(round(acx - 0.5))
    while (c.col[gy, gx] == hx(OUTLINE)).all() or not c.a[gy, gx]:
        gy += 1
    return c, (gx, gy)


# ======================================================================== saving and checking
def save_pic(pic, name):
    pic.outline()
    im, anc = pic.image()
    check(im, name)
    im.save(os.path.join(OUT, name + ".png"))
    return im, anc


def check(im, name):
    assert outlined(im), name + ': not outlined all round'


def outlined(im):
    a = np.array(im)[..., 3]
    assert set(np.unique(a)) <= {0, 255}, name
    # every edge pixel of the silhouette is the outline colour (all round)
    al = a > 0
    p = np.pad(al, 1)
    edge = al & ~(p[:-2, 1:-1] & p[2:, 1:-1] & p[1:-1, :-2] & p[1:-1, 2:])
    rgb = np.array(im)[..., :3]
    return bool((rgb[edge] == hx(OUTLINE)).all(1).all())


def centred(im, w, h, name):
    assert im.width <= w and im.height <= h, (name, im.size, (w, h))
    c = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    c.alpha_composite(im, ((w - im.width) // 2, (h - im.height) // 2))
    return c


def main():
    res, info = {}, {}
    # ---- the furniture
    for name, fn in (("cupboard", cupboard), ("workbench", workbench)):
        res[name] = save_pic(fn(), name)
    # ---- the cauldron and its fire
    cw = cauldron_world()
    frames = [flames(cw, k) for k in range(3)]
    cw.outline()
    box = cw.box()
    im, anc = cw.image(box)
    check(im, "cauldron")
    im.save(os.path.join(OUT, "cauldron.png"))
    res["cauldron"] = (im, anc)
    y0, y1, x0, x1 = box
    # the three frames share one canvas: the union of their pixels
    um = np.zeros_like(frames[0][0])
    for m, _ in frames:
        um |= m
    fy = np.where(um.any(1))[0]
    fx = np.where(um.any(0))[0]
    fy0, fy1, fx0, fx1 = fy.min(), fy.max() + 1, fx.min(), fx.max() + 1
    for k, (m, col) in enumerate(frames):
        rgba = np.zeros((fy1 - fy0, fx1 - fx0, 4), np.uint8)
        rgba[..., :3] = col[fy0:fy1, fx0:fx1]
        rgba[..., 3] = m[fy0:fy1, fx0:fx1] * 255
        f = Image.fromarray(rgba, "RGBA")
        assert set(np.unique(rgba[..., 3])) <= {0, 255}
        f.save(os.path.join(OUT, f"cauldron_fire_{k}.png"))
    fw, fh = fx1 - fx0, fy1 - fy0
    # the pin: the frame's bottom middle; fire.at: the same pixel in the cauldron's picture
    pin = [int(fw // 2), int(fh - 1)]
    at = [int(fx0 - x0 + pin[0]), int(fy0 - y0 + pin[1])]
    info["fire"] = {"size": [int(fw), int(fh)], "base": pin, "at": at}
    # ---- the items
    items = {}
    ci = from_grid(CAULDRON_WORLD, CAULDRON_KEY)
    cim, off = ci.image()
    cgrip = (7, 1)
    check(cim, "cauldron_world")
    cim.save(os.path.join(OUT, "cauldron_world.png"))
    big, _ = cauldron_item(1.3)
    bim, _ = big.image()
    check(bim, "cauldron_icon")
    centred(bim, 38, 38, "cauldron_icon").save(os.path.join(OUT, "cauldron_icon.png"))
    items["cauldron"] = {"world": cim.size, "grip": cgrip, "icon": bim.size}
    si, sg = satchel(0.46)
    sim, off = si.image()
    sgrip = (int(sg[0] - off[0]), int(sg[1] - off[1]))
    check(sim, "satchel_world")
    sim.save(os.path.join(OUT, "satchel_world.png"))
    sb, _ = satchel(1.15, strap_rise=0.95)
    sbim, _ = sb.image()
    check(sbim, "satchel_icon")
    centred(sbim, 38, 38, "satchel_icon").save(os.path.join(OUT, "satchel_icon.png"))
    sp, _ = satchel(1.3, strap_rise=0.7)
    spim, _ = sp.image()
    check(spim, "satchel_portrait")
    centred(spim, 38, 38, "satchel_portrait").save(os.path.join(OUT, "satchel_portrait.png"))
    items["satchel"] = {"world": sim.size, "grip": sgrip, "icon": sbim.size, "portrait": spim.size}
    return res, info, items


# ======================================================================== the anchor self-check
def chair_check():
    """the drawn chair's front rebuilt from its box numbers (Claude Design's furniture.py, as round 4's
    check took them) in this renderer, flat colour: its size and anchor must come out as chair_front.png
    and chair.json have them (39 x 51, anchor 19, 25) for the anchors here to mean what the game's mean"""
    W = World()
    c = solid("#7d5a3c")
    for (x, y) in ((8, 8), (22, 8), (8, 22), (22, 22)):
        W.block(x, y, 0, x + 2, y + 2, 11, top=c, west=c, east=c)
    W.block(7, 7, 11, 25, 25, 14, top=c, west=c, east=c)
    for y in (7.5, 22.5):
        W.block(8, y, 14, 10, y + 2, 31, top=c, west=c, east=c)
    W.block(8, 7.5, 26, 10, 24.5, 31, top=c, west=c, east=c)
    im, anc = W.draw().outline().image()
    ref = Image.open(f"{REPO}/data/art/village/chair_front.png")
    ra = np.array(ref)[..., 3] > 0
    ma = np.array(im)[..., 3] > 0
    same = float((ra == ma).mean()) if ra.shape == ma.shape else None
    return im.size, anc, ref.size, same


# ======================================================================== the definitions and the manifest
# what a definition's picture is (replaced here); every other field of today's definition is kept
PICTURE_FIELDS = ("placeholder", "note", "anchorVertex", "facings", "facingFootprint", "drawings", "images", "image",
                  "frames", "anchor", "anchors", "bounds")


def definitions(res, fire):
    """each keeps every non-picture field of today's data/sprites/<id>.json, `placeholder` replaced"""
    today = {k: json.load(open(f"{REPO}/data/sprites/{k}.json", encoding="utf-8")) for k in ("cupboard", "workbench", "cauldron")}
    defs = {}
    for k, note in (
        ("cupboard", "the drawn cupboard (art round 5): a tall kitchen cupboard, two framed doors with sunk panels, iron strap hinges and ring pulls, a moulded cornice with a crock and a jug on top; backs against a west wall as drawn (y), a north wall as its mirror (x), as the shelf; once a dev box (docs/30 step 1; docs/29/09 has its art request)"),
        ("workbench", "the drawn workbench (art round 5): a long, heavy plank bench across two tiles, its top at 24, on four stout legs with a shelf between the stretchers, a leg vice at the far end of its front, three chisels in a rack along the back, a saw, a plane, and a mallet on the top, shavings; long side along y as drawn with its back to a west wall and the worker's side toward +x, along x as its mirror (as the table); once a dev box (docs/30 step 1; docs/29/09 has its art request)"),
    ):
        old = today[k]
        d = {"anchorVertex": "top", "facings": ["y", "x"],
             "drawings": {"y": {"image": f"data/art/village/{k}.png", "anchor": res[k][1]}, "x": {"from": "y", "mirror": True}}}
        if k == "workbench":       # two tiles, as the table and the bed: 1 by 2 along y, 2 by 1 along x
            d = {"anchorVertex": "top", "facings": ["y", "x"], "facingFootprint": {"y": [1, 2], "x": [2, 1]},
                 "drawings": d["drawings"]}
        for f, v in old.items():
            if f not in PICTURE_FIELDS:
                d[f] = v
        d["note"] = note
        defs[k] = d
    old = today["cauldron"]
    d = {}
    if "name" in old:
        d["name"] = old["name"]
    d.update({"anchorVertex": "top", "facings": ["y"],
              "drawings": {"y": {"image": "data/art/village/cauldron.png", "anchor": res["cauldron"][1]}}})
    f = dict(old["fire"])
    f.update({"at": fire["at"], "frames": [f"data/art/village/cauldron_fire_{k}.png" for k in range(3)], "base": fire["base"], "fps": 6})
    d["fire"] = f
    for k_, v in old.items():
        if k_ not in PICTURE_FIELDS + ("name", "fire"):
            d[k_] = v
    # today's note with its dev-box words replaced (or, once this art is in the game, as it stands)
    assert "A dev box until its art is drawn" in old["note"] or "Drawn (art round 5)" in old["note"]
    d["note"] = old["note"].replace(
        "A dev box until its art is drawn",
        "Drawn (art round 5): a black iron pot on three short legs over a ring of fieldstones, three logs and ash under it, two lugs and a bail; one drawing, lit from the top left and never mirrored (round, so one facing); its three flame frames stand under the pot, already cut where the pot, its legs, and the front log stand in front of them")
    defs["cauldron"] = d
    for k, v in defs.items():
        with open(os.path.join(OUT, k + ".json"), "w", newline="\n", encoding="utf-8") as fh:
            json.dump(v, fh, indent=1)
            fh.write("\n")
    return defs


def manifest(items):
    m = {
        "cauldron": {"icon": [38, 38], "portrait": False,
                     "held": {"mode": "fixed", "image": "cauldron_world.png", "grip": list(items["cauldron"]["grip"])},
                     "sizes": {"cauldron_world.png": list(items["cauldron"]["world"]), "cauldron_icon.png": [38, 38]},
                     "notes": "the Cauldron as a thing (2 by 2 in the bag): the prop's black iron pot on three legs with two lugs and its bail up, no fire ring; the world picture is hand-pixelled at 16 by 18 and hangs from the hand by the top of the bail (grip), as the bucket does; the icon is the same design drawn larger (27 by 35, centred on 38 by 38), the bucket's exception in round 4, since the 16 px picture would be lost in a 38 px square. It does not stack: no corner kept clear."},
        "satchel": {"icon": [38, 38], "portrait": True,
                    "held": {"mode": "fixed", "image": "satchel_world.png", "grip": list(items["satchel"]["grip"])},
                    "sizes": {"satchel_world.png": list(items["satchel"]["world"]), "satchel_icon.png": [38, 38], "satchel_portrait.png": [38, 38]},
                    "notes": "the Linen satchel (2 by 2 bag, worn on the back): undyed linen in round 4's cloth tones, a round-cornered body with a gusset on its shaded side, a flap with a stitched hem closed by a wooden toggle on a leather loop, a long shoulder strap sewn to the gussets with a brass buckle; held by the top of the strap (grip). The dye regions' key tones, should the pictures ever be recoloured: Cloth #ece4ce #d8ceb2 #bcb092 #9a8e70 (stitch #8a7c5c), Strap #94825e #7a6a4a #5e5038 #463c2a (the item's own colours are #c8b890 and #7a6a4a). How it looks worn is the figure's, not drawn here."},
    }
    with open(os.path.join(HERE, "manifest.json"), "w", newline="\n", encoding="utf-8") as fh:
        json.dump(m, fh, indent=1)
        fh.write("\n")
    return m


# ======================================================================== the preview
FLOOR = {"a": "#62482f", "b": "#5e452f", "edge": "#3a2a1c"}
SLOT = (42, 38, 34, 255)


def floor_tile():
    """a plain 64 x 32 wooden floor diamond, its top vertex at pixel (32, 0)"""
    t = np.zeros((32, 64, 4), np.uint8)
    for y in range(32):
        for x in range(64):
            X = (x + 0.5 - 32) / 2 + (y + 0.5)
            Y = (y + 0.5) - (x + 0.5 - 32) / 2
            if 0 <= X < 32 and 0 <= Y < 32:
                c = hx(FLOOR["a"]) if (int(X) // 8) % 2 else hx(FLOOR["b"])
                if int(X) % 8 == 0 or X < 0.7 or Y < 0.7:
                    c = hx(FLOOR["edge"])
                t[y, x] = (*c, 255)
    return Image.fromarray(t, "RGBA")


def figure():
    """the bare body from data/art/character/preview_skins_3x.png taken back to 1x (round 4's crop)"""
    im = np.array(Image.open(f"{REPO}/data/art/character/preview_skins_3x.png").convert("RGBA"))
    bg = im[2, 2, :3].astype(int)
    small = im[260:460, 170:310][1::3, 1::3].copy()
    a = np.abs(small[..., :3].astype(int) - bg).sum(-1) > 6
    small[..., 3] = np.where(a, 255, 0)
    ys = np.where(a.any(1))[0]
    xs = np.where(a.any(0))[0]
    return Image.fromarray(small[ys.min():ys.max() + 1, xs.min():xs.max() + 1], "RGBA")


def lit(res, fire, k):
    im = res["cauldron"][0].copy()
    f = Image.open(os.path.join(OUT, f"cauldron_fire_{k}.png"))
    im.alpha_composite(f, (fire["at"][0] - fire["base"][0], fire["at"][1] - fire["base"][1]))
    return im


def preview(res, fire, items):
    ref = lambda n: Image.open(f"{REPO}/data/art/village/{n}.png").convert("RGBA")
    mir = lambda im: im.transpose(Image.FLIP_LEFT_RIGHT)
    tile, fig = floor_tile(), figure()
    # (label, picture, anchor, footprint): the anchor is the first tile's top vertex; a 1 by 2 piece's
    # second tile lies along +Y (down left), a 2 by 1 piece's along +X (down right)
    cells = [("barrel", ref("barrel"), (14, 18), (1, 1)), ("shelf", ref("shelf"), (25, 58), (1, 1))]
    im, a = res["cupboard"]
    cells.append(("cupboard y", im, tuple(a), (1, 1)))
    cells.append(("cupboard x", mir(im), (im.width - a[0], a[1]), (1, 1)))
    t = ref("table")
    cells.append(("table y", t, (61, 21), (1, 2)))
    im, a = res["workbench"]
    cells.append(("workbench y", im, tuple(a), (1, 2)))
    cells.append(("workbench x", mir(im), (im.width - a[0], a[1]), (2, 1)))
    cells.append(("table x", mir(t), (t.width - 61, 21), (2, 1)))
    im, a = res["cauldron"]
    cells.append(("cauldron", im, tuple(a), (1, 1)))
    for k in range(3):
        cells.append((f"lit {k}", lit(res, fire, k), tuple(a), (1, 1)))
    cells.append(("figure", fig, None, (1, 1)))
    pad, H, base = 6, 132, 108           # base: the screen row of the tiles' bottom vertex
    cw = lambda fp: 64 + (32 if fp != (1, 1) else 0)
    Wd = sum(cw(fp) + pad for (_, _, _, fp) in cells) + pad
    strip = Image.new("RGBA", (Wd, H), (34, 30, 28, 255))
    x = pad
    for (_, im, anc, fp) in cells:
        if fp == (1, 2):
            tx, ty = x + 64, base - 48
            tiles = [(tx - 32, ty), (tx - 64, ty + 16)]
        elif fp == (2, 1):
            tx, ty = x + 32, base - 48
            tiles = [(tx - 32, ty), (tx, ty + 16)]
        else:
            tx, ty = x + 32, base - 32
            tiles = [(tx - 32, ty)]
        for p in tiles:
            strip.alpha_composite(tile, p)
        if anc is None:
            strip.alpha_composite(im, (tx - im.width // 2, ty + 16 - im.height + 1))
        else:
            strip.alpha_composite(im, (tx - anc[0], ty - anc[1]))
        x += cw(fp) + pad
    # the items: each icon and portrait at 2x on the slot colour, the world picture at 3x with its grip
    # marked in magenta, and at 1x held by the figure (the grip on its right hand, 14 px above the feet
    # and 10 px out)
    row = Image.new("RGBA", (Wd, 100), (34, 30, 28, 255))
    x = pad
    for name in ("cauldron", "satchel"):
        pics = [Image.open(os.path.join(OUT, f"{name}_icon.png"))]
        if name == "satchel":
            pics.append(Image.open(os.path.join(OUT, f"{name}_portrait.png")))
        for pic in pics:
            slot = Image.new("RGBA", (76, 76), SLOT)
            slot.alpha_composite(pic.resize((76, 76), Image.NEAREST))
            row.alpha_composite(slot, (x, 8))
            x += 76 + pad
        w = Image.open(os.path.join(OUT, f"{name}_world.png"))
        g = items[name]["grip"]
        big = w.resize((w.width * 3, w.height * 3), Image.NEAREST)
        row.alpha_composite(big, (x, 8))
        row.alpha_composite(Image.new("RGBA", (3, 3), (255, 0, 255, 255)), (x + g[0] * 3, 8 + g[1] * 3))
        x += big.width + pad
        fx, feet = x + 14, 92
        row.alpha_composite(fig, (fx - fig.width // 2, feet - fig.height + 1))
        row.alpha_composite(w, (fx + 10 - g[0], feet - 14 - g[1]))
        x += 50 + pad
    W2 = max(Wd, x)
    full = Image.new("RGBA", (W2, H + 100), (34, 30, 28, 255))
    full.alpha_composite(strip, (0, 0))
    full.alpha_composite(row.crop((0, 0, W2, 100)) if row.width >= W2 else row, (0, H))
    full.save(os.path.join(OUT, "preview_1x.png"))
    big = full.resize((full.width * 3, full.height * 3), Image.NEAREST)
    big.save(os.path.join(OUT, "preview_3x.png"))
    P = Image.new("RGBA", (big.width, full.height + 8 + big.height), (34, 30, 28, 255))
    P.alpha_composite(full, (0, 0))
    P.alpha_composite(big, (0, full.height + 8))
    P.save(os.path.join(HERE, "preview.png"))
    return [c[0] for c in cells]


if __name__ == "__main__":
    size, anc, rsize, same = chair_check()
    print("chair check: rebuilt", size, anc, "drawn", rsize, "(19, 25)", "silhouette match", same)
    res, info, items = main()
    defs = definitions(res, info["fire"])
    manifest(items)
    order = preview(res, info["fire"], items)
    for k, (im, a) in res.items():
        print(k, im.size, "anchor", a)
    print("fire", info["fire"])
    print("items", items)
    print("preview:", order)
