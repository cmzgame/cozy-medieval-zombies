// Copied from cozy-zombie-game src/ui/moodles.js on 2026-10-10. Unchanged.
// Renders the moodle row in the HUD.

import { activeMoodles } from "../moodles.js";

let root = null;
const shown = new Map(); // id -> { el, stage }

export function initMoodles(container) {
  root = container;
  root.innerHTML = "";
  shown.clear();
}

export function updateMoodles(player) {
  const active = activeMoodles(player);
  const ids = new Set(active.map((m) => m.id));
  let added = false;
  for (const [id, entry] of shown) {
    if (ids.has(id)) continue;
    entry.el.remove();
    shown.delete(id);
  }
  for (const m of active) {
    let entry = shown.get(m.id);
    if (entry && entry.stage === m.stage) continue;
    const worse = !entry || m.stage > entry.stage;
    if (!entry) {
      const el = document.createElement("div");
      el.innerHTML = `<svg viewBox="0 0 16 16" width="20" height="20">${m.glyph}</svg><div class="moodle-tip"><b></b><span></span></div>`;
      entry = { el, stage: 0 };
      shown.set(m.id, entry);
      root.appendChild(el);
      added = true;
    }
    entry.stage = m.stage;
    entry.el.className = `moodle stage-${m.stage}`;
    entry.el.dataset.id = m.id;
    entry.el.querySelector("b").textContent = m.name;
    entry.el.querySelector("span").textContent = m.text;
    if (worse) {
      // Restart the pop animation.
      entry.el.classList.remove("pop");
      void entry.el.offsetWidth;
      entry.el.classList.add("pop");
    }
  }
  // Keep registry order so icons never swap places. Only when one was added:
  // moving a node restarts its animation.
  if (added) for (const m of active) root.appendChild(shown.get(m.id).el);
}
