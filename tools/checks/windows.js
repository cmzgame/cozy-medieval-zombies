// Nobody climbs through a window, and a window is never a safe spot (Michael, 2026-10-16, #134): a window is for sight
// and light alone, so the dead who see a player through an open one go for the room's door and break it, and the
// player's E hold does nothing at a window; a window still shut or boarded is battered open for sight and never passed
// (Michael: "the dead may batter a window's shutters or boards open to see in, never to pass"), and a dead one with no door it
// can reach batters the window and then searches, without searching paths every step. From the console, on a tab with `?nosave`:
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
  // One of the dead of its own for each trial, taken away in the finally: the world's first one may be in any state after other checks
  // in the page (the order-independence of the checks, check("all")).
  const { createZombie } = await import("/src/entities/zombie.js");
  const own = (at) => {
    const z = createZombie(at[0], at[1], { aggro: true });
    G.zombies.push(z);
    restore.push(() => { const i = G.zombies.indexOf(z); if (i >= 0) G.zombies.splice(i, 1); const j = (G.corpses || []).indexOf(z); if (j >= 0) G.corpses.splice(j, 1); });
    return z;
  };
  // Every door and window grown, as it stood: the dead it rouses batter more than the houses it uses, and what they open or break is
  // put back in the finally with the needs and health its steps and bites took (the order-independence of the checks, check("all")).
  const openings0 = [];
  for (const c of G.map.loadedChunks()) for (const t of c.tiles || []) for (const e of ["n", "w"]) { const w = t && t[e]; if (w && (w.kind === "door" || w.kind === "window")) openings0.push([w, { open: w.open, broken: w.broken, hp: w.hp, shutter: w.shutter }]); }
  const needs0 = (({ hunger, thirst, tired, hp, bleed, sick, infection }) => ({ hunger, thirst, tired, hp, bleed, sick, infection }))(me);
  // The world's own dead sit out its trials, put back in the finally: since sight-pull (docs/48) the one it makes, seeing the player, calls
  // every dead one near it that sees it, and a pack the earlier checks in the page left by the house would join and bite (#492).
  const dead0 = G.game.state.zombies;
  G.game.state.zombies = [];
  try {
    G.loop.setPaused(true);
    G.rules.set({ zombieAggro: true });
    G.clock.setHour(12);
    // Houses with a window looking out on open ground and shut, whole doors: one with a door that opens outdoors, and one
    // whose doors all open into another shut room (a hall), where the dead must break that room's door first.
    const houses = { outdoors: null, nested: null };
    for (const room of [...G.map.allRooms()].sort((a, b) => a.id - b.id)) { // every room, lowest id first (a room's id is never reused in a session, so after other checks build and take down walls the ids climb past any fixed bound; the order-independence of the checks)
      if (houses.outdoors && houses.nested) break;
      const id = room.id;
      const ops = room.openings.map((op) => ({ op, wall: G.map.tileAt(op.tx, op.ty)[op.edge] })).filter((o) => o.wall);
      const wins = ops.filter((o) => o.wall.kind === "window");
      const doors = ops.filter((o) => o.wall.kind === "door");
      if (!wins.length || wins.length > 2 || !doors.length || doors.some((o) => o.wall.open || o.wall.broken)) continue; // few windows: each shut one is battered open in turn
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
        if (G.map.boarded(win.wall)) continue; // an unboarded window, so the player is seen through it once the shutters are open
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
      const z = own(from);
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
        // E is a tap on its release however long it was held, and a hold of it is nothing: no event, no climb, so a long
        // press at an open window leaves the player where they stood.
        const before = [me.gx, me.gy];
        const events = [];
        window.dispatchEvent(new KeyboardEvent("keydown", { code: "KeyE" }));
        for (let i = 0; i < 40; i++) { events.push(G.interact.keyEvents(1 / 60)); G.input.endStep(); } // 0.67 s: past the 0.35 s a hold was
        window.dispatchEvent(new KeyboardEvent("keyup", { code: "KeyE" }));
        events.push(G.interact.keyEvents(1 / 60));
        G.input.endStep();
        const keyed = events.flatMap((e) => (e ? Object.keys(e) : []));
        step(60);
        row("a long press of E is a tap on release and no hold: only eTap (and ePressed), never eHold", keyed.includes("eTap") && !keyed.includes("eHold"), `events ${[...new Set(keyed)].join(", ")}`);
        row("nothing climbs: the player has not moved through the window", me.climb === undefined && Math.hypot(me.gx - before[0], me.gy - before[1]) < 0.2 && G.map.tileAt(Math.round(me.gx), Math.round(me.gy)).room === homeRoom(), `climb ${me.climb}, at ${me.gx.toFixed(2)},${me.gy.toFixed(2)}`);
        first = false;
      }

      // The world runs: the dead go for the door (the nested house's outer door first), break in, and never pass the window.
      let enteredByWindow = false;
      let atDoor = false;
      let atWindowLate = 0;
      const doorsHit = () => doors.some((d, i) => d.hp < hp0[i]);
      const doorsGone = () => doors.some((d) => d.open || d.broken);
      let steps = 0;
      for (; steps < 60 * 300 && !doorsGone(); steps++) {
        step(1);
        const room = G.map.tileAt(Math.round(z.gx), Math.round(z.gy)).room;
        const doorWay = doors.some((d) => d.open || d.broken);
        if (room === homeRoom() && !doorWay) enteredByWindow = true;
        if (z.breach && z.breach.wall.kind === "door") atDoor = true;
        if (steps > 60 * 8 && Math.hypot(z.gx - w.outside[0], z.gy - w.outside[1]) < 0.9) atWindowLate++;
      }
      row(`[${kind}] the dead go for a door (it is their breach target, never the window)`, atDoor, `state ${z.state}`);
      row(`[${kind}] the dead hit the house's door until it gives (hp ${hp0.join(", ")} down to ${doors.map((d) => d.hp).join(", ")})`, doorsHit() && doorsGone(), `after ${(steps / 60).toFixed(0)} s; open ${doors.map((d) => !!d.open).join(", ")}, broken ${doors.map((d) => !!d.broken).join(", ")}; state ${z.state}`);
      row(`[${kind}] the dead never got into the house through the window`, !enteredByWindow, `room of the dead ${G.map.tileAt(Math.round(z.gx), Math.round(z.gy)).room}`);
      row(`[${kind}] the dead do not hover at the window once they have set about a door`, atWindowLate === 0, `${atWindowLate} steps at the window after eight seconds`);
    }

    // Every windowed room in the loaded map: from outside each window that looks out on open ground, a door is found (a tile
    // to stand at beside it). A window is never a way in, so a room whose doors are all hidden is a safe spot.
    const exceptions = [];
    let looked = 0;
    for (const room of [...G.map.allRooms()].sort((a, b) => a.id - b.id)) { // every room, as the houses' search
      const id = room.id;
      const wins = room.openings.filter((op) => { const w = G.map.tileAt(op.tx, op.ty)[op.edge]; return w && w.kind === "window"; });
      if (!wins.length) continue;
      for (const op of wins) {
        const out = [[op.tx, op.ty], op.edge === "n" ? [op.tx, op.ty - 1] : [op.tx - 1, op.ty]].find((t) => G.map.tileAt(t[0], t[1]).room === 0);
        if (!out) continue;
        looked++;
        // a door to break and stand at, or a door already open to walk in by
        const walkIn = room.openings.some((o) => { const d = G.map.tileAt(o.tx, o.ty)[o.edge]; return d && d.kind === "door" && G.map.wayOpen(d); });
        if (!G.map.breachTargets(room, out[0], out[1]).length && !walkIn) exceptions.push(`${op.tx},${op.ty}${op.edge}`);
      }
    }
    row("every window that looks out on open ground has a door to go for (none is a safe spot)", looked > 0 && exceptions.length === 0, `${looked} windows looked at${exceptions.length ? `; no door found from ${exceptions.slice(0, 6).join(", ")}` : ""}`);

    // No door the dead can reach: they batter the shut window open for sight, then search, and do not search paths each step.
    if (houses.outdoors) {
      const { win, doors, doorOps, w, from } = houses.outdoors;
      const shutter0 = win.wall.shutter;
      const broken0 = win.wall.broken;
      const hp0 = win.wall.hp;
      const chairs = [];
      restore.push(() => { for (const c of chairs) G.map.removeProp(c); win.wall.shutter = shutter0; win.wall.broken = broken0; win.wall.hp = hp0; G.map.touch(win.op.tx, win.op.ty); });
      win.wall.shutter = "closed";
      win.wall.broken = false;
      win.wall.hp = 100;
      G.map.touch(win.op.tx, win.op.ty);
      for (const d of doors) { d.open = false; d.broken = false; d.hp = 100; } // the door the first trial broke, shut and whole again
      for (const o of doorOps) G.map.touch(o.op.tx, o.op.ty);
      step(1);
      const room = G.map.getRoom(G.map.tileAt(w.inside[0], w.inside[1]).room);
      for (const c of G.map.breachTargets(room, from[0], from[1])) { // furniture where each door is stood at
        const chair = G.map.createProp({ sprite: "chair", tile: [c.stand[0], c.stand[1]], footprint: [1, 1] });
        G.map.placeProp(chair, c.stand[0], c.stand[1]);
        chairs.push(chair);
      }
      const z = own(from);
      G.teleport(w.inside[0], w.inside[1]);
      z.gx = from[0];
      z.gy = from[1];
      z.path = [];
      z.breach = null;
      z.noWay = 0;
      z.lastSeen = [w.inside[0], w.inside[1]];
      z.state = "chase";
      z.aggro = true;
      let battered = false;
      let searched = false;
      let passed = false;
      for (let i = 0; i < 60 * 240 && !searched; i++) {
        step(1);
        if (z.breach && z.breach.wall.kind === "window") battered = true;
        if (battered && z.state === "search" && z.noWay > 0) searched = true;
        if (G.map.tileAt(Math.round(z.gx), Math.round(z.gy)).room === G.map.tileAt(w.inside[0], w.inside[1]).room) passed = true;
      }
      row("[no door to reach] the dead batter the shut window open for sight", battered && (win.wall.shutter === "open" || win.wall.broken), `shutter ${win.wall.shutter}, broken ${!!win.wall.broken}, hp ${win.wall.hp}`);
      row("[no door to reach] then they search, and never pass the window", searched && !passed, `state ${z.state}, noWay ${(z.noWay || 0).toFixed(1)}`);
      // Cost, against the same steps with that dead one far away and not hunting (the pane draws a frame each step, so the
      // baseline is not the headless 0.09 ms): the stalled one must not cost a path search every step.
      const timed = () => { const t0 = performance.now(); for (let i = 0; i < 300; i++) step(1); return (performance.now() - t0) / 300; };
      const stalled = timed();
      const was = { gx: z.gx, gy: z.gy };
      z.gx = from[0] + 60;
      z.gy = from[1] + 60;
      z.aggro = false;
      z.state = "idle";
      z.path = [];
      const baseline = timed();
      Object.assign(z, was);
      row("[no door to reach] a dead one with no way in does not search paths every step", stalled < baseline * 2 + 0.5, `${stalled.toFixed(2)} ms a step stalled, ${baseline.toFixed(2)} ms without it`);
    }
  } finally {
    for (const r of restore.reverse()) r();
    G.game.state.zombies = [...dead0, ...G.game.state.zombies]; // the world's dead back, and any it made that are still standing
    for (const [w, was] of openings0) if (Object.keys(was).some((k) => w[k] !== was[k])) { Object.assign(w, was); if (w.at) G.map.touch(w.at[0], w.at[1]); }
    G.map.rebuildRooms(); // a door shut or a wall whole again closes its room
    Object.assign(me, needs0);
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
