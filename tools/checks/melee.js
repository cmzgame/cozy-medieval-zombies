// The melee instrument (docs/41, section 5; #361): bites a fight, by script, so every step of the melee feel pass
// is a number before and after. Five of the dead in a ring of four tiles round the player, aggro and chasing, at
// noon so they see; a scripted player with the Developer sword who aims at the nearest living zombie each step and
// swings whenever a swing is possible (the "swing" policy); again shoving whenever two or more are in the shove's
// reach (the "shove" policy, the mindless one: it spams the shove, which the recovery punishes); and again shoving
// only when two or more fresh threats are in reach, none of them staggered or pushed or down, and never twice without
// a swing between, swinging otherwise (the "space" policy: make room, then strike). A trial runs thirty seconds of simulation at 1/60, or until the dead
// are all dead. The player cannot die in a trial: health is set back to full every step and the damage taken is counted
// instead, so a death screen never interrupts the instrument. The world's own dead and villagers are set aside for
// the trials and put back after (on the proving ground sixty of the dead would join the fight, and a villager's walk
// spends the generator), a fresh sword is drawn each trial (durability is by kills, and ten fights wear one out), and
// the generator is seeded per trial, so a trial repeats as far as the world round the clearing is the same.
// From the console, on a ?nosave tab:
//   await __game.check("melee")                       ten trials of each of the three policies, the means printed as rows
//   await __game.check("melee", { trials: 5, policy: "space", seconds: 20, count: 5, radius: 4, seed: 1 })
// It pauses the loop, works on open ground with the dead it brings and takes away, and puts the player's hands,
// place, aim, health, stamina, wounds, the hour, the rules, and the generator back (docs/testing.md).
// The reference point: on 2026-10-12 a sword spammed at five charging dead landed 7.8 bites a fight (docs/02).

