"""Tree sprites v2: drawn natively at final in-game size (1.5x the v1 footprint).

Pixel-level features (1px outline, edge bumps, leaf dashes, glints, bark cracks) keep their
absolute pixel size; the larger canvas is spent on more canopy clumps, more highlights,
more hanging clusters and more bark detail. Nothing is upscaled.
"""
import numpy as np, random, os
from PIL import Image
from trees import RAMPS, TRUNK, TRUNK_GLOOM, GLOOM, Canvas, erode, shift, jit

OUT = os.path.dirname(os.path.abspath(__file__)) + "/out/trees_v2"
os.makedirs(OUT, exist_ok=True)

#                 canvas W, canopy+trunk H, trunk width
SIZES_OAK   = {"S": (80, 92, 14),  "M": (110, 132, 19), "L": (150, 184, 26)}
SIZES_SPIRE = {"S": (66, 101, 11), "M": (88, 148, 15),  "L": (122, 204, 20)}
DEPTH       = {"S": 4, "M": 5, "L": 7}          # shadow-mass band (a form feature, so it grows a little)
EXTRA_OAK   = {"S": 5, "M": 9, "L": 14}         # extra small clumps on top of the 7 main lobes
EXTRA_SPIRE = {"S": 1, "M": 2, "L": 3}          # extra clumps per tier
BOTTOM_PAD  = 6                                  # transparent rows below the trunk base (spec)
TOP_PAD     = 24                                 # working headroom so crowns never clip


