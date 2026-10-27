// Copied from cozy-zombie-game src/ui/inventory-panel.js on 2026-10-10 and
// grown for docs/11: besides the grids (your bag and an open container) it
// draws the doll with its worn slots and the hands, and the belt as a hotbar
// strip, and drags between all of them. Grid rules live in grid.js; moves
// that involve a slot go through the handlers, which know the player.
// The bag (Tab) and the character screen (C) are two panels that open and
// close on their own; closing one never closes the other (Michael, 2026-10-12,
// docs/23 step 4). Both are 38 px a cell (view.panelCell); a character slot is
// one cell in a cutout and shows the item's portrait.

import { getItem, canMerge } from "../items.js";
import * as grid from "../grid.js";
import * as menu from "./context-menu.js";
import * as view from "../view.js";
import * as settings from "../settings.js";
import * as use from "../use.js";
import * as hoverCard from "./hover-card.js"; // the card over an item (#262)
import { cardFor, cardForSlot, cardForBeltSlot, cardForLockedSlot } from "../item-info.js";
import { beltIconURL, roleIconKey } from "./belt-icons.js"; // the faint hand or pouch on an empty belt slot (2026-10-25)
import { holdsWater, isTainted } from "../water.js"; // the brown drop on a tainted skin or bucket (docs/44)
import { parseSlot, HIDEABLE, beltRole, beltPositions, BELT_ROLES } from "../inventory.js";
import { handLabel, handSideOf } from "../handed.js"; // the hand slots named by side, "Main hand (right)" (Michael, 2026-10-25)
import * as dyedArt from "./dyed-art.js"; // a dyed item's drawn icon and portrait in its colours (Michael, 2026-10-26)

let CELL = view.BASE_CELL; // the bag's cell in UI pixels, read from the view at every render
const HOT_CELL = view.BASE_CELL; // the belt is HUD and keeps the base size
const ICON_PX = 19; // a bag icon's pixels per cell (docs/26)
const PORTRAIT_PX = 38; // a portrait's pixels per character slot (docs/26)
const DRAG_THRESHOLD = 4; // screen pixels before a press becomes a drag
// The doll, Michael's drawing of 2026-10-10: the belt top-left, the bag
// top-right, the body down the middle, a hand either side, gloves under the
// main hand. The bottom corners stay free for later. The spacer columns are
// half a slot wide.
const DOLL_AREAS = [
  "waist . head . back",
  ". . chest . .",
  "main . legs . off",
  "gloves . feet . .",
];
const SLOT_NAMES = { head: "Head", chest: "Chest", hands: "Gloves", legs: "Legs", feet: "Feet", waist: "Belt", back: "Bag" };

let root = null;
let body = null; // the bag and the hint
let containerEl = null; // an open chest or corpse, its own panel (Michael, 2026-10-12: it moves apart from the bag)
let dollEl = null;
let containerClosed = false; // the container's X was pressed; main.js takes it
let order = ["container", "character", "bag"]; // back to front
let hotbar = null;
let open = false; // the bag
let character = false; // the character screen
let handlers = {};
let lastSignature = "";
let bags = { inv: null, container: null };
let shown = { player: null }; // who the doll is drawn for
let drag = null;
let move = null; // a panel being dragged by its header: { which, wrap, dx, dy }

