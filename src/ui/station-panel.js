// The station panel (docs/30, section 6): one panel for every station, on the
// kit. The recipes on the left (greyed when short, the reason named), the
// chosen one's ingredients with have and need, a count, Make, the queue with
// its bar. Make calls the craft verb and nothing else (docs/31/08, habit 5);
// the station's output opens beside the bag as a container of its own. Top
// centre under the clock; closes on X, Escape, or walking out of reach.

import * as stations from "../stations.js";
import * as verbs from "../verbs.js";
import { world } from "../world.js";
import { getItem } from "../items.js";
import { emit } from "../events.js";
import { showMessage } from "./prompt.js";
import * as map from "../map.js";

let root = null;
let open = null; // { propId, station, recipe (id), count }
let lastHtml = "";
let getPlayer = () => null;

export function initStationPanel(playerGetter) {
  getPlayer = playerGetter;
  root = document.createElement("div");
  root.id = "station";
  root.className = "inv-column kit-frame";
  root.hidden = true;
  document.getElementById("ui").appendChild(root);
  root.addEventListener("mousedown", (e) => e.stopPropagation());
  root.addEventListener("click", (e) => {
    if (!open) return;
    if (e.target.closest("[data-close]")) return close();
    if (e.target.closest("[data-output]")) { const prop = map.propById(open.propId); if (prop) openOutput(prop); return; }
    const row = e.target.closest("[data-recipe]");
    if (row) { open.recipe = row.dataset.recipe; lastHtml = ""; return; }
    if (e.target.closest("[data-make]")) {
      const r = verbs.run("craft", world, getPlayer(), { prop: open.propId }, { recipe: open.recipe, count: open.count });
      if (!r.ok) showMessage(r.reason);
      lastHtml = "";
      return;
    }
  });
  root.addEventListener("change", (e) => {
    const n = e.target.closest("[data-count]");
    if (n && open) open.count = Math.max(1, Math.min(10, Number(n.value) || 1));
  });
}

export function isOpen() {
  return !!open;
}

export function openFor(prop, player) {
  const station = stations.stationOf(prop);
  if (!station) return false;
  // A guest's "Use the workbench" runs on the host as the guest's player (net.js, docs/31/05 item 10): the host's
  // own panel stays shut; the output opens on the guest through containerOpened, and its recipes panel is owed.
  if (player !== getPlayer()) {
    emit("containerOpened", { bag: stations.outputOf(prop), tiles: prop.tiles, name: "output", prop, closeDist: stations.REACH + 1 });
    return true;
  }
  const list = stations.recipesFor(station);
  open = { propId: prop.id, station, recipe: list[0] ? list[0].id : null, count: 1 };
  root.hidden = false;
  lastHtml = "";
  openOutput(prop);
  render(player);
  return true;
}

// The output beside the bag, as any container (main.js hears this and opens
// it). It stays open as far as the panel does, a tile past the station's
// reach, not the plain container's two tiles (Michael lost it at the doorway).
function openOutput(prop) {
  emit("containerOpened", { bag: stations.outputOf(prop), tiles: prop.tiles, name: "output", closeDist: stations.REACH + 1 });
}

// Returns true if it was open.
export function close() {
  if (!open) return false;
  open = null;
  root.hidden = true;
  return true;
}

function title(station) {
  return { workbench: "Workbench", anvil: "Anvil", forge: "Forge", oven: "Oven", cooking: "Cooking", loom: "Loom", dyevat: "Dye vat" }[station] || station;
}

// What a recipe makes, named: an item by its definition, a prop by its sprite.
function nameOfOut(r) {
  if (r.out.prop) { const s = r.out.prop.replace(/_/g, " "); return s[0].toUpperCase() + s.slice(1); }
  return getItem(r.out.id).name;
}

function render(player) {
  if (!open || !player) return;
  const prop = map.propById(open.propId);
  if (!prop) return close();
  const list = stations.recipesFor(open.station);
  const rows = list.map((r) => {
    const can = stations.canMake(player, prop, r, 1);
    const out = nameOfOut(r);
    const sel = r.id === open.recipe ? " selected" : "";
    const why = can === true ? "" : ` <span class="why">${can}</span>`;
    return `<div class="st-row${can === true ? "" : " short"}${sel}" data-recipe="${r.id}"><b>${out}</b>${r.out.count > 1 ? ` ×${r.out.count}` : ""}${why}</div>`;
  }).join("");
  const r = stations.recipe(open.recipe);
  let detail = "";
  if (r) {
    const ins = r.in.map((w) => {
      const n = stations.have(player, prop, w);
      const need = w.count * open.count;
      return `<div class="st-in${n < need ? " short" : ""}">${stations.nameOfWant(w)} <span>${n} / ${need}</span></div>`;
    }).join("");
    const extra = [r.fire ? "needs the fire lit" : "", r.tool ? `needs a ${getItem(r.tool).name.toLowerCase()} in hand` : ""].filter(Boolean).join(", ");
    const can = stations.canMake(player, prop, r, open.count);
    detail = `<div class="st-detail kit-well">${ins}${extra ? `<div class="st-note">${extra}</div>` : ""}<div class="st-make"><label>×<input type="number" min="1" max="10" value="${open.count}" data-count></label><button class="kit-button" data-make ${can === true ? "" : "disabled"} title="${can === true ? `${r.seconds} s` : can}">Make</button></div></div>`;
  }
  const q = (prop.queue || []).map((j, i) => {
    const rr = stations.recipe(j.recipe);
    const p = i === 0 ? stations.progress(prop) : 0;
    const paused = rr && rr.fire && !(prop.fire && prop.fire.lit);
    return `<div class="st-job"><span>${rr ? nameOfOut(rr) : j.recipe}${j.count > 1 ? ` ×${j.count}` : ""}${paused ? " (the fire is out)" : ""}</span><div class="st-bar"><div style="width:${Math.round((p || 0) * 100)}%"></div></div></div>`;
  }).join("");
  const html = `<div class="inv-header kit-header"><span class="inv-title">${title(open.station)}</span><span class="inv-tools"><button class="kit-button" data-output title="Open the station's output box again">Output</button><button class="kit-button inv-close" data-close title="Close">×</button></span></div><div class="st-body"><div class="st-list kit-well">${rows || "<div class='st-note'>Nothing to make here yet.</div>"}</div>${detail}</div>${q ? `<div class="st-queue kit-well">${q}</div>` : ""}`;
  if (html !== lastHtml) {
    root.innerHTML = html;
    lastHtml = html;
  }
}

// Each step: redraw what changed, close when the player has walked away.
export function update(player) {
  if (!open) return;
  const prop = map.propById(open.propId);
  if (!prop) return close();
  let d = Infinity;
  for (const [tx, ty] of prop.tiles) d = Math.min(d, Math.hypot(player.gx - tx, player.gy - ty));
  if (d > stations.REACH + 1) return close();
  render(player);
}
