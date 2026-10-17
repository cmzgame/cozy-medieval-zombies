// Run on the proving ground, http://localhost:8010/?map=square (the campfire and the cobbles it
// looks for are the square's; on the valley its rows fail by design).
// The ground's acceptance list as a script (docs/history/15-ground-build.md, "Accept when" (moved from docs/15 by the sweep, 2026-10-16)).
// Run it in the game's page, from the console:
//   const r = await __game.check("ground"); console.table(r.rows)
// It pauses the game, moves the player and the clock, and puts them back at
// the end. Check 10 is Michael's eye and is not scripted.

const C = 16;
const W = 1024;
const H = 512;
const left = (cx, cy) => (cx * C - cy * C - C) * 32;
const top = (cx, cy) => (cx * C + cy * C) * 16 - 16;

// Every world pixel of a chunk's box owned by exactly one of the chunk and its
// eight neighbours, at full alpha.
function seams(G, cx, cy) {
  const imgs = {};
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) imgs[`${cx + dx},${cy + dy}`] = G.bakeImage(cx + dx, cy + dy).data;
  let bad = 0;
  for (let py = 0; py < H; py++) {
    for (let px = 0; px < W; px++) {
      const wx = left(cx, cy) + px;
      const wy = top(cx, cy) + py;
      let n = 0;
      let full = true;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const a = cx + dx;
          const b = cy + dy;
          const qx = wx - left(a, b);
          const qy = wy - top(a, b);
          if (qx < 0 || qy < 0 || qx >= W || qy >= H) continue;
          const al = imgs[`${a},${b}`][(qy * W + qx) * 4 + 3];
          if (al > 0) {
            n++;
            if (al < 255) full = false;
          }
        }
      }
      if (n !== 1 || !full) bad++;
    }
  }
  return bad;
}

// The local tile owning a chunk pixel, or null.
function ownerOf(px, py) {
  const a = (px + 0.5) / 32 - 16;
  const b = (py + 0.5) / 16 - 1;
  const lx = Math.floor((a + b) / 2 + 0.5);
  const ly = Math.floor((b - a) / 2 + 0.5);
  return lx < 0 || ly < 0 || lx >= C || ly >= C ? null : [lx, ly];
}

// The brightness of the drawn frame at a grid point, read straight after a
// stepped frame (the drawing buffer is still there in the same task).
function brightnessAt(game, gx, gy, dy = 0) {
  const canvas = document.getElementById("game");
  const ctx = canvas.getContext("webgl2");
  const p = game.iso.toScreen(gx, gy);
  const k = canvas.width / game.view.view.w;
  const x = Math.round(p.x * k);
  const y = Math.round((p.y + dy) * k);
  const px = new Uint8Array(4);
  ctx.readPixels(x, canvas.height - 1 - y, 1, 1, ctx.RGBA, ctx.UNSIGNED_BYTE, px);
  return (px[0] + px[1] + px[2]) / 3;
}

// The whole drawn frame's pixels, read straight after a stepped frame.
function frame() {
  const canvas = document.getElementById("game");
  const ctx = canvas.getContext("webgl2");
  const px = new Uint8Array(canvas.width * canvas.height * 4);
  ctx.readPixels(0, 0, canvas.width, canvas.height, ctx.RGBA, ctx.UNSIGNED_BYTE, px);
  return px;
}

// How many pixels are brighter in b than in a.
function brighter(a, b) {
  let n = 0;
  for (let i = 0; i < a.length; i += 4) if (b[i] + b[i + 1] + b[i + 2] > a[i] + a[i + 1] + a[i + 2] + 9) n++;
  return n;
}

