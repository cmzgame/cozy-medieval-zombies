"""Pixel-art tree sprite generator: 3 sizes x 2 silhouettes x 4 foliage colors."""
import numpy as np, random, os
from PIL import Image

OUT = os.path.dirname(os.path.abspath(__file__)) + "/out"
os.makedirs(OUT, exist_ok=True)

# foliage ramps: (outline, shadow, base, light, glint)
RAMPS = {
    "green":  ((26, 38, 28),  (56, 90, 50),  (88, 134, 70), (128, 170, 90), (176, 206, 120)),
    "yellow": ((54, 40, 18),  (156, 114, 38),(206, 164, 62),(232, 198, 96), (248, 230, 150)),
    "orange": ((58, 28, 14),  (146, 70, 28), (198, 108, 42),(230, 146, 66), (246, 190, 110)),
    "red":    ((48, 18, 16),  (112, 38, 28), (160, 58, 40), (196, 88, 58),  (226, 132, 90)),
    # gloom variants: low saturation, compressed value range, cool glints
    "blue":   ((14, 20, 30),  (36, 50, 66),  (58, 78, 98),  (82, 106, 126), (110, 138, 152)),
    "purple": ((18, 12, 28),  (46, 36, 62),  (74, 59, 94),  (100, 84, 122), (128, 112, 150)),
}
TRUNK = ((34, 22, 16), (62, 40, 28), (104, 72, 48), (138, 102, 68))  # outline, dark, base, light
TRUNK_GLOOM = ((16, 14, 22), (46, 42, 52), (78, 72, 84), (106, 100, 112))
GLOOM = {"blue", "purple"}

def ellipse(w, h, cx, cy, rx, ry):
    yy, xx = np.mgrid[0:h, 0:w]
    return ((xx - cx) / rx) ** 2 + ((yy - cy) / ry) ** 2 <= 1.0

def erode(m, n=1):
    for _ in range(n):
        p = np.pad(m, 1)
        m = m & p[:-2,1:-1] & p[2:,1:-1] & p[1:-1,:-2] & p[1:-1,2:]
    return m

def shift(m, dx, dy):
    out = np.zeros_like(m)
    h, w = m.shape
    a = abs(dx); b = abs(dy)
    src = m[(b if dy < 0 else 0):h-(b if dy > 0 else 0), (a if dx < 0 else 0):w-(a if dx > 0 else 0)]
    out[(b if dy > 0 else 0):h-(b if dy < 0 else 0), (a if dx > 0 else 0):w-(a if dx < 0 else 0)] = src
    return out

