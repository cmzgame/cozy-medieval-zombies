// The dye vat's picker (docs/43 section 8, #412): a stripped-down character creation screen on the kit, top centre where a
// station's panel opens. The figure turning (baked by the game's own figure code, as the creation screen's is), the garments
// the player could dye (worn first, then the hands and the bag), a swatch row for each colour region of the chosen one (or a
// row of schemes for an item that lists them), what it would cost, and Apply. Apply runs the `dye` verb (src/dye.js) and
// nothing else: on the host as its own player, on a guest as a command by the vat's id, the entry's uid, and the colours
// (net.sendDye), which the host runs as the guest's player. The colours come back on the entry in the player's record.
// The world runs while it is open (only the pause menu stops the game); it closes on X, Escape, or walking out of reach.

import * as dye from "../dye.js";
import * as verbs from "../verbs.js";
import { world } from "../world.js";
import { getItem } from "../items.js";
import { canReach } from "../reach.js";
import { REACH } from "../stations.js";
import { emit } from "../events.js";
import { showMessage } from "./prompt.js";
import * as map from "../map.js";

let root = null;
let rowsEl = null;
let canvas = null;
let open = null; // { propId, uid, picks: [hex per region] }
let lastHtml = "";
let getPlayer = () => null;
let bake = null; // (worn) -> a figure sheet, from main.js: the player's look in these clothes, the hands empty
let sender = null; // on a guest: Apply goes to the host as a command
let preview = { key: "", sheet: null, facing: 0, timer: null };

export function setSender(fn) {
  sender = fn;
}

export function initDyePanel(playerGetter, bakeFn) {
  getPlayer = playerGetter;
  bake = bakeFn || null;
  root = document.createElement("div");
  root.id = "dye";
  root.className = "inv-column kit-frame";
  root.hidden = true;
  root.innerHTML = `<div class="inv-header kit-header"><span class="inv-title">Dye vat</span><span class="inv-tools"><button class="kit-button inv-close" data-close title="Close">×</button></span></div><div class="dy-body"><canvas class="dy-preview kit-well" width="144" height="216"></canvas><div class="dy-rows kit-well"></div></div>`;
  rowsEl = root.querySelector(".dy-rows");
  canvas = root.querySelector(".dy-preview");
  document.getElementById("ui").appendChild(root);
  root.addEventListener("mousedown", (e) => e.stopPropagation()); // a click on the panel is the panel's
  root.addEventListener("click", (e) => {
    if (!open) return;
    if (e.target.closest("[data-close]")) return close();
    const player = getPlayer();
    const g = e.target.closest("[data-uid]");
    if (g) return choose(player, g.dataset.uid);
    const sw = e.target.closest("[data-region]");
    if (sw) { open.picks[Number(sw.dataset.region)] = sw.dataset.hex; lastHtml = ""; return; }
    const sc = e.target.closest("[data-scheme]");
    if (sc) { open.picks = sc.dataset.scheme.split(","); lastHtml = ""; return; }
    if (e.target.closest("[data-apply]")) return applyNow(player);
  });
}

export function isOpen() {
  return !!open;
}

// A vat used: the picker for this client's own player, or, for a guest's player on the host, the word to that guest
// (host.js tells it, and its picker opens on its replica through the `opened` hook).
export function openFor(prop, player) {
  if (player !== getPlayer() || !root) {
    emit("dyeOpened", { prop, player });
    return true;
  }
  return openPanel(prop, player);
}

export function openPanel(prop, player) {
  if (!root || !prop) return false;
  open = { propId: prop.id, uid: null, picks: [] };
  const first = dye.dyeables(player)[0];
  if (first) choose(player, first.entry.uid);
  root.hidden = false;
  lastHtml = "";
  render(player);
  return true;
}

// Returns true if it was open.
export function close() {
  if (!open) return false;
  open = null;
  root.hidden = true;
  stopPreview();
  return true;
}

// A garment chosen: its swatches start at what it is dyed now.
function choose(player, uid) {
  const item = player && dye.dyeables(player).find((d) => String(d.entry.uid) === String(uid));
  if (!item) return;
  open.uid = item.entry.uid;
  open.picks = dye.currentColours(item.entry);
  lastHtml = "";
}

function applyNow(player) {
  const colours = open.picks.slice();
  if (sender) { sender({ propId: open.propId, uid: open.uid, colours }); return; }
  const r = verbs.run("dye", world, player, { prop: open.propId }, { uid: open.uid, colours });
  showMessage(r.ok ? "Dyed." : r.reason);
  lastHtml = "";
}

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
const same = (a, b) => a.length === b.length && a.every((c, i) => c === b[i]);
const swatch = (attrs, style, on, title) => `<button class="swatch${on ? " on" : ""}" ${attrs} style="${style}" title="${esc(title)}"></button>`;
const split = (hexes) => (hexes.length > 1 ? `--swatch:linear-gradient(135deg, ${hexes[0]} 0 55%, ${hexes[1]} 55% 100%)` : `--swatch:${hexes[0]}`);
const nameOf = (hex, own) => dye.regionWord(hex, own); // a dye's name (an own brass buckle's too), else Undyed for its own colour

