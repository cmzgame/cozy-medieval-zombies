# 32 — Better animations: the build record

**What this is:** the status block of `docs/32-better-animations.md` as it stood on 2026-10-15, the bodies of its built items (1, 2, 3, 10, 11), and its "Where we left off" note, moved here whole by the sweep, 2026-10-16, and never edited after. The live text is `docs/32-better-animations.md` (its status block, the rules, and items 4 to 9); the rulings are `docs/02-decisions.md` under 2026-10-13 to 15.

## The status as it stood

**Status, 2026-10-14: item 10 (the walk as data) is built and accepted, the one-handed swing was redone beside it (a high-to-fall slash with a `wrist`, `02`), item 11 is done, and items 1 and 2 are built and accepted as they are (the held-out pose and the halberd's thrust, `02`, `check("poses")`; elbows on the rig some day, knees never, Michael); items 4 to 9 are not built. **2026-10-15:** the bowstring drawn to the chin with the elbow (#5, #8, accepted by Michael, plain and braced) and **item 3, the cast** (#6, #9): `cast_staff` and `cast_book` by which hand holds the staff, the staff held up like a pole (`heldTilt`/`heldOut` on a frame: upright, its top a little behind, after Michael's note that it read as a spear), the draw's thresholds as data (`at`), the spell's release on frame 3. Multiplayer is live (`31/08`): every item here must look the same on a guest's replica, which the last two bullets below say how.** Specified 2026-10-13 from Michael's list. Scoped for implementation by another model (see `CLAUDE.md`, "Implementing from a spec"): the doc decides, "default" marks what Michael may overrule.** The rig is final until a human artist (`02`, "We have a body"), so every item here is a pose on the rig the game already has, not a change to the rig: a new pose set in the poses data, an animation hook where the game plays it, and the sheets rebaked. More frames are not the point (Michael): the idle and the walk are at the fidelity he wants; the exceptions are named below.

## The built items, as specified and as built

### 1. The held-out pose

