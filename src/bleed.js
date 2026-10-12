// Bleeding (Michael, 2026-10-12; docs/02 question 29b): the small, readable way for a bite to cost
// something after the fight. A landed bite may add a stack (up to `max`); the stacks drain health at
// `dpsByStacks` a second (a table, not a multiple: it rises faster than the count, so one stack is a
// nuisance and five are an emergency), and the timer is refreshed by every new bite, so a wound that is not
// reopened closes by itself after `duration` seconds and one that is kept open keeps bleeding. A
// bandage stops it at once. Michael's two bounds: a full stack kept fresh, with no other damage, must
// take 8 to 10 seconds or more to kill from full health (here 10: 10 a second), and a single stack,
// unless you are already very low, should be a nuisance (here 0.4 a second, under 5 health in all).
// The numbers are `bleed` in data/combat.json.

export const BLEED = { chance: 0.5, dpsByStacks: [0.4, 1.6, 3.6, 6.4, 10], max: 5, duration: 12 };

export function setBleedData(data) {
  if (data) Object.assign(BLEED, data);
}

// Health lost a second at this many stacks.
export function rate(n) {
  if (n <= 0) return 0;
  const t = BLEED.dpsByStacks;
  return t[Math.min(n, t.length) - 1];
}

export function stacks(player) {
  return player.bleed ? player.bleed.stacks : 0;
}

// One more stack, the timer back to full.
export function apply(player) {
  if (player.dead) return false;
  const b = player.bleed || (player.bleed = { stacks: 0, left: 0 });
  b.stacks = Math.min(BLEED.max, b.stacks + 1);
  b.left = BLEED.duration;
  return true;
}

export function clear(player) {
  const had = stacks(player) > 0;
  player.bleed = null;
  return had;
}

// Every step: the open wound takes health, and closes when its timer runs out.
export function update(player, dt) {
  const b = player.bleed;
  if (!b || player.dead) return;
  b.left -= dt;
  if (b.left <= 0) {
    player.bleed = null;
    return;
  }
  player.hp = Math.max(0, player.hp - rate(b.stacks) * dt);
}

// A bite that did damage may open (or widen) a wound. Returns whether it did.
export function onBite(player, damageTaken, roll = Math.random()) {
  if (damageTaken <= 0 || player.dead) return false;
  return roll < BLEED.chance ? apply(player) : false;
}
