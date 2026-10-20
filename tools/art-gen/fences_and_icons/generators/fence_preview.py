"""The fence placement previews (docs/art/11, Part A), assembled from the PNGs and the anchors only,
in the game's draw order: arriving segments, the post, leaving segments. Posts follow walls.js postAt:
one at every vertex where an edge ends, turns, joins, or changes material; none where two segments
of one material continue straight. The heavier material's post wins (stone > log > wood > fence)."""
import json, os, sys
from PIL import Image
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from common import Board, figure, x3, REFS, D

V = os.path.join(D, "..", "out", "village")
PV = os.path.join(D, "..", "out", "previews"); os.makedirs(PV, exist_ok=True)
A = json.load(open(f"{V}/anchors_fence.json")); A.update(json.load(open(f"{REFS}/tools/art-gen/village/anchors_walls.json")))
FOLDERS = [V, f"{REFS}/data/art/village"]
RANK = {"fence": 0, "wood": 1, "log": 2, "stone": 3}


class Yard:
    """edges laid as ('n'|'w', i, j) -> (material, variant); posts worked out as the engine does."""
    def __init__(self, W, H, org):
        self.b = Board(W, H, org, A, FOLDERS); self.edges = {}; self.figs = []

    def edge(self, side, i, j, mat="fence", var="plain"):
        self.edges[(side, i, j)] = (mat, var)

    def run(self, side, i, j, n, mat="fence"):
        for k in range(n):
            self.edge(side, i + (k if side == "n" else 0), j + (k if side == "w" else 0), mat)

    def fig(self, f, X, Y, dead=False): self.figs.append((figure(f, dead), X, Y))

    def posts(self):
        verts = set()
        for (s, i, j) in self.edges:
            verts.add((i, j)); verts.add((i + 1, j) if s == "n" else (i, j + 1))
        out = {}
        for (i, j) in verts:
            nE = self.edges.get(("n", i, j)); nW = self.edges.get(("n", i - 1, j))
            wS = self.edges.get(("w", i, j)); wN = self.edges.get(("w", i, j - 1))
            walls = [e for e in (nE, nW, wS, wN) if e]
            if not walls: continue
            if nE and nW and not wS and not wN and nE[0] == nW[0]: continue
            if wS and wN and not nE and not nW and wS[0] == wN[0]: continue
            out[(i, j)] = max((e[0] for e in walls), key=lambda m: RANK[m])
        return out

    def draw(self):
        for (s, i, j), (mat, var) in self.edges.items():
            o = "north" if s == "n" else "west"
            ex = []
            if var == "door_open":
                ex = [f"door_open_{mat}_{o}"] if mat != "fence" else ["door_open_fence_" + o]
            if var.startswith("door_open_fence_"):   # an in-between leaf: the open segment plus that leaf
                ex = [var]; var = "door_open"
            if var.startswith("boards_"):            # a shut gate with boards
                ex = [var]; var = "door_shut"
            self.b.seg(o, f"wall_{mat}_{o}_{var}", i, j, ex)
        for (i, j), mat in self.posts().items(): self.b.post(f"post_{mat}", 32 * i, 32 * j)
        for im, X, Y in self.figs: self.b.fig(im, X, Y)
        return self.b.draw()


def save(im, name):
    im.save(f"{PV}/{name}_1x.png"); x3(im).save(f"{PV}/{name}_3x.png"); print(name, im.size)


def alone():
    names = [("wall_fence_north_plain", 0), ("wall_fence_north_door_shut", 0), ("wall_fence_north_door_open", 0),
             ("door_open_fence_north", 0), ("door_open_fence_north_30", 0), ("door_open_fence_north_60", 0),
             ("wall_fence_west_plain", 1), ("wall_fence_west_door_shut", 1), ("wall_fence_west_door_open", 1),
             ("door_open_fence_west", 1), ("door_open_fence_west_30", 1), ("door_open_fence_west_60", 1), ("post_fence", 2),
             ("boards_gate_north_1", 0), ("boards_gate_north_2", 0), ("boards_gate_north_3", 0),
             ("boards_gate_west_1", 1), ("boards_gate_west_2", 1), ("boards_gate_west_3", 1)]
    W = 60 * len(names) + 40; H = 110
    b = Board(W, H, (0, 0), A, FOLDERS)
    for k, (n, o) in enumerate(names):
        b.org = (30 + k * 60 + (34 if o == 1 else 0) + (10 if o == 2 else 0), 50)
        if o == 2: b.post(n, 0, 0)
        else: b.items.append((0, n, 0, 0))
        b.draw()
    return b.c


def lines():
    y = Yard(640, 240, (60, 60)); y.run("n", 0, 0, 4)
    y2 = Yard(640, 240, (580, 60)); y2.run("w", 0, 0, 4)
    y2.b.c = y.draw(); return y2.draw()


def lone():
    W, H = 640, 130
    y = Yard(W, H, (0, 0)); specs = [("n", "plain"), ("n", "door_shut"), ("n", "door_open"), ("w", "plain"), ("w", "door_shut"), ("w", "door_open")]
    for k, (s, v) in enumerate(specs):
        y.b.org = (50 + k * 100 + (36 if s == "w" else 0), 60); y.edges = {}; y.edge(s, 0, 0, "fence", v); y.draw()
    return y.b.c


