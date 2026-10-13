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
import { createPlayer, damagePlayer, eat, drink, aimOrigin } from "./entities/player.js";
import { createZombie } from "./entities/zombie.js";
import { createVillager, damageVillager } from "./entities/villager.js";
import { initHud, updateHud } from "./ui/hud.js";
import { initPrompt, updatePrompt, showMessage, updateMessage, setMessageSink } from "./ui/prompt.js";
import { initZombieBars, updateZombieBars } from "./ui/zombie-bars.js";
import { initSwingTimer, updateSwingTimer } from "./ui/swing-timer.js";
import { initSpeech, updateSpeech } from "./ui/speech.js";
import * as archery from "./archery.js";
import * as burning from "./fire.js";
import * as infection from "./infection.js";
import * as bleed from "./bleed.js";
import * as buttons from "./buttons.js";
import { refreshCorpse, createCharacter, wardrobeInto, say } from "./entities/character.js";
import * as menu from "./ui/context-menu.js";
import * as panel from "./ui/inventory-panel.js";
import * as kit from "./ui/kit.js";
import * as cursor from "./ui/cursor.js";
import * as log from "./ui/log.js";
import { initNames, updateNames } from "./ui/names.js";
import * as use from "./use.js";
import * as interactions from "./interactions.js";
import * as world from "./world.js";
import * as game from "./game.js";
import * as save from "./save.js";
import * as net from "./net.js";
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
import { createDevApi } from "./dev.js";
import { createInventoryActions, createRemoteInventoryActions, performItemCommand, performUseCommand } from "./ui/inventory-actions.js";
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

// The world's state (the player, the dead, the villagers, the map's info) is
// game.js's; this file is the client: the view, the keys, the panels (docs/31/05, item 17).
const S = game.state;
let uiSimTime = 0; // the sim time the interface was last ticked to (docs/23a, F)
let started = false; // Play or Continue pressed: the autosave runs only after, and never while dead (save.js)
let urlLag = null; // `?lag=` for a join opened later from the Join screen

// What the title shows: the slot's save, and whether the character screen comes first.
function titleData() {
  const slot = save.read(MAP_NAME);
  return { save: slot, saveLabel: slot ? save.label(slot) : "", needsCharacter: !hasIdentity() || !!(slot && slot.dead) };
}
let lastAutosave = 0; // sim seconds at the last autosave
const AUTOSAVE = 60; // seconds of game time between autosaves (the parent's cadence)
let mapJson = null; // the map file, kept for a restore
let looksJson = null; // the character screen's palettes (data/looks.json)

// ---- the identity (docs/12, the creation screen; docs/31/03): who I am, kept in the browser ----
// The look the player is baked from: DEFAULT_LOOK under the chosen colours and style
// (settings.look; hairStyle mirrored in settings.hairStyle for what reads it).
function myLook() {
  const chosen = settings.get("look") || {};
  return { ...figure.DEFAULT_LOOK, ...chosen, hairStyle: chosen.hairStyle || settings.get("hairStyle") || "short" };
}

// Anything chosen yet: the first Play opens the character screen until then.
function hasIdentity() {
  return !!(settings.get("identityChosen") || settings.get("playerName") || Object.keys(settings.get("look") || {}).length);
}

// The identity's shape is { name, look } (docs/31/03), `look` exactly what game.create and
// game.addPlayer take; a change goes to the settings, onto the player at once, and to the wire.
function applyIdentity({ name, look } = {}) {
  if (name !== undefined) settings.set("playerName", name || "");
  if (look) {
    const next = { ...(settings.get("look") || {}), ...look };
    settings.set("look", next);
    if (look.hairStyle) settings.set("hairStyle", look.hairStyle);
  }
  if (S.player) {
    S.player.name = settings.get("playerName") || null;
    S.player.look = myLook();
    refreshFigure();
  }
  if (typeof net.setIdentity === "function") net.setIdentity({ name: settings.get("playerName") || null, look: myLook() }); // the wire's copy (docs/31/03), once the wire has one
}
let tiles = [];
let visible = new Set();
let playerRoom = 0;
let drawAll = false; // debug: V shows everything, fog off
let drawn = 0;
let visKey = null; // player tile and camera tile the visible set was computed for
let openBag = null; // { bag, tiles, name, corpse?, closeDist? }: the container open beside yours
let corpseWatch = null; // the body whose grid is open: redrawn as things leave it, once more when it closes
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
    if (archery.drawState(S.player)) {
      archery.cancelDraw(S.player);
      buttons.spendTap();
    } else if (use.cancel()) {
      // A right click in Use mode puts the thing down (use.js).
    } else {
      openActionsMenu(tap);
    }
  }
  menu.tookClick();
  if (menu.isMenuOpen() && S.player.moving) menu.closeContextMenu();
}

