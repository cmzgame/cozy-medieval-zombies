// The swing timer (Michael, 2026-10-12, after World of Warcraft's): a small bar over the
// player's head that fills while a weapon's swing recovers and goes away the moment the next
// blow is ready, so the rhythm of a fight can be played, not guessed. The main hand's bar is
// the top one; an off-hand weapon (dual wielding, docs/21) has its own thinner bar under it.
// DOM over the canvas through view.toUi, like ui/zombie-bars.js, never drawn into it. A setting.

import * as iso from "../iso.js";
import * as view from "../view.js";
import * as settings from "../settings.js";
import { DUAL } from "../combat.js";

const HEAD_CLEARANCE = 58; // world px above the feet: just over the figure's head (the figure is about 50 px tall in its 72 px frame)

let root = null;
const bars = {}; // "main" | "off" -> { el, fill }

export function initSwingTimer() {
  root = document.createElement("div");
  root.id = "swing-timer";
  document.getElementById("ui").appendChild(root);
  for (const k of ["main", "off", "exposed"]) {
    const el = document.createElement("div");
    el.className = `swing-timer swing-timer-${k}`;
    el.hidden = true;
    const fill = document.createElement("div");
    fill.className = "swing-timer-fill";
    el.appendChild(fill);
    root.appendChild(el);
    bars[k] = { el, fill };
  }
}

// Every frame: how much of the swing has recovered, from the cooldowns combat keeps.
export function updateSwingTimer(player) {
  if (!root) return;
  const on = settings.get("swingTimer") && !player.dead;
  const s = iso.toScreen(player.gx, player.gy);
  const p = view.toUi(s.x, s.y - HEAD_CLEARANCE);
  for (const [k, left, total] of [["main", player.attackCooldown, player.swingTotal], ["off", player.offCooldown, player.offSwingTotal], ["exposed", player.exposedFor, DUAL.window]]) {
    const b = bars[k];
    const show = on && left > 0 && total > 0;
    b.el.hidden = !show;
    if (!show) continue;
    b.el.style.left = `${Math.round(p.x)}px`;
    b.el.style.top = `${Math.round(p.y) + (k === "off" ? 7 : k === "exposed" ? -7 : 0)}px`;
    // The swing bars fill; the exposure bar drains: it is the time left in which a blow is amplified.
    const f = k === "exposed" ? left / total : 1 - left / total;
    b.fill.style.width = `${Math.round(Math.max(0, Math.min(1, f)) * 100)}%`;
  }
}
