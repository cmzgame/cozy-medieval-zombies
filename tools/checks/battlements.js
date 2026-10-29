// The castle battlements (art round 13, Michael 2026-10-29: "make sure the whole of the battlement sits outside the walkway, as in hanging over, not
// intruding on the walkway"; docs/02; Free building's, for now). From the console, on a tab with `?nosave&mute` sized 1280 by 800 (docs/testing.md):
//   await __game.check("battlements")
// It lays a castle block on open ground the artist's way (a stone wall box on layer 0, a ring of floor on layer 1 on top of it, battlements by the
// command a guest sends on every outer edge of the ring, the far pieces on the north and west edges and the near on the south and east), then reads:
//   1. The data: the rule (see-through, not a fence, height 28), the 24 straight and 16 vertex pictures, their anchors the delivery's.
//   2. The build: all 24 outer edges stand, in the walls of layer 1, nothing charged; refusals (floor on both sides, on neither, the ground, a door
//      over one, Free building off) leave nothing.
//   3. The drawing, read off the real drawables of layer 1: each edge's frame by side and run, the four outer corners, the far pieces' depth plane
//      the edge line and the near pieces' 16 beyond it, no cap and no post.
//   4. The walkway: its tile is whole: a body stands against the line it keeps from a stone wall (0.3 off the outer edge), crosses the tile's every
//      other point, and is stopped at the outer edge; sight and light pass, a shot below the parapet (28) is stopped and one above passes, a body is
//      not let through, and nothing about it is a fence (the dead cannot strike it down).
//   5. The fade: a near battlement is translucent where the viewer stands on the walkway behind it (that tile and the one either side), and nowhere else.
//   6. A jogged walk: an inner corner with its late/early cut pictures, a run's free ends.
//   7. Taking it apart (the command a guest sends), and a save and its restore: the block comes back the same, the frames unchanged.
// What it built is taken down again; the player, the rules, the hour, the pause, and the camera are put back in its finally.

const rowsOf = () => {
  const results = [];
  return {
    results,
    row: (name, ok, detail = "") => results.push({ name, ok: !!ok, detail }),
    finish() {
      const passed = results.filter((r) => r.ok).length;
      for (const r of results) console.log(`${r.ok ? "pass" : "FAIL"}  ${r.name}${r.detail ? `  (${r.detail})` : ""}`);
      return { passed, total: results.length, results };
    },
  };
};

function findSpot(G, W, H) {
  const map = G.map;
  const C = map.CHUNK;
  const open = (X0, Y0) => {
    map.ensureAround(X0 + W / 2, Y0 + H / 2, 2);
    for (let b = -1; b <= H; b++) for (let a = -1; a <= W; a++) {
      const t = map.peekTile(X0 + a, Y0 + b, 0);
      if (!(t && !t.prop && !t.n && !t.w && !t.rug && !(t.items && t.items.length) && map.isWalkableTile(X0 + a, Y0 + b))) return false;
    }
    return true;
  };
  const tries = [];
  for (let cy = 6; cy <= 14; cy++) for (let cx = 4; cx <= 14; cx++) tries.push([cx * C - 8, cy * C - 8]);
  tries.sort((p, q) => Math.hypot(p[0] - 153, p[1] - 137) - Math.hypot(q[0] - 153, q[1] - 137));
  return tries.find(([x, y]) => open(x, y)) || null;
}

