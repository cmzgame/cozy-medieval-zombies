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
import { resolveFacing, frameName } from "./sprites.js";
import { getItem, toolFor, makeEntry, hold, release, holding, heldEntry, canHold, handFor, containerGrid, rollLoot } from "./items.js";
import { stacks as bleedStacks, clear as clearBleed } from "./bleed.js";
import { beltKey, flameOf, NO_FLAME, skinsOf, carriedTool, toolProblem } from "./inventory.js";
import { bagOf, beltOf, ensureBag, countAll, takeAll, findItem, detach, stow, equip, restoreOffHand, addItem, createBag, waterContainers, canStoreIn, isContainer } from "./inventory.js";
import { getDef } from "./assets.js";
import { canPutDown, putDownTarget, canCarry, propRect } from "./placement.js";
import * as placement from "./placement.js";
import * as grid from "./grid.js";
import { autoWalk, eat, drink, wave } from "./entities/player.js";
import * as burn from "./burn.js"; // Burn corpse (docs/43 section 7)
import { showMessage } from "./ui/prompt.js";
import { pokeVillager, startTalk, endTalk } from "./entities/villager.js";
import { lookLine } from "./entities/animal.js";
import { lootOf } from "./entities/character.js";
import { emit } from "./events.js";
import * as loop from "./loop.js";
import * as use from "./use.js"; // the Use entry on item menus (docs/30, law 2)
import * as verbs from "./verbs.js"; // the verb table (docs/31/08, habit 4)
import * as farming from "./farming.js"; // till, plant, water, harvest (#194)
import * as inspectMark from "./inspect-mark.js"; // the tile marked while an Inspect's line shows
import * as bucket from "./bucket.js"; // the bucket item: fill at water, pour on a plot (#199)
import { lineOfSight } from "./visibility.js";
import { canReach, reachProblem } from "./reach.js"; // one reach test: distance and a clear line (#208)
import * as chop from "./chop.js"; // a hatchet fells a tree and leaves a stump (#195)
import * as mining from "./mining.js"; // a pickaxe mines a rock or an ore rock (#196)
import * as tuning from "./tuning.js"; // the chop's seconds (world.chopSeconds)
import * as fishing from "./fishing.js"; // a rod in hand casts at the water beside you (#190)
import * as fruit from "./fruit.js"; // fruit trees: picked by hand, bare until they bear again (#190)
import * as clock from "./clock.js";
import { world } from "./world.js";
import * as sight from "./sight.js";
import { tiredStage } from "./moodles.js";
import * as stations from "./stations.js"; // what a prop is as a station (docs/30, section 6)
import * as stationPanel from "./ui/station-panel.js";
import * as rugs from "./rugs.js"; // a rug laid from the bag and picked up again (#327)
import * as paintings from "./paintings.js"; // a painting hung on a wall from the bag and taken down again (#326)
import * as campfire from "./campfire.js"; // a campfire picked up and set down again (docs/43, section 3)
import * as setdown from "./setdown.js"; // an item set down as its prop, a bracket hung on a wall, and each picked up again (docs/43, section 4)
import * as repair from "./repair.js"; // the grindstone sharpens, the anvil repairs, on one count per item (docs/43 section 6)
import * as sawpit from "./sawpit.js"; // the sawpit saws a log into planks with no hatchet (docs/43 section 6)
import * as hives from "./hives.js"; // the beehives give honey every few days (docs/43 section 6)
import * as water from "./water.js"; // tainted and clean water, and the boil verb (docs/44)
import { taintedDrink } from "./sick.js"; // a tainted drink's one roll, Sick and the infection (docs/44)

export const INTERACT_RANGE = 1.15; // tiles
export const SEARCH_TIME = 1.0;
export const BOARD_TIME = 2.0;
export const PULL_TIME = 1.5;
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

// The address of what an action is on (docs/31/05, item 10; docs/31/04, the wire): a tile, an edge,
// a prop by id, a bracket by its edge, an item by its uid on its tile, a character by id. A guest's
// menu entry sends its address and label, and the host rebuilds the action on its own world.
function tag(actions, target) {
  for (const a of actions) a.target = target;
  return actions;
}

const onTile = (tx, ty) => ({ kind: "tile", tile: [tx, ty] });
const onProp = (prop) => ({ kind: "prop", id: prop.id });
const onEdge = (o) => ({ kind: "edge", tx: o.tx, ty: o.ty, edge: o.edge });
const onBracket = (b) => ({ kind: "bracket", tx: b.tx, ty: b.ty, edge: b.edge });
const onItem = (entry, tx, ty) => ({ kind: "item", uid: entry.uid, tile: [tx, ty] });
const onCharacter = (c) => ({ kind: "character", id: c.id });
const onPainting = (h) => ({ kind: "painting", tx: h.tx, ty: h.ty, edge: h.edge }); // a hung painting, by the segment that holds it (#326)

// The actions on an address, rebuilt here from the world (a host's, for a guest's command).
export function actionsForTarget(t, player) {
  if (!t) return [];
  if (t.kind === "tile") {
    const [tx, ty] = t.tile;
    const out = [];
    if (player.carrying) out.push(putDownAction(player, tx, ty));
    else if (map.peekTile(tx, ty) && map.drinkableAt(tx, ty)) out.push(...waterTileActions(tx, ty, player));
    if (!player.carrying) out.push(...farmTileActions(tx, ty, player), ...bucket.tileActions(tx, ty, player, act, world));
    if (map.isWalkableTile(tx, ty)) out.push(walkAction([tx, ty]));
    return tag(out, t);
  }
  if (t.kind === "item") {
    const [tx, ty] = t.tile;
    const entry = map.itemsAt(tx, ty).find((e) => e.uid === t.uid);
    return entry ? tag(itemActions(entry, tx, ty, player), t) : [];
  }
  if (t.kind === "prop") {
    const prop = map.propById(t.id);
    return prop ? tag(propActions(prop, player), t) : [];
  }
  if (t.kind === "edge") {
    const o = map.openingsNear(t.tx, t.ty, 2.5).find((q) => q.tx === t.tx && q.ty === t.ty && q.edge === t.edge);
    return o ? tag(openingActions(o, player), t) : [];
  }
  if (t.kind === "bracket") {
    const b = [...map.brackets()].find((q) => q.tx === t.tx && q.ty === t.ty && q.edge === t.edge);
    if (!b) return [];
    const [mx, my] = map.bracketPos(b);
    return tag(holderActions({ kind: "bracket", bracket: b, mx, my }, player), t);
  }
  if (t.kind === "painting") {
    const held = paintings.holderOf(Math.round(Number(t.tx)), Math.round(Number(t.ty)), t.edge === "w" ? "w" : "n");
    return held ? tag(paintingActions(held, player), onPainting(held)) : [];
  }
  if (t.kind === "character") {
    const c = t.id === player.id ? player : allCharacters().find((q) => q.id === t.id);
    return c ? tag(characterActions(c, player), t) : [];
  }
  return [];
}

// A command from a client not here (net.js): the action with that label on that address, run as if
// chosen from this player's own menu (the walk there, the timed bar, the message, all the host's).
export function performByLabel(player, target, label) {
  const a = actionsForTarget(target, player).find((q) => q.label === label);
  if (!a || a.local) return false; // a local action (Inspect) is the asking client's own: never run for another
  runAction(player, a);
  return true;
}

