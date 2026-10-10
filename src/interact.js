// Interaction: what can be done to the world (docs/10-interface.md). Rewritten
// on cozy-zombie-game src/interact.js's action shape on 2026-10-10:
//
//   { kind, label, tiles, mx, my, range, duration, enabled, simple, perform() }
//
// `tiles` is where the target is; the player must be within `range` of one of
// them. Right-click builds a menu of every action under the cursor
// (actionsAt); E runs the nearest simple action in range (nearestSimpleAction);
// an action out of range auto-walks the player there first (runAction). Timed
// actions show the prompt's bar and cancel on movement. Items live in slots
// (docs/11): a hand, a worn slot, the belt, the bag on your back, a container,
// or the floor, and every move here takes an entry out of one and puts it in
// another.

import * as iso from "./iso.js";
import * as input from "./input.js";
import * as map from "./map.js";
import { getSheet } from "./assets.js";
import { getItem, hold, release, holding, heldEntry, canHold, handFor, containerGrid, rollLoot } from "./items.js";
import { bagOf, beltOf, ensureBag, countAll, takeAll, findItem, detach, stow, equip, addItem, createBag, waterContainers } from "./inventory.js";
import * as grid from "./grid.js";
import { startClimb, autoWalk, eat, drink } from "./entities/player.js";
import { showMessage } from "./ui/prompt.js";
import { emit } from "./events.js";

export const INTERACT_RANGE = 1.15; // tiles
export const SEARCH_TIME = 1.0;
export const BOARD_TIME = 2.0;
export const PULL_TIME = 1.5;
export const CHOP_TIME = 3.0;
export const DRINK_TIME = 1.5;
export const FILL_TIME = 2.0;
export const HOLD_TIME = 0.35; // seconds of a key that count as a hold

export function distToTiles(player, tiles) {
  let best = Infinity;
  for (const [tx, ty] of tiles) best = Math.min(best, Math.hypot(player.gx - tx, player.gy - ty));
  return best;
}

function act(a) {
  return { range: INTERACT_RANGE, duration: 0, enabled: true, simple: false, ...a };
}

function nameOf(entry) {
  return getItem(entry.id).name;
}

// Put a loose entry somewhere on the player: a free hand if it is holdable,
// else the bag or belt. Returns where it went, or null with a message.
export function takeIn(player, entry) {
  if (canHold(player.hands, entry.id) && entry.count === 1 && hold(player.hands, entry)) return "hand";
  const where = stow(player, entry);
  if (!where) showMessage(bagOf(player) ? "No room in your bag." : "You have no bag.");
  return where;
}

// ---- action builders ----

function itemActions(entry, tx, ty, player) {
  const def = getItem(entry.id);
  const tiles = [[tx, ty]];
  if (def.bag) {
    // A bag on the floor is a container you can also wear (docs/11).
    const bag = ensureBag(entry);
    const out = [act({
      kind: "container",
      simple: true,
      label: `Open ${def.name.toLowerCase()}`,
      tiles,
      mx: tx,
      my: ty,
      perform() {
        emit("containerOpened", { bag, tiles, name: def.name.toLowerCase() });
        return true;
      },
    })];
    const worn = player.worn.back;
    out.push(act({
      kind: "wear",
      label: worn ? `Swap bags (drop your ${nameOf(worn).toLowerCase()})` : `Wear ${def.name.toLowerCase()}`,
      tiles,
      mx: tx,
      my: ty,
      perform() {
        map.takeItem(tx, ty, entry);
        if (player.worn.back) map.dropItem(Math.round(player.gx), Math.round(player.gy), player.worn.back);
        player.worn.back = entry;
        return true;
      },
    }));
    return out;
  }
  const fill = entry.fill != null ? ` (${Math.round(entry.fill)}%)` : "";
  const count = entry.count > 1 ? ` (${entry.count})` : "";
  return [act({
    kind: "item",
    simple: true,
    label: `Pick up ${def.name}${fill}${count}`,
    tiles,
    mx: tx,
    my: ty,
    perform() {
      const bag = bagOf(player);
      if (bag && def.stack) {
        const added = addItem(bag, entry.id, entry.count, entry.fill != null ? { fill: entry.fill } : {});
        if (added <= 0) {
          showMessage("No room in your bag.");
          return false;
        }
        entry.count -= added;
        if (entry.count <= 0) map.takeItem(tx, ty, entry);
        return true;
      }
      map.takeItem(tx, ty, entry);
      if (!takeIn(player, entry)) {
        map.dropItem(tx, ty, entry);
        return false;
      }
      return true;
    },
  })];
}

