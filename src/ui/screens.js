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
let youApi = null; // the character screen's api from main.js (docs/12, the creation screen; docs/31/03, the identity)
let wireApi = null; // { host(), join(code), status() } from main.js (net.js: Host a game, Join a game)
let data = {};
let previewTimer = null; // the character screen's turning figure
let previewFacing = 0;

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
    // The character screen's swatches and rows: each sets one field of the look and redraws (youApi).
    const lookBtn = e.target.closest("button[data-look-key]");
    if (lookBtn && youApi) {
      youApi.setLook({ [lookBtn.dataset.lookKey]: lookBtn.dataset.lookValue });
      render();
      return;
    }
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
    if (e.target.closest("#join-go") && wireApi) {
      const code = (root.querySelector("#join-code").value || "").trim().toLowerCase();
      if (code) wireApi.join(code);
    }
  });
  root.addEventListener("input", (e) => {
    const name = e.target.closest("input[data-name]");
    if (name && youApi) youApi.setName(name.value);
  });
  settings.onChange(() => {
    if (current === "settings") render();
  });
}

export function currentScreen() {
  return current;
}

// The screens that return to where they were opened from (Escape, Back, Done).
const SUB = new Set(["settings", "controls", "character", "host", "join"]);

export function show(name, extra = {}) {
  const titleData = current === "title" ? data : null;
  data = extra;
  if (SUB.has(name)) {
    if (current && !SUB.has(current)) {
      from = current;
      if (titleData) data = { ...titleData, ...extra }; // the title's save and its needs survive a detour
    }
  } else from = null;
  current = name;
  root.hidden = false;
  render();
  onChange(current);
}

export function hide() {
  stopPreview();
  current = null;
  from = null;
  root.hidden = true;
  onChange(null);
}

// Escape. Returns true if a screen took it.
export function back() {
  if (!current) return false;
  if (SUB.has(current)) show(from || "pause", data);
  else if (current === "pause") hide();
  // The title stays until Play; the dead screen until the title.
  return true;
}

