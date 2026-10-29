"""Art round 10: cliffs. A cliff wall (wall_cliff: straight faces, back faces, corner pieces), its post (post_cliff),
the cliff-top floors (floor_cliff_top, rock; floor_cliff_grass, grass), and a stone ramp (stair_ramp_stone, n and w).
A grass-lipped set of the walls, corners and post (wall_cliff_grass, post_cliff_grass) rides along, for grassy hills.

Written fresh for this round (2026-10-28). The method is new here: the rock is a solid defined in world units
(an occupancy function of X, Y, Z), sampled on a half-unit voxel grid, its camera-facing surface splatted into a
z-buffer one voxel centre at a time, every pixel lit from a normal taken off the smoothed solid and coloured in a
few flat stepped tones. Curves (the rounded lip, the corners, the ramp's edges) come out as real geometry.

World units: X and Y along the ground (a tile is 32 x 32), Z height in screen pixels.
    screen x = X - Y,   screen y = (X + Y) / 2 - Z,   depth toward the camera = X + Y + Z
+X runs to the screen's lower right (shade), +Y to the lower left (lit), tops lightest (docs/art/01).

The hill's model (the brief, Michael 2026-10-28): cliff walls stand on the ground's tile edges (layer 0), 96 tall,
16 thick, centred on the edge line; the cliff-top floor (layer 1) lies on them. A wall's outer face is 8 out from the
edge line; its top is flat at 96 over the plateau side of the edge line and rounds over (a quarter round of radius 8,
the lip) from the edge line to the face, so the floor above meets the wall's top flush at the edge line and the lip
carries the rounding. The lip's profile is h = 88 + 8 sqrt(1 - s^2), s = dq / (dq + dF): dq the distance outside the
plateau's footprint, dF the distance inside the rock's face. At a corner the same formula bends the lip round.

Run with plain `python gen.py` (numpy, PIL). Deterministic. Writes out/, look/, manifest.json, preview.png.
"""
import json, math, os
import numpy as np
from PIL import Image, ImageDraw

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "out")
LOOK = os.path.join(HERE, "look")
REPO = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", "..", ".."))  # the repo root: tools/art-gen/roundN/name/   # read only
for d in (OUT, LOOK, os.path.join(OUT, "depth")):
    os.makedirs(d, exist_ok=True)

RES = 0.5          # voxel size, world units
STOREY = 96
LIP = 8            # the lip's radius
HALF = 8           # half the wall's thickness (16, as stone)
RO, RI = 20, 12    # an outer corner's radius at the face, an inner corner's (the cove)


def hx(s):
    s = s.lstrip("#")
    return np.array([int(s[i:i + 2], 16) for i in (0, 2, 4)], np.uint8)


def noise(*v):
    """a deterministic hash of integer arrays, 0..65535 (a 32-bit multiply-xorshift mix per input)"""
    M = np.uint64(0xFFFFFFFF)
    h = np.full(np.broadcast(*[np.asarray(a) for a in v]).shape, 0x3C6EF372, np.uint64)
    for i, a in enumerate(v):
        a = (np.asarray(a).astype(np.int64) & 0xFFFFFFFF).astype(np.uint64)
        h = h ^ ((a + np.uint64(0x9E3779B9 * (i + 1))) & M)
        h = (h * np.uint64(0x85EBCA6B)) & M
        h ^= h >> np.uint64(13)
        h = (h * np.uint64(0xC2B2AE35)) & M
        h ^= h >> np.uint64(16)
    return (h & np.uint64(0xFFFF)).astype(np.int64)


# ======================================================================== palettes
# bare grey rock, cool in the shade; a warmer grey-brown for some strata. Dark to light.
ROCK_A = [hx(c) for c in ("#2e2c30", "#3c393c", "#4b4849", "#5c5857", "#6e6a66", "#827c76", "#958e87", "#a59e94")]
ROCK_B = [hx(c) for c in ("#302c2b", "#3f3936", "#4f4844", "#615953", "#746b63", "#877d73", "#998f83", "#a99f92")]
GRASS = [hx(c) for c in ("#2a3824", "#34462c", "#405434", "#4b5f3d", "#586e44", "#687e4c")]
MOSS = [hx(c) for c in ("#3f4632", "#4e573b", "#5e6845")]
SOIL = [hx(c) for c in ("#2a1d14", "#3a2a1d", "#4a3524")]
LICHEN = hx("#7f8462")
BROWN_BANDS = (2, 5)

# ======================================================================== the strata (shared by every piece)
ZB = np.array([11, 24, 38, 50, 63, 77, 87], float)                 # bed boundaries; band k lies between ZB[k-1] and ZB[k]
RB = np.array([0.2, 1.6, 0.5, 2.1, 0.8, 1.8, 0.6, 0.2])           # each bed's recess from the face line (inward only)
CL = np.array([12, 9, 14, 10, 13, 11, 9, 8], float)                # lengths of the blocky facets per bed
SLANT = np.array([0.5, -0.6, 0.7, 0.4, -0.5, 0.6, -0.45, 0.3])     # the jointing leans, not plumb like masonry
NVAR = 24
_rng = np.random.default_rng(1028)
WAVES = _rng.uniform(-1, 1, (NVAR, len(ZB), 3)) * np.array([3.4, 1.5, 0.8])   # sin, sin 2, sin 3 amplitudes per boundary
CHOFF = _rng.uniform(0, 14, (NVAR, len(RB)))
LUMPS = _rng.uniform(0, 2 * math.pi, (NVAR, 4))
CRACKS = {v: [(float(_rng.uniform(7, 25)), float(_rng.uniform(4, 40)), float(_rng.uniform(46, 84)),
               float(_rng.uniform(0.6, 1.6)), float(_rng.uniform(0, 6))) for _ in range(2)] for v in range(NVAR)}


def bound_z(k, along, var):
    a = np.clip(along, 0, 32) / 32 * math.pi
    c = WAVES[var, k]
    return ZB[k] + c[0] * np.sin(a) + c[1] * np.sin(2 * a) + c[2] * np.sin(3 * a)


def face_bump(along, z, var):
    """inward displacement of the rock face (>= 0) at (along, z), and what the colouring needs to know.
    `along` runs 0..32 over a piece's edge; the waves and the windowed features vanish at 0 and 32, so any
    variant meets any other at a joint."""
    band = np.zeros(z.shape, int)
    bz = []
    for k in range(len(ZB)):
        zk = bound_z(k, along, var)
        bz.append(zk)
        band += (z >= zk)
    b = RB[band].copy()
    b += 2.2 * np.clip(z / STOREY, 0, 1) ** 1.3                      # the face leans back a little as it rises
    win = np.clip(np.minimum(along, 32 - along) / 3.0, 0, 1)
    L = LUMPS[var]
    lump = np.sin(math.pi * along / 32 * (1 + (var % 2)) + L[0]) * np.cos(z * 0.075 + L[1]) + 0.6 * np.sin(z * 0.16 + L[2] + along * 0.2)
    b += 1.2 * (1.5 + win * lump)          # the joints sit at the lumps' middle depth, never a ridge
    lo = np.where(band > 0, np.take(ZB, np.maximum(band - 1, 0)), 0.0)
    a_s = along + SLANT[band] * (z - lo) + CHOFF[var, band]
    ci = np.floor(a_s / CL[band]).astype(int)
    fr = a_s - ci * CL[band]
    rc = (noise(var, band, ci) % 100) / 100.0
    topbed = band == len(RB) - 1
    b += np.where(topbed, 1.8, 0.9) * (win * rc + (1 - win) * 0.5)   # the lip's edge notched, the beds blocky
    joint = (fr < 0.7) & (noise(var, band, ci, 7) % 4 == 0) & (win > 0.6)
    b += joint * 0.7
    crack = np.zeros(z.shape, bool)
    for (c0, za, zb_, amp, ph) in CRACKS[var]:
        cx = c0 + amp * np.sin(z * 0.19 + ph) + 0.6 * np.sin(z * 0.53 + 2 * ph)
        m = (np.abs(along - cx) < 0.6 + 0.5 * np.sin(z * 0.11 + ph) ** 2) & (z > za) & (z < zb_) & (win > 0.5)
        crack |= m
    b += crack * 2.4
    # a dark line under each overhang (the bed above sticks out further than the one below)
    under = np.zeros(z.shape, bool)
    for k in range(len(ZB)):
        if RB[k + 1] < RB[k] - 0.3:
            under |= (z < bz[k]) & (z >= bz[k] - 1.1)
    b = np.minimum(b, np.where(z > STOREY - 14, 4.5, 6.5))   # the face never retreats past the lip
    return b, band, crack | (joint & (rc > 0.6)), under


