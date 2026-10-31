// The build palette (docs/13): a short list on the left, opened with N. Each row is something that can be built, its cost, and whether the
// player has it. Clicking a row enters build mode for it. Two tabs (Michael, 2026-10-28: "Build menu becomes 2: Build, and Terrain"): an
// entry's `tab` in data/build.json says which, its `group` the small heading it sits under; the Terrain tab is offered only while Free
// building is on (placement.paletteTabs). The title, the tab bar, Take apart, and the hint stay put; only the list scrolls, and its place is
// kept across the per-step rebuild. A search box filters both tabs' rows (Michael, 2026-10-30: "if I search "stone" and close the build menu, I
// want it to still be filtered to that until I log off or change it"): the words typed, each found in a row's name, heading, or id, kept in this
// tab's sessionStorage, so it outlives the palette shut and a reload and ends with the tab. This client's own; nothing reaches the world. Plain
// DOM in the UI layer.

import * as placement from "../placement.js";

let root = null;
let titleEl = null;
let tabsEl = null;
let searchEl = null;
let listEl = null;
let footEl = null;
let hintEl = null;
let open = false;
let onPick = () => {};
let lastPlayer = null;
let tab = "build"; // the last tab picked, kept for the session (also while it is not on offer)
let shownTab = "build"; // the tab drawn now: the remembered one, or the first on offer
const scrollOf = {}; // each tab's list scroll, kept while the palette is shut
let lastPicked = null; // the row last picked, scrolled into view when the palette opens again
let revealFor = null; // the row to scroll into view at the next render, or null
let uiHeight = 0; // the UI's height in UI px, read again after a resize
window.addEventListener("resize", () => { uiHeight = 0; });
let seenActive = null; // the mode's row at the last render

// The search, kept for the browser tab's life (sessionStorage; a page whose storage is blocked keeps it in memory alone).
const SEARCH_KEY = "cmz.buildSearch";
let query = "";
try { query = sessionStorage.getItem(SEARCH_KEY) || ""; } catch { /* no storage: this page's alone */ }
function setQuery(q) {
  query = q;
  try { if (q) sessionStorage.setItem(SEARCH_KEY, q); else sessionStorage.removeItem(SEARCH_KEY); } catch { /* no storage */ }
}
// Whether a row is shown under the search: every word typed is found in its name, its heading, or its id.
function matches(k) {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return true;
  const text = `${k.label || ""} ${k.group || ""} ${k.id}`.toLowerCase();
  return words.every((w) => text.includes(w));
}

const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;");

export function initBuildPalette(handlers = {}) {
  onPick = handlers.onPick || onPick;
  root = document.createElement("div");
  root.id = "build-palette";
  root.hidden = true;
  root.innerHTML = '<div class="bp-title">Build menu</div><div class="bp-tabs"></div><input class="bp-search" type="search" placeholder="Search" autocomplete="off" spellcheck="false"><div class="bp-list"></div><div class="bp-foot"></div><div class="bp-hint"></div>';
  titleEl = root.querySelector(".bp-title");
  tabsEl = root.querySelector(".bp-tabs");
  searchEl = root.querySelector(".bp-search");
  searchEl.value = query;
  // Keys typed here never reach the game (as the chat box's): Escape leaves the box, Enter picks the first row shown.
  searchEl.addEventListener("keydown", (e) => {
    e.stopPropagation();
    if (e.code === "Escape") {
      e.preventDefault(); // a search field's Escape would clear it: the search stays until it is changed
      searchEl.blur();
    }
    else if (e.code === "Enter") {
      const first = listEl.querySelector('.bp-row:not([data-kind="ruler"])'); // a piece to build, never the ruler (the review of #615)
      searchEl.blur();
      if (first) {
        lastPicked = first.dataset.kind;
        onPick(first.dataset.kind);
      }
    }
  });
  searchEl.addEventListener("input", () => {
    setQuery(searchEl.value);
    listEl.scrollTop = 0;
    render(lastPlayer);
  });
  listEl = root.querySelector(".bp-list");
  footEl = root.querySelector(".bp-foot");
  hintEl = root.querySelector(".bp-hint");
  document.getElementById("ui").appendChild(root);
  root.addEventListener("mousedown", (e) => e.stopPropagation());
  root.addEventListener("click", (e) => {
    const t = e.target.closest(".bp-tab");
    if (t) {
      if (t.dataset.tab !== shownTab) {
        scrollOf[shownTab] = listEl.scrollTop;
        tab = t.dataset.tab;
        revealFor = null;
        render(lastPlayer);
        listEl.scrollTop = scrollOf[shownTab] || 0;
      }
      return;
    }
    const row = e.target.closest(".bp-row");
    if (row) {
      lastPicked = row.dataset.kind === "__remove" ? lastPicked : row.dataset.kind;
      onPick(row.dataset.kind);
    }
  });
}

export function isOpen() {
  return open;
}

export function openPalette(player) {
  open = true;
  root.hidden = false;
  revealFor = lastPicked;
  render(player);
}

