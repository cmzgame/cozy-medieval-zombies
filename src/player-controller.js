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
export function controlPlayer(player, zombies, dt, s) {
  // The right button held with a shield in the off hand raises the guard (docs/21): you can
  // still swing, stab, or throw from behind it, for much less damage (the shield's `attackMult`).
  // It is not held through carrying or a climb. It does hold with the bag open (the world goes on
  // while you look in it, and the bag is where weapons are swapped) and a menu open (a press
  // outside the menu closes it).
  const shield = combat.shieldOf(player);
  player.blocking = !!shield && s.offDown && !player.carrying && !player.climb && !player.dead;
  const launcher = archery.launcherOf(player);
  const bowHeld = !!launcher && launcher.button === "primary";
  // A left click swings; on a mushroom, a rock, or a tree (its visible pixels) that thing sways too.
  // With a bow in hand the left button is the draw, not a swing or a poke (docs/20).
  if (s.clicked && !s.clickSpent && !bowHeld && !archery.drawState()) {
    interact.pokeAt(s.mouse.x, s.mouse.y, player);
    interact.playAt(s.mouse.x, s.mouse.y, player); // the well's bucket, for fun
    interact.clickCharacterAt(s.mouse.x, s.mouse.y, player); // a villager answers (docs/19)
    combat.swingFromLeft(player, zombies); // one weapon swings; two take turns (docs/21)
  }
  // The bow draws on the left button, a throw on the middle one (or Q); the right button held braces a bow (docs/21).
  const onAlt = !!launcher && launcher.button === "alt";
  // The main hand's other melee mode on the middle button (docs/21): the halberd's thrust.
  if (!onAlt && s.altPressed && !archery.drawState() && combat.altWeaponOf(player)) combat.tryAttack(player, zombies, "main", "alt");
  const bracing = s.offDown && !!launcher && launcher.kind === "bow";
  archery.updateDraw(player, dt, {
    pressed: onAlt ? s.altPressed : s.clicked && !s.clickSpent,
    down: onAlt ? s.altDown : s.leftDown,
    brace: bracing,
    mouse: s.mouse,
    blocked: s.blocked,
  });
  // One place decides the walking speed: braced slowest, a draw next (docs/21).
  player.moveMult = (bracing ? archery.tunables.braceMove : player.drawing ? archery.tunables.drawSpeed : 1) * (player.blocking ? shield.moveMult : 1);
  if (s.space) combat.tryShove(player, zombies);
  combat.updateCombat(player, zombies, dt);
}
