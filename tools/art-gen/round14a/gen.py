#!/usr/bin/env python
"""
Art round 14a: a 1-wide castle gate (a tall narrow arched doorway with its own narrow portcullis), and plain stone arches 1, 2 and 3 wide
(the gates' stone with no iron), all in the village's stone wall.

Built from art round 12's generator (tools/art-gen/round12/gates/gen.py, 2026-10-29): the same carving, palette, dressed stone, depth bands,
iron and frame names, made general in the ring's thickness and the keystone's size so a 1-wide arch fits one edge. Round 12's 2- and 3-wide
pictures are carved again by this very code and checked byte for byte against the repo's approved PNGs, so the new pieces are their siblings.

Run with plain `python gen.py` (numpy, PIL). Deterministic. Writes out/, look/, preview*.png, manifest.json and the draft sprite JSON; the
README is hand-written. Reads the repo (SNAP below) and never writes there.
"""
import json, math, os
import numpy as np
from PIL import Image, ImageDraw

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "out")
LOOK = os.path.join(HERE, "look")
REPO = os.path.abspath(os.path.join(HERE, "..", "main-snap"))  # a frozen copy of the game's main branch: read only
for d in (OUT, LOOK):
    os.makedirs(d, exist_ok=True)

AY = 100          # the wall pictures' anchor row: the tile's top vertex at ground
HT = 8            # half the wall's thickness (16)
STOREY = 96
LEAF_V = 6        # the portcullis plane: v units from the edge line toward the camera (the face is at +8)

def hx(s):
    s = s.lstrip("#")
    return (int(s[0:2], 16), int(s[2:4], 16), int(s[4:6], 16))

# ---- the stone wall's own tones (round 12's, read off wall_stone_{north,west}_plain.png) ----
OUTLINE = hx("#3b3734")
JOINT = {
    "n": dict(hi=hx("#938d85"), dark=hx("#57524d"), shade=hx("#6b6660")),
    "w": dict(hi=hx("#6b6661"), dark=hx("#3b3734"), shade=hx("#4b4743")),
}
DRESS = {
    "n": dict(fills=[hx("#857f78"), hx("#99938b"), hx("#938d85")], hi=hx("#a19b92"), key=hx("#aea89d"), key2=hx("#a19b92")),
    "w": dict(fills=[hx("#6b6661"), hx("#75706a"), hx("#7b7670")], hi=hx("#857f78"), key=hx("#938d85"), key2=hx("#857f78")),
}
IR_HI, IR_BODY, IR_DK = hx("#7a7a86"), hx("#4c4c58"), hx("#2d2d36")

def load_png(path):
    return np.array(Image.open(path).convert("RGBA"))

VIL = f"{REPO}/data/art/village"
PLAIN = {"n": load_png(f"{VIL}/wall_stone_north_plain.png"), "w": load_png(f"{VIL}/wall_stone_west_plain.png")}
POST_IMG = load_png(f"{VIL}/post_stone.png")

def hash2(i, j, k=0):
    n = (i * 374761393 + j * 668265263 + k * 2147483647) & 0xFFFFFFFF
    n = ((n ^ (n >> 13)) * 1274126177) & 0xFFFFFFFF
    return ((n ^ (n >> 16)) & 0xFFFF) / 65536.0

# ---------------------------------------------------------------- the block, composed from the plain wall
def compose(side, N):
    CW, CH = 49 + 32 * (N - 1), 121 + 16 * (N - 1)
    out = np.zeros((CH, CW, 4), np.uint8)
    p = PLAIN[side]
    m = p[..., 3] > 0
    for k in range(N):
        ox = 32 * k if side == "n" else 32 * (N - 1 - k)
        oy = 16 * k
        sub = out[oy:oy + 121, ox:ox + 49]
        sub[m] = p[m]
    ax = 8 if side == "n" else 40 + 32 * (N - 1)
    return out, ax

