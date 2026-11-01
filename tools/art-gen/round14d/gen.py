"""Art round 14d: cave mouths. A natural opening 1, 2 or 3 edges wide in a cliff run, carved out of art round 10's
own rock solid (tools/art-gen/round10/cliffs/gen.py, imported, never changed), so the strata, the lip, the moss and
the grass lip are the cliff wall's and a mouth meets a plain cliff edge with no seam.

Michael, 2026-10-31: "we need a way to make a cave": the cliff top's straight hard edge over an opening is wrong; a cave
entrance should read as a natural opening with rock over it. The mouth is an always-open gate (as the stone arches,
art round 14a) on the hill's outer edge: the rock over the opening is the cliff's own 96 px wall with its lip, so the
plateau's floor above meets it flush and no hard edge shows; the brow over the opening juts a few px past the face and
the opening flares toward the camera, its jambs and soffit in shade.

The frames follow art round 14a's arches: one picture per run and side, the n run's 49 + 32 (n - 1) by 121 + 16 (n - 1)
with its anchor at (8, 100), the w run's anchor at (40 + 32 (n - 1), 100), so render/walls.js gateSlice cuts it unchanged.

Run with plain `python gen.py`. Writes out/, look/, preview*.png. Deterministic. Nothing is wired.
"""
import math, os, sys
import numpy as np
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.abspath(os.path.join(HERE, "..", "..", ".."))  # the repo root: tools/art-gen/round14d/
sys.path.insert(0, os.path.join(REPO, "tools", "art-gen", "round10", "cliffs"))
import gen as g  # art round 10, read only

OUT = os.path.join(HERE, "out")
LOOK = os.path.join(HERE, "look")
HALF, STOREY = g.HALF, g.STOREY

# the opening per width: centre along the run, half width at the foot, crown height
MOUTH = {1: dict(ac=16.0, hw=11.5, ht=58.0), 2: dict(ac=32.0, hw=23.0, ht=61.0), 3: dict(ac=48.0, hw=36.0, ht=62.0)}
FLARE = 0.16      # the opening this much wider and taller at the face than at the back
BROW = 3.5        # how far the rock over the opening juts past the face
TEETH = {1: [(12.0, 1.8, 7.0), (20.0, 1.3, 4.0)], 2: [(21.0, 2.2, 8.0), (30.0, 1.4, 4.5), (42.0, 1.8, 6.5)], 3: [(25.0, 2.3, 9.0), (37.0, 1.4, 5.0), (52.0, 2.0, 7.5), (67.0, 1.6, 6.0)]}


def opening_r(a, z, yc, n, seed):
    """the normalised distance from the opening's centre: < 1 inside the hole"""
    m = MOUTH[n]
    f = 1 + FLARE * np.clip((yc + HALF) / (2 * HALF), 0, 1) ** 1.5
    hw, ht = m["hw"] * f, m["ht"] * (1 + 0.5 * (f - 1))
    u = (a - m["ac"]) / hw
    v = np.clip(z, 0, None) / ht
    th = np.arctan2(v, np.abs(u) + 1e-6) + (u < 0) * 0.3
    rag = 0.16 * (g.vnoise(th * 9 + 3 * (u < 0), 0 * th, seed, 1.0, None, None) - 0.5) + 0.08 * (g.vnoise(th * 23, 0 * th, seed + 1, 1.0, None, None) - 0.5)
    r = (np.abs(u) ** 2.4 + v ** 2.8) ** 0.5 * (1 + rag)
    # teeth: rock hanging into the hole's top
    for (ta, tw, tl) in TEETH[n]:
        tooth = np.exp(-((a - ta) / tw) ** 2) * tl
        r = np.where((v > 0.5) & (z > ht - tooth * (1 - 0.3 * (yc + HALF) / (2 * HALF))), np.maximum(r, 1.001), r)
    return r


