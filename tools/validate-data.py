"""The data checked (docs/23a, section H): every item id in loot, the wardrobes, and build.json
exists; every picture a definition, an item, or ground.json names is on disk; the manifest matches
the disk, stamp for stamp; an item with drawn art has both halves of its pair (the world picture
and the icon, docs/26). Orphan pictures are listed, not failed.

Usage: python -I tools/validate-data.py [repo root]      exit 1 on any failure
"""
import glob
import hashlib
import json
import os
import re
import sys

root = sys.argv[1] if len(sys.argv) > 1 else os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
os.chdir(root)
failures = []
notes = []


def fail(msg):
    failures.append(msg)


def load(path):
    with open(path, encoding="utf-8") as f:
        return json.load(f)


def pngs_in(obj):
    if isinstance(obj, dict):
        for v in obj.values():
            yield from pngs_in(v)
    elif isinstance(obj, list):
        for v in obj:
            yield from pngs_in(v)
    elif isinstance(obj, str) and obj.endswith(".png"):
        yield obj


# Every JSON parses.
for path in glob.glob("data/**/*.json", recursive=True):
    try:
        load(path)
    except ValueError as e:
        fail(f"{path}: not JSON ({e})")
if failures:
    print("\n".join(failures))
    sys.exit(1)

items = load("data/items.json")
ids = [i["id"] for i in items]
if len(ids) != len(set(ids)):
    fail("items.json: duplicate ids " + ", ".join(sorted({i for i in ids if ids.count(i) > 1})))
ids = set(ids)


def check_id(where, value):
    if value != "nothing" and value not in ids:
        fail(f"{where}: no item {value!r}")


for table, t in load("data/loot.json").items():
    for e in t.get("entries", []):
        check_id(f"loot.{table}", e["item"])
wardrobes = load("data/wardrobes.json")
for kind, pool in wardrobes.items():
    if not isinstance(pool, list):
        continue
    for n, w in enumerate(pool):
        for slot, e in (w.get("worn") or {}).items():
            check_id(f"wardrobes.{kind}[{n}].worn.{slot}", e if isinstance(e, str) else (e.get("item") or e.get("id")))
        if w.get("loot") and w["loot"] not in load("data/loot.json"):
            fail(f"wardrobes.{kind}[{n}]: no loot table {w['loot']!r}")
build = load("data/build.json")
sprites = {os.path.basename(p)[:-5] for p in glob.glob("data/sprites/*.json")}
for kind, b in build.items():
    for cost in b.get("cost", {}):
        check_id(f"build.{kind}.cost", cost)
    if b.get("sprite") not in sprites:
        fail(f"build.{kind}: no sprite {b.get('sprite')!r}")

# The starting kit (#136): every id exists, what is worn has a slot, and the whole fits the bag it starts in (by area: the sack, and the
# Developer Bag a world may start with instead; `node tools/check.js` proves the fit by placement on the real grid).
kit = load("data/kit.json")
item_defs = {i["id"]: i for i in load("data/items.json")}
back = None
for wid in kit.get("worn", []):
    check_id("kit.worn", wid)
    if wid in item_defs and not item_defs[wid].get("wear"):
        fail(f"kit.worn: {wid!r} has no slot to be worn in")
    if wid in item_defs and item_defs[wid].get("wear") == "back":
        back = item_defs[wid]
