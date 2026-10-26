# 12 — Milestone 6: the figure

**Status, 2026-10-18: built; a reference.** The code is the truth: `figure.js` is a hub over `figure/` (`rig.js` the body's numbers, the animations, and the poses; `draw.js` the garments and the sheets; `held.js`; `raster.js`; `wardrobe.js` with `characterInputs` and `characterSpec`). Every figure is drawn from `characterSpec(characterInputs(character))`, so what a character wears decides how it looks (`19`); characters in the same clothes share one baked sheet, baked the first time an outfit is seen (`assets.sheetFor`), and the player's rebuilds in about thirty milliseconds when their look or clothes change. The poses are data in `data/poses.json` (`32`): the walk, the one-handed swing (a high-to-fall slash with a `wrist` per frame, 2026-10-13), the throw, the bow's draw, the casts, the held-out `present`; the rig has elbows since 2026-10-15, never knees. The painted slots are hair, head, chest, legs, hands, feet, body, `beard`, and `waist`, written by the slicer (`tools/slice.html`, `28`) into `data/layers/<slot>/` and `data/hair/` (seven styles, dyed from the look); the look is picked on the character screen, which is the identity (`31/09`). Held art comes as a delivered picture with its grip pixel (`26`), the generated shapes standing in where none is drawn. The design agent's character delivery is in `data/art/character/`; its garments are not items yet, except the onion hat (the item `hood` wears the head layer `onion`, dyed by a dyed entry like hair, a two-tone painting only, and worn by the dead too; `02`, 2026-10-18). The editors' manuals, the first customisation and creation-screen notes, the dead's outfits, the data notes, the build order, the acceptance, and the tunables are `history/12-figure-build.md`.

The pair of rulings this grows from: everything the character wears is a slot (`11-character.md`), and dev art goes as far as it can before anyone is paid (`00-vision.md`, Laws: build it the way it is truly wanted, then measure).

## The look

From the two reference figures Michael shared (a knight with a red scarf, a zombie in a brown shirt; both drawn by an image model as ideation, neither to be copied):

- **The head is about a third of the height.** Shoulders are no wider than the head. The body is a block; the figure is chunky, not lanky.
- **Limbs fuse to the body.** Arms hang against the torso and are separated from it only by the outline. Legs are two blocks with a one-pixel gap. No armpit gaps, no drawn elbows. **Since 2026-10-15 the rig has elbows** (never knees, Michael): an arm bends at `BODY.elbow` of its length (the middle) by a pose's `bend`, and is drawn as two halves joined round, the one outline kept; a straight arm (every pose until one asks) is the same pixels as before. Still no drawn elbow: the joint is the rig's, not the art's.
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
| present | 1 | the held-out pose (`32`, item 1): the main arm forward at chest height, played while eating or drinking; the player's alone |

The zombie uses the same names with its own keyframes: a forward lean, arms out, a drag in the walk.

## The rig

A figure is drawn from a **joint table**, not from fixed rectangles. Per facing, per animation, per frame: the positions of head centre, neck, shoulders, hands, hips, knees, feet, in frame pixels relative to the feet anchor. Keyframes are authored once per animation as deltas from the facing's rest pose, so a walk written once applies to all eight facings with the facing's own depth ordering.

The body is drawn from the table in parts, each a filled shape with its outline: far leg, far arm, torso, near leg, near arm, head. Which arm and leg are "far" depends on the facing; that order is the first half of the order table below.

Why a rig: the walk gets a real swing, the attack becomes arm keyframes and the weapon follows, carrying is an arm pose, and every garment and every held item reads its position from the same table, so nothing can drift out of register.

## The paper doll

The body is the figure bare: skin, hair, eyes, and no undergarment (`02`, 2026-10-12; `25`). Garments are **rules on the body's parts**, applied while the figure is drawn, so a whole outfit bakes into one sheet. The first draft of this doc had each garment as its own sheet stacked at draw time; building it showed why not: a near arm must draw in front of the tunic's torso and a far arm behind it, which a stack of whole-figure sheets cannot do. Baking per outfit keeps the rig's depth order exact. A sheet is baked the first time an outfit is seen and shared by everyone wearing it (`assets.sheetFor`); the player's is rebuilt in about thirty milliseconds whenever their look or clothes change and redrawn into the atlas in place. Held items stay separate overlays at the hand joints. Real art arrives the same way: a body and garment drawn to the rig's grid, composited by the same code.

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
| beard | the face, under the hair where they meet | the slot exists (`wardrobe.js`) and nothing fills it: facial hair is after 1.0 (`02`, 2026-10-13), and `data/layers/beard/` lists no style until then |

A garment definition in `data/items.json` is `art: { shape, colours }`: the shape names a rule (tunic, breeches, boots, gloves, hood, cap, helm, belt, sack, rucksack), the colours give its tones. Two tunics differ by colour alone; a tabard is a tunic shape with a second colour over the torso.

## Held items

A hand that holds something raises its arm forward and keeps it there through the walk (Michael, after first play: the torch read as strapped to the arm with the flame at the shoulder). The held item tilts forward from the hand, about a third off vertical toward the facing, with a small outward lean on the hand's own side so it clears the body from the front; in the attack the main hand's item points along the forearm. Held art is drawn in sixteen angles. Each hand joint has a position and an angle per facing and frame. A holdable item draws its **held art** at the hand: a torch is a stick with a flame, a hatchet a stick with a head, a plank a long board, a log a short fat one. Two-handed items draw between both hands. Attack keyframes move the hand, and the item moves with it; the flame's light point moves with the torch, replacing today's fixed per-facing hand point in the renderer.

Held art is generated per facing like everything else (a hatchet from behind shows its back). An artist later supplies per-facing held sprites or a single sprite the generator rotates in whole 45-degree steps; both go through the same anchor.

**Right- or left-handed** (Michael, 2026-10-25, `02`): the main arm is the right one, unless the character is left-handed (`player.handed`, chosen with its identity), and then it is the left. The rig works a pose out as ever, with the arms' arrays as off and main, and `pose(..., left)` turns them round at the end (the walk's free arm, which swings with the legs, keeps its side), so the main hand's thing is in the left hand and every pose (the swings, `attack_off`, the bow, the cast, the thrust, the held-out pose, the wave) on that side, and the sheet's joints name `main` and `off` as before; the sprite is never flipped, so the face, the hair's parting, and the garments stay as drawn. A left-handed sheet's key ends in `"left"` (`specKey`); a right-handed one's is the key it always was. The dead and villagers are right-handed. Visual only: nothing in the sim reads it.

