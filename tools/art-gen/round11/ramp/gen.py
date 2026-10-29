"""Art round 11: the Stone ramp with its own solid sides for the landing tile.

Written 2026-10-29 on art round 10's method (cliffbase.py is round 10's gen.py, copied whole: the voxel solid, the z-buffer splat, the
strata, the palettes; `python gen.py` here imports it and draws the new pieces).

What is delivered (option (b), the engine's `wall_ramp_side`):
  wall_ramp_side_north_plain.png, wall_ramp_side_west_plain.png   49 x 121, anchors (8, 100) and (40, 100): wall_stone's frames
  stair_ramp_stone_n.png, stair_ramp_stone_w.png                   the ramp slab again, flanks squared, flank strata continuing into the sides
  + preview.png, manifest.json, README.md, out/*.json drafts

World units as in round 10: X and Y along the ground (a tile is 32 x 32), Z height in screen px; screen x = X - Y, y = (X+Y)/2 - Z.
The side piece's face lies ON the edge line (the ramp's own flank is on the lane's edge line), its 8 px of rock behind it inside the
edge line's near side; flat top at 96; no lip, no top strip drawn (the landing's floor is the top). Square: nothing rounds.
"""
import json, math, os
import numpy as np
from PIL import Image, ImageDraw
import cliffbase as cb
from cliffbase import (STOREY, np as _np, Piece, Canvas, render, rock_colour, ramp_colour, face_bump, tone_of, clump,
                       save_png, save_depth, label, tile_hash, build_hill, fit_canvas, figure, grass_tiles, floor_world)

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "out")
LOOK = os.path.join(HERE, "look")
for d in (OUT, LOOK, os.path.join(OUT, "depth")):
    os.makedirs(d, exist_ok=True)
OLD = os.path.join(HERE, "..", "..", "round10", "cliffs", "out")  # round 10's output: run round10/cliffs/gen.py first

BUMP = 0.45         # the faces' relief, scaled down from the cliff's (plain faces, only slight weathering; also keeps a piece's recess from showing past its neighbour's corner)
COPING = 6          # the top course of a face: flat, no recess (the same as the ramp's flank under its slab)
THICK = 8           # the rock behind a side's face
SIDE_R = 1.5        # the ramp's flank rounding: a hard square edge (round 10 had 5)
SIDE_VAR = {"n": 19, "w": 20}
RAMP_VAR = {"n": 17, "w": 18}


# ======================================================================== the side piece
def side_geom(side, var):
    def geom(X, Y, Z):
        along, c = (X, -Y) if side == "n" else (Y, -X)
        b, band, crack, under = face_bump(np.clip(along, 0, 32), Z, var)
        b = b * BUMP
        b = np.where(Z > STOREY - COPING, 0.0, b)
        solid = (c >= b) & (c < THICK) & (Z < STOREY)
        clip = (along >= 0) & (along < 32)
        return clip & solid, {"band": band, "crack": crack, "under": under, "s": np.zeros_like(Z), "dq": np.ones_like(Z),
                              "along": along, "occ_n": solid}
    return geom


def side_colour():
    base = rock_colour()
    def colour(P, n, A):
        rgb = base(P, n, A)
        # the top course: one lit row at the very top, as a coping stone's edge, and a dark line under it
        z = P[:, 2]
        top_edge = (z > STOREY - 1.2)
        rgb = np.where(top_edge[:, None], cb.ROCK_A[6], rgb)
        under = (z <= STOREY - COPING) & (z > STOREY - COPING - 1.1) & (n[:, 2] < 0.5)
        rgb = np.where(under[:, None], cb.ROCK_A[1], rgb)
        return rgb.astype(np.uint8)
    return colour


