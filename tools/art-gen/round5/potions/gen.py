"""Art round 5, group A: vials, potions, poisons, poisoned arrows.

Michael's ruling (2026-10-25, docs/47 section 8): the vials are clay, earthen and opaque, so a potion's
kind is shown on the outside: a wax seal over the stopper and a glazed band round the shoulder, in the
potion's colour (a strong poison: a darker green band and a black seal).

Two methods, picked by size (docs/art/01):
- the bag and hand pictures (11 x 16) are a hand-pixelled grid of tone letters, one body shared by all
  seven vials, with an open mouth or a wax-sealed top, the glazed band laid over it as a mask;
- the 38 x 38 portraits are the same design drawn larger by a small shaded-solid rasteriser (a belly,
  a neck, a lip, a wax dome), its tones stepped, never blended.
The poisoned arrows are round 4's arrow (tools/art-gen/round4/weapons/gen.py, its grids re-typed here,
checked pixel for pixel against data/art/items/arrow_*.png when the repo is there) with the iron head
stained with the poison's green.

Run: python gen.py     (writes out/, manifest.json, preview.png; deterministic, no randomness)
     python gen.py --zoom   (also writes work/zoom.png, a 10x working sheet)
"""
import json, os, sys
import numpy as np
from PIL import Image, ImageDraw

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "out")
WORK = os.path.join(HERE, "work")
REPO = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", "..", ".."))   # read only, for comparison
O = "#2b2522"
CELL = 19


def hx(s):
    s = s.lstrip("#"); return tuple(int(s[i:i + 2], 16) for i in (0, 2, 4)) + (255,)


def ring(im):
    """close the outline: every empty pixel that touches the picture on a side becomes #2b2522.
    The canvas grows by a pixel each side first."""
    a = np.array(im); big = np.zeros((a.shape[0] + 2, a.shape[1] + 2, 4), np.uint8); big[1:-1, 1:-1] = a
    op = big[..., 3] > 0
    p = np.pad(op, 1)
    nb = p[:-2, 1:-1] | p[2:, 1:-1] | p[1:-1, :-2] | p[1:-1, 2:]
    big[nb & ~op] = hx(O)
    return Image.fromarray(big, "RGBA")


def crop(im):
    ys, xs = np.where(np.array(im)[..., 3] > 0)
    box = (int(xs.min()), int(ys.min()), int(xs.max()) + 1, int(ys.max()) + 1)
    return im.crop(box), box


def hard(im):
    return set(np.unique(np.array(im)[..., 3]).tolist()) <= {0, 255}


def outlined(im):
    """every opaque pixel that touches transparency (or the canvas edge) is the outline colour"""
    a = np.array(im); op = a[..., 3] > 0
    p = np.pad(op, 1)
    edge = op & ~(p[:-2, 1:-1] & p[2:, 1:-1] & p[1:-1, :-2] & p[1:-1, 2:])
    return bool((a[..., :3][edge] == np.array(hx(O)[:3])).all())


# ------------------------------------------------------------------ the colours
# Each ramp: glint, light, base, shade, dark. Shadows lean cool and dusky, lights warm (docs/art/01).
FIRED = ["#e6b088", "#c27c4a", "#a4623a", "#83492c", "#5e3220"]      # round 4's honey jar terracotta
RAW = ["#a89a88", "#a89a88", "#8a7c6c", "#6c6052", "#4e443a"]        # round 4's clay, dry and matte: no glint
MOUTH = ["#2e221c", "#3e2c22"]                                        # the dark inside of an open mouth, back wall
GLAZE = {
    "red":   ["#f4a090", "#e05058", "#c8323a", "#962430", "#661a28"],   # healing_potion  #c8323a
    "gold":  ["#fcecaa", "#f0ca58", "#e0b030", "#b08020", "#7a5418"],   # stamina_potion  #e0b030
    "blue":  ["#b4ccf6", "#5a88e8", "#3a6ad8", "#2a4ca4", "#1e3270"],   # mana_potion     #3a6ad8
    "green": ["#bce4a0", "#6cbe58", "#4aa040", "#347a32", "#225224"],   # poison          #4aa040
    "dark":  ["#86c070", "#3e8a3a", "#2a6a2a", "#1e4e22", "#143418"],   # strong_poison   #2a6a2a
    "black": ["#8e8a98", "#5a5662", "#423e48", "#36323a", "#302a30"],   # the strong poison's seal, #1a1a1a lifted off the outline
}

