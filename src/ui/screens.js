// Screens: the title, the Worlds screen, the identities, character creation, the pause
// menu, settings, controls, the dead screen (docs/10, "Screens"; docs/31/09, worlds,
// identities, characters). Plain DOM in the UI layer, so they scale with it like a web
// page. While any screen is up the game is paused when played alone; main.js hears about
// it through onChange. Escape steps back: settings or controls to where they were opened
// from, the pause menu to the game, the title nowhere.
//
// The words (docs/31/09): a world is chosen on the Worlds screen, never assumed; an
// identity is a name and a look kept in the browser; a character is a survivor in one
// world, made from an identity in a creation of two steps (the identity, then a page
// where skills will go), and it belongs to that world.

import * as settings from "../settings.js";

// A code, a name, or an address can come off the URL or a friend: never into innerHTML as it is.
function esc(text) {
  return String(text ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
}

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
  ["Enter", "Chat: type a line, Enter says it"],
  ["/", "Chat: a command (nothing answers yet)"],
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
let from = null; // the screen a sub-screen returns to
let onChange = () => {};
let hairApi = null; // { styles(), current(), set(name), reload() } from main.js
let layersApi = null; // { slots(), names(slot), current(slot), set(slot, name) }
let onReload = () => window.location.reload();
let onSave = () => {};
let youApi = null; // the identity editor's api from main.js: name(), setName(n), look(), setLook(p), styles(), palette(), sheet()
let wireApi = null; // { status(), setOpen(on), join(code, identityId) } from main.js (net.js)
let worldsApi = null; // { list(), friends(), play(id), remove(id), forget(code), create(name, identityId), respawn(identityId), defaultName(), here(), leave() }
let identitiesApi = null; // { list(), editing(), beginNew(), beginEdit(id), commit(), cancel(), remove(id), last() }
let data = {};
let previewTimer = null; // the identity editor's turning figure
let previewFacing = 0;
let creation = null; // character creation in progress: { for: "new" | "join" | "respawn", name, code, step, identityId }
const CREATION_STEPS = 2; // the identity, then the placeholder for the skills to come (docs/31/09; 1 switches the placeholder off)
let waitTimer = null; // Rejoin's wait for the host to open the world: polls the relay, joins once
let openState = new Map(); // code -> { open, guests } from the relay, for the friends' rows' dot
let dotTimer = null;

export function initScreens(handlers = {}) {
  onChange = handlers.onChange || onChange;
  hairApi = handlers.hair || null;
  layersApi = handlers.layers || null;
  onReload = handlers.onReload || onReload;
  onSave = handlers.onSave || onSave;
  youApi = handlers.you || null;
  wireApi = handlers.wire || null;
  worldsApi = handlers.worlds || null;
  identitiesApi = handlers.identities || null;
  root = document.getElementById("screens");
  root.hidden = true;
  root.addEventListener("click", (e) => {
    const btn = e.target.closest("button[data-go]");
    if (btn) return go(btn.dataset.go, btn.dataset);
    // The identity editor's swatches and rows: each sets one field of the look and redraws (youApi).
    const lookBtn = e.target.closest("button[data-look-key]");
    if (lookBtn && youApi) {
      youApi.setLook({ [lookBtn.dataset.lookKey]: lookBtn.dataset.lookValue });
      render();
      return;
    }
    const pick = e.target.closest("button[data-pick]");
    if (pick && creation) {
      creation.identityId = pick.dataset.pick;
      if (identitiesApi) identitiesApi.setLast(creation.identityId);
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
    // The world's code to the clipboard (Michael, 2026-10-13: he had to copy it out of the DOM).
    const copy = e.target.closest("#host-copy");
    if (copy) {
      const field = root.querySelector("#host-code");
      const code = field ? field.value : "";
      const done = () => { copy.textContent = "Copied"; };
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(code).then(done, () => { field && field.select(); });
      else if (field) { field.select(); try { document.execCommand("copy"); done(); } catch { /* selected, at least */ } }
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
const SUB = new Set(["settings", "controls", "character", "host"]);
// The screens that are steps of a flow: Back is explicit (go("back") knows the step before).
const FLOW = new Set(["worlds", "identities", "identity", "newworld", "join", "create", "creatorkey", "ownerkey"]);

export function show(name, extra = {}) {
  data = extra;
  if (SUB.has(name)) {
    if (current && !SUB.has(current)) from = current;
  } else if (!FLOW.has(name)) from = null;
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
  else if (current === "away") { if (worldsApi && worldsApi.comeBack) worldsApi.comeBack(); }
  else if (FLOW.has(current)) stepBack();
  // The title stays; the dead screen stays until a choice is made.
  return true;
}

// Where Back leads in the flows: worlds and identities to the title (or the pause menu in a world),
// a world's name and the join code to Worlds, the creation to where it began, the editor to its caller.
function stepBack() {
  if (current === "worlds" || current === "identities") show(worldsApi && worldsApi.here().inWorld ? "pause" : "title");
  else if (current === "newworld" || current === "join" || current === "creatorkey" || current === "ownerkey") show("worlds");
  else if (current === "create") {
    if (creation && creation.step > 1) { creation.step--; render(); return; }
    const c = creation;
    creation = null;
    if (c && c.for === "new") show("newworld", { name: c.name });
    else if (c && c.for === "join") show("join", { code: c.code });
    else if (c && c.for === "respawn") show("dead", data);
    else show("worlds");
  } else if (current === "identity") {
    if (identitiesApi) identitiesApi.cancel();
    show(creation ? "create" : "identities");
  }
}

function go(where, ds = {}) {
  if (where === "resume") hide();
  else if (where === "back") back();
  else if (where === "reload") onReload();
  else if (where === "save") onSave();
  else if (where === "leave") {
    if (!worldsApi) return;
    const h = worldsApi.here();
    if (h.role === "host" && h.guests > 0 && !window.confirm(`Leaving closes the world to the ${h.guests} with you. Leave?`)) return;
    worldsApi.leave();
  }
  // The Worlds screen's rows.
  else if (where === "play") { if (worldsApi) worldsApi.play(ds.world); }
  else if (where === "delete") { if (worldsApi && window.confirm("Delete this world and every character in it?")) Promise.resolve(worldsApi.remove(ds.world)).then(() => { if (current === "worlds") render(); }); }
  else if (where === "forget") { if (worldsApi) { worldsApi.forget(ds.code); render(); } }
  else if (where === "move-up") startMoveUp(ds.world);
  else if (where === "server-play") { if (worldsApi && worldsApi.playServer) worldsApi.playServer(ds.world); }
  else if (where === "bring-home") { if (window.confirm("Bring this world home to this browser? Friends will join it here again, only while you play.")) startBringHome(ds.world); }
  else if (where === "creatorkey-save") {
    const field = root.querySelector("#creator-key");
    const key = field ? field.value.trim() : "";
    if (!key || !worldsApi) return;
    worldsApi.setCreatorKey(key);
    startMoveUp(data.world);
  }
  else if (where === "ownerkey-copy") {
    const field = root.querySelector("#owner-key");
    if (field) { field.select(); if (navigator.clipboard) navigator.clipboard.writeText(field.value).catch(() => {}); }
  }
  else if (where === "ownerkey-done") show("worlds", {});
  else if (where === "rejoin") startRejoin(ds.code, ds.name || "");
  else if (where === "wait-cancel") { stopWait(); show("worlds"); }
  // A new world: its name, then a character for it.
  else if (where === "newworld") show("newworld", { name: worldsApi ? worldsApi.defaultName() : "" });
  else if (where === "newworld-next") {
    const field = root.querySelector("#world-name");
    const name = (field && field.value.trim()) || (worldsApi ? worldsApi.defaultName() : "A world");
    beginCreation({ for: "new", name });
  }
  // Joining: the code, then a character for the friend's world.
  else if (where === "join") show("join", {});
  else if (where === "join-next") {
    // The join goes out at once with the browser's id; the host asks for an identity only if it must (main.js).
    const field = root.querySelector("#join-code");
    const code = (field && field.value.trim().toLowerCase()) || "";
    if (code && wireApi) wireApi.join(code);
  }
  // Character creation's steps.
  else if (where === "create-next") {
    if (!creation) return;
    if (creation.step === 1 && !creation.identityId) return;
    if (creation.step < CREATION_STEPS) { creation.step++; render(); return; }
    finishCreation();
  }
  // The identity editor, from the identities screen or from creation's first step.
  else if (where === "identity-new") { if (identitiesApi) { identitiesApi.beginNew(); show("identity"); } }
  else if (where === "identity-edit") { if (identitiesApi) { identitiesApi.beginEdit(ds.identity); show("identity"); } }
  else if (where === "identity-delete") { if (identitiesApi && window.confirm("Delete this identity? Characters made from it are not touched.")) { identitiesApi.remove(ds.identity); render(); } }
  else if (where === "identity-save") {
    if (!identitiesApi) return;
    const saved = identitiesApi.commit();
    if (creation && saved) creation.identityId = saved.id;
    show(creation ? "create" : "identities");
  }
  else if (where === "identity-cancel") { if (identitiesApi) identitiesApi.cancel(); show(creation ? "create" : "identities"); }
  // The dead screen: a new character in this same world.
  else if (where === "respawn") beginCreation({ for: "respawn" });
  else if (where === "comeback") { if (worldsApi && worldsApi.comeBack) worldsApi.comeBack(); }
  // Hosting as a switch.
  else if (where === "open-on") { if (wireApi) wireApi.setOpen(true); render(); }
  else if (where === "open-off") { if (wireApi) wireApi.setOpen(false); render(); }
  else show(where);
}

function beginCreation(c) {
  const lastId = identitiesApi && identitiesApi.last() ? identitiesApi.last().id : null;
  creation = { step: 1, identityId: lastId, ...c };
  show("create");
}

// The host asked for an identity (main.js, `who`): the steps, over the stand-in world; `dead` says why.
export function creationFor(c) {
  beginCreation(c);
}

function finishCreation() {
  const c = creation;
  creation = null;
  if (!c || !c.identityId) return;
  if (identitiesApi) identitiesApi.setLast(c.identityId);
  if (c.for === "new" && worldsApi) worldsApi.create(c.name, c.identityId);
  else if (c.for === "join" && wireApi) wireApi.joinAs(c.identityId);
  else if (c.for === "respawn" && worldsApi) worldsApi.respawn(c.identityId);
}

// Rejoin (docs/31/09): with a relay, ask every few seconds whether the world is open, for a minute, and
// join once it is (two friends refreshing at once is the usual case); without one, join at once.
function startRejoin(code, name) {
  if (!wireApi) return;
  const st = wireApi.status();
  if (!st || !st.relay || !wireApi.isOpen) return wireApi.join(code);
  stopWait();
  show("waiting", { code, name, since: Date.now() });
  const tryOnce = async () => {
    const r = await wireApi.isOpen(code);
    if (current !== "waiting") return stopWait();
    if (r && r.open) {
      stopWait();
      wireApi.join(code);
    } else if (Date.now() - data.since > 60000) {
      stopWait();
      show("worlds", { note: `${name || code} did not open in a minute. Rejoin tries again.` });
    }
  };
  tryOnce();
  waitTimer = setInterval(tryOnce, 3000);
}

function stopWait() {
  if (waitTimer) clearInterval(waitTimer);
  waitTimer = null;
}

// The friends' rows' dot: the relay asked for each code every few seconds while the Worlds screen is up.
function pollOpen() {
  if (current !== "worlds" || !wireApi || !wireApi.isOpen) return;
  const st = wireApi.status();
  if (!st || !st.relay) return;
  const rows = worldsApi ? worldsApi.friends() : [];
  Promise.all(rows.map((r) => wireApi.isOpen(r.code).then((o) => [r.code, o]))).then((pairs) => {
    if (current !== "worlds") return;
    let changed = false;
    for (const [code, o] of pairs) {
      const was = openState.get(code);
      if (!o) continue;
      if (!was || was.open !== o.open || was.guests !== o.guests) changed = true;
      openState.set(code, o);
    }
    if (changed) render();
  });
}

function button(go, label, extra = "") {
  return `<button class="kit-button" data-go="${go}"${extra}>${label}</button>`;
}

function settingRow(key, label) {
  // A world rule on a guest is the host's (docs/31/07, question 13; item 4): shown as the host set it, not to be changed here.
  const hostRules = worldsApi && worldsApi.here ? worldsApi.here().rules : null;
  const hosts = !!hostRules && key in hostRules;
  const cur = hosts ? hostRules[key] : settings.get(key);
  const choices = settings.CHOICES[key]
    .map(([v, text]) => `<button data-key="${key}" data-value='${JSON.stringify(v)}' class="${v === cur ? "on" : ""}"${hosts ? " disabled" : ""}>${text}</button>`)
    .join("");
  return `<div class="setting${hosts ? " hosts" : ""}"${hosts ? ` title="The host's world rule"` : ""}><span>${label}${hosts ? " <small>(the host's)</small>" : ""}</span><span class="choices">${choices}</span></div>`;
}

// Hair styles, generated and painted (docs/12), with a reload for ones just saved from the editor.
function hairRow() {
  if (!hairApi) return "";
  const cur = hairApi.current();
  const choices = hairApi.styles().map((s) => `<button data-hair="${s}" class="${s === cur ? "on" : ""}">${s}</button>`).join("");
  return `<div class="setting"><span>Hair</span><span class="choices">${choices}<button id="hair-reload" title="Pick up styles saved from tools/hair.html">Reload</button></span></div>`;
}

// ---- the identity editor (docs/12, the creation screen as built; docs/31/09, an identity) ----
// A name, the skin from the approved ramp (the three dead tones allowed for fun), the hair
// style with bald first, the hair and eye colours; the figure turning beside them, baked by
// the game's own figure code in the kit's clothes. What it edits is one identity (main.js).

function swatchRow(label, key, colours, cur) {
  const btns = colours.map((c) => `<button class="swatch${c === cur ? " on" : ""}" data-look-key="${key}" data-look-value="${c}" style="--swatch:${c}" title="${c}"></button>`).join("");
  return `<div class="you-row"><span>${label}</span><span class="swatches">${btns}</span></div>`;
}

function identityHtml() {
  const look = youApi.look();
  const pal = youApi.palette();
  const styles = youApi.styles().map((s) => `<button data-look-key="hairStyle" data-look-value="${s}" class="${s === look.hairStyle ? "on" : ""}">${s}</button>`).join("");
  return `
    <div class="screen screen-wide you">
      <h1>${identitiesApi && identitiesApi.editing() && identitiesApi.editing().id ? "Edit identity" : "New identity"}</h1>
      <div class="sub">A name and a look, kept in this browser: the seed a character is made from. A character already made keeps what it was given.</div>
      <div class="you-body">
        <canvas class="you-preview" width="144" height="216"></canvas>
        <div class="you-rows">
          <div class="you-row"><span>Name</span><input type="text" maxlength="24" data-name value="${esc(youApi.name() || "")}" placeholder="a name"></div>
          ${swatchRow("Skin", "skin", pal.skins.living, look.skin)}
          ${swatchRow("The dead's", "skin", pal.skins.dead, look.skin)}
          <div class="you-row"><span>Hair</span><span class="choices">${styles}</span></div>
          ${swatchRow("Hair colour", "hair", pal.hair, look.hair)}
          ${swatchRow("Eyes", "eyes", pal.eyes, look.eyes)}
        </div>
      </div>
      <div class="screen-buttons row">${button("identity-save", "Save")}${button("identity-cancel", "Cancel")}<button id="hair-reload" title="Pick up styles saved from tools/hair.html">Reload hair</button></div>
    </div>`;
}

// The figure drawn at three times, turning through the eight facings.
function startPreview(sheetFn) {
  stopPreview();
  const canvas = root.querySelector(".you-preview");
  if (!canvas || !sheetFn) return;
  let sheet = null;
  try { sheet = sheetFn(); } catch (err) { console.warn("The preview could not bake:", err.message); return; }
  if (!sheet) return;
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
    const choices = [`<button data-layer-slot="${slot}" data-layer-name="" class="${cur ? "" : "on"}">worn</button>`, ...names.map((n) => `<button data-layer-slot="${slot}" data-layer-name="${n}" class="${n === cur ? "on" : ""}">${n}</button>`)].join("");
    return `<div class="setting"><span>Layer: ${slot}</span><span class="choices">${choices}</span></div>`;
  }).join("");
}

// ---- the lists ----

function worldRows() {
  const rows = worldsApi ? worldsApi.list() : [];
  if (!rows.length) return `<div class="sub">No worlds yet. New world makes one.</div>`;
  const h = worldsApi && worldsApi.here ? worldsApi.here() : {};
  const canMove = !!(worldsApi && worldsApi.canMove && worldsApi.canMove());
  const id = (w) => ` data-world="${esc(w.worldId)}"`;
  // What a row offers by where the world lives (item 5's fifth step): here, on the server, or on its way home.
  const buttonsFor = (w) => {
    const inPlay = h.inWorld && h.worldId === w.worldId;
    if (w.home === "server") return button("server-play", "Play", id(w)) + (canMove ? button("bring-home", "Bring it home", id(w)) : "");
    if (w.home === "arriving") return canMove ? button("bring-home", "Finish bringing it home", id(w)) : "";
    return (w.playable ? button("play", w.dead ? "New character" : "Play", id(w)) : "") + (canMove && w.playable && !inPlay ? button("move-up", "Move to the server", id(w)) : "") + button("delete", "Delete", id(w));
  };
  const where = (w) => (w.home === "server" ? ` · on the server, code <code>${esc(w.serverCode || "")}</code>` : w.home === "arriving" ? " · on its way home" : w.code ? ` · code <code>${esc(w.code)}</code>` : "");
  return `<div class="rows">${rows.map((w) => `
    <div class="row-item">
      <div class="row-main"><b>${esc(w.name)}</b><span class="row-sub">${esc(w.label)}${w.myCharacter ? ` · ${w.dead ? `${esc(w.myCharacter)} died` : `as ${esc(w.myCharacter)}`}` : " · no survivor"}${where(w)}${w.playable ? "" : ` · on another map (${esc(w.mapName)})`}</span></div>
      <div class="row-buttons">${buttonsFor(w)}</div>
    </div>`).join("")}</div>`;
}

// Moving a world to the server: the creator key first if this browser has none, then a word of what it means.
function startMoveUp(worldId) {
  if (!worldsApi || !worldsApi.moveUp) return;
  if (!worldsApi.creatorKey()) return show("creatorkey", { world: worldId });
  if (!window.confirm("Move this world to the server? Your friends can play it while you are away. It plays only there until you bring it home.")) return;
  show("worlds", { note: "Moving the world to the server…" });
  worldsApi.moveUp(worldId).then((r) => {
    if (r.ok) return show("ownerkey", r);
    if (r.need === "creatorKey") return show("creatorkey", { world: worldId, note: r.error || "" });
    show("worlds", { note: r.error || "The world did not move." });
  });
}

function startBringHome(worldId) {
  if (!worldsApi || !worldsApi.bringHome) return;
  show("worlds", { note: "Bringing the world home…" });
  worldsApi.bringHome(worldId).then((r) => show("worlds", { note: r.ok ? `${r.name} is home: it plays in this browser again.` : r.error || "The world did not come home." }));
}

function friendRows() {
  const rows = worldsApi ? worldsApi.friends() : [];
  if (!rows.length) return "";
  const dot = (code) => {
    const o = openState.get(code);
    if (!o) return `<span class="dot" title="not asked yet"></span>`;
    return `<span class="dot ${o.open ? "on" : "off"}" title="${o.open ? `open now, ${o.guests} in` : "not open now"}"></span>`;
  };
  return `<h2>Friends' worlds</h2><div class="rows">${rows.map((r) => `
    <div class="row-item">
      <div class="row-main"><b>${dot(r.code)}${esc(r.name || r.code)}</b><span class="row-sub">${r.hostName ? `${esc(r.hostName)}'s · ` : ""}code <code>${esc(r.code)}</code>${r.myCharacter ? ` · as ${esc(r.myCharacter)}` : ""}</span></div>
      <div class="row-buttons">${button("rejoin", "Rejoin", ` data-code="${esc(r.code)}" data-name="${esc(r.name || "")}"`)}${button("forget", "Forget", ` data-code="${esc(r.code)}"`)}</div>
    </div>`).join("")}</div>`;
}

function identityRows(pickable) {
  const rows = identitiesApi ? identitiesApi.list() : [];
  if (!rows.length) return `<div class="sub">No identities yet.</div>`;
  const picked = creation ? creation.identityId : null;
  return `<div class="rows">${rows.map((i) => `
    <div class="row-item${pickable && i.id === picked ? " on" : ""}">
      <div class="row-main"><b>${esc(i.name || "(no name)")}</b><span class="row-sub">${i.look && i.look.hairStyle ? esc(i.look.hairStyle) : "short"} hair</span></div>
      <div class="row-buttons">${pickable ? `<button class="kit-button${i.id === picked ? " on" : ""}" data-pick="${esc(i.id)}">${i.id === picked ? "Chosen" : "Choose"}</button>` : ""}${button("identity-edit", "Edit", ` data-identity="${esc(i.id)}"`)}${pickable ? "" : button("identity-delete", "Delete", ` data-identity="${esc(i.id)}"`)}</div>
    </div>`).join("")}</div>`;
}

function render() {
  if (!root) return;
  root.className = current || "";
  stopPreview();
  if (dotTimer) { clearInterval(dotTimer); dotTimer = null; }
  if (current !== "waiting") stopWait();
  if (current === "title") {
    root.innerHTML = `
      <div class="screen">
        <h1>Cozy Medieval Zombies</h1>
        <div class="sub">A village of the dead. Keep the shutters closed.</div>
        ${data.note ? `<div class="sub note">${esc(data.note)}</div>` : ""}
        <div class="screen-buttons">${button("worlds", "Worlds")}${button("identities", "Identities")}${button("settings", "Settings")}${button("controls", "Controls")}</div>
      </div>`;
  } else if (current === "worlds") {
    root.innerHTML = `
      <div class="screen screen-wide">
        <h1>Worlds</h1>
        <div class="sub">Each world keeps its own characters. Nothing runs until you choose one.</div>
        ${data.note ? `<div class="sub note">${esc(data.note)}</div>` : ""}
        <h2>My worlds</h2>
        ${worldRows()}
        ${friendRows()}
        <div class="screen-buttons row">${button("newworld", "New world")}${button("join", "Join a game")}${button("back", "Back")}</div>
      </div>`;
    pollOpen();
    dotTimer = setInterval(pollOpen, 10000);
  } else if (current === "creatorkey") {
    // The creator key (item 5's fifth step): a secret Michael hands out; it lets this browser move a world to the server.
    root.innerHTML = `
      <div class="screen">
        <h1>The server's key</h1>
        <div class="sub">Moving a world to the server needs the key the server's keeper gave you. This browser keeps it.</div>
        ${data.note ? `<div class="sub note">${esc(data.note)}</div>` : ""}
        <div class="setting"><span>Key</span><span class="choices"><input id="creator-key" type="password" maxlength="200" autocomplete="off" spellcheck="false"></span></div>
        <div class="screen-buttons row">${button("creatorkey-save", "Move the world")}${button("worlds", "Back")}</div>
      </div>`;
    const field = root.querySelector("#creator-key");
    field.addEventListener("keydown", (e) => { e.stopPropagation(); if (e.code === "Enter") go("creatorkey-save"); });
    field.addEventListener("keyup", (e) => e.stopPropagation());
    field.focus();
  } else if (current === "ownerkey") {
    // The owner key, shown once (item 5's fifth step): it proves the world is yours, here and on any other device.
    root.innerHTML = `
      <div class="screen">
        <h1>${esc(data.name || "The world")} is on the server</h1>
        <div class="sub">Friends join it with the code <code>${esc(data.code || "")}</code>, whenever they like.</div>
        <div class="sub">This is your owner key. This browser keeps it; write it down too. It is shown only now, and it is what proves the world is yours on any other device, and what brings it home.</div>
        <div class="setting"><span>Owner key</span><span class="choices"><input id="owner-key" type="text" readonly value="${esc(data.ownerKey || "")}" spellcheck="false"></span></div>
        <div class="screen-buttons row">${button("ownerkey-copy", "Copy")}${button("ownerkey-done", "Done")}</div>
      </div>`;
    root.querySelector("#owner-key").select();
  } else if (current === "waiting") {
    root.innerHTML = `
      <div class="screen">
        <h1>Rejoin</h1>
        <div class="sub">Waiting for ${esc(data.name || data.code)} to open. The join goes as soon as it is.</div>
        <div class="sub">code <code>${esc(data.code)}</code></div>
        <div class="screen-buttons row">${button("wait-cancel", "Cancel")}</div>
      </div>`;
  } else if (current === "newworld") {
    root.innerHTML = `
      <div class="screen">
        <h1>New world</h1>
        <div class="sub">A name for it; then a character for it.</div>
        <div class="setting"><span>Name</span><span class="choices"><input id="world-name" type="text" maxlength="40" value="${esc(data.name || "")}" autocomplete="off" spellcheck="false"></span></div>
        <div class="screen-buttons row">${button("newworld-next", "Next")}${button("back", "Back")}</div>
      </div>`;
    const field = root.querySelector("#world-name");
    field.addEventListener("keydown", (e) => { e.stopPropagation(); if (e.code === "Enter") go("newworld-next"); });
    field.addEventListener("keyup", (e) => e.stopPropagation());
    field.focus();
    field.select();
  } else if (current === "join") {
    const st = wireApi ? wireApi.status() : null;
    root.innerHTML = `
      <div class="screen">
        <h1>Join a game</h1>
        <div class="sub">${st && st.relay ? `Through the relay at ${esc(st.relay)}. ` : ""}Type the host's code; then a character for their world.</div>
        <div class="setting"><span>Code</span><span class="choices"><input id="join-code" type="text" maxlength="24" placeholder="oak-abc" value="${esc(data.code || "")}" autocomplete="off" spellcheck="false"></span></div>
        <div class="screen-buttons row">${button("join-next", "Next")}${button("back", "Back")}</div>
      </div>`;
    const codeEl = root.querySelector("#join-code");
    codeEl.addEventListener("keydown", (e) => { e.stopPropagation(); if (e.code === "Enter") go("join-next"); });
    codeEl.addEventListener("keyup", (e) => e.stopPropagation());
    codeEl.focus();
  } else if (current === "create" && creation) {
    const c = creation;
    const what = c.for === "new" ? `for ${esc(c.name)}` : c.for === "join" ? `for ${esc(c.code)}'s world` : "for this world";
    const why = c.for === "join" && c.dead ? `<div class="sub note">Your survivor there died. A new one, from any identity.</div>` : "";
    const stepHtml = c.step === 1
      ? `<h2>Step 1 of ${CREATION_STEPS}: the identity</h2><div class="sub">The name and the face this character is made from. A character keeps them for life.</div>${identityRows(true)}<div class="screen-buttons row">${button("identity-new", "New identity")}</div>`
      : `<h2>Step 2 of ${CREATION_STEPS}: to come</h2><div class="sub">Skills and a profession will be chosen here. Nothing to choose yet; Next makes the character.</div>`;
    root.innerHTML = `
      <div class="screen screen-wide">
        <h1>A character ${what}</h1>
        ${why}
        ${stepHtml}
        <div class="screen-buttons row">${button("create-next", c.step < CREATION_STEPS ? "Next" : c.for === "join" ? "Join as this" : "Into the valley")}${button("back", "Back")}</div>
      </div>`;
  } else if (current === "identities") {
    root.innerHTML = `
      <div class="screen screen-wide">
        <h1>Identities</h1>
        <div class="sub">A name and a look each, kept in this browser. A character is made from one and then keeps it; editing an identity changes no character.</div>
        ${identityRows(false)}
        <div class="screen-buttons row">${button("identity-new", "New identity")}${button("back", "Back")}</div>
      </div>`;
  } else if (current === "identity" && youApi) {
    root.innerHTML = identityHtml();
    startPreview(youApi.sheet);
  } else if (current === "pause") {
    const here = worldsApi ? worldsApi.here() : { name: "", myCharacter: "", role: null };
    const where = here.role === "guest"
      ? `In ${esc(here.hostName || here.name || here.code)}'s world as ${esc(here.myCharacter || "")}.`
      : `${esc(here.name)}, as ${esc(here.myCharacter || "")}.${here.role === "host" ? ` Open to friends, code ${esc(here.code)}: ${here.guests} with you.` : ""}`;
    root.innerHTML = `
      <div class="screen">
        <h1>${here.role ? "Menu" : "Paused"}</h1>
        <div class="sub">${where}</div>
        <div class="sub">${here.role ? "The world goes on while you are here; your character stands still." : "Esc to resume"}</div>
        <div class="screen-buttons">${button("resume", "Resume")}${here.role === "guest" ? "" : button("save", "Save world")}${here.role === "guest" ? "" : button("host", here.role === "host" ? "Open to friends: on" : "Open to friends: off")}${button("character", "Character")}${button("settings", "Settings")}${button("controls", "Controls")}${button("leave", "Leave world")}</div>
      </div>`;
  } else if (current === "host" && wireApi) {
    // Hosting as a switch (docs/31/09): on, the world is on the relay under its code; off, it is yours alone.
    const st = wireApi.status();
    const on = st && st.role === "host";
    const here = worldsApi ? worldsApi.here() : {};
    root.innerHTML = `
      <div class="screen">
        <h1>Open to friends</h1>
        <div class="sub">${st && st.relay ? `Through the relay at ${esc(st.relay)}: anyone with the code can join.` : "With no relay set, a friend must join from another tab of this same browser (docs/31/04)."}</div>
        ${here.code ? `<div class="sub">The world's code: <input id="host-code" class="code" type="text" readonly value="${esc(here.code)}" spellcheck="false"> <button id="host-copy" class="kit-button">Copy</button></div>` : `<div class="sub">The world gets its code the first time it opens, and keeps it.</div>`}
        <div class="sub">${on ? `${st.guests.length ? `With you: ${st.guests.map(esc).join(", ")}` : "Open. Waiting for friends."}` : "Closed."}</div>
        <div class="screen-buttons">${on ? button("open-off", "Close to friends") : button("open-on", "Open to friends")}${button("back", "Back")}</div>
      </div>`;
  } else if (current === "character") {
    // This world's character: what it was given, shown, not edited (docs/31/09; a new face is a new character).
    const here = worldsApi ? worldsApi.here() : {};
    root.innerHTML = `
      <div class="screen you">
        <h1>${esc(here.myCharacter || "Your character")}</h1>
        <div class="sub">A survivor of ${esc(here.name || "this world")}. Made from an identity and keeping it; skills and a story will show here.</div>
        <div class="you-body"><canvas class="you-preview" width="144" height="216"></canvas></div>
        <div class="screen-buttons row">${button("back", "Back")}</div>
      </div>`;
    startPreview(youApi ? youApi.characterSheet : null);
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
  } else if (current === "away") {
    // Stepped away (item 3, `02` 2026-10-13): five minutes with no input in a world with friends in it.
    root.innerHTML = `
      <div class="screen">
        <h1>You stepped away</h1>
        <div class="sub">Five minutes with nothing pressed. Your character is out of the world and safe where it stood; your friends play on. Press any key or click to come back.</div>
        <div class="screen-buttons">${button("comeback", "Come back")}</div>
      </div>`;
  } else if (current === "dead") {
    root.innerHTML = `
      <div class="screen">
        <h1>${esc(data.who || "You")} died</h1>
        <div class="sub">${esc(data.when || "")}. The body stays where it fell.</div>
        <div class="screen-buttons">${button("respawn", "New character")}${button("leave", "Leave world")}</div>
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
