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
import * as ground from "./ground.js";
import { renderScene, night } from "./render.js";
import { createPlayer, updatePlayer, damagePlayer, eat, drink } from "./entities/player.js";
import { createZombie, updateZombie } from "./entities/zombie.js";
import { createVillager, updateVillager, damageVillager, turnVillager } from "./entities/villager.js";
import { initHud, updateHud } from "./ui/hud.js";
import { initPrompt, updatePrompt, showMessage, updateMessage } from "./ui/prompt.js";
import { initZombieBars, updateZombieBars } from "./ui/zombie-bars.js";
import { initSwingTimer, updateSwingTimer } from "./ui/swing-timer.js";
import { initSpeech, updateSpeech } from "./ui/speech.js";
import * as archery from "./archery.js";
import * as burning from "./fire.js";
import * as infection from "./infection.js";
import * as bleed from "./bleed.js";
import * as buttons from "./buttons.js";
import { refreshCorpse, createCharacter, wardrobeInto } from "./entities/character.js";
import * as menu from "./ui/context-menu.js";
import * as panel from "./ui/inventory-panel.js";
import * as kit from "./ui/kit.js";
import * as cursor from "./ui/cursor.js";
import * as log from "./ui/log.js";
import * as use from "./use.js";
import * as interactions from "./interactions.js";
import * as world from "./world.js";
import * as verbs from "./verbs.js";
import * as stations from "./stations.js";
import * as stationPanel from "./ui/station-panel.js";
import * as interact from "./interact.js";
import * as items from "./items.js";
import * as inventory from "./inventory.js";
import * as view from "./view.js";
import * as settings from "./settings.js";
import * as screens from "./ui/screens.js";
import * as figure from "./figure.js";
import * as placement from "./placement.js";
import * as combat from "./combat.js";
import * as buildPalette from "./ui/build-palette.js";
import * as shell from "./boot.js";
import { controlPlayer } from "./player-controller.js";
import { createDevApi } from "./dev.js";
import { createInventoryActions } from "./ui/inventory-actions.js";
import * as rng from "./rng.js";
import * as rules from "./rules.js";
import * as tuning from "./tuning.js";

const V = view.view; // the world's size in its own pixels, kept current by view.js
// The map: the valley (docs/29, 30) unless the URL says `?map=square` (the old proving ground, which the checks still use).
const MAP_NAME = new URLSearchParams(window.location.search).get("map") || "valley";
const MAP_FILE = `data/maps/${/^[a-z0-9_-]+$/.test(MAP_NAME) ? MAP_NAME : "valley"}.json`;
const ZOOM_PACE = 0.3; // seconds between wheel steps that count
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
let zombies = []; // the dead that still think; the fallen move to corpses (docs/23a, B1)
let corpses = [];
let others = []; // the living, rebuilt each step; the interface reads it between steps
let uiSimTime = 0; // the sim time the interface was last ticked to (docs/23a, F)
let villagers = [];
let tiles = [];
let visible = new Set();
let playerRoom = 0;
let drawAll = false; // debug: V shows everything, fog off
let drawn = 0;
let visKey = null; // player tile and camera tile the visible set was computed for
let openBag = null; // { bag, tiles, name, corpse?, closeDist? }: the container open beside yours
let corpseWatch = null; // the body whose grid is open: redrawn as things leave it, once more when it closes
let progress = null; // 0..1 of a timed action
let handlers = null; // the inventory panel's handlers, on window.__game for tests
const timing = { step: 0, stepMax: 0, vis: 0, maxResetAt: 0 };

// Right-click builds a menu of what is under the cursor; Walk here is in it
// (docs/10). Left click is kept free for selecting and placing things later
// (Michael, 2026-10-10).
function handleMouse() {
  // A right tap is the actions menu, opened where it was pressed; the end of a
  // draw spends it instead. The right button held is the off hand's stance (docs/21).
  const tap = buttons.off.tap;
  if (tap) {
    if (archery.drawState()) {
      archery.cancelDraw(player);
      buttons.spendTap();
    } else if (use.cancel()) {
      // A right click in Use mode puts the thing down (use.js).
    } else {
      openActionsMenu(tap);
    }
  }
  menu.tookClick();
  if (menu.isMenuOpen() && player.moving) menu.closeContextMenu();
}

function openActionsMenu(m) {
  // A mushroom or a rock wiggles; the menu still opens if it has actions
  // other than walking there (none yet; question 27).
  const poked = interact.pokeAt(m.x, m.y, player);
  let actions = interact.actionsAt(m.x, m.y, player);
  if (poked) {
    // The thing clicked offers its own actions (a tree: Chop down), once each.
    actions = actions.filter((a) => a.kind !== "walk" && !/^Walk/.test(a.label || ""));
    for (const a of interact.actionsForProp(poked, player)) if (!actions.some((b) => b.label === a.label)) actions.push(a);
  }
  const entries = actions.map((a) => ({ label: a.label, enabled: a.enabled, onSelect: () => interact.runAction(player, a) }));
  // Build is in every menu, in case the key is forgotten (Michael, 2026-10-12).
  entries.push({ label: "Build", enabled: !player.carrying && !panel.isOpen(), onSelect: toggleBuild });
  const u = view.toUi(m.x, m.y);
  menu.openContextMenu(u.x, u.y, entries);
}