// A container prop's bag, made on first use from its loot table's grid.
export function propBag(prop) {
  if (!prop.bag) {
    const [cols, rows] = containerGrid(prop.container.loot);
    prop.bag = createBag(cols, rows, prop.sprite.replace(/_/g, " "));
    prop.searched = false;
  }
  return prop.bag;
}

function containerActions(prop) {
  const name = prop.sprite.replace(/_/g, " ");
  return [act({
    kind: "container",
    simple: true,
    label: prop.searched ? `Open ${name}` : `Search ${name}`,
    tiles: prop.tiles,
    mx: prop.tile[0],
    my: prop.tile[1],
    duration: prop.searched ? 0 : SEARCH_TIME,
    perform() {
      const bag = propBag(prop);
      if (!prop.searched) {
        prop.searched = true;
        // Rolled loot is placed into the grid; what does not fit is not spawned.
        if (!bag.items.length) grid.fill(bag, rollLoot(prop.container.loot));
      }
      emit("containerOpened", { bag, tiles: prop.tiles, name });
      return true;
    },
  })];
}

// Hearths and campfires take a log from wherever you have one (docs/07; logs stopped being free with docs/10).
function fireActions(prop, player) {
  const f = prop.fire;
  if (!f || !f.burns) return [];
  const name = prop.sprite.replace(/_/g, " ");
  const logs = countAll(player, "log");
  const full = f.fuel >= f.maxFuel;
  let label;
  if (!f.lit) label = logs ? `Light the ${name}` : `Light the ${name} (need a log)`;
  else if (full) label = `${name}: full (${f.maxFuel}/${f.maxFuel})`;
  else label = logs ? `Add a log (${Math.ceil(f.fuel)}/${f.maxFuel})` : `Add a log (need a log)`;
  return [act({
    kind: "fire",
    simple: logs > 0 && !full,
    label,
    tiles: prop.tiles,
    mx: prop.tile[0],
    my: prop.tile[1] - 0.6,
    enabled: logs > 0 && !full,
    perform() {
      if (countAll(player, "log") <= 0) return false;
      if (!map.feedFire(prop)) return false;
      takeAll(player, "log", 1);
      return true;
    },
  })];
}

// Brackets and posts: take the torch into a hand or the bag, or mount the one you carry.
function holderActions(target, player) {
  const what = target.kind === "bracket" ? "bracket" : "post";
  const mx = target.kind === "bracket" ? target.mx : target.prop.tile[0];
  const my = target.kind === "bracket" ? target.my - 0.4 : target.prop.tile[1] - 0.9;
  const tiles = target.kind === "bracket" ? [[target.bracket.tx, target.bracket.ty]] : target.prop.tiles;
  const has = map.holderHas(target);
  if (has) {
    return [act({
      kind: "holder",
      simple: true,
      label: "Take the torch",
      tiles,
      mx,
      my,
      perform() {
        const entry = { id: "torch", count: 1 };
        if (!takeIn(player, entry)) return false;
        map.setHolder(target, false);
        return true;
      },
    })];
  }
  const have = countAll(player, "torch") > 0;
  return [act({
    kind: "holder",
    simple: have,
    label: have ? "Mount the torch" : `An empty ${what} (need a torch)`,
    tiles,
    mx,
    my,
    enabled: have,
    perform() {
      const found = findItem(player, "torch");
      if (!found) return false;
      detach(player, found.entry);
      map.setHolder(target, true);
      return true;
    },
  })];
}

