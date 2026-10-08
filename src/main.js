// Boot and the probe's game state. Milestone 1: a scrolling camera over a
// chunked map, one cottage with cutaway walls, line of sight through glass,
// the player, and three of the dead. See TODO.md and docs/00-vision.md.

import * as iso from "./iso.js";
import * as input from "./input.js";
import * as loop from "./loop.js";
import * as assets from "./assets.js";
import * as events from "./events.js";
import * as map from "./map.js";
import * as camera from "./camera.js";
import * as visibility from "./visibility.js";
import { renderScene } from "./render.js";
import { createPlayer, updatePlayer, damagePlayer } from "./entities/player.js";
import { createZombie, updateZombie } from "./entities/zombie.js";

const CANVAS_W = 960;
const CANVAS_H = 540;
const MAP_FILE = "data/maps/square.json";

const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");
const ui = document.getElementById("ui");
const debugEl = document.getElementById("debug");
ctx.imageSmoothingEnabled = false;

let info = null;
let player = null;
let zombies = [];
let tiles = [];
let visible = new Set();
let playerRoom = 0;
let drawAll = false; // debug: V shows everything, fog off
let deaths = 0;
let drawn = 0;

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
  if (input.wasPressed("KeyV")) drawAll = !drawAll;
  camera.follow(player, dt);
  camera.applyOrigin(CANVAS_W, CANVAS_H);
  updatePlayer(player, dt);
  const others = [player, ...zombies];
  for (const z of zombies) updateZombie(z, dt, player, others);
  if (player.hp <= 0) {
    // The probe has no death yet: count it and carry on.
    deaths++;
    player.hp = player.maxHp;
  }
  tiles = camera.viewportTiles(CANVAS_W, CANVAS_H);
  playerRoom = map.roomAt(Math.round(player.gx), Math.round(player.gy));
  visible = visibility.computeVisible(player.gx, player.gy, tiles);
  input.endStep();
}

function render() {
  ctx.fillStyle = "#1c1c24";
  ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
  drawn = renderScene(ctx, {
    w: CANVAS_W,
    h: CANVAS_H,
    tiles,
    visible,
    entities: [player, ...zombies],
    playerRoom,
    drawAll,
    fog: !drawAll,
  });
  const [cx, cy] = map.chunkCoord(Math.round(player.gx), Math.round(player.gy));
  debugEl.textContent =
    `fps ${loop.getFps()}\n` +
    `player ${player.gx.toFixed(2)},${player.gy.toFixed(2)} ${player.facing} hp ${player.hp} deaths ${deaths}\n` +
    `chunk ${cx},${cy}  room ${playerRoom}  rooms ${map.roomCount()}\n` +
    `tiles ${tiles.length} visible ${visible.size} drawables ${drawn}\n` +
    `zombies ${zombies.length}  ${zombies.map((z) => z.state).join(" ")}\n` +
    `V: ${drawAll ? "showing everything" : "fog on"}`;
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
  tiles = camera.viewportTiles(CANVAS_W, CANVAS_H);
  map.rebuildRooms();

  events.on("playerHit", ({ damage }) => damagePlayer(player, damage));

  loop.start({ update, render, simTick() {} }, { simIntervalMs: 1000 });

  window.__game = {
    iso, input, loop, assets, events, map, camera, visibility,
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