// What is under the cursor for Use mode (use.js): a character, else a prop by its pixels, else the tile.
function useTargetAt(sx, sy) {
  const ch = interact.characterAt(sx, sy);
  if (ch) return { kind: "character", ch };
  const prop = interact.interactableAt(sx, sy, () => true);
  if (prop) return { kind: "prop", prop };
  const g = iso.toGrid(sx, sy);
  const t = map.peekTile(Math.round(g.gx), Math.round(g.gy));
  return { kind: "tile", x: Math.round(g.gx), y: Math.round(g.gy), floor: t ? t.floor : null };
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
  if (use.cancel()) return; // Use mode is the top thing that can close
  if (stationPanel.close()) return;
  if (screens.back()) return;
  if (buildPalette.isOpen()) {
    buildPalette.close();
    return;
  }
  if (placement.cancel()) return;
  if (panel.isOpen()) {
    panel.closeAll();
    openBag = null;
    return;
  }
  screens.show("pause");
}

// N: the build palette, or out of build mode if in it. Not while carrying or
// with the bag open (docs/13).
function toggleBuild() {
  if (placement.cancel()) return;
  if (buildPalette.isOpen()) {
    buildPalette.close();
    return;
  }
  if (player.carrying) return showMessage("Your hands are full.");
  if (panel.isOpen()) return;
  buildPalette.openPalette(player);
}

// X: the removal tool, or out of it if in it. Same limits as N.
function toggleRemove() {
  if (placement.state.kind === "remove") {
    placement.cancel();
    return;
  }
  if (player.carrying) return showMessage("Your hands are full.");
  if (panel.isOpen()) return;
  buildPalette.close();
  placement.beginRemove();
}

function applyDebugCorner() {
  debugEl.hidden = !settings.get("debugCorner");
}

function updateInventoryUi() {
  // Carrying furniture: both hands are full and nothing else happens until it
  // is down (docs/02). The bag closes if it was open.
  if (player.carrying) {
    if (panel.isOpen()) {
      panel.closeAll();
      openBag = null;
    }
    if (input.wasPressed("Tab") || input.wasPressed("KeyC")) showMessage("Your hands are full.");
    return;
  }
  // Tab opens and closes the bag; with none worn it opens the character screen
  // instead, with the message (docs/11, check 6). C opens and closes the
  // character screen. The two are independent (Michael, 2026-10-12).
  if (input.wasPressed("Tab")) {
    if (inventory.bagOf(player)) panel.toggleBag();
    else {
      panel.toggleCharacter();
      if (panel.isCharacter()) showMessage("No bag on your back.");
    }
    if (!panel.isBagOpen()) openBag = null;
  }
  if (input.wasPressed("KeyC")) panel.toggleCharacter();
  if (openBag && (!panel.isBagOpen() || panel.takeContainerClose())) openBag = null; // the bag or the container closed by its X
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
    if (d > (openBag.closeDist || tuning.world.containerCloseDist)) openBag = null; // a station's output reaches as far as its panel
  }
  if (openBag && openBag.corpse) corpseWatch = openBag.corpse;
  if (corpseWatch) {
    refreshCorpse(corpseWatch); // what was taken from its grid comes off its body
    if (!openBag || openBag.corpse !== corpseWatch) corpseWatch = null;
  }
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

// Hair painted in tools/hair.html (docs/12): data/hair/index.json lists the
// styles. Reloaded from the settings screen so a style saved a moment ago
// shows without a restart.
async function loadPaintedHair() {
  const folders = [["hair", "data/hair"], ...["head", "chest", "legs", "hands", "feet", "body", "beard", "waist"].map((s) => [s, `data/layers/${s}`])];
  // Every index at once, then every style at once (docs/23: the server answers in parallel).
  const indexes = await Promise.all(folders.map(([, folder]) => assets.loadJson(`${folder}/index.json`).catch(() => ({ styles: [] })))); // no folder yet: nothing painted
  await Promise.all(folders.flatMap(([slot, folder], i) => (indexes[i].styles || []).map(async (name) => figure.registerLayer(slot, name, await assets.loadJson(`${folder}/${name}.json`)))));
  figureKey = ""; // the pixels may have changed under the same name
  figureQuick = "";
  // The dead and villagers rebake too, since their outfits draw from the painted pool.
  for (const sheet of assets.rebakeFigures()) gl.redrawSheet(sheet);
}

