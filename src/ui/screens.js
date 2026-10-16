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

// The keys, grouped (docs/38 Q8, #111): one place for each, the testing keys apart, R written once.
const CONTROLS = [
  ["Moving and doing", [
    ["W A S D / arrows", "Walk"],
    ["Shift", "Sprint"],
    ["Z / wheel", "Zoom: wide, middle, close"],
    ["E", "Nearest action; hold to climb through a window"],
    ["Right-click", "Everything you can do to what is under the cursor"],
    ["Esc", "Close what is open, else pause"],
  ]],
  ["Fighting", [
    ["Left-click", "Swing what you hold; fists with nothing. Hold to draw a bow or cast"],
    ["Q / middle-click", "The main hand's other mode: the halberd's thrust, a spear's throw"],
    ["Right-click held", "The off hand's stance: block with a shield, brace a bow"],
    ["Space", "Shove: pushes the dead back, no damage"],
  ]],
  ["Your things", [
    ["Tab", "Your bag"],
    ["C", "Your character"],
    ["1 to 4", "Swap a belt slot with your hand"],
    ["Double-click", "Equip or unequip a thing; else move it across"],
    ["T", "Torch in or out of hand"],
  ]],
  ["Building", [
    ["N", "Build menu: walls, doors, windows"],
    ["X", "Remove: highlights what you built or made, click to destroy it"],
    ["R / wheel", "Turn what you are placing, or the item you are dragging"],
    ["B", "Board up the nearest opening; hold to pull a board"],
  ]],
  ["Talking", [
    ["Enter", "Chat: type a line, Enter says it"],
    ["/", "Chat: a command (nothing answers yet)"],
  ]],
  ["Testing", [
    ["V", "Fog off"],
    ["[ ]", "The hour back or forward"],
    ["L", "Light debug views"],
  ]],
];

let root = null; // where the current screen is drawn: the site's page out of a world, #screens in one (#111)
let screensEl = null; // the game's own screens, over the world
let siteEl = null; // the game's site (index.html #site): everything out of a world is a page of it, never a box (docs/38)
let sitePage = null;
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
let settingsTab = "display"; // the Settings screen's open tab (settings.GROUPS; #108), this page's alone

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
  screensEl = document.getElementById("screens");
  siteEl = document.getElementById("site");
  sitePage = document.getElementById("site-page");
  root = screensEl;
  screensEl.hidden = true;
  // The same handlers on both: a screen is drawn in one or the other, and the site's menu is its own buttons (data-go).
  for (const el of [screensEl, siteEl].filter(Boolean)) listen(el);
  settings.onChange(() => {
    if (current === "settings") render();
  });
}

