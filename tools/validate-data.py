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

# Mining (#196): a `mine` block names an item that exists, a count, seconds, and either `gone` or a spent kind that exists, says it ripens back,
# and agrees with the whole one on everything but the picture (restaging swaps only the sprite and its day).
for sid in sorted(sprites):
    d = load(f"data/sprites/{sid}.json")
    m = d.get("mine")
    if not m:
        continue
    check_id(f"sprites.{sid}.mine", m.get("item"))
    if not (len(m.get("count", [])) == 2 and 1 <= m["count"][0] <= m["count"][1] and m.get("seconds", 0) > 0):
        fail(f"sprites.{sid}.mine: a count [lo, hi] from 1 and seconds above 0")
    if not (m.get("gone") or m.get("spent")):
        fail(f"sprites.{sid}.mine: it either goes (`gone`) or stands spent (`spent` and `days`)")
    if m.get("spent"):
        if m["spent"] not in sprites:
            fail(f"sprites.{sid}.mine: no spent kind {m['spent']!r}")
            continue
        sp = load(f"data/sprites/{m['spent']}.json")
        if sp.get("ripens") != sid:
            fail(f"sprites.{m['spent']}: `ripens` should name {sid!r}, not {sp.get('ripens')!r}")
        if not m.get("days", 0) > 0:
            fail(f"sprites.{sid}.mine: a spent rock needs `days` above 0")
        for field in ("collide", "interactable", "carry", "solid", "footprint"):
            if d.get(field) != sp.get(field):
                fail(f"sprites.{sid} and {m['spent']} disagree on {field!r}")

# Chopping (#195): a tool lists the verb `chop`, the stump and the tuning's names exist, and every placed container's own `loot` names a table.
if not any("chop" in i.get("verbs", []) for i in items):
    fail("chopping: no item lists the verb 'chop'")
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

# Recipes (#212): every item a recipe takes, makes, wields (`tool`), or must carry (`carry`) exists (an ingredient may be a tag instead), a prop
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
    for key in ("tool", "carry"):
        if row.get(key):
            check_id(f"recipes.{rid}.{key}", row[key])
if not any(row["station"] == "loom" for row in load("data/recipes.json")["rows"]):
    fail("recipes: the loom has no rows")

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

# The gatherables law (CLAUDE.md, Michael 2026-10-11): an interactable thing on a dev box has the dark outline all the way round (`placeholder.outline: true`).
for sid in sorted(sprites):
    d = load(f"data/sprites/{sid}.json")
    ph = d.get("placeholder")
    if d.get("interactable") and ph and ph.get("kind") == "box" and ph.get("outline") is not True:
        fail(f"sprites.{sid}: an interactable dev box without `outline: true` (a gatherable is outlined all the way round)")

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

# The pair rule (docs/26): drawn world art and an icon come together.
drawn = 0
placeholders = []
for i in items:
    held = i.get("held") or {}
    world = bool(held.get("image") or held.get("angles"))
    icon = bool(i.get("icon"))
    if world != icon:
        fail(f"items.{i['id']}: half a pair ({'world picture' if world else 'icon'} only; docs/26)")
    elif world:
        drawn += 1
    else:
        placeholders.append(i["id"])
notes.append(f"{drawn} items with drawn art as pairs, {len(placeholders)} on placeholder art")

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