def mouth_geom(side, n, vars_, seed):
    """the cliff solid of an n-edge outer run with a mouth carved through it (the plateau behind, the face to the camera)"""
    m = MOUTH[n]

    def geom(X, Y, Z):
        along, across = (X, Y) if side == "n" else (Y, X)
        yc = across
        seg = np.clip(np.floor(along / 32).astype(int), 0, n - 1)
        am = along - 32 * seg
        b = np.zeros(Z.shape)
        band = np.zeros(Z.shape, int)
        crack = np.zeros(Z.shape, bool)
        under = np.zeros(Z.shape, bool)
        for s in range(n):
            bs, ks, cs, us = g.face_bump(np.clip(am, 0, 32), Z, vars_[s])
            w = seg == s
            b = np.where(w, bs, b)
            band = np.where(w, ks, band)
            crack = np.where(w, cs, crack)
            under = np.where(w, us, under)
        # the brow: the rock over the opening juts out, more toward the top, faded off at the opening's sides
        reach = np.clip((m["hw"] + 5 - np.abs(along - m["ac"])) / 6, 0, 1) * np.clip((along - 5) / 4, 0, 1) * np.clip((32 * n - 5 - along) / 4, 0, 1)
        lift = np.clip((Z - (m["ht"] - 6)) / 10, 0, 1) * np.clip((STOREY - 2 - Z) / 6, 0, 1)
        brow = BROW * reach * lift * (0.75 + 0.25 * np.sin(along * 0.37 + seed))
        sdF = yc - HALF - brow
        sdP = yc
        dq = np.maximum(sdP, 0)
        b = np.minimum(b, np.maximum(-sdF + dq - 1.5, 0))
        dF = -sdF - b
        s_ = np.clip(dq / np.maximum(dq + dF, 1e-6), 0, 1)
        h = np.where(dq <= 0, STOREY, STOREY - g.LIP + g.LIP * np.sqrt(np.clip(1 - s_ * s_, 0, 1)))
        solid_n = (dF > 0) & (Z < h)
        r = opening_r(along, Z, yc, n, seed)
        hole = r < 1
        solid = solid_n & ~hole
        clip = (yc >= -HALF) & (along >= 0) & (along < 32 * n)
        occ = clip & solid
        inner = (r < 1.35) & (Z < m["ht"] * 1.25)
        A = {"band": band, "crack": crack, "under": under, "s": s_, "dq": np.where(inner, np.maximum(dq, 1.0), dq),
             "along": np.where(inner, 16.0, am), "occ_n": solid, "inner": inner, "yc": yc, "r": r}
        return occ, A
    return geom


def mouth_colour(grass):
    base = g.rock_colour(grass)
    pal = np.stack(g.ROCK_A + g.ROCK_B).astype(int)

    def colour(P, nrm, A):
        rgb = base(P, nrm, A).astype(int)
        # inside the opening (the jambs and the soffit through the wall's thickness): in shade, deeper the further in
        inner = A["inner"]
        depth_in = np.clip((HALF - A["yc"]) / (2 * HALF), 0, 1)
        steps = np.where(inner, 1 + np.round(2 * depth_in), 0).astype(int)
        steps = np.where(inner & (P[:, 2] < 4), np.maximum(steps - 1, 0), steps)
        d = ((rgb[:, None, :] - pal[None, :, :]) ** 2).sum(-1)
        k = d.argmin(1)
        fam = k // 8
        idx = np.clip(k % 8 - steps, 0, 7)
        out = pal[fam * 8 + idx]
        keep = ~inner | (np.abs(rgb - pal[k]).sum(1) > 30)   # moss and grass keep their own tones
        out = np.where(keep[:, None], rgb, out)
        return out.astype(np.uint8)
    return colour


def canvas_for(side, n):
    W, H = 49 + 32 * (n - 1), 121 + 16 * (n - 1)
    return (W, H, 8, 100) if side == "n" else (W, H, 40 + 32 * (n - 1), 100)


def build_mouths():
    res = {}
    for lip, grass in (("cliff", False), ("cliff_grass", True)):
        col = mouth_colour(grass)
        for side in ("n", "w"):
            for n in (1, 2, 3):
                vars_ = [(3 * n + i + (0 if side == "n" else 1)) % 6 for i in range(n)]
                bnd = (0, 32 * n, -HALF, HALF + 5, 0, STOREY) if side == "n" else (-HALF, HALF + 5, 0, 32 * n, 0, STOREY)
                res[(lip, side, n)] = g.render(bnd, mouth_geom(side, n, vars_, 40 + n), col, canvas_for(side, n))
    return res


def stub_geom(geom, top=8):
    def gg(X, Y, Z):
        occ, A = geom(X, Y, Z)
        A["occ_n"] = A.get("occ_n", occ) & (Z < top)
        return occ & (Z < top), A
    return gg


