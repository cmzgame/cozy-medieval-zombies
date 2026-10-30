// The map: one continuous tile grid stored block by block. See docs/03-world-model.md.
//
// Walls sit on tile edges, Zomboid style: every tile has a slot for a wall on its
// north edge (`n`) and its west edge (`w`). A building's south wall is the north
// wall of the tiles just south of it, and its east wall is the west wall of the
// tiles just east. A door or a window is a wall with a different kind and state.
//
// Chunks are created on demand, so the ground goes on forever and the camera
// never shows the void. Inside the authored bounds an unauthored tile is plain
// floor; beyond them a chunk is wild, grown from the map's `wild` rule.

import { getDef } from "./assets.js";
import { propName } from "./prop-names.js"; // a prop's name in words, the one helper (the jack-o'-lantern by its recipe's label)
import { douse, getItem, hasItemDef } from "./items.js";
import { nextId } from "./world.js";
import { storedLeaf, carriedLeaf } from "./woods.js"; // the wood of a door's or window's leaves (#334)
import { emit } from "./events.js";
import * as round from "./round.js"; // round rooms' geometry (docs/50)
import { world as W, resources as RES } from "./tuning.js";

export const CHUNK = 16;
// Every prop by its id (docs/31/08, habit 1): anything kept across a step
// refers to a prop by id and looks it up here when the step runs.
const propsById = new Map();
export function propById(id) {
  return propsById.get(id) || null;
}
const ROOM_MAX = 300; // a region bigger than this is outdoors, not a room
const ROUND_BODY_RADIUS = 0.2; // a body's radius against round props; 0.3 against walls

const chunks = new Map(); // chunkKey(cx, cy, layer) -> { cx, cy, layer, tiles, wild, dirty, lightVersion, saved }
let source = null; // authored tiles of the ground: (x, y) => tile | null
const layerSources = new Map(); // the authored tiles of every other layer (docs/49 section 11): layer -> (x, y) => tile | null
const authoredChunks = new Map(); // layer (not 0) -> Map of chunk key -> [cx, cy]: the chunks an authored tile stands in, which ensureAround grows on that layer
let defaultFloor = "floor_grass";
// The map file's stairs and buildings as data, made by loadMap on host and guest alike from the file every client has (docs/49 section
// 11): never saved or sent. Each stair { id, layer, at, dir, material, tiles, landing, before, building }; each building { id, set, rect,
// rects: { layer: [x, y, w, h] }, layers }.
let stairList = [];
let stairProblems = [];
let buildingList = [];
export function stairs() {
  return stairList;
}
export function stairProblemsOf() {
  return stairProblems;
}
export function buildings() {
  return buildingList;
}
// The authored building whose footprint on `layer` holds (x, y), or null (the hiding rule's, step 2; roofs').
export function buildingAt(x, y, layer = 0) {
  for (const b of buildingList) {
    const r = b.rects[layer];
    if (r && x >= r[0] && y >= r[1] && x < r[0] + r[2] && y < r[1] + r[3] && (!b.round || round.isStepped(r[0], r[1], r[2], x, y))) return b; // a round tower holds its stepped tiles, never its pockets (docs/50 section 3)
  }
  return null;
}

// ---- layers (docs/49, section 3) ----
// The ground is layer 0, the floors above it 1, 2, and so on, a cellar -1. A storey is STOREY px (the wall height of docs/52): layer L's
// floor stands STOREY * L above the ground. An unauthored tile above the ground is VOID (no floor, not walkable, nothing drawn, sight and
// flights pass through it); below the ground it is EARTH (solid, not walkable, opaque, drawn as nothing; a cellar is a room cut out of it).
// A HOLE is a floor kind: a stairwell cut in a floor (a cellar's stair under the ground floor), not walkable, drawn as the stair's
// opening (step 3's art). An empty tile is never walkable and nothing falls (Michael, 2026-10-26). The three are the engine's own
// floors, not sprite definitions: `floorRule` knows them, and the ground's bake draws no picture of its own for them.
export const STOREY = 96;
export const VOID = "void";
export const EARTH = "earth";
export const HOLE = "hole";
const ENGINE_FLOORS = new Set([VOID, EARTH, HOLE]);
export function isEngineFloor(id) {
  return ENGINE_FLOORS.has(id);
}
// The floor an unauthored tile of a layer has: the map's base floor on the ground, void above it, earth below.
export function emptyFloorOf(layer) {
  return layer > 0 ? VOID : layer < 0 ? EARTH : defaultFloor;
}
// What a read beyond the grown chunks sees (docs/31/05 item 8): plain floor, no
// walls, no prop, outdoors. Frozen, so a write to it throws instead of changing
// nothing. Reading never grows a chunk; only ensureAround and the mutators do.
// One blank a layer (docs/49 section 3): the ground's plain floor, the void above it, the earth below it; a read on an upper or a lower
// layer where nothing is authored or built gets the void or the earth and grows no chunk, so nothing empty is saved or sent.
let blank = Object.freeze({ floor: defaultFloor, n: null, w: null, prop: null, room: 0, items: null });
const voidBlank = Object.freeze({ floor: VOID, n: null, w: null, prop: null, room: 0, items: null });
const earthBlank = Object.freeze({ floor: EARTH, n: null, w: null, prop: null, room: 0, items: null });
function blankOf(layer) {
  return layer === 0 ? blank : layer > 0 ? voidBlank : earthBlank;
}
// The authored tile at (x, y) on a layer, or null.
function sourceAt(x, y, layer) {
  if (layer === 0) return source ? source(x, y) : null;
  const s = layerSources.get(layer);
  return s ? s(x, y) : null;
}
const rooms = new Map(); // room id -> { id, size, openings: [{ tx, ty, edge }] }
let roomsDirty = true;
// Every prop whose sprite definition declares `fire`, so light can list its
// sources and lit rooms without walking every tile (docs/07-lighting.md).
const fireProps = new Set();
// Beyond the authored bounds the world is wild: forest grown by rule, with a
// few of the dead per chunk (Michael, 2026-10-09). Harvest register, so the
// gloomy one is always a choice of place and never the default.
let wild = null; // { zone: { kinds, scale }, density: [min, max], seed, zombiesPerChunk }
let bounds = null; // [x, y, w, h] of the authored map
const pendingSpawns = []; // [x, y] tiles where a wild chunk wants a zombie
let popFactor = 1; // the world's Starting population as a factor (tuning.population): scales the dead a wild chunk brings
let noTrees = false; // the world's Trees rule is off: no tree is placed, scatter or wild (rocks, forage, and anything else stay)
const ghostTrees = new Set(); // with Trees off, the tiles of the authored scatter where a tree would have stood: forage is placed against these, as against the trees of a world that has them

// Whether a kind is a tree: its definition has a canopy (the engine's one idea of a tree), else its id says so.
function isTreeKind(kind) {
  const d = getDef(kind);
  return d ? !!d.canopy : String(kind).startsWith("tree_");
}
// Which zone a tile is in, for the ground (docs/15): the scatter rules' rects
// inside the bounds, the wild rule's zone beyond them.
let zoneRects = []; // [{ rect: [x, y, w, h], zone }]
let wildZone = null;
// Small things placed near trees (docs/02, question 27): mushrooms now.
let forage = null; // { kinds, chance, near, seed }
// Natural resources (docs/46): the map's areas per kind (its `resources` block), the scatter's reserved tiles kept from the load (the
// buildings, the places and their padding, the reserve rects), and the footprints of the places an area opens to its own kind (the quarry
// to stone, the iron workings to ore). Read by resourceSpotProblem, the one test of where a node may stand, at the load and at a comeback.
let resourceKindList = []; // [{ name, sprites, count, rects, open, floors, openFloors, near, rise, solid, jitter, seed, days, water, waterGroup, own, where }]
const resourceBySprite = new Map(); // sprite -> its kind
let reservedTiles = new Set(); // "x,y"
const openPlaces = new Map(); // a place's name -> Set of its footprint's "x,y"
// Called with (tiles, prop) when a floor changes or a prop comes or goes, so
// the ground can re-bake what it touches (docs/15). The ground registers it;
// the map does not import the ground.
const groundListeners = [];

export function reset({ floor = "floor_grass", authored = null, wildRule = null, mapBounds = null, layers = null } = {}) {
  chunks.clear();
  layerSources.clear();
  authoredChunks.clear();
  // The other layers' authored tiles (docs/49 section 11): { layer: Map("x,y" -> tile) }, each indexed by the chunks it stands in.
  for (const [l, tiles] of layers ? Object.entries(layers) : []) {
    const layer = Number(l);
    if (!layer || !tiles || !tiles.size) continue;
    layerSources.set(layer, (x, y) => tiles.get(`${x},${y}`) || null);
    const keys = new Map();
    for (const k of tiles.keys()) {
      const [x, y] = k.split(",").map(Number);
      const [cx, cy] = chunkCoord(x, y);
      keys.set(chunkKey(cx, cy, layer), [cx, cy]);
    }
    authoredChunks.set(layer, keys);
  }
  sleepers.clear();
  woken.length = 0;
  evicted.clear(); // a new map owes no frame a drop
  nextRoomId = 1;
  lastChunk = null;
  rooms.clear();
  source = authored;
  defaultFloor = floor;
  blank = Object.freeze({ floor: defaultFloor, n: null, w: null, prop: null, room: 0, items: null });
  wild = wildRule;
  bounds = mapBounds;
  pendingSpawns.length = 0;
  roomsDirty = true;
  rings.clear();
  ringMarks.clear();
  unreachableKeys.clear();
  curveTiles = 0;
}

export function takePendingSpawns() {
  return pendingSpawns.splice(0, pendingSpawns.length);
}

export function fires() {
  return fireProps;
}

// Burning (docs/07; docs/30 section 7, fire is maintenance): a burner holds
// units of its fuel (a log, a lump of charcoal: the definition's `fire.fuel`)
// and burns one per `fire.hoursPerUnit` game hours (two unless the definition
// says). At zero it goes out and says so. Nothing shuts off on a timer; it
// burned what you gave it.
export const HOUR_SECONDS = 30; // real seconds per game hour: a 12-minute day (clock.js's DAY_LENGTH / 24)
export const LOG_SECONDS = 2 * HOUR_SECONDS; // the default: two hours a unit

export function burnFires(dt) {
  for (const p of fireProps) {
    const f = p.fire;
    if (!f.burns || !f.lit || f.switch) continue; // a home light is a switch: on or off, no fuel (docs/43, section 3)
    const before = f.fuel;
    f.fuel -= dt / (f.hoursPerUnit * HOUR_SECONDS);
    // A guest's copy of the fuel refreshes when the chunk is sent: at every whole unit burned, so a guest's
    // hours left are never more than a unit behind (the sync check compares fuel to the unit; docs/31/04).
    if (Math.floor(before) !== Math.floor(f.fuel)) markProp(p);
    else unsavedProp(p, false); // the fuel between units: the save's copy only (the wire waits for the unit)
    if (f.fuel <= 0) {
      f.fuel = 0;
      f.lit = false;
      touchProp(p);
      emit("fireOut", { id: p.id, tile: p.tile });
    }
  }
}

// Feed a burner one unit of its fuel (the caller has taken the item), lighting
// it if it was out and `light` says so (a station's fire is lit by its fuel and a carried flame together; a log on a cold campfire
// lights nothing, docs/43 section 3, #168). The one mutator of a fire's fuel: it touches the tile and
// says what changed (docs/31/08, habit 3). Returns false if it is full, or a switch (a home light burns no fuel).
export function feedFire(prop, light = true) {
  const f = prop.fire;
  if (!f || !f.burns || f.switch) return false;
  if (f.fuel >= f.maxFuel) return false;
  f.fuel = Math.min(f.maxFuel, f.fuel + 1);
  if (light) f.lit = true;
  touchProp(prop);
  emit("fireFed", { id: prop.id, tile: prop.tile, fuel: f.fuel });
  return true;
}

// Game hours a fire has left in it.
export function fireHoursLeft(prop) {
  const f = prop.fire;
  return f && f.burns ? f.fuel * f.hoursPerUnit : 0;
}

// ---- torches: brackets on walls, posts on tiles ----
// A bracket is state on a wall edge: `wall.bracket = { side, torch }`, where
// side is +1 for the near side of the edge (south of a north edge, east of a
// west edge) and -1 for the far side. A post is a prop whose fire `holds` a
// torch. A torch a player put on a wall (Place torch, docs/43 section 4, #523) is a bracket of its own, `made`, drawn with it and gone
// with it: taken, burnt out, or its wall gone. A torch in any bracket keeps its entry's `uid`, `wear`, and `lit` there. A torch burns down while it is lit; a lantern (`bracket.lantern`, a `lantern_post`) burns nothing and is put out and lit again
// (docs/43, section 3, 2026-10-25, striking 2026-10-17's "never goes out": light will draw the dead, so a light must be snuffable).

const bracketSet = new Set(); // { tx, ty, edge, wall }

export function brackets() {
  return bracketSet;
}

// The torches players mounted burn down at the wall rate while lit (Michael, 2026-10-17, #156): a spent one is gone from its
// holder. The village's own lights are lanterns (a bracket's `lantern`, a `lantern_post`), which never burn out.
// A guest's copy of the wear refreshes when the chunk is sent: at every hundredth burned, as a fire's fuel does at every unit
// (the sync check compares wear to the hundredth); between, the save's copy alone is dropped (docs/31/04).
const hundredth = (w) => Math.floor(w * 100);
export function burnHolders(dt) {
  const k = dt / W.torchWallLife;
  for (const b of bracketSet) {
    const br = b.wall.bracket;
    if (!br.torch || br.lit !== true || br.wear === undefined) continue;
    const before = hundredth(br.wear);
    br.wear += k;
    if (br.wear >= 1) {
      if (br.made) {
        removeBracket(b); // a torch a player put on a wall: its bracket goes with it (#523)
      } else {
        br.torch = false;
        delete br.wear;
        delete br.lit;
        delete br.uid;
        touchWall(b.wall);
      }
      emit("torchSpent", { x: b.tx, y: b.ty });
    } else if (b.wall.at && before !== hundredth(br.wear)) markDirty(b.wall.at[0], b.wall.at[1], b.wall.at[2] || 0);
    else unsavedWall(b.wall, false);
  }
  for (const p of fireProps) {
    const f = p.fire;
    if (!f.holds || !f.has || !f.lit || f.wear === undefined) continue;
    const before = hundredth(f.wear);
    f.wear += k;
    if (f.wear >= 1) {
      f.has = false;
      f.lit = false;
      delete f.wear;
      touchProp(p);
      emit("torchSpent", { x: p.tile[0], y: p.tile[1] });
    } else if (before !== hundredth(f.wear)) markProp(p);
    else unsavedProp(p, false);
  }
}

// A flame landing at a point lights what is made to be lit within `r` tiles (Michael, 2026-10-17, #156: "a campfire or a torch"): an
// unlit campfire with fuel in it, a torch on a post, or a torch in a bracket that is out. Not a fireplace, a fire pit, an oven, or a forge, and
// nothing else burns or spreads. `clear(x, y)` says whether the flame reaches that point (no wall between it and the landing: the
// fireball passes it, as its hit does); the default is that it does. The authority's, from a fireball's landing (archery.js).
// Returns how many it lit.
export function kindleNear(x, y, r = 1, clear = null, layer = 0) { // on one layer (docs/49): a flame lights nothing through a floor
  let n = 0;
  for (const p of fireProps) {
    if ((p.layer || 0) !== layer || !lightableProp(p) || p.fire.lit || Math.hypot(p.tile[0] - x, p.tile[1] - y) > r) continue;
    if (clear && !clear(p.tile[0], p.tile[1])) continue;
    if (lightProp(p)) n++;
  }
  for (const b of bracketSet) {
    if ((b.layer || 0) !== layer || !b.wall.bracket.torch || b.wall.bracket.lit !== false) continue;
    const [bx, by] = bracketPos(b);
    if (Math.hypot(bx - x, by - y) > r) continue;
    if (clear && !clear(bx, by)) continue;
    if (lightBracket(b)) n++;
  }
  return n;
}

export function addBracket(tx, ty, edge, side, torch = false, lantern = false, lit = true, layer = 0) {
  const wall = growTile(tx, ty, layer)[edge];
  if (!wall) return null;
  // A lantern is the village's own light (#156): steady, burning nothing, not a torch and not taken; a bracket holds one or the other.
  // Put out and lit again since docs/43 section 3: `lit: false` when out, nothing (lit) as authored.
  wall.bracket = lantern ? { side, torch: false, lantern: true } : { side, torch };
  if (torch && !lantern && lit === false) Object.assign(wall.bracket, { lit: false, wear: 0 }); // an unlit torch in it, burning from its first light (docs/43 section 4)
  const b = { tx, ty, edge, wall, layer };
  bracketSet.add(b);
  return b;
}

// A torch put on the camera face of a wall from a player's own hands, belt, or bag (Place torch, docs/43 section 4, #523; src/setdown.js),
// on a bracket drawn with it: `made`, so the bracket goes with the torch. The torch keeps its own entry's uid, its wear, and whether it is
// lit. Touches the wall's chunk, so the save has it and a guest's replica gets it and rebuilds its bracket list (net.js). On a layer
// (docs/49): the player's own.
export function mountTorch(tx, ty, edge, entry, layer = 0) {
  const wall = peekTile(tx, ty, layer) && peekTile(tx, ty, layer)[edge];
  if (!wall || wall.bracket || !entry) return null;
  wall.bracket = { side: 1, torch: true, made: true, wear: entry.wear || 0, lit: !!entry.lit };
  if (entry.uid != null) wall.bracket.uid = entry.uid;
  const b = { tx, ty, edge, wall, layer };
  bracketSet.add(b);
  touch(tx, ty, layer);
  return b;
}

// The torch in a bracket as an entry, put out (a torch leaving a holder is doused, #156), with its own uid when it kept one, else a new one.
export function torchEntryOf(br) {
  return { id: "torch", count: 1, wear: br.wear || 0, lit: false, uid: br.uid != null ? br.uid : nextId("e") };
}

// The floor tile a bracket looks onto: its own tile for the near side (+1), the one across the edge for the far side.
export function bracketFloor(b) {
  if (b.wall.bracket.side > 0) return [b.tx, b.ty];
  return b.edge === "n" ? [b.tx, b.ty - 1] : [b.tx - 1, b.ty];
}

// A wall about to go (taken down, struck down, or stamped over by a door or a window): the torch in its bracket falls to the floor on the
// bracket's side, put out, as a painting falls (#523: a torch is never lost with its wall); the bracket is forgotten. A lantern is the
// village's and goes with its wall.
function releaseBracket(wall) {
  const br = wall && wall.bracket;
  if (!br) return;
  for (const b of [...bracketSet]) {
    if (b.wall !== wall) continue;
    bracketSet.delete(b);
    if (br.torch && !br.lantern) dropItem(...bracketFloor(b), torchEntryOf(br), b.layer || 0); // onto the bracket's own layer (docs/49)
  }
}

// A bracket taken off its wall (a torch a player put there, taken with it). Touches the wall's chunk.
export function removeBracket(b) {
  if (!b || !b.wall || !b.wall.bracket) return false;
  delete b.wall.bracket;
  for (const q of [...bracketSet]) if (q.wall === b.wall) bracketSet.delete(q);
  touch(b.tx, b.ty, b.layer || 0);
  return true;
}

// The bracket on an edge of a layer, by its address, or null (docs/49: an address is on one layer).
export function bracketAt(tx, ty, edge, layer = 0) {
  for (const b of bracketSet) if (b.tx === tx && b.ty === ty && b.edge === edge && (b.layer || 0) === layer) return b;
  return null;
}

// Where a bracket's torch burns, in grid space: a little off the edge on its side.
export function bracketPos(b) {
  const s = b.wall.bracket.side * 0.3;
  if (isRingWall(b.wall)) {
    // On a ring (docs/50 section 3): at its point on the curve, kept on the tile it looks onto so its light is that tile's room's.
    const f = ringFace(b.tx, b.ty, b.edge, b.wall.bracket.side, b.layer || 0, true);
    if (f) {
      const [fx, fy] = bracketFloor(b);
      return [Math.max(fx - 0.45, Math.min(fx + 0.45, f.gx)), Math.max(fy - 0.45, Math.min(fy + 0.45, f.gy))];
    }
  }
  return b.edge === "n" ? [b.tx, b.ty - 0.5 + s] : [b.tx - 0.5 + s, b.ty];
}

export function bracketsNear(gx, gy, r = 1.15, layer = 0) {
  const out = [];
  for (const b of bracketSet) {
    if ((b.layer || 0) !== layer) continue; // reach is on one layer (docs/49 section 9)
    const mx = b.edge === "n" ? b.tx : b.tx - 0.5;
    const my = b.edge === "n" ? b.ty - 0.5 : b.ty;
    const d = Math.hypot(gx - mx, gy - my);
    if (d <= r) out.push({ bracket: b, d, mx, my });
  }
  out.sort((a, b) => a.d - b.d);
  return out;
}

// Holders (posts) within `r` tiles, nearest first.
export function holdersNear(gx, gy, r = 1.3, layer = 0) {
  const out = [];
  for (const p of fireProps) {
    if (!p.fire.holds || (p.layer || 0) !== layer) continue;
    const d = Math.hypot(gx - p.tile[0], gy - p.tile[1]);
    if (d <= r) out.push({ prop: p, d });
  }
  out.sort((a, b) => a.d - b.d);
  return out;
}

// Does a bracket or a holder hold a torch?
export function holderHas(target) {
  return target.kind === "bracket" ? target.bracket.wall.bracket.torch : target.prop.fire.has;
}

// What the torch it holds has left: { wear, lit }. A torch with no `wear` (an old authored one; the village's lights are lanterns
// now) counts as lit for good; one a player mounted keeps its own (#156).
export function holderState(target) {
  const h = target.kind === "bracket" ? target.bracket.wall.bracket : target.prop.fire;
  return { wear: h.wear, lit: h.wear === undefined ? true : target.kind === "bracket" ? h.lit !== false : !!h.lit };
}

// `entry` is the torch being mounted: its wear and whether it is lit go with it, and come back out with it.
export function setHolder(target, has, entry = null) {
  if (target.kind === "bracket") {
    const b = target.bracket.wall.bracket;
    b.torch = has;
    if (has && entry) {
      b.wear = entry.wear || 0;
      b.lit = !!entry.lit;
      if (entry.uid != null) b.uid = entry.uid; // the torch keeps its own entry's uid in the bracket (#523)
      else delete b.uid;
    } else {
      delete b.wear;
      delete b.lit;
      delete b.uid;
    }
    touchWall(target.bracket.wall);
  } else {
    const f = target.prop.fire;
    f.has = has;
    f.lit = has && (entry ? !!entry.lit : true);
    if (has && entry) f.wear = entry.wear || 0;
    else delete f.wear;
    touchProp(target.prop);
  }
  // It touched nothing before 2026-10-15: a guest saw a torch mounted or taken only once its chunk went for another
  // reason (found auditing the changes for the save's cache, `02`).
}

// ---- put out, and the switches (docs/43, section 3; Michael, 2026-10-25) ----
// A lantern in a bracket on or off: `lit: false` when out, nothing when lit (as every authored lantern starts). Touches its wall.
export function setLantern(b, lit) {
  const br = b && b.wall && b.wall.bracket;
  if (!br || !br.lantern || (br.lit !== false) === !!lit) return false;
  if (lit) delete br.lit;
  else br.lit = false;
  touchWall(b.wall);
  emit(lit ? "fireLit" : "firePutOut", { tile: [b.tx, b.ty] });
  return true;
}

// A fire's name in a player's words: a lantern post is a lantern, the pumpkin prop a jack-o'-lantern, else its sprite's words.
const FIRE_NAMES = { lantern_post: "lantern" }; // a fire called by its flame, not its prop
export const fireName = (prop) => FIRE_NAMES[prop.sprite] || propName(prop.sprite);

// Whether a prop's fire is put out by hand (the `putout` verb, burn.js): a switch, a campfire (it keeps its fuel), a post's or a holder's
// torch. A station's fire (the oven, the forge, the cauldron) only burns down (docs/43). Take apart's word asks it too (placement.holdsProblem).
export function putOutByHand(prop) {
  const f = prop && prop.fire;
  return !!(f && (f.switch || prop.sprite === "campfire" || (f.holds && f.has)));
}

// A prop's fire on or off with nothing spent: a switch (a fireplace, a fire pit, a lantern post) either way; any burner or a post's torch
// put out (a campfire keeps the fuel left). Touches its chunk. Returns whether it changed.
export function setFireLit(prop, lit) {
  const f = prop && prop.fire;
  if (!f || f.lit === !!lit) return false;
  if (lit && !f.switch) return false; // lighting a burner or a torch is lightProp's (it asks for fuel or a torch)
  f.lit = !!lit;
  touchProp(prop);
  emit(lit ? "fireLit" : "firePutOut", { id: prop.id, tile: prop.tile }); // not fireOut: that one tells the players near that a fire burnt out
  return true;
}

// A torch in a bracket put out (it keeps its wear). Touches its wall.
export function putOutBracket(b) {
  const br = b && b.wall && b.wall.bracket;
  if (!br || !br.torch || br.lit === false) return false;
  br.lit = false;
  if (br.wear === undefined) br.wear = 0; // an authored torch, lit for good until now, burns from here on when lit again
  touchWall(b.wall);
  emit("firePutOut", { tile: [b.tx, b.ty] });
  return true;
}

// Light what is made to be lit (Michael, 2026-10-17, #156: "fire lights what is made to be lit"): an unlit campfire with fuel in
// it, a torch on a post, or a torch in a bracket that is out (`lightableProp`). Nothing else burns and nothing spreads. The authority's, from
// the `light` verb (burn.js); each returns whether it lit, and touches the chunk so the wire and the save have it.
// The one rule for what a fire can be lit as (the verb and a fireball's landing both ask it): a campfire with fuel in it, or a holder
// (a post) with a torch in it. Not a fireplace, an oven, or a forge: Michael named "a campfire or a torch".
export function lightableProp(prop) {
  const f = prop && prop.fire;
  return !!f && ((prop.sprite === "campfire" && f.burns && f.fuel > 0) || (!!f.holds && f.has));
}

export function lightProp(prop) {
  if (!lightableProp(prop) || prop.fire.lit) return false;
  const f = prop.fire;
  f.lit = true;
  touchProp(prop);
  emit("fireLit", { id: prop.id, tile: prop.tile });
  return true;
}

export function lightBracket(b) {
  const br = b && b.wall.bracket;
  if (!br || !br.torch || br.lit !== false) return false;
  br.lit = true;
  touchWall(b.wall);
  emit("fireLit", { tile: [b.tx, b.ty] });
  return true;
}

// Burners within `r` tiles of (gx, gy), nearest first.
export function burnersNear(gx, gy, r = 1.3, layer = 0) {
  const out = [];
  for (const p of fireProps) {
    if (!p.fire.burns || (p.layer || 0) !== layer) continue;
    const d = Math.hypot(gx - p.tile[0], gy - p.tile[1]);
    if (d <= r) out.push({ prop: p, d });
  }
  out.sort((a, b) => a.d - b.d);
  return out;
}

export function getRoom(id) {
  return rooms.get(id) || null;
}

export function allRooms() {
  return rooms.values();
}

function inBounds(x, y) {
  return !!bounds && x >= bounds[0] && y >= bounds[1] && x < bounds[0] + bounds[2] && y < bounds[1] + bounds[3];
}

// ---- deterministic randomness ----
// Every roll is a hash of the tile and a seed, never a sequence, so a tile
// rolls the same whatever order chunks load in.

export function hash2(x, y, seed) {
  let h = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263) ^ Math.imul(seed | 0, 2246822519);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

