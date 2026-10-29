"""Art round 13: battlements (a castle wall's parapet and merlons that hang over the OUTSIDE of the walkway).

`python gen.py` writes out/ (PNGs and their depth maps, the draft definitions), preview.png, look/, manifest.json.
Plain python 3, numpy and PIL; deterministic. Nothing is wired: these wait for Michael's approval.

core.py   the renderer: boxes of stone, shaded as data/art/village/wall_stone_*.png shades its faces
geom.py   the battlement as boxes (the numbers: 16 thick, parapet 28, merlons 44, period 32)
pieces.py the pieces: windows onto the scene, cut so a run's pieces tile the plane exactly
scene.py  the preview's composition by depth (X + Y + Z), the repo's own wall, post, floor and a figure
"""
import json
import os
import sys

import numpy as np
from PIL import Image, ImageDraw

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import pieces as pc            # noqa: E402
import geom                    # noqa: E402
from core import mix           # noqa: E402
import scene                   # noqa: E402

OUT = os.path.join(HERE, "out")
LOOK = os.path.join(HERE, "look")
for d in (OUT, LOOK, os.path.join(OUT, "depth")):
    os.makedirs(d, exist_ok=True)

# ----------------------------------------------------------------------------------------------------------- the library
# the eight corners, named as the cliffs' (src/cliffs.js): outer_<where the vertex sits on the walkway's tile>,
# inner_<where it sits on the notch tile>. arms: (direction the arm leaves the vertex, side of the walkway: -1 far, +1 near).
CORNERS = {
    "outer_n": dict(arms=[("E", -1), ("S", -1)], quad=(-1, -1), near=False, inner=False, plateau="S"),
    "outer_s": dict(arms=[("W", +1), ("N", +1)], quad=(+1, +1), near=True, inner=False, plateau="N"),
    "outer_e": dict(arms=[("W", -1), ("S", +1)], quad=(+1, -1), near=True, inner=False, plateau="W"),
    "outer_w": dict(arms=[("E", +1), ("N", -1)], quad=(-1, +1), near=True, inner=False, plateau="E"),
    "inner_n": dict(arms=[("E", +1), ("S", +1)], quad=(+1, +1), near=True, inner=True, plateau="NEW"),
    "inner_s": dict(arms=[("W", -1), ("N", -1)], quad=(-1, -1), near=False, inner=True, plateau="ESW"),
    "inner_e": dict(arms=[("W", +1), ("S", -1)], quad=(-1, +1), near=True, inner=True, plateau="NES"),
    "inner_w": dict(arms=[("E", -1), ("N", +1)], quad=(+1, -1), near=True, inner=True, plateau="NWS"),
}
ENDS = [(d, s) for d in "ESWN" for s in (-1, +1)]       # a run leaving the vertex toward d: the half merlon beyond the vertex
VARIANTS = [("plain", 0, "plain"), ("plain_1", 1, "plain"), ("plain_2", 2, "plain"), ("loop", 0, "loop")]
SIDE = {-1: "far", +1: "near"}
EDGE = {"n": "north", "w": "west"}


def build():
    lib = {"straight": {}, "corner": {}, "end": {}}
    for edge in "nw":
        for side in (-1, +1):
            items = {}
            for nm, var, kind in VARIANTS:
                items[f"{EDGE[edge]}_{SIDE[side]}_{nm}"] = pc.straight(edge, side, var, kind)
            items[f"{EDGE[edge]}_{SIDE[side]}_late"] = pc.straight(edge, side, 0, "plain", "late")
            items[f"{EDGE[edge]}_{SIDE[side]}_early"] = pc.straight(edge, side, 0, "plain", "early")
            lib["straight"].update(pc.crop_group(items))
    for nm, c in CORNERS.items():
        img, dep = pc.corner(c["arms"], c["quad"], c["near"], c["inner"])
        lib["corner"].update(pc.crop_group({f"corner_{nm}": (img, dep)}))
    for d, s in ENDS:
        img, dep = pc.end(d, s)
        lib["end"].update(pc.crop_group({f"end_{d}_{SIDE[s]}": (img, dep)}))
    return lib


# ------------------------------------------------------------------------------------------- assembling a plan as the engine would
def hsh(*v):
    return mix(*v) / 65536.0


