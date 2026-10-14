# Milestone 6: the figure

**Status, 2026-10-13: built.** The code is the truth; since this was written: `figure.js` is a hub over `figure/` (`rig.js` the body's numbers and the poses, `draw.js` the garments and the sheets, `held.js`, `raster.js`, `wardrobe.js` with `characterInputs` and `characterSpec`), so a thing named below as in `figure.js` is in one of those. The slicer (`tools/slice.html`, `docs/28`), the `beard` and `waist` slots, the covers rules, and hair dyeing (a layer's `options.dye`, coloured from the look) are built (`check("layers")`), so the first update's "still to build" is history. The walk and the one-handed swing are data in `data/poses.json` (`32`; the swing re-ruled on 2026-10-13 as a high-to-fall slash with a `wrist` per frame). The creation screen is the character screen and the identity (`docs/31/09`); the hair style is picked there now. The design agent's character delivery is in `data/art/character/`, its six hairs installed in `data/hair`; its garments are not items yet and `data/layers/*` hold none.

**Update, 2026-10-12 night (`25`, `26`):** the characters are to be redrawn by Claude Design from `25-character-art-brief.md`: the body first (agender, no undergarment, a skin ramp), hair, facial hair (a new slot), the onion hat, and three options for every slot, as **parts painted once per facing in the rest pose** and carried through every animation by the rig (so the artist delivers parts, not frames, and garments are stiff). The 4x **template exporter** is `tools/template.html` (five downloads); the **slicer** that reads finished PNGs back into layer files, the `beard` and `waist` slots, the covers rules, and hair dyeing are still to build (`23`, pillar 3). Held items drawn as pictures (a grip pixel, three modes) and bag icons exist (`26`).

**Update, 2026-10-12 (the spear, `20`):** a `throw` pose style (`data/poses.json`, mirrored in `DEFAULT_POSES`): the arm goes back and up in an arch over three frames, then forward at release (`activeFrame` 3); a `spear` held shape (a pole and a stone tip) joins the held shapes.

**Update, 2026-10-12 (the atlas, `20`):** only the player's sheet has the carry frames (`carry_idle`, `carry_walk`); the dead's and villagers' sheets leave them off (`spec.noCarry`), so they are 768 px wide instead of 1056 and five fit across the atlas where three did. A `bow` pose style (`data/poses.json`) is the draw: attack frames held by hand, and a style that sets its own off arm (`offPitch`) now wins over the both-hands holding pose.

**Update, 2026-10-12 (`19-characters.md`):** every figure is now drawn from `characterSpec(characterInputs(character))`, so what a character wears decides how it looks. The dead's ten outfits are data (`data/wardrobes.json`, written from the old generator's rules and verified pixel for pixel), a worn entry may carry a **dye** (`colour` for its first tone, `colours` for all), and characters in the same clothes share one baked sheet (`assets.sheetFor`), because a figure's sheet is about 1056 × 576 px and the atlas is shared. A body is one frame on its own sheet (`generateFigure(spec, { anim, frame, facing })`). Villagers dress from the `village` wardrobes. `playerSpec` and `zombieSpec(k)` remain as wrappers for the editors.

The player and the dead drawn as a paper doll on a small rig: a naked body in undies, clothes as layers that match it exactly, items held at the hands, eight facings drawn, and a chunky big-headed proportion taken from Michael's reference art. All of it generated at boot through the sprite pipeline, so real art can replace a layer at a time later. Designed 2026-10-10 from the conversation in `02-decisions.md` under that date; what the parent drew is in `01-parents.md`.

The pair of rulings this grows from: everything the character wears is a slot (`11-character.md`), and dev art goes as far as it can before anyone is paid (`00-vision.md`, Laws: build it the way it is truly wanted, then measure).

## The look

From the two reference figures Michael shared (a knight with a red scarf, a zombie in a brown shirt; both drawn by an image model as ideation, neither to be copied):

