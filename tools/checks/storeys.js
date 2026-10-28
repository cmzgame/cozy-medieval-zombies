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
    // 5c. A post on a post draws no foot (the seam, 2026-10-27): of the pixels an upper post standing on one gives the frame in the band
    // round the seam (the frame with it against the frame without it), none is the grey of a timber post's stone foot.
    const upperPosts = posts.filter((q) => q.L === 1 && q.stack.onWall);
    const frame = () => {
      G.loop.advance(0);
      const W = canvas.width;
      const H = canvas.height;
      const px = new Uint8Array(W * H * 4);
      ctx.readPixels(0, 0, W, H, ctx.RGBA, ctx.UNSIGNED_BYTE, px);
      return px;
    };
    let footGrey = 0;
    let footSeen = 0;
    {
      const k = canvas.width / G.view.view.w;
      const withPosts = frame();
      scene.probe.skip = (d) => d.kind === "wall" && !!d.post && map.drawLayerNow() === 1 && !!(d.stack && d.stack.onWall);
      let without;
      try {
        without = frame();
      } finally {
        scene.probe.skip = null;
      }
      for (const q of upperPosts) {
        const v = iso.toScreen(q.at.tx - 0.5, q.at.ty - 0.5); // the ground vertex; the seam is a storey up
        const cx = Math.round(v.x * k);
        const cy = Math.round((v.y - map.STOREY) * k);
        for (let y = cy - Math.round(12 * k); y <= cy + Math.round(12 * k); y++) {
          for (let x = cx - Math.round(18 * k); x <= cx + Math.round(18 * k); x++) {
            if (x < 0 || y < 0 || x >= canvas.width || y >= canvas.height) continue;
            const j = ((canvas.height - 1 - y) * canvas.width + x) * 4;
            if (Math.abs(withPosts[j] - without[j]) + Math.abs(withPosts[j + 1] - without[j + 1]) + Math.abs(withPosts[j + 2] - without[j + 2]) < 24) continue;
            footSeen++;
            const r = withPosts[j];
            const gC = withPosts[j + 1];
            const bC = withPosts[j + 2];
            if (r > 100 && r - bC < 22 && Math.abs(r - gC) < 12) footGrey++; // the stone foot's greys (170,164,154 and 142,136,127, lit)
          }
        }
      }
    }
    row("the seam: a post standing on a post draws no stone foot (its shaft runs on into the post below)", upperPosts.length > 0 && footSeen > 50 && footGrey < 6, `${upperPosts.length} posts on posts, ${footSeen} px of theirs round the seam, ${footGrey} of the foot's grey`);
    // 5d. A storey you stand behind fades (docs/49 section 6): behind the house, where its first floor covers the player's body on screen,
    // the storey is drawn at the near-wall fade's alpha and the player's own pixels show through it; with the fade off they are hidden
    // there, so it is the storey that covers them. A thing's share of a pixel is read as the difference between the frame with it drawn
    // in red and in green (a figure behind a translucent storey is blended, never pure red). In front, the house is opaque; inside it
    // and upstairs, nothing fades.
    const share = (is) => {
      const grab = (color) => {
        scene.probe.mark = { is, color };
        try {
          return frame();
        } finally {
          scene.probe.mark = null;
        }
      };
      const a = grab([1, 0, 0]);
      const g = grab([0, 1, 0]);
      let n = 0;
      let sum = 0;
      let max = 0;
      for (let i = 0; i < a.length; i += 4) {
        const d = a[i] - g[i];
        if (d > 40) {
          n++;
          sum += d;
          if (d > max) max = d;
        }
      }
      return { n, mean: n ? Math.round(sum / n) : 0, max };
    };
    const stand = (x, y, layer = 0) => {
      G.teleport(x, y);
      me.layer = layer;
      me.rise = 0;
      G.loop.advance(1 / 60);
    };
    const r1 = b.rects[1];
    const storeyWall = (d) => d.kind === "wall" && map.drawLayerNow() === 1 && !!(d.wall || d.post) && (() => { const q = d.wall || d.post; return q.tx >= r1[0] - 1 && q.tx <= r1[0] + r1[2] + 1 && q.ty >= r1[1] - 1 && q.ty <= r1[1] + r1[3] + 1; })();
    const fadeOf = () => scene.lastStats.faded.split(",").includes(`${b.id}:1`);
    // The player's whole figure, alone in the frame (everything else left out).
    stand(outside.x, outside.y + 2);
    scene.probe.skip = (d) => d.entity !== me;
    let whole;
    try {
      whole = share((d) => d.entity === me);
    } finally {
      scene.probe.skip = null;
    }
    // The spots behind: west of the house and north of it, where the first floor covers the body and the ground storey does not
    // (st.storeyCovers), the clearest of each side (a tree may stand in front of some).
    const sides = { west: [], north: [] };
    for (let d = 2; d <= 7; d++) {
      for (let t = 0; t <= Math.max(r1[2], r1[3]); t++) {
        sides.west.push([r1[0] - d, r1[1] + t]);
        sides.north.push([r1[0] + t, r1[1] - d]);
      }
    }
    const behind = {};
    for (const [side, spots] of Object.entries(sides)) {
      let best = null;
      for (const [x, y] of spots) {
        const at = { gx: x, gy: y, layer: 0, rise: 0 };
        if (!st.storeyCovers(at, r1, 1) || st.storeyCovers(at, b.rects[0], 0) || map.buildingAt(x, y, 0)) continue;
        stand(x, y);
        const pl = share((d) => d.entity === me);
        if (!best || pl.n > best.pl.n) best = { x, y, pl, faded: fadeOf(), storey: share(storeyWall) };
        if (pl.n >= whole.n * 0.95) break;
      }
      behind[side] = best;
    }
    for (const [side, s0] of Object.entries(behind)) {
      if (!s0) {
        row(`behind the house (${side}): a spot where the first floor covers the player`, false, "none found");
        continue;
      }
      row(`behind the house (${side}, at ${s0.x},${s0.y}): the first floor fades, its walls drawn at the near-wall fade's alpha`, s0.faded && s0.storey.n > 1000 && s0.storey.mean > 0.32 * 255 && s0.storey.mean < 0.52 * 255, `faded ${s0.faded}; the storey's walls ${s0.storey.n} px at a mean share of ${(s0.storey.mean / 255).toFixed(2)}`);
      row(`behind the house (${side}): the player's own pixels show through it`, s0.pl.n >= whole.n * 0.8 && s0.pl.max > 0.45 * 255, `${s0.pl.n} of its ${whole.n} px, their share up to ${(s0.pl.max / 255).toFixed(2)}`);
      stand(s0.x, s0.y);
      scene.storeyFade.on = false;
      let off;
      try {
        off = share((d) => d.entity === me);
      } finally {
        scene.storeyFade.on = true;
      }
      row(`behind the house (${side}): with the fade off the storey hides them (it is the storey that covers them there)`, off.n < whole.n * 0.5, `${off.n} of ${whole.n} px drawn with the fade off`);
    }
    // At night, the same spot: the player's figure still changes the frame through the faded storey (its pixels drawn against left out).
    if (behind.west) {
      G.clock.setHour(23);
      stand(behind.west.x, behind.west.y);
      const diff = (fadeOn) => {
        scene.storeyFade.on = fadeOn;
        try {
          const a = frame();
          scene.probe.skip = (d) => d.entity === me;
          let c;
          try {
            c = frame();
          } finally {
            scene.probe.skip = null;
          }
          let n = 0;
          for (let i = 0; i < a.length; i += 4) if (Math.abs(a[i] - c[i]) + Math.abs(a[i + 1] - c[i + 1]) + Math.abs(a[i + 2] - c[i + 2]) > 9) n++;
          return n;
        } finally {
          scene.storeyFade.on = true;
        }
      };
      const nightOn = diff(true);
      const nightFaded = fadeOf();
      const nightOff = diff(false);
      row("at night, behind the house: the player is seen through the faded storey, and not with the fade off", nightFaded && nightOn >= whole.n * 0.6 && nightOff < nightOn * 0.5, `${nightOn} px of the frame are the player's with the fade, ${nightOff} without (its whole figure ${whole.n})`);
      G.clock.setHour(12);
    }
    // The fade's own pass: the storey's opaque quads in PASS_FADE, none in the frame when nothing fades.
    if (behind.west) stand(behind.west.x, behind.west.y);
    G.loop.advance(0);
    const fadeQuads = G.gl.depthInfo().passes[G.gl.PASS_FADE];
    // In front, south and east: opaque, nothing faded.
    const front = [];
    for (const [x, y] of [[r1[0] + Math.floor(r1[2] / 2), r1[1] + r1[3] + 2], [r1[0] + r1[2] + 2, r1[1] + Math.floor(r1[3] / 2)]]) {
      stand(x, y);
      const sw = share(storeyWall);
      front.push({ x, y, faded: scene.lastStats.faded, mean: sw.mean, n: sw.n, fadeQuads: G.gl.depthInfo().passes[G.gl.PASS_FADE] });
    }
    row("the faded storey's quads are drawn in the fade pass (gl PASS_FADE), and none in front", fadeQuads > 100 && front.every((f) => f.fadeQuads === 0), `${fadeQuads} vertices behind; in front ${front.map((f) => f.fadeQuads).join(", ")}`);
    row("in front of the house (south and east): the first floor is opaque, nothing fades", front.every((f) => !f.faded && f.n > 1000 && f.mean > 250), front.map((f) => `${f.x},${f.y}: faded ${f.faded || "none"}, walls ${f.n} px at ${(f.mean / 255).toFixed(2)}`).join("; "));
    // Inside the house and upstairs: nothing fades (its own storeys above are hidden by the hiding rule, as before).
    stand(r1[0] + 1, r1[1] + 1);
    G.loop.advance(0);
    const inside = scene.lastStats.faded;
    stand(s.landing[0], s.landing[1], 1);
    G.loop.advance(0);
    const upstairs = scene.lastStats.faded;
    row("inside the house and upstairs, nothing fades", !inside && !upstairs, `inside: ${inside || "none"}; upstairs: ${upstairs || "none"}`);
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
