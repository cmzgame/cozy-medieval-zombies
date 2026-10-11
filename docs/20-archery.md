# 20 — The bow and arrow: a rough scope for the feel

**A rough scope, not yet for implementation** (Michael and Claude, 2026-10-12). It answers question 25 in `02`: how a bow should feel here, and how an arc works in an isometric world. The art (the bow, the arrow, the draw pose) is a later conversation; the feel is the hard part and Michael is picky about it. When this is approved it becomes a milestone doc in the usual form.

## The gold standard, in Michael's words

Minecraft's bow. A clear draw and release; the best arcing in any game, not realistic but **the platonic bow**: high arcs possible, long distances, **highly accurate if the same motion is repeated**, so that with practice you can snipe across the map; a flight time fast enough to hit where you meant but **not hitscan**, so you sometimes lead; arcs **from nearly flat to high**; arrows that **stay where they land** and come back to you when you walk over them, and getting them back matters. Sounds later.

## The one idea that makes an arc work in isometric

An arrow has two motions that never mix: **where it is on the ground**, and **how high it is**. On the ground it flies in a straight line from the archer toward the aim at a steady speed, exactly like a thing walking very fast. Its height follows a parabola. On screen the arrow is drawn at its ground point's screen position **lifted by its height in pixels**, and **a small shadow is drawn at the ground point**. The shadow is what makes the arc readable in 2D: the eye sees the arrow rise away from its shadow and come back down to meet it. Every isometric game with grenades does this; it costs one subtraction. The ground line is what collides with walls and bodies; the height decides whether it passes over them.

So "flat to high" is simply: **a short draw gives a low, quick, short arc; a full draw gives a long, high one.** Both the range and the apex grow with the draw, the apex faster, so a full-draw arrow clears a wall or a crowd mid-flight and comes down on what is behind.

## The control: hold to draw, the cursor is the direction, the draw is the distance

