// Copied from cozy-zombie-game src/ui/inventory-panel.js on 2026-10-10 and
// grown for docs/11: besides the grids (your bag and an open container) it
// draws the doll with its worn slots and the hands, and the belt as a hotbar
// strip, and drags between all of them. Grid rules live in grid.js; moves
// that involve a slot go through the handlers, which know the player.
// The bag (Tab) and the character screen (C) are two panels that open and
// close on their own; closing one never closes the other (Michael, 2026-10-12,
// docs/23 step 4). Both are 38 px a cell (view.panelCell); a character slot is
// one cell in a cutout and shows the item's portrait.

import { url as assetUrl } from "../assets.js"; // icons carry the manifest stamp (docs/23)
import { getItem } from "../items.js";
import * as grid from "../grid.js";
import * as menu from "./context-menu.js";
import * as view from "../view.js";
import { parseSlot } from "../inventory.js";

let CELL = view.BASE_CELL; // the bag's cell in UI pixels, read from the view at every render
const HOT_CELL = view.BASE_CELL; // the belt is HUD and keeps the base size
const ICON_PX = 19; // a bag icon's pixels per cell (docs/26)
const PORTRAIT_PX = 38; // a portrait's pixels per character slot (docs/26)
const DRAG_THRESHOLD = 4; // screen pixels before a press becomes a drag
// The doll, Michael's drawing of 2026-10-10: the belt top-left, the bag
// top-right, the body down the middle, a hand either side, gloves under the
// main hand. The bottom corners stay free for later. The spacer columns are
// half a slot wide.
const DOLL_AREAS = [
  "waist . head . back",
  ". . chest . .",
  "main . legs . off",
  "gloves . feet . .",
];
const SLOT_NAMES = { head: "Head", chest: "Chest", hands: "Gloves", legs: "Legs", feet: "Feet", waist: "Belt", back: "Bag" };

let root = null;
let body = null;
let dollEl = null;
let hotbar = null;
let open = false; // the bag
let character = false; // the character screen
let handlers = {};
let lastSignature = "";
let bags = { inv: null, container: null };
let shown = { player: null }; // who the doll is drawn for
let drag = null;

export function initInventoryPanel(h) {
  handlers = h;
  root = document.getElementById("inventory");
  root.hidden = true;
  // The bag and any open container live in .inv-body, top-right; the doll
  // lives in .doll-wrap, dead centre, so opening one never moves the other
  // (Michael, 2026-10-10 night).
  root.innerHTML = `<div class="inv-body"></div><div class="doll-wrap" hidden></div>`;
  body = root.querySelector(".inv-body");
  dollEl = root.querySelector(".doll-wrap");
  hotbar = document.createElement("div");
  hotbar.id = "hotbar";
  hotbar.hidden = true;
  document.getElementById("ui").appendChild(hotbar);

  for (const el of [root, hotbar]) {
    el.addEventListener("pointerdown", onPointerDown);
    el.addEventListener("dblclick", (e) => {
      const hit = entryFromEvent(e);
      if (!hit) return;
      // Double-click uses the thing (Michael, 2026-10-10 night): equip or wear
      // from your bag, draw from the belt, unequip from a hand, take off a
      // worn slot. Anything else, or from a container, goes across.
      const used = hit.slot ? handlers.useSlot?.(hit.slot) : hit.bag === bags.inv && handlers.use?.(hit.entry, hit.bag);
      if (used) {
        handlers.changed?.();
        lastSignature = "";
        hotbar.dataset.sig = "";
        return;
      }
      if (hit.bag) quickMove(hit);
    });
    el.addEventListener("contextmenu", (e) => {
      e.preventDefault();
      if (drag?.started) return;
      const hit = entryFromEvent(e);
      if (hit) openItemMenu(hit, e);
    });
  }
  root.addEventListener("click", (e) => {
    const btn = e.target.closest("button[data-tidy]");
    if (!btn) return;
    const bag = bags[btn.dataset.tidy];
    if (bag) grid.tidy(bag);
    handlers.changed?.();
    lastSignature = "";
  });
  window.addEventListener("pointermove", onPointerMove);
  window.addEventListener("pointerup", onPointerUp);
  window.addEventListener("keydown", (e) => {
    if (drag?.started && e.code === "KeyR") rotateDrag();
  });
  // While dragging, right-click and the wheel rotate.
  window.addEventListener("pointerdown", (e) => {
    if (drag?.started && e.button === 2) rotateDrag();
  }, true);
  window.addEventListener("wheel", () => {
    if (drag?.started) rotateDrag();
  }, { passive: true });
}