// A container by its address (docs/31/05, item 9): the shape `containerOpened` sends a guest
// (main.js): a prop by id (`name` "output" for a station's own bag), a floor bag by its entry's uid
// on its tile, a body by id; `{ mine: true }` is the player's own bag. Resolved on a guest every
// frame, since a chunk delta installs a prop anew, and on the host for a guest's command.
// Returns { bag, corpse, tiles } or null.
export function containerAt(player, a) {
  if (!a) return null;
  if (a.mine) {
    const bag = bagOf(player);
    return bag ? { bag, corpse: null, tiles: [[Math.round(player.gx), Math.round(player.gy)]] } : null;
  }
  if (a.propId) {
    const pr = map.propById(a.propId);
    if (!pr) return null;
    const bag = a.name === "output" ? stations.outputOf(pr) : pr.bag || null;
    return bag ? { bag, corpse: null, tiles: pr.tiles } : null;
  }
  if (a.entryUid && a.tile) {
    const e = map.itemsAt(a.tile[0], a.tile[1]).find((q) => q.uid === a.entryUid);
    return e && e.bag ? { bag: e.bag, corpse: null, tiles: [a.tile] } : null;
  }
  if (a.characterId) {
    const c = allCharacters().find((q) => q.id === a.characterId);
    if (c && c.cremate) return null; // a body burning away (docs/43 section 7): nothing in it can be reached, and a panel open on it closes
    const bag = c ? lootOf(c) : null;
    return bag ? { bag, corpse: c, tiles: [[Math.round(c.gx), Math.round(c.gy)]] } : null;
  }
  return null;
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

// Equip something lying on the floor (the action's kind is still `wear`, the code's word): what was in that slot
// stows, or for a bag drops where you stand.
function wearAction(entry, tx, ty, player) {
  const def = getItem(entry.id);
  const worn = player.worn[def.wear];
  const name = def.name.toLowerCase();
  const swap = worn ? (def.wear === "back" ? `Swap bags (drop your ${nameOf(worn).toLowerCase()})` : `Equip ${name} (swap)`) : `Equip ${name}`;
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
        map.touch(tx, ty); // the bag's grid made on first use travels with its tile (docs/31/05, item 6)
        emit("containerOpened", { bag, tiles, name: def.name.toLowerCase(), entry, tile: [tx, ty] });
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
    label: storable ? `Pick up ${def.name}${fill}${count}` : `Pick up ${def.name} (empty it first, or equip it)`,
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
// carrying you can only walk: no sprint, no actions, no bag. Put it
// down on any clear tiles in reach, or with E on the tile you face.

function propName(prop) {
  return prop.sprite.replace(/_/g, " ");
}

// Take apart (docs/43, section 2): a made prop destroyed for half its materials, with its recipe's tool, refused while it holds anything.
// The label says why it is refused, as Pick up's does; the host's click and a guest's command by this label both run placement.takeApart.
function takeApartAction(prop, player) {
  const t = { type: "prop", prop };
  const held = placement.holdsProblem(prop);
  const { back, tool } = placement.partsOf(t);
  const noTool = held || !tool ? "" : placement.toolProblem(player, tool); // a campfire asks for no tool
  const why = held || noTool;
  const parts = back.map((b) => `${b.count} ${getItem(b.id).name.toLowerCase()}${b.count === 1 ? "" : "s"}`).join(", ");
  return act({
    kind: "takeapart",
    label: why ? `Take apart (${why.replace(/\.$/, "").replace(/^./, (c) => c.toLowerCase())})` : `Take apart${parts ? ` (${parts} back)` : ""}`,
    tiles: prop.tiles,
    mx: prop.tile[0],
    my: prop.tile[1],
    enabled: !why,
    perform() {
      return placement.takeApart(player, t);
    },
  });
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

// A laid rug's Pick up (#327): rolls it back into the bag, or at the player's feet if the bag is full. Furniture standing on it refuses ("Move the table off it first"):
// the action is offered all the same, and says why when it is chosen. Also E, when nothing else is the nearest simple thing in reach.
function rugActions(prop, player) {
  if (!prop.rugItem) return [];
  const def = getItem(prop.rugItem);
  return [act({
    kind: "rug",
    simple: true,
    label: `Pick up ${def ? def.name.toLowerCase() : "rug"}`,
    tiles: prop.tiles,
    mx: prop.tile[0],
    my: prop.tile[1],
    perform() {
      return rugs.pickUp(player, prop);
    },
  })];
}

// A hung painting's Pick up (#326): takes it down into the bag, or at the player's feet if the bag is full. `held` is paintings.holderOf's answer: the segment that holds it and its record.
function paintingActions(held, player) {
  const def = getItem(held.rec.item);
  const [mx, my] = paintings.floorTile(held.tx, held.ty);
  return [act({
    kind: "painting",
    simple: true,
    label: `Pick up ${def ? def.name.toLowerCase() : "painting"}`,
    tiles: paintings.tilesOf(held.rec.item, held.tx, held.ty, held.edge),
    range: paintings.REACH - 0.2,
    mx,
    my,
    perform() {
      return paintings.takeDown(player, held.tx, held.ty, held.edge);
    },
  })];
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
    map.unsaved(prop.tile[0], prop.tile[1], false); // made on first use, by whichever path asks first
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
        map.touch(prop.tile[0], prop.tile[1]); // a change on the prop: the save and the wire carry it (docs/31/05, item 6)
      }
      emit("containerOpened", { bag, tiles: prop.tiles, name, prop });
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
  if (f.switch) return switchActions(prop, player); // a fireplace, a hearth: on and off, no fuel (docs/43, section 3)
  if (prop.sprite === campfire.SPRITE) return campfireActions(prop, player);
  const name = prop.sprite.replace(/_/g, " ");
  const fuelId = f.fuelItem;
  const fuelName = getItem(fuelId).name.toLowerCase();
  const have = countAll(player, fuelId);
  const full = f.fuel >= f.maxFuel;
  const hours = map.fireHoursLeft(prop);
  const left = f.lit ? `, ${hours < 1 ? "under an hour" : `${Math.round(hours)} h`} left` : "";
  // Lighting a fire that is out needs a flame carried too (Michael, 2026-10-17, #168): a tinderbox or a lit torch, the light verb's rule.
  const flame = f.lit ? true : !!flameOf(player);
  let label;
  if (!f.lit) label = !have ? `Light the ${name} (need a ${fuelName})` : flame ? `Light the ${name} (a ${fuelName})` : `Light the ${name} (need a tinderbox or a flame)`;
  else if (full) label = `The ${name} is full (${f.maxFuel} ${fuelName}s${left})`;
  else label = have ? `Feed the ${name} (${Math.ceil(f.fuel)} of ${f.maxFuel}${left})` : `Feed the ${name} (need a ${fuelName}${left})`;
  return [act({
    kind: "fire",
    simple: have > 0 && !full && flame,
    label,
    tiles: prop.tiles,
    mx: prop.tile[0],
    my: prop.tile[1] - 0.6,
    enabled: have > 0 && !full,
    perform() {
      if (countAll(player, fuelId) <= 0) return false;
      if (!prop.fire.lit && !flameOf(player)) { showMessage(NO_FLAME); return false; } // the refusal says why
      if (!map.feedFire(prop)) return false;
      takeAll(player, fuelId, 1);
      return true;
    },
  })];
}

// A verb run from a menu entry: its refusal said, its message said when it succeeds.
function runVerb(name, player, target) {
  const r = verbs.run(name, world, player, target);
  if (!r.ok) showMessage(r.reason || "Nothing happens.");
  else if (r.message) showMessage(r.message);
  return r.ok;
}

// A home light (docs/43, section 3; Michael, 2026-10-25: fixed home lights are switches, portable lights cost fuel): a fireplace, a
// hearth, a lantern on a post. Light it with a flame carried (a tinderbox or a lit torch, #168); put it out with nothing. It burns no fuel.
function switchActions(prop, player) {
  const f = prop.fire;
  const name = map.fireName(prop);
  const base = { kind: "fire", tiles: prop.tiles, mx: prop.tile[0], my: prop.tile[1] - 0.6 };
  if (f.lit) return [act({ ...base, simple: false, label: `Put out the ${name}`, perform: () => runVerb("putout", player, { prop: prop.id }) })];
  const flame = !!flameOf(player);
  return [act({ ...base, simple: flame, label: flame ? `Light the ${name}` : `Light the ${name} (need a tinderbox or a flame)`, enabled: flame, perform: () => runVerb("light", player, { prop: prop.id }) })];
}

// The campfire (docs/43, section 3): Add a log (a cold one is not lit by it), Light with a flame, Put out (keeping its fuel), and Pick up
// when it is out and empty.
function campfireActions(prop, player) {
  const f = prop.fire;
  const base = { kind: "fire", tiles: prop.tiles, mx: prop.tile[0], my: prop.tile[1] - 0.6 };
  const have = countAll(player, f.fuelItem);
  const full = f.fuel >= f.maxFuel;
  const hours = map.fireHoursLeft(prop);
  const left = f.lit ? `, ${hours < 1 ? "under an hour" : `${Math.round(hours)} h`} left` : "";
  const held = `${Math.ceil(f.fuel)} of ${f.maxFuel}${left}`;
  const out = [];
  out.push(act({ ...base, simple: have > 0 && !full && f.lit, label: full ? `The campfire is full (${held})` : have ? `Add a log (${held})` : `Add a log (need a log; ${held})`, enabled: have > 0 && !full, perform: () => runVerb("feed", player, { prop: prop.id }) }));
  if (f.lit) out.push(act({ ...base, simple: false, label: "Put out the campfire", perform: () => runVerb("putout", player, { prop: prop.id }) }));
  else if (f.fuel > 0) {
    const flame = !!flameOf(player);
    out.push(act({ ...base, simple: flame, label: flame ? "Light the campfire" : "Light the campfire (need a tinderbox or a flame)", enabled: flame, perform: () => runVerb("light", player, { prop: prop.id }) }));
  }
  const why = campfire.pickUpProblem(prop);
  out.push(act({ ...base, kind: "pickup", simple: false, label: why ? "Pick up campfire (only when out and empty)" : "Pick up campfire", enabled: !why, perform: () => campfire.pickUp(player, prop) }));
  return out;
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
  if (target.kind === "bracket" && target.bracket.wall.bracket.lantern) return lanternActions(target, player); // the village's: put out and lit again, never taken (docs/43, section 3)
  const what = target.kind === "bracket" ? "bracket" : "post";
  const mx = target.kind === "bracket" ? target.mx : target.prop.tile[0];
  const my = target.kind === "bracket" ? target.my - 0.4 : target.prop.tile[1] - 0.9;
  // A bracket is reached from its own side of the wall: the near tile of the edge for side +1, the far one for -1 (burn.js's bracketPos says the same).
  const bk = target.kind === "bracket" ? target.bracket : null;
  const tiles = bk ? [bk.wall.bracket.side > 0 ? [bk.tx, bk.ty] : bk.edge === "n" ? [bk.tx, bk.ty - 1] : [bk.tx - 1, bk.ty]] : target.prop.tiles;
  const has = map.holderHas(target);
  if (has) {
    // Out: a flame lights it (the `light` verb, burn.js; a tinderbox, or a lit torch in a hand or on the belt).
    const out = map.holderState(target).lit === false ? [act({
      kind: "holder",
      simple: false,
      label: "Light the torch",
      tiles,
      mx,
      my,
      perform() {
        const r = verbs.run("light", world, player, target.kind === "bracket" ? { bracket: { tx: target.bracket.tx, ty: target.bracket.ty, edge: target.bracket.edge } } : { prop: target.prop });
        if (!r.ok) showMessage(r.reason || "You cannot light it.");
        else showMessage("You light the torch.");
        return r.ok;
      },
    })] : [];
    const lit = map.holderState(target).lit !== false;
    const putOut = lit ? [act({
      kind: "holder",
      simple: false,
      label: "Put out the torch",
      tiles,
      mx,
      my,
      perform: () => runVerb("putout", player, target.kind === "bracket" ? { bracket: { tx: target.bracket.tx, ty: target.bracket.ty, edge: target.bracket.edge } } : { prop: target.prop.id }),
    })] : [];
    return [...out, ...putOut, act({
      kind: "holder",
      simple: true,
      label: "Take the torch",
      tiles,
      mx,
      my,
      perform() {
        const st = map.holderState(target);
        const entry = makeEntry("torch", 1, { wear: st.wear || 0, lit: false }); // as burnt as it is, and out: a torch leaving a holder is doused (#156)
        if (!takeIn(player, entry)) return false;
        map.setHolder(target, false);
        return true;
      },
    })];
  }
  const have = countAll(player, "torch") > 0;
  // A bracket a player hung, empty, is taken down again into the bag (docs/43, section 4).
  const down = bk && bk.wall.bracket.made ? [act({ kind: "holder", simple: false, label: "Take down the bracket", tiles, mx, my, perform: () => setdown.takeDown(player, bk) })] : [];
  return [...down, act({
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
      map.setHolder(target, true, found.entry);
      return true;
    },
  })];
}

// A lantern in a bracket on a wall (docs/43, section 3): Put out, or Light with a flame carried. Reached from its own side of the wall.
function lanternActions(target, player) {
  const bk = target.bracket;
  const tiles = [bk.wall.bracket.side > 0 ? [bk.tx, bk.ty] : bk.edge === "n" ? [bk.tx, bk.ty - 1] : [bk.tx - 1, bk.ty]];
  const base = { kind: "holder", tiles, mx: target.mx, my: target.my - 0.4 };
  const address = { bracket: { tx: bk.tx, ty: bk.ty, edge: bk.edge } };
  if (bk.wall.bracket.lit !== false) return [act({ ...base, simple: false, label: "Put out the lantern", perform: () => runVerb("putout", player, address) })];
  const flame = !!flameOf(player);
  return [act({ ...base, simple: flame, label: flame ? "Light the lantern" : "Light the lantern (need a tinderbox or a flame)", enabled: flame, perform: () => runVerb("light", player, address) })];
}

// The name of the tool a verb belongs to, for a greyed entry: "smith's hammer".
const toolName = (verb) => { const t = toolFor(verb); return t ? t.name.toLowerCase() : "tool"; };

// Doors and windows: open and close, board and pull (docs/09). Nobody climbs through a window (Michael, 2026-10-16).
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
        map.touch(o.tx, o.ty); // the wall's own tile, so the save and the wire carry it (docs/31/05, item 6; it touched nothing before)
        return true;
      },
    }));
  }
  const planks = countAll(player, "plank");
  const noHammer = toolProblem(player, tuning.world.boardTool); // the tool rule (#215): boarding and pulling are hammer work
  const need = noHammer ? toolName(tuning.world.boardTool) : "";
  if (mine.length < map.BOARDS_PER_SIDE && !map.isFence(w)) { // a fence takes no boards, a gate included (map.addBoard)
    out.push(act({
      ...base,
      kind: "board",
      label: noHammer ? `Board up (need a ${need})` : planks ? `Board up (${mine.length}/${map.BOARDS_PER_SIDE})` : "Board up (need a plank)",
      duration: BOARD_TIME,
      enabled: planks > 0 && !noHammer,
      perform() {
        if (toolProblem(player, tuning.world.boardTool)) { showMessage(toolProblem(player, tuning.world.boardTool)); return false; }
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
      label: noHammer ? `Pull a board (need a ${need})` : `Pull a board (${mine.length} this side, the plank comes back)`,
      duration: PULL_TIME,
      enabled: !noHammer,
      perform() {
        if (toolProblem(player, tuning.world.boardTool)) { showMessage(toolProblem(player, tuning.world.boardTool)); return false; }
        if (!map.pullBoard(w, side)) return false;
        const back = addItem(bagOf(player), "plank", 1); // pulled with a hammer, the plank comes back (#215)
        if (back < 1) map.dropItem(Math.round(player.gx), Math.round(player.gy), makeEntry("plank", 1));
        return true;
      },
    }));
  }
  return out;
}