# id: (body ramp, band, seal, poison drips, display name)
VIALS = {
    "unfired_vial":   (RAW, None, None, 0, "Unfired vial"),
    "clay_vial":      (FIRED, None, None, 0, "Clay vial"),
    "healing_potion": (FIRED, "red", "red", 0, "Healing potion"),
    "stamina_potion": (FIRED, "gold", "gold", 0, "Stamina potion"),
    "mana_potion":    (FIRED, "blue", "blue", 0, "Mana potion"),
    "poison":         (FIRED, "green", "green", 1, "Poison"),
    "strong_poison":  (FIRED, "dark", "black", 2, "Strong poison"),
}

# ------------------------------------------------------------------ the small vial: a hand-pixelled grid
# Interior pixels only (ring() adds the outline), 9 wide, centre column 4. Tone letters: G glint, A light,
# B base, C shade, D dark (the body's ramp); M, m the open mouth; on the sealed top Z W X Y V are the wax's
# glint, light, base, shade, dark.
TOP_OPEN = [
    ".........",
    "...mmC...",      # the back of the rim, the mouth's far wall
    "..AMMMC..",      # the mouth seen a little from above
    "..GABCD..",      # the lip's rolled front
    "...ABC...",      # the neck
    "...ABC...",
]
TOP_SEALED = [
    "...WXY...",      # the wax dome over the cork
    "..WZXXY..",
    "..WXXYV..",      # the wax poured over the lip
    "..XXXYV..",
    "...ABY...",      # a run of wax down the neck, on the shade side
    "...ABV...",
]
BODY = [
    "..AABCC..",      # the shoulder
    ".AGABBCD.",
    "AGAABBBCD",
    "AAABBBBCD",
    "AABBBBBCD",
    "ABBBBBCCD",
    ".BBBBCCD.",
    "..CCDDD..",      # the foot, in shade
]
# the glazed band: two rows round the shoulder, sagging a pixel at the front as a ring seen from above
BAND_ROWS = {0: (8, 9), 1: (7, 8), 2: (8, 9), 3: (8, 9), 4: (8, 9), 5: (8, 9), 6: (8, 9), 7: (7, 8), 8: (8, 9)}
BAND_GLINT = [(1, 7)]
# the poison's glaze drips down the belly from the band (column, last row)
DRIPS = {1: [(5, 11)], 2: [(5, 11), (2, 11)]}
UNFIRED_SPECKS = [(5, 9), (2, 10), (6, 7), (4, 12)]      # raw clay, a little uneven
TONE = {"G": 0, "A": 1, "B": 2, "C": 3, "D": 4}


def small_vial(vid):
    body, band, seal, drips, _ = VIALS[vid]
    rows = (TOP_SEALED if seal else TOP_OPEN) + BODY
    H, W = len(rows), 9
    im = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    for y, r in enumerate(rows):
        assert len(r) == W, (vid, y, r)
        for x, ch in enumerate(r):
            if ch == ".": continue
            if ch in TONE:
                t = TONE[ch]
                if body is RAW and (x, y) in UNFIRED_SPECKS: t = min(4, t + 1)
                col = body[t]
                if band and y in BAND_ROWS.get(x, ()):
                    col = GLAZE[band][max(1, t)]           # the glaze takes the body's light, glossier
            elif ch == "M": col = MOUTH[0]
            elif ch == "m": col = MOUTH[1]
            else: col = GLAZE[seal]["ZWXYV".index(ch)]
            im.putpixel((x, y), hx(col))
    if band:
        for p in BAND_GLINT: im.putpixel(p, hx(GLAZE[band][0]))
        for (x, y1) in DRIPS.get(drips, []):
            y0 = max(BAND_ROWS[x]) + 1
            for y in range(y0, y1 + 1):
                im.putpixel((x, y), hx(GLAZE[band][3 if x > 3 else 2]))
    return ring(im)


# ------------------------------------------------------------------ the portrait: the same vial, drawn larger
# A shaded solid in pixel units: an ellipsoid belly, a cylinder neck, a rolled lip, a wax dome. Light from
# the upper left and a little toward the viewer; tones by thresholds (five steps, no blending).
LIGHT = np.array([-0.62, -0.62, 0.48]); LIGHT = LIGHT / np.linalg.norm(LIGHT)