// Doors and windows: open and close, climb, board and pull (docs/09).
function openingActions(o, player) {
  const w = o.wall;
  const name = w.kind === "door" ? "door" : "shutters";
  const side = map.sideOf(o.tx, o.ty, o.edge, player.gx, player.gy);
  const mine = side > 0 ? w.boards.near : w.boards.far;
  const theirs = side > 0 ? w.boards.far : w.boards.near;
  const tiles = [[o.tx, o.ty], o.edge === "n" ? [o.tx, o.ty - 1] : [o.tx - 1, o.ty]];
  const base = { tiles, mx: o.mx, my: o.my };
  const out = [];
  const open = w.kind === "door" ? w.open : w.shutter === "open";
  if (map.boarded(w)) {
    const parts = [];
    if (mine.length) parts.push(`${mine.length} this side`);
    if (theirs.length) parts.push(`${theirs.length} far side`);
    out.push(act({ ...base, kind: "opening", label: `${name}: boarded (${parts.join(", ")})`, enabled: false }));
  } else if (w.broken) {
    out.push(act({ ...base, kind: "opening", label: w.kind === "door" ? "A broken doorway" : "Broken shutters", enabled: false }));
  } else {
    out.push(act({
      ...base,
      kind: "opening",
      simple: true,
      label: open ? `Close ${name}` : `Open ${name}`,
      perform() {
        if (w.kind === "door") w.open = !w.open;
        else w.shutter = w.shutter === "open" ? "closed" : "open";
        map.touch();
        return true;
      },
    }));
  }
  if (map.climbable(w)) {
    out.push(act({
      ...base,
      kind: "climb",
      label: "Climb through",
      perform() {
        startClimb(player, o);
        return true;
      },
    }));
  }
  const planks = countAll(player, "plank");
  if (mine.length < map.BOARDS_PER_SIDE) {
    out.push(act({
      ...base,
      kind: "board",
      label: planks ? `Board up (${mine.length}/${map.BOARDS_PER_SIDE})` : "Board up (need a plank)",
      duration: BOARD_TIME,
      enabled: planks > 0,
      perform() {
        if (countAll(player, "plank") <= 0) return false;
        if (!map.addBoard(w, side)) return false;
        takeAll(player, "plank", 1);
        return true;
      },
    }));
  }
  if (mine.length) {
    out.push(act({
      ...base,
      kind: "pull",
      label: `Pull a board (${mine.length} this side, gone)`,
      duration: PULL_TIME,
      perform() {
        return map.pullBoard(w, side);
      },
    }));
  }
  return out;
}

// Trees: chop down, logs on the ground, the tree gone (docs/02: felling is clearing the tile's prop).
function treeActions(prop) {
  return [act({
    kind: "tree",
    label: `Chop down (${prop.wood} log${prop.wood > 1 ? "s" : ""})`,
    tiles: prop.tiles,
    mx: prop.tile[0],
    my: prop.tile[1],
    duration: CHOP_TIME,
    perform() {
      const [tx, ty] = prop.tile;
      map.removeProp(prop);
      for (let i = 0; i < prop.wood; i++) map.dropItem(tx, ty, { id: "log", count: 1 });
      showMessage(`${prop.wood} logs on the ground.`);
      return true;
    },
  })];
}

// The well: infinite water (docs/02, question 16).
function wellActions(prop, player) {
  const toFill = () => waterContainers(bagOf(player)).filter((it) => (it.fill ?? 0) < 100);
  return [
    act({
      kind: "water",
      simple: player.thirst < 90,
      label: "Drink from the well",
      tiles: prop.tiles,
      mx: prop.tile[0],
      my: prop.tile[1] - 0.6,
      duration: DRINK_TIME,
      perform() {
        player.thirst = player.maxThirst;
        showMessage("You drink your fill.");
        return true;
      },
    }),
    act({
      kind: "fill",
      label: toFill().length ? "Fill waterskins" : "Fill waterskins (none to fill)",
      tiles: prop.tiles,
      mx: prop.tile[0],
      my: prop.tile[1] - 0.6,
      duration: FILL_TIME,
      enabled: toFill().length > 0,
      perform() {
        const list = toFill();
        for (const it of list) it.fill = 100;
        showMessage(list.length > 1 ? `Filled ${list.length} waterskins.` : "Filled your waterskin.");
        return list.length > 0;
      },
    }),
  ];
}

function walkAction(tile) {
  return act({
    kind: "floor",
    label: "Walk here",
    tiles: [tile],
    mx: tile[0],
    my: tile[1],
    range: 0,
    goal: tile,
    perform() {
      return true;
    },
  });
}

// ---- hit testing ----

function pointInRect(x, y, r) {
  return r && x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h;
}

function propRect(prop, tx, ty) {
  const sheet = getSheet(prop.sprite, prop.tiles.length);
  const i = prop.tiles.findIndex(([px, py]) => px === tx && py === ty);
  const f = sheet.frames[`idle_${Math.max(0, i)}`];
  if (!f) return null;
  const p = iso.toScreen(tx, ty);
  const x = Math.round(p.x) - sheet.anchor[0];
  const y = Math.round(p.y) - sheet.anchor[1];
  const b = sheet.bounds;
  return b ? { x: x + b.x, y: y + b.y, w: b.w, h: b.h } : { x, y, w: f[2], h: f[3] };
}

