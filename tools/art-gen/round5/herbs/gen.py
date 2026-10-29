"""Art round 5, group B: the herbs.

Eleven herbs, each drawn twice: as a node (the clump growing wild, gathered by hand: herb_<id>.png and its
definition herb_<id>.json) and as an item (a picked bunch or sprig: <id>_world.png held `fixed`, and
<id>_icon.png, the same pixels centred on the 19 x 19 bag cell). Everything is under 22 px, so every
picture is a hand-pixelled ASCII grid with a palette (docs/art/01, "Two methods, picked by size"). Light
from the top-left, three or four flat shades per material, hard pixels only; ring() closes the #2b2522
outline round every picture, so a gap left in a drawn edge cannot leak (Michael's law: anything gathered
is outlined all the way round). No baked ground shadow (docs/art/01, rule 5).

Each herb keeps its identity colours from today's design (data/sprites/herb_<id>.json `placeholder`):
the leaf, the stem, the flower, the eye, the glow, the berries, the root.

Run: python gen.py         writes out/, manifest.json, preview.png (deterministic, no randomness)
     python gen.py --zoom  also writes work/zoom_nodes.png and work/zoom_items.png, 8x working sheets
The definitions copy every non-picture field from the repository's data/sprites/herb_<id>.json (read
only, at REPO below).
"""
import json, os, sys
import numpy as np
from PIL import Image, ImageDraw

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "out")
WORK = os.path.join(HERE, "work")
REPO = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", "..", ".."))
O = "#2b2522"
CELL = 19
STRICT = "--strict" in sys.argv     # refuse a ragged grid instead of padding it on the right
ART_DIR = "data/art/ground"          # where the node pictures would live in the game, beside the mushrooms


def hx(s):
    s = s.lstrip("#"); return tuple(int(s[i:i + 2], 16) for i in (0, 2, 4)) + (255,)


def from_grid(name, rows, pal):
    w = max(len(r) for r in rows)
    bad = [i for i, r in enumerate(rows) if len(r) != w]
    if bad and STRICT: raise ValueError(f"{name}: rows {bad} are not {w} wide: " + ", ".join(f"{i}:{len(rows[i])}" for i in bad))
    if bad: print(f"  pad {name}: rows {bad}")
    rows = [r.ljust(w, ".") for r in rows]
    im = Image.new("RGBA", (w, len(rows)), (0, 0, 0, 0))
    for y, r in enumerate(rows):
        for x, ch in enumerate(r):
            if ch == ".": continue
            if ch not in pal: raise ValueError(f"{name}: no colour for {ch!r} at {x},{y}")
            im.putpixel((x, y), hx(pal[ch]))
    return ring(im)


def ring(im):
    """close the outline: every empty pixel that touches the picture on a side becomes #2b2522. The canvas
    grows by a pixel each side first."""
    a = np.array(im); big = np.zeros((a.shape[0] + 2, a.shape[1] + 2, 4), np.uint8); big[1:-1, 1:-1] = a
    op = big[..., 3] > 0
    p = np.pad(op, 1)
    nb = p[:-2, 1:-1] | p[2:, 1:-1] | p[1:-1, :-2] | p[1:-1, 2:]
    add = nb & ~op
    big[add] = hx(O)
    return Image.fromarray(big, "RGBA")


# Shared colours: the twine that ties a bunch, the pale cut ends of the stems.
TWINE = {"T": "#dcc290", "t": "#b8985e", "u": "#86683e", "U": "#66502e"}
CUT = {"c": "#d6dcaa"}


def tone(h, f):
    r, g, b, _ = hx(h)
    return "#%02x%02x%02x" % tuple(max(0, min(255, round(v * f))) for v in (r, g, b))


def P(**k):
    d = {"o": O}; d.update(TWINE); d.update(CUT); d.update(k)
    if "s" in d and "S" not in d: d["S"] = tone(d["s"], 0.72)
    return d


# ====================================================================================================
# The herbs. Letters: L M D d the leaf, light to darkest; s S the stem; A B C a flower light to dark;
# E an eye; others per herb, named in its palette. foot: the column of the foot in the grid (before
# the outline ring); grip: the item's grip in the grid.
# ====================================================================================================
HERBS = {}

