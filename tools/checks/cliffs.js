// Cliffs on the storeys (Michael's playtest, 2026-10-28: a hill on a hill, its upper hill's walls on the first storey, a stone stair on
// the second up to a grassy ring round its landing on the third; the landing drew as a hole, and cliff walls he built drew as nothing).
// From the console, on a tab with `?nosave&mute` sized 1280 by 800 (docs/testing.md), in the valley:
//   await __game.check("cliffs")
// It builds his hill by the commands a guest sends (placement.performPlacement, Free building on, each build stepped to its end) on open
// grass whose lower corner falls on a chunk's corner: a lower hill (cliff walls on the ground round an L of cliff tops on the first storey,
// a stone ramp up to it), an upper hill on it (cliff walls on the first storey, a ramp from the first, cliff tops on the second), a stone
// stair on the second, and a ring of grassy cliff tops round its landing on the third. The upper hill's front corner is at the vertex of
// four chunks of which the first storey holds only the two its walls stand on, as his could. Then, read off the frame:
//   1. The stone floor's sheet is the floor's own (data/sprites/floor_stone.json), and the item stone lies as `lying_stone`: an item's
//      picture on the floor took `floor_<id>` until this fix, and the item stone's took the stone floor's sheet (every stone floor, the
//      stair's landing among them, drew as one pebble on a tile of nothing).
//   2. The build: every wall, floor, ramp, and the stair built.
//   3. The landing on the third storey drawn solid from the second: its tile's pixels change when its floor is taken away for a frame.
//   4. From each storey (the ground, the first, the second), every cliff wall that is not buried (plateau on both its sides) is drawn on its
//      own storey: its segment, or the corner piece that claims it.
//   5. The upper hill's front corner piece drawn, its own pixels in the frame (scene.probe.mark), from his place on the second storey.
//   6. (Michael, 2026-10-29) The Stone ramp is placed at once and free, never as a timed build (the Build tab's stone stair still is); it brings
//      its own solid sides for its landing tile (map.landingSideEdges: a wall on each edge of the ground under the landing but the head's);
//      a cliff wall at its head is refused with its own words; and a body walks up and down each ramp, in each facing, by the movement keys.
// What it built stays (a built stair never comes up): a `?nosave` page's world is thrown away. The player, the rules, the hour, and the
// pause are put back in its finally.

const rect = (a0, a1, b0, b1) => {
  const s = new Set();
  for (let a = a0; a <= a1; a++) for (let b = b0; b <= b1; b++) s.add(`${a},${b}`);
  return s;
};
// The edges between a plan's tiles and the rest: "n,a,b" (the n edge of tile (a, b)) and "w,a,b".
const edgesOf = (P) => {
  const edges = new Set();
  for (const k of P) {
    const [a, b] = k.split(",").map(Number);
    for (const [e, ex, ey] of [["n", a, b], ["n", a, b + 1], ["w", a, b], ["w", a + 1, b]]) {
      const [p, q] = e === "n" ? [[ex, ey], [ex, ey - 1]] : [[ex, ey], [ex - 1, ey]];
      if (P.has(`${p[0]},${p[1]}`) !== P.has(`${q[0]},${q[1]}`)) edges.add(`${e},${ex},${ey}`);
    }
  }
  return edges;
};
// The lower hill: an L round the upper hill's front corner, so the first storey holds no tile in the chunk past that corner.
const H1 = new Set([...rect(0, 10, 0, 6), ...rect(0, 6, 7, 9)]);
const H2 = rect(0, 6, 0, 6);
const RING = new Set([...rect(1, 3, 1, 3)].filter((k) => k !== "2,2" && k !== "2,3")); // round the landing (2, 2), less the stairwell's top (2, 3)

