// The dead strike a fence down (Michael, 2026-10-17, #147; 2026-10-18, #174): one of the dead at a fence STRIKES it, on the attack
// animation and the bite's cooldown, each strike taking hit points and giving one small jolt (the event every client draws); a crowd is
// more strikers, and at nothing left it bursts into splinters and is gone; a gate goes first; the seconds for three, five, and eight
// real dead, bunched and spread, are measured here against Michael's bar (a problem to solve urgently, by running or arming). From the console, on a tab with `?nosave`:
//   await __game.check("fence")
// It builds a ring of fence round the player on open ground (so the dead have no way round), sends one dead, then four, then crowds,
// and takes the ring down again. It turns zombie aggro on and restores it, and puts the dead it moved back.

export async function run(game, opts = {}) {
  const G = game;
  const needs0 = (({ hunger, thirst, tired, hp, bleed, sick, infection }) => ({ hunger, thirst, tired, hp, bleed, sick, infection }))(G.player); // put back in the finally: its steps drain them and the dead may bite (the order-independence of the checks, check("all"))
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
  const shakes = []; // the strikes, one jolt each (`wallStruck`)
  const offBurst = G.events.on("fenceBurst", (e) => bursts.push(e));
  const offShake = G.events.on("wallStruck", (e) => shakes.push(e));
  // Its trials run from a seed of their own, the generator put back in the finally: the crowd's steps and strikes roll it, and late in a
  // page its state was another than a fresh boot's (the order-independence of the checks, check("all")).
  const rng0 = G.rng.getState();
  try {
    G.loop.setPaused(true);
    G.rng.seed(opts.seed ?? 4242);
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
    // Eight of the dead of its own, taken away in the finally: the world's first eight may be in any state after other checks in the page
    // (the order-independence of the checks, check("all")).
    const { createZombie } = await import("/src/entities/zombie.js");
    const dead = Array.from({ length: 8 }, (_, i) => createZombie(cx + 80 + i, cy + 80, { aggro: false }));
    G.zombies.push(...dead);
    restore.push(() => { for (const z of dead) { const i = G.zombies.indexOf(z); if (i >= 0) G.zombies.splice(i, 1); const j = (G.corpses || []).indexOf(z); if (j >= 0) G.corpses.splice(j, 1); } });
    for (const o of G.zombies) if (!dead.includes(o) && !o.dead && Math.hypot(o.gx - cx, o.gy - cy) < 60) { const keep = { gx: o.gx, gy: o.gy, aggro: o.aggro }; restore.push(() => Object.assign(o, keep, { path: [] })); o.aggro = false; o.gx = cx + 90; o.gy = cy + 90; }
    for (const z of dead) { const keep = { gx: z.gx, gy: z.gy, state: z.state, aggro: z.aggro }; restore.push(() => Object.assign(z, keep, { path: [], breach: null, press: null, siege: null, seenRoom: -1, lastSeen: null, target: null, noWay: 0 })); }
    const north = [cx, cy - 1, "n"]; // the middle of the north side: the edge the dead press
    const place = (z, ox) => { z.gx = cx + ox; z.gy = cy - 2.05; z.path = []; z.breach = null; z.state = "chase"; z.aggro = true; z.noWay = 0; z.lastSeen = [cx, cy]; };

    // One alone: it strikes, and the fence wears down, slowly.
    place(dead[0], 0);
    for (const z of dead.slice(1)) { z.gx = cx + 80; z.gy = cy + 80; z.aggro = false; z.state = "idle"; }
    step(60 * 40);
    const northWall = G.map.tileAt(...north.slice(0, 2))[north[2]];
    row("one of the dead strikes a fence and wears it down slowly: after forty seconds it stands, damaged, a jolt for each strike", G.map.isFence(northWall) && bursts.length === 0 && northWall.hp < G.tuning.world.fenceHp && shakes.length > 5, `forty seconds, ${bursts.length} bursts, ${shakes.length} strikes, the fence at ${northWall.hp.toFixed(0)} of ${G.tuning.world.fenceHp}, state ${dead[0].state}`);

    // Four together: each strike jolts, then it bursts.
    [-0.45, -0.15, 0.15, 0.45].forEach((ox, i) => place(dead[i], ox));
    const strikes0 = shakes.length;
    step(60 * 3);
    row("each strike is a jolt (the host's event for every client)", shakes.length > strikes0 && shakes.some((s) => s.tx === north[0] && s.ty === north[1] && s.edge === "n"), `${shakes.length - strikes0} strikes in three seconds`);
    let t = 0;
    while (t < 60 * 90 && G.map.isFence(G.map.tileAt(...north.slice(0, 2))[north[2]])) { step(1); t++; }
    row("and it bursts: gone, the event says where", !G.map.tileAt(...north.slice(0, 2))[north[2]] && bursts.length === 1, `after ${(t / 60).toFixed(1)} s, burst at ${bursts[0] ? `${bursts[0].x},${bursts[0].y}` : "none"}`);
    row("walls are never the fence's: the rest of the yard stands", ring.filter(([x, y, e]) => G.map.tileAt(x, y)[e]).length === ring.length - 1, `${ring.filter(([x, y, e]) => G.map.tileAt(x, y)[e]).length} of ${ring.length - 1} edges left`);

    // ---- how long a crowd takes, with real bodies (Michael, 2026-10-17: a few of the dead must not bring a fence down in seconds, a
    // problem to solve urgently by running or arming, not about to die; 2026-10-18: strikes on a cooldown, as on a player) ----
    G.map.buildWall(north[0], north[1], north[2], "wall", "wall_fence");
    const away = () => { for (const z of dead) { z.gx = cx + 80; z.gy = cy + 80; z.aggro = false; z.state = "idle"; z.path = []; z.press = null; z.breach = null; } };
    // `n` dead set down `gap` tiles apart in a row `dist` tiles south of the south side, in chase, until a section bursts (or `limit` seconds).
    const crowd = (n, gap, dist, limit = 300) => {
      away();
      const [x, y, e] = [cx, cy + 2, "n"];
      const wall = G.map.tileAt(x, y)[e];
      for (const [rx, ry, re] of ring) { const w = G.map.tileAt(rx, ry)[re]; if (w) w.hp = G.tuning.world.fenceHp; } // every section new
      bursts.length = 0;
      dead.slice(0, n).forEach((z, i) => { z.gx = cx + (i - (n - 1) / 2) * gap; z.gy = cy + 2.5 + dist; z.path = []; z.breach = null; z.press = null; z.siege = null; z.repathTimer = 0; z.pathFailed = false; z.state = "chase"; z.aggro = true; z.noWay = 0; z.attackCooldown = 0; z.lastSeen = [cx, cy]; z.seesNow = true; z.sightTimer = 0; });
      let s = 0;
      while (!bursts.length && s < 60 * limit) { step(1); s++; }
      const seconds = bursts.length ? s / 60 : null;
      const edge = bursts[0] ? [bursts[0].tx, bursts[0].ty, bursts[0].edge] : null;
      away();
      if (edge && !G.map.tileAt(edge[0], edge[1])[edge[2]]) G.map.buildWall(edge[0], edge[1], edge[2], "wall", "wall_fence"); // the section that went comes back, new
      const left = G.map.tileAt(x, y)[e];
      if (left) left.hp = G.tuning.world.fenceHp;
      return seconds;
    };
    const timed = {};
    for (const n of [1, 3, 5, 8]) timed[n] = crowd(n, 0.25, 3, 400);
    const f0 = (v) => (v === null ? "never" : `${v.toFixed(0)} s`);
    row("three of the dead take long enough to run or arm (half a minute at the least) to bring a fence section down; eight are urgent, not instant (ten seconds at the least)", timed[1] !== null && timed[1] >= 90 && timed[3] !== null && timed[3] >= 30 && timed[5] !== null && timed[8] !== null && timed[8] >= 10 && timed[8] < timed[3], `real bodies, bunched: 1: ${f0(timed[1])}, 3: ${f0(timed[3])}, 5: ${f0(timed[5])}, 8: ${f0(timed[8])}`);
    const spread = crowd(8, 1.2, 4, 240);
    row("a crowd that arrives spread out still brings a section down (the second body does not sit on a threshold)", spread !== null, `8 dead 1.2 tiles apart: ${f0(spread)}`);

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
      G.clock.setHour(12); // noon at every set-up: the rows before run past dusk, and the dead take a siege only from dusk (the review of #397)
      bursts.length = 0;
      step(2);
    };
    // The dead start together, in line with the window and the one edge they press, so a crowd is on one section (a crowd that arrives
    // spread out settles on several and may never burst one: its own issue). They know the player is in the house (their last sighting is
    // inside it), so none gives up pressing unseen (#171).
    const startDead = (list) => list.forEach((z, i) => { z.gx = cx + (i - 1.5) * 0.25; z.gy = cy - 6.5 - (i > 1 ? 1 : 0); z.path = []; z.breach = null; z.press = null; z.siege = null; z.repathTimer = 0; z.pathFailed = false; z.state = "chase"; z.aggro = true; z.noWay = 0; z.lastSeen = [cx, cy]; }); // no siege left from a row before
    for (const z of dead) z.gx = cx + 90;
    // A yard with no gate: they cross the fence nearest their way.
    setUp(false);
    startDead(dead.slice(0, 4));
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
    // A gate opened while the dead strike it ends the press (Michael, 2026-10-24: he opened a gate to let them in rather than have it
    // broken, and they went on striking it open): no strike lands on it once open, and they come through it.
    setUp(true);
    startDead(dead.slice(0, 2));
    for (const z of dead.slice(2)) { z.gx = cx + 90; z.aggro = false; z.state = "idle"; }
    const openGate = G.map.tileAt(cx, cy - 3).n;
    let tPress = 0;
    while (tPress < 60 * 30 && !dead.slice(0, 2).some((z) => z.state === "pressHit" && z.press && z.press.wall === openGate)) { step(1); tPress++; }
    const struckAtGate = () => shakes.filter((s) => s.tx === cx && s.ty === cy - 3 && s.edge === "n").length;
    const pressedIt = tPress < 60 * 30;
    openGate.open = true;
    G.map.touch(cx, cy - 3);
    const struck0 = struckAtGate();
    step(60 * 6);
    const struckAfter = struckAtGate() - struck0;
    const through = dead.slice(0, 2).filter((z) => z.gy > cy - 3).length;
    row("a gate opened while the dead strike it: no strike lands once it is open, and they come through it", pressedIt && struckAfter === 0 && G.map.tileAt(cx, cy - 3).n === openGate && through === 2, `${pressedIt ? `pressing after ${(tPress / 60).toFixed(1)} s` : "never pressed"}, ${struckAfter} strikes on the open gate in six seconds, ${through} of 2 through, states ${dead.slice(0, 2).map((z) => z.state).join(",")}`);
    // A gate on the yard's far side still goes first: they walk round to it rather than strike the fence nearest them (the second
    // review of #389: a press that let go as soon as the player was on its own side of the gate's line never got there).
    setUp(false);
    G.map.destroyWall(cx, cy + 4, "n");
    G.map.buildWall(cx, cy + 4, "n", "door", "wall_fence");
    G.map.touch(cx, cy + 4);
    step(2);
    bursts.length = 0;
    startDead(dead.slice(0, 2));
    for (const z of dead.slice(2)) { z.gx = cx + 90; z.aggro = false; z.state = "idle"; }
    const farGate = G.map.tileAt(cx, cy + 4).n;
    let tFar = 0;
    while (tFar < 60 * 150 && G.map.tileAt(cx, cy + 4).n === farGate) { step(1); tFar++; }
    row("a gate on the yard's far side still goes first: they walk round to it and burst it", G.map.tileAt(cx, cy + 4).n !== farGate && bursts.length === 1 && bursts[0].tx === cx && bursts[0].ty === cy + 4, `after ${(tFar / 60).toFixed(0)} s, ${bursts.length} burst${bursts[0] ? ` at ${bursts[0].tx},${bursts[0].ty}` : ""}`);
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
    G.rng.setState(rng0);
    if (G.player) Object.assign(G.player, needs0); // the needs and the health its steps and bites took
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
