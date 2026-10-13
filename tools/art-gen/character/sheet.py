import json, numpy as np
from PIL import Image
import body
ORDER = ["s", "sw", "w", "nw", "n", "ne", "e", "se"]
FW, FH = 48, 72
F = body.facings()
def cell(i): return (i % 4) * FW, (i // 4) * FH
sheet = Image.new("RGBA", (FW * 4, FH * 2), (0, 0, 0, 0))
tagsheet = np.zeros((FH * 2, FW * 4), np.uint8); partsheet = np.zeros((FH * 2, FW * 4), np.uint8)
for i, f in enumerate(ORDER):
    rgb, a, tag, pid, _ = body.render(F[f]); cx, cy = cell(i)
    sheet.paste(body.image(rgb, a), (cx, cy))
    tagsheet[cy:cy + FH, cx:cx + FW] = tag; partsheet[cy:cy + FH, cx:cx + FW] = pid
sheet.save("out/body_new_1x.png")
sheet.resize((sheet.width * 4, sheet.height * 4), Image.NEAREST).save("out/character_body_4x.png")
# old vs new, all eight, at 4x
old = Image.open("out/body_1x.png")
cmp = Image.new("RGBA", (FW * 8 + 16, FH * 2 + 8), (143, 160, 122, 255))
for i, f in enumerate(ORDER):
    cx, cy = cell(i)
    cmp.paste(old.crop((cx, cy, cx + FW, cy + FH)), (cx * 2, cy + 4), old.crop((cx, cy, cx + FW, cy + FH)))
    cmp.paste(sheet.crop((cx, cy, cx + FW, cy + FH)), (cx * 2 + FW, cy + 4), sheet.crop((cx, cy, cx + FW, cy + FH)))
cmp.resize((cmp.width * 4, cmp.height * 4), Image.NEAREST).save("out/cmp_all_4x.png")
np.save("out/tags.npy", tagsheet); np.save("out/parts.npy", partsheet)
print("ok")