// Smooth value noise, 0..1, with lattice points `scale` tiles apart. Density
// drifts with it: thickets and clearings instead of an even sprinkle.
export function valueNoise(x, y, scale, seed) {
  const fx = x / scale;
  const fy = y / scale;
  const x0 = Math.floor(fx);
  const y0 = Math.floor(fy);
  const tx = fx - x0;
  const ty = fy - y0;
  const sx = tx * tx * (3 - 2 * tx);
  const sy = ty * ty * (3 - 2 * ty);
  const a = hash2(x0, y0, seed);
  const b = hash2(x0 + 1, y0, seed);
  const c = hash2(x0, y0 + 1, seed);
  const d = hash2(x0 + 1, y0 + 1, seed);
  return (a + (b - a) * sx) * (1 - sy) + (c + (d - c) * sx) * sy;
}

function densityAt(rule, zone, x, y) {
  if (!Array.isArray(rule.density)) return rule.density;
  const [lo, hi] = rule.density;
  return lo + (hi - lo) * valueNoise(x, y, zone.scale || 8, (rule.seed ?? 1) + 7);
}

// Pick a key from { key: weight } with a 0..1 roll.
function weightedPick(weights, roll) {
  let total = 0;
  for (const k in weights) total += weights[k];
  let r = roll * total;
  for (const k in weights) {
    r -= weights[k];
    if (r <= 0) return k;
  }
  return Object.keys(weights)[0];
}

// A big rock in the wild (Michael, 2026-10-11: sparse, no more than about two
// a screen): each `cell`-square patch of the wild has `chance` of one rock, at
// a spot rolled from the patch. Returns the rock's sprite at this tile, or null.
function wildRockAt(x, y) {
  const r = wild && wild.rocks;
  if (!r) return null;
  const c = r.cell || 40;
  const s = r.seed ?? 51;
  const cx = Math.floor(x / c);
  const cy = Math.floor(y / c);
  if (hash2(cx, cy, s) >= r.chance) return null;
  if (x !== cx * c + Math.floor(hash2(cx, cy, s + 1) * c) || y !== cy * c + Math.floor(hash2(cx, cy, s + 2) * c)) return null;
  return weightedPick(r.kinds, hash2(cx, cy, s + 3));
}

// The wild rule's tree at a tile, or null, without making the tile: the same
// rolls wildTile makes, so anything can ask where the trees are before their
// chunks exist.
function wildPickAt(x, y) {
  if (!wild || wildRockAt(x, y) || hash2(x, y, wild.seed ?? 1) >= densityAt(wild, wild.zone, x, y)) return null;
  return weightedPick(wild.zone.kinds, hash2(x, y, (wild.seed ?? 1) + 1));
}

// What the wild rule stands at a tile: its pick, unless Trees are off and the pick is a tree.
function wildTreeAt(x, y) {
  const kind = wildPickAt(x, y);
  return kind && noTrees && isTreeKind(kind) ? null : kind; // Trees off: the same tiles, minus the trees
}

// Whether a tree stands at a tile: the authored map inside the bounds, the
// wild rule beyond them. Pure, so it answers the same in any order.
// With Trees off it answers for where a tree *would* stand (the scatter's picks, the wild's rolls), so the mushrooms that
// grow beside trees are the same as in a world of the same seed that has them (#142).
function treeAt(x, y) {
  if (inBounds(x, y)) {
    const t = source && source(x, y);
    return !!(t && t.prop && getDef(t.prop.sprite).canopy) || ghostTrees.has(ghostKey(x, y));
  }
  const k = wildPickAt(x, y);
  return !!(k && getDef(k).canopy);
}

function ghostKey(x, y) {
  return (x + 32768) * 65536 + (y + 32768);
}

function treeNear(x, y, r) {
  for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) if ((dx || dy) && treeAt(x + dx, y + dy)) return true;
  return false;
}

// A forage object for a tile, or null: by chance, only near a tree, at a small
// offset inside the tile so they do not line up (docs/02, question 27).
function forageProp(x, y) {
  if (!forage) return null;
  const s = forage.seed ?? 41;
  if (hash2(x, y, s) >= forage.chance) return null;
  if (noTrees && treeAt(x, y)) return null; // where a tree would have stood there is no mushroom, as in a world that has the tree
  if (!treeNear(x, y, forage.near ?? 2)) return null;
  const kind = weightedPick(forage.kinds, hash2(x, y, s + 1));
  const u = (hash2(x, y, s + 2) - 0.5) * 0.6;
  const v = (hash2(x, y, s + 3) - 0.5) * 0.6;
  return createProp({ sprite: kind, tile: [x, y], solid: false, offset: [Math.round((u - v) * 32), Math.round((u + v) * 16)] });
}

// A wild tile: forest by the wild rule, a forage object near the trees, or plain grass.
function wildTile(x, y) {
  const t = createTile();
  if (!wild) return t;
  const rock = wildRockAt(x, y);
  const kind = wildTreeAt(x, y);
  if (rock) t.prop = createProp({ sprite: rock, tile: [x, y] });
  else if (kind) t.prop = createProp({ sprite: kind, tile: [x, y] });
  else t.prop = forageProp(x, y);
  return t;
}

// ---- natural resources: the areas and where a node may stand (docs/46) ----
// A kind keeps a count for its area; a taken node's replacement grows at a random spot in that area (src/resources.js). The area is the
// map's rects, clipped to the valley's bounds: the wild keeps its comeback by new chunks. Where a node may stand is one test, here, made at
// the load (the extra rocks the counts ask for, on the authored tiles) and at every comeback (on the live tiles, its chunk grown first).

export function resourceKinds() {
  return resourceKindList;
}

export function resourceKind(name) {
  return resourceKindList.find((k) => k.name === name) || null;
}

// The kind a sprite is a node of, or null (a tree, a house).
export function resourceKindOf(sprite) {
  return resourceBySprite.get(sprite) || null;
}

export function inResourceArea(kind, x, y) {
  if (!kind || !inBounds(x, y)) return false;
  for (const [rx, ry, rw, rh] of kind.rects) if (x >= rx && y >= ry && x < rx + rw && y < ry + rh) return true;
  return false;
}

// A tile for a pure read that knows the authored map where nothing has grown: the live tile if its chunk is loaded, else the authored one
// (an ungrown chunk inside the bounds is as the file made it, and a valley chunk is never dropped), else null, the plain base tile.
function readTile(x, y) {
  const t = peekTile(x, y);
  if (t) return t;
  return (inBounds(x, y) && source && source(x, y)) || null;
}

function wallReadBetween(x0, y0, x1, y1) {
  const [ex, ey, edge] = edgeBetween(x0, y0, x1, y1);
  const t = readTile(ex, ey);
  return t ? t[edge] : null;
}

// A tree at a tile as it stands now (a felled one gone), or where one would have stood with Trees off (the scatter's ghostTrees).
function standingTreeAt(x, y) {
  if (!inBounds(x, y)) return treeAt(x, y);
  if (ghostTrees.has(ghostKey(x, y))) return true;
  const t = readTile(x, y);
  return !!(t && t.prop && getDef(t.prop.sprite).canopy);
}

// Whether water lies within `r` tiles of (x, y) (a square ring, as the trees' `near`): a floor you drink beside, of the named water `group`
// if one is given (the river; the map file's water rects, `waterBodyAt`). A pure read: it grows nothing.
export function waterNear(x, y, r, group = null) {
  for (let dy = -r; dy <= r; dy++) {
    for (let dx = -r; dx <= r; dx++) {
      if (!dx && !dy) continue;
      const t = readTile(x + dx, y + dy);
      if (!floorRule(t ? t.floor : defaultFloor).drink) continue;
      if (!group || waterBodyAt(x + dx, y + dy) === group) return true;
    }
  }
  return false;
}

// Whether a fill from (x0, y0), bounded by walls (fences and gates, the authored and a player's, and any other wall) and by water no one
// walks, stays within `cap` tiles: a fenced yard or a pen, where nothing grows. A fill past the cap, or out past the valley's bounds, is
// open ground. A see-through wall bounds no room, so the room test alone cannot find a fenced field. A pure read: it grows nothing.
export function fencedIn(x0, y0, cap = RES.yardCap) {
  const seen = new Set([ghostKey(x0, y0)]);
  const stack = [x0, y0];
  while (stack.length) {
    const y = stack.pop();
    const x = stack.pop();
    for (const [dx, dy] of STEPS4) {
      const nx = x + dx;
      const ny = y + dy;
      const k = ghostKey(nx, ny);
      if (seen.has(k)) continue;
      if (wallReadBetween(x, y, nx, ny)) continue;
      if (!inBounds(nx, ny)) return false;
      const nt = readTile(nx, ny);
      if (floorRule(nt ? nt.floor : defaultFloor).walk === false) continue;
      seen.add(k);
      if (seen.size > cap) return false;
      stack.push(nx, ny);
    }
  }
  return true;
}

// Why a node of `kind` may not stand at (x, y), or null when it may (docs/46 section 2). Natural ground only: inside its area; not on the
// scatter's reserved tiles unless they are its own place's (the quarry's to stone); on one of its floors (the base grass, and its own
// place's dirt), so never a road, water, a built floor, or tilled soil; nothing on the tile (a prop, a rug, an item, where a tree would
// stand with Trees off) and no wall on its edges; for a kind that grows `near` trees, a tree within that many tiles; not inside a room
// (`live` only: the rooms are the loaded chunks') nor a fenced yard; no body on it. `live` reads the tile as it is, which the caller has
// grown through a mutator first (a blank tile would test free); without it (the load) the authored tile is read. `not` is a tile it may not
// take: the one a node was just taken from, since a comeback grows somewhere else. Step 2 (#448): a kind that grows by `water` wants water
// within that many tiles (of its `waterGroup`, the river, if it names one; read like the trees, never growing a chunk); a kind whose area
// is its `own` place (the graveyard's herbs) takes the reserved tiles and the fenced yard of its area, as the quarry's stone takes the pit.
export function resourceSpotProblem(kind, x, y, { live = true, bodies = [], not = null } = {}) {
  if (!inResourceArea(kind, x, y)) return "outside its area";
  if (not && not[0] === x && not[1] === y) return "where the last one stood";
  const key = `${x},${y}`;
  const own = kind.own || kind.open.some((name) => openPlaces.has(name) && openPlaces.get(name).has(key));
  if (reservedTiles.has(key) && !own) return "a reserved tile";
  const t = live ? peekTile(x, y) : readTile(x, y);
  if (live && !t) return "not grown";
  const tile = t || blank;
  if (tile.prop || tile.rug) return "under a prop";
  if (tile.items && tile.items.length) return "things lie there";
  if (!(kind.floors.includes(tile.floor) || (own && kind.openFloors.includes(tile.floor)))) return "not natural ground";
  if (tile.n || tile.w || wallReadBetween(x, y, x, y + 1) || wallReadBetween(x, y, x + 1, y)) return "against a wall";
  if (ghostTrees.has(ghostKey(x, y))) return "where a tree would stand";
  if (kind.near) {
    let near = false;
    for (let dy = -kind.near; dy <= kind.near && !near; dy++) for (let dx = -kind.near; dx <= kind.near && !near; dx++) if ((dx || dy) && standingTreeAt(x + dx, y + dy)) near = true;
    if (!near) return "no tree near";
  }
  if (kind.water && !waterNear(x, y, kind.water, kind.waterGroup)) return kind.waterGroup ? `no ${kind.waterGroup} near` : "no water near";
  if (live && roomAt(x, y) > 0) return "inside a room";
  if (!kind.own && fencedIn(x, y)) return "inside a fenced yard";
  for (const b of bodies) if (b && Math.hypot(b.gx - x, b.gy - y) < 1) return "a body stands there";
  return null;
}

// A tile of the area for a roll in 0..1: the rects laid end to end by their tiles, so every tile of the area is as likely.
export function resourceSpotAt(kind, roll) {
  const area = kind.rects.reduce((n, r) => n + r[2] * r[3], 0);
  let cell = Math.min(area - 1, Math.floor(roll * area));
  for (const [rx, ry, rw, rh] of kind.rects) {
    if (cell < rw * rh) return [rx + (cell % rw), ry + Math.floor(cell / rw)];
    cell -= rw * rh;
  }
  return [kind.rects[0][0], kind.rects[0][1]];
}

// A node of `kind` made for (x, y), not placed: its sprite picked by weight and, for a small thing (a mushroom), set a little off the
// tile's centre, both from `roll` (the sim's generator at a comeback, a hash at the load); `id` when the load names it, else the
// world's counter's.
export function makeResourceProp(kind, x, y, roll, id = null) {
  const sprite = weightedPick(kind.sprites, roll());
  const def = { sprite, tile: [x, y], solid: kind.solid };
  if (id) def.id = id;
  if (kind.jitter) {
    const u = (roll() - 0.5) * kind.jitter;
    const v = (roll() - 0.5) * kind.jitter;
    def.offset = [Math.round((u - v) * 32), Math.round((u + v) * 16)];
  }
  return createProp(def);
}

// The nodes of `kind` standing in its area: a census for the checks (the comeback itself keeps debts, never a census). The registry holds
// every authored prop of the valley, grown or not, and every prop of a grown chunk; a carried prop is out of it.
export function resourceCensus(kind) {
  let n = 0;
  for (const p of propsById.values()) if (kind.sprites[p.sprite] !== undefined && inResourceArea(kind, p.tile[0], p.tile[1])) n++;
  return n;
}

// The kinds from a map file's `resources` block, their rects clipped to the bounds and their defaults filled.
function readResourceKinds(json) {
  resourceKindList = [];
  resourceBySprite.clear();
  const base = json.floor || "floor_grass";
  const b = json.bounds;
  for (const [name, k] of Object.entries(json.resources || {})) {
    if (!b || !k || !k.sprites) continue;
    const rects = [];
    for (const [x, y, w, h] of k.rects || [b]) {
      const x0 = Math.max(x, b[0]);
      const y0 = Math.max(y, b[1]);
      const x1 = Math.min(x + w, b[0] + b[2]);
      const y1 = Math.min(y + h, b[1] + b[3]);
      if (x1 > x0 && y1 > y0) rects.push([x0, y0, x1 - x0, y1 - y0]);
    }
    const kind = {
      name,
      sprites: { ...k.sprites },
      count: Math.max(0, k.count | 0),
      rects,
      open: k.open || [],
      floors: k.floors || [base],
      openFloors: k.openFloors || [],
      near: k.near || 0,
      rise: !!k.rise,
      solid: k.solid !== false,
      jitter: k.jitter || 0,
      seed: k.seed ?? 61,
      days: Array.isArray(k.days) ? k.days : null,
      water: k.water || 0, // how close water must be (mageroot, a clay bank; docs/46 step 2)
      waterGroup: k.waterGroup || null, // the named water it must be (the river), or any
      own: !!k.own, // the whole area is its own place: its reserved tiles and its fence open to it (the graveyard to its herbs)
      where: typeof k.where === "string" ? k.where : null, // where it grows, in words, for the card of what it gives (item-info.sourcesOf)
    };
    resourceKindList.push(kind);
    for (const sprite of Object.keys(kind.sprites)) resourceBySprite.set(sprite, kind);
  }
}

export function createTile(floor = defaultFloor) {
  return { floor, n: null, w: null, prop: null, room: 0, items: null };
}

// ---- items on the floor (docs/10) ----
// Entries { id, count, fill? } lying on a tile; the list is made on first use.

export function itemsAt(x, y, layer = 0) {
  return tileAt(x, y, layer).items || [];
}

export function dropItem(x, y, entry, layer = 0) {
  // One thing a cell (#260, Michael 2026-10-24): what does not stack lies as that many entries, never one with a count, so a pick-up
  // never puts several into one cell (a harvest, a pick, or a mine with a full bag drops its overflow here).
  const def = hasItemDef(entry.id) ? getItem(entry.id) : null;
  if (def && !def.stack && (entry.count || 1) > 1) {
    let last = null;
    for (let i = 0; i < entry.count; i++) last = dropItem(x, y, { ...entry, count: 1, uid: i === 0 ? entry.uid : null }, layer);
    return last;
  }
  const t = growTile(x, y, layer);
  markDirty(x, y, layer);
  if (!t.items) t.items = [];
  // The entry itself goes on the floor, less its grid position, so a bag
  // keeps everything in it and a belt its slots (docs/11).
  const e = douse({ ...entry }); // a torch on the floor is out
  delete e.x;
  delete e.y;
  delete e.rot;
  if (e.uid == null) e.uid = nextId("e"); // an item on the floor is named by its uid in a guest's command: the logs of a felled tree were literals with none
  t.items.push(e);
  return e;
}

export function takeItem(x, y, entry, layer = 0) {
  markDirty(x, y, layer);
  const t = tileAt(x, y, layer);
  if (!t.items) return false;
  const i = t.items.indexOf(entry);
  if (i >= 0) t.items.splice(i, 1);
  if (!t.items.length) t.items = null;
  // A thrown thing remembers where it landed and how it points (docs/20); in a hand or a bag it does not.
  if (i >= 0) {
    delete entry.at;
    delete entry.angle;
  }
  return i >= 0;
}

// Clear a prop from every tile it stands on. Felling a tree is this plus logs
// on the ground (docs/02: nothing caches a tree anywhere else).
// Stand a prop (lifted with removeProp) with its anchor at (tx, ty). The
// footprint keeps its shape; the caller checks the tiles are clear.
// Where a prop stands on its tiles: a rug (a flat sprite with `rug: true`, #327) in the tile's own `rug` slot, under whatever stands there, so furniture may stand on it and it
// never blocks a step or a sight; everything else in `prop`.
function slotOf(prop) {
  return getDef(prop.sprite).rug ? "rug" : "prop";
}

// Every prop knows its layer (`layer`, 0 on the ground: saved and sent only when it is not, serializeProp); placed with none given, it
// stays on the layer it was on (docs/49 section 3).
export function placeProp(prop, tx, ty, layer = prop.layer || 0) {
  const [w, h] = prop.footprint;
  prop.tile = [tx, ty];
  prop.layer = layer;
  prop.tiles = [];
  for (let dy = 0; dy < h; dy++) for (let dx = 0; dx < w; dx++) prop.tiles.push([tx + dx, ty + dy]);
  const slot = slotOf(prop);
  for (const [x, y] of prop.tiles) growTile(x, y, layer)[slot] = prop;
  if (prop.fire) fireProps.add(prop);
  propsById.set(prop.id, prop); // a lifted prop left the registry (removeProp); put down, it is findable by its id again
  touch(tx, ty, layer);
  markFootprint(prop);
  if (!layer) groundChanged(prop.tiles, prop); // the ground's bake is layer 0's (an upper floor's is docs/49 step 2's)
}

// A change on a prop's chunk, on the prop's own layer: what a guest must see (touch, markDirty) and what only the save keeps (unsaved).
export function touchProp(prop) {
  touch(prop.tile[0], prop.tile[1], prop.layer || 0);
}
export function markProp(prop) {
  markDirty(prop.tile[0], prop.tile[1], prop.layer || 0);
}
export function unsavedProp(prop, near = true) {
  unsaved(prop.tile[0], prop.tile[1], near, prop.layer || 0);
}

// Whether (x, y) lies in chunk c.
function inChunkTile(c, x, y) {
  return x >= c.cx * CHUNK && x < (c.cx + 1) * CHUNK && y >= c.cy * CHUNK && y < (c.cy + 1) * CHUNK;
}

// A prop across a chunk's edge (#341): every chunk its tiles stand on beyond its anchor's is marked too, so the
// neighbour's record (which names the part, `parts` in serializeChunk) goes to a guest, and the neighbour is dirty and
// never evicted: a wild chunk dropped and grown again would grow without the prop's tiles.
function markFootprint(prop) {
  const layer = prop.layer || 0;
  const [acx, acy] = chunkCoord(prop.tile[0], prop.tile[1]);
  const done = new Set();
  for (const [x, y] of prop.tiles) {
    const [cx, cy] = chunkCoord(x, y);
    if ((cx === acx && cy === acy) || done.has(chunkKey(cx, cy, layer))) continue;
    done.add(chunkKey(cx, cy, layer));
    markDirty(x, y, layer);
  }
}

// A prop leaving its tiles beyond chunk c (it is leaving the registry with c, or c's copy is replaced): each of its
// tiles outside c that still holds it lets it go, so no neighbour keeps a part of a prop nothing answers to (#341).
function clearForeignTiles(c, pr) {
  const slot = slotOf(pr);
  for (const [x, y] of pr.tiles || []) {
    if (inChunkTile(c, x, y)) continue;
    const t = peekTile(x, y, c.layer);
    if (t && t[slot] === pr) {
      t[slot] = null;
      unsaved(x, y, false, c.layer); // the neighbour's saved copy named the part
    }
  }
}

// A chunk grown from the authored map holds the authored prop object on each of its tiles, a prop anchored on a neighbour too. When
// that neighbour is loaded it decides (#341's review: a save holding the anchor's chunk but not this one): the prop standing at its
// anchor by that id, when it still covers this tile, stands here; none, and the tile is clear. A neighbour not loaded leaves the
// authored one, which is then the registry's.
function settleForeignParts(c) {
  for (let i = 0; i < CHUNK * CHUNK; i++) {
    const t = c.tiles[i];
    for (const slot of ["prop", "rug"]) {
      const pr = t[slot];
      if (!pr || !pr.tile || inChunkTile(c, pr.tile[0], pr.tile[1])) continue;
      const [acx, acy] = chunkCoord(pr.tile[0], pr.tile[1]);
      const ac = chunks.get(chunkKey(acx, acy, c.layer));
      if (!ac) continue;
      const x = c.cx * CHUNK + (i % CHUNK);
      const y = c.cy * CHUNK + Math.floor(i / CHUNK);
      const holder = ac.tiles[(pr.tile[1] - acy * CHUNK) * CHUNK + (pr.tile[0] - acx * CHUNK)][slot];
      t[slot] = holder && holder.id === pr.id && holder.tiles.some(([px, py]) => px === x && py === y) ? holder : null;
    }
  }
}

// A prop turned into another kind in place (a fruit tree picked bare, or bearing again), with the day it will change next or null: the
// sprite and `regrowAt` are saved with the prop, and the chunk goes to a guest (fruit.js).
export function restage(prop, sprite, regrowAt) {
  prop.sprite = sprite;
  if (regrowAt === null || regrowAt === undefined) delete prop.regrowAt;
  else prop.regrowAt = regrowAt;
  touchProp(prop);
}

export function removeProp(prop) {
  const layer = prop.layer || 0;
  for (const [tx, ty] of prop.tiles) {
    // growTile, not tileAt: a tile on an ungrown neighbour chunk (#341) must be grown to clear the
    // authored prop from it, or the ghost stands again when the neighbour grows (#582).
    const t = growTile(tx, ty, layer);
    if (t.prop === prop) t.prop = null;
    if (t.rug === prop) t.rug = null;
  }
  fireProps.delete(prop);
  propsById.delete(prop.id);
  touch(prop.tile[0], prop.tile[1], layer);
  markFootprint(prop); // the neighbour's record loses the part (#341)
  if (!layer) groundChanged(prop.tiles, prop);
}

// ---- the ground's hooks (docs/15) ----

export function onGroundChange(fn) {
  groundListeners.push(fn);
}

function groundChanged(tiles, prop = null) {
  for (const fn of groundListeners) fn(tiles, prop);
}

// The only way a floor changes after load, so the ground hears of it.
export function setFloor(x, y, id, layer = 0) {
  const t = growTile(x, y, layer);
  if (t.floor === id) return;
  t.floor = id;
  touch(x, y, layer);
  if (!layer) groundChanged([[x, y]]);
}

// ---- built floors (docs/49 section 5; Michael, 2026-10-27, `02` "Floors are built a tile at a time, with no physics") ----
// A floor a player laid carries `built: { under, free }` on its tile: the floor it replaced (on the ground the grass or the road there, off
// it the void), put back when it is taken up, and whether it cost nothing (Free building: nothing back). It rides its chunk's record
// (`built`), so the save, a guest's frame, and the sync check carry it. No physics: on a storey a tile is laid wherever it touches, by an
// edge, a tile already walkable on that storey (a built or authored floor, or a stair's landing), and a floor's open edge is unwalkable.

// The stair whose landing is (x, y) on `layer` (the stair a storey below), or null.
export function landingAt(x, y, layer = 0) {
  for (const { s, well } of stairsOnLayer.get(layer - 1) || []) if (!well && s.landing[0] === x && s.landing[1] === y) return s;
  return null;
}

// Why floor `id` cannot be laid on (x, y) of `layer`, or "". `grows` (a Set of tileKey3 keys) names tiles of the same drag laid before this
// one, which count as walkable for the touching rule, so a drag grows a floor out from its first tile.
export function floorBuildProblem(x, y, id, layer = 0, grows = null) {
  const t = peekTile(x, y, layer) || tileAt(x, y, layer);
  if (stairAt(x, y, layer)) return "Not over a stair";
  if (landingAt(x, y, layer)) return "Not on a stair's landing";
  if (t.floor === EARTH || t.floor === HOLE) return "Not here";
  if (!isEngineFloor(t.floor) && (floorRule(t.floor).walk === false || floorRule(t.floor).drink || /^floor_water/.test(t.floor))) return "Not on water"; // a ford is never paved (the review of #549)
  if (t.floor === id) return "Already laid";
  if (t.prop || t.rug) return "Something stands there";
  if (layer !== 0 && t.floor === VOID) {
    const touches = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => isWalkableTile(x + dx, y + dy, layer) || !!(grows && grows.has(tileKey3(x + dx, y + dy, layer))));
    if (!touches) return "Build it out from a floor";
  }
  return "";
}

// Lay floor `id` on (x, y) of `layer`, keeping what it replaced. Returns false when it may not be laid.
export function buildFloor(x, y, id, layer = 0, { free = false, grows = null } = {}) {
  if (floorBuildProblem(x, y, id, layer, grows)) return false;
  const t = growTile(x, y, layer);
  const under = t.built ? t.built.under : t.floor;
  t.floor = id;
  t.built = free ? { under, free: true } : { under };
  touch(x, y, layer);
  if (!layer) groundChanged([[x, y]]);
  roomsDirty = true;
  return true;
}

// ---- terrain (Michael, 2026-10-28: the build menu's Terrain tab) ----
// The ground's own surface painted outright: the tile's floor becomes `id` as tilling turns grass to soil, with no `built` record (so no
// Take apart and nothing put back), and the ground bake blends it into its neighbours by the floor id alone, as it does the authored ones.
// The ground only: "Terrain is the ground's". A body on the tile is the caller's to say (the map keeps no bodies).

// Whether floor `id` is water of either kind (a ford or the deep): the terrain that may not go under something.
export function isWaterFloor(id) {
  if (isEngineFloor(id)) return false;
  const r = floorRule(id);
  return r.walk === false || r.walk < 1 || !!r.drink || /^floor_water/.test(id);
}

// Why floor `id` cannot be painted on (x, y) of `layer`, or "".
export function paintGroundProblem(x, y, id, layer = 0) {
  if (layer !== 0) return "Terrain is the ground's";
  const t = peekTile(x, y, 0) || tileAt(x, y, 0);
  if (t.built) return "A floor is laid there";
  if (stairAt(x, y, 0) || landingAt(x, y, 0)) return "Not over a stair";
  if (t.floor === EARTH || t.floor === HOLE || t.floor === VOID) return "Not here";
  if (t.floor === id) return "Nothing to change";
  if (t.prop && t.prop.crop) return "Crops grow there";
  if (isWaterFloor(id) && (t.prop || t.rug || (t.items && t.items.length) || t.n || t.w || tileAt(x, y + 1, 0).n || tileAt(x + 1, y, 0).w)) return "Not under something";
  return "";
}

// Paint floor `id` on the ground at (x, y). Returns false when it may not be painted. Saved and sent with its chunk like any floor change
// (the tile's chunk is marked, so a wild chunk is not evicted and regrown away).
export function paintGround(x, y, id) {
  if (paintGroundProblem(x, y, id, 0)) return false;
  setFloor(x, y, id, 0);
  return true;
}

