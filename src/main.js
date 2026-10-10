// Boot and the game state. A scrolling camera over a chunked map with real
// line of sight, buildings with doors and shuttered windows, forest scattered
// by rule, the player with a sack on their back, and the dead. Milestone 1
// (the probe) passed on 2026-10-09; lighting, the renderer, openings, the
// interface, and the character followed. See TODO.md and docs/00-vision.md.

import * as iso from "./iso.js";
import * as input from "./input.js";
import * as loop from "./loop.js";
import * as assets from "./assets.js";
import * as events from "./events.js";
import * as map from "./map.js";
import * as camera from "./camera.js";
import * as visibility from "./visibility.js";
import * as clock from "./clock.js";
import * as light from "./light.js";
import * as gl from "./gl.js";
import { renderScene, setCutaway, cutaway, night } from "./render.js";
import { createPlayer, updatePlayer, damagePlayer, autoWalk, eat, drink } from "./entities/player.js";
import { createZombie, updateZombie } from "./entities/zombie.js";
import { initHud, updateHud } from "./ui/hud.js";
import { initPrompt, updatePrompt, showMessage, updateMessage } from "./ui/prompt.js";
import * as menu from "./ui/context-menu.js";
import * as panel from "./ui/inventory-panel.js";
import * as interact from "./interact.js";
import * as items from "./items.js";
import * as inventory from "./inventory.js";
import * as grid from "./grid.js";
import * as view from "./view.js";
import * as settings from "./settings.js";
import * as screens from "./ui/screens.js";

const V = view.view; // the world's size in its own pixels, kept current by view.js
const MAP_FILE = "data/maps/square.json";
const ACTIVE_TILES = 40; // the dead beyond this many tiles from the player do not think
const CONTAINER_CLOSE_DIST = 2.0; // tiles: an open container closes when you walk away
const ZOOM_PACE = 0.3; // seconds between wheel steps that count
const BELT_LIGHT = 0.5; // a lit torch on the belt gives this much of its light (docs/02)
let lastZoomAt = 0;

const canvas = document.getElementById("game");
const ui = document.getElementById("ui");
const debugEl = document.getElementById("debug");
// The world is drawn in raw WebGL2 (docs/08). There is no other renderer: if
// WebGL2 is missing the debug corner says so and nothing is drawn.
let glError = null;
try {
  gl.init(canvas);
} catch (err) {
  glError = err.message;
}

let info = null;
let player = null;
let zombies = [];
let tiles = [];
let visible = new Set();
let playerRoom = 0;
let drawAll = false; // debug: V shows everything, fog off
let drawn = 0;
let visKey = null; // player tile and camera tile the visible set was computed for
let openBag = null; // { bag, tiles, name }: the container open beside yours
let progress = null; // 0..1 of a timed action
const timing = { step: 0, stepMax: 0, vis: 0, maxResetAt: 0 };

// Right-click builds a menu of what is under the cursor; Walk here is in it
// (docs/10). Left click is kept free for selecting and placing things later
// (Michael, 2026-10-10).
function handleMouse() {
  const m = input.getMouse();
  if (input.mouseRightPressed()) {
    const actions = interact.actionsAt(m.x, m.y, player);
    if (actions.length) {
      const u = view.toUi(m.x, m.y);
      menu.openContextMenu(u.x, u.y, actions.map((a) => ({ label: a.label, enabled: a.enabled, onSelect: () => interact.runAction(player, a) })));
    }
  }
  menu.tookClick();
  if (menu.isMenuOpen() && player.moving) menu.closeContextMenu();
}

// Escape closes the top thing that can close: the menu (which closes itself
// and says so), then a screen steps back, then the bag or the character
// screen; with nothing open it opens the pause menu (Michael, 2026-10-10, as
// Zomboid does). Handled on the key event, not in the step, because the step
// does not run while paused.
function setPaused(v) {
  loop.setPaused(v);
  if (!v) input.endStep(); // keys pressed while paused do not fire on resume
}

function handleEscape() {
  if (menu.tookEscape()) return;
  if (screens.back()) return;
  if (panel.isOpen()) {
    panel.setOpen(false);
    openBag = null;
    return;
  }
  screens.show("pause");
}

function applyDebugCorner() {
  debugEl.hidden = !settings.get("debugCorner");
}