export function initInventoryPanel(h) {
  handlers = h;
  root = document.getElementById("inventory");
  root.hidden = true;
  // The bag and any open container live in .inv-body, top-right; the doll
  // lives in .doll-wrap, dead centre, so opening one never moves the other
  // (Michael, 2026-10-10 night).
  root.innerHTML = `<div class="inv-body"></div><div class="container-wrap" hidden></div><div class="doll-wrap" hidden></div>`;
  body = root.querySelector(".inv-body");
  containerEl = root.querySelector(".container-wrap");
  dollEl = root.querySelector(".doll-wrap");
  hotbar = document.createElement("div");
  hotbar.id = "hotbar";
  hotbar.hidden = true;
  document.getElementById("ui").appendChild(hotbar);

  root.addEventListener("pointerdown", (e) => {
    const wrap = e.target.closest(".inv-body, .doll-wrap, .container-wrap");
    if (wrap) focus(whichOf(wrap));
  }, true);
  for (const el of [root, hotbar]) {
    el.addEventListener("pointerdown", onPointerDown);
    el.addEventListener("dblclick", (e) => {
      if (e.target.closest("[data-eye]")) return; // two quick clicks on the eye are two toggles, not a take-off
      const hit = entryFromEvent(e);
      if (!hit) return;
      // Double-click uses the thing (Michael, 2026-10-10 night): equip or wear
      // from your bag, draw from the belt, unequip from a hand, take off a
      // worn slot. Anything else, or from a container, goes across.
      const used = hit.slot ? handlers.useSlot?.(hit.slot) : hit.bag === bags.inv && handlers.use?.(hit.entry, hit.bag);
      if (used) {
        handlers.changed?.();
        lastSignature = "";
        hotbar.dataset.sig = "";
        return;
      }
      if (hit.bag) quickMove(hit);
    });
    // The hover card: over an item, its card; over an empty slot, the slot's name; over anything else, none (#262).
    el.addEventListener("pointermove", onCardMove);
    el.addEventListener("pointerleave", () => { cardPointer = null; hoverCard.hide(); });
    el.addEventListener("contextmenu", (e) => {
      e.preventDefault();
      hoverCard.hide();
      if (drag?.started || e.target.closest("[data-eye]")) return;
      const hit = entryFromEvent(e);
      if (hit) openItemMenu(hit, e);
    });
  }
  root.addEventListener("click", (e) => {
    const close = e.target.closest("button[data-close]");
    if (close) {
      // The X on a header (Michael, 2026-10-12); the key still works.
      if (close.dataset.close === "bag") setBagOpen(false);
      else if (close.dataset.close === "container") containerClosed = true;
      else setCharacterOpen(false);
      return;
    }
    if (e.target.closest("button[data-takeall]")) {
      if (bags.container) handlers.takeAll?.(bags.container);
      handlers.changed?.();
      lastSignature = "";
      return;
    }
    const eye = e.target.closest("button[data-eye]");
    if (eye) {
      handlers.toggleHidden?.(eye.dataset.eye);
      handlers.changed?.();
      lastSignature = "";
      return;
    }
    const btn = e.target.closest("button[data-tidy]");
    if (!btn) return;
    const bag = bags[btn.dataset.tidy];
    if (bag) (handlers.tidy ? handlers.tidy(bag) : grid.tidy(bag));
    handlers.changed?.();
    lastSignature = "";
  });
  window.addEventListener("pointermove", onPointerMove);
  window.addEventListener("pointerup", onPointerUp);
  view.onResize(() => applyPositions());
  window.addEventListener("keydown", (e) => {
    if (drag?.started && e.code === "KeyR") rotateDrag();
  });
  // While dragging, right-click and the wheel rotate.
  window.addEventListener("pointerdown", (e) => {
    if (drag?.started && e.button === 2) rotateDrag();
  }, true);
  window.addEventListener("wheel", () => {
    if (drag?.started) rotateDrag();
  }, { passive: true });
}

// Either panel is up.
export function isOpen() {
  return open || character;
}

export function isBagOpen() {
  return open;
}

// An item is being dragged (the wheel turns it, so the world's zoom waits).
export function isDragging() {
  return !!drag;
}

export function isCharacter() {
  return character;
}

function refreshVisibility() {
  root.hidden = !(open || character);
  root.classList.toggle("character", character);
  root.classList.toggle("bag", open);
  lastSignature = "";
  if (!open && !character) cancelDrag();
}

// Where panels overlap, the one last opened or touched is on top (Michael, 2026-10-12).
function focus(which) {
  if (!body) return;
  order = [...order.filter((w) => w !== which), which];
  order.forEach((w, i) => { wrapOf(w).style.zIndex = String(i + 1); });
}

function whichOf(wrap) {
  return wrap === body ? "bag" : wrap === containerEl ? "container" : "character";
}

// True once after the container's X was pressed (main.js drops the open container).
export function takeContainerClose() {
  const v = containerClosed;
  containerClosed = false;
  return v;
}

export function setBagOpen(v) {
  open = !!v;
  if (open) focus("bag");
  refreshVisibility();
}

export function setCharacterOpen(v) {
  character = !!v;
  if (character) focus("character");
  refreshVisibility();
}

export function toggleBag() {
  setBagOpen(!open);
}

export function toggleCharacter() {
  setCharacterOpen(!character);
}

export function closeAll() {
  open = false;
  character = false;
  refreshVisibility();
}

function capitalize(s) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// ---- rendering ----

// A picture for a slot (docs/26): the item's portrait, a square drawn for the
// character screen; failing that its bag icon if that is square; else none,
// and the slot shows the coloured block with the label as the bag does.
function portraitOf(def, entry = null) {
  if (entry && entry.lit && def.portrait_lit) return def.portrait_lit; // a lit torch shows its flame (#331)
  if (def.portrait) return def.portrait;
  if (def.icon && def.icon.size[0] === def.icon.size[1]) return def.icon;
  return null;
}

// The bag's picture: a lit torch's has its flame drawn on (`icon_lit`, #331), the torch on the same pixels.
function iconOf(def, entry) {
  return entry && entry.lit && def.icon_lit ? def.icon_lit : def.icon;
}

// The block's colour where an item has no drawn icon: a dyed entry's first colour (docs/43 section 8), else the item's own.
const tintOf = (entry, def) => (entry && Array.isArray(entry.colours) && entry.colours[0]) || (entry && entry.colour) || def.color || "#8a8296";

