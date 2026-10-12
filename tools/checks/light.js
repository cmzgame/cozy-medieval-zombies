// The light cache versioned per chunk (docs/23a, B4): at midnight, a wall
// built between a source and a lit tile darkens the tile on the next step and
// its removal lights it again (the cache noticed the change), while a wall
// built far across the map leaves it alone and rebuilds nothing near it. From
// the console: await __game.check("light")
// It pauses the loop, moves the clock to midnight, builds and removes walls
// from the console, and puts the clock and the pause back.

export async function run(game) {
  const G = game;
  const map = G.map;
  const rows = [];
  const wasPaused = G.loop.isPaused();
  const hour0 = G.clock.getHour();
  const built = [];
  const build = (x, y, e) => { if (map.buildWall(x, y, e, "wall")) built.push([x, y, e]); };
  const unbuild = (x, y, e) => { map.destroyWall(x, y, e); const i = built.findIndex(([a, b, c]) => a === x && b === y && c === e); if (i >= 0) built.splice(i, 1); };
  const step = () => G.loop.advance(1 / 60);
  try {
    G.loop.setPaused(true);
    G.clock.setHour(0);
    step();
    // A flame outdoors with open ground east of it and a pool that reaches two
    // tiles (a campfire, a torch post; a lantern's 1.5 does not), the one farthest
    // from the first room's door, so the door test below is a far one.
    const room = [...map.allRooms()][0];
    const doorOf = room && room.openings.map((o) => ({ o, w: map.tileAt(o.tx, o.ty)[o.edge] })).find(({ w }) => w && w.kind === "door");
    const open = (s) => s.kind !== "portal" && s.radius >= 3 && map.roomAt(Math.round(s.gx), Math.round(s.gy)) === 0 && !map.tileAt(Math.round(s.gx) + 2, Math.round(s.gy)).prop && !map.tileAt(Math.round(s.gx) + 1, Math.round(s.gy)).prop;
    const dist = (s) => (doorOf ? Math.max(Math.abs(doorOf.o.tx - s.gx), Math.abs(doorOf.o.ty - s.gy)) : 0);
    const src = G.light.sources().filter(open).sort((a, b) => dist(b) - dist(a))[0];
    if (!src) return { rows: [{ check: "setup", result: "FAIL", detail: "no outdoor flame of radius 3 or more with open ground east of it" }] };
    const sx = Math.round(src.gx);
    const sy = Math.round(src.gy);
    const tx = sx + 2;
    const ty = sy;
    const lit = G.light.lightAt(tx, ty);
    rows.push({ check: "a tile two east of a flame is lit at midnight", result: lit > 0.3 ? "pass" : "FAIL", detail: `${src.kind} at ${sx},${sy}: ${lit.toFixed(2)}` });
    // A wall between them: the west edge of the tile past the flame.
    build(sx + 1, sy, "w");
    step();
    const shadowed = G.light.lightAt(tx, ty);
    rows.push({ check: "a wall built between darkens it on the next step", result: shadowed < lit - 0.2 ? "pass" : "FAIL", detail: `${lit.toFixed(2)} -> ${shadowed.toFixed(2)}` });
    unbuild(sx + 1, sy, "w");
    step();
    const back = G.light.lightAt(tx, ty);
    rows.push({ check: "taken down, it is lit again", result: Math.abs(back - lit) < 0.02 ? "pass" : "FAIL", detail: `${back.toFixed(2)}` });
    // A wall far away: the chunk by the flame keeps its version, so its map is not rebuilt.
    const [cx, cy] = map.chunkCoord(sx, sy);
    const before = G.light.chunkLight(cx, cy);
    build(sx + 60, sy + 60, "n");
    step();
    const after = G.light.chunkLight(cx, cy);
    rows.push({ check: "a wall built sixty tiles away rebuilds nothing here", result: after === before ? "pass" : "FAIL", detail: after === before ? "the same cache entry" : "the chunk's light map was rebuilt" });
    unbuild(sx + 60, sy + 60, "n");
    step();
    // A door toggled across the village (the old rule rebuilt every chunk).
    const door = doorOf;
    if (door) {
      const entry0 = G.light.chunkLight(cx, cy);
      const far = Math.max(Math.abs(door.o.tx - sx), Math.abs(door.o.ty - sy)) > 20;
      door.w.open = !door.w.open;
      map.touch(door.o.tx, door.o.ty);
      step();
      const entry1 = G.light.chunkLight(cx, cy);
      door.w.open = !door.w.open;
      map.touch(door.o.tx, door.o.ty);
      step();
      rows.push({ check: "a door toggled elsewhere", result: far ? (entry1 === entry0 ? "pass" : "FAIL") : "skip", detail: far ? (entry1 === entry0 ? "the flame's chunk kept its map" : "the flame's chunk was rebuilt") : `the door at ${door.o.tx},${door.o.ty} is within 20 tiles of the flame; not a far test` });
    }
  } finally {
    for (const [x, y, e] of built) map.destroyWall(x, y, e);
    G.clock.setHour(hour0);
    step();
    G.loop.setPaused(wasPaused);
  }
  return { rows, fails: rows.filter((r) => r.result === "FAIL").length };
}
