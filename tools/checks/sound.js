// The sounds, steps 1 and 2 (docs/40, section 8; #379, #386): the slots and their placeholders, the footsteps (the grass
// step gone: grass shuffles), the swing, the hit, distance, the master switch and the volume, a gap of wall time between
// steps; then the shove, the bow's draw, release, and landing, a dry release, a spell's cast, a thrown spear (no bow
// sound), the dead's death and fall, their moan and a strike on a wall (#424), doors and shutters (a change, a break, an opening walked into range), and F8. A paused pane draws nothing, so the
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
        const st = named(/^(step_|shuffle$)/).filter((e) => e.at && Math.hypot(e.at[0] - p.gx, e.at[1] - p.gy) < 9);
        const grassSteps = st.filter((e) => e.name === "shuffle"); // the grass step is the dead's shuffle since #386 (Michael)
        const onContact = st.every((e) => contacts.some((c) => near(c, e.sim, 0.001)));
        row("two seconds of walking on grass logs about eight steps, each the dead's shuffle (#386: no grass step)", grassSteps.length >= 6 && grassSteps.length <= 9 && st.length === grassSteps.length && !audio.slot("step_grass"), `${grassSteps.length} shuffle of ${st.length} steps; ${contacts.length} contact frames; a step_grass slot: ${!!audio.slot("step_grass")}`);
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
        const w = named(/^(step_|shuffle$)/);
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
      // #423: the off swing logs the off weapon's own slot within a step of its cooldown's step, with the off arm's animation.
      // The mace is given `swing_heavy` for the row (put back in the finally) while the sword whooshes `swing_light`, so the
      // row fails if the off hand's rise were read as the main weapon's. Then the same two clicks through the controller's
      // predict path, run here on the host's own player (the two-tab test covers a real guest), log a swing each.
      const lockSteps = Math.ceil(0.5 * G.combat.DUAL.lockout * 60) + 1;
      const ready = () => { p.attackCooldown = 0; p.offCooldown = 0; p.swingLock = 0; p.shoveCooldown = 0; p.exposedFor = 0; p.stamina = 100; };
      const mace = G.items.getItem("mace").weapon;
      const hadSound = Object.prototype.hasOwnProperty.call(mace, "sound");
      const maceSound = mace.sound;
      try {
        mace.sound = "swing_heavy";
        ready();
        step(40);
        clear();
        G.combat.swingFromLeft(p, G.zombies);
        step(lockSteps);
        const offAt = G.loop.simTime();
        const offAgain = G.combat.swingFromLeft(p, G.zombies);
        const offAnim = p.anim.name;
        const offHand = p.lastHand;
        step();
        const both = named(/^swing_/);
        const offLog = both.filter((e) => Math.abs(e.sim - offAt) <= 1 / 60 + 1e-6);
        row("the off hand's swing logs its own weapon's slot within a step, with the off arm's animation (the mace swing_heavy, the sword swing_light)", offAgain !== null && offHand === "off" && offAnim === "attack_off" && both.length === 2 && both[0].name === "swing_light" && both[1].name === "swing_heavy" && offLog.length === 1 && offLog[0].name === "swing_heavy", `${offAgain !== null ? `the ${offHand} hand, ${offAnim}` : "refused"}; ${both.map((e) => `${e.name} ${e.sim >= offAt - 1e-9 ? "+" : ""}${((e.sim - offAt) * 1000).toFixed(0)}ms`).join(", ") || "none"}`);
      } finally {
        if (hadSound) mace.sound = maceSound;
        else delete mace.sound;
      }
      const maceSlot = typeof mace.sound === "string" ? mace.sound : mace.swing >= data.swing.heavyAt ? "swing_heavy" : "swing_light";
      const { controlPlayer } = await import("/src/player-controller.js");
      const click = { ...G.game.idleSnapshot(), clicked: true };
      ready();
      step(40);
      clear();
      controlPlayer(p, G.zombies, 1 / 60, click, true);
      const predMain = p.lastHand;
      step(lockSteps);
      controlPlayer(p, G.zombies, 1 / 60, click, true);
      const predOff = p.lastHand;
      const predAnim = p.anim.name;
      step();
      const pred = named(/^swing_/);
      row("the controller's predict path (a guest's way), run on the host's own player: main then off log a swing each, the off with the off arm's animation", predMain === "main" && predOff === "off" && predAnim === "attack_off" && pred.length === 2 && pred[1].name === maceSlot, `hands ${predMain}, ${predOff}; ${predAnim}; ${pred.length} swings logged (${pred.map((e) => e.name).join(", ")})`);
      p.hands.off = null;
      ready();
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
        const radius = data.slots.shuffle.radius;
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
          return snd.log.filter((e) => /^(step_|shuffle$)/.test(e.name) && e.at && Math.hypot(e.at[0] - v.gx, e.at[1] - v.gy) < 0.01);
        };
        // The player's own step for comparison: the gain at no distance.
        const mineGain = data.slots.shuffle.volume * 0.75;
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

    // ---- step 2 (#386), on open grass with no one else about.
    {
      const open = findRun("floor_grass", 8);
      if (open) G.teleport(open.x, open.y);
      p.hands.main = null;
      p.hands.off = null;
      p.shoveCooldown = 0;
      step(10);
      // The shove.
      clear();
      const at = G.loop.simTime();
      G.combat.tryShove(p, G.zombies);
      step();
      const sh = named(/^shove$/);
      row("a shove logs `shove` within a step", sh.length === 1 && Math.abs(sh[0].sim - at) <= 1 / 60 + 1e-6, `${sh.length} logged${sh[0] ? `, +${((sh[0].sim - at) * 1000).toFixed(0)}ms` : ""}`);
      step(40);

      // The bow: the draw a loop, the release on the step `recover` is set, the arrow's landing where it lies.
      const A = G.archery;
      p.hands.main = G.items.makeEntry("bow", 1);
      p.hands.off = p.hands.main;
      const bag = G.inventory.bagOf(p);
      const hadArrows = G.inventory.countItem(bag, "arrow");
      G.inventory.addItem(bag, "arrow", 10);
      const target = [Math.round(p.gx) + 6, Math.round(p.gy)];
      A.setAim(target[0], target[1]);
      step(2);
      clear();
      A.press();
      step(50);
      const drawLog = named(/^bow_draw$/);
      const relAt = G.loop.simTime();
      const shot = A.release();
      step();
      const rel = named(/^bow_release$/);
      let landed = [];
      for (let i = 0; i < 120 && !landed.length; i++) { step(); landed = named(/^arrow_land$/); }
      row("a bow drawn logs `bow_draw` as a loop, once", drawLog.length === 1 && drawLog[0].loop === true, `${drawLog.length} logged${drawLog[0] ? `, loop ${drawLog[0].loop}` : ""}`);
      row("the release logs `bow_release` on the step `recover` is set", !!shot && rel.length === 1 && Math.abs(rel[0].sim - relAt) <= 1 / 60 + 1e-6, `shot ${!!shot}; ${rel.length} logged`);
      row("the arrow's landing logs `arrow_land` where it lies", landed.length === 1 && Math.hypot(landed[0].at[0] - target[0], landed[0].at[1] - target[1]) < 2.5, landed[0] ? `at ${landed[0].at} against the aim ${target}` : "none");
      // A dry release: no twang.
      step(30);
      clear();
      A.press();
      step(2);
      A.release();
      step(30);
      row("a dry release logs no twang", named(/^bow_release$/).length === 0 && named(/^arrow_land$/).length === 0, `${named(/^bow_release$/).length} twang, ${named(/^arrow_land$/).length} landing`);
      const extra = G.inventory.countItem(bag, "arrow") - hadArrows;
      if (extra > 0) G.inventory.removeItem(bag, "arrow", extra);
      // the arrow that flew lies on the ground; it is left there, as a test world is expendable (?nosave)

      // A spell's cast: the staff and the Book of Fire.
      p.hands.main = G.items.makeEntry("staff_of_fire", 1);
      p.hands.off = G.items.makeEntry("book_of_fire", 1);
      A.setAim(target[0], target[1]);
      step(30);
      clear();
      A.press();
      step(50);
      const castAt = G.loop.simTime();
      const cast = A.release();
      step(90);
      const c = named(/^cast$/);
      const bowish = named(/^(bow_draw|bow_release|arrow_land)$/).length;
      row("a spell's cast logs `cast` on its loose, and no bow sound", !!cast && c.length === 1 && Math.abs(c[0].sim - castAt) <= 1 / 60 + 1e-6 && bowish === 0, `cast ${!!cast}; ${c.length} cast; bow sounds ${bowish}`);
      // A thrown spear: no bow sound, no arrow landing.
      p.hands.main = G.items.makeEntry("spear", 1);
      p.hands.off = null;
      step(30);
      clear();
      A.press();
      step(40);
      A.release();
      step(90);
      row("a thrown spear logs no bow_draw, bow_release, or arrow_land", named(/^(bow_draw|bow_release|arrow_land)$/).length === 0, snd.log.map((e) => e.name).join(", ") || "nothing");
      A.setAim(null);
      p.hands.main = null;
      p.hands.off = null;

      // The dead: a fall when one is knocked down, a death when one dies.
      const { createZombie, damageZombie } = await import("/src/entities/zombie.js");
      const z = createZombie(p.gx + 2, p.gy, { aggro: false });
      z.state = "idle";
      G.zombies.push(z);
      added.push(z);
      step(2);
      clear();
      damageZombie(z, 0, { knockdown: true });
      step();
      const fall = named(/^fall$/);
      step(60);
      clear();
      damageZombie(z, 100000);
      step(5);
      const death = named(/^death$/);
      row("one of the dead knocked down logs `fall`", fall.length === 1, `${fall.length} logged`);
      row("one of the dead killed logs `death`, and no `fall`", death.length === 1 && named(/^fall$/).length === 0, `${death.length} death, ${named(/^fall$/).length} fall`);

      // The moan (#424): one of the dead turning to the chase from a calm state moans, at it; again soon, it does not; a crowd turning at
      // once gives one, not a drone (the gap). The ear alone runs here (snd.update with no world step), so the state set is the state heard.
      {
        const ear = () => snd.update(0);
        const mz = [0, 1, 2].map((i) => { const q = createZombie(p.gx + 3 + i, p.gy + 1, { aggro: false }); q.state = "idle"; G.zombies.push(q); added.push(q); return q; });
        step(2);
        clear();
        mz[0].state = "chase";
        ear();
        const first = named(/^moan$/);
        mz[0].state = "idle";
        ear();
        mz[0].state = "chase";
        ear();
        const again = named(/^moan$/).length;
        clear();
        mz[0].state = "idle"; // never stepped while chasing nothing: the world's step wants a target for a chase
        G.loop.advance(data.moan.gap + 0.05); // past the gap, not past the first one's own `again`
        snd.update(0);
        clear();
        mz[1].state = "chase";
        mz[2].state = "chase";
        ear();
        const crowd = named(/^moan$/).length;
        mz[1].state = "idle";
        mz[2].state = "idle";
        row("one of the dead turning to the chase logs `moan` at it; turning again soon logs none; two at once log one", first.length === 1 && Math.hypot(first[0].at[0] - mz[0].gx, first[0].at[1] - mz[0].gy) < 0.01 && again === 1 && crowd === 1, `first ${first.length}, again ${again}, two at once ${crowd}`);
        clear();
        mz[0].state = "attack";
        ear();
        mz[0].state = "chase";
        ear();
        mz[0].state = "idle";
        row("from an attack back to the chase it does not moan (only from a calm state)", named(/^moan$/).length === 0, `${named(/^moan$/).length} logged`);
        for (const q of mz) q.state = "idle";
      }

      // The strike (#424): the jolt every client draws when the dead hit a door, shutters, boards, or a fence logs `strike` at the edge.
      {
        clear();
        const tx = Math.round(p.gx) + 1;
        const ty = Math.round(p.gy);
        G.events.emit("wallStruck", { tx, ty, edge: "n" });
        step();
        const st = named(/^strike$/);
        row("a wall the dead strike logs `strike` at the edge, with the jolt (the host's event; a guest's fx calls the same)", st.length === 1 && Math.hypot(st[0].at[0] - tx, st[0].at[1] - (ty - 0.5)) < 0.01, `${st.length} logged`);
      }

      // Doors and shutters: a change logs the creak at the opening; a break nothing; an opening walked into range nothing.
      G.teleport(saved.gx, saved.gy);
      step(10);
      const nearest = (kind, r = 12) => {
        const cx = Math.round(p.gx), cy = Math.round(p.gy);
        let best = null;
        for (let y = cy - r; y <= cy + r; y++) for (let x = cx - r; x <= cx + r; x++) {
          const t = G.map.tileAt(x, y);
          for (const edge of ["n", "w"]) {
            const w = t[edge];
            if (w && w.kind === kind && !w.broken && !(w.boards && ((w.boards.near || []).length || (w.boards.far || []).length))) {
              const d = Math.hypot(x - p.gx, y - p.gy);
              if (!best || d < best.d) best = { w, x, y, edge, d };
            }
          }
        }
        return best;
      };
      const flip = (o) => {
        if (o.w.kind === "door") o.w.open = !o.w.open;
        else o.w.shutter = o.w.shutter === "open" ? "closed" : "open";
        G.map.touch(o.x, o.y);
      };
      const door = nearest("door");
      const win = nearest("window");
      if (!door) row("a door opened and shut logs the creak twice, at the door", false, "no door near the spawn");
      else {
        const was = door.w.open;
        clear();
        flip(door);
        step(6);
        flip(door);
        step(6);
        const creaks = named(/^door$/);
        row("a door opened and shut logs the creak twice, at the door", creaks.length === 2 && creaks.every((e) => Math.hypot(e.at[0] - door.x, e.at[1] - door.y) <= 1), `${creaks.length} logged`);
        door.w.open = was;
        step(6);
        // Changed out of range, then walked back to: learned silently.
        const away = { x: door.x + 2 * data.openings.radius + 2, y: door.y }; // well past the ear's reach (a teleport needs no path)
        {
          G.teleport(away.x, away.y);
          step(10);
          flip(door);
          step(6);
          clear();
          G.teleport(saved.gx, saved.gy);
          step(12);
          row("an opening walked into range logs nothing", named(/^door$/).length === 0, `${named(/^door$/).length} logged`);
          flip(door);
          step(6);
        }
        // A break logs no creak.
        const before = { hp: door.w.hp, broken: door.w.broken, open: door.w.open };
        step(6);
        clear();
        for (let i = 0; i < 200 && !door.w.broken; i++) G.map.damageOpening(door.w, 1, 50);
        G.map.touch(door.x, door.y);
        step(6);
        row("the dead breaking a door log no creak", !!door.w.broken && named(/^door$/).length === 0, `broken ${door.w.broken}; ${named(/^door$/).length} logged`);
        Object.assign(door.w, before);
        G.map.touch(door.x, door.y);
        step(6);
      }
      if (!win) row("shutters opened and shut log the creak twice", false, "no window near the spawn");
      else {
        const was = win.w.shutter;
        clear();
        flip(win);
        step(6);
        flip(win);
        step(6);
        row("shutters opened and shut log the creak twice", named(/^door$/).length === 2, `${named(/^door$/).length} logged`);
        win.w.shutter = was;
        G.map.touch(win.x, win.y);
        step(6);
      }

      // The openings scan's cost (item 8): a silent scan where the player stands, over the tiles within its radius.
      G.teleport(saved.gx, saved.gy);
      step(5);
      const cost = snd.scanCost ? snd.scanCost(100) : null;
      row("the openings scan's cost is reported", !!cost && cost.ms >= 0, cost ? `${cost.ms.toFixed(3)} ms a scan over ${cost.openings} openings, one every ${cost.every} s of sim time` : "no __game.sound.scanCost");

      // F8: the same switch as the Sound tab, with a line.
      const was8 = G.settings.get("soundOn");
      const press8 = () => document.dispatchEvent(new KeyboardEvent("keydown", { code: "F8", key: "F8", bubbles: true }));
      press8();
      const off = G.settings.get("soundOn");
      const lineOff = /Sound off\./.test(document.body.innerText);
      press8();
      const on2 = G.settings.get("soundOn");
      const lineOn = /Sound on\./.test(document.body.innerText);
      row("F8 turns Sound off and on, with its line", was8 !== false && off === false && on2 === true && lineOff && lineOn, `off: ${off}, "Sound off." shown ${lineOff}; on: ${on2}, "Sound on." shown ${lineOn}`);
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
