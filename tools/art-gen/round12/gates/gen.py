#!/usr/bin/env python
"""
Art round 12: two castle gates in the village's stone wall (a 2-tile and a 3-tile gate), each with a three-frame portcullis.

Run with plain `python gen.py` (numpy, PIL). Deterministic. Writes out/, look/, preview*.png, manifest.json, README is hand-written.

How it is made (the same idea as round 10's gen, but the wall itself is the source of the pixels):
  * The gate's wall piece is the village's own `wall_stone_{north,west}_plain.png`, composed N segments long, so the cap, the faces, the
    brick joints and the end face are the wall's own pixels and meet the neighbouring wall with no seam.
  * An arch is carved out of that block by a per-pixel ray march in the wall's own (run u, depth v, height z) space: a pixel whose
    front-face point lies in the opening is followed through the wall's 16 px of thickness to what it hits (the near jamb's reveal,
    the arch's underside, the ground, or nothing: transparent).
  * The arch ring (voussoirs with a keystone) and the jamb quoins are drawn in dressed stone on the front face, in the wall's palette.
  * The portcullis is a separate flat iron grille 5 px behind the face, drawn in three heights and clipped to what the arch lets be seen.
"""
import json, math, os
import numpy as np
from PIL import Image, ImageDraw, ImageFont

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "out")
LOOK = os.path.join(HERE, "look")
REPO = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", "..", ".."))  # the repo root: tools/art-gen/roundN/name/   # read only
for d in (OUT, LOOK):
    os.makedirs(d, exist_ok=True)

AY = 100          # the wall pictures' anchor row: the tile's top vertex at ground
HT = 8            # half the wall's thickness (16)
STOREY = 96
LEAF_V = 6        # the portcullis plane: v units from the edge line toward the camera (the face is at +8)

def hx(s):
    s = s.lstrip("#")
    return (int(s[0:2], 16), int(s[2:4], 16), int(s[4:6], 16))

# ---- the stone wall's own tones (read off wall_stone_{north,west}_plain.png) ----
OUTLINE = hx("#3b3734")
# a joint's cross-section on a face, top to bottom: highlight, dark, shade  (n's lit +Y face; w's shaded +X face)
JOINT = {
    "n": dict(hi=hx("#938d85"), dark=hx("#57524d"), shade=hx("#6b6660")),
    "w": dict(hi=hx("#6b6661"), dark=hx("#3b3734"), shade=hx("#4b4743")),
}
# dressed stone (arch ring, quoins, keystone): a touch lighter than the wall's bricks
DRESS = {
    "n": dict(fills=[hx("#857f78"), hx("#99938b"), hx("#938d85")], hi=hx("#a19b92"), key=hx("#aea89d"), key2=hx("#a19b92")),
    "w": dict(fills=[hx("#6b6661"), hx("#75706a"), hx("#7b7670")], hi=hx("#857f78"), key=hx("#938d85"), key2=hx("#857f78")),
}
# iron
IR_HI, IR_BODY, IR_DK = hx("#7a7a86"), hx("#4c4c58"), hx("#2d2d36")

def load_png(path):
    return np.array(Image.open(path).convert("RGBA"))

PLAIN = {
    "n": load_png(f"{REPO}/data/art/village/wall_stone_north_plain.png"),
    "w": load_png(f"{REPO}/data/art/village/wall_stone_west_plain.png"),
}
POST_IMG = load_png(f"{REPO}/data/art/village/post_stone.png")

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

# ---------------------------------------------------------------- the gate's geometry (run u, height z; the same for both runs)
class Gate:
    def __init__(s, N, a, b, zs, crown, nv):
        s.N, s.L = N, 32 * N
        s.a, s.b, s.zs, s.crown, s.nv = a, b, zs, crown, nv
        s.h = (b - a) / 2.0
        s.m = (a + b) / 2.0
        r = crown - zs
        s.R = (r * r + s.h * s.h) / (2 * s.h)       # the two-centred (pointed) arch's radius
        s.cl, s.cr = a + s.R, b - s.R                 # the left arc's centre, the right arc's
        # the keystone's half width, and the angle the voussoirs run up to (where the keystone's side meets the ring's middle)
        s.kw = 5
        rho = s.R + 4
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
        """distance from the arc's own centre (left arc for u < m), and the angle up from the springing"""
        if u < s.m:
            return math.hypot(u - s.cl, z - s.zs), math.atan2(z - s.zs, s.cl - u)
        return math.hypot(u - s.cr, z - s.zs), math.atan2(z - s.zs, u - s.cr)

