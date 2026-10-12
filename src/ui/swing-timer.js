// The swing timer (Michael, 2026-10-12, after World of Warcraft's): while a weapon's swing
// recovers, a bar in a fixed place on the HUD fills across exactly that recovery and goes away the
// moment the next blow is ready, so the rhythm of a fight can be played, not guessed. One bar for
// the main hand and, when an off-hand weapon swings (dual wielding, docs/21), one for the off hand;
// each the size and shape of the health bar, labelled inside, gold. At bottom centre above the
// belt, where nothing else of the HUD grows into it (the left stack's moodles grow upward).
// The exposure bar is a different thing and stays over the head: the time left in which a blow
// is amplified (docs/21), the most immediate danger near the character.
// DOM over the canvas, never drawn into it. A setting.

import * as iso from "../iso.js";
import * as view from "../view.js";
import * as settings from "../settings.js";
import { DUAL } from "../combat.js";

const HEAD_CLEARANCE = 58; // world px above the feet: just over the figure's head (the figure is about 50 px tall in its 72 px frame)

let hud = null;
let exposed = null;
const bars = {}; // "main" | "off" -> { el, fill }

export function initSwingTimer() {
  hud = document.createElement("div");
  hud.id = "swing-bars";
  document.getElementById("ui").appendChild(hud);
  for (const [k, label] of [["main", "Main hand"], ["off", "Off hand"]]) {
    const el = document.createElement("div");
    el.className = "swing-bar";
    el.hidden = true;
    const fill = document.createElement("div");
    fill.className = "swing-bar-fill";
    const text = document.createElement("span");
    text.className = "swing-bar-text";
    text.textContent = label;
    el.append(fill, text);
    hud.appendChild(el);
    bars[k] = { el, fill };
  }
  exposed = document.createElement("div");
  exposed.className = "swing-timer swing-timer-exposed";
  exposed.hidden = true;
  const ef = document.createElement("div");
  ef.className = "swing-timer-fill";
  exposed.appendChild(ef);
  const over = document.createElement("div");
  over.id = "exposure-bar";
  over.appendChild(exposed);
  document.getElementById("ui").appendChild(over);
  exposed._fill = ef;
}

// Every frame: how much of each swing has recovered, from the cooldowns combat keeps.
export function updateSwingTimer(player) {
  if (!hud) return;
  const on = settings.get("swingTimer") && !player.dead;
  for (const [k, left, total] of [["main", player.attackCooldown, player.swingTotal], ["off", player.offCooldown, player.offSwingTotal]]) {
    const b = bars[k];
    const show = on && left > 0 && total > 0;
    b.el.hidden = !show;
    if (show) b.fill.style.width = `${Math.round(Math.max(0, Math.min(1, 1 - left / total)) * 100)}%`;
  }
  // Over the head: how long a blow is amplified (docs/21). Not part of the setting: it is danger, not rhythm.
  const showExp = !player.dead && player.exposedFor > 0;
  exposed.hidden = !showExp;
  if (showExp) {
    const s = iso.toScreen(player.gx, player.gy);
    const p = view.toUi(s.x, s.y - HEAD_CLEARANCE);
    exposed.style.left = `${Math.round(p.x)}px`;
    exposed.style.top = `${Math.round(p.y)}px`;
    exposed._fill.style.width = `${Math.round(Math.max(0, Math.min(1, player.exposedFor / DUAL.window)) * 100)}%`;
  }
}