# ---------------------------------------------------------------------------------------- sage
# A low, soft bush of silvery grey-green oval leaves; short spikes of purple flowers in whorls.
HERBS["sage"] = dict(
    pal=P(L="#cad6b4", M="#a3b39a", D="#7c8e72", d="#566853", s="#6e7a5c",
          A="#c8a0f0", B="#9a6ad0", C="#6c4698"),
    node=[
        "...A.......A......",
        "..ABC.....ABC..A..",
        "...s.......s..ABC.",
        "..ABC.....ABC..s..",
        "...s.......s..ABC.",
        "..ABC......s...s..",
        "...s.L..LL.s..s.D.",
        ".L.sLLM.LMDs.LDDMD",
        "LLMdLMMdLMMdLMDdMD",
        "LMMdLMMDdLMDLMMDdd",
        ".LMMdLMMdLMMdMDDd.",
        "LLMMDdLMMdLMMDDDd.",
        ".LMMDDdMMDdMDDdd..",
        "..dDDDdddDDDdd....",
    ],
    foot=8,
    item=[
        "...A.......",
        "..ABC.L....",
        "...s.LLM.L.",
        ".L.sLLMD.LD",
        "LLMsLMMDLMD",
        "LMMDsLMDMDd",
        ".LMMsLMDMD.",
        "..LMMsMDDd.",
        "...LMsMDd..",
        "...TttuU...",
        "...ttuuu...",
        "....sss....",
        "....sSs....",
        "....cSc....",
    ],
    grip=(5, 10),
    item_note="a bundle of sage leaves tied with twine, one purple flower spike, the stems cut",
)

# ---------------------------------------------------------------------------------------- nettle
# Tall, dark, upright stems with opposite pairs of pointed, toothed leaves; thin pale-green catkins hang
# from where the leaves meet the stem. No flowers to speak of: its shape is the teeth.
HERBS["nettle"] = dict(
    pal=P(L="#5e9048", M="#3a6a32", D="#2c5228", d="#203c1e", s="#2e5228", S="#24401f",
          k="#9ab070", K="#748c50"),
    node=[
        "........L.........",
        "...L...LsD........",
        "..LML.L.s.D.D.L...",
        "..LsLLLMsMDDdLMD..",
        ".L.s.LMDs.Dd.LsD..",
        "LLMsMDDds.....s...",
        "LM.sLDL.s.D.D.s.D.",
        "...sLLLMsMDDdMsMDD",
        "...s.LMks.DdM.s.Dd",
        ".L.s.D.ksk....s...",
        "LLMsMDDds.....s...",
        "LMksLDL.s.D.D.s.D.",
        "..ksLLLMsMDDdMsMDD",
        "...s.LM.s.DdMks.Dd",
        ".LLs....s....kDD..",
        "LLMM....s....MDDd.",
        "LMMMDDdDdDDMDDDdd.",
        ".dDDdd.dsd.dDdd...",
    ],
    foot=8,
    item=[
        "....L....",
        "...LMD...",
        ".L.LsD.D.",
        "LLM.s.DDd",
        "LM..s..Dd",
        ".LM.s.Dd.",
        "..LMsDd..",
        "L...s...d",
        "LL..s..Dd",
        "LMM.s.DDd",
        ".LMMsDDd.",
        "..LMsDd..",
        "....s....",
        "..k.s.K..",
        "..k.s.K..",
        "....s....",
        "....c....",
    ],
    grip=(4, 13),
    item_note="a nettle top: a stem with three pairs of toothed dark leaves and two hanging catkins, cut below",
)

