"""Eight wall paintings (Michael, 2026-10-20), each drawn flat (sky bands, hills, a few shapes, the style
bible's muted tones) then hung on a wall face with iso3d: a thin box on the face, its front the picture,
its rim the frame, so the skew, the frame's lit top and shaded side, and the anchor are the wall's own.
Sizes on the face: small 26 x 28 (one section, the top slot), tall 26 x 56 (one section, both slots),
landscape 55 x 28 (two sections, the top slot). Hung proud of the stone face (b = 8.5) so one set
serves wood, stone and log, as the boards do."""
import json, os, sys
import numpy as np
from PIL import Image
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from iso3d import Scene, hx, hsh, flat, pick

D = os.path.dirname(os.path.abspath(__file__)); OUT = os.path.join(D, "..", "out", "paintings"); os.makedirs(OUT, exist_ok=True)
B_FACE = 8.5
FRAME = {"wood": {"top": "#6e4b32", "front": "#4a3322", "front_in": "#3e2a1c", "side": "#2c1d12"},
         "gilt": {"top": "#e2c06a", "front": "#c39a44", "front_in": "#8a6a2a", "side": "#6e5420"}}


def h(s): s = s.lstrip("#"); return np.array([int(s[i:i + 2], 16) for i in (0, 2, 4)], np.uint8)


class Pic:
    def __init__(self, w, hh):
        self.w, self.h = w, hh; self.c = np.zeros((hh, w, 3), np.uint8)
        yy, xx = np.mgrid[0:hh, 0:w]; self.x, self.y = xx + 0.5, yy + 0.5
    def fill(self, m, col): self.c[m] = h(col)
    def band(self, y0, y1, col): self.fill((self.y >= y0) & (self.y < y1), col)
    def hill(self, cx, cy, rx, ry, col, above=True):
        m = ((self.x - cx) / rx) ** 2 + ((self.y - cy) / ry) ** 2 <= 1
        if above: m &= self.y <= cy
        self.fill(m, col); return m
    def blob(self, cx, cy, rx, ry, col):
        m = ((self.x - cx) / rx) ** 2 + ((self.y - cy) / ry) ** 2 <= 1; self.fill(m, col); return m
    def rect(self, x0, y0, x1, y1, col):
        m = (self.x >= x0) & (self.x < x1) & (self.y >= y0) & (self.y < y1); self.fill(m, col); return m
    def tri(self, ax, ay, bx, by, cx, cy, col):
        def side(px, py, qx, qy): return (self.x - px) * (qy - py) - (self.y - py) * (qx - px)
        d1, d2, d3 = side(ax, ay, bx, by), side(bx, by, cx, cy), side(cx, cy, ax, ay)
        m = ~(((d1 < 0) | (d2 < 0) | (d3 < 0)) & ((d1 > 0) | (d2 > 0) | (d3 > 0))); self.fill(m, col); return m
    def speck(self, m, col, every, seed):
        xi, yi = np.floor(self.x).astype(int), np.floor(self.y).astype(int)
        self.fill(m & (hsh(xi, yi, seed) % every == 0), col)
    def px(self, x, y, col):
        if 0 <= x < self.w and 0 <= y < self.h: self.c[y, x] = h(col)


def tree(p, x, base, scale=1.0, canopy=("#6e3a1c", "#9a5a26", "#c08030"), trunk="#3e2a1c"):
    p.rect(x - 0.6 * scale, base - 4 * scale, x + 0.6 * scale + 1, base, trunk)
    p.blob(x, base - 6 * scale, 4 * scale, 3.5 * scale, canopy[0])
    p.blob(x - 1, base - 7 * scale, 2.8 * scale, 2.6 * scale, canopy[1])
    p.blob(x - 1.5, base - 8 * scale, 1.4 * scale, 1.2 * scale, canopy[2])


def pine(p, x, base, hh, dark="#2e3a28", lit="#3b4a34"):
    p.tri(x, base - hh, x - hh * 0.3, base, x + hh * 0.3, base, dark)
    p.tri(x, base - hh, x - hh * 0.3, base, x, base, lit)