function render(player) {
  if (!open || !player) return;
  const list = dye.dyeables(player);
  const item = list.find((d) => d.entry.uid === open.uid);
  if (!item && list.length) choose(player, list[0].entry.uid);
  const chosen = list.find((d) => d.entry.uid === open.uid) || null;
  const garments = list.length
    ? list.map((d) => `<button class="kit-button dy-garment${d === chosen ? " on" : ""}" data-uid="${esc(d.entry.uid)}">${esc(getItem(d.entry.id).name)}${d.slot ? " (worn)" : ""}</button>`).join("")
    : `<span class="dy-note">Nothing you carry can be dyed.</span>`;
  let body = "";
  if (chosen) {
    const def = getItem(chosen.entry.id);
    const d = dye.dyeOf(def);
    const picks = open.picks;
    if (d.schemes) {
      const own = swatch(`data-scheme="${d.own.join(",")}"`, split(d.own), same(picks, d.own), "Undyed");
      const rest = d.schemes.map((s) => { const hexes = s.map((c) => c.hex); return swatch(`data-scheme="${hexes.join(",")}"`, split(hexes), same(picks, hexes), s.map((c) => c.name).join(" and ")); }).join("");
      body += `<div class="dy-row"><span class="dy-label">Scheme</span><span class="dy-swatches">${own}${rest}</span></div>`;
    } else {
      d.regions.forEach((r, i) => {
        const own = swatch(`data-region="${i}" data-hex="${d.own[i]}"`, `--swatch:${d.own[i]}`, picks[i] === d.own[i], "Undyed");
        const rest = r.choices.filter((c) => c.hex !== d.own[i]).map((c) => swatch(`data-region="${i}" data-hex="${c.hex}"`, `--swatch:${c.hex}`, picks[i] === c.hex, c.name)).join("");
        body += `<div class="dy-row"><span class="dy-label">${esc(r.name)}</span><span class="dy-swatches">${own}${rest}</span></div>`;
      });
    }
    const words = same(picks, d.own) ? picks.map(() => "Undyed") : picks.map((c, i) => nameOf(c, d.own[i])); // its own colours whole read Undyed, as its card names none
    const cost = dye.costOf(def, picks);
    const now = dye.currentColours(chosen.entry);
    const can = dye.applyProblem(player, map.propById(open.propId), open.uid, picks);
    const why = same(picks, now) ? "" : can === true ? "" : can;
    body += `<div class="dy-row"><span class="dy-label">Colour</span><span class="dy-picked">${esc(d.regions.length > 1 ? d.regions.map((r, i) => `${r.name} ${words[i].toLowerCase()}`).join(", ") : words[0])}</span></div>`;
    body += `<div class="dy-apply"><span class="dy-note">${esc(why || (cost.length ? `Takes ${cost.map((w) => `${w.count} ${getItem(w.id).name.toLowerCase()}`).join(", ")}.` : "Costs nothing."))}</span><button class="kit-button" data-apply ${can === true && !same(picks, now) ? "" : "disabled"}>Apply</button></div>`;
  }
  const html = `<div class="dy-row"><span class="dy-label">Garment</span><span class="dy-garments">${garments}</span></div>${body}`;
  if (html !== lastHtml) {
    rowsEl.innerHTML = html;
    lastHtml = html;
  }
  drawPreview(player, chosen);
}

// The figure in its clothes, the chosen garment on in the picked colours, turning through the eight facings.
function drawPreview(player, chosen) {
  if (!bake || !canvas) return;
  const worn = { ...(player.worn || {}) };
  if (chosen) {
    const def = getItem(chosen.entry.id);
    if (def.wear) worn[def.wear] = { id: chosen.entry.id, count: 1, uid: chosen.entry.uid, colours: open.picks.slice() };
  }
  const key = JSON.stringify([player.look, Object.entries(worn).map(([s, e]) => [s, e ? [e.id, e.colours || e.colour || null] : null])]);
  if (key !== preview.key) {
    preview.key = key;
    try { preview.sheet = bake(worn); } catch (err) { preview.sheet = null; console.warn("The dye preview could not bake:", err.message); }
    paint();
  }
  if (!preview.timer) preview.timer = setInterval(() => { preview.facing++; paint(); }, 650); // the view's turning, as the creation screen's: not the world's clock
}

function paint() {
  const sheet = preview.sheet;
  const ctx = canvas.getContext("2d");
  ctx.imageSmoothingEnabled = false;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  if (!sheet) return;
  const facings = sheet.facings && sheet.facings.length ? sheet.facings : ["s"];
  const f = sheet.frames[`idle_${facings[preview.facing % facings.length]}_0`] || Object.values(sheet.frames)[0];
  if (!f) return;
  const s = 3;
  ctx.drawImage(sheet.image, f[0], f[1], f[2], f[3], Math.round((canvas.width - f[2] * s) / 2), canvas.height - f[3] * s, f[2] * s, f[3] * s);
}

function stopPreview() {
  if (preview.timer) clearInterval(preview.timer);
  preview = { key: "", sheet: null, facing: 0, timer: null };
}

// Each step: redraw what changed, close when the player has walked away or the vat is gone.
export function update(player) {
  if (!open || !player) return;
  const prop = map.propById(open.propId);
  if (!prop) return close();
  if (!canReach(player, prop.tiles, REACH + 1, prop.layer || 0)) return close(); // walked away, or a wall between (#208), as a station's panel
  render(player);
}

// What the picker shows now, for the instruments (tools/checks/dye.js): the chosen uid, the picks, the garments' uids, the rows' labels.
export function state() {
  if (!open) return null;
  return { propId: open.propId, uid: open.uid, picks: open.picks.slice(), garments: [...rowsEl.querySelectorAll("[data-uid]")].map((b) => b.dataset.uid), labels: [...rowsEl.querySelectorAll(".dy-label")].map((s) => s.textContent), applyDisabled: !!(rowsEl.querySelector("[data-apply]") || {}).disabled };
}
