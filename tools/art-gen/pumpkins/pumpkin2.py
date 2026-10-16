"""Jack-o'-lantern v2: sampled in 3D and seen from the game's 2:1 iso angle, so the top shows.
Same rules as v1 / the fireplace: unlit body with dark cuts + 3 unlit glow frames filling the cuts.
Outline (near-black) around the outside, around every cut, and around the stem.
"""
import os, json, math
import numpy as np
from PIL import Image

D = os.path.dirname(os.path.abspath(__file__))
OUT = D + "/out/pumpkin"; os.makedirs(OUT, exist_ok=True)

def hx(s): s = s.lstrip("#"); return np.array([int(s[i:i + 2], 16) for i in (0, 2, 4)], np.uint8)

OUTLINE = hx("#2b2522")
TONES = [hx("#6e2e12"), hx("#9c4419"), hx("#c2601f"), hx("#d77e33"), hx("#e8a052")]   # deep .. highlight
GROOVE = hx("#86391a")
STEM = [hx("#3a2716"), hx("#5e4028"), hx("#7d5a3c"), hx("#a88a62")]                     # dark, mid, light, cut top
HOLE = hx("#1c120c")
GLOW = [hx("#b8401c"), hx("#e07a26"), hx("#f2b33e"), hx("#f8dc7a")]

R, HH, NRIB = 10.0, 8.0, 8          # horizontal radius, half height, ribs
W, H = 44, 40
ORG = (22, 22)                      # screen position of world origin (pumpkin centre)
L = np.array([-0.35, 0.55, 0.76]); L /= np.linalg.norm(L)     # light from the top-left (+Y lit, +Z top)

# hand-drawn face in (u, v) cells; u spans the face's width around the pumpkin, v its height
FACE = [
    "..X.......X..",
    ".XXX.....XXX.",
    "XXXXX...XXXXX",
    "......X......",
    ".....XXX.....",
    "X..X.....X..X",
    "XXXXX.X.XXXXX",
    ".XXXXXXXXXXX.",
    "...XX...XX...",
]
FACE = np.array([[c == "X" for c in r] for r in FACE])


def proj(X, Y, Z):
    return X - Y + ORG[0], (X + Y) / 2 - Z + ORG[1]


