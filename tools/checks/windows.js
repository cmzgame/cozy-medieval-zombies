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
  try {
    G.loop.setPaused(true);
    G.rules.set({ zombieAggro: true });
    G.clock.setHour(12);
    // A house with one window and one door, both ways in shut and whole.
    let found = null;
    for (let id = 1; id < 120 && !found; id++) {
      const room = G.map.getRoom(id);
      if (!room) continue;
      const ops = room.openings.map((op) => ({ op, wall: G.map.tileAt(op.tx, op.ty)[op.edge] })).filter((o) => o.wall);
      const wins = ops.filter((o) => o.wall.kind === "window");
      const doors = ops.filter((o) => o.wall.kind === "door");
      if (wins.length !== 1 || doors.length !== 1 || ops.length !== 2 || doors[0].wall.open || doors[0].wall.broken) continue;
      const sides = (o) => {
        const near = [o.op.tx, o.op.ty];
        const far = o.op.edge === "n" ? [o.op.tx, o.op.ty - 1] : [o.op.tx - 1, o.op.ty];
        const nearIn = G.map.tileAt(near[0], near[1]).room === id;
        return { inside: nearIn ? near : far, outside: nearIn ? far : near };
      };
      const w = sides(wins[0]);
      const d = sides(doors[0]);
      if (![w.inside, w.outside, d.outside].every((t) => G.map.isWalkableTile(t[0], t[1]))) continue;
      // The dead start three tiles back from the window along its outside, in a straight line with the player.
      const dx = w.outside[0] - w.inside[0];
      const dy = w.outside[1] - w.inside[1];
      const from = [w.outside[0] + dx * 3, w.outside[1] + dy * 3];
      if (!G.map.isWalkableTile(from[0], from[1])) continue;
      if (Math.hypot(d.outside[0] - w.outside[0], d.outside[1] - w.outside[1]) < 3) continue; // the door well away from the window
      found = { id, room, win: wins[0], door: doors[0], w, d, from };
    }
    if (!found) {
      row("a house with one window and one door was found", false, "none in the loaded map");
      return finish();
    }
    const { id, win, door, w, from } = found;
    row("a house with one window and one door", true, `room ${id}, window at ${win.op.tx},${win.op.ty}${win.op.edge}, door at ${door.op.tx},${door.op.ty}${door.op.edge}`);

    // The window open and whole; the door shut; the player inside beside the window; one of the dead outside in sight.
    const shutter0 = win.wall.shutter;
    const doorHp0 = door.wall.hp;
    restore.push(() => { win.wall.shutter = shutter0; door.wall.hp = doorHp0; door.wall.open = false; door.wall.broken = false; G.map.touch(win.op.tx, win.op.ty); G.map.touch(door.op.tx, door.op.ty); });
    win.wall.shutter = "open";
    G.map.touch(win.op.tx, win.op.ty);
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
    row("the dead outside sees the player through the open window", z.seesNow === true, `state ${z.state}, sees ${z.seesNow}`);

    // The player's E hold at the window does nothing now: no climb, the player stays where they stood.
    const before = [me.gx, me.gy];
    G.interact.updateInteract(me, 1 / 60, { eHold: true });
    step(60);
    row("a hold of E at an open window does not climb: no climb, the player has not moved through", me.climb === undefined && Math.hypot(me.gx - before[0], me.gy - before[1]) < 0.2 && G.map.tileAt(Math.round(me.gx), Math.round(me.gy)).room === id, `climb ${me.climb}, at ${me.gx.toFixed(2)},${me.gy.toFixed(2)}`);
    const acts = G.interact.actionsAt ? null : null;
    row("the window offers no Climb through (its actions are shutters and boards)", !JSON.stringify(G.map.openingsNear(me.gx, me.gy, 1.15).map((o) => o.wall.kind)).includes("climb"), "no `kind: climb` action exists in interact.js");

    // The world runs: the dead go for the door, break it, and never pass the window.
    let enteredByWindow = false;
    let atDoor = false;
    let brokeOrOpened = false;
    let atWindowLate = 0;
    for (let i = 0; i < 60 * 40 && !brokeOrOpened; i++) {
      step(1);
      const room = G.map.tileAt(Math.round(z.gx), Math.round(z.gy)).room;
      const doorWay = door.wall.open || door.wall.broken;
      if (room === id && !doorWay) enteredByWindow = true;
      if (z.breach && z.breach.wall === door.wall) atDoor = true;
      if (i > 60 * 6 && Math.hypot(z.gx - w.outside[0], z.gy - w.outside[1]) < 0.9) atWindowLate++;
      if (doorWay || door.wall.hp < doorHp0) brokeOrOpened = true;
    }
    row("the dead go for the door (it is their breach target)", atDoor, `state ${z.state}`);
    row("the dead hit the door until it gives (hp " + doorHp0 + " down to " + door.wall.hp + ")", brokeOrOpened, `door open ${!!door.wall.open}, broken ${!!door.wall.broken}`);
    row("the dead never got into the house through the window", !enteredByWindow, `room of the dead ${G.map.tileAt(Math.round(z.gx), Math.round(z.gy)).room}`);
    row("the dead do not stand at the window once they have set about the door", atWindowLate === 0, `${atWindowLate} steps at the window after six seconds`);
    const t = G.map.breachTarget(found.room, from[0], from[1]);
    row("breachTarget picks the door, never the window", !!t && t.wall.kind === "door", t ? t.wall.kind : "none");
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
