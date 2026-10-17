// Speech bubbles over characters (docs/19). DOM over the canvas, through
// view.toUi like ui/zombie-bars.js, never drawn into it (CLAUDE.md). A bubble is
// a rounded rectangle that wraps its text and grows to any length (a long speech
// is just a taller one), with a tail at the bottom that points down at the top
// of the head of whoever is speaking. A character speaks by `say(ch, text)`
// (entities/character.js), which sets `ch.line`; this module shows it, counts
// its time down in game time, and takes it away.

import * as iso from "../iso.js";
import * as log from "./log.js";
import * as view from "../view.js";
import { tileKey } from "../visibility.js";
import * as sight from "../sight.js";
import * as loop from "../loop.js";

// World px above the feet where the tail's tip lands: just over the top of the
// figure's frame (FH 72, feet 66 from its top), so at any zoom the tail meets
// the head and the box clears it.
const HEAD_TOP = 68;

// A speaker this close keeps their bubble even behind a canopy, as the health
// bars do; farther off, a bubble over a figure a tree hides would give it away.
const NEAR = 3.5; // tiles from the player

const EDGE = 8; // UI px a bubble keeps clear of the window's edge
const TAIL_MARGIN = 22; // UI px the tail keeps from a box's corner (its half-width, 10, plus the rounded corner)
const BORDER = 3; // the outline's width: the tail is placed from the padding box's edge, inside it

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
const lastLeft = new Map(); // an unseen dead one's id -> the seconds its line had left last time: a rise is a new line (a guest's frame replaces the line object, so the object is no key)
let lastHeardAt = -Infinity; // sim seconds
export function updateSpeech(characters, visible, player, dt) {
  const seen = new Set();
  const withLine = new Set();
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
      ch === player ||
      (visible.has(tileKey(Math.round(ch.gx), Math.round(ch.gy))) && !(ch.behindProp && Math.hypot(ch.gx - player.gx, ch.gy - player.gy) > NEAR) &&
        !(ch.kind === "zombie" && !sight.seen(player, ch))); // a groan from the dark shows no bubble where it stands (#88)
    if (!shown) {
      // A groan from one lost in the dark, in line of sight but unseen: no bubble where it stands, and a line in the log with no
      // position instead (Michael, #150: the dark hides information, never physics), once for each, and not in a rush.
      if (ch.kind === "zombie" && visible.has(tileKey(Math.round(ch.gx), Math.round(ch.gy)))) {
        withLine.add(ch.id);
        const prev = lastLeft.get(ch.id);
        lastLeft.set(ch.id, line.left);
        const now = loop.simTime();
        if ((prev === undefined || line.left > prev + 0.05) && now - lastHeardAt > 3) {
          lastHeardAt = now;
          log.push("Something groans in the dark.", "say");
        }
      }
      continue;
    }
    seen.add(ch.id);
    const entry = bubbleFor(ch.id);
    if (entry.text !== line.text) {
      entry.el.textContent = line.text;
      entry.text = line.text;
      entry.w = entry.el.offsetWidth; // the box's width for this text, whatever its length
      // A line said within sight goes to the log as "Name: line" (Michael, 2026-10-12); the dead's groans do not.
      if (ch.kind !== "zombie") log.push(line.text, "say", ch === player ? "You" : ch.name || (ch.kind === "player" ? "Someone" : "Villager"));
    }
    const s = iso.toScreen(ch.gx, ch.gy);
    const p = view.toUi(s.x, s.y - HEAD_TOP);
    // The box keeps inside the window; the tail still points at the speaker.
    const half = entry.w / 2;
    const cx = Math.max(half + EDGE, Math.min(p.x, uiW - half - EDGE));
    const tail = Math.max(TAIL_MARGIN, Math.min(p.x - (cx - half), entry.w - TAIL_MARGIN));
    entry.el.style.left = `${Math.round(cx)}px`;
    entry.el.style.top = `${Math.round(p.y)}px`;
    entry.el.style.setProperty("--tail-x", `${Math.round(tail) - BORDER}px`);
  }
  for (const id of lastLeft.keys()) if (!withLine.has(id)) lastLeft.delete(id);
  for (const [id, entry] of pool) {
    if (seen.has(id)) continue;
    entry.el.remove();
    pool.delete(id);
  }
}