// Why the built floor on (x, y) of `layer` cannot be taken up, or "" (a body on it is the caller's to say: the map keeps no bodies).
export function floorTakeUpProblem(x, y, layer = 0) {
  const t = peekTile(x, y, layer);
  if (!t || !t.built) return "That floor is not one you laid";
  const s = tileAt(x, y + 1, layer);
  const e = tileAt(x + 1, y, layer);
  if (t.n || t.w || s.n || e.w) return "A wall stands on it";
  if (stairAt(x, y, layer) || landingAt(x, y, layer)) return "A stair stands on it";
  if (t.prop || t.rug) return "Something stands on it";
  if (t.items && t.items.length) return "Something lies on it";
  return "";
}

// Take the built floor on (x, y) of `layer` up, the floor it replaced back (the void off the ground). Its neighbours stay as they are.
export function takeUpFloor(x, y, layer = 0) {
  if (floorTakeUpProblem(x, y, layer)) return null;
  const t = growTile(x, y, layer);
  const was = { floor: t.floor, free: !!t.built.free };
  t.floor = t.built.under;
  delete t.built;
  touch(x, y, layer);
  if (!layer) groundChanged([[x, y]]);
  roomsDirty = true;
  return was;
}

// The zone a tile belongs to: inside the bounds the first scatter rule whose
// rect holds it, beyond them the wild rule's, else "harvest".
export function zoneAt(x, y) {
  if (inBounds(x, y)) {
    for (const r of zoneRects) {
      const [rx, ry, rw, rh] = r.rect;
      if (x >= rx && y >= ry && x < rx + rw && y < ry + rh) return r.zone;
    }
    return "harvest";
  }
  return wildZone || "harvest";
}

// A wall segment on a tile edge. kind: "wall" | "door" | "window". A window has
// wooden shutters: closed blocks sight, open lets you see through (nobody climbs through a window).
//
// An opening is a stack (docs/09): boards on either side, each with its own
// health, and the leaf (the door, or the shutters) with health of its own.
// Read from the attacker's side: that side's boards, the leaf, the far side's
// boards. Everything is spent; a broken leaf is never a leaf again.
export const BOARD_HP = 40;
export const DOOR_HP = 100;
export const SHUTTER_HP = 60;
export const BOARDS_PER_SIDE = 3;

// ---- building (docs/13) ----

export const WALL_SPRITE_DEFAULT = "wall_log";

// The two tiles an edge separates: its own, and the one across it.
export function edgeTiles(tx, ty, edge) {
  return edge === "n" ? [[tx, ty], [tx, ty - 1]] : [[tx, ty], [tx - 1, ty]];
}

// The edge's midpoint on the ground, in grid coordinates.
export function edgeMid(tx, ty, edge) {
  return edge === "n" ? [tx, ty - 0.5] : [tx - 0.5, ty];
}

// Whether a door or a window may be built onto what stands on an edge (Michael, 2026-10-17, #147: "make all walls solid as
// built, and then you can build a window or door directly over top and it stamps it into place and creates the opening"):
// over a plain wall (a door, being a gate, over a fence or bars too; a window not), or over a broken door or window of its own kind,
// as a new one and never a repair ("everything spent, nothing repaired"). An edge with nothing on it takes any kind.
export function canStampOver(existing, kind) {
  if (!existing) return true;
  if (kind !== "door" && kind !== "window") return false;
  if (existing.gate) return false; // a castle gate is taken apart whole (removeGate), never stamped over, even broken
  if (existing.kind === "wall" && wallRule(existing.sprite).battlement) return false; // no door or window in a battlement (art round 13)
  if (existing.kind === "wall" && wallRule(existing.sprite).solid) return false; // no door or window in a cliff (art round 10, Free building's) nor in a ramp's own side
  if (existing.kind === "wall") return kind === "door" || !wallRule(existing.sprite).seeThrough; // a window is no use in a fence or bars
  return existing.kind === kind && !!existing.broken;
}

// Whether a wall of this kind may be built on the edge: nothing there yet (or a plain wall or a broken opening a door or a
// window may stand in, `canStampOver`), no solid prop whose footprint spans it, and a door needs both its tiles to be
// walkable and clear so it can be walked through and stood at.
// Why no wall, door, or window may stand on an edge for a stair's sake, or "" (the review of #549: the cell law and "nobody climbs through a
// window"): none between two of its steps, none across its top edge on its own layer (a body crosses there to the landing), and none on an
// edge of its stairwell on the layer above (a body going down crosses the top edge into the stairwell, whose tiles the collision passes
// whole). Along a stair's sides on its own layer a wall may stand (its sides hold bodies anyway).
export function stairEdgeProblem(tx, ty, edge, layer = 0) {
  if (!stairIndex.size) return "";
  const [a, b] = edgeTiles(tx, ty, edge);
  const ha = stairIndex.get(tileKey3(a[0], a[1], layer));
  const hb = stairIndex.get(tileKey3(b[0], b[1], layer));
  // Across its top, on its own layer or on the storey above (the stairwell's top step against the landing): a body crosses there, and the
  // collision passes a stairwell's tiles whole. The stairwell's sides and its foot end are held by the stair's own edges (stairBlocks), so a
  // wall may stand there, an upper wall running on over a stair along a ground wall (the recheck of #549).
  for (const [h, o] of [[ha, b], [hb, a]]) if (h && h.k === 2 && h.s.landing[0] === o[0] && h.s.landing[1] === o[1]) return "Not across a stair's top";
  if (ha && hb && !ha.well && !hb.well) return "Not across a stair";
  return "";
}

export function canBuildWall(tx, ty, edge, kind = "wall", layer = 0) {
  if (!canStampOver(tileAt(tx, ty, layer)[edge], kind)) return false;
  if (stairEdgeProblem(tx, ty, edge, layer)) return false; // a stair's run, its top, and its stairwell (the review of #549)
  if (ringWallProblem(tx, ty, edge, kind, layer)) return false; // a ring's rules (docs/50 section 5)
  const [a, b] = edgeTiles(tx, ty, edge);
  const pa = tileAt(a[0], a[1], layer).prop;
  const pb = tileAt(b[0], b[1], layer).prop;
  if (pa && pa === pb && pa.solid) return false;
  const ra = tileAt(a[0], a[1], layer).rug;
  if (ra && ra === tileAt(b[0], b[1], layer).rug) return false; // a wall is not built through a laid rug: it would cut it in two (#327)
  if (kind === "door" && (!isWalkableTile(a[0], a[1], layer) || !isWalkableTile(b[0], b[1], layer) || pa || pb)) return false; // both its tiles clear: the dead go for a door, and need to stand at it
  return true;
}

// Whether a tile is one of the two a door stands between (nothing is put down on one, and nothing is generated there:
// the dead who want a room go for its door and must be able to stand at it, #134).
export function besideDoor(x, y, layer = 0) {
  const t = tileAt(x, y, layer);
  if ((t.n && t.n.kind === "door") || (t.w && t.w.kind === "door")) return true;
  const s = tileAt(x, y + 1, layer);
  if (s.n && s.n.kind === "door") return true;
  const e = tileAt(x + 1, y, layer);
  return !!(e.w && e.w.kind === "door");
}

// Build a wall, door, or window on an edge, as an authored one would be, and
// tell sight, light, and the rooms.
export function buildWall(tx, ty, edge, kind, sprite = WALL_SPRITE_DEFAULT, leaf = null, layer = 0) {
  const t = growTile(tx, ty, layer);
  const existing = t[edge];
  if (existing && !canStampOver(existing, kind)) return false;
  if (existing) releaseHangings(tx, ty, edge, layer); // a door or a window stamped over a wall that held a painting: it falls to the floor (#326)
  if (existing) {
    // Stamped over a wall (or a broken opening): the new one is of the same material, so a door in a wood wall is a wood door,
    // and it remembers the wall it replaced, which the removal tool puts back (never a hole where a wall stood).
    sprite = existing.sprite;
    releaseBracket(existing); // a torch on it falls to the floor (#523)
  }
  const wall = createWall(kind, sprite);
  if (existing && existing.kind === "wall") {
    wall.under = existing.sprite;
    if (existing.built) wall.underBuilt = true; // the player's own wall comes back the player's own
    if (existing.free) wall.underFree = true; // and a free one free
    if (existing.round) wall.underRound = existing.round; // a ring's door point: the door keeps the ring under it, so taking it away restores the ring wall (docs/50 section 3)
    if (existing.roundTaken) wall.roundTaken = true; // a wall the ring took in (a house's) stays the house's under a door too
  } else if (existing && existing.under) {
    wall.under = existing.under; // a new door over a broken stamped one still stands in the wall it was stamped into
    if (existing.underBuilt) wall.underBuilt = true;
    if (existing.underFree) wall.underFree = true;
  }
  if (existing && existing.kind !== "wall") {
    // Over a broken door or window at a ring's door point: the ring stays under the new one whether or not the old one stood in a wall
    // (the map's openings and a door taken in), so taking the new one away gives the ring wall back (destroyWall), never a hole.
    if (existing.underRound) wall.underRound = existing.underRound;
    if (existing.roundTaken) wall.roundTaken = true;
  }
  wall.built = true; // made by the player: the removal tool may take it down (docs/13)
  const own = kind !== "wall" ? storedLeaf(sprite, leaf || (existing && existing.kind === kind ? carriedLeaf(existing) : "")) : null; // a door or window of another wood than its wall (#334); nothing stored when it is the wall's own; over a broken one of its kind the default is the old one's wood
  if (own) wall.leaf = own;
  wall.at = addr(tx, ty, layer);
  t[edge] = wall;
  touch(tx, ty, layer);
  rebuildRoomsAround(tx, ty, edge, layer);
  return true;
}

// ---- paintings hung on a wall's face (#326; src/paintings.js) ----
// A wall segment's `hangings` are what hangs on its camera-facing face: { item, slot, span } for a painting (slot "top", "bottom" or "both"; span 1, or 2 for a wide one),
// and { cover: [tx, ty], slot } on the second segment of a wide one, marking it taken by the painting held at (tx, ty). The segment along from this one, towards the
// camera's end of the wall: the next tx for a north wall, the next ty for a west wall.
export function nextAlong(tx, ty, edge) {
  return edge === "n" ? [tx + 1, ty] : [tx, ty + 1];
}

// Take a painting off the wall (the holder's record `rec` on the segment (tx, ty)), its cover too: returns its item id. Nothing is given: the caller puts it in a bag or drops it.
export function removeHanging(tx, ty, edge, rec, layer = 0) {
  const wall = tileAt(tx, ty, layer)[edge];
  if (!wall || !wall.hangings || !wall.hangings.includes(rec) || !rec.item) return null;
  wall.hangings.splice(wall.hangings.indexOf(rec), 1);
  if (!wall.hangings.length) delete wall.hangings;
  touch(tx, ty, layer);
  if (rec.span === 2) {
    const [nx, ny] = nextAlong(tx, ty, edge);
    const w2 = tileAt(nx, ny, layer)[edge];
    if (w2 && w2.hangings) {
      const i = w2.hangings.findIndex((q) => q.cover && q.cover[0] === tx && q.cover[1] === ty && q.slot === rec.slot);
      if (i >= 0) w2.hangings.splice(i, 1);
      if (!w2.hangings.length) delete w2.hangings;
      touch(nx, ny, layer);
    }
  }
  return rec.item;
}

// What hangs on a wall about to go (taken down, or stamped over by a door or a window) falls to the floor on the face's side, as an item, whole: a painting is never lost with its wall.
function releaseHangings(tx, ty, edge, layer = 0) {
  const wall = tileAt(tx, ty, layer)[edge];
  if (!wall || !wall.hangings) return;
  for (const h of [...wall.hangings]) {
    const [htx, hty] = h.cover || [tx, ty];
    const holder = tileAt(htx, hty, layer)[edge];
    const rec = holder && holder.hangings && holder.hangings.find((q) => q.item && (h.item ? q === h : q.slot === h.slot));
    const item = rec ? removeHanging(htx, hty, edge, rec, layer) : null;
    if (item) dropItem(htx, hty, { id: item, count: 1, uid: nextId("e") }, layer);
  }
}

// Take a wall, door, or window off an edge, and whatever hangs on it (its
// boards go with it, a torch bracket is forgotten and the torch in it falls to the floor, a painting falls to the floor).
export function destroyWall(tx, ty, edge, restoreUnder = false, layer = 0) {
  const w0 = peekTile(tx, ty, layer);
  if (w0 && w0[edge] && w0[edge].gate) return removeGate(tx, ty, edge, layer); // a castle gate comes apart whole, each edge giving its plain wall back (never a hole)
  return destroyEdge(tx, ty, edge, restoreUnder, layer);
}

function destroyEdge(tx, ty, edge, restoreUnder = false, layer = 0) {
  const t = growTile(tx, ty, layer);
  const wall = t[edge];
  if (!wall) return false;
  releaseHangings(tx, ty, edge, layer);
  releaseBracket(wall);
  t[edge] = null;
  if (wall.underRound) {
    // A door or a window at a ring's door point, taken away by any path (the removal tool, a ring's own take-down, a fence's burst): the ring
    // wall is back, never a hole in a ring that is still drawn whole (a sealed round room stays a cell). In what stood under it, else the
    // ring's own material; one the ring took in stays the house's (roundTaken) only where a wall of the house stood under the opening.
    const r = rings.get(round.idOf(wall.underRound[0], wall.underRound[1], layer));
    t[edge] = createWall("wall", wall.under || (r && r.sprite) || "wall_stone");
    t[edge].at = addr(tx, ty, layer);
    t[edge].round = wall.underRound; // drawn as the curve (docs/50 section 3)
    if (wall.under ? wall.underBuilt : wall.built) t[edge].built = true;
    if (wall.under ? wall.underFree : wall.free) t[edge].free = true;
    if (wall.roundTaken && wall.under) t[edge].roundTaken = true;
  } else if (restoreUnder && wall.under) {
    // The removal tool takes a built door or window out of the wall it was stamped into, and the wall is back.
    t[edge] = createWall("wall", wall.under);
    t[edge].at = addr(tx, ty, layer);
    if (wall.underBuilt) t[edge].built = true;
    if (wall.underFree) t[edge].free = true; // a wall built while Free building was on comes back free: it gives nothing when taken apart (docs/43, section 2)
  }
  touch(tx, ty, layer);
  rebuildRoomsAround(tx, ty, edge, layer);
  return true;
}

// ---- round rooms (docs/50; Michael, 2026-10-26: "round rooms are option A") ----
// A ring is edge walls: every edge of its stepped outline a plain wall in its tile's `n` or `w` slot, carrying `round: [x0, y0, n]` (its
// square's corner and size; the layer is the wall's own), so rooms, paths, sight, light, reach, bites, the siege, the save, and the wire
// read it as any wall. A door or a window at one of its four door points keeps the ring under it (`underRound`). The record (id, square,
// size, layer, material, built) is made from its walls, never saved or sent on its own: every chunk holding an edge carries it, so a chunk
// sent alone (a guest's frame) brings it, and one installed without it (taken apart on the host) drops it. From the record, on host and
// guest alike and never saved: the curve's chords on the tiles they cross (body collision, `circleBlocked`), the eight tiles the curve
// crosses inside (no furniture, ruled), and the tiles a body cannot reach the centre of (`unreachable`: never walkable for a path).

const rings = new Map(); // id -> { id, x0, y0, n, layer, sprite, built, free, authored }
const ringMarks = new Map(); // chunkKey(x, y, layer) of a tile -> { owner, stepped, crossed, unreachable, curve: [[ax, ay, bx, by, id]] }
const unreachableKeys = new Set(); // chunkKey(x, y, layer) of each unreachable tile
let curveTiles = 0; // tiles carrying a chord: circleBlocked looks only while there are any

function markOf(x, y, layer, make = true) {
  const k = chunkKey(x, y, layer);
  let m = ringMarks.get(k);
  if (!m && make) ringMarks.set(k, (m = { owner: null, stepped: false, crossed: false, unreachable: false, curve: null }));
  return m || null;
}

// The ring with this id, every ring (on one layer when one is named), and the ring whose square holds (x, y).
export function ringById(id) {
  return rings.get(id) || null;
}
export function allRings(layer = null) {
  const out = [...rings.values()];
  return layer == null ? out : out.filter((r) => r.layer === layer);
}
export function ringAt(x, y, layer = 0) {
  const m = ringMarks.get(chunkKey(x, y, layer));
  return m && m.owner ? rings.get(m.owner) || null : null;
}
// The ring a wall is an edge of (its own, or the one under a door at a door point), or null.
export function ringOfWall(wall) {
  const r = wall && (wall.round || wall.underRound);
  if (!r) return null;
  return rings.get(round.idOf(r[0], r[1], layerOf(wall.at))) || null;
}
// Whether a wall is a ring's edge drawn as the curve (a plain wall with the ring's id; a door or a window at a door point is drawn as itself).
export function isRingWall(wall) {
  return !!wall && wall.kind === "wall" && !!wall.round;
}
// Whether a wall is drawn by its ring (render/rings.js): a ring's edge, or a door or a window at one of its door points (drawn in the curve,
// with no straight frame: Michael's playtest, 2026-10-27).
export function drawnByRing(wall) {
  return !!wall && !!(wall.round || wall.underRound);
}
// The face of a ring edge on its `side` (+1 the edge's near side, -1 its far), at the edge's point on the curve: { gx, gy, a, out } (the ground
// point `off` tiles off the curve on that side, the angle, and +1 when the side is the ring's outside), or null when it is no ring edge or,
// unless `any`, when the camera does not see that face (a torch is put only where it can be seen, as on a straight wall's camera face).
export function ringFace(tx, ty, edge, side = 1, layer = 0, any = false, off = 0.3) {
  const wall = tileAt(tx, ty, layer)[edge];
  const r = ringOfWall(wall);
  if (!r) return null;
  const [mx, my] = edgeMid(tx, ty, edge);
  const s = round.shape(r.x0, r.y0, r.n);
  const len = Math.hypot(mx - s.cx, my - s.cy) || 1;
  const ux = (mx - s.cx) / len;
  const uy = (my - s.cy) / len;
  const [dx, dy] = edge === "n" ? [0, side] : [side, 0];
  const out = dx * ux + dy * uy >= 0 ? 1 : -1;
  if (!any && out * (ux + uy) <= 0) return null; // the face looks away from the camera (its outward normal's x + y is the depth toward it)
  const p = round.onCurve(s, mx, my, out * off);
  return { gx: p.gx, gy: p.gy, a: p.a, out };
}

// The geometry of a ring's record.
export function ringShape(r) {
  return round.shape(r.x0, r.y0, r.n);
}
// One of the eight tiles the curve crosses inside a ring: no furniture stands there (Michael, 2026-10-26: "furniture can't be placed on those 8 tiles").
export function curveCrossed(x, y, layer = drawLayer) { // the layer a read names, else the one being read (map.withDrawLayer: a storey drawn, E and the menu on the player's floor)
  const m = ringMarks.get(chunkKey(x, y, layer));
  return !!(m && m.crossed);
}
// A tile whose centre no body can reach for the curve (docs/50 section 2).
export function unreachableAt(x, y, layer = drawLayer) {
  return unreachableKeys.has(chunkKey(x, y, layer));
}
// Why furniture (a prop that stands, set down, built, carried, or made) may not stand on (x, y), or "": the ring's curve crosses the tile.
export function ringFurnitureProblem(x, y, layer = drawLayer) {
  return curveCrossed(x, y, layer) ? "Not against the curve" : "";
}

// The record into the index, its marks made: the square's tiles owned, the stepped and crossed ones marked, the unreachable ones kept,
// each chord on every tile its box touches.
function addRing(rec) {
  if (rings.has(rec.id)) return rings.get(rec.id);
  rings.set(rec.id, rec);
  const s = round.shape(rec.x0, rec.y0, rec.n);
  const L = rec.layer;
  for (let y = rec.y0; y < rec.y0 + rec.n; y++) for (let x = rec.x0; x < rec.x0 + rec.n; x++) markOf(x, y, L).owner = rec.id;
  for (const [x, y] of s.stepped) markOf(x, y, L).stepped = true;
  for (const [x, y] of s.crossed) markOf(x, y, L).crossed = true;
  for (const [x, y] of s.unreachable) {
    markOf(x, y, L).unreachable = true;
    unreachableKeys.add(chunkKey(x, y, L));
  }
  for (const c of s.chords) {
    const [ax, ay, bx, by] = c;
    for (let y = Math.floor(Math.min(ay, by) + 0.5 - 1e-6); y <= Math.floor(Math.max(ay, by) + 0.5 + 1e-6); y++) {
      for (let x = Math.floor(Math.min(ax, bx) + 0.5 - 1e-6); x <= Math.floor(Math.max(ax, bx) + 0.5 + 1e-6); x++) {
        const m = markOf(x, y, L);
        if (!m.curve) {
          m.curve = [];
          curveTiles++;
        }
        m.curve.push([ax, ay, bx, by, rec.id]);
      }
    }
  }
  roomsDirty = true;
  return rec;
}

function dropRing(id) {
  const rec = rings.get(id);
  if (!rec) return;
  rings.delete(id);
  const L = rec.layer;
  for (let y = rec.y0 - 1; y <= rec.y0 + rec.n; y++) {
    for (let x = rec.x0 - 1; x <= rec.x0 + rec.n; x++) {
      const k = chunkKey(x, y, L);
      const m = ringMarks.get(k);
      if (!m) continue;
      if (m.owner === id) {
        m.owner = null;
        m.stepped = m.crossed = m.unreachable = false;
        unreachableKeys.delete(k);
      }
      if (m.curve) {
        m.curve = m.curve.filter((c) => c[4] !== id);
        if (!m.curve.length) {
          m.curve = null;
          curveTiles--;
        }
      }
      if (!m.owner && !m.curve) ringMarks.delete(k);
    }
  }
  roomsDirty = true;
}

// A record made from one of its walls (installed from a save or a frame).
function ringFromWall(wall, layer) {
  const [x0, y0, n] = wall.round || wall.underRound;
  return { id: round.idOf(x0, y0, layer), x0, y0, n, layer, sprite: wall.kind === "wall" ? wall.sprite : wall.under || wall.sprite, built: !!(wall.built || wall.underBuilt), free: !!(wall.free || wall.underFree), authored: false };
}

// A chunk installed or grown: a ring with an outline edge on it that no longer carries it is gone (taken apart on the host), and a ring
// its walls name that the index lacks is added (built on the host, or kept by the save).
function settleRings(c) {
  const x0 = c.cx * CHUNK;
  const y0 = c.cy * CHUNK;
  const wallAt = (tx, ty, edge) => {
    if (tx < x0 || ty < y0 || tx >= x0 + CHUNK || ty >= y0 + CHUNK) return undefined;
    return c.tiles[(ty - y0) * CHUNK + (tx - x0)][edge];
  };
  for (const r of [...rings.values()]) {
    if (r.layer !== c.layer || r.authored) continue;
    if (r.x0 > x0 + CHUNK || r.y0 > y0 + CHUNK || r.x0 + r.n < x0 || r.y0 + r.n < y0) continue;
    let mine = 0;
    let kept = 0;
    for (const [tx, ty, edge] of round.shape(r.x0, r.y0, r.n).outline) {
      const w = wallAt(tx, ty, edge);
      if (w === undefined) continue;
      mine++;
      const tag = w && (w.round || w.underRound);
      if (tag && tag[0] === r.x0 && tag[1] === r.y0 && tag[2] === r.n) kept++;
    }
    if (mine && !kept) dropRing(r.id);
  }
  for (const t of c.tiles) {
    for (const w of [t.n, t.w]) {
      if (!w || !(w.round || w.underRound)) continue;
      const rec = ringFromWall(w, c.layer);
      const have = rings.get(rec.id);
      if (!have) {
        if (w.roundTaken) rec.fromTaken = true; // a wall it took in says nothing of the ring's own (the house's, an authored one): kept until one of its own is seen
        addRing(rec);
      } else if (have.fromTaken && !w.roundTaken) {
        Object.assign(have, { sprite: rec.sprite, built: rec.built, free: rec.free });
        delete have.fromTaken;
      }
    }
  }
}

// The edges of a ring's outline (at x0, y0, n) with nothing on them yet: the ones it would lay, and pay for (a wall already there is taken in).
export function ringNewEdges(x0, y0, n, layer = 0) {
  return round.shape(x0, y0, n).outline.filter(([tx, ty, e]) => !(peekTile(tx, ty, layer) && peekTile(tx, ty, layer)[e])).length;
}

// The plain walls a ring laid itself (not taken in), still standing: what taking it apart gives back for.
// The edges a ring laid itself (not taken in), still its own: a plain ring wall, or the ring's wall under a door or a window stamped into it
// later (taken down with the ring, door and all): what taking it apart gives back for.
export function ringOwnEdges(r) {
  return round.shape(r.x0, r.y0, r.n).outline.filter(([tx, ty, e]) => {
    const w = tileAt(tx, ty, r.layer)[e];
    const tag = w && (w.round || w.underRound);
    if (!tag || w.roundTaken || tag[0] !== r.x0 || tag[1] !== r.y0 || tag[2] !== r.n) return false;
    return w.kind === "wall" || !!w.under;
  }).length;
}

// Why a ring's rule refuses a wall of `kind` on this edge, or "" (docs/50 sections 3 and 5): a door or a window on a ring edge only at one of
// its four door points; no wall on an edge between two of a ring's stepped tiles; a ring's edge is already a wall (canStampOver); and a
// straight wall toward a ring ends at a vertex of its stepped outline (ringJoinProblem).
export function ringWallProblem(tx, ty, edge, kind = "wall", layer = 0) {
  if (!rings.size) return "";
  const existing = tileAt(tx, ty, layer)[edge];
  const r = existing ? ringOfWall(existing) : null;
  if (r && (kind === "door" || kind === "window") && !round.isDoorPoint(r.x0, r.y0, r.n, tx, ty, edge)) return "Only at a door point of the curve";
  const [a, b] = edgeTiles(tx, ty, edge);
  const ra = ringAt(a[0], a[1], layer);
  if (ra && ra === ringAt(b[0], b[1], layer) && round.isStepped(ra.x0, ra.y0, ra.n, a[0], a[1]) && round.isStepped(ra.x0, ra.y0, ra.n, b[0], b[1])) return "Not inside a round room";
  if (!existing) return ringJoinProblem(tx, ty, edge, layer); // a door or a window stamped over a wall changes no wall's end
  return "";
}

// ---- a straight wall meeting a ring (docs/50 section 3: "A straight wall meeting a ring ends at a vertex of the stepped outline") ----
// A vertex (vx, vy) is the top vertex of tile (vx, vy), as render/walls.js postAt names it. The four edges that meet there, each with the way
// it leaves the vertex.
const VERTEX_EDGES = [[0, 0, "n", 1, 0], [-1, 0, "n", -1, 0], [0, 0, "w", 0, 1], [0, -1, "w", 0, -1]];
// The rings whose square holds one of the vertex's four tiles (a vertex on a square's side or corner among them).
function ringsAtVertex(vx, vy, layer) {
  const out = [];
  for (const [dx, dy] of [[-1, -1], [0, -1], [-1, 0], [0, 0]]) {
    const r = ringAt(vx + dx, vy + dy, layer);
    if (r && !out.includes(r)) out.push(r);
  }
  return out;
}
// Whether a wall other than the edge (tx, ty, edge) stands on one of the edges meeting at the vertex.
function otherWallAt(vx, vy, layer, tx, ty, edge) {
  for (const [dx, dy, e] of VERTEX_EDGES) {
    if (vx + dx === tx && vy + dy === ty && e === edge) continue;
    const t = peekTile(vx + dx, vy + dy, layer);
    if (t && t[e]) return true;
  }
  return false;
}