# ---------------------------------------------------------------- the geometry (run u, height z; the same for both runs)
class Gate:
    """an arch in a run of N edges: opening u in [a, b], springing zs, crown; nv voussoirs a side; the ring rt thick; the keystone kw half wide
    at its foot and reaching kt over the intrados (round 12: rt 8, kw 5, kt 11)"""
    def __init__(s, N, a, b, zs, crown, nv, rt=8, kw=5, kt=11, kfoot=6):
        s.N, s.L = N, 32 * N
        s.a, s.b, s.zs, s.crown, s.nv = a, b, zs, crown, nv
        s.rt, s.kw, s.kt, s.kfoot = rt, kw, kt, kfoot
        s.h = (b - a) / 2.0
        s.m = (a + b) / 2.0
        r = crown - zs
        s.R = (r * r + s.h * s.h) / (2 * s.h)       # the two-centred (pointed) arch's radius
        s.cl, s.cr = a + s.R, b - s.R
        rho = s.R + rt / 2.0
        uu = s.m - s.kw
        zz = zs + math.sqrt(rho * rho - (uu - s.cl) ** 2)
        s.phi_k = math.atan2(zz - zs, s.cl - uu)

    def open(s, u, z):
        if u <= s.a or u >= s.b:
            return False
        if z <= s.zs:
            return True
        return math.hypot(u - s.cl, z - s.zs) < s.R and math.hypot(u - s.cr, z - s.zs) < s.R

    def side_rho(s, u, z):
        if u < s.m:
            return math.hypot(u - s.cl, z - s.zs), math.atan2(z - s.zs, s.cl - u)
        return math.hypot(u - s.cr, z - s.zs), math.atan2(z - s.zs, u - s.cr)

# Round 12's two, unchanged, and the new narrow one: a doorway's 20 across (the style bible's doorway), 6 px piers, a 6 px ring (an 8 px ring
# with 8 px piers would leave 16, narrower than a door), a lancet springing at 60 to the same 78 crown.
GATES = {
    1: Gate(1, 6, 26, 60, 78, 3, rt=6, kw=3, kt=9, kfoot=4),
    2: Gate(2, 8, 56, 38, 78, 4),
    3: Gate(3, 8, 88, 34, 78, 6),
}

# ---------------------------------------------------------------- projection
def front_pt(side, px, py, ax):
    u = px + 0.5 - ax + HT if side == "n" else ax + HT - (px + 0.5)
    z = AY + (u + HT) / 2.0 - (py + 0.5)
    return u, z

def leaf_pt(side, px, py, ax, v):
    u = px + 0.5 - ax + v if side == "n" else ax + v - (px + 0.5)
    z = AY + (u + v) / 2.0 - (py + 0.5)
    return u, z

def scale(c, f):
    return tuple(int(max(0, min(255, round(x * f)))) for x in c)

DEPTH_K = (1.0, 0.84, 0.70)

def depth_band(v):
    return 0 if v >= 2 else (1 if v >= -4 else 2)

# ---------------------------------------------------------------- the dressed stone on the front face
def course_joint(side, z):
    f = (z - 0.25) % 8.0
    J = JOINT[side]
    if f < 1.0:
        return J["dark"]
    if f >= 7.0:
        return J["shade"]
    if f < 2.0:
        return J["hi"]
    return None

def dressed(g, side, u, z):
    D = DRESS[side]
    J = JOINT[side]
    zz = max(z, 0.0)
    if zz < g.zs:
        if u < g.a or u > g.b:
            if u < 1.0 or u > g.L - 1.0:
                return J["dark"]
            cj = course_joint(side, z)
            if cj is not None:
                return cj
            k = int(math.floor((z - 0.25) / 8.0))
            side_i = 0 if u < g.m else 1
            return D["fills"][int(hash2(k, side_i, 3) * 3) % 3]
        return None
    rho, phi = g.side_rho(u, z)
    if g.open(u, z):
        return None
    kdist = abs(u - g.m)
    kw = g.kw - 1 + (rho - g.R) / 8.0          # the keystone is a wedge: wider at its top
    if kdist <= kw and rho < g.R + g.kt and z >= g.zs + g.kfoot:
        if kdist >= kw - 1 or rho >= g.R + g.kt - 1 or rho < g.R + 1:
            return J["dark"]
        if u < g.m - 1.5:
            return D["key"]
        return D["key2"]
    if rho >= g.R + g.rt:
        return None
    if rho >= g.R + g.rt - 1:
        return J["dark"]
    step = g.phi_k / g.nv
    idx = min(g.nv - 1, int(phi / step))
    R_mid = g.R + g.rt / 2.0
    arc = R_mid * (phi - idx * step)
    arc_to_next = R_mid * step - arc
    if idx > 0 and arc < 0.9:
        return J["dark"]
    if idx < g.nv - 1 and arc_to_next < 0.9:
        return D["hi"]
    if idx == g.nv - 1 and arc_to_next < 0.9:
        return J["dark"]
    sd = 0 if u < g.m else 1
    return D["fills"][int(hash2(idx, sd, 5) * 3) % 3]