GATES = {
    2: Gate(2, 8, 56, 38, 78, 4),
    3: Gate(3, 8, 88, 34, 78, 6),
}

# ---------------------------------------------------------------- projection (the same in both runs)
def front_pt(side, px, py, ax):
    """the front face's point (u, z) under pixel (px, py): the pixel's centre seen at the face's plane v = +8"""
    if side == "n":
        u = px + 0.5 - ax + HT
    else:
        u = ax + HT - (px + 0.5)
    z = AY + (u + HT) / 2.0 - (py + 0.5)
    return u, z

def leaf_pt(side, px, py, ax, v):
    if side == "n":
        u = px + 0.5 - ax + v
    else:
        u = ax + v - (px + 0.5)
    z = AY + (u + v) / 2.0 - (py + 0.5)
    return u, z

def scale(c, f):
    return tuple(int(max(0, min(255, round(x * f)))) for x in c)

DEPTH_K = (1.0, 0.84, 0.70)       # the passage's darkening by depth: the mouth, the middle, the back

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
    """the colour of a dressed-stone pixel at front-face point (u, z), or None if the point is plain wall"""
    D = DRESS[side]
    J = JOINT[side]
    zz = max(z, 0.0)
    if zz < g.zs:
        # the piers' quoins: a course of dressed blocks, one tone each, the wall's own course joints, a joint at the pier's outer edge
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
    # above the springing: the ring, concentric with the opening's arc, 8 thick
    rho, phi = g.side_rho(u, z)
    inside_open = g.open(u, z)
    if inside_open:
        return None
    kdist = abs(u - g.m)
    kw = g.kw - 1 + (rho - g.R) / 8.0          # the keystone is a wedge: wider at its top
    if kdist <= kw and rho < g.R + 11 and z >= g.zs + 6:
        if kdist >= kw - 1 or rho >= g.R + 10 or rho < g.R + 1:
            return J["dark"]
        if u < g.m - 1.5:
            return D["key"]                    # the lit left face
        return D["key2"]
    if rho >= g.R + 8:
        return None
    if rho >= g.R + 7:
        return J["dark"]                          # the ring's outer joint against the wall
    # a voussoir: radial joints at equal steps of the angle up to the keystone
    step = g.phi_k / g.nv
    idx = min(g.nv - 1, int(phi / step))
    arc = (R_mid := g.R + 4) * (phi - idx * step)       # arc distance above this stone's lower joint
    arc_to_next = R_mid * step - arc
    if idx > 0 and arc < 0.9:
        return J["dark"]
    if idx < g.nv - 1 and arc_to_next < 0.9:
        return D["hi"]                             # the stone's own lit upper edge
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
    opening = np.zeros((CH, CW), bool)        # the hole: carved away and nothing behind it in the wall
    L = g.L
    Dk = DRESS[side]
    for py in range(CH):
        for px in range(CW):
            if base[py, px, 3] == 0:
                continue
            u, z = front_pt(side, px, py, ax)
            if not (0.0 <= u <= L and -3.0 <= z <= STOREY):
                continue
            if g.open(u, max(z, 0.0)):
                # follow the ray back through the wall's thickness
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
                    # the jamb's reveal is a face of the wall's own end: copied from the end face, darkened by depth
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
                    # the arch's underside: stone in the end face's family, the voussoirs' joints running across it
                    fam = (hx("#605b56"), hx("#585350"), hx("#534e4a")) if side == "n" else (hx("#7b7670"), hx("#75706a"), hx("#857f78"))
                    step = g.phi_k / g.nv
                    idx = min(g.nv - 1, int(max(phi, 0) / step))
                    arc = (g.R + 4) * (max(phi, 0) - idx * step)
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
    # the dark arris: any carved pixel that borders the hole, and the dressed ring against the passage, is drawn in the wall's outline tone
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
def bar_offsets(g):
    W = g.b - g.a
    n = 7 if g.N == 2 else 11
    return [int(math.floor(i * (W - 3) / (n - 1) + 0.5)) for i in range(n)]

