// Debuffs (#308; Michael, 2026-10-19: "Bleed debuff, row running along the top of the screen, stuck top right ... number of minutes left (10m) unless < 1m and then (34s)"; docs/02,
// "Debuffs apart from moodles"): a specific negative effect with a time left, shown as an icon in a row at the top right with its time, its stacks, and a hover card. A moodle is
// a general ongoing need (hunger, thirst, tiredness) and the infection stays one; bleeding is the first debuff and left the moodles. Pure and DOM-free: `activeDebuffs(player)` reads
// what the player's own record carries (`player.bleed = { stacks, left }`, run by the host's step in bleed.js and sent in the player's record, so a guest draws the same), and
// `cardOf` says it as a hover card (src/item-info.js's shape, drawn by ui/hover-card.js). ui/debuff-row.js draws the row. Adding a debuff is a row here and an icon in ui/debuff-icons.js.

import { rate } from "./bleed.js";

// Whole minutes from a minute up ("10m"), whole seconds under it ("34s"); never "0s" while it lasts.
export function timeLabel(left) {
  if (!(left > 0)) return "0s";
  const s = Math.ceil(left);
  return s >= 60 ? `${Math.floor(s / 60)}m` : `${s}s`;
}

const trim = (n) => String(+n.toFixed(1));

// The debuffs, in display order. `read` gives { stacks, left } or null; `lines` the card's lines for one that shows.
export const DEBUFFS = [
  {
    id: "bleed",
    name: "Bleeding",
    read: (p) => (p && p.bleed && p.bleed.stacks > 0 && p.bleed.left > 0 ? { stacks: p.bleed.stacks, left: p.bleed.left } : null),
    lines: (d) => [
      `Losing ${trim(rate(d.stacks))} health a second.`,
      "A bandage stops it.",
      "Another bite makes it worse and starts the time again.",
    ],
  },
];

// [{ id, name, stacks, left, time }] for every debuff on this player now.
export function activeDebuffs(player) {
  const out = [];
  for (const def of DEBUFFS) {
    const r = def.read(player);
    if (r) out.push({ id: def.id, name: def.name, stacks: r.stacks, left: r.left, time: timeLabel(r.left) });
  }
  return out;
}

// The hover card for one of them: its name, the kind, its stacks and time, and what it does and what ends it.
export function cardOf(d) {
  const def = DEBUFFS.find((x) => x.id === d.id);
  const state = [d.stacks > 1 ? `×${d.stacks}` : "", `${d.time} left`].filter(Boolean).join(" · ");
  return { name: d.name, kind: "Debuff", state, lines: (def ? def.lines(d) : []).map((t) => [{ t }]), fine: [] };
}
