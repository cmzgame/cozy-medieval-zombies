"""Village art: walls (wood / stone, north / west, 5 variants), corner posts, door leaves,
shutters, furniture, floors. Built with iso3d.

Wall orientation names (confirmed by Michael 2026-10-11):
  north = segment running top-left -> bottom-right on screen ("\"), along world X:
          the tile edge from its TOP vertex to its RIGHT vertex (a room's back-right wall).
  west  = segment running bottom-left -> top-right ("/"), along world Y:
          the tile edge from its TOP vertex to its LEFT vertex (a room's back-left wall).
Every sprite's anchor is the pixel position of that tile's TOP vertex at ground level.
"""
import json, os, math
import numpy as np
from PIL import Image
from iso3d import Scene, hx, hsh, flat, pick, proj

D = os.path.dirname(os.path.abspath(__file__))
OUT = D + "/out/village"; os.makedirs(OUT, exist_ok=True)
OUTLINE = hx("#2b2522")
METAL, METAL_HI = "#2b2a32", "#4a4952"

H_WALL = 80
THICK = {"stone": 16, "wood": 14, "log": 18}
DOOR = (6, 26, 48)            # along-wall from, to, height
WIN = (8, 24, 22, 51)         # along-wall from, to, sill z, top z

# ------------------------------------------------------------------ palettes per face light
# each: mortar/gap, base stones/planks (2-3), highlight
STONE = {
    "top":   dict(m="#6c6761", c=["#99938b", "#a19b92", "#928c85"], hi="#aea89d", lo="#857f78"),
    "left":  dict(m="#57524d", c=["#7b7670", "#857f78", "#75706a"], hi="#938d85", lo="#6b6660"),
    "right": dict(m="#3b3734", c=["#585350", "#605b56", "#534e4a"], hi="#6b6661", lo="#4b4743"),
}
WOOD = {
    "top":   dict(m="#5e412b", c=["#8c6646", "#86603f"], g="#78573a", beam="#7a5538", bhi="#8c6646"),
    "left":  dict(m="#3e2a1c", c=["#7a5538", "#724f33"], g="#664630", beam="#5e402a", bhi="#6e4b32"),
    "right": dict(m="#271a11", c=["#523926", "#4c3523"], g="#422d1e", beam="#3c2a1b", bhi="#4a3322"),
}
FRAME = {"top": "#8f6a48", "left": "#7d5a3c", "right": "#5f442d", "edge": "#3e2a1c"}
SILL = {"top": "#aaa49a", "left": "#8e887f", "right": "#6f6a63", "m": "#5a554f"}
DOORW = {   # door / shutter wood #5e4028
    "left":  dict(c=["#6c4b30", "#654529"], gap="#3a2716", g="#5a3d25"),
    "right": dict(c=["#513722", "#4b331f"], gap="#2c1d12", g="#432d1b"),
    "top":   dict(c=["#7d5a3c", "#77553a"], gap="#4a3322", g="#6c4b30"),
}
DARK_IN = {"top": "#3a3430", "left": "#2e2926", "right": "#26221f"}   # inside of openings in shadow


