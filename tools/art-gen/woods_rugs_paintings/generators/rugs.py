"""Two rugs (Michael, 2026-10-20): a bearskin and a regal red rug, 2 x 3 tiles along world Y, drawn flat in
world coordinates (a 64 x 96 top-down texture, one texel per world unit, like the floors) and projected
onto the ground plane. Decoration: no outline. Anchor: the footprint's top tile's top vertex (world 0, 0)."""
import json, os
import numpy as np
from PIL import Image

D = os.path.dirname(os.path.abspath(__file__)); OUT = os.path.join(D, "..", "out", "rugs"); os.makedirs(OUT, exist_ok=True)
WX, WY = 64, 96


def hx(s): s = s.lstrip("#"); return np.array([int(s[i:i + 2], 16) for i in (0, 2, 4)], np.uint8)


def hashn(x, y, s=0):
    v = (x.astype(np.int64) * 73856093) ^ (y.astype(np.int64) * 19349663) ^ (s * 83492791)
    v = (v ^ (v >> 13)) * 1274126177
    return (v ^ (v >> 16)) & 0xFFFF


def world_grid():
    yy, xx = np.mgrid[0:WY, 0:WX]; return xx + 0.5, yy + 0.5


class Tex:
    def __init__(self):
        self.col = np.zeros((WY, WX, 3), np.uint8); self.a = np.zeros((WY, WX), bool)
    def paint(self, m, c): self.col[m] = hx(c); self.a[m] = True


def project(tex):
    """the texture (X across, Y along) onto the screen: sx = X - Y, sy = (X + Y) / 2, sampled per screen pixel"""
    W, H = WX + WY, (WX + WY) // 2
    out = np.zeros((H, W, 4), np.uint8)
    sy, sx = np.mgrid[0:H, 0:W]
    sxw = sx + 0.5 - WY          # screen x with the top vertex at x = WY (the rug extends WY to the left)
    syw = sy + 0.5
    X = syw + sxw / 2; Y = syw - sxw / 2
    xi = np.floor(X).astype(int); yi = np.floor(Y).astype(int)
    ok = (xi >= 0) & (xi < WX) & (yi >= 0) & (yi < WY)
    xs, ys = xi[ok], yi[ok]
    a = tex.a[ys, xs]
    out[ok, :3] = tex.col[ys, xs]; out[ok, 3] = a * 255
    return Image.fromarray(out, "RGBA"), (WY, 0)


