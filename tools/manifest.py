"""The manifest of every file under data/ (docs/23, step 1): the game loads what this lists, in
parallel and in batches, instead of discovering files by walking the map. Each file carries a stamp
(the first eight hex digits of its SHA-1) that the loader appends as ?v=<stamp>, which serve.py
answers with a long cache life, so a hard refresh re-fetches only what changed.

Usage: python tools/manifest.py [repo root]      (serve.py runs it on start and after every save)
"""
import hashlib
import json
import os
import sys

OUT = os.path.join("data", "manifest.json")


def build(root):
    files = {}
    data = os.path.join(root, "data")
    for dirpath, dirnames, filenames in os.walk(data):
        dirnames.sort()
        for name in sorted(filenames):
            full = os.path.join(dirpath, name)
            rel = os.path.relpath(full, root).replace(os.sep, "/")
            if rel == OUT.replace(os.sep, "/"):
                continue
            with open(full, "rb") as f:
                digest = hashlib.sha1(f.read()).hexdigest()[:8]
            files[rel] = {"size": os.path.getsize(full), "stamp": digest}
    version = hashlib.sha1("\n".join(f"{p}:{v['stamp']}" for p, v in files.items()).encode()).hexdigest()[:8]
    return {"version": version, "files": files}


def write(root):
    m = build(root)
    # One file per line, so a diff of the manifest reads as a list of what changed.
    lines = ["{", f'  "version": "{m["version"]}",', '  "files": {']
    items = list(m["files"].items())
    for i, (p, v) in enumerate(items):
        comma = "," if i < len(items) - 1 else ""
        lines.append(f'    {json.dumps(p)}: {{"size": {v["size"]}, "stamp": "{v["stamp"]}"}}{comma}')
    lines += ["  }", "}", ""]
    with open(os.path.join(root, OUT), "w", encoding="utf-8", newline="\n") as f:
        f.write("\n".join(lines))
    return m


if __name__ == "__main__":
    root = sys.argv[1] if len(sys.argv) > 1 else os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    m = write(root)
    print(f"{len(m['files'])} files, version {m['version']}")
