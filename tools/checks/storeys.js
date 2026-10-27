// The storeys (docs/49 steps 2 and 3), read in the pane on the proving ground's tower house (?map=square&nosave&mute) or the valley's tall
// house: the player walks up the stair by its auto-walk (the step's own movement, as a guest's prediction runs it), its rise climbing, onto
// the first floor past the top edge; the frame is read by pixels with the probe's mark (render/scene.js): the player drawn upstairs at its
// height, its feet a storey up on screen; the hiding rule (the storey above hidden over the building you stand in, every storey drawn from
// outside); the floor written in the depth buffer (a body on the ground under it hidden); and back down. Everything is put back.
//   await __game.check("storeys")

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
    row("this tab is the host", false, "the check walks the world: run it alone or on the host");
    return finish();
  }
  const map = G.map;
  const b = map.buildings().find((q) => q.set === "the tower house" || q.set === "the tall house");
  if (!b) {
    row("a house with a storey on this map", false, "open ?map=square or the valley");
    return finish();
  }
  const s = map.stairs().find((q) => q.building === b.id && q.layer === 0);
  const scene = await import("/src/render/scene.js");
  const ctx = G.gl.gl;
  const canvas = ctx.canvas;
  const me = G.player;
  const saved = { paused: G.loop.isPaused(), gx: me.gx, gy: me.gy, layer: me.layer || 0, rise: me.rise || 0, aggro: G.rules.rules.zombieAggro, hour: G.clock.getHour() };
  const walk = (path, n) => {
    me.auto = { path, tiles: [path[path.length - 1]], range: 0, onArrive: null, goalTile: path[path.length - 1] };
    const log = [];
    for (let i = 0; i < n; i++) {
      G.loop.advance(1 / 60);
      log.push([me.layer || 0, me.rise || 0]);
    }
    me.auto = null;
    return log;
  };
  // The frame drawn now with `is` marked in red, and the red pixels' count and their lowest row (the feet).
  const red = (is) => {
    scene.probe.mark = { is, color: [1, 0, 0] };
    try {
      G.loop.advance(0);
    } finally {
      scene.probe.mark = null;
    }
    const W = canvas.width;
    const H = canvas.height;
    const px = new Uint8Array(W * H * 4);
    ctx.readPixels(0, 0, W, H, ctx.RGBA, ctx.UNSIGNED_BYTE, px);
    let n = 0;
    let low = -1;
    for (let i = 0; i < W * H; i++) {
      const j = i * 4;
      if (px[j] > 200 && px[j + 1] < 40 && px[j + 2] < 40) {
        n++;
        const yUp = Math.floor(i / W);
        if (low < 0 || yUp < low) low = yUp; // readPixels rows run bottom up: the smallest is the lowest on screen
      }
    }
    return { n, low: low < 0 ? -1 : H - 1 - low };
  };
  G.loop.setPaused(true);
  G.rules.set({ zombieAggro: false });
  G.clock.setHour(12);
  try {
    G.teleport(s.before[0], s.before[1]);
    me.layer = 0;
    me.rise = 0;
    G.loop.advance(1 / 60);
    const outside = { x: b.rect[0] + Math.floor(b.rect[2] / 2), y: b.rect[1] + b.rect[3] + 2 };
    // 1. Up the stair: the rise climbs a crate a tile, the layer changes past the top edge.
    const path = [...s.tiles, [s.landing[0], s.landing[1]]];
    const log = walk(path, 240);
    const rises = log.filter(([l]) => l === 0).map(([, r]) => r);
    const climbed = rises.length && Math.max(...rises) > 80 && rises.some((r) => r > 20 && r < 60);
    row("the player walks up the stair, its rise climbing to a storey, onto the first floor past the top edge", climbed && me.layer === 1 && (me.rise || 0) === 0, `layer ${me.layer}, rise ${me.rise || 0}, the highest rise on the stair ${rises.length ? Math.max(...rises).toFixed(0) : "-"}`);
    // 2. Drawn upstairs: the player's own pixels, its feet a storey up from where the ground under it is drawn. Stood first a tile in
    // from the house's north-west corner, clear of any stair to a storey above (whose steps would stand in front of it).
    me.gx = b.rect[0] + 1;
    me.gy = b.rect[1] + 0.6;
    G.loop.advance(1 / 60);
    const iso = await import("/src/iso.js");
    const up = red((d) => d.entity === me);
    const k = canvas.width / G.view.view.w;
    const groundY = (iso.toScreen(me.gx, me.gy).y) * k;
    row("drawn upstairs, the player's own pixels in the frame", up.n > 200, `${up.n} px`);
    row("its feet about a storey (96 px) above the ground under it on screen", up.low > 0 && groundY - up.low > 60 * k && groundY - up.low < 130 * k, `feet at ${up.low}, the ground point at ${groundY.toFixed(0)}, ${((groundY - up.low) / k).toFixed(0)} world px up`);
    // 3. The hiding rule: inside, a storey above yours over the building is not drawn; the storey you stand on is.
    const st = await import("/src/render/storeys.js");
    const hide = st.hiderFor(me);
    const above = b.layers.filter((l) => l > me.layer);
    row("the hiding rule: inside, every storey above yours over this building is hidden", above.every((l) => hide(b.rects[l][0], b.rects[l][1], l)) && !hide(b.rects[1][0], b.rects[1][1], 1), `layers above ${above.join(",") || "none"}`);
    // 4. The floor hides what is under it: a body on the ground right under the upstairs player is not drawn where the floor covers it.
    const S = G.game.state;
    const villager = S.villagers[0];
    let under = null;
    if (villager) {
      const was = { gx: villager.gx, gy: villager.gy, layer: villager.layer || 0, state: villager.state };
      villager.gx = b.rect[0] + 6; // well inside the house, under the middle of the first floor
      villager.gy = b.rect[1] + 4;
      villager.layer = 0;
      under = red((d) => d.entity === villager);
      Object.assign(villager, was);
    }
    row("a body on the ground under the first floor is hidden by the floor's depth", under && under.n < 60, under ? `${under.n} px of it drawn` : "no villager to stand there");
    // 5. Outside, every storey is drawn (nothing hidden).
    G.teleport(outside.x, outside.y);
    me.layer = 0;
    me.rise = 0;
    G.loop.advance(1 / 60);
    const hideOut = st.hiderFor(me);
    row("outside, no storey of the house is hidden", b.layers.every((l) => !hideOut(b.rects[l][0], b.rects[l][1], l)));
    // 5b. The storeys' seam (Michael's playtest, 2026-10-27): a wall or post of the house with one on the storey above draws no cap of
    // its own, and the one standing on it is drawn a step nearer, so the two read as one face; a wall with nothing over it keeps its cap.
    const seen = [];
    scene.probe.skip = (d) => {
      if (d.kind === "wall" && d.stack) seen.push({ L: map.drawLayerNow(), at: d.wall || d.post, edge: d.wall ? d.wall.edge : null, stack: d.stack });
      return false;
    };
    try {
      G.loop.advance(0);
    } finally {
      scene.probe.skip = null;
    }
    const inHouse = (q) => q.at.tx >= b.rect[0] - 1 && q.at.tx <= b.rect[0] + b.rect[2] + 1 && q.at.ty >= b.rect[1] - 1 && q.at.ty <= b.rect[1] + b.rect[3] + 1;
    const mine = seen.filter(inHouse);
    const wallAt = (q, l) => {
      const t = map.peekTile(q.at.tx, q.at.ty, l);
      return !!(t && t[q.edge]);
    };
    const walls = mine.filter((q) => q.edge);
    const wrong = walls.filter((q) => q.stack.covered !== wallAt(q, q.L + 1) || q.stack.onWall !== (q.L !== 0 && wallAt(q, q.L - 1)));
    const covered = walls.filter((q) => q.L === 0 && q.stack.covered).length;
    const onWall = walls.filter((q) => q.L === 1 && q.stack.onWall).length;
    const posts = mine.filter((q) => !q.edge);
    row("the seam: a wall of the house with a wall over it draws no cap, the wall on it is drawn a step nearer; the posts alike", walls.length > 10 && covered > 10 && onWall > 10 && !wrong.length && posts.some((q) => q.L === 0 && q.stack.covered) && posts.some((q) => q.L === 1 && q.stack.onWall), `${walls.length} walls (${covered} covered on the ground, ${onWall} on a wall upstairs), ${posts.length} posts; ${wrong.length} wrong${wrong.length ? `: ${wrong.slice(0, 3).map((q) => `${q.at.tx},${q.at.ty},${q.edge} L${q.L}`).join(" ")}` : ""}`);
    // 6. Back down: from the landing over the top edge, the rise falling, off the foot on the ground.
    G.teleport(s.landing[0], s.landing[1]);
    me.layer = 1;
    me.rise = 0;
    G.loop.advance(1 / 60);
    const down = walk([s.tiles[2], s.tiles[1], s.tiles[0], s.before], 260);
    row("down again: over the top edge onto the stair, the rise falling, off its foot on the ground", me.layer === 0 && (me.rise || 0) === 0 && down.some(([l, r]) => l === 0 && r > 60), `layer ${me.layer}, rise ${me.rise || 0}`);
  } finally {
    scene.probe.skip = null;
    scene.probe.mark = null;
    me.gx = saved.gx;
    me.gy = saved.gy;
    me.layer = saved.layer;
    me.rise = saved.rise;
    me.auto = null;
    G.teleport(saved.gx, saved.gy);
    G.rules.set({ zombieAggro: saved.aggro });
    G.clock.setHour(saved.hour);
    G.loop.setPaused(saved.paused);
  }
  return finish();
}
