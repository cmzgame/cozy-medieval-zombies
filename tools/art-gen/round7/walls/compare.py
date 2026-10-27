"""Old (80 px, data/art/village as delivered) beside new (96 px, out/), every material, placed on one ground line
by their anchors, so only the height can be seen to move. Also writes a palette report: the colours each file uses."""
import json, os, sys
import numpy as np
from PIL import Image

D = os.path.dirname(os.path.abspath(__file__))
W = os.path.dirname(D)
OLD = os.path.join(W, "ref", "data", "art", "village")
NEW = os.path.join(W, "out")
PRE = os.path.join(W, "out", "previews"); os.makedirs(PRE, exist_ok=True)


def anchors(folder_json):
    A = {}
    for f in folder_json: A.update(json.load(open(f)))
    return A


A_OLD = anchors([os.path.join(W, "ref", "tools", "art-gen", "village", "anchors_walls.json"),
                 os.path.join(W, "ref", "tools", "art-gen", "woods_rugs_paintings", "woods", "anchors_woods.json")])
A_NEW = anchors([os.path.join(NEW, "anchors_walls.json"), os.path.join(NEW, "anchors_woods.json")])
MATS = ["wood", "spruce", "mahogany", "winterpine", "bloodbark", "daub", "log", "stone"]
VARS = ["plain", "door_shut", "door_open", "window_shut", "window_open"]


def parts_mat(m): return "wood" if m == "daub" else m


def stack(folder, A, m, o, v):
    """the wall with its near-side extras, composed on a canvas with the anchor at (60, 140)"""
    c = Image.new("RGBA", (100, 160), (0, 0, 0, 0))
    names = [f"wall_{m}_{o}_{v}"]
    pm = parts_mat(m)
    if v == "door_open": names.append(f"door_open_{pm}_{o}")
    if v == "window_open": names += [f"shutter_left_{pm}_{o}", f"shutter_right_{pm}_{o}"]
    for n in names:
        im = Image.open(os.path.join(folder, n + ".png")).convert("RGBA"); ax, ay = A[n]["anchor_px"]
        c.alpha_composite(im, (int(round(50 - ax)), int(round(140 - ay))))
    return c


def sheet(orient):
    cw, ch = 100, 160
    bg = Image.new("RGBA", (len(VARS) * 2 * cw + 20, len(MATS) * ch + 10), (60, 66, 58, 255))
    for r, m in enumerate(MATS):
        for k, v in enumerate(VARS):
            for side, (folder, A) in enumerate(((OLD, A_OLD), (NEW, A_NEW))):
                bg.alpha_composite(stack(folder, A, m, orient, v), (k * 2 * cw + side * (cw - 30) + 10, r * ch))
    return bg


def palette_check():
    """every new file's colours must be a subset of its old namesake's colours (same palettes, nothing new)"""
    bad = []
    for n in A_NEW:
        a = np.array(Image.open(os.path.join(NEW, n + ".png")).convert("RGBA")); b = np.array(Image.open(os.path.join(OLD, n + ".png")).convert("RGBA"))
        ca = {tuple(x) for x in a[a[..., 3] > 0][:, :3]}; cb = {tuple(x) for x in b[b[..., 3] > 0][:, :3]}
        if not ca <= cb: bad.append((n, len(ca - cb), len(ca), len(cb)))
    return bad


if __name__ == "__main__":
    for o in ("north", "west"):
        im = sheet(o); im.save(f"{PRE}/compare_old80_new96_{o}_1x.png")
        im.resize((im.width * 3, im.height * 3), Image.NEAREST).save(f"{PRE}/compare_old80_new96_{o}_3x.png")
    bad = palette_check()
    print("files with colours their 80 px namesake lacks:", len(bad))
    for b in bad: print("  ", b)
