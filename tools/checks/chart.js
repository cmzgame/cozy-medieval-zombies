// The chart (docs/33, #203; part 2's panel rows are `check("map")`'s). From the console, on a tab with `?nosave`:
//   await __game.check("chart")
// It reads what the world has charted of itself: the spawn's surroundings and nothing past the radius; a tile behind a shut wall is not charted and is
// once a door in it is open; a wall built (with the built flag) and taken down, a tilled tile, and a felled tree change their cells; a wild chunk dropped by
// eviction keeps its chart; serialize, restore, serialize is the same; the chart is the world's, not a player's; and the reveal's cost in open land. The
// chart, the player, and the map it builds on are put back (the chart from its own save).

export async function run(game) {
  const G = game;
  const map = G.map;
  const S = G.game.state;
  const chart = await import("/src/chart.js");
  const rows = [];
  const row = (check, ok, detail) => rows.push({ check, result: ok ? "pass" : "FAIL", detail });
  const me = G.player;
  const meAt = [me.gx, me.gy];
  const chart0 = JSON.stringify(chart.serialize());
  const aggro0 = G.rules.rules.zombieAggro;
  const wasPaused = G.loop.isPaused();
  const step = (n = 1) => { for (let i = 0; i < n; i++) G.loop.advance(1 / 60); };
  const made = [];
  const restore = [];
  const T = G.tuning.world;
  const surface = (x, y) => chart.surfaceOfCell(chart.cellAt(x, y));
  try {
    G.loop.setPaused(true);
    G.rules.rules.zombieAggro = false; // the dead near a spot this check stands on must not bite it mid-run
    // 1. A fresh chart: the spawn's surroundings after a step and nothing beyond the radius.
    chart.restore({ chunks: [] });
    for (const p of S.players) p.chartTile = null;
    G.teleport(S.info.spawn[0] + 0.1, S.info.spawn[1] + 0.1);
    step();
    let near = 0;
    let far = 0;
    for (const c of chart.chartedChunks()) for (let i = 0; i < 256; i++) if (chart.surfaceOfCell(c.cells[i])) { // surfaces: a wall-only cell may lie one tile past the radius
      const x = c.cx * 16 + (i % 16);
      const y = c.cy * 16 + Math.floor(i / 16);
      if (Math.hypot(x - me.gx, y - me.gy) <= T.chartRadius + 0.5) near++; else far++;
    }
    row("a fresh chart has charted the spawn's surroundings after one step, and nothing beyond the radius", near > 5 && far === 0 && surface(S.info.spawn[0] + 40, S.info.spawn[1] + 40) === 0, `${near} tiles charted within ${T.chartRadius}, ${far} beyond`);

    // A patch of bare grass in open land, with room round it.
    let at = null;
    map.ensureAround(me.gx, me.gy, 4);
    for (let dy = -30; dy <= 30 && !at; dy += 2) for (let dx = -30; dx <= 30 && !at; dx += 2) {
      const x = Math.round(me.gx) + dx;
      const y = Math.round(me.gy) + dy;
      let ok = true;
      for (let ay = -5; ay <= 5 && ok; ay++) for (let ax = -5; ax <= 8 && ok; ax++) { const t = map.peekTile(x + ax, y + ay); ok = !!t && t.floor === "floor_grass" && !t.prop && !t.n && !t.w; }
      if (ok) at = [x, y];
    }
    if (!at) throw new Error("no open grass for the check");
    const [x, y] = at;
    chart.restore({ chunks: [] });
    for (const p of S.players) p.chartTile = null;
    const column = (sprite) => { for (let dy = -4; dy <= 4; dy++) map.buildWall(x + 2, y + dy, "w", "wall", sprite); };
    const unwall = () => { for (let dy = -4; dy <= 4; dy++) map.destroyWall(x + 2, y + dy, "w"); };
    restore.push(unwall);
    column("wall_wood");
    G.teleport(x + 0.1, y + 0.1);
    step();
    row("2. a tile behind a shut wall is not charted, and the tiles on this side are", surface(x + 4, y) === 0 && surface(x, y) > 0 && surface(x - 3, y) > 0, `behind ${surface(x + 4, y)}, here ${surface(x, y)}`);
    map.buildWall(x + 2, y, "w", "door", "wall_wood");
    const door = map.tileAt(x + 2, y).w;
    door.open = false;
    map.touch(x + 2, y);
    step(2);
    const shutDoor = surface(x + 4, y);
    // Opened where the player stands (no step to another tile, the tile marker as it was): the tiles now in line of sight are charted at the next step.
    door.open = true;
    map.touch(x + 2, y);
    step();
    row("opened while standing still, the door shows the tiles now in line of sight (and shut it showed none)", shutDoor === 0 && surface(x + 4, y) > 0 && surface(x + 6, y) > 0, `shut ${shutDoor}; through the door: ${surface(x + 4, y)}, ${surface(x + 6, y)}; beside it ${surface(x + 4, y + 3)} (still hidden)`);

    // 3. A wall built in a charted place changes its cell, with the built flag; removing it changes it back.
    unwall();
    step();
    const open0 = chart.cellAt(x + 2, y + 1);
    map.buildWall(x + 2, y + 1, "w", "wall", "wall_wood");
    map.touch(x + 2, y + 1);
    step();
    const built = chart.cellAt(x + 2, y + 1);
    map.destroyWall(x + 2, y + 1, "w");
    step();
    const gone = chart.cellAt(x + 2, y + 1);
    row("a wall built in a charted place changes its cell on the next step, with the built flag; taken down it changes back", chart.westWall(open0) === 0 && (chart.westWall(built) & 7) === 1 && (chart.westWall(built) & 8) === 8 && chart.westWall(gone) === 0, `${chart.westWall(open0)} then ${chart.westWall(built)} then ${chart.westWall(gone)}`);

    // A building's far faces: the north face (owned by tiles inside it) is charted from outside, and the west face too, while the tiles inside stay unseen; from inside the same for the south and east.
    for (let dx = 0; dx <= 2; dx++) map.buildWall(x + dx, y + 2, "n", "wall", "wall_wood"); // a north face along y + 2 for x to x + 2
    for (let dy = 0; dy <= 1; dy++) map.buildWall(x + 4, y + dy, "w", "wall", "wall_wood"); // a west face along x + 4 for y to y + 1
    restore.push(() => { for (let dx = 0; dx <= 2; dx++) map.destroyWall(x + dx, y + 2, "n"); for (let dy = 0; dy <= 1; dy++) map.destroyWall(x + 4, y + dy, "w"); });
    chart.restore({ chunks: [] });
    for (const p of S.players) p.chartTile = null;
    G.teleport(x + 0.1, y - 1.9);
    step();
    const northFace = [0, 1, 2].map((dx) => chart.northWall(chart.cellAt(x + dx, y + 2)));
    const westFace = [0, 1].map((dy) => chart.westWall(chart.cellAt(x + 4, y + dy)));
    row("a building's north and west faces seen from outside are charted, with the tiles behind them still unseen", northFace.every((k) => (k & 7) === 1) && westFace.every((k) => (k & 7) === 1) && surface(x + 1, y + 3) === 0 && surface(x + 5, y + 1) === 0, `north face ${northFace}, west face ${westFace}; behind them ${surface(x + 1, y + 3)}, ${surface(x + 5, y + 1)}`);
    for (let dx = 0; dx <= 2; dx++) map.destroyWall(x + dx, y + 2, "n");
    for (let dy = 0; dy <= 1; dy++) map.destroyWall(x + 4, y + dy, "w");
    // From inside: a south face along y + 2 and an east face along x + 4 (the walls of the outside tiles' `n` and `w`), seen from within.
    for (let dx = 0; dx <= 2; dx++) map.buildWall(x + dx, y + 3, "n", "wall", "wall_wood"); // south face of the row y + 2
    for (let dy = 0; dy <= 1; dy++) map.buildWall(x + 3, y + dy, "w", "wall", "wall_wood"); // east face of the column x + 2
    chart.restore({ chunks: [] });
    for (const p of S.players) p.chartTile = null;
    G.teleport(x + 1.1, y + 2.1); // inside the box the faces make, near its south-east corner
    step();
    const southFace = [0, 1, 2].map((dx) => chart.northWall(chart.cellAt(x + dx, y + 3)));
    const eastFace = [0, 1].map((dy) => chart.westWall(chart.cellAt(x + 3, y + dy)));
    row("and the south and east faces seen from inside (the cells of the tiles outside, unseen)", southFace.every((k) => (k & 7) === 1) && eastFace.every((k) => (k & 7) === 1), `south face ${southFace}, east face ${eastFace}`);
    for (let dx = 0; dx <= 2; dx++) map.destroyWall(x + dx, y + 3, "n");
    for (let dy = 0; dy <= 1; dy++) map.destroyWall(x + 3, y + dy, "w");
    chart.restore({ chunks: [] });
    for (const p of S.players) p.chartTile = null;
    G.teleport(x + 0.1, y + 0.1);
    step();

    // 4. A tilled tile and a felled tree change their cells.
    const grass = surface(x - 1, y + 3);
    map.setFloor(x - 1, y + 3, "floor_farm");
    restore.push(() => map.setFloor(x - 1, y + 3, "floor_grass"));
    step();
    const tilled = surface(x - 1, y + 3);
    const tree = map.createProp({ sprite: "tree_oak_m", tile: [x - 2, y + 3] });
    map.placeProp(tree, x - 2, y + 3);
    made.push(tree);
    map.touch(x - 2, y + 3);
    step();
    const withTree = surface(x - 2, y + 3);
    map.removeProp(tree);
    made.pop();
    map.touch(x - 2, y + 3);
    step();
    const felled = surface(x - 2, y + 3);
    row("a tilled tile and a felled tree change their cells (the tree shows, then the grass again)", tilled !== grass && withTree !== felled && felled === grass, `grass ${grass}, tilled ${tilled}; tree ${withTree}, felled ${felled}`);

    // 5. A wild chunk dropped by eviction keeps its chart, and it is unchanged when the chunk grows back.
    const wild = [-40, -40];
    G.teleport(wild[0] + 0.1, wild[1] + 0.1);
    step(2);
    const probe = [wild[0] + 3, wild[1] + 2];
    const seen = chart.cellAt(probe[0], probe[1]);
    const dropped = map.evictFar(x, y, 2, () => false);
    const stillThere = map.peekTile(probe[0], probe[1]);
    const afterDrop = chart.cellAt(probe[0], probe[1]);
    G.teleport(wild[0] + 0.1, wild[1] + 0.1);
    step(2);
    row("a wild chunk dropped by eviction keeps its chart, and the chart is the same when it grows back", seen > 0 && dropped.length > 0 && !stillThere && afterDrop === seen && chart.cellAt(probe[0], probe[1]) === seen, `cell ${seen}; ${dropped.length} dropped; after ${afterDrop}`);

    // 6. serialize, restore, serialize; and the chart is the world's, not a player's.
    const a = JSON.stringify(chart.serialize());
    chart.restore(JSON.parse(a));
    const b = JSON.stringify(chart.serialize());
    const someone = G.addPlayer(x + 1, y + 1);
    made.push({ id: someone.id, player: true });
    step();
    row("serialize, restore, serialize gives the same chart, and a character made afterwards has the whole of it (it is the world's)", a === b && chart.cellAt(probe[0], probe[1]) === seen && a.length > 100, `${a.length} bytes of chart`);

    // 11. The reveal's cost in open, uncharted land (the profile's number).
    chart.restore({ chunks: [] });
    const times = [];
    for (let k = 0; k < 8; k++) {
      const gx = x - 2 + (k % 4) * 0.5;
      const gy = y + k;
      const t0 = performance.now();
      chart.reveal(gx, gy, T.chartRadius);
      times.push(performance.now() - t0);
      if (k === 0) chart.restore({ chunks: [] }); // the first alone is the worst case: everything round it uncharted
    }
    row("the reveal in open uncharted land is cheap (reported: the first, with everything uncharted, is the worst)", times[0] < 12, `first ${times[0].toFixed(2)} ms (everything uncharted), then ${times.slice(1).map((t) => t.toFixed(2)).join(", ")} ms`);
  } catch (e) {
    rows.push({ check: "setup", result: "FAIL", detail: e.message + (e.stack ? " " + e.stack.split("\n")[1] : "") });
  } finally {
    for (const r of restore.reverse()) r();
    for (const q of made) { if (q.player) G.game.removePlayer(q.id); else { const t = map.propById(q.id); if (t) map.removeProp(t); } }
    chart.restore(JSON.parse(chart0));
    for (const p of S.players) p.chartTile = null;
    G.rules.rules.zombieAggro = aggro0;
    G.teleport(meAt[0], meAt[1]);
    G.loop.setPaused(wasPaused);
  }
  for (const r of rows) console.log(`${r.result}  ${r.check}  (${r.detail})`);
  return { rows, passed: rows.filter((r) => r.result === "pass").length, total: rows.length };
}