Furniture carried over the head keeps its own drawing (`02-decisions.md`, carrying), placed from the carry pose's hand points.

## Goobers

The body is one body, neutral in every way; undies are optional and so is any hint of sex. Dress, hair, and facial hair say what the player wants said, and the game's text uses they and them for every figure, the dead included (Michael, 2026-10-10: "they're not humans, they are little goobers").

## The body's rules, 2026-10-12

Michael's attempt to have the body redrawn ended with the rig kept (`02`, the same day). The numbers changed: the hip at 17 (was 15), so the legs are two pixels longer and the torso two shorter; `torsoD` 3 (was 4), so the torso is as thick as the arm and no neck block shows wider than it from the side; `hipD` 3.4 (was 3), so the legs' tops never jut past the hips. The rules: **what is left of a far arm shows only if some row of it is wider than two pixels** (`cullPart`, `FAR_ARM_SLIVER`), judged for the shoulder's half and the hand's apart, so no sliver, strip, or shoulder flare ever shows along the torso while a hand at the hip or a short back-swung arm, three or more wide, stays whole; **a raised arm, holding or swinging, is never judged** (`RAISED_ARM`, 40 degrees of pitch); and **an arm's outline never doubles another part's in a row** (`mergeOutlines`): where two outlines touch with no fill between, the nearer part's stays and the other becomes what lies beyond it. Outline pixels carry their part for this. The rules run after every part is drawn and before the shading, every frame of every facing, so a painted layer gets them for free.