def tone_of(i, glint=True):
    if i > 0.9 and glint: return 0
    if i > 0.66: return 1
    if i > 0.12: return 2
    if i > -0.38: return 3
    return 4


def portrait(vid, S=38):
    body, band, seal, drips, _ = VIALS[vid]
    cx = 18.0                         # odd-width shapes centre on a pixel
    # proportions match the small vial: belly 9 wide to lip 5 and neck 3, so here belly 21, neck 7, lip 11
    by, bry, brx = 24.5, 10.6, 10.6   # belly centre row, radii
    foot_y = 34                       # last body row
    neck_top, neck_r = 9, 3.4
    lip_top, lip_bot, lip_r = 6, 9, 5.4
    T = np.full((S, S), -1, int)      # tone index, -1 empty
    C = np.full((S, S), "", object)   # which ramp: body, band, seal, mouth
    ys, xs = np.mgrid[0:S, 0:S]
    dx = xs - cx
    # belly
    ny = (ys - by) / bry; nx = dx / brx
    inb = (nx ** 2 + ny ** 2 <= 1.0) & (ys <= foot_y)
    nz = np.sqrt(np.clip(1 - nx ** 2 - ny ** 2, 0, 1))
    ib = nx * LIGHT[0] + ny * LIGHT[1] + nz * LIGHT[2]
    # neck: a cylinder from the lip down into the belly
    nn = dx / neck_r
    inn = (np.abs(dx) <= neck_r) & (ys >= neck_top) & (ys < by)
    inn &= ~inb
    inn2 = np.sqrt(np.clip(1 - nn ** 2, 0, 1))
    i_neck = nn * LIGHT[0] + inn2 * LIGHT[2] - 0.05
    # lip: a rolled rim, a short wide cylinder
    inl = (np.abs(dx) <= lip_r) & (ys >= lip_top) & (ys < lip_bot)
    il_n = dx / lip_r
    i_lip = il_n * LIGHT[0] + np.sqrt(np.clip(1 - il_n ** 2, 0, 1)) * LIGHT[2] + np.where(ys == lip_top, 0.25, 0) - np.where(ys == lip_bot - 1, 0.25, 0)
    # paint the body, the neck, the lip
    gl = body is not RAW
    for y in range(S):
        for x in range(S):
            if inb[y, x]:
                t = tone_of(ib[y, x], gl)
                if y >= foot_y - 1: t = max(t, 3)
                T[y, x] = t; C[y, x] = "body"
            elif inn[y, x]:
                T[y, x] = tone_of(i_neck[y, x], False); C[y, x] = "body"
            elif inl[y, x]:
                T[y, x] = tone_of(i_lip[y, x], gl); C[y, x] = "body"
    # a ring of shade under the lip, where it overhangs the neck
    for x in range(S):
        if abs(x - cx) <= neck_r and T[lip_bot, x] >= 0: T[lip_bot, x] = min(4, T[lip_bot, x] + 1)
    # raw clay is a little uneven (only the portraits of the vials would show it; there are none today)
    if body is RAW:
        for (x, y) in [(13, 22), (22, 27), (16, 30), (24, 20), (11, 28), (19, 18)]:
            if T[y, x] >= 0: T[y, x] = min(4, T[y, x] + 1)
    # the band: a glazed ring round the upper belly, its front sagging as a ring seen from above
    if band:
        yb, thick, sag = by - 5.0, 4, 3.0
        for x in range(S):
            col = [y for y in range(S) if C[y, x] == "body" and y > lip_bot + 1]
            if not col: continue
            rr = brx * 0.98
            f = np.sqrt(max(0.0, 1 - ((x - cx) / rr) ** 2))
            top = int(round(yb + sag * f))
            for y in range(top, top + thick):
                if T[y, x] >= 0 and C[y, x] == "body":
                    C[y, x] = "band"; T[y, x] = max(1, T[y, x])
                    if y == top and T[y, x] < 4: T[y, x] = max(1, T[y, x] - 1)   # the glaze's top edge catches light
        # the glaze's glint, two pixels on the lit side
        for (x, y) in [(11, 21), (12, 21)]:
            if C[y, x] == "band": T[y, x] = 0
        # drips running down the belly from the band
        for k in range(drips):
            x0, ln = [(23, 6), (14, 4)][k]
            col = [y for y in range(S) if C[y, x0] == "band"]
            y0 = max(col) + 1
            for y in range(y0, y0 + ln):
                for xx in (x0, x0 + 1):
                    if C[y, xx] == "body":
                        C[y, xx] = "band"; T[y, xx] = 3 if xx == x0 + 1 else 2
            for xx in (x0, x0 + 1):      # the drop's round end
                yy = y0 + ln
                if C[yy, xx] == "body" and xx == x0: C[yy, xx] = "band"; T[yy, xx] = 3
    # the top: an open mouth, or a wax seal
    if not seal:
        for x in range(S):
            d = abs(x - cx)
            if d <= lip_r - 1.5:
                C[lip_top, x] = "mouth"; T[lip_top, x] = 0
                C[lip_top + 1, x] = "mouth"; T[lip_top + 1, x] = 0
        # the back wall of the mouth, lit by nothing; the far rim above it
        for x in range(S):
            d = abs(x - cx)
            if d <= lip_r - 1.5:
                C[lip_top - 1, x] = "body"; T[lip_top - 1, x] = 2 if x < cx + 1 else 3
            if d <= lip_r - 2.5: C[lip_top, x] = "mouth"; T[lip_top, x] = 1
    else:
        # a wax dome over the cork and the lip: an ellipsoid cap, and wax runs down the neck
        wy, wry, wrx = lip_top + 2.0, 5.0, lip_r + 0.3
        for y in range(S):
            for x in range(S):
                ex, ey = (x - cx) / wrx, (y - wy) / wry
                if ex ** 2 + ey ** 2 <= 1 and lip_top - 2 <= y <= lip_bot:
                    ez = np.sqrt(max(0.0, 1 - ex ** 2 - ey ** 2))
                    i = ex * LIGHT[0] + ey * LIGHT[1] + ez * LIGHT[2]
                    T[y, x] = tone_of(i, True); C[y, x] = "seal"
        # runs of wax down the neck: one long on the shade side, one short at the front
        for (x0, ln) in [(21, 4), (17, 2)]:
            for y in range(lip_bot, lip_bot + ln):
                C[y, x0] = "seal"; T[y, x0] = 3 if x0 > cx else 2
            C[lip_bot + ln, x0] = "seal"; T[lip_bot + ln, x0] = 4 if x0 > cx else 3
    im = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    for y in range(S):
        for x in range(S):
            t = T[y, x]
            if t < 0: continue
            c = C[y, x]
            ramp = body if c == "body" else GLAZE[band] if c == "band" else GLAZE[seal] if c == "seal" else MOUTH
            im.putpixel((x, y), hx(ramp[min(t, len(ramp) - 1)]))
    im = ring(crop(im)[0])
    out = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    out.alpha_composite(im, ((S - im.width) // 2, (S - im.height) // 2))
    return out


# ------------------------------------------------------------------ the poisoned arrows
IRON = dict(gl="#b4b8c0", hi="#8a8c96", base="#5e6068", sh="#3e3f46")
SHAFT = dict(hi="#d2b88a", base="#b8a078", sh="#8a7452")
WRAP = dict(hi="#7a5638", base="#5a3c25", sh="#3e2818")
GOOSE = dict(hi="#d6d4cc", base="#a8a6a0", sh="#76746f")
WOOD_SH, WOOD_BASE = "#57381f", "#7a5132"
ARROW_PAL = {"o": O, "g": IRON["gl"], "H": IRON["hi"], "I": IRON["base"], "i": IRON["sh"],
             "S": SHAFT["hi"], "s": SHAFT["base"], "w": WRAP["base"], "W": WRAP["hi"],
             "F": GOOSE["hi"], "f": GOOSE["base"], "G": GOOSE["sh"], "n": WOOD_SH, "N": WOOD_BASE}
# the head stained: the iron's tones pulled to the poison's green, a wet glint kept pale; `p` and `q` a
# runnel of poison down the binding and the shaft
STAIN = {
    "poison": {"g": "#d4ecbc", "H": "#86a87a", "I": "#4f7a4a", "i": "#34503a", "p": "#5cb04c", "q": "#3c8a36"},
    "strong": {"g": "#a8d494", "H": "#5a8458", "I": "#2e5a30", "i": "#1e3a24", "p": "#2e7a2e", "q": "#1e5222"},
}
# round 4's arrow, 10 x 36 (tools/art-gen/round4/weapons/gen.py, ARROW_HEAD / ARROW_SHAFT / ARROW_TAIL)
ARROW_HEAD = [
    "....oo....",
    "...ogIo...",
    "...oHIo...",
    "..ogHIio..",
    "..oHHIio..",
    ".ogHHIiio.",
    ".oHHHIiio.",
    ".oHHIIiio.",
    "..oHHIio..",
    "...oHIo...",
    "...oIio...",
]
ARROW_SHAFT = "...oSso..."
ARROW_TAIL = [
    "...oWwo...",
    "..oFSsfo..",
    "..oFSsfo..",
    ".oFFSsffo.",
    ".oGFSsfGo.",
    ".oFFSsffo.",
    "oFGFSsfGfo",
    "oFFFSsfffo",
    "oGFFSsfGfo",
    "oFFFSsfffo",
    "oooFSsfooo",
    "...oWwo...",
    "...oNno...",
    "...oooo...",
]
ARROW_WORLD = [
    "..o..", ".ogo.", ".oHo.", "oHHIo", "ogHio", "oHIio", ".oIo.", ".oWo.",
    ".oSo.", ".oSo.", ".oSo.", ".oSo.", ".oSo.", ".oSo.", ".oSo.", ".oSo.",
    ".oWo.", "oFSfo", "oFSfo", "oGSGo", "oFSfo", "oFSfo", ".oNo.", "..o..",
]
# where the poison runs below the head: (row, column, letter) on the icon and the world picture.
# The ordinary poison wets the socket and the binding; the strong one is wetter: more glints on the head,
# a runnel down the shaft, and a drop hanging off the socket.
ICON_RUN = {
    "poison": [(10, 4, "i"), (10, 5, "p"), (11, 4, "p"), (12, 5, "q")],
    "strong": [(10, 4, "p"), (10, 5, "q"), (11, 4, "p"), (11, 5, "q"), (12, 4, "p"), (12, 5, "q"), (13, 4, "q"),
               (13, 5, "q"), (14, 4, "p"), (14, 5, "q"), (15, 4, "p"), (15, 3, "p"), (15, 2, "o"), (16, 4, "q")],
}
ICON_WET = {"poison": [(7, 3, "p"), (8, 4, "p"), (9, 5, "q")], "strong": [(6, 3, "g"), (8, 4, "g"), (7, 2, "p"), (8, 3, "p"), (9, 4, "p"), (9, 5, "q"), (7, 7, "q"), (8, 6, "q")]}
WORLD_RUN = {
    "poison": [(7, 2, "p")],
    "strong": [(7, 2, "p"), (8, 2, "q"), (9, 2, "q")],
}
WORLD_WET = {"poison": [], "strong": [(5, 1, "g")]}


def paint_rows(rows, pal):
    im = Image.new("RGBA", (len(rows[0]), len(rows)), (0, 0, 0, 0))
    for y, r in enumerate(rows):
        for x, ch in enumerate(r):
            if ch != ".": im.putpixel((x, y), hx(pal[ch]))
    return im


def arrow_icon(stain=None):
    n_shaft = 36 - len(ARROW_HEAD) - len(ARROW_TAIL)
    rows = [list(r) for r in ARROW_HEAD + [ARROW_SHAFT] * n_shaft + ARROW_TAIL]
    pal = dict(ARROW_PAL)
    if stain:
        pal.update(STAIN[stain])
        for (y, x, ch) in ICON_WET[stain]: rows[y][x] = ch
        for (y, x, ch) in ICON_RUN[stain]:
            if ch: rows[y][x] = ch
    rows = ["".join(r) for r in rows]
    im = paint_rows(rows, pal)
    return im


def arrow_world(stain=None):
    rows = [list(r) for r in ARROW_WORLD]
    pal = dict(ARROW_PAL)
    if stain:
        pal.update(STAIN[stain])
        for (y, x, ch) in WORLD_WET[stain] + WORLD_RUN[stain]: rows[y][x] = ch
    return paint_rows(["".join(r) for r in rows], pal), (2, 12)


def on_canvas(im, w, h, dx=0, dy=0):
    out = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    out.alpha_composite(im, ((w - im.width) // 2 + dx, (h - im.height) // 2 + dy))
    return out


# ------------------------------------------------------------------ notes for the manifest
NOTES = {
    "unfired_vial": "Unfired vial: the shared clay vial body in round 4's grey-brown clay, dry and matte (no glint), four darker specks for its unevenness; open mouth, no stopper.",
    "clay_vial": "Clay vial: fired, round 4's honey-jar terracotta with a glint on the lit shoulder; empty, the mouth open (no cork: the data says bare, and the open mouth tells it from the sealed potions at a glance).",
    "healing_potion": "Healing potion: the fired vial corked and sealed in red wax (#c8323a) over the lip, a run of wax down the neck, and a glazed red band round the shoulder with a glint.",
    "stamina_potion": "Stamina potion: as the healing potion, the wax and the glazed band in the data's gold (#e0b030).",
    "mana_potion": "Mana potion: as the healing potion, the wax and the glazed band in the data's blue (#3a6ad8).",
    "poison": "Poison: green wax (#4aa040) and a green glazed band, and one drip of the green glaze running down the belly from the band: the mark that it is a poison, not a potion.",
    "strong_poison": "Strong poison: the black seal of docs/47 section 8 (#1a1a1a lifted to a charcoal #423e48 so it does not vanish into the #2b2522 outline), a darker green band (#2a6a2a) and two drips.",
    "poison_arrow": "Poisoned arrow: round 4's arrow pixel for pixel (checked against data/art/items/arrow_*.png), its iron head stained the poison's green with a pale wet glint and a little poison wetting the socket and the binding. Placed as round 4's arrow, 3 px left of centre and 1 px up, so the lower-right corner stays clear for the count.",
    "strong_poison_arrow": "Strongly poisoned arrow: as the poisoned arrow, the head a darker green and wetter (more glints), a runnel down the shaft below the binding and a drop hanging off the socket (icon); in the world picture, the stain runs three pixels down the shaft.",
}


def main():
    os.makedirs(OUT, exist_ok=True)
    manifest, made = {}, {}
    # the seven vials
    for vid in VIALS:
        w = small_vial(vid)
        w, _ = crop(w)
        ic = on_canvas(w, CELL, CELL, -2, 0)        # left: the lower-right corner kept for the count
        grip = (w.width // 2, w.height - 6)            # the belly's middle, where the fingers close
        assert np.array(w)[grip[1], grip[0], 3] == 255
        w.save(os.path.join(OUT, f"{vid}_world.png")); ic.save(os.path.join(OUT, f"{vid}_icon.png"))
        has_p = VIALS[vid][1] is not None
        entry = {"icon": [CELL, CELL], "portrait": has_p,
                 "held": {"mode": "fixed", "image": f"{vid}_world.png", "grip": list(grip)},
                 "world_size": [w.width, w.height], "notes": NOTES[vid]}
        made[vid] = {"world": w, "icon": ic, "grip": grip}
        if has_p:
            p = portrait(vid)
            p.save(os.path.join(OUT, f"{vid}_portrait.png")); made[vid]["portrait"] = p
        manifest[vid] = entry
    # the poisoned arrows
    for vid, st in (("poison_arrow", "poison"), ("strong_poison_arrow", "strong")):
        ic = on_canvas(arrow_icon(st), CELL, 2 * CELL, -3, -1)
        w, grip = arrow_world(st)
        ic.save(os.path.join(OUT, f"{vid}_icon.png")); w.save(os.path.join(OUT, f"{vid}_world.png"))
        manifest[vid] = {"icon": [CELL, 2 * CELL], "portrait": False,
                         "held": {"mode": "fixed", "image": f"{vid}_world.png", "grip": list(grip)},
                         "world_size": [w.width, w.height], "notes": NOTES[vid]}
        made[vid] = {"world": w, "icon": ic, "grip": grip}
    # checks
    for vid, m in made.items():
        for k in ("world", "icon", "portrait"):
            if k in m:
                assert hard(m[k]), (vid, k)
                if not outlined(m[k]): print("WARN outline gap:", vid, k)
        assert np.array(m["world"])[m["grip"][1], m["grip"][0], 3] == 255, vid
        a = np.array(m["icon"])[..., 3]
        lr = a[-7:, -6:]                             # the count's corner, 6 x 7 art pixels
        if lr.any(): print("WARN lower-right corner not clear:", vid)
    check_arrow()
    with open(os.path.join(HERE, "manifest.json"), "w") as f: json.dump(manifest, f, indent=2)
    preview(made)
    if "--zoom" in sys.argv: zoom(made)
    for vid, m in made.items():
        print(f"{vid:20s} world {m['world'].width}x{m['world'].height} grip {m['grip']} icon {m['icon'].size}" + (" portrait 38x38" if "portrait" in m else ""))


def check_arrow():
    """our re-typed grids, unstained, must be round 4's arrow pixel for pixel"""
    ref_i = os.path.join(REPO, "data/art/items/arrow_icon.png"); ref_w = os.path.join(REPO, "data/art/items/arrow_world.png")
    if not (os.path.exists(ref_i) and os.path.exists(ref_w)): print("note: round 4's arrow not found; skipped the match check"); return
    a = np.array(on_canvas(arrow_icon(None), CELL, 2 * CELL, -3, -1)); b = np.array(Image.open(ref_i).convert("RGBA"))
    c = np.array(arrow_world(None)[0]); d = np.array(Image.open(ref_w).convert("RGBA"))
    print("arrow icon matches round 4:", a.shape == b.shape and (a == b).all(), "| world matches:", c.shape == d.shape and (c == d).all())


# ------------------------------------------------------------------ the preview
BG = (92, 84, 76, 255); SLOT = (42, 38, 34, 255); TXT = (226, 214, 190, 255); PANEL = (60, 54, 48, 255)
GRASS = (75, 95, 61, 255); FLOOR = (98, 72, 47, 255)


def up(im, k):
    return im.resize((im.width * k, im.height * k), Image.NEAREST)


def figure():
    """a plain 55 px figure, for scale: the round 4 previews' stand-in"""
    im = Image.new("RGBA", (30, 55), (0, 0, 0, 0)); d = ImageDraw.Draw(im)
    d.ellipse((7, 0, 18, 12), fill=hx("#3a2a20")); d.ellipse((8, 2, 17, 13), fill=hx("#e0b494"))
    d.rectangle((6, 14, 19, 36), fill=hx("#6a5a8a")); d.rectangle((2, 15, 5, 33), fill=hx("#6a5a8a"))
    d.polygon([(19, 15), (22, 15), (28, 40), (25, 41)], fill=hx("#6a5a8a")); d.rectangle((26, 40, 28, 42), fill=hx("#e0b494"))
    d.rectangle((7, 37, 11, 54), fill=hx("#4a3a2a"))
    d.rectangle((14, 37, 18, 54), fill=hx("#4a3a2a"))
    return ring(im)


def preview(made):
    vids = list(VIALS); arrows = ["poison_arrow", "strong_poison_arrow"]
    order = vids + arrows
    pad = 12
    W = 1180
    sheet = Image.new("RGBA", (W, 1100), BG); d = ImageDraw.Draw(sheet)
    y = pad
    d.text((pad, y), "Art round 5, group A: vials, potions, poisons. Icons at 2x in a bag slot (count drawn as the bag would), then 1x", fill=TXT); y += 18
    x = pad
    for vid in order:
        ic = made[vid]["icon"]
        slot = Image.new("RGBA", (ic.width * 2 + 4, ic.height * 2 + 4), PANEL)
        slot.alpha_composite(Image.new("RGBA", (ic.width * 2, ic.height * 2), SLOT), (2, 2))
        slot.alpha_composite(up(ic, 2), (2, 2))
        sd = ImageDraw.Draw(slot)
        n = "20" if "arrow" in vid else ("10" if "vial" in vid else "5")
        tw = 6 * len(n)
        sd.text((slot.width - tw - 5, slot.height - 13), n, fill=(255, 255, 255, 255))
        sheet.alpha_composite(slot, (x, y))
        sheet.alpha_composite(ic, (x + slot.width + 4, y))
        d.text((x, y + slot.height + 2), vid.replace("_", " ")[:16], fill=TXT)
        x += slot.width + ic.width + 22
    y += 2 * 2 * CELL + 4 + 22
    d.text((pad, y), "Portraits 38 x 38 at 2x (belt slots), and at 1x", fill=TXT); y += 16
    x = pad
    for vid in vids:
        if "portrait" not in made[vid]: continue
        p = made[vid]["portrait"]
        sheet.alpha_composite(Image.new("RGBA", (80, 80), PANEL), (x, y))
        sheet.alpha_composite(Image.new("RGBA", (76, 76), SLOT), (x + 2, y + 2))
        sheet.alpha_composite(up(p, 2), (x + 2, y + 2))
        sheet.alpha_composite(p, (x + 86, y + 21))
        x += 140
    y += 92
    d.text((pad, y), "World pictures at 4x, the grip pixel boxed cyan", fill=TXT); y += 16
    x = pad
    for vid in order:
        w, g = made[vid]["world"], made[vid]["grip"]
        k = 4
        sheet.alpha_composite(up(w, k), (x, y))
        d.rectangle((x + g[0] * k - 1, y + g[1] * k - 1, x + g[0] * k + k, y + g[1] * k + k), outline=(80, 230, 230, 255))
        d.text((x, y + w.height * k + 2), f"{w.width}x{w.height} g{g[0]},{g[1]}", fill=TXT)
        x += max(w.width * k + 26, 76)
    y += 24 * 4 + 22
    # held by a figure, at 1x on grass and on floor wood, and at 3x; round 4's honey, waterskin and arrow beside them
    refs = []
    for rid in ("honey", "waterskin", "arrow"):
        f = os.path.join(REPO, f"data/art/items/{rid}_world.png")
        if os.path.exists(f): refs.append((rid, Image.open(f).convert("RGBA"), {"honey": (7, 11), "waterskin": (6, 12), "arrow": (2, 12)}[rid]))
    held = [(v, made[v]["world"], made[v]["grip"]) for v in order] + refs

    def strip(ground, items):
        fig = figure()
        im = Image.new("RGBA", (16 + 44 * len(items), 66), ground)
        sx = 6
        for vid, w, g in items:
            fx, fy = sx, 66 - 58
            im.alpha_composite(fig, (fx, fy))
            hand = (fx + 1 + 28, fy + 1 + 41)          # the hand: 14 px above the feet, about 9 px out from the body
            im.alpha_composite(w, (hand[0] - g[0], hand[1] - g[1]))
            sx += 44
        return im
    d.text((pad, y), "Held at 1x by a 55 px stand-in figure, on grass and on floor wood; the last three are round 4's honey, waterskin and arrow", fill=TXT); y += 16
    s1 = strip(GRASS, held); sheet.alpha_composite(s1, (pad, y)); y += s1.height + 4
    s2 = strip(FLOOR, held); sheet.alpha_composite(s2, (pad, y)); y += s2.height + 10
    d.text((pad, y), "The same at 3x", fill=TXT); y += 16
    pick = [held[i] for i in (0, 1, 2, 5, 6, 8)] + refs[:1]
    s3 = up(strip(FLOOR, pick), 3)
    sheet.alpha_composite(s3, (pad, y)); y += s3.height + 8
    sheet = sheet.crop((0, 0, W, y))
    sheet.save(os.path.join(HERE, "preview.png"))


def zoom(made):
    os.makedirs(WORK, exist_ok=True)
    order = list(made)
    k = 10
    ims = [made[v]["icon"] for v in order[:7]]
    sheet = Image.new("RGBA", (sum(i.width * k + 8 for i in ims), CELL * k), BG)
    x = 0
    for i in ims: sheet.alpha_composite(up(i, k), (x, 0)); x += i.width * k + 8
    sheet.save(os.path.join(WORK, "zoom.png"))
    ps = [made[v]["portrait"] for v in order if "portrait" in made[v]]
    sheet = Image.new("RGBA", (len(ps) * (38 * 6 + 8), 38 * 6), BG)
    for j, p in enumerate(ps): sheet.alpha_composite(up(p, 6), (j * (38 * 6 + 8), 0))
    sheet.save(os.path.join(WORK, "zoom_portraits.png"))
    ar = [made[v]["icon"] for v in order[7:]] + [made[v]["world"] for v in order[7:]]
    sheet = Image.new("RGBA", (sum(i.width * 8 + 8 for i in ar), 38 * 8), BG)
    x = 0
    for i in ar: sheet.alpha_composite(up(i, 8), (x, 0)); x += i.width * 8 + 8
    sheet.save(os.path.join(WORK, "zoom_arrows.png"))


if __name__ == "__main__":
    main()
