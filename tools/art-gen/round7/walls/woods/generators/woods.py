"""The wood pass (Michael, 2026-10-20): one tone table for every wood-built piece, five woods derived
from the oak ramp, and a hex-for-hex swap that rewrites the shipped PNGs. Nothing is redrawn.

Every tone of the oak set has a role (plank lit, plank shade, gap, beam, leaf, frame, post ...). A wood
is a base colour; its ramp is the oak ramp carried over in Lab (each oak tone's offset from the oak base,
applied to the new base, the colour offsets halved for the pale and grey woods so they stay pale and grey).
`daub` is not a wood: it is the oak wall with the plank fills limewashed and the gaps kept as dark timbers."""
import json, os, sys, math
import numpy as np
from PIL import Image

D = os.path.dirname(os.path.abspath(__file__))
# 2026-10-27, docs/art/13: run on the new 96 px oak set. WOODS_REFS names a folder laid out as the repository
# (data/art/village/ with the oak PNGs, tools/art-gen/village/anchors_walls.json); WOODS_OUT the output. Nothing else changed.
REFS = os.environ.get("WOODS_REFS", os.path.join(D, "..", "refs"))
V = os.path.join(REFS, "data", "art", "village")
OUT = os.environ.get("WOODS_OUT", os.path.join(D, "..", "out", "woods")); os.makedirs(OUT, exist_ok=True)

OAK_BASE = "#6e4b32"
WOODS = {"oak": "#6e4b32", "spruce": "#a0845a", "mahogany": "#6e3424", "winterpine": "#b4ad9f", "bloodbark": "#561a1e"}
CHROMA = {"oak": 1.0, "spruce": 0.8, "mahogany": 1.0, "winterpine": 0.35, "bloodbark": 1.0}   # how much of the oak's hue spread each keeps

# the oak set's tones by role (village.py: WOOD, FRAME, wood_post_sh, DOORW). the leaf roles are the door and
# shutter wood (#5e4028), drawn one shade darker than the wall so a door reads against its own wall.
ROLES = {
    "wall_plank_top": ["#8c6646", "#86603f"], "wall_grain_top": ["#78573a"], "wall_gap_top": ["#5e412b"], "wall_beam_top": ["#7a5538"],
    "wall_plank_lit": ["#7a5538", "#724f33"], "wall_grain_lit": ["#664630"], "wall_gap_lit": ["#3e2a1c"], "wall_beam_lit": ["#5e402a"], "wall_beam_hi_lit": ["#6e4b32"],
    "wall_plank_shade": ["#523926", "#4c3523"], "wall_grain_shade": ["#422d1e"], "wall_gap_shade": ["#271a11"], "wall_beam_shade": ["#3c2a1b"], "wall_beam_hi_shade": ["#4a3322"],
    "frame_top": ["#8f6a48"], "frame_lit": ["#7d5a3c"], "frame_shade": ["#5f442d"],
    "post_lit": ["#664630"], "post_grain_lit": ["#5a3d27"], "post_shade": ["#4f3624"],
    "leaf_top": ["#7d5a3c", "#77553a"], "leaf_gap_top": ["#4a3322"], "leaf_grain_top": ["#6c4b30"],
    "leaf_lit": ["#6c4b30", "#654529"], "leaf_gap_lit": ["#3a2716"], "leaf_grain_lit": ["#5a3d25"],
    "leaf_shade": ["#513722", "#4b331f"], "leaf_gap_shade": ["#2c1d12"], "leaf_grain_shade": ["#432d1b"],
}
# tones that several roles share: the swap must give them one target, so they are listed once above
# (#7a5538 is both wall_plank_lit and wall_beam_top; #6e4b32 wall_beam_hi_lit and post; #4a3322 post_shade and leaf_gap_top ...)

LEAF_FILES = ["door_open_wood_north", "door_open_wood_west", "door_open_far_wood_north", "door_open_far_wood_west",
              "shutter_left_wood_north", "shutter_left_wood_west", "shutter_right_wood_north", "shutter_right_wood_west",
              "shutter_far_left_wood_north", "shutter_far_left_wood_west", "shutter_far_right_wood_north", "shutter_far_right_wood_west"]
WALL_FILES = [f"wall_wood_{o}_{v}" for o in ("north", "west") for v in ("plain", "door_shut", "door_open", "window_shut", "window_open")] + ["post_wood"]