// An item as a block: in a bag (`w` by `h` cells of `cell` pixels) or, with
// `slot` set, in a slot `cell` pixels square showing its portrait.
function blockHtml(entry, attrs, cell = CELL, w = 1, h = 1, extraCls = "", slot = false) {
  const def = getItem(entry.id);
  const cls = ["inv-item", extraCls];
  if (h > w) cls.push("tall");
  if (entry.count > 1) cls.push("stacked");
  if (use.isSelected(entry)) cls.push("selected"); // the thing being used (use.js)
  let inner = "";
  if (entry.fill != null) {
    const cap = (def.vessel && def.vessel.capacity) || 100; // a waterskin and the like fill to 100; a vessel says its own
    const pct = Math.max(0, Math.min(100, (entry.fill / cap) * 100));
    inner += `<div class="inv-level" style="${h >= w ? `height:${pct}%;width:100%` : `width:${pct}%;height:100%`}"></div>`;
  }
  const pic = slot ? portraitOf(def, entry) : iconOf(def, entry);
  if (pic) {
    // An item with drawn art shows the picture, upright, centred in its footprint, enlarged by a whole
    // number (nearest-pixel), and keeps the slot dark behind it; the same art as in the hand (docs/24).
    const [iw, ih] = pic.size;
    const rot = !slot && !!entry.rot && w !== h;
    const fw = rot ? ih : iw;
    const fh = rot ? iw : ih;
    const s = Math.max(1, Math.floor(Math.min((w * cell) / fw, (h * cell) / fh)));
    cls.push("has-icon");
    inner += `<img class="inv-icon" src="${dyedArt.dyedSrc(def, entry, pic)}" alt="" draggable="false" style="width:${iw * s}px;height:${ih * s}px${rot ? ";transform:rotate(90deg)" : ""}">`;
  } else {
    inner += `<span class="inv-label">${def.short || def.name}</span>`;
  }
  if (entry.count > 1) inner += `<span class="inv-stack">${entry.count}</span>`;
  // Tainted water (docs/44 section 3): a small brown drop in the corner of a skin or a bucket that holds it, so it reads at a glance; the name stays.
  if (holdsWater(entry) && isTainted(entry)) inner += `<span class="inv-taint" aria-hidden="true"></span>`;
  // Durability (docs/30, 5.2): a thin bar once worn, red under a fifth left.
  if (entry.wear > 0) inner += `<div class="inv-wear${entry.wear > 0.8 ? " low" : ""}"><div style="width:${Math.round((1 - entry.wear) * 100)}%"></div></div>`;
  return `<div class="${cls.join(" ")}" ${attrs} role="img" aria-label="${def.name}" style="width:${w * cell}px;height:${h * cell}px;--item:${tintOf(entry, def)}">${inner}</div>`;
}

function itemHtml(entry, index, which) {
  const [w, h] = grid.sizeOf(entry);
  const html = blockHtml(entry, `data-bag="${which}" data-index="${index}"`, CELL, w, h);
  return html.replace('style="', `style="left:${entry.x * CELL}px;top:${entry.y * CELL}px;position:absolute;`);
}

// A panel's header: the title on a flat plate, its buttons on the right, the X
// that closes the panel (Michael, 2026-10-12); dragging it moves the panel.
function headerHtml(title, buttons = "", close = null) {
  const x = close ? `<button class="kit-button inv-close" data-close="${close}" title="Close">×</button>` : "";
  return `<div class="inv-header kit-header"><span class="inv-title">${title}</span><span class="inv-tools">${buttons}${x}</span></div>`;
}

function columnHtml(which, bag, title) {
  const items = bag.items.map((e, i) => itemHtml(e, i, which)).join("");
  return `
    <div class="inv-column kit-frame">
      ${headerHtml(title, `${which === "container" ? `<button class="kit-button" data-takeall title="Take everything that fits into your bag">Take All</button>` : ""}<button class="kit-button" data-tidy="${which}" title="Repack">Tidy</button>`, which === "inv" ? "bag" : "container")}
      <div class="inv-grid" data-bag="${which}" style="width:${bag.cols * CELL}px;height:${bag.rows * CELL}px;--cell:${CELL}px">${items}<div class="inv-hl" hidden></div></div>
    </div>`;
}

// A character slot is one cell square inside its cutout edge (Michael,
// 2026-10-12: Minecraft's size or a hair bigger; two cells was far too big).
let hiddenNow = []; // the character's hidden slots, set each render
function slotHtml(id, entry, label, extra = "") {
  const px = CELL;
  const inner = entry ? blockHtml(entry, `data-slot="${id}"`, px, 1, 1, "in-slot", true) : `<span class="slot-label">${label}</span>`;
  const box = `calc(${px}px + 2 * var(--kit-well-w, 5px))`; // the content plus the well's border
  // A worn slot whose item is drawn on the figure has an eye: click to hide its art (the item keeps every use) or show it (#159).
  const key = id.startsWith("worn:") ? id.slice(5) : null;
  const eye = entry && key && HIDEABLE.includes(key) ? `<button class="slot-eye${hiddenNow.includes(key) ? " off" : ""}" data-eye="${key}" title="${hiddenNow.includes(key) ? "Show on your figure" : "Hide on your figure"}"></button>` : "";
  return `<div class="doll-slot kit-well${extra}${entry ? "" : " empty"}" data-slot="${id}" data-label="${label}" aria-label="${label}" style="width:${box};height:${box}">${inner}${eye}</div>`;
}

