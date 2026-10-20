"""The rickety fence and its gate (docs/art/11, Part A). Built with iso3d like the walls.

Wall-local coords: a = along the tile edge (0 at the far end / top vertex, 32 at the near end),
b = across (+b toward the camera), z = up. north ('\\'): a = world X, b = world Y.
west ('/'): a = world Y, b = world X. Every sprite's anchor is the tile's top vertex at ground;
the post's anchor is its own centre at ground.

Construction: a post at each grid vertex, 6 x 6 and 36 tall (the near-end post is part of every
segment and is pixel-identical to post_fence); three rails 3 thick and 4 tall running between
the post faces (a = 3..29), so a leaving segment's rails start at the post's face and an arriving
segment's end at it: nothing ever overlaps a post. The gate: a 4 px hinge stile nailed to the far
post (a = 3..7) that stays in the door_open segment, and a 22 px leaf hinged on it at a = 7.
"""
import json, os, math
import numpy as np
from PIL import Image
from iso3d import Scene, hx, hsh, flat, pick, proj

D = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(D, "..", "out", "village"); os.makedirs(OUT, exist_ok=True)
OUTLINE = hx("#2b2522")
METAL, METAL_HI = "#2b2a32", "#4a4952"

H_FENCE, T_FENCE = 36, 6
POST = 6                      # post is T_FENCE square
RAIL_T, RAIL_H = 3, 4         # across, tall
RAILS = [6, 18, 29]           # z of each rail's underside
HINGE_A = 7                   # the leaf's hinge, along the edge from the far vertex
STILE = (3, 7)                # the hinge stile nailed to the far post
LEAF_W = 29 - HINGE_A         # 22
LEAF_T = 3

# weathered grey-tan, the board overlays' wood, so the fence stands apart from grass and soil
FW = {"top": "#c6b38e", "left": "#b5a27e", "right": "#8d7b5f", "dark": "#5f5241",
      "grain_left": "#9c8a68", "grain_right": "#75664d", "grain_top": "#ad9a76",
      "split": "#d9c9a4"}
TONES_FOR_SPLINTERS = ["#c6b38e", "#b5a27e", "#8d7b5f", "#5f5241"]


