// Climbing a ladder (docs/53 step 6b; `49` section 4b folded in by Michael's ruling of 2026-10-30, "towers by ladders"). A climb is a timed
// state of the player, `player.ladder = { id, up, t }`, stepped in the player's own step (entities/player.js updatePlayer), so the host and a
// guest's prediction move the same body the same way and the record carries it (a light field, saved and sent as the player's own): `rise`
// runs from 0 to a storey over `ladder.climbSeconds` (data/tuning.json, docs/42) on the ladder's tile, the walk inputs ignored, and at its end
// the body stands on the landing a storey up with `rise` 0; going down is the same backwards from the landing to the ladder's tile. Begun by
// the menu's Climb ladder and Descend ladder and by E (interact.js), a guest's by its command, all on the host. Nobody but a player climbs.

import * as map from "../map.js";
import * as iso from "../iso.js";
import { ladder as T } from "../tuning.js";

// The ladder a player may climb or come down from where it stands, or null: { l, up }. Up from the ladder's own tile or the tile before its
// foot (within `reach` tiles of its tile, on its layer); down from its landing (within `reach` of the hole, on the layer above).
export function ladderNear(player, reach = 1.2) {
  const L = player.layer || 0;
  let best = null;
  for (const l of map.ladders()) {
    if (l.layer === L) {
      const d = Math.hypot(player.gx - l.at[0], player.gy - l.at[1]);
      if (d <= reach && (!best || d < best.d)) best = { l, up: true, d };
    } else if (l.layer + 1 === L) {
      const d = Math.hypot(player.gx - l.at[0], player.gy - l.at[1]);
      if (d <= reach + 0.6 && (!best || d < best.d)) best = { l, up: false, d };
    }
  }
  return best;
}

// Why this player cannot start up or down `l` now, or "".
export function climbProblem(player, l, up) {
  if (!l || !map.ladders().includes(l)) return "There is no ladder there.";
  if (player.ladder) return "You are already on a ladder.";
  if (player.carrying) return "Not while carrying that.";
  if ((player.layer || 0) !== (up ? l.layer : l.layer + 1)) return "That is on another floor.";
  return "";
}

// Start the climb: the body on the ladder's tile, at the foot going up or a storey up going down, facing the ladder.
export function begin(player, l, up) {
  const why = climbProblem(player, l, up);
  if (why) return why;
  player.ladder = { id: l.id, up: !!up, t: 0 };
  player.auto = null;
  player.action = null;
  player.gx = l.at[0];
  player.gy = l.at[1];
  player.layer = l.layer;
  player.rise = up ? 0 : map.STOREY;
  const s = iso.toScreen(l.d[0], l.d[1]);
  player.facing = iso.facingFromScreenVector(s.x - iso.toScreen(0, 0).x, s.y - iso.toScreen(0, 0).y);
  return "";
}

// One step of a climb: the rise by the clock of the step, and at its end the body off the ladder at its landing (up) or its foot (down).
// A ladder taken away under a climber (a guest's copy, a save) lands it at the nearer end.
export function step(player, dt) {
  const c = player.ladder;
  if (!c) return;
  const l = map.ladders().find((q) => q.id === c.id);
  c.t += dt;
  const k = Math.min(1, c.t / Math.max(0.1, T.climbSeconds));
  const frac = c.up ? k : 1 - k;
  if (!l) {
    finish(player, null, frac >= 0.5);
    return;
  }
  player.rise = Math.round(map.STOREY * frac * 100) / 100;
  if (k >= 1) finish(player, l, c.up);
}

function finish(player, l, top) {
  delete player.ladder;
  player.rise = 0;
  if (!l) return;
  if (top) {
    player.layer = l.layer + 1;
    player.gx = l.landing[0];
    player.gy = l.landing[1];
  } else {
    player.layer = l.layer;
    player.gx = l.at[0];
    player.gy = l.at[1];
  }
}