CROSS_FIRST, CROSS_PERIOD, CROSS_T = 8, 10, 3

def grille(g, u, z, tip):
    """the iron at the leaf's point (u, z) when the grille's spiked points hang at height `tip`, or None"""
    zr = z - tip
    if zr < 0 or zr > 110:
        return None
    uu = u - g.a
    if uu < 0 or uu >= g.b - g.a:
        return None
    # crossbars (under the verticals)
    cross = None
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
            # a rivet where a bar crosses a crossbar
            if cross is not None and ci == 1 and abs(zr - (crossy + 1.5)) < 0.9:
                col = IR_HI
            break
    return col if col is not None else cross

def visible_through(g, u, z):
    """the leaf's point is seen only if the sight line to the camera stays inside the opening through the face's 5 px"""
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
            if c is None:
                continue
            if not visible_through(g, u, z):
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

def build_all():
    res = {}
    for N, g in GATES.items():
        for side in ("n", "w"):
            wall, kind, opening, ax = build_wall(side, g)
            CH, CW = wall.shape[:2]
            name = f"gate_stone_{N}_{'north' if side == 'n' else 'west'}"
            save_png(wall, f"{OUT}/{name}_frame.png")
            Image.fromarray((opening * 255).astype(np.uint8)).save(f"{LOOK}/{name}_opening_mask.png")
            leaves = {}
            for fname, tip in FRAMES:
                leaf = build_leaf(side, g, tip, ax, CW, CH, LEAF_MUL[side])
                c, x0, y0 = crop(leaf)
                save_png(c, f"{OUT}/{name}_leaf_{fname}.png")
                leaves[fname] = dict(img=leaf, crop=c, anchor=(ax - x0, AY - y0), full=leaf)
            res[(N, side)] = dict(wall=wall, kind=kind, opening=opening, ax=ax, leaves=leaves, name=name, size=(CW, CH))
    return res

# ---------------------------------------------------------------- previews
def figure():
    """the bare body from data/art/character/preview_skins_3x.png taken back to 1x (art round 8's crop), about 53 px tall"""
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
STONE = [load_png(f"{REPO}/data/art/village/floor_stone_{i}.png") for i in range(4)]
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

def compose_scene(res, N, side, frame, before=2, after=2):
    """a wall run of `before` plain segments, the gate, `after` plain segments, on grass with a paved way across the gate; the figure
    stands in front of the gate, one beyond it (seen through), and, with the grille lifted, one in the passage"""
    r = res[(N, side)]
    nseg = before + N + after
    plain = PLAIN[side]
    S = Scene(1400, 900, 700, 140)
    def seg_origin(k):
        return (32 * k, 0) if side == "n" else (0, 32 * k)
    # ground: tile (tx, ty) spans [32 tx, 32 tx + 32] x [32 ty, 32 ty + 32]; the wall line is a tile boundary
    for i in range(-2, nseg + 2):
        for j in range(-4, 4):
            tx, ty = (i, j) if side == "n" else (j, i)
            road = before <= i < before + N
            img = STONE[int(hash2(tx, ty, 1) * 4) % 4] if road else GRASS[int(hash2(tx, ty, 2) * 4) % 4]
            cx, cy = S.pt(32 * tx + 16, 32 * ty + 16)
            S.put(img, cx - 32, cy - 16)
    gx0, gy0 = seg_origin(before)
    mid_u = 32 * N / 2.0
    def wpt(u, v):
        return (gx0 + u, gy0 + v) if side == "n" else (gx0 + v, gy0 + u)
    behind = [wpt(mid_u - 26, -30)] if frame != "raised" else []
    passage = [wpt(mid_u, -1)] if frame != "closed" else []
    front = [wpt(mid_u - 16, 16)]
    for (X, Y) in behind + passage:
        S.figure(X, Y)
    for k in range(nseg):
        X, Y = seg_origin(k)
        if before <= k < before + N:
            if k == before:
                S.piece(r["wall"], (r["ax"], AY), X, Y)
            continue
        S.piece(plain, (8, AY) if side == "n" else (40, AY), X, Y)
    # the run's two end posts (the engine draws one where a run ends)
    for k in (0, nseg):
        X, Y = seg_origin(k)
        S.piece(POST_IMG, (18, 107), X, Y)
    lf = r["leaves"][frame]
    S.piece(lf["crop"], lf["anchor"], gx0, gy0)
    for (X, Y) in front:
        S.figure(X, Y)
    return S

