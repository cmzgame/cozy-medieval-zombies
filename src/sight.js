// What a player sees of the dead in the dark (Michael, #88, 2026-10-16: "darkness shortens sight, the dead fading to
// hidden past a soft edge unless they stand in light; a torch gives sight back; numbers in data"). Line of sight
// (visibility.js) says what is not behind a wall; this says how much of the dead in view is seen: in daylight all of them
// (the light there is high), at night those within a short radius, fading to hidden over a soft edge past it, and anyone
// standing in light at any distance (a fire, a lit window or room, a lamp post, a torch: the viewer's own carried light
// is in `light.lightAt` like anyone's, so a torch gives sight back to its pool, and a lit one is seen from afar and sees
// you in return). Each client asks about its own player and reads its own copy of the light, so a guest's sight is its
// own. Not all of it is the client's alone: since #150 a click on the dead (`interact.clickCharacterAt`, in the host's step)
// asks `seen` through `characterAt`, with the host's copy of the light and the clicking player's own; the dead's own sight
// of a player is `entities/zombie.js`'s.
// Every number is `data/tuning.json`'s `sight`.

import * as light from "./light.js";
import { sight as T } from "./tuning.js";

const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);

// 0 (hidden) to 1 (seen whole): how much of this dead one the viewer sees, wall or no wall aside.
export function seenAlpha(viewer, z) {
  if (z.burning) return 1; // a body on fire is its own light
  const lit = clamp01((light.lightAt(z.gx, z.gy, z.layer || 0) - T.litNone) / (T.litFull - T.litNone));
  if (lit >= 1) return 1;
  const d = Math.hypot(z.gx - viewer.gx, z.gy - viewer.gy);
  // The radius seen whole: the short one of the dark, or the viewer's own carried light's, a torch giving sight back to its radius.
  let reach = T.darkRadius;
  for (const c of light.carriers()) if (c.owner === viewer.id && c.radius > reach) reach = c.radius; // by owner, not by where it stands: a guest's own player is ahead of or behind the host's record of it
  const near = 1 - clamp01((d - reach) / T.edge);
  return Math.max(lit, near);
}

// Whether it is seen enough to be told of at all (a health bar, a speech bubble): past the fade's midpoint.
export function seen(viewer, z) {
  return seenAlpha(viewer, z) >= T.seenAt;
}