function updateInventoryUi() {
  // Carrying furniture: both hands are full and nothing else happens until it
  // is down (docs/02). The bag closes if it was open.
  if (player.carrying) {
    if (panel.isOpen()) {
      panel.setOpen(false);
      openBag = null;
    }
    if (input.wasPressed("Tab") || input.wasPressed("KeyC")) showMessage("Your hands are full.");
    panel.renderInventoryPanel(player, inventory.bagOf(player), null, inventory.beltOf(player));
    return;
  }
  // Tab opens the bag; with none worn it opens the character screen instead,
  // with the message (docs/11, check 6). C opens the character screen.
  if (input.wasPressed("Tab") || input.wasPressed("KeyC")) {
    const noBag = !inventory.bagOf(player);
    panel.toggle({ character: input.wasPressed("KeyC") || noBag });
    if (!panel.isOpen()) openBag = null;
    else if (noBag) showMessage("No bag on your back.");
  }
  // Belt keys: a consumable on the slot is used; anything else swaps with
  // its hand (docs/11; the belt as utility slots, Michael 2026-10-10 late).
  for (let i = 0; i < 4; i++) {
    if (!input.wasPressed(`Digit${i + 1}`)) continue;
    const belt = inventory.beltOf(player);
    const e = belt && belt[i];
    const def = e && items.getItem(e.id);
    if (def && !def.hands && (def.kind === "food" || def.capacity)) {
      if (def.kind === "food") {
        eat(player, def);
        e.count -= 1;
        if (e.count <= 0) belt[i] = null;
      } else if ((e.fill ?? 0) > 0) drink(player, e);
      else showMessage("It is empty.");
      continue;
    }
    const r = inventory.beltKey(player, i);
    if (r === "nobelt") showMessage("No belt, or no such slot.");
    else if (r === "handsfull") showMessage("Your hands are full.");
  }
  if (openBag) {
    let d = Infinity;
    for (const [tx, ty] of openBag.tiles) d = Math.min(d, Math.hypot(player.gx - tx, player.gy - ty));
    if (d > CONTAINER_CLOSE_DIST) openBag = null;
  }
  panel.renderInventoryPanel(player, inventory.bagOf(player), openBag ? openBag.bag : null, inventory.beltOf(player));
}

// The fire of a lit item on the belt, if any.
function beltFire(belt) {
  if (!belt) return null;
  for (const e of belt) {
    const def = e && items.getItem(e.id);
    if (def && def.fire) return def.fire;
  }
  return null;
}

function update(dt) {
  const t0 = performance.now();
  if (input.wasPressed("KeyV")) drawAll = !drawAll;
  // The wheel zooms in integer steps, 1× to 3× (docs/02, 2026-10-10 night):
  // down zooms out. The panel's own wheel use (rotating a drag) wins.
  // Zoom snaps between three levels: Z cycles them, the wheel steps one way
  // or the other, one step per ZOOM_PACE seconds so a rough wheel's burst is
  // one step (Michael, 2026-10-10 late).
  if (input.wasPressed("KeyZ")) view.zoomStep(1, true);
  const wheel = input.takeWheel();
  if (wheel && !panel.isOpen()) {
    const now = performance.now();
    if (now - lastZoomAt >= ZOOM_PACE * 1000) {
      lastZoomAt = now;
      view.zoomStep(-Math.sign(wheel));
    }
  }
  if (input.wasPressed("KeyK")) setCutaway(cutaway === "stub" ? "translucent" : "stub");
  if (input.wasPressed("KeyL")) night.debug = (night.debug + 1) % 4;
  // Debug: ] and [ skip the clock an hour forward or back.
  if (input.wasPressed("BracketRight")) clock.setHour(clock.getHour() + 1);
  if (input.wasPressed("BracketLeft")) clock.setHour(clock.getHour() - 1);
  clock.update(dt);
  map.burnFires(dt);
  camera.follow(player, dt);
  camera.applyOrigin(V.w, V.h);
  // Grow the world three chunks ahead of the player, so wild forest and its
  // dead appear outside the view even at the widest zoom (docs/02, the view).
  map.ensureAround(player.gx, player.gy, 3);
  for (const [x, y] of map.takePendingSpawns()) zombies.push(createZombie(x, y));
  handleMouse();
  interact.updateInteract(player, dt);
  updatePlayer(player, dt);
  progress = interact.updateAction(player, dt);
  const others = [player, ...zombies];
  // The dead far from the player stand still: a stand-in for the records of
  // docs/03 until that milestone.
  for (const z of zombies) {
    if (Math.abs(z.gx - player.gx) > ACTIVE_TILES || Math.abs(z.gy - player.gy) > ACTIVE_TILES) continue;
    updateZombie(z, dt, player, others);
  }
  if (player.hp <= 0 && !player.dead) {
    // Death (Michael, 2026-10-10 night): the game stops on the dead screen,
    // and the way back to the title is a fresh load.
    player.dead = true;
    events.emit("gameOver", { player });
    screens.show("dead", { when: clock.getLabel() });
  }
  const px = Math.round(player.gx);
  const py = Math.round(player.gy);
  playerRoom = map.roomAt(px, py); // refinds rooms if a wall changed
  // The light you carry: a torch in hand at full, else one on the belt at
  // half, which also halves how far the dead see it (zombie.js).
  const held = items.heldFire(player.hands);
  const belted = held ? null : beltFire(inventory.beltOf(player));
  const fire = held || belted;
  const strength = held ? 1 : BELT_LIGHT;
  light.setCarrier(fire ? { gx: player.gx, gy: player.gy, radius: fire.radius * strength, flicker: fire.flicker || null, strength } : null);
  light.update();
  // Sight is cast from the player's tile centre and only recomputed when the
  // player or the camera enters a new tile. Casting every step at 60 Hz was the
  // bulk of a step's cost and fed the catch-up spiral behind the freezes.
  const key = `${px},${py}|${Math.round(camera.cam.gx)},${Math.round(camera.cam.gy)}|${map.worldVersion}|${V.w}x${V.h}`;
  if (key !== visKey) {
    const t1 = performance.now();
    tiles = camera.viewportTiles(V.w, V.h);
    visible = visibility.computeVisible(px, py, tiles);
    visKey = key;
    timing.vis = performance.now() - t1;
  }
  updateInventoryUi();
  updateHud({ player });
  updatePrompt(interact.promptFor(player, progress), progress);
  updateMessage(dt);
  input.endStep();
  timing.step = performance.now() - t0;
  if (t0 - timing.maxResetAt > 3000) {
    timing.stepMax = 0;
    timing.maxResetAt = t0;
  }
  timing.stepMax = Math.max(timing.stepMax, timing.step);
}

