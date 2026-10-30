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


# The drawn one-tile pieces that stand with their back to a wall (art rounds 4 and 5, 2026-10-26): `y` as drawn, the back to a west wall, `x` its mirror.
WALL_FACING = {"chest", "shelf", "cupboard"}


def _wall_facing(p):
    if p.get("sprite") in WALL_FACING and "facing" not in p:
        p["facing"] = "y" if p["tile"][0] == 0 else "x"
    return p


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
                 water=None, water_group=None, own=False, where=None):
        """A natural resource's area and its count (docs/46; src/map.js reads it, src/resources.js keeps it): `sprites` by weight are its
        nodes; `count` is kept in its area, made up at the load by the comeback's own rule and kept by a debt per take; `rects` (default the
        bounds) are its area, clipped to the bounds; `open` names the places whose footprint is open to it (the quarry to stone), where
        `open_floors` count as natural ground too; `floors` default to the map's base floor; `near` is how close a tree must stand (mushrooms);
        `rise` draws a new one rising out of the ground; `jitter` sets a small thing off its tile's centre; `water` is how close water must be
        (mageroot, a clay bank) and `water_group` the named water it must be (the river); `own` opens the whole area to its kind, its
        reserved tiles and its fence too (the graveyard to its herbs); `where` says where it grows, in words, for the card of what it gives."""
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
        if where:
            r["where"] = where
        r["seed"] = int(seed)
        self.json.setdefault("resources", {})[name] = r
        return r

    def zombie(self, x, y):
        self.json["zombies"].append([int(x), int(y)])

    def villager(self, tile, name, wardrobe, line=None, immune=True, talk=None, guide=False):
        # `immune`: the dead neither target nor harm this villager. Every villager is (Michael, 2026-10-28, docs/02: "villagers are
        # immune ... the game needs them to be there"); `immune=False` writes the kept mortal path's `"immune": false`, for a later ruling.
        v = {"tile": [int(tile[0]), int(tile[1])], "name": name, "wardrobe": wardrobe}
        if line:
            v["line"] = line
        v["immune"] = bool(immune)
        # `talk` names the villager's file in data/talk (docs/34; the name lowercased when it is not given); `guide` marks the one beside the spawn.
        if talk:
            v["talk"] = talk
        if guide:
            v["guide"] = True
        self.json["villagers"].append(v)

    def guide(self, tile, name, wardrobe, line=None, talk="guide"):
        """The guide (docs/34; Michael, 2026-10-16, #90): a villager beside the spawn on every map this generator makes, immune to the dead
        as every villager is, with a name and a voice like any other. `write` refuses a map without exactly one within GUIDE_REACH tiles."""
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
        check_round_joins(j)
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
        """A building inside the set. A drawn chest, shelf, or cupboard (art rounds 4 and 5) is drawn with its back to a west wall (facing "y") and mirrored for a
        north one ("x"); one given no facing takes "y" in the first column and "x" anywhere else, so the front shows (`_wall_facing`)."""
        b = {"rect": _norm_rect(rect), "wall": wall, "floor": floor, "openings": [dict(o) for o in openings]}
        if partitions:
            b["partitions"] = [dict(p) for p in partitions]
        if props:
            b["props"] = [_wall_facing(dict(p)) for p in props]
        if brackets:
            b["brackets"] = [dict(x) for x in brackets]
        if padding is not None:
            b["padding"] = padding
        self.s["buildings"].append(b)
        return b

    def storey(self, b, layer, rect=None, wall=None, floor="floor_wood", openings=(), partitions=(), props=(), brackets=()):
        """A storey of building `b` on another layer (docs/49 section 11): 1, 2, ... above the ground, -1 a cellar under it. Its
        `rect` (relative to the set, as the building's; the building's own by default) is floored with `floor` and walled round with
        `wall` (the building's by default), with openings, partitions, props, and brackets as a building's are (relative to the storey's
        own corner). map.loadMap lays it
        on its layer; whatever is not authored there is void above the ground and earth below it."""
        layer = int(layer)
        if layer == 0:
            raise ValueError("a storey is on another layer than the ground (the building itself is the ground's)")
        f = {"layer": layer, "rect": _norm_rect(rect or b["rect"]), "floor": floor, "wall": wall or b["wall"], "openings": [dict(o) for o in openings]}
        if partitions:
            f["partitions"] = [dict(p) for p in partitions]
        if props:
            f["props"] = [_wall_facing(dict(p)) for p in props]
        if brackets:
            f["brackets"] = [dict(x) for x in brackets]
        b.setdefault("floors", []).append(f)
        return f

    def stair(self, b, at, dir, layer=0, material="wood", toward_camera=None):
        """A stair of building `b` (docs/49 section 4): three tiles on `layer` from its low end `at` (relative to the building's corner) climbing
        one storey in `dir` ("n", "e", "s", "w"), with its landing, the tile beyond the third step on the layer above, which the map
        floors and nothing stands on, and the tile before its bottom step, which must be walkable. Checked here, and again by the
        loader: the five tiles in a line inside the storeys they belong to, the landing free of any prop, no stair crossing another.
        The stairwell over its three tiles is void (map.loadMap), a hole in the ground floor over a cellar's.
        A stair climbs away from the camera, north or west (Michael, 2026-10-27: climbing east or south its treads fold onto one line on
        screen): one climbing east or south is refused unless `toward_camera` says why it must (the proving ground's, which tries each)."""
        d = {"n": (0, -1), "e": (1, 0), "s": (0, 1), "w": (-1, 0)}[dir]
        if dir in ("e", "s") and not toward_camera:
            raise ValueError(f"the stair at {at} climbs {dir}, toward the camera: turn it to climb n or w, or say why it must in toward_camera")
        layer = int(layer)
        if material not in ("wood", "stone"):
            raise ValueError(f"a stair is wood or stone, not {material!r}")
        rect_of = {0: b["rect"]}
        for f in b.get("floors", []):
            rect_of[f["layer"]] = f["rect"]
        inside = lambda l, x, y: l in rect_of and rect_of[l][0] <= x < rect_of[l][0] + rect_of[l][2] and rect_of[l][1] <= y < rect_of[l][1] + rect_of[l][3]
        # `at` is relative to the building's corner, as its props and partitions are; the checks below run in the set's frame.
        bx, by = b["rect"][0], b["rect"][1]
        ax, ay = bx + int(at[0]), by + int(at[1])
        line = [(ax + d[0] * k, ay + d[1] * k) for k in range(-1, 3)]  # the tile before, then the three steps
        landing = (ax + d[0] * 3, ay + d[1] * 3)
        for x, y in line:
            if not inside(layer, x, y):
                raise ValueError(f"the stair at {at} {dir}: {x - bx},{y - by} is outside its storey on layer {layer}")
        if not inside(layer + 1, *landing):
            raise ValueError(f"the stair at {at} {dir}: its landing is outside the storey on layer {layer + 1}")
        above = [b] if layer + 1 == 0 else [f for f in b.get("floors", []) if f["layer"] == layer + 1]
        for f in above:
            fx, fy = f["rect"][0], f["rect"][1]
            for p in f.get("props", []):
                fw, fh = p.get("footprint", [1, 1])
                if fx + p["tile"][0] <= landing[0] < fx + p["tile"][0] + fw and fy + p["tile"][1] <= landing[1] < fy + p["tile"][1] + fh:
                    raise ValueError(f"the stair at {at} {dir}: a {p['sprite']} stands on its landing")
        for o in b.get("stairs", []):
            od = {"n": (0, -1), "e": (1, 0), "s": (0, 1), "w": (-1, 0)}[o["dir"]]
            ox, oy = bx + o["at"][0], by + o["at"][1]
            theirs = {(o["layer"], ox + od[0] * k, oy + od[1] * k) for k in range(3)} | {(o["layer"] + 1, ox + od[0] * 3, oy + od[1] * 3)}
            mine = {(layer, x, y) for x, y in line[1:]} | {(layer + 1, landing[0], landing[1])}
            if theirs & mine:
                raise ValueError(f"the stair at {at} {dir} crosses the one at {o['at']} {o['dir']}")
        s = {"at": [int(at[0]), int(at[1])], "dir": dir, "layer": layer, "material": material}
        b.setdefault("stairs", []).append(s)
        return s

    def round(self, at, size, wall="wall_stone", openings=None, floor=None, layer=0):
        """A round room (docs/50 section 5): a circle inscribed in a `size` by `size` square (5 or 7) whose corner is `at`, relative to the
        set; `openings` by side ("n", "e", "s", "w") at the four door points, each "door", "window", or a dict with `kind` and `open` or
        `broken`. map.loadMap floors its stepped tiles (`floor`, stone on the ground and planks above by default) and lays its outline's
        edges as walls carrying its id. A tower is a round on each `layer` at the same `at`. Stone only for now (Michael, 2026-10-27)."""
        size = int(size)
        if size not in (5, 7):
            raise ValueError(f"a round room is 5 or 7 across, not {size}")
        if wall != "wall_stone":
            raise ValueError(f"round walls are stone only for now (Michael, 2026-10-27), not {wall!r}")
        for side, o in (openings or {}).items():
            kind = o if isinstance(o, str) else o.get("kind")
            if side not in ("n", "e", "s", "w") or kind not in ("door", "window"):
                raise ValueError(f"a round room's opening is a door or a window at n, e, s, or w, not {side}: {o!r}")
        r = {"at": [int(at[0]), int(at[1])], "size": size, "wall": wall, "layer": int(layer)}
        if openings:
            r["openings"] = {k: (v if isinstance(v, str) else dict(v)) for k, v in openings.items()}
        if floor:
            r["floor"] = floor
        for o in self.s.setdefault("rounds", []):
            if o["layer"] == r["layer"] and not (o["at"][0] + o["size"] <= r["at"][0] or r["at"][0] + size <= o["at"][0] or o["at"][1] + o["size"] <= r["at"][1] or r["at"][1] + size <= o["at"][1]):
                raise ValueError(f"the round room at {at} overlaps the one at {o['at']} on layer {layer}")
        self.s["rounds"].append(r)
        return r

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