export function close() {
  if (open && listEl) scrollOf[shownTab] = listEl.scrollTop;
  if (searchEl && document.activeElement === searchEl) searchEl.blur(); // the box gives the keys back
  open = false;
  seenActive = null;
  if (root) root.hidden = true;
}

// The search typed, kept until it is changed or the tab is closed (for the checks).
export function search() {
  return query;
}

// The tab shown now (for the checks).
export function currentTab() {
  return shownTab;
}

// The tab remembered: the one last picked, shown again when it is on offer again (Terrain, with Free building).
export function rememberedTab() {
  return tab;
}

// Scroll the list so a row is wholly in it.
function reveal(id) {
  const el = [...listEl.querySelectorAll(".bp-row")].find((r) => r.dataset.kind === id);
  if (!el) return;
  const top = el.offsetTop;
  const bottom = top + el.offsetHeight;
  if (top < listEl.scrollTop) listEl.scrollTop = Math.max(0, top - 24); // room for the heading above it
  else if (bottom > listEl.scrollTop + listEl.clientHeight) listEl.scrollTop = bottom - listEl.clientHeight + 4;
}

function set(el, html) {
  if (el.dataset.html === html) return false;
  el.innerHTML = html;
  el.dataset.html = html;
  return true;
}

// Rebuilt every step while open, so the have-or-not colouring follows the bag. A wall of each wood is a row of its own (a region's two only while Free building is on); a door or a window
// has one row, and while it is the mode R cycles the wood of its leaves, shown under the row (#334: the builder's reading of the palette, one row per wall type and R for the leaf wood).
export function render(player) {
  if (!open) return;
  lastPlayer = player;
  if (uiHeight === 0) uiHeight = root.parentElement.clientHeight; // read once (a layout), again only when the window is resized
  root.classList.toggle("short", uiHeight < 560); // a short window: beside the HUD, not under it (the style)
  const active = placement.state.kind === "build" && placement.state.build ? placement.state.build.what : null;
  const tabs = placement.paletteTabs();
  const shown = tabs.some((t) => t.id === tab) ? tab : tabs.length ? tabs[0].id : "build"; // the Terrain tab goes with Free building: the remembered one stays, and comes back with it
  shownTab = shown;
  const kinds = placement.paletteKinds().filter((k) => placement.onTab(k, shown) && matches(k));
  // Under small headings (an entry's `group`), in the order they first appear; an entry with none sits at the top.
  const groups = new Map();
  for (const k of kinds) {
    const g = k.group || "";
    if (!groups.has(g)) groups.set(g, []);
    groups.get(g).push(k);
  }
  const rowHtml = (k) => {
    const short = placement.shortfall(player, k.id);
    const leaf = active === k.id && placement.takesLeaf(k.id) ? `<div class="bp-sub">${placement.leafHint(placement.buildLeaf(), placement.state.ghost && placement.state.ghost.carriedLeaf)}</div>` : "";
    const sw = placement.swatchOf(k);
    const how = k.hint || (k.kind === "terrain" ? "Click, then click or drag on the ground to paint" : placement.isInstantStair(k.id) ? "Click, then click the ground to place it at once" : "Click to build");
    const right = sw ? `<span class="bp-sw" style="background:${esc(sw)}"></span>` : k.kind === "ruler" ? "" : `<span class="bp-cost">${placement.costText(k.id)}</span>`; // the ruler costs nothing and builds nothing
    return `<div class="bp-row${short ? " short" : ""}${active === k.id ? " active" : ""}" data-kind="${k.id}" title="${esc(k.label)}: ${esc(short || how)}"><span class="bp-name">${esc(k.label)}</span>${right}</div>${leaf}`;
  };
  const list = [...groups].map(([g, ks]) => (g ? `<div class="bp-group">${esc(g)}</div>` : "") + ks.map(rowHtml).join("")).join("") || `<div class="bp-none">Nothing here matches “${esc(query.trim())}”</div>`;
  const remove = shown === "build" ? '<div class="bp-row bp-remove" data-kind="__remove" title="Take apart: highlights what you made or built; click to take it apart for half its materials (docs/43)"><span class="bp-name">Take apart</span><span class="bp-cost">X</span></div>' : "";
  const hint = shown === "terrain" ? "Click one, then click or drag on the ground to paint. Esc puts it down; N closes." : "Click one, then click the ground. Esc puts it down; N closes.";
  const keep = listEl.scrollTop;
  set(tabsEl, tabs.length > 1 ? tabs.map((t) => `<button type="button" class="bp-tab${t.id === shown ? " on" : ""}" data-tab="${t.id}">${esc(t.label)}</button>`).join("") : "");
  tabsEl.hidden = tabs.length <= 1;
  if (set(listEl, list)) listEl.scrollTop = keep; // the rebuild keeps the place the player scrolled to
  set(footEl, remove);
  footEl.hidden = !remove;
  set(hintEl, hint);
  if (active !== seenActive) { // a row made the mode (picked here, or another way: the hotbar's Build): scrolled into view
    seenActive = active;
    if (active && kinds.some((k) => k.id === active)) revealFor = active;
  }
  if (revealFor) {
    reveal(revealFor);
    revealFor = null;
  }
}