# ------------------------------------------------------------------ texture shaders
def stone_shader(light, along_axis, kind):
    """Fitted stones in courses. kind: 'front' (u=along, v=z), 'end' (u=across, v=z), 'top' (u=along, v=across)."""
    pal = STONE[light]
    course_h = 8
    # stone lengths per course; each list sums to 32 so segments tile seamlessly
    layouts = [[12, 10, 10], [7, 13, 12], [10, 12, 10], [14, 9, 9], [9, 11, 12], [11, 10, 11],
               [13, 10, 9], [8, 12, 12], [12, 9, 11], [10, 13, 9]]
    def sh(P, s, t):
        a = P[:, along_axis]; c = P[:, 1 - along_axis]; z = P[:, 2]
        if kind == "top":
            # cap stones: one row of long capping slabs, joints every ~8-12 along the wall
            u = np.floor(a).astype(int) % 32
            cuts = np.array([0, 9, 19, 27])
            idx = np.searchsorted(cuts, u, side="right") - 1
            start = cuts[idx]
            out = pick(pal["c"], hsh(idx, 7))
            joint = (u == start)
            out[joint] = hx(pal["m"])
            lead = (u == start + 1) & ~joint
            out[lead] = hx(pal["hi"])
            return out
        u = np.floor(a if kind == "front" else c + 64).astype(int)
        v = np.floor(z).astype(int)
        row = v // course_h; rv = v % course_h
        lay = np.array([np.cumsum([0] + L[:-1]) for L in layouts])        # 10 x 3 start offsets
        lens = np.array(layouts)
        r = row % len(layouts)
        uu = (u + (row * 5)) % 32 if kind == "front" else (u + row * 3) % 32
        st = lay[r]                                                       # (N,3)
        idx = (uu[:, None] >= st).sum(1) - 1
        s0 = st[np.arange(len(u)), idx]
        ln = lens[r, idx]
        out = pick(pal["c"], hsh(row, idx, 3))
        mort = (rv == 0) | (uu == s0)
        top_hi = (rv == 1) & (uu > s0) & (uu < s0 + ln - 1)
        bot_lo = (rv == course_h - 1) & (uu > s0)
        out[top_hi] = hx(pal["hi"]); out[bot_lo] = hx(pal["lo"])
        # a few chipped corners: mortar eats the stone's top-left corner pixel pair
        chip = (hsh(row, idx, 11) % 5 == 0) & (rv == 1) & ((uu == s0 + 1) | (uu == s0 + 2))
        out[chip] = hx(pal["m"])
        out[mort] = hx(pal["m"])
        return out
    return sh