function listen(el) {
  el.addEventListener("click", (e) => {
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
    // A switch: its data-value is the answer it asks for.
    const choice = e.target.closest("button[data-key]");
    if (choice) {
      settings.set(choice.dataset.key, JSON.parse(choice.dataset.value));
      render();
    }
    const tab = e.target.closest("button[data-tab]");
    if (tab) {
      settingsTab = tab.dataset.tab;
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
  // A dropdown's keys are its own (the arrows pick an answer; input.js would cancel them, and a letter would walk the
  // player); Escape still reaches the screens, and a release is let through so no key is left down (#65, #80).
  el.addEventListener("keydown", (e) => {
    if (e.target && e.target.tagName === "SELECT" && e.code !== "Escape") e.stopPropagation();
  });
  // The dropdowns (#108): a setting, the hair or a painted layer to try, the identity editor's hair style.
  el.addEventListener("change", (e) => {
    const sel = e.target.closest("select");
    if (!sel) return;
    if (sel.dataset.key) settings.set(sel.dataset.key, JSON.parse(sel.value));
    else if ("hair" in sel.dataset && hairApi) hairApi.set(JSON.parse(sel.value));
    else if (sel.dataset.layerSlot && layersApi) layersApi.set(sel.dataset.layerSlot, JSON.parse(sel.value) || null);
    else if (sel.dataset.lookKey && youApi) youApi.setLook({ [sel.dataset.lookKey]: JSON.parse(sel.value) });
    else return;
    render();
  });
  el.addEventListener("input", (e) => {
    const name = e.target.closest("input[data-name]");
    if (name && youApi) youApi.setName(name.value);
  });
}

// Out of a world, or in one: the site or the game's own screens (docs/38, #111).
function outOfWorld() {
  const h = worldsApi && worldsApi.here ? worldsApi.here() : null;
  return !(h && h.inWorld) || !!(h && h.joining); // a join still waiting for its welcome is not in a world yet
}

// Where the current screen goes: out of a world the site's page, the site showing and the game's screens hidden; in
// one, #screens over the world and the site hidden.
// The stage goes while the site shows: its canvas would hold a narrow window (a phone's) at its own width, and the
// site is a page that follows the window.
function place() {
  const site = outOfWorld() && !!sitePage;
  root = site ? sitePage : screensEl;
  if (siteEl) siteEl.hidden = !site;
  screensEl.hidden = site;
  showStage(!site);
}

function showStage(on) {
  const stage = document.getElementById("stage");
  if (!stage || stage.hidden === !on) return;
  stage.hidden = !on;
  if (on) window.dispatchEvent(new Event("resize")); // view.js measures the window again, now the canvas is back
}

export function currentScreen() {
  return current;
}

// The screens that return to where they were opened from (Escape, Back, Done).
const SUB = new Set(["settings", "controls", "character", "host"]);
// The screens that are steps of a flow: Back is explicit (go("back") knows the step before).
const FLOW = new Set(["worlds", "identities", "identity", "newworld", "join", "create", "creatorkey", "ownerkey", "owner", "addowned"]);

export function show(name, extra = {}) {
  data = extra;
  if (SUB.has(name)) {
    if (current && !SUB.has(current)) from = current;
  } else if (!FLOW.has(name)) from = null;
  current = name;
  place();
  render();
  onChange(current);
}

export function hide() {
  stopPreview();
  current = null;
  from = null;
  screensEl.hidden = true;
  if (siteEl) siteEl.hidden = true; // into a world: the site goes with the screens
  showStage(true);
  onChange(null);
}

// Escape. Returns true if a screen took it.
export function back() {
  if (!current) return false;
  if (SUB.has(current)) show(from || (outOfWorld() ? "title" : "pause"), data);
  else if (current === "about") show("title");
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
  else if (current === "newworld" || current === "join" || current === "creatorkey" || current === "ownerkey" || current === "addowned") show("worlds");
  else if (current === "owner") show(data.from === "pause" ? "pause" : "worlds", {});
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
  // The owner's powers (item 5's sixth step).
  else if (where === "owner") show("owner", { code: ds.code, from: current });
  else if (where === "owner-back") show(data.from === "pause" ? "pause" : "worlds", {});
  else if (where === "owned-play") { if (worldsApi && worldsApi.playOwned) worldsApi.playOwned(ds.code); }
  else if (where === "owner-rotate") {
    if (!window.confirm("Change the code? The old one stops working at once; whoever is in stays. Give the new one to the friends you want.")) return;
    worldsApi.rotateCode(data.code).then((r) => show("owner", { code: r.ok ? r.code : data.code, from: data.from, note: r.ok ? `The new code is ${r.code}.` : r.error }));
  }
  else if (where === "owner-rule") {
    const rules = { ...((data.info && data.info.rules) || {}), [ds.rule]: ds.value === "true" };
    worldsApi.setRules(data.code, rules).then((r) => show("owner", { code: data.code, from: data.from, note: r.ok ? "The rules are set; everyone in the world plays by them now." : r.error }));
  }
  else if (where === "owner-remove" || where === "owner-remove-rotate") {
    const rotate = where === "owner-remove-rotate";
    if (!window.confirm(`Remove ${ds.name || "this player"}${rotate ? " and change the code" : ""}?`)) return;
    worldsApi.removePlayer(data.code, ds.player).then(async (r) => {
      if (!r.ok) return show("owner", { code: data.code, from: data.from, note: r.error });
      if (!rotate) return show("owner", { code: data.code, from: data.from, note: `${r.name} is out.` });
      const c = await worldsApi.rotateCode(data.code);
      show("owner", { code: c.ok ? c.code : data.code, from: data.from, note: c.ok ? `${r.name} is out, and the new code is ${c.code}.` : `${r.name} is out; the code did not change: ${c.error}` });
    });
  }
  else if (where === "owner-unbar") worldsApi.unbar(data.code, ds.hash).then((r) => show("owner", { code: data.code, from: data.from, note: r.ok ? "Let back in." : r.error }));
  else if (where === "addowned") show("addowned", {});
  else if (where === "addowned-save") {
    const code = (root.querySelector("#owned-code") || {}).value || "";
    const key = (root.querySelector("#owned-key") || {}).value || "";
    worldsApi.addOwned(code, key).then((r) => (r.ok ? show("worlds", { note: `${r.name} is among your worlds on the server.` }) : show("addowned", { code, note: r.error })));
  }
  else if (where === "addowned-rekey") {
    const code = (root.querySelector("#owned-code") || {}).value || "";
    const creator = (root.querySelector("#owned-creator") || {}).value || "";
    worldsApi.rekey(code, creator).then((r) => (r.ok ? show("ownerkey", r) : show("addowned", { code, note: r.error })));
  }
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

function button(go, label, extra = "", cls = "") {
  return `<button class="kit-button${cls ? ` ${cls}` : ""}" data-go="${go}"${extra}>${label}</button>`;
}

// When a world was last played, for its card: the time today, else the day and the month.
function lastPlayed(at) {
  if (!at) return "";
  const d = new Date(at);
  const today = new Date().toDateString() === d.toDateString();
  return today ? `played today, ${d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}` : `played ${d.toLocaleDateString(undefined, { day: "numeric", month: "short" })}`;
}

// A world as a card (docs/38, Q8): its name and where it lives, the survivor and whether they live, its day and hour,
// when last played, its code; the main thing to do big, the rest small. The buttons are the rows' as they were.
function card({ name, badge = "", who = "", meta = [], main = "", rest = "" }) {
  return `
    <div class="world-card">
      <div class="wc-text">
        <div class="wc-name"><b>${name}</b>${badge ? `<span class="wc-badge">${badge}</span>` : ""}</div>
        ${who ? `<div class="wc-who">${who}</div>` : ""}
        <div class="wc-meta">${meta.filter(Boolean).join(" · ")}</div>
      </div>
      <div class="wc-actions">${main}<div class="wc-rest">${rest}</div></div>
    </div>`;
}

// A switch: its state is the answer showing, and a click asks for the other one (`data-value`, read by the click
// handler as a choice's value). `attrs` names what it sets.
function switchHtml(on, attrs, disabled = false) {
  return `<button class="switch${on ? " on" : ""}" role="switch" aria-checked="${on}" ${attrs}${disabled ? " disabled" : ""}><span class="knob"></span></button>`;
}

// A dropdown of [value, text] pairs, the value carried as JSON.
function selectHtml(choices, cur, attrs, disabled = false) {
  const opts = choices.map(([v, text]) => `<option value='${esc(JSON.stringify(v))}'${v === cur ? " selected" : ""}>${esc(text)}</option>`).join("");
  return `<select ${attrs}${disabled ? " disabled" : ""}>${opts}</select>`;
}

// One row of the registry (settings.REGISTRY): the label and its line of explanation, then a switch for a true or
// false answer and a dropdown for any other, so the chosen answer is the only one shown (docs/38, #108).
function settingRow(entry) {
  const { key, label, help, choices } = entry;
  // A world rule on a guest is the host's (docs/31/07, question 13; item 4): shown as the host set it, not to be changed here.
  const hostRules = worldsApi && worldsApi.here ? worldsApi.here().rules : null;
  const hosts = !!hostRules && key in hostRules;
  const cur = hosts ? hostRules[key] : settings.get(key);
  let control;
  if (settings.isSwitch(entry)) {
    const text = (choices.find(([v]) => v === !!cur) || [null, ""])[1];
    control = `<span class="switch-state">${esc(text)}</span>${switchHtml(!!cur, `data-key="${key}" data-value='${JSON.stringify(!cur)}'`, hosts)}`;
  } else control = selectHtml(choices, cur, `data-key="${key}"`, hosts);
  return `<div class="setting${hosts ? " hosts" : ""}"${hosts ? ` title="The host's world rule"` : ""}><span class="setting-label">${esc(label)}${hosts ? " <small>(the host's)</small>" : ""}<small class="help">${esc(help || "")}</small></span><span class="control">${control}</span></div>`;
}

// Hair styles, generated and painted (docs/12).
function hairRow() {
  if (!hairApi) return "";
  const styles = hairApi.styles().map((s) => [s, s]);
  return `<div class="setting"><span class="setting-label">Hair<small class="help">The hair to try on the figure.</small></span><span class="control">${selectHtml(styles, hairApi.current(), "data-hair")}</span></div>`;
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
  const styles = selectHtml(youApi.styles().map((s) => [s, s]), look.hairStyle, `data-look-key="hairStyle"`); // a dropdown, as every multiple choice (#108)
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
          <div class="you-row"><span>Hair</span><span class="control">${styles}</span></div>
          ${swatchRow("Hair colour", "hair", pal.hair, look.hair)}
          ${swatchRow("Eyes", "eyes", pal.eyes, look.eyes)}
        </div>
      </div>
      <div class="screen-buttons row">${button("identity-save", "Save")}${button("identity-cancel", "Cancel")}</div>
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

// Painted layers per slot, to try on over whatever is worn; "item" means the item's own art.
function layerRows() {
  if (!layersApi) return "";
  return layersApi.slots().map((slot) => {
    const names = layersApi.names(slot);
    if (!names.length) return "";
    const choices = [["", "item"], ...names.map((n) => [n, n])];
    return `<div class="setting"><span class="setting-label">Layer: ${esc(slot)}<small class="help">A painted layer to try over what is worn there.</small></span><span class="control">${selectHtml(choices, layersApi.current(slot) || "", `data-layer-slot="${esc(slot)}"`)}</span></div>`;
  }).join("");
}

// The Testing tab's rows past the registry's: the hair and the painted layers to try, the hair just painted picked
// up, and the relay this page talks through (it was on the Join screen; docs/38, #108).
function testingExtras() {
  const st = wireApi ? wireApi.status() : null;
  const relay = st && st.relay ? esc(st.relay) : "none: only this browser's own tabs";
  return `${youApi ? "" : hairRow()}${layerRows()}
    <div class="setting"><span class="setting-label">Painted hair<small class="help">Pick up hair styles just saved from tools/hair.html.</small></span><span class="control"><button id="hair-reload" class="kit-button">Reload hair</button></span></div>
    <div class="setting"><span class="setting-label">Relay<small class="help">Where Open to friends and Join go.</small></span><span class="control"><code class="relay">${relay}</code></span></div>`;
}

// ---- the lists ----

function worldRows() {
  const rows = worldsApi ? worldsApi.list() : [];
  if (!rows.length) return `<div class="sub">No worlds yet. New world makes one.</div>`;
  const h = worldsApi && worldsApi.here ? worldsApi.here() : {};
  const canMove = !!(worldsApi && worldsApi.canMove && worldsApi.canMove());
  const id = (w) => ` data-world="${esc(w.worldId)}"`;
  // What a card offers by where the world lives (item 5's fifth step): here, on the server, or on its way home.
  // The main thing big (Play, New character, Bring it home), the rest small (#111, docs/38 Q8).
  const mainFor = (w) => {
    if (w.home === "server") return button("server-play", "Play", id(w), "big");
    if (w.home === "arriving") return canMove ? button("bring-home", "Finish bringing it home", id(w), "big") : "";
    return w.playable ? button("play", w.dead ? "New character" : "Play", id(w), "big") : "";
  };
  const restFor = (w) => {
    const inPlay = h.inWorld && h.worldId === w.worldId;
    if (w.home === "server") return canMove ? button("owner", "Owner", ` data-code="${esc(w.serverCode || "")}"`, "small") + button("bring-home", "Bring it home", id(w), "small") : "";
    if (w.home === "arriving") return "";
    return (canMove && w.playable && !inPlay ? button("move-up", "Move to the server", id(w), "small") : "") + button("delete", "Delete", id(w), "small");
  };
  const code = (w) => (w.home === "server" ? w.serverCode : w.code);
  return `<div class="cards">${rows.map((w) => card({
    name: esc(w.name),
    badge: w.home === "server" ? "on the server" : w.home === "arriving" ? "on its way home" : "",
    who: w.myCharacter ? (w.dead ? `${esc(w.myCharacter)} died` : `as ${esc(w.myCharacter)}`) : "no survivor yet",
    meta: [esc(w.label), lastPlayed(w.savedAt), code(w) ? `code <code>${esc(code(w))}</code>` : "", w.playable ? "" : `on another map (${esc(w.mapName)})`],
    main: mainFor(w),
    rest: restFor(w),
  })).join("")}</div>`;
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

// My worlds on the server with no copy in this browser (moved up on another device, or added here by their key).
function ownedRows() {
  const rows = worldsApi && worldsApi.ownedElsewhere ? worldsApi.ownedElsewhere() : [];
  if (!rows.length) return "";
  return `<h2>My worlds on the server</h2><div class="cards">${rows.map((o) => card({
    name: esc(o.name || o.code),
    badge: "on the server",
    meta: [`code <code>${esc(o.code)}</code>`, "yours by its owner key"],
    main: button("owned-play", "Play", ` data-code="${esc(o.code)}"`, "big"),
    rest: button("owner", "Owner", ` data-code="${esc(o.code)}"`, "small"),
  })).join("")}</div>`;
}

function friendRows() {
  const rows = worldsApi ? worldsApi.friends() : [];
  if (!rows.length) return "";
  const dot = (code) => {
    const o = openState.get(code);
    if (!o) return `<span class="dot" title="not asked yet"></span>`;
    return `<span class="dot ${o.open ? "on" : "off"}" title="${o.open ? `open now, ${o.guests} in` : "not open now"}"></span>`;
  };
  return `<h2>Friends' worlds</h2><div class="cards">${rows.map((r) => card({
    name: `${dot(r.code)}${esc(r.name || r.code)}`,
    who: r.myCharacter ? `as ${esc(r.myCharacter)}` : "",
    meta: [r.hostName ? `${esc(r.hostName)}'s world` : "", `code <code>${esc(r.code)}</code>`, r.lastAt ? lastPlayed(r.lastAt) : ""],
    main: button("rejoin", "Rejoin", ` data-code="${esc(r.code)}" data-name="${esc(r.name || "")}"`, "big"),
    rest: button("forget", "Forget", ` data-code="${esc(r.code)}"`, "small"),
  })).join("")}</div>`;
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

// ---- the site's own pages (docs/38, #111): Home and About; the rest are the screens drawn in its page ----

// The menu's button for the page showing is lit: the flows under Play light Play.
const MENU_OF = { title: "title", about: "about", controls: "controls", settings: "settings", identities: "identities", identity: "identities" };
function markMenu() {
  if (!siteEl) return;
  const lit = MENU_OF[current] || (current ? "worlds" : null);
  for (const b of siteEl.querySelectorAll(".site-nav button[data-go]")) b.classList.toggle("on", b.dataset.go === lit);
}

function homeHtml() {
  return `
    <div class="screen home">
      <p class="lead">A cute village, seen whole, overrun by the dead.</p>
      ${data.note ? `<div class="sub note">${esc(data.note)}</div>` : ""}
      <button class="kit-button cta" data-go="worlds">Play in your browser</button>
      <p class="small">Free, alone or with friends in one world. Nothing to install.</p>
      <p class="small">New here? <a href="https://cmzgame.github.io/cmz-wiki/" target="_blank" rel="noopener">The wiki</a> has the rules of the place.</p>
    </div>`;
}

function aboutHtml() {
  return `
    <div class="screen about">
      <h1>About the game</h1>
      <p>A cute isometric pixel village, medieval and low-fantasy: cottages, an inn, a chapel, a well, a smithy. The dead have risen. You move through the village as one continuous place; the world keeps looking cute, and the dead keep coming.</p>
      <h2>One continuous place</h2>
      <p>Buildings are made of the same tiles as the street. There is no cut between inside and outside: you look out of a window, and they look in.</p>
      <h2>Sight is the game</h2>
      <p>What you can see is what can see you. Darkness hides, fire reveals, and a lit window is an invitation. So is the torch in your hand.</p>
      <h2>The home matters</h2>
      <p>Furnish it, light it, barricade it, sleep in it, and grow food beside it. Wood, water, and seed are what you go out for.</p>
      <h2>Friends in one world</h2>
      <p>Open your world to friends with a code, and they join it from their own browser.</p>
      <p class="small">The game is being made now, and changes often. <a href="https://cmzgame.github.io/cmz-wiki/" target="_blank" rel="noopener">The wiki</a> keeps up with it.</p>
      <div class="screen-buttons row"><button class="kit-button cta" data-go="worlds">Play</button></div>
    </div>`;
}

function render() {
  if (!root) return;
  // #screens takes the screen's name as its class (style.css: #screens.title); the site's page an attribute, so a
  // screen called "controls" never gives the page the .controls grid.
  if (root === screensEl) root.className = current || "";
  else root.dataset.page = current || "";
  markMenu();
  stopPreview();
  if (dotTimer) { clearInterval(dotTimer); dotTimer = null; }
  if (current !== "waiting") stopWait();
  if (current === "title" && root === sitePage) {
    root.innerHTML = homeHtml();
  } else if (current === "about") {
    root.innerHTML = aboutHtml();
  } else if (current === "title") {
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
        ${ownedRows()}
        ${friendRows()}
        <div class="screen-buttons row">${button("newworld", "New world")}${button("join", "Join a game")}${worldsApi && worldsApi.canMove && worldsApi.canMove() ? button("addowned", "A world of mine on the server") : ""}${button("back", "Back")}</div>
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
    // Typing stops the keydown; a release is let through, as in the chat box (#65): input.js only forgets the key
    // on it, so a key held when a field takes the focus is not left down after the screen closes (#16). The same below.
    field.addEventListener("keydown", (e) => { e.stopPropagation(); if (e.code === "Enter") go("creatorkey-save"); });
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
    field.focus();
    field.select();
  } else if (current === "join") {
    // The relay's address is on Settings' Testing tab now (#108): a player needs the code, not the plumbing.
    root.innerHTML = `
      <div class="screen">
        <h1>Join a game</h1>
        <div class="sub">Type the code your friend gave you; then a character for their world.</div>
        <div class="setting"><span>Code</span><span class="choices"><input id="join-code" type="text" maxlength="24" placeholder="oak-abc" value="${esc(data.code || "")}" autocomplete="off" spellcheck="false"></span></div>
        <div class="screen-buttons row">${button("join-next", "Next")}${button("back", "Back")}</div>
      </div>`;
    const codeEl = root.querySelector("#join-code");
    codeEl.addEventListener("keydown", (e) => { e.stopPropagation(); if (e.code === "Enter") go("join-next"); });
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
      ? `${here.hostName ? `In ${esc(here.hostName)}'s world, ${esc(here.name || here.code)},` : `In ${esc(here.name || here.code)},`} as ${esc(here.myCharacter || "")}.`
      : `${esc(here.name)}, as ${esc(here.myCharacter || "")}.${here.role === "host" ? ` Open to friends, code ${esc(here.code)}: ${here.guests} with you.` : ""}`;
    root.innerHTML = `
      <div class="screen">
        <h1>${here.role ? "Menu" : "Paused"}</h1>
        <div class="sub">${where}</div>
        <div class="sub">${here.role ? "The world goes on while you are here; your character stands still." : "Esc to resume"}</div>
        <div class="screen-buttons">${button("resume", "Resume")}${here.role === "guest" ? "" : button("save", "Save world")}${here.role === "guest" ? "" : button("host", here.role === "host" ? "Open to friends: on" : "Open to friends: off")}${here.ownedCode ? button("owner", "Owner", ` data-code="${esc(here.ownedCode)}"`) : ""}${button("character", "Character")}${button("settings", "Settings")}${button("controls", "Controls")}${button("leave", "Leave world")}</div>
      </div>`;
  } else if (current === "owner") {
    // The owner's screen (item 5's sixth step): the world's code, its rules, its players, the barred. Asked of the
    // server each time it opens, so another device's changes show.
    const info = data.info;
    if (!info) {
      root.innerHTML = `<div class="screen"><h1>Owner</h1><div class="sub">Asking the server…</div><div class="screen-buttons row">${button("owner-back", "Back")}</div></div>`;
      const code = data.code;
      if (worldsApi && worldsApi.ownerInfo) worldsApi.ownerInfo(code).then((r) => { if (current === "owner" && data.code === code) show("owner", { ...data, info: r }); });
      return;
    }
    if (!info.ok) {
      root.innerHTML = `<div class="screen"><h1>Owner</h1><div class="sub note">${esc(info.error || "The server would not answer.")}</div><div class="screen-buttons row">${button("owner-back", "Back")}</div></div>`;
      return;
    }
    // The world's rules as switches, labelled and explained from the settings' registry (#108).
    const rulesRows = settings.REGISTRY.filter((e) => e.group === "rules").map((e) => {
      const on = !!(info.rules && info.rules[e.key]);
      return `<div class="setting"><span class="setting-label">${esc(e.label)}<small class="help">${esc(e.help)}</small></span><span class="control"><span class="switch-state">${on ? "On" : "Off"}</span>${switchHtml(on, `data-go="owner-rule" data-rule="${e.key}" data-value="${!on}"`)}</span></div>`;
    }).join("");
    const others = (info.players || []).filter((p) => !p.owner);
    const playersRows = others.length ? `<div class="rows">${others.map((p) => `
      <div class="row-item"><div class="row-main"><b>${esc(p.name)}</b><span class="row-sub">${p.dead ? "died" : "in this world"}</span></div>
      <div class="row-buttons">${button("owner-remove", "Remove", ` data-player="${esc(p.playerId)}" data-name="${esc(p.name)}"`)}${button("owner-remove-rotate", "Remove and change the code", ` data-player="${esc(p.playerId)}" data-name="${esc(p.name)}"`)}</div></div>`).join("")}</div>` : `<div class="sub">Nobody else has played here yet.</div>`;
    const barredRows = (info.barred || []).length ? `<h2>Kept out</h2><div class="rows">${info.barred.map((b) => `
      <div class="row-item"><div class="row-main"><b>${esc(b.name || "someone")}</b><span class="row-sub">removed by you</span></div>
      <div class="row-buttons">${button("owner-unbar", "Let back in", ` data-hash="${esc(b.hash)}"`)}</div></div>`).join("")}</div>` : "";
    root.innerHTML = `
      <div class="screen screen-wide">
        <h1>${esc(info.name || "Your world")}</h1>
        ${data.note ? `<div class="sub note">${esc(data.note)}</div>` : ""}
        <div class="sub">Friends join with the code <code>${esc(data.code)}</code>. ${info.awake ? "The world is running now." : "The world is asleep; a join wakes it."}</div>
        <div class="screen-buttons row">${button("owner-rotate", "Change the code")}</div>
        <h2>The world's rules</h2>
        ${rulesRows}
        <h2>Players</h2>
        <div class="sub">Removing a player takes them out now and keeps that browser out. Someone who clears their browser could come back with the code, so change the code too if you mean it.</div>
        ${playersRows}
        ${barredRows}
        <div class="screen-buttons row">${button("owner-back", "Back")}</div>
      </div>`;
  } else if (current === "addowned") {
    // A world of mine on the server, on this device (item 5's sixth step): its code and owner key; or, with the
    // creator key, a new owner key for a lost one.
    root.innerHTML = `
      <div class="screen">
        <h1>A world of mine on the server</h1>
        <div class="sub">The world's code and its owner key, as they were shown when it moved to the server.</div>
        ${data.note ? `<div class="sub note">${esc(data.note)}</div>` : ""}
        <div class="setting"><span>Code</span><span class="choices"><input id="owned-code" type="text" maxlength="32" autocomplete="off" spellcheck="false" value="${esc(data.code || "")}"></span></div>
        <div class="setting"><span>Owner key</span><span class="choices"><input id="owned-key" type="password" maxlength="200" autocomplete="off" spellcheck="false"></span></div>
        <div class="screen-buttons row">${button("addowned-save", "Add it")}</div>
        <div class="sub">Lost the owner key? The server's keeper can issue a new one with the creator key; the old one stops working.</div>
        <div class="setting"><span>Creator key</span><span class="choices"><input id="owned-creator" type="password" maxlength="200" autocomplete="off" spellcheck="false"></span></div>
        <div class="screen-buttons row">${button("addowned-rekey", "A new owner key")}${button("worlds", "Back")}</div>
      </div>`;
    for (const f of root.querySelectorAll("input")) f.addEventListener("keydown", (e) => e.stopPropagation());
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
        <div class="tabs" role="tablist">${settings.GROUPS.map(([g, name]) => `<button class="tab${g === settingsTab ? " on" : ""}" role="tab" aria-selected="${g === settingsTab}" data-tab="${g}">${name}</button>`).join("")}</div>
        <div class="tab-body">
          ${settings.REGISTRY.filter((e) => e.group === settingsTab).map(settingRow).join("")}
          ${settingsTab === "testing" ? testingExtras() : ""}
        </div>
        <div class="screen-buttons row">${button("back", "Back")}<button id="settings-reset">Defaults</button></div>
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
        ${CONTROLS.map(([group, keys]) => `<h2>${group}</h2><div class="controls">${keys.map(([k, what]) => `<b>${k}</b><span>${what}</span>`).join("")}</div>`).join("")}
        <div class="sub">More on how things work in <a href="https://cmzgame.github.io/cmz-wiki/" target="_blank" rel="noopener">the wiki</a>.</div>
        <div class="screen-buttons row">${button("back", "Back")}</div>
      </div>`;
  } else {
    root.innerHTML = "";
  }
}