function dollHtml(player) {
  hiddenNow = player.hidden || [];
  const area = (name, html) => html.replace('class="doll-slot', `style="grid-area:${name}" class="doll-slot`);
  // The doll's left column is the character's right hand and its right column the left (the grid's areas `main` and `off`
  // are named for a right-handed character): a left-handed character's main hand stands on the right (Michael, 2026-10-25).
  const hand = (key, label) => area(handSideOf(player, key) === "right" ? "main" : "off", slotHtml(`hand:${key}`, player.hands[key], label, " doll-hand"));
  const worn = (k) => area(k === "hands" ? "gloves" : k, slotHtml(`worn:${k}`, player.worn[k], SLOT_NAMES[k]));
  const slot = `calc(${CELL}px + 2 * var(--kit-well-w, 5px))`; // a slot's box, the well's border included
  const cols = `${slot} ${CELL / 2}px ${slot} ${CELL / 2}px ${slot}`;
  return `
    <div class="inv-column kit-frame doll">
      ${headerHtml("You", "", "character")}
      <div class="doll-grid" style="grid-template-columns:${cols};grid-auto-rows:${slot};grid-template-areas:${DOLL_AREAS.map((r) => `'${r}'`).join(" ")}">
        ${["waist", "head", "back", "chest", "legs", "feet", "hands"].map(worn).join("")}
        ${hand("main", handLabel(player, "main"))}${hand("off", handLabel(player, "off"))}
      </div>
    </div>`;
}

// The belt's places in this client's key order (the setting "Belt slot order", inventory.beltPositions): each place its number key and its
// slot's role, an empty one stamped with its role's faint icon (the hand the character favours on a main-hand slot, the other on an off-hand
// slot, a pouch on the utility slot; ui/belt-icons.js), and a place the worn belt does not have drawn locked (Michael, 2026-10-25).
const ROLE_LABEL = { main: "main hand", off: "off hand", utility: "utility" };
function hotbarHtml(belt, player) {
  const handed = (player && player.handed) || "right";
  return beltPositions(settings.get("beltOrder"), belt.length).map(({ key, index }, k) => {
    if (index == null) {
      const role = BELT_ROLES[[0, 3, 1, 4, 2][k]] || "main"; // the slot a leather belt would put here (the grouped order's place k)
      return `<div class="hot-slot locked" data-locked-role="${role}" data-key="${key}" aria-label="Locked belt slot, key ${key}"><span class="hot-key">${key}</span></div>`;
    }
    const e = belt[index];
    const role = beltRole(index);
    const label = `Belt slot ${key} (${ROLE_LABEL[role]})`;
    const icon = e ? "" : `<img class="hot-role" src="${beltIconURL(roleIconKey(role, handed))}" alt="" draggable="false" data-role-icon="${roleIconKey(role, handed)}">`;
    return `<div class="hot-slot${e ? "" : " empty"}" data-slot="belt:${index}" data-role="${role}" data-key="${key}" data-label="${label}" aria-label="${label}"><span class="hot-key">${key}</span>${icon}${e ? blockHtml(e, `data-slot="belt:${index}"`, HOT_CELL, 1, 1, "in-slot", true) : ""}</div>`;
  }).join("");
}

// What a redraw compares: wear as itemHtml draws it (a bar from the first wear, its percent left, red past 0.8), and fill
// to a whole unit. A lit torch wears every step, and compared exactly it redrew the panels every frame, replacing a
// button between its press and release so the click never landed (the bag's X, with a lit torch in hand).
const shownAs = (k, v) => typeof v !== "number" ? v : k === "wear" ? (v > 0 ? `${Math.round((1 - v) * 100)}${v > 0.8 ? "low" : ""}` : 0) : k === "fill" ? Math.round(v) : v;

