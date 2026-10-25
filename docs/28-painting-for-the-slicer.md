# 28 — Painting for the slicer: the rules for the design agent

**Status, 2026-10-16: the one artist-facing page, written 2026-10-12 with the slicer (`tools/slice.html`, `23` step 3a), the night the body was ruled final (`02`, "We have a body"); the contract the characters brief fixed is folded in below, and the brief itself, with what it asked for and what came back, is `history/art-requests/25-character-art-brief.md`. Hand this page to the design agent whole: it says what the engine does with a painting, so the painting is made the way the engine can take it.**

## What the engine is, in four sentences

The character is not a set of sprites. It is a small **rig**: a body described in numbers, posed by joints, projected into eight facings, and rasterised at boot into every frame of every animation. What you paint are **parts** of a garment (or of hair, a hat, a beard, a belt), pinned to the rig's joints in the rest pose, and the rig carries your pixels through every walk, swing, and fall by turning and scaling them along the limb they belong to. You never draw a frame, a pose, or a second angle of the same part: one drawing per part per facing, in the rest pose, and the game animates it.

## The contract: what the engine fixes

What the characters brief (`25`, 2026-10-12) fixed, as it stands:

- **Frame:** 48 by 72 world pixels, feet anchor at (24, 66). The body is about 26 wide and 55 tall with hair; the head about two fifths of the height, the shoulders no wider than the head. Room above the head is for a raised weapon or a hat's nub; nothing is drawn below the feet line.
- **Eight facings:** `s, sw, w, nw, n, ne, e, se`, all drawn by the game. An artist may deliver five (`s, sw, w, nw, n`) and the game mirrors the other three, except for anything asymmetric (a pouch on one hip, a satchel strap, a side-swept fringe), which needs all eight or it will flip sides.
- **The rig animates; the artist does not draw animation.** A part is painted in the rest pose, once per facing, relative to its anchor, and the rig carries it through every animation, so a garment is stiff: nothing flaps or sways on its own. The parts: head (neck to crown), torso (hips to shoulders), left and right arm (shoulder to hand, one outlined shape with no drawn elbow; **since 2026-10-15 the game bends an arm at its elbow, the middle of the segment, the template's blue mark**, carrying the half nearer the shoulder with the upper arm and the rest with the forearm, so an arm is still painted straight, once), left and right leg (hip to foot) with the feet. The template is `tools/template.html`, "Download all five".
- **The body is the rig's, never drawn** (Michael, 2026-10-12; `02`, "The body stays the rig's"): the skin is a ramp of eight tones for the living and three for the dead (`data/looks.json`), chosen, not painted; **the eyes are the generated ones, whites 3 by 5 with a 2 by 3 dyeable pupil; no mouth and no nose, ever: the face is the eyes alone**, and a beard sits on the face without a mouth line.
- **Colour is data, not art:** every garment and hair is drawn in two tones plus the outline, a base and a shadow, and the game dyes by replacing the tones (`19`, the dyed entry), so one drawing in a canonical colour gives every colour in the palette; the artist draws shapes, never colourways.
- **The outline colour is by kind:** a character part's outline, where it stands off the body, is the figure's own `#1a1420` (`src/figure/rig.js`); props and items carry `#2b2522` (`docs/art/01`, `sprite-definitions.md`). Both are right; a painted garment uses the first, and one dark outline per body part, never per garment ("no Michelin rolls").
- **The dead** use the same body and the same garments: a skin tone from the dead's ramp, a wound layer, and a drab dye; nothing is drawn twice for them.

## The template, and the file you deliver

1. **Paint over `character_template_body_4x.png`** (from `tools/template.html`, the five files Michael sends). It is the bare body at all eight facings, **4x**: eight cells, four across and two down, each 192 by 288, in the order **s, sw, w, nw** on the top row and **n, ne, e, se** below. The guides file shows every part's anchor (a red cross) and its segment; the parts-tint file shows which pixels belong to which part.
2. **Deliver a PNG of exactly 768 by 576**, the template's size, with a **transparent background**, containing **only the garment**, not the body under it. The body is the game's; a pixel of body in your file would be painted over the game's body as if it were clothing.
3. **One slot per file.** A tunic is one file; its belt is another (the `waist` slot); gloves another (`hands`). The slots: `body` (the skin itself, if the skin is ever repainted), `hair`, `head` (hats, hoods, helms), `beard` (the slot exists; facial hair is not in the game until after 1.0, `25`), `chest` (tunics, with sleeves), `waist` (belts), `legs`, `hands`, `feet`.
4. **Stay on the grid.** Every game pixel is a 4 by 4 block in the file. Paint whole blocks, aligned to the template's grid (the guides draw it), one flat colour per block, fully opaque. A block of mixed colours or a half-transparent block is read as its majority colour and counted as "ragged" in the slicer's report; a run of them means the painting slipped off the grid. **No anti-aliasing, no soft brushes, no gradients.**
5. **Name the file for the slot and the thing:** `chest_tunic_green.png`, `head_coif.png`, `beard_gnome.png`.

## Which part takes a pixel

The slicer gives every painted pixel to a part by where it lies:

- **On the body:** the part under it, as the parts-tint shows. A pixel on the torso goes to the torso; a pixel on the upper arm to that arm.
- **Off the body:** the nearest **free** part of the slot. Free parts are the ones that may change the silhouette: the arms (with their shoulders), the hands, the feet, the head. So a sleeve wider than the arm, a pauldron, a big boot, a hat above the head, a beard below the chin all work: paint them where they go and they follow their joint.
- **Substitution parts keep the body's shape.** The torso and the legs are substitution parts: a pixel painted beyond the torso's or a leg's silhouette is dropped, and the slicer counts it. A tunic cannot be wider than the torso; a skirt that flares past the hips is not possible yet (the covers rules, built 2026-10-12, hide the legs under a dress; they do not widen it). If you want a wider torso, that is a body number, not a painting; ask.
- A pixel on a part the slot does not own is dropped and counted: a chest file's pixels on the legs, a hands file's pixels on the torso.

## Facings and mirrors

- **Paint all eight cells.** The game shows every facing.
- **Mirrors are allowed and expected** where the garment is symmetrical: east is west mirrored, north-east is north-west mirrored, south-east is south-west mirrored. Asymmetrical things (a satchel strap, a scar) are drawn per facing. South and north are their own.
- The **far arm** in the three-quarter and side facings is mostly behind the body; paint its sleeve anyway, whole, as if the body were glass: the engine hides what the body covers and shows the hand and wrist that peek out.

## Colour

- **Two tones per garment** where you can: a light and a dark, with the light on the upper-left side of each shape, the game's light. The game's own garments are shaded that way by a rule; a painted garment keeps the colours you paint, exactly, so paint the shading in.
- **Outlines:** the body's outline is the game's. Do not outline your garment against the body (the game draws no outline between a sleeve and the skin either). Outline the garment's silhouette **only where it extends past the body** (a hat's brim, a pauldron, a boot's sole), one pixel of the game's outline colour, `#1a1420`.
- **Dyeing:** hair and beards may take the wearer's hair colour: paint them in **exactly two tones** (plus the outline colour where the silhouette needs it) and say so in the delivery; the slicer's dye option maps the lighter tone to the hair colour and the darker to its shade. A layer painted in five tones cannot be dyed and keeps its colours. A painted head item (the onion hat) is dyed the same way by its worn entry's dye, so a hat painted in two tones comes in every colour a wardrobe gives it; a hat of more tones keeps its paint, dyed or not (`02`, 2026-10-18). **Any painted garment, in any slot, is dyed by region** (the dye vat, `43` section 8): paint each colour region in **one fixed pair of key tones**, a light and a dark, plus the outline, and say in the delivery which pair is which region; the item's art lists them (`art.keys`, light then dark per region), and the game replaces each region's light key with the chosen colour and its dark key with that colour's shade. Every other tone is kept as painted (a buckle, a stitch), so a two-region jerkin is four key tones and whatever fixed detail you like. Art painted in fixed colours before this keeps its colours until it is repainted into key tones.
- No transparency inside a garment except where the skin is meant to show (a neckline, a sleeveless jerkin): the rig puts skin there by itself.

## Hats, hair, beards

- A **hat or helm** (`head`) replaces the hair: paint the whole top of the head as it should look with the hat on, hair included if any shows under it.
- **Hair** (`hair`) is painted over a bald head and is drawn last on the head, over the face; leave the face clear.
- A **beard** (`beard`) is drawn after the hair, so it is never covered; paint it on the chin and cheeks, over the skin, leaving the mouth area as you want it.

## What the slicer does with your file, and what to read in its report

Michael (or a session) opens `tools/slice.html`, drops the PNG, picks the slot and a name, and presses Slice. The page shows what it read (each pixel tinted by the part it was given) and the layer **worn by the figure**, idle at every facing and walking and swinging, before anything is saved. The report says how many pixels were read, how many went to each part, how many were ragged, and how many were dropped. A good delivery reads: no ragged blocks, nothing dropped, and the worn preview looking as you meant it in all eight facings. Then Save writes it into the game and it can be tried on from the Settings screen.

## What cannot be done yet, so it is not asked for

- Cloth that moves (a cloak, a skirt swinging): a part is stiff and follows its joint. (A dress is possible: a chest file marked "covers the legs" hides the leg garment and shows the shoes; its hem still ends at the torso's silhouette.)
- A garment that changes the body's silhouette on a substitution part (a fat tunic, a wide skirt).
- A different drawing for a pose (a sleeve that bunches in the swing): one drawing per part per facing.
- More than one slot in one file.