// Why a wall on this empty edge would end in a ring's corner pocket, or "": a wall toward a ring ends at a vertex of the stepped outline, where
// the join is a wall corner and the rooms on either side are sealed by the ring's edges; one ending at a pocket's vertex (the square's own
// corner, or a 7 by 7's pocket corner on its side) leaves the room open past its end. The end that counts is the one nearer the ring's centre
// (a wall may run on outward from the ring as far as it likes): there another wall must already meet it. Walls are built an edge at a time,
// so a wall through a pocket to the outline is built from the ring outward, its first edge at the outline's vertex (a run along the square's
// side to a step corner, or a 7 by 7's run through its pocket to the diagonal corner), and a wall ending at the square's corner is refused.
export function ringJoinProblem(tx, ty, edge, layer = 0) {
  if (!rings.size) return "";
  const ends = edge === "n" ? [[tx, ty], [tx + 1, ty]] : [[tx, ty], [tx, ty + 1]];
  for (let i = 0; i < 2; i++) {
    const [vx, vy] = ends[i];
    const [ox, oy] = ends[1 - i];
    const rs = ringsAtVertex(vx, vy, layer);
    if (!rs.length || rs.some((r) => round.isOutlineVertex(r.x0, r.y0, r.n, vx, vy))) continue;
    for (const r of rs) {
      if (!round.isPocketVertex(r.x0, r.y0, r.n, vx, vy)) continue;
      const s = round.shape(r.x0, r.y0, r.n);
      const nearer = Math.hypot(vx - 0.5 - s.cx, vy - 0.5 - s.cy) <= Math.hypot(ox - 0.5 - s.cx, oy - 0.5 - s.cy) + 1e-9;
      if (nearer && !otherWallAt(vx, vy, layer, tx, ty, edge)) return "Start it at a step of the round wall";
    }
  }
  return "";
}

// A straight wall joining a ring at the vertex (vx, vy) on `layer` (docs/50 section 3), or null when the vertex is on no ring's outline:
// { ring, walls, fills }. `walls` are the straight walls meeting there ({ wall, tx, ty, edge, dir }, not drawn by a ring); `fills` the
// filler's pieces they call for, each an outline edge from the vertex to where the curve crosses it ({ tx, ty, edge, d, dir, top, vx, vy,
// by }: `top` when the vertex is the edge's top vertex, `by` the wall it belongs to): along a wall's own line when that line runs on into
// the curve (a wall square to the ring's side, or into a 7 by 7's diagonal corner), else down the step edge (a wall along the square's
// side, tangent to the curve). None at a door point's ends, where the curve touches the outline. The picture's alone (render/walls.js):
// nothing here is saved, sent, or read by the world.
// Whether a straight wall meeting a ring takes a filler there: a solid plain wall (a castle gate as its run's), never a see-through one (a fence,
// bars), a cliff, a ramp's side, or a battlement, which keep their own ends.
export function ringJoinFills(wall) {
  const rule = wallRule(wall.gate ? wallRule(wall.sprite).run : wall.sprite);
  return !(rule.seeThrough || rule.cliff || rule.battlement || rule.side);
}

export function ringJoin(vx, vy, layer = drawLayer) {
  if (!rings.size) return null;
  for (const r of ringsAtVertex(vx, vy, layer)) {
    if (!round.isOutlineVertex(r.x0, r.y0, r.n, vx, vy)) continue;
    const walls = [];
    for (const [dx, dy, e, ux, uy] of VERTEX_EDGES) {
      const t = peekTile(vx + dx, vy + dy, layer);
      const w = t && t[e];
      if (w && !drawnByRing(w)) walls.push({ wall: w, tx: vx + dx, ty: vy + dy, edge: e, dir: [ux, uy] });
    }
    const can = round.fillsAt(r.x0, r.y0, r.n, vx, vy);
    const fills = [];
    const add = (f, by) => {
      if (!fills.some((g) => g.tx === f.tx && g.ty === f.ty && g.edge === f.edge)) fills.push({ ...f, top: f.tx === vx && f.ty === vy, vx, vy, by });
    };
    const lined = (w) => can.find((f) => f.dir[0] === -w.dir[0] && f.dir[1] === -w.dir[1]); // the wall's own line running on past the vertex
    const solid = walls.filter((w) => ringJoinFills(w.wall)); // a fence, bars, a cliff, a ramp's side, or a battlement takes no fill (the review of #589: a fence square into a step corner took the fill a stone wall tangent there needed)
    for (const w of solid) if (lined(w)) add(lined(w), w);
    for (const w of solid) if (!lined(w)) for (const f of can) add(f, w);
    return { ring: r, walls, fills };
  }
  return null;
}

// Why a ring of size n with its square's corner at (x0, y0) may not be built on `layer`, or "" (docs/50 section 5): 5 or 7 across; no other
// ring's square overlapping its own; every stepped tile open floor (walkable, off the water) with nothing on it (no prop, rug, or item) and
// no wall between two of them; every outline edge free, a plain solid wall (taken into the ring), or a door or a window at a door point.
export function ringProblem(x0, y0, n, layer = 0) {
  if (!round.validSize(n)) return "A round room is 5 or 7 across";
  for (let y = y0 - 1; y <= y0 + n; y++) for (let x = x0 - 1; x <= x0 + n; x++) if (ringAt(x, y, layer) && x >= x0 && y >= y0 && x < x0 + n && y < y0 + n) return "Another round room is there";
  const s = round.shape(x0, y0, n);
  for (const [x, y] of s.stepped) {
    const t = peekTile(x, y, layer);
    if (!t) return "Too far from anyone"; // a chunk not grown: nothing is built where no one is
    if (layer > 0 && isEngineFloor(t.floor)) { // upstairs, an empty tile is the void: say which, since the ground's wording ("empty ground") hides it (Michael's playtest, 2026-10-29)
      const h = stairAt(x, y, layer);
      return h && h.well ? "A stairwell is under it: keep the ring off the stair's hole" : "A round room upstairs needs a floor under all of it";
    }
    if (floorRule(t.floor).walk !== 1 || floorRule(t.floor).drink) return "Not on water or empty ground";
    if (t.prop || t.rug) return "Something is in the way";
    if (t.items && t.items.length) return "Clear the floor first";
    if (round.isStepped(x0, y0, n, x, y - 1) && t.n) return "A wall is in the way";
    if (round.isStepped(x0, y0, n, x - 1, y) && t.w) return "A wall is in the way";
  }
  for (const [tx, ty, edge] of s.outline) {
    const stairWhy = stairEdgeProblem(tx, ty, edge, layer); // never across a stair's run or top (the recheck of #549)
    if (stairWhy) return stairWhy;
    const w = peekTile(tx, ty, layer) ? peekTile(tx, ty, layer)[edge] : null;
    if (!w) continue;
    if (w.round || w.underRound) return "Another round room is there";
    if (w.bracket && w.bracket.lantern) return "A lantern is in the way"; // the village's, never taken down by a player (a torch on a wall taken in falls, buildRing)
    if (w.kind === "wall" && !wallRule(w.sprite).seeThrough) continue;
    if ((w.kind === "door" || w.kind === "window") && round.isDoorPoint(x0, y0, n, tx, ty, edge) && !wallRule(w.sprite).seeThrough) continue;
    return w.kind === "wall" ? "Not over a fence" : "A door or a window is in the way";
  }
  // No straight wall already ending in one of its corner pockets (the review of #589): the join rule (ringJoinProblem) asked of the walls that
  // stand, as it would be asked of each if it were built after the ring. A wall alone at a pocket's vertex, that vertex its end nearer the
  // ring's centre, would leave the room open past its end.
  for (const [vx, vy] of round.pocketVerticesOf(x0, y0, n)) {
    const at = [];
    for (const [dx, dy, e, ux, uy] of VERTEX_EDGES) {
      const t = peekTile(vx + dx, vy + dy, layer);
      if (t && t[e]) at.push([ux, uy]);
    }
    if (at.length !== 1) continue;
    const [ux, uy] = at[0];
    const d = (x, y) => Math.hypot(x - 0.5 - s.cx, y - 0.5 - s.cy);
    if (d(vx, vy) <= d(vx + ux, vy + uy) + 1e-9) return "A wall ends in its corner: start it at a step";
  }
  return "";
}

// Build a ring: its outline's edges walls of `sprite` carrying its id, a plain wall already there taken into it (drawn as the curve now,
// what hung on it falling to the floor), a door or a window at a door point keeping the ring under it. Touches every chunk it stands on.
export function buildRing(x0, y0, n, sprite, layer = 0, { built = true, free = false } = {}) {
  if (ringProblem(x0, y0, n, layer)) return null;
  const tag = [x0, y0, n];
  for (const [tx, ty, edge] of round.shape(x0, y0, n).outline) {
    const t = growTile(tx, ty, layer);
    const w = t[edge];
    if (w && w.kind !== "wall") {
      w.underRound = tag; // a door or a window already at a door point stays, the ring under it; taken in, it is not the ring's to take away
      w.roundTaken = true;
    } else if (w) {
      releaseHangings(tx, ty, edge, layer); // no painting on the curve (docs/50 section 3)
      releaseBracket(w); // and a torch on its face falls to the floor, put out, as when a wall goes: the curve's faces are not the wall's (#523)
      delete w.bracket;
      w.round = tag; // a plain wall already there (a house's, against which the ring stands as an apse): drawn as the curve, its own still
      w.roundTaken = true;
    } else {
      const nw = createWall("wall", sprite);
      nw.round = tag;
      if (built) nw.built = true;
      if (free) nw.free = true;
      nw.at = addr(tx, ty, layer);
      t[edge] = nw;
    }
    touch(tx, ty, layer);
  }
  const rec = addRing({ id: round.idOf(x0, y0, layer), x0, y0, n, layer, sprite, built, free, authored: false });
  for (const [tx, ty] of round.shape(x0, y0, n).stepped) touch(tx, ty, layer); // every chunk under it is sent, never evicted
  markRoomsDirty();
  return rec;
}

// Take a ring down whole (the removal tool, docs/50 section 5): its doors and windows at the door points first, then every edge of it,
// a torch on it falling to the floor as from any wall. Returns the walls taken (what they cost is the caller's to give back).
export function removeRing(id) {
  const r = rings.get(id);
  if (!r) return null;
  const taken = [];
  const s = round.shape(r.x0, r.y0, r.n);
  const mine = (w) => {
    const tag = w && (w.round || w.underRound);
    return !!tag && tag[0] === r.x0 && tag[1] === r.y0 && tag[2] === r.n;
  };
  // A wall or an opening the ring took in when it was built is left as it was before, straight again; only what the ring laid goes.
  const release = (tx, ty, edge, w) => {
    delete w.round;
    delete w.underRound;
    delete w.roundTaken;
    touch(tx, ty, r.layer);
  };
  for (const [tx, ty, edge] of s.outline) {
    const w = tileAt(tx, ty, r.layer)[edge];
    if (!mine(w) || w.kind === "wall") continue;
    if (w.roundTaken) release(tx, ty, edge, w);
    else {
      taken.push({ ...w });
      destroyWall(tx, ty, edge, true, r.layer); // the ring wall comes back under it, then goes with the rest
    }
  }
  for (const [tx, ty, edge] of s.outline) {
    const w = tileAt(tx, ty, r.layer)[edge];
    if (!mine(w)) continue;
    if (w.roundTaken) release(tx, ty, edge, w);
    else {
      taken.push({ ...w });
      destroyWall(tx, ty, edge, false, r.layer);
    }
  }
  dropRing(id);
  markRoomsDirty();
  return taken;
}

// ---- castle gates (Michael, 2026-10-29; docs/02, docs/09) ----
// A castle gate is a door-kind wall on each of the 2 or 3 consecutive edges of one run, each carrying `gate: { i }` (its place in the run, 0 the
// first: the smallest tx on a north run, ty on a west) and the gate's sprite (`wall_stone_gate_2`, whose definition says `wall.gate`). One open
// state is kept on all of them (setGateOpen, the only place it changes), so every path that reads a door reads a gate (bodies, rooms, light, the
// save, the chunk delta, the sync check) and the rest is the flags of the definition: a portcullis passes sight and light when shut (`grille`)
// but never a body; the dead cannot break it (`deadBreak: false`); bites and blows do not pass its bars (`bitesPass: false`); shots do
// (`shotsPass`); fire does not spread through it (`fireSpreads: false`, vacuous: nothing here spreads); `swing` seconds to rise or fall. A later
// ruling flips a flag in the definition's data, not code, as a villager's `immune` does.

// The gate rule of a wall, or null: the definition's `wall.gate` of a wall carrying a `gate` record.
export function gateOf(wall) {
  return wall && wall.gate ? wallRule(wall.sprite).gate : null;
}
export const isGate = (wall) => !!wall && !!wall.gate;

function gateFlag(wall, flag) {
  const g = gateOf(wall);
  return g ? g[flag] : undefined;
}

// A shut gate whose bars pass sight and light (`grille`).
function gateGrille(wall) {
  return !!wall && !!wall.gate && gateFlag(wall, "grille") !== false;
}

// A gate the dead cannot break (`deadBreak` not true): needsBreaking and damageOpening leave it alone, and they never target it.
export function gateHolds(wall) {
  return !!wall && !!wall.gate && gateFlag(wall, "deadBreak") !== true;
}

// The health a gate's edge is made with: Infinity when the dead cannot break it, else its definition's `hp`; undefined for a wall that is no gate.
function gateHp(kind, sprite) {
  const g = kind === "door" ? wallRule(sprite).gate : null;
  if (!g) return undefined;
  return g.deadBreak === true ? g.hp || DOOR_HP * 4 : Infinity;
}

// The height below which shots (arrows, spells, thrown things) pass the edge: a castle gate whose definition says `shotsPass` lets them through
// its arch (shut or open) up to the crown; 0 for anything else.
export function gateShotHeight(wall) {
  const g = gateOf(wall);
  return g && g.shotsPass !== false && !boarded(wall) ? (g.opening && g.opening.crown) || 78 : 0;
}

// The seconds a gate takes to rise or fall (its definition's `swing`), for the drawing.
export function gateSwing(wall) {
  const g = gateOf(wall);
  return (g && Number(g.swing)) || 1.2;
}

// The first edge of the gate that the wall at (tx, ty, edge) is one of: [x, y].
export function gateStart(tx, ty, edge, wall) {
  const i = (wall && wall.gate && wall.gate.i) || 0;
  return edge === "n" ? [tx - i, ty] : [tx, ty - i];
}

// Every edge of the gate that the wall at (tx, ty, edge) is one of, in order: [{ tx, ty, edge, wall }] (those loaded; a stale record, a sprite
// that is no longer the first's, is left out).
export function gateMembers(tx, ty, edge, layer = 0) {
  const t0 = peekTile(tx, ty, layer);
  const w0 = t0 && t0[edge];
  if (!w0 || !w0.gate) return [];
  const span = (gateOf(w0) && gateOf(w0).span) || 1;
  const [sx, sy] = gateStart(tx, ty, edge, w0);
  const out = [];
  for (let k = 0; k < span; k++) {
    const x = edge === "n" ? sx + k : sx;
    const y = edge === "n" ? sy : sy + k;
    const t = peekTile(x, y, layer);
    const w = t && t[edge];
    if (!w || !w.gate || w.gate.i !== k || w.sprite !== w0.sprite) continue;
    out.push({ tx: x, ty: y, edge, wall: w });
  }
  return out;
}

// Open or shut the whole gate the wall at (tx, ty, edge) is part of: every edge of it, each touched so the save and the wire carry it. Returns whether it was a gate.
export function setGateOpen(tx, ty, edge, open, layer = 0) {
  const members = gateMembers(tx, ty, edge, layer);
  for (const m of members) {
    m.wall.open = !!open;
    touch(m.tx, m.ty, layer);
  }
  return members.length > 0;
}

// A gate given way whole (its flag `deadBreak` turned on): every edge broken and open.
function breakGate(wall) {
  const at = wall.at;
  if (!at) return;
  const layer = layerOf(at);
  const tile = peekTile(at[0], at[1], layer);
  const edge = tile && tile.n === wall ? "n" : "w";
  for (const m of gateMembers(at[0], at[1], edge, layer)) {
    m.wall.broken = true;
    m.wall.open = true;
    m.wall.hp = 0;
    touch(m.tx, m.ty, layer);
  }
}

// Why a gate of `sprite` may not stand on the run that begins at the edge (tx, ty, edge) on `layer`, or "": each of its edges is a plain wall of the
// gate's run (stone), one that is a wall and nothing more (no door, window, or other gate, nothing hung on it, no torch in a bracket, no round room's
// curve), and each fit for a door (both its tiles clear, no stair across it).
export function gateProblem(tx, ty, edge, sprite, layer = 0) {
  const rule = wallRule(sprite);
  const g = rule.gate;
  if (!g) return "Not a gate";
  for (let k = 0; k < g.span; k++) {
    const x = edge === "n" ? tx + k : tx;
    const y = edge === "n" ? ty : ty + k;
    const w = tileAt(x, y, layer)[edge];
    if (!w) return "Over a stone wall";
    if (w.gate) return "Already a gate";
    if (w.kind !== "wall" || w.sprite !== rule.run) return "Over a plain stone wall";
    if (w.round) return "Not on a round room";
    if (w.hangings && w.hangings.length) return "Take what hangs there down first";
    if (w.bracket) return "Take the torch down first";
    if (!canBuildWall(x, y, edge, "door", layer)) return "No room";
  }
  return "";
}

// Build a gate of `sprite` on the run beginning at (tx, ty, edge): its edges stamped over the plain walls (each remembers the wall it replaced, which
// taking the gate apart puts back), shut. Returns whether it was built.
export function buildGate(tx, ty, edge, sprite, layer = 0, { free = false } = {}) {
  if (gateProblem(tx, ty, edge, sprite, layer)) return false;
  const g = wallRule(sprite).gate;
  for (let k = 0; k < g.span; k++) {
    const x = edge === "n" ? tx + k : tx;
    const y = edge === "n" ? ty : ty + k;
    const t = growTile(x, y, layer);
    const existing = t[edge];
    const wall = createWall("door", sprite);
    wall.gate = { i: k };
    wall.under = existing.sprite;
    if (existing.built) wall.underBuilt = true;
    if (existing.free) wall.underFree = true;
    wall.built = true;
    if (free) wall.free = true;
    wall.at = addr(x, y, layer);
    t[edge] = wall;
    touch(x, y, layer);
  }
  for (let k = 0; k < g.span; k++) rebuildRoomsAround(edge === "n" ? tx + k : tx, edge === "n" ? ty : ty + k, edge, layer);
  return true;
}

// Take the gate that a wall is one of apart whole: every edge destroyed, the plain wall it was stamped into put back on each. Returns whether it was a gate.
export function removeGate(tx, ty, edge, layer = 0) {
  const members = gateMembers(tx, ty, edge, layer);
  for (const m of members) destroyEdge(m.tx, m.ty, m.edge, true, layer);
  return members.length > 0;
}

// ---- fences (Michael, 2026-10-17, #147; 2026-10-18, #174): the dead strike one down ----
// A fence, or a gate (a door in a fence), has hit points like a door: `fenceHp`, a gate `fenceGateFactor` of it (`createWall`). A dead one
// at it STRIKES it, on the attack animation and the bite's cooldown, each strike taking `zombie.fenceStrike` hit points (`strikeFence`),
// as on a player; a crowd is simply more strikers. The damage stays (saved with the wall; nothing mends it). At nothing left it is gone
// (`destroyWall`: the save and the wire carry it like any change) and `fenceBurst` says where, for the splinters every client draws;
// every strike says `wallStruck`, one small jolt for every client's drawing of it. Walls never break (2026-10-10 stands): only what
// `wall.fence` says.

export function isFence(wall) {
  return !!wall && wallRule(wall.sprite).fence === true;
}

// The closed fence (or gate) a body at (gx, gy) is pressed against on the way to (tx, ty): within reach of the edge's middle
// and on the goal's side, the most so of the four edges round its tile; null when there is none.
export function fenceAhead(gx, gy, tx, ty, reach = 0.8, layer = 0) {
  const x = Math.round(gx);
  const y = Math.round(gy);
  const dx = tx - gx;
  const dy = ty - gy;
  const len = Math.hypot(dx, dy) || 1;
  let best = null;
  for (const [ex, ey, edge, mx, my] of [[x, y, "n", x, y - 0.5], [x, y, "w", x - 0.5, y], [x, y + 1, "n", x, y + 0.5], [x + 1, y, "w", x + 0.5, y]]) {
    const wall = tileAt(ex, ey, layer)[edge];
    if (!isFence(wall) || (wall.kind === "door" && wall.open)) continue;
    if (Math.hypot(mx - gx, my - gy) > reach) continue;
    const dot = ((mx - gx) * dx + (my - gy) * dy) / len;
    if (dot <= 0.05) continue;
    if (!best || dot > best.dot) best = { wall, tx: ex, ty: ey, edge, dot };
  }
  return best;
}

// What a fence or gate stands: its hit points when made.
function fenceLimit(wall) {
  return W.fenceHp * (wall.kind === "door" ? W.fenceGateFactor : 1);
}

// One strike on a fence or gate by one of the dead (zombie.js, the `pressHit` state at its active frame). Short of a break the health is
// the save's alone (`unsavedWall`, as a door's is: the wire sends no chunk for it; every client gets the jolt as an fx), and at nothing
// left it bursts (the destroyed wall rides the chunk).
export function strikeFence(wall, tx, ty, edge, amount, layer = layerOf(wall && wall.at)) {
  if (tileAt(tx, ty, layer)[edge] !== wall) return false;
  if (!Number.isFinite(wall.hp)) wall.hp = fenceLimit(wall); // a fence made before fences had hit points
  wall.hp -= amount;
  emit("wallStruck", { tx, ty, edge });
  if (wall.hp <= 0) {
    const [mx, my] = edgeMid(tx, ty, edge);
    destroyWall(tx, ty, edge, false, layer);
    emit("fenceBurst", { x: mx, y: my, tx, ty, edge, ...(layer ? { layer } : {}) });
    return true;
  }
  unsavedWall(wall); // its health, short of a break, is the save's alone, as a door's is: the wire sends the break and the jolt
  return false;
}

export function createWall(kind, sprite) {
  return {
    kind,
    sprite,
    open: false,
    shutter: kind === "window" ? "closed" : null,
    boards: { near: [], far: [] }, // hit points per board, outermost last
    hp: wallRule(sprite).fence === true ? fenceLimit({ kind }) : kind === "wall" ? Infinity : gateHp(kind, sprite) ?? (kind === "door" ? DOOR_HP : SHUTTER_HP), // a door and a window always break, whatever they are made of: every entrance is one the dead can break; a fence has hit points too
    broken: false,
  };
}

export function boarded(wall) {
  return !!wall && (wall.boards.near.length + wall.boards.far.length > 0);
}

// Which side of the edge at (tx, ty) an actor at (gx, gy) stands on: +1 the
// near side (south of a north edge, east of a west edge), -1 the far side.
export function sideOf(tx, ty, edge, gx, gy) {
  return edge === "n" ? (gy >= ty - 0.5 ? 1 : -1) : gx >= tx - 0.5 ? 1 : -1;
}

function boardsOn(wall, side) {
  return side > 0 ? wall.boards.near : wall.boards.far;
}

// Nail a board on a side, if there is room. Planks are free until the inventory. Never on a fence, a gate included (Michael,
// 2026-10-24: "I would not allow boards on fences period"): the one door through which every board passes, the host's and a guest's.
export function addBoard(wall, side) {
  if (isFence(wall) || wall.gate) return false; // nor on a castle gate
  const b = boardsOn(wall, side);
  if (b.length >= BOARDS_PER_SIDE) return false;
  b.push(BOARD_HP);
  touchWall(wall);
  return true;
}

// Pull a board on a side. The board is gone from the wall; the caller gives the plank back (#215: pulled with a hammer, it comes back).
export function pullBoard(wall, side) {
  const b = boardsOn(wall, side);
  if (!b.length) return false;
  b.pop();
  touchWall(wall);
  return true;
}

// Hit the stack from a side. Returns "board", "leaf", or null for what broke,
// after taking `amount` off whatever stands first in attack order.
export function damageOpening(wall, side, amount) {
  if (gateHolds(wall)) return null; // the dead break no closed gate (a flag on its definition, docs/02, 2026-10-29)
  const mine = boardsOn(wall, side);
  const theirs = boardsOn(wall, -side);
  let broke = null;
  if (mine.length) {
    mine[mine.length - 1] -= amount;
    if (mine[mine.length - 1] <= 0) {
      mine.pop();
      broke = "board";
    }
  } else if (!wall.broken) {
    if (wall.gate && !Number.isFinite(wall.hp)) wall.hp = gateOf(wall).hp || DOOR_HP * 4; // a gate made while the dead could not break it (its health Infinity, saved as null) takes its definition's health once they can
    wall.hp -= amount;
    if (wall.hp <= 0) {
      wall.hp = 0;
      wall.broken = true;
      // A broken door is a doorway; broken shutters are an open hole.
      if (wall.kind === "door") wall.open = true;
      if (wall.kind === "window") wall.shutter = "open";
      broke = "leaf";
    }
  } else if (theirs.length) {
    theirs[theirs.length - 1] -= amount;
    if (theirs[theirs.length - 1] <= 0) {
      theirs.pop();
      broke = "board";
    }
  }
  if (broke === "leaf" && wall.gate) breakGate(wall); // a gate gives way whole: every edge of it a way through
  if (broke) touchWall(wall);
  else if (amount) unsavedWall(wall); // its health, which the wire does not send short of a break, is saved
  return broke;
}

// Whether an opening is still shut against what the dead want of it: a door that is not a way through, or a window whose
// shutters are closed and whole or that carries boards (they batter one open to see in, never to pass, #134).
export function needsBreaking(wall) {
  if (!wall) return false;
  if (wall.kind === "door") return !wayOpen(wall) && !gateHolds(wall); // a castle gate the dead cannot break is nothing for them to break (docs/02, 2026-10-29)
  return boarded(wall) || (wall.shutter === "closed" && !wall.broken);
}

// Can a walking body pass this opening? Only a door, open or broken and unboarded: nobody climbs through a window
// (Michael, 2026-10-16), so a window is for sight and light alone, whatever state its shutters are in.
export function wayOpen(wall) {
  if (!wall) return true;
  if (boarded(wall)) return false;
  if (wall.kind === "door") return wall.open || wall.broken;
  return false;
}

// Is a room sealed (docs/09): every door shut and whole or boarded, every
// window shuttered and whole or boarded.
export function roomSealed(room) {
  if (!room) return false; // a room id from a step before a refind
  for (const op of room.openings) {
    const w = tileAt(op.tx, op.ty, room.layer || 0)[op.edge];
    if (!w) continue;
    if (boarded(w)) continue;
    if (w.broken) return false;
    if (w.kind === "door" && w.open) return false;
    if (w.kind === "window" && w.shutter === "open") return false;
  }
  return true;
}

// The opening of a room nearest to (gx, gy) that an attacker can stand beside: the tile on the attacker's side, which is
// whichever side of the edge is not in the room. Doors, and nobody climbs through a window (Michael, 2026-10-16), so the
// dead who want what is in a room go for its nearest door (open or shut, boarded or not: they break what is in the way).
// From outside, `windows` adds the windows still shut or boarded: Michael's ruling, "the dead may batter a window's
// shutters or boards open to see in, never to pass", so one is battered open for sight and a door is still the way in.
// Returns { wall, tx, ty, edge, stand, side, into, d }, or null when the room has nothing a body can stand at. `want`,
// a room id, is the room the attacker is trying to reach from inside this one: a door that leads into it is the one
// chosen, before the nearest.
export function breachTarget(room, gx, gy, want = 0, windows = false) {
  return breachTargets(room, gx, gy, want, windows)[0] || null;
}