// Re-render if anything changed. `inv` is the bag on the back or null;
// `container` is any open bag or null.
export function renderInventoryPanel(player, inv, container, belt) {
  bags = { inv: inv || null, container: container || null };
  shown.player = player;
  // The hotbar is always shown while a belt is worn.
  const beltSig = JSON.stringify([belt, settings.get("beltOrder"), player && player.handed, dyedArt.version()], shownAs); // a dyed picture made since redraws
  if (!belt) hotbar.hidden = true;
  else {
    hotbar.hidden = false;
    if (hotbar.dataset.sig !== beltSig) {
      hotbar.innerHTML = hotbarHtml(belt, player);
      hotbar.dataset.sig = beltSig;
      refreshCard();
    }
  }
  if (!open && !character) return;
  if (drag && drag.from.kind === "bag" && drag.from.bag !== inv && drag.from.bag !== container) cancelDrag();
  CELL = view.panelCell();
  const sig = JSON.stringify([open, character, CELL, use.isActive() && use.current_()?.entry, inv?.items, inv?.cols, inv?.rows, container?.container, container?.items, container?.cols, container?.rows, player.worn, player.hands, player.hidden, player.handed, dyedArt.version()], shownAs);
  if (sig === lastSignature) return;
  const hadContainer = lastSignature !== "" && /"container"/.test(lastSignature);
  lastSignature = sig;
  // The bag sits in the top-right corner; an opened container to its left, its
  // own panel; the doll at the left edge, centred vertically. None moves when
  // another opens (Michael, 2026-10-10 night).
  dollEl.hidden = !character;
  dollEl.innerHTML = character ? dollHtml(player) : "";
  body.hidden = !open;
  body.innerHTML = !open ? "" :
    (inv ? columnHtml("inv", inv, capitalize(inv.container)) : `<div class="inv-column kit-frame inv-nobag">${headerHtml("Bag", "", "bag")}No bag on your back.</div>`) +
    `<div class="inv-hint">Drag to move · R rotates · Shift-click sends across · Right-click for actions</div>`;
  const showContainer = open && !!container;
  containerEl.hidden = !showContainer;
  containerEl.innerHTML = showContainer ? columnHtml("container", container, capitalize(container.container)) : "";
  if (showContainer && !hadContainer) focus("container"); // a chest just opened comes to the front
  applyPositions();
  refreshCard();
}

// ---- where the panels sit ----
// Each panel has a home (the bag top-right, the character screen left of
// centre) and, once dragged by its header, a remembered place in UI pixels
// (settings.panelPos), kept inside the window (Michael, 2026-10-12).

function wrapOf(which) {
  return which === "bag" ? body : which === "container" ? containerEl : dollEl;
}

function place(wrap, x, y) {
  const w = wrap.offsetWidth;
  const h = wrap.offsetHeight;
  const px = Math.max(0, Math.min(view.view.uiW - w, Math.round(x)));
  const py = Math.max(0, Math.min(view.view.uiH - h, Math.round(y)));
  wrap.style.left = `${px}px`;
  wrap.style.top = `${py}px`;
  wrap.style.right = "auto";
  wrap.style.transform = "none";
  return { x: px, y: py };
}

function applyPositions() {
  const pos = settings.get("panelPos") || {};
  for (const which of ["bag", "character", "container"]) {
    const wrap = wrapOf(which);
    if (!wrap || wrap.hidden) continue;
    if (pos[which]) place(wrap, pos[which].x, pos[which].y);
    else if (which === "container" && !body.hidden) {
      // Home: to the left of the bag, as it was when the two were one panel.
      const r = body.getBoundingClientRect();
      const o = view.clientToUi(r.left, r.top);
      place(wrap, o.x - wrap.offsetWidth - 8, o.y);
    } else for (const k of ["left", "top", "right", "transform"]) wrap.style.removeProperty(k); // home, as the stylesheet puts it
  }
}

// ---- hit testing ----

function slotEntry(slotId) {
  const { kind, key } = parseSlot(slotId);
  const p = shown.player;
  if (!p) return null;
  if (kind === "worn") return p.worn[key] || null;
  if (kind === "hand") return p.hands[key] || null;
  if (kind === "belt") return handlers.belt?.()?.[Number(key)] || null;
  return null;
}

function entryFromEvent(e) {
  const el = e.target.closest(".inv-item");
  if (!el) return null;
  if (el.dataset.slot) {
    const entry = slotEntry(el.dataset.slot);
    return entry ? { entry, slot: el.dataset.slot, el } : null;
  }
  const bag = bags[el.dataset.bag];
  const entry = bag?.items[Number(el.dataset.index)];
  return entry ? { entry, bag, which: el.dataset.bag, el } : null;
}

// The card for what is under the pointer: `target` is the element there, (x, y) the pointer in client pixels. Called as the pointer moves, and again after the panels redraw
// (`refreshCard`), because a redraw replaces the elements under a pointer that did not move: the card must say what is there now, never what was.
let cardPointer = null; // the last pointer position over the panels, or null
function cardAt(target, x, y) {
  if (drag || use.isActive() || menu.isMenuOpen()) { hoverCard.hide(); return; }
  const hit = entryFromEvent({ target });
  if (hit) {
    const en = hit.entry;
    // On a belt slot the card leads with what its key does there, by the slot's role (2026-10-25).
    const slot = hit.slot ? parseSlot(hit.slot) : null;
    const role = slot && slot.kind === "belt" ? beltRole(slot.index) : null;
    hoverCard.show(`${en.uid ?? en.id}|${en.id}|${en.count}|${en.fill ?? ""}|${en.wear ?? ""}|${en.clean ? "clean" : ""}|${role || ""}`, () => cardFor(en, role ? { beltRole: role } : {}), x, y);
    return;
  }
  const locked = target.closest(".hot-slot.locked");
  if (locked) { hoverCard.show(`locked|${locked.dataset.key}`, () => cardForLockedSlot(locked.dataset.lockedRole, Number(locked.dataset.key)), x, y); return; }
  const slot = target.closest(".doll-slot.empty, .hot-slot.empty");
  if (slot && slot.dataset.role) hoverCard.show(`belt|${slot.dataset.slot}|${slot.dataset.key}`, () => cardForBeltSlot(slot.dataset.role, Number(slot.dataset.key)), x, y); // what the empty slot is for
  else if (slot && slot.dataset.label) hoverCard.show(`slot|${slot.dataset.slot}`, () => cardForSlot(slot.dataset.label), x, y);
  else hoverCard.hide();
}

