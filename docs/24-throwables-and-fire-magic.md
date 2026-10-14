# 24 — Throwing knives and axes, and the fireball (a spec in summary)

**Art arrived 2026-10-12, round 2 complete (`data/art/items/`, both versions of every item): the book, staff, knife, and axe are in the game as holdable items with icons (art only: they do nothing yet); the fireball sheet is stored and unused. See `02`.** **Status: a summary of what it would take, written at Michael's request on 2026-10-12. Not built, nothing ruled. Both ride on the projectile system of `20` (the ground line is the real path, the arc is art, the hit is checked at landing, obstacles are scanned once at release) and the thrown-item path the spear opened.**

**Status, 2026-10-13: still not built, and the five questions below are still open.** What changed since it was written: the four items are rows in `data/items.json` as drawn art (`held.mode` `rotate`, `angles`, and `fixed`, with icons), not the generated `HELD_SHAPES` this summary assumed, with no `thrown`, `weapon`, or spell block and no durability number yet; the staff's and the book's poses and their draw are now `32`, item 3 (a `cast` block on the item, drawn like the bow, where this doc says a `spell` block), and the book's hold in front of the body is `32`'s present pose (item 1). Multiplayer is live: a guest's draw and release are already resolved on the host (tier 2 of `31`), so a throw or a cast needs no path of its own; the notes below say what else a guest needs.

## 1. Throwing knives and throwing axes (stacks of up to 100)

**What they are.** Two items, `throwing_knife` and `throwing_axe`, `stack: 100`, 1 x 1 in the grid, with a `thrown` block like the spear's and **no melee block** (so the left button throws them: a pure throwable's primary mode is the throw; the spear, which also stabs, keeps the throw on the middle button).

| | range | speed | draw | damage at full draw | push | notes |
|---|---|---|---|---|---|---|
| knife | 13 tiles | 22 (fast) | 0.20 s | 24 | 0.15 | light, flat flight, a small break chance |
| axe | 9 tiles | 13 (slower) | 0.45 s | 55 | 0.35 | heavier, a short arc, staggers (`staggerChance` 1, no interrupt) |

For comparison: an arrow is 38 at 22 tiles, the spear 114 at 6.5, the hatchet swung 30. Everything is a first guess in `data/items.json`.

**How they work, with what exists.** The draw, the cursor read, the aim guide, half-speed walking while drawn, `Esc`/panel/sprint cancel, the right-tap cancel, landing-only hits by `hitRadius`, the obstacle scan, lodging in a body, and picking up what lands are all the spear's, unchanged. **Three things are new:**

