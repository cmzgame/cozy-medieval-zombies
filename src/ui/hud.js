// The HUD: the portrait, health, stamina, and the hands top-left; the clock top
// centre; the moodles down the right edge (ui/moodles.js). Copied from
// cozy-zombie-game src/ui/hud.js on 2026-10-10 and cut to what this game has;
// rearranged 2026-10-12 (Michael: the bars up top with a small portrait beside
// them as WoW has, the time top centre, the log in the corner the bars left).
// DOM over the canvas, never drawn in it. The portrait is the player's own
// baked sheet (hat and all) cropped at the head and shown at 2x, redrawn
// whenever the sheet is rebuilt.

import * as clock from "../clock.js";
import { getItem } from "../items.js";
import { getSheet } from "../assets.js";
import { frameName } from "../sprites.js";
import { FEET_X } from "../figure/rig.js";
import { initMoodles, updateMoodles } from "./moodles.js";

// The head's box in a frame: the rig's head centre is 38 above the feet (feet at
// row 66, so row 28), 9.5 tall each way, the neck at 30 above; rows 12 to 40
// take a hat above it and the chin and a sliver of shoulder below.
const HEAD = { x: FEET_X - 13, y: 12, w: 26, h: 28 };
const SCALE = 2;

let root = null;
let clockEl = null;
let els = {};
let lastHands = "";
let lastLabel = "";
let drawnSheet = null;

export function initHud() {
  root = document.getElementById("hud");
  root.innerHTML = `
    <div class="hud-top">
      <canvas class="hud-portrait" width="${HEAD.w * SCALE}" height="${HEAD.h * SCALE}"></canvas>
      <div class="hud-stack">
        <div class="hud-health"><div class="hud-health-fill"></div><span class="hud-label">Health</span><span class="hud-health-text"></span></div>
        <div class="hud-stamina"><div class="hud-stamina-fill"></div><span class="hud-label">Stamina</span><span class="hud-stamina-text"></span></div>
        <div class="hud-hands"></div>
      </div>
    </div>
  `;
  els = {
    portrait: root.querySelector(".hud-portrait"),
    fill: root.querySelector(".hud-health-fill"),
    text: root.querySelector(".hud-health-text"),
    stamina: root.querySelector(".hud-stamina"),
    staminaText: root.querySelector(".hud-stamina-text"),
    staminaFill: root.querySelector(".hud-stamina-fill"),
    hands: root.querySelector(".hud-hands"),
  };
  clockEl = document.createElement("div");
  clockEl.id = "clock";
  document.getElementById("ui").appendChild(clockEl);
  const moodles = document.createElement("div");
  moodles.id = "moodles";
  document.getElementById("ui").appendChild(moodles);
  initMoodles(moodles);
  root.hidden = false;
}

function handName(entry) {
  return entry ? getItem(entry.id).name : "–";
}

// The head from the player's sheet, facing the viewer, idle; once per sheet.
function drawPortrait() {
  let sheet;
  try { sheet = getSheet(player.sprite); } catch { return; }
  if (sheet === drawnSheet) return;
  drawnSheet = sheet;
  let f = null;
  try { f = sheet.frames[frameName(sheet, "idle", "s", 0)]; } catch { f = null; }
  if (!f) f = Object.values(sheet.frames)[0];
  if (!f) return;
  const ctx = els.portrait.getContext("2d");
  ctx.imageSmoothingEnabled = false;
  ctx.clearRect(0, 0, els.portrait.width, els.portrait.height);
  ctx.drawImage(sheet.image, f[0] + HEAD.x, f[1] + HEAD.y, HEAD.w, HEAD.h, 0, 0, HEAD.w * SCALE, HEAD.h * SCALE);
}

export function updateHud({ player }) {
  if (!root) return;
  drawPortrait();
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
    clockEl.textContent = label;
    lastLabel = label;
  }
}
