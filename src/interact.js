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
import { getSheet, idleFrame } from "./assets.js";
import { getItem, hold, release, holding, heldEntry, canHold, handFor, containerGrid, rollLoot } from "./items.js";
import { stacks as bleedStacks, clear as clearBleed } from "./bleed.js";
import { bagOf, beltOf, ensureBag, countAll, takeAll, findItem, detach, stow, equip, restoreOffHand, addItem, createBag, waterContainers, canStoreIn, isContainer } from "./inventory.js";
import { getDef } from "./assets.js";
import { canPutDown, putDownTarget, canCarry, propRect } from "./placement.js";
import * as placement from "./placement.js";
import * as grid from "./grid.js";
import { startClimb, autoWalk, eat, drink } from "./entities/player.js";
import { showMessage } from "./ui/prompt.js";
import { pokeVillager } from "./entities/villager.js";
import { lootOf } from "./entities/character.js";
import { emit } from "./events.js";
import * as loop from "./loop.js";
import * as use from "./use.js"; // the Use entry on item menus (docs/30, law 2)
import * as verbs from "./verbs.js"; // the verb table (docs/31/08, habit 4)
import { world } from "./world.js";
import * as clock from "./clock.js";
import { tiredStage } from "./moodles.js";

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

// Wear something lying on the floor: what was in that slot stows, or for a
// bag drops where you stand.
function wearAction(entry, tx, ty, player) {
  const def = getItem(entry.id);
  const worn = player.worn[def.wear];
  const name = def.name.toLowerCase();
  const swap = worn ? (def.wear === "back" ? `Swap bags (drop your ${nameOf(worn).toLowerCase()})` : `Wear ${name} (swap)`) : `Wear ${name}`;
  return act({
    kind: "wear",
    label: swap,
    tiles: [[tx, ty]],
    mx: tx,
    my: ty,
    perform() {
      map.takeItem(tx, ty, entry);
      const old = player.worn[def.wear];
      if (old) {
        player.worn[def.wear] = null;
        if (def.wear === "back" || !stow(player, old)) map.dropItem(tx, ty, old);
      }
      player.worn[def.wear] = entry;
      return true;
    },
  });
}

function itemActions(entry, tx, ty, player) {
  const def = getItem(entry.id);
  const tiles = [[tx, ty]];
  if (player.carrying) return [];
  if (def.bag) {
    // A bag on the floor is a container you can also wear (docs/11), and
    // pick up into your bag while it is empty (the container rule).
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
    out.push(wearAction(entry, tx, ty, player));
    if (canStoreIn(entry)) out.push(pickUpAction(entry, tx, ty, player, false));
    return out;
  }
  const out = [];
  const storable = canStoreIn(entry);
  out.push(pickUpAction(entry, tx, ty, player, storable));
  if (def.wear) out.push(wearAction(entry, tx, ty, player));
  return out;
}

function pickUpAction(entry, tx, ty, player, simple) {
  const def = getItem(entry.id);
  const tiles = [[tx, ty]];
  const fill = entry.fill != null ? ` (${Math.round(entry.fill)}%)` : "";
  const count = entry.count > 1 ? ` (${entry.count})` : "";
  const storable = canStoreIn(entry);
  return act({
    kind: "item",
    simple: simple && storable,
    enabled: storable,
    label: storable ? `Pick up ${def.name}${fill}${count}` : `Pick up ${def.name} (empty it first, or wear it)`,
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
  });
}

// ---- carrying furniture (docs/02, 2026-10-10 late) ----
// A prop whose sprite says `carry` can be lifted with both hands empty. While
// carrying you can only walk: no sprint, no actions, no bag, no climb. Put it
// down on any clear tiles in reach, or with E on the tile you face.

function propName(prop) {
  return prop.sprite.replace(/_/g, " ");
}