// What a crop offers (#194): Harvest when it is ready (a simple action, so E does it), else how long it has to go, and Water with a skin.
// Each runs its verb in the timed action, so a guest's choice of the same label does the same on the host.
function cropActions(prop, player) {
  if (!prop.crop) return [];
  const soil = farming.get().soil;
  const base = { tiles: prop.tiles, mx: prop.tile[0], my: prop.tile[1] };
  const run = (verb, args = {}) => () => {
    const r = verbs.run(verb, world, player, { prop: prop.id, ...args });
    if (!r.ok && r.reason) showMessage(r.reason);
    else if (r.message) showMessage(r.message);
    return r.ok;
  };
  const out = [];
  const def = farming.cropDef(prop.crop.kind);
  const cropTool = def.tool;
  const noTool = cropTool && toolProblem(player, cropTool);
  // Each label names the crop (Michael's playtest, 2026-10-19: with potatoes beside the cabbages, E's bare "Harvest" took the potatoes,
  // which the cottage's shovel digs, and seemed to need no tool, while the cabbage beside them wanted a dirk).
  if (farming.stageOf(prop) >= 2) out.push(act({ ...base, kind: "harvest", simple: !noTool, label: noTool ? `Harvest ${def.name} (need a ${toolName(cropTool)})` : `Harvest ${def.name}`, enabled: !noTool, duration: soil.seconds.harvest, perform: run("harvest") }));
  else {
    const days = Math.max(1, Math.ceil(farming.daysLeft(prop)));
    out.push(act({ ...base, kind: "harvest", label: farming.isWet(prop) ? `Growing (ready in about ${days} day${days > 1 ? "s" : ""})` : `Dry: waiting for water (about ${days} more day${days > 1 ? "s" : ""} of growth)`, enabled: false }));
  }
  const skin = farming.skinFor(player, null);
  out.push(act({ ...base, kind: "water", label: skin ? "Water" : "Water (no water in a skin)", duration: soil.seconds.water, enabled: !!skin, perform: run("water") }));
  out.push(inspectCropAction(prop, base));
  return out;
}

