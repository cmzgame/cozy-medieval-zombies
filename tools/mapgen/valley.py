"""The valley: the 1.0 map (docs/29-world, ruled in docs/30), built place by
place. Step 0 lays the bones: the bounds, the river with its bridge and ford,
the roads' skeleton, the forest, and the home cottage at the end of the south
lane, so the map is walkable and the water can be tested. Step 1 adds the
village, 4 the farms, 5 the castle, 6 the forest places (docs/30, section 11).

Coordinates follow docs/29/04's village plan (two tiles a character, its
corner at world (56, 84)) and 29/01's overview for the river.

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

# The village plan's corner (29/04) and the high street's row in world tiles.
VX, VY = 56, 84
HIGH_Y = VY + 37 * 2  # 158: the high street, the square's middle row, the bridge


def build():
    g = MapGen("The valley", SIZE, spawn=(104, 216))
    g.biome("harvest", HARVEST, scale=9)

    # ---- the river (29/01, 29/02): top to bottom, a little east of centre, bulging west by the mill ----
    river = [(120, 0), (118, 36), (112, 56), (118, 80), (122, 110), (124, 170), (130, 190), (136, 212), (140, 256)]
    g.river(river, width=5, bank=1)
    # The stone bridge: the high street carried over the water on laid stone, three wide.
    g.floor_rect([116, HIGH_Y - 1, 18, 3], "floor_stone", kind="bridge", note="the stone bridge (29/02); floor_bridge_stone when drawn")
    # The ford on the drove: shallow water across the river's width, walked slowly by everyone.
    g.shallow([132, 206, 7, 3], note="the ford (29/02): the drove crosses here; the water and its banks, nothing wider")

    # ---- the roads' skeleton (29/02) ----
    # The high street: cobble from the square to the bridge; the west road: dirt on west.
    g.road([(84, HIGH_Y), (116, HIGH_Y)], 3, "floor_cobble", group="high street")
    g.road([(0, HIGH_Y), (84, HIGH_Y)], 3, "floor_dirt", group="west road")
    # The bridge road east: cobble from the bridge's end to the castle's gate (the castle is step 5).
    g.road([(134, HIGH_Y), (140, HIGH_Y)], 3, "floor_cobble", group="bridge road")
    # The square: twelve by twelve of cobble round the well (29/04).
    g.floor_rect([VX + 28, VY + 68, 12, 12], "floor_cobble", group="square")
    # The nobles' street north from the square to the chapel's gate (29/04: plan column 17).
    g.road([(VX + 34, VY + 16), (VX + 34, VY + 68)], 3, "floor_cobble", group="nobles street")
    # The south lane: from the green south past the cottages (plan column 17, rows 49 to 71), and the
    # lane along row 64 to your door.
    g.road([(VX + 34, VY + 98), (VX + 34, VY + 142)], 2, "floor_dirt", group="south lane")
    g.road([(VX + 8, VY + 128), (VX + 52, VY + 128)], 2, "floor_dirt", group="the lane")
    # The drove: from the lane's end east to the ford and across (29/02).
    g.road([(VX + 52, VY + 128), (131, 207)], 2, "floor_dirt", group="drove")
    g.road([(141, 207), (160, 207)], 2, "floor_dirt", group="drove")

    # ---- the home: the end cottage on the south lane (29/07, option A; ruled in 30) ----
    home = g.place("your cottage", [98, 212, 16, 12], padding=1)
    home.building(
        [1, 1, 7, 5], "wall_wood", "floor_wood",
        openings=[
            {"side": "s", "at": 1, "kind": "door"},
            {"side": "s", "at": 5, "kind": "window"},
            {"side": "n", "at": 2, "kind": "window"},
            {"side": "e", "at": 2, "kind": "window"},
        ],
        # Two rooms: the living room west, the bedroom east, a door in the wall between.
        partitions=[{"edge": "w", "at": [4, 0], "len": 5, "openings": [{"at": 3, "kind": "door"}]}],
        props=[
            {"sprite": "fireplace", "tile": [1, 0]},
            {"sprite": "table", "tile": [1, 2], "footprint": [2, 1]},
            {"sprite": "chair", "tile": [0, 2]},
            {"sprite": "chair", "tile": [3, 2]},
            {"sprite": "chest", "tile": [0, 4]},
            {"sprite": "bed", "tile": [5, 0], "footprint": [2, 1]},
            {"sprite": "chest", "tile": [6, 4]},
        ],
        brackets=[{"side": "w", "at": 1, "facing": "in", "torch": True}],
    )
    home.crops([9, 1, 6, 6], ["potato", "cabbage"], stages=(1, 2, 2), seed=3)
    home.prop("well", (9, 9))
    home.prop("barrel", (11, 9))
    home.fence([0, 0, 16, 12], gates=[{"side": "s", "at": 4}, {"side": "w", "at": 9}])

    # ---- the square's well, so the first screens have water besides the river ----
    g.prop("well", (VX + 33, VY + 73), note="the square's well (29/04)")

    # ---- reserves: the village (step 1), the castle (step 5), and the farms (step 4) take no forest yet ----
    g.reserve([VX, VY, 64, 144])      # the village block, 29/04's plan
    g.reserve([136, 126, 66, 64])     # the castle's compound (29/03 at (140, 130)) with its moat
    g.reserve([36, 230, 64, 26])      # Hollow Farm's ground south of the lane (29/05), shifted clear of the cottages
    g.reserve([64, 24, 56, 44])       # Long Acre and the mill (29/05)

    # ---- the forest: everywhere else, thicker than the proving ground's ----
    g.scatter([0, 0, SIZE, SIZE], "harvest", (0.05, 0.16), seed=11)
    g.wild("harvest", (0.0405, 0.1305), seed=21, zombies_per_chunk=(0, 2),
           rocks={"kinds": {"rock_0": 1, "rock_1": 1, "rock_2": 1, "rock_3": 1}, "cell": 40, "chance": 0.6, "seed": 51})
    g.forage({"mushroom_0": 1, "mushroom_1": 1, "mushroom_2": 1, "mushroom_3": 1, "mushroom_4": 1}, chance=0.021, near=2, seed=41)

    # ---- the dead, a few on the lane and the roads for now (29/08's counts come with each place) ----
    for x, y in [(90, 196), (92, 204), (86, 214), (100, 206), (112, 200), (76, 160), (100, 160), (118, 150), (130, 162), (138, 170), (60, 150), (104, 236)]:
        g.zombie(x, y)

    # ---- the villagers of the proving ground, until 29/08's cast arrives with their places ----
    g.villager((VX + 30, VY + 70), "Wren", 0)
    g.villager((VX + 36, VY + 76), "Ash", 1)
    g.villager((104, 226), "Tam", 2, "Keep the shutters closed.")
    g.villager((VX + 34, VY + 20), "Rook", 3)

    return g


if __name__ == "__main__":
    root = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
    out = os.path.join(root, "data", "maps", "valley.json")
    build().write(out)
    print("wrote", out)