function carryAction(prop, player) {
  const free = !player.hands.main && !player.hands.off;
  return act({
    kind: "carry",
    label: free ? `Pick up ${propName(prop)}` : `Pick up ${propName(prop)} (needs both hands)`,
    tiles: prop.tiles,
    mx: prop.tile[0],
    my: prop.tile[1],
    enabled: free && !player.carrying,
    perform() {
      if (player.carrying || !(!player.hands.main && !player.hands.off)) return false;
      map.removeProp(prop);
      player.carrying = prop;
      player.auto = null;
      return true;
    },
  });
}

// Whether the carried prop could stand with its anchor at (tx, ty): the rule
// lives in placement.js (docs/13), re-exported here for the callers below.
export { canPutDown, putDownTarget, canCarry };

function putDownAction(player, tx, ty, simple = false) {
  const prop = player.carrying;
  const ok = canPutDown(player, tx, ty);
  return act({
    kind: "putdown",
    simple,
    label: ok ? `Put down ${propName(prop)}` : `Put down ${propName(prop)} (no room)`,
    tiles: [[tx, ty]],
    range: 1.6,
    mx: tx,
    my: ty,
    enabled: ok,
    perform() {
      if (!canPutDown(player, tx, ty)) return false;
      map.placeProp(prop, tx, ty);
      player.carrying = null;
      return true;
    },
  });
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

// A fire takes a unit of its own fuel from wherever you have one (docs/07; logs stopped being free
// with docs/10; the fuel and the hours per unit are the definition's since docs/30 step 2). The
// label says what it burns and how long it has: maintenance, not a hassle.
function fireActions(prop, player) {
  const f = prop.fire;
  if (!f || !f.burns) return [];
  const name = prop.sprite.replace(/_/g, " ");
  const fuelId = f.fuelItem;
  const fuelName = getItem(fuelId).name.toLowerCase();
  const have = countAll(player, fuelId);
  const full = f.fuel >= f.maxFuel;
  const hours = map.fireHoursLeft(prop);
  const left = f.lit ? `, ${hours < 1 ? "under an hour" : `${Math.round(hours)} h`} left` : "";
  let label;
  if (!f.lit) label = have ? `Light the ${name} (a ${fuelName})` : `Light the ${name} (need a ${fuelName})`;
  else if (full) label = `The ${name} is full (${f.maxFuel} ${fuelName}s${left})`;
  else label = have ? `Feed the ${name} (${Math.ceil(f.fuel)} of ${f.maxFuel}${left})` : `Feed the ${name} (need a ${fuelName}${left})`;
  return [act({
    kind: "fire",
    simple: have > 0 && !full,
    label,
    tiles: prop.tiles,
    mx: prop.tile[0],
    my: prop.tile[1] - 0.6,
    enabled: have > 0 && !full,
    perform() {
      if (countAll(player, fuelId) <= 0) return false;
      if (!map.feedFire(prop)) return false;
      takeAll(player, fuelId, 1);
      return true;
    },
  })];
}

// A bed (docs/30, 3.3): one entry that runs the sleep verb; the verb says no with a reason.
function sleepAction(prop, player) {
  const h = clock.getHour();
  const night = h >= 20 || h < 6;
  return [act({
    kind: "sleep",
    simple: tiredStage(player) >= 1 || night,
    label: "Sleep",
    tiles: prop.tiles,
    mx: prop.tile[0],
    my: prop.tile[1] - 0.6,
    perform() {
      const r = verbs.run("sleep", world, player, { prop: prop.id });
      if (!r.ok) showMessage(r.reason);
      return r.ok;
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

// Water to drink and fill from: the well (infinite, docs/02 question 16) and, since docs/30
// law 8, any water tile beside you (the river, a pond, the mere). `source` is
// { tiles, mx, my, name, onStart? }.
function waterActions(source, player) {
  const toFill = () => waterContainers(bagOf(player)).filter((it) => (it.fill ?? 0) < 100);
  return [
    act({
      kind: "water",
      simple: player.thirst < 90,
      label: `Drink from the ${source.name}`,
      tiles: source.tiles,
      mx: source.mx,
      my: source.my,
      duration: DRINK_TIME,
      onStart: source.onStart || null,
      perform() {
        player.thirst = player.maxThirst;
        showMessage("You drink your fill.");
        return true;
      },
    }),
    act({
      kind: "fill",
      label: toFill().length ? "Fill waterskins" : "Fill waterskins (none to fill)",
      tiles: source.tiles,
      mx: source.mx,
      my: source.my,
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

function wellActions(prop, player) {
  return waterActions({ tiles: prop.tiles, mx: prop.tile[0], my: prop.tile[1] - 0.6, name: "well", onStart: () => play(prop) }, player); // the bucket goes down for the water
}

// A water tile's actions, from its bank.
function waterTileActions(tx, ty, player) {
  return waterActions({ tiles: [[tx, ty]], mx: tx, my: ty, name: "water" }, player);
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

// What can be done to a prop: its own actions first, and lifting it last when
// the rule (canCarry, in placement.js) allows. Additive, so a prop with several
// uses lists them all.
function propActions(prop, player) {
  if (player.carrying) return [];
  const out = [];
  if (prop.container) out.push(...containerActions(prop));
  if (prop.fire && prop.fire.burns) out.push(...fireActions(prop, player));
  if (prop.fire && prop.fire.holds) out.push(...holderActions({ kind: "post", prop }, player));
  if (prop.wood) out.push(...treeActions(prop));
  if (prop.water) out.push(...wellActions(prop, player));
  if (getDef(prop.sprite).sleep) out.push(...sleepAction(prop, player));
  if (canCarry(prop)) out.push(carryAction(prop, player));
  return out;
}

// Openings under a canvas point. A door or shutter is drawn as a face up to
// WALL_FACE pixels tall above its edge, so the click is tested against that
// face on screen, not only against the edge's midpoint on the ground (a
// right-click on the door itself found nothing, Michael 2026-10-10).
const WALL_FACE = 80; // the walls' height since 2026-10-11 (docs/17)
const FACE_HALF_W = 26;

function openingsAtScreen(sx, sy) {
  const seen = new Set();
  const out = [];
  for (const dy of [0, WALL_FACE / 2, WALL_FACE]) {
    const g = iso.toGrid(sx, sy + dy);
    for (const o of map.openingsNear(g.gx, g.gy, 2.5)) {
      const k = `${o.edge}@${o.tx},${o.ty}`;
      if (seen.has(k)) continue;
      const p = iso.toScreen(o.mx, o.my);
      const dx = sx - p.x;
      const dyy = sy - p.y;
      if (Math.abs(dx) <= FACE_HALF_W && dyy >= -WALL_FACE && dyy <= 12) {
        seen.add(k);
        out.push(o);
      }
    }
  }
  out.sort((a, b) => Math.hypot(a.mx - iso.toGrid(sx, sy).gx, a.my - iso.toGrid(sx, sy).gy) - Math.hypot(b.mx - iso.toGrid(sx, sy).gx, b.my - iso.toGrid(sx, sy).gy));
  return out;
}

// Every action for whatever is under a canvas point.
export function actionsAt(sx, sy, player) {
  const g = iso.toGrid(sx, sy);
  const tx = Math.round(g.gx);
  const ty = Math.round(g.gy);
  const out = [];
  if (player.carrying) {
    // Only walking and putting the thing down.
    out.push(putDownAction(player, tx, ty));
    if (map.isWalkableTile(tx, ty)) out.push(walkAction([tx, ty]));
    return out;
  }
  for (const entry of map.itemsAt(tx, ty)) out.push(...itemActions(entry, tx, ty, player));
  if (map.peekTile(tx, ty) && map.drinkableAt(tx, ty)) out.push(...waterTileActions(tx, ty, player)); // the river, a pond (docs/30, law 8)
  // Props: on their tile, or under their sprite in the tiles around (a tall tree).
  const seen = new Set();
  for (let dy = -3; dy <= 1; dy++) {
    for (let dx = -3; dx <= 1; dx++) {
      const prop = map.peekTile(tx + dx, ty + dy)?.prop; // a hit test never grows a chunk (docs/23a, A4)
      if (!prop || seen.has(prop)) continue;
      const onTile = dx === 0 && dy === 0;
      const onSprite = !onTile && pointInRect(sx, sy, propRect(prop, tx + dx, ty + dy));
      if (!onTile && !onSprite) continue;
      seen.add(prop);
      out.push(...propActions(prop, player));
    }
  }
  for (const o of openingsAtScreen(sx, sy)) out.push(...openingActions(o, player));
  for (const b of map.bracketsNear(g.gx, g.gy, 0.8)) out.push(...holderActions({ kind: "bracket", bracket: b.bracket, mx: b.mx, my: b.my }, player));
  const under = characterAt(sx, sy);
  if (under) out.push(...characterActions(under, player));
  else if (playerAt(sx, sy, player)) out.push(...characterActions(player, player));
  if (!out.length && map.isWalkableTile(tx, ty)) out.push(walkAction([tx, ty]));
  return out;
}

// The nearest simple action within range, for the E key and the prompt.
export function nearestSimpleAction(player) {
  if (player.carrying) {
    const [tx, ty] = putDownTarget(player);
    const a = putDownAction(player, tx, ty, true);
    return a.enabled ? a : null;
  }
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
      const t = map.peekTile(px + dx, py + dy); // a hit test never grows a chunk (docs/23a, A4)
      if (!t) continue;
      for (const entry of map.itemsAt(px + dx, py + dy)) consider(itemActions(entry, px + dx, py + dy, player));
      if (map.drinkableAt(px + dx, py + dy)) consider(waterTileActions(px + dx, py + dy, player)); // E at the bank
      if (t.prop && !seen.has(t.prop)) {
        seen.add(t.prop);
        consider(propActions(t.prop, player));
      }
    }
  }
  for (const o of map.openingsNear(player.gx, player.gy, INTERACT_RANGE)) consider(openingActions(o, player));
  for (const b of map.bracketsNear(player.gx, player.gy, INTERACT_RANGE)) consider(holderActions({ kind: "bracket", bracket: b.bracket, mx: b.mx, my: b.my }, player));
  // A body lying within reach (a corpse is a container, docs/19).
  for (const c of allCharacters()) {
    if (c.kind !== "zombie" || !c.dead || !c.corpse || Math.abs(c.gx - player.gx) > 3 || Math.abs(c.gy - player.gy) > 3) continue;
    consider(characterActions(c, player));
  }
  return best;
}

// ---- performing ----

export function startAction(player, action) {
  if (!action || action.enabled === false) return false;
  if (action.onStart) action.onStart();
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
  // Placement first: its ghost carries its own prompt (docs/13).
  const pp = !player.action ? placement.prompt() : null;
  if (pp) return pp;
  if (player.carrying) {
    const [tx, ty] = putDownTarget(player);
    const a = putDownAction(player, tx, ty, true);
    return { label: a.enabled ? `E: ${a.label}` : a.label, mx: tx, my: ty, progress: null, enabled: a.enabled };
  }
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
  const both = getItem(entry.id).hands === "both";
  release(player.hands, entry);
  if (stow(player, entry)) {
    if (both) restoreOffHand(player); // the shield it pushed out comes back (docs/21)
    return true;
  }
  hold(player.hands, entry);
  showMessage("Nowhere to put it.");
  return false;
}

// Equip an entry from the belt or a bag, swapping out what the hand holds.
export function equipFrom(player, entry, prefer = null) {
  if (!detach(player, entry)) return false;
  if (equip(player, entry, prefer)) return true;
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
  if (player.carrying) {
    // Only E, and only to put it down.
    if (input.wasPressed("KeyE")) {
      const a = nearestSimpleAction(player);
      if (a) startAction(player, a);
      else showMessage("No room to put it down there.");
    }
    keyE.held = 0;
    keyE.consumed = true;
    keyB.held = 0;
    keyB.consumed = true;
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
  // Use: pick the thing up as what you are about to use on something (docs/30, law 2; Michael, 2026-10-12).
  out.push({ label: "Use", enabled: true, onSelect: () => use.begin(entry, { kind: "bag", bag }) });
  if (def.hands && mine) {
    if (def.hands === "either") {
      // A weapon fits either hand: the main hand swaps what is there, the off hand takes a second weapon (docs/21).
      out.push({ label: "Equip (main hand)", enabled: true, onSelect: () => equipFrom(player, entry, "main") });
      out.push({ label: "Equip (off hand)", enabled: true, onSelect: () => equipFrom(player, entry, "off") });
    } else {
      out.push({
        label: `Equip (${def.hands === "both" ? "both hands" : `${def.hands} hand`})`,
        enabled: true,
        onSelect: () => equipFrom(player, entry),
      });
    }
  }
  if (def.wear) {
    out.push({ label: def.bag ? `Wear (${def.bag[0]}×${def.bag[1]})` : "Wear", enabled: true, onSelect: () => wearFrom(player, entry, bag) });
  }
  if (def.bandage) {
    // Closes a bleeding wound at once (docs/02 question 29b).
    const bleeding = bleedStacks(player) > 0;
    out.push({
      label: bleeding ? "Apply" : "Apply (not bleeding)",
      enabled: bleeding,
      onSelect: () => { clearBleed(player); showMessage("The bleeding stops."); entry.count -= 1; if (entry.count <= 0) grid.remove(bag, entry); },
    });
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
    const nested = !canStoreIn(entry); // the container rule: only empty containers go in
    out.push({
      label: (mine ? `Store in ${otherBag.container}` : "Take") + (nested ? " (empty it first)" : ""),
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

// An item in a slot: "worn:head", "belt:2", "hand:main". Every slot offers
// Drop, which puts the thing at your feet without passing through the sack
// (Michael, 2026-10-10 night); a belt or a bag drops as a container, with
// what it holds still in it.
export function slotMenu(player, slotId) {
  const [kind, key] = slotId.split(":");
  const out = [];
  const held = kind === "worn" ? player.worn[key] : kind === "hand" ? player.hands[key] : kind === "belt" ? beltOf(player)?.[Number(key)] : null;
  if (held) out.push({ label: "Use", enabled: true, onSelect: () => use.begin(held, { kind: "slot", id: slotId }) });
  const dropEntry = (entry) => ({
    label: "Drop",
    enabled: true,
    onSelect: () => {
      detach(player, entry);
      map.dropItem(Math.round(player.gx), Math.round(player.gy), entry);
    },
  });
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
    out.push(dropEntry(entry));
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
    out.push(dropEntry(entry));
  } else if (kind === "hand") {
    const entry = player.hands[key];
    if (!entry) return out;
    out.push({ label: "Unequip", enabled: true, onSelect: () => unequip(player, entry) });
    out.push(dropEntry(entry));
  }
  return out;
}

// ---- interactables (docs/02, question 27) ----
// A mushroom or a rock under the cursor, by its visible pixels, the frontmost
// one; it wiggles, then rests for a moment before it will wiggle again.
const POKE_COOLDOWN_MS = 600;
// A click sways a thing, or plays its animation, only within the player's reach,
// the same as placing and building (Michael, 2026-10-12: trees wiggled from
// across the map). A far right-click still finds it for its menu.
export const CLICK_REACH = 2.6;
const inReach = (prop, player) => !!player && distToTiles(player, prop.tiles) <= CLICK_REACH;
const pokePixels = new Map(); // sheet -> { w, h, a: Uint8Array of alpha }

function alphaOf(sheet) {
  let p = pokePixels.get(sheet);
  if (p) return p;
  const img = sheet.image;
  const c = document.createElement("canvas");
  c.width = img.width;
  c.height = img.height;
  const ctx = c.getContext("2d", { willReadFrequently: true });
  ctx.drawImage(img, 0, 0);
  const d = ctx.getImageData(0, 0, img.width, img.height).data;
  const a = new Uint8Array(img.width * img.height);
  for (let i = 0; i < a.length; i++) a[i] = d[i * 4 + 3];
  p = { w: img.width, h: img.height, a };
  pokePixels.set(sheet, p);
  return p;
}

export function interactableAt(sx, sy, wanted = (prop) => prop.interactable) {
  const g = iso.toGrid(sx, sy);
  const tx = Math.round(g.gx);
  const ty = Math.round(g.gy);
  let best = null;
  // A giant tree's crown is about six tiles up the screen from its trunk's
  // tile, so look that far down the grid as well as a little around.
  for (let dy = -2; dy <= 7; dy++) {
    for (let dx = -2; dx <= 7; dx++) {
      const prop = map.peekTile(tx + dx, ty + dy)?.prop; // a hit test never grows a chunk (docs/23a, A4)
      if (!prop || !wanted(prop)) continue;
      const r = propRect(prop, prop.tile[0], prop.tile[1]);
      if (!r || !pointInRect(sx, sy, r)) continue;
      const sheet = getSheet(prop.sprite, prop.tiles.length);
      const f = sheet.frames[idleFrame(sheet, prop, 0)];
      const px = Math.floor(sx - r.x) + (sheet.bounds ? sheet.bounds.x : 0) + f[0];
      const py = Math.floor(sy - r.y) + (sheet.bounds ? sheet.bounds.y : 0) + f[1];
      const al = alphaOf(sheet);
      if (px < 0 || py < 0 || px >= al.w || py >= al.h || al.a[py * al.w + px] === 0) continue;
      const depth = prop.tile[0] + prop.tile[1];
      if (!best || depth > best.depth) best = { prop, depth };
    }
  }
  return best ? best.prop : null;
}

// Poke the interactable under the cursor: the thing found, or null. It sways
// if it is within the player's reach and not still resting from the last poke.
// The rule (Michael, 2026-10-12, written in stone): anything interactable
// wobbles when clicked, by default; a definition turns it off with
// `"sway": false`, and one with a `clickAnim` plays that instead (the well).
export function pokeAt(sx, sy, player) {
  const prop = interactableAt(sx, sy);
  if (!prop) return null;
  const def = getDef(prop.sprite);
  if (def.sway === false || def.clickAnim) return prop;
  const now = loop.simTime() * 1000; // sim milliseconds (docs/23a, C2); the renderer reads the same clock
  if (inReach(prop, player) && (!prop.pokedAt || now - prop.pokedAt >= POKE_COOLDOWN_MS)) prop.pokedAt = now;
  return prop;
}

// ---- brushing through (Michael, 2026-10-12) ----
// Any character walking through an interactable that can be walked through
// (a crop, a mushroom: `solid` false; never a tree or a rock) sets it swaying
// as a click would. One round finishes before the next starts, so a walk
// through a field keeps it wobbling without ever restarting a sway mid-way;
// standing still in it does nothing.
const BRUSH_MS = 560; // the sway's length (render/props.js, WIGGLE_MS)
export function brushThrough(ch) {
  if (!ch || ch.dead) return;
  // Moved: a fiftieth of a tile since the last point that counted, so a slow
  // walker (the dead at one tile a second cover a sixtieth a step) adds up to
  // it over a few steps and a stander never does.
  const moved = ch.brushX === undefined || Math.hypot(ch.gx - ch.brushX, ch.gy - ch.brushY) > 0.02;
  if (!moved) return;
  ch.brushX = ch.gx;
  ch.brushY = ch.gy;
  const prop = map.peekTile(Math.round(ch.gx), Math.round(ch.gy))?.prop;
  if (!prop || !prop.interactable || prop.solid) return;
  const def = getDef(prop.sprite);
  if (def.sway === false || def.clickAnim) return;
  const now = loop.simTime() * 1000;
  if (!prop.pokedAt || now - prop.pokedAt >= BRUSH_MS) prop.pokedAt = now;
}

// ---- characters under the cursor (docs/19) ----

let allCharacters = () => []; // main.js hands in everyone but the player
export function setCharacters(fn) {
  allCharacters = fn;
}

// The character (never the player) whose body the point falls on: a box a
// little wider than the figure and as tall as it, standing on its feet, since
// a figure moves and a pixel test would be fussy. The nearest to the camera
// wins a tie.
export function characterAt(sx, sy) {
  let best = null;
  for (const c of allCharacters()) {
    if (c.kind === "player") continue;
    const p = iso.toScreen(c.gx, c.gy);
    if (sx < p.x - 12 || sx > p.x + 12 || sy < p.y - 64 || sy > p.y + 2) continue;
    if (!best || c.gx + c.gy > best.gx + best.gy) best = c;
  }
  return best;
}

// A left click on a villager within reach pokes it. Returns the character under the cursor.
export function clickCharacterAt(sx, sy, player) {
  const c = characterAt(sx, sy);
  if (c && c.kind === "villager" && Math.hypot(player.gx - c.gx, player.gy - c.gy) <= CLICK_REACH) pokeVillager(c, player);
  return c;
}

// A dead zombie's body, searched like a chest (docs/19): the first time takes a
// moment and rolls its pockets; after that it just opens. The grid is the body's.
function searchBodyAction(c) {
  const tiles = [[Math.round(c.gx), Math.round(c.gy)]];
  return act({
    kind: "container",
    simple: true,
    label: c.searched ? "Open body" : "Search body",
    tiles,
    mx: c.gx,
    my: c.gy,
    duration: c.searched ? 0 : SEARCH_TIME,
    perform() {
      const bag = lootOf(c);
      c.searched = true;
      emit("containerOpened", { bag, tiles, name: "body", corpse: c });
      return true;
    },
  });
}

// What a right-click on a character offers, by kind. Everyone, the player
// included, can be set on fire and put out: a visual test with no effect
// (fire.js, docs/05 "Burning"), from anywhere on screen.
function characterActions(c, player) {
  const out = [];
  if (c.kind === "zombie" && c.dead && c.corpse) out.push(searchBodyAction(c));
  if (c.kind === "villager") {
    out.push(act({
      kind: "poke",
      label: `Poke ${c.name}`,
      tiles: [[Math.round(c.gx), Math.round(c.gy)]],
      range: CLICK_REACH,
      simple: false,
      perform() {
        pokeVillager(c, player);
        return true;
      },
    }));
  }
  out.push(act({
    kind: "burn",
    label: c.burning ? "Put out" : "Set on fire",
    tiles: [[Math.round(c.gx), Math.round(c.gy)]],
    range: Infinity,
    simple: false,
    perform() {
      c.burning = !c.burning;
      return true;
    },
  }));
  return out;
}

// The player's own figure under the cursor (characterAt skips the player).
function playerAt(sx, sy, player) {
  const p = iso.toScreen(player.gx, player.gy);
  return sx >= p.x - 12 && sx <= p.x + 12 && sy >= p.y - 64 && sy <= p.y + 2;
}

// A prop with a click animation (`clickAnim` on its sprite: the well's bucket)
// plays it once. Just for fun, so a click while it plays does nothing: spam
// cannot stack or restart it (Michael, 2026-10-11). Returns whether it started.
export function play(prop) {
  const anim = prop && getDef(prop.sprite).clickAnim;
  if (!anim) return false;
  const now = loop.simTime() * 1000; // sim milliseconds (docs/23a, C2)
  const total = anim.ms.reduce((a, b) => a + b, 0);
  if (prop.playedAt && now - prop.playedAt < total) return false;
  prop.playedAt = now;
  return true;
}

// Left click: play the click animation of the thing under the cursor, by its
// pixels, if it is within the player's reach.
export function playAt(sx, sy, player) {
  const prop = interactableAt(sx, sy, (p) => !!getDef(p.sprite).clickAnim);
  if (prop && inReach(prop, player)) play(prop);
  return prop;
}

// The actions of a thing the player clicked by its pixels (a tree's crown is
// further up the screen than the menu's own search reaches).
export function actionsForProp(prop, player) {
  return propActions(prop, player);
}
