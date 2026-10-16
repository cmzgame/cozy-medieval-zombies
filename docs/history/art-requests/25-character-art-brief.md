> **A record, moved whole by the sweep, 2026-10-16.** The brief that asked Claude Design for the characters redone (2026-10-12): the contract, ten deliverables with three options each, the palettes, the questions answered, and its status as of 2026-10-13 (sent, delivered, partly in the game; the body stays the rig's; facial hair post 1.0). It came from `docs/25-character-art-brief.md`, unchanged below this banner, and nothing stays at that path; the live text is `docs/28-painting-for-the-slicer.md`, the one artist-facing page, which carries the contract (the frame, the feet anchor, the facings and mirrors, the eyes, the elbow, the colours, the outline by kind); what the garments still owe is `docs/26-art-owed.md`.

# 25 — Art brief for Claude Design: the characters redone

**Status, 2026-10-13: sent, delivered, and partly in the game; the brief below is kept as it was sent.** The body is not drawn art: Michael ruled on 2026-10-12 that the body is the rig's (`02`, "The body stays the rig's"), the design agent's body rounds were dropped from the delivery on 2026-10-13, and what deliverable 1 left is the approved skin ramp (`data/art/character/character_body.json`, copied into `data/looks.json`); the bigger eyes were withdrawn, as the text says. The engine pieces the brief waits on are built (`23` step 3a): the slicer (`tools/slice.html`; the painting rules are `28`), the `beard` and `waist` slots, the covers rules, and hair dyeing. The agent's first round of parts, painted on the rig through the slicer, is in `data/art/character/layers/` (36 layers, `README_layers.md`): **the six hairs are installed** in `data/hair` and chosen on the character screen (`ui/screens.js`); **facial hair is post 1.0** (deliverable 3, struck); **owed:** the garments, the onion hats, the straw hat, the coif, and the knight as items (each an item naming its painted layer and colours, the dress with `covers: ["legs"]`; `02`, 2026-10-13), the bags (there is no `back` slot for painted layers, the README's note 3), the wound layer, and each garment's bag icon and portrait (`26`).

## What this is for

The characters are drawn by a generator today (`12-figure.md`): a rig of joints, a body of outlined capsules, garments as colour rules on the body's parts, and the few painted layers Michael made in the editor. It proved the look. This brief replaces the generated body and garments with drawn ones, keeping the rig, so every character in the game (the player, the dead, the villagers) is redrawn at once and every outfit still bakes from the same parts.

Michael's intent, in his words where they matter: the body is **agender in body and in desire, and gender-tunable in any way a player wants** ("dress and beard, whatever, who cares"); **the general outline stays the same**: oversized heads, little goober bodies, **walks that express the shoulders so armour can go on them**, **legs that are fairly quiet and stay under longer tops**; more distinct shoes would be welcome; **eight directions**; and the world leans into the **onion hat**.

## The contract: what the engine fixes, and what it does for the artist

- **Frame:** 48 by 72 world pixels, feet anchor at (24, 66). The body today is about 26 wide and 55 tall with hair; the head is about two fifths of the height and the shoulders are no wider than the head. Room above the head is for a raised weapon or a hat's nub; nothing is drawn below the feet line.
- **Eight facings:** `s, sw, w, nw, n, ne, e, se`. The game draws all eight. **An artist may deliver five (`s, sw, w, nw, n`) and the game mirrors the other three**, except for anything asymmetric (a pouch on one hip, a satchel strap, a side-swept fringe), which needs all eight or it will flip sides.
- **The rig animates; the artist does not draw animation.** This is the answer to "do you do animations or does design": the game does. A drawn part is painted **in the rest pose, once per facing**, relative to that part's anchor, and the rig carries its pixels through every animation: translated, turned, and scaled with the part's segment (`figure.js`, `stamp`). The walk, the swings, the bow draw, the throw, the fall, the shamble, and whatever poses come later are keyframes on the rig, and a drawn tunic or boot follows them for free. **What this costs the art:** a garment is stiff. A sleeve turns with the arm and a boot with the leg, but nothing flaps or sways on its own (a cloak, a loose skirt). Anything that must change shape frame by frame is not in this brief; it would be a different pipeline (per-frame sheets) and it multiplies every outfit by every animation, which is why the rig exists.
- **The parts, and their anchors** (each is a segment from `a` to `b` in the rest pose; the artist's pixels are relative to `a`): head (neck to crown), torso (hips to shoulders), left arm and right arm (shoulder to hand, one segment each: the arms are one outlined shape with no drawn elbow; **since 2026-10-15 the game bends an arm at its elbow, the middle of the segment (the template's blue mark), carrying the half nearer the shoulder with the upper arm and the rest with the forearm, so an arm is still painted straight, once, in the rest pose**), left leg and right leg (hip to foot), and the feet as part of the legs. A garment paints onto the parts it covers (a tunic: torso and the upper arms; boots: the lower legs and feet). **The game ships a template** (built 2026-10-12): open `http://localhost:8010/tools/template.html` and press **Download all five**. It writes `character_template_body_4x.png` (the bare rest-pose body, transparent), `character_template_guides_4x.png` (a 1x pixel grid with every eighth line stronger, the 48 x 72 frame, each part's **anchor as a red cross and its segment as a line**, the feet anchor in yellow, and the facing's name), `character_template_parts_4x.png` (a tint of which pixels belong to the torso, legs, arms, and head), `character_template_4x.png` (the body and the guides together, to draw over), and `character_template.json` (every anchor, segment, and joint in 1x frame pixels, and the layout). **The layout:** each cell is one facing, 192 x 288 px (48 x 72 at 4x); four cells across and two down, 768 x 576 in all; top row `s, sw, w, nw`, bottom row `n, ne, e, se`. The body is the generator's placeholder with the undergarment drawn in the skin colour, so none shows (Q1). A finished PNG goes back through **the slicer, which is not built yet** (`23`, pillar 3) and reads each part's pixels relative to its anchor.
- **Colour is data, not art.** Every garment, hair, and skin is drawn in **two tones plus the dark outline** (`#2b2522` or the figure's own `#1a1420`): a base and a shadow. The game **dyes** by replacing the tones (`19-characters.md`, the dyed entry), so **one drawing in a canonical colour gives every colour in the palette**. The artist draws shapes, never colourways. The three palettes are below.
- **Outline rules** (the look, `12`): one dark outline per body part, never per garment ("no Michelin rolls"); garments are colour changes on the outlined part, with their own outline only where they stand off the body (a hat's brim, a pauldron, a pouch). The face is never shaded; the head is a rounded square, narrower than tall; **the eyes are the generated ones, whites 3 x 5 with a 2 x 3 dyeable pupil (Michael, 2026-10-12, see "Eyes" under deliverable 1)**; **no mouth and no nose, ever: the face is the eyes alone**, and a beard or moustache sits on the face without a mouth line.
- **The dead** use the same body and the same garments: the zombie is a skin tone from the dead's ramp, a wound layer, and a drab dye. Nothing in this brief is drawn twice for them.

## Deliverables, in priority order, three options each

### 1. The body (first, before anything else)

**One body.** Agender: no hint of sex in the shape; **no undergarment** (Q1: the goobers are asexual, the body is drawn bare); gender is said by hair, facial hair, and dress. What the brief asks for in it, beyond the look above: **shoulders that read** (a visible shoulder line and a little mass there, so a pauldron or a mail shirt has a place to sit and the walk's arm swing shows at the shoulder); **legs that are quiet** (short, close together, a one-pixel gap, nothing that fights a long tunic or a dress); **distinct feet** (a real foot shape with a sole line, so shoes and boots read as shoes and boots); hands as mitts, no fingers. Delivered as parts per facing on the template, in the rest pose, in the canonical skin tones.

**Skin: a ramp, not options.** Eight tones for the living, from pale to deep brown, each a base and a shadow, chosen so that outline and eyes read on all of them; the artist proposes the eight, Michael approves. The dead get three more (grey-green, grey, bruised blue), the same way. A character's skin is one choice from the ramp.

**Eyes: withdrawn the same day.** Michael, on seeing the body round 1 (2026-10-12): the bigger eyes were an overcorrection; **the generated eyes stay as they are (whites 3 x 5, a 2 x 3 pupil low and inside), with the pupil a dye region so eye colour is a choice.** The earlier ruling is kept below for the record. *Earlier:* **Eyes: bigger, and the colour has room to show (Michael, 2026-10-12, ruled).** The face is two big eyes and nothing else (no mouth, no nose), so the eyes carry all of the character, and hair and facial hair are tacked onto it. The generated eyes today are **whites 3 wide by 5 tall with a 2 by 3 coloured pupil** low on the inner side (`figure.js`, the face block). The ruling: **grow each eye by 1 px at the top and 1 px at the outer side, so whites 4 wide by 6 tall; and give the coloured pupil at least 1 px more at the top, so at least 2 by 4**, because the eye colour is a player's choice and a bigger coloured area is what shows it. Read it as a Disney eye: large, round-ish, the pupil filling most of the lower part of the white, a 1 px catch-light welcome if it survives the dye. Checks for the artist: the eyes must still fit the head (the head is about 17 wide by 19 tall; with the inner columns kept where they are the outer edge moves one pixel toward the ear, leaving about 3 px of face either side), the top of the eye must stay clear of the hair fringe so the forehead still shows, and the eye is a face detail on the head part, drawn on all three front-facing views (`s, sw, se`), one eye in profile (`w, e`) and none from behind (`n, nw, ne`). The eye whites and the pupil stay two separate dyeable regions; the face is never shaded.

**Two things for the artist to offer three of:** eyes (three big-eye variants within the ruling above: a round pair, a slightly tall pair, a wide-set pair; any colour, since the eye is dyed), and the wound layer for the dead (a gash across the face, a torn-open torso, a missing hand).

### 2. Hair

Six shapes, one head, any colour. **Three traditionally male:** a short crop; a side part swept back; a long tail tied low (the hair is a helmet worn over the head, outlined on its own, fringe high so the forehead shows; `12`). **Three traditionally female:** long and loose to the shoulders; two plaits (asymmetric only if the plaits differ, otherwise mirrorable); a low bun or a bob. The existing generated `short`, `long`, `bald` and Michael's painted `purple` stay in the game until these land. **Bald** is the body with no hair layer and needs nothing.

### 3. Facial hair (a new slot)

**Post 1.0 (Michael's ruling, 2026-10-13): facial hair is not in the game until after 1.0, and may never work with the way the characters are drawn, which is fine. The three beards delivered stay in `data/art/character/layers` and are not installed.** The section below is kept for the record.

Three shapes, any colour (the hair palette), all ruled by Michael: **a moustache**, and it should read as a cop moustache or a porn moustache (a thick, full handlebar-less bar across the upper lip, drooping a little at the corners, unmistakable at this size); **a big bushy beard** in the manner of the vanilla WoW gnome in his reference (wide, full, rounded, reaching the chest, bigger than the chin, the moustache part of it); and **a tight, short, cropped professional beard**: close to the jaw, with enough texture in its outline that it reads as hair and not as a painted chin, but close enough that you could go to work in it. **No stubble**, now or as a fourth. Facial hair is a layer on the head, drawn below the eye line, over the top of the torso where the beard falls past the chin. **Q2 decides what a hat that covers the face does to it.**

### 4. Head slot: the onion hat, and the world it implies

Michael's favourite is the hood as it is drawn today: the green onion hat that covers the whole head but a slit for the eyes, with a nub on top (Kenny from South Park). He wants to lean into that vibe: **"what would a world look like where one of the more popular peasant looks is the onion hat?"** So:

- **Option 1, the onion hat, redrawn as the hero head item**, with the eye slit, the nub, and a soft bulge; and **two variants for the artist to propose from** (a taller nub that flops over, a short squat one, a one with the slit a little wider), since a popular look comes in versions.
- **Option 2, a straw hat** (a wide brim; the first thing a farmer wears; it does not cover the face, so hair shows under it).
- **Option 3, a coif** (ruled): a close cloth cap tied under the chin; the under-helmet look that is also just a peasant's cap. It replaces the existing generated `cap`.
- **For the world:** the villagers' wardrobes (`data/wardrobes.json`) should put the onion hat on about a third of them in greens and browns once it lands; the dead's on fewer, torn. That is data, not art.
- A **kettle helm** is the first armour head and belongs to the armour brief, not here.

### 5. Chest

- **Option 1, the tunic** (keep; redraw): the default, a belted-length shirt, with a **long** variant to the mid-thigh (the painted layer's `length: "long"` flag exists; `12`).
- **Option 2, a jerkin or vest over a shirt** (the gnome's leather vest with its buckles: a layered look in two tones, so the dye gives a leather vest over a cloth shirt).
- **Option 3, a dress or gown**: long, to the shins, covering the legs (the legs stay quiet under it, by design); the gender-tuning piece, in any colour. **Ruled: a dress hides the leg garment and shows the shoes**, since shoes are being made more prominent; the engine treats the chest layer as covering the leg parts but not the feet (small, in the garment rules).
- **Later, not here:** a robe for the fire mage (`24`), a cloak (it would need to sway: not in this pipeline).

### 6. Legs

- **Option 1, breeches** (keep; redraw): to the shin, loose.
- **Option 2, hose**: close-fitting to the ankle, a thin shape that stays quiet under a long tunic.
- **Option 3, patched trousers**: baggy, with a visible patch or two (the patches are the shadow tone, so they dye with the cloth).

### 7. Feet (more distinct shoes)

- **Option 1, boots** (keep; redraw taller, with a cuff line, so they read as boots).
- **Option 2, turnshoes**: low, soft, a strap or a seam line; the everyday shoe.
- **Option 3, wraps or sandals**: cloth wrapped to the ankle, or bare feet with a sole line (the poor, and the dead).

### 8. Hands

- **Option 1, gloves** (keep; redraw): the default is **no gloves**.
- **Option 2, gauntlets**: the first armour hand, a cuff that stands off the wrist.
- **Option 3, wraps**: cloth around the palm and wrist.

### 9. Waist (the belt)

Today the belt is a worn item whose art is a rule in the torso's drawing (a band at the waist), not a layer; this brief makes the waist a drawn slot like the others.

- **Option 1, a plain belt** (keep; the default): a band with a buckle.
- **Option 2, a belt with a pouch** (asymmetric: all eight facings).
- **Option 3, a sash or a rope**: a tied cord, the shape for the dress and the robe.

### 10. Back

- **Option 1, the small sack** (keep; redraw): the starter bag.
- **Option 2, the rucksack** (keep; redraw): the big one.
- **Option 3, a satchel on a strap** (asymmetric) or a quiver (for the bow, `20`).

## Colours (data: the artist draws one colourway)

- **Skin:** the ramp of eight for the living and three for the dead, from the body deliverable. A character picks one.
- **Hair:** about twelve: black, dark brown, brown, chestnut, auburn, red, blond, pale blond, grey, white, **and the fantasy ones: pink, purple, green** (the gnome's pink beard is the reference; Michael's painted hair is purple).
- **Cloth:** about sixteen dyes: the village's warm six (ochre, rust, moss, slate, linen, plum, `wardrobes.json`), the dead's drab six, and four more (a red, a blue, a black, an undyed cream).
- **Who gets what:** hair and facial hair draw from the hair palette **and** the cloth palette (Michael: "both get access to all"); clothes likewise from both; **skin only from the skin ramp**. Eyes any colour. Each is a separate choice from the shape (the pinned creation-screen rule, `12`).

## Defaults

The starter look stays what Michael likes: **tunic, belt, breeches, boots; no gloves, no hat**; short hair; one skin tone from the ramp. Facial hair none. The creation screen (`12`, pinned) is where a player changes any of it; until then, the console and the wardrobes.

## Delivery format

- One PNG per item (one garment, one hair, one beard, one hat) **drawn over the template**, at 1x, hard pixels, transparent background, the canonical two tones plus outline, all eight facings on the template's rows (or the five, if nothing in it is asymmetric). One PNG for the body in the same way.
- A short README per delivery listing which parts each item paints, whether it is symmetric, and anything the slicer must know (a hat that hides hair; a dress that hides the legs' garment; a beard that must sit on the face with no mouth line).
- The game-side work to receive it (to build before the first delivery lands, `23` pillar 3): the template exporter, the slicer from PNG to layer files, a `waist` and a `beard` layer slot, the "covers" flags (a hat hides the hair on the top of the head; a dress hides the leg garment; never a beard or a thing under a hat, per Q2), and the `dye` plumbing extended to hair and facial hair (it exists for garments).

## The questions, answered (2026-10-12)

- **Q1. Undies: none** (Michael, 2026-10-12). The goobers are asexual, so there is nothing a decency garment is for; the body is drawn bare and a shift, if one is ever wanted, is a garment like any other. "The first time a human tells me this is weird we'll scope it out. I kinda like letting people confirm." The brief tells the artist: draw the body with no undergarment and nothing to hide.
- **Q2. Facial hair under the onion hat: it pokes out** below the hat's chin edge (Michael, 2026-10-12: the gnome in an onion hat). **And the general rule:** for any hat and any thing that would be very hard to make work under it, the hat does not hide it: the artist draws the hat to end where the thing begins (a beard below the chin edge, long hair out of the back of a cap) and the combination is allowed. The engine's "covers" flag is used only where a hat truly replaces a thing (a hat replaces the hair on the top of the head), never to dodge a hard combination.
- **Q3. One body** (ruled): every garment layer fits the one body; builds, if they ever matter, are done then.
- **Q4. The coif, and the facial hair set** (ruled): the coif is the third hat; the facial hair is the cop-or-porn moustache, the big gnome beard, and a tight cropped professional beard with texture in its outline; never stubble.
- **Q5. A dress hides the leg garment and shows the shoes** (ruled).
- **Q6. The template is the 4x one** (ruled): the rest-pose body at eight facings with each part's anchor and segment marked, for the artist to draw over, and the slicer reads it back.

## What the engine must do before the art can land (so it is not a surprise)

The slicer (the template exporter is built); the `beard` and `waist` layer slots; a hat's and a dress's "covers" rules; dyeing hair and facial hair; and the sheet budget (the atlas, `19`, `23`): every distinct outfit is a sheet, so the wardrobes should pick from the new garments with some restraint until the atlas is paged.