function render() {
  const r0 = performance.now();
  const scene = {
    w: V.w,
    h: V.h,
    tiles,
    visible,
    entities: [player, ...zombies],
    playerRoom,
    player,
    camera: camera.cam,
    drawAll,
    fog: !drawAll,
  };
  if (!glError) drawn = renderScene(scene);
  timing.render = performance.now() - r0;
  const [cx, cy] = map.chunkCoord(Math.round(player.gx), Math.round(player.gy));
  const hand = (e) => (e ? e.id : "-");
  debugEl.textContent =
    `fps ${loop.getFps()}\n` +
    `player ${player.gx.toFixed(2)},${player.gy.toFixed(2)} ${player.facing} hp ${Math.ceil(player.hp)} hunger ${Math.round(player.hunger)} thirst ${Math.round(player.thirst)}\n` +
    `${clock.getLabel()} ${clock.getPhase()}  bright ${clock.getBrightness().toFixed(2)}  light@player ${light.lightAt(player.gx, player.gy).toFixed(2)}  hands ${hand(player.hands.main)}/${hand(player.hands.off)}\n` +
    `chunk ${cx},${cy}  room ${playerRoom}${playerRoom > 0 ? (map.roomSealed(map.getRoom(playerRoom)) ? " sealed" : " open") : ""}  rooms ${map.roomCount()}  sources ${light.sources().length} (${light.sources().filter((s) => s.kind === "portal").length} portals)\n` +
    `tiles ${tiles.length} visible ${visible.size} drawables ${drawn}  step ${timing.step.toFixed(1)}ms max3s ${timing.stepMax.toFixed(1)}ms vis ${timing.vis.toFixed(1)}ms render ${(timing.render || 0).toFixed(1)}ms\n` +
    `zombies ${zombies.length}  near ${zombies.filter((z) => Math.abs(z.gx - player.gx) <= ACTIVE_TILES && Math.abs(z.gy - player.gy) <= ACTIVE_TILES).length}  ${zombies.slice(0, 6).map((z) => z.state).join(" ")}\n` +
    `Tab: bag   C: character   1-4: belt   Z: zoom   right-click: actions   Esc: close or pause   E: nearest   T: torch   B: boards   V: ${drawAll ? "all" : "fog"}   K: near walls ${cutaway}   ] [: hour   L: debug ${["off", "light", "ambient", "fog"][night.debug]}${glError ? `   WebGL2 unavailable: ${glError}` : ""}`;
}

// ---- the panel's handlers: moves that involve a slot know the player ----

