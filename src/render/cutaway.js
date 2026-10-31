// The cutaway (Michael, 2026-10-30, `02` "The cutaway and walls down": "more transparency is needed here, even outside a room. I am trying to lay
// floor but I literally can't see what I am doing"): the cover rule's stub (docs/53 section 6.2, mechanism 3) taken outdoors. A wall standing
// between the camera and a cut point (the viewer, and the cursor while a build piece, the ruler, or Take apart is in hand) is drawn cut to the
// stub, as the near walls of the viewer's own room are; and with the walls down (H, while the build menu is open) every wall on the viewer's
// storey is. Never faded, never a cliff. The scene sets it for the viewer's storey alone (render/scene.js); the walls, the posts, and the round
// rooms read it (render/walls.js, render/rings.js). This client's view: nothing in it reaches the world or the wire.

import { cover } from "../tuning.js";

let points = []; // [{ x, y }]: grid points on the storey being drawn whose camera side is cut
let down = false; // every wall on the storey cut

export function setCutaway(c) {
  points = (c && c.points) || [];
  down = !!(c && c.down);
}

// Whether any cut is in force on the storey being drawn.
export const active = () => down || points.length > 0;
export const allDown = () => down;

// Whether a point stands behind a wall whose middle is (mx, my), the wall's far side being the point's: within `cutReach` of it toward the
// screen's top (a 96 px wall covers six of those, and a body stands on its feet) and `cutWidth` of it across the screen.
function behind(mx, my, p) {
  const d = mx + my - (p.x + p.y); // how far nearer the camera the wall stands
  const s = mx - my - (p.x - p.y); // how far across the screen from the point
  return d > 0 && d <= cover.cutReach && Math.abs(s) <= cover.cutWidth;
}

// Whether the wall on the edge `edge` of (tx, ty) is cut: the walls down, or a cut point on its far side behind it.
export function edgeCut(tx, ty, edge) {
  if (down) return true;
  if (!points.length) return false;
  const [mx, my] = edge === "n" ? [tx, ty - 0.5] : [tx - 0.5, ty];
  for (const p of points) {
    if (edge === "n" ? p.y >= my : p.x >= mx) continue; // on the camera's side of it: not in its way
    if (behind(mx, my, p)) return true;
  }
  return false;
}

// Whether a round room's near half is cut: the walls down, or a cut point inside its square or behind it.
export function ringCut(r) {
  if (down) return true;
  const c = (r.n - 1) / 2;
  const [cx, cy] = [r.x0 + c, r.y0 + c];
  for (const p of points) {
    const inside = p.x >= r.x0 - 0.5 && p.x <= r.x0 + r.n - 0.5 && p.y >= r.y0 - 0.5 && p.y <= r.y0 + r.n - 0.5;
    if (inside) return true;
    // The near half's front at the point's screen column (a circle of radius R: across the screen u = dx - dy, toward the camera v = dx + dy,
    // and u² + v² = 2R²), and the point behind it within the reach (the review of its first form: a point south of the ring is in front of it).
    const R = r.n / 2;
    const u = p.x - p.y - (cx - cy);
    if (Math.abs(u) > R * Math.SQRT2 + cover.cutWidth) continue;
    const uc = Math.min(Math.abs(u), R * Math.SQRT2);
    const d = cx + cy + Math.sqrt(Math.max(0, 2 * R * R - uc * uc)) - (p.x + p.y);
    if (d > 0 && d <= cover.cutReach + 2 * R) return true;
  }
  return false;
}
