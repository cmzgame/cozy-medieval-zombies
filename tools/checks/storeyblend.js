// The storey floor's blend (docs/53 step 4's leftover; Michael, 2026-10-31: "blending storey floors with the ground"; art round 14c): a hill's
// bare and grassy tops a storey up drawn as the ground draws its earth (render/storeys.js blendStorey). On a `?nosave&mute` page with open
// grass (the flat map, or the valley); it builds a hill across a chunk's edge and reads the floor's baked picture (storeys.floorBakeOf), so a
// hidden pane runs it too.
//   1. The kinds: the bare and the grassy cliff top are textured kinds a storey up; the laid stone floor is none.
//   2. Every floored tile's diamond is filled and nothing spills into the void beside the plateau.
//   3. As the ground: a lone rock tile in the turf rounds its corners away (turf in its diamond), the rock spreads onto the turf round it, and a
//      laid stone tile is its frame (neither texture).
//   4. The bake: a floor changed one tile across the chunk's edge bakes the chunk again; a touch that changes no floor does not.
// What it built is taken down again; the player, the rules, and the pause are put back in its finally.

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

// Open ground W by H whose x range crosses a chunk's edge.
function findSpot(G, W, H) {
  const map = G.map;
  const C = map.CHUNK;
  const open = (X0, Y0) => {
    map.ensureAround(X0 + W / 2, Y0 + H / 2, 2);
    for (let b = -1; b <= H; b++) for (let a = -1; a <= W; a++) {
      const t = map.peekTile(X0 + a, Y0 + b, 0);
      const up = map.peekTile(X0 + a, Y0 + b, 1);
      if (!(t && !t.prop && !t.n && !t.w && map.isWalkableTile(X0 + a, Y0 + b) && !(up && !map.isEngineFloor(up.floor)))) return false;
    }
    return true;
  };
  const tries = [];
  for (let cy = 6; cy <= 14; cy++) for (let cx = 4; cx <= 14; cx++) tries.push([cx * C - 5, cy * C + 3]);
  const me = G.player;
  tries.sort((p, q) => Math.hypot(p[0] - me.gx, p[1] - me.gy) - Math.hypot(q[0] - me.gx, q[1] - me.gy));
  return tries.find(([x, y]) => open(x, y)) || null;
}