export async function run(game, opts = {}) {
  const G = game;
  const trials = opts.trials ?? 10;
  const seconds = opts.seconds ?? 30;
  const count = opts.count ?? 5;
  const radius = opts.radius ?? 4;
  const seed0 = opts.seed ?? 1;
  const policies = opts.policy ? [opts.policy] : ["swing", "shove", "space"];
  const rows = [];
  const row = (check, ok, detail) => rows.push({ check, result: ok ? "pass" : "FAIL", detail });
  const p = G.player;
  const wasPaused = G.loop.isPaused();
  const saved = {
    main: p.hands.main, off: p.hands.off, gx: p.gx, gy: p.gy, aim: { ...p.aim }, hp: p.hp, stamina: p.stamina,
    bleed: p.bleed, infection: p.infection, winded: p.winded,
    aggro: G.rules.rules.zombieAggro, multi: G.rules.rules.multiHit, elapsed: G.clock.getElapsed(), rng: G.rng.getState(),
  };
  G.loop.setPaused(true);
  const { createZombie } = await import("/src/entities/zombie.js");
  const step = () => G.loop.advance(1 / 60);
  const added = [];
  const worldDead = []; // the world's own dead and villagers, set aside for the trials (spliced in place: the game keeps its references)
  const worldFolk = [];
  const alive = () => added.filter((z) => !z.dead);
  const dist = (z) => Math.hypot(z.gx - p.gx, z.gy - p.gy);
  const nearest = () => alive().sort((a, b) => dist(a) - dist(b))[0] || null;
  const face = (z) => {
    const s = G.iso.toScreen(z.gx, z.gy);
    const o = G.iso.toScreen(p.gx, p.gy);
    const n = G.iso.normalize(s.x - o.x, s.y - o.y - 0.001);
    p.aim.sx = n.x;
    p.aim.sy = n.y;
  };
  const clear = () => {
    for (const z of added) {
      const i = G.zombies.indexOf(z);
      if (i >= 0) G.zombies.splice(i, 1);
      const j = (G.corpses || []).indexOf(z);
      if (j >= 0) G.corpses.splice(j, 1);
    }
    added.length = 0;
  };
  // What a trial counts: a bite is the `bitten` event (after the guard and the exposure, so what landed).
  const tally = { bites: 0, damage: 0, first: null, t: 0 };
  const onBitten = ({ player: who, taken }) => {
    if (who !== p) return;
    tally.bites++;
    tally.damage += taken;
    if (tally.first === null) tally.first = tally.t;
  };
  const mean = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
  const spread = (xs) => (xs.length ? `${Math.min(...xs)} to ${Math.max(...xs)}` : "-");
  const r1 = (n) => Math.round(n * 10) / 10;
  const results = {};
  try {
    G.rules.set({ zombieAggro: true });
    G.rules.set({ multiHit: false });
    worldDead.push(...G.zombies.splice(0, G.zombies.length));
    if (G.villagers) worldFolk.push(...G.villagers.splice(0, G.villagers.length));
    G.clock.setHour(12); // noon: the dead see the whole of their range (canSee scales with the light on the player)
    // Open ground: a circle wide enough for the ring and the fight, outdoors, at most a tenth of it blocked (the
    // proving ground is small and has its well and its chest; the dead walk round a prop or two).
    const R = radius + 2;
    const blocked = (x, y) => {
      let bad = 0; let all = 0;
      for (let dx = -R; dx <= R; dx++) for (let dy = -R; dy <= R; dy++) {
        if (dx * dx + dy * dy > R * R) continue;
        all++;
        const t = G.map.peekTile(x + dx, y + dy);
        if (!t || G.map.roomAt(x + dx, y + dy) !== 0 || t.prop || !G.map.isWalkableTile(x + dx, y + dy)) bad++;
      }
      return bad > all / 10;
    };
    const open = G.map.nearestWalkable(Math.round(p.gx), Math.round(p.gy), blocked, 60);
    if (!open) throw new Error("no open ground wide enough near the player");
    G.teleport(open[0], open[1]);
    p.hands.off = null;
    p.bleed = null;
    p.infection = null;
    G.events.on("bitten", onBitten);
    const shoveReach = () => G.combat.SHOVE.range;

    for (const policy of policies) {
      const per = { bites: [], first: [], kills: [], swings: [], hits: [], shoves: [], damage: [], seconds: [] };
      for (let trial = 0; trial < trials; trial++) {
        clear();
        G.rng.seed(seed0 + trial);
        G.teleport(open[0], open[1]);
        p.hands.main = G.items.makeEntry("sword", 1); // fresh each trial: wear is by kills, and a worn-out sword leaves the hand mid-run
        p.hp = p.maxHp;
        p.stamina = p.maxStamina;
        p.winded = false;
        p.bleed = null;
        p.infection = null;
        p.attackCooldown = 0;
        p.offCooldown = 0;
        p.shoveCooldown = 0;
        for (let i = 0; i < count; i++) {
          const th = (i / count) * Math.PI * 2;
          let zx = p.gx + Math.cos(th) * radius;
          let zy = p.gy + Math.sin(th) * radius;
          if (!G.map.isWalkableTile(Math.round(zx), Math.round(zy))) {
            const w = G.map.nearestWalkable(Math.round(zx), Math.round(zy), (x, y) => !!G.map.peekTile(x, y)?.prop, 4);
            if (w) [zx, zy] = w;
          }
          const z = createZombie(zx, zy, { aggro: true });
          z.lastSeen = [p.gx, p.gy];
          z.sincePlayer = 0;
          G.zombies.push(z);
          added.push(z);
        }
        tally.bites = 0; tally.damage = 0; tally.first = null; tally.t = 0;
        let swings = 0; let hits = 0; let shoves = 0; let swungSinceShove = true;
        const steps = Math.round(seconds * 60);
        let n = 0;
        for (; n < steps && alive().length; n++) {
          const z = nearest();
          face(z);
          const near = alive().filter((o) => dist(o) <= shoveReach() + 0.3);
          const fresh = near.filter((o) => !(o.stagger > 0) && !o.knock && o.state !== "down").length;
          const wants = policy === "shove" ? near.length >= 2 : policy === "space" ? fresh >= 2 && swungSinceShove : false;
          if (wants && (p.shoveCooldown || 0) <= 0) {
            const r = G.combat.tryShove(p, G.zombies);
            if (r) { shoves++; swungSinceShove = false; }
          } else {
            const r = G.combat.swingFromLeft(p, G.zombies);
            if (r) { swings++; swungSinceShove = true; if (r.length) hits++; }
          }
          step();
          tally.t += 1 / 60;
          p.hp = p.maxHp; // the instrument's player cannot die; the damage is counted instead
        }
        per.bites.push(tally.bites);
        per.first.push(tally.first === null ? seconds : r1(tally.first));
        per.kills.push(count - alive().length);
        per.swings.push(swings);
        per.hits.push(hits);
        per.shoves.push(shoves);
        per.damage.push(tally.damage);
        per.seconds.push(r1(n / 60));
      }
      const m = {
        bites: r1(mean(per.bites)), first: r1(mean(per.first)), kills: r1(mean(per.kills)), swings: r1(mean(per.swings)), hits: r1(mean(per.hits)),
        shoves: r1(mean(per.shoves)), damage: r1(mean(per.damage)), seconds: r1(mean(per.seconds)), trials, per,
      };
      results[policy] = m;
      row(`${policy}: bites a fight (mean of ${trials})`, true, `${m.bites} (${spread(per.bites)}); damage ${m.damage}`);
      row(`${policy}: seconds to the first bite`, true, `${m.first} (${spread(per.first)}); fights ran ${m.seconds} s`);
      row(`${policy}: kills of ${count}, swings, hits, shoves`, true, `${m.kills} killed; ${m.swings} swings, ${m.hits} landed; ${m.shoves} shoves`);
    }
    const ran = Object.values(results).every((m) => m.swings + m.shoves > 0 && m.seconds > 0);
    row("the instrument ran: swings happened in every policy", ran, Object.keys(results).join(", "));
    clear();
  } finally {
    G.events.off("bitten", onBitten);
    clear();
    G.zombies.push(...worldDead);
    if (G.villagers) G.villagers.push(...worldFolk);
    p.hands.main = saved.main;
    p.hands.off = saved.off;
    G.teleport(saved.gx, saved.gy);
    p.aim = saved.aim;
    p.hp = saved.hp;
    p.stamina = saved.stamina;
    p.winded = saved.winded;
    p.bleed = saved.bleed;
    p.infection = saved.infection;
    p.attackCooldown = 0;
    p.offCooldown = 0;
    p.shoveCooldown = 0;
    G.clock.setElapsed(saved.elapsed);
    G.rng.setState(saved.rng);
    G.rules.set({ zombieAggro: saved.aggro });
    G.rules.set({ multiHit: saved.multi });
    G.loop.setPaused(wasPaused);
  }
  console.table(rows);
  return { pass: rows.every((r) => r.result === "pass"), rows, results };
}