class Plan:
    """P: the walkway's tiles (the floor on layer 1). C: courtyard tiles (no walkway, no battlement round them, just the wall).
    A battlement stands on every edge between a walkway tile and a tile that is neither (outside), except the `gaps` edges."""

    def __init__(self, rows, gaps=()):
        self.P, self.C = set(), set()
        for y, r in enumerate(rows):
            for x, ch in enumerate(r):
                if ch == "#":
                    self.P.add((x, y))
                elif ch == "c":
                    self.C.add((x, y))
        self.gaps = set(gaps)
        self.H, self.Wd = len(rows), max(len(r) for r in rows)

    def edges(self):
        """-> {('n'|'w', tx, ty): side or None}: every edge with a walkway tile on one side and no walkway on the other"""
        out = {}
        for (x, y) in self.P:
            for e, other in ((("n", x, y), (x, y - 1)), (("n", x, y + 1), (x, y + 1)), (("w", x, y), (x - 1, y)), (("w", x + 1, y), (x + 1, y))):
                if other in self.P:
                    continue
                kind, tx, ty = e
                # the walkway tile is south (n edge of its own tile) / east (w edge of its own tile): far; else near
                own = (tx, ty) == (x, y)
                side = -1 if own else +1
                bat = other not in self.C and e not in self.gaps
                out[e] = (side, bat)
        return out

    def vertex_arms(self, vx, vy, bat):
        arms = []
        for d, e in (("E", ("n", vx, vy)), ("W", ("n", vx - 1, vy)), ("S", ("w", vx, vy)), ("N", ("w", vx, vy - 1))):
            if e in bat:
                arms.append((d, bat[e]))
        return arms

    def classify(self, vx, vy, arms):
        """'corner:<name>', 'end:<d>', 'straight' or None"""
        if len(arms) == 1:
            return f"end:{arms[0][0]}"
        if len(arms) == 2:
            ds = {d for d, _ in arms}
            if ds in ({"E", "W"}, {"N", "S"}):
                return "straight"
            q = {"N": (vx - 1, vy - 1), "E": (vx, vy - 1), "W": (vx - 1, vy), "S": (vx, vy)}
            have = "".join(sorted(k for k, t in q.items() if t in self.P))
            for nm, c in CORNERS.items():
                if "".join(sorted(c["plateau"])) == have and {a for a in c["arms"]} == {a for a in arms}:
                    return f"corner:{nm}"
        return None


def draw_plan(cv, repo, lib, plan, figs=(), variants=True, ground=None):
    """compose the plan on the canvas: ground, the village wall under every edge, the floor, the battlement pieces, the figures"""
    gx0, gx1, gy0, gy1 = ground
    for ty in range(gy0, gy1):
        for tx in range(gx0, gx1):
            cv.tile(repo.grass[int(hsh(tx, ty, 1) * 4)], tx, ty, 0, bias=-0.5)
    edges = plan.edges()
    # walls (layer 0): every edge between a walkway tile and a non-walkway tile
    for (kind, tx, ty) in sorted(edges):
        if (kind, tx, ty) in plan.gaps:
            continue
        if kind == "n":
            cv.piece(repo.wn, repo.dn, (8, 100), tx * 32, ty * 32, 0)
        else:
            cv.piece(repo.ww, repo.dw, (40, 100), tx * 32, ty * 32, 0)
    # posts at the wall's vertices where it turns or ends
    for vy in range(gy0, gy1 + 1):
        for vx in range(gx0, gx1 + 1):
            arms = []
            for d, e in (("E", ("n", vx, vy)), ("W", ("n", vx - 1, vy)), ("S", ("w", vx, vy)), ("N", ("w", vx, vy - 1))):
                if e in edges:
                    arms.append(d)
            if arms and not (len(arms) == 2 and set(arms) in ({"E", "W"}, {"N", "S"})):
                cv.piece(repo.post, repo.dp, (18, 107), vx * 32, vy * 32, 0, bias=0.2)
    # the walkway's floor, lifted a storey
    for (x, y) in sorted(plan.P):
        cv.tile(repo.floors[int(hsh(x, y, 3) * 4)], x, y, scene.STOREY, bias=0.4)
    # the battlements
    bat = {e: s for e, (s, b) in edges.items() if b}
    V = {}
    for (kind, tx, ty), side in sorted(bat.items()):
        vx0 = (tx, ty)
        # the late / early cut where an inner corner takes half an edge
        ends = [(tx, ty), (tx + 1, ty)] if kind == "n" else [(tx, ty), (tx, ty + 1)]
        cut = []
        for i, (vx, vy) in enumerate(ends):
            arms = plan.vertex_arms(vx, vy, bat)
            cl = plan.classify(vx, vy, arms)
            if cl and cl.startswith("corner:inner"):
                cut.append("late" if i == 0 else "early")
        nm = f"{EDGE[kind]}_{SIDE[side]}"
        if len(cut) == 2:
            continue                                           # both halves belong to the two corners' blocks
        if cut:
            name = f"{nm}_{cut[0]}"
        else:
            r = hsh(tx, ty, 7 if kind == "n" else 8)
            name = f"{nm}_loop" if (variants and r > 0.9) else f"{nm}_plain" + ("" if r < 0.3 else ("_1" if r < 0.6 else "_2"))
        p = lib["straight"][name]
        cv.piece(p.img, p.dep, p.anchor, tx * 32, ty * 32, scene.STOREY)
    for vy in range(gy0, gy1 + 1):
        for vx in range(gx0, gx1 + 1):
            arms = plan.vertex_arms(vx, vy, bat)
            if not arms:
                continue
            cl = plan.classify(vx, vy, arms)
            if not cl or cl == "straight":
                continue
            if cl.startswith("corner:"):
                p = lib["corner"][f"corner_{cl[7:]}"]
            else:
                d, s = arms[0]
                p = lib["end"][f"end_{d}_{SIDE[s]}"]
            cv.piece(p.img, p.dep, p.anchor, vx * 32, vy * 32, scene.STOREY)
    for (X, Y, Z) in figs:
        cv.fig(repo.fig, X, Y, Z)


