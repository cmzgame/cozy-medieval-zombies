// The map: one continuous tile grid stored block by block. See docs/03-world-model.md.
//
// Walls sit on tile edges, Zomboid style: every tile has a slot for a wall on its
// north edge (`n`) and its west edge (`w`). A building's south wall is the north
// wall of the tiles just south of it, and its east wall is the west wall of the
// tiles just east. A door or a window is a wall with a different kind and state.
//
// A chunk that nobody authored is open field. Chunks are created on demand, so
// the field goes on forever and the camera never shows the void.

export const CHUNK = 16;
const ROOM_MAX = 300; // a region bigger than this is outdoors, not a room

const chunks = new Map(); // "cx,cy" -> { cx, cy, tiles, floorCache, floorDirty }
let source = null; // authored tiles: (x, y) => tile | null
let defaultFloor = "floor_grass";
const rooms = new Map(); // room id -> { id, size }
let roomsDirty = true;

export function reset({ floor = "floor_grass", authored = null } = {}) {
  chunks.clear();
  lastChunk = null;
  rooms.clear();
  source = authored;
  defaultFloor = floor;
  roomsDirty = true;
}

export function createTile(floor = defaultFloor) {
  return { floor, n: null, w: null, prop: null, room: 0 };
}

// A wall segment on a tile edge. kind: "wall" | "door" | "window". A window has
// wooden shutters: closed blocks sight, open lets you see and climb through.
export function createWall(kind, sprite) {
  return { kind, sprite, open: false, shutter: kind === "window" ? "closed" : null };
}

// Bumped whenever a wall changes state, so sight can be recomputed.
export let worldVersion = 0;
export function touch() {
  worldVersion++;
}

// Numeric keys: string keys allocated on every tile lookup were a measurable
// cost when visibility walked thousands of edges per step (2026-10-09).
const KEY_OFF = 32768;
export function chunkKey(cx, cy) {
  return (cx + KEY_OFF) * 65536 + (cy + KEY_OFF);
}

export function chunkCoord(x, y) {
  return [Math.floor(x / CHUNK), Math.floor(y / CHUNK)];
}

let lastChunk = null; // most lookups hit the same chunk as the last one

export function getChunk(cx, cy, create = true) {
  if (lastChunk && lastChunk.cx === cx && lastChunk.cy === cy) return lastChunk;
  const k = chunkKey(cx, cy);
  let c = chunks.get(k);
  if (c) lastChunk = c;
  if (c || !create) return c || null;
  const tiles = new Array(CHUNK * CHUNK);
  let hasWalls = false;
  for (let ly = 0; ly < CHUNK; ly++) {
    for (let lx = 0; lx < CHUNK; lx++) {
      const x = cx * CHUNK + lx;
      const y = cy * CHUNK + ly;
      const t = (source && source(x, y)) || createTile();
      if (t.n || t.w) hasWalls = true;
      tiles[ly * CHUNK + lx] = t;
    }
  }
  c = { cx, cy, tiles, floorCache: null, floorDirty: true };
  chunks.set(k, c);
  lastChunk = c;
  // Open field cannot change any room, so only a chunk with walls (or one whose
  // edge walls a neighbouring room may touch) forces the rooms to be refound.
  if (hasWalls) roomsDirty = true;
  return c;
}

export function loadedChunks() {
  return chunks.values();
}

// The tile at integer (x, y). Creates the chunk if needed.
export function tileAt(x, y) {
  const cx = Math.floor(x / CHUNK);
  const cy = Math.floor(y / CHUNK);
  const c = getChunk(cx, cy);
  return c.tiles[(y - cy * CHUNK) * CHUNK + (x - cx * CHUNK)];
}

// The tile at (x, y) only if its chunk is loaded.
export function peekTile(x, y) {
  const c = getChunk(Math.floor(x / CHUNK), Math.floor(y / CHUNK), false);
  if (!c) return null;
  return c.tiles[(y - c.cy * CHUNK) * CHUNK + (x - c.cx * CHUNK)];
}

// ---- walls on edges ----

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
  if (wall.kind === "door") return !wall.open;
  return true; // walls and glass
}

export function blocksSight(wall) {
  if (!wall) return false;
  if (wall.kind === "window") return wall.shutter === "closed";
  if (wall.kind === "door") return !wall.open;
  return true;
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
  if (wall.kind === "door" && wall.open) return null;
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
        // Tile square spans [tx - 0.5, tx + 0.5]. Closest point to the circle centre:
        const cx = Math.max(tx - 0.5, Math.min(gx, tx + 0.5));
        const cy = Math.max(ty - 0.5, Math.min(gy, ty + 0.5));
        const dx = gx - cx;
        const dy = gy - cy;
        if (dx * dx + dy * dy < r2) return true;
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
    if (w && w.kind === "door" && w.open && (best === null || Math.abs(tx - x) < Math.abs(best - x))) best = tx;
  }
  return best;
}

