"""The proving ground's storeys (docs/49 section 11, step 1): the test building with a cellar, a ground floor, and two floors above,
joined by two stairs, written into data/maps/square.json in the vocabulary of mapgen.py. The rest of the square is as it was typed
(it predates the generator); this script replaces only its own set, by name, so it can be run again. Run:
python -I tools/mapgen/proving.py

The cellar has no way in yet: its hatch and ladder, and the loft's plain ladder, are step 3b's (the ladder record), so they come
with it. Every check that needs a storey (tools/check.js, the pane's) reads this building.
"""

import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from mapgen import Place  # noqa: E402

NAME = "the tower house"
PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", "data", "maps", "square.json")


def build(sq):
    sq["sets"] = [s for s in sq["sets"] if s.get("name") != NAME]
    s = {"name": NAME, "rect": [1, 22, 10, 9], "padding": 1, "buildings": [], "floorRects": [], "fences": [], "props": []}
    p = Place(None, s)
    # The ground floor: 8 by 6 (the world's x 2 to 9, y 23 to 28), its door on the south, a lantern inside.
    b = p.building(
        [1, 1, 8, 6], "wall_wood", "floor_wood",
        openings=[{"side": "s", "at": 3, "kind": "door"}, {"side": "w", "at": 4, "kind": "window"}],
        props=[{"sprite": "table", "tile": [5, 4]}],
        brackets=[{"side": "w", "at": 1, "facing": "in", "lantern": True}],
    )
    # The first floor over the whole of it, windows out to the west and the north (for looking down, step 4), a bed and a lantern.
    p.storey(
        b, 1, wall="wall_wood",
        openings=[{"side": "w", "at": 2, "kind": "window"}, {"side": "n", "at": 5, "kind": "window"}],
        props=[{"sprite": "bed", "tile": [0, 4], "footprint": [2, 1], "facing": "x"}],
        brackets=[{"side": "n", "at": 1, "facing": "in", "lantern": True}],
    )
    # The second floor: a smaller room over the east end (the world's x 6 to 9, y 24 to 28), a window east and a chest.
    p.storey(b, 2, rect=[5, 2, 4, 5], wall="wall_wood", openings=[{"side": "e", "at": 2, "kind": "window"}], props=[{"sprite": "chest", "tile": [0, 4]}])
    # The cellar under the west end (the world's x 2 to 5, y 26 to 28): a barrel and a shelf in the earth. Its way in is step 3b's hatch.
    p.storey(b, -1, rect=[1, 4, 4, 3], wall="wall_stone", floor="floor_dirt", props=[{"sprite": "barrel", "tile": [0, 0]}, {"sprite": "shelf", "tile": [3, 0]}])
    # The stairs: the ground to the first floor along x (the world's 4 to 6 on row 25, its landing at 7), and the first floor to the second
    # along y (the world's column 8, rows 24 to 26, its landing at row 27).
    p.stair(b, [2, 2], "e", layer=0)
    p.stair(b, [6, 1], "s", layer=1)
    sq["sets"].append(s)
    return sq


ROUND_NAME = "the round rooms"


def build_rounds(sq):
    """The round rooms (docs/50 step 1): a 7 by 7 room (the world's x 21 to 27, y 0 to 6) with a door south and a window west, and a 5 by 5
    tower of two storeys (x 26 to 30, y 7 to 11) with a door west on the ground; every check of a ring reads these. Stone, as every round
    wall is for now (Michael, 2026-10-27)."""
    sq["sets"] = [s for s in sq["sets"] if s.get("name") != ROUND_NAME]
    s = {"name": ROUND_NAME, "rect": [21, 0, 11, 12], "padding": 0, "buildings": [], "floorRects": [], "fences": [], "props": []}
    p = Place(None, s)
    p.round([0, 0], 7, openings={"s": "door", "w": "window"})
    p.round([5, 7], 5, openings={"w": "door"})
    p.round([5, 7], 5, openings={"s": "window"}, layer=1)
    sq["sets"].append(s)
    return sq


if __name__ == "__main__":
    with open(PATH, encoding="utf-8") as f:
        sq = json.load(f)
    build(sq)
    build_rounds(sq)
    with open(PATH, "w", encoding="utf-8", newline="\n") as f:
        f.write(json.dumps(sq, indent=2) + "\n")
    print(f"wrote {os.path.normpath(PATH)}: {NAME}, {ROUND_NAME}")
