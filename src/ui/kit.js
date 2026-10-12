// The UI kit (docs/23, step 4): the stone frame, the cutout wells and cell,
// the button in three states, each a picture on the `ui_kit` sheet (generated
// by placeholders.generateUiKit until drawn art replaces it, through the same
// sprite definition as everything else). The pictures become CSS custom
// properties on the UI layer (`--kit-frame`, `--kit-frame-slice`,
// `--kit-frame-w`, and so on, one set per frame) and style.css builds the bag,
// the character screen, and the belt from them with border-image (Michael,
// 2026-10-12: stone on those three alone). Nothing here knows a panel.

import * as assets from "../assets.js";

export const K = 1; // UI pixels per kit pixel: the kit is drawn at the interface's own size

let root = null;

// Read the sheet and set the properties. Called at boot after the art, and again
// when the sheet is reloaded (the sprite tool saved it).
export function apply() {
  root = root || document.getElementById("ui");
  if (!root) return;
  const sheet = assets.getSheet("ui_kit");
  const slices = assets.getDef("ui_kit").slices || {};
  for (const [name, [x, y, w, h]] of Object.entries(sheet.frames)) {
    const c = document.createElement("canvas");
    c.width = w;
    c.height = h;
    c.getContext("2d").drawImage(sheet.image, x, y, w, h, 0, 0, w, h);
    const s = slices[name] ?? slices[name.replace(/_.*$/, "")] ?? Math.floor(w / 3);
    root.style.setProperty(`--kit-${name}`, `url(${c.toDataURL()})`);
    root.style.setProperty(`--kit-${name}-slice`, String(s));
    root.style.setProperty(`--kit-${name}-w`, `${s * K}px`);
    root.style.setProperty(`--kit-${name}-size`, `${w * K}px ${h * K}px`);
  }
}
