"""The items that are not held: hand-pixelled grids for everything under about 20 px (apple, bread,
tinderbox, bandage, stone, the six seed pouches), masks and the top-left light rule for the bigger
things (log, waterskin, the starting outfit, the sack). Every function returns (image, grip_px)."""
import numpy as np
from PIL import Image
from px import Canvas, ellipse, rect, rrect, shade, lit_band, shift, hashn, OUTLINE, hx

O = OUTLINE


def from_grid(rows, pal, grip):
    w = max(len(r) for r in rows); c = Canvas(w, len(rows)); c.grid(rows, pal); im, (x0, y0) = c.image()
    return im, (grip[0] - x0, grip[1] - y0)


# ------------------------------------------------------------------ apple
APPLE_PAL = {"o": O, "R": "#b8342a", "r": "#7e1f1c", "h": "#d8503a", "H": "#eaa68a", "s": "#5a3c22", "L": "#587a36", "l": "#7a9e52"}
APPLE = [
    "......oo......",
    ".....osoo.....",
    "...ooosLlo....",
    "..ohhoosoLo...",
    ".ohHhhhRRRo...",
    "ohHHhhRRRRRo..",
    "ohHhhRRRRRRro.",
    "ohhhRRRRRRRro.",
    "oRRRRRRRRRrro.",
    "oRRRRRRRRrrro.",
    ".oRRRRRRrrro..",
    ".oRRRRRrrrro..",
    "..oRRrrrrro...",
    "...oorrroo....",
    ".....ooo......",
]

def apple(): return from_grid(APPLE, APPLE_PAL, (6, 9))


# ------------------------------------------------------------------ bread
BREAD_PAL = {"o": O, "H": "#e0aa6a", "h": "#c98a4a", "C": "#a86b35", "D": "#7a4b23", "c": "#8a5a2c"}
BREAD = [
    ".....oooooo.....",
    "...ooHHHHHHoo...",
    "..oHHhhhhhhHHo..",
    ".oHhhhchhhchhHo.",
    "oHhhhchhhchhhhCo",
    "oHhhchhhchhhhCCo",
    "oChhhhhhhhhhCCCo",
    "oCChhhhhhhhCCCCo",
    ".oCCCCCCCCCCCDo.",
    "..oDDCCCCCDDDo..",
    "...ooDDDDDDoo...",
    ".....oooooo.....",
]

def bread(): return from_grid(BREAD, BREAD_PAL, (8, 7))


# ------------------------------------------------------------------ tinderbox, drawn as a matchbox (Michael, 2026-10-20): a card box
# with its drawer out showing two red heads, a red striking strip along its side, a loose match in front
TB_PAL = {"o": O, "T": "#d9cba2", "t": "#c9b98e", "s": "#a8966f", "R": "#7e1f1c", "r": "#b8342a", "W": "#e6e0cc", "w": "#c4bba4", "M": "#b8342a"}
TINDERBOX = [
    "...ooooooooooo....",
    "..oTTTTTTTTTTTo...",
    ".oTTTTTTTTTTTTTo..",
    ".ottttttttttttooo.",
    ".otttttttttttoWMo.",
    ".oRRRRRRRRRRRoWMo.",
    ".oRrRrRrRrRrRRooo.",
    "..oooooooooooo....",
    ".oWWWWWWWWwMo.....",
    "..oooooooooo......",
]

def tinderbox(): return from_grid(TINDERBOX, TB_PAL, (8, 5))


# ------------------------------------------------------------------ bandage: a rolled linen strip with its tail
BD_PAL = {"o": O, "L": "#e6e0cc", "l": "#c4bba4", "d": "#a89f88"}
BANDAGE = [
    "....ooooo.......",
    "..ooLLLLLoo.....",
    ".oLLllllllLo....",
    "oLLlLLLLLlLLo...",
    "oLlLLlllLLlLo...",
    "oLlLlLLLlLlLo...",
    "oLlLLlllLLldo...",
    "oLLlLLLLLlldoo..",
    ".oLLllllllLoLLo.",
    "..ooLLLLLoodLLLo",
    "....ooooooLLLdo.",
    ".........oLLdo..",
    "..........oooo..",
]

