// The HUD. Cut down from cozy-zombie-game src/ui/hud.js on 2026-10-09: the
// stamina bar, because Michael sprints everywhere and wants to see it, and the
// clock since lighting. Health and the rest arrive with their ports. DOM over
// the canvas, never drawn in it.

import * as clock from "../clock.js";

let el = null;
let fill = null;
let bar = null;
let clockEl = null;
let lastLabel = "";

export function initHud() {
  el = document.getElementById("hud");
  el.innerHTML = `<div class="hud-clock"></div><div class="hud-stamina"><div class="hud-stamina-fill"></div></div>`;
  bar = el.querySelector(".hud-stamina");
  fill = el.querySelector(".hud-stamina-fill");
  clockEl = el.querySelector(".hud-clock");
  el.hidden = false;
}

export function updateHud({ player }) {
  if (!el) return;
  const frac = Math.max(0, Math.min(1, player.stamina / player.maxStamina));
  fill.style.width = `${Math.round(frac * 100)}%`;
  bar.classList.toggle("winded", !!player.winded);
  const label = clock.getLabel();
  if (label !== lastLabel) {
    clockEl.textContent = label;
    lastLabel = label;
  }
}
