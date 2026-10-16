"""Laid floors: wood planks and flagstones, 64x32 diamonds, 4 variants each.
Every pixel is mapped back to world (X, Y) in [0, 32) and patterned there, so planks and joints
line up across every diamond edge into any neighbouring variant.
"""
import os
import numpy as np
from PIL import Image
from iso3d import hx, hsh

D = os.path.dirname(os.path.abspath(__file__))
OUT = D + "/out/village"; os.makedirs(OUT, exist_ok=True)


def world_grid():
    py, px = np.mgrid[0:32, 0:64]
    sx, sy = px + 0.5 - 32, py + 0.5
    X, Y = sy + sx / 2, sy - sx / 2
    m = (X >= 0) & (X < 32) & (Y >= 0) & (Y < 32)
    return X, Y, m


ROWS = ["#5e452f", "#654a32", "#59412c", "#62482f"]   # plank tone per row (same in every variant -> seamless)
GAP, GRAIN, HI, NAIL, KNOT = "#3a2a1c", "#523c28", "#6e5238", "#2e2218", "#45321f"


def wood_floor(v):
    X, Y, m = world_grid()
    xi, yi = np.floor(X).astype(int), np.floor(Y).astype(int)
    row = yi // 8; ry = yi % 8
    out = np.zeros((32, 64, 3), np.uint8)
    for r in range(4): out[row == r] = hx(ROWS[r])
    out[(ry == 1)] = np.clip(out[(ry == 1)].astype(int) + 10, 0, 255).astype(np.uint8)    # lit plank edge
    g = (hsh(row, xi // 3, ry, v) % 9 == 0) & (ry > 1) & (ry < 7)
    out[g] = hx(GRAIN)
    out[ry == 0] = hx(GAP)
    # end joints: each variant puts 0-1 butt joint per plank row at its own X
    rng = np.random.default_rng(100 + v)
    for r in range(4):
        if rng.random() < 0.75:
            jx = int(rng.integers(5, 28))
            j = (row == r) & (xi == jx) & (ry > 0)
            out[j] = hx(GAP)
            for dx in (-2, 2):
                out[(row == r) & (xi == jx + dx) & ((ry == 2) | (ry == 6))] = hx(NAIL)
        if rng.random() < 0.3:
            kx = int(rng.integers(4, 28)); ky = int(rng.integers(3, 6))
            out[(row == r) & ((xi == kx) | (xi == kx + 1)) & (ry == ky)] = hx(KNOT)
    rgba = np.zeros((32, 64, 4), np.uint8); rgba[..., :3] = out; rgba[..., 3] = m * 255
    rgba[~m] = 0
    return Image.fromarray(rgba, "RGBA")


FLAG = ["#7b7670", "#736e68", "#827d76", "#77726c", "#6e6964"]
MORTAR, BEV_HI, BEV_LO, CRACK = "#4a453f", "#908a82", "#615c57", "#57524c"
LAYOUTS = [
    [(0, 0, 32, 32)],                                                    # one big slab
    [(0, 0, 16, 32), (16, 0, 32, 18), (16, 18, 32, 32)],
    [(0, 0, 20, 14), (20, 0, 32, 14), (0, 14, 12, 32), (12, 14, 32, 32)],
    [(0, 0, 32, 12), (0, 12, 18, 32), (18, 12, 32, 32)],
]


def flag_floor(v):
    X, Y, m = world_grid()
    xi, yi = np.floor(X).astype(int), np.floor(Y).astype(int)
    out = np.zeros((32, 64, 3), np.uint8)
    for k, (x0, y0, x1, y1) in enumerate(LAYOUTS[v]):
        r = (xi >= x0) & (xi < x1) & (yi >= y0) & (yi < y1)
        out[r] = hx(FLAG[int(hsh(v, k, 3)) % len(FLAG)])
        out[r & ((xi == x0 + 1) | (yi == y0 + 1))] = hx(BEV_HI)          # upper rims catch the light
        out[r & ((xi == x1 - 1) | (yi == y1 - 1))] = hx(BEV_LO)          # lower rims in shade
        out[r & ((xi == x0) | (yi == y0))] = hx(MORTAR)                  # joints (tile edges are always joints)
        # a crack or a chipped corner on some slabs
        if hsh(v, k, 8) % 3 == 0 and x1 - x0 > 12:
            cx = (x0 + x1) // 2; cy = y0 + 3
            for i in range(min(6, y1 - y0 - 4)):
                out[r & (xi == cx + (i // 2)) & (yi == cy + i)] = hx(CRACK)
        if hsh(v, k, 9) % 4 == 0:
            out[r & (xi <= x0 + 2) & (yi <= y0 + 2) & ((xi - x0) + (yi - y0) <= 3)] = hx(MORTAR)
    rgba = np.zeros((32, 64, 4), np.uint8); rgba[..., :3] = out; rgba[..., 3] = m * 255
    rgba[~m] = 0
    return Image.fromarray(rgba, "RGBA")


def tile_test(kind, fn, n=4, N=5):
    tiles = [fn(v) for v in range(n)]
    W, H = N * 64 + 64, N * 32 + 32
    img = Image.new("RGBA", (W, H), (30, 30, 30, 255))
    rng = np.random.default_rng(1)
    for i in range(N):
        for j in range(N):
            t = tiles[rng.integers(0, n)]
            x = (i - j) * 32 + W // 2 - 32; y = (i + j) * 16 + 8
            img.alpha_composite(t, (x, y))
    return img


if __name__ == "__main__":
    for v in range(4):
        wood_floor(v).save(f"{OUT}/floor_wood_{v}.png")
        flag_floor(v).save(f"{OUT}/floor_stone_{v}.png")
    a = tile_test("wood", wood_floor); b = tile_test("stone", flag_floor)
    c = Image.new("RGBA", (a.width * 2 + 10, a.height), (30, 30, 30, 255)); c.alpha_composite(a, (0, 0)); c.alpha_composite(b, (a.width + 10, 0))
    c.save(f"{D}/out/t_floors.png"); c.resize((c.width * 3, c.height * 3), Image.NEAREST).save(f"{D}/out/t_floors3.png")
    print("ok")