// Either panel is up.
export function isOpen() {
  return open || character;
}

export function isBagOpen() {
  return open;
}

export function isCharacter() {
  return character;
}

function refreshVisibility() {
  root.hidden = !(open || character);
  root.classList.toggle("character", character);
  root.classList.toggle("bag", open);
  lastSignature = "";
  if (!open && !character) cancelDrag();
}

export function setBagOpen(v) {
  open = !!v;
  refreshVisibility();
}

export function setCharacterOpen(v) {
  character = !!v;
  refreshVisibility();
}

export function toggleBag() {
  setBagOpen(!open);
}

export function toggleCharacter() {
  setCharacterOpen(!character);
}

export function closeAll() {
  open = false;
  character = false;
  refreshVisibility();
}

function capitalize(s) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// ---- rendering ----

// A picture for a slot (docs/26): the item's portrait, a square drawn for the
// character screen; failing that its bag icon if that is square; else none,
// and the slot shows the coloured block with the label as the bag does.
function portraitOf(def) {
  if (def.portrait) return def.portrait;
  if (def.icon && def.icon.size[0] === def.icon.size[1]) return def.icon;
  return null;
}

// An item as a block: in a bag (`w` by `h` cells of `cell` pixels) or, with
// `slot` set, in a slot `cell` pixels square showing its portrait.
function blockHtml(entry, attrs, cell = CELL, w = 1, h = 1, extraCls = "", slot = false) {
  const def = getItem(entry.id);
  const cls = ["inv-item", extraCls];
  if (h > w) cls.push("tall");
  if (entry.count > 1) cls.push("stacked");
  let inner = "";
  if (entry.fill != null) {
    const pct = Math.max(0, Math.min(100, entry.fill));
    inner += `<div class="inv-level" style="${h >= w ? `height:${pct}%;width:100%` : `width:${pct}%;height:100%`}"></div>`;
  }
  const pic = slot ? portraitOf(def) : def.icon;
  if (pic) {
    // An item with drawn art shows the picture, upright, centred in its footprint, enlarged by a whole
    // number (nearest-pixel), and keeps the slot dark behind it; the same art as in the hand (docs/24).
    const [iw, ih] = pic.size;
    const rot = !slot && !!entry.rot && w !== h;
    const fw = rot ? ih : iw;
    const fh = rot ? iw : ih;
    const s = Math.max(1, Math.floor(Math.min((w * cell) / fw, (h * cell) / fh)));
    cls.push("has-icon");
    inner += `<img class="inv-icon" src="${assetUrl(pic.src)}" alt="" draggable="false" style="width:${iw * s}px;height:${ih * s}px${rot ? ";transform:rotate(90deg)" : ""}">`;
  } else {
    inner += `<span class="inv-label">${def.short || def.name}</span>`;
  }
  if (entry.count > 1) inner += `<span class="inv-stack">${entry.count}</span>`;
  const title = `${def.name}${entry.fill != null ? ` (${Math.round(entry.fill)}%)` : ""}${entry.count > 1 ? ` x${entry.count}` : ""}`;
  return `<div class="${cls.join(" ")}" ${attrs} title="${title}" style="width:${w * cell}px;height:${h * cell}px;--item:${def.color || "#8a8296"}">${inner}</div>`;
}

function itemHtml(entry, index, which) {
  const [w, h] = grid.sizeOf(entry);
  const html = blockHtml(entry, `data-bag="${which}" data-index="${index}"`, CELL, w, h);
  return html.replace('style="', `style="left:${entry.x * CELL}px;top:${entry.y * CELL}px;position:absolute;`);
}

function columnHtml(which, bag, title) {
  const items = bag.items.map((e, i) => itemHtml(e, i, which)).join("");
  return `
    <div class="inv-column kit-frame">
      <div class="inv-header"><span>${title}</span><button class="kit-button" data-tidy="${which}" title="Repack">Tidy</button></div>
      <div class="inv-grid" data-bag="${which}" style="width:${bag.cols * CELL}px;height:${bag.rows * CELL}px;--cell:${CELL}px">${items}<div class="inv-hl" hidden></div></div>
    </div>`;
}

