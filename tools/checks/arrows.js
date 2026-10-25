// Arrows in flight between steps and on a guest (#250). From the console, on a tab with `?nosave`:
//   await __game.check("arrows")                    the host's half: a bow loosed in a step is drawn from its launch point on that step's
//                                                   frames (no first-frame stall), and a flight replayed from its launch record is the host's
//                                                   step for step
//   await __game.check("arrows", { keep: true })    the same, then on open ground every other player stood beside me and an arrow loosed east
//                                                   the moment the last comes down, every third a fireball, for as long as the tab runs; the
//                                                   loop is left running (unpaused) for the guest; returns `kept`
//   await __game.check("arrows", { stop: true })    the firing stopped and the rule put back (after the guest's half)
// On a guest (two tabs, `?nosave&relay=none`, joined by `__game.net.open({ join })`), with the host's tab running its keep:
//   await __game.check("arrows", { guest: kept })   about eight seconds of the wall clock, a step of mine each sixtieth: each flight's drawn place
//                                                   read each step; it moves every step (the old replica stood still two steps in three and
//                                                   jumped on the third), evenly, at its own speed; it is first drawn near the bow and, between
//                                                   steps, from the bow itself; it is gone at the host's end; a fireball leaves its flare where
//                                                   its drawn flight ended; each launch came once
// Then `check("sync")` on the host. `node tools/netsmooth.js` measures the same against the old way under four arrival patterns.