function slotParts(id) {
  const [kind, key] = id.split(":");
  return { kind, key, index: Number(key) };
}

function slotGet(id) {
  const { kind, key, index } = slotParts(id);
  if (kind === "worn") return player.worn[key];
  if (kind === "belt") return inventory.beltOf(player)?.[index] ?? null;
  if (kind === "hand") return player.hands[key];
  return null;
}

function slotSet(id, entry) {
  const { kind, key, index } = slotParts(id);
  if (kind === "worn") player.worn[key] = entry;
  else if (kind === "belt") {
    const belt = inventory.beltOf(player);
    if (belt) belt[index] = entry;
  } else if (kind === "hand") {
    // Clearing a hand releases the entry (from both hands if it is two-handed);
    // filling one goes through equip in placeInSlot, so this only clears.
    if (entry) items.hold(player.hands, entry, key);
    else if (player.hands[key]) items.release(player.hands, player.hands[key]);
  }
}

// Take an entry out of where a drag started.
function detachFrom(entry, from) {
  if (from.kind === "bag") grid.remove(from.bag, entry);
  else if (slotGet(from.id) === entry) slotSet(from.id, null);
}

function restoreTo(entry, from) {
  if (from.kind === "bag") {
    if (!grid.insert(from.bag, entry)) map.dropItem(Math.round(player.gx), Math.round(player.gy), entry);
  } else slotSet(from.id, entry);
}

function panelHandlers() {
  return {
    changed() {},
    belt() {
      return inventory.beltOf(player);
    },
    isItemBag(bag) {
      return bag === inventory.bagOf(player);
    },
    canStore(entry) {
      return inventory.canStoreIn(entry);
    },
    canPlace(entry, slotId) {
      const { kind, key, index } = slotParts(slotId);
      const def = items.getItem(entry.id);
      if (kind === "worn") return def.wear === key;
      if (kind === "belt") {
        // Hand items, one at a time, or consumables as a stack.
        const belt = inventory.beltOf(player);
        if (!belt || index >= belt.length) return false;
        if (def.hands) return entry.count === 1;
        return def.kind === "food" || !!def.capacity;
      }
      // A hand takes what fits it; an occupant swaps out if it can be stowed.
      if (kind === "hand") return !!def.hands && entry.count === 1 && (def.hands === "both" || def.hands === "either" || def.hands === key);
      return false;
    },
    // Drop onto a worn or belt slot. An occupant goes to the bag or belt if
    // it can; an old bag on the back drops at your feet, since bags do not nest.
    placeInSlot(entry, from, slotId) {
      const { kind, key } = slotParts(slotId);
      const occupant = slotGet(slotId);
      if (occupant === entry) return;
      detachFrom(entry, from);
      if (kind === "hand") {
        // equip swaps whatever is in the way out to the bag or belt.
        if (!inventory.equip(player, entry, key)) {
          restoreTo(entry, from);
          showMessage("No room to swap.");
        }
        return;
      }
      // Dragging a bag off your back takes its grid away; the bag column may
      // have been the source, so it is detached already.
      if (occupant) {
        slotSet(slotId, null);
        if (kind === "worn" && key === "back") {
          slotSet(slotId, entry);
          map.dropItem(Math.round(player.gx), Math.round(player.gy), occupant);
          return;
        }
        if (!inventory.stow(player, occupant)) {
          slotSet(slotId, occupant);
          restoreTo(entry, from);
          showMessage("No room to swap.");
          return;
        }
      }
      slotSet(slotId, entry);
    },
    // Drop from a slot into a grid at a cell.
    placeInGrid(entry, from, bag, x, y, rot) {
      if (!inventory.canStoreIn(entry)) return showMessage("Empty it first, or wear it.");
      detachFrom(entry, from);
      // Taking the bag off the back while dropping into its own grid cannot work.
      if (!bag.items && !bag.cols) return restoreTo(entry, from);
      if (!grid.fits(bag, entry.id, x, y, rot)) return restoreTo(entry, from);
      entry.x = x;
      entry.y = y;
      entry.rot = !!rot;
      bag.items.push(entry);
    },
    dropToFloor(entry, from) {
      detachFrom(entry, from);
      map.dropItem(Math.round(player.gx), Math.round(player.gy), entry);
    },
    noRoom(intoBag) {
      showMessage(intoBag ? "No room in your bag." : "No room in there.");
    },
    itemMenu(entry, bag, otherBag) {
      return interact.itemMenu(player, entry, bag, otherBag);
    },
    // Double-click in your bag: equip what can be held, wear what can be worn.
    use(entry, bag) {
      const def = items.getItem(entry.id);
      if (def.hands) return interact.equipFrom(player, entry);
      if (def.wear) return interact.wearFrom(player, entry, bag);
      return false;
    },
    // Double-click on a slot: its first menu entry (Equip, Unequip, Take off).
    useSlot(slotId) {
      const m = interact.slotMenu(player, slotId);
      if (!m.length) return false;
      m[0].onSelect();
      return true;
    },
    slotMenu(slotId) {
      return interact.slotMenu(player, slotId);
    },
  };
}

