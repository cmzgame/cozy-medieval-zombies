"""Checks the delivery in out/ by script: counts, hard alpha, sizes and anchors per material, the old set's pixels
kept below the old height, palettes, and the openings measured in the pixels. Writes out/MANIFEST."""
import json, os, glob, hashlib
import numpy as np
from PIL import Image

D = os.path.dirname(os.path.abspath(__file__)); W = os.path.dirname(D)
OUT = os.path.join(W, "out"); OLD = os.path.join(W, "ref", "data", "art", "village")
A = {**json.load(open(f"{OUT}/anchors_walls.json")), **json.load(open(f"{OUT}/anchors_woods.json"))}
A0 = {**json.load(open(os.path.join(W, "ref", "tools", "art-gen", "village", "anchors_walls.json"))),
      **json.load(open(os.path.join(W, "ref", "tools", "art-gen", "woods_rugs_paintings", "woods", "anchors_woods.json")))}
MATS = ["wood", "spruce", "mahogany", "winterpine", "bloodbark", "daub", "log", "stone"]
LEAFM = ["wood", "spruce", "mahogany", "winterpine", "bloodbark", "log", "stone"]
VARS = ["plain", "door_shut", "door_open", "window_shut", "window_open"]
fails = []
def check(ok, msg):
    if not ok: fails.append(msg)

walls = [f"wall_{m}_{o}_{v}" for m in MATS for o in ("north", "west") for v in VARS]
posts = [f"post_{m}" for m in MATS]
parts = [f"{p}_{m}_{o}" for m in LEAFM for o in ("north", "west")
         for p in ("door_open", "door_open_far", "shutter_left", "shutter_right", "shutter_far_left", "shutter_far_right")]
boards = [f"boards_{op}_{o}_{n}" for op in ("door", "window") for o in ("north", "west") for n in (1, 2, 3)]
expected = walls + posts + parts + boards
pngs = sorted(os.path.basename(p)[:-4] for p in glob.glob(f"{OUT}/*.png"))
print("counts: walls", len(walls), "posts", len(posts), "parts", len(parts), "boards", len(boards), "=", len(expected), "| PNGs in out/", len(pngs))
check(sorted(expected) == pngs, f"file set differs: missing {set(expected) - set(pngs)}, extra {set(pngs) - set(expected)}")
check(set(expected) <= set(A), f"anchors missing for {set(expected) - set(A)}")
old_names = {os.path.basename(p)[:-4] for p in glob.glob(f"{OLD}/*.png")}
check(set(expected) <= old_names, f"names not in today's data/art/village: {set(expected) - old_names}")

# hard alpha, and the PNG's size equals the anchors file's size
for n in expected:
    im = Image.open(f"{OUT}/{n}.png"); a = np.array(im.convert("RGBA"))[..., 3]
    check(set(np.unique(a)) <= {0, 255}, f"soft alpha in {n}")
    check(list(im.size) == A[n]["size"], f"size mismatch {n}")
print("hard alpha: all", len(expected), "game PNGs checked")

# sizes and anchors per material: every variant of a side alike; old + 16 in height, same width, anchor y + 16
expect = {"wood": ((47, 120), (7, 100), (39, 100)), "stone": ((49, 121), (8, 100), (40, 100)), "log": ((51, 122), (9, 101), (41, 101))}
print("\nmaterial  side   size      anchor     (80 px set: size, anchor)")
for m in MATS:
    base = m if m in ("stone", "log") else "wood"
    size, an, aw = expect[base]
    for o, anc in (("north", an), ("west", aw)):
        for v in VARS:
            n = f"wall_{m}_{o}_{v}"
            check(tuple(A[n]["size"]) == size and tuple(A[n]["anchor_px"]) == anc, f"{n} {A[n]}")
            check(A[n]["size"][0] == A0[n]["size"][0] and A[n]["size"][1] == A0[n]["size"][1] + 16
                  and A[n]["anchor_px"][0] == A0[n]["anchor_px"][0] and A[n]["anchor_px"][1] == A0[n]["anchor_px"][1] + 16, f"{n} vs 80")
        n = f"wall_{m}_{o}_plain"
        print(f"{m:10s}{o:6s} {A[n]['size']}  {A[n]['anchor_px']}   ({A0[n]['size']}, {A0[n]['anchor_px']})")
for n in posts + [p for p in parts if p.startswith("door_open")]:
    check(A[n]["size"][0] == A0[n]["size"][0] and A[n]["size"][1] == A0[n]["size"][1] + 16 and
          A[n]["anchor_px"] == [A0[n]["anchor_px"][0], A0[n]["anchor_px"][1] + 16], f"{n} not old + 16")
