import json, os, sys
D = os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0, D)
from PIL import Image
from decals import grass_field
from trees_v2 import character
A = json.load(open(f"{D}/out/crops/anchors_crops.json"))
crops = ("potato", "rye", "cabbage", "garlic", "pumpkin")
W, H = 6 * 76 + 90, 5 * 64 + 30
c = grass_field(W, H)
for r, cr in enumerate(crops):
    k = 0
    for rows in ("tlbr", "trbl"):
        for st in range(3):
            soil = Image.open(f"{D}/out/farm_water/farm_soil_{(r + st) % 4}.png" if rows == "tlbr" else f"{D}/out/farm_water/farm_soil_trbl_{(r + st) % 4}.png")
            ox, oy = 20 + k * 76 + 32 + (14 if rows == "trbl" else 0), 28 + r * 64
            c.alpha_composite(soil, (ox - 32, oy))
            n = f"crop_{cr}_{st}_{rows}"; im = Image.open(f"{D}/out/crops/{n}.png"); ax, ay = A[n]["anchor_px"]
            c.alpha_composite(im, (int(ox - ax), int(oy - ay))); k += 1
ch = character(); c.alpha_composite(ch, (W - 40, H // 2 - ch.height // 2))
c.save(f"{D}/out/crops/preview_crops_1x.png"); c.resize((W * 3, H * 3), Image.NEAREST).save(f"{D}/out/crops/preview_crops_3x.png")
print(c.size)
