// The cursor (the design agent's delivery of 2026-10-12, data/art/cursors, with
// its README): a CSS cursor on the whole page, so it is the same hand over the
// map and over the panels and never lags, at the 2x file's own pixels (30 by
// 40, a system cursor's size). The hotspot is the fingertip, shared by all
// three hands, so a swap never moves the click. The engine-drawn way the README
// also offers is not for this game: a cursor is UI, and UI is never drawn into
// the canvas. Four choices on the settings screen (Michael, 2026-10-12): the
// system's own, the hand, the severed hand, the zombie hand; with the hand, the
// zombie hand shows over the dead.

import * as settings from "../settings.js";

const HANDS = new Set(["human", "severed", "zombie"]);
let overDead = false;

export function init() {
  settings.onChange((key) => {
    if (key === "cursor") apply();
  });
  apply();
}

// main.js says each step whether the cursor is over one of the dead.
export function setOverDead(v) {
  if (v === overDead) return;
  overDead = v;
  apply();
}

function apply() {
  const choice = settings.get("cursor");
  const hand = !HANDS.has(choice) ? null : choice === "human" && overDead ? "zombie" : choice;
  const el = document.documentElement;
  for (const c of [...el.classList]) if (c.startsWith("cursor-")) el.classList.remove(c);
  if (hand) el.classList.add(`cursor-${hand}`);
}
