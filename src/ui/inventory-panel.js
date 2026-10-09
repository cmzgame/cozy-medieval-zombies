// Copied from cozy-zombie-game src/ui/inventory-panel.js on 2026-10-10. The
// equipped outline became the two hands (gold main, blue off) through the
// `handOf` handler; otherwise unchanged.
// Grid inventory panel (Tab), with whatever container is open beside it.
// Drag and drop, rotation, quick transfer, right-click menus.
// See docs/10-interface.md. Rules live in grid.js; this file is only DOM.

import { getItem } from "../items.js";
import * as grid from "../grid.js";
import * as menu from "./context-menu.js";

const CELL = 38; // internal pixels; the UI layer is scaled with the canvas
const DRAG_THRESHOLD = 4; // screen pixels before a press becomes a drag

let root = null;
let body = null;
let open = false;
let handlers = {};
let lastSignature = "";
let bags = { inv: null, container: null };
let drag = null;

export function initInventoryPanel(h) {
  handlers = h;
  root = document.getElementById("inventory");
  root.hidden = true;
  root.innerHTML = `<div class="inv-body"></div>`;
  body = root.querySelector(".inv-body");

  root.addEventListener("pointerdown", onPointerDown);
  root.addEventListener("dblclick", (e) => {
    const hit = entryFromEvent(e);
    if (hit) quickMove(hit);
  });
  root.addEventListener("contextmenu", (e) => {
    e.preventDefault();
    if (drag?.started) return;
    const hit = entryFromEvent(e);
    if (hit) openItemMenu(hit, e);
  });
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

export function isOpen() {
  return open;
}

export function setOpen(v) {
  open = v;
  root.hidden = !v;
  lastSignature = "";
  if (!v) cancelDrag();
}

export function toggle() {
  setOpen(!open);
}

function capitalize(s) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// ---- rendering ----

function itemHtml(entry, index, which, hand) {
  const def = getItem(entry.id);
  const [w, h] = grid.sizeOf(entry);
  const cls = ["inv-item"];
  if (hand) cls.push(`equipped-${hand}`);
  if (h > w) cls.push("tall");
  if (entry.count > 1) cls.push("stacked"); // label moves up so the count has room
  let inner = "";
  if (entry.fill != null) {
    // A water level: from the bottom when upright, from the left when on its side.
    const pct = Math.max(0, Math.min(100, entry.fill));
    inner += `<div class="inv-level" style="${h >= w ? `height:${pct}%;width:100%` : `width:${pct}%;height:100%`}"></div>`;
  }
  inner += `<span class="inv-label">${def.short || def.name}</span>`;
  if (entry.count > 1) inner += `<span class="inv-stack">${entry.count}</span>`;
  const title = `${def.name}${entry.fill != null ? ` (${Math.round(entry.fill)}%)` : ""}${entry.count > 1 ? ` x${entry.count}` : ""}${hand ? ` (${hand} hand)` : ""}`;
  return `<div class="${cls.join(" ")}" data-bag="${which}" data-index="${index}" title="${title}" style="left:${entry.x * CELL}px;top:${entry.y * CELL}px;width:${w * CELL}px;height:${h * CELL}px;--item:${def.color || "#8a8296"}">${inner}</div>`;
}

function columnHtml(which, bag, title, withHands) {
  const seen = new Set();
  const items = bag.items.map((e, i) => {
    let hand = null;
    if (withHands) {
      hand = handlers.handOf?.(e.id) || null;
      // One outline per held id: the first entry of that item wears it.
      if (hand && seen.has(e.id)) hand = null;
      if (hand) seen.add(e.id);
    }
    return itemHtml(e, i, which, hand);
  }).join("");
  return `
    <div class="inv-column">
      <div class="inv-header"><span>${title}</span><button data-tidy="${which}" title="Repack">Tidy</button></div>
      <div class="inv-grid" data-bag="${which}" style="width:${bag.cols * CELL}px;height:${bag.rows * CELL}px;--cell:${CELL}px">${items}<div class="inv-hl" hidden></div></div>
    </div>`;
}

// Re-render if anything changed. `container` is any bag with a `container` name, or null.
export function renderInventoryPanel(inv, container, hands) {
  bags = { inv, container: container || null };
  if (!open) return;
  if (drag && drag.bag !== inv && drag.bag !== container) cancelDrag();
  const sig = JSON.stringify([inv.items, hands, inv.cols, inv.rows, container?.container, container?.items, container?.cols, container?.rows]);
  if (sig === lastSignature) return;
  lastSignature = sig;
  // The bag always sits in the top-right corner; anything opened appears to its left.
  body.innerHTML =
    (container ? columnHtml("container", container, capitalize(container.container), false) : "") +
    columnHtml("inv", inv, "Bag", true) +
    `<div class="inv-hint">Drag to move · R rotates · Shift-click sends across · Right-click for actions</div>`;
}

// ---- hit testing ----

function entryFromEvent(e) {
  const el = e.target.closest(".inv-item");
  if (!el) return null;
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

function overPanel(clientX, clientY) {
  for (const el of body.querySelectorAll(".inv-column")) {
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
  const [w] = grid.sizeOf(hit.entry);
  const cellPx = r.width / w;
  drag = {
    entry: hit.entry,
    bag: hit.bag,
    rot: !!hit.entry.rot,
    grabX: Math.floor((e.clientX - r.left) / cellPx),
    grabY: Math.floor((e.clientY - r.top) / cellPx),
    cellPx,
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
  const at = gridAt(clientX, clientY);
  if (!at) return;
  const x = at.cx - drag.grabX;
  const y = at.cy - drag.grabY;
  const def = getItem(drag.entry.id);
  const under = grid.entryAt(at.bag, at.cx, at.cy);
  const merges = !!(def.stack && under && under !== drag.entry && under.id === drag.entry.id && under.count < def.stack);
  const ok = merges || grid.fits(at.bag, drag.entry.id, x, y, drag.rot, drag.entry);
  drag.target = { bag: at.bag, x: merges ? at.cx : x, y: merges ? at.cy : y, ok };
  const hl = at.el.querySelector(".inv-hl");
  // Clip the highlight to the grid so a bad position still reads clearly.
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
    if (d.shift) quickMove({ entry: d.entry, bag: d.bag });
    return;
  }
  const t = d.target;
  if (t && t.ok) {
    grid.moveEntry(d.bag, t.bag, d.entry, t.x, t.y, d.rot);
    handlers.changed?.();
  } else if (!t && !overPanel(e.clientX, e.clientY)) {
    handlers.dropToFloor?.(d.entry, d.bag);
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
}

// ---- shortcuts and menus ----

function otherBag(bag) {
  if (!bags.container) return null;
  return bag === bags.inv ? bags.container : bags.inv;
}

function quickMove({ entry, bag }) {
  const to = otherBag(bag);
  if (!to) return;
  if (!grid.transfer(bag, to, entry)) handlers.noRoom?.(to === bags.inv);
  handlers.changed?.();
  lastSignature = "";
}

function openItemMenu(hit, e) {
  const entries = handlers.itemMenu?.(hit.entry, hit.bag, otherBag(hit.bag)) || [];
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
  if (!entries.length) return;
  // The menu lives in the UI layer, which is laid out in internal pixels.
  const ui = document.getElementById("ui").getBoundingClientRect();
  const scale = ui.width / 960 || 1;
  const wrapped = entries.map((en) => ({
    ...en,
    onSelect: () => {
      en.onSelect();
      handlers.changed?.();
      lastSignature = "";
    },
  }));
  menu.openContextMenu((e.clientX - ui.left) / scale, (e.clientY - ui.top) / scale, wrapped);
}
