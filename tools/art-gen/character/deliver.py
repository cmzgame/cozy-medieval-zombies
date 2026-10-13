"""Build the delivery: the body on the template layout at 1x and 4x, per-part layers, the part map,
the dye-region map, the JSON, and the previews (old vs new, the skin ramps, the dead)."""
import json, os, numpy as np
from PIL import Image
import body
ORDER = ["s", "sw", "w", "nw", "n", "ne", "e", "se"]; FW, FH = 48, 72
F = body.facings(); OUT = "out/delivery"; os.makedirs(OUT + "/parts", exist_ok=True)
tmpl = json.load(open("out/character_template.json"))
def cell(i): return (i % 4) * FW, (i // 4) * FH
def up(im, s): return im.resize((im.width * s, im.height * s), Image.NEAREST)

PART_TINT = {"torso": "#6a9aff", "legL": "#6adf80", "legR": "#3ab050", "armL": "#ffb060", "armR": "#d07030", "head": "#d080ff"}
REGION = {0: "#1a1420", 1: "#f0c8a0", 2: "#f5f5f0", 3: "#3c6ea0"}   # outline, skin, eye white, pupil

sheet = Image.new("RGBA", (FW * 4, FH * 2)); partmap = Image.new("RGBA", (FW * 4, FH * 2)); regmap = Image.new("RGBA", (FW * 4, FH * 2))
layers = {p: Image.new("RGBA", (FW * 4, FH * 2)) for p in PART_TINT}
meta = {"note": "The drawn body (docs/25, deliverable 1), round 4, 2026-10-12 (rounds 1 to 3 reviewed by Michael the same day). Same layout as character_template_4x.png: "
                "48 x 72 frames, four across and two down, facings in `order`. Every pixel is one of five canonical tones; "
                "the game dyes by swapping them (see README_body.md).",
        "frame": [FW, FH], "feetAnchor": [24, 66], "layout": tmpl["layout"], "scale_of_4x_files": 4,
        "tones": {"outline": "#1a1420", "skin_base": "#f0c8a0", "skin_shadow": "#caa886", "eye_white": "#f5f5f0", "pupil": "#3c6ea0"},
        "symmetric": True, "mirrors": {"e": "w", "se": "sw", "ne": "nw"},
        "parts": tmpl["parts"], "facings": {}}
for i, f in enumerate(ORDER):
    fac = F[f]; rgb, a, tag, pid, lay = body.render(fac); cx, cy = cell(i)
    sheet.paste(body.image(rgb, a), (cx, cy))
    pm = np.zeros((FH, FW, 4), np.uint8); rm = np.zeros((FH, FW, 4), np.uint8)
    for k, name in enumerate(fac["order"], 1):
        c = body.hx(PART_TINT[name]); pm[pid == k] = (*c, 255)
    for t, c in REGION.items():
        m = a & (tag == t); rm[m] = (*body.hx(c), 255)
    partmap.paste(Image.fromarray(pm, "RGBA"), (cx, cy)); regmap.paste(Image.fromarray(rm, "RGBA"), (cx, cy))
    # per-part complete layers (hidden pixels included), each with its own outline
    for name in PART_TINT:
        m, ring, col, tg = body.layer(*fac[name], name=name)
        im = np.zeros((FH, FW, 4), np.uint8); im[m, :3] = col[m]; im[ring, :3] = body.OUTLINE; im[m | ring, 3] = 255
        layers[name].paste(Image.fromarray(im, "RGBA"), (cx, cy))
    ox = {}
    for name in PART_TINT:
        x0, y0, rows = fac[name]; w = max(len(r) for r in rows)
        anc = tmpl["facings"][f][name]["pixel"]
        ox[name] = {"anchor_px": anc, "grid_origin_px": [x0, y0], "grid_size": [w, len(rows)], "origin_minus_anchor": [x0 - anc[0], y0 - anc[1]]}
    meta["facings"][f] = {"draw_order": fac["order"], "parts": ox, "joints": tmpl["facings"][f]["joints"],
                          "face": {"s": "two eyes", "sw": "two eyes, shifted 1 px left", "se": "two eyes, shifted 1 px right",
                                   "w": "one eye, front", "e": "one eye, front"}.get(f, "none")}
sheet.save(f"{OUT}/character_body_1x.png"); up(sheet, 4).save(f"{OUT}/character_body_4x.png")
partmap.save(f"{OUT}/character_body_partmap_1x.png"); regmap.save(f"{OUT}/character_body_regions_1x.png")
for name, im in layers.items(): im.save(f"{OUT}/parts/body_{name}_1x.png")
json.dump(meta, open(f"{OUT}/character_body.json", "w"), indent=1)
# hard-alpha check
for p in [sheet, partmap, regmap, *layers.values()]: assert set(np.unique(np.array(p)[..., 3])) <= {0, 255}

# ---- previews
old = Image.open("out/body_1x.png")
cmp = Image.new("RGBA", (FW * 8 + 16, FH * 2 + 8), (143, 160, 122, 255))
for i, f in enumerate(ORDER):
    cx, cy = cell(i); o = old.crop((cx, cy, cx + FW, cy + FH)); n = sheet.crop((cx, cy, cx + FW, cy + FH))
    cmp.paste(o, (cx * 2, cy + 4), o); cmp.paste(n, (cx * 2 + FW, cy + 4), n)
up(cmp, 4).save(f"{OUT}/preview_old_vs_new_4x.png")

# the skin ramp proposal (base; shadow = base * 0.84 as the engine does) and the dead
LIVING = ["#f8dcc0", "#f0c8a0", "#e8b88c", "#d9a070", "#c4875a", "#a86a48", "#8c5a40", "#6b4432"]
DEAD = ["#8f9c72", "#908c8a", "#7f879c"]
def shade(c): return tuple(int(v * 0.84) for v in body.hx(c))
def dye(im, skin, eyes="#3c6ea0", white="#f5f5f0"):
    a = np.array(im).copy(); rgb = a[..., :3]
    swap = {body.PAL["o"]: body.hx(skin), body.PAL["-"]: shade(skin), body.PAL["@"]: body.hx(eyes), body.PAL["w"]: body.hx(white)}
    out = rgb.copy()
    for src, dst in swap.items():
        m = np.all(rgb == np.array(src, np.uint8), -1); out[m] = dst
    a[..., :3] = out; return Image.fromarray(a, "RGBA")
cols = LIVING + DEAD
pv = Image.new("RGBA", (len(cols) * (FW + 2) + 8, 3 * FH + 8), (143, 160, 122, 255))
for j, c in enumerate(cols):
    dead = c in DEAD
    for r, f in enumerate(["s", "sw", "w"]):
        i = ORDER.index(f); cx, cy = cell(i); fr = sheet.crop((cx, cy, cx + FW, cy + FH))
        fr = dye(fr, c, eyes="#963030" if dead else ["#3c6ea0", "#2e2a30", "#5a8a40", "#7a5a3a"][j % 4], white="#c8c8aa" if dead else "#f5f5f0")
        pv.paste(fr, (4 + j * (FW + 2), 4 + r * FH), fr)
up(pv, 3).save(f"{OUT}/preview_skins_3x.png")
meta["skin_ramp"] = {"status": "approved by Michael, 2026-10-12 (the outline reads on the darkest tones)", "living_base": LIVING, "dead_base": DEAD, "shadow_rule": "base * 0.84 per channel (the engine's tone())",
                              "dead_eyes": {"pupil": "#963030", "white": "#c8c8aa"}}
json.dump(meta, open(f"{OUT}/character_body.json", "w"), indent=1)
print("ok", os.listdir(OUT))