- **Hold the left button to draw**, release to shoot, as the swing is a click (`14`). Holding plays the draw over `drawTime` (0.6 s) and then **holds at full draw** for as long as the button is held; a release before a minimum draw (0.15) is a dry release, nothing flies.
- **The cursor gives the direction only.** The arrow flies along the line from the archer through the cursor. **How far it flies is the draw**: a quarter draw lobs a few tiles, a full draw reaches `range` (22 tiles, about the wide view's width). The cursor's distance is deliberately ignored, as a bow ignores it: you aim, and you learn how much to draw. This is the thing that makes "the same motion hits the same spot" true and gives the practice something to learn. **Default; the alternative** (the cursor's distance sets the landing point and the draw only sets power) is point-and-click with a delay, and Michael can ask for it after playing this.
- **An aim guide, as Swing targets is** (`14`): while drawing, a small marker on the ground at where the arrow would land, running outward as the draw grows, and the faint ground line to it. Setting `Aim guide: Off / Landing point / Full arc` (the full arc draws the parabola's shadow line and the arc as dots). **Default: Landing point** for the first play, so the draw-is-distance idea teaches itself; Michael turns it off once his hands know it, as Minecraft gives nothing.
- **Facing and movement:** the figure turns to the aim while drawing; walking while drawn is allowed at half speed (`drawSpeed` 0.5; Minecraft slows you to a crawl), sprinting cancels the draw. No stamina for drawing in the first cut; a tunable `drawStamina` per second of hold is there for later.
- **Two hands.** The bow is a `both` item: equipping it takes both hands, so the torch goes to the belt or the bag (a belt torch lights at half, `11`). Light against reach is the night's trade, the same one the shield will pose (question 24).

## The arc, as numbers

Draw `c` in [0, 1] = time held / `drawTime`, clamped. From it:

- **Range** `R(c) = rangeMin + (range − rangeMin) · c` (3 to 22 tiles).
- **Apex** `H(c) = arcMin + (arcMax − arcMin) · c²` (10 to 150 px above the ground; 150 is about a tree's height, 80 is a wall).
- **Ground speed** `speed` constant, 16 tiles/s, so a full shot takes about 1.4 s to the far end and a short lob 0.2 s, and a zombie walking across the line at 1 tile/s needs a lead of about a tile at range. (Minecraft's speed is fixed at full draw too; distance comes from the pitch, which the draw stands in for here.)
- **Height along the flight:** with `u = s / R` for ground distance `s`, `z(u) = z0 · (1 − u) + 4 · H · u · (1 − u)`, launched from chest height `z0` (36 px), landing at 0. Not Newton, a parabola by design: every shot with the same `c` and direction flies the same path, to the pixel.
- The flight is stepped at the game's fixed step and is deterministic given the release; `window.__game.archery.shoot(dir, c)` fires one for scripts.

## What an arrow hits, and how it is decided (the laws of `14` hold)

The ground line is walked tile by tile each step, and at each sample the arrow's height says what it can touch:

- **The dead:** hit when the ground point passes within `radius + 0.1` of a zombie and `z` is between its feet and its body's top (the `BODY_SAMPLES` of `combat.js` already name those heights; a fallen one is 14 px tall). The hit is `damageZombie` with the arrow's damage scaled by the draw (`damage · (0.4 + 0.6 c)`, Minecraft needs full draw for full damage), a small knockback along the ground direction, the usual stagger. **A hit tells the dead where you are**: `aggro`, `lastSeen` = the launch point. Default; Michael may prefer that a silent arrow leaves them searching where they stand.
- **Walls, doors, shutters, boards:** `map.wallBetween` on the ground step, blocking when `z` is below the wall's height (80) unless the opening's stack lets it through at that height (an open doorway, an open unboarded window between its sill and its top). An arrow above a wall flies over it: **you can shoot over your own palisade from inside, and the dead on the other side are hit.**
- **Trees:** the trunk's collision circle blocks below the trunk's height (about 40 px); the canopy does not. Arrows fly through leaves. Default.
- **Props:** solid props block below their frame's height. Later; the first cut passes through them.
- **The archer** is never hit by their own arrow; villagers are never hit (`19`, swings pass through the living).
- Nothing is hitscan, nothing is rolled: the arrow is where it is drawn, and it hits what it is drawn hitting.

## Arrows are items, and they come back

- `arrow` is a stackable item (`count`), 1 × 2 in the grid, in the bag or on the belt; the quiver as a worn slot is `05-someday`. The bow needs an arrow somewhere on you; drawing with none shows the prompt "No arrows" and does not draw.
- **An arrow that lands sticks in the ground where it fell**, drawn as a small angled sprite in the floor-item layer, and is an ordinary floor item (`map.itemsAt`), so E picks it up like anything else. **Walking over one picks it up on its own**, arrows only, with a setting `Arrows: walk over to take / E to take`, default walk-over, which is the Minecraft delight Michael named. Default; it is the one departure from "everything is E", made because arrows are the player's own.
- **An arrow that hits the dead** breaks with `breakChance` (0.5) or drops at their feet; one that hits a wall or a tree drops at its foot (sticking in the wall is a later picture). Arrows never despawn in the first cut (they are floor items, cheap and few); a cap is a tunable if a field of them ever bothers Michael.
- Crafting arrows (a stick, a feather, a flint) is a later conversation; the dev bag carries thirty.

## The rig and the art (later, but what they need)

- A **`bow` pose style** in `data/poses.json` beside `one_handed` and `zombie`: three keyframes for the draw (the bow arm straight toward the aim, the string hand coming back to the cheek), held at the last; a two-frame release. The figure faces the aim in eight facings as it does for the swing.
- **Held art:** the bow at the main hand's angle (a curve with a string, in the sixteen held angles the pipeline already makes), the nocked arrow at the off hand while drawn. The **flying arrow** is its own sixteen-angle sheet; the angle comes from the screen velocity, height included, so it tilts up while rising and down while falling. The **shadow** is a flat dark ellipse that shrinks and fades with height. The **stuck arrow** on the ground is one small angled sprite. All generated first, as everything was.
- Sounds: the draw creak, the release thrum, the hit thud, the arrow sticking. Later, with every other sound.

## What it touches

`src/archery.js` (the draw state, the arc, the arrows in flight, the hit walk, the pickup), `main.js` (the left button held and released when the bow is in hand; the arrows' update), `render.js` (arrow and shadow drawables in the depth sort by the ground point; the guide), `combat.js` (`damageZombie` reused; `markTargets` unchanged), `figure.js` and `data/poses.json` (the bow style, the held shapes), `items.json` (`bow` with `{ drawTime, range, rangeMin, speed, arcMin, arcMax, damage, knockback, breakChance, style: "bow" }`, `arrow`), `settings.js` (Aim guide, Arrows), `entities/player.js` (the half-speed draw, the `both` hands rule), `map.js` (`wallBetween` gains a height, or the caller reads the opening's stack).

## Rough build order

1. The arc on its own: `archery.js` with `shoot(dir, c)` from the console, arrows drawn with shadows, landing as floor items; the guide. Michael watches arrows fly and tunes speed, range, apex until it feels like the thing.
2. The draw: hold and release on the bow, the pose, the half-speed walk, the facing; arrows as items that are consumed and picked up.
3. Hits: the dead, walls and openings by height, trees; damage by draw; the dead's reaction.
4. Sounds and art, when they arrive.

## Decisions for Michael

1. **The cursor is direction only; the draw is distance** (default) versus the cursor's distance as the landing point.
2. **Aim guide default:** Landing point (default) versus Off, Minecraft's way.
3. **A hit tells the dead where you are** (default) versus a silent arrow.
4. **Walk-over pickup for arrows** (default) versus E like everything else.
5. **No stamina to draw or hold** in the first cut.
6. The numbers above, all of which are his to tune in play.