# ======================================================================== the renderer
def boxblur(a, r, axis):
    pad = [(0, 0)] * a.ndim
    pad[axis] = (r + 1, r)
    c = np.cumsum(np.pad(a, pad), axis=axis, dtype=np.float32)
    n = a.shape[axis]
    hi = np.take(c, np.arange(2 * r + 1, 2 * r + 1 + n), axis=axis)
    lo = np.take(c, np.arange(0, n), axis=axis)
    return (hi - lo) / (2 * r + 1)


class Piece:
    def __init__(self, img, dep, wx, wy, wz, anchor):
        self.img, self.dep, self.wx, self.wy, self.wz = img, dep, wx, wy, wz
        self.anchor = anchor             # the pixel holding the world origin's projection (x, y)

    @property
    def size(self):
        return self.img.shape[1], self.img.shape[0]


def render(bounds, geom, colour, canvas=None):
    """bounds (x0, x1, y0, y1, z0, z1); geom(X, Y, Z) -> (occ, attrs); colour(P, n, attrs) -> rgb.
    canvas: (w, h, ax, ay) a fixed frame with the world origin at pixel (ax, ay); else cropped tight."""
    x0, x1, y0, y1, z0, z1 = bounds
    E = 3   # the grid reaches past the piece, so the normals at its cut ends see the rock that continues there
    xs = np.arange(x0 - E + RES / 2, x1 + E, RES)
    ys = np.arange(y0 - E + RES / 2, y1 + E, RES)
    zs = np.arange(z0 + RES / 2, z1, RES)
    X, Y, Z = np.meshgrid(xs, ys, zs, indexing="ij")
    occ, A = geom(X, Y, Z)
    occ_n = A.pop("occ_n", occ)
    o = np.pad(occ, 1)
    exposed = occ & (~o[2:, 1:-1, 1:-1] | ~o[1:-1, 2:, 1:-1] | ~o[1:-1, 1:-1, 2:])
    ii, jj, kk = np.nonzero(exposed)
    pi, pj, pk = ii + 4, jj + 4, kk + 4

    def normals(solid):
        f = np.pad(solid.astype(np.float32), 4)
        f[..., :4] = f[..., 4:5]   # the rock goes on below the ground: no rounding at the foot
        for ax in range(3):
            f = boxblur(f, 2, ax)
        for ax in range(3):
            f = boxblur(f, 1, ax)
        g = np.stack([f[pi + 1, pj, pk] - f[pi - 1, pj, pk], f[pi, pj + 1, pk] - f[pi, pj - 1, pk],
                      f[pi, pj, pk + 1] - f[pi, pj, pk - 1]], -1)
        return -g / np.maximum(np.linalg.norm(g, axis=1, keepdims=True), 1e-6)
    n = normals(occ_n)       # the rock as it goes on past the piece: no false rounding at a joint
    if occ_n is not occ:
        nc = normals(occ)    # the piece alone: right on its cut faces, where the rock goes on outward
        q = np.clip(np.stack([ii, jj, kk], -1) + np.round(nc * 4).astype(int), 0, np.array(occ.shape) - 1)
        cutface = occ_n[q[:, 0], q[:, 1], q[:, 2]] & ~occ[q[:, 0], q[:, 1], q[:, 2]]
        n = np.where(cutface[:, None], nc, n)
    P = np.stack([X[ii, jj, kk], Y[ii, jj, kk], Z[ii, jj, kk]], -1)
    sx = P[:, 0] - P[:, 1]
    sy = (P[:, 0] + P[:, 1]) / 2 - P[:, 2]
    col = np.floor(sx).astype(int)
    row = np.floor(sy).astype(int)
    dep = P.sum(1)
    if canvas is None:
        cmin, rmin = col.min(), row.min()
        W, H = col.max() - cmin + 1, row.max() - rmin + 1
        ax_, ay_ = -cmin, -rmin
    else:
        W, H, ax_, ay_ = canvas
    c = col + ax_
    r = row + ay_
    ok = (c >= 0) & (c < W) & (r >= 0) & (r < H)
    assert ok.all(), f"geometry leaves the frame: cols {c.min()}..{c.max()} of {W}, rows {r.min()}..{r.max()} of {H}"
    idx = r * W + c
    order = np.lexsort((dep, idx))
    s_idx = idx[order]
    last = np.r_[s_idx[1:] != s_idx[:-1], True]
    win = order[last]
    Aw = {k: v[ii[win], jj[win], kk[win]] for k, v in A.items()}
    rgb = colour(P[win], n[win], Aw)
    img = np.zeros((H, W, 4), np.uint8)
    D = np.full((H, W), np.nan)
    WX = np.full((H, W), np.nan)
    WY = np.full((H, W), np.nan)
    WZ = np.full((H, W), np.nan)
    rr, cc = r[win], c[win]
    img[rr, cc, :3] = rgb
    img[rr, cc, 3] = 255
    D[rr, cc] = dep[win]
    WX[rr, cc], WY[rr, cc], WZ[rr, cc] = P[win, 0], P[win, 1], P[win, 2]
    if "dq" in Aw:
        # the far brink: where a lip turning away from the camera is the top of the picture, its last pixel is the cut
        # edge (soil under turf, shadowed rock), so the hill's far side reads against the ground below it
        DQ = np.zeros((H, W))
        AW = np.zeros((H, W))
        DQ[rr, cc] = Aw["dq"]
        AW[rr, cc] = n[win].sum(1)
        a = img[..., 3] > 0
        topedge = a & ~np.pad(a, ((1, 0), (0, 0)))[:-1]
        m = topedge & (DQ > 0.5) & (AW < 1.3)
        grassy = img[..., 1].astype(int) > img[..., 0].astype(int) + 8
        img[m & grassy, :3] = SOIL[1]
        img[m & ~grassy, :3] = ROCK_A[2]
    return Piece(img, D, WX, WY, WZ, (int(ax_), int(ay_)))


# ======================================================================== the colouring
def vnoise(a, b, seed, cell=4.0, pa=32, pb=32):
    """smooth value noise on a lattice of `cell` units, periodic over pa and pb (None: not periodic), 0..1"""
    fa, fb = a / cell, b / cell
    ia, ib = np.floor(fa).astype(int), np.floor(fb).astype(int)
    ta, tb = fa - ia, fb - ib
    ta, tb = ta * ta * (3 - 2 * ta), tb * tb * (3 - 2 * tb)
    na = int(round(pa / cell)) if pa else 0
    nb = int(round(pb / cell)) if pb else 0
    def hv(i, j):
        if na:
            i = i % na
        if nb:
            j = j % nb
        return noise(i, j, seed) / 65535.0
    v0 = hv(ia, ib) * (1 - ta) + hv(ia + 1, ib) * ta
    v1 = hv(ia, ib + 1) * (1 - ta) + hv(ia + 1, ib + 1) * ta
    return v0 * (1 - tb) + v1 * tb


