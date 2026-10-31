// The Planning panel (Michael, 2026-10-30, `02` "The Planning tool": "its own menu similar to build, stays open until you close it ... think
// pastel post it notes, yellow blue green purple pink"): opened with P or the right-click menu's Plan, beside the build palette's place and
// never with it. While it is open the placement mode is planning (placement.beginPlan): a drag on the ground lays a ruler as a plan in the colour
// picked here, and a click on a plan takes it up. The colour picked, whether plans are shown, and how many the world holds; a close button, Esc,
// and P shut it. Plain DOM in the UI layer.

import { COLORS } from "../plans.js";

const SWATCH = { yellow: "#fff0a0", blue: "#b8dcff", green: "#bff0bf", purple: "#d8c6ff", pink: "#ffc4de" }; // the pastels (render/props.js PLAN_RGB)
let root = null;
let countEl = null;
let showEl = null;
let open = false;
let color = COLORS[0];
let handlers = { onColor: () => {}, onClose: () => {}, onShow: () => {} };

export function initPlanningPanel(h = {}) {
  handlers = { ...handlers, ...h };
  root = document.createElement("div");
  root.id = "planning-panel";
  root.className = "tool-panel";
  root.hidden = true;
  root.innerHTML = `<button type="button" class="tp-close" title="Close (P or Esc)">×</button><div class="tp-title">Planning</div>`
    + `<div class="pp-colors">${COLORS.map((c) => `<button type="button" class="pp-swatch" data-color="${c}" title="${c[0].toUpperCase() + c.slice(1)}" style="background:${SWATCH[c]}"></button>`).join("")}</div>`
    + `<label class="pp-show"><input type="checkbox" checked> Show plans</label>`
    + `<div class="pp-count"></div>`
    + `<div class="tp-hint">Press and drag on the ground to lay a ruler; it stays. Hover one and click to take it up.</div>`;
  countEl = root.querySelector(".pp-count");
  showEl = root.querySelector(".pp-show input");
  document.getElementById("ui").appendChild(root);
  root.addEventListener("mousedown", (e) => e.stopPropagation());
  root.addEventListener("click", (e) => {
    if (e.target.closest(".tp-close")) return handlers.onClose();
    const sw = e.target.closest(".pp-swatch");
    if (sw) {
      color = sw.dataset.color;
      handlers.onColor(color);
      paint();
    }
  });
  showEl.addEventListener("change", () => handlers.onShow(showEl.checked));
  paint();
}

function paint() {
  for (const b of root.querySelectorAll(".pp-swatch")) b.classList.toggle("on", b.dataset.color === color);
}

export const isOpen = () => open;
export const colorNow = () => color;

export function openPanel() {
  open = true;
  root.hidden = false;
}

export function close() {
  open = false;
  if (root) root.hidden = true;
}

// Each step while open: how many plans the world holds, and whether they are shown.
export function render(count, shown) {
  if (!open) return;
  const text = `${count} ${count === 1 ? "plan" : "plans"} in this world`;
  if (countEl.textContent !== text) countEl.textContent = text;
  if (showEl.checked !== shown) showEl.checked = shown;
}