// Every such opening of the room, the one `breachTarget` would pick first and then the rest, nearest first (the dead
// pick the first of them that they can walk to, zombie.js `wayIn`).
export function breachTargets(room, gx, gy, want = 0, windows = false) {
  // Breaking in from outside, or out from inside: the attacker stands on
  // whichever side of the opening they are on and goes through to the other.
  const L = room.layer || 0; // a room is on one layer (docs/49 section 3), and so are its openings and the tiles beside them
  const inside = tileAt(Math.round(gx), Math.round(gy), L).room === room.id;
  const out = [];
  for (const op of room.openings) {
    const w = tileAt(op.tx, op.ty, L)[op.edge];
    if (!w || !needsBreaking(w)) continue; // an opening that is already a way through is nothing to break (the dead walk through it)
    if (w.kind !== "door" && !(windows && !inside)) continue;
    const nearTile = [op.tx, op.ty];
    const farTile = op.edge === "n" ? [op.tx, op.ty - 1] : [op.tx - 1, op.ty];
    const nearIn = tileAt(nearTile[0], nearTile[1], L).room === room.id;
    const roomTile = nearIn ? nearTile : farTile;
    const outTile = nearIn ? farTile : nearTile;
    const stand = inside ? roomTile : outTile;
    const into = inside ? outTile : roomTile;
    const side = stand === nearTile ? 1 : -1;
    if (!isWalkableTile(stand[0], stand[1], L)) continue;
    const toward = want > 0 && tileAt(into[0], into[1], L).room === want;
    const d = Math.hypot(gx - stand[0], gy - stand[1]) - (toward ? 1000 : 0);
    out.push({ wall: w, tx: op.tx, ty: op.ty, edge: op.edge, stand, side, d, into });
  }
  return out.sort((a, b) => a.d - b.d);
}

// Bumped whenever the world changes, so sight is recomputed. With a tile given,
// the light's per-chunk version is bumped only for that chunk and its eight
// neighbours (a wall's shadow reaches no further than a source's radius, under
// a chunk) and the chunk is marked dirty, so it is never evicted (docs/23a, B2,
// B4); with none, every loaded chunk's version is bumped.
export let worldVersion = 0;
const touched = new Set(); // chunk keys changed since the wire last asked (docs/31/04: a chunk delta per change)
// Each as [cx, cy], or [cx, cy, layer] off the ground (docs/49 section 12: the touched list names its layer).
export function takeTouched() {
  const out = [];
  for (const k of touched) {
    const c = chunks.get(k);
    if (c) out.push(c.layer ? [c.cx, c.cy, c.layer] : [c.cx, c.cy]);
  }
  touched.clear();
  return out;
}
export function touch(x = null, y = null, layer = 0) {
  worldVersion++;
  if (x === null) {
    for (const c of chunks.values()) {
      c.lightVersion++;
      c.saved = null;
    }
    return;
  }
  const [cx, cy] = chunkCoord(Math.round(x), Math.round(y));
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      const c = getChunk(cx + dx, cy + dy, false, layer);
      if (c) c.lightVersion++;
    }
  }
  markDirty(x, y, layer);
}

// A change on a wall names the wall's tile when the wall knows it: `at` is [x, y], or [x, y, layer] off the ground (docs/49 section 12:
// a tile address carries its layer, left out when it is 0).
function touchWall(wall) {
  if (wall.at) touch(wall.at[0], wall.at[1], wall.at[2] || 0);
  else touch();
}
// A tile address [x, y] with its layer when it is not the ground's (docs/49 section 12), and the layer an address names.
export function addr(x, y, layer = 0) {
  return layer ? [x, y, layer] : [x, y];
}
export function layerOf(a) {
  return (a && (Array.isArray(a) ? a[2] : a.layer)) || 0;
}

// A chunk changed by play (a floor, a prop, an item, a wall): kept in memory for good.
let touchHook = null; // the chart's: a chunk changed (docs/33), by touch or markDirty
export function setTouchHook(fn) {
  touchHook = fn;
}
export function markDirty(x, y, layer = 0) {
  const [cx, cy] = chunkCoord(Math.round(x), Math.round(y));
  if (touchHook && !layer) touchHook(cx, cy); // the chart is the ground's alone (docs/49 section 12)
  const c = getChunk(cx, cy, false, layer);
  if (c) {
    c.dirty = true;
    touched.add(chunkKey(cx, cy, c.layer));
  }
  unsaved(x, y, true, layer);
}

// ---- the save's copy of each chunk (2026-10-15, `02`: a save that costs what changed) ----
// game.serialize keeps each chunk's saved form on the chunk (`saved`) and makes it again only once the chunk has
// changed. Every change that marks a chunk for the wire (markDirty, touch) drops it, for the chunk and its eight
// neighbours, since a prop is saved with the chunk of its anchor tile and a change may name another tile of its
// footprint. The few changes the wire never sends drop it here too, the anchor's chunk alone (`near` false): a
// fire's fuel burning, a station's job counting down, a sway's stamp, a door or a board losing health short of
// breaking, a container's bag made on first use. A change that forgets both is caught: the server's rolling copy
// and its last save, and the browser's every tenth autosave, make the whole save afresh and say which chunk the
// copy had wrong (game.verifySaveCache).
export function unsaved(x, y, near = true, layer = 0) {
  const [cx, cy] = chunkCoord(Math.round(x), Math.round(y));
  if (!near) {
    const c = getChunk(cx, cy, false, layer);
    if (c) c.saved = null;
    return;
  }
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      const c = getChunk(cx + dx, cy + dy, false, layer);
      if (c) c.saved = null;
    }
  }
}

// A wall's change that the wire does not send (its health): the save's copy of its tile's chunks is dropped.
function unsavedWall(wall, near = true) {
  if (wall.at) unsaved(wall.at[0], wall.at[1], near, wall.at[2] || 0);
  else for (const c of chunks.values()) c.saved = null;
}

// Every loaded chunk's saved form, in serializeMap's order: the copy kept on the chunk, or `make(chunk)`'s, kept.
export const saveCacheCount = { made: 0, kept: 0 };
export function savedChunks(make) {
  const out = [];
  for (const c of chunks.values()) {
    if (!c.saved) {
      c.saved = make(c);
      saveCacheCount.made++;
    } else saveCacheCount.kept++;
    out.push(c.saved);
  }
  return out;
}

// Every loaded chunk, for the cache's check (game.verifySaveCache).
export function eachChunk(fn) {
  for (const c of chunks.values()) fn(c);
}

export function chunkCount() {
  return chunks.size;
}

export function allProps() {
  return [...propsById.values()];
}

// ---- the map as data, and back (docs/31/05, item 24: the save, and the join's snapshot) ----
// Every loaded chunk whole: the floors run-length, the walls with their state, the
// props by their anchor tile with their live fields, the items on the floor. A chunk
// not loaded at the save regrows from the file and the seed. The characters that
// sleep on dropped chunks are the caller's to serialise (game.js); the map keeps
// the keys.

const PROP_DERIVED = new Set(["kind", "tiles"]); // made again by createProp from the sprite and the footprint

// A prop as saved and as sent: its identity (id, sprite, tile) and every field that differs from what its sprite makes it (#221: a crop was about
// 270 bytes, most of them `fire: null`, `container: null`, `bag: null`, `wood: 0`...; a dense farm chunk was 52 KB and each harvest sent it whole).
// A field the prop has lost since it was made (a deleted key) is named in `gone`, so the load drops it too. `reviveProp` makes the base again and
// lays this over it; a save from before still loads (every field was there).
const IDENTITY = new Set(["id", "sprite", "tile"]);
export function serializeProp(p) {
  const base = propBase({ id: p.id, sprite: p.sprite, tile: p.tile });
  const keepFacing = !!getDef(p.sprite).furrows; // a crop's rows are always named: the load must not derive them again from the soil
  const out = {};
  for (const [k, v] of Object.entries(p)) {
    if (PROP_DERIVED.has(k) || typeof v === "function" || v === undefined) continue;
    if (!IDENTITY.has(k) && !(k === "facing" && keepFacing) && !(k === "furrowsPending" && v) && k in base && JSON.stringify(v) === JSON.stringify(base[k])) continue;
    out[k] = v;
  }
  // `furrowsPending` is settled away once the rows are named; a load with the facing named never sets it, so it needs no word.
  const gone = Object.keys(base).filter((k) => !(k in p) && !PROP_DERIVED.has(k) && !(k === "furrowsPending" && out.facing !== undefined));
  if (gone.length) out.gone = gone;
  return out;
}

function wallData(w) {
  const { at, ...rest } = w; // `at` is the tile it hangs on, given back on install
  return rest;
}

export function serializeChunk(c) {
  const floors = []; // [kind, run] over the chunk's tiles, row by row
  const walls = [];
  const props = [];
  const items = [];
  const parts = []; // [lx, ly, id]: a tile holding part of a prop anchored in another chunk (#341)
  const built = []; // [lx, ly, under, free?]: a floor a player laid (docs/49 section 5)
  const stairsHere = []; // [lx, ly, dir, material, free?]: a stair a player built, by its low tile
  let last = null;
  for (let i = 0; i < CHUNK * CHUNK; i++) {
    const t = c.tiles[i];
    if (last && last[0] === t.floor) last[1]++;
    else floors.push((last = [t.floor, 1]));
    const lx = i % CHUNK;
    const ly = (i - lx) / CHUNK;
    if (t.n) walls.push([lx, ly, "n", wallData(t.n)]);
    if (t.w) walls.push([lx, ly, "w", wallData(t.w)]);
    for (const pr of [t.prop, t.rug]) { // a laid rug, saved and sent like a prop (#327)
      if (!pr) continue;
      if (inChunkTile(c, pr.tile[0], pr.tile[1])) {
        if (pr.tile[0] === c.cx * CHUNK + lx && pr.tile[1] === c.cy * CHUNK + ly) props.push(serializeProp(pr));
      } else parts.push([lx, ly, pr.id]);
    }
    if (t.items && t.items.length) items.push([lx, ly, t.items]);
    if (t.built) built.push(t.built.free ? [lx, ly, t.built.under, 1] : [lx, ly, t.built.under]);
  }
  // The stairs a player built whose foot is here (docs/49 section 5): the stair's record rides the chunk of its low tile.
  for (const s of stairList) {
    if (!s.built || s.layer !== c.layer || !inChunkTile(c, s.tiles[0][0], s.tiles[0][1])) continue;
    stairsHere.push(s.free ? [s.at[0] - c.cx * CHUNK, s.at[1] - c.cy * CHUNK, s.dir, s.material, 1] : [s.at[0] - c.cx * CHUNK, s.at[1] - c.cy * CHUNK, s.dir, s.material]);
  }
  // A prop is recorded whole with its anchor's chunk; a tile of it on this chunk is named here by the prop's id, so this chunk installed
  // alone (a guest's frame) stands it again from the registry, and the sync check's map part sees a tile that lost it (#341). Only when
  // there are any: a chunk with none has the record it always had.
  const out = { cx: c.cx, cy: c.cy, layer: c.layer, wild: !!c.wild, dirty: !!c.dirty, floors, walls, props, items };
  if (parts.length) out.parts = parts;
  if (built.length) out.built = built;
  if (stairsHere.length) out.stairs = stairsHere;
  return out;
}

export function serializeMap() {
  return {
    chunks: [...chunks.values()].map(serializeChunk),
    pending: serializePending(),
  };
}

// The spawns owed, alone: the save's cache asks for this part without the chunks (game.js).
export function serializePending() {
  return pendingSpawns.map(([x, y]) => [x, y]);
}

// The sleepers' lists by chunk key, for the caller to serialise and to put back.
export function sleeperEntries() {
  return [...sleepers.entries()];
}

export function setSleepers(entries) {
  sleepers.clear();
  woken.length = 0;
  for (const [k, list] of entries) sleepers.set(Number(k), list);
}
// A floor whose id was renamed: a saved chunk or a frame from before the rename names the old id, and it comes back as the new one (the pink, 2026-10-28:
// "No random spawn" became "Random spawn", docs/02). One line, here: every chunk a save or a guest brings in goes through installChunk.
const RENAMED_FLOORS = { floor_nospawn: "floor_randomspawn" };


// A saved chunk in place of the one the file and the seed would grow. The
// authored props the load made for these tiles are superseded by the saved ones.
export function installChunk(d) {
  const { cx, cy } = d;
  const layer = d.layer || 0;
  const k = chunkKey(cx, cy, layer);
  // The chunk this one replaces: the props that stood on it (anchored here) leave the registry and the fire
  // set, and the delta's own are put back by installProp. Without this a prop removed on the host stayed in
  // a guest's registry and kept burning in its fire set, a light at a tile where nothing stood (found
  // reviewing placement, 2026-10-13). Only the authored ones were let go before.
  const old = chunks.get(k);
  if (old) {
    for (const t of old.tiles) {
      for (const pr of [t && t.prop, t && t.rug]) {
        if (!pr || !inChunkTile(old, pr.tile[0], pr.tile[1])) continue;
        fireProps.delete(pr);
        if (propsById.get(pr.id) === pr) propsById.delete(pr.id);
        clearForeignTiles(old, pr); // its tiles on a neighbour let it go; the record's own copy stands on them again (installProp, #341)
      }
    }
  }
  for (let i = 0; i < CHUNK * CHUNK; i++) {
    const x = cx * CHUNK + (i % CHUNK);
    const y = cy * CHUNK + Math.floor(i / CHUNK);
    const st = sourceAt(x, y, layer);
    // Only an authored prop anchored here: one anchored on a neighbour is that chunk's (installed from it, or grown with it), and this
    // chunk's `parts` stand it on its tiles here again (#341's review: a save holding the neighbour but not the anchor lost the tile).
    if (st && st.prop && inChunkTile({ cx, cy }, st.prop.tile[0], st.prop.tile[1])) {
      fireProps.delete(st.prop);
      if (propsById.get(st.prop.id) === st.prop) propsById.delete(st.prop.id);
    }
  }
  const tiles = new Array(CHUNK * CHUNK);
  let i = 0;
  for (const [floor, n] of d.floors) for (let j = 0; j < n; j++) tiles[i++] = createTile(RENAMED_FLOORS[floor] || floor); // a floor a save or a frame names by an old id comes back as its new one
  for (const [lx, ly, edge, w] of d.walls) tiles[ly * CHUNK + lx][edge] = { ...w, at: addr(cx * CHUNK + lx, cy * CHUNK + ly, layer) };
  for (const [lx, ly, list] of d.items) tiles[ly * CHUNK + lx].items = list;
  for (const [lx, ly, was, free] of d.built || []) {
    const under = RENAMED_FLOORS[was] || was; // the floor a laid one covers comes back by its new id too
    tiles[ly * CHUNK + lx].built = free ? { under, free: true } : { under }; // a laid floor (docs/49 section 5)
  }
  // The tiles of props anchored on a neighbour (#341): stood again from the registry when the prop is there and still covers the tile. A prop not
  // in it yet (its anchor's chunk comes later in a restore or a frame) stands on this tile when that chunk's installProp runs.
  for (const [lx, ly, id] of d.parts || []) {
    const pr = propsById.get(id);
    const x = cx * CHUNK + lx;
    const y = cy * CHUNK + ly;
    if (pr && (pr.layer || 0) === layer && pr.tiles.some(([px, py]) => px === x && py === y)) tiles[ly * CHUNK + lx][slotOf(pr)] = pr;
  }
  const c = { cx, cy, layer, tiles, wild: !!d.wild, dirty: !!d.dirty, lightVersion: 0, saved: null };
  chunks.set(k, c);
  lastChunk = null;
  roomsDirty = true;
  settleRings(c); // a ring built or taken apart on the host, or kept by the save: its record follows its edges (docs/50 section 6)
  // A built stair's record from its chunk (docs/49 section 5): its tiles, its landing, and its stairwell came in their own chunks' floors.
  let added = false;
  for (const [lx, ly, dir, material, free] of d.stairs || []) {
    const rec = builtStairRecord(cx * CHUNK + lx, cy * CHUNK + ly, dir, material, layer, !!free);
    if (rec && !stairList.some((s) => s.id === rec.id)) {
      stairList.push(rec);
      added = true;
    }
  }
  if (added) indexStairs();
  return c;
}

// A saved prop back on its tiles (after every chunk is installed, since a
// footprint may cross a chunk's edge): made by createProp from its sprite, then
// its live fields put over the fresh ones.
// A prop from its record, not on any tile: what a character carries (docs/13) rides in its own
// record (entities/character.js `carried`), since a lifted prop is on no chunk to be found by id.
export function reviveProp(data, onMap = true) {
  const prop = createProp({ id: data.id, sprite: data.sprite, tile: data.tile, layer: data.layer, footprint: data.footprint, facing: data.facing, offset: data.offset, solid: data.solid, radius: data.radius });
  const { gone, ...rest } = data;
  Object.assign(prop, rest, { tiles: prop.tiles, kind: "prop" });
  if (prop.fire && !Number.isFinite(prop.fire.fuel)) prop.fire.fuel = 0; // a save from before 2026-10-15 may hold the word (createProp)
  if (!("furrowsPending" in rest) && rest.facing !== undefined) delete prop.furrowsPending; // named rows: the host settled it away (serializeProp keeps a true one)
  for (const k of gone || []) delete prop[k]; // a field the prop had lost stays lost; every other field not saved is its default (serializeProp, #221)
  // A carried prop stands on no tile, so it is no light at its old one and not in the registry (as removeProp leaves it).
  if (prop.fire && onMap) fireProps.add(prop);
  else fireProps.delete(prop);
  if (!onMap) propsById.delete(prop.id);
  return prop;
}

export function installProp(data) {
  const prop = reviveProp(data);
  const slot = slotOf(prop);
  for (const [x, y] of prop.tiles) {
    const t = peekTile(x, y, prop.layer || 0);
    if (t) t[slot] = prop;
  }
  return prop;
}

// The brackets from the walls that carry one, over every loaded chunk.
export function rebuildBrackets() {
  bracketSet.clear();
  for (const c of chunks.values()) {
    for (let i = 0; i < CHUNK * CHUNK; i++) {
      const t = c.tiles[i];
      const tx = c.cx * CHUNK + (i % CHUNK);
      const ty = c.cy * CHUNK + Math.floor(i / CHUNK);
      if (t.n && t.n.bracket) bracketSet.add({ tx, ty, edge: "n", wall: t.n, layer: c.layer });
      if (t.w && t.w.bracket) bracketSet.add({ tx, ty, edge: "w", wall: t.w, layer: c.layer });
    }
  }
}

// The map put back from a save, after loadMap(json) has set the authored source.
export function restoreMap(data) {
  for (const d of data.chunks) installChunk(d);
  for (const d of data.chunks) for (const p of d.props) installProp(p);
  rebuildBrackets();
  pendingSpawns.length = 0;
  for (const [x, y] of data.pending || []) pendingSpawns.push([x, y]);
  rebuildRooms();
  touch();
}

// ---- eviction, and the dead that sleep with their chunk (docs/23a, B1, B2: a first slice of 03's records) ----

const sleepers = new Map(); // chunk key -> the characters that stood in it when it was dropped (an empty list: grown before, its dead gone elsewhere)
const woken = []; // keys of chunks grown again with sleepers on record
const evictListeners = [];
const evicted = new Map(); // chunk key -> [cx, cy]: dropped since the wire last asked (net.js names them to a guest, which drops them too)

// Called with (key, cx, cy) for every chunk dropped; the light cache forgets it.
export function onEvict(fn) {
  evictListeners.push(fn);
}

// The chunks evicted since the last call, as [cx, cy], or [cx, cy, layer] off the ground (only the wild is dropped, and the wild is
// the ground's), for the frame: a guest's replica drops what the host dropped (the sync check found a guest holding chunks the host no
// longer had, 2026-10-18). One grown again since is left out: it is in the touched list, and a guest's installChunk replaces its old
// copy whole.
export function takeEvicted() {
  const out = [];
  for (const [k, at] of evicted) if (!chunks.has(k)) out.push(at);
  evicted.clear();
  return out;
}

// One chunk out of memory: the props and rugs anchored in it leave the registry and the fire set, and the eviction's
// listeners are told (the light cache forgets it). The host's eviction (evictFar) and a guest's replica told of one by
// the frame (net.js) both come through here. True when it was loaded.
export function dropChunk(cx, cy, layer = 0) {
  const k = chunkKey(cx, cy, layer);
  const c = chunks.get(k);
  if (!c) return false;
  // Its props leave the registry and the fire set with it (the sync check found evicted mushrooms kept
  // as ghosts in the host's registry, 2026-10-13); the chunk grows back with new props and new ids.
  for (const t of c.tiles) {
    for (const pr of [t && t.prop, t && t.rug]) {
      if (!pr || !inChunkTile(c, pr.tile[0], pr.tile[1])) continue;
      fireProps.delete(pr);
      if (propsById.get(pr.id) === pr) propsById.delete(pr.id);
      clearForeignTiles(c, pr); // and from its tiles on a neighbour (#341)
    }
  }
  chunks.delete(k);
  lastChunk = null;
  for (const fn of evictListeners) fn(k, c.cx, c.cy, c.layer);
  return true;
}

// Drop every wild chunk that play has not changed and that lies more than
// `radius` chunks (Chebyshev) from (gx, gy), unless `keep(cx, cy)` says not to.
// Returns [[key, cx, cy], ...]; the caller puts the characters standing in them
// to sleep (sleep). The wild is deterministic by hash, so a dropped chunk grows
// back the same chunk, and its dead come back from their record.
export function evictFar(gx, gy, radius, keep = () => false) {
  const [pcx, pcy] = chunkCoord(Math.round(gx), Math.round(gy));
  const out = [];
  // Every layer by the one rule (docs/49 section 16, step 1): an unchanged wild chunk far from everyone goes. Only the ground grows
  // wild, so a chunk of another layer (authored, or built on) is never dropped; the rule is the same for it all the same.
  for (const [k, c] of chunks) {
    if (!c.wild || c.dirty) continue;
    if (Math.max(Math.abs(c.cx - pcx), Math.abs(c.cy - pcy)) <= radius) continue;
    if (keep(c.cx, c.cy, c.layer)) continue;
    dropChunk(c.cx, c.cy, c.layer); // the walk's own entry deleted from the Map: the walk goes on safely
    evicted.set(k, c.layer ? [c.cx, c.cy, c.layer] : [c.cx, c.cy]); // for the next frame (net.js): a guest drops it too
    out.push([k, c.cx, c.cy, c.layer]);
  }
  return out;
}

export function sleep(key, list) {
  sleepers.set(key, list);
}

// How many characters sleep on dropped chunks' records (for the checks).
export function sleepingCount() {
  let n = 0;
  for (const list of sleepers.values()) n += list.length;
  return n;
}

// The characters whose chunks grew back since the last call, to rejoin the world.
export function takeWoken() {
  const out = [];
  for (const k of woken.splice(0)) {
    out.push(...(sleepers.get(k) || []));
    sleepers.delete(k);
  }
  return out;
}

// Numeric keys: string keys allocated on every tile lookup were a measurable
// cost when visibility walked thousands of edges per step (2026-10-09).
const KEY_OFF = 32768;
// Every lookup takes a layer (docs/02, 2026-10-08: layer-ready data from day
// one; docs/08: added 2026-10-09; docs/49: the layers used). A chunk on another
// layer holds its authored and built tiles, void or earth elsewhere, and is never wild.
export function chunkKey(cx, cy, layer = 0) {
  return layer * 4294967296 + (cx + KEY_OFF) * 65536 + (cy + KEY_OFF);
}

export function chunkCoord(x, y) {
  return [Math.floor(x / CHUNK), Math.floor(y / CHUNK)];
}

let lastChunk = null; // most lookups hit the same chunk as the last one

export function getChunk(cx, cy, create = true, layer = 0) {
  if (lastChunk && lastChunk.cx === cx && lastChunk.cy === cy && lastChunk.layer === layer) return lastChunk;
  const k = chunkKey(cx, cy, layer);
  let c = chunks.get(k);
  if (c) lastChunk = c;
  if (c || !create) return c || null;
  const tiles = new Array(CHUNK * CHUNK);
  let hasWalls = false;
  let anyWild = false;
  for (let ly = 0; ly < CHUNK; ly++) {
    for (let lx = 0; lx < CHUNK; lx++) {
      const x = cx * CHUNK + lx;
      const y = cy * CHUNK + ly;
      let t = sourceAt(x, y, layer);
      if (!t) {
        if (layer !== 0) t = createTile(emptyFloorOf(layer)); // void above the ground, earth below it (docs/49 section 3)
        else if (inBounds(x, y)) t = createTile();
        else {
          t = wildTile(x, y);
          anyWild = true;
        }
      }
      if (t.n || t.w) hasWalls = true;
      if (t.n) t.n.at = addr(x, y, layer); // so a change on the wall can name its tile (touchWall)
      if (t.w) t.w.at = addr(x, y, layer);
      tiles[ly * CHUNK + lx] = t;
    }
  }
  // `wild` and `dirty` decide eviction (docs/23a, B2); `lightVersion` is the light cache's key (B4).
  c = { cx, cy, layer, tiles, wild: anyWild, dirty: false, lightVersion: 0, saved: null };
  settleForeignParts(c); // an authored prop anchored on a neighbour already loaded: that neighbour's copy, or none (#341)
  chunks.set(k, c);
  if (hasWalls) settleRings(c); // an authored ring is registered by the load; this finds nothing new, as nothing was built here yet
  touched.add(k); // grown: a guest learns of it like any change (net.js; the guest cannot grow it itself, its settings could shape it differently)
  lastChunk = c;
  // Open field cannot change any room, so only a chunk with walls (or one whose
  // edge walls a neighbouring room may touch) forces the rooms to be refound.
  if (hasWalls) roomsDirty = true;
  // A wild chunk brings a few of the dead with it, on free tiles.
  if (sleepers.has(k)) woken.push(k); // grown before: its dead sleep on record, not rolled again (B2)
  else if (anyWild && wild && wild.zombiesPerChunk) {
    const [lo, hi] = wild.zombiesPerChunk;
    const n0 = lo + Math.floor(hash2(cx, cy, (wild.seed ?? 1) + 3) * (hi - lo + 1));
    // The Starting population rule: the count scaled, its fraction settled by the chunk's own hash, so a factor of one
    // is exactly the map's number and any other is the same in any order and on every machine.
    const n = Math.floor(n0 * popFactor + hash2(cx, cy, (wild.seed ?? 1) + 6));
    for (let i = 0; i < n; i++) {
      const lx = Math.floor(hash2(cx * 31 + i, cy, (wild.seed ?? 1) + 4) * CHUNK);
      const ly = Math.floor(hash2(cx, cy * 31 + i, (wild.seed ?? 1) + 5) * CHUNK);
      const x = cx * CHUNK + lx;
      const y = cy * CHUNK + ly;
      if (!tiles[ly * CHUNK + lx].prop) pendingSpawns.push([x, y]);
    }
  }
  return c;
}

export function loadedChunks() {
  return chunks.values();
}

// The layer a read with none given is of: the ground's, always, but while the renderer draws a storey (docs/49 section 6,
// render/storeys.js `drawLayerOf`), which sets it for the drawables of that storey alone and puts it back in a `finally`: the walls',
// props', and items' drawing read their layer's tiles through the same calls as the ground's. Never set during a step.
let drawLayer = 0;
export function drawLayerNow() {
  return drawLayer;
}
export function withDrawLayer(layer, fn) {
  const was = drawLayer;
  drawLayer = layer;
  try {
    return fn();
  } finally {
    drawLayer = was;
  }
}

// The tile at integer (x, y) for reading. A read never grows a chunk: beyond
// the grown ring it sees the blank tile (plain floor, outdoors), the same on
// every machine whatever the window shows, so the world is the simulation's
// alone (docs/31/05, item 8; docs/02, 2026-10-13). Growth is ensureAround's
// (the ring round each player) and the mutators' (growTile).
export function tileAt(x, y, layer = drawLayer) {
  const cx = Math.floor(x / CHUNK);
  const cy = Math.floor(y / CHUNK);
  const c = getChunk(cx, cy, false, layer);
  if (!c) return blankOf(layer);
  return c.tiles[(y - cy * CHUNK) * CHUNK + (x - cx * CHUNK)];
}

