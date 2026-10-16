# 14 — Milestone 8: melee, the swing, and the art of it

**Status, 2026-10-16: built; the current state of combat is `21`, the rulings `02`, the numbers `data/items.json` (each weapon's block), `data/combat.json`, and `data/tuning.json`.** This page keeps the two rules of the swing that `21` leans on: legibility, and the swing-target outline. What `21` does not restate: weapons wear by kills (`kills` on each block, `combat.wearWeapon`; a miss costs nothing, a worn-out weapon leaves the hand with a word); the cooldowns and the combo window are on each player and read the sim's clock; a guest's swing and shove resolve on the host through the same controller (`02`, 2026-10-13); hit-stop is refused on the wire, the screen kick is an event (`kicked`) answered by the striking client's camera, and `effects()` gives only the freeze; the hatchet, mace, sword, stick, plank, and torch go in either hand, the spear in the main hand, the halberd in both. The scope of 2026-10-11, its weapons table, its build order, its acceptance, and the as-built notes are `history/14-combat-build.md`.

## Legibility, the rule

Michael's test (2026-10-11): never a swing whose animation visibly clips a zombie with no hit. Three things make that hold, and the implementer treats them as one rule:

1. **The shape that is drawn is the shape that is tested.** The wedge on the floor is the hit test, in grid space, with nothing else deciding.
2. **The body is hit, not the feet.** A zombie whose sprite overlaps the wedge is in it, because the samples run up its body and the down-screen slack covers the case where its feet are a tile away but its head is on your legs.
3. **The swing is never lost.** It resolves on the click; the arm's animation is a picture of a decision already made, about eighty milliseconds behind, which play cannot see.

**The wedge is no longer drawn (Michael, 2026-10-12):** neither the flash after a swing nor under Show hit shapes, since the Swing targets outline already shows what the next swing reaches; it is still the hit test, so rule 1 holds through the outline. A **Show hit shapes** setting (off by default, beside the debug corner) marks each zombie's body samples as dots, green for those the next swing reaches, so a miss can be read on screen rather than argued about. It is the first thing to turn on when a hit feels wrong.

## Swing targets (the outline)

Michael, 2026-10-11, after reading how Zomboid's aim outline works (a per-zombie outline in its Display options, green when a zombie is in melee reach; players report it signals range and does not always guarantee a hit): ours is **deterministic**. A zombie gets a one-pixel green outline when the next swing would hit it, by the very test `tryAttack` uses (`combat.swingTargets` and `targetsIn`), so **green means the swing lands**; a swing that misses a green zombie would be a bug. It does **not** consider the swing's cooldown, so it does not flicker; it follows the aim every step; with multi-hit off only the nearest is outlined. It shows whenever the player could swing (not carrying, climbing, or dead), with fists too, and is for testing and for play alike.

- **Setting:** Swing targets, off by default, on the settings screen. Show hit shapes (the wedge and the body samples) stays the debug view; this is the player-facing one.
- **Drawing:** eight copies of the sprite, one pixel out, flat green (`FLAG_SOLID`, a shader flag that draws a quad in its colour with the sprite's shape), just behind the figure, unlit and unfogged so it reads at night. A zombie hidden behind a canopy has its outline hidden with it.
- **Cost:** one wedge test per zombie within reach each step.
