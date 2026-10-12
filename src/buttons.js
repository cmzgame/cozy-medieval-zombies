// The mouse buttons as roles (docs/21): left is the main hand's primary (read
// straight from input), middle or Q is the main hand's other mode (`alt`), and
// the right button is the off hand (`off`): held it is a stance (block, brace,
// an off-hand swing), and a short press, a tap, is the actions menu or the end
// of a draw. A tap is a press let go within TAP_TIME of simulation time, counted
// in steps so a scripted test sees what a player sees.

import * as input from "./input.js";

export const TAP_TIME = 0.2;

export const alt = { pressed: false, down: false }; // middle button, or Q
export const off = {
  pressed: false, // went down this step
  down: false, // is down now, or was let go this step
  held: 0, // seconds down
  hold: false, // down for longer than a tap: the off hand's role (a swing waits for this)
  tap: null, // { x, y } on the step a tap was let go: where it was pressed
};

let rightWas = false;

// Once per logic step, before anything reads the buttons.
export function update(dt) {
  alt.pressed = input.mouseMiddlePressed() || input.wasPressed("KeyQ");
  alt.down = input.mouseMiddleDown() || input.isDown("KeyQ");

  off.tap = null;
  off.pressed = input.mouseRightPressed();
  if (off.pressed) off.held = 0;
  const down = input.mouseRightDown();
  if (down || off.pressed) off.held += dt;
  const released = input.mouseRightReleased() || (rightWas && !down && !off.pressed);
  if (released) {
    if (off.held <= TAP_TIME) {
      const at = input.mouseRightAt();
      off.tap = { x: at.x, y: at.y };
    }
    off.held = 0;
  }
  off.down = down || off.pressed;
  off.hold = off.down && off.held > TAP_TIME;
  rightWas = down;
}

// A tap spent by something else (the end of a draw): the menu must not open too.
export function spendTap() {
  off.tap = null;
}
