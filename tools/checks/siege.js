// The siege (Michael, 2026-10-17, #147): the dead that saw a player go through a door remember that opening and wait about the
// house until the next dawn, then lose interest; the player cannot sleep while they do. From the console, on a tab with
// `?nosave`:
//   await __game.check("siege")
// It finds a house with a door opening outdoors and a bed inside, stands one of the dead in sight of the door, walks the
// player in, shuts the door and the window, and steps the world through the night to the dawn. It turns zombie aggro on and
// restores it (the setting is shared with Michael's pane), and puts what it moved back.

export async function run(game) {
  const G = game;
  const rows = [];
  const row = (check, ok, detail) => rows.push({ check, result: ok ? "pass" : "FAIL", detail });
  const wasPaused = G.loop.isPaused();
  const aggro0 = G.rules.rules.zombieAggro;
  const hour0 = G.clock.getHour();
  const me = G.player;
  const meAt = [me.gx, me.gy];
  const restore = [];
  const step = (n = 1) => { for (let i = 0; i < n; i++) G.loop.advance(1 / 60); };
  try {
    G.loop.setPaused(true);
    G.rules.set({ zombieAggro: true });
    G.clock.setHour(0);
    // A house with exactly one door, opening outdoors, a window, and a bed inside.
    let found = null;
    for (let id = 1; id < 300 && !found; id++) {
      const room = G.map.getRoom(id);
      if (!room) continue;
      const ops = room.openings.map((op) => ({ op, wall: G.map.tileAt(op.tx, op.ty)[op.edge] })).filter((o) => o.wall);
      const doors = ops.filter((o) => o.wall.kind === "door");
      const wins = ops.filter((o) => o.wall.kind === "window");
      if (doors.length !== 1 || !wins.length || G.map.boarded(doors[0].wall)) continue;
      const sides = (o) => {
        const near = [o.op.tx, o.op.ty];
        const far = o.op.edge === "n" ? [o.op.tx, o.op.ty - 1] : [o.op.tx - 1, o.op.ty];
        const nearIn = G.map.tileAt(near[0], near[1]).room === id;
        return { inside: nearIn ? near : far, outside: nearIn ? far : near };
      };
      const d = sides(doors[0]);
      if (G.map.tileAt(d.outside[0], d.outside[1]).room !== 0 || !G.map.isWalkableTile(d.outside[0], d.outside[1]) || !G.map.isWalkableTile(d.inside[0], d.inside[1])) continue;
      const bed = G.map.allProps().find((p) => G.items && String(p.sprite).startsWith("bed") && G.map.tileAt(p.tile[0], p.tile[1]).room === id);
      if (!bed) continue;
      // The dead start four tiles straight back from the door, on open ground in sight of it.
      const dx = d.outside[0] - d.inside[0];
      const dy = d.outside[1] - d.inside[1];
      const from = [d.outside[0] + dx * 4, d.outside[1] + dy * 4];
      if (!G.map.isWalkableTile(from[0], from[1]) || G.map.tileAt(from[0], from[1]).room !== 0) continue;
      found = { door: doors[0], wins: wins.map((w) => w.wall), d, bed, from };
    }
    if (!found) {
      row("a house with one door, a window, and a bed was found", false, "none in the loaded map");
      return finish();
    }
    const { door, wins, d, bed, from } = found;
    row("a house with one door opening outdoors, a window, and a bed", true, `door ${door.op.tx},${door.op.ty}${door.op.edge}, bed ${bed.tile}`);

    const door0 = { open: door.wall.open, hp: door.wall.hp };
    const win0 = wins.map((w) => ({ shutter: w.shutter, hp: w.hp, broken: w.broken }));
    restore.push(() => { door.wall.open = door0.open; door.wall.hp = door0.hp; door.wall.broken = false; wins.forEach((w, i) => Object.assign(w, win0[i])); G.map.touch(door.op.tx, door.op.ty); for (const w of wins) if (w.at) G.map.touch(w.at[0], w.at[1]); });
    const z = G.zombies.find((q) => !q.dead && !q.corpse);
    const z0 = { gx: z.gx, gy: z.gy, state: z.state, aggro: z.aggro };
    restore.push(() => { Object.assign(z, z0, { path: [], breach: null, siege: null, seenRoom: 0, noWay: 0, lastSeen: null, target: null }); });
    for (const o of G.zombies) if (o !== z && !o.dead && Math.hypot(o.gx - d.inside[0], o.gy - d.inside[1]) < 40) { const keep = { gx: o.gx, gy: o.gy, aggro: o.aggro }; restore.push(() => Object.assign(o, keep, { path: [] })); o.aggro = false; o.gx = d.inside[0] + 80; o.gy = d.inside[1] + 80; }

    // The door open, the player outside in sight of one of the dead, then in at the door.
    door.wall.open = true;
    door.wall.hp = 1e9; // it holds for the night: the siege is what is tried, not the door
    G.map.touch(door.op.tx, door.op.ty);
    G.teleport(d.outside[0], d.outside[1]);
    z.gx = from[0];
    z.gy = from[1];
    z.path = [];
    z.breach = null;
    z.state = "idle";
    z.aggro = true;
    z.siege = null;
    z.seenRoom = 0;
    z.noWay = 0;
    step(40);
    row("seen outside, there is nothing yet to besiege", z.siege === null, `siege ${JSON.stringify(z.siege)}`);
    G.teleport(d.inside[0], d.inside[1]);
    step(40);
    const hasDoor = z.siege && z.siege.openings.some((o) => o.tx === door.op.tx && o.ty === door.op.ty && o.edge === door.op.edge);
    row("seen going in, it remembers the door", !!hasDoor, `siege ${JSON.stringify(z.siege && { at: z.siege.at, openings: z.siege.openings })}`);

    // The door shut, the windows shut, the player by the bed: out of sight, in a house the door of which holds.
    door.wall.open = false;
    for (const w of wins) { w.shutter = "closed"; w.hp = 1e9; }
    G.map.touch(door.op.tx, door.op.ty);
    for (const w of wins) if (w.at) G.map.touch(w.at[0], w.at[1]);
    const bt = bed.tiles ? bed.tiles[0] : bed.tile;
    const beside = G.map.nearestWalkable(bt[0], bt[1] + 1, (x, y) => !!G.map.tileAt(x, y).prop) || d.inside;
    G.teleport(beside[0], beside[1]);
    step(60 * 25);
    const waiting = ["siege", "search", "breach", "breachHit", "chase"].includes(z.state);
    row("it waits about the house, not given up, 25 seconds on", !!z.siege && z.aggro && waiting, `state ${z.state}, aggro ${z.aggro}`);
    step(60 * 60);
    row("and a minute after that", !!z.siege && z.aggro, `state ${z.state}`);
    const sleep = G.verbs.get("sleep");
    const refused = sleep.validate(G.world, me, { prop: bed.id });
    row("the player cannot sleep while it is about", typeof refused === "string" && /still about/.test(refused), String(refused));

    // The dawn: they lose interest.
    G.clock.setHour(5.98);
    step(60 * 8);
    row("at dawn it loses interest and wanders", z.siege === null && !z.aggro && z.state === "idle", `state ${z.state}, aggro ${z.aggro}, hour ${G.clock.getHour().toFixed(2)}`);
    const allowed = sleep.validate(G.world, me, { prop: bed.id });
    row("and the player may sleep again", allowed === true || (typeof allowed === "string" && !/still about/.test(allowed)), String(allowed));
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