def strip_top(p, side):
    """what is not the face: the top strip of the body (the landing's floor is the top) and the body's end caps (a flat cut end, so a
    piece's thickness never shows as a stub beside its neighbour). Only the face's own voxels (within 0.9 of the face) stay."""
    along, c = (p.wx, -p.wy) if side == "n" else (p.wy, -p.wx)
    b, _, _, _ = face_bump(np.clip(np.nan_to_num(along), 0, 32), np.nan_to_num(p.wz), SIDE_VAR[side])
    b = b * BUMP
    b = np.where(np.nan_to_num(p.wz) > STOREY - COPING, 0.0, b)
    inner = (c - b) > 0.9
    m = ((p.wz > STOREY - 1.0) | (along > 31.4) | (along < 0.6)) & inner
    img = p.img.copy()
    img[m, 3] = 0
    img[m, :3] = 0
    dep = p.dep.copy()
    dep[m] = np.nan
    return Piece(img, dep, p.wx, p.wy, p.wz, p.anchor)


def build_sides():
    out = {}
    for side in ("n", "w"):
        bnd = (0, 32, -THICK, 0, 0, STOREY) if side == "n" else (-THICK, 0, 0, 32, 0, STOREY)
        canvas = cb.WALL_CANVAS[side]
        out[side] = strip_top(render(bnd, side_geom(side, SIDE_VAR[side]), side_colour(), canvas), side)
    return out


# ======================================================================== the ramp slab, redrawn
def ramp_geom2(d, var):
    def geom(X, Y, Z):
        u, v = cb.ramp_to_frame(d, X, Y)
        dv = np.minimum(v, 32 - v)
        b, band, crack, under = face_bump(np.clip(u / 3, 0, 32), Z, var)
        b = b * BUMP
        top = cb.ramp_height(u)
        b = np.where(Z > top - COPING, 0.0, b)
        dF = dv - b
        drop = np.where(dF < SIDE_R, SIDE_R - np.sqrt(np.clip(SIDE_R ** 2 - (SIDE_R - dF) ** 2, 0, None)), 0)
        occ = (u >= 0) & (u < 97.5) & (dF > 0) & (Z < top - drop)
        s = np.clip(1 - dF / SIDE_R, 0, 1)
        return occ, {"band": band, "crack": crack, "under": under, "s": s, "dq": np.ones_like(Z), "along": u}
    return geom


def build_ramps():
    out = {}
    for d in ("n", "w"):
        bnd = (0, 32, -64, 32, 0, STOREY) if d == "n" else (-64, 32, 0, 32, 0, STOREY)
        out[d] = cb.crop(render(bnd, ramp_geom2(d, RAMP_VAR[d]), ramp_colour()))
    return out


def load_old(d):
    fn = f"stair_ramp_stone_{d}"
    img = np.array(Image.open(f"{OLD}/{fn}.png").convert("RGBA"))
    dep = np.array(Image.open(f"{OLD}/depth/{fn}.png")).astype(float) - 32768
    dep[img[..., 3] == 0] = np.nan
    anchor = {"n": (29, 127), "w": (97, 127)}[d]
    z = np.full(dep.shape, np.nan)
    return Piece(img, dep, z, z, z, anchor)


# ======================================================================== scenes
def ground(cv):
    gt = grass_tiles()
    x0, x1, y0, y1 = cv.ground
    for ty in range(y0, y1):
        for tx in range(x0, x1):
            cv.tile(gt[int(tile_hash(tx, ty, 1) * 4)], tx, ty, 0, bias=-0.5)


def side_edges(lx, ly, d):
    """the engine's map.landingSideEdges: every n and w edge of the landing tile but the head's (the one it shares with the top step)"""
    edges = [("n", lx, ly), ("n", lx, ly + 1), ("w", lx, ly), ("w", lx + 1, ly)]
    head = ("n", lx, ly + 1) if d == "n" else ("w", lx + 1, ly)
    return [e for e in edges if e != head]


def landing_of(tx, ty, d):
    return (tx, ty - 3) if d == "n" else (tx - 3, ty)


def put_ramp(cv, res, tx, ty, d, floor, sides=True, old=None):
    """a ramp with its landing: the slab, the landing's floor at 96, the sides (the engine lays them with the stair)"""
    cv.piece(old if old else res[("ramp", d)], tx * 32, ty * 32, 0)
    lx, ly = landing_of(tx, ty, d)
    cv.tile(floor, lx, ly, STOREY, bias=0.01)
    if sides:
        for (t, ex, ey) in side_edges(lx, ly, d):
            cv.piece(res[("side", t)], ex * 32, ey * 32, 0)


