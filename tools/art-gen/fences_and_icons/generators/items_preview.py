"""The item previews of docs/art/11: the starting bag at 2x, every icon in its footprint at 2x,
the portraits in 38 px slots, and the figure holding the plank, the stick and the lit torch."""
import json, os, sys
import numpy as np
from PIL import Image, ImageDraw, ImageFont
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from common import figure, grass_field, x3, D

IT = os.path.join(D, "..", "out", "items"); PV = os.path.join(D, "..", "out", "previews"); os.makedirs(PV, exist_ok=True)
J = json.load(open(f"{IT}/items.json"))
CELL = 19
BG = (58, 54, 52, 255); CUT = (90, 86, 84, 255); CUT_DK = (62, 58, 56, 255); CUT_LT = (118, 112, 108, 255)
try: FONT = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", 11)
except Exception: FONT = ImageFont.load_default()


def img(n): return Image.open(f"{IT}/{n}.png").convert("RGBA")


def cutout(d, x, y, w, h, s):
    """the bag's grey stone cell background, as the game draws it: a dark inset top-left, a light one bottom-right"""
    d.rectangle((x, y, x + w * s - 1, y + h * s - 1), fill=CUT)
    d.rectangle((x, y, x + w * s - 1, y + 2 * s - 1), fill=CUT_DK); d.rectangle((x, y, x + 2 * s - 1, y + h * s - 1), fill=CUT_DK)
    d.rectangle((x, y + h * s - 2 * s, x + w * s - 1, y + h * s - 1), fill=CUT_LT); d.rectangle((x + w * s - 2 * s, y, x + w * s - 1, y + h * s - 1), fill=CUT_LT)


def up(im, s): return im.resize((im.width * s, im.height * s), Image.NEAREST)


def grid_bg(d, x, y, cols, rows, s, cell=CELL):
    for i in range(cols):
        for j in range(rows):
            cutout(d, x + i * cell * s, y + j * cell * s, cell, cell, s)


def bag_2x():
    """the burlap sack's 6 x 4 grid at 2x holding the starting kit, the torch in the main hand's slot beside it,
    and the plank both ways (Question 3) in a second row"""
    s = 2; cols, rows = 6, 4
    W = 20 + cols * CELL * s + 40 + 2 * 38 + 20 + 240; H = 20 + rows * CELL * s + 20 + 3 * CELL * s + 40
    out = Image.new("RGBA", (W, H), BG); d = ImageDraw.Draw(out)
    gx, gy = 20, 20
    grid_bg(d, gx, gy, cols, rows, s)
    def put(name, ci, ri, count=None, wear=None):
        im = up(img(name), s); out.alpha_composite(im, (gx + ci * CELL * s, gy + ri * CELL * s))
        if count:
            w, h = J[name]["slot_cols_rows"]
            tx = gx + (ci + w) * CELL * s - 2 * s; ty = gy + (ri + h) * CELL * s - 2 * s
            d.text((tx, ty), str(count), fill=(255, 255, 255, 255), font=FONT, anchor="rb")
        if wear is not None:
            w, h = J[name]["slot_cols_rows"]
            bx0 = gx + ci * CELL * s + 2 * s; bx1 = gx + (ci + w) * CELL * s - 2 * s; by = gy + (ri + h) * CELL * s - 2 * s
            d.rectangle((bx0, by - 2 * s, bx1, by - 1), fill=(40, 36, 34, 255))
            d.rectangle((bx0, by - 2 * s, bx0 + int((bx1 - bx0) * wear), by - 1), fill=(120, 170, 80, 255))
    put("waterskin_icon", 0, 0); put("bread_icon", 1, 0); put("apple_icon", 2, 0, count=2); put("tinderbox_icon", 3, 0)
    put("plank_icon", 5, 0, wear=0.85)
    put("stone_icon", 1, 1, count=7); put("bandage_icon", 2, 1, count=3); put("log_icon", 3, 1)
    put("potato_seed_icon", 1, 2, count=12); put("rye_seed_icon", 2, 2, count=4)
    put("torch_lit_icon", 0, 2)
    # the waterskin's fill level sits behind the icon: redraw the cell with a blue band, then the icon
    def skin_at(ci, ri, level):
        x, y = gx + ci * CELL * s, gy + ri * CELL * s
        cutout(d, x, y, CELL, CELL * 2, s)
        hgt = int((CELL * 2 - 4) * s * level)
        if hgt > 0: d.rectangle((x + 2 * s, y + CELL * 2 * s - 2 * s - hgt, x + CELL * s - 2 * s - 1, y + CELL * 2 * s - 2 * s - 1), fill=(60, 110, 150, 255))
        out.alpha_composite(up(img("waterskin_icon"), s), (x, y))
    skin_at(0, 0, 1.0)
    # the hand slot: the torch's lit portrait, unlit beside it
    hx, hy = gx + cols * CELL * s + 40, gy
    for k, n in enumerate(("torch_lit_portrait", "torch_portrait")):
        cutout(d, hx, hy + k * 46, 19, 19, 2); out.alpha_composite(img(n), (hx, hy + k * 46))
    d.text((hx, hy + 92 + 4), "hand slot", fill=(220, 215, 205, 255), font=FONT)
    # row 2: the plank both ways, the stick both ways, the waterskin's level at full / half / empty
    y2 = gy + rows * CELL * s + 20
    d.text((gx, y2 - 14), "1x3 icons: the convention (left) and the larger rendering (right); the waterskin's level at full, half, empty", fill=(220, 215, 205, 255), font=FONT)
    x = gx
    for n in ("plank_icon", "plank_icon_large", "stick_icon", "stick_icon_large", "shovel_icon", "shovel_icon_large"):
        cutout(d, x, y2, CELL, CELL * 3, s); out.alpha_composite(up(img(n), s), (x, y2)); x += CELL * s + 6
    for lvl in (1.0, 0.5, 0.0):
        cutout(d, x, y2, CELL, CELL * 2, s)
        hgt = int((CELL * 2 - 4) * s * lvl)
        if hgt > 0: d.rectangle((x + 2 * s, y2 + CELL * 2 * s - 2 * s - hgt, x + CELL * s - 2 * s - 1, y2 + CELL * 2 * s - 2 * s - 1), fill=(60, 110, 150, 255))
        out.alpha_composite(up(img("waterskin_icon"), s), (x, y2)); x += CELL * s + 6
    return out


