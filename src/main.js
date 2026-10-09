// Boot and the game state. A scrolling camera over a chunked map with real
// line of sight, buildings with doors and shuttered windows, forest scattered
// by rule, the player with a bag, and the dead. Milestone 1 (the probe)
// passed on 2026-10-09; lighting, the renderer, openings, and the interface
// followed. See TODO.md and docs/00-vision.md.

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

const CANVAS_W = 960;
const CANVAS_H = 540;
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
let deaths = 0;
let drawn = 0;
let visKey = null; // player tile and camera tile the visible set was computed for
let openContainer = null; // the prop whose bag is open beside yours
let progress = null; // 0..1 of a timed action
const timing = { step: 0, stepMax: 0, vis: 0, maxResetAt: 0 };

function resize() {
  const scale = Math.max(1, Math.floor(Math.min(window.innerWidth / CANVAS_W, window.innerHeight / CANVAS_H)));
  canvas.style.width = `${CANVAS_W * scale}px`;
  canvas.style.height = `${CANVAS_H * scale}px`;
  input.setScale(scale);
  const rect = canvas.getBoundingClientRect();
  ui.style.left = `${rect.left}px`;
  ui.style.top = `${rect.top}px`;
  ui.style.width = `${CANVAS_W}px`;
  ui.style.height = `${CANVAS_H}px`;
  ui.style.transform = `scale(${scale})`;
  ui.style.transformOrigin = "0 0";
}

// Right-click builds a menu of what is under the cursor; a left click on the
// floor walks there (docs/10). A click that dismissed a menu does nothing else.
function handleMouse() {
  const m = input.getMouse();
  if (input.mouseRightPressed()) {
    const actions = interact.actionsAt(m.x, m.y, player);
    if (actions.length) {
      menu.openContextMenu(m.x, m.y, actions.map((a) => ({ label: a.label, enabled: a.enabled, onSelect: () => interact.runAction(player, a) })), CANVAS_W, CANVAS_H);
    }
  }
  const dismissed = menu.tookClick();
  if (input.mouseLeftPressed() && !dismissed && !menu.isMenuOpen() && m.inside) {
    const actions = interact.actionsAt(m.x, m.y, player);
    const walk = actions.find((a) => a.kind === "floor");
    if (walk) interact.runAction(player, walk);
    else if (actions.length && actions[0].simple) interact.runAction(player, actions[0]);
  }
  if (menu.isMenuOpen() && player.moving) menu.closeContextMenu();
}

function updateInventoryUi() {
  if (input.wasPressed("Tab")) {
    panel.toggle();
    if (!panel.isOpen()) openContainer = null;
  }
  if (openContainer) {
    let d = Infinity;
    for (const [tx, ty] of openContainer.tiles) d = Math.min(d, Math.hypot(player.gx - tx, player.gy - ty));
    if (d > CONTAINER_CLOSE_DIST) openContainer = null;
  }
  panel.renderInventoryPanel(player.bag, openContainer ? openContainer.bag : null, player.hands);
}