for n in [p for p in parts if p.startswith("shutter")]:
    check(A[n]["size"][0] == A0[n]["size"][0] and A[n]["size"][1] == A0[n]["size"][1] + 11 and
          A[n]["anchor_px"] == [A0[n]["anchor_px"][0], A0[n]["anchor_px"][1] + 13], f"{n} not old + 11 tall, anchor + 13")
for n in boards:
    check(A[n]["size"][0] == A0[n]["size"][0] and A[n]["anchor_px"][0] == A0[n]["anchor_px"][0], f"{n} width or anchor x moved")

# the old set kept below the old height: a plain wall's lower part, aligned on the anchor, is pixel for pixel the 80 set's
same = 0
for m in MATS:
    for o in ("north", "west"):
        n = f"wall_{m}_{o}_plain"
        a = np.array(Image.open(f"{OUT}/{n}.png").convert("RGBA")); b = np.array(Image.open(f"{OLD}/{n}.png").convert("RGBA"))
        ay, by = int(A[n]["anchor_px"][1]), int(A0[n]["anchor_px"][1])
        # rows from 40 px above the anchor to the bottom: only z < 64 is seen there in either picture (the cap, the wood's
        # plate beam (top 6 px) and its upper nail row (H - 8) are above)
        ra = a[ay - 40:]; rb = b[by - 40:]
        ok = ra.shape == rb.shape and (ra == rb).all(); same += ok
        check(ok, f"{n}: the lower part differs from the 80 set")
print(f"\nthe lower 40 px above the anchor, plain walls identical to the 80 set: {same} of {len(MATS) * 2}")

# palettes: no colour that its 80 px namesake lacks
newcol = []
for n in expected:
    a = np.array(Image.open(f"{OUT}/{n}.png").convert("RGBA")); b = np.array(Image.open(f"{OLD}/{n}.png").convert("RGBA"))
    ca = {tuple(x) for x in a[a[..., 3] > 0][:, :3]}; cb = {tuple(x) for x in b[b[..., 3] > 0][:, :3]}
    if not ca <= cb: newcol.append(n)
check(not newcol, f"new colours in {newcol}")
print("files with a colour their 80 px namesake lacks:", len(newcol))

# the doorway in the pixels: the see-through run in the column through the door's middle (world X 16 on the edge line).
# A line of sight crosses the wall's thickness, so the run is the opening less half the thickness at each end
# (and a pixel more under the stone's proud lintel); the 80 set beside it moves by exactly the door's 16.
# (The open window has no see-through pixels in either set: 16 px across a 14 to 18 px wall shows its own jambs.)
print("\ndoorway see-through run, z on the centre line (96 set | 80 set):")
for m in ("wood", "stone", "log"):
    n = f"wall_{m}_north_door_open"; runs = []
    for folder, AA in ((OUT, A), (OLD, A0)):
        a = np.array(Image.open(f"{folder}/{n}.png").convert("RGBA"))[..., 3]; ax, ay = AA[n]["anchor_px"]
        zs = [z for z in range(0, 100) if 0 <= int(ay + 8 - z) < a.shape[0] and a[int(ay + 8 - z), int(ax + 16)] == 0]
        z0 = min(zs); z1 = z0
        while z1 + 1 in zs: z1 += 1          # the first contiguous run (above the wall's top is transparent too)
        runs.append((z0, z1))
    check(runs[0][1] - runs[1][1] == 16 and runs[0][0] == runs[1][0], f"{n} doorway run {runs}")
    print(f"  {n:26s} {runs[0][0]}..{runs[0][1]} | {runs[1][0]}..{runs[1][1]}")

# MANIFEST
lines = []
for p in sorted(glob.glob(f"{OUT}/*")) + sorted(glob.glob(f"{OUT}/previews/*")):
    if os.path.isdir(p) or os.path.basename(p) == "MANIFEST": continue
    rel = os.path.relpath(p, OUT).replace("\\", "/")
    sz = os.path.getsize(p)
    dim = "x".join(map(str, Image.open(p).size)) if p.endswith(".png") else ""
    lines.append(f"{rel}\t{sz} bytes\t{dim}")
open(f"{OUT}/MANIFEST", "w", newline="\n").write("\n".join(lines) + "\n")
print(f"\nMANIFEST: {len(lines)} files")
print("\nFAILURES:" if fails else "\nall checks pass")
for f in fails: print("  ", f)
