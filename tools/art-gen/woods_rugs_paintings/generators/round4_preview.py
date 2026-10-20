"""Previews for the wood pass, the rugs and the paintings: six woods side by side, the rugs on floors,
the paintings hung in a wood, a stone and a log room, the bag icons at 2x."""
import sys, json, os; sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from PIL import Image, ImageDraw
from common import Board, figure, x3, REFS, D
V = f"{REFS}/data/art/village"; P = os.path.join(D, "..", "out", "paintings"); R = os.path.join(D, "..", "out", "rugs"); W = os.path.join(D, "..", "out", "woods")
PV = os.path.join(D, "..", "out", "previews4"); os.makedirs(PV, exist_ok=True)
A = json.load(open(f"{REFS}/tools/art-gen/village/anchors_walls.json")); A.update(json.load(open(f"{P}/anchors_paintings.json"))); A.update(json.load(open(f"{R}/anchors_rugs.json"))); A.update(json.load(open(f"{W}/anchors_woods.json")))
A.update(json.load(open(f"{REFS}/tools/art-gen/village/anchors_furniture.json")))
fl = [Image.open(f"{V}/floor_wood_{k}.png").convert("RGBA") for k in range(4)]
fs = [Image.open(f"{V}/floor_stone_{k}.png").convert("RGBA") for k in range(4)]

def save(im, name): im.save(f"{PV}/{name}_1x.png"); x3(im).save(f"{PV}/{name}_3x.png"); print(name, im.size)

def woods():
    b = Board(6 * 190 + 40, 240, (0, 0), A, [W, V])
    for k, wood in enumerate(["wood", "spruce", "mahogany", "winterpine", "bloodbark", "daub"]):
        b.org = (110 + k * 190, 110)
        for i in range(2):
            for j in range(2): b.place(fl[(i + j) % 4], 32 * i, 32 * j, 32, 0, key=-50)
        leafw = "wood" if wood == "daub" else wood
        for i in range(2): b.seg("north", f"wall_{wood}_north_{'plain' if i else 'window_shut'}", i, 0)
        b.seg("west", f"wall_{wood}_west_door_open", 0, 0, [f"door_open_{leafw}_west"]); b.seg("west", f"wall_{wood}_west_window_open", 0, 1, [f"shutter_left_{leafw}_west", f"shutter_right_{leafw}_west"])
        for (x, y) in ((0, 0), (64, 0), (0, 64)): b.post(f"post_{wood}", x, y)
        if k == 0: b.fig(figure("s"), 40, 40)
        b.draw()
    return b.c

def rugs():
    b = Board(520, 260, (0, 0), A, [R, V])
    for k, (name, floors) in enumerate((("rug_bearskin", fl), ("rug_regal_red", fs))):
        b.org = (150 + k * 250, 40)
        for i in range(3):
            for j in range(4): b.place(floors[(i * 3 + j) % 4], 32 * i, 32 * j, 32, 0, key=-50)
        rug = Image.open(f"{R}/{name}.png"); ax, ay = A[name]["anchor_px"]
        b.place(rug, 32, 16, ax, ay, key=-10); b.fig(figure("s"), 60, 60); b.draw()
    # the x facing: the mirror
    b.org = (150, 170)
    for i in range(4):
        for j in range(3): b.place(fl[(i * 3 + j) % 4], 32 * i, 32 * j, 32, 0, key=-50)
    rug = Image.open(f"{R}/rug_regal_red.png").transpose(Image.FLIP_LEFT_RIGHT); ax, ay = A["rug_regal_red"]["anchor_px"]
    b.place(rug, 16, 32, rug.width - 1 - ax, ay, key=-10); b.draw()
    return b.c

def rooms():
    b = Board(3 * 380 + 60, 380, (0, 0), A, [P, R, W, V])
    sets = [("wood", fl, "rug_regal_red"), ("stone", fs, "rug_bearskin"), ("log", fl, "rug_regal_red")]
    pics = [("wide_castle", "wide_lake", "wide_sunset"), ("small_oak", "small_deer", "small_peak"), ("tall_waterfall", "tall_pines", "tall_waterfall")]
    for k, (mat, floors, rug) in enumerate(sets):
        b.org = (200 + k * 380, 110)
        for i in range(4):
            for j in range(4): b.place(floors[(i * 3 + j) % 4], 32 * i, 32 * j, 32, 0, key=-50)
        rg = Image.open(f"{R}/{rug}.png"); ax, ay = A[rug]["anchor_px"]; b.place(rg, 64, 16, ax, ay, key=-10)
        for i in range(4): b.seg("north", f"wall_{mat}_north_plain", i, 0, [f"painting_{pics[0][k]}_north"] if i == 1 else ([f"painting_{pics[1][k]}_north"] if i == 3 else []))
        for j in range(4): b.seg("west", f"wall_{mat}_west_plain" if j != 3 else f"wall_{mat}_west_door_shut", 0, j, [f"painting_{pics[2][k]}_west"] if j == 1 else ([f"painting_{pics[1][(k + 1) % 3]}_west"] if j == 2 else []))
        for (x, y) in ((0, 0), (128, 0), (0, 128)): b.post(f"post_{mat}", x, y)
        tb = Image.open(f"{V}/table.png").convert("RGBA"); b.place(tb, 32, 32, *A["table"]["anchor_px"], key=32 + 32 + 40)
        b.fig(figure("s"), 100, 60); b.draw()
    return b.c

def icons():
    names = [f"painting_{k}_icon" for k in ("small_oak", "small_deer", "small_peak", "tall_waterfall", "tall_pines", "wide_castle", "wide_lake", "wide_sunset")]
    ims = [Image.open(f"{P}/{n}.png") for n in names] + [Image.open(f"{R}/{n}_icon.png") for n in ("rug_bearskin", "rug_regal_red")]
    s = 2; pad = 12; W_ = pad + sum(i.width * s + pad for i in ims); H_ = max(i.height for i in ims) * s + 2 * pad
    out = Image.new("RGBA", (W_, H_), (58, 54, 52, 255)); d = ImageDraw.Draw(out); x = pad
    for im in ims:
        for cx in range(0, im.width, 19):
            for cy in range(0, im.height, 19):
                d.rectangle((x + cx * s, pad + cy * s, x + (cx + 19) * s - 1, pad + (cy + 19) * s - 1), fill=(90, 86, 84, 255), outline=(62, 58, 56, 255))
        out.alpha_composite(im.resize((im.width * s, im.height * s), Image.NEAREST), (x, pad)); x += im.width * s + pad
    return out

if __name__ == "__main__":
    save(woods(), "woods_six"); save(rugs(), "rugs_floors"); save(rooms(), "paintings_rooms")
    ic = icons(); ic.save(f"{PV}/icons_2x.png"); print("icons", ic.size)
