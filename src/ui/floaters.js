// The floating numbers over heads (#294), drawn: DOM over the world through `view.toUi`, like the names and the bars, never into the canvas. Each event the world recorded
// (src/floaters.js: the host's own log, a guest's what the frame carried) becomes a number that rises about a tile over about a second, fading over the last half, drifting a
// little to a side of its own so a quick run of hits does not stack on one spot: red "-X" for a hit, green "+X" for a heal, and for a gather the skill's icon (skill-icons.js)
// with the number, in white where the ground is dark and black where it is light. It follows the body it is over while it lives (the blended position, since the draw is
// between steps), and is left where the body was if the body is gone. Every number is in `data/tuning.json` under `floaters`; the setting `floaters` turns them off.

import * as iso from "../iso.js";
import * as view from "../view.js";
import * as settings from "../settings.js";
import * as light from "../light.js";
import { tileKey } from "../visibility.js";
import * as sight from "../sight.js";
import { floaters as T } from "../tuning.js";
import * as fl from "../floaters.js";
import { skillIconURL, SIZE } from "./skill-icons.js";
import { SMALL_TEXT_MAX_PX, SMALL_FONT_VAR } from "./small-text.js";

let root = null;
const alive = []; // { e, el, age, gx, gy, id, side, size }

export function initFloaters() {
  root = document.createElement("div");
  root.id = "floaters";
  document.getElementById("ui").appendChild(root);
}

// A side and a size of drift for an event, from what every client shares of it (who, what kind, how much; no chance, and not the local log's number, which a
// guest counts for itself): the same event drifts the same on every client.
function driftOf(e) {
  let h = 2166136261 ^ (e.kind * 31 + e.n);
  for (let i = 0; i < e.id.length; i++) h = Math.imul(h ^ e.id.charCodeAt(i), 16777619);
  h = Math.imul(h ^ (h >>> 15), 2654435761) >>> 0;
  const side = ((h & 0xff) / 255) * 2 - 1; // -1 to 1
  return side * (0.55 + 0.45 * (((h >> 8) & 0xff) / 255));
}

function build(e, bright) {
  const el = document.createElement("div");
  el.className = `floater ${e.kind === fl.DAMAGE ? "dmg" : e.kind === fl.HEAL ? "heal" : "gather"}`;
  el.style.fontSize = `${T.fontPx}px`;
  if (T.fontPx <= SMALL_TEXT_MAX_PX) el.style.fontFamily = SMALL_FONT_VAR; // the number is small text (ui/small-text.js)
  let color;
  let edge;
  if (e.kind === fl.DAMAGE) { color = T.damageColor; edge = "#1a1010"; }
  else if (e.kind === fl.HEAL) { color = T.healColor; edge = "#0c2412"; }
  else if (bright) { color = T.gatherDark; edge = "#ffffff"; }
  else { color = T.gatherLight; edge = "#000000"; }
  el.style.color = color;
  el.style.textShadow = `0 1px 0 ${edge}, 1px 0 0 ${edge}, -1px 0 0 ${edge}, 0 -1px 0 ${edge}, 1px 1px 0 ${edge}, -1px -1px 0 ${edge}, 1px -1px 0 ${edge}, -1px 1px 0 ${edge}`;
  el.dataset.text = fl.textOf(e);
  if (e.kind === fl.GATHER && e.skill) {
    const px = SIZE * (T.iconScale || 1);
    const img = document.createElement("img");
    img.src = skillIconURL(e.skill);
    img.width = px;
    img.height = px;
    img.alt = e.skill;
    img.draggable = false;
    img.style.imageRendering = "pixelated";
    const span = document.createElement("span");
    span.textContent = fl.textOf(e);
    el.append(img, span);
    el.dataset.skill = e.skill;
  } else el.textContent = fl.textOf(e);
  root.appendChild(el);
  return el;
}

// Whether there is anything to do this frame (numbers alive, or events not yet given to the drawing), so main.js builds nothing when there is not.
export function active() {
  return alive.length > 0 || fl.pending();
}

// Every frame: new events become numbers, each lives and moves, the spent go. `chars`: everyone a number can be over (players, the dead, villagers, bodies); `visible`: my
// sight (a number over something I cannot see is hidden, so it never gives it away); `me`: my player (always shown).
export function update(dt, chars, visible, me) {
  if (!root) return;
  const on = settings.get("floaters") !== false;
  const events = fl.takeForDraw();
  if (!on) {
    for (const f of alive.splice(0)) f.el.remove();
    return;
  }
  const byId = new Map();
  for (const c of chars) byId.set(c.id, c);
  const together = new Map(); // numbers born this frame over one body: each starts a line higher than the last, so a volley reads
  for (const e of events) {
    const c = byId.get(e.id);
    if (!c) continue;
    const bright = e.kind === fl.GATHER ? light.lightAt(c.gx, c.gy) > T.lightAbove : false;
    const n = together.get(e.id) || 0;
    together.set(e.id, n + 1);
    alive.push({ e, el: build(e, bright), age: 0, gx: c.gx, gy: c.gy, id: e.id, zombie: c.kind === "zombie" && !c.dead, drift: driftOf(e), lift: n * T.fontPx * T.staggerLines });
  }
  while (alive.length > T.maxActive) alive.shift().el.remove();
  for (let i = alive.length - 1; i >= 0; i--) {
    const f = alive[i];
    f.age += dt;
    if (f.age >= T.life) { f.el.remove(); alive.splice(i, 1); continue; }
    const c = byId.get(f.id);
    if (c) { f.gx = c.gx; f.gy = c.gy; } // follows the body while it is there, else stays where it was
    const t = f.age / T.life;
    const s = iso.toScreen(f.gx, f.gy);
    const u = view.toUi(s.x + f.drift * T.drift * t, s.y - T.startLift - f.lift - t * T.riseTiles * iso.TH);
    f.el.style.left = `${Math.round(u.x)}px`;
    f.el.style.top = `${Math.round(u.y)}px`;
    // Mine always; another's only where I see it: in my line of sight and, for a live zombie in the dark, seen as the bars, bubbles, and the drawing are (#88; only the
    // dead fade in the dark, a villager or a friend is drawn whole and so is their number). A body that is gone keeps the rule it had.
    if (c) f.zombie = c.kind === "zombie" && !c.dead;
    const seen = f.id === (me && me.id) || ((!visible || visible.has(tileKey(Math.round(f.gx), Math.round(f.gy)))) && (!me || !f.zombie || sight.seen(me, c || f)));
    f.el.style.display = seen ? "" : "none";
    f.el.style.opacity = t <= T.fadeFrom ? "1" : String(Math.max(0, 1 - (t - T.fadeFrom) / (1 - T.fadeFrom)));
  }
}

// What is on screen now, for the checks: [{ kind, text, color, skill, hidden }].
export function shown() {
  return alive.map((f) => ({ kind: f.e.kind, text: f.el.dataset.text, color: f.el.style.color, skill: f.el.dataset.skill || null, hidden: f.el.style.display === "none", id: f.id }));
}

export function clear() {
  for (const f of alive.splice(0)) f.el.remove();
}
