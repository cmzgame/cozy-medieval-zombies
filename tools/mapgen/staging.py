"""The staging map: a clearing made only for pictures (docs/38 step 5, #110).
Michael, 2026-10-16: "Perhaps we even create a new map just to stage
screenshots with our best props: an isolated cabin, a well, lots of trees and
leaves and flowers." Never a world anyone plays; the valley is the game.

Only drawn art, so nothing shows as a labelled dev box: a log cabin with a lit
hearth, the well, a pond with its bank, a pumpkin patch with jack-o'-lanterns,
a cabbage row, mushrooms, rocks, and the autumn trees thick round the clearing.
The game has no flowers or fallen leaves yet; when it does, they belong here.
No dead and no villagers: the pictures are the place.

Run from the repo root: python -I tools/mapgen/staging.py
Then open the page with ?map=staging&nosave and take the shots with
tools/shots.js (its header says how).
"""

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from mapgen import MapGen  # noqa: E402

SIZE = 48
AUTUMN = {
    "tree_orange_m": 1.2, "tree_orange_l": 1.2, "tree_orange_old": 0.6,
    "tree_red_m": 1, "tree_red_l": 1, "tree_red_old": 0.5,
    "tree_yellow_m": 1, "tree_yellow_l": 1, "tree_yellow_old": 0.5,
    "tree_oak_m": 0.6, "tree_oak_l": 0.6, "tree_oak_old": 0.3,
    "tree_spire_orange_m": 0.4, "tree_spire_red_m": 0.4, "tree_spire_yellow_m": 0.4, "tree_spire_green_m": 0.3,
}


def door(side, at, **extra):
    return {"side": side, "at": at, "kind": "door", **extra}


def window(side, at, **extra):
    return {"side": side, "at": at, "kind": "window", **extra}


def build():
    g = MapGen("The staging clearing", SIZE, spawn=(23, 27))
    g.biome("autumn", AUTUMN, scale=7)

    # The cabin: one log room, the hearth lit (its glow through the windows at dusk), a bed, a table.
    cabin = g.place("the cabin", [17, 14, 10, 8], padding=1)
    cabin.building(
        [1, 1, 7, 5], "wall_log", "floor_wood",
        openings=[door("s", 2, open=True), window("s", 5, open=True), window("e", 2, open=True), window("n", 3)],
        props=[
            {"sprite": "fireplace", "tile": [0, 1], "footprint": [1, 2], "lit": True, "fuel": 8},
            {"sprite": "table", "tile": [2, 2], "footprint": [2, 1]},
            {"sprite": "chair", "tile": [2, 3], "facing": "n"},
            {"sprite": "bed", "tile": [5, 0], "footprint": [2, 1]},
        ],
    )
    # The path from the door, down to the well and on towards the pond.
    g.road([(19, 20), (19, 25), (23, 28), (28, 30)], 2, "floor_dirt", group="path")

    # The well by the path, a jack-o'-lantern either side of the door.
    g.prop("well", (21, 25))
    g.prop("pumpkin", (18, 21), facing="left")
    g.prop("pumpkin", (21, 21), facing="right")

    # The pond, south-east of the cabin, with its dirt bank (the ground blends water inside dirt, docs/15).
    g.floor_rect([28, 25, 8, 7], "floor_dirt", kind="bank")
    g.floor_rect([29, 26, 6, 5], "floor_water", kind="water", note="the pond")
    g.prop("rock_1", (28, 32))
    g.prop("rock_3", (36, 27))

    # The patch: pumpkins in farm soil west of the path, a cabbage row beside them.
    patch = g.place("the patch", [10, 23, 8, 7], padding=0)
    patch.crops([0, 0, 4, 5], ["pumpkin"], stages=(1, 2, 2), seed=2)
    patch.crops([5, 0, 2, 5], ["cabbage"], stages=(2, 2, 1), seed=4)
    g.prop("pumpkin_plain_0", (15, 29))
    g.prop("pumpkin_plain_1", (10, 29))

    # Rocks and mushrooms at the clearing's edge, under the first trees.
    for sprite, tile in [("rock_0", (13, 17)), ("rock_2", (31, 19)), ("rock_0", (25, 34))]:
        g.prop(sprite, tile)
    for i, tile in enumerate([(14, 19), (15, 20), (30, 21), (32, 22), (24, 35), (12, 31), (34, 33)]):
        g.prop(f"mushroom_{i % 5}", tile, solid=False)

    # The clearing is kept open; the trees stand thick all round it, and the wild beyond is the same wood, empty.
    g.reserve([9, 13, 29, 22])
    g.scatter([0, 0, SIZE, SIZE], "autumn", (0.22, 0.36), seed=5)
    g.wild("autumn", (0.2, 0.32), seed=7, zombies_per_chunk=(0, 0))
    g.forage({"mushroom_0": 1, "mushroom_1": 1, "mushroom_2": 1, "mushroom_3": 1, "mushroom_4": 1}, chance=0.03, near=2, seed=9)
    return g


if __name__ == "__main__":
    root = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
    out = os.path.join(root, "data", "maps", "staging.json")
    build().write(out)
    print("wrote", out)
