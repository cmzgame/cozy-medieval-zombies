// The siege (Michael, 2026-10-17, #147): the dead that saw a player go in remember the opening and, at night, wait about the house until the
// next dawn, then lose interest; they come first to the opening they saw the player use; and the player cannot sleep while one that
// holds a siege on them is near. From the console, on a tab with `?nosave`:
//   await __game.check("siege")
// It builds two little houses of log wall on open ground (placing and removing them as the world does): a cell with one window and no door
// (the dead cannot get in, so the siege state is reached and held), and a house with two doors (the dead go to the one they saw
// used). It turns zombie aggro on and restores it, and puts everything it moved or built back.

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
  try {
    G.loop.setPaused(true);
    G.rules.set({ zombieAggro: true });
    G.clock.setHour(0);
    // Open ground, grown first (reading never grows a chunk), with room round it.
    let c = null;
    for (let y = 120; y < 240 && !c; y += 3) {
      for (let x = 30; x < 230 && !c; x += 3) {
        G.map.ensureAround(x, y, 2);
        let clear = true;
        for (let dy = -7; dy <= 7 && clear; dy++) for (let dx = -14; dx <= 8 && clear; dx++) clear = G.map.isWalkableTile(x + dx, y + dy) && G.map.tileAt(x + dx, y + dy).room === 0 && !G.map.tileAt(x + dx, y + dy).n && !G.map.tileAt(x + dx, y + dy).w && !G.map.tileAt(x + dx, y + dy).prop;
        if (clear) c = [x, y];
      }
    }
    if (!c) {
      row("open ground for two little houses was found", false, "none in the loaded map");
      return finish();
    }
    const [cx, cy] = c;
    const z = G.zombies.find((q) => !q.dead && !q.corpse);
    const z0 = { gx: z.gx, gy: z.gy, state: z.state, aggro: z.aggro };
    restore.push(() => Object.assign(z, z0, { path: [], breach: null, siege: null, seenRoom: -1, noWay: 0, lastSeen: null, target: null }));
    for (const o of G.zombies) if (o !== z && !o.dead && Math.hypot(o.gx - cx, o.gy - cy) < 60) { const keep = { gx: o.gx, gy: o.gy, aggro: o.aggro }; restore.push(() => Object.assign(o, keep, { path: [] })); o.aggro = false; o.gx = cx + 90; o.gy = cy + 90; }
    // A 3 by 3 house (interior x0-1..x0+1, y0-1..y0+1) of log wall; `openings` maps "n", "s", "e", "w" to "window" or "door".
    const made = [];
    const house = (x0, y0, openings) => {
      const sides = { n: [x0, y0 - 1, "n"], s: [x0, y0 + 2, "n"], w: [x0 - 1, y0, "w"], e: [x0 + 2, y0, "w"] };
      for (let i = -1; i <= 1; i++) { made.push([x0 + i, y0 - 1, "n"], [x0 + i, y0 + 2, "n"], [x0 - 1, y0 + i, "w"], [x0 + 2, y0 + i, "w"]); }
      for (const [x, y, e] of made.slice(-12)) G.map.buildWall(x, y, e, "wall", "wall_log");
      for (const [side, kind] of Object.entries(openings)) {
        const [x, y, e] = sides[side];
        G.map.destroyWall(x, y, e);
        G.map.buildWall(x, y, e, kind, "wall_log");
        const w = G.map.tileAt(x, y)[e];
        if (kind === "window") w.shutter = "open";
        G.map.touch(x, y);
      }
      return sides;
    };
    restore.push(() => { for (const [x, y, e] of made) if (G.map.tileAt(x, y)[e]) G.map.destroyWall(x, y, e); });
    const sleep = G.verbs.get("sleep");

    // ---- a cell with one window and no door: the dead cannot get in ----
    const cell = [cx, cy];
    const sides = house(cell[0], cell[1], { n: "window" });
    const bed = G.map.createProp({ sprite: "bed", tile: [cell[0] - 1, cell[1] + 1], footprint: [2, 1] });
    G.map.placeProp(bed, cell[0] - 1, cell[1] + 1);
    restore.push(() => G.map.removeProp(bed));
    G.teleport(cell[0], cell[1]); // straight south of the window: in sight of one straight north of it
    G.map.touch(cell[0], cell[1]);
    step(2);
    z.gx = cell[0];
    z.gy = cell[1] - 5;
    z.path = [];
    z.breach = null;
    z.state = "idle";
    z.aggro = true;
    z.siege = null;
    z.seenRoom = -1;
    z.noWay = 0;
    let sawSiege = false;
    let sawOpening = false;
    for (let i = 0; i < 60 * 40 && !sawSiege; i++) {
      step(1);
      if (z.siege && z.siege.openings.some((o) => o.tx === sides.n[0] && o.ty === sides.n[1] && o.edge === "n")) sawOpening = true;
      if (z.state === "siege") sawSiege = true;
    }
    row("seen through its window at night, it remembers the window", sawOpening, `siege ${JSON.stringify(z.siege && { at: z.siege.at, openings: z.siege.openings })}`);
    row("with no way in, it reaches the siege state itself", sawSiege, `state ${z.state}`);
    let waiting = 0;
    let nearWindow = 0;
    for (let i = 0; i < 60 * 60; i++) {
      step(1);
      if (z.siege && z.aggro && ["siege", "search"].includes(z.state)) waiting++;
      if (Math.hypot(z.gx - sides.n[0], z.gy - (sides.n[1] - 1)) < 2) nearWindow++;
    }
    row("and holds it a minute: about the house, not given up", waiting > 60 * 40 && !!z.siege && z.aggro, `${(waiting / 60).toFixed(0)} of 60 s in siege or search, ${(nearWindow / 60).toFixed(0)} s within two tiles of the window`);
    // No sleep, keyed to the player: refused while it holds a siege on them within `siegeSleepRadius`.
    const refused = sleep.validate(G.world, me, { prop: bed.id });
    row("the player cannot sleep while it is about", typeof refused === "string" && /still about/.test(refused), String(refused));
    const keep = [z.gx, z.gy];
    z.gx = cx + G.tuning.zombie.siegeSleepRadius + 20;
    const far = sleep.validate(G.world, me, { prop: bed.id });
    z.gx = keep[0];
    row("but not when the one that holds it is far (`siegeSleepRadius`)", !(typeof far === "string" && /still about/.test(far)), String(far));
    // By day a sighting is the ordinary chase.
    const siegeBefore = z.siege;
    z.siege = null;
    z.seenRoom = -1;
    G.clock.setHour(14);
    step(60 * 6);
    row("by day it holds no siege (a siege is the night's)", z.siege === null, `siege ${JSON.stringify(z.siege)} at hour ${G.clock.getHour().toFixed(1)}`);
    // The dawn ends it even for one still watching, and it is not given another by the morning.
    G.clock.setHour(0);
    z.siege = siegeBefore;
    step(60 * 3);
    G.clock.setHour(5.98);
    step(60 * 25);
    row("at dawn the siege ends even for one still in sight of the player, and none starts again by day", z.siege === null && z.state !== "siege", `siege ${JSON.stringify(z.siege)}, state ${z.state}, hour ${G.clock.getHour().toFixed(2)}`);
    // And one out of sight loses interest.
    G.clock.setHour(0);
    z.gx = cx + 12;
    z.gy = cy - 6;
    z.siege = { at: [cx, cy], openings: [{ tx: sides.n[0], ty: sides.n[1], edge: "n" }], dawn: G.clock.getElapsed() + 8, idx: 0, switchAt: G.clock.getElapsed() + 25, pid: me.id };
    z.state = "siege";
    z.aggro = true;
    z.path = [];
    step(60 * 3);
    const held = z.state === "siege" || z.state === "search" || z.state === "chase";
    step(60 * 8);
    row("one out of sight holds the siege until its dawn, then loses interest and wanders", held && z.siege === null && !z.aggro && ["idle", "wander"].includes(z.state), `state ${z.state}, aggro ${z.aggro}`);

    // ---- a house with two doors: they go to the one they saw the player use ----
    for (const [x, y, e] of made.splice(0)) if (G.map.tileAt(x, y)[e]) G.map.destroyWall(x, y, e);
    G.map.removeProp(bed);
    const h2 = [cx - 9, cy];
    const s2 = house(h2[0], h2[1], { s: "door", e: "door" });
    G.clock.setHour(0);
    G.teleport(h2[0], h2[1]);
    step(2);
    const southDoor = { tx: s2.s[0], ty: s2.s[1], edge: s2.s[2] };
    // It is by the east door, with the player inside; it saw the player go in by the south door.
    z.gx = h2[0] + 4;
    z.gy = h2[1] + 0.2;
    z.path = [];
    z.breach = null;
    z.state = "chase";
    z.aggro = true;
    z.noWay = 0;
    z.lastSeen = [h2[0], h2[1]];
    z.siege = { at: [h2[0], h2[1]], openings: [southDoor], dawn: G.clock.getElapsed() + 400, idx: 0, switchAt: G.clock.getElapsed() + 25, pid: me.id };
    let target = null;
    for (let i = 0; i < 60 * 12 && !target; i++) {
      step(1);
      if (z.breach) target = z.breach;
    }
    row("with two doors, they go first to the one they saw the player use, though the other is nearer", !!target && target.tx === southDoor.tx && target.ty === southDoor.ty && target.edge === southDoor.edge, target ? `breaching ${target.tx},${target.ty}${target.edge}, the south door is ${southDoor.tx},${southDoor.ty}${southDoor.edge}` : "no breach");
  } finally {
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