def build_stubs(res10):
    """the near walls cut to the 8 px stub (the cutaway's picture of a cliff, for the preview only)"""
    out = {}
    for lip, grass in (("cliff", False), ("cliff_grass", True)):
        col = g.rock_colour(grass)
        mcol = mouth_colour(grass)
        for side in ("n", "w"):
            bnd = (0, 32, -HALF, HALF, 0, STOREY) if side == "n" else (-HALF, HALF, 0, 32, 0, STOREY)
            out[(lip, side, "plain")] = g.render(bnd, stub_geom(g.cliff_geom(g.straight_frame(side, False), g.FACE_VARS[side][0])), col, g.WALL_CANVAS[side])
            for n in (1, 2, 3):
                vars_ = [(3 * n + i + (0 if side == "n" else 1)) % 6 for i in range(n)]
                bnd = (0, 32 * n, -HALF, HALF + 5, 0, STOREY) if side == "n" else (-HALF, HALF + 5, 0, 32 * n, 0, STOREY)
                out[(lip, side, n)] = g.render(bnd, stub_geom(mouth_geom(side, n, vars_, 40 + n)), mcol, canvas_for(side, n))
        for nm, (kind, sx, sy) in g.CORNERS.items():
            if nm.startswith("outer"):
                out[(lip, "corner_" + nm)] = g.render(g.corner_bounds(kind, sx, sy), stub_geom(g.cliff_geom(g.corner_frame(kind, sx, sy), g.CORNER_VAR[nm])), col)
    return out


def save(arr, path):
    assert set(np.unique(arr[..., 3])) <= {0, 255}, path
    Image.fromarray(arr, "RGBA").save(path)


def write(res):
    os.makedirs(OUT, exist_ok=True)
    for (lip, side, n), p in res.items():
        sw = "north" if side == "n" else "west"
        save(p.img, os.path.join(OUT, f"wall_{lip}_mouth_{n}_{sw}.png"))


# ======================================================================== the previews
OUTN = {(-1, -1): "outer_s", (1, -1): "outer_w", (-1, 1): "outer_e", (1, 1): "outer_n"}
INN = {(1, 1): "inner_n", (-1, 1): "inner_e", (1, -1): "inner_w", (-1, -1): "inner_s"}


def edges_of(P):
    isP = lambda x, y: (x, y) in P
    E = set()
    for (x, y) in P:
        for e in (("n", x, y), ("n", x, y + 1), ("w", x, y), ("w", x + 1, y)):
            t, ex, ey = e
            a, b = ((ex, ey), (ex, ey - 1)) if t == "n" else ((ex, ey), (ex - 1, ey))
            if isP(*a) != isP(*b):
                E.add(e)
    return E


def put(cv, p, X, Y, bias=0.0):
    """round 10's Canvas.piece with a depth bias on the piece's pixels below the brink (the cave's own faces win through the mouth)"""
    cx, cy = cv.at(X, Y, 0)
    dep = np.nan_to_num(p.dep, nan=-1e9) + X + Y
    if bias:
        dep = dep + bias * (np.nan_to_num(p.wz, nan=999) < 86)
    cv.put(p.img, cx - p.anchor[0], cy - p.anchor[1], dep)