1. **A throw takes one from the stack.** The spear leaves the hand whole; a stack in the hand loses one per throw (`count - 1`) and the hand empties only when the count reaches zero. So `releaseDraw` learns "one of a stack" (copy the entry with `count: 1`, decrement the held one). The held art shows the stack as one knife or axe.
2. **They spin.** A projectile sheet per kind with spin frames (4 to 8 rotations of the blade, drawn from the one picture) played along the flight; the landed picture is the blade lying at the landing angle, as the arrow's is.
3. **Landing and pickup of many.** A throw that misses drops one item (`count: 1`, at the point, with its angle); a hit lodges it in the body (it comes out in the loot, as arrows do, stacking). With a hundred to throw, picking them up one `E` at a time is the thing that will annoy: **E on the pile takes every throwable of that kind on the tile and its neighbours** (a small change in `interact.js`), and a break chance (knife 10 percent, axe 5 percent, in `thrown.breakChance`, the spear's field) is what stops a stack being infinite. For a guest: the stack's count changes on the host's copy of the hand and reaches the guest in its player's record; the sweep is an `E` key event performed in the host's step (`interact.keyEvents`), each floor entry taken by its uid; the landed knives are floor entries, so they travel in the touched chunks.

**Left button for a pure throwable** means `launcherOf` returns `button: "primary"` when the item has no `weapon` block and `"alt"` when it has one. **Dual wielding** them (a knife in each hand, left click throws main then off) is the same left-click alternation as melee and falls out almost free, with the exposure rule (an off-hand action) applying; not planned, noted.

**Art:** knife (a short blade, dark handle) and axe (a head and a short haft) as held shapes (`HELD_SHAPES`, 32 px), as projectile sheets (`generateKnife`, `generateAxe` in `archery.js`, like `generateSpear`), and as 1 x 1 grid icons by colour (already how items without art show).

**Size of the work:** small to medium. The stack handling in `releaseDraw`, the `button` rule, two item entries, two generated sheets, the spin in `arrowDrawables`, the pickup sweep.

## 2. Fire magic: the staff and the book

**The two items.** `staff_of_fire`: a brown staff with a red orb at the top (a held shape in the staff's long-pole manner, 1 x 4 or 1 x 5 in the grid, one-handed or two-handed: Q below). `book_of_fire`: an open book held with the pages facing up, parchment pages and a brown leather binding (a held shape that is flat in the palm, not a pole, so it needs its own hold pose: the hand carries it in front, palm up; a small rig change, `12`). **What they do (my reading of "staff allows one spell"):** a **`spell`** block on the item names a spell (`fireball`), a cost, and a cast time; the staff casts it on the left button. **What the book is for is Michael's call** (Q1).

**The fireball, in the thrown-item machinery.** "Works basically exactly like a massive throwing axe": the same draw (hold to aim, release to cast; the cast time is the draw time, 0.4 s), the same cursor and aim guide, the ground line and its shadow are the real path, hits are decided at landing, `trunkHeight`, walls, and doors stop it as they stop anything flat.

- **No arc, as asked: the flight is flat** (`arcMin = arcMax = 0`, a constant height of about 24 px, chest height, so it is stopped by anything above that: trunks, walls, props, the shut door; it passes through an open door and over a low prop, and unlike the arrow **it cannot be lobbed over a wall**: a real tactical difference between the bow and the staff).
- **The picture: a flat comet.** A generated sheet in 16 directions: a bright core (white-yellow), an orange body, a red-orange tail of fading pixels along the line behind it, three frames of flicker; no spin. **It lights the ground as it goes**: a moving light, the way a burning character is one (`light.setBurners`, `fire.js`), so at night the comet's path is lit and the shadow under it reads. A guest has no flight of its own, only the arrows in flight the frame carries (`arrows`: position, height, frame, projectile), so it makes the comet's light from those, as it makes a burning character's from the burning flag.
- **Damage: big, not a one-shot.** 70 at a full draw on a 100-hp dead one (two casts; the same `0.4 + 0.6 c` scale: a half draw is 49), a push of 0.4, always staggers. **Stamina or mana?** Q2.
- **The landing: a burst.** Flame, ember, and smoke particles at the landing point (`fire.js` has them), and **optionally the dead one hit is set on fire as a visual only** (the burning mock-up exists; real burning is later, `05`). The particles are made in the host's step, so a guest sees the burst only if the frame carries the landing (a point and a kind, as the pokes carry a sway): the flames of a burning body were missed that way until the playtest of 2026-10-13 (`02`); the burning flag already rides to guests.
- **Damage type, for someday:** the projectile carries `type: "fire"` (and later `ignoresArmor`), so "shrink the damage and have it ignore armor" is a field when armour exists, not a refactor.

**Lock-on or not (Michael's debate).** Options, in order of how much they change the system:

1. **None, the staff is a skill shot like the bow.** The simplest, and it keeps the skill Michael loved; the fireball's difference is the flat flight, the light, and the damage.
2. **Aim magnetism at release (my recommendation).** At the moment of release, if a living dead one lies within a small distance of the aim line inside the range (say 0.8 tiles off the line, nearest the line), the landing point snaps to it. The flight stays a straight, fixed line (the shadow is still the real path, no steering, no new collision logic), it is still the player's aim that chooses, and the spell is more forgiving than the bow, which is the "magic feels different" part.
3. **True homing.** The ball steers toward the nearest living target as it flies (a turn rate), so its path is not fixed at release: the shadow can no longer be the promise, the landing-only rule gives way to per-step collision, and the aim guide cannot show where it will land. It feels most like magic and breaks the most rules. Not recommended for the first build; it is a later "spell variant" if wanted (a homing staff, a book that homes).
4. **Click-to-lock** a zombie as the target: the aim becomes a selection; again a new input, and a mouse-hover state to draw.

**Cost and limits.** A spell without a cost is the bow without arrows. Options: **a cooldown only** (2.5 s, shown on a swing-style bar, the third in the stack of bars); **stamina** as a stand-in (a cast costs 40, the orange bar); **mana** (a new blue bar, the colour is reserved; regenerating slowly, restored by a potion or a rest). Recommendation: a cooldown and a stamina cost to start (no new bar), mana when there is a second spell, because a bar is only worth building for a system.

**Art:** the staff and the book as held shapes (the book needs the palm-up hold), the comet sheet, the impact particles (reused), the two grid icons; all generated placeholders first.

**Size of the work:** medium. A `spell` launcher kind beside `bow` and `thrown` in `launcherOf` and `releaseDraw`; a flat flight and a comet drawable in `arrowDrawables`; a moving light; the burst; the magnetism at release (small); two items; the book's hold pose (the one piece outside the projectile code).

## Questions for Michael

- **Q1.** What is the book of fire for? (a) It casts the same fireball one-handed (a weaker one, so a shield can go beside it: staff two-handed, book one-handed); (b) it is an off-hand focus that makes the staff's fireball stronger or cheaper when both are held; (c) it casts a different spell (a flame wave, a small fire that burns on the ground) and the staff stays the fireball; (d) it is a decoration for now.
- **Q2.** Cost: cooldown, stamina, or mana now? And is the staff one-handed or two-handed (two-handed leaves no shield: the glass-cannon wizard)?
- **Q3.** Lock-on: none, magnetism, homing, or click-to-lock? (I recommend magnetism.)
- **Q4.** Does the fireball burst hit an area (a radius of about 1 tile, falling off from the centre) or only the one it lands on? An area is the crowd tool and is the "easy button" multi-hit was; a single target keeps it like the axe.
- **Q5.** Throwables: should they land as separate floor items you sweep up with `E`, or should a thrown knife that misses simply return to the stack when you walk over it (like picking up gold)?

## Build order, as steps

1. **Stacks and the left-button throw**: `releaseDraw` for a stack, the `button` rule, the knife and axe items, their sheets, the spin, the pickup sweep. Verified: a stack of 100 loses one per throw, lands, picks up.
2. **The spell kind and the fireball**: the launcher kind, the flat flight and the comet, the light, the burst, the cost; the staff item and its held art. Verified: a cast kills in two on a still dead one, is stopped by a trunk and a wall, passes an open door.
3. **Magnetism**, if chosen; **the book**, once its role (Q1) is settled, with the palm-up hold pose.