# ---------------------------------------------------------------------------------------- feverfew
# A bushy clump of bright yellow-green feathery leaves crowned with many small daisies: white petals
# round a yellow eye.
HERBS["feverfew"] = dict(
    pal=P(L="#a2c86a", M="#7aa850", D="#567c3a", d="#3e5c2c", s="#5a7e3a",
          A="#fcfaf2", B="#dcd8c6", E="#f0c830", e="#c89a20"),
    node=[
        "...A.......A.....",
        "..AEA..A..AEB....",
        "...B..AEB..B..A..",
        "...s...B...s.AEB.",
        ".A..s..s..s...B..",
        "AEB.s..s..s..s...",
        ".B..s..s.s..s....",
        "..s.Ls.sLs.Ls....",
        ".LLsLMLsLMLMsMD..",
        "LMLMLLMLMLMLMDMD.",
        ".LMLMMDMMDMDMDDd.",
        "LMDLMDMMDMDDMDdD.",
        ".MDMDDMDdDDdDd...",
        "..dD.dDDddDdd....",
    ],
    foot=8,
    item=[
        "..A.....A..",
        ".AEA...AEB.",
        "..B..A..B..",
        "..s.AEB.s..",
        "...s.B.s...",
        "..LMsLsMD..",
        ".LLMsMsDD..",
        "..LMLsMDd..",
        "....LsD....",
        "....TtU....",
        "....tuu....",
        "....sss....",
        "....sSs....",
        "....cSc....",
    ],
    grip=(5, 10),
    item_note="a posy of three feverfew daisies and their feathery leaves, tied with twine, the stems cut",
)

# ---------------------------------------------------------------------------------------- yarrow
# Tall stiff stems, each topped with a flat plate of tiny white flowers (the umbel), and finely cut,
# feathery leaves along the stems and at the foot.
HERBS["yarrow"] = dict(
    pal=P(L="#8cba68", M="#6a9a52", D="#4c7440", d="#365630", s="#4e7038",
          A="#fcfaf0", B="#e2dccc", C="#b4ab98"),
    node=[
        "..AAAAA...........",
        ".ABAABAB.AAAAA....",
        "..CsCsC.ABABABA...",
        "....s....CsCsC....",
        "....s.L....s......",
        "...Ls.LM...s.D....",
        "..LLs..M..sDD.....",
        "....sL..L.sD..AAA.",
        ".L..sLM.LsD..ABABA",
        ".LL.s.M..s....CsC.",
        "..LLs...Ls..D..s..",
        "....s..LMs.DD..s..",
        ".L..s.L..sD..Ds...",
        ".LM.sLM..s..DDs...",
        "..LMsL.LMsDD.s....",
        ".LLMMLMLMMDDDd....",
        "LMLMMMDMDMDDDd....",
        ".dMDdDdDDdDd......",
    ],
    foot=7,
    item=[
        "..AAAAA...",
        ".ABAABAB..",
        "..CsCsC...",
        "....s.....",
        "...Ls.....",
        "..LLs.D...",
        "....sDD...",
        ".L..s..D..",
        ".LL.s.DD..",
        "..LLsD....",
        "....s.D...",
        "...LsDD...",
        "....s.....",
        "....s.....",
        "....c.....",
    ],
    grip=(4, 12),
    item_note="a yarrow stem: a flat white head of tiny flowers over feathery leaves, cut below",
)

# ---------------------------------------------------------------------------------------- mana_herb
# Mageroot: broad teal leaves standing up from a pale root crown that glows; the leaves' midribs and
# tips glow too. The glow is solid pixels, pale cyan, never transparent.
HERBS["mana_herb"] = dict(
    pal=P(L="#6cc4bc", M="#3a9aa8", D="#2a7a74", d="#1c5a52",
          G="#e8fcff", g="#a6e2ea", z="#6eaab4", s="#2a6e5e"),
    node=[
        "......G.........",
        "..G..LLM....G...",
        ".LLM.LMMD..DDM..",
        "LLMMDLMMD.MDDDd.",
        "LMMDD.LgD.MDDd..",
        ".LMgD.sgDsgDd.G.",
        "..LMgs.gsgDd.MD.",
        "G..LLs.ss.dDDDd.",
        "LMM.LMsgsMDd....",
        ".LMMDLMgDDd.....",
        "..dDdGGggzd.....",
        "....GGggggz.....",
        ".....gGgzz......",
    ],
    foot=7,
    item=[
        "..G...G..",
        ".LM.G.MD.",
        ".LMgMgMD.",
        "..LMgMD..",
        "...LsD...",
        ".GGGggzz.",
        "GGGggggzz",
        "GGgzggzzz",
        ".GGggggz.",
        ".GgGgzzz.",
        "..GGggz..",
        "..Gggzz..",
        "...Ggz...",
        "...gzz...",
        "....gz...",
        "....z....",
    ],
    grip=(4, 6),
    item_note="a pulled mageroot: a pale glowing tapering root under a tuft of teal leaves with glowing midribs",
)

