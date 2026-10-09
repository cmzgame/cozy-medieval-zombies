// Boot and the game state. A scrolling camera over a chunked map with real
// line of sight, buildings with doors and shuttered windows, forest scattered
// by rule, the player, and the dead. Milestone 1 (the probe) passed on
// 2026-10-09; lighting is next. See TODO.md and docs/00-vision.md.

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
import { createPlayer, updatePlayer, damagePlayer } from "./entities/player.js";
import { createZombie, updateZombie } from "./entities/zombie.js";
import { initHud, updateHud } from "./ui/hud.js";
import { initPrompt, updatePrompt } from "./ui/prompt.js";
import * as interact from "./interact.js";
import * as items from "./items.js";

const CANVAS_W = 960;
const CANVAS_H = 540;
const MAP_FILE = "data/maps/square.json";
const ACTIVE_TILES = 40; // the dead beyond this many tiles from the player do not think

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

function update(dt) {
  const t0 = performance.now();
  if (input.wasPressed("KeyV")) drawAll = !drawAll;
  if (input.wasPressed("KeyC")) setCutaway(cutaway === "stub" ? "translucent" : "stub");
  if (input.wasPressed("KeyL")) night.debug = (night.debug + 1) % 4;
  // Debug: ] and [ skip the clock an hour forward or back.
  if (input.wasPressed("BracketRight")) clock.setHour(clock.getHour() + 1);
  if (input.wasPressed("BracketLeft")) clock.setHour(clock.getHour() - 1);
  // T: the torch in and out of the off-hand, until the inventory does it.
  if (input.wasPressed("KeyT")) {
    if (items.holding(player.hands, "torch")) items.release(player.hands, "torch");
    else items.hold(player.hands, "torch");
  }
  clock.update(dt);
  map.burnFires(dt);
  camera.follow(player, dt);
  camera.applyOrigin(CANVAS_W, CANVAS_H);
  // Grow the world three chunks ahead of the player, so wild forest and its
  // dead appear far outside the viewport.
  map.ensureAround(player.gx, player.gy, 3);
  for (const [x, y] of map.takePendingSpawns()) zombies.push(createZombie(x, y));
  interact.updateInteract(player, dt);
  updatePlayer(player, dt);
  const others = [player, ...zombies];
  // The dead far from the player stand still: a stand-in for the records of
  // docs/03 until that milestone.
  for (const z of zombies) {
    if (Math.abs(z.gx - player.gx) > ACTIVE_TILES || Math.abs(z.gy - player.gy) > ACTIVE_TILES) continue;
    updateZombie(z, dt, player, others);
  }
  if (player.hp <= 0) {
    // The probe has no death yet: count it and carry on.
    deaths++;
    player.hp = player.maxHp;
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
  updateHud({ player });
  updatePrompt(interact.promptFor(player));
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
    `player ${player.gx.toFixed(2)},${player.gy.toFixed(2)} ${player.facing} hp ${player.hp} deaths ${deaths}\n` +
    `${clock.getLabel()} ${clock.getPhase()}  bright ${clock.getBrightness().toFixed(2)}  light@player ${light.lightAt(player.gx, player.gy).toFixed(2)}  hands ${player.hands.main || "-"}/${player.hands.off || "-"}\n` +
    `chunk ${cx},${cy}  room ${playerRoom}  rooms ${map.roomCount()}  sources ${light.sources().length} (${light.sources().filter((s) => s.kind === "portal").length} portals)\n` +
    `tiles ${tiles.length} visible ${visible.size} drawables ${drawn}  step ${timing.step.toFixed(1)}ms max3s ${timing.stepMax.toFixed(1)}ms vis ${timing.vis.toFixed(1)}ms render ${(timing.render || 0).toFixed(1)}ms\n` +
    `zombies ${zombies.length}  near ${zombies.filter((z) => Math.abs(z.gx - player.gx) <= ACTIVE_TILES && Math.abs(z.gy - player.gy) <= ACTIVE_TILES).length}  ${zombies.slice(0, 6).map((z) => z.state).join(" ")}\n` +
    `V: ${drawAll ? "showing everything" : "fog on"}   C: near walls ${cutaway}   ] [: skip an hour   T: torch   L: debug view ${["off", "light", "ambient", "fog"][night.debug]}`;
}

async function boot() {
  input.init(canvas);
  window.addEventListener("resize", resize);
  resize();

  const json = await assets.loadJson(MAP_FILE);
  await assets.loadMapSprites(json);
  info = map.loadMap(json);
  player = createPlayer(info.spawn[0], info.spawn[1]);
  zombies = info.zombies.map(([x, y]) => createZombie(x, y));
  camera.snapTo(player.gx, player.gy);
  camera.applyOrigin(CANVAS_W, CANVAS_H);
  map.ensureAround(player.gx, player.gy, 3);
  for (const [x, y] of map.takePendingSpawns()) zombies.push(createZombie(x, y));
  tiles = camera.viewportTiles(CANVAS_W, CANVAS_H);
  map.rebuildRooms();

  initHud();
  initPrompt();
  events.on("playerHit", ({ damage }) => damagePlayer(player, damage));

  loop.start({ update, render, simTick() {} }, { simIntervalMs: 1000 });

  window.__game = {
    iso, input, loop, assets, events, map, camera, visibility, interact, clock, light, items,
    render: { night },
    get player() { return player; },
    get zombies() { return zombies; },
    get tiles() { return tiles; },
    get visible() { return visible; },
    get playerRoom() { return playerRoom; },
    get info() { return info; },
    teleport(gx, gy) { player.gx = gx; player.gy = gy; camera.snapTo(gx, gy); },
  };
}

boot().catch((err) => {
  console.error(err);
  debugEl.textContent = `boot failed: ${err.message}`;
});