function doorOnColumn(col, y) {
  let best = null;
  for (const ty of [y, y - 1, y + 1]) {
    const w = tileAt(col, ty).w;
    if (w && w.kind === "door" && w.open && (best === null || Math.abs(ty - y) < Math.abs(best - y))) best = ty;
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
export function moveCircle(gx, gy, r, dx, dy) {
  if (circleBlocked(gx, gy, r)) return { gx: gx + dx, gy: gy + dy };
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
          if (nt.room !== UNVISITED) continue;
          if (wallBetween(x, y, nx, ny)) continue; // any wall bounds a room
          nt.room = id;
          stack.push(nx, ny);
        }
      }
      if (outdoors) {
        for (let j = 0; j < region.length; j += 2) peekTile(region[j], region[j + 1]).room = OUTDOORS;
      } else {
        rooms.set(id, { id, size: region.length / 2 });
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
// A map file is grass plus floor rectangles, free props, and buildings: a
// rectangle of interior tiles with walls on its perimeter edges, openings in
// those walls, its own floor, and props placed relative to its corner. See
// data/maps/square.json. The result is sliced into chunks on first load.

export function createProp(def, offset = [0, 0]) {
  const [w, h] = def.footprint || [1, 1];
  const ox = def.tile[0] + offset[0];
  const oy = def.tile[1] + offset[1];
  const tiles = [];
  for (let dy = 0; dy < h; dy++) for (let dx = 0; dx < w; dx++) tiles.push([ox + dx, oy + dy]);
  return {
    kind: "prop",
    sprite: def.sprite,
    tile: [ox, oy],
    footprint: [w, h],
    tiles,
    solid: def.solid !== false,
    opaque: !!def.opaque,
  };
}

// Seeded random, so a map's scatter grows the same way every load (mulberry32).
function seededRandom(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
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

// Build an authored-tile lookup from a map file, then reset the map onto it.
// Authored: floors, roads, buildings, placed props. Scattered: filler such as
// trees, by rule (a rectangle, a density, a mix of kinds, a seed), only onto
// the default floor, never on or beside a wall, never on a placed prop.
// Michael (2026-10-09): author the roads, buildings, and any water; scatter
// the rest.
export function loadMap(json) {
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
  for (const r of json.floorRects || []) {
    const [x0, y0, w, h] = r.rect;
    for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) get(x, y).floor = r.sprite;
  }
  const props = [];
  const placeProp = (def, offset) => {
    const prop = createProp(def, offset);
    props.push(prop);
    for (const [tx, ty] of prop.tiles) get(tx, ty).prop = prop;
  };
  for (const p of json.props || []) placeProp(p, [0, 0]);
  for (const b of json.buildings || []) {
    const [bx, by, bw, bh] = b.rect;
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
  }
  const baseFloor = json.floor || "floor_grass";
  const hasWallNear = (x, y) => {
    const t = authored.get(key(x, y));
    if (t && (t.n || t.w)) return true;
    const e = authored.get(key(x + 1, y));
    if (e && e.w) return true;
    const s = authored.get(key(x, y + 1));
    if (s && s.n) return true;
    return false;
  };
  for (const sc of json.scatter || []) {
    const rnd = seededRandom(sc.seed ?? 1);
    const [x0, y0, w, h] = sc.rect;
    const footprint = sc.footprint || [1, 1];
    for (let y = y0; y < y0 + h; y++) {
      for (let x = x0; x < x0 + w; x++) {
        const roll = rnd();
        const kindRoll = rnd();
        if (roll >= sc.density) continue;
        const t = authored.get(key(x, y));
        if (t && (t.floor !== baseFloor || t.prop)) continue;
        if (t && t.room !== 0) continue;
        if (hasWallNear(x, y)) continue;
        placeProp({ sprite: weightedPick(sc.kinds, kindRoll), tile: [x, y], footprint, solid: sc.solid !== false, opaque: !!sc.opaque }, [0, 0]);
      }
    }
  }
  reset({ floor: baseFloor, authored: (x, y) => authored.get(key(x, y)) || null });
  return { props, spawn: json.spawn || [0, 0], zombies: json.zombies || [], name: json.name || "map" };
}