def draw_edges(cv, res10, P, lip, omit=(), skip=lambda e: False, stubs=None, stubbed=lambda e: False, bias=0.0):
    """build_hill's edge pass (round 10) with the mouth's edges left out, some drawn as stubs"""
    isP = lambda x, y: (x, y) in P
    edges = edges_of(P)
    xs = [x for x, _ in P]
    ys = [y for _, y in P]
    claims, cl, posts = {}, [], []
    for vy in range(min(ys) - 1, max(ys) + 3):
        for vx in range(min(xs) - 1, max(xs) + 3):
            q = {(-1, -1): isP(vx - 1, vy - 1), (1, -1): isP(vx, vy - 1), (-1, 1): isP(vx - 1, vy), (1, 1): isP(vx, vy)}
            c = sum(q.values())
            at_v = [e for e in (("n", vx - 1, vy), ("n", vx, vy), ("w", vx, vy - 1), ("w", vx, vy)) if e in edges]
            if not at_v:
                continue
            if c in (1, 3):
                s = [k for k, v in q.items() if v == (c == 1)][0]
                nm = (OUTN if c == 1 else INN)[s]
                ce = [("n", vx if s[0] > 0 else vx - 1, vy), ("w", vx, vy if s[1] > 0 else vy - 1)]
                if all(e in edges for e in ce):
                    cl.append((vx, vy, nm, ce))
                    for e in ce:
                        claims.setdefault(e, []).append((vx, vy))
                    continue
            if not (len(at_v) == 2 and at_v[0][0] == at_v[1][0]):
                posts.append((vx, vy, at_v[0]))
    for (vx, vy, nm, ce) in cl:
        if any(skip(e) for e in ce):
            continue
        hs = "_h" + "".join(t for t, e in zip("nw", ce) if len(claims[e]) > 1)
        hs = "" if hs == "_h" else hs
        if stubs is not None and any(stubbed(e) for e in ce):
            p = stubs.get((lip, "corner_" + nm))
            if p is None:
                continue
        else:
            p = res10[(lip, "corner_" + nm + hs)]
        put(cv, p, vx * 32, vy * 32, bias)
    for e in sorted(edges):
        if e in claims or e in omit or skip(e):
            continue
        t, ex, ey = e
        side = "north" if t == "n" else "west"
        if stubs is not None and stubbed(e):
            put(cv, stubs[(lip, t, "plain")], ex * 32, ey * 32, bias)
            continue
        if isP(ex, ey):
            nm = f"{side}_back"
        else:
            k = int(g.tile_hash(ex, ey, 7 if t == "n" else 8) * 3)
            nm = f"{side}_plain" + ("" if k == 0 else f"_{k}")
        put(cv, res10[(lip, nm)], ex * 32, ey * 32, bias)
    for (vx, vy, e) in posts:
        if not skip(e) and not (stubs is not None and stubbed(e)):
            put(cv, res10[(lip, "post")], vx * 32, vy * 32, bias)


def rock_floor(v):
    return np.array(Image.open(f"{REPO}/data/art/cliffs/floor_cliff_top_{v}.png").convert("RGBA"))


def apron_mask(cx, cy, rad, tx, ty, seed):
    """the pixels of ground tile (tx, ty) the cave's floor spills onto: a ragged half-disc out of the mouth"""
    Xf, Yf, _ = g.floor_world()
    X = Xf + tx * 32
    Y = Yf + ty * 32
    d = np.hypot(X - cx, Y - cy)
    th = np.arctan2(Y - cy, X - cx)
    rr = rad * (1 + 0.3 * (g.vnoise(th * 7, 0 * th, seed, 1.0, None, None) - 0.5)) + 4 * (g.vnoise(X, Y, seed + 3, 3.0, None, None) - 0.5)
    return d < rr


def scene(res10, mouths, stubs, n, side, lip, cut=False):
    W, H = 6, 5
    P = {(x, y) for x in range(1, 1 + W) for y in range(1, 1 + H)}
    if side == "n":
        mouth = [("n", 2 + i, 1 + H) for i in range(n)]
        cx, cy = (2 * 32 + 16 * n), (1 + H) * 32
    else:
        mouth = [("w", 1 + W, 2 + i) for i in range(n)]
        cx, cy = (1 + W) * 32, (2 * 32 + 16 * n)
    mset = set(mouth)
    cv = g.fit_canvas(["." * (W + 2)] * (H + 2), [], m=2)
    gt = g.grass_tiles()
    x0, x1, y0, y1 = cv.ground
    rad = 12 + 12 * n
    for ty in range(y0, y1):
        for tx in range(x0, x1):
            if (tx, ty) in P:
                cv.tile(rock_floor(int(g.tile_hash(tx, ty, 4) * 4)), tx, ty, 0, bias=-0.5)
                continue
            cv.tile(gt[int(g.tile_hash(tx, ty, 1) * 4)], tx, ty, 0, bias=-0.5)
            m = apron_mask(cx, cy, rad, tx, ty, 90 + n)
            if m.any():
                img = rock_floor(int(g.tile_hash(tx, ty, 4) * 4)).copy()
                img[..., 3] = np.where(m, img[..., 3], 0)
                cv.tile(img, tx, ty, 0, bias=-0.4)
    # the cave's own walls seen from inside: the hill's footprint as a pit (round 10's pieces, plateau all round it)
    ring = {(x, y) for x in range(-1, W + 3) for y in range(-1, H + 3)} - P
    near = lambda e: (e[0] == "n" and e[2] == 1 + H) or (e[0] == "w" and e[1] == 1 + W)
    hillE = edges_of(P)
    draw_edges(cv, res10, ring, lip, skip=lambda e: near(e) or e not in hillE, bias=0.0 if cut else 3.0)
    e0 = mouth[0]
    if not cut:
        # from outside: the hill whole, its near face holding the mouth, the cliff top over it
        draw_edges(cv, res10, P, lip, omit=mset)
        cv.piece(mouths[(lip, side, n)], e0[1] * 32, e0[2] * 32, 0)
        for (x, y) in P:
            img = res10[("floor_grass" if lip == "cliff_grass" else "floor_rock", int(g.tile_hash(x, y, 3) * 4))]
            cv.tile(img, x, y, STOREY, bias=0.01)
    else:
        # inside: the near walls and the mouth cut to the stub, the roof hidden (the cave is a room)
        draw_edges(cv, res10, P, lip, omit=mset, skip=lambda e: not near(e), stubs=stubs, stubbed=near)
        cv.piece(stubs[(lip, side, n)], e0[1] * 32, e0[2] * 32, 0)
    return cv


