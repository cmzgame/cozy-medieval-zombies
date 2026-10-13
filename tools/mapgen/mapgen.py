"""The map generator (docs/30, step 0): a map file is written from a short
description of each place, never by hand. This module is the vocabulary; a map
is a script beside it (valley.py) that calls it and writes data/maps/<name>.json
in exactly the format src/map.js loads (sets, features, buildings with
partitions and per-side materials, fences, scatter, wild, forage, the dead,
the villagers). Run: python -I tools/mapgen/valley.py

Coordinates are grid tiles, x across, y down, as map.js counts them. Every
helper returns what it added so a place can be built up in pieces.
"""

import json


def _norm_rect(r):
    x, y, w, h = r
    return [int(x), int(y), int(w), int(h)]


class MapGen:
    def __init__(self, name, size, floor="floor_grass", spawn=(0, 0)):
        self.json = {
            "name": name,
            "floor": floor,
            "bounds": [0, 0, size, size],
            "features": [],
            "sets": [],
            "reserve": [],
            "biomes": {},
            "scatter": [],
            "wild": None,
            "spawn": list(spawn),
            "zombies": [],
            "props": [],
            "forage": None,
            "villagers": [],
        }

    # ---- surfaces ----

    def floor_rect(self, rect, sprite, kind="road", group=None, note=None):
        f = {"kind": kind, "rect": _norm_rect(rect), "sprite": sprite}
        if group:
            f["group"] = group
        if note:
            f["note"] = note
        self.json["features"].append(f)
        return f

    def polyline_rects(self, points, width):
        """Rects one tile deep along a polyline, `width` across it, merged into
        runs where the line is straight: what a road or a river is made of."""
        rects = []
        half = width // 2
        for (x0, y0), (x1, y1) in zip(points, points[1:]):
            dx, dy = x1 - x0, y1 - y0
            if abs(dy) >= abs(dx):
                step = 1 if dy >= 0 else -1
                for y in range(y0, y1 + step, step):
                    t = (y - y0) / dy if dy else 0
                    x = round(x0 + dx * t)
                    rects.append([x - half, y, width, 1])
            else:
                step = 1 if dx >= 0 else -1
                for x in range(x0, x1 + step, step):
                    t = (x - x0) / dx
                    y = round(y0 + dy * t)
                    rects.append([x, y - half, 1, width])
        return _merge_runs(rects)

    def road(self, points, width, sprite="floor_dirt", group=None, kind="road"):
        out = []
        for r in self.polyline_rects(points, width):
            out.append(self.floor_rect(r, sprite, kind=kind, group=group))
        return out

    def river(self, points, width, bank=1):
        """Water along a polyline with a dirt bank either side (the ground blends
        water inside dirt, docs/15); the water is wholly water, so nothing walks it."""
        out = []
        if bank:
            out += self.road(points, width + 2 * bank, "floor_dirt", kind="bank")
        out += self.road(points, width, "floor_water", kind="water")
        return out

    def shallow(self, rect, note=None):
        return self.floor_rect(rect, "floor_water_shallow", kind="water", note=note)

    def fence(self, rect, gates=(), wall="wall_fence", note=None):
        f = {"kind": "fence", "rect": _norm_rect(rect), "wall": wall, "gates": [dict(g) for g in gates]}
        if note:
            f["note"] = note
        self.json["features"].append(f)
        return f

    def reserve(self, rect):
        self.json["reserve"].append(_norm_rect(rect))

    # ---- places ----

    def place(self, name, rect, padding=1):
        """A set: a place with a footprint and a padding ring scatter never
        enters. Everything added to it is relative to its rect's corner."""
        s = {"name": name, "rect": _norm_rect(rect), "padding": padding, "buildings": [], "floorRects": [], "fences": [], "props": []}
        self.json["sets"].append(s)
        return Place(self, s)

    # ---- the rest ----

    def biome(self, name, kinds, scale=9):
        self.json["biomes"][name] = {"kinds": kinds, "scale": scale}

    def scatter(self, rect, biome, density, seed):
        self.json["scatter"].append({"rect": _norm_rect(rect), "density": list(density), "biome": biome, "seed": seed})

    def wild(self, biome, density, seed, zombies_per_chunk, rocks=None):
        w = {"biome": biome, "density": list(density), "seed": seed, "zombiesPerChunk": list(zombies_per_chunk)}
        if rocks:
            w["rocks"] = rocks
        self.json["wild"] = w

    def forage(self, kinds, chance, near, seed):
        self.json["forage"] = {"kinds": kinds, "chance": chance, "near": near, "seed": seed}

    def zombie(self, x, y):
        self.json["zombies"].append([int(x), int(y)])

    def villager(self, tile, name, wardrobe, line=None):
        v = {"tile": [int(tile[0]), int(tile[1])], "name": name, "wardrobe": wardrobe}
        if line:
            v["line"] = line
        self.json["villagers"].append(v)

    def prop(self, sprite, tile, **extra):
        p = {"sprite": sprite, "tile": [int(tile[0]), int(tile[1])]}
        p.update(extra)
        self.json["props"].append(p)
        return p

    def write(self, path):
        j = dict(self.json)
        for k in ("wild", "forage"):
            if j[k] is None:
                del j[k]
        if not j["reserve"]:
            del j["reserve"]
        with open(path, "w", encoding="utf-8", newline="\n") as f:
            json.dump(j, f, indent=1)
            f.write("\n")
        return path


