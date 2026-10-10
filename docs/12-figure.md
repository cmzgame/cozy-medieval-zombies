# Milestone 6: the figure

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

The body is the figure in undies: skin, hair, eyes, a plain undergarment. Garments are **rules on the body's parts**, applied while the figure is drawn, so a whole outfit bakes into one sheet. The first draft of this doc had each garment as its own sheet stacked at draw time; building it showed why not: a near arm must draw in front of the tunic's torso and a far arm behind it, which a stack of whole-figure sheets cannot do. Baking per outfit keeps the rig's depth order exact. The player's sheet is rebuilt in about thirty milliseconds whenever their look or clothes change and redrawn into the atlas in place; the dead have ten outfits baked at boot. Held items stay separate overlays at the hand joints. Real art arrives the same way: a body and garment drawn to the rig's grid, composited by the same code.

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

Parameters on the body, all of them palette or shape choices in the generator: skin tone, hair shape (short, long, bald), hair colour, eye colour. Stored on the player as `look`, settable from the console with `__game.setLook({ skin, hair, hairStyle, eyes })`. The **creation screen** is the first item after this milestone.

## Painted hair, and the editor

Hair is the first layer Michael paints himself (2026-10-10). `tools/hair.html`, served by `serve.py` like the game, shows the bald figure in all eight facings at eight times size with a 32 by 32 grid over the head, and paints a hair layer on it: pencil with the browser's colour picker, eraser, dropper, start from the generated short or long cap, mirror left to right, save and load. A style saves as `data/hair/<name>.json`, pixels per facing relative to the head's centre, and is listed in `data/hair/index.json`; the game registers it at boot and a look's `hairStyle` may name it. Painted hair is drawn last on the head, over the face, with its own colours as painted. The same editor can grow to beards, hats, and the rest of the head later.

## The dead

The same rig and the same garments. A zombie is a body with a decay tint, a wound accent, the shamble keyframes, and a random outfit from a list of garment shapes and drab colours, some torn (a torn flag on the garment rule drops a sleeve or ragged hem). Variety comes from the outfit list and the palette, not from new drawings. The dead that fall stay as the die animation's last frame, as now.

## Data

- `data/sprites/player.json` and `zombie.json` describe the body: proportions preset (`chunky`), default palette, animation list.
- Garments live on items: `art: { shape, colours, torn? }`. Held art likewise: `held: { shape, colours }`.
- The sheet gains `joints`: per frame, each hand's pixel position, forearm direction, and whether it is in front of the body, and the head's position. The renderer uses them for held items and the carried box; nothing else needs them. The draw order is internal to the generator.

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