function onCardMove(e) {
  cardPointer = { x: e.clientX, y: e.clientY };
  cardAt(e.target, e.clientX, e.clientY);
}

function refreshCard() {
  if (!cardPointer) return;
  const t = document.elementFromPoint(cardPointer.x, cardPointer.y);
  if (!t || !t.closest("#inventory, #hotbar")) { hoverCard.hide(); return; }
  cardAt(t, cardPointer.x, cardPointer.y);
}

// The entry and the bag a drag began on, found again by uid and column: on a guest the replica's
// objects are new with every frame (docs/31/04), so a drag that outlives one must not hold the old ones.
function refind(entry, which) {
  const bag = bags[which] || null;
  if (!bag) return null;
  const e = entry.uid != null ? bag.items.find((q) => q.uid === entry.uid) : bag.items.includes(entry) ? entry : null;
  return e ? { entry: e, bag } : null;
}

// How high an element's panel sits where panels overlap (focus sets the z-index); the belt is above all.
function zOf(el) {
  const wrap = el.closest(".inv-body, .doll-wrap, .container-wrap");
  return wrap ? Number(wrap.style.zIndex || 0) : 99;
}

// The panel under a screen point, the one on top where they overlap; null off every panel.
function panelAt(clientX, clientY) {
  let best = null;
  for (const wrap of [body, dollEl, containerEl]) {
    if (!wrap || wrap.hidden) continue;
    const el = wrap.querySelector(".inv-column") || wrap;
    const r = el.getBoundingClientRect();
    if (clientX < r.left || clientX >= r.right || clientY < r.top || clientY >= r.bottom) continue;
    if (!best || zOf(wrap) > zOf(best)) best = wrap;
  }
  return best;
}

// Which grid is under a screen point, and which cell: the one on top where panels overlap.
function gridAt(clientX, clientY) {
  let best = null;
  for (const el of root.querySelectorAll(".inv-grid")) {
    const r = el.getBoundingClientRect();
    if (clientX < r.left || clientX >= r.right || clientY < r.top || clientY >= r.bottom) continue;
    if (best && zOf(el) <= zOf(best.el)) continue;
    const bag = bags[el.dataset.bag];
    const cellPx = r.width / bag.cols;
    best = { el, bag, which: el.dataset.bag, cellPx, cx: Math.floor((clientX - r.left) / cellPx), cy: Math.floor((clientY - r.top) / cellPx) };
  }
  return best;
}

// Which slot is under a screen point: worn, a hand, or the belt; the one on top where panels overlap.
function slotAt(clientX, clientY) {
  let best = null;
  for (const el of [...root.querySelectorAll(".doll-slot"), ...hotbar.querySelectorAll(".hot-slot[data-slot]")]) { // a locked place is no slot
    const r = el.getBoundingClientRect();
    if (clientX < r.left || clientX >= r.right || clientY < r.top || clientY >= r.bottom) continue;
    if (best && zOf(el) <= zOf(best.el)) continue;
    best = { el, id: el.dataset.slot };
  }
  if (!best) return null;
  // A slot under another panel is not a target: the panel on top is (a grid there is found by gridAt).
  const over = panelAt(clientX, clientY);
  if (over && zOf(best.el) < zOf(over)) return null;
  return best;
}

function overPanel(clientX, clientY) {
  for (const el of [...root.querySelectorAll(".inv-column"), hotbar]) {
    const r = el.getBoundingClientRect();
    if (clientX >= r.left && clientX < r.right && clientY >= r.top && clientY < r.bottom) return true;
  }
  return false;
}

// ---- drag and drop ----

function onPointerDown(e) {
  if (e.button !== 0 || drag || move || e.target.closest("[data-eye]")) return; // the eye on a worn slot is a button, not the item under it
  // A press on a header (not on its buttons) picks the panel up.
  const head = e.target.closest(".inv-header");
  if (head && !e.target.closest("button")) {
    const wrap = head.closest(".inv-body, .doll-wrap, .container-wrap");
    if (!wrap) return;
    const u = view.clientToUi(e.clientX, e.clientY);
    const r = wrap.getBoundingClientRect();
    const o = view.clientToUi(r.left, r.top);
    move = { which: whichOf(wrap), wrap, dx: u.x - o.x, dy: u.y - o.y };
    e.preventDefault();
    return;
  }
  const hit = entryFromEvent(e);
  if (!hit) return;
  e.preventDefault();
  // In Use mode a click on an item is the target (use.js), never a drag.
  if (use.isActive()) {
    use.apply({ kind: "item", entry: hit.entry, bag: hit.bag, slot: hit.slot }, shown.player); // a slot hit has no bag: its id is the address (hands, belt, worn)
    lastSignature = "";
    hotbar.dataset.sig = "";
    return;
  }
  const r = hit.el.getBoundingClientRect();
  const [w] = hit.bag ? grid.sizeOf(hit.entry) : [1];
  const cellPx = r.width / w;
  drag = {
    entry: hit.entry,
    from: hit.bag ? { kind: "bag", bag: hit.bag, which: hit.which } : { kind: "slot", id: hit.slot },
    rot: hit.bag ? !!hit.entry.rot : false,
    grabX: hit.bag ? Math.floor((e.clientX - r.left) / cellPx) : 0,
    grabY: hit.bag ? Math.floor((e.clientY - r.top) / cellPx) : 0,
    cellPx: hit.bag ? cellPx : CELL * view.view.uiScale, // from a slot, the ghost is at the bag's scale
    startX: e.clientX,
    startY: e.clientY,
    lastX: e.clientX,
    lastY: e.clientY,
    shift: e.shiftKey,
    started: false,
    ghost: null,
    target: null,
  };
}

