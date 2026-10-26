// The row of debuffs (#308): along the top of the screen, stuck to the top right and growing leftward, each an icon (ui/debuff-icons.js) with its time left under it ("10m" from a
// minute up, "34s" under) and its stacks in a corner when it has more than one, and a hover card (ui/hover-card.js, the item cards' own component) naming it, what it does, and what
// ends it. What it shows is src/debuffs.js: from this player's own record, so a guest sees the same as the host's player does. Client-only drawing; nothing here is world state.

import { activeDebuffs, cardOf } from "../debuffs.js";
import { debuffIconURL, ICON_SIZE } from "./debuff-icons.js";
import * as hoverCard from "./hover-card.js";

let root = null;
const shown = new Map(); // id -> { el, time, stacks }

export function initDebuffRow() {
  root = document.createElement("div");
  root.id = "debuffs";
  document.getElementById("ui").appendChild(root);
}

function build(d) {
  const el = document.createElement("div");
  el.className = d.buff ? "debuff buff" : "debuff"; // a buff framed in gold (docs/47 section 4; docs/39 section 12)
  el.dataset.id = d.id;
  const box = document.createElement("div");
  box.className = "db-box";
  const img = document.createElement("img");
  img.src = debuffIconURL(d.id);
  img.width = ICON_SIZE * 2;
  img.height = ICON_SIZE * 2;
  img.alt = d.name;
  img.draggable = false;
  img.style.imageRendering = "pixelated";
  const stacks = document.createElement("span");
  stacks.className = "db-stacks";
  box.append(img, stacks);
  const time = document.createElement("div");
  time.className = "db-time";
  el.append(box, time);
  el.addEventListener("pointermove", (e) => {
    const cur = shown.get(d.id);
    if (!cur) return;
    hoverCard.show(`debuff|${d.id}|${cur.d.stacks}|${cur.d.time}`, () => cardOf(cur.d), e.clientX, e.clientY);
  });
  el.addEventListener("pointerleave", () => hoverCard.hide());
  return el;
}

// Every frame, from main.js: the debuffs on this player, an icon each, the time and the stacks as they stand.
export function updateDebuffs(player) {
  if (!root) return;
  const now = activeDebuffs(player);
  const ids = new Set(now.map((d) => d.id));
  for (const [id, entry] of shown) {
    if (ids.has(id)) continue;
    entry.el.remove();
    shown.delete(id);
    hoverCard.hideIf(`debuff|${id}|`); // its own card goes with it; an item's stays
  }
  for (const d of now) {
    let entry = shown.get(d.id);
    if (!entry) {
      entry = { el: build(d), d, time: "", stacks: 0 };
      shown.set(d.id, entry);
      root.appendChild(entry.el);
    }
    entry.d = d;
    hoverCard.refresh(`debuff|${d.id}|`, `debuff|${d.id}|${d.stacks}|${d.time}`, () => cardOf(d)); // a card resting under the pointer follows the row
    if (entry.time !== d.time) {
      entry.time = d.time;
      entry.el.querySelector(".db-time").textContent = d.time;
    }
    if (entry.stacks !== d.stacks) {
      entry.stacks = d.stacks;
      const s = entry.el.querySelector(".db-stacks");
      s.textContent = d.stacks > 1 ? String(d.stacks) : "";
      s.hidden = d.stacks <= 1;
    }
  }
}

// What is on screen now, for the checks: [{ id, time, stacks, name }].
export function shownNow() {
  return [...shown.values()].map((e) => ({ id: e.d.id, time: e.el.querySelector(".db-time").textContent, stacks: e.el.querySelector(".db-stacks").textContent, name: e.d.name, hidden: e.el.offsetParent === null }));
}

export function clear() {
  for (const e of shown.values()) e.el.remove();
  shown.clear();
}