def _round_shape(n):
    """A round room's stepped outline in its square's frame, as src/round.js has it (docs/50 section 2): the tiles whose centres lie inside
    the circle, the outline's edges and vertices, and the corner pockets' vertices off the outline (a vertex (vx, vy) is the top vertex of
    tile (vx, vy))."""
    k = (n - 1) / 2
    R = n / 2
    inside = lambda x, y: (x - k) ** 2 + (y - k) ** 2 < R * R
    stepped = {(x, y) for y in range(n) for x in range(n) if inside(x, y)}
    pockets = {(x, y) for y in range(n) for x in range(n)} - stepped
    outline = set()
    for x, y in stepped:
        if (x, y - 1) not in stepped:
            outline.add((x, y, "n"))
        if (x, y + 1) not in stepped:
            outline.add((x, y + 1, "n"))
        if (x - 1, y) not in stepped:
            outline.add((x, y, "w"))
        if (x + 1, y) not in stepped:
            outline.add((x + 1, y, "w"))
    over = set()
    for x, y, e in outline:
        over.add((x, y))
        over.add((x + 1, y) if e == "n" else (x, y + 1))
    pocket_v = {(x + dx, y + dy) for x, y in pockets for dx, dy in ((0, 0), (1, 0), (0, 1), (1, 1))} - over
    return {"k": k, "stepped": stepped, "outline": outline, "outline_v": over, "pocket_v": pocket_v}