function startDrag() {
  drag.started = true;
  hoverCard.hide();
  menu.closeContextMenu();
  const def = getItem(drag.entry.id);
  const g = document.createElement("div");
  g.className = "inv-ghost";
  if (def.icon) {
    // An item with art is carried as the art alone, nothing behind it (Michael, 2026-10-12).
    g.classList.add("art");
    g.innerHTML = `<img src="${dyedArt.dyedSrc(def, drag.entry, iconOf(def, drag.entry))}" alt="" draggable="false">`;
  } else {
    g.style.setProperty("--item", tintOf(drag.entry, def));
    g.textContent = def.short || def.name;
  }
  document.body.appendChild(g);
  drag.ghost = g;
  root.classList.add("dragging");
}

function rotateDrag() {
  const [w, h] = grid.sizeOfId(drag.entry.id);
  if (w === h) return;
  drag.rot = !drag.rot;
  drag.grabX = 0;
  drag.grabY = 0;
  updateDrag(drag.lastX, drag.lastY);
}

function onPointerMove(e) {
  if (move) {
    const u = view.clientToUi(e.clientX, e.clientY);
    place(move.wrap, u.x - move.dx, u.y - move.dy);
    return;
  }
  if (!drag) return;
  drag.lastX = e.clientX;
  drag.lastY = e.clientY;
  if (!drag.started) {
    if (Math.hypot(e.clientX - drag.startX, e.clientY - drag.startY) < DRAG_THRESHOLD) return;
    startDrag();
  }
  // Carrying something over a panel brings it to the front, as a click would
  // (Michael, 2026-10-13): a slot under the container can be reached by
  // dragging onto the part of the character screen that shows.
  const over = panelAt(e.clientX, e.clientY);
  if (over && whichOf(over) !== order[order.length - 1]) focus(whichOf(over));
  updateDrag(e.clientX, e.clientY);
}

function clearHighlights() {
  for (const hl of root.querySelectorAll(".inv-hl")) hl.hidden = true;
  for (const el of [...root.querySelectorAll(".doll-slot"), ...hotbar.querySelectorAll(".hot-slot")]) el.classList.remove("ok", "bad");
}

function updateDrag(clientX, clientY) {
  const [w, h] = grid.sizeOfId(drag.entry.id, drag.rot);
  const g = drag.ghost;
  const bw = w * drag.cellPx;
  const bh = h * drag.cellPx;
  g.style.width = `${bw}px`;
  g.style.height = `${bh}px`;
  g.style.left = `${clientX - (drag.grabX + 0.5) * drag.cellPx}px`;
  g.style.top = `${clientY - (drag.grabY + 0.5) * drag.cellPx}px`;
  g.style.fontSize = `${Math.round(drag.cellPx * 0.32)}px`;
  g.style.fontFamily = "var(--font-small)"; // a dragged piece's short name: small text (ui/small-text.js)
  const img = g.querySelector("img");
  if (img) {
    // The art fills the footprint, turned with it.
    img.style.width = `${drag.rot ? bh : bw}px`;
    img.style.height = `${drag.rot ? bw : bh}px`;
    img.style.transform = drag.rot ? "rotate(90deg)" : "none";
  }

  clearHighlights();
  drag.target = null;
  const slot = slotAt(clientX, clientY);
  if (slot) {
    const ok = !!handlers.canPlace?.(drag.entry, slot.id);
    drag.target = { slot: slot.id, ok };
    slot.el.classList.add(ok ? "ok" : "bad");
    return;
  }
  const at = gridAt(clientX, clientY);
  if (!at) return;
  const x = at.cx - drag.grabX;
  const y = at.cy - drag.grabY;
  const def = getItem(drag.entry.id);
  const under = grid.entryAt(at.bag, at.cx, at.cy);
  const merges = !!(def.stack && !at.bag.takeOnly && canMerge(under, drag.entry) && under.count < def.stack); // a stack with its own state never merges (Michael's playtest, 2026-10-26)
  const nested = !(handlers.canStore?.(drag.entry) ?? true); // the container rule: only empty containers go in
  const ok = !nested && (merges || grid.fits(at.bag, drag.entry.id, x, y, drag.rot, drag.entry));
  drag.target = { bag: at.bag, which: at.which, x: merges ? at.cx : x, y: merges ? at.cy : y, ok };
  const hl = at.el.querySelector(".inv-hl");
  const hx = Math.max(0, x);
  const hy = Math.max(0, y);
  const hw = Math.min(at.bag.cols, x + w) - hx;
  const hh = Math.min(at.bag.rows, y + h) - hy;
  if (!hl || hw <= 0 || hh <= 0) return;
  hl.hidden = false;
  hl.className = `inv-hl ${ok ? "ok" : "bad"}`;
  hl.style.left = `${hx * CELL}px`;
  hl.style.top = `${hy * CELL}px`;
  hl.style.width = `${hw * CELL}px`;
  hl.style.height = `${hh * CELL}px`;
}