class Canvas2(Canvas):
    def canopy(self, lobes, ramp, rng, depth):
        U = super().canopy(lobes, ramp, rng, depth)
        # the base class adds 2-3 hanging clusters; bigger canopies get proportionally more
        outline, shadow = ramp[0], ramp[1]
        for _ in range(max(0, self.w // 30 - 2)):
            x = rng.randrange(int(self.w * 0.22), int(self.w * 0.78))
            col = np.where(U[:, x])[0]
            if len(col) == 0: continue
            blob = self.E(x, col.max() + 1, rng.choice((2, 3)), rng.choice((2, 2.5)))
            self.paint(blob & ~U, outline); self.paint(erode(blob) & ~U, shadow); U |= blob
        return U

    def trunk(self, cx, top, bottom, width, rng, canopy_mask, ramp=TRUNK):
        o, dark, base, light = ramp
        mask = super().trunk(cx, top, bottom, width, rng, canopy_mask, ramp)
        inner = mask & shift(mask, 1, 0) & shift(mask, -1, 0) & shift(mask, 0, -1)
        h = bottom - top
        # extra bark cracks, same 1px x 2-4px size as before, count scales with area
        for _ in range(h * width // 40):
            y = rng.randrange(top + 2, bottom - 4)
            row = np.where(inner[y])[0]
            if len(row) < 3: continue
            x = rng.randrange(row.min() + 1, row.max())
            for dy in range(rng.choice((2, 3, 4))):
                if inner[y + dy, x]: self.px[y + dy, x] = (*dark, 255)
        # short horizontal bark notches (2px), lit side gets a light notch
        for _ in range(h // 10):
            y = rng.randrange(top + 3, bottom - 4)
            row = np.where(inner[y])[0]
            if len(row) < 5: continue
            x = rng.randrange(row.min() + 1, row.max() - 2)
            col = light if x < (row.min() + row.max()) / 2 - 1 else dark
            self.px[y, x:x + 2] = (*col, 255)
        # a knot on the larger trunks: dark 3x2 core with a light lip above
        if width >= 18:
            for _ in range(1 if width < 24 else 2):
                y = rng.randrange(top + h // 4, top + 2 * h // 3)
                row = np.where(inner[y])[0]
                x = rng.randrange(row.min() + 3, row.max() - 4)
                self.px[y:y + 2, x:x + 3] = (*o, 255)
                self.px[y - 1, x:x + 3] = (*light, 255)
                self.px[y + 2, x + 1:x + 3] = (*dark, 255)
        return mask

    def image(self, trunk_mask):
        """Tight crop, trunk base centred horizontally, BOTTOM_PAD rows below the trunk."""
        a = self.px[:, :, 3] > 0
        ys = np.where(a.any(axis=1))[0]
        bottom = np.where(trunk_mask.any(axis=1))[0].max()
        base_row = np.where(trunk_mask[bottom])[0]
        centre = (base_row.min() + base_row.max() + 1) / 2
        xs = np.where(a.any(axis=0))[0]
        half = max(centre - xs.min(), xs.max() + 1 - centre)
        x0, x1 = int(np.floor(centre - half)), int(np.ceil(centre + half))   # width parity follows the trunk
        crop = np.zeros((bottom + 1 - ys.min() + BOTTOM_PAD, x1 - x0, 4), np.uint8)
        src = self.px[ys.min():bottom + 1, max(0, x0):min(self.w, x1)]
        crop[:src.shape[0], max(0, -x0):max(0, -x0) + src.shape[1]] = src
        return Image.fromarray(crop, "RGBA")


def trunk_ramp(color): return TRUNK_GLOOM if color in GLOOM else TRUNK


def oak(size, color, seed):
    W, H, tw = SIZES_OAK[size]
    rng = random.Random(seed)
    c = Canvas2(W + 8, H + TOP_PAD); ramp = RAMPS[color]
    cx = (W + 8) / 2; cr = W * 0.5 - 1.5
    cb = TOP_PAD + H * 0.74
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
    # extra small clumps: on the crown's surface, front-most last so they sit on top
    for k in range(EXTRA_OAK[size]):
        ang = rng.uniform(-np.pi * 0.95, np.pi * 0.15)          # mostly upper half and sides
        rad = rng.uniform(0.55, 0.85)
        ex = cx + np.cos(ang) * cr * rad * 0.95
        ey = (cb - cr * 0.85) + np.sin(ang) * cr * rad * 0.75
        lobes.append((ex, ey, J(cr * rng.uniform(0.22, 0.30)), J(cr * rng.uniform(0.19, 0.25))))
    c.no_arc = set(range(7, len(lobes)))
    U = np.zeros((c.h, c.w), bool)
    for l in lobes: U |= c.E(*l)
    tm = c.trunk(int(cx), TOP_PAD + int(H * 0.5), TOP_PAD + H, tw, rng, U, trunk_ramp(color))
    c.canopy(lobes, ramp, rng, DEPTH[size])
    return c.image(tm)


def spire(size, color, seed):
    W, H, tw = SIZES_SPIRE[size]
    rng = random.Random(seed)
    c = Canvas2(W + 8, H + TOP_PAD); ramp = RAMPS[color]
    cx = (W + 8) / 2; hw = W * 0.5 - 1.5
    cb = TOP_PAD + H * 0.78
    J = lambda v: jit(rng, v, 0.10)
    tiers = [(cb - hw*0.40, 1.00, hw*0.44), (cb - hw*1.05, 0.86, hw*0.42),
             (cb - hw*1.68, 0.66, hw*0.40), (cb - hw*2.24, 0.44, hw*0.36)]
    lobes = []
    for (cy, wf, ry) in tiers:
        rx = hw * wf; ox = rng.uniform(-hw*0.08, hw*0.08)
        tier = [(cx + ox - rx*0.42, cy + ry*0.05, J(rx*0.64), J(ry)),
                (cx + ox + rx*0.42, cy + ry*0.05, J(rx*0.64), J(ry))]
        for _ in range(EXTRA_SPIRE[size]):                        # small clumps along the tier's skirt
            t = rng.uniform(-0.8, 0.8)
            tier.append((cx + ox + t * rx * 0.7, cy + ry * rng.uniform(0.15, 0.4),
                         J(rx * 0.30), J(ry * 0.48)))
        tier.append((cx + ox, cy - ry*0.18, J(rx*0.68), J(ry*0.96)))
        lobes += tier
    U = np.zeros((c.h, c.w), bool)
    for l in lobes: U |= c.E(*l)
    tm = c.trunk(int(cx), TOP_PAD + int(H * 0.45), TOP_PAD + H, tw, rng, U, trunk_ramp(color))
    c.canopy(lobes, ramp, rng, DEPTH[size])
    return c.image(tm)


TARGET = {"oak_S": (84, 104), "oak_M": (114, 144), "oak_L": (156, 197),
          "spire_S": (72, 114), "spire_M": (96, 156), "spire_L": (132, 213)}

def build_all():
    sprites = {}
    for color in RAMPS:
        for size in ("S", "M", "L"):
            for name, fn in (("oak", oak), ("spire", spire)):
                key = f"tree_{name}_{size}_{color}"
                tw, th = TARGET[f"{name}_{size}"]
                # same drawing rules, a few seeds; keep the one closest to the target footprint
                best = None
                for k in range(16):
                    im = fn(size, color, sum(map(ord, color + size + name)) + 1000 + 97 * k)
                    err = max(abs(im.width - tw), abs(im.height - th))
                    if best is None or err < best[0]: best = (err, im)
                    if err <= 2: break
                img = best[1]
                sprites[key] = img; img.save(f"{OUT}/{key}.png")
    return sprites


def character():
    """Scale stand-in: the player sprite at ~48px tall (spec: about 48 x 20)."""
    ch = Image.open(os.path.dirname(OUT) + "/character_s.png").convert("RGBA")
    a = np.array(ch)
    marker = (a[..., 0] > 170) & (a[..., 1] < 150) & (a[..., 3] > 0)   # editor's red pivot markers
    a[marker, :3] = (196, 160, 124)
    ch = Image.fromarray(a)
    return ch.resize((round(ch.width * 48 / ch.height), 48), Image.NEAREST)


def sheet(sprites, scale=1, bg=(75, 95, 61, 255), pad=12):
    cols = list(RAMPS); rows = [f"{n}_{s}" for s in ("S", "M", "L") for n in ("oak", "spire")]
    ch = character()
    cw = max(im.width for im in sprites.values()) + pad
    rh = {r: max(sprites[f"tree_{r}_{c}"].height for c in cols) + pad for r in rows}
    W = pad + cw * len(cols) + ch.width + pad * 2; H = pad + sum(rh.values())
    out = Image.new("RGBA", (W, H), bg); y = pad
    for r in rows:
        for i, cname in enumerate(cols):
            im = sprites[f"tree_{r}_{cname}"]
            out.alpha_composite(im, (pad + i*cw + (cw - pad - im.width)//2, y + rh[r] - pad - im.height))
        out.alpha_composite(ch, (pad + len(cols)*cw + pad, y + rh[r] - pad - ch.height - BOTTOM_PAD))
        y += rh[r]
    return out.resize((W*scale, H*scale), Image.NEAREST) if scale > 1 else out


if __name__ == "__main__":
    s = build_all()
    for k, im in s.items():
        a = np.array(im)[..., 3]; assert set(np.unique(a)) <= {0, 255}, k
    for shape_size, (tw, th) in TARGET.items():
        got = [s[f"tree_{shape_size}_{c}"].size for c in RAMPS]
        print(f"{shape_size:8s} target {tw}x{th}  got " + " ".join(f"{w}x{h}" for w, h in got))
    sheet(s).save(f"{OUT}/preview_1x.png"); sheet(s, 3).save(f"{OUT}/preview_3x.png")
