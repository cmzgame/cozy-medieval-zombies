// A tile marked on the ground (inspect-mark.js): a bright diamond outline on each tile, unlit and unfogged so it reads at night, drawn
// with the ground, before the walls, props, and characters, so whatever stands on or before the tile is drawn over it.
import * as gl from "../gl.js";
import * as iso from "../iso.js";

export function emitTileMark(m) {
  const flags = gl.FLAG_NOFOG | gl.FLAG_UNLIT;
  const color = gl.rgb("#ffe680", 0.95 * m.alpha);
  const fill = gl.rgb("#ffe680", 0.18 * m.alpha);
  for (const [tx, ty] of m.tiles) {
    const p = iso.toScreen(tx, ty);
    const x = Math.round(p.x);
    const y = Math.round(p.y);
    const O = [[x, y - iso.HH], [x + iso.HW, y], [x, y + iso.HH], [x - iso.HW, y]];
    const k = 0.84; // the ring's inner edge, as a share of the tile: about two pixels wide
    const I = O.map(([px, py]) => [Math.round(x + (px - x) * k), Math.round(y + (py - y) * k)]);
    gl.poly(I, fill, { world: [tx, ty], flags });
    for (let i = 0; i < 4; i++) gl.poly([O[i], O[(i + 1) % 4], I[(i + 1) % 4], I[i]], color, { world: [tx, ty], flags });
  }
}
