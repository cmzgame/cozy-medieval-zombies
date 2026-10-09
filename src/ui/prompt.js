// A DOM label floating over a world point. Cut down from cozy-zombie-game
// src/ui/prompt.js on 2026-10-09: no progress bar yet.

import * as iso from "../iso.js";

let el = null;

export function initPrompt() {
  el = document.getElementById("prompt");
}

export function updatePrompt(p) {
  if (!el) return;
  if (!p) {
    el.hidden = true;
    return;
  }
  const s = iso.toScreen(p.mx, p.my);
  el.textContent = p.label;
  el.style.left = `${Math.round(s.x)}px`;
  el.style.top = `${Math.round(s.y) - 44}px`;
  el.hidden = false;
}
