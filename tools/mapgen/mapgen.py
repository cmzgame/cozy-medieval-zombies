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


GUIDE_REACH = 3  # tiles from the spawn: the guide is found at once (docs/34, #90)


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
            "zones": {},
            "scatter": [],
            "wild": None,
            "spawn": list(spawn),
            "zombies": [],
            "props": [],
            "forage": None,
            "villagers": [],
            "animals": [],
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

    def river(self, points, width, bank=1, group="river"):
        """Water along a polyline with a dirt bank either side (the ground blends
        water inside dirt, docs/15); the water is wholly water, so nothing walks it."""
        out = []
        if bank:
            out += self.road(points, width + 2 * bank, "floor_dirt", kind="bank")
        out += self.road(points, width, "floor_water", kind="water", group=group)
        return out

    def shallow(self, rect, note=None, group="river"):
        return self.floor_rect(rect, "floor_water_shallow", kind="water", group=group, note=note)

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

    def zone(self, name, kinds, scale=9):
        self.json["zones"][name] = {"kinds": kinds, "scale": scale}

    def scatter(self, rect, zone, density, seed):
        self.json["scatter"].append({"rect": _norm_rect(rect), "density": list(density), "zone": zone, "seed": seed})

    def wild(self, zone, density, seed, zombies_per_chunk, rocks=None):
        w = {"zone": zone, "density": list(density), "seed": seed, "zombiesPerChunk": list(zombies_per_chunk)}
        if rocks:
            w["rocks"] = rocks
        self.json["wild"] = w

    def forage(self, kinds, chance, near, seed):
        self.json["forage"] = {"kinds": kinds, "chance": chance, "near": near, "seed": seed}

    def resource(self, name, sprites, count, rects=None, open=(), floors=None, open_floors=None, near=None, rise=False, solid=True, jitter=None, seed=61,
                 water=None, water_group=None, own=False, night=False, where=None):
        """A natural resource's area and its count (docs/46; src/map.js reads it, src/resources.js keeps it): `sprites` by weight are its
        nodes; `count` is kept in its area, made up at the load by the comeback's own rule and kept by a debt per take; `rects` (default the
        bounds) are its area, clipped to the bounds; `open` names the places whose footprint is open to it (the quarry to stone), where
        `open_floors` count as natural ground too; `floors` default to the map's base floor; `near` is how close a tree must stand (mushrooms);
        `rise` draws a new one rising out of the ground; `jitter` sets a small thing off its tile's centre; `water` is how close water must be
        (the mana herb, a clay bank) and `water_group` the named water it must be (the river); `own` opens the whole area to its kind, its
        reserved tiles and its fence too (the graveyard to its herbs); `night` grows a replacement only at night (the graveyard's); `where` says where it grows, in words, for the card of what it gives."""
        r = {"sprites": dict(sprites), "count": int(count)}
        if rects:
            r["rects"] = [_norm_rect(x) for x in rects]
        if open:
            r["open"] = list(open)
        if floors:
            r["floors"] = list(floors)
        if open_floors:
            r["openFloors"] = list(open_floors)
        if near:
            r["near"] = int(near)
        if rise:
            r["rise"] = True
        if not solid:
            r["solid"] = False
        if jitter:
            r["jitter"] = jitter
        if water:
            r["water"] = int(water)
        if water_group:
            r["waterGroup"] = water_group
        if own:
            r["own"] = True
        if night:
            r["night"] = True
        if where:
            r["where"] = where
        r["seed"] = int(seed)
        self.json.setdefault("resources", {})[name] = r
        return r

    def zombie(self, x, y):
        self.json["zombies"].append([int(x), int(y)])

    def villager(self, tile, name, wardrobe, line=None, immune=False, talk=None, guide=False):
        # `immune`: the dead neither target nor harm this villager, whatever the world's rules (Michael, 2026-10-18, #180: a villager who
        # teaches a skill is immune, like the guide; the rest can die, and some are there to be at risk).
        v = {"tile": [int(tile[0]), int(tile[1])], "name": name, "wardrobe": wardrobe}
        if line:
            v["line"] = line
        if immune:
            v["immune"] = True
        # `talk` names the villager's file in data/talk (docs/34; the name lowercased when it is not given); `guide` marks the one beside the spawn.
        if talk:
            v["talk"] = talk
        if guide:
            v["guide"] = True
        self.json["villagers"].append(v)

    def guide(self, tile, name, wardrobe, line=None, talk="guide"):
        """The guide (docs/34; Michael, 2026-10-16, #90): a villager beside the spawn on every map this generator makes, immune to the dead
        (a per-villager flag, #180), with a name and a voice like any other. `write` refuses a map without exactly one within GUIDE_REACH tiles."""
        self.villager(tile, name, wardrobe, line=line, immune=True, talk=talk, guide=True)

    def prop(self, sprite, tile, **extra):
        p = {"sprite": sprite, "tile": [int(tile[0]), int(tile[1])]}
        p.update(extra)
        self.json["props"].append(p)
        return p

    def animals(self, species, tile, count, cap=None, name=None, clearing=True):
        """A home for a herd, a flock, or a pen's stock (docs/45): `count` animals of a species (data/animals.json) made round
        `tile` at a world's birth, which they wander from and drift back to; a wild species' home has one back now and then up
        to `cap` (the count by default). `clearing` keeps the trees off the five by five round the spot, so the first stand there."""
        h = {"species": species, "tile": [int(tile[0]), int(tile[1])], "count": int(count)}
        if cap is not None:
            h["cap"] = int(cap)
        if name:
            h["name"] = name
        self.json["animals"].append(h)
        if clearing:
            self.reserve([int(tile[0]) - 2, int(tile[1]) - 2, 5, 5])
        return h

    def write(self, path):
        guides = [v for v in self.json["villagers"] if v.get("guide")]
        sx, sy = self.json["spawn"]
        if len(guides) != 1 or ((guides[0]["tile"][0] - sx) ** 2 + (guides[0]["tile"][1] - sy) ** 2) ** 0.5 > GUIDE_REACH:
            raise ValueError(f"{self.json['name']}: a map needs exactly one guide within {GUIDE_REACH} tiles of its spawn {self.json['spawn']} (docs/34), has {[v['tile'] for v in guides]}")
        j = dict(self.json)
        for k in ("wild", "forage"):
            if j[k] is None:
                del j[k]
        if not j["reserve"]:
            del j["reserve"]
        if not j["animals"]:
            del j["animals"]
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

    def floor_rect(self, rect, sprite, group=None):
        f = {"rect": _norm_rect(rect), "sprite": sprite}
        if group:
            f["group"] = group  # a named water (data/fishing.json has a table for each name)
        self.s["floorRects"].append(f)

    def fence(self, rect, gates=(), wall="wall_fence", sides=None):
        f = {"rect": _norm_rect(rect), "wall": wall, "gates": [dict(g) for g in gates]}
        if sides:
            f["sides"] = list(sides)  # run on these sides only ("n", "s", "w", "e")
        self.s["fences"].append(f)

    def prop(self, sprite, tile, **extra):
        p = {"sprite": sprite, "tile": [int(tile[0]), int(tile[1])]}
        p.update(extra)
        self.s["props"].append(p)
        return p

    def crops(self, rect, kinds, stages=(0, 1, 2), seed=1, floor="floor_farm", skip=()):
        """A plot: farm soil with a crop on every tile at mixed stages, by a
        hash so it is the same every build. `floor` is the soil (`floor_farm_y`
        for furrows along y); `skip` tiles (relative to the set) stay bare soil."""
        x0, y0, w, h = rect
        self.floor_rect(rect, floor)
        for dy in range(h):
            for dx in range(w):
                if (x0 + dx, y0 + dy) in skip:
                    continue
                k = kinds[(dx + dy * 7 + seed) % len(kinds)]
                st = stages[(dx * 3 + dy + seed) % len(stages)]
                self.prop(f"crop_{k}_{st}", (x0 + dx, y0 + dy), solid=False)  # walked through, and it wobbles (CLAUDE.md's law)


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
