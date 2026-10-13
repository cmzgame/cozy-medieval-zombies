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

// The box cut from a frame: the rig's head centre is 38 above the feet (feet at
// row 66, so row 28), 9.5 tall each way, the neck at 30 above; rows 12 to 52
// take a hat above it, the shoulders, and the chest to the belt, so the tunic
// shows beside the bars (Michael, 2026-10-13: more of them vertically).
const HEAD = { x: FEET_X - 13, y: 12, w: 26, h: 40 };
const SCALE = 2;

let root = null;
let clockEl = null;
let els = {};
let lastHands = "";
let lastLabel = "";
let lastName = "";
let drawnImage = null; // the sheet picture the portrait was last cut from

export function initHud() {
  root = document.getElementById("hud");
  root.innerHTML = `
    <div class="hud-top">
      <canvas class="hud-portrait" width="${HEAD.w * SCALE}" height="${HEAD.h * SCALE}"></canvas>
      <div class="hud-stack">
        <div class="hud-name"></div>
        <div class="hud-health"><div class="hud-health-fill"></div><span class="hud-label">Health</span><span class="hud-health-text"></span></div>
        <div class="hud-stamina"><div class="hud-stamina-fill"></div><span class="hud-label">Stamina</span><span class="hud-stamina-text"></span></div>
        <div class="hud-hands"></div>
      </div>
    </div>
  `;
  els = {
    portrait: root.querySelector(".hud-portrait"),
    name: root.querySelector(".hud-name"),
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
function drawPortrait(player) {
  let sheet;
  try { sheet = getSheet(player.sprite); } catch { return; } // (since the fifth move it read `player` with none in scope and threw here every frame: no portrait at all)
  // The sheet object is kept and its picture replaced in place when the look or the clothes change
  // (assets.replaceSheet), so the picture is what says "redraw", not the sheet (Michael, 2026-10-13: no portrait after the character screen).
  if (!sheet.image || sheet.image === drawnImage) return;
  drawnImage = sheet.image;
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
  drawPortrait(player);
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

  // The nameplate (Michael, 2026-10-13): the name from the character screen, legible, over the bars; the id until one is chosen.
  const name = player.name || player.id || "";
  if (name !== lastName) {
    els.name.textContent = name;
    lastName = name;
  }
  // A two-handed thing is one entry in both hands: named once, no slash (Michael, 2026-10-13: "Halberd / Halberd").
  const twoHanded = player.hands.main && player.hands.main === player.hands.off;
  const hands = twoHanded ? handName(player.hands.main) : `${handName(player.hands.main)} / ${handName(player.hands.off)}`;
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
