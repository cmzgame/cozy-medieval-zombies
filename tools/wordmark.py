# The site's wordmark (docs/38), drawn: each letter a pixel grid, the two lines written as SVG
# under data/site/. Run `python -I tools/wordmark.py` after changing a glyph or a colour, then
# `python -I tools/manifest.py`. Not a font: only the letters the wordmark uses (Michael, 2026-10-17:
# "a custom one for just this word"). The Z and z angular and open, the s open, the e lowercase
# with a hole you can see through.
import io, os

# Rows 0 to 9 are the cap height, 2 to 9 the x-height, 10 to 12 the descender. "#" is ink.
G = {
    "C": [".######", "#######", "##.....", "##.....", "##.....", "##.....", "##.....", "##.....", "#######", ".######"],
    "M": ["##......##", "###....###", "####..####", "##.####.##", "##..##..##", "##......##", "##......##", "##......##", "##......##", "##......##"],
    "Z": ["########", "########", "......##", ".....##.", "....##..", "...##...", "..##....", ".##.....", "########", "########"],
    "a": ["", "", "######.", "#######", ".....##", ".######", "#######", "##...##", "#######", ".######"],
    "b": ["##.....", "##.....", "######.", "#######", "##...##", "##...##", "##...##", "##...##", "#######", "######."],
    "d": [".....##", ".....##", ".######", "#######", "##...##", "##...##", "##...##", "##...##", "#######", ".######"],
    "e": ["", "", ".#####.", "#######", "##...##", "##...##", "#######", "##.....", "#######", ".######"],
    "i": ["##", "", "##", "##", "##", "##", "##", "##", "##", "##"],
    "l": ["##", "##", "##", "##", "##", "##", "##", "##", "##", "##"],
    "m": ["", "", "#########.", "##########", "##..##..##", "##..##..##", "##..##..##", "##..##..##", "##..##..##", "##..##..##"],
    "o": ["", "", ".#####.", "#######", "##...##", "##...##", "##...##", "##...##", "#######", ".#####."],
    "s": ["", "", ".######", "#######", "##.....", "######.", ".######", ".....##", "#######", "######."],
    "v": ["", "", "##....##", "##....##", "##....##", "##....##", ".##..##.", ".##..##.", "..####..", "...##..."],
    "y": ["", "", "##...##", "##...##", "##...##", "##...##", "##...##", "#######", ".######", ".....##", ".....##", "######.", "#####.."],
    "z": ["", "", "######", "######", "....##", "...##.", "..##..", ".##...", "######", "######"],
}
GAP = 2     # columns between letters
SPACE = 5   # columns for a space

def width(ch):
    return max(len(r) for r in G[ch])

def runs(text):
    """The ink as (x, y, w) runs, and the drawing's width and height."""
    out, x, h = [], 0, 0
    for i, ch in enumerate(text):
        if ch == " ":
            x += SPACE
            continue
        rows = G[ch]
        h = max(h, len(rows))
        for y, row in enumerate(rows):
            c = 0
            while c < len(row):
                if row[c] == "#":
                    s = c
                    while c < len(row) and row[c] == "#":
                        c += 1
                    out.append((x + s, y, c - s))
                else:
                    c += 1
        x += width(ch) + (GAP if i < len(text) - 1 else 0)
    return out, x, h

def svg(text, stops, height_rows):
    rs, w, h = runs(text)
    h = max(h, height_rows)
    grad = "".join(f'<stop offset="{o}" stop-color="{c}"/>' for o, c in stops)
    rects = "".join(f'<rect x="{x}" y="{y}" width="{rw}" height="1"/>' for x, y, rw in rs)
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {w} {h}" width="{w}" height="{h}" shape-rendering="crispEdges">'
            f'<defs><linearGradient id="g" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="0" y2="10">{grad}</linearGradient></defs>'
            f'<g fill="url(#g)">{rects}</g></svg>\n')

def bands(*pairs):
    """Hard-edged bands: (colour, end fraction of the cap height) in order."""
    stops, start = [], 0.0
    for colour, end in pairs:
        stops += [(f"{start:.3f}", colour), (f"{end:.3f}", colour)]
        start = end
    return stops

# The big line in the dead's own greens (data/wardrobes.json's skins), banded as the stone was:
# a bright top, a seam, then light to dark.
BIG = bands(("#c6dfaa", 0.13), ("#6f8f5c", 0.19), ("#a9c891", 0.48), ("#8fae7a", 0.74), ("#6b875a", 1.0))
# The small line keeps its timber.
SMALL = bands(("#e2a35a", 0.30), ("#b9783a", 0.62), ("#8a5527", 1.0))

root = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "data", "site")
for name, text, stops, rows in (("wordmark_big.svg", "Zombies", BIG, 10), ("wordmark_small.svg", "Cozy Medieval", SMALL, 13)):
    with io.open(os.path.join(root, name), "w", encoding="utf-8", newline="\n") as f:
        f.write(svg(text, stops, rows))
    print("wrote", name)