# ------------------------------------------------------------------ the eight pictures
def lone_oak():
    p = Pic(22, 24)
    p.band(0, 24, "#6e6a78"); p.band(0, 7, "#5a5e6e"); p.band(7, 11, "#7a7280"); p.band(11, 15, "#8a7a80")
    p.blob(16, 5, 2.2, 2.2, "#c6c0b0")                                       # a pale moon
    p.hill(10, 24, 16, 10, "#405434"); p.hill(10, 24, 13, 8, "#4b5f3d")
    p.speck((p.y > 16), "#586e44", 7, 1)
    tree(p, 10, 17, 1.3)
    return p, "wood"


def deer_clearing():
    p = Pic(22, 24)
    p.band(0, 24, "#2e3a28")
    for k, x in enumerate((2, 6, 10, 14, 18, 22)): pine(p, x, 14 + (k % 2) * 2, 12 + (k % 3) * 2)
    p.band(14, 24, "#586e44"); p.speck((p.y > 14), "#687e4c", 5, 2); p.speck((p.y > 14), "#4b5f3d", 6, 3)
    p.band(13, 15, "#4b5f3d")
    # the deer: a body, a neck and head, four legs, antlers, a pale rump
    p.blob(11, 17, 4, 2.2, "#8a6a48"); p.rect(14, 13, 16, 18, "#8a6a48"); p.rect(14, 12, 18, 14, "#8a6a48")
    for lx in (8, 10, 12, 14): p.rect(lx, 18, lx + 1, 22, "#6c4b30")
    p.px(17, 13, "#2b2522"); p.rect(7, 16, 9, 18, "#c4bba4")
    for (ax, ay) in ((15, 11), (15, 10), (16, 9), (14, 10), (17, 11)): p.px(ax, ay, "#5a3c22")
    return p, "wood"


def mountain_dusk():
    p = Pic(22, 24)
    p.band(0, 24, "#3a3448"); p.band(8, 14, "#6e4a5a"); p.band(14, 18, "#a06a5a"); p.band(18, 24, "#c08060")
    p.tri(12, 3, -2, 22, 26, 22, "#6c645c"); p.tri(12, 3, 7, 11, 17, 11, "#cfc6b6")
    p.tri(12, 3, 12, 11, 17, 11, "#b0a697"); p.tri(12, 3, 2, 22, 12, 22, "#7a736a")
    p.hill(4, 24, 10, 7, "#2e2a30"); p.hill(19, 24, 9, 5, "#2e2a30")
    p.speck((p.y > 19), "#3a3440", 5, 4)
    return p, "wood"


def waterfall():
    p = Pic(22, 52)
    p.band(0, 52, "#5e5650"); p.band(0, 8, "#6e6a78"); p.band(8, 11, "#7a7280")
    cliff = p.rect(0, 10, 22, 44, "#5e5650"); p.speck(cliff, "#45403a", 4, 5); p.speck(cliff, "#6c645c", 6, 6)
    p.rect(0, 10, 22, 12, "#6c645c")
    # the water column, a lit edge, the plunge pool and the mist
    p.rect(8, 11, 14, 44, "#8fb0c0"); p.rect(8, 11, 10, 44, "#c9dce4"); p.speck(p.rect(10, 11, 14, 44, "#8fb0c0"), "#c9dce4", 3, 7)
    p.band(44, 52, "#304957"); p.band(44, 46, "#4a6b7c"); p.speck((p.y > 46), "#4a6b7c", 4, 8)
    p.blob(11, 44, 7, 3, "#9ab4c0"); p.speck(p.blob(11, 44, 9, 4, "#9ab4c0"), "#c9dce4", 2, 9)
    pine(p, 3, 16, 9); pine(p, 19, 18, 8)
    p.speck(cliff & (p.x < 6), "#3b4a34", 5, 10)
    return p, "wood"


def pine_mist():
    p = Pic(22, 52)
    p.band(0, 52, "#8a8f98"); p.band(0, 10, "#6e7280")
    for row, (base, hh, dark, lit) in enumerate(((20, 14, "#4a5560", "#58636c"), (32, 18, "#3b4a34", "#46553e"), (46, 22, "#2e3a28", "#3b4a34"))):
        for k, x in enumerate(range(1 + row * 2, 24, 5)): pine(p, x, base + (k % 2) * 2, hh - (k % 2) * 3, dark, lit)
        p.band(base + 1, base + 4, "#8a8f98" if row < 2 else "#3b4a34")
        p.speck((p.y > base + 1) & (p.y < base + 4), "#9aa0a8", 2, 11 + row)
    p.band(49, 52, "#2e3a28"); p.speck(p.y > 49, "#3b4a34", 3, 14)
    for x in (4, 9, 15, 20): p.rect(x, 46, x + 1, 50, "#2a2321")
    return p, "wood"


