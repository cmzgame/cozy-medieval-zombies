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
        G.map.ensureAround(x, y, 2); // reading never grows a chunk: grow it before judging what stands there
        let clear = true;
        for (let dy = -8; dy <= 6 && clear; dy++) for (let dx = -6; dx <= 6 && clear; dx++) clear = G.map.isWalkableTile(x + dx, y + dy) && G.map.tileAt(x + dx, y + dy).room === 0 && !G.map.tileAt(x + dx, y + dy).n && !G.map.tileAt(x + dx, y + dy).w;
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
    for (const z of dead) { const keep = { gx: z.gx, gy: z.gy, state: z.state, aggro: z.aggro }; restore.push(() => Object.assign(z, keep, { path: [], breach: null, press: null, siege: null, seenRoom: -1, lastSeen: null, target: null, noWay: 0 })); }
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
    while (t < 60 * 90 && G.map.isFence(G.map.tileAt(...north.slice(0, 2))[north[2]])) { step(1); t++; }
    row("and bursts it: gone, the event says where", !G.map.tileAt(...north.slice(0, 2))[north[2]] && bursts.length === 1, `after ${(t / 60).toFixed(1)} s, burst at ${bursts[0] ? `${bursts[0].x},${bursts[0].y}` : "none"}`);
    const yardLeft = ring.filter(([x, y, e]) => G.map.tileAt(x, y)[e]).length;
    row("walls are never the fence's: the rest of the yard stands", ring.filter(([x, y, e]) => G.map.tileAt(x, y)[e]).length === ring.length - 1, `${ring.filter(([x, y, e]) => G.map.tileAt(x, y)[e]).length} of ${ring.length - 1} edges left`);

    // ---- how long a crowd takes (Michael, 2026-10-17: a few of the dead must not bring a fence down in seconds; a problem to solve
    // by running or arming, not about to die): the seconds for three, five, and eight, a fence section pressed as the dead press it ----
    for (const z of dead) { z.gx = cx + 80; z.gy = cy + 80; z.aggro = false; z.state = "idle"; z.path = []; }
    const timed = {};
    const timeOf = (n) => {
      const [x, y, e] = [cx, cy + 2, "n"]; // the yard's south side, still standing
      const wall = G.map.tileAt(x, y)[e];
      let s = 0;
      while (G.map.tileAt(x, y)[e] === wall && s < 60 * 400) { for (let i = 0; i < n; i++) G.map.pressFence(wall, x, y, e); step(1); s++; }
      G.map.buildWall(x, y, e, "wall", "wall_fence");
      return s / 60;
    };
    for (const n of [3, 5, 8]) timed[n] = timeOf(n);
    row("three of the dead take at least half a minute to bring a fence section down, five twenty seconds, eight ten", timed[3] >= 30 && timed[5] >= 20 && timed[8] >= 10, `3: ${timed[3].toFixed(0)} s, 5: ${timed[5].toFixed(0)} s, 8: ${timed[8].toFixed(0)} s`);
    bursts.length = 0;

    // ---- biting over a fence stays (Michael, 2026-10-17: "they should be allowed to bite over fences, otherwise exploitable"):
    // a fence is no wall to a bite, only to a body ----
    const bites = [];
    const offBite = G.events.on("bitten", (e) => bites.push(e));
    const me = G.player;
    const hp0 = me.hp;
    const southWall = G.map.tileAt(cx, cy + 2).n;
    G.teleport(cx, cy + 1.7);
    const biter = dead[0];
    biter.gx = cx;
    biter.gy = cy + 2.45;
    biter.path = [];
    biter.state = "chase";
    biter.aggro = true;
    biter.noWay = 0;
    biter.lastSeen = [me.gx, me.gy];
    step(60 * 4);
    offBite();
    me.hp = hp0;
    G.teleport(cx, cy);
    biter.aggro = false;
    biter.state = "idle";
    biter.gx = cx + 80;
    biter.gy = cy + 80;
    biter.press = null;
    row("a dead one bites a player over a fence", G.map.isFence(southWall) && bites.length > 0, `${bites.length} bites in four seconds across the south fence`);

    // ---- a dead one that is pressing the fence bites too (#167): the press state has the chase's bite ----
    for (const z of dead) { z.gx = cx + 80; z.gy = cy + 80; z.aggro = false; z.state = "idle"; z.path = []; z.press = null; } // the others away: only this one is at the yard
    G.map.buildWall(north[0], north[1], north[2], "wall", "wall_fence"); // the yard closed again, so it has no way in but the fence
    const pressBites = [];
    const offPress = G.events.on("bitten", (e) => pressBites.push(e));
    const hpP = me.hp;
    G.teleport(cx, cy);
    const presser = dead[1];
    presser.gx = cx;
    presser.gy = cy + 4;
    presser.path = [];
    presser.breach = null;
    presser.press = null;
    presser.state = "chase";
    presser.aggro = true;
    presser.noWay = 0;
    presser.attackCooldown = 0;
    presser.lastSeen = [cx, cy];
    let pressing = false;
    for (let i = 0; i < 60 * 20 && !pressing; i++) { step(1); pressing = presser.state === "press"; }
    G.teleport(cx, cy + 1.2); // steps up to the fence it is pressing
    pressBites.length = 0;
    step(60 * 4);
    offPress();
    me.hp = hpP;
    G.teleport(cx, cy);
    presser.aggro = false;
    presser.state = "idle";
    presser.press = null;
    presser.gx = cx + 80;
    presser.gy = cy + 80;
    row("a dead one pressing the fence bites a player who steps up to it", pressing && pressBites.length > 0, `${pressing ? "was pressing" : "never pressed"}, ${pressBites.length} bites in four seconds`);

    // ---- a house in a fenced yard is no safe spot, and a gate goes first ----
    for (const [x, y, e] of ring) if (G.map.tileAt(x, y)[e]) G.map.destroyWall(x, y, e);
    const yard = [];
    for (let i = -3; i <= 3; i++) { yard.push([cx + i, cy - 3, "n"], [cx + i, cy + 4, "n"], [cx - 3, cy + i, "w"], [cx + 4, cy + i, "w"]); }
    const homeWalls = [];
    for (let i = -1; i <= 1; i++) homeWalls.push([cx + i, cy - 1, "n"], [cx + i, cy + 2, "n"], [cx - 1, cy + i, "w"], [cx + 2, cy + i, "w"]);
    const build = (list, sprite) => { for (const [x, y, e] of list) G.map.buildWall(x, y, e, "wall", sprite); };
    restore.push(() => { for (const [x, y, e] of [...yard, ...homeWalls]) if (G.map.tileAt(x, y)[e]) G.map.destroyWall(x, y, e); });
    const standing = () => yard.filter(([x, y, e]) => G.map.isFence(G.map.tileAt(x, y)[e])).length;
    const setUp = (gate, win = true) => {
      for (const [x, y, e] of [...yard, ...homeWalls]) if (G.map.tileAt(x, y)[e]) G.map.destroyWall(x, y, e);
      build(yard, "wall_fence");
      build(homeWalls, "wall_log");
      G.map.destroyWall(cx, cy - 1, "n");
      G.map.buildWall(cx, cy - 1, "n", "window", "wall_log"); // the house's window, open: the dead see the player through it
      G.map.tileAt(cx, cy - 1).n.shutter = win ? "open" : "closed";
      G.map.destroyWall(cx, cy + 2, "n");
      G.map.buildWall(cx, cy + 2, "n", "door", "wall_log"); // and a door on the south side, shut: the way they want, inside the yard
      if (gate) { G.map.destroyWall(cx, cy - 3, "n"); G.map.buildWall(cx, cy - 3, "n", "door", "wall_fence"); } // a gate in the yard's north side
      G.map.touch(cx, cy);
      G.teleport(cx, cy);
      bursts.length = 0;
      step(2);
    };
    // The dead start together, in line with the window and the one edge they press, so a crowd is on one section (a crowd that arrives
    // spread out settles on several and may never burst one: its own issue). They know the player is in the house (their last sighting is
    // inside it), so none gives up pressing unseen (#171).
    const startDead = (list) => list.forEach((z, i) => { z.gx = cx + (i - 1.5) * 0.25; z.gy = cy - 6.5 - (i > 1 ? 1 : 0); z.path = []; z.breach = null; z.press = null; z.state = "chase"; z.aggro = true; z.noWay = 0; z.lastSeen = [cx, cy]; });
    for (const z of dead) z.gx = cx + 90;
    // A yard with no gate: they cross the fence nearest their way.
    setUp(false);
    startDead(dead);
    const before = standing();
    let t2 = 0;
    while (t2 < 60 * 400 && bursts.length === 0) { step(1); t2++; }
    row("a house in a fenced yard is no safe spot: the dead press the fence across their way and burst it", bursts.length > 0 && standing() === before - 1, `after ${(t2 / 60).toFixed(0)} s, ${standing()} of ${before} yard edges stand, states ${dead.map((z) => z.state).join(",")}`);
    // A yard with a gate: they go to the gate, and it goes first, the fence beside it standing.
    setUp(true);
    startDead(dead.slice(0, 2));
    for (const z of dead.slice(2)) { z.gx = cx + 90; z.aggro = false; z.state = "idle"; }
    const gate = G.map.tileAt(cx, cy - 3).n;
    const before2 = standing();
    let t3 = 0;
    while (t3 < 60 * 90 && G.map.tileAt(cx, cy - 3).n === gate) { step(1); t3++; }
    row("a gate goes first: two of the dead seek it and burst it while the fence beside it stands", G.map.tileAt(cx, cy - 3).n !== gate && standing() === before2 - 1 && bursts.length === 1 && bursts[0].tx === cx && bursts[0].ty === cy - 3, `after ${(t3 / 60).toFixed(0)} s, ${standing()} of ${before2} edges stand, burst at ${bursts[0] ? `${bursts[0].tx},${bursts[0].ty}${bursts[0].edge}` : "none"}`);
    // The siege presses too: the dead that know a player is in the house, out of sight of it (the window shut), whose way to its
    // door is across the fence.
    setUp(false, false);
    G.clock.setHour(0);
    const sieged = dead.slice(0, 4);
    sieged.forEach((z, i) => {
      z.gx = cx + (i - 1.5) * 0.3; // together, so they press the one edge
      z.gy = cy - 6.5;
      z.path = [];
      z.breach = null;
      z.press = null;
      z.state = "siege";
      z.aggro = true;
      z.noWay = 0;
      z.lastSeen = [cx, cy];
      z.siege = { at: [cx, cy], openings: [], dawn: G.clock.getElapsed() + 600, idx: i, switchAt: G.clock.getElapsed() + 25, pid: me.id };
    });
    const before3 = standing();
    let t4 = 0;
    while (t4 < 60 * 170 && bursts.length === 0) { step(1); t4++; }
    row("the siege presses too: the dead that know the player is in the house burst the fence across their way", bursts.length > 0 && standing() === before3 - 1, `after ${(t4 / 60).toFixed(0)} s, states ${sieged.map((z) => z.state).join(",")}`);

    // ---- by day a fenced house is no safe spot either (#171): a dead one that knows the player is in a room keeps pressing unseen ----
    setUp(false, false); // the window shut: it cannot see the player
    G.clock.setHour(12);
    dead.forEach((z) => { z.gx = cx + 80; z.gy = cy + 80; z.aggro = false; z.state = "idle"; z.path = []; z.press = null; z.siege = null; });
    startDead([dead[0]]);
    dead[0].siege = null;
    let held = 0;
    for (let i = 0; i < 60 * 50; i++) { step(1); if (dead[0].state === "press") held++; }
    row("a dead one that knows the player is in a room keeps pressing the fence unseen, past pressGiveUp (day: no siege)", held > 60 * (G.tuning.zombie.pressGiveUp + 10), `${(held / 60).toFixed(0)} s of 50 in the press state (it gives up after ${G.tuning.zombie.pressGiveUp} s for one last seen in the open)`);
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
