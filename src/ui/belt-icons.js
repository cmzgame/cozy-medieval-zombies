// The belt slots' role icons (Michael, 2026-10-25: "stamp the empty gray background of each slot with a hand icon or utility icon"): placeholder
// dev art in the skill icons' style (16 by 16, a few shapes and a dark outline, ui/skill-icons.js), drawn once at first use with Canvas 2D, so
// a delivered picture can replace each through the same interface later. One hand shape, drawn as a right hand and mirrored for the left: a
// main-hand slot shows the hand the character favours and an off-hand slot the other (`player.handed`, "right" when absent: a label chosen at
// creation, its own PR), and the utility slot a pouch. The panel draws them faint (style.css `.hot-role`).

import { iconURL, SIZE } from "./skill-icons.js";
import { handSideOf } from "../handed.js";

const SKIN = "#d8c0a0";
const SHADE = "#a88c6c";
const LIGHT = "#f0dcc0";

// A right hand seen from the back, fingers up, the thumb out to the viewer's left, the little finger short on the right.
function rightHand(b) {
  b.rect(5, 8, 11, 13, SKIN); // the palm
  b.rect(5, 3, 6, 8, SKIN); // the four fingers side by side, the middle one longest
  b.rect(7, 2, 8, 8, SKIN);
  b.rect(9, 3, 10, 8, SKIN);
  b.rect(11, 4, 12, 9, SKIN);
  b.rect(2, 8, 3, 9, SKIN); // the thumb, out to the side and up
  b.rect(3, 10, 4, 11, SKIN);
  b.rect(6, 14, 10, 15, SHADE); // the wrist
  b.put(7, 3, LIGHT); // the light on the fingertips
  b.put(5, 4, LIGHT);
  b.put(10, 12, SHADE); // the heel of the hand
  b.put(9, 13, SHADE);
}

// The same hand mirrored, pixel for pixel: drawn into a scratch buffer, then copied back with x flipped.
function mirrored(draw) {
  return (b) => {
    const tmp = [];
    const scratch = { ...b, put: (x, y, c) => tmp.push([x, y, c]), rect: (x0, y0, x1, y1, c) => { for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) tmp.push([x, y, c]); } };
    draw(scratch);
    for (const [x, y, c] of tmp) b.put(SIZE - 1 - x, y, c);
  };
}

const DRAW = {
  "hand-right": rightHand,
  "hand-left": mirrored(rightHand),
  // A drawstring pouch: the utility slot.
  utility(b) {
    const leather = "#a07040";
    b.oval(8, 10, 5, 4, leather); // the body
    b.rect(6, 5, 10, 7, leather); // the neck, gathered
    b.rect(5, 4, 11, 4, "#c8a060"); // the drawstring's knot and its ends
    b.put(4, 3, "#c8a060");
    b.put(12, 3, "#c8a060");
    b.put(6, 9, "#c89060"); // the light on it
    b.put(5, 10, "#c89060");
    b.put(11, 13, "#704a28"); // the shade
    b.put(10, 14, "#704a28");
  },
};

export const ICON_SIZE = SIZE;

// The icon's key for a slot's role and the player's handedness: the main hand is the favoured side, the off hand the other.
// `handed` is a character or a handedness (handed.js handSideOf, "right" when absent), so the icons and the character screen's labels agree.
export function roleIconKey(role, handed = "right") {
  if (role === "utility") return "utility";
  return `hand-${handSideOf(handed, role)}`;
}

export function beltIconURL(key) {
  return iconURL(`belt:${key}`, DRAW[key]);
}
