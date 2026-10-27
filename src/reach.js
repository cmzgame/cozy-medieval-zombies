// One reach test for every player action (#208; #206's ruling: over a fence or through an open window is in reach, a wall or a shut door or shutter is
// not, which keeps a sealed room a cell, #147). Distance, and a clear line of sight from the player to the nearest tile of the thing: every action's check
// asks here, on the host where it is performed, so a guest's command meets the same test as the host's own click. A leaf module (it imports only
// visibility), so the verbs, the stations, and the panels can all use it.

import { lineOfSight } from "./visibility.js";

export const TOO_FAR = "Too far away.";
export const WALL_IN_THE_WAY = "There is a wall in the way.";

// The distance to the nearest of some tiles, and that tile.
export function nearestTile(player, tiles) {
  let best = null;
  let bestD = Infinity;
  for (const t of tiles) {
    const d = Math.hypot(player.gx - t[0], player.gy - t[1]);
    if (d < bestD) { bestD = d; best = t; }
  }
  return { tile: best, distance: bestD };
}

// Reach is on one layer (docs/49 section 9): nothing upstairs reaches a chest or a tile below through the floor or out of a window. `layer`
// is the target's (a prop's, a body's); tiles given bare are on the player's own.
export const OTHER_FLOOR = "That is on another floor.";

// null, or why not: on another layer, too far (past `range` tiles to the nearest of the tiles), or a wall (or a shut door or shutter) between.
export function reachProblem(player, tiles, range, layer = (player && player.layer) || 0) {
  if ((layer || 0) !== ((player && player.layer) || 0)) return OTHER_FLOOR;
  const { tile, distance } = nearestTile(player, tiles);
  if (!tile || distance > range) return TOO_FAR;
  if (!lineOfSight(player.gx, player.gy, tile[0], tile[1], (player && player.layer) || 0)) return WALL_IN_THE_WAY;
  return null;
}

// A point: one tile.
export const pointReachProblem = (player, x, y, range) => reachProblem(player, [[x, y]], range);

export const canReach = (player, tiles, range, layer) => reachProblem(player, tiles, range, layer) === null;