def castle_hill():
    p = Pic(51, 24)
    p.band(0, 24, "#6e6a78"); p.band(0, 6, "#5a5e6e"); p.band(6, 10, "#7a7280")
    p.hill(25, 26, 25, 14, "#405434"); p.hill(25, 26, 19, 11, "#4b5f3d")
    # the castle: a curtain wall, two towers, a keep, slit windows
    p.rect(19, 10, 36, 16, "#7b7670"); p.rect(17, 7, 21, 16, "#857f78"); p.rect(34, 7, 38, 16, "#857f78"); p.rect(25, 5, 30, 16, "#8e857a")
    for x in (17, 19, 34, 36, 25, 27, 29): p.px(x, 6 if x in (17, 19, 34, 36) else 4, "#a19b92")
    p.rect(19, 11, 36, 12, "#5a554f")
    for (x, y) in ((18, 10), (35, 10), (27, 8), (23, 13), (31, 13)): p.px(x, y, "#2b2522")
    p.px(27, 2, "#7e1f1c"); p.px(27, 3, "#7e1f1c"); p.rect(27, 2, 28, 5, "#3e2a1c")
    # the village below: little roofs along the foot of the hill
    for k, x in enumerate((2, 8, 13, 40, 45)):
        y = 18 + (k % 2)
        p.rect(x, y, x + 4, y + 3, "#8a7a60"); p.tri(x - 0.5, y, x + 4.5, y, x + 2, y - 2.5, "#6e4b32")
    p.speck((p.y > 16), "#586e44", 6, 15)
    tree(p, 37, 19, 0.8); tree(p, 6, 23, 0.8)
    return p, "gilt"


def mountains_lake():
    p = Pic(51, 24)
    p.band(0, 24, "#7a7a88"); p.band(0, 5, "#5a5e6e")
    for (cx, hh, col) in ((10, 4, "#5a6270"), (26, 2, "#5a6270"), (42, 5, "#5a6270"), (18, 7, "#6a7280"), (34, 6, "#6a7280")):
        p.tri(cx, hh, cx - 14, 15, cx + 14, 15, col); p.tri(cx, hh, cx - 3, hh + 3, cx + 3, hh + 3, "#cfc6b6")
    p.band(14, 16, "#3b4a34");
    for x in range(1, 54, 3): pine(p, x, 16, 4 + (x % 2) * 2)
    p.band(16, 24, "#304957"); p.band(16, 17, "#4a6b7c")
    p.speck((p.y > 17) & (p.y < 23), "#2c4451", 3, 16); p.speck((p.y > 18) & (p.y < 21), "#4a6b7c", 7, 17)
    for (cx, hh) in ((18, 7), (34, 6)): p.tri(cx, 22 - (hh - 7) * 0.4, cx - 6, 17, cx + 6, 17, "#3c4e5c")   # reflections
    return p, "wood"


def river_sunset():
    p = Pic(51, 24)
    p.band(0, 24, "#c2601f"); p.band(0, 4, "#6e3a3c"); p.band(4, 8, "#9c4a30"); p.band(8, 12, "#d77e33"); p.band(12, 15, "#e8a052")
    p.blob(30, 13, 3.5, 3.5, "#f2c070"); p.blob(30, 13, 2, 2, "#f8dc7a")
    p.hill(10, 18, 18, 7, "#4a3a3c"); p.hill(44, 18, 18, 6, "#4a3a3c"); p.band(16, 24, "#3a2e30")
    p.hill(14, 24, 20, 6, "#4b4034"); p.hill(42, 24, 18, 5, "#4b4034")
    # the river: a winding band catching the sun
    for y in range(16, 24):
        cx = 30 + (y - 16) * 1.6 - ((y - 16) ** 2) * 0.25; w = 2 + (y - 16) * 0.8
        p.rect(cx - w, y, cx + w, y + 1, "#4a6b7c"); p.rect(cx - w * 0.4, y, cx + w * 0.3, y + 1, "#e8a052" if y < 20 else "#8a7a60")
    for x in (5, 22, 48): tree(p, x, 22, 0.7, ("#2e2622", "#3a2e30", "#4a3a3c"), "#2b2522")
    return p, "wood"


