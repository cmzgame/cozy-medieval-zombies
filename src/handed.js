// Handedness (Michael, 2026-10-25): a character is right-handed or left-handed, chosen once on the identity screen and
// stamped on the character (`player.handed`), never ambidextrous. It is a label and nothing more: everything in the game
// cares about the main hand and the off hand, never left or right; this says which of the character's two hands each is
// called (the character screen's hand slots, the belt's hand icons). The arms draw as they always have. Pure, a leaf.

export const HANDED = ["right", "left"];

// A handedness as the game keeps it: "left" only when it says so, else the default, "right".
export function handedOf(v) {
  return v === "left" ? "left" : "right";
}

// Which of a character's hands a role is: "main" or "off" to "right" or "left". A right-handed character's main hand is
// its right hand and its off hand its left; a left-handed one's the other way round. `who` is a character (its `handed`)
// or a handedness itself.
export function handSideOf(who, role) {
  const h = handedOf(typeof who === "string" ? who : who && who.handed);
  const main = role !== "off";
  return (h === "right") === main ? "right" : "left";
}

// The character screen's word for a hand slot: "Main hand (right)", "Off-hand (left)".
export function handLabel(who, role) {
  return `${role === "off" ? "Off-hand" : "Main hand"} (${handSideOf(who, role)})`;
}