def yard():
    y = Yard(420, 300, (210, 70))
    y.run("n", 0, 0, 4); y.run("w", 0, 0, 3); y.run("n", 0, 3, 4); y.run("w", 4, 0, 3)
    y.edge("n", 1, 0, var="door_shut"); y.edge("w", 0, 1, var="door_open")
    y.edge("n", 2, 3, var="door_open"); y.edge("w", 4, 1, var="door_shut")
    return y.draw()


def tees():
    y = Yard(560, 260, (150, 70))
    y.run("n", -1, 0, 2); y.run("w", 0, 0, 2)                      # a T: the north run with a west leg from its middle
    y2 = Yard(560, 260, (400, 110))
    y2.run("n", -1, 0, 2); y2.run("w", 0, -1, 2)                   # a cross
    y2.b.c = y.draw(); return y2.draw()


def building(mat, org, W=560, H=330):
    """a 2 x 2 room of `mat`; a fence arrives at its back corner from behind (a west run above) and
    leaves its front corner toward the camera (a north run)"""
    y = Yard(W, H, org)
    y.run("n", 0, 0, 2, mat); y.run("w", 0, 0, 2, mat); y.run("w", 2, 0, 2, mat); y.run("n", 0, 2, 2, mat)
    y.edge("n", 1, 2, mat, "door_shut")
    y.run("w", 0, -4, 4)        # arriving from behind at vertex (0,0): its near half is hidden by the 80 px back wall, as it should be
    y.run("n", 2, 2, 2)         # leaving the front corner (2,2) toward the camera
    return y


def buildings():
    im = None
    for k, mat in enumerate(("stone", "log", "wood")):
        y = building(mat, (120 + k * 230, 170), W=740, H=350)
        if im is not None: y.b.c = im
        im = y.draw()
    return im


def gate_corner_and_end():
    y = Yard(520, 230, (120, 50))
    y.run("n", 0, 0, 3); y.run("w", 0, 0, 2); y.edge("n", 0, 0, var="door_shut")      # a gate beside a corner
    y2 = Yard(520, 230, (360, 40)); y2.run("w", 0, 0, 3); y2.edge("w", 0, 2, var="door_open")   # a gate at the end of a run
    y2.b.c = y.draw(); return y2.draw()


def back_corner_open():
    """an open gate in the corner tile of a yard's back side: the leaf lies near the other fence"""
    y = Yard(560, 230, (130, 50))
    y.run("n", 0, 0, 3); y.run("w", 0, 0, 3); y.edge("n", 0, 0, var="door_open")
    y2 = Yard(560, 230, (400, 50)); y2.run("n", 0, 0, 3); y2.run("w", 0, 0, 3); y2.edge("w", 0, 0, var="door_open")
    y2.b.c = y.draw(); return y2.draw()


def swing():
    W, H = 760, 150
    y = Yard(W, H, (0, 0))
    k = 0
    for s in ("n", "w"):
        for v in ("door_shut", f"door_open_fence_{'north' if s == 'n' else 'west'}_30", f"door_open_fence_{'north' if s == 'n' else 'west'}_60", "door_open"):
            y.b.org = (40 + k * 90 + (36 if s == "w" else 0), 70); y.edges = {}; y.edge(s, 0, 0, "fence", v); y.draw(); k += 1
    return y.b.c


def see_through():
    y = Yard(760, 300, (160, 90))
    y.run("n", 0, 0, 4); y.edge("n", 2, 0, var="door_shut")
    y.fig("s", 16, -12); y.fig("s", 80, -12, dead=True)          # behind the fence and the gate
    y.fig("s", 48, 30); y.fig("sw", 112, 30, dead=True)         # in front
    y2 = Yard(760, 300, (620, 60))
    y2.run("w", 0, 0, 4); y2.edge("w", 0, 2, var="door_shut")
    y2.fig("s", -12, 16); y2.fig("s", -12, 80, dead=True)
    y2.fig("s", 30, 48); y2.fig("se", 30, 112, dead=True)
    y2.b.c = y.draw(); return y2.draw()


def boards():
    W, H = 560, 130
    y = Yard(W, H, (0, 0)); k = 0
    for s in ("n", "w"):
        for n in (1, 2, 3):
            y.b.org = (50 + k * 90 + (36 if s == "w" else 0), 60); y.edges = {}
            y.edge(s, 0, 0, "fence", f"boards_gate_{'north' if s == 'n' else 'west'}_{n}"); y.draw(); k += 1
    return y.b.c


if __name__ == "__main__":
    for name, fn in (("fence_alone", alone), ("fence_lines", lines), ("fence_lone", lone), ("fence_yard", yard), ("fence_tees_cross", tees),
                     ("fence_buildings", buildings), ("fence_gate_corner_end", gate_corner_and_end), ("fence_back_corner_open", back_corner_open),
                     ("fence_swing", swing), ("fence_see_through", see_through), ("fence_gate_boards", boards)):
        save(fn(), name)