def fit(plan, margin=2):
    gx0, gx1 = -margin - 2, plan.Wd + margin
    gy0, gy1 = -margin - 4, plan.H + margin
    left = (gx0 - gy1) * 32
    right = (gx1 - gy0) * 32
    top = (gx0 + gy0) * 16 - 130
    bottom = (gx1 + gy1) * 16 + 4
    cv = scene.Canvas(right - left + 8, bottom - top + 8, -left + 4, -top + 4)
    return cv, (gx0, gx1, gy0, gy1)


RING = ["######",
        "#cccc#",
        "#cccc#",
        "#cccc#",
        "######"]
CROSS = ["...#...",
         "...#...",
         "...#...",
         "#######",
         "...#...",
         "...#...",
         "...#..."]
LONGRUN = ["##########",
           "#########.",
           "..........",
           ]


def fig_at(tx, ty, fx, fy):
    return (tx * 32 + fx, ty * 32 + fy, scene.STOREY)


def scene_ring(repo, lib):
    plan = Plan(RING)
    cv, g = fit(plan)
    figs = [fig_at(2, 0, 14, 12), fig_at(3, 4, 16, 16), fig_at(0, 2, 22, 16), fig_at(5, 2, 20, 14)]
    draw_plan(cv, repo, lib, plan, figs, ground=g)
    return cv.rgb


def scene_cross(repo, lib):
    # the south arm's end is open (a stair or a gate): its two side runs end there, which shows the run's-end pieces
    plan = Plan(CROSS, gaps={("n", 3, 7)})
    cv, g = fit(plan)
    figs = [fig_at(3, 3, 16, 18), fig_at(1, 3, 20, 14), fig_at(3, 1, 16, 12), fig_at(5, 3, 8, 16)]
    draw_plan(cv, repo, lib, plan, figs, ground=g)
    return cv.rgb


def scene_long(repo, lib):
    rows = ["#" * 9, "#" * 9]
    plan = Plan(rows)
    cv, g = fit(plan, 1)
    figs = [fig_at(2, 0, 16, 12), fig_at(6, 1, 12, 24)]
    draw_plan(cv, repo, lib, plan, figs, ground=g)
    return cv.rgb


# ---------------------------------------------------------------------------------------------------------------- writing
def save_png(arr, path):
    a = arr[..., 3]
    assert set(np.unique(a)) <= {0, 255}, path + ": soft alpha"
    Image.fromarray(arr, "RGBA").save(path)


def save_depth(p, path):
    dep = np.where(np.isnan(p.dep), 0, np.round(np.nan_to_num(p.dep)) + 32768).astype(np.uint16)
    Image.fromarray(dep).save(path)


