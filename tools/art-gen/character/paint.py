"""Painting garments for the slicer (docs/28): parts painted on the rig's template, one slot per file,
the garment alone, on the 4x grid. This module knows the bare body (part maps and joints exported from
tools/template.html), gives masks per part and along a limb, applies the engine's two-tone shade rule,
and writes 768 x 576 PNGs."""
import json, os
import numpy as np
from PIL import Image

D = os.path.dirname(os.path.abspath(__file__)); OUT = D + "/out"
FW, FH, S = 48, 72, 4
FACINGS = ["s", "sw", "w", "nw", "n", "ne", "e", "se"]
PART = {"legL": 1, "legR": 2, "torso": 3, "armL": 4, "armR": 5, "head": 6}
OUTLINE = "#1a1420"
_d = json.load(open(OUT + "/partmaps.json"))
MAPS = {f: np.array(_d["maps"][f]).reshape(FH, FW) for f in FACINGS}
JOINTS = {f: {k: (24 + v["x"], 66 + v["y"]) for k, v in _d["joints"][f].items() if isinstance(v, dict) and "x" in v} for f in FACINGS}
BODY = {f: MAPS[f] > 0 for f in FACINGS}
_body_img = np.array(Image.open(OUT + "/body_1x.png"))
def body_rgba(f):
    i = FACINGS.index(f); return _body_img[(i // 4) * FH:(i // 4 + 1) * FH, (i % 4) * FW:(i % 4 + 1) * FW]

def hx(s): s = s.lstrip("#"); return tuple(int(s[i:i + 2], 16) for i in (0, 2, 4))
def shade(c, k=0.16): return tuple(int(v * (1 - k)) for v in hx(c))
def hexs(c): return "#%02x%02x%02x" % c

SEG = {"torso": ("neck", "hip"), "armL": ("shoulderL", "handL"), "armR": ("shoulderR", "handR"),
       "legL": ("hipL", "footL"), "legR": ("hipR", "footR")}

def mask(f, part): return MAPS[f] == PART[part]
def tparam(f, part):
    """t along the part's segment (0 at the anchor, 1 at the far joint) for every pixel centre."""
    a, b = (JOINTS[f][k] for k in SEG[part])
    yy, xx = np.mgrid[0:FH, 0:FW]; px, py = xx + 0.5, yy + 0.5
    dx, dy = b[0] - a[0], b[1] - a[1]; l2 = dx * dx + dy * dy or 1
    return ((px - a[0]) * dx + (py - a[1]) * dy) / l2
def along(f, part, t0, t1):
    t = tparam(f, part); return mask(f, part) & (t >= t0) & (t < t1)
def rows(f, part, y0, y1): return mask(f, part) & (np.arange(FH)[:, None] >= y0) & (np.arange(FH)[:, None] < y1)
def near(f): return "L" if JOINTS[f]["shoulderL"][1] >= JOINTS[f]["shoulderR"][1] else "R"   # the arm nearer the camera

class Layer:
    """One garment: eight 48 x 72 RGBA frames."""
    def __init__(self): self.px = {f: np.zeros((FH, FW, 4), np.uint8) for f in FACINGS}
    def paint(self, f, m, colour):
        c = hx(colour) if isinstance(colour, str) else colour
        self.px[f][m, :3] = c; self.px[f][m, 3] = 255
    def two_tone(self, f, m, light, dark, share=0.4):
        """The engine's rule: the right-hand share of each row run of the mask goes dark."""
        self.paint(f, m, light)
        for y in range(FH):
            xs = np.where(m[y])[0]
            if len(xs) == 0: continue
            for run in np.split(xs, np.where(np.diff(xs) > 1)[0] + 1):
                n = int(len(run) * share)
                for x in run[len(run) - n:]: self.paint(f, _one(x, y), dark)
    def outline_past_body(self, f, m):
        """A one-pixel outline where the garment extends past the body's silhouette."""
        p = np.pad(m, 1)
        ring = ~m & (p[:-2, 1:-1] | p[2:, 1:-1] | p[1:-1, :-2] | p[1:-1, 2:]) & ~BODY[f]
        self.paint(f, ring, OUTLINE)
    def erase(self, f, m): self.px[f][m] = 0
    def mirror_into(self, src, dst):
        """dst facing = src facing mirrored left-right (x -> 47 - x)."""
        self.px[dst] = self.px[src][:, ::-1].copy()
    def sheet(self):
        out = Image.new("RGBA", (FW * 4, FH * 2))
        for i, f in enumerate(FACINGS): out.paste(Image.fromarray(self.px[f], "RGBA"), ((i % 4) * FW, (i // 4) * FH))
        return out
    def save(self, name, folder=OUT + "/layers"):
        os.makedirs(folder, exist_ok=True)
        sh = self.sheet(); sh.resize((sh.width * S, sh.height * S), Image.NEAREST).save(f"{folder}/{name}.png")
        return f"{folder}/{name}.png"
    def preview(self, name, folder=OUT + "/previews"):
        """The garment over the bare body at 4x, for a quick look before the slicer."""
        os.makedirs(folder, exist_ok=True)
        out = Image.new("RGBA", (FW * 4, FH * 2), (143, 160, 122, 255))
        for i, f in enumerate(FACINGS):
            b = Image.fromarray(body_rgba(f).copy(), "RGBA"); g = Image.fromarray(self.px[f], "RGBA")
            b.alpha_composite(g); out.paste(b, ((i % 4) * FW, (i // 4) * FH), b)
        out.resize((out.width * S, out.height * S), Image.NEAREST).save(f"{folder}/{name}.png")

def _one(x, y):
    m = np.zeros((FH, FW), bool); m[y, x] = True; return m

def grid(f_rows, ox, oy, pal):
    """An ASCII grid at (ox, oy) -> {colour: mask}; '.' empty."""
    out = {}
    for y, r in enumerate(f_rows):
        for x, ch in enumerate(r):
            if ch == ".": continue
            c = pal[ch]; out.setdefault(c, np.zeros((FH, FW), bool))[oy + y, ox + x] = True
    return out

def paint_grid(L, f, f_rows, ox, oy, pal):
    for c, m in grid(f_rows, ox, oy, pal).items(): L.paint(f, m, c)

def mirror_rows(f_rows):
    w = max(len(r) for r in f_rows); return [r.ljust(w, ".")[::-1] for r in f_rows]

MIRRORS = {"e": "w", "se": "sw", "ne": "nw"}
def finish_mirrors(L):
    for dst, src in MIRRORS.items(): L.mirror_into(src, dst)