// The tile at integer (x, y) for writing: grows the chunk if it is not loaded.
// The mutators' lookup; nothing that only reads should call it.
export function growTile(x, y, layer = 0) {
  const cx = Math.floor(x / CHUNK);
  const cy = Math.floor(y / CHUNK);
  const c = getChunk(cx, cy, true, layer);
  return c.tiles[(y - cy * CHUNK) * CHUNK + (x - cx * CHUNK)];
}

// The map's base floor (the valley's grass): natural ground, where a sapling is planted (src/trees.js).
export function baseFloor() {
  return defaultFloor;
}

// The blank tile a read beyond the grown ring returns on a layer (for a check to recognise): the ground's floor, the void, the earth.
export function blankTile(layer = 0) {
  return blankOf(layer);
}

// The tile at (x, y) only if its chunk is loaded.
export function peekTile(x, y, layer = drawLayer) {
  const c = getChunk(Math.floor(x / CHUNK), Math.floor(y / CHUNK), false, layer);
  if (!c) return null;
  return c.tiles[(y - c.cy * CHUNK) * CHUNK + (x - c.cx * CHUNK)];
}

// ---- walls on edges ----

// The tile and slot that hold the edge between two 4-adjacent tiles.
export function edgeBetween(x0, y0, x1, y1) {
  if (x1 === x0 + 1) return [x1, y0, "w"];
  if (x1 === x0 - 1) return [x0, y0, "w"];
  if (y1 === y0 + 1) return [x0, y1, "n"];
  return [x0, y0, "n"];
}

// The wall on the edge between two 4-adjacent tiles, or null.
export function wallBetween(x0, y0, x1, y1, layer = 0) {
  if (x1 === x0 + 1) return tileAt(x1, y0, layer).w;
  if (x1 === x0 - 1) return tileAt(x0, y0, layer).w;
  if (y1 === y0 + 1) return tileAt(x0, y1, layer).n;
  if (y1 === y0 - 1) return tileAt(x0, y0, layer).n;
  return null;
}

export function blocksMove(wall) {
  if (!wall) return false;
  return !wayOpen(wall);
}

// How much light an edge lets through, 0..1 (docs/08). A plain wall and a
// closed door nothing, an open door or shutter everything, a closed shutter a
// small leak between the planks; later a glass pane most and a curtain little.
// Sight is transmission above a half: light and sight share one set of
// blockers, now with a number.
export const openingTunables = { shutterLeak: 0.05 };

export function transmission(wall) {
  if (!wall) return 1;
  if (boarded(wall)) return 0;
  if (wall.kind === "wall") return wallRule(wall.sprite).seeThrough ? 1 : 0; // a fence or bars: sight and light pass
  if (wall.broken) return 1;
  if (wall.kind === "window") return wall.shutter === "closed" ? openingTunables.shutterLeak : 1;
  return wall.open || wallRule(wall.sprite).seeThrough || gateGrille(wall) ? 1 : 0; // a shut gate in a fence still passes sight, and a shut portcullis (bars: it stops bodies, not sight or light)
}

export function blocksSight(wall) {
  return transmission(wall) < 0.5;
}

// Whether a blow or a bite is stopped by what stands on an edge: whatever stops sight, and a shut castle gate whose definition says its bars
// stop them (`bitesPass: false`, docs/02, 2026-10-29: "Agreed"), so a swing or a bite does not pass a closed portcullis as it passes a fence.
export function blocksReach(wall) {
  return blocksSight(wall) || (!!wall && !!wall.gate && !wayOpen(wall) && gateFlag(wall, "bitesPass") === false);
}

// Openings (doors and windows) within `r` tiles of (gx, gy), nearest first.
// Each carries the edge midpoint and the tile on the far side from the asker.
export function openingsNear(gx, gy, r = 1.15, layer = 0) {
  const out = [];
  const cx = Math.round(gx);
  const cy = Math.round(gy);
  for (let ty = cy - 2; ty <= cy + 2; ty++) {
    for (let tx = cx - 2; tx <= cx + 2; tx++) {
      const t = tileAt(tx, ty, layer);
      if (t.n && t.n.kind !== "wall") {
        const mx = tx;
        const my = ty - 0.5;
        const d = Math.hypot(gx - mx, gy - my);
        if (d <= r) out.push({ wall: t.n, edge: "n", tx, ty, mx, my, d, to: gy < my ? [tx, ty] : [tx, ty - 1] });
      }
      if (t.w && t.w.kind !== "wall") {
        const mx = tx - 0.5;
        const my = ty;
        const d = Math.hypot(gx - mx, gy - my);
        if (d <= r) out.push({ wall: t.w, edge: "w", tx, ty, mx, my, d, to: gx < mx ? [tx, ty] : [tx - 1, ty] });
      }
    }
  }
  out.sort((a, b) => a.d - b.d);
  return out;
}

// Which side of the edge at (tx, ty) is outdoors: +1 for the near side (south
// of a north edge, east of a west edge), -1 for the far side. When both sides
// are rooms or both are outdoors, the near side is treated as outside.
export function outsideSign(tx, ty, edge, layer = drawLayer) {
  const near = tileAt(tx, ty, layer).room;
  const far = edge === "n" ? tileAt(tx, ty - 1, layer).room : tileAt(tx - 1, ty, layer).room;
  if (far !== 0 && near === 0) return 1;
  if (far === 0 && near !== 0) return -1;
  return 1;
}

// Segments of an edge (as fractions 0..1 along it) that a body cannot pass.
// An open doorway is passable across its whole width. A first version kept
// the jambs solid, which left a gap exactly one body wide: you fitted only when
// perfectly centred, and Michael found the doors impassable (2026-10-09).
function moveSegments(wall) {
  if (!wall) return null;
  if (wayOpen(wall)) return null;
  return FULL_EDGE;
}
const FULL_EDGE = [[0, 1]];

// ---- what a floor allows (docs/30, law 8) ----
// A floor's sprite definition may say `walk: false` (water: no entity walks
// it), `walk: 0.5` (shallow water: everyone slows), and `drink: true` (you
// drink and fill beside it, as at the well). Read once per floor id.
const floorRules = new Map();
export function floorRule(id) {
  let r = floorRules.get(id);
  if (r) return r;
  if (ENGINE_FLOORS.has(id)) {
    // The void, the earth, and a hole (docs/49 section 3): never walked, never drunk from. Nothing falls through one: an empty tile
    // simply is not a place a body can be.
    r = { walk: false, drink: false, void: id === VOID, earth: id === EARTH, hole: id === HOLE };
    floorRules.set(id, r);
    return r;
  }
  let def = null;
  try { def = getDef(id); } catch { def = null; }
  const walk = def && def.walk !== undefined ? def.walk : true;
  r = { walk: walk === false ? false : walk === true ? 1 : Number(walk) || 1, drink: !!(def && def.drink) };
  floorRules.set(id, r);
  return r;
}

// What a wall material allows (docs/30 step 0): `wall.seeThrough` (a fence, bars,
// a parapet: sight and light pass, bodies do not, and it bounds no room). `wall.run` names the run a sprite is one piece of, so a gate and the wall
// beside it are one run and grow no post between them (render/walls.js sameRun); `wall.gate` makes it a castle gate (docs/02, 2026-10-29), below.
const wallRules = new Map();
export function wallRule(sprite) {
  let r = wallRules.get(sprite);
  if (r) return r;
  let def = null;
  try { def = getDef(sprite); } catch { def = null; }
  const w = (def && def.wall) || {};
  r = { seeThrough: !!w.seeThrough, fence: !!w.fence, cliff: !!w.cliff, solid: !!w.solid || !!w.cliff, side: !!w.solid && !w.cliff, run: w.run || sprite, gate: w.gate || null, battlement: !!w.battlement }; // `battlement`: a castle's parapet on a walkway's outer edge (src/battlements.js, art round 13); `solid`: no opening, nothing hung on it (a cliff's, and a ramp's own side: wall_ramp_side) // a cliff (art round 10): bare rock, no opening stamped in it, nothing hung on it
  wallRules.set(sprite, r);
  return r;
}

export function isWalkableTile(x, y, layer = 0) {
  if (unreachableKeys.size && unreachableKeys.has(chunkKey(x, y, layer))) return false; // held off by a ring's curve (docs/50 section 2): no path, wander, or set-down ends there
  const t = tileAt(x, y, layer);
  return !(t.prop && t.prop.solid) && floorRule(t.floor).walk !== false;
}

// The speed factor of the ground under a point: 1 on land, less in shallow water.
export function floorSpeedAt(gx, gy, layer = 0) {
  const r = floorRule(tileAt(Math.round(gx), Math.round(gy), layer).floor);
  return r.walk === false ? 1 : r.walk;
}

export function drinkableAt(x, y, layer = 0) {
  return floorRule(tileAt(x, y, layer).floor).drink;
}

// The named bodies of water the map file authored (a water floor rect's `group`: "river", "pond"): which one a water tile is in,
// or null. Read from the file, never saved (a restored world loads its map again), and asked only when someone casts a line (fishing.js).
const waterBodies = [];
export function waterBodyAt(x, y) {
  for (const b of waterBodies) {
    const [rx, ry, rw, rh] = b.rect;
    if (x >= rx && x < rx + rw && y >= ry && y < ry + rh) return b.name;
  }
  return null;
}

// The same move for finding which fence lies across the dead's way to a goal they cannot reach (zombie.js `fenceWay`): in mode
// "gate" a closed gate (a door in a fence) is crossed, in mode "fence" any closed fence is, and only in a straight step, a
// diagonal never cutting through one.
export function canStepAcross(mode, layer = 0) {
  const through = (w) => isFence(w) && (mode === "fence" || w.kind === "door");
  return (x0, y0, x1, y1) => {
    if (x0 !== x1 && y0 !== y1) return canStep(x0, y0, x1, y1, layer);
    if (!isWalkableTile(x1, y1, layer)) return false;
    const w = wallBetween(x0, y0, x1, y1, layer);
    return !blocksMove(w) || through(w);
  };
}

// One tile-to-tile move for pathing. Diagonals need both corner tiles free and
// both L-shaped routes clear of walls, so nothing cuts a wall corner. On one layer
// (docs/49 section 16, step 1; the stair's edge between layers is step 3's).
export function canStep(x0, y0, x1, y1, layer = 0) {
  const dx = x1 - x0;
  const dy = y1 - y0;
  if (!isWalkableTile(x1, y1, layer)) return false;
  if (stairIndex.size && !stairStepOk(x0, y0, x1, y1, layer)) return false; // a stair is entered and left only at its ends (docs/49 section 4)
  if (dx !== 0 && dy !== 0) {
    if (!isWalkableTile(x0 + dx, y0, layer) || !isWalkableTile(x0, y0 + dy, layer)) return false;
    return !blocksMove(wallBetween(x0, y0, x0 + dx, y0, layer)) && !blocksMove(wallBetween(x0 + dx, y0, x1, y1, layer))
      && !blocksMove(wallBetween(x0, y0, x0, y0 + dy, layer)) && !blocksMove(wallBetween(x0, y0 + dy, x1, y1, layer));
  }
  return !blocksMove(wallBetween(x0, y0, x1, y1, layer));
}

// ---- stairs as walked (docs/49 section 4, step 3) ----
// A stair is three tiles on its layer climbing one storey in its direction; a body on it has the stair's layer and `rise`, the pixels it
// has climbed (32 a tile, 96 at its top edge). Crossing the top edge (the body's centre passing the far edge of the third tile) puts it on
// the layer above with rise 0, on the landing; stepping back over that edge from the landing puts it on the stair again, rise 96 falling.
// Its sides are closed on both layers: on its own layer by its side edges, on the layer above by its stairwell's (the void over its three
// tiles, which a body on the layer above enters only over the top edge, as it goes down). The landing is the stair's own tile on the layer
// above. Nothing here is saved: the stairs are the map file's (built stairs are docs/49 step 8's), the body's layer and rise are its own.
const STAIR_D = { n: [0, -1], e: [1, 0], s: [0, 1], w: [-1, 0] };
const stairIndex = new Map(); // tileKey(x, y, layer) -> { s, k, well }: a step k (0 to 2) of a stair on its layer, or its stairwell on the layer above
const stairsOnLayer = new Map(); // layer -> [{ s, well }]
const tileKey3 = (x, y, layer) => layer * 4294967296 + (x + KEY_OFF) * 65536 + (y + KEY_OFF);
function indexStairs() {
  stairIndex.clear();
  stairsOnLayer.clear();
  for (const s of stairList) {
    s.d = STAIR_D[s.dir];
    s.low = [s.tiles[0][0] - 0.5 * s.d[0], s.tiles[0][1] - 0.5 * s.d[1]]; // the middle of its bottom edge
    s.tiles.forEach(([x, y], k) => {
      stairIndex.set(tileKey3(x, y, s.layer), { s, k, well: false });
      stairIndex.set(tileKey3(x, y, s.layer + 1), { s, k, well: true });
    });
    for (const [l, well] of [[s.layer, false], [s.layer + 1, true]]) {
      if (!stairsOnLayer.has(l)) stairsOnLayer.set(l, []);
      stairsOnLayer.get(l).push({ s, well });
    }
  }
}
// How far along a stair a point is, in tiles from its bottom edge (0) to its top edge (3), and how far off its middle line, sideways.
export function stairAlong(s, gx, gy) {
  const ux = gx - s.low[0];
  const uy = gy - s.low[1];
  return { t: ux * s.d[0] + uy * s.d[1], off: ux * -s.d[1] + uy * s.d[0] };
}
// The stair whose step or stairwell a tile of a layer is, or null: { s, k, well }.
export function stairAt(x, y, layer = 0) {
  return stairIndex.size ? stairIndex.get(tileKey3(x, y, layer)) || null : null;
}
// The stairs a layer holds, with their stairwells from the layer below (for the drawing and the checks).
export function stairsOn(layer = 0) {
  return stairsOnLayer.get(layer) || [];
}
// ---- built stairs (docs/49 section 5): a palette entry in wood and in stone, Free building only for now ----
const BUILT_STAIR_DIRS = { n: [0, -1], w: [-1, 0], s: [0, 1], e: [1, 0] };
// A stair's material: wood, stone, or another whose definition `stair_<material>` is drawn (the stone ramp, art round 10: `ramp_stone`,
// a sloped slab whose definition has a `ramp` table, walked at 32 px a tile with no treads; its landing the floor its `landing` names).
// Anything else is wood. Pure but for the definitions, read once each.
const stairKinds = new Map();
export function stairKind(material) {
  let k = stairKinds.get(material);
  if (k) return k;
  let def = null;
  if (material !== "wood" && material !== "stone" && typeof material === "string") {
    try { def = getDef(`stair_${material}`); } catch { def = null; }
  }
  const m = material === "stone" || def ? material : "wood";
  k = { material: m, ramp: !!(def && def.ramp), landing: (def && def.landing) || (m === "stone" ? "floor_stone" : "floor_wood") };
  stairKinds.set(material, k);
  return k;
}
function builtStairRecord(x0, y0, dir, material, layer, free) {
  const d = BUILT_STAIR_DIRS[dir];
  if (!d || !Number.isInteger(x0) || !Number.isInteger(y0) || !Number.isInteger(layer)) return null;
  const tiles = [0, 1, 2].map((k) => [x0 + d[0] * k, y0 + d[1] * k]);
  return { id: `bstair_${x0}_${y0}_${layer}`, layer, at: [x0, y0], dir, material: stairKind(material).material, tiles, landing: [x0 + d[0] * 3, y0 + d[1] * 3], before: [x0 - d[0], y0 - d[1]], building: null, built: true, ...(free ? { free: true } : {}) };
}

// Why a stair cannot be built with its low tile at (x0, y0) climbing `dir` from `layer`, or "": its three tiles walkable and clear (no wall
// across its run, no prop, rug, or item), the tile before its foot walkable, its landing above open (the void, or a floor a player laid)
// with nothing on it, and its stairwell void. Stairs climb away from the camera (Primary's default, Michael to confirm: climbing east or
// south the treads fold onto one line on screen).
export function stairBuildProblem(x0, y0, dir, layer = 0, material = "wood") {
  if (dir === "e" || dir === "s") return "Stairs climb away from the camera";
  const rec = builtStairRecord(x0, y0, dir, "wood", layer, false);
  if (!rec) return "Not here";
  if (stairKind(material).ramp) {
    // A ramp walls the ground under its landing on three sides (landingSideEdges), never to be taken apart: nothing may stand on that tile
    // when it goes up, or be sealed in with it (a body is the placement's to refuse, which only it can see).
    const g = tileAt(rec.landing[0], rec.landing[1], layer);
    if (g && (g.prop || g.rug || (g.items && g.items.length))) return "Something is in the way";
  }
  if (layer < 0) return "Not here";
  const up = layer + 1;
  const [bx, by] = rec.before;
  if (!isWalkableTile(bx, by, layer) || stairAt(bx, by, layer)) return "Its foot needs a floor to step from";
  for (const [x, y] of rec.tiles) {
    const t = tileAt(x, y, layer);
    if (!isWalkableTile(x, y, layer) || stairAt(x, y, layer) || landingAt(x, y, layer)) return "Not here";
    if (t.prop || t.rug || (t.items && t.items.length)) return "Something is in the way";
    if (tileAt(x, y, up).floor !== VOID) return "A floor is over it";
    if (stairAt(x, y, up)) return "Another stair is over it";
  }
  const chain = [rec.before, ...rec.tiles];
  for (let i = 1; i < chain.length; i++) if (wallBetween(chain[i - 1][0], chain[i - 1][1], chain[i][0], chain[i][1], layer)) return "A wall is in the way";
  const head = wallBetween(rec.tiles[2][0], rec.tiles[2][1], rec.landing[0], rec.landing[1], layer); // its top edge on its own layer
  if (head) return head.kind === "wall" && wallRule(head.sprite).cliff ? "A cliff wall is at its head: take it down first" : "A wall is in the way";
  // No wall across the stairwell's top to be, against its landing (a body going down crosses it into the stairwell, whose tiles' walls the
  // collision passes whole: the review of #549), and no ring's curve over its stairwell or its landing.
  if (wallBetween(rec.tiles[2][0], rec.tiles[2][1], rec.landing[0], rec.landing[1], up)) return "A wall is over it";
  if ([...rec.tiles, rec.landing].some(([x, y]) => curveCrossed(x, y, up) || unreachableAt(x, y, up))) return "A round wall is over it";
  const lt = tileAt(rec.landing[0], rec.landing[1], up);
  if (!(lt.floor === VOID || lt.built) || stairAt(rec.landing[0], rec.landing[1], up) || landingAt(rec.landing[0], rec.landing[1], up)) return "Its landing must be open";
  if (lt.prop || lt.rug || (lt.items && lt.items.length)) return "Something is on its landing";
  return "";
}

// The edges of the ground under a stair's landing that are not its head's: [tx, ty, edge] for the n and w edges round that tile (the head
// is the one it shares with the stair's top step).
const RAMP_SIDE = "wall_ramp_side";
export function landingSideEdges(rec) {
  const [lx, ly] = rec.landing;
  const edges = [[lx, ly, "n"], [lx, ly + 1, "n"], [lx, ly, "w"], [lx + 1, ly, "w"]]; // north, south, west, east
  const head = rec.dir === "n" ? [lx, ly + 1, "n"] : [lx + 1, ly, "w"];
  return edges.filter(([x, y, e]) => !(x === head[0] && y === head[1] && e === head[2]));
}

// Build it: its landing's planks laid on the storey above (part of its cost, never taken up), the stairwell over its three tiles left void,
// its record kept on its low tile's chunk. A built stair never comes up (ruled). Returns the stair, or null.
export function buildStair(x0, y0, dir, material, layer = 0, { free = false } = {}) {
  if (stairBuildProblem(x0, y0, dir, layer, material)) return null;
  const rec = builtStairRecord(x0, y0, dir, material, layer, free);
  const up = layer + 1;
  const land = growTile(rec.landing[0], rec.landing[1], up);
  if (land.floor === VOID) land.floor = stairKind(rec.material).landing;
  for (const [x, y] of rec.tiles) growTile(x, y, up).floor = VOID; // the stairwell, already void (stairBuildProblem)
  if (stairKind(rec.material).ramp) {
    // A ramp brings its own solid sides for its landing tile (Michael, 2026-10-29: "Our ramp needs to bring its own free next level floor tile
    // side walls"): the landing floats a storey over the ground, so the edges of the tile under it that are not the head's get a plain square
    // wall where none stands, and the ramp keeps its whole solid shape. Laid with the ramp, saved as walls, never taken apart (no `built`).
    for (const [tx, ty, edge] of landingSideEdges(rec)) {
      const t = growTile(tx, ty, layer);
      if (t[edge]) continue; // a cliff wall built there already is the side
      const wall = createWall("wall", RAMP_SIDE);
      wall.at = addr(tx, ty, layer);
      t[edge] = wall;
      touch(tx, ty, layer);
      rebuildRoomsAround(tx, ty, edge, layer);
    }
  }
  stairList.push(rec);
  indexStairs();
  for (const [x, y] of [...rec.tiles, rec.landing]) touch(x, y, layer);
  touch(rec.landing[0], rec.landing[1], up);
  for (const [x, y] of rec.tiles) touch(x, y, up);
  markDirty(rec.tiles[0][0], rec.tiles[0][1], layer);
  roomsDirty = true;
  return rec;
}

// One tile-to-tile step against the stairs (canStep's): onto, along, and off a stair only by its line, from the tile before it up to its
// top step; never off its top step onto the tile beyond it on its own layer (that is the landing's, a storey up), and never sideways.
function stairStepOk(x0, y0, x1, y1, layer) {
  const a = stairIndex.get(tileKey3(x0, y0, layer));
  const b = stairIndex.get(tileKey3(x1, y1, layer));
  if (!a && !b) return true;
  if ((a && a.well) || (b && b.well)) return false; // a stairwell is void: not walked on its layer (canStep's walkable test says so too)
  const s = (a || b).s;
  if (x0 !== x1 && y0 !== y1) return false; // no diagonal onto or off a stair
  if (a && b) return a.s === b.s && Math.abs(a.k - b.k) === 1;
  const on = a || b;
  const other = a ? [x1, y1] : [x0, y0];
  return on.k === 0 && other[0] === s.before[0] && other[1] === s.before[1];
}
// A segment of a stair's edges near a circle, tested as a wall's: a stair's sides on its layer, its stairwell's sides and bottom on the
// layer above, and its top edge on its own layer for a body that is not on it (nobody comes onto a stair over its top but from the landing).
function stairBlocks(gx, gy, r2, layer, sOn) {
  const list = stairsOnLayer.get(layer);
  if (!list) return false;
  for (const { s, well } of list) {
    const { t, off } = stairAlong(s, gx, gy);
    if (t < -1 || t > 4 || Math.abs(off) > 1.5) continue;
    const [dx, dy] = s.d;
    const px = -dy;
    const py = dx;
    const L = s.low;
    const seg = (t0, o0, t1, o1, rr = r2) => pointSegDist2(gx, gy, L[0] + dx * t0 + px * o0, L[1] + dy * t0 + py * o0, L[0] + dx * t1 + px * o1, L[1] + dy * t1 + py * o1) < rr;
    // The sides: a stairwell's hold the whole body back from the hole; a stair's own hold its feet (STAIR_FEET), so a body walks up
    // anywhere across the steps' width, the left or right third as well as the middle, and is never over the drawn side (Michael's
    // playtest, 2026-10-27: the walkable band was narrower than the steps drawn).
    const sr2 = well || Math.abs(off) >= 0.5 ? r2 : Math.min(r2, STAIR_FEET * STAIR_FEET); // from beside it, the whole body is held off the side
    if (seg(0, 0.5, 3, 0.5, sr2) || seg(0, -0.5, 3, -0.5, sr2)) return true;
    if (well && seg(0, -0.5, 0, 0.5)) return true; // the stairwell's bottom end, over the stair's foot
    if (!well && sOn !== s && seg(3, -0.5, 3, 0.5)) return true; // the top edge, to a body not on the stair, its whole body (Michael's nook under the landing)
  }
  return false;
}
// How far a body's feet are from a stair's middle line at most on its own layer (the half-width of its feet against the stair's sides).
export const STAIR_FEET = 0.15;
// A body's rise at `t` tiles up a stair (0 to 3): the top of the tread under its feet. Twelve treads, tread k (1 to 12) 8k px tall and
// centred k / 4 tiles up, the last half a tread flush with the landing, bare floor before the first (the drawn stairs' layout, art round 8;
// render/storeys.js draws the dev art's to the same numbers).
export const STAIR_TREADS = 12;
export function stairRise(t) {
  return Math.max(0, Math.min(STAIR_TREADS, Math.round(Math.max(0, Math.min(3, t)) * 4))) * 8;
}
// A body's rise on stair `s` at `t` tiles up: a ramp's (art round 10, the stone ramp) its slab's line, 32 px a tile to the whole pixel (its
// three worn steps lie 3 px under that line at most); a stair's the tread under its feet.
export function riseOn(s, t) {
  return stairKind(s.material).ramp ? Math.round(Math.max(0, Math.min(3, t)) * 32) : stairRise(t);
}
// The stair a body at (gx, gy) on `layer` is on (its centre over its three tiles, or just past its top edge, where it is crossing to the
// landing this step), or null.
function stairUnder(gx, gy, layer, tMax = 3.35) {
  const list = stairsOnLayer.get(layer);
  if (!list) return null;
  for (const { s, well } of list) {
    if (well) continue;
    const { t, off } = stairAlong(s, gx, gy);
    if (t >= 0 && t <= tMax && Math.abs(off) <= 0.5) return s;
  }
  return null;
}
// After a body moves: its layer and rise from where it stands on a stair (docs/49 section 4). Up: on a step its rise is 32 a tile from the
// bottom edge; past the top edge it is on the layer above, rise 0. Down: from the landing over the top edge into the stairwell it is on the
// stair's layer again, rise 96 less what it went back. Off the bottom, rise 0. The host's step, a guest's prediction, the dead, all alike.
export function stairStep(body) {
  if (!stairIndex.size) return;
  const L = body.layer || 0;
  const hit = stairIndex.get(tileKey3(Math.round(body.gx), Math.round(body.gy), L));
  if (hit && hit.well) {
    // From the landing back over the top edge: on the stair below.
    const { t } = stairAlong(hit.s, body.gx, body.gy);
    body.layer = hit.s.layer;
    body.rise = riseOn(hit.s, t);
    return;
  }
  if (hit) {
    const { t } = stairAlong(hit.s, body.gx, body.gy);
    body.rise = riseOn(hit.s, t);
    return;
  }
  if (body.rise) {
    // It was on a stair of this layer: past its top edge it is on the landing, a storey up; else it stepped off the bottom.
    for (const { s, well } of stairsOnLayer.get(L) || []) {
      if (well) continue;
      const { t, off } = stairAlong(s, body.gx, body.gy);
      if (t >= 3 && t < 3.6 && Math.abs(off) <= 0.6) {
        body.layer = s.layer + 1;
        // Onto the landing at its full width (the recheck of #549): a body climbed the steps on its feet, as near a side as STAIR_FEET lets
        // it; on the landing it is all of it, so it is set in from the landing's sides as far as it is round, never arriving over a wall
        // or the void beside the landing.
        const lim = Math.max(0, 0.5 - (body.radius || 0.3) - 1e-6); // a hair inside, so rounding never sets it overlapping (map.moveCircle's overlap rule)
        if (Math.abs(off) > lim) {
          const by = (Math.sign(off) * lim - off);
          body.gx += -s.d[1] * by;
          body.gy += s.d[0] * by;
        }
        break;
      }
    }
    body.rise = 0;
  }
}