**Built 2026-10-14** (`02`): `present` in the poses data (`pitch 90, out 2, headD 1`, the main arm, index 1, since the doc's `[90, 0]` named the off arm); a held thing's `held.pose: "present"` (the book) takes the main arm in the idle and the walk through the spec's `holding.mainPose`; `player.presentFor` (`tuning.json` `presentTime` 0.6) set by `eat`, `drink`, and a timed action marked `present` (the drink at water, for its bar), counted down in `updatePlayer`, ended by walking, and riding the light record to a guest.

A named pose the rig lacks: the main arm forward at chest height, the item presented in front of the body, the off arm at rest. **Default numbers** (tried first): `armPitch [90, 0]`, `armOut [2, 1.5]`, `headD 1`, no lean. It is a one-frame animation `present` on the sheet, player-only (the `noCarry` pattern), and **three things play it**: the book when held in the main hand with nothing drawn (the book's `held.mode` is `fixed`; the pose replaces the hold pitch for that item: a `held.pose: "present"` field on an item says so), a torch held to something while a Use on a fire resolves (later; the field is enough for now), and drinking and eating for their action's duration (the `drink` and `eat` paths in `entities/player.js` set `player.anim` to `present` for `T.drinkTime` [0.6 s, default] and go back). The held item draws at the hand joint as always: `held.js` reports the joints per frame, so a new frame needs the item's angle for that pitch (`angSwing` / `ang` are read from the pose; nothing to add).

### 2. The halberd's two attacks

**Built 2026-10-14** (`02`): the `thrust` style in the poses data with both hands on the shaft (`offPitch`) and a `wrist` on the draw and the recovery so the shaft stays level (`45` and `25`; the doc's draw at `pitch -20` pointed the blade at the ground); `combat.altStyleOf`, the spec's `altStyle`, `attack_alt` on the sheet of a figure whose weapon's `alt` names a style; `tryAttack(..., "alt")` plays it, its predicted form on a guest too; an animation a sheet lacks ends at once and draws as the idle, so a sheet one rebake behind never holds.

The halberd swings with the one-handed style and its thrust (the `alt` block on its weapon, the middle button or Q, `docs/21`) plays the same animation. **A second attack animation on the sheet**, `attack_alt`, for any weapon whose `alt` names a `style`; the thrust style `thrust` in the poses data, four keyframes, **default**: frame 0 a draw back (`pitch -20, out 1, lean -1`), frame 1 the lunge (`pitch 95, out 0, lean 3, bob 1`, the active frame), frame 2 held (`pitch 90, lean 2`), frame 3 back to rest. `animsFor` adds `attack_alt` from the alt style as it adds `attack` from the main one; `combat.tryAttack(..., "alt")` plays `attack_alt`; sheets of outfits whose main hand holds no alt weapon leave the animation off (as `noCarry` does), so the atlas pays only for the halberd's bearer. The halberd's item row gets `"alt": { ..., "style": "thrust" }`.

### 3. The cast: the staff and the book

The spell is `docs/24` (not built); the pose is this item and lands first. **The mechanics are the bow's**: the left button held on a staff or a book is a draw (`archery.launcherOf` returns a launcher for an item with a `cast` block as it does for `bow` and `thrown`; `cast: { drawTime, style, projectile: "fireball" }` on the item; the projectile exists as a stored sheet, `data/art/items/fireball.png`), the release the cast; until `24` the release does nothing but the pose and a log line ("The staff hums." default). **Two styles**: `cast_staff` with the staff raised high (frames 0 to 2 the arm rising from `pitch 60` to `pitch 160, out 2`, the head up `headD -1`; frame 3 the release, the arm thrust forward `pitch 100, lean 2`) and `cast_book` with the book held out (frames 0 to 2 the present pose of item 1 with the off hand coming up to the book, `offPitch 80, offOut 1`; frame 3 the release, both arms forward). The staff's `held.mode: "angles"` art already has the five angles the raised arm needs. Player-only animations. A guest casts as it draws a bow: the draw lives on the player and the release is resolved on the host (tier 2 of `31`), so the launcher kind needs no path of its own.


### 10. The walk, a quick pass

No new frames. The four walk keyframes read as nearly right (Michael); a pass on the numbers in `pose()`'s `walk` case, tried from the console with Michael watching, then moved into the poses data as a `walk` style so they are tunable without code. The leg stride and lift, the arm swing's pitch, and the bob are the knobs.

*(First cut 2026-10-13: the walk is data, `walk` in `data/poses.json` with `stride`, `lift`, `arms`, `bob`, `lean`, `headD` per frame; the numbers moved so the body is low at the contact frames and up a pixel at the passing frames, the swinging leg's knee lifts at the passing frames, and the body leans half a unit into the walk. The one-handed swing was passed over at the same time, since Michael called it wild: the wind-up coils back at 75 degrees instead of overhead at 110 with the body leaning back, the hit drops the body a pixel, the follow-through reaches 125, the settle comes to 50. Both are Michael's to judge in play and to tune: edit the file and `__game.reloadPoses()` rebakes the player at once. **The walk is accepted; the swing was re-ruled the same day** (`02`): a high-to-fall slash, raised to head level and never behind the back, so every one-handed style keeps its pitch at or above zero.)*

### 11. The arrow and the spear, redrawn (dev art)

*(Done 2026-10-13 with this spec, in `archery.js` `makeProjectile`: a two-tone shaft, a tapered head with its socket, swept fletching and a nock on the arrow, a lashing and a broader stone point on the spear. If the drawn art from the design agent lands before this list is built, the item is moot and is struck.)* The generator keeps its sixteen angles and its frame names, so the flight, the landed picture, and the held strip change together.

## The note at the end of the build

### Where we left off (2026-10-15)

Built that night with the elbow (`02`): the bowstring to the chin (the plain draw and the braced share it; Michael: "great in both ways", so item 4's own style may not be needed) and the cast (item 3). **The elbow's next poses, talked through with Michael and not yet scoped, each a small item tried from the console first:**

- **Both hands on the halberd's shaft,** for its swing and its thrust (the off hand's elbow bent to meet the shaft).
- **A one-handed swing from the elbow and the forearm,** the shoulder and the upper arm moving little (Michael: the best one-handed swing), **or a dramatic swing up and down**; try both.
- **Eating and drinking with the hand to the face** (the held-out pose's arm bent back to the mouth).
- **The cast's book held close** is done (the staff hand's `cast_staff`).
