// Small health bars over damaged zombies, so a finisher reads as itself
// without a dedicated animation (Michael, 2026-10-11): the bar dropping by
// half in one hit already says what happened. DOM over the canvas, through
// view.toUi like ui/prompt.js, never drawn into it (CLAUDE.md).

import * as iso from "../iso.js";
import * as view from "../view.js";
import { tileKey } from "../visibility.js";
import * as sight from "../sight.js";

// World px above the feet anchor (iso.toScreen's tile centre, where the
// figure is drawn from): figure.js's sprite is FH 72 px tall from the feet,
// so this clears the head at any zoom. A flat ui-px offset (prompt.js's way)
// does not: at close zoom the figure outgrows it and the bar sits on the chest.
const HEAD_CLEARANCE = 76;
// A downed one lies flat: its bar sits just over the body, not a standing head's height above it, where it floated beside
// whoever stood near and read as theirs (Michael, 2026-10-24, #385: "their health bar disappears when downed").
const DOWN_CLEARANCE = 30;

// A damaged zombie this close keeps its bar even behind a canopy: it is the one
// being fought, and in a dense forest nearly everything has some canopy in front.
// Farther off, a bar over a zombie hidden by a tree would give it away.
const NEAR = 3.5; // tiles from the player
const PLAYER_CLEARANCE = 66; // world px above the player's feet: over the head and the exposure bar (58)

let root = null;
const pool = new Map(); // zombie id -> { el, fill }

export function initZombieBars() {
  root = document.createElement("div");
  root.id = "zombie-bars";
  document.getElementById("ui").appendChild(root);
}

function barFor(id) {
  let entry = pool.get(id);
  if (!entry) {
    const el = document.createElement("div");
    el.className = "zombie-bar";
    const fill = document.createElement("div");
    fill.className = "zombie-bar-fill";
    el.appendChild(fill);
    root.appendChild(el);
    entry = { el, fill };
    pool.set(id, entry);
  }
  return entry;
}

// Shown only for a zombie that has taken damage and is not yet a corpse: full
// health needs no readout, a corpse has nothing left to show. `visible` is
// the player's fog-of-war set (main.js), so a bar never floats through a wall.
export function updateZombieBars(zombies, visible, player) {
  const seen = new Set();
  for (const z of zombies) {
    if (z.dead || z.hp >= z.maxHp) continue;
    if (z.behindProp && Math.hypot(z.gx - player.gx, z.gy - player.gy) > NEAR) continue;
    if (!visible.has(tileKey(Math.round(z.gx), Math.round(z.gy)))) continue;
    if (!sight.seen(player, z)) continue; // a dead one lost in the dark has no bar floating where it stands (#88)
    seen.add(z.id);
    const { el, fill } = barFor(z.id);
    const s = iso.toScreen(z.gx, z.gy);
    const p = view.toUi(s.x, s.y - (z.state === "down" ? DOWN_CLEARANCE : HEAD_CLEARANCE));
    el.style.left = `${Math.round(p.x)}px`;
    el.style.top = `${Math.round(p.y)}px`;
    const pct = Math.max(0, z.hp / z.maxHp);
    fill.style.width = `${Math.round(pct * 100)}%`;
    fill.style.background = pct > 0.5 ? "#6fbf5f" : pct > 0.25 ? "#d9b84a" : "#d05050";
  }
  // Your own, over your head, while you are hurt (Michael, 2026-10-12): health and exposure are the
  // most immediate things near the character. A little above the exposure bar, which sits just over the head.
  if (!player.dead && player.hp < player.maxHp) {
    seen.add(player.id);
    const { el, fill } = barFor(player.id);
    const s = iso.toScreen(player.gx, player.gy);
    const p = view.toUi(s.x, s.y - PLAYER_CLEARANCE);
    el.style.left = `${Math.round(p.x)}px`;
    el.style.top = `${Math.round(p.y)}px`;
    const pct = Math.max(0, player.hp / player.maxHp);
    fill.style.width = `${Math.round(pct * 100)}%`;
    fill.style.background = pct > 0.5 ? "#6fbf5f" : pct > 0.25 ? "#d9b84a" : "#d05050";
  }
  for (const [id, entry] of pool) {
    if (seen.has(id)) continue;
    entry.el.remove();
    pool.delete(id);
  }
}
