// What a player sees of the dead in the dark (docs/07, #88; src/sight.js): in daylight every one of the dead in view; at
// night, with no light, those within a short radius, fading to hidden over a soft edge past it; a carried torch gives
// sight back to its own radius; a dead one standing in another's light is seen from afar; a burning one is seen. Numbers
// are `data/tuning.json`'s `sight`. From the console, on a tab with `?nosave`:
//   await __game.check("sight")
// It stands one of the dead at set distances east of the player, changes the hour and the player's hands, and puts the
// hour, the hands, the other player, and the dead one back.

export async function run(game) {
  const G = game;
  const S = G.game.state;
  const rows = [];
  const row = (check, ok, detail) => rows.push({ check, result: ok ? "pass" : "FAIL", detail });
  const sight = await import("/src/sight.js");
  const T = G.tuning.sight;
  const T00 = { darkRadius: T.darkRadius, edge: T.edge }; // the swing row shortens the eye's reach: put back in the finally
  const wasPaused = G.loop.isPaused();
  const hour0 = G.clock.getHour();
  const me = G.player;
  const meAt = [me.gx, me.gy];
  const hands0 = { main: me.hands.main, off: me.hands.off };
  const z = G.zombies.find((q) => !q.dead && !q.corpse);
  const z0 = { gx: z.gx, gy: z.gy, state: z.state, aggro: z.aggro, burning: z.burning };
  let other = null;
  const step = (n = 4) => { for (let i = 0; i < n; i++) G.loop.advance(1 / 60); };
  const alphaAt = (d) => { z.gx = me.gx + d; z.gy = me.gy; step(2); return sight.seenAlpha(me, z); };
  const near = (a, b, e = 0.02) => Math.abs(a - b) <= e;
  try {
    G.loop.setPaused(true);
    // A tile of open ground with room to the east: the spawn's street.
    const spot = G.map.nearestWalkable(112, 188) || meAt;
    G.teleport(spot[0], spot[1]);
    z.state = "idle";
    z.aggro = false;
    z.path = [];
    z.burning = false;

    G.clock.setHour(12);
    row("out of doors by day nothing is hidden: the dead at eight tiles are seen whole", near(alphaAt(8), 1), `${alphaAt(8).toFixed(2)}`);

    G.clock.setHour(0);
    me.hands.main = null;
    me.hands.off = null;
    step();
    const dark = [0, 1, T.darkRadius, T.darkRadius + T.edge / 2, T.darkRadius + T.edge, T.darkRadius + T.edge + 2].map(alphaAt);
    row("at night with no light the dead within the short radius are seen whole", near(dark[1], 1) && near(dark[2], 1), `${dark[1].toFixed(2)} at 1, ${dark[2].toFixed(2)} at ${T.darkRadius}`);
    row("past it they fade over the soft edge", dark[3] > 0.2 && dark[3] < 0.8 && dark[2] > dark[3] && dark[3] > dark[4], `half way ${dark[3].toFixed(2)}, at the edge's end ${dark[4].toFixed(2)}`);
    row("and are hidden beyond it", near(dark[4], 0) && near(dark[5], 0), `${dark[5].toFixed(2)} at ${T.darkRadius + T.edge + 2}`);

    // A torch on the belt sees a bit further than none (Michael, 2026-10-17, #158): its radius is above the dark radius.
    const belt = G.inventory.beltOf(me);
    const slot = belt ? belt.findIndex((e) => !e) : -1;
    if (slot >= 0) {
      let bare;
      let withBelt;
      let carriedBelt;
      try {
        bare = alphaAt(T.darkRadius + 1.1);
        belt[slot] = G.items.makeEntry("torch", 1, { lit: true, wear: 0 });
        step();
        withBelt = alphaAt(T.darkRadius + 1.1);
        carriedBelt = G.light.carriers().find((c) => c.owner === me.id);
      } finally {
        belt[slot] = null; // the real belt, put back whatever happens
      }
      step();
      row("a lit torch on the belt sees a bit further than none", !!carriedBelt && carriedBelt.radius > T.darkRadius && withBelt >= T.seenAt && bare < T.seenAt, `radius ${carriedBelt && carriedBelt.radius}; at ${T.darkRadius + 1.1} tiles: ${bare.toFixed(2)} bare, ${withBelt.toFixed(2)} with the belt torch (seen from ${T.seenAt})`);
    } else row("a free belt slot for the belt torch row", false, "none");

    // "Something groans in the dark." is for one the dark hides, not one a canopy hides by day (#158).
    const speech = await import("/src/ui/speech.js");
    const logMod = await import("/src/ui/log.js");
    // The log keeps only so many lines, so a count can stay level as it fills: a line is told by the log's last one.
    const groaned = () => /groans in the dark/.test(logMod.lines().slice(-1)[0] || "");
    logMod.push("(the sight check)", "info"); // a last line of its own to start from
    const saySomething = (at) => { z.gx = me.gx + at; z.gy = me.gy; z.line = { text: "Hnnngh.", left: 2 }; return new Set([G.visibility.tileKey(Math.round(z.gx), Math.round(z.gy))]); };
    G.clock.setHour(12);
    step();
    z.behindProp = true;
    speech.updateSpeech([z], saySomething(6), me, 1 / 60);
    row("by day a dead one behind a canopy says nothing in the log", !groaned(), `last line: ${logMod.lines().slice(-1)[0]}`);
    z.behindProp = false;
    z.line = null;
    G.clock.setHour(0);
    step(60 * (T.groanGap + 1)); // past the groans' gap in the log (`groanGap`, sim seconds)
    speech.updateSpeech([z], saySomething(T.darkRadius + T.edge + 1), me, 1 / 60);
    row("but one the dark hides, in line of sight, does", groaned(), `last line: ${logMod.lines().slice(-1)[0]}`);
    z.line = null;
    // Beyond the groan's radius, nothing, however long since the last (#177); a second one within it right away waits for the gap.
    logMod.push("(the groan radius)", "info");
    step(60 * (T.groanGap + 5));
    speech.updateSpeech([z], saySomething(T.groanRadius + 1), me, 1 / 60);
    row("one in the dark farther than the groan's radius is not heard", !groaned(), `at ${T.groanRadius + 1} tiles; last line: ${logMod.lines().slice(-1)[0]}`);
    z.line = null;
    logMod.push("(the groan gap)", "info");
    speech.updateSpeech([z], saySomething(T.darkRadius + T.edge + 1), me, 1 / 60);
    const first = groaned();
    z.line = null;
    logMod.push("(the groan gap, again)", "info");
    step(60 * 3);
    speech.updateSpeech([z], saySomething(T.darkRadius + T.edge + 1), me, 1 / 60);
    row("and the next within the gap waits: one line, then quiet for groanGap seconds", first && !groaned(), `first ${first}, three seconds later ${groaned()}`);
    z.line = null;

    // The dark hides information, never physics (Michael, #150): one lost in it cannot be pointed at (no hover hand, no click, no
    // right-click: `characterAt`), one seen can; and a hit still lands on it (a swing or a shot is the world's, not the eye's).
    const pointAt = (d) => { z.gx = me.gx + d; z.gy = me.gy; step(2); const p = G.iso.toScreen(z.gx, z.gy); return G.interact.characterAt(p.x, p.y - 20, me); };
    const seenOne = pointAt(1);
    const hiddenOne = pointAt(6);
    row("a dead one seen in the dark can be pointed at, and one lost in it cannot", seenOne === z && hiddenOne === null, `at 1 tile ${seenOne === z ? "found" : "missed"}, at 6 ${hiddenOne === null ? "nothing there" : "found"}`);
    z.gx = me.gx + 6;
    z.gy = me.gy;
    // A real swing, east, with a stick, at one standing in its wedge that nobody sees (the eye's short radius made shorter than the
    // arm's for the test): it still lands. The dark hides information, never physics.
    const stick = G.items.makeEntry("stick", 1);
    const heldBefore = { main: me.hands.main, off: me.hands.off };
    const T0 = { darkRadius: T.darkRadius, edge: T.edge };
    T.darkRadius = 0.2;
    T.edge = 0.3;
    me.hands.main = stick;
    me.hands.off = null;
    me.aim.sx = 1;
    me.aim.sy = 0;
    z.gx = me.gx + 1.0;
    z.gy = me.gy;
    step(2);
    const hiddenAtSwing = !sight.seen(me, z);
    const hp0 = z.hp;
    G.combat.tryAttack(me, G.zombies, "main");
    step(40);
    T.darkRadius = T0.darkRadius;
    T.edge = T0.edge;
    row("a swing still lands on one lost in the dark", hiddenAtSwing && z.hp < hp0, `hp ${hp0} to ${z.hp}; hidden at the swing ${hiddenAtSwing}`);
    z.hp = hp0;
    me.hands.main = heldBefore.main;
    me.hands.off = heldBefore.off;

    me.hands.main = hands0.main || me.hands.main;
    // A lit torch for the rows below (the starting kit's torch begins unlit since #157, so the check lights its own).
    const torch = G.items.makeEntry("torch", 1, { lit: true, wear: 0 });
    me.hands.main = torch;
    step();
    const carried = G.light.carriers().find((c) => Math.hypot(c.gx - me.gx, c.gy - me.gy) < 0.7);
    const R = carried ? carried.radius : 3;
    const lit = [R, R + T.edge / 2, R + T.edge].map(alphaAt);
    row("a carried torch gives sight back to its radius", carried && R > T.darkRadius && near(lit[0], 1), `radius ${R}: ${lit[0].toFixed(2)} whole at ${R}`);
    row("and the soft edge is past that", lit[1] > 0.2 && lit[1] < 0.8 && near(lit[2], 0), `${lit[1].toFixed(2)} half way, ${lit[2].toFixed(2)} at the end`);

    // Another player's torch: the dead one standing in its light is seen from afar.
    me.hands.main = null;
    me.hands.off = null;
    step();
    z.gx = me.gx + 9;
    z.gy = me.gy;
    const far = alphaAt(9);
    const spotFor = G.map.nearestWalkable(Math.round(me.gx + 10), Math.round(me.gy)) || [me.gx + 10, me.gy];
    other = G.addPlayer(spotFor[0], spotFor[1]);
    other.hands.main = { ...torch };
    step(6);
    const byTheirs = sight.seenAlpha(me, z);
    other.hands.main = null;
    step(6);
    const unlit = sight.seenAlpha(me, z);
    row("a dead one in another's torchlight is seen from afar, and hidden when it goes out", near(far, 0) && byTheirs > 0.9 && near(unlit, 0), `${far.toFixed(2)} dark, ${byTheirs.toFixed(2)} by their torch, ${unlit.toFixed(2)} after`);

    // A shuttered room is dark by day too, and open shutters light it (Michael, #150): a dead one inside an unlit room at noon,
    // seen from beyond the short radius, is hidden with the shutters closed and seen with them open.
    G.clock.setHour(12);
    let room = null;
    for (let id = 1; id < 300 && !room; id++) {
      const r = G.map.getRoom(id);
      if (!r || r.size > 24) continue;
      const wins = r.openings.map((op) => ({ op, wall: G.map.tileAt(op.tx, op.ty)[op.edge] })).filter((o) => o.wall && o.wall.kind === "window");
      const doorsShut = r.openings.every((op) => { const w = G.map.tileAt(op.tx, op.ty)[op.edge]; return !w || w.kind !== "door" || (!w.open && !w.broken); });
      if (wins.length === 1 && doorsShut && !G.map.boarded(wins[0].wall) && wins[0].wall.shutter === "closed") {
        const w0 = wins[0];
        const at = [[w0.op.tx, w0.op.ty], w0.op.edge === "n" ? [w0.op.tx, w0.op.ty - 1] : [w0.op.tx - 1, w0.op.ty]].find((t) => G.map.tileAt(t[0], t[1]).room === id);
        if (at && G.light.lightAt(at[0], at[1]) < 0.3) room = { id, r, win: w0 }; // unlit: no hearth burning in it or beside it
      }
    }
    if (room) {
      const win = room.win;
      const inside = [[win.op.tx, win.op.ty], win.op.edge === "n" ? [win.op.tx, win.op.ty - 1] : [win.op.tx - 1, win.op.ty]].find((t) => G.map.tileAt(t[0], t[1]).room === room.id);
      const shutter0 = win.wall.shutter;
      const hp0 = win.wall.hp;
      try {
        z.gx = inside[0];
        z.gy = inside[1];
        me.gx = inside[0] + 7;
        me.gy = inside[1];
        win.wall.shutter = "closed";
        G.map.touch(win.op.tx, win.op.ty);
        step(4);
        const shut = sight.seenAlpha(me, z);
        win.wall.shutter = "open";
        G.map.touch(win.op.tx, win.op.ty);
        step(4);
        const open = sight.seenAlpha(me, z);
        const ambientOpen = G.light.roomAmbient(G.map.tileAt(inside[0], inside[1]).room);
        win.wall.shutter = "closed";
        G.map.touch(win.op.tx, win.op.ty);
        step(4);
        const ambientShut = G.light.roomAmbient(G.map.tileAt(inside[0], inside[1]).room);
        row("a shuttered room is dark by day: a dead one in it, 7 tiles off, is hidden; with the shutters open it is seen", near(shut, 0) && near(open, 1), `noon, room of ${room.r.size} tiles: ${shut.toFixed(2)} shuttered, ${open.toFixed(2)} open`);
        row("and its real light: an open room reaches the cap (`unlitRoomCap`, window-lit), a shuttered one stays at the night's", ambientOpen >= G.light.tunables.unlitRoomCap - 0.03 && ambientShut < 0.3, `ambient ${ambientOpen.toFixed(2)} open (cap ${G.light.tunables.unlitRoomCap}), ${ambientShut.toFixed(2)} shuttered`);
      } finally {
        win.wall.shutter = shutter0;
        win.wall.hp = hp0;
        G.map.touch(win.op.tx, win.op.ty);
      }
    } else row("a shuttered room is dark by day: a dead one in it is hidden; with the shutters open it is seen", false, "no small room with one window found");
    // One open window is enough for a small room and not for a large one (`world.daylightTiles`, in proportion to its size).
    let big = null;
    for (let id = 1; id < 300 && !big; id++) {
      const r = G.map.getRoom(id);
      if (!r || r.size < 60) continue;
      const wins = r.openings.map((op) => ({ op, wall: G.map.tileAt(op.tx, op.ty)[op.edge] })).filter((o) => o.wall && o.wall.kind === "window" && !G.map.boarded(o.wall));
      if (wins.length >= 2 && r.openings.every((op) => { const w = G.map.tileAt(op.tx, op.ty)[op.edge]; return !w || w.kind !== "door" || (!w.open && !w.broken); })) big = { r, wins };
    }
    if (big) {
      const state0 = big.wins.map((w) => w.wall.shutter);
      try {
        big.wins.forEach((w) => { w.wall.shutter = "closed"; });
        const shut = G.light.openness(big.r);
        big.wins[0].wall.shutter = "open";
        const one = G.light.openness(big.r);
        big.wins.forEach((w) => { w.wall.shutter = "open"; });
        const all = G.light.openness(big.r);
        row("a large room needs more open windows than a small one: one lights part of it, all of them more", shut < 0.2 && one > shut && one < 1 && all > one, `${big.r.size} tiles, ${big.wins.length} windows: ${shut.toFixed(2)} shuttered, ${one.toFixed(2)} with one open, ${all.toFixed(2)} with all`);
      } finally {
        big.wins.forEach((w, i) => { w.wall.shutter = state0[i]; });
      }
    } else row("a large room needs more open windows than a small one", false, "no large room with two windows found");
    G.clock.setHour(0);
    me.gx = meAt[0];
    me.gy = meAt[1];
    G.teleport(spot[0], spot[1]);

    z.gx = me.gx + 9;
    z.gy = me.gy;
    z.burning = true; // read at once: the burn's own step would put it out
    row("a burning one is its own light", near(sight.seenAlpha(me, z), 1), "seen whole at nine tiles");
    z.burning = false;
  } finally {
    T.darkRadius = T00.darkRadius;
    T.edge = T00.edge;
    if (other) G.game.removePlayer(other.id);
    Object.assign(z, z0);
    z.path = [];
    me.hands.main = hands0.main;
    me.hands.off = hands0.off;
    G.teleport(meAt[0], meAt[1]);
    G.clock.setHour(hour0);
    G.loop.setPaused(wasPaused);
  }
  for (const r of rows) console.log(`${r.result}  ${r.check}  (${r.detail})`);
  return { rows, passed: rows.filter((r) => r.result === "pass").length, total: rows.length };
}