function propActions(prop, player) {
  if (prop.container) return containerActions(prop);
  if (prop.fire && prop.fire.burns) return fireActions(prop, player);
  if (prop.fire && prop.fire.holds) return holderActions({ kind: "post", prop }, player);
  if (prop.wood) return treeActions(prop);
  if (prop.water) return wellActions(prop, player);
  return [];
}

// Every action for whatever is under a canvas point.
export function actionsAt(sx, sy, player) {
  const g = iso.toGrid(sx, sy);
  const tx = Math.round(g.gx);
  const ty = Math.round(g.gy);
  const out = [];
  for (const entry of map.itemsAt(tx, ty)) out.push(...itemActions(entry, tx, ty, player));
  // Props: on their tile, or under their sprite in the tiles around (a tall tree).
  const seen = new Set();
  for (let dy = -3; dy <= 1; dy++) {
    for (let dx = -3; dx <= 1; dx++) {
      const prop = map.tileAt(tx + dx, ty + dy).prop;
      if (!prop || seen.has(prop)) continue;
      const onTile = dx === 0 && dy === 0;
      const onSprite = !onTile && pointInRect(sx, sy, propRect(prop, tx + dx, ty + dy));
      if (!onTile && !onSprite) continue;
      seen.add(prop);
      out.push(...propActions(prop, player));
    }
  }
  for (const o of map.openingsNear(g.gx, g.gy, 0.8)) out.push(...openingActions(o, player));
  for (const b of map.bracketsNear(g.gx, g.gy, 0.8)) out.push(...holderActions({ kind: "bracket", bracket: b.bracket, mx: b.mx, my: b.my }, player));
  if (!out.length && map.isWalkableTile(tx, ty)) out.push(walkAction([tx, ty]));
  return out;
}

// The nearest simple action within range, for the E key and the prompt.
export function nearestSimpleAction(player) {
  let best = null;
  let bestD = Infinity;
  const consider = (actions) => {
    for (const a of actions) {
      if (!a.simple || a.enabled === false) continue;
      const d = distToTiles(player, a.tiles);
      if (d <= a.range && d < bestD) {
        best = a;
        bestD = d;
      }
    }
  };
  const px = Math.round(player.gx);
  const py = Math.round(player.gy);
  const seen = new Set();
  for (let dy = -2; dy <= 2; dy++) {
    for (let dx = -2; dx <= 2; dx++) {
      const t = map.tileAt(px + dx, py + dy);
      for (const entry of map.itemsAt(px + dx, py + dy)) consider(itemActions(entry, px + dx, py + dy, player));
      if (t.prop && !seen.has(t.prop)) {
        seen.add(t.prop);
        consider(propActions(t.prop, player));
      }
    }
  }
  for (const o of map.openingsNear(player.gx, player.gy, INTERACT_RANGE)) consider(openingActions(o, player));
  for (const b of map.bracketsNear(player.gx, player.gy, INTERACT_RANGE)) consider(holderActions({ kind: "bracket", bracket: b.bracket, mx: b.mx, my: b.my }, player));
  return best;
}

// ---- performing ----

export function startAction(player, action) {
  if (!action || action.enabled === false) return false;
  if (action.duration <= 0) {
    action.perform();
    return true;
  }
  player.action = { action, elapsed: 0 };
  return true;
}

// Advance a timed action. Returns progress 0..1 or null when idle. Keyboard
// movement or drifting out of range cancels it.
export function updateAction(player, dt) {
  const a = player.action;
  if (!a) return null;
  if (player.moving || distToTiles(player, a.action.tiles) > a.action.range + 0.2) {
    player.action = null;
    return null;
  }
  a.elapsed += dt;
  if (a.elapsed >= a.action.duration) {
    player.action = null;
    a.action.perform();
    return null;
  }
  return a.elapsed / a.action.duration;
}