def cropped(cv, W=6, H=5):
    """the scene's picture cropped round the hill (after the figures are in)"""
    l, _ = cv.at(32, 32 + 32 * (H + 1), 0)
    r, _ = cv.at(32 + 32 * (W + 1), 32, 0)
    _, tp = cv.at(32, 32, STOREY)
    _, bt = cv.at(32 + 32 * (W + 1), 32 + 32 * (H + 1), 0)
    return cv.rgb[max(tp - 24, 0):bt + 12, max(l - 24, 0):r + 24].copy()


def hcat(imgs):
    h = max(i.shape[0] for i in imgs)
    return np.concatenate([np.concatenate([i, np.full((h - i.shape[0], i.shape[1], 3), 32, np.uint8)], 0) for i in imgs], 1)


def vcat(imgs):
    w = max(i.shape[1] for i in imgs)
    return np.concatenate([np.concatenate([i, np.full((i.shape[0], w - i.shape[1], 3), 32, np.uint8)], 1) for i in imgs], 0)


def main():
    res10 = g.build_all()
    mouths = build_mouths()
    write(mouths)
    stubs = build_stubs(res10)
    os.makedirs(LOOK, exist_ok=True)
    big = lambda s, k=3: np.kron(s, np.ones((k, k, 1), np.uint8))
    fimg = g.figure()
    rows = []
    for lip in ("cliff", "cliff_grass"):
        for side in ("n", "w"):
            row = []
            for n in (1, 2, 3):
                cv = scene(res10, mouths, stubs, n, side, lip)
                if side == "n":
                    cv.fig(fimg, 2 * 32 + 16 * n + 2, 6 * 32 - 3, 0)
                else:
                    cv.fig(fimg, 7 * 32 - 3, 2 * 32 + 16 * n + 2, 0)
                row.append(g.label(cropped(cv), f"{lip}, {side} run, {n} wide"))
            rows.append(hcat(row))
    Image.fromarray(vcat(rows)).save(os.path.join(HERE, "preview.png"))
    Image.fromarray(big(rows[0], 2)).save(os.path.join(LOOK, "mouths_rock_n_2x.png"))
    Image.fromarray(big(rows[3], 2)).save(os.path.join(LOOK, "mouths_grass_w_2x.png"))
    for lip in ("cliff", "cliff_grass"):
        pair = []
        for cut in (False, True):
            cv = scene(res10, mouths, stubs, 2, "n", lip, cut=cut)
            cv.fig(fimg, 3 * 32 + 16, 3 * 32 + 16, 0)
            pair.append(g.label(cropped(cv), "inside, the cut: near walls to the stub, roof hidden" if cut else "inside, as drawn today: you are hidden"))
        Image.fromarray(big(hcat(pair), 2)).save(os.path.join(LOOK, f"inside_{lip}_2x.png"))
    print("ok", sorted((k, v.img.shape[:2]) for k, v in mouths.items()))


if __name__ == "__main__":
    main()
