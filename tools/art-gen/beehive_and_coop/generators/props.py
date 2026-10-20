"""Two village props in the well's manner (docs/29-world/09, requests 1.5.11 and 1.2.11): a straw
skep on a stand (1 x 1, 28 px), and a chicken coop on legs with a ramp and a nesting box (2 x 1 along
world Y, 40 px). Built with iso3d; the anchor is the footprint's top tile's top vertex at ground."""
import json, os, math, sys
import numpy as np
from PIL import Image
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from iso3d import Scene, hx, hsh, flat, pick

D = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(D, "..", "out", "props"); os.makedirs(OUT, exist_ok=True)
OUTLINE = hx("#2b2522")

FW = {"top": ["#7d5a3c", "#77553a"], "left": ["#6a4a30", "#644529"], "right": ["#4f3622", "#4a321f"],
      "gap": {"top": "#4a3322", "left": "#3a2716", "right": "#2c1d12"},
      "g": {"top": "#6c4b30", "left": "#5a3d25", "right": "#432d1b"}}
STRAW = {"top": ["#e2c26a", "#d8b85e"], "left": ["#cfa94c", "#c6a046"], "right": ["#b08a36", "#a48032"],
         "line": {"top": "#b08a36", "left": "#8a6a26", "right": "#6e5420"}, "hi": {"top": "#f0d27a", "left": "#e2c26a", "right": "#cfa94c"}}


def light_of(n):
    if n[2] > 0.7: return "top"
    return "left" if n[1] >= n[0] else "right"