export async function run(game) {
  const G = game.ground;
  const rows = [];
  const add = (n, check, pass, detail) => rows.push({ n, check, result: pass ? "pass" : "FAIL", detail });
  const wasPaused = game.loop.isPaused();
  const startHour = game.clock.getHour();
  const start = [game.player.gx, game.player.gy];
  game.loop.setPaused(true);
  const step = (n = 1) => {
    for (let i = 0; i < n; i++) game.loop.advance(1 / 60);
  };
  const names = G.kindNames();
  const id = (n) => names.indexOf(n);

  // 1. No grid: nothing alternates by tile parity, and the grid lines draw only
  // in build or remove mode.
  {
    const img = G.bakeImage(14, -9).data;
    const sums = [[0, 0], [0, 0]];
    const kinds = G.kindMap(14, -9);
    for (let py = 0; py < H; py++) {
      for (let px = 0; px < W; px++) {
        const o = ownerOf(px, py);
        if (!o || kinds[py * W + px] !== 1) continue;
        const k = (py * W + px) * 4;
        const par = (o[0] + o[1]) % 2;
        sums[par][0] += img[k] + img[k + 1] + img[k + 2];
        sums[par][1]++;
      }
    }
    const even = sums[0][0] / sums[0][1] / 3;
    const odd = sums[1][0] / sums[1][1] / 3;
    // The grid: the whole frame read with build mode off, on, and off again;
    // the lines brighten thousands of pixels, and nothing else should change
    // much (a flame's flicker is all that moves while paused).
    game.clock.setHour(10);
    game.teleport(40, 40);
    step(3);
    const off = frame(game);
    game.placement.beginBuild(game.placement.buildKinds()[0]?.id || "wall");
    step(2);
    const on = frame(game);
    game.placement.cancel();
    step(2);
    const offAgain = frame(game);
    const lit = brighter(off, on);
    const stray = brighter(off, offAgain);
    const parityOk = Math.abs(even - odd) < 1;
    const gridOk = lit > 2000 && stray < 200;
    add(1, "No grid outside build mode", parityOk && gridOk, `grass mean on even and odd tiles ${even.toFixed(1)} and ${odd.toFixed(1)}; build mode brightens ${lit} pixels, leaving it ${stray}`);
  }

  // 2. No seams, at the square, the road, the bounds' edge, and the wild.
  {
    const where = [[0, 0], [1, 1], [2, 1], [14, -9]];
    const bad = where.map(([cx, cy]) => seams(G, cx, cy));
    add(2, "No seams at chunk borders", bad.every((b) => b === 0), `bad pixels ${bad.join(", ")} over ${where.length} chunk neighbourhoods`);
  }

  // 3. Pixel-crisp: no partial alpha anywhere; the bake does not depend on the camera.
  // A bake reads and never grows (docs/31/05, item 8): the chunks it reads are grown first.
  {
    game.map.ensureAround(8, 8, 1);
    let partial = 0;
    for (const [cx, cy] of [[0, 0], [1, 0], [1, 1]]) {
      const d = G.bakeImage(cx, cy).data;
      for (let i = 3; i < d.length; i += 4) if (d[i] > 0 && d[i] < 255) partial++;
    }
    game.teleport(5, 5);
    step();
    const h1 = G.hashChunk(1, 1);
    game.teleport(28, 26);
    step();
    const h2 = G.hashChunk(1, 1);
    add(3, "Pixel-crisp, edges still with the camera", partial === 0 && h1 === h2, `partial-alpha pixels ${partial}; bake with the camera at two places ${h1 === h2 ? "identical" : "different"}`);
  }

  // 4. Deterministic: twice, and a wild chunk twelve chunks out on two visits.
  // A bake reads and never grows (docs/31/05, item 8), so the far chunk is
  // grown first, as a visit would grow it.
  {
    const a = G.hashChunk(0, 0) === G.hashChunk(0, 0);
    game.map.ensureAround(13 * C + 8, C + 8, 1); // its neighbours too: a bake reads REACH_MAX tiles into them
    const before = G.hashChunk(13, 1);
    game.teleport(13 * C + 8, C + 8);
    step(5);
    game.teleport(start[0], start[1]);
    step(5);
    // Back at the start the far chunk has been evicted (wild, beyond eight chunks), and a bake
    // reads blank land where nothing is grown: grow it again, as a second visit would, then hash.
    game.map.ensureAround(13 * C + 8, C + 8, 1);
    const after = G.hashChunk(13, 1);
    add(4, "Deterministic", a && before === after, `same chunk twice ${a ? "identical" : "different"}; wild chunk (13, 1) before and after a visit ${before === after ? "identical" : "different"}`);
  }

  // 5. The verge: cobble and water never touch grass, across chunk borders.
  {
    const maps = {};
    const km = (a, b) => (maps[`${a},${b}`] ||= G.kindMap(a, b));
    const kindAt = (wx, wy, cands) => {
      for (const [a, b] of cands) {
        const qx = wx - left(a, b);
        const qy = wy - top(a, b);
        if (qx < 0 || qy < 0 || qx >= W || qy >= H) continue;
        const v = km(a, b)[qy * W + qx];
        if (v) return v;
      }
      return 0;
    };
    let touches = 0;
    let checked = 0;
    for (const [cx, cy] of [[0, 0], [1, 0], [0, 1], [1, 1]]) {
      const cands = [];
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) cands.push([cx + dx, cy + dy]);
      const m = km(cx, cy);
      for (let py = 0; py < H; py++) {
        for (let px = 0; px < W; px++) {
          const k = m[py * W + px];
          if (k !== id("cobble") && k !== id("water")) continue;
          checked++;
          const wx = left(cx, cy) + px;
          const wy = top(cx, cy) + py;
          for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (kindAt(wx + dx, wy + dy, cands) === 1) touches++;
        }
      }
    }
    add(5, "Cobble and water never touch grass", touches === 0, `${checked} cobble and water pixels, ${touches} beside grass`);
  }

  // 6. Lit as before: night darkens the ground, the torch and the campfire light it.
  {
    // Its own lit torch in the hand (the starting kit's torch begins unlit since #157), the hands put back after.
    const me = game.player;
    const hands0 = { main: me.hands.main, off: me.hands.off };
    me.hands.main = game.items.makeEntry("torch", 1, { lit: true, wear: 0 });
    me.hands.off = null;
    try {
    game.teleport(15, 15);
    game.clock.setHour(12);
    step(30);
    const noonFar = brightnessAt(game, 12, 12);
    game.clock.setHour(1);
    step(30);
    const nightFar = brightnessAt(game, 12, 12);
    const nightFire = brightnessAt(game, 17, 19);
    const nightFeet = brightnessAt(game, 15.4, 15.4);
    const ok = nightFar < noonFar * 0.7 && nightFire > nightFar * 1.4 && nightFeet > nightFar * 1.4;
    add(6, "Lit as before", ok, `cobble far from light: noon ${noonFar.toFixed(0)}, night ${nightFar.toFixed(0)}; beside the campfire at night ${nightFire.toFixed(0)}; at the torch-bearer's feet ${nightFeet.toFixed(0)}`);
    game.clock.setHour(10);
    step(5);
    } finally {
      me.hands.main = hands0.main;
      me.hands.off = hands0.off;
    }
  }

  // 7. Shadows and leaves follow the trees.
  {
    let tree = null;
    for (let r = 1; r < 8 && !tree; r++) {
      for (let y = 20 - r; y <= 20 + r && !tree; y++) {
        for (let x = 6 - r; x <= 6 + r && !tree; x++) {
          const p = game.map.tileAt(x, y).prop;
          if (p && game.assets.getDef(p.sprite).shadow) tree = p;
        }
      }
    }
    const [tx, ty] = tree.tile;
    const cx = Math.floor(tx / C);
    const cy = Math.floor(ty / C);
    const sx = (tx - ty) * 32 - left(cx, cy);
    const sy = (tx + ty) * 16 - top(cx, cy) + 3;
    const at = () => {
      const d = G.bakeImage(cx, cy).data;
      const k = (sy * W + sx) * 4;
      return d[k] + d[k + 1] + d[k + 2];
    };
    game.teleport(tx + 2, ty + 2);
    step(3);
    const shaded = at();
    const n0 = G.stats().baked;
    game.map.removeProp(tree);
    step();
    const rebaked = G.stats().baked > n0;
    const felled = at();
    game.map.placeProp(tree, tx, ty);
    step();
    const back = at();
    let wrong = 0;
    let leaves = 0;
    for (const [a, b] of [[0, 1], [1, 1], [14, -9], [-6, 4]]) {
      for (const d of G.decalsFor(a, b)) {
        if (d.id !== "leaves") continue;
        leaves++;
        if (d.near === "brown" && d.colour !== "brown") wrong++;
        if (d.near && d.near !== "brown" && d.colour !== d.near && d.colour !== "brown") wrong++;
      }
    }
    const ok = felled > shaded && back === shaded && rebaked && wrong === 0;
    add(7, "Shadows and leaves follow the trees", ok, `ground under a tree ${shaded}, felled ${felled} (re-baked next frame: ${rebaked}), replaced ${back}; ${leaves} leaf decals, ${wrong} in a wrong colour`);
  }

  // 8 and 9. Nothing materialises in view; the bake and memory budgets. A walk
  // of twelve chunks out and back at twelve tiles a second, faster than a run.
  {
    game.teleport(start[0], start[1]);
    step(10);
    const sync0 = G.stats().syncBakes;
    let last = G.stats().baked;
    const ms = [];
    let maxTex = 0;
    const walk = (fromX, toX, y) => {
      const dir = Math.sign(toX - fromX);
      for (let x = fromX; dir > 0 ? x <= toX : x >= toX; x += dir * 0.2) {
        game.teleport(x, y);
        step();
        const s = G.stats();
        maxTex = Math.max(maxTex, s.textures);
        if (s.baked !== last) {
          ms.push(s.lastMs);
          last = s.baked;
        }
      }
    };
    walk(start[0], start[0] + 12 * C, start[1]);
    walk(start[0] + 12 * C, start[0], start[1]);
    const sync = G.stats().syncBakes - sync0;
    ms.sort((a, b) => a - b);
    const median = ms[ms.length >> 1];
    const worst = ms[ms.length - 1];
    add(8, "Nothing materialises in view", sync === 0, `${sync} chunks had to be baked at draw time during the walk (each would be a hitch, never a hole)`);
    add(9, "Budget", worst <= 16 && maxTex <= 36, `${ms.length} bakes: median ${median.toFixed(1)} ms, worst ${worst.toFixed(1)} ms (budget 16); at most ${maxTex} chunk textures (cap 36)`);
  }

  rows.push({ n: 10, check: "A forest edge with a clearing matches the mockup in feel", result: "Michael", detail: "his eye, not scripted" });

  game.teleport(start[0], start[1]);
  game.clock.setHour(startHour);
  step(3);
  game.loop.setPaused(wasPaused);
  return { rows, passed: rows.filter((r) => r.result === "pass").length, of: rows.filter((r) => r.result !== "Michael").length };
}
