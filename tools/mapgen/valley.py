"""The valley: the 1.0 map (docs/29-world, ruled in docs/30), built place by
place. Step 0 laid the bones: the bounds, the river with its bridge and ford,
the roads' skeleton, the forest, and the home cottage at the end of the south
lane. Step 1 adds the village from docs/29/04's plan: the square and the green,
the inn, the chapel with its graveyard and crypt, the trades, the nobles, the
cottages, the toll house. Furniture without art is a labelled dev box (docs/30,
law 7). Steps 4, 5, and 6 add the farms, the castle, and the forest places.

Coordinates follow docs/29/04's village plan (two tiles a character, its corner
at world (56, 84)) and 29/01's overview for the river. A set's contents are
relative to its corner; a building's props to its own corner.

Run from the repo root: python -I tools/mapgen/valley.py
"""

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from mapgen import MapGen  # noqa: E402

SIZE = 256
HARVEST = {
    "tree_oak_m": 1, "tree_oak_l": 1, "tree_oak_old": 0.5,
    "tree_yellow_m": 1, "tree_yellow_l": 1, "tree_yellow_old": 0.5,
    "tree_orange_m": 1, "tree_orange_l": 1, "tree_orange_old": 0.5,
    "tree_red_m": 1, "tree_red_l": 1, "tree_red_old": 0.5,
    "tree_spire_green_m": 0.5, "tree_spire_green_l": 0.5, "tree_spire_green_old": 0.25,
    "tree_spire_yellow_m": 0.5, "tree_spire_yellow_l": 0.5, "tree_spire_yellow_old": 0.25,
    "tree_spire_orange_m": 0.5, "tree_spire_orange_l": 0.5, "tree_spire_orange_old": 0.25,
    "tree_spire_red_m": 0.5, "tree_spire_red_l": 0.5, "tree_spire_red_old": 0.25,
}

# The village plan's corner (29/04); a plan character is two tiles.
VX, VY = 56, 84


def P(c, r):
    """A plan character (column, row) as a world tile."""
    return (VX + 2 * c, VY + 2 * r)


HIGH_Y = P(0, 37)[1]  # 158: the high street, the square's middle row, the bridge

# ---- furniture shorthands (facings follow docs/17: a 2 by 1 footprint lies along x, 1 by 2 along y) ----
def along_x(sprite, x, y):
    return {"sprite": sprite, "tile": [x, y], "footprint": [2, 1]}


def along_y(sprite, x, y):
    return {"sprite": sprite, "tile": [x, y], "footprint": [1, 2]}


def one(sprite, x, y, **extra):
    return {"sprite": sprite, "tile": [x, y], **extra}


def chair(x, y, facing):
    return {"sprite": "chair", "tile": [x, y], "facing": facing}


def hearth_w(x, y, lit=False):
    """A fireplace backing onto a west wall: the tile and the one below it."""
    p = along_y("fireplace", x, y)
    if lit:
        p.update({"lit": True, "fuel": 3})
    return p


def hearth_n(x, y, lit=False):
    """A fireplace backing onto a north wall: the tile and the one east of it."""
    p = along_x("fireplace", x, y)
    if lit:
        p.update({"lit": True, "fuel": 3})
    return p


def door(side, at, **extra):
    return {"side": side, "at": at, "kind": "door", **extra}


def window(side, at, **extra):
    return {"side": side, "at": at, "kind": "window", **extra}


def part_w(x, y0, n, door_at=None, wall=None):
    p = {"edge": "w", "at": [x, y0], "len": n, "openings": [] if door_at is None else [{"at": door_at, "kind": "door"}]}
    if wall:
        p["wall"] = wall
    return p


def part_n(x0, y, n, door_at=None, wall=None):
    p = {"edge": "n", "at": [x0, y], "len": n, "openings": [] if door_at is None else [{"at": door_at, "kind": "door"}]}
    if wall:
        p["wall"] = wall
    return p


# ---- the cottages (29/04, three plans so they do not repeat) ----
def cottage_a(g, x, y, name, door_side="s", broken=False, torch=True, apple=False, wall="wall_wood"):
    """Plan A, the two-room: a living room with the hearth, a bedroom. An 8 by 6 block."""
    s = g.place(name, [x, y, 8, 6])
    openings = [door("s", 1, broken=broken) if door_side == "s" else door("n", 1, broken=broken), window("s" if door_side == "n" else "n", 4), window("e", 1)]
    s.building(
        [1, 1, 6, 4], wall, "floor_wood",
        openings=openings,
        partitions=[part_w(3, 0, 4, door_at=2)],
        # With the north door the table lies across row 3, so the chest takes the corner at (0, 0): (0, 3) was boxed in by the hearth, the table, and two walls (#227).
        # The living room keeps a way from its door to the partition door at row 2 (the dead must be able to stand there,
        # #134): the table lies across row 1 from the south door's side, and across row 3 from the north door's.
        props=([hearth_w(0, 1), along_x("table", 1, 1), chair(1, 2, "n"), one("chest", 0, 3)] if door_side == "s"
               else [hearth_w(0, 1), along_x("table", 1, 3), chair(1, 2, "s"), one("chest", 0, 0)]) + [along_x("bed", 3, 0), one("chest", 5, 3)],
        brackets=[{"side": "w", "at": 0, "facing": "in", **({"lantern": True} if torch else {"torch": True, "lit": False})}],
    )
    s.prop("woodpile", (7, 4))
    if apple:
        s.prop("tree_apple", (7, 5))  # a tree in the garden, reachable early (#190; Michael, 2026-10-18: apples are part of production)
    return s


def cottage_b(g, x, y, name, wall="wall_wood"):
    """Plan B, the long house: one long room, the hearth at one end and the byre
    at the other behind a low rail (a see-through wall splits no room). 8 by 8."""
    s = g.place(name, [x, y, 8, 8])
    s.building(
        [1, 1, 6, 6], wall, "floor_wood",
        openings=[door("s", 1), window("w", 1), window("e", 4)],
        partitions=[part_n(0, 4, 6, door_at=2, wall="wall_fence")],
        props=[hearth_n(1, 0), along_x("bed", 3, 0), one("chest", 5, 1), along_y("table", 0, 1), chair(1, 2, "w"), one("barrel", 0, 5), one("barrel", 2, 5), one("haystack", 5, 5)],
        brackets=[{"side": "n", "at": 4, "facing": "in", "lantern": True}],
    )
    return s


def cottage_c(g, x, y, name, trade, wall="wall_wood"):
    """Plan C, the L-shape: two rooms and a lean-to workshop at the back. 10 by 10."""
    s = g.place(name, [x, y, 10, 10])
    s.building(
        [1, 1, 6, 4], wall, "floor_wood",
        openings=[door("s", 1), window("n", 1), window("n", 4)],
        partitions=[part_w(3, 0, 4, door_at=2)],
        props=[hearth_w(0, 1), along_x("table", 1, 1), chair(1, 2, "n"), along_x("bed", 3, 0), one("chest", 5, 3)],
        brackets=[{"side": "w", "at": 0, "facing": "in", "lantern": True}],
    )
    # The lean-to shares the main room's east wall; its door is on its own west side (laid after, so it wins the edge).
    s.building(
        [7, 1, 2, 4], wall, "floor_wood",
        openings=[door("w", 1), window("e", 2)],
        props=[one("shelf", 1, 0), one("barrel", 0, 3)] if trade == "cooper" else [one("shelf", 1, 0), one("workbench", 0, 3)],
    )
    return s


