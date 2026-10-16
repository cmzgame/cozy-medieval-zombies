"""Furniture & fixtures: well, bed, table, chairs, fireplace + fire frames. Built with iso3d.
Footprint origin (world 0,0,0) = the top vertex of the footprint's top tile; that's each sprite's anchor.
Long sides run along world Y (screen bottom-left -> top-right), per the brief.
"""
import json, os, math
import numpy as np
from PIL import Image
from iso3d import Scene, hx, hsh, flat, pick, proj
from village import STONE, SILL, OUTLINE, METAL, METAL_HI, stone_shader, save, OUT

FW = {"top": ["#7d5a3c", "#77553a"], "left": ["#6a4a30", "#644529"], "right": ["#4f3622", "#4a321f"],
      "gap": {"top": "#4a3322", "left": "#3a2716", "right": "#2c1d12"},
      "g": {"top": "#6c4b30", "left": "#5a3d25", "right": "#432d1b"}}


def fwood(light, plank_axis=None, plank_w=7, grain=True):
    """Furniture wood. plank_axis: world axis the planks RUN along (0=X, 1=Y); gaps every plank_w across."""
    cols = FW[light]
    def sh(P, s, t):
        n = len(P)
        if plank_axis is None:
            out = pick(cols, np.zeros(n, int))
        else:
            across = P[:, 1 - plank_axis] if light == "top" else P[:, 2]
            k = np.floor(across / plank_w).astype(int)
            out = pick(cols, k)
            out[np.floor(across).astype(int) % plank_w == 0] = hx(FW["gap"][light])
        if grain:
            g = (hsh(np.floor(P[:, 0]), np.floor(P[:, 1]) // 4, np.floor(P[:, 2]) // 3) % 13 == 0)
            out[g] = hx(FW["g"][light])
        return out
    return sh


def light_of(n):
    if n[2] > 0.7: return "top"
    return "left" if n[1] >= n[0] else "right"


def wood_box(s, x0, y0, z0, x1, y1, z1, plank_axis=None, plank_w=7, tag=0, bias=0.0):
    s.box(x0, y0, z0, x1, y1, z1, top=fwood("top", plank_axis, plank_w), left=fwood("left", plank_axis, plank_w),
          right=fwood("right", plank_axis, plank_w), tag=tag, bias=bias)


# ------------------------------------------------------------------ well
def cyl_stone(light_fn, cx, cy, R):
    """Stone courses on a cylinder: u = arc length, v = z. light_fn(normal angle) -> palette key."""
    def sh(P, s, t):
        ang = np.arctan2(P[:, 1] - cy, P[:, 0] - cx)
        u = np.floor((ang + math.pi) * R).astype(int); v = np.floor(P[:, 2]).astype(int)
        row = v // 6; rv = v % 6
        ln = 9
        uu = (u + row * 4) % ln
        stone_i = (u + row * 4) // ln
        keys = light_fn(ang)
        out = np.zeros((len(P), 3), np.uint8)
        for k in ("left", "right", "top"):
            m = keys == k
            if not m.any(): continue
            pal = STONE[k]
            o = pick(pal["c"], hsh(row[m], stone_i[m], 2))
            o[(rv[m] == 1) & (uu[m] > 0)] = hx(pal["hi"])
            o[(rv[m] == 0) | (uu[m] == 0)] = hx(pal["m"])
            out[m] = o
        return out
    return sh


def well():
    s = Scene()
    cx, cy, R, Rin, Hw = 16, 16, 13, 8.5, 20
    N = 24
    def side_key(ang):
        nx, ny = np.cos(ang), np.sin(ang)
        f = ny - nx
        return np.where(f > 0.35, "left", np.where(f < -0.35, "right", "left"))
    # outer wall (prism)
    for i in range(N):
        a0, a1 = 2 * math.pi * i / N, 2 * math.pi * (i + 1) / N
        p0 = (cx + R * math.cos(a0), cy + R * math.sin(a0)); p1 = (cx + R * math.cos(a1), cy + R * math.sin(a1))
        s.face([(p0[0], p0[1], 0), (p1[0], p1[1], 0), (p1[0], p1[1], Hw), (p0[0], p0[1], Hw)], cyl_stone(side_key, cx, cy, R), tag=1)
    # rim: ring of capstones (top), slightly overhanging
    Rr = R + 0.8
    def rim_sh(P, s_, t_):
        ang = np.arctan2(P[:, 1] - cy, P[:, 0] - cx)
        k = np.floor((ang + math.pi) / (2 * math.pi) * 14).astype(int)
        out = pick(STONE["top"]["c"], hsh(k, 5))
        edge = np.abs(((ang + math.pi) / (2 * math.pi) * 14) - np.round((ang + math.pi) / (2 * math.pi) * 14)) < 0.06
        out[edge] = hx(STONE["top"]["m"])
        return out
    for i in range(N):
        a0, a1 = 2 * math.pi * i / N, 2 * math.pi * (i + 1) / N
        o0 = (cx + Rr * math.cos(a0), cy + Rr * math.sin(a0), Hw + 2); o1 = (cx + Rr * math.cos(a1), cy + Rr * math.sin(a1), Hw + 2)
        i1 = (cx + Rin * math.cos(a1), cy + Rin * math.sin(a1), Hw + 2); i0 = (cx + Rin * math.cos(a0), cy + Rin * math.sin(a0), Hw + 2)
        s.face([o0, o1, i1, i0], rim_sh, tag=1)
        # rim's outer lip (2 px thick)
        s.face([(o0[0], o0[1], Hw), (o1[0], o1[1], Hw), (o1[0], o1[1], Hw + 2), (o0[0], o0[1], Hw + 2)],
               lambda P, s_, t_: pick([STONE["left"]["hi"]], np.zeros(len(P), int)), tag=1)
        # inner wall of the shaft (only the far side is visible)
        s.face([(i0[0], i0[1], Hw + 2), (i1[0], i1[1], Hw + 2), (i1[0], i1[1], Hw - 8), (i0[0], i0[1], Hw - 8)],
               lambda P, s_, t_: pick(["#3a3632", "#34302d"], (np.floor(P[:, 2]) // 3).astype(int)), bias=-0.5, tag=1)
    # water
    wpts = [(cx + Rin * math.cos(2 * math.pi * i / N), cy + Rin * math.sin(2 * math.pi * i / N), Hw - 7) for i in range(N)]
    def water(P, s_, t_):
        out = pick(["#1f2a30"], np.zeros(len(P), int))
        out[(np.abs(P[:, 0] - P[:, 1] + 3) < 1.2) & (P[:, 0] + P[:, 1] < 30)] = hx("#3c5058")
        return out
    s.face(wpts, water, O=(0, 0, Hw - 7), A=(1, 0, 0), B=(0, 1, 0), bias=-1, tag=1)
    # posts standing on the rim
    for py in (2.5, 26.5):
        s.box(14.5, py, Hw + 2, 17.5, py + 3, 66, top=flat(FW["top"][0]), left=fwood("left"), right=fwood("right"), tag=2)
    # axle with a rope coil, crank on the near (+Y) end
    s.box(15, 5.5, 50, 17, 26.5, 52.5, top=flat(FW["top"][0]), left=flat(FW["left"][0]), right=flat(FW["right"][0]), tag=2)
    s.box(14.6, 12, 49.6, 17.4, 21, 52.9, top=flat("#b49e70"), left=flat("#a08a5c"), right=flat("#85704a"), bias=0.1, tag=2)
    s.box(15.5, 29.5, 50.5, 16.5, 31, 52, top=flat("#6a6872"), left=flat("#5a5862"), right=flat("#45444c"), tag=3)
    s.box(15.5, 31, 44.5, 16.5, 32, 52, top=flat("#6a6872"), left=flat("#5a5862"), right=flat("#45444c"), tag=3)
    s.box(15, 32, 43.5, 17, 37, 45.5, top=flat(FW["top"][0]), left=flat("#8c6646"), right=flat(FW["right"][0]), tag=3)
    # rope down to the bucket
    s.box(15.5, 15.5, 36, 16.5, 16.5, 50, top=flat("#a08a5c"), left=flat("#a08a5c"), right=flat("#85704a"), tag=2)
    # bucket: banded wooden pail hanging above the shaft
    s.box(13, 13, 28, 19, 19, 36, top=flat("#3a2716"), left=fwood("left", 2, 2), right=fwood("right", 1, 2), tag=4)
    for zb in (29, 34):
        s.box(12.8, 12.8, zb, 19.2, 19.2, zb + 1, left=flat(METAL), right=flat(METAL), bias=0.05, tag=4)
    s.box(15.5, 15.5, 36, 16.5, 16.5, 38, top=flat(METAL), left=flat(METAL), right=flat(METAL), tag=4)
    # gable roof along Y: shingles, eaves overhang
    ez, rz, y0, y1 = 66, 80, -3, 35
    def shingles(light, slope_len, run_len):
        base = {"top": ["#8a6444", "#835e3f"], "left": ["#7a5538", "#724f33"], "right": ["#5c402b", "#553b27"]}[light]
        gap = {"top": "#5e412b", "left": "#3e2a1c", "right": "#2c1e14"}[light]
        hi = {"top": "#9c7350", "left": "#86603f", "right": "#664630"}[light]
        def sh(P, s_, t_):
            v = np.floor(t_ * slope_len).astype(int); u = np.floor(s_ * run_len).astype(int)
            row = v // 4; rv = v % 4
            out = pick(base, hsh(row, (u + row * 3) // 6))
            out[rv == 0] = hx(gap)
            out[(rv == 3)] = hx(hi)
            out[((u + row * 3) % 6 == 0) & (rv > 0)] = hx(gap)
            return out
        return sh
    L = math.hypot(16, rz - ez)
    s.face([(0, y0, ez), (0, y1, ez), (16, y1, rz), (16, y0, rz)], shingles("top", L, y1 - y0), tag=5)        # far (-X) slope, toward the light
    s.face([(32, y0, ez), (32, y1, ez), (16, y1, rz), (16, y0, rz)], shingles("right", L, y1 - y0), tag=5)    # near (+X) slope, shade
    # gable end (+Y), lit planks, set back under the eaves
    s.face([(2, y1 - 2, ez), (30, y1 - 2, ez), (16, y1 - 2, rz - 2)],
           lambda P, s_, t_: (lambda o: (o.__setitem__(np.floor(P[:, 0]).astype(int) % 5 == 0, hx("#3e2a1c")) or o))(pick(["#6e4b32"], np.zeros(len(P), int))),
           O=(2, y1 - 2, ez), A=(28, 0, 0), B=(0, 0, 14), bias=-0.2, tag=5)
    # bargeboards along the gable edges and a ridge beam
    for (a, b) in (((0, y1, ez), (16, y1, rz)), ((16, y1, rz), (32, y1, ez))):
        a, b = np.array(a, float), np.array(b, float)
        s.obox(a + (0, -1, 0), b - a, (0, 2, 0), (0, 0, 2.2),
               lambda n: flat({"top": "#9c7350", "left": "#7a5538", "right": "#5c402b"}[light_of(n)]), bias=0.2, tag=5)
    s.box(15, y0, rz - 0.5, 17, y1, rz + 1.5, top=flat("#9c7350"), left=flat("#7a5538"), right=flat("#5c402b"), bias=0.3, tag=5)
    return s.render()


# ------------------------------------------------------------------ bed
QUILT = {
    "top":   ["#9c5a3a", "#b8944c", "#7e8a60", "#5e6e82", "#a8843e", "#8a4a2e"],
    "left":  ["#8a4a2e", "#a8843e", "#6e7a52", "#4e5e72", "#987436", "#7a3e26"],
    "right": ["#6e3a22", "#86682e", "#56603f", "#3e4a5c", "#7a5c2a", "#5e301c"],
}
def quilt(light):
    cols = QUILT[light]; seam = {"top": "#5a3a28", "left": "#4a3020", "right": "#3a2418"}[light]
    def sh(P, s_, t_):
        a = np.floor(P[:, 1] / 8).astype(int)
        b = np.floor((P[:, 0] if light == "top" else P[:, 2] + (P[:, 0] if light == "left" else 0)) / 8).astype(int)
        out = pick(cols, hsh(a, b, 9))
        su = (np.floor(P[:, 1]).astype(int) % 8 == 0)
        sv = (np.floor(P[:, 0] if light == "top" else P[:, 2]).astype(int) % 8 == 0)
        out[su | sv] = hx(seam)
        return out
    return sh


def bed():
    s = Scene()
    for (x, y) in ((3, 3), (26, 3), (3, 59), (26, 59)):
        wood_box(s, x, y, 0, x + 3, y + 3, 4, tag=1)
    wood_box(s, 3, 4, 4, 29, 62, 10, plank_axis=1, plank_w=6, tag=1)                                   # frame
    s.box(5, 6, 10, 27, 60, 14, top=flat("#b49e70"), left=flat("#a08c62"), right=flat("#7e6c48"), tag=2)  # straw tick
    s.box(4, 22, 8, 28, 61, 16, top=quilt("top"), left=quilt("left"), right=quilt("right"), tag=3)        # quilt
    s.box(4, 21, 15.6, 28, 23, 16.6, top=flat("#d8ccaa"), left=flat("#c4b896"), right=flat("#a89c80"), bias=0.1, tag=3)  # turned-down sheet
    s.box(7, 8, 14, 25, 19, 19, top=flat("#ddd2b4"), left=flat("#c8bc9c"), right=flat("#a99d82"), tag=4)  # pillow
    s.box(8, 9, 18.6, 24, 18, 19.3, top=flat("#e8dec2"), bias=0.1, tag=4)
    wood_box(s, 2, 1, 0, 30, 5, 24, plank_axis=0, plank_w=6, tag=5)                                     # headboard
    wood_box(s, 1, 0, 24, 31, 6, 26, tag=5)
    wood_box(s, 2, 60, 0, 30, 63, 15, plank_axis=0, plank_w=6, tag=6)                                   # footboard
    wood_box(s, 1, 59.5, 15, 31, 63.5, 17, tag=6)
    return s.render()


# ------------------------------------------------------------------ table
def table():
    s = Scene()
    for yt in (9, 52):
        wood_box(s, 4, yt, 0, 28, yt + 3, 3, tag=1)                     # foot
        for xl in (6, 23):
            wood_box(s, xl, yt, 3, xl + 3, yt + 3, 18, tag=1)           # legs
        wood_box(s, 4, yt, 16, 28, yt + 3, 19, tag=1)                   # cleat
    wood_box(s, 14, 12, 7, 18, 52, 10, tag=1)                           # stretcher
    def top_sh(P, s_, t_):
        out = fwood("top", 1, 7)(P, s_, t_)
        x, y = np.floor(P[:, 0]).astype(int), np.floor(P[:, 1]).astype(int)
        # knife marks: short diagonal nicks
        for (kx, ky) in ((9, 18), (19, 27), (12, 44), (22, 52), (17, 34)):
            nick = ((x - kx) == (y - ky)) & (x >= kx) & (x < kx + 3)
            out[nick] = hx("#5a3d25")
        return out
    s.box(2, 2, 19, 30, 62, 22, top=top_sh, left=fwood("left", 1, 7), right=fwood("right", 1, 7), tag=2)
    # candle stub with a drip and a dark wick
    s.box(20, 40, 22, 23, 43, 27, top=flat("#e2d8bc"), left=flat("#d0c4a2"), right=flat("#ac9f80"), tag=3)
    s.box(21, 41, 27, 22, 42, 28.5, top=flat("#2b2522"), left=flat("#2b2522"), right=flat("#2b2522"), tag=3)
    s.box(19, 39, 22, 24, 44, 22.6, top=flat("#d0c4a2"), bias=0.1, tag=3)
    return s.render()


# ------------------------------------------------------------------ chair
def chair(back_far=True):
    s = Scene()
    bx0 = 8 if back_far else 22
    for (x, y) in ((8, 8), (22, 8), (8, 22), (22, 22)):
        wood_box(s, x, y, 0, x + 2, y + 2, 11, grain=False) if False else s.box(x, y, 0, x + 2, y + 2, 11,
            top=flat(FW["top"][0]), left=flat(FW["left"][0]), right=flat(FW["right"][0]), tag=1)
    s.box(7, 7, 11, 25, 25, 14, top=fwood("top", 1, 6), left=fwood("left"), right=fwood("right"), tag=2)
    # back: two posts, a top rail and a slat
    for y in (7.5, 22.5):
        s.box(bx0, y, 14, bx0 + 2, y + 2, 31, top=flat(FW["top"][0]), left=flat(FW["left"][0]), right=flat(FW["right"][0]), tag=3)
    s.box(bx0, 7.5, 26, bx0 + 2, 24.5, 31, top=flat(FW["top"][0]), left=fwood("left"), right=fwood("right"), bias=0.05, tag=3)
    s.box(bx0, 9.5, 19, bx0 + 2, 22.5, 21.5, top=flat(FW["top"][0]), left=flat(FW["left"][1]), right=flat(FW["right"][1]), bias=0.05, tag=3)
    return s.render()


# ------------------------------------------------------------------ fireplace
FIRE_AT = (11.0, 32.0, 4.0)     # world point at the centre of the firebox floor (flame frames anchor here)

def fireplace():
    s = Scene()
    def st(light, kind): return stone_shader(light, 1, kind)
    def sbox(x0, y0, z0, x1, y1, z1, bias=0.0, tag=1):
        s.box(x0, y0, z0, x1, y1, z1, top=st("top", "top"), left=st("left", "end"), right=st("right", "front"), bias=bias, tag=tag)
    # body around the firebox opening (Y 22..42, Z 4..22, depth X 6..16)
    sbox(0, 4, 0, 16, 22, 44); sbox(0, 42, 0, 16, 60, 44)
    sbox(0, 22, 0, 16, 42, 4); sbox(0, 22, 22, 16, 42, 44)
    # firebox interior: dark, sooty
    soot = lambda key: (lambda P, s_, t_: (lambda o: (o.__setitem__(hsh(np.floor(P[:, 1]), np.floor(P[:, 2]) // 2) % 5 == 0, hx("#1a1513")) or o))(pick([DARK_SOOT[key]], np.zeros(len(P), int))))
    s.box(0, 22, 4, 6, 42, 22, right=soot("back"), bias=-0.1, tag=1)                              # back wall of the firebox
    s.face([(6, 22, 4), (16, 22, 4), (16, 42, 4), (6, 42, 4)], soot("floor"), bias=0.05, tag=1)     # floor
    s.face([(6, 22, 4), (16, 22, 4), (16, 22, 22), (6, 22, 22)], soot("side"), bias=0.05, tag=1)    # side (+Y face)
    # rounded top corners of the opening
    for (y0, y1) in ((22, 25), (39, 42)):
        sbox(6, y0, 19, 16, y1, 22, bias=0.1)
    sbox(6, 25, 21, 16, 27, 22, bias=0.1); sbox(6, 37, 21, 16, 39, 22, bias=0.1)
    # lintel stone over the opening, proud
    s.box(0, 19, 22, 17, 45, 27, top=flat(SILL["top"]), left=flat(SILL["left"]), right=flat(SILL["right"]), bias=0.2, tag=1)
    # corbels and the mantle shelf (oak beam)
    for y in (5, 55):
        s.box(15, y, 38, 19, y + 4, 44, top=flat(SILL["top"]), left=flat(SILL["left"]), right=flat(SILL["right"]), tag=1)
    s.box(0, 2, 44, 20, 62, 48, top=fwood("top", 1, 64), left=fwood("left", 1, 64), right=fwood("right", 1, 64), tag=2)
    # chimney breast above the mantle
    sbox(0, 14, 48, 12, 50, 56)
    # hearthstone in front
    def hearth(P, s_, t_):
        out = pick([SILL["top"], "#a29c92"], (np.floor(P[:, 1]) // 11).astype(int))
        out[np.floor(P[:, 1]).astype(int) % 11 == 0] = hx(SILL["m"])
        return out
    s.box(16, 12, 0, 27, 52, 2, top=hearth, left=flat(SILL["left"]), right=flat(SILL["right"]), tag=3)
    return s.render()

DARK_SOOT = {"back": "#241d1b", "floor": "#2e2624", "side": "#2a2321"}


# ------------------------------------------------------------------ fire frames
def fire_frames():
    """Three 18x16 frames: two crossed logs with embers, flames in 4 tones. No glow halo."""
    logs = {"d": "#3a2716", "m": "#5e4028", "l": "#7a5538", "e": "#b8401c"}
    F = ["#6e1e10", "#b8401c", "#e07a26", "#f2b33e", "#f8dc7a"]
    frames = []
    shapes = [  # per frame: tongues as (x centre, height, width)
        [(5, 9, 4), (9, 13, 5), (13, 8, 4)],
        [(5, 11, 4), (9, 10, 5), (13, 12, 4)],
        [(4, 8, 4), (9, 14, 5), (14, 9, 3)],
    ]
    for f in range(3):
        a = np.zeros((16, 18, 4), np.uint8)
        def put(x, y, c):
            if 0 <= x < 18 and 0 <= y < 16: a[y, x] = (*hx(c), 255)
        # flames: each tongue is a teardrop; layered outer->inner
        yy, xx = np.mgrid[0:16, 0:18]
        layer = np.zeros((16, 18), int)
        for (cx, h, w) in shapes[f]:
            base = 13
            t = (base - yy) / h                                   # 0 at base .. 1 at tip
            half = (w / 2) * np.clip(1 - t, 0, 1) ** 0.7 * (1 + 0.3 * np.sin(t * 3 + f + cx))
            inside = (t >= 0) & (t <= 1) & (np.abs(xx + 0.5 - cx) <= half)
            depth = np.where(inside, 1 + (np.abs(xx + 0.5 - cx) <= half * 0.6) + (np.abs(xx + 0.5 - cx) <= half * 0.3) * (t < 0.55), 0)
            layer = np.maximum(layer, depth)
        cols = {1: F[1], 2: F[2], 3: F[3]}
        for k, c in cols.items():
            a[layer == k] = (*hx(c), 255)
        # dark red rim on the flame's outer edge where it meets air (top/sides)
        m = layer > 0; p = np.pad(m, 1)
        edge = m & ~(p[:-2, 1:-1] & p[1:-1, :-2] & p[1:-1, 2:])
        a[edge] = (*hx(F[0]), 255)
        # pale core
        for (cx, h, w) in shapes[f]:
            put(int(cx), 11, F[4]); put(int(cx), 10, F[4])
        # logs: two crossed, foreshortened, at the bottom
        for x in range(2, 16):
            y = 14 if x < 9 else 13
            put(x, y, logs["m"]); put(x, y + 1, logs["d"])
        for x in range(3, 15):
            y = 13 if x > 8 else 14
            put(x, y - 0, logs["l"] if x % 4 else logs["m"])
        for x in (4, 8, 12): put(x, 13 + (x < 9), logs["e"])
        put(2, 14, "#a88a62"); put(15, 13, "#a88a62")              # cut log ends
        frames.append(Image.fromarray(a, "RGBA"))
    return frames


if __name__ == "__main__":
    anchors = {}
    save(well(), "well", anchors, outline=True)
    save(bed(), "bed", anchors, outline=True)
    save(table(), "table", anchors, outline=True)
    save(chair(True), "chair_front", anchors, outline=True)
    save(chair(False), "chair_back", anchors, outline=True)
    fp = fireplace(); fp.outline(OUTLINE); im, anc = fp.image()
    im.save(f"{OUT}/fireplace.png")
    fx, fy = proj(np.array(FIRE_AT))
    anchors["fireplace"] = {"anchor_px": list(anc), "size": list(im.size),
                            "fire_base_px": [round(anc[0] + float(fx), 1), round(anc[1] + float(fy), 1)]}
    for i, fr in enumerate(fire_frames()):
        fr.save(f"{OUT}/fire_{i}.png")
    anchors["fire_n"] = {"size": [18, 16], "note": "place so pixel (9, 15) (bottom centre of the logs) sits on fireplace.fire_base_px"}
    json.dump(anchors, open(f"{OUT}/anchors_furniture.json", "w"), indent=1)
    print(anchors)
