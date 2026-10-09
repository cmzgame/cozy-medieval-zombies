// The HUD. Cut down from cozy-zombie-game src/ui/hud.js on 2026-10-09: only the
// stamina bar for now, because Michael sprints everywhere and wants to see it.
// Health and the rest arrive with their ports. DOM over the canvas, never drawn in it.

let el = null;
let fill = null;
let bar = null;

export function initHud() {
  el = document.getElementById("hud");
  el.innerHTML = `<div class="hud-stamina"><div class="hud-stamina-fill"></div></div>`;
  bar = el.querySelector(".hud-stamina");
  fill = el.querySelector(".hud-stamina-fill");
  el.hidden = false;
}

export function updateHud({ player }) {
  if (!el) return;
  const frac = Math.max(0, Math.min(1, player.stamina / player.maxStamina));
  fill.style.width = `${Math.round(frac * 100)}%`;
  bar.classList.toggle("winded", !!player.winded);
}
