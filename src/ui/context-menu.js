// Copied from cozy-zombie-game src/ui/context-menu.js on 2026-10-10. Since: clamped to the UI layer's size
// through view.js instead of 960 by 540, and an Escape that closed the menu is swallowed (docs/10, 2026-10-10).
// Right-click context menu. Entries: [{ label, enabled, onSelect, card? }]: an entry with a `card`({ name, kind, state, lines, fine }, as
// item-info.js makes them) shows it in the hover card while the pointer is over the entry (Burn corpse's warning, docs/43 section 7).
// Two kinds: the world's menu (main.js), which closes when the player walks, and an item's menu opened on a panel (the bag, a container,
// the belt, a hand, a worn slot), opened with `still`, which stays open while the player walks (only the pause menu stops the game) and
// closes when its item is no longer where it was (`still()` false).
import * as view from "../view.js";
import * as hoverCard from "./hover-card.js";

let root = null;
let open = false;
let swallowedClick = false;
let swallowedEscape = false;
let still = null; // an item's menu: whether its item is still where the menu was opened on it; null for the world's menu

export function initContextMenu() {
  root = document.createElement("div");
  root.id = "menu";
  root.hidden = true;
  document.getElementById("ui").appendChild(root);

  root.addEventListener("mousedown", (e) => e.stopPropagation());
  root.addEventListener("contextmenu", (e) => e.preventDefault());
  root.addEventListener("mousemove", (e) => {
    const el = e.target.closest(".menu-entry");
    if (el && el._card) hoverCard.show(`menu:${el.textContent}`, () => el._card, e.clientX, e.clientY);
    else hoverCard.hideIf("menu:");
  });
  root.addEventListener("mouseleave", () => hoverCard.hideIf("menu:"));
  root.addEventListener("click", (e) => {
    const el = e.target.closest(".menu-entry");
    if (!el || el.classList.contains("disabled")) return;
    const fn = el._onSelect;
    closeContextMenu();
    fn?.();
  });

  // Any mousedown outside the menu closes it and is not treated as a click on the world.
  window.addEventListener("mousedown", (e) => {
    if (!open || root.contains(e.target)) return;
    closeContextMenu();
    swallowedClick = true;
  }, true);
  window.addEventListener("keydown", (e) => {
    if (open && (e.code === "Escape" || e.code === "Tab")) {
      closeContextMenu();
      if (e.code === "Escape") swallowedEscape = true;
    }
  });
}

export function openContextMenu(x, y, entries, { canvasW = view.view.uiW, canvasH = view.view.uiH, still: stillFn = null } = {}) {
  root.innerHTML = "";
  still = stillFn;
  for (const en of entries) {
    const el = document.createElement("div");
    el.className = `menu-entry${en.enabled === false ? " disabled" : ""}`;
    el.textContent = en.label;
    el._onSelect = en.onSelect;
    el._card = en.card || null;
    root.appendChild(el);
  }
  root.hidden = false;
  open = true;
  // Clamp inside the UI layer (x and y are UI pixels).
  const w = root.offsetWidth || 160;
  const h = root.offsetHeight || 24 * entries.length;
  root.style.left = `${Math.max(0, Math.min(canvasW - w, x + 2))}px`;
  root.style.top = `${Math.max(0, Math.min(canvasH - h, y + 2))}px`;
}

export function closeContextMenu() {
  open = false;
  still = null;
  if (root) root.hidden = true;
  hoverCard.hideIf("menu:");
}

export function isMenuOpen() {
  return open;
}

// True while the open menu is an item's, opened on a panel: walking does not close it.
export function isItemMenu() {
  return open && !!still;
}

// An item's menu whose item has gone (used up, dropped, taken, moved by the world) closes; true if it did.
export function closeIfGone() {
  if (!open || !still || still()) return false;
  closeContextMenu();
  return true;
}

// True once if an Escape was used to close the menu (docs/10: Escape closes
// the top thing that can close, then pauses).
export function tookEscape() {
  const v = swallowedEscape;
  swallowedEscape = false;
  return v;
}

// True once if a click was used to dismiss the menu this frame.
export function tookClick() {
  const v = swallowedClick;
  swallowedClick = false;
  return v;
}
