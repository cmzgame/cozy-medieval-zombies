# 20 — The bow and arrow: a rough scope for the feel

**A rough scope, not yet for implementation** (Michael and Claude, 2026-10-12; decisions being settled the same day, see the end). It answers question 25 in `02`: how a bow should feel here, and how an arc works in an isometric world. The art (the bow, the arrow, the draw pose) is a later conversation; the feel is the hard part and Michael is picky about it. When this is approved it becomes a milestone doc in the usual form.

## The gold standard, in Michael's words

Minecraft's bow. A clear draw and release; the best arcing in any game, not realistic but **the platonic bow**: high arcs possible, long distances, **highly accurate if the same motion is repeated**, so that with practice you can snipe across the map; a flight time fast enough to hit where you meant but **not hitscan**, so you sometimes lead; arcs **from nearly flat to high**; arrows that **stay where they land** and can be taken back (by E here, not by walking over them), and getting them back matters. Sounds later.

## The one idea that makes an arc work in isometric

**The outcome of a shot is fixed at the instant of release** (Michael's plan, 2026-10-12). The arrow is really **a point moving in a straight line along the ground**, at a steady speed, from the archer to a landing point. The arc is only visual: the arrow is drawn above that point, lifted by a height that follows a simple parabola (zero at launch, highest at the midpoint, zero at landing), and **a small shadow is drawn at the ground point**. The arrow and its shadow start together at the archer and meet again where the shot lands; the eye reads the arc from the gap between them. The ground line is what collides with walls and bodies; the height decides whether it passes over them. Nothing is hitscan: a target that moves away in time is safe.

**Where the skill is:** in release timing and leading moving targets, not in judging an arc. That suits an isometric view. The cost, accepted: there are no deliberate long high lobs (the arc's height follows the distance, with no key to change it).

## The control

- **Hold the left button to draw**, release to shoot, as the swing is a click (`14`). Holding plays the draw over `drawTime`, then **holds at full draw** as long as the button is held. A release before a minimum draw (0.15) is a dry release: nothing flies.
- **The cursor sets the direction and the full-draw landing point.** The ground point under the cursor is where a **full draw lands exactly**, up to a maximum range (`range`, 22 tiles, about the wide view's width); a cursor beyond it is pulled back along the same line to the maximum.
- **The draw sets how far along that line the arrow lands.** A partial draw goes the same way and falls short: landing distance `s = L · f(c)`, where `L` is the full-draw distance (the cursor's, capped), `c` the draw (held time over `drawTime`, 0 to 1), and `f` **ramps up quickly at first and slows near full draw** (`f(c) = 1 − (1 − c)²`, tunable). So the last stretch of the range takes the most time, and a held full draw is always exact: timing matters only for quick shots, which is where the precision worry about timing was answered.
- **Release commits the shot.** The landing point, the flight path, and the flight time are all fixed at that moment, from the cursor and the draw as they are then.
- **The aim guide: the UI shows where the current draw will land** (Michael's plan): a small marker on the ground at the landing point for the current draw, running out along the line as the draw grows, with a faint ground line to the full-draw point. Setting `Aim guide: On / Off`, **default On**; Michael turns it off once his hands know it, as Minecraft gives nothing.
- **Facing and movement:** the figure turns to the aim while drawing; walking while drawn is at half speed (`drawSpeed` 0.5; Minecraft slows you to a crawl), sprinting cancels the draw. No stamina for drawing in the first cut; a tunable `drawStamina` per second of hold is there for later.
- **Two hands.** The bow is a `both` item: equipping it takes both hands, so the torch goes to the belt or the bag (a belt torch lights at half, `11`). Light against reach is the night's trade, the same one the shield will pose (question 24).

## The flight, as numbers

- **Ground speed:** constant, `speed` (16 tiles/s), so **a longer shot takes longer to arrive** (a full 22-tile shot 1.4 s, a 5-tile one 0.3 s) and leading matters more at range; a zombie crossing the line at 1 tile/s needs about a tile of lead at full range.
- **Height:** with `u` the fraction of the way from the archer to the landing point, `z(u) = z0 · (1 − u) + 4 · H · u · (1 − u)` px above the ground, `H` the **peak height, which scales with the shot's distance** (`H = arcMin + (arcMax − arcMin) · s / range`: a flat 8 px for a hand's-length shot to about 150 px, a tree's height, for the longest). **Claude's tweak, to confirm:** the arrow leaves at the bow's height (`z0`, about 30 px) rather than at zero, so it visibly leaves the bow and not the archer's feet, and comes down to the ground at the landing point where the shadow meets it. Strictly zero at launch is one number (`z0 = 0`).
- **Rotation:** the arrow sprite follows the visible curve on screen: tilting up early in the flight and down near the end (the angle comes from the screen velocity, height included).
- **Shadow:** a flat dark ellipse at the ground point that shrinks and fades with height.
- The flight is stepped at the game's fixed step and is deterministic from the release; `window.__game.archery.shoot(dir, distance, c)` fires one for scripts.

## What an arrow hits (the laws of `14` hold)

**Open decision (Michael, 2026-10-12):** *where along the flight is a body checked?* His plan names it: if hits are checked only at landing, arrows fly over close enemies on the way to a far target, which lets a player shoot over the front of a crowd but can feel wrong when an enemy is right in front of the archer. The options:

- **A. Landing only.** The arrow hurts whatever is at the landing point (within `hitRadius` of it, sized to a body's footprint) and nothing it passes. Simplest and most readable; you hit what you aimed at, and only that.
- **B. Landing plus the low final stretch.** As A, and a body the arrow passes through while it is low on the way down is hit too.
- **C. The whole path, by height** (Claude's recommendation). The arrow hits the first body it passes through whose body spans its height at that point, and anything at the landing point. Because it leaves at the bow's height, **a body right in front of the archer is hit** (a close shot's arc is low, so it stays below head height the whole way); because the arc rises with distance, **a far shot flies over the front of a crowd** and comes down on what is aimed at; and a body under the descent near the landing point is hit. It is the geometry of the picture: the arrow hits what it is drawn touching.

Whichever is chosen, the rest holds:

- **Hits on the dead:** `damageZombie` with damage scaled by the draw (`damage · (0.4 + 0.6 c)`: Minecraft needs a full draw for full damage), a small knockback along the ground direction, the usual stagger. **A hit tells the dead where you are** (decision 3). The arrow stops at the first hit (no piercing). The hit radius is tunable (start at a body's `radius` 0.3 plus 0.1): too small feels unfair, too large makes leading a moving target not matter.
- **Walls, doors, shutters, boards:** the ground path needs a line-of-flight check or arrows pass through walls (`map.wallBetween` on the ground step), blocking when the arrow's height there is below the wall's height (80) unless the opening's stack lets it through at that height (an open doorway, an open unboarded window between sill and top). **Tall obstacles block and low ones can be cleared because the arrow is above them:** a high shot clears a wall mid-flight; a close one cannot.
- **Trees:** the trunk (about 40 px) blocks below its height; the canopy does not, so arrows fly through leaves.
- **Props:** solid props block below their frame's height (fences and crates can be cleared; a wall of barrels at a hand's length cannot). Later; the first cut passes through them.
- **The archer** is never hit by their own arrow; villagers are never hit (`19`).
- **Draw order:** an arrow and its shadow sort by their **ground position**, not where they appear on screen, as the figures do, so a high arrow is drawn over what it flies above and behind what is in front of its ground point.

## Arrows are items, and they come back

- `arrow` is a stackable item (`count`), 1 × 2 in the grid, in the bag or on the belt; the quiver as a worn slot is `05-someday`. The bow needs an arrow somewhere on you; drawing with none shows the prompt "No arrows" and does not draw.
- **An arrow that lands sticks in the ground where it fell**, drawn as a small angled sprite in the floor-item layer, and is an ordinary floor item (`map.itemsAt`), so E picks it up like anything else. **E picks it up, like everything else** (Michael, 2026-10-12; the walk-over pickup in the first draft is struck). Getting arrows back is a deliberate act, which is part of what makes it matter.
- **An arrow that hits the dead** breaks with `breakChance` (0.5) or drops at their feet; one that hits a wall or a tree drops at its foot (sticking in the wall is a later picture). Arrows never despawn in the first cut (they are floor items, cheap and few); a cap is a tunable if a field of them ever bothers Michael.
- Crafting arrows (a stick, a feather, a flint) is a later conversation; the dev bag carries thirty.

## The rig and the art (later, but what they need)

- A **`bow` pose style** in `data/poses.json` beside `one_handed` and `zombie`: three keyframes for the draw (the bow arm straight toward the aim, the string hand coming back to the cheek), held at the last; a two-frame release. The figure faces the aim in eight facings as it does for the swing.
- **Held art:** the bow at the main hand's angle (a curve with a string, in the sixteen held angles the pipeline already makes), the nocked arrow at the off hand while drawn. The **flying arrow** is its own sixteen-angle sheet; the angle comes from the screen velocity, height included, so it tilts up while rising and down while falling. The **shadow** is a flat dark ellipse that shrinks and fades with height. The **stuck arrow** on the ground is one small angled sprite. All generated first, as everything was.
- Sounds: the draw creak, the release thrum, the hit thud, the arrow sticking. Later, with every other sound.

## What it touches

`src/archery.js` (the draw state, the arc, the arrows in flight, the hit walk, the pickup), `main.js` (the left button held and released when the bow is in hand; the arrows' update), `render.js` (arrow and shadow drawables in the depth sort by the ground point; the guide), `combat.js` (`damageZombie` reused; `markTargets` unchanged), `figure.js` and `data/poses.json` (the bow style, the held shapes), `items.json` (`bow` with `{ drawTime, range, rangeMin, speed, arcMin, arcMax, damage, knockback, breakChance, style: "bow" }`, `arrow`), `settings.js` (Aim guide, Arrows), `entities/player.js` (the half-speed draw, the `both` hands rule), `map.js` (`wallBetween` gains a height, or the caller reads the opening's stack).

## Rough build order

1. The arc on its own: `archery.js` with `shoot(dir, distance, c)` from the console, arrows drawn with shadows, landing as floor items; the landing marker. Michael watches arrows fly and tunes speed, range, apex until it feels like the thing.
2. The draw: hold and release on the bow, the pose, the half-speed walk, the facing; arrows as items that are consumed and picked up.
3. Hits: the dead, walls and openings by height, trees; damage by draw; the dead's reaction.
4. Sounds and art, when they arrive.

## Decisions (Michael, 2026-10-12)

**Settled:**

1. **Aiming (revised by Michael's plan, which replaces the first answer, direction-only):** the cursor sets the direction **and** the full-draw landing point (capped at the maximum range); the draw time sets how far along that line the arrow lands, quickly at first and slowing near full; the shot is fixed at release. *Claude's note:* this is the hybrid recommended before the first answer, and it answers the precision worry (a held full draw is always exact).
2. **Arrows are picked up with E**, like everything else (not by walking over them).
3. **A hit tells the dead where you are**, as a melee blow does when they hunt at all.
4. **The bow takes both hands**; the torch goes to the belt or the bag while it is held (a belt torch still glows at half).
5. **No stamina to draw or hold; the player walks at half speed while drawn**; sprinting cancels the draw.
6. **Arrows that hit the dead break about half the time** (`breakChance` 0.5, else they drop at its feet); arrows that miss, or hit a wall or a tree, always survive and drop where they land.
7. **The arc is automatic by distance, with no lob key** (the plan: the arc is visual, its peak height scales with the shot's distance). No deliberate long high lobs, accepted.
8. **The aim guide: the UI shows where the current draw will land** (a marker; a setting to turn it off, default on).

**Open:**

9. **Where hits are checked along the flight:** A (landing only), B (landing plus the low final stretch), or C (the whole path, by height). Claude recommends C.
10. **Claude's tweak to confirm:** the arrow leaves at the bow's height (about 30 px) rather than at zero, then comes down to the ground at the landing point.

**Michael's to tune in play, as always:** every number above (`drawTime`, `range`, `speed`, `arcMin`, `arcMax`, the ramp, `hitRadius`, `breakChance`, `drawSpeed`).
