// Chunks and the dead bounded (docs/23a, B1, B2): walking far drops the wild
// chunks left behind and puts their dead to sleep; coming back grows the same
// chunks and wakes the same dead; the village is never dropped. From the
// console: await __game.check("eviction")
// It pauses the loop, teleports the player far and back, and restores the
// position and the pause. In a hosted world every other player is moved with
// the host's (three tiles apart), and two rows more: the host alone far keeps
// every chunk round each other player (its eviction counts every player, the
// guests among them), and its frames name the chunks it drops (`evicted`,
// protocol 10).
//
// The guest's half (the bug of 2026-10-18: far from the spawn the host had
// dropped chunks a guest still held, and check("sync")'s map and registry
// differed). Two tabs, `?nosave&relay=none`, the second joined by
// `__game.net.open({ join })`, both paused; then
//   host:  await __game.check("eviction", { keep: true })
//          the rows above, then every player left 400 tiles off with the wild
//          behind them dropped, and the sync reports on
//   both:  step in turn, sixty frames or more each (the guest still)
//   guest: await __game.check("eviction")
//          my replica dropped the chunks the host's frames named, and holds no
//          wild chunk the host's own rule would have dropped
//   host:  await __game.check("sync")   the map and the registry agree far off
// Bring them home after with __game.teleport on the host (the guests' players
// by their gx, gy there).