// The player's sheet is rebuilt whenever their look or their clothes change
// (docs/12): a few milliseconds, redrawn into the atlas in place.
let figureKey = "";
let figureQuick = "";
function refreshFigure(force = false) {
  // The swing's keyframe set follows the weapon in the main hand (docs/14); a spear's throw has its own.
  const style = combat.styleOf(player, !!archery.drawState());
  // What the sheet depends on, as ids: the cheap test every step; the spec and its key only when it changed (docs/23a, B7).
  const quick = JSON.stringify([player.look, player.worn, player.hands, style, settings.get("paintedLayers") || null]);
  if (!force && quick === figureQuick) return; // `force`: the rig's numbers changed from the console (dev.js setLook), which no key sees
  figureQuick = quick;
  const spec = figure.characterSpec(figure.characterInputs(player, undefined, settings.get("paintedLayers") || {}, style));
  const key = figure.specKey(spec);
  if (!force && key === figureKey) return;
  figureKey = key;
  const sheet = assets.replaceSheet("player", figure.generateFigure(spec));
  gl.redrawSheet(sheet);
}

// One step of the game. The keys' and the mouse's "pressed this step" state is
// cleared in a finally, so a throw cannot re-apply a press on the next step (docs/23a, A1).
function update(dt) {
  const t0 = performance.now();
  try {
    stepGame(dt);
  } finally {
    input.endStep();
  }
  timing.step = performance.now() - t0;
  if (t0 - timing.maxResetAt > 3000) {
    timing.stepMax = 0;
    timing.maxResetAt = t0;
  }
  timing.stepMax = Math.max(timing.stepMax, timing.step);
}

