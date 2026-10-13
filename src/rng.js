// One seeded generator for the simulation (docs/23a, C1; docs/05 "Co-op", the
// free rules; CLAUDE.md's tiebreaker). Every roll the sim makes comes from here,
// in step order, so the same seed and the same inputs give the same world, a
// scripted check can repeat itself (tools/checks/determinism.js), and a host
// could hand a guest the seed. Seeded from the map file's `seed` at boot. Visual
// randomness that changes nothing (embers, smoke) may still use Math.random; the
// map's own wild is position-keyed by `hash2` and stays so. sfc32.

let a = 0;
let b = 0;
let c = 0;
let d = 0;

export function seed(n = 1) {
  a = 0x9e3779b9;
  b = 0x243f6a88;
  c = 0xb7e15162;
  d = (n >>> 0) || 1;
  for (let i = 0; i < 12; i++) float(); // mix the seed in
}

// 0 inclusive to 1 exclusive.
export function float() {
  a |= 0;
  b |= 0;
  c |= 0;
  d |= 0;
  const t = (((a + b) | 0) + d) | 0;
  d = (d + 1) | 0;
  a = b ^ (b >>> 9);
  b = (c + (c << 3)) | 0;
  c = (c << 21) | (c >>> 11);
  c = (c + t) | 0;
  return (t >>> 0) / 4294967296;
}

// 0 to n - 1.
export function int(n) {
  return Math.floor(float() * n);
}

export function range(lo, hi) {
  return lo + float() * (hi - lo);
}

export function chance(p) {
  return float() < p;
}

export function pick(list) {
  return list[int(list.length)];
}

// The four words, for a save (docs/31/05, item 24): put back, the sequence goes on where it was.
export function getState() {
  return [a, b, c, d];
}

export function setState(s) {
  a = s[0] | 0;
  b = s[1] | 0;
  c = s[2] | 0;
  d = s[3] | 0;
}

seed(1);