# ---------------------------------------------------------------------------------------- nightshade
# Deadly nightshade: a leafy bush of broad soft oval leaves; dull purple bells hang under them and
# glossy black berries sit in their green stars.
HERBS["nightshade"] = dict(
    pal=P(L="#6a9460", M="#4a7448", D="#365838", d="#26402a", s="#3e5a34",
          A="#cc96f0", B="#a45cd4", C="#70389a",
          K="#16101e", k="#3a3048", g="#c8bce0"),
    node=[
        "........L........",
        ".......LLM.......",
        ".......LMD.......",
        "...LLLMLMD.......",
        ".LLLMMDDs........",
        "...MDDd.s.LLM....",
        "...s....sLLMMDDd.",
        "..gK....ssMDDds..",
        "..Kks...s.s..A...",
        "...gK...s...ABC..",
        "...Kk...s...B.C..",
        "..LLLM.ss.LLM....",
        "LLLMMDD.sLLMMDDd.",
        ".sMDDd.Ls.MDDds..",
        ".A..LLMMsLLMMgK..",
        "ABCLLMMDsDMDDKk..",
        "B.C.dDDdsdddd....",
    ],
    foot=8,
    item=[
        "....LL....",
        "...LLMD...",
        "..LLMDD...",
        "...LsDd...",
        "....s.....",
        "..B.s.gK..",
        ".ABCs.KK..",
        "....sgKgK.",
        "....s.KKK.",
        "....s.....",
        "....s.....",
        "....c.....",
    ],
    grip=(4, 9),
    item_note="a nightshade sprig: two broad leaves, a hanging purple bell and a cluster of glossy black berries",
)

# ---------------------------------------------------------------------------------------- wolfsbane
# Monkshood: a tall spike of deep blue-violet hooded flowers over deeply cut, dark green, hand-shaped
# leaves.
HERBS["wolfsbane"] = dict(
    pal=P(L="#5c9662", M="#3e7448", D="#2c5636", d="#1f3f28", s="#33603c",
          A="#9a9af4", B="#5a5ae0", C="#3a38a6"),
    node=[
        "......A......",
        ".....AB......",
        ".....BC.AA...",
        "..AA.s.ABBC..",
        ".ABBC.sBC....",
        "..BC.s.s.....",
        ".....s.AA....",
        "..AA.sABBC...",
        ".ABBCs.BC....",
        "..BC.s.s.....",
        ".....s.......",
        ".L.L.s.D.D...",
        "LLMLMsMDMDd..",
        ".LMMLsDMDd.D.",
        "L.LMMsMDDdDd.",
        "LLMLMMDMDDDd.",
        ".LMMDMDDdDdd.",
        "..dMDDdDdd...",
    ],
    foot=5,
    item=[
        "....A....",
        "...AB....",
        "...BC.AA.",
        ".AA.sABBC",
        "ABBCs.BC.",
        ".BC.s....",
        "....s....",
        "..L.sD...",
        ".LMLsMD..",
        "..LMsDd..",
        "....s....",
        "....s....",
        "....c....",
    ],
    grip=(4, 10),
    item_note="a cut wolfsbane spike: blue-violet hooded flowers and one cut leaf, the stem cut below",
)

# ---------------------------------------------------------------------------------------- grave_moss
# A low cushion of pale grey-green moss over a grey stone, with thin rust-brown spore stalks standing
# out of it, tipped pale. A mound, not a plant with a stem.
HERBS["grave_moss"] = dict(
    pal=P(L="#ccd8b6", M="#a8b49a", D="#869878", d="#66785c", T="#eef2e2",
          Q="#8c8884", q="#6e6a68", x="#524e4e", n="#4a3a2c", N="#64503a"),
    node=[
        "..LL.....LL.......",
        ".LTLML.LLTMLLL.LL.",
        "LLLMMLLLMMMLMMLMMD",
        "LMMTMMLMMMDMMTMDDd",
        "LMMMMDMMTMDMMDDMDd",
        "LMDMMDMMDDMDDDDDdd",
        "MMDDMDDTdDDdDDdddQ",
        ".dDdDddQdddQddQQqq",
        "..dQQQqqQQqqqqqqqx",
        "..QQqqqqqqqqqqqqxx",
        "...qqxxxxxxxxxxx..",
    ],
    foot=8,
    item=[
        "..LL..LLL..",
        ".LTLLLMTLL.",
        "LLMMLMMMLMD",
        "LMTMMDMMDTD",
        "MMDMMDMDDDd",
        "MDDDdDDdDdd",
        ".nnnnnnnnn.",
        "..nNnnNnn..",
    ],
    grip=(5, 5),
    item_note="a peeled pad of pale grave moss, its tufts tipped pale, a crust of dark earth under it",
)