def clump(a, b, seed, cell=4.0, pb=32, lo=0.32, hi=0.68):
    """clumps of -1, 0, +1 with organic edges (value noise thresholded)"""
    v = vnoise(a, b, seed, cell, 32, pb)
    return np.where(v < lo, -1, np.where(v > hi, 1, 0))


def tone_of(n, weights=(6.4, 5.0, 2.3)):
    nx, ny, nz = n[:, 0], n[:, 1], n[:, 2]
    tz, ty, tx = weights
    w = lambda c, pos, neg: np.where(c >= 0, pos, neg) * c * c
    return w(nz, tz, 1.4) + w(ny, ty, 3.0) + w(nx, tx, 4.6)   # -X faces look up-left, toward the light


def rock_colour(grass=False):
    def colour(P, n, A):
        X, Y, Z = P[:, 0], P[:, 1], P[:, 2]
        nz = n[:, 2]
        t = tone_of(n)
        top = nz > 0.8
        at = np.where(np.abs(n[:, 1]) >= np.abs(n[:, 0]), X, Y)
        face_tex = clump(at, Z * 1.4, 11, cell=3.0, pb=None)
        top_tex = clump(X, Y, 12, cell=4.0)
        t = t + np.where(top, 0.45 * top_tex, 0.4 * face_tex)
        band = A["band"]
        t = t + np.where(top, 0, np.where(band % 2 == 0, 0.15, -0.15))
        t = np.where(A["under"] & ~top, t - 1.5, t)
        t = np.where(A["crack"] & ~top, np.minimum(t, 0.9 + 0.5 * (n[:, 1] > 0.6)), t)
        # the faces on the plateau's side (under the floor in the game): plain; a piece's cut ends stay rock, since a
        # neighbour or a cut at a shared edge may leave one in sight
        al = A["along"]
        plain = (A["dq"] <= 0) & (al > 0.6) & (al < 31.4) & (nz < 0.5)
        t = np.where(plain, 2.3, t)
        idx = np.clip(np.round(t), 0, 7).astype(int)
        idx = np.where(top, np.minimum(idx, 6), idx)
        brown = np.isin(band, BROWN_BANDS) & ~top & ~plain
        rgb = np.where(brown[:, None], np.stack(ROCK_B)[idx], np.stack(ROCK_A)[idx])
        # moss on the ledges of the face (the beds' tops, a hollow's lip), never on the cliff's own top
        ledge = (nz > 0.45) & (nz < 0.92) & (Z < STOREY - 9) & ~plain
        moss = ledge & (vnoise(at, Z * 1.2, 71, 5.0, 32, None) > 0.42)
        rgb = np.where(moss[:, None], np.stack(MOSS)[np.where(nz > 0.7, 2, 1)], rgb)
        # grass creeping up the foot of the face in tufts
        foot = (Z < 1.5 + 4.5 * vnoise(at, 0 * Z, 72, 2.5, 32, None) ** 2) & ~plain & (nz < 0.8)
        rgb = np.where(foot[:, None], np.stack(GRASS)[np.where(n[:, 1] > 0.5, 3, 2) - (Z > 3)], rgb)
        if grass:
            s = A["s"]
            al = A["along"]
            thr = 0.38 + 0.3 * vnoise(np.mod(al, 32), 0 * al, 21, 2.5, 32, None) + 0.15 * (vnoise(np.mod(al, 32), 0 * al, 22, 1.5, 32, None) > 0.75)
            g = ((A["dq"] <= 0) | (s < thr)) & (Z > STOREY - 10)
            soil = ~g & (s < thr + 0.14) & (Z > STOREY - 10) & (A["dq"] > 0)
            # a lip turning away from the camera (a hill's far side) shows its cut edge: turf, then a line of soil
            away = n.sum(1)
            soil |= g & (A["dq"] > 0) & (away < 0.86) & (away > 0.45)
            g &= ~((A["dq"] > 0) & (away < 0.86))
            gt = np.where(nz > 0.86, 3, np.where(nz > 0.6, 2, 1)) + np.where(nz > 0.86, clump(X, Y, 31, cell=4.0, lo=0.25, hi=0.8), 0)
            gt = np.clip(gt, 0, 5)
            rgb = np.where(g[:, None], np.stack(GRASS)[gt], rgb)
            rgb = np.where(soil[:, None], np.stack(SOIL)[np.where(nz > 0.6, 2, 1)], rgb)
        return rgb.astype(np.uint8)
    return colour


# ======================================================================== the cliff solid
def sd_quad(x, y):
    """signed distance to the quadrant {x <= 0, y <= 0} (sharp)"""
    both = (x > 0) & (y > 0)
    return np.where(both, np.hypot(x, y), np.maximum(x, y))


def sd_quad_round(x, y, r):
    """signed distance to {x <= 0, y <= 0} with its corner rounded to radius r"""
    near = (x > -r) & (y > -r)
    return np.where(near, np.hypot(x + r, y + r) - r, np.maximum(x, y))


def cliff_geom(frame, var, lip=True):
    """frame(X, Y) -> (sdF, sdP, along, clip): the rock's footprint (signed distance, < 0 inside), the plateau's,
    the along-coordinate for the strata, and the piece's own share of the world."""
    def geom(X, Y, Z):
        sdF, sdP, along, clip = frame(X, Y)
        b, band, crack, under = face_bump(along, Z, var)
        dq = np.maximum(sdP, 0)
        b = np.minimum(b, np.maximum(-sdF + dq - 1.5, 0))   # never past the plateau's own line (an outer corner is thin)
        dF = -sdF - b
        s = np.clip(dq / np.maximum(dq + dF, 1e-6), 0, 1)
        h = np.where(dq <= 0, STOREY, STOREY - LIP + LIP * np.sqrt(np.clip(1 - s * s, 0, 1)))
        solid = (dF > 0) & (Z < h)
        occ = clip & solid
        return occ, {"band": band, "crack": crack, "under": under, "s": s, "dq": dq, "along": along, "occ_n": solid}
    return geom


def straight_frame(side, back):
    """a straight edge from the tile's top vertex (world origin): side 'n' runs along X, 'w' along Y.
    Outer: the plateau is behind (-Y for n, -X for w) and the face looks at the camera; back: the other way."""
    sg = -1 if back else 1
    def frame(X, Y):
        along, across = (X, Y) if side == "n" else (Y, X)
        yc = sg * across
        clip = (yc >= -HALF) & (along >= 0) & (along < 32)
        return yc - HALF, yc, along, clip
    return frame


HALVES = {"": (False, False), "_hn": (True, False), "_hw": (False, True), "_hnw": (True, True)}


def corner_frame(kind, sx, sy, hn=False, hw=False):
    """a corner piece keyed by its vertex (the world origin). kind 'outer': the plateau is the quadrant of signs
    (sx, sy); 'inner': the notch (the one quadrant not plateau) is. The piece owns both edges that meet there, whole;
    hn / hw: only the half of the n edge (along X) / the w edge (along Y) next to the vertex, for an edge two corners
    share (a step one tile long): cut square across the wall at the edge's midpoint, its strata closed off there so the
    other corner's half meets it."""
    kn, kw = (2.0 if hn else 1.0), (2.0 if hw else 1.0)
    reach_n, reach_w = (16 if hn else 32), (16 if hw else 32)
    def frame(X, Y):
        if kind == "outer":
            xc, yc = -sx * X, -sy * Y
            sdF = sd_quad_round(xc - HALF, yc - HALF, RO)
            sdP = sd_quad_round(xc, yc, RO - HALF)   # the plateau's line rounds with the face, so the lip keeps its width
            along = np.clip(32 + np.minimum(kn * xc, kw * yc), 0, 32)
            box = (xc >= -reach_n) & (yc >= -reach_w) & ((xc >= -HALF) | (yc >= -HALF))
        else:
            xc, yc = sx * X, sy * Y
            sdF = -sd_quad_round(-(xc - HALF), -(yc - HALF), RI)
            sdP = -sd_quad(-xc, -yc)
            along = np.clip(np.maximum(kn * xc, kw * yc), 0, 32)
            box = (xc >= -HALF) & (yc >= -HALF) & (xc < reach_n) & (yc < reach_w)
        return sdF, sdP, along, box
    return frame