// A walkable tile within range of the action's tiles, nearest to the player.
export function approachTile(action, player) {
  if (action.goal) return action.goal;
  let best = null;
  let bestD = Infinity;
  for (const [tx, ty] of action.tiles) {
    for (let dy = -2; dy <= 2; dy++) {
      for (let dx = -2; dx <= 2; dx++) {
        const x = tx + dx;
        const y = ty + dy;
        if (!map.isWalkableTile(x, y)) continue;
        if (Math.hypot(dx, dy) > action.range) continue;
        const d = Math.hypot(player.gx - x, player.gy - y);
        if (d < bestD) {
          bestD = d;
          best = [x, y];
        }
      }
    }
  }
  return best;
}

// Do an action now if in range, else walk over and do it on arrival.
export function runAction(player, action) {
  if (action.enabled === false) return;
  if (distToTiles(player, action.tiles) <= action.range) {
    startAction(player, action);
    return;
  }
  const goal = approachTile(action, player);
  const onArrive = (arrived) => {
    if (arrived) startAction(player, action);
    else if (action.kind !== "floor") showMessage("Can't reach that.");
  };
  if (!goal || !autoWalk(player, goal, { tiles: action.tiles, range: action.range, onArrive })) {
    showMessage("Can't get there from here.");
  }
}

// ---- keys ----

function keyTracker(code) {
  return { code, held: 0, consumed: false };
}
const keyE = keyTracker("KeyE");
const keyB = keyTracker("KeyB");

function track(k, dt, onHold, onTap) {
  if (input.isDown(k.code) || input.wasPressed(k.code)) {
    k.held += dt;
    if (!k.consumed && k.held >= HOLD_TIME) {
      k.consumed = true;
      onHold();
    }
  } else {
    if (k.held > 0 && !k.consumed) onTap();
    k.held = 0;
    k.consumed = false;
  }
}

function nearestOpening(player) {
  return map.openingsNear(player.gx, player.gy, INTERACT_RANGE)[0] || null;
}

// What the prompt should say, and where, or null: a running action with its
// bar, else the nearest simple action with E.
export function promptFor(player, progress) {
  if (player.climb) return null;
  if (player.action) {
    const a = player.action.action;
    return { label: a.label, mx: a.mx, my: a.my, progress };
  }
  const a = nearestSimpleAction(player);
  if (!a) return null;
  return { label: `E: ${a.label}`, mx: a.mx, my: a.my, progress: null };
}

// Unequip a held entry: into the bag, else the belt, else it stays in hand.
export function unequip(player, entry) {
  release(player.hands, entry);
  if (stow(player, entry)) return true;
  hold(player.hands, entry);
  showMessage("Nowhere to put it.");
  return false;
}

// Equip an entry from the belt or a bag, swapping out what the hand holds.
export function equipFrom(player, entry) {
  if (!detach(player, entry)) return false;
  if (equip(player, entry)) return true;
  if (!stow(player, entry)) map.dropItem(Math.round(player.gx), Math.round(player.gy), entry);
  showMessage("Your hands are full.");
  return false;
}

// Wear an entry from a bag (yours or a container's). A bag on the back with
// one already worn swaps, the old one dropping at your feet; any other slot
// swaps into the bag if there is room.
export function wearFrom(player, entry, fromBag) {
  const def = getItem(entry.id);
  if (!def.wear) return false;
  const old = player.worn[def.wear];
  if (fromBag) grid.remove(fromBag, entry);
  else detach(player, entry);
  if (old) {
    player.worn[def.wear] = null;
    if (def.wear === "back") map.dropItem(Math.round(player.gx), Math.round(player.gy), old);
    else if (!stow(player, old)) {
      player.worn[def.wear] = old;
      if (fromBag) grid.insert(fromBag, entry);
      else stow(player, entry);
      showMessage("No room to take the old one off.");
      return false;
    }
  }
  player.worn[def.wear] = entry;
  return true;
}

export function updateInteract(player, dt) {
  if (player.climb) {
    keyE.held = 0;
    keyE.consumed = true;
    return;
  }
  track(keyE, dt,
    () => {
      const o = nearestOpening(player);
      if (o && map.climbable(o.wall)) startClimb(player, o);
    },
    () => {
      if (player.action) return;
      const a = nearestSimpleAction(player);
      if (a) startAction(player, a);
    });
  track(keyB, dt,
    () => {
      const o = nearestOpening(player);
      if (o) {
        const a = openingActions(o, player).find((x) => x.kind === "pull");
        if (a) startAction(player, a);
      }
    },
    () => {
      const o = nearestOpening(player);
      if (o) {
        const a = openingActions(o, player).find((x) => x.kind === "board");
        if (a && a.enabled) startAction(player, a);
        else if (a) showMessage("You need a plank.");
      }
    });
  if (input.wasPressed("KeyT")) {
    if (holding(player.hands, "torch")) unequip(player, heldEntry(player.hands, "torch"));
    else {
      const found = findItem(player, "torch");
      if (!found) showMessage("No torch on you.");
      else equipFrom(player, found.entry);
    }
  }
}

