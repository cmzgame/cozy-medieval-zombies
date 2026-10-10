# Milestone 8: melee, the swing, and the art of it

The player hits the dead. One good one-handed swing first, because it serves sword, axe, mace, stick, and torch alike (Michael, 2026-10-10 pin 4), with the parts Michael can shape himself: the swing's keyframes in a data file he can edit and preview, held item art he can paint in the layer editor, and the weapon numbers in `items.json`.

The parent's lesson is the starting point: `cozy-zombie-game/docs/22-melee.md`, "Melee that lands". Its reasons come along; its numbers are re-decided below. Scoped 2026-10-11 for implementation by another model; "default" marks what Michael may overrule.

## Status, 2026-10-11 (accepted for now)

**Michael's verdict after the mouse pass: melee "feels good", the swing-target outline "feels great, it makes combat super duper legible", and multi-hit and single-hit "both work as advertised". "We can basically call this good."** Melee is done for the moment except for more weapons, drawn and given stats.

**Built, tested by script, and played:** the swing as data (`data/poses.json`, with Preview and Reload poses in the layer editor); the weapons (hatchet, torch, stick, sword, mace, fists) with generated held art and every number tunable per item (`damage`, `knockback`, `knockbackChance`, `knockdown`, `stagger`, `multiHit`, and the rest, table below); `combat.js` with the wedge test, swings that resolve on the click, cooldowns and stamina, the shove (push cut to a third), multi-hit as a setting and a per-weapon override; the dead's stagger, knockback, knockdown, finisher, and death; hit-stop, the screen kick, the drawn wedge, Show hit shapes (debug), **Swing targets** (the green outline, for play), and the floating health bar. Acceptance checks 1 to 9 pass; check 10 waits on step 5.

**Still open in this milestone:** **step 5, the painted held slot** ("Held item art, painted"): the `held` slot in `tools/layers.html`, `data/held/`, `generateHeldFromPixels`, the server path. It is also how new weapons get drawn, so it comes first below.

**Weapons backlog, Michael's list of 2026-10-11, in the order the work falls:**

1. **Step 5, the painted held slot.** Needed to draw a weapon at all; the generated shapes stand until then.
2. **More one-handed melee weapons**, drawn and given stats: a block in `data/items.json` and a drawing each. Candidates he has named over time: axe, shovel, club; others as wanted (knife, machete). No code beyond data once step 5 exists.
3. **Dual wielding: decide, so the game has an answer** (`02-decisions.md`, question 23). Today: an `either` item can sit in each hand (two torches, two sticks), but only the main hand's weapon swings; the off-hand item does nothing in a fight.
4. **A usable shield** (question 24): the off-hand's natural job, and it competes with the torch for that hand.
5. **The bow and arrow** (question 25): Michael's favourite weapon in these games and he is picky, so it gets its own design conversation and doc before any code, not a spec-and-build in one go.

**Candidates beyond, none scheduled:** the parent's wind-up and lunge for the dead (a trial); sounds (there is no audio module); searchable corpses (the `body` loot table exists); two-handed styles and weapons; weapon condition; the dead's speed and variety (question 19).

**Known and harmless:** the browser console may show one "connection refused" line from the preview pane itself; every request the game makes returns 200. When scripting tests, stepping the game re-aims the player at the real mouse, so set `player.aim` just before each swing.

**History of the testing, for the record:** the first pass (2026-10-11, on a trackpad) judged only knockback (cut to a third on every weapon and then the shove) and the finisher's legibility (answered by the health bar); the mouse pass judged the rest and accepted it. The testing list that drove it (legibility, the swing's look, feel numbers, the dead's reactions, the weapons, the interactions with placement) is closed.

## What exists, and is not to be changed

- The rig (docs/12, `src/figure.js`): an `attack` animation of 4 frames at 12 fps with `activeFrame: 1`, keyframed in `pose()` as arm pitches and a lean; the main hand's held item points along the forearm during it (`angSwing`). Zombies have their own attack keyframes.
- The player aims at the mouse: `player.aim` is a unit screen vector from the chest (`aimOrigin`, `AIM_Y` 22 px); facing follows the aim.
- Hands hold entries (docs/11); `player.hands.main` is the weapon hand. Items: `hatchet` (`hands: main`), `torch` (`either`), `plank`, `log`; held art per item in sixteen angles from `generateHeld`.
- The dead (`src/entities/zombie.js`): `hp` 100, bite 8 on a cooldown, states idle, wander, chase, search, attack, breach, climb; `playerHit` event; `z.dead` is read by the renderer but nothing sets it yet. No damage function exists.
- Zombie aggro and survival are settings, off by default (docs/02); combat is tested with aggro on.
- The sheet's `animations` carry `activeFrame`; `sprites.isActiveFrame` reads it.
- Left click: free, except that placement (docs/13) takes it while a mode is active. Space is free.