// canStep bound to a layer, for the pathfinder: the ground's is canStep itself, so its searches are the ones they always were.
const stepOn = new Map();
export function canStepOn(layer = 0) {
  if (!layer) return canStep;
  let f = stepOn.get(layer);
  if (!f) stepOn.set(layer, (f = (x0, y0, x1, y1) => canStep(x0, y0, x1, y1, layer)));
  return f;
}

function pointSegDist2(px, py, ax, ay, bx, by) {
  const vx = bx - ax;
  const vy = by - ay;
  const len2 = vx * vx + vy * vy || 1;
  let t = ((px - ax) * vx + (py - ay) * vy) / len2;
  t = Math.max(0, Math.min(1, t));
  const cx = ax + vx * t;
  const cy = ay + vy * t;
  return (px - cx) * (px - cx) + (py - cy) * (py - cy);
}

// Circle at float (gx, gy) with radius r against solid props and wall segments, on one layer (an empty tile, void or
// earth or a hole, blocks as water does: no body stands on one).
export function circleBlocked(gx, gy, r0, layer = 0, sFrom = undefined) {
  // On a stair the body is over what stands beside it on the stair's layer (a chair, a table, the foot of a wall): its feet alone are
  // held, by the stair's own sides (stairBlocks), so it walks up the steps' whole width (Michael's playtest, 2026-10-27).
  const sOn = sFrom !== undefined ? sFrom : stairIndex.size ? stairUnder(gx, gy, layer) : null;
  const r = sOn ? Math.min(r0, STAIR_FEET) : r0;
  const r2 = r * r;
  const minX = Math.floor(gx - r + 0.5);
  const maxX = Math.floor(gx + r + 0.5);
  const minY = Math.floor(gy - r + 0.5);
  const maxY = Math.floor(gy + r + 0.5);
  // On a stair (docs/49 section 4): its sides hold the body, and past its top edge nothing of its own layer is in the way (the landing is a
  // storey up, and the layer changes as the body crosses); a stairwell's void is not solid to a body on the layer above (its edges are).
  // Whether the body is on a stair is the moving body's own, from where it stands before the move (`sFrom`, moveCircle's), never from where it would be: a body under a landing on the stair's own layer is not on the stair and its top edge holds it (the review of #534).
  if (stairIndex.size && stairBlocks(gx, gy, r2, layer, sOn)) return true;
  for (let ty = minY; ty <= maxY + 1; ty++) {
    for (let tx = minX; tx <= maxX + 1; tx++) {
      if (sOn && pastTop(sOn, tx, ty)) continue;
      if (stairIndex.size) {
        const w = stairIndex.get(tileKey3(tx, ty, layer));
        if (w && w.well) continue; // a stairwell: its edges block (stairBlocks), its void does not
      }
      const t = tileAt(tx, ty, layer);
      // Water blocks like a solid tile: no body enters a wholly-water tile (docs/30, law 8).
      if (tx <= maxX && ty <= maxY && floorRule(t.floor).walk === false) {
        const cx = Math.max(tx - 0.5, Math.min(gx, tx + 0.5));
        const cy = Math.max(ty - 0.5, Math.min(gy, ty + 0.5));
        const dx = gx - cx;
        const dy = gy - cy;
        if (dx * dx + dy * dy < r2) return true;
      }
      if (t.prop && t.prop.solid && tx <= maxX && ty <= maxY) {
        if (t.prop.radius) {
          // A round thing (a trunk, a barrel) blocks only a circle at the tile
          // centre, so you can slip between canopies (Michael, 2026-10-09:
          // whole-tile trees made the wood impenetrable). Against round things
          // a body counts as narrower than against walls: two trunks a tile
          // apart left a 0.64 gap for a 0.6 body, passable only dead centre.
          const dx = gx - tx;
          const dy = gy - ty;
          const rr = Math.min(r, ROUND_BODY_RADIUS) + t.prop.radius;
          if (dx * dx + dy * dy < rr * rr) return true;
        } else {
          // Tile square spans [tx - 0.5, tx + 0.5]. Closest point to the circle centre:
          const cx = Math.max(tx - 0.5, Math.min(gx, tx + 0.5));
          const cy = Math.max(ty - 0.5, Math.min(gy, ty + 0.5));
          const dx = gx - cx;
          const dy = gy - cy;
          if (dx * dx + dy * dy < r2) return true;
        }
      }
      if (curveTiles) {
        // A ring's drawn curve (docs/50 section 3, option A ruled): its chords on the tiles they cross, tested beside the tile's own edges.
        const m = ringMarks.get(chunkKey(tx, ty, layer));
        if (m && m.curve) for (const c of m.curve) if (pointSegDist2(gx, gy, c[0], c[1], c[2], c[3]) < r2) return true;
      }
      const ns = moveSegments(t.n);
      if (ns) {
        const ex = tx - 0.5;
        const ey = ty - 0.5;
        for (const [a, b] of ns) if (pointSegDist2(gx, gy, ex + a, ey, ex + b, ey) < r2) return true;
      }
      const ws = moveSegments(t.w);
      if (ws) {
        const ex = tx - 0.5;
        const ey = ty - 0.5;
        for (const [a, b] of ws) if (pointSegDist2(gx, gy, ex, ey + a, ex, ey + b) < r2) return true;
      }
    }
  }
  return false;
}

// Whether tile (tx, ty) of a stair's layer lies past its top edge (its centre beyond it), or holds the top edge in its own slot (a stair
// climbing north or west ends on its top step's own n or w edge): what a body on the stair is not stopped by.
function pastTop(s, tx, ty) {
  const { t, off } = stairAlong(s, tx, ty);
  if (Math.abs(off) > 1.01) return false;
  if (t > 3) return true;
  const [x2, y2] = s.tiles[2];
  return tx === x2 && ty === y2 && (s.dir === "n" || s.dir === "w") ? "edge" : false;
}

// The nearest open doorway on the row of north edges `row`, among the tiles
// within one of `x`. Returns its tile x, or null.
function doorOnRow(x, row, layer = 0) {
  let best = null;
  for (const tx of [x, x - 1, x + 1]) {
    const w = tileAt(tx, row, layer).n;
    if (w && w.kind === "door" && wayOpen(w) && (best === null || Math.abs(tx - x) < Math.abs(best - x))) best = tx;
  }
  return best;
}

function doorOnColumn(col, y, layer = 0) {
  let best = null;
  for (const ty of [y, y - 1, y + 1]) {
    const w = tileAt(col, ty, layer).w;
    if (w && w.kind === "door" && wayOpen(w) && (best === null || Math.abs(ty - y) < Math.abs(best - y))) best = ty;
  }
  return best;
}

// Move a circle by (dx, dy) with axis-separated resolution so it slides. If the
// circle already overlaps something, it may move only where it goes no deeper
// into it (the recheck of #549; with its centre inside something it walks out
// freely, as the cozy parent's rule had every overlap do).
//
// Door magnet: a doorway is one tile wide and a body is 0.6, so walking straight
// at a door only fits when nearly centred. When a step into a wall is blocked
// and an open doorway is within a tile along that wall, the blocked motion
// becomes a slide toward the doorway's centre instead.
// The round prop (trunk, barrel) that blocks a body at (gx, gy), or null.
function roundBlockerAt(gx, gy, r, layer = 0) {
  const cx = Math.round(gx);
  const cy = Math.round(gy);
  let best = null;
  let bestD = Infinity;
  for (let ty = cy - 1; ty <= cy + 1; ty++) {
    for (let tx = cx - 1; tx <= cx + 1; tx++) {
      const p = tileAt(tx, ty, layer).prop;
      if (!p || !p.solid || !p.radius) continue;
      const dx = gx - tx;
      const dy = gy - ty;
      const rr = Math.min(r, ROUND_BODY_RADIUS) + p.radius;
      const d2 = dx * dx + dy * dy;
      if (d2 < rr * rr && d2 < bestD) {
        bestD = d2;
        best = [tx, ty];
      }
    }
  }
  return best;
}

export function moveCircle(gx, gy, r, dx, dy, layer = 0) {
  const sFrom = stairIndex.size ? stairUnder(gx, gy, layer, 3) : null; // on a stair only if its centre is over its three tiles now
  if (circleBlocked(gx, gy, r, layer, sFrom)) {
    // Already overlapping something (a door shut on it, a prop set down over it, a storey changed under it): it may move, but never deeper
    // into what it overlaps (the recheck of #549: a body walked out of an overlap straight through a wall, or out over the void). Its
    // clearance now is the largest circle free where it stands; a move is taken whole or along one axis if that circle is free there too.
    // With its centre inside something, it walks out freely, as before.
    if (circleBlocked(gx, gy, 0.02, layer, sFrom)) return { gx: gx + dx, gy: gy + dy };
    let lo = 0.02;
    let hi = r;
    for (let i = 0; i < 7; i++) {
      const mid = (lo + hi) / 2;
      if (circleBlocked(gx, gy, mid, layer, sFrom)) hi = mid;
      else lo = mid;
    }
    if (!circleBlocked(gx + dx, gy + dy, lo, layer, sFrom)) return { gx: gx + dx, gy: gy + dy };
    if (dx && !circleBlocked(gx + dx, gy, lo, layer, sFrom)) return { gx: gx + dx, gy };
    if (dy && !circleBlocked(gx, gy + dy, lo, layer, sFrom)) return { gx, gy: gy + dy };
    return { gx, gy };
  }
  // Round things deflect: a step that would hit a trunk slides along its
  // tangent instead of stopping, so two trunks a tile apart funnel you into
  // the gap between them rather than catching you at the edge.
  const tx = gx + dx;
  const ty0 = gy + dy;
  if ((dx !== 0 || dy !== 0) && circleBlocked(tx, ty0, r, layer, sFrom)) {
    const c = roundBlockerAt(tx, ty0, r, layer);
    if (c) {
      const vx = gx - c[0];
      const vy = gy - c[1];
      const len = Math.hypot(vx, vy) || 1;
      const tangX = -vy / len;
      const tangY = vx / len;
      const s = dx * tangX + dy * tangY;
      const sx = gx + tangX * s;
      const sy = gy + tangY * s;
      if (s !== 0 && !circleBlocked(sx, sy, r, layer, sFrom)) return { gx: sx, gy: sy };
    }
  }
  let nx = gx + dx;
  let ny = gy;
  if (dx !== 0 && circleBlocked(nx, gy, r, layer, sFrom)) {
    nx = gx;
    // Blocked crossing a west edge: the column of edges is at the tile we are entering.
    const col = dx > 0 ? Math.round(gx) + 1 : Math.round(gx);
    const door = doorOnColumn(col, Math.round(gy), layer);
    if (door !== null && Math.abs(door - gy) <= 1) {
      const slide = Math.sign(door - gy) * Math.min(Math.abs(door - gy), Math.abs(dx));
      if (slide !== 0 && !circleBlocked(nx, gy + slide, r, layer, sFrom)) ny = gy + slide;
    }
  }
  const ty = ny + dy;
  if (dy !== 0 && circleBlocked(nx, ty, r, layer, sFrom)) {
    const row = dy > 0 ? Math.round(ny) + 1 : Math.round(ny);
    const door = doorOnRow(Math.round(nx), row, layer);
    if (door !== null && Math.abs(door - nx) <= 1) {
      const slide = Math.sign(door - nx) * Math.min(Math.abs(door - nx), Math.abs(dy));
      if (slide !== 0 && !circleBlocked(nx + slide, ny, r, layer, sFrom)) nx += slide;
    }
  } else {
    ny = ty;
  }
  return { gx: nx, gy: ny };
}

// A free open tile within two steps of (x, y) by the authored map alone, never across a wall or a door, or null: where
// an extra of the dead the map places by hand stands (the Starting population rule, #130). It reads the authored tiles,
// not the chunks, which are not all grown when the world is made.
export function authoredNear(x, y, taken) {
  const at = (tx, ty) => (source ? source(tx, ty) : null);
  const open = (tx, ty) => {
    const t = at(tx, ty);
    return !t || (!(t.prop && t.prop.solid) && floorRule(t.floor).walk !== false);
  };
  const clear = (ax, ay, bx, by) => {
    const [ex, ey, slot] = edgeBetween(ax, ay, bx, by);
    const t = at(ex, ey);
    return !(t && t[slot]);
  };
  const seen = new Set([`${x},${y}`]);
  let frontier = [[x, y]];
  for (let ring = 1; ring <= 2; ring++) {
    const next = [];
    for (const [fx, fy] of frontier) {
      for (const [dx, dy] of [[1, 0], [0, 1], [-1, 0], [0, -1]]) {
        const tx = fx + dx;
        const ty = fy + dy;
        const k = `${tx},${ty}`;
        if (seen.has(k) || !open(tx, ty) || !clear(fx, fy, tx, ty)) continue;
        seen.add(k);
        next.push([tx, ty]);
        if (!taken.has(k)) return [tx, ty];
      }
    }
    frontier = next;
  }
  return null;
}

// Nearest walkable tile to (x, y), in expanding rings.
export function nearestWalkable(x, y, occupied = () => false, maxRing = 12, layer = 0) {
  for (let ring = 0; ring <= maxRing; ring++) {
    for (let dy = -ring; dy <= ring; dy++) {
      for (let dx = -ring; dx <= ring; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== ring) continue;
        if (isWalkableTile(x + dx, y + dy, layer) && !occupied(x + dx, y + dy)) return [x + dx, y + dy];
      }
    }
  }
  return null;
}

// ---- rooms by flood fill ----
// Rooms are found, never authored (docs/02-decisions.md). A region of floor
// bounded by walls, doors, and windows is a room. Anything that touches an
// unloaded chunk or grows past ROOM_MAX tiles is outdoors, room 0.

export function markRoomsDirty() {
  roomsDirty = true;
}

const UNVISITED = -1;
const OUTDOORS = -2;
const STEPS4 = [[1, 0], [-1, 0], [0, 1], [0, -1]];

let nextRoomId = 1; // never reused in a session, so a local refind cannot collide with a room it did not touch

// Flood-fill one region from (x0, y0) as room `id` over tiles whose room
// `fillable` accepts, stopping at any wall. Outdoors is a fill that reaches an
// unloaded tile or grows past ROOM_MAX; with `stopOutdoors` the fill ends
// there (a local refind throws the region away), without it the fill goes on
// to mark the whole outdoors in one pass (a full rebuild, which must not start
// a fill from every grass tile). Returns { region, outdoors, openings }.
// On one layer (docs/49 section 3): every read is that layer's, so a tile of another never leaks into it. Earth bounds the fill as a
// wall does (a cellar is a room by its earth), and below the ground a chunk not grown is earth; void it enters as it enters any floor
// (a stairwell inside a room's walls is the room's), and above the ground a chunk not grown is the outside at once, as on the ground.
function fillRegion(x0, y0, id, fillable, stopOutdoors = false, layer = 0) {
  const region = [];
  const stack = [x0, y0];
  tileAt(x0, y0, layer).room = id;
  let outdoors = false;
  // The doors and windows the fill touched, so light can ask how much
  // daylight a room's openings admit (docs/07-lighting.md).
  const openings = [];
  const seenEdges = new Set();
  while (stack.length) {
    if (outdoors && stopOutdoors) {
      // Stop here, but every tile marked `id` must be in the region the caller resets:
      // the ones still on the stack were marked when pushed.
      while (stack.length) {
        const y = stack.pop();
        const x = stack.pop();
        region.push(x, y);
      }
      break;
    }
    const y = stack.pop();
    const x = stack.pop();
    region.push(x, y);
    if (region.length > ROOM_MAX * 2) outdoors = true;
    for (const [dx, dy] of STEPS4) {
      const nx = x + dx;
      const ny = y + dy;
      const nt = peekTile(nx, ny, layer);
      // Off the ground a wall on this tile's own edge bounds the room even where the chunk beyond has not grown (a built room against a
      // chunk's edge, with nothing built past it); on the ground an ungrown neighbour is the outside first, as it always was.
      if (layer && !nt) {
        const w0 = wallBetween(x, y, nx, ny, layer);
        if (w0 && !wallRule(w0.sprite).seeThrough) {
          if (w0.kind !== "wall" && !outdoors) {
            const [ex, ey, edge] = edgeBetween(x, y, nx, ny);
            const k = `${ex},${ey},${edge}`;
            if (!seenEdges.has(k)) {
              seenEdges.add(k);
              openings.push({ tx: ex, ty: ey, edge });
            }
          }
          continue;
        }
      }
      if (!nt) {
        if (layer < 0) continue; // below the ground an ungrown chunk is earth, which bounds
        outdoors = true;
        continue;
      }
      if (nt.floor === EARTH) continue; // earth bounds a room as a wall does
      const wall = wallBetween(x, y, nx, ny, layer);
      // Any wall bounds a room, except a see-through one (a fence round a field, bars): a
      // region closed by fences is outdoors, and a cell behind bars is its corridor's room (docs/30 step 0).
      if (wall && !wallRule(wall.sprite).seeThrough) {
        if (wall.kind !== "wall" && !outdoors) {
          const [ex, ey, edge] = edgeBetween(x, y, nx, ny);
          const k = `${ex},${ey},${edge}`;
          if (!seenEdges.has(k)) {
            seenEdges.add(k);
            openings.push({ tx: ex, ty: ey, edge });
          }
        }
        continue;
      }
      if (!fillable(nt.room)) continue;
      nt.room = id;
      stack.push(nx, ny);
    }
  }
  return { region, outdoors, openings };
}

// Every loaded chunk's rooms, each chunk's on its own layer (docs/49 section 3: before step 0 the fill read layer 0 whatever chunk it
// walked, so a tile of another layer would have taken a ground room's id). Earth is no room and starts no fill (it stays 0).
export function rebuildRooms() {
  roomsDirty = false;
  rooms.clear();
  // Outdoors is marked with its own value during the pass. A first version set
  // finished outdoor tiles back to 0, the same as "not visited", so every grass
  // tile started a new fill over the whole outdoors: 1.6 s for 16 chunks, and
  // the freeze Michael saw when walking into new ground (2026-10-09).
  for (const c of chunks.values()) for (const t of c.tiles) t.room = UNVISITED;
  for (const c of chunks.values()) {
    const layer = c.layer;
    for (let i = 0; i < c.tiles.length; i++) {
      const t0 = c.tiles[i];
      if (t0.room !== UNVISITED || t0.floor === EARTH) continue;
      const x0 = c.cx * CHUNK + (i % CHUNK);
      const y0 = c.cy * CHUNK + Math.floor(i / CHUNK);
      const id = nextRoomId;
      const { region, outdoors, openings } = fillRegion(x0, y0, id, (r) => r === UNVISITED, false, layer);
      if (outdoors) {
        for (let j = 0; j < region.length; j += 2) peekTile(region[j], region[j + 1], layer).room = OUTDOORS;
      } else {
        rooms.set(id, { id, size: region.length / 2, openings, layer });
        nextRoomId++;
      }
    }
  }
  for (const c of chunks.values()) for (const t of c.tiles) if (t.room < 0) t.room = 0;
}

// The rooms a wall change on one edge can touch, refound alone (docs/23a, B3):
// the edge's two tiles name at most two rooms; those rooms' tiles are reset
// and refilled from each tile. Outdoors (room 0) is fillable here, since a
// room opened to the yard must become the yard, and a fill that crosses open
// ground reaches ROOM_MAX and is outdoors as before; a yard newly walled in is
// a bounded fill from a tile of room 0, and becomes a room. A full rebuild
// scanned every loaded chunk (7 to 10 ms) on every wall built. On the edge's own
// layer: a change on one layer refills that layer alone (docs/49 section 7).
export function rebuildRoomsAround(tx, ty, edge, layer = 0) {
  if (roomsDirty) {
    rebuildRooms();
    return;
  }
  const seeds = [[tx, ty], edge === "n" ? [tx, ty - 1] : [tx - 1, ty]];
  const ids = new Set();
  for (const [x, y] of seeds) {
    const t = peekTile(x, y, layer);
    if (t && t.room > 0) ids.add(t.room);
  }
  if (ids.size) {
    for (const c of chunks.values()) if (c.layer === layer) for (const t of c.tiles) if (ids.has(t.room)) t.room = UNVISITED;
    for (const id of ids) rooms.delete(id);
  }
  for (const [x, y] of seeds) {
    const t = peekTile(x, y, layer);
    if (!t || t.room > 0 || t.floor === EARTH) continue; // unloaded, earth, or already refilled from the other seed
    const id = nextRoomId;
    const { region, outdoors, openings } = fillRegion(x, y, id, (r) => r === UNVISITED || r === 0, true, layer);
    if (outdoors) {
      for (let j = 0; j < region.length; j += 2) peekTile(region[j], region[j + 1], layer).room = 0;
    } else {
      rooms.set(id, { id, size: region.length / 2, openings, layer });
      nextRoomId++;
    }
  }
  for (const c of chunks.values()) if (c.layer === layer) for (const t of c.tiles) if (t.room === UNVISITED) t.room = 0;
}

export function roomsIfDirty() {
  if (roomsDirty) rebuildRooms();
}

export function roomAt(x, y, layer = 0) {
  roomsIfDirty();
  return tileAt(x, y, layer).room;
}

export function roomCount() {
  return rooms.size;
}

// ---- authoring ----
// A map file is a base floor, `features` (roads), `sets` (buildings, floors,
// and props placed relative to a set's origin, with a padding ring), `scatter`
// rules, and a `wild` rule for beyond the bounds. A building is a rectangle of
// interior tiles with walls on its perimeter edges, openings in those walls,
// its own floor, and props placed relative to its corner. See loadMap below
// and data/maps/square.json. The result is sliced into chunks on first load.

export function createProp(def, offset = [0, 0]) {
  const prop = propBase(def, offset);
  if (prop.fire) fireProps.add(prop);
  propsById.set(prop.id, prop);
  return prop;
}

// What a prop is made as, from its sprite definition and what the map says of it, registered nowhere (createProp registers it): also what
// `serializeProp` compares against, so a field at its default is left out of the save and the frame (#221).
function propBase(def, offset = [0, 0]) {
  const [w, h] = def.footprint || [1, 1];
  const ox = def.tile[0] + offset[0];
  const oy = def.tile[1] + offset[1];
  const tiles = [];
  for (let dy = 0; dy < h; dy++) for (let dx = 0; dx < w; dx++) tiles.push([ox + dx, oy + dy]);
  // A sprite definition may declare `collide: { radius }` in tiles: the prop
  // then blocks a circle at its tile centre rather than the whole tile. Tiles
  // with a solid prop stay unwalkable for pathing either way, so the dead walk
  // around trees while a body can brush past the trunk.
  const sdef = getDef(def.sprite);
  const radius = def.radius ?? sdef.collide?.radius ?? 0;
  const prop = {
    kind: "prop",
    id: def.id || nextId("p"), // the map file may carry one; else the world's counter (docs/31/08, habit 1)
    sprite: def.sprite,
    tile: [ox, oy],
    layer: def.layer | 0, // its layer (docs/49 section 3): 0 on the ground, and then left out of its record (serializeProp)
    footprint: [w, h],
    tiles,
    solid: def.solid !== false,
    opaque: !!def.opaque,
    radius: w === 1 && h === 1 ? radius : 0,
    fire: null,
    // docs/10: a container has a bag made on first search from its loot
    // table; a tree has wood to chop; the well has water.
    container: sdef.container ? { ...sdef.container, ...(typeof def.loot === "string" ? { loot: def.loot } : {}) } : null, // a placed container may name its own loot table (the map's `loot`, #195)
    bag: null,
    searched: false,
    wood: sdef.wood || 0,
    water: !!sdef.water,
    // Drawn this many screen pixels off its tile's centre (forage objects), and
    // a thing the player can click (it wiggles, for now; question 27).
    offset: def.offset || null,
    interactable: !!sdef.interactable,
    // Which way it faces, for a sprite with facings (docs/17): the map's, else the first.
    facing: facingFor(sdef, def, w, h),
  };
  if (sdef.furrows && !def.facing) prop.furrowsPending = true; // the key only when it is true: 19% of every prop's text said `false` (#232's review)
  // A crop the map authored by stage (its definition's `crop: { kind, stage }`): farming.js settles it live the first time it is looked at.
  if (sdef.crop) prop.crop = { kind: sdef.crop.kind, stage: sdef.crop.stage };
  // Fire is data on the sprite definition (docs/07-lighting.md): a light
  // radius, whether it lights its whole room, burns wood, cooks. Live state
  // (lit, fuel) sits on the prop.
  if (sdef.fire) {
    const f = sdef.fire;
    const holds = f.holds || null;
    const has = holds ? !!def.torch : false;
    prop.fire = {
      radius: f.radius || 0,
      room: !!f.room,
      burns: !!f.burns,
      cooks: !!f.cooks,
      switch: !!f.switch, // a home light (a fireplace, a fire pit, a lantern): on and off, no fuel, lit with a flame (docs/43, section 3)
      holds, // "torch": a post, lit while it holds one
      has,
      lit: holds ? has && def.lit !== false : def.lit ?? f.lit ?? !f.burns, // a post may be authored holding an unlit torch (docs/43 section 4)
      // The units in it now: the map's number, else none. The definition's `fire.fuel` names the item it burns (below),
      // and was read here as the count until 2026-10-15: an authored burner with no number of its own held the word
      // "log", and feeding it made the fuel not a number, a fire that never went out and marked its chunk every step
      // (found proving the save's cache, `02`).
      fuel: Number.isFinite(def.fuel) ? def.fuel : 0,
      maxFuel: f.maxFuel ?? 4,
      fuelItem: f.fuel || "log", // the item (or tag) it burns (docs/30 section 7)
      hoursPerUnit: f.hoursPerUnit ?? 2,
      flicker: f.flicker || null, // { amp, speed }: applied when the light map is composed on the GPU (docs/08)
    };
  }
  return prop;
}

// A prop's facing (docs/17): the map's if it has one, else the facing whose
// footprint matches the map's footprint (a bed laid along x is the mirror),
// else the first.
function facingFor(sdef, def, w, h) {
  if (!sdef.facings || !sdef.facings.length) return null;
  if (sdef.facings.includes(def.facing)) return def.facing;
  if (sdef.facingFootprint) {
    for (const f of sdef.facings) {
      const fp = sdef.facingFootprint[f];
      if (fp && fp[0] === w && fp[1] === h) return f;
    }
  }
  return sdef.facings[0];
}

// A set's origin: explicit, else its rect's corner, else its first rect's.
function setOrigin(s) {
  if (s.origin) return [s.origin[0], s.origin[1]];
  if (s.rect) return [s.rect[0], s.rect[1]];
  if (s.rects && s.rects.length) return [s.rects[0][0], s.rects[0][1]];
  return [0, 0];
}

// Every tile of a set's footprint, in world coordinates.
function setFootprint(s) {
  const out = [];
  const addRect = ([x0, y0, w, h]) => {
    for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) out.push([x, y]);
  };
  if (s.rect) addRect(s.rect);
  for (const r of s.rects || []) addRect(r);
  if (s.mask) {
    const [ox, oy] = setOrigin(s);
    s.mask.forEach((row, dy) => {
      for (let dx = 0; dx < row.length; dx++) if (row[dx] === "#") out.push([ox + dx, oy + dy]);
    });
  }
  return out;
}

// Make sure every chunk within `radius` chunks of (x, y) exists, so wild
// forest and its dead are grown well outside the viewport, never in it. The
// simulation's ring round each player is four chunks (docs/02, 2026-10-13).
// On the other layers only the chunks an authored tile stands in grow (docs/49 section 3: growth of authored and built tiles only; a
// built one grows its chunk through its mutator): the void and the earth are the blanks, and nothing empty is saved or sent.
export function ensureAround(x, y, radius = 4) {
  const [cx, cy] = chunkCoord(Math.round(x), Math.round(y));
  for (let dy = -radius; dy <= radius; dy++) for (let dx = -radius; dx <= radius; dx++) getChunk(cx + dx, cy + dy);
  for (const [layer, keys] of authoredChunks) {
    for (const [k, [acx, acy]] of keys) {
      if (chunks.has(k) || Math.max(Math.abs(acx - cx), Math.abs(acy - cy)) > radius) continue;
      getChunk(acx, acy, true, layer);
    }
  }
}

