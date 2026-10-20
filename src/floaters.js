// Floating numbers over heads (#294): the events behind them, kept by the world and carried to every client. A hit on anyone (a red "-X" over the one hit, so the damage you take
// and the damage you deal are the same number over the right head), a heal (a green "+X": food now; a potion, a drain, or a spell when they come), and a gather (a skill's
// icon with the number gained: the items, until skills give experience, #275). The authority records each in its own step, where the thing happens (`damagePlayer`,
// `damageZombie`, `damageVillager`, `eat`, `verbs.run`), so a guest cannot record a different number; they ride the frame like the pokes and every client draws them
// (ui/floaters.js), the host from its own log and a guest from what it was sent. Natural regeneration, bleeding, burning, and hunger are trickles, not events: they show
// nothing. Cosmetic: not saved, not in the sync check, never read by the simulation, no chance and no clock. No DOM, so a headless world records them too.

import { floaters as T } from "./tuning.js";

export const DAMAGE = 0;
export const HEAL = 1;
export const GATHER = 2;

const MAX_LOG = 300; // a headless world, or a client not drawing, never grows this
let guestCheck = () => false; // set by main.js: a guest records nothing of its own, it draws what the host sent
let seq = 0;
let log = []; // { seq, kind, id, n, skill }
let sentTo = 0; // the frame's cursor (a seq): what the host has sent guests
let drawnTo = 0; // the drawing's cursor

export function setGuestCheck(fn) {
  guestCheck = typeof fn === "function" ? fn : () => false;
}

export function reset() {
  seq = 0;
  log = [];
  sentTo = 0;
  drawnTo = 0;
}

function push(kind, id, n, skill = null) {
  if (guestCheck() || typeof id !== "string" || !(n >= 0.5)) return;
  log.push({ seq: ++seq, kind, id, n: Math.round(n), skill });
  if (log.length > MAX_LOG) log.splice(0, log.length - MAX_LOG);
}

// A hit: `amount` hit points taken from `target` (anyone: a player, one of the dead, a villager).
export function damage(target, amount) {
  if (target) push(DAMAGE, target.id, amount);
}

// A heal: `amount` hit points given to `target` (what was gained, not what was offered).
export function heal(target, amount) {
  if (target) push(HEAL, target.id, amount);
}

// A gather: `n` of something gained by a player through a skill (an id from ui/skill-icons.js).
export function gather(player, skill, n) {
  if (player) push(GATHER, player.id, n, skill);
}

// After any verb ran (verbs.js): a gathering verb makes a gather. The table is data (`floaters.gathers` in data/tuning.json): the verb's name, the skill, and the
// field of the verb's result that says how many (a number, or something that is there: a fish caught counts one).
export function verbDone(name, player, out) {
  const g = T.gathers && T.gathers[name];
  if (!g || !out || out.ok === false) return;
  const v = out[g[1]];
  const n = typeof v === "number" ? v : v ? 1 : 0;
  if (n > 0) gather(player, g[0], n);
}

// What the frame carries: the events since the last frame, as small arrays [kind, id, n, skill]. Taken once a frame; with nobody to tell it is simply drained.
export function takeForFrame() {
  const out = [];
  for (const e of log) if (e.seq > sentTo) out.push(e.skill ? [e.kind, e.id, e.n, e.skill] : [e.kind, e.id, e.n]);
  sentTo = seq;
  return out;
}

// A guest takes what the host sent (the frame's `floaters`), as events of its own to draw.
export function receive(list) {
  if (!Array.isArray(list)) return;
  for (const e of list) {
    if (!Array.isArray(e)) continue;
    const [kind, id, n, skill] = e;
    if ((kind !== DAMAGE && kind !== HEAL && kind !== GATHER) || typeof id !== "string" || !(n >= 0.5)) continue;
    log.push({ seq: ++seq, kind, id, n: Math.round(n), skill: typeof skill === "string" ? skill : null });
  }
  if (log.length > MAX_LOG) log.splice(0, log.length - MAX_LOG);
  sentTo = seq; // a guest sends nothing on
}

// What the drawing has not yet shown, once.
export function takeForDraw() {
  const out = log.filter((e) => e.seq > drawnTo);
  drawnTo = seq;
  return out;
}

// A word for the number: "-8" for a hit, "+5" for a heal, "+3" for a gather.
export function textOf(e) {
  return `${e.kind === DAMAGE ? "-" : "+"}${Math.max(1, Math.round(e.n))}`;
}
