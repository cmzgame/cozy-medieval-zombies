// The sounds, step 1 (docs/40, section 8; #379): the slots and their placeholders, the footsteps, the swing, the hit,
// distance, the master switch and the volume, and a gap of wall time between steps. A paused pane draws nothing, so the
// check runs the ear by hand after each step (`__game.sound.update(1/60)`) and reads its log, never the speakers (a
// scripted pane gives no user gesture, so the context stays suspended; the log is written either way).
// From the console, on a ?nosave tab of the valley (the spawn is in the cottage, on its wood floor):
//   await __game.check("sound")
// It pauses the loop, works where the player stands and on open grass nearby, and puts the player's hands, place, aim,
// stamina, the rules, the Sound settings, the Floating numbers setting, and the loop back (docs/testing.md). Item 9 of the
// spec, the two-tab test, is run by hand (the pull request records it).

export async function run(game) {
  const G = game;
  const rows = [];
  const row = (check, ok, detail) => rows.push({ check, result: ok ? "pass" : "FAIL", detail });
  const snd = G.sound;
  const p = G.player;
  if (!snd || !snd.audio) {
    row("the sounds are wired (__game.sound)", false, "no __game.sound");
    console.table(rows);
    return { pass: false, rows };
  }
  const audio = snd.audio;
  const gen = await import("/src/sound-gen.js");
  const data = await G.assets.loadJson("data/sounds.json");
  const wasPaused = G.loop.isPaused();
  const saved = {
    main: p.hands.main, off: p.hands.off, gx: p.gx, gy: p.gy, aim: { ...p.aim }, stamina: p.stamina, auto: p.auto,
    soundOn: G.settings.get("soundOn"), soundVolume: G.settings.get("soundVolume"), floaters: G.settings.get("floaters"), aggro: G.rules.rules.zombieAggro,
  };
  const added = [];
  const S = G.game.state;
  G.loop.setPaused(true);
  const step = (n = 1) => { for (let i = 0; i < n; i++) { G.loop.advance(1 / 60); snd.update(1 / 60); } };
  const clear = () => { snd.log.length = 0; };
  const named = (re) => snd.log.filter((e) => re.test(e.name));
  const near = (a, b, eps = 0.02) => Math.abs(a - b) <= eps;
  const face = (gx, gy) => {
    const s = G.iso.toScreen(gx, gy);
    const o = G.iso.toScreen(p.gx, p.gy);
    const n = G.iso.normalize(s.x - o.x, s.y - o.y - 0.001);
    p.aim.sx = n.x;
    p.aim.sy = n.y;
  };
  const floorAt = (x, y) => G.map.tileAt(x, y).floor;
  // A tile of `floor` within `r` of the player with a clear run of `len` tiles of it to the east, outdoors or in.
  const findRun = (floor, len, r = 40) => {
    const cx = Math.round(p.gx), cy = Math.round(p.gy);
    let best = null;
    for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
      const x = cx + dx, y = cy + dy;
      let ok = true;
      for (let i = 0; i <= len && ok; i++) {
        const t = G.map.tileAt(x + i, y);
        if (t.floor !== floor || t.prop || !G.map.isWalkableTile(x + i, y) || (i > 0 && (G.map.tileAt(x + i, y).w))) ok = false;
      }
      if (ok && (!best || Math.hypot(dx, dy) < best.d)) best = { x, y, d: Math.hypot(dx, dy) };
    }
    return best;
  };
  try {
    G.settings.set("soundOn", true);
    G.settings.set("soundVolume", 0.75);
    G.rules.set({ zombieAggro: false });
    p.hands.off = null;
    snd.reset();
    step();

    // 1. Every slot has its buffers, each as long as its recipe; the boot stage's time.
    {
      const bad = [];
      for (const [name, def] of Object.entries(data.slots)) {
        const s = audio.slot(name);
        if (!s || s.buffers.length !== def.variants) { bad.push(`${name}: ${s ? s.buffers.length : "no slot"} of ${def.variants}`); continue; }
        for (const b of s.buffers) {
          const L = def.gen.length;
          if (!(b.length > 0) || b.duration < L * 0.9 - 0.001 || b.duration > L * 1.1 + 0.011) bad.push(`${name}: ${b.duration.toFixed(3)} s against ${L}`);
        }
      }
      const t = window.__boot && window.__boot.timings ? window.__boot.timings.sounds : null;
      row("every slot has its buffers, each as long as its recipe", bad.length === 0, bad.length ? bad.join("; ") : `${Object.keys(data.slots).length} slots, ${Object.values(data.slots).reduce((n, d) => n + d.variants, 0)} buffers at ${audio.sampleRate()} Hz`);
      row("the boot stage's time is reported", typeof t === "number", t == null ? "no window.__boot.timings.sounds" : `${t.toFixed(1)} ms (the spec's bound: 150 ms)`);
    }

    // 2. Each recipe gives the same samples again (rendered afresh now) and on the last boot (sessionStorage).
    {
      const hashes = {};
      const differ = [];
      for (const [name, def] of Object.entries(data.slots)) {
        const again = await gen.renderVariant(name, def, 0, audio.sampleRate());
        const mine = gen.hashBuffer(audio.slot(name).buffers[0]);
        hashes[name] = mine;
        if (!again || gen.hashBuffer(again) !== mine) differ.push(name);
      }
      let previous = null;
      try {
        previous = JSON.parse(sessionStorage.getItem("cmz.check.soundHashes") || "null");
        sessionStorage.setItem("cmz.check.soundHashes", JSON.stringify(hashes));
      } catch { /* no storage: the fresh render alone is compared */ }
      const changed = previous ? Object.keys(hashes).filter((k) => previous[k] && previous[k] !== hashes[k]) : [];
      row("each recipe renders the same samples twice", differ.length === 0, differ.length ? `differ: ${differ.join(", ")}` : Object.entries(hashes).map(([k, h]) => `${k} ${h}`).join(", "));
      row("and the same as the last boot in this tab", changed.length === 0, previous ? (changed.length ? `changed: ${changed.join(", ")}` : "same hashes") : "first run in this tab: hashes kept for the next boot");
    }

    // 3. Walking two seconds on grass: about eight steps, each on a contact frame, the first out of idle; wood on wood.
    {
      const grass = findRun("floor_grass", 8);
      if (!grass) row("open grass near the player", false, "no run of grass found");
      else {
        G.teleport(grass.x, grass.y);
        p.auto = null;
        step(10);
        clear();
        snd.reset();
        step();
        G.walkTo(grass.x + 8, grass.y);
        const contacts = [];
        let prev = { name: p.anim.name, frame: p.anim.frame };
        for (let i = 0; i < 120; i++) {
          G.loop.advance(1 / 60);
          const a = p.anim;
          if ((a.name === "walk" || a.name === "carry_walk") && (a.frame === 0 || a.frame === 2) && (prev.name !== a.name || prev.frame !== a.frame)) contacts.push(G.loop.simTime());
          prev = { name: a.name, frame: a.frame };
          snd.update(1 / 60);
        }
        const st = named(/^step_/).filter((e) => e.at && Math.hypot(e.at[0] - p.gx, e.at[1] - p.gy) < 9);
        const grassSteps = st.filter((e) => e.name === "step_grass");
        const onContact = st.every((e) => contacts.some((c) => near(c, e.sim, 0.001)));
        row("two seconds of walking on grass logs about eight step_grass", grassSteps.length >= 6 && grassSteps.length <= 9, `${grassSteps.length} step_grass of ${st.length} steps; ${contacts.length} contact frames`);
        row("each step on a step where the walk turned to frame 0 or 2", st.length > 0 && onContact, st.length ? `${st.filter((e) => contacts.some((c) => near(c, e.sim, 0.001))).length} of ${st.length} on a contact` : "no steps");
        row("the first on the first contact out of idle", st.length > 0 && contacts.length > 0 && near(st[0].sim, contacts[0], 0.001), st.length ? `first step ${st[0].sim.toFixed(3)}, first contact ${contacts[0] ? contacts[0].toFixed(3) : "-"}` : "no steps");
      }
      const wood = findRun("floor_wood", 3, 60);
      if (!wood) row("a step on wood logs step_wood", false, "no run of wood floor found near the player");
      else {
        G.teleport(wood.x, wood.y);
        p.auto = null;
        step(10);
        clear();
        G.walkTo(wood.x + 3, wood.y);
        step(60);
        const w = named(/^step_/);
        row("a step on wood logs step_wood", w.length > 0 && w.every((e) => e.name === "step_wood"), w.map((e) => e.name).join(", ") || "no steps");
      }
      p.auto = null;
      step(20);
    }

    // 4. The swing: light (fists, the dirk, the sword) or heavy (the halberd), within a step of the cooldown's step; the
    // off hand its own; a click inside the recovery nothing.
    {
      const swingOf = (id) => {
        p.hands.main = id ? G.items.makeEntry(id, 1) : null;
        if (id && G.items.getItem(id).hands === "both") p.hands.off = p.hands.main;
        else p.hands.off = null;
        p.attackCooldown = 0;
        p.offCooldown = 0;
        p.shoveCooldown = 0;
        p.swingLock = 0;
        p.stamina = 100;
        step(2);
        clear();
        const at = G.loop.simTime();
        const r = G.combat.swingFromLeft(p, G.zombies);
        step();
        const s = named(/^swing_/);
        return { swung: r !== null, at, s };
      };
      const res = {};
      for (const id of [null, "knife", "sword", "halberd"]) res[id || "fists"] = swingOf(id);
      const want = { fists: "swing_light", knife: "swing_light", sword: "swing_light", halberd: "swing_heavy" };
      const wrong = Object.entries(res).filter(([k, v]) => !v.swung || v.s.length !== 1 || v.s[0].name !== want[k] || Math.abs(v.s[0].sim - v.at) > 1 / 60 + 1e-6);
      row("a swing logs swing_light (fists, the dirk, the sword) or swing_heavy (the halberd), within a step", wrong.length === 0, Object.entries(res).map(([k, v]) => `${k} ${v.s.map((e) => `${e.name} +${((e.sim - v.at) * 1000).toFixed(0)}ms`).join(" ") || "none"}`).join("; "));
      // A click inside the recovery: nothing.
      p.hands.main = G.items.makeEntry("sword", 1);
      p.hands.off = null;
      p.attackCooldown = 0;
      step(2);
      G.combat.swingFromLeft(p, G.zombies);
      step();
      clear();
      const again = G.combat.swingFromLeft(p, G.zombies);
      step();
      row("a click inside the recovery logs nothing", again === null && named(/^swing_/).length === 0, `refused: ${again === null}; logged ${named(/^swing_/).length}`);
      // The off hand: a sword and a mace, clicked twice past the lockout.
      p.hands.main = G.items.makeEntry("sword", 1);
      p.hands.off = G.items.makeEntry("mace", 1);
      p.attackCooldown = 0;
      p.offCooldown = 0;
      p.swingLock = 0;
      step(2);
      clear();
      G.combat.swingFromLeft(p, G.zombies);
      step(Math.ceil(0.5 * 0.45 * 60) + 1);
      const offSwing = G.combat.swingFromLeft(p, G.zombies);
      step();
      const two = named(/^swing_/);
      row("an off-hand swing logs its own", offSwing !== null && two.length === 2, `${two.length} swings logged (${two.map((e) => e.name).join(", ")})`);
      p.hands.off = null;
      p.attackCooldown = 0;
      p.offCooldown = 0;
      step(40);
    }

    // 5. A hit on one of the dead logs `hit` at its place on the swing's step; with Floating numbers off, still.
    {
      const { createZombie } = await import("/src/entities/zombie.js");
      const open = findRun("floor_grass", 3); // on open grass, so no wall stands between the swing and the dead one
      if (open) {
        G.teleport(open.x, open.y);
        step(5);
      }
      const hitOnce = () => {
        const z = createZombie(p.gx + 1, p.gy, { aggro: false });
        z.state = "idle";
        z.hp = 1000;
        G.zombies.push(z);
        added.push(z);
        p.hands.main = G.items.makeEntry("sword", 1);
        p.attackCooldown = 0;
        p.stamina = 100;
        step(2);
        face(z.gx, z.gy);
        clear();
        const at = G.loop.simTime();
        const r = G.combat.swingFromLeft(p, G.zombies);
        step();
        const h = named(/^hit$/);
        const ok = !!(r && r.includes(z)) && h.length === 1 && h[0].at && Math.hypot(h[0].at[0] - z.gx, h[0].at[1] - z.gy) < 0.6 && Math.abs(h[0].sim - at) <= 1 / 60 + 1e-6;
        const i = G.zombies.indexOf(z);
        if (i >= 0) G.zombies.splice(i, 1);
        return { ok, detail: `hit ${!!(r && r.includes(z))}; logged ${h.length}${h[0] ? ` at ${h[0].at} (the dead one at ${z.gx.toFixed(2)},${z.gy.toFixed(2)}), +${((h[0].sim - at) * 1000).toFixed(0)}ms` : ""}` };
      };
      const a = hitOnce();
      row("a hit on one of the dead logs `hit` at its place on the swing's step", a.ok, a.detail);
      G.settings.set("floaters", false);
      step(30);
      const b = hitOnce();
      row("with Floating numbers off, it still does", b.ok, b.detail);
      G.settings.set("floaters", saved.floaters);
    }

    // 6. A villager walking 8 tiles away logs steps at a lower gain than the player's own; past the radius, none.
    {
      const v = (G.villagers || [])[0];
      if (!v) row("a villager's steps by distance", false, "no villager in this world");
      else {
        const v0 = { gx: v.gx, gy: v.gy };
        const radius = data.slots.step_grass.radius;
        const walkAt = (dist, n = 40) => {
          clear();
          let frame = 1;
          for (let i = 0; i < n; i++) {
            G.loop.advance(1 / 60);
            v.gx = p.gx + dist;
            v.gy = p.gy;
            if (i % 8 === 0) frame = (frame + 1) % 4;
            v.anim.name = "walk";
            v.anim.frame = frame;
            snd.update(1 / 60);
          }
          return snd.log.filter((e) => /^step_/.test(e.name) && e.at && Math.hypot(e.at[0] - v.gx, e.at[1] - v.gy) < 0.01);
        };
        // The player's own step for comparison: the gain at no distance.
        const mineGain = data.slots.step_grass.volume * 0.75;
        const at8 = walkAt(8);
        const at15 = walkAt(radius + 1);
        v.gx = v0.gx;
        v.gy = v0.gy;
        row("a villager walking 8 tiles away logs steps at a lower gain than the player's own", at8.length > 0 && at8.every((e) => e.gain < mineGain), at8.length ? `${at8.length} steps at gain ${at8[0].gain} against ${mineGain.toFixed(3)} at the player` : "no steps logged");
        row(`one ${radius + 1} tiles away (past the radius) logs nothing`, at15.length === 0, `${at15.length} logged`);
      }
    }

    // 7. Sound off: walking and swinging log nothing; Volume Off the same.
    {
      const quiet = (key, value) => {
        G.settings.set(key, value);
        p.hands.main = G.items.makeEntry("sword", 1);
        p.attackCooldown = 0;
        step(2);
        clear();
        G.combat.swingFromLeft(p, G.zombies);
        const grass = findRun("floor_grass", 4) || { x: Math.round(p.gx), y: Math.round(p.gy) };
        G.walkTo(grass.x + 3, grass.y);
        step(60);
        p.auto = null;
        const n = snd.log.length;
        G.settings.set(key, key === "soundOn" ? true : 0.75);
        step(20);
        return n;
      };
      const off = quiet("soundOn", false);
      const zero = quiet("soundVolume", 0);
      row("with Sound off, walking and swinging log nothing", off === 0, `${off} logged`);
      row("with Volume at Off, the same", zero === 0, `${zero} logged`);
    }

    // 8. A second of wall time awaited between two steps loses no sound (the gap is the world's time).
    {
      p.hands.main = G.items.makeEntry("sword", 1);
      p.attackCooldown = 0;
      step(2);
      clear();
      G.combat.swingFromLeft(p, G.zombies);
      G.loop.advance(1 / 60);
      await new Promise((r) => setTimeout(r, 1000));
      snd.update(1 / 60);
      row("an await of a second of wall time between two steps loses no sound", named(/^swing_/).length === 1, `${named(/^swing_/).length} swing logged`);
    }
  } finally {
    for (const z of added) {
      const i = G.zombies.indexOf(z);
      if (i >= 0) G.zombies.splice(i, 1);
      const j = (G.corpses || []).indexOf(z);
      if (j >= 0) G.corpses.splice(j, 1);
    }
    p.auto = null;
    p.hands.main = saved.main;
    p.hands.off = saved.off;
    G.teleport(saved.gx, saved.gy);
    p.aim = saved.aim;
    p.stamina = saved.stamina;
    p.attackCooldown = 0;
    p.offCooldown = 0;
    p.shoveCooldown = 0;
    G.settings.set("soundOn", saved.soundOn);
    G.settings.set("soundVolume", saved.soundVolume);
    G.settings.set("floaters", saved.floaters);
    G.rules.set({ zombieAggro: saved.aggro });
    snd.reset();
    G.loop.setPaused(wasPaused);
  }
  console.table(rows);
  return { pass: rows.every((r) => r.result === "pass"), rows };
}
