// Tracks (docs/45 section 2, Beastlore 3; open to all until the skills): wild game leaves faint prints on the ground pointing the way it
// went, and a player sees them within `tracks.radius` tiles. This client's view alone, read from where the game is (the host's world, or
// a guest's replica): each wild animal's trail is sampled every `tracks.every` tiles it goes and a print kept `tracks.seconds` of game
// time, at most `tracks.keep` an animal. Nothing here is the world's: no wire, no save, no hash; `render/tracks.js` draws them.

import * as clock from "./clock.js";
import { isWild, tracksRule } from "./entities/animal.js";

const trails = new Map(); // animal id -> { last: [gx, gy], prints: [{ gx, gy, dx, dy, at }] }

export function reset() {
  trails.clear();
}

// After each step: a print where a wild animal has gone far enough since its last; old prints and the trails of animals gone are dropped.
export function update(animals) {
  const R = tracksRule();
  const now = clock.getElapsed();
  const seen = new Set();
  for (const a of animals) {
    if (a.dead || !isWild(a)) continue;
    seen.add(a.id);
    let t = trails.get(a.id);
    if (!t) {
      t = { last: [a.gx, a.gy], prints: [] };
      trails.set(a.id, t);
      continue;
    }
    const dx = a.gx - t.last[0];
    const dy = a.gy - t.last[1];
    const d = Math.hypot(dx, dy);
    if (d > 6) t.last = [a.gx, a.gy]; // a jump (a frame after a long gap, a snare's catch): no print across it
    else if (d >= R.every) {
      t.prints.push({ gx: a.gx, gy: a.gy, dx: dx / d, dy: dy / d, at: now, species: a.species });
      if (t.prints.length > R.keep) t.prints.shift();
      t.last = [a.gx, a.gy];
    }
    while (t.prints.length && now - t.prints[0].at > R.seconds) t.prints.shift();
  }
  for (const id of trails.keys()) if (!seen.has(id)) trails.delete(id);
}

// The prints a viewer sees: within the radius of the player, each with how faint it is by its age (newest 1, oldest near 0).
export function near(viewer) {
  if (!viewer || viewer.dead) return [];
  const R = tracksRule();
  const now = clock.getElapsed();
  const out = [];
  for (const t of trails.values()) {
    for (const p of t.prints) {
      if (Math.abs(p.gx - viewer.gx) > R.radius || Math.abs(p.gy - viewer.gy) > R.radius) continue;
      if (Math.hypot(p.gx - viewer.gx, p.gy - viewer.gy) > R.radius) continue;
      out.push({ ...p, fade: Math.max(0.15, 1 - (now - p.at) / R.seconds) });
    }
  }
  return out;
}