export async function run(game) {
  const G = game;
  const { row, finish } = rowsOf();
  if (G.net.status().role === "guest") {
    row("this tab is the host", false, "the check builds: run it alone or on the host");
    return finish();
  }
  if (!new URLSearchParams(location.search).has("nosave")) {
    row("a ?nosave page", false, "the hill it builds is taken down again, but a kept world would autosave it mid-way: open the page with ?nosave&mute");
    return finish();
  }
  const map = G.map;
  const ground = await import("/src/ground.js");
  const storeys = await import("/src/render/storeys.js");
  const me = G.player;
  const saved = { paused: G.loop.isPaused(), gx: me.gx, gy: me.gy, layer: me.layer || 0, rise: me.rise || 0 };
  const walls = [];
  const floors = [];
  const C = map.CHUNK;
  try {
    G.loop.setPaused(true);
    const W = 10;
    const H = 7;
    const spot = findSpot(G, W, H);
    if (!spot) {
      row("open grass for the hill was found", false, "none in the loaded map: open ?map=flat or the valley");
      return finish();
    }
    const [X0, Y0] = spot;
    // 1. The kinds.
    const top = ground.storeyKindOf("floor_cliff_top");
    const turf = ground.storeyKindOf("floor_cliff_grass");
    row("the bare and the grassy cliff top are textured kinds a storey up, the rock over the turf; the laid stone floor is none", !!(top && top.texture && turf && turf.texture && top.priority > turf.priority && !ground.storeyKindOf("floor_stone")), `${top && top.name} ${top && top.priority}, ${turf && turf.name} ${turf && turf.priority}`);
    // The hill: a ring of cliff walls on the ground, its top a storey up, turf with a rock band at the east, a lone rock tile, and laid stone.
    const cw = (x, y, e) => { map.buildWall(x, y, e, "wall", "wall_cliff", null, 0); walls.push([x, y, e]); };
    for (let i = 0; i < W; i++) { cw(X0 + i, Y0, "n"); cw(X0 + i, Y0 + H, "n"); }
    for (let j = 0; j < H; j++) { cw(X0, Y0 + j, "w"); cw(X0 + W, Y0 + j, "w"); }
    const lone = [X0 + 2, Y0 + 3];
    const stone = [[X0 + 2, Y0 + 5], [X0 + 3, Y0 + 5]];
    const floorOf = (x, y) => (x === lone[0] && y === lone[1]) || x >= X0 + 7 ? "floor_cliff_top" : stone.some(([a, b]) => a === x && b === y) ? "floor_stone" : "floor_cliff_grass";
    for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
      const t = map.growTile(X0 + i, Y0 + j, 1);
      t.floor = floorOf(X0 + i, Y0 + j);
      t.built = { under: "void", free: true };
      map.touch(X0 + i, Y0 + j, 1);
      floors.push([X0 + i, Y0 + j]);
    }
    map.roomsIfDirty();
    me.layer = 1;
    me.rise = 0;
    G.teleport(X0 + 4.5, Y0 + 3.5);
    G.loop.advance(1 / 60);
    // The pictures, a chunk at a time, and what lies under a tile's pixels.
    const pics = new Map();
    const pic = (x, y) => {
      const cx = Math.floor(x / C);
      const cy = Math.floor(y / C);
      const k = `${cx},${cy}`;
      if (!pics.has(k)) {
        const b = storeys.floorBakeOf(cx, cy, 1);
        pics.set(k, b ? { data: b.canvas.getContext("2d").getImageData(0, 0, b.canvas.width, b.canvas.height), pad: b.pad, cx, cy } : null);
      }
      return pics.get(k);
    };
    const texel = (k, wx, wy) => { const tx = k.texture; const j = ((((wy % tx.h) + tx.h) % tx.h) * tx.w + (((wx % tx.w) + tx.w) % tx.w)) * 4; return [tx.px[j], tx.px[j + 1], tx.px[j + 2]]; };
    // Each pixel of tile (x, y)'s diamond at |u| + |v| under `inner`: { a, rock, turf }, whether it is exactly the rock's or the turf's texel there.
    const pixelsOf = (x, y, inner = 0.97) => {
      const p = pic(x, y);
      if (!p) return [];
      const lx = x - p.cx * C;
      const ly = y - p.cy * C;
      const ccx = (lx - ly) * 32 + C * 32 + p.pad;
      const ccy = (lx + ly) * 16 + 16 + p.pad;
      const left = (p.cx * C - p.cy * C - C) * 32 - p.pad;
      const topY = (p.cx * C + p.cy * C) * 16 - 16 - p.pad;
      const out = [];
      for (let py = ccy - 16; py < ccy + 16; py++) for (let px = ccx - 32; px < ccx + 32; px++) {
        const u = (px + 0.5 - ccx) / 32;
        const v = (py + 0.5 - ccy) / 16;
        if (Math.abs(u) + Math.abs(v) >= inner) continue;
        const o = (py * p.data.width + px) * 4;
        const c = [p.data.data[o], p.data.data[o + 1], p.data.data[o + 2]];
        const same = (q) => q[0] === c[0] && q[1] === c[1] && q[2] === c[2];
        out.push({ a: p.data.data[o + 3], rock: same(texel(top, left + px, topY + py)), turf: same(texel(turf, left + px, topY + py)) });
      }
      return out;
    };
    // 2. Filled and clear.
    let holes = 0;
    let spills = 0;
    let tiles = 0;
    for (let y = Y0 - 1; y <= Y0 + H; y++) for (let x = X0 - 1; x <= X0 + W; x++) {
      const t = map.peekTile(x, y, 1);
      const floored = !!t && !map.isEngineFloor(t.floor);
      for (const q of pixelsOf(x, y, floored ? 0.97 : 0.9)) {
        if (floored && q.a === 0) holes++;
        if (!floored && q.a !== 0) spills++;
      }
      tiles++;
    }
    const chunksSpanned = new Set(floors.map(([x]) => Math.floor(x / C))).size;
    row("every floored tile's diamond is filled and nothing spills into the void beside the plateau, across a chunk's edge", holes === 0 && spills === 0 && chunksSpanned > 1, `${tiles} tiles over ${chunksSpanned} chunk columns: ${holes} holes, ${spills} spills`);
    // 3. As the ground.
    const lonePx = pixelsOf(lone[0], lone[1]);
    const loneTurf = lonePx.filter((q) => q.turf && !q.rock).length;
    const loneRock = lonePx.filter((q) => q.rock).length;
    const ring = [[lone[0] + 1, lone[1]], [lone[0] - 1, lone[1]], [lone[0], lone[1] + 1], [lone[0], lone[1] - 1]];
    const spread = ring.reduce((s, [x, y]) => s + pixelsOf(x, y).filter((q) => q.rock && !q.turf).length, 0);
    row("a lone rock tile in the turf is rock at its heart with its corners rounded away into turf, and its rock spreads onto the turf round it", loneRock > lonePx.length / 2 && loneTurf > 0 && spread > 0, `${loneRock} rock and ${loneTurf} turf of its ${lonePx.length} pixels; ${spread} rock pixels on its four neighbours`);
    const stonePx = stone.flatMap(([x, y]) => pixelsOf(x, y));
    const stoneTex = stonePx.filter((q) => q.rock || q.turf).length;
    row("a laid stone tile is its own frame: neither texture in its diamond", stonePx.length > 0 && stoneTex <= stonePx.length * 0.02, `${stoneTex} of ${stonePx.length} pixels a texture's`);
    // 4. The bake.
    const edgeX = Math.ceil(X0 / C) * C; // the first column of the second chunk
    const leftCx = Math.floor((edgeX - 1) / C);
    const cy = Math.floor((Y0 + 2) / C);
    const b0 = storeys.floorBakeOf(leftCx, cy, 1).bakes;
    map.touch(edgeX - 3, Y0 + 2, 1); // a touch with no floor changed (a door, an item)
    const b1 = storeys.floorBakeOf(leftCx, cy, 1).bakes;
    const t = map.peekTile(edgeX, Y0 + 2, 1);
    const was = t.floor;
    t.floor = was === "floor_cliff_top" ? "floor_cliff_grass" : "floor_cliff_top"; // a tile one across the edge: the left chunk's blend reaches it
    map.touch(edgeX, Y0 + 2, 1);
    const b2 = storeys.floorBakeOf(leftCx, cy, 1).bakes;
    t.floor = was;
    map.touch(edgeX, Y0 + 2, 1);
    row("a floor changed one tile across the chunk's edge bakes the chunk again; a touch that changes no floor does not", b1 === b0 && b2 > b1, `bakes ${b0}, after a bare touch ${b1}, after the floor across the edge ${b2}`);
  } finally {
    for (const [x, y] of floors) { const t = map.peekTile(x, y, 1); if (t) { t.floor = map.VOID; delete t.built; map.touch(x, y, 1); } }
    for (const [x, y, e] of walls) { const t = map.peekTile(x, y, 0); if (t && t[e]) map.destroyWall(x, y, e, false, 0); }
    map.roomsIfDirty();
    me.layer = saved.layer;
    me.rise = saved.rise;
    G.teleport(saved.gx, saved.gy);
    G.loop.advance(1 / 60);
    G.loop.setPaused(saved.paused);
  }
  return finish();
}