need = 0
for k in kit.get("items", []):
    check_id("kit.items", k.get("item"))
    d = item_defs.get(k.get("item"))
    if d and not k.get("hold"):
        w, h = d.get("size", [1, 1])
        stack = d.get("stack") or 1
        count = k.get("count", 1)
        need += w * h * -(-count // stack)
for bag_def in (back, item_defs.get("dev_bag")):
    if bag_def and bag_def.get("bag") and need > bag_def["bag"][0] * bag_def["bag"][1]:
        fail(f"kit.items: the kit needs {need} cells and the {bag_def['id']} holds {bag_def['bag'][0] * bag_def['bag'][1]}")
for k in kit.get("items", []):
    d = item_defs.get(k.get("item"))
    if "clean" in k and (k["clean"] is not True or not d or not (d.get("capacity") or d.get("vessel")) or not k.get("fill")):
        fail(f"kit.items: {k.get('item')!r}: `clean` is true, on a drink or a vessel with water in it (docs/44)")

# Water (docs/44): the clean sources are sprites; the bar, the reach, and the counts above zero; the chances and the multipliers in range.
wt = load("data/tuning.json").get("water", {})
for sid in wt.get("clean", []):
    if sid not in sprites and not str(sid).startswith("floor_"):
        fail(f"tuning.water.clean: {sid!r} is no sprite")
for key in ("boilSeconds", "boilReach", "sickDays"):
    if key in wt and not (isinstance(wt[key], (int, float)) and wt[key] > 0):
        fail(f"tuning.water.{key}: a number above 0")
if "sickMaxStacks" in wt and not (isinstance(wt["sickMaxStacks"], int) and wt["sickMaxStacks"] >= 1):
    fail("tuning.water.sickMaxStacks: a whole number of at least 1")
for key in ("sickChance", "infectionChance", "sickHealMult"):
    if key in wt and not (isinstance(wt[key], (int, float)) and 0 <= wt[key] <= 1):
        fail(f"tuning.water.{key}: a number from 0 to 1")
if "sickTiredMult" in wt and not (isinstance(wt["sickTiredMult"], (int, float)) and wt["sickTiredMult"] >= 1):
    fail("tuning.water.sickTiredMult: a number of at least 1")

# Fruit trees (#190): a `pick` block names an item and a bare kind that exist; the bare kind says it ripens back to the laden one; and the two
# kinds agree on everything but the picture, since restaging a prop swaps only its sprite and its day (map.restage).
for sid in sorted(sprites):
    d = load(f"data/sprites/{sid}.json")
    p = d.get("pick")
    if not p:
        continue
    check_id(f"sprites.{sid}.pick", p.get("item"))
    bare_id = p.get("bare")
    if bare_id not in sprites:
        fail(f"sprites.{sid}.pick: no bare kind {bare_id!r}")
        continue
    bare = load(f"data/sprites/{bare_id}.json")
    if bare.get("ripens") != sid:
        fail(f"sprites.{bare_id}: `ripens` should name {sid!r}, not {bare.get('ripens')!r}")
    for field in ("wood", "interactable", "collide", "container", "solid", "footprint", "canopy", "leaves"):
        if d.get(field) != bare.get(field):
            fail(f"sprites.{sid} and {bare_id} disagree on {field!r}: {d.get(field)!r} against {bare.get(field)!r}")
    if not (p.get("days", 0) > 0 and p.get("seconds", 0) > 0 and len(p.get("count", [])) == 2 and 1 <= p["count"][0] <= p["count"][1]):
        fail(f"sprites.{sid}.pick: days and seconds above 0 and a count [lo, hi]")

# Fishing (#190): every item a table can catch exists, the weights and the wait make sense, the default names a table, a rod item lists the
# verb, and every named water in the maps has a table of its own.
fishing = load("data/fishing.json")
if not any("fish" in i.get("verbs", []) for i in items):
    fail("fishing: no item lists the verb 'fish'")
if fishing["default"] not in fishing["waters"]:
    fail(f"fishing: the default {fishing['default']!r} has no table")
c = fishing["cast"]
if not (0 < c["waitMin"] <= c["waitMax"] and c["reach"] > 0):
    fail("fishing: the cast needs 0 < waitMin <= waitMax and a reach")
for water, t in fishing["waters"].items():
    if not (0 <= t["miss"] < 1 and t["catch"]):
        fail(f"fishing.{water}: a miss chance in 0..1 and something to catch")
    for e in t["catch"]:
        check_id(f"fishing.{water}", e["item"])
        if not e["weight"] > 0:
            fail(f"fishing.{water}: {e['item']} has no weight")
for path in sorted(glob.glob("data/maps/*.json")):
    m = load(path)
    named = {f["group"] for f in m.get("features", []) if f.get("group") and str(f.get("sprite", "")).startswith("floor_water")}
    for s in m.get("sets", []):
        named |= {f["group"] for f in s.get("floorRects", []) if f.get("group") and str(f.get("sprite", "")).startswith("floor_water")}
    for name in sorted(named):
        if name not in fishing["waters"]:
            fail(f"{path}: the water {name!r} has no table in data/fishing.json")

# Animals (docs/45): every species has its numbers, a walk, a wander, a stand, a graze chance, and a sheet (`animal_<species>`, the dev art's
# kind `animal` or a drawn one) with idle, walk, eat, and dead, a run if it flees, the two drawn diagonals and their mirrors; every home a
# map names is of a species that exists, with a count, and a cap no smaller.
animals = load("data/animals.json")
ANIMAL_FIELDS = {"name", "wild", "walk", "run", "radius", "hp", "flee", "wander", "idle", "graze", "yields", "fight", "produce", "lays"}
# Hunting (docs/45 step 2): every yield is an item that exists, skinned or butchered, with a count [least, most]; every weapon class a
# kill can name has its share in 0..1 (the classes the code names, and those `classes` maps an item to); the work, the snare, the tracks.
KILL_CLASSES = {"bow", "thrown", "melee", "spell", "halberd", "snare"}
kills = animals.get("kills", {})
for cls in KILL_CLASSES | set(animals.get("classes", {}).values()):
    if not (0 <= kills.get(cls, -1) <= 1):
        fail(f"animals.kills: the class {cls!r} needs a share in 0..1")
for item_id in animals.get("classes", {}):
    check_id("animals.classes", item_id)
if not all(animals.get("work", {}).get(k, 0) > 0 for k in ("skin", "butcher")):
    fail("animals.work: skin and butcher need seconds above 0")
if not (animals.get("snare", {}).get("hours", 0) > 0 and animals["snare"].get("reach", 0) > 0):
    fail("animals.snare: hours and reach above 0")
if not all(animals.get("tracks", {}).get(k, 0) > 0 for k in ("every", "seconds", "radius", "keep")):
    fail("animals.tracks: every, seconds, radius, and keep above 0")
# Keeping (docs/45 step 3): the numbers, every product an item, every produce verb a tool some item lists and its work seconds, something to
# feed a trough with, the trough's definition, a coop for the hens to lay in.
K = animals.get("keep", {})
for k in ("feedReach", "coopReach", "breedDays", "penCap", "roomPerHead", "penMax", "leadPull", "leadMax", "leadStuck", "leadReach", "leadClose"):
    if not K.get(k, 0) > 0:
        fail(f"animals.keep.{k}: above 0")
for k in ("feather", "more"):
    if not (0 <= K.get(k, -1) <= 1):
        fail(f"animals.keep.{k}: a chance in 0..1")
item_verbs = {v for i in items for v in i.get("verbs", [])}
for need in ("lead",):
    if need not in item_verbs:
        fail(f"animals: no item lists the verb {need!r}")
if not any("feed" in i.get("tags", []) for i in items):
    fail("animals: no item is tagged feed, so no trough can be filled")
if "feed_trough" not in sprites or not load("data/sprites/feed_trough.json").get("feed"):
    fail("sprites.feed_trough: the feeding trough's definition, with `feed`")
for sp, a in animals.get("species", {}).items():
    pr = a.get("produce")
    if pr:
        check_id(f"animals.{sp}.produce", pr.get("item"))
        if pr.get("verb") not in item_verbs:
            fail(f"animals.{sp}.produce: no item lists the verb {pr.get('verb')!r}")
        if not animals.get("work", {}).get(pr.get("verb"), 0) > 0:
            fail(f"animals.{sp}.produce: work needs seconds for {pr.get('verb')!r}")
        c = pr.get("count", [])
        if not (len(c) == 2 and 1 <= c[0] <= c[1]):
            fail(f"animals.{sp}.produce: a count [least, most]")
    L = a.get("lays")
    if L:
        check_id(f"animals.{sp}.lays", L.get("item"))
        if "chicken_coop" not in sprites:
            fail(f"animals.{sp}.lays: no chicken coop to lay in")
if not (animals.get("renew", {}).get("seconds", 0) > 0 and animals["renew"].get("clear", 0) > 0):
    fail("animals: renew needs seconds and clear above 0")
for sp, a in animals.get("species", {}).items():
    if set(a) - ANIMAL_FIELDS:
        fail(f"animals.{sp}: unknown fields {sorted(set(a) - ANIMAL_FIELDS)}")
    if not (a.get("walk", 0) > 0 and a.get("hp", 0) > 0 and a.get("radius", 0) > 0 and a.get("wander", 0) > 0 and 0 <= a.get("graze", -1) <= 1):
        fail(f"animals.{sp}: walk, hp, radius, and wander above 0, graze in 0..1")
    if not (len(a.get("idle", [])) == 2 and 0 < a["idle"][0] <= a["idle"][1]):
        fail(f"animals.{sp}: idle is [least, most] seconds")
    y = a.get("yields", {})
    if set(y) - {"skin", "butcher"} or not y.get("butcher"):
        fail(f"animals.{sp}.yields: `skin` and `butcher` lists, something to butcher")
    for how in ("skin", "butcher"):
        for e in y.get(how, []):
            check_id(f"animals.{sp}.yields.{how}", e.get("id"))
            c = e.get("count", [])
            if not (len(c) == 2 and 0 <= c[0] <= c[1]):
                fail(f"animals.{sp}.yields.{how}: {e.get('id')} needs a count [least, most]")
    f = a.get("fight")
    if f is not None and not (all(f.get(k, 0) > 0 for k in ("damage", "reach", "windup", "cooldown", "seconds", "giveUp")) and a["run"] > a["walk"]):
        fail(f"animals.{sp}.fight: damage, reach, windup, cooldown, seconds, and giveUp above 0, and a run to charge with")
    if a.get("flee") and not (a["run"] > a["walk"] and all(a["flee"].get(k, 0) > 0 for k in ("sight", "tiles", "clear")) and a["flee"]["clear"] >= a["flee"]["sight"]):
        fail(f"animals.{sp}: a species that flees runs faster than it walks, with sight, tiles, and a clear distance at least its sight")
    sid = f"animal_{sp}"
    if sid not in sprites:
        fail(f"animals.{sp}: no sprite definition {sid}")
        continue
    d = load(f"data/sprites/{sid}.json")
    anims = d.get("animations", {})
    for name in ["idle", "walk", "eat", "dead"] + (["run"] if a.get("flee") else []):
        if name not in anims:
            fail(f"sprites.{sid}: no {name} animation")
    if d.get("facings") != ["se", "ne"] or d.get("mirror") != {"sw": "se", "nw": "ne"}:
        fail(f"sprites.{sid}: facings se and ne, mirrored to sw and nw (docs/45 section 6)")
for path in sorted(glob.glob("data/maps/*.json")):
    for h in load(path).get("animals", []):
        if h.get("species") not in animals.get("species", {}):
            fail(f"{path}: an animals home of unknown species {h.get('species')!r}")
        elif not (h.get("count", 0) >= 1 and h.get("cap", h.get("count", 0)) >= h.get("count", 0) and len(h.get("tile", [])) == 2):
            fail(f"{path}: the {h['species']} home at {h.get('tile')} needs a tile, a count of one or more, and a cap no smaller")

# The bucket (#199): an item with a `vessel` has a capacity above 0 and can be held.
for i in items:
    if "vessel" in i and not (i["vessel"].get("capacity", 0) > 0 and i.get("hands")):
        fail(f"items.{i['id']}: a vessel needs a capacity above 0 and `hands`")

# Mining (#196): a `mine` block names an item that exists, a count, seconds, and `gone`: a mined rock goes, and a node in its area comes back
# elsewhere in it (docs/46); the spent ore rock that came back in place is retired (`spent` and `days` are no longer read).
for sid in sorted(sprites):
    d = load(f"data/sprites/{sid}.json")
    m = d.get("mine")
    if not m:
        continue
    check_id(f"sprites.{sid}.mine", m.get("item"))
    if not (len(m.get("count", [])) == 2 and 1 <= m["count"][0] <= m["count"][1] and m.get("seconds", 0) > 0):
        fail(f"sprites.{sid}.mine: a count [lo, hi] from 1 and seconds above 0")
    if m.get("gone") is not True:
        fail(f"sprites.{sid}.mine: a mined rock goes (`gone`); it comes back elsewhere in its area (docs/46)")
    for retired in ("spent", "days"):
        if retired in m:
            fail(f"sprites.{sid}.mine: `{retired}` is retired (docs/46: an ore rock no longer comes back in place)")

# Gathering (docs/46 step 2, #448): a `gather` block (by hand) or a `dig` block (a tool carried) names an item that exists, a count, seconds,
# and the skill and level it is recorded at (open to all until the skills are built); a dig names a verb some tool lists; no block has `night` (nothing is gathered only at night: Michael, 2026-10-25).
# A node gathered is a gatherable (interactable, the law). A `mine` block may record its skill and level too.
tool_verbs = {v for it in items for v in it.get("verbs", [])}
for sid in sorted(sprites):
    d = load(f"data/sprites/{sid}.json")
    for field in ("gather", "dig", "mine"):
        g = d.get(field)
        if not g:
            continue
        where = f"sprites.{sid}.{field}"
        if field != "mine":
            check_id(where, g.get("item"))
            if not (len(g.get("count", [])) == 2 and 1 <= g["count"][0] <= g["count"][1] and g.get("seconds", 0) > 0):
                fail(f"{where}: a count [lo, hi] from 1 and seconds above 0")
            if not d.get("interactable"):
                fail(f"{where}: a node gathered is interactable (the gatherables law)")
        if ("skill" in g or field != "mine") and g.get("skill") not in ("herbalism", "mining", "woodcutting", "farming", "beastlore", "fishing"):
            fail(f"{where}: the gathering skill it is recorded at, not {g.get('skill')!r}")
        if ("level" in g or field != "mine") and not (isinstance(g.get("level"), int) and 1 <= g["level"] <= 10):
            fail(f"{where}: a level from 1 to 10")
        if field == "dig" and g.get("tool") not in tool_verbs:
            fail(f"{where}: the tool's verb {g.get('tool')!r} is listed by no item")
        if "night" in g:
            fail(f"{where}: night is struck (Michael, 2026-10-25: no 'only at night' plants)")
        if "word" in g and not (isinstance(g["word"], str) and g["word"][:1].isupper()):
            fail(f"{where}: the menu's word, capitalised")

# Natural resources (docs/46): a map's `resources` kind names sprites that exist and are gatherables (interactable), a count of 0 or more,
# rects of positive size, places it opens to that the map has, and floors that exist; the tuning's numbers are sensible.
for path in sorted(glob.glob("data/maps/*.json")):
    m = load(path)
    set_names = {s.get("name") for s in m.get("sets", [])}
    for name, k in (m.get("resources") or {}).items():
        where = f"{path}: resources.{name}"
        if not k.get("sprites"):
            fail(f"{where}: no sprites")
        for sid, w in (k.get("sprites") or {}).items():
            if sid not in sprites:
                fail(f"{where}: no sprite {sid!r}")
            elif not load(f"data/sprites/{sid}.json").get("interactable"):
                fail(f"{where}: {sid!r} is not interactable (the gatherables law)")
            if not w > 0:
                fail(f"{where}: {sid!r} has no weight")
        if not (isinstance(k.get("count"), int) and k["count"] >= 0):
            fail(f"{where}: a count of 0 or more")
        for r in k.get("rects", []):
            if not (len(r) == 4 and r[2] > 0 and r[3] > 0):
                fail(f"{where}: a rect [x, y, w, h] with a size, not {r}")
        for place in k.get("open", []):
            if place not in set_names:
                fail(f"{where}: opens to {place!r}, which the map has no place for")
        for fl in k.get("floors", []) + k.get("openFloors", []):
            if fl not in sprites:
                fail(f"{where}: no floor {fl!r}")
        if "water" in k and not (isinstance(k["water"], int) and k["water"] >= 1):
            fail(f"{where}: water is a distance in tiles, 1 or more")
        groups = {r.get("group") for r in m.get("floorRects", []) + m.get("features", []) if str(r.get("sprite", "")).startswith("floor_water")}
        if k.get("waterGroup") and k["waterGroup"] not in groups:
            fail(f"{where}: grows by the water {k['waterGroup']!r}, which the map has none of")
        if "where" in k and not (isinstance(k["where"], str) and k["where"] and k["where"][0].islower()):
            fail(f"{where}: where it grows, in words for a card (\"near the river\"), not {k['where']!r}")
        if "own" in k and not isinstance(k["own"], bool):
            fail(f"{where}: own is true or false")
        if "night" in k:
            fail(f"{where}: night is struck (Michael, 2026-10-25: no 'only at night' plants)")
rt = load("data/tuning.json").get("resources", {})
if rt:
    d0, d1 = rt.get("days", [1, 2])
    if not (0 < d0 <= d1):
        fail("tuning.resources.days: [lo, hi] with 0 < lo <= hi")
    for key in ("checkSeconds", "tries", "yardCap", "riseSeconds"):
        if key in rt and not rt[key] > 0:
            fail(f"tuning.resources.{key}: a number above 0")
# Saplings and sticks (docs/46 step 3, src/trees.js): the sapling's chance in 0..1, its days above 0, its item planted as its first stage, every
# stage a sapling sprite that gives the item back, the tree it grows a tree (a canopy and wood); the sticks' item and count.
tt = load("data/tuning.json").get("trees", {})
if tt:
    sp = tt.get("sapling") or {}
    if not (isinstance(sp.get("chance"), (int, float)) and 0 <= sp["chance"] <= 1):
        fail("tuning.trees.sapling.chance: a number from 0 to 1")
    if not (isinstance(sp.get("days"), (int, float)) and sp["days"] > 0):
        fail("tuning.trees.sapling.days: a number above 0")
    if not (isinstance(tt.get("checkSeconds"), (int, float)) and tt["checkSeconds"] > 0):
        fail("tuning.trees.checkSeconds: a number above 0")
    check_id("tuning.trees.sapling.item", sp.get("item"))
    stages = sp.get("stages") or []
    if not stages:
        fail("tuning.trees.sapling.stages: at least one sprite")
    for s in stages:
        if s not in sprites:
            fail(f"tuning.trees.sapling.stages: no sprite {s!r}")
            continue
        sd = load(f"data/sprites/{s}.json")
        if not sd.get("sapling") or sd.get("item") != sp.get("item"):
            fail(f"sprites.{s}: a sapling's stage says `sapling` and gives back {sp.get('item')!r}")
    if sp.get("item") in item_defs and stages and item_defs[sp["item"]].get("place") != stages[0]:
        fail(f"items.{sp.get('item')}.place: the sapling is planted as its first stage, {stages[0]!r}")
    g = sp.get("grows")
    if g not in sprites or not load(f"data/sprites/{g}.json").get("canopy") or not load(f"data/sprites/{g}.json").get("wood"):
        fail(f"tuning.trees.sapling.grows: {g!r} is no tree (a canopy and wood)")
    # A tree's `saplingGrows` (an apple tree's sapling grows an apple tree, #461) names a tree.
    for sid in sorted(sprites):
        sg = load(f"data/sprites/{sid}.json").get("saplingGrows")
        if sg is None:
            continue
        if sg not in sprites or not load(f"data/sprites/{sg}.json").get("canopy") or not load(f"data/sprites/{sg}.json").get("wood"):
            fail(f"sprites.{sid}.saplingGrows: {sg!r} is no tree (a canopy and wood)")
    st = tt.get("sticks") or {}
    check_id("tuning.trees.sticks.item", st.get("item"))
    c0, c1 = (st.get("count") or [0, 0])[:2]
    if not (isinstance(c0, int) and isinstance(c1, int) and 1 <= c0 <= c1):
        fail("tuning.trees.sticks.count: [lo, hi] whole numbers with 1 <= lo <= hi")
    if not (isinstance(st.get("seconds"), (int, float)) and st["seconds"] > 0):
        fail("tuning.trees.sticks.seconds: a number above 0")

# Chopping (#195): a tool lists the verb `chop`, the stump and the tuning's names exist, and every placed container's own `loot` names a table.
if not any("chop" in i.get("verbs", []) for i in items):
    fail("chopping: no item lists the verb 'chop'")
# The feel numbers (#161, #244): the ones Michael edits by hand, checked so a typo fails loudly rather than freezing the camera or the blend.
feel = load("data/tuning.json").get("feel", {})
if not (isinstance(feel.get("cameraFollow"), (int, float)) and not isinstance(feel.get("cameraFollow"), bool) and feel["cameraFollow"] > 0):
    fail("tuning.feel.cameraFollow: a number above 0")
if not isinstance(feel.get("blend"), bool):
    fail("tuning.feel.blend: true or false")
if not (isinstance(feel.get("blendJump"), (int, float)) and not isinstance(feel.get("blendJump"), bool) and feel["blendJump"] > 0):
    fail("tuning.feel.blendJump: a number above 0")
num = lambda v: isinstance(v, (int, float)) and not isinstance(v, bool)
if not (num(feel.get("netDelaySteps")) and feel["netDelaySteps"] >= 1):
    fail("tuning.feel.netDelaySteps: a number of at least 1")
if not (num(feel.get("netSlew")) and 0 < feel["netSlew"] <= 1):
    fail("tuning.feel.netSlew: a number above 0 and at most 1")
if not (num(feel.get("netJump")) and feel["netJump"] > 0):
    fail("tuning.feel.netJump: a number above 0")
# The floating numbers over heads (#294): the numbers are sane, the colours are hex, and every gather names a verb that exists and one of the fourteen skills' icons.
fl = load("data/tuning.json").get("floaters", {})
for key in ["life", "riseTiles", "startLift", "fontPx", "iconScale", "maxActive"]:
    if not (num(fl.get(key)) and fl[key] > 0):
        fail(f"tuning.floaters.{key}: a number above 0")
if not (num(fl.get("fadeFrom")) and 0 <= fl["fadeFrom"] < 1):
    fail("tuning.floaters.fadeFrom: a number from 0 up to (not including) 1")
for key in ["drift", "lightAbove", "staggerLines"]:
    if not (num(fl.get(key)) and fl[key] >= 0):
        fail(f"tuning.floaters.{key}: a number, 0 or more")
for key in ["damageColor", "healColor", "gatherLight", "gatherDark"]:
    if not (isinstance(fl.get(key), str) and re.fullmatch(r"#[0-9a-fA-F]{6}", fl[key])):
        fail(f"tuning.floaters.{key}: a colour like #rrggbb")
skill_ids = re.findall(r'\{ id: "([a-z]+)", name:', open("src/ui/skill-icons.js", encoding="utf-8").read())
if len(skill_ids) != 14:
    fail(f"src/ui/skill-icons.js: fourteen skills expected, found {len(skill_ids)}")
verb_names = set()
for src in glob.glob("src/*.js") + glob.glob("src/entities/*.js"):
    verb_names |= set(re.findall(r'verbs\.define\("([a-z_]+)"', open(src, encoding="utf-8").read()))
for verb, spec in fl.get("gathers", {}).items():
    if verb not in verb_names:
        fail(f"tuning.floaters.gathers: no verb {verb!r}")
    if not (isinstance(spec, list) and len(spec) == 2 and spec[0] in skill_ids and isinstance(spec[1], str)):
        fail(f"tuning.floaters.gathers.{verb}: [one of the skills, the verb result's field]")
# Collectibles (Michael, 2026-10-27, docs/02 "rugs and paintings are found, never made"): an item marked `collectible` is found and kept,
# never built or crafted, so no recipe and no build palette entry makes it, and the tools that report dead ends skip it.
_made_ids = {(r.get("out") or {}).get("id") for r in load("data/recipes.json")["rows"]} | {(r.get("out") or {}).get("prop") for r in load("data/recipes.json")["rows"]}
for it in items:
    if it.get("collectible") is not None:
        if it["collectible"] is not True:
            fail(f"item {it['id']}: collectible is true or absent")
        if it["id"] in _made_ids:
            fail(f"item {it['id']}: a collectible is found, never made, but a recipe makes it")
# Rugs (#327): an item with a `rug` names a sprite that is a rug with the bed's facings (2 by 3 along y, 3 by 2 along x), a 1 by 4 decor item with an icon, and a drawn picture.
for it in items:
    if "rug" in it:
        sp = it["rug"]
        sprite_json = load(f"data/sprites/{sp}.json") if os.path.exists(f"data/sprites/{sp}.json") else None
        if not sprite_json or not sprite_json.get("rug"):
            fail(f"item {it['id']}: rug {sp!r} is not a sprite with rug true")
        else:
            fp = sprite_json.get("facingFootprint", {})
            if fp.get("y") != [2, 3] or fp.get("x") != [3, 2] or sprite_json.get("facings") != ["y", "x"]:
                fail(f"sprite {sp}: a rug has facings y and x with footprints [2, 3] and [3, 2]")
        if it.get("kind") != "decor" or it.get("size") != [1, 4] or not it.get("icon"):
            fail(f"item {it['id']}: a rug item is kind decor, 1 by 4, with an icon")
# Paintings (#326): an item with a `painting` is small (2 by 2, one slot), tall (2 by 3, both slots) or wide (3 by 2, two sections), a decor item with an icon and a held picture, and the
# `decor_paintings` sheet draws it on both walls (`<id>_north`, `<id>_west`).
paint_def = load("data/sprites/decor_paintings.json") if os.path.exists("data/sprites/decor_paintings.json") else {}
for it in items:
    if "painting" in it:
        want = {"small": [2, 2], "tall": [2, 3], "wide": [3, 2]}.get(it["painting"])
        if want is None:
            fail(f"item {it['id']}: painting is small, tall, or wide")
        elif it.get("size") != want:
            fail(f"item {it['id']}: a {it['painting']} painting is {want[0]} by {want[1]}")
        if it.get("kind") != "decor" or not it.get("icon") or not it.get("held"):
            fail(f"item {it['id']}: a painting item is kind decor, with an icon and a held picture")
        for side in ("north", "west"):
            if f"{it['id']}_{side}" not in paint_def.get("images", {}) or f"{it['id']}_{side}" not in paint_def.get("anchors", {}):
                fail(f"item {it['id']}: data/sprites/decor_paintings.json has no {it['id']}_{side} picture and anchor")
# The woods (#334): a wall definition with a `wood` has a table of that name in data/wood_tones.json, a name, post and parts sheets that exist, and, if it names a `leaf`, a wall of a wood without
# a leaf of its own; a build entry of a region's wood names a wall that is `region`; a door's or window's `leaf` choices are the woods with leaves of their own.
tones = load("data/wood_tones.json") if os.path.exists("data/wood_tones.json") else {"tables": {}}
wood_walls = {}
for path in sorted(glob.glob("data/sprites/*.json")):
    d = load(path)
    w = d.get("wall") if isinstance(d, dict) else None
    if w and w.get("wood"):
        wood_walls[os.path.basename(path)[:-5]] = w
for sid, w in wood_walls.items():
    if w["wood"] not in tones["tables"]:
        fail(f"sprite {sid}: wall.wood {w['wood']!r} has no table in data/wood_tones.json")
    if not w.get("name"):
        fail(f"sprite {sid}: a wood wall has a name")
    for part in ("post", "parts"):
        if not os.path.exists(f"data/sprites/{w.get(part)}.json"):
            fail(f"sprite {sid}: wall.{part} {w.get(part)!r} is not a sprite definition")
    if w.get("leaf") and (w["leaf"] not in wood_walls or wood_walls[w["leaf"]].get("leaf")):
        fail(f"sprite {sid}: wall.leaf {w['leaf']!r} is not a wood wall with leaves of its own")
# Every tone a role names is in every wood's table (a wood with leaves of its own), so a missing tone fails here and not only in the pane's pixel check; a table that is only part of a wall (daub's
# limewashed fills) names only tones the roles do, and the wall that has it takes its leaves from a full one.
role_tones = sorted({h for hs in tones.get("roles", {}).values() for h in hs})
hex_re = re.compile(r"#[0-9a-fA-F]{6}")
for wood, table in tones.get("tables", {}).items():
    full = any(w["wood"] == wood and not w.get("leaf") for w in wood_walls.values())
    if full:
        missing = [h for h in role_tones if h not in table]
        if missing:
            fail(f"wood_tones: the {wood} table lacks {len(missing)} tone(s) the roles name: {', '.join(missing[:4])}")
    else:
        stray = [h for h in table if h not in role_tones]
        if stray:
            fail(f"wood_tones: the {wood} table has tone(s) no role names: {', '.join(stray[:4])}")
    bad = [f"{k}->{v}" for k, v in table.items() if not (hex_re.fullmatch(k) and hex_re.fullmatch(v))]
    if bad:
        fail(f"wood_tones: the {wood} table has a value that is no #rrggbb: {', '.join(bad[:3])}")
for key, e in load("data/build.json").items():
    if e.get("region") and not (e.get("sprite") in wood_walls and wood_walls[e["sprite"]].get("region")):
        fail(f"build {key}: a region entry names the wall of a region's wood")
    if e.get("sprite") in wood_walls and wood_walls[e["sprite"]].get("region") and not e.get("region"):
        fail(f"build {key}: a region's wood is offered only with Free building on: mark it `region`")
# The sounds (docs/40, #379): every slot has a known group, a volume from 0 to 1, a radius above 0, at least one variant,
# a voice cap, and either a recipe sound-gen.js knows or a delivered file that exists; every slot the ear asks for (the
# footsteps' floors, the dead's shuffle, the swing, the hit) is a slot.
SOUND_RECIPES = {"step_dirt", "step_wood", "step_stone", "step_water", "shuffle", "swing", "hit", "shove", "bow_draw", "bow_release", "arrow_land", "cast", "death", "fall", "door", "moan", "strike"}  # src/sound-gen.js RECIPES
snd = load("data/sounds.json")
sslots = snd.get("slots", {})
for name, d in sslots.items():
    where = f"sounds.{name}"
    if d.get("group") not in ("effects", "ambience", "music", "interface"):
        fail(f"{where}.group: one of effects, ambience, music, interface")
    if not (num(d.get("volume")) and 0 <= d["volume"] <= 1):
        fail(f"{where}.volume: 0 to 1")
    if not (num(d.get("radius")) and d["radius"] > 0):
        fail(f"{where}.radius: above 0")
    if not (isinstance(d.get("variants"), int) and d["variants"] >= 1):
        fail(f"{where}.variants: a whole number, at least 1")
    if not (isinstance(d.get("maxVoices"), int) and d["maxVoices"] >= 1):
        fail(f"{where}.maxVoices: a whole number, at least 1")
    f = d.get("file")
    if f:
        for path in (f if isinstance(f, list) else [f]):
            if not os.path.exists(path):
                fail(f"{where}.file: {path} is not on disk")
    elif (d.get("gen") or {}).get("recipe") not in SOUND_RECIPES:
        fail(f"{where}: no file and no recipe sound-gen.js knows ({(d.get('gen') or {}).get('recipe')})")
    elif not (num(d["gen"].get("length")) and d["gen"]["length"] > 0):
        fail(f"{where}.gen.length: above 0")
asked = {"hit", "swing_light", "swing_heavy", "shove", "bow_draw", "bow_release", "arrow_land", "cast", "death", "fall", "moan", "strike", "mana_short", "pray", snd.get("openings", {}).get("slot", "door")}  # the moan and the strike, #424; not enough mana and the altar's prayer, #480
mc = snd.get("moan", {})
if not (isinstance(mc.get("from"), list) and mc["from"] and isinstance(mc.get("to"), list) and mc["to"] and num(mc.get("again")) and mc["again"] >= 0 and num(mc.get("gap")) and mc["gap"] >= 0):
    fail("sounds.moan: `from` a list of states, `again` and `gap` seconds at or above 0")
fs = snd.get("footsteps", {})
asked |= {v for k, v in fs.items() if k.startswith("floor_") or k in ("dead", "default")}
if not sslots.get("bow_draw", {}).get("loop"):
    fail("sounds.bow_draw.loop: the draw is a loop (true)")
for name in sorted(asked):
    if name not in sslots:
        fail(f"sounds: the ear asks for {name}, which is not a slot")
for k in fs:
    if k.startswith("floor_") and not os.path.exists(os.path.join("data", "sprites", f"{k}.json")):
        fail(f"sounds.footsteps.{k}: no such floor")

# Object Highlight (#301): the outline's colour is hex, its alpha is 0 to 1, and the hit test is asked again every so many ms.
oh = load("data/tuning.json").get("objectHighlight", {})
if not (isinstance(oh.get("color"), str) and re.fullmatch(r"#[0-9a-fA-F]{6}", oh["color"])):
    fail("tuning.objectHighlight.color: a colour like #rrggbb")
if not (num(oh.get("alpha")) and 0 < oh["alpha"] <= 1):
    fail("tuning.objectHighlight.alpha: a number above 0, up to 1")
if not (num(oh.get("refreshMs")) and oh["refreshMs"] > 0):
    fail("tuning.objectHighlight.refreshMs: a number above 0")
# The hover card (#262): the pointer rests this long before it shows, and it sits this far from the pointer.
hc = load("data/tuning.json").get("hoverCard", {})
if not (num(hc.get("delayMs")) and hc["delayMs"] >= 0):
    fail("tuning.hoverCard.delayMs: a number, 0 or more")
if not (num(hc.get("gap")) and hc["gap"] >= 0):
    fail("tuning.hoverCard.gap: a number, 0 or more")
tuning_world = load("data/tuning.json")["world"]
if tuning_world["stumpSprite"] not in sprites:
    fail(f"tuning.world.stumpSprite: no sprite {tuning_world['stumpSprite']!r}")
loot_tables = load("data/loot.json")
for path in sorted(glob.glob("data/maps/*.json")):
    m = load(path)
    placed = list(m.get("props", []))
    for s in m.get("sets", []):
        placed += s.get("props", [])
        for b in s.get("buildings", []):
            placed += b.get("props", [])
    for p in placed:
        if "loot" in p and p["loot"] not in loot_tables:
            fail(f"{path}: the {p['sprite']} at {p['tile']} names a loot table {p['loot']!r} that does not exist")

# Farming (#194): every crop's seed and harvest items exist (the seed tagged `seed`), its stage days and counts make sense, its three
# stage sprites exist and say which crop and stage they are, and the soil's numbers are positive.
crops = load("data/crops.json")
soil = crops["soil"]
if not (soil["wetDays"] > 0 and soil["fillCost"] > 0 and all(v > 0 for v in soil["seconds"].values())):
    fail("crops.soil: wetDays, fillCost and the seconds are all above 0")
for kind, c in crops["crops"].items():
    check_id(f"crops.{kind}.seed", c["seed"])
    if not isinstance(c.get("name"), str) or not c["name"]:
        fail(f"crops.{kind}: a name for its labels (\"Harvest potatoes\")")
    check_id(f"crops.{kind}.harvest", c["harvest"]["item"])
    if c["seed"] in item_defs and "seed" not in item_defs[c["seed"]].get("tags", []):
        fail(f"crops.{kind}: the seed item {c['seed']!r} lacks the tag 'seed'")
    if not (len(c["stages"]) == 2 and all(d > 0 for d in c["stages"])):
        fail(f"crops.{kind}: two stage lengths in days above 0")
    lo, hi = c["harvest"]["count"]
    if not (1 <= lo <= hi and c["seeds"] >= 1):
        fail(f"crops.{kind}: a harvest count [lo, hi] from 1 and at least one seed back")
    for stage in (0, 1, 2):
        sid = f"crop_{kind}_{stage}"
        if sid not in sprites:
            fail(f"crops.{kind}: no sprite {sid}")
        elif load(f"data/sprites/{sid}.json").get("crop") != {"kind": kind, "stage": stage}:
            fail(f"sprites.{sid}: its `crop` should be {{kind: {kind}, stage: {stage}}}")

# Recipes (#212): every item a recipe takes, makes, wields (`tool`), (and the verb it `uses` names a tool, below) exists (an ingredient may be a tag instead), a prop
# it makes has a sprite, and cloth is made, so the loom has rows.
tags = {t for i in items for t in i.get("tags", [])}
for row in load("data/recipes.json")["rows"]:
    rid = row["id"]
    for want in row["in"]:
        if "tag" in want:
            if want["tag"] not in tags:
                fail(f"recipes.{rid}: no item has the tag {want['tag']!r}")
        else:
            check_id(f"recipes.{rid}.in", want.get("id"))
    out = row["out"]
    if "prop" in out:
        if out["prop"] not in sprites:
            fail(f"recipes.{rid}: no sprite {out['prop']!r} to make")
    else:
        check_id(f"recipes.{rid}.out", out.get("id"))
    for key in ("tool",):
        if row.get(key):
            check_id(f"recipes.{rid}.{key}", row[key])
    # A row's own `verb` (#317: Tear) is said on the hover card of what goes in and what comes out, so it works an item into an item.
    if "verb" in row and not (isinstance(row["verb"], str) and row["verb"][:1].isupper() and out.get("id") and any(w.get("id") for w in row["in"])):
        fail(f"recipes.{rid}.verb: a capitalised word on a row that makes an item from an item")
    # A draught of clean water (docs/47 section 3): `water`, a part of a skin's fill above 0 and at most a whole skin.
    if "water" in row and not (num(row["water"]) and 0 < row["water"] <= 100):
        fail(f"recipes.{rid}.water: an amount of a skin's fill above 0, at most 100")
if not any(row["station"] == "loom" for row in load("data/recipes.json")["rows"]):
    fail("recipes: the loom has no rows")

# Potions and poisons (docs/47 sections 4 and 6, #481): a potion's `potion` names what drinking it does, a poison's `poison` its tier (1 or 2),
# never both; each stacks, rides the belt, and is brewed at the cauldron; drinking leaves the clay vial, which exists; the tuning's numbers are there.
POTION_KINDS = ("heal", "stamina", "mana")
_pt = load("data/tuning.json").get("potions") or {}
for k in ("heal", "mana", "staminaMult", "staminaSeconds", "between"):
    if not (num(_pt.get(k)) and _pt[k] > 0):
        fail(f"tuning.potions.{k}: a number above 0")
_rows_by_out = {(r.get("out") or {}).get("id"): r for r in load("data/recipes.json")["rows"]}
for i in items:
    if "potion" in i or "poison" in i:
        where = f"items.{i['id']}"
        if "potion" in i and i["potion"] not in POTION_KINDS:
            fail(f"{where}.potion: one of {POTION_KINDS}, not {i['potion']!r}")
        if "poison" in i and not (isinstance(i["poison"], dict) and i["poison"].get("tier") in (1, 2)):
            fail(f"{where}.poison: {{ tier: 1 or 2 }}")
        if "potion" in i and "poison" in i:
            fail(f"{where}: a potion or a poison, not both")
        if not (i.get("stack") and i.get("belt") is True):
            fail(f"{where}: a potion stacks and rides the belt (`stack`, `belt` true)")
        r = _rows_by_out.get(i["id"])
        if not r or r.get("station") != "cauldron" or not r.get("water") or not r.get("fire") or not any(w.get("id") == "clay_vial" for w in r.get("in", [])):
            fail(f"{where}: brewed at the cauldron over its fire from a clay vial and a draught of clean water (data/recipes.json)")
if any("potion" in i for i in items) and "clay_vial" not in {i["id"] for i in items}:
    fail("items: a potion leaves a clay vial, and there is none")

# A bow's arrows (#317): its `ammo`, the order it takes them in (archery.launcherOf, and the hover cards of the bow and of each arrow), names
# items of the kind ammo; an item's own `ignite` (a fire arrow's) is true or absent.
by_id = {i["id"]: i for i in items}
for i in items:
    b = i.get("bow")
    if b and "ammo" in b:
        if not (isinstance(b["ammo"], list) and b["ammo"] and all(by_id.get(a, {}).get("kind") == "ammo" for a in b["ammo"])):
            fail(f"items.{i['id']}.bow.ammo: a list of ammunition item ids")
    if "ignite" in i and i["ignite"] is not True:
        fail(f"items.{i['id']}.ignite: true or absent")
    # A poisoned arrow (docs/47 section 6, #482): `poisoned` { tier: 1 or 2 } on ammunition alone, never beside `ignite` (fire and poison do not mix).
    if "poisoned" in i:
        if i.get("kind") != "ammo" or not (isinstance(i["poisoned"], dict) and i["poisoned"].get("tier") in (1, 2)) or "ignite" in i:
            fail(f"items.{i['id']}.poisoned: {{ tier: 1 or 2 }} on ammunition that does not burn")
    # The `blade` tag (docs/47 section 6: what a poison coats) is on exactly the items whose `repair` block says `edged`.
    if ("blade" in i.get("tags", [])) != bool((i.get("repair") or {}).get("edged")):
        fail(f"items.{i['id']}: the blade tag goes on exactly the edged weapons (repair.edged)")

# The poisons' numbers (docs/47 section 6; data/combat.json `poison`, src/poison.js): the drain by stacks for each tier, as many as `max`,
# the timer, a coat's hits, and the arrows a vial makes, each above 0.
_po = load("data/combat.json").get("poison") or {}
_dps = _po.get("dpsByStacks") or {}
if not all(isinstance(_dps.get(t), list) and len(_dps[t]) == _po.get("max") and all(num(v) and v > 0 for v in _dps[t]) for t in ("ordinary", "strong")):
    fail("combat.poison.dpsByStacks: `ordinary` and `strong`, each a number above 0 for every stack up to `max`")
for k in ("max", "hits", "arrows"):
    if not (isinstance(_po.get(k), int) and not isinstance(_po.get(k), bool) and _po[k] > 0):
        fail(f"combat.poison.{k}: a whole number above 0")
if not (num(_po.get("duration")) and _po["duration"] > 0):
    fail("combat.poison.duration: seconds above 0")
# An `exact` Use row (src/interactions.js `usedBy`) matches its `use` as an item id alone, never a tag, so that `use` must be an item's id.
for _r in load("data/interactions.json").get("rows", []):
    if "exact" in _r and (_r["exact"] is not True or _r.get("use") not in by_id):
        fail(f"interactions: the exact row for {_r.get('use')!r} on {_r.get('on')!r}: `exact` is true, and its `use` an item id")

# The farms and the mill (#201): every recipe's station is some sprite's `station` (or the cooking fire), the millstones grind grain, every crop's seed is in
# both granaries' fixed tables (a seed source for every crop, never refilled), and no crop is a dead end (its harvest is an ingredient, by id or tag).
station_names = {load(f"data/sprites/{sid}.json").get("station") for sid in sprites} - {None}
recipe_rows = load("data/recipes.json")["rows"]
for row in recipe_rows:
    if row["station"] not in station_names and row["station"] != "cooking":
        fail(f"recipes.{row['id']}: no sprite is a station called {row['station']!r}")
if not any(r["station"] == "millstones" and r["in"][0].get("id") == "grain" and r["out"].get("id") == "flour" and not r.get("fire") for r in recipe_rows):
    fail("recipes: the millstones have no grain-to-flour row without a fire")
for table in ("granary_hollow", "granary_mill"):
    held = {e["item"] for e in loot_tables[table].get("fixed", [])}
    for kind, c in crops["crops"].items():
        if c["seed"] not in held:
            fail(f"loot.{table}: no {c['seed']!r}, the seed of {kind}")
item_tags = {i["id"]: set(i.get("tags", [])) for i in items}
for kind, c in crops["crops"].items():
    h = c["harvest"]["item"]
    if not any(w.get("id") == h or (w.get("tag") and w["tag"] in item_tags[h]) for r in recipe_rows for w in r["in"]):
        fail(f"crops.{kind}: its harvest {h!r} is an ingredient of no recipe (a dead-end crop)")

# Real-world references (Michael, 2026-10-18): each names a thing that exists, carries the thing's name as the game has it (so a rename
# is caught here), and says what it refers to and when.
for n, r in enumerate(load("data/references.json")["references"]):
    where = f"references[{n}]"
    item = (r.get("thing") or {}).get("item")
    check_id(f"{where}.thing.item", item)
    if item in item_defs and item_defs[item]["name"] != r.get("name"):
        fail(f"{where}: the name {r.get('name')!r} is not the item's, {item_defs[item]['name']!r}")
    w = r.get("work") or {}
    if not (w.get("title") and w.get("by") and w.get("kind") and r.get("how") and r.get("since") and r.get("from")):
        fail(f"{where}: needs work.title, work.by, work.kind, how, since, and from")


# Talk (docs/34, #198): every file under data/talk is well formed, and it can only read the world, never write it: no key the loader does not know,
# every condition in the fixed vocabulary (src/talk.js CONDITIONS, mirrored here) with a value of its kind, every `goto` names a node, `start` exists,
# every node is reachable from it, a villagerAlive/villagerDead names a talk id, a bark line fits a bubble (tuning.villager.barkMaxLength), a map's guide
# has its file, and a `wiki` title is a page of the wiki when the wiki can be read (CMZ_WIKI, else C:/Users/micha/Dev/cmz-wiki).
TALK_CONDITIONS = {"time": "phase", "deadNear": "bool", "deadInWorld": "bool", "villagerAlive": "id", "villagerDead": "id", "indoors": "bool", "hurt": "bool",
                   "holding": "item", "hungry": "bool", "thirsty": "bool", "tired": "bool", "bleeding": "bool"}
talk_files = {os.path.basename(p)[:-5]: load(p) for p in sorted(glob.glob("data/talk/*.json"))}
bark_max = load("data/tuning.json")["villager"]["barkMaxLength"]
wiki_dir = os.environ.get("CMZ_WIKI") or "C:/Users/micha/Dev/cmz-wiki"
wiki_titles = None
if os.path.isdir(os.path.join(wiki_dir, "pages")):
    import re
    wiki_titles = set()
    for p in glob.glob(os.path.join(wiki_dir, "pages", "**", "*.md"), recursive=True):
        with open(p, encoding="utf-8") as f:
            head = f.read(600)
        m = re.search(r"^title:\s*(.+)$", head, re.M)
        if m:
            wiki_titles.add(m.group(1).strip().lower())
        a = re.search(r"^aliases:\s*\[(.*)\]", head, re.M)
        if a:
            wiki_titles.update(x.strip().lower() for x in a.group(1).split(",") if x.strip())
else:
    notes.append("talk: the wiki is not at " + wiki_dir + ", so a topic's `wiki` link is not checked against its pages")
item_ids = {i["id"] for i in items}
item_tag_set = {t for i in items for t in i.get("tags", [])}


def talk_keys(where, obj, allowed):
    for k in obj:
        if k not in allowed:
            fail(f"talk.{where}: unknown key {k!r} (talk data has no field that could write)")


def talk_when(where, when):
    if when is None:
        return
    if not isinstance(when, dict):
        fail(f"talk.{where}: `when` is an object of conditions")
        return
    for k, v in when.items():
        kind = TALK_CONDITIONS.get(k)
        if kind is None:
            fail(f"talk.{where}: unknown condition {k!r}")
        elif kind == "bool" and not isinstance(v, bool):
            fail(f"talk.{where}: {k} is true or false")
        elif kind == "phase" and v not in ("day", "night", "dawn", "dusk"):
            fail(f"talk.{where}: {k} is day, night, dawn, or dusk, not {v!r}")
        elif kind == "id" and v not in talk_files:
            fail(f"talk.{where}: {k} names {v!r}, which has no file in data/talk")
        elif kind == "item" and not (v in item_ids or v in item_tag_set):
            fail(f"talk.{where}: {k} names {v!r}, which is no item or tag")


def talk_lines(where, lines, limit=None):
    if not isinstance(lines, list) or not lines or not all(isinstance(l, str) and l for l in lines):
        fail(f"talk.{where}: `lines` is a list of one or more lines")
        return
    if limit:
        for l in lines:
            if len(l) > limit:
                fail(f"talk.{where}: a bark of {len(l)} characters, over {limit}: {l!r}")


for tid, f in talk_files.items():
    talk_keys(tid, f, {"name", "note", "barks", "start", "nodes"})
    for i, g in enumerate(f.get("barks", [])):
        talk_keys(f"{tid}.barks[{i}]", g, {"when", "lines", "ambient"})
        if "ambient" in g and not isinstance(g["ambient"], bool):
            fail(f"talk.{tid}.barks[{i}]: `ambient` is true or false")
        talk_when(f"{tid}.barks[{i}]", g.get("when"))
        talk_lines(f"{tid}.barks[{i}]", g.get("lines"), bark_max)
    nodes = f.get("nodes", {})
    if f.get("start") not in nodes:
        fail(f"talk.{tid}: `start` names {f.get('start')!r}, which is not a node")
    for nid, n in nodes.items():
        where = f"{tid}/{nid}"
        talk_keys(where, n, {"say", "options", "end"})
        say = n.get("say", [])
        if say and isinstance(say[0], dict):
            for j, v in enumerate(say):
                talk_keys(f"{where}.say[{j}]", v, {"when", "lines"})
                talk_when(f"{where}.say[{j}]", v.get("when"))
                talk_lines(f"{where}.say[{j}]", v.get("lines"))
        elif say:
            talk_lines(where + ".say", say)
        if not say and not n.get("options"):
            fail(f"talk.{where}: a node with no lines and no options")
        if not n.get("options") and not n.get("end"):
            fail(f"talk.{where}: no options and not `end`: the panel would have nowhere to go but its own button")
        for j, o in enumerate(n.get("options", [])):
            talk_keys(f"{where}.options[{j}]", o, {"text", "goto", "end", "when", "wiki"})
            if not o.get("text"):
                fail(f"talk.{where}.options[{j}]: no text")
            if bool(o.get("goto")) == bool(o.get("end")):
                fail(f"talk.{where}.options[{j}]: exactly one of `goto` and `end`")
            if o.get("goto") and o["goto"] not in nodes:
                fail(f"talk.{where}.options[{j}]: `goto` names {o['goto']!r}, which is not a node")
            talk_when(f"{where}.options[{j}]", o.get("when"))
            if o.get("wiki") and wiki_titles is not None and o["wiki"].lower() not in wiki_titles:
                fail(f"talk.{where}.options[{j}]: no wiki page titled {o['wiki']!r}")
    # every node reachable from start
    seen, todo = set(), [f.get("start")]
    while todo:
        k = todo.pop()
        if k in seen or k not in nodes:
            continue
        seen.add(k)
        todo += [o["goto"] for o in nodes[k].get("options", []) if o.get("goto")]
    for nid in nodes:
        if nid not in seen:
            fail(f"talk.{tid}/{nid}: not reachable from `{f.get('start')}`")
for mp in sorted(glob.glob("data/maps/*.json")):
    mj = load(mp)
    guides = [v for v in mj.get("villagers", []) if v.get("guide")]
    # Every map the generator makes has exactly one guide within 3 tiles of its spawn (docs/34; MapGen.write insists, and a hand-edited map is caught here);
    # the hand-written proving ground (`square`) has none.
    if os.path.basename(mp) != "square.json":
        sx, sy = mj.get("spawn", [0, 0])
        if len(guides) != 1:
            fail(f"{mp}: {len(guides)} guides (a generated map has exactly one)")
        elif ((guides[0]["tile"][0] - sx) ** 2 + (guides[0]["tile"][1] - sy) ** 2) ** 0.5 > 3:
            fail(f"{mp}: the guide stands more than 3 tiles from the spawn {mj.get('spawn')}")
    for v in mj.get("villagers", []):
        if v.get("guide"):
            tid = v.get("talk") or str(v.get("name", "")).lower()
            if tid not in talk_files:
                fail(f"{mp}: the guide {v.get('name')!r} has no talk file {tid!r}")
            if not v.get("immune"):
                fail(f"{mp}: the guide {v.get('name')!r} is not immune to the dead")

# The gatherables law (CLAUDE.md, Michael 2026-10-11): an interactable thing on a dev box has the dark outline all the way round (`placeholder.outline: true`).
for sid in sorted(sprites):
    d = load(f"data/sprites/{sid}.json")
    ph = d.get("placeholder")
    if d.get("interactable") and ph and ph.get("kind") == "box" and ph.get("outline") is not True:
        fail(f"sprites.{sid}: an interactable dev box without `outline: true` (a gatherable is outlined all the way round)")

# The tool rule (#214, #215): every verb a recipe `uses`, a crop's `tool`, a build kind's `tool`, and the tuning's boardTool and splitTool is the verb of some tool
# item, so a refusal can name it and a carried one is found by its data.
tool_verbs = {v for i in items if i.get("kind") == "tool" for v in i.get("verbs", [])}
wanted = {}
for row in load("data/recipes.json")["rows"]:
    if row.get("uses"):
        wanted[f"recipes.{row['id']}.uses"] = row["uses"]
for kind, c in load("data/crops.json")["crops"].items():
    if c.get("tool"):
        wanted[f"crops.{kind}.tool"] = c["tool"]
for kind, b in load("data/build.json").items():
    if isinstance(b, dict) and b.get("tool"):
        wanted[f"build.{kind}.tool"] = b["tool"]
for key in ("boardTool", "splitTool"):
    wanted[f"tuning.world.{key}"] = load("data/tuning.json")["world"][key]
wanted["tuning.work.anvil.uses"] = load("data/tuning.json").get("work", {}).get("anvil", {}).get("uses")
for where, verb in wanted.items():
    if verb not in tool_verbs:
        fail(f"{where}: no tool item lists the verb {verb!r}")

# Repairs, the sawpit, and honey (docs/43 section 6, #410): an item's `repair` names a material that exists, is on a thing that wears (a weapon's
# kills or a bow's shots) and that a recipe makes ("the weapons and tools that can be made"), and `edged` is true or absent; the ladders are
# ceilings from 0 to 1 that fall; a sprite's `repair` is the grindstone or the anvil and some prop is each, as some prop is a sawpit and a hive;
# the sawpit's item splits into something; the hive's honey is food with a count, days, and seconds.
work = load("data/tuning.json").get("work", {})
made_ids = {r["out"].get("id") for r in recipe_rows if r.get("out")}
for i in items:
    r = i.get("repair")
    if r is None:
        continue
    where = f"items.{i['id']}.repair"
    if not isinstance(r, dict) or set(r) - {"with", "edged"}:
        fail(f"{where}: {{ with, edged? }}")
        continue
    check_id(where, r.get("with"))
    if r.get("edged") not in (None, True):
        fail(f"{where}.edged: true or absent")
    if not ((i.get("weapon") or {}).get("kills") or i.get("shots")):
        fail(f"{where}: on a thing that does not wear (no weapon kills, no shots)")
    if i["id"] not in made_ids:
        fail(f"{where}: no recipe makes {i['id']!r}, and only what can be made is repaired")
for place in ("grindstone", "anvil"):
    lad = (work.get(place) or {}).get("ceilings")
    if not (isinstance(lad, list) and lad and all(num(c) and 0 < c <= 1 for c in lad) and all(a > b for a, b in zip(lad, lad[1:]))):
        fail(f"tuning.work.{place}.ceilings: falling shares above 0, at most 1")
    if not (num((work.get(place) or {}).get("seconds")) and work[place]["seconds"] > 0):
        fail(f"tuning.work.{place}.seconds: a number above 0")
sprite_flags = {sid: load(f"data/sprites/{sid}.json") for sid in sorted(sprites)}
for sid, d in sprite_flags.items():
    if "repair" in d and d["repair"] not in ("grindstone", "anvil"):
        fail(f"sprites.{sid}.repair: grindstone or anvil, not {d['repair']!r}")
for flag, value in (("repair", "grindstone"), ("repair", "anvil"), ("saw", True), ("hive", True)):
    if not any(d.get(flag) == value for d in sprite_flags.values()):
        fail(f"sprites: no definition has {flag} {value!r}")
# A recipe a world rule keeps off (docs/43 section 5): its `rule` names a world rule (src/rules.js DEFAULTS); a village station's prop is
# made only behind one, and a sprite marked `villageStation` stays fixed (`carry` false) unless the rule moves it.
import re as _re
_rules_src = open("src/rules.js", encoding="utf-8").read()
_rule_keys = set(_re.findall(r"^  (\w+):", _rules_src.split("export const DEFAULTS = {", 1)[1].split("};", 1)[0], _re.M))
for r in load("data/recipes.json")["rows"]:
    if "rule" in r and r["rule"] not in _rule_keys:
        fail(f"recipes.{r['id']}.rule: no world rule {r['rule']!r}")
    out_prop = (r.get("out") or {}).get("prop")
    if out_prop and out_prop in sprite_flags and sprite_flags[out_prop].get("villageStation") and r.get("rule") != "villageStations":
        fail(f"recipes.{r['id']}: a village station is made only behind the rule villageStations")
for sid, d in sprite_flags.items():
    if d.get("villageStation") and d.get("carry") is not False:
        fail(f"sprites.{sid}: a village station is fixed (carry false); the world rule moves it")
# Set down and picked up again (docs/43 sections 3 and 4; src/setdown.js): an item's `place` or `placeAs` names a sprite, its `stand` a rule;
# a sprite's `item` names the item Pick up gives back; a palette prop's `stand` likewise.
STANDS = ("outdoors", "wall", "ground", "natural")  # natural: open grass outdoors, a sapling's (docs/46 step 3, src/trees.js)
for i in items:
    for key in ("place", "placeAs"):
        if key in i and i[key] not in sprites:
            fail(f"items.{i['id']}.{key}: no sprite {i[key]!r}")
    if "stand" in i and i["stand"] not in STANDS:
        fail(f"items.{i['id']}.stand: one of {STANDS}, not {i['stand']!r}")
# How an item's name counts in a sentence (src/items.js countName): `noun` "mass" (some lard, 3 raw venison) or "pair" (shears, 2 shears),
# and `plural` a plural that is not +s, a non-empty string; `article` the words before one ("a pair of"). A prop's sprite counts the same way
# (src/prop-names.js), and its `name` (what a line calls it, lower case) is a non-empty string.
NOUNS = ("mass", "pair")
def check_counting(where, d):
    if "noun" in d and d["noun"] not in NOUNS:
        fail(f"{where}.noun: one of {NOUNS}, not {d['noun']!r}")
    for key in ("plural", "article"):
        if key in d and not (isinstance(d[key], str) and d[key].strip()):
            fail(f"{where}.{key}: words, not {d[key]!r}")
for i in items:
    check_counting(f"items.{i['id']}", i)
for sid, d in sprite_flags.items():
    check_counting(f"sprites.{sid}", d)
    if "name" in d and not (isinstance(d["name"], str) and d["name"].strip()):
        fail(f"sprites.{sid}.name: words, not {d['name']!r}")
    if "name" in d and "wall" not in d and d["name"] != d["name"].lower():
        fail(f"sprites.{sid}.name: lower case, as a line says it, not {d['name']!r}")
for sid, d in sprite_flags.items():
    if "item" in d and d["item"] not in item_ids:
        fail(f"sprites.{sid}.item: no item {d['item']!r}")
for k, b in build.items() if isinstance(build, dict) else []:
    if isinstance(b, dict) and b.get("kind") == "prop":
        if b.get("sprite") not in sprites:
            fail(f"build.{k}.sprite: no sprite {b.get('sprite')!r}")
        if b.get("stand", "ground") not in STANDS:
            fail(f"build.{k}.stand: one of {STANDS}, not {b.get('stand')!r}")
saw = work.get("saw") or {}
check_id("tuning.work.saw.item", saw.get("item"))
if saw.get("item") in item_defs and not item_defs[saw["item"]].get("splitsInto"):
    fail(f"tuning.work.saw.item: {saw.get('item')!r} splits into nothing")
if not (num(saw.get("seconds")) and saw["seconds"] > 0):
    fail("tuning.work.saw.seconds: a number above 0")
honey = work.get("honey") or {}
check_id("tuning.work.honey.item", honey.get("item"))
if honey.get("item") in item_defs and item_defs[honey["item"]].get("kind") != "food":
    fail(f"tuning.work.honey.item: {honey.get('item')!r} is not food")
hc_count = honey.get("count") or []
if not (len(hc_count) == 2 and 1 <= hc_count[0] <= hc_count[1] and num(honey.get("days")) and honey["days"] > 0 and num(honey.get("seconds")) and honey["seconds"] > 0):
    fail("tuning.work.honey: a count [lo, hi], days and seconds above 0")

# The chart's colours (docs/33, #203): every floor definition has a `mapColor` (#rrggbb), the trees and rocks have one, and the palette (every definition with one)
# fits a byte (the cell's surface index).
mapcolors = 0
for sid in sorted(sprites):
    d = load(f"data/sprites/{sid}.json")
    mc = d.get("mapColor")
    if mc is not None:
        mapcolors += 1
        if not (isinstance(mc, str) and len(mc) == 7 and mc[0] == "#" and all(ch in "0123456789abcdefABCDEF" for ch in mc[1:])):
            fail(f"sprites.{sid}: mapColor {mc!r} is not #rrggbb")
    elif sid.startswith("floor_") or sid.startswith("tree_") or (sid.startswith("rock_") and sid[5:].isdigit()):
        fail(f"sprites.{sid}: no `mapColor` (the map needs one for every floor, tree, and rock)")
if mapcolors > 255:
    fail(f"the chart's palette has {mapcolors} colours; it holds 255")

# Every picture named exists.
referenced = set()


def check_png(where, p):
    referenced.add(os.path.normpath(p))
    if not os.path.exists(p):
        fail(f"{where}: missing picture {p}")


for path in sorted(glob.glob("data/sprites/*.json")):
    for p in pngs_in(load(path)):
        check_png(path, p)
for i in items:
    for p in pngs_in(i):
        check_png(f"items.{i['id']}", p)
ground = load("data/ground.json")
for p in pngs_in(ground):
    check_png("ground.json", p)
for sid in ground.get("floors", {}):
    if sid not in sprites:
        fail(f"ground.floors: no sprite {sid!r}")
for name, t in ground.get("terrain", {}).items():
    for sid in [t.get("texture")] + (t.get("tiles") if isinstance(t.get("tiles"), list) else [t.get("tiles")]):
        if sid and sid not in sprites:
            fail(f"ground.terrain.{name}: no sprite {sid!r}")
for path in glob.glob("data/maps/*.json"):
    for p in pngs_in(load(path)):
        check_png(path, p)

# The pair rule (docs/26): drawn world art and an icon come together. An icon generated from a design (`icon.placeholder`: a sprite's id
# whose definition is a gatherable's dev art, or a design of its own; docs/46 step 2) is both halves from one design: main.js makes the
# bag's picture and the item lying on the floor from it; it names a design src/gather-art.js draws, and no `src` of its own.
ART_KINDS = ("herb", "mushroom", "lump", "sapling", "vial")  # vial: a clay vial and its potions (docs/47 section 8)
generated = 0
for i in items:
    ph = (i.get("icon") or {}).get("placeholder")
    if ph is None:
        continue
    generated += 1
    if i["icon"].get("src"):
        fail(f"items.{i['id']}.icon: a generated icon has no src (main.js makes it)")
    design = ph
    if isinstance(ph, str):
        if ph not in sprites:
            fail(f"items.{i['id']}.icon: no sprite {ph!r} to draw it from")
            continue
        sd = load(f"data/sprites/{ph}.json")
        if sd.get("image") or sd.get("images") or sd.get("drawings"):
            fail(f"items.{i['id']}.icon: its sprite {ph!r} is drawn art now; the item wants its own drawn icon (a src) in place of the generated one")
        if not any((sd.get(f) or {}).get("item") == i["id"] for f in ("gather", "dig", "mine")) and sd.get("item") != i["id"]:
            fail(f"items.{i['id']}.icon: its sprite {ph!r} does not give {i['id']!r} (no gather, dig, or mine block names it, nor its Pick up's `item`)")
        design = sd.get("placeholder") or {}
    if not isinstance(design, dict) or design.get("kind") not in ART_KINDS:
        fail(f"items.{i['id']}.icon: a design of kind {' or '.join(ART_KINDS)}, not {design!r}")
    if i["icon"].get("size") != [19 * i["size"][0], 19 * i["size"][1]]:
        fail(f"items.{i['id']}.icon: its size is the footprint at 19 px a cell")
drawn = 0
placeholders = []
for i in items:
    held = i.get("held") or {}
    world = bool(held.get("image") or held.get("angles") or held.get("facings"))
    icon = bool(i.get("icon")) and (i.get("icon") or {}).get("placeholder") is None
    if world != icon:
        fail(f"items.{i['id']}: half a pair ({'world picture' if world else 'icon'} only; docs/26)")
    elif world:
        drawn += 1
    else:
        placeholders.append(i["id"])
notes.append(f"{drawn} items with drawn art as pairs, {len(placeholders)} on placeholder art ({generated} with a generated pair)")

# The dye vat (docs/43 section 8, #412): every colour a name and a hex, every palette's ids colours, and each item's `dye` block
# names regions whose palette or colours exist, or schemes of a colour per region; a painted item's `art.keys` is a pair of
# hex tones per region, and only a wearable item is dyeable.
HEX = re.compile(r"^#[0-9a-fA-F]{6}$")
dyes = load("data/dyes.json") if os.path.exists("data/dyes.json") else {"colours": {}, "palettes": {}}
dye_colours = dyes.get("colours", {})
for cid, c in dye_colours.items():
    if not isinstance(c, dict) or not c.get("name") or not HEX.match(str(c.get("hex", ""))):
        fail(f"dyes.colours.{cid}: wants a name and a #rrggbb hex")
    for w in (c.get("cost") or []) if isinstance(c, dict) else []:
        check_id(f"dyes.colours.{cid}.cost", w.get("item"))
for pid, pal in dyes.get("palettes", {}).items():
    for cid in pal:
        if cid not in dye_colours:
            fail(f"dyes.palettes.{pid}: no colour {cid!r}")
dyeable = 0
for i in items:
    d = i.get("dye")
    keys = (i.get("art") or {}).get("keys")
    if d is None:
        if keys is not None:
            fail(f"items.{i['id']}: art.keys with no dye block")
        continue
    dyeable += 1
    regions = d.get("regions") or []
    if not i.get("wear"):
        fail(f"items.{i['id']}: a dye block on an item that is not worn")
    if not regions:
        fail(f"items.{i['id']}: a dye block with no regions")
    for n, r in enumerate(regions):
        if not r.get("name"):
            fail(f"items.{i['id']}.dye.regions[{n}]: no name")
        if r.get("palette") is not None and r["palette"] not in dyes.get("palettes", {}):
            fail(f"items.{i['id']}.dye.regions[{n}]: no palette {r['palette']!r}")
        for cid in r.get("colours") or []:
            if cid not in dye_colours:
                fail(f"items.{i['id']}.dye.regions[{n}]: no colour {cid!r}")
        if not d.get("schemes") and not r.get("palette") and not r.get("colours"):
            fail(f"items.{i['id']}.dye.regions[{n}]: neither a palette nor colours, and the item has no schemes")
        # A region's `tones` (Michael, 2026-10-26): the drawn icon's and portrait's tones it owns, recoloured by src/ui/dyed-art.js; no tone in two regions.
        tones = r.get("tones")
        if tones is not None and (not isinstance(tones, list) or not all(isinstance(t, str) and re.fullmatch(r"#[0-9a-f]{6}", t) for t in tones)):
            fail(f"items.{i['id']}.dye.regions[{n}].tones: a list of lower-case #rrggbb")
        if tones and r.get("base") not in tones:
            fail(f"items.{i['id']}.dye.regions[{n}].base: one of its tones, the picture's main tone of the region")
        if tones and "#2b2522" in tones:
            fail(f"items.{i['id']}.dye.regions[{n}].tones: the outline is never a dye tone")
    owned = [t for r in regions for t in (r.get("tones") or [])]
    if len(owned) != len(set(owned)):
        fail(f"items.{i['id']}.dye: a tone named by two regions")
    for n, sch in enumerate(d.get("schemes") or []):
        if len(sch) != len(regions):
            fail(f"items.{i['id']}.dye.schemes[{n}]: {len(sch)} colours for {len(regions)} regions")
        for cid in sch:
            if cid not in dye_colours:
                fail(f"items.{i['id']}.dye.schemes[{n}]: no colour {cid!r}")
    if keys is not None:
        if not (i.get("art") or {}).get("painted"):
            fail(f"items.{i['id']}: art.keys on an item with no painted layer")
        if len(keys) > len(regions) or any(len(k) != 2 or not all(HEX.match(str(t)) for t in k) for k in keys):
            fail(f"items.{i['id']}: art.keys wants a pair of #rrggbb tones per region")
notes.append(f"{dyeable} dyeable items, {len(dye_colours)} dyes")

# The manifest matches the disk (docs/23, step 1).
manifest = load("data/manifest.json")
on_disk = {}
for dirpath, _, names in os.walk("data"):
    for name in names:
        rel = os.path.join(dirpath, name).replace(os.sep, "/")
        if rel == "data/manifest.json":
            continue
        with open(rel, "rb") as f:
            b = f.read()
        if rel.lower().endswith((".json", ".txt", ".md", ".css", ".js", ".html", ".svg", ".csv")):
            b = b.replace(b"\r\n", b"\n")  # stamped as git stores it, LF (tools/manifest.py, 2026-10-15)
        on_disk[rel] = hashlib.sha1(b).hexdigest()[:8]
for rel, stamp in on_disk.items():
    entry = manifest["files"].get(rel)
    if not entry:
        fail(f"manifest: {rel} is on disk but not listed (run python tools/manifest.py, or restart serve.py)")
    elif entry["stamp"] != stamp:
        fail(f"manifest: {rel} changed since the manifest was written (stamp {entry['stamp']} on file, {stamp} on disk)")
for rel in manifest["files"]:
    if rel not in on_disk:
        fail(f"manifest: {rel} is listed but not on disk")

# Orphans: pictures nothing names (a note, not a failure: the stored fireball sheet is one by design).
all_pngs = {os.path.normpath(p) for p in glob.glob("data/art/**/*.png", recursive=True)}
orphans = sorted(p.replace(os.sep, "/") for p in all_pngs - referenced)
if orphans:
    notes.append("pictures nothing names: " + ", ".join(orphans))

for n in notes:
    print("note:", n)
if failures:
    print("\n".join(failures))
    print(f"{len(failures)} failures")
    sys.exit(1)
print(f"ok: {len(ids)} items, {len(sprites)} sprite definitions, {len(on_disk)} data files in the manifest")
