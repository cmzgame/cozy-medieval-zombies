// Screens: the title, the pause menu, settings, and controls (docs/10,
// "Screens"). Plain DOM in the UI layer, so they scale with it like a web
// page. While any screen is up the game is paused; main.js hears about it
// through onChange. Escape steps back: settings or controls to where they
// were opened from, the pause menu to the game, the title nowhere.

import * as settings from "../settings.js";

const CONTROLS = [
  ["W A S D / arrows", "Walk"],
  ["Shift", "Sprint"],
  ["E", "Nearest action; hold to climb through a window"],
  ["Right-click", "Everything you can do to what is under the cursor"],
  ["Double-click", "Equip, wear, or take off a thing; else move it across"],
  ["Z / wheel", "Zoom: wide, middle, close"],
  ["Tab", "Your bag"],
  ["C", "Your character"],
  ["1 to 4", "Swap a belt slot with your hand"],
  ["T", "Torch in or out of hand"],
  ["Left-click", "Swing what you hold; fists with nothing"],
  ["Space", "Shove: pushes the dead back, no damage"],
  ["N", "Build menu: walls, doors, windows"],
  ["X", "Remove: highlights what you placed or built, click to destroy it"],
  ["R", "Turn what you are placing"],
  ["B", "Board up the nearest opening; hold to pull a board"],
  ["Esc", "Close what is open, else pause"],
  ["R / wheel", "Rotate the item you are dragging"],
  ["V", "Fog off (debug)"],
  ["K", "Near walls: stubs or translucent"],
  ["[ ]", "The hour back or forward (debug)"],
  ["L", "Light debug views"],
];

let root = null;
let current = null;
let from = null; // the screen settings or controls return to
let onChange = () => {};
let hairApi = null; // { styles(), current(), set(name), reload() } from main.js
let layersApi = null; // { slots(), names(slot), current(slot), set(slot, name) }
let onReload = () => window.location.reload();
let data = {};

export function initScreens(handlers = {}) {
  onChange = handlers.onChange || onChange;
  hairApi = handlers.hair || null;
  layersApi = handlers.layers || null;
  onReload = handlers.onReload || onReload;
  root = document.getElementById("screens");
  root.hidden = true;
  root.addEventListener("click", (e) => {
    const btn = e.target.closest("button[data-go]");
    if (btn) return go(btn.dataset.go);
    const choice = e.target.closest("button[data-key]");
    if (choice) {
      settings.set(choice.dataset.key, JSON.parse(choice.dataset.value));
      render();
    }
    const hair = e.target.closest("button[data-hair]");
    if (hair && hairApi) {
      hairApi.set(hair.dataset.hair);
      render();
    }
    const layer = e.target.closest("button[data-layer-slot]");
    if (layer && layersApi) {
      layersApi.set(layer.dataset.layerSlot, layer.dataset.layerName || null);
      render();
    }
    if (e.target.closest("#hair-reload") && hairApi) {
      hairApi.reload().then(render);
    }
  });
  settings.onChange(() => {
    if (current === "settings") render();
  });
}

export function currentScreen() {
  return current;
}

export function show(name, extra = {}) {
  data = extra;
  if (name === "settings" || name === "controls") {
    if (current && current !== "settings" && current !== "controls") from = current;
  } else from = null;
  current = name;
  root.hidden = false;
  render();
  onChange(current);
}

export function hide() {
  current = null;
  from = null;
  root.hidden = true;
  onChange(null);
}

// Escape. Returns true if a screen took it.
export function back() {
  if (!current) return false;
  if (current === "settings" || current === "controls") show(from || "pause");
  else if (current === "pause") hide();
  // The title stays until Play; the dead screen until the title.
  return true;
}

function go(where) {
  if (where === "play" || where === "resume") hide();
  else if (where === "back") back();
  else if (where === "reload") onReload();
  else show(where);
}

function button(go, label) {
  return `<button data-go="${go}">${label}</button>`;
}

