"""Previews assembled purely from the delivered PNGs + anchors (doubles as an integration test)."""
import json, os, sys
import numpy as np
from PIL import Image
D = os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0, D)
# 2026-10-27, docs/art/13: the grass and the figure from preview_kit (the archive's decals/trees_v2 outputs are not kept);
# the walls from the 96 px delivery (out/), the furniture and floors, unchanged, from the game's data/art/village;
# every canvas 16 px taller (DH) so the taller walls are not cut off; the figure placed by its feet (24, 66).
from preview_kit import grass_field, figure, put_figure
from village import H_WALL

WALLS = os.path.dirname(os.path.dirname(D))
V = os.environ.get("WALL_OUT", os.path.join(WALLS, "out"))
FURN = os.path.join(WALLS, "ref", "data", "art", "village")
PRE = os.path.join(V, "previews"); os.makedirs(PRE, exist_ok=True)
DH = H_WALL - 80
A = {**json.load(open(f"{V}/anchors_walls.json")), **json.load(open(f"{D}/anchors_furniture.json"))}


def img(name):
    p = f"{V}/{name}.png"
    return Image.open(p if os.path.exists(p) else f"{FURN}/{name}.png").convert("RGBA")


def place(canvas, name, wx, wy, org, alpha=1.0, im=None):
    im = im or img(name)
    ax, ay = A[name]["anchor_px"]
    if alpha < 1:
        a = np.array(im); a[..., 3] = (a[..., 3] * alpha).astype(np.uint8); im = Image.fromarray(a)
    canvas.alpha_composite(im, (int(round(org[0] + wx - wy - ax)), int(round(org[1] + (wx + wy) / 2 - ay))))


def floor(canvas, name, i, j, org):
    canvas.alpha_composite(img(name), (int(org[0] + (32 * i - 32 * j) - 32), int(org[1] + (32 * i + 32 * j) / 2)))