def render(facing, carved=True, lean_k=0.35):
    # the side facing the camera is the 45 degree direction; turn the face ~28 degrees either way
    th_f = math.radians(45 + 28) if facing == "left" else math.radians(45 - 28)
    th = np.linspace(0, 2 * math.pi, 1400, endpoint=False)
    ph = np.linspace(-math.pi / 2, math.pi / 2, 700)
    TH, PH = np.meshgrid(th, ph)
    def P(t, p):
        r_ = R * (1 - 0.085 * np.sin(NRIB * t / 2) ** 2)
        c = np.sign(np.cos(p)) * np.abs(np.cos(p)) ** 0.55            # full shoulders
        z = HH * np.sign(np.sin(p)) * np.abs(np.sin(p)) ** 0.8 - 2.0 * np.exp(-((p - math.pi / 2) / 0.45) ** 2)
        return np.stack([r_ * c * np.cos(t), r_ * c * np.sin(t), z], -1)
    Q = P(TH, PH); X, Y, Z = Q[..., 0], Q[..., 1], Q[..., 2]
    e = 1e-3
    dt = P(TH + e, PH) - P(TH - e, PH); dp = P(TH, PH + e) - P(TH, PH - e)
    N = np.cross(dt, dp); N /= np.linalg.norm(N, axis=-1, keepdims=True) + 1e-9
    outward = np.sum(N * np.stack([X, Y, Z], -1), -1) < 0
    N[outward] *= -1
    sx, sy = proj(X, Y, Z)
    depth = X + Y + Z
    ix, iy = np.floor(sx).astype(int), np.floor(sy).astype(int)
    zb = np.full((H, W), -1e9); tb = np.zeros((H, W)); pb = np.zeros((H, W)); nb = np.zeros((H, W, 3))
    flat_i = iy * W + ix
    order = np.argsort(depth.ravel())                      # far first, near last wins
    fi = flat_i.ravel()[order]
    zb.ravel()[fi] = depth.ravel()[order]
    tb.ravel()[fi] = TH.ravel()[order]; pb.ravel()[fi] = PH.ravel()[order]
    nb.reshape(-1, 3)[fi] = N.reshape(-1, 3)[order]
    body = zb > -1e8

    col = np.zeros((H, W, 3), np.uint8)
    lam = np.sum(nb * L, -1)
    tone = np.digitize(lam, [-0.15, 0.25, 0.55, 0.86])      # 0 deep .. 4 highlight
    for k in range(5): col[body & (tone == k)] = TONES[k]
    # rib grooves: where sin(N th / 2)^2 is near its peak, one tone darker
    g = (np.sin(NRIB * tb / 2) ** 2 > 0.93) & body & (pb < 1.35)
    col[g] = np.minimum(col[g], GROOVE) if False else GROOVE
    col[g & (tone <= 1)] = TONES[0]

    # face: anchor points on the curved surface, projected, then crisp hand-drawn stamps
    EYE_NEAR = ["..X...", ".XXX..", "XXXXX.", "XXXXXX"]
    EYE_FAR = ["..X.", ".XXX", "XXXX"]
    MOUTH = ["X...X...X..X",
             "XX.XXX.XXX.X",
             "XXXXXXXXXXXX",
             ".XXXXXXXXXX.",
             "..XX..XXX..."]
    sgn = -1 if facing == "left" else 1         # +1: the near side of the face is toward +theta
    def at(dt, p):
        q = P(np.array(th_f + dt), np.array(p))
        return proj(q[0], q[1], q[2])
    holes = np.zeros((H, W), bool)
    def stamp(rows, cx, cy, mirror=False):
        rows = [r[::-1] for r in rows] if mirror else rows
        h, w = len(rows), len(rows[0])
        x0, y0 = int(round(cx - w / 2)), int(round(cy - h / 2))
        for r, row in enumerate(rows):
            for c, ch in enumerate(row):
                if ch == "X" and body[y0 + r, x0 + c]: holes[y0 + r, x0 + c] = True
    near_dt, far_dt = -0.38 * sgn * -1, 0.38 * sgn * -1
    # near eye is the one on the camera side (toward 45 degrees)
    ex_n, ey_n = at(-0.40 if facing == "left" else 0.40, 0.50)
    ex_f, ey_f = at(0.42 if facing == "left" else -0.42, 0.50)
    if carved:
        stamp(EYE_NEAR, ex_n, ey_n, mirror=(facing == "right")); stamp(EYE_FAR, ex_f, ey_f + 0.5, mirror=(facing == "left"))
    mx, my = at(0.02 if facing == "left" else -0.02, -0.22)
    # squeeze the mouth's far end by dropping a column there
    m = [r[:9] + r[10:] for r in MOUTH]
    if carved:
        stamp(m, mx, my, mirror=(facing == "right"))

    # stem: brown cylinder rising from the dimple, leaning slightly, with a pale cut top
    stem = np.zeros((H, W), bool); scol = np.zeros((H, W, 3), np.uint8); sz = np.full((H, W), -1e9)
    base_z = HH - 2.0
    for zz in np.linspace(base_z, base_z + 5.5, 60):
        lean = (zz - base_z) * lean_k
        for a in np.linspace(0, 2 * math.pi, 120, endpoint=False):
            r_ = 1.9 - (zz - base_z) * 0.08
            xx, yy = r_ * math.cos(a) - lean, r_ * math.sin(a) + lean * 0.3
            px, py = proj(xx, yy, zz)
            ix_, iy_ = int(math.floor(px)), int(math.floor(py))
            d = xx + yy + zz
            if d > sz[iy_, ix_]:
                sz[iy_, ix_] = d; stem[iy_, ix_] = True
                f = math.sin(a) - math.cos(a)             # +Y lit, +X shade
                scol[iy_, ix_] = STEM[2] if f > 0.5 else (STEM[1] if f > -0.6 else STEM[0])
    # cut top of the stem
    tz = base_z + 5.5; lean = 5.5 * lean_k
    for rr_ in np.linspace(0, 1.45, 8):
        for a in np.linspace(0, 2 * math.pi, 60, endpoint=False):
            px, py = proj(rr_ * math.cos(a) - lean, rr_ * math.sin(a) + lean * 0.3, tz)
            scol[int(math.floor(py)), int(math.floor(px))] = STEM[3]; stem[int(math.floor(py)), int(math.floor(px))] = True

    # compose: holes + their outline ring on the body
    hp = np.pad(holes, 1)
    ring = body & ~holes & (hp[:-2, 1:-1] | hp[2:, 1:-1] | hp[1:-1, :-2] | hp[1:-1, 2:])
    col[ring] = OUTLINE; col[holes] = HOLE
    # stem over the body, with an outline ring of its own where it sits on the body
    sp = np.pad(stem, 1)
    sring = body & ~stem & (sp[:-2, 1:-1] | sp[2:, 1:-1] | sp[1:-1, :-2] | sp[1:-1, 2:])
    col[sring] = OUTLINE
    col[stem] = scol[stem]
    alpha = body | stem
    ap = np.pad(alpha, 1)
    outer = ~alpha & (ap[:-2, 1:-1] | ap[2:, 1:-1] | ap[1:-1, :-2] | ap[1:-1, 2:])
    col[outer] = OUTLINE; alpha |= outer
    return col, alpha, holes