// The layers that hold anything authored, the ground's first (docs/49 section 11; for the checks and the drawing).
export function authoredLayers() {
  return [0, ...[...authoredChunks.keys()].sort((a, b) => a - b)];
}

// Build an authored-tile lookup from a map file, then reset the map onto it.
//
// The vocabulary (Michael, 2026-10-09):
// - A **set** is an authored thing with a footprint and a padding ring that
//   scatter never enters: a cottage, a farm plot, an overturned wagon, a whole
//   castle compound. Its buildings, floors, and props are placed relative to
//   its corner. A set is defined by its own outline, so two sets joined by a
//   road stay two sets.
// - A **feature** is linear and reserves only its own tiles, with no padding:
//   roads now, rivers and bridges later. A road may run right up to a set.
// - **Scatter** fills what is left by rule, and the **wild** beyond the bounds
//   is scatter all the way down.
// `options` are the world's own rules (rules.js), read when it is made or restored, never once per page (#130):
// `trees` false makes no tree, inside the bounds or beyond them, and nothing else changes (rocks, forage, the ground,
// and any scatter that is not trees stay, in the same places; the forage is placed against where the trees would have
// stood, so a world of the same seed has the same mushrooms with or without them, #142); `population` is the factor the dead a wild chunk brings
// are scaled by (the authored dead are scaled by game.create).
export function loadMap(json, options = {}) {
  const treesOn = options.trees !== false;
  noTrees = !treesOn;
  ghostTrees.clear();
  popFactor = Number.isFinite(options.population) ? options.population : 1;
  fireProps.clear(); // props are created below, before reset() runs
  waterBodies.length = 0;
  propsById.clear();
  bracketSet.clear();
  const pendingBrackets = []; // [tx, ty, edge, side, torch, lantern], added once the map is live
  const authored = new Map();
  const key = (x, y) => `${x},${y}`;
  const get = (x, y) => {
    let t = authored.get(key(x, y));
    if (!t) {
      t = createTile(json.floor || "floor_grass");
      authored.set(key(x, y), t);
    }
    return t;
  };
  const props = [];
  const placeProp = (def, offset) => {
    if (noTrees && isTreeKind(def.sprite)) { ghostTrees.add(ghostKey(def.tile[0] + offset[0], def.tile[1] + offset[1])); return; } // Trees off: an authored tree (an orchard's) is not placed either, and the forage counts where it would have stood
    const prop = createProp(def, offset);
    props.push(prop);
    for (const [tx, ty] of prop.tiles) get(tx, ty).prop = prop;
  };
  // The other layers' authored tiles (docs/49 section 11): a tile made on first use is void above the ground and earth below it.
  const layered = new Map(); // layer -> Map("x,y" -> tile)
  const getL = (x, y, layer) => {
    if (!layer) return get(x, y);
    let m = layered.get(layer);
    if (!m) layered.set(layer, (m = new Map()));
    let t = m.get(key(x, y));
    if (!t) {
      t = createTile(layer > 0 ? VOID : EARTH);
      m.set(key(x, y), t);
    }
    return t;
  };
  // An authored tile as it stands, made by nothing (null where nothing is authored).
  const readL = (x, y, layer) => (layer ? (layered.get(layer) && layered.get(layer).get(key(x, y))) || null : authored.get(key(x, y)) || null);
  // A prop on a layer: the ground's by placeProp (the Trees rule and all); another layer's carries its layer.
  const placePropOn = (def, offset, layer) => {
    if (!layer) return placeProp(def, offset);
    const prop = createProp({ ...def, layer }, offset);
    props.push(prop);
    for (const [tx, ty] of prop.tiles) getL(tx, ty, layer).prop = prop;
  };
  // A stair (docs/49 section 4): `{ at, dir, layer, material }`, `at` its low end relative to the building's corner, climbing one storey
  // in `dir`. Its three tiles on its layer; the landing beyond the third step on the layer above, floored with planks where nothing is
  // authored and never built on; the tile before its bottom step walkable; the stairwell over its three tiles void (no floor is built
  // over a stair), or a hole in the ground floor over a cellar's stair (its three tiles cut out of the earth). Kept as data
  // (`stairs()`); the stair as a thing a body climbs is step 3's. A stair that does not fit is left out, and why is kept (`stairProblems`).
  const STAIR_DIRS = { n: [0, -1], e: [1, 0], s: [0, 1], w: [-1, 0] };
  const stairTaken = new Set(); // "layer,x,y" of every stair's three tiles and landing
  const edgeWall = (a, b, layer) => {
    const [ex, ey, slot] = edgeBetween(a[0], a[1], b[0], b[1]);
    const t = readL(ex, ey, layer);
    return t ? t[slot] : null;
  };
  const layStair = (s, [bx, by], building) => {
    const d = STAIR_DIRS[s.dir];
    const layer = s.layer | 0;
    const up = layer + 1;
    const where = `${building.id}'s stair at ${s.at} ${s.dir} on layer ${layer}`;
    if (!d || !Array.isArray(s.at)) return stairProblems.push(`${where}: no direction or low end`);
    const x0 = bx + s.at[0];
    const y0 = by + s.at[1];
    const tiles = [0, 1, 2].map((k) => [x0 + d[0] * k, y0 + d[1] * k]);
    const before = [x0 - d[0], y0 - d[1]];
    const landing = [x0 + d[0] * 3, y0 + d[1] * 3];
    const mine = [...tiles.map(([x, y]) => `${layer},${x},${y}`), `${up},${landing[0]},${landing[1]}`];
    if (mine.some((k) => stairTaken.has(k)) || stairTaken.has(`${layer},${before[0]},${before[1]}`)) return stairProblems.push(`${where}: it crosses another stair`);
    const bt = readL(before[0], before[1], layer);
    const bFloor = bt ? bt.floor : layer ? emptyFloorOf(layer) : json.floor || "floor_grass";
    if (isEngineFloor(bFloor) || (bt && bt.prop && bt.prop.solid)) return stairProblems.push(`${where}: the tile before its bottom step is not walkable`);
    const lt = readL(landing[0], landing[1], up);
    if (lt && (lt.prop || lt.rug)) return stairProblems.push(`${where}: something stands on its landing`);
    if (edgeWall(before, tiles[0], layer) || edgeWall(tiles[0], tiles[1], layer) || edgeWall(tiles[1], tiles[2], layer) || edgeWall(tiles[2], landing, up)) return stairProblems.push(`${where}: a wall across its run`);
    for (const [x, y] of tiles) {
      const t = readL(x, y, layer);
      if (t && t.prop) return stairProblems.push(`${where}: a ${t.prop.sprite} stands on a step`);
      const a = readL(x, y, up);
      if (a && (a.prop || a.rug)) return stairProblems.push(`${where}: a ${(a.prop || a.rug).sprite} stands over a step`); // the stairwell is cut through nothing authored
    }
    for (const k of mine) stairTaken.add(k);
    const land = getL(landing[0], landing[1], up);
    if (isEngineFloor(land.floor)) land.floor = "floor_wood"; // the stair brings its own landing, a plank floor held up by the stair
    for (const [x, y] of tiles) {
      const t = getL(x, y, layer);
      if (t.floor === EARTH || t.floor === VOID) t.floor = s.floor || (layer < 0 ? "floor_dirt" : "floor_wood"); // a cellar's stair is cut out of the earth
      getL(x, y, up).floor = up === 0 ? HOLE : VOID; // the stairwell
    }
    stairList.push({ id: `stair_${stairList.length}`, layer, at: [x0, y0], dir: s.dir, material: stairKind(s.material).material, tiles, landing, before, building: building.id });
    return 0;
  };
  // placeProp above the map's `placeProp` export: the sheet's slices need the prop placed before the tiles exist.
  const floorRect = (r, offset) => {
    const [x0, y0, w, h] = r.rect;
    for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) get(x + offset[0], y + offset[1]).floor = r.sprite;
    if (r.group && String(r.sprite).startsWith("floor_water")) waterBodies.push({ name: r.group, rect: [x0 + offset[0], y0 + offset[1], w, h] }); // a named water (fishing's tables)
  };
  // Features and loose top-level content. A `fence` feature is a run of walls round a
  // rect's perimeter in a see-through material, with gates (docs/30 step 0): it makes no
  // room, so a fenced field stays outdoors.
  const fence = (f, offset) => {
    const [x0, y0, w, h] = [f.rect[0] + offset[0], f.rect[1] + offset[1], f.rect[2], f.rect[3]];
    const mat = f.wall || "wall_fence";
    const sides = f.sides || ["n", "s", "w", "e"]; // a feature may run on some sides only (a quarry's cliff on three, #196)
    for (let x = x0; x < x0 + w; x++) {
      if (sides.includes("n") && !get(x, y0).n) get(x, y0).n = createWall("wall", mat);
      if (sides.includes("s") && !get(x, y0 + h).n) get(x, y0 + h).n = createWall("wall", mat);
    }
    for (let y = y0; y < y0 + h; y++) {
      if (sides.includes("w") && !get(x0, y).w) get(x0, y).w = createWall("wall", mat);
      if (sides.includes("e") && !get(x0 + w, y).w) get(x0 + w, y).w = createWall("wall", mat);
    }
    for (const g of f.gates || []) {
      const wall = createWall("door", mat);
      if (g.side === "n") get(x0 + g.at, y0).n = wall;
      else if (g.side === "s") get(x0 + g.at, y0 + h).n = wall;
      else if (g.side === "w") get(x0, y0 + g.at).w = wall;
      else if (g.side === "e") get(x0 + w, y0 + g.at).w = wall;
    }
  };
  for (const f of json.features || []) {
    if (f.kind === "fence") fence(f, [0, 0]);
    else floorRect(f, [0, 0]);
  }
  for (const r of json.floorRects || []) floorRect(r, [0, 0]);
  for (const p of json.props || []) placeProp(p, [0, 0]);
  // Sets: everything inside is relative to the set's origin (its rect's corner
  // unless an `origin` is given).
  const buildings = [...(json.buildings || []).map((b) => ({ ...b, origin: [0, 0] }))];
  for (const s of json.sets || []) {
    const origin = setOrigin(s);
    for (const r of s.floorRects || []) floorRect(r, origin);
    for (const f of s.fences || []) fence(f, origin);
    for (const p of s.props || []) placeProp(p, origin);
    for (const b of s.buildings || []) buildings.push({ ...b, origin, set: s.name || null });
  }
  // A building's rooms on one layer: its own on the ground, and each of its `floors` on theirs (docs/49 section 11: `{ layer, rect,
  // floor, wall, openings, partitions, props, brackets }`, a negative layer a cellar). `b` has the building's shape: its rect relative
  // to `origin`, and everything else relative to that rect's corner.
  const lay = (b, origin, layer) => {
    const at = (x, y) => getL(x, y, layer);
    const [bx, by, bw, bh] = [b.rect[0] + origin[0], b.rect[1] + origin[1], b.rect[2], b.rect[3]];
    for (let y = by; y < by + bh; y++) for (let x = bx; x < bx + bw; x++) at(x, y).floor = b.floor || (layer ? "floor_wood" : json.floor);
    // The material: one for all, or one per side (`{ n, s, e, w }`, stone at the back and
    // wood at the front; docs/30 step 0). The renderer's material-change posts handle the corners.
    const matOf = (side) => (typeof b.wall === "string" ? b.wall : (b.wall && (b.wall[side] || b.wall.all)) || WALL_SPRITE_DEFAULT);
    // Perimeter walls. North wall: n edge of the top row. West wall: w edge of
    // the left column. South wall: n edge of the row below. East wall: w edge
    // of the column to the right.
    for (let x = bx; x < bx + bw; x++) {
      at(x, by).n = createWall("wall", matOf("n"));
      at(x, by + bh).n = createWall("wall", matOf("s"));
    }
    for (let y = by; y < by + bh; y++) {
      at(bx, y).w = createWall("wall", matOf("w"));
      at(bx + bw, y).w = createWall("wall", matOf("e"));
    }
    for (const o of b.openings || []) {
      const wall = createWall(o.kind, o.wall || matOf(o.side));
      // An opening's state as authored (docs/30 step 1): `open`, `broken` (a door kicked in: an
      // opening for good), and `boards: { in, out }` nailed on the inside or the outside. The
      // inside of a north or west wall is the near side of its edge; of a south or east, the far.
      if (o.open) { wall.open = true; if (o.kind === "window") wall.shutter = "open"; }
      if (o.broken) { wall.broken = true; wall.hp = 0; if (o.kind === "door") wall.open = true; if (o.kind === "window") wall.shutter = "open"; }
      if (o.boards && !isFence(wall)) { // a fence takes no boards, a gate included (2026-10-24), as map.addBoard
        const inNear = o.side === "n" || o.side === "w";
        const inside = inNear ? wall.boards.near : wall.boards.far;
        const outside = inNear ? wall.boards.far : wall.boards.near;
        for (let i = 0; i < Math.min(BOARDS_PER_SIDE, o.boards.in || 0); i++) inside.push(BOARD_HP);
        for (let i = 0; i < Math.min(BOARDS_PER_SIDE, o.boards.out || 0); i++) outside.push(BOARD_HP);
      }
      if (o.side === "n") at(bx + o.at, by).n = wall;
      else if (o.side === "s") at(bx + o.at, by + bh).n = wall;
      else if (o.side === "w") at(bx, by + o.at).w = wall;
      else if (o.side === "e") at(bx + bw, by + o.at).w = wall;
    }
    // Interior partitions (docs/30 step 0): a run of `len` edges on the `n` or `w` slot
    // starting at a tile inside the building, with openings along it by index, so a house
    // of several rooms is one entry. `{ "edge": "n", "at": [x, y], "len": 4, "openings": [{ "at": 1, "kind": "door" }] }`
    for (const part of b.partitions || []) {
      const mat = part.wall || matOf(part.edge === "n" ? "n" : "w");
      const [px, py] = [bx + part.at[0], by + part.at[1]];
      for (let i = 0; i < part.len; i++) {
        const o = (part.openings || []).find((op) => op.at === i);
        const wall = createWall(o ? o.kind : "wall", mat);
        if (part.edge === "n") at(px + i, py).n = wall;
        else at(px, py + i).w = wall;
      }
    }
    for (const p of b.props || []) placePropOn(p, [bx, by], layer);
    // Brackets: `{ side, at, facing: "in" | "out", torch | lantern }`. The inside of a
    // north or west wall is the near side of its edge (+1); of a south or east
    // wall, the far side (-1).
    for (const br of b.brackets || []) {
      const inSide = br.side === "n" || br.side === "w" ? 1 : -1;
      const side = br.facing === "out" ? -inSide : inSide;
      if (br.side === "n") pendingBrackets.push([bx + br.at, by, "n", side, !!br.torch, !!br.lantern, br.lit !== false, layer]);
      else if (br.side === "s") pendingBrackets.push([bx + br.at, by + bh, "n", side, !!br.torch, !!br.lantern, br.lit !== false, layer]);
      else if (br.side === "w") pendingBrackets.push([bx, by + br.at, "w", side, !!br.torch, !!br.lantern, br.lit !== false, layer]);
      else if (br.side === "e") pendingBrackets.push([bx + bw, by + br.at, "w", side, !!br.torch, !!br.lantern, br.lit !== false, layer]);
    }
    return [bx, by, bw, bh];
  };
  stairList = [];
  stairProblems = [];
  buildingList = [];
  for (const b of buildings) {
    const rect = lay(b, b.origin, 0);
    const rects = { 0: rect };
    for (const f of b.floors || []) {
      const layer = f.layer | 0;
      if (!layer) continue; // the ground's storey is the building itself
      rects[layer] = lay({ ...f, wall: f.wall || b.wall }, b.origin, layer);
    }
    // The building index (docs/49 section 11): every authored building's footprint on each of its layers, kept at load on host and
    // guest alike from the map file every client has; the hiding rule of step 2 reads it, and roofs will.
    buildingList.push({ id: `b${buildingList.length}`, set: b.set || null, rect, rects, layers: Object.keys(rects).map(Number).sort((a, c) => a - c) });
    for (const s of b.stairs || []) layStair(s, [rect[0], rect[1]], buildingList[buildingList.length - 1]);
  }
  // Round rooms (docs/50 section 5): `{ at, size, wall, openings: { n, e, s, w }, floor, layer }`, `at` the square's corner (relative to the
  // set's origin), an opening at a door point "door", "window", or `{ kind, open, broken }`. Its stepped tiles floored, its outline's edges
  // walls carrying its id, its openings keeping the ring under them; one on each layer of a tower is one building in the index, its
  // stepped tiles its footprint. Registered once the map is reset (below).
  const roundList = [];
  const layRound = (rd, origin, set) => {
    const n = rd.size | 0;
    const layer = rd.layer | 0;
    const x0 = rd.at[0] + origin[0];
    const y0 = rd.at[1] + origin[1];
    if (!round.validSize(n)) return stairProblems.push(`a round room at ${x0},${y0} is ${n} across (5 or 7)`);
    const mat = rd.wall || "wall_stone";
    const tag = [x0, y0, n];
    const s = round.shape(x0, y0, n);
    for (const [x, y] of s.stepped) getL(x, y, layer).floor = rd.floor || (layer ? "floor_wood" : "floor_stone");
    for (const [tx, ty, edge] of s.outline) {
      const w = createWall("wall", mat);
      w.round = tag;
      getL(tx, ty, layer)[edge] = w;
    }
    const sides = ["n", "e", "s", "w"];
    for (const [side, o] of Object.entries(rd.openings || {})) {
      const i = sides.indexOf(side);
      const kind = typeof o === "string" ? o : o && o.kind;
      if (i < 0 || (kind !== "door" && kind !== "window")) continue;
      const [tx, ty, edge] = s.doors[i];
      const w = createWall(kind, mat);
      w.underRound = tag;
      w.under = mat; // stamped into the ring's own wall, as a built one is: taken away (broken and replaced, then removed), the ring wall comes back
      if (o && o.open) { w.open = true; if (kind === "window") w.shutter = "open"; }
      if (o && o.broken) { w.broken = true; w.hp = 0; if (kind === "door") w.open = true; if (kind === "window") w.shutter = "open"; }
      getL(tx, ty, layer)[edge] = w;
    }
    roundList.push({ id: round.idOf(x0, y0, layer), x0, y0, n, layer, sprite: mat, built: false, free: false, authored: true });
    const rect = [x0, y0, n, n];
    let b = buildingList.find((q) => q.round && q.rect[0] === x0 && q.rect[1] === y0 && q.rect[2] === n);
    if (!b) buildingList.push((b = { id: `b${buildingList.length}`, set: set || null, rect, rects: {}, layers: [], round: true }));
    b.rects[layer] = rect;
    b.layers = Object.keys(b.rects).map(Number).sort((a, c) => a - c);
    return 0;
  };
  for (const rd of json.rounds || []) layRound(rd, [0, 0], null);
  for (const s of json.sets || []) for (const rd of s.rounds || []) layRound(rd, setOrigin(s), s.name || null);
  indexStairs(); // the stairs as walked (docs/49 step 3)
  const baseFloor = json.floor || "floor_grass";
  // Reserved tiles take no scatter: each building's rectangle plus its
  // `padding` ring (default 1, so a trunk can stand one tile from a wall,
  // which reads as deep woods), and any `reserve` rectangles for yards,
  // fields, and compounds. Michael's CSS-padding idea (2026-10-09).
  const reserved = new Set();
  const reserveRect = (x0, y0, w, h) => {
    for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) reserved.add(key(x, y));
  };
  // A set's footprint may be any shape: a `rect`, a union of `rects`, or a
  // `mask` of text rows ('#' is footprint) at the set's `origin`. The padding
  // ring is the footprint grown outward by `padding` tiles in every direction,
  // which works for concave shapes and courtyards alike (Michael, 2026-10-09).
  for (const s of json.sets || []) {
    const pad = s.padding ?? 1;
    for (const [x, y] of setFootprint(s)) reserveRect(x - pad, y - pad, pad * 2 + 1, pad * 2 + 1);
  }
  for (const b of json.buildings || []) {
    const pad = b.padding ?? 1;
    reserveRect(b.rect[0] - pad, b.rect[1] - pad, b.rect[2] + pad * 2, b.rect[3] + pad * 2);
  }
  for (const r of json.reserve || []) reserveRect(...r);
  for (const rd of json.rounds || []) reserveRect(rd.at[0] - 1, rd.at[1] - 1, (rd.size | 0) + 2, (rd.size | 0) + 2); // a round room and a ring round it (docs/50)
  const zones = json.zones || {};
  for (const sc of json.scatter || []) {
    const zone = sc.zone ? zones[sc.zone] : { kinds: sc.kinds, scale: sc.scale || 8 };
    const [x0, y0, w, h] = sc.rect;
    const footprint = sc.footprint || [1, 1];
    const seed = sc.seed ?? 1;
    for (let y = y0; y < y0 + h; y++) {
      for (let x = x0; x < x0 + w; x++) {
        if (reserved.has(key(x, y))) continue;
        if (hash2(x, y, seed) >= densityAt(sc, zone, x, y)) continue;
        const t = authored.get(key(x, y));
        if (t && (t.floor !== baseFloor || t.prop || t.n || t.w)) continue;
        const sprite = weightedPick(zone.kinds, hash2(x, y, seed + 1));
        if (noTrees && isTreeKind(sprite)) { ghostTrees.add(ghostKey(x, y)); continue; } // Trees off: the pick is made as ever, a tree is simply not placed (forage still counts it)
        placeProp({ sprite, tile: [x, y], footprint, solid: sc.solid !== false, opaque: !!sc.opaque }, [0, 0]);
      }
    }
  }
  let wildRule = null;
  if (json.wild) {
    const zone = json.wild.zone ? zones[json.wild.zone] : { kinds: json.wild.kinds, scale: json.wild.scale || 8 };
    wildRule = { ...json.wild, zone };
  }
  reset({
    floor: baseFloor,
    authored: (x, y) => authored.get(key(x, y)) || null,
    wildRule,
    mapBounds: json.bounds || null,
    layers: Object.fromEntries(layered),
  });
  for (const r of roundList) addRing(r); // the authored rings' records and marks, from the file every client has (docs/50)
  zoneRects = (json.scatter || []).filter((sc) => sc.zone).map((sc) => ({ rect: sc.rect, zone: sc.zone }));
  wildZone = json.wild?.zone || null;
  // Forage inside the bounds, now that the trees and the wild rule are known:
  // on plain base floor with nothing on it. Beyond the bounds wildTile does it.
  forage = json.forage || null;
  if (forage && json.bounds) {
    const [bx, by, bw, bh] = json.bounds;
    for (let y = by; y < by + bh; y++) {
      for (let x = bx; x < bx + bw; x++) {
        const t = authored.get(key(x, y));
        if (t && (t.floor !== baseFloor || t.prop || t.n || t.w)) continue;
        const prop = forageProp(x, y);
        if (!prop) continue;
        props.push(prop);
        get(x, y).prop = prop;
      }
    }
  }
  // The natural resources' areas (docs/46): the reserved tiles kept, the places an area opens to its own kind, and each kind's count made
  // up at generation by the comeback's own rule, on the authored tiles (the valley's stone: the quarry's eight, and the rest at random
  // spots on natural ground). Rolled by hash, never the sim's generator, so the load rolls the same in any order, as the scatter does; a
  // count the map already meets (the ore rocks, the forage's mushrooms) adds nothing, and one it exceeds takes nothing away.
  reservedTiles = reserved;
  readResourceKinds(json);
  // An open place is its footprint less what anything else keeps clear inside it: another set's footprint and padding (the quarryman's
  // hut in the quarry, the miners' hut at the iron workings), a building's rect and padding, a reserve rect.
  openPlaces.clear();
  for (const s of json.sets || []) {
    if (!s.name || !resourceKindList.some((k) => k.open.includes(s.name))) continue;
    const kept = new Set();
    const keep = (x0, y0, w, h) => { for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) kept.add(key(x, y)); };
    for (const o of json.sets || []) {
      if (o === s) continue;
      const pad = o.padding ?? 1;
      for (const [x, y] of setFootprint(o)) keep(x - pad, y - pad, pad * 2 + 1, pad * 2 + 1);
    }
    const origin = setOrigin(s);
    for (const b of [...(json.buildings || []).map((q) => ({ ...q, origin: [0, 0] })), ...(s.buildings || []).map((q) => ({ ...q, origin }))]) {
      const pad = b.padding ?? 1;
      keep(b.rect[0] + b.origin[0] - pad, b.rect[1] + b.origin[1] - pad, b.rect[2] + pad * 2, b.rect[3] + pad * 2);
    }
    for (const r of json.reserve || []) keep(...r);
    openPlaces.set(s.name, new Set(setFootprint(s).map(([x, y]) => key(x, y)).filter((k) => !kept.has(k))));
  }
  const bodiesAt = [json.spawn || [0, 0], ...(json.zombies || []), ...(json.villagers || []).map((v) => v.tile)].map(([x, y]) => ({ gx: x, gy: y }));
  for (const kind of resourceKindList) {
    let have = props.filter((p) => kind.sprites[p.sprite] !== undefined && inResourceArea(kind, p.tile[0], p.tile[1])).length;
    for (let i = 0; have < kind.count && kind.rects.length && i < kind.count * 400; i++) {
      const [x, y] = resourceSpotAt(kind, hash2(i, 1, kind.seed));
      if (resourceSpotProblem(kind, x, y, { live: false, bodies: bodiesAt })) continue;
      let r = 0;
      const prop = makeResourceProp(kind, x, y, () => hash2(i, 2 + r++, kind.seed), `res_${kind.name}_${i}`); // an id from the load's own index, not the world's counter: a count tuned moves no other id
      props.push(prop);
      get(x, y).prop = prop;
      have++;
    }
  }
  // The brackets last: placing one grows its chunk, and a chunk grown before the forage pass took a blank
  // tile wherever nothing was authored, so the forage's mushroom landed on an authored tile that chunk never
  // saw (fifteen ghosts in the registry, found by the sync check, 2026-10-13).
  for (const [tx, ty, edge, side, torch, lantern, lit, layer] of pendingBrackets) addBracket(tx, ty, edge, side, torch, lantern, lit, layer || 0);
  // A crop's rows follow the furrows of the soil it stands in (docs/17), unless
  // the map gave it a facing; the floors are all laid by now.
  for (const prop of props) {
    if (prop.furrowsPending) prop.facing = furrowsOf(getL(prop.tile[0], prop.tile[1], prop.layer || 0).floor) || prop.facing;
    delete prop.furrowsPending;
  }
  // The named sets, for the map panel (docs/33): a name and the box round the footprint; the panel draws the name once any tile in the box is charted.
  const places = [];
  for (const s of json.sets || []) {
    if (!s.name) continue;
    const fp = setFootprint(s);
    if (fp.length < 4) continue; // a one-tile set is a thing (a barrel, a well), not a place
    let [x0, y0, x1, y1] = [Infinity, Infinity, -Infinity, -Infinity];
    for (const [x, y] of fp) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
    places.push({ name: s.name, box: [x0, y0, x1 - x0 + 1, y1 - y0 + 1] });
  }
  return { props, spawn: json.spawn || [0, 0], zombies: json.zombies || [], villagers: json.villagers || [], animals: json.animals || [], places, name: json.name || "map" };
}

// The direction a floor's furrows run ("x" or "y"), or null for a floor without.
export function furrowsOf(floor) {
  try {
    return getDef(floor).furrows || null;
  } catch {
    return null;
  }
}