# ---------------------------------------------------------------------------------------- woad
# A rosette of long, blue-green, lance-shaped leaves; a branching stem above it carries loose clouds of
# tiny yellow flowers.
HERBS["woad"] = dict(
    pal=P(L="#8cbaa8", M="#6a9a88", D="#4c7668", d="#385a50", s="#5a7a5a",
          A="#fff07a", B="#f0d830", C="#bea420"),
    node=[
        "..BA.AB..BA...",
        ".ABCABAC.ABA..",
        "..CA.CA.BAC.AB",
        "...s..s.s...sC",
        "AB..s.s.s..s..",
        "BAC..sss..s...",
        ".s....ss.s....",
        "..s...ss......",
        "...s..s.......",
        ".L..s.s..D....",
        ".LL.s.s.DD....",
        "..LLs.sDD.....",
        "L..LMsMD...D..",
        "LL.LMsMD..DD..",
        ".LLLMMMD.DDd..",
        "..LMLMMMDMDd..",
        "...LMMMDDDd...",
        "....dMDDdd....",
    ],
    foot=6,
    item=[
        "....L.D....",
        "...LL.DD...",
        "..LLM.DDd..",
        "..LMMLDDd..",
        ".LLMMLMDDd.",
        ".LMMLMMDDd.",
        "..LMLMMDd..",
        "..LMLMMDd..",
        "...LMMMD...",
        "...TttuU...",
        "...ttuuu...",
        "....sss....",
        "....sSs....",
        "....cSc....",
    ],
    grip=(5, 10),
    item_note="a bunch of long blue-green woad leaves (the dye is in the leaf) tied with twine, the stems cut",
)

# ---------------------------------------------------------------------------------------- madder
# A sprawling, scrambling plant: stems with star-shaped whorls of narrow leaves, tiny pale yellow star
# flowers at the tips; the red roots that hold the dye show at its foot.
HERBS["madder"] = dict(
    pal=P(L="#8cb258", M="#6a9040", D="#4c6c30", d="#385224", s="#56783a",
          A="#f4f0a0", B="#d8e060", R="#e05a40", r="#c0382a", q="#8a2620"),
    node=[
        "......A......A..A..",
        ".....ABA....ABA.B..",
        "..L...s..L...s..s..",
        "L.L.L.s.LLL.MsM.s.D",
        ".LLL..sL.L.M.sMMMD.",
        "L.LML.LLsLMMMsMDD.D",
        ".LMLMLLMsMLMDsDMDD.",
        "L.LMMLMMsMMDMDDMd.D",
        ".LLMLMMDsMDDMDDDDd.",
        "..LMMMDMsMDDDDdDd..",
        "..RrLMDDsDDdDDrRq..",
        ".Rr..dDdRddd...Rq..",
        "Rq..RrRqrRrq....Rq.",
    ],
    foot=8,
    item=[
        "..L.s.M...",
        "...LsM....",
        "..M.s.D...",
        "...TttU...",
        "...ttuu...",
        "..RRrrq...",
        "..RrRrq...",
        ".RrRrrqq..",
        ".Rr.Rr.q..",
        "Rr..Rr..q.",
        "R...r...q.",
        "....r.....",
    ],
    grip=(5, 4),
    item_note="a bundle of madder roots, red as the dye, tied with twine under a scrap of the leafy top",
)