def bandage(): return from_grid(BANDAGE, BD_PAL, (6, 6))


# ------------------------------------------------------------------ stone: a chunk of the rocks' grey
ST_PAL = {"o": O, "H": "#cfc6b6", "h": "#b0a697", "m": "#8e857a", "d": "#6c645c"}
STONE = [
    ".....oooo.....",
    "...ooHHHhoo...",
    "..oHHHHhhhho..",
    ".oHHHhhhmmmmo.",
    "oHHhhhhhmmmmdo",
    "ohhhhhmmmmmddo",
    "ohhhmmmmmddddo",
    ".ommmmmddddddo",
    ".ommmmddddddo.",
    "..oommdddddo..",
    "....ooooooo...",
]

def stone(): return from_grid(STONE, ST_PAL, (6, 6))


# ------------------------------------------------------------------ the seed pouches: one open burlap pouch, six heaps
POUCH_PAL = {"o": O, "B": "#b8a67c", "b": "#8f7f5c", "k": "#6a5c42", "t": "#5a3c22"}
POUCH = [
    "....ooooooo.....",
    "...oBB.....o....",   # the mouth: the heap goes here (row 1..3, x 4..10)
    "..oB.......bo...",
    "..oBk.....kbo...",
    "..ookkkkkkkoo...",
    "...oBtttttbo....",
    "..oBBBBBBBbbo...",
    ".oBBBBBBBBbbbo..",
    ".oBBBBBBBBbbbo..",
    ".oBBBBBBBbbbbo..",
    ".oBBBBBBbbbbko..",
    "..oBBBBbbbbko...",
    "...ooooooooo....",
]
# each heap: rows over the mouth (anchored at x = 4, y = 1) and two spilled seeds at the lower left
SEEDS = {
    "potato_seed":  (["..PpP..", ".PPpPp.", "PpPPpPp"], {"P": "#b0905e", "p": "#8e7048", "e": "#5a4030"}, ["Pp", "pP"], [(1, 2, "e"), (4, 1, "e")]),
    "cabbage_seed": ([".c.c.c.", "c.C.c.C", ".CcCcC."], {"C": "#4a3c34", "c": "#2e2522"}, ["cC", "C."], []),
    "garlic_seed":  (["..GvG..", ".GGgGG.", "GgGGvGg"], {"G": "#e0d8c4", "g": "#c2b8a6", "v": "#8a6a86"}, ["Gg", "vG"], []),
    "pumpkin_seed": ([".PP.PP.", "PPpPPpP", ".pPPpP."], {"P": "#e2d690", "p": "#b8ac62"}, ["PP", "pP"], []),
    "rye_seed":     (["R.R.R.R", "rRrRrRr", "R.R.R.R"], {"R": "#cfa94c", "r": "#b08a36"}, ["Rr", "rR"], []),
    "flax_seed":    ([".F.F.F.", "FfFfFfF", ".F.F.F."], {"F": "#a86a36", "f": "#7a4a22", "g": "#d8a070"}, ["Ff", "fF"], [(1, 1, "g"), (5, 1, "g")]),
}

def seed_pouch(kind):
    heap, pal, spill, glints = SEEDS[kind]
    c = Canvas(16, 13); c.grid(POUCH, POUCH_PAL)
    hp = dict(pal); hp["."] = None
    for y, r in enumerate(heap):
        for x, ch in enumerate(r):
            if ch != ".": c.px(4 + x, 1 + y, pal[ch])
    for (x, y, ch) in glints: c.px(4 + x, 1 + y, pal[ch])
    for y, r in enumerate(spill):
        for x, ch in enumerate(r):
            if ch != ".": c.px(x, 10 + y, pal[ch])
    # the mouth's rim over the heap, so the seeds sit inside the pouch
    for x in range(3, 12):
        if not c.a[4, x]: c.px(x, 4, POUCH_PAL["k"])
    im, (x0, y0) = c.image()
    return im, (7 - x0, 8 - y0)