function go(where) {
  if (where === "play") {
    // The first game, and the next survivor after a death, start at the character screen (docs/12; docs/31/05 item 34).
    if (data.needsCharacter && youApi) show("character", { then: "play" });
    else hide();
  } else if (where === "resume") hide();
  else if (where === "done") {
    // The character screen's Done: into the game it was opened for, else back where it came from.
    if (data.then === "play") hide();
    else back();
  } else if (where === "back") back();
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

// ---- the character screen (docs/12, the creation screen; docs/31/03, the identity) ----
// A name, the skin from the approved ramp (the three dead tones allowed for fun), the
// hair style with bald first, the hair and eye colours; the figure turning beside them,
// baked by the game's own figure code in what the player wears. What it writes is the
// identity { name, look } that the title's Play uses and a join sends (main.js).

function swatchRow(label, key, colours, cur) {
  const btns = colours.map((c) => `<button class="swatch${c === cur ? " on" : ""}" data-look-key="${key}" data-look-value="${c}" style="--swatch:${c}" title="${c}"></button>`).join("");
  return `<div class="you-row"><span>${label}</span><span class="swatches">${btns}</span></div>`;
}

function characterHtml() {
  const look = youApi.look();
  const pal = youApi.palette();
  const styles = youApi.styles().map((s) => `<button data-look-key="hairStyle" data-look-value="${s}" class="${s === look.hairStyle ? "on" : ""}">${s}</button>`).join("");
  return `
    <div class="screen screen-wide you">
      <h1>Your character</h1>
      <div class="sub">${data.then === "play" ? "Who walks into the valley" : "Kept in this browser; a join carries it"}</div>
      <div class="you-body">
        <canvas class="you-preview" width="144" height="216"></canvas>
        <div class="you-rows">
          <div class="you-row"><span>Name</span><input type="text" maxlength="24" data-name value="${(youApi.name() || "").replace(/"/g, "&quot;")}" placeholder="a name, or none"></div>
          ${swatchRow("Skin", "skin", pal.skins.living, look.skin)}
          ${swatchRow("The dead's", "skin", pal.skins.dead, look.skin)}
          <div class="you-row"><span>Hair</span><span class="choices">${styles}</span></div>
          ${swatchRow("Hair colour", "hair", pal.hair, look.hair)}
          ${swatchRow("Eyes", "eyes", pal.eyes, look.eyes)}
        </div>
      </div>
      <div class="screen-buttons row">${button("done", data.then === "play" ? "Into the valley" : "Done")}${data.then === "play" ? button("back", "Back") : ""}<button id="hair-reload" title="Pick up styles saved from tools/hair.html">Reload hair</button></div>
    </div>`;
}

// The figure drawn at three times, turning through the eight facings.
function startPreview() {
  stopPreview();
  const canvas = root.querySelector(".you-preview");
  if (!canvas || !youApi) return;
  let sheet = null;
  try { sheet = youApi.sheet(); } catch (err) { console.warn("The character preview could not bake:", err.message); return; }
  const facings = sheet.facings && sheet.facings.length ? sheet.facings : ["s"];
  const ctx = canvas.getContext("2d");
  ctx.imageSmoothingEnabled = false;
  const draw = () => {
    const facing = facings[previewFacing % facings.length];
    const f = sheet.frames[`idle_${facing}_0`] || Object.values(sheet.frames)[0];
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (!f) return;
    const s = 3;
    ctx.drawImage(sheet.image, f[0], f[1], f[2], f[3], Math.round((canvas.width - f[2] * s) / 2), canvas.height - f[3] * s, f[2] * s, f[3] * s);
  };
  draw();
  previewTimer = setInterval(() => { previewFacing++; draw(); }, 650);
}

function stopPreview() {
  if (previewTimer) clearInterval(previewTimer);
  previewTimer = null;
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
  stopPreview();
  if (current === "title") {
    root.innerHTML = `
      <div class="screen">
        <h1>Cozy Medieval Zombies</h1>
        <div class="sub">A village of the dead. Keep the shutters closed.</div>
        ${data.save && data.save.dead ? `<div class="sub">Your last survivor died. Play starts the village over.</div>` : ""}
        <div class="screen-buttons">${data.save && !data.save.dead ? button("continue", `Continue, ${data.saveLabel}`) : ""}${button("play", data.save ? "New game" : "Play")}${youApi ? button("character", "Character") : ""}${button("settings", "Settings")}${button("controls", "Controls")}</div>
        ${wireApi ? `<div class="screen-buttons">${button("host", "Host a game")}${button("join", "Join a game")}</div>` : ""}
      </div>`;
  } else if (current === "pause") {
    root.innerHTML = `
      <div class="screen">
        <h1>${wireApi && wireApi.status().role ? "Menu" : "Paused"}</h1>
        <div class="sub">${wireApi && wireApi.status().role ? "The world goes on while you are here; your character stands still." : "Esc to resume"}</div>
        <div class="screen-buttons">${button("resume", "Resume")}${button("save", "Save game")}${youApi ? button("character", "Character") : ""}${button("settings", "Settings")}${button("controls", "Controls")}${button("title", "Title screen")}</div>
        ${wireApi ? `<div class="screen-buttons">${button("host", "Host this game")}</div>` : ""}
      </div>`;
  } else if (current === "host" && wireApi) {
    // Hosting (docs/31/04, the listen server): this world open to friends on this origin; the code is theirs to type.
    const st = wireApi.status();
    const open = st && st.role === "host";
    root.innerHTML = `
      <div class="screen">
        <h1>Host a game</h1>
        ${open ? `<div class="sub">Your code: <b class="code">${st.code}</b></div><div class="sub">${st.guests.length ? `With you: ${st.guests.join(", ")}` : "Waiting for friends. The world runs while this screen is up only if you go back to it."}</div>` : `<div class="sub">Opens this world to friends on this computer's browser for now, and on the wire later (docs/31/04).</div>`}
        <div class="screen-buttons">${open ? "" : button("host-open", "Open this world")}${button("back", open ? "Back to the game" : "Back")}</div>
      </div>`;
  } else if (current === "join" && wireApi) {
    const st = wireApi.status();
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
  } else if (current === "character" && youApi) {
    root.innerHTML = characterHtml();
    startPreview();
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
        ${youApi ? "" : hairRow()}
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