def figs_for(tx, ty, d):
    h = float(cb.ramp_height(np.array([48.0]))[0])
    if d == "n":
        return [(tx * 32 + 16, ty * 32 + 40, 0), (tx * 32 + 16, ty * 32 - 16, h), (tx * 32 + 16, (ty - 3) * 32 + 16, STOREY)]
    return [(tx * 32 + 40, ty * 32 + 16, 0), (tx * 32 - 16, ty * 32 + 16, h), ((tx - 3) * 32 + 16, ty * 32 + 16, STOREY)]


def scene_free(res, old=False):
    """both facings free-standing, each with the figure at the foot, halfway, and on the landing"""
    plan = ["." * 15] * 9
    ramps = [(2, 6, "n"), (11, 5, "w")]
    cv = fit_canvas(plan, ramps)
    ground(cv)
    for (tx, ty, d) in ramps:
        put_ramp(cv, res, tx, ty, d, res[("floor", tx % 4)], sides=not old, old=load_old(d) if old else None)
    f = figure()
    for (tx, ty, d) in ramps:
        for (X, Y, Z) in figs_for(tx, ty, d):
            cv.fig(f, X, Y, Z)
    return cv.rgb


PLAN_T = [
    "..............",
    "..............",
    "..#######.....",
    "..#######.....",
    "..#######.....",
    "..#######.....",
    "..............",
    "..............",
    "..............",
]
TRAMPS = [(4, 8, "n"), (11, 3, "w")]


def scene_t(res):
    cv = fit_canvas(PLAN_T, TRAMPS)
    landings = {landing_of(*r) for r in TRAMPS}
    tmp = dict(res)
    build_hill(cv, tmp, PLAN_T, TRAMPS, lips="cliff_grass", grass_top=lambda x, y: (x, y) not in landings)
    # build_hill drew the old ramp pictures under ("ramp", d): here those are the new slabs; add the sides the engine would lay
    for (tx, ty, d) in TRAMPS:
        lx, ly = landing_of(tx, ty, d)
        for (t, ex, ey) in side_edges(lx, ly, d):
            cv.piece(res[("side", t)], ex * 32, ey * 32, 0)
    f = figure()
    for (tx, ty, d) in TRAMPS:
        for (X, Y, Z) in figs_for(tx, ty, d):
            cv.fig(f, X, Y, Z)
    return cv.rgb


def scene_compare(res):
    """the old ramp (art round 10: no sides for the landing) beside the new, both climbing n, then both climbing w"""
    plan = ["." * 14] * 9
    ramps = [(2, 6, "n"), (6, 6, "n"), (12, 5, "w")]
    cv = fit_canvas(plan, ramps)
    ground(cv)
    put_ramp(cv, res, 2, 6, "n", res[("floor", 0)], sides=False, old=load_old("n"))
    put_ramp(cv, res, 6, 6, "n", res[("floor", 1)])
    put_ramp(cv, res, 12, 5, "w", res[("floor", 2)])
    f = figure()
    for (X, Y, Z) in [(2 * 32 + 16, 3 * 32 + 16, STOREY), (6 * 32 + 16, 3 * 32 + 16, STOREY)]:
        cv.fig(f, X, Y, Z)
    return cv.rgb


def scene_meet(res):
    """the cliff's end meeting the ramp: a straight cliff run ends at a ramp that climbs n into the end of its face (the cliff top
    flush with the landing), and the same with the cliff on the ramp's other side"""
    plan = [
        "................",
        "................",
        "..######........",
        "..######........",
        "..............",
        "..............",
        "..............",
    ]
    # a run of cliff 6 wide with the ramp's landing at its east end, climbing n through the face: plateau x 2..7 y 2..3 + landing (8, 3)
    plan = ["..............", "..............", "..#########...", "..#########...", "..............", "..............", ".............."]
    ramps = [(8, 6, "n")]
    cv = fit_canvas(plan, ramps)
    landings = {landing_of(*r) for r in ramps}
    build_hill(cv, dict(res), plan, ramps, lips="cliff_grass", grass_top=lambda x, y: (x, y) not in landings)
    for (tx, ty, d) in ramps:
        lx, ly = landing_of(tx, ty, d)
        for (t, ex, ey) in side_edges(lx, ly, d):
            cv.piece(res[("side", t)], ex * 32, ey * 32, 0)
    f = figure()
    for (X, Y, Z) in figs_for(8, 6, "n"):
        cv.fig(f, X, Y, Z)
    return cv.rgb


