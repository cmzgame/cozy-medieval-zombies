// The Inspect card (Michael's playtest, 2026-10-26: "format it like the hover tooltips and give it a close button because it's not actually
// a hover thing. Also move it somewhere not at the very top of the screen"): what an Inspect says of a crop or a planted sapling, as a card
// in the hover card's look, standing above the inspected patch and following it as the camera moves, kept on screen, with a close button.
// It stays until closed (the button, Escape, another Inspect), until its thing is gone (harvested, grown into a tree), or until the player
// walks well out of the Inspect's range; its words are read again each frame, so it says what is true now. The patch stays marked on the
// ground while it shows (inspect-mark.js). This client's view alone, a guest's too: it reads the replica and never writes the world, nothing
// is sent or saved. The DOM is made on first use, so the module loads under Node with interact.js.

import * as iso from "../iso.js";
import * as view from "../view.js";
import * as map from "../map.js";
import * as inspectMark from "../inspect-mark.js";

const CLOSE_RANGE = 16; // tiles from the patch at which the card closes itself (the Inspect's range is 12)
const ABOVE = 46; // UI pixels between the patch's tile and the card's foot

let el = null;
let cur = null; // { id, tiles, read, text }

function ensure() {
  if (el || typeof document === "undefined") return el;
  const ui = document.getElementById("ui");
  if (!ui) return null;
  el = document.createElement("div");
  el.id = "inspect-card";
  el.hidden = true;
  el.addEventListener("mousedown", (e) => e.stopPropagation()); // the card's own, never the world's
  el.addEventListener("click", (e) => {
    e.stopPropagation();
    if (e.target.closest(".ic-close")) close();
  });
  ui.appendChild(el);
  return el;
}

// "Potatoes: ready in about 2 days; watered; not fertilized; harvest with a shovel." as a name and its lines.
// With `title` (a sapling's, whose report is sentences, not facts) the name is that and the whole report its one line, as written.
export function cardOf(text, title = null) {
  if (title) { const s = String(text || "").trim(); return { name: title, lines: s ? [s[0].toUpperCase() + s.slice(1)] : [] }; }
  const t = String(text || "").trim().replace(/\.$/, "");
  const at = t.indexOf(": ");
  const name = at > 0 ? t.slice(0, at) : t;
  const lines = at > 0 ? t.slice(at + 2).split("; ").map((s) => s[0].toUpperCase() + s.slice(1)) : [];
  return { name, lines };
}

function fill(text, title = null) {
  const { name, lines } = cardOf(text, title);
  const head = document.createElement("div");
  head.className = "ic-head";
  const n = document.createElement("span");
  n.className = "hc-name";
  n.textContent = name;
  const x = document.createElement("button");
  x.className = "ic-close";
  x.title = "Close";
  x.textContent = "×";
  head.append(n, x);
  const parts = [head];
  for (const l of lines) {
    const d = document.createElement("div");
    d.className = "hc-line";
    d.textContent = l;
    parts.push(d);
  }
  el.replaceChildren(...parts);
}

// An Inspect done: the card for the prop `id` (its tiles marked), its words `read(prop)`, its title `name` when the words are not "Name: facts".
export function open({ id, tiles, read, name = null, layer = 0 }) {
  cur = { id, tiles: tiles.map(([x, y]) => [x, y]), read, name, text: null };
  inspectMark.mark(cur.tiles, Infinity, layer); // marked while the card shows, on the thing's own floor
  if (!ensure()) return;
  refresh();
}

export function close() {
  if (!cur) return false;
  cur = null;
  inspectMark.clear();
  if (el) el.hidden = true;
  return true;
}

export const isOpen = () => !!cur;

// For the checks: what the card says and where it stands, or null.
export function current() {
  return cur ? { id: cur.id, text: cur.text, shown: !!el && !el.hidden, rect: el && !el.hidden ? el.getBoundingClientRect() : null } : null;
}

function refresh() {
  const prop = map.propById(cur.id);
  if (!prop) return close();
  const text = cur.read(prop);
  if (!text) return close(); // no longer the thing inspected (a sapling grown into its tree keeps its id)
  if (text !== cur.text) {
    cur.text = text;
    fill(text, cur.name);
  }
  el.hidden = false;
}

// Every frame, from main.js: its words read again, placed above the patch, or closed when its thing is gone or the player far.
export function update(player) {
  if (!cur || !ensure()) return;
  const prop = map.propById(cur.id);
  if (!prop || !player || player.dead) return void close();
  const [tx, ty] = cur.tiles[0];
  if (Math.hypot(player.gx - tx, player.gy - ty) > CLOSE_RANGE) return void close();
  refresh();
  if (!cur) return;
  const s = iso.toScreen(tx, ty);
  const u = view.toUi(s.x, s.y);
  const w = el.offsetWidth;
  const h = el.offsetHeight;
  const { uiW, uiH } = view.view;
  const x = Math.min(Math.max(4, u.x - w / 2), uiW - w - 4);
  const y = Math.min(Math.max(4, u.y - ABOVE - h), uiH - h - 4);
  el.style.left = `${Math.round(x)}px`;
  el.style.top = `${Math.round(y)}px`;
}
