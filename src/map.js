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

export const CHUNK = 16;
const ROOM_MAX = 300; // a region bigger than this is outdoors, not a room
const ROUND_BODY_RADIUS = 0.2; // a body's radius against round props; 0.3 against walls

const chunks = new Map(); // "cx,cy" -> { cx, cy, tiles, floorCache, floorDirty }
let source = null; // authored tiles: (x, y) => tile | null
let defaultFloor = "floor_grass";
const rooms = new Map(); // room id -> { id, size, openings: [{ tx, ty, edge }] }
let roomsDirty = true;
// Every prop whose sprite definition declares `fire`, so light can list its
// sources and lit rooms without walking every tile (docs/07-lighting.md).
const fireProps = new Set();
// Beyond the authored bounds the world is wild: forest grown by rule, with a
// few of the dead per chunk (Michael, 2026-10-09). Harvest register, so the
// gloomy one is always a choice of place and never the default.
let wild = null; // { biome: { kinds, scale }, density: [min, max], seed, zombiesPerChunk }
let bounds = null; // [x, y, w, h] of the authored map
const pendingSpawns = []; // [x, y] tiles where a wild chunk wants a zombie

export function reset({ floor = "floor_grass", authored = null, wildRule = null, mapBounds = null } = {}) {
  chunks.clear();
  lastChunk = null;
  rooms.clear();
  source = authored;
  defaultFloor = floor;
  wild = wildRule;
  bounds = mapBounds;
  pendingSpawns.length = 0;
  roomsDirty = true;
}

export function takePendingSpawns() {
  return pendingSpawns.splice(0, pendingSpawns.length);
}

export function fires() {
  return fireProps;
}

// Burning (docs/07): a burner holds logs and burns one per two game hours.
// At zero it goes out. Nothing shuts off on a timer; it burned what you gave it.
export const LOG_SECONDS = 60; // real seconds per log: two hours of a 12-minute day

export function burnFires(dt) {
  for (const p of fireProps) {
    const f = p.fire;
    if (!f.burns || !f.lit) continue;
    f.fuel -= dt / LOG_SECONDS;
    if (f.fuel <= 0) {
      f.fuel = 0;
      f.lit = false;
    }
  }
}

// Light a burner with a log, or add one. Logs are free until the inventory
// exists (Michael, 2026-10-09). Returns false if it is full.
export function feedFire(prop) {
  const f = prop.fire;
  if (!f || !f.burns) return false;
  if (f.fuel >= f.maxFuel) return false;
  f.fuel = Math.min(f.maxFuel, f.fuel + 1);
  f.lit = true;
  return true;
}

// ---- torches: brackets on walls, posts on tiles ----
// A bracket is state on a wall edge: `wall.bracket = { side, torch }`, where
// side is +1 for the near side of the edge (south of a north edge, east of a
// west edge) and -1 for the far side. A post is a prop whose fire `holds` a
// torch. Torches never burn out (docs/02, 2026-10-09).

const bracketSet = new Set(); // { tx, ty, edge, wall }

export function brackets() {
  return bracketSet;
}

export function addBracket(tx, ty, edge, side, torch = false) {
  const wall = tileAt(tx, ty)[edge];
  if (!wall) return null;
  wall.bracket = { side, torch };
  const b = { tx, ty, edge, wall };
  bracketSet.add(b);
  return b;
}

// Where a bracket's torch burns, in grid space: a little off the edge on its side.
export function bracketPos(b) {
  const s = b.wall.bracket.side * 0.3;
  return b.edge === "n" ? [b.tx, b.ty - 0.5 + s] : [b.tx - 0.5 + s, b.ty];
}

export function bracketsNear(gx, gy, r = 1.15) {
  const out = [];
  for (const b of bracketSet) {
    const mx = b.edge === "n" ? b.tx : b.tx - 0.5;
    const my = b.edge === "n" ? b.ty - 0.5 : b.ty;
    const d = Math.hypot(gx - mx, gy - my);
    if (d <= r) out.push({ bracket: b, d, mx, my });
  }
  out.sort((a, b) => a.d - b.d);
  return out;
}