# ======================================================================== writing
def ramp_table(d, anchor):
    surf = cb.ramp_surface(d, anchor)
    # the landing: flat at 96, its tile's centre
    X, Y = (16, -80) if d == "n" else (-80, 16)
    land = {"t": 3.5, "height": 96.0, "centre": [round(X - Y + anchor[0], 1), round((X + Y) / 2 - 96 + anchor[1], 1)]}
    return surf, land


def write(res):
    man = {"round": 11, "date": "2026-10-29", "files": []}

    def rec(name, arr, anchor, note):
        man["files"].append({"file": f"out/{name}", "size": [int(arr.shape[1]), int(arr.shape[0])], "anchor": [int(anchor[0]), int(anchor[1])], "what": note})

    images, anchors = {}, {}
    for t, word in (("n", "north"), ("w", "west")):
        p = res[("side", t)]
        fn = f"wall_ramp_side_{word}_plain.png"
        save_png(p.img, os.path.join(OUT, fn))
        save_depth(p, os.path.join(OUT, "depth", fn))
        images[f"{word}_plain"] = f"data/art/village/{fn}"
        anchors[f"{word}_plain"] = [float(p.anchor[0]), float(p.anchor[1])]
        rec(fn, p.img, p.anchor, f"the ramp's side, {word} edge: a square rock face on the edge line, 96 tall, flat top")
    with open(os.path.join(OUT, "wall_ramp_side.json"), "w") as f:
        json.dump({
            "anchorVertex": "top", "images": images, "anchors": anchors,
            "wall": {"height": 96, "thickness": 16, "color": "#6e6a66", "material": "stone", "solid": True},
            "note": ("the Stone ramp's own side for its landing tile (art round 11): bare cliff rock in the ramp's strata, a plain straight "
                     "face on the edge line (not 8 px out as a cliff's is), 96 tall, a flat top course, no lip, no top strip drawn (the "
                     "landing's floor is the top), no post (omit wall.post). The same picture serves both of an edge's sides: its face "
                     "shows where the camera sees it (the edge's +Y face for north, +X for west), and the rock behind it lies on the "
                     "edge's near side (north: Y -8 to 0, west: X -8 to 0)."),
        }, f, indent=1)
    drawings, surface, land, cols = {}, {}, {}, {}
    for d in ("n", "w"):
        p = res[("ramp", d)]
        fn = f"stair_ramp_stone_{d}.png"
        save_png(p.img, os.path.join(OUT, fn))
        save_depth(p, os.path.join(OUT, "depth", fn))
        drawings[d] = {"image": f"data/art/village/{fn}", "anchor": [int(p.anchor[0]), int(p.anchor[1])]}
        rec(fn, p.img, p.anchor, f"stone ramp climbing {d}, anchor the low-end tile's top vertex")
        surface[d], land[d] = ramp_table(d, p.anchor)
        cols[d] = cb.ramp_columns(d, p.anchor[0])
    with open(os.path.join(OUT, "stair_ramp_stone.json"), "w") as f:
        json.dump({
            "anchorVertex": "top", "facings": ["n", "w"], "facingFootprint": {"n": [1, 3], "w": [3, 1]},
            "drawings": drawings,
            "anchorTile": "the low-end tile (the stair's `at`): the anchor is its top vertex at ground level",
            "columns": cols,
            "ramp": {"rise": "z = 32 px a tile along the run (map.stairStep's rise), less a worn step's tread",
                     "steps": [{"u": a / 32, "tread": cb.STEP_L / 32, "height": a} for a in cb.RAMP_STEPS],
                     "surface": surface, "landing": land},
            "depth": {d: f"data/art/village/depth/stair_ramp_stone_{d}.png" for d in ("n", "w")},
            "landingSides": "wall_ramp_side (wall_ramp_side.json): laid on the landing tile's three ground edges by map.buildStair",
            "carry": False,
            "note": ("the stone ramp, redrawn in art round 11: the slab as round 10's, its flanks now square-edged (rounding 1.5 px, was 5) "
                     "and its strata continuing without a seam into wall_ramp_side's faces at the head; the landing's sides are the "
                     "wall_ramp_side pieces, not part of this picture"),
        }, f, indent=1, default=int)
    with open(os.path.join(HERE, "manifest.json"), "w") as f:
        json.dump(man, f, indent=1)


