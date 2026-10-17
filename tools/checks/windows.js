// Nobody climbs through a window, and a window is never a safe spot (Michael, 2026-10-16, #134): a window is for sight
// and light alone, so the dead who see a player through an open one go for the room's door and break it, and the
// player's E hold does nothing at a window. From the console, on a tab with `?nosave`:
//   await __game.check("windows")
// It finds a house with one window and one door, opens the window's shutters, stands the player inside beside it and one of
// the dead outside in sight of them, and steps the world. It turns zombie aggro on and restores it (the setting is
// shared with Michael's pane: read first, put back in a finally), and puts everything it moved back.

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
  const mv = await import("/src/entities/movement.js");
  try {
    G.loop.setPaused(true);
    G.rules.set({ zombieAggro: true });
    G.clock.setHour(12);
    // Houses with a window looking out on open ground and shut, whole doors: one with a door that opens outdoors, and one
    // whose doors all open into another shut room (a hall), where the dead must break that room's door first.
    const houses = { outdoors: null, nested: null };
    for (let id = 1; id < 300 && !(houses.outdoors && houses.nested); id++) {
      const room = G.map.getRoom(id);
      if (!room) continue;
      const ops = room.openings.map((op) => ({ op, wall: G.map.tileAt(op.tx, op.ty)[op.edge] })).filter((o) => o.wall);
      const wins = ops.filter((o) => o.wall.kind === "window");
      const doors = ops.filter((o) => o.wall.kind === "door");
      if (!wins.length || !doors.length || doors.some((o) => o.wall.open || o.wall.broken)) continue;
      const sides = (o) => {
        const near = [o.op.tx, o.op.ty];
        const far = o.op.edge === "n" ? [o.op.tx, o.op.ty - 1] : [o.op.tx - 1, o.op.ty];
        const nearIn = G.map.tileAt(near[0], near[1]).room === id;
        return { inside: nearIn ? near : far, outside: nearIn ? far : near };
      };
      const dd = doors.map((o) => ({ o, ...sides(o) }));
      if (!dd.every((d) => G.map.isWalkableTile(d.outside[0], d.outside[1]) && G.map.isWalkableTile(d.inside[0], d.inside[1]))) continue;
      const outdoorsDoors = dd.filter((d) => G.map.tileAt(d.outside[0], d.outside[1]).room === 0);
      const kind = outdoorsDoors.length ? "outdoors" : "nested";
      if (houses[kind]) continue;
      for (const win of wins) {
        const w = sides(win);
        if (![w.inside, w.outside].every((t) => G.map.isWalkableTile(t[0], t[1])) || G.map.tileAt(w.outside[0], w.outside[1]).room !== 0) continue;
        // The dead start three tiles back from the window along its outside, in a straight line with the player.
        const dx = w.outside[0] - w.inside[0];
        const dy = w.outside[1] - w.inside[1];
        const from = [w.outside[0] + dx * 3, w.outside[1] + dy * 3];
        if (!G.map.isWalkableTile(from[0], from[1]) || G.map.tileAt(from[0], from[1]).room !== 0) continue;
        // Where the dead start must be able to walk to a way in (some windows look out on a fenced yard with a shut gate).
        const fromHere = { gx: from[0], gy: from[1] };
        let reach = false;
        if (kind === "outdoors") reach = outdoorsDoors.some((d) => mv.canReach(fromHere, d.outside));
        else {
          const hall = G.map.getRoom(G.map.tileAt(dd[0].outside[0], dd[0].outside[1]).room);
          reach = !!hall && hall.openings.some((op) => {
            const dw = G.map.tileAt(op.tx, op.ty)[op.edge];
            if (!dw || dw.kind !== "door") return false;
            const outs = [[op.tx, op.ty], op.edge === "n" ? [op.tx, op.ty - 1] : [op.tx - 1, op.ty]].find((t) => G.map.tileAt(t[0], t[1]).room === 0);
            return !!outs && G.map.isWalkableTile(outs[0], outs[1]) && mv.canReach(fromHere, outs);
          });
        }
        if (!reach) continue;
        houses[kind] = { win, doors: doors.map((o) => o.wall), doorOps: doors, w, from };
        break;
      }
    }
    row("a house whose door opens outdoors was found", !!houses.outdoors, houses.outdoors ? `window ${houses.outdoors.win.op.tx},${houses.outdoors.win.op.ty}${houses.outdoors.win.op.edge}, ${houses.outdoors.doors.length} door(s)` : "none in the loaded map");
    row("a house whose door opens into another shut room was found", !!houses.nested, houses.nested ? `window ${houses.nested.win.op.tx},${houses.nested.win.op.ty}${houses.nested.win.op.edge}, ${houses.nested.doors.length} door(s)` : "none in the loaded map");

    let first = true;
    for (const [kind, h] of Object.entries(houses)) {
      if (!h) continue;
      const { win, doors, doorOps, w, from } = h;
      // The window open and whole; the door shut; the player inside beside the window; one of the dead outside in sight.
      const shutter0 = win.wall.shutter;
      const hp0 = doors.map((d) => d.hp);
      restore.push(() => { win.wall.shutter = shutter0; doors.forEach((d, i) => { d.hp = hp0[i]; d.open = false; d.broken = false; }); G.map.touch(win.op.tx, win.op.ty); for (const o of doorOps) G.map.touch(o.op.tx, o.op.ty); });
      win.wall.shutter = "open";
      G.map.touch(win.op.tx, win.op.ty);
      step(1); // the rooms are found again, and their ids with them
      const homeRoom = () => G.map.tileAt(w.inside[0], w.inside[1]).room; // rooms are found again, their ids with them: read it each time
      const z = G.zombies.find((q) => !q.dead && !q.corpse);
      const z0 = { gx: z.gx, gy: z.gy, state: z.state, aggro: z.aggro, hp: z.hp };
      restore.push(() => { Object.assign(z, { gx: z0.gx, gy: z0.gy, state: z0.state, aggro: z0.aggro, hp: z0.hp, path: [], breach: null }); });
      for (const o of G.zombies) if (o !== z && !o.dead && Math.hypot(o.gx - w.inside[0], o.gy - w.inside[1]) < 30) { const keep = { gx: o.gx, gy: o.gy, aggro: o.aggro }; restore.push(() => Object.assign(o, keep, { path: [] })); o.aggro = false; }
      G.teleport(w.inside[0], w.inside[1]);
      z.gx = from[0];
      z.gy = from[1];
      z.path = [];
      z.breach = null;
      z.state = "idle";
      z.aggro = true;
      step(30);
      row(`[${kind}] the dead outside sees the player through the open window`, z.seesNow === true, `state ${z.state}, sees ${z.seesNow}`);

      if (first) {
        // The player's E hold at the window does nothing now: no climb, the player stays where they stood.
        const before = [me.gx, me.gy];
        G.interact.updateInteract(me, 1 / 60, { eHold: true });
        step(60);
        row("a hold of E at an open window does not climb: no climb, the player has not moved through", me.climb === undefined && Math.hypot(me.gx - before[0], me.gy - before[1]) < 0.2 && G.map.tileAt(Math.round(me.gx), Math.round(me.gy)).room === homeRoom(), `climb ${me.climb}, at ${me.gx.toFixed(2)},${me.gy.toFixed(2)}`);
        first = false;
      }

      // The world runs: the dead go for the door (the nested house's outer door first), break in, and never pass the window.
      let enteredByWindow = false;
      let atDoor = false;
      let atWindowLate = 0;
      const doorsBroken = () => doors.some((d, i) => d.open || d.broken || d.hp < hp0[i]);
      for (let i = 0; i < 60 * 90 && !doorsBroken(); i++) {
        step(1);
        const room = G.map.tileAt(Math.round(z.gx), Math.round(z.gy)).room;
        const doorWay = doors.some((d) => d.open || d.broken);
        if (room === homeRoom() && !doorWay) enteredByWindow = true;
        if (z.breach && z.breach.wall.kind === "door") atDoor = true;
        if (i > 60 * 8 && Math.hypot(z.gx - w.outside[0], z.gy - w.outside[1]) < 0.9) atWindowLate++;
      }
      row(`[${kind}] the dead go for a door (it is their breach target, never the window)`, atDoor, `state ${z.state}`);
      row(`[${kind}] the dead hit the house's door until it gives (hp ${hp0.join(", ")} down to ${doors.map((d) => d.hp).join(", ")})`, doorsBroken(), `open ${doors.map((d) => !!d.open).join(", ")}`);
      row(`[${kind}] the dead never got into the house through the window`, !enteredByWindow, `room of the dead ${G.map.tileAt(Math.round(z.gx), Math.round(z.gy)).room}`);
      row(`[${kind}] the dead do not hover at the window once they have set about a door`, atWindowLate === 0, `${atWindowLate} steps at the window after eight seconds`);
    }
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