function onPointerUp(e) {
  if (move && e.button === 0) {
    // Put down: remember where, clamped, for next time.
    const r = move.wrap.getBoundingClientRect();
    const o = view.clientToUi(r.left, r.top);
    const at = place(move.wrap, o.x, o.y);
    settings.set("panelPos", { ...(settings.get("panelPos") || {}), [move.which]: at });
    move = null;
    return;
  }
  if (!drag || e.button !== 0) return;
  const d = drag;
  // The entry and the bags as they are now, not as they were on the press (refind).
  if (d.from.kind === "bag") {
    const r = refind(d.entry, d.from.which);
    if (!r) return cancelDrag();
    d.entry = r.entry;
    d.from.bag = r.bag;
  } else if (slotEntry(d.from.id) !== d.entry && slotEntry(d.from.id)?.uid !== d.entry.uid) return cancelDrag();
  else d.entry = slotEntry(d.from.id);
  if (d.target && d.target.which && !(d.target.bag = bags[d.target.which])) return cancelDrag();
  if (!d.started) {
    drag = null;
    if (d.shift && d.from.kind === "bag") quickMove({ entry: d.entry, bag: d.from.bag });
    return;
  }
  const t = d.target;
  if (t && t.ok) {
    if (t.slot) handlers.placeInSlot?.(d.entry, d.from, t.slot);
    else if (d.from.kind === "bag") (handlers.moveInGrid ? handlers.moveInGrid(d.entry, d.from.bag, t.bag, t.x, t.y, d.rot) : grid.moveEntry(d.from.bag, t.bag, d.entry, t.x, t.y, d.rot));
    else handlers.placeInGrid?.(d.entry, d.from, t.bag, t.x, t.y, d.rot);
    handlers.changed?.();
  } else if (t && t.slot) {
    handlers.slotRefused?.(d.entry, t.slot); // the red slot's reason, when it has one (a two-handed thing on an off-hand slot, 2026-10-25)
  } else if (!t && !overPanel(e.clientX, e.clientY)) {
    handlers.dropToFloor?.(d.entry, d.from);
  }
  cancelDrag();
}

function cancelDrag() {
  if (!drag) return;
  drag.ghost?.remove();
  drag = null;
  root.classList.remove("dragging");
  if (root) clearHighlights();
  lastSignature = "";
  hotbar.dataset.sig = "";
}

// ---- shortcuts and menus ----

function otherBag(bag) {
  if (!bags.container || !bags.inv) return null;
  return bag === bags.inv ? bags.container : bags.inv;
}

function quickMove({ entry, bag }) {
  const to = otherBag(bag);
  if (!to) return;
  if (!(handlers.canStore?.(entry) ?? true)) return handlers.noRoom?.(to === bags.inv);
  if (handlers.quickMove) handlers.quickMove(entry, bag, to);
  else if (!grid.transfer(bag, to, entry)) handlers.noRoom?.(to === bags.inv);
  handlers.changed?.();
  lastSignature = "";
}

function openItemMenu(hit, e) {
  const entries = hit.slot
    ? handlers.slotMenu?.(hit.slot) || []
    : handlers.itemMenu?.(hit.entry, hit.bag, otherBag(hit.bag)) || [];
  if (hit.bag) {
    const [w, h] = grid.sizeOfId(hit.entry.id);
    if (w !== h) {
      entries.push({
        label: "Rotate",
        enabled: grid.fits(hit.bag, hit.entry.id, hit.entry.x, hit.entry.y, !hit.entry.rot, hit.entry),
        onSelect: () => {
          if (handlers.rotate) handlers.rotate(hit.entry, hit.bag);
          else hit.entry.rot = !hit.entry.rot;
        },
      });
    }
  }
  if (!entries.length) return;
  const wrapped = entries.map((en) => ({
    ...en,
    onSelect: () => {
      en.onSelect();
      handlers.changed?.();
      lastSignature = "";
      hotbar.dataset.sig = "";
    },
  }));
  const u = view.clientToUi(e.clientX, e.clientY);
  menu.openContextMenu(u.x, u.y, wrapped);
}
