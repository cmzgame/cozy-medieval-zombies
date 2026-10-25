// Sick (docs/44 section 4; Michael, 2026-10-25: "Sick is natural, queasy is pre-zombie!"): what tainted water may do to you, a debuff in the row at
// the top right beside bleeding (src/debuffs.js), never a moodle. Small and self-resolving: while Sick, tiredness drains `sickTiredMult` times as fast
// and food heals `sickHealMult` of its number; it lasts `sickDays` of a game day a stack. The state is the player's own, `player.sick = { stacks, left }`
// as `player.bleed` is: the host's step runs it (`update`, in game.js beside bleed's), the player's record carries it to a guest (`left` to two
// decimals, net.js) and the save keeps it. The effects do not grow with the stacks; only how long it lasts does.
//
// `taintedDrink` is the one host function both ways to drink tainted water call (a source's Drink in interact.js `waterActions`, a skin's in
// player.drink): it rolls Sick and the infection, one roll each from `rng`, always both, so a drink costs the generator the same whatever it brings.
// Not Sick, a drink makes you Sick at `sickChance`; already Sick, every tainted drink adds a stack and its time (Primary's reading of "a tainted drink
// while Sick adds a stack"), up to `sickMaxStacks` stacks and as many half days. `infectionChance` of the infection, a second way in beside a bite
// (there is no cure in the valley: a desperate drink, by design).

import * as rng from "./rng.js";
import * as clock from "./clock.js";
import { infect } from "./infection.js";
import { water as W } from "./tuning.js";
import { showMessage } from "./ui/prompt.js";

// Real seconds a stack lasts: `sickDays` of the clock's day.
export const stackSeconds = () => W.sickDays * clock.DAY_LENGTH;

export function stacks(player) {
  return player && player.sick && player.sick.stacks > 0 && player.sick.left > 0 ? player.sick.stacks : 0;
}

export const isSick = (player) => stacks(player) > 0;

// A stack more and its time: the first a stack and `stackSeconds`, each after it a stack more (up to the most) and its time added, up to the most stacks' time.
export function apply(player) {
  if (!player || player.dead) return false;
  const most = W.sickMaxStacks;
  const s = isSick(player) ? player.sick : (player.sick = { stacks: 0, left: 0 });
  s.stacks = Math.min(most, s.stacks + 1);
  s.left = Math.min(most * stackSeconds(), s.left + stackSeconds());
  return true;
}

export function clear(player) {
  const had = isSick(player);
  player.sick = null;
  return had;
}

// Every step on the authority: the time runs down, and it passes.
export function update(player, dt) {
  const s = player.sick;
  if (!s || player.dead) return;
  s.left -= dt;
  if (s.left <= 0) player.sick = null;
}

// What Sick does to the needs and to food: tiredness's drain, and a food's heal.
export const tiredMult = (player) => (isSick(player) ? W.sickTiredMult : 1);
export const healMult = (player) => (isSick(player) ? W.sickHealMult : 1);

// A tainted drink, on the host: both rolls, and the word to the player who drank (the acting player's screen, a guest's through net.js).
// Returns { sick, worse, infected }: Sick began, Sick grew a stack, the infection took.
export function taintedDrink(player, rollSick = rng.float(), rollInfection = rng.float()) {
  const out = { sick: false, worse: false, infected: false };
  if (!player || player.dead) return out;
  if (isSick(player)) out.worse = apply(player);
  else if (rollSick < W.sickChance) out.sick = apply(player);
  if (rollInfection < W.infectionChance) out.infected = infect(player);
  if (out.sick) showMessage("Your stomach turns. You feel sick.", 3);
  else if (out.worse) showMessage("The water sits badly. You feel worse.", 3);
  return out;
}