def post_geom(var):
    """a round rock column of the wall's thickness on a vertex, its top a dome on the lip's profile"""
    def geom(X, Y, Z):
        r = np.hypot(X, Y)
        along = (np.arctan2(Y, X) + math.pi) / (2 * math.pi) * 32
        b, band, crack, under = face_bump(along, Z, var)
        b = b * 0.6
        dF = HALF - r - b
        dq = r
        s = np.clip(dq / np.maximum(dq + dF, 1e-6), 0, 1)
        h = STOREY - LIP + LIP * np.sqrt(np.clip(1 - s * s, 0, 1))
        occ = (dF > 0) & (Z < h)
        return occ, {"band": band, "crack": crack, "under": under, "s": s, "dq": dq + 1e-3, "along": along}
    return geom


# ======================================================================== the ramp
RAMP_STEPS = [14.0, 46.0, 78.0]   # where a worn step's tread starts (u): one a tile, shallow
STEP_L = 3.0
SIDE_R = 5.0


def ramp_height(u):
    """the slab's walking surface along the run: z = u (the engine's 32 px a tile), with a few worn steps cut in:
    a flat tread of STEP_L at the slope's height where it starts, so the slab is never above the line z = u"""
    z = np.array(u, float).copy()
    for a in RAMP_STEPS:
        m = (u >= a) & (u < a + STEP_L)
        z = np.where(m, a, z)
    return np.clip(z, 0, STOREY)


def ramp_to_frame(d, X, Y):
    if d == "n":
        return 32 - Y, X       # u, v
    return 32 - X, Y


def ramp_geom(d, var):
    def geom(X, Y, Z):
        u, v = ramp_to_frame(d, X, Y)
        dv = np.minimum(v, 32 - v)
        b, band, crack, under = face_bump(np.clip(u / 3, 0, 32), Z, var)
        b = np.where(Z > ramp_height(u) - 6, 0.0, b * 0.8)
        dF = dv - b
        top = ramp_height(u)
        drop = np.where(dF < SIDE_R, SIDE_R - np.sqrt(np.clip(SIDE_R ** 2 - (SIDE_R - dF) ** 2, 0, None)), 0)
        occ = (u >= 0) & (u < 97.5) & (dF > 0) & (Z < top - drop)   # a pixel under the landing: no gap at the head
        s = np.clip(1 - dF / SIDE_R, 0, 1)
        return occ, {"band": band, "crack": crack, "under": under, "s": s, "dq": np.ones_like(Z), "along": u}
    return geom


def ramp_colour():
    base = rock_colour()
    def colour(P, n, A):
        rgb = base(P, n, A)
        u = A["along"]
        nz = n[:, 2]
        slab = (nz > 0.45) & (A["s"] < 0.6)
        t = tone_of(n) - 0.8 + 0.6 * clump(P[:, 0], P[:, 1], 41, cell=3.0, pb=32, lo=0.25, hi=0.8)
        idx = np.clip(np.round(t), 0, 6).astype(int)
        rgb = np.where(slab[:, None], np.stack(ROCK_A)[idx], rgb)
        # the lip of each worn step (the riser under a tread's front edge) dark; the tread's nosing light
        for a in RAMP_STEPS:
            nose = (np.abs(u - (a + STEP_L)) < 0.75) & slab
            rgb = np.where(nose[:, None], ROCK_A[4], rgb)
            lip = (np.abs(u - a) < 0.6) & slab
            rgb = np.where(lip[:, None], ROCK_A[6], rgb)
        return rgb.astype(np.uint8)
    return colour


# ======================================================================== the floors (64 x 32 diamonds, anchor 32, 16 = the tile's centre)
def floor_world():
    py, px = np.mgrid[0:32, 0:64]
    sx = px + 0.5 - 32
    sy = py + 0.5 - 16
    X = 16 + sy + sx / 2
    Y = 16 + sy - sx / 2
    inside = (X >= 0) & (X < 32) & (Y >= 0) & (Y < 32)
    return X, Y, inside


def blob(X, Y, cx, cy, rx, ry):
    return ((X - cx) / rx) ** 2 + ((Y - cy) / ry) ** 2 < 1


def floor_tile(kind, var):
    X, Y, inside = floor_world()
    rng = np.random.default_rng(500 + var + (0 if kind == "rock" else 100))
    img = np.zeros((32, 64, 4), np.uint8)
    if kind == "rock":
        t = (5 + clump(X, Y, 51, cell=4.0, lo=0.2, hi=0.66)).astype(float)
        t = np.where(vnoise(X, Y, 53, 2.0) > 0.8, t - 1, t)
        rgb = np.stack(ROCK_A)[np.clip(t, 0, 7).astype(int)]
        # a slab crack or two: a wandering line inside the tile, dark, its top-left rim lit
        for _ in range(int(rng.integers(1, 3))):
            ax, ay = rng.uniform(6, 26, 2)
            ang = rng.uniform(0, math.pi)
            ln = rng.uniform(7, 14)
            ts = np.linspace(-ln / 2, ln / 2, 60)
            cxs = ax + ts * math.cos(ang) + 1.2 * np.sin(ts * 0.6 + var)
            cys = ay + ts * math.sin(ang)
            for cx_, cy_ in zip(cxs, cys):
                if not (3 < cx_ < 29 and 3 < cy_ < 29):
                    continue
                m = (np.abs(X - cx_) < 0.55) & (np.abs(Y - cy_) < 0.55)
                rgb[m] = ROCK_A[3]
        # scree: a few pebbles, lit top-left, dark bottom-right
        for _ in range(int(rng.integers(2, 5))):
            cx_, cy_ = rng.uniform(5, 27, 2)
            r_ = rng.uniform(1.0, 2.0)
            body = blob(X, Y, cx_, cy_, r_ * 1.2, r_)
            rgb[body] = ROCK_A[6]
            rgb[body & blob(X, Y, cx_ - 0.6, cy_ - 0.6, r_ * 0.8, r_ * 0.6)] = ROCK_A[7]
            rim = blob(X, Y, cx_ + 0.7, cy_ + 0.7, r_ * 1.2, r_) & ~body
            rgb[rim] = ROCK_A[3]
        # sparse grass in the cracks and hollows, and a fleck of lichen
        for _ in range(int(rng.integers(1, 3))):
            cx_, cy_ = rng.uniform(6, 26, 2)
            tuft = blob(X, Y, cx_, cy_, rng.uniform(2.0, 3.2), rng.uniform(1.5, 2.6))
            rgb[tuft] = GRASS[3]
            rgb[tuft & blob(X, Y, cx_ - 0.8, cy_ - 0.8, 1.4, 1.0)] = GRASS[4]
            rgb[tuft & ~blob(X, Y, cx_ - 0.5, cy_ - 0.5, 2.2, 1.6)] = GRASS[2]
        if rng.random() < 0.7:
            cx_, cy_ = rng.uniform(6, 26, 2)
            rgb[blob(X, Y, cx_, cy_, 1.6, 1.1)] = LICHEN
    else:
        t = 3 + clump(X, Y, 61, cell=4.0, lo=0.17, hi=0.84)
        t = np.where(vnoise(X, Y, 62, 2.0) > 0.86, 4, t)
        rgb = np.stack(GRASS)[np.clip(t, 0, 5).astype(int)]
        # a rock nub or a pebble through the turf now and then, and a darker hollow
        for _ in range(1 if var % 2 == 0 else 0):
            cx_, cy_ = rng.uniform(7, 25, 2)
            r_ = rng.uniform(1.6, 2.8)
            body = blob(X, Y, cx_, cy_, r_ * 1.3, r_)
            rgb[blob(X, Y, cx_ + 0.6, cy_ + 0.8, r_ * 1.4, r_ * 1.1) & ~body] = GRASS[1]
            rgb[body] = ROCK_A[5]
            rgb[body & blob(X, Y, cx_ - 0.7, cy_ - 0.7, r_ * 0.9, r_ * 0.6)] = ROCK_A[6]
        for _ in range(int(rng.integers(1, 3))):
            cx_, cy_ = rng.uniform(5, 27, 2)
            rgb[blob(X, Y, cx_, cy_, 2.4, 1.7)] = GRASS[2]
    img[..., :3] = rgb
    img[..., 3] = np.where(inside, 255, 0)
    img[~inside, :3] = 0
    return img