function settingRow(key, label) {
  const cur = settings.get(key);
  const choices = settings.CHOICES[key]
    .map(([v, text]) => `<button data-key="${key}" data-value='${JSON.stringify(v)}' class="${v === cur ? "on" : ""}">${text}</button>`)
    .join("");
  return `<div class="setting"><span>${label}</span><span class="choices">${choices}</span></div>`;
}

// Hair styles, generated and painted (docs/12), with a reload for ones just saved from the editor.
function hairRow() {
  if (!hairApi) return "";
  const cur = hairApi.current();
  const choices = hairApi.styles().map((s) => `<button data-hair="${s}" class="${s === cur ? "on" : ""}">${s}</button>`).join("");
  return `<div class="setting"><span>Hair</span><span class="choices">${choices}<button id="hair-reload" title="Pick up styles saved from tools/hair.html">Reload</button></span></div>`;
}

// Painted layers per slot, to try on over whatever is worn; "worn" means the item's own art.
function layerRows() {
  if (!layersApi) return "";
  return layersApi.slots().map((slot) => {
    const names = layersApi.names(slot);
    if (!names.length) return "";
    const cur = layersApi.current(slot);
    const btn = (name, label) => `<button data-layer-slot="${slot}" data-layer-name="${name || ""}" class="${(name || null) === cur ? "on" : ""}">${label}</button>`;
    return `<div class="setting"><span>Painted ${slot}</span><span class="choices">${btn(null, "worn")}${names.map((n) => btn(n, n)).join("")}</span></div>`;
  }).join("");
}

function render() {
  root.className = current || "";
  if (current === "title") {
    root.innerHTML = `
      <div class="screen">
        <h1>Cozy Medieval Zombies</h1>
        <div class="sub">A village of the dead. Keep the shutters closed.</div>
        <div class="screen-buttons">${button("play", "Play")}${button("settings", "Settings")}${button("controls", "Controls")}</div>
      </div>`;
  } else if (current === "pause") {
    root.innerHTML = `
      <div class="screen">
        <h1>Paused</h1>
        <div class="sub">Esc to resume</div>
        <div class="screen-buttons">${button("resume", "Resume")}<button disabled title="Not yet: saving is planned, not built">Save game</button>${button("settings", "Settings")}${button("controls", "Controls")}${button("title", "Title screen")}</div>
      </div>`;
  } else if (current === "settings") {
    root.innerHTML = `
      <div class="screen screen-wide">
        <h1>Settings</h1>
        <div class="sub">Kept in this browser</div>
        ${settingRow("uiScale", "Interface size")}
        ${settingRow("worldScale", "Zoom")}
        ${settingRow("zombieAggro", "Zombie aggro")}
        ${settingRow("survival", "Survival")}
        ${settingRow("freeBuilding", "Free building")}
        ${settingRow("debugCorner", "Debug corner")}
        ${settingRow("squareSurface", "Square and paths")}
        ${settingRow("showSwingTargets", "Swing targets")}
        ${settingRow("multiHit", "Multi-hit")}
        ${settingRow("showHitShapes", "Show hit shapes")}
        ${hairRow()}
        ${layerRows()}
        <div class="screen-buttons row"><button data-key="__reset" hidden></button>${button("back", "Back")}<button id="settings-reset">Defaults</button></div>
      </div>`;
    root.querySelector("#settings-reset").addEventListener("click", () => {
      settings.reset();
      render();
    });
  } else if (current === "dead") {
    root.innerHTML = `
      <div class="screen">
        <h1>You died</h1>
        <div class="sub">${data.when || ""}</div>
        <div class="screen-buttons">${button("reload", "Back to the title")}</div>
      </div>`;
  } else if (current === "controls") {
    root.innerHTML = `
      <div class="screen screen-wide">
        <h1>Controls</h1>
        <div class="controls">${CONTROLS.map(([k, what]) => `<b>${k}</b><span>${what}</span>`).join("")}</div>
        <div class="screen-buttons row">${button("back", "Back")}</div>
      </div>`;
  } else {
    root.innerHTML = "";
  }
}