def hx(s): s = s.lstrip("#"); return np.array([int(s[i:i + 2], 16) for i in (0, 2, 4)], float)
def hexs(c): c = np.clip(np.round(c), 0, 255).astype(int); return "#%02x%02x%02x" % tuple(c)


def rgb2lab(c):
    r, g, b = (c / 255.0)
    def lin(u): return u / 12.92 if u <= 0.04045 else ((u + 0.055) / 1.055) ** 2.4
    r, g, b = lin(r), lin(g), lin(b)
    X = (0.4124 * r + 0.3576 * g + 0.1805 * b) / 0.95047; Y = 0.2126 * r + 0.7152 * g + 0.0722 * b; Z = (0.0193 * r + 0.1192 * g + 0.9505 * b) / 1.08883
    def f(t): return t ** (1 / 3) if t > 0.008856 else 7.787 * t + 16 / 116
    fx, fy, fz = f(X), f(Y), f(Z)
    return np.array([116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)])


def lab2rgb(L):
    l, a, b = L
    fy = (l + 16) / 116; fx = fy + a / 500; fz = fy - b / 200
    def fi(t): return t ** 3 if t ** 3 > 0.008856 else (t - 16 / 116) / 7.787
    X, Y, Z = fi(fx) * 0.95047, fi(fy), fi(fz) * 1.08883
    r = 3.2406 * X - 1.5372 * Y - 0.4986 * Z; g = -0.9689 * X + 1.8758 * Y + 0.0415 * Z; b = 0.0557 * X - 0.2040 * Y + 1.0570 * Z
    def gam(u): u = max(0.0, min(1.0, u)); return 12.92 * u if u <= 0.0031308 else 1.055 * u ** (1 / 2.4) - 0.055
    return np.array([gam(r), gam(g), gam(b)]) * 255


def ramp(wood):
    """every oak tone carried to the wood: {oak hex: new hex}"""
    base = rgb2lab(hx(OAK_BASE)); nb = rgb2lab(hx(WOODS[wood])); k = CHROMA[wood]
    table = {}
    for role, tones in ROLES.items():
        for t in tones:
            d = rgb2lab(hx(t)) - base
            new = nb + np.array([d[0], d[1] * k, d[2] * k])
            table[t] = hexs(lab2rgb(new))
    return table


def daub_table():
    """limewash the plank fills, keep gaps and beams as the oak timbers, so the wall reads as timber frame and plaster"""
    t = {}
    lime = {"top": ["#ddd2b8", "#d6cbb0"], "lit": ["#cfc3a8", "#c6ba9f"], "shade": ["#9a9078", "#928870"]}
    grain = {"top": "#c8bca2", "lit": "#b8ac92", "shade": "#857b65"}
    for light in ("top", "lit", "shade"):
        for src, dst in zip(ROLES[f"wall_plank_{light}"], lime[light]): t[src] = dst
        t[ROLES[f"wall_grain_{light}"][0]] = grain[light]
    return t


def swap_image(im, table):
    a = np.array(im.convert("RGBA")); out = a.copy()
    for src, dst in table.items():
        s = hx(src).astype(int); dd = hx(dst).astype(int)
        m = (a[..., 0] == s[0]) & (a[..., 1] == s[1]) & (a[..., 2] == s[2]) & (a[..., 3] > 0)
        out[m, :3] = dd
    return Image.fromarray(out, "RGBA")


def build():
    tables = {w: ramp(w) for w in WOODS}; tables["daub"] = daub_table()
    json.dump({"base": WOODS, "chroma_kept": CHROMA, "roles": ROLES, "tables": tables},
              open(f"{OUT}/wood_tones.json", "w"), indent=1)
    anchors = json.load(open(f"{REFS}/tools/art-gen/village/anchors_walls.json"))
    out_anchors = {}
    for w, table in tables.items():
        if w == "oak": continue
        for name in WALL_FILES + (LEAF_FILES if w != "daub" else []):
            im = swap_image(Image.open(f"{V}/{name}.png"), table)
            new = name.replace("_wood_", f"_{w}_").replace("post_wood", f"post_{w}")
            im.save(f"{OUT}/{new}.png"); out_anchors[new] = anchors[name]
    json.dump(out_anchors, open(f"{OUT}/anchors_woods.json", "w"), indent=1)
    return tables


if __name__ == "__main__":
    t = build()
    for w in WOODS: print(w, WOODS[w], "->", t[w]["#7a5538"], t[w]["#523926"], t[w]["#3e2a1c"])