class Place:
    """A set under construction; coordinates relative to its corner."""

    def __init__(self, gen, s):
        self.gen = gen
        self.s = s
        self.x, self.y = s["rect"][0], s["rect"][1]

    def world(self, x, y):
        return (self.x + x, self.y + y)

    def building(self, rect, wall, floor, openings=(), partitions=(), props=(), brackets=(), padding=None):
        b = {"rect": _norm_rect(rect), "wall": wall, "floor": floor, "openings": [dict(o) for o in openings]}
        if partitions:
            b["partitions"] = [dict(p) for p in partitions]
        if props:
            b["props"] = [dict(p) for p in props]
        if brackets:
            b["brackets"] = [dict(x) for x in brackets]
        if padding is not None:
            b["padding"] = padding
        self.s["buildings"].append(b)
        return b

    def floor_rect(self, rect, sprite):
        self.s["floorRects"].append({"rect": _norm_rect(rect), "sprite": sprite})

    def fence(self, rect, gates=(), wall="wall_fence"):
        self.s["fences"].append({"rect": _norm_rect(rect), "wall": wall, "gates": [dict(g) for g in gates]})

    def prop(self, sprite, tile, **extra):
        p = {"sprite": sprite, "tile": [int(tile[0]), int(tile[1])]}
        p.update(extra)
        self.s["props"].append(p)
        return p

    def crops(self, rect, kinds, stages=(0, 1, 2), seed=1):
        """A plot: farm soil with a crop on every tile at mixed stages, by a
        hash so it is the same every build."""
        x0, y0, w, h = rect
        self.floor_rect(rect, "floor_farm")
        for dy in range(h):
            for dx in range(w):
                k = kinds[(dx + dy * 7 + seed) % len(kinds)]
                st = stages[(dx * 3 + dy + seed) % len(stages)]
                self.prop(f"crop_{k}_{st}", (x0 + dx, y0 + dy))


def _merge_runs(rects):
    """Merge consecutive one-deep rects that share x and width (rows) or y and
    height (columns) into one, so a straight road is one rect."""
    out = []
    for r in rects:
        if out:
            p = out[-1]
            if p[0] == r[0] and p[2] == r[2] and p[1] + p[3] == r[1]:
                p[3] += r[3]
                continue
            if p[1] == r[1] and p[3] == r[3] and p[0] + p[2] == r[0]:
                p[2] += r[2]
                continue
        out.append(list(r))
    return out