# ---------------------------------------------------------------------------------------- weld
# Dyer's weld: one tall slender spike, dense with tiny yellow-green flowers, tapering to a point, over a
# low rosette of narrow wavy leaves.
HERBS["weld"] = dict(
    pal=P(L="#8aae54", M="#6a8e3e", D="#4e6c2e", d="#3a5224", s="#5e7e36",
          A="#f6ec78", B="#e8d830", C="#b8a420"),
    node=[
        ".....A.....",
        ".....AC....",
        "....ABC....",
        "....BAC....",
        "....ABC....",
        "....BAC....",
        "..A.ABC....",
        "..AC.BAC...",
        ".ABC.ABC...",
        ".BAC.BAC...",
        ".ABC.ABC...",
        "..s..sBC...",
        "..s..s.s...",
        "...s.s.....",
        "...sLs.....",
        ".L.LLsMD.D.",
        "LLMLMsMDDDd",
        ".LMMMsMDDd.",
        "..LMMDDDd..",
        "...dDDdd...",
    ],
    foot=5,
    item=[
        "...A....",
        "...AC...",
        "..ABC...",
        "..BAC.A.",
        "..ABCAC.",
        "..BACBC.",
        "..ABCAC.",
        "..BACs..",
        "...s.s..",
        "..TttU..",
        "..ttuu..",
        "...ss...",
        "...sS...",
        "...cS...",
    ],
    grip=(4, 10),
    item_note="two cut weld spikes, dense with tiny yellow flowers, tied with twine",
)

ORDER = ["sage", "nettle", "feverfew", "yarrow", "mana_herb", "nightshade", "wolfsbane", "grave_moss",
         "woad", "madder", "weld"]


# ====================================================================================================
def hard(im):
    a = np.array(im); return set(np.unique(a[..., 3])) <= {0, 255}


def tight(im):
    a = np.array(im)[..., 3] > 0
    return a[0].any() and a[-1].any() and a[:, 0].any() and a[:, -1].any()


def edge_is_outline(im):
    """every opaque pixel that touches transparency (or the canvas edge) on a side is the outline"""
    a = np.array(im); op = a[..., 3] > 0
    p = np.pad(op, 1)
    inner = p[:-2, 1:-1] & p[2:, 1:-1] & p[1:-1, :-2] & p[1:-1, 2:]
    edge = op & ~inner
    return bool((a[edge][:, :3] == np.array(hx(O)[:3])).all())


def crop(im):
    """the tight crop, and how far it moved the picture's origin"""
    a = np.array(im)[..., 3] > 0
    ys = np.where(a.any(1))[0]; xs = np.where(a.any(0))[0]
    return im.crop((xs[0], ys[0], xs[-1] + 1, ys[-1] + 1)), int(xs[0]), int(ys[0])