function openActionsMenu(m) {
  // A mushroom or a rock wiggles; the menu still opens if it has actions
  // other than walking there (none yet; question 27).
  const poked = interact.pokeAt(m.x, m.y, S.player);
  let actions = interact.actionsAt(m.x, m.y, S.player);
  if (poked) {
    // The thing clicked offers its own actions (a tree: Chop down), once each.
    actions = actions.filter((a) => a.kind !== "walk" && !/^Walk/.test(a.label || ""));
    for (const a of interact.actionsForProp(poked, S.player)) if (!actions.some((b) => b.label === a.label)) actions.push(a);
  }
  // A guest's choice goes to the host by its address and label (net.js, docs/31/05 item 10); the host walks
  // the guest's player there and performs it. Building stays this client's own until it is a command too.
  const guest = net.isGuest();
  const entries = actions.map((a) => ({ label: a.label, enabled: a.enabled, onSelect: () => (guest ? net.sendAct(a.target, a.label) : interact.runAction(S.player, a)) }));
  // Build is in every menu, in case the key is forgotten (Michael, 2026-10-12).
  entries.push({ label: "Build", enabled: !guest && !S.player.carrying && !panel.isOpen(), onSelect: toggleBuild });
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
// A screen pauses the world only in a game played alone. On the wire, as a host or a guest,
// the world never pauses (Michael, 2026-10-13, Zomboid's way): the menu is this client's own,
// over a running world, and its player stands still while it is up (the idle snapshot below).
function setPaused(v) {
  loop.setPaused(v && !net.onTheWire());
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
  if (S.player.carrying) return showMessage("Your hands are full.");
  if (panel.isOpen()) return;
  buildPalette.openPalette(S.player);
}

// X: the removal tool, or out of it if in it. Same limits as N.
function toggleRemove() {
  if (placement.state.kind === "remove") {
    placement.cancel();
    return;
  }
  if (S.player.carrying) return showMessage("Your hands are full.");
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
  if (S.player.carrying) {
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
    if (inventory.bagOf(S.player)) panel.toggleBag();
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
    const belt = inventory.beltOf(S.player);
    const e = belt && belt[i];
    const def = e && items.getItem(e.id);
    if (def && !def.hands && (def.kind === "food" || def.capacity)) {
      if (def.kind === "food") {
        eat(S.player, def);
        e.count -= 1;
        if (e.count <= 0) belt[i] = null;
      } else if ((e.fill ?? 0) > 0) drink(S.player, e);
      else showMessage("It is empty.");
      continue;
    }
    const r = inventory.beltKey(S.player, i);
    if (r === "nobelt") showMessage("No belt, or no such slot.");
    else if (r === "handsfull") showMessage("Your hands are full.");
  }
  if (openBag && openBag.address) {
    // On a guest the replica's objects are new with every frame: the grid is found again by its address.
    const c = interact.containerAt(S.player, openBag.address);
    if (!c) openBag = null;
    else {
      openBag.bag = c.bag;
      openBag.corpse = c.corpse;
    }
  }
  if (openBag) {
    let d = Infinity;
    for (const [tx, ty] of openBag.tiles) d = Math.min(d, Math.hypot(S.player.gx - tx, S.player.gy - ty));
    if (d > (openBag.closeDist || tuning.world.containerCloseDist)) openBag = null; // a station's output reaches as far as its panel
  }
  if (openBag && openBag.corpse) corpseWatch = openBag.corpse;
  if (corpseWatch) {
    refreshCorpse(corpseWatch); // what was taken from its grid comes off its body
    if (!openBag || openBag.corpse !== corpseWatch) corpseWatch = null;
  }
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
// One sheet per player, named by their id and redrawn in place (docs/31/05, item 5): mine
// from my own look and clothes, another player's from theirs as the world reports them.
const figureKeys = new Map(); // player id -> { key, quick }
let figureKey = ""; // kept for loadPaintedHair, which clears the keys
let figureQuick = "";
function refreshFigure(force = false) {
  if (figureKey === "" && figureQuick === "") figureKeys.clear(); // a painted layer reloaded: every sheet again
  figureKey = "-";
  figureQuick = "-";
  for (const p of S.players) refreshFigureOf(p, force);
}
function refreshFigureOf(p, force = false) {
  // The swing's keyframe set follows the weapon in the main hand (docs/14); a spear's throw has its own.
  const style = combat.styleOf(p, !!archery.drawState(p));
  const painted = p === S.player ? settings.get("paintedLayers") || {} : {};
  // What the sheet depends on, as ids: the cheap test every step; the spec and its key only when it changed (docs/23a, B7).
  const quick = JSON.stringify([p.look, p.worn, p.hands, style, painted]);
  const keys = figureKeys.get(p.id) || { key: "", quick: "" };
  if (!force && quick === keys.quick) return; // `force`: the rig's numbers changed from the console (dev.js setLook), which no key sees
  keys.quick = quick;
  figureKeys.set(p.id, keys);
  const spec = figure.characterSpec(figure.characterInputs(p, undefined, painted, style));
  const key = figure.specKey(spec);
  if (!force && key === keys.key) return;
  keys.key = key;
  const id = `player_${p.id}`;
  const sheet = assets.replaceSheet(id, figure.generateFigure(spec));
  gl.placeSheet(sheet); // a new player's sheet into the atlas; an old one is already there
  gl.redrawSheet(sheet);
  p.sprite = id;
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
  // A guest's world is the host's (net.js): nothing here steps it; the keys, the camera, sight,
  // and the ground are still this client's own.
  const guest = net.isGuest();
  // A screen up on the wire: the world runs on, but nothing pressed reaches it or this client's modes.
  const screenUp = !!screens.currentScreen();
  loop.setFreezeAllowed(!net.onTheWire());
  // The world first: the rules, the clock, the fires, the chunks round each player (game.js).
  if (!guest) game.begin(dt);
  if (screenUp) {
    stepWithScreenUp(dt, guest);
    return;
  }
  if (input.wasPressed("KeyV")) drawAll = !drawAll;
  // Enter opens the chat box with the cursor ready; a slash opens it with the slash typed, the hook for commands (Michael, 2026-10-13).
  if (input.wasPressed("Enter") || input.wasPressed("NumpadEnter")) log.focusChat("");
  if (input.wasPressed("Slash")) log.focusChat("/");
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
  stationPanel.update(S.player); // the panel follows the station's queue, which game.begin stepped
  camera.follow(S.player, dt);
  camera.applyOrigin(V.w, V.h);
  // The ground: re-bake what changed in view, bake one chunk ahead, evict far ones (docs/15).
  if (!glError) ground.update(camera.cam.gx, camera.cam.gy, tiles);
  // Placement first: its ghost follows the cursor and a left click that
  // places is spent before anything else can use it (docs/13).
  if (!guest) placement.update(S.player);
  if (buildPalette.isOpen()) {
    if (S.player.carrying || panel.isOpen()) buildPalette.close();
    else buildPalette.render(S.player);
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
      use.apply(target, S.player);
      clicked = false;
    }
  }
  const clickSpent = !guest && clicked && placement.tryConfirm(S.player);
  handleMouse();
  if (!guest) interact.updateInteract(S.player, dt);
  else if (input.wasPressed("KeyE") && !panel.isOpen() && !menu.isMenuOpen()) {
    // A guest's E: the nearest simple action, read off the replica, sent as a command (the hold to climb and
    // the board and torch keys wait for their verbs).
    const a = interact.nearestSimpleAction(S.player);
    if (a && a.target) net.sendAct(a.target, a.label);
  }
  // The world: the player from the mouse and the keys as a snapshot (docs/23a, D1;
  // never the input module), the dead, the villagers, the light (game.js).
  const mouse = input.getMouse();
  const o = aimOrigin(S.player);
  const mySnap = {
    axis: input.moveAxis(),
    sprint: input.isDown("ShiftLeft") || input.isDown("ShiftRight"),
    aim: { x: mouse.x - o.x, y: mouse.y - o.y }, // the cursor relative to the chest, a vector a host can read (net.js)
    aimAt: archery.aimPoint(S.player, mouse), // the ground point the cursor means, for a bow drawn on a host (net.js)
    clicked,
    clickSpent,
    mouse: input.getMouse(),
    leftDown: input.mouseLeftDown(),
    altPressed: buttons.alt.pressed,
    altDown: buttons.alt.down,
    offDown: buttons.off.down,
    space: input.wasPressed("Space"),
    blocked: panel.isOpen() || menu.isMenuOpen(),
  };
  if (guest) net.guestStep(mySnap);
  else {
    game.step(dt, net.hostStep(mySnap, S.player));
    net.hostAfterStep();
  }
  const px = Math.round(S.player.gx);
  const py = Math.round(S.player.gy);
  playerRoom = map.roomAt(px, py); // refinds rooms if a wall changed
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
  combat.markTargets(S.player, S.zombies, settings.get("showSwingTargets"));
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
  panel.renderInventoryPanel(S.player, inventory.bagOf(S.player), openBag ? openBag.bag : null, inventory.beltOf(S.player));
  updateHud({ player: S.player });
  updatePrompt(interact.promptFor(S.player, S.progress), S.progress);
  updateZombieBars(S.zombies, visible, S.player);
  updateSwingTimer(S.player);
  updateSpeech(S.others, visible, S.player, dt);
  updateNames(S.players, visible, S.player);
  updateMessage(dt);
}

// The world put back from a save (game.restore), then everything the client
// holds about it made afresh: the player's sheet, the camera, sight, the ground's
// pictures, the light's cache, the panels and the modes closed.
async function restoreWorld(snap) {
  game.restore(snap, mapJson);
  figureKey = "";
  figureQuick = "";
  refreshFigure(true);
  camera.snapTo(S.player.gx, S.player.gy);
  camera.applyOrigin(V.w, V.h);
  tiles = camera.viewportTiles(V.w, V.h);
  visKey = null;
  openBag = null;
  corpseWatch = null;
  panel.closeAll();
  stationPanel.close();
  placement.cancel();
  use.cancel();
  buildPalette.close();
  light.update();
  if (!glError) ground.invalidateAll();
  visible = visibility.computeVisible(Math.round(S.player.gx), Math.round(S.player.gy), tiles);
  lastAutosave = loop.simTime();
}

async function continueSave() {
  const snap = save.read(MAP_NAME); // the slot is per map (save.js)
  if (!snap || snap.dead) return;
  await restoreWorld(snap);
  screens.hide();
  showMessage(`${clock.getLabel()}. Welcome back.`, 3);
}

// The step while a screen is up on the wire: the camera and the world, my player idle, no keys.
function stepWithScreenUp(dt, guest) {
  const player = S.player;
  camera.follow(player, dt);
  camera.applyOrigin(V.w, V.h);
  if (!glError) ground.update(camera.cam.gx, camera.cam.gy, tiles);
  const mySnap = { ...game.idleSnapshot(), idle: true };
  if (guest) net.guestStep(mySnap);
  else {
    game.step(dt, net.hostStep(mySnap, player));
    net.hostAfterStep();
  }
  const px = Math.round(player.gx);
  const py = Math.round(player.gy);
  playerRoom = map.roomAt(px, py);
  const key = `${px},${py}|${Math.round(camera.cam.gx)},${Math.round(camera.cam.gy)}|${map.worldVersion}|${V.w}x${V.h}`;
  if (key !== visKey) {
    tiles = camera.viewportTiles(V.w, V.h);
    visible = visibility.computeVisible(px, py, tiles);
    visKey = key;
  }
  refreshFigure();
}

function render() {
  const r0 = performance.now();
  if (started && !S.player.dead && loop.simTime() - lastAutosave >= AUTOSAVE) events.emit("autosaveTick");
  const scene = {
    w: V.w,
    h: V.h,
    tiles,
    visible,
    entities: [S.player, ...S.zombies, ...S.villagers, ...S.corpses],
    arrows: archery.arrowsInFlight(),
    fire: burning.all(),
    marker: archery.getMarker(S.player),
    playerRoom,
    player: S.player,
    camera: camera.cam,
    drawAll,
    fog: !drawAll,
    ghost: placement.ghost(),
    hitShapes: combat.overlays(S.player, S.zombies, settings.get("showHitShapes")),
    // The tile grid shows only while building or removing (docs/15).
    grid: placement.state.kind === "build" || placement.state.kind === "remove",
  };
  if (!glError) drawn = renderScene(scene);
  timing.render = performance.now() - r0;
  renderUi();
  const [cx, cy] = map.chunkCoord(Math.round(S.player.gx), Math.round(S.player.gy));
  const hand = (e) => (e ? e.id : "-");
  debugEl.textContent =
    `fps ${loop.getFps()}\n` +
    `player ${S.player.gx.toFixed(2)},${S.player.gy.toFixed(2)} ${S.player.facing} hp ${Math.ceil(S.player.hp)} hunger ${Math.round(S.player.hunger)} thirst ${Math.round(S.player.thirst)}\n` +
    `${clock.getLabel()} ${clock.getPhase()}  bright ${clock.getBrightness().toFixed(2)}  light@player ${light.lightAt(S.player.gx, S.player.gy).toFixed(2)}  hands ${hand(S.player.hands.main)}/${hand(S.player.hands.off)}  guard ${combat.shieldOf(S.player) ? (S.player.blocking ? "UP" : "ready") : "no shield"}\n` +
    `chunk ${cx},${cy}  room ${playerRoom}${playerRoom > 0 ? (map.roomSealed(map.getRoom(playerRoom)) ? " sealed" : " open") : ""}  rooms ${map.roomCount()}  sources ${light.sources().length} (${light.sources().filter((s) => s.kind === "portal").length} portals)\n` +
    `tiles ${tiles.length} visible ${visible.size} drawables ${drawn}  step ${timing.step.toFixed(1)}ms max3s ${timing.stepMax.toFixed(1)}ms vis ${timing.vis.toFixed(1)}ms render ${(timing.render || 0).toFixed(1)}ms\n` +
    `ground ${groundLine()}\n` +
    `villagers ${S.villagers.length}  zombies ${S.zombies.length}  corpses ${S.corpses.length}  chunks ${map.chunkCount()}  near ${S.zombies.filter(game.nearPlayer).length}  ${S.zombies.slice(0, 6).map((z) => z.state).join(" ")}\n` +
    `Tab: bag   C: character   1-4: belt   N: build   X: remove   Z: zoom   right-click: actions   Esc: close or pause   E: nearest   T: torch   Enter: chat   B: boards   V: ${drawAll ? "all" : "fog"}   ] [: hour   L: debug ${["off", "light", "ambient", "fog"][night.debug]}${glError ? `   WebGL2 unavailable: ${glError}` : ""}`;
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
      looksJson = await optionalJson("data/looks.json"); // the character screen's palettes (docs/12)
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
      mapJson = json; // kept for a restore (save.js)
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
      // The world itself (game.js): the same calls headless under Node (tools/world.js).
      game.create({
        json,
        look: myLook(),
        name: settings.get("playerName") || null, // the identity's name on the player (docs/31/03)
        devChest: !!settings.get("devChest"),
        combatTesting,
      });
      refreshFigure();
      camera.snapTo(S.player.gx, S.player.gy);
      camera.applyOrigin(V.w, V.h);
      tiles = camera.viewportTiles(V.w, V.h);
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
      visible = visibility.computeVisible(Math.round(S.player.gx), Math.round(S.player.gy), tiles);
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
      log.initLog({
        // The log is the chat (docs/31/03): a line typed is said by my player; a guest's is said on the host.
        onSay: (text) => {
          if (net.isGuest()) net.sendSay(text);
          else say(S.player, text);
        },
      }); // before anything can show a message
      initNames();
      use.init();
      stationPanel.initStationPanel(() => S.player);
      initHud();
      initPrompt();
      initZombieBars();
      initSwingTimer();
      initSpeech();
      menu.initContextMenu();
      // A guest's panel sends commands (docs/31/05, item 9); the open container is found by its address each frame.
      handlers = new URLSearchParams(window.location.search).get("join")
        ? createRemoteInventoryActions(() => S.player, () => openBag, (cmd) => net.sendItem(cmd))
        : createInventoryActions(() => S.player);
      // A guest's Use goes to the host as the pair's addresses (use.setSender; performUseCommand runs it there).
      if (handlers.addressOf) {
        use.setSender((cur, target) => {
          const bagAddr = (bag, kept) => kept || handlers.addressOf(bag);
          const src = cur.from.kind === "slot" ? { kind: "slot", id: cur.from.id } : (a => a && { kind: "bag", bag: a })(bagAddr(cur.from.bag, cur.from.address));
          let addr = null;
          if (target.kind === "item") { const b = handlers.addressOf(target.bag); if (b) addr = { kind: "item", uid: target.entry.uid, bag: b }; }
          else if (target.kind === "prop") addr = { kind: "prop", id: target.prop.id };
          else if (target.kind === "character") addr = { kind: "character", id: target.ch.id };
          else if (target.kind === "tile") addr = { kind: "tile", x: target.x, y: target.y };
          if (src && addr) net.sendUse({ uid: cur.entry.uid, src, target: addr });
        });
      }
      // A host's own drag into a chest marks its chunk, so a guest sees the chest change.
      handlers.changed = () => { if (!net.isGuest() && openBag && openBag.tiles && openBag.tiles[0]) map.markDirty(openBag.tiles[0][0], openBag.tiles[0][1]); };
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
        onChange: (name) => {
          setPaused(!!name);
          if (name === null && !started) {
            started = true; // Play or Continue: from here the world autosaves (a new game over an old save: the old one is gone once the first autosave lands)
            lastAutosave = loop.simTime();
          }
        },
        onReload: () => window.location.reload(),
        onContinue: () => continueSave(),
        // Host and Join (net.js): the screens over the wire's roles (the other session's).
        wire: {
          status: () => net.status(),
          host: () => { if (net.open({ host: net.makeCode() })) showMessage(`Hosting: your code is ${net.status().code}.`, 5); },
          // A guest with nothing chosen yet goes through the character screen first (`ready` is its Done):
          // the join carries the identity, so there is no later moment for it (docs/31/03).
          join: (code, ready = false) => {
            if (!ready && !hasIdentity()) { screens.show("character", { then: "join", code }); return; }
            if (!net.open({ join: code, lag: urlLag })) return;
            screens.hide();
            started = true;
            showMessage(`Joining ${code}…`, 4);
          },
        },
        onSave: () => {
          const ok = save.write(save.snapshot(MAP_NAME));
          showMessage(ok ? "Saved." : "The save could not be written.");
          lastAutosave = loop.simTime();
        },
        hair: {
          styles: () => figure.hairStyles(),
          current: () => S.player.look.hairStyle,
          set: (name) => applyIdentity({ look: { hairStyle: name } }),
          reload: async () => { await loadPaintedHair(); refreshFigure(); },
        },
        // The character screen (docs/12, the creation screen; docs/31/03, the identity): the name and
        // the look, kept in the browser, put on the player at once, and handed to the wire.
        you: {
          name: () => settings.get("playerName") || "",
          setName: (n) => applyIdentity({ name: n }),
          look: () => myLook(),
          setLook: (partial) => applyIdentity({ look: partial }),
          confirm: () => settings.set("identityChosen", true), // Done: whatever is shown is who this is
          styles: () => figure.hairStyles(),
          palette: () => looksJson || { skins: { living: [figure.DEFAULT_LOOK.skin], dead: [] }, hair: [figure.DEFAULT_LOOK.hair], eyes: [figure.DEFAULT_LOOK.eyes] },
          // The figure in what the player wears (the kit's five before the world exists), the hands empty, baked by the game's own code.
          sheet: () => {
            const worn = S.player ? S.player.worn : { chest: { id: "tunic" }, legs: { id: "breeches" }, feet: { id: "boots" }, waist: { id: "belt" }, back: { id: "small_sack" } };
            const spec = figure.characterSpec(figure.characterInputs({ kind: "player", look: myLook(), worn, hands: { main: null, off: null } }, undefined, settings.get("paintedLayers") || {}, null));
            return figure.generateFigure(spec);
          },
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
      // A bite names its victim (docs/31/05, item 18): the wound is theirs; the words are mine alone.
      events.on("playerHit", ({ zombie, damage, victim }) => {
        const p = victim || S.player;
        const taken = combat.exposedTo(p, zombie, combat.guardAgainst(p, zombie, damage));
        damagePlayer(p, taken);
        // A bite that landed may infect (a marker only for now, docs/02 question 29b).
        const opened = bleed.onBite(p, taken); // and a wound that bleeds (docs/02 question 29b)
        const infected = infection.onBite(p, taken);
        if (p !== S.player) return;
        if (infected) showMessage("The bite broke the skin.");
        else if (opened && bleed.stacks(p) === 1) showMessage("You are bleeding. A bandage will stop it.");
      });
      // A blow met by the shield: sparks where they meet and a flash of the shield; a broken guard flashes red (docs/21).
      events.on("blocked", ({ zombie, player: p = S.player }) => {
        p.blockFlash = 0.14;
        p.flashBroken = false;
        const d = iso.normalize(zombie.gx - p.gx, zombie.gy - p.gy);
        burning.spark(p.gx + d.x * 0.45, p.gy + d.y * 0.45, 22);
      });
      // A blow that landed kicks the camera of the client whose player struck (docs/31/05, item 13).
      events.on("kicked", ({ player: p, x, y, seconds }) => {
        if (p === S.player) camera.kick(x, y, seconds);
      });
      events.on("guardBroken", ({ player: p = S.player }) => {
        p.blockFlash = 0.35;
        p.flashBroken = true;
      });
      events.on("villagerHit", ({ villager, damage }) => damageVillager(villager, damage));
      events.on("gameOver", ({ player: p }) => {
        if (p !== S.player) return; // another player's death is theirs to see
        // The world says so (game.js); the client shows it, and the slot keeps the world with the
        // survivor dead, so Continue refuses it until the next survivor exists (docs/31/05, item 34).
        if (started) save.write(save.snapshot(MAP_NAME, { dead: true }));
        screens.show("dead", { when: clock.getLabel() });
      });
      // Sleep and fire say what happened (docs/30 step 2): the world's events, shown here.
      events.on("sleepStart", () => showMessage("You lie down. The night goes on without you."));
      events.on("sleepEnd", ({ hours }) => showMessage(`${clock.getLabel()}. You slept ${hours} hours.`, 4));
      events.on("fireOut", ({ tile }) => {
        if (Math.hypot(tile[0] - S.player.gx, tile[1] - S.player.gy) <= 8) showMessage("A fire has gone out.");
      });
      // A craft done and a weapon worn out (docs/30, sections 5.2 and 6).
      events.on("craftDone", ({ out, tile }) => {
        if (Math.hypot(tile[0] - S.player.gx, tile[1] - S.player.gy) <= 12) log.push(`Made ${out.prop ? out.prop.replace(/_/g, " ") : `${out.count > 1 ? `${out.count} ` : ""}${items.getItem(out.id).name.toLowerCase()}`}.`, "result");
      });
      events.on("weaponBroke", ({ item, who }) => {
        if (who && who !== S.player.id) return; // a guest's weapon wears out on the host (its swing resolves there): the word is theirs, not this screen's
        showMessage(`Your ${items.getItem(item).name.toLowerCase()} is spent.`, 3);
      });
      events.on("containerOpened", ({ bag, tiles: where, name, corpse, closeDist, prop, entry, tile, character }) => {
        // Opened by a guest's player (the acting player, game.js): told to the guest, not shown here.
        const by = game.state.acting;
        if (by && by !== S.player) {
          net.openedFor(by.id, { propId: prop ? prop.id : null, entryUid: entry ? entry.uid : null, tile: tile || null, characterId: character ? character.id : null, tiles: where, name, closeDist: closeDist || 0 });
          return;
        }
        openBag = { bag, tiles: where, name, corpse: corpse || null, closeDist: closeDist || 0 };
        panel.setBagOpen(true);
      });
      // A message said while a guest's player acts goes to the guest's screen, not this one (docs/31/04).
      setMessageSink((text, seconds) => {
        const by = game.state.acting;
        if (!by || by === S.player || !net.isHost()) return false;
        return net.messageTo(by.id, text, seconds);
      });
      // And a log line (the Use mode's result, use.js) the same way.
      log.setSink((text, kind) => {
        const by = game.state.acting;
        if (!by || by === S.player || !net.isHost()) return false;
        return net.logTo(by.id, text, kind);
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

  // The wire (net.js, docs/31/04): `?host=<code>` opens this world to guests on this origin; `?join=<code>`
  // joins one (`&lag=100` adds a delay each way). A guest skips the title: its world arrives from the host.
  const url = new URLSearchParams(window.location.search);
  urlLag = url.get("lag");
  net.setRelay(url.get("relay")); // `?relay=wss://...` for a relay (server/relay.js), `?relay=none` for the two-tab loopback
  const joinCode = url.get("join");
  net.setIdentity({ name: settings.get("playerName") || null, look: myLook() }); // the identity on the wire from boot; applyIdentity keeps it current
  net.init({ host: url.get("host"), join: joinCode && hasIdentity() ? joinCode : null, lag: urlLag }, {
    restore: async (snap, playerId) => {
      await restoreWorld(snap);
      S.player = S.players.find((p) => p.id === playerId) || S.player;
      game.state.player = S.player;
      refreshFigure(true);
      camera.snapTo(S.player.gx, S.player.gy);
    },
    joined: (id) => showMessage(`Joined as ${id}.`, 3),
    message: (text, seconds = 3) => showMessage(text, seconds),
    // A container my player opened on the host: the grid is on my replica's prop, entry, or body, found by
    // its address (interact.containerAt; a station's output is its own bag, docs/30 section 6), again every frame.
    opened: (w) => {
      const c = interact.containerAt(S.player, w);
      if (!c) return;
      openBag = { bag: c.bag, tiles: w.tiles, name: w.name, corpse: c.corpse, closeDist: w.closeDist || 0, address: w };
      panel.setBagOpen(true);
    },
    // A guest's panel command, and its Use, run here as its player (ui/inventory-actions.js).
    item: (p, cmd) => performItemCommand(p, cmd),
    use: (p, cmd) => performUseCommand(p, cmd, (id) => [...S.players, ...S.zombies, ...S.villagers, ...S.corpses].find((c) => c.id === id) || null),
    // A log line said for my player on the host (the Use mode's result).
    log: (text, kind) => log.push(text, kind),
    // The wire gone (net.js dropped): a guest back at the title, told why, the world here untouched; a host told and playing on alone.
    failed: (code, why, role) => {
      const st = net.status();
      const where = st.relay ? `the relay at ${st.relay}` : "another tab of this browser";
      const notes = {
        timeout: st.relay ? `No host answered "${code}". The host may have closed the world, or the code is not quite right.` : `No host answered "${code}". Without a relay the host and its guests must be tabs of one browser.`,
        nohost: `No world is open under "${code}". Check the code with the host.`,
        taken: `The code "${code}" is in use on the relay; open the world again for a new one.`,
        relay: `${where[0].toUpperCase()}${where.slice(1)} could not be reached.`,
        dropped: "The connection to the host dropped.",
        hostLeft: "The host closed the world.",
      };
      const note = notes[why] || `The wire to "${code}" is gone.`;
      if (role === "host") return showMessage(note, 5);
      started = false;
      screens.show("title", { ...titleData(), note });
    },
    chunksChanged: (chunks) => {
      for (const d of chunks) ground.invalidate([[d.cx * map.CHUNK + 8, d.cy * map.CHUNK + 8], [d.cx * map.CHUNK, d.cy * map.CHUNK], [d.cx * map.CHUNK + 15, d.cy * map.CHUNK + 15]]);
    },
  });
  window.addEventListener("pagehide", () => net.leave());
  loop.start({ update, render, crash: shell.crash });
  // The slot's save shows on the title as Continue (save.js); a dead one as a line and New game.
  if (net.isGuest()) {
    started = true;
    showMessage("Joining the host's world…", 4);
  } else {
    screens.show("title", titleData()); // the first game and the next survivor start at the character screen
    if (joinCode) screens.show("character", { then: "join", code: joinCode }); // `?join=` with nothing chosen yet: the character first, Back to the title
  }
  // Autosave: every AUTOSAVE seconds of game time, and when the tab is hidden or left (the parent's rule).
  const autosave = () => {
    if (!started || S.player.dead || net.isGuest()) return; // a guest's world is the host's to save
    save.write(save.snapshot(MAP_NAME));
    lastAutosave = loop.simTime();
  };
  events.on("autosaveTick", autosave);
  document.addEventListener("visibilitychange", () => { if (document.hidden) autosave(); });
  window.addEventListener("pagehide", autosave);
  await shell.finish(); // the screen goes once the first frame is under it

  window.__game = createDevApi({
    get player() { return S.player; },
    get zombies() { return S.zombies; },
    get corpses() { return S.corpses; },
    get villagers() { return S.villagers; },
    get tiles() { return tiles; },
    get visible() { return visible; },
    get playerRoom() { return playerRoom; },
    get info() { return S.info; },
    game,
    save,
    restoreWorld,
    // A second player into this world, for the checks and for the plan (docs/31/03): standing, controlled by nobody.
    net,
    addPlayer: (gx, gy, opts) => {
      const p = game.addPlayer(gx, gy, opts);
      refreshFigureOf(p, true);
      return p;
    },
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