// Inspect a crop (Michael, 2026-10-19): what it is, how long until it is ready, whether it is watered or fertilized, and what harvests
// it, said in a line, with the patch's tile marked on the ground while the line shows (inspect-mark.js). It only reads the world, so it
// runs on this client alone, a guest's too (`local`: never sent to the host), from wherever the patch is seen, never walking there.
export const INSPECT_RANGE = 12; // tiles
function inspectCropAction(prop, base) {
  return act({
    ...base,
    kind: "inspect",
    label: "Inspect",
    range: INSPECT_RANGE,
    local: true,
    perform() {
      showMessage(cropReport(prop), 6);
      inspectMark.mark(prop.tiles);
      return true;
    },
  });
}

export function cropReport(prop) {
  const def = farming.cropDef(prop.crop.kind);
  const name = def.name[0].toUpperCase() + def.name.slice(1);
  const parts = [];
  const wet = farming.isWet(prop);
  if (farming.stageOf(prop) >= 2) parts.push("ready to harvest", wet ? "watered" : "dry");
  else {
    const days = Math.max(1, Math.ceil(farming.daysLeft(prop))); // as the menu's Growing line counts it
    const left = `about ${days} day${days > 1 ? "s" : ""}`;
    parts.push(wet ? `ready in ${left}` : `${left} of growing left`, wet ? "watered" : "dry, waiting for water");
  }
  parts.push("not fertilized"); // nothing fertilizes yet (the composter, #275's Farming)
  parts.push(def.tool ? `harvest with a ${toolName(def.tool)}` : "harvest by hand");
  return `${name}: ${parts.join("; ")}.`;
}

// A tile's farming (#194): the hoe in a hand tills bare grass or dirt, a seed carried is planted in empty soil.
function farmTileActions(tx, ty, player) {
  const out = [];
  const soil = farming.get().soil;
  const t = map.peekTile(tx, ty);
  if (!t || t.prop) return out;
  if (!lineOfSight(player.gx, player.gy, tx, ty)) return out; // a wall in the way: not offered, rather than offered and refused (the verbs refuse it too)
  const base = { tiles: [[tx, ty]], mx: tx, my: ty };
  const run = (verb, args = {}) => () => {
    const r = verbs.run(verb, world, player, { tile: [tx, ty], ...args });
    if (!r.ok && r.reason) showMessage(r.reason);
    else if (r.message) showMessage(r.message);
    return r.ok;
  };
  if (farming.heldWith(player, "till") && !farming.isSoil(tx, ty) && (t.floor === "floor_grass" || t.floor === "floor_dirt")) {
    out.push(act({ ...base, kind: "till", label: "Till the soil", duration: soil.seconds.till, perform: run("till") }));
  }
  if (farming.isSoil(tx, ty)) {
    for (const kind of Object.keys(farming.get().crops)) {
      if (!farming.hasSeed(player, kind)) continue;
      out.push(act({ ...base, kind: "plant", label: `Plant ${kind}`, duration: soil.seconds.plant, perform: run("plant", { crop: kind }) }));
    }
  }
  return out;
}

// A fruit tree laden is picked by hand (the `pick` verb, fruit.js; #190); bare, it says when it will bear. The timed action runs the verb,
// so a guest's choice of the same label does the same on the host.
function pickActions(prop, player) {
  const p = fruit.pickOf(prop);
  const day = fruit.ripeAt(prop);
  if (!p && day !== null) {
    const days = Math.max(1, Math.ceil((day - clock.getElapsed()) / clock.DAY_LENGTH));
    return [act({ kind: "pick", label: `Bare (fruit in about ${days} day${days > 1 ? "s" : ""})`, tiles: prop.tiles, mx: prop.tile[0], my: prop.tile[1], enabled: false })];
  }
  if (!p) return [];
  const name = getItem(p.item).name.toLowerCase();
  return [act({
    kind: "pick",
    simple: true,
    label: `Pick ${name}s`,
    tiles: prop.tiles,
    mx: prop.tile[0],
    my: prop.tile[1],
    duration: p.seconds,
    perform() {
      const r = verbs.run("pick", world, player, { prop: prop.id });
      if (!r.ok && r.reason) showMessage(r.reason);
      return r.ok;
    },
  })];
}

// A rock or an ore rock is mined with a pickaxe in hand (#196); without one the entry says so. A mined one is gone, and its replacement
// rises elsewhere in its area (docs/46, resources.js). The timed action runs the `mine` verb, so a guest's choice of the same label does the same on the host.
function mineActions(prop, player) {
  const m = mining.mineOf(prop);
  const base = { tiles: prop.tiles, mx: prop.tile[0], my: prop.tile[1] };
  if (!m) return [];
  const name = getItem(m.item).name.toLowerCase();
  const axe = mining.heldPick(player);
  return [act({
    ...base,
    kind: "mine",
    label: axe ? `Mine ${name}` : `Mine ${name} (need a pickaxe)`,
    enabled: !!axe,
    duration: m.seconds,
    perform() {
      const r = verbs.run("mine", world, player, { prop: prop.id });
      if (!r.ok && r.reason) showMessage(r.reason);
      return r.ok;
    },
  })];
}

// Trees: chop down, logs on the ground, the tree gone (docs/02: felling is clearing the tile's prop).
// A hatchet in a hand fells it (a stump is left) or chops the stump up (#195); without one the entry says so, as "Board up (need a plank)"
// does. The timed action runs the `chop` verb (chop.js), so a guest's choice of the label does the same on the host.
function treeActions(prop, player) {
  const stump = chop.isStump(prop);
  const axe = chop.heldAxe(player);
  const n = `${prop.wood} log${prop.wood > 1 ? "s" : ""}`;
  const name = stump ? "Chop up the stump" : "Chop down";
  return [act({
    kind: "tree",
    label: axe ? `${name} (${n})` : `${name} (need a hatchet)`,
    enabled: !!axe,
    tiles: prop.tiles,
    mx: prop.tile[0],
    my: prop.tile[1],
    duration: tuning.world.chopSeconds,
    perform() {
      const r = verbs.run("chop", world, player, { prop: prop.id });
      if (!r.ok && r.reason) showMessage(r.reason);
      return r.ok;
    },
  })];
}

// Unsafe water (Michael, 2026-10-19, #279; docs/44): all natural water, water tiles and wells, is tainted, and a Drink from it says "(tainted)", as
// Zomboid's does. `tuning.water.clean` names the sources that are safe (none: no fixed source is clean, 2026-10-25); a skin's water is tainted unless
// its entry is marked clean (the kit's skin, a boiled one; src/water.js).
const drinkLabel = (entry, pct) => `Drink (${water.isTainted(entry) ? "tainted, " : ""}${pct}%)`;

// Water to drink and fill from: the well (infinite, docs/02 question 16) and, since docs/30
// law 8, any water tile beside you (the river, a pond, the mere). `source` is
// { tiles, mx, my, name, clean, onStart? }. A tainted Drink rolls what it may bring (sick.taintedDrink, the one roll a skin's Drink makes too), and
// a Fill from a tainted source taints the whole skin (docs/44: mixing taints).
function waterActions(source, player) {
  const toFill = () => skinsOf(player).filter((it) => (it.fill ?? 0) < 100); // the belt's skin too (#215)
  return [
    act({
      kind: "water",
      simple: player.thirst < 90,
      label: `Drink from the ${source.name}${source.clean ? "" : " (tainted)"}`,
      tiles: source.tiles,
      mx: source.mx,
      my: source.my,
      duration: DRINK_TIME,
      present: true, // the held-out pose for the bar (docs/32, item 1)
      onStart: source.onStart || null,
      perform() {
        player.thirst = player.maxThirst;
        showMessage("You drink your fill.");
        if (!source.clean) taintedDrink(player);
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
        for (const it of list) {
          water.mixInto(it, !!source.clean);
          it.fill = 100;
        }
        showMessage(list.length > 1 ? `Filled ${list.length} waterskins.` : "Filled your waterskin.");
        return list.length > 0;
      },
    }),
  ];
}

