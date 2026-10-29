// Battlements (art round 13, Michael 2026-10-29: "a short stone wall with these merlons ... make sure the whole of the battlement sits outside
// the walkway, as in hanging over, not intruding on the walkway. In CSS terms, I want margin not padding"; Free building's, for now): what a
// battlement edge is and which picture stands on it and at its vertices, pure, read from the map (render/walls.js draws them; check("battlements")
// and tools/check.js prove them). A battlement is a wall whose definition says `wall.battlement` (data/sprites/wall_battlement.json), standing on
// a tile edge of a storey (layer 1 or higher) with the walkway's floor on that layer on ONE side of the edge and none on the other; its stone is
// wholly on the side with no floor, so the walkway tile keeps its whole diamond. Nothing here is saved: the side, the variant, and the corner or
// end pieces are all read from the floors and the neighbouring edges, by a host and a guest alike. The artist's model is the README of art
// round 13 (tools/art-gen/round13/battlements).
//
// Sides, named for the camera as the artist did: FAR is a walkway south of an n edge or east of a w edge (the stone behind it: the camera sees the
// inner faces), NEAR the walkway north of an n edge or west of a w edge (the stone in front of it: the outer faces and the corbels).

import * as map from "./map.js";

// The wall if it is a battlement's.
export const battlementOf = (w) => (w && w.kind === "wall" && map.wallRule(w.sprite).battlement ? w : null);

// Whether tile (x, y) has a floor of its own on `layer` (the walkway's floor; the ground floor of layer 0 is always one), or is the stairwell of a
// stair coming up to the walkway there: its hole is the walkway's own and the parapet is its rail (Michael, 2026-10-29: "It needs a wall walk to
// stand on" beside stairs running along the wall, where the stairwell's tiles are void).
export function floored(x, y, layer) {
  const t = map.peekTile(x, y, layer);
  if (!t) return false;
  if (!map.isEngineFloor(t.floor)) return true;
  const h = map.stairAt(x, y, layer);
  return !!(h && h.well);
}

// "far", "near", or null (floors on both sides of the edge, on neither, or on the ground: no side to stand on) for the edge (tx, ty, edge) on `layer`.
export function sideOf(tx, ty, edge, layer) {
  if (layer < 1) return null;
  const own = floored(tx, ty, layer);
  const across = edge === "n" ? floored(tx, ty - 1, layer) : floored(tx - 1, ty, layer);
  return own === across ? null : own ? "far" : "near";
}

// Why a battlement may not stand on the edge (tx, ty, edge) of `layer`, or "" (the host's and a guest's alike).
export function problem(tx, ty, edge, layer) {
  if (layer < 1) return "It needs a wall walk to stand on";
  const own = floored(tx, ty, layer);
  const across = edge === "n" ? floored(tx, ty - 1, layer) : floored(tx - 1, ty, layer);
  if (!own && !across) return "It needs a wall walk to stand on";
  if (own && across) return "Only along the outer edge of a wall walk";
  return "";
}

// The wall on (tx, ty, edge) of `layer` if it is a battlement, else null (a read, growing nothing).
function battAt(tx, ty, edge, layer) {
  const t = map.peekTile(tx, ty, layer);
  return t ? battlementOf(t[edge]) : null;
}