export function buildHill(G, X0, Y0) {
  const map = G.map;
  const me = G.player;
  const at = (a, b, L) => { me.gx = X0 + a; me.gy = Y0 + b; me.layer = L; me.rise = 0; me.auto = null; };
  const run = (cmd) => { G.placement.performPlacement(me, cmd); run.pending = !!me.action; for (let i = 0; i < 45 && me.action; i++) G.loop.advance(1); };
  const fl = (a, b, L) => (map.peekTile(X0 + a, Y0 + b, L) || {}).floor;
  // A plan's floor laid tile by tile out from `start` (already walkable), each from a laid neighbour.
  const grow = (P, start, L, what) => {
    const laid = new Set([start]);
    let more = true;
    while (more) {
      more = false;
      for (const k of P) {
        if (laid.has(k)) continue;
        const [a, b] = k.split(",").map(Number);
        const from = [[1, 0], [-1, 0], [0, 1], [0, -1]].map(([dx, dy]) => [a + dx, b + dy]).find(([c, d]) => laid.has(`${c},${d}`));
        if (!from) continue;
        at(from[0], from[1], L);
        run({ kind: "build", what, tx: X0 + a, ty: Y0 + b, tx2: X0 + a, ty2: Y0 + b });
        if (fl(a, b, L) === what) { laid.add(k); more = true; }
      }
    }
    return laid.size;
  };
  // A plan's cliff walls on layer L, each built from the tile outside it when that is walkable there (`ground`), else from inside.
  const walls = (P, ground, L, skip) => {
    let n = 0;
    let of = 0;
    for (const e of edgesOf(P)) {
      if (e === skip) continue;
      of++;
      const [k, a, b] = e.split(",");
      const ex = Number(a);
      const ey = Number(b);
      const [p, q] = k === "n" ? [[ex, ey], [ex, ey - 1]] : [[ex, ey], [ex - 1, ey]];
      const inside = P.has(`${p[0]},${p[1]}`) ? p : q;
      const out = inside === p ? q : p;
      const st = !ground || ground.has(`${out[0]},${out[1]}`) ? out : inside;
      at(st[0], st[1], L);
      run({ kind: "build", what: "wall_cliff", tx: X0 + ex, ty: Y0 + ey, edge: k });
      if ((map.peekTile(X0 + ex, Y0 + ey, L) || {})[k]) n++;
    }
    return [n, of];
  };
  const stairAt = (a, b, L) => map.stairs().some((s) => s.built && s.layer === L && s.at[0] === X0 + a && s.at[1] === Y0 + b);
  const got = {};
  at(4, 13.6, 0);
  run({ kind: "build", what: "stair_ramp_stone", tx: X0 + 4, ty: Y0 + 12, dir: "n" });
  got.ramp1 = stairAt(4, 12, 0);
  got.pending = [run.pending]; // whether a bar was left running by each ramp (none: it is placed at once) and by the Build tab's stone stair (one)
  got.walls0 = walls(H1, null, 0, "n,4,10"); // less the ramp's head
  got.floors1 = [grow(H1, "4,9", 1, "floor_cliff_top"), H1.size];
  at(10, 3, 1);
  run({ kind: "build", what: "stair_ramp_stone", tx: X0 + 9, ty: Y0 + 3, dir: "w" });
  got.ramp2 = stairAt(9, 3, 1);
  got.pending.push(run.pending);
  got.walls1 = walls(H2, H1, 1, "w,7,3");
  got.floors2 = [grow(H2, "6,3", 2, "floor_cliff_top"), H2.size];
  at(2, 6, 2);
  run({ kind: "build", what: "stair_stone", tx: X0 + 2, ty: Y0 + 5, dir: "n" });
  got.stair = stairAt(2, 5, 2);
  got.stairPending = run.pending;
  got.landing = fl(2, 2, 3);
  got.ring = [grow(new Set([...RING, "2,2"]), "2,2", 3, "floor_cliff_grass") - 1, RING.size];
  return got;
}

// Open grass for the hill (12 by 14 and a tile round it) whose upper hill's front corner (7, 7) is a chunk's corner, nearest the spawn.
function findSpot(G) {
  const map = G.map;
  const C = map.CHUNK;
  const open = (X0, Y0) => {
    map.ensureAround(X0 + 6, Y0 + 7, 2);
    for (let b = -1; b <= 14; b++) for (let a = -1; a <= 12; a++) {
      const t = map.peekTile(X0 + a, Y0 + b, 0);
      if (!(t && !t.prop && !t.n && !t.w && !t.rug && !(t.items && t.items.length) && map.isWalkableTile(X0 + a, Y0 + b) && !map.stairAt(X0 + a, Y0 + b, 0))) return false;
      for (const L of [1, 2, 3]) if (map.peekTile(X0 + a, Y0 + b, L)) return false;
    }
    return true;
  };
  const tries = [];
  for (let cy = 6; cy <= 14; cy++) for (let cx = 4; cx <= 14; cx++) tries.push([cx * C - 7, cy * C - 7]);
  tries.sort((p, q) => Math.hypot(p[0] - 153, p[1] - 137) - Math.hypot(q[0] - 153, q[1] - 137));
  return tries.find(([x, y]) => open(x, y)) || null;
}

