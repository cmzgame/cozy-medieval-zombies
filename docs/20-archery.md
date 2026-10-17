# 20 — The bow and arrow: a rough scope for the feel

**Status, 2026-10-16: built (steps 1 to 3 on 2026-10-12); the code is the truth and this page is the bow as it stands.** The outcome of a shot is fixed at release ("The one idea"); the bow's **free draw is 1.4 s and the braced draw 0.6 s** (`braceDrawTime` on the bow in `data/items.json`; holding right braces and walks at 0.2, and a right tap during a draw cancels it; `21`); hits are checked at landing only, and an arrow that hits one of the dead stays in the body and comes out in its loot; the aim guide is a setting (`Aim guide`, off by default; each player's own, read where the frame is drawn). The flight's numbers (range, speed, the arc, `hitRadius`, `aimLift`, the obstacle heights, the walking speeds) are the `bow` block of `data/combat.json`, the bow's own `drawTime`, `braceDrawTime`, `damage`, and `knockback` its item block, and the bow's string wears by the shot (`shots` 100; `30`, 5.2), the bow leaving the hand at the last. The same machinery throws the spear (a `thrown` block on the item, on the middle button or `Q`; `21`) and casts the fireball (`24`). Since 2026-10-13 (`31/05` item 12) the draw, the recovery, the scripts' aim, and the landing marker are on the player (`player.draw`, `recover`, `aimOverride`, `marker`), so two can draw at once; a guest's draw fills on the host from its held button and looses at the ground point it sent; the arrows in flight travel in every frame (`archery.setReplicaArrows`), and what lands is a floor item or a lodged arrow, carried by the chunk deltas and the records. Owed to the art pass: the nocked arrow, striding legs while drawn, a landed arrow sticking in the ground, sounds. The build's record (the three steps, the atlas fix, Michael's three asks after play, the spear roughed out) is `history/20-archery-build.md`.

## The gold standard, in Michael's words

Minecraft's bow. A clear draw and release; the best arcing in any game, not realistic but **the platonic bow**: high arcs possible, long distances, **highly accurate if the same motion is repeated**, so that with practice you can snipe across the map; a flight time fast enough to hit where you meant but **not hitscan**, so you sometimes lead; arcs **from nearly flat to high**; arrows that **stay where they land** and can be taken back (by E here, not by walking over them), and getting them back matters. Sounds later.

## The one idea that makes an arc work in isometric

**The outcome of a shot is fixed at the instant of release** (Michael's plan, 2026-10-12). The arrow is really **a point moving in a straight line along the ground**, at a steady speed, from the archer to a landing point. The arc is only visual: the arrow is drawn above that point, lifted by a height that follows a simple parabola (zero at launch, highest at the midpoint, zero at landing), and **a small shadow is drawn at the ground point**. The arrow and its shadow start together at the archer and meet again where the shot lands; the eye reads the arc from the gap between them. The ground line is what collides with walls and bodies; the height decides whether it passes over them. Nothing is hitscan: a target that moves away in time is safe.

**Where the skill is:** in release timing and leading moving targets, not in judging an arc. That suits an isometric view. The cost, accepted: there are no deliberate long high lobs (the arc's height follows the distance, with no key to change it).

## The control

- **Hold the left button to draw**, release to shoot, as the swing is a click (`14`). Holding plays the draw over `drawTime`, then **holds at full draw** as long as the button is held. A release before a minimum draw (0.15) is a dry release: nothing flies.
- **The cursor sets the direction and the full-draw landing point.** The ground point the cursor means is where a **full draw lands exactly**, up to a maximum range (`range`, 22 tiles, about the wide view's width); a cursor beyond it is pulled back along the same line to the maximum. **The cursor is read at chest height** (Claude's addition, `aimLift` about 22 px, tunable): a cursor on a zombie's body is not over its feet on the ground plane (it would read two or three tiles behind it, so aiming at a zombie would miss it), so the ground point is the one whose chest the cursor is over, and a cursor on a body targets its feet. The landing marker then lands on the zombie's feet, which is the feedback that it will hit.
- **The draw sets how far along that line the arrow lands.** A partial draw goes the same way and falls short: landing distance `s = L · f(c)`, where `L` is the full-draw distance (the cursor's, capped), `c` the draw (held time over `drawTime`, 0 to 1), and `f` **ramps up quickly at first and slows near full draw** (`f(c) = 1 − (1 − c)²`, tunable). So the last stretch of the range takes the most time, and a held full draw is always exact: timing matters only for quick shots, which is where the precision worry about timing was answered.
- **Release commits the shot.** The landing point, the flight path, and the flight time are all fixed at that moment, from the cursor and the draw as they are then.
- **The aim guide: the UI shows where the current draw will land** (Michael's plan): a small marker on the ground at the landing point for the current draw, running out along the line as the draw grows, with a faint ground line to the full-draw point. Setting `Aim guide: On / Off`, **default Off** since 2026-10-16 (`02`); it covers the bow, a throw, and the cast alike.
- **Facing and movement:** the figure turns to the aim while drawing; walking while drawn is slowed (`drawSpeed` 0.45 for the free draw, `braceMove` 0.2 braced, in `data/combat.json`; Minecraft slows you to a crawl), sprinting cancels the draw. No stamina for drawing.
- **Two hands.** The bow is a `both` item: equipping it takes both hands, so the torch goes to the belt or the bag (a belt torch lights at half, `11`). Light against reach is the night's trade, the same one the shield will pose (question 24).

The numbers below are the `bow` block of `data/combat.json` (`range` 22, `speed` 16, `arcMin` 8, `arcMax` 150, `z0` 30, `hitRadius` 0.5, `aimLift` 22, `wallHeight` 80, `trunkHeight` 40, `propHeight` 50, and the rest; the names are `archery.js`'s tunables), where a change is made (#72); the bow's own `drawTime` 1.4, `braceDrawTime` 0.6, `damage` 38, and `knockback` 0.2 are its item block, and a `thrown` block or a spell's block overrides them for what it launches.

## The flight, as numbers

- **Ground speed:** constant, `speed` (16 tiles/s), so **a longer shot takes longer to arrive** (a full 22-tile shot 1.4 s, a 5-tile one 0.3 s) and leading matters more at range; a zombie crossing the line at 1 tile/s needs about a tile of lead at full range.
- **Height:** with `u` the fraction of the way from the archer to the landing point, `z(u) = z0 · (1 − u) + 4 · H · u · (1 − u)` px above the ground, `H` the **peak height, which scales with the shot's distance** (`H = arcMin + (arcMax − arcMin) · s / range`: a flat 8 px for a hand's-length shot to about 150 px, a tree's height, for the longest). **Claude's tweak, to confirm:** the arrow leaves at the bow's height (`z0`, about 30 px) rather than at zero, so it visibly leaves the bow and not the archer's feet, and comes down to the ground at the landing point where the shadow meets it. Strictly zero at launch is one number (`z0 = 0`).
- **Rotation:** the arrow sprite follows the visible curve on screen: tilting up early in the flight and down near the end (the angle comes from the screen velocity, height included).
- **Shadow:** a flat dark ellipse at the ground point that shrinks and fades with height.
- The flight is stepped at the game's fixed step and is deterministic from the release; `window.__game.archery.shoot(dir, distance, c)` fires one for scripts.

## What an arrow hits (the laws of `14` hold)

**Settled (Michael's lean, Claude agrees, 2026-10-12): hits are checked at landing only.** The arrow is a point on the ground with a picture above it; when it comes down it hurts the body within `hitRadius` of the landing point (the nearest to the point if there are several), and it hurts nothing it flew over on the way, so **you can shoot over the front of a crowd**. If you want the zombie in front of you, put the cursor on it (a short shot is a nearly flat arc); to take the one behind, aim behind and do not draw fully, so the arrow falls shorter. Skill is where the cursor goes, how long the draw is held, and leading a mover (it is checked where the target is when the arrow arrives). *Considered and not taken:* checking the low final stretch or the whole path by height (it makes a front zombie intercept a shot aimed at the one behind, which is the opposite of shooting over a crowd; it is a sweep where this is one event, and a single touchdown is also the easier thing to keep in sync if a second player ever comes). *The cost, accepted:* an arrow can visibly pass through a body mid-flight without hitting it.

The rest:

- **Hits on the dead:** at touchdown, `damageZombie` on the body nearest the landing point within `hitRadius`, with damage scaled by the draw (`damage · (0.4 + 0.6 c)`: Minecraft needs a full draw for full damage), a small knockback along the ground direction, the usual stagger. **A hit tells the dead where you are** (decision 3). No piercing. The hit radius is tunable (start at a body's `radius` 0.3 plus 0.2, so 0.5): too small feels unfair, too large makes leading a moving target not matter.
- **Walls, doors, shutters, boards:** the ground path needs a line-of-flight check or arrows pass through walls (`map.wallBetween` on the ground step), blocking when the arrow's height there is below the wall's height (80) unless the opening's stack lets it through at that height (an open doorway, an open unboarded window between sill and top). **Tall obstacles block and low ones can be cleared because the arrow is above them:** a high shot clears a wall mid-flight; a close one cannot.
- **Trees:** the trunk (about 40 px) blocks below its height; the canopy does not, so arrows fly through leaves.
- **Props:** a solid prop blocks below its frame's height, to at most `propHeight` (50 px), and a round one (a trunk, a barrel) below `trunkHeight` (40); fences and crates can be cleared, a wall of barrels at a hand's length cannot. A stopped arrow lands at the foot of the obstacle on the near side, and E picks it up.
- **The archer** is never hit by their own arrow; villagers are never hit (`19`).
- **Draw order:** an arrow and its shadow sort by their **ground position**, not where they appear on screen, as the figures do, so a high arrow is drawn over what it flies above and behind what is in front of its ground point.

**The one exception is the fireball** (`24`): it flies flat at 26 px and **bursts on the first of the dead it touches on the way**, and otherwise hits within a tile of where it lands (`contact` and `landRadius` in the spell's block), never through a wall; everything else that flies here hits at landing alone.

## Decisions (Michael, 2026-10-12)

**Settled:**

1. **Aiming (revised by Michael's plan, which replaces the first answer, direction-only):** the cursor sets the direction **and** the full-draw landing point (capped at the maximum range); the draw time sets how far along that line the arrow lands, quickly at first and slowing near full; the shot is fixed at release. *Claude's note:* this is the hybrid recommended before the first answer, and it answers the precision worry (a held full draw is always exact).
2. **Arrows are picked up with E**, like everything else (not by walking over them).
3. **A hit tells the dead where you are**, as a melee blow does when they hunt at all.
4. **The bow takes both hands**; the torch goes to the belt or the bag while it is held (a belt torch still glows at half).
5. **No stamina to draw or hold; the player walks at half speed while drawn**; sprinting cancels the draw.
6. **Arrows that hit the dead stay in them** and come out in their loot when they are killed and searched (revised by Michael, 2026-10-12, replacing the break chance); arrows that miss, or hit a wall or a tree, always survive and drop where they land.
7. **The arc is automatic by distance, with no lob key** (the plan: the arc is visual, its peak height scales with the shot's distance). No deliberate long high lobs, accepted.
8. **The aim guide: the UI shows where the current draw will land** (a marker; a setting, default off since 2026-10-16).

9. **Hits are checked at landing only** (option A; Michael's lean, Claude agrees). Considered: the low final stretch (B) and the whole path by height (C).
10. **The arrow leaves at the bow's height** (about 30 px) and comes down to the ground at the landing point (Michael: "good call"); strictly zero is one number.
11. **The cursor is read at chest height** (`aimLift` about 22 px), so a cursor on a zombie's body targets its feet. Claude's addition, needed under A; tell Claude if it should be otherwise.

**Open:** nothing blocks a build-ready milestone doc.

**Michael's to tune in play, as always:** every number above (`drawTime`, `range`, `speed`, `arcMin`, `arcMax`, the ramp, `hitRadius`, `aimLift`, `drawSpeed`).