def icons_2x():
    names = [k for k in J if k.endswith("_icon") or k.endswith("_icon_large")]
    s = 2; pad = 22
    sizes = [tuple(J[n]["size"]) for n in names]
    W = pad + sum(w * s + pad for w, h in sizes) + pad
    H = 20 + max(h for w, h in sizes) * s + 44
    out = Image.new("RGBA", (W, H), BG); d = ImageDraw.Draw(out)
    x = pad
    for n, (w, h) in zip(names, sizes):
        y = 20
        cols, rows = J[n]["slot_cols_rows"]
        grid_bg(d, x, y, cols, rows, s)
        out.alpha_composite(up(img(n), s), (x, y))
        if J[n].get("stack_max"):
            d.rectangle((x + w * s - 8 * s, y + h * s - 7 * s, x + w * s - 1, y + h * s - 1), outline=(200, 80, 80, 255))
        if n.split("_icon")[0] in ("torch", "plank", "stick", "hatchet", "shovel"):
            d.rectangle((x + 2 * s, y + h * s - 4 * s, x + w * s - 2 * s - 1, y + h * s - 3 * s), outline=(120, 170, 80, 255))
        lab = n.replace("_icon", "").replace("_seed", "\nseed").replace("_large", " L").replace("small_", "small\n")
        d.multiline_text((x, y + h * s + 4), lab, fill=(220, 215, 205, 255), font=FONT, spacing=0)
        x += w * s + pad
    return out


def portraits():
    names = [k for k in J if k.endswith("_portrait")]
    out = Image.new("RGBA", (12 + len(names) * (38 * 2 + 12), 20 + 38 + 20 + 76 + 30), BG); d = ImageDraw.Draw(out)
    x = 12
    for n in names:
        cutout(d, x, 20, 19, 19, 2); out.alpha_composite(img(n), (x, 20))
        cutout(d, x, 20 + 38 + 20, 19, 19, 4); out.alpha_composite(up(img(n), 2), (x, 20 + 38 + 20))
        d.text((x, 20 + 38 + 20 + 76 + 4), n.replace("_portrait", ""), fill=(220, 215, 205, 255), font=FONT)
        x += 38 * 2 + 12
    return out


def flip_for(angle, fn):
    """the drawn tilt and the flips that make the angle, as the loader does (docs/art/07)"""
    a = angle % 360
    if a <= 90: im, pts = fn(a); fx, fy = False, False
    elif a <= 180: im, pts = fn(180 - a); fx, fy = False, True
    elif a <= 270: im, pts = fn(a - 180); fx, fy = True, True
    else: im, pts = fn(360 - a); fx, fy = True, False
    w, h = im.size
    out = im
    if fx: out = out.transpose(Image.FLIP_LEFT_RIGHT)
    if fy: out = out.transpose(Image.FLIP_TOP_BOTTOM)
    p2 = {k: ((w - 1 - x) if fx else x, (h - 1 - y) if fy else y) for k, (x, y) in pts.items()}
    return out, p2


def holding():
    """the figure holding the plank, the stick and the lit torch at several of the sixteen angles, facing s and n"""
    import items_held as H
    fl = img("flame_torch_0")
    items = [("plank", H.plank), ("stick", H.stick), ("torch", H.torch)]
    angles = [0, 45, 90, 135, 180, 225, 270, 315]
    cw, ch = 72, 90
    out = grass_field(20 + len(angles) * cw, 20 + len(items) * 2 * ch)
    for r, (name, fn) in enumerate(items):
        for fr, f in enumerate(("s", "n")):
            for k, ang in enumerate(angles):
                fig = figure(f)
                cx, cy = 20 + k * cw + 24, 20 + (r * 2 + fr) * ch + 10
                # the hand: about 14 px above the feet, 9-10 px out from the body (the near arm's side)
                hand = (24 + (10 if f == "s" else -10), 66 - 14)
                im, pts = flip_for(ang, fn)
                gx, gy = pts["grip"]
                cell = Image.new("RGBA", (48, 72), (0, 0, 0, 0))
                if f == "n":   # facing away: the item is behind the body
                    cell.alpha_composite(im, (hand[0] - gx, hand[1] - gy)); cell.alpha_composite(fig)
                else:
                    cell.alpha_composite(fig); cell.alpha_composite(im, (hand[0] - gx, hand[1] - gy))
                if name == "torch":
                    fx, fy = pts["flame"]
                    cell.alpha_composite(fl, (hand[0] - gx + fx - 14, hand[1] - gy + fy - 28))
                out.alpha_composite(cell, (cx - 24, cy))
    return out


if __name__ == "__main__":
    for name, fn in (("items_bag_2x", bag_2x), ("items_icons_2x", icons_2x), ("items_portraits", portraits)):
        im = fn(); im.save(f"{PV}/{name}.png"); print(name, im.size)
    im = holding(); im.save(f"{PV}/items_holding_1x.png"); x3(im).save(f"{PV}/items_holding_3x.png"); print("holding", im.size)
