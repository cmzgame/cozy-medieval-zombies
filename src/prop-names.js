// A prop's name in words (docs/bugs.md, 2026-10-25: the made jack-o'-lantern read "Made a pumpkin.", the dye vat "Made a dyevat.", a busy
// vat's Pick up "dyevat"): the one place a prop's sprite id becomes the words a line names it by. A leaf, so the map, the stations, the
// menus, and the Use mode all read it without a cycle.
//
// The name, lower-cased: the label of the recipe that makes the prop ("Jack-o'-lantern": its prop is `pumpkin`; "Dye vat"), else its
// definition's `name` ("apple tree", #422; "spinning wheel"), else its sprite id in words, a trailing variant number dropped. With its
// article, it counts as an item does (items.nameWithArticle): the definition's `noun`, `plural`, and `article` ("a pair of millstones").

import { getDef } from "./assets.js";
import { nameWithArticle } from "./items.js";

const labels = new Map(); // a prop's sprite id -> the label of the first recipe that makes it

// The recipes' rows, as stations.loadRecipes reads them: each label a prop recipe gives its prop.
export function setRecipes(rows) {
  labels.clear();
  for (const r of rows || []) {
    const sprite = r && r.out && r.out.prop;
    if (sprite && typeof r.label === "string" && r.label && !labels.has(sprite)) labels.set(sprite, r.label);
  }
}

function defOf(sprite) {
  try { return getDef(sprite); } catch { return null; } // not loaded: the id alone
}

// "dye vat", "jack-o'-lantern", "millstones", "counter".
export function propName(sprite) {
  const s = String(sprite || "");
  const d = defOf(s);
  const n = labels.get(s) || (d && typeof d.name === "string" && d.name) || s.replace(/_\d+$/, "").replace(/_/g, " ");
  return n.toLowerCase();
}

// "a dye vat", "a jack-o'-lantern", "a pair of millstones", "an oven".
export function propAName(sprite) {
  return nameWithArticle(propName(sprite), defOf(String(sprite || "")));
}

// What a container prop's bag is called (its panel's title, "Search X"): the definition's `containerName` ("feeding trough"), else its name.
export function containerName(sprite) {
  const d = defOf(String(sprite || ""));
  return (d && typeof d.containerName === "string" && d.containerName) || propName(sprite);
}

// Whether the name is a plural ("the millstones are"): a definition whose `noun` is "pair".
export function propIsPlural(sprite) {
  const d = defOf(String(sprite || ""));
  return !!(d && d.noun === "pair");
}