// Holders (posts) within `r` tiles, nearest first.
export function holdersNear(gx, gy, r = 1.3) {
  const out = [];
  for (const p of fireProps) {
    if (!p.fire.holds) continue;
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

export function setHolder(target, has) {
  if (target.kind === "bracket") target.bracket.wall.bracket.torch = has;
  else {
    target.prop.fire.has = has;
    target.prop.fire.lit = has;
  }
}

// Burners within `r` tiles of (gx, gy), nearest first.
export function burnersNear(gx, gy, r = 1.3) {
  const out = [];
  for (const p of fireProps) {
    if (!p.fire.burns) continue;
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

function hash2(x, y, seed) {
  let h = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263) ^ Math.imul(seed | 0, 2246822519);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

// Smooth value noise, 0..1, with lattice points `scale` tiles apart. Density
// drifts with it: thickets and clearings instead of an even sprinkle.
function valueNoise(x, y, scale, seed) {
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

function densityAt(rule, biome, x, y) {
  if (!Array.isArray(rule.density)) return rule.density;
  const [lo, hi] = rule.density;
  return lo + (hi - lo) * valueNoise(x, y, biome.scale || 8, (rule.seed ?? 1) + 7);
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

// A wild tile: forest by the wild rule, or plain grass.
function wildTile(x, y) {
  const t = createTile();
  if (!wild) return t;
  const roll = hash2(x, y, wild.seed ?? 1);
  if (roll < densityAt(wild, wild.biome, x, y)) {
    const kind = weightedPick(wild.biome.kinds, hash2(x, y, (wild.seed ?? 1) + 1));
    t.prop = createProp({ sprite: kind, tile: [x, y] });
  }
  return t;
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
  const t = tileAt(x, y, layer);
  if (!t.items) t.items = [];
  // The entry itself goes on the floor, less its grid position, so a bag
  // keeps everything in it and a belt its slots (docs/11).
  const e = { ...entry };
  delete e.x;
  delete e.y;
  delete e.rot;
  t.items.push(e);
  return e;
}

export function takeItem(x, y, entry, layer = 0) {
  const t = tileAt(x, y, layer);
  if (!t.items) return false;
  const i = t.items.indexOf(entry);
  if (i >= 0) t.items.splice(i, 1);
  if (!t.items.length) t.items = null;
  return i >= 0;
}

// Clear a prop from every tile it stands on. Felling a tree is this plus logs
// on the ground (docs/02: nothing caches a tree anywhere else).
// Stand a prop (lifted with removeProp) with its anchor at (tx, ty). The
// footprint keeps its shape; the caller checks the tiles are clear.
export function placeProp(prop, tx, ty) {
  const [w, h] = prop.footprint;
  prop.tile = [tx, ty];
  prop.tiles = [];
  for (let dy = 0; dy < h; dy++) for (let dx = 0; dx < w; dx++) prop.tiles.push([tx + dx, ty + dy]);
  for (const [x, y] of prop.tiles) tileAt(x, y).prop = prop;
  if (prop.fire) fireProps.add(prop);
  touch();
}

export function removeProp(prop) {
  for (const [tx, ty] of prop.tiles) {
    const t = tileAt(tx, ty);
    if (t.prop === prop) t.prop = null;
  }
  fireProps.delete(prop);
  touch();
}

// A wall segment on a tile edge. kind: "wall" | "door" | "window". A window has
// wooden shutters: closed blocks sight, open lets you see and climb through.
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

// Whether a wall of this kind may be built on the edge: nothing there yet, no
// solid prop whose footprint spans it, and a door needs both its tiles to be
// walkable so it can be walked through.
export function canBuildWall(tx, ty, edge, kind = "wall") {
  if (tileAt(tx, ty)[edge]) return false;
  const [a, b] = edgeTiles(tx, ty, edge);
  const pa = tileAt(a[0], a[1]).prop;
  const pb = tileAt(b[0], b[1]).prop;
  if (pa && pa === pb && pa.solid) return false;
  if (kind === "door" && (!isWalkableTile(a[0], a[1]) || !isWalkableTile(b[0], b[1]))) return false;
  return true;
}

// Build a wall, door, or window on an edge, as an authored one would be, and
// tell sight, light, and the rooms.
export function buildWall(tx, ty, edge, kind, sprite = WALL_SPRITE_DEFAULT) {
  if (tileAt(tx, ty)[edge]) return false;
  tileAt(tx, ty)[edge] = createWall(kind, sprite);
  touch();
  markRoomsDirty();
  return true;
}

export function createWall(kind, sprite) {
  return {
    kind,
    sprite,
    open: false,
    shutter: kind === "window" ? "closed" : null,
    boards: { near: [], far: [] }, // hit points per board, outermost last
    hp: kind === "door" ? DOOR_HP : kind === "window" ? SHUTTER_HP : Infinity,
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

// Nail a board on a side, if there is room. Planks are free until the inventory.
export function addBoard(wall, side) {
  const b = boardsOn(wall, side);
  if (b.length >= BOARDS_PER_SIDE) return false;
  b.push(BOARD_HP);
  touch();
  return true;
}

// Pull a board on a side. It is gone.
export function pullBoard(wall, side) {
  const b = boardsOn(wall, side);
  if (!b.length) return false;
  b.pop();
  touch();
  return true;
}

// Hit the stack from a side. Returns "board", "leaf", or null for what broke,
// after taking `amount` off whatever stands first in attack order.
export function damageOpening(wall, side, amount) {
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
  if (broke) touch();
  return broke;
}

// Can a walking body pass this opening?
export function wayOpen(wall) {
  if (!wall) return true;
  if (boarded(wall)) return false;
  if (wall.kind === "door") return wall.open || wall.broken;
  return false;
}

// Can a body climb through this opening (windows only)?
export function climbable(wall) {
  return !!wall && wall.kind === "window" && !boarded(wall) && (wall.shutter === "open" || wall.broken);
}

// Is a room sealed (docs/09): every door shut and whole or boarded, every
// window shuttered and whole or boarded.
export function roomSealed(room) {
  for (const op of room.openings) {
    const w = tileAt(op.tx, op.ty)[op.edge];
    if (!w) continue;
    if (boarded(w)) continue;
    if (w.broken) return false;
    if (w.kind === "door" && w.open) return false;
    if (w.kind === "window" && w.shutter === "open") return false;
  }
  return true;
}

// The opening of a room nearest to (gx, gy) that an attacker outside the room
// can stand beside: the tile on the attacker's side, which is whichever side
// of the edge is not in the room. Returns { wall, tx, ty, edge, stand, side }.
export function breachTarget(room, gx, gy) {
  // Breaking in from outside, or out from inside: the attacker stands on
  // whichever side of the opening they are on and goes through to the other.
  const inside = tileAt(Math.round(gx), Math.round(gy)).room === room.id;
  let best = null;
  for (const op of room.openings) {
    const w = tileAt(op.tx, op.ty)[op.edge];
    if (!w) continue;
    const nearTile = [op.tx, op.ty];
    const farTile = op.edge === "n" ? [op.tx, op.ty - 1] : [op.tx - 1, op.ty];
    const nearIn = tileAt(nearTile[0], nearTile[1]).room === room.id;
    const roomTile = nearIn ? nearTile : farTile;
    const outTile = nearIn ? farTile : nearTile;
    const stand = inside ? roomTile : outTile;
    const into = inside ? outTile : roomTile;
    const side = stand === nearTile ? 1 : -1;
    if (!isWalkableTile(stand[0], stand[1])) continue;
    const d = Math.hypot(gx - stand[0], gy - stand[1]);
    if (!best || d < best.d) best = { wall: w, tx: op.tx, ty: op.ty, edge: op.edge, stand, side, d, into };
  }
  return best;
}

// Bumped whenever a wall changes state, so sight can be recomputed.
export let worldVersion = 0;
export function touch() {
  worldVersion++;
}

// Numeric keys: string keys allocated on every tile lookup were a measurable
// cost when visibility walked thousands of edges per step (2026-10-09).
const KEY_OFF = 32768;
// Every lookup takes a layer (docs/02, 2026-10-08: layer-ready data from day
// one; docs/08: added 2026-10-09). It is always 0 for now; a chunk on another
// layer is empty and never wild.
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
      let t = layer === 0 && source && source(x, y);
      if (!t) {
        if (layer !== 0 || inBounds(x, y)) t = createTile();
        else {
          t = wildTile(x, y);
          anyWild = true;
        }
      }
      if (t.n || t.w) hasWalls = true;
      tiles[ly * CHUNK + lx] = t;
    }
  }
  c = { cx, cy, layer, tiles, floorCache: null, floorDirty: true };
  chunks.set(k, c);
  lastChunk = c;
  // Open field cannot change any room, so only a chunk with walls (or one whose
  // edge walls a neighbouring room may touch) forces the rooms to be refound.
  if (hasWalls) roomsDirty = true;
  // A wild chunk brings a few of the dead with it, on free tiles.
  if (anyWild && wild && wild.zombiesPerChunk) {
    const [lo, hi] = wild.zombiesPerChunk;
    const n = lo + Math.floor(hash2(cx, cy, (wild.seed ?? 1) + 3) * (hi - lo + 1));
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

// The tile at integer (x, y). Creates the chunk if needed.
export function tileAt(x, y, layer = 0) {
  const cx = Math.floor(x / CHUNK);
  const cy = Math.floor(y / CHUNK);
  const c = getChunk(cx, cy, true, layer);
  return c.tiles[(y - cy * CHUNK) * CHUNK + (x - cx * CHUNK)];
}

// The tile at (x, y) only if its chunk is loaded.
export function peekTile(x, y, layer = 0) {
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
export function wallBetween(x0, y0, x1, y1) {
  if (x1 === x0 + 1) return tileAt(x1, y0).w;
  if (x1 === x0 - 1) return tileAt(x0, y0).w;
  if (y1 === y0 + 1) return tileAt(x0, y1).n;
  if (y1 === y0 - 1) return tileAt(x0, y0).n;
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
  if (wall.kind === "wall") return 0;
  if (boarded(wall)) return 0;
  if (wall.broken) return 1;
  if (wall.kind === "window") return wall.shutter === "closed" ? openingTunables.shutterLeak : 1;
  return wall.open ? 1 : 0;
}

export function blocksSight(wall) {
  return transmission(wall) < 0.5;
}

// Openings (doors and windows) within `r` tiles of (gx, gy), nearest first.
// Each carries the edge midpoint and the tile on the far side from the asker.
export function openingsNear(gx, gy, r = 1.15) {
  const out = [];
  const cx = Math.round(gx);
  const cy = Math.round(gy);
  for (let ty = cy - 2; ty <= cy + 2; ty++) {
    for (let tx = cx - 2; tx <= cx + 2; tx++) {
      const t = tileAt(tx, ty);
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
export function outsideSign(tx, ty, edge) {
  const near = tileAt(tx, ty).room;
  const far = edge === "n" ? tileAt(tx, ty - 1).room : tileAt(tx - 1, ty).room;
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

export function isWalkableTile(x, y) {
  const t = tileAt(x, y);
  return !(t.prop && t.prop.solid);
}

// One tile-to-tile move for pathing. Diagonals need both corner tiles free and
// both L-shaped routes clear of walls, so nothing cuts a wall corner.
export function canStep(x0, y0, x1, y1) {
  const dx = x1 - x0;
  const dy = y1 - y0;
  if (!isWalkableTile(x1, y1)) return false;
  if (dx !== 0 && dy !== 0) {
    if (!isWalkableTile(x0 + dx, y0) || !isWalkableTile(x0, y0 + dy)) return false;
    return !blocksMove(wallBetween(x0, y0, x0 + dx, y0)) && !blocksMove(wallBetween(x0 + dx, y0, x1, y1))
      && !blocksMove(wallBetween(x0, y0, x0, y0 + dy)) && !blocksMove(wallBetween(x0, y0 + dy, x1, y1));
  }
  return !blocksMove(wallBetween(x0, y0, x1, y1));
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

// Circle at float (gx, gy) with radius r against solid props and wall segments.
export function circleBlocked(gx, gy, r) {
  const r2 = r * r;
  const minX = Math.floor(gx - r + 0.5);
  const maxX = Math.floor(gx + r + 0.5);
  const minY = Math.floor(gy - r + 0.5);
  const maxY = Math.floor(gy + r + 0.5);
  for (let ty = minY; ty <= maxY + 1; ty++) {
    for (let tx = minX; tx <= maxX + 1; tx++) {
      const t = tileAt(tx, ty);
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

// The nearest open doorway on the row of north edges `row`, among the tiles
// within one of `x`. Returns its tile x, or null.
function doorOnRow(x, row) {
  let best = null;
  for (const tx of [x, x - 1, x + 1]) {
    const w = tileAt(tx, row).n;
    if (w && w.kind === "door" && wayOpen(w) && (best === null || Math.abs(tx - x) < Math.abs(best - x))) best = tx;
  }
  return best;
}

function doorOnColumn(col, y) {
  let best = null;
  for (const ty of [y, y - 1, y + 1]) {
    const w = tileAt(col, ty).w;
    if (w && w.kind === "door" && wayOpen(w) && (best === null || Math.abs(ty - y) < Math.abs(best - y))) best = ty;
  }
  return best;
}

// Move a circle by (dx, dy) with axis-separated resolution so it slides. If the
// circle is already inside something blocked, movement is unrestricted so it can
// walk out instead of being frozen. Same rule as the cozy parent.
//
// Door magnet: a doorway is one tile wide and a body is 0.6, so walking straight
// at a door only fits when nearly centred. When a step into a wall is blocked
// and an open doorway is within a tile along that wall, the blocked motion
// becomes a slide toward the doorway's centre instead.
// The round prop (trunk, barrel) that blocks a body at (gx, gy), or null.
function roundBlockerAt(gx, gy, r) {
  const cx = Math.round(gx);
  const cy = Math.round(gy);
  let best = null;
  let bestD = Infinity;
  for (let ty = cy - 1; ty <= cy + 1; ty++) {
    for (let tx = cx - 1; tx <= cx + 1; tx++) {
      const p = tileAt(tx, ty).prop;
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

export function moveCircle(gx, gy, r, dx, dy) {
  if (circleBlocked(gx, gy, r)) return { gx: gx + dx, gy: gy + dy };
  // Round things deflect: a step that would hit a trunk slides along its
  // tangent instead of stopping, so two trunks a tile apart funnel you into
  // the gap between them rather than catching you at the edge.
  const tx = gx + dx;
  const ty0 = gy + dy;
  if ((dx !== 0 || dy !== 0) && circleBlocked(tx, ty0, r)) {
    const c = roundBlockerAt(tx, ty0, r);
    if (c) {
      const vx = gx - c[0];
      const vy = gy - c[1];
      const len = Math.hypot(vx, vy) || 1;
      const tangX = -vy / len;
      const tangY = vx / len;
      const s = dx * tangX + dy * tangY;
      const sx = gx + tangX * s;
      const sy = gy + tangY * s;
      if (s !== 0 && !circleBlocked(sx, sy, r)) return { gx: sx, gy: sy };
    }
  }
  let nx = gx + dx;
  let ny = gy;
  if (dx !== 0 && circleBlocked(nx, gy, r)) {
    nx = gx;
    // Blocked crossing a west edge: the column of edges is at the tile we are entering.
    const col = dx > 0 ? Math.round(gx) + 1 : Math.round(gx);
    const door = doorOnColumn(col, Math.round(gy));
    if (door !== null && Math.abs(door - gy) <= 1) {
      const slide = Math.sign(door - gy) * Math.min(Math.abs(door - gy), Math.abs(dx));
      if (slide !== 0 && !circleBlocked(nx, gy + slide, r)) ny = gy + slide;
    }
  }
  const ty = ny + dy;
  if (dy !== 0 && circleBlocked(nx, ty, r)) {
    const row = dy > 0 ? Math.round(ny) + 1 : Math.round(ny);
    const door = doorOnRow(Math.round(nx), row);
    if (door !== null && Math.abs(door - nx) <= 1) {
      const slide = Math.sign(door - nx) * Math.min(Math.abs(door - nx), Math.abs(dy));
      if (slide !== 0 && !circleBlocked(nx + slide, ny, r)) nx += slide;
    }
  } else {
    ny = ty;
  }
  return { gx: nx, gy: ny };
}

// Nearest walkable tile to (x, y), in expanding rings.
export function nearestWalkable(x, y, occupied = () => false, maxRing = 12) {
  for (let ring = 0; ring <= maxRing; ring++) {
    for (let dy = -ring; dy <= ring; dy++) {
      for (let dx = -ring; dx <= ring; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== ring) continue;
        if (isWalkableTile(x + dx, y + dy) && !occupied(x + dx, y + dy)) return [x + dx, y + dy];
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

export function rebuildRooms() {
  roomsDirty = false;
  rooms.clear();
  // Outdoors is marked with its own value during the pass. A first version set
  // finished outdoor tiles back to 0, the same as "not visited", so every grass
  // tile started a new fill over the whole outdoors: 1.6 s for 16 chunks, and
  // the freeze Michael saw when walking into new ground (2026-10-09).
  for (const c of chunks.values()) for (const t of c.tiles) t.room = UNVISITED;
  let nextId = 1;
  for (const c of chunks.values()) {
    for (let i = 0; i < c.tiles.length; i++) {
      const t0 = c.tiles[i];
      if (t0.room !== UNVISITED) continue;
      const x0 = c.cx * CHUNK + (i % CHUNK);
      const y0 = c.cy * CHUNK + Math.floor(i / CHUNK);
      const id = nextId;
      const region = [];
      const stack = [x0, y0];
      t0.room = id;
      let outdoors = false;
      // The doors and windows the fill touched, so light can ask how much
      // daylight a room's openings admit (docs/07-lighting.md).
      const openings = [];
      const seenEdges = new Set();
      while (stack.length) {
        const y = stack.pop();
        const x = stack.pop();
        region.push(x, y);
        if (region.length > ROOM_MAX * 2) outdoors = true;
        for (const [dx, dy] of STEPS4) {
          const nx = x + dx;
          const ny = y + dy;
          const nt = peekTile(nx, ny);
          if (!nt) {
            outdoors = true;
            continue;
          }
          const wall = wallBetween(x, y, nx, ny);
          if (wall) {
            // any wall bounds a room
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
          if (nt.room !== UNVISITED) continue;
          nt.room = id;
          stack.push(nx, ny);
        }
      }
      if (outdoors) {
        for (let j = 0; j < region.length; j += 2) peekTile(region[j], region[j + 1]).room = OUTDOORS;
      } else {
        rooms.set(id, { id, size: region.length / 2, openings });
        nextId++;
      }
    }
  }
  for (const c of chunks.values()) for (const t of c.tiles) if (t.room < 0) t.room = 0;
}

export function roomsIfDirty() {
  if (roomsDirty) rebuildRooms();
}

export function roomAt(x, y) {
  roomsIfDirty();
  return tileAt(x, y).room;
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
    sprite: def.sprite,
    tile: [ox, oy],
    footprint: [w, h],
    tiles,
    solid: def.solid !== false,
    opaque: !!def.opaque,
    radius: w === 1 && h === 1 ? radius : 0,
    fire: null,
    // docs/10: a container has a bag made on first search from its loot
    // table; a tree has wood to chop; the well has water.
    container: sdef.container ? { ...sdef.container } : null,
    bag: null,
    searched: false,
    wood: sdef.wood || 0,
    water: !!sdef.water,
  };
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
      holds, // "torch": a post, lit while it holds one
      has,
      lit: holds ? has : def.lit ?? f.lit ?? !f.burns,
      fuel: def.fuel ?? f.fuel ?? 0,
      maxFuel: f.maxFuel ?? 4,
      flicker: f.flicker || null, // { amp, speed }: applied when the light map is composed on the GPU (docs/08)
    };
    fireProps.add(prop);
  }
  return prop;
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
// forest and its dead are grown well outside the viewport, never in it.
export function ensureAround(x, y, radius = 3) {
  const [cx, cy] = chunkCoord(Math.round(x), Math.round(y));
  for (let dy = -radius; dy <= radius; dy++) for (let dx = -radius; dx <= radius; dx++) getChunk(cx + dx, cy + dy);
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
export function loadMap(json) {
  fireProps.clear(); // props are created below, before reset() runs
  bracketSet.clear();
  const pendingBrackets = []; // [tx, ty, edge, side, torch], added once the map is live
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
    const prop = createProp(def, offset);
    props.push(prop);
    for (const [tx, ty] of prop.tiles) get(tx, ty).prop = prop;
  };
  const floorRect = (r, offset) => {
    const [x0, y0, w, h] = r.rect;
    for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) get(x + offset[0], y + offset[1]).floor = r.sprite;
  };
  // Features and loose top-level content.
  for (const f of json.features || []) floorRect(f, [0, 0]);
  for (const r of json.floorRects || []) floorRect(r, [0, 0]);
  for (const p of json.props || []) placeProp(p, [0, 0]);
  // Sets: everything inside is relative to the set's origin (its rect's corner
  // unless an `origin` is given).
  const buildings = [...(json.buildings || []).map((b) => ({ ...b, origin: [0, 0] }))];
  for (const s of json.sets || []) {
    const origin = setOrigin(s);
    for (const r of s.floorRects || []) floorRect(r, origin);
    for (const p of s.props || []) placeProp(p, origin);
    for (const b of s.buildings || []) buildings.push({ ...b, origin });
  }
  for (const b of buildings) {
    const [bx, by, bw, bh] = [b.rect[0] + b.origin[0], b.rect[1] + b.origin[1], b.rect[2], b.rect[3]];
    for (let y = by; y < by + bh; y++) for (let x = bx; x < bx + bw; x++) get(x, y).floor = b.floor || json.floor;
    // Perimeter walls. North wall: n edge of the top row. West wall: w edge of
    // the left column. South wall: n edge of the row below. East wall: w edge
    // of the column to the right.
    for (let x = bx; x < bx + bw; x++) {
      get(x, by).n = createWall("wall", b.wall);
      get(x, by + bh).n = createWall("wall", b.wall);
    }
    for (let y = by; y < by + bh; y++) {
      get(bx, y).w = createWall("wall", b.wall);
      get(bx + bw, y).w = createWall("wall", b.wall);
    }
    for (const o of b.openings || []) {
      const wall = createWall(o.kind, b.wall);
      if (o.side === "n") get(bx + o.at, by).n = wall;
      else if (o.side === "s") get(bx + o.at, by + bh).n = wall;
      else if (o.side === "w") get(bx, by + o.at).w = wall;
      else if (o.side === "e") get(bx + bw, by + o.at).w = wall;
    }
    for (const p of b.props || []) placeProp(p, [bx, by]);
    // Brackets: `{ side, at, facing: "in" | "out", torch }`. The inside of a
    // north or west wall is the near side of its edge (+1); of a south or east
    // wall, the far side (-1).
    for (const br of b.brackets || []) {
      const inSide = br.side === "n" || br.side === "w" ? 1 : -1;
      const side = br.facing === "out" ? -inSide : inSide;
      if (br.side === "n") pendingBrackets.push([bx + br.at, by, "n", side, !!br.torch]);
      else if (br.side === "s") pendingBrackets.push([bx + br.at, by + bh, "n", side, !!br.torch]);
      else if (br.side === "w") pendingBrackets.push([bx, by + br.at, "w", side, !!br.torch]);
      else if (br.side === "e") pendingBrackets.push([bx + bw, by + br.at, "w", side, !!br.torch]);
    }
  }
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
  const biomes = json.biomes || {};
  for (const sc of json.scatter || []) {
    const biome = sc.biome ? biomes[sc.biome] : { kinds: sc.kinds, scale: sc.scale || 8 };
    const [x0, y0, w, h] = sc.rect;
    const footprint = sc.footprint || [1, 1];
    const seed = sc.seed ?? 1;
    for (let y = y0; y < y0 + h; y++) {
      for (let x = x0; x < x0 + w; x++) {
        if (reserved.has(key(x, y))) continue;
        if (hash2(x, y, seed) >= densityAt(sc, biome, x, y)) continue;
        const t = authored.get(key(x, y));
        if (t && (t.floor !== baseFloor || t.prop || t.n || t.w)) continue;
        placeProp({ sprite: weightedPick(biome.kinds, hash2(x, y, seed + 1)), tile: [x, y], footprint, solid: sc.solid !== false, opaque: !!sc.opaque }, [0, 0]);
      }
    }
  }
  let wildRule = null;
  if (json.wild) {
    const biome = json.wild.biome ? biomes[json.wild.biome] : { kinds: json.wild.kinds, scale: json.wild.scale || 8 };
    wildRule = { ...json.wild, biome };
  }
  reset({
    floor: baseFloor,
    authored: (x, y) => authored.get(key(x, y)) || null,
    wildRule,
    mapBounds: json.bounds || null,
  });
  for (const [tx, ty, edge, side, torch] of pendingBrackets) addBracket(tx, ty, edge, side, torch);
  return { props, spawn: json.spawn || [0, 0], zombies: json.zombies || [], name: json.name || "map" };
}