def glow_frames(holes):
    yy, xx = np.mgrid[0:H, 0:W]
    depth = np.zeros((H, W), int); m = holes.copy(); d = 0
    while m.any():
        d += 1; depth[m] = d
        p = np.pad(m, 1); m = m & p[:-2, 1:-1] & p[2:, 1:-1] & p[1:-1, :-2] & p[1:-1, 2:]
    ys, xs = np.where(holes); cy, cx = ys.mean(), xs.mean()
    frames = []
    for f in range(3):
        sway = (-2, 0, 2)[f]
        near = (np.abs(xx - (cx + sway)) <= 3) & (yy >= cy - 1)
        lvl = np.minimum(depth, 2) + 1 + near - (f == 1) * (yy < cy - 3) * (depth == 1)
        idx = np.clip(lvl, 1, 3)
        a = np.zeros((H, W, 4), np.uint8)
        a[holes, :3] = np.stack(GLOW)[idx[holes]]; a[holes, 3] = 255
        frames.append(a)
    return frames


if __name__ == "__main__":
    for f in os.listdir(OUT):
        if f.startswith("jackolantern"): os.remove(os.path.join(OUT, f))
    info = {}
    for facing in ("left", "right"):
        col, alpha, holes = render(facing)
        rgba = np.zeros((H, W, 4), np.uint8); rgba[..., :3] = col; rgba[..., 3] = alpha * 255
        ys = np.where(alpha.any(1))[0]; xs = np.where(alpha.any(0))[0]
        y0, y1, x0, x1 = ys.min(), ys.max() + 1, xs.min(), xs.max() + 1
        Image.fromarray(rgba[y0:y1, x0:x1], "RGBA").save(f"{OUT}/jackolantern_{facing}.png")
        for i, fr in enumerate(glow_frames(holes)):
            Image.fromarray(fr[y0:y1, x0:x1], "RGBA").save(f"{OUT}/jackolantern_{facing}_glow_{i}.png")
        gx, gy = proj(0, 0, -HH)
        lx, ly = proj(0, 0, 0)
        info[f"jackolantern_{facing}"] = {
            "size": [int(x1 - x0), int(y1 - y0)],
            "ground_anchor_px": [round(float(gx - x0), 1), round(float(gy - y0), 1)],
            "light_origin_px": [round(float(lx - x0), 1), round(float(ly - y0), 1)],
            "glow_frames": [f"jackolantern_{facing}_glow_{i}.png" for i in range(3)],
            "note": "glow frames are the same size as the body; draw at the same position, unlit",
        }
    json.dump(info, open(f"{OUT}/anchors_jackolantern.json", "w"), indent=1)
    print(info)