## Input (default rulings)

- **Left click swings** with the main-hand item, or punches with an empty hand. It is Zomboid's convention and it keeps the mouse as the aim. Placement declines the click first (docs/13); a click on DOM UI never reaches the canvas.
- **Space shoves**: the "get off me" move, no weapon needed.
- Attacks are refused while carrying furniture, climbing, or dead; while the panel or a screen is open the step does not run anyway.

## Weapons, in `data/items.json`

A `weapon` block on an item:

```json
"weapon": { "damage": 30, "range": 1.3, "arc": 90, "swing": 0.55, "knockback": 0.8, "stamina": 6, "style": "one_handed" }
```

| Item | damage | range | arc | swing s | notes |
|---|---|---|---|---|---|
| fists (no item; `FISTS` in `combat.js`) | 6 | 0.9 | 100 | 0.4 | shove-like, no knockdown |
| stick | 14 | 1.2 | 90 | 0.5 | new item, `hands: either`, size 1×3, found in the wild (loot: body, wild) |
| torch | 8 | 1.1 | 90 | 0.5 | you can, it is bad |
| hatchet | 30 | 1.2 | 80 | 0.55 | existing |
| sword | 34 | 1.35 | 100 | 0.5 | new, `hands: main`, 1×3, chest loot, rare |
| mace | 38 | 1.2 | 80 | 0.65 | new, `hands: main`, 1×2, chest loot, rare; knockdown chance doubled |

`range` is tiles from the feet; `arc` degrees of the aim wedge; `swing` is the cooldown in seconds; `knockback` in tiles; `stamina` per swing. `style` names the keyframe set in `data/poses.json`; all of these are `one_handed`. Two-handed styles are a later milestone.

**Every field of a weapon block is a tunable, per item** (Michael, 2026-10-11), live in the console too (`__game.items.getItem("hatchet").weapon.damage = 40`, no reload):

| Field | Meaning | Default if absent |
|---|---|---|
| `damage` | health taken per hit | required |
| `range`, `arc` | the wedge: tiles from the feet, degrees | required |
| `swing` | seconds between swings | required |
| `stamina` | cost per swing | required |
| `knockback` | tiles a hit pushes the zombie | required |
| `knockbackChance` | chance, 0 to 1, that a hit pushes at all | 1 |
| `knockdown` | chance, 0 to 1, that a hit floors it (0 also turns off the third-hit floor) | 0.3 |
| `stagger` | seconds a hit stops it | 0.3 |
| `multiHit` | `false` makes this weapon hit only the nearest zombie, whatever the setting | true |
| `style` | the swing's keyframe set | `one_handed` |

Fists and the shove are the same fields in `data/combat.json`, since they belong to no item. The Multi-hit setting (settings screen, on by default) turns multi-hit off for everything; off, a blow and a shove reach only the nearest zombie in the wedge.

New items also need `held` art (a shape for `generateHeld`, or a painted one, below) and `size`, `color`, `short` like every item.

## The swing: `data/poses.json`

The attack keyframes move out of `pose()` into data Michael can edit, loaded at boot and handed to `figure.setPoses(data)` before any sheet is generated (and the editor loads the same file):

```json
{ "one_handed": { "fps": 12, "activeFrame": 1,
    "frames": [ { "pitch": -110, "out": 4,  "lean": 0,   "bob": 0 },
                { "pitch": 75,   "out": -2, "lean": 2,   "bob": 0 },
                { "pitch": 105,  "out": -6, "lean": 2.5, "bob": 1 },
                { "pitch": 30,   "out": 0,  "lean": 1,   "bob": 0 } ] },
  "zombie": { "fps": 12, "activeFrame": 1, "frames": [ ... the current zombie attack ... ] } }
```

`pitch` is the main arm's forward angle (0 hanging, 180 straight up); `out` is the hand's lateral offset, negative across the body, which is what turns a raise-and-chop into a sweep; `lean` and `bob` move the body. The off arm keeps the holding pose. The player's `attack` animation uses the style of the weapon in hand (`FISTS` uses `one_handed` too); if the style is missing, `one_handed`. The sheet is baked per figure, so a style is chosen when the sheet is built: the player's sheet rebuilds on any change of held item already (docs/12), so `spec.style` joins `specKey`.

**Michael's lever:** edit `poses.json`, click Preview poses in `tools/layers.html` (which shows attack frames), and reload the game. The implementer adds the file to the editor's fetches and a "Reload poses" button there.

