// What the mouse and the keys do to the player in a step (docs/21): the guard,
// the bow's draw, the left button's swing or poke, the middle button's other
// mode, the shove, and the walking speed those set. Moved out of main.js on
// 2026-10-12 (docs/23a, D1). It takes the player and a snapshot of the input,
// never the input module, so a second player's snapshot could come from a wire
// (CLAUDE.md, the co-op tiebreaker).

import * as combat from "./combat.js";
import * as archery from "./archery.js";
import * as interact from "./interact.js";

// `s`: { clicked, clickSpent, mouse, leftDown, altPressed, altDown, offDown, space, blocked }
// `predict`: a guest's own player, between the host's frames (net.js; docs/31/04). The guard, the swing's start, the
// halberd's thrust, the walking speed, and the combat clocks run as they will on the host, so the swing and the raised
// shield show at once; what touches anything but the player is the host's alone and skipped: the pokes (main.js makes
// a guest's own), the hit itself (combat.tryAttack's `predict`), the bow's draw and loose, and the shove.
export function controlPlayer(player, zombies, dt, s, predict = false) {
  // The right button held with a shield in the off hand raises the guard (docs/21): you can
  // still swing, stab, or throw from behind it, for much less damage (the shield's `attackMult`).
  // It is not held through carrying. It does hold with the bag open (the world goes on
  // while you look in it, and the bag is where weapons are swapped) and a menu open (a press
  // outside the menu closes it).
  const shield = combat.shieldOf(player);
  player.blocking = !!shield && s.offDown && !player.carrying && !player.dead;
  const launcher = archery.launcherOf(player);
  const bowHeld = !!launcher && launcher.button === "primary";
  // A left click swings; on a mushroom, a rock, or a tree (its visible pixels) that thing sways too.
  // With a bow in hand the left button is the draw, not a swing or a poke (docs/20).
  if (s.clicked && !s.clickSpent && !bowHeld && !archery.drawState(player)) {
    if (s.mouse && !predict) {
      // The pokes are by the cursor's pixels: a client not here has no cursor in this view (docs/31/05, item 16).
      interact.pokeAt(s.mouse.x, s.mouse.y, player);
      interact.playAt(s.mouse.x, s.mouse.y, player); // the well's bucket, for fun
      interact.clickCharacterAt(s.mouse.x, s.mouse.y, player); // a villager answers (docs/19)
    }
    combat.swingFromLeft(player, zombies, predict); // one weapon swings; two take turns (docs/21)
  }
  // The bow draws on the left button, a throw on the middle one (or Q); the right button held braces a bow (docs/21).
  const onAlt = !!launcher && launcher.button === "alt";
  // The main hand's other melee mode on the middle button (docs/21): the halberd's thrust.
  if (!onAlt && s.altPressed && !archery.drawState(player) && combat.altWeaponOf(player)) combat.tryAttack(player, zombies, "main", "alt", predict);
  const bracing = s.offDown && !!launcher && launcher.kind === "bow";
  if (!predict) archery.updateDraw(player, dt, {
    pressed: onAlt ? s.altPressed : s.clicked && !s.clickSpent,
    down: onAlt ? s.altDown : s.leftDown,
    brace: bracing,
    mouse: s.mouse,
    aimAt: s.aimAt || null, // a grid point from a client whose cursor is not here (net.js)
    blocked: s.blocked,
  });
  // One place decides the walking speed: braced slowest, a draw next (docs/21); a swing's animation slows the walk
  // to its share, the commitment to a swing (docs/41, step 1; `blow.swingMove`, data/combat.json).
  player.moveMult = (bracing ? archery.tunables.braceMove : player.drawing ? archery.tunables.drawSpeed : 1) * (player.blocking ? shield.moveMult : 1) * (combat.swinging(player) ? combat.BLOW.swingMove : 1);
  if (s.space && !predict) combat.tryShove(player, zombies);
  combat.updateCombat(player, zombies, dt);
}
