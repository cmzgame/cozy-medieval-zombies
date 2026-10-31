// Planning (Michael, 2026-10-30, `02` "The Planning tool": "a second tool ... called Planning. It lets me lay down any number of rulers ... think
// pastel post it notes, yellow blue green purple pink. All have text saying how big they are, and on hover over an existing ruler ... you can
// remove it. So place, keep it there, remove it when needed"): a plan is a ruler kept in the world, a rectangle of tiles on one storey in one of
// five pastel colours, its size said on it. The world's own: in the save, sent to a guest when the list changes (net.js), in the sync check
// (game.syncParts); laid and taken up through the one path, placement.performPlacement's `plan` and `unplan` commands. No DOM; the panel is
// ui/planning-panel.js, the drawing render/props.js (emitPlans) and ui/plan-labels.js.

export const COLORS = ["yellow", "blue", "green", "purple", "pink"];

// The world the plans live in: game.js binds its state once (the host's, a guest's replica, a server world's), so placement and the drawing read
// the same list the save and the frames carry.
let W = { plans: [], planNext: 0 };
export function bind(S) {
  W = S;
}
export const world = () => W;
export const MAX_SPAN = 256; // the longest side a plan may have, in tiles
export const MAX_PLANS = 500; // how many a world keeps
export const MAX_COORD = 1e6; // no corner farther out than this (the review of #617: a command's corner is the guest's to name)

// "7 tiles", or "5 × 4 tiles (20)".
export function sizeText(w, h) {
  if (w === 1 || h === 1) {
    const n = Math.max(w, h);
    return `${n} ${n === 1 ? "tile" : "tiles"}`;
  }
  return `${w} × ${h} tiles (${w * h})`;
}
export const widthOf = (p) => p.x1 - p.x0 + 1;
export const heightOf = (p) => p.y1 - p.y0 + 1;
export const textOf = (p) => sizeText(widthOf(p), heightOf(p));

// A plan's tiles as drawn: the edge tiles of its rectangle (a run reads as a line, and a big square costs no more to draw).
export function edgeTiles(p) {
  const out = [];
  for (let y = p.y0; y <= p.y1; y++) for (let x = p.x0; x <= p.x1; x++) if (y === p.y0 || y === p.y1 || x === p.x0 || x === p.x1) out.push([x, y]);
  return out;
}

// The plan whose drawn tiles hold (x, y) on storey `layer`, the newest first, or null.
export function planAt(S, x, y, layer) {
  const list = S.plans || [];
  for (let i = list.length - 1; i >= 0; i--) {
    const p = list[i];
    if ((p.layer || 0) !== layer || x < p.x0 || x > p.x1 || y < p.y0 || y > p.y1) continue;
    if (y === p.y0 || y === p.y1 || x === p.x0 || x === p.x1) return p;
  }
  return null;
}

// Lay a plan from tile (ax, ay) to (bx, by) on `layer` in `color`: its record, or why not.
export function add(S, ax, ay, bx, by, layer, color) {
  const n = [ax, ay, bx, by].map((v) => Math.round(Number(v)));
  if (n.some((v) => !Number.isFinite(v) || Math.abs(v) > MAX_COORD) || !COLORS.includes(color) || !Number.isInteger(layer)) return { why: "Not here" };
  const [x0, x1] = [Math.min(n[0], n[2]), Math.max(n[0], n[2])];
  const [y0, y1] = [Math.min(n[1], n[3]), Math.max(n[1], n[3])];
  if (x1 - x0 + 1 > MAX_SPAN || y1 - y0 + 1 > MAX_SPAN) return { why: "Too big to plan" };
  if (!S.plans) S.plans = [];
  if (S.plans.length >= MAX_PLANS) return { why: "Too many plans: take some up" };
  S.planNext = (S.planNext || 0) + 1;
  const p = { id: `plan${S.planNext}`, x0, y0, x1, y1, layer, color };
  S.plans.push(p);
  return { plan: p };
}

// Take a plan up by its id: whether it was there.
export function remove(S, id) {
  const i = (S.plans || []).findIndex((p) => p.id === id);
  if (i < 0) return false;
  S.plans.splice(i, 1);
  return true;
}

// The sync check's text (game.syncParts) and the save's copy.
export const hashText = (S) => (S.plans || []).map((p) => `${p.id} ${p.x0},${p.y0} ${p.x1},${p.y1} L${p.layer} ${p.color}`).join(",");
export const copy = (list) => (list || []).map((p) => ({ id: p.id, x0: p.x0, y0: p.y0, x1: p.x1, y1: p.y1, layer: p.layer || 0, color: p.color }));