// The corner at vertex (vx, vy) (the top vertex of tile (vx, vy), grid point (vx - 0.5, vy - 0.5)) on `layer`, or null: exactly two battlement
// edges meet there, one n and one w, and the walkway holds one of the four quadrants round it (an outer corner, named for where the vertex sits
// on the walkway's tile) or three (an inner one, named for where it sits on the notch tile), as cliffs.cornerBase classifies a cliff's, read on
// the floors of the battlement's own layer. The quadrants: (vx - 1, vy - 1) the screen's north, (vx, vy - 1) east, (vx - 1, vy) west, (vx, vy) south.
const OUTER = { N: "outer_s", E: "outer_w", W: "outer_e", S: "outer_n" };
const INNER = { S: "inner_n", W: "inner_e", E: "inner_w", N: "inner_s" };
const QUAD = { N: [-1, -1], E: [0, -1], W: [-1, 0], S: [0, 0] };
export function cornerAt(vx, vy, layer) {
  const nE = battAt(vx, vy, "n", layer);
  const nW = battAt(vx - 1, vy, "n", layer);
  const wS = battAt(vx, vy, "w", layer);
  const wN = battAt(vx, vy - 1, "w", layer);
  if ((nE ? 1 : 0) + (nW ? 1 : 0) !== 1 || (wS ? 1 : 0) + (wN ? 1 : 0) !== 1) return null;
  const q = {};
  let count = 0;
  for (const k of Object.keys(QUAD)) {
    q[k] = floored(vx + QUAD[k][0], vy + QUAD[k][1], layer);
    if (q[k]) count++;
  }
  if (count !== 1 && count !== 3) return null;
  const key = Object.keys(QUAD).find((k) => q[k] === (count === 1)); // the walkway's quadrant (outer), or the notch's (inner)
  const east = key === "E" || key === "S";
  const south = key === "W" || key === "S";
  const nTile = [east ? vx : vx - 1, vy];
  const wTile = [vx, south ? vy : vy - 1];
  if (battAt(nTile[0], nTile[1], "n", layer) !== (nE || nW) || battAt(wTile[0], wTile[1], "w", layer) !== (wS || wN)) return null; // not the edges the walkway turns along
  const nSide = sideOf(nTile[0], nTile[1], "n", layer);
  const wSide = sideOf(wTile[0], wTile[1], "w", layer);
  if (!nSide || !wSide) return null;
  return { name: (count === 1 ? OUTER : INNER)[key], inner: count === 3, nTile, wTile, nNear: nSide === "near", wNear: wSide === "near" };
}

// The free end of a run at vertex (vx, vy): exactly one battlement edge meets there. { name: end_<E|S|W|N>_<far|near>, edge, near } or null; the
// letter is the direction the run leaves the vertex in (E: an n edge whose west end is this vertex).
export function endAt(vx, vy, layer) {
  const arms = [["E", vx, vy, "n"], ["W", vx - 1, vy, "n"], ["S", vx, vy, "w"], ["N", vx, vy - 1, "w"]].filter(([, x, y, e]) => battAt(x, y, e, layer));
  if (arms.length !== 1) return null;
  const [dir, x, y, e] = arms[0];
  const side = sideOf(x, y, e, layer);
  return side ? { name: `end_${dir}_${side}`, edge: e, near: side === "near" } : null;
}

// What stands at vertex (vx, vy) beyond the straight pieces: a corner, a run's end, or null.
export function vertexAt(vx, vy, layer) {
  const c = cornerAt(vx, vy, layer);
  if (c) return { kind: "corner", frame: `corner_${c.name}`, ...c };
  const e = endAt(vx, vy, layer);
  return e ? { kind: "end", frame: e.name, ...e } : null;
}

// A straight battlement edge's picture by name: `<north|west>_<far|near>_<plain|plain_1|plain_2|loop|late|early>`. A plain variant by a hash of
// the edge (any meets any), the arrow-loop one for about a tenth of them (`special.chance`), and `late` / `early` where the edge's first / last
// 16 belong to an inner corner at its west or north / east or south vertex. null with no side. `def` is the wall's definition, `has` whether its
// sheet has a frame.
export function edgeFrame(def, tx, ty, edge, layer, has = () => true) {
  const side = sideOf(tx, ty, edge, layer);
  if (!side) return null;
  const key = `${edge === "n" ? "north" : "west"}_${side}`;
  const [a, b] = edge === "n" ? [[tx, ty], [tx + 1, ty]] : [[tx, ty], [tx, ty + 1]];
  const innerA = cornerAt(a[0], a[1], layer);
  const innerB = cornerAt(b[0], b[1], layer);
  const cut = innerA && innerA.inner ? "late" : innerB && innerB.inner ? "early" : null;
  if (cut && has(`${key}_${cut}`)) return `${key}_${cut}`;
  const loop = def.special && def.special.loop && def.special.loop[key];
  if (loop && has(loop) && map.hash2(tx, ty, edge === "n" ? 9 : 10) < (def.special.chance || 0)) return loop;
  const faces = ((def.faces && def.faces[key]) || []).filter(has);
  return faces.length ? faces[Math.floor(map.hash2(tx, ty, edge === "n" ? 7 : 8) * faces.length)] : `${key}_plain`;
}
