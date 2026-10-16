# 24 — Throwing knives and axes, and the fireball (a spec in summary)

**Status, 2026-10-16.** **Built: the fireball** (2026-10-14, Michael's rules, `02`, "The fireball"; retuned on 2026-10-14 and 2026-10-15): a staff (`staff: true`, any staff) and a spellbook (`book.spell`, the Book of Fire's fireball, the only one) held together, in either hand, cast on the left button by the bow's draw and release; the flight is flat at 26 px (no arc: walls, doors, and trunks stop it, and it cannot be lobbed over a wall); it bursts on the first of the dead it touches on the way and hits within a tile where it lands, never through a wall (#11, #12), at 5.25 tiles a second (Michael: "a hair" slower than 5.75, so landing it stays a skill shot), drawn at twice its painted size (a fire bowling ball); it hits as an arrow does (70 at a full draw on the `0.4 + 0.6 c` scale, a push of 0.4, always staggers and interrupts), sets the body it hits alight (#14, `burn.js`, the spell's `ignite`), lights the ground as it goes, and is gone the moment it arrives, nothing landing or lodging; a staff or a book alone refuses with a word and the left button does nothing else. **The numbers are the book's `spell` block in `data/items.json`** (`damage` 70, `range` 18, `speed` 5.25, `contact` 0.6, `landRadius` 1, `drawTime` 0.6, `z0` 26, `knockback` 0.4, and the rest); the staff's and the book's poses and their draw are `32`, item 3 (a `cast` block, drawn like the bow), and the book's hold in front of the body `32`'s present pose (item 1). Michael: "by far the coolest weapon now"; perhaps it is in the demo, and in the full game it waits for the second biome (to rule when the biomes are planned). **Not built: the throw.** No item has a `thrown` block but the spear; the knife and the axe are rows in `data/items.json` as drawn art (`held.mode` `rotate`, with icons; `data/art/items/`, round 2 of 2026-10-12, both versions of every item) with no `thrown`, `weapon`, or spell block and no durability number, so section 1 below is still what it would take. **Open:** Q2 (a cost: nothing yet but the draw and the recovery), Q4 (an area, or the one it lands on), and Q5 (how thrown knives come back), kept below; Q1 and Q3 are answered (the book chooses the spell and both are needed; no lock-on, a skill shot), and the answers, with the first summary's design of the spell and its questions as they stood, are `history/24-throwables-answered.md`. Multiplayer is live: a guest's draw and release are already resolved on the host (tier 2 of `31`), so a throw needs no path of its own; section 1 says what else a guest needs.

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

Built as the status says. Of the summary's design, what still stands to be decided is the burst's reach and the cost:

- **The landing: a burst.** Flame, ember, and smoke particles at the landing point (`fire.js` has them), and ~~optionally the dead one hit is set on fire as a visual only~~ **since #14 (2026-10-15) the body a fireball hits is always set alight, a real burn** (`burn.js`, the spell's `ignite`). The particles are made in the host's step, so a guest sees the burst only if the frame carries the landing (a point and a kind, as the pokes carry a sway): the flames of a burning body were missed that way until the playtest of 2026-10-13 (`02`); the burning flag already rides to guests.

**Cost and limits.** A spell without a cost is the bow without arrows. Options: **a cooldown only** (2.5 s, shown on a swing-style bar, the third in the stack of bars); **stamina** as a stand-in (a cast costs 40, the orange bar); **mana** (a new blue bar, the colour is reserved; regenerating slowly, restored by a potion or a rest). Recommendation: a cooldown and a stamina cost to start (no new bar), mana when there is a second spell, because a bar is only worth building for a system.

## The questions still open

- **Q2.** Cost: cooldown, stamina, or mana now? And is the staff one-handed or two-handed (two-handed leaves no shield: the glass-cannon wizard)?

- **Q4.** Does the fireball burst hit an area (a radius of about 1 tile, falling off from the centre) or only the one it lands on? An area is the crowd tool and is the "easy button" multi-hit was; a single target keeps it like the axe.

- **Q5.** Throwables: should they land as separate floor items you sweep up with `E`, or should a thrown knife that misses simply return to the stack when you walk over it (like picking up gold)?