# ---------------------------------------------------------------- the carved wall
def build_wall(side, g):
    base, ax = compose(side, g.N)
    CH, CW = base.shape[:2]
    out = base.copy()
    kind = np.zeros((CH, CW), np.uint8)       # 0 plain, 1 dressed, 2 reveal, 3 soffit, 9 carved away (transparent hole)
    opening = np.zeros((CH, CW), bool)
    L = g.L
    for py in range(CH):
        for px in range(CW):
            if base[py, px, 3] == 0:
                continue
            u, z = front_pt(side, px, py, ax)
            if not (0.0 <= u <= L and -3.0 <= z <= STOREY):
                continue
            if g.open(u, max(z, 0.0)):
                hit = None
                s = 0.0
                while s <= 16.0:
                    uu, zz = u - s, z - s
                    if zz < 0.0:
                        hit = ("floor", s)
                        break
                    if not g.open(uu, zz):
                        hit = ("jamb" if uu < g.a else "soffit", s, uu, zz)
                        break
                    s += 0.125
                if hit is None or hit[0] == "floor":
                    out[py, px] = (0, 0, 0, 0)
                    kind[py, px] = 9
                    opening[py, px] = True
                    continue
                v = HT - hit[1]
                k = depth_band(v)
                if hit[0] == "jamb":
                    dxs = (L - g.a)
                    sx, sy = (px + dxs, py + dxs // 2) if side == "n" else (px - dxs, py + dxs // 2)
                    if 0 <= sx < CW and 0 <= sy < CH and base[sy, sx, 3]:
                        c = tuple(base[sy, sx, :3])
                    else:
                        c = JOINT[side]["shade"]
                    out[py, px] = (*scale(c, DEPTH_K[k]), 255)
                    kind[py, px] = 2
                else:
                    uu, zz = hit[2], hit[3]
                    rho, phi = g.side_rho(uu, zz)
                    fam = (hx("#605b56"), hx("#585350"), hx("#534e4a")) if side == "n" else (hx("#7b7670"), hx("#75706a"), hx("#857f78"))
                    step = g.phi_k / g.nv
                    idx = min(g.nv - 1, int(max(phi, 0) / step))
                    arc = (g.R + g.rt / 2.0) * (max(phi, 0) - idx * step)
                    c = fam[int(hash2(idx, 7, 9) * 3) % 3]
                    if idx > 0 and arc < 0.8:
                        c = JOINT[side]["dark"] if side == "n" else hx("#3b3734")
                    out[py, px] = (*scale(c, DEPTH_K[k]), 255)
                    kind[py, px] = 3
                continue
            c = dressed(g, side, u, z)
            if c is not None:
                out[py, px] = (*c, 255)
                kind[py, px] = 1
    new = out.copy()
    for py in range(CH):
        for px in range(CW):
            if out[py, px, 3] == 0 or kind[py, px] == 0:
                continue
            for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                qx, qy = px + dx, py + dy
                if 0 <= qx < CW and 0 <= qy < CH and kind[qy, qx] == 9:
                    new[py, px] = (*OUTLINE, 255)
                    break
    return new, kind, opening, ax

# ---------------------------------------------------------------- the portcullis
BARS = {1: 3, 2: 7, 3: 11}     # verticals, 7.5 px apart in all three

def bar_offsets(g):
    W = g.b - g.a
    n = BARS[g.N]
    if g.N == 1:
        # round 12's own 7.5 px pitch (0, 8, 15): the last bar ends where the far jamb starts hiding the grille (2 px short of the opening's
        # edge, the grille being 2 behind the face), so no crossbar stub pokes out past it
        return [int(math.floor(i * 7.5 + 0.5)) for i in range(n)]
    return [int(math.floor(i * (W - 3) / (n - 1) + 0.5)) for i in range(n)]

CROSS_FIRST, CROSS_PERIOD, CROSS_T = 8, 10, 3

def grille(g, u, z, tip):
    zr = z - tip
    if zr < 0 or zr > 110:
        return None
    uu = u - g.a
    if uu < 0 or uu >= g.b - g.a:
        return None
    cross = None
    crossy = 0
    for kz in range(0, 9):
        c0 = CROSS_FIRST + CROSS_PERIOD * kz
        if c0 <= zr < c0 + CROSS_T:
            r = zr - c0
            cross = IR_DK if r < 1 else (IR_HI if r >= CROSS_T - 1 else IR_BODY)
            crossy = c0
            break
    col = None
    for o in bar_offsets(g):
        if o <= uu < o + 3:
            ci = int(math.floor(uu - o))
            if zr < 2.5:
                if ci != 1:
                    break
                col = IR_BODY
            elif zr < 5.0:
                col = IR_HI if ci == 0 else (IR_DK if ci == 2 else IR_BODY)
                if zr < 3.5 and ci != 1:
                    break
            else:
                col = IR_HI if ci == 0 else (IR_DK if ci == 2 else IR_BODY)
            if cross is not None and ci == 1 and abs(zr - (crossy + 1.5)) < 0.9:
                col = IR_HI
            break
    return col if col is not None else cross

def visible_through(g, u, z):
    s = 0.0
    top = HT - LEAF_V
    while s <= top:
        if not g.open(u + s, max(z + s, 0.0)):
            return False
        s += 0.25
    return True

def build_leaf(side, g, tip, ax, CW, CH, mul=1.0):
    img = np.zeros((CH, CW, 4), np.uint8)
    for py in range(CH):
        for px in range(CW):
            u, z = leaf_pt(side, px, py, ax, LEAF_V)
            if z < 0 or not g.open(u, z):
                continue
            c = grille(g, u, z, tip)
            if c is None or not visible_through(g, u, z):
                continue
            img[py, px] = (*scale(c, mul), 255)
    return img

def crop(img):
    a = img[..., 3] > 0
    ys, xs = np.where(a)
    if not len(ys):
        return img[:1, :1], 0, 0
    y0, y1, x0, x1 = ys.min(), ys.max() + 1, xs.min(), xs.max() + 1
    return img[y0:y1, x0:x1].copy(), int(x0), int(y0)

def save_png(arr, path):
    assert set(np.unique(arr[..., 3])) <= {0, 255}, path
    Image.fromarray(arr, "RGBA").save(path)

# ---------------------------------------------------------------- build everything
FRAMES = [("closed", 0), ("mid", 29), ("raised", 58)]
LEAF_MUL = {"n": 1.0, "w": 0.86}
WORD = {"n": "north", "w": "west"}

def build_all():
    res = {}
    for N, g in GATES.items():
        for side in ("n", "w"):
            wall, kind, opening, ax = build_wall(side, g)
            CH, CW = wall.shape[:2]
            gname = f"gate_stone_{N}_{WORD[side]}"
            aname = f"arch_stone_{N}_{WORD[side]}"
            r = dict(wall=wall, kind=kind, opening=opening, ax=ax, size=(CW, CH), gname=gname, aname=aname, leaves={})
            if N == 1:
                save_png(wall, f"{OUT}/{gname}_frame.png")
                for fname, tip in FRAMES:
                    leaf = build_leaf(side, g, tip, ax, CW, CH, LEAF_MUL[side])
                    c, x0, y0 = crop(leaf)
                    save_png(c, f"{OUT}/{gname}_leaf_{fname}.png")
                    r["leaves"][fname] = dict(crop=c, anchor=(ax - x0, AY - y0))
            else:
                # round 12's approved frame, carved again: it must be the repo's picture to the byte (the proof the shared code is round 12's)
                ref = load_png(f"{VIL}/{gname}_frame.png")
                assert ref.shape == wall.shape and (ref == wall).all(), f"{gname}: not round 12's picture"
                for fname, _ in FRAMES:
                    c = load_png(f"{VIL}/{gname}_leaf_{fname}.png")
                    an = json.load(open(f"{REPO}/data/sprites/wall_parts_gate_stone_{N}.json"))["anchors"][f"leaf_{WORD[side]}_{fname}"]
                    r["leaves"][fname] = dict(crop=c, anchor=tuple(an))
            # the plain arch: the gate's stone, no iron (round 12 carved no portcullis groove, so there is no slot shadow to take away)
            save_png(wall, f"{OUT}/{aname}.png")
            Image.fromarray((opening * 255).astype(np.uint8)).save(f"{LOOK}/{aname}_opening_mask.png")
            res[(N, side)] = r
    return res

# ---------------------------------------------------------------- previews
def figure():
    """the bare body from data/art/character/preview_skins_3x.png taken back to 1x (round 8's and 12's crop), 53 px tall"""
    im = np.array(Image.open(f"{REPO}/data/art/character/preview_skins_3x.png").convert("RGBA"))
    bg = im[2, 2, :3].astype(int)
    small = im[260:460, 170:310][1::3, 1::3].copy()
    a = np.abs(small[..., :3].astype(int) - bg).sum(-1) > 6
    small[..., 3] = np.where(a, 255, 0)
    ys = np.where(a.any(1))[0]
    xs = np.where(a.any(0))[0]
    return small[ys.min():ys.max() + 1, xs.min():xs.max() + 1]

FIG = figure()
GRASS = [load_png(f"{REPO}/data/art/ground/grass_{i}.png") for i in range(4)]
STONE = [load_png(f"{VIL}/floor_stone_{i}.png") for i in range(4)]
BG = (38, 40, 36)

class Scene:
    def __init__(s, W, H, ox, oy):
        s.im = np.zeros((H, W, 3), np.uint8)
        s.im[:] = BG
        s.W, s.H, s.ox, s.oy = W, H, ox, oy

    def pt(s, X, Y, Z=0):
        return int(math.floor(X - Y)) + s.ox, int(math.floor((X + Y) / 2.0 - Z)) + s.oy

    def put(s, img, x, y):
        h, w = img.shape[:2]
        x0, y0 = max(0, x), max(0, y)
        x1, y1 = min(s.W, x + w), min(s.H, y + h)
        if x1 <= x0 or y1 <= y0:
            return
        sub = img[y0 - y:y1 - y, x0 - x:x1 - x]
        m = sub[..., 3] > 127
        s.im[y0:y1, x0:x1][m] = sub[..., :3][m]

    def figure(s, X, Y, Z=0):
        cx, cy = s.pt(X, Y, Z)
        fh, fw = FIG.shape[:2]
        s.put(FIG, cx - fw // 2, cy - fh + 1)

    def piece(s, img, anchor, X, Y, Z=0):
        cx, cy = s.pt(X, Y, Z)
        s.put(img, cx - anchor[0], cy - anchor[1])

def run_scene(res, side, items, pad_before=2, W=2400, H=1500):
    """a stone wall run on grass: `items` is a list of ("plain", k) or (N, mode, frame) where mode is "gate" or "arch" and frame the
    portcullis frame; a paved way crosses each opening; a figure stands in each open opening (in the passage), and in front of a shut one"""
    S = Scene(W, H, W // 2 - 300 if side == "n" else W // 2 + 300, 200)
    segs = []                 # (k0, item)
    k = pad_before
    for it in items:
        if it[0] == "plain":
            k += it[1]
            continue
        segs.append((k, it))
        k += it[0]
    nseg = k + pad_before
    def origin(k):
        return (32 * k, 0) if side == "n" else (0, 32 * k)
    road = set()
    for k0, it in segs:
        for kk in range(k0, k0 + it[0]):
            road.add(kk)
    for i in range(-2, nseg + 2):
        for j in range(-4, 4):
            tx, ty = (i, j) if side == "n" else (j, i)
            img = STONE[int(hash2(tx, ty, 1) * 4) % 4] if i in road else GRASS[int(hash2(tx, ty, 2) * 4) % 4]
            cx, cy = S.pt(32 * tx + 16, 32 * ty + 16)
            S.put(img, cx - 32, cy - 16)
    def wpt(k0, u, v):
        gx0, gy0 = origin(k0)
        return (gx0 + u, gy0 + v) if side == "n" else (gx0 + v, gy0 + u)
    fronts = []
    for k0, (N, mode, frame) in segs:
        mid_u = 32 * N / 2.0
        if mode == "arch" or frame != "closed":
            if N == 1:
                fronts.append(wpt(k0, mid_u, 10))      # in the narrow arch's mouth: in its passage the reveal hides all but a sliver (README)
            else:
                S.figure(*wpt(k0, mid_u, -1))      # in the passage
        else:
            if N > 1:
                S.figure(*wpt(k0, mid_u + 2, -30)) # beyond the shut grille, seen through it
            fronts.append(wpt(k0, mid_u - 14, 18))
    starts = {k0: it for k0, it in segs}
    k = 0
    while k < nseg:
        X, Y = origin(k)
        if k in starts:
            N, mode, frame = starts[k]
            r = res[(N, side)]
            S.piece(r["wall"], (r["ax"], AY), X, Y)
            if mode == "gate":
                lf = r["leaves"][frame]
                S.piece(lf["crop"], lf["anchor"], X, Y)
            k += N
            continue
        S.piece(PLAIN[side], (8, AY) if side == "n" else (40, AY), X, Y)
        k += 1
    for kk in (0, nseg):
        X, Y = origin(kk)
        S.piece(POST_IMG, (18, 107), X, Y)
    for (X, Y) in fronts:
        S.figure(X, Y)
    return S, nseg, segs

def bbox_of(S, side, u0, u1, pad=10, dv=(-44, 30), dz=(0, 104)):
    pts = []
    for u in (u0, u1):
        for v in dv:
            for z in dz:
                pts.append(S.pt(u, v, z) if side == "n" else S.pt(v, u, z))
    xs = [p[0] for p in pts]
    ys = [p[1] for p in pts]
    return (min(xs) - pad, min(ys) - pad, max(xs) + pad, max(ys) + pad)

def finish(S, bbox, k=1):
    x0, y0, x1, y1 = bbox
    im = Image.fromarray(S.im[y0:y1, x0:x1])
    return im.resize((im.width * k, im.height * k), Image.NEAREST) if k != 1 else im

def label(img, text, h=12):
    out = Image.new("RGB", (img.width, img.height + h), (20, 20, 20))
    out.paste(img, (0, h))
    ImageDraw.Draw(out).text((3, 0), text, fill=(235, 235, 220))
    return out

def hstack(ims, gap=6, bg=(20, 20, 20)):
    w = sum(i.width for i in ims) + gap * (len(ims) - 1)
    h = max(i.height for i in ims)
    out = Image.new("RGB", (w, h), bg)
    x = 0
    for i in ims:
        out.paste(i, (x, 0))
        x += i.width + gap
    return out

def vstack(ims, gap=6, bg=(20, 20, 20)):
    w = max(i.width for i in ims)
    h = sum(i.height for i in ims) + gap * (len(ims) - 1)
    out = Image.new("RGB", (w, h), bg)
    y = 0
    for i in ims:
        out.paste(i, (0, y))
        y += i.height + gap
    return out

def single(res, side, N, mode, frame, k=3, ctx=1):
    """one piece in a short run of plain wall, at k"""
    S, nseg, segs = run_scene(res, side, [("plain", ctx), (N, mode, frame), ("plain", ctx)], pad_before=1, W=900, H=700)
    bb = bbox_of(S, side, 32 * 1, 32 * (nseg - 1), pad=6, dv=(-40, 30))
    return finish(S, bb, k)

def strip(res, N, side, frames, k=3):
    r = res[(N, side)]
    CW, CH = r["size"]
    pad = 10
    ims = []
    for fname in frames:
        im = Image.new("RGB", (CW + 2 * pad, CH + 2 * pad), (86, 128, 78))
        wall = Image.fromarray(r["wall"])
        im.paste(wall, (pad, pad), wall)
        if fname:
            lf = r["leaves"][fname]
            li = Image.fromarray(lf["crop"])
            im.paste(li, (pad + r["ax"] - lf["anchor"][0], pad + AY - lf["anchor"][1]), li)
        ims.append(im.resize((im.width * k, im.height * k), Image.NEAREST))
    return hstack(ims, 8)

def build_previews(res):
    blocks = []
    # 1. the 1-wide gate, both runs, shut / halfway / raised, in a short run of wall, at 3x
    for side in ("n", "w"):
        ims = [label(single(res, side, 1, "gate", f), f"1-wide gate, {WORD[side]} run: {name} (3x)") for f, name in (("closed", "shut"), ("mid", "halfway"), ("raised", "raised"))]
        row = hstack(ims)
        row.save(f"{HERE}/preview_3x_gate1_{side}.png")
        blocks.append(row)
    # 2. the arches 1, 2, 3, both runs, at 3x, a figure in each
    for side in ("n", "w"):
        ims = [label(single(res, side, N, "arch", None), f"{N}-wide arch, {WORD[side]} run (3x)") for N in (1, 2, 3)]
        row = hstack(ims)
        row.save(f"{HERE}/preview_3x_arches_{side}.png")
        blocks.append(row)
    # 3. at 1x: one long wall with everything in it, round 12's gates (raised) beside for comparison
    items = [(1, "gate", "closed"), ("plain", 1), (1, "gate", "raised"), ("plain", 2), (1, "arch", None), ("plain", 2), (2, "gate", "raised"), ("plain", 1),
             (2, "arch", None), ("plain", 2), (3, "gate", "raised"), ("plain", 1), (3, "arch", None)]
    names = "1-wide gate shut, 1-wide gate raised, 1-wide arch | round 12's 2-wide gate raised, 2-wide arch | round 12's 3-wide gate raised, 3-wide arch"
    for side in ("n", "w"):
        S, nseg, segs = run_scene(res, side, items, pad_before=2)
        bb = bbox_of(S, side, 0, 32 * nseg, pad=12)
        im = finish(S, bb, 1)
        im.save(f"{HERE}/preview_1x_run_{side}.png")
        blocks.append(label(im, f"1x, {WORD[side]} run: {names}"))
    # 3b. the three gates shut, side by side at 3x: the narrow grille against round 12's
    for side in ("n", "w"):
        S, nseg, segs = run_scene(res, side, [(1, "gate", "closed"), ("plain", 1), (2, "gate", "closed"), ("plain", 1), (3, "gate", "closed")], pad_before=1, W=1400, H=900)
        bb = bbox_of(S, side, 16, 32 * nseg - 16, pad=6, dv=(-40, 30))
        im = finish(S, bb, 3)
        im.save(f"{HERE}/preview_3x_gates_shut_{side}.png")
        blocks.append(label(im, f"3x, {WORD[side]} run, all shut: the new 1-wide gate, round 12's 2-wide and 3-wide"))
    # 4. the frames alone at 3x: the 1-wide gate's three, then the three arches
    for side in ("n", "w"):
        st = hstack([strip(res, 1, side, ["closed", "mid", "raised"]), strip(res, 1, side, [None]), strip(res, 2, side, [None]), strip(res, 3, side, [None])], 16)
        st.save(f"{LOOK}/strip_{side}.png")
        blocks.append(label(st, f"the pieces alone, {WORD[side]} run, 3x: 1-wide gate shut, halfway, raised; arches 1, 2, 3"))
    vstack(blocks, 10).save(f"{HERE}/preview.png")

# ---------------------------------------------------------------- the manifest and the draft definitions
def write_json(res):
    manifest = {}
    for (N, side), r in res.items():
        files = {}
        if N == 1:
            files["gate_frame"] = dict(file=f"out/{r['gname']}_frame.png", size=list(r["size"]), anchor=[r["ax"], AY])
            for fname, _ in FRAMES:
                lf = r["leaves"][fname]
                files[f"leaf_{fname}"] = dict(file=f"out/{r['gname']}_leaf_{fname}.png", size=[lf["crop"].shape[1], lf["crop"].shape[0]], anchor=list(lf["anchor"]))
        files["arch"] = dict(file=f"out/{r['aname']}.png", size=list(r["size"]), anchor=[r["ax"], AY],
                             note="byte-identical to the gate's frame" + ("" if N == 1 else f" (data/art/village/{r['gname']}_frame.png, round 12)"))
        manifest[f"{N}_{side}"] = files
    manifest["geometry"] = {str(N): dict(run=g.L, opening=[g.a, g.b], springing=g.zs, crown=g.crown, radius=round(g.R, 2), ring=g.rt,
                                         voussoirs_a_side=g.nv, leaf_plane=LEAF_V, bars=BARS[N]) for N, g in GATES.items()}
    manifest["portcullis_tips"] = {f: t for f, t in FRAMES}
    json.dump(manifest, open(f"{HERE}/manifest.json", "w"), indent=1)

    def opening(g):
        return {"u": [g.a, g.b], "springing": g.zs, "crown": g.crown, "arch": "pointed", "radius": round(g.R, 2),
                "note": "u in world units along the run from the gate's first edge's start; z from the ground; through the wall's whole 16 thickness"}

    # the 1-wide gate: round 12's sheets, span 1
    g = GATES[1]
    images, anchors, pimages, panchors = {}, {}, {}, {}
    for side in ("n", "w"):
        r = res[(1, side)]
        images[f"{WORD[side]}_gate"] = f"data/art/village/{r['gname']}_frame.png"
        anchors[f"{WORD[side]}_gate"] = [r["ax"], AY]
        for fname, _ in FRAMES:
            lf = r["leaves"][fname]
            pimages[f"leaf_{WORD[side]}_{fname}"] = f"data/art/village/{r['gname']}_leaf_{fname}.png"
            panchors[f"leaf_{WORD[side]}_{fname}"] = list(lf["anchor"])
    sheet = {
        "anchorVertex": "top", "images": images, "anchors": anchors,
        "wall": {
            "height": 96, "thickness": 16, "color": "#7b7670", "material": "stone", "post": "post_stone", "parts": "wall_parts_gate_stone_1",
            "run": "wall_stone",
            "gate": {
                "kind": "portcullis", "span": 1, "opening": opening(g),
                "leaf": {"plane": LEAF_V, "frames": ["closed", "mid", "raised"], "tips": [t for _, t in FRAMES],
                         "note": "the grille's plane, in units from the edge line toward the camera; tips = the height of its spiked points"},
                "name": "Stone gate (1 wide)", "swing": 1.2, "grille": True, "deadBreak": True, "bitesPass": False, "shotsPass": True,
                "fireSpreads": False, "hp": 300,
            },
        },
        "note": "DRAFT, not wired (art round 14a): a stone-wall castle gate 1 tile wide, a tall narrow arched doorway (20 across, crown 78) with its own three-bar portcullis; the flags copied from wall_stone_gate_2 (docs/02, 2026-10-29); see README.md",
    }
    json.dump(sheet, open(f"{HERE}/wall_stone_gate_1.json", "w"), indent=1)
    parts = {"anchorVertex": "top", "images": pimages, "anchors": panchors,
             "note": "DRAFT (art round 14a): the 1-wide gate's portcullis, three frames per run: closed (tips at the ground), mid (tips at 29), raised (tips at 58). Drawn after the wall piece; already clipped to what the arch shows"}
    json.dump(parts, open(f"{HERE}/wall_parts_gate_stone_1.json", "w"), indent=1)

    # the arches: a gate with no leaf that never shuts (README: "always open")
    for N, g in GATES.items():
        images, anchors = {}, {}
        for side in ("n", "w"):
            r = res[(N, side)]
            images[f"{WORD[side]}_gate"] = f"data/art/village/{r['aname']}.png"
            anchors[f"{WORD[side]}_gate"] = [r["ax"], AY]
        sheet = {
            "anchorVertex": "top", "images": images, "anchors": anchors,
            "wall": {
                "height": 96, "thickness": 16, "color": "#7b7670", "material": "stone", "post": "post_stone", "run": "wall_stone",
                "gate": {
                    "kind": "arch", "span": N, "opening": opening(g), "name": f"Stone arch ({N} wide)",
                    "always": "open",
                    "deadBreak": False, "bitesPass": True, "shotsPass": True, "fireSpreads": True,
                },
            },
            "note": f"DRAFT, not wired (art round 14a): a plain stone arch {N} tiles wide, a walkable opening that never closes: a castle gate (one door-kind wall an edge, `gate: {{ i }}`) with no portcullis (no `parts`, no `leaf`) and `always: \"open\"` (new: built open, never shut by E or anything else; README.md lists the engine support). The frames are named north_gate / west_gate so render/walls.js gateSlice cuts them unchanged",
        }
        json.dump(sheet, open(f"{HERE}/wall_stone_arch_{N}.json", "w"), indent=1)

if __name__ == "__main__":
    res = build_all()
    write_json(res)
    build_previews(res)
    print("done")