def bearskin():
    t = Tex(); x, y = world_grid()
    xi, yi = np.floor(x).astype(int), np.floor(y).astype(int)
    cx, cy = 32, 54
    rag = (hashn(xi // 3, yi // 3, 1) % 5) * 0.6
    body = ((x - cx) / (21 - rag)) ** 2 + ((y - cy) / (27 - rag)) ** 2 <= 1
    head = ((x - cx) / 10.5) ** 2 + ((y - 20) / 9) ** 2 <= 1
    snout = ((x - cx) / 5.5) ** 2 + ((y - 11) / 4.5) ** 2 <= 1
    ears = (((x - (cx - 9.5)) / 3.5) ** 2 + ((y - 13) / 3.5) ** 2 <= 1) | (((x - (cx + 9.5)) / 3.5) ** 2 + ((y - 13) / 3.5) ** 2 <= 1)
    paws = np.zeros_like(body); toes = np.zeros_like(body)
    def capsule(ax, ay, bx, by, r):
        dx, dy = bx - ax, by - ay; l2 = dx * dx + dy * dy
        h = np.clip(((x - ax) * dx + (y - ay) * dy) / l2, 0, 1)
        return (x - (ax + dx * h)) ** 2 + (y - (ay + dy * h)) ** 2 <= r * r
    for (px, py, bx, by) in ((11, 36, 24, 42), (53, 36, 40, 42), (10, 76, 24, 68), (54, 76, 40, 68)):
        paws |= capsule(bx, by, px, py, 4.5) | (((x - px) / 6.5) ** 2 + ((y - py) / 5.5) ** 2 <= 1)
        sgn = -1 if px < cx else 1
        for k in (-1, 0, 1):
            toes |= ((x - (px + sgn * 6)) ** 2 + (y - (py + k * 3.8)) ** 2) <= 2.2
    m = body | head | snout | ears | paws | toes
    fur = {"edge": "#3a2a1d", "dark": "#4e3826", "mid": "#6e4f36", "light": "#8e6c4a", "belly": "#a08a66", "belly2": "#8e7050", "nose": "#2b2522"}
    t.paint(m, fur["mid"])
    t.paint(m & (hashn(xi // 2, yi // 4, 2) % 4 == 0), fur["dark"])
    t.paint(m & (hashn(xi // 3, yi // 2, 5) % 6 == 0), fur["light"])
    # darker toward the edge, the darkest tone along the silhouette itself (the fur's own edge, not an outline)
    inner = ((x - cx) / 17) ** 2 + ((y - cy) / 23) ** 2 <= 1
    t.paint(m & ~inner & ~head & ~snout & (hashn(xi, yi, 3) % 3 != 0), fur["dark"])
    p = np.pad(m, 1); rim = m & ~(p[:-2, 1:-1] & p[2:, 1:-1] & p[1:-1, :-2] & p[1:-1, 2:])
    t.paint(rim, fur["edge"])
    belly = ((x - cx) / 9) ** 2 + ((y - cy + 1) / 15) ** 2 <= 1
    t.paint(belly, fur["belly2"]); t.paint(belly & (hashn(xi // 2, yi // 3, 4) % 4 == 0), fur["belly"])
    # the head: dark ears with a lighter inner, a light snout, the nose, two eyes, the mouth line
    t.paint(head & ~rim, fur["mid"]); t.paint(head & (hashn(xi // 2, yi // 2, 6) % 5 == 0) & ~rim, fur["dark"])
    t.paint(ears & ~rim, fur["dark"])
    t.paint(snout, fur["light"]); t.paint(((x - cx) / 2.6) ** 2 + ((y - 8.5) / 1.8) ** 2 <= 1, fur["nose"])
    for ex in (cx - 4.5, cx + 4.5): t.paint((np.abs(x - ex) < 1.1) & (np.abs(y - 18) < 1.1), fur["nose"])
    t.paint((np.abs(x - cx) < 0.6) & (y > 9.5) & (y < 14), fur["dark"])
    t.paint(toes & ~rim, fur["dark"])
    return t


def regal_red():
    t = Tex(); x, y = world_grid()
    xi, yi = np.floor(x).astype(int), np.floor(y).astype(int)
    X0, X1, Y0, Y1 = 3, 61, 3, 93
    rug = (x > X0) & (x < X1) & (y > Y0) & (y < Y1)
    # a frayed corner and a nibbled edge
    rug &= ~((x < X0 + 6) & (y > Y1 - 7) & (hashn(xi, yi, 11) % 3 == 0))
    rug &= ~(((x < X0 + 1.5) | (x > X1 - 1.5) | (y < Y0 + 1.5) | (y > Y1 - 1.5)) & (hashn(xi, yi, 12) % 9 == 0))
    red, red2, gold, gold2, dk = "#7e1f1c", "#6a1a18", "#c39a44", "#8a6a2a", "#4a1210"
    t.paint(rug, red)
    weave = (hashn(xi, yi // 2, 13) % 6 == 0)
    t.paint(rug & weave, red2)
    # the border: a gold band 6 wide with a dark line inside and a trim of alternating dark diamonds
    d = np.minimum(np.minimum(x - X0, X1 - x), np.minimum(y - Y0, Y1 - y))
    border = rug & (d < 7)
    t.paint(border, gold)
    t.paint(rug & (d >= 6.5) & (d < 7.5), dk)
    t.paint(rug & (d < 1.5), gold2)
    along = np.where(np.minimum(x - X0, X1 - x) < np.minimum(y - Y0, Y1 - y), y, x)
    trim = border & (d > 2) & (d < 5.5) & ((np.floor(along).astype(int) % 6) < 3) & (np.abs(d - 3.75) < (np.floor(along) % 6) * 0.5 + 0.2)
    t.paint(trim, dk)
    t.paint(border & (d > 2) & (d < 5.5) & ((np.floor(along).astype(int) % 6) >= 3) & (np.abs(d - 3.75) < (5 - np.floor(along) % 6) * 0.5 + 0.2), red2)
    # the medallion: a lozenge with a gold outline, a smaller one inside, a dark heart
    cx, cy = 32, 48
    loz = (np.abs(x - cx) / 13 + np.abs(y - cy) / 20) <= 1
    loz_in = (np.abs(x - cx) / 10 + np.abs(y - cy) / 16) <= 1
    core = (np.abs(x - cx) / 4 + np.abs(y - cy) / 7) <= 1
    t.paint(loz, gold); t.paint(loz_in, red2); t.paint(loz_in & weave, red)
    t.paint((np.abs(x - cx) / 7 + np.abs(y - cy) / 11) <= 1, gold2)
    t.paint((np.abs(x - cx) / 6 + np.abs(y - cy) / 9.5) <= 1, red)
    t.paint(core, dk); t.paint((np.abs(x - cx) / 2 + np.abs(y - cy) / 3) <= 1, gold)
    # four small gold motifs in the field's corners
    for (mx, my) in ((16, 22), (48, 22), (16, 74), (48, 74)):
        t.paint((np.abs(x - mx) / 3 + np.abs(y - my) / 4.5) <= 1, gold2); t.paint((np.abs(x - mx) / 1.2 + np.abs(y - my) / 2) <= 1, gold)
    # wear: faded patches where feet go (toward the door end and the middle)
    worn = rug & ~border & (((x - 32) ** 2 / 90 + (y - 80) ** 2 / 40 <= 1) | ((x - 20) ** 2 / 60 + (y - 50) ** 2 / 90 <= 1))
    t.paint(worn & (hashn(xi, yi, 14) % 2 == 0) & ~loz, "#8e3a30")
    t.paint(worn & (hashn(xi // 2, yi, 15) % 7 == 0) & ~loz, "#a07060")
    return t


def rolled(kind):
    """the rug rolled up for the bag: a 1 x 4 icon, the roll standing, its end showing the spiral;
    the bearskin's head pokes out of the top of its roll"""
    W, H = 19, 76
    c = np.zeros((H, W, 4), np.uint8)
    def put(m, col): c[m, :3] = hx(col); c[m, 3] = 255
    yy, xx = np.mgrid[0:H, 0:W]; x, y = xx + 0.5, yy + 0.5
    if kind == "regal":
        tones = ("#8e3a30", "#7e1f1c", "#6a1a18", "#4a1210"); gold = ("#c39a44", "#8a6a2a"); top = 8
    else:
        tones = ("#8e6c4a", "#6e4f36", "#4e3826", "#3a2a1d"); gold = None; top = 18
    x0, x1 = 3, 16
    roll = (x >= x0) & (x < x1) & (y >= top) & (y < 72)
    put(roll, tones[1]); put(roll & (x < x0 + 3), tones[0]); put(roll & (x >= x1 - 4), tones[2]); put(roll & (x >= x1 - 1.5), tones[3])
    xi, yi = np.floor(x).astype(int), np.floor(y).astype(int)
    put(roll & (hashn(xi, yi // 3, 21) % 7 == 0) & (x > x0 + 2) & (x < x1 - 4), tones[2])
    if gold:
        put(roll & (y >= 68) & (y < 71), gold[0]); put(roll & (y >= 70) & (y < 71), gold[1])      # the border showing at the bottom edge
        put(roll & (y >= top) & (y < top + 2), gold[0])
    # the roll's end: an ellipse with the spiral
    cx, cy = (x0 + x1) / 2, top
    end = ((x - cx) / 6.5) ** 2 + ((y - cy) / 3) ** 2 <= 1
    put(end, tones[1]); 
    d = np.sqrt(((x - cx) / 6.5) ** 2 + ((y - cy) / 3) ** 2)
    put(end & (np.abs(d - 0.35) < 0.12), tones[3]); put(end & (np.abs(d - 0.7) < 0.12), tones[3]); put(end & (d > 0.88), tones[2])
    if gold: put(end & (np.abs(d - 0.7) < 0.12) & (y > cy), gold[1])
    # a cord round the roll
    put(roll & (y >= 40) & (y < 42), "#b8a67c"); put(roll & (y >= 41) & (y < 42) & (x > x1 - 4), "#8f7f5c")
    if kind == "bear":
        head = ((x - 9.5) / 5.5) ** 2 + ((y - 9) / 5) ** 2 <= 1
        put(head, "#6e4f36"); put(head & (hashn(xi, yi, 22) % 4 == 0), "#4e3826")
        for ex in (5.5, 13.5): put(((x - ex) ** 2 + (y - 5) ** 2) <= 3.2, "#4e3826")
        put(((x - 9.5) / 3) ** 2 + ((y - 12) / 2.2) ** 2 <= 1, "#8e6c4a"); put(((x - 9.5) / 1.5) ** 2 + ((y - 13) / 1) ** 2 <= 1, "#2b2522")
        for ex in (7.5, 11.5): put((np.abs(x - ex) < 0.8) & (np.abs(y - 8.5) < 0.8), "#2b2522")
    a = c[..., 3] > 0; p = np.pad(a, 1)
    ring = (p[:-2, 1:-1] | p[2:, 1:-1] | p[1:-1, :-2] | p[1:-1, 2:]) & ~a
    c[ring, :3] = hx("#2b2522"); c[ring, 3] = 255
    return Image.fromarray(c, "RGBA")


if __name__ == "__main__":
    anchors = {}
    for name, kind in (("rug_bearskin", "bear"), ("rug_regal_red", "regal")):
        ic = rolled(kind); ic.save(f"{OUT}/{name}_icon.png")
        anchors[name + "_icon"] = {"slot_cols_rows": [1, 4], "size": [19, 76], "drawn_from": "the rug rolled up, outlined as an item" + (", the bear's head out of the top" if kind == "bear" else "")}
    for name, fn in (("rug_bearskin", bearskin), ("rug_regal_red", regal_red)):
        im, anc = project(fn())
        a = np.array(im)[..., 3]; ys = np.where(a.any(1))[0]; xs = np.where(a.any(0))[0]
        im2 = im.crop((xs.min(), ys.min(), xs.max() + 1, ys.max() + 1)); anc = (anc[0] - int(xs.min()), anc[1] - int(ys.min()))
        im2.save(f"{OUT}/{name}.png"); anchors[name] = {"anchor_px": list(anc), "size": list(im2.size), "grip_px": [im2.width // 2, im2.height // 2], "footprint_cols_rows": [2, 3], "along": "y"}
        print(name, im2.size, anc)
    json.dump(anchors, open(f"{OUT}/anchors_rugs.json", "w"), indent=1)