def build():
    g = MapGen("The valley", SIZE, spawn=(104, 216))
    g.zone("harvest", HARVEST, scale=9)

    # ================= step 0: the bones =================
    # The river (29/01, 29/02): top to bottom, a little east of centre, bulging west by the mill.
    river = [(120, 0), (118, 36), (112, 56), (118, 80), (122, 110), (124, 170), (130, 190), (136, 212), (140, 256)]
    g.river(river, width=5, bank=1)
    g.floor_rect([116, HIGH_Y - 1, 18, 3], "floor_stone", kind="bridge", note="the stone bridge (29/02); floor_bridge_stone when drawn")
    g.shallow([132, 206, 7, 3], note="the ford (29/02): the drove crosses here; the water and its banks, nothing wider")

    # The roads' skeleton (29/02).
    g.road([(P(14, 37)[0], HIGH_Y), (116, HIGH_Y)], 3, "floor_cobble", group="high street")
    g.road([(0, HIGH_Y), (P(14, 37)[0], HIGH_Y)], 3, "floor_dirt", group="west road")
    g.road([(134, HIGH_Y), (140, HIGH_Y)], 3, "floor_cobble", group="bridge road")
    sq = P(14, 34)
    g.floor_rect([sq[0], sq[1], 12, 12], "floor_cobble", group="square")
    g.road([P(17, 8), P(17, 34)], 3, "floor_cobble", group="nobles street")
    g.road([P(17, 49), P(17, 71)], 2, "floor_dirt", group="south lane")
    g.road([P(4, 64), P(26, 64)], 2, "floor_dirt", group="the lane")
    g.road([P(26, 64), (131, 207)], 2, "floor_dirt", group="drove")
    g.road([(141, 207), (160, 207)], 2, "floor_dirt", group="drove")
    # The square's two lanes off it (29/04): the baker's corner and the smithy's.
    g.road([P(10, 40), P(14, 40)], 2, "floor_dirt", group="lane")
    g.road([P(20, 49), P(20, 53)], 2, "floor_dirt", group="lane")

    # The home: the end cottage on the south lane (29/07, option A; ruled in 30).
    home = g.place("your cottage", [98, 212, 16, 12], padding=1)
    home.building(
        [1, 1, 7, 5], "wall_wood", "floor_wood",
        openings=[door("s", 1), window("s", 5), window("n", 2), window("e", 2)],
        partitions=[part_w(4, 0, 5, door_at=3)],
        props=[hearth_w(0, 1), along_x("table", 1, 2), chair(1, 1, "s"), chair(1, 3, "n"), one("chest", 3, 4, loot="home_chest"),
               along_x("bed", 5, 0), one("chest", 6, 4), one("shelf", 4, 4)],
        brackets=[{"side": "w", "at": 0, "facing": "in", "lantern": True}],
    )
    home.crops([9, 1, 6, 6], ["potato", "cabbage"], stages=(1, 2, 2), seed=3)
    home.prop("well", (9, 9))
    home.prop("barrel", (11, 9))
    home.prop("woodpile", (13, 9))
    # The coop and two hives in the yard (#333, art round 3: the beehive and the chicken coop): the coop along y south of the cottage, the skeps in the row under the garden.
    home.prop("chicken_coop", (6, 8), footprint=[1, 2], note="the home's chicken coop (#333)")
    home.prop("beehive", (12, 7), note="a hive by the home's garden (#333)")
    home.prop("beehive", (14, 7))
    home.fence([0, 0, 16, 12], gates=[{"side": "s", "at": 4}, {"side": "w", "at": 9}])

    # ================= step 1: the village (29/04) =================
    # ---- the square: the well, the cross, the stalls, the trough, the board, the stocks, lamps ----
    g.prop("well", (sq[0] + 5, sq[1] + 5), note="the square's well (29/04)")
    g.prop("marketcross", (sq[0] + 6, sq[1]))
    for i, x in enumerate([sq[0], sq[0] + 3, sq[0] + 8, sq[0] + 10]):
        g.prop("stall", (x, sq[1]), footprint=[2, 1], note=["vegetables", "cloth", "pots", "knives"][i])
    g.prop("trough", (sq[0] + 2, sq[1] + 8), footprint=[2, 1])
    g.prop("noticeboard", (sq[0] + 11, sq[1] + 7), note="by the inn's door; the quest board of 1.1")
    g.prop("stocks", (sq[0] + 11, sq[1] + 11))
    for x, y in [(sq[0], sq[1] + 11), (sq[0] + 11, sq[1] + 2), (sq[0], sq[1] + 2)]:
        g.prop("lantern_post", (x, y))  # the square's lamps: lanterns, steady, burning nothing (they were torches until #156)
    # Torch posts by the square and along the high street (docs/43 section 4), each holding an unlit torch: a player lights them.
    for x, y in [(sq[0] + 6, sq[1] + 13), (64, HIGH_Y - 2), (76, HIGH_Y + 2), (114, HIGH_Y - 2), (118, HIGH_Y + 2)]:
        g.prop("torch_post", (x, y), torch=True, lit=False)

    # ---- the green: the pond with its dirt bank, benches, the maypole, a woodpile ----
    pond = P(15, 53)
    g.floor_rect([pond[0] - 1, pond[1] - 1, 8, 8], "floor_dirt", kind="bank")
    g.floor_rect([pond[0], pond[1], 6, 6], "floor_water", kind="water", group="pond", note="the duck pond (29/04)")
    g.prop("maypole", P(13, 51))
    g.prop("bench", (pond[0] - 2, pond[1] + 2), facing="e")
    g.prop("bench", (pond[0] + 7, pond[1] + 3), facing="w")
    g.prop("woodpile", P(19, 62))

    # ---- the inn (the square's east side): the taproom and kitchen, the guest wing, the yard ----
    inn = g.place("the inn", [P(21, 33)[0], P(21, 33)[1], 18, 30])
    inn.building(
        [1, 1, 12, 10], "wall_mahogany", "floor_wood",
        openings=[door("w", 4), window("w", 1, boards={"in": 3}), window("w", 7, boards={"in": 3}), window("n", 2, boards={"in": 3}), window("n", 9), door("e", 8)],
        partitions=[part_w(8, 0, 10, door_at=3)],
        props=[
            one("counter", 5, 0, footprint=[3, 1]), one("barrel", 7, 1), one("barrel", 7, 2),
            along_x("table", 1, 2), chair(1, 1, "s"), chair(2, 1, "s"), chair(1, 3, "n"), chair(2, 3, "n"),
            along_x("table", 1, 6), chair(1, 5, "s"), chair(2, 5, "s"), chair(1, 7, "n"), chair(2, 7, "n"),
            along_y("table", 5, 4), chair(4, 4, "e"), chair(6, 5, "w"),
            hearth_w(0, 8, lit=True),
            # the kitchen
            hearth_n(9, 0, lit=True), along_x("table", 9, 3), one("shelf", 11, 2), one("barrel", 11, 4), one("cupboard", 8, 6), one("barrel", 11, 9),
        ],
        brackets=[{"side": "n", "at": 5, "facing": "in", "lantern": True}, {"side": "w", "at": 4, "facing": "out", "lantern": True}],
    )
    # The guest wing: three rooms off the taproom's south wall, each with a door into it.
    inn.building(
        [1, 11, 12, 5], "wall_mahogany", "floor_wood",
        openings=[door("n", 1), door("n", 5), door("n", 9), window("s", 2), window("s", 6), window("s", 10)],
        partitions=[part_w(4, 0, 5), part_w(8, 0, 5)],
        props=[along_x("bed", 0, 2), one("chest", 3, 0), along_x("bed", 4, 2), one("chest", 7, 0), along_x("bed", 8, 2), one("chest", 11, 0)],
        brackets=[{"side": "s", "at": 0, "facing": "in", "lantern": True}, {"side": "s", "at": 8, "facing": "in", "lantern": True}],
    )
    inn.fence([0, 17, 18, 12], gates=[{"side": "w", "at": 6}])
    inn.prop("well", (3, 20))
    inn.prop("woodpile", (6, 19))
    inn.prop("privy", (16, 27))
    inn.prop("cart", (10, 22), footprint=[2, 3])
    inn.prop("trough", (13, 19), footprint=[2, 1])

    # ---- the chapel, the graveyard, the crypt (the top of the nobles' street) ----
    gy = P(9, 0)
    g.fence([gy[0], gy[1], 32, 14], gates=[{"side": "s", "at": 17}], note="the graveyard's wall (a low stone wall when drawn); the lychgate on the street")
    chapel = g.place("the chapel", [P(14, 1)[0], P(14, 1)[1], 12, 12])
    chapel.building(
        [1, 1, 10, 10], "wall_stone", "floor_stone",
        openings=[door("s", 4), window("w", 2), window("w", 6), window("e", 6)],
        partitions=[part_w(8, 0, 4, door_at=2)],
        props=[
            along_x("altar", 4, 0), one("lectern", 6, 1), one("font", 1, 8),
            along_x("pew", 1, 3), along_x("pew", 1, 5), along_x("pew", 1, 7), along_x("pew", 5, 3), along_x("pew", 5, 5), along_x("pew", 5, 7),
            one("chest", 9, 0), one("cupboard", 9, 3),
        ],
        brackets=[{"side": "n", "at": 2, "facing": "in", "torch": True, "lit": False}, {"side": "n", "at": 7, "facing": "in", "torch": True, "lit": False}],  # unlit torches (docs/43 section 4)
    )
    # Headstones in rows either side of the chapel, and the crypt in the north-east corner.
    pr = P(21, 2)  # the priest's house stands among the stones' rows; no stone stands in it (one did, in its walkway)
    for x in range(gy[0] + 2, gy[0] + 9, 2):
        for y in range(gy[1] + 2, gy[1] + 12, 3):
            if not (pr[0] <= x < pr[0] + 8 and pr[1] <= y < pr[1] + 8):
                g.prop("headstone", (x, y))
    for x in range(gy[0] + 23, gy[0] + 30, 2):
        for y in range(gy[1] + 7, gy[1] + 12, 3):
            if not (pr[0] <= x < pr[0] + 8 and pr[1] <= y < pr[1] + 8):
                g.prop("headstone", (x, y))
    crypt = g.place("the crypt", [gy[0] + 25, gy[1] + 1, 6, 6])
    crypt.building([1, 1, 4, 4], "wall_stone", "floor_stone", openings=[door("w", 2)],
                   props=[along_y("coffin", 0, 0), along_y("coffin", 3, 0), one("chest", 3, 3)],
                   brackets=[{"side": "n", "at": 1, "facing": "in", "torch": True, "lit": False}])  # an unlit torch (docs/43 section 4)

    # ---- the priest's house, east of the chapel ----
    priest = g.place("the priest's house", [P(21, 2)[0], P(21, 2)[1], 8, 8])
    priest.building([1, 1, 6, 6], "wall_daub", "floor_wood",
                    openings=[door("s", 1, boards={"in": 2}), window("e", 2)],
                    partitions=[part_w(3, 0, 6, door_at=3)],
                    props=[hearth_w(0, 1), along_x("table", 1, 4), chair(2, 5, "n"), one("bookcase", 2, 0), along_y("bed", 5, 0), one("chest", 5, 5)],
                    brackets=[{"side": "n", "at": 4, "facing": "in", "lantern": True}])

    # ---- the manor: a stone house in a walled garden, east of the nobles' street ----
    man = g.place("the manor", [P(19, 16)[0], P(19, 16)[1], 16, 34])
    man.building(
        [1, 1, 12, 10], "wall_stone", "floor_stone",
        openings=[door("w", 3), window("w", 7), window("n", 3), window("n", 9), window("e", 2), window("e", 7), door("s", 9)],
        partitions=[part_w(7, 0, 10, door_at=5), part_n(0, 6, 7, door_at=3)],
        props=[
            # the hall
            hearth_n(2, 0), along_y("table", 3, 2), chair(2, 2, "e"), chair(2, 3, "e"), chair(4, 2, "w"), chair(4, 3, "w"), one("cupboard", 6, 0), one("chest", 0, 5),
            # the kitchen (south of the hall)
            hearth_w(0, 7), along_x("table", 2, 7), one("barrel", 5, 9), one("shelf", 6, 6), one("cupboard", 6, 9),
            # the solar and bedroom (east)
            along_x("bed", 8, 1), one("chest", 11, 0), one("bookcase", 7, 0), one("desk", 10, 4), chair(10, 5, "n"), one("strongbox", 11, 9), one("cupboard", 8, 9),
        ],
        brackets=[{"side": "n", "at": 6, "facing": "in", "lantern": True}, {"side": "e", "at": 5, "facing": "in", "lantern": True}],
    )
    man.fence([0, 12, 16, 22], gates=[{"side": "w", "at": 6}, {"side": "e", "at": 14}], wall="wall_fence")
    man.floor_rect([2, 14, 12, 8], "floor_grass")
    man.prop("bench", (4, 16), facing="s")
    man.prop("bench", (10, 16), facing="s")
    for i in range(3):
        man.prop("beehive", (3 + i * 3, 24))
    man.floor_rect([9, 26, 4, 4], "floor_dirt")
    man.floor_rect([10, 27, 2, 2], "floor_water", group="pond")
    man.prop("trough", (2, 30), footprint=[2, 1])

    # ---- the merchant's house, west of the nobles' street: the house, the yard, the storehouse ----
    mer = g.place("the merchant's house", [P(8, 20)[0], P(8, 20)[1], 12, 24])
    mer.building(
        [1, 1, 10, 10], "wall_stone", "floor_stone",
        openings=[door("e", 2), window("e", 7), window("n", 2), window("w", 2), window("w", 7), door("s", 7)],
        partitions=[part_w(5, 0, 10, door_at=2), part_n(5, 5, 5, door_at=2)],
        props=[
            hearth_w(0, 1), along_y("table", 2, 3), chair(1, 3, "e"), chair(3, 4, "w"), one("cupboard", 4, 0), one("shelf", 0, 8), one("chest", 4, 9),
            one("desk", 6, 1), chair(6, 2, "n"), one("strongbox", 9, 0), one("bookcase", 9, 3),
            along_x("bed", 6, 7), one("chest", 9, 9), one("cupboard", 9, 6),
        ],
        brackets=[{"side": "n", "at": 7, "facing": "in", "lantern": True}, {"side": "w", "at": 5, "facing": "in", "lantern": True}],
    )
    mer.fence([0, 12, 12, 12], gates=[{"side": "e", "at": 5}])
    mer.building([1, 13, 8, 6], "wall_mahogany", "floor_wood", openings=[door("e", 2)],
                 props=[one("shelf", 0, 0), one("shelf", 2, 0), one("shelf", 4, 0), one("chest", 7, 0), one("barrel", 0, 5), one("barrel", 1, 5), one("chest", 7, 5), one("cupboard", 4, 5)],
                 brackets=[{"side": "n", "at": 6, "facing": "in", "lantern": True}])
    mer.prop("cart", (10, 20), footprint=[2, 3])

    # ---- the trades round the square ----
    # The baker, the square's north-west corner: the oven in the shop wall, a room behind.
    bak = g.place("the baker", [P(9, 46)[0], P(9, 46)[1], 8, 6])
    bak.building([1, 1, 6, 4], "wall_daub", "floor_wood",
                 openings=[door("n", 2), window("n", 3)],
                 partitions=[part_w(4, 0, 4, door_at=2)],
                 props=[one("oven", 0, 0, footprint=[2, 1], lit=True, fuel=2), along_x("table", 1, 2), one("shelf", 3, 0), one("barrel", 0, 3), along_y("bed", 5, 0), one("chest", 4, 3)],
                 brackets=[{"side": "n", "at": 5, "facing": "in", "lantern": True}])
    # The joiner, south-west of the square: the workshop, the home behind, the lumber yard.
    joi = g.place("the joiner", [P(7, 49)[0], P(7, 49)[1], 10, 14])
    joi.building([1, 1, 8, 5], "wall_wood", "floor_wood",
                 openings=[door("e", 2), window("n", 2), window("n", 5)],
                 props=[one("workbench", 1, 1, footprint=[2, 1]), along_x("table", 4, 1), one("shelf", 7, 0), one("shelf", 0, 0), one("barrel", 7, 4), one("chest", 0, 4, loot="joiner_chest")],
                 brackets=[{"side": "n", "at": 4, "facing": "in", "lantern": True}])
    joi.building([1, 6, 8, 5], "wall_wood", "floor_wood",
                 openings=[door("n", 3), window("w", 2), window("e", 3)],
                 partitions=[part_w(4, 0, 5, door_at=2)],
                 props=[hearth_w(0, 1), along_x("table", 1, 3), chair(2, 4, "n"), along_x("bed", 5, 0), one("chest", 7, 4)])
    joi.prop("sawpit", (2, 12), footprint=[2, 1])
    joi.prop("woodpile", (6, 12))
    joi.prop("woodpile", (7, 12))
    joi.prop("wheelbarrow", (0, 12), note="the joiner's wheelbarrow (docs/30 section 9.1)")
    # The weaver, west of the square on the west road: the loom, the vats in the yard.
    wea = g.place("the weaver", [P(5, 32)[0], P(5, 32)[1], 14, 10])
    wea.building([1, 1, 8, 6], "wall_spruce", "floor_wood",
                 openings=[door("s", 2), window("s", 6), window("n", 2)],
                 partitions=[part_w(5, 0, 6, door_at=2)],
                 props=[one("loom", 1, 1, footprint=[2, 2]), one("spinningwheel", 4, 1), one("shelf", 0, 0), one("cupboard", 4, 5), along_x("bed", 6, 0), one("chest", 7, 5, loot="weaver_chest"), hearth_w(5, 3)],
                 brackets=[{"side": "n", "at": 6, "facing": "in", "lantern": True}])
    for i in range(3):
        wea.prop("dyevat", (10 + i, 3))
    wea.prop("woodpile", (12, 7))
    # The smithy, south-east of the square by the river: the open forge, the home beside it.
    smi = g.place("the smithy", [P(21, 50)[0], P(21, 50)[1], 12, 12])
    smi.building([1, 1, 6, 5], "wall_wood", "floor_stone",
                 openings=[door("s", 1, open=True), door("s", 4, open=True), window("n", 3)],
                 props=[one("forge", 1, 0, footprint=[2, 1]), one("anvil", 2, 2), one("barrel", 4, 2), one("grindstone", 3, 4), one("shelf", 0, 0), one("chest", 0, 4, loot="smithy_chest")],
                 brackets=[{"side": "n", "at": 5, "facing": "in", "lantern": True}])
    smi.building([7, 1, 4, 5], "wall_wood", "floor_wood", openings=[door("w", 2), window("e", 1)],
                 props=[along_y("bed", 3, 0), one("chest", 3, 4), one("cupboard", 0, 4)])
    smi.prop("woodpile", (1, 8))
    smi.prop("charcoal_clamp", (9, 8), footprint=[2, 2])  # one in the smithy's yard, so the smith's loop needs no walk to the woods (#197)
    smi.prop("cart", (6, 7), footprint=[2, 3])

    # ---- the toll house by the bridge ----
    toll = g.place("the toll house", [P(28, 45)[0], P(28, 45)[1], 6, 8])
    toll.building([1, 1, 4, 4], "wall_spruce", "floor_wood", openings=[door("w", 1), window("n", 2)],
                  props=[one("strongbox", 3, 0), along_y("bed", 0, 2), one("chest", 3, 3, loot="toll_chest"), one("shelf", 2, 0)],
                  brackets=[{"side": "w", "at": 3, "facing": "out", "lantern": True}])

    # ---- the cottages: two plans by the nobles' street, two by the green, four on the lane ----
    cottage_a(g, *P(1, 23), "a cottage by the merchant's", apple=True, wall="wall_daub")
    cottage_b(g, *P(1, 27), "the cooper's long house", wall="wall_spruce")
    cottage_a(g, *P(1, 47), "a cottage by the baker's", door_side="n", apple=True)
    cottage_c(g, *P(1, 52), "the chandler's house", trade="chandler", wall="wall_mahogany")
    cottage_a(g, *P(2, 65), "the first cottage on the lane", door_side="n", broken=True, apple=True, wall="wall_daub")   # the door kicked in
    cottage_b(g, *P(7, 65), "the second cottage on the lane")
    cottage_a(g, *P(12, 65), "the shut cottage", door_side="n", torch=False, wall="wall_spruce")             # a neighbour inside who will not open
    # The reeve's house at the row's end by the green: stone at the back, wood at the front.
    reeve = g.place("the reeve's house", [P(17, 65)[0], P(17, 65)[1], 8, 6])
    reeve.building([1, 1, 6, 4], {"n": "wall_stone", "w": "wall_stone", "s": "wall_mahogany", "e": "wall_mahogany"}, "floor_wood",
                   openings=[door("n", 1), window("n", 4), window("e", 1)],
                   partitions=[part_w(3, 0, 4, door_at=2)],
                   props=[hearth_w(0, 1), along_x("table", 1, 3), chair(1, 2, "s"), one("desk", 0, 0), along_x("bed", 3, 0), one("chest", 5, 3), one("bookcase", 3, 3)],
                   brackets=[{"side": "n", "at": 5, "facing": "in", "lantern": True}])

    # ---- Hollow Farm's orchard (29/05, "the orchard"; #190): apple trees in staggered rows on grass, a barrel or two. The rest of the farm is step 4's. ----
    orchard = g.place("the orchard", [38, 232, 16, 18])
    for j in range(5):
        for i in range(4):
            x = 2 + 3 * i + (1 if j % 2 else 0)
            orchard.prop("tree_apple", (x, 2 + 3 * j))
    orchard.prop("barrel", (1, 16))
    orchard.prop("barrel", (3, 16))

    # ================= step 4: the farms and the mill (29/05, 29/02; #201) =================
    # ---- Hollow Farm (29/05), compact: it lives in the reserve south of the lane, the orchard its west end. The south lane runs on into its yard. ----
    g.road([(90, 226), (90, 238)], 2, "floor_dirt", group="south lane")
    g.floor_rect([56, 237, 44, 4], "floor_dirt", kind="road", group="Hollow Farm's yard")
    # The great barn: the biggest wooden building at the farm, a double door on the yard; the tool rack holds a hoe.
    barn = g.place("Hollow Farm's great barn", [56, 228, 16, 10])
    barn.building(
        [1, 1, 14, 8], "wall_spruce", "floor_wood",
        openings=[door("s", 6), door("s", 7), window("n", 3), window("n", 10)],
        props=[
            one("shelf", 0, 0, loot="barn_rack"), one("shelf", 2, 0), one("barrel", 5, 0), one("barrel", 6, 0), one("barrel", 12, 0),
            one("haystack", 11, 0, loot="wild"), one("haystack", 11, 2, loot="wild"), one("haystack", 13, 2, loot="wild"), one("cart", 1, 3, footprint=[2, 3]),
        ],
        brackets=[{"side": "n", "at": 7, "facing": "in", "lantern": True}],
    )
    # The farmhouse: a kitchen with the big hearth, a bedroom, a store; the family turned, in the yard.
    fh = g.place("Hollow Farm's farmhouse", [74, 228, 14, 10])
    fh.building(
        [1, 1, 12, 8], "wall_daub", "floor_wood",
        openings=[door("s", 2), window("n", 2), window("n", 9), window("e", 3), window("s", 8)],
        partitions=[part_w(6, 0, 8, door_at=3), part_n(7, 4, 5, door_at=2)],
        props=[
            hearth_w(0, 1), along_x("table", 1, 4), chair(1, 3, "s"), chair(2, 3, "s"), one("cupboard", 4, 0), one("shelf", 3, 7), one("barrel", 5, 7),
            along_x("bed", 7, 0), one("chest", 11, 0), one("chest", 11, 3),
            one("shelf", 7, 7), one("barrel", 9, 7), one("chest", 11, 7),
        ],
        brackets=[{"side": "n", "at": 5, "facing": "in", "lantern": True}],
    )
    # The granary: seed of every crop, in sacks on a shelf; never refilled (the fields are the renewable source).
    gran = g.place("Hollow Farm's granary", [92, 228, 8, 8])
    gran.building(
        [1, 1, 6, 6], "wall_spruce", "floor_wood",
        openings=[door("s", 2)],
        props=[one("chest", 0, 0, loot="granary_hollow"), one("barrel", 1, 0), one("barrel", 5, 0), one("barrel", 5, 1)],
        brackets=[{"side": "n", "at": 3, "facing": "in", "lantern": True}],
    )
    # The yard: the well, a woodpile, a cart, the barrels by the barn, the trough, and (#333) a coop and three hives: one place, so the wiki's where-found tables read them under the farm.
    yard = g.place("Hollow Farm's yard", [56, 238, 44, 4], padding=0)
    yard.prop("well", (28, 1), note="Hollow Farm's well (29/05)")
    yard.prop("woodpile", (4, 0))
    yard.prop("woodpile", (5, 0))
    yard.prop("cart", (10, 0), footprint=[2, 3])
    # The coop at the yard's west end, clear of the pumpkin fence's fade, and three hives east of the lane, clear of the potato field's gate (#333).
    yard.prop("chicken_coop", (16, 0), footprint=[1, 2], note="Hollow Farm's chicken coop (#333)")
    yard.prop("feed_trough", (19, 0), id="feed_trough_hens", note="the hens' feeding trough by their coop (docs/45 section 3)")
    yard.prop("beehive", (39, 1), note="Hollow Farm's hives (#333)")
    yard.prop("beehive", (41, 1))
    yard.prop("beehive", (43, 1))
    # The farm pond below the orchard (29/02): a dirt bank and still water, where the beasts drank; the trough where the lane meets it.
    g.floor_rect([57, 243, 8, 6], "floor_dirt", kind="bank")
    g.floor_rect([58, 244, 6, 4], "floor_water", kind="water", group="pond", note="the farm pond (29/05)")
    yard.prop("trough", (3, 3), footprint=[2, 1])
    # The pumpkin field: the biggest on the map, pumpkins at every stage, a scarecrow in the middle, inside a fence with a gate on the yard.
    pump = g.place("Hollow Farm's pumpkin field", [67, 241, 20, 14])
    pump.crops([1, 1, 18, 12], ["pumpkin"], stages=(0, 1, 2, 2), seed=2, skip={(9, 6)})
    pump.prop("scarecrow", (9, 6))
    pump.fence([0, 0, 20, 14], gates=[{"side": "n", "at": 9}, {"side": "e", "at": 7}])
    # Potatoes, cabbages, garlic: smaller plots, each fenced with a gate.
    pot = g.place("Hollow Farm's potatoes", [89, 241, 10, 7])
    pot.crops([1, 1, 8, 5], ["potato"], stages=(0, 1, 2, 2), seed=4)
    pot.fence([0, 0, 10, 7], gates=[{"side": "n", "at": 4}, {"side": "w", "at": 3}])
    cab = g.place("Hollow Farm's cabbages", [89, 249, 10, 6])
    cab.crops([1, 1, 8, 4], ["cabbage"], stages=(0, 1, 2, 2), seed=1)
    cab.fence([0, 0, 10, 6], gates=[{"side": "w", "at": 2}])
    gar = g.place("Hollow Farm's garlic", [57, 250, 10, 5])
    gar.crops([1, 1, 8, 3], ["garlic"], stages=(0, 1, 2, 2), seed=3)
    gar.fence([0, 0, 10, 5], gates=[{"side": "n", "at": 5}])

    # ---- Long Acre (29/05) and the mill (29/02): the north lane leaves the west road and runs to the mill; a lane to the mere branches off it and crosses the brook on a plank footbridge ----
    g.road([(54, 62), (54, HIGH_Y)], 2, "floor_dirt", group="the north lane")  # drawn top to bottom so a straight run merges into one rect
    g.road([(54, 62), (104, 62)], 2, "floor_dirt", group="the north lane")
    g.road([(80, 18), (80, 62)], 1, "floor_dirt", group="the lane to the mere")
    g.river([(58, 28), (115, 28)], width=2, bank=1, group="brook")
    g.floor_rect([80, 26, 1, 4], "floor_wood", kind="bridge", note="the plank footbridge (29/02); floor_bridge_plank when drawn")
    la = g.place("Long Acre's farmhouse", [66, 39, 12, 9])
    la.building(
        [1, 1, 10, 7], "wall_daub", "floor_wood",
        openings=[door("s", 3), window("n", 2), window("n", 7), window("w", 3)],
        partitions=[part_w(5, 0, 7, door_at=3)],
        props=[hearth_w(0, 1), along_x("table", 1, 4), chair(1, 3, "s"), one("cupboard", 3, 0), one("barrel", 0, 6), along_x("bed", 6, 0), one("chest", 9, 0), one("chest", 9, 5), one("shelf", 6, 6)],
        brackets=[{"side": "n", "at": 4, "facing": "in", "lantern": True}],
    )
    la.prop("woodpile", (11, 7))
    lb = g.place("Long Acre's barn", [83, 38, 14, 10])
    lb.building(
        [1, 1, 12, 8], "wall_spruce", "floor_stone",
        openings=[door("s", 5), door("s", 6), window("n", 5)],
        props=[one("barrel", 0, 0), one("barrel", 1, 0), one("barrel", 2, 0), one("haystack", 10, 0, loot="wild"), one("haystack", 10, 2, loot="wild"), one("cart", 1, 3, footprint=[2, 3])],
        brackets=[{"side": "n", "at": 8, "facing": "in", "lantern": True}],
    )
    g.floor_rect([66, 49, 31, 2], "floor_dirt", kind="road", group="Long Acre's yard")
    g.prop("well", (78, 50), note="Long Acre's well (29/05)")
    g.prop("haystack", (90, 50), loot="wild")
    g.prop("haystack", (93, 50), loot="wild")
    # The rye fields (furrows along y, so the drawn floor_farm_y is used at scale), a flax strip for the loom, a kitchen garden.
    ra = g.place("Long Acre's west rye", [66, 52, 13, 9])
    ra.crops([1, 1, 11, 7], ["rye"], stages=(0, 1, 2, 2), seed=2, floor="floor_farm_y")
    ra.fence([0, 0, 13, 9], gates=[{"side": "n", "at": 6}, {"side": "s", "at": 6}, {"side": "e", "at": 4}])
    rb = g.place("Long Acre's east rye", [82, 52, 13, 9])
    rb.crops([1, 1, 11, 7], ["rye"], stages=(0, 1, 2, 2), seed=5, floor="floor_farm_y")
    rb.fence([0, 0, 13, 9], gates=[{"side": "n", "at": 6}, {"side": "s", "at": 6}, {"side": "w", "at": 4}])
    fx = g.place("Long Acre's flax", [67, 30, 8, 9])
    fx.crops([1, 1, 6, 7], ["flax"], stages=(0, 1, 2, 2), seed=1, floor="floor_farm_y")
    fx.fence([0, 0, 8, 9], gates=[{"side": "s", "at": 3}])
    kg = g.place("Long Acre's kitchen garden", [83, 30, 10, 7])
    kg.crops([1, 1, 8, 5], ["cabbage", "garlic"], stages=(0, 1, 2, 2), seed=2)
    kg.fence([0, 0, 10, 7], gates=[{"side": "s", "at": 4}])
    # The mill on the river's west bank, its wheel against the river wall; the mill's granary beside it.
    mill = g.place("the mill", [98, 54, 12, 9])
    mill.building(
        [1, 1, 9, 6], "wall_wood", "floor_stone",
        openings=[door("s", 2), window("n", 3), window("w", 2)],
        props=[one("millstones", 1, 1, footprint=[2, 2]), one("barrel", 5, 0), one("barrel", 6, 0), one("chest", 8, 0), one("shelf", 8, 4), one("barrel", 4, 4)],
        brackets=[{"side": "n", "at": 6, "facing": "in", "lantern": True}],
    )
    mill.prop("millwheel", (10, 2), footprint=[1, 3])
    mgran = g.place("the mill's granary", [98, 43, 8, 8])
    mgran.building(
        [1, 1, 6, 6], "wall_wood", "floor_wood",
        openings=[door("s", 2)],
        props=[one("chest", 0, 0, loot="granary_mill"), one("barrel", 1, 0), one("barrel", 5, 0), one("barrel", 5, 1)],
        brackets=[{"side": "n", "at": 3, "facing": "in", "lantern": True}],
    )

    # ---- the iron workings (29/06; #196): east woods, a low cliff with the mine's mouth, ore rocks, a tramway, the miners' hut ----
    iw = g.place("the iron workings", [214, 140, 30, 16])
    iw.fence([0, 0, 28, 5], wall="wall_stone", sides=["n", "w", "e"])  # the low cliff, wall_stone until wall_cliff is drawn
    iw.prop("mine_mouth", (13, 0), footprint=[2, 1])
    iw.prop("spoil_heap", (9, 1), footprint=[2, 1])
    iw.prop("spoil_heap", (17, 1), footprint=[2, 1])
    iw.prop("winch", (11, 2))
    iw.floor_rect([13, 1, 2, 9], "floor_wood")  # the tramway of planks
    iw.prop("ore_cart", (14, 4), footprint=[1, 2])
    for x, y in ((4, 3), (21, 3), (7, 8), (22, 8), (26, 6), (3, 11)):
        iw.prop("ore_rock", (x, y))
    miners = g.place("the miners' hut", [232, 148, 10, 8])
    miners.building([1, 1, 8, 5], "wall_wood", "floor_wood",
                    openings=[door("w", 2), window("n", 4)],
                    props=[along_x("bed", 0, 0), along_x("bed", 4, 0), one("chest", 7, 0, loot="miners_chest"), one("barrel", 7, 3), along_x("table", 3, 3)],
                    brackets=[{"side": "n", "at": 2, "facing": "in", "lantern": True}])

    # ---- the quarry (29/06; #196): north-east, a pit cut into the rock on three sides, cut stone, mineable rocks, a crane, the quarryman's hut ----
    qy = g.place("the quarry", [184, 36, 36, 24])
    qy.fence([0, 0, 34, 22], wall="wall_stone", sides=["n", "w", "e"])  # the cliff faces, wall_stone until wall_cliff is drawn; open to the south
    qy.floor_rect([1, 1, 33, 21], "floor_dirt")
    for x in (5, 7, 9, 11):
        qy.prop("stone_stack", (x, 2))
    qy.prop("crane", (27, 3))
    for i, (x, y) in enumerate(((4, 8), (9, 9), (14, 6), (19, 8), (23, 6), (29, 9), (17, 14), (30, 15))):
        qy.prop(f"rock_{i % 4}", (x, y))
    qy.floor_rect([24, 13, 5, 5], "floor_dirt")
    qy.floor_rect([25, 14, 3, 3], "floor_water", group="pond")  # the flooded pit
    qy.prop("wheelbarrow", (15, 11))
    quarryman = g.place("the quarryman's hut", [186, 50, 10, 8])
    quarryman.building([1, 1, 8, 5], "wall_spruce", "floor_wood",
                       openings=[door("e", 2), window("n", 4)],
                       props=[along_x("bed", 0, 0), one("chest", 7, 0, loot="quarry_chest"), one("barrel", 7, 3), along_x("table", 2, 3)],
                       brackets=[{"side": "n", "at": 2, "facing": "in", "lantern": True}])

    # ---- the charcoal burners (29/06; #197): east woods, south of the iron workings: a black clearing, three clamps, a turf hut, sacks of charcoal ----
    cb = g.place("the charcoal burners", [212, 168, 24, 14])
    cb.floor_rect([1, 1, 22, 12], "floor_dirt")
    for x in (3, 9, 15):
        cb.prop("charcoal_clamp", (x, 3), footprint=[2, 2])
    cb.prop("charcoal_sack", (4, 8))
    cb.prop("charcoal_sack", (6, 8))
    cb.prop("wheelbarrow", (11, 8))
    cb.prop("campfire", (18, 9), fuel=2)  # the burners' own fire (docs/43, section 3): cold, two logs in it
    hut = g.place("the burners' hut", [234, 168, 8, 8])
    hut.building([1, 1, 6, 5], "wall_wood", "floor_wood",
                 openings=[door("w", 2), window("n", 3)],
                 props=[along_x("bed", 0, 0), one("barrel", 5, 0), one("chest", 5, 3, loot="charcoal_sacks")],
                 brackets=[{"side": "n", "at": 1, "facing": "in", "lantern": True}])

    # ---- the beasts' pens (docs/45; docs/39's byre and pigsty at Hollow Farm, the croft's sheepfold across the ford) ----
    # West of the orchard, clear of the farm's reserve: the byre's paddock and the pigsty, each a fence with a gate toward the farm.
    byre = g.place("Hollow Farm's byre", [20, 232, 14, 10])
    byre.fence([0, 0, 14, 10], gates=[{"side": "e", "at": 5}])
    byre.prop("feed_trough", (10, 2), id="feed_trough_byre", note="the byre's feeding trough (docs/45 section 3): empty until a player fills it")
    sty = g.place("Hollow Farm's pigsty", [22, 244, 10, 8])
    sty.floor_rect([1, 1, 8, 6], "floor_dirt")
    sty.fence([0, 0, 10, 8], gates=[{"side": "e", "at": 3}])
    sty.prop("feed_trough", (6, 2), id="feed_trough_sty", note="the pigsty's feeding trough (docs/45 section 3)")
    g.reserve([18, 230, 20, 24])
    # The croft's sheepfold, south of the drove past the ford (docs/39: the croft, its cottage and the shepherd to come).
    fold = g.place("the croft's sheepfold", [146, 211, 12, 9])
    fold.fence([0, 0, 12, 9], gates=[{"side": "n", "at": 6}])
    fold.prop("feed_trough", (3, 2), id="feed_trough_fold", note="the sheepfold's feeding trough (docs/45 section 3)")

    # ---- reserves: the castle (step 5) and the farms (step 4) take no forest yet ----
    g.reserve([VX, VY, 64, 144])      # the village block, 29/04's plan
    g.reserve([136, 126, 66, 64])     # the castle's compound (29/03 at (140, 130)) with its moat
    g.reserve([36, 230, 64, 26])      # Hollow Farm's ground south of the lane (29/05), shifted clear of the cottages
    g.reserve([64, 24, 56, 44])       # Long Acre and the mill (29/05)

    # ---- the forest: everywhere else, thicker than the proving ground's ----
    g.scatter([0, 0, SIZE, SIZE], "harvest", (0.05, 0.16), seed=11)
    g.wild("harvest", (0.0405, 0.1305), seed=21, zombies_per_chunk=(0, 2),
           rocks={"kinds": {"rock_0": 1, "rock_1": 1, "rock_2": 1, "rock_3": 1}, "cell": 40, "chance": 0.6, "seed": 51})
    g.forage({"mushroom_0": 1, "mushroom_1": 1, "mushroom_2": 1, "mushroom_3": 1, "mushroom_4": 1}, chance=0.021, near=2, seed=41)

    # ---- natural resources (docs/46, #288): what comes back, and where; the counts are docs/42's levers ----
    # Stone everywhere on natural ground in the valley, the quarry's pit open to it (its eight, and the rest placed at the load by the
    # comeback's rule); ore at the iron workings and the hills round them (their six); mushrooms near trees anywhere in the woods (the
    # forage's 774).
    ROCKS = {"rock_0": 1, "rock_1": 1, "rock_2": 1, "rock_3": 1}
    ORE_AREA = [[206, 130, 46, 34]]
    g.resource("stone", ROCKS, 40, open=["the quarry"], open_floors=["floor_dirt"], rise=True, seed=61)
    g.resource("ore", {"ore_rock": 1}, 6, rects=ORE_AREA, open=["the iron workings"], rise=True, seed=62)
    g.resource("mushrooms", {"mushroom_0": 1, "mushroom_1": 1, "mushroom_2": 1, "mushroom_3": 1, "mushroom_4": 1}, 774, near=2, solid=False, jitter=0.6, seed=63, where="under trees")
    # Step 2 (#448): the herbs, 120 in all, grow like weeds at random on natural ground, never in patches, each kind favouring its ground
    # (docs/46 section 2): the common herbs and the dye plants anywhere, the mana herb within two tiles of water (by the river and the brook
    # west of Long Acre, the open water), nightshade and wolfsbane near trees, the graveyard's inside its wall (its own place, its fence
    # open to it), coming back only at night. The rarer a kind, the fewer (a default, Primary's; the split is docs/42's lever). Clay banks
    # on the river's own dirt bank, beside its water, the ford's band left out (the drove's dirt meets the water there); salt rocks in the
    # ore area, rising as the ore does.
    RIVER = [[106, 0, 24, 110], [116, 110, 20, 80], [124, 190, 24, 66]]  # the river's corridor, top to bottom (its polyline at the top of build)
    BROOK = [56, 23, 64, 10]  # the brook and its banks (above); Long Acre's reserve keeps all but its west end
    CLAY_AREA = [[106, 0, 24, 110], [116, 110, 20, 80], [124, 190, 24, 12], [124, 212, 24, 44]]  # the corridor less the ford's band, y 202 to 211
    GRAVEYARD = [gy[0], gy[1], 32, 14]  # inside the graveyard's wall
    HERBS = [  # the kind (its node is herb_<kind>, its item <kind>), its count, and where it grows
        ("sage", 16, {}), ("nettle", 16, {}), ("feverfew", 14, {}), ("yarrow", 16, {}),
        ("woad", 10, {}), ("madder", 10, {}), ("weld", 10, {}),
        ("mana_herb", 10, {"rects": RIVER + [BROOK], "water": 2, "where": "near water"}),
        ("nightshade", 7, {"near": 2, "where": "near trees"}), ("wolfsbane", 7, {"near": 2, "where": "near trees"}),
        ("grave_moss", 4, {"rects": [GRAVEYARD], "own": True, "night": True, "where": "in the graveyard"}),
    ]
    for i, (name, count, where) in enumerate(HERBS):
        g.resource(name, {f"herb_{name}": 1}, count, solid=False, jitter=0.5, seed=64 + i, **{"where": "in the valley", **where})
    g.resource("clay", {"clay_bank": 1}, 8, rects=CLAY_AREA, floors=["floor_dirt"], water=1, water_group="river", seed=80, where="by the river")
    g.resource("salt", {"salt_rock": 1}, 4, rects=ORE_AREA, open=["the iron workings"], rise=True, seed=81, where="at the iron workings")

    # ---- the dead (29/08): the streets and the square, the bridge's two ends, the graveyard, the trades, the nobles, the cottages ----
    dead = []
    dead += [(sq[0] + 3, sq[1] + 3), (sq[0] + 9, sq[1] + 9), (sq[0] + 8, sq[1] + 4), (sq[0] + 2, sq[1] + 10)]          # the square
    dead += [P(17, 12), P(17, 26), P(16, 30)]                                                                         # the nobles' street
    dead += [P(17, 52), P(17, 58), P(10, 64), (86, 212), P(12, 40)]                                                     # the lanes
    dead += [(114, HIGH_Y + 2), (115, HIGH_Y - 2), (113, HIGH_Y + 3), (117, HIGH_Y - 3), (112, HIGH_Y), (116, HIGH_Y + 1)]  # the toll gate's knot
    dead += [(135, HIGH_Y + 1), (136, HIGH_Y - 2), (137, HIGH_Y + 2), (138, HIGH_Y)]                                  # the castle end
    dead += [(gy[0] + 3, gy[1] + 4), (gy[0] + 7, gy[1] + 10), (gy[0] + 5, gy[1] + 7), (gy[0] + 24, gy[1] + 9), (gy[0] + 28, gy[1] + 12), (gy[0] + 13, gy[1] + 12), (gy[0] + 20, gy[1] + 12), (gy[0] + 10, gy[1] + 1)]  # the graveyard, rising
    dead += [(smi.x + 2, smi.y + 7), (bak.x + 3, bak.y + 0), (joi.x + 9, joi.y + 3), (wea.x + 9, wea.y + 8)]           # the trades, at their work
    dead += [(mer.x + 4, mer.y + 4), (mer.x + 2, mer.y + 15), (man.x + 8, man.y + 18)]                                 # the nobles
    dead += [P(5, 24), P(9, 63), P(3, 50)]                                                                             # the cottages
    dead += [(70, 238), (79, 239), (62, 238), (86, 238), (90, 232)]                                                # Hollow Farm's yard: the family
    dead += [(72, 56), (88, 56), (84, 49), (90, 42)]                                                                  # Long Acre: two in the rye, one in the yard, one in the barn
    dead += [(216, 150), (225, 152), (229, 160), (219, 156), (238, 151)]                                                # the iron workings
    dead += [(190, 45), (200, 40), (210, 44), (193, 52), (203, 50)]                                                     # the quarry
    dead += [(220, 172), (226, 175), (214, 178)]                                                                        # the charcoal burners
    for x, y in dead:
        g.zombie(x, y)

    # ---- the animals (docs/45, step 1): game in the woods ringing the valley, each herd a clearing it drifts back to and is renewed at;
    # the farms' stock where docs/39 has it. Defaults, Primary's, Michael's to move. ----
    g.animals("deer", (22, 120), 3, cap=4, name="the west wood")
    g.animals("deer", (30, 40), 4, name="the north-west wood")
    g.animals("deer", (160, 72), 3, cap=4, name="the north-east wood")
    g.animals("deer", (232, 110), 2, cap=3, name="the east wood")
    g.animals("deer", (190, 226), 3, cap=4, name="the south-east wood")
    g.animals("deer", (14, 196), 2, cap=3, name="the south-west wood")
    g.animals("rabbit", (48, 150), 3, name="the village's west edge")
    g.animals("rabbit", (70, 14), 2, cap=3, name="above Long Acre")
    g.animals("rabbit", (150, 104), 2, cap=3, name="the castle's north edge")
    g.animals("rabbit", (44, 222), 3, name="the farm lane's edge")
    g.animals("rabbit", (205, 200), 2, cap=3, name="the burners' edge")
    g.animals("boar", (14, 80), 2, name="the far west wood")
    g.animals("boar", (240, 240), 2, name="the far south-east wood")
    g.animals("hen", (74, 239), 3, name="Hollow Farm's hens", clearing=False)
    g.animals("cow", (27, 237), 2, name="Hollow Farm's byre", clearing=False)
    g.animals("pig", (27, 248), 2, name="Hollow Farm's pigsty", clearing=False)
    g.animals("sheep", (152, 215), 4, name="the croft's sheep", clearing=False)

    # ---- the living (29/08's cast; names are Michael's to give, placeholders until then) ----
    # The guide stands just outside your cottage's door, in view on stepping out and under three tiles from the spawn: the neighbour from the farm
    # lane, who came here when the bell stopped and has not gone home (docs/34; the name is a placeholder for Michael's, and the wardrobe her own).
    g.guide((102, 218), "Wyn", 6, "Ask me anything, if you are stuck.")
    g.villager((inn.x + 6, inn.y + 3), "Innkeeper", 0, "Shut that behind you.", immune=True)  # the steady ones: they will teach, so they cannot die (#180)
    g.villager((inn.x + 3, inn.y + 12), "Guest", 1, "I only stopped for the night.")
    g.villager((inn.x + 4, inn.y + 6), "Child", 5)
    g.villager((chapel.x + 9, chapel.y + 2), "Priest", 2, "The bell stopped on the third day.", immune=True)
    g.villager((reeve.x + 2, reeve.y + 3), "Reeve", 3, "I have the keys and no one to give them to.")
    g.villager((mer.x + 4, mer.y + 16), "Apprentice", 4, "It is all here. Every bale. Nobody to buy it.")
    g.villager((P(12, 65)[0] + 2, P(12, 65)[1] + 3), "Neighbour", 1, "Go away.")
    g.villager((mill.x + 5, mill.y + 4), "Miller", 4, "Grain is grain. Bring it, I will grind it.")  # not immune: he teaches nothing yet (29/08)

    return g


if __name__ == "__main__":
    root = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
    out = os.path.join(root, "data", "maps", "valley.json")
    build().write(out)
    print("wrote", out)
