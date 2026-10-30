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
import { getItem, toolFor, aName, countName, makeEntry, hold, release, holding, heldEntry, canHold, handFor, containerGrid, rollLoot } from "./items.js";
import { stacks as bleedStacks, clear as clearBleed } from "./bleed.js";
import { beltDraw, dropWord, beltAction, beltRole, beltPositions, BELT_EVENTS, flameOf, NO_FLAME, skinsOf, carriedTool, toolProblem } from "./inventory.js";
import { bagOf, beltOf, ensureBag, countAll, takeAll, findItem, detach, stow, equip, equipProblem, restoreOffHand, addItem, createBag, waterContainers, canStoreIn, isContainer, containerBagOf, openedBagOf, isBagOf } from "./inventory.js";
import { getDef } from "./assets.js";
import * as names from "./prop-names.js"; // a prop's name in words: its recipe's label, its definition's `name`, else its id (docs/bugs.md, 2026-10-25)
import { canPutDown, putDownTarget, canCarry, propRect } from "./placement.js";
import * as placement from "./placement.js";
import * as grid from "./grid.js";
import { autoWalk, eat, drink, wave, wake } from "./entities/player.js";
import * as burn from "./burn.js"; // Burn corpse (docs/43 section 7)
import { showMessage } from "./ui/prompt.js";
import { pokeVillager, startTalk, endTalk } from "./entities/villager.js";
import { lookLine, snareLine, workProblem, workSeconds, hasHide, leadProblem, produceProblem, speciesOf as animalSpecies } from "./entities/animal.js";
import { lootOf } from "./entities/character.js";
import { emit } from "./events.js";
import * as loop from "./loop.js";
import * as use from "./use.js"; // the Use entry on item menus (docs/30, law 2)
import * as verbs from "./verbs.js"; // the verb table (docs/31/08, habit 4)
import * as farming from "./farming.js"; // till, plant, water, harvest (#194)
import * as inspectCard from "./ui/inspect-card.js"; // an Inspect's card, its patch marked while it shows (inspect-mark.js)
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
import * as setdown from "./setdown.js"; // an item set down as its prop, a torch put on a wall, and each picked up again (docs/43, section 4)
import * as repair from "./repair.js"; // the grindstone sharpens, the anvil repairs, on one count per item (docs/43 section 6)
import * as sawpit from "./sawpit.js"; // the sawpit saws a log into planks with no hatchet (docs/43 section 6)
import * as hives from "./hives.js"; // the beehives give honey every few days (docs/43 section 6)
import * as mana from "./mana.js"; // the altar's Pray (docs/47 section 5)
import * as gather from "./gather.js"; // herbs gathered, mushrooms foraged, clay dug (docs/46 step 2, #448)
import * as trees from "./trees.js"; // sticks under a tree, a sapling's Inspect (docs/46 step 3, #449)
import * as water from "./water.js"; // tainted and clean water, and the boil verb (docs/44)
import { taintedDrink } from "./sick.js"; // a tainted drink's one roll, Sick and the infection (docs/44)
import * as potions from "./potions.js"; // a potion drunk, its vial back (docs/47 section 4, #481)

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
    else if (map.peekTile(tx, ty, player.layer || 0) && map.drinkableAt(tx, ty, player.layer || 0)) out.push(...waterTileActions(tx, ty, player));
    if (!player.carrying) out.push(...farmTileActions(tx, ty, player), ...bucket.tileActions(tx, ty, player, act, world));
    if (map.isWalkableTile(tx, ty)) out.push(walkAction([tx, ty]));
    return tag(out, t);
  }
  if (t.kind === "item") {
    const [tx, ty] = t.tile;
    const entry = map.itemsAt(tx, ty, player.layer || 0).find((e) => e.uid === t.uid);
    return entry ? tag(itemActions(entry, tx, ty, player), t) : [];
  }
  if (t.kind === "prop") {
    const prop = map.propById(t.id);
    return prop ? tag(propActions(prop, player), t) : [];
  }
  if (t.kind === "edge") {
    const o = map.openingsNear(t.tx, t.ty, 2.5, player.layer || 0).find((q) => q.tx === t.tx && q.ty === t.ty && q.edge === t.edge);
    return o ? tag(openingActions(o, player), t) : [];
  }
  if (t.kind === "bracket") {
    const b = map.bracketAt(t.tx, t.ty, t.edge, player.layer || 0); // on the player's own layer (docs/49 section 9)
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
  // The label as the guest's menu wrote it, else the same label but for a count at its end, on either side: a pile's count (a throwable's
  // Pick up, docs/24 section 1) is read from where each player stands and what each world holds that frame, so the guest's may say (3)
  // where the host's says (2), or none. The actions are the one target's, by its address, so two labels apart only by a count are one action.
  const bare = (l) => String(l).replace(/ \(\d+\)$/, "");
  const all = actionsForTarget(target, player);
  const a = all.find((q) => q.label === label) || all.find((q) => bare(q.label) === bare(label));
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
  // A container item inside another container (Michael, 2026-10-26: a satchel or a belt in a chest or on a body opens where it lies): the item
  // by its uid within the container that holds it, its tiles that container's, so it closes with it and its reach is its.
  // Never inside the player's own bag (a container there is always empty, the container rule; the review of #508: a crafted command filled one),
  // and one level only. A bag opened so is take-only (inventory.takeOnlyView), as a belt's slots are.
  if (a.entryUid && a.within) {
    const outer = a.within.within || a.within.mine ? null : containerAt(player, a.within);
    const e = outer && outer.bag.items.find((q) => q.uid === a.entryUid);
    const bag = e ? containerBagOf(e, true) : null;
    return bag ? { bag, corpse: null, tiles: outer.tiles, outer } : null;
  }
  if (a.entryUid && a.tile) {
    const e = map.itemsAt(a.tile[0], a.tile[1], player.layer || 0).find((q) => q.uid === a.entryUid);
    const bag = e ? (e.bag || (getItem(e.id).beltSlots ? containerBagOf(e) : null)) : null; // a bag's grid, or a belt's slots as a view (inventory.slotsView)
    return bag ? { bag, corpse: null, tiles: [a.tile] } : null;
  }
  if (a.characterId) {
    const c = allCharacters().find((q) => q.id === a.characterId);
    if (c && c.cremate) return null; // a body burning away (docs/43 section 7): nothing in it can be reached, and a panel open on it closes
    const bag = c ? lootOf(c) : null;
    return bag ? { bag, corpse: c, tiles: [[Math.round(c.gx), Math.round(c.gy)]] } : null;
  }
  return null;
}

// The address of an open container's grid, found again from the grid itself (the reverse of containerAt): the player's own bag, a body, a prop's
// grid or a station's output, a container item on the floor, or one inside any of those, within the panels' closing distance of the player. So a
// menu entry on an item in a container (its Open) can name where it lies for a guest and for the host's own panel. Null when it is none of these.
export function addressOfBag(player, bag) {
  if (!bag) return null;
  if (bag === bagOf(player)) return { mine: true };
  const r = Math.ceil(tuning.world.containerCloseDist) + 2;
  const px = Math.round(player.gx);
  const py = Math.round(player.gy);
  const outers = []; // [address, bag] of every container near, for the search one level in
  for (const c of allCharacters()) {
    if (!c.loot || Math.hypot(c.gx - player.gx, c.gy - player.gy) > r) continue;
    if (c.loot === bag) return { characterId: c.id };
    outers.push([{ characterId: c.id }, c.loot]);
  }
  const seen = new Set();
  for (let dy = -r; dy <= r; dy++) {
    for (let dx = -r; dx <= r; dx++) {
      const x = px + dx;
      const y = py + dy;
      const t = map.peekTile(x, y);
      if (!t) continue;
      const p = t.prop;
      if (p && !seen.has(p)) {
        seen.add(p);
        if (p.bag === bag) return { propId: p.id };
        if (p.output && p.output === bag) return { propId: p.id, name: "output" }; // read as it is: a hit test never makes an output bag (stations.outputOf would)
        if (p.bag) outers.push([{ propId: p.id }, p.bag]);
      }
      for (const e of map.itemsAt(x, y, player.layer || 0)) {
        if (!openedBagOf(e)) continue;
        if (isBagOf(e, bag)) return { entryUid: e.uid, tile: [x, y] };
        if (e.bag) outers.push([{ entryUid: e.uid, tile: [x, y] }, e.bag]);
      }
    }
  }
  for (const [address, outer] of outers) {
    for (const e of outer.items) if (isBagOf(e, bag)) return { entryUid: e.uid, within: address };
  }
  return null;
}