# ======================================================================== building every piece
WALL_CANVAS = {"n": (49, 121, 8, 100), "w": (49, 121, 40, 100)}   # wall_stone's frames: size and anchor (top vertex)
FACE_VARS = {"n": (0, 1, 2), "w": (3, 4, 5)}
BACK_VAR = {"n": 6, "w": 7}
CORNERS = {   # name: (kind, sx, sy) -- sx, sy the signs of the plateau's quadrant (outer) or of the notch (inner)
    "outer_s": ("outer", -1, -1), "outer_w": ("outer", 1, -1), "outer_e": ("outer", -1, 1), "outer_n": ("outer", 1, 1),
    "inner_n": ("inner", 1, 1), "inner_e": ("inner", -1, 1), "inner_w": ("inner", 1, -1), "inner_s": ("inner", -1, -1),
}
CORNER_VAR = {nm: 8 + i for i, nm in enumerate(CORNERS)}


def corner_bounds(kind, sx, sy):
    lo, hi = (-32, 16) if kind == "outer" else (-HALF, 32)
    xr = sorted((-sx * lo, -sx * hi)) if kind == "outer" else sorted((sx * lo, sx * hi))
    yr = sorted((-sy * lo, -sy * hi)) if kind == "outer" else sorted((sy * lo, sy * hi))
    return (xr[0], xr[1], yr[0], yr[1], 0, STOREY)


def build_all():
    res = {}
    for lipname, grass in (("cliff", False), ("cliff_grass", True)):
        col = rock_colour(grass)
        for side in ("n", "w"):
            sideword = "north" if side == "n" else "west"
            bnd = (0, 32, -HALF, HALF, 0, STOREY) if side == "n" else (-HALF, HALF, 0, 32, 0, STOREY)
            for i, var in enumerate(FACE_VARS[side]):
                nm = f"{sideword}_plain" + ("" if i == 0 else f"_{i}")
                res[(lipname, nm)] = render(bnd, cliff_geom(straight_frame(side, False), var), col, WALL_CANVAS[side])
            res[(lipname, f"{sideword}_back")] = render(bnd, cliff_geom(straight_frame(side, True), BACK_VAR[side]), col, WALL_CANVAS[side])
        for nm, (kind, sx, sy) in CORNERS.items():
            for hs, (hn, hw) in HALVES.items():
                res[(lipname, "corner_" + nm + hs)] = render(corner_bounds(kind, sx, sy), cliff_geom(corner_frame(kind, sx, sy, hn, hw), CORNER_VAR[nm]), col)
        res[(lipname, "post")] = render((-HALF, HALF, -HALF, HALF, 0, STOREY), post_geom(16), col)
    for d in ("n", "w"):
        bnd = (0, 32, -64, 32, 0, STOREY) if d == "n" else (-64, 32, 0, 32, 0, STOREY)
        res[("ramp", d)] = render(bnd, ramp_geom(d, 17 if d == "n" else 18), ramp_colour())
    for kind in ("rock", "grass"):
        for v in range(4):
            res[("floor_" + kind, v)] = floor_tile(kind, v)
    return res


# ======================================================================== outline (the ramp, as the drawn stairs)
OUTLINE = hx("#2b2522")
RAMP_OUTLINE = False   # True draws the interactable outline round the ramp, as the drawn stairs have (see README)


def outlined(p):
    a = p.img[..., 3] > 0
    pa = np.pad(a, 1)
    ring = (pa[:-2, 1:-1] | pa[2:, 1:-1] | pa[1:-1, :-2] | pa[1:-1, 2:]) & ~a
    img = np.pad(p.img, ((1, 1), (1, 1), (0, 0)))
    ring = np.pad(ring, 1)
    img[ring, :3] = OUTLINE
    img[ring, 3] = 255
    padf = lambda m: np.pad(m, 1, constant_values=np.nan)
    D, WX, WY, WZ = padf(p.dep), padf(p.wx), padf(p.wy), padf(p.wz)
    # the outline's depth: its neighbour's
    for arr in (D, WX, WY, WZ):
        for dy, dx in ((0, 1), (0, -1), (1, 0), (-1, 0)):
            src = np.roll(np.roll(arr, dy, 0), dx, 1)
            m = ring & np.isnan(arr) & ~np.isnan(src)
            arr[m] = src[m]
    q = Piece(img, D, WX, WY, WZ, (p.anchor[0] + 1, p.anchor[1] + 1))
    return q


def crop(p):
    a = p.img[..., 3] > 0
    ys = np.where(a.any(1))[0]
    xs = np.where(a.any(0))[0]
    y0, y1, x0, x1 = ys.min(), ys.max() + 1, xs.min(), xs.max() + 1
    return Piece(p.img[y0:y1, x0:x1], p.dep[y0:y1, x0:x1], p.wx[y0:y1, x0:x1], p.wy[y0:y1, x0:x1], p.wz[y0:y1, x0:x1],
                 (p.anchor[0] - x0, p.anchor[1] - y0))


# ======================================================================== writing
def save_png(arr, path):
    a = arr[..., 3]
    assert set(np.unique(a)) <= {0, 255}, path + ": soft alpha"
    Image.fromarray(arr, "RGBA").save(path)


def save_depth(p, path):
    dep = np.where(np.isnan(p.dep), 0, np.round(np.nan_to_num(p.dep)) + 32768).astype(np.uint16)
    Image.fromarray(dep).save(path)


