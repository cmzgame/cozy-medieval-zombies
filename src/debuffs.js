// Debuffs (#308; Michael, 2026-10-19: "Bleed debuff, row running along the top of the screen, stuck top right ... number of minutes left (10m) unless < 1m and then (34s)"; docs/02,
// "Debuffs apart from moodles"): a specific negative effect with a time left, shown as an icon in a row at the top right with its time, its stacks, and a hover card. A moodle is
// a general ongoing need (hunger, thirst, tiredness) and the infection stays one; bleeding is the first debuff and left the moodles. Pure and DOM-free: `activeDebuffs(player)` reads
// what the player's own record carries (`player.bleed = { stacks, left }`, run by the host's step in bleed.js, and `player.sick`, sick.js's, each sent in the player's record, so a guest draws the same), and
// `cardOf` says it as a hover card (src/item-info.js's shape, drawn by ui/hover-card.js). ui/debuff-row.js draws the row. Adding a debuff is a row here and an icon in ui/debuff-icons.js.

import { rate } from "./bleed.js";
import { water as W, potions as POTIONS } from "./tuning.js";

// Minutes from a minute up, rounded up ("10m" for 600 s, "2m" for 61 to 120), whole seconds under it ("34s"); never "0s" while it lasts.
export function timeLabel(left) {
  if (!(left > 0)) return "0s";
  const s = Math.ceil(left);
  return s >= 60 ? `${Math.ceil(s / 60)}m` : `${s}s`; // minutes round up, as WoW's do: a ten-minute wound reads 10m for its whole first minute
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
  {
    // Sick (docs/44 section 4): from tainted water; its stacks are only how long it lasts (src/sick.js).
    id: "sick",
    name: "Sick",
    read: (p) => (p && p.sick && p.sick.stacks > 0 && p.sick.left > 0 ? { stacks: p.sick.stacks, left: p.sick.left } : null),
    lines: () => [
      `Tiredness builds ${Math.round((W.sickTiredMult - 1) * 100)}% faster.`,
      `Food heals ${Math.round((1 - W.sickHealMult) * 100)}% less.`,
      "It passes. More tainted water makes it last longer.",
    ],
  },
  {
    // A buff (docs/47 section 4; docs/39 section 12 puts buffs in this row, in gold): the stamina potion's, `player.buffs.stamina = { left }`, run
    // down by the host's step (src/potions.js) and carried in the player's record as Sick is.
    id: "stamina",
    name: "Stamina potion",
    buff: true,
    read: (p) => (p && p.buffs && p.buffs.stamina && p.buffs.stamina.left > 0 ? { stacks: 1, left: p.buffs.stamina.left } : null),
    lines: () => [`Stamina comes back ${POTIONS.staminaMult === 2 ? "twice" : `${POTIONS.staminaMult} times`} as fast.`, "It passes."],
  },
];

// [{ id, name, stacks, left, time, buff }] for every debuff (and buff) on this player now.
export function activeDebuffs(player) {
  const out = [];
  for (const def of DEBUFFS) {
    const r = def.read(player);
    if (r) out.push({ id: def.id, name: def.name, stacks: r.stacks, left: r.left, time: timeLabel(r.left), buff: !!def.buff });
  }
  return out;
}

// The hover card for one of them: its name, the kind, its stacks and time, and what it does and what ends it.
export function cardOf(d) {
  const def = DEBUFFS.find((x) => x.id === d.id);
  const state = [d.stacks > 1 ? `×${d.stacks}` : "", `${d.time} left`].filter(Boolean).join(" · ");
  return { name: d.name, kind: def && def.buff ? "Buff" : "Debuff", state, lines: (def ? def.lines(d) : []).map((t) => [{ t }]), fine: [] };
}