// Open a container item where it lies in another container (Michael, 2026-10-26): a satchel in a chest, a belt on a body. Its grid (or the belt's
// view) opens as a container panel, Take All with it; a guest is told by the item's uid within the outer container's address (host.js `within`).
function openWithin(player, entry, outerBag) {
  const within = addressOfBag(player, outerBag);
  if (!within || within.mine || within.within) return false; // never in my own bag, never two levels deep: refused before anything is made
  const outer = containerAt(player, within);
  if (!outer || !outer.bag.items.includes(entry)) return false;
  const bag = containerBagOf(entry, true); // take-only, as a belt's slots are (the review of #508)
  if (!bag) return false;
  for (const [tx, ty] of outer.tiles) map.touch(tx, ty); // a bag's grid made on first use travels with what holds it
  const address = { entryUid: entry.uid, within };
  emit("containerOpened", { bag, tiles: outer.tiles, name: getItem(entry.id).name.toLowerCase(), entry, within, address });
  return true;
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
      map.takeItem(tx, ty, entry, player.layer || 0);
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
        emit("containerOpened", { bag, tiles, name: def.name.toLowerCase(), entry, tile: [tx, ty], address: { entryUid: entry.uid, tile: [tx, ty] } });
        return true;
      },
    })];
    out.push(wearAction(entry, tx, ty, player));
    if (canStoreIn(entry)) out.push(pickUpAction(entry, tx, ty, player, false));
    return out;
  }
  const out = [];
  const storable = canStoreIn(entry);
  // A belt on the ground opens where it lies, its slots as a container with Take All (Michael, 2026-10-26, The playtest's rulings); E opens one
  // that holds something and picks up an empty one, as before.
  if (def.beltSlots) {
    out.push(act({
      kind: "container",
      simple: !storable,
      label: `Open ${def.name.toLowerCase()}`,
      tiles,
      mx: tx,
      my: ty,
      perform() {
        const view = containerBagOf(entry);
        if (!view) return false;
        map.touch(tx, ty); // its slots made on first use and laid out in the view travel with its tile, as a bag's grid does
        emit("containerOpened", { bag: view, tiles, name: def.name.toLowerCase(), entry, tile: [tx, ty], address: { entryUid: entry.uid, tile: [tx, ty] } });
        return true;
      },
    }));
  }
  out.push(pickUpAction(entry, tx, ty, player, storable));
  if (def.wear) out.push(wearAction(entry, tx, ty, player));
  return out;
}

// A throwable's pile (docs/24 section 1): every one of its kind lying on this tile and its neighbours, each floor entry as itself, so a
// fight's worth of knives comes up with one press of E or one Pick up. Anything else is the one entry. A neighbour counts only when the
// player can reach it by the one reach test (#208): a wall, a shut door, or shut shutters between keep what lies past them where it is
// (a sealed room is a cell, #147). Its reach is the action's and the pile's own spread, a tile and a diagonal, past the chosen tile.
const PILE_SPREAD = 1.5;
function pileOf(entry, tx, ty, player) {
  const def = getItem(entry.id);
  if (!(def.thrown && def.stack)) return [[entry, tx, ty]];
  const out = [[entry, tx, ty]];
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      const x = tx + dx;
      const y = ty + dy;
      const here = map.itemsAt(x, y, player.layer || 0).filter((e) => e.id === entry.id && e !== entry);
      if (here.length && (dx || dy) && !canReach(player, [[x, y]], INTERACT_RANGE + PILE_SPREAD)) continue;
      for (const e of here) out.push([e, x, y]);
    }
  }
  return out;
}

function pickUpAction(entry, tx, ty, player, simple) {
  const def = getItem(entry.id);
  const tiles = [[tx, ty]];
  const pile = pileOf(entry, tx, ty, player);
  const fill = entry.fill != null ? ` (${Math.round(entry.fill)}%)` : "";
  const total = pile.reduce((n, [e]) => n + (e.count || 1), 0);
  const count = total > 1 ? ` (${total})` : "";
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
        // The pile, one floor entry at a time (one entry unless it is a throwable's): what fits comes up, the rest stays where it lies.
        let any = false;
        for (const [e, x, y] of pileOf(entry, tx, ty, player)) {
          const added = addItem(bag, e.id, e.count, e.fill != null ? { fill: e.fill } : {});
          if (added <= 0) break;
          any = true;
          e.count -= added;
          if (e.count <= 0) map.takeItem(x, y, e, player.layer || 0);
          else map.touch(x, y); // a part of a stack came up: the count left on the floor reaches a guest
        }
        if (!any) {
          showMessage("No room in your bag.");
          return false;
        }
        return true;
      }
      map.takeItem(tx, ty, entry, player.layer || 0);
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
  return names.propName(prop.sprite); // "dye vat", "jack-o'-lantern", never the raw id (docs/bugs.md, 2026-10-25)
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

// Whether a prop still stands where an action found it (`tiles`, its tiles then): the registry answers its id with it, and it is on
// those tiles and every one of them holds it. Lifted, taken apart, or carried off and set down elsewhere, it is not.
export function stillStanding(prop, tiles = prop && prop.tiles) {
  if (!prop || map.propById(prop.id) !== prop || !tiles || tiles.length !== prop.tiles.length) return false;
  return tiles.every(([x, y], i) => {
    const t = map.peekTile(x, y, prop.layer || 0);
    return prop.tiles[i][0] === x && prop.tiles[i][1] === y && !!t && t.prop === prop;
  });
}

function carryAction(prop, player) {
  const at = prop.tiles.map(([x, y]) => [x, y]); // where it stood when the action was found: the walk goes there
  const free = !player.hands.main && !player.hands.off;
  const busy = !!(prop.queue && prop.queue.length); // a station mid-job stays where it is (the review of #462), as Take apart refuses it
  return act({
    kind: "carry",
    label: busy ? `Pick up ${propName(prop)} (${names.propIsPlural(prop.sprite) ? "they are" : "it is"} still making something)` : free ? `Pick up ${propName(prop)}` : `Pick up ${propName(prop)} (needs both hands)`,
    tiles: prop.tiles,
    mx: prop.tile[0],
    my: prop.tile[1],
    enabled: free && !player.carrying && !busy,
    perform() {
      if (player.carrying || !(!player.hands.main && !player.hands.off) || (prop.queue && prop.queue.length)) return false;
      // Still where it stood (#341, as a rug's Pick up, #339): a walk to it (a guest's command, or a far click) that meets someone else's
      // lift, or its Take apart, gets nothing, never a second of the same chest.
      if (!stillStanding(prop, at)) {
        showMessage(`The ${propName(prop)} ${names.propIsPlural(prop.sprite) ? "are" : "is"} not there any more.`);
        return false;
      }
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
      map.placeProp(prop, tx, ty, player.layer || 0); // put down on the layer the player stands on (docs/49)
      player.carrying = null;
      return true;
    },
  });
}

// A container prop's bag, made on first use from its loot table's grid.
export function propBag(prop) {
  if (!prop.bag) {
    const [cols, rows] = containerGrid(prop.container.loot);
    const d = getDef(prop.sprite);
    prop.bag = createBag(cols, rows, names.containerName(prop.sprite));
    if (d.accepts) prop.bag.accepts = d.accepts; // a feeding trough takes feed alone (docs/45)
    prop.searched = !!d.searched; // a container that is never rolled (a feeding trough) opens at once
    if (d.searched) map.markProp(prop); // never searched, so no search marks it: its grid goes to a guest from here
    else map.unsavedProp(prop, false); // made on first use, by whichever path asks first
  }
  return prop.bag;
}

