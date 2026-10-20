// The build palette (docs/13): a short list on the left, opened with N. Each
// row is something that can be built, its cost, and whether the player has it.
// Clicking a row enters build mode for it. Plain DOM in the UI layer.

import * as placement from "../placement.js";

let root = null;
let open = false;
let onPick = () => {};

export function initBuildPalette(handlers = {}) {
  onPick = handlers.onPick || onPick;
  root = document.createElement("div");
  root.id = "build-palette";
  root.hidden = true;
  document.getElementById("ui").appendChild(root);
  root.addEventListener("mousedown", (e) => e.stopPropagation());
  root.addEventListener("click", (e) => {
    const row = e.target.closest(".bp-row");
    if (row) onPick(row.dataset.kind);
  });
}

export function isOpen() {
  return open;
}

export function openPalette(player) {
  open = true;
  root.hidden = false;
  render(player);
}

export function close() {
  open = false;
  if (root) root.hidden = true;
}

// Rebuilt every step while open, so the have-or-not colouring follows the bag. A wall of each wood is a row of its own (a region's two only while Free building is on); a door or a window
// has one row, and while it is the mode R cycles the wood of its leaves, shown under the row (#334: the builder's reading of the palette, one row per wall type and R for the leaf wood).
export function render(player) {
  if (!open) return;
  const active = placement.state.kind === "build" && placement.state.build ? placement.state.build.what : null;
  const rows = placement.paletteKinds().map((k) => {
    const short = placement.shortfall(player, k.id);
    const leaf = active === k.id && placement.takesLeaf(k.id) ? `<div class="bp-sub">${placement.leafHint(placement.buildLeaf(), placement.state.ghost && placement.state.ghost.carriedLeaf)}</div>` : "";
    return `<div class="bp-row${short ? " short" : ""}${active === k.id ? " active" : ""}" data-kind="${k.id}" title="${short || "Click to build"}"><span class="bp-name">${k.label}</span><span class="bp-cost">${placement.costText(k.id)}</span></div>${leaf}`;
  }).join("");
  const remove = `<div class="bp-row bp-remove" data-kind="__remove" title="Highlights what you placed or built; click to destroy it"><span class="bp-name">Remove</span><span class="bp-cost">X</span></div>`;
  const html = `<div class="bp-title">Build</div>${rows}${remove}<div class="bp-hint">Click one, then click the ground. N or Esc to close.</div>`;
  if (root.dataset.html !== html) {
    root.innerHTML = html;
    root.dataset.html = html;
  }
}
