// Rooms refound locally (docs/23a, B3): walls built and taken down from the
// console make and unmake rooms, and after every change the local refind agrees
// with a full rebuild. From the console: await __game.check("rooms")
// It pauses the loop, builds on open ground a few tiles from the player, and
// takes every wall down again.

export async function run(game) {
  const G = game;
  const map = G.map;
  const rows = [];
  const wasPaused = G.loop.isPaused();
  G.loop.setPaused(true);
  // Open ground: the first spot east of the player with 4 x 4 free, wall-less tiles.
  const px = Math.round(G.player.gx);
  const py = Math.round(G.player.gy);
  let ox = null;
  let oy = null;
  for (let r = 3; r < 30 && ox === null; r++) {
    for (let dy = -r; dy <= r && ox === null; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        let free = true;
        for (let y = 0; y < 5 && free; y++) for (let x = 0; x < 5; x++) {
          const t = map.tileAt(px + dx + x, py + dy + y);
          if (t.prop || t.n || t.w || t.room !== 0) { free = false; break; }
        }
        if (free) { ox = px + dx; oy = py + dy; break; }
      }
    }
  }
  if (ox === null) {
    G.loop.setPaused(wasPaused);
    return { rows: [{ check: "setup", result: "FAIL", detail: "no 5 x 5 of open ground within 30 tiles" }] };
  }
  const built = [];
  const build = (x, y, edge) => { if (map.buildWall(x, y, edge, "wall")) built.push([x, y, edge]); };
  const agree = (label, expectRooms) => {
    const local = { count: map.roomCount(), inside: map.roomAt(ox + 1, oy + 1), inside2: map.roomAt(ox + 2, oy + 1), outside: map.roomAt(ox - 2, oy - 2) };
    map.rebuildRooms();
    const full = { count: map.roomCount(), inside: map.roomAt(ox + 1, oy + 1), inside2: map.roomAt(ox + 2, oy + 1), outside: map.roomAt(ox - 2, oy - 2) };
    const same = local.count === full.count && (local.inside > 0) === (full.inside > 0) && (local.inside2 > 0) === (full.inside2 > 0) && (local.inside === local.inside2) === (full.inside === full.inside2) && local.outside === 0 && full.outside === 0;
    const ok = same && local.count === expectRooms;
    rows.push({ check: label, result: ok ? "pass" : "FAIL", detail: `local ${JSON.stringify(local)}, full ${JSON.stringify(full)}, expected ${expectRooms} rooms` });
  };
  try {
    map.rebuildRooms();
    const base = map.roomCount();
    // A 2 x 1 yard walled in: the north edges of its two tiles and of the two below, the west edge of the first and of the one past the second.
    build(ox + 1, oy + 1, "n"); build(ox + 2, oy + 1, "n");
    build(ox + 1, oy + 2, "n"); build(ox + 2, oy + 2, "n");
    build(ox + 1, oy + 1, "w");
    agree("three sides up: still the yard", base);
    build(ox + 3, oy + 1, "w");
    agree("the fourth wall makes a room", base + 1);
    build(ox + 2, oy + 1, "w");
    agree("a wall through it makes two", base + 2);
    map.destroyWall(ox + 2, oy + 1, "w");
    built.splice(built.findIndex(([x, y, e]) => x === ox + 2 && y === oy + 1 && e === "w"), 1);
    agree("taken down: one again", base + 1);
    map.destroyWall(ox + 1, oy + 1, "w");
    built.splice(built.findIndex(([x, y, e]) => x === ox + 1 && y === oy + 1 && e === "w"), 1);
    agree("opened to the yard: none", base);
    const t0 = performance.now();
    map.buildWall(ox + 1, oy + 1, "w");
    const localMs = performance.now() - t0;
    const t1 = performance.now();
    map.rebuildRooms();
    const fullMs = performance.now() - t1;
    map.destroyWall(ox + 1, oy + 1, "w");
    rows.push({ check: "cost", result: localMs < fullMs ? "pass" : "FAIL", detail: `a wall built: local refind ${localMs.toFixed(2)} ms, a full rebuild ${fullMs.toFixed(2)} ms` });
  } finally {
    for (const [x, y, e] of built) map.destroyWall(x, y, e);
    map.rebuildRooms();
    G.loop.setPaused(wasPaused);
  }
  return { rows, fails: rows.filter((r) => r.result === "FAIL").length };
}