def building(mode="cutaway"):
    W, H = 330, 250 + DH
    c = grass_field(W, H); org = (W // 2 - 10, 92 + DH)
    # floors: room A (x tiles 0-1) flagstones, room B (x tiles 2-3) planks
    for i in range(4):
        for j in range(3):
            v = (i * 3 + j * 5) % 4
            floor(c, f"floor_stone_{v}" if i < 2 else f"floor_wood_{v}", i, j, org)
    items = []   # (sort key, name, wx, wy, alpha)
    def wall(o, mat, var, i, j, front=False):
        wx, wy = 32 * i, 32 * j
        key = (wx + 16 + wy) if o == "north" else (wx + wy + 16)
        items.append((key, f"wall_{mat}_{o}_{var}", wx, wy, 0.45 if front else 1.0))
        return key, wx, wy
    # back-right (north) walls at Y=0
    for i, (mat, var) in enumerate([("stone", "plain"), ("stone", "window_open"), ("wood", "window_shut"), ("wood", "plain")]):
        k, wx, wy = wall("north", mat, var, i, 0)
        if var == "window_open":
            for s in ("left", "right"): items.append((k + 1, f"shutter_{s}_{mat}_north", wx, wy, 1.0))
    # back-left (west) wall at X=0, divider at X=64
    for j, var in enumerate(["plain", "plain", "window_shut"]): wall("west", "stone", var, 0, j)
    for j, var in enumerate(["door_open", "plain", "plain"]):
        k, wx, wy = wall("west", "stone", var, 2, j)
        if var == "door_open": items.append((k + 1, "door_open_stone_west", wx, wy, 1.0))
    # front walls (translucent, as the game draws near walls)
    for i, (mat, var) in enumerate([("stone", "plain"), ("stone", "door_open"), ("wood", "window_open"), ("wood", "plain")]):
        if mode == "cutaway": continue
        k, wx, wy = wall("north", mat, var, i, 3)
        if var == "door_open": items.append((k + 2, f"door_open_{mat}_north", wx, wy, 1.0))
        if var == "window_open":
            for s in ("left", "right"): items.append((k + 2, f"shutter_{s}_{mat}_north", wx, wy, 1.0))
    if mode != "cutaway":
        for j, var in enumerate(["plain", "window_shut", "plain"]): wall("west", "wood", var, 4, j)
    # corner / junction posts
    for (x, y, mat, fr) in ((0, 0, "stone", 0), (64, 0, "stone", 0), (128, 0, "wood", 0), (0, 96, "stone", 1),
                            (64, 96, "stone", 1), (128, 96, "wood", 1), (128, 64, "wood", 1), (128, 32, "wood", 1)):
        if fr and mode == "cutaway": continue
        items.append((x + y + 0.5, f"post_{mat}", x, y, 1.0))
    # furniture
    items += [(52, "fireplace", 0, 0, 1.0), (132, "chair_front", 32, 64, 1.0),
              (150, "table", 64, 32, 1.0), (150, "bed", 96, 0, 1.0)]
    for key, name, wx, wy, al in sorted(items, key=lambda t: t[0]):
        if name == "fireplace":
            fp = img("fireplace").copy(); bx, by = A["fireplace"]["fire_base_px"]
            fp.alpha_composite(img("fire_1"), (int(bx - 9), int(by - 15)))
            place(c, name, wx, wy, org, al, im=fp)
        else:
            place(c, name, wx, wy, org, al)
    ch = figure()
    px, py = (112, 82) if mode == "cutaway" else (36, 124)
    sx, sy = org[0] + (px - py), org[1] + (px + py) / 2
    put_figure(c, ch, sx, sy)
    return c


def doors():
    W, H = 690, 150 + DH
    c = grass_field(W, H); x = 52
    for o in ("west", "north"):
        for mat in ("stone", "wood"):
            place(c, f"wall_{mat}_{o}_door_open", 0, 0, (x, 128 + DH)); place(c, f"door_open_{mat}_{o}", 0, 0, (x, 128 + DH)); x += 82
    for o in ("west", "north"):
        for mat in ("stone", "wood"):
            place(c, f"wall_{mat}_{o}_window_open", 0, 0, (x, 128 + DH))
            for s in ("left", "right"): place(c, f"shutter_{s}_{mat}_{o}", 0, 0, (x, 128 + DH))
            x += 82
    return c


def furniture():
    names = ["well", "bed", "table", "chair_front", "chair_back", "fireplace"]
    ims = {n: img(n) for n in names}
    fp = ims["fireplace"].copy(); bx, by = A["fireplace"]["fire_base_px"]
    fp.alpha_composite(img("fire_0"), (int(bx - 9), int(by - 15))); ims["fireplace"] = fp
    ch = character()
    W = sum(i.width + 14 for i in ims.values()) + ch.width + 30; H = max(i.height for i in ims.values()) + 24
    c = grass_field(W, H); x = 14
    for n in names:
        i = ims[n]; c.alpha_composite(i, (x, H - 12 - i.height)); x += i.width + 14
    c.alpha_composite(ch, (x + 6, H - 18 - ch.height))
    # the three fire frames, small, in the corner
    for k in range(3):
        c.alpha_composite(img(f"fire_{k}"), (W - 3 * 22 + k * 22, 4))
    return c


def floors():
    tiles = [img(f"floor_wood_{v}") for v in range(4)] + [img(f"floor_stone_{v}") for v in range(4)]
    W, H = 8 * 70 + 10, 44
    c = Image.new("RGBA", (W, H), (30, 34, 28, 255))
    for k, t in enumerate(tiles): c.alpha_composite(t, (6 + k * 70, 6))
    return c


if __name__ == "__main__":
    out = {}
    # the furniture and floor previews are left out: neither changed (docs/art/13, "The furniture stays as it is")
    for name, fn in (("preview_building", building), ("preview_building_exterior", lambda: building("exterior")), ("preview_doors", doors)):
        im = fn(); im.save(f"{PRE}/{name}_1x.png"); im.resize((im.width * 3, im.height * 3), Image.NEAREST).save(f"{PRE}/{name}_3x.png")
        out[name] = im.size
    print(out)