def finish(S, bbox, scale_=1):
    x0, y0, x1, y1 = bbox
    im = Image.fromarray(S.im[y0:y1, x0:x1])
    if scale_ != 1:
        im = im.resize((im.width * scale_, im.height * scale_), Image.NEAREST)
    return im

def box_round(S, side, u0, u1, pad=(10, 10, 10, 10), dv=(-44, 30), dz=(0, 104)):
    pts = []
    for u in (u0, u1):
        for v in dv:
            for z in dz:
                pts.append(S.pt(u, v, z) if side == "n" else S.pt(v, u, z))
    xs = [p[0] for p in pts]
    ys = [p[1] for p in pts]
    return (min(xs) - pad[0], min(ys) - pad[1], max(xs) + pad[2], max(ys) + pad[3])

def label(img, text):
    d = ImageDraw.Draw(img)
    d.rectangle([0, 0, img.width, 11], fill=(20, 20, 20))
    d.text((3, 0), text, fill=(235, 235, 220))
    return img

def hstack(ims, gap=6, bg=(20, 20, 20)):
    w = sum(i.width for i in ims) + gap * (len(ims) - 1)
    h = max(i.height for i in ims)
    out = Image.new("RGB", (w, h), bg)
    x = 0
    for i in ims:
        out.paste(i, (x, 0))
        x += i.width + gap
    return out

def strip(res, N, side, scale_=3):
    """a gate's three frames side by side on plain green, at scale_"""
    r = res[(N, side)]
    CW, CH = r["size"]
    pad = 14
    W, H = CW + 2 * pad, CH + 2 * pad
    ims = []
    for fname, _ in FRAMES:
        a = np.zeros((H, W, 3), np.uint8)
        a[:] = (86, 128, 78)
        im = Image.fromarray(a)
        wall = Image.fromarray(r["wall"])
        im.paste(wall, (pad, pad), wall)
        lf = Image.fromarray(r["leaves"][fname]["crop"])
        x = pad + r["ax"] - r["leaves"][fname]["anchor"][0]
        y = pad + AY - r["leaves"][fname]["anchor"][1]
        im.paste(lf, (x, y), lf)
        ims.append(im.resize((W * scale_, H * scale_), Image.NEAREST))
    return hstack(ims, 8)

def build_previews(res):
    keys = [(N, side) for N in (2, 3) for side in ("n", "w")]
    rows1x, strips = [], []
    for (N, side) in keys:
        scenes = [(compose_scene(res, N, side, fname), fname) for fname, _ in FRAMES]
        S0 = scenes[0][0]
        nseg = 2 + N + 2
        bb1 = box_round(S0, side, 0, 32 * nseg, (14, 12, 14, 12))
        rows1x.append(hstack([label(finish(S, bb1, 1), f"{N}-wide gate, {'n' if side == 'n' else 'w'} run: {fname}") for S, fname in scenes]))
        bb3 = box_round(S0, side, 32 * 1, 32 * (2 + N + 1), (8, 6, 8, 8), dv=(-40, 30))
        ims = [label(finish(S, bb3, 3), f"{N}-wide, {'n' if side == 'n' else 'w'} run, {fname} (3x)") for S, fname in scenes]
        hstack(ims).save(f"{HERE}/preview_3x_gate{N}_{side}.png")
        st = strip(res, N, side, 3)
        st.save(f"{HERE}/preview_strip_gate{N}_{side}.png")
        strips.append(st)
    # the one-sheet preview.png: the four three-frame strips at 3x, then the four 1x scenes
    sheet_w = max(max(s.width for s in strips), max(r_.width for r_ in rows1x))
    hh = sum(s.height + 4 for s in strips) + sum(r_.height + 6 for r_ in rows1x)
    sheet = Image.new("RGB", (sheet_w, hh), (20, 20, 20))
    y = 0
    for s in strips + rows1x:
        sheet.paste(s, (0, y))
        y += s.height + 5
    sheet.save(f"{HERE}/preview.png")

