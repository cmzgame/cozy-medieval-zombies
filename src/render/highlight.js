// Object Highlight, drawn (#301): the outline round the object src/highlight.js found under the cursor. The same trick as the swing-target outline (entities.js): eight
// copies of the sprite a pixel off in each direction, flat in one colour, drawn just behind the sprite, unlit and unfogged so it reads at night. `set` is called once a frame
// by renderScene with the target (or null); the prop, item, and entity drawables ask `isProp`, `isItem`, `isCharacter` and call `outline` or `hull`. Client-only drawing.

import * as gl from "../gl.js";
import { frameQuad } from "./scene.js";
import { objectHighlight as T } from "../tuning.js";

const OFFSETS = [[-1, 0], [1, 0], [0, -1], [0, 1], [-1, -1], [1, -1], [-1, 1], [1, 1]];
let target = null;
let color = null; // read once, from the tuning loaded at boot

export function set(t) {
  target = t || null;
  if (target && !color) color = gl.rgb(T.color, T.alpha);
}

export const isProp = (id) => !!target && target.kind === "prop" && target.id === id;
export const isCharacter = (id) => !!target && target.kind === "character" && target.id === id;
export const isItem = (uid) => !!target && target.kind === "item" && target.uid === uid;
export const isPainting = (tx, ty, edge) => !!target && target.kind === "painting" && target.tx === tx && target.ty === ty && target.edge === edge;

// The sprite frame outlined: `opts` are the frame's own quad options (its world point and heights); the colour, SOLID, UNLIT and NOFOG are put on here, with any `extra` flag.
export function outline(sheet, name, x, y, opts, flip = false, extra = 0, skew = 0) {
  const o = { ...opts, color, flags: gl.FLAG_NOFOG | gl.FLAG_UNLIT | gl.FLAG_SOLID | extra };
  if (skew) o.skew = skew;
  for (const [ox, oy] of OFFSETS) frameQuad(sheet, name, x + ox, y + oy, o, flip);
}

// The same outline for part of a frame: the rectangle (x, y, w, h) drawn from the texture range `uv` (a wide painting's half, which belongs to one wall segment).
export function outlineRect(x, y, w, h, uv, opts) {
  const o = { ...opts, color, flags: gl.FLAG_NOFOG | gl.FLAG_UNLIT | gl.FLAG_SOLID };
  for (const [ox, oy] of OFFSETS) gl.quad(x + ox, y + oy, w, h, uv, o);
}

// An item block lying on the ground: a halo a pixel wider than its block, behind it.
export function itemHalo(ox, oy, world) {
  gl.poly([[ox - 8, oy], [ox, oy - 5], [ox + 8, oy], [ox + 8, oy + 4], [ox, oy + 8], [ox - 8, oy + 4]], color, { world, flags: gl.FLAG_NOFOG | gl.FLAG_UNLIT });
}