PICS = {"small_oak": lone_oak, "small_deer": deer_clearing, "small_peak": mountain_dusk,
        "tall_waterfall": waterfall, "tall_pines": pine_mist,
        "wide_castle": castle_hill, "wide_lake": mountains_lake, "wide_sunset": river_sunset}


def framed(pic, kind):
    """the picture with a 2 px frame round it: an outer dark rim and an inner lighter lip"""
    f = FRAME[kind]; w, hh = pic.w + 4, pic.h + 4
    c = np.zeros((hh, w, 3), np.uint8)
    c[:] = h(f["front"]); c[1:-1, 1:-1] = h(f["front_in"]); c[0, :] = h(f["top"]); c[:, 0] = h(f["top"])
    c[2:-2, 2:-2] = pic.c
    return c


def hang(orient, key, pic, kind):
    """the framed picture on the wall face: a0 along the edge, z0 up; the frame's rim is a 1.5 px box"""
    img = framed(pic, kind); hh, w = img.shape[:2]
    a0 = 3 if w <= 32 else 3
    z0 = 46 if hh <= 32 else 14
    s = Scene()
    def face_sh(P, s_, t_):
        u = np.clip(np.floor(s_ * w).astype(int), 0, w - 1); v = np.clip(np.floor((1 - t_) * hh).astype(int), 0, hh - 1)
        return img[v, u]
    f = FRAME[kind]
    def fn(n):
        if n[2] > 0.7: return flat(f["top"])
        front = (n[1] > 0.7) if orient == "north" else (n[0] > 0.7)
        if front: return face_sh
        return flat(f["side"])
    if orient == "north":
        O = (a0, B_FACE - 1.5, z0); A = (w, 0, 0); Bv = (0, 1.5, 0)
    else:
        O = (B_FACE - 1.5, a0, z0); A = (0, w, 0); Bv = (1.5, 0, 0)
    s.obox(O, A, Bv, (0, 0, hh), fn, tag=1)
    sp = s.render(origin_world=(0, 0, 0))
    im, anc = sp.image()
    return im, anc, (a0, z0, w, hh)


def icon_of(pic, kind, cols, rows):
    """the bag icon: the painting seen flat and framed, centred on its footprint canvas"""
    img = framed(pic, kind); hh, w = img.shape[:2]
    out = np.zeros((19 * rows, 19 * cols, 4), np.uint8)
    x0, y0 = (19 * cols - w) // 2, (19 * rows - hh) // 2
    out[y0:y0 + hh, x0:x0 + w, :3] = img; out[y0:y0 + hh, x0:x0 + w, 3] = 255
    # the #2b2522 item outline round the frame
    a = out[..., 3] > 0; p = np.pad(a, 1)
    ring = (p[:-2, 1:-1] | p[2:, 1:-1] | p[1:-1, :-2] | p[1:-1, 2:]) & ~a
    out[ring, :3] = h("#2b2522"); out[ring, 3] = 255
    return Image.fromarray(out, "RGBA")


if __name__ == "__main__":
    notes = {}
    for key, fn in PICS.items():
        pic, kind = fn()
        Image.fromarray(pic.c, "RGB").save(f"{OUT}/flat_{key}.png")
        for o in ("north", "west"):
            im, anc, (a0, z0, w, hh) = hang(o, key, pic, kind)
            name = f"painting_{key}_{o}"; im.save(f"{OUT}/{name}.png")
            notes[name] = {"size": list(im.size), "anchor_px": [int(round(anc[0])), int(round(anc[1]))], "grip_px": [im.width // 2, im.height // 2],
                           "sections": 2 if w > 32 else 1, "slot": "top" if hh <= 32 else "both",
                           "face_px": [w, hh], "hang": {"along_from_far_vertex": a0, "bottom_z": z0, "proud_of_edge_line": B_FACE}, "frame": kind}
            print(name, im.size, anc)
        cols, rows = (2, 2) if key.startswith("small") else ((2, 3) if key.startswith("tall") else (3, 2))
        ic = icon_of(pic, kind, cols, rows); ic.save(f"{OUT}/painting_{key}_icon.png")
        notes[f"painting_{key}_icon"] = {"slot_cols_rows": [cols, rows], "size": list(ic.size), "drawn_from": f"the same picture flat and framed, outlined #2b2522 as an item"}
    json.dump(notes, open(f"{OUT}/anchors_paintings.json", "w"), indent=1)