def write(res):
    man = {"round": 10, "date": "2026-10-28", "files": []}

    def rec(name, arr, anchor, note):
        man["files"].append({"file": f"out/{name}", "size": [int(arr.shape[1]), int(arr.shape[0])],
                             "anchor": [int(anchor[0]), int(anchor[1])], "what": note})

    for lipname in ("cliff", "cliff_grass"):
        images, anchors = {}, {}
        for side in ("north", "west"):
            for nm in (f"{side}_plain", f"{side}_plain_1", f"{side}_plain_2", f"{side}_back"):
                p = res[(lipname, nm)]
                fn = f"wall_{lipname}_{nm}.png"
                save_png(p.img, os.path.join(OUT, fn))
                save_depth(p, os.path.join(OUT, "depth", fn))
                images[nm] = f"data/art/village/{fn}"
                anchors[nm] = [float(p.anchor[0]), float(p.anchor[1])]
                rec(fn, p.img, p.anchor, "wall face" if "plain" in nm else "wall, plateau on the camera's side")
        defn = {
            "anchorVertex": "top",
            "images": images,
            "anchors": anchors,
            "wall": {"height": STOREY, "thickness": 2 * HALF, "color": "#6e6a66", "material": "stone",
                     "post": f"post_{lipname}", "corners": f"wall_{lipname}_corners", "name": "cliff"},
            "faces": {"north": ["north_plain", "north_plain_1", "north_plain_2"], "west": ["west_plain", "west_plain_1", "west_plain_2"]},
            "back": {"north": "north_back", "west": "west_back"},
            "note": ("a cliff face (art round 10): bare stratified rock, 96 tall, 16 thick, centred on the edge, its top rounding over "
                     "(a lip of radius 8) from the edge line to the face; no openings. `faces` are variants of the plain face, any of "
                     "which meets any other (pick by a hash of the edge); `back` is the picture for an edge whose plateau is on the "
                     "camera's side (its face looks away); anchors at the tile's top vertex, as wall_stone's" +
                     ("; the grass-lipped set: the turf rolls over the lip" if "grass" in lipname else "")),
        }
        with open(os.path.join(OUT, f"wall_{lipname}.json"), "w") as f:
            json.dump(defn, f, indent=1)
        # corners
        images, anchors = {}, {}
        for nm0 in CORNERS:
            for hs in HALVES:
                nm = nm0 + hs
                p = crop(res[(lipname, "corner_" + nm)])
                fn = f"wall_{lipname}_corner_{nm}.png"
                save_png(p.img, os.path.join(OUT, fn))
                save_depth(p, os.path.join(OUT, "depth", fn))
                images[nm] = f"data/art/village/{fn}"
                anchors[nm] = [float(p.anchor[0]), float(p.anchor[1])]
                rec(fn, p.img, p.anchor, f"corner piece {nm}, anchored on its vertex")
                res[(lipname, "corner_" + nm)] = p
        cdef = {
            "images": images, "anchors": anchors, "anchorAt": "vertex",
            "edges": {nm: corner_edges(nm) for nm in CORNERS},
            "halves": {"": "both edges whole", "_hn": "the n edge's half next to the vertex only", "_hw": "the w edge's half only",
                       "_hnw": "both halves only"},
            "note": ("a cliff's corner pieces (art round 10): each one picture of the two edges that meet at a vertex, the rock rounding "
                     "round the corner (an outer corner radius 20 at the face, an inner corner a cove of radius 12), anchored on the "
                     "vertex itself at ground level (as a post: no +16). Drawn in place of both edges' own pictures and the post. "
                     "`edges` names the two edges each owns, from the vertex (vx, vy). Where two corners share an edge (a step one "
                     "tile long) each takes its halved picture for that edge (`halves`), cut square at the edge's midpoint, and the "
                     "two halves meet there; no cut at run time."),
        }
        with open(os.path.join(OUT, f"wall_{lipname}_corners.json"), "w") as f:
            json.dump(cdef, f, indent=1)
        p = crop(res[(lipname, "post")])
        res[(lipname, "post")] = p
        fn = f"post_{lipname}.png"
        save_png(p.img, os.path.join(OUT, fn))
        save_depth(p, os.path.join(OUT, "depth", fn))
        rec(fn, p.img, p.anchor, "post: a round rock column on a vertex")
        with open(os.path.join(OUT, f"post_{lipname}.json"), "w") as f:
            json.dump({"image": f"data/art/village/{fn}", "frames": {"idle_0": [0, 0, int(p.img.shape[1]), int(p.img.shape[0])]},
                       "anchor": [float(p.anchor[0]), float(p.anchor[1])],
                       "note": "a cliff's post (art round 10): a round rock column 16 across with the lip's dome, on the grid vertex "
                               "itself; serves an outer corner (rounds it at radius 8), a run's end, and an inner corner (hidden in "
                               "the rock but its top)"}, f, indent=1)
    # floors
    for kind in ("rock", "grass"):
        nm = "floor_cliff_top" if kind == "rock" else "floor_cliff_grass"
        imgs = {}
        for v in range(4):
            fn = f"{nm}_{v}.png"
            save_png(res[("floor_" + kind, v)], os.path.join(OUT, fn))
            imgs[f"idle_{v}"] = f"data/art/village/{fn}"
            rec(fn, res[("floor_" + kind, v)], (32, 16), "floor, anchor the tile's centre")
        with open(os.path.join(OUT, f"{nm}.json"), "w") as f:
            json.dump({"images": imgs, "anchor": [32, 16],
                       "note": ("the cliff top (art round 10): " + ("bare rock with slab cracks, scree, sparse grass and lichen"
                                if kind == "rock" else "turf with a rock nub now and then") +
                                "; patterned in world space, any frame meets any other; laid on layer 1 over cliff walls, it needs no "
                                "edge of its own (the wall's lip carries the rounding)"),
                       "mapColor": "#968f88" if kind == "rock" else "#4b5f3d"}, f, indent=1)
    # the ramp
    drawings, surface, cols = {}, {}, {}
    for d in ("n", "w"):
        p = crop(outlined(res[("ramp", d)]) if RAMP_OUTLINE else res[("ramp", d)])
        res[("ramp", d)] = p
        fn = f"stair_ramp_stone_{d}.png"
        save_png(p.img, os.path.join(OUT, fn))
        save_depth(p, os.path.join(OUT, "depth", fn))
        drawings[d] = {"image": f"data/art/village/{fn}", "anchor": [int(p.anchor[0]), int(p.anchor[1])]}
        rec(fn, p.img, p.anchor, f"stone ramp climbing {d}, anchor the low-end tile's top vertex")
        surface[d] = ramp_surface(d, p.anchor)
        cols[d] = ramp_columns(d, p.anchor[0])
    with open(os.path.join(OUT, "stair_ramp_stone.json"), "w") as f:
        json.dump({
            "anchorVertex": "top",
            "facings": ["n", "w"],
            "facingFootprint": {"n": [1, 3], "w": [3, 1]},
            "drawings": drawings,
            "anchorTile": "the low-end tile (the stair's `at`): the anchor is its top vertex at ground level",
            "columns": cols,
            "ramp": {"rise": "z = 32 px a tile along the run (map.stairStep's rise), less a worn step's tread",
                     "steps": [{"u": a / 32, "tread": STEP_L / 32, "height": a} for a in RAMP_STEPS],
                     "surface": surface},
            "depth": {d: f"data/art/village/depth/stair_ramp_stone_{d}.png" for d in ("n", "w")},
            "carry": False,
            "note": ("a stone ramp (art round 10): a sloped rock slab climbing one storey over three tiles, six shallow worn steps "
                     "cut in it (3 px each), its sides closed by rock in the cliff's strata, its edges rounded over as the cliff's "
                     "lip; facings n and w only (climbing away from the camera)"),
        }, f, indent=1)
    with open(os.path.join(HERE, "manifest.json"), "w") as f:
        json.dump(man, f, indent=1)


def corner_edges(nm):
    kind, sx, sy = CORNERS[nm]
    return [["n", "vx" if sx > 0 else "vx-1", "vy"], ["w", "vx", "vy" if sy > 0 else "vy-1"]]


def ramp_surface(d, anchor):
    out = []
    for i in range(0, 97, 4):
        u = float(i)
        z = float(ramp_height(np.array([u]))[0])
        X, Y = (16, 32 - u) if d == "n" else (32 - u, 16)
        sx, sy = X - Y, (X + Y) / 2 - z
        out.append({"t": round(u / 32, 4), "height": z, "centre": [round(sx + anchor[0], 1), round(sy + anchor[1], 1)]})
    return out