export async function run(game, opts = {}) {
  const { far = 400, keep = false } = opts;
  const G = game;
  const map = G.map;
  const S = G.game.state;
  const R = G.tuning.world.evictChunks;
  const rows = [];
  const row = (check, ok, detail) => rows.push({ check, result: ok ? "pass" : "FAIL", detail });
  const wasPaused = G.loop.isPaused();
  const steps = (n) => { for (let i = 0; i < n; i++) G.loop.advance(1 / 60); };
  const role = G.net.status().role;
  const at = (c) => (c.netTo ? c.netTo : [c.gx, c.gy]); // a replica's smoothing target is the host's truth (netsmooth.js)
  const chunkOf = (c) => map.chunkCoord(Math.round(at(c)[0]), Math.round(at(c)[1]));
  // The host's own rule (game.begin, map.evictFar): a wild chunk unchanged by play, on layer 0, with no villager in it and
  // more than `evictChunks` from every player, is dropped.
  const wouldDrop = (c) => {
    if (!c.wild || c.dirty || c.layer !== 0) return false;
    if (S.villagers.some((v) => { const [vx, vy] = chunkOf(v); return vx === c.cx && vy === c.cy; })) return false;
    return !S.players.some((p) => { const [px, py] = chunkOf(p); return Math.max(Math.abs(c.cx - px), Math.abs(c.cy - py)) <= R; });
  };

  if (role === "guest") {
    try {
      G.loop.setPaused(true);
      steps(10); // the frames waiting in the inbox applied
      const st = G.net.status();
      const held = [...map.loadedChunks()].filter(wouldDrop);
      row("on a guest my replica dropped the chunks the host's frames named (run after the host's keep run)", st.evicted.dropped > 0, `${st.evicted.dropped} dropped over ${st.framesSeen} frames`);
      row("on a guest my replica holds no wild chunk the host's rule would have dropped", held.length === 0, `${held.length} held${held.length ? ` (${held.slice(0, 6).map((c) => `${c.cx},${c.cy}`).join(" ")}${held.length > 6 ? " ..." : ""})` : ""}; ${map.chunkCount()} chunks, ${map.allProps().length} props here; the host's own counts are check("sync")'s`);
      const me = G.player;
      const [mx, my] = map.chunkCoord(Math.round(me.gx), Math.round(me.gy));
      let missing = 0;
      for (let dy = -4; dy <= 4; dy++) for (let dx = -4; dx <= 4; dx++) if (!map.getChunk(mx + dx, my + dy, false)) missing++;
      row("on a guest the ring round my own player is all here", missing === 0, `${missing} of 81 missing round ${mx},${my}`);
    } finally {
      G.loop.setPaused(wasPaused);
    }
    for (const r of rows) console.log(`${r.result}  ${r.check}  (${r.detail})`);
    return { rows, fails: rows.filter((r) => r.result === "FAIL").length };
  }

  const me = G.player;
  const others = S.players.filter((p) => p !== me);
  const homes = new Map([me, ...others].map((p) => [p, [p.gx, p.gy]]));
  const gx0 = me.gx;
  const gy0 = me.gy;
  // Every player to (x, y), the others three tiles apart, or the host's alone.
  const moveTo = (x, y, all = true) => {
    G.teleport(x, y);
    if (!all) return;
    others.forEach((p, i) => { p.gx = x + 3 * (i + 1); p.gy = y; p.auto = null; });
  };
  const home = () => {
    G.teleport(gx0, gy0);
    for (const p of others) { const [x, y] = homes.get(p); p.gx = x; p.gy = y; p.auto = null; }
  };
  let left = false;
  try {
    G.loop.setPaused(true);
    steps(5);
    const chunks0 = map.chunkCount();
    const ids0 = new Set(G.zombies.map((z) => z.id));
    const authored = [...map.loadedChunks()].filter((c) => !c.wild).length;
    moveTo(gx0 + far, gy0 + far);
    steps(60);
    const chunksFar = map.chunkCount();
    const idsFar = new Set(G.zombies.map((z) => z.id));
    const gone = [...ids0].filter((id) => !idsFar.has(id)).length;
    const authoredFar = [...map.loadedChunks()].filter((c) => !c.wild).length;
    rows.push({ check: "far away, the chunks behind are dropped", result: chunksFar < chunks0 + 100 && chunksFar <= 17 * 17 + authored ? "pass" : "FAIL", detail: `${chunks0} chunks at home, ${chunksFar} far away (${authoredFar} authored kept of ${authored})` });
    rows.push({ check: "the village is never dropped", result: authoredFar === authored ? "pass" : "FAIL", detail: `${authoredFar} of ${authored} authored chunks loaded` });
    rows.push({ check: "the dead left behind sleep", result: gone > 0 ? "pass" : "FAIL", detail: `${gone} of ${ids0.size} dead asleep on their chunks' records` });
    const totalFar = G.zombies.length + map.sleepingCount(); // the dead met so far: at home, plus those rolled out there
    home();
    steps(60);
    const idsBack = new Set(G.zombies.map((z) => z.id));
    const woke = [...ids0].filter((id) => idsBack.has(id)).length;
    const extra = [...idsBack].filter((id) => !ids0.has(id)).length;
    const total = G.zombies.length + map.sleepingCount();
    // Boot grows a ring of 4 and a step a ring of 3, so the dead between stay asleep until walked to.
    rows.push({ check: "back home, the dead near wake, none is lost, none is rolled twice", result: woke > 0 && extra === 0 && total === totalFar ? "pass" : "FAIL", detail: `${woke} of ${ids0.size} awake at home, ${extra} new; living plus sleeping ${total} (was ${totalFar} far away)` });
    rows.push({ check: "the chunk count is bounded", result: map.chunkCount() <= chunksFar + 1 ? "pass" : "FAIL", detail: `${map.chunkCount()} chunks loaded after the round trip, ${map.sleepingCount()} dead asleep` });

    if (others.length) {
      // The host alone far: the others' rings stay, since the eviction keeps every chunk within `evictChunks` of any player.
      moveTo(gx0 + far, gy0 + far, false);
      steps(60);
      let missing = 0;
      for (const p of others) {
        const [pcx, pcy] = map.chunkCoord(Math.round(p.gx), Math.round(p.gy));
        for (let dy = -4; dy <= 4; dy++) for (let dx = -4; dx <= 4; dx++) if (!map.getChunk(pcx + dx, pcy + dy, false)) missing++;
      }
      row("the host alone far keeps the ring round every other player (its eviction counts the guests)", missing === 0, `${missing} of ${81 * others.length} chunks missing round ${others.length} other player${others.length === 1 ? "" : "s"}`);
      home();
      steps(60);
    }

    if (keep) {
      // Left far for the guest's half: every player 400 tiles off, the wild behind dropped, and the frames naming it.
      const sent0 = G.net.status().evicted.sent;
      moveTo(gx0 + far, gy0 + far);
      steps(120);
      left = true;
      const st = G.net.status();
      const guests = st.role === "host" ? st.guests.length : 0;
      row("kept far: every player 400 tiles off and the host's frames name the chunks it dropped (a hosted world with a guest)", guests > 0 && st.evicted.sent > sent0, `${st.evicted.sent - sent0} named to ${guests} guest${guests === 1 ? "" : "s"}; ${map.chunkCount()} chunks, ${map.allProps().length} props on the host`);
      const held = [...map.loadedChunks()].filter(wouldDrop);
      row("kept far: the host holds no wild chunk its own rule would drop", held.length === 0, `${held.length} held`);
      if (st.role === "host") G.net.setSyncReports(true); // for check("sync") after both tabs have stepped
    }
  } finally {
    if (!left) home();
    G.loop.setPaused(wasPaused);
  }
  for (const r of rows) console.log(`${r.result}  ${r.check}  (${r.detail})`);
  return { rows, fails: rows.filter((r) => r.result === "FAIL").length };
}
