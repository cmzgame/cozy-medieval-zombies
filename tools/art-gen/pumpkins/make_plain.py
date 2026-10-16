"""Two plain (uncarved) pumpkins, same style and outline as the jack-o'-lanterns."""
import json, os
import numpy as np
from PIL import Image
import pumpkin2 as pk

OUT = pk.OUT
variants = [("pumpkin_0", dict(R=10.0, HH=8.0, lean=0.35)),      # same pumpkin, uncarved
            ("pumpkin_1", dict(R=8.4, HH=7.6, lean=-0.4))]       # smaller and rounder, stem leans the other way
info = {}
for name, v in variants:
    pk.R, pk.HH = v["R"], v["HH"]
    col, alpha, holes = pk.render("left", carved=False, lean_k=v["lean"])
    rgba = np.zeros((pk.H, pk.W, 4), np.uint8); rgba[..., :3] = col; rgba[..., 3] = alpha * 255
    ys = np.where(alpha.any(1))[0]; xs = np.where(alpha.any(0))[0]
    y0, y1, x0, x1 = ys.min(), ys.max() + 1, xs.min(), xs.max() + 1
    Image.fromarray(rgba[y0:y1, x0:x1], "RGBA").save(f"{OUT}/{name}.png")
    gx, gy = pk.proj(0, 0, -pk.HH)
    info[name] = {"size": [int(x1 - x0), int(y1 - y0)], "ground_anchor_px": [round(float(gx - x0), 1), round(float(gy - y0), 1)]}
json.dump(info, open(f"{OUT}/anchors_pumpkins.json", "w"), indent=1)
print(info)