# ------------------------------------------------------------------ log: a standing length of the log wall's logs, 2 x 3
LOGP = dict(hi="#ab7b4c", li="#9c6d41", b="#8a5e36", sh="#73502e", dk="#5a3c22", bark="#6c4829", eg="#c49e6c", er="#a07e52", eb="#5a3c22")

def log():
    W, H = 34, 54
    c = Canvas(W, H)
    rx, ry = 15.5, 6.5
    body = rect(W, H, 1, 7, 32, 48) | ellipse(W, H, 17, 47, rx, ry)
    body &= ~rect(W, H, 0, 0, W, 7) | ellipse(W, H, 17, 7, rx, ry)
    x, y = np.mgrid[0:H, 0:W][1] + 0.5, np.mgrid[0:H, 0:W][0] + 0.5
    # the round body: lit on the left, base in the middle, shade on the right, the darkest at the right rim
    c.paint(body, LOGP["b"])
    c.paint(body & (x < 12), LOGP["li"]); c.paint(body & (x < 6), LOGP["hi"])
    c.paint(body & (x > 23), LOGP["sh"]); c.paint(body & (x > 29), LOGP["dk"])
    # bark: flecks and a few long cracks down the body
    xi, yi = np.floor(x).astype(int), np.floor(y).astype(int)
    fleck = body & (hashn(xi // 2, yi // 3, 5) % 9 == 0) & (y > 10) & (y < 50)
    c.paint(fleck, LOGP["bark"])
    for cx in (9, 21):
        crack = body & (np.abs(x - (cx + 0.8 * np.sin(y / 6))) < 0.5) & (y > 14) & (y < 46)
        c.paint(crack, LOGP["bark"])
    # a branch stub on the lit side
    stub = ellipse(W, H, 7, 24, 3.5, 2.5)
    c.paint(stub, LOGP["li"]); c.paint(stub & (x < 5), LOGP["eg"]); c.paint(stub & (y > 25), LOGP["sh"])
    # the cut top: end grain with rings, a bark rim
    top = ellipse(W, H, 17, 7, rx, ry)
    c.paint(top, LOGP["eg"])
    d = np.sqrt(((x - 17) / rx) ** 2 + ((y - 7) / ry) ** 2)
    for r in (0.3, 0.55, 0.8):
        c.paint(top & (np.abs(d - r) < 0.07), LOGP["er"])
    c.paint(top & (d > 0.9), LOGP["eb"])
    c.paint(top & (d < 0.08), LOGP["er"])
    # the bottom rim: a dark edge
    c.paint(lit_band(body, 1, 1, 1) & (y > 40), LOGP["dk"])
    c.outline()
    im, (x0, y0) = c.image()
    return im, (17 - x0, 30 - y0)


# ------------------------------------------------------------------ waterskin: 1 x 2, narrower than its canvas so the fill level shows round it
SKIN = dict(hi="#9c7a52", base="#7e5f3c", sh="#5e4429", dk="#432d1e", plug="#9a6a42", plug_sh="#57381f", cord="#b8a67c")

def waterskin(big=False):
    W, H = (24, 36) if big else (13, 24)
    c = Canvas(W, H)
    x, y = np.mgrid[0:H, 0:W][1] + 0.5, np.mgrid[0:H, 0:W][0] + 0.5
    cx = W / 2
    if big:
        body = ellipse(W, H, cx, 23, 10.5, 11.5) | ellipse(W, H, cx - 1, 14, 6.5, 7)
        neck = rect(W, H, int(cx) - 2, 3, int(cx) + 2, 9); plug = rect(W, H, int(cx) - 3, 1, int(cx) + 3, 4)
    else:
        body = ellipse(W, H, cx, 15.5, 5.5, 7.5) | ellipse(W, H, cx - 0.5, 10, 3.5, 4.5)
        neck = rect(W, H, int(cx) - 1, 3, int(cx) + 2, 7); plug = rect(W, H, int(cx) - 2, 1, int(cx) + 3, 3)
    shade(c, body, SKIN["hi"], SKIN["base"], SKIN["sh"], lit=2 if big else 1, dk=2 if big else 1)
    c.paint(lit_band(body, 1, 1, 1), SKIN["dk"])
    # the seam down the middle
    c.paint(body & (np.abs(x - cx - 0.5) < 0.5) & (y > (12 if big else 8)), SKIN["sh"])
    c.paint(neck, SKIN["base"]); c.paint(neck & (x < cx - 0.5), SKIN["hi"]); c.paint(neck & (x > cx + 0.5), SKIN["sh"])
    c.paint(plug, SKIN["plug"]); c.paint(plug & (y < 2), "#b08050"); c.paint(plug & (x > cx + 1), SKIN["plug_sh"])
    cord = neck & (y >= (7 if big else 5)) & (y < (9 if big else 6.5))
    c.paint(cord, SKIN["cord"])
    c.outline()
    im, (x0, y0) = c.image()
    return im, (int(cx) - x0, (18 if big else 12) - y0)


# ------------------------------------------------------------------ the starting outfit, as things: folded, from the round-1 paintings' colours
TUNIC = dict(hi="#d9cba2", base="#c9b98e", sh="#a8966f", dk="#86765a", trim="#a8a498")
BREECH = dict(hi="#6b4e3a", base="#5a4030", sh="#43301f", dk="#2e2015")
BOOT = dict(hi="#5e4530", base="#4a3522", sh="#36261a", dk="#241910", sole="#2e2622", lace="#8a7a5a", nail="#8a8c96")
ROPE = dict(hi="#cdbb8e", base="#b8a67c", sh="#8f7f5c", dk="#6a5c42")
SACK = dict(hi="#ab9a74", base="#9c8a66", sh="#7a6a4c", dk="#5c4e36", tie="#5a3c22")


def folded(c, m, pal, folds, lit=2, dk=2):
    shade(c, m, pal["hi"], pal["base"], pal["sh"], lit, dk)
    c.paint(lit_band(m, 1, 1, 1), pal["dk"])
    for f in folds: c.paint(m & f, pal["sh"])


def tunic():
    """the linen tunic laid flat: the body with its hem trim, two short sleeves, the round neck"""
    W, H = 34, 30; c = Canvas(W, H)
    x, y = np.mgrid[0:H, 0:W][1] + 0.5, np.mgrid[0:H, 0:W][0] + 0.5
    body = rrect(W, H, 8, 3, 26, 29, 2)
    slL = (x >= 2) & (x < 9) & (y >= 4 + (8 - x) * 0.3) & (y < 13 + (8 - x) * 0.3)
    slR = (x >= 25) & (x < 32) & (y >= 4 + (x - 25) * 0.3) & (y < 13 + (x - 25) * 0.3)
    m = body | slL | slR
    shade(c, m, TUNIC["hi"], TUNIC["base"], TUNIC["sh"], 2, 2)
    c.paint(lit_band(m, 1, 1, 1), TUNIC["dk"])
    # the sleeves' seams and cuffs
    c.paint(m & (np.floor(x) == 8) & (y > 4) & (y < 14), TUNIC["sh"]); c.paint(m & (np.floor(x) == 25) & (y > 4) & (y < 14), TUNIC["sh"])
    c.paint(slL & (x < 3.5), TUNIC["trim"]); c.paint(slR & (x > 30.5), TUNIC["trim"])
    # a fold shadow down the middle, the hem's trim row, the side slit at the hem
    c.paint(body & (np.floor(x) == 17) & (y > 7) & (y < 27), TUNIC["sh"])
    c.paint(body & (np.floor(y) == 27) & (x > 8) & (x < 26), TUNIC["trim"])
    c.paint(body & (np.floor(x) == 16) & (y > 24) & (y < 28), TUNIC["dk"])
    # the neck: a round opening with its facing
    neck = ellipse(W, H, 17, 4, 4.5, 2.5) & (y > 3)
    c.paint(neck, TUNIC["dk"]); c.paint((ellipse(W, H, 17, 4, 5.5, 3.5) & ~neck) & (y > 3) & (y < 8), TUNIC["trim"])
    c.outline()
    im, (x0, y0) = c.image()
    return im, (17 - x0, 15 - y0)


def breeches():
    """the dark breeches laid flat: a drawstring waist, two legs"""
    W, H = 30, 30; c = Canvas(W, H)
    x, y = np.mgrid[0:H, 0:W][1] + 0.5, np.mgrid[0:H, 0:W][0] + 0.5
    waist = rrect(W, H, 4, 2, 26, 12, 2)
    legL = rrect(W, H, 4, 8, 14, 29, 2); legR = rrect(W, H, 16, 8, 26, 29, 2)
    m = waist | legL | legR
    shade(c, m, BREECH["hi"], BREECH["base"], BREECH["sh"], 2, 2)
    c.paint(lit_band(m, 1, 1, 1), BREECH["dk"])
    # the crotch seam and the inner leg shadows
    c.paint(m & (x > 13.5) & (x < 16.5) & (y > 11), BREECH["dk"])
    c.paint(legR & (x < 17.5) & (y > 12), BREECH["sh"])
    c.paint(legL & (np.floor(x) == 13) & (y > 12), BREECH["sh"])
    # the knee creases
    for lx in (9, 21): c.paint(m & (np.floor(y) == 20) & (np.abs(x - lx) < 3), BREECH["sh"])
    # the drawstring waist with its tie
    c.paint(m & (np.floor(y) == 4) & (x > 5) & (x < 25), BREECH["dk"])
    c.paint(m & (np.floor(y) == 3) & (x > 5) & (x < 25), BREECH["hi"])
    for px in (13, 17): c.px(px, 5, "#b8a67c"); c.px(px, 6, "#8f7f5c"); c.px(px - 1 if px == 13 else px + 1, 7, "#8f7f5c")
    c.outline()
    im, (x0, y0) = c.image()
    return im, (15 - x0, 15 - y0)


BOOT_PAL = {"o": O, "H": "#5e4530", "h": "#4a3522", "b": "#36261a", "d": "#241910", "S": "#2e2622", "n": "#8a8c96", "l": "#8a7a5a", "k": "#241910"}
BOOT = [
    "..oooooo.......",
    ".oHHHHHho......",
    ".ohhhlhbo......",
    ".ohhhkhbo......",
    ".ohhhlhbo......",
    ".ohhhkhbo......",
    ".ohhhlhbooooo..",
    ".ohhhhhbbhhhbo.",
    ".ohhhhbbbbbbbbo",
    ".odddddddddddbo",
    ".oSnSnSnSnSnSSo",
    "..ooooooooooooo",
]

def boot_img():
    c = Canvas(15, 12); c.grid(BOOT, BOOT_PAL); return c.image()[0]


def boots(big=False):
    """a hobnail ankle boot, toe to the right; the icon holds one in each of its two cells, the portrait the
    pair side by side, drawn larger"""
    if big:
        W, H = 36, 34; c = Canvas(W, H)
        x, y = np.mgrid[0:H, 0:W][1] + 0.5, np.mgrid[0:H, 0:W][0] + 0.5
        for x0 in (1, 19):
            shaft = rrect(W, H, x0, 2, x0 + 9, 32, 2); foot = rrect(W, H, x0, 22, x0 + 16, 32, 2)
            m = shaft | foot
            shade(c, m, BOOT_PAL["H"], BOOT_PAL["h"], BOOT_PAL["b"], 1, 1)
            c.paint(lit_band(m, 1, 1, 1), BOOT_PAL["d"])
            c.paint(m & (y > 29.5), BOOT_PAL["S"])
            for px in range(x0 + 1, x0 + 15, 2): c.px(px, 30, BOOT_PAL["n"])
            for py in range(5, 21, 3): c.px(x0 + 4, py, BOOT_PAL["l"]); c.px(x0 + 3, py + 1, BOOT_PAL["k"])
            c.paint(m & (y < 4) & (y >= 2), BOOT_PAL["H"])
        c.outline()
        im, (x0, y0) = c.image()
        return im, (18 - x0, 20 - y0)
    b = boot_img()
    out = Image.new("RGBA", (b.width, 19 + b.height), (0, 0, 0, 0))   # one boot per bag cell, 19 px apart
    out.alpha_composite(b, (0, 0)); out.alpha_composite(b, (0, 19))
    return out, (7, 17)


def belt(big=False):
    """the rope belt coiled: a loop with the knot at the front and the two ends hanging"""
    W, H = (34, 34) if big else (34, 15); c = Canvas(W, H)
    x, y = np.mgrid[0:H, 0:W][1] + 0.5, np.mgrid[0:H, 0:W][0] + 0.5
    if big:
        ring = ellipse(W, H, 17, 14, 14, 9) & ~ellipse(W, H, 17, 14, 10.5, 6)
        ends = (np.abs(x - 13 - 0.8 * np.sin(y / 3)) < 1.3) & (y > 20) & (y < 32) | (np.abs(x - 20 + 0.8 * np.sin(y / 3)) < 1.3) & (y > 20) & (y < 31)
        knot = ellipse(W, H, 16.5, 21, 3.5, 2.5)
    else:
        ring = ellipse(W, H, 17, 6.5, 14.5, 5) & ~ellipse(W, H, 17, 6.5, 11.5, 2.8)
        ends = (np.abs(x - 14 - 0.7 * np.sin(y / 2)) < 1.0) & (y > 8) & (y < 14) | (np.abs(x - 19.5 + 0.7 * np.sin(y / 2)) < 1.0) & (y > 8) & (y < 13.5)
        knot = ellipse(W, H, 16.5, 9, 3, 2)
    m = ring | ends
    shade(c, m, ROPE["hi"], ROPE["base"], ROPE["sh"], 1, 1)
    c.paint(lit_band(m, 1, 1, 1), ROPE["dk"])
    # the twist: a diagonal dark pixel every third
    xi, yi = np.floor(x).astype(int), np.floor(y).astype(int)
    c.paint(m & ((xi + yi) % 3 == 0) & ~lit_band(m, 1, -1, -1), ROPE["sh"])
    shade(c, knot, ROPE["hi"], ROPE["base"], ROPE["sh"], 1, 1)
    c.paint(lit_band(knot, 1, 1, 1), ROPE["dk"])
    c.outline()
    im, (x0, y0) = c.image()
    return im, (17 - x0, (14 if big else 7) - y0)


def small_sack():
    """the burlap sack: a tied neck, a shoulder strap, the cloth bulging at the bottom"""
    W, H = 34, 34; c = Canvas(W, H)
    x, y = np.mgrid[0:H, 0:W][1] + 0.5, np.mgrid[0:H, 0:W][0] + 0.5
    body = ellipse(W, H, 17, 22, 13.5, 11) | rrect(W, H, 7, 9, 27, 24, 3)
    neck = rect(W, H, 11, 3, 23, 10)
    m = body | neck
    shade(c, m, SACK["hi"], SACK["base"], SACK["sh"], 2, 2)
    c.paint(lit_band(m, 1, 1, 1), SACK["dk"])
    # the weave: a sparse dark stitch
    xi, yi = np.floor(x).astype(int), np.floor(y).astype(int)
    c.paint(m & (hashn(xi // 2, yi // 2, 9) % 7 == 0) & (y > 11) & (y < 31) & (x > 9) & (x < 26), SACK["sh"])
    # the tie round the neck and the gathered top above it
    tie = rect(W, H, 10, 8, 24, 10)
    c.paint(tie, SACK["tie"]); c.paint(tie & (y < 9), "#7a5638")
    for px in range(12, 23, 2): c.px(px, 5, SACK["sh"]); c.px(px + 1, 4, SACK["hi"])
    # the strap: a leather loop from the neck over the sack's shoulder
    strap = (np.abs((x - 6) - (y - 6) * 0.0) < 1.5) & (y > 10) & (y < 20) & (x > 3)
    strap = ((np.abs(x - (3 + (y - 8) * 0.35)) < 1.2) & (y > 8) & (y < 26))
    c.paint(strap & ~neck, "#6c4b30"); c.paint(strap & ~neck & (x < 4.5), "#7a5638")
    c.outline()
    im, (x0, y0) = c.image()
    return im, (17 - x0, 18 - y0)