function containerActions(prop) {
  const name = names.containerName(prop.sprite);
  const open = prop.searched || !!getDef(prop.sprite).searched; // a container never rolled (a feeding trough) opens at once, as itself
  return [act({
    kind: "container",
    simple: true,
    label: open ? `Open ${name}` : `Search ${name}`,
    tiles: prop.tiles,
    mx: prop.tile[0],
    my: prop.tile[1],
    duration: open ? 0 : SEARCH_TIME,
    perform() {
      const bag = propBag(prop);
      if (!prop.searched) {
        prop.searched = true;
        // Rolled loot is placed into the grid; what does not fit is not spawned.
        if (!bag.items.length) grid.fill(bag, rollLoot(prop.container.loot));
        map.touchProp(prop); // a change on the prop: the save and the wire carry it (docs/31/05, item 6)
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
  if (f.switch) return switchActions(prop, player); // a fireplace, a fire pit: on and off, no fuel (docs/43, section 3)
  if (prop.sprite === campfire.SPRITE) return campfireActions(prop, player);
  const name = names.propName(prop.sprite);
  const fuelId = f.fuelItem;
  const fuelA = aName(fuelId); // "a log", "some charcoal" (items.aName: the fuel's `noun`)
  const have = countAll(player, fuelId);
  const full = f.fuel >= f.maxFuel;
  const hours = map.fireHoursLeft(prop);
  const left = f.lit ? `, ${hours < 1 ? "under an hour" : `${Math.round(hours)} h`} left` : "";
  // Lighting a fire that is out needs a flame carried too (Michael, 2026-10-17, #168): a tinderbox or a lit torch, the light verb's rule.
  const flame = f.lit ? true : !!flameOf(player);
  let label;
  if (!f.lit) label = !have ? `Light the ${name} (need ${fuelA})` : flame ? `Light the ${name} (${fuelA})` : `Light the ${name} (need a tinderbox or a flame)`;
  else if (full) label = `The ${name} is full (${countName(fuelId, f.maxFuel)}${left})`;
  else label = have ? `Feed the ${name} (${Math.ceil(f.fuel)} of ${f.maxFuel}${left})` : `Feed the ${name} (need ${fuelA}${left})`;
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
// fire pit, a lantern on a post. Light it with a flame carried (a tinderbox or a lit torch, #168); put it out with nothing. It burns no fuel.
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
    // A torch a player put on a wall (Place torch, #523) is picked up with its bracket; the map's own brackets keep theirs and give the torch.
    if (bk && bk.wall.bracket.made) return [...out, ...putOut, act({ kind: "holder", simple: true, label: "Pick up torch", tiles, mx, my, perform: () => setdown.pickUpTorch(player, bk) })];
    return [...out, ...putOut, act({
      kind: "holder",
      simple: true,
      label: "Take the torch",
      tiles,
      mx,
      my,
      perform() {
        // As burnt as it is, and out: a torch leaving a holder is doused (#156); a bracket's keeps its own uid (#523).
        const st = map.holderState(target);
        const entry = bk ? map.torchEntryOf(bk.wall.bracket) : makeEntry("torch", 1, { wear: st.wear || 0, lit: false });
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

// The name of the tool a verb belongs to with its article, for a greyed entry: "a smith's hammer", "shears" (items.aName).
const toolName = (verb) => { const t = toolFor(verb); return t ? aName(t.id) : "a tool"; };

// Doors and windows: open and close, board and pull (docs/09). Nobody climbs through a window (Michael, 2026-10-16).
function openingActions(o, player) {
  const w = o.wall;
  const gate = map.isGate(w); // a castle gate (docs/02, 2026-10-29): E opens and shuts the whole of it, and it is never boarded
  const name = gate ? "gate" : w.kind === "door" ? "door" : "shutters";
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
    out.push(act({ ...base, kind: "opening", label: gate ? "A broken gate" : w.kind === "door" ? "A broken doorway" : "Broken shutters", enabled: false }));
  } else {
    out.push(act({
      ...base,
      kind: "opening",
      simple: true,
      label: open ? `Close ${name}` : `Open ${name}`,
      perform() {
        if (gate) return map.setGateOpen(o.tx, o.ty, o.edge, !w.open, map.layerOf(w.at)); // every edge of the gate at once, each touched
        if (w.kind === "door") w.open = !w.open;
        else w.shutter = w.shutter === "open" ? "closed" : "open";
        map.touch(o.tx, o.ty, map.layerOf(w.at)); // the wall's own tile on its layer, so the save and the wire carry it (docs/31/05, item 6; it touched nothing before)
        return true;
      },
    }));
  }
  const planks = countAll(player, "plank");
  const noHammer = toolProblem(player, tuning.world.boardTool); // the tool rule (#215): boarding and pulling are hammer work
  const need = noHammer ? toolName(tuning.world.boardTool) : "";
  if (mine.length < map.BOARDS_PER_SIDE && !map.isFence(w) && !gate) { // a fence takes no boards, a gate included (map.addBoard), nor does a castle gate
    out.push(act({
      ...base,
      kind: "board",
      label: noHammer ? `Board up (need ${need})` : planks ? `Board up (${mine.length}/${map.BOARDS_PER_SIDE})` : "Board up (need a plank)",
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
      label: noHammer ? `Pull a board (need ${need})` : `Pull a board (${mine.length} this side, the plank comes back)`,
      duration: PULL_TIME,
      enabled: !noHammer,
      perform() {
        if (toolProblem(player, tuning.world.boardTool)) { showMessage(toolProblem(player, tuning.world.boardTool)); return false; }
        if (!map.pullBoard(w, side)) return false;
        const back = addItem(bagOf(player), "plank", 1); // pulled with a hammer, the plank comes back (#215)
        if (back < 1) map.dropItem(Math.round(player.gx), Math.round(player.gy), makeEntry("plank", 1), player.layer || 0);
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
  if (farming.stageOf(prop) >= 2) out.push(act({ ...base, kind: "harvest", simple: !noTool, label: noTool ? `Harvest ${def.name} (need ${toolName(cropTool)})` : `Harvest ${def.name}`, enabled: !noTool, duration: soil.seconds.harvest, perform: run("harvest") }));
  else {
    const days = Math.max(1, Math.ceil(farming.daysLeft(prop)));
    out.push(act({ ...base, kind: "harvest", label: farming.isWet(prop) ? `Growing (ready in about ${days} day${days > 1 ? "s" : ""})` : `Dry: waiting for water (about ${days} more day${days > 1 ? "s" : ""} of growth)`, enabled: false }));
  }
  // Water, an entry for each vessel carried that can: the bucket first (it waters the 3 by 3), then the skin, each named, so the choice is the
  // player's (Michael's playtest, 2026-10-26: the skin was used unasked with a full bucket carried). E never waters (a crop's E is its harvest).
  const pour = bucket.tileActions(prop.tile[0], prop.tile[1], player, act, world).filter((a) => a.kind === "pour");
  out.push(...pour);
  const skin = farming.skinFor(player, null);
  if (skin) out.push(act({ ...base, kind: "water", label: `Water with the ${getItem(skin.id).name.toLowerCase()}`, duration: soil.seconds.water, enabled: true, perform: run("water") }));
  else if (!pour.length) out.push(act({ ...base, kind: "water", label: "Water (no water carried)", duration: soil.seconds.water, enabled: false, perform: run("water") }));
  out.push(inspectCropAction(prop, base));
  return out;
}

// Inspect a crop (Michael, 2026-10-19): what it is, how long until it is ready, whether it is watered or fertilized, and what harvests
// it, said on a card above the patch with a close button (ui/inspect-card.js, Michael's playtest 2026-10-26; a line at the top until then),
// with the patch's tile marked on the ground while the card shows (inspect-mark.js). It only reads the world, so it
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
      inspectCard.open({ id: prop.id, tiles: prop.tiles, read: (p) => (p.crop ? cropReport(p) : "") });
      return true;
    },
  });
}

// Inspect a planted sapling (docs/46 step 3): how long until it is a tree, said in a line with its tile marked, as a crop's Inspect; the
// asking client's own (`local`), read from the prop's stamp and the clock, a guest's too.
function inspectSaplingAction(prop) {
  return act({
    kind: "inspect",
    label: "Inspect",
    tiles: prop.tiles,
    mx: prop.tile[0],
    my: prop.tile[1],
    range: INSPECT_RANGE,
    local: true,
    perform() {
      inspectCard.open({ id: prop.id, tiles: prop.tiles, name: "Sapling", read: (p) => (p.sapling ? trees.report(p) : "") });
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
  parts.push(def.tool ? `harvest with ${toolName(def.tool)}` : "harvest by hand");
  return `${name}: ${parts.join("; ")}.`;
}

// A tile's farming (#194): the hoe in a hand tills bare grass or dirt, a seed carried is planted in empty soil.
function farmTileActions(tx, ty, player) {
  const out = [];
  const soil = farming.get().soil;
  const t = map.peekTile(tx, ty);
  if (!t || t.prop) return out;
  if (!lineOfSight(player.gx, player.gy, tx, ty, player.layer || 0)) return out; // a wall in the way: not offered, rather than offered and refused (the verbs refuse it too)
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
  // Fill waterskins at a tainted source skips a skin holding clean water; an empty or a tainted one still fills (Michael, 2026-10-26: the
  // auto-sip keeps the clean skin the one never full, and a Fill tainted it all). A clean source fills every skin not full.
  const holdsClean = (it) => (it.fill ?? 0) > 0 && !water.isTainted(it);
  const notFull = () => skinsOf(player).filter((it) => (it.fill ?? 0) < 100); // the belt's skin too (#215)
  const toFill = () => notFull().filter((it) => source.clean || !holdsClean(it));
  const keptClean = () => !toFill().length && notFull().some(holdsClean); // every skin that could take water holds clean water
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
    // Every skin skipped for its clean water: offered, and at once says why (by its label too, a guest's command).
    keptClean() ? act({
      kind: "fill",
      label: "Fill waterskins (they hold clean water)",
      tiles: source.tiles,
      mx: source.mx,
      my: source.my,
      perform() {
        showMessage(water.CLEAN_KEPT);
        return false;
      },
    }) : act({
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
  return waterActions({ tiles: prop.tiles, mx: prop.tile[0], my: prop.tile[1] - 0.6, name: names.propName(prop.sprite), clean: water.cleanSource(prop.sprite), onStart: () => play(prop) }, player); // the bucket goes down for the water; named for what it is (a trough, a font: the wiki census's bugs, 2026-10-15)
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
  if ((prop.layer || 0) !== (player.layer || 0)) return []; // a thing on another floor is out of reach (docs/49 section 9): the chest under your feet is not yours to open from upstairs
  if (getDef(prop.sprite).rug) return rugActions(prop, player); // a laid rug has one action: Pick up (#327)
  const out = [];
  if (prop.container) out.push(...containerActions(prop));
  if (prop.fire && prop.fire.burns) out.push(...fireActions(prop, player));
  else if (prop.fire && prop.fire.switch) out.push(...switchActions(prop, player)); // a lantern post (docs/43, section 3)
  if (prop.fire && prop.fire.holds) out.push(...holderActions({ kind: "post", prop }, player));
  // A tree's own actions first, then Gather sticks (docs/46 step 3), the menu's alone: never E's, which opens doors (Primary on #461).
  if (prop.wood) out.push(...pickActions(prop, player), ...treeActions(prop, player), ...trees.propActions(prop, player, act, world));
  if (prop.sapling) out.push(inspectSaplingAction(prop)); // a planted sapling: how long until it is a tree, the asking client's own line
  if (prop.crop) out.push(...cropActions(prop, player)); // its Water entries are the bucket's and the skin's, each named (cropActions)
  out.push(...mineActions(prop, player));
  out.push(...gather.propActions(prop, player, act, world)); // an herb, a mushroom, a clay bank (docs/46 step 2): nothing on any other prop
  if (prop.water) out.push(...wellActions(prop, player), ...bucket.tileActions(prop.tile[0], prop.tile[1], player, act, world));
  if (getDef(prop.sprite).sleep) out.push(...sleepAction(prop, player));
  if (stations.stationOf(prop).length) out.push(...stationActions(prop, player));
  if (prop.fire && prop.fire.cooks && prop.fire.lit) out.push(...[boilAtFireAction(prop, player)].filter(Boolean), ...boilBucketAtFire(prop, player)); // Boil water at a lit cooking fire (docs/44), a skin's and a bucket's
  out.push(...repair.propActions(prop, player, act, world), ...sawpit.propActions(prop, player, act, world), ...hives.propActions(prop, player, act, world), ...mana.propActions(prop, player, act)); // docs/43 section 6, and the altar's Pray (docs/47 section 5): each is nothing on a prop that is not its own
  if (canCarry(prop)) out.push(carryAction(prop, player));
  if (prop.snare) out.push(lookAtSnareAction(prop)); // a set snare (docs/45 section 2): what it holds, the asking client's own line
  if (getDef(prop.sprite).item && (prop.made || !getDef(prop.sprite).station)) out.push(itemPickUpAction(prop, player)); // a torch post, a decoration, your own cauldron: back into the bag as its item (docs/43, section 4); the witch's is no one's to lift (docs/47 section 3)
  if (prop.made) out.push(takeApartAction(prop, player)); // only what a player made (docs/43, section 2)
  return out;
}

// Boil water at a lit cooking fire (docs/44 section 2): the fire's menu boils the fullest tainted skin carried, greyed with why when none is. The bar
// is water.boilAction's, the same as the Use mode's and the skin's menu's; a guest's choice of the label does the same on the host.
function boilAtFireAction(prop, player) {
  const skin = water.taintedSkins(player)[0] || null;
  if (!skin && water.taintedBucket(player)) return null; // tainted water is carried, in a bucket: its own entry follows, and this one says nothing untrue
  if (!skin) return act({ kind: "boil", label: `Boil water (${water.NO_TAINTED.replace(/\.$/, "").toLowerCase()})`, tiles: prop.tiles, mx: prop.tile[0], my: prop.tile[1] - 0.6, enabled: false });
  return act(water.boilAction(player, skin.uid, prop));
}

// A bucket's boil at the fire (Michael, 2026-10-26, The playtest's rulings): its own entry beside the skin's, "Boil water in the bucket", for the
// fullest bucket of tainted water carried, greyed with why when every bucket carried is empty or clean; nothing when no bucket is carried.
function boilBucketAtFire(prop, player) {
  if (!water.bucketsCarried(player).length) return [];
  const b = water.taintedBucket(player);
  if (!b) return [act({ kind: "boil", label: `${water.BOIL_BUCKET} (no tainted water in it)`, tiles: prop.tiles, mx: prop.tile[0], my: prop.tile[1] - 0.6, enabled: false })];
  return [act(water.boilAction(player, b.uid, prop, water.BOIL_BUCKET))];
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
  const label = list.length === 1 && list[0] === "cooking" ? "Cook here" : `Use the ${names.propName(prop.sprite)}`; // a fire that only cooks, else the station by name (the oven cooks too; "Use the dye vat")
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
const WALL_FACE = 96; // the walls' height since 2026-10-26 (docs/52): the box takes the door's lintel (64) and the wall above it to the cap
const FACE_HALF_W = 26;

function openingsAtScreen(sx, sy) {
  const seen = new Set();
  const out = [];
  for (const dy of [0, WALL_FACE / 2, WALL_FACE]) {
    const g = iso.toGrid(sx, sy + dy);
    for (const o of map.openingsNear(g.gx, g.gy, 2.5)) {
      const gs = o.wall.gate ? map.gateStart(o.tx, o.ty, o.edge, o.wall) : null; // a castle gate is one thing under the cursor: its first edge's key
      const k = gs ? `gate:${o.edge}@${gs[0]},${gs[1]}` : `${o.edge}@${o.tx},${o.ty}`;
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
// finds it, or null. A torch in it, a lantern, or nothing: the light verb says which ("There is no torch there.", "It is already lit.";
// a lantern is a switch since docs/43, lit again once put out).
export function bracketAt(sx, sy) {
  const g = iso.toGrid(sx, sy);
  const near = map.bracketsNear(g.gx, g.gy, 0.8); // any bracket: a Use on a lantern or an empty one gets its own word, not the grass's
  return near.length ? near[0].bracket : null;
}

// A cursor point read on the viewer's own floor (docs/49 section 6): the screen origin lifted by that floor's storeys, as the renderer lifts
// it (render/storeys.js withLift), and the map's reads there (map.withDrawLayer), so what is under the cursor upstairs is the upstairs. On
// the ground it is the call unchanged. An inner pick inside an outer one is the outer's, never lifted twice.
let picking = 0;
export function onFloorOf(player, fn) {
  const L = (player && player.layer) || 0;
  if (!L || picking) return fn();
  const o = iso.getOrigin();
  iso.setOrigin(o.x, o.y - L * map.STOREY);
  picking++;
  try {
    return map.withDrawLayer(L, fn);
  } finally {
    picking--;
    iso.setOrigin(o.x, o.y);
  }
}

// Every action for whatever is under a canvas point, on the player's own floor.
export function actionsAt(sx, sy, player) {
  return onFloorOf(player, () => actionsAtHere(sx, sy, player));
}
function actionsAtHere(sx, sy, player) {
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
  for (const entry of map.itemsAt(tx, ty, player.layer || 0)) out.push(...tag(itemActions(entry, tx, ty, player), onItem(entry, tx, ty)));
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
  for (const b of map.bracketsNear(g.gx, g.gy, 0.8, player.layer || 0)) out.push(...tag(holderActions({ kind: "bracket", bracket: b.bracket, mx: b.mx, my: b.my }, player), onBracket(b.bracket)));
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
      const t = map.peekTile(px + dx, py + dy, player.layer || 0); // a hit test never grows a chunk (docs/23a, A4)
      if (!t) continue;
      for (const entry of map.itemsAt(px + dx, py + dy, player.layer || 0)) consider(tag(itemActions(entry, px + dx, py + dy, player), onItem(entry, px + dx, py + dy)));
      if (map.drinkableAt(px + dx, py + dy, player.layer || 0)) consider(tag(waterTileActions(px + dx, py + dy, player), onTile(px + dx, py + dy))); // E at the bank
      if (t.prop && !seen.has(t.prop)) {
        seen.add(t.prop);
        consider(tag(propActions(t.prop, player), onProp(t.prop)));
      }
    }
  }
  for (const o of map.openingsNear(player.gx, player.gy, INTERACT_RANGE, player.layer || 0)) consider(tag(openingActions(o, player), onEdge(o)));
  for (const b of map.bracketsNear(player.gx, player.gy, INTERACT_RANGE, player.layer || 0)) consider(tag(holderActions({ kind: "bracket", bracket: b.bracket, mx: b.mx, my: b.my }, player), onBracket(b.bracket)));
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
        if (!map.isWalkableTile(x, y, player.layer || 0)) continue;
        if (Math.hypot(dx, dy) > action.range) continue;
        if (!lineOfSight(x, y, tx, ty, player.layer || 0)) continue; // a tile with a clear line to it, so a player behind a wall walks round (#208)
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
  return map.openingsNear(player.gx, player.gy, INTERACT_RANGE, player.layer || 0)[0] || null;
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
  const word = equipProblem(player, entry, prefer); // the spear's dual rule, said as itself
  if (!stow(player, entry)) map.dropItem(Math.round(player.gx), Math.round(player.gy), entry, player.layer || 0);
  showMessage(word || "Your hands are full.");
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
    if (def.wear === "back") map.dropItem(Math.round(player.gx), Math.round(player.gy), old, player.layer || 0);
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
// The belt keys, 1 to 5, as key events in the player's snapshot (item 4): performed by the world's step for the player whose client
// pressed them (updateInteract), here or on the host. The client turns the number into the slot's role by its own key order (the setting
// "Belt slot order", `order`; inventory.beltPositions), so what travels is the role (inventory.BELT_EVENTS) and the host, the other players,
// and the save never see the setting (Michael, 2026-10-25). A number with no slot under that order sends nothing: a locked place on screen
// (a grouped rope belt's 2 and 4) says "A leather belt adds a slot here." and any belt key with no belt worn says "You have no belt.", each on
// this client's screen alone, since nothing in the world changes ("every expected slot action that fails should give you a log line"); a
// number past a Sequential rope belt's three, with no place drawn for it, stays silent.
export const NO_BELT = "You have no belt.";
export const LOCKED_BELT_PLACE = "A leather belt adds a slot here.";
export function beltEvents(player, order) {
  const belt = player ? beltOf(player) : null;
  let ev = null;
  for (let n = 1; n <= 5; n++) {
    if (!input.wasPressed(`Digit${n}`)) continue;
    if (!belt) {
      if (player) showMessage(NO_BELT);
      continue;
    }
    const place = beltPositions(order, belt.length).find((q) => q.key === n);
    const i = place ? place.index : null;
    if (i != null && BELT_EVENTS[i]) (ev = ev || {})[BELT_EVENTS[i]] = true;
    else if (place) showMessage(LOCKED_BELT_PLACE);
  }
  return ev;
}

// The wave (docs/43 section 7): G, or /wave typed in the chat (main.js calls `queueWave`), is a key event `wave` in this client's next snapshot.
// The queue is this client's input, as the key trackers are, never world state.
let waveQueued = false;
export function queueWave() {
  waveQueued = true;
}

// Waking early (Michael, 2026-10-26: "any key or click wakes you early, with the fade back in"): while this client's player sleeps, any key or
// click is a key event `wake` in its next snapshot, performed by the world's step (updateInteract), so a guest wakes on the host the same way.
// A press counts only once this client has seen its player asleep a whole step, so the click that chose Sleep never wakes it. This client's
// own input tracking, as the wave's queue is, never world state.
let asleepSteps = 0;
export function wakeEvents(me) {
  if (!me || !me.sleeping || me.dead) {
    asleepSteps = 0;
    return null;
  }
  asleepSteps++;
  return asleepSteps > 1 && input.anyPressed() ? { wake: true } : null;
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
  // A sleeper woken early by its own key or click (wakeEvents): it gets up, and that press does nothing else.
  if (player.sleeping) {
    if (keys.wake) wake(player);
    return;
  }
  // The belt (docs/11; the slots' roles, Michael 2026-10-25): a hand slot draws into its hand or eats, the utility slot eats, by the slot's
  // role in the key's event. Moved from main.js into the world's step (item 4), so a guest's press reaches its body.
  for (let i = 0; i < BELT_EVENTS.length; i++) if (keys[BELT_EVENTS[i]]) beltPress(player, i);
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
// full or not (Michael, 2026-10-18); true when one was eaten. A food whose definition names a `jar` (honey's clay jar, docs/02, 2026-10-26,
// Honey goes into a clay jar) leaves it behind in the same place instead of being taken away, as a drunk potion leaves its vial.
function eatOne(player, entry, def, take) {
  if (!eat(player, def)) return false;
  entry.count -= 1;
  if (entry.count <= 0) {
    if (def.jar) { entry.id = def.jar; entry.count = 1; }
    else take();
  }
  return true;
}

// A belt slot used (its key, a guest's too, and the slot's Equip, which a double-click runs; Michael, 2026-10-25): what the slot's role does
// with what is there (inventory.beltAction). A hand slot draws into its hand, swapping what the hand held onto the slot, or eats a food; the
// utility slot eats; anything else does nothing and says why ("every expected slot action that fails should give you a log line"). An empty
// slot does nothing at all and says nothing, so a stray key in a fight never moves the weapon out of your hand. A potion is drunk from any
// slot (docs/47 section 4, until step 4 makes it holdable). Returns "drawn", "eaten", "drunk", "refused", "none", or "nothing".
export function beltPress(player, i) {
  const belt = beltOf(player);
  const e = belt && Number.isInteger(i) && i >= 0 && i < belt.length ? belt[i] : null;
  if (!e) return "nothing";
  const def = getItem(e.id);
  const a = beltAction(e, beltRole(i));
  if (a.act === "eat") {
    eatOne(player, e, def, () => { belt[i] = null; });
    return "eaten";
  }
  if (a.act === "drink") return potions.drinkFrom(player, e, { kind: "belt", index: i }) ? "drunk" : "refused";
  if (a.act === "draw") return beltEquip(player, i);
  showMessage(a.word);
  return "none";
}

// A belt slot's thing drawn into a hand: the slot's own (beltPress), or the hand the player chose (the slot menu's Equip into a hand, a drag
// from the slot onto a hand: ui/inventory-actions.js), by inventory.beltDraw, so what the hand held goes to the slot just freed first
// (Michael's playtest, 2026-10-26). `onto`: a drag from a hand onto this occupied slot, whose thing goes there. What has nowhere else to
// go is set at the feet with its line. "drawn" or "refused".
export function beltEquip(player, i, hand = null, onto = false) {
  const r = beltDraw(player, i, hand, onto);
  for (const d of r.drop) {
    map.dropItem(Math.round(player.gx), Math.round(player.gy), d, player.layer || 0);
    showMessage(dropWord(d));
  }
  if (!r.ok) {
    showMessage(r.word);
    return "refused";
  }
  return "drawn";
}

// ---- the item menus, for the panel ----

// Place torch (Michael, 2026-10-27, #523): a torch in the bag, on the belt, or in a hand goes on a wall's face with a bracket drawn with it.
// The entry begins the ghost on this screen (placement.beginTorch), a guest's too; the click that follows is the mode's own command.
export const PLACE_TORCH = "Place torch";
function placeTorchEntry(entry) {
  return entry && setdown.mountsOnWall(getItem(entry.id)) ? [{ label: PLACE_TORCH, enabled: true, onSelect: () => placement.beginTorch(entry) }] : [];
}

// An item in a grid: yours or an open container's.
export function itemMenu(player, entry, bag, otherBag) {
  const def = getItem(entry.id);
  const out = [];
  const mine = bag === bagOf(player);
  // Use: pick the thing up as what you are about to use on something (docs/30, law 2; Michael, 2026-10-12).
  out.push({ label: "Use", enabled: true, onSelect: () => use.begin(entry, { kind: "bag", bag }) });
  // A container item in a chest or on a body opens where it lies, with Take All (Michael, 2026-10-26, The playtest's rulings); in your own bag a
  // container is always empty (the container rule), so it has nothing to open. A container opened inside another is a take-only view (a belt's
  // slots, a nested bag), so nothing in it offers Open: never two levels deep (the review of #508).
  if (isContainer(entry) && !mine && !bag.takeOnly) out.push({ label: `Open ${def.name.toLowerCase()}`, enabled: true, onSelect: () => { if (!openWithin(player, entry, bag)) showMessage("You cannot open that from here."); } });
  // A rug is laid from the bag: Place begins the ghost on the floor (placement.js; #327).
  if (def.rug && mine) out.push({ label: "Place", enabled: true, onSelect: () => placement.beginRug(entry) });
  // A painting is hung from the bag: Place begins the ghost on a wall's face (placement.js; #326).
  if (def.painting && mine) out.push({ label: "Place", enabled: true, onSelect: () => placement.beginPainting(entry) });
  // A Campfire item is set down from the bag: Place begins the ghost on the ground (placement.js; docs/43, section 3).
  if (def.place === campfire.SPRITE && mine) out.push({ label: "Place", enabled: true, onSelect: () => placement.beginCampfire(entry) });
  // An item that sets down as its prop (a torch post, a decorative pumpkin; docs/43, section 4); food placed as decoration is one way (it comes
  // back a decoration, not food), so the entry says so.
  if (def.place && def.place !== campfire.SPRITE && mine) out.push({ label: "Place", enabled: true, onSelect: () => placement.beginSetdown(entry) });
  if (def.placeAs && mine) out.push({ label: "Place as decoration (it will not be food again)", enabled: true, onSelect: () => placement.beginSetdown(entry) });
  if (mine) out.push(...placeTorchEntry(entry));
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
  // A potion in your bag is drunk from it, its vial back in its cell (docs/47 section 4); the refusal (the ten seconds between) says why.
  if (potions.potionOf(def) && mine) out.push({ label: "Drink", enabled: true, onSelect: () => potions.drinkFrom(player, entry, { kind: "bag", bag }) });
  if (def.capacity) {
    const pct = Math.round(entry.fill ?? 0);
    out.push({ label: drinkLabel(entry, pct), enabled: pct > 0, onSelect: () => drink(player, entry) });
    const boil = mine ? boilSkinEntry(player, entry) : null; // a skin of yours, not one in a chest
    if (boil) out.push(boil);
  }
  if (def.vessel && mine) { const boil = boilSkinEntry(player, entry); if (boil) out.push(boil); } // a bucket of tainted water (Michael, 2026-10-26)
  if (def.splitsInto && mine) {
    const s = def.splitsInto;
    const noAxe = toolProblem(player, tuning.world.splitTool); // splitting is hatchet work (#215)
    out.push({
      label: `Split into ${countName(s.id, s.count)}${noAxe ? ` (need ${toolName(tuning.world.splitTool)})` : ""}`,
      enabled: !noAxe,
      onSelect: () => {
        if (toolProblem(player, tuning.world.splitTool)) { showMessage(toolProblem(player, tuning.world.splitTool)); return; }
        grid.remove(bag, entry);
        const added = addItem(bag, s.id, s.count);
        if (added < s.count) {
          for (let i = added; i < s.count; i++) map.dropItem(Math.round(player.gx), Math.round(player.gy), { id: s.id, count: 1 }, player.layer || 0);
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
        map.dropItem(Math.round(player.gx), Math.round(player.gy), entry, player.layer || 0);
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
      map.dropItem(Math.round(player.gx), Math.round(player.gy), entry, player.layer || 0);
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
          map.dropItem(Math.round(player.gx), Math.round(player.gy), entry, player.layer || 0);
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
    const i = Number(key);
    // A food on the belt is eaten from it (Michael, 2026-10-18, #179: "being able to eat from your belt"), and a skin drunk from its menu
    // (never by its key, which says it drinks by itself): the slot's first entry. A held item's Equip is what a hand slot's key does
    // (inventory.beltAction), so a double-click draws it there too. A held thing the slot's key does not draw (anything in the utility slot, a
    // wrong-hand thing in a hand slot) is equipped from the menu into its own hand (beltEquip with that hand: what the hand held goes back to
    // this slot when its key would draw it, else where a pushed-out thing goes, never the bag first): only the key, and the double-click that
    // follows it, never equip from there, and say why.
    if (bdef.kind === "food") {
      out.push({ label: "Eat", enabled: true, onSelect: () => { eatOne(player, entry, bdef, () => { belt[i] = null; }); } });
    } else if (potions.potionOf(bdef)) {
      out.push({ label: "Drink", enabled: true, onSelect: () => beltPress(player, i) }); // the slot's key, the vial back in the slot (docs/47 section 4)
    } else if (bdef.capacity) {
      const pct = Math.round(entry.fill ?? 0);
      out.push({ label: drinkLabel(entry, pct), enabled: pct > 0, onSelect: () => drink(player, entry) });
      const boil = boilSkinEntry(player, entry);
      if (boil) out.push(boil);
    } else if (bdef.hands && beltAction(entry, beltRole(i)).act === "draw") {
      out.push({ label: "Equip", enabled: true, onSelect: () => beltPress(player, i) });
    } else if (bdef.hands === "either") {
      out.push({ label: "Equip (main hand)", enabled: true, onSelect: () => beltEquip(player, i, "main") });
      out.push({ label: "Equip (off hand)", enabled: true, onSelect: () => beltEquip(player, i, "off") });
    } else if (bdef.hands) {
      out.push({ label: `Equip (${bdef.hands === "both" ? "both hands" : `${bdef.hands} hand`})`, enabled: true, onSelect: () => beltEquip(player, i, bdef.hands === "both" ? "main" : bdef.hands) });
    }
    if (bdef.vessel) { const boil = boilSkinEntry(player, entry); if (boil) out.push(boil); } // a bucket of tainted water on the belt (Michael, 2026-10-26)
    out.push(...placeTorchEntry(entry)); // a torch on the belt goes on a wall (#523)
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
    if (getItem(entry.id).vessel) { const boil = boilSkinEntry(player, entry); if (boil) out.push(boil); } // a bucket held (the builder's reading: a bucket is a hand thing)
    out.push(...placeTorchEntry(entry)); // a torch in a hand goes on a wall, lit or not (#523)
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
const inReach = (prop, player) => !!player && canReach(player, prop.tiles, CLICK_REACH, prop.layer || 0);
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

// A tree's bare trunk in its own frame, so the pixel hit can tell the crown from it: scanning up from the foot (the frame's lowest solid row),
// the trunk is every row no wider than twice the foot's span (or three quarters of the widest row, for a dev tree's root flare), and in those
// rows only the foot's columns, a pixel either side; every other solid pixel is the crown. Solid is an alpha of half or more, so the faint
// ground shadow a dev tree draws is neither. Read from the picture, so delivered art and the dev trees alike need no field. Worked out once
// per sheet and frame name and kept (a sheet's pixels do not change), never per rendered frame.
const trunks = new Map(); // sheet -> Map(frame name -> { line, l, r }): rows below `line`, columns l to r, are the trunk
function trunkOf(sheet, name) {
  let byName = trunks.get(sheet);
  if (!byName) trunks.set(sheet, (byName = new Map()));
  let t = byName.get(name);
  if (t) return t;
  const f = sheet.frames[name];
  const al = alphaOf(sheet);
  const x0 = Math.max(0, f[0]);
  const y0 = Math.max(0, f[1]);
  const x1 = Math.min(al.w, f[0] + f[2]);
  const y1 = Math.min(al.h, f[1] + f[3]);
  const solid = (x, y) => al.a[y * al.w + x] >= 128;
  const width = [];
  let widest = 0;
  for (let y = y0; y < y1; y++) {
    let n = 0;
    for (let x = x0; x < x1; x++) if (solid(x, y)) n++;
    width.push(n);
    widest = Math.max(widest, n);
  }
  let foot = y1 - 1;
  while (foot >= y0 && width[foot - y0] === 0) foot--;
  t = { line: y1, l: 0, r: -1 }; // nothing solid: no trunk, every pixel the crown
  if (foot >= y0) {
    let l = x1;
    let r = x0 - 1;
    for (let x = x0; x < x1; x++) if (solid(x, foot)) { l = Math.min(l, x); r = Math.max(r, x); }
    const wide = Math.min(2 * (r - l + 1), widest * 0.75);
    let line = foot;
    while (line >= y0 && width[line - y0] <= wide) line--;
    t = { line, l: l - 1, r: r + 1 };
  }
  byName.set(name, t);
  return t;
}
const isTree = (prop) => !!getDef(prop.sprite).canopy; // the engine's one idea of a tree (map.js isTreeKind)

// Everything that `wanted` takes with a solid pixel at the canvas point (sx, sy), frontmost first (by the depth of its tile; a tie keeps the
// search's order), each once: { prop, depth, crown }, `crown` true when the pixel is a tree's crown, not its bare trunk (trunkOf). The pixels
// are the thing's idle frame. interactableAt's rule picks from this list; a check reads it to find a covered point.
export function hitsAt(sx, sy, wanted = (prop) => prop.interactable) {
  const g = iso.toGrid(sx, sy);
  const tx = Math.round(g.gx);
  const ty = Math.round(g.gy);
  const hits = [];
  const seen = new Set();
  // A giant tree's crown is about six tiles up the screen from its trunk's
  // tile, so look that far down the grid as well as a little around.
  for (let dy = -2; dy <= 7; dy++) {
    for (let dx = -2; dx <= 7; dx++) {
      const prop = map.peekTile(tx + dx, ty + dy)?.prop; // a hit test never grows a chunk (docs/23a, A4)
      if (!prop || seen.has(prop) || !wanted(prop)) continue;
      seen.add(prop);
      // Its pixels: every slice a sliced piece draws, each at its own tile (a fireplace's second tile, the fire pit's three columns, whose
      // back tile draws nothing), else its one frame at its anchor.
      const sheet = getSheet(prop.sprite, prop.tiles.length);
      const al = alphaOf(sheet);
      const slices = sheet.sliced ? prop.tiles.length : 1;
      let name = null;
      let px = 0;
      let py = 0;
      let depth = prop.tile[0] + prop.tile[1];
      for (let i = 0; i < slices && !name; i++) {
        const [stx, sty] = prop.tiles[i] || prop.tile;
        depth = stx + sty; // the slice's own tile, as the renderer sorts it (a fire pit's side columns sit deeper than its back tile)
        const r = propRect(prop, stx, sty);
        if (!r || !pointInRect(sx, sy, r)) continue;
        const n = idleFrame(sheet, prop, i);
        const f = sheet.frames[n];
        if (!f) continue;
        const x = Math.floor(sx - r.x) + (sheet.bounds ? sheet.bounds.x : 0) + f[0];
        const y = Math.floor(sy - r.y) + (sheet.bounds ? sheet.bounds.y : 0) + f[1];
        if (x < 0 || y < 0 || x >= al.w || y >= al.h || al.a[y * al.w + x] === 0) continue;
        name = n;
        px = x;
        py = y;
      }
      if (!name) continue;
      let crown = false;
      if (isTree(prop)) {
        const t = trunkOf(sheet, name);
        crown = !(py > t.line && px >= t.l && px <= t.r);
      }
      hits.push({ prop, depth, crown });
    }
  }
  return hits.sort((a, b) => b.depth - a.depth); // stable: a tie keeps the search's order, as the old single pass did
}

// The one thing under the cursor by its pixels: the click's sway (pokeAt), the right-click menu's first target (menuActions), Object
// Highlight's prop (highlight.js), and Use mode's prop, all through this one rule. The frontmost hit, except that a tree's crown does not
// hide a gatherable behind it (bugs.md, 2026-10-25: a mushroom or an herb under a crown a tile nearer could not be clicked; mushrooms always
// grow within two tiles of a tree): when the frontmost pixel `wanted` takes is a crown, the first thing behind it at the same point that is
// not a crown wins if it is an interactable that is not a tree (an herb, a mushroom, a crop, a rock, a sapling, a stump, the beehive) and
// `wanted` takes it; anything else there (another tree's trunk, a prop that is not interactable) blocks, and the crown is the answer. The
// look behind reads every prop whatever `wanted` says, so the click (interactables only) and Object Highlight (anything) agree on what blocks.
// A crown with nothing behind it is still the tree, and the trunk always is, so a tree over a mushroom is still clicked for its Chop or its
// sticks on its trunk or on any crown pixel clear of the small thing.
export function interactableAt(sx, sy, wanted = (prop) => prop.interactable) {
  const all = hitsAt(sx, sy, () => true);
  const i = all.findIndex((h) => wanted(h.prop));
  if (i < 0) return null;
  if (all[i].crown) {
    const next = all.slice(i + 1).find((h) => !h.crown);
    if (next && next.prop.interactable && !isTree(next.prop) && wanted(next.prop)) return next.prop;
  }
  return all[i].prop;
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
  map.unsavedProp(prop, false); // the stamp is saved; the wire sends it in the frame's pokes, not the chunk
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
  if (prop.pokedAt == null || now - prop.pokedAt >= POKE_COOLDOWN_MS) stamp(prop, now);
  return true;
}

export function pokeAt(sx, sy, player) {
  const prop = onFloorOf(player, () => interactableAt(sx, sy)); // on the player's own floor (docs/49 section 6)
  if (!prop) return null;
  const def = getDef(prop.sprite);
  if (def.sway === false || def.clickAnim) return prop;
  const now = loop.simTime() * 1000; // sim milliseconds (docs/23a, C2); the renderer reads the same clock
  if (inReach(prop, player) && (prop.pokedAt == null || now - prop.pokedAt >= POKE_COOLDOWN_MS)) stamp(prop, now);
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
  if (prop.pokedAt == null || now - prop.pokedAt >= BRUSH_MS) stamp(prop, now);
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
  return onFloorOf(viewer, () => characterAtHere(sx, sy, viewer));
}
function characterAtHere(sx, sy, viewer) {
  let best = null;
  for (const c of allCharacters()) {
    if (c.kind === "player") continue;
    if (viewer && c.kind === "zombie" && !c.dead && !sight.seen(viewer, c)) continue; // lost in the dark: nothing to point at
    if (viewer && (c.layer || 0) !== (viewer.layer || 0)) continue; // a body on another floor is not under your cursor (docs/49 section 6)
    const p = iso.toScreen(c.gx, c.gy);
    p.y -= c.rise || 0; // drawn up its stair (render/storeys.js liftOf); the floor's own storeys are onFloorOf's
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
  if (!c || c.dead || reachProblem(player, [[c.gx, c.gy]], CLICK_REACH, c.layer || 0)) return false;
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
  if (c && c.kind === "villager" && canReach(player, [[c.gx, c.gy]], CLICK_REACH, c.layer || 0)) pokeVillager(c, player);
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
// Burn corpse (docs/43 section 7): on every body of the dead, greyed with what is lacking (a tinderbox; no log since 2026-10-26), or while it already burns;
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

// A snare's Look at (docs/45 section 2): what it holds, or how long it has been set; the asking client's own line, as an animal's is.
function lookAtSnareAction(prop) {
  return act({
    kind: "look",
    label: "Look at the snare",
    tiles: prop.tiles,
    mx: prop.tile[0],
    my: prop.tile[1],
    range: INSPECT_RANGE,
    local: true,
    perform() {
      showMessage(snareLine(prop), 4);
      return true;
    },
  });
}

// Skin and Butcher a carcass (docs/45 section 2): timed actions that run the `skin` and `butcher` verbs by the animal's id, a dirk carried,
// so a guest's choice of the label is the host's doing; greyed with why (no dirk, skin it first, already skinned).
function carcassActions(c, player) {
  const out = [];
  const one = (verb, word) => {
    const why = workProblem(player, c, verb);
    const far = why && /^Too far|wall|door|shut/i.test(why); // reach is the walk's to solve, not a reason to grey it
    return act({
      kind: verb,
      label: why && !far ? `${word} the ${c.name} (${why.replace(/\.$/, "").replace(/^./, (ch) => ch.toLowerCase())})` : `${word} the ${c.name}`,
      tiles: [[Math.round(c.gx), Math.round(c.gy)]],
      range: CLICK_REACH,
      mx: c.gx,
      my: c.gy,
      enabled: !why || far,
      duration: workSeconds(verb),
      perform() {
        return runVerb(verb, player, { character: c.id });
      },
    });
  };
  if (hasHide(c) && !c.skinned) out.push(one("skin", "Skin"));
  out.push(one("butcher", "Butcher"));
  return out;
}

// A tame animal's keeping (docs/45 sections 1 and 3): Lead it (a lead carried) and Let go, Milk a cow (a bucket) or Shear a sheep (shears) once a
// day when it has been fed, each greyed with why; the verbs run on the host by the animal's id, so a guest's label is the host's doing.
function keepingActions(c, player) {
  if (animalSpecies(c.species).wild) return [];
  const out = [];
  const tile = [[Math.round(c.gx), Math.round(c.gy)]];
  const greyed = (why) => why && !/^Too far|wall|door|shut/i.test(why); // reach is the walk's to solve
  const said = (word, why) => (greyed(why) ? `${word} (${why.replace(/\.$/, "").replace(/^./, (ch) => ch.toLowerCase())})` : word);
  if (c.leaderId === player.id) {
    out.push(act({ kind: "letgo", label: `Let go of the ${c.name}`, tiles: tile, range: CLICK_REACH, mx: c.gx, my: c.gy, perform: () => runVerb("letgo", player, { character: c.id }) }));
  } else {
    const why = leadProblem(player, c);
    out.push(act({ kind: "lead", label: said(`Lead the ${c.name}`, why), tiles: tile, range: CLICK_REACH, mx: c.gx, my: c.gy, enabled: !greyed(why), perform: () => runVerb("lead", player, { character: c.id }) }));
  }
  const pr = animalSpecies(c.species).produce;
  if (pr) {
    const why = produceProblem(player, c);
    const word = pr.verb === "milk" ? `Milk the ${c.name}` : `Shear the ${c.name}`;
    out.push(act({ kind: pr.verb, label: said(word, why), tiles: tile, range: CLICK_REACH, mx: c.gx, my: c.gy, enabled: !greyed(why), duration: workSeconds(pr.verb), perform: () => runVerb(pr.verb, player, { character: c.id }) }));
  }
  return out;
}

function characterActions(c, player) {
  const out = [];
  if (c !== player && (c.layer || 0) !== (player.layer || 0)) return out; // a body on another floor is out of reach (docs/49 section 9)
  if (c.kind === "animal") return c.dead && !c.butchered ? [...carcassActions(c, player), lookAtAnimalAction(c)] : [...keepingActions(c, player), lookAtAnimalAction(c)];
  if ((c.kind === "zombie" || c.kind === "player") && c.dead && c.corpse) out.push(searchBodyAction(c)); // a player's body too (2026-10-14)
  if (burn.isBurnableBody(c)) out.push(burnCorpseAction(c, player)); // the dead's bodies; a player's is left for its friends (docs/43 section 7)
  if (c.kind === "villager") {
    // Talk (docs/34): a simple action, so E does it when the villager is the nearest thing within reach (the prompt names it, and a door nearer wins);
    // it runs on the host as the talking player, who is told to open the panel (`talkStarted`).
    if ((c.layer || 0) === (player.layer || 0) && lineOfSight(player.gx, player.gy, c.gx, c.gy, player.layer || 0)) out.push(act({ // a wall in the way: not offered, rather than offered and refused (#230)
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
  if (prop.playedAt != null && now - prop.playedAt < total) return false;
  stamp(prop, now, "playedAt");
  return true;
}

// Left click: play the click animation of the thing under the cursor, by its
// pixels, if it is within the player's reach.
export function playAt(sx, sy, player) {
  const prop = onFloorOf(player, () => interactableAt(sx, sy, (p) => !!getDef(p.sprite).clickAnim));
  if (prop && inReach(prop, player)) play(prop);
  return prop;
}

// The actions of a thing the player clicked by its pixels (a tree's crown is
// further up the screen than the menu's own search reaches), each addressed to
// it, so a guest's choice reaches the host by the prop's id (net.sendAct).
export function actionsForProp(prop, player) {
  return tag(propActions(prop, player), onProp(prop));
}

// The right-click menu's actions at a canvas point, given the thing the click found by its pixels (pokeAt's answer, or null); with none,
// it is actionsAt's list unchanged. With one: every walk action (Walk here) is dropped, as is any action of another target whose label
// one of the thing's own has; the thing's own actions (actionsForProp, addressed by its id) are taken out of where actionsAt put them and
// put where the list's first remaining prop-addressed action stood, so after the tile's items, water, and farm actions and before any
// other prop's (a tree whose sprite rectangle also covers the point, as a crown over a mushroom does; a rug under the tile), or at the end
// when no prop-addressed action is left.
export function menuActions(sx, sy, player, poked) {
  if (poked && (poked.layer || 0) !== ((player && player.layer) || 0)) poked = null; // a thing on another floor is not this menu's (docs/49)
  const actions = actionsAt(sx, sy, player);
  if (!poked) return actions;
  const own = actionsForProp(poked, player);
  const labels = new Set(own.map((a) => a.label));
  const rest = actions.filter((a) => a.kind !== "walk" && !/^Walk/.test(a.label || "") && !(a.target && a.target.kind === "prop" && a.target.id === poked.id) && !labels.has(a.label));
  const at = rest.findIndex((a) => a.target && a.target.kind === "prop");
  rest.splice(at < 0 ? rest.length : at, 0, ...own);
  return rest;
}
