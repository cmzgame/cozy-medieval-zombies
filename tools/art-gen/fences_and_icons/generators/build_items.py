"""Writes every item file of docs/art/11 Part B to out/items/ with items.json."""
import json, os
from PIL import Image
import items_small as S, items_held as H
from px import on_canvas, check_hard

D = os.path.dirname(os.path.abspath(__file__)); OUT = os.path.join(D, "..", "out", "items"); os.makedirs(OUT, exist_ok=True)
for f in os.listdir(OUT):
    if f.endswith(".png") or f.endswith(".json"): os.remove(os.path.join(OUT, f))
J = {}
CELL = 19
ANGLES = [(0, ""), (22.5, "_22_5"), (45, "_45"), (67.5, "_67_5"), (90, "_90")]


def save(im, name):
    assert check_hard(im), name
    im.save(f"{OUT}/{name}.png"); return im


def world(name, im, grip, tilt=None, extra=None):
    save(im, name)
    J[name] = {"size": list(im.size), "grip_px": list(grip)}
    if tilt is not None: J[name]["tilt_deg_clockwise_from_up"] = tilt
    if extra: J[name].update(extra)


def icon(name, im, cols, rows, stack=None, note=None, dy=0):
    im = on_canvas(im, CELL * cols, CELL * rows, 0, dy)
    save(im, name)
    J[name] = {"slot_cols_rows": [cols, rows], "size": list(im.size)}
    if stack: J[name]["stack_max"] = stack
    if note: J[name]["drawn_from"] = note


def portrait(name, im, note=None):
    im = on_canvas(im, 38, 38); save(im, name); J[name] = {"size": [38, 38]}
    if note: J[name]["drawn_from"] = note


# ---------------- the small things: world picture = icon drawing
simple = [("apple", S.apple, 1, 1, 5), ("bread", S.bread, 1, 1, None), ("tinderbox", S.tinderbox, 1, 1, None),
          ("bandage", S.bandage, 1, 1, 5), ("stone", S.stone, 1, 1, 20)]
for k in S.SEEDS: simple.append((k, (lambda k=k: S.seed_pouch(k)), 1, 1, 20))
simple += [("log", S.log, 2, 3, None), ("tunic", S.tunic, 2, 2, None), ("breeches", S.breeches, 2, 2, None),
           ("boots", S.boots, 1, 2, None), ("belt", S.belt, 2, 1, None), ("small_sack", S.small_sack, 2, 2, None)]
for name, fn, cols, rows, stack in simple:
    im, grip = fn()
    world(name + "_world", im, grip)
    # stacking 1 x 1 icons sit a pixel up and left, leaving the count's corner quiet
    icon(name + "_icon", im, cols, rows, stack, f"{name}_world", dy=0)

im, grip = S.waterskin(); world("waterskin_world", im, grip); icon("waterskin_icon", im, 1, 2, None, "waterskin_world")
portrait("waterskin_portrait", S.waterskin(True)[0], "the same skin drawn larger for the 38 px slot")
portrait("boots_portrait", S.boots(True)[0], "the pair side by side, larger")
portrait("belt_portrait", S.belt(True)[0], "the rope coiled, larger, the ends hanging")

# ---------------- the held things: five angles, the icon both ways, a portrait
for name, fn, cols, rows, pscale in (("plank", H.plank, 1, 3, 1.3), ("stick", H.stick, 1, 3, 1.3), ("hatchet", H.hatchet, 1, 2, 1.2), ("shovel", H.shovel, 1, 3, 0.78)):
    for th, sfx in ANGLES:
        im, pts = fn(th); world(f"{name}_world{sfx}", im, pts["grip"], th)
    im0, _ = fn(0)
    icon(f"{name}_icon", im0, cols, rows, None, f"{name}_world, pixel for pixel (the convention)")
    big, _ = fn(0, (CELL * rows - 2) / im0.height)
    if big.width > CELL * cols - 2:
        big, _ = fn(0, (CELL * cols - 2) / im0.width)
    icon(f"{name}_icon_large", big, cols, rows, None, f"{name}_world, the same design rendered to fill its {cols} x {rows} footprint (Question 3's alternative)")
    portrait(f"{name}_portrait", fn(0, pscale)[0], f"{name}_world rendered at {pscale}x")

# the torch: unlit world pictures with flame_px, the lit icon and portrait carrying a drawn flame
flame = H.flame_small()
for th, sfx in ANGLES:
    im, pts = H.torch(th); world(f"torch_world{sfx}", im, pts["grip"], th, {"flame_px": list(pts["flame"])})
tw, tpts = H.torch(0)
def with_flame(torch_im, flame_px, fl, canvas=(19, 38), torch_at=None):
    """the torch on its canvas exactly where the unlit icon puts it, the flame standing on flame_px
    (the flame's bottom-centre pixel over the head's top pixel)"""
    out = Image.new("RGBA", canvas, (0, 0, 0, 0))
    tx, ty = torch_at
    out.alpha_composite(torch_im, (tx, ty))
    out.alpha_composite(fl, (tx + flame_px[0] - fl.width // 2, ty + flame_px[1] - fl.height + 1))
    return out
icon("torch_icon", tw, 1, 2, None, "torch_world, unlit", dy=6)
torch_at = ((19 - tw.width) // 2, (38 - tw.height) // 2 + 6)
lit = with_flame(tw, tpts["flame"], flame, (19, 38), torch_at)
save(lit, "torch_lit_icon"); J["torch_lit_icon"] = {"slot_cols_rows": [1, 2], "size": [19, 38], "drawn_from": "torch_world with the flame drawn on, for the bag and the slots only; the torch sits on the same pixels as in torch_icon, the flame rises above it"}
pw, ppts = H.torch(0, 1.3)
portrait("torch_portrait", on_canvas(pw, 38, 38, 0, 4), "torch_world at 1.3x, unlit")
p_at = ((38 - pw.width) // 2, (38 - pw.height) // 2 + 4)
save(with_flame(pw, ppts["flame"], flame, (38, 38), p_at), "torch_lit_portrait"); J["torch_lit_portrait"] = {"size": [38, 38], "drawn_from": "torch_portrait with the flame drawn on, the torch on the same pixels"}
for k in range(3):
    fr = H.flame_frame(k); save(fr, f"flame_torch_{k}")
    J[f"flame_torch_{k}"] = {"size": [28, 32], "base_px": [14, 28], "note": "unlit flicker frame; loop 0-1-2"}

json.dump(J, open(f"{OUT}/items.json", "w"), indent=1)
print(len([f for f in os.listdir(OUT) if f.endswith(".png")]), "files")