def ramp_columns(d, ax):
    ax = int(ax)
    """the engine's per-tile column cuts for a three-tile run (art round 8's rule, SLICE_INSET 9)"""
    cx = []
    for k in range(3):
        u = 16 + 32 * k
        X, Y = (16, 32 - u) if d == "n" else (32 - u, 16)
        cx.append(int(X - Y))
    if d == "n":
        b1, b2 = cx[0] + 9, cx[1] + 9
        return {"tile0": [None, ax + b1], "tile1": [ax + b1, ax + b2], "tile2": [ax + b2, None]}
    b1, b2 = cx[0] - 9, cx[1] - 9
    return {"tile0": [ax + b1, None], "tile1": [ax + b2, ax + b1], "tile2": [None, ax + b2]}


# ======================================================================== the preview: hills assembled from the pieces
def figure():
    """the bare body from data/art/character/preview_skins_3x.png taken back to 1x (art round 8's crop)"""
    im = np.array(Image.open(f"{REPO}/data/art/character/preview_skins_3x.png").convert("RGBA"))
    bg = im[2, 2, :3].astype(int)
    small = im[260:460, 170:310][1::3, 1::3].copy()
    a = np.abs(small[..., :3].astype(int) - bg).sum(-1) > 6
    small[..., 3] = np.where(a, 255, 0)
    ys = np.where(a.any(1))[0]
    xs = np.where(a.any(0))[0]
    return small[ys.min():ys.max() + 1, xs.min():xs.max() + 1]


def grass_tiles():
    out = []
    for i in range(4):
        out.append(np.array(Image.open(f"{REPO}/data/art/ground/grass_{i}.png").convert("RGBA")))
    return out


