#!/bin/sh
# The whole 96 px wall set, from the generators to out/, in order. Plain python (numpy, PIL). Writes only under walls/.
set -e
G="$(cd "$(dirname "$0")" && pwd)"; W="$(dirname "$G")"
# 1. the oak, stone and log set, posts, leaves, shutters, boards, anchors_walls.json
cd "$G/village" && WALL_OUT="$G/village/out/village" python village.py
# 2. the four woods and daub, swapped from the new oak set (woods.py reads a repository-shaped refs folder)
R="$G/woods/refs96"; mkdir -p "$R/data/art/village" "$R/tools/art-gen/village"
cp "$G/village/out/village/"*.png "$R/data/art/village/"; cp "$G/village/out/village/anchors_walls.json" "$R/tools/art-gen/village/"
cd "$G/woods/generators" && WOODS_REFS="$R" WOODS_OUT="$G/woods/out/woods" python woods.py
# 3. the delivery, flat, as data/art/village is laid out
rm -f "$W/out/"*.png
cp "$G/village/out/village/"*.png "$G/woods/out/woods/"*.png "$W/out/"
cp "$G/village/out/village/anchors_walls.json" "$G/woods/out/woods/anchors_woods.json" "$G/woods/out/woods/wood_tones.json" "$W/out/"
# 4. previews, the old-new comparison, the checks and the MANIFEST
cd "$G/village" && WALL_OUT="$W/out" python village_preview.py && WALL_OUT="$W/out" python placement_preview.py && WALL_OUT="$W/out" python new_previews.py
cd "$G" && python compare.py && python verify.py