def write(lib):
    man = {"round": 13, "piece": "battlements", "date": "2026-10-29", "files": []}

    def rec(p, what):
        fn = f"{p.name}.png"
        save_png(p.img, os.path.join(OUT, f"battlement_{fn}"))
        save_depth(p, os.path.join(OUT, "depth", f"battlement_{fn}"))
        man["files"].append({"file": f"out/battlement_{fn}", "size": [int(p.img.shape[1]), int(p.img.shape[0])],
                             "anchor": [int(p.anchor[0]), int(p.anchor[1])], "what": what})

    for k, p in lib["straight"].items():
        what = "straight segment, tile top vertex at the walkway floor"
        if k.endswith("late") or k.endswith("early"):
            what = "straight segment cut for an inner corner (" + ("the first 16 left to the corner" if k.endswith("late") else "the last 16 left to the corner") + ")"
        if k.endswith("loop"):
            what = "straight segment, the crenel filled and pierced by an arrow loop (the rare variant)"
        rec(p, what)
    for k, p in lib["corner"].items():
        rec(p, "corner piece, anchored on the vertex at the walkway floor")
    for k, p in lib["end"].items():
        rec(p, "a run's free end (the half merlon beyond the vertex), anchored on the vertex")
    with open(os.path.join(HERE, "manifest.json"), "w") as f:
        json.dump(man, f, indent=1)

    # the draft definitions, in the shape of wall_stone.json (straight) and the cliffs' wall_cliff_corners.json (the vertices)
    images, anchors = {}, {}
    for k, p in lib["straight"].items():
        images[k] = f"data/art/village/battlement_{k}.png"
        anchors[k] = [float(p.anchor[0]), float(p.anchor[1])]
    wall = {
        "anchorVertex": "top",
        "images": images,
        "anchors": anchors,
        "wall": {"height": geom.PARAPET, "thickness": 0, "color": "#7b7670", "material": "stone", "seeThrough": True,
                 "battlement": True, "name": "battlement", "post": "wall_battlement_vertices", "corners": "wall_battlement_vertices",
                 "reach": {"far": 0, "near": 32}},
        "faces": {"north_far": ["north_far_plain", "north_far_plain_1", "north_far_plain_2"],
                  "north_near": ["north_near_plain", "north_near_plain_1", "north_near_plain_2"],
                  "west_far": ["west_far_plain", "west_far_plain_1", "west_far_plain_2"],
                  "west_near": ["west_near_plain", "west_near_plain_1", "west_near_plain_2"]},
        "special": {"loop": {"north_far": "north_far_loop", "north_near": "north_near_loop", "west_far": "west_far_loop", "west_near": "west_near_loop"},
                    "chance": 0.1},
        "cut": {"late": "the picture for an edge whose west/north vertex is an inner corner (its first 16 belong to the corner)",
                "early": "the same for its east/south vertex"},
        "note": ("a castle battlement (art round 13): a parapet 28 high with merlons 44 high, 16 thick, wholly on the OUTSIDE of the edge "
                 "line (half on the wall's top ledge, half hanging over its outer face on a slab and stepped corbels); the walkway's tile "
                 "keeps its whole diamond. `<north|west>_<far|near>_*`: far = the walkway is south/east of the edge (outside north/west, "
                 "the camera's far side: the merlons' inner faces are seen), near = the walkway is north/west (outside south/east: the "
                 "outer faces and the corbels are seen). Anchors at the tile's top vertex at the walkway's floor, as wall_stone's. "
                 "Written for a wall on layer 1 (the floor surface 96 over the ground), standing on the village stone wall."),
    }
    with open(os.path.join(OUT, "wall_battlement.json"), "w") as f:
        json.dump(wall, f, indent=1)
    vimg, vanc = {}, {}
    for grp in ("corner", "end"):
        for k, p in lib[grp].items():
            vimg[k] = f"data/art/village/battlement_{k}.png"
            vanc[k] = [float(p.anchor[0]), float(p.anchor[1])]
    vert = {
        "images": vimg, "anchors": vanc, "anchorAt": "vertex",
        "corners": {nm: {"arms": [[d, SIDE[s]] for d, s in c["arms"]], "plateau": c["plateau"], "image": f"corner_{nm}"} for nm, c in CORNERS.items()},
        "ends": {f"end_{d}_{SIDE[s]}": {"run leaves the vertex toward": d, "side": SIDE[s]} for d, s in ENDS},
        "note": ("the vertex pieces of the battlement (art round 13), anchored on the vertex at the walkway's floor, as a post (no +16). "
                 "Corners are named as the cliffs' (outer_<where the vertex sits on the walkway's tile>, inner_<where it sits on the "
                 "notch tile>) and need the same classification (src/cliffs.js cornerBase, read on the floor of the SAME layer). "
                 "Each is the 16 x 16 block that turns the corner, in the quadrant opposite the walkway (outer) or in the notch "
                 "(inner); the straight pictures at its two ends are unchanged, except at an inner corner where the two edges use their "
                 "`late` / `early` pictures. An `end` piece completes the half merlon beyond a run's free end."),
    }
    with open(os.path.join(OUT, "wall_battlement_vertices.json"), "w") as f:
        json.dump(vert, f, indent=1)