export async function run(game) {
  const G = game;
  const results = [];
  const row = (name, ok, detail = "") => results.push({ name, ok: !!ok, detail });
  const finish = () => {
    const passed = results.filter((r) => r.ok).length;
    for (const r of results) console.log(`${r.ok ? "pass" : "FAIL"}  ${r.name}${r.detail ? `  (${r.detail})` : ""}`);
    return { passed, total: results.length, results };
  };
  if (G.net.status().role === "guest") {
    row("this tab is the host", false, "the check builds: run it alone or on the host");
    return finish();
  }
  if (!new URLSearchParams(location.search).has("nosave")) {
    row("a ?nosave page", false, "the hill it builds stays (a built stair never comes up): open the page with ?nosave&mute");
    return finish();
  }
  const map = G.map;
  const me = G.player;
  const scene = await import("/src/render/scene.js");
  const cliffs = await import("/src/cliffs.js");
  const iso = await import("/src/iso.js");
  const ctx = G.gl.gl;
  const canvas = ctx.canvas;
  const saved = { paused: G.loop.isPaused(), gx: me.gx, gy: me.gy, layer: me.layer || 0, rise: me.rise || 0, free: G.rules.rules.freeBuilding, aggro: G.rules.rules.zombieAggro, hour: G.clock.getHour() };
  // The drawables of one frame, by kind, with the storey each was gathered on.
  const frameDrawables = () => {
    const seen = [];
    scene.probe.mark = { is: (d) => { if (d.kind === "wall") seen.push({ L: map.drawLayerNow(), wall: d.wall, corner: d.corner }); return false; }, color: [1, 0, 0] };
    try {
      G.loop.advance(0);
    } finally {
      scene.probe.mark = null;
    }
    return seen;
  };
  // A thing's own pixels: the frame drawn twice with it in two flat colours (`set(color)` marks it, `set(null)` stops), and the pixels
  // red in the first and blue in the second (an autumn tree's red is in both). `keep(x, y)` limits them to a region; returns the mask.
  const own = (set) => {
    const frames = [[1, 0, 0], [0, 0, 1]].map((color) => {
      set(color);
      try {
        G.loop.advance(0);
      } finally {
        set(null);
      }
      const px = new Uint8Array(canvas.width * canvas.height * 4);
      ctx.readPixels(0, 0, canvas.width, canvas.height, ctx.RGBA, ctx.UNSIGNED_BYTE, px);
      return px;
    });
    const [a, b] = frames;
    return (x, y) => {
      const i = ((canvas.height - 1 - y) * canvas.width + x) * 4;
      return a[i] > 200 && a[i + 1] < 40 && a[i + 2] < 40 && b[i] < 40 && b[i + 1] < 40 && b[i + 2] > 200;
    };
  };
  const red = (is) => {
    const mask = own((color) => { scene.probe.mark = color ? { is, color } : null; });
    let n = 0;
    for (let y = 0; y < canvas.height; y++) for (let x = 0; x < canvas.width; x++) if (mask(x, y)) n++;
    return n;
  };
  // Whether storey L's grid point (x, y) is on the canvas, a margin in from its edges.
  const onScreen = (x, y, L) => {
    const p = iso.toScreen(x, y);
    const v = G.view.view;
    return p.x > 40 && p.x < v.w - 40 && p.y - L * map.STOREY > 40 && p.y - L * map.STOREY < v.h - 40;
  };
  const stand = (x, y, L) => { me.layer = L; me.rise = 0; G.teleport(x, y); G.loop.advance(1 / 60); };
  try {
    G.loop.setPaused(true);
    G.rules.set({ freeBuilding: true, zombieAggro: false });
    G.clock.setHour(12);
    // 1. The sheets.
    const stoneFloor = G.assets.getSheet("floor_stone");
    const names = Object.keys(stoneFloor.frames).filter((n) => n.startsWith("idle_"));
    let lying = null;
    try { lying = G.assets.getSheet("lying_stone"); } catch { lying = null; }
    const clash = G.items.allItems().filter((d) => { try { return G.assets.getSheet(`lying_${d.id}`) && G.assets.getDef(`lying_${d.id}`); } catch { return false; } }).map((d) => d.id);
    row("the stone floor's sheet is its own (data/sprites/floor_stone.json, four 64 by 32 tiles), the item stone lies as lying_stone, and no item's lying picture is a sprite definition's name",
      stoneFloor.source && stoneFloor.source.def === "data/sprites/floor_stone.json" && names.length === 4 && names.every((n) => stoneFloor.frames[n][2] === 64) && !!lying && !clash.length,
      `floor_stone from ${stoneFloor.source && (stoneFloor.source.def || JSON.stringify(stoneFloor.source))}, ${names.length} tiles ${names.map((n) => stoneFloor.frames[n].slice(2).join("x")).join(" ")}; lying_stone ${lying ? "registered" : "missing"}; clashes ${clash.join(", ") || "none"}`);
    // 2. The build.
    const spot = findSpot(G);
    if (!spot) {
      row("open grass for the hill at a chunk's corner", false, "none near the spawn: open the valley");
      return finish();
    }
    const [X0, Y0] = spot;
    const got = buildHill(G, X0, Y0);
    const okBuild = got.ramp1 && got.ramp2 && got.stair && got.walls0[0] === got.walls0[1] && got.walls1[0] === got.walls1[1] && got.floors1[0] === got.floors1[1] && got.floors2[0] === got.floors2[1] && got.landing === "floor_stone" && got.ring[0] === got.ring[1];
    row("his hill built by the commands a guest sends: the lower hill's walls, its ramp, its cliff tops; the upper hill's walls on the first storey, its ramp, its cliff tops; the stone stair on the second, its landing, the grassy ring on the third", okBuild,
      `at ${X0},${Y0}: ramps ${got.ramp1}/${got.ramp2}, stair ${got.stair}; walls ${got.walls0.join("/")} on the ground, ${got.walls1.join("/")} on the first; cliff tops ${got.floors1.join("/")}, ${got.floors2.join("/")}; landing ${got.landing}; ring ${got.ring.join("/")}`);
    // 3a. The ramp at once and free; the Build tab's stair timed.
    row("the Stone ramp is placed at once and free (no bar, no cost, no tool: `isInstantStair`), the Build tab's stone stair still timed and priced", got.pending.every((p) => !p) && got.stairPending === true && G.placement.isInstantStair("stair_ramp_stone") && !G.placement.isInstantStair("stair_stone") && !G.placement.isInstantStair("stair_wood") && G.placement.paletteKinds().some((k) => k.id === "stair_stone" && k.seconds > 0),
      `ramps left a bar: ${got.pending.join("/")}; the stone stair left one: ${got.stairPending}`);
    // 3b. The sides: every edge of the ground under a ramp's landing but its head's holds a wall that blocks a body (the ramp's own, or a cliff wall
    // built there first), and the head's holds none.
    const ramps = map.stairs().filter((q) => q.built && map.stairKind(q.material).ramp);
    const sideBad = [];
    for (const q of ramps) {
      for (const [tx, ty, e] of map.landingSideEdges(q)) {
        const w = (map.peekTile(tx, ty, q.layer) || {})[e];
        if (!w || !map.blocksMove(w)) sideBad.push(`${q.id} ${e}@${tx},${ty}`);
      }
      const head = q.dir === "n" ? [q.landing[0], q.landing[1] + 1, "n"] : [q.landing[0] + 1, q.landing[1], "w"];
      if ((map.peekTile(head[0], head[1], q.layer) || {})[head[2]]) sideBad.push(`${q.id} head walled`);
    }
    const ownSides = ramps.reduce((n, q) => n + map.landingSideEdges(q).filter(([tx, ty, e]) => ((map.peekTile(tx, ty, q.layer) || {})[e] || {}).sprite === "wall_ramp_side").length, 0);
    row("each ramp brings its own solid sides: a wall on every edge of the ground under its landing but its head's, none at the head, never taken apart", ramps.length === 2 && !sideBad.length && ownSides > 0 && ramps.every((q) => map.landingSideEdges(q).length === 3),
      `${ramps.length} ramps, ${ownSides} of its own wall_ramp_side pieces${sideBad.length ? `; missing: ${sideBad.join(", ")}` : ""}`);
    // 3c. A cliff wall at a ramp's head is refused in its own words (the lower hill's wall just beside the first ramp's head).
    const headWhy = map.stairBuildProblem(X0 + 5, Y0 + 12, "n", 0);
    row("a ramp whose head is a cliff wall is refused with `A cliff wall is at its head: take it down first`", headWhy === "A cliff wall is at its head: take it down first", headWhy);
    // 3d. Walked by the movement keys (real key events, the loop stepped): up each ramp from its foot onto its landing, rise climbing, then back
    // down to the foot.
    const key = (code, down) => window.dispatchEvent(new KeyboardEvent(down ? "keydown" : "keyup", { code, key: code, bubbles: true }));
    const hold = (codes, n, stop = null) => {
      codes.forEach((c) => key(c, true));
      const log = [];
      try {
        for (let i = 0; i < n; i++) {
          G.loop.advance(1 / 60);
          log.push([me.layer || 0, me.rise || 0, me.gx, me.gy]);
          if (stop && stop(log)) break;
        }
      } finally {
        codes.forEach((c) => key(c, false));
        G.loop.advance(1 / 60);
      }
      return log;
    };
    for (const q of ramps) {
      const d = { n: [0, -1], w: [-1, 0] }[q.dir];
      const upKeys = q.dir === "n" ? ["KeyW", "KeyD"] : ["KeyW", "KeyA"]; // screen up-right climbs n, up-left climbs w
      const downKeys = q.dir === "n" ? ["KeyS", "KeyA"] : ["KeyS", "KeyD"];
      me.layer = q.layer;
      me.rise = 0;
      me.auto = null;
      G.teleport(q.before[0] - d[0] * 0.2, q.before[1] - d[1] * 0.2);
      G.loop.advance(1 / 60);
      const up = hold(upKeys, 170, (l) => l.length > 6 && l[l.length - 1][0] === q.layer + 1 && l.slice(-6).every((r) => r[0] === q.layer + 1)); // six steps past the top edge
      const top = up[up.length - 1];
      const rises = up.filter((r) => r[0] === q.layer).map((r) => r[1]);
      const mono = rises.every((r, i) => !i || r >= rises[i - 1] - 1);
      const onLanding = top[0] === q.layer + 1 && top[1] === 0 && Math.round(top[2]) === q.landing[0] && Math.round(top[3]) === q.landing[1];
      row(`up the ramp at ${q.at} (${q.dir}, layer ${q.layer}) by the movement keys: the rise climbs evenly to a storey, onto the landing, standing on it`, onLanding && Math.max(...rises) >= 88 && mono,
        `ends layer ${top[0]} rise ${top[1]} at ${top[2].toFixed(2)},${top[3].toFixed(2)}; highest rise ${Math.max(...rises)}, monotone ${mono}`);
      const down = hold(downKeys, 190, (l) => l.length > 6 && l[l.length - 1][0] === q.layer && l[l.length - 1][1] === 0 && l.slice(-6).every((r) => r[0] === q.layer && r[1] === 0) && l.some((r) => r[1] > 60)); // off the foot
      const end = down[down.length - 1];
      const fell = down.filter((r) => r[0] === q.layer).map((r) => r[1]);
      row(`down the ramp at ${q.at} by the keys: over its top edge onto it, the rise falling, off its foot on its own layer`, end[0] === q.layer && end[1] === 0 && fell.some((r) => r > 60) && (end[2] - q.before[0]) * d[0] + (end[3] - q.before[1]) * d[1] <= 0.6,
        `ends layer ${end[0]} rise ${end[1]} at ${end[2].toFixed(2)},${end[3].toFixed(2)}; highest rise ${Math.max(0, ...fell)}`);
    }
    // 3. The landing, from his place on the second storey beside the stair's foot.
    stand(X0 + 3.5, Y0 + 5.5, 2);
    const lx = X0 + 2;
    const ly = Y0 + 2;
    // The third storey's floors drawn flat (scene.probe.floor): the share of the landing's diamond (drawn a tenth smaller) that is theirs.
    // The bug drew a pebble 14 by 11 on a tile of nothing.
    const mask = own((color) => { scene.probe.floor = color ? { layer: 3, color } : null; });
    const k = canvas.width / G.view.view.w;
    const c = iso.toScreen(lx, ly);
    const [cx, cy] = [c.x * k, (c.y - 3 * map.STOREY) * k];
    const [hw, hh] = [iso.HW * k * 0.9, iso.HH * k * 0.9];
    let inside = 0;
    let lit = 0;
    for (let y = Math.floor(cy - hh); y <= Math.ceil(cy + hh); y++) for (let x = Math.floor(cx - hw); x <= Math.ceil(cx + hw); x++) {
      if (Math.abs(x - cx) / hw + Math.abs(y - cy) / hh > 1) continue;
      inside++;
      if (mask(x, y)) lit++;
    }
    row("the stair's landing on the third storey drawn solid from the second: its whole diamond is its floor's picture", inside > 500 && lit / inside > 0.95, `${lit} of the ${inside} px of its diamond`);
    // 4. Every cliff wall that is not buried, drawn on its storey, from each storey.
    const cliffWalls = [];
    for (let L = 0; L <= 2; L++) for (let b = -1; b <= 14; b++) for (let a = -1; a <= 12; a++) {
      const t = map.peekTile(X0 + a, Y0 + b, L);
      if (!t) continue;
      for (const e of ["n", "w"]) if (cliffs.cliffWallOf(t[e]) && !cliffs.buried(X0 + a, Y0 + b, e, L)) cliffWalls.push([X0 + a, Y0 + b, e, L, t[e]]);
    }
    const views = [["the ground", X0 + 6, Y0 + 15, 0], ["the first storey", X0 + 9, Y0 + 5.5, 1], ["the second storey", X0 + 3.5, Y0 + 5.5, 2]];
    for (const [where, x, y, L] of views) {
      stand(x, y, L);
      const seen = frameDrawables();
      const shown = cliffWalls.filter(([tx, ty, e, l]) => onScreen(e === "n" ? tx : tx - 0.5, e === "n" ? ty - 0.5 : ty, l)); // the edge's middle on the canvas
      const miss = shown.filter(([tx, ty, e, l, w]) => {
        if (seen.some((s) => s.L === l && s.wall && s.wall.tx === tx && s.wall.ty === ty && s.wall.edge === e)) return false;
        const ends = e === "n" ? [[tx, ty], [tx + 1, ty]] : [[tx, ty], [tx, ty + 1]];
        return !ends.some(([vx, vy]) => {
          const c = cliffs.cornerBase(vx, vy, l);
          return c && (e === "n" ? c.n : c.w) === w && seen.some((s) => s.L === l && s.corner && s.corner.vx === vx && s.corner.vy === vy);
        });
      });
      row(`from ${where}, every cliff wall not buried is drawn on its storey (its segment, or the corner piece that claims it)`, shown.length >= 8 && !miss.length,
        `${shown.length - miss.length} of the ${shown.length} on the canvas (of ${cliffWalls.length})${miss.length ? `; not drawn: ${miss.map(([tx, ty, e, l]) => `${e},${tx - X0},${ty - Y0} on ${l}`).join(" ")}` : ""}`);
    }
    // 5. The upper hill's front corner, at the chunks' corner, its own pixels.
    stand(X0 + 3.5, Y0 + 5.5, 2);
    const vx = X0 + 7;
    const vy = Y0 + 7;
    const C = map.CHUNK;
    const corner = cliffs.cornerAt(vx, vy, 1);
    const held = [[vx, vy], [vx - 1, vy], [vx, vy - 1]].map(([x, y]) => !!map.getChunk(Math.floor(x / C), Math.floor(y / C), false, 1));
    const n = red((d) => d.corner && d.corner.vx === vx && d.corner.vy === vy && map.drawLayerNow() === 1); // the ground's own corner at that vertex (the lower hill's notch) left out
    row("the upper hill's front corner piece, at a vertex whose own chunk the first storey does not hold, drawn: its pixels in the frame", !!corner && !held[0] && held[1] && held[2] && n > 100,
      `${corner ? corner.frame : "no corner"} at the chunks' corner; the first storey holds its own chunk ${held[0]}, the west ${held[1]}, the north ${held[2]}; ${n} px`);
  } finally {
    G.rules.set({ freeBuilding: saved.free, zombieAggro: saved.aggro });
    G.clock.setHour(saved.hour);
    me.gx = saved.gx;
    me.gy = saved.gy;
    me.layer = saved.layer;
    me.rise = saved.rise;
    me.auto = null;
    G.loop.advance(1 / 60);
    G.loop.setPaused(saved.paused);
  }
  return finish();
}