// A character slot is one cell square inside its cutout edge (Michael,
// 2026-10-12: Minecraft's size or a hair bigger; two cells was far too big).
function slotHtml(id, entry, label, extra = "") {
  const px = CELL;
  const inner = entry ? blockHtml(entry, `data-slot="${id}"`, px, 1, 1, "in-slot", true) : `<span class="slot-label">${label}</span>`;
  const box = `calc(${px}px + 2 * var(--kit-well-w, 5px))`; // the content plus the well's border
  return `<div class="doll-slot kit-well${extra}${entry ? "" : " empty"}" data-slot="${id}" title="${label}" style="width:${box};height:${box}">${inner}</div>`;
}

function dollHtml(player) {
  const area = (name, html) => html.replace('class="doll-slot', `style="grid-area:${name}" class="doll-slot`);
  const hand = (key, label) => area(key, slotHtml(`hand:${key}`, player.hands[key], label, " doll-hand"));
  const worn = (k) => area(k === "hands" ? "gloves" : k, slotHtml(`worn:${k}`, player.worn[k], SLOT_NAMES[k]));
  const slot = `calc(${CELL}px + 2 * var(--kit-well-w, 5px))`; // a slot's box, the well's border included
  const cols = `${slot} ${CELL / 2}px ${slot} ${CELL / 2}px ${slot}`;
  return `
    <div class="inv-column kit-frame doll">
      <div class="inv-header"><span>You</span></div>
      <div class="doll-grid" style="grid-template-columns:${cols};grid-auto-rows:${slot};grid-template-areas:${DOLL_AREAS.map((r) => `'${r}'`).join(" ")}">
        ${["waist", "head", "back", "chest", "legs", "feet", "hands"].map(worn).join("")}
        ${hand("main", "Main hand")}${hand("off", "Off-hand")}
      </div>
    </div>`;
}

function hotbarHtml(belt) {
  return belt.map((e, i) => `<div class="hot-slot${e ? "" : " empty"}" data-slot="belt:${i}"><span class="hot-key">${i + 1}</span>${e ? blockHtml(e, `data-slot="belt:${i}"`, HOT_CELL, 1, 1, "in-slot", true) : ""}</div>`).join("");
}

// Re-render if anything changed. `inv` is the bag on the back or null;
// `container` is any open bag or null.
export function renderInventoryPanel(player, inv, container, belt) {
  bags = { inv: inv || null, container: container || null };
  shown.player = player;
  // The hotbar is always shown while a belt is worn.
  const beltSig = JSON.stringify(belt);
  if (!belt) hotbar.hidden = true;
  else {
    hotbar.hidden = false;
    if (hotbar.dataset.sig !== beltSig) {
      hotbar.innerHTML = hotbarHtml(belt);
      hotbar.dataset.sig = beltSig;
    }
  }
  if (!open && !character) return;
  if (drag && drag.from.kind === "bag" && drag.from.bag !== inv && drag.from.bag !== container) cancelDrag();
  CELL = view.panelCell();
  const sig = JSON.stringify([open, character, CELL, inv?.items, inv?.cols, inv?.rows, container?.container, container?.items, container?.cols, container?.rows, player.worn, player.hands]);
  if (sig === lastSignature) return;
  lastSignature = sig;
  // The bag sits in the top-right corner; anything opened appears to its left.
  // The doll sits at the left edge, centred vertically, on its own; neither
  // moves when the other opens (Michael, 2026-10-10 night).
  dollEl.hidden = !character;
  dollEl.innerHTML = character ? dollHtml(player) : "";
  body.hidden = !open;
  body.innerHTML = !open ? "" :
    (container ? columnHtml("container", container, capitalize(container.container)) : "") +
    (inv ? columnHtml("inv", inv, capitalize(inv.container)) : `<div class="inv-column kit-frame inv-nobag">No bag on your back.</div>`) +
    `<div class="inv-hint">Drag to move · R rotates · Shift-click sends across · Right-click for actions</div>`;
}

// ---- hit testing ----

function slotEntry(slotId) {
  const { kind, key } = parseSlot(slotId);
  const p = shown.player;
  if (!p) return null;
  if (kind === "worn") return p.worn[key] || null;
  if (kind === "hand") return p.hands[key] || null;
  if (kind === "belt") return handlers.belt?.()?.[Number(key)] || null;
  return null;
}

function entryFromEvent(e) {
  const el = e.target.closest(".inv-item");
  if (!el) return null;
  if (el.dataset.slot) {
    const entry = slotEntry(el.dataset.slot);
    return entry ? { entry, slot: el.dataset.slot, el } : null;
  }
  const bag = bags[el.dataset.bag];
  const entry = bag?.items[Number(el.dataset.index)];
  return entry ? { entry, bag, el } : null;
}

