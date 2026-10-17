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