def write_json(res):
    manifest = {}
    for (N, side), r in res.items():
        g = GATES[N]
        files = {}
        files["frame"] = dict(file=f"out/{r['name']}_frame.png", size=list(r["size"]), anchor=[r["ax"], AY])
        for fname, _ in FRAMES:
            lf = r["leaves"][fname]
            files[f"leaf_{fname}"] = dict(file=f"out/{r['name']}_leaf_{fname}.png", size=[lf["crop"].shape[1], lf["crop"].shape[0]], anchor=list(lf["anchor"]))
        manifest[f"{N}_{side}"] = files
    manifest["geometry"] = {str(N): dict(run=g.L, opening=[g.a, g.b], springing=g.zs, crown=g.crown, radius=round(g.R, 2), leaf_plane=LEAF_V) for N, g in GATES.items()}
    json.dump(manifest, open(f"{HERE}/manifest.json", "w"), indent=1)

    # the draft sprite definitions: a wall-material-shaped sheet for the stone piece, and a parts sheet for the three leaf frames
    for N, g in GATES.items():
        images, anchors, pimages, panchors = {}, {}, {}, {}
        for side, word in (("n", "north"), ("w", "west")):
            r = res[(N, side)]
            images[f"{word}_gate"] = f"data/art/village/{r['name']}_frame.png"
            anchors[f"{word}_gate"] = [r["ax"], AY]
            for fname, _ in FRAMES:
                lf = r["leaves"][fname]
                pimages[f"leaf_{word}_{fname}"] = f"data/art/village/{r['name']}_leaf_{fname}.png"
                panchors[f"leaf_{word}_{fname}"] = list(lf["anchor"])
        sheet = {
            "anchorVertex": "top",
            "images": images,
            "anchors": anchors,
            "wall": {
                "height": 96, "thickness": 16, "color": "#7b7670", "material": "stone",
                "post": "post_stone", "parts": f"wall_parts_gate_stone_{N}",
                "run": "wall_stone",
                "gate": {
                    "kind": "portcullis", "span": N,
                    "opening": {"u": [g.a, g.b], "springing": g.zs, "crown": g.crown, "arch": "pointed", "radius": round(g.R, 2),
                                "note": "u in world units along the run from the gate's first edge's start; z from the ground; through the wall's whole 16 thickness"},
                    "leaf": {"plane": LEAF_V, "frames": ["closed", "mid", "raised"], "tips": [0, 30, 60], "note": "the grille's plane, in units from the edge line toward the camera; tips = the height of its spiked points"},
                    "bodies": "blocked unless open", "sight": "passes (a grille, even closed)",
                },
            },
            "note": f"DRAFT, not wired (art round 12): a stone-wall castle gate {N} tiles wide, its piece spans {N} edges on one run; see README.md for the engine support it needs",
        }
        json.dump(sheet, open(f"{HERE}/wall_stone_gate_{N}.json", "w"), indent=1)
        parts = {
            "anchorVertex": "top",
            "images": pimages,
            "anchors": panchors,
            "note": f"DRAFT (art round 12): the {N}-wide gate's portcullis, three frames per run: closed (tips at the ground), mid (tips at 30), raised (tips at 60). Drawn after the wall piece; already clipped to what the arch shows",
        }
        json.dump(parts, open(f"{HERE}/wall_parts_gate_stone_{N}.json", "w"), indent=1)

if __name__ == "__main__":
    res = build_all()
    write_json(res)
    build_previews(res)
    for (N, side), r in res.items():
        strip(res, N, side, 4).save(f"{LOOK}/strip_{N}_{side}.png")
    print("done")