// Which grid is under a screen point, and which cell.
function gridAt(clientX, clientY) {
  for (const el of body.querySelectorAll(".inv-grid")) {
    const r = el.getBoundingClientRect();
    if (clientX < r.left || clientX >= r.right || clientY < r.top || clientY >= r.bottom) continue;
    const bag = bags[el.dataset.bag];
    const cellPx = r.width / bag.cols;
    return { el, bag, cellPx, cx: Math.floor((clientX - r.left) / cellPx), cy: Math.floor((clientY - r.top) / cellPx) };
  }
  return null;
}

// Which slot is under a screen point: worn, a hand, or the belt.
function slotAt(clientX, clientY) {
  for (const el of [...root.querySelectorAll(".doll-slot"), ...hotbar.querySelectorAll(".hot-slot")]) {
    const r = el.getBoundingClientRect();
    if (clientX >= r.left && clientX < r.right && clientY >= r.top && clientY < r.bottom) return { el, id: el.dataset.slot };
  }
  return null;
}

function overPanel(clientX, clientY) {
  for (const el of [...root.querySelectorAll(".inv-column"), hotbar]) {
    const r = el.getBoundingClientRect();
    if (clientX >= r.left && clientX < r.right && clientY >= r.top && clientY < r.bottom) return true;
  }
  return false;
}

// ---- drag and drop ----

function onPointerDown(e) {
  if (e.button !== 0 || drag) return;
  const hit = entryFromEvent(e);
  if (!hit) return;
  e.preventDefault();
  const r = hit.el.getBoundingClientRect();
  const [w] = hit.bag ? grid.sizeOf(hit.entry) : [1];
  const cellPx = r.width / w;
  drag = {
    entry: hit.entry,
    from: hit.bag ? { kind: "bag", bag: hit.bag } : { kind: "slot", id: hit.slot },
    rot: hit.bag ? !!hit.entry.rot : false,
    grabX: hit.bag ? Math.floor((e.clientX - r.left) / cellPx) : 0,
    grabY: hit.bag ? Math.floor((e.clientY - r.top) / cellPx) : 0,
    cellPx: hit.bag ? cellPx : CELL * view.view.uiScale, // from a slot, the ghost is at the bag's scale
    startX: e.clientX,
    startY: e.clientY,
    lastX: e.clientX,
    lastY: e.clientY,
    shift: e.shiftKey,
    started: false,
    ghost: null,
    target: null,
  };
}

function startDrag() {
  drag.started = true;
  menu.closeContextMenu();
  const def = getItem(drag.entry.id);
  const g = document.createElement("div");
  g.className = "inv-ghost";
  g.style.setProperty("--item", def.color || "#8a8296");
  g.textContent = def.short || def.name;
  document.body.appendChild(g);
  drag.ghost = g;
  root.classList.add("dragging");
}

function rotateDrag() {
  const [w, h] = grid.sizeOfId(drag.entry.id);
  if (w === h) return;
  drag.rot = !drag.rot;
  drag.grabX = 0;
  drag.grabY = 0;
  updateDrag(drag.lastX, drag.lastY);
}

function onPointerMove(e) {
  if (!drag) return;
  drag.lastX = e.clientX;
  drag.lastY = e.clientY;
  if (!drag.started) {
    if (Math.hypot(e.clientX - drag.startX, e.clientY - drag.startY) < DRAG_THRESHOLD) return;
    startDrag();
  }
  updateDrag(e.clientX, e.clientY);
}

function clearHighlights() {
  for (const hl of body.querySelectorAll(".inv-hl")) hl.hidden = true;
  for (const el of [...root.querySelectorAll(".doll-slot"), ...hotbar.querySelectorAll(".hot-slot")]) el.classList.remove("ok", "bad");
}