// ---- the item menus, for the panel ----

// An item in a grid: yours or an open container's.
export function itemMenu(player, entry, bag, otherBag) {
  const def = getItem(entry.id);
  const out = [];
  const mine = bag === bagOf(player);
  if (def.hands && mine) {
    out.push({
      label: `Equip (${def.hands === "both" ? "both hands" : def.hands === "either" ? "a hand" : `${def.hands} hand`})`,
      enabled: true,
      onSelect: () => equipFrom(player, entry),
    });
  }
  if (def.wear) {
    out.push({ label: def.bag ? `Wear (${def.bag[0]}×${def.bag[1]})` : "Wear", enabled: true, onSelect: () => wearFrom(player, entry, bag) });
  }
  if (def.kind === "food") {
    out.push({ label: "Eat", enabled: true, onSelect: () => { eat(player, def); entry.count -= 1; if (entry.count <= 0) grid.remove(bag, entry); } });
  }
  if (def.capacity) {
    const pct = Math.round(entry.fill ?? 0);
    out.push({ label: `Drink (${pct}%)`, enabled: pct > 0, onSelect: () => drink(player, entry) });
  }
  if (def.splitsInto && mine) {
    const s = def.splitsInto;
    out.push({
      label: `Split into ${s.count} ${getItem(s.id).name.toLowerCase()}s`,
      enabled: true,
      onSelect: () => {
        grid.remove(bag, entry);
        const added = addItem(bag, s.id, s.count);
        if (added < s.count) {
          for (let i = added; i < s.count; i++) map.dropItem(Math.round(player.gx), Math.round(player.gy), { id: s.id, count: 1 });
          showMessage("Some planks fell to the floor.");
        }
      },
    });
  }
  if (otherBag) {
    const toMine = !mine;
    const nested = toMine && !!def.bag; // a bag never goes inside a bag
    out.push({
      label: mine ? `Store in ${otherBag.container}` : "Take",
      enabled: !nested,
      onSelect: () => {
        if (!grid.transfer(bag, otherBag, entry)) showMessage(mine ? "No room in there." : "No room in your bag.");
      },
    });
  }
  if (mine) {
    out.push({
      label: entry.count > 1 ? `Drop all (${entry.count})` : "Drop",
      enabled: true,
      onSelect: () => {
        grid.remove(bag, entry);
        map.dropItem(Math.round(player.gx), Math.round(player.gy), entry);
      },
    });
  }
  return out;
}

// An item in a slot: "worn:head", "belt:2", "hand:main".
export function slotMenu(player, slotId) {
  const [kind, key] = slotId.split(":");
  const out = [];
  if (kind === "worn") {
    const entry = player.worn[key];
    if (!entry) return out;
    out.push({
      label: "Take off",
      enabled: true,
      onSelect: () => {
        player.worn[key] = null;
        if (key === "back" || !stow(player, entry)) {
          map.dropItem(Math.round(player.gx), Math.round(player.gy), entry);
          showMessage(key === "back" ? `You set the ${nameOf(entry).toLowerCase()} down.` : "No room in your bag; it is on the floor.");
        }
      },
    });
  } else if (kind === "belt") {
    const belt = beltOf(player);
    const entry = belt && belt[Number(key)];
    if (!entry) return out;
    out.push({ label: "Equip", enabled: true, onSelect: () => equipFrom(player, entry) });
    out.push({
      label: "Put in bag",
      enabled: !!bagOf(player),
      onSelect: () => {
        belt[Number(key)] = null;
        if (!grid.insert(bagOf(player), entry)) {
          belt[Number(key)] = entry;
          showMessage("No room in your bag.");
        }
      },
    });
  } else if (kind === "hand") {
    const entry = player.hands[key];
    if (!entry) return out;
    out.push({ label: "Unequip", enabled: true, onSelect: () => unequip(player, entry) });
  }
  return out;
}