function stepGame(dt) {
  rules.refresh(); // the sim's rules, from the settings, once a step (docs/23a, C3)
  if (input.wasPressed("KeyV")) drawAll = !drawAll;
  if (input.wasPressed("KeyN")) toggleBuild();
  if (input.wasPressed("KeyX")) toggleRemove();
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
  if (input.wasPressed("KeyL")) night.debug = (night.debug + 1) % 4;
  // Debug: ] and [ skip the clock an hour forward or back.
  if (input.wasPressed("BracketRight")) clock.setHour(clock.getHour() + 1);
  if (input.wasPressed("BracketLeft")) clock.setHour(clock.getHour() - 1);
  clock.update(dt);
  map.burnFires(dt);
  stations.update(dt); // every station's queue, in the world's time (docs/30, section 6)
  stationPanel.update(player);
  camera.follow(player, dt);
  camera.applyOrigin(V.w, V.h);
  // Grow the world four chunks ahead of the player, so wild forest and its dead
  // appear outside the view even at the widest zoom (docs/02, the view), and the
  // ground can bake every viewed chunk with its neighbours grown: this ring is
  // the only growth there is, since reading never grows (docs/31/05, item 8).
  map.ensureAround(player.gx, player.gy, 4);
  for (const [x, y] of map.takePendingSpawns()) zombies.push(createZombie(x, y));
  // Chunks far behind are dropped and the characters in them sleep with their
  // chunk, back when it grows again (docs/23a, B1, B2). Villagers hold a chunk.
  const inChunk = (e, cx, cy) => {
    const [ex, ey] = map.chunkCoord(Math.round(e.gx), Math.round(e.gy));
    return ex === cx && ey === cy;
  };
  for (const [key, cx, cy] of map.evictFar(player.gx, player.gy, tuning.world.evictChunks, (cx, cy) => villagers.some((v) => inChunk(v, cx, cy)))) {
    const sleeping = [];
    zombies = zombies.filter((z) => !inChunk(z, cx, cy) || (sleeping.push(z), false));
    corpses = corpses.filter((z) => !inChunk(z, cx, cy) || (sleeping.push(z), false));
    map.sleep(key, sleeping);
  }
  for (const ch of map.takeWoken()) (ch.dead ? corpses : zombies).push(ch);
  // The ground: re-bake what changed in view, bake one chunk ahead, evict far ones (docs/15).
  if (!glError) ground.update(camera.cam.gx, camera.cam.gy, tiles);
  // Placement first: its ghost follows the cursor and a left click that
  // places is spent before anything else can use it (docs/13).
  placement.update(player);
  if (buildPalette.isOpen()) {
    if (player.carrying || panel.isOpen()) buildPalette.close();
    else buildPalette.render(player);
  }
  // A left click is placement's if it takes it, else a swing (docs/14), made
  // after the player has turned to the cursor this step.
  buttons.update(dt);
  let clicked = input.mouseLeftPressed() && !menu.tookClick();
  // With the hand cursor, the zombie hand over one of the dead (ui/cursor.js).
  const under = interact.characterAt(input.getMouse().x, input.getMouse().y);
  cursor.setOverDead(!!under && under.kind === "zombie" && !under.dead);
  // Use mode (use.js): the label names what is under the cursor, and a left click on the world is the target, spent here.
  if (use.isActive()) {
    const target = useTargetAt(input.getMouse().x, input.getMouse().y);
    use.hover(target);
    if (clicked && !panel.isOpen()) {
      use.apply(target, player);
      clicked = false;
    }
  }
  const clickSpent = clicked && placement.tryConfirm(player);
  handleMouse();
  interact.updateInteract(player, dt);
  updatePlayer(player, dt);
  bleed.update(player, dt);
  // The mouse and the keys, as a snapshot, to the player's controller (docs/23a, D1; never the input module).
  controlPlayer(player, zombies, dt, {
    clicked,
    clickSpent,
    mouse: input.getMouse(),
    leftDown: input.mouseLeftDown(),
    altPressed: buttons.alt.pressed,
    altDown: buttons.alt.down,
    offDown: buttons.off.down,
    space: input.wasPressed("Space"),
    blocked: panel.isOpen() || menu.isMenuOpen(),
  });
  archery.update(dt);
  others = [player, ...zombies, ...villagers]; // the living, who block and are hunted
  const everyone = [...others, ...corpses]; // and the fallen, who burn and are drawn
  burning.update(dt, everyone); // the burning, a visual (docs/05)
  progress = interact.updateAction(player, dt);
  // The dead far from the player stand still: a stand-in for the records of
  // docs/03 until that milestone.
  // Anyone walking through a crop or a mushroom sets it swaying (Michael, 2026-10-12).
  interact.brushThrough(player);
  for (const z of zombies) {
    if (!nearPlayer(z)) continue;
    updateZombie(z, dt, player, others, villagers);
    interact.brushThrough(z);
  }
  for (const v of villagers) {
    if (!nearPlayer(v)) continue;
    updateVillager(v, dt, others);
    interact.brushThrough(v);
  }
  // Villagers bitten through get up as the dead, in what they wore (docs/19).
  if (villagers.some((v) => v.dead)) {
    for (const v of villagers) if (v.dead) zombies.push(turnVillager(v));
    villagers = villagers.filter((v) => !v.dead);
  }
  // The fallen leave the thinking list (docs/23a, B1): a corpse is drawn and looted, never iterated by the AI.
  if (zombies.some((z) => z.dead)) {
    corpses.push(...zombies.filter((z) => z.dead));
    zombies = zombies.filter((z) => !z.dead);
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
  // The light you carry (docs/02): a torch in hand at full, two at more,
  // else one on the belt at half. The strength also scales how far the dead
  // see the flame (zombie.js).
  const held = items.heldFire(player.hands);
  const twoHanded = held && player.hands.main && player.hands.off && player.hands.main !== player.hands.off && items.getItem(player.hands.main.id).fire && items.getItem(player.hands.off.id).fire;
  const belted = held ? null : beltFire(inventory.beltOf(player));
  const fire = held || belted;
  const strength = held ? (twoHanded ? tuning.world.twoTorches : 1) : tuning.world.beltLight;
  light.setCarrier(fire ? { gx: player.gx, gy: player.gy, radius: fire.radius * strength, flicker: fire.flicker || null, strength } : null);
  light.setBurners(burning.lights(everyone));
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
  // Who the next swing would hit, flagged for the renderer's outline (docs/14).
  combat.markTargets(player, zombies, settings.get("showSwingTargets"));
  updateInventoryUi();
  refreshFigure();
}

let squareTiles = [];
function applySquareSurface() {
  const floor = settings.get("squareSurface") === "dirt" ? "floor_dirt" : "floor_cobble";
  for (const [x, y] of squareTiles) map.setFloor(x, y, floor);
}

function groundLine() {
  const s = ground.stats();
  return `${s.baked} baked, last ${s.lastMs.toFixed(1)}ms, max ${s.maxMs.toFixed(1)}ms, ${s.textures} textures, ${s.syncBakes} at draw`;
}

// The interface, every frame rather than every step (docs/23a, F): it follows
// the camera and a resize while paused, and its cost is not the step's. What it
// ticks (a bubble's life, the message's fade) ticks on sim time, so it freezes
// with the sim.
function renderUi() {
  const now = loop.simTime();
  const dt = now - uiSimTime;
  uiSimTime = now;
  panel.renderInventoryPanel(player, inventory.bagOf(player), openBag ? openBag.bag : null, inventory.beltOf(player));
  updateHud({ player });
  updatePrompt(interact.promptFor(player, progress), progress);
  updateZombieBars(zombies, visible, player);
  updateSwingTimer(player);
  updateSpeech(others, visible, player, dt);
  updateMessage(dt);
}

function render() {
  const r0 = performance.now();
  const scene = {
    w: V.w,
    h: V.h,
    tiles,
    visible,
    entities: [player, ...zombies, ...villagers, ...corpses],
    arrows: archery.arrowsInFlight(),
    fire: burning.all(),
    marker: archery.getMarker(),
    playerRoom,
    player,
    camera: camera.cam,
    drawAll,
    fog: !drawAll,
    ghost: placement.ghost(),
    hitShapes: combat.overlays(player, zombies, settings.get("showHitShapes")),
    // The tile grid shows only while building or removing (docs/15).
    grid: placement.state.kind === "build" || placement.state.kind === "remove",
  };
  if (!glError) drawn = renderScene(scene);
  timing.render = performance.now() - r0;
  renderUi();
  const [cx, cy] = map.chunkCoord(Math.round(player.gx), Math.round(player.gy));
  const hand = (e) => (e ? e.id : "-");
  debugEl.textContent =
    `fps ${loop.getFps()}\n` +
    `player ${player.gx.toFixed(2)},${player.gy.toFixed(2)} ${player.facing} hp ${Math.ceil(player.hp)} hunger ${Math.round(player.hunger)} thirst ${Math.round(player.thirst)}\n` +
    `${clock.getLabel()} ${clock.getPhase()}  bright ${clock.getBrightness().toFixed(2)}  light@player ${light.lightAt(player.gx, player.gy).toFixed(2)}  hands ${hand(player.hands.main)}/${hand(player.hands.off)}  guard ${combat.shieldOf(player) ? (player.blocking ? "UP" : "ready") : "no shield"}\n` +
    `chunk ${cx},${cy}  room ${playerRoom}${playerRoom > 0 ? (map.roomSealed(map.getRoom(playerRoom)) ? " sealed" : " open") : ""}  rooms ${map.roomCount()}  sources ${light.sources().length} (${light.sources().filter((s) => s.kind === "portal").length} portals)\n` +
    `tiles ${tiles.length} visible ${visible.size} drawables ${drawn}  step ${timing.step.toFixed(1)}ms max3s ${timing.stepMax.toFixed(1)}ms vis ${timing.vis.toFixed(1)}ms render ${(timing.render || 0).toFixed(1)}ms\n` +
    `ground ${groundLine()}\n` +
    `villagers ${villagers.length}  zombies ${zombies.length}  corpses ${corpses.length}  chunks ${map.chunkCount()}  near ${zombies.filter(nearPlayer).length}  ${zombies.slice(0, 6).map((z) => z.state).join(" ")}\n` +
    `Tab: bag   C: character   1-4: belt   N: build   X: remove   Z: zoom   right-click: actions   Esc: close or pause   E: nearest   T: torch   B: boards   V: ${drawAll ? "all" : "fog"}   ] [: hour   L: debug ${["off", "light", "ambient", "fog"][night.debug]}${glError ? `   WebGL2 unavailable: ${glError}` : ""}`;
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

// Forty of the dead standing about the open ground of the square, the same places every
// time (a small generator, not Math.random), at least five tiles from where you start.
function addTestingDead(spawn) {
  let seed = 90210;
  const rand = () => ((seed = (Math.imul(seed, 1103515245) + 12345) >>> 0) / 4294967296);
  const placed = [];
  for (let tries = 0; tries < 4000 && placed.length < 40; tries++) {
    const x = 1 + Math.floor(rand() * 30);
    const y = 1 + Math.floor(rand() * 30);
    if (!map.isWalkableTile(x, y) || map.tileAt(x, y).room > 0) continue;
    if (Math.hypot(x - spawn[0], y - spawn[1]) < 5) continue;
    if (placed.some(([px, py]) => Math.hypot(px - x, py - y) < 2)) continue;
    placed.push([x, y]);
    zombies.push(createZombie(x, y));
  }
}

// Inside the box of tiles around the player where the dead and villagers think.
function nearPlayer(e) {
  return Math.abs(e.gx - player.gx) <= tuning.world.activeTiles && Math.abs(e.gy - player.gy) <= tuning.world.activeTiles;
}

// A file that may be missing: null instead of a failed boot (combat.json and
// poses.json have built-in numbers behind them).
async function optionalJson(path) {
  try {
    return await assets.loadJson(path);
  } catch (err) {
    console.warn(`No ${path}; using the built-in numbers:`, err.message);
    return null;
  }
}

// Boot is a plan of stages run behind the loading screen (docs/23, step 1;
// src/boot.js): each names what it does, moves the bar, fails naming its file,
// and is timed on window.__boot. Everything the manifest lists is loaded and
// everything that can be baked is baked here, so nothing bakes in play.
async function boot() {
  input.init(canvas);
  settings.load();
  view.init(canvas, ui);
  applyDebugCorner();
  settings.onChange((key) => {
    if (key === "debugCorner") applyDebugCorner();
  });
  // Combat testing (docs/21, read at load): no trees, anywhere, so nothing stands between a
  // blow or a shot and its target; the dead are added once the rooms are known.
  const combatTesting = !!settings.get("combatTesting");
  let json = null;

  await shell.run([
    { name: "manifest", label: "Reading the manifest", weight: 1, async run() {
      assets.setManifest(await assets.loadJson("data/manifest.json"));
    } },
    { name: "data", label: "Reading the data", weight: 2, async run() {
      const [itemsJson, buildJson, combatJson, posesJson, lootJson, wardrobesJson, interactionsJson] = await Promise.all([
        assets.loadJson("data/items.json"),
        assets.loadJson("data/build.json"),
        optionalJson("data/combat.json"),
        optionalJson("data/poses.json"),
        assets.loadJson("data/loot.json"),
        assets.loadJson("data/wardrobes.json"),
        optionalJson("data/interactions.json"),
      ]);
      interactions.load(interactionsJson); // anything on anything (docs/30, law 2)
      stations.loadRecipes(await optionalJson("data/recipes.json")); // the stations' recipes (docs/30, section 6)
      tuning.load(await optionalJson("data/tuning.json")); // the entities' numbers (docs/23a, D9)
      items.loadItems(itemsJson);
      placement.setBuildData(buildJson);
      if (combatJson) combat.setCombatData(combatJson); // the fists' and the shove's numbers (docs/14); the weapons' are on their items
      if (posesJson) figure.setPoses(posesJson); // the swing's keyframes, as data Michael can edit (docs/14)
      items.loadLoot(lootJson);
      figure.setArtResolver((id) => items.getItem(id).art || null);
      figure.setWardrobes(wardrobesJson); // who wears what (docs/19)
    } },
    // Every sprite definition and every picture in the manifest, not only what the map names.
    { name: "art", label: "Loading the art", weight: 10, run: (progress) => assets.loadAll(progress) },
    { name: "layers", label: "Reading the painted layers", weight: 1, run: () => loadPaintedHair() },
    { name: "map", label: "Reading the map", weight: 1, async run() {
      json = await assets.loadJson(MAP_FILE);
      if (combatTesting) {
        json.scatter = [];
        if (json.wild) json.wild = { ...json.wild, density: [0, 0] };
      }
      // Everything is loaded already; this adds the two-tile variants, and a name the manifest lacks fails here with its id.
      await assets.loadMapSprites(json);
      for (const k of placement.buildKinds()) await assets.loadSprite(k.sprite); // what can be built must be drawable
    } },
    // Every outfit the wardrobes can produce is baked now, one per frame so the bar moves, so no one is baked when first seen.
    { name: "figures", label: "Dressing everyone", weight: 6, async run(progress) {
      assets.registerSheet("arrow", archery.generateArrow()); // the bow's arrow, flying and landed (docs/20)
      assets.registerSheet("spear", archery.generateSpear()); // the thrown spear
      assets.registerSheet("burn", burning.generateSheet()); // flames, embers, and smoke on a burning figure (docs/05)
      const nZ = figure.wardrobeCount("zombie");
      const nV = figure.wardrobeCount("village");
      let n = 0;
      for (let k = 0; k < nZ; k++) {
        wardrobeInto(createCharacter("zombie", 0, 0), "zombie", k); // what createZombie does, for the sheet alone
        progress(++n / (nZ + nV));
        await shell.nextFrame();
      }
      for (let k = 0; k < nV; k++) {
        createVillager(0, 0, { id: "bake", wardrobe: k });
        progress(++n / (nZ + nV));
        await shell.nextFrame();
      }
    } },
    // The held art, generated like everything else (docs/12); drawn items come from a picture and a grip pixel.
    { name: "held", label: "Making the held things", weight: 2, async run(progress) {
      const held = items.allItems().filter((def) => def.held);
      for (let i = 0; i < held.length; i++) {
        const def = held[i];
        if (def.held.image || def.held.angles) assets.registerSheet(`held_${def.id}`, await assets.heldSheetFromImage(def.held));
        else assets.registerSheet(`held_${def.id}`, figure.generateHeld(def.held.shape, def.held.colours, def.held.size));
        progress((i + 1) / held.length);
      }
      for (const def of items.allItems()) if (def.shield) assets.registerSheet("held_shield_guard", figure.generateHeld("shield_guard", def.held.colours)); // the raised guard (docs/21)
    } },
    { name: "world", label: "Growing the world", weight: 1, async run() {
      rng.seed(json.seed ?? 1); // the sim's one generator, seeded from the map (docs/23a, C1)
      world.reset(json.idCounter || 0); // the world's time scale and id counter (docs/30 step 2; docs/31/08)
      info = map.loadMap(json);
      map.ensureAround(info.spawn[0], info.spawn[1], 4); // reading never grows (docs/31/05, item 8): the ring first
      // The dev chest by the spawn, a setting rather than a thing in the map (docs/30 step 0).
      if (settings.get("devChest")) {
        const at = map.nearestWalkable(info.spawn[0] + 1, info.spawn[1] + 2, (x, y) => !!map.tileAt(x, y).prop || (x === info.spawn[0] && y === info.spawn[1]));
        if (at) map.placeProp(map.createProp({ sprite: "dev_chest", tile: at }), at[0], at[1]);
      }
      player = createPlayer(info.spawn[0], info.spawn[1]);
      player.look = { ...figure.DEFAULT_LOOK, hairStyle: settings.get("hairStyle") || "short" };
      giveStarterKit();
      refreshFigure();
      zombies = info.zombies.map(([x, y]) => createZombie(x, y));
      villagers = (info.villagers || []).map((v, i) => createVillager(v.tile[0], v.tile[1], { id: `v${i}`, name: v.name, line: v.line, wardrobe: v.wardrobe ?? i }));
      interact.setCharacters(() => [...villagers, ...zombies, ...corpses]);
      archery.setTargets(() => zombies); // what an arrow can hit when it lands (docs/20)
      camera.snapTo(player.gx, player.gy);
      camera.applyOrigin(V.w, V.h);
      map.ensureAround(player.gx, player.gy, 4);
      for (const [x, y] of map.takePendingSpawns()) zombies.push(createZombie(x, y));
      tiles = camera.viewportTiles(V.w, V.h);
      map.rebuildRooms();
      if (combatTesting) addTestingDead(info.spawn);
      // The square and its paths, cobble or dirt by the setting (docs/15, for
      // comparing): the map's features with `group: "square"`.
      squareTiles = [];
      for (const f of json.features || []) {
        if (f.group !== "square") continue;
        const [fx, fy, fw, fh] = f.rect;
        for (let y = fy; y < fy + fh; y++) for (let x = fx; x < fx + fw; x++) squareTiles.push([x, y]);
      }
      applySquareSurface();
      settings.onChange((key) => {
        if (key === "squareSurface") applySquareSurface();
      });
      // The light's sources, its cache for the chunks around the spawn, and the
      // first sight, so the first frame is warm and the village behind the title
      // is seen as the player sees it rather than all fog.
      light.update();
      for (const [cx, cy] of ground.prebakeTargets(tiles)) light.chunkLight(cx, cy);
      visible = visibility.computeVisible(Math.round(player.gx), Math.round(player.gy), tiles);
    } },
    // The ground's pictures for the view and a ring around it (docs/15), two per frame.
    { name: "ground", label: "Baking the ground", weight: 6, async run(progress) {
      if (glError) return;
      await ground.init(json);
      map.onGroundChange(ground.invalidate);
      const targets = ground.prebakeTargets(tiles);
      for (let i = 0; i < targets.length; i++) {
        const [cx, cy] = targets[i];
        if (!ground.textureFor(cx, cy)) ground.bakeNow(cx, cy);
        progress((i + 1) / targets.length);
        if (i % 2 === 1) await shell.nextFrame();
      }
    } },
    // Every sheet into the atlas now, so its one full upload happens here, not at the first sight of a thing.
    { name: "atlas", label: "Packing the atlas", weight: 1, async run() {
      if (glError) return;
      // Tallest first: the atlas packs in shelves, and a figure sheet (768 x 576) beside
      // small sprites wastes a shelf's height (94 percent full in registration order, 2026-10-12).
      const unseen = ground.sheetIds(); // read by the bake, never drawn
      unseen.add("zombie"); // the dead draw their shared outfit sheets, never the definition's generated body
      const sheets = assets.allSheets().filter((s) => !unseen.has(s.id)).sort((a, b) => b.image.height - a.image.height);
      for (const sheet of sheets) gl.placeSheet(sheet);
    } },
    { name: "ui", label: "Setting the table", weight: 1, async run() {
      kit.apply(); // the stone, the well, and the button as CSS, before any panel is built (docs/23, step 4)
      cursor.init();
      log.initLog(); // before anything can show a message
      use.init();
      stationPanel.initStationPanel(() => player);
      initHud();
      initPrompt();
      initZombieBars();
      initSwingTimer();
      initSpeech();
      menu.initContextMenu();
      handlers = createInventoryActions(() => player);
      panel.initInventoryPanel(handlers);
      placement.init({ startAction: interact.startAction });
      buildPalette.initBuildPalette({
        onPick: (what) => {
          buildPalette.close();
          if (what === "__remove") placement.beginRemove();
          else placement.beginBuild(what);
        },
      });
      // Any screen up means the game is paused; the title is up at boot.
      screens.initScreens({
        onChange: (name) => setPaused(!!name),
        onReload: () => window.location.reload(),
        hair: {
          styles: () => figure.hairStyles(),
          current: () => player.look.hairStyle,
          set: (name) => { player.look.hairStyle = name; settings.set("hairStyle", name); refreshFigure(); },
          reload: async () => { await loadPaintedHair(); refreshFigure(); },
        },
        // Painted layers to try on, per slot, regardless of what is worn (docs/12).
        layers: {
          slots: () => ["body", "head", "beard", "chest", "waist", "legs", "hands", "feet"],
          names: (slot) => figure.layerNames(slot),
          current: (slot) => (settings.get("paintedLayers") || {})[slot] || null,
          set: (slot, name) => {
            const next = { ...(settings.get("paintedLayers") || {}) };
            if (name) next[slot] = name; else delete next[slot];
            settings.set("paintedLayers", next);
            refreshFigure();
          },
        },
      });
      events.on("playerHit", ({ zombie, damage }) => {
        const taken = combat.exposedTo(player, zombie, combat.guardAgainst(player, zombie, damage));
        damagePlayer(player, taken);
        // A bite that landed may infect (a marker only for now, docs/02 question 29b).
        const opened = bleed.onBite(player, taken); // and a wound that bleeds (docs/02 question 29b)
        if (infection.onBite(player, taken)) showMessage("The bite broke the skin.");
        else if (opened && bleed.stacks(player) === 1) showMessage("You are bleeding. A bandage will stop it.");
      });
      // A blow met by the shield: sparks where they meet and a flash of the shield; a broken guard flashes red (docs/21).
      events.on("blocked", ({ zombie }) => {
        player.blockFlash = 0.14;
        player.flashBroken = false;
        const d = iso.normalize(zombie.gx - player.gx, zombie.gy - player.gy);
        burning.spark(player.gx + d.x * 0.45, player.gy + d.y * 0.45, 22);
      });
      events.on("guardBroken", () => {
        player.blockFlash = 0.35;
        player.flashBroken = true;
      });
      events.on("villagerHit", ({ villager, damage }) => damageVillager(villager, damage));
      // Sleep and fire say what happened (docs/30 step 2): the world's events, shown here.
      events.on("sleepStart", () => showMessage("You lie down. The night goes on without you."));
      events.on("sleepEnd", ({ hours }) => showMessage(`${clock.getLabel()}. You slept ${hours} hours.`, 4));
      events.on("fireOut", ({ tile }) => {
        if (Math.hypot(tile[0] - player.gx, tile[1] - player.gy) <= 8) showMessage("A fire has gone out.");
      });
      // A craft done and a weapon worn out (docs/30, sections 5.2 and 6).
      events.on("craftDone", ({ out, tile }) => {
        if (Math.hypot(tile[0] - player.gx, tile[1] - player.gy) <= 12) log.push(`Made ${out.prop ? out.prop.replace(/_/g, " ") : `${out.count > 1 ? `${out.count} ` : ""}${items.getItem(out.id).name.toLowerCase()}`}.`, "result");
      });
      events.on("weaponBroke", ({ item }) => showMessage(`Your ${items.getItem(item).name.toLowerCase()} is spent.`, 3));
      events.on("containerOpened", ({ bag, tiles: where, name, corpse, closeDist }) => {
        openBag = { bag, tiles: where, name, corpse: corpse || null, closeDist: closeDist || 0 };
        panel.setBagOpen(true);
      });
      // After the menu's own listener, so a menu closed by Escape is seen first.
      window.addEventListener("keydown", (e) => {
        if (e.code === "Escape") handleEscape();
      });
      // A sprite saved by the tool in another tab shows here at once (docs/23, step 3f).
      try {
        new BroadcastChannel("cmz").onmessage = async (e) => {
          if (!e.data || e.data.type !== "sheet") return;
          await assets.reloadSheet(e.data.id);
          if (ground.sheetIds().has(e.data.id)) await ground.reload();
          if (e.data.id === "ui_kit") kit.apply();
          showMessage(`Reloaded ${e.data.id}.`);
        };
      } catch {
        // no BroadcastChannel: the hard refresh is the loop
      }
    } },
  ]);

  loop.start({ update, render, crash: shell.crash });
  screens.show("title");
  await shell.finish(); // the screen goes once the first frame is under it

  window.__game = createDevApi({
    get player() { return player; },
    get zombies() { return zombies; },
    get corpses() { return corpses; },
    get villagers() { return villagers; },
    get tiles() { return tiles; },
    get visible() { return visible; },
    get playerRoom() { return playerRoom; },
    get info() { return info; },
    get openBag() { return openBag; },
    get handlers() { return handlers; },
    get timing() { return timing; },
    get drawn() { return drawn; },
    setPaused,
    refreshFigure,
  });
}

boot().catch((err) => {
  console.error(err);
  debugEl.textContent = `boot failed: ${err.message}`;
});
