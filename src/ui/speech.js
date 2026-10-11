// Speech bubbles over characters (docs/19). DOM over the canvas, through
// view.toUi like ui/zombie-bars.js, never drawn into it (CLAUDE.md). A bubble is
// a rounded rectangle that wraps its text and grows to any length (a long speech
// is just a taller one), with a tail at the bottom that points down at the top
// of the head of whoever is speaking. A character speaks by `say(ch, text)`
// (entities/character.js), which sets `ch.line`; this module shows it, counts
// its time down in game time, and takes it away.

import * as iso from "../iso.js";
import * as view from "../view.js";
import { tileKey } from "../visibility.js";

// World px above the feet where the tail's tip lands: just over the top of the
// figure's frame (FH 72, feet 66 from its top), so at any zoom the tail meets
// the head and the box clears it.
const HEAD_TOP = 68;

// A speaker this close keeps their bubble even behind a canopy, as the health
// bars do; farther off, a bubble over a figure a tree hides would give it away.
const NEAR = 3.5; // tiles from the player

const EDGE = 8; // UI px a bubble keeps clear of the window's edge
const TAIL_MARGIN = 12; // UI px the tail keeps from a box's corner

let root = null;
let uiEl = null;
const pool = new Map(); // character id -> { el, text, w }

export function initSpeech() {
  uiEl = document.getElementById("ui");
  root = document.createElement("div");
  root.id = "speech";
  uiEl.appendChild(root);
}

function bubbleFor(id) {
  let entry = pool.get(id);
  if (!entry) {
    const el = document.createElement("div");
    el.className = "speech";
    root.appendChild(el);
    entry = { el, text: null, w: 0 };
    pool.set(id, entry);
  }
  return entry;
}

// Show every live line, move it with its speaker, and age it by `dt` seconds of
// game time (a paused game keeps its bubbles). `visible` is the player's fog set.
export function updateSpeech(characters, visible, player, dt) {
  const seen = new Set();
  const uiW = uiEl.clientWidth;
  for (const ch of characters) {
    const line = ch.line;
    if (!line) continue;
    line.left -= dt;
    if (line.left <= 0 || ch.dead) {
      ch.line = null;
      continue;
    }
    const shown =
      ch.kind === "player" ||
      (visible.has(tileKey(Math.round(ch.gx), Math.round(ch.gy))) && !(ch.behindProp && Math.hypot(ch.gx - player.gx, ch.gy - player.gy) > NEAR));
    if (!shown) continue;
    seen.add(ch.id);
    const entry = bubbleFor(ch.id);
    if (entry.text !== line.text) {
      entry.el.textContent = line.text;
      entry.text = line.text;
      entry.w = entry.el.offsetWidth; // the box's width for this text, whatever its length
    }
    const s = iso.toScreen(ch.gx, ch.gy);
    const p = view.toUi(s.x, s.y - HEAD_TOP);
    // The box keeps inside the window; the tail still points at the speaker.
    const half = entry.w / 2;
    const cx = Math.max(half + EDGE, Math.min(p.x, uiW - half - EDGE));
    const tail = Math.max(TAIL_MARGIN, Math.min(p.x - (cx - half), entry.w - TAIL_MARGIN));
    entry.el.style.left = `${Math.round(cx)}px`;
    entry.el.style.top = `${Math.round(p.y)}px`;
    entry.el.style.setProperty("--tail-x", `${Math.round(tail)}px`);
  }
  for (const [id, entry] of pool) {
    if (seen.has(id)) continue;
    entry.el.remove();
    pool.delete(id);
  }
}