function update(dt) {
  const t0 = performance.now();
  if (input.wasPressed("KeyV")) drawAll = !drawAll;
  if (input.wasPressed("KeyC")) setCutaway(cutaway === "stub" ? "translucent" : "stub");
  if (input.wasPressed("KeyL")) night.debug = (night.debug + 1) % 4;
  // Debug: ] and [ skip the clock an hour forward or back.
  if (input.wasPressed("BracketRight")) clock.setHour(clock.getHour() + 1);
  if (input.wasPressed("BracketLeft")) clock.setHour(clock.getHour() - 1);
  clock.update(dt);
  map.burnFires(dt);
  camera.follow(player, dt);
  camera.applyOrigin(CANVAS_W, CANVAS_H);
  // Grow the world three chunks ahead of the player, so wild forest and its
  // dead appear far outside the viewport.
  map.ensureAround(player.gx, player.gy, 3);
  for (const [x, y] of map.takePendingSpawns()) zombies.push(createZombie(x, y));
  handleMouse();
  interact.updateInteract(player, dt);
  updatePlayer(player, dt);
  progress = interact.updateAction(player, dt);
  inventory.fixHands(player);
  const others = [player, ...zombies];
  // The dead far from the player stand still: a stand-in for the records of
  // docs/03 until that milestone.
  for (const z of zombies) {
    if (Math.abs(z.gx - player.gx) > ACTIVE_TILES || Math.abs(z.gy - player.gy) > ACTIVE_TILES) continue;
    updateZombie(z, dt, player, others);
  }
  if (player.hp <= 0) {
    // No death yet: count it and carry on.
    deaths++;
    player.hp = player.maxHp;
    player.hunger = Math.max(player.hunger, 50);
    player.thirst = Math.max(player.thirst, 50);
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
  const key = `${px},${py}|${Math.round(camera.cam.gx)},${Math.round(camera.cam.gy)}|${map.worldVersion}`;
  if (key !== visKey) {
    const t1 = performance.now();
    tiles = camera.viewportTiles(CANVAS_W, CANVAS_H);
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
    w: CANVAS_W,
    h: CANVAS_H,
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
  debugEl.textContent =
    `fps ${loop.getFps()}\n` +
    `player ${player.gx.toFixed(2)},${player.gy.toFixed(2)} ${player.facing} hp ${Math.ceil(player.hp)} hunger ${Math.round(player.hunger)} thirst ${Math.round(player.thirst)} deaths ${deaths}\n` +
    `${clock.getLabel()} ${clock.getPhase()}  bright ${clock.getBrightness().toFixed(2)}  light@player ${light.lightAt(player.gx, player.gy).toFixed(2)}  hands ${player.hands.main || "-"}/${player.hands.off || "-"}\n` +
    `chunk ${cx},${cy}  room ${playerRoom}${playerRoom > 0 ? (map.roomSealed(map.getRoom(playerRoom)) ? " sealed" : " open") : ""}  rooms ${map.roomCount()}  sources ${light.sources().length} (${light.sources().filter((s) => s.kind === "portal").length} portals)\n` +
    `tiles ${tiles.length} visible ${visible.size} drawables ${drawn}  step ${timing.step.toFixed(1)}ms max3s ${timing.stepMax.toFixed(1)}ms vis ${timing.vis.toFixed(1)}ms render ${(timing.render || 0).toFixed(1)}ms\n` +
    `zombies ${zombies.length}  near ${zombies.filter((z) => Math.abs(z.gx - player.gx) <= ACTIVE_TILES && Math.abs(z.gy - player.gy) <= ACTIVE_TILES).length}  ${zombies.slice(0, 6).map((z) => z.state).join(" ")}\n` +
    `Tab: bag   right-click: actions   click: walk   E: nearest   T: torch   B: boards   V: ${drawAll ? "all" : "fog"}   C: near walls ${cutaway}   ] [: hour   L: debug ${["off", "light", "ambient", "fog"][night.debug]}${glError ? `   WebGL2 unavailable: ${glError}` : ""}`;
}

// The player's bag can hold what the panel does to it (docs/10).
function panelHandlers() {
  return {
    changed() {
      inventory.fixHands(player);
    },
    handOf(id) {
      return items.handOf(player.hands, id);
    },
    dropToFloor(entry, bag) {
      grid.remove(bag, entry);
      map.dropItem(Math.round(player.gx), Math.round(player.gy), entry);
      inventory.fixHands(player);
    },
    noRoom(intoBag) {
      showMessage(intoBag ? "No room in your bag." : "No room in there.");
    },
    itemMenu(entry, bag, otherBag) {
      return interact.itemMenu(player, entry, bag, otherBag);
    },
  };
}

async function boot() {
  input.init(canvas);
  window.addEventListener("resize", resize);
  resize();

  items.loadItems(await assets.loadJson("data/items.json"));
  items.loadLoot(await assets.loadJson("data/loot.json"));
  const json = await assets.loadJson(MAP_FILE);
  await assets.loadMapSprites(json);
  info = map.loadMap(json);
  player = createPlayer(info.spawn[0], info.spawn[1]);
  // The starter kit (docs/10): a torch in the off-hand, water, a little food, one plank.
  inventory.addItem(player.bag, "torch", 1);
  inventory.addItem(player.bag, "waterskin", 1, { fill: 100 });
  inventory.addItem(player.bag, "bread", 1);
  inventory.addItem(player.bag, "apple", 2);
  inventory.addItem(player.bag, "plank", 1);
  items.hold(player.hands, "torch");
  zombies = info.zombies.map(([x, y]) => createZombie(x, y));
  camera.snapTo(player.gx, player.gy);
  camera.applyOrigin(CANVAS_W, CANVAS_H);
  map.ensureAround(player.gx, player.gy, 3);
  for (const [x, y] of map.takePendingSpawns()) zombies.push(createZombie(x, y));
  tiles = camera.viewportTiles(CANVAS_W, CANVAS_H);
  map.rebuildRooms();

  initHud();
  initPrompt();
  menu.initContextMenu();
  panel.initInventoryPanel(panelHandlers());
  events.on("playerHit", ({ damage }) => damagePlayer(player, damage));
  events.on("containerOpened", ({ prop }) => {
    openContainer = prop;
    panel.setOpen(true);
  });

  loop.start({ update, render, simTick() {} }, { simIntervalMs: 1000 });

  window.__game = {
    iso, input, loop, assets, events, map, camera, visibility, interact, clock, light, items, inventory, grid, panel, menu,
    render: { night },
    get player() { return player; },
    get zombies() { return zombies; },
    get tiles() { return tiles; },
    get visible() { return visible; },
    get playerRoom() { return playerRoom; },
    get info() { return info; },
    get openContainer() { return openContainer; },
    teleport(gx, gy) { player.gx = gx; player.gy = gy; player.auto = null; camera.snapTo(gx, gy); },
    walkTo(gx, gy) { return autoWalk(player, [gx, gy]); },
  };
}

boot().catch((err) => {
  console.error(err);
  debugEl.textContent = `boot failed: ${err.message}`;
});