def check_round_joins(j):
    """A straight wall meeting a round room ends at a vertex of its stepped outline (docs/50 section 3, #588), so the rooms on either side are
    sealed by the ring's edges: an authored wall ending at a corner pocket's vertex (the square's own corner, or a 7 by 7's pocket corner on
    its side) with no other wall there, at its end nearer the ring's centre, leaves the room open, and so does a wall between two of a ring's
    stepped tiles. Either is a loud error here. The walls are read as src/map.js loadMap lays them: every building's and storey's perimeter
    and partitions, and every fence, by set."""
    rings = []  # (layer, x0, y0, n)
    walls = {}  # layer -> set of (tx, ty, edge)

    def origin_of(s):
        if s.get("origin"):
            return s["origin"][0], s["origin"][1]
        if s.get("rect"):
            return s["rect"][0], s["rect"][1]
        if s.get("rects"):
            return s["rects"][0][0], s["rects"][0][1]
        return 0, 0

    def lay_rect(layer, rect, ox, oy, sides=("n", "s", "w", "e")):
        x0, y0, w, h = rect[0] + ox, rect[1] + oy, rect[2], rect[3]
        es = walls.setdefault(layer, set())
        for x in range(x0, x0 + w):
            if "n" in sides:
                es.add((x, y0, "n"))
            if "s" in sides:
                es.add((x, y0 + h, "n"))
        for y in range(y0, y0 + h):
            if "w" in sides:
                es.add((x0, y, "w"))
            if "e" in sides:
                es.add((x0 + w, y, "w"))
        return x0, y0

    def lay_building(b, ox, oy, layer):
        bx, by = lay_rect(layer, b["rect"], ox, oy)
        for part in b.get("partitions", []):
            px, py = bx + part["at"][0], by + part["at"][1]
            for i in range(part["len"]):
                walls[layer].add((px + i, py, "n") if part["edge"] == "n" else (px, py + i, "w"))

    sets = [({"buildings": j.get("buildings", []), "fences": [], "rounds": j.get("rounds", [])}, (0, 0))]
    sets += [(s, origin_of(s)) for s in j.get("sets", [])]
    for f in j.get("features", []):
        if f.get("kind") == "fence":
            lay_rect(0, f["rect"], 0, 0, f.get("sides") or ("n", "s", "w", "e"))
    for s, (ox, oy) in sets:
        for f in s.get("fences", []):
            lay_rect(0, f["rect"], ox, oy, f.get("sides") or ("n", "s", "w", "e"))
        for b in s.get("buildings", []):
            lay_building(b, ox, oy, 0)
            for st in b.get("floors", []):
                if int(st.get("layer", 0)):
                    lay_building(st, ox, oy, int(st["layer"]))
        for rd in s.get("rounds", []):
            rings.append((int(rd.get("layer", 0)), rd["at"][0] + ox, rd["at"][1] + oy, int(rd["size"])))
    for layer, x0, y0, n in rings:
        sh = _round_shape(n)
        outline = {(x + x0, y + y0, e) for x, y, e in sh["outline"]}
        es = walls.get(layer, set()) - outline  # an authored wall on the outline is laid over by the ring's own (map.loadMap)
        others = [(x0b, y0b, nb) for lb, x0b, y0b, nb in rings if lb == layer]
        cx, cy = x0 + sh["k"], y0 + sh["k"]
        for tx, ty, e in sorted(es):
            a, b = (tx, ty), (tx + 1, ty) if e == "n" else (tx, ty + 1)
            t2 = (tx, ty - 1) if e == "n" else (tx - 1, ty)
            if (tx - x0, ty - y0) in sh["stepped"] and (t2[0] - x0, t2[1] - y0) in sh["stepped"]:
                raise ValueError(f"an authored wall at {tx},{ty} {e} stands inside the round room at {x0},{y0} on layer {layer} (docs/50 section 5)")
            for v, o in ((a, b), (b, a)):
                if (v[0] - x0, v[1] - y0) not in sh["pocket_v"]:
                    continue
                if any((v[0] - x0b, v[1] - y0b) in _round_shape(nb)["outline_v"] for x0b, y0b, nb in others):
                    continue
                d = lambda p: ((p[0] - 0.5 - cx) ** 2 + (p[1] - 0.5 - cy) ** 2) ** 0.5
                if d(v) > d(o) + 1e-9:
                    continue  # its end away from the ring: a wall may run on outward as far as it likes
                at_v = {(v[0], v[1], "n"), (v[0] - 1, v[1], "n"), (v[0], v[1], "w"), (v[0], v[1] - 1, "w")} - {(tx, ty, e)}
                if not (at_v & walls.get(layer, set())):
                    raise ValueError(f"an authored wall at {tx},{ty} {e} ends in a corner pocket of the round room at {x0},{y0} on layer {layer}, at {v[0]},{v[1]}: run it on to a vertex of the stepped outline (docs/50 section 3)")


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