function updateDrag(clientX, clientY) {
  const [w, h] = grid.sizeOfId(drag.entry.id, drag.rot);
  const g = drag.ghost;
  g.style.width = `${w * drag.cellPx}px`;
  g.style.height = `${h * drag.cellPx}px`;
  g.style.left = `${clientX - (drag.grabX + 0.5) * drag.cellPx}px`;
  g.style.top = `${clientY - (drag.grabY + 0.5) * drag.cellPx}px`;
  g.style.fontSize = `${Math.round(drag.cellPx * 0.32)}px`;

  clearHighlights();
  drag.target = null;
  const slot = slotAt(clientX, clientY);
  if (slot) {
    const ok = !!handlers.canPlace?.(drag.entry, slot.id);
    drag.target = { slot: slot.id, ok };
    slot.el.classList.add(ok ? "ok" : "bad");
    return;
  }
  const at = gridAt(clientX, clientY);
  if (!at) return;
  const x = at.cx - drag.grabX;
  const y = at.cy - drag.grabY;
  const def = getItem(drag.entry.id);
  const under = grid.entryAt(at.bag, at.cx, at.cy);
  const merges = !!(def.stack && under && under !== drag.entry && under.id === drag.entry.id && under.count < def.stack);
  const nested = !(handlers.canStore?.(drag.entry) ?? true); // the container rule: only empty containers go in
  const ok = !nested && (merges || grid.fits(at.bag, drag.entry.id, x, y, drag.rot, drag.entry));
  drag.target = { bag: at.bag, x: merges ? at.cx : x, y: merges ? at.cy : y, ok };
  const hl = at.el.querySelector(".inv-hl");
  const hx = Math.max(0, x);
  const hy = Math.max(0, y);
  const hw = Math.min(at.bag.cols, x + w) - hx;
  const hh = Math.min(at.bag.rows, y + h) - hy;
  if (!hl || hw <= 0 || hh <= 0) return;
  hl.hidden = false;
  hl.className = `inv-hl ${ok ? "ok" : "bad"}`;
  hl.style.left = `${hx * CELL}px`;
  hl.style.top = `${hy * CELL}px`;
  hl.style.width = `${hw * CELL}px`;
  hl.style.height = `${hh * CELL}px`;
}

function onPointerUp(e) {
  if (!drag || e.button !== 0) return;
  const d = drag;
  if (!d.started) {
    drag = null;
    if (d.shift && d.from.kind === "bag") quickMove({ entry: d.entry, bag: d.from.bag });
    return;
  }
  const t = d.target;
  if (t && t.ok) {
    if (t.slot) handlers.placeInSlot?.(d.entry, d.from, t.slot);
    else if (d.from.kind === "bag") grid.moveEntry(d.from.bag, t.bag, d.entry, t.x, t.y, d.rot);
    else handlers.placeInGrid?.(d.entry, d.from, t.bag, t.x, t.y, d.rot);
    handlers.changed?.();
  } else if (!t && !overPanel(e.clientX, e.clientY)) {
    handlers.dropToFloor?.(d.entry, d.from);
  }
  cancelDrag();
}

function cancelDrag() {
  if (!drag) return;
  drag.ghost?.remove();
  drag = null;
  root.classList.remove("dragging");
  if (body) clearHighlights();
  lastSignature = "";
  hotbar.dataset.sig = "";
}

// ---- shortcuts and menus ----

function otherBag(bag) {
  if (!bags.container || !bags.inv) return null;
  return bag === bags.inv ? bags.container : bags.inv;
}

function quickMove({ entry, bag }) {
  const to = otherBag(bag);
  if (!to) return;
  if (!(handlers.canStore?.(entry) ?? true)) return handlers.noRoom?.(to === bags.inv);
  if (!grid.transfer(bag, to, entry)) handlers.noRoom?.(to === bags.inv);
  handlers.changed?.();
  lastSignature = "";
}

function openItemMenu(hit, e) {
  const entries = hit.slot
    ? handlers.slotMenu?.(hit.slot) || []
    : handlers.itemMenu?.(hit.entry, hit.bag, otherBag(hit.bag)) || [];
  if (hit.bag) {
    const [w, h] = grid.sizeOfId(hit.entry.id);
    if (w !== h) {
      entries.push({
        label: "Rotate",
        enabled: grid.fits(hit.bag, hit.entry.id, hit.entry.x, hit.entry.y, !hit.entry.rot, hit.entry),
        onSelect: () => {
          hit.entry.rot = !hit.entry.rot;
        },
      });
    }
  }
  if (!entries.length) return;
  const wrapped = entries.map((en) => ({
    ...en,
    onSelect: () => {
      en.onSelect();
      handlers.changed?.();
      lastSignature = "";
      hotbar.dataset.sig = "";
    },
  }));
  const u = view.clientToUi(e.clientX, e.clientY);
  menu.openContextMenu(u.x, u.y, wrapped);
}