def wood_shader(light, along_axis, kind, sill=True, plate=True):
    """Vertical planks with a sill beam at the bottom and a plate beam under the cap."""
    pal = WOOD[light]
    widths = [7, 6, 7, 6, 6]
    starts = np.cumsum([0] + widths[:-1])
    def sh(P, s, t):
        a = P[:, along_axis]; c = P[:, 1 - along_axis]; z = P[:, 2]
        if kind == "top":
            u = np.floor(a).astype(int); v = np.floor(c * 1.0).astype(int)
            out = pick(pal["c"], np.zeros(len(u), int))
            grain = (hsh(v, u // 7) % 11 == 0) & (v % 3 == 1)
            out[grain] = hx(pal["g"])
            out[(u % 32) == 0] = hx(pal["m"])
            return out
        u = np.floor(a if kind == "front" else c + 50).astype(int) % 32
        v = np.floor(z).astype(int)
        idx = np.searchsorted(starts, u, side="right") - 1
        s0 = starts[idx]
        out = pick(pal["c"], idx + (1 if kind == "end" else 0))
        grain = (hsh(idx, v // 4, u) % 9 == 0) & (u > s0)
        out[grain] = hx(pal["g"])
        out[u == s0] = hx(pal["m"])
        if sill:
            sb = v < 8
            out[sb] = hx(pal["beam"]); out[v == 7] = hx(pal["bhi"]); out[v == 0] = hx(pal["m"])
            out[sb & (u == s0) & (v > 0) & (v < 7) & (idx % 2 == 0)] = hx(pal["m"])     # beam joints
        if plate:
            pb = v >= H_WALL - 6
            out[pb] = hx(pal["beam"]); out[v == H_WALL - 1] = hx(pal["bhi"]); out[v == H_WALL - 6] = hx(pal["m"])
        # nails where planks meet the beams
        nail = ((v == 9) | (v == H_WALL - 8)) & (u == s0 + 2)
        out[nail] = hx(pal["m"])
        return out
    return sh



LOG = {   # around #8a5e36; clay chinking between the logs
    "left":  dict(hi="#ab7b4c", li="#9c6d41", b="#8a5e36", sh="#73502e", ck="#3e2a1a", clay="#9a8a6c",
                  bark="#6c4829", eg="#c49e6c", er="#a07e52", eb="#5a3c22"),
    "right": dict(hi="#8c6441", li="#7d5735", b="#6e4b2c", sh="#5a3d24", ck="#2c1e13", clay="#76694f",
                  bark="#533720", eg="#a1805a", er="#836546", eb="#45301b"),
    "top":   dict(hi="#bb8b58", li="#ad7d4c", b="#a07040", sh="#8a5e36", ck="#4e3622", clay="#a89a7c",
                  bark="#7c5434", eg="#c9a472", er="#a8865a", eb="#5e4024"),
}
LOG_H = 16

def log_shader(light, along_axis, kind):
    """Stacked round logs. front: logs run along the wall; end: cut log ends (rings); top: the top log's back."""
    pal = LOG[light]
    def sh(P, s, t):
        a = P[:, along_axis]; c = P[:, 1 - along_axis]; z = P[:, 2]
        n = len(P)
        if kind == "top":
            out = pick([pal["li"]], np.zeros(n, int))
            out[np.abs(c) > 6] = hx(pal["b"])                              # the log rounds away at the sides
            out[np.abs(c) > 8] = hx(pal["sh"])
            bark = (hsh(np.floor(c).astype(int), np.floor(a).astype(int) // 4) % 6 == 0) & (np.abs(c) < 8)
            out[bark] = hx(pal["bark"])
            return out
        v = np.floor(z).astype(int); rv = v % LOG_H; row = v // LOG_H
        if kind == "front":
            u = np.floor(a).astype(int)
            out = pick([pal["b"]], np.zeros(n, int))
            out[(rv >= 2) & (rv <= 4)] = hx(pal["sh"])
            out[(rv >= 11) & (rv <= 13)] = hx(pal["li"])
            out[rv == 14] = hx(pal["hi"])
            bark = (hsh(row, u // 4, rv) % 7 == 0) & (rv >= 3) & (rv <= 13)
            out[bark] = hx(pal["bark"])
            out[rv == 1] = hx(pal["clay"]); out[rv == 0] = hx(pal["ck"]); out[rv == 15] = hx(pal["clay"])
            return out
        # end: a cut log face per course, rings, bark rim; chinking between
        cz = row * LOG_H + LOG_H / 2
        d = np.sqrt((c / 1.08) ** 2 + (z - cz) ** 2)
        out = pick([pal["ck"]], np.zeros(n, int))
        inside = d < 7.6
        out[inside] = hx(pal["eg"])
        ring = inside & ((np.abs(d - 2.6) < 0.5) | (np.abs(d - 5.0) < 0.5))
        out[ring] = hx(pal["er"])
        out[(d >= 6.6) & inside] = hx(pal["eb"])
        out[(d < 1.0)] = hx(pal["er"])
        out[~inside & ((rv == 1) | (rv == 15))] = hx(pal["clay"])
        return out
    return sh


def plank_leaf_shader(light, along_axis, kind, widths, strips, height_from=0.0):
    """Door / shutter wood: planks across `along`, dark metal strap strips at given z bands."""
    pal = DOORW[light]
    starts = np.cumsum([0] + widths[:-1])
    def sh(P, s, t):
        u = np.floor(s * sum(widths)).astype(int).clip(0, sum(widths) - 1)
        v = np.floor(P[:, 2] - height_from).astype(int)
        idx = np.searchsorted(starts, u, side="right") - 1
        out = pick(pal["c"], idx)
        out[(hsh(idx, v // 3, u) % 8 == 0)] = hx(pal["g"])
        out[(u == starts[idx]) & (idx > 0)] = hx(pal["gap"])
        for z0 in strips:
            band = (v >= z0) & (v < z0 + 2)
            out[band] = hx(METAL)
            out[band & (v == z0) & (u % 5 == 2)] = hx(METAL_HI)
        return out
    return sh


# ------------------------------------------------------------------ wall builder
class WallBuilder:
    """Builds a wall segment in wall-local coords (a = along 0..32, b = across, z) and maps to world.
    west ('/'): along = world Y, across = world X.  north ('\\'): along = world X, across = world Y."""
    def __init__(self, orient, material):
        self.o, self.mat = orient, material
        self.T = THICK[material]
        self.s = Scene()
        self.along_axis = 1 if orient == "west" else 0
        # which world face is the wall's front / end
        self.front_light = "right" if orient == "west" else "left"
        self.end_light = "left" if orient == "west" else "right"

    def w(self, a, b, z):
        return (b, a, z) if self.o == "west" else (a, b, z)

    def lbox(self, a0, a1, b0, b1, z0, z1, top, front, end, bias=0.0, tag=0):
        """Box in local coords. front = face at b1 (camera side), end = face at a1."""
        X0, Y0, Z0 = self.w(a0, b0, z0); X1, Y1, Z1 = self.w(a1, b1, z1)
        x0, x1 = sorted((X0, X1)); y0, y1 = sorted((Y0, Y1))
        if self.o == "west":      # front (+b) is +X = right face; end (+a) is +Y = left face
            self.s.box(x0, y0, Z0, x1, y1, Z1, top=top, left=end, right=front, bias=bias, tag=tag)
        else:                      # front (+b) is +Y = left face; end (+a) is +X = right face
            self.s.box(x0, y0, Z0, x1, y1, Z1, top=top, left=front, right=end, bias=bias, tag=tag)

    def mat_sh(self, light, kind):
        f = {"stone": stone_shader, "wood": wood_shader, "log": log_shader}[self.mat]
        return f(light, self.along_axis, kind)

    def solid(self, a0, a1, z0, z1, tag=0):
        T = self.T
        self.lbox(a0, a1, -T / 2, T / 2, z0, z1,
                  top=self.mat_sh("top", "top"),
                  front=self.mat_sh(self.front_light, "front"),
                  end=self.mat_sh(self.end_light, "end"), tag=tag)

    def opening_inner(self, light_key):
        """Shader for the inside faces of an opening (jamb, threshold) - the wall material, a step darker."""
        return self.mat_sh(light_key, "end")


def build_wall(orient, mat, variant):
    wb = WallBuilder(orient, mat); T = wb.T
    if variant == "plain":
        wb.solid(0, 32, 0, H_WALL)
    elif variant.startswith("door"):
        a0, a1, dh = DOOR
        wb.solid(0, a0, 0, H_WALL); wb.solid(a1, 32, 0, H_WALL); wb.solid(a0, a1, dh, H_WALL)
        # lintel: one long stone / a heavy beam, slightly proud of the wall face
        lt = FRAME if mat == "wood" else None
        if mat == "stone":
            wb.lbox(a0 - 3, a1 + 3, -T / 2, T / 2 + 1, dh, dh + 7,
                    top=flat(SILL["top"]), front=flat(SILL[wb.front_light]), end=flat(SILL[wb.end_light]), bias=0.01)
        else:
            wb.lbox(a0 - 3, a1 + 3, -T / 2, T / 2 + 1, dh, dh + 5,
                    top=flat(FRAME["top"]), front=flat(FRAME[wb.front_light]), end=flat(FRAME[wb.end_light]), bias=0.01)
        # threshold slab
        wb.lbox(a0, a1, -T / 2, T / 2 + 2, 0, 2, top=flat(SILL["top"]), front=flat(SILL[wb.front_light]),
                end=flat(SILL[wb.end_light]), bias=0.01)
        if variant == "door_shut":
            # leaf recessed 2 from the front face, 3 thick
            b1 = T / 2 - 2
            sh = plank_leaf_shader(wb.front_light, wb.along_axis, "front", [5, 5, 5, 5], strips=[9, 34], height_from=2)
            if orient == "west":   # leaf face param must run along the wall for the plank shader
                wb.s.face([(b1, a0, 2), (b1, a1, 2), (b1, a1, dh), (b1, a0, dh)], sh, tag=5)
            else:
                wb.s.face([(a0, b1, 2), (a1, b1, 2), (a1, b1, dh), (a0, b1, dh)], sh, tag=5)
    elif variant.startswith("window"):
        a0, a1, z0, z1 = WIN
        wb.solid(0, a0, 0, H_WALL); wb.solid(a1, 32, 0, H_WALL)
        wb.solid(a0, a1, 0, z0); wb.solid(a0, a1, z1, H_WALL)
        # deep stone sill, proud of the face by 2 - a shelf you could set a pot on
        wb.lbox(a0 - 1, a1 + 1, -T / 2, T / 2 + 2, z0 - 2, z0 + 1, top=flat(SILL["top"]),
                front=flat(SILL[wb.front_light]), end=flat(SILL[wb.end_light]), bias=0.02)
        # timber frame around the opening on the front face, 1 proud
        fb0, fb1 = T / 2 - 1, T / 2 + 1
        ft, ff, fe = flat(FRAME["top"]), flat(FRAME[wb.front_light]), flat(FRAME[wb.end_light])
        wb.lbox(a0 - 2, a0, fb0, fb1, z0 + 1, z1 + 2, ft, ff, fe, bias=0.02)
        wb.lbox(a1, a1 + 2, fb0, fb1, z0 + 1, z1 + 2, ft, ff, fe, bias=0.02)
        wb.lbox(a0 - 2, a1 + 2, fb0, fb1, z1, z1 + 2, ft, ff, fe, bias=0.03)
        if variant == "window_shut":
            b1 = T / 2 - 1.5
            mid = (a0 + a1) / 2
            for (p, q) in ((a0, mid), (mid, a1)):
                sh = plank_leaf_shader(wb.front_light, wb.along_axis, "front", [4, 4], strips=[5, 21], height_from=z0 + 1)
                if orient == "west":
                    wb.s.face([(b1, p, z0 + 1), (b1, q, z0 + 1), (b1, q, z1), (b1, p, z1)], sh, tag=6 + (p > a0))
                else:
                    wb.s.face([(p, b1, z0 + 1), (q, b1, z0 + 1), (q, b1, z1), (p, b1, z1)], sh, tag=6 + (p > a0))
    sp = wb.s.render(origin_world=(0, 0, 0))
    # usable leaves get their own dark outline (inner border, so they stay inside the opening)
    for tg in (5, 6, 7):
        m = sp.tag == tg
        if not m.any(): continue
        p = np.pad(m, 1)
        edge = m & ~(p[:-2, 1:-1] & p[2:, 1:-1] & p[1:-1, :-2] & p[1:-1, 2:])
        sp.col[edge] = OUTLINE
    return sp


def build_post(mat):
    T = THICK[mat]; s = Scene()
    if mat == "log":
        for k, z0 in enumerate(range(0, H_WALL, LOG_H)):
            if k % 2 == 0:   # this course's log runs along X: its cut end faces +X, its side faces +Y
                s.box(-T / 2, -T / 2, z0, T / 2 + 1, T / 2, z0 + LOG_H, top=log_shader("top", 0, "top"),
                      left=log_shader("left", 0, "front"), right=log_shader("right", 0, "end"))
            else:            # runs along Y: cut end faces +Y, side faces +X
                s.box(-T / 2, -T / 2, z0, T / 2, T / 2 + 1, z0 + LOG_H, top=log_shader("top", 1, "top"),
                      left=log_shader("left", 1, "end"), right=log_shader("right", 1, "front"))
        return s.render(origin_world=(0, 0, 0))
    if mat == "stone":
        # quoin pillar: alternating long/short corner stones, slightly proud
        for k, z0 in enumerate(range(0, H_WALL, 8)):
            e = 1 if k % 2 == 0 else 0
            pal_t, pal_l, pal_r = STONE["top"], STONE["left"], STONE["right"]
            c = hsh(k, 2) % 2
            s.box(-T / 2 - e, -T / 2 - e, z0, T / 2 + e, T / 2 + e, z0 + 8,
                  top=flat(pal_t["c"][c]), left=flat(pal_l["c"][c]), right=flat(pal_r["c"][c]))
            # mortar line under each course
            s.box(-T / 2 - e, -T / 2 - e, z0, T / 2 + e, T / 2 + e, z0 + 1,
                  left=flat(pal_l["m"]), right=flat(pal_r["m"]), bias=0.01)
        s.box(-T / 2 - 1, -T / 2 - 1, H_WALL, T / 2 + 1, T / 2 + 1, H_WALL + 2,
              top=flat(STONE["top"]["hi"]), left=flat(STONE["left"]["hi"]), right=flat(STONE["right"]["hi"]))
    else:
        # square timber post with a plinth stone and a cap
        s.box(-T / 2 - 1, -T / 2 - 1, 0, T / 2 + 1, T / 2 + 1, 6,
              top=flat(SILL["top"]), left=flat(SILL["left"]), right=flat(SILL["right"]))
        s.box(-T / 2, -T / 2, 6, T / 2, T / 2, H_WALL,
              top=flat(FRAME["top"]), left=wood_post_sh("left"), right=wood_post_sh("right"))
        s.box(-T / 2 - 1, -T / 2 - 1, H_WALL - 3, T / 2 + 1, T / 2 + 1, H_WALL + 1,
              top=flat(FRAME["top"]), left=flat(FRAME["left"]), right=flat(FRAME["right"]))
    return s.render(origin_world=(0, 0, 0))


def wood_post_sh(light):
    base = {"left": ["#6e4b32", "#664630"], "right": ["#4f3624", "#4a3322"]}[light]
    g = {"left": "#5a3d27", "right": "#3e2a1c"}[light]
    def sh(P, s, t):
        u = np.floor(s * 14).astype(int); v = np.floor(P[:, 2]).astype(int)
        out = pick(base, (u // 5))
        out[(hsh(u, v // 5) % 6 == 0)] = hx(g)
        return out
    return sh



# ------------------------------------------------------------------ open door leaf + open shutters
def leaf_shade_fn(widths, strips, z_from):
    def fn(n):
        if n[2] > 0.7: light = "top"
        elif n[1] >= n[0]: light = "left"
        else: light = "right"
        if light == "top":
            return flat(DOORW["top"]["c"][0])
        return plank_leaf_shader(light, 0, "front", widths, strips, height_from=z_from)
    return fn


def to_world(orient, v):
    a, b, z = v
    return (b, a, z) if orient == "west" else (a, b, z)


def build_door_leaf(orient, mat, far=False):
    """Leaf swung out 90 degrees from the hinge jamb (a = DOOR[0]), standing on the outside.
    far=True: the outside is the far side of the wall, so the leaf stands behind it."""
    T = THICK[mat]; a0, a1, dh = DOOR
    width = a1 - a0
    sb = -1 if far else 1
    s = Scene()
    hinge = (a0, sb * (T / 2 + 0.5), 2)
    O = to_world(orient, hinge)
    A = to_world(orient, (0, sb * width, 0))     # across the leaf: from the hinge out to the free edge
    B = to_world(orient, (3, 0, 0))              # leaf thickness, into the doorway side
    C = (0, 0, dh - 2)
    s.obox(O, A, B, C, leaf_shade_fn([5, 5, 5, 5], [9, 34], 2), tag=1)
    # hinge knuckles at the jamb, at the strap heights
    for zz in (11, 36):
        kO = to_world(orient, (a0 - 1, sb * (T / 2 - 0.5) - (2 if far else 0), zz - 1))
        s.obox(kO, to_world(orient, (0, 2, 0)), to_world(orient, (5, 0, 0)), (0, 0, 4),
               lambda n: flat(METAL_HI if n[2] > 0.7 else METAL), bias=0.05, tag=1)
    sp = s.render(origin_world=(0, 0, 0))
    return sp


def build_shutter(orient, mat, hinge_side, far=False):
    """One shutter folded back ~160 degrees against the outside wall. hinge_side 0 -> hinge at WIN[0], 1 -> WIN[1]."""
    T = THICK[mat]; a0, a1, z0, z1 = WIN
    w = (a1 - a0) / 2
    th = math.radians(160)
    if hinge_side == 0:
        ha = a0; d = (math.cos(th), math.sin(th)); out = (math.sin(th), -math.cos(th))
    else:
        ha = a1; d = (-math.cos(th), math.sin(th)); out = (-math.sin(th), -math.cos(th))
    if out[1] < 0: out = (-out[0], -out[1])
    hb = T / 2 + 1
    if far:   # fold back against the far face instead
        d = (d[0], -d[1]); out = (out[0], -out[1]); hb = -hb
    s = Scene()
    O = to_world(orient, (ha, hb, z0 + 1))
    A = to_world(orient, (d[0] * w, d[1] * w, 0))
    B = to_world(orient, (out[0] * 2, out[1] * 2, 0))
    C = (0, 0, z1 - z0 - 1)
    # shader param s runs along A (the shutter's width), so the planks stand vertical
    s.obox(O, A, B, C, leaf_shade_fn([4, 4], [5, 21], z0 + 1), tag=1)
    for zz in (z0 + 6, z0 + 22):
        kO = to_world(orient, (ha - 1, hb - 0.5 if not far else hb - 1.5, zz))
        s.obox(kO, to_world(orient, (2, 0, 0)), to_world(orient, (0, 2, 0)), (0, 0, 2),
               lambda n: flat(METAL), bias=0.05, tag=1)
    return s.render(origin_world=(0, 0, 0))


BOARD = {"top": "#c6b38e", "left": ["#b5a27e", "#ab9773"], "right": ["#8d7b5f", "#847257"],
         "grain": {"left": "#94805d", "right": "#6c5c44"}, "nail": "#2b2a32", "nail_hi": "#6a6872"}

def board_shader(light, length, seed):
    def sh(P, s, t):
        n = len(P)
        if light == "top":
            return pick([BOARD["top"]], np.zeros(n, int))
        u = np.floor(s * length).astype(int); v = np.floor(t * 5).astype(int).clip(0, 4)
        out = pick(BOARD[light], np.full(n, seed % 2))
        out[(hsh(v, u // 3, seed) % 5 == 0) & (v > 0) & (v < 4)] = hx(BOARD["grain"][light])
        # nails, one near each end
        for un in (2, length - 3):
            out[(u == un) & (v == 2)] = hx(BOARD["nail"])
            out[(u == un) & (v == 1)] = hx(BOARD["nail_hi"])
        return out
    return sh


def build_boards(orient, opening, count):
    """1-3 rough planks nailed across an opening, as an overlay anchored like the wall segment.
    They sit just proud of the thickest wall's face (log, 9) so they are never inside any wall."""
    if opening == "door":
        a0, a1, zlo, zhi = DOOR[0], DOOR[1], 0, DOOR[2]
    else:
        a0, a1, zlo, zhi = WIN[0], WIN[1], WIN[2], WIN[3]
    span = zhi - zlo
    heights = {1: [0.5], 2: [0.25, 0.75], 3: [0.25, 0.5, 0.75]}[count]
    tilts = [2.5, -2.0, 1.5]
    s = Scene()
    b0 = THICK["log"] / 2 + 0.5
    L = (a1 - a0) + 7
    for k, f in enumerate(heights):
        zc = zlo + span * f
        tilt = tilts[k] * (1 if orient == "north" else -1)
        O = to_world(orient, (a0 - 3.5, b0, zc - 2.5 - tilt / 2))
        A = to_world(orient, (L, 0, 0)); A = (A[0], A[1], tilt)
        B = to_world(orient, (0, 2, 0))
        C = (0, 0, 5)
        def fn(nrm, k=k):
            if nrm[2] > 0.7: return board_shader("top", L, k)
            return board_shader("left" if nrm[1] >= nrm[0] else "right", L, k)
        # param s must run along the board's length: obox gives faces (A,B),(A,C),(B,C); A is first
        s.obox(O, A, B, C, fn, bias=0.1 * k, tag=1)
    return s.render(origin_world=(0, 0, 0))


def save(sp, name, anchors, outline=False):
    if outline: sp.outline(OUTLINE)
    im, anc = sp.image()
    a = np.array(im)[..., 3]; assert set(np.unique(a)) <= {0, 255}, name
    im.save(f"{OUT}/{name}.png"); anchors[name] = {"anchor_px": list(anc), "size": list(im.size)}
    return im


if __name__ == "__main__":
    anchors = {}
    for mat in ("wood", "stone", "log"):
        for o in ("north", "west"):
            for v in ("plain", "door_shut", "door_open", "window_shut", "window_open"):
                save(build_wall(o, mat, v), f"wall_{mat}_{o}_{v}", anchors)
        save(build_post(mat), f"post_{mat}", anchors)
    for mat in ("stone", "wood", "log"):
        for o in ("north", "west"):
            for far, sfx in ((False, ""), (True, "_far")):
                save(build_door_leaf(o, mat, far), f"door_open{sfx}_{mat}_{o}", anchors, outline=True)
                # screen-left / screen-right: west walls run '/', so the hinge at WIN[0] is on the right
                for side, hs in (("left", 1 if o == "west" else 0), ("right", 0 if o == "west" else 1)):
                    save(build_shutter(o, mat, hs, far), f"shutter{sfx}_{side}_{mat}_{o}", anchors, outline=True)
    for o in ("north", "west"):
        for op in ("door", "window"):
            for n in (1, 2, 3):
                save(build_boards(o, op, n), f"boards_{op}_{o}_{n}", anchors, outline=True)
    json.dump(anchors, open(f"{OUT}/anchors_walls.json", "w"), indent=1)
    print(len(anchors), "sprites")
