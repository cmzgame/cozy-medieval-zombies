// The size on each plan (Michael, 2026-10-30: "All have text saying how big they are"): a small tag in the plan's own pastel at the middle of its
// rectangle, "7 tiles" or "5 × 4 tiles (20)", for every plan on the viewer's storey or below that is on screen. DOM over the world, never drawn
// into the canvas, as the names over heads are (ui/names.js).

import * as iso from "../iso.js";
import * as view from "../view.js";
import * as map from "../map.js";
import { textOf } from "../plans.js";

const BG = { yellow: "#fff0a0", blue: "#b8dcff", green: "#bff0bf", purple: "#d8c6ff", pink: "#ffc4de" };
let root = null;
const pool = new Map(); // plan id -> element

export function initPlanLabels() {
  root = document.createElement("div");
  root.id = "plan-labels";
  document.getElementById("ui").appendChild(root);
}

// `list`: the world's plans, or null when they are not shown; `layer`: the viewer's storey.
export function updatePlanLabels(list, layer) {
  if (!root) return;
  const seen = new Set();
  const w = root.parentElement.clientWidth;
  const h = root.parentElement.clientHeight;
  for (const p of list || []) {
    if ((p.layer || 0) > layer) continue; // a storey over the viewer's is not drawn under it
    const s = iso.toScreen((p.x0 + p.x1) / 2, (p.y0 + p.y1) / 2);
    const u = view.toUi(s.x, s.y - (p.layer || 0) * map.STOREY);
    if (u.x < -80 || u.y < -40 || u.x > w + 80 || u.y > h + 40) continue;
    let el = pool.get(p.id);
    if (!el) {
      el = document.createElement("div");
      el.className = "plan-tag";
      root.appendChild(el);
      pool.set(p.id, el);
    }
    const text = textOf(p);
    if (el.textContent !== text) el.textContent = text;
    const bg = BG[p.color] || BG.yellow;
    if (el.dataset.bg !== bg) {
      el.style.background = bg;
      el.dataset.bg = bg;
    }
    el.style.left = `${Math.round(u.x)}px`;
    el.style.top = `${Math.round(u.y)}px`;
    seen.add(p.id);
  }
  for (const [id, el] of pool) {
    if (seen.has(id)) continue;
    el.remove();
    pool.delete(id);
  }
}