export async function run(game, opts = {}) {
  const G = game;
  const rows = [];
  const row = (check, ok, detail) => rows.push({ check, result: ok ? "pass" : "FAIL", detail });
  const finish = (extra = {}) => {
    for (const r of rows) console.log(`${r.result}  ${r.check}  (${r.detail})`);
    return { rows, passed: rows.filter((r) => r.result === "pass").length, total: rows.length, fails: rows.filter((r) => r.result === "FAIL").length, ...extra };
  };
  const yieldOnce = () => new Promise((r) => { const ch = new MessageChannel(); ch.port1.onmessage = () => r(); ch.port2.postMessage(0); });
  const interp = await import("/src/interp.js");
  const archery = await import("/src/archery.js");
  const role = G.net.status().role;
  const STEP = 1 / 60;

  // ---- the keep's firing, stopped ----
  if (opts.stop) {
    const k = window.__arrowsKeep;
    if (k) k.stop();
    row("the keep's firing stopped and the rule put back", !!k && !window.__arrowsKeep, k ? `${k.shots} shots loosed` : "no keep was running");
    return finish();
  }

  // ---- a guest's half: the flights the host keeps loosing, read each step ----
  if (opts.guest) {
    if (role !== "guest") {
      row("this tab is a guest", false, `role ${role || "none"}: run the guest's half in the joined tab`);
      return finish();
    }
    const wasPaused = G.loop.isPaused();
    const screen0 = G.screens.currentScreen();
    const stats0 = archery.replicaStats() || { go: 0, again: 0, end: 0 };
    const wire0 = G.net.status().wire;
    const seen = new Map(); // id -> { a, at: [[step, gx, gy]], bowOk (the between-steps draw at alpha 0 on its first step) }
    const flares = []; // [step, gx, gy] as each appears
    const flaresSeen = new Set(G.archery.flares());
    const gone = new Map(); // id -> the step it left the list
    try {
      G.loop.setPaused(true);
      if (screen0) G.screens.hide();
      const t0 = performance.now();
      let last = t0;
      let s = 0;
      let prevIds = new Set();
      while (performance.now() - t0 < 8000) {
        await yieldOnce();
        if (performance.now() - last < 1000 / 60) continue;
        last = performance.now();
        G.loop.advance(STEP); // main's step: the frames applied, the flights stepped on the draw clock, the new ones adopted from the bow (interp)
        s++;
        const now = new Set();
        for (const a of G.archery.flying()) {
          if (a.done) continue;
          now.add(a.id);
          let rec = seen.get(a.id);
          if (!rec) {
            // Its first step drawn: between steps it starts at the bow (alpha 0 is the step's start).
            interp.apply(0);
            const atBow = Math.hypot(a.gx - a.x0, a.gy - a.y0) < 1e-9 && Math.abs(a.z - a.z0) < 1e-9;
            interp.restore();
            rec = { a, at: [], bowOk: atBow };
            seen.set(a.id, rec);
          }
          rec.at.push([s, a.gx, a.gy]);
        }
        for (const id of prevIds) if (!now.has(id)) gone.set(id, s);
        prevIds = now;
        for (const f of G.archery.flares()) if (!flaresSeen.has(f)) { flaresSeen.add(f); flares.push([s, f.gx, f.gy]); }
      }
      const stats = archery.replicaStats() || { go: 0, again: 0, end: 0 };
      const wire = G.net.status().wire;
      const flights = [...seen.values()].filter((r) => r.at.length >= 4);
      row("flights from the host's keep run reached me and were drawn (an arrow loosed as the last comes down, every third a fireball)", flights.length >= 4 && flights.some((r) => r.a.projectile === "fireball"), `${seen.size} flights drawn, ${flights.length} for four steps or more: ${[...new Set([...seen.values()].map((r) => r.a.projectile))].join(", ")}`);
      // Every step it is drawn, it moves; and evenly, at its own speed (the draw clock moves a step a step, nudged a tenth of the frames' gap).
      let still = 0;
      let moves = 0;
      let worst = 1;
      let worstHi = 1;
      const means = [];
      for (const r of flights) {
        const own = r.a.speed * STEP;
        const d = [];
        for (let i = 2; i < r.at.length - 1; i++) {
          if (r.at[i][0] !== r.at[i - 1][0] + 1) continue;
          const m = Math.hypot(r.at[i][1] - r.at[i - 1][1], r.at[i][2] - r.at[i - 1][2]) / own;
          d.push(m);
          if (m < 0.05) still++;
        }
        moves += d.length;
        if (d.length) {
          means.push(d.reduce((x, y) => x + y, 0) / d.length);
          worst = Math.min(worst, ...d);
          worstHi = Math.max(worstHi, ...d);
        }
      }
      row("each flight moves every step it is drawn: no step stood still (the old replica stood still two steps in three, then jumped three steps' flight)", moves > 60 && still === 0, `${still} of ${moves} steps stood still`);
      row("evenly, at its own speed: every step between half and one and a half of its flight a step (the draw clock's nudges), each flight's mean within 0.15", moves > 60 && worst > 0.5 && worstHi < 1.6 && means.every((m) => Math.abs(m - 1) < 0.15), `a step's movement ${worst.toFixed(2)} to ${worstHi.toFixed(2)} of its own; flights' means ${means.map((m) => m.toFixed(2)).join(" ")}`);
      // Its first drawn place is near the bow (a frame late beyond the draw clock's delay may start it a step or two out), and between steps it is drawn from the bow itself.
      const firsts = flights.map((r) => Math.hypot(r.at[0][1] - r.a.x0, r.at[0][2] - r.a.y0) / (r.a.speed * STEP));
      row("first drawn within three steps' flight of the bow, and on its first step drawn between steps from the bow itself (no first-frame stall)", flights.length > 0 && firsts.every((f) => f <= 3) && flights.every((r) => r.bowOk), `first drawn ${firsts.map((f) => f.toFixed(2)).join(" ")} steps' flight out; from the bow between steps ${flights.filter((r) => r.bowOk).length} of ${flights.length}`);
      // Down at the host's end: a flight whose end came is gone once its drawn age reaches it, never drawn past it.
      const ended = flights.filter((r) => r.a.hostEnd != null);
      const past = ended.filter((r) => r.a.t >= Math.min(r.a.end, r.a.hostEnd) + 1e-6); // `t` is the age it was last drawn at
      const down = ended.filter((r) => r.a.done && gone.has(r.a.id));
      row("each flight is gone at the host's end, never drawn past it", down.length >= 3 && past.length === 0, `${ended.length} with the host's end, ${down.length} gone at it, ${past.length} drawn past it; ${stats.end - stats0.end} ends received`);
      // A fireball's flare: made where its drawn flight ended, at the host's landing point, on the step it left.
      const balls = ended.filter((r) => r.a.projectile === "fireball" && gone.has(r.a.id));
      const flareOk = balls.filter((r) => r.a.landAt && flares.some(([fs, fx, fy]) => fs === gone.get(r.a.id) && Math.hypot(fx - r.a.landAt[0], fy - r.a.landAt[1]) < 1e-3));
      row("a fireball's flare is made on the step its drawn flight ends, at the host's landing point (no flares travel)", balls.length >= 1 && flareOk.length === balls.length, `${flareOk.length} of ${balls.length} fireballs; ${flares.length} flares made`);
      row("each flight's launch came once (none again without a join)", stats.go - stats0.go >= seen.size - 1 && stats.again === stats0.again, `${stats.go - stats0.go} launches over the run for ${seen.size} flights drawn (one may have come before it), ${stats.again - stats0.again} again`);
      const kbps = (x) => (typeof x === "number" ? (x / 1024).toFixed(2) : "?");
      row("the wire, reported (net.status().wire: the bytes a second in, now)", true, `in ${kbps(wire.in)} KB/s now (${kbps(wire0.in)} before the run); ${Math.round(((wire.inTotal || 0) - (wire0.inTotal || 0)) / 1024)} KB over the run`);
    } catch (e) {
      rows.push({ check: "setup", result: "FAIL", detail: e.message + (e.stack ? " " + e.stack.split("\n")[1] : "") });
    } finally {
      interp.restore();
      if (screen0 && !G.screens.currentScreen()) G.screens.show(screen0);
      G.loop.setPaused(wasPaused);
    }
    return finish();
  }

  // ---- the host's half ----
  if (window.__arrowsKeep) window.__arrowsKeep.stop(); // a keep left from an earlier run
  const me = G.player;
  const bag = G.inventory.bagOf(me);
  const arrows0 = bag ? G.inventory.countItem(bag, "arrow") : 0;
  const meAt = [me.gx, me.gy];
  const hands0 = { main: me.hands.main, off: me.hands.off };
  const wasPaused = G.loop.isPaused();
  const screen0 = G.screens.currentScreen();
  const aggro0 = G.rules.rules.zombieAggro;
  let keeping = false;
  let kept = null;
  try {
    G.loop.setPaused(true);
    if (screen0) G.screens.hide();
    G.rules.set({ zombieAggro: false });
    // Open ground to shoot east across: a stretch fourteen tiles long and seven wide with nothing on it, grown first.
    let c = null;
    for (let r = 0; r <= 90 && !c; r += 3) {
      for (let dy = -r; dy <= r && !c; dy += 3) for (let dx = -r; dx <= r && !c; dx += 3) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        const x = Math.round(meAt[0]) + dx;
        const y = Math.round(meAt[1]) + dy;
        G.map.ensureAround(x, y, 2);
        let clear = true;
        for (let oy = -3; oy <= 3 && clear; oy++) for (let ox = -2; ox <= 14 && clear; ox++) {
          const t = G.map.tileAt(x + ox, y + oy);
          clear = G.map.isWalkableTile(x + ox, y + oy) && t.room === 0 && !t.prop && !t.n && !t.w;
        }
        if (clear) c = [x, y];
      }
    }
    if (!c) throw new Error("no open ground within 90 tiles");
    G.teleport(c[0], c[1]);
    for (let i = 0; i < 5; i++) G.loop.advance(STEP);

    // 1. A bow loosed inside a step: the release is the step's (a draw held, the button up), the arrow made after interp marked the step's
    // movers, so on that step's frames it was drawn standing where the step left it. Now it is marked from the bow (interp.adopt, main.js).
    me.hands.main = G.items.makeEntry("bow", 1);
    me.hands.off = me.hands.main;
    G.give("arrow", 3);
    G.archery.setAim(c[0] + 10, c[1]);
    me.recover = 0;
    me.draw = { t: 10, c: 1, source: "mouse", pauses: G.loop.pauseCount() }; // a full draw held; the button is up, so the step looses it
    me.drawing = true;
    const before = new Set(G.archery.flying());
    G.loop.advance(STEP);
    const a = G.archery.flying().find((q) => !before.has(q) && q.shooter === me && !q.done);
    if (!a) throw new Error("the held draw loosed nothing in the step");
    interp.apply(0);
    const start = [a.gx, a.gy, a.z];
    interp.apply(1);
    const end = [a.gx, a.gy, a.z];
    interp.restore();
    const atStep = [a.gx, a.gy, a.z];
    row("an arrow loosed in a step is drawn on that step's frames from the bow (alpha 0 at its launch point and height) to where the step left it (alpha 1): no first-frame stall", Math.hypot(start[0] - a.x0, start[1] - a.y0) < 1e-9 && Math.abs(start[2] - a.z0) < 1e-9 && Math.hypot(end[0] - atStep[0], end[1] - atStep[1]) < 1e-9 && Math.hypot(atStep[0] - a.x0, atStep[1] - a.y0) > 0.1 && !interp.isApplied(), `from ${start.slice(0, 2).map((v) => v.toFixed(3)).join(",")} (the bow ${a.x0.toFixed(3)},${a.y0.toFixed(3)}) to ${end.slice(0, 2).map((v) => v.toFixed(3)).join(",")}, the step's own ${atStep.slice(0, 2).map((v) => v.toFixed(3)).join(",")}`);

    // 2. The same flight as a guest steps it: from its launch record, once, with the host's own pose, at every age; gone at the host's end.
    const host = [[a.t, a.gx, a.gy, a.z, a.frame]];
    for (let i = 0; i < 600 && !a.done; i++) {
      G.loop.advance(STEP);
      if (!a.done) host.push([a.t, a.gx, a.gy, a.z, a.frame]);
    }
    const store = archery.flightStore();
    archery.applyFlights(store, { go: [archery.launchRecord(a, host[0][0])] }, 50);
    let err = 0;
    let angles = 0;
    let shown = 0;
    for (const [t, gx, gy, z, frame] of host) {
      archery.stepFlights(store, 50 + t - host[0][0]);
      const g = store.shown[0];
      if (!g) continue;
      shown++;
      err = Math.max(err, Math.hypot(g.gx - gx, g.gy - gy));
      if (g.frame !== frame || Math.abs(g.z - z) > 0.05) angles++;
    }
    archery.applyFlights(store, { end: [archery.endRecord(a)] }, 50 + a.t - host[0][0]);
    archery.stepFlights(store, 50 + a.t - host[0][0]);
    const rec = archery.launchRecord(a, 0);
    const bytes = JSON.stringify(rec).length + JSON.stringify(archery.endRecord(a)).length;
    const oldBytes = Math.ceil(host.length / 3) * JSON.stringify({ gx: a.gx, gy: a.gy, z: a.z, frame: a.frame, projectile: a.projectile }).length;
    row("a flight stepped from its launch record is the host's at every age (its place, height, and picture), and gone at the host's end", shown === host.length && err < 2e-3 && angles === 0 && store.shown.length === 0, `${shown} of ${host.length} steps, off by ${err.toExponential(1)} tiles at most, ${angles} with another picture or height; ${store.shown.length ? "still drawn" : "gone"} at the end`);
    row("on the wire it is sent once: its launch and its end, against its place in every frame before", bytes < oldBytes, `${bytes} bytes for the flight (launch ${JSON.stringify(rec).length}, end ${JSON.stringify(archery.endRecord(a)).length}); the old way about ${oldBytes} (${Math.ceil(host.length / 3)} frames of its place), and every frame's empty "arrows" and "flares" lists gone`);

    // ---- the keep: an arrow loosed east as the last comes down, every third a fireball, for the guest's half ----
    if (opts.keep) {
      keeping = true;
      for (const p of G.game.state.players) {
        if (p === me) continue;
        p.gx = c[0];
        p.gy = c[1] + 2;
        p.auto = null;
      }
      const spell = G.items.getItem("book_of_fire").book.spell;
      let shots = 0;
      const loose = () => {
        shots++;
        const ball = shots % 3 === 0;
        const o = ball
          ? { projectile: "fireball", speed: spell.speed, flat: true, vanish: true, z0: spell.z0, arcMin: 0, arcMax: 0, contact: spell.contact, landRadius: spell.landRadius, damage: 0, knockback: 0 }
          : { vanish: true, damage: 0, knockback: 0 }; // nothing lands: the ground stays clear however long it runs
        const shot = G.archery.shootWith([1, 0], ball ? 8 : 11, 1, o);
        shot.keepShot = true;
      };
      const onLand = ({ arrow }) => { if (arrow && arrow.keepShot && window.__arrowsKeep === keep) loose(); };
      const keep = {
        get shots() { return shots; },
        stop() {
          G.events.off("arrowLanded", onLand);
          if (window.__arrowsKeep === keep) delete window.__arrowsKeep;
          G.rules.set({ zombieAggro: aggro0 });
          G.teleport(meAt[0], meAt[1]);
        },
      };
      window.__arrowsKeep = keep;
      G.events.on("arrowLanded", onLand);
      loose();
      kept = { at: [...c], shooter: me.id };
    }
  } catch (e) {
    rows.push({ check: "setup", result: "FAIL", detail: e.message + (e.stack ? " " + e.stack.split("\n")[1] : "") });
    keeping = false;
    if (window.__arrowsKeep) window.__arrowsKeep.stop();
  } finally {
    interp.restore();
    G.archery.setAim(null);
    me.draw = null;
    me.drawing = false;
    me.hands.main = hands0.main;
    me.hands.off = hands0.off;
    const extra = bag ? G.inventory.countItem(bag, "arrow") - arrows0 : 0;
    if (extra > 0) G.inventory.removeItem(bag, "arrow", extra);
    if (!keeping) {
      G.rules.set({ zombieAggro: aggro0 });
      G.teleport(meAt[0], meAt[1]);
    }
    if (screen0 && !G.screens.currentScreen()) G.screens.show(screen0);
    G.loop.setPaused(keeping ? false : wasPaused); // a keep leaves the host running, on the wire's background driver while hidden
  }
  return finish({ kept });
}
