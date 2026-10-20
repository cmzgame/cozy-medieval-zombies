// The hover card (#262; the law "Every item in a grid has a hover card", Michael 2026-10-18; its look 2026-10-19: "item tooltips in wow when you hover. Little mostly black box,
// rounded, item name and basic details"): one small dark card with a thin light border that follows the pointer, kept on screen, shown almost at once (`delayMs`), and replacing
// the browser's slow title tooltip. This module is only the card: `show(key, build, clientX, clientY)` is called as the pointer moves over something, with a key that names what
// it is over (the card is built again only when the key changes) and a function that builds { name, kind, state, lines, fine } (src/item-info.js says it for an item); `hide()`
// when the pointer is over nothing. A line is a list of segments { t, k }: k "use" is the word Use in --gold, "word" another menu word in bold. Text is set with textContent,
// never as HTML. Client-only: it reads what the replica already has, so a guest sees what the host sees. Its numbers are in data/tuning.json `hoverCard`.

import * as view from "../view.js";
import { hoverCard as T } from "../tuning.js";

let el = null;
let cur = null; // { key, card }
let timer = 0;
let at = { x: 0, y: 0 }; // the pointer, in UI pixels

export function initHoverCard() {
  el = document.createElement("div");
  el.id = "hover-card";
  el.hidden = true;
  document.getElementById("ui").appendChild(el);
}

function span(cls, text) {
  const s = document.createElement("span");
  if (cls) s.className = cls;
  s.textContent = text;
  return s;
}

function lineEl(segs, cls) {
  const d = document.createElement("div");
  d.className = cls;
  for (const s of segs) d.appendChild(span(s.k ? `hc-${s.k}` : "", s.t));
  return d;
}

function fill(card) {
  const parts = [];
  const name = document.createElement("div");
  name.className = "hc-name";
  name.textContent = card.name;
  parts.push(name);
  const sub = [card.kind, card.state].filter(Boolean).join(" · ");
  if (sub) {
    const d = document.createElement("div");
    d.className = "hc-kind";
    d.textContent = sub;
    parts.push(d);
  }
  for (const l of card.lines || []) parts.push(lineEl(l, "hc-line"));
  for (const l of card.fine || []) parts.push(lineEl(l, "hc-fine"));
  el.replaceChildren(...parts);
}

// The card sits down and to the right of the pointer, flipped up or left where that would leave the screen.
function place() {
  if (!el || el.hidden) return;
  const w = el.offsetWidth;
  const h = el.offsetHeight;
  const { uiW, uiH } = view.view;
  let x = at.x + T.gap;
  let y = at.y + T.gap + 4;
  if (x + w > uiW - 2) x = at.x - w - T.gap;
  if (y + h > uiH - 2) y = at.y - h - T.gap;
  el.style.left = `${Math.max(2, Math.round(x))}px`;
  el.style.top = `${Math.max(2, Math.round(y))}px`;
}

export function show(key, build, clientX, clientY) {
  if (!el) return;
  at = view.clientToUi(clientX, clientY);
  if (!cur || cur.key !== key) {
    cur = { key, card: build() };
    fill(cur.card);
    if (el.hidden) {
      clearTimeout(timer);
      timer = setTimeout(() => { if (cur) { el.hidden = false; place(); } }, T.delayMs);
    }
  }
  place();
}

export function hide() {
  if (!el) return;
  clearTimeout(timer);
  cur = null;
  el.hidden = true;
}

// For the checks: what is up, or null.
export function current() {
  return cur ? { key: cur.key, card: cur.card, shown: !!el && !el.hidden, rect: el && !el.hidden ? el.getBoundingClientRect() : null } : null;
}
