# Art 12: Characters, from the art side

**Status (2026-10-12, late): the body is the rig's (Michael's ruling, `02` "We have a body"); my four body rounds in `data/art/character/` were superseded and deleted with `body.py` and `deliver.py` (546997c). What I paint now is parts on the template through the slicer, per `28-painting-for-the-slicer.md`: round 1 of those is in `data/art/character/layers/` (36 layers: six hairs, three beards, six head pieces including the onion hat and the great helm, six chests including the knight's surcoat, four legs, four feet, three hands, four belts), every one checked through the slicer with nothing dropped; see `README_layers.md` there for the item specs and three engine notes.**

## The body, round 4 (2026-10-12)

Drawn per part per facing on the template's anchors, composited far to near with 4-neighbour outlines like `figure.js`, in five canonical tones (outline, skin base, skin shadow, eye white, pupil) that the game swaps: a living tone, an eye colour, or the dead's tone and red eyes, so a villager or the player turns in place with nothing redrawn. Michael's round-1 review: the generated head and eyes were better (the big eyes were an overcorrection, now withdrawn), the shoulders too forward and the arms too long and too straight; the feet and hands were keepers. Round 4 is the generated body's proportion, head, eyes and arms (the arms reconstructed from the rig's capsule on the template's joints and drawn under the torso as the generator orders them, pupil dyeable), the torso to the generated hip line, with the new legs, feet and hands, and two rules from Michael's round-2 review: nothing pokes above the shoulder line, and a far arm shows at least two pixels of skin before its outline meets the torso's; 6-wide quiet legs, feet that flare with a shaded sole, an 8-deep profile with 4-wide arms, and the slanted hem on the three-quarter views. Per-part layers include the pixels hidden at rest, for the rig. The skin ramp (eight living, three dead) in `character_body.json` is approved. Details in `../../data/art/character/README_body.md`.

## What already exists (do not duplicate)

| Doc | Says |
|---|---|
| `12-figure.md` | the generated rig and paper doll: joint table, eight facings, animations, held items, garment rules, the order table |
| `19-characters.md` | characters as one model; the dead dressed from items; dyes; wardrobes |
| `25-character-art-brief.md` | the commission: what the engine fixes, ten deliverables with three options each, colours as data, delivery format, all six questions ruled |
| `tools/template.html` | the exporter (built 2026-10-12) that writes the template PNGs and JSON an artist draws over |
| `data/hair/`, `data/layers/`, `tools/hair.html`, `tools/layers.html` | the painted layers Michael made himself |

## The contract in five lines (from `25`)

1. **Frame 48 x 72, feet anchor (24, 66).** The body is about 26 wide and 55 tall with hair; the head is about two fifths of the height and the shoulders are no wider than the head.
2. **Eight facings** (`s, sw, w, nw, n, ne, e, se`). Five may be delivered (`s, sw, w, nw, n`) and three mirrored, **except anything asymmetric** (a pouch on one hip, a satchel, a side-swept fringe).
3. **The rig animates; the artist does not.** Parts are painted once per facing in the rest pose, relative to each part's anchor, and the rig carries their pixels through every animation. So garments are *stiff*: a sleeve turns with the arm, a boot with the leg, nothing flaps on its own (no cloaks or loose skirts in this pipeline).
4. **Two tones plus the dark outline** per garment, hair and skin; **colour is data** (the engine dyes by replacing the tones), so one canonical colourway is drawn.
5. **One outline per body part, never per garment** ("no Michelin rolls"); the face is never shaded; **eyes are big (the generated whites 3 x 5 with a dyeable pupil stay, ruled 2026-10-13, `25` deliverable 1; the 4 x 6 below was the first ruling); no mouth, no nose**.

## Eyes: the one face rule that changed (Michael, 2026-10-12)

The face is two big eyes and nothing else; hair and facial hair attach to it. Generated today: **whites 3 x 5, coloured pupil 2 x 3**. Ruled: **whites 4 x 6 (1 px more at the top and at the outer side), pupil at least 2 x 4 (at least 1 px more at the top)**, so the player's eye colour has room to show. Full text and the checks (head fit, hairline clearance, which facings) are in `25-character-art-brief.md`, deliverable 1. My reading of "1 px top and side" is +1 wide and +1 tall per eye, outer side only; if Michael meant both sides, the whites are 5 wide and the gap between the eyes closes to 1 px, which I would not recommend at this head width. Also, `figure.js` still draws the old eyes, so the generated body will not match the drawn one until its face block is updated.

## The scale numbers I use for items (and which the body must keep)

| Number | Value | Used by |
|---|---|---|
| Character height | about 55 px with hair | every item preview stand-in figure |
| Hand height | about 14 px above the feet | held-item grips (`07`) |
| Hand reach | 9 to 10 px out from the body | held-item grips |
| Frame | 48 x 72, feet at (24, 66) | everything |

**Stale numbers elsewhere:** `16`, `15b` and some older docs give "the player is about 48 px tall and 20 wide"; `12-figure.md` says the body "uses about 28 wide and 44 tall". Those predate the current look. `25` has 26 x 55 and is the one I follow. If the new body changes the hand height or reach, **every grip pixel in `items.json` and every item's `held` anchor must be rechecked** (`07`).

## What I would do differently from the art so far

Everything in the village was procedural (`iso3d`) because walls and furniture are big textured boxes. Characters are the opposite: parts only 10 to 26 px across, where my own experience (cursors, knife, axe, book) says procedural geometry turns to mush and hand-pixelling wins. So:

- **Hand-pixel each part per facing** as ASCII grids with a palette dict (the method in `cursors.py` and `items.py`), onto the template's cell grid, using the template's anchors and segments to place each part. One tone key per material (`base`, `shadow`, `outline`), so dyeing is trivial.
- **Draw the body first**, before any garment, exactly as `25` orders it. Everything else is judged against it.
- **Draw five facings and mirror three** wherever the design is symmetric, to halve the work and the review; draw all eight only for asymmetric items.
- **Preview in the game's own pipeline**, not a standalone mock: lay each part on the template and check it at the engine's idle, walk and attack frames (`tools/layers.html` already previews a layer baked into those).
- **Keep the existing generated look as the reference**, not Michael's AI reference figures, which he said to take as vibe, not as art.

## What I need before drawing

1. **The slicer exists** (`23` pillar 3): built as `tools/slice.html` (`28`).
2. **Michael signs off the skin ramp** (eight living tones, three dead tones) and the **hair (about 12) and cloth (about 16) palettes**. The cursor's green and the pink/purple/green fantasy hair colours are placeholders until then.
3. **A ruling on how a hat that covers the face treats facial hair** is already given (`25` Q2: it pokes out); and **"a dress hides the leg garment and shows the shoes"** (Q5). Both affect the order in which parts are drawn.
4. **Michael's picks from the three options per category** in `25` (he may strike or add; the brief says so).

## Things from my other art the characters must agree with

- **The dead and the zombie hand:** the zombie cursor uses its own skin green (`#a8bb80` `#8ea26a` `#71864f` `#56683c`). Pick the dead's skin ramp first, then re-derive the cursor from it so the hand cursor matches the dead the player sees.
- **Held items:** grip pixels and the item angle table (`07`) assume the current hand height and reach. The book is held flat and palm-up (a **palm-up hold pose** is a "small rig change" in `24`, not drawn art).
- **Villagers who rise as the dead keep their own clothes** (Michael: a feature, not a test). So every garment must read well on both a living and a dead skin, and a torn flag is a *rule on the garment* (drop a sleeve or a ragged hem), not a second drawing.
- **The onion hat** is Michael's favourite and the world's popular peasant look: a green hood that covers the whole head except an eye slit, with a nub on top. Treat it as the hero head item.
- **Outline colour:** the brief allows either `#2b2522` (the world's) or the figure's own `#1a1420`. Decide one before drawing so held items, characters and the world agree.

## Questions I cannot answer from here

- How the **creation screen** will pick shape and colour separately (pinned in `12-figure`), and therefore whether painted layers will carry a tone ramp.
- How many **distinct sheets** the atlas can hold (`19`, `23`): every distinct outfit is a sheet, and drawn garments multiply them. The brief already says to pick from the new garments with restraint until the atlas is paged.
- Whether Michael will paint any of the character layers himself again (he painted hair; the editors are built for it). If so, my job is the body and the prefabs, and his layers sit on top.
