"""The flat map: a giant plain of grass to build a whole map on by hand (Michael, 2026-10-28).
His words: "a new map for me that is just a giant flat grass plane with nothing else, and I will walk around building the map
literally by hand", and "The all flat grass map would let me test building an entire building by hand." Then, on what it holds: "Yes
spawn the guide, and the dev chest just for funsies. Otherwise, all grass."

All plain `floor_grass`: no trees, no scatter, no forage, no resources, no props but the dev chest beside the spawn, no dead, no
villagers but the guide every map's generator places beside its spawn (docs/34; `MapGen.write` refuses a map without one), no zones, no
reserve. No `wild` rule either: beyond the bounds the ground is the same plain grass (map.js `wildTile` makes a plain tile when it has no
rule), so a player who walks off the edge finds no forest and no dead, and that far grass is dropped from memory when nobody is near
(only the authored bounds are kept). The bounds are the map's own square: its chunks, once grown, are never dropped and ride in a save.

Run from the repo root: python -I tools/mapgen/flat.py
Then open the page with ?map=flat (or choose "Flat grass" when making a world on the Worlds screen).
"""

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from mapgen import MapGen  # noqa: E402

SIZE = 512
SPAWN = (SIZE // 2, SIZE // 2)


def build():
    g = MapGen("Flat grass", SIZE, spawn=SPAWN)
    # The dev chest (the Sandbox's "Dev chest", game.create devChest: every weapon and tool, the basic materials, potions, seeds), two tiles west of the spawn.
    g.prop("dev_chest", (SPAWN[0] - 2, SPAWN[1]))
    # The guide (docs/34): beside the spawn, as on every map.
    g.guide((SPAWN[0] + 2, SPAWN[1] + 1), "Wyn", 6, "Ask me anything, if you are stuck.")
    return g


if __name__ == "__main__":
    root = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
    out = os.path.join(root, "data", "maps", "flat.json")
    build().write(out)
    print("wrote", out)
