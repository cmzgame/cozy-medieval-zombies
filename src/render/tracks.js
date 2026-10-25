// Game's tracks on the ground (tracks.js, docs/45 section 2): a pair of small dark prints for each point of a trail, set along the way the
// animal went (a deer's and a boar's two cleaves, a rabbit's two dots side by side), lit and fogged as the ground is, drawn with the ground
// before the walls, props, and characters, and only on tiles in sight.
import * as gl from "../gl.js";
import * as iso from "../iso.js";
import { tileKey } from "../visibility.js";

export function emitTracks(prints, visible) {
  for (const p of prints) {
    if (visible && !visible.has(tileKey(Math.round(p.gx), Math.round(p.gy)))) continue;
    const s = iso.toScreen(p.gx, p.gy);
    // The way it went, on screen, and across it.
    const vx = (p.dx - p.dy) * iso.HW;
    const vy = (p.dx + p.dy) * iso.HH;
    const len = Math.hypot(vx, vy) || 1;
    const ux = vx / len;
    const uy = vy / len;
    const small = p.species === "rabbit";
    const side = small ? 2 : 3;
    const long = small ? 1.8 : 3.4;
    const wide = small ? 1.4 : 1.8;
    const color = gl.rgb("#2a1c10", 0.62 * p.fade); // faint, but found on grass by day (#443's pane look: at 0.42 and half the size they were lost)
    for (const k of [-1, 1]) {
      const cx = s.x - uy * side * k;
      const cy = s.y + ux * side * k * 0.5;
      const quad = [
        [Math.round(cx + ux * long), Math.round(cy + uy * long)],
        [Math.round(cx - uy * wide), Math.round(cy + ux * wide * 0.5)],
        [Math.round(cx - ux * long), Math.round(cy - uy * long)],
        [Math.round(cx + uy * wide), Math.round(cy - ux * wide * 0.5)],
      ];
      gl.poly(quad, color, { world: [p.gx, p.gy] });
    }
  }
}
