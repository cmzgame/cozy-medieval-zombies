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
import { createPlayer, updatePlayer, damagePlayer, autoWalk } from "./entities/player.js";
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
  // Tab opens the bag; with none worn it opens the character screen instead,
  // with the message (docs/11, check 6). C opens the character screen.
  if (input.wasPressed("Tab") || input.wasPressed("KeyC")) {
    const noBag = !inventory.bagOf(player);
    panel.toggle({ character: input.wasPressed("KeyC") || noBag });
    if (!panel.isOpen()) openBag = null;
    else if (noBag) showMessage("No bag on your back.");
  }
  // Belt keys: swap the slot with its hand (docs/11).
  for (let i = 0; i < 4; i++) {
    if (!input.wasPressed(`Digit${i + 1}`)) continue;
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

function update(dt) {
  const t0 = performance.now();
  if (input.wasPressed("KeyV")) drawAll = !drawAll;
  if (input.wasPressed("KeyK")) setCutaway(cutaway === "stub" ? "translucent" : "stub");
  if (input.wasPressed("KeyL")) night.debug = (night.debug + 1) % 4;
  // Debug: ] and [ skip the clock an hour forward or back.
  if (input.wasPressed("BracketRight")) clock.setHour(clock.getHour() + 1);
  if (input.wasPressed("BracketLeft")) clock.setHour(clock.getHour() - 1);
  clock.update(dt);
  map.burnFires(dt);
  camera.follow(player, dt);
  camera.applyOrigin(V.w, V.h);
  // Grow the world four chunks ahead of the player, so wild forest and its
  // dead appear outside even a big window's view (docs/02, the view).
  map.ensureAround(player.gx, player.gy, 4);
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
  const held = items.heldFire(player.hands);
  light.setCarrier(held ? { gx: player.gx, gy: player.gy, radius: held.radius, flicker: held.flicker || null } : null);
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
    `Tab: bag   C: character   1-4: belt   right-click: actions   Esc: close or pause   E: nearest   T: torch   B: boards   V: ${drawAll ? "all" : "fog"}   K: near walls ${cutaway}   ] [: hour   L: debug ${["off", "light", "ambient", "fog"][night.debug]}${glError ? `   WebGL2 unavailable: ${glError}` : ""}`;
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
    canPlace(entry, slotId) {
      const { kind, key, index } = slotParts(slotId);
      const def = items.getItem(entry.id);
      if (kind === "worn") return def.wear === key;
      if (kind === "belt") {
        const belt = inventory.beltOf(player);
        return !!belt && index < belt.length && !!def.hands && entry.count === 1;
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
      if (items.getItem(entry.id).bag && bag === inventory.bagOf(player)) return;
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