## Held item art, painted

`tools/layers.html` gains a slot **held**: a 32 by 32 grid with the grip marked at (16, 20), painted upright, saved as `data/held/<name>.json` `{ name, pixels: [[x, y, "#hex"], ...], tip: [x, y] }` and listed in `data/held/index.json` (the server's POST regex gains `held`). The game turns it into sixteen angles with the same rotation as `generateHeld` (`generateHeldFromPixels(pixels, tip)`), registered as `held_<item id>` when an item says `"held": { "painted": "name", "swing": true }`. The torch's flame sits at `tip`. The editor's Preview poses shows the item in the hand through the swing, so the rotation's look is judged before saving. If rotated pixels ever read badly, the format allows `angles: { "0": [...], "4": [...] }`, hand-drawn frames for some or all of the sixteen angles that replace the rotated ones; not built until wanted.

## Hitting

Ported from the parent, `src/combat.js`:

- **The swing resolves on the click**, not on the animation's active frame. The animation is cosmetic. The cooldown (`swing` seconds) is the only rate limit; extra clicks do nothing.
- **Reach is a grid circle of `range` tiles around the player's feet, cut to the aim arc** measured in screen space from the chest. A zombie is hit if any of its body sample points (feet to chest, at the body's half-width of 7 px, five samples up the body) falls in the wedge. Samples are taken on screen and converted back to grid for the distance test.
- **Point blank always hits**: a zombie within `POINT_BLANK` 0.55 tiles is hit whatever the angle.
- **Down-screen slack**: a zombie whose feet are below the player's on screen gets up to `BODY_SLACK` 0.8 tiles of extra reach, scaling with how far below. The parent found this by play; keep it.
- A hit does `damage`, pushes the zombie `knockback` tiles away along the aim (through `map.moveCircle`, so walls stop it), plays its `hurt` animation (its first frame is baked white: the flash), and staggers it `STAGGER` 0.3 s, during which it does not move or bite.
- **Knockdown:** every hit has `KNOCKDOWN_CHANCE` 0.3; the third hit on the same zombie within 2 s always knocks it down; a mace doubles the chance. Down: lies for `DOWN_TIME` 2 s (the `die` animation's lying frames, 2 and 3), blocks nothing, does nothing; gets up over 0.6 s (frames 1 then 0) and resumes. A hit on a downed zombie is a **finisher**: double damage.
- **Death:** `hp <= 0` sets `z.dead = true`, plays `die` once and holds the last frame, the body stays as a corpse, not solid, never thinks again, is skipped by `others` for separation. Event `zombieDied`. The corpse is not searchable yet (loot table `body` exists for later).
- **Shove (Space):** reach 1.0, arc 100, no damage, knockback 1.6, stagger 0.6 s, 25 percent knockdown, costs 5 stamina, 0.45 s cooldown. Works with anything in hand or nothing.
- **Stamina:** a swing costs its `stamina`; at zero stamina the swing still happens at half damage (the player is never locked out of hitting; default).
- **Hurt cancels nothing:** a swing during the player's hurt animation lands (it resolved on the click).

```js
// combat.js
export const FISTS = { damage: 6, range: 0.9, arc: 100, swing: 0.4, knockback: 0.17, stamina: 3, style: "one_handed" };
export function weaponOf(player)                     // the main hand's item's weapon block, else FISTS
export function tryAttack(player, zombies)           // on left click: cooldown, stamina, wedge, hits; returns the hit list
export function tryShove(player, zombies)
export function updateCombat(player, zombies, dt)    // cooldowns, effect timers
export function inWedge(player, weapon, z)           // the test, exported for the acceptance script
export function effects()                            // { wedge: {...} | null, kick: {dx, dy} | null, hitStop: seconds }
```

`zombie.js` gains `damageZombie(z, amount, { from, knockback, knockdown })`, the `hurt`, `down`, and `dead` handling in `updateZombie` (a downed or dead zombie returns early), and `z.hits` (timestamps for the third-hit rule).

## Legibility, the rule

Michael's test (2026-10-11): never a swing whose animation visibly clips a zombie with no hit. Three things make that hold, and the implementer treats them as one rule:

1. **The shape that is drawn is the shape that is tested.** The wedge on the floor is the hit test, in grid space, with nothing else deciding.
2. **The body is hit, not the feet.** A zombie whose sprite overlaps the wedge is in it, because the samples run up its body and the down-screen slack covers the case where its feet are a tile away but its head is on your legs.
3. **The swing is never lost.** It resolves on the click; the arm's animation is a picture of a decision already made, about eighty milliseconds behind, which play cannot see.

A **Show hit shapes** setting (off by default, beside the debug corner) keeps the wedge drawn whenever a weapon is held and marks each zombie's body samples as dots, so a miss can be read on screen rather than argued about. It is the first thing to turn on when a hit feels wrong.

## Swing targets (the outline)

Michael, 2026-10-11, after reading how Zomboid's aim outline works (a per-zombie outline in its Display options, green when a zombie is in melee reach; players report it signals range and does not always guarantee a hit): ours is **deterministic**. A zombie gets a one-pixel green outline when the next swing would hit it, by the very test `tryAttack` uses (`combat.swingTargets` and `targetsIn`), so **green means the swing lands**; a swing that misses a green zombie would be a bug. It does **not** consider the swing's cooldown, so it does not flicker; it follows the aim every step; with multi-hit off only the nearest is outlined. It shows whenever the player could swing (not carrying, climbing, or dead), with fists too, and is for testing and for play alike.

- **Setting:** Swing targets, off by default, on the settings screen. Show hit shapes (the wedge and the body samples) stays the debug view; this is the player-facing one.
- **Drawing:** eight copies of the sprite, one pixel out, flat green (`FLAG_SOLID`, a shader flag that draws a quad in its colour with the sprite's shape), just behind the figure, unlit and unfogged so it reads at night. A zombie hidden behind a canopy has its outline hidden with it.
- **Cost:** one wedge test per zombie within reach each step.

## Feedback

- **The wedge** is drawn for 120 ms on the floor as a translucent polygon (`gl.poly`, 24 segments of the arc, colour `[1, 1, 1, 0.18]`, `FLAG_NOFOG | FLAG_UNLIT`), exactly the shape tested.
- **Hit-stop:** the loop skips `HIT_STOP` 45 ms of game time on a hit, 90 ms on a kill (`loop` gains `freeze(seconds)` that holds the accumulator).
- **Screen kick:** the camera origin jolts 3 px along the aim for 80 ms (`camera.kick(dx, dy, seconds)` adds to `applyOrigin`).
- **Flash:** the zombie's `hurt` frame 0 is white already.
- **A health bar** (`src/ui/zombie-bars.js`, 2026-10-11) floats over any zombie with `0 < hp < maxHp` and still visible in the fog, through `view.toUi` like `ui/prompt.js` — DOM, never drawn into the canvas. It is the finisher's tell Michael asked for in place of a special animation: hit a downed zombie and the bar drops by double, legibly. The vertical offset is world px (`HEAD_CLEARANCE` 76, figure.js's `FH` 72) converted through `toUi`, not a flat ui-px offset like the prompt's — a flat offset undershoots at close zoom, where the figure outgrows it and the bar sits on the chest instead of over the head.
- No sounds; there is no audio module yet.

## The dead, unchanged except

- Walk speed stays 1.0 (docs/02 question 19 still open; the parent settled on Romero shamblers and so does the default here).
- Wind-up and lunge from the parent are **not** ported now; noted as a trial for after play.

## Build order

1. `data/poses.json` and `figure.setPoses`; the `attack` keyframes read from it; the editor's Preview and Reload poses. Nothing else changes; the figure looks the same.
2. Weapons in `items.json` (stick, sword, mace, stats on hatchet and torch), their generated held shapes, loot entries.
3. `combat.js`: `inWedge`, `tryAttack`, `tryShove`, cooldowns, stamina; `damageZombie` and the hurt, stagger, knockback, down, finisher, death states; left click and Space wired in `main.js` after placement; `zombieDied`.
4. Feedback: the wedge, hit-stop, kick.
5. The painted held slot in the editor, `data/held/`, `generateHeldFromPixels`, the server path.
6. Acceptance by script, then `TODO.md` ticks and the Status line, commit, push.

## Accept when (scripted, through `__game`)

Aggro on (`settings.set("zombieAggro", true)`), paused, stepped with `loop.advance`. Aim by setting `player.aim` and `player.facing` directly. A zombie is placed with `teleport`-style writes to `z.gx/z.gy`.

1. `combat.inWedge` is true for a zombie 1.2 tiles away in each of the eight aim directions (its sprite overlaps the wedge) and false at 2.3 tiles in all eight. Down-screen: hit at 1.5 and 1.9, missed at 2.2.
2. A zombie at 0.4 tiles behind the player is hit (point blank).
3. Ten `tryAttack` calls in one second with a hatchet produce the swings the 0.55 s cooldown allows, each resolved; the zombie's hp drops by 30 per hit and it is pushed back about 0.27 tiles.
4. Third consecutive hit knocks down; a hit while down does 60; it gets up after 2 s if alive; a mace kill from full health takes three hits with no knockdown luck involved (38, 38, finisher 76 or plain 38).
5. `tryShove` pushes a zombie 1.6 tiles, staggers it, does no damage, and sometimes knocks it down.
6. A zombie at zero hp sets `dead`, plays `die` to its last frame, stops moving, and is walked through.
7. A swing issued during the player's hurt animation lands.
8. `effects()` reports the wedge for 120 ms and a kick for 80 ms after a hit; `loop` reports a freeze of 45 ms on a hit and 90 ms on a kill.
9. Changing a pitch in `poses.json` and reloading changes the baked attack frame; Preview poses in the editor shows the same frame.
10. A painted held item saved from the editor appears in the hand in sixteen angles and swings with the arm.

## As built

Weapon fields, shove, and multi-hit (2026-10-11, after Michael's first melee pass): `knockbackChance` and a per-item `stagger` joined the weapon block; fists and the shove moved to `data/combat.json`; the **shove's push was cut to a third (1.6 to 0.53)**, since at 1.6 it threw zombies across the room (the rest of the knockbacks had been cut the same way on his laptop); `multiHit` is a setting (default on) and a per-weapon override, and the shove obeys it.

Step 1, the swing as data (2026-10-11):

- `data/poses.json` holds the styles; `figure.setPoses` takes them, `figure.js` keeps the same numbers as built-in defaults so a missing file is not fatal, and a style the file lacks keeps its default. `figure.animsFor(spec)` gives each figure its own animation table, so a style may be longer or faster than four frames at twelve: the sheet is laid out from it.
- A frame is `{ pitch, out, lean, bob }`, with two optional fields the dead use: `offPitch` and `offOut` pose the other arm. `out` is the main hand's lateral offset from its shoulder, absolute (it replaces the rest spread of 1.5), negative across the body.
- The player's style comes from the main-hand item's `weapon.style` (none yet: `one_handed`), joined to the spec and its key; the dead use `zombie`; an unknown style name falls back.
- The editor loads the same file, shows every attack frame in Preview poses, and has a Reload poses button.
- The player's swing now sweeps across the body (the `out` column); the off arm holds its pose instead of the old small motion.

Steps 3 and 4, hitting and its feedback (2026-10-11):

- **`combat.js`** is the parent's hit test with this figure's numbers. Where the build departed from the spec: `BODY_HALF_W` is **10** px, not 7, because the drawn body with its arms is about that wide and the rule is that a sprite overlapping the wedge is hit; the five samples sit at heights 2, 10, 18, 26, and 34 (feet to chest); `BODY_TOP` is 48 for the slack; the reach comparison is inclusive (a zombie exactly at range is in range, which the hatchet's 1.2 and the acceptance's 1.2 need). A close zombie's body subtends a wide angle from the chest, so one placed 60 degrees off the aim at one tile is still hit: that is the overlap rule working, not a bug.
- **Weapon blocks gained `knockdown`**: the per-hit floor chance (the mace's is 0.6, fists' 0, default 0.3). Fists never floor, the third-hit rule included.
- **A push is spread over 0.15 s** (`z.knock`) rather than a jump, and goes through `moveCircle`, so walls stop it.
- **`damageZombie`** (`zombie.js`) takes `{ dir, knockback, knockdown, stagger, from }`. A blow cancels a bite begun; when Zombie aggro is on, the zombie then knows where it came from; with aggro off a hit zombie stays a passive punching bag. The dead, the downed, and rising zombies are skipped by separation, so nothing is blocked by them.
- **Down** is one state for lying and rising: the `die` frames forward, hold two seconds, then backward over 0.6 s. A hit at any point of it is a finisher (double damage, no push, no stagger).
- **Feedback:** `loop.freeze(seconds)` holds game time (the longest request wins), `camera.kick(x, y, seconds)` jolts the origin and fades, and the wedge is a translucent floor polygon for 0.12 s. **Show hit shapes** (settings) keeps the wedge up whenever a weapon is held and marks each nearby zombie's body samples, green when it is in the wedge. A held weapon is anything with a `weapon` block; fists do not count.
- The click is placement's first, then the swing, made after the player has turned to the cursor that step. Space is the shove. Neither works while carrying, climbing, or mid-action.

## Tunables

`POINT_BLANK` 0.55, `BODY_SLACK` 0.8, `STAGGER` 0.3, `KNOCKDOWN_CHANCE` 0.3, `DOWN_TIME` 2, `HIT_STOP` 0.045 and 0.09, the kick 3 px for 80 ms, the shove numbers, `FISTS`, and every weapon block.