class Canvas:
    def __init__(self, w, h):
        self.w, self.h = w, h
        self.px = np.zeros((h, w, 4), np.uint8)
    def paint(self, mask, color):
        self.px[mask] = (*color, 255)
    def E(self, cx, cy, rx, ry):
        return ellipse(self.w, self.h, cx, cy, rx, ry)

    def canopy(self, lobes, ramp, rng, depth):
        """lobes: list of (cx, cy, rx, ry) back-to-front. depth: shadow band px."""
        outline, shadow, base, light, glint = ramp
        masks = [self.E(*l) for l in lobes]
        U = np.zeros((self.h, self.w), bool)
        for m in masks: U |= m
        # leafy bumps along the silhouette edge
        edge = U & ~erode(U)
        ys, xs = np.where(edge)
        for _ in range(len(ys) // 7):
            i = rng.randrange(len(ys)); r = rng.choice((1.5, 2, 2.5))
            U |= self.E(xs[i], ys[i], r, r)
        inner = erode(U)
        self.paint(U, outline)
        self.paint(inner, base)
        # shadow mass: everything the up-left-shifted silhouette doesn't cover (lower-right rim)
        rim = inner & (~shift(U, -depth, -int(depth * 1.6)) | ~shift(U, 0, -int(depth * 2.2)))
        self.paint(rim, shadow)
        # cluster separation: each lobe's lower boundary arc, drawn in shadow where it sits over other foliage
        for k, m in enumerate(masks):
            if k in getattr(self, "no_arc", ()): continue   # v2: extra clumps add silhouette + light only
            behind = np.zeros_like(U)
            for j in range(k): behind |= masks[j]
            arc = m & ~erode(m) & behind & ~rim
            cx, cy, rx, ry = lobes[k]
            yy, xx = np.mgrid[0:self.h, 0:self.w]
            lower = (yy > cy + ry * 0.12) & (np.abs(xx - cx) < rx * 0.92)
            self.paint(arc & lower & inner, shadow)
            # soft shadow beneath each arc (1px) for mass
            self.paint(shift(arc & lower, 0, 1) & inner & ~rim, shadow)
        # light mass: upper-left portions of the front lobes, pulled toward the light
        L = np.zeros_like(U)
        for (cx, cy, rx, ry) in lobes:
            L |= self.E(cx - rx * 0.25, cy - ry * 0.30, rx * 0.58, ry * 0.55)
        L &= inner & ~rim
        cur_shadow = (self.px[:, :, :3] == shadow).all(axis=2)
        L &= ~cur_shadow
        # keep light only where it is near an upper-left edge of some lobe (crescent), not a flat disc
        core = np.zeros_like(U)
        for (cx, cy, rx, ry) in lobes:
            core |= self.E(cx - rx * 0.02, cy - ry * 0.02, rx * 0.56, ry * 0.52)
        light_m = L & ~core
        self.paint(light_m, light)
        # glints: tiny specks on the top-left of the top lobes
        top_y = min(cy - ry for (_, cy, _, ry) in lobes)
        gl = light_m & (np.mgrid[0:self.h, 0:self.w][0] < top_y + (self.h * 0.22))
        gys, gxs = np.where(gl)
        for _ in range(max(2, len(gys) // 9)):
            i = rng.randrange(len(gys)); y, x = gys[i], gxs[i]
            for dx in range(rng.choice((1, 2, 3))):
                if x + dx < self.w and gl[y, x + dx]: self.px[y, x + dx] = (*glint, 255)
        # leaf texture: short dashes
        region = erode(inner, 2)
        rys, rxs = np.where(region)
        for _ in range(len(rys) // 70):
            i = rng.randrange(len(rys)); y, x = rys[i], rxs[i]
            cur = tuple(self.px[y, x, :3])
            col = {base: shadow, shadow: base, light: base}.get(cur)
            if col is None: continue
            for dx in range(rng.choice((2, 2, 3))):
                if x + dx < self.w and region[y, x + dx] and tuple(self.px[y, x + dx, :3]) == cur:
                    self.px[y, x + dx] = (*col, 255)
        # a few hanging leaf clusters under the canopy
        bot = np.where(U.any(axis=1))[0].max()
        for _ in range(rng.choice((2, 3))):
            x = rng.randrange(int(self.w * 0.25), int(self.w * 0.75))
            col = np.where(U[:, x])[0]
            if len(col) == 0: continue
            y = col.max()
            blob = self.E(x, y + 1, rng.choice((2, 3)), rng.choice((2, 2.5)))
            self.paint(blob & ~U, outline)
            self.paint(erode(blob) & ~U, shadow)
            U |= blob
        return U

    def trunk(self, cx, top, bottom, width, rng, canopy_mask, ramp=TRUNK):
        o, dark, base, light = ramp
        h = bottom - top
        mask = np.zeros((self.h, self.w), bool)
        for y in range(top, bottom):
            t = (y - top) / max(1, h - 1)
            extra = 0
            if t > 0.70: extra = 2
            if t > 0.84: extra = 4
            if t > 0.93: extra = 6
            w = width + extra
            x0 = int(round(cx - w / 2)); x1 = x0 + w
            mask[y, max(0, x0):min(self.w, x1)] = True
        inner = erode(mask)
        # top row of trunk isn't an outline (it's under the canopy)
        self.paint(mask, o)
        inner_full = mask & shift(mask, 1, 0) & shift(mask, -1, 0) & shift(mask, 0, -1)
        self.paint(inner_full, base)
        yy, xx = np.mgrid[0:self.h, 0:self.w]
        # left light strip and right dark strip
        for y in range(top, bottom - 1):
            row = np.where(inner_full[y])[0]
            if len(row) == 0: continue
            a, b = row.min(), row.max(); w = b - a + 1
            self.px[y, a:a + max(1, w // 4)] = (*light, 255)
            self.px[y, b - max(1, w // 3) + 1:b + 1] = (*dark, 255)
        # bark cracks
        for _ in range(max(3, h // 5)):
            y = rng.randrange(top + 2, bottom - 4)
            row = np.where(inner_full[y])[0]
            x = rng.randrange(row.min() + 1, row.max())
            for dy in range(rng.choice((2, 3, 4))):
                if inner_full[y + dy, x]: self.px[y + dy, x] = (*dark, 255)
        # canopy shadow on the trunk
        return mask

    def image(self):
        a = self.px[:, :, 3] > 0
        ys = np.where(a.any(axis=1))[0]; xs = np.where(a.any(axis=0))[0]
        return Image.fromarray(self.px[ys.min():ys.max()+1, xs.min():xs.max()+1], "RGBA")

# ---------------------------------------------------------------- silhouettes
SIZES_OAK   = {"S": (56, 66, 10), "M": (76, 92, 14), "L": (104, 126, 18)}
SIZES_SPIRE = {"S": (48, 74, 8),  "M": (64, 102, 11), "L": (88, 140, 15)}
DEPTH = {"S": 3, "M": 4, "L": 6}

def jit(rng, v, f=0.08):
    return v * (1 + rng.uniform(-f, f))

def oak(size, color, seed):
    W, H, tw = SIZES_OAK[size]
    rng = random.Random(seed)
    c = Canvas(W, H + 16); ramp = RAMPS[color]
    cx = W / 2; cr = W * 0.5 - 1.5
    cb = 16 + H * 0.74  # crown bottom
    J = lambda v: jit(rng, v)
    lobes = [
        (cx - cr*0.50, cb - cr*0.40, J(cr*0.50), J(cr*0.40)),
        (cx + cr*0.52, cb - cr*0.42, J(cr*0.48), J(cr*0.38)),
        (cx + cr*0.02, cb - cr*0.30, J(cr*0.56), J(cr*0.40)),
        (cx - cr*0.40, cb - cr*0.96, J(cr*0.54), J(cr*0.46)),
        (cx + cr*0.44, cb - cr*0.98, J(cr*0.52), J(cr*0.46)),
        (cx + cr*0.04, cb - cr*1.42, J(cr*0.58), J(cr*0.50)),
        (cx - cr*0.08, cb - cr*0.90, J(cr*0.52), J(cr*0.44)),
    ]
    U = np.zeros((H + 16, W), bool)
    for l in lobes: U |= c.E(*l)
    c.trunk(int(cx), 16 + int(H * 0.5), H + 16, tw, rng, U, TRUNK_GLOOM if color in GLOOM else TRUNK)
    c.canopy(lobes, ramp, rng, DEPTH[size])
    return c

def spire(size, color, seed):
    W, H, tw = SIZES_SPIRE[size]
    rng = random.Random(seed)
    c = Canvas(W, H + 16); ramp = RAMPS[color]
    cx = W / 2; hw = W * 0.5 - 1.5
    cb = 16 + H * 0.78
    J = lambda v: jit(rng, v, 0.10)
    tiers = [(cb - hw*0.40, 1.00, hw*0.44), (cb - hw*1.05, 0.86, hw*0.42),
             (cb - hw*1.68, 0.66, hw*0.40), (cb - hw*2.24, 0.44, hw*0.36)]
    lobes = []
    for (cy, wf, ry) in tiers:
        rx = hw * wf; ox = rng.uniform(-hw*0.08, hw*0.08)
        lobes.append((cx + ox - rx*0.42, cy + ry*0.05, J(rx*0.64), J(ry)))
        lobes.append((cx + ox + rx*0.42, cy + ry*0.05, J(rx*0.64), J(ry)))
        lobes.append((cx + ox, cy - ry*0.18, J(rx*0.68), J(ry*0.96)))
    U = np.zeros((H + 16, W), bool)
    for l in lobes: U |= c.E(*l)
    c.trunk(int(cx), 16 + int(H * 0.45), H + 16, tw, rng, U, TRUNK_GLOOM if color in GLOOM else TRUNK)
    c.canopy(lobes, ramp, rng, DEPTH[size])
    return c

def build_all():
    sprites = {}
    for color in RAMPS:
        for size in ("S", "M", "L"):
            for name, fn in (("oak", oak), ("spire", spire)):
                seed = sum(map(ord, color + size + name))
                img = fn(size, color, seed).image()
                sprites[f"tree_{name}_{size}_{color}"] = img
                img.save(f"{OUT}/tree_{name}_{size}_{color}.png")
    return sprites

def sheet(sprites, scale=1, bg=(75, 95, 61, 255), pad=12):
    cols = list(RAMPS); rows = [f"{n}_{s}" for s in ("S","M","L") for n in ("oak","spire")]
    cw = max(im.width for im in sprites.values()) + pad
    rh = {r: max(sprites[f"tree_{r}_{c}"].height for c in cols) + pad for r in rows}
    W = pad + cw * len(cols); H = pad + sum(rh.values())
    out = Image.new("RGBA", (W, H), bg)
    y = pad
    for r in rows:
        for i, cname in enumerate(cols):
            im = sprites[f"tree_{r}_{cname}"]
            x = pad + i*cw + (cw - pad - im.width)//2
            out.alpha_composite(im, (x, y + rh[r] - pad - im.height))
        y += rh[r]
    if scale > 1:
        out = out.resize((W*scale, H*scale), Image.NEAREST)
    return out

if __name__ == "__main__":
    s = build_all()
    sheet(s).save(f"{OUT}/sheet_1x.png")
    sheet(s, 3).save(f"{OUT}/sheet_3x.png")
    print("ok", len(s))