# ---------------------------------------------------------------------------------------------------------------- previews
def big(a, k):
    return np.kron(a, np.ones((k, k, 1), np.uint8))


def label(img, text):
    im = Image.fromarray(img)
    ImageDraw.Draw(im).text((5, 4), text, fill=(232, 222, 200))
    return np.array(im)


def sheet(lib):
    rows = []
    groups = [
        [lib["straight"][k] for k in lib["straight"] if k.startswith("north_far")],
        [lib["straight"][k] for k in lib["straight"] if k.startswith("north_near")],
        [lib["straight"][k] for k in lib["straight"] if k.startswith("west_far")],
        [lib["straight"][k] for k in lib["straight"] if k.startswith("west_near")],
        list(lib["corner"].values()),
        list(lib["end"].values()),
    ]
    for g in groups:
        h = max(p.img.shape[0] for p in g)
        Wt = sum(p.img.shape[1] + 6 for p in g)
        c = np.zeros((h, Wt, 3), np.uint8)
        c[:] = (70, 92, 60)
        x = 0
        for p in g:
            a = p.img[..., 3] > 0
            sub = c[h - p.img.shape[0]:, x:x + p.img.shape[1]]
            sub[a] = p.img[..., :3][a]
            x += p.img.shape[1] + 6
        rows.append(c)
    W = max(r.shape[1] for r in rows)
    rows = [np.concatenate([r, np.full((r.shape[0], W - r.shape[1], 3), 40, np.uint8)], 1) for r in rows]
    s = np.concatenate([np.concatenate([r, np.full((6, W, 3), 40, np.uint8)], 0) for r in rows], 0)
    Image.fromarray(big(s, 3)).save(os.path.join(LOOK, "sheet_3x.png"))


def scene_ends(repo, lib):
    """a two-wide wall walk with a jog: inner corners, outer corners, and its west end left open (a stair would come up there),
    so its two side runs end"""
    rows = [".....###",
            "########",
            "########",
            "###....."]
    plan = Plan(rows, gaps={("w", 0, 1), ("w", 0, 2)})
    cv, g = fit(plan)
    figs = [fig_at(1, 1, 16, 12), fig_at(6, 0, 12, 18), fig_at(4, 2, 20, 16), fig_at(1, 2, 14, 10)]
    draw_plan(cv, repo, lib, plan, figs, ground=g)
    return cv.rgb


def scene_inner(repo, lib):
    """the four inner corners, each a 3 x 3 block with one corner tile missing"""
    outs = []
    for miss in ((2, 0), (0, 0), (2, 2), (0, 2)):
        rows = ["###", "###", "###"]
        rows = ["".join("." if (x, y) == miss else "#" for x in range(3)) for y in range(3)]
        plan = Plan(rows)
        cv, g = fit(plan, 1)
        figs = [fig_at(1, 1, 16, 16)]
        draw_plan(cv, repo, lib, plan, figs, ground=g)
        outs.append(cv.rgb)
    h = max(o.shape[0] for o in outs)
    w = max(o.shape[1] for o in outs)
    pad = lambda o: np.pad(o, ((0, h - o.shape[0]), (0, w - o.shape[1]), (0, 0)), constant_values=48)
    top = np.concatenate([pad(outs[0]), pad(outs[1])], 1)
    bot = np.concatenate([pad(outs[2]), pad(outs[3])], 1)
    return np.concatenate([top, bot], 0)


