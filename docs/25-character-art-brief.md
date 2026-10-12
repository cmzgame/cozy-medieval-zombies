# 25 — Art brief for Claude Design: the characters redone

**Status: a brief drafted from Michael's notes of 2026-10-12, with three options per category and his questions marked Q. Not sent, nothing commissioned, nothing built. The engine facts in "The contract" are true today; the option lists are proposals for Michael to strike or add to before this goes to the design agent.**

## What this is for

The characters are drawn by a generator today (`12-figure.md`): a rig of joints, a body of outlined capsules, garments as colour rules on the body's parts, and the few painted layers Michael made in the editor. It proved the look. This brief replaces the generated body and garments with drawn ones, keeping the rig, so every character in the game (the player, the dead, the villagers) is redrawn at once and every outfit still bakes from the same parts.

Michael's intent, in his words where they matter: the body is **agender in body and in desire, and gender-tunable in any way a player wants** ("dress and beard, whatever, who cares"); **the general outline stays the same**: oversized heads, little goober bodies, **walks that express the shoulders so armour can go on them**, **legs that are fairly quiet and stay under longer tops**; more distinct shoes would be welcome; **eight directions**; and the world leans into the **onion hat**.

## The contract: what the engine fixes, and what it does for the artist

- **Frame:** 48 by 72 world pixels, feet anchor at (24, 66). The body today is about 26 wide and 55 tall with hair; the head is about two fifths of the height and the shoulders are no wider than the head. Room above the head is for a raised weapon or a hat's nub; nothing is drawn below the feet line.
- **Eight facings:** `s, sw, w, nw, n, ne, e, se`. The game draws all eight. **An artist may deliver five (`s, sw, w, nw, n`) and the game mirrors the other three**, except for anything asymmetric (a pouch on one hip, a satchel strap, a side-swept fringe), which needs all eight or it will flip sides.
- **The rig animates; the artist does not draw animation.** This is the answer to "do you do animations or does design": the game does. A drawn part is painted **in the rest pose, once per facing**, relative to that part's anchor, and the rig carries its pixels through every animation: translated, turned, and scaled with the part's segment (`figure.js`, `stamp`). The walk, the swings, the bow draw, the throw, the fall, the shamble, and whatever poses come later are keyframes on the rig, and a drawn tunic or boot follows them for free. **What this costs the art:** a garment is stiff. A sleeve turns with the arm and a boot with the leg, but nothing flaps or sways on its own (a cloak, a loose skirt). Anything that must change shape frame by frame is not in this brief; it would be a different pipeline (per-frame sheets) and it multiplies every outfit by every animation, which is why the rig exists.
- **The parts, and their anchors** (each is a segment from `a` to `b` in the rest pose; the artist's pixels are relative to `a`): head (neck to crown), torso (hips to shoulders), left arm and right arm (shoulder to hand, one segment each: the arms are one outlined shape with no drawn elbow), left leg and right leg (hip to foot), and the feet as part of the legs. A garment paints onto the parts it covers (a tunic: torso and the upper arms; boots: the lower legs and feet). **The game will ship a template**: the rest-pose body at 8 facings at 4x, with each part's anchor and segment marked, as a PNG to draw over, plus the slicer that reads a finished PNG back into the game's layer files. (The slicer is part of the sprite work in `23`, pillar 3; it does not exist yet.)
- **Colour is data, not art.** Every garment, hair, and skin is drawn in **two tones plus the dark outline** (`#2b2522` or the figure's own `#1a1420`): a base and a shadow. The game **dyes** by replacing the tones (`19-characters.md`, the dyed entry), so **one drawing in a canonical colour gives every colour in the palette**. The artist draws shapes, never colourways. The three palettes are below.
- **Outline rules** (the look, `12`): one dark outline per body part, never per garment ("no Michelin rolls"); garments are colour changes on the outlined part, with their own outline only where they stand off the body (a hat's brim, a pauldron, a pouch). The face is never shaded; the head is a rounded square, narrower than tall; eyes two wide and three tall with the pupil low and inside; no mouth line unless a beard needs one to sit under.
- **The dead** use the same body and the same garments: the zombie is a skin tone from the dead's ramp, a wound layer, and a drab dye. Nothing in this brief is drawn twice for them.

## Deliverables, in priority order, three options each

### 1. The body (first, before anything else)

**One body.** Agender: no hint of sex in the shape; **no undergarment** (Q1: the goobers are asexual, the body is drawn bare); gender is said by hair, facial hair, and dress. What the brief asks for in it, beyond the look above: **shoulders that read** (a visible shoulder line and a little mass there, so a pauldron or a mail shirt has a place to sit and the walk's arm swing shows at the shoulder); **legs that are quiet** (short, close together, a one-pixel gap, nothing that fights a long tunic or a dress); **distinct feet** (a real foot shape with a sole line, so shoes and boots read as shoes and boots); hands as mitts, no fingers. Delivered as parts per facing on the template, in the rest pose, in the canonical skin tones.

**Skin: a ramp, not options.** Eight tones for the living, from pale to deep brown, each a base and a shadow, chosen so that outline and eyes read on all of them; the artist proposes the eight, Michael approves. The dead get three more (grey-green, grey, bruised blue), the same way. A character's skin is one choice from the ramp.

**Two things for the artist to offer three of:** eyes (a round pair, a narrow pair, a wide-and-low pair; any colour, since the eye is dyed), and the wound layer for the dead (a gash across the face, a torn-open torso, a missing hand).

### 2. Hair

Six shapes, one head, any colour. **Three traditionally male:** a short crop; a side part swept back; a long tail tied low (the hair is a helmet worn over the head, outlined on its own, fringe high so the forehead shows; `12`). **Three traditionally female:** long and loose to the shoulders; two plaits (asymmetric only if the plaits differ, otherwise mirrorable); a low bun or a bob. The existing generated `short`, `long`, `bald` and Michael's painted `purple` stay in the game until these land. **Bald** is the body with no hair layer and needs nothing.

### 3. Facial hair (a new slot)

Three shapes, any colour (the hair palette): **a moustache** (Michael's must), **a big bushy beard** in the manner of the vanilla WoW gnome in his reference (Michael's must: wide, full, rounded, reaching the chest, bigger than the chin), and a third: a goatee or a chin strip. Facial hair is a layer on the head, drawn below the eye line, over the top of the torso where the beard falls past the chin. **Q2 decides what a hat that covers the face does to it.**

### 4. Head slot: the onion hat, and the world it implies

Michael's favourite is the hood as it is drawn today: the green onion hat that covers the whole head but a slit for the eyes, with a nub on top (Kenny from South Park). He wants to lean into that vibe: **"what would a world look like where one of the more popular peasant looks is the onion hat?"** So:

- **Option 1, the onion hat, redrawn as the hero head item**, with the eye slit, the nub, and a soft bulge; and **two variants for the artist to propose from** (a taller nub that flops over, a short squat one, a one with the slit a little wider), since a popular look comes in versions.
- **Option 2, a straw hat** (a wide brim; the first thing a farmer wears; it does not cover the face, so hair shows under it).
- **Option 3, a coif or arming cap** (a close cloth cap tied under the chin; the under-helmet look that is also just a peasant's cap). The existing `cap` is in this family and can be the third if the artist prefers.
- **For the world:** the villagers' wardrobes (`data/wardrobes.json`) should put the onion hat on about a third of them in greens and browns once it lands; the dead's on fewer, torn. That is data, not art.
- A **kettle helm** is the first armour head and belongs to the armour brief, not here.

### 5. Chest

- **Option 1, the tunic** (keep; redraw): the default, a belted-length shirt, with a **long** variant to the mid-thigh (the painted layer's `length: "long"` flag exists; `12`).
- **Option 2, a jerkin or vest over a shirt** (the gnome's leather vest with its buckles: a layered look in two tones, so the dye gives a leather vest over a cloth shirt).
- **Option 3, a dress or gown**: long, to the shins, covering the legs (the legs stay quiet under it, by design); the gender-tuning piece, in any colour. The legs slot still draws under it (boots show), and it needs the engine to treat the chest layer as covering the leg parts (small, in the garment rules).
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
- A short README per delivery listing which parts each item paints, whether it is symmetric, and anything the slicer must know (a hat that hides hair; a dress that hides the legs' garment; a beard that needs the mouth line).
- The game-side work to receive it (to build before the first delivery lands, `23` pillar 3): the template exporter, the slicer from PNG to layer files, a `waist` and a `beard` layer slot, the "covers" flags (a hat hides the hair on the top of the head; a dress hides the leg garment; never a beard or a thing under a hat, per Q2), and the `dye` plumbing extended to hair and facial hair (it exists for garments).

## Questions for Michael

- **Q1. Undies: none** (Michael, 2026-10-12). The goobers are asexual, so there is nothing a decency garment is for; the body is drawn bare and a shift, if one is ever wanted, is a garment like any other. "The first time a human tells me this is weird we'll scope it out. I kinda like letting people confirm." The brief tells the artist: draw the body with no undergarment and nothing to hide.
- **Q2. Facial hair under the onion hat: it pokes out** below the hat's chin edge (Michael, 2026-10-12: the gnome in an onion hat). **And the general rule:** for any hat and any thing that would be very hard to make work under it, the hat does not hide it: the artist draws the hat to end where the thing begins (a beard below the chin edge, long hair out of the back of a cap) and the combination is allowed. The engine's "covers" flag is used only where a hat truly replaces a thing (a hat replaces the hair on the top of the head), never to dodge a hard combination.
- **Q3. One body, or builds?** The brief asks for one body because every garment layer must fit it; a second build (stout, slight) would double every garment. One body, with the head and shoulders doing the character, is the recommendation.
- **Q4. The third hat and the third facial hair:** the coif or the existing cap; the goatee or a chin strip.
- **Q5. Dresses and legs:** a dress hides the leg garment but not the boots (the recommendation), or hides both?
- **Q6. The template:** 4x with anchors marked as described, or does the design agent want the 1x body sheet and a written table of anchors instead?

## What the engine must do before the art can land (so it is not a surprise)

The template exporter and the slicer; the `beard` and `waist` layer slots; a hat's and a dress's "covers" rules; dyeing hair and facial hair; and the sheet budget (the atlas, `19`, `23`): every distinct outfit is a sheet, so the wardrobes should pick from the new garments with some restraint until the atlas is paged.