- **The head is about a third of the height.** Shoulders are no wider than the head. The body is a block; the figure is chunky, not lanky.
- **Limbs fuse to the body.** Arms hang against the torso and are separated from it only by the outline. Legs are two blocks with a one-pixel gap. No armpit gaps, no drawn elbows.
- **One-pixel dark outline per body part**, never per garment (Michael's first art critique, 2026-10-10: outlining every sleeve, forearm, and hand made Michelin rolls). An arm is one outlined shape and its sleeve is a colour change on it; a leg likewise with its boot; the torso one shape with the tunic and belt as colour. Shading is Habbo's: each part flat on the lit side and one tone darker on its right-hand share, light from the upper left. No edge rims. Dither never.
- **Second critique, same day:** the head narrower than it is tall; the face never shaded; eyes two wide and three tall with the pupil low and inside; no mouth for now; the hair cap curved, high at the centre so the forehead shows, thin at the sides to the ears, its mass toward the back so it turns with the face; the tunic hangs below the hips and the legs always draw under it, so the walk is legs moving beneath a shirt. Facial hair is a customisation layer for later: over the face, under the hair where they meet.
- **The head is a rounded square, not an egg. Hair is a helmet worn over it**, outlined on its own, with a straight fringe so the forehead shows, short at the sides and down the back; a hat replaces the hair entirely. The face is drawn front-on toward the viewer: two eyes with whites and pupils and a small grim mouth from the three facings toward the camera, one eye from the side, none from behind (Stardew and Habbo both cheat the face toward the camera).
- **Accents tell the story.** A scarf, a buckle, a wound, a visor of three slits. Faces are two to four pixels: eyes and a mouth line, and they read.
- **Dev art is simpler than the references** and that is fine. The generator aims for their proportions and their rules, not their detail.

## The frame

- Frames stay **48 by 72 world pixels** with the feet anchor at (24, 66), as now. The body uses about 28 wide and 44 tall of that; the rest is room for a raised weapon, a hood's point, a bag's bulk, and a carried box over the head.
- **Eight facings, all drawn** (`s, sw, w, nw, n, ne, e, se`), no mirroring. For a generator it is free, and it keeps the main hand on the correct side. The sheet format keeps its `mirror` table so an artist may still deliver five and mirror three.
- **Animations**, frame counts as today with two added:

| Animation | Frames | Notes |
|---|---|---|
| idle | 2 | breath bob |
| walk | 4 | legs alternate, arms swing opposite |
| attack | 4 | arm raises, swings, follows through; `activeFrame` 1 is where the hit lands |
| hurt | 2 | white flash, lean back |
| die | 4 | fold and fall, ends on the ground |
| carry_idle | 2 | both arms up, hands above the head (furniture) |
| carry_walk | 4 | the same with the walk legs |

The zombie uses the same names with its own keyframes: a forward lean, arms out, a drag in the walk.

## The rig

A figure is drawn from a **joint table**, not from fixed rectangles. Per facing, per animation, per frame: the positions of head centre, neck, shoulders, hands, hips, knees, feet, in frame pixels relative to the feet anchor. Keyframes are authored once per animation as deltas from the facing's rest pose, so a walk written once applies to all eight facings with the facing's own depth ordering.

The body is drawn from the table in parts, each a filled shape with its outline: far leg, far arm, torso, near leg, near arm, head. Which arm and leg are "far" depends on the facing; that order is the first half of the order table below.

Why a rig: the walk gets a real swing, the attack becomes arm keyframes and the weapon follows, carrying is an arm pose, and every garment and every held item reads its position from the same table, so nothing can drift out of register.

## The paper doll

The body is the figure in undies: skin, hair, eyes, a plain undergarment (the generated figure still draws its `under` colour, `src/figure.js`; the redone characters have no undergarment, `02` 2026-10-12 and `25`). Garments are **rules on the body's parts**, applied while the figure is drawn, so a whole outfit bakes into one sheet. The first draft of this doc had each garment as its own sheet stacked at draw time; building it showed why not: a near arm must draw in front of the tunic's torso and a far arm behind it, which a stack of whole-figure sheets cannot do. Baking per outfit keeps the rig's depth order exact. The player's sheet is rebuilt in about thirty milliseconds whenever their look or clothes change and redrawn into the atlas in place; the dead have ten outfits baked at boot. Held items stay separate overlays at the hand joints. Real art arrives the same way: a body and garment drawn to the rig's grid, composited by the same code.

**Garment rules** are what a slot does to the figure's parts:

| Slot | Covers | Adds |
|---|---|---|
| feet | shins (lower part), feet | a cuff line |
| legs | thighs, shins | a hem |
| chest | torso, upper arms (sleeves) | a collar, a hem; a scarf accent if the item says so |
| hands | hands | nothing |
| head | hair and the top of the head | a shape: hood point, cap, helm with visor slits |
| waist | a strip at the hips | a buckle pixel |
| back | nothing | a box or sack on the back, behind the body when facing south, in front when facing north |

A garment definition in `data/items.json` is `art: { shape, colours }`: the shape names a rule (tunic, breeches, boots, gloves, hood, cap, helm, belt, sack, rucksack), the colours give its tones. Two tunics differ by colour alone; a tabard is a tunic shape with a second colour over the torso.

**The order table** says, per facing, in what order the body parts and the slots are drawn. Most of it is fixed (feet under legs under chest); the parts that flip with facing are the far and near limbs, the back slot, and a held item in the far hand. It is one small table in the generator and the renderer reads it from the sheet.

## Held items

A hand that holds something raises its arm forward and keeps it there through the walk (Michael, after first play: the torch read as strapped to the arm with the flame at the shoulder). The held item tilts forward from the hand, about a third off vertical toward the facing, with a small outward lean on the hand's own side so it clears the body from the front; in the attack the main hand's item points along the forearm. Held art is drawn in sixteen angles. Each hand joint has a position and an angle per facing and frame. A holdable item draws its **held art** at the hand: a torch is a stick with a flame, a hatchet a stick with a head, a plank a long board, a log a short fat one. Two-handed items draw between both hands. Attack keyframes move the hand, and the item moves with it; the flame's light point moves with the torch, replacing today's fixed per-facing hand point in the renderer.

Held art is generated per facing like everything else (a hatchet from behind shows its back). An artist later supplies per-facing held sprites or a single sprite the generator rotates in whole 45-degree steps; both go through the same anchor.

Furniture carried over the head keeps its own drawing (`02-decisions.md`, carrying), placed from the carry pose's hand points.

## Customisation

Parameters on the body, all of them palette or shape choices in the generator: skin tone, hair shape (short, long, bald), hair colour, eye colour. Stored on the player as `look`, settable from the console with `__game.setLook({ skin, hair, hairStyle, eyes })`. The **creation screen** is the first item after this milestone. *(Built 2026-10-13 as the character screen, `ui/screens.js`: the name, the approved skin ramp with the dead's three tones, bald first in the hair row, the hair and eye colours from `data/looks.json`, the figure turning beside the rows; it is also the identity a join sends, `docs/31/03`; `02`.)*

## Painted hair, and the editor

Hair is the first layer Michael paints himself (2026-10-10). `tools/hair.html`, served by `serve.py` like the game, shows the bald figure in all eight facings at eight times size with a 32 by 32 grid over the head, and paints a hair layer on it: pencil with the browser's colour picker, eraser, dropper, start from the generated short or long cap, mirror left to right, save and load. A style saves straight into the game: the dev server takes a POST at `data/hair/<name>.json`, writes it, and lists it in `data/hair/index.json`; the game registers styles at boot, and the settings screen's Hair row lists them with a Reload that picks up what was just saved, so paint, save, reload, and pick is the loop. A fill tool floods a run of one colour. Painted hair is drawn last on the head, over the face, with its own colours as painted. The same editor can grow to beards, hats, and the rest of the head later.

## Goobers

The body is one body, neutral in every way; undies are optional and so is any hint of sex. Dress, hair, and facial hair say what the player wants said, and the game's text uses they and them for every figure, the dead included (Michael, 2026-10-10: "they're not humans, they are little goobers").

## The layer editor

Built 2026-10-10 as `tools/layers.html`, the hair editor grown to every slot. One item per file. Pick the figure (player or zombie; a layer remembers which body it was painted on and the game carries its pixels from that body's rest pose), the slot, and a part, or leave auto and the part under the cursor is used, the nearest free part off the body. Substitution parts (torso, legs, the whole body) take pixels only where the generated part is; free parts (arms with shoulders, hands, feet, head) take anything and follow their joint, arms turning with the arm. Start from the generated garment, mirror left to right, fill, dropper, preview the layer baked into idle, walk, and attack frames, save to the game. Chest layers carry the length and hide-belt options. A layer marked "worn by the dead" joins the pool the ten zombie outfits draw from, slot by slot. Files live in `data/layers/<slot>/` with an index each (hair stays in `data/hair/`); the settings screen has a row per slot to try a layer on over whatever is worn, and `art.painted` on an item binds one for good.

## The body's rules, 2026-10-12

Michael's attempt to have the body redrawn ended with the rig kept (`02`, the same day). The numbers changed: the hip at 17 (was 15), so the legs are two pixels longer and the torso two shorter; `torsoD` 3 (was 4), so the torso is as thick as the arm and no neck block shows wider than it from the side; `hipD` 3.4 (was 3), so the legs' tops never jut past the hips. The rules: **what is left of a far arm shows only if some row of it is wider than two pixels** (`cullPart`, `FAR_ARM_SLIVER`), judged for the shoulder's half and the hand's apart, so no sliver, strip, or shoulder flare ever shows along the torso while a hand at the hip or a short back-swung arm, three or more wide, stays whole; **a raised arm, holding or swinging, is never judged** (`RAISED_ARM`, 40 degrees of pitch); and **an arm's outline never doubles another part's in a row** (`mergeOutlines`): where two outlines touch with no fill between, the nearer part's stays and the other becomes what lies beyond it. Outline pixels carry their part for this. The rules run after every part is drawn and before the shading, every frame of every facing, so a painted layer gets them for free.

## The next editors, as ruled

Michael (2026-10-10), after painting his first hair: the still parts are pixel substitutions, the arms are not. **Arms with shoulders, gloves, feet, and the helm may be painted as irregular shapes per facing**, because pauldrons, big boots, and sleeves carry the character and the arms swing in the attack; he will do the pixel animation for the poses that need it. **Chest and legs are pixel substitution** on the standard torso and leg silhouette, the same body for everyone, as are the belt and the bag; the naked body is that silhouette with the undies. **A helm is a hair**: a layer over the head that replaces it. Confirmed by Michael in his own summary the same day. Two prefab options for chest items: **tunic length**, shirt or long (a long one over plate for a crusader's cross), and **hide the belt** while a chest item is being edited. Tunics default to shirt length. The boot has a seam where it meets the leg, since they are separate slots.

## The dead

The same rig and the same garments. A zombie is a body with a decay tint, a wound accent, the shamble keyframes, and a random outfit from a list of garment shapes and drab colours, some torn (a torn flag on the garment rule drops a sleeve or ragged hem). Variety comes from the outfit list and the palette, not from new drawings. The dead that fall stay as the die animation's last frame, as now.

## Data

- `data/sprites/player.json` and `zombie.json` describe the body: proportions preset (`chunky`), default palette, animation list.
- Garments live on items: `art: { shape, colours, torn? }`. Held art likewise: `held: { shape, colours }`.
- The sheet gains `joints`: per frame, each hand's pixel position, forearm direction, and whether it is in front of the body, and the head's position. The renderer uses them for held items and the carried box; nothing else needs them. The draw order is internal to the generator.

## Pinned: the creation screen, and colour apart from shape (Michael, 2026-10-12)

Not now, not to be lost. When the creation screen is scoped, **colour is a separate choice from shape for hair, facial hair, and eyes**, the way a dyed garment is a colour on a shape (`19-characters.md`, the dyed entry): a pigtail shape in ten colours, the same for any beard, and eyes with one shape and any colour. Today the generated hair takes `look.hair` and the generated eyes `look.eyes`, so those two already separate; **painted layers do not**: the layer editor (`tools/layers.html`) paints literal hex pixels, so a painted hair style bakes its own colours. Separating them means painted hair and facial hair are painted in a small **tone ramp** (shadow, base, highlight, perhaps an outline tone) that the bake recolours from the chosen colour, with the editor showing the ramp in a preview colour and the dropper and fill working in tones. The same ramp is how a painted garment would take a dye. Facial hair is a slot the rig does not have yet; it joins hair as a painted layer over the face. All of it is the creation screen's scope, with the look parameters (`skin, hair, hairStyle, eyes`) and whatever facial hair adds, on the settings screen's pattern (`02`, the pins of 2026-10-10).

## Not in this milestone

- Real art, and the commission. The spec sheet is the output of this milestone: facings, frame counts, anchors, joint names, garment shapes, order table, all frozen by play before anyone is asked to match them.
- Armour as protection, warmth, or encumbrance. Clothes still do nothing (`11-character.md`).
- Villagers' looks (`04-npcs.md`) beyond what falls out of the palette.

## Build order

1. The rig: joint tables for the eight facings and the animations, the body drawn from them in the chunky proportion, with outline and tones. The player and the dead look like the references' cousins before anything is worn.
2. The order table and layered drawing in the renderer: body plus worn slots as a stack.
3. Garment rules for the shapes we have items for: tunic, breeches, boots, gloves, hood, belt, sack, rucksack. The starter kit visible on the body; the character screen's doll changes the figure live.
4. Held art at the hand joints: torch, hatchet, plank, log. The torch's light point from the joint.
5. Carry poses; the furniture box from the carry hands.
6. Zombie outfits and decay.
7. Customisation parameters, and the creation screen if cheap.

## Accept when

1. The naked figure in undies stands in all eight facings with the head about a third of its height, outlined, two-toned, and walks with arms swinging; the main hand is on the correct side in every facing.
2. Wearing the tunic, breeches, boots, and hood changes the figure at once; taking them off bares it. Dragging on the character screen is reflected on the body.
3. The sack shows on the back: behind the body facing south, in front facing north.
4. A torch in either hand is drawn in that hand and its light comes from the flame in every facing. A hatchet swings with the attack animation and the hit lands on the active frame.
5. Carrying furniture shows the arms up and the box over the head.
6. Ten zombies in view wear ten different drab outfits from the same rig, and read as dead.
7. Nothing is drawn into the canvas by the DOM; the whole figure is sprite quads; frame rate unchanged with sixty dressed zombies.
8. A one-page spec can be written from the sheet data alone: facings, frames, anchors, joint names, order table, garment shapes.

## Tunables

Proportion preset numbers (head radius, shoulder width, leg length), outline colour, tone offsets, walk swing amplitude, attack reach, all in the generator and listed in `06-art.md` when they settle.
