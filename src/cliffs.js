// Cliffs (art round 10, Michael's approval 2026-10-28: Free building's pieces, for experimenting): what a cliff edge is and which picture
// stands at a vertex, pure, read from the map (render/walls.js draws them; tools/check.js proves the corners headless). A cliff is a wall
// whose definition says `wall.cliff` (data/sprites/wall_cliff.json, wall_cliff_grass.json), standing on a layer's tile edges; its plateau
// is the tiles with a floor on the layer above (a cliff top, or any floor). The artist's model is tools/art-gen/round10/cliffs/README.md.

import * as map from "./map.js";

// The wall if it is a cliff's plain wall, else null.
export const cliffWallOf = (w) => (w && w.kind === "wall" && map.wallRule(w.sprite).cliff ? w : null);

// Whether tile (x, y) has a floor on the storey above `layer`: the plateau of a cliff on `layer`.
export function plateauAt(x, y, layer) {
  const t = map.peekTile(x, y, layer + 1);
  return !!t && !map.isEngineFloor(t.floor);
}

// The corner at vertex (vx, vy) (the top vertex of tile (vx, vy), grid point (vx - 0.5, vy - 0.5)) on `layer`, before the halves, or
// null: exactly two cliff edges meet there, one n and one w, and the plateau holds one of the four quadrants round it (an outer corner,
// named for where the vertex sits on that plateau tile) or three (an inner one, named for where it sits on the notch tile); the two edges
// are the ones the plateau turns along. The quadrants: (vx - 1, vy - 1) the screen's north, (vx, vy - 1) east, (vx - 1, vy) west,
// (vx, vy) south. { name, nTile, wTile, n, w, nFront, wFront }: the tiles whose n and w edges it owns, those walls, and whether each
// edge's face is seen (its plateau behind it: the n edge's tile to the north floored, the w edge's to the west).
const OUTER = { N: "outer_s", E: "outer_w", W: "outer_e", S: "outer_n" };
const INNER = { S: "inner_n", W: "inner_e", E: "inner_w", N: "inner_s" };
const QUAD = { N: [-1, -1], E: [0, -1], W: [-1, 0], S: [0, 0] };
export function cornerBase(vx, vy, layer) {
  const nE = map.tileAt(vx, vy, layer).n;
  const nW = map.tileAt(vx - 1, vy, layer).n;
  const wS = map.tileAt(vx, vy, layer).w;
  const wN = map.tileAt(vx, vy - 1, layer).w;
  const nOn = [nE, nW].filter(Boolean);
  const wOn = [wS, wN].filter(Boolean);
  if (nOn.length !== 1 || wOn.length !== 1 || !cliffWallOf(nOn[0]) || !cliffWallOf(wOn[0])) return null;
  const q = {};
  let count = 0;
  for (const k of Object.keys(QUAD)) {
    q[k] = plateauAt(vx + QUAD[k][0], vy + QUAD[k][1], layer);
    if (q[k]) count++;
  }
  if (count !== 1 && count !== 3) return null;
  const key = Object.keys(QUAD).find((k) => q[k] === (count === 1)); // the plateau's quadrant (outer), or the notch's (inner)
  const east = key === "E" || key === "S";
  const south = key === "W" || key === "S";
  const nTile = [east ? vx : vx - 1, vy];
  const wTile = [vx, south ? vy : vy - 1];
  const n = map.tileAt(nTile[0], nTile[1], layer).n;
  const w = map.tileAt(wTile[0], wTile[1], layer).w;
  if (n !== nOn[0] || w !== wOn[0]) return null; // its two edges are not the ones the plateau turns along
  return { name: (count === 1 ? OUTER : INNER)[key], nTile, wTile, n, w, nFront: plateauAt(nTile[0], nTile[1] - 1, layer), wFront: plateauAt(wTile[0] - 1, wTile[1], layer) };
}

// The corner at (vx, vy) with its picture's name (`frame`): its halved picture for an edge the corner at that edge's other end claims too
// (`_hn`, `_hw`, `_hnw`: a step one tile long). `base` is cornerBase or a cached one (the renderer's, a frame's worth).
export function cornerAt(vx, vy, layer, base = cornerBase) {
  const c = base(vx, vy, layer);
  if (!c) return null;
  // The n edge of tile (x, vy) runs between the vertices (x, vy) and (x + 1, vy); the w edge of (vx, y) between (vx, y) and (vx, y + 1).
  const on = base(...(c.nTile[0] === vx ? [vx + 1, vy] : [vx - 1, vy]), layer);
  const ow = base(...(c.wTile[1] === vy ? [vx, vy + 1] : [vx, vy - 1]), layer);
  const hn = !!(on && on.n === c.n);
  const hw = !!(ow && ow.w === c.w);
  return { ...c, frame: `${c.name}${hn || hw ? `_h${hn ? "n" : ""}${hw ? "w" : ""}` : ""}` };
}

// Whether the cliff edge `wall` on (tx, ty, edge) is drawn by a corner piece at either of its ends.
export function claimedByCorner(tx, ty, edge, wall, layer, base = cornerBase) {
  const ends = edge === "n" ? [[tx, ty], [tx + 1, ty]] : [[tx, ty], [tx, ty + 1]];
  return ends.some(([vx, vy]) => {
    const c = base(vx, vy, layer);
    return !!c && (edge === "n" ? c.n : c.w) === wall;
  });
}

// A straight cliff edge's picture by name: `back[side]` when its plateau is on the camera's side (its own tile floored above), else one of
// `faces[side]` by a hash of the edge (any variant meets any other). `def` is the wall's definition, `has` whether its sheet has a frame.
export function edgeFrame(def, tx, ty, edge, layer, has = () => true) {
  const side = edge === "n" ? "north" : "west";
  if (plateauAt(tx, ty, layer) && def.back && def.back[side] && has(def.back[side])) return { name: def.back[side], back: true };
  const faces = ((def.faces && def.faces[side]) || []).filter(has);
  return { name: faces.length ? faces[Math.floor(map.hash2(tx, ty, edge === "n" ? 7 : 8) * faces.length)] : `${side}_plain`, back: false };
}