function wellActions(prop, player) {
  return waterActions({ tiles: prop.tiles, mx: prop.tile[0], my: prop.tile[1] - 0.6, name: prop.sprite.replace(/_/g, " "), clean: water.cleanSource(prop.sprite), onStart: () => play(prop) }, player); // the bucket goes down for the water; named for what it is (a trough, a font: the wiki census's bugs, 2026-10-15)
}

// A water tile's actions, from its bank; with a fishing rod in hand, the cast. The wait is rolled as the cast starts (on the authority: a
// guest's menu entry is its label and the water's address, `performByLabel`), and the bar shows it; walking away ends it.
function waterTileActions(tx, ty, player) {
  const out = waterActions({ tiles: [[tx, ty]], mx: tx, my: ty, name: "water", clean: water.sourceCleanAt(tx, ty) }, player);
  if (fishing.rodIn(player)) {
    const cast = act({
      kind: "fish",
      label: "Cast the line",
      tiles: [[tx, ty]],
      mx: tx,
      my: ty,
      range: fishing.get().cast.reach,
      duration: fishing.get().cast.waitMax,
      onStart() { cast.duration = fishing.waitSeconds(); },
      perform() {
        const r = verbs.run("fish", world, player, { tile: [tx, ty] });
        if (!r.ok && r.reason) showMessage(r.reason);
        return r.ok;
      },
    });
    out.push(cast);
  }
  return out;
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
  if (getDef(prop.sprite).rug) return rugActions(prop, player); // a laid rug has one action: Pick up (#327)
  const out = [];
  if (prop.container) out.push(...containerActions(prop));
  if (prop.fire && prop.fire.burns) out.push(...fireActions(prop, player));
  else if (prop.fire && prop.fire.switch) out.push(...switchActions(prop, player)); // a lantern post (docs/43, section 3)
  if (prop.fire && prop.fire.holds) out.push(...holderActions({ kind: "post", prop }, player));
  if (prop.wood) out.push(...pickActions(prop, player), ...treeActions(prop, player));
  if (prop.crop) out.push(...cropActions(prop, player), ...bucket.tileActions(prop.tile[0], prop.tile[1], player, act, world).filter((a) => a.kind === "pour"));
  out.push(...mineActions(prop, player));
  if (prop.water) out.push(...wellActions(prop, player), ...bucket.tileActions(prop.tile[0], prop.tile[1], player, act, world));
  if (getDef(prop.sprite).sleep) out.push(...sleepAction(prop, player));
  if (stations.stationOf(prop).length) out.push(...stationActions(prop, player));
  if (prop.fire && prop.fire.cooks && prop.fire.lit) out.push(boilAtFireAction(prop, player)); // Boil water at a lit cooking fire (docs/44)
  out.push(...repair.propActions(prop, player, act, world), ...sawpit.propActions(prop, player, act, world), ...hives.propActions(prop, player, act, world)); // docs/43 section 6: each is nothing on a prop that is not its own
  if (canCarry(prop)) out.push(carryAction(prop, player));
  if (getDef(prop.sprite).item) out.push(itemPickUpAction(prop, player)); // a torch post, a decoration: back into the bag as its item (docs/43, section 4)
  if (prop.made) out.push(takeApartAction(prop, player)); // only what a player made (docs/43, section 2)
  return out;
}

// Boil water at a lit cooking fire (docs/44 section 2): the fire's menu boils the fullest tainted skin carried, greyed with why when none is. The bar
// is water.boilAction's, the same as the Use mode's and the skin's menu's; a guest's choice of the label does the same on the host.
function boilAtFireAction(prop, player) {
  const skin = water.taintedSkins(player)[0] || null;
  if (!skin) return act({ kind: "boil", label: `Boil water (${water.NO_TAINTED.replace(/\.$/, "").toLowerCase()})`, tiles: prop.tiles, mx: prop.tile[0], my: prop.tile[1] - 0.6, enabled: false });
  return act(water.boilAction(player, skin.uid, prop));
}

// Boil water from a skin's own menu, in the bag or on the belt (docs/44 section 2): the nearest lit cooking fire in reach, greyed with why when there is
// none; null for a skin with nothing to boil (empty or clean). It runs the verb with `timed`, which checks it and starts the bar.
function boilSkinEntry(player, entry) {
  if (!water.boilable(entry)) return null;
  const fire = water.litFireNear(player);
  return {
    label: fire ? "Boil water" : `Boil water (${water.NO_FIRE.replace(/\.$/, "").toLowerCase()})`,
    enabled: !!fire,
    onSelect: () => {
      const f = water.litFireNear(player);
      if (!f) { showMessage(water.NO_FIRE); return; }
      const r = verbs.run("boil", world, player, { prop: f.id, entry: entry.uid }, { timed: true });
      if (!r.ok) showMessage(r.reason || "Nothing happens.");
    },
  };
}

// Pick up a prop that names its item (setdown.js): greyed with why while it cannot come up (a torch on the post, the village's own).
function itemPickUpAction(prop, player) {
  const why = setdown.pickUpProblem(prop);
  const name = getItem(getDef(prop.sprite).item).name.toLowerCase();
  return act({
    kind: "pickup",
    simple: false,
    label: why ? `Pick up ${name} (${why.replace(/\.$/, "").replace(/^./, (c) => c.toLowerCase())})` : `Pick up ${name}`,
    tiles: prop.tiles,
    mx: prop.tile[0],
    my: prop.tile[1],
    enabled: !why,
    perform: () => setdown.pickUp(player, prop),
  });
}

// A station (docs/30, section 6): one entry that opens its panel; the panel calls the craft verb.
function stationActions(prop, player) {
  const list = stations.stationOf(prop);
  const label = list.length === 1 && list[0] === "cooking" ? "Cook here" : list.includes("dyevat") ? "Use the dye vat" : `Use the ${prop.sprite.replace(/_/g, " ")}`; // a fire that only cooks, else the station by name (the oven cooks too)
  return [act({
    kind: "station",
    simple: true,
    label,
    tiles: prop.tiles,
    mx: prop.tile[0],
    my: prop.tile[1] - 0.6,
    perform() {
      return stationPanel.openFor(prop, player);
    },
  })];
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

// A bracket under a canvas point (Use mode's target, #170): the nearest to the ground point under the cursor, as the right-click menu
// finds it, or null. A torch in it, a lantern, or nothing: the light verb says which ("There is no torch there.", "A lantern is always lit.").
export function bracketAt(sx, sy) {
  const g = iso.toGrid(sx, sy);
  const near = map.bracketsNear(g.gx, g.gy, 0.8); // any bracket: a Use on a lantern or an empty one gets its own word, not the grass's
  return near.length ? near[0].bracket : null;
}

// Every action for whatever is under a canvas point.
export function actionsAt(sx, sy, player) {
  const g = iso.toGrid(sx, sy);
  const tx = Math.round(g.gx);
  const ty = Math.round(g.gy);
  const out = [];
  if (player.carrying) {
    // Only walking and putting the thing down.
    out.push(...tag([putDownAction(player, tx, ty)], onTile(tx, ty)));
    if (map.isWalkableTile(tx, ty)) out.push(...tag([walkAction([tx, ty])], onTile(tx, ty)));
    return out;
  }
  for (const entry of map.itemsAt(tx, ty)) out.push(...tag(itemActions(entry, tx, ty, player), onItem(entry, tx, ty)));
  if (map.peekTile(tx, ty) && map.drinkableAt(tx, ty)) out.push(...tag(waterTileActions(tx, ty, player), onTile(tx, ty))); // the river, a pond (docs/30, law 8)
  const farmActs = tag(farmTileActions(tx, ty, player), onTile(tx, ty)); // Till the soil with a hoe, Plant with a seed (#194)
  out.push(...farmActs);
  const bucketActs = !map.peekTile(tx, ty) || map.peekTile(tx, ty).prop ? [] : tag(bucket.tileActions(tx, ty, player, act, world), onTile(tx, ty)); // a bucket: fill at water, pour on tilled soil beside a crop (#199)
  out.push(...bucketActs);
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
      out.push(...tag(propActions(prop, player), onProp(prop)));
    }
  }
  // A rug under the cursor's tile: its Pick up, with Walk here still offered beside it (#327).
  const rugHere = map.peekTile(tx, ty)?.rug;
  const rugActs = rugHere ? tag(rugActions(rugHere, player), onProp(rugHere)) : [];
  for (const o of openingsAtScreen(sx, sy)) out.push(...tag(openingActions(o, player), onEdge(o)));
  const hung = paintings.paintingAt(sx, sy); // a painting hung on a wall face under the cursor: its Pick up, with Walk here beside it (#326)
  const paintActs = hung ? tag(paintingActions(hung, player), onPainting(hung)) : [];
  out.push(...paintActs);
  for (const b of map.bracketsNear(g.gx, g.gy, 0.8)) out.push(...tag(holderActions({ kind: "bracket", bracket: b.bracket, mx: b.mx, my: b.my }, player), onBracket(b.bracket)));
  const under = characterAt(sx, sy, player);
  if (under) out.push(...tag(characterActions(under, player), onCharacter(under)));
  else if (playerAt(sx, sy, player)) out.push(...tag(characterActions(player, player), onCharacter(player)));
  out.push(...rugActs); // after the characters': a villager standing on the rug is the thing pointed at (#327)
  if (out.length === farmActs.length + bucketActs.length + rugActs.length + paintActs.length && map.isWalkableTile(tx, ty)) out.push(...tag([walkAction([tx, ty])], onTile(tx, ty))); // nothing else here (Till and Plant do not stand in for it)
  return out;
}

