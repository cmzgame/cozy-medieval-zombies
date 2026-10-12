// The HUD: moodles, health, stamina, hands, clock. Copied from cozy-zombie-game
// src/ui/hud.js on 2026-10-10 and cut to what this game has: the weapon line
// became the hands. DOM over the canvas, never drawn in it.

import * as clock from "../clock.js";
import { getItem } from "../items.js";
import { initMoodles, updateMoodles } from "./moodles.js";

let root = null;
let els = {};
let lastHands = "";
let lastLabel = "";

export function initHud() {
  root = document.getElementById("hud");
  // Everything sits straight on the map, no panel behind it (Michael,
  // 2026-10-12: stone on the bag, the character screen, and the belt alone).
  root.innerHTML = `
    <div class="hud-row hud-moodles"></div>
    <div class="hud-row">
      <div class="hud-health"><div class="hud-health-fill"></div><span class="hud-label">Health</span><span class="hud-health-text"></span></div>
    </div>
    <div class="hud-row">
      <div class="hud-stamina"><div class="hud-stamina-fill"></div><span class="hud-label">Stamina</span><span class="hud-stamina-text"></span></div>
    </div>
    <div class="hud-row hud-hands"></div>
    <div class="hud-clock"></div>
  `;
  els = {
    fill: root.querySelector(".hud-health-fill"),
    text: root.querySelector(".hud-health-text"),
    stamina: root.querySelector(".hud-stamina"),
    staminaText: root.querySelector(".hud-stamina-text"),
    staminaFill: root.querySelector(".hud-stamina-fill"),
    hands: root.querySelector(".hud-hands"),
    clock: root.querySelector(".hud-clock"),
  };
  initMoodles(root.querySelector(".hud-moodles"));
  root.hidden = false;
}

function handName(entry) {
  return entry ? getItem(entry.id).name : "–";
}

export function updateHud({ player }) {
  if (!root) return;
  const pct = Math.max(0, Math.min(1, player.hp / player.maxHp));
  els.fill.style.width = `${Math.round(pct * 100)}%`;
  els.fill.style.background = pct > 0.5 ? "#6fbf5f" : pct > 0.25 ? "#d9b84a" : "#d05050";
  els.text.textContent = `${Math.ceil(player.hp)} / ${player.maxHp}`;

  const st = Math.max(0, Math.min(1, player.stamina / player.maxStamina));
  els.staminaFill.style.width = `${Math.round(st * 100)}%`;
  els.staminaText.textContent = `${Math.round(st * 100)}%`;
  els.stamina.classList.toggle("winded", !!player.winded);
  // A blow met by the shield pulses the bar (docs/21): gold for a block, red for a broken guard.
  els.stamina.classList.toggle("blocked", player.blockFlash > 0 && !player.flashBroken);
  els.stamina.classList.toggle("broken", player.blockFlash > 0 && !!player.flashBroken);

  updateMoodles(player);

  const hands = `${handName(player.hands.main)} / ${handName(player.hands.off)}`;
  if (hands !== lastHands) {
    els.hands.textContent = `Hands: ${hands}`;
    lastHands = hands;
  }
  const label = clock.getLabel();
  if (label !== lastLabel) {
    els.clock.textContent = label;
    lastLabel = label;
  }
}