export async function run(game) {
  const G = game;
  const { results, row, finish } = rowsOf();
  if (G.net.status().role === "guest") {
    row("this tab is the host", false, "the check builds: run it alone or on the host");
    return finish();
  }
  if (!new URLSearchParams(location.search).has("nosave")) {
    row("a ?nosave page", false, "the walls it builds are taken down again, but a kept world would autosave them mid-way: open the page with ?nosave&mute");
    return finish();
  }
  const map = G.map;
  const me = G.player;
  const placement = G.placement;
  const walls = await import("/src/render/walls.js");
  const archery = await import("/src/archery.js");
  const batt = await import("/src/battlements.js");
  const depth = await import("/src/render/depth.js");
  const saved = { paused: G.loop.isPaused(), gx: me.gx, gy: me.gy, layer: me.layer || 0, rise: me.rise || 0, free: G.rules.rules.freeBuilding, aggro: G.rules.rules.zombieAggro, hour: G.clock.getHour() };
  const made = []; // [x, y, edge, layer] of every wall laid, taken down in the finally
  const floors = [];
  const step = (n = 1) => { for (let i = 0; i < n; i++) G.loop.advance(1 / 60); };
  const stand = (x, y, L = 1) => { const p = G.player; p.layer = L; p.rise = 0; p.auto = null; G.teleport(x, y); step(1); };
  const place = (cmd) => { placement.performPlacement(G.player, cmd); for (let i = 0; i < 45 && G.player.action; i++) step(1); };
  const wallAt = (x, y, e, L = 1) => { const t = map.peekTile(x, y, L); return t ? t[e] : null; };
  const drawables = (x0, y0, x1, y1) => {
    const tiles = [];
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) tiles.push([x, y]);
    const out = [];
    map.withDrawLayer(1, () => {
      walls.wallDrawables(tiles, new Set(), 0, out);
      walls.postDrawables(tiles, new Set(), 0, out);
    });
    return out;
  };
  const frames = (x0, y0, x1, y1) => {
    const o = {};
    for (const d of drawables(x0, y0, x1, y1)) if (d.battlement) o[d.wall ? `${d.wall.edge}${d.wall.tx},${d.wall.ty}` : `v${d.post.tx},${d.post.ty}`] = d.battlement;
    return o;
  };
  try {
    G.screens.hide();
    G.loop.setPaused(true);
    G.rules.set({ freeBuilding: true, zombieAggro: false });
    G.clock.setHour(12);
    const spot = findSpot(G, 10, 8);
    if (!spot) {
      row("open grass for the layout was found", false, "none in the loaded map");
      return finish();
    }
    const [X0, Y0] = spot;
    const N = 6;

    // ---- 1. The data ----
    const def = G.assets.getDef("wall_battlement");
    const vdef = G.assets.getDef("wall_battlement_vertices");
    const rule = map.wallRule("wall_battlement");
    row("the rule is data: see-through (bounds no room, passes sight and light), not a fence (the dead cannot strike it down), 28 high, no thickness, a battlement", rule.battlement && rule.seeThrough && !rule.fence && !rule.solid && def.wall.height === 28 && def.wall.thickness === 0, JSON.stringify(rule));
    row("its pictures: 24 straight ones (3 plain, a loop, a late and an early cut on each of north/west far/near) and 16 vertex ones (8 corners, 8 ends), each with its anchor",
      Object.keys(def.images).length === 24 && Object.keys(def.anchors).length === 24 && Object.keys(vdef.images).length === 16 && Object.keys(vdef.anchors).length === 16 && ["north_far_plain", "north_near_loop", "west_far_late", "west_near_early"].every((n) => def.images[n]) && vdef.images.corner_inner_e && vdef.images.end_N_near,
      `${Object.keys(def.images).length} + ${Object.keys(vdef.images).length}`);
    const sheet = G.assets.getSheet("wall_battlement");
    const vsheet = G.assets.getSheet("wall_battlement_vertices");
    row("the sheets load: every straight and vertex frame is there, the far north piece 47 by 68 and the near north one 47 by 84", Object.keys(def.images).every((n) => sheet.frames[n]) && Object.keys(vdef.images).every((n) => vsheet.frames[n]) && sheet.frames.north_far_plain[2] === 47 && sheet.frames.north_far_plain[3] === 68 && sheet.frames.north_near_plain[3] === 84, "");

    // ---- 2. The castle block and the build ----
    for (let i = 0; i < N; i++) for (const [x, y, e] of [[X0 + i, Y0, "n"], [X0 + i, Y0 + N, "n"], [X0, Y0 + i, "w"], [X0 + N, Y0 + i, "w"]]) if (map.buildWall(x, y, e, "wall", "wall_stone")) made.push([x, y, e, 0]);
    const t0 = map.growTile(X0, Y0, 1);
    t0.floor = "floor_stone";
    map.touch(X0, Y0, 1);
    floors.push([X0, Y0]);
    const ring = [];
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) if (i === 0 || j === 0 || i === N - 1 || j === N - 1) ring.push([X0 + i, Y0 + j]);
    for (let pass = 0; pass < 12; pass++) for (const [x, y] of ring) if (map.buildFloor(x, y, "floor_stone", 1, { free: true })) floors.push([x, y]);
    row("the walkway: a ring of floor on layer 1 over the stone box", ring.every(([x, y]) => map.peekTile(x, y, 1) && !map.isEngineFloor(map.peekTile(x, y, 1).floor)), `${ring.length} tiles`);
    // Refusals first, each leaving nothing.
    stand(X0 + 1, Y0 + 0.6);
    G.rules.set({ freeBuilding: false });
    place({ kind: "build", what: "battlement_stone", tx: X0 + 1, ty: Y0, edge: "n" });
    G.rules.set({ freeBuilding: true });
    const offBuilt = !!wallAt(X0 + 1, Y0, "n");
    stand(X0 + 0.5, Y0 + 2.4);
    place({ kind: "build", what: "battlement_stone", tx: X0, ty: Y0 + 2, edge: "n" }); // floor on both sides (the ring's west column)
    const bothBuilt = !!wallAt(X0, Y0 + 2, "n");
    stand(X0 + 3, Y0 + 3);
    place({ kind: "build", what: "battlement_stone", tx: X0 + 3, ty: Y0 + 4, edge: "n" }); // inside the hole: no floor either side
    const neitherBuilt = !!wallAt(X0 + 3, Y0 + 4, "n");
    stand(X0 + 1, Y0 + 3, 0);
    place({ kind: "build", what: "battlement_stone", tx: X0 + 1, ty: Y0 + 3, edge: "n" }); // the ground
    const groundBuilt = !!wallAt(X0 + 1, Y0 + 3, "n", 0) && wallAt(X0 + 1, Y0 + 3, "n", 0).sprite === "wall_battlement";
    row("refused, leaving nothing: Free building off, floor on both sides of the edge, floor on neither, and the ground", !offBuilt && !bothBuilt && !neitherBuilt && !groundBuilt, `off ${offBuilt}, both ${bothBuilt}, neither ${neitherBuilt}, ground ${groundBuilt}`);
    row("the words: \"It needs a wall walk to stand on\" on the ground and with no floor, \"Only along the outer edge of a wall walk\" with floor on both sides",
      batt.problem(X0 + 1, Y0 + 3, "n", 0) === "It needs a wall walk to stand on" && batt.problem(X0 + 3, Y0 + 4, "n", 1) === "It needs a wall walk to stand on" && batt.problem(X0, Y0 + 2, "n", 1) === "Only along the outer edge of a wall walk", "");
    // The build: every outer edge, by the command a guest sends.
    const outer = [];
    for (let i = 0; i < N; i++) outer.push([X0 + i, Y0, "n", X0 + i, Y0 + 0.6], [X0 + i, Y0 + N, "n", X0 + i, Y0 + N - 2], [X0, Y0 + i, "w", X0 + 0.6, Y0 + i], [X0 + N, Y0 + i, "w", X0 + N - 2, Y0 + i]);
    const bag0 = JSON.stringify(me.inventory || null);
    for (const [x, y, e, px, py] of outer) {
      stand(px, py);
      place({ kind: "build", what: "battlement_stone", tx: x, ty: y, edge: e });
      if (wallAt(x, y, e) && wallAt(x, y, e).sprite === "wall_battlement") made.push([x, y, e, 1]);
    }
    const stands = outer.filter(([x, y, e]) => { const w = wallAt(x, y, e); return w && w.kind === "wall" && w.sprite === "wall_battlement" && w.built && w.free; }).length;
    row("every outer edge of the ring takes a battlement by the command a guest sends (24), built at once, free, and nothing charged", stands === 24 && JSON.stringify(me.inventory || null) === bag0, `${stands} of 24`);
    place({ kind: "build", what: "door", tx: X0 + 1, ty: Y0, edge: "n" });
    row("a door cannot be stamped into one (\"Not in a battlement\")", wallAt(X0 + 1, Y0, "n").kind === "wall", "");

    // ---- 3. The drawing ----
    const f = frames(X0 - 1, Y0 - 1, X0 + N + 1, Y0 + N + 1);
    const edgeNames = [];
    for (let i = 0; i < N; i++) edgeNames.push(f[`n${X0 + i},${Y0}`], f[`n${X0 + i},${Y0 + N}`], f[`w${X0},${Y0 + i}`], f[`w${X0 + N},${Y0 + i}`]);
    const prefixes = ["north_far", "north_near", "west_far", "west_near"];
    row("each edge draws its piece by side and run: north far, north near (the south side), west far, west near (the east side); a plain variant by its hash, a loop for the odd one", edgeNames.every((n, k) => n && n.startsWith(prefixes[k % 4]) && /_(plain|plain_1|plain_2|loop)$/.test(n)), [...new Set(edgeNames)].length + " distinct: " + [...new Set(edgeNames)].join(","));
    row("the four corners draw outer_n (NW), outer_e (NE), outer_w (SW), outer_s (SE); a vertex in a run draws no post and no piece",
      f[`v${X0},${Y0}`] === "corner_outer_n" && f[`v${X0 + N},${Y0}`] === "corner_outer_e" && f[`v${X0},${Y0 + N}`] === "corner_outer_w" && f[`v${X0 + N},${Y0 + N}`] === "corner_outer_s" && f[`v${X0 + 2},${Y0}`] === undefined && Object.keys(f).filter((k) => k[0] === "v").length === 4,
      JSON.stringify(Object.keys(f).filter((k) => k[0] === "v").map((k) => `${k}:${f[k]}`)));
    const ds = drawables(X0 - 1, Y0 - 1, X0 + N + 1, Y0 + N + 1).filter((d) => d.battlement);
    row("no cap and no post: the drawables are the pieces alone (24 edges and 4 corners)", ds.length === 28 && !ds.some((d) => d.post && d.wall), `${ds.length} drawables`);
    // Depth: the plane of a far piece is its edge line, a near one's is 16 beyond (read at one column).
    const far = map.withDrawLayer(1, () => depth.wallSurface("n", X0 + 2, Y0, 0));
    const near = map.withDrawLayer(1, () => depth.wallSurface("n", X0 + 2, Y0 + N, 32));
    row("depth: the far piece's plane is the edge line (T 0) and the near piece's lies 16 units nearer than its line (T 32), as walls.js reads them", Math.abs(depth.ridge(X0 + 2.5, Y0 - 0.5).C - far.C) < 1e-6 && Math.abs(depth.ridge(X0 + 2.5, Y0 + N - 0.5 + 0.5).C - near.C) < 1e-6, "");

    // ---- 4. The walkway is whole; sight, shots, bodies ----
    const r = 0.3;
    const edgeCases = [
      ["north (far)", X0 + 2, Y0, 0, -1, (g) => g.gy], // the walkway tile (X0 + 2, Y0), outer line y = Y0 - 0.5
      ["south (near)", X0 + 2, Y0 + N - 1, 0, 1, (g) => g.gy],
      ["west (far)", X0, Y0 + 2, -1, 0, (g) => g.gx],
      ["east (near)", X0 + N - 1, Y0 + 2, 1, 0, (g) => g.gx],
    ];
    const reach = [];
    let walkOk = true;
    for (const [name, tx, ty, dx, dy] of edgeCases) {
      // From the tile's centre toward the outer line: free up to the body's radius from it, stopped there.
      let p = { gx: tx, gy: ty };
      for (let i = 0; i < 40; i++) p = map.moveCircle(p.gx, p.gy, r, dx * 0.05, dy * 0.05, 1);
      const off = dx ? (dx < 0 ? p.gx - (tx - 0.5) : tx + 0.5 - p.gx) : dy < 0 ? p.gy - (ty - 0.5) : ty + 0.5 - p.gy;
      reach.push(`${name} ${off.toFixed(2)}`);
      walkOk = walkOk && off >= r - 0.07 && off <= r + 0.07;
      // And along the line and across the other way: the whole tile is walkable (its four corners, inset by the radius, reached from the centre).
      for (const [cx, cy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
        const q = { gx: tx + cx * (0.5 - r - 0.02), gy: ty + cy * (0.5 - r - 0.02) };
        let g = { gx: tx, gy: ty };
        for (let i = 0; i < 30; i++) g = map.moveCircle(g.gx, g.gy, r, (q.gx - g.gx) * 0.2, (q.gy - g.gy) * 0.2, 1);
        if (Math.hypot(g.gx - q.gx, g.gy - q.gy) > 0.02) walkOk = false;
      }
    }
    row("the walkway tile is whole and the body stops at the outer edge as it does at a stone wall: from the centre a body reaches its radius (0.3) from the outer line on all four sides, and every corner of the tile inset by that radius", walkOk, reach.join(", "));
    const w0 = wallAt(X0 + 2, Y0, "n");
    row("bodies are blocked, sight and light pass, no room is bounded, the dead cannot strike it down", map.blocksMove(w0) && map.transmission(w0) === 1 && !map.isFence(w0) && !map.canStep(X0 + 2, Y0, X0 + 2, Y0 - 1, 1) && map.roomAt(X0 + 2, Y0, 1) === map.roomAt(X0 + 2, Y0 + 1, 1), "");
    row("a shot below the parapet (28) is stopped by it and one over it passes (a merlon's 44 is not modelled)", archery.wallStops(w0, 12) === true && archery.wallStops(w0, 40) === false, "");

    // ---- 5. The near battlement's fade ----
    const fadedAt = (vx, vy) => {
      walls.setViewerAt({ x: vx, y: vy, layer: 1 });
      try {
        return drawables(X0 - 1, Y0 - 1, X0 + N + 1, Y0 + N + 1).filter((d) => d.wall && d.faded).map((d) => `${d.wall.edge}${d.wall.tx},${d.wall.ty}`).sort().join(" ");
      } finally {
        walls.setViewerAt(null);
      }
    };
    const behindSouth = fadedAt(X0 + 2, Y0 + N - 1);
    const onNorth = fadedAt(X0 + 2, Y0);
    const nobody = drawables(X0 - 1, Y0 - 1, X0 + N + 1, Y0 + N + 1).filter((d) => d.faded).length;
    row("the near battlement fades where the viewer stands on the walkway behind it (the tile and the one either side), and the far one never does", behindSouth === `n${X0 + 1},${Y0 + N} n${X0 + 2},${Y0 + N} n${X0 + 3},${Y0 + N}` && onNorth === "" && nobody === 0, `behind the south: ${behindSouth}; on the north: "${onNorth}"; no viewer: ${nobody}`);

    // ---- 6. A jogged walk: an inner corner and its cuts, the free ends ----
    const JX = X0 + N + 3;
    const JY = Y0;
    const L = [];
    for (let j = 0; j < 2; j++) for (let i = 0; i < 4; i++) L.push([JX + i, JY + j]);
    for (let j = 2; j < 4; j++) for (let i = 0; i < 2; i++) L.push([JX + i, JY + j]);
    const has = new Set(L.map(([a, b]) => `${a},${b}`));
    map.ensureAround(JX + 2, JY + 2, 2);
    const seed = map.growTile(JX, JY, 1);
    seed.floor = "floor_stone";
    map.touch(JX, JY, 1);
    floors.push([JX, JY]);
    for (let pass = 0; pass < 8; pass++) for (const [a, b] of L) if (map.buildFloor(a, b, "floor_stone", 1, { free: true })) floors.push([a, b]);
    const lay = (tx, ty, e) => { if (map.buildWall(tx, ty, e, "wall", "wall_battlement", null, 1)) made.push([tx, ty, e, 1]); };
    for (const [a, b] of L) {
      if (!has.has(`${a},${b - 1}`)) lay(a, b, "n");
      if (!has.has(`${a},${b + 1}`)) lay(a, b + 1, "n");
      if (!has.has(`${a - 1},${b}`)) lay(a, b, "w");
      if (!has.has(`${a + 1},${b}`)) lay(a + 1, b, "w");
    }
    const jf = frames(JX - 1, JY - 1, JX + 5, JY + 5);
    row("the L's outer corners and its inner corner (a notch): inner_n at the notch's vertex, outer pieces at the other five turns; the two edges beside the inner corner draw their `late` cuts",
      jf[`v${JX + 2},${JY + 2}`] === "corner_inner_n" && jf[`n${JX + 2},${JY + 2}`] === "north_near_late" && jf[`w${JX + 2},${JY + 2}`] === "west_near_late" && Object.keys(jf).filter((k) => /^v/.test(k) && /corner_outer/.test(jf[k])).length === 5,
      JSON.stringify(Object.keys(jf).filter((k) => k[0] === "v").map((k) => `${k}:${jf[k]}`)));
    // A lone run: its two free ends.
    const EX = JX;
    const EY = JY + 6;
    const e0 = map.growTile(EX, EY, 1);
    e0.floor = "floor_stone";
    map.touch(EX, EY, 1);
    floors.push([EX, EY]);
    lay(EX, EY, "n");
    const ef = frames(EX - 1, EY - 1, EX + 2, EY + 1);
    row("a lone run draws a half-merlon end at each free vertex: end_E_far at its west end and end_W_far at its east end", ef[`v${EX},${EY}`] === "end_E_far" && ef[`v${EX + 1},${EY}`] === "end_W_far", JSON.stringify(ef));

    // ---- 7. Taking it apart, and a save and its restore ----
    const before = JSON.stringify(f);
    const snap = JSON.parse(JSON.stringify(G.save.snapshot("check")));
    await G.restoreWorld(snap);
    const me2 = G.player;
    const after = JSON.stringify(frames(X0 - 1, Y0 - 1, X0 + N + 1, Y0 + N + 1));
    row("a save and its restore bring the block back as it was: all 24 edges, the same frames (the side, the variant, and the corners are read, never saved)", after === before && outer.every(([x, y, e]) => { const w = wallAt(x, y, e); return w && w.sprite === "wall_battlement"; }), after === before ? "" : `${before.length} vs ${after.length}`);
    const sync = G.game.syncParts ? JSON.stringify(Object.keys(G.game.syncParts())) : "";
    row("the sync check reads the same walls as ever (no new part: a battlement is a wall of its chunk)", !/battle/i.test(sync), sync.slice(0, 120));
    me2.layer = 1;
    stand(X0 + 1, Y0 + 0.6);
    G.player.layer = 1;
    place({ kind: "remove", target: { type: "wall", tx: X0 + 1, ty: Y0, edge: "n", layer: 1 } });
    row("taking one apart (the command a guest sends) removes just that battlement, and its neighbours stand", !wallAt(X0 + 1, Y0, "n") && !!wallAt(X0, Y0, "n") && !!wallAt(X0 + 2, Y0, "n"), "");
  } catch (e) {
    row("the check ran to its end", false, e && e.stack ? e.stack.split("\n").slice(0, 3).join(" | ") : String(e));
  } finally {
    try { G.rules.set({ freeBuilding: saved.free, zombieAggro: saved.aggro }); } catch { /* put back below */ }
    for (const [x, y, e, L] of made) { try { map.destroyWall(x, y, e, false, L); } catch { /* gone */ } }
    for (const [x, y] of floors) { try { map.takeUpFloor(x, y, 1); } catch { /* gone */ } }
    const p = G.player;
    p.layer = saved.layer;
    p.rise = saved.rise;
    G.teleport(saved.gx, saved.gy);
    G.clock.setHour(saved.hour);
    G.loop.setPaused(saved.paused);
  }
  return finish();
}
