# 21 — The mouse in combat: left, right, and middle

Ruled by Michael on 2026-10-12 (`02-decisions.md`, question 29 and the log entry of that day). This doc is the build plan; the rulings are not reopened here.

## Status

**Steps 1 and 2 built and verified (2026-10-12).** Step 1: the buttons (a hold opens nothing; a tap opens the menu on release; a tap during a draw cancels it and keeps the arrow; the middle button and `Q` both read as `alt`). Step 2: the spear stabs on the left (100 to 70 hp at 1.4 tiles; the left button no longer starts a draw with a spear), throws on the middle button or `Q` (a draw, the hand empty at release), may break (26 of 60 in a test, about the 0.5 set), and `canHold` refuses a stick beside a spear and allows a torch; the bow braces on the held right button (walk 0.2 against the draw's 0.5; a draw 0.6 s long is a full 1.0 braced and 0.67 plain). Steps 3 and 4 are not built.

## The convention

| Input | Role |
|---|---|
| **Left** | the main hand's primary: swing, stab, or (with a bow) the draw |
| **Right, tap** | the actions menu, opened on release at the point pressed (Zomboid's split) |
| **Right, held** | the off hand's role: **block** with a shield, **brace** with a bow, **swing the off-hand weapon** when dual wielding |
| **Middle, or `Q`** | the main hand's other mode: the spear's throw (later a halberd's, a hatchet's) |

- **A tap is a press released within 0.2 s of simulation time** (`buttons.js`; counted in steps, so a scripted test sees what a player sees). The menu opens on the release of a tap, at the press position. A tap while a draw is in progress **cancels the draw** instead and opens nothing.
- **The stance is immediate; only the menu waits.** The guard rises and the brace begins on the press, not after 0.2 s, because a defence that arrives late is no defence. A quick tap with a shield up therefore still opens the menu on release; that is the split's price, and Michael's to judge in play. Swinging an off-hand weapon is the exception: it waits for the hold, or every swing would also open the menu.
- **`Q` is the key twin of the middle button**: a trackpad has no middle button. (`R` is taken by rotating a carried or dragged thing.)
- **While the guard is up, nothing is swung, stabbed, drawn, or thrown.** A draw in progress is cancelled when the guard goes up. Block or attack, not both (Valheim's rule); that is what keeps spear and shield from being the best of everything.

## The weapons

- **Spear** (`hands: "main"`): left is the **stab** (a `weapon` block: reach 1.9, a narrow arc of 40 degrees, damage 30, swing 0.6 s, a push of 0.25, stamina 6); middle or `Q` is the **throw** (the `thrown` block as built, `20`), 114 damage at a full draw, range 6.5. **A thrown spear may break:** `breakChance` 0.5 in its `thrown` block, rolled when it comes down; a broken spear is gone (no floor item, nothing lodged), an unbroken one lies where it fell or lodges in the body as before. A spear can be held with a shield or a torch, **never with another weapon**: `canHold` refuses it (`noDual: true` on the spear; a torch is light, not a weapon, for this rule).
- **Bow** (`hands: "both"`): left is the draw, as built. **Right held is the brace**: the player walks at 0.2 instead of the draw's 0.5, and the draw fills half as fast again (0.9 s becomes 0.6 s, `braceDrawRate` 1.5). Two speeds to master, never one in the middle. A right tap during a draw cancels it without loosing, and the arrow stays in the bag.
- **Shield** (`hands: "off"`, 2 x 2): held right blocks. **A blow from inside the guard's arc (150 degrees, centred on the aim) does 15 percent of its damage, costs 4 stamina, and staggers the attacker for 0.5 s**; from behind or the side, or with no stamina left (the guard is broken), it lands in full. Walking while guarded is at 0.75. The shield competes with the torch for the off hand, which is the point of it.
- **Dual wielding** (a weapon in each hand, torch included): the off hand swings on right held, repeating on its own cooldown while the button stays down, with its own stats and stamina. A rough first pass: the swing plays the main arm's animation (the off arm's swing is art work). Michael may still move both blows to the left button if the right feels clunky; the code keeps the off-hand swing a function of "a button was held" so that is a one-line change.

## Build order

1. **The buttons.** `input.js` learns the middle button and the right button's release and position; `buttons.js` turns the three into `primary`, `alt`, and `off` states each step (tap, hold, held time). The right tap opens the menu on release, or cancels a draw. `Q` twins the middle button. Nothing new to hold yet: the menu still opens, a beat later.
2. **The spear's two modes and the bow's brace.** The throw's draw starts from `alt`, the bow's from the left; the stab is the left click on a spear; the throw's break chance; `canHold`'s dual rule; the brace; one place computes `player.moveMult`.
3. **The shield and the guard.** The item, its held art, `player.blocking`, the guard in the `playerHit` handler.
4. **The off-hand swing.**

## Numbers that are Claude's picks, all tunable

Tap 0.2 s; stab 1.9 / 40 / 30 / 0.6 / 6; spear break 0.5; brace move 0.2, brace draw 1.5x; guard arc 150, 15 percent through, 4 stamina a block, 0.5 s stagger, walk 0.75.

## Not here

A raised-guard pose and a thrust pose (the stab reuses the swing, the guard just holds the shield at the hand), sounds, a shield that breaks, a block timing window (a parry), hit feedback on a block, armour.
