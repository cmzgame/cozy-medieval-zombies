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
let onContinue = () => {};
let onSave = () => {};
let youApi = null; // { name(), setName(n), look(), setLook(partial) } from main.js (docs/31/03: the identity screen)
let wireApi = null; // { host(), join(code), status() } from main.js (net.js)
let data = {};

export function initScreens(handlers = {}) {
  onChange = handlers.onChange || onChange;
  hairApi = handlers.hair || null;
  layersApi = handlers.layers || null;
  onReload = handlers.onReload || onReload;
  onContinue = handlers.onContinue || onContinue;
  onSave = handlers.onSave || onSave;
  youApi = handlers.you || null;
  wireApi = handlers.wire || null;
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
    const colour = e.target.closest("button[data-look]");
    if (colour && youApi) {
      youApi.setLook({ [colour.dataset.look]: colour.dataset.value });
      render();
    }
    if (e.target.closest("#join-go") && wireApi) {
      const code = (root.querySelector("#join-code").value || "").trim().toLowerCase();
      if (code) wireApi.join(code);
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
  if (name === "settings" || name === "controls" || name === "you" || name === "host" || name === "join") {
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
  if (current === "settings" || current === "controls" || current === "you" || current === "host" || current === "join") show(from || "pause");
  else if (current === "pause") hide();
  // The title stays until Play; the dead screen until the title.
  return true;
}

function go(where) {
  if (where === "play" || where === "resume") hide();
  else if (where === "back") back();
  else if (where === "reload") onReload();
  else if (where === "continue") onContinue();
  else if (where === "save") onSave();
  else if (where === "host-open") { if (wireApi) wireApi.host(); render(); }
  else show(where);
}

function button(go, label) {
  return `<button class="kit-button" data-go="${go}">${label}</button>`;
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
        ${data.save && data.save.dead ? `<div class="sub">Your last survivor died. Play starts the village over.</div>` : ""}
        <div class="screen-buttons">${data.save && !data.save.dead ? button("continue", `Continue, ${data.saveLabel}`) : ""}${button("play", data.save ? "New game" : "Play")}${button("you", "You")}${button("settings", "Settings")}${button("controls", "Controls")}</div>
        <div class="screen-buttons">${button("host", "Host a game")}${button("join", "Join a game")}</div>
      </div>`;
  } else if (current === "pause") {
    root.innerHTML = `
      <div class="screen">
        <h1>Paused</h1>
        <div class="sub">Esc to resume</div>
        <div class="screen-buttons">${button("resume", "Resume")}${button("save", "Save game")}${button("you", "You")}${button("settings", "Settings")}${button("controls", "Controls")}${button("title", "Title screen")}</div>
        <div class="screen-buttons">${button("host", "Host this game")}</div>
      </div>`;
  } else if (current === "settings") {
    root.innerHTML = `
      <div class="screen screen-wide">
        <h1>Settings</h1>
        <div class="sub">Kept in this browser</div>
        ${settingRow("uiScale", "Interface size")}
        ${settingRow("worldScale", "Zoom")}
        ${settingRow("zombieAggro", "Zombie aggro")}
        ${settingRow("zombiesAttackVillagers", "Zombies attack villagers")}
        ${settingRow("survival", "Survival")}
        ${settingRow("freeBuilding", "Free building")}
        ${settingRow("cursor", "Cursor")}
        ${settingRow("debugCorner", "Debug corner")}
        ${settingRow("squareSurface", "Square and paths")}
        ${settingRow("aimGuide", "Bow aim guide")}
        ${settingRow("swingTimer", "Swing timer")}
        ${settingRow("combatTesting", "Combat testing")}
        ${settingRow("devChest", "Dev chest")}
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
  } else if (current === "you") {
    // The identity (docs/31/03; the creation screen pinned in docs/02, 2026-10-10): a name, the look's
    // colours, the hair, the painted layers. Kept in this browser; what a host or a guest sends on a join.
    const you = youApi;
    const look = you ? you.look() : {};
    const swatches = (key, list) => list.map((v) => `<button data-look="${key}" data-value="${v}" class="swatch ${look[key] === v ? "on" : ""}" style="background:${v}" title="${v}"></button>`).join("");
    root.innerHTML = `
      <div class="screen screen-wide">
        <h1>You</h1>
        <div class="sub">Who you are to the others. Kept in this browser.</div>
        <div class="setting"><span>Name</span><span class="choices"><input id="you-name" type="text" maxlength="24" value="${you ? (you.name() || "").replace(/"/g, "&quot;") : ""}" placeholder="Your name" autocomplete="off" spellcheck="false"></span></div>
        <div class="setting"><span>Skin</span><span class="choices">${swatches("skin", ["#f0c8a0", "#e2b48a", "#c48d5e", "#9c6a44", "#6f4a2e"])}</span></div>
        <div class="setting"><span>Hair</span><span class="choices">${swatches("hair", ["#5a3a20", "#1e1a1a", "#c9a24a", "#a8402c", "#8a8a8a", "#6b2d8f"])}</span></div>
        <div class="setting"><span>Eyes</span><span class="choices">${swatches("eyes", ["#1c1a22", "#2a5a8f", "#3f7a3a", "#6b3a1e"])}</span></div>
        ${hairRow()}
        ${layerRows()}
        <div class="screen-buttons row">${button("back", "Back")}</div>
      </div>`;
    const nameEl = root.querySelector("#you-name");
    nameEl.addEventListener("keydown", (e) => e.stopPropagation());
    nameEl.addEventListener("keyup", (e) => e.stopPropagation());
    nameEl.addEventListener("change", () => { if (youApi) youApi.setName(nameEl.value.trim().slice(0, 24)); });
    nameEl.addEventListener("blur", () => { if (youApi) youApi.setName(nameEl.value.trim().slice(0, 24)); });
  } else if (current === "host") {
    // Hosting (docs/31/04, the listen server): this world open to friends on this origin; the code is theirs to type.
    const st = wireApi ? wireApi.status() : null;
    const open = st && st.role === "host";
    root.innerHTML = `
      <div class="screen">
        <h1>Host a game</h1>
        ${open ? `<div class="sub">Your code: <b class="code">${st.code}</b></div><div class="sub">${st.guests.length ? `With you: ${st.guests.join(", ")}` : "Waiting for friends. The world runs while this screen is up only if you go back to it."}</div>` : `<div class="sub">Opens this world to friends on this computer's browser for now, and on the wire later (docs/31/04).</div>`}
        <div class="screen-buttons">${open ? "" : button("host-open", "Open this world")}${button("back", open ? "Back to the game" : "Back")}</div>
      </div>`;
  } else if (current === "join") {
    const st = wireApi ? wireApi.status() : null;
    root.innerHTML = `
      <div class="screen">
        <h1>Join a game</h1>
        <div class="sub">${st && st.role === "guest" ? (st.joined ? `In ${st.code}'s world as ${st.myPlayerId}.` : `Joining ${st.code}…`) : "Type the host's code."}</div>
        ${st && st.role === "guest" ? "" : `<div class="setting"><span>Code</span><span class="choices"><input id="join-code" type="text" maxlength="24" placeholder="oak-abc" autocomplete="off" spellcheck="false"><button id="join-go">Join</button></span></div>`}
        <div class="screen-buttons">${button("back", "Back")}</div>
      </div>`;
    const codeEl = root.querySelector("#join-code");
    if (codeEl) {
      codeEl.addEventListener("keydown", (e) => { e.stopPropagation(); if (e.code === "Enter" && wireApi) { const c = codeEl.value.trim().toLowerCase(); if (c) wireApi.join(c); } });
      codeEl.addEventListener("keyup", (e) => e.stopPropagation());
      codeEl.focus();
    }
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
