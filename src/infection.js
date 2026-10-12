// Infection, a marker (Michael, 2026-10-12; docs/05 "Infection, treatable", docs/02 question 29b).
// A landed bite has a chance to infect; the infection is a clock that only shows itself, as a moodle
// going green, yellow, orange, red over `days` in-game days. It does nothing yet: no turning, no
// death, no damage. Cures, mitigation, and what the last stage means are later.
// The numbers are `infection` in data/combat.json.

import * as clock from "./clock.js";
import * as rng from "./rng.js";

export const INFECTION = { chance: 0.2, days: 1.5 };

export function setInfectionData(data) {
  if (data) Object.assign(INFECTION, data);
}

// Real seconds the whole progression takes.
export function duration() {
  return INFECTION.days * clock.DAY_LENGTH;
}

// 0 to 1 and held at 1, or null when not infected.
export function progress(player) {
  if (!player.infection) return null;
  return Math.max(0, Math.min(1, (clock.getElapsed() - player.infection.since) / duration()));
}

// The moodle's stage: 0 none, 1 green, 2 yellow, 3 orange, 4 red.
export function stageOf(player) {
  const p = progress(player);
  if (p === null) return 0;
  return p < 0.25 ? 1 : p < 0.5 ? 2 : p < 0.75 ? 3 : 4;
}

export function infect(player) {
  if (player.infection) return false;
  player.infection = { since: clock.getElapsed() };
  return true;
}

export function cure(player) {
  const had = !!player.infection;
  player.infection = null;
  return had;
}

// A bite that did damage may infect. Returns whether this one did.
export function onBite(player, damageTaken, roll = rng.float()) {
  if (damageTaken <= 0 || player.infection || player.dead) return false;
  return roll < INFECTION.chance ? infect(player) : false;
}