// The starter kit (docs/11): worn tunic, breeches, boots, a rope belt with two
// slots, a burlap sack with water, a little food, and one plank; the torch in
// a hand. No hood: the head slot starts empty (Michael, 2026-10-10).
function giveStarterKit() {
  const entry = (id, props = {}) => ({ id, count: 1, ...props });
  for (const id of ["tunic", "breeches", "boots", "belt", "small_sack"]) {
    const e = entry(id);
    player.worn[items.getItem(id).wear] = e;
  }
  const bag = inventory.bagOf(player);
  inventory.addItem(bag, "waterskin", 1, { fill: 100 });
  inventory.addItem(bag, "bread", 1);
  inventory.addItem(bag, "apple", 2);
  inventory.addItem(bag, "plank", 1);
  items.hold(player.hands, entry("torch"));
}

async function boot() {
  input.init(canvas);
  settings.load();
  view.init(canvas, ui);
  applyDebugCorner();
  settings.onChange((key) => {
    if (key === "debugCorner") applyDebugCorner();
  });

  items.loadItems(await assets.loadJson("data/items.json"));
  items.loadLoot(await assets.loadJson("data/loot.json"));
  const json = await assets.loadJson(MAP_FILE);
  await assets.loadMapSprites(json);
  info = map.loadMap(json);
  player = createPlayer(info.spawn[0], info.spawn[1]);
  giveStarterKit();
  zombies = info.zombies.map(([x, y]) => createZombie(x, y));
  camera.snapTo(player.gx, player.gy);
  camera.applyOrigin(V.w, V.h);
  map.ensureAround(player.gx, player.gy, 4);
  for (const [x, y] of map.takePendingSpawns()) zombies.push(createZombie(x, y));
  tiles = camera.viewportTiles(V.w, V.h);
  map.rebuildRooms();

  initHud();
  initPrompt();
  menu.initContextMenu();
  const handlers = panelHandlers();
  panel.initInventoryPanel(handlers);
  // Any screen up means the game is paused; the title is up at boot.
  screens.initScreens({ onChange: (name) => setPaused(!!name), onReload: () => window.location.reload() });
  events.on("playerHit", ({ damage }) => damagePlayer(player, damage));
  events.on("containerOpened", ({ bag, tiles: where, name }) => {
    openBag = { bag, tiles: where, name };
    panel.setOpen(true, { character: panel.isCharacter() });
  });
  // After the menu's own listener, so a menu closed by Escape is seen first.
  window.addEventListener("keydown", (e) => {
    if (e.code === "Escape") handleEscape();
  });

  // Sight once before the first frame, so the village behind the title is
  // seen as the player sees it rather than all fog.
  visible = visibility.computeVisible(Math.round(player.gx), Math.round(player.gy), tiles);
  loop.start({ update, render, simTick() {} }, { simIntervalMs: 1000 });
  screens.show("title");

  window.__game = {
    iso, input, loop, assets, events, map, camera, visibility, interact, clock, light, items, inventory, grid, panel, menu, view, settings, screens,
    render: { night },
    get player() { return player; },
    get zombies() { return zombies; },
    get tiles() { return tiles; },
    get visible() { return visible; },
    get playerRoom() { return playerRoom; },
    get info() { return info; },
    get openBag() { return openBag; },
    teleport(gx, gy) { player.gx = gx; player.gy = gy; player.auto = null; camera.snapTo(gx, gy); },
    walkTo(gx, gy) { return autoWalk(player, [gx, gy]); },
    setPaused,
    handlers,
    // The Developer Bag, twelve by eight, at your feet (docs/11). Never loot.
    giveDevBag() { map.dropItem(Math.round(player.gx), Math.round(player.gy), { id: "dev_bag", count: 1 }); showMessage("A Developer Bag lies at your feet."); },
  };
}

boot().catch((err) => {
  console.error(err);
  debugEl.textContent = `boot failed: ${err.message}`;
});