def closeups(repo, lib):
    """one merlon and its crenel on each of the four pieces, over the village wall and the walkway floor, 6x"""
    plan = Plan(["####", "####", "####", "####"])
    cv, g = fit(plan, 1)
    draw_plan(cv, repo, lib, plan, [], variants=False, ground=g)
    img = cv.rgb
    spots = [("north, walkway south (far)", (48, 0)), ("north, walkway north (near)", (48, 128)),
             ("west, walkway east (far)", (0, 48)), ("west, walkway west (near)", (128, 48))]
    pans = []
    for nm, (X, Y) in spots:
        cx, cy = cv.at(X, Y, scene.STOREY + 16)
        c = img[cy - 40:cy + 40, cx - 50:cx + 50]
        pans.append(label(big(c, 6), nm))
    top = np.concatenate(pans[:2], 1)
    bot = np.concatenate(pans[2:], 1)
    return np.concatenate([top, bot], 0)


def cat_v(parts, pad=8, bg=36):
    W = max(p.shape[1] for p in parts)
    out = []
    for p in parts:
        out.append(np.pad(p, ((0, pad), (0, W - p.shape[1]), (0, 0)), constant_values=bg))
    return np.concatenate(out, 0)


def trim(img, bg=(48, 46, 44)):
    m = np.any(img != np.array(bg, np.uint8), axis=2)
    ys = np.where(m.any(1))[0]
    xs = np.where(m.any(0))[0]
    return img[max(ys.min() - 4, 0):ys.max() + 5, max(xs.min() - 4, 0):xs.max() + 5]


def check_outside():
    """the brief's law: nothing of the battlement stands on the walkway's side of the edge line (margin, not padding)"""
    for side in (-1, +1):
        for var in (0, 1, 2):
            for kind in ("plain", "loop"):
                for b in geom.strip(side, -48, 48, var, kind):
                    if side < 0:
                        assert b.y1 <= 0, ("far strip crosses the edge line", b.y1)
                    else:
                        assert b.y0 >= 0, ("near strip crosses the edge line", b.y0)
    for nm, c in CORNERS.items():
        qx, qy = c["quad"]
        plateau = c["plateau"]
        quad_name = {(-1, -1): "N", (1, -1): "E", (-1, 1): "W", (1, 1): "S"}[(qx, qy)]
        assert quad_name not in plateau, (nm, "the corner block stands on a walkway quadrant")
    print("walkway untouched: every stone of every strip lies on the outside of its edge line, every corner block on a quadrant with no walkway")


def main():
    check_outside()
    lib = build()
    write(lib)
    sheet(lib)
    repo = scene.Repo()
    ring = trim(scene_ring(repo, lib))
    ends = trim(scene_ends(repo, lib))
    inner = trim(scene_inner(repo, lib))
    close = closeups(repo, lib)
    for nm, img in (("ring", ring), ("ends", ends), ("inner", inner)):
        Image.fromarray(big(img, 3)).save(os.path.join(LOOK, f"{nm}_3x.png"))
    Image.fromarray(close).save(os.path.join(LOOK, "closeups_6x.png"))
    # preview.png: the ring at 1x beside the jogged wall walk at 1x, then each at 3x, the inner corners, the close-ups
    one = np.concatenate([np.pad(label(ring, "the castle block (1x)"), ((0, max(0, ends.shape[0] - ring.shape[0])), (0, 8), (0, 0)), constant_values=36),
                          np.pad(label(ends, "a jogged wall walk, its west end open (1x)"), ((0, max(0, ring.shape[0] - ends.shape[0])), (0, 0), (0, 0)), constant_values=36)], 1)
    parts = [one,
             label(big(ring, 3), "the castle block, 3x: far battlement on the north and west runs, near on the south and east, a figure on every side"),
             label(big(ends, 3), "a jogged wall walk, 3x: inner and outer corners, the open end's run-end pieces"),
             label(big(inner, 2), "the four inner corners, 2x (a 3 x 3 block each, one corner tile missing)"),
             label(close, "close-ups, 6x: one merlon and one crenel on each of the four straight pieces (north far, north near, west far, west near)")]
    full = cat_v(parts)
    Image.fromarray(full).save(os.path.join(HERE, "preview.png"))
    for k, p in {**lib["straight"], **lib["corner"], **lib["end"]}.items():
        print(k, p.img.shape[1], p.img.shape[0], tuple(int(v) for v in p.anchor))


if __name__ == "__main__":
    main()
