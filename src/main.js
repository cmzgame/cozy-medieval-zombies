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
import { createPlayer, updatePlayer, damagePlayer, autoWalk, eat, drink } from "./entities/player.js";
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
import { say, refreshCorpse } from "./entities/character.js";
import * as menu from "./ui/context-menu.js";
import * as panel from "./ui/inventory-panel.js";
import * as interact from "./interact.js";
import * as items from "./items.js";
import * as inventory from "./inventory.js";
import * as grid from "./grid.js";
import * as view from "./view.js";
import * as settings from "./settings.js";
import * as screens from "./ui/screens.js";
import * as figure from "./figure.js";
import * as placement from "./placement.js";
import * as combat from "./combat.js";
import * as buildPalette from "./ui/build-palette.js";

const V = view.view; // the world's size in its own pixels, kept current by view.js
const MAP_FILE = "data/maps/square.json";
const ACTIVE_TILES = 40; // the dead beyond this many tiles from the player do not think
const CONTAINER_CLOSE_DIST = 2.0; // tiles: an open container closes when you walk away
const ZOOM_PACE = 0.3; // seconds between wheel steps that count
const BELT_LIGHT = 0.5; // a lit torch on the belt gives this much of its light (docs/02)
const TWO_TORCHES = 1.35; // a torch in each hand: this much of one torch's light, and seen from this much further
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
let villagers = [];
let tiles = [];
let visible = new Set();
let playerRoom = 0;
let drawAll = false; // debug: V shows everything, fog off
let drawn = 0;
let visKey = null; // player tile and camera tile the visible set was computed for
let openBag = null; // { bag, tiles, name, corpse? }: the container open beside yours
let corpseWatch = null; // the body whose grid is open: redrawn as things leave it, once more when it closes
let progress = null; // 0..1 of a timed action
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
  if (actions.length) {
    const u = view.toUi(m.x, m.y);
    menu.openContextMenu(u.x, u.y, actions.map((a) => ({ label: a.label, enabled: a.enabled, onSelect: () => interact.runAction(player, a) })));
  }
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
  if (buildPalette.isOpen()) {
    buildPalette.close();
    return;
  }
  if (placement.cancel()) return;
  if (panel.isOpen()) {
    panel.setOpen(false);
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
  if (openBag && openBag.corpse) corpseWatch = openBag.corpse;
  if (corpseWatch) {
    refreshCorpse(corpseWatch); // what was taken from its grid comes off its body
    if (!openBag || openBag.corpse !== corpseWatch) corpseWatch = null;
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

// Hair painted in tools/hair.html (docs/12): data/hair/index.json lists the
// styles. Reloaded from the settings screen so a style saved a moment ago
// shows without a restart.
async function loadPaintedHair() {
  const folders = [["hair", "data/hair"], ...["head", "chest", "legs", "hands", "feet", "body"].map((s) => [s, `data/layers/${s}`])];
  for (const [slot, folder] of folders) {
    try {
      const idx = await assets.loadJson(`${folder}/index.json`);
      for (const name of idx.styles || []) figure.registerLayer(slot, name, await assets.loadJson(`${folder}/${name}.json`));
    } catch {
      // No such folder yet: nothing painted for this slot.
    }
  }
  figureKey = ""; // the pixels may have changed under the same name
  // The dead and villagers rebake too, since their outfits draw from the painted pool.
  for (const sheet of assets.rebakeFigures()) gl.redrawSheet(sheet);
}

// The player's sheet is rebuilt whenever their look or their clothes change
// (docs/12): a few milliseconds, redrawn into the atlas in place.
let figureKey = "";
function refreshFigure() {
  // The swing's keyframe set follows the weapon in the main hand (docs/14).
  const mainDef = player.hands.main && items.getItem(player.hands.main.id);
  // A spear stabs in the one-handed style and throws in its own; the wind-up of a throw is the throw's.
  const throwing = mainDef && mainDef.thrown && archery.drawState();
  const style = (mainDef && ((throwing && mainDef.thrown.style) || (mainDef.weapon && mainDef.weapon.style) || (mainDef.bow && mainDef.bow.style) || (mainDef.thrown && mainDef.thrown.style))) || null;
  const spec = figure.characterSpec(figure.characterInputs(player, undefined, settings.get("paintedLayers") || {}, style));
  const key = figure.specKey(spec);
  if (key === figureKey) return;
  figureKey = key;
  const sheet = assets.replaceSheet("player", figure.generateFigure(spec));
  gl.redrawSheet(sheet);
}

function update(dt) {
  const t0 = performance.now();
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
  camera.follow(player, dt);
  camera.applyOrigin(V.w, V.h);
  // Grow the world three chunks ahead of the player, so wild forest and its
  // dead appear outside the view even at the widest zoom (docs/02, the view).
  map.ensureAround(player.gx, player.gy, 3);
  for (const [x, y] of map.takePendingSpawns()) zombies.push(createZombie(x, y));
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
  const clicked = input.mouseLeftPressed() && !menu.tookClick();
  const clickSpent = clicked && placement.tryConfirm(player);
  handleMouse();
  interact.updateInteract(player, dt);
  updatePlayer(player, dt);
  bleed.update(player, dt);
  // A left click swings; on a mushroom, a rock, or a tree (its visible pixels)
  // that thing sways too. No meaning yet: an in-world to-do (Michael, 2026-10-11).
  // With a bow in hand the left button is the draw, not a swing or a poke (docs/20).
  // The right button held with a shield in the off hand raises the guard (docs/21): you can
  // still swing, stab, or throw from behind it, for much less damage (the shield's `attackMult`).
  // It is not held through carrying or a climb. It does
  // hold with the bag open (the world goes on while you look in it, and the bag is where weapons
  // are swapped) and a menu open (a press outside the menu closes it).
  const shield = combat.shieldOf(player);
  player.blocking = !!shield && buttons.off.down && !player.carrying && !player.climb && !player.dead;
  const launcher = archery.launcherOf(player);
  const bowHeld = !!launcher && launcher.button === "primary";
  if (clicked && !clickSpent && !bowHeld && !archery.drawState()) {
    interact.pokeAt(input.getMouse().x, input.getMouse().y, player);
    interact.playAt(input.getMouse().x, input.getMouse().y, player); // the well's bucket, for fun
    interact.clickCharacterAt(input.getMouse().x, input.getMouse().y, player); // a villager answers (docs/19)
    combat.swingFromLeft(player, zombies); // one weapon swings; two take turns (docs/21)
  }
  // The bow draws on the left button, a throw on the middle one (or Q); the right button held braces a bow (docs/21).
  const onAlt = !!launcher && launcher.button === "alt";
  // The main hand's other melee mode on the middle button (docs/21): the halberd's thrust.
  if (!onAlt && buttons.alt.pressed && !archery.drawState() && combat.altWeaponOf(player)) combat.tryAttack(player, zombies, "main", "alt");
  const bracing = buttons.off.down && !!launcher && launcher.kind === "bow";
  archery.updateDraw(player, dt, {
    pressed: onAlt ? buttons.alt.pressed : clicked && !clickSpent,
    down: onAlt ? buttons.alt.down : input.mouseLeftDown(),
    brace: bracing,
    mouse: input.getMouse(),
    blocked: panel.isOpen() || menu.isMenuOpen(),
  });
  // One place decides the walking speed: braced slowest, a draw next (docs/21).
  player.moveMult = (bracing ? archery.tunables.braceMove : player.drawing ? archery.tunables.drawSpeed : 1) * (player.blocking ? shield.moveMult : 1);
  if (input.wasPressed("Space")) combat.tryShove(player, zombies);
  combat.updateCombat(player, zombies, dt);
  archery.update(dt);
  burning.update(dt, [player, ...zombies, ...villagers]); // the burning, a visual (docs/05)
  progress = interact.updateAction(player, dt);
  const others = [player, ...zombies, ...villagers];
  // The dead far from the player stand still: a stand-in for the records of
  // docs/03 until that milestone.
  for (const z of zombies) {
    if (Math.abs(z.gx - player.gx) > ACTIVE_TILES || Math.abs(z.gy - player.gy) > ACTIVE_TILES) continue;
    updateZombie(z, dt, player, others, villagers);
  }
  for (const v of villagers) {
    if (Math.abs(v.gx - player.gx) > ACTIVE_TILES || Math.abs(v.gy - player.gy) > ACTIVE_TILES) continue;
    updateVillager(v, dt, others);
  }
  // Villagers bitten through get up as the dead, in what they wore (docs/19).
  if (villagers.some((v) => v.dead)) {
    for (const v of villagers) if (v.dead) zombies.push(turnVillager(v));
    villagers = villagers.filter((v) => !v.dead);
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
  const strength = held ? (twoHanded ? TWO_TORCHES : 1) : BELT_LIGHT;
  light.setCarrier(fire ? { gx: player.gx, gy: player.gy, radius: fire.radius * strength, flicker: fire.flicker || null, strength } : null);
  light.setBurners(burning.lights([player, ...zombies, ...villagers]));
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
  updateHud({ player });
  updatePrompt(interact.promptFor(player, progress), progress);
  updateZombieBars(zombies, visible, player);
  updateSwingTimer(player);
  updateSpeech([player, ...zombies, ...villagers], visible, player, dt);
  updateMessage(dt);
  input.endStep();
  timing.step = performance.now() - t0;
  if (t0 - timing.maxResetAt > 3000) {
    timing.stepMax = 0;
    timing.maxResetAt = t0;
  }
  timing.stepMax = Math.max(timing.stepMax, timing.step);
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

function render() {
  const r0 = performance.now();
  const scene = {
    w: V.w,
    h: V.h,
    tiles,
    visible,
    entities: [player, ...zombies, ...villagers],
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
  const [cx, cy] = map.chunkCoord(Math.round(player.gx), Math.round(player.gy));
  const hand = (e) => (e ? e.id : "-");
  debugEl.textContent =
    `fps ${loop.getFps()}\n` +
    `player ${player.gx.toFixed(2)},${player.gy.toFixed(2)} ${player.facing} hp ${Math.ceil(player.hp)} hunger ${Math.round(player.hunger)} thirst ${Math.round(player.thirst)}\n` +
    `${clock.getLabel()} ${clock.getPhase()}  bright ${clock.getBrightness().toFixed(2)}  light@player ${light.lightAt(player.gx, player.gy).toFixed(2)}  hands ${hand(player.hands.main)}/${hand(player.hands.off)}  guard ${combat.shieldOf(player) ? (player.blocking ? "UP" : "ready") : "no shield"}\n` +
    `chunk ${cx},${cy}  room ${playerRoom}${playerRoom > 0 ? (map.roomSealed(map.getRoom(playerRoom)) ? " sealed" : " open") : ""}  rooms ${map.roomCount()}  sources ${light.sources().length} (${light.sources().filter((s) => s.kind === "portal").length} portals)\n` +
    `tiles ${tiles.length} visible ${visible.size} drawables ${drawn}  step ${timing.step.toFixed(1)}ms max3s ${timing.stepMax.toFixed(1)}ms vis ${timing.vis.toFixed(1)}ms render ${(timing.render || 0).toFixed(1)}ms\n` +
    `ground ${groundLine()}\n` +
    `villagers ${villagers.length}  zombies ${zombies.length}  near ${zombies.filter((z) => Math.abs(z.gx - player.gx) <= ACTIVE_TILES && Math.abs(z.gy - player.gy) <= ACTIVE_TILES).length}  ${zombies.slice(0, 6).map((z) => z.state).join(" ")}\n` +
    `Tab: bag   C: character   1-4: belt   N: build   X: remove   Z: zoom   right-click: actions   Esc: close or pause   E: nearest   T: torch   B: boards   V: ${drawAll ? "all" : "fog"}   ] [: hour   L: debug ${["off", "light", "ambient", "fog"][night.debug]}${glError ? `   WebGL2 unavailable: ${glError}` : ""}`;
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
      // One hand dragged onto the other swaps the two (Michael, 2026-10-12), instead of sending the
      // one in the way to the bag, when each is allowed in the other's hand.
      if (kind === "hand" && from.kind === "hand" && occupant) {
        const fromKey = slotParts(from.id).key;
        const allowed = (e, k) => { const h = items.getItem(e.id).hands; return h === "either" || h === k; };
        if (fromKey !== key && allowed(entry, key) && allowed(occupant, fromKey)) {
          player.hands[fromKey] = occupant;
          player.hands[key] = entry;
          return;
        }
      }
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

async function boot() {
  input.init(canvas);
  settings.load();
  view.init(canvas, ui);
  applyDebugCorner();
  settings.onChange((key) => {
    if (key === "debugCorner") applyDebugCorner();
  });

  items.loadItems(await assets.loadJson("data/items.json"));
  placement.setBuildData(await assets.loadJson("data/build.json"));
  // The fists' and the shove's numbers (docs/14); the weapons' are on their items.
  try {
    combat.setCombatData(await assets.loadJson("data/combat.json"));
  } catch (err) {
    console.warn("No combat.json; using the built-in numbers:", err.message);
  }
  // The swing's keyframes, as data Michael can edit (docs/14); defaults live in figure.js.
  try {
    figure.setPoses(await assets.loadJson("data/poses.json"));
  } catch (err) {
    console.warn("No poses.json; using the built-in swing:", err.message);
  }
  items.loadLoot(await assets.loadJson("data/loot.json"));
  figure.setArtResolver((id) => items.getItem(id).art || null);
  figure.setWardrobes(await assets.loadJson("data/wardrobes.json")); // who wears what (docs/19)
  await loadPaintedHair();
  const json = await assets.loadJson(MAP_FILE);
  // Combat testing (docs/21, read at load): no trees, anywhere, so nothing stands between a
  // blow or a shot and its target; the dead are added once the rooms are known, below.
  const combatTesting = !!settings.get("combatTesting");
  if (combatTesting) {
    json.scatter = [];
    if (json.wild) json.wild = { ...json.wild, density: [0, 0] };
  }
  await assets.loadMapSprites(json);
  for (const k of placement.buildKinds()) await assets.loadSprite(k.sprite); // what can be built must be drawable
  assets.registerSheet("arrow", archery.generateArrow()); // the bow's arrow, flying and landed (docs/20)
  assets.registerSheet("spear", archery.generateSpear()); // the thrown spear
  assets.registerSheet("burn", burning.generateSheet()); // flames, embers, and smoke on a burning figure (docs/05)
  // The held art, generated like everything else (docs/12). The dead's sheets are made as they are dressed (docs/19).
  for (const def of items.allItems()) {
    if (!def.held) continue;
    // Drawn items (the book) come from a picture and a grip pixel; the rest are generated shapes.
    if (def.held.image || def.held.angles) assets.registerSheet(`held_${def.id}`, await assets.heldSheetFromImage(def.held));
    else assets.registerSheet(`held_${def.id}`, figure.generateHeld(def.held.shape, def.held.colours, def.held.size));
  }
  for (const def of items.allItems()) if (def.shield) assets.registerSheet("held_shield_guard", figure.generateHeld("shield_guard", def.held.colours)); // the raised guard (docs/21)
  info = map.loadMap(json);
  player = createPlayer(info.spawn[0], info.spawn[1]);
  player.look = { ...figure.DEFAULT_LOOK, hairStyle: settings.get("hairStyle") || "short" };
  giveStarterKit();
  refreshFigure();
  zombies = info.zombies.map(([x, y]) => createZombie(x, y));
  villagers = (info.villagers || []).map((v, i) => createVillager(v.tile[0], v.tile[1], { id: `v${i}`, name: v.name, line: v.line, wardrobe: v.wardrobe ?? i }));
  interact.setCharacters(() => [...villagers, ...zombies]);
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
  // The ground's pictures for the view and a ring around it, before the
  // first frame (docs/15); the title screen covers the wait.
  if (!glError) {
    await ground.init(json);
    map.onGroundChange(ground.invalidate);
    ground.prebake(tiles);
  }

  initHud();
  initPrompt();
  initZombieBars();
  initSwingTimer();
  initSpeech();
  menu.initContextMenu();
  const handlers = panelHandlers();
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
      slots: () => ["body", "head", "chest", "legs", "hands", "feet"],
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
  events.on("containerOpened", ({ bag, tiles: where, name, corpse }) => {
    openBag = { bag, tiles: where, name, corpse: corpse || null };
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
    bleed: { apply: () => bleed.apply(player), clear: () => bleed.clear(player), stacks: () => bleed.stacks(player), config: bleed.BLEED },
    infection: { infect: () => infection.infect(player), cure: () => infection.cure(player), progress: () => infection.progress(player), config: infection.INFECTION }, // the infection marker (docs/02 question 29b)
    burning, // the fire test (docs/05): burning.tunables, burning.all()
    iso, input, loop, assets, events, map, camera, ground, visibility, interact, clock, light, items, inventory, grid, panel, menu, view, settings, screens, figure, placement, buildPalette, combat, gl,
    render: { night },
    get player() { return player; },
    get zombies() { return zombies; },
    get villagers() { return villagers; },
    // The bow's arc, fired from the console (docs/20, step 1). `dir` is a grid
    // direction [dx, dy], `distance` the full-draw distance in tiles, `c` the draw (0 to 1).
    archery: {
      tunables: archery.tunables,
      flying: archery.arrowsInFlight,
      preview: archery.preview,
      setMarker: archery.setMarker,
      shoot: (dir, distance, c = 1) => archery.shoot(player, dir, distance, c),
      shootAt: (gx, gy, c = 1) => archery.shoot(player, [gx - player.gx, gy - player.gy], Math.hypot(gx - player.gx, gy - player.gy), c),
      markAt: (gx, gy, c = 1) => {
        const p = archery.preview(player, [gx - player.gx, gy - player.gy], Math.hypot(gx - player.gx, gy - player.gy), c);
        archery.setMarker({ from: [player.gx, player.gy], full: p.full, land: p.land });
        return p;
      },
      clearMarker: () => archery.setMarker(null),
      // The draw, for scripts: aim somewhere, press, step the game, release.
      bow: () => archery.bowOf(player),
      setAim: (gx, gy) => archery.setAimOverride(gx == null ? null : [gx, gy]),
      launcher: () => archery.launcherOf(player),
      press: () => archery.beginDraw(player, archery.launcherOf(player), "script"),
      release: () => archery.releaseDraw(player, input.getMouse()),
      cancel: () => archery.cancelDraw(player),
      drawing: archery.drawState,
    },
    say: (text, seconds) => say(player, text, seconds), // a bubble over the player, to test the system (docs/19)
    get tiles() { return tiles; },
    get visible() { return visible; },
    get playerRoom() { return playerRoom; },
    get info() { return info; },
    get openBag() { return openBag; },
    teleport(gx, gy) { player.gx = gx; player.gy = gy; player.auto = null; camera.snapTo(gx, gy); },
    walkTo(gx, gy) { return autoWalk(player, [gx, gy]); },
    setPaused,
    handlers,
    // Customisation from the console until the creation screen: skin, hair, hairStyle (short, long, bald), eyes.
    setLook(partial) { Object.assign(player.look, partial); refreshFigure(); },
    // Put an item in your bag, or at your feet if it does not fit: __game.give("sword").
    give(id, count = 1) {
      const bag = inventory.bagOf(player);
      const added = bag ? inventory.addItem(bag, id, count) : 0;
      if (added < count) map.dropItem(Math.round(player.gx), Math.round(player.gy), { id, count: count - added });
      return added;
    },
    // Every weapon, for testing (docs/21): a Developer Bag put on your back (what you carried
    // moves into it), then a sword, hatchet, mace, halberd, stick, three spears, a shield, a bow, and
    // forty arrows. Nothing else is touched; the torch stays in your hand.
    giveKit() {
      const old = inventory.bagOf(player);
      if (!player.worn.back || player.worn.back.id !== "dev_bag") {
        const dev = { id: "dev_bag", count: 1 };
        const bag = inventory.ensureBag(dev);
        if (old) for (const e of old.items) inventory.addItem(bag, e.id, e.count, e.fill != null ? { fill: e.fill } : {});
        player.worn.back = dev;
      }
      const bag = inventory.bagOf(player);
      const kit = [["sword", 1], ["hatchet", 1], ["mace", 1], ["halberd", 1], ["stick", 1], ["spear", 3], ["shield", 1], ["bow", 1], ["arrow", 40], ["bandage", 5], ["book_of_fire", 1], ["staff_of_fire", 1], ["throwing_knife", 100], ["throwing_axe", 100]];
      const got = {};
      for (const [id, n] of kit) got[id] = inventory.addItem(bag, id, n);
      showMessage("A Developer Bag, with every weapon in it.");
      return got;
    },
    // The Developer Bag, twelve by eight, at your feet (docs/11). Never loot.
    giveDevBag() { map.dropItem(Math.round(player.gx), Math.round(player.gy), { id: "dev_bag", count: 1 }); showMessage("A Developer Bag lies at your feet."); },
  };
}

boot().catch((err) => {
  console.error(err);
  debugEl.textContent = `boot failed: ${err.message}`;
});