def fwood(light, plank_axis=None, plank_w=6, grain=True):
    cols = FW[light]
    def sh(P, s, t):
        n = len(P)
        if plank_axis is None: out = pick(cols, np.zeros(n, int))
        else:
            across = P[:, 1 - plank_axis] if light == "top" else P[:, plank_axis] if plank_axis in (0, 1) and light != "top" else P[:, 2]
            across = P[:, 1 - plank_axis] if light == "top" else (P[:, 2] if plank_axis == 2 else P[:, plank_axis])
            k = np.floor(across / plank_w).astype(int)
            out = pick(cols, k)
            out[np.floor(across).astype(int) % plank_w == 0] = hx(FW["gap"][light])
        if grain:
            g = (hsh(np.floor(P[:, 0]), np.floor(P[:, 1]) // 4, np.floor(P[:, 2]) // 3) % 13 == 0)
            out[g] = hx(FW["g"][light])
        return out
    return sh


def wood_box(s, x0, y0, z0, x1, y1, z1, plank_axis=None, plank_w=6, tag=0, bias=0.0):
    s.box(x0, y0, z0, x1, y1, z1, top=fwood("top", plank_axis, plank_w), left=fwood("left", plank_axis, plank_w),
          right=fwood("right", plank_axis, plank_w), tag=tag, bias=bias)


# ------------------------------------------------------------------ the beehive
def beehive(bees=0):
    """a straw skep (coiled straw rings, a dark entrance at the front) on a short plank stand;
    bees = 0 none, 1 a few at the entrance, 2 more and higher (the click frames)"""
    s = Scene()
    cx, cy = 16, 16
    # the stand: two log-end feet and a plank top
    for (fx, fy) in ((8, 8), (21, 21)):
        s.box(fx, fy, 0, fx + 4, fy + 4, 5, top=flat("#c49e6c"), left=flat("#8a5e36"), right=flat("#6c4829"), tag=1)
    wood_box(s, 5, 5, 5, 27, 27, 7, plank_axis=1, plank_w=5, tag=1)
    # the skep: stacked coils, each a short cylinder a little narrower than the one below
    N = 20
    coils = [(10.0, 7, 10.5), (10.2, 10.5, 14), (9.6, 14, 17.5), (8.6, 17.5, 21), (7.2, 21, 24), (5.4, 24, 26.5), (3.2, 26.5, 28.2)]
    def straw(light_fn, R, z0, z1):
        def sh(P, s_, t_):
            ang = np.arctan2(P[:, 1] - cy, P[:, 0] - cx)
            keys = light_fn(ang)
            z = P[:, 2]; v = np.floor((z - z0)).astype(int)
            u = np.floor((ang + math.pi) * R * 1.0).astype(int)
            out = np.zeros((len(P), 3), np.uint8)
            for k in ("left", "right", "top"):
                m = keys == k
                if not m.any(): continue
                o = pick(STRAW[k], hsh(u[m] // 3, 1))
                o[v[m] == 0] = hx(STRAW["line"][k])                       # the groove between coils
                o[(v[m] == 1)] = hx(STRAW["hi"][k])                       # the coil's lit crown
                o[(u[m] % 3 == 0) & (v[m] > 1)] = hx(STRAW["line"][k])    # the straw's twist
                out[m] = o
            return out
        return sh
    def side_key(ang):
        nx, ny = np.cos(ang), np.sin(ang)
        f = ny - nx
        return np.where(f > 0.3, "left", np.where(f < -0.3, "right", "left"))
    for (R, z0, z1) in coils:
        for i in range(N):
            a0, a1 = 2 * math.pi * i / N, 2 * math.pi * (i + 1) / N
            p0 = (cx + R * math.cos(a0), cy + R * math.sin(a0)); p1 = (cx + R * math.cos(a1), cy + R * math.sin(a1))
            s.face([(p0[0], p0[1], z0), (p1[0], p1[1], z0), (p1[0], p1[1], z1), (p0[0], p0[1], z1)], straw(side_key, R, z0, z1), tag=2)
        # the coil's top ring, so each step up shows a lit ledge
        pts = [(cx + R * math.cos(2 * math.pi * i / N), cy + R * math.sin(2 * math.pi * i / N), z1) for i in range(N)]
        s.face(pts, straw(lambda a: np.full(len(a), "top"), R, z1 - 1, z1), O=(0, 0, z1), A=(1, 0, 0), B=(0, 1, 0), bias=-0.3, tag=2)
    # the crown knob
    s.box(cx - 1.5, cy - 1.5, 28, cx + 1.5, cy + 1.5, 30, top=flat(STRAW["hi"]["top"]), left=flat(STRAW["left"][0]), right=flat(STRAW["right"][0]), tag=2)
    # the entrance: a dark arch on the camera-side face (toward +X+Y), set into the bottom coil
    ea = math.pi / 4
    for d in (-0.16, -0.05, 0.05, 0.16):
        a = ea + d; R = 10.1
        px_, py_ = cx + R * math.cos(a), cy + R * math.sin(a)
        s.box(px_ - 0.6, py_ - 0.6, 8, px_ + 0.6, py_ + 0.6, 11 if abs(d) < 0.1 else 10, top=flat("#2e2622"), left=flat("#2e2622"), right=flat("#2e2622"), bias=0.6, tag=2)
    # the bees: dark dots with a gold pixel, more and higher in the second frame
    if bees:
        spots = [(27, 25, 9), (29, 22, 12), (24, 28, 12)] if bees == 1 else [(28, 26, 13), (31, 20, 16), (23, 30, 15), (30, 28, 9), (20, 32, 11)]
        for (bx, by, bz) in spots:
            s.box(bx, by, bz, bx + 1, by + 1, bz + 1, top=flat("#d8b35a"), left=flat("#2b2522"), right=flat("#2b2522"), bias=2, tag=3)
            s.box(bx - 1, by, bz, bx, by + 1, bz + 1, top=flat("#2b2522"), left=flat("#2b2522"), right=flat("#2b2522"), bias=2, tag=3)
    return s.render()


# ------------------------------------------------------------------ the chicken coop
def coop(door=0):
    """a plank hut on four legs along world Y, a gable roof of shingles with the ridge along Y, a small door
    in the near (+Y) gable end with a cleated ramp down to the ground, a nesting box with a sloped lid on
    the +X side; door = 0 shut, 1 half open, 2 open (the click frames)"""
    s = Scene()
    X0, X1, Y0, Y1 = 4, 28, 7, 49
    FL, WT, RZ = 8, 30, 40
    # legs
    for (lx, ly) in ((X0 + 1, Y0 + 1), (X1 - 4, Y0 + 1), (X0 + 1, Y1 - 4), (X1 - 4, Y1 - 4)):
        s.box(lx, ly, 0, lx + 3, ly + 3, FL + 1, top=flat(FW["top"][0]), left=flat(FW["left"][1]), right=flat(FW["right"][1]), tag=1)
    # the floor slab and the plank walls (vertical planks on the long faces, horizontal on the gable ends)
    wood_box(s, X0, Y0, FL - 2, X1, Y1, FL, plank_axis=1, plank_w=6, tag=1)
    s.box(X0 + 1, Y0 + 1, FL, X1 - 1, Y1 - 1, WT, top=None, left=fwood("left", 0, 6), right=fwood("right", 1, 6), tag=1)
    # the gable's triangle on the near (+Y) end, lit, plus the far one (hidden, cheap)
    tri = fwood("left", 2, 6)
    s.face([(X0 + 1, Y1 - 1, WT), (X1 - 1, Y1 - 1, WT), (16, Y1 - 1, RZ)], tri, O=(X0 + 1, Y1 - 1, WT), A=(X1 - X0 - 2, 0, 0), B=(0, 0, RZ - WT), bias=0.05, tag=1)
    # the door in the near gable end: a dark opening, a plank leaf that swings out and to the figure's right
    DX0, DX1, DZ = 11, 19, 20
    s.box(DX0, Y1 - 1.2, FL, DX1, Y1 - 1, DZ, top=None, left=flat("#2e2622"), right=None, bias=0.1, tag=1)
    s.box(DX0 - 1, Y1 - 1.1, DZ, DX1 + 1, Y1 - 0.4, DZ + 1.5, top=flat(FW["top"][0]), left=flat(FW["left"][0]), right=flat(FW["right"][0]), bias=0.2, tag=1)   # the lintel
    ang = {0: 0.0, 1: math.radians(50), 2: math.radians(95)}[door]
    hinge = np.array((DX1, Y1 - 0.5, FL), float)
    A = np.array((-(DX1 - DX0) * math.cos(ang), (DX1 - DX0) * math.sin(ang), 0))     # the leaf's width, swinging out toward +Y
    B = np.array((1.2 * math.sin(ang), 1.2 * math.cos(ang), 0))                      # its thickness
    s.obox(hinge, A, B, (0, 0, DZ - FL - 0.5), lambda n: fwood(light_of(n), 2, 4), bias=0.3, tag=1)
    # the ramp: a plank from the door sill down to the ground, with cleats
    rx0, rx1 = DX0 + 0.5, DX1 - 0.5
    ramp_len = 14; drop = FL
    O = np.array((rx0, Y1, FL), float); A = np.array((0, ramp_len, -drop)); B = np.array((rx1 - rx0, 0, 0))
    s.obox(O, B, A, (0, 0, 1.5), lambda n: fwood(light_of(n), None), bias=0.25, tag=1)
    for k in range(1, 5):
        t = k / 5.0
        p = O + A * t + (0, 0, 1.5)
        s.obox(p, B, (0, 1.2, -1.2 * drop / ramp_len), (0, 0, 1), lambda n: flat({"top": "#8c6646", "left": "#6a4a30", "right": "#4f3622"}[light_of(n)]), bias=0.5, tag=1)
    # the nesting box on the +X side: a box with a sloped lid, a dark slot under the lid's edge
    NX0, NX1, NY0, NY1, NZ0, NZ1 = X1 - 1, X1 + 7, 20, 36, FL + 4, FL + 14
    s.box(NX0, NY0, NZ0, NX1, NY1, NZ1 - 2, top=None, left=fwood("left", 0, 5), right=fwood("right", 1, 5), tag=1)
    s.face([(NX0, NY0, NZ1 + 2), (NX1 + 1, NY0, NZ1 - 2.5), (NX1 + 1, NY1, NZ1 - 2.5), (NX0, NY1, NZ1 + 2)], fwood("top", 1, 5),
           O=(NX0, NY0, NZ1 + 2), A=(NX1 + 1 - NX0, 0, -4.5), B=(0, NY1 - NY0, 0), bias=0.3, tag=1)
    s.box(NX0, NY0, NZ1 - 2, NX1 + 0.5, NY1, NZ1 - 1.2, top=None, left=flat("#2e2622"), right=flat("#2e2622"), bias=0.35, tag=1)   # the slot under the lid
    # the roof: a gable of shingles, eaves past the walls, the ridge along Y
    ez, ry0, ry1 = WT, Y0 - 2, Y1 + 2
    def shingles(light, slope_len, run_len):
        base = {"top": ["#8a6444", "#835e3f"], "left": ["#7a5538", "#724f33"], "right": ["#5c402b", "#553b27"]}[light]
        gap = {"top": "#5e412b", "left": "#3e2a1c", "right": "#2c1e14"}[light]
        hi = {"top": "#9c7350", "left": "#86603f", "right": "#664630"}[light]
        def sh(P, s_, t_):
            v = np.floor(t_ * slope_len).astype(int); u = np.floor(s_ * run_len).astype(int)
            row = v // 4; rv = v % 4
            out = pick(base, hsh(row, (u + row * 3) // 5))
            out[rv == 0] = hx(gap); out[rv == 3] = hx(hi)
            out[((u + row * 3) % 5 == 0) & (rv > 0)] = hx(gap)
            return out
        return sh
    L = math.hypot(16, RZ - ez)
    s.face([(X0 - 2, ry0, ez), (X0 - 2, ry1, ez), (16, ry1, RZ), (16, ry0, RZ)], shingles("top", L, ry1 - ry0), tag=2)
    s.face([(X1 + 2, ry0, ez), (X1 + 2, ry1, ez), (16, ry1, RZ), (16, ry0, RZ)], shingles("right", L, ry1 - ry0), tag=2)
    for (a, b) in (((X0 - 2, ry1, ez), (16, ry1, RZ)), ((16, ry1, RZ), (X1 + 2, ry1, ez))):
        a, b = np.array(a, float), np.array(b, float)
        s.obox(a + (0, -1, 0), b - a, (0, 1.5, 0), (0, 0, 2), lambda n: flat({"top": "#9c7350", "left": "#7a5538", "right": "#5c402b"}[light_of(n)]), bias=0.2, tag=2)
    s.box(15, ry0, RZ - 0.5, 17, ry1, RZ + 1.2, top=flat("#9c7350"), left=flat("#7a5538"), right=flat("#5c402b"), bias=0.3, tag=2)
    return s.render()


def save(sp, name, anchors):
    sp.outline(OUTLINE)
    im, anc = sp.image()
    a = np.array(im)[..., 3]; assert set(np.unique(a)) <= {0, 255}, name
    im.save(f"{OUT}/{name}.png"); anchors[name] = {"anchor_px": [int(round(anc[0])), int(round(anc[1]))], "size": list(im.size)}
    return im, anc


if __name__ == "__main__":
    anchors = {}
    save(beehive(0), "beehive_0", anchors); save(beehive(1), "beehive_1", anchors); save(beehive(2), "beehive_2", anchors)
    save(coop(0), "chicken_coop_0", anchors); save(coop(1), "chicken_coop_1", anchors); save(coop(2), "chicken_coop_2", anchors)
    json.dump(anchors, open(f"{OUT}/anchors_props.json", "w"), indent=1)
    print(anchors)