class Canvas:
    """a scene composed per pixel by depth (X + Y + Z, nearest wins)"""

    def __init__(self, W, H, ox, oy, bg=(48, 46, 44)):
        self.rgb = np.zeros((H, W, 3), np.uint8)
        self.rgb[:] = bg
        self.z = np.full((H, W), -1e9)
        self.ox, self.oy = ox, oy

    def put(self, img, x, y, depth, mask=None):
        h, w = img.shape[:2]
        H, W = self.z.shape
        x0, y0 = max(0, x), max(0, y)
        x1, y1 = min(W, x + w), min(H, y + h)
        if x1 <= x0 or y1 <= y0:
            return
        sub = img[y0 - y:y1 - y, x0 - x:x1 - x]
        dep = np.broadcast_to(depth, (h, w))[y0 - y:y1 - y, x0 - x:x1 - x]
        m = (sub[..., 3] > 127) & (dep > self.z[y0:y1, x0:x1])
        if mask is not None:
            m &= mask[y0 - y:y1 - y, x0 - x:x1 - x]
        self.rgb[y0:y1, x0:x1][m] = sub[..., :3][m]
        self.z[y0:y1, x0:x1][m] = dep[m]

    def at(self, X, Y, Z=0):
        """the canvas pixel of a world point"""
        return int(math.floor(X - Y)) + self.ox, int(math.floor((X + Y) / 2 - Z)) + self.oy

    def piece(self, p, X, Y, Z=0, mask=None):
        """a piece whose anchor is the world point (X, Y, Z)"""
        cx, cy = self.at(X, Y, Z)
        self.put(p.img, cx - p.anchor[0], cy - p.anchor[1], np.nan_to_num(p.dep, nan=-1e9) + X + Y + Z, mask)

    def tile(self, img, tx, ty, Z=0, bias=0.0):
        """a 64 x 32 floor frame on tile (tx, ty) at height Z"""
        X0, Y0 = tx * 32 + 16, ty * 32 + 16
        Xf, Yf, _ = floor_world()
        dep = (Xf - 16 + X0) + (Yf - 16 + Y0) + Z + bias
        cx, cy = self.at(X0, Y0, Z)
        self.put(img, cx - 32, cy - 16, dep)

    def fig(self, fimg, X, Y, Z):
        fh, fw = fimg.shape[:2]
        cx, cy = self.at(X, Y, Z)
        rows = np.arange(fh)[:, None]
        dep = X + Y + Z + (fh - 1 - rows) + np.zeros((1, fw))
        self.put(fimg, cx - fw // 2, cy - fh + 1, dep + 0.5)


def tile_hash(x, y, k):
    return int(noise(x + 1000, y + 1000, k)) / 65536.0


def build_hill(cv, res, plan, ramps, lips="cliff", corners=True, figures=(), grass_top=None):
    """plan: rows of '#' plateau, 'L' a ramp's landing (plateau); ramps: [(tx, ty, dir)] low-end tiles.
    Draws the ground, every cliff edge (straight, back, or a corner piece), posts at runs' ends, the floors on top."""
    P = {(x, y) for y, row in enumerate(plan) for x, c in enumerate(row) if c in "#L"}
    isP = lambda x, y: (x, y) in P
    gt = grass_tiles()
    H, W = len(plan), len(plan[0])
    (gx0, gx1, gy0, gy1) = cv.ground
    for ty in range(gy0, gy1):
        for tx in range(gx0, gx1):
            cv.tile(gt[int(tile_hash(tx, ty, 1) * 4)], tx, ty, 0, bias=-0.5)
    edges = set()
    for (x, y) in P:
        for e in (("n", x, y), ("n", x, y + 1), ("w", x, y), ("w", x + 1, y)):
            t, ex, ey = e
            a, b = ((ex, ey), (ex, ey - 1)) if t == "n" else ((ex, ey), (ex - 1, ey))
            if isP(*a) != isP(*b):
                edges.add(e)
    for (tx, ty, d) in ramps:
        if d == "n":
            edges.discard(("n", tx, ty - 2))
        else:
            edges.discard(("w", tx - 2, ty))
    lipset = (lambda e: lips(e)) if callable(lips) else (lambda e: lips)
    claims, cornerlist = {}, []
    outn = {(-1, -1): "outer_s", (1, -1): "outer_w", (-1, 1): "outer_e", (1, 1): "outer_n"}
    inn = {(1, 1): "inner_n", (-1, 1): "inner_e", (1, -1): "inner_w", (-1, -1): "inner_s"}
    posts = []
    for vy in range(-1, H + 2):
        for vx in range(-1, W + 2):
            q = {(-1, -1): isP(vx - 1, vy - 1), (1, -1): isP(vx, vy - 1), (-1, 1): isP(vx - 1, vy), (1, 1): isP(vx, vy)}
            c = sum(q.values())
            at_v = [e for e in (("n", vx - 1, vy), ("n", vx, vy), ("w", vx, vy - 1), ("w", vx, vy)) if e in edges]
            if not at_v:
                continue
            if corners and c in (1, 3):
                s = [k for k, v in q.items() if v == (c == 1)][0]
                nm = (outn if c == 1 else inn)[s]
                ce = [("n", vx if s[0] > 0 else vx - 1, vy), ("w", vx, vy if s[1] > 0 else vy - 1)]
                if all(e in edges for e in ce):
                    cornerlist.append((vx, vy, nm, ce))
                    for e in ce:
                        claims.setdefault(e, []).append((vx, vy))
                    continue
            straight = (len(at_v) == 2 and at_v[0][0] == at_v[1][0])
            if not straight:
                posts.append((vx, vy, at_v[0]))
    for (vx, vy, nm, ce) in cornerlist:
        hs = "_h" + "".join(t for t, e in zip("nw", ce) if len(claims[e]) > 1)
        hs = "" if hs == "_h" else hs
        p = res[(lipset(ce[0]), "corner_" + nm + hs)]
        cv.piece(p, vx * 32, vy * 32, 0)
    for e in sorted(edges):
        if e in claims:
            continue
        t, ex, ey = e
        side = "north" if t == "n" else "west"
        back = isP(ex, ey)
        if back:
            nm = f"{side}_back"
        else:
            k = int(tile_hash(ex, ey, 7 if t == "n" else 8) * 3)
            nm = f"{side}_plain" + ("" if k == 0 else f"_{k}")
        cv.piece(res[(lipset(e), nm)], ex * 32, ey * 32, 0)
    for (vx, vy, e) in posts:
        cv.piece(res[(lipset(e), "post")], vx * 32, vy * 32, 0)
    for (tx, ty, d) in ramps:
        cv.piece(res[("ramp", d)], tx * 32, ty * 32, 0)
    for (x, y) in P:
        if grass_top is None or grass_top(x, y):
            img = res[("floor_grass", int(tile_hash(x, y, 3) * 4))]
        else:
            img = res[("floor_rock", int(tile_hash(x, y, 4) * 4))]
        cv.tile(img, x, y, STOREY, bias=0.01)
    fimg = figure()
    for (X, Y, Z) in figures:
        cv.fig(fimg, X, Y, Z)
    return cornerlist, posts


HILL = [
    "............",
    "......####..",
    "..########..",
    "..########..",
    "..#########.",
    "..#L#..####.",
]


def fit_canvas(plan, ramps, m=1):
    """a canvas holding the plan, its ramps, and a margin of ground, with the ground's tile range"""
    W = len(plan[0])
    H = max([len(plan)] + [ty + 1 for (_, ty, _) in ramps])
    W = max([W] + [tx + 1 for (tx, _, _) in ramps])
    x0, x1, y0, y1 = -m - 3, W + m, -m - 3, H + m   # more ground behind: the plateau's far edge stands 96 over it
    left = (x0 - y1) * 32
    right = (x1 - y0) * 32
    top = (x0 + y0) * 16 - 112
    bottom = (x1 + y1) * 16 + 4
    cv = Canvas(right - left + 8, bottom - top + 8, -left + 4, -top + 4)
    cv.ground = (x0, x1, y0, y1)
    return cv


def edge_tile(e, P):
    t, ex, ey = e
    a, b = ((ex, ey), (ex, ey - 1)) if t == "n" else ((ex, ey), (ex - 1, ey))
    return a if a in P else b


def scene_hill(res):
    cv = fit_canvas(HILL, [(3, 8, "n")])
    rocky_t = lambda x, y: (6 <= x <= 9 and 1 <= y <= 3)
    rocky = lambda x, y: not rocky_t(x, y)
    P = {(x, y) for y, row in enumerate(HILL) for x, c in enumerate(row) if c in "#L"}
    lips = lambda e: "cliff" if rocky_t(*edge_tile(e, P)) else "cliff_grass"
    figs = [(3 * 32 + 16, 9 * 32 + 8, 0), (3 * 32 + 16, 7 * 32 + 16, 48), (4 * 32 + 20, 3 * 32 + 16, STOREY)]
    build_hill(cv, res, HILL, [(3, 8, "n")], lips=lips, figures=figs, grass_top=rocky)
    return cv.rgb


def scene_hill_posts(res):
    """the same hill as today's engine would draw it from data alone: straight faces, posts at every corner"""
    cv = fit_canvas(HILL, [(3, 8, "n")])
    rocky = lambda x, y: not (6 <= x <= 9 and 1 <= y <= 3)
    build_hill(cv, res, HILL, [(3, 8, "n")], corners=False, grass_top=rocky)
    return cv.rgb


LONG = [
    "..............",
    "............",
    "............",
    ".........##.",
    ".........##.",
    ".........##.",
    ".........##.",
    ".........##.",
]
LONG[1] = "############"
LONG[2] = "############"


def scene_long(res):
    cv = fit_canvas(LONG, [(13, 5, "w")])
    P = {(x, y) for y, row in enumerate(LONG) for x, c in enumerate(row) if c in "#L"}
    lips = lambda e: "cliff_grass" if edge_tile(e, P)[1] < 3 else "cliff"
    figs = [(14 * 32 + 10, 5 * 32 + 16, 0), (12 * 32 + 16, 5 * 32 + 16, 48), (6 * 32 + 16, 1 * 32 + 16, STOREY)]
    build_hill(cv, res, LONG, [(13, 5, "w")], lips=lips, figures=figs, grass_top=lambda x, y: y < 3)
    return cv.rgb


def label(img, text):
    im = Image.fromarray(img)
    ImageDraw.Draw(im).text((5, 4), text, fill=(232, 222, 200))
    return np.array(im)


def sheet(res):
    """every delivered picture on one strip, 3x, for looking"""
    pics = []
    for lipname in ("cliff", "cliff_grass"):
        for nm in ("north_plain", "north_plain_1", "north_plain_2", "north_back", "west_plain", "west_plain_1", "west_plain_2", "west_back"):
            pics.append(res[(lipname, nm)].img)
        pics.append(res[(lipname, "post")].img)
    row1 = pics
    row2 = [res[("cliff", "corner_" + nm)].img for nm in CORNERS]
    row3 = [res[("cliff_grass", "corner_" + nm)].img for nm in CORNERS]
    row4 = [res[("ramp", "n")].img, res[("ramp", "w")].img] + [res[("floor_rock", v)] for v in range(4)] + [res[("floor_grass", v)] for v in range(4)]
    rows = []
    for r in (row1, row2, row3, row4):
        h = max(p.shape[0] for p in r)
        W = sum(p.shape[1] + 6 for p in r)
        c = np.zeros((h, W, 3), np.uint8)
        c[:] = (70, 92, 60)
        x = 0
        for p in r:
            a = p[..., 3] > 0
            sub = c[h - p.shape[0]:, x:x + p.shape[1]]
            sub[a] = p[..., :3][a]
            x += p.shape[1] + 6
        rows.append(c)
    W = max(r.shape[1] for r in rows)
    rows = [np.concatenate([r, np.full((r.shape[0], W - r.shape[1], 3), 40, np.uint8)], 1) for r in rows]
    s = np.concatenate([np.concatenate([r, np.full((6, W, 3), 40, np.uint8)], 0) for r in rows], 0)
    Image.fromarray(np.kron(s, np.ones((3, 3, 1), np.uint8))).save(os.path.join(LOOK, "sheet_3x.png"))


def preview(res):
    hill = scene_hill(res)
    long_ = scene_long(res)
    posts = scene_hill_posts(res)
    big = lambda s: np.kron(s, np.ones((3, 3, 1), np.uint8))
    Image.fromarray(big(hill)).save(os.path.join(LOOK, "hill_3x.png"))
    Image.fromarray(big(long_)).save(os.path.join(LOOK, "long_3x.png"))
    Image.fromarray(big(posts)).save(os.path.join(LOOK, "hill_posts_3x.png"))
    hh = max(hill.shape[0], long_.shape[0], posts.shape[0])
    padh = lambda a: np.concatenate([a, np.full((hh - a.shape[0], a.shape[1], 3), 32, np.uint8)], 0)
    one = np.concatenate([padh(label(hill, "the hill (1x): corner pieces, a stone ramp (n)")),
                          padh(label(long_, "a long run (1x): face variants, grass lip (n side), ramp (w)")),
                          padh(label(posts, "data-only wiring (1x): straight faces + posts"))], 1)
    three1 = label(big(hill), "the hill, 3x")
    three2 = label(big(long_), "a long run, 3x")
    W = max(one.shape[1], three1.shape[1], three2.shape[1])
    pad = lambda a: np.concatenate([a, np.full((a.shape[0], W - a.shape[1], 3), 32, np.uint8)], 1)
    gap = np.full((6, W, 3), 32, np.uint8)
    full = np.concatenate([pad(one), gap, pad(three1), gap, pad(three2)], 0)
    Image.fromarray(full).save(os.path.join(HERE, "preview.png"))


if __name__ == "__main__":
    res = build_all()
    write(res)
    sheet(res)
    preview(res)
    for k, p in res.items():
        if isinstance(p, Piece):
            print(k, p.size, p.anchor)