def wood_sh(light, seed=0, along=None, origin=(0, 0)):
    """flat weathered wood with a sparse grain line; `along` is the world axis the grain runs on;
    `origin` is subtracted first so a post's grain is the same wherever the post stands."""
    base = FW[light]; g = FW["grain_" + light]
    def sh(P, s, t):
        n = len(P)
        out = np.broadcast_to(hx(base), (n, 3)).copy()
        if along is not None:
            Q = P[:, :2] - np.array(origin, float)
            u = np.floor(Q[:, along]).astype(int); v = np.floor(P[:, 2] * 2 + Q[:, 1 - along]).astype(int)
            grain = (hsh(v, u // 5, seed) % 7 == 0)
            out[grain] = hx(g)
        return out
    return sh


def shade_fn(seed=0, along=None):
    def fn(n):
        if n[2] > 0.7: return wood_sh("top", seed, along)
        return wood_sh("left" if n[1] >= n[0] else "right", seed, along)
    return fn


def to_world(orient, v):
    a, b, z = v
    return (b, a, z) if orient == "west" else (a, b, z)


def add_post(s, orient, a_at, tag=0):
    """the post centred on (a_at, b = 0): 6 x 6, 36 tall, the top split one pixel lower on its +X half."""
    X, Y, _ = to_world(orient, (a_at, 0, 0))
    h = H_FENCE
    # the main shaft, one pixel lower on the +X half of the top (a weathered split)
    o = (X, Y)
    s.box(X - 3, Y - 3, 0, X, Y + 3, h, top=wood_sh("top", 1), left=wood_sh("left", 1, 1, o), right=wood_sh("right", 1, 1, o), tag=tag)
    s.box(X, Y - 3, 0, X + 3, Y + 3, h - 1, top=wood_sh("top", 2), left=wood_sh("left", 1, 1, o), right=wood_sh("right", 1, 1, o), tag=tag)
    # a knot on the lit face
    s.box(X - 3, Y + 3, 13, X - 1, Y + 3.01, 15, left=flat(FW["grain_left"]), bias=0.05, tag=tag)


def add_rail(s, orient, k, a0, a1, b_c=0.0, tag=0):
    """rail k from a0 to a1 at across b_c: the top rail sags a pixel in the middle, the middle rail
    tilts a pixel down toward the near end, the bottom rail is straight with a split end."""
    z0 = RAILS[k]
    if k == 2:
        mid = (a0 + a1) / 2
        parts = [((a0, z0), (mid, z0 - 1)), ((mid, z0 - 1), (a1, z0))]
    elif k == 1:
        parts = [((a0, z0), (a1, z0 - 1))]
    else:
        parts = [((a0, z0), (a1, z0))]
    for (p0, p1) in parts:
        O = to_world(orient, (p0[0], b_c - RAIL_T / 2, p0[1]))
        A = to_world(orient, (p1[0] - p0[0], 0, p1[1] - p0[1]))
        B = to_world(orient, (0, RAIL_T, 0))
        C = (0, 0, RAIL_H)
        s.obox(O, A, B, C, shade_fn(10 + k, 1 if orient == "west" else 0), tag=tag)
    if k == 0:   # a split end at the far end: a pale sliver along the rail's top
        O = to_world(orient, (a0 + 1, b_c - RAIL_T / 2, z0 + RAIL_H - 0.5))
        s.obox(O, to_world(orient, (5, 0, 0)), to_world(orient, (0, 1, 0)), (0, 0, 0.6), lambda n: flat(FW["split"]), bias=0.05, tag=tag)


def add_leaf(s, orient, theta_deg, tag=5):
    """the gate leaf hinged at (a = HINGE_A, b = +LEAF_T/2), swung theta toward the camera.
    Three rails at the fence's heights, a free-edge stile, a diagonal brace, two strap hinges, a latch."""
    th = math.radians(theta_deg)
    ca, sa = math.cos(th), math.sin(th)
    def L(u, w, z):
        """leaf-local (u along the leaf from the hinge, w into the leaf's thickness from its front, z) -> world"""
        a = HINGE_A + u * ca - w * sa
        b = LEAF_T / 2 + u * sa + w * ca
        # when shut the thickness runs from b = +1.5 (front) back to -1.5
        return to_world(orient, (a, b - 0, z))
    def obox(u0, u1, w0, w1, z0, z1, seed, bias=0.0, fn=None):
        O = L(u0, -w0, z0)
        A = np.array(L(u1, -w0, z0)) - np.array(O)
        B = np.array(L(u0, -w1, z0)) - np.array(O)
        C = (0, 0, z1 - z0)
        s.obox(O, A, B, C, fn or shade_fn(seed, None), bias=bias, tag=tag)
    W = LEAF_W
    for k, z0 in enumerate(RAILS):
        obox(0, W, 0, LEAF_T, z0, z0 + RAIL_H, 20 + k)
    obox(W - 3, W, 0, LEAF_T, 3, H_FENCE - 2, 23)          # the free-edge stile
    obox(0, 3, 0, LEAF_T, 3, H_FENCE - 2, 24)              # the hinge-edge stile
    # the diagonal brace from the bottom hinge corner up to the free edge's top rail
    O = L(3, 0.2, RAILS[0] + RAIL_H); P1 = L(W - 3, 0.2, RAILS[2])
    A = np.array(P1) - np.array(O)
    B = np.array(L(3, -1.6, RAILS[0] + RAIL_H)) - np.array(O)
    s.obox(O, A, B, (0, 0, 3), shade_fn(25, None), bias=0.02, tag=tag)
    # strap hinges: dark iron across the hinge stile and onto the rail, with a highlight pixel
    for z0 in (RAILS[0] + 1, RAILS[2] + 1):
        obox(-0.5, 7, -0.3, 0.6, z0, z0 + 2, 0, bias=0.08, fn=lambda n: flat(METAL_HI if n[2] > 0.7 else METAL))
    # the latch on the free edge, at the middle rail
    obox(W - 2.5, W + 0.6, -0.4, 0.6, RAILS[1] + 1, RAILS[1] + 3, 0, bias=0.08, fn=lambda n: flat(METAL_HI if n[2] > 0.7 else METAL))


def add_stile(s, orient, tag=0):
    """the hinge stile: a plank nailed across the far post's face carrying the gate's pins"""
    a0, a1 = STILE
    O = to_world(orient, (a0, -LEAF_T / 2, 2)); A = to_world(orient, (a1 - a0, 0, 0)); B = to_world(orient, (0, LEAF_T, 0))
    s.obox(O, A, B, (0, 0, H_FENCE - 4), shade_fn(30, 1 if orient == "west" else 0), tag=tag)
    for z0 in (RAILS[0] + 1, RAILS[2] + 1):   # the pins
        O = to_world(orient, (a1 - 1.2, LEAF_T / 2 - 0.3, z0 - 0.5))
        s.obox(O, to_world(orient, (1.4, 0, 0)), to_world(orient, (0, 1.2, 0)), (0, 0, 3), lambda n: flat(METAL_HI if n[2] > 0.7 else METAL), bias=0.1, tag=tag)


def dark_edge(sp, exclude_tag=None):
    """the fence's darkest-of-its-own-colour edge on the lower and right sides, where it meets nothing."""
    a = sp.alpha; p = np.pad(a, 1)
    below = ~p[2:, 1:-1]; right = ~p[1:-1, 2:]
    m = a & (below | right)
    if exclude_tag is not None: m &= sp.tag != exclude_tag
    sp.col[m] = hx(FW["dark"])
    return sp


def outline_tag(sp, tg):
    """a full outline round the tagged region: outside it where transparent, inside its edge where it meets other pixels"""
    m = sp.tag == tg
    if not m.any(): return sp
    p = np.pad(m, 1)
    nb = p[:-2, 1:-1] | p[2:, 1:-1] | p[1:-1, :-2] | p[1:-1, 2:]
    outer = nb & ~m & ~sp.alpha
    pa = np.pad(sp.alpha & ~m, 1)
    other = pa[:-2, 1:-1] | pa[2:, 1:-1] | pa[1:-1, :-2] | pa[1:-1, 2:]
    inner = m & other
    sp.col[outer] = OUTLINE; sp.alpha |= outer
    sp.col[inner] = OUTLINE
    return sp


def build_segment(orient, variant):
    """the rails (or the stile and the shut leaf) rendered alone, then post_fence itself composited at the
    near vertex over them (it is nearer than everything they put there), so the segment's post is the
    post sprite pixel for pixel, dark edges and all"""
    s = Scene()
    if variant == "plain":
        for k in range(3): add_rail(s, orient, k, 3, 29)
    else:
        add_stile(s, orient)
        if variant == "door_shut": add_leaf(s, orient, 0)
    sp = s.render(origin_world=(0, 0, 0))
    dark_edge(sp, exclude_tag=5)
    outline_tag(sp, 5)
    im, anc = sp.image()
    post, panc = build_post().image()
    vx, vy = (32, 16) if orient == "north" else (-32, 16)     # the near vertex from the top vertex
    px, py = anc[0] + vx - panc[0], anc[1] + vy - panc[1]    # the post image's top-left in the segment image
    x0, y0 = min(0, int(px)), min(0, int(py))
    x1, y1 = max(im.width, int(px) + post.width), max(im.height, int(py) + post.height)
    out = Image.new("RGBA", (x1 - x0, y1 - y0), (0, 0, 0, 0))
    out.alpha_composite(im, (-x0, -y0)); out.alpha_composite(post, (int(px) - x0, int(py) - y0))
    return out, (anc[0] - x0, anc[1] - y0)


def build_post():
    s = Scene(); add_post(s, "north", 0)
    sp = s.render(origin_world=(0, 0, 0)); dark_edge(sp)
    return sp


def build_leaf(orient, theta):
    s = Scene(); add_leaf(s, orient, theta)
    sp = s.render(origin_world=(0, 0, 0))
    outline_tag(sp, 5)
    return sp


BOARD = {"top": "#c6b38e", "left": ["#b5a27e", "#ab9773"], "right": ["#8d7b5f", "#847257"],
         "grain": {"left": "#94805d", "right": "#6c5c44"}, "nail": "#2b2a32", "nail_hi": "#6a6872"}


def board_shader(light, length, seed):
    def sh(P, s, t):
        n = len(P)
        if light == "top": return pick([BOARD["top"]], np.zeros(n, int))
        u = np.floor(s * length).astype(int); v = np.floor(t * 5).astype(int).clip(0, 4)
        out = pick(BOARD[light], np.full(n, seed % 2))
        out[(hsh(v, u // 3, seed) % 5 == 0) & (v > 0) & (v < 4)] = hx(BOARD["grain"][light])
        for un in (2, length - 3):
            out[(u == un) & (v == 2)] = hx(BOARD["nail"]); out[(u == un) & (v == 1)] = hx(BOARD["nail_hi"])
        return out
    return sh


def build_boards(orient, count):
    """1-3 planks nailed across the shut gate, ends on the posts, proud of the post faces"""
    zlo, zhi = 4, H_FENCE - 2
    heights = {1: [0.5], 2: [0.27, 0.73], 3: [0.25, 0.5, 0.75]}[count]
    tilts = [2.0, -1.5, 1.5]
    s = Scene(); b0 = POST / 2 + 0.5; Lb = 32 + 2
    for k, f in enumerate(heights):
        zc = zlo + (zhi - zlo) * f
        tilt = tilts[k] * (1 if orient == "north" else -1)
        O = to_world(orient, (-1, b0, zc - 2.5 - tilt / 2))
        A = to_world(orient, (Lb, 0, 0)); A = (A[0], A[1], tilt)
        B = to_world(orient, (0, 2, 0))
        def fn(nrm, k=k):
            if nrm[2] > 0.7: return board_shader("top", Lb, k)
            return board_shader("left" if nrm[1] >= nrm[0] else "right", Lb, k)
        s.obox(O, A, B, (0, 0, 5), fn, bias=0.1 * k, tag=1)
    sp = s.render(origin_world=(0, 0, 0)); sp.outline(OUTLINE)
    return sp


def save(sp, name, anchors):
    im, anc = sp if isinstance(sp, tuple) else sp.image()
    a = np.array(im)[..., 3]; assert set(np.unique(a)) <= {0, 255}, name
    # crop to content
    ys = np.where(a.any(1))[0]; xs = np.where(a.any(0))[0]
    im = im.crop((xs.min(), ys.min(), xs.max() + 1, ys.max() + 1)); anc = (anc[0] - xs.min(), anc[1] - ys.min())
    im.save(f"{OUT}/{name}.png"); anchors[name] = {"anchor_px": [int(round(anc[0])), int(round(anc[1]))], "size": list(im.size)}
    return im


if __name__ == "__main__":
    anchors = {}
    for o in ("north", "west"):
        for v in ("plain", "door_shut", "door_open"):
            save(build_segment(o, v), f"wall_fence_{o}_{v}", anchors)
        save(build_leaf(o, 90), f"door_open_fence_{o}", anchors)
        for th, sfx in ((30, "30"), (60, "60")):
            save(build_leaf(o, th), f"door_open_fence_{o}_{sfx}", anchors)
        for n in (1, 2, 3):
            save(build_boards(o, n), f"boards_gate_{o}_{n}", anchors)
    save(build_post(), "post_fence", anchors)
    anchors["_fence"] = {"height": H_FENCE, "thickness": T_FENCE, "tones": TONES_FOR_SPLINTERS,
                         "note": "anchor_px is the tile's top vertex at ground level for every piece except post_fence, whose anchor is its own centre at ground; height and thickness are the fence's definition numbers"}
    json.dump(anchors, open(f"{OUT}/anchors_fence.json", "w"), indent=1)
    for k, v in anchors.items(): print(k, v)
