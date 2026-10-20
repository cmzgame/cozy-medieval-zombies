// Object Highlight (#301): the one game object under the cursor that a right-click would offer a real action for is outlined, so a tree, a crop, a chest, an item lying
// on the ground, or a villager reads as something to use and the leaf pile under it, which is only art, does not. This module is the hit test and nothing else: it asks the
// menu's own question (`interact.actionsAt`, and for a tall tree the pixel hit `interactableAt`) and keeps the answer as an address, `{ kind, id | uid, tile }`; the drawing
// is render/highlight.js, which the prop, item, and entity drawables call. Client-only: it reads the world and never writes it, nothing on the wire, nothing saved, and a
// guest's replica gives the same answer from the same world. The answer is cached while the mouse and the camera stand still and re-asked every `refreshMs`, so a hit test is
// not paid every frame.
// Chosen here (the builder's readings, Michael's to overrule): a character before an item before a prop, then the menu's first; the live dead are left to the cursor's zombie hand
// and the swing outline (a corpse is a container, so it is outlined); a door, a shutter, and a wall bracket are edges, not sprites, and are not outlined yet; nothing in
// placement, removal, or Use mode, with a panel under the pointer, with something carried, or out of sight.

import * as iso from "./iso.js";
import * as map from "./map.js";
import * as interact from "./interact.js";
import { tileKey } from "./visibility.js";
import { objectHighlight as T } from "./tuning.js";

let target = null; // { kind: "prop", id } | { kind: "item", uid, tile } | { kind: "character", id }
let lastKey = "";
let lastAt = -1e9;

export const current = () => target;

export function clear() {
  target = null;
  lastKey = "";
  lastAt = -1e9;
}

// The object a right-click at the canvas point (sx, sy) would act on first, or null. `visible`: the tiles in my sight (null: all).
export function targetAt(sx, sy, player, visible = null) {
  const seen = (tx, ty) => !visible || visible.has(tileKey(tx, ty));
  const real = interact.actionsAt(sx, sy, player).filter((a) => a.target && ["character", "item", "prop"].includes(a.target.kind)); // Walk here is a "floor" action on a tile, never one of these
  const ch = real.find((a) => a.target.kind === "character");
  if (ch) {
    const c = interact.characterAt(sx, sy, player);
    if (c && c !== player && !(c.kind === "zombie" && !c.dead) && seen(Math.round(c.gx), Math.round(c.gy))) return { kind: "character", id: c.id };
  }
  const item = real.find((a) => a.target.kind === "item");
  if (item && seen(item.target.tile[0], item.target.tile[1])) return { kind: "item", uid: item.target.uid, tile: item.target.tile };
  // A tall thing's crown is far up the screen from its tile: the pixel under the cursor counts if the thing has an action (a tree's, a crop's) or is interactable (a mushroom
  // sways on a click, the gatherables law). Else the menu's prop, but only one that stands on the tile under the cursor: the menu also lists a tree for the bare ground and leaf
  // litter inside its sprite's rectangle, and that is art beside it, not the tree.
  const front = interact.interactableAt(sx, sy, () => true);
  let prop = front && (front.interactable || interact.actionsForProp(front, player).length > 0) ? front : null;
  if (!prop) {
    const g = iso.toGrid(sx, sy);
    const gx = Math.round(g.gx);
    const gy = Math.round(g.gy);
    const p = real.find((a) => a.target.kind === "prop" && map.propById(a.target.id)?.tiles.some(([tx, ty]) => tx === gx && ty === gy));
    prop = p ? map.propById(p.target.id) : null;
  }
  if (prop && prop.tiles.some(([tx, ty]) => seen(tx, ty))) return { kind: "prop", id: prop.id };
  return null;
}

// Every frame, from main.js: the target for the mouse as it stands. `blocked` is true when something else has the pointer (a mode, a panel).
export function update({ enabled, blocked, mouse, player, visible, now }) {
  if (!enabled || blocked || !mouse || !mouse.inside || !player || player.dead || player.carrying) {
    target = null;
    lastKey = "";
    return target;
  }
  const o = iso.getOrigin();
  const key = `${Math.round(mouse.x)},${Math.round(mouse.y)}|${o.x},${o.y}|${map.worldVersion}`;
  if (key === lastKey && now - lastAt < T.refreshMs) return target;
  lastKey = key;
  lastAt = now;
  target = targetAt(mouse.x, mouse.y, player, visible);
  return target;
}
