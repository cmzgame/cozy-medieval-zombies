// Names over heads (docs/31/03): another player's name floats over their head
// while they are in your sight, placed as the speech bubble is, a little above
// the bubble's tail so the two never fight. Yours is not shown (you know).
// A setting hides them. DOM over the world, never drawn into the canvas.

import * as iso from "../iso.js";
import { liftOf } from "../render/storeys.js"; // a body drawn at its storey and its rise (docs/49 section 6)
import * as view from "../view.js";
import * as settings from "../settings.js";
import { getSheet } from "../assets.js";

const HEAD_TOP = 78; // world px above the feet: over the bubble's tail (speech.js HEAD_TOP 68)
let root = null;
const pool = new Map(); // player id -> element

export function initNames() {
  root = document.createElement("div");
  root.id = "names";
  document.getElementById("ui").appendChild(root);
}

function tagFor(id) {
  let el = pool.get(id);
  if (!el) {
    el = document.createElement("div");
    el.className = "name-tag";
    root.appendChild(el);
    pool.set(id, el);
  }
  return el;
}

// An animal's name while the pointer is on it (docs/45: a name on hover): one tag, over the animal, gone when the pointer leaves.
let hoverTag = null;
export function updateHoverName(animal) {
  if (!root) return;
  if (!animal) {
    if (hoverTag) hoverTag.style.display = "none";
    return;
  }
  if (!hoverTag) {
    hoverTag = document.createElement("div");
    hoverTag.className = "name-tag animal-tag";
    root.appendChild(hoverTag);
  }
  const name = animal.dead ? `Dead ${animal.name}` : animal.name[0].toUpperCase() + animal.name.slice(1);
  if (hoverTag.textContent !== name) hoverTag.textContent = name;
  const s = iso.toScreen(animal.gx, animal.gy);
  const u = view.toUi(s.x, s.y - animalTop(animal));
  hoverTag.style.left = `${Math.round(u.x)}px`;
  hoverTag.style.top = `${Math.round(u.y)}px`;
  hoverTag.style.display = "";
}
// Over its head: the sheet's anchor sits at the feet, so its height above them is the anchor's row.
function animalTop(a) {
  try {
    return getSheet(a.sprite).anchor[1] + 4;
  } catch {
    return 30;
  }
}

// `players`: everyone who is a player; `me`: mine, skipped; `visible`: my sight.
export function updateNames(players, visible, me) {
  if (!root) return;
  const seen = new Set();
  const on = settings.get("nameTags") !== false;
  if (on) {
    for (const p of players) {
      if (p === me || p.dead) continue;
      const key = (Math.round(p.gx) + 32768) * 65536 + (Math.round(p.gy) + 32768);
      if (!visible.has(key)) continue;
      const el = tagFor(p.id);
      const name = p.name || p.id;
      if (el.textContent !== name) el.textContent = name;
      if ((p.layer || 0) !== ((me && me.layer) || 0)) continue; // another storey's name is not shown over this one's floor (docs/49 section 6)
      const s = iso.toScreen(p.gx, p.gy);
      s.y -= liftOf(p); // at the height it stands (docs/49 section 6)
      const u = view.toUi(s.x, s.y - HEAD_TOP);
      el.style.left = `${Math.round(u.x)}px`;
      el.style.top = `${Math.round(u.y)}px`;
      seen.add(p.id);
    }
  }
  for (const [id, el] of pool) {
    if (seen.has(id)) continue;
    el.remove();
    pool.delete(id);
  }
}
