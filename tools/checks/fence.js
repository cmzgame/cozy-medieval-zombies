// A crowd bursts a fence (Michael, 2026-10-17, #147): one of the dead pressing a fence does nothing; several together wear it
// until it bursts into splinters (the event every client draws) and is gone; a gate goes first; a fence under pressure
// shakes. From the console, on a tab with `?nosave`:
//   await __game.check("fence")
// It builds a ring of fence round the player on open ground (so the dead have no way round), presses one dead, then four,
// and takes the ring down again. It turns zombie aggro on and restores it, and puts the dead it moved back.

export async function run(game) {
  const G = game;
  const rows = [];
  const row = (check, ok, detail) => rows.push({ check, result: ok ? "pass" : "FAIL", detail });
  const wasPaused = G.loop.isPaused();
  const aggro0 = G.rules.rules.zombieAggro;
  const hour0 = G.clock.getHour();
  const me = G.player;
  const meAt = [me.gx, me.gy];
  const step = (n = 1) => { for (let i = 0; i < n; i++) G.loop.advance(1 / 60); };
  const restore = [];
  const bursts = [];
  const shakes = [];
  const offBurst = G.events.on("fenceBurst", (e) => bursts.push(e));
  const offShake = G.events.on("fenceShake", (e) => shakes.push(e));
  try {
    G.loop.setPaused(true);
    G.rules.set({ zombieAggro: true });
    G.clock.setHour(12);
    // Open ground: a tile with eight clear tiles round and ten more north of it.
    let c = null;
    for (let y = 120; y < 240 && !c; y += 3) {
      for (let x = 30; x < 230 && !c; x += 3) {
        let clear = true;
        for (let dy = -5; dy <= 4 && clear; dy++) for (let dx = -4; dx <= 4 && clear; dx++) clear = G.map.isWalkableTile(x + dx, y + dy) && G.map.tileAt(x + dx, y + dy).room === 0 && !G.map.tileAt(x + dx, y + dy).n && !G.map.tileAt(x + dx, y + dy).w;
        if (clear) c = [x, y];
      }
    }
    if (!c) {
      row("open ground for a fenced yard was found", false, "none in the loaded map");
      return finish();
    }
    const [cx, cy] = c;
    // A 3 by 3 yard of fence: the tiles cx-1..cx+1, cy-1..cy+1, enclosed.
    const ring = [];
    for (let x = cx - 1; x <= cx + 1; x++) { ring.push([x, cy - 1, "n"]); ring.push([x, cy + 2, "n"]); }
    for (let y = cy - 1; y <= cy + 1; y++) { ring.push([cx - 1, y, "w"]); ring.push([cx + 2, y, "w"]); }
    for (const [x, y, e] of ring) G.map.buildWall(x, y, e, "wall", "wall_fence");
    restore.push(() => { for (const [x, y, e] of ring) if (G.map.tileAt(x, y)[e]) G.map.destroyWall(x, y, e); });
    row("a yard of fence stands round the player", ring.every(([x, y, e]) => G.map.isFence(G.map.tileAt(x, y)[e])), `${ring.length} edges at ${cx},${cy}`);
    G.teleport(cx, cy);
    const dead = G.zombies.filter((q) => !q.dead && !q.corpse).slice(0, 4);
    for (const o of G.zombies) if (!dead.includes(o) && !o.dead && Math.hypot(o.gx - cx, o.gy - cy) < 60) { const keep = { gx: o.gx, gy: o.gy, aggro: o.aggro }; restore.push(() => Object.assign(o, keep, { path: [] })); o.aggro = false; o.gx = cx + 90; o.gy = cy + 90; }
    for (const z of dead) { const keep = { gx: z.gx, gy: z.gy, state: z.state, aggro: z.aggro }; restore.push(() => Object.assign(z, keep, { path: [], breach: null, noWay: 0 })); }
    const north = [cx, cy - 1, "n"]; // the middle of the north side: the edge the dead press
    const place = (z, ox) => { z.gx = cx + ox; z.gy = cy - 2.05; z.path = []; z.breach = null; z.state = "chase"; z.aggro = true; z.noWay = 0; z.lastSeen = [cx, cy]; };

    // One alone: it presses and nothing happens.
    place(dead[0], 0);
    for (const z of dead.slice(1)) { z.gx = cx + 80; z.gy = cy + 80; z.aggro = false; z.state = "idle"; }
    step(60 * 40);
    row("one of the dead pressing a fence does nothing", G.map.isFence(G.map.tileAt(...north.slice(0, 2))[north[2]]) && bursts.length === 0, `forty seconds, ${bursts.length} bursts, ${shakes.length} shakes, at ${dead[0].gx.toFixed(2)},${dead[0].gy.toFixed(2)} state ${dead[0].state}`);

    // Four together: it shakes, then bursts.
    [-0.45, -0.15, 0.15, 0.45].forEach((ox, i) => place(dead[i], ox));
    step(60 * 3);
    row("a crowd pressing it makes it shake (the host's event for every client)", shakes.length > 0 && shakes.some((s) => s.tx === north[0] && s.ty === north[1] && s.edge === "n"), `${shakes.length} shakes`);
    let t = 0;
    while (t < 60 * 30 && G.map.isFence(G.map.tileAt(...north.slice(0, 2))[north[2]])) { step(1); t++; }
    row("and bursts it: gone, the event says where", !G.map.tileAt(...north.slice(0, 2))[north[2]] && bursts.length === 1, `after ${(t / 60).toFixed(1)} s, burst at ${bursts[0] ? `${bursts[0].x},${bursts[0].y}` : "none"}`);
    row("walls are never the fence's: the rest of the yard stands", ring.filter(([x, y, e]) => G.map.tileAt(x, y)[e]).length === ring.length - 1, `${ring.filter(([x, y, e]) => G.map.tileAt(x, y)[e]).length} of ${ring.length - 1} edges left`);
  } finally {
    offBurst();
    offShake();
    for (const r of restore.reverse()) r();
    G.teleport(meAt[0], meAt[1]);
    G.rules.set({ zombieAggro: aggro0 });
    G.clock.setHour(hour0);
    G.loop.setPaused(wasPaused);
  }
  return finish();

  function finish() {
    for (const r of rows) console.log(`${r.result}  ${r.check}  (${r.detail})`);
    return { rows, passed: rows.filter((r) => r.result === "pass").length, total: rows.length };
  }
}
