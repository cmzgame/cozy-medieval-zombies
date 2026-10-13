// "Use" (Michael, 2026-10-12; docs/30 law 2): the Use entry on any item's menu
// (in a bag, a container, worn, held, on the belt) picks the item up as the
// thing you are about to use, the way OSRS does it: the item stays where it is
// with a gold outline, a label follows the cursor reading "Use <item> → <what
// is under it>", and the next left click, on an item in a bag or on anything in
// the world, is the target. interactions.resolve says what happens; with no row
// the log says "Nothing interesting happens." Escape or a right click cancels.
// The item is never moved by this module.

import * as interactions from "./interactions.js";
import * as log from "./ui/log.js";
import * as view from "./view.js";
import { getItem } from "./items.js";
import * as verbs from "./verbs.js";
import { world } from "./world.js";

let current = null; // { entry, from }
let label = null;
let last = { x: 0, y: 0 };

export function init() {
  label = document.createElement("div");
  label.id = "use-label";
  label.hidden = true;
  document.getElementById("ui").appendChild(label);
  window.addEventListener("pointermove", (e) => {
    last = view.clientToUi(e.clientX, e.clientY);
    if (current) place();
  });
}

function place() {
  label.style.left = `${Math.round(last.x) + 14}px`;
  label.style.top = `${Math.round(last.y) + 18}px`;
}

export function begin(entry, from) {
  current = { entry, from };
  hover(null);
  label.hidden = false;
  place();
}

// Ends the mode; true if it was on.
export function cancel() {
  if (!current) return false;
  current = null;
  label.hidden = true;
  return true;
}

export function isActive() {
  return !!current;
}

export function current_() {
  return current;
}

export function isSelected(entry) {
  return !!current && current.entry === entry;
}

// What the cursor is over, named, for the label; null for nothing.
export function hover(target) {
  if (!current) return;
  const def = getItem(current.entry.id);
  const name = def ? def.name : current.entry.id;
  const to = target ? interactions.nameOfTarget(target) : "";
  label.textContent = `Use ${name} → ${to}`;
}

// The click landed on `target`: resolve and report, then the mode ends.
export function apply(target, player) {
  if (!current) return false;
  const entry = current.entry;
  const row = interactions.resolve(entry, target);
  const def = getItem(entry.id);
  if (!row) log.push(interactions.NOTHING, "result");
  else if (row.action) {
    // A row's `action` names a verb in the table (docs/31/08, habit 4; `verb` is only its label): run it with the entry and the target.
    const r = verbs.run(row.action, world, player, { ...target, entry: entry.uid, item: entry.id }, row.args || {});
    if (!r.ok) log.push(r.reason || interactions.NOTHING, "result");
  } else if (row.message) log.push(row.message, "result");
  else log.push(interactions.NOTHING, "result");
  cancel();
  return true;
}