def on_cell(im, w=CELL, h=CELL):
    c = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    c.alpha_composite(im, ((w - im.width) // 2, (h - im.height) // 2))
    return c


def build():
    res = {}
    for k in ORDER:
        h = HERBS[k]
        node, ndx, ndy = crop(from_grid(k + " node", h["node"], h["pal"]))
        item, idx, idy = crop(from_grid(k + " item", h["item"], h["pal"]))
        # the anchor: the foot's column (shifted by the ring and the crop), on the bottom row (the outline
        # under the foot), as the drawn mushrooms anchor on the outline row under the stalk
        ax, ay = h["foot"] + 1 - ndx, node.height - 1
        assert np.array(node)[ay, ax, 3] == 255, (k, "anchor not opaque")
        gx, gy = h["grip"][0] + 1 - idx, h["grip"][1] + 1 - idy
        assert np.array(item)[gy, gx, 3] == 255, (k, "grip not opaque")
        for nm, im in (("node", node), ("item", item)):
            assert hard(im) and tight(im) and edge_is_outline(im), (k, nm)
        assert item.width <= CELL and item.height <= CELL, (k, "item larger than the cell")
        res[k] = dict(node=node, anchor=[ax, ay], item=item, grip=[gx, gy], icon=on_cell(item))
    return res


def definition(k, node, anchor):
    src = json.load(open(f"{REPO}/data/sprites/herb_{k}.json", encoding="utf-8"))
    d = {"image": f"{ART_DIR}/herb_{k}.png", "frames": {"idle_0": [0, 0, node.width, node.height]},
         "anchor": anchor, "bounds": {"x": 0, "y": 0, "w": node.width, "h": node.height}}
    for f, v in src.items():
        if f == "placeholder": continue
        if f == "note":
            v = v.replace("Dev art drawn from this design (src/gather-art.js), the item's icon from the same.",
                          "Drawn art: art round 5 (the herbs), the node and the item from one design.")
        d[f] = v
    return d


# ====================================================================================================
# preview
GRASS = ["#34462c", "#405434", "#4b5f3d", "#586e44", "#687e4c"]


def grass_tile():
    t = np.zeros((32, 64, 4), np.uint8)
    for y in range(32):
        for x in range(64):
            X = (x + 0.5 - 32) / 2 + (y + 0.5); Y = (y + 0.5) - (x + 0.5 - 32) / 2
            if 0 <= X < 32 and 0 <= Y < 32:
                h = ((x * 73856093) ^ (y * 19349663)) & 1023
                c = GRASS[2] if h > 140 else (GRASS[1] if h > 70 else GRASS[3])
                if X < 0.7 or Y < 0.7: c = GRASS[1]
                t[y, x] = (*hx(c), )
    return Image.fromarray(t, "RGBA")


def figure_for_scale():
    """the bare body from data/art/character/preview_skins_3x.png (row 2, the second skin), back at 1x
    (round 4's props preview does the same)"""
    im = np.array(Image.open(f"{REPO}/data/art/character/preview_skins_3x.png").convert("RGBA"))
    bg = im[2, 2, :3].astype(int)
    cell = im[260:460, 170:310]
    small = cell[1::3, 1::3].copy()
    a = np.abs(small[..., :3].astype(int) - bg).sum(-1) > 6
    small[..., 3] = np.where(a, 255, 0)
    ys = np.where(a.any(1))[0]; xs = np.where(a.any(0))[0]
    return Image.fromarray(small[ys.min():ys.max() + 1, xs.min():xs.max() + 1], "RGBA")


def label(d, x, y, s, fill=(220, 210, 190, 255)):
    d.text((x, y), s, fill=fill)


def preview(res):
    """preview.png, top to bottom: (1) at 1x, every node on its own grass tile, its anchor on the tile's
    centre, with the 55 px figure and two drawn mushrooms for scale; (2) at 1x, the nodes scattered on a
    meadow; (3) the icons at 2x in a dark bag slot with the 1x icon beside, and the world pictures at 3x
    with the grip boxed in cyan; (4) strip (1) at 3x, in two rows; (5) the meadow at 3x, in two halves."""
    BG = (34, 30, 28, 255)
    tile = grass_tile()
    fig = figure_for_scale()
    mush = [Image.open(f"{REPO}/data/art/ground/mushroom_{i}.png").convert("RGBA") for i in (0, 3)]
    cells = [("figure", fig, None)] + [(k, res[k]["node"], res[k]["anchor"]) for k in ORDER] +             [("mushroom_0", mush[0], (10, 20)), ("mushroom_3", mush[1], (19, 20))]
    pad = 4

    def strip(cs, labels=False):
        W = len(cs) * (64 + pad) + pad; H = 84
        im = Image.new("RGBA", (W, H), BG); d = ImageDraw.Draw(im)
        x = pad
        for (lab, pic, anc) in cs:
            cx, cy = x + 32, H - 20          # the tile's centre
            im.alpha_composite(tile, (cx - 32, cy - 16))
            if anc is None: im.alpha_composite(pic, (cx - pic.width // 2, cy - pic.height + 1))
            else: im.alpha_composite(pic, (cx - anc[0], cy - anc[1]))
            if labels: d.text((x + 2, 1), lab[:11], fill=(160, 150, 140, 255))
            x += 64 + pad
        return im

    def meadow(keys, W):
        m = Image.new("RGBA", (W, 74), BG)
        for j in range(-1, W // 64 + 2):
            for i in range(4):
                m.alpha_composite(tile, (j * 64 + (32 if i % 2 else 0), i * 16 - 8))
        n = len(keys)
        for i, k in enumerate(keys):
            pic, anc = res[k]["node"], res[k]["anchor"]
            cx = 24 + i * ((W - 70) // max(1, n - 1)) if n > 1 else W // 2
            cy = 42 + (10 if i % 2 else 0)
            m.alpha_composite(pic, (cx - anc[0], cy - anc[1]))
        m.alpha_composite(fig, (W - 22 - fig.width // 2, 66 - fig.height))
        return m

    A = strip(cells, labels=True)
    W1 = A.width
    M = meadow(ORDER, W1)
    slot = 38
    C = Image.new("RGBA", (W1, 140), BG)
    dc = ImageDraw.Draw(C)
    x = pad
    step = (W1 - pad) // len(ORDER)
    for k in ORDER:
        r = res[k]
        dc.rectangle([x, 4, x + slot + 1, 4 + slot + 1], fill=(42, 38, 34, 255), outline=(70, 62, 56, 255))
        C.alpha_composite(r["icon"].resize((slot, slot), Image.NEAREST), (x + 1, 5))
        C.alpha_composite(r["icon"], (x + slot + 5, 5))
        w3 = r["item"].resize((r["item"].width * 3, r["item"].height * 3), Image.NEAREST)
        C.alpha_composite(w3, (x + 4, 48))
        gx, gy = r["grip"]
        dc.rectangle([x + 4 + gx * 3 - 1, 48 + gy * 3 - 1, x + 4 + gx * 3 + 3, 48 + gy * 3 + 3], outline=(0, 230, 255, 255))
        label(dc, x, 108, k[:10])
        label(dc, x, 120, f"{r['item'].width}x{r['item'].height} g{gx},{gy}", (160, 150, 140, 255))
        x += step
    half = (len(cells) + 1) // 2
    A1 = strip(cells[:half]); A2 = strip(cells[half:])
    big = [im.resize((im.width * 3, im.height * 3), Image.NEAREST) for im in (A1, A2)]
    M1 = meadow(ORDER[:6], A1.width); M2 = meadow(ORDER[6:], A1.width)
    bigm = [im.resize((im.width * 3, im.height * 3), Image.NEAREST) for im in (M1, M2)]
    parts = [A, M, C] + big + bigm
    W = max(p.width for p in parts)
    out = Image.new("RGBA", (W, sum(p.height + 8 for p in parts)), BG)
    y = 0
    for p in parts:
        out.alpha_composite(p, (0, y)); y += p.height + 8
    out.save(os.path.join(HERE, "preview.png"))


def zoom(res, S=8):
    """work/zoom_nodes.png and work/zoom_items.png: every picture at 8x on grass, for looking"""
    os.makedirs(WORK, exist_ok=True)
    # two rows so it stays readable: nodes, then items
    nodes = [res[k]["node"] for k in ORDER]; items = [res[k]["item"] for k in ORDER]
    for nm, row in (("zoom_nodes", nodes), ("zoom_items", items)):
        W = sum(p.width * S + 8 for p in row) + 8
        H = max(p.height * S for p in row) + 16
        z = Image.new("RGBA", (W, H), (88, 108, 70, 255))
        x = 8
        for p in row:
            z.alpha_composite(p.resize((p.width * S, p.height * S), Image.NEAREST), (x, H - 8 - p.height * S))
            x += p.width * S + 8
        z.save(os.path.join(WORK, nm + ".png"))


def main():
    os.makedirs(OUT, exist_ok=True)
    res = build()
    manifest = {}
    for k in ORDER:
        r = res[k]
        r["node"].save(os.path.join(OUT, f"herb_{k}.png"))
        with open(os.path.join(OUT, f"herb_{k}.json"), "w", encoding="utf-8", newline="\n") as f:
            json.dump(definition(k, r["node"], r["anchor"]), f, ensure_ascii=False, indent=2)
            f.write("\n")
        r["item"].save(os.path.join(OUT, f"{k}_world.png"))
        r["icon"].save(os.path.join(OUT, f"{k}_icon.png"))
        manifest[k] = {"icon": [CELL, CELL], "portrait": False,
                       "held": {"mode": "fixed", "image": f"{k}_world.png", "grip": r["grip"]},
                       "world_size": [r["item"].width, r["item"].height],
                       "node": {"image": f"herb_{k}.png", "size": [r["node"].width, r["node"].height], "anchor": r["anchor"]},
                       "notes": HERBS[k]["item_note"]}
    with open(os.path.join(HERE, "manifest.json"), "w", encoding="utf-8", newline="\n") as f:
        json.dump(manifest, f, indent=2); f.write("\n")
    preview(res)
    if "--zoom" in sys.argv: zoom(res)
    for k in ORDER:
        r = res[k]
        print(f"{k:11s} node {r['node'].width}x{r['node'].height} anchor {r['anchor']}   item {r['item'].width}x{r['item'].height} grip {r['grip']}")


if __name__ == "__main__":
    main()