// The nearest simple action within range, for the E key and the prompt.
export function nearestSimpleAction(player) {
  if (player.carrying) {
    const [tx, ty] = putDownTarget(player);
    const a = putDownAction(player, tx, ty, true);
    a.target = onTile(tx, ty);
    return a.enabled ? a : null;
  }
  let best = null;
  let bestD = Infinity;
  // A loose thing lying on a tile is picked up before a container on the same tile is opened (Michael's playtest,
  // 2026-10-14: with a sack on the ground and an item dropped beside it, E always opened the sack, already open, so
  // the item could only be taken from the menu). A tie in distance goes to the pick-up.
  const rank = (a) => (a.kind === "item" ? 0 : 1);
  const consider = (actions) => {
    for (const a of actions) {
      if (!a.simple || a.enabled === false) continue;
      const d = distToTiles(player, a.tiles);
      if (d <= a.range && canReach(player, a.tiles, a.range) && (d < bestD - 1e-9 || (d <= bestD + 1e-9 && best && rank(a) < rank(best)))) {
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
      for (const entry of map.itemsAt(px + dx, py + dy)) consider(tag(itemActions(entry, px + dx, py + dy, player), onItem(entry, px + dx, py + dy)));
      if (map.drinkableAt(px + dx, py + dy)) consider(tag(waterTileActions(px + dx, py + dy, player), onTile(px + dx, py + dy))); // E at the bank
      if (t.prop && !seen.has(t.prop)) {
        seen.add(t.prop);
        consider(tag(propActions(t.prop, player), onProp(t.prop)));
      }
    }
  }
  for (const o of map.openingsNear(player.gx, player.gy, INTERACT_RANGE)) consider(tag(openingActions(o, player), onEdge(o)));
  for (const b of map.bracketsNear(player.gx, player.gy, INTERACT_RANGE)) consider(tag(holderActions({ kind: "bracket", bracket: b.bracket, mx: b.mx, my: b.my }, player), onBracket(b.bracket)));
  // A body lying within reach (a corpse is a container, docs/19).
  for (const c of allCharacters()) {
    if (Math.abs(c.gx - player.gx) > 3 || Math.abs(c.gy - player.gy) > 3) continue;
    if ((c.kind === "zombie" || c.kind === "player") && c.dead && c.corpse) consider(tag(characterActions(c, player), onCharacter(c)));
    else if (c.kind === "villager" && !c.dead) consider(tag(characterActions(c, player), onCharacter(c))); // E talks to the nearest villager (docs/34)
  }
  // A laid rug is under the player's feet as often as not, so it is E's last resort: Pick up only when nothing else is in reach (#327).
  if (!best) {
    const seenRugs = new Set();
    for (let dy = -2; dy <= 2; dy++) {
      for (let dx = -2; dx <= 2; dx++) {
        const r = map.peekTile(px + dx, py + dy)?.rug;
        if (r && !seenRugs.has(r)) {
          seenRugs.add(r);
          consider(tag(rugActions(r, player), onProp(r)));
        }
      }
    }
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
  if (action.present) player.presentFor = action.duration;
  return true;
}

// Advance a timed action. Returns progress 0..1 or null when idle. Keyboard
// movement or drifting out of range cancels it.
export function updateAction(player, dt) {
  const a = player.action;
  if (!a) return null;
  if (player.moving || distToTiles(player, a.action.tiles) > a.action.range + 0.2 || !canReach(player, a.action.tiles, a.action.range + 0.2)) { // drifting out of range, or behind a wall, cancels it
    player.action = null;
    if (a.action.present) player.presentFor = 0;
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
        if (!lineOfSight(x, y, tx, ty)) continue; // a tile with a clear line to it, so a player behind a wall walks round (#208)
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

// Do an action now if in range, else walk over and do it on arrival. A `local` action (Inspect) only reads the world: it runs here, on a
// guest too, and only from where it can be done; it never walks.
export function runAction(player, action) {
  if (action.enabled === false) return;
  if (action.local) {
    if (canReach(player, action.tiles, action.range)) startAction(player, action);
    else showMessage("You can't see it well from here.");
    return;
  }
  if (canReach(player, action.tiles, action.range)) {
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
    if (onHold && !k.consumed && k.held >= HOLD_TIME) {
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
  // On a guest the action runs on the host and arrives as a description (net.js record): its bar is the host's progress.
  if (player.actionView) {
    const a = player.actionView;
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
      showMessage("No room in your bag to unequip the old one.");
      return false;
    }
  }
  player.worn[def.wear] = entry;
  return true;
}

// The keys' events for this step, from the keyboard here: a tap or a hold of E and B (the trackers'
// state is this client's), a press of E, a press of T. They ride in the player's snapshot (main.js), so
// a guest's go to the host in its input and the host performs them for the guest's player (game.step;
// docs/31/05 item 10, tier 3). Nothing pressed gives an empty object, which the snapshot leaves out.
// The belt keys, 1 to 4, as key events in the player's snapshot (item 4): performed by the world's step for the
// player whose client pressed them (updateInteract), here or on the host.
export function beltEvents() {
  let ev = null;
  for (let i = 1; i <= 4; i++) if (input.wasPressed(`Digit${i}`)) (ev = ev || {})[`belt${i}`] = true;
  return ev;
}

// The wave (docs/43 section 7): G, or /wave typed in the chat (main.js calls `queueWave`), is a key event `wave` in this client's next snapshot.
// The queue is this client's input, as the key trackers are, never world state.
let waveQueued = false;
export function queueWave() {
  waveQueued = true;
}

export function keyEvents(dt) {
  const ev = {};
  track(keyE, dt, null, () => { ev.eTap = true; }); // no hold of E: a long press is a tap on its release
  track(keyB, dt, () => { ev.bHold = true; }, () => { ev.bTap = true; });
  if (input.wasPressed("KeyE")) ev.ePressed = true;
  if (input.wasPressed("KeyT")) ev.t = true;
  if (input.wasPressed("KeyG") || waveQueued) ev.wave = true;
  waveQueued = false;
  return Object.keys(ev).length ? ev : null;
}

// What the keys do to a player: E the nearest simple action, on its release however long it was held; B's tap a board
// on the nearest opening, its hold a board pulled; T the torch in or out of hand. The events are the
// player's own client's (keyEvents), handed in by the step with its snapshot.
export function updateInteract(player, dt, keys) {
  if (!keys) return;
  // The belt (docs/11; the belt as utility slots, Michael 2026-10-10 late): a consumable on the slot is used; anything
  // else swaps with its hand. Moved from main.js into the world's step (item 4), so a guest's press reaches its body.
  for (let i = 0; i < 4; i++) if (keys[`belt${i + 1}`]) beltPress(player, i);
  if (keys.wave && !wave(player) && player.carrying) showMessage("Your arms are full."); // the wave (docs/43 section 7): played for its seconds, a field of the light record
  if (player.carrying) {
    // Only E, and only to put it down.
    if (keys.ePressed) {
      const a = nearestSimpleAction(player);
      if (a) startAction(player, a);
      else showMessage("No room to put it down there.");
    }
    return;
  }
  if (keys.eTap && !player.action) {
    const a = nearestSimpleAction(player);
    if (a) startAction(player, a);
  }
  if (keys.bHold) {
    const o = nearestOpening(player);
    if (o) {
      const a = openingActions(o, player).find((x) => x.kind === "pull");
      if (a && a.enabled === false) showMessage(toolProblem(player, tuning.world.boardTool) || "There is no board to pull.");
      else if (a) startAction(player, a);
    }
  } else if (keys.bTap) {
    const o = nearestOpening(player);
    if (o) {
      const a = openingActions(o, player).find((x) => x.kind === "board");
      if (a && a.enabled) startAction(player, a);
      else if (a) showMessage(toolProblem(player, tuning.world.boardTool) || "You need a plank.");
      else if (map.isFence(o.wall)) showMessage("A gate takes no boards.");
    }
  }
  if (keys.t) toggleTorch(player);
}

// T (Michael, 2026-10-17, #156): the torch in a hand, else on the belt, is lit with a tinderbox carried and put out when it
// is lit; with no tinderbox it says why; with none in hand or on the belt, the one in the bag is taken into a hand (unlit).
function toggleTorch(player) {
  const belt = beltOf(player) || [];
  const e = heldEntry(player.hands, "torch") || belt.find((q) => q && q.id === "torch");
  if (e) {
    if (e.lit) {
      e.lit = false;
      showMessage("You put out the torch."); // "Put out" everywhere, never "douse" (docs/43, section 3)
    } else if (countAll(player, "tinderbox") <= 0) showMessage("You need a tinderbox to light it.");
    else {
      e.lit = true;
      showMessage("You light the torch.");
    }
    return;
  }
  const found = findItem(player, "torch");
  if (!found) return showMessage("No torch on you.");
  equipFrom(player, found.entry);
  showMessage("You take the torch in hand. T lights it.");
}

// Eat one of a food entry (the bag's menu, the belt's menu and its key all come here; a guest's reach it as the host's command). Eaten
// full or not (Michael, 2026-10-18); true when one was eaten.
function eatOne(player, entry, def, take) {
  if (!eat(player, def)) return false;
  entry.count -= 1;
  if (entry.count <= 0) take();
  return true;
}

function beltPress(player, i) {
  const belt = beltOf(player);
  const e = belt && belt[i];
  const def = e && getItem(e.id);
  if (def && !def.hands && (def.kind === "food" || def.capacity)) {
    if (def.kind === "food") {
      eatOne(player, e, def, () => { belt[i] = null; });
    } else if ((e.fill ?? 0) > 0) drink(player, e);
    else showMessage("It is empty.");
    return;
  }
  const r = beltKey(player, i);
  if (r === "nobelt") showMessage("No belt, or no such slot.");
  else if (r === "handsfull") showMessage("Your hands are full.");
}

// ---- the item menus, for the panel ----

// An item in a grid: yours or an open container's.
export function itemMenu(player, entry, bag, otherBag) {
  const def = getItem(entry.id);
  const out = [];
  const mine = bag === bagOf(player);
  // Use: pick the thing up as what you are about to use on something (docs/30, law 2; Michael, 2026-10-12).
  out.push({ label: "Use", enabled: true, onSelect: () => use.begin(entry, { kind: "bag", bag }) });
  // A rug is laid from the bag: Place begins the ghost on the floor (placement.js; #327).
  if (def.rug && mine) out.push({ label: "Place", enabled: true, onSelect: () => placement.beginRug(entry) });
  // A painting is hung from the bag: Place begins the ghost on a wall's face (placement.js; #326).
  if (def.painting && mine) out.push({ label: "Place", enabled: true, onSelect: () => placement.beginPainting(entry) });
  // A Campfire item is set down from the bag: Place begins the ghost on the ground (placement.js; docs/43, section 3).
  if (def.place === campfire.SPRITE && mine) out.push({ label: "Place", enabled: true, onSelect: () => placement.beginCampfire(entry) });
  // An item that sets down as its prop (a torch post, a decorative pumpkin) or hangs on a wall (a bracket; docs/43, section 4); food placed as
  // decoration is one way (it comes back a decoration, not food), so the entry says so.
  if (def.place && def.place !== campfire.SPRITE && mine) out.push({ label: "Place", enabled: true, onSelect: () => placement.beginSetdown(entry) });
  if (def.placeAs && mine) out.push({ label: "Place as decoration (it will not be food again)", enabled: true, onSelect: () => placement.beginSetdown(entry) });
  if (def.bracket && mine) out.push({ label: "Place", enabled: true, onSelect: () => placement.beginBracket(entry) });
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
    // One verb for putting anything on, one for taking it off (Michael, 2026-10-15): Equip and Unequip, never Wear or Take off.
    out.push({ label: def.bag ? `Equip (${def.bag[0]}×${def.bag[1]})` : "Equip", enabled: true, onSelect: () => wearFrom(player, entry, bag) });
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
    out.push({ label: "Eat", enabled: true, onSelect: () => { eatOne(player, entry, def, () => grid.remove(bag, entry)); } });
  }
  if (def.capacity) {
    const pct = Math.round(entry.fill ?? 0);
    out.push({ label: drinkLabel(entry, pct), enabled: pct > 0, onSelect: () => drink(player, entry) });
    const boil = mine ? boilSkinEntry(player, entry) : null; // a skin of yours, not one in a chest
    if (boil) out.push(boil);
  }
  if (def.splitsInto && mine) {
    const s = def.splitsInto;
    const noAxe = toolProblem(player, tuning.world.splitTool); // splitting is hatchet work (#215)
    out.push({
      label: `Split into ${s.count} ${getItem(s.id).name.toLowerCase()}s${noAxe ? ` (need a ${toolName(tuning.world.splitTool)})` : ""}`,
      enabled: !noAxe,
      onSelect: () => {
        if (toolProblem(player, tuning.world.splitTool)) { showMessage(toolProblem(player, tuning.world.splitTool)); return; }
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
      label: "Unequip",
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
    const bdef = getItem(entry.id);
    // A food on the belt is eaten from it, and a skin drunk from it (Michael, 2026-10-18, #179: "being able to eat from your belt"): the
    // slot's first entry, so a double-click does it; a hand item is equipped as before.
    if (bdef.kind === "food") {
      out.push({ label: "Eat", enabled: true, onSelect: () => { eatOne(player, entry, bdef, () => { belt[Number(key)] = null; }); } });
    } else if (bdef.capacity) {
      const pct = Math.round(entry.fill ?? 0);
      out.push({ label: drinkLabel(entry, pct), enabled: pct > 0, onSelect: () => drink(player, entry) });
      const boil = boilSkinEntry(player, entry);
      if (boil) out.push(boil);
    } else out.push({ label: "Equip", enabled: true, onSelect: () => equipFrom(player, entry) });
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
export const CLICK_REACH = 2.6; // burn.js's DIP_REACH is the same number, kept there to keep this module out of combat's imports
const inReach = (prop, player) => !!player && canReach(player, prop.tiles, CLICK_REACH);
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
// The props stamped this step, [id, sim ms], for the frame to carry: a stamp is presentation (the sway), but
// a guest watching someone walk through a field should see it wobble (the sync check found the stamps
// differing, 2026-10-13). Drained by net.js each step.
const stamped = [];
export function takePokes() {
  return stamped.splice(0);
}
// `field` is pokedAt (a sway, kind 0) or playedAt (the well's bucket, kind 1). A guest's own click also tells the host
// (the sink net.js sets), so everyone sees it; the host's list goes out in the frame to every guest.
let stampSink = null;
export function setStampSink(fn) {
  stampSink = fn;
}
function stamp(prop, now, field = "pokedAt") {
  prop[field] = now;
  map.unsaved(prop.tile[0], prop.tile[1], false); // the stamp is saved; the wire sends it in the frame's pokes, not the chunk
  const kind = field === "playedAt" ? 1 : 0;
  if (stamped.length < 400) stamped.push([prop.id, now, kind]);
  if (stampSink) stampSink(prop.id, kind);
}

// A guest's click on a thing, performed here for its player: the same reach and rest the host's own click meets.
export function stampFromGuest(player, id, kind) {
  const prop = typeof id === "string" ? map.propById(id) : null;
  if (!prop || !inReach(prop, player)) return false;
  if (kind) return play(prop);
  const def = getDef(prop.sprite);
  if (!prop.interactable || def.sway === false || def.clickAnim) return false;
  const now = loop.simTime() * 1000;
  if (!prop.pokedAt || now - prop.pokedAt >= POKE_COOLDOWN_MS) stamp(prop, now);
  return true;
}

export function pokeAt(sx, sy, player) {
  const prop = interactableAt(sx, sy);
  if (!prop) return null;
  const def = getDef(prop.sprite);
  if (def.sway === false || def.clickAnim) return prop;
  const now = loop.simTime() * 1000; // sim milliseconds (docs/23a, C2); the renderer reads the same clock
  if (inReach(prop, player) && (!prop.pokedAt || now - prop.pokedAt >= POKE_COOLDOWN_MS)) stamp(prop, now);
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
  if (!prop.pokedAt || now - prop.pokedAt >= BRUSH_MS) stamp(prop, now);
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
// `viewer`, the player pointing, decides which of the dead are there to point at (sight.js, #88): the dark hides
// information, never physics, so a dead one lost in the dark has no hover hand and cannot be clicked or right-clicked,
// while a swing or a shot that meets it still hits it. Without a viewer nothing is hidden.
export function characterAt(sx, sy, viewer = null) {
  let best = null;
  for (const c of allCharacters()) {
    if (c.kind === "player") continue;
    if (viewer && c.kind === "zombie" && !c.dead && !sight.seen(viewer, c)) continue; // lost in the dark: nothing to point at
    const p = iso.toScreen(c.gx, c.gy);
    if (sx < p.x - 40 || sx > p.x + 40 || sy < p.y - 72 || sy > p.y + 8) continue;
    // The frame's own pixels, placed as the renderer places them; a standing one also
    // keeps the forgiving column over its feet. A body lies to one side of its feet,
    // so the column alone never found it (Michael, 2026-10-13: no Search body on a corpse).
    const standing = !c.corpse && c.kind !== "animal" && sx >= p.x - 12 && sx <= p.x + 12 && sy >= p.y - 64 && sy <= p.y + 2; // an animal is as big as its own pixels (a hen is a hand high)
    if (!standing && !characterPixelAt(c, sx, sy, p)) continue;
    if (!best || c.gx + c.gy > best.gx + best.gy) best = c;
  }
  return best;
}

// Is the point on an opaque pixel of the character's current frame?
function characterPixelAt(c, sx, sy, p) {
  let sheet;
  try { sheet = getSheet(c.sprite); } catch { return false; }
  if (!sheet || !sheet.image) return false;
  const r = resolveFacing(sheet, c.facing);
  const f = sheet.frames[frameName(sheet, c.anim.name, r.facing, c.anim.frame)];
  if (!f) return false;
  let lx = Math.floor(sx - (Math.round(p.x) - sheet.anchor[0]));
  const ly = Math.floor(sy - (Math.round(p.y) - sheet.anchor[1]));
  if (lx < 0 || ly < 0 || lx >= f[2] || ly >= f[3]) return false;
  if (r.flip) lx = f[2] - 1 - lx;
  const al = alphaOf(sheet);
  return al.a[(f[1] + ly) * al.w + f[0] + lx] > 0;
}

// A left click on a villager within reach pokes it. Returns the character under the cursor.
// A guest's click on a villager, by its id (item 4): the host has no cursor of the guest's, so the guest names it.
export function pokeVillagerFromGuest(player, id) {
  const c = allCharacters().find((q) => q.id === id && q.kind === "villager");
  if (!c || c.dead || reachProblem(player, [[c.gx, c.gy]], CLICK_REACH)) return false;
  pokeVillager(c, player);
  return true;
}

// A guest's panel closed: the host drops it from the villager's talkers (net.js `talkEnd`).
export function endTalkFromGuest(player, id) {
  const c = allCharacters().find((q) => q.id === id && q.kind === "villager");
  return !!c && endTalk(c, player.id);
}

export function clickCharacterAt(sx, sy, player) {
  const c = characterAt(sx, sy, player);
  if (c && c.kind === "villager" && canReach(player, [[c.gx, c.gy]], CLICK_REACH)) pokeVillager(c, player);
  return c;
}

// A dead zombie's body, searched like a chest (docs/19): the first time takes a
// moment and rolls its pockets; after that it just opens. The grid is the body's.
function searchBodyAction(c) {
  const tiles = [[Math.round(c.gx), Math.round(c.gy)]];
  if (c.cremate) return act({ kind: "container", simple: false, label: `${c.searched ? "Open" : "Search"} body (it is burning)`, tiles, mx: c.gx, my: c.gy, enabled: false, perform: () => false }); // burning away (docs/43 section 7)
  return act({
    kind: "container",
    simple: true,
    label: c.searched ? "Open body" : "Search body",
    tiles,
    mx: c.gx,
    my: c.gy,
    duration: c.searched ? 0 : SEARCH_TIME,
    perform() {
      if (c.cremate) return false; // set alight while the bar ran
      const bag = lootOf(c);
      c.searched = true;
      emit("containerOpened", { bag, tiles, name: "body", corpse: c, character: c });
      return true;
    },
  });
}

// What a right-click on a character offers, by kind. Everyone, the player
// included, can be set on fire and put out: a visual test with no effect
// (fire.js, docs/05 "Burning"), from anywhere on screen.
// Burn corpse (docs/43 section 7): on every body of the dead, greyed with what is lacking (a tinderbox and a log), or while it already burns;
// a timed action that runs the `burncorpse` verb by the body's id, so a guest's choice of the label is the host's doing. Its card warns in red.
function burnCorpseAction(c, player) {
  const need = burn.burnNeed(player);
  const burning = !!(c.cremate || c.burning);
  const label = burning ? "Burn corpse (already burning)" : need ? `Burn corpse (need ${need})` : "Burn corpse";
  return act({
    kind: "burncorpse",
    label,
    tiles: [[Math.round(c.gx), Math.round(c.gy)]],
    range: CLICK_REACH,
    mx: c.gx,
    my: c.gy,
    enabled: !burning && !need,
    duration: tuning.work.burnCorpse.seconds,
    card: burn.burnCard(player),
    perform() {
      return runVerb("burncorpse", player, { character: c.id });
    },
  });
}

// Look at an animal (docs/45: a name on hover and Object Highlight, not a gatherable's sway): what it is and what it is doing, said in a line.
// It only reads the world, so it is the asking client's own (`local`), a guest's too, from as far as an Inspect reaches.
function lookAtAnimalAction(c) {
  return act({
    kind: "look",
    label: `Look at the ${c.name}`,
    tiles: [[Math.round(c.gx), Math.round(c.gy)]],
    range: INSPECT_RANGE,
    local: true,
    perform() {
      showMessage(lookLine(c), 4);
      return true;
    },
  });
}

function characterActions(c, player) {
  const out = [];
  if (c.kind === "animal") return [lookAtAnimalAction(c)];
  if ((c.kind === "zombie" || c.kind === "player") && c.dead && c.corpse) out.push(searchBodyAction(c)); // a player's body too (2026-10-14)
  if (burn.isBurnableBody(c)) out.push(burnCorpseAction(c, player)); // the dead's bodies; a player's is left for its friends (docs/43 section 7)
  if (c.kind === "villager") {
    // Talk (docs/34): a simple action, so E does it when the villager is the nearest thing within reach (the prompt names it, and a door nearer wins);
    // it runs on the host as the talking player, who is told to open the panel (`talkStarted`).
    if (lineOfSight(player.gx, player.gy, c.gx, c.gy)) out.push(act({ // a wall in the way: not offered, rather than offered and refused (#230)
      kind: "talk",
      label: `Talk to ${c.name}`,
      tiles: [[Math.round(c.gx), Math.round(c.gy)]],
      range: CLICK_REACH,
      simple: true,
      enabled: !c.dead,
      perform() {
        startTalk(c, player);
        return true;
      },
    }));
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
  stamp(prop, now, "playedAt");
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