def sheet(res):
    pics = [res[("side", "n")].img, res[("side", "w")].img, res[("ramp", "n")].img, res[("ramp", "w")].img]
    h = max(p.shape[0] for p in pics)
    W = sum(p.shape[1] + 8 for p in pics)
    c = np.zeros((h, W, 3), np.uint8)
    c[:] = (70, 92, 60)
    x = 0
    for p in pics:
        a = p[..., 3] > 0
        sub = c[h - p.shape[0]:, x:x + p.shape[1]]
        sub[a] = p[..., :3][a]
        x += p.shape[1] + 8
    Image.fromarray(np.kron(c, np.ones((4, 4, 1), np.uint8))).save(os.path.join(LOOK, "sheet_4x.png"))


def preview(res):
    big = lambda s: np.kron(s, np.ones((3, 3, 1), np.uint8))
    free = scene_free(res)
    tee = scene_t(res)
    comp = scene_compare(res)
    meet = scene_meet(res)
    for nm, s in (("free", free), ("t", tee), ("compare", comp), ("meet", meet)):
        Image.fromarray(big(s)).save(os.path.join(LOOK, f"{nm}_3x.png"))
        Image.fromarray(s).save(os.path.join(LOOK, f"{nm}_1x.png"))
    hh = max(s.shape[0] for s in (free, tee, comp, meet))
    padh = lambda a: np.concatenate([a, np.full((hh - a.shape[0], a.shape[1], 3), 32, np.uint8)], 0)
    one = np.concatenate([padh(label(free, "free-standing, n and w (1x)")), padh(label(tee, "T: ramps into a cliff's faces (1x)")),
                          padh(label(comp, "old (left) beside new, n; new w (1x)")), padh(label(meet, "T at a cliff run's end (1x)"))], 1)
    rows = [one]
    for s, t in ((free, "free-standing, 3x"), (tee, "the T, 3x"), (comp, "old ramp (left), new ramp, 3x"), (meet, "the cliff run's end, 3x")):
        rows.append(label(big(s), t))
    W = max(r.shape[1] for r in rows)
    pad = lambda a: np.concatenate([a, np.full((a.shape[0], W - a.shape[1], 3), 32, np.uint8)], 1)
    gap = np.full((6, W, 3), 32, np.uint8)
    full = np.concatenate([x for r in rows for x in (pad(r), gap)], 0)
    Image.fromarray(full).save(os.path.join(HERE, "preview.png"))


if __name__ == "__main__":
    res = {}
    sides = build_sides()
    ramps = build_ramps()
    for t in ("n", "w"):
        res[("side", t)] = sides[t]
        res[("ramp", t)] = ramps[t]
    # the cliff pieces the T scenes need (round 10's, drawn again by its code)
    import pickle
    pk = os.path.join(LOOK, "cres.pkl")
    if os.path.exists(pk):
        cres = pickle.load(open(pk, "rb"))
    else:
        cres = cb.build_all()
        pickle.dump(cres, open(pk, "wb"))
    for k, v in cres.items():
        if k[0] not in ("ramp",):
            res[k] = v
    # floors: the cliff-top (rock) floors for the landings
    for v in range(4):
        res[("floor", v)] = cres[("floor_rock", v)]
    res[("ramp", "n")], res[("ramp", "w")] = ramps["n"], ramps["w"]
    write(res)
    sheet(res)
    preview(res)
    for k in (("side", "n"), ("side", "w"), ("ramp", "n"), ("ramp", "w")):
        print(k, res[k].size, res[k].anchor)
